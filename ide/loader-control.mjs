const CONTROL_SIGNATURE = new TextEncoder().encode('PC98DEV1');
export const CONTROL = {
  version: 8, state: 10, loaderPsp: 12, targetPsp: 14, kind: 16,
  sp: 18, ss: 20, ip: 22, cs: 24, currentPsp: 26, errorAx: 28, release: 30, size: 32,
};
const CONTROL_VERSION = 2;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const readWord = (memory, offset) => memory[offset] | (memory[offset + 1] << 8);

export function signatureMatches(memory, offset) {
  return CONTROL_SIGNATURE.every((byte, index) => memory[offset + index] === byte);
}

export function parseLoaderControl(memory, address) {
  return {
    address,
    version: readWord(memory, address + CONTROL.version),
    state: readWord(memory, address + CONTROL.state),
    loaderPsp: readWord(memory, address + CONTROL.loaderPsp),
    targetPsp: readWord(memory, address + CONTROL.targetPsp),
    kind: memory[address + CONTROL.kind],
    sp: readWord(memory, address + CONTROL.sp),
    ss: readWord(memory, address + CONTROL.ss),
    ip: readWord(memory, address + CONTROL.ip),
    cs: readWord(memory, address + CONTROL.cs),
    currentPsp: readWord(memory, address + CONTROL.currentPsp),
    errorAx: readWord(memory, address + CONTROL.errorAx),
  };
}

export async function waitForLoaderControl(debug, timeout = 20_000) {
  const limit = Date.now() + timeout;
  while (Date.now() < limit) {
    const memory = debug.readMemory(0, 0xa0000);
    for (let address = 0; address + CONTROL.size <= memory.length; address++) {
      if (!signatureMatches(memory, address)) continue;
      const control = parseLoaderControl(memory, address);
      if (control.version !== CONTROL_VERSION || (control.state !== 1 && control.state !== 0xffff)) continue;
      if (control.state === 0xffff) {
        throw new Error(`デバッガローダが失敗しました (AX=${control.errorAx.toString(16).toUpperCase().padStart(4, '0')})`);
      }
      return control;
    }
    await sleep(100);
  }
  return null;
}

/** READYを見つけた直後にCPUを止め、releaseが未書込みのままか再確認する。 */
export function freezeLoaderControl(debug, control) {
  debug.setPaused(true);
  const frozenBytes = debug.readMemory(control.address, CONTROL.size);
  const frozen = parseLoaderControl(frozenBytes, 0);
  if (!signatureMatches(frozenBytes, 0) || frozen.version !== CONTROL_VERSION || frozen.state !== 1) {
    throw new Error('pause時にローダ制御状態がREADYではありません');
  }
  const release = frozenBytes[CONTROL.release];
  if (release !== 0) throw new Error(`制御移譲前なのにrelease byteが${release.toString(16)}です`);
  return { frozen: { ...frozen, address: control.address }, release, registers: debug.readRegisters() };
}

/** releaseを書き、4B01h返却CS:IPに置いたBPで対象の1命令目より前に止める。 */
export function releaseLoaderAtEntry(debug, control, breakpointIndex = 7) {
  debug.setPaused(true);
  const frozenBytes = debug.readMemory(control.address, CONTROL.size);
  const frozen = parseLoaderControl(frozenBytes, 0);
  if (!signatureMatches(frozenBytes, 0) || frozen.version !== CONTROL_VERSION || frozen.state !== 1) {
    throw new Error('pause前にローダ制御状態が変化しました');
  }
  debug.setBreakpoint(breakpointIndex, control.cs, control.ip, true);
  debug.writeMemory(control.address + CONTROL.release, new Uint8Array([0xa5]));
  const hit = debug.runUntilBreakpoint(100_000);
  debug.setBreakpoint(breakpointIndex, control.cs, control.ip, false);
  if (hit !== breakpointIndex) throw new Error(`対象エントリへ到達できませんでした (hit=${hit})`);
  const regs = debug.readRegisters();
  if (regs.cs !== control.cs || regs.eip !== control.ip || regs.ss !== control.ss ||
      (regs.esp & 0xffff) !== control.sp || regs.ds !== control.targetPsp || regs.es !== control.targetPsp) {
    throw new Error('対象エントリの初期レジスタがローダ通知値と一致しません');
  }
  return regs;
}
