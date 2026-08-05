#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cLineToRanges, cOffsetToLocation } from './c-source-map.mjs';
import { compile, loadDefaultHeaders } from './compile.mjs';

function assertStoppedSource(location, sourceLines, expectedLine, expectedText) {
  assert.deepEqual(location, { file: 'in.c', line: expectedLine }, '停止addressのC行が不一致です');
  assert.equal(sourceLines[expectedLine - 1].trim(), expectedText, '停止C行の原文が不一致です');
}

const [source, library, includeFiles] = await Promise.all([
  readFile(new URL('../samples/legacy/kensyuu/STRLEN.C', import.meta.url)),
  readFile(new URL('./smlrc-wasm/lcds.a', import.meta.url)),
  loadDefaultHeaders(),
]);
const result = await compile(new Uint8Array(source), {
  library: new Uint8Array(library), includeFiles,
});
assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));

const sourceLines = new TextDecoder('shift_jis').decode(source).split(/\r?\n/);
const ranges = cLineToRanges(result.sourceMap, 22);
assert.ok(ranges.length > 0, 'STRLEN.C 22行目の生成区間がありません');
for (const range of ranges) {
  assertStoppedSource(cOffsetToLocation(result.sourceMap, range.start), sourceLines, 22, 'Len++;');
}
assert.equal(cOffsetToLocation(result.sourceMap, result.sourceMap.textAddress), null,
  '関数prologue前のaddressをC行へ誤帰属させました');
assert.throws(() => assertStoppedSource(
  cOffsetToLocation(result.sourceMap, ranges[0].start), sourceLines, 23, 'Str++;',
));

console.log(`PASS C source map: STRLEN.C line=22 text="Len++;" ranges=${ranges.length}`);
console.log('PASS C source map: unmapped prologue=null, wrong-line fault detected');
