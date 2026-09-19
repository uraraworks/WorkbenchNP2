import { CONTROL, parseLoaderControl, releaseLoaderAtEntry, waitForLoaderControl } from './loader-control.mjs';

/**
 * ハードウェアBP枠の割り当て。7番は4B01h返却CS:IPで対象1命令目の手前に止めるためローダ解放が使い、
 * 6番は「次の行まで実行」の一時BP専用にする。利用者BPは0〜5の6本まで。
 * ローダ終了BPは、対象エントリ到達時に解除済みの7番を時分割で再利用する。
 * 同時に有効にならないため、利用者BP 6本を減らさない。
 *
 * 7番はさらに、素のエントリ停止の直後にも一時的に再利用する: Cのexeはエントリが
 * main ではなく SmallerC のスタートアップ(行情報なし)なので、行マップ上の最初の
 * 生成行(debuggableLines()[0])まで走らせてから止め直す(advanceToFirstDebuggableLine)。
 * この2回目の利用も、直前の利用(エントリBP)が解除済みのあとに限って行い、
 * 完了後は必ず解除するため、loaderExitとの時分割にも利用者BP 6本にも影響しない。
 */
export const BREAKPOINT_SLOTS = { user: [0, 1, 2, 3, 4, 5], stepOver: 6, entry: 7, loaderExit: 7 };
const KIND = { COM: 0, EXE: 1 };

/**
 * Cソース行マップ(toolchain/c-source-map.mjs)のoffsetは、smallモデル(-doss)ではローダが
 * 4B01hで返すcontrol.cs相対のoffsetとそのまま一致するが、hugeモデル(-dosh)では一致しない。
 * huge-probe-report.md 第3回で実測した通り、hugeモデルのc0dh.asm `__start` は自己再配置
 * (.relot/.relod)の後、`___start__`→`_main` へ正規化した far pointer で retf するため、
 * ユーザコード(_main以降)は control.cs とは異なる実セグメントで動く。
 * このセグメントはMZヘッダの e_cs から機械的に導ける: 実測より、
 *   物理アドレス = (control.cs - header.cs)*16 + (mapOffset - header.headerBytes)
 * が両モデルで成り立つ(smallは header.cs*16+headerBytes が16bitで0に落ちるため、
 * 結果的に「control.cs, mapOffsetそのまま」という既存の扱いと一致する)。
 * ただし「NP2kaiのBPはCS:IPレジスタの完全一致で照合する」ことを実測で確認したため
 * (huge-probe-report.md 第3回、物理アドレスが同じでもセグメント値が違うと発火しない)、
 * 単に補正offsetを計算するだけでは足りず、実際にCPUのCSレジスタへ現れるセグメント値
 * そのものを使う必要がある。
 *
 * どちらのセグメントが実際に使われるかはモデルによる分岐ではなく、両方の候補へ同時に
 * 「最初の生成行」用BPを張って実行し、実際に発火した側を採用することで決める
 * (advanceToFirstDebuggableLine)。決まった (codeSegment, offsetBias) の組は
 * セッション中ずっと使い回す(以降の行がさらに別セグメントへ移ることは無い前提。
 * huge-probe.cで500,000命令ぶん実測し、_main到達後はCSが変化しないことを確認済み)。
 */
function candidateCodeSegments(controlCs, header) {
  const candidates = [{ segment: controlCs, bias: 0 }];
  if (header) {
    const altSegment = (controlCs - header.cs) & 0xffff;
    if (altSegment !== controlCs) candidates.push({ segment: altSegment, bias: header.headerBytes });
  }
  return candidates;
}

/**
 * 4B01hローダ経由で対象を起動し、エントリ停止・行BP・行送りまでを1つの状態として持つ。
 * 4B01hローダの制御ブロック契約を保ち、対象と行マップを差し替えられる。
 */
export function createDebugSession(debug) {
  let control;
  let map;
  let assignments = [];
  // ユーザコードの生成行に対応する実セグメントと、map offsetからそこへ引く補正値。
  // start()のadvanceToFirstDebuggableLineで実測により確定する(既定はcontrol.cs/0)。
  let codeSegment;
  let offsetBias = 0;

  const requireStarted = () => {
    if (!control) throw new Error('デバッグセッションが開始されていません');
    return control;
  };

  const clearAssignments = () => {
    for (const item of assignments) debug.setBreakpoint(item.slot, codeSegment, item.offset, false);
    assignments = [];
  };

  const registers = () => debug.readRegisters();
  /** map offset(headerBytes等込みの生値)から、codeSegment基準の実offsetへ変換する。 */
  const toSegmentOffset = (mapOffset) => (mapOffset - offsetBias) & 0xffff;
  /** 実行時offset(regs.eip)から、行マップが期待するmap offsetへ逆変換する。 */
  const toMapOffset = (runtimeOffset) => (runtimeOffset + offsetBias) & 0xffff;
  const currentLine = () => {
    if (!control || !map || !debug.isPaused()) return null;
    const regs = registers();
    return regs.cs === codeSegment ? map.lineAt(toMapOffset(regs.eip)) : null;
  };

  /**
   * 素のエントリ(4B01h返却CS:IP)から、行マップ上の最初の生成行(debuggableLines()[0])
   * まで走らせてから止め直す。ASMのCOM(ORG 100h)はエントリ自体が最初の生成行なので
   * 何もしない。生成行が1つも無いビルドでは素のエントリのまま返し、
   * noDebuggableLines:true で呼び出し側(workbench.js)に状況表示を委ねる。
   * 使うBP枠は、直前にreleaseLoaderAtEntryが使い終えて解除済みのentry(7番)を
   * 再利用する(loaderExitとの時分割は「同時に有効にしない」契約なので衝突しない)。
   *
   * headerが渡された場合、control.cs候補とMZヘッダ由来の代替セグメント候補の両方へ
   * 同時にBPを張り、実際に発火した側をcodeSegment/offsetBiasとして確定する
   * (candidateCodeSegmentsのコメント参照)。
   */
  const advanceToFirstDebuggableLine = (entryRegisters, header) => {
    const lines = map?.debuggableLines() ?? [];
    if (lines.length === 0) {
      codeSegment = control.cs; offsetBias = 0;
      return { registers: entryRegisters, noDebuggableLines: true };
    }
    const firstLine = lines[0];
    if (entryRegisters.cs === control.cs && map.lineAt(entryRegisters.eip) === firstLine) {
      codeSegment = control.cs; offsetBias = 0;
      return { registers: entryRegisters, noDebuggableLines: false };
    }
    const rawOffsets = map.breakpointOffsets(firstLine);
    // 行マップが返した行に生成offsetが無いのは契約違反だが、素のエントリのまま
    // 返して迷子にしない(黙って別の行へ寄せない既存方針を踏襲)。
    if (rawOffsets.length === 0) {
      codeSegment = control.cs; offsetBias = 0;
      return { registers: entryRegisters, noDebuggableLines: false };
    }
    // 候補ごとに別枠を使う: 同じ枠へ複数のセグメント:offsetを重ねて張ると、後から
    // 張った方で上書きされ先の候補が消える(実測: hello-c.cのsmallモデルで再現)。
    // ここで使う枠(entry=7, stepOver=6)は、この時点でどちらも未使用(entryは
    // releaseLoaderAtEntryで解除済み、stepOverはまだ一度も使われていない)。
    const probeSlots = [BREAKPOINT_SLOTS.entry, BREAKPOINT_SLOTS.stepOver];
    const candidates = candidateCodeSegments(control.cs, header).map((candidate, index) => ({
      ...candidate,
      slot: probeSlots[index],
      offsets: rawOffsets.map((raw) => (raw - candidate.bias) & 0xffff),
    }));
    for (const candidate of candidates) {
      for (const offset of candidate.offsets) debug.setBreakpoint(candidate.slot, candidate.segment, offset, true);
    }
    let hit;
    let settledRegisters;
    try {
      hit = debug.runUntilBreakpoint(5_000_000);
      settledRegisters = debug.readRegisters();
    } finally {
      for (const candidate of candidates) {
        for (const offset of candidate.offsets) debug.setBreakpoint(candidate.slot, candidate.segment, offset, false);
      }
    }
    const matched = candidates.find((candidate) => candidate.slot === hit);
    if (!matched) throw new Error(`最初の生成行(${firstLine}行目)へ到達できませんでした (hit=${hit})`);
    codeSegment = matched.segment;
    offsetBias = matched.bias;
    return { registers: settledRegisters, noDebuggableLines: false };
  };

  return {
    get control() { return control; },
    get map() { return map; },
    get codeSegment() { return codeSegment; },
    isStarted: () => Boolean(control),
    isPaused: () => debug.isPaused(),
    registers,
    currentLine,
    breakpointLines: () => assignments.map((item) => item.line),

    /**
     * ローダへコマンドを渡し、READY制御ブロックを検出してから対象の1命令目手前で止め、
     * さらに行マップ上の最初の生成行まで進めてから止め直す(advanceToFirstDebuggableLine)。
     * headerはコンパイル結果のMZヘッダ(compile-core.mjsのparseMzHeader出力)。
     * 与えられない場合は従来通りcontrol.csのみを使う(ASM/COM等)。
     */
    async start(engine, command, debugMap, expectedKind, header) {
      control = undefined;
      assignments = [];
      map = debugMap;
      codeSegment = undefined;
      offsetBias = 0;
      // 先頭のESCで入力行を捨てる。取りこぼしたキー（ドライブエラーの応答など）が
      // コマンド行に残っていると、そのまま連結されて別のコマンドとして実行されてしまう。
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
      const { registers: settledRegisters, noDebuggableLines } = advanceToFirstDebuggableLine(entryRegisters, header);
      return { control: found, registers: settledRegisters, driveErrorRetries, noDebuggableLines };
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
        const rawOffsets = map.breakpointOffsets(line);
        if (rawOffsets.length === 0) throw new Error(`${line}行に生成アドレスがありません`);
        for (const raw of rawOffsets) wanted.push({ line, offset: toSegmentOffset(raw) });
      }
      if (wanted.length > BREAKPOINT_SLOTS.user.length) {
        throw new Error(`BP区間が${wanted.length}件でハードウェア枠${BREAKPOINT_SLOTS.user.length}本を超えます`);
      }
      assignments = wanted.map((item, index) => ({ ...item, slot: BREAKPOINT_SLOTS.user[index] }));
      for (const item of assignments) debug.setBreakpoint(item.slot, codeSegment, item.offset, true);
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
      if (regs.cs !== codeSegment) throw new Error('対象CS外で停止しているため行送りできません');
      const next = map.nextEntryFrom(toMapOffset(regs.eip));
      if (!next) throw new Error('次の生成行がありません');
      const slot = BREAKPOINT_SLOTS.stepOver;
      const offsets = next.offsets.map(toSegmentOffset);
      for (const offset of offsets) debug.setBreakpoint(slot, codeSegment, offset, true);
      const hit = debug.runUntilBreakpoint(maxSteps);
      for (const offset of offsets) debug.setBreakpoint(slot, codeSegment, offset, false);
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
      if (regs.cs !== codeSegment) throw new Error('対象CS外で停止しているためステップインできません');
      const [instruction] = debug.disassemble(regs.cs, regs.eip, 1);
      if (!/^call\b/i.test(instruction?.text ?? '')) return { ...this.stepOverLine(maxSteps), entered: false };
      const returnOffset = (regs.eip + instruction.len) & 0xffff;
      debug.step(1);
      const inside = registers();
      const line = inside.cs === codeSegment ? map.lineAt(toMapOffset(inside.eip)) : null;
      if (line !== null) return { line, expectedLine: line, entered: true, registers: inside };
      const slot = BREAKPOINT_SLOTS.stepOver;
      debug.setBreakpoint(slot, codeSegment, returnOffset, true);
      const hit = debug.runUntilBreakpoint(maxSteps);
      debug.setBreakpoint(slot, codeSegment, returnOffset, false);
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
      // 利用者BPはcodeSegment基準で張ってあるので、外す/戻すも同じセグメントで行う。
      for (const item of assignments) debug.setBreakpoint(item.slot, codeSegment, item.offset, false);
      debug.setBreakpoint(slot, active.loaderPsp, active.exitReadyIp, true);
      let hit;
      try {
        hit = debug.runUntilBreakpoint(maxSteps);
      } finally {
        debug.setBreakpoint(slot, active.loaderPsp, active.exitReadyIp, false);
        for (const item of assignments) debug.setBreakpoint(item.slot, codeSegment, item.offset, true);
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
      codeSegment = undefined;
      offsetBias = 0;
    },
  };
}
