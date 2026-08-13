#!/usr/bin/env node
// 公開される集合(= git が追跡しているファイル)を正として、
// 実行時に取りに行く資産とページ内リンクの参照先がすべてそこに含まれるかを検査する。
//
// なぜディスクではなく git を見るのか:
//   toolchain/nasm-src/ と toolchain/smallerc-src/ は十数MBの upstream ツリーなので
//   .gitignore している。手元には存在するのでローカルの静的サーバからは配信でき、
//   ディスクを見る検査は通ってしまう。実際にこれで2件を公開サイトへ出した:
//     - C のヘッダ29本が404 → C のビルドが丸ごと動かなかった
//     - フッタの NASM ライセンスリンクが404
//   「手元で動く」と「公開して動く」は別物で、前者を測っても後者は保証されない。
//
// 実行: node toolchain/verify-published-assets.mjs   (数秒。エミュレータを起動しない)

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** git が追跡しているファイル = 公開される集合。 */
function trackedFiles() {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' });
  return new Set(out.split('\0').filter(Boolean));
}

const tracked = trackedFiles();
assert.ok(tracked.size > 50, `追跡ファイルが少なすぎます(${tracked.size})。git リポジトリを見ていますか`);

/** repo相対パスへ正規化する。repo外を指すものは null。 */
function toRepoPath(fromFile, href) {
  const absolute = resolve(dirname(join(ROOT, fromFile)), href);
  const rel = relative(ROOT, absolute);
  if (rel.startsWith('..') || rel.startsWith(sep)) return null;
  return normalize(rel);
}

const failures = [];
const checked = [];

function requireTracked(fromFile, href, label) {
  const path = toRepoPath(fromFile, href);
  if (path === null) {
    failures.push(`${label}: ${fromFile} の "${href}" がリポジトリ外を指しています`);
    return;
  }
  checked.push(path);
  if (!tracked.has(path)) {
    failures.push(`${label}: ${path} は git に追跡されていません（${fromFile} が "${href}" で参照）`);
  }
}

// --- 1. HTML の href / src のうち、リポジトリ内を指す相対パス ---
for (const page of ['ide/index.html', 'ide/help.html']) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  for (const match of html.matchAll(/(?:href|src)=["'](\.[^"'#?]*)["']/g)) {
    requireTracked(page, match[1], 'ページ内リンク');
  }
}

// --- 2. 実行時に fetch する資産 ---
// パスの導出元である browser-toolchain.mjs の実体と食い違ったら落とす。
// リストだけ書いて実体とずれると、検査そのものが嘘をつくため。
const toolchainSource = readFileSync(join(ROOT, 'ide/browser-toolchain.mjs'), 'utf8');

const HEADER_AREA_BASE = '../toolchain/smlrc-wasm/csrc/';
assert.ok(
  toolchainSource.includes(`fetchBytes(\`${HEADER_AREA_BASE}\${area}/\${name}\`)`),
  `browser-toolchain.mjs のヘッダ取得先が ${HEADER_AREA_BASE} ではありません。この検査のリストが実体とずれています`,
);

function namesFrom(constName) {
  const body = toolchainSource.match(new RegExp(`${constName}\\s*=\\s*(?:new Set\\()?\\[([^\\]]*)\\]`, 's'));
  assert.ok(body, `${constName} を browser-toolchain.mjs から読み取れません`);
  return [...body[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const headerNames = namesFrom('HEADER_NAMES');
const includeHeaders = new Set(namesFrom('INCLUDE_HEADERS'));
assert.equal(headerNames.length, 29, `ヘッダ本数が29本ではありません: ${headerNames.length}`);

for (const name of headerNames) {
  const area = includeHeaders.has(name) ? 'include' : 'srclib';
  requireTracked('ide/browser-toolchain.mjs', `${HEADER_AREA_BASE}${area}/${name}`, '実行時fetch(Cヘッダ)');
}

// その他の実行時 fetch。相対パス文字列をソースから直接拾う。
for (const match of toolchainSource.matchAll(/fetchBytes\('([^']+)'\)/g)) {
  requireTracked('ide/browser-toolchain.mjs', match[1], '実行時fetch');
}
for (const match of toolchainSource.matchAll(/new URL\(`([^`$]+)`/g)) {
  requireTracked('ide/browser-toolchain.mjs', match[1], '実行時locateFile');
}

// --- 3. 報告 ---
if (failures.length > 0) {
  console.error('[FAIL] 公開される集合に含まれない参照があります:');
  for (const line of failures) console.error(`  - ${line}`);
  process.exitCode = 1;
} else {
  console.log(`[PASS] published assets: ${checked.length}件の参照がすべて git 追跡下にあります`);
}

// --- 4. 陽性対照 ---
// 追跡されていないパスを混ぜたら必ず落ちることを実測する。
// これが無いと「常に真」の検査になっていても気づけない。
{
  const before = failures.length;
  requireTracked('ide/index.html', '../toolchain/nasm-src/LICENSE', '陽性対照');
  assert.equal(
    failures.length, before + 1,
    '陽性対照が素通りしました。未追跡パスを検出できていないので、この検査は信用できません',
  );
  console.log('[PASS] 陽性対照: 未追跡パス(toolchain/nasm-src/LICENSE)を混ぜると検出される');
}
