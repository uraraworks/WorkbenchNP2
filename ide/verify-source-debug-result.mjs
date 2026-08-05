#!/usr/bin/env node

import assert from 'node:assert/strict';
import { sourceLineForRegisters, validateSourceStop } from './source-debug.mjs';

const map = [
  { srcLine: 164, offset: 0x0a70, bytes: [0xbb, 0x00, 0x00] },
  { srcLine: 165, offset: 0x0a73, bytes: [0xe8, 0x10, 0x00] },
  { srcLine: 196, offset: 0x0ab0, bytes: [0x8b, 0x0e, 0x00, 0x00] },
];
const registers = { cs: 0x111a, eip: 0x0a73 };
assert.deepEqual(validateSourceStop(map, 0x111a, registers, 165), {
  sourceLine: 165, offset: 0x0a73, cs: 0x111a, ip: 0x0a73,
});
assert.equal(sourceLineForRegisters(map, 0x111a, registers), 165);
assert.throws(() => validateSourceStop(map, 0x111a, registers, 164), /停止IP/);
assert.throws(() => validateSourceStop(map, 0x111b, registers, 165), /停止CS/);
console.log('[PASS] 正しいBP行を特定し、別行期待値と別CSを拒否しました');
