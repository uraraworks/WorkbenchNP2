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
const SHOT_DIR = '/private/tmp/claude-501/-Users-haruurara-MyProject--emulator-PC98/ebf3c7ad-2505-4d39-9ee7-ff750b61b82a/scratchpad';
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

let server; let browser; let profile;
try {
  if (!process.env.PC98DEV_URL) server = await startServer();
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(`${tmpdir()}/pc98dev-workbench-`);
  browser = await puppeteer.launch({
    executablePath: CHROME, userDataDir: profile, headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
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

  await page.evaluate(() => window.pc98workbench.openFile('project', 'samples/hello.asm'));
  const desktopLayout = await page.evaluate(() => window.pc98workbench.getLayout());
  assert.equal(desktopLayout.contentEditable, true, 'CodeMirrorがcontentEditableではありません');
  assert.ok(desktopLayout.editor.width > 500 && desktopLayout.screen.width > 500, 'デスクトップのエディタ/画面幅が不足しています');
  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: DESKTOP_SHOT });

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
  console.log(`[PASS] responsive DOM: desktop editor/screen=${Math.round(desktopLayout.editor.width)}/${Math.round(desktopLayout.screen.width)} mobile=${Math.round(mobile.editor.width)}/${Math.round(mobile.screen.width)}`);
  console.log(`[SHOT] ${DESKTOP_SHOT}`);
  console.log(`[SHOT] ${MOBILE_SHOT}`);
} catch (error) {
  console.error(`[ERROR] ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
