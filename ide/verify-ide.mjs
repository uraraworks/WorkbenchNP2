#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from '../toolchain/compile.mjs';
import { makeFd } from '../toolchain/makefd.mjs';

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

function assertEntryStopped(actual) {
  assert.equal(actual.state.entryStopped, true, 'エントリ停止フラグが立っていません');
  assert.equal(actual.state.paused, true, 'エントリでpauseしていません');
  assert.equal(actual.regs.cs, actual.state.loaderControl.cs, 'CPU CSがローダ通知CSと不一致です');
  assert.equal(actual.regs.eip, actual.state.loaderControl.ip, 'CPU IPがローダ通知IPと不一致です');
  assert.equal(actual.regs.ss, actual.state.loaderControl.ss, 'CPU SSがローダ通知SSと不一致です');
  assert.equal(actual.regs.esp & 0xffff, actual.state.loaderControl.sp, 'CPU SPがローダ通知SPと不一致です');
  assert.equal(actual.regs.ds, actual.state.loaderControl.targetPsp, 'CPU DSが対象PSPと不一致です');
  assert.equal(actual.regs.es, actual.state.loaderControl.targetPsp, 'CPU ESが対象PSPと不一致です');
  assert.equal(actual.state.currentLine, actual.entryLine, '停止行が対象の最初の生成行ではありません');
  assert.equal(actual.screen.includes('Hello, PC-98!'), false, 'エントリ停止前に対象が実行されています');
}

function assertTvramContains(screen, expected) {
  assert.ok(screen.includes(expected), `TVRAMに期待文字列がありません: ${expected}`);
}

async function dumpTvram(page, label, harness = 'pc98ide') {
  const screen = await page.evaluate((name) => window[name].getScreenText(), harness);
  console.error(`[ERROR] ${label}: TVRAM ${screen.lines.length} lines, cursor=${JSON.stringify(screen.cursor)}`);
  screen.lines.forEach((line, index) => {
    console.error(`[ERROR] TVRAM ${String(index).padStart(2, '0')}: ${JSON.stringify(line)}`);
  });
}

async function buildCProgramFd() {
  const [source, library] = await Promise.all([
    readFile(join(ROOT, 'samples', 'hello-c.c')),
    readFile(join(ROOT, 'toolchain', 'smlrc-wasm', 'lcds.a')),
  ]);
  const result = await compile(new Uint8Array(source), { library: new Uint8Array(library) });
  if (!result.ok) throw new Error(result.errors.map((error) => `${error.stage}: ${error.message}`).join('\n'));
  assert.equal(result.output[0] | (result.output[1] << 8), 0x5a4d, 'C出力がMZ EXEではありません');
  return {
    fd: makeFd([{ name: 'HELLOC', ext: 'EXE', data: result.output }]),
    exeSize: result.output.byteLength,
  };
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
let cPage;
let targetLine;
let nextLine;
let cProgramFd;

try {
  await check(1, '静的IDE・Chrome・wasm NASM・NP2kai起動', async () => {
    cProgramFd = await buildCProgramFd();
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
    assert.equal(state.entryStopped, true);
    assert.ok(Number.isInteger(state.programCs) && state.programCs > 0, `CSが不正です: ${state.programCs}`);
  });

  await check(2, '無改変COMを4B01hロードし、1命令目の実行前に停止', async () => {
    const evidence = await page.evaluate(() => ({
      lines: document.querySelectorAll('[data-source-line]').length,
      mapped: document.querySelectorAll('[data-source-line][data-debuggable]').length,
      programCs: Number(document.body.dataset.programCs),
      status: document.querySelector('#status').textContent,
      source: Array.from(document.querySelectorAll('[data-source-line]'), (row) => row.dataset.text).join('\n'),
      state: window.pc98ide.getState(),
      regs: window.pc98ide.getRegisters(),
      screen: window.pc98ide.getScreenText().text,
      entryLine: Number(document.querySelector('[data-source-line][data-debuggable]').dataset.sourceLine),
    }));
    assert.ok(evidence.lines >= 10);
    assert.ok(evidence.mapped >= 6);
    assert.ok(evidence.status.includes('4B01hローダ'), `ローダ方式の表示がありません: ${evidence.status}`);
    assert.equal(evidence.source.includes('PC98DEV_IDE'), false, 'hello.asmにIDE待機スタブが残っています');
    assert.equal(evidence.state.programSize, 28, '無改変HELLO.COMが28 bytesではありません');
    assert.equal(evidence.state.targetBytesMatched, true, 'ロード済み対象が無改変HELLO.COMと不一致です');
    assert.equal(evidence.programCs, evidence.state.programCs);
    assertEntryStopped(evidence);
    await page.click('#step');
    const stepped = await page.evaluate(() => window.pc98ide.getState());
    assert.equal(stepped.lastStepCount, 1);
    assert.equal(stepped.entryStopped, false);
  });

  await check(3, 'クリックしたソース行のBPで停止・同じ行を強調', async () => {
    targetLine = await page.$$eval('[data-source-line][data-debuggable]', (rows) => {
      const row = rows.find((item) => /^\s*int\s+21h/i.test(item.dataset.text ?? ''));
      return row ? Number(row.dataset.sourceLine) : null;
    });
    assert.ok(Number.isInteger(targetLine), '最初のint 21hのマップ行がありません');
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
    await sleep(1_000);
    const diagnostic = await page.evaluate(() => window.pc98ide.capturePostExit());
    const regs = diagnostic.registers;
    console.log(`[INFO] post-exit CPU: wasPaused=${diagnostic.wasPaused} `
      + `CS:IP=${regs.cs.toString(16).padStart(4, '0')}:${regs.eip.toString(16).padStart(4, '0')} `
      + `SS:SP=${regs.ss.toString(16).padStart(4, '0')}:${(regs.esp & 0xffff).toString(16).padStart(4, '0')} `
      + `instruction=${JSON.stringify(diagnostic.disassembly[0] ?? null)}`);
    console.log(`[INFO] loader PSP: loader=${diagnostic.loaderControl.loaderPsp.toString(16)} `
      + `target=${diagnostic.loaderControl.targetPsp.toString(16)} `
      + `DOS-current-after-4B01=${diagnostic.loaderControl.currentPsp.toString(16)}`);
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

  await check(8, '検証ガードが意図的な停止行・エントリ証拠の破壊を検出', async () => {
    const good = { currentLine: targetLine, selectedLine: targetLine, paused: true };
    assert.doesNotThrow(() => assertStoppedAt(good, targetLine));
    assert.throws(() => assertStoppedAt({ ...good, currentLine: targetLine + 1 }, targetLine));
    const entryEvidence = await page.evaluate(() => {
      const state = window.pc98ide.getState();
      const first = document.querySelector('[data-source-line][data-debuggable]');
      return {
        state: { ...state, entryStopped: true, paused: true, currentLine: Number(first.dataset.sourceLine) },
        regs: {
          ...window.pc98ide.getRegisters(),
          cs: state.loaderControl.cs, eip: state.loaderControl.ip,
          ss: state.loaderControl.ss, esp: state.loaderControl.sp,
          ds: state.loaderControl.targetPsp, es: state.loaderControl.targetPsp,
        },
        entryLine: Number(first.dataset.sourceLine), screen: '',
      };
    });
    assert.doesNotThrow(() => assertEntryStopped(entryEvidence));
    assert.throws(() => assertEntryStopped({
      ...entryEvidence, regs: { ...entryEvidence.regs, eip: entryEvidence.regs.eip + 1 },
    }));
    assert.throws(() => assertEntryStopped({ ...entryEvidence, screen: 'Hello, PC-98!' }));
  });

  await check(9, 'C small-model EXEをFAT12 FDから実行しTVRAM出力を確認', async () => {
    cPage = await browser.newPage();
    await cPage.setViewport({ width: 800, height: 500, deviceScaleFactor: 1 });
    await cPage.goto(new URL('c-runner.html', BASE_URL).href, { waitUntil: 'networkidle2' });
    await cPage.evaluate(() => window.pc98c.ready);
    const paused = await cPage.evaluate(() => window.pc98c.isCpuPaused());
    console.log(`[INFO] check 9 precondition: dbgIsPaused=${paused}`);
    assert.equal(paused, false, 'チェック9開始時にCPUがpauseしています');

    const prompt = await cPage.evaluate(() => window.pc98c.waitForPrompt());
    console.log(`[INFO] check 9 active prompt: row=${prompt.cursor.row} line=${JSON.stringify(prompt.cursorLine)}`);

    await cPage.evaluate(async (bytes) => {
      await window.pc98c.insertProgramFd('smallerc.xdf', bytes);
    }, Array.from(cProgramFd.fd));
    await sleep(1_000);
    const beforeDir = await cPage.evaluate(() => window.pc98c.getScreenText().text);
    await cPage.evaluate(() => window.pc98c.pasteDosCommand('DIR B:'));
    const directory = await cPage.evaluate((baseline) => window.pc98c.waitForPrompt(baseline), beforeDir);
    const listed = new RegExp(`HELLOC\\s+EXE\\s+${cProgramFd.exeSize.toLocaleString('en-US').replace(',', ',?')}`, 'i');
    assert.match(directory.text, listed, 'DIR B:に生成したHELLOC.EXEと期待サイズがありません');
    console.log(`[INFO] check 9 FD: HELLOC.EXE ${cProgramFd.exeSize} bytes`);

    await cPage.evaluate(() => window.pc98c.pasteDosCommand('B:\\HELLOC'));
    try {
      await cPage.waitForFunction(
        () => window.pc98c.getScreenText()?.text.includes('Hello from C on PC-98!'),
        { timeout: 15_000 },
      );
    } catch (error) {
      await dumpTvram(cPage, 'check 9 timeout after B:\\HELLOC', 'pc98c');
      throw error;
    }
    const screen = await cPage.evaluate(() => window.pc98c.getScreenText().text);
    assertTvramContains(screen, 'Hello from C on PC-98!');
    assert.throws(() => assertTvramContains(screen, 'Hello from C on PC-99!'));
  });
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
if (results.some((result) => !result)) process.exitCode = 1;
