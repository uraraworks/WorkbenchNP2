#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assemble } from '../toolchain/assemble.mjs';
import { makeFd } from '../toolchain/makefd.mjs';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const BASE_URL = process.env.PC98DEV_EXEC_URL ?? 'http://127.0.0.1:5185/ide/exec-load-probe.html';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

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
const engine = createWebNP2(document.querySelector('#screen'));
const debug = createDebugger(engine);
window.execLoadProbe = {
  engine,
  readMemory: (address, length) => Array.from(debug.readMemory(address, length)),
  ready: (async () => {
    const [fd1Response, fd2Response] = await Promise.all([
      fetch('./freedos/fd98_2hd.xdf'), fetch('/exec-load-probe.xdf'),
    ]);
    if (!fd1Response.ok || !fd2Response.ok) throw new Error('FD image fetch failed');
    await engine.boot({
      fd1: { file: { name: 'freedos.xdf', bytes: new Uint8Array(await fd1Response.arrayBuffer()) }, sourceKey: 'probe:fd1' },
      fd2: { file: { name: 'probe.xdf', bytes: new Uint8Array(await fd2Response.arrayBuffer()) }, sourceKey: 'probe:fd2' },
      latencyMs: 40,
      extMemMB: 1,
    });
  })(),
};
</script></body></html>`;

function startServer(probeFd) {
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

async function waitForText(page, pattern, timeout, message) {
  const limit = Date.now() + timeout;
  while (Date.now() < limit) {
    const text = await page.evaluate(() => window.execLoadProbe.engine.getScreenText().text);
    if (pattern.test(text)) return text;
    await sleep(200);
  }
  throw new Error(message);
}

let server;
let browser;
let profile;

try {
  const { hello, image: probeFd } = await makeProbeFd();
  if (!process.env.PC98DEV_EXEC_URL) server = await startServer(probeFd);
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(join(tmpdir(), 'pc98dev-exec-load-'));
  browser = await puppeteer.launch({
    executablePath: CHROME,
    userDataDir: profile,
    headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => window.execLoadProbe.ready);
  assert.deepEqual(pageErrors, []);

  await waitForText(page, /A:\\?>/i, 60_000, 'FreeDOSプロンプト待機がタイムアウトしました');
  await page.evaluate(() => window.execLoadProbe.engine.pasteText('B:\\E0LOAD\r'));
  const screen = await waitForText(
    page,
    /E0 (?:4A ERROR AX=[0-9A-F]{4}|4B01 ERROR AX=[0-9A-F]{4}|4B01 OK CS:IP=[0-9A-F]{4}:[0-9A-F]{4} SS:SP=[0-9A-F]{4}:[0-9A-F]{4})/i,
    30_000,
    '4B01h検証結果がTVRAMへ表示されませんでした',
  );

  const shrinkError = screen.match(/E0 4A ERROR AX=([0-9A-F]{4})/i);
  if (shrinkError) throw new Error(`4Ahメモリ縮小失敗 AX=${shrinkError[1].toUpperCase()}`);
  const execError = screen.match(/E0 4B01 ERROR AX=([0-9A-F]{4})/i);
  if (execError) {
    const errorCode = execError[1].toUpperCase();
    // 0008hだけは4Ah縮小量などプローブ側の不備をまず疑うべきであり、
    // FreeDOS(98)の「非対応」という可否判定へ読み替えない。
    if (errorCode === '0008') {
      throw new Error('4B01hがメモリ不足 AX=0008を返しました（4Ah縮小量を再確認してください）');
    }
    console.log(`[RESULT] FreeDOS(98) 4B01hはCF=1で終了 AX=${errorCode}`);
    console.log('[PASS] CFエラーコードをTVRAMから取得（4B01h利用不可）');
  } else {
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
    assert.ok(childCs > loaderCs && childCs < 0xA000, `子CSが空きメモリ位置として不正です: ${loaded[1]}`);
    assert.ok(childSp > 0x0100, `子SPが不正です: ${loaded[4]}`);
    const loadedBytes = await page.evaluate(
      ({ address, length }) => window.execLoadProbe.readMemory(address, length),
      { address: childCs * 16, length: 0x100 + hello.byteLength },
    );
    assert.deepEqual(loadedBytes.slice(0, 2), [0xCD, 0x20], '返却CSにPSP先頭のINT 20hがありません');
    assert.deepEqual(loadedBytes.slice(0x100), Array.from(hello), '返却CS:0100にHELLO.COMがありません');
    assert.equal(screen.includes('Hello, PC-98!'), false, '4B01h load-onlyでHELLO.COMが実行されました');
    console.log(`[RESULT] FreeDOS(98) 4B01h対応 CS:IP=${loaded[1].toUpperCase()}:${loaded[2].toUpperCase()} SS:SP=${loaded[3].toUpperCase()}:${loaded[4].toUpperCase()}`);
    console.log('[PASS] PSP・HELLO.COM本体・load-only・初期レジスタ値を確認');
  }
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
