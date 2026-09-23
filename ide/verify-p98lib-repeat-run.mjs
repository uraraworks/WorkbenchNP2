#!/usr/bin/env node
// p98lib(vendor/p98lib/、経緯はvendor/p98lib/README.md参照)のIDE上での「同一DOSセッション内
// 2回連続実行」回帰検査。
//
// 背景(docs/p98lib-integration.md「検査の穴」節も参照): IDE(このWorkbenchNP2)は
// 同じFreeDOSセッションを使い回して何度もプログラムを実行する。p98lib側の
// p98_init()/p98_quit()はかつてパレットをポートから読み出して退避・書き戻す
// 実装だったが、NP2kai上ではその読み出しが選んだ番号を無視して常に同じ値を返す
// ため、書き戻しで16色が同じ値へ潰れ、2回目以降の実行で画面が一色になり
// 何も表示されなくなる不具合があった(p98libコミット7006316で修正済み)。
//
// この不具合はp98lib単体の検証(1プログラム=1回起動)では検出できず、
// 「同じセッションで2回実行する」というIDE固有の使い方で初めて露見した。
// ide/verify-p98lib-browser.mjs は#include判定・ビルド経路は検査するが、
// 実際にIDE上でプログラムを走らせて画面を見る検査は無い。ここではそこを埋め、
// 実IDE(ide/index.html)を起動し、p98lib/hello.c を同一セッションで2回連続
// 実行して、両方の実行で色5(0,7,7 → RGB (0,117,115) = #007573)の
// 200x80=16000pxの矩形が実際にcanvasへ出ることを確認する。
//
// 測り方: VRAMの生バイトではなく、canvasの実ピクセルで見る。VRAM側は
// パレット破壊の影響を受けない(パレットはVRAMの外、DAC側の状態)ため、
// VRAMバイトを見ても本不具合は検出できない(実際にp98lib側でもこの理由で
// canvasピクセル読みに切り替えた実測がある。docs/p98lib-integration.md参照)。
// canvasはWebGL(SDL2/emscripten)で描画されており、preserveDrawingBufferが
// 無いフレームバッファはフレーム外で読むと空になりうる。そこで
// requestAnimationFrameのコールバック内で2Dオフスクリーンcanvasへ
// drawImage()してからgetImageData()する(この方法で採取できることは
// 事前に実測確認済み)。
//
// 検査は2本:
//   1. 修正後の実装(vendor/p98lib、実配線)で、1回目・2回目とも矩形が出ること。
//      1回目の検出は陽性対照(検出器自体が動くこと)を兼ねる。
//   2. 故障注入: p98lib/tests/p98_broken_palette_readback.c
//      (修正前の「読み出して退避」実装に差し戻した版。vendor経由ではなく
//      ../p98lib から直接読む)へ差し替えたページで同じ手順を踏み、
//      1回目は矩形が出る(陽性対照。壊れた実装でも1回目は出ることを
//      docs/p98lib-integration.md記載の実測で確認済み)が、2回目は
//      出ないことを確認する。2回目も出てしまうなら、この検査は
//      不具合を検出できていないということなので、その場合はFAILさせる。
//
// 実行: node ide/verify-p98lib-repeat-run.mjs

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const PORT = Number(process.env.PC98DEV_P98LIB_REPEAT_PORT ?? 5192);
const BASE_URL = `http://127.0.0.1:${PORT}/ide/`;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BROKEN_P98C_PATH = resolve(ROOT, '../p98lib/tests/p98_broken_palette_readback.c');

// 色5(4bit値 0,7,7)の実測RGB。docs/p98lib-integration.md・p98lib/docs/verify-log.md参照。
const EXPECT_COLOR = '0,117,115';
const EXPECT_RECT_PIXELS = 16000; // p98lib/samples/hello.c: p98_fill_rect(100,50,200,80,5) = 200*80

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPuppeteer() {
  try { return (await import('puppeteer-core')).default; }
  catch { return createRequire(new URL('../../WebNP2/package.json', import.meta.url))('puppeteer-core'); }
}

function startServer() {
  return new Promise((resolveStart, reject) => {
    const server = createServer(async (request, response) => {
      try {
        let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
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
          '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
        };
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404).end('not found'); }
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolveStart(server));
  });
}

// canvas #screen(640x400, WebGL)の現在のフレームを、rAFコールバック内で
// 2DオフスクリーンcanvasへdrawImageしてから読む。非黒ピクセル数と、
// 一番多い非黒色(RGB文字列)・その数を返す。
async function sampleScreen(page) {
  return page.evaluate(() => new Promise((resolveSample) => {
    requestAnimationFrame(() => {
      const src = document.getElementById('screen');
      const off = document.createElement('canvas');
      off.width = src.width; off.height = src.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(src, 0, 0);
      const data = ctx.getImageData(0, 0, off.width, off.height).data;
      let nonBlack = 0;
      const counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
        if (r !== 0 || g !== 0 || b !== 0) {
          nonBlack += 1;
          const key = `${r},${g},${b}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      let topColor = null; let topCount = 0;
      for (const [key, count] of counts) if (count > topCount) { topColor = key; topCount = count; }
      resolveSample({ nonBlack, total: data.length / 4, topColor, topCount });
    });
  }));
}

// runPromise(runCurrent()のNode側Promise)が解決するまでサンプリングを続け、
// 期待する矩形(色5・16000px)を一度でも観測できたかを返す。runCurrent()は
// プログラム終了(DOSプロンプト復帰)まで解決しないため、ここではawaitせずに
// 渡してもらい、解決を待つ間ずっとポーリングする(指示のとおり)。
async function sampleDuringRun(page, runPromise, { gapMs = 120 } = {}) {
  let settled = false;
  runPromise.then(() => { settled = true; }, () => { settled = true; });
  const samples = [];
  const started = Date.now();
  while (!settled) {
    samples.push(await sampleScreen(page));
    await sleep(gapMs);
    if (Date.now() - started > 60_000) break; // runCurrent自体に60sタイムアウトがあるため、それに合わせる
  }
  samples.push(await sampleScreen(page)); // 解決直後の状態も1枚採る
  const found = samples.some((s) => s.nonBlack === EXPECT_RECT_PIXELS && s.topColor === EXPECT_COLOR);
  return { found, samples };
}

async function runHelloTwiceAndCheckRect(page, label) {
  await page.evaluate(() => window.pc98workbench.openFile('sample', 'p98lib/hello.c'));

  const run1Promise = page.evaluate(() => window.pc98workbench.runCurrent());
  const pass1 = await sampleDuringRun(page, run1Promise);
  const run1 = await run1Promise;
  assert.equal(run1.ok, true, `[${label}] 1回目のビルドに失敗: ${JSON.stringify(run1.errors ?? run1)}`);

  const run2Promise = page.evaluate(() => window.pc98workbench.runCurrent());
  const pass2 = await sampleDuringRun(page, run2Promise);
  const run2 = await run2Promise;
  assert.equal(run2.ok, true, `[${label}] 2回目のビルドに失敗: ${JSON.stringify(run2.errors ?? run2)}`);

  return { pass1, pass2 };
}

async function main() {
  const puppeteer = await loadPuppeteer();
  const server = await startServer();
  const profile = await mkdtemp(`${tmpdir()}/pc98dev-p98lib-repeat-`);
  let browser;
  const results = [];
  const record = (ok, label) => { results.push({ ok, label }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}`); };
  const skip = (label) => { results.push({ ok: true, skip: true, label }); console.log(`[SKIP] ${label}`); };

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME, userDataDir: profile, headless: 'new',
      args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
    });

    // --- 1. 修正後(vendor/p98libそのまま、実配線): 1回目・2回目とも矩形が出る ---
    {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
      await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 120_000 });
      await page.evaluate(() => window.pc98workbench.ready);
      // readyはUI初期化の完了であって、FreeDOSエンジンの起動完了ではない
      // (ide/workbench.jsのprewarmが起動完了を表す別のPromise。
      // verify-workbench.mjsも起動待ちにはprewarmを使っている)。ここを
      // 見落とすと、起動未完了のままrunCurrent()を叩いて長時間canvasが
      // 真っ黒のまま(「not booted」)になり、サンプリングが的外れになる。
      await page.evaluate(() => window.pc98workbench.prewarm);
      assert.deepEqual(pageErrors, [], `harness読み込み中にJSエラー: ${pageErrors.join('; ')}`);

      try {
        const { pass1, pass2 } = await runHelloTwiceAndCheckRect(page, '修正後');
        try {
          assert.equal(pass1.found, true, `1回目の実行中に矩形(${EXPECT_RECT_PIXELS}px, ${EXPECT_COLOR})が検出できません(検出器自体が機能していません): ${JSON.stringify(pass1.samples.slice(-3))}`);
          record(true, `修正後: 1回目の実行で矩形を検出(陽性対照)`);
        } catch (error) { record(false, `修正後: 1回目 — ${error.message}`); }
        try {
          assert.equal(pass2.found, true, `2回目の実行中に矩形(${EXPECT_RECT_PIXELS}px, ${EXPECT_COLOR})が検出できません(パレット潰れ不具合が再発している可能性): ${JSON.stringify(pass2.samples.slice(-3))}`);
          record(true, `修正後: 2回目(同一セッション内再実行)の実行でも矩形を検出`);
        } catch (error) { record(false, `修正後: 2回目 — ${error.message}`); }
      } catch (error) {
        record(false, `修正後: 実行そのものに失敗 — ${error.message}`);
      } finally {
        await page.close();
      }
    }

    // --- 2. 故障注入: p98lib/tests/p98_broken_palette_readback.c へ差し替えると、
    //     1回目は矩形が出る(陽性対照)が、2回目は出ない(検査が不具合を捉えられること)。 ---
    if (!existsSync(BROKEN_P98C_PATH)) {
      skip(`故障注入: ${BROKEN_P98C_PATH} が見つからないためスキップ(../p98libが隣に無い可能性)`);
    } else {
      const brokenSource = await readFile(BROKEN_P98C_PATH, 'utf8');
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
      // 直前のページが同じURLをキャッシュ済みだとインターセプトが素通りしうるため、
      // このページはキャッシュを無効化して確実にネットワーク経由で差し替える。
      await page.setCacheEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.url().endsWith('/vendor/p98lib/src/p98.c')) {
          req.respond({ status: 200, contentType: 'text/plain; charset=utf-8', body: brokenSource });
        } else {
          req.continue();
        }
      });
      await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 120_000 });
      await page.evaluate(() => window.pc98workbench.ready);
      await page.evaluate(() => window.pc98workbench.prewarm);
      assert.deepEqual(pageErrors, [], `harness読み込み中にJSエラー(故障注入版): ${pageErrors.join('; ')}`);

      try {
        const { pass1, pass2 } = await runHelloTwiceAndCheckRect(page, '故障注入版');
        try {
          assert.equal(pass1.found, true, `故障注入版でも1回目の実行中に矩形が検出できません(陽性対照が壊れています): ${JSON.stringify(pass1.samples.slice(-3))}`);
          record(true, `故障注入版: 1回目の実行で矩形を検出(陽性対照)`);
        } catch (error) { record(false, `故障注入版: 1回目 — ${error.message}`); }
        try {
          // ここがこの検査の本丸: 壊れた実装では2回目は矩形が出ないはず。
          // 出てしまったら、この回帰検査は不具合を検出できていないということ。
          assert.equal(pass2.found, false,
            `故障注入版なのに2回目の実行で矩形が検出されました。この回帰検査は不具合を検出できていません: ${JSON.stringify(pass2.samples.slice(-3))}`);
          record(true, `故障注入版: 2回目の実行では矩形が検出されない(想定通り。回帰検査が不具合を捉えられることを確認)`);
        } catch (error) { record(false, `故障注入版: 2回目 — ${error.message}`); }
      } catch (error) {
        record(false, `故障注入版: 実行そのものに失敗 — ${error.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
    await rm(profile, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skip);
  console.log(`\nサマリ: 失敗 ${failed.length}件 / SKIP ${skipped.length}件 / 合計 ${results.length}件`);
  if (failed.length > 0) {
    console.error('失敗した項目があります。上のFAIL行を参照してください。');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
