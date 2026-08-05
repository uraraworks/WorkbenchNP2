#!/usr/bin/env node

import assert from 'node:assert/strict';
import { validateSakaEquivalence } from './saka-equivalence-result.mjs';

const b64 = (values) => Buffer.from(values).toString('base64');
const checkpoint = (name, canvas = [0, 0, 0, 255]) => ({
  name, keyBefore: name === 'opening-1' ? null : 'SPACE',
  state: {
    tvram: { sha256: 't', base64: b64([1, 2]) },
    gvram: { sha256: 'g', regions: [{ address: 0xa8000, sha256: 'r', base64: b64([3, 4]) }] },
    canvas: {
      sha256: canvas[0] ? 'changed' : 'c', width: 1, height: 1,
      origin: 'bottom-left', base64: b64(canvas),
    },
  },
});
const original = { variant: 'original', checkpoints: [
  checkpoint('opening-1'), checkpoint('opening-2'), checkpoint('opening-3'),
] };
const converted = structuredClone({ ...original, variant: 'converted' });
assert.deepEqual(validateSakaEquivalence(original, converted), { equal: true, checkpoints: 3, differences: [] });
const broken = structuredClone(converted);
broken.checkpoints[1] = checkpoint('opening-2', [1, 0, 0, 255]);
assert.throws(() => validateSakaEquivalence(original, broken), /differentPixels.*1/);
assert.throws(() => validateSakaEquivalence(original, {
  ...converted, checkpoints: [{ ...checkpoint('opening-X'), keyBefore: null }, ...converted.checkpoints.slice(1)],
}), /名前が一致しません/);
console.log('[PASS] 同一3面を受理する比較器で、1 pixel差とチェックポイント違いを拒否しました');
