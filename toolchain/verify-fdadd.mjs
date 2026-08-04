import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.mjs';

const execFileAsync = promisify(execFile);
const BASE = fileURLToPath(new URL('../../WebNP2/public/freedos/fd98_2hd.xdf', import.meta.url));
const HELLO_ASM = fileURLToPath(new URL('../samples/hello.asm', import.meta.url));
const TEST_ASM = fileURLToPath(new URL('../samples/test_nasm.asm', import.meta.url));
const BUILDER = fileURLToPath(new URL('./build-boot-fd.mjs', import.meta.url));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// This reader intentionally shares no BPB/FAT/directory code with fdadd.mjs.
function readFat12Tree(image) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const sectorSize = view.getUint16(11, true);
  const clusterSectors = image[13];
  const reserved = view.getUint16(14, true);
  const fatCopies = image[16];
  const rootEntryCount = view.getUint16(17, true);
  const fatSectors = view.getUint16(22, true);
  const totalSectors = view.getUint16(19, true) || view.getUint32(32, true);
  const rootSectorCount = Math.ceil(rootEntryCount * 32 / sectorSize);
  const fatByteOffset = reserved * sectorSize;
  const rootByteOffset = (reserved + fatCopies * fatSectors) * sectorSize;
  const dataByteOffset = rootByteOffset + rootSectorCount * sectorSize;
  const bytesPerCluster = sectorSize * clusterSectors;
  const clusterCount = Math.floor((totalSectors - reserved - fatCopies * fatSectors - rootSectorCount) / clusterSectors);
  const largestCluster = clusterCount + 1;

  function fatValue(cluster, copy = 0) {
    const offset = fatByteOffset + copy * fatSectors * sectorSize + Math.floor(cluster * 3 / 2);
    const packed = image[offset] | (image[offset + 1] << 8);
    return cluster & 1 ? packed >>> 4 : packed & 0x0fff;
  }

  function clusterChain(first, label) {
    if (first === 0) return [];
    const result = [];
    const seen = new Set();
    let cluster = first;
    while (cluster < 0xff8) {
      assert(cluster >= 2 && cluster <= largestCluster, `${label}: invalid cluster ${cluster}`);
      assert(!seen.has(cluster), `${label}: FAT loop at cluster ${cluster}`);
      seen.add(cluster);
      result.push(cluster);
      cluster = fatValue(cluster);
    }
    return result;
  }

  function chainBytes(first, size, label) {
    const result = new Uint8Array(size);
    let written = 0;
    for (const cluster of clusterChain(first, label)) {
      if (written >= size) break;
      const offset = dataByteOffset + (cluster - 2) * bytesPerCluster;
      const count = Math.min(bytesPerCluster, size - written);
      result.set(image.subarray(offset, offset + count), written);
      written += count;
    }
    assert.equal(written, size, `${label}: cluster chain is shorter than file size`);
    return result;
  }

  function directoryBytes(first, label) {
    const chain = clusterChain(first, label);
    const result = new Uint8Array(chain.length * bytesPerCluster);
    chain.forEach((cluster, index) => {
      const offset = dataByteOffset + (cluster - 2) * bytesPerCluster;
      result.set(image.subarray(offset, offset + bytesPerCluster), index * bytesPerCluster);
    });
    return result;
  }

  function text(bytes, offset, length) {
    return String.fromCharCode(...bytes.subarray(offset, offset + length)).trimEnd();
  }

  const files = new Map();
  const visitedDirectories = new Set();

  function scanDirectory(bytes, prefix) {
    for (let offset = 0; offset + 32 <= bytes.length; offset += 32) {
      if (bytes[offset] === 0x00) break;
      if (bytes[offset] === 0xe5) continue;
      const attributes = bytes[offset + 11];
      if (attributes === 0x0f || (attributes & 0x08)) continue;
      const name = text(bytes, offset, 8);
      const ext = text(bytes, offset + 8, 3);
      const shortName = ext ? `${name}.${ext}` : name;
      if (shortName === '.' || shortName === '..') continue;
      const path = prefix ? `${prefix}/${shortName}` : shortName;
      const firstCluster = bytes[offset + 26] | (bytes[offset + 27] << 8);
      const size = (bytes[offset + 28] | (bytes[offset + 29] << 8) |
        (bytes[offset + 30] << 16) | (bytes[offset + 31] << 24)) >>> 0;
      if (attributes & 0x10) {
        assert(!visitedDirectories.has(firstCluster), `${path}: directory cycle`);
        visitedDirectories.add(firstCluster);
        scanDirectory(directoryBytes(firstCluster, path), path);
      } else {
        assert(!files.has(path), `duplicate file path: ${path}`);
        files.set(path, chainBytes(firstCluster, size, path));
      }
    }
  }

  scanDirectory(image.subarray(rootByteOffset, rootByteOffset + rootEntryCount * 32), '');
  return { files, fatValue, fatCopies, largestCluster };
}

async function assembleFile(path) {
  const result = await assemble(await readFile(path));
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
  return result.output;
}

const temporary = await mkdtemp(join(tmpdir(), 'verify-fdadd-'));
try {
  const outputPath = join(temporary, 'boot.xdf');
  const baseBefore = await readFile(BASE);
  const baseHashBefore = sha256(baseBefore);
  const original = readFat12Tree(baseBefore);

  await execFileAsync(process.execPath, [BUILDER, HELLO_ASM, TEST_ASM, '-o', outputPath, '--base', BASE]);
  const addedImage = await readFile(outputPath);
  console.log('PASS 1: base image copied and HELLO.COM / TEST.COM added');

  const [hello, test] = await Promise.all([assembleFile(HELLO_ASM), assembleFile(TEST_ASM)]);
  const added = readFat12Tree(addedImage);
  assert.deepEqual(added.files.get('HELLO.COM'), hello);
  assert.deepEqual(added.files.get('TEST.COM'), test);
  console.log('PASS 2: independently read added files match assembler output');

  for (const [path, data] of original.files) {
    assert(added.files.has(path), `original file is missing: ${path}`);
    assert.deepEqual(added.files.get(path), data, `original file changed: ${path}`);
  }
  for (let cluster = 0; cluster <= added.largestCluster; cluster++) {
    for (let copy = 1; copy < added.fatCopies; copy++) {
      assert.equal(added.fatValue(cluster, copy), added.fatValue(cluster, 0), `FAT copies differ at cluster ${cluster}`);
    }
  }
  console.log(`PASS 3: all ${original.files.size} original files remain byte-identical; FAT copies match`);

  const baseAfter = await readFile(BASE);
  assert.equal(sha256(baseAfter), baseHashBefore);
  console.log(`PASS 4: base image SHA-256 unchanged (${baseHashBefore})`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
