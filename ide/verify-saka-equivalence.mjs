#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareSakaCheckpoints } from './saka-equivalence-result.mjs';

const IDE_DIR = dirname(fileURLToPath(import.meta.url));
const START_SCRIPT = join(IDE_DIR, 'verify-saka-start.mjs');

function runVariant(variant, resultPath) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [START_SCRIPT], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PC98DEV_SAKA_VARIANT: variant,
        PC98DEV_SAKA_CHECKPOINTS: '3',
        PC98DEV_SAKA_RESULT: resultPath,
      },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${variant}起動検証が失敗しました (code=${code}, signal=${signal ?? 'none'})`));
    });
  });
}

let temporary;
try {
  temporary = await mkdtemp(join(tmpdir(), 'pc98dev-saka-equivalence-'));
  const originalPath = join(temporary, 'original.json');
  const convertedPath = join(temporary, 'converted.json');
  // 同じHDD・データと同じSPACE入力2回を、互いに独立したクリーン起動へ順番に適用する。
  await runVariant('original', originalPath);
  await runVariant('converted', convertedPath);
  const [original, converted] = await Promise.all([
    readFile(originalPath, 'utf8').then(JSON.parse), readFile(convertedPath, 'utf8').then(JSON.parse),
  ]);
  const result = compareSakaCheckpoints(original, converted);
  if (!result.equal) {
    for (const difference of result.differences) console.error(`[DIFF] ${JSON.stringify(difference)}`);
    throw new Error(`オープニング${result.checkpoints}面の画面が一致しません (${result.differences.length}領域)`);
  }
  console.log(`[PASS] original/converted SAKA: opening ${result.checkpoints}/3 checkpoints exact match`);
  console.log('[INPUT] opening-1=(none), opening-2=SPACE, opening-3=SPACE');
} catch (error) {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
