#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assemble } from './assemble.mjs';
import { compile, loadDefaultHeaders } from './compile.mjs';
import { normalizeCrLfForPreprocessor, normalizeDosTextSource } from './dos-text.mjs';

const encoder = new TextEncoder();

function assertNormalization(actual, expectedSource, expectedRemoved, expectedInterior) {
  assert.deepEqual(Array.from(actual.source), Array.from(expectedSource), '正規化後バイト列が不一致です');
  assert.equal(actual.dosEofBytesRemoved, expectedRemoved, '末尾DOS EOF除去数が不一致です');
  assert.equal(actual.interiorDosEofOffset, expectedInterior, '途中DOS EOF位置が不一致です');
}

const trailingFixture = Uint8Array.from([0x41, 0x1a, 0x1a]);
const trailing = normalizeDosTextSource(trailingFixture);
assertNormalization(trailing, Uint8Array.from([0x41]), 2, -1);
assert.deepEqual(Array.from(trailingFixture), [0x41, 0x1a, 0x1a], '入力バイト列を破壊しました');

const mixedFixture = Uint8Array.from([0x41, 0x1a, 0x42, 0x1a]);
const mixed = normalizeDosTextSource(mixedFixture);
assertNormalization(mixed, Uint8Array.from([0x41, 0x1a, 0x42]), 1, 1);
assert.throws(() => assertNormalization(
  { ...mixed, source: Uint8Array.from([0x41, 0x42]), interiorDosEofOffset: -1 },
  Uint8Array.from([0x41, 0x1a, 0x42]), 1, 1,
));

const crlfFixture = Uint8Array.from([0x41, 0x0d, 0x0a, 0x42, 0x0d]);
const crlf = normalizeCrLfForPreprocessor(crlfFixture);
assert.deepEqual(Array.from(crlf.source), [0x41, 0x0a, 0x42, 0x0d]);
assert.equal(crlf.crlfSequencesNormalized, 1);
assert.deepEqual(Array.from(crlfFixture), [0x41, 0x0d, 0x0a, 0x42, 0x0d]);

const asmText = encoder.encode('CPU 8086\nBITS 16\nORG 100h\nnop\nint3\n');
const asmTrailing = await assemble(Uint8Array.from([...asmText, 0x1a, 0x1a]));
assert.equal(asmTrailing.ok, true, '末尾DOS EOF付きASMをアセンブルできません');
assert.deepEqual(Array.from(asmTrailing.output), [0x90, 0xcc]);
assert.equal(asmTrailing.sourceNormalization.dosEofBytesRemoved, 2);

const asmMiddle = encoder.encode('CPU 8086\nBITS 16\nORG 100h\nnop\n\x1a\nint3\n');
const asmMiddleResult = await assemble(asmMiddle);
assert.equal(asmMiddleResult.ok, true, 'NASMが受理する途中DOS EOF付きASMを拒否しました');
assert.deepEqual(Array.from(asmMiddleResult.output), [0x90, 0xcc], '途中DOS EOF後の命令が失われました');
assert.equal(asmMiddleResult.sourceNormalization.dosEofBytesRemoved, 0);

const [strlenSource, library, includeFiles] = await Promise.all([
  readFile(new URL('../samples/legacy/kensyuu/STRLEN.C', import.meta.url)),
  readFile(new URL('./smlrc-wasm/lcds.a', import.meta.url)),
  loadDefaultHeaders(),
]);
assert.equal(strlenSource.at(-1), 0x1a, '原文STRLEN.Cの末尾DOS EOFが失われています');
const strlen = await compile(new Uint8Array(strlenSource), {
  library: new Uint8Array(library), includeFiles,
});
assert.equal(strlen.ok, true, '無改変STRLEN.Cをコンパイルできません');
assert.equal(strlen.sourceNormalization.dosEofBytesRemoved, 1);
assert.ok(strlen.sourceNormalization.crlfSequencesNormalized > 0);
assert.equal(strlen.output[0] | (strlen.output[1] << 8), 0x5a4d, 'STRLEN出力がMZ EXEではありません');

const cMiddle = encoder.encode('int main(void)\n{\n\x1a\nreturn 0;\n}\n');
const cMiddleNormalized = normalizeDosTextSource(cMiddle);
assertNormalization(cMiddleNormalized, cMiddle, 0, cMiddle.indexOf(0x1a));
const cRejected = await compile(cMiddle, { library: new Uint8Array(library), includeFiles });
assert.equal(cRejected.ok, false, '途中DOS EOF付きCをSmallerCが拒否しませんでした');
assert.equal(cRejected.sourceNormalization.dosEofBytesRemoved, 0);
assert.notEqual(cRejected.errors[0].stage, 'input', 'ラッパ独自の途中DOS EOF拒否が残っています');

console.log(`PASS DOS EOF: ASM trailing=2, C STRLEN trailing=1 (${strlen.output.length}-byte MZ)`);
console.log('PASS DOS EOF: middle byte preserved; ASM accepted with following instruction intact');
console.log('PASS DOS EOF: middle byte passed unchanged to SmallerC');
console.log('PASS DOS EOF: normalization fault injection rejected');
console.log(`PASS DOS text: CRLF normalized=${strlen.sourceNormalization.crlfSequencesNormalized}, line count preserved`);
