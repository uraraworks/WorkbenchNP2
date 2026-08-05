#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assemble } from '../toolchain/assemble.mjs';
import { makeFd } from '../toolchain/makefd.mjs';
import { parseExecLoadScreen, validateMzExecLoad } from './exec-load-result.mjs';
import {
  DOS_PROMPT_PATTERN, PROMPT_OR_MENU_PATTERN, externalCase, findHddProbeDrive,
  prepareHddForProbe, waitForText,
} from './legacy-hdd-runner.mjs';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const BASE_URL = process.env.PC98DEV_EXEC_URL ?? 'http://127.0.0.1:5185/ide/exec-load-probe.html';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const RESULT_PATTERN = /(?:E0 (?:4A ERROR AX=[0-9A-F]{4}|4B01 ERROR AX=[0-9A-F]{4}|4B01 OK CS:IP=[0-9A-F]{4}:[0-9A-F]{4} SS:SP=[0-9A-F]{4}:[0-9A-F]{4})|E2 HEADER ERROR AX=[0-9A-F]{4})/i;

async function loadPuppeteer() {
  try {
    return (await import('puppeteer-core')).default;
  } catch {
    const requireFromWebNP2 = createRequire(new URL('../../WebNP2/package.json', import.meta.url));
    return requireFromWebNP2('puppeteer-core');
  }
}

async function assembleFile(path) {
  const result = await assemble(new Uint8Array(await readFile(path)));
  if (!result.ok) {
    throw new Error(result.errors.map((error) => `${path}:${error.line}: ${error.message}`).join('\n'));
  }
  return result.output;
}

async function makeProbeFd() {
  const [probe, hello] = await Promise.all([
    assembleFile(join(ROOT, 'samples', 'exec-load-probe.asm')),
    assembleFile(join(ROOT, 'samples', 'hello.asm')),
  ]);
  return {
    hello,
    image: makeFd([
      { name: 'E0LOAD', ext: 'COM', data: probe },
      { name: 'HELLO', ext: 'COM', data: hello },
    ]),
  };
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.xdf': 'application/octet-stream', '.bmp': 'image/bmp',
};

const harness = `<!doctype html>
<html><body><canvas id="screen" width="640" height="400"></canvas>
<script type="module">
import { createDebugger, createWebNP2 } from './vendor/webnp2/webnp2-embed.js';
const id = new URLSearchParams(location.search).get('case');
const configResponse = await fetch('/probe-config/' + encodeURIComponent(id));
if (!configResponse.ok) throw new Error('probe config fetch failed');
const config = await configResponse.json();
const engine = createWebNP2(document.querySelector('#screen'));
const debug = createDebugger(engine);
// 検証用の一時Chromeプロファイルにも外部HDDをIndexedDB保存しない。
// 起動に必要なメモリ上のコピーだけを使い、page closeで破棄する。
engine.persistNow = async () => {};
let pendingProbeFd = null;
window.execLoadProbe = {
  engine,
  readMemory: (address, length) => Array.from(debug.readMemory(address, length)),
  // HDD起動ケースではプローブFDを起動後にホットマウントするため、後から挿せるよう保持する。
  insertProbeFd: async () => {
    if (!pendingProbeFd) throw new Error('probe FD already inserted');
    await engine.insertFd(1, pendingProbeFd.file, pendingProbeFd.sourceKey);
    pendingProbeFd = null;
  },
  ready: (async () => {
    const probeResponse = await fetch('/exec-load-probe.xdf');
    if (!probeResponse.ok) throw new Error('probe FD fetch failed');
    const probe = { file: { name: 'probe.xdf', bytes: new Uint8Array(await probeResponse.arrayBuffer()) }, sourceKey: 'probe:fd' };
    pendingProbeFd = probe;
    if (config.boot === 'freedos') {
      const bootResponse = await fetch('./freedos/fd98_2hd.xdf');
      if (!bootResponse.ok) throw new Error('FreeDOS FD fetch failed');
      await engine.boot({
        fd1: { file: { name: 'freedos.xdf', bytes: new Uint8Array(await bootResponse.arrayBuffer()) }, sourceKey: 'probe:freedos' },
        fd2: probe,
        latencyMs: 40,
        extMemMB: 1,
      });
      pendingProbeFd = null;   // FreeDOSケースは起動時からFD2に載っている
      return;
    }
    const hddResponse = await fetch(config.imageUrl);
    if (!hddResponse.ok) throw new Error('external HDD fetch failed');
    await engine.boot({
      hdd: {
        file: { name: config.imageName, bytes: new Uint8Array(await hddResponse.arrayBuffer()) },
        sourceKey: 'probe:external-hdd', alreadyPersisted: true,
      },
      // PC-98はFDをHDDより先に起動対象として試すため、起動不能なプローブFDを
      // 挿したままだとHDDへ落ちてこない。HDD単独で起動し、FDは後からホットマウントする。
      latencyMs: 40,
      extMemMB: 1,
    });
  })(),
};
</script></body></html>`;

function startServer(probeFd, cases) {
  const externalById = new Map(cases.filter((entry) => entry.path).map((entry) => [entry.id, entry]));
  const configById = new Map(cases.filter((entry) => !entry.skip).map((entry) => [entry.id, {
    boot: entry.id === 'freedos' ? 'freedos' : 'hdd',
    imageName: entry.imageName,
    imageUrl: entry.path ? `/external-hdd/${entry.id}` : undefined,
  }]));
  return new Promise((resolveStart, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname === '/exec-load-probe.xdf') {
          response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(probeFd);
          return;
        }
        if (url.pathname === '/ide/exec-load-probe.html') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(harness);
          return;
        }
        if (url.pathname.startsWith('/probe-config/')) {
          const config = configById.get(decodeURIComponent(url.pathname.slice('/probe-config/'.length)));
          if (!config) { response.writeHead(404).end('not found'); return; }
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(config));
          return;
        }
        if (url.pathname.startsWith('/external-hdd/')) {
          const entry = externalById.get(decodeURIComponent(url.pathname.slice('/external-hdd/'.length)));
          if (!entry) { response.writeHead(404).end('not found'); return; }
          // 外部資産は許可リスト化したこの経路で直接ストリームし、repo内や一時領域へ複製しない。
          response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': entry.size,
            'Cache-Control': 'no-store',
          });
          createReadStream(entry.path).on('error', () => response.destroy()).pipe(response);
          return;
        }
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
    server.listen(5185, '127.0.0.1', () => resolveStart(server));
  });
}

async function withTimeout(promise, timeout, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * HDD起動ケースのプローブ実行。
 * 起動直後の状態はイメージによって「素のDOSプロンプト」とも限らず、MSDOS33.hdiは
 * NEC純正のコマンドメニュー(Menu v2.41)が出る。メニューならF9で抜けてから進める。
 * さらにHDD起動ではFDのドライブレターがイメージのパーティション構成で変わるため、
 * 決め打ちせず候補を順に試して実際に起動できたものを採用する。
 */
async function runProbeOnHdd(page, scenario) {
  await prepareHddForProbe(page, scenario, 'execLoadProbe');
  const found = await findHddProbeDrive(page, scenario, 'execLoadProbe', async (letter) => {
    const target = scenario.target ?? `${letter}:\\HELLO.COM`;
    await page.evaluate((cmd) => window.execLoadProbe.engine.pasteText(cmd), `${letter}:\\E0LOAD ${target}\r`);
    const limit = Date.now() + 15_000;
    while (Date.now() < limit) {
      const text = await page.evaluate(() => window.execLoadProbe.engine.getScreenText().text);
      if (RESULT_PATTERN.test(text)) return text;
      await sleep(200);
    }
    return null;
  });
  return found.result;
}

async function evaluateResult(page, scenario, screen, hello) {
  const shrinkError = screen.match(/E0 4A ERROR AX=([0-9A-F]{4})/i);
  if (shrinkError) throw new Error(`4Ahメモリ縮小失敗 AX=${shrinkError[1].toUpperCase()}`);

  if (scenario.kind === 'mz') {
    const parsed = parseExecLoadScreen(screen);
    let pspPrefix = [];
    let stackTop = [];
    if (parsed.loaded && parsed.mz) {
      const psp = parsed.loaded.cs - parsed.mz.cs - 0x10;
      if (psp >= 0 && psp < 0xA000) {
        pspPrefix = await page.evaluate(
          ({ address }) => window.execLoadProbe.readMemory(address, 2),
          { address: psp * 16 },
        );
      }
      // 返却SPがe_spより2小さい理由を実測で確定するため、SS:SPが指すワードを読む。
      stackTop = await page.evaluate(
        ({ address }) => window.execLoadProbe.readMemory(address, 2),
        { address: parsed.loaded.ss * 16 + parsed.loaded.sp },
      );
      console.error(`[INFO] ${scenario.label}: SS:SP=${parsed.loaded.ss.toString(16)}:${parsed.loaded.sp.toString(16)} が指すワード = ${stackTop.map((b) => b.toString(16).padStart(2, '0')).join(' ')} (e_sp=${parsed.mz.sp.toString(16)})`);
    }
    const checked = validateMzExecLoad(screen, pspPrefix, scenario.target, scenario.expectedHeader, stackTop);
    if (checked.kind === 'memory-error') {
      return `[RESULT] ${scenario.label}: 対象パス/MZ20確認、4B01h CF=1 AX=0008（メモリ不足）`;
    }
    const { loaded: regs, header, psp } = checked;
    return `[RESULT] ${scenario.label}: MZ整合 PASS e_CS:IP=${header.cs.toString(16).toUpperCase().padStart(4, '0')}:${header.ip.toString(16).toUpperCase().padStart(4, '0')} e_SS:SP=${header.ss.toString(16).toUpperCase().padStart(4, '0')}:${header.sp.toString(16).toUpperCase().padStart(4, '0')} loaded=${regs.cs.toString(16).toUpperCase().padStart(4, '0')}:${regs.ip.toString(16).toUpperCase().padStart(4, '0')} PSP=${psp.toString(16).toUpperCase().padStart(4, '0')}`;
  }

  const execError = screen.match(/E0 4B01 ERROR AX=([0-9A-F]{4})/i);
  if (execError) {
    const code = execError[1].toUpperCase();
    const note = code === '0008' ? '（メモリ不足）' : '';
    return `[RESULT] ${scenario.label}: 4B01h CF=1 AX=${code}${note}`;
  }

  const self = screen.match(/E0 SELF CS=([0-9A-F]{4})/i);
  const loaded = screen.match(
    /E0 4B01 OK CS:IP=([0-9A-F]{4}):([0-9A-F]{4}) SS:SP=([0-9A-F]{4}):([0-9A-F]{4})/i,
  );
  assert.ok(self, 'ローダ自身のCSが表示されていません');
  assert.ok(loaded, '4B01h成功時のCS:IP / SS:SPが表示されていません');
  const [loaderCs, childCs, childIp, childSs, childSp] = [self[1], ...loaded.slice(1)].map(
    (value) => Number.parseInt(value, 16),
  );
  assert.equal(childIp, 0x0100, `COMの初期IPが0100hではありません: ${loaded[2]}`);
  assert.equal(childSs, childCs, `COMの初期SSとCSが一致しません: ${loaded[3]} != ${loaded[1]}`);
  assert.ok(childCs >= 0x0050 && childCs < 0xA000 && childCs !== loaderCs,
    `子CSが空きメモリ位置として不正です: ${loaded[1]}`);
  assert.ok(childSp > 0x0100, `子SPが不正です: ${loaded[4]}`);
  const loadedBytes = await page.evaluate(
    ({ address, length }) => window.execLoadProbe.readMemory(address, length),
    { address: childCs * 16, length: 0x100 + hello.byteLength },
  );
  assert.deepEqual(loadedBytes.slice(0, 2), [0xCD, 0x20], '返却CSにPSPのINT 20hがありません');
  assert.deepEqual(loadedBytes.slice(0x100), Array.from(hello), '返却CS:0100にHELLO.COMがありません');
  assert.equal(screen.includes('Hello, PC-98!'), false, 'load-onlyなのにHELLO.COMが実行されています');
  return `[RESULT] ${scenario.label}: 4B01h対応 CS:IP=${loaded[1].toUpperCase()}:${loaded[2].toUpperCase()} SS:SP=${loaded[3].toUpperCase()}:${loaded[4].toUpperCase()}`;
}

async function runScenario(browser, scenario, hello) {
  if (scenario.skip) return `[RESULT] ${scenario.label}: SKIP（${scenario.skip}）`;
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(240_000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${BASE_URL}?case=${encodeURIComponent(scenario.id)}`, {
      waitUntil: 'networkidle2', timeout: 240_000,
    });
    await withTimeout(
      page.evaluate(() => window.execLoadProbe.ready),
      240_000,
      `${scenario.label}のWebNP2起動がタイムアウトしました`,
    );
    assert.deepEqual(pageErrors, []);
    await waitForText(
      page, 'execLoadProbe',
      scenario.id === 'freedos' ? DOS_PROMPT_PATTERN : PROMPT_OR_MENU_PATTERN,
      scenario.promptTimeout,
      `${scenario.label}のDOSプロンプト待機がタイムアウトしました`,
    );
    let screen;
    if (scenario.id === 'freedos') {
      // FreeDOSケースはプローブが起動時からFD2=B:に載っている。
      await page.evaluate(() => window.execLoadProbe.engine.pasteText('B:\\E0LOAD B:\\HELLO.COM\r'));
      screen = await waitForText(
        page, 'execLoadProbe', RESULT_PATTERN, 60_000, `${scenario.label}の4B01h結果がTVRAMへ表示されませんでした`,
      );
    } else {
      screen = await runProbeOnHdd(page, scenario);
    }
    return await evaluateResult(page, scenario, screen, hello);
  } finally {
    await page.close();
  }
}

let server;
let browser;
let profile;
const failures = [];

try {
  const { hello, image: probeFd } = await makeProbeFd();
  const cases = [
    { id: 'freedos', label: 'FreeDOS(98)', promptTimeout: 60_000 },
    await externalCase('msdos33', 'MS-DOS 3.3', 'PC98DEV_MSDOS33_HDI', 'msdos33.hdi'),
    await externalCase('legacy', '1996年HDD環境', 'PC98DEV_LEGACY_THD', 'legacy.thd'),
  ];
  const legacy = cases[2];
  cases.push(
    {
      ...legacy, id: 'legacy-saka-asm', label: '1996年HDD ASM版 SAKA.EXE', kind: 'mz',
      target: '\\A-GAMES\\SAKA\\SAKA.EXE', expectedHeader: { ss: 0x021c, sp: 0x0400, ip: 0x0000, cs: 0x0000 },
    },
    {
      ...legacy, id: 'legacy-saka-c', label: '1996年HDD C版 SAKA.EXE', kind: 'mz',
      target: '\\C-GAMES\\SAKA\\1014\\SAKA.EXE', expectedHeader: { ss: 0x6d1d, sp: 0x0800, ip: 0x48d8, cs: 0x0000 },
    },
  );
  if (process.env.PC98DEV_EXEC_URL) {
    throw new Error('この検証は外部資産をno-store配信するためPC98DEV_EXEC_URLを使用できません');
  }
  server = await startServer(probeFd, cases);
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(join(tmpdir(), 'pc98dev-exec-load-'));
  browser = await puppeteer.launch({
    executablePath: CHROME,
    userDataDir: profile,
    headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });

  for (const scenario of cases) {
    try {
      console.log(await runScenario(browser, scenario, hello));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${scenario.label}: ${message}`);
      console.log(`[RESULT] ${scenario.label}: 検証失敗（${message}）`);
    }
  }
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[ERROR] ${failure}`);
  process.exitCode = 1;
}
