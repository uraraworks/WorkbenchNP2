#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const BASE_URL = process.env.PC98DEV_URL ?? 'http://127.0.0.1:5189/ide/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
        if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
          response.writeHead(403).end('forbidden'); return;
        }
        const body = await readFile(file);
        const types = {
          '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
          '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
          '.wasm': 'application/wasm', '.xdf': 'application/octet-stream',
          '.asm': 'text/plain; charset=utf-8', '.c': 'text/plain; charset=utf-8',
          '.txt': 'text/plain; charset=utf-8',
        };
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404).end('not found'); }
    });
    server.once('error', reject);
    server.listen(5189, '127.0.0.1', () => resolveStart(server));
  });
}

function assertLoadedTarget(control, memory, output) {
  assert.equal(memory[0], 0xcd, 'PSP先頭がINT 20hではありません');
  assert.equal(memory[1], 0x20, 'PSP先頭がINT 20hではありません');
  assert.deepEqual(memory.slice(0x100), output, 'ロード済み対象がビルド出力と不一致です');
  assert.equal(control.kind, 0, '対象がCOMではありません');
  assert.equal(control.ip, 0x0100, 'COM初期IPが0100hではありません');
  assert.equal(control.cs, control.targetPsp, 'COM初期CSが対象PSPと不一致です');
  assert.equal(control.ss, control.targetPsp, 'COM初期SSが対象PSPと不一致です');
  assert.ok(control.loaderPsp < control.targetPsp, 'ローダPSPが対象PSPより下位ではありません');
}

function assertLoaderExited(diagnostic, int22, expectedCode) {
  assert.equal(diagnostic.loaderControl.execReturns, 2, 'EXEC直後へ2回戻っていません');
  assert.deepEqual(int22, {
    ip: diagnostic.loaderControl.execReturnIp,
    cs: diagnostic.loaderControl.loaderPsp,
  }, '子PSPのINT 22hがEXEC直後を指していません');
  assert.deepEqual({
    sp: diagnostic.loaderControl.returnSp, ss: diagnostic.loaderControl.returnSs,
  }, {
    sp: diagnostic.loaderControl.parentSp, ss: diagnostic.loaderControl.parentSs,
  }, '子終了時にDOSが復元したSS:SPが親スタックと一致しません');
  assert.match(diagnostic.waitDisassembly[0]?.text ?? '', /^cmp\b/i, '待機ループ先頭がcmpではありません');
  assert.match(diagnostic.waitDisassembly[0]?.text ?? '', /\bcs\b/i, '待機ループのcmpがCS相対ではありません');
  assert.deepEqual(diagnostic.waitDisassembly[1]?.bytes, [0x75, 0xf8], '待機ループ末尾が75 F8ではありません');
  assert.match(diagnostic.waitDisassembly[1]?.text ?? '', /^jn(?:e|z)\b/i, '待機ループ末尾がjnz/jneではありません');
  assert.equal(diagnostic.loaderControl.childReturn, expectedCode,
    `AH=4Dhの返却AXが期待値${expectedCode.toString(16)}ではありません`);
}

function hasExactTvramLine(screen, expected) {
  return screen.lines.some((line) => line.trim() === expected);
}

let server;
let browser;
let profile;
let page;

try {
  if (!process.env.PC98DEV_URL) server = await startServer();
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(`${tmpdir()}/pc98dev-loader-`);
  browser = await puppeteer.launch({
    executablePath: CHROME, userDataDir: profile, headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => window.pc98workbench.ready);
  assert.deepEqual(pageErrors, []);

  // (1) workbenchのビルド成果物そのものが、通知されたPSP:0100hへロードされていることを確認する。
  const loaded = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    await wb.openFile('sample', 'samples/hello.asm');
    await wb.buildCurrent();
    const output = wb.getBuiltOutput();
    const started = await wb.startDebug();
    const control = wb.getLoaderControl();
    return {
      started, control, output,
      memory: wb.readGuestMemory(control.targetPsp * 16, 0x100 + output.length),
    };
  });
  assertLoadedTarget(loaded.control, loaded.memory, loaded.output);
  const corrupted = [...loaded.output];
  corrupted[0] ^= 0xff;
  assert.throws(() => assertLoadedTarget(loaded.control, loaded.memory, corrupted));
  console.log(`[INFO] loaded target: bytes=${loaded.output.length} PSP=${loaded.control.targetPsp.toString(16)} `
    + `CS:IP=${loaded.control.cs.toString(16)}:${loaded.control.ip.toString(16)}`);
  console.log('[PASS] 1. ロード済み対象がビルド出力とバイト単位で一致する');

  // (2) 子終了後、ローダ自身がCOMMAND.COMへ戻る直前の制御ブロックと待機コードを検証する。
  const firstExit = await page.evaluate(() => window.pc98workbench.runTargetToLoaderExit());
  const int22Bytes = await page.evaluate((targetPsp) => (
    window.pc98workbench.readGuestMemory(targetPsp * 16 + 0x0a, 4)
  ), firstExit.loaderControl.targetPsp);
  const int22 = {
    ip: int22Bytes[0] | (int22Bytes[1] << 8),
    cs: int22Bytes[2] | (int22Bytes[3] << 8),
  };
  assertLoaderExited(firstExit, int22, 0x0000);
  assert.throws(() => assertLoaderExited({
    ...firstExit,
    loaderControl: { ...firstExit.loaderControl, execReturns: 1 },
  }, int22, 0x0000));
  console.log(`[INFO] loader exit: execReturns=${firstExit.loaderControl.execReturns} `
    + `childReturn=${firstExit.loaderControl.childReturn.toString(16).padStart(4, '0')} `
    + `CS:IP=${firstExit.registers.cs.toString(16)}:${firstExit.registers.eip.toString(16)} `
    + `INT22=${int22.cs.toString(16)}:${int22.ip.toString(16)}`);
  console.log('[PASS] 2. ローダ終了直前の内部状態');

  // (3) 同じFreeDOS/NP2セッションを保ったまま別のCOMをデバッグし、ERRORLEVELまで追跡する。
  await page.evaluate(() => window.pc98workbench.stopDebug());
  const secondEntry = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    await wb.openFile('sample', 'samples/second-run.asm');
    await wb.buildCurrent();
    const started = await wb.startDebug();
    return {
      started, state: wb.getDebugState(), registers: wb.getRegisters(), screen: wb.getScreenText(),
      control: wb.getLoaderControl(),
    };
  });
  assert.equal(secondEntry.control.kind, 0, '2本目がCOMではありません');
  assert.equal(secondEntry.state.paused, true, '2本目がエントリで停止していません');
  assert.equal(secondEntry.registers.cs, secondEntry.control.cs, '2本目のエントリCSが不一致です');
  assert.equal(secondEntry.registers.eip, secondEntry.control.ip, '2本目のエントリIPが不一致です');
  assert.equal(secondEntry.screen.text.includes('Second debug run!'), false,
    '2本目がエントリ停止前に実行されています');
  const secondExit = await page.evaluate(() => window.pc98workbench.runTargetToLoaderExit());
  assert.equal(secondExit.loaderControl.childReturn, 0x0025, '2本目の終了コードが0025hではありません');
  assert.equal(hasExactTvramLine(secondExit.screen, 'Second debug run!'), true,
    '2本目の出力行が完全一致しません');
  const prompt = await page.evaluate(() => window.pc98workbench.stopDebug());
  await page.evaluate(() => window.pc98workbench.pasteDosCommand('IF ERRORLEVEL 38 ECHO EXIT_CODE_TOO_HIGH'));
  const below38 = await page.evaluate((baseline) => window.pc98workbench.waitForPrompt(baseline), prompt.text);
  assert.equal(hasExactTvramLine(below38, 'EXIT_CODE_TOO_HIGH'), false, 'ローダ終了コードが38以上です');
  await page.evaluate(() => window.pc98workbench.pasteDosCommand('IF ERRORLEVEL 37 ECHO EXIT37_PROPAGATED'));
  const propagated = await page.evaluate((baseline) => window.pc98workbench.waitForPrompt(baseline), below38.text);
  assert.equal(hasExactTvramLine(propagated, 'EXIT37_PROPAGATED'), true,
    'ローダ終了コード37がCOMMAND.COMへ伝播していません');
  console.log(`[INFO] second run: execReturns=${secondExit.loaderControl.execReturns} `
    + `childReturn=${secondExit.loaderControl.childReturn.toString(16).padStart(4, '0')} `
    + `CS:IP=${secondExit.registers.cs.toString(16)}:${secondExit.registers.eip.toString(16)} ERRORLEVEL=37`);
  console.log('[PASS] 3. 同一セッションで2本目をデバッグし、終了コードが伝播する');
} catch (error) {
  const screen = page ? await page.evaluate(() => window.pc98workbench.getScreenText()).catch(() => null) : null;
  for (const [index, line] of (screen?.lines ?? []).entries()) {
    console.error(`[ERROR] TVRAM ${String(index).padStart(2, '0')}: ${JSON.stringify(line)}`);
  }
  console.error(`[ERROR] ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
