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

async function verify() {
  const result = await assemble(await readFile(HELLO_ASM), { listing: true });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
  assert.equal(typeof result.listing, 'string');
  const map = parseListing(result.listing, result.output);
  assert.ok(map.length > 0);
  console.log(`PASS 1: hello.asm listing parsed (${map.length} entries)`);

  assert.equal(map[0].offset, 0x100);
  console.log('PASS 2: first segment offset is ORG 100h');

  let mappedBytes = 0;
  for (const entry of map) {
    const fileOffset = entry.offset - 0x100;
    assert.deepEqual(
      entry.bytes,
      Array.from(result.output.subarray(fileOffset, fileOffset + entry.bytes.length)),
      `source line ${entry.srcLine} differs at offset 0x${entry.offset.toString(16)}`,
    );
    mappedBytes += entry.bytes.length;
    for (let index = 0; index < entry.bytes.length; index++) {
      assert.equal(offsetToLine(map, entry.offset + index), entry.srcLine);
    }
  }
  assert.equal(mappedBytes, result.output.byteLength);
  console.log(`PASS 3: all ${mappedBytes} mapped bytes exactly match hello.com`);

  for (const srcLine of new Set(map.map((entry) => entry.srcLine))) {
    const offset = lineToOffset(map, srcLine);
    assert.equal(typeof offset, 'number');
    assert.equal(offsetToLine(map, offset), srcLine);
  }
  assert.equal(lineToOffset(map, 7), null); // バイトを生成しないラベル行
  assert.equal(offsetToLine(map, map[1].offset + 1), map[1].srcLine); // 命令途中
  console.log('PASS 4: lineToOffset / offsetToLine round-trip matched (including instruction interior)');

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
  console.log('PASS 5: label/EQU omitted, times merged, and macro expansion mapped to its invocation line');

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
    console.log('PASS 6: build-com wrote byte-identical .com and .com.map.json beside the FD image');
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
