#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'verify-saka-start.mjs');
const child = spawn(process.execPath, [script], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PC98DEV_SAKA_VARIANT: 'converted',
    PC98DEV_SAKA_SOURCE_DEBUG: '1',
  },
});
child.once('error', (error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`[FAIL] SAKAソース行デバッグが失敗しました (code=${code}, signal=${signal ?? 'none'})`);
    process.exitCode = 1;
  }
});
