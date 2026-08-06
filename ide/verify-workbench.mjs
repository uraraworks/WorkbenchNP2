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
  assert.deepEqual(await page.evaluate(() => window.pc98workbench.getState()), {
    currentPath: 'samples/hello.asm', currentOrigin: 'sample', dirty: false, errors: [], built: null,
  });

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

  const run = await page.evaluate(() => window.pc98workbench.runCurrent());
  assert.equal(run.ok, true);
  assert.equal(run.dosName, 'HELLO.COM');
  assertRun(run.screen, output);
  assert.throws(() => assertRun(run.screen, 'Workbench typo!'));

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
    const started = await wb.startDebug();
    const entry = { state: wb.getDebugState(), marks: wb.getEditorMarks(), registers: wb.getRegisters() };
    const stepped = wb.stepOverLine();
    const afterStep = { state: wb.getDebugState(), marks: wb.getEditorMarks() };
    const hit = wb.continueToBreakpoint();
    return {
      control: started.control, entry, stepped: stepped.line, afterStep,
      hit: { line: hit.line, eip: hit.registers.eip, cs: hit.registers.cs },
      atBreakpoint: { state: wb.getDebugState(), marks: wb.getEditorMarks() },
      cpuPaused: wb.isCpuPaused(),
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
  assert.equal(asmDebug.cpuPaused, true, 'BP停止中なのにCPUが動いています');

  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: DESKTOP_SHOT });

  const asmResume = await page.evaluate(() => window.pc98workbench.stopDebug());
  assertRun(asmResume, output);
  assert.throws(() => assertRun(asmResume, 'Workbench typo!'));
  // 通常実行へ戻したら停止行強調とレジスタは消す。BPは利用者の意図なので次のデバッグまで残す。
  assert.deepEqual(await page.evaluate(() => window.pc98workbench.getEditorMarks()),
    { breakpointDots: 1, currentLine: null, registers: [], debugPanelVisible: false },
    'デバッグ終了後のエディタ状態が期待と不一致です');

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

  await page.evaluate(() => window.pc98workbench.openFile('project', 'samples/hello.asm'));
  const desktopLayout = await page.evaluate(() => window.pc98workbench.getLayout());
  assert.equal(desktopLayout.contentEditable, true, 'CodeMirrorがcontentEditableではありません');
  assert.ok(desktopLayout.editor.width > 500 && desktopLayout.screen.width > 500, 'デスクトップのエディタ/画面幅が不足しています');
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await page.evaluate(() => new Promise((resolveWait) => requestAnimationFrame(() => requestAnimationFrame(resolveWait))));
  const mobile = await page.evaluate(() => ({ ...window.pc98workbench.getLayout(), viewport: { width: innerWidth, height: innerHeight } }));
  const visible = (rect) => rect.width > 0 && rect.height > 0 && rect.top < mobile.viewport.height && rect.bottom > 0;
  assert.equal(mobile.contentEditable, true);
  assert.ok(visible(mobile.editor) && mobile.editor.width <= 355 && mobile.editor.height >= 280,
    `モバイルeditorが使用可能領域にありません: ${JSON.stringify(mobile.editor)}`);
  assert.ok(visible(mobile.screen) && mobile.screen.width >= 330,
    `モバイルPC-98画面がviewportにありません: ${JSON.stringify(mobile.screen)}`);
  await page.screenshot({ path: MOBILE_SHOT });

  console.log(`[PASS] file/edit/IndexedDB/build/run: ${output}`);
  console.log('[PASS] .c auto build: HELLO-C.EXE');
  console.log('[PASS] structured error: line=4, list=true, gutter=true, wrong-line fault detected');
  console.log(`[PASS] ASM debug in editor: entry=8 next=9 bp=11 cs=${asmDebug.control.cs.toString(16).toUpperCase()} dots=1, non-mapped line rejected`);
  console.log(`[PASS] C debug in editor: STRLEN.C line 22 "${cDebug.sourceLine}" stop, resumed output "3"`);
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
