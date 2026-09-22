#!/usr/bin/env node
// vendor/p98lib/ (別リポジトリ p98lib のバイト単位コピー、経緯は vendor/p98lib/README.md参照)
// が古びていないかを検査する。
//
// 検査は2段構え:
//   1. 常に走る: vendor/p98lib/ の各ファイルの sha256 が MANIFEST.json と一致するか。
//      p98lib のチェックアウトが手元に無くても走る（CI等、../p98lib が無い環境を想定）。
//   2. ../p98lib が隣にある場合のみ追加で走る: 本家とバイト一致するか、かつ
//      MANIFEST.json の commit が本家の HEAD と一致するか。
//
// 2.をSKIPした場合、それを合格の顔で黙って通してはいけない
// (feedback_logs_fake_silence: SKIPが合格の顔になる)。SKIPしたことを標準出力に明示し、
// 最後のサマリ行にもSKIP件数を必ず含める。
//
// 実行: node tools/verify-p98lib-vendor.mjs

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = join(ROOT, 'vendor', 'p98lib');
const P98LIB_DIR = resolve(ROOT, '..', 'p98lib');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const manifest = JSON.parse(readFileSync(join(VENDOR_DIR, 'MANIFEST.json'), 'utf8'));
const files = Object.keys(manifest.files);

const failures = [];
let skipCount = 0;

// --- 1. MANIFEST.json との整合(常に実行) ---
for (const relPath of files) {
  const path = join(VENDOR_DIR, relPath);
  if (!existsSync(path)) {
    failures.push(`[MANIFEST不一致] ${relPath} が vendor/p98lib/ に存在しません`);
    continue;
  }
  const actual = sha256(readFileSync(path));
  const expected = manifest.files[relPath];
  if (actual !== expected) {
    failures.push(`[MANIFEST不一致] ${relPath} の sha256 が一致しません (期待 ${expected} / 実際 ${actual})`);
  }
}
if (failures.length === 0) {
  console.log(`[PASS] MANIFEST整合: ${files.length}件のファイルがすべて MANIFEST.json の sha256 と一致しました`);
}

// --- 2. ../p98lib が隣にある場合のみ: 本家との一致検査 ---
if (!existsSync(P98LIB_DIR)) {
  skipCount++;
  console.log(
    `[SKIP] ../p98lib が無いため本家との一致は検査していません（MANIFEST整合のみ検査済み）`,
  );
} else {
  // commitの一致
  let upstreamCommit;
  try {
    upstreamCommit = execFileSync('git', ['-C', P98LIB_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (error) {
    failures.push(`[本家比較] ../p98lib の HEAD を取得できませんでした: ${error.message}`);
    upstreamCommit = null;
  }
  if (upstreamCommit !== null) {
    if (upstreamCommit !== manifest.commit) {
      failures.push(
        `[本家比較] MANIFEST.json の commit(${manifest.commit}) が ../p98lib の HEAD(${upstreamCommit}) と異なります。`
        + ` vendor/p98lib/ を更新してください（手順は vendor/p98lib/README.md 参照）`,
      );
    } else {
      console.log(`[PASS] 本家比較: MANIFEST.json の commit が ../p98lib の HEAD と一致しました`);
    }
  }

  // バイト一致。vendor側のパスと本家側のパスは接頭辞が違うだけ(include/src/samples/LICENSE共通)。
  let byteMismatch = 0;
  for (const relPath of files) {
    const vendorPath = join(VENDOR_DIR, relPath);
    const upstreamPath = join(P98LIB_DIR, relPath);
    if (!existsSync(upstreamPath)) {
      failures.push(`[本家比較] ../p98lib/${relPath} が存在しません`);
      byteMismatch++;
      continue;
    }
    if (!existsSync(vendorPath)) continue; // 1.で既に報告済み
    const vendorBytes = readFileSync(vendorPath);
    const upstreamBytes = readFileSync(upstreamPath);
    if (Buffer.compare(vendorBytes, upstreamBytes) !== 0) {
      failures.push(`[本家比較] vendor/p98lib/${relPath} が ../p98lib/${relPath} とバイト一致しません`);
      byteMismatch++;
    }
  }
  if (byteMismatch === 0) {
    console.log(`[PASS] 本家比較: ${files.length}件のファイルがすべて ../p98lib とバイト一致しました`);
  }
}

// --- 3. サマリ ---
if (failures.length > 0) {
  console.error('[FAIL] p98lib vendor 検査に失敗しました:');
  for (const line of failures) console.error(`  - ${line}`);
  console.error(`サマリ: 失敗 ${failures.length}件 / SKIP ${skipCount}件`);
  if (skipCount > 0) {
    console.error('更新コマンド例: git -C ../p98lib rev-parse HEAD で本家commitを確認し、'
      + 'vendor/p98lib/README.md の更新手順に従ってコピーとMANIFEST.jsonを更新してください');
  }
  process.exitCode = 1;
} else {
  console.log(`サマリ: 失敗 0件 / SKIP ${skipCount}件`);
  if (skipCount > 0) {
    console.log('(../p98lib が隣にあれば本家とのバイト一致・commit一致まで検査されます)');
  }
}
