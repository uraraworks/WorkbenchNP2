#!/usr/bin/env node

import assert from 'node:assert/strict';
import { validateInstructionSteps, validateSakaEntry } from './saka-step-result.mjs';

const exe = new Uint8Array(0x80);
exe[0] = 0x4d; exe[1] = 0x5a;
exe[6] = 1;                    // 再配置1件
exe[8] = 2;                    // ヘッダ20h bytes
exe[0x0e] = 0x20; exe[0x10] = 0x00; exe[0x11] = 0x04;
exe[0x18] = 0x1c;
exe[0x1c] = 2;                 // module entry +2 のwordを再配置
exe.set([0x90, 0x8c, 0x00, 0x90, 0x90, 0x90], 0x20);
const good = {
  exeBytes: exe,
  guestEntryBytes: [0x90, 0x8c, 0x34, 0x12, 0x90, 0x90],
  control: { kind: 1, targetPsp: 0x1000, cs: 0x1010, ip: 0, ss: 0x1030, sp: 0x03fe },
  regs: { cs: 0x1010, eip: 0, ss: 0x1030, esp: 0x03fe, ds: 0x1000, es: 0x1000 },
  pspPrefix: [0xcd, 0x20], beforeScreen: 'DOS>', stoppedScreen: 'DOS>',
  beforeGvram: { sha256: 'same' }, stoppedGvram: { sha256: 'same' },
};
const checked = validateSakaEntry(good);
assert.equal(checked.excludedBytes, 2);
assert.equal(checked.excludedRelocations, 1);
assert.equal(checked.comparedBytes, 4);

// 最重要ガード: 停止IPを1バイトずらすと必ずFAILする。
assert.throws(() => validateSakaEntry({ ...good, regs: { ...good.regs, eip: 1 } }));
assert.throws(() => validateSakaEntry({ ...good, guestEntryBytes: [0x91, ...good.guestEntryBytes.slice(1)] }));
assert.throws(() => validateSakaEntry({ ...good, stoppedScreen: 'changed' }));
assert.throws(() => validateSakaEntry({ ...good, stoppedGvram: { sha256: 'changed' } }));

const steps = [{
  before: { cs: 0x1010, eip: 0 }, instruction: { addr: 0, len: 2, text: 'mov ax,ss' },
  after: { cs: 0x1010, eip: 2 }, executed: 1,
}];
assert.deepEqual(validateInstructionSteps(steps), { instructions: 1, branchSkips: 0 });
assert.throws(() => validateInstructionSteps([{ ...steps[0], after: { cs: 0x1010, eip: 3 } }]));
console.log('SAKAステップ照合: 正常fixtureはPASS、エントリ+1/GVRAM変更を含む意図的破壊5件はすべてFAIL');
