import {
  createDebugger,
  createWebNP2,
  mountDisassemblyView,
} from './vendor/webnp2/webnp2-embed.js';
import { lineToOffset, offsetToLine } from '../toolchain/listing.mjs';
import { assembleHello, makeProgramFd } from './toolchain.js';

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
let waitingForRelease = true;
let disassemblyView;
let lastStepCount = 0;

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
  if (waitingForRelease) {
    // hello.asm冒頭のAH=08h入力待ちをBIOSキーバッファから解除する。
    await engine.pasteText('x');
    waitingForRelease = false;
  }
  const hit = debug.runUntilBreakpoint(1_000_000);
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
  debug.setBreakpoint(1, programCs, next.offset, false);
  if (hit !== 1) throw new Error(`次の行へ到達できませんでした (hit=${hit})`);
  refreshDebugViews();
  if (currentLine !== next.srcLine) throw new Error(`次行が不一致です: expected=${next.srcLine}, actual=${currentLine}`);
  setStatus(`次のソース ${currentLine} 行へ進みました`);
}

function bytesMatch(memory, offset, bytes) {
  if (offset < 0 || offset + bytes.length > memory.length) return false;
  for (let index = 0; index < bytes.length; index++) if (memory[offset + index] !== bytes[index]) return false;
  return true;
}

async function findLoadedComSegment() {
  // DOS .COMはPSPと同じセグメントのCS:0100から始まる。RAM上でCOM全バイトを照合し、
  // さらにPSP先頭のINT 20h (CD 20)を確認することで、ディスクキャッシュ中の偶然一致を除く。
  const limit = Date.now() + 20_000;
  while (Date.now() < limit) {
    const memory = debug.readMemory(0, 0xa0000);
    for (let base = 0x1000; base + 0x100 + programBytes.length <= memory.length; base += 0x10) {
      if (memory[base] !== 0xcd || memory[base + 1] !== 0x20) continue;
      if (bytesMatch(memory, base + 0x100, programBytes)) return base >>> 4;
    }
    await sleep(100);
  }
  throw new Error('ロード済みHELLO.COMをPSP付きでRAMから特定できません');
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
  const assembled = await assembleHello();
  sourceMap = assembled.map;
  sourceLines = assembled.sourceText.split(/\r?\n/);
  programBytes = assembled.output;
  renderSource();
  setStatus(`NASM完了: ${programBytes.length} bytes / ${sourceMap.length} mapped lines`);

  const [freeDosResponse] = await Promise.all([fetch('./freedos/fd98_2hd.xdf')]);
  if (!freeDosResponse.ok) throw new Error(`FreeDOS: HTTP ${freeDosResponse.status}`);
  const freeDos = new Uint8Array(await freeDosResponse.arrayBuffer());
  const programFd = makeProgramFd(programBytes);
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
  await engine.pasteText('B:\\HELLO\r');
  programCs = await findLoadedComSegment();
  debug.setPaused(true);
  document.body.dataset.programCs = String(programCs);
  pauseButton.textContent = 'Resume';
  stepButton.disabled = false;
  nextButton.disabled = false;
  runButton.disabled = false;
  renderSource();
  refreshDebugViews();
  setStatus(`HELLO.COMロード確認: PSP/CS=${hex(programCs, 4)}（RAM実測）`);
}

pauseButton.addEventListener('click', () => {
  if (!debug) return;
  debug.setPaused(!debug.isPaused());
  pauseButton.textContent = debug.isPaused() ? 'Resume' : 'Pause';
  stepButton.disabled = !debug.isPaused();
  nextButton.disabled = !debug.isPaused();
  if (debug.isPaused()) refreshDebugViews();
});
stepButton.addEventListener('click', () => {
  try {
    lastStepCount = debug.step(1);
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
  debug.setPaused(false); pauseButton.textContent = 'Pause'; stepButton.disabled = true; nextButton.disabled = true;
  setStatus('通常実行へ復帰しました');
});

window.pc98ide = {
  ready: initialize(),
  getState: () => ({ programCs, currentLine, selectedLine, paused: debug?.isPaused() ?? false, lastStepCount }),
  getRegisters: () => debug?.readRegisters(),
  getScreenText: () => engine?.getScreenText(),
};
window.pc98ide.ready.catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
