import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.mjs';
import { lineToOffset, offsetToLine, parseListing } from './listing.mjs';

const execFileAsync = promisify(execFile);
const HELLO_ASM = fileURLToPath(new URL('../samples/hello.asm', import.meta.url));
const BUILDER = fileURLToPath(new URL('./build-com.mjs', import.meta.url));

/**
 * リスティングの通常hexカラムを、parseListingとは独立した正規表現で読み.COMと照合する。
 * `BA[0C00]`（再配置）と`AA<rep 14h>`（反復省略）は最終バイト列ではないためentry単位で除外する。
 * 長いdb行末の`-`は単なる継続記号なので除去して比較する。
 */
function verifyListingHex(listing, output) {
  let comparedBytes = 0;
  let comparedEntries = 0;
  const skipped = [];
  for (const line of listing.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+([0-9A-F]{8})\s+(\S+)/i);
    if (!match) continue;
    const [, srcLineText, addressText, rawHex] = match;
    const address = Number.parseInt(addressText, 16);
    const hex = rawHex.endsWith('-') ? rawHex.slice(0, -1) : rawHex;
    if (!/^(?:[0-9A-F]{2})+$/i.test(hex)) {
      const notation = rawHex.includes('[')
        ? 'relocation notation'
        : rawHex.includes('<rep') ? 'repeat notation' : 'special notation';
      skipped.push({ srcLine: Number(srcLineText), address, rawHex, notation });
      continue;
    }
    const expected = Uint8Array.from(hex.match(/[0-9A-F]{2}/gi), (byte) => Number.parseInt(byte, 16));
    const actual = output.subarray(address, address + expected.length);
    assert.equal(actual.length, expected.length, `line ${srcLineText}: hex range exceeds .com`);
    assert.deepEqual(
      actual,
      expected,
      `line ${srcLineText}: listing address 0x${addressText} does not match its hex column`,
    );
    comparedBytes += expected.length;
    comparedEntries++;
  }
  assert.ok(comparedEntries > 0, 'listing contains no independently comparable hex entries');
  return { comparedBytes, comparedEntries, skipped };
}

async function verify() {
  const result = await assemble(await readFile(HELLO_ASM), { listing: true });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
  assert.equal(typeof result.listing, 'string');
  const map = parseListing(result.listing, result.output);
  assert.ok(map.length > 0);
  console.log(`PASS 1: hello.asm listing parsed (${map.length} entries)`);

  assert.equal(map[0].offset, 0x100);
  console.log('PASS 2: first segment offset is ORG 100h');

  const audit = verifyListingHex(result.listing, result.output);
  assert.equal(audit.comparedBytes, 25);
  assert.equal(audit.skipped.length, 1);
  assert.equal(audit.skipped[0].rawHex, 'BA[0C00]');
  console.log(
    `PASS 3: ${audit.comparedBytes} bytes compared / ${audit.skipped.length} entry skipped `
    + `(${audit.skipped[0].rawHex}: ${audit.skipped[0].notation})`,
  );

  for (const entry of map) {
    for (let index = 0; index < entry.bytes.length; index++) {
      assert.equal(offsetToLine(map, entry.offset + index), entry.srcLine);
    }
  }

  for (const srcLine of new Set(map.map((entry) => entry.srcLine))) {
    const offset = lineToOffset(map, srcLine);
    assert.equal(typeof offset, 'number');
    assert.equal(offsetToLine(map, offset), srcLine);
  }
  assert.equal(lineToOffset(map, 7), null); // バイトを生成しないラベル行
  assert.equal(offsetToLine(map, map[1].offset + 1), map[1].srcLine); // 命令途中
  console.log('PASS 4: lineToOffset / offsetToLine round-trip matched (including instruction interior)');

  // 負例: 最初のアドレスだけを+1したlistingは、hexが同じでも.COM上の位置がずれるため必ず失敗する。
  const shiftedListing = result.listing.replace(
    /(^\s*\d+\s+)00000000(\s+\S+)/m,
    (_line, prefix, suffix) => `${prefix}00000001${suffix}`,
  );
  assert.notEqual(shiftedListing, result.listing);
  assert.throws(() => verifyListingHex(shiftedListing, result.output), /does not match its hex column/);
  console.log('PASS 5: intentional +1 listing-address shift was detected');

  // NASMの実リスティングで、バイト非生成行・timesの<rep>・マクロの<1>展開も固定検証する。
  const expandedSource = new TextEncoder().encode([
    'BITS 16', 'ORG 100h', 'VALUE equ 3', 'only_label:', 'times 20 db 0AAh',
    '%macro TWO 0', ' nop', ' inc ax', '%endmacro', 'TWO', 'mov bx, only_label', '',
  ].join('\n'));
  const expanded = await assemble(expandedSource, { listing: true });
  assert.equal(expanded.ok, true, expanded.ok ? undefined : JSON.stringify(expanded.errors));
  const expandedMap = parseListing(expanded.listing, expanded.output);
  assert.deepEqual(expandedMap.map(({ srcLine, offset, bytes }) => ({ srcLine, offset, bytes })), [
    { srcLine: 5, offset: 0x100, bytes: new Array(20).fill(0xaa) },
    { srcLine: 10, offset: 0x114, bytes: [0x90] },
    { srcLine: 10, offset: 0x115, bytes: [0x40] },
    { srcLine: 11, offset: 0x116, bytes: [0xbb, 0x00, 0x01] },
  ]);
  const expandedAudit = verifyListingHex(expanded.listing, expanded.output);
  assert.deepEqual(expandedAudit.skipped.map(({ rawHex, notation }) => ({ rawHex, notation })), [
    { rawHex: 'AA<rep', notation: 'repeat notation' },
    { rawHex: 'BB[0000]', notation: 'relocation notation' },
  ]);
  console.log(
    `PASS 6: label/EQU omitted, times merged, macro mapped; `
    + `${expandedAudit.comparedBytes} bytes compared / ${expandedAudit.skipped.length} entries skipped`,
  );

  const temporary = await mkdtemp(join(tmpdir(), 'pc98dev-listing-'));
  try {
    const xdfPath = join(temporary, 'hello.xdf');
    await execFileAsync(process.execPath, [BUILDER, HELLO_ASM, '-o', xdfPath]);
    const [com, savedMap] = await Promise.all([
      readFile(join(temporary, 'hello.com')),
      readFile(join(temporary, 'hello.com.map.json'), 'utf8').then(JSON.parse),
    ]);
    assert.deepEqual(new Uint8Array(com), result.output);
    assert.deepEqual(savedMap, map);
    console.log('PASS 7: build-com wrote byte-identical .com and .com.map.json beside the FD image');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

try {
  await verify();
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
