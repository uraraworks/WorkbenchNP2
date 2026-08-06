import {
  Compartment, Decoration, EditorState, EditorView, GutterMarker, RangeSetBuilder, StateEffect,
  StateField, bracketMatching, cpp, crosshairCursor, defaultHighlightStyle, defaultKeymap,
  drawSelection, dropCursor, gutter, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, history, historyKeymap, indentOnInput, indentWithTab, keymap,
  lineNumbers, lintGutter, rectangularSelection, setDiagnostics, syntaxHighlighting,
} from './vendor/codemirror/codemirror.js';
import { createDebugger, createWebNP2 } from './vendor/webnp2/webnp2-embed.js';
import { bootFreeDos, waitForCurrentDosPrompt } from './freedos-session.mjs';
import { LOADER_NAME, buildSource } from './browser-toolchain.mjs';
import { debugMapForBuild } from './debug-map.mjs';
import { createDebugSession } from './debug-session.mjs';
import {
  DirectoryProjectFS, clearDirectoryHandle, isDirectoryPickerAvailable, loadDirectoryHandle,
  pickDirectory, saveDirectoryHandle,
} from './directory-fs.mjs';
import { IndexedDbProjectFS } from './project-fs.mjs';
import { SAMPLE_FILES, loadSample } from './sample-manifest.mjs';

const nodes = {
  fileSelect: document.querySelector('#file-select'), newPath: document.querySelector('#new-path'),
  newFile: document.querySelector('#new-file'), save: document.querySelector('#save-file'),
  saveState: document.querySelector('#save-state'), currentPath: document.querySelector('#current-path'),
  folderOpen: document.querySelector('#folder-open'), folderDisconnect: document.querySelector('#folder-disconnect'),
  folderState: document.querySelector('#folder-state'),
  editor: document.querySelector('#editor'), build: document.querySelector('#build'), run: document.querySelector('#run'),
  buildStatus: document.querySelector('#build-status'), errors: document.querySelector('#build-errors'),
  runtimeStatus: document.querySelector('#runtime-status'), screenText: document.querySelector('#screen-text'),
  debug: document.querySelector('#debug'), step: document.querySelector('#debug-step'),
  nextLine: document.querySelector('#debug-next-line'), continue: document.querySelector('#debug-continue'),
  stopDebug: document.querySelector('#debug-stop'), debugPanel: document.querySelector('#debug-panel'),
  debugStatus: document.querySelector('#debug-status'), registers: document.querySelector('#registers'),
};
const language = new Compartment();
const projectFS = new IndexedDbProjectFS();
const engine = createWebNP2(document.querySelector('#screen'));
const debugController = createDebugger(engine);
let currentPath;
let currentOrigin = 'sample';
let dirty = false;
let loadingDocument = false;
let lastBuild;
let lastErrors = [];
let freeDos;
let runSequence = 0;
let booted;
let session;
let debugMap;
let directoryFS;
let directoryListing;
let currentEncoding = 'utf-8';
const breakpointLines = new Set();

function setSaveState(value) {
  dirty = value;
  nodes.saveState.textContent = value ? '未保存の変更あり' : '保存済み';
  nodes.saveState.classList.toggle('dirty', value);
}

function currentText() { return editor.state.doc.toString(); }
function extensionFor(path) { return path?.match(/\.([^.]+)$/)?.[1].toLowerCase(); }

/**
 * BP行と停止行はエディタ本体のgutter/decorationで示す。デバッガ実証画面の別ソース一覧ではなく、
 * 編集しているそのバッファへ印を付けるのがUI第2段の目的である。
 */
const setDebugMarks = StateEffect.define();
const debugMarks = StateField.define({
  create: () => ({ breakpoints: [], currentLine: null }),
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setDebugMarks)) return effect.value;
    return value;
  },
});

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const dot = document.createElement('span');
    dot.className = 'cm-breakpoint-dot';
    dot.textContent = '●';
    return dot;
  }
}
const breakpointMarker = new BreakpointMarker();

/** gutter幅を確保するためだけの不可視マーカー。BP印の数え上げに混ざらないよう別クラスにする。 */
class BreakpointSpacer extends GutterMarker {
  toDOM() {
    const spacer = document.createElement('span');
    spacer.className = 'cm-breakpoint-spacer';
    spacer.textContent = '●';
    return spacer;
  }
}
const breakpointSpacer = new BreakpointSpacer();

const breakpointGutter = [
  debugMarks,
  gutter({
    class: 'cm-breakpoint-gutter',
    markers(view) {
      const builder = new RangeSetBuilder();
      const { doc } = view.state;
      for (const line of view.state.field(debugMarks).breakpoints) {
        if (line >= 1 && line <= doc.lines) builder.add(doc.line(line).from, doc.line(line).from, breakpointMarker);
      }
      return builder.finish();
    },
    initialSpacer: () => breakpointSpacer,
    domEventHandlers: {
      mousedown(view, block) {
        toggleBreakpoint(view.state.doc.lineAt(block.from).number);
        return true;
      },
    },
  }),
  EditorView.decorations.compute([debugMarks], (state) => {
    const { currentLine } = state.field(debugMarks);
    if (!Number.isInteger(currentLine) || currentLine < 1 || currentLine > state.doc.lines) return Decoration.none;
    return Decoration.set([
      Decoration.line({ class: 'cm-debug-current', attributes: { 'data-debug-current': String(currentLine) } })
        .range(state.doc.line(currentLine).from),
    ]);
  }),
];

function syncDebugMarks(currentLine = null) {
  editor.dispatch({
    effects: setDebugMarks.of({ breakpoints: [...breakpointLines].sort((a, b) => a - b), currentLine }),
  });
}

const editor = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [
      breakpointGutter,
      lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(),
      dropCursor(), EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(),
      rectangularSelection(), crosshairCursor(), highlightActiveLine(), syntaxHighlighting(defaultHighlightStyle),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), lintGutter(), EditorView.lineWrapping,
      language.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !loadingDocument) {
          setSaveState(true); lastBuild = undefined;
          // 実行中の対象はビルド時のバイト列のままなので、編集で行印が古くなったことを明示する。
          if (session?.isStarted()) setDebugStatus('編集後のソースはまだ実行対象ではありません（再ビルドが必要）');
        }
      }),
    ],
  }),
  parent: nodes.editor,
});

function clearDiagnostics() {
  lastErrors = [];
  editor.dispatch(setDiagnostics(editor.state, []));
  nodes.errors.replaceChildren();
}

function showErrors(errors) {
  lastErrors = errors;
  const diagnostics = errors.filter((error) => Number.isInteger(error.line) && error.line > 0).map((error) => {
    const lineNumber = Math.min(error.line, editor.state.doc.lines);
    const line = editor.state.doc.line(lineNumber);
    const column = Math.max(0, (error.column ?? 1) - 1);
    const from = Math.min(line.to, line.from + column);
    return { from, to: Math.max(from, line.to), severity: 'error', message: error.message, source: error.stage };
  });
  editor.dispatch(setDiagnostics(editor.state, diagnostics));
  nodes.errors.replaceChildren(...errors.map((error) => {
    const item = document.createElement('li');
    item.dataset.errorLine = String(error.line ?? 0);
    item.textContent = `${error.stage ?? 'build'}${error.line > 0 ? `:${error.line}` : ''}: ${error.message}`;
    return item;
  }));
}

const ORIGIN_LABELS = { sample: 'サンプル', project: 'IndexedDB', directory: 'フォルダ' };

/** 書き込み先は「フォルダを繋いでいればフォルダ、でなければIndexedDB」。両者を同期はしない。 */
function writableOrigin() { return directoryFS ? 'directory' : 'project'; }
function backendFor(origin) { return origin === 'directory' ? directoryFS : projectFS; }

async function refreshFileSelect(selected = `${currentOrigin}:${currentPath}`) {
  const makeGroup = (label, files, origin) => {
    const group = document.createElement('optgroup'); group.label = label;
    for (const file of files) {
      const option = document.createElement('option'); option.value = `${origin}:${file.path}`;
      option.textContent = file.path; group.append(option);
    }
    return group;
  };
  const groups = [];
  if (directoryFS) {
    const listing = await directoryFS.listDetailed();
    directoryListing = listing;
    const suffix = listing.truncated ? `（先頭${listing.files.length}件のみ）` : '';
    groups.push(makeGroup(`フォルダ ${directoryFS.name}${suffix}`, listing.files, 'directory'));
  }
  groups.push(makeGroup('IndexedDB プロジェクト', await projectFS.list(), 'project'));
  groups.push(makeGroup('同梱サンプル', SAMPLE_FILES, 'sample'));
  nodes.fileSelect.replaceChildren(...groups);
  if ([...nodes.fileSelect.options].some((option) => option.value === selected)) nodes.fileSelect.value = selected;
}

async function openFile(origin, path) {
  let content;
  currentEncoding = 'utf-8';
  if (origin === 'sample') {
    const sample = SAMPLE_FILES.find((entry) => entry.path === path);
    if (!sample) throw new Error(`${path}は同梱サンプルではありません`);
    content = await loadSample(sample);
  } else {
    const backend = backendFor(origin);
    if (!backend) throw new Error('フォルダが接続されていません');
    const record = await backend.read(path);
    if (!record) throw new Error(`${path}が${ORIGIN_LABELS[origin]}にありません`);
    content = record.content;
    currentEncoding = record.encoding ?? 'utf-8';
  }
  currentPath = path; currentOrigin = origin;
  loadingDocument = true;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content } });
  loadingDocument = false;
  editor.dispatch({ effects: language.reconfigure(extensionFor(path) === 'c' ? cpp() : []) });
  // BP行は行番号そのものなので、別ファイルへ持ち越さずセッションごと畳む。
  breakpointLines.clear();
  session?.detach(); session = undefined; debugMap = undefined;
  syncDebugMarks(null); setDebugControls(false);
  clearDiagnostics(); lastBuild = undefined; setSaveState(false);
  setCurrentPathLabel();
  nodes.buildStatus.textContent = '.asm / .c を自動判別します'; nodes.buildStatus.classList.remove('error');
  await refreshFileSelect(`${origin}:${path}`);
}

function setCurrentPathLabel() {
  const encoding = currentEncoding === 'utf-8' ? '' : `（${currentEncoding}）`;
  nodes.currentPath.textContent = `${ORIGIN_LABELS[currentOrigin]} / ${currentPath}${encoding}`;
}

async function saveFile() {
  if (!currentPath) throw new Error('保存対象がありません');
  // サンプルは読み取り専用なので、保存すると書き込み可能なバックエンドへ複製される。
  const target = currentOrigin === 'sample' ? writableOrigin() : currentOrigin;
  await backendFor(target).write(currentPath, currentText());
  currentOrigin = target; currentEncoding = 'utf-8'; setSaveState(false);
  setCurrentPathLabel();
  await refreshFileSelect(`${target}:${currentPath}`);
}

async function createFile(path) {
  const ext = extensionFor(path);
  if (ext !== 'asm' && ext !== 'c') throw new Error('新規ファイルは .asm または .c にしてください');
  const template = ext === 'asm' ? 'CPU 8086\nBITS 16\nORG 100h\n\n' : 'int main(void)\n{\n  return 0;\n}\n';
  const target = writableOrigin();
  await backendFor(target).write(path, template);
  await openFile(target, path);
}

async function buildCurrent() {
  if (!currentPath) throw new Error('ビルド対象がありません');
  nodes.build.disabled = true; nodes.run.disabled = true; nodes.debug.disabled = true;
  nodes.buildStatus.textContent = `${currentPath} をビルド中…`; nodes.buildStatus.classList.remove('error');
  clearDiagnostics();
  try {
    await saveFile();
    const result = await buildSource(currentPath, currentText());
    if (!result.ok) {
      showErrors(result.errors);
      nodes.buildStatus.textContent = `${result.errors.length}件のエラー`; nodes.buildStatus.classList.add('error');
      lastBuild = undefined;
      return result;
    }
    lastBuild = result;
    // 行マップはビルド時点で確定させる。どの行にBPを張れるかを実行前に答えられるようにする。
    debugMap = debugMapForBuild(result);
    syncDebugMarks(session?.isStarted() ? session.currentLine() : null);
    nodes.buildStatus.textContent = `${result.dosName}: ${result.output.byteLength} bytes / FAT12 FD生成完了`;
    return result;
  } finally {
    nodes.build.disabled = false; nodes.run.disabled = false; nodes.debug.disabled = false;
  }
}

/**
 * コアはページごとに1回しか起動できないため、FreeDOSは1度だけ起動し、
 * 以後はビルドのたびにB:のFDだけ差し替える。ビルド→実行→デバッグを何度でも繰り返せる。
 */
/** メディア交換はDOS側が気付くまで待つ必要がある。排出後と挿入後の両方で間隔を空ける。 */
const FD_SWAP_MS = 300;
const settle = (ms) => new Promise((resolveSettle) => { setTimeout(resolveSettle, ms); });

async function mountProgramFd(built) {
  const name = `${built.dosName}.xdf`;
  const key = `workbench:${built.dosName}:${runSequence++}`;
  if (!booted) {
    // 初回はB:へFDを入れた状態で起動する。空のB:で起動するとDOSがドライブ未準備を覚えてしまう。
    nodes.runtimeStatus.textContent = 'FreeDOSを起動中…';
    booted = bootFreeDos(engine, {
      freeDos, freeDosKey: 'workbench:freedos', programFd: built.fd, programName: name, programKey: key,
      onScreen: (screen) => { nodes.screenText.textContent = screen.text; },
    }).catch((error) => { booted = undefined; throw error; });
    return booted;
  }
  await booted;
  // drive=2 は fd2 スロット、すなわち B:。1 を渡すと FreeDOS 側の A: を差し替えてしまう。
  // 差し替えるだけではDOSがFATキャッシュを持ち越して「ドライブの準備ができていません」になるため、
  // embedの書き戻しと同じく 排出→間隔→挿入 のメディア交換手順を踏む。
  // 排出せず挿入だけだとDOSがキャッシュを持ち越して「準備ができていません」になることを実測した。
  await engine.ejectFd(2);
  await settle(FD_SWAP_MS);
  await engine.insertFd(2, { name, bytes: built.fd }, key);
  await settle(FD_SWAP_MS);
  const screen = engine.getScreenText();
  nodes.screenText.textContent = screen.text;
  return screen;
}

async function runCurrent() {
  const built = lastBuild ?? await buildCurrent();
  if (!built?.ok) return built;
  if (session?.isStarted()) await stopDebug();
  const baseline = await mountProgramFd(built);
  nodes.runtimeStatus.textContent = `${built.dosName}を実行中…`;
  await engine.pasteText(`B:\\${built.dosName}\r`);
  const screen = await waitForCurrentDosPrompt(engine, { baseline: baseline.text, timeout: 60_000 });
  nodes.screenText.textContent = screen.text;
  nodes.runtimeStatus.textContent = `${built.dosName} 終了・DOSプロンプト復帰`;
  return { ...built, screen };
}

const HEX = (value, width) => (value >>> 0).toString(16).toUpperCase().padStart(width, '0');

function setDebugStatus(message, error = false) {
  nodes.debugStatus.textContent = message;
  nodes.debugStatus.classList.toggle('error', error);
}

function setDebugControls(active) {
  nodes.debugPanel.hidden = !active;
  const paused = active && session?.isPaused();
  nodes.step.disabled = !paused;
  nodes.nextLine.disabled = !paused;
  nodes.continue.disabled = !paused || breakpointLines.size === 0;
  nodes.stopDebug.disabled = !active;
}

function renderRegisters(regs) {
  // embedのレジスタUIは使わず、IDEが必要とする8本だけを固定順で描画する。
  nodes.registers.replaceChildren(...['eax', 'ebx', 'ecx', 'edx', 'esp', 'eip', 'cs', 'eflags'].map((name) => {
    const item = document.createElement('div');
    item.className = 'ide-register';
    item.dataset.ideRegister = name;
    item.dataset.value = String(regs[name] >>> 0);
    item.innerHTML = `<span>${name.toUpperCase()}</span><strong>${HEX(regs[name], name === 'cs' ? 4 : 8)}</strong>`;
    return item;
  }));
}

function refreshDebugViews() {
  if (!session?.isStarted() || !session.isPaused()) return null;
  const regs = session.registers();
  renderRegisters(regs);
  const line = session.currentLine();
  syncDebugMarks(line);
  nodes.screenText.textContent = engine.getScreenText().text;
  setDebugControls(true);
  return { regs, line };
}

/** BP行の集合を1つの真実として持ち、セッション中は即座にハードウェアBPへ反映する。 */
function toggleBreakpoint(line) {
  const previous = new Set(breakpointLines);
  const adding = !breakpointLines.has(line);
  if (adding && debugMap && !debugMap.isDebuggable(line)) {
    setDebugStatus(`${line}行には生成アドレスがないためBPを張れません`, true);
    return false;
  }
  if (adding) breakpointLines.add(line); else breakpointLines.delete(line);
  if (session?.isStarted()) {
    try {
      session.setBreakpointLines([...breakpointLines]);
    } catch (error) {
      breakpointLines.clear();
      for (const kept of previous) breakpointLines.add(kept);
      session.setBreakpointLines([...breakpointLines]);
      setDebugStatus(error.message, true);
      syncDebugMarks(session.currentLine());
      return false;
    }
  }
  syncDebugMarks(session?.isStarted() ? session.currentLine() : null);
  setDebugControls(Boolean(session?.isStarted()));
  return true;
}

async function startDebug() {
  const built = lastBuild ?? await buildCurrent();
  if (!built?.ok) return built;
  if (!debugMap) throw new Error('行マップを生成できませんでした');
  if (session?.isStarted()) await stopDebug();
  nodes.debugPanel.hidden = false;
  setDebugStatus('FreeDOSとデバッガローダを準備中…');
  await mountProgramFd(built);
  session = createDebugSession(debugController);
  const started = await session.start(
    engine, `B:\\${LOADER_NAME} B:\\${built.dosName}`, debugMap, built.kind,
  );
  const unmapped = [...breakpointLines].filter((line) => !debugMap.isDebuggable(line));
  if (unmapped.length > 0) {
    // 張れないBPを黙って捨てると「効かないBP」になるため、外した行を明示してから続行する。
    for (const line of unmapped) breakpointLines.delete(line);
    setDebugStatus(`生成アドレスのない ${unmapped.join(', ')} 行のBPを解除しました`, true);
  }
  session.setBreakpointLines([...breakpointLines]);
  const view = refreshDebugViews();
  nodes.runtimeStatus.textContent = `${built.dosName} エントリ停止`;
  if (unmapped.length === 0) {
    setDebugStatus(`${built.dosName} エントリ停止 CS:IP=${HEX(started.control.cs, 4)}:${HEX(started.control.ip, 4)}`);
  }
  return { ...started, line: view?.line ?? null };
}

function requireSession() {
  if (!session?.isStarted()) throw new Error('デバッグセッションが開始されていません');
  return session;
}

function stepInstruction() {
  const result = requireSession().stepInstruction(1);
  refreshDebugViews();
  setDebugStatus(`${result.steps}命令実行しました`);
  return result;
}

function stepOverLine() {
  const result = requireSession().stepOverLine();
  refreshDebugViews();
  if (result.line !== result.expectedLine) {
    throw new Error(`次行が不一致です: expected=${result.expectedLine}, actual=${result.line}`);
  }
  setDebugStatus(`次のソース ${result.line} 行へ進みました`);
  return result;
}

function continueToBreakpoint() {
  const result = requireSession().continueToBreakpoint();
  refreshDebugViews();
  if (result.line !== result.expectedLine) {
    throw new Error(`停止行が不一致です: expected=${result.expectedLine}, actual=${result.line}`);
  }
  setDebugStatus(`ソース ${result.line} 行で停止しました`);
  return result;
}

/** BPを外して通常実行へ戻す。プログラム終了後のDOSプロンプト復帰まで待つ。 */
async function stopDebug() {
  requireSession().detach();
  session = undefined;
  syncDebugMarks(null);
  setDebugControls(false);
  // 停止していないCPUのレジスタを表示し続けると嘘になるので、復帰と同時に消す。
  nodes.registers.replaceChildren();
  setDebugStatus('通常実行へ復帰しました');
  nodes.runtimeStatus.textContent = '通常実行中…';
  const screen = await waitForCurrentDosPrompt(engine, { timeout: 60_000 });
  nodes.screenText.textContent = screen.text;
  nodes.runtimeStatus.textContent = '実行終了・DOSプロンプト復帰';
  return screen;
}

function setDirectoryLabel(message) {
  nodes.folderState.textContent = message;
  nodes.folderDisconnect.hidden = !directoryFS;
  nodes.folderOpen.textContent = directoryFS ? '別のフォルダ' : 'フォルダを開く';
}

/**
 * ローカルフォルダをそのまま作業場所にする。IndexedDBとは同期せず、
 * 接続中は保存も新規作成もフォルダ側だけへ行う（1プロジェクト=1バックエンド）。
 */
async function connectDirectory(handle, { persist = true } = {}) {
  const candidate = new DirectoryProjectFS(handle);
  const permission = await candidate.ensurePermission('readwrite', { request: true });
  if (permission !== 'granted') throw new Error(`フォルダの読み書き許可がありません: ${permission}`);
  directoryFS = candidate;
  if (persist) await saveDirectoryHandle(handle).catch(() => {});
  const listing = await directoryFS.listDetailed();
  directoryListing = listing;
  const notes = [`${listing.files.length}件`];
  if (listing.skipped > 0) notes.push(`対象外${listing.skipped}件`);
  if (listing.truncated) notes.push('上限で打切り');
  setDirectoryLabel(`${directoryFS.name}（${notes.join(' / ')}）`);
  await refreshFileSelect();
  return { name: directoryFS.name, permission, ...listing };
}

async function disconnectDirectory() {
  directoryFS = undefined;
  directoryListing = undefined;
  await clearDirectoryHandle().catch(() => {});
  setDirectoryLabel('フォルダ未接続');
  // 開いていたのがフォルダのファイルなら、参照先を失うので同梱サンプルへ戻す。
  if (currentOrigin === 'directory') await openFile('sample', 'samples/hello.asm');
  else await refreshFileSelect();
}

/** 再読込後のハンドルは許可が prompt へ落ちることがあり、再許可には利用者ジェスチャが要る。 */
async function restoreDirectory() {
  if (!isDirectoryPickerAvailable()) { setDirectoryLabel('このブラウザはフォルダを開けません'); return; }
  const handle = await loadDirectoryHandle().catch(() => null);
  if (!handle) { setDirectoryLabel('フォルダ未接続'); return; }
  const stored = new DirectoryProjectFS(handle);
  if (await stored.ensurePermission('readwrite') === 'granted') {
    await connectDirectory(handle, { persist: false });
    return;
  }
  setDirectoryLabel(`${handle.name}（再接続には許可が必要）`);
  nodes.folderOpen.textContent = 'フォルダを再接続';
  nodes.folderOpen.dataset.restoreHandle = 'true';
}

async function openFolder() {
  const stored = nodes.folderOpen.dataset.restoreHandle === 'true' ? await loadDirectoryHandle() : null;
  delete nodes.folderOpen.dataset.restoreHandle;
  return connectDirectory(stored ?? await pickDirectory());
}

async function initialize() {
  await projectFS.open();
  const response = await fetch('./freedos/fd98_2hd.xdf');
  if (!response.ok) throw new Error(`FreeDOS: HTTP ${response.status}`);
  freeDos = new Uint8Array(await response.arrayBuffer());
  // フォルダ復元に失敗しても、同梱サンプルだけで動く状態までは必ず立ち上げる。
  await restoreDirectory().catch((error) => setDirectoryLabel(`フォルダ復元に失敗: ${error.message}`));
  await refreshFileSelect();
  await openFile('sample', 'samples/hello.asm');
  nodes.buildStatus.textContent = '準備完了';
}

nodes.fileSelect.addEventListener('change', () => {
  const separator = nodes.fileSelect.value.indexOf(':');
  openFile(nodes.fileSelect.value.slice(0, separator), nodes.fileSelect.value.slice(separator + 1))
    .catch((error) => { nodes.buildStatus.textContent = error.message; nodes.buildStatus.classList.add('error'); });
});
nodes.newFile.addEventListener('click', () => createFile(nodes.newPath.value).catch((error) => showErrors([{ stage: 'input', line: 0, message: error.message }])));
nodes.save.addEventListener('click', () => saveFile().catch((error) => showErrors([{ stage: 'save', line: 0, message: error.message }])));
nodes.folderOpen.addEventListener('click', () => openFolder().catch((error) => setDirectoryLabel(error.message)));
nodes.folderDisconnect.addEventListener('click', () => disconnectDirectory().catch((error) => setDirectoryLabel(error.message)));
nodes.build.addEventListener('click', () => buildCurrent());
nodes.run.addEventListener('click', () => runCurrent());
nodes.debug.addEventListener('click', () => startDebug().catch((error) => setDebugStatus(error.message, true)));
nodes.step.addEventListener('click', () => { try { stepInstruction(); } catch (error) { setDebugStatus(error.message, true); } });
nodes.nextLine.addEventListener('click', () => { try { stepOverLine(); } catch (error) { setDebugStatus(error.message, true); } });
nodes.continue.addEventListener('click', () => { try { continueToBreakpoint(); } catch (error) { setDebugStatus(error.message, true); } });
nodes.stopDebug.addEventListener('click', () => stopDebug().catch((error) => setDebugStatus(error.message, true)));

const ready = initialize();
ready.catch((error) => { nodes.buildStatus.textContent = error.message; nodes.buildStatus.classList.add('error'); });
window.pc98workbench = {
  ready, openFile, createFile, saveFile, buildCurrent, runCurrent,
  startDebug, stopDebug, toggleBreakpoint, stepInstruction, stepOverLine, continueToBreakpoint,
  getDebugState: () => ({
    started: Boolean(session?.isStarted()), paused: Boolean(session?.isPaused()),
    kind: debugMap?.kind ?? null, breakpoints: [...breakpointLines].sort((a, b) => a - b),
    currentLine: session?.isStarted() ? session.currentLine() : null,
    control: session?.control ?? null, debuggableLines: debugMap?.debuggableLines() ?? [],
  }),
  getRegisters: () => (session?.isStarted() ? session.registers() : undefined),
  isCpuPaused: () => engine.dbgIsPaused(),
  engine,
  setValue: (text) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } }),
  getValue: currentText,
  getState: () => ({ currentPath, currentOrigin, dirty, errors: lastErrors, built: lastBuild?.dosName ?? null }),
  listProjectFiles: () => projectFS.list(),
  connectDirectory, disconnectDirectory,
  getDirectoryState: () => ({
    available: isDirectoryPickerAvailable(), connected: Boolean(directoryFS),
    name: directoryFS?.name ?? null, fileCount: directoryListing?.files.length ?? 0,
    truncated: directoryListing?.truncated ?? false, skipped: directoryListing?.skipped ?? 0,
  }),
  getScreenText: () => engine.getScreenText(),
  getLayout: () => ({
    editor: nodes.editor.getBoundingClientRect().toJSON(),
    screen: document.querySelector('#screen').getBoundingClientRect().toJSON(),
    contentEditable: Boolean(nodes.editor.querySelector('[contenteditable="true"]')),
  }),
  /** BP印と停止行強調は、実際にエディタDOMへ出ているかどうかで確認する。 */
  getEditorMarks: () => ({
    breakpointDots: nodes.editor.querySelectorAll('.cm-breakpoint-dot').length,
    currentLine: Number(nodes.editor.querySelector('[data-debug-current]')?.dataset.debugCurrent ?? 0) || null,
    registers: [...nodes.registers.querySelectorAll('[data-ide-register]')]
      .map((item) => [item.dataset.ideRegister, Number(item.dataset.value)]),
    debugPanelVisible: !nodes.debugPanel.hidden,
  }),
};
