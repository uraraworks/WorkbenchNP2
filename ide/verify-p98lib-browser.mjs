#!/usr/bin/env node
// p98lib(vendor/p98lib/、経緯はREADME.md参照)のブラウザ経路そのものを検査する。
// ide/verify-p98lib-build.mjs はNode側のwasm factoryで「同じ手順・同じバイト」を
// 再現しているだけで、fetchのURL・lcdh.aの配信・ブラウザ用wasm factory・
// ide/sample-manifest.mjs の loadSample() 経由でのソース取得・
// ide/browser-toolchain.mjs の #include "p98.h" 判定の実配線は一切検査していない。
// 「Nodeで通る」と「ブラウザで通る」は別物なので、ここではpuppeteerで実ブラウザを
// 起動し、静的サーバ経由でide/browser-toolchain.mjsのbuildSource()を
// ide/sample-manifest.mjsのloadSample()が返すソースへそのまま適用して測る。
//
// このスクリプトで分かること:
//   a. vendor/p98lib配下の4ファイルとtoolchain/smlrc-wasm/lcdh.aが静的サーバから200で取れる
//   b. ide/sample-manifest.mjsのSAMPLE_FILESに載っているp98lib/hello.c・walk.c・walk2.cの
//      3本が、ide/browser-toolchain.mjsのbuildSource()経由(=IDEが実際に使う経路)で
//      ブラウザ上でビルドでき、出力がMZヘッダ(0x4D 0x5A)で始まること
//   c. #include "p98.h"を欠いたソースを渡すとp98libモードに入らず、
//      未定義シンボル(p98_init等)でリンクに失敗すること(故障注入。検査自体が
//      失敗を見逃さないことの確認)
//   d. samples/hello-c.c(small modelの通常C)がp98libモード追加後も従来通り
//      ビルドできること(非回帰)
//
// このスクリプトで分からないこと(検査の限界):
//   - 生成したMZ EXEが実機/WebNP2上で実際に正しく動作するか(画面描画・VSYNC等)は
//     一切見ていない。見ているのは「ビルドがokで、MZヘッダで始まる」ことだけ。
//   - ide/index.htmlのファイルツリーUIやサンプルクリック等のボタン操作は通っていない。
//     ここで叩いているのはbuildSource()/loadSample()というモジュール関数であり、
//     ide/workbench.jsのDOMイベント結線(クリック→openFile→buildCurrent等)は
//     ide/verify-workbench.mjs側の担当で、本スクリプトの対象外。
//   - #include "p98.h"を消した故障注入ソースが「p98libモードに入らない」ことは
//     確認するが、その結果として起こりうる失敗のバリエーション(構文エラーになるか
//     未定義シンボルでリンクに失敗するか)まではメッセージ内容を厳密比較していない。
//     ok:falseになることだけを見ている。
//
// 実行: node ide/verify-p98lib-browser.mjs

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const PORT = Number(process.env.PC98DEV_P98LIB_PORT ?? 5189);
const HARNESS_PATH = '/ide/verify-p98lib-browser-harness.html';
const BASE_URL = `http://127.0.0.1:${PORT}${HARNESS_PATH}`;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const require = createRequire(import.meta.url);

async function loadPuppeteer() {
  try { return (await import('puppeteer-core')).default; }
  catch { return createRequire(new URL('../../WebNP2/package.json', import.meta.url))('puppeteer-core'); }
}

// harnessはide/以下の実ファイルではなく、静的サーバがその場で返すインラインHTML。
// ide/browser-toolchain.mjs・ide/sample-manifest.mjsをそのままモジュールimportし、
// wasm factoryはide/index.htmlと同じ3本のscriptタグで読む(新しい読み込み方を作らない)。
const HARNESS_HTML = `<!doctype html>
<html><body>
<script src="../toolchain/nasm-wasm/nasm.js"></script>
<script src="../toolchain/smlrc-wasm/smlrpp.js"></script>
<script src="../toolchain/smlrc-wasm/smlrc.js"></script>
<script src="../toolchain/smlrc-wasm/smlrl.js"></script>
<script type="module">
import { buildSource } from './browser-toolchain.mjs';
import { SAMPLE_FILES, loadSample } from './sample-manifest.mjs';

window.p98libBrowserProbe = {
  buildSource,
  loadSample,
  sampleFiles: SAMPLE_FILES,
  ready: true,
};
</script>
</body></html>`;

function startServer() {
  return new Promise((resolveStart, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname === HARNESS_PATH) {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(HARNESS_HTML);
          return;
        }
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const file = resolve(ROOT, `.${pathname}`);
        if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) { response.writeHead(403).end(); return; }
        const body = await readFile(file);
        const types = {
          '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
          '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
          '.asm': 'text/plain; charset=utf-8', '.c': 'text/plain; charset=utf-8',
          '.h': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
          '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
          '.wasm': 'application/wasm',
        };
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404).end('not found'); }
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolveStart(server));
  });
}

async function main() {
  const puppeteer = await loadPuppeteer();
  const server = await startServer();
  const profile = await mkdtemp(`${tmpdir()}/pc98dev-p98lib-browser-`);
  let browser;
  const results = [];
  const record = (ok, label) => {
    results.push({ ok, label });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}`);
  };

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME, userDataDir: profile, headless: 'new',
      args: ['--hide-scrollbars'],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60_000 });
    await page.waitForFunction(() => window.p98libBrowserProbe?.ready === true, { timeout: 30_000 });
    assert.deepEqual(pageErrors, [], `harnessページ読み込み中にJSエラー: ${pageErrors.join('; ')}`);

    // --- a. 配信の検査: vendor/p98lib配下の4ファイル + lcdh.a が静的サーバから200で取れる ---
    const assetUrls = [
      '../vendor/p98lib/include/p98.h',
      '../vendor/p98lib/src/p98.c',
      '../vendor/p98lib/src/p98_asm.asm',
      '../vendor/p98lib/samples/mag_assets.h',
      '../toolchain/smlrc-wasm/lcdh.a',
    ];
    const statuses = await page.evaluate(async (urls) => {
      const out = [];
      for (const url of urls) {
        try {
          const response = await fetch(url);
          out.push({ url, status: response.status, ok: response.ok });
        } catch (error) {
          out.push({ url, status: 0, ok: false, error: String(error) });
        }
      }
      return out;
    }, assetUrls);
    for (const s of statuses) {
      try {
        assert.ok(s.ok && s.status === 200, `${s.url}が200で取得できません(status=${s.status})`);
        record(true, `a: ${s.url} が200で取得できる`);
      } catch (error) {
        record(false, `a: ${s.url} — ${error.message}`);
      }
    }

    // --- b. ブラウザでのビルド: p98lib/hello.c・walk.c・walk2.c を実経路でビルド ---
    const p98libPaths = ['p98lib/hello.c', 'p98lib/walk.c', 'p98lib/walk2.c'];
    for (const path of p98libPaths) {
      try {
        const outcome = await page.evaluate(async (targetPath) => {
          const sample = window.p98libBrowserProbe.sampleFiles.find((f) => f.path === targetPath);
          if (!sample) return { found: false };
          const text = await window.p98libBrowserProbe.loadSample(sample);
          const result = await window.p98libBrowserProbe.buildSource(sample.path, text);
          if (!result.ok) return { found: true, ok: false, errors: result.errors };
          const bytes = Array.from(result.output.slice(0, 2));
          return { found: true, ok: true, bytes };
        }, path);
        assert.ok(outcome.found, `sample-manifest.mjsに${path}が見つかりません`);
        assert.ok(outcome.ok, `${path}のブラウザビルドに失敗: ${JSON.stringify(outcome.errors)}`);
        assert.deepEqual(outcome.bytes, [0x4D, 0x5A], `${path}の出力がMZヘッダで始まりません: ${JSON.stringify(outcome.bytes)}`);
        record(true, `b: ${path} がブラウザ経路でビルドでき、MZヘッダで始まる`);
      } catch (error) {
        record(false, `b: ${path} — ${error.message}`);
      }
    }

    // --- c. 故障注入: #include "p98.h" を欠くと p98lib モードに入らずリンクに失敗する ---
    try {
      const outcome = await page.evaluate(async () => {
        const sample = window.p98libBrowserProbe.sampleFiles.find((f) => f.path === 'p98lib/hello.c');
        const original = await window.p98libBrowserProbe.loadSample(sample);
        const broken = original.replace(/^\s*#\s*include\s*"p98\.h"\s*\n/m, '');
        if (broken === original) return { removed: false };
        const result = await window.p98libBrowserProbe.buildSource('p98lib/hello-broken.c', broken);
        return { removed: true, ok: result.ok, errors: result.ok ? undefined : result.errors };
      });
      assert.ok(outcome.removed, '#include "p98.h" 行を除去できませんでした(ソースの形が想定と違う)');
      // 陽性対照: ここでok:trueが返ったら「p98libモードに入らない→リンク失敗」という
      // 想定経路を検査が見ていないことになる。SKIPにせずFAILさせる。
      assert.equal(outcome.ok, false,
        `#include "p98.h" を除去してもビルドが成功しました。故障注入が機能していません: ${JSON.stringify(outcome)}`);
      record(true, `c: #include "p98.h" 除去でp98libモードに入らずビルド失敗(想定通り): ${JSON.stringify(outcome.errors)}`);
    } catch (error) {
      record(false, `c: ${error.message}`);
    }

    // --- d. 既存経路の非回帰: samples/hello-c.c(small model)が従来通りビルドできる ---
    try {
      const outcome = await page.evaluate(async () => {
        const sample = window.p98libBrowserProbe.sampleFiles.find((f) => f.path === 'samples/hello-c.c');
        if (!sample) return { found: false };
        const text = await window.p98libBrowserProbe.loadSample(sample);
        const result = await window.p98libBrowserProbe.buildSource(sample.path, text);
        return { found: true, ok: result.ok, errors: result.ok ? undefined : result.errors };
      });
      assert.ok(outcome.found, 'sample-manifest.mjsにsamples/hello-c.cが見つかりません');
      assert.equal(outcome.ok, true, `samples/hello-c.cのビルドに失敗(非回帰崩れ): ${JSON.stringify(outcome.errors)}`);
      record(true, 'd: samples/hello-c.c(small model)が従来通りビルドできる(非回帰)');
    } catch (error) {
      record(false, `d: ${error.message}`);
    }

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
    await rm(profile, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n合計 ${results.length} 件 / PASS ${results.length - failed.length} / FAIL ${failed.length}`);
  console.log('スキップした項目: なし(a/b/c/dすべて実行)');
  if (failed.length > 0) {
    console.error('失敗した項目があります。上のFAIL行を参照してください。');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
