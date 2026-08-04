#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const BASE_URL = process.env.PC98DEV_URL ?? 'http://127.0.0.1:5184/ide/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = '/private/tmp/claude-501/-Users-haruurara-MyProject--emulator-PC98/ebf3c7ad-2505-4d39-9ee7-ff750b61b82a/scratchpad/pc98dev-ide.png';
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function loadPuppeteer() {
  try {
    return (await import('puppeteer-core')).default;
  } catch {
    // 兄弟WebNP2と同じ起動環境を流用する。PC98Devへ単独導入した場合は通常のimportが先に使われる。
    const requireFromWebNP2 = createRequire(new URL('../../WebNP2/package.json', import.meta.url));
    return requireFromWebNP2('puppeteer-core');
  }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.xdf': 'application/octet-stream', '.bmp': 'image/bmp',
  '.asm': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

function startServer() {
  return new Promise((resolveStart, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const file = resolve(ROOT, `.${pathname}`);
        if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
          response.writeHead(403).end('forbidden'); return;
        }
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch {
        response.writeHead(404).end('not found');
      }
    });
    server.once('error', reject);
    server.listen(5184, '127.0.0.1', () => resolveStart(server));
  });
}

function assertStoppedAt(actual, expected) {
  assert.equal(actual.currentLine, expected, `強調行 ${actual.currentLine} != BP行 ${expected}`);
  assert.equal(actual.selectedLine, expected, `選択BP行 ${actual.selectedLine} != ${expected}`);
  assert.equal(actual.paused, true, 'BP停止時にpauseではありません');
}

const results = [];
async function check(number, name, action) {
  try {
    await action();
    results.push(true);
    console.log(`[PASS] ${number}. ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`[FAIL] ${number}. ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let server;
let browser;
let profile;
let page;
let targetLine;
let nextLine;

try {
  await check(1, '静的IDE・Chrome・wasm NASM・NP2kai起動', async () => {
    if (!process.env.PC98DEV_URL) server = await startServer();
    const puppeteer = await loadPuppeteer();
    profile = await mkdtemp(join(tmpdir(), 'pc98dev-ide-'));
    browser = await puppeteer.launch({
      executablePath: CHROME,
      userDataDir: profile,
      headless: 'new',
      args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => window.pc98ide.ready);
    assert.deepEqual(pageErrors, []);
    const state = await page.evaluate(() => window.pc98ide.getState());
    assert.equal(state.paused, true);
    assert.ok(Number.isInteger(state.programCs) && state.programCs > 0, `CSが不正です: ${state.programCs}`);
  });

  await check(2, 'ソース・行マップ・RAM実測CSを表示', async () => {
    const evidence = await page.evaluate(() => ({
      lines: document.querySelectorAll('[data-source-line]').length,
      mapped: document.querySelectorAll('[data-source-line][data-debuggable]').length,
      programCs: Number(document.body.dataset.programCs),
      status: document.querySelector('#status').textContent,
    }));
    assert.ok(evidence.lines >= 10);
    assert.ok(evidence.mapped >= 7);
    assert.ok(evidence.status.includes('PSP/CS='), `RAM実測の表示がありません: ${evidence.status}`);
    assert.equal(evidence.programCs, (await page.evaluate(() => window.pc98ide.getState())).programCs);
    await page.click('#step');
    assert.equal((await page.evaluate(() => window.pc98ide.getState())).lastStepCount, 1);
  });

  await check(3, 'クリックしたソース行のBPで停止・同じ行を強調', async () => {
    targetLine = await page.$$eval('[data-source-line][data-debuggable]', (rows) => {
      const row = rows.find((item) => /mov\s+ah,09h/i.test(item.dataset.text ?? ''));
      return row ? Number(row.dataset.sourceLine) : null;
    });
    assert.ok(Number.isInteger(targetLine), 'mov ah,09hのマップ行がありません');
    await page.click(`[data-source-line="${targetLine}"]`);
    assert.equal((await page.evaluate(() => window.pc98ide.getState())).selectedLine, targetLine);
    await page.click('#continue');
    await page.waitForFunction((line) => window.pc98ide.getState().currentLine === line, { timeout: 30_000 }, targetLine);
    const state = await page.evaluate(() => window.pc98ide.getState());
    assertStoppedAt(state, targetLine);
    assert.equal(await page.$eval(`[data-source-line="${targetLine}"]`, (row) => row.classList.contains('current')), true);
  });

  await check(4, '次のソース行まで実行して強調行が進む', async () => {
    nextLine = await page.$$eval('[data-source-line][data-debuggable]', (rows, current) => {
      const numbers = rows.map((row) => Number(row.dataset.sourceLine));
      return numbers.find((line) => line > current) ?? null;
    }, targetLine);
    assert.ok(Number.isInteger(nextLine), '次の生成行がありません');
    await page.click('#next-line');
    await page.waitForFunction((line) => window.pc98ide.getState().currentLine === line, { timeout: 10_000 }, nextLine);
    const state = await page.evaluate(() => window.pc98ide.getState());
    assert.equal(state.currentLine, nextLine);
    assert.equal(await page.$eval(`[data-source-line="${nextLine}"]`, (row) => row.classList.contains('current')), true);
  });

  await check(5, 'IDE独自レジスタ表示が実レジスタ値と一致', async () => {
    const values = await page.$$eval('[data-ide-register]', (nodes) => Object.fromEntries(
      nodes.map((node) => [node.dataset.ideRegister, Number(node.dataset.value)]),
    ));
    const regs = await page.evaluate(() => window.pc98ide.getRegisters());
    for (const name of ['eax', 'ebx', 'ecx', 'edx', 'esp', 'eip', 'cs', 'eflags']) {
      assert.equal(values[name], regs[name] >>> 0, `${name}の表示が実値と不一致`);
    }
    assert.equal(values.cs, (await page.evaluate(() => window.pc98ide.getState())).programCs);
  });

  await check(6, '通常実行でHello, PC-98!をTVRAMから確認', async () => {
    await page.click('#run');
    await page.waitForFunction(
      () => window.pc98ide.getScreenText()?.text.includes('Hello, PC-98!'),
      { timeout: 15_000 },
    );
    assert.ok((await page.evaluate(() => window.pc98ide.getScreenText().text)).includes('Hello, PC-98!'));
  });

  await check(7, '意図したIDE状態を可視化してスクリーンショット保存', async () => {
    const visible = await page.evaluate(() => {
      const shown = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
          && rect.left < innerWidth && rect.top < innerHeight);
      };
      return {
        canvas: shown('#screen'), source: shown('[data-source-line].current'),
        register: shown('[data-ide-register="eip"]'), disasm: shown('.debugger-disasm-row'),
      };
    });
    assert.deepEqual(visible, { canvas: true, source: true, register: true, disasm: true });
    await mkdir(dirname(SHOT), { recursive: true });
    await page.screenshot({ path: SHOT });
    console.log(`[SHOT] ${SHOT}`);
  });

  await check(8, '検証ガードが意図的な停止行ずれを検出', async () => {
    const good = { currentLine: targetLine, selectedLine: targetLine, paused: true };
    assert.doesNotThrow(() => assertStoppedAt(good, targetLine));
    assert.throws(() => assertStoppedAt({ ...good, currentLine: targetLine + 1 }, targetLine));
  });
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
if (results.some((result) => !result)) process.exitCode = 1;
