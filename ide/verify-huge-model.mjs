#!/usr/bin/env node

// huge model(-dosh)実現性調査の実行検証。samples/huge-probe.c(64KB境界をまたぐ配列アクセス)を
// model:'huge'でビルドし、WebNP2+FreeDOS(98)上でTVRAM出力を完全一致で確認する。
// 同時にsamples/huge-probe-broken.c(故障注入版: 境界超え書き込みを1行削除)が
// 異なる出力になることを陽性対照として確かめ、検査自体が失敗を見逃さないことを保証する。
// さらに既存のC行デバッグ経路(ide/debug-session.mjs)をhugeビルドへそのまま流し、
// エントリ停止・BP停止・行送り・再開後の出力までを実測する(IDEのUIは経由しない)。

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileWithFactories } from '../toolchain/compile-core.mjs';
import { assemble } from '../toolchain/assemble.mjs';
import { loadDefaultHeaders } from '../toolchain/compile.mjs';
import { makeFd } from '../toolchain/makefd.mjs';
import { DOS_PROMPT_PATTERN } from './dos-prompt.mjs';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const TOOLCHAIN_DIR = join(ROOT, 'toolchain');
const BASE_URL = 'http://127.0.0.1:5187/ide/huge-model-probe.html';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(import.meta.url);

async function loadPuppeteer() {
  try { return (await import('puppeteer-core')).default; }
  catch { return createRequire(new URL('../../WebNP2/package.json', import.meta.url))('puppeteer-core'); }
}

// --- Node側: huge modelでのC->MZ EXEビルド(既存の compile.mjs と同じラインで model:'huge' を渡す) ---

async function compileHuge(path) {
  const createSmlrpp = require(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'smlrpp.js'));
  const createSmlrc = require(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'smlrc.js'));
  const createSmlrl = require(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'smlrl.js'));
  const [source, library, includeFiles] = await Promise.all([
    readFile(path),
    readFile(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'lcdh.a')),
    loadDefaultHeaders(),
  ]);
  const result = await compileWithFactories(new Uint8Array(source), {
    library: new Uint8Array(library), includeFiles, model: 'huge',
  }, { createSmlrpp, createSmlrc, createSmlrl, assemble });
  if (!result.ok) {
    throw new Error(`${path}のhugeビルドに失敗: ${result.errors.map((e) => `[${e.stage}] line ${e.line}: ${e.message}`).join('\n')}`);
  }
  return result;
}

async function assembleDebugLoaderNode() {
  const source = await readFile(join(IDE_DIR, 'debug-loader.asm'));
  const result = await assemble(new Uint8Array(source), { format: 'bin' });
  if (!result.ok) {
    throw new Error(`debug-loader.asmのアセンブルに失敗: ${result.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n')}`);
  }
  return result.output;
}

const EXPECTED_OK_LINE = 'HUGEPROBE head=11 b64k-1=22 b64k=33 tail=44 sum=6dbc size=100000';
// 故障注入版は境界超え書き込み(big[65536]=0x33;)を削除しているため、その1バイトは
// 初期化ループの値(65536&0xFF=0x00)のまま残り、チェックサムだけがズレる。
const EXPECTED_BROKEN_LINE = 'HUGEPROBE head=11 b64k-1=22 b64k=00 tail=44 sum=6d89 size=100000';
// BP検証対象行(huge-probe.cの行番号、1始まり): "checksum = 0;"
const BREAKPOINT_LINE = 22;
const BREAKPOINT_SOURCE_TEXT = 'checksum = 0;';
const STEP_OVER_EXPECTED_LINE = 23;
const STEP_OVER_EXPECTED_TEXT = 'for (i = 0; i < SIZE; i++) {';

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.xdf': 'application/octet-stream', '.bmp': 'image/bmp',
};

function startServer(programFd, okSourceMap, okSourceText) {
  const config = { sourceMap: okSourceMap, sourceText: okSourceText };
  const harness = `<!doctype html>
<html><body><canvas id="screen" width="640" height="400"></canvas>
<script type="module">
import { createDebugger, createWebNP2 } from './vendor/webnp2/webnp2-embed.js';
import { createDebugSession } from './debug-session.mjs';
import { createCDebugMap } from './debug-map.mjs';
import { waitForCurrentDosPrompt } from './freedos-session.mjs';

const engine = createWebNP2(document.querySelector('#screen'));
const debug = createDebugger(engine);
engine.persistNow = async () => {};
const configResponse = await fetch('/huge-probe-config.json');
if (!configResponse.ok) throw new Error('config fetch failed');
const config = await configResponse.json();
const debugMap = createCDebugMap(config.sourceMap);
const sourceLines = config.sourceText.split('\\n');

window.hugeModelProbe = {
  engine,
  session: createDebugSession(debug),
  sourceLineOf: (line) => sourceLines[line - 1],
  // 直前の出力がまだ画面に残っている状態で次のコマンドを打つため、baselineとの差分+
  // 新しいDOSプロンプト復帰を待ってから読む(単純な/HUGEPROBE/ポーリングだと前回の
  // 出力を拾ってしまう競合がある。ide/workbench.jsのrunCurrent()と同じ待ち方)。
  runAndWait: async (command, timeout = 20_000) => {
    const baseline = engine.getScreenText().text;
    await engine.pasteText(\`\${command}\\r\`);
    const screen = await waitForCurrentDosPrompt(engine, { baseline, timeout });
    return screen.text;
  },
  currentScreenText: () => engine.getScreenText().text,
  waitForPromptSince: async (baseline, timeout = 20_000) => (await waitForCurrentDosPrompt(engine, { baseline, timeout })).text,
  ready: (async () => {
    const [bootResponse, fdResponse] = await Promise.all([
      fetch('./freedos/fd98_2hd.xdf'),
      fetch('/program.xdf'),
    ]);
    if (!bootResponse.ok) throw new Error('FreeDOS FD fetch failed');
    if (!fdResponse.ok) throw new Error('program FD fetch failed');
    await engine.boot({
      fd1: { file: { name: 'freedos.xdf', bytes: new Uint8Array(await bootResponse.arrayBuffer()) }, sourceKey: 'probe:freedos' },
      fd2: { file: { name: 'program.xdf', bytes: new Uint8Array(await fdResponse.arrayBuffer()) }, sourceKey: 'probe:program' },
      latencyMs: 40,
      extMemMB: 1,
    });
  })(),
};
</script></body></html>`;

  return new Promise((resolveStart, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname === '/program.xdf') {
          response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(programFd);
          return;
        }
        if (url.pathname === '/huge-probe-config.json') {
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(config));
          return;
        }
        if (url.pathname === '/ide/huge-model-probe.html') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(harness);
          return;
        }
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const file = resolve(ROOT, `.${pathname}`);
        if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) { response.writeHead(403).end('forbidden'); return; }
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404).end('not found'); }
    });
    server.once('error', reject);
    server.listen(5187, '127.0.0.1', () => resolveStart(server));
  });
}

async function waitForText(page, pattern, timeout, message) {
  const limit = Date.now() + timeout;
  let last = '';
  while (Date.now() < limit) {
    last = await page.evaluate(() => window.hugeModelProbe.engine.getScreenText().text);
    if (pattern.test(last)) return last;
    await sleep(200);
  }
  throw new Error(`${message}\n----\n${last}`);
}

function exactLineMatch(screenText, expected) {
  return screenText.split('\n').some((line) => line.trim() === expected);
}

let server; let browser; let profile;
try {
  const [ok, broken, loader] = await Promise.all([
    compileHuge(join(ROOT, 'samples', 'huge-probe.c')),
    compileHuge(join(ROOT, 'samples', 'huge-probe-broken.c')),
    assembleDebugLoaderNode(),
  ]);
  const okSourceText = new TextDecoder().decode(await readFile(join(ROOT, 'samples', 'huge-probe.c')));

  const programFd = makeFd([
    { name: 'E0LOAD', ext: 'COM', data: loader },
    { name: 'HPOK', ext: 'EXE', data: ok.output },
    { name: 'HPBAD', ext: 'EXE', data: broken.output },
  ]);

  server = await startServer(programFd, ok.sourceMap, okSourceText);
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(`${tmpdir()}/huge-model-probe-`);
  browser = await puppeteer.launch({
    executablePath: CHROME, userDataDir: profile, headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 120_000 });
  await page.evaluate(() => window.hugeModelProbe.ready);
  assert.deepEqual(pageErrors, []);
  await waitForText(page, DOS_PROMPT_PATTERN, 60_000, 'DOSプロンプト待機タイムアウト');

  // --- A: TVRAM完全一致 + 故障注入の陽性対照 ---
  const okScreen = await page.evaluate(() => window.hugeModelProbe.runAndWait('B:\\HPOK.EXE'));
  assert.ok(exactLineMatch(okScreen, EXPECTED_OK_LINE),
    `HPOK.EXEの出力が期待行と完全一致しません: ${JSON.stringify(okScreen.split('\n').filter((l) => l.includes('HUGEPROBE')))}`);
  console.log(`[PASS] A-1: huge model TVRAM完全一致 "${EXPECTED_OK_LINE}"`);

  const badScreen = await page.evaluate(() => window.hugeModelProbe.runAndWait('B:\\HPBAD.EXE'));
  const badLines = badScreen.split('\n').filter((l) => l.includes('HUGEPROBE')).map((l) => l.trim());
  const badLastLine = badLines.at(-1);
  // 陽性対照: 壊れ版が正常版と同じ行を出したら、検査そのものが故障を見逃す構成になっている。
  // ここでFAILにする(SKIPや黙認にしない)。
  assert.notEqual(badLastLine, EXPECTED_OK_LINE,
    '故障注入版(HPBAD.EXE)が正常版と同じ出力になりました。検査が故障を検出できていません');
  assert.equal(badLastLine, EXPECTED_BROKEN_LINE,
    `故障注入版の出力が想定の壊れ方と一致しません: ${badLastLine}`);
  console.log(`[PASS] A-2: 故障注入版が想定通り差分を出すことを確認 "${badLastLine}"`);

  // --- B: 既存のCデバッグ経路(ide/debug-session.mjs)をhugeビルドへそのまま適用する ---
  // 既知の制約(2026-09-19時点): huge modelはBPが機能しない(下のtry/catchでFAILとして
  // 明示する。SKIP扱いにはしない)。根本原因はhuge-probe-report.mdの「第2回」に記録。
  await page.evaluate(() => window.hugeModelProbe.engine.pasteText('\r\r\r'));
  await waitForText(page, DOS_PROMPT_PATTERN, 20_000, 'デバッグ前のDOSプロンプト復帰待機タイムアウト');

  try {
    const started = await page.evaluate(async () => {
      const { session } = window.hugeModelProbe;
      const debugMapModule = await import('./debug-map.mjs');
      const config = await (await fetch('/huge-probe-config.json')).json();
      const map = debugMapModule.createCDebugMap(config.sourceMap);
      const result = await session.start(window.hugeModelProbe.engine, 'B:\\E0LOAD B:\\HPOK.EXE', map, 'EXE');
      return {
        ...result,
        entryLine: session.currentLine(),
        debuggableLines: map.debuggableLines(),
        breakpointOffsets: { line12: map.breakpointOffsets(12), line22: map.breakpointOffsets(BREAKPOINT_LINE) },
      };
    });
    console.log(`[INFO] B: session.start()診断 control.cs=${started.control.cs} control.ip=${started.control.ip} `
      + `debuggableLines[0]=${started.debuggableLines[0]} line12offsets=${JSON.stringify(started.breakpointOffsets.line12)} `
      + `line22offsets=${JSON.stringify(started.breakpointOffsets.line22)}`);
    assert.equal(started.noDebuggableLines, false, 'huge-probe.cに生成行がありません(セッション開始の前提が崩れています)');
    assert.equal(started.entryLine, started.debuggableLines[0],
      `Step15相当: デバッグ開始の停止行が最初の生成行(${started.debuggableLines[0]})ではありません: ${started.entryLine}`);
    console.log(`[PASS] B-1: huge modelでもデバッグ開始が最初の生成行(${started.entryLine}行目)で止まりました`);

    const bpResult = await page.evaluate((line) => {
      const { session } = window.hugeModelProbe;
      session.setBreakpointLines([line]);
      return session.continueToBreakpoint();
    }, BREAKPOINT_LINE);
    assert.equal(bpResult.line, BREAKPOINT_LINE, `huge modelでBP(${BREAKPOINT_LINE}行目)停止行が不一致です: ${bpResult.line}`);
    const bpSourceText = await page.evaluate((line) => window.hugeModelProbe.sourceLineOf(line), BREAKPOINT_LINE);
    assert.equal(bpSourceText.trim(), BREAKPOINT_SOURCE_TEXT,
      `BP停止行の原文が想定と一致しません: "${bpSourceText}"`);
    console.log(`[PASS] B-2: huge modelでBP停止 ${BREAKPOINT_LINE}行目 "${bpSourceText.trim()}"`);

    const stepResult = await page.evaluate(() => window.hugeModelProbe.session.stepOverLine());
    assert.equal(stepResult.line, STEP_OVER_EXPECTED_LINE,
      `huge modelで行送りの結果が想定と一致しません: expected=${STEP_OVER_EXPECTED_LINE}, actual=${stepResult.line}`);
    const stepSourceText = await page.evaluate((line) => window.hugeModelProbe.sourceLineOf(line), STEP_OVER_EXPECTED_LINE);
    assert.equal(stepSourceText.trim(), STEP_OVER_EXPECTED_TEXT,
      `行送り後の原文が想定と一致しません: "${stepSourceText}"`);
    console.log(`[PASS] B-3: huge modelで行送り ${stepResult.line}行目 "${stepSourceText.trim()}"へ進みました`);

    // 規律: 期待行をわざと1つずらしてFAILすることを実測してから元の判定へ戻す(検査の感度確認)。
    assert.throws(() => assert.equal(bpResult.line, BREAKPOINT_LINE + 1));

    // detach()でBPを外し再開、64KB超データの計算を含む残りの処理が最後まで走って
    // 正しい出力になることを確認する(STRLEN.Cの「再開後の出力確認」に相当)。
    // baselineとの差分+新プロンプト復帰を待つ(前回実行の出力を拾う競合を避ける)。
    const beforeResume = await page.evaluate(() => window.hugeModelProbe.currentScreenText());
    await page.evaluate(() => window.hugeModelProbe.session.detach());
    const resumedScreen = await page.evaluate(
      (baseline) => window.hugeModelProbe.waitForPromptSince(baseline, 20_000),
      beforeResume,
    );
    assert.ok(exactLineMatch(resumedScreen, EXPECTED_OK_LINE),
      `デバッグ再開後の出力が期待行と一致しません: ${JSON.stringify(resumedScreen.split('\n').filter((l) => l.includes('HUGEPROBE')))}`);
    console.log(`[PASS] B-4: huge modelでBP再開後の出力が完全一致 "${EXPECTED_OK_LINE}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[FAIL] B: huge modelのソース行デバッグが機能しません: ${message}`);
    console.log('[FAIL] B: 既知の制約として huge-probe-report.md の「第2回」に根本原因の調査結果を記録済み。SKIPではなくFAILとして扱う。');
    process.exitCode = 1;
    // 壊れたデバッグセッションを片付け、続く後始末(browser.close等)に影響させない。
    await page.evaluate(() => {
      try { window.hugeModelProbe.session.detach(); } catch {}
    }).catch(() => {});
  }
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((r) => server.close(r));
}
