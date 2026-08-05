#!/usr/bin/env node

import assert from 'node:assert/strict';
import { validateSakaVisualStart } from './saka-start-result.mjs';

const state = (gvram, nonzero, canvas = 'canvas-a', screen = '') => ({
  screen, gvram: { sha256: gvram, nonzero }, canvas: { sha256: canvas },
});
const entry = state('gvram-a', 10);

assert.deepEqual(validateSakaVisualStart(entry, state('gvram-b', 20, 'canvas-b')), {
  before: 'gvram-a', after: 'gvram-b', nonzero: 20, canvasChanged: true,
});
assert.throws(() => validateSakaVisualStart(entry, state('gvram-a', 10, 'canvas-b')),
  /GVRAMが変化していません/);
assert.throws(() => validateSakaVisualStart(entry, state('gvram-b', 0, 'canvas-b')),
  /描画済み画素がありません/);
assert.throws(() => validateSakaVisualStart(entry, state('gvram-b', 20, 'canvas-b', 'Bad command or file name')),
  /DOSエラー画面/);

console.log('[PASS] 正常証跡を受理し、GVRAM不変・空描画・DOSエラーの故障注入を拒否しました');
