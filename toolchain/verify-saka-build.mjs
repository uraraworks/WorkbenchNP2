import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.mjs';
import { lineToOffset, offsetToLine, parseListing } from './listing.mjs';
import { normalizeMzFileSize, parseMzHeader } from './mz.mjs';

const execFileAsync = promisify(execFile);
const SOURCE = fileURLToPath(new URL('../samples/legacy/saka/SAKA_NASM.ASM', import.meta.url));
const ORIGINAL = fileURLToPath(new URL('../samples/legacy/saka/SAKA.ASM', import.meta.url));
const EXEBIN = fileURLToPath(new URL('./nasm-src/misc/exebin.mac', import.meta.url));
const BUILDER = fileURLToPath(new URL('./build-exe.mjs', import.meta.url));
const ORIGINAL_SHA256 = '7c76ecb3b3baae50fb36a237067ccde2dc65c44c6601e1886fb321e59d7c1f47';

function verifyListingHex(listing, output, startAddress) {
  let comparedBytes = 0;
  for (const line of listing.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+([0-9A-F]{8})\s+(\S+)/i);
    if (!match) continue;
    const address = Number.parseInt(match[2], 16);
    if (address < startAddress) continue;
    const rawHex = match[3];
    const hex = rawHex.endsWith('-') ? rawHex.slice(0, -1) : rawHex;
    if (!/^(?:[0-9A-F]{2})+$/i.test(hex)) continue;
    const expected = Uint8Array.from(hex.match(/[0-9A-F]{2}/gi), (byte) => Number.parseInt(byte, 16));
    assert.deepEqual(output.subarray(address, address + expected.length), expected, `listing line ${match[1]}`);
    comparedBytes += expected.length;
  }
  return comparedBytes;
}

const localLabelFixture = new TextEncoder().encode([
  'BITS 16', 'ORG 100h',
  'proc_one:', ' jmp .same', '.same:', ' nop', ' ret',
  'proc_two:', ' jmp .same', '.same:', ' nop', ' ret', '',
].join('\n'));
const localLabels = await assemble(localLabelFixture);
assert.equal(localLabels.ok, true, localLabels.ok ? undefined : JSON.stringify(localLabels.errors));
assert.deepEqual(Array.from(localLabels.output), [0xeb, 0x00, 0x90, 0xc3, 0xeb, 0x00, 0x90, 0xc3]);
console.log('PASS 1: wasm NASM local-label fixture resolved two independent .same labels');

const original = await readFile(ORIGINAL);
assert.equal(createHash('sha256').update(original).digest('hex'), ORIGINAL_SHA256);
console.log('PASS 2: original SAKA.ASM SHA-256 unchanged');

const [source, exebin] = await Promise.all([readFile(SOURCE), readFile(EXEBIN)]);
assert.equal(source.toString('latin1').match(/^\s*int\s+67h\b/gim)?.length, 27);
assert.equal(source.toString('latin1').match(/^\s*mov\s+ax,cs\s*$/gim)?.length, 4);
const assembled = await assemble(source, { listing: true, includeFiles: { 'exebin.mac': exebin } });
assert.equal(assembled.ok, true, assembled.ok ? undefined : JSON.stringify(assembled.errors));
const exe = normalizeMzFileSize(assembled.output);
const header = parseMzHeader(exe);
assert.deepEqual({
  size: exe.byteLength,
  declaredFileBytes: header.declaredFileBytes,
  headerBytes: header.headerBytes,
  lastPageBytes: header.lastPageBytes,
  pages: header.pages,
  relocations: header.relocations,
  minAllocParagraphs: header.minAllocParagraphs,
  maxAllocParagraphs: header.maxAllocParagraphs,
  cs: header.cs, ip: header.ip, ss: header.ss, sp: header.sp,
}, {
  size: 8668,
  declaredFileBytes: 8668,
  headerBytes: 32,
  lastPageBytes: 476,
  pages: 17,
  relocations: 0,
  minAllocParagraphs: 64,
  maxAllocParagraphs: 64,
  cs: 0xfff0, ip: 0x0100, ss: 0xfff0, sp: 0x26bc,
});
console.log('PASS 3: wasm NASM output, EMS/segment counts, and normalized MZ header matched');

const map = parseListing(assembled.listing, exe, { startAddress: header.headerBytes });
assert.equal(map.length, 2601);
assert.deepEqual(map[0], { srcLine: 10, offset: 0x100, bytes: [0xe9, 0xab, 0x09], text: 'jmp\tstart' });
assert.deepEqual(map.at(-1), { srcLine: 2768, offset: 0x22ba, bytes: [0xcd, 0x21], text: 'int\t21h' });
for (const entry of map) {
  for (let index = 0; index < entry.bytes.length; index++) {
    assert.equal(offsetToLine(map, entry.offset + index), entry.srcLine);
  }
}
for (const srcLine of new Set(map.map((entry) => entry.srcLine))) {
  const offset = lineToOffset(map, srcLine);
  assert.equal(offsetToLine(map, offset), srcLine);
}
assert.equal(offsetToLine(map, 0xff), null);
const comparedBytes = verifyListingHex(assembled.listing, exe, header.headerBytes);
assert.equal(comparedBytes, 5984);
console.log(`PASS 4: MZ line map ${map.length} entries / listing hex ${comparedBytes} bytes matched`);

const temporary = await mkdtemp(join(tmpdir(), 'pc98dev-saka-'));
try {
  const xdf = join(temporary, 'saka.xdf');
  await execFileAsync(process.execPath, [BUILDER, SOURCE, '-o', xdf]);
  const [savedExe, savedMap, image] = await Promise.all([
    readFile(join(temporary, 'SAKA_NASM.exe')),
    readFile(join(temporary, 'SAKA_NASM.exe.map.json'), 'utf8').then(JSON.parse),
    readFile(xdf),
  ]);
  assert.deepEqual(new Uint8Array(savedExe), exe);
  assert.deepEqual(savedMap, map);
  assert.equal(image.byteLength, 1232 * 1024);
  console.log('PASS 5: build-exe wrote byte-identical EXE/map and FAT12 image');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
