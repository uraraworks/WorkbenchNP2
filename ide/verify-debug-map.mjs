#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assemble } from '../toolchain/assemble.mjs';
import { parseListing } from '../toolchain/listing.mjs';
import { compile, loadDefaultHeaders } from '../toolchain/compile.mjs';
import { createAsmDebugMap, createCDebugMap, debugMapForBuild } from './debug-map.mjs';

async function verifyAsm() {
  const HELLO_ASM = new URL('../samples/hello.asm', import.meta.url);
  const result = await assemble(await readFile(HELLO_ASM), { listing: true });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
  const map = parseListing(result.listing, result.output);
  assert.ok(map.length > 0, 'hello.asm listing entries が空です');

  const debugMap = createAsmDebugMap(map);
  const lines = debugMap.debuggableLines();
  assert.ok(lines.length > 0, 'debuggableLines() が空です');

  for (const line of lines) {
    const offsets = debugMap.breakpointOffsets(line);
    assert.ok(offsets.length > 0, `line ${line} の breakpointOffsets が空です`);
    for (const offset of offsets) {
      assert.equal(debugMap.lineAt(offset), line, `offset 0x${offset.toString(16)} を line ${line} へ逆引きできません`);
    }
  }
  console.log(`PASS ASM debug map: ${lines.length} debuggable lines round-tripped through breakpointOffsets/lineAt`);

  const firstLine = lines[0];
  const firstOffset = debugMap.breakpointOffsets(firstLine)[0];
  const next = debugMap.nextEntryFrom(firstOffset);
  assert.ok(next, 'nextEntryFrom() が先頭行から次の行を返しませんでした');
  assert.notEqual(next.line, firstLine, 'nextEntryFrom() が現在行と同じ行を返しました');
  assert.ok(next.offsets[0] > firstOffset, 'nextEntryFrom() が現在offsetより手前を返しました');
  console.log(`PASS ASM debug map: nextEntryFrom(0x${firstOffset.toString(16)}) -> line ${next.line} (offset 0x${next.offsets[0].toString(16)})`);

  // バイトを生成しない行（ラベルのみ等）は debuggable ではない。
  const nonDebuggableLine = Array.from({ length: map.length ? Math.max(...map.map((e) => e.srcLine)) + 5 : 5 })
    .map((_, index) => index + 1)
    .find((line) => !debugMap.isDebuggable(line));
  assert.ok(nonDebuggableLine !== undefined, '非debuggable行の候補が見つかりません');
  assert.equal(debugMap.isDebuggable(nonDebuggableLine), false);
  assert.deepEqual(debugMap.breakpointOffsets(nonDebuggableLine), []);
  console.log(`PASS ASM debug map: line ${nonDebuggableLine} (no generated address) is not debuggable`);
}

async function verifyC() {
  const STRLEN_C = new URL('../samples/legacy/kensyuu/STRLEN.C', import.meta.url);
  const [source, library, includeFiles] = await Promise.all([
    readFile(STRLEN_C),
    readFile(new URL('../toolchain/smlrc-wasm/lcds.a', import.meta.url)),
    loadDefaultHeaders(),
  ]);
  const result = await compile(new Uint8Array(source), {
    library: new Uint8Array(library), includeFiles,
  });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));

  const debugMap = createCDebugMap(result.sourceMap);
  assert.equal(debugMap.isDebuggable(22), true, 'STRLEN.C 22行目が debuggable ではありません');
  const offsets = debugMap.breakpointOffsets(22);
  assert.ok(offsets.length > 0, 'STRLEN.C 22行目の breakpointOffsets が空です');
  for (const offset of offsets) {
    assert.equal(debugMap.lineAt(offset), 22, `offset 0x${offset.toString(16)} を line 22 へ逆引きできません`);
  }
  console.log(`PASS C debug map: line 22 (Len++;) round-tripped through breakpointOffsets/lineAt (${offsets.length} offsets)`);

  assert.equal(debugMap.lineAt(result.sourceMap.textAddress - 1), null,
    '関数prologue前のaddressをC行へ誤帰属させました');
  const outOfRangeOffset = Math.max(...result.sourceMap.ranges.map((range) => range.end ?? range.start)) + 0x1000;
  assert.equal(debugMap.lineAt(outOfRangeOffset), null,
    '対応区間外のaddressを近傍行へ寄せてしまいました');
  console.log('PASS C debug map: lineAt() returns null for out-of-range offsets (no nearest-line fallback)');

  const next = debugMap.nextEntryFrom(offsets[0]);
  assert.ok(next, 'nextEntryFrom() が line 22 以降の行を返しませんでした');
  assert.notEqual(next.line, 22, 'nextEntryFrom() が現在行と同じ行を返しました');
  console.log(`PASS C debug map: nextEntryFrom(line 22 offset) -> line ${next.line}`);
}

function verifyDebugMapForBuild() {
  const asmBuild = debugMapForBuild({ map: [{ srcLine: 1, offset: 0x100, bytes: [0x90] }] });
  assert.equal(asmBuild?.kind, 'asm', 'debugMapForBuild() が asm map を判別できません');

  const cBuild = debugMapForBuild({ sourceMap: { ranges: [{ file: 'in.c', line: 1, start: 0x100, end: 0x101 }] } });
  assert.equal(cBuild?.kind, 'c', 'debugMapForBuild() が C sourceMap を判別できません');

  assert.equal(debugMapForBuild({}), null, 'debugMapForBuild() が未対応の形で null を返しません');
  assert.equal(debugMapForBuild(null), null, 'debugMapForBuild(null) が null を返しません');
  console.log('PASS debugMapForBuild(): asm/c/未対応の3系統を正しく判別');
}

try {
  await verifyAsm();
  await verifyC();
  verifyDebugMapForBuild();
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
