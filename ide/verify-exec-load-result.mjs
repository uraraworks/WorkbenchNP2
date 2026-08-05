#!/usr/bin/env node

import assert from 'node:assert/strict';
import { validateMzExecLoad } from './exec-load-result.mjs';

// DOSは子のスタックへゼロワードを積んでから返すため、返却SPはe_sp-2になる。
// fixtureのSS:SPもe_sp(FF00)ではなくFEFEで持つ。
const good = [
  'E2 TARGET=\\A-GAMES\\SAKA\\SAKA.EXE',
  'E2 MZ20 SS=1200 SP=FF00 IP=0000 CS=0002',
  'E0 4B01 OK CS:IP=3002:0000 SS:SP=4200:FEFE',
].join('\n');

const expectedTarget = '\\A-GAMES\\SAKA\\SAKA.EXE';
const expectedHeader = { ss: 0x1200, sp: 0xFF00, ip: 0x0000, cs: 0x0002 };
const ZERO_WORD = [0x00, 0x00];
assert.equal(
  validateMzExecLoad(good, [0xCD, 0x20], expectedTarget, expectedHeader, ZERO_WORD).psp,
  0x2FF0,
);
const memoryError = good.replace(
  'E0 4B01 OK CS:IP=3002:0000 SS:SP=4200:FEFE',
  'E0 4B01 ERROR AX=0008',
);
assert.equal(
  validateMzExecLoad(memoryError, [], expectedTarget, expectedHeader, []).kind,
  'memory-error',
);

// exebin.mac型: FFF0hを-16 paragraphとして加減算し、16bitでPSPへ折り返す。
const wrapped = [
  'E2 TARGET=\\A-GAMES\\SAKA\\SAKA.EXE',
  'E2 MZ20 SS=FFF0 SP=26BC IP=0100 CS=FFF0',
  'E0 4B01 OK CS:IP=111A:0100 SS:SP=111A:26BA',
].join('\n');
const wrappedHeader = { ss: 0xFFF0, sp: 0x26BC, ip: 0x0100, cs: 0xFFF0 };
assert.equal(
  validateMzExecLoad(wrapped, [0xCD, 0x20], expectedTarget, wrappedHeader, ZERO_WORD).psp,
  0x111A,
);
// 検証対象へ故意に折り返し無し版を注入すると、負のPSPを拒否してFAILする。
const unwrappedPspFromSegment = (loaded, mzSegment) => loaded - mzSegment - 0x10;
assert.throws(() => validateMzExecLoad(
  wrapped, [0xCD, 0x20], expectedTarget, wrappedHeader, ZERO_WORD,
  { pspFromSegment: unwrappedPspFromSegment },
));

// 画面表示を1箇所ずつ壊すと必ずFAILすること(検査が空回りしていないことの確認)。
const brokenScreens = [
  good.replace('IP=0000 CS=0002', 'IP=0001 CS=0002'),      // IP != e_ip
  good.replace('SS:SP=4200:FEFE', 'SS:SP=4200:FF00'),      // SPがe_spそのまま(-2でない)
  good.replace('SS:SP=4200:FEFE', 'SS:SP=4200:FEFD'),      // -2以外のずれ
  good.replace('SS:SP=4200:FEFE', 'SS:SP=4201:FEFE'),      // CS側とSS側でPSPが割れる
  good.replace('CS:IP=3002:0000', 'CS:IP=3003:0000'),      // CSから求めるPSPが1ずれる
];
for (const broken of brokenScreens) {
  assert.throws(() => validateMzExecLoad(broken, [0xCD, 0x20], expectedTarget, expectedHeader, ZERO_WORD));
}
// ホストがRAMから読む2値も、それぞれ単独でFAIL要因になること。
assert.throws(() => validateMzExecLoad(good, [0x00, 0x00], expectedTarget, expectedHeader, ZERO_WORD));
assert.throws(() => validateMzExecLoad(good, [0xCD, 0x20], expectedTarget, expectedHeader, [0x34, 0x12]));
assert.throws(() => validateMzExecLoad(good, [0xCD, 0x20], expectedTarget, expectedHeader, []));

console.log('MZ EXEC照合: 通常/FFF0折り返しfixtureはPASS、折り返しなしを含む意図的破壊9件はすべてFAIL');
