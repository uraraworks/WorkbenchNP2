import { lineToOffset, offsetToLine } from '../toolchain/listing.mjs';

export function sourceBreakpointOffset(map, sourceLine) {
  const offset = lineToOffset(map, sourceLine);
  if (offset === null) throw new Error(`ソース${sourceLine}行に生成アドレスがありません`);
  return offset;
}

export function sourceLineForRegisters(map, programCs, registers) {
  return registers.cs === programCs ? offsetToLine(map, registers.eip) : null;
}

/** IDEと実機SAKA検証で共有する「BP行・実行時CS:IP・逆引き行」の照合。 */
export function validateSourceStop(map, programCs, registers, expectedLine) {
  const expectedOffset = sourceBreakpointOffset(map, expectedLine);
  const actualLine = sourceLineForRegisters(map, programCs, registers);
  if (registers.cs !== programCs) {
    throw new Error(`停止CSが実行時CSと不一致です: ${registers.cs} != ${programCs}`);
  }
  if (registers.eip !== expectedOffset) {
    throw new Error(`停止IPが行マップoffsetと不一致です: ${registers.eip} != ${expectedOffset}`);
  }
  if (actualLine !== expectedLine) {
    throw new Error(`停止行が不一致です: ${actualLine} != ${expectedLine}`);
  }
  return { sourceLine: actualLine, offset: expectedOffset, cs: programCs, ip: registers.eip };
}

export function nextSourceEntry(map, sourceLine) {
  const currentIndex = map.findIndex((entry) => entry.srcLine === sourceLine);
  if (currentIndex < 0) return null;
  return map.slice(currentIndex + 1).find((entry) => entry.srcLine !== sourceLine) ?? null;
}
