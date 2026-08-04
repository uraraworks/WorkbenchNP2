import {
  createDebugger,
  createWebNP2,
  mountDisassemblyView,
} from './vendor/webnp2/webnp2-embed.js';
import { lineToOffset, offsetToLine } from '../toolchain/listing.mjs';
import { assembleDebugLoader, assembleHello, makeProgramFd } from './toolchain.js';

const statusNode = document.querySelector('#status');
const sourceNode = document.querySelector('#source');
const registersNode = document.querySelector('#registers');
const screenTextNode = document.querySelector('#screen-text');
const pauseButton = document.querySelector('#pause');
const stepButton = document.querySelector('#step');
const nextButton = document.querySelector('#next-line');
const continueButton = document.querySelector('#continue');
const runButton = document.querySelector('#run');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const CONTROL_SIGNATURE = new TextEncoder().encode('PC98DEV1');
const CONTROL = {
  version: 8, state: 10, loaderPsp: 12, targetPsp: 14, kind: 16,
  sp: 18, ss: 20, ip: 22, cs: 24, errorAx: 26, release: 28, size: 30,
};

function setStatus(message, error = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', error);
}

function hex(value, width) {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function renderSource() {
  sourceNode.replaceChildren();
  const mappedLines = new Set(sourceMap.map((entry) => entry.srcLine));
  sourceLines.forEach((text, index) => {
    const line = index + 1;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'source-line';
    row.dataset.sourceLine = String(line);
    row.dataset.text = text;
    if (mappedLines.has(line)) row.dataset.debuggable = 'true';
    if (line === currentLine) row.classList.add('current');
    if (line === selectedLine) row.classList.add('breakpoint');
    row.disabled = !mappedLines.has(line) || programCs === undefined;
    const number = document.createElement('span'); number.className = 'line-number'; number.textContent = String(line);
    const marker = document.createElement('span'); marker.className = 'line-marker'; marker.textContent = line === selectedLine ? '●' : '';
    const code = document.createElement('code'); code.textContent = text || ' ';
    row.append(number, marker, code);
    row.addEventListener('click', () => toggleSourceBreakpoint(line));
    sourceNode.append(row);
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
  currentLine = programCs === regs.cs ? offsetToLine(sourceMap, regs.eip) : null;
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

function nextSourceEntry(line) {
  const currentIndex = sourceMap.findIndex((entry) => entry.srcLine === line);
  if (currentIndex < 0) return null;
  return sourceMap.slice(currentIndex + 1).find((entry) => entry.srcLine !== line) ?? null;
}

function runToNextSourceLine() {
  if (programCs === undefined || currentLine == null) throw new Error('現在のソース行を特定できません');
  const next = nextSourceEntry(currentLine);
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

function readWord(memory, offset) {
  return memory[offset] | (memory[offset + 1] << 8);
}

function signatureMatches(memory, offset) {
  return CONTROL_SIGNATURE.every((byte, index) => memory[offset + index] === byte);
}

function parseLoaderControl(memory, address) {
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
    errorAx: readWord(memory, address + CONTROL.errorAx),
  };
}

async function waitForLoaderControl() {
  // webnp2_mem_ptrのRAMビューは書込み可能だが、embedの公開境界を保つため
  // DebuggerControllerの範囲検査付きread/writeを使う。対象本体を探すのではなく、
  // stateを最後にpublishする専用署名だけを探すのでディスクキャッシュ像は一致しない。
  const limit = Date.now() + 20_000;
  while (Date.now() < limit) {
    const memory = debug.readMemory(0, 0xa0000);
    for (let address = 0; address + CONTROL.size <= memory.length; address++) {
      if (!signatureMatches(memory, address)) continue;
      const control = parseLoaderControl(memory, address);
      if (control.version !== 1 || (control.state !== 1 && control.state !== 0xffff)) continue;
      if (control.state === 0xffff) {
        throw new Error(`デバッガローダが失敗しました (AX=${hex(control.errorAx, 4)})`);
      }
      return control;
    }
    await sleep(100);
  }
  throw new Error('デバッガローダのREADY制御ブロックを検出できません');
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

function releaseLoaderAtEntry(control) {
  debug.setPaused(true);
  const frozenBytes = debug.readMemory(control.address, CONTROL.size);
  const frozen = parseLoaderControl(frozenBytes, 0);
  if (!signatureMatches(frozenBytes, 0) || frozen.version !== 1 || frozen.state !== 1) {
    throw new Error('pause前にローダ制御状態が変化しました');
  }
  debug.setBreakpoint(7, control.cs, control.ip, true);
  debug.writeMemory(control.address + CONTROL.release, new Uint8Array([0xa5]));
  const hit = debug.runUntilBreakpoint(100_000);
  debug.setBreakpoint(7, control.cs, control.ip, false);
  if (hit !== 7) throw new Error(`対象エントリへ到達できませんでした (hit=${hit})`);
  const regs = debug.readRegisters();
  if (regs.cs !== control.cs || regs.eip !== control.ip || regs.ss !== control.ss ||
      (regs.esp & 0xffff) !== control.sp || regs.ds !== control.targetPsp || regs.es !== control.targetPsp) {
    throw new Error('対象エントリの初期レジスタがローダ通知値と一致しません');
  }
  entryStopped = true;
}

async function waitForPrompt() {
  const limit = Date.now() + 60_000;
  while (Date.now() < limit) {
    const screen = engine.getScreenText().text;
    screenTextNode.textContent = screen;
    if (/A:\\?>/i.test(screen)) return;
    await sleep(200);
  }
  throw new Error('FreeDOSプロンプトを待機中にタイムアウトしました');
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
  await engine.boot({
    fd1: { file: { name: 'freedos.xdf', bytes: freeDos }, sourceKey: 'ide:freedos' },
    fd2: { file: { name: 'hello.xdf', bytes: programFd }, sourceKey: 'ide:hello' },
    latencyMs: 40,
    extMemMB: 1,
  });
  await waitForPrompt();
  await engine.pasteText('B:\\E0LOAD\r');
  loaderControl = await waitForLoaderControl();
  validateLoaderControl(loaderControl);
  programCs = loaderControl.cs;
  releaseLoaderAtEntry(loaderControl);
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
};
window.pc98ide.ready.catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
