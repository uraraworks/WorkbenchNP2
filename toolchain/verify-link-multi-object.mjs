#!/usr/bin/env node

// compile-core.mjs の opts.extraLinkInputs (C以外に別ファイルの.asmをELFオブジェクト化して
// リンクする経路)の実行検証。samples/link-probe.c は samples/link-probe-lib.asm が提供する
// asm_marker()を呼ぶだけの未定義シンボルを含むCで、単体ではリンクできない。
//
// A: link-probe.c + link-probe-lib.o(asmから生成) をリンクしたEXEをWebNP2+FreeDOS(98)上で
//    実行し、末端(TVRAM/画面テキスト)の出力が期待値と完全一致することを確認する。
// B: 故障注入として、あえて link-probe-lib.o を外してリンクする。未定義シンボルにより
//    リンクそのものが失敗すること(=この検査が「外した」ことを見逃さないこと)を確認する。
//    SKIPにはせず、期待通りFAILすることをFAILしなければ検査失敗として扱う。

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileWithFactories } from './compile-core.mjs';
import { assemble } from './assemble.mjs';
import { loadDefaultHeaders } from './compile.mjs';
import { makeFd } from './makefd.mjs';

const TOOLCHAIN_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TOOLCHAIN_DIR);
const BASE_URL = 'http://127.0.0.1:5188/ide/link-multi-object-probe.html';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(import.meta.url);

async function loadPuppeteer() {
  try { return (await import('puppeteer-core')).default; }
  catch { return createRequire(new URL('../../WebNP2/package.json', import.meta.url))('puppeteer-core'); }
}

const DOS_PROMPT_PATTERN = /(?:^|\n)\s*[A-Z]:?\\?>\s*(?:\n|$)/i;
const EXPECTED_LINE = 'LINKPROBE marker=1234';

async function compileLinkProbe(extraLinkInputs) {
  const createSmlrpp = require(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'smlrpp.js'));
  const createSmlrc = require(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'smlrc.js'));
  const createSmlrl = require(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'smlrl.js'));
  const [source, library, includeFiles] = await Promise.all([
    readFile(join(ROOT, 'samples', 'link-probe.c')),
    readFile(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'lcds.a')),
    loadDefaultHeaders(),
  ]);
  return compileWithFactories(new Uint8Array(source), {
    library: new Uint8Array(library), includeFiles, extraLinkInputs,
  }, { createSmlrpp, createSmlrc, createSmlrl, assemble });
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.xdf': 'application/octet-stream',
};

function startServer(programFd) {
  const harness = `<!doctype html>
<html><body><canvas id="screen" width="640" height="400"></canvas>
<script type="module">
import { createWebNP2 } from './vendor/webnp2/webnp2-embed.js';

const engine = createWebNP2(document.querySelector('#screen'));
engine.persistNow = async () => {};

window.linkMultiObjectProbe = {
  engine,
  runAndWait: async (command, timeout = 20_000) => {
    const baseline = engine.getScreenText().text;
    await engine.pasteText(\`\${command}\\r\`);
    const limit = Date.now() + timeout;
    let screen;
    while (Date.now() < limit) {
      screen = engine.getScreenText();
      if (screen.text !== baseline && /(?:^|\\n)\\s*[A-Z]:?\\\\?>\\s*(?:\\n|\$)/i.test(screen.text)) return screen.text;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('DOSプロンプト復帰待機タイムアウト: ' + (screen ? screen.text : ''));
  },
  ready: (async () => {
    const [bootResponse, fdResponse] = await Promise.all([
      fetch('./freedos/fd98_2hd.xdf'),
      fetch('/program.xdf'),
    ]);
    if (!bootResponse.ok) throw new Error('FreeDOS FD fetch failed');
    if (!fdResponse.ok) throw new Error('program FD fetch failed');
    await engine.boot({
      fd1: { file: { name: 'freedos.xdf', bytes: new Uint8Array(await bootResponse.arrayBuffer()) }, sourceKey: 'linkmulti:freedos' },
      fd2: { file: { name: 'program.xdf', bytes: new Uint8Array(await fdResponse.arrayBuffer()) }, sourceKey: 'linkmulti:program' },
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
        if (url.pathname === '/ide/link-multi-object-probe.html') {
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
    server.listen(5188, '127.0.0.1', () => resolveStart(server));
  });
}

async function waitForText(page, pattern, timeout, message) {
  const limit = Date.now() + timeout;
  let last = '';
  while (Date.now() < limit) {
    last = await page.evaluate(() => window.linkMultiObjectProbe.engine.getScreenText().text);
    if (pattern.test(last)) return last;
    await sleep(200);
  }
  throw new Error(`${message}\n----\n${last}`);
}

function exactLineMatch(screenText, expected) {
  return screenText.split('\n').some((line) => line.trim() === expected);
}

// --- B: 故障注入(先にNodeだけで完結させる。ブラウザ不要) ---
const asmSource = await readFile(join(ROOT, 'samples', 'link-probe-lib.asm'));
const asmResult = await assemble(new Uint8Array(asmSource), { format: 'elf' });
if (!asmResult.ok) {
  throw new Error(`link-probe-lib.asmのアセンブルに失敗: ${asmResult.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n')}`);
}

const withoutExtraObject = await compileLinkProbe([]);
assert.equal(withoutExtraObject.ok, false,
  '故障注入(asmオブジェクトを外したリンク)が成功してしまいました。この検査は未定義シンボルを検出できていません');
const undefinedSymbolReported = withoutExtraObject.errors.some((e) => /_asm_marker/.test(e.message ?? ''));
assert.ok(undefinedSymbolReported,
  `リンク失敗の理由に_asm_markerが含まれません: ${JSON.stringify(withoutExtraObject.errors)}`);
console.log(`[PASS] B: 故障注入(asmオブジェクトを外す)でリンクが期待通り失敗 "${withoutExtraObject.errors.map((e) => e.message).join('; ')}"`);

// --- A: 正常系をコンパイルしてWebNP2上で末端出力を確認 ---
const ok = await compileLinkProbe([{ name: 'link-probe-lib.o', bytes: asmResult.output }]);
if (!ok.ok) {
  throw new Error(`link-probe.c + link-probe-lib.oのリンクに失敗: ${ok.errors.map((e) => `[${e.stage}] line ${e.line}: ${e.message}`).join('\n')}`);
}
console.log(`[INFO] A: リンク成功 exe=${ok.output.byteLength}バイト`);

const programFd = makeFd([{ name: 'LINKPRB', ext: 'EXE', data: ok.output }]);

let server; let browser; let profile;
try {
  server = await startServer(programFd);
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(`${tmpdir()}/link-multi-object-probe-`);
  browser = await puppeteer.launch({
    executablePath: CHROME, userDataDir: profile, headless: 'new',
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 120_000 });
  await page.evaluate(() => window.linkMultiObjectProbe.ready);
  assert.deepEqual(pageErrors, []);
  await waitForText(page, DOS_PROMPT_PATTERN, 60_000, 'DOSプロンプト待機タイムアウト');

  const screen = await page.evaluate(() => window.linkMultiObjectProbe.runAndWait('B:\\LINKPRB.EXE'));
  assert.ok(exactLineMatch(screen, EXPECTED_LINE),
    `LINKPRB.EXEの出力が期待行と完全一致しません: ${JSON.stringify(screen.split('\n').filter((l) => l.includes('LINKPROBE')))}`);
  console.log(`[PASS] A: 別ファイルのasmをリンクしたEXEのTVRAM出力が完全一致 "${EXPECTED_LINE}"`);
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((r) => server.close(r));
}

console.log('[PASS] verify-link-multi-object: 別ファイルのオブジェクトをリンクする経路の実行検証と故障注入の両方に合格');
