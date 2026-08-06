import { CONTROL, parseLoaderControl, releaseLoaderAtEntry, waitForLoaderControl } from './loader-control.mjs';

/**
 * ハードウェアBP枠の割り当て。7番は4B01h返却CS:IPで対象1命令目の手前に止めるためローダ解放が使い、
 * 6番は「次の行まで実行」の一時BP専用にする。利用者BPは0〜5の6本まで。
 * ローダ終了BPは、対象エントリ到達時に解除済みの7番を時分割で再利用する。
 * 同時に有効にならないため、利用者BP 6本を減らさない。
 */
export const BREAKPOINT_SLOTS = { user: [0, 1, 2, 3, 4, 5], stepOver: 6, entry: 7, loaderExit: 7 };
const KIND = { COM: 0, EXE: 1 };

/**
 * 4B01hローダ経由で対象を起動し、エントリ停止・行BP・行送りまでを1つの状態として持つ。
 * 4B01hローダの制御ブロック契約を保ち、対象と行マップを差し替えられる。
 */
export function createDebugSession(debug) {
  let control;
  let map;
  let assignments = [];

  const requireStarted = () => {
    if (!control) throw new Error('デバッグセッションが開始されていません');
    return control;
  };

  const clearAssignments = () => {
    for (const item of assignments) debug.setBreakpoint(item.slot, control.cs, item.offset, false);
    assignments = [];
  };

  const registers = () => debug.readRegisters();
  const currentLine = () => {
    if (!control || !map || !debug.isPaused()) return null;
    const regs = registers();
    return regs.cs === control.cs ? map.lineAt(regs.eip) : null;
  };

  return {
    get control() { return control; },
    get map() { return map; },
    isStarted: () => Boolean(control),
    isPaused: () => debug.isPaused(),
    registers,
    currentLine,
    breakpointLines: () => assignments.map((item) => item.line),

    /** ローダへコマンドを渡し、READY制御ブロックを検出してから対象の1命令目手前で止める。 */
    async start(engine, command, debugMap, expectedKind) {
      control = undefined;
      assignments = [];
      map = debugMap;
      await engine.pasteText(`${command}\r`);
      const foundResult = await waitForLoaderControl(debug, { engine });
      if (!foundResult) throw new Error('デバッガローダのREADY制御ブロックを検出できません');
      const { driveErrorRetries = 0, ...found } = foundResult;
      const wanted = KIND[expectedKind];
      if (found.kind !== wanted) {
        throw new Error(`対象の種別が${expectedKind}ではありません: kind=${found.kind}`);
      }
      control = found;
      const entryRegisters = releaseLoaderAtEntry(debug, found, BREAKPOINT_SLOTS.entry);
      return { control: found, registers: entryRegisters, driveErrorRetries };
    },

    /**
     * 行の集合をBP枠へ割り当て直す。1行が複数の非連続区間を持つCでも全区間へ張り、
     * 枠を超える場合は黙って落とさずエラーにする。
     */
    setBreakpointLines(lines) {
      requireStarted();
      clearAssignments();
      const wanted = [];
      for (const line of [...new Set(lines)].sort((a, b) => a - b)) {
        const offsets = map.breakpointOffsets(line);
        if (offsets.length === 0) throw new Error(`${line}行に生成アドレスがありません`);
        for (const offset of offsets) wanted.push({ line, offset });
      }
      if (wanted.length > BREAKPOINT_SLOTS.user.length) {
        throw new Error(`BP区間が${wanted.length}件でハードウェア枠${BREAKPOINT_SLOTS.user.length}本を超えます`);
      }
      assignments = wanted.map((item, index) => ({ ...item, slot: BREAKPOINT_SLOTS.user[index] }));
      for (const item of assignments) debug.setBreakpoint(item.slot, control.cs, item.offset, true);
      return assignments.map((item) => ({ line: item.line, offset: item.offset, slot: item.slot }));
    },

    /** 有効なBPのどれかへ到達するまで実行する。到達行は行マップから引き直す。 */
    continueToBreakpoint(maxSteps = 5_000_000) {
      requireStarted();
      if (assignments.length === 0) throw new Error('有効なBPがありません');
      const slots = new Set(assignments.map((item) => item.slot));
      const hit = debug.runUntilBreakpoint(maxSteps);
      if (!slots.has(hit)) throw new Error(`BPへ到達できませんでした (hit=${hit})`);
      const stopped = assignments.find((item) => item.slot === hit);
      return { hit, line: currentLine(), expectedLine: stopped.line, registers: registers() };
    },

    /** 現在の実行offsetより後の、初めて別の行になる区間まで進む。 */
    stepOverLine(maxSteps = 1_000_000) {
      requireStarted();
      const regs = registers();
      if (regs.cs !== control.cs) throw new Error('対象CS外で停止しているため行送りできません');
      const next = map.nextEntryFrom(regs.eip);
      if (!next) throw new Error('次の生成行がありません');
      const slot = BREAKPOINT_SLOTS.stepOver;
      for (const offset of next.offsets) debug.setBreakpoint(slot, control.cs, offset, true);
      const hit = debug.runUntilBreakpoint(maxSteps);
      for (const offset of next.offsets) debug.setBreakpoint(slot, control.cs, offset, false);
      if (hit !== slot) throw new Error(`次の行へ到達できませんでした (hit=${hit})`);
      return { line: currentLine(), expectedLine: next.line, registers: registers() };
    },

    /**
     * call なら呼び先へ入り、それ以外は行送りと同じにする。
     * 呼び先に行情報が無い（ライブラリやDOS）ときは、そこで迷子にせず
     * 戻り先アドレスへBPを置いて呼び出し元まで抜けてから次の行へ進める。
     */
    stepInto(maxSteps = 1_000_000) {
      requireStarted();
      const regs = registers();
      if (regs.cs !== control.cs) throw new Error('対象CS外で停止しているためステップインできません');
      const [instruction] = debug.disassemble(regs.cs, regs.eip, 1);
      if (!/^call\b/i.test(instruction?.text ?? '')) return { ...this.stepOverLine(maxSteps), entered: false };
      const returnOffset = (regs.eip + instruction.len) & 0xffff;
      debug.step(1);
      const inside = registers();
      const line = inside.cs === control.cs ? map.lineAt(inside.eip) : null;
      if (line !== null) return { line, expectedLine: line, entered: true, registers: inside };
      const slot = BREAKPOINT_SLOTS.stepOver;
      debug.setBreakpoint(slot, control.cs, returnOffset, true);
      const hit = debug.runUntilBreakpoint(maxSteps);
      debug.setBreakpoint(slot, control.cs, returnOffset, false);
      if (hit !== slot) throw new Error(`呼び出し元へ戻れませんでした (hit=${hit})`);
      return { ...this.stepOverLine(maxSteps), entered: false, steppedOverCall: true };
    },

    stepInstruction(count = 1) {
      requireStarted();
      return { steps: debug.step(count), line: currentLine(), registers: registers() };
    },

    setPaused(paused) {
      debug.setPaused(paused);
      return debug.isPaused();
    },

    /** 解除済みのエントリBP枠を再利用し、ローダ自身のAH=4Ch直前で止める。 */
    runToLoaderExit(maxSteps = 5_000_000) {
      const active = requireStarted();
      const slot = BREAKPOINT_SLOTS.loaderExit;
      // このAPIはローダ終了だけを観測するため、利用者BPは一時的に外して後で戻す。
      for (const item of assignments) debug.setBreakpoint(item.slot, active.cs, item.offset, false);
      debug.setBreakpoint(slot, active.loaderPsp, active.exitReadyIp, true);
      let hit;
      try {
        hit = debug.runUntilBreakpoint(maxSteps);
      } finally {
        debug.setBreakpoint(slot, active.loaderPsp, active.exitReadyIp, false);
        for (const item of assignments) debug.setBreakpoint(item.slot, active.cs, item.offset, true);
      }
      if (hit !== slot) throw new Error(`ローダ終了直前へ到達できませんでした (hit=${hit})`);
      const fresh = parseLoaderControl(debug.readMemory(active.address, CONTROL.size), 0);
      return {
        registers: registers(),
        loaderControl: { ...fresh, address: active.address },
      };
    },

    /** BPを全て外して通常実行へ戻す。セッションは終了扱いにする。 */
    detach() {
      if (control) clearAssignments();
      debug.setPaused(false);
      control = undefined;
      map = undefined;
    },
  };
}
