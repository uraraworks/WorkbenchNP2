#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const BASE_URL = process.env.PC98DEV_URL ?? 'http://127.0.0.1:5185/ide/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// スクリーンショットの出力先はリポジトリへ固定しない。PC98DEV_SHOT_DIR で差し替えられる。
const SHOT_DIR = process.env.PC98DEV_SHOT_DIR ?? `${tmpdir()}/pc98dev-shots`;
const DESKTOP_SHOT = `${SHOT_DIR}/pc98dev-workbench-desktop.png`;
const MOBILE_SHOT = `${SHOT_DIR}/pc98dev-workbench-mobile.png`;
// 同梱サンプルをhello.asm/hello-c.cの2本へ絞ったため、同一DOSセッションでの
// 再実行・終了コード伝播テストの題材(旧samples/second-run.asm)は同梱サンプルとして
// 引けなくなった。回帰シナリオ自体には価値があるので、原文をここへ直接持たせ、
// 作業ファイル(project origin)としてcreateFile()+setValue()で書いてから開く。
const SECOND_RUN_ASM_SOURCE = `; 同一DOSセッションでのデバッガローダ再実行・終了コード伝播テスト
\tCPU\t8086
\tBITS\t16
\tORG\t100h

start:
\tmov\tah,09h
\tmov\tdx,msg
\tint\t21h
\tmov\tax,4C25h
\tint\t21h

msg\tdb\t'Second debug run!', 0Dh, 0Ah, '$'
`;

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
        };
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404).end('not found'); }
    });
    server.once('error', reject);
    server.listen(5185, '127.0.0.1', () => resolveStart(server));
  });
}

function assertRun(screen, expected) {
  assert.ok(screen.text.includes(expected), `PC-98画面に${expected}がありません`);
  assert.ok(screen.lines.some((line) => line.trim() === expected), `出力行${expected}が完全一致しません`);
}

function assertErrorLine(state, expectedLine) {
  assert.ok(state.errors.length > 0, '構造化ビルドエラーがありません');
  assert.equal(state.errors[0].line, expectedLine, 'エラー行が不一致です');
}

/**
 * 指定行のgutter要素を実クリックするための画面座標を求める。y座標は行番号gutter
 * (`.cm-lineNumbers`)のテキストから該当行を特定して決め、x座標だけ`gutterSelector`側の
 * gutter幅の中心を使う。実DOMクリックで検証するのは、合成dispatchEventでは
 * domEventHandlersの当たり判定の広さそのものを確認できないため。
 */
async function gutterClickPoint(targetPage, gutterSelector, lineNumber) {
  return targetPage.evaluate(({ gutterSelector, lineNumber }) => {
    const numberEl = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
      .find((el) => el.textContent.trim() === String(lineNumber));
    if (!numberEl) return null;
    const numberRect = numberEl.getBoundingClientRect();
    const gutterRect = document.querySelector(gutterSelector).getBoundingClientRect();
    return { x: gutterRect.left + gutterRect.width / 2, y: numberRect.top + numberRect.height / 2 };
  }, { gutterSelector, lineNumber });
}

let server; let browser; let profile; let page;
try {
  if (!process.env.PC98DEV_URL) server = await startServer();
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(`${tmpdir()}/pc98dev-workbench-`);
  browser = await puppeteer.launch({
    executablePath: CHROME, userDataDir: profile, headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => window.pc98workbench.ready);
  assert.deepEqual(pageErrors, []);
  const shell = await page.evaluate(() => ({
    machineStatus: document.querySelector('#machine-status')?.textContent ?? '',
    runtimeStatusExists: Boolean(document.querySelector('#runtime-status')),
    debugStatusExists: Boolean(document.querySelector('#debug-status')),
    hasDebugPageLink: [...document.querySelectorAll('header a')]
      .some((link) => new URL(link.href).pathname.endsWith(`/debug${'.'}html`)),
    footerHrefs: [...document.querySelectorAll('footer.app-footer a')].map((link) => link.href),
    footerLinkAttrs: [...document.querySelectorAll('footer.app-footer a')].map((link) => ({
      href: link.href, target: link.target, rel: link.rel, text: link.textContent.trim(),
    })),
    footerHelpLink: (() => {
      const link = document.querySelector('.status-links a[href*="help.html"]');
      return link ? { href: link.href, target: link.target, rel: link.rel } : null;
    })(),
    headerHelpBtn: (() => {
      const link = document.querySelector('.header-help-btn');
      return link ? { href: link.href, target: link.target, rel: link.rel } : null;
    })(),
  }));
  const theme = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      editorBackground: rootStyle.getPropertyValue('--vsc-editor-bg').trim(),
      uiBackground: rootStyle.getPropertyValue('--vsc-ui-bg').trim(),
      debuggingBackground: rootStyle.getPropertyValue('--vsc-debugging').trim(),
      normalHeaderBackground: getComputedStyle(document.querySelector('.app-header')).backgroundColor,
      footerBackground: getComputedStyle(document.querySelector('footer.app-footer')).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    };
  });
  assert.ok(shell.machineStatus.trim(), 'ready直後の統合状況表示が空です');
  assert.equal(shell.runtimeStatusExists, false, '#runtime-statusが残っています');
  assert.equal(shell.debugStatusExists, false, '#debug-statusが残っています');
  assert.equal(shell.hasDebugPageLink, false, 'ヘッダに削除済みデバッガページへのリンクがあります');
  assert.equal(shell.footerHrefs.length, 8, 'フッタのリンク数（ライセンス7件+使い方1件）が8件ではありません');
  assert.ok(theme.editorBackground && theme.uiBackground && theme.debuggingBackground,
    ':rootのVS Codeテーマ変数が定義されていません');
  assert.equal(theme.normalHeaderBackground, 'rgb(12, 12, 12)', 'ヘッダ背景がWebNP2実測値ではありません');
  assert.equal(theme.footerBackground, 'rgb(24, 24, 24)', 'ステータスバー背景がVS Code配色ではありません');
  assert.equal(theme.bodyBackground, 'rgb(31, 31, 31)', 'ページ背景がVS Codeエディタ背景ではありません');
  for (const href of shell.footerHrefs) {
    const response = await fetch(href);
    assert.equal(response.status, 200, `フッタリンクがHTTP 200ではありません: ${href}`);
  }
  // フッタの全リンクは別タブで開く。同じタブで開くとエミュレータの起動状態と
  // 未保存の編集が失われるため（ライセンスリンク6本がこの不具合を持っていた実績あり）。
  for (const link of shell.footerLinkAttrs) {
    assert.equal(link.target, '_blank', `フッタリンクがtarget="_blank"ではありません: ${link.href}`);
    const relTokens = link.rel.split(/\s+/).filter(Boolean);
    assert.ok(relTokens.includes('noopener'), `フッタリンクのrelにnoopenerがありません: ${link.href}`);
    assert.ok(relTokens.includes('noreferrer'), `フッタリンクのrelにnoreferrerがありません: ${link.href}`);
  }
  // NP2kaiは実際にはMIT Licenseで配布されており(ide/core/LICENSE.NP2kai、上流もMIT宣言)、
  // フッタのラベルに誤ったGPLv2表記が再発しないことを確認する。
  const np2kaiFooterLink = shell.footerLinkAttrs.find((link) => link.href.includes('LICENSE.NP2kai'));
  assert.ok(np2kaiFooterLink, 'フッタにNP2kaiのライセンスリンクが見つかりません');
  assert.ok(!np2kaiFooterLink.text.includes('GPLv2'),
    `フッタのNP2kaiリンクのラベルに誤った"GPLv2"表記が含まれています: ${np2kaiFooterLink.text}`);
  // リポジトリ直下のLICENSE(自作コード向けMIT License)の存在と内容を確認する。
  const rootLicenseText = await readFile(resolve(ROOT, 'LICENSE'), 'utf8');
  assert.ok(rootLicenseText.includes('MIT'), 'リポジトリ直下のLICENSEに"MIT"が含まれていません');
  assert.ok(rootLicenseText.includes('URARA-works'), 'リポジトリ直下のLICENSEに"URARA-works"が含まれていません');

  // --- ヘルプへの導線: フッタ「使い方」リンクとヘッダ「?」ボタン ---
  // 両方とも help.html?lang=ja を指し、フッタの全リンク同様、別タブで開くこと
  // (エミュレータの起動状態と未保存の編集を失わないため)。
  for (const [label, link] of [['フッタの「使い方」リンク', shell.footerHelpLink], ['ヘッダの「?」ボタン', shell.headerHelpBtn]]) {
    assert.ok(link, `${label}が見つかりません`);
    assert.equal(new URL(link.href).pathname.endsWith('/help.html'), true, `${label}のhrefがhelp.htmlを指していません: ${link.href}`);
    const params = new URL(link.href).searchParams;
    assert.equal(params.get('lang'), 'ja', `${label}のhrefがlang=jaを指していません: ${link.href}`);
    // help.html側は「アプリから開かれたか」を自力で判別できない(rel="noopener noreferrer"を
    // 付けているのでopenerもreferrerも空)。アプリ側がfrom=appを明示的に渡すことで、
    // ヘルプの「アプリを開く」導線を消し、アプリのタブが2枚になるのを防いでいる。
    assert.equal(params.get('from'), 'app', `${label}のhrefにfrom=appがありません: ${link.href}`);
    assert.equal(link.target, '_blank', `${label}がtarget="_blank"ではありません`);
    const relTokens = link.rel.split(/\s+/).filter(Boolean);
    assert.ok(relTokens.includes('noopener'), `${label}のrelにnoopenerがありません`);
    assert.ok(relTokens.includes('noreferrer'), `${label}のrelにnoreferrerがありません`);
  }
  // 「?」ボタンはヘッダ内で絶対配置なので、タイトル/タグラインと実際に重なっていないかを
  // getBoundingClientRectで実測する（属性だけの存在チェックは画面外配置を見逃す実績があるため）。
  const headerOverlap = await page.evaluate(() => {
    const rectsIntersect = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const btn = document.querySelector('.header-help-btn').getBoundingClientRect();
    const title = document.querySelector('.app-header h1').getBoundingClientRect();
    const tagline = document.querySelector('.app-tagline').getBoundingClientRect();
    return {
      btnVisible: btn.width > 0 && btn.height > 0,
      overlapsTitle: rectsIntersect(btn, title),
      overlapsTagline: rectsIntersect(btn, tagline),
    };
  });
  assert.equal(headerOverlap.btnVisible, true, 'ヘッダの「?」ボタンが画面上に表示されていません（0x0またはoffscreen）');
  assert.equal(headerOverlap.overlapsTitle, false, `ヘッダの「?」ボタンがタイトルと重なっています: ${JSON.stringify(headerOverlap)}`);
  assert.equal(headerOverlap.overlapsTagline, false, `ヘッダの「?」ボタンがタグラインと重なっています: ${JSON.stringify(headerOverlap)}`);

  // --- タブ名/アイコン/タグラインの英語化（WebNP2と書式を揃える） ---
  const EXPECTED_TITLE = 'WorkbenchNP2 - PC-98 Development Environment';
  const EXPECTED_TAGLINE = 'An online workbench for PC-98 — write, run and debug in the browser';
  const branding = await page.evaluate(() => ({
    title: document.title,
    tagline: document.querySelector('.app-tagline')?.textContent ?? '',
    faviconHref: document.querySelector('link[rel="icon"]')?.href ?? null,
    headerIconWidth: document.querySelector('.app-icon')?.getBoundingClientRect().width ?? 0,
  }));
  assert.equal(branding.title, EXPECTED_TITLE, '起動直後のtitleが期待値ではありません');
  assert.equal(branding.tagline, EXPECTED_TAGLINE, 'タグラインが期待の英文ではありません');
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから戻す。
  assert.throws(() => assert.equal(branding.tagline, 'ブラウザだけで書いて、ビルドして、PC-98で動かす。'));
  assert.ok(branding.faviconHref, 'ファビコンのlink[rel="icon"]がありません');
  assert.ok(branding.headerIconWidth > 0, 'ヘッダのアイコン画像(.app-icon)が表示されていません');
  const faviconResponse = await fetch(branding.faviconHref);
  assert.equal(faviconResponse.status, 200, `ファビコンがHTTP 200ではありません: ${branding.faviconHref}`);

  await page.evaluate(() => window.pc98workbench.prewarm);
  assert.equal(await page.evaluate(() => window.pc98workbench.getMachineStatus()),
    'エミュレータ起動しました。実行の準備ができています', 'プリウォーム完了表示が不一致です');
  // 同梱コアはエミュレータ起動完了時にdocument.titleをSDLウィンドウタイトルへ直接書き換える
  // （実測: 起動完了時に1回、「Neko Project II kai + IA-32」へ）。ここが最重要の検査:
  // 起動前だけ見ても不具合は再現しないので、起動完了後のtitleを確認する。
  const afterBoot = await page.evaluate(() => ({
    title: document.title,
    overwrites: window.pc98workbench.getTitleOverwriteCount(),
  }));
  assert.ok(afterBoot.overwrites >= 1,
    'コアによるdocument.titleの書き換えが観測できていません（検査の前提が崩れています）');
  assert.equal(afterBoot.title, EXPECTED_TITLE, 'エミュレータ起動後にtitleがコアの値へ書き換わったままです');
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから戻す。
  assert.throws(() => assert.equal(afterBoot.title, 'Neko Project II kai + IA-32'));
  assert.deepEqual(await page.evaluate(() => window.pc98workbench.getState()), {
    currentPath: 'samples/hello.asm', currentOrigin: 'sample', dirty: false, errors: [], built: null,
  });
  const initialTabs = await page.evaluate(() => ({
    tabs: window.pc98workbench.getTabs(),
    rendered: document.querySelectorAll('#tab-strip .tab-item').length,
  }));
  assert.equal(initialTabs.tabs.length, 1, '初期タブが1枚ではありません');
  assert.equal(initialTabs.tabs[0].active, true, '初期タブがアクティブではありません');
  assert.equal(initialTabs.rendered, 1, '初期タブがタブ列へ1枚描画されていません');
  const initialTabId = initialTabs.tabs[0].id;
  // サイドバーの開閉はアクティビティバーに集約された（#toggle-sidebarは廃止）。
  // 開閉API自体はwb.setSidebarVisible()で直接叩き、選択中ビュー(#activity-explorerの
  // aria-selected)が可視状態の変化と無関係に保持されることも合わせて確認する。
  const sidebarVisibility = await page.evaluate(() => {
    const wb = window.pc98workbench;
    const measure = () => ({
      visible: wb.getSidebarVisible(),
      hidden: document.querySelector('#sidebar').offsetParent === null,
      explorerSelected: document.querySelector('#activity-explorer').getAttribute('aria-selected'),
    });
    const initial = measure();
    wb.setSidebarVisible(false);
    const hidden = measure();
    wb.setSidebarVisible(true);
    const restored = measure();
    return { initial, hidden, restored };
  });
  assert.deepEqual(sidebarVisibility.initial, { visible: true, hidden: false, explorerSelected: 'true' });
  assert.deepEqual(sidebarVisibility.hidden, { visible: false, hidden: true, explorerSelected: 'true' });
  assert.deepEqual(sidebarVisibility.restored, { visible: true, hidden: false, explorerSelected: 'true' });
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.deepEqual(sidebarVisibility.initial,
    { visible: false, hidden: true, explorerSelected: 'true' }));
  assert.throws(() => assert.deepEqual(sidebarVisibility.hidden,
    { visible: false, hidden: true, explorerSelected: 'false' }));
  assert.throws(() => assert.deepEqual(sidebarVisibility.restored,
    { visible: false, hidden: false, explorerSelected: 'true' }));

  // --- アクティビティバー: エクスプローラー/デバッグの2ビュー切替 ---
  const measureActivity = () => ({
    explorerSelected: document.querySelector('#activity-explorer').getAttribute('aria-selected'),
    debugSelected: document.querySelector('#activity-debug').getAttribute('aria-selected'),
    viewExplorerVisible: document.querySelector('#view-explorer').offsetParent !== null,
    viewDebugVisible: document.querySelector('#view-debug').offsetParent !== null,
    debugPanelVisible: document.querySelector('#debug-panel').offsetParent !== null,
    debugEmptyVisible: document.querySelector('#debug-empty').offsetParent !== null,
    sidebarView: window.pc98workbench.getSidebarView(),
  });
  const activityInitial = await page.evaluate(measureActivity);
  const activityInitialExpected = {
    explorerSelected: 'true', debugSelected: 'false',
    viewExplorerVisible: true, viewDebugVisible: false,
    // debug-empty/debug-panelは非表示の#view-debug配下にいるので、この時点ではどちらも不可視。
    debugPanelVisible: false, debugEmptyVisible: false, sidebarView: 'explorer',
  };
  assert.deepEqual(activityInitial, activityInitialExpected,
    '初期状態でエクスプローラービュー/デバッグ未開始表示になっていません');
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.deepEqual(activityInitial,
    { ...activityInitialExpected, viewDebugVisible: true }));

  await page.click('#activity-debug');
  const activityAfterDebugClick = await page.evaluate(() => {
    const base = {
      explorerSelected: document.querySelector('#activity-explorer').getAttribute('aria-selected'),
      debugSelected: document.querySelector('#activity-debug').getAttribute('aria-selected'),
      viewExplorerVisible: document.querySelector('#view-explorer').offsetParent !== null,
      viewDebugVisible: document.querySelector('#view-debug').offsetParent !== null,
      fileTreeHidden: document.querySelector('#file-tree').offsetParent === null,
      debugPanelVisible: document.querySelector('#debug-panel').offsetParent !== null,
      debugEmptyVisible: document.querySelector('#debug-empty').offsetParent !== null,
      sidebarView: window.pc98workbench.getSidebarView(),
      sidebarVisible: window.pc98workbench.getSidebarVisible(),
    };
    return base;
  });
  assert.deepEqual(activityAfterDebugClick, {
    explorerSelected: 'false', debugSelected: 'true',
    viewExplorerVisible: false, viewDebugVisible: true,
    fileTreeHidden: true,
    // まだデバッグを開始していないので「デバッグしていません」案内が見える側。
    debugPanelVisible: false, debugEmptyVisible: true,
    sidebarView: 'debug', sidebarVisible: true,
  }, 'デバッグアイコンのクリックでビューが切り替わりません、またはデバッグ未開始表示が不一致です');
  assert.throws(() => assert.equal(activityAfterDebugClick.fileTreeHidden, false));
  // 規律: debug-panel/debug-emptyの可視性をわざと逆にしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.deepEqual(activityAfterDebugClick,
    { ...activityAfterDebugClick, debugPanelVisible: true, debugEmptyVisible: false }));

  await page.click('#activity-debug');
  const activityHiddenBySameClick = await page.evaluate(() => ({
    sidebarVisible: window.pc98workbench.getSidebarVisible(),
    sidebarHidden: document.querySelector('#sidebar').offsetParent === null,
    debugSelected: document.querySelector('#activity-debug').getAttribute('aria-selected'),
  }));
  assert.deepEqual(activityHiddenBySameClick,
    { sidebarVisible: false, sidebarHidden: true, debugSelected: 'true' },
    '選択中アイコンの再クリックでサイドバーが隠れないか、選択状態が失われました');
  assert.throws(() => assert.equal(activityHiddenBySameClick.debugSelected, 'false'));

  await page.click('#activity-debug');
  const activityShownBySameClick = await page.evaluate(() => ({
    sidebarVisible: window.pc98workbench.getSidebarVisible(),
    sidebarHidden: document.querySelector('#sidebar').offsetParent === null,
    debugSelected: document.querySelector('#activity-debug').getAttribute('aria-selected'),
  }));
  assert.deepEqual(activityShownBySameClick,
    { sidebarVisible: true, sidebarHidden: false, debugSelected: 'true' },
    '選択中アイコンの再クリックでサイドバーが再表示されません');

  await page.click('#activity-explorer');
  const activityBackToExplorer = await page.evaluate(measureActivity);
  assert.deepEqual(activityBackToExplorer, activityInitialExpected,
    'エクスプローラーアイコンのクリックで元のビューへ戻りません');

  const initialTree = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('#file-tree .file-group-heading')].map((node) => node.textContent),
    samples: document.querySelectorAll('#file-tree .file-entry[data-origin="sample"]').length,
    workEmptyPlaceholder: document.querySelector('#file-tree .file-group')?.querySelector('.file-group-empty')?.textContent,
    sampleEntryText: document.querySelector('#file-tree .file-entry[data-origin="sample"][data-path="samples/hello.asm"]')?.textContent,
  }));
  assert.deepEqual(initialTree.groups, ['作業ファイル — このブラウザに保存', 'サンプル — 読み取り専用'],
    '起動直後の保存先グループ(0件でも表示)とサンプルグループの構成が不一致です');
  assert.equal(initialTree.workEmptyPlaceholder, 'まだありません。＋ で作成するとここに入ります',
    '0件の作業ファイルグループにプレースホルダ行がありません');
  assert.ok(initialTree.samples > 1, '同梱サンプルがファイルツリーへ出ていません');
  assert.equal(initialTree.sampleEntryText, 'hello.asm', 'サンプルのエントリ表示がbasenameになっていません');
  await page.click('#file-tree .file-entry[data-origin="sample"][data-path="samples/hello-c.c"]');
  await page.waitForFunction(() => window.pc98workbench.getState().currentPath === 'samples/hello-c.c');
  const selectedTreeEntry = await page.evaluate(() => ({
    tabs: window.pc98workbench.getTabs(),
    selectedPath: document.querySelector('#file-tree .file-entry[aria-selected="true"]')?.dataset.path,
  }));
  assert.equal(selectedTreeEntry.tabs.length, 2, 'ファイルツリーのクリックでタブが開きません');
  assert.equal(selectedTreeEntry.selectedPath, 'samples/hello-c.c', '開いたファイルがツリーで選択されません');
  const switchedTreeEntry = await page.evaluate((id) => {
    window.pc98workbench.activateTab(id);
    return document.querySelector('#file-tree .file-entry[aria-selected="true"]')?.dataset.path;
  }, initialTabId);
  assert.equal(switchedTreeEntry, 'samples/hello.asm', 'タブ切替へファイルツリーの選択が追従しません');
  await page.evaluate(async () => {
    const extra = window.pc98workbench.getTabs().find((tab) => tab.path === 'samples/hello-c.c');
    await window.pc98workbench.closeTab(extra.id);
  });
  const toolButtonIds = [
    'run', 'debug', 'debug-continue', 'debug-step-over', 'debug-step-into',
    'debug-step-instruction', 'debug-restart', 'debug-stop',
  ];
  // Step14でデバッグ用の6ボタン(#debug-actions)はフローティング化のため.editor-toolbarの
  // 外(.editor-cardの直接の子)へ移設された。build/debug両方とも.tool-groupは共通なので、
  // そちらを基準に9ボタンを拾う(移し替え。削除ではない)。
  const readToolbar = () => page.$$eval('.tool-group button', (buttons) => buttons.map((button) => {
    const svg = button.querySelector('svg');
    return {
      id: button.id, disabled: button.disabled, title: button.title,
      ariaLabel: button.getAttribute('aria-label'), insideToolbar: Boolean(button.closest('.tool-group')),
      hasSvg: Boolean(svg), svgWidth: svg?.getBoundingClientRect().width ?? 0,
      text: button.textContent.trim(),
    };
  }));
  const normalToolbar = await readToolbar();
  const normalToolbarMode = await page.evaluate(() => ({
    mode: window.pc98workbench.getToolbarMode(),
    buildHidden: document.querySelector('#build-actions').hidden,
    debugHidden: document.querySelector('#debug-actions').hidden,
    buildWidth: document.querySelector('#build-actions').getBoundingClientRect().width,
  }));
  assert.deepEqual(normalToolbar.map((button) => button.id), toolButtonIds, 'ツールバーの8ボタン構成が不一致です');
  assert.ok(normalToolbar.every((button) => button.title && button.ariaLabel), 'ツールバーに説明の無いアイコンがあります');
  assert.ok(normalToolbar.every((button) => button.title === button.ariaLabel), 'titleとaria-labelの説明が一致しません');
  assert.ok(normalToolbar.every((button) => button.insideToolbar && button.hasSvg && button.text === ''),
    'SVGだけを本文に持つツールバーボタンではありません');
  assert.deepEqual({
    mode: normalToolbarMode.mode, buildHidden: normalToolbarMode.buildHidden,
    debugHidden: normalToolbarMode.debugHidden,
  }, { mode: 'build', buildHidden: false, debugHidden: true });
  assert.ok(normalToolbarMode.buildWidth > 0, '通常モードのビルド操作が可視ではありません');

  const output = 'Workbench edit!';
  await page.evaluate((text) => {
    const source = window.pc98workbench.getValue().replace('Hello, PC-98!', text);
    window.pc98workbench.setValue(source);
  }, output);
  assert.equal((await page.evaluate(() => window.pc98workbench.getState())).dirty, true);
  assert.deepEqual(await page.evaluate(() => ({
    inFooter: Boolean(document.querySelector('footer.app-footer #save-state')),
    dirty: document.querySelector('#save-state').classList.contains('dirty'),
  })), { inFooter: true, dirty: true }, 'ステータスバーへ未保存状態が反映されません');
  await page.evaluate(() => window.pc98workbench.saveFile());
  const files = await page.evaluate(() => window.pc98workbench.listProjectFiles());
  // サンプルの保存は複製元のsamples/hello.asmではなくbasenameのhello.asmへ入る
  // (エクスプローラーに同名が2箇所並ぶのを避けるため)。
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'hello.asm', 'サンプル保存の保存先パスがbasenameになっていません');
  assert.ok(files[0].content.includes(output));
  assert.equal((await page.evaluate(() => window.pc98workbench.getState())).currentPath, 'hello.asm',
    'サンプル保存後、開いているタブのpathがbasenameへ揃っていません');
  assert.deepEqual(await page.$$eval('#file-tree .file-group-heading', (nodes) => nodes.map((node) => node.textContent)),
    ['作業ファイル — このブラウザに保存', 'サンプル — 読み取り専用'], 'ファイルツリーが2グループ(作業ファイル+サンプル)ではありません');

  const beforeBuildStatus = await page.evaluate(() => window.pc98workbench.getMachineStatus());
  const firstBuild = await page.evaluate(() => window.pc98workbench.buildCurrent());
  assert.equal(firstBuild.ok, true, JSON.stringify(firstBuild.errors));
  const afterBuildStatus = await page.evaluate(() => window.pc98workbench.getMachineStatus());
  assert.notEqual(afterBuildStatus, beforeBuildStatus, 'ビルド後に統合状況表示が変化しません');
  assert.equal(afterBuildStatus, 'ビルド完了。実行できます');

  // --- BP当たり判定: 行番号gutter(.cm-lineNumbers)のクリックでもBPをトグルできる ---
  // 「BP用gutterが狭くて当てにくい」というフィードバックへの対応。実DOMクリックで検証する。
  const debuggableLine = 11; // hello.asm: mov ax,4C00h（生成アドレスあり）
  const nonDebuggableLine = 1; // hello.asm: コメント行（生成アドレスなし）
  const lineNumberPoint = await gutterClickPoint(page, '.cm-lineNumbers', debuggableLine);
  const bpGutterPoint = await gutterClickPoint(page, '.cm-breakpoint-gutter', debuggableLine);
  const rejectPoint = await gutterClickPoint(page, '.cm-lineNumbers', nonDebuggableLine);
  assert.ok(lineNumberPoint && bpGutterPoint && rejectPoint, 'gutterクリック座標の算出に失敗しました');

  const beforeAnyClick = await page.evaluate(() => window.pc98workbench.getEditorMarks().breakpointDots);
  assert.equal(beforeAnyClick, 0, 'クリック検証開始前にBPが残っています');

  await page.mouse.click(lineNumberPoint.x, lineNumberPoint.y);
  const afterLineNumberAdd = await page.evaluate(() => ({
    dots: window.pc98workbench.getEditorMarks().breakpointDots,
    list: window.pc98workbench.getBreakpointList(),
  }));
  assert.equal(afterLineNumberAdd.dots, 1, '行番号gutterクリックでBP印が付きません');
  assert.deepEqual(afterLineNumberAdd.list, [{ line: debuggableLine, label: `hello.asm:${debuggableLine}` }],
    '行番号gutterクリックでBP一覧が更新されません');
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから戻す。
  assert.throws(() => assert.equal(afterLineNumberAdd.dots, 0));

  await page.mouse.click(lineNumberPoint.x, lineNumberPoint.y);
  const afterLineNumberRemove = await page.evaluate(() => window.pc98workbench.getEditorMarks().breakpointDots);
  assert.equal(afterLineNumberRemove, 0, '行番号gutterの再クリックでBPが解除されません');

  // 回帰: BP用gutター(.cm-breakpoint-gutter)自体のクリックも従来どおり効くこと。
  await page.mouse.click(bpGutterPoint.x, bpGutterPoint.y);
  const afterBpGutterAdd = await page.evaluate(() => window.pc98workbench.getEditorMarks().breakpointDots);
  assert.equal(afterBpGutterAdd, 1, 'BP用gutterのクリックが効きません（回帰）');
  await page.mouse.click(bpGutterPoint.x, bpGutterPoint.y);
  const afterBpGutterRemove = await page.evaluate(() => window.pc98workbench.getEditorMarks().breakpointDots);
  assert.equal(afterBpGutterRemove, 0, 'BP用gutterの再クリックでBPが解除されません（回帰）');

  // 生成アドレスの無い行では、行番号クリックでもBPを張れない（拒否挙動は変えない）。
  await page.mouse.click(rejectPoint.x, rejectPoint.y);
  const afterRejectClick = await page.evaluate(() => ({
    dots: window.pc98workbench.getEditorMarks().breakpointDots,
    list: window.pc98workbench.getBreakpointList(),
  }));
  assert.equal(afterRejectClick.dots, 0, '生成アドレスの無い行に行番号クリックでBPが張られました');
  assert.deepEqual(afterRejectClick.list, [], '生成アドレスの無い行のBPが一覧に現れています');
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから戻す。
  assert.throws(() => assert.equal(afterRejectClick.dots, 1));

  const run = await page.evaluate(() => window.pc98workbench.runCurrent());
  assert.equal(run.ok, true);
  assert.equal(run.dosName, 'HELLO.COM');
  assertRun(run.screen, output);
  assert.throws(() => assertRun(run.screen, 'Workbench typo!'));

  // 連続実行の区切り: 2回目のコマンド行の直前に、空のプロンプト行が2本以上あること。
  const secondRun = await page.evaluate(() => window.pc98workbench.runCurrent());
  assertRun(secondRun.screen, output);
  const commandRows = secondRun.screen.lines
    .map((line, index) => [line.trim(), index])
    .filter(([line]) => line.endsWith(`B:\\${run.dosName}`))
    .map(([, index]) => index);
  assert.ok(commandRows.length >= 2, `実行コマンド行が2本ありません: ${JSON.stringify(commandRows)}`);
  let separators = 0;
  for (let row = commandRows.at(-1) - 1; row >= 0; row--) {
    if (!/^[A-Z]:\\?>$/i.test(secondRun.screen.lines[row].trim())) break;
    separators += 1;
  }
  assert.ok(separators >= 2,
    `連続実行の区切り行が2本未満です: ${separators}本 / ${JSON.stringify(secondRun.screen.lines.slice(-8))}`);

  // --- 複数ファイルタブ: 本文・dirty・BPをファイル単位で保持する ---
  const tabFixture = await page.evaluate(async (secondSource) => {
    const wb = window.pc98workbench;
    const source = wb.getValue();
    const first = wb.getTabs().find((tab) => tab.active);
    await wb.createFile('second-run.asm');
    wb.setValue(secondSource);
    await wb.saveFile(); // 未編集状態から始めたいので、テンプレ→本文書き込みぶんはここで保存して消す。
    const second = wb.getTabs().find((tab) => tab.active);
    const countBeforeDuplicate = wb.getTabs().length;
    await wb.openFile('project', 'second-run.asm');
    const countAfterDuplicate = wb.getTabs().length;

    wb.activateTab(first.id);
    wb.setValue(`${source}\n; tab retention`);
    wb.activateTab(second.id);
    const whileSecond = wb.getTabs();
    wb.activateTab(first.id);
    const retained = wb.getValue();
    const dirtyPresentation = [...document.querySelectorAll('#tab-strip .tab-item')].map((item) => ({
      id: Number(item.querySelector('.tab').dataset.tabId),
      dirty: !item.querySelector('.tab-dirty').hidden,
    }));
    wb.setValue(source);
    await wb.buildCurrent();
    wb.toggleBreakpoint(11);
    wb.activateTab(second.id);
    const secondMarks = wb.getEditorMarks();
    wb.activateTab(first.id);
    const firstMarks = wb.getEditorMarks();
    const withBreakpoints = wb.getTabs();
    wb.toggleBreakpoint(11);

    wb.activateTab(second.id);
    wb.setValue(`${wb.getValue()}\n; unsaved close`);
    wb.setConfirm(() => false);
    const cancelled = await wb.closeTab(second.id);
    const afterCancel = wb.getTabs();
    wb.setConfirm(() => true);
    const closed = await wb.closeTab(second.id);
    wb.setConfirm((message) => window.confirm(message));
    return {
      first, second, countBeforeDuplicate, countAfterDuplicate, whileSecond, retained,
      dirtyPresentation, secondMarks, firstMarks, withBreakpoints,
      cancelled, afterCancel, closed, afterClose: wb.getTabs(),
      renderedAfterClose: document.querySelectorAll('#tab-strip .tab-item').length,
      lastCloseDisabled: document.querySelector('#tab-strip .tab-close').disabled,
    };
  }, SECOND_RUN_ASM_SOURCE);
  assert.equal(tabFixture.countBeforeDuplicate, 2, '別ファイルを開いてもタブが2枚になりません');
  assert.equal(tabFixture.countAfterDuplicate, 2, '同じファイルを再度開いてタブが増えました');
  assert.equal(tabFixture.whileSecond.find((tab) => tab.id === tabFixture.first.id).dirty, true,
    'タブAの未保存状態が保持されません');
  assert.equal(tabFixture.whileSecond.find((tab) => tab.id === tabFixture.second.id).dirty, false,
    '編集していないタブBがdirtyです');
  assert.ok(tabFixture.retained.endsWith('; tab retention'), 'タブ切替後にタブAの編集内容が失われました');
  assert.deepEqual(tabFixture.dirtyPresentation.filter((tab) => tab.dirty).map((tab) => tab.id),
    [tabFixture.first.id], 'dirty印がタブAだけに表示されていません');
  assert.equal(tabFixture.secondMarks.breakpointDots, 0, 'タブBへタブAのBP印が漏れました');
  assert.equal(tabFixture.firstMarks.breakpointDots, 1, 'タブAへ戻ってもBP印が復元されません');
  assert.deepEqual(tabFixture.withBreakpoints.find((tab) => tab.id === tabFixture.first.id).breakpoints, [11]);
  assert.deepEqual(tabFixture.withBreakpoints.find((tab) => tab.id === tabFixture.second.id).breakpoints, []);
  assert.equal(tabFixture.cancelled, false, '未保存タブの閉じる操作がキャンセルされません');
  assert.equal(tabFixture.afterCancel.length, 2, 'キャンセルした未保存タブが閉じられました');
  assert.equal(tabFixture.closed, true, '確認後も未保存タブを閉じられません');
  assert.equal(tabFixture.afterClose.length, 1, 'タブを閉じても最後の1枚だけになりません');
  assert.equal(tabFixture.afterClose[0].active, true, '残ったタブがアクティブではありません');
  assert.equal(tabFixture.renderedAfterClose, 1, '閉じたタブがDOMに残っています');
  assert.equal(tabFixture.lastCloseDisabled, true, '最後の1枚の閉じるボタンが無効ではありません');

  const splitterMeta = await page.$eval('#splitter', (node) => ({
    role: node.getAttribute('role'), orientation: node.getAttribute('aria-orientation'),
    ariaLabel: node.getAttribute('aria-label'), title: node.title,
  }));
  assert.equal(splitterMeta.role, 'separator');
  assert.equal(splitterMeta.orientation, 'vertical');
  assert.ok(splitterMeta.ariaLabel && splitterMeta.title, 'スプリッタに説明がありません');

  const splitEqual = await page.evaluate(() => {
    const wb = window.pc98workbench;
    const initial = wb.getSplit();
    wb.setEditorWidth(initial.minEditorWidth);
    return { ...wb.getSplit(), scaling: wb.getScreenScaling() };
  });
  assert.ok(splitEqual.screenScale >= 1,
    `エディタ最小幅でPC-98画面が等倍に届きません: x${splitEqual.screenScale}`);
  assert.ok(splitEqual.screenWidth >= 640,
    `エディタ最小幅でPC-98画面が640pxに届きません: ${splitEqual.screenWidth}px`);

  const splitWide = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setEditorWidth(900);
    return { ...wb.getSplit(), scaling: wb.getScreenScaling() };
  });
  assert.ok(splitWide.editorWidth > splitEqual.editorWidth, '指定してもエディタ幅が広がりません');
  assert.ok(splitWide.screenScale < 1, 'エディタを広げてもPC-98画面が縮小されません');
  assert.equal(splitWide.scaling.smoothed, true, 'PC-98画面の縮小時に補間されません');

  const splitClamp = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setEditorWidth(10);
    const low = wb.getSplit();
    wb.setEditorWidth(99999);
    const high = wb.getSplit();
    return { low, high };
  });
  // 画面幅が狭い環境でもPC-98画面を等倍まで広げられるよう、縮める側は止めない。
  assert.ok(Math.abs(splitClamp.low.editorWidth - 10) <= 1,
    `エディタ幅を10pxまで縮められません: ${JSON.stringify(splitClamp.low)}`);
  assert.equal(splitClamp.low.minEditorWidth, 0, 'エディタ幅に下限が残っています');
  assert.ok(Math.abs(splitClamp.high.editorWidth - splitClamp.high.maxEditorWidth) <= 1,
    'エディタ幅が上限へ丸められません');

  const splitKeyboardBefore = await page.evaluate(() => {
    const wb = window.pc98workbench;
    const limits = wb.getSplit();
    wb.setEditorWidth((limits.minEditorWidth + limits.maxEditorWidth) / 2);
    return {
      split: wb.getSplit(), screen: wb.getScreenText().text,
      stored: localStorage.getItem('pc98dev:split-editor'),
    };
  });
  assert.ok(splitKeyboardBefore.stored, 'エディタ幅がlocalStorageへ保存されません');
  await page.focus('#splitter');
  await page.keyboard.press('ArrowLeft');
  const splitKeyboardAfter = await page.evaluate(() => ({
    split: window.pc98workbench.getSplit(), screen: window.pc98workbench.getScreenText().text,
  }));
  assert.ok(Math.abs(splitKeyboardAfter.split.editorWidth
    - (splitKeyboardBefore.split.editorWidth - 16)) <= 1, 'ArrowLeftで幅が16px減りません');
  assert.equal(splitKeyboardAfter.screen, splitKeyboardBefore.screen, 'スプリッタの矢印キーがゲストへ漏れました');
  await page.keyboard.press('Home');
  const splitHome = await page.evaluate(() => ({
    split: window.pc98workbench.getSplit(), stored: localStorage.getItem('pc98dev:split-editor'),
  }));
  assert.equal(splitHome.stored, null, 'Homeで保存済みエディタ幅が消えません');

  const splitSwapped = await page.evaluate(() => {
    const wb = window.pc98workbench;
    const limits = wb.getSplit();
    wb.setEditorWidth((limits.minEditorWidth + limits.maxEditorWidth) / 2);
    const before = wb.getSplit();
    wb.setPanesSwapped(true);
    const after = wb.getSplit();
    wb.setPanesSwapped(false);
    wb.setEditorWidth(null);
    return { before, after };
  });
  assert.ok(Math.abs(splitSwapped.after.editorWidth - splitSwapped.before.editorWidth) <= 1,
    'ペイン入替後に指定したエディタ幅が維持されません');

  const maximized = await page.evaluate(() => {
    const wb = window.pc98workbench;
    const measure = () => ({
      editorWidth: document.querySelector('.editor-card').getBoundingClientRect().width,
      machineWidth: document.querySelector('.machine-card').getBoundingClientRect().width,
      editorHidden: document.querySelector('.editor-card').offsetParent === null,
      machineHidden: document.querySelector('.machine-card').offsetParent === null,
      sidebarHidden: document.querySelector('#sidebar').offsetParent === null,
      activityHidden: document.querySelector('#activity-bar').offsetParent === null,
      splitterHidden: document.querySelector('#splitter').offsetParent === null,
      editorPressed: document.querySelector('#maximize-editor').getAttribute('aria-pressed'),
      machinePressed: document.querySelector('#maximize-machine').getAttribute('aria-pressed'),
    });
    const normal = measure();
    wb.setMaximizedPane('editor');
    const editor = { pane: wb.getMaximizedPane(), ...measure() };
    wb.setMaximizedPane('machine');
    const machine = { pane: wb.getMaximizedPane(), ...measure() };
    wb.setMaximizedPane(null);
    const restored = { pane: wb.getMaximizedPane(), ...measure() };
    return { normal, editor, machine, restored };
  });
  assert.equal(maximized.editor.pane, 'editor');
  assert.equal(maximized.editor.machineHidden, true, 'エディタ最大化時もPC-98カードが見えています');
  assert.equal(maximized.editor.sidebarHidden, true, 'エディタ最大化時もサイドバーが見えています');
  assert.equal(maximized.editor.activityHidden, true, 'エディタ最大化時もアクティビティバーが見えています');
  assert.equal(maximized.editor.splitterHidden, true, 'エディタ最大化時もスプリッタが見えています');
  assert.ok(maximized.editor.editorWidth > maximized.normal.editorWidth, 'エディタ最大化時に幅が広がりません');
  assert.deepEqual([maximized.editor.editorPressed, maximized.editor.machinePressed], ['true', 'false']);
  assert.equal(maximized.machine.pane, 'machine');
  assert.equal(maximized.machine.editorHidden, true, 'PC-98最大化時もエディタカードが見えています');
  assert.equal(maximized.machine.sidebarHidden, true, 'PC-98最大化時もサイドバーが見えています');
  assert.equal(maximized.machine.activityHidden, true, 'PC-98最大化時もアクティビティバーが見えています');
  assert.equal(maximized.machine.splitterHidden, true, 'PC-98最大化時もスプリッタが見えています');
  assert.ok(maximized.machine.machineWidth > maximized.normal.machineWidth, 'PC-98最大化時に幅が広がりません');
  assert.deepEqual([maximized.machine.editorPressed, maximized.machine.machinePressed], ['false', 'true']);
  assert.equal(maximized.restored.pane, null);
  assert.deepEqual([
    maximized.restored.editorHidden, maximized.restored.machineHidden,
    maximized.restored.sidebarHidden, maximized.restored.activityHidden,
    maximized.restored.splitterHidden,
    maximized.restored.editorPressed, maximized.restored.machinePressed,
  ], [false, false, false, false, false, 'false', 'false'], '最大化解除後にサイドバー・アクティビティバー・スプリッタ・両ペインが復帰しません');
  // 規律: わざとactivityHiddenの期待をfalseにしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.equal(maximized.editor.activityHidden, false));

  const guardedSource = await page.evaluate(() => ({
    source: window.pc98workbench.getValue(), screen: window.pc98workbench.getScreenText().text,
    targets: window.pc98workbench.getGuardedKeyboardTargets(),
  }));
  assert.deepEqual(guardedSource.targets,
    ['.sidebar', '.editor-card', '.debug-panel', '.splitter', '.disassembly-splitter']);
  await page.click('#editor .cm-content');
  await page.keyboard.type('QQQ');
  const editorGuard = await page.evaluate(() => ({
    source: window.pc98workbench.getValue(), screen: window.pc98workbench.getScreenText().text,
  }));
  assert.notEqual(editorGuard.source, guardedSource.source, '実キー入力がエディタへ届きません');
  assert.equal(editorGuard.screen, guardedSource.screen, 'エディタへの実キー入力がゲスト画面を変えました');
  assert.ok(!editorGuard.screen.toLowerCase().includes('qqq'), 'エディタのQQQがゲストへ漏れました');
  await page.evaluate((source) => window.pc98workbench.setValue(source), guardedSource.source);

  // Tabは行頭の字下げではなくカーソル位置への本物のタブ挿入。アセンブラのコメント桁揃え用。
  const beforeTab = await page.evaluate(() => window.pc98workbench.getValue());
  await page.evaluate(() => {
    const line = window.pc98workbench.getValue().split('\n')[7];
    window.pc98workbench.setCursorToLineEnd(8);
    return line;
  });
  await page.keyboard.press('Tab');
  await page.keyboard.type('; comment');
  const tabbed = await page.evaluate(() => ({
    line: window.pc98workbench.getValue().split('\n')[7],
    tabSize: getComputedStyle(document.querySelector('.cm-content')).tabSize,
    cursor: (() => {
      const node = document.querySelector('.cm-cursor-primary, .cm-cursor');
      const style = node && getComputedStyle(node);
      return style ? { display: style.display, color: style.borderLeftColor } : null;
    })(),
  }));
  assert.equal(tabbed.line, '\tmov\tah,09h\t; comment',
    `Tabがカーソル位置へタブを挿入していません: ${JSON.stringify(tabbed.line)}`);
  assert.ok(!tabbed.line.startsWith('  '), 'Tabが行頭を字下げしています（indentWithTabに戻っています）');
  assert.equal(tabbed.tabSize, '8', 'タブ幅が8桁ではありません');
  // drawSelection()は素のcaretを消して自前で描くので、その描画色が背景と同化していないか見る。
  assert.equal(tabbed.cursor?.display, 'block', 'エディタのカーソルが描画されていません');
  assert.notEqual(tabbed.cursor?.color, 'rgb(0, 0, 0)', 'カーソル色が黒のままで暗色背景に埋もれます');
  await page.evaluate((source) => window.pc98workbench.setValue(source), beforeTab);

  // --- 新規作成ポップアップ: 既定は非表示、#new-fileボタンで開くと入力へフォーカスする ---
  const popupInitiallyHidden = await page.$eval('#new-file-popup', (node) => node.hidden);
  assert.equal(popupInitiallyHidden, true, '新規作成ポップアップが既定で非表示ではありません');
  await page.click('#new-file');
  const popupOpened = await page.evaluate(() => ({
    hidden: document.querySelector('#new-file-popup').hidden,
    focusedId: document.activeElement.id,
  }));
  assert.equal(popupOpened.hidden, false, '#new-fileクリックでポップアップが開きません');
  assert.equal(popupOpened.focusedId, 'new-path', 'ポップアップを開いたときに入力欄へフォーカスしません');

  const formScreen = await page.evaluate(() => window.pc98workbench.getScreenText().text);
  await page.keyboard.type('guarded/main.asm');
  assert.equal(await page.$eval('#new-path', (node) => node.value), 'guarded/main.asm');
  const formScreenAfter = await page.evaluate(() => window.pc98workbench.getScreenText().text);
  assert.equal(formScreenAfter, formScreen, 'ファイル名の実キー入力がゲスト画面を変えました');
  assert.ok(!formScreenAfter.toLowerCase().includes('guarded/main.asm'), 'ファイル名がゲストへ漏れました');

  // Escで閉じる。ポップアップの外をクリックしても閉じる（両方とも実キー/実クリックで確認）。
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#new-file-popup', (node) => node.hidden), true, 'Escで新規作成ポップアップが閉じません');
  await page.click('#new-file');
  await page.keyboard.type('outside-click-guard.asm');
  await page.click('#screen');
  assert.equal(await page.$eval('#new-file-popup', (node) => node.hidden), true, '外側クリックで新規作成ポップアップが閉じません');

  const canvasScreen = await page.evaluate(() => window.pc98workbench.getScreenText().text);
  await page.click('#screen');
  await page.keyboard.type('DIR');
  await page.keyboard.press('Enter');
  await page.waitForFunction((before) => {
    const screen = window.pc98workbench.getScreenText();
    const cursorLine = screen.lines[screen.cursor?.row] ?? '';
    return screen.text !== before && /(?:^|\s)[A-Z]:?\\?>\s*$/i.test(cursorLine);
  }, {}, canvasScreen);
  const canvasScreenAfter = await page.evaluate(() => window.pc98workbench.getScreenText().text);
  assert.notEqual(canvasScreenAfter, canvasScreen, 'canvasへの実キー入力にゲストが反応しません');

  await page.evaluate(() => window.pc98workbench.openFile('sample', 'samples/hello-c.c'));
  // 暗背景に沈むトークン色を防ぐ。定数の一致ではなく、実際の描画色と背景のコントラスト比を測る。
  const syntax = await page.evaluate(async () => {
    // Lezerの解析は数フレームかけて進むので、色が出揃うまで待ってから測る。
    const distinct = () => new Set([...document.querySelectorAll('#editor .cm-line span')]
      .map((node) => getComputedStyle(node).color)).size;
    for (let attempt = 0; attempt < 60 && distinct() < 4; attempt++) {
      await new Promise((done) => setTimeout(done, 50));
    }
    const parse = (value) => value.match(/\d+/g).slice(0, 3).map(Number);
    const luminance = ([r, g, b]) => {
      const channel = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const editorBg = parse(getComputedStyle(document.querySelector('.cm-editor')).backgroundColor);
    const tokens = new Map();
    for (const node of document.querySelectorAll('#editor .cm-line span')) {
      const color = getComputedStyle(node).color;
      if (!tokens.has(color)) tokens.set(color, node.textContent.trim().slice(0, 20));
    }
    const background = luminance(editorBg);
    return [...tokens.entries()].map(([color, sample]) => {
      const token = luminance(parse(color));
      const ratio = (Math.max(token, background) + 0.05) / (Math.min(token, background) + 0.05);
      return { color, sample, ratio: Number(ratio.toFixed(2)) };
    });
  });
  assert.ok(syntax.length >= 4, `Cのトークン色が少なすぎます: ${JSON.stringify(syntax)}`);
  const sunken = syntax.filter((token) => token.ratio < 3);
  assert.deepEqual(sunken, [], `背景に沈むトークン色があります: ${JSON.stringify(sunken)}`);
  assert.ok(syntax.some((token) => token.color === 'rgb(197, 134, 192)'),
    `制御キーワードがVS Code Dark+の色ではありません: ${JSON.stringify(syntax)}`);

  const cBuild = await page.evaluate(() => window.pc98workbench.buildCurrent());
  assert.equal(cBuild.ok, true, JSON.stringify(cBuild.errors));
  assert.equal(cBuild.dosName, 'HELLO-C.EXE');

  /*
   * Step15: デバッグ開始時の停止位置を「最初の生成行」へ統一する不具合対応の回帰検査。
   * hello-c.cのエントリはmainではなくSmallerCのスタートアップ(行情報なし)なので、
   * 修正前は停止行がnullになり、そこからのステップオーバーで
   * 「次の生成行がありません」(ide/debug-session.mjs:105)が出ていた。
   * 期待値は5をハードコードせず、行マップ由来のdebuggableLines[0]と突き合わせる。
   */
  const cEntryDebug = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    await wb.buildCurrent();
    const debuggable = wb.getDebugState().debuggableLines;
    const started = await wb.startDebug();
    const state = wb.getDebugState();
    const marks = wb.getEditorMarks();
    let stepped = null;
    let stepError = null;
    try { stepped = wb.stepOverLine(); } catch (error) { stepError = error.message; }
    const breakpointListLength = wb.getBreakpointList().length;
    await wb.stopDebug();
    return {
      debuggable, control: started.control, noDebuggableLines: started.noDebuggableLines,
      entryLine: started.line, stateLine: state.currentLine, stateBreakpoints: state.breakpoints,
      marksCurrentLine: marks.currentLine, marksBreakpointDots: marks.breakpointDots,
      stepped, stepError, breakpointListLength,
    };
  });
  assert.equal(cEntryDebug.control.kind, 1, 'hello-c.cがMZ EXEとして通知されていません');
  assert.ok(cEntryDebug.debuggable.length > 0, 'hello-c.cに生成行がありません(テスト前提が崩れています)');
  assert.equal(cEntryDebug.noDebuggableLines, false, '生成行があるのにnoDebuggableLines扱いです');
  const expectedFirstLine = cEntryDebug.debuggable[0];
  assert.equal(cEntryDebug.entryLine, expectedFirstLine,
    `デバッグ開始の停止行が最初の生成行(${expectedFirstLine}行目)ではありません: ${JSON.stringify(cEntryDebug)}`);
  assert.equal(cEntryDebug.stateLine, expectedFirstLine);
  assert.equal(cEntryDebug.marksCurrentLine, expectedFirstLine, 'エディタの停止行強調が最初の生成行にありません');
  assert.equal(cEntryDebug.marksBreakpointDots, 0, '自動停止のBP印がgutterに出ています');
  assert.deepEqual(cEntryDebug.stateBreakpoints, [], '自動停止が利用者BP枠を消費しています');
  assert.equal(cEntryDebug.breakpointListLength, 0, 'BP一覧に自動BPが現れています');
  assert.equal(cEntryDebug.stepError, null,
    `エントリ停止行からのステップオーバーが失敗しました: ${cEntryDebug.stepError}`);
  assert.notEqual(cEntryDebug.stepped?.line, null, 'ステップオーバー後の停止行がありません');
  assert.equal(cEntryDebug.stepped?.line, cEntryDebug.stepped?.expectedLine,
    'ステップオーバーの到達行が期待行と不一致です');
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから戻す。
  assert.throws(() => assert.equal(cEntryDebug.entryLine, expectedFirstLine + 1));
  assert.throws(() => assert.deepEqual(cEntryDebug.stateBreakpoints, [expectedFirstLine]));
  assert.throws(() => assert.equal(cEntryDebug.stepError, 'dummy'));

  await page.evaluate(async () => {
    await window.pc98workbench.createFile('project/error.asm');
    window.pc98workbench.setValue('CPU 8086\nBITS 16\nORG 100h\nmov ax,\n');
    await window.pc98workbench.buildCurrent();
  });
  const errorState = await page.evaluate(() => window.pc98workbench.getState());
  assertErrorLine(errorState, 4);
  assert.throws(() => assertErrorLine(errorState, 3));
  const renderedError = await page.$eval('#build-errors [data-error-line="4"]', (node) => node.textContent);
  console.log(`[INFO] rendered build error: ${JSON.stringify(renderedError)}`);
  assert.equal(renderedError, 'nasm:4: invalid combination of opcode and operands');
  assert.ok(await page.$('.cm-lint-marker-error'), 'CodeMirror gutterにエラーマーカーがありません');

  // --- UI第2段: workbenchへのデバッガ統合 ---
  await page.evaluate(() => window.pc98workbench.openFile('project', 'hello.asm'));
  const asmDebuggable = await page.evaluate(async () => {
    await window.pc98workbench.buildCurrent();
    return window.pc98workbench.getDebugState().debuggableLines;
  });
  // hello.asmの生成行はコード5行とdb 1行。ビルド直後に「どこへBPを張れるか」が確定している。
  assert.deepEqual(asmDebuggable, [8, 9, 10, 11, 12, 14], 'ASM生成行が期待と不一致です');
  assert.equal(await page.evaluate(() => window.pc98workbench.toggleBreakpoint(13)), false,
    '生成アドレスのない13行目へBPを張れてしまいました');
  assert.deepEqual((await page.evaluate(() => window.pc98workbench.getDebugState())).breakpoints, [],
    '拒否したBPが残っています');

  const asmDebug = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    wb.toggleBreakpoint(11);
    const statusBefore = wb.getMachineStatus();
    const started = await wb.startDebug();
    const statusAfter = wb.getMachineStatus();
    const entry = { state: wb.getDebugState(), marks: wb.getEditorMarks(), registers: wb.getRegisters() };
    const stepped = wb.stepOverLine();
    const afterStep = { state: wb.getDebugState(), marks: wb.getEditorMarks() };
    const hit = wb.continueToBreakpoint();
    return {
      control: started.control, entry, stepped: stepped.line, afterStep,
      hit: { line: hit.line, eip: hit.registers.eip, cs: hit.registers.cs },
      atBreakpoint: { state: wb.getDebugState(), marks: wb.getEditorMarks() },
      cpuPaused: wb.isCpuPaused(), statusBefore, statusAfter,
      headerBackground: getComputedStyle(document.querySelector('.app-header')).backgroundColor,
      footerBackground: getComputedStyle(document.querySelector('footer.app-footer')).backgroundColor,
    };
  });
  assert.equal(asmDebug.control.kind, 0, 'ASM対象がCOMとして通知されていません');
  assert.equal(asmDebug.control.ip, 0x100, 'COM初期IPが0100hではありません');
  assert.equal(asmDebug.entry.state.kind, 'asm');
  assert.equal(asmDebug.entry.state.currentLine, 8, 'エントリ停止行がstartではありません');
  assert.equal(asmDebug.entry.marks.currentLine, 8, 'エディタの停止行強調がエントリ行にありません');
  assert.equal(asmDebug.entry.marks.breakpointDots, 1, 'エディタgutterのBP印が1個ではありません');
  assert.equal(asmDebug.entry.marks.debugPanelVisible, true);
  assert.equal(asmDebug.entry.registers.eip, 0x100, 'エントリ停止IPが0100hではありません');
  assert.equal(asmDebug.entry.registers.cs, asmDebug.control.cs, 'エントリ停止CSがローダ通知値と不一致です');
  assert.deepEqual(asmDebug.entry.marks.registers.map(([name]) => name),
    ['eax', 'ebx', 'ecx', 'edx', 'esp', 'eip', 'cs', 'eflags'], 'IDE独自レジスタ表示が欠けています');
  assert.equal(asmDebug.stepped, 9, '「次の行まで実行」が9行目へ進んでいません');
  assert.equal(asmDebug.afterStep.marks.currentLine, 9, '行送り後の強調行がエディタへ反映されていません');
  assert.equal(asmDebug.hit.line, 11, 'BPまで実行が11行目で止まっていません');
  assert.equal(asmDebug.hit.cs, asmDebug.control.cs);
  assert.notEqual(asmDebug.hit.eip, 0x100, 'BP停止IPがエントリのままです');
  assert.equal(asmDebug.atBreakpoint.marks.currentLine, 11);
  assert.equal(asmDebug.atBreakpoint.marks.disassemblyVisible, true, 'デバッグ中に逆アセンブルが表示されていません');
  assert.ok(asmDebug.atBreakpoint.marks.disassemblyRows > 0, '逆アセンブル行が描画されていません');
  assert.equal(asmDebug.cpuPaused, true, 'BP停止中なのにCPUが動いています');
  assert.notEqual(asmDebug.statusAfter, asmDebug.statusBefore, 'デバッグ開始後に統合状況表示が変化しません');
  assert.equal(asmDebug.headerBackground, theme.normalHeaderBackground,
    'デバッグ開始でWebNP2ヘッダの背景色が変わりました');
  assert.notEqual(asmDebug.footerBackground, theme.footerBackground,
    'デバッグ開始後もステータスバーの背景色が通常時と同じです');

  const activityOnDebugStart = await page.evaluate(measureActivity);
  assert.deepEqual(activityOnDebugStart, {
    explorerSelected: 'false', debugSelected: 'true',
    viewExplorerVisible: false, viewDebugVisible: true,
    debugPanelVisible: true, debugEmptyVisible: false, sidebarView: 'debug',
  }, 'デバッグ開始で実行とデバッグビューへ自動切替されません');
  // 規律: わざとdebugEmptyVisibleをtrueにしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.deepEqual(activityOnDebugStart,
    { ...activityOnDebugStart, debugEmptyVisible: true, debugPanelVisible: false }));

  // --- Step14: VS Codeスタイルのフローティングデバッグツールバー ---
  const debugToolbarInitial = await page.evaluate(() => {
    const cardRect = document.querySelector('.editor-card').getBoundingClientRect();
    const tbRect = document.querySelector('#debug-actions').getBoundingClientRect();
    return {
      editorToolbarHidden: document.querySelector('#editor-toolbar').offsetParent === null,
      position: getComputedStyle(document.querySelector('#debug-actions')).position,
      cardCenter: cardRect.left + cardRect.width / 2,
      tbCenter: tbRect.left + tbRect.width / 2,
      offset: window.pc98workbench.getSplit().debugToolbar.offset,
    };
  });
  assert.equal(debugToolbarInitial.editorToolbarHidden, true,
    'デバッグ中もインフローの.editor-toolbarが空の帯として残っています');
  assert.equal(debugToolbarInitial.position, 'absolute',
    'デバッグツールバーがposition:absoluteでフローティングしていません');
  assert.equal(debugToolbarInitial.offset, 0, '既定オフセットが0(中央)ではありません');
  assert.ok(Math.abs(debugToolbarInitial.cardCenter - debugToolbarInitial.tbCenter) <= 2,
    `デバッグツールバーの既定位置がエディタカード中央から2pxを超えてずれています: ${JSON.stringify(debugToolbarInitial)}`);
  // 規律: 期待値をわざと逆/厳しくしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.equal(debugToolbarInitial.editorToolbarHidden, false));
  assert.throws(() => assert.equal(debugToolbarInitial.position, 'static'));
  assert.throws(() => assert.ok(Math.abs(debugToolbarInitial.cardCenter + 500 - debugToolbarInitial.tbCenter) <= 2));

  /*
   * 位置と収まりだけでは「2段折り返し」を検出できなかった実物の不具合(left:50%指定の
   * absolute要素はshrink-to-fit幅の計算にcontaining block右端までの半分しか使えないため、
   * 既定の1400px幅でも#debug-stopだけ2行目に落ちていた)への回帰検査。
   * グリップ+ボタン6個のtopが全部同じ(=同一行)であることと、ツールバー自体の高さが
   * ボタン1個分の実測高さを大きく超えないことの両方を見る。閾値はボタンの実測高さから
   * 導出し、マジックナンバーは置かない。
   */
  const rowCheck = await page.evaluate(() => {
    const tb = document.querySelector('#debug-actions');
    const tops = [...tb.querySelectorAll('button, .debug-toolbar-grip')]
      .map((el) => Math.round(el.getBoundingClientRect().top));
    return {
      uniqueTopCount: new Set(tops).size,
      tops,
      toolbarHeight: tb.getBoundingClientRect().height,
      buttonHeight: document.querySelector('#debug-continue').getBoundingClientRect().height,
    };
  });
  assert.equal(rowCheck.uniqueTopCount, 1,
    `グリップと6ボタンが同一行に並んでいません(2段折り返し): ${JSON.stringify(rowCheck.tops)}`);
  // 2段になればボタン高さの約2倍(+gap)を超えるので、1.5倍を閾値に「1行に収まっているか」を見る。
  assert.ok(rowCheck.toolbarHeight < rowCheck.buttonHeight * 1.5,
    `デバッグツールバーの高さがボタン1行分を大きく超えています(2段折り返し疑い): ${JSON.stringify(rowCheck)}`);
  // 規律: 期待値をわざと逆/厳しくしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.equal(rowCheck.uniqueTopCount, 2));
  assert.throws(() => assert.ok(rowCheck.toolbarHeight < rowCheck.buttonHeight * 0.5));

  // ドラッグ(実ポインタ操作)でグリップから位置が斜め(水平・垂直とも)に動くこと
  const gripRect = await page.$eval('#debug-toolbar-grip', (node) => node.getBoundingClientRect().toJSON());
  await page.mouse.move(gripRect.left + gripRect.width / 2, gripRect.top + gripRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripRect.left + gripRect.width / 2 + 40, gripRect.top + gripRect.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  const afterDrag = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar);
  assert.ok(afterDrag.offset > 0, `グリップのドラッグで右へ位置が動きません: ${afterDrag.offset}`);
  assert.ok(afterDrag.offsetY > 0, `グリップのドラッグで下へ位置が動きません(2軸化前は縦は動かなかった): ${afterDrag.offsetY}`);
  assert.throws(() => assert.equal(afterDrag.offset, 0));
  assert.throws(() => assert.equal(afterDrag.offsetY, 0));
  await page.evaluate(() => {
    window.pc98workbench.setDebugToolbarOffset(null);
    window.pc98workbench.setDebugToolbarOffsetY(null);
  });

  // キーボード: ←/→で16px、Homeで既定(中央)へ
  await page.focus('#debug-toolbar-grip');
  const beforeArrow = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar.offset);
  await page.keyboard.press('ArrowRight');
  const afterArrowRight = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar.offset);
  assert.ok(Math.abs(afterArrowRight - (beforeArrow + 16)) <= 1,
    `ArrowRightで16px動きません: ${beforeArrow} -> ${afterArrowRight}`);
  await page.keyboard.press('ArrowLeft');
  const afterArrowLeft = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar.offset);
  assert.ok(Math.abs(afterArrowLeft - beforeArrow) <= 1, `ArrowLeftで元へ戻りません: ${afterArrowLeft}`);
  await page.keyboard.press('Home');
  const afterHome = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar.offset);
  assert.equal(afterHome, 0, 'Homeで既定位置(中央)へ戻りません');
  assert.throws(() => assert.notEqual(afterHome, 0));

  /*
   * Step14.1: 上下にもドラッグできるように拡張。可動域は.editor-cardではなく
   * #editorの矩形の内側(タブ列やビルド状況欄には被せない)。
   */
  const withinEditor = (rect, editorRect, margin = 1) => rect.left >= editorRect.left - margin
    && rect.left + rect.width <= editorRect.left + editorRect.width + margin
    && rect.top >= editorRect.top - margin
    && rect.top + rect.height <= editorRect.top + editorRect.height + margin;

  // ↑/↓で垂直位置が16px単位で動くこと(既存の水平←/→の作法をそのまま縦へ広げた)
  await page.focus('#debug-toolbar-grip');
  const beforeArrowY = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar.offsetY);
  await page.keyboard.press('ArrowDown');
  const afterArrowDown = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar.offsetY);
  assert.ok(Math.abs(afterArrowDown - (beforeArrowY + 16)) <= 1,
    `ArrowDownで16px動きません: ${beforeArrowY} -> ${afterArrowDown}`);
  await page.keyboard.press('ArrowUp');
  const afterArrowUp = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar.offsetY);
  assert.ok(Math.abs(afterArrowUp - beforeArrowY) <= 1, `ArrowUpで元へ戻りません: ${afterArrowUp}`);
  assert.throws(() => assert.ok(Math.abs(afterArrowDown - beforeArrowY) <= 1));

  // Homeで水平・垂直の両方とも既定位置(#editor上端中央)へ戻ること
  const beforeHomeXY = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setDebugToolbarOffset(50);
    wb.setDebugToolbarOffsetY(50);
    return wb.getSplit().debugToolbar;
  });
  await page.keyboard.press('Home');
  const afterHomeXY = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar);
  assert.deepEqual({ offset: afterHomeXY.offset, offsetY: afterHomeXY.offsetY }, { offset: 0, offsetY: 0 },
    `Homeで水平・垂直の両方とも既定位置へ戻りません(手前: ${JSON.stringify(beforeHomeXY)} / 直後: ${JSON.stringify(afterHomeXY)})`);
  // 規律: 「縦のリセットだけ外れて横だけ戻る」取りこぼしを検出できるか、
  // 縦を戻す前の値を正解として期待させてFAILすることを実測してから戻す。
  assert.throws(() => assert.deepEqual(
    { offset: afterHomeXY.offset, offsetY: afterHomeXY.offsetY }, { offset: 0, offsetY: 50 },
  ));

  // 極端な値(±99999)でクランプされ、#editorの矩形の内側に収まること(水平・垂直とも)
  const clampCheck = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setDebugToolbarOffset(99999);
    wb.setDebugToolbarOffsetY(99999);
    const high = document.querySelector('#debug-actions').getBoundingClientRect().toJSON();
    wb.setDebugToolbarOffset(-99999);
    wb.setDebugToolbarOffsetY(-99999);
    const low = document.querySelector('#debug-actions').getBoundingClientRect().toJSON();
    wb.setDebugToolbarOffset(null);
    wb.setDebugToolbarOffsetY(null);
    const editorRect = document.querySelector('#editor').getBoundingClientRect().toJSON();
    return { high, low, editorRect };
  });
  assert.ok(withinEditor(clampCheck.high, clampCheck.editorRect),
    `setDebugToolbarOffset/Y(99999)で#editorの外へはみ出します: ${JSON.stringify(clampCheck)}`);
  assert.ok(withinEditor(clampCheck.low, clampCheck.editorRect),
    `setDebugToolbarOffset/Y(-99999)で#editorの外へはみ出します: ${JSON.stringify(clampCheck)}`);
  // 規律: マージンを大きく緩めて「はみ出しても通る」判定にするとFAILしない(=検査が効いている)ことを確認する。
  assert.throws(() => assert.ok(withinEditor(clampCheck.high, clampCheck.editorRect, -10000)));

  // スプリッタでエディタを狭めたあとも内側に収まる(横の再クランプが効いている)
  const narrowCheck = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setDebugToolbarOffset(60);
    wb.setEditorWidth(260);
    const rect = document.querySelector('#debug-actions').getBoundingClientRect().toJSON();
    const editorRect = document.querySelector('#editor').getBoundingClientRect().toJSON();
    wb.setEditorWidth(null);
    wb.setDebugToolbarOffset(null);
    return { rect, editorRect };
  });
  assert.ok(withinEditor(narrowCheck.rect, narrowCheck.editorRect),
    `エディタを260pxへ狭めた後にツールバーが#editorの外へはみ出します(再クランプ不足): ${JSON.stringify(narrowCheck)}`);
  assert.throws(() => assert.ok(withinEditor(narrowCheck.rect, narrowCheck.editorRect, -10000)));

  // 縦へ動かした状態でエディタの高さを変えた(最大化トグル)あとも#editorの内側に収まる(縦の再クランプ)
  const heightChangeCheck = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setDebugToolbarOffsetY(9999);
    const beforeMaximize = document.querySelector('#debug-actions').getBoundingClientRect().toJSON();
    wb.setMaximizedPane('editor');
    const whileMaximized = {
      rect: document.querySelector('#debug-actions').getBoundingClientRect().toJSON(),
      editorRect: document.querySelector('#editor').getBoundingClientRect().toJSON(),
    };
    wb.setMaximizedPane(null);
    const afterRestore = {
      rect: document.querySelector('#debug-actions').getBoundingClientRect().toJSON(),
      editorRect: document.querySelector('#editor').getBoundingClientRect().toJSON(),
    };
    wb.setDebugToolbarOffsetY(null);
    return { beforeMaximize, whileMaximized, afterRestore };
  });
  assert.ok(withinEditor(heightChangeCheck.whileMaximized.rect, heightChangeCheck.whileMaximized.editorRect),
    `エディタ最大化でエディタの高さが変わった直後に#editorの外へはみ出します(縦の再クランプ不足): ${JSON.stringify(heightChangeCheck)}`);
  assert.ok(withinEditor(heightChangeCheck.afterRestore.rect, heightChangeCheck.afterRestore.editorRect),
    `最大化解除後も#editorの外へはみ出します: ${JSON.stringify(heightChangeCheck)}`);
  assert.throws(() => assert.ok(
    withinEditor(heightChangeCheck.whileMaximized.rect, heightChangeCheck.whileMaximized.editorRect, -10000),
  ));

  /*
   * 上の最大化トグルは実測すると「縦の再クランプが無くてもFAILしない」ケースだった:
   * 最大化で#editorが大きくなる方向にしか変わらないため、古い(広い方の範囲でクランプ
   * 済みの)offsetYが偶然そのまま収まってしまい、解除後も元の大きさへ戻るだけなので
   * 検出力が無い(実測して確認済み)。#editorが縮む方向(逆アセンブルパネルを広げてエディタを
   * 圧迫する経路)でこそ、縦の再クランプが無いとオーバーフローする。そちらを主たる
   * 回帰検査にする。
   */
  const shrinkHeightCheck = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setDebugToolbarOffsetY(9999);
    wb.setDisassemblyHeight(420);
    const rect = document.querySelector('#debug-actions').getBoundingClientRect().toJSON();
    const editorRect = document.querySelector('#editor').getBoundingClientRect().toJSON();
    wb.setDisassemblyHeight(null);
    wb.setDebugToolbarOffsetY(null);
    return { rect, editorRect };
  });
  assert.ok(withinEditor(shrinkHeightCheck.rect, shrinkHeightCheck.editorRect),
    `逆アセンブルパネルを広げて#editorが縮んだ後に#editorの外へはみ出します(縦の再クランプ不足): ${JSON.stringify(shrinkHeightCheck)}`);
  // 規律: 縦の再クランプを外すと実際にオーバーフローしてFAILすることを実測してから戻す
  // (このアサーション自体はマージンを緩めるだけでFAILすることを確認する)。
  assert.throws(() => assert.ok(withinEditor(shrinkHeightCheck.rect, shrinkHeightCheck.editorRect, -10000)));

  /*
   * width: max-content にしても、極端に狭いとき(setEditorWidth(0)相当)の折り返し
   * フォールバック(max-width + flex-wrap)は生きていること。ここまで狭いと単一行
   * 296px相当のボタン列は物理的にカード内へ収まりきらないため「完全に収まる」ことは
   * 検査しない(不可能な要求になる)。その代わり、折り返しで実際に複数行になり、
   * 単一行のときの約296pxよりずっと狭い幅に切り詰まっていることを見る。
   * 折り返しを禁止(nowrap)すると単一行296px幅のまま中心配置され、はみ出す量が
   * 大きく増える。
   */
  const wrapFallback = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setDebugToolbarOffset(0);
    wb.setEditorWidth(0);
    const tb = document.querySelector('#debug-actions');
    const rect = tb.getBoundingClientRect().toJSON();
    const tops = [...tb.querySelectorAll('button, .debug-toolbar-grip')]
      .map((el) => Math.round(el.getBoundingClientRect().top));
    wb.setEditorWidth(null);
    wb.setDebugToolbarOffset(null);
    return { rect, uniqueTopCount: new Set(tops).size };
  });
  assert.ok(wrapFallback.uniqueTopCount > 1,
    `エディタ幅0で折り返しが起きていません(折り返しフォールバックが無効化されています): ${JSON.stringify(wrapFallback)}`);
  assert.ok(wrapFallback.rect.width < 296 / 2,
    `折り返しが効いていれば単一行(約296px)よりずっと狭くなるはずです: ${JSON.stringify(wrapFallback)}`);
  // 規律: 折り返しが起きていない(1行のまま)ことを期待するとFAILすることを実測してから戻す。
  assert.throws(() => assert.equal(wrapFallback.uniqueTopCount, 1));

  const disassemblySplit = await page.evaluate(() => {
    const wb = window.pc98workbench;
    const splitter = document.querySelector('#disassembly-splitter');
    const initial = wb.getSplit().disassemblyHeight;
    wb.setDisassemblyHeight(300);
    const requested = wb.getSplit().disassemblyHeight;
    wb.setDisassemblyHeight(10);
    const low = wb.getSplit().disassemblyHeight;
    wb.setDisassemblyHeight(99999);
    const high = wb.getSplit().disassemblyHeight;
    wb.setDisassemblyHeight(300);
    return {
      initial, requested, low, high,
      visible: splitter.offsetParent !== null,
      role: splitter.getAttribute('role'), orientation: splitter.getAttribute('aria-orientation'),
      ariaLabel: splitter.getAttribute('aria-label'), title: splitter.title,
      screen: wb.getScreenText().text,
    };
  });
  assert.equal(disassemblySplit.visible, true, 'デバッグ中に逆アセンブルのスプリッタが表示されません');
  assert.deepEqual([disassemblySplit.role, disassemblySplit.orientation], ['separator', 'horizontal']);
  assert.ok(disassemblySplit.ariaLabel && disassemblySplit.title, '逆アセンブルのスプリッタに説明がありません');
  assert.notEqual(disassemblySplit.requested, disassemblySplit.initial, '逆アセンブルの高さが変わりません');
  assert.ok(Math.abs(disassemblySplit.requested - 300) <= 1, '逆アセンブルを300pxへ設定できません');
  assert.ok(Math.abs(disassemblySplit.low - 80) <= 1, '逆アセンブルの高さが80px下限へ丸められません');
  assert.ok(Math.abs(disassemblySplit.high - 420) <= 1,
    '逆アセンブルの高さが420px上限へ丸められません');
  await page.focus('#disassembly-splitter');
  await page.keyboard.press('ArrowUp');
  const disassemblyKey = await page.evaluate(() => ({
    height: window.pc98workbench.getSplit().disassemblyHeight,
    screen: window.pc98workbench.getScreenText().text,
  }));
  assert.ok(Math.abs(disassemblyKey.height - 316) <= 1, 'ArrowUpで逆アセンブルの高さが16px変わりません');
  assert.equal(disassemblyKey.screen, disassemblySplit.screen, '逆アセンブルのスプリッタ操作がゲストへ漏れました');
  await page.keyboard.press('Home');
  const disassemblyHome = await page.evaluate(() => ({
    height: window.pc98workbench.getSplit().disassemblyHeight,
    stored: localStorage.getItem('pc98dev:split-disassembly'),
  }));
  assert.ok(Math.abs(disassemblyHome.height - disassemblySplit.initial) <= 1,
    'Homeで逆アセンブルの高さが既定値へ戻りません');
  assert.equal(disassemblyHome.stored, null,
    'Homeで逆アセンブルの高さが既定へ戻りません');

  const debugTabSwitch = await page.evaluate(() => {
    const wb = window.pc98workbench;
    const target = wb.getTabs().find((tab) => tab.active);
    const other = wb.getTabs().find((tab) => tab.id !== target.id);
    wb.activateTab(other.id);
    const away = { marks: wb.getEditorMarks(), state: wb.getState() };
    wb.activateTab(target.id);
    const returned = { marks: wb.getEditorMarks(), state: wb.getState() };
    return { target, other, away, returned };
  });
  assert.equal(debugTabSwitch.away.marks.currentLine, null,
    'デバッグ対象外タブに停止行強調が表示されています');
  assert.equal(debugTabSwitch.away.marks.readOnly, false,
    'デバッグ対象外タブが編集ロックされています');
  assert.equal(debugTabSwitch.returned.marks.currentLine, 11,
    'デバッグ対象タブへ戻っても停止行強調が復元されません');
  assert.equal(debugTabSwitch.returned.marks.readOnly, true,
    'デバッグ対象タブへ戻っても編集ロックされません');

  const debugSections = await page.evaluate(() => ({
    registersExists: Boolean(document.querySelector('#section-registers')),
    breakpointsExists: Boolean(document.querySelector('#section-breakpoints')),
    registersOpen: document.querySelector('#section-registers')?.open,
    breakpointsOpen: document.querySelector('#section-breakpoints')?.open,
    registerCount: document.querySelectorAll('#registers [data-ide-register]').length,
    breakpointCount: document.querySelector('#breakpoint-count')?.textContent,
    breakpointItems: document.querySelectorAll('#breakpoint-list [data-breakpoint-line]').length,
    breakpoints: window.pc98workbench.getBreakpointList(),
  }));
  assert.equal(debugSections.registersExists, true, 'レジスタセクションがありません');
  assert.equal(debugSections.breakpointsExists, true, 'ブレークポイントセクションがありません');
  assert.equal(debugSections.registersOpen, true, 'レジスタセクションが開いていません');
  assert.equal(debugSections.breakpointsOpen, true, 'ブレークポイントセクションが開いていません');
  assert.equal(debugSections.registerCount, 8, 'レジスタ表示が8件ではありません');
  assert.equal(debugSections.breakpointCount, '1', 'BP件数バッジが1ではありません');
  assert.equal(debugSections.breakpointItems, 1, 'BP一覧が1件ではありません');
  assert.deepEqual(debugSections.breakpoints, [{ line: 11, label: 'hello.asm:11' }],
    'BP一覧のファイル名:行ラベルが不一致です');

  const stateBeforeBreakpointGoto = await page.evaluate(() => window.pc98workbench.getState());
  await page.click('.breakpoint-goto');
  assert.equal(await page.evaluate(() => window.pc98workbench.getCursorLine()), 11,
    'BP一覧からエディタの該当行へ移動しませんでした');
  assert.deepEqual(await page.evaluate(() => window.pc98workbench.getState()), stateBeforeBreakpointGoto,
    'BP一覧からの行移動でworkbench状態が変化しました');

  await page.click('.breakpoint-remove');
  const removedBreakpoint = await page.evaluate(() => ({
    state: window.pc98workbench.getDebugState().breakpoints,
    list: window.pc98workbench.getBreakpointList(),
    count: document.querySelector('#breakpoint-count').textContent,
    itemCount: document.querySelectorAll('#breakpoint-list [data-breakpoint-line]').length,
    guide: document.querySelector('#breakpoint-list').textContent,
  }));
  assert.deepEqual(removedBreakpoint.state, [], '削除ボタンでBPが解除されませんでした');
  assert.deepEqual(removedBreakpoint.list, [], '削除後も公開BP一覧に項目があります');
  assert.equal(removedBreakpoint.count, '0', '削除後のBP件数バッジが0ではありません');
  assert.equal(removedBreakpoint.itemCount, 0, '削除後もBP一覧項目が残っています');
  assert.ok(removedBreakpoint.guide.includes('BPはエディタ左端のgutterをクリックして設定します'),
    'BPが0件の案内文がありません');
  await page.evaluate(() => window.pc98workbench.toggleBreakpoint(11));

  const lockedSource = await page.evaluate(() => ({
    source: window.pc98workbench.getValue(), screen: window.pc98workbench.getScreenText().text,
  }));
  await page.click('#editor .cm-content');
  await page.keyboard.type('XXX');
  const lockedEditor = await page.evaluate(() => ({
    source: window.pc98workbench.getValue(),
    screen: window.pc98workbench.getScreenText().text,
    readOnly: window.pc98workbench.isEditorReadOnly(),
    marksReadOnly: window.pc98workbench.getEditorMarks().readOnly,
    lockVisible: !document.querySelector('#edit-lock').hidden,
    debugging: document.body.classList.contains('debugging'),
  }));
  assert.equal(lockedEditor.source, lockedSource.source, 'デバッグ中の実キー入力でソースが変わりました');
  assert.equal(lockedEditor.screen, lockedSource.screen, 'デバッグ中のXXXがゲスト画面を変えました');
  assert.ok(!lockedEditor.screen.toLowerCase().includes('xxx'), 'デバッグ中のXXXがゲストへ漏れました');
  assert.equal(lockedEditor.readOnly, true);
  assert.equal(lockedEditor.marksReadOnly, true);
  assert.equal(lockedEditor.lockVisible, true);
  assert.equal(lockedEditor.debugging, true);

  const debugToolbar = await readToolbar();
  const debugToolbarMode = await page.evaluate(() => ({
    mode: window.pc98workbench.getToolbarMode(),
    buildHidden: document.querySelector('#build-actions').hidden,
    debugHidden: document.querySelector('#debug-actions').hidden,
    debugWidth: document.querySelector('#debug-actions').getBoundingClientRect().width,
    debugPanelVisible: !document.querySelector('#debug-panel').hidden,
  }));
  assert.deepEqual(debugToolbar.map((button) => button.id), toolButtonIds, 'デバッグ中にツールバー構成が変わりました');
  assert.ok(debugToolbar.slice(2).every((button) => !button.disabled), 'デバッグ中に無効なデバッグ操作があります');
  assert.deepEqual({
    mode: debugToolbarMode.mode, buildHidden: debugToolbarMode.buildHidden,
    debugHidden: debugToolbarMode.debugHidden, debugPanelVisible: debugToolbarMode.debugPanelVisible,
  }, { mode: 'debug', buildHidden: true, debugHidden: false, debugPanelVisible: true });
  assert.ok(debugToolbarMode.debugWidth > 0, 'デバッグモードのデバッグ操作が可視ではありません');
  for (const id of toolButtonIds) {
    const normal = normalToolbar.find((button) => button.id === id);
    const debugging = debugToolbar.find((button) => button.id === id);
    assert.ok(Math.max(normal.svgWidth, debugging.svgWidth) > 0, `${id}のSVGが描画されていません`);
  }

  const swapButton = await page.$eval('#swap-panes', (button) => ({
    title: button.title, ariaLabel: button.getAttribute('aria-label'),
  }));
  assert.ok(swapButton.title && swapButton.ariaLabel, '配置入替ボタンに説明がありません');
  assert.equal(swapButton.title, swapButton.ariaLabel);

  const paneSwap = await page.evaluate(() => {
    const wb = window.pc98workbench;
    const before = wb.getLayout();
    wb.setPanesSwapped(true);
    const swapped = wb.getLayout();
    const stored = localStorage.getItem('pc98dev:panes-swapped');
    const bodyClassWhileSwapped = document.body.classList.contains('panes-swapped');
    wb.setPanesSwapped(false);
    const restored = wb.getLayout();
    return {
      before, swapped, restored, stored, bodyClassWhileSwapped,
      classWhileSwapped: swapped.editor.left > swapped.screen.left,
      classAfterRestore: document.body.classList.contains('panes-swapped'),
      stateAfterRestore: wb.getPanesSwapped(),
    };
  });
  assert.ok(paneSwap.before.editor.left < paneSwap.before.screen.left, '初期配置がエディタ左ではありません');
  assert.equal(paneSwap.bodyClassWhileSwapped, true, '入替時にbodyへpanes-swappedが付きません');
  assert.equal(paneSwap.classWhileSwapped, true, '入替後にPC-98画面が左へ移っていません');
  assert.equal(paneSwap.stored, '1', '配置の入替状態がlocalStorageへ保存されていません');
  assert.ok(paneSwap.restored.editor.left < paneSwap.restored.screen.left, '配置が元の左右関係へ戻っていません');
  assert.equal(paneSwap.classAfterRestore, false);
  assert.equal(paneSwap.stateAfterRestore, false);

  const noBreakpointRun = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    wb.toggleBreakpoint(11);
    return wb.continueOrRun();
  });
  assertRun(noBreakpointRun, output);

  const stepInto = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    await wb.startDebug();
    const result = wb.stepInto();
    return { result, marks: wb.getEditorMarks() };
  });
  assert.equal(stepInto.result.entered, false, 'callの無いhello.asmで呼び先へ入った扱いになりました');
  assert.equal(stepInto.result.line, stepInto.result.expectedLine);
  assert.equal(stepInto.marks.currentLine, stepInto.result.line, 'ステップイン後の停止行強調が不一致です');

  const instruction = await page.evaluate(() => {
    const result = window.pc98workbench.stepInstruction();
    return { result, marks: window.pc98workbench.getEditorMarks() };
  });
  assert.equal(instruction.result.steps, 1);
  assert.equal(instruction.marks.currentLine, instruction.result.line, '1命令実行後の停止行強調が不一致です');

  const beforeF10 = (await page.evaluate(() => window.pc98workbench.getDebugState())).currentLine;
  await page.keyboard.press('F10');
  await page.waitForFunction((line) => window.pc98workbench.getDebugState().currentLine !== line, {}, beforeF10);
  assert.equal(await page.evaluate(() => window.pc98workbench.getLastShortcut()), 'step-over');
  const beforeF11 = (await page.evaluate(() => window.pc98workbench.getDebugState())).currentLine;
  await page.keyboard.press('F11');
  await page.waitForFunction((line) => window.pc98workbench.getDebugState().currentLine !== line, {}, beforeF11);
  assert.equal(await page.evaluate(() => window.pc98workbench.getLastShortcut()), 'step-into');
  await page.evaluate(() => window.pc98workbench.toggleBreakpoint(11));

  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: DESKTOP_SHOT });

  const asmResume = await page.evaluate(() => window.pc98workbench.stopDebug());
  assertRun(asmResume, output);
  assert.throws(() => assertRun(asmResume, 'Workbench typo!'));
  assert.equal(await page.$eval('#disassembly-splitter', (node) => node.offsetParent === null), true,
    'デバッグ終了後も逆アセンブルのスプリッタが表示されています');
  assert.deepEqual(await page.evaluate(() => ({
    mode: window.pc98workbench.getToolbarMode(),
    buildHidden: document.querySelector('#build-actions').hidden,
    debugHidden: document.querySelector('#debug-actions').hidden,
  })), { mode: 'build', buildHidden: false, debugHidden: true }, 'デバッグ停止後に通常ツールバーへ戻りません');
  // 通常実行へ戻したら停止行強調とレジスタは消す。BPは利用者の意図なので次のデバッグまで残す。
  assert.deepEqual(await page.evaluate(() => window.pc98workbench.getEditorMarks()),
    {
      breakpointDots: 1, currentLine: null, registers: [], debugPanelVisible: false,
      // デバッグ終了ではビュー選択を自動で戻さない仕様なので、直前に開始したdebugビューのまま。
      sidebarView: 'debug',
      disassemblyVisible: false, disassemblyRows: 12, readOnly: false,
    },
    'デバッグ終了後のエディタ状態が期待と不一致です');

  const unlocked = await page.evaluate(() => ({
    source: window.pc98workbench.getValue(),
    readOnly: window.pc98workbench.isEditorReadOnly(),
    lockHidden: document.querySelector('#edit-lock').hidden,
    debugging: document.body.classList.contains('debugging'),
  }));
  assert.equal(unlocked.readOnly, false);
  assert.equal(unlocked.lockHidden, true);
  assert.equal(unlocked.debugging, false);
  await page.click('#editor .cm-content');
  await page.keyboard.type('XXX');
  assert.notEqual(await page.evaluate(() => window.pc98workbench.getValue()), unlocked.source,
    'デバッグ停止後も実キー入力が反映されません');
  await page.evaluate((source) => window.pc98workbench.setValue(source), unlocked.source);

  // C側は1997年のSTRLEN.Cを、原文の行番号のままエディタ上でBP停止させる。
  // 同梱サンプルを2本へ絞ったため同梱サンプルとしては引けない。原文(CP932→UTF-8変換済み、
  // 行番号は完全に同一)を作業ファイル(project origin)としてcreateFile()+setValue()で書いてから開く。
  const STRLEN_C_SOURCE = `//文字列の長さ関数
//ｂｙ 春うらら 1997.6.30
#include <stdio.h>

int StrLen(char *Str);

void main (void)
{
\tint Len;
\t
\tLen=StrLen("ABC");
\tprintf ("%d\\n",Len);
}

int StrLen (char *Str)
{
\tint Len;
\t
\tLen=0;
\twhile (*Str!=0)
\t{
\t\tLen++;
\t\tStr++;
\t}
\treturn (Len);
}
`;
  await page.evaluate(async (source) => {
    await window.pc98workbench.createFile('strlen.c');
    window.pc98workbench.setValue(source);
  }, STRLEN_C_SOURCE);
  // BP行は行番号そのものなので、別ファイルを開いたら持ち越さない。
  assert.equal((await page.evaluate(() => window.pc98workbench.getEditorMarks())).breakpointDots, 0,
    'ファイルを切り替えてもBP印が残っています');
  const cDebug = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    await wb.buildCurrent();
    const debuggable = wb.getDebugState().debuggableLines;
    wb.toggleBreakpoint(22);
    const started = await wb.startDebug();
    const hit = wb.continueToBreakpoint();
    return {
      debuggable, control: started.control, entryLine: started.line,
      hit: { line: hit.line, cs: hit.registers.cs }, marks: wb.getEditorMarks(),
      sourceLine: wb.getValue().split(/\r?\n/)[21].trim(),
    };
  });
  assert.equal(cDebug.control.kind, 1, 'C対象がMZ EXEとして通知されていません');
  assert.ok(cDebug.debuggable.includes(22), 'C 22行目が生成行として出ていません');
  assert.equal(cDebug.hit.line, 22, 'C 22行目でBP停止していません');
  assert.equal(cDebug.hit.cs, cDebug.control.cs);
  assert.equal(cDebug.marks.currentLine, 22, 'エディタの停止行強調がC 22行目にありません');
  assert.equal(cDebug.marks.breakpointDots, 1);
  assert.equal(cDebug.sourceLine, 'Len++;', 'C 22行目の原文が Len++; ではありません');
  const cResume = await page.evaluate(() => window.pc98workbench.stopDebug());
  assertRun(cResume, '3');
  assert.throws(() => assertRun(cResume, '4'));

  /*
   * 利用者BP枠(0〜5の6本)は自動停止(最初の生成行)に消費されていないことを確認する。
   * STRLEN.Cは生成行が7つ([11,12,19,20,22,23,25])あるため、6本ちょうど張れて
   * 7本目で既存の「枠を超える」エラーになることを実測できる。
   */
  const slotCapacity = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    wb.toggleBreakpoint(22); // 直前のcDebugで張ったままの22行目を落として素の状態から始める。
    const debuggable = wb.getDebugState().debuggableLines;
    const started = await wb.startDebug();
    const afterStart = wb.getDebugState().breakpoints;
    const toggled = debuggable.slice(0, 6).map((line) => wb.toggleBreakpoint(line));
    const afterSix = wb.getDebugState().breakpoints;
    const statusBeforeSeventh = wb.getMachineStatus();
    const seventh = wb.toggleBreakpoint(debuggable[6]);
    const afterSeventh = wb.getDebugState().breakpoints;
    const statusAfterSeventh = wb.getMachineStatus();
    await wb.stopDebug();
    for (const line of debuggable.slice(0, 6)) wb.toggleBreakpoint(line); // 後続テストへ持ち越さない。
    return {
      debuggableCount: debuggable.length, noDebuggableLines: started.noDebuggableLines,
      afterStart, toggled, afterSix, seventh, afterSeventh,
      statusChanged: statusAfterSeventh !== statusBeforeSeventh,
    };
  });
  assert.equal(slotCapacity.debuggableCount, 7, 'STRLEN.Cの生成行が7つという前提が崩れています');
  assert.equal(slotCapacity.noDebuggableLines, false);
  assert.deepEqual(slotCapacity.afterStart, [],
    `デバッグ開始直後に利用者BPが自動で入っています(自動停止が枠を消費しています): ${JSON.stringify(slotCapacity.afterStart)}`);
  assert.deepEqual(slotCapacity.toggled, [true, true, true, true, true, true], '生成行6本ぶんのBPを張れません');
  assert.equal(slotCapacity.afterSix.length, 6, '利用者BPが6本張れていません');
  assert.equal(slotCapacity.seventh, false, '7本目のBPが張れてしまいます(枠上限が壊れています)');
  assert.equal(slotCapacity.afterSeventh.length, 6, '7本目を弾いたのにBP本数が変わっています');
  assert.ok(slotCapacity.statusChanged, '7本目を弾いたときにエラー状況表示が出ていません');
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから戻す。
  assert.throws(() => assert.equal(slotCapacity.seventh, true));
  assert.throws(() => assert.deepEqual(slotCapacity.afterStart, [11]));
  assert.throws(() => assert.equal(slotCapacity.afterSix.length, 5));

  // FD差し替え(実行→デバッグ→復帰)を連続して行い、DOS画面を見た自己回復経路が
  // 壊れていないことを確認する。かつてはここで setFdSwapDelay(0) により「待ちを詰めて
  // 自己回復を強制する」ことを狙っていたが、FD_SWAP_MS はどこからも待ちとして
  // 参照されていない死んだ変数だったため(挿入遅延はコア側の準備完了検出
  // (webnp2_fdd_ready)へ既に置き換わっている)、実際には何も強制していなかった。
  // 死んだAPIごと削除し、この一連の操作が成立することだけを見る。
  const forcedRecovery = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    const retriesBefore = wb.getDriveErrorRetries();
    const remountsBefore = wb.getDriveRemounts();
    // second-run.asmは同梱サンプルから外れたため、tabFixtureで作成済みの
    // 作業ファイル(project origin)を開き直す。
    await wb.openFile('project', 'second-run.asm');
    await wb.buildCurrent();
    const run = await wb.runCurrent();
    const debug = await wb.startDebug();
    const resumed = await wb.stopDebug();
    return {
      run, debug, resumed,
      retriesBefore, retriesAfter: wb.getDriveErrorRetries(),
      remountsBefore, remountsAfter: wb.getDriveRemounts(),
    };
  });
  assertRun(forcedRecovery.run.screen, 'Second debug run!');
  assert.equal(forcedRecovery.debug.control.kind, 0, 'デバッグがCOMエントリで停止しません');
  assertRun(forcedRecovery.resumed, 'Second debug run!');
  assert.equal(await page.evaluate(() => 'setFdSwapDelay' in window.pc98workbench), false,
    '死んだgetFdSwapDelay/setFdSwapDelay APIが残っています');
  const forcedRetryCount = forcedRecovery.retriesAfter - forcedRecovery.retriesBefore;
  const forcedRemountCount = forcedRecovery.remountsAfter - forcedRecovery.remountsBefore;

  await page.evaluate(() => window.pc98workbench.openFile('project', 'hello.asm'));
  // 直前までのデバッグセッションでビューがdebugのままなので、フォルダ操作の検証前にエクスプローラーへ戻す。
  await page.evaluate(() => {
    window.pc98workbench.setSidebarView('explorer');
    window.pc98workbench.setSidebarVisible(true);
  });
  // サイドバー操作列とステータスバー自身がviewportを横へ押し広げないことを実測する。
  const chromeOverflow = () => page.evaluate(() => {
    const actions = document.querySelector('.sidebar-actions');
    const footer = document.querySelector('footer.app-footer');
    return {
      actions: actions.scrollWidth - actions.clientWidth,
      footer: footer.scrollWidth - footer.clientWidth,
      downloadButton: document.querySelector('#download-file').getBoundingClientRect().width > 0,
    };
  });
  const desktopChrome = await chromeOverflow();
  assert.ok(desktopChrome.actions <= 1, `デスクトップのサイドバー操作列がはみ出しています: ${desktopChrome.actions}px`);
  assert.ok(desktopChrome.footer <= 1, `デスクトップのステータスバーがはみ出しています: ${desktopChrome.footer}px`);
  assert.equal(desktopChrome.downloadButton, true, 'ダウンロードボタンが表示されていません');
  await page.evaluate(() => window.pc98workbench.setSidebarVisible(false));
  await page.evaluate(() => new Promise((resolveWait) => requestAnimationFrame(resolveWait)));

  const desktopLayout = await page.evaluate(() => window.pc98workbench.getLayout());
  assert.equal(desktopLayout.contentEditable, true, 'CodeMirrorがcontentEditableではありません');
  assert.ok(desktopLayout.editor.width > 500 && desktopLayout.screen.width > 500, 'デスクトップのエディタ/画面幅が不足しています');
  const desktopScaling = await page.evaluate(() => ({
    ...window.pc98workbench.getScreenScaling(),
    rendering: getComputedStyle(document.querySelector('#screen')).imageRendering,
  }));
  assert.ok(desktopScaling.scale >= 1, `デスクトップで等倍以上になっていません: ${desktopScaling.scale}`);
  assert.equal(desktopScaling.smoothed, false, '等倍以上なのに補間が有効です');
  assert.equal(desktopScaling.rendering, 'pixelated', '等倍以上でドット感が失われています');

  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  const mobileChrome = await page.evaluate(() => {
    const wb = window.pc98workbench;
    wb.setSidebarVisible(true);
    const actions = document.querySelector('.sidebar-actions');
    const footer = document.querySelector('footer.app-footer');
    const rectsIntersect = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const helpBtn = document.querySelector('.header-help-btn').getBoundingClientRect();
    const title = document.querySelector('.app-header h1').getBoundingClientRect();
    const measured = {
      actions: actions.scrollWidth - actions.clientWidth,
      footer: footer.scrollWidth - footer.clientWidth,
      downloadButton: document.querySelector('#download-file').getBoundingClientRect().width > 0,
      helpBtnVisible: helpBtn.width > 0 && helpBtn.height > 0,
      helpBtnOverlapsTitle: rectsIntersect(helpBtn, title),
    };
    wb.setSidebarVisible(false);
    return measured;
  });
  await page.evaluate(() => new Promise((resolveWait) => requestAnimationFrame(() => requestAnimationFrame(resolveWait))));
  const mobile = await page.evaluate(() => ({ ...window.pc98workbench.getLayout(), viewport: { width: innerWidth, height: innerHeight } }));
  const mobileSplitterHidden = await page.$eval('#splitter', (node) => node.offsetParent === null
    || node.getBoundingClientRect().width === 0);
  const visible = (rect) => rect.width > 0 && rect.height > 0 && rect.top < mobile.viewport.height && rect.bottom > 0;
  assert.equal(mobile.contentEditable, true);
  assert.ok(visible(mobile.editor) && mobile.editor.width <= 355 && mobile.editor.height >= 280,
    `モバイルeditorが使用可能領域にありません: ${JSON.stringify(mobile.editor)}`);
  assert.ok(visible(mobile.screen) && mobile.screen.width >= 330,
    `モバイルPC-98画面がviewportにありません: ${JSON.stringify(mobile.screen)}`);
  assert.ok(mobileChrome.actions <= 1, `モバイルのサイドバー操作列がはみ出しています: ${mobileChrome.actions}px`);
  assert.ok(mobileChrome.footer <= 1, `モバイルのステータスバーがはみ出しています: ${mobileChrome.footer}px`);
  assert.equal(mobileChrome.downloadButton, true, 'モバイルでダウンロードボタンが表示されていません');
  assert.equal(mobileChrome.helpBtnVisible, true, 'モバイルでヘッダの「?」ボタンが表示されていません');
  assert.equal(mobileChrome.helpBtnOverlapsTitle, false, 'モバイルでヘッダの「?」ボタンがタイトルと重なっています');
  assert.equal(mobileSplitterHidden, true, '375px幅でスプリッタが非表示ではありません');
  // 375px幅ではアクティビティバーは横並びの帯になる（幅=viewport相当、高さ<幅）。
  const mobileActivity = await page.$eval('#activity-bar', (node) => node.getBoundingClientRect().toJSON());
  assert.ok(mobileActivity.width >= 330, `モバイルでアクティビティバーの幅が狭すぎます: ${JSON.stringify(mobileActivity)}`);
  assert.ok(mobileActivity.height > 0 && mobileActivity.height < mobileActivity.width,
    `モバイルでアクティビティバーが横並びになっていません: ${JSON.stringify(mobileActivity)}`);
  // 規律: わざと不等号を逆にしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.ok(mobileActivity.height > mobileActivity.width));
  // 375px幅ではデバッグツールバーはフローティングにしない(position:static、グリップも非表示)。
  const mobileDebugToolbar = await page.evaluate(() => ({
    position: getComputedStyle(document.querySelector('#debug-actions')).position,
    gripVisible: getComputedStyle(document.querySelector('#debug-toolbar-grip')).display !== 'none',
  }));
  assert.equal(mobileDebugToolbar.position, 'static', '375px幅でデバッグツールバーがフローティングのままです');
  assert.equal(mobileDebugToolbar.gripVisible, false, '375px幅でグリップが表示されたままです');
  // 規律: 期待値をわざと逆にしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.equal(mobileDebugToolbar.position, 'absolute'));
  assert.throws(() => assert.equal(mobileDebugToolbar.gripVisible, true));
  // 等倍未満の縮小では補間、等倍以上ではドット感を残す（実測値で確認する）。
  const mobileScaling = await page.evaluate(() => ({
    ...window.pc98workbench.getScreenScaling(),
    rendering: getComputedStyle(document.querySelector('#screen')).imageRendering,
  }));
  assert.ok(mobileScaling.scale < 1, `モバイルで等倍未満になっていません: ${mobileScaling.scale}`);
  assert.equal(mobileScaling.smoothed, true, '等倍未満なのに補間が有効になっていません');
  assert.notEqual(mobileScaling.rendering, 'pixelated', '縮小時にimage-renderingがpixelatedのままです');
  await page.screenshot({ path: MOBILE_SHOT });
  console.log(`[PASS] screen scaling: desktop x${desktopScaling.scale.toFixed(2)} pixelated / mobile x${mobileScaling.scale.toFixed(2)} ${mobileScaling.rendering}`);

  // --- サイドバービュー/デバッグツールバー位置(縦横とも)の永続化: リロード後もlocalStorageから復元される ---
  await page.evaluate(() => {
    window.pc98workbench.setSidebarView('debug');
    window.pc98workbench.setDebugToolbarOffset(37);
    window.pc98workbench.setDebugToolbarOffsetY(23);
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.evaluate(() => window.pc98workbench.ready);
  const restoredView = await page.evaluate(() => window.pc98workbench.getSidebarView());
  const restoredDebugToolbar = await page.evaluate(() => window.pc98workbench.getSplit().debugToolbar);
  assert.equal(restoredView, 'debug', 'リロード後にサイドバービュー(debug)の選択が復元されません');
  assert.equal(restoredDebugToolbar.offset, 37, 'リロード後にデバッグツールバーの水平位置(37px)が復元されません');
  assert.equal(restoredDebugToolbar.offsetY, 23, 'リロード後にデバッグツールバーの垂直位置(23px)が復元されません');
  // 規律: わざと違う値を期待させてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.equal(restoredView, 'explorer'));
  assert.throws(() => assert.equal(restoredDebugToolbar.offset, 0));
  assert.throws(() => assert.equal(restoredDebugToolbar.offsetY, 0));
  console.log('[PASS] activity bar: initial explorer view, click-to-switch, click-to-toggle with aria-selected retained, reload persistence, debug auto-switch, maximize hiding, mobile row layout');
  console.log('[PASS] floating debug toolbar: absolute positioning, centered default, 2-axis drag/keyboard/Home, extreme-offset and narrow/height-change clamping (within #editor), reload persistence, mobile static fallback');

  // --- 回帰: ページ読込直後、#runを一度も押さずに初回デバッグがエントリ停止まで到達する ---
  // 既存の検証はどれも#run(runCurrent)を先に一度通してからデバッグへ進んでおり、
  // 「ページ読込直後にいきなりデバッグ」という経路(WebNP2のwaitForFddReady/insertFdの
  // 不具合調査で問題になった経路)を一度も検査していなかった。直前のreloadでbootedは
  // リセットされているので、ここが「ページ読込直後」の代わりになる。
  // 合格条件には所要時間も含める。今回の不具合は「最終的には動くが異常に遅い(あるいは
  // 例外を握り潰して不整合のまま進む)」形で現れたため、到達したかどうかだけでは
  // 再発を検出できない。
  // 実測(スロットリング無し、この検証環境で3回計測、修正後コード): 17.5秒・17.8秒・
  // 18.1秒。上限はこの実測値に環境差の余裕を持たせつつ、真のハング(分単位)とは
  // 明確に区別できる60秒とする。
  // 検出力の確認: WebNP2をこの不具合の直前のコミット(e04b3c9、waitForFddReadyが
  // 壁時計10秒のポーリングのみでinsertFdが戻り値を握り潰す実装)へ戻してこの検証を
  // 実行したところ、この無スロットリングのheadless環境では17.5〜17.8秒で普通に到達し、
  // FAILしなかった(2回実測)。つまりこの検査は無スロットリング環境では当該の
  // 不具合そのものを再現できておらず、検出力があるのは「一般的な低速化・完全停止」
  // に対してのみである。それでも将来の真の退行(タイムアウト例外や無限待ち)を
  // 検出できる回帰ガードとして価値があるため残す。
  const freshDebugStart = Date.now();
  await page.evaluate(async () => {
    const wb = window.pc98workbench;
    await wb.openFile('project', 'second-run.asm');
    await wb.buildCurrent();
  });
  const freshDebug = await page.evaluate(() => window.pc98workbench.startDebug());
  const freshDebugMs = Date.now() - freshDebugStart;
  assert.equal(freshDebug.control.kind, 0, '#runを挟まない初回デバッグがCOMエントリで停止しません');
  assert.ok(freshDebugMs < 60_000, `#runを挟まない初回デバッグが遅すぎます: ${freshDebugMs}ms`);
  // 規律: 上限を明らかに満たせない値にしてFAILすることを実測してから元に戻す。
  assert.throws(() => assert.ok(freshDebugMs < 1, 'わざと失敗させる自己検査'));
  await page.evaluate(() => window.pc98workbench.stopDebug());
  console.log(`[PASS] fresh debug without #run: reached COM entry stop in ${freshDebugMs}ms (<60000ms)`);

  // --- 削除UI: 保存先グループ(作業ファイル/フォルダ)のエントリだけに削除ボタンがあり、
  //     削除するとファイルと開いていたタブの両方が消えること。サンプルには付かない。 ---
  const deleteUi = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    wb.setConfirm(() => true);
    await wb.createFile('scratch-delete-a.asm');
    await wb.createFile('scratch-delete-b.asm');
    const rowFor = (path) => [...document.querySelectorAll('#file-tree .file-row')]
      .find((row) => row.querySelector('.file-entry')?.dataset.path === path);
    const beforeTabs = wb.getTabs().map((tab) => tab.path);
    const beforeFiles = (await wb.listProjectFiles()).map((file) => file.path);
    const sampleHasDelete = Boolean(rowFor('samples/hello.asm')?.querySelector('.file-delete'));
    const workAHasDelete = Boolean(rowFor('scratch-delete-a.asm')?.querySelector('.file-delete'));
    const workBHasDelete = Boolean(rowFor('scratch-delete-b.asm')?.querySelector('.file-delete'));
    // scratch-delete-bはアクティブタブのまま削除する。
    rowFor('scratch-delete-b.asm').querySelector('.file-delete').click();
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    const afterOneDelete = {
      tabs: wb.getTabs().map((tab) => tab.path),
      files: (await wb.listProjectFiles()).map((file) => file.path),
      currentPath: wb.getState().currentPath,
    };
    return { beforeTabs, beforeFiles, sampleHasDelete, workAHasDelete, workBHasDelete, afterOneDelete };
  });
  assert.equal(deleteUi.sampleHasDelete, false, 'サンプルのエントリに削除ボタンが付いています');
  assert.equal(deleteUi.workAHasDelete, true, '新規作成したファイルが作業ファイルグループの削除可能エントリに出ていません');
  assert.equal(deleteUi.workBHasDelete, true, '作業ファイルのエントリに削除ボタンがありません');
  assert.ok(deleteUi.beforeTabs.includes('scratch-delete-b.asm') && deleteUi.beforeFiles.includes('scratch-delete-b.asm'),
    '削除前提: scratch-delete-b.asmが未作成です');
  assert.ok(!deleteUi.afterOneDelete.tabs.includes('scratch-delete-b.asm'), '削除ボタンを押してもタブが残っています');
  assert.ok(!deleteUi.afterOneDelete.files.includes('scratch-delete-b.asm'), '削除ボタンを押してもファイルが残っています');
  assert.notEqual(deleteUi.afterOneDelete.currentPath, 'scratch-delete-b.asm',
    '削除したファイルのタブが閉じずアクティブなままです');
  console.log('[PASS] delete UI: save-target entries only (not samples), delete button removes file and its open tab');

  // --- 削除UI: 最後の1枚のタブを削除してもタブ0枚経由の処理が例外にならず、
  //     同梱サンプルへ戻ること ---
  const deleteToZero = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    wb.setConfirm(() => true);
    for (const tab of wb.getTabs()) {
      if (wb.getTabs().length <= 1) break;
      await wb.closeTab(tab.id);
    }
    await wb.createFile('scratch-delete-last.asm');
    for (const tab of wb.getTabs()) {
      if (tab.path === 'scratch-delete-last.asm') continue;
      await wb.closeTab(tab.id);
    }
    const tabsBefore = wb.getTabs().map((tab) => tab.path);
    let threw = null;
    try {
      const row = [...document.querySelectorAll('#file-tree .file-row')]
        .find((entry) => entry.querySelector('.file-entry')?.dataset.path === 'scratch-delete-last.asm');
      row.querySelector('.file-delete').click();
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    } catch (error) {
      threw = error.message;
    }
    return {
      tabsBefore, threw,
      tabsAfter: wb.getTabs().map((tab) => ({ origin: tab.origin, path: tab.path })),
      currentPath: wb.getState().currentPath,
      currentOrigin: wb.getState().currentOrigin,
      saveStateText: document.querySelector('#save-state').textContent,
      runDisabled: document.querySelector('#run').disabled,
    };
  });
  assert.deepEqual(deleteToZero.tabsBefore, ['scratch-delete-last.asm'], '削除前提: タブが1枚に絞れていません');
  assert.equal(deleteToZero.threw, null, `タブ0枚になる削除で例外が発生しました: ${deleteToZero.threw}`);
  assert.equal(deleteToZero.tabsAfter.length, 1, 'タブ0枚経由のあと同梱サンプルへ戻っていません');
  assert.deepEqual(deleteToZero.tabsAfter[0], { origin: 'sample', path: 'samples/hello.asm' },
    'タブ0枚経由のフォールバック先がsamples/hello.asmではありません');
  assert.equal(deleteToZero.currentPath, 'samples/hello.asm');
  assert.equal(deleteToZero.currentOrigin, 'sample');
  assert.ok(deleteToZero.saveStateText, 'タブ0枚経由の復帰後にステータスバー表示が空です');
  assert.equal(deleteToZero.runDisabled, false, 'タブ0枚経由の復帰後に実行ボタンが無効のままです');
  await page.evaluate(() => window.pc98workbench.setConfirm((message) => window.confirm(message)));
  console.log('[PASS] delete UI: closing the last remaining tab falls back to the bundled sample without throwing');

  // --- フォルダ関連UIが存在しないこと（1ファイル=1プログラム方針でローカルフォルダ機能を削除済み） ---
  const noFolderUi = await page.evaluate(() => ({
    folderOpen: document.querySelector('#folder-open'),
    folderDisconnect: document.querySelector('#folder-disconnect'),
    folderState: document.querySelector('#folder-state'),
    connectDirectory: 'connectDirectory' in window.pc98workbench,
    disconnectDirectory: 'disconnectDirectory' in window.pc98workbench,
    getDirectoryState: 'getDirectoryState' in window.pc98workbench,
  }));
  assert.equal(noFolderUi.folderOpen, null, '#folder-openが残っています');
  assert.equal(noFolderUi.folderDisconnect, null, '#folder-disconnectが残っています');
  assert.equal(noFolderUi.folderState, null, '#folder-stateが残っています');
  assert.equal(noFolderUi.connectDirectory, false, 'connectDirectory APIが残っています');
  assert.equal(noFolderUi.disconnectDirectory, false, 'disconnectDirectory APIが残っています');
  assert.equal(noFolderUi.getDirectoryState, false, 'getDirectoryState APIが残っています');
  console.log('[PASS] folder UI removed: #folder-open/#folder-disconnect/#folder-state and directory APIs are gone');

  // 直前のデバッグ検証でサイドバーを畳んでdebugビューにしてあるため、エクスプローラーの
  // ボタンは描画されていない。DOM経由のクリックを測る前に必ず表示状態へ戻す。
  await page.evaluate(() => {
    window.pc98workbench.setSidebarView('explorer');
    window.pc98workbench.setSidebarVisible(true);
  });

  // --- ダウンロード: downloadActiveFile()の戻り値が{name, text}で、サンプルタブでも動く ---
  await page.evaluate(() => window.pc98workbench.openFile('sample', 'samples/hello.asm'));
  const sampleDownload = await page.evaluate(() => window.pc98workbench.downloadActiveFile());
  assert.equal(sampleDownload.name, 'hello.asm', 'サンプルタブのダウンロード名がbasenameではありません');
  assert.ok(sampleDownload.text.length > 0, 'サンプルタブのダウンロード内容が空です');
  assert.ok(sampleDownload.text.includes('Hello, PC-98!'), 'サンプルタブのダウンロード内容がソースと一致しません');

  await page.evaluate(async () => {
    await window.pc98workbench.createFile('download-check.asm');
    window.pc98workbench.setValue('CPU 8086\nBITS 16\nORG 100h\n; download check\nret\n');
  });
  const workDownload = await page.evaluate(() => window.pc98workbench.downloadActiveFile());
  assert.equal(workDownload.name, 'download-check.asm', '作業ファイルのダウンロード名がbasenameではありません');
  assert.ok(workDownload.text.includes('; download check'), '作業ファイルのダウンロード内容がエディタと一致しません');

  // ダウンロードボタンのDOM経由クリックは例外を出さない（実ファイルダウンロード自体は検証しない）。
  let downloadClickThrew = null;
  page.once('pageerror', (error) => { downloadClickThrew = error.message; });
  await page.click('#download-file');
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  assert.equal(downloadClickThrew, null, `#download-fileのクリックで例外が発生しました: ${downloadClickThrew}`);
  console.log(`[PASS] download: downloadActiveFile() returns {name, text} for both sample and working tabs (${sampleDownload.name}, ${workDownload.name}), #download-file click throws nothing`);

  // --- 新規作成ポップアップ: 不正拡張子はポップアップ内にエラーを出し閉じない。正しい名前は作成して閉じる ---
  await page.click('#new-file');
  await page.waitForFunction(() => document.querySelector('#new-file-popup').hidden === false);
  // hidden属性だけを見ると「開いてはいるが画面外」を見逃す。実際に配置文脈と
  // 描画位置を測る（ポップアップを.sidebar-actionsの兄弟に置くと offsetParent が
  // body へ落ち、top:calc(100%+4px)がビューポート下端の外を指した実績がある）。
  const popupBox = await page.evaluate(() => {
    const popup = document.querySelector('#new-file-popup');
    const actions = document.querySelector('.sidebar-actions');
    const rect = popup.getBoundingClientRect();
    const anchor = actions.getBoundingClientRect();
    return {
      offsetParentIsActions: popup.offsetParent === actions,
      insideViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
        && rect.left >= 0 && rect.right <= window.innerWidth,
      belowActions: rect.top >= anchor.bottom,
      width: rect.width, height: rect.height,
      inputVisible: document.querySelector('#new-path').getBoundingClientRect().height > 0,
    };
  });
  assert.ok(popupBox.offsetParentIsActions,
    '新規作成ポップアップの配置文脈が.sidebar-actionsではありません（兄弟に置くとbodyへ落ちます）');
  assert.ok(popupBox.insideViewport, '新規作成ポップアップがビューポートの外に出ています');
  assert.ok(popupBox.belowActions, '新規作成ポップアップがボタン列の下に出ていません');
  assert.ok(popupBox.width > 0 && popupBox.height > 0, '新規作成ポップアップの描画サイズが0です');
  assert.ok(popupBox.inputVisible, '新規作成ポップアップの入力欄が描画されていません');
  await page.$eval('#new-path', (node) => { node.value = 'badext.txt'; });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#new-file-error').textContent !== '');
  const invalidExtState = await page.evaluate(() => ({
    hidden: document.querySelector('#new-file-popup').hidden,
    error: document.querySelector('#new-file-error').textContent,
  }));
  assert.equal(invalidExtState.hidden, false, '不正拡張子で新規作成ポップアップが閉じてしまいました');
  assert.ok(invalidExtState.error.includes('.asm'), `不正拡張子のエラーがポップアップ内に出ていません: ${invalidExtState.error}`);

  await page.$eval('#new-path', (node) => { node.value = ''; });
  await page.keyboard.type('popup-created.asm');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#new-file-popup').hidden === true);
  const afterPopupCreate = await page.evaluate(() => ({
    hidden: document.querySelector('#new-file-popup').hidden,
    error: document.querySelector('#new-file-error').textContent,
    currentPath: window.pc98workbench.getState().currentPath,
    currentOrigin: window.pc98workbench.getState().currentOrigin,
  }));
  assert.equal(afterPopupCreate.hidden, true, '正しい名前で作成してもポップアップが閉じません');
  assert.equal(afterPopupCreate.error, '', '作成成功後にエラー表示が残っています');
  assert.equal(afterPopupCreate.currentPath, 'popup-created.asm', '作成したファイルが開かれていません');
  assert.equal(afterPopupCreate.currentOrigin, 'project', '作成したファイルの保存先がこのブラウザではありません');
  console.log('[PASS] new file popup: invalid extension keeps popup open with inline error, valid name creates/opens and closes');

  console.log(`[PASS] file/edit/このブラウザ(project origin)/build/run: ${output}`);
  console.log('[PASS] machine status/prewarm: one status line, asynchronous boot completed, build/debug transitions');
  console.log('[PASS] header/status bar: WebNP2 header, VS Code status colors, 8 footer links (7 license + help) returned HTTP 200, all footer links open in a new tab');
  console.log('[PASS] help entry points: footer "使い方" link and header "?" button both target help.html?lang=ja in a new tab, no overlap with title/tagline (desktop+mobile)');
  console.log(`[PASS] run separator: ${separators} blank prompt lines before a consecutive run`);
  console.log('[PASS] 実キー入力 guard: editor/sidebar stay local, canvas reaches guest DOS');
  console.log(`[PASS] Tab/caret: real tab at cursor (tab-size ${tabbed.tabSize}), caret drawn in ${tabbed.cursor.color}`);
  console.log(`[PASS] syntax colors: ${syntax.length} tokens, min contrast ${Math.min(...syntax.map((t) => t.ratio))}:1 on the dark editor`);
  console.log('[PASS] .c auto build: HELLO-C.EXE');
  console.log('[PASS] structured error: line=4, list=true, gutter=true, wrong-line fault detected');
  console.log(`[PASS] ASM debug in editor: entry=8 next=9 bp=11 cs=${asmDebug.control.cs.toString(16).toUpperCase()} dots=1, non-mapped line rejected`);
  console.log('[PASS] editor toolbar: 8 inline-SVG controls, accessible labels, build/debug mode swap and restore');
  console.log('[PASS] editor tabs: reuse, text/dirty/BP isolation, guarded close, debug-target lock/highlight');
  console.log('[PASS] pane maximize: editor/machine exclusive maximize, sidebar hidden, aria state and restore');
  console.log(`[PASS] splitter: 640px at x${splitEqual.screenScale.toFixed(2)}, editor ${splitEqual.editorWidth}px / machine ${splitEqual.machineWidth}px`);
  console.log('[PASS] Explorer sidebar: tree open/selection sync, visibility API and responsive state');
  console.log('[PASS] WebNP2 header + VS Code Dark Modern workspace/status bar: measured colors and debug transition');
  console.log('[PASS] debug sections: 8 registers, breakpoint list/goto/remove/empty guide');
  console.log('[PASS] workbench disassembly: rows visible while debugging and hidden after stop');
  console.log('[PASS] editor lock: real typing blocked while debugging and accepted after stop');
  console.log('[PASS] pane swap: desktop order reversed/restored and localStorage persisted');
  console.log(`[PASS] C debug in editor: STRLEN.C line 22 "${cDebug.sourceLine}" stop, resumed output "3"`);
  if (forcedRetryCount > 0 || forcedRemountCount > 0) {
    console.log(`[PASS] FD swap self-recovery: retries=${forcedRetryCount} remounts=${forcedRemountCount}`);
  } else {
    console.log('[INFO] FD swap self-recovery: この環境ではドライブエラーを再現しなかったためスキップ');
  }
  console.log('[PASS] disassembly splitter: visible in debug, 80-420px clamp, keyboard guard and restore');
  console.log(`[PASS] sidebar/status overflow: desktop ${desktopChrome.actions}/${desktopChrome.footer}px mobile ${mobileChrome.actions}/${mobileChrome.footer}px`);
  console.log(`[PASS] responsive DOM: desktop editor/screen=${Math.round(desktopLayout.editor.width)}/${Math.round(desktopLayout.screen.width)} mobile=${Math.round(mobile.editor.width)}/${Math.round(mobile.screen.width)}`);
  // --- ヘルプページ: HTTP到達性・言語切替・画像リンク切れの検出 ---
  const helpUrl = new URL('help.html', BASE_URL).href;
  const helpResponse = await fetch(helpUrl);
  assert.equal(helpResponse.status, 200, `help.htmlがHTTP 200ではありません: ${helpUrl}`);

  const helpPage = await browser.newPage();
  try {
    await helpPage.goto(`${helpUrl}?lang=en`, { waitUntil: 'networkidle2' });
    const helpEn = await helpPage.evaluate(() => ({
      dataLang: document.body.getAttribute('data-lang'),
      jaVisible: [...document.querySelectorAll('.lang-ja')].some((node) => node.offsetParent !== null),
      enVisible: [...document.querySelectorAll('.lang-en')].some((node) => node.offsetParent !== null),
      title: document.title,
    }));
    assert.equal(helpEn.dataLang, 'en', '?lang=enでbody[data-lang]がenになりません');
    assert.equal(helpEn.jaVisible, false, '?lang=enなのに日本語(.lang-ja)が見えています');
    assert.equal(helpEn.enVisible, true, '?lang=enなのに英語(.lang-en)が見えていません');
    assert.equal(helpEn.title, 'WorkbenchNP2 Help', '?lang=enでtitleが英語になりません');

    await helpPage.goto(`${helpUrl}?lang=ja`, { waitUntil: 'networkidle2' });
    const helpJa = await helpPage.evaluate(() => ({
      dataLang: document.body.getAttribute('data-lang'),
      jaVisible: [...document.querySelectorAll('.lang-ja')].some((node) => node.offsetParent !== null),
      enVisible: [...document.querySelectorAll('.lang-en')].some((node) => node.offsetParent !== null),
      title: document.title,
      imgSrcs: [...document.querySelectorAll('main img')].map((img) => img.src),
    }));
    assert.equal(helpJa.dataLang, 'ja', '?lang=jaでbody[data-lang]がjaになりません');
    assert.equal(helpJa.jaVisible, true, '?lang=jaなのに日本語(.lang-ja)が見えていません');
    assert.equal(helpJa.enVisible, false, '?lang=jaなのに英語(.lang-en)が見えています');
    assert.equal(helpJa.title, 'WorkbenchNP2 使い方', '?lang=jaでtitleが日本語になりません');
    // 規律: 期待値をわざと逆にしてFAILすることを実測してから戻す。
    assert.throws(() => assert.equal(helpJa.jaVisible, false));

    assert.equal(helpJa.imgSrcs.length, 3, 'help.htmlが参照する画像が3枚ではありません');
    for (const src of helpJa.imgSrcs) {
      const response = await fetch(src);
      assert.equal(response.status, 200, `help.htmlの画像がHTTP 200ではありません: ${src}`);
    }

    // アプリから開いたとき(from=app)は「アプリを開く」導線を出さない。出すと
    // 押した人のアプリのタブが2枚になる。直接来たときは唯一の入口なので必ず出す。
    // hidden属性ではなく実際の描画で測る(offsetParentがnull=描画されていない)。
    const readOpenAppLinks = () => helpPage.evaluate(() => {
      const links = [...document.querySelectorAll('.open-app')];
      return {
        count: links.length,
        rendered: links.filter((link) => link.offsetParent !== null).length,
      };
    });
    await helpPage.goto(`${helpUrl}?lang=ja&from=app`, { waitUntil: 'domcontentloaded' });
    const fromApp = await readOpenAppLinks();
    assert.ok(fromApp.count > 0, '.open-app導線がhelp.htmlにありません');
    assert.equal(fromApp.rendered, 0,
      `from=appで開いたのに「アプリを開く」が${fromApp.rendered}件描画されています（アプリのタブが2枚になります）`);

    await helpPage.goto(`${helpUrl}?lang=ja`, { waitUntil: 'domcontentloaded' });
    const direct = await readOpenAppLinks();
    assert.equal(direct.rendered, direct.count,
      '直接開いたのに「アプリを開く」が描画されていません（アプリへの入口が無くなります）');
    // 規律: 陽性対照。判定が常に真になっていないことを、逆の期待値で実測してから戻す。
    assert.throws(() => assert.equal(direct.rendered, 0));
  } finally {
    await helpPage.close();
  }
  console.log('[PASS] help.html: HTTP 200, ?lang=en/ja切替(表示/title), 参照画像3枚すべてHTTP 200');

  console.log(`[SHOT] ${DESKTOP_SHOT}`);
  console.log(`[SHOT] ${MOBILE_SHOT}`);
} catch (error) {
  // DOS待ちの失敗は推測せず、そのときのTVRAM全行をそのまま出す。
  const screen = page ? await page.evaluate(() => window.pc98workbench.getScreenText()).catch(() => null) : null;
  for (const [index, line] of (screen?.lines ?? []).entries()) console.error(`[TVRAM ${String(index).padStart(2)}] ${line}`);
  console.error(`[ERROR] ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
