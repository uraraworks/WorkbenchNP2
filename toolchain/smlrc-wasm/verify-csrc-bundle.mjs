#!/usr/bin/env node
// csrc/{include,srclib}/ は、ブラウザ実行時にfetchするため upstream の
// smallerc-src/v0100/{include,srclib}/ からバイト単位でコピーし、git追跡している
// (smallerc-src自体は.gitignore対象の十数MBツリーなので配布できない)。
// コピーが pin済み revision の upstream からずれると、ide側は気づかずに古い/違う
// ヘッダをビルドへ渡してしまう。upstreamツリーがローカルにある場合に限り、
// 全29ファイルを1バイトも違わず突き合わせて検出する。
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const AREAS = ['include', 'srclib'];
const csrcDir = (area) => new URL(`csrc/${area}/`, import.meta.url);
const upstreamDir = (area) => new URL(`../smallerc-src/v0100/${area}/`, import.meta.url);

async function compareArea(area) {
  const bundledDir = csrcDir(area);
  const names = (await readdir(fileURLToPath(bundledDir))).filter((name) => name.endsWith('.h')).sort();
  const results = [];
  for (const name of names) {
    const bundled = await readFile(new URL(name, bundledDir));
    const upstream = await readFile(new URL(name, upstreamDir(area)));
    const same = Buffer.compare(bundled, upstream) === 0;
    results.push({ area, name, same, size: bundled.byteLength });
  }
  return results;
}

let failed = false;

if (!existsSync(fileURLToPath(upstreamDir('include')))) {
  console.log('[INFO] toolchain/smallerc-src が見当たりません（.gitignore対象）。'
    + 'csrc/ とupstreamのバイト比較はスキップします。build.sh等でcloneした環境で実行してください。');
} else {
  const all = (await Promise.all(AREAS.map(compareArea))).flat();
  assert.ok(all.length === 29, `29本のはずが${all.length}本しか比較していません`);
  for (const { area, name, same, size } of all) {
    console.log(`${same ? 'PASS' : 'FAIL'} ${area}/${name}: ${size} bytes upstream一致=${same}`);
    failed ||= !same;
  }

  // 規律: 陽性対照。ずれたコピーを1バイト混ぜたら不一致として検出できることを、
  // 実測してから通常運転へ戻す。無条件PASSの検査になっていないことの確認。
  const [{ area: sampleArea, name: sampleName }] = all;
  const bundled = await readFile(new URL(sampleName, csrcDir(sampleArea)));
  const corrupted = Buffer.from(bundled);
  corrupted[0] ^= 1;
  const upstream = await readFile(new URL(sampleName, upstreamDir(sampleArea)));
  assert.throws(() => assert.ok(Buffer.compare(corrupted, upstream) === 0));
  console.log('[PASS] 陽性対照: 1バイト破損コピーは不一致として検出される');
}

if (failed) process.exitCode = 1;
