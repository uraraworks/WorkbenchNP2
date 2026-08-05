import assert from 'node:assert/strict';
import { linear20, loadedSegmentFromPsp } from './segment-arithmetic.mjs';

const word = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);

export function parseMz(bytes) {
  assert.ok(bytes.length >= 0x1c, 'MZヘッダが短すぎます');
  assert.ok(word(bytes, 0) === 0x5a4d || word(bytes, 0) === 0x4d5a, 'MZ署名がありません');
  const header = {
    relocations: word(bytes, 0x06),
    headerParagraphs: word(bytes, 0x08),
    ss: word(bytes, 0x0e), sp: word(bytes, 0x10),
    ip: word(bytes, 0x14), cs: word(bytes, 0x16),
    relocationTable: word(bytes, 0x18),
  };
  const tableEnd = header.relocationTable + header.relocations * 4;
  assert.ok(tableEnd <= bytes.length, '再配置テーブルがEXE範囲外です');
  const relocationOffsets = [];
  for (let index = 0; index < header.relocations; index++) {
    const at = header.relocationTable + index * 4;
    relocationOffsets.push(word(bytes, at + 2) * 16 + word(bytes, at));
  }
  return { ...header, headerBytes: header.headerParagraphs * 16, relocationOffsets };
}

export function validateSakaEntry({
  exeBytes, guestEntryBytes, control, regs, pspPrefix,
  beforeScreen, stoppedScreen, beforeGvram, stoppedGvram,
}) {
  const exe = Uint8Array.from(exeBytes);
  const guest = Uint8Array.from(guestEntryBytes);
  const mz = parseMz(exe);
  assert.equal(control.kind, 1, 'ローダ通知の対象種別がMZ EXEではありません');
  assert.equal(control.ip, mz.ip, '4B01h返却IPがMZ e_ipと一致しません');
  assert.equal(control.sp, (mz.sp - 2) & 0xffff, '4B01h返却SPがMZ e_sp-2と一致しません');
  assert.equal(control.cs, loadedSegmentFromPsp(control.targetPsp, mz.cs),
    '4B01h返却CSとPSP/e_csの関係が不正です');
  assert.equal(control.ss, loadedSegmentFromPsp(control.targetPsp, mz.ss),
    '4B01h返却SSとPSP/e_ssの関係が不正です');
  assert.deepEqual(Array.from(pspPrefix), [0xcd, 0x20], '対象PSP先頭にINT 20hがありません');
  assert.equal(regs.cs, control.cs, '停止CSが4B01h返却CSと一致しません');
  assert.equal(regs.eip, control.ip, '停止IPが4B01h返却IPと一致しません');
  assert.equal(regs.ss, control.ss, '停止SSが4B01h返却SSと一致しません');
  assert.equal(regs.esp & 0xffff, control.sp, '停止SPが4B01h返却SPと一致しません');
  assert.equal(regs.ds, control.targetPsp, '停止DSが対象PSPと一致しません');
  assert.equal(regs.es, control.targetPsp, '停止ESが対象PSPと一致しません');
  assert.equal(stoppedScreen, beforeScreen, 'エントリ停止までに対象が画面を変更しました');
  assert.ok(beforeGvram?.sha256, '制御移譲前のGVRAMハッシュがありません');
  assert.ok(stoppedGvram?.sha256, 'エントリ停止時のGVRAMハッシュがありません');
  assert.equal(stoppedGvram.sha256, beforeGvram.sha256, 'エントリ停止までにGVRAMが変化しました');

  const moduleEntry = linear20(mz.cs, mz.ip);
  const fileEntry = mz.headerBytes + moduleEntry;
  assert.ok(fileEntry + guest.length <= exe.length, '照合範囲がEXEファイルを超えています');
  const excluded = new Set();
  let excludedRelocations = 0;
  for (const relocation of mz.relocationOffsets) {
    let overlaps = false;
    for (const byteOffset of [relocation, relocation + 1]) {
      const relative = byteOffset - moduleEntry;
      if (relative >= 0 && relative < guest.length) {
        excluded.add(relative);
        overlaps = true;
      }
    }
    if (overlaps) excludedRelocations++;
  }
  let compared = 0;
  for (let index = 0; index < guest.length; index++) {
    if (excluded.has(index)) continue;
    assert.equal(guest[index], exe[fileEntry + index],
      `エントリ+${index.toString(16)}のゲストRAMがEXE実体と不一致です`);
    compared++;
  }
  assert.ok(compared > 0, '再配置除外後に比較できるエントリバイトがありません');
  return { mz, comparedBytes: compared, excludedBytes: excluded.size, excludedRelocations, fileEntry };
}

const FLOW_MNEMONIC = /^(?:call|j[a-z]*|loop[a-z]*|ret[a-z]*|int|iret|into)\b/i;
export const isFlowInstruction = (text) => FLOW_MNEMONIC.test(text.trim());

export function validateInstructionSteps(steps) {
  assert.ok(steps.length > 0, 'ステップ結果がありません');
  let branchSkips = 0;
  for (const [index, step] of steps.entries()) {
    assert.equal(step.executed, 1, `step ${index + 1}: 1命令実行ではありません`);
    assert.equal(step.instruction.addr, step.before.eip, `step ${index + 1}: 逆アセンブル位置が実行前IPと不一致です`);
    assert.ok(step.instruction.len > 0, `step ${index + 1}: 命令長が不正です`);
    if (isFlowInstruction(step.instruction.text)) {
      branchSkips++;
      continue;
    }
    assert.equal(step.after.cs, step.before.cs, `step ${index + 1}: 非分岐命令でCSが変化しました`);
    assert.equal(step.after.eip, (step.before.eip + step.instruction.len) >>> 0,
      `step ${index + 1}: 次IPが命令長どおりではありません`);
  }
  return { instructions: steps.length, branchSkips };
}
