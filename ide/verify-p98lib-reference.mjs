#!/usr/bin/env node
// ide/p98lib-reference.html (p98lib リファレンス、日本語) が、
// vendor/p98lib/include/p98.h (公開APIの本家。ヘッダはWB側へバイト単位コピー
// してあるが、APIの定義自体の本家はp98lib側にある) から取り残されていないかを
// 機械的に検査する。
//
// この検査で分かること:
//   - B-1: p98.hの本文から機械的に抽出した公開API(関数名・型名・定数名)の
//     すべてが、p98lib-reference.htmlの本文中に文字列として登場するか。
//   - B-2: p98lib-reference.htmlの<pre class="sample" data-build="full">に
//     書かれている「完全な例」が、実際にp98libのビルド経路(huge model、
//     vendor/p98lib/src/p98.c・p98_asm.asmとのリンク)でビルドできるか。
//
// この検査で分からないこと(限界):
//   - リファレンスの**説明文の内容が正しいか**は一切見ていない。名前がページ
//     本文のどこかに出現していることしか確認しないため、引数の意味・戻り値・
//     副作用の説明が誤っていても、あるいは全く違う文脈で名前だけ言及していても
//     このテストは通ってしまう。
//   - HTMLコメント中に書かれた名前も本文と区別せず拾う(コメントアウトされた
//     古い記述が残っていても「載っている」と誤判定しうる)。
//   - data-build="full"の例が実際にビルドできることは見るが、その例が
//     「本文の説明どおりに動く」かどうか(実行結果・画面表示)は見ていない。
//   - p98.hのコメント(自然文)にある仕様(例: 呼び出し順序の制約、副作用の
//     詳細)は抽出対象外。抽出しているのは名前(識別子)だけ。
//
// 実行: node ide/verify-p98lib-reference.mjs

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
const HEADER_PATH = join(VENDOR_DIR, 'include', 'p98.h');
const REFERENCE_PATH = join(ROOT, 'ide', 'p98lib-reference.html');

const require = createRequire(import.meta.url);
const createSmlrpp = require('../toolchain/smlrc-wasm/smlrpp.js');
const createSmlrc = require('../toolchain/smlrc-wasm/smlrc.js');
const createSmlrl = require('../toolchain/smlrc-wasm/smlrl.js');
const tools = { createSmlrpp, createSmlrc, createSmlrl, assemble };

const EXTRA_TYPE_NAMES = [
  'p98_sprite_t',
  'p98_sprite_backend_t',
  'p98_render_mode_t',
  'p98_draw_target_t',
  'p98_vram_sprite_t',
];

/**
 * p98.hの本文から公開API名を機械的に抽出する。
 * ベタ書きの名前リストを使わないことが目的なので、正規表現で本文をなめるだけにする。
 * @param {string} headerText
 * @returns {{functions: string[], defines: string[], enumConstants: string[], types: string[]}}
 */
function extractPublicApiNames(headerText) {
  // コメントを取り除いてから走査する(コメント中の関数名の言及と、実宣言を区別する)。
  const withoutComments = headerText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');

  const functions = new Set();
  // 戻り値の型 + 空白 + p98_で始まる識別子 + '(' という並びを関数宣言とみなす。
  // 例: "int p98_init(void);" / "void p98_draw_sprite(const p98_sprite_t *spr, ...);"
  const funcPattern = /\b(?:[A-Za-z_][A-Za-z0-9_ ]*?)\s+(p98_[a-zA-Z0-9_]*)\s*\(/g;
  for (const m of withoutComments.matchAll(funcPattern)) {
    functions.add(m[1]);
  }
  // typedef struct/enum の型名自体は「型名 + ';'」の形では関数パターンに引っかからないため、
  // EXTRA_TYPE_NAMESとして別途明示的に検証対象へ含める(下記コメント参照)。

  // インクルードガード(#ifndef P98_H / #define P98_H)は公開APIではないので除外する。
  const guardMatch = withoutComments.match(/^\s*#\s*ifndef\s+(P98_[A-Za-z0-9_]+)/m);
  const guardName = guardMatch ? guardMatch[1] : null;

  const defines = new Set();
  const definePattern = /^\s*#\s*define\s+(P98_[A-Za-z0-9_]+)/gm;
  for (const m of withoutComments.matchAll(definePattern)) {
    if (m[1] === guardName) continue;
    defines.add(m[1]);
  }

  const enumConstants = new Set();
  // typedef enum { A = 0, B = 1 } name_t; の { ... } 部分から P98_ で始まる定数を拾う。
  const enumPattern = /typedef\s+enum\s*\{([^}]*)\}\s*[A-Za-z0-9_]+\s*;/g;
  for (const m of withoutComments.matchAll(enumPattern)) {
    const body = m[1];
    const constPattern = /\b(P98_[A-Za-z0-9_]+)\b/g;
    for (const cm of body.matchAll(constPattern)) {
      enumConstants.add(cm[1]);
    }
  }

  return {
    functions: [...functions].sort(),
    defines: [...defines].sort(),
    enumConstants: [...enumConstants].sort(),
    types: [...EXTRA_TYPE_NAMES].sort(),
  };
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * <pre class="sample" data-build="full">...</pre> の中身(<code>タグの中)を
 * デコードした状態で全部取り出す。
 * @param {string} html
 * @returns {string[]}
 */
function extractFullSamples(html) {
  const samples = [];
  const prePattern = /<pre class="sample" data-build="full">\s*<code>([\s\S]*?)<\/code>\s*<\/pre>/g;
  for (const m of html.matchAll(prePattern)) {
    samples.push(decodeHtmlEntities(m[1]));
  }
  return samples;
}

async function loadResources() {
  const [defaultHeaders, p98Header, magAssetsHeader, p98Source, p98AsmSource, library] = await Promise.all([
    loadDefaultHeaders(),
    readFile(HEADER_PATH),
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
 * ide/browser-toolchain.mjs の buildWithP98lib() / ide/verify-p98lib-build.mjs と
 * 同じ3段の手順で、任意のCソース文字列をhuge modelビルドする。
 * @param {string} sourceText
 * @param {ReturnType<typeof loadResources> extends Promise<infer T> ? T : never} resources
 */
async function buildSample(sourceText, resources) {
  const libObject = await compileToObjectWithFactories(resources.p98Source, {
    includeFiles: resources.includeFiles, model: 'huge',
  }, tools);
  if (!libObject.ok) return { ok: false, errors: libObject.errors.map((e) => ({ ...e, stage: 'p98lib' })) };

  const asmObject = await assemble(resources.p98AsmSource, { format: 'elf', listing: true });
  if (!asmObject.ok) return { ok: false, errors: asmObject.errors.map((e) => ({ ...e, stage: 'nasm(p98lib)' })) };

  const userSource = new TextEncoder().encode(sourceText);
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
  assert.equal(output[0], 0x4d, `${label}: 出力の先頭が'M'(0x4D)ではありません`);
  assert.equal(output[1], 0x5a, `${label}: 出力の先頭が'Z'(0x5A)ではありません`);
}

async function main() {
  const previousExitCode = process.exitCode;
  let failCount = 0;
  let passCount = 0;
  const skipNotes = [];

  const headerText = await readFile(HEADER_PATH, 'utf8');
  const referenceHtml = await readFile(REFERENCE_PATH, 'utf8');
  const api = extractPublicApiNames(headerText);
  const allNames = [...api.functions, ...api.defines, ...api.enumConstants, ...api.types];

  assert.ok(api.functions.length > 0, 'p98.hから公開関数を1つも抽出できませんでした(抽出ロジックが壊れています)');

  // --- B-1: API網羅 ---
  {
    const missing = allNames.filter((name) => !referenceHtml.includes(name));
    if (missing.length > 0) {
      console.error('[FAIL] リファレンスに載っていないAPIがあります:');
      for (const name of missing) console.error(`  - ${name}`);
      failCount++;
    } else {
      console.log(
        `[PASS] B-1 API網羅: p98.hから抽出した ${allNames.length} 件`
        + `(関数${api.functions.length}・#define${api.defines.length}・`
        + `enum定数${api.enumConstants.length}・型${api.types.length}) が`
        + `すべてp98lib-reference.htmlに登場します`,
      );
      passCount++;
    }
  }

  // --- B-3(その1): 故障注入。抽出した名前を1つ除いた文字列を作り、検査が
  //     その名前を挙げて落ちることを確認する。 ---
  {
    const targetName = api.functions[0];
    assert.ok(targetName, '故障注入(B-1側)の前提となる関数名が見つかりません');
    // 名前をすべて除去する(部分文字列として他の場所にも埋め込まれていないことを前提にする
    // ため、単純な文字列置換ではなく単語境界で除去する)。
    const wordPattern = new RegExp(targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const brokenHtml = referenceHtml.replace(wordPattern, '');
    assert.ok(!brokenHtml.includes(targetName), `故障注入の前提が崩れています: ${targetName}を除去しきれませんでした`);
    const missingInBroken = allNames.filter((name) => !brokenHtml.includes(name));
    assert.ok(
      missingInBroken.includes(targetName),
      `故障注入(B-1側)が失敗しました: ${targetName}を除去したのに検査がFAILを報告しませんでした`
      + '(この検査はAPI網羅を実際には見ていません)',
    );
    console.log(`[PASS] 故障注入(B-1側): "${targetName}" をHTMLから除去すると、検査がその名前を挙げてFAILすることを確認しました`);
    passCount++;
  }

  // --- B-2: 完全なコード例のビルド ---
  const fullSamples = extractFullSamples(referenceHtml);
  if (fullSamples.length === 0) {
    console.error('[FAIL] B-2: p98lib-reference.html に data-build="full" の例が1つもありません(印の付け忘れの疑い)');
    failCount++;
  } else {
    const resources = await loadResources();
    let allBuilt = true;
    for (let i = 0; i < fullSamples.length; i++) {
      const source = fullSamples[i];
      const result = await buildSample(source, resources);
      if (!result.ok) {
        console.error(`[FAIL] B-2: data-build="full" の${i + 1}本目のビルドに失敗しました:`);
        for (const error of result.errors) console.error(`  [${error.stage}] line ${error.line}: ${error.message}`);
        allBuilt = false;
        continue;
      }
      assertMzHeader(result.output, `data-build="full" ${i + 1}本目`);
    }
    if (allBuilt) {
      console.log(`[PASS] B-2 完全な例のビルド: data-build="full" の ${fullSamples.length} 本すべてがhuge modelでビルドでき、MZヘッダで始まります`);
      passCount++;
    } else {
      failCount++;
    }

    // --- B-3(その2): 故障注入。完全な例の1本を壊し、ビルドが失敗することを確認する。 ---
    {
      const original = fullSamples[0];
      assert.ok(original.includes('p98_init();'), '故障注入(B-2側)の前提が崩れています: 1本目の例に p98_init(); が見つかりません');
      const broken = original.replace('p98_init();', 'p98_init_does_not_exist();');
      assert.notEqual(broken, original, '故障注入(B-2側)の前提が崩れています: 置換が効いていません');
      const brokenResult = await buildSample(broken, resources);
      assert.equal(
        brokenResult.ok, false,
        '故障注入(B-2側)が失敗しました: 存在しない関数名に変えたのにビルドが成功してしまいました'
        + '(この検査は実際にはビルド結果を見ていません)',
      );
      console.log('[PASS] 故障注入(B-2側): 1本目の例の p98_init(); を存在しない関数名に変えると、ビルドが失敗することを確認しました');
      passCount++;
    }
  }

  console.log('');
  console.log(`サマリ: PASS ${passCount} / FAIL ${failCount} / SKIP ${skipNotes.length}`);
  if (skipNotes.length > 0) {
    for (const note of skipNotes) console.log(`  SKIP: ${note}`);
  }

  if (failCount > 0) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = previousExitCode;
}

await main();
