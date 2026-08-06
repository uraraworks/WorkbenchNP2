#!/usr/bin/env node

/** ネイティブ選択ダイアログは自動化せず、同じ実装の本物のハンドルを返すOPFSへDirectoryProjectFSを載せて検証する。 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(IDE_DIR);
const BASE_URL = process.env.PC98DEV_URL ?? 'http://127.0.0.1:5187/ide/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SJIS_TEXT = '// てすと\nint main(void){return 0;}\n';

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
        if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) { response.writeHead(403).end(); return; }
        const body = await readFile(file);
        const types = {
          '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
          '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
          '.asm': 'text/plain; charset=utf-8', '.c': 'text/plain; charset=utf-8',
          '.h': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
        };
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404).end('not found'); }
    });
    server.once('error', reject);
    server.listen(5187, '127.0.0.1', () => resolveStart(server));
  });
}

function assertRun(screen, expected) {
  assert.ok(screen.text.includes(expected), `PC-98画面に${expected}がありません`);
  assert.ok(screen.lines.some((line) => line.trim() === expected), `出力行${expected}が完全一致しません`);
}

let server; let browser; let profile; let page;
try {
  if (!process.env.PC98DEV_URL) server = await startServer();
  const puppeteer = await loadPuppeteer();
  profile = await mkdtemp(`${tmpdir()}/pc98dev-directory-fs-`);
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

  await page.evaluate(async () => {
    const { DirectoryProjectFS } = await import('./directory-fs.mjs');
    const root = await navigator.storage.getDirectory();
    for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });

    const directory = async (path) => {
      let current = root;
      for (const name of path.split('/').filter(Boolean)) {
        current = await current.getDirectoryHandle(name, { create: true });
      }
      return current;
    };
    const write = async (path, value) => {
      const parts = path.split('/');
      const name = parts.pop();
      const parent = await directory(parts.join('/'));
      const handle = await parent.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(value);
      await writable.close();
    };

    const sample = await (await fetch('../samples/hello.asm')).text();
    await write('src/hello.asm', sample.replace('Hello, PC-98!', 'From folder!'));
    await write('src/util.h', '#define DIRECTORY_FS 1\n');
    await write('notes.md', '# Directory notes\n');
    await write('image.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    await write('.git/config', '[core]\nrepositoryformatversion = 0\n');
    await write('legacy/SJIS.C', new Uint8Array([
      0x2F, 0x2F, 0x20, 0x82, 0xC4, 0x82, 0xB7, 0x82, 0xC6, 0x0A,
      0x69, 0x6E, 0x74, 0x20, 0x6D, 0x61, 0x69, 0x6E, 0x28, 0x76, 0x6F,
      0x69, 0x64, 0x29, 0x7B, 0x72, 0x65, 0x74, 0x75, 0x72, 0x6E, 0x20,
      0x30, 0x3B, 0x7D, 0x0A,
    ]));
    await write('deep/a/b/c/deep.asm', 'CPU 8086\nBITS 16\nORG 100h\nret\n');
    window.__directoryFsVerify = { root, DirectoryProjectFS, fs: new DirectoryProjectFS(root) };
  });

  const listed = await page.evaluate(() => window.__directoryFsVerify.fs.listDetailed());
  const listedPaths = listed.files.map((file) => file.path);
  assert.deepEqual(listedPaths, [...listedPaths].sort((left, right) => left.localeCompare(right)));
  for (const path of ['src/hello.asm', 'src/util.h', 'notes.md', 'legacy/SJIS.C', 'deep/a/b/c/deep.asm']) {
    assert.ok(listedPaths.includes(path), `一覧に${path}がありません`);
  }
  assert.ok(!listedPaths.includes('.git/config'), '隠しディレクトリ配下が一覧へ入りました');
  assert.equal(listed.skipped, 1);
  assert.equal(listed.truncated, false);
  console.log('[PASS] listDetailed: sort/text filter/hidden directory/skipped/truncated');

  const decoded = await page.evaluate(async () => ({
    sjis: await window.__directoryFsVerify.fs.read('legacy/SJIS.C'),
    utf8: await window.__directoryFsVerify.fs.read('src/util.h'),
  }));
  assert.equal(decoded.sjis.encoding, 'shift_jis');
  assert.equal(decoded.sjis.content, SJIS_TEXT);
  assert.equal(decoded.utf8.encoding, 'utf-8');
  console.log('[PASS] read: Shift_JIS fallback and UTF-8 detection');

  assert.equal(await page.evaluate(() => window.__directoryFsVerify.fs.read('no/such/file.asm')), null);
  console.log('[PASS] read: missing file returns null');

  const overwrite = await page.evaluate(async () => {
    const { root, fs } = window.__directoryFsVerify;
    const legacy = await root.getDirectoryHandle('legacy');
    const handle = await legacy.getFileHandle('SJIS.C');
    const before = (await handle.getFile()).size;
    let message = '';
    try { await fs.write('legacy/SJIS.C', 'x'); }
    catch (error) { message = error.message; }
    const rejected = (await handle.getFile()).size;
    const written = await fs.write('legacy/SJIS.C', '// utf8\n', { overwriteEncoding: true });
    const read = await fs.read('legacy/SJIS.C');
    return { before, rejected, message, written, read };
  });
  assert.ok(overwrite.message.includes('Shift_JIS'));
  assert.equal(overwrite.rejected, overwrite.before);
  assert.equal(overwrite.written.encoding, 'utf-8');
  assert.equal(overwrite.read.encoding, 'utf-8');
  console.log('[PASS] write: Shift_JIS guard and explicit UTF-8 overwrite');

  const roundTrip = await page.evaluate(async () => {
    const content = 'CPU 8086\nBITS 16\nORG 100h\nret\n';
    await window.__directoryFsVerify.fs.write('new/deep/created.asm', content);
    return { content, read: await window.__directoryFsVerify.fs.read('new/deep/created.asm') };
  });
  assert.equal(roundTrip.read.content, roundTrip.content);
  console.log('[PASS] write: intermediate directories and read round trip');

  const deleted = await page.evaluate(async () => {
    const fs = window.__directoryFsVerify.fs;
    await fs.delete('new/deep/created.asm');
    const read = await fs.read('new/deep/created.asm');
    await fs.delete('new/deep/created.asm');
    return read;
  });
  assert.equal(deleted, null);
  console.log('[PASS] delete: missing file is idempotent');

  const invalid = await page.evaluate(async () => {
    const fs = window.__directoryFsVerify.fs;
    const results = [];
    for (const action of [() => fs.write('../evil.asm', 'x'), () => fs.read('a/../b.asm')]) {
      try { await action(); results.push(false); }
      catch { results.push(true); }
    }
    return results;
  });
  assert.deepEqual(invalid, [true, true]);
  console.log('[PASS] validatePath: traversal paths rejected');

  const shallow = await page.evaluate(async () => {
    const { root, DirectoryProjectFS } = window.__directoryFsVerify;
    return new DirectoryProjectFS(root, { limits: { maxDepth: 1, maxFiles: 2000 } }).listDetailed();
  });
  assert.ok(!shallow.files.some((file) => file.path === 'deep/a/b/c/deep.asm'));
  console.log('[PASS] limits: maxDepth stops deep traversal');

  const limited = await page.evaluate(async () => {
    const { root, DirectoryProjectFS } = window.__directoryFsVerify;
    return new DirectoryProjectFS(root, { limits: { maxDepth: 8, maxFiles: 2 } }).listDetailed();
  });
  assert.equal(limited.truncated, true);
  assert.equal(limited.files.length, 2);
  console.log('[PASS] limits: maxFiles reports truncation');

  assert.equal(await page.evaluate(() => window.__directoryFsVerify.fs.ensurePermission()), 'granted');
  console.log('[PASS] ensurePermission: OPFS handle is granted');

  const integration = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    const { root } = window.__directoryFsVerify;
    const connected = await wb.connectDirectory(root);
    const directoryState = wb.getDirectoryState();
    await wb.openFile('directory', 'src/hello.asm');
    const editorState = wb.getState();
    const build = await wb.buildCurrent();
    const run = await wb.runCurrent();
    return { handleName: root.name, connected, directoryState, editorState, build, run };
  });
  assert.equal(integration.directoryState.connected, true);
  assert.equal(integration.directoryState.name, integration.handleName);
  assert.equal(integration.editorState.currentOrigin, 'directory');
  assert.equal(integration.build.ok, true, JSON.stringify(integration.build.errors));
  assert.equal(integration.build.dosName, 'HELLO.COM');
  assert.equal(integration.run.ok, true);
  assertRun(integration.run.screen, 'From folder!');
  assert.throws(() => assertRun(integration.run.screen, 'From typo!'));
  console.log('[PASS] workbench: connect/open/build/run and wrong-output fault detected');

  const saved = await page.evaluate(async () => {
    const wb = window.pc98workbench;
    const { root } = window.__directoryFsVerify;
    const edited = wb.getValue().replace('From folder!', 'Saved folder!');
    wb.setValue(edited);
    await wb.saveFile();
    const src = await root.getDirectoryHandle('src');
    const handle = await src.getFileHandle('hello.asm');
    const direct = await (await handle.getFile()).text();
    return { edited, direct };
  });
  assert.equal(saved.direct, saved.edited);
  console.log('[PASS] workbench: saveFile writes directly back to OPFS');

  const disconnected = await page.evaluate(() => {
    window.pc98workbench.disconnectDirectory();
    return window.pc98workbench.getDirectoryState();
  });
  assert.equal(disconnected.connected, false);
  console.log('[PASS] workbench: disconnect clears directory state');
} catch (error) {
  const screen = page ? await page.evaluate(() => window.pc98workbench.getScreenText()).catch(() => null) : null;
  for (const [index, line] of (screen?.lines ?? []).entries()) console.error(`[TVRAM ${String(index).padStart(2)}] ${line}`);
  console.error(`[ERROR] ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
