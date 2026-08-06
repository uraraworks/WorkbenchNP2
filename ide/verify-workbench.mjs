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
          '.txt': 'text/plain; charset=utf-8',
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
  }));
  const theme = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      editorBackground: rootStyle.getPropertyValue('--vsc-editor-bg').trim(),
      uiBackground: rootStyle.getPropertyValue('--vsc-ui-bg').trim(),
      debuggingBackground: rootStyle.getPropertyValue('--vsc-debugging').trim(),
      normalHeaderBackground: getComputedStyle(document.querySelector('.app-header')).backgroundColor,
    };
  });
  assert.ok(shell.machineStatus.trim(), 'ready直後の統合状況表示が空です');
  assert.equal(shell.runtimeStatusExists, false, '#runtime-statusが残っています');
  assert.equal(shell.debugStatusExists, false, '#debug-statusが残っています');
  assert.equal(shell.hasDebugPageLink, false, 'ヘッダに削除済みデバッガページへのリンクがあります');
  assert.equal(shell.footerHrefs.length, 7, 'フッタのライセンスリンクが7件ではありません');
  assert.ok(theme.editorBackground && theme.uiBackground && theme.debuggingBackground,
    ':rootのVS Codeテーマ変数が定義されていません');
  for (const href of shell.footerHrefs) {
    const response = await fetch(href);
    assert.equal(response.status, 200, `フッタリンクがHTTP 200ではありません: ${href}`);
  }
  await page.evaluate(() => window.pc98workbench.prewarm);
  assert.equal(await page.evaluate(() => window.pc98workbench.getMachineStatus()),
    'エミュレータ起動しました。実行の準備ができています', 'プリウォーム完了表示が不一致です');
  assert.deepEqual(await page.evaluate(() => window.pc98workbench.getState()), {
    currentPath: 'samples/hello.asm', currentOrigin: 'sample', dirty: false, errors: [], built: null,
  });
  const toolButtonIds = [
    'build', 'run', 'debug', 'debug-continue', 'debug-step-over', 'debug-step-into',
    'debug-step-instruction', 'debug-restart', 'debug-stop',
  ];
  const readToolbar = () => page.$$eval('.editor-toolbar button', (buttons) => buttons.map((button) => {
    const svg = button.querySelector('svg');
    return {
      id: button.id, disabled: button.disabled, title: button.title,
      ariaLabel: button.getAttribute('aria-label'), insideToolbar: Boolean(button.closest('.editor-toolbar')),
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
  assert.deepEqual(normalToolbar.map((button) => button.id), toolButtonIds, 'ツールバーの9ボタン構成が不一致です');
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
  await page.evaluate(() => window.pc98workbench.saveFile());
  const files = await page.evaluate(() => window.pc98workbench.listProjectFiles());
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'samples/hello.asm');
  assert.ok(files[0].content.includes(output));

  const beforeBuildStatus = await page.evaluate(() => window.pc98workbench.getMachineStatus());
  const firstBuild = await page.evaluate(() => window.pc98workbench.buildCurrent());
  assert.equal(firstBuild.ok, true, JSON.stringify(firstBuild.errors));
  const afterBuildStatus = await page.evaluate(() => window.pc98workbench.getMachineStatus());
  assert.notEqual(afterBuildStatus, beforeBuildStatus, 'ビルド後に統合状況表示が変化しません');
  assert.equal(afterBuildStatus, 'ビルド完了。実行できます');

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

  const guardedSource = await page.evaluate(() => ({
    source: window.pc98workbench.getValue(), screen: window.pc98workbench.getScreenText().text,
    targets: window.pc98workbench.getGuardedKeyboardTargets(),
  }));
  assert.deepEqual(guardedSource.targets, ['.file-bar', '.editor-card', '.debug-panel']);
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

  const formScreen = await page.evaluate(() => window.pc98workbench.getScreenText().text);
  await page.click('#new-path');
  await page.keyboard.type('guarded/main.asm');
  assert.equal(await page.$eval('#new-path', (node) => node.value), 'guarded/main.asm');
  const formScreenAfter = await page.evaluate(() => window.pc98workbench.getScreenText().text);
  assert.equal(formScreenAfter, formScreen, 'ファイル名の実キー入力がゲスト画面を変えました');
  assert.ok(!formScreenAfter.toLowerCase().includes('guarded/main.asm'), 'ファイル名がゲストへ漏れました');
  await page.$eval('#new-path', (node) => { node.value = ''; });

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
  const cBuild = await page.evaluate(() => window.pc98workbench.buildCurrent());
  assert.equal(cBuild.ok, true, JSON.stringify(cBuild.errors));
  assert.equal(cBuild.dosName, 'HELLO-C.EXE');

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
  await page.evaluate(() => window.pc98workbench.openFile('project', 'samples/hello.asm'));
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
  assert.notEqual(asmDebug.headerBackground, theme.normalHeaderBackground,
    'デバッグ開始後もヘッダの背景色が通常時と同じです');

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
  assert.ok(debugToolbar.slice(3).every((button) => !button.disabled), 'デバッグ中に無効なデバッグ操作があります');
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
  assert.deepEqual(await page.evaluate(() => ({
    mode: window.pc98workbench.getToolbarMode(),
    buildHidden: document.querySelector('#build-actions').hidden,
    debugHidden: document.querySelector('#debug-actions').hidden,
  })), { mode: 'build', buildHidden: false, debugHidden: true }, 'デバッグ停止後に通常ツールバーへ戻りません');
  // 通常実行へ戻したら停止行強調とレジスタは消す。BPは利用者の意図なので次のデバッグまで残す。
  assert.deepEqual(await page.evaluate(() => window.pc98workbench.getEditorMarks()),
    {
      breakpointDots: 1, currentLine: null, registers: [], debugPanelVisible: false,
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
  await page.evaluate(() => window.pc98workbench.openFile('sample', 'samples/legacy/kensyuu/STRLEN.C'));
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

  // 固定待ちを0にして媒体交換を急がせ、DOS画面を見た自己回復経路を可能な限り強制する。
  const forcedRecovery = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    const retriesBefore = wb.getDriveErrorRetries();
    wb.setFdSwapDelay(0);
    const forcedDelay = wb.getFdSwapDelay();
    try {
      await wb.openFile('sample', 'samples/second-run.asm');
      await wb.buildCurrent();
      const run = await wb.runCurrent();
      return {
        run, forcedDelay, retriesBefore, retriesAfter: wb.getDriveErrorRetries(),
      };
    } finally {
      wb.setFdSwapDelay(300);
    }
  });
  assert.equal(forcedRecovery.forcedDelay, 0, 'FD差し替え待ちを0msへ設定できません');
  assertRun(forcedRecovery.run.screen, 'Second debug run!');
  assert.equal(await page.evaluate(() => window.pc98workbench.getFdSwapDelay()), 300,
    '強制検証後にFD差し替え待ちが300msへ戻っていません');
  const forcedRetryCount = forcedRecovery.retriesAfter - forcedRecovery.retriesBefore;

  await page.evaluate(() => window.pc98workbench.openFile('project', 'samples/hello.asm'));
  // フォルダ操作を足した後もファイルバーが横にはみ出さないことを、実測値で確認する。
  const fileBar = () => page.$eval('.file-bar', (node) => ({
    overflow: node.scrollWidth - node.clientWidth,
    folderOpen: node.querySelector('#folder-open').getBoundingClientRect().width > 0,
    folderState: node.querySelector('#folder-state').textContent,
  }));
  const desktopBar = await fileBar();
  assert.ok(desktopBar.overflow <= 1, `デスクトップのファイルバーがはみ出しています: ${desktopBar.overflow}px`);
  assert.equal(desktopBar.folderOpen, true, 'フォルダを開くボタンが表示されていません');
  assert.equal(desktopBar.folderState, 'フォルダ未接続', '未接続時のフォルダ表示が期待と不一致です');

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
  await page.evaluate(() => new Promise((resolveWait) => requestAnimationFrame(() => requestAnimationFrame(resolveWait))));
  const mobile = await page.evaluate(() => ({ ...window.pc98workbench.getLayout(), viewport: { width: innerWidth, height: innerHeight } }));
  const visible = (rect) => rect.width > 0 && rect.height > 0 && rect.top < mobile.viewport.height && rect.bottom > 0;
  assert.equal(mobile.contentEditable, true);
  assert.ok(visible(mobile.editor) && mobile.editor.width <= 355 && mobile.editor.height >= 280,
    `モバイルeditorが使用可能領域にありません: ${JSON.stringify(mobile.editor)}`);
  assert.ok(visible(mobile.screen) && mobile.screen.width >= 330,
    `モバイルPC-98画面がviewportにありません: ${JSON.stringify(mobile.screen)}`);
  const mobileBar = await fileBar();
  assert.ok(mobileBar.overflow <= 1, `モバイルのファイルバーがはみ出しています: ${mobileBar.overflow}px`);
  assert.equal(mobileBar.folderOpen, true, 'モバイルでフォルダを開くボタンが表示されていません');
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

  console.log(`[PASS] file/edit/IndexedDB/build/run: ${output}`);
  console.log('[PASS] machine status/prewarm: one status line, asynchronous boot completed, build/debug transitions');
  console.log('[PASS] header/footer: retired debugger link absent, 7 license links returned HTTP 200');
  console.log(`[PASS] run separator: ${separators} blank prompt lines before a consecutive run`);
  console.log('[PASS] 実キー入力 guard: editor/file bar stay local, canvas reaches guest DOS');
  console.log(`[PASS] Tab/caret: real tab at cursor (tab-size ${tabbed.tabSize}), caret drawn in ${tabbed.cursor.color}`);
  console.log('[PASS] .c auto build: HELLO-C.EXE');
  console.log('[PASS] structured error: line=4, list=true, gutter=true, wrong-line fault detected');
  console.log(`[PASS] ASM debug in editor: entry=8 next=9 bp=11 cs=${asmDebug.control.cs.toString(16).toUpperCase()} dots=1, non-mapped line rejected`);
  console.log('[PASS] editor toolbar: 9 inline-SVG controls, accessible labels, build/debug mode swap and restore');
  console.log('[PASS] VS Code Dark Modern theme: --vsc-* variables and debugging header transition');
  console.log('[PASS] workbench disassembly: rows visible while debugging and hidden after stop');
  console.log('[PASS] editor lock: real typing blocked while debugging and accepted after stop');
  console.log('[PASS] pane swap: desktop order reversed/restored and localStorage persisted');
  console.log(`[PASS] C debug in editor: STRLEN.C line 22 "${cDebug.sourceLine}" stop, resumed output "3"`);
  if (forcedRetryCount > 0) {
    console.log(`[PASS] FD swap self-recovery: delay=0ms retries=${forcedRetryCount} total=${forcedRecovery.retriesAfter}`);
  } else {
    console.log('[INFO] FD swap self-recovery: この環境では待ち0でもドライブエラーを再現しなかったためスキップ');
  }
  console.log(`[PASS] file bar: folder controls visible, no overflow (desktop ${desktopBar.overflow}px / mobile ${mobileBar.overflow}px)`);
  console.log(`[PASS] responsive DOM: desktop editor/screen=${Math.round(desktopLayout.editor.width)}/${Math.round(desktopLayout.screen.width)} mobile=${Math.round(mobile.editor.width)}/${Math.round(mobile.screen.width)}`);
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
