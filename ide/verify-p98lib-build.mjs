#!/usr/bin/env node
// p98lib(vendor/p98lib/、経緯はその README.md参照)を使った3サンプル(hello.c/walk.c/
// walk2.c)が huge model で実際にビルドできることを、Node側のcompile-core.mjs/assemble.mjs
// を使って検査する。
//
// このスクリプトの限界: 検査しているのは ide/browser-toolchain.mjs のbuildWithP98lib()と
// 「同じ手順・同じvendor/p98libのバイト」をNode側のwasm factoryで実行した結果であって、
// ide/browser-toolchain.mjs のブラウザ経路そのもの(fetch・ブラウザ用wasm factory・
// IDEのUI結線・#include "p98.h" 判定の実配線)は検査していない。ブラウザ経路の
// fetch先が正しいかは toolchain/verify-published-assets.mjs が別途担保する。
//
// 実行: node ide/verify-p98lib-build.mjs

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileWithFactories, compileToObjectWithFactories } from '../toolchain/compile-core.mjs';
import { assemble } from '../toolchain/assemble.mjs';
import { loadDefaultHeaders } from '../toolchain/compile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = join(ROOT, 'vendor', 'p98lib');

const require = createRequire(import.meta.url);
const createSmlrpp = require('../toolchain/smlrc-wasm/smlrpp.js');
const createSmlrc = require('../toolchain/smlrc-wasm/smlrc.js');
const createSmlrl = require('../toolchain/smlrc-wasm/smlrl.js');
const tools = { createSmlrpp, createSmlrc, createSmlrl, assemble };

async function loadResources() {
  const [defaultHeaders, p98Header, magAssetsHeader, p98Source, p98AsmSource, library] = await Promise.all([
    loadDefaultHeaders(),
    readFile(join(VENDOR_DIR, 'include', 'p98.h')),
    readFile(join(VENDOR_DIR, 'samples', 'mag_assets.h')),
    readFile(join(VENDOR_DIR, 'src', 'p98.c')),
    readFile(join(VENDOR_DIR, 'src', 'p98_asm.asm')),
    readFile(join(ROOT, 'toolchain', 'smlrc-wasm', 'lcdh.a')),
  ]);
  const includeFiles = {
    ...defaultHeaders,
    'p98.h': new Uint8Array(p98Header),
    'mag_assets.h': new Uint8Array(magAssetsHeader),
  };
  return {
    includeFiles,
    p98Source: new Uint8Array(p98Source),
    p98AsmSource: new Uint8Array(p98AsmSource),
    library: new Uint8Array(library),
  };
}

/**
 * ide/browser-toolchain.mjs の buildWithP98lib() と同じ3段の手順。
 * @param {Uint8Array} userSource
 * @param {{libSource?: Uint8Array}} [override] libSourceを差し替えると故障注入できる
 */
async function buildWithP98lib(userSource, resources, override = {}) {
  const libSource = override.libSource ?? resources.p98Source;
  const libObject = await compileToObjectWithFactories(libSource, {
    includeFiles: resources.includeFiles, model: 'huge',
  }, tools);
  if (!libObject.ok) return { ok: false, errors: libObject.errors.map((e) => ({ ...e, stage: 'p98lib' })) };

  const asmObject = await assemble(resources.p98AsmSource, { format: 'elf', listing: true });
  if (!asmObject.ok) return { ok: false, errors: asmObject.errors.map((e) => ({ ...e, stage: 'nasm(p98lib)' })) };

  return compileWithFactories(userSource, {
    library: resources.library, includeFiles: resources.includeFiles, model: 'huge',
    extraLinkInputs: [
      { name: 'p98lib.o', bytes: libObject.object },
      { name: 'p98asm.o', bytes: asmObject.output },
    ],
  }, tools);
}

function assertMzHeader(output, label) {
  assert.ok(output instanceof Uint8Array && output.length >= 2, `${label}: 出力が空です`);
  assert.equal(output[0], 0x4d, `${label}: 出力の先頭が'M'(0x4D)ではありません`); // 'M'
  assert.equal(output[1], 0x5a, `${label}: 出力の先頭が'Z'(0x5A)ではありません`); // 'Z'
}

async function main() {
  // smlrc-wasm/nasm-wasm(emscripten)のcallMain()は、意図的に失敗させた実行(後述の
  // 故障注入)でも process.exitCode を書き換える。compile.mjs の compile() に倣い、
  // このスクリプト自体の終了コードを検査結果(PASS/FAIL)だけで決めるため退避・復元する。
  const previousExitCode = process.exitCode;
  const resources = await loadResources();

  // --- 1. 3サンプルが実際にビルドできること ---
  for (const name of ['hello.c', 'walk.c', 'walk2.c']) {
    const source = new Uint8Array(await readFile(join(VENDOR_DIR, 'samples', name)));
    const result = await buildWithP98lib(source, resources);
    if (!result.ok) {
      console.error(`[FAIL] ${name} のビルドに失敗しました:`);
      for (const error of result.errors) console.error(`  [${error.stage}] line ${error.line}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    assertMzHeader(result.output, name);
    console.log(`[PASS] ${name}: huge modelでビルドでき、出力はMZヘッダで始まります (${result.output.byteLength} bytes)`);
  }

  // --- 2. 故障注入: p98.cをextraLinkInputsから外すとリンクが失敗すること ---
  // これが無いと「この検査は何も見ていない(常に成功する)」ケースに気づけない
  // (feedback_control_and_fault_injection: 陽性対照が無いと検査を信用できない)。
  {
    const helloSource = new Uint8Array(await readFile(join(VENDOR_DIR, 'samples', 'hello.c')));
    const asmObject = await assemble(resources.p98AsmSource, { format: 'elf', listing: true });
    assert.ok(asmObject.ok, 'p98_asm.asmの単独アセンブルに失敗しました(故障注入の前提が崩れています)');
    const withoutLib = await compileWithFactories(helloSource, {
      library: resources.library, includeFiles: resources.includeFiles, model: 'huge',
      extraLinkInputs: [
        // p98lib.oを意図的に外す。p98.h の宣言だけでは呼び出し先の実体が無くリンクが失敗するはず。
        { name: 'p98asm.o', bytes: asmObject.output },
      ],
    }, tools);
    assert.equal(withoutLib.ok, false, '故障注入: p98lib.oを外してもリンクが成功してしまいました。この検査はp98.cのリンクを見ていません');
    console.log('[PASS] 故障注入: p98lib.o(p98.cのオブジェクト)を外すとリンクが失敗することを確認しました');
  }

  console.log('サマリ: すべて PASS');
  process.exitCode = previousExitCode;
}

await main();
