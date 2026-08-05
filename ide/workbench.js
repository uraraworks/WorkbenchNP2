import {
  Compartment, EditorState, EditorView, bracketMatching, cpp, crosshairCursor,
  defaultHighlightStyle, defaultKeymap, drawSelection, dropCursor, highlightActiveLine,
  highlightActiveLineGutter, highlightSpecialChars, history, historyKeymap, indentOnInput,
  indentWithTab, keymap, lineNumbers, lintGutter, rectangularSelection, setDiagnostics,
  syntaxHighlighting,
} from './vendor/codemirror/codemirror.js';
import { createWebNP2 } from './vendor/webnp2/webnp2-embed.js';
import { bootFreeDos, waitForCurrentDosPrompt } from './freedos-session.mjs';
import { buildSource } from './browser-toolchain.mjs';
import { IndexedDbProjectFS } from './project-fs.mjs';
import { SAMPLE_FILES, loadSample } from './sample-manifest.mjs';

const nodes = {
  fileSelect: document.querySelector('#file-select'), newPath: document.querySelector('#new-path'),
  newFile: document.querySelector('#new-file'), save: document.querySelector('#save-file'),
  saveState: document.querySelector('#save-state'), currentPath: document.querySelector('#current-path'),
  editor: document.querySelector('#editor'), build: document.querySelector('#build'), run: document.querySelector('#run'),
  buildStatus: document.querySelector('#build-status'), errors: document.querySelector('#build-errors'),
  runtimeStatus: document.querySelector('#runtime-status'), screenText: document.querySelector('#screen-text'),
};
const language = new Compartment();
const projectFS = new IndexedDbProjectFS();
const engine = createWebNP2(document.querySelector('#screen'));
let currentPath;
let currentOrigin = 'sample';
let dirty = false;
let loadingDocument = false;
let lastBuild;
let lastErrors = [];
let freeDos;
let runSequence = 0;

function setSaveState(value) {
  dirty = value;
  nodes.saveState.textContent = value ? '未保存の変更あり' : '保存済み';
  nodes.saveState.classList.toggle('dirty', value);
}

function currentText() { return editor.state.doc.toString(); }
function extensionFor(path) { return path?.match(/\.([^.]+)$/)?.[1].toLowerCase(); }

const editor = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [
      lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(),
      dropCursor(), EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(),
      rectangularSelection(), crosshairCursor(), highlightActiveLine(), syntaxHighlighting(defaultHighlightStyle),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), lintGutter(), EditorView.lineWrapping,
      language.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !loadingDocument) { setSaveState(true); lastBuild = undefined; }
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

async function refreshFileSelect(selected = `${currentOrigin}:${currentPath}`) {
  const projects = await projectFS.list();
  const makeGroup = (label, files, origin) => {
    const group = document.createElement('optgroup'); group.label = label;
    for (const file of files) {
      const option = document.createElement('option'); option.value = `${origin}:${file.path}`;
      option.textContent = file.path; group.append(option);
    }
    return group;
  };
  nodes.fileSelect.replaceChildren(
    makeGroup('IndexedDB プロジェクト', projects, 'project'),
    makeGroup('同梱サンプル', SAMPLE_FILES, 'sample'),
  );
  if ([...nodes.fileSelect.options].some((option) => option.value === selected)) nodes.fileSelect.value = selected;
}

async function openFile(origin, path) {
  let content;
  if (origin === 'project') {
    const record = await projectFS.read(path);
    if (!record) throw new Error(`${path}がIndexedDBにありません`);
    content = record.content;
  } else {
    const sample = SAMPLE_FILES.find((entry) => entry.path === path);
    if (!sample) throw new Error(`${path}は同梱サンプルではありません`);
    content = await loadSample(sample);
  }
  currentPath = path; currentOrigin = origin;
  loadingDocument = true;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content } });
  loadingDocument = false;
  editor.dispatch({ effects: language.reconfigure(extensionFor(path) === 'c' ? cpp() : []) });
  clearDiagnostics(); lastBuild = undefined; setSaveState(false);
  nodes.currentPath.textContent = `${origin === 'sample' ? 'サンプル' : 'IndexedDB'} / ${path}`;
  nodes.buildStatus.textContent = '.asm / .c を自動判別します'; nodes.buildStatus.classList.remove('error');
  await refreshFileSelect(`${origin}:${path}`);
}

async function saveFile() {
  if (!currentPath) throw new Error('保存対象がありません');
  await projectFS.write(currentPath, currentText());
  currentOrigin = 'project'; setSaveState(false);
  nodes.currentPath.textContent = `IndexedDB / ${currentPath}`;
  await refreshFileSelect(`project:${currentPath}`);
}

async function createFile(path) {
  const ext = extensionFor(path);
  if (ext !== 'asm' && ext !== 'c') throw new Error('新規ファイルは .asm または .c にしてください');
  const template = ext === 'asm' ? 'CPU 8086\nBITS 16\nORG 100h\n\n' : 'int main(void)\n{\n  return 0;\n}\n';
  await projectFS.write(path, template);
  await openFile('project', path);
}

async function buildCurrent() {
  if (!currentPath) throw new Error('ビルド対象がありません');
  nodes.build.disabled = true; nodes.run.disabled = true;
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
    nodes.buildStatus.textContent = `${result.dosName}: ${result.output.byteLength} bytes / FAT12 FD生成完了`;
    return result;
  } finally {
    nodes.build.disabled = false; nodes.run.disabled = false;
  }
}

async function runCurrent() {
  const built = lastBuild ?? await buildCurrent();
  if (!built?.ok) return built;
  nodes.runtimeStatus.textContent = 'FreeDOSを起動中…';
  const baseline = await bootFreeDos(engine, {
    freeDos, freeDosKey: 'workbench:freedos', programFd: built.fd,
    programName: `${built.dosName}.xdf`, programKey: `workbench:${built.dosName}:${runSequence++}`,
    onScreen: (screen) => { nodes.screenText.textContent = screen.text; },
  });
  nodes.runtimeStatus.textContent = `${built.dosName}を実行中…`;
  await engine.pasteText(`B:\\${built.dosName}\r`);
  const screen = await waitForCurrentDosPrompt(engine, { baseline: baseline.text, timeout: 60_000 });
  nodes.screenText.textContent = screen.text;
  nodes.runtimeStatus.textContent = `${built.dosName} 終了・DOSプロンプト復帰`;
  return { ...built, screen };
}

async function initialize() {
  await projectFS.open();
  const response = await fetch('./freedos/fd98_2hd.xdf');
  if (!response.ok) throw new Error(`FreeDOS: HTTP ${response.status}`);
  freeDos = new Uint8Array(await response.arrayBuffer());
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
nodes.build.addEventListener('click', () => buildCurrent());
nodes.run.addEventListener('click', () => runCurrent());

const ready = initialize();
ready.catch((error) => { nodes.buildStatus.textContent = error.message; nodes.buildStatus.classList.add('error'); });
window.pc98workbench = {
  ready, openFile, createFile, saveFile, buildCurrent, runCurrent,
  setValue: (text) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } }),
  getValue: currentText,
  getState: () => ({ currentPath, currentOrigin, dirty, errors: lastErrors, built: lastBuild?.dosName ?? null }),
  listProjectFiles: () => projectFS.list(),
  getScreenText: () => engine.getScreenText(),
  getLayout: () => ({
    editor: nodes.editor.getBoundingClientRect().toJSON(),
    screen: document.querySelector('#screen').getBoundingClientRect().toJSON(),
    contentEditable: Boolean(nodes.editor.querySelector('[contenteditable="true"]')),
  }),
};
