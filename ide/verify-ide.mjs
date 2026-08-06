#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, loadDefaultHeaders } from '../toolchain/compile.mjs';
import { assemble } from '../toolchain/assemble.mjs';
import { makeFd } from '../toolchain/makefd.mjs';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const BASE_URL = process.env.PC98DEV_URL ?? 'http://127.0.0.1:5184/ide/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// スクリーンショットの出力先はリポジトリへ固定しない。PC98DEV_SHOT_DIR で差し替えられる。
const SHOT = `${process.env.PC98DEV_SHOT_DIR ?? `${tmpdir()}/pc98dev-shots`}/pc98dev-ide.png`;
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

function hasExactTvramLine(screen, expected) {
  return screen.lines.some((line) => line.trim() === expected);
}

function assertLoaderExited(diagnostic, expectedCode) {
  assert.equal(diagnostic.loaderControl.execReturns, 2, 'EXEC直後へ2回戻っていません');
  assert.deepEqual(diagnostic.int22, {
    ip: diagnostic.loaderControl.execReturnIp,
    cs: diagnostic.loaderControl.loaderPsp,
  }, '子PSPのINT 22hがEXEC直後を指していません');
  assert.deepEqual({ sp: diagnostic.loaderControl.returnSp, ss: diagnostic.loaderControl.returnSs }, {
    sp: diagnostic.loaderControl.parentSp, ss: diagnostic.loaderControl.parentSs,
  }, '子終了時にDOSが復元したSS:SPが親スタックと一致しません');
  assert.deepEqual(diagnostic.waitDisassembly[1]?.bytes, [0x75, 0xf8], '待機ループ末尾が75 F8ではありません');
  assert.equal(diagnostic.loaderControl.childReturn, expectedCode,
    `AH=4Dhの返却AXが期待値${expectedCode.toString(16)}ではありません`);
}

function assertCStopped(actual, sourceLines, expectedLine, expectedText) {
  assert.deepEqual(actual.location, { file: 'in.c', line: expectedLine }, '停止addressのC行が不一致です');
  assert.equal(sourceLines[expectedLine - 1].trim(), expectedText, '停止C行の原文が不一致です');
  assert.equal(actual.registers.cs, actual.control.cs, 'C行停止時のCSが対象CSではありません');
  assert.equal(hasExactTvramLine(actual.screen, '3'), false, 'C行BPより前に最終出力が出ています');
}

async function dumpTvram(page, label, harness = 'pc98ide') {
  const screen = await page.evaluate((name) => window[name].getScreenText(), harness);
  console.error(`[ERROR] ${label}: TVRAM ${screen.lines.length} lines, cursor=${JSON.stringify(screen.cursor)}`);
  screen.lines.forEach((line, index) => {
    console.error(`[ERROR] TVRAM ${String(index).padStart(2, '0')}: ${JSON.stringify(line)}`);
  });
}

async function buildCProgramFd() {
  const [helloSource, strlenSource, loaderSource, library, includeFiles] = await Promise.all([
    readFile(join(ROOT, 'samples', 'hello-c.c')),
    readFile(join(ROOT, 'samples', 'legacy', 'kensyuu', 'STRLEN.C')),
    readFile(join(ROOT, 'ide', 'debug-loader.asm')),
    readFile(join(ROOT, 'toolchain', 'smlrc-wasm', 'lcds.a')),
    loadDefaultHeaders(),
  ]);
  const compileOne = async (source, label, expectedDosEofBytesRemoved) => {
    const result = await compile(new Uint8Array(source), {
      library: new Uint8Array(library), includeFiles,
    });
    if (!result.ok) throw new Error(result.errors.map((error) => `${label}/${error.stage}: ${error.message}`).join('\n'));
    assert.equal(result.output[0] | (result.output[1] << 8), 0x5a4d, `${label}出力がMZ EXEではありません`);
    assert.equal(result.sourceNormalization.dosEofBytesRemoved, expectedDosEofBytesRemoved,
      `${label}のDOS EOF正規化件数が不一致です`);
    return result;
  };
  const hello = await compileOne(helloSource, 'HELLOC', 0);
  const strlen = await compileOne(strlenSource, 'STRLEN', 1);
  const loader = await assemble(new Uint8Array(loaderSource));
  if (!loader.ok) throw new Error(`E0LOAD/NASM: ${JSON.stringify(loader.errors)}`);
  return {
    fd: makeFd([
      { name: 'E0LOAD', ext: 'COM', data: loader.output },
      { name: 'HELLOC', ext: 'EXE', data: hello.output },
      { name: 'STRLEN', ext: 'EXE', data: strlen.output },
    ]),
    helloSize: hello.output.byteLength,
    strlenSize: strlen.output.byteLength,
    strlenMap: strlen.sourceMap,
    strlenLines: new TextDecoder('shift_jis').decode(strlenSource).split(/\r?\n/),
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
let lastLoaderExitDiagnostic;

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
    // index.htmlは実用workbench。既存9項目は専用debug.htmlで同じ強度を維持する。
    await page.goto(new URL('debug.html', BASE_URL).href, { waitUntil: 'networkidle2' });
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
    const beforeRun = await page.evaluate(() => window.pc98ide.getScreenText().text);
    const diagnostic = await page.evaluate(() => window.pc98ide.runTargetToLoaderExit());
    const regs = diagnostic.registers;
    assertTvramContains(diagnostic.screen.text, 'Hello, PC-98!');
    assertLoaderExited(diagnostic, 0x0000);
    console.log(`[INFO] loader-exit CPU: CS:IP=${regs.cs.toString(16).padStart(4, '0')}:${regs.eip.toString(16).padStart(4, '0')} `
      + `SS:SP=${regs.ss.toString(16).padStart(4, '0')}:${(regs.esp & 0xffff).toString(16).padStart(4, '0')} `
      + `instruction=${JSON.stringify(diagnostic.disassembly[0] ?? null)}`);
    console.log(`[INFO] loader PSP: loader=${diagnostic.loaderControl.loaderPsp.toString(16)} `
      + `target=${diagnostic.loaderControl.targetPsp.toString(16)} `
      + `DOS-current-after-4B01=${diagnostic.loaderControl.currentPsp.toString(16)}`);
    console.log(`[INFO] exit return: count=${diagnostic.loaderControl.execReturns} `
      + `INT22=${diagnostic.int22.cs.toString(16)}:${diagnostic.int22.ip.toString(16)} `
      + `EXEC-return=${diagnostic.loaderControl.loaderPsp.toString(16)}:${diagnostic.loaderControl.execReturnIp.toString(16)} `
      + `SS:SP=${diagnostic.loaderControl.returnSs.toString(16)}:${diagnostic.loaderControl.returnSp.toString(16)} `
      + `parent=${diagnostic.loaderControl.parentSs.toString(16)}:${diagnostic.loaderControl.parentSp.toString(16)} `
      + `wait=${JSON.stringify(diagnostic.waitDisassembly)}`);
    await page.click('#run');
    await page.evaluate((baseline) => window.pc98ide.waitForPrompt(baseline), beforeRun);

    const secondEntry = await page.evaluate(() => window.pc98ide.startSecondDebugRun());
    assert.equal(secondEntry.registers.cs, secondEntry.control.cs, '2本目のエントリCSが不一致です');
    assert.equal(secondEntry.registers.eip, secondEntry.control.ip, '2本目のエントリIPが不一致です');
    const beforeSecondRun = await page.evaluate(() => window.pc98ide.getScreenText().text);
    assert.equal(beforeSecondRun.includes('Second debug run!'), false, '2本目がエントリ停止前に実行されています');
    const secondDiagnostic = await page.evaluate(() => window.pc98ide.runTargetToLoaderExit());
    assertTvramContains(secondDiagnostic.screen.text, 'Second debug run!');
    assertLoaderExited(secondDiagnostic, 0x0025);
    lastLoaderExitDiagnostic = secondDiagnostic;
    await page.click('#run');
    await page.evaluate((baseline) => window.pc98ide.waitForPrompt(baseline), beforeSecondRun);
    const beforeErrorLevel = await page.evaluate(() => window.pc98ide.getScreenText().text);
    await page.evaluate(() => window.pc98ide.pasteDosCommand('IF ERRORLEVEL 38 ECHO EXIT_CODE_TOO_HIGH'));
    const below38 = await page.evaluate((baseline) => window.pc98ide.waitForPrompt(baseline), beforeErrorLevel);
    assert.equal(hasExactTvramLine(below38, 'EXIT_CODE_TOO_HIGH'), false, 'ローダ終了コードが38以上です');
    await page.evaluate(() => window.pc98ide.pasteDosCommand('IF ERRORLEVEL 37 ECHO EXIT37_PROPAGATED'));
    const propagated = await page.evaluate((baseline) => window.pc98ide.waitForPrompt(baseline), below38.text);
    assert.equal(hasExactTvramLine(propagated, 'EXIT37_PROPAGATED'), true, 'ローダ終了コード37がCOMMAND.COMへ伝播していません');
    console.log(`[INFO] second run: output=true prompt=true exit-return-count=${secondDiagnostic.loaderControl.execReturns} `
      + `AH4D=${secondDiagnostic.loaderControl.childReturn.toString(16).padStart(4, '0')} ERRORLEVEL=37`);
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
    assert.ok(lastLoaderExitDiagnostic, 'チェック6のローダ終了直前スナップショットがありません');
    assertLoaderExited(lastLoaderExitDiagnostic, 0x0025);
    assert.throws(() => assertLoaderExited({
      ...lastLoaderExitDiagnostic,
      loaderControl: { ...lastLoaderExitDiagnostic.loaderControl, execReturns: 1 },
    }, 0x0025));
    assert.throws(() => assertLoaderExited({
      ...lastLoaderExitDiagnostic,
      loaderControl: { ...lastLoaderExitDiagnostic.loaderControl, childReturn: 0 },
    }, 0x0025));
  });

  await check(9, '1997年STRLENをC行BPで停止し、FAT12 FDから実行', async () => {
    cPage = await browser.newPage();
    await cPage.setViewport({ width: 800, height: 500, deviceScaleFactor: 1 });
    await cPage.goto(new URL('c-runner.html', BASE_URL).href, { waitUntil: 'networkidle2' });
    await cPage.evaluate(() => window.pc98c.ready);
    const prompt = await cPage.evaluate(async (bytes) => (
      window.pc98c.bootWithProgramFd('smallerc.xdf', bytes)
    ), Array.from(cProgramFd.fd));
    const paused = await cPage.evaluate(() => window.pc98c.isCpuPaused());
    console.log(`[INFO] check 9 precondition: dbgIsPaused=${paused}`);
    assert.equal(paused, false, 'チェック9開始時にCPUがpauseしています');
    console.log(`[INFO] check 9 active prompt: row=${prompt.cursor.row} line=${JSON.stringify(prompt.cursorLine)}`);

    const mounted = await cPage.evaluate(() => window.pc98c.getMountedImages());
    console.log(`[INFO] check 9 mounted images: ${JSON.stringify(mounted)}`);
    const fd2 = mounted.find((image) => image.slot === 'fd2');
    assert.deepEqual(fd2 && { name: fd2.name, sourceKey: fd2.sourceKey }, {
      name: 'smallerc.xdf', sourceKey: 'c-runner:smallerc.xdf',
    }, 'FD2に意図したC成果物イメージがマウントされていません');

    const beforeDir = await cPage.evaluate(() => window.pc98c.getScreenText().text);
    await cPage.evaluate(() => window.pc98c.pasteDosCommand('DIR B:'));
    console.log('[INFO] check 9 command sent: DIR B:');
    let directory;
    try {
      directory = await cPage.evaluate((baseline) => window.pc98c.waitForPrompt(baseline), beforeDir);
    } catch (error) {
      await dumpTvram(cPage, 'check 9 timeout after DIR B: (HELLOC not executed)', 'pc98c');
      throw error;
    }
    const listed = new RegExp(`HELLOC\\s+EXE\\s+${cProgramFd.helloSize.toLocaleString('en-US').replace(',', ',?')}`, 'i');
    assert.match(directory.text, listed, 'DIR B:に生成したHELLOC.EXEと期待サイズがありません');
    const strlenListed = new RegExp(`STRLEN\\s+EXE\\s+${cProgramFd.strlenSize.toLocaleString('en-US').replace(',', ',?')}`, 'i');
    assert.match(directory.text, strlenListed, 'DIR B:に生成したSTRLEN.EXEと期待サイズがありません');
    console.log(`[INFO] check 9 FD: HELLOC.EXE ${cProgramFd.helloSize} bytes, STRLEN.EXE ${cProgramFd.strlenSize} bytes`);

    const beforeHello = await cPage.evaluate(() => window.pc98c.getScreenText().text);
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
    const afterHello = await cPage.evaluate((baseline) => window.pc98c.waitForPrompt(baseline), beforeHello);

    const cLine = 22;
    const cText = 'Len++;';
    console.log(`[INFO] check 9 C BP: line=${cLine} text=${JSON.stringify(cText)} reason=自作StrLenのループ本体で文字数を加算する実処理`);
    const stopped = await cPage.evaluate(({ map, line }) => (
      window.pc98c.debugExeToCLine('B:\\E0LOAD B:\\STRLEN.EXE', map, line)
    ), { map: cProgramFd.strlenMap, line: cLine });
    assertCStopped(stopped, cProgramFd.strlenLines, cLine, cText);
    assert.throws(() => assertCStopped(stopped, cProgramFd.strlenLines, 23, 'Str++;'));
    await cPage.evaluate(() => window.pc98c.resumeCpu());
    let strlenScreen;
    try {
      strlenScreen = await cPage.evaluate((baseline) => window.pc98c.waitForPrompt(baseline), afterHello.text);
    } catch (error) {
      await dumpTvram(cPage, 'check 9 timeout after B:\\STRLEN', 'pc98c');
      throw error;
    }
    assert.equal(hasExactTvramLine(strlenScreen, '3'), true, '1997年STRLEN.Cの期待出力行「3」がありません');
    assert.equal(hasExactTvramLine(strlenScreen, '4'), false, 'STRLEN検証ガード用の誤出力行「4」があります');
    console.log('[INFO] check 9 STRLEN: source=STRLEN.C dos-eof-removed=1 output-line="3" prompt=true');
  });
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
if (results.some((result) => !result)) process.exitCode = 1;
