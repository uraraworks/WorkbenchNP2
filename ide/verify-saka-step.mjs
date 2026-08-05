#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assemble } from '../toolchain/assemble.mjs';
import { makeFd } from '../toolchain/makefd.mjs';
import {
  PROMPT_OR_MENU_PATTERN, externalCase, findHddProbeDrive, insertProbeFd, leaveHddLauncher, waitForText,
} from './legacy-hdd-runner.mjs';
import { parseMz, validateInstructionSteps, validateSakaEntry } from './saka-step-result.mjs';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const BASE_URL = 'http://127.0.0.1:5186/ide/saka-step-probe.html';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TARGET = '\\A-GAMES\\SAKA\\SAKA.EXE';
const FAT_TARGET = 'A-GAMES/SAKA/SAKA.EXE';
const STEP_LIMIT = Math.min(Number.parseInt(process.env.PC98DEV_SAKA_STEPS ?? '8', 10), 12);
const ENTRY_COMPARE_BYTES = 32;
const SHOT_DIR = '/private/tmp/claude-501/-Users-haruurara-MyProject--emulator-PC98/ebf3c7ad-2505-4d39-9ee7-ff750b61b82a/scratchpad';

assert.ok(Number.isInteger(STEP_LIMIT) && STEP_LIMIT >= 1, 'PC98DEV_SAKA_STEPSは1〜12で指定してください');

async function loadPuppeteer() {
  try {
    return (await import('puppeteer-core')).default;
  } catch {
    const requireFromWebNP2 = createRequire(new URL('../../WebNP2/package.json', import.meta.url));
    return requireFromWebNP2('puppeteer-core');
  }
}

async function makeLoaderFd() {
  const source = new Uint8Array(await readFile(join(IDE_DIR, 'debug-loader.asm')));
  const result = await assemble(source);
  if (!result.ok) {
    throw new Error(result.errors.map((error) => `debug-loader.asm:${error.line}: ${error.message}`).join('\n'));
  }
  return makeFd([{ name: 'E0LOAD', ext: 'COM', data: result.output }]);
}

const harness = `<!doctype html>
<html><body><canvas id="screen" width="640" height="400"></canvas>
<script type="module">
import { createDebugger, createWebNP2, fatReadFile, openDiskImage } from './vendor/webnp2/webnp2-embed.js';
import { freezeLoaderControl, releaseLoaderAtEntry, waitForLoaderControl } from './loader-control.mjs';
const config = await (await fetch('/saka-config')).json();
const engine = createWebNP2(document.querySelector('#screen'));
const debug = createDebugger(engine);
engine.persistNow = async () => {};
let pendingProbeFd;
let exeBytes;
const GVRAM_REGIONS = [
  0x0a8000, 0x0b0000, 0x0b8000, 0x0e0000,
  0x1a8000, 0x1b0000, 0x1b8000, 0x1e0000,
];
const hexDigest = async (bytes) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('');
async function gvramState() {
  const combined = new Uint8Array(GVRAM_REGIONS.length * 0x8000);
  const regions = [];
  let nonzero = 0;
  for (let index = 0; index < GVRAM_REGIONS.length; index++) {
    const address = GVRAM_REGIONS[index];
    const bytes = debug.readMemory(address, 0x8000);
    combined.set(bytes, index * 0x8000);
    const regionNonzero = bytes.reduce((count, byte) => count + (byte !== 0 ? 1 : 0), 0);
    nonzero += regionNonzero;
    regions.push({ address, nonzero: regionNonzero, sha256: await hexDigest(bytes) });
  }
  return { sha256: await hexDigest(combined), nonzero, regions };
}
async function canvasState() {
  await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  const canvas = document.querySelector('#screen');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  let pixels;
  if (gl) {
    pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  } else {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas pixel readout is unavailable');
    pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  }
  let colored = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0) colored++;
  }
  return { sha256: await hexDigest(pixels), colored, width: canvas.width, height: canvas.height };
}
window.sakaStepProbe = {
  engine,
  insertProbeFd: async () => {
    if (!pendingProbeFd) throw new Error('loader FD already inserted');
    await engine.insertFd(1, pendingProbeFd.file, pendingProbeFd.sourceKey);
    pendingProbeFd = null;
  },
  tryLoaderControl: (timeout) => waitForLoaderControl(debug, timeout),
  snapshotState: async () => ({
    screen: engine.getScreenText().text,
    gvram: await gvramState(),
    canvas: await canvasState(),
  }),
  freezeBeforeRelease: (control) => {
    const frozen = freezeLoaderControl(debug, control);
    const pspPrefix = Array.from(debug.readMemory(control.targetPsp * 16, 2));
    return {
      exeBytes: Array.from(exeBytes), control, pspPrefix,
      loaderRegisters: frozen.registers, release: frozen.release,
      screen: engine.getScreenText().text,
    };
  },
  enterAtEntry: (control, compareLength) => {
    const regs = releaseLoaderAtEntry(debug, control);
    const guestEntryBytes = Array.from(debug.readMemory(control.cs * 16 + control.ip, compareLength));
    return { guestEntryBytes, regs, screen: engine.getScreenText().text };
  },
  stepOne: () => {
    const before = debug.readRegisters();
    const instruction = debug.disassemble(before.cs, before.eip, 1)[0];
    if (!instruction) throw new Error('逆アセンブル結果が空です');
    const executed = debug.step(1);
    const after = debug.readRegisters();
    return { before, instruction, after, executed };
  },
  ready: (async () => {
    const [fdResponse, hddResponse] = await Promise.all([fetch('/saka-loader.xdf'), fetch(config.imageUrl)]);
    if (!fdResponse.ok || !hddResponse.ok) throw new Error('disk image fetch failed');
    pendingProbeFd = {
      file: { name: 'saka-loader.xdf', bytes: new Uint8Array(await fdResponse.arrayBuffer()) },
      sourceKey: 'saka-step:fd',
    };
    const hddBytes = new Uint8Array(await hddResponse.arrayBuffer());
    // ディレクトリ列挙はせず、許可されたSAKAの固定パスだけをホスト側FATリーダで読む。
    exeBytes = fatReadFile(openDiskImage(hddBytes, config.imageName), config.target);
    await engine.boot({
      hdd: {
        file: { name: config.imageName, bytes: hddBytes },
        sourceKey: 'saka-step:external-hdd', alreadyPersisted: true,
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

function startServer(loaderFd, scenario) {
  return new Promise((resolveStart, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname === '/saka-loader.xdf') {
          response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(loaderFd); return;
        }
        if (url.pathname === '/saka-config') {
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
            imageName: scenario.imageName, imageUrl: '/external-hdd/legacy', target: FAT_TARGET,
          })); return;
        }
        if (url.pathname === '/external-hdd/legacy') {
          response.writeHead(200, {
            'Content-Type': 'application/octet-stream', 'Content-Length': scenario.size, 'Cache-Control': 'no-store',
          });
          createReadStream(scenario.path).on('error', () => response.destroy()).pipe(response); return;
        }
        if (url.pathname === '/ide/saka-step-probe.html') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(harness); return;
        }
        let pathname = decodeURIComponent(url.pathname);
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
    server.listen(5186, '127.0.0.1', () => resolveStart(server));
  });
}

let server;
let browser;
let profile;
let page;

async function captureState(label) {
  const state = await page.evaluate(() => window.sakaStepProbe.snapshotState());
  const path = join(SHOT_DIR, `${label}.png`);
  const png = await page.screenshot({ path });
  const pngSha256 = createHash('sha256').update(png).digest('hex');
  console.log(
    `[STATE] ${label} canvas=${state.canvas.sha256} colored=${state.canvas.colored} `
    + `gvram=${state.gvram.sha256} nonzero=${state.gvram.nonzero} png=${pngSha256}`,
  );
  console.log(`[GVRAM] ${label} ${state.gvram.regions.map(
    (region) => `${region.address.toString(16).toUpperCase()}:${region.nonzero}:${region.sha256.slice(0, 12)}`,
  ).join(' ')}`);
  return { ...state, pngSha256, path };
}

try {
  const scenario = await externalCase('legacy', '1996年HDD ASM版 SAKA.EXE', 'PC98DEV_LEGACY_THD', 'legacy.thd');
  if (scenario.skip) throw new Error(scenario.skip);
  const loaderFd = await makeLoaderFd();
  server = await startServer(loaderFd, scenario);
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(join(tmpdir(), 'pc98dev-saka-step-'));
  browser = await puppeteer.launch({
    executablePath: CHROME, userDataDir: profile, headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 });
  page.setDefaultNavigationTimeout(300_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 300_000 });
  await page.evaluate(() => window.sakaStepProbe.ready);
  assert.deepEqual(pageErrors, []);
  await mkdir(SHOT_DIR, { recursive: true });
  const engineReadyState = await captureState('saka-00-engine-ready');
  await waitForText(
    page, 'sakaStepProbe', PROMPT_OR_MENU_PATTERN, scenario.promptTimeout,
    '1996年HDD環境のDOSプロンプト/ランチャ待機がタイムアウトしました',
  );
  const bootReadyState = await captureState('saka-01-boot-ready');
  await leaveHddLauncher(page, scenario, 'sakaStepProbe');
  const afterLauncherState = await captureState('saka-02-after-launcher');
  await insertProbeFd(page, 'sakaStepProbe');
  const driveAttempts = [];
  const driveAttemptStates = [];
  const found = await findHddProbeDrive(page, scenario, 'sakaStepProbe', async (letter) => {
    driveAttempts.push(letter);
    driveAttemptStates.push(await captureState(`saka-drive-${letter}-before`));
    await page.evaluate((command) => window.sakaStepProbe.engine.pasteText(command),
      `${letter}:\\E0LOAD ${TARGET}\r`);
    return page.evaluate(() => window.sakaStepProbe.tryLoaderControl(15_000));
  });
  const preRelease = await page.evaluate(
    (control) => window.sakaStepProbe.freezeBeforeRelease(control), found.result,
  );
  assert.equal(preRelease.release, 0, '制御移譲前のrelease byteが0ではありません');
  const loaderAtTarget = preRelease.loaderRegisters.cs === preRelease.control.cs
    && preRelease.loaderRegisters.eip === preRelease.control.ip;
  assert.equal(loaderAtTarget, false, '制御移譲前なのにCPUが対象エントリを指しています');
  console.log(
    `[LOADER] drives=${driveAttempts.join(',')} release=${preRelease.release} `
    + `cpu=${preRelease.loaderRegisters.cs.toString(16).toUpperCase().padStart(4, '0')}:`
    + `${preRelease.loaderRegisters.eip.toString(16).toUpperCase().padStart(4, '0')} `
    + `target=${preRelease.control.cs.toString(16).toUpperCase().padStart(4, '0')}:`
    + `${preRelease.control.ip.toString(16).toUpperCase().padStart(4, '0')}`,
  );
  const beforeReleaseState = await captureState('saka-03-before-release');
  const entered = await page.evaluate(
    ({ control, compareLength }) => window.sakaStepProbe.enterAtEntry(control, compareLength),
    { control: found.result, compareLength: ENTRY_COMPARE_BYTES },
  );
  const entryState = await captureState('saka-04-entry');
  const steps = [];
  const stepStates = [];
  for (let index = 0; index < STEP_LIMIT; index++) {
    steps.push(await page.evaluate(() => window.sakaStepProbe.stepOne()));
    stepStates.push(await captureState(`saka-step-${String(index + 1).padStart(2, '0')}-after`));
  }
  const evidence = {
    exeBytes: preRelease.exeBytes,
    guestEntryBytes: entered.guestEntryBytes,
    control: preRelease.control,
    regs: entered.regs,
    pspPrefix: preRelease.pspPrefix,
    beforeScreen: preRelease.screen,
    stoppedScreen: entered.screen,
    beforeGvram: beforeReleaseState.gvram,
    stoppedGvram: entryState.gvram,
    steps,
  };
  assert.deepEqual(pageErrors, []);
  const mz = parseMz(Uint8Array.from(evidence.exeBytes));
  assert.equal(evidence.exeBytes.length, 9149, 'ASM版SAKA.EXEのサイズが既知値9149Bと異なります');
  assert.deepEqual(
    { ss: mz.ss, sp: mz.sp, ip: mz.ip, cs: mz.cs, relocations: mz.relocations },
    { ss: 0x021c, sp: 0x0400, ip: 0x0000, cs: 0x0000, relocations: 4 },
    'ASM版SAKA.EXEのMZヘッダが既知値と異なります',
  );
  const entry = validateSakaEntry(evidence);
  const stepped = validateInstructionSteps(evidence.steps);
  const visualTimeline = [
    engineReadyState, bootReadyState, afterLauncherState, ...driveAttemptStates,
    beforeReleaseState, entryState, ...stepStates,
  ];
  const visualLabels = [
    'engine-ready', 'boot-ready', 'after-launcher',
    ...driveAttempts.map((letter) => `drive-${letter}-before`),
    'before-release', 'entry', ...stepStates.map((_, index) => `step-${index + 1}`),
  ];
  for (let index = 1; index < visualTimeline.length; index++) {
    const canvasChanged = visualTimeline[index].canvas.sha256 !== visualTimeline[index - 1].canvas.sha256;
    const gvramChanged = visualTimeline[index].gvram.sha256 !== visualTimeline[index - 1].gvram.sha256;
    console.log(`[CHANGE] ${visualLabels[index - 1]} -> ${visualLabels[index]} canvas=${canvasChanged} gvram=${gvramChanged}`);
  }
  for (const [index, step] of evidence.steps.entries()) {
    const at = `${step.before.cs.toString(16).toUpperCase().padStart(4, '0')}:${step.before.eip.toString(16).toUpperCase().padStart(4, '0')}`;
    const next = `${step.after.cs.toString(16).toUpperCase().padStart(4, '0')}:${step.after.eip.toString(16).toUpperCase().padStart(4, '0')}`;
    const bytes = step.instruction.bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`[STEP ${index + 1}] ${at}  ${bytes.padEnd(20)} ${step.instruction.text} -> ${next}`);
  }
  console.log(`[PASS] entry=${evidence.control.cs.toString(16).toUpperCase().padStart(4, '0')}:${evidence.control.ip.toString(16).toUpperCase().padStart(4, '0')} file/RAM=${entry.comparedBytes} bytes relocation-excluded=${entry.excludedRelocations} entries/${entry.excludedBytes} bytes steps=${stepped.instructions} branch-skips=${stepped.branchSkips} drives=${driveAttempts.join(',')} fd=${found.letter}:`);
  console.log(`[SHOTS] ${SHOT_DIR}/saka-*.png`);
} catch (error) {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
