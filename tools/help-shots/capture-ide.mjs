// help.html 用スクリーンショット撮影: WorkbenchNP2 の IDE 画面。
// 使い方: 開発サーバー起動中に `node tools/help-shots/capture-ide.mjs [baseURL]`
//   既定 baseURL = http://127.0.0.1:5185/ide/  (ide/verify-workbench.mjs と揃えてある)
// 出力: ide/help/overview.png  起動直後。エクスプローラー展開(作業ファイル0件+サンプル一覧)
//       ide/help/run.png       サンプルを実行し、PC-98画面に出力が出ている状態
//       ide/help/debug.png     デバッグ中。ブレークポイントで停止しレジスタ/ツールバーが見える
// 前提: システムの Google Chrome を headless 起動する (puppeteer-core は WebNP2 の devDependencies)。
// WorkbenchNP2のUIは日本語のみで、姉妹プロジェクトのようにja/en 2セット撮ることはできない。
// この1セットだけをhelp.html側で日英両方のキャプションから参照する。

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5185/ide/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ide/help');

async function loadPuppeteer() {
  // ide/verify-workbench.mjs の loadPuppeteer() と同じやり方: このプロジェクトに
  // puppeteer-core は無いので、WebNP2 の devDependencies から解決する。
  try { return (await import('puppeteer-core')).default; }
  catch { return createRequire(new URL('../../../WebNP2/package.json', import.meta.url))('puppeteer-core'); }
}

await mkdir(OUT_DIR, { recursive: true });

const puppeteer = await loadPuppeteer();
const profile = await mkdtemp(`${tmpdir()}/pc98dev-help-shots-`);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  userDataDir: profile,
  headless: 'new',
  args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: 'networkidle2' });

  // ide/verify-workbench.mjs と同じ待ち方: ready → prewarm(エミュレータ起動完了)の順に待つ。
  await page.evaluate(() => window.pc98workbench.ready);
  await page.evaluate(() => window.pc98workbench.prewarm);

  // (1) overview.png — 起動直後。エクスプローラーは既定で開いている
  //     (作業ファイル0件のプレースホルダ + サンプル一覧が見える状態)。
  await page.waitForSelector('#file-tree .file-entry[data-origin="sample"]');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT_DIR, 'overview.png') });
  console.log('captured: overview.png');

  // (2) run.png — サンプルを実行し、PC-98画面に出力が出ている状態。
  const run = await page.evaluate(() => window.pc98workbench.runCurrent());
  if (!run.ok) throw new Error(`runCurrent failed: ${JSON.stringify(run)}`);
  await page.waitForFunction(
    (text) => window.pc98workbench.getScreenText().text.includes(text),
    {},
    'Hello, PC-98!',
  );
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT_DIR, 'run.png') });
  console.log('captured: run.png');

  // (3) debug.png — ブレークポイントで停止し、レジスタとデバッグツールバーが見える状態。
  // hello.asm の11行目(mov ax,4C00h)にBPを置き、デバッグ開始→続行でそこまで走らせる
  // (startDebugだけだと1命令目の手前で止まり、BP停止そのものの絵にならないため)。
  await page.evaluate(() => window.pc98workbench.toggleBreakpoint(11));
  const started = await page.evaluate(() => window.pc98workbench.startDebug());
  if (!started?.ok && started !== undefined) {
    // startDebugの戻り値仕様が変わっていても、後続のcontinueOrRunの成否で検出できるため
    // ここでは戻り値の形を厳密にassertしない。
  }
  await page.evaluate(() => window.pc98workbench.continueOrRun());
  await page.waitForFunction(() => window.pc98workbench.getDebugState().currentLine === 11);
  // サイドバーを「実行とデバッグ」ビューへ開いた状態で切り替え、レジスタ/BP一覧を見せる
  // (クリックだけだとサイドバーが畳まれたままのことがあるため、APIで直接両方指定する)。
  await page.evaluate(() => {
    window.pc98workbench.setSidebarView('debug');
    window.pc98workbench.setSidebarVisible(true);
  });
  await page.waitForSelector('#debug-panel:not([hidden])');
  // フローティングのデバッグツールバーが既定位置(#editor上端8px下)だとソース1〜2行目に
  // 被るため、エディタ右下寄りへ退避させてから撮る。値は可動域を超えるとクランプされる
  // (debugToolbarBounds())ので、大きめの値を渡して「行ける端まで」寄せれば十分。
  await page.evaluate(() => {
    window.pc98workbench.setDebugToolbarOffset(99999);
    window.pc98workbench.setDebugToolbarOffsetY(99999);
  });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT_DIR, 'debug.png') });
  console.log('captured: debug.png');
} finally {
  await browser.close();
}
