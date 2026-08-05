#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assemble } from '../toolchain/assemble.mjs';
import { parseListing } from '../toolchain/listing.mjs';
import { normalizeMzFileSize, parseMzHeader } from '../toolchain/mz.mjs';
import {
  PROMPT_OR_MENU_PATTERN, externalCase, findHddProbeDrive, insertProbeFd, leaveHddLauncher, waitForText,
} from './legacy-hdd-runner.mjs';
import { parseMz, validateSakaEntry } from './saka-step-result.mjs';
import { validateSakaVisualStart } from './saka-start-result.mjs';
import { validateSourceStop } from './source-debug.mjs';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const SOURCE = join(ROOT, 'samples', 'legacy', 'saka', 'SAKA_NASM.ASM');
const EXEBIN = join(ROOT, 'toolchain', 'nasm-src', 'misc', 'exebin.mac');
const BASE_URL = 'http://127.0.0.1:5187/ide/saka-start-probe.html';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENTRY_COMPARE_BYTES = 32;
const START_TIMEOUT = Number.parseInt(process.env.PC98DEV_SAKA_START_TIMEOUT ?? '60000', 10);
const VARIANT = process.env.PC98DEV_SAKA_VARIANT ?? 'converted';
const CHECKPOINTS = Number.parseInt(process.env.PC98DEV_SAKA_CHECKPOINTS ?? '1', 10);
const RESULT_PATH = process.env.PC98DEV_SAKA_RESULT;
const SOURCE_DEBUG = process.env.PC98DEV_SAKA_SOURCE_DEBUG === '1';
const SOURCE_DEBUG_LINE = 165;
const SOURCE_DEBUG_SHOT = '/private/tmp/claude-501/-Users-haruurara-MyProject--emulator-PC98/ebf3c7ad-2505-4d39-9ee7-ff750b61b82a/scratchpad/pc98dev-saka-source-debug.png';

assert.ok(Number.isInteger(START_TIMEOUT) && START_TIMEOUT >= 1000,
  'PC98DEV_SAKA_START_TIMEOUTは1000ms以上で指定してください');
assert.ok(VARIANT === 'original' || VARIANT === 'converted', 'PC98DEV_SAKA_VARIANTが不正です');
assert.ok(Number.isInteger(CHECKPOINTS) && CHECKPOINTS >= 1 && CHECKPOINTS <= 3,
  'PC98DEV_SAKA_CHECKPOINTSは1〜3で指定してください');

async function loadPuppeteer() {
  try {
    return (await import('puppeteer-core')).default;
  } catch {
    const requireFromWebNP2 = createRequire(new URL('../../WebNP2/package.json', import.meta.url));
    return requireFromWebNP2('puppeteer-core');
  }
}

async function buildInputs() {
  const [loaderSource, sakaSource, exebin] = await Promise.all([
    readFile(join(IDE_DIR, 'debug-loader.asm')), readFile(SOURCE), readFile(EXEBIN),
  ]);
  const [loader, saka] = await Promise.all([
    assemble(new Uint8Array(loaderSource)),
    assemble(new Uint8Array(sakaSource), { listing: true, includeFiles: { 'exebin.mac': exebin } }),
  ]);
  if (!loader.ok) throw new Error(loader.errors.map((error) => `debug-loader.asm:${error.line}: ${error.message}`).join('\n'));
  if (!saka.ok) throw new Error(saka.errors.map((error) => `SAKA_NASM.ASM:${error.line}: ${error.message}`).join('\n'));
  const exe = normalizeMzFileSize(saka.output);
  const header = parseMzHeader(exe);
  assert.deepEqual(
    { cs: header.cs, ip: header.ip, ss: header.ss, sp: header.sp, relocations: header.relocations },
    { cs: 0xfff0, ip: 0x0100, ss: 0xfff0, sp: 0x26bc, relocations: 0 },
    '変換版SAKA.EXEのMZヘッダが既知のビルド結果と異なります',
  );
  const map = parseListing(saka.listing, exe, { startAddress: header.headerBytes });
  assert.equal(map.length, 2601, '変換版SAKAの行マップ件数が既知値と異なります');
  // WHATWGのwindows-31jはCP932対応表を使う。0x5Cを円記号へ置換する文字変換は行わない。
  const sourceLines = new TextDecoder('windows-31j').decode(sakaSource).split(/\r?\n/);
  return { loader: loader.output, exe, map, sourceLines };
}

const harness = `<!doctype html>
<html><head><style>
body { margin: 0; background: #101318; color: #e8edf2; font: 14px system-ui; }
#layout { display: grid; grid-template-columns: 660px 1fr; gap: 16px; padding: 16px; }
#source-panel { height: 820px; overflow: auto; border: 1px solid #4d5968; background: #171b22; }
.source-line { display: grid; grid-template-columns: 52px 24px 1fr; width: 100%; border: 0; padding: 2px 8px;
  text-align: left; color: #cbd5df; background: transparent; font: 13px/1.45 monospace; }
.source-line.current { background: #634f00; color: #fff4b8; outline: 2px solid #ffd54a; }
.source-line.breakpoint .line-marker { color: #ff5c6c; }
.source-line:disabled { opacity: 1; }
#debug-heading { color: #ffd54a; }
</style></head><body><div id="layout"><div><canvas id="screen" width="640" height="400"></canvas>
<h2 id="debug-heading"></h2><pre id="debug-status"></pre></div><div id="source-panel"></div></div>
<script type="module">
import { createDebugger, createWebNP2, fatReadFile, openDiskImage } from './vendor/webnp2/webnp2-embed.js';
import { makeFd } from '../toolchain/makefd.mjs';
import { freezeLoaderControl, releaseLoaderAtEntry, waitForLoaderControl } from './loader-control.mjs';
import { createSakaVisualSnapshot } from './saka-visual-state.mjs';
import { sourceBreakpointOffset, sourceLineForRegisters, validateSourceStop } from './source-debug.mjs';
import { renderSourceLines } from './source-view.mjs';
const config = await (await fetch('/saka-config?variant=' + encodeURIComponent('${VARIANT}'))).json();
const canvas = document.querySelector('#screen');
const engine = createWebNP2(canvas);
const debug = createDebugger(engine);
const snapshotState = createSakaVisualSnapshot(engine, debug, canvas);
engine.persistNow = async () => {};
let pendingProbeFd;
let exeBytes;
let sourceMap;
let sourceLines;
const DATA_EXTENSIONS = ['GDT', 'PDT', 'KDT', 'MDT', 'KYA'];
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
window.sakaStartProbe = {
  engine,
  insertProbeFd: async () => {
    if (!pendingProbeFd) throw new Error('SAKA FD already inserted');
    await engine.insertFd(1, pendingProbeFd.file, pendingProbeFd.sourceKey);
    pendingProbeFd = null;
  },
  tryLoaderControl: (timeout) => waitForLoaderControl(debug, timeout),
  snapshotState,
  freezeBeforeRelease: (control) => {
    const frozen = freezeLoaderControl(debug, control);
    return {
      exeBytes: Array.from(exeBytes), control,
      pspPrefix: Array.from(debug.readMemory(control.targetPsp * 16, 2)),
      loaderRegisters: frozen.registers, release: frozen.release,
      screen: engine.getScreenText().text,
    };
  },
  enterAtEntry: (control, compareLength) => {
    const regs = releaseLoaderAtEntry(debug, control);
    return {
      guestEntryBytes: Array.from(debug.readMemory(control.cs * 16 + control.ip, compareLength)),
      regs, screen: engine.getScreenText().text,
    };
  },
  resume: () => debug.setPaused(false),
  sendKey: (key) => engine.sendKeys(key),
  runToSourceLine: (control, expectedLine) => {
    if (!sourceMap || !sourceLines) throw new Error('source debug data is unavailable');
    const offset = sourceBreakpointOffset(sourceMap, expectedLine);
    debug.setBreakpoint(0, control.cs, offset, true);
    const hit = debug.runUntilBreakpoint(5_000_000);
    debug.setBreakpoint(0, control.cs, offset, false);
    if (hit !== 0) throw new Error('ソースBPへ到達できませんでした (hit=' + hit + ')');
    const registers = debug.readRegisters();
    const stopped = validateSourceStop(sourceMap, control.cs, registers, expectedLine);
    renderSourceLines(document.querySelector('#source-panel'), {
      sourceLines, sourceMap, currentLine: stopped.sourceLine, selectedLine: expectedLine,
      programCs: control.cs,
    });
    document.querySelector('[data-source-line="' + expectedLine + '"]').scrollIntoView({ block: 'center' });
    document.querySelector('#debug-heading').textContent = '1996 SAKA source breakpoint';
    document.querySelector('#debug-status').textContent =
      'BP line=' + expectedLine + ' CS:IP=' + control.cs.toString(16).toUpperCase().padStart(4, '0')
      + ':' + offset.toString(16).toUpperCase().padStart(4, '0') + '\\n' + sourceLines[expectedLine - 1];
    return { registers, stopped, sourceText: sourceLines[expectedLine - 1], previousText: sourceLines[expectedLine - 2] };
  },
  stepSource: (programCs) => {
    const before = debug.readRegisters();
    const instruction = debug.disassemble(before.cs, before.eip, 1)[0];
    const executed = debug.step(1);
    const after = debug.readRegisters();
    const sourceLine = sourceLineForRegisters(sourceMap, programCs, after);
    renderSourceLines(document.querySelector('#source-panel'), {
      sourceLines, sourceMap, currentLine: sourceLine, selectedLine: ${SOURCE_DEBUG_LINE}, programCs,
    });
    return { before, instruction, executed, after, sourceLine, sourceText: sourceLines[sourceLine - 1] };
  },
  waitForDraw: async (baselineHash, timeout) => {
    const limit = Date.now() + timeout;
    let last;
    let candidateHash;
    let stableSamples = 0;
    while (Date.now() < limit) {
      last = await snapshotState();
      const candidate = last.gvram.sha256 + ':' + last.canvas.sha256;
      if (last.gvram.sha256 !== baselineHash && last.gvram.nonzero > 0) {
        stableSamples = candidate === candidateHash ? stableSamples + 1 : 1;
        candidateHash = candidate;
        if (stableSamples >= 2) return last;
      } else {
        candidateHash = undefined;
        stableSamples = 0;
      }
      await sleep(250);
    }
    debug.setPaused(true);
    const registers = debug.readRegisters();
    const instruction = debug.disassemble(registers.cs, registers.eip, 1)[0] ?? null;
    return { timeout: true, last, registers, instruction };
  },
  ready: (async () => {
    const [loaderResponse, exeResponse, hddResponse, debugResponse] = await Promise.all([
      fetch('/debug-loader.com'), fetch('/converted-saka.exe'), fetch(config.imageUrl), fetch('/saka-debug-data'),
    ]);
    if (!loaderResponse.ok || !exeResponse.ok || !hddResponse.ok || !debugResponse.ok) throw new Error('input fetch failed');
    ({ map: sourceMap, sourceLines } = await debugResponse.json());
    const loader = new Uint8Array(await loaderResponse.arrayBuffer());
    const convertedExe = new Uint8Array(await exeResponse.arrayBuffer());
    const hddBytes = new Uint8Array(await hddResponse.arrayBuffer());
    const disk = openDiskImage(hddBytes, config.imageName);
    // 非公開領域は列挙せず、許可されたSAKAの固定5ファイルだけを読む。
    const dataFiles = DATA_EXTENSIONS.map((ext) => ({
      name: 'SAKA', ext, data: fatReadFile(disk, 'A-GAMES/SAKA/SAKA.' + ext),
    }));
    exeBytes = config.variant === 'original'
      ? fatReadFile(disk, 'A-GAMES/SAKA/SAKA.EXE')
      : convertedExe;
    const fd = makeFd([
      { name: 'E0LOAD', ext: 'COM', data: loader },
      { name: 'SAKA', ext: 'EXE', data: exeBytes },
      ...dataFiles,
    ]);
    pendingProbeFd = {
      file: { name: 'saka-' + config.variant + '.xdf', bytes: fd },
      sourceKey: 'saka-start:fd:' + config.variant,
    };
    await engine.boot({
      hdd: {
        file: { name: config.imageName, bytes: hddBytes },
        sourceKey: 'saka-start:external-hdd:' + config.variant, alreadyPersisted: true,
      },
      latencyMs: 40, extMemMB: 1,
    });
  })(),
};
</script></body></html>`;

const contentTypes = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm', '.bmp': 'image/bmp',
};

function startServer(inputs, scenario) {
  return new Promise((resolveStart, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname === '/debug-loader.com' || url.pathname === '/converted-saka.exe') {
          const body = url.pathname === '/debug-loader.com' ? inputs.loader : inputs.exe;
          response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(body); return;
        }
        if (url.pathname === '/saka-config') {
          const variant = url.searchParams.get('variant');
          if (variant !== 'original' && variant !== 'converted') throw new Error('invalid variant');
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
            imageName: scenario.imageName, imageUrl: '/external-hdd/legacy', variant,
          })); return;
        }
        if (url.pathname === '/saka-debug-data') {
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
            map: inputs.map, sourceLines: inputs.sourceLines,
          })); return;
        }
        if (url.pathname === '/external-hdd/legacy') {
          response.writeHead(200, {
            'Content-Type': 'application/octet-stream', 'Content-Length': scenario.size, 'Cache-Control': 'no-store',
          });
          createReadStream(scenario.path).on('error', () => response.destroy()).pipe(response); return;
        }
        if (url.pathname === '/ide/saka-start-probe.html') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(harness); return;
        }
        const file = resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
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
    server.listen(5187, '127.0.0.1', () => resolveStart(server));
  });
}

let server;
let browser;
let page;
let profile;
let evidenceDir;

try {
  const scenario = await externalCase('legacy', '1996年HDD環境', 'PC98DEV_LEGACY_THD', 'legacy.thd');
  if (scenario.skip) throw new Error(scenario.skip);
  const inputs = await buildInputs();
  server = await startServer(inputs, scenario);
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(join(tmpdir(), 'pc98dev-saka-start-profile-'));
  evidenceDir = await mkdtemp(join(tmpdir(), 'pc98dev-saka-start-evidence-'));
  browser = await puppeteer.launch({
    executablePath: CHROME, userDataDir: profile, headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage();
  await page.setViewport(SOURCE_DEBUG
    ? { width: 1500, height: 900, deviceScaleFactor: 1 }
    : { width: 1000, height: 700, deviceScaleFactor: 1 });
  page.setDefaultNavigationTimeout(300_000);
  page.setDefaultTimeout(300_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 300_000 });
  await page.evaluate(() => window.sakaStartProbe.ready);
  assert.deepEqual(pageErrors, []);
  await waitForText(
    page, 'sakaStartProbe', PROMPT_OR_MENU_PATTERN, scenario.promptTimeout,
    '1996年HDD環境のDOSプロンプト/ランチャ待機がタイムアウトしました',
  );
  await leaveHddLauncher(page, scenario, 'sakaStartProbe');
  await insertProbeFd(page, 'sakaStartProbe');
  const driveAttempts = [];
  const found = await findHddProbeDrive(page, scenario, 'sakaStartProbe', async (letter) => {
    driveAttempts.push(letter);
    // 実行ドライブへ移動し、SAKAの相対データファイルを同じFDから読ませる。
    await page.evaluate((command) => window.sakaStartProbe.engine.pasteText(command),
      `${letter}:\rE0LOAD SAKA.EXE\r`);
    return page.evaluate(() => window.sakaStartProbe.tryLoaderControl(15_000));
  });
  const preRelease = await page.evaluate(
    (control) => window.sakaStartProbe.freezeBeforeRelease(control), found.result,
  );
  assert.equal(preRelease.release, 0, '制御移譲前のrelease byteが0ではありません');
  const beforeReleaseState = await page.evaluate(() => window.sakaStartProbe.snapshotState());
  const entered = await page.evaluate(
    ({ control, compareLength }) => window.sakaStartProbe.enterAtEntry(control, compareLength),
    { control: found.result, compareLength: ENTRY_COMPARE_BYTES },
  );
  const entryState = await page.evaluate(() => window.sakaStartProbe.snapshotState());
  const entryEvidence = {
    exeBytes: preRelease.exeBytes, guestEntryBytes: entered.guestEntryBytes,
    control: preRelease.control, regs: entered.regs, pspPrefix: preRelease.pspPrefix,
    beforeScreen: preRelease.screen, stoppedScreen: entered.screen,
    beforeGvram: beforeReleaseState.gvram, stoppedGvram: entryState.gvram,
  };
  const entry = validateSakaEntry(entryEvidence);
  const mz = parseMz(Uint8Array.from(entryEvidence.exeBytes));
  const expected = VARIANT === 'converted'
    ? { size: 8668, header: { ss: 0xfff0, sp: 0x26bc, ip: 0x0100, cs: 0xfff0, relocations: 0 } }
    : { size: 9149, header: { ss: 0x021c, sp: 0x0400, ip: 0x0000, cs: 0x0000, relocations: 4 } };
  assert.equal(entryEvidence.exeBytes.length, expected.size, `${VARIANT} SAKA.EXEのサイズが既知値と異なります`);
  assert.deepEqual(
    { ss: mz.ss, sp: mz.sp, ip: mz.ip, cs: mz.cs, relocations: mz.relocations }, expected.header,
    `${VARIANT} SAKA.EXEのMZヘッダが既知値と異なります`,
  );
  if (SOURCE_DEBUG) {
    assert.equal(VARIANT, 'converted', 'ソース行デバッグは変換版だけを対象にします');
    const stopped = await page.evaluate(
      ({ control, sourceLine }) => window.sakaStartProbe.runToSourceLine(control, sourceLine),
      { control: preRelease.control, sourceLine: SOURCE_DEBUG_LINE },
    );
    const checkedStop = validateSourceStop(inputs.map, preRelease.control.cs, stopped.registers, SOURCE_DEBUG_LINE);
    // 実測した同じ停止証拠へ別行を期待させ、検査が必ずFAILすることを確認する。
    assert.throws(() => validateSourceStop(
      inputs.map, preRelease.control.cs, stopped.registers, SOURCE_DEBUG_LINE - 1,
    ));
    assert.match(stopped.previousText, /mov\s+bx,open1/i, 'BP直前がopen1選択行ではありません');
    assert.match(stopped.sourceText, /call\s+\.put/i, 'BP行がオープニング描画呼出しではありません');
    const sourceVisual = await page.$eval(`[data-source-line="${SOURCE_DEBUG_LINE}"]`, (row) => {
      const rect = row.getBoundingClientRect();
      return {
        current: row.classList.contains('current'), breakpoint: row.classList.contains('breakpoint'),
        visible: rect.top >= 0 && rect.bottom <= innerHeight,
      };
    });
    assert.deepEqual(sourceVisual, { current: true, breakpoint: true, visible: true });
    await mkdir(dirname(SOURCE_DEBUG_SHOT), { recursive: true });
    await page.screenshot({ path: SOURCE_DEBUG_SHOT });
    const steps = [];
    for (let index = 0; index < 4; index++) {
      steps.push(await page.evaluate((programCs) => window.sakaStartProbe.stepSource(programCs), preRelease.control.cs));
    }
    assert.deepEqual(steps.map((step) => step.sourceLine), [196, 197, 198, 199],
      'call .putから4命令のソース行遷移が期待値と異なります');
    console.log('[REASON] 164行でopen1（平成8年10月の第1画面）を選び、165行がその描画ループを呼ぶため');
    console.log(`[MAP] samples/legacy/saka/SAKA_NASM.ASM entries=${inputs.map.length}`);
    console.log(`[BP] line=${checkedStop.sourceLine} CS:IP=${checkedStop.cs.toString(16).toUpperCase().padStart(4, '0')}:`
      + `${checkedStop.ip.toString(16).toUpperCase().padStart(4, '0')} source=${JSON.stringify(stopped.sourceText)}`);
    for (const [index, step] of steps.entries()) {
      console.log(`[STEP ${index + 1}] ${step.before.cs.toString(16).toUpperCase().padStart(4, '0')}:`
        + `${step.before.eip.toString(16).toUpperCase().padStart(4, '0')} ${step.instruction.text} -> `
        + `line=${step.sourceLine} ${JSON.stringify(step.sourceText)}`);
    }
    console.log(`[PASS] SAKA source line breakpoint/4 instruction steps; wrong-line guard=FAIL confirmed`);
    console.log(`[SHOT] ${SOURCE_DEBUG_SHOT}`);
  } else {
  await page.evaluate(() => window.sakaStartProbe.resume());
  let drawResult = await page.evaluate(
    ({ baselineHash, timeout }) => window.sakaStartProbe.waitForDraw(baselineHash, timeout),
    { baselineHash: entryState.gvram.sha256, timeout: START_TIMEOUT },
  );
  const checkpoints = [];
  let previousState = entryState;
  for (let index = 0; index < CHECKPOINTS; index++) {
    if (drawResult.timeout) {
      const regs = drawResult.registers;
      const at = `${regs.cs.toString(16).toUpperCase().padStart(4, '0')}:`
        + `${regs.eip.toString(16).toUpperCase().padStart(4, '0')}`;
      const instruction = drawResult.instruction?.text ?? '(逆アセンブル不能)';
      throw new Error(`checkpoint ${index + 1}の描画待機がタイムアウトしました; 停止位置=${at} ${instruction}`);
    }
    validateSakaVisualStart(previousState, drawResult);
    const state = await page.evaluate(() => window.sakaStartProbe.snapshotState({ includeBytes: true }));
    const shotPath = join(evidenceDir, `saka-${VARIANT}-opening-${index + 1}.png`);
    const png = await page.screenshot({ path: shotPath });
    checkpoints.push({
      name: `opening-${index + 1}`, keyBefore: index === 0 ? null : 'SPACE', state,
      pngSha256: createHash('sha256').update(png).digest('hex'), shotPath,
    });
    previousState = state;
    if (index + 1 < CHECKPOINTS) {
      await page.evaluate(() => window.sakaStartProbe.sendKey('SPACE'));
      drawResult = await page.evaluate(
        ({ baselineHash, timeout }) => window.sakaStartProbe.waitForDraw(baselineHash, timeout),
        { baselineHash: state.gvram.sha256, timeout: START_TIMEOUT },
      );
    }
  }
  assert.deepEqual(pageErrors, []);
  console.log(
    `[PASS] ${VARIANT} SAKA start entry=${preRelease.control.cs.toString(16).toUpperCase().padStart(4, '0')}:`
    + `${preRelease.control.ip.toString(16).toUpperCase().padStart(4, '0')} `
    + `file/RAM=${entry.comparedBytes} bytes drives=${driveAttempts.join(',')} fd=${found.letter}:`,
  );
  for (const checkpoint of checkpoints) {
    console.log(
      `[CHECKPOINT] ${checkpoint.name} tvram=${checkpoint.state.tvram.sha256} `
      + `gvram=${checkpoint.state.gvram.sha256} canvas=${checkpoint.state.canvas.sha256} `
      + `png=${checkpoint.pngSha256}`,
    );
    console.log(`[SHOT] ${checkpoint.shotPath}`);
  }
  if (RESULT_PATH) {
    await writeFile(RESULT_PATH, `${JSON.stringify({ variant: VARIANT, entry: {
      cs: preRelease.control.cs, ip: preRelease.control.ip, comparedBytes: entry.comparedBytes,
    }, checkpoints }, null, 2)}\n`);
  }
  }
} catch (error) {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  if (page && evidenceDir) {
    try {
      const failurePath = join(evidenceDir, 'saka-converted-failure.png');
      await page.screenshot({ path: failurePath });
      console.error(`[EVIDENCE] ${failurePath}`);
    } catch {
      console.error(`[EVIDENCE] ${evidenceDir}（画面採取失敗）`);
    }
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
