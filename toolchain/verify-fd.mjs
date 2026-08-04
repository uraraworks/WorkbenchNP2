import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assemble } from './assemble.mjs';
import { makeFd } from './makefd.mjs';

function readFat12Files(image) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const bytesPerSector = view.getUint16(11, true);
  const sectorsPerCluster = image[13];
  const reservedSectors = view.getUint16(14, true);
  const fatCount = image[16];
  const rootEntries = view.getUint16(17, true);
  const sectorsPerFat = view.getUint16(22, true);
  const rootSectors = Math.ceil(rootEntries * 32 / bytesPerSector);
  const fatOffset = reservedSectors * bytesPerSector;
  const rootOffset = (reservedSectors + fatCount * sectorsPerFat) * bytesPerSector;
  const dataOffset = rootOffset + rootSectors * bytesPerSector;
  const clusterBytes = bytesPerSector * sectorsPerCluster;

  function fatEntry(cluster) {
    const offset = fatOffset + Math.floor(cluster * 3 / 2);
    const pair = image[offset] | (image[offset + 1] << 8);
    return cluster % 2 === 0 ? pair & 0x0fff : pair >> 4;
  }

  function ascii(offset, length) {
    return String.fromCharCode(...image.subarray(offset, offset + length)).trimEnd();
  }

  const files = new Map();
  for (let i = 0; i < rootEntries; i++) {
    const offset = rootOffset + i * 32;
    if (image[offset] === 0x00) break;
    if (image[offset] === 0xe5 || image[offset + 11] === 0x0f) continue;

    const name = ascii(offset, 8);
    const ext = ascii(offset + 8, 3);
    const size = view.getUint32(offset + 28, true);
    let cluster = view.getUint16(offset + 26, true);
    const data = new Uint8Array(size);
    let written = 0;
    const visited = new Set();

    while (written < size) {
      assert(cluster >= 2 && cluster < 0xff8, `invalid cluster ${cluster}`);
      assert(!visited.has(cluster), `FAT loop at cluster ${cluster}`);
      visited.add(cluster);
      const source = dataOffset + (cluster - 2) * clusterBytes;
      const length = Math.min(clusterBytes, size - written);
      data.set(image.subarray(source, source + length), written);
      written += length;
      cluster = fatEntry(cluster);
    }
    assert(cluster >= 0xff8, `cluster chain for ${name}.${ext} is not terminated`);
    files.set(ext ? `${name}.${ext}` : name, data);
  }
  return files;
}

async function assembleSample(relativePath, expectedSize) {
  const source = await readFile(new URL(relativePath, import.meta.url));
  const result = await assemble(source);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
  assert.equal(result.output.byteLength, expectedSize);
  return result.output;
}

const hello = await assembleSample('../samples/hello.asm', 28);
const testNasm = await assembleSample('../samples/test_nasm.asm', 47);
console.log('PASS 1: hello.asm=28 bytes, test_nasm.asm=47 bytes');

const image = makeFd([
  { name: 'HELLO', ext: 'COM', data: hello },
  { name: 'TESTNASM', ext: 'COM', data: testNasm },
]);
assert.equal(image.byteLength, 1232 * 1024);
console.log('PASS 2: two-file 1232 KiB image generated');

const files = readFat12Files(image);
assert.deepEqual(files.get('HELLO.COM'), hello);
assert.deepEqual(files.get('TESTNASM.COM'), testNasm);
console.log('PASS 3: independent FAT12 reader round-trip matched');

const invalidSource = new TextEncoder().encode('BITS 16\nmov ax, 1\nthis is invalid\nret\n');
const invalid = await assemble(invalidSource);
assert.equal(invalid.ok, false);
assert(invalid.errors.some((error) => error.line === 3), JSON.stringify(invalid.errors));
console.log('PASS 4: syntax error reported at line 3');
