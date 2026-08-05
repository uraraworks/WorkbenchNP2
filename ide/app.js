import {
  createDebugger,
  createWebNP2,
  mountDisassemblyView,
} from './vendor/webnp2/webnp2-embed.js';
import { lineToOffset } from '../toolchain/listing.mjs';
import { assembleDebugLoader, assembleHello, makeProgramFd } from './toolchain.js';
import { releaseLoaderAtEntry, waitForLoaderControl } from './loader-control.mjs';
import { nextSourceEntry, sourceLineForRegisters } from './source-debug.mjs';
import { renderSourceLines } from './source-view.mjs';
import { bootFreeDos } from './freedos-session.mjs';

const statusNode = document.querySelector('#status');
const sourceNode = document.querySelector('#source');
const registersNode = document.querySelector('#registers');
const screenTextNode = document.querySelector('#screen-text');
const pauseButton = document.querySelector('#pause');
const stepButton = document.querySelector('#step');
const nextButton = document.querySelector('#next-line');
const continueButton = document.querySelector('#continue');
const runButton = document.querySelector('#run');

let engine;
let debug;
let sourceMap = [];
let sourceLines = [];
let programBytes;
let programCs;
let currentLine;
let selectedLine;
let disassemblyView;
let lastStepCount = 0;
let loaderControl;
let entryStopped = false;
let targetBytesMatched = false;

function setStatus(message, error = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', error);
}

function hex(value, width) {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function renderSource() {
  renderSourceLines(sourceNode, {
    sourceLines, sourceMap, currentLine, selectedLine, programCs,
    onToggleBreakpoint: toggleSourceBreakpoint,
  });
}

function renderRegisters(regs) {
  // embedのレジスタUIは使わず、IDE側の必要情報に絞った独自レイアウトで描画する。
  registersNode.replaceChildren();
  for (const name of ['eax', 'ebx', 'ecx', 'edx', 'esp', 'eip', 'cs', 'eflags']) {
    const item = document.createElement('div');
    item.className = 'ide-register';
    item.dataset.ideRegister = name;
    item.dataset.value = String(regs[name] >>> 0);
    item.innerHTML = `<span>${name.toUpperCase()}</span><strong>${hex(regs[name], name === 'cs' ? 4 : 8)}</strong>`;
    registersNode.append(item);
  }
}

function refreshDebugViews() {
  if (!debug?.isPaused()) return;
  const regs = debug.readRegisters();
  renderRegisters(regs);
  currentLine = sourceLineForRegisters(sourceMap, programCs, regs);
  renderSource();
  disassemblyView.update({
    seg: regs.cs,
    eip: regs.eip,
    lines: debug.disassemble(regs.cs, regs.eip, 12),
    breakpoints: new Set(),
  });
  screenTextNode.textContent = engine.getScreenText().text;
}

function toggleSourceBreakpoint(line) {
  if (programCs === undefined) return;
  if (selectedLine !== undefined) {
    const oldOffset = lineToOffset(sourceMap, selectedLine);
    if (oldOffset !== null) debug.setBreakpoint(0, programCs, oldOffset, false);
  }
  if (selectedLine === line) {
    selectedLine = undefined;
  } else {
    const offset = lineToOffset(sourceMap, line);
    if (offset === null) return;
    selectedLine = line;
    debug.setBreakpoint(0, programCs, offset, true);
  }
  continueButton.disabled = selectedLine === undefined;
  renderSource();
}

async function continueToSourceBreakpoint() {
  if (selectedLine === undefined) throw new Error('ソースBPが選択されていません');
  const hit = debug.runUntilBreakpoint(1_000_000);
  entryStopped = false;
  if (hit !== 0) throw new Error(`ソースBPへ到達できませんでした (hit=${hit})`);
  refreshDebugViews();
  if (currentLine !== selectedLine) {
    throw new Error(`停止行が不一致です: expected=${selectedLine}, actual=${currentLine}`);
  }
  setStatus(`ソース ${currentLine} 行で停止（CS=${hex(programCs, 4)}）`);
}

function runToNextSourceLine() {
  if (programCs === undefined || currentLine == null) throw new Error('現在のソース行を特定できません');
  const next = nextSourceEntry(sourceMap, currentLine);
  if (!next) throw new Error('次の生成行がありません');
  debug.setBreakpoint(1, programCs, next.offset, true);
  const hit = debug.runUntilBreakpoint(100_000);
  entryStopped = false;
  debug.setBreakpoint(1, programCs, next.offset, false);
  if (hit !== 1) throw new Error(`次の行へ到達できませんでした (hit=${hit})`);
  refreshDebugViews();
  if (currentLine !== next.srcLine) throw new Error(`次行が不一致です: expected=${next.srcLine}, actual=${currentLine}`);
  setStatus(`次のソース ${currentLine} 行へ進みました`);
}

function validateLoaderControl(control) {
  if (control.kind !== 0) throw new Error(`HELLOの種別がCOMではありません: ${control.kind}`);
  if (control.ip !== 0x0100) throw new Error(`COM初期IPが0100hではありません: ${hex(control.ip, 4)}`);
  if (control.cs !== control.targetPsp || control.ss !== control.targetPsp) {
    throw new Error('COM初期CS/SSが対象PSPと一致しません');
  }
  if (control.loaderPsp >= control.targetPsp) throw new Error('ローダが対象より下位メモリにありません');
  const pspAndTarget = debug.readMemory(control.targetPsp * 16, 0x100 + programBytes.length);
  if (pspAndTarget[0] !== 0xcd || pspAndTarget[1] !== 0x20) {
    throw new Error('ローダ通知PSPの先頭にINT 20hがありません');
  }
  targetBytesMatched = programBytes.every((byte, index) => pspAndTarget[0x100 + index] === byte);
  if (!targetBytesMatched) throw new Error('ロード済み対象が無改変HELLO.COMと一致しません');
}

async function initialize() {
  const [assembled, loader] = await Promise.all([assembleHello(), assembleDebugLoader()]);
  sourceMap = assembled.map;
  sourceLines = assembled.sourceText.split(/\r?\n/);
  programBytes = assembled.output;
  renderSource();
  setStatus(`NASM完了: ${programBytes.length} bytes / ${sourceMap.length} mapped lines`);

  const [freeDosResponse] = await Promise.all([fetch('./freedos/fd98_2hd.xdf')]);
  if (!freeDosResponse.ok) throw new Error(`FreeDOS: HTTP ${freeDosResponse.status}`);
  const freeDos = new Uint8Array(await freeDosResponse.arrayBuffer());
  const programFd = makeProgramFd(programBytes, loader.output);
  engine = createWebNP2(document.querySelector('#screen'));
  debug = createDebugger(engine);
  disassemblyView = mountDisassemblyView(document.querySelector('#disassembly'), {
    addBreakpointLabel: 'ブレークポイントを追加',
    removeBreakpointLabel: 'ブレークポイントを解除',
    onToggleBreakpoint: () => {},
  });
  await bootFreeDos(engine, {
    freeDos, freeDosKey: 'ide:freedos',
    programFd, programName: 'hello.xdf', programKey: 'ide:hello',
    onScreen: (screen) => { screenTextNode.textContent = screen.text; },
  });
  await engine.pasteText('B:\\E0LOAD\r');
  loaderControl = await waitForLoaderControl(debug);
  if (!loaderControl) throw new Error('デバッガローダのREADY制御ブロックを検出できません');
  validateLoaderControl(loaderControl);
  programCs = loaderControl.cs;
  releaseLoaderAtEntry(debug, loaderControl);
  entryStopped = true;
  document.body.dataset.programCs = String(programCs);
  pauseButton.textContent = 'Resume';
  stepButton.disabled = false;
  nextButton.disabled = false;
  runButton.disabled = false;
  renderSource();
  refreshDebugViews();
  setStatus(`HELLO.COMエントリ停止: ${hex(programCs, 4)}:${hex(loaderControl.ip, 4)}（4B01hローダ）`);
}

pauseButton.addEventListener('click', () => {
  if (!debug) return;
  debug.setPaused(!debug.isPaused());
  if (!debug.isPaused()) entryStopped = false;
  pauseButton.textContent = debug.isPaused() ? 'Resume' : 'Pause';
  stepButton.disabled = !debug.isPaused();
  nextButton.disabled = !debug.isPaused();
  if (debug.isPaused()) refreshDebugViews();
});
stepButton.addEventListener('click', () => {
  try {
    lastStepCount = debug.step(1);
    if (lastStepCount > 0) entryStopped = false;
    refreshDebugViews();
    setStatus(`${lastStepCount}命令実行しました`);
  }
  catch (error) { setStatus(error.message, true); }
});
nextButton.addEventListener('click', () => {
  try { runToNextSourceLine(); }
  catch (error) { setStatus(error.message, true); }
});
continueButton.addEventListener('click', () => {
  continueToSourceBreakpoint().catch((error) => setStatus(error.message, true));
});
runButton.addEventListener('click', () => {
  entryStopped = false;
  debug.setPaused(false); pauseButton.textContent = 'Pause'; stepButton.disabled = true; nextButton.disabled = true;
  setStatus('通常実行へ復帰しました');
});

window.pc98ide = {
  ready: initialize(),
  getState: () => ({
    programCs, currentLine, selectedLine, paused: debug?.isPaused() ?? false,
    lastStepCount, entryStopped, targetBytesMatched, loaderControl, programSize: programBytes?.length,
  }),
  getRegisters: () => debug?.readRegisters(),
  getScreenText: () => engine?.getScreenText(),
  isCpuPaused: () => engine?.dbgIsPaused() ?? true,
  insertGeneratedFd: async (name, bytes) => {
    await engine.insertFd(1, { name, bytes: new Uint8Array(bytes) }, `ide:generated:${name}`);
  },
  pasteDosCommand: async (command) => {
    await engine.pasteText(`${command}\r`);
  },
  capturePostExit: () => {
    const wasPaused = debug.isPaused();
    debug.setPaused(true);
    const registers = debug.readRegisters();
    return {
      wasPaused, registers, loaderControl,
      disassembly: debug.disassemble(registers.cs, registers.eip, 4),
    };
  },
};
window.pc98ide.ready.catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
