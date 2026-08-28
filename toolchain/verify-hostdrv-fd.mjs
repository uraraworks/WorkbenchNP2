import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { addHostdrv } from './hostdrv.mjs';

const execFileAsync = promisify(execFile);
const BASE = fileURLToPath(new URL('../ide/freedos/fd98_2hd.xdf', import.meta.url));
const HOSTDRV = fileURLToPath(new URL('../ide/freedos/HOSTDRV.COM.bin', import.meta.url));
const BUILDER = fileURLToPath(new URL('./build-hostdrv-fd.mjs', import.meta.url));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// この読み取りは fdadd.mjs / build-hostdrv-fd.mjs のFAT12実装コードを一切共有しない
// 独立実装。実装側のバグを検査側が引き継いで見逃すことを避けるため。
function readFat12Root(image) {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const sectorSize = view.getUint16(11, true);
  const clusterSectors = image[13];
  const reserved = view.getUint16(14, true);
  const fatCopies = image[16];
  const rootEntryCount = view.getUint16(17, true);
  const fatSectors = view.getUint16(22, true);
  const rootSectorCount = Math.ceil(rootEntryCount * 32 / sectorSize);
  const fatByteOffset = reserved * sectorSize;
  const rootByteOffset = (reserved + fatCopies * fatSectors) * sectorSize;
  const dataByteOffset = rootByteOffset + rootSectorCount * sectorSize;
  const bytesPerCluster = sectorSize * clusterSectors;

  function fatValue(cluster) {
    const offset = fatByteOffset + Math.floor(cluster * 3 / 2);
    const packed = image[offset] | (image[offset + 1] << 8);
    return cluster & 1 ? packed >>> 4 : packed & 0x0fff;
  }
  function clusterChain(first) {
    if (first === 0) return [];
    const result = []; let cluster = first;
    while (cluster < 0xff8) { result.push(cluster); cluster = fatValue(cluster); }
    return result;
  }
  function chainBytes(first, size) {
    const result = new Uint8Array(size); let written = 0;
    for (const cluster of clusterChain(first)) {
      if (written >= size) break;
      const offset = dataByteOffset + (cluster - 2) * bytesPerCluster;
      const count = Math.min(bytesPerCluster, size - written);
      result.set(image.subarray(offset, offset + count), written);
      written += count;
    }
    return result;
  }

  const bytes = image.subarray(rootByteOffset, rootByteOffset + rootEntryCount * 32);
  const files = new Map();
  for (let offset = 0; offset + 32 <= bytes.length; offset += 32) {
    if (bytes[offset] === 0x00) break;
    if (bytes[offset] === 0xe5) continue;
    const attributes = bytes[offset + 11];
    if (attributes === 0x0f || (attributes & 0x18)) continue;
    const name = String.fromCharCode(...bytes.subarray(offset, offset + 8)).trimEnd();
    const ext = String.fromCharCode(...bytes.subarray(offset + 8, offset + 11)).trimEnd();
    const shortName = ext ? `${name}.${ext}` : name;
    const firstCluster = bytes[offset + 26] | (bytes[offset + 27] << 8);
    const size = (bytes[offset + 28] | (bytes[offset + 29] << 8) |
      (bytes[offset + 30] << 16) | (bytes[offset + 31] << 24)) >>> 0;
    files.set(shortName, chainBytes(firstCluster, size));
  }
  return files;
}

const temporary = await mkdtemp(join(tmpdir(), 'verify-hostdrv-fd-'));
try {
  const baseBefore = await readFile(BASE);
  const baseHashBefore = sha256(baseBefore);
  const hostdrvCom = await readFile(HOSTDRV);

  // --- addHostdrv(): HOSTDRV.COMが同梱バイトのまま追加され、AUTOEXEC.BATに
  //     "HOSTDRV D" が追記されること。入力imageは変更されないこと。 ---
  const image = new Uint8Array(baseBefore.buffer, baseBefore.byteOffset, baseBefore.byteLength);
  const inputSnapshotHash = sha256(image);
  const dev = addHostdrv(image, hostdrvCom);
  assert.equal(sha256(image), inputSnapshotHash, 'addHostdrv()が入力imageを書き換えました');
  const files = readFat12Root(dev);
  assert.ok(files.has('HOSTDRV.COM'), 'HOSTDRV.COMが生成イメージにありません');
  assert.deepEqual(files.get('HOSTDRV.COM'), new Uint8Array(hostdrvCom.buffer, hostdrvCom.byteOffset, hostdrvCom.byteLength),
    'HOSTDRV.COMのバイト列が同梱バイナリと一致しません');
  assert.ok(files.has('AUTOEXEC.BAT'), 'AUTOEXEC.BATが生成イメージにありません');
  const autoexecText = String.fromCharCode(...files.get('AUTOEXEC.BAT'));
  assert.ok(/^HOSTDRV D$/m.test(autoexecText.replace(/\r\n/g, '\n')),
    `AUTOEXEC.BATに"HOSTDRV D"の行がありません: ${JSON.stringify(autoexecText)}`);
  assert.ok(autoexecText.includes('@ECHO OFF'), 'AUTOEXEC.BATの既存内容(@ECHO OFF)が失われています');
  console.log('PASS 1: addHostdrv() adds HOSTDRV.COM and appends "HOSTDRV D" without mutating the input image');

  // --- 冪等性: 生成物へ再度addHostdrv()を適用してもバイト単位で同じ結果になること ---
  const devAgain = addHostdrv(dev, hostdrvCom);
  assert.equal(sha256(devAgain), sha256(dev), 'addHostdrv()の2回適用が冪等ではありません');
  const autoexecAgainText = String.fromCharCode(...readFat12Root(devAgain).get('AUTOEXEC.BAT'));
  const hostdrvLineCount = (autoexecAgainText.match(/HOSTDRV D/g) ?? []).length;
  assert.equal(hostdrvLineCount, 1, `"HOSTDRV D"が2重に追記されています(${hostdrvLineCount}回)`);
  console.log('PASS 2: addHostdrv() is idempotent (byte-identical on reapply, command not duplicated)');

  // --- 陽性対照: HOSTDRV.COMのバイトを1つ壊した状態で比較すると不合格になること ---
  const corrupted = new Uint8Array(hostdrvCom.buffer, hostdrvCom.byteOffset, hostdrvCom.byteLength).slice();
  corrupted[0] ^= 0xff;
  assert.throws(() => {
    assert.deepEqual(readFat12Root(addHostdrv(image, corrupted)).get('HOSTDRV.COM'),
      new Uint8Array(hostdrvCom.buffer, hostdrvCom.byteOffset, hostdrvCom.byteLength));
  }, 'バイト破損させたHOSTDRV.COMでも検査が合格してしまいます(検査自体が壊れている可能性)');
  console.log('PASS 3: positive control — a corrupted HOSTDRV.COM byte is detected by the same assertion');

  // --- CLI: 原本ファイルを書き換えないこと。2回実行して出力が同一であること ---
  const out1 = join(temporary, 'dev1.xdf');
  const out2 = join(temporary, 'dev2.xdf');
  await execFileAsync(process.execPath, [BUILDER, '-o', out1]);
  await execFileAsync(process.execPath, [BUILDER, '-o', out2]);
  const baseAfter = await readFile(BASE);
  assert.equal(sha256(baseAfter), baseHashBefore, 'CLI実行後に原本fd98_2hd.xdfが変更されました');
  const [bytes1, bytes2] = await Promise.all([readFile(out1), readFile(out2)]);
  assert.equal(sha256(bytes1), sha256(bytes2), 'CLIの2回の実行結果がバイト単位で一致しません');
  console.log('PASS 4: CLI leaves the pristine base image untouched and produces byte-identical output across runs');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log('[PASS] verify-hostdrv-fd.mjs: all checks passed');
