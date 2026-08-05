import { createDebugger, createWebNP2 } from './vendor/webnp2/webnp2-embed.js';
import { bootFreeDos, waitForCurrentDosPrompt } from './freedos-session.mjs';
import { cLineToRanges, cOffsetToLocation } from '../toolchain/c-source-map.mjs';
import { releaseLoaderAtEntry, waitForLoaderControl } from './loader-control.mjs';

const engine = createWebNP2(document.querySelector('#screen'));
const debug = createDebugger(engine);
let freeDos;
const api = {
  engine,
  getScreenText: () => engine.getScreenText(),
  getMountedImages: () => engine.getMountedImages(),
  isCpuPaused: () => engine.dbgIsPaused(),
  bootWithProgramFd: async (name, bytes) => {
    await api.ready;
    return bootFreeDos(engine, {
      freeDos, freeDosKey: 'c-runner:freedos',
      programFd: new Uint8Array(bytes), programName: name, programKey: `c-runner:${name}`,
    });
  },
  pasteDosCommand: (command) => engine.pasteText(`${command}\r`),
  waitForPrompt: (baseline) => waitForCurrentDosPrompt(engine, { baseline, timeout: 60_000 }),
  debugExeToCLine: async (command, expectedMap, line) => {
    await engine.pasteText(`${command}\r`);
    const control = await waitForLoaderControl(debug);
    if (!control) throw new Error('C対象のローダ制御ブロックを検出できません');
    if (control.kind !== 1) throw new Error(`C対象がMZ EXEではありません: kind=${control.kind}`);
    const entryRegisters = releaseLoaderAtEntry(debug, control);
    const ranges = cLineToRanges(expectedMap, line);
    if (ranges.length === 0) throw new Error(`C ${line}行の生成区間がありません`);
    if (ranges.length > 6) throw new Error(`C ${line}行の区間数${ranges.length}がBP枠を超えます`);
    ranges.forEach((range, index) => debug.setBreakpoint(index, control.cs, range.start, true));
    const hit = debug.runUntilBreakpoint(5_000_000);
    ranges.forEach((range, index) => debug.setBreakpoint(index, control.cs, range.start, false));
    if (hit < 0 || hit >= ranges.length) throw new Error(`C ${line}行へ到達できませんでした (hit=${hit})`);
    const registers = debug.readRegisters();
    return {
      control, entryRegisters, registers, hit,
      location: registers.cs === control.cs ? cOffsetToLocation(expectedMap, registers.eip) : null,
      screen: engine.getScreenText(),
    };
  },
  resumeCpu: () => debug.setPaused(false),
};

api.ready = (async () => {
  const response = await fetch('./freedos/fd98_2hd.xdf');
  if (!response.ok) throw new Error(`FreeDOS: HTTP ${response.status}`);
  freeDos = new Uint8Array(await response.arrayBuffer());
})();

window.pc98c = api;
