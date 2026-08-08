import {
  Compartment, Decoration, EditorState, EditorView, GutterMarker, RangeSetBuilder, StateEffect,
  StateField, bracketMatching, cpp, crosshairCursor, defaultKeymap,
  drawSelection, dropCursor, gutter, highlightActiveLine, highlightActiveLineGutter,
  HighlightStyle, highlightSpecialChars, history, historyKeymap, indentLess, indentOnInput,
  indentUnit, insertTab, keymap, lineNumbers, lintGutter, rectangularSelection, setDiagnostics,
  syntaxHighlighting, tags,
} from './vendor/codemirror/codemirror.js';
import { createDebugger, createWebNP2, mountDisassemblyView } from './vendor/webnp2/webnp2-embed.js';
import { bootFreeDos, waitForCurrentDosPrompt } from './freedos-session.mjs';
import {
  answerDriveErrorAbort, currentDosPrompt, DOS_DRIVE_ERROR_PATTERN,
} from './dos-prompt.mjs';
import { LOADER_NAME, buildSource, makeLoaderOnlyFd } from './browser-toolchain.mjs';
import { debugMapForBuild } from './debug-map.mjs';
import { createDebugSession } from './debug-session.mjs';
import { CONTROL, parseLoaderControl } from './loader-control.mjs';
import {
  DirectoryProjectFS, clearDirectoryHandle, isDirectoryPickerAvailable, loadDirectoryHandle,
  pickDirectory, saveDirectoryHandle,
} from './directory-fs.mjs';
import { IndexedDbProjectFS } from './project-fs.mjs';
import { SAMPLE_FILES, loadSample } from './sample-manifest.mjs';

const nodes = {
  fileTree: document.querySelector('#file-tree'), newPath: document.querySelector('#new-path'),
  newFile: document.querySelector('#new-file'), save: document.querySelector('#save-file'),
  saveState: document.querySelector('#save-state'), currentPath: document.querySelector('#current-path'),
  editLock: document.querySelector('#edit-lock'),
  tabStrip: document.querySelector('#tab-strip'),
  sidebar: document.querySelector('#sidebar'),
  activityBar: document.querySelector('#activity-bar'),
  activityExplorer: document.querySelector('#activity-explorer'), activityDebug: document.querySelector('#activity-debug'),
  viewExplorer: document.querySelector('#view-explorer'), viewDebug: document.querySelector('#view-debug'),
  debugEmpty: document.querySelector('#debug-empty'),
  folderOpen: document.querySelector('#folder-open'), folderDisconnect: document.querySelector('#folder-disconnect'),
  swapPanes: document.querySelector('#swap-panes'), folderState: document.querySelector('#folder-state'),
  editorCard: document.querySelector('.editor-card'), machineCard: document.querySelector('.machine-card'),
  workspace: document.querySelector('.workspace-grid'), splitter: document.querySelector('#splitter'),
  maximizeEditor: document.querySelector('#maximize-editor'), maximizeMachine: document.querySelector('#maximize-machine'),
  editor: document.querySelector('#editor'), build: document.querySelector('#build'), run: document.querySelector('#run'),
  editorToolbar: document.querySelector('#editor-toolbar'),
  buildActions: document.querySelector('#build-actions'), debugActions: document.querySelector('#debug-actions'),
  debugToolbarGrip: document.querySelector('#debug-toolbar-grip'),
  buildStatus: document.querySelector('#build-status'), errors: document.querySelector('#build-errors'),
  disassemblySplitter: document.querySelector('#disassembly-splitter'),
  disassemblyPanel: document.querySelector('#disassembly-panel'), disassembly: document.querySelector('#disassembly'),
  machineStatus: document.querySelector('#machine-status'), screenText: document.querySelector('#screen-text'),
  debug: document.querySelector('#debug'), continue: document.querySelector('#debug-continue'),
  stepOver: document.querySelector('#debug-step-over'), stepInto: document.querySelector('#debug-step-into'),
  stepInstruction: document.querySelector('#debug-step-instruction'), restart: document.querySelector('#debug-restart'),
  stopDebug: document.querySelector('#debug-stop'), debugPanel: document.querySelector('#debug-panel'),
  sectionRegisters: document.querySelector('#section-registers'),
  sectionBreakpoints: document.querySelector('#section-breakpoints'),
  registers: document.querySelector('#registers'), breakpointCount: document.querySelector('#breakpoint-count'),
  breakpointList: document.querySelector('#breakpoint-list'),
};
const language = new Compartment();
const readOnly = new Compartment();
const projectFS = new IndexedDbProjectFS();
const engine = createWebNP2(document.querySelector('#screen'));
const debugController = createDebugger(engine);
let loadingDocument = false;
let tabs = [];
let activeTabId;
let nextTabId = 1;
let debugTabId;
let confirmTabClose = (message) => window.confirm(message);
let freeDos;
let runSequence = 0;
let driveErrorRetries = 0;
let driveRemounts = 0;
let booted;
let resolvePrewarm;
let rejectPrewarm;
const prewarm = new Promise((resolve, reject) => {
  resolvePrewarm = resolve;
  rejectPrewarm = reject;
});
// readyより前から公開するが、利用者がawaitするまでの未処理rejectionは発生させない。
prewarm.catch(() => {});
let session;
let disassemblyView;
let directoryFS;
let directoryListing;
let panesSwapped = false;
let maximizedPane = null;
let sidebarVisible = false;
let sidebarPreference = null;
let sidebarView = 'explorer';
let lastShortcut = null;
let debugToolbarOffset = 0;
let debugToolbarOffsetY = 0;
const PANES_SWAPPED_KEY = 'pc98dev:panes-swapped';
const SIDEBAR_KEY = 'pc98dev:sidebar';
const SIDEBAR_VIEW_KEY = 'pc98dev:sidebar-view';
const SPLIT_EDITOR_KEY = 'pc98dev:split-editor';
const SPLIT_DISASSEMBLY_KEY = 'pc98dev:split-disassembly';
const DEBUG_TOOLBAR_KEY = 'pc98dev:debug-toolbar-x';
const DEBUG_TOOLBAR_Y_KEY = 'pc98dev:debug-toolbar-y';
// 画面幅が狭い環境ではPC-98画面を等倍(640px)まで広げられなくなるため、可動域は絞らない。
// 片側を潰しきってもスプリッタ自体は残るので、いつでも引き戻せる。
const MIN_EDITOR_WIDTH = 0;
const MIN_MACHINE_WIDTH = 0;
const MIN_DISASSEMBLY_HEIGHT = 80;
const MAX_DISASSEMBLY_HEIGHT = 420;
const MIN_SPLIT_EDITOR_HEIGHT = 200;
const DEBUG_SECTION_KEYS = [
  [nodes.sectionRegisters, 'pc98dev:section:registers'],
  [nodes.sectionBreakpoints, 'pc98dev:section:breakpoints'],
];
const GUARDED_KEYBOARD_TARGETS = [
  '.sidebar', '.editor-card', '.debug-panel', '.splitter', '.disassembly-splitter',
];

for (const [section, key] of DEBUG_SECTION_KEYS) {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) section.open = stored === '1';
  } catch {}
  section.addEventListener('toggle', () => {
    try { localStorage.setItem(key, section.open ? '1' : '0'); } catch {}
  });
}

function loadPanesSwapped() {
  try { return localStorage.getItem(PANES_SWAPPED_KEY) === '1'; }
  catch { return false; }
}

function setPanesSwapped(value) {
  panesSwapped = Boolean(value);
  document.body.classList.toggle('panes-swapped', panesSwapped);
  nodes.swapPanes.setAttribute('aria-pressed', String(panesSwapped));
  // ストレージを拒否する環境でも、現在のページ内では配置変更を有効にする。
  try {
    if (panesSwapped) localStorage.setItem(PANES_SWAPPED_KEY, '1');
    else localStorage.removeItem(PANES_SWAPPED_KEY);
  } catch {}
  return panesSwapped;
}

function getPanesSwapped() { return panesSwapped; }

function loadSidebarPreference() {
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    return stored === null ? null : stored === '1';
  } catch { return null; }
}

function setSidebarVisible(value, { persist = true } = {}) {
  sidebarVisible = Boolean(value);
  document.body.classList.toggle('sidebar-hidden', !sidebarVisible);
  if (persist) {
    sidebarPreference = sidebarVisible;
    try { localStorage.setItem(SIDEBAR_KEY, sidebarVisible ? '1' : '0'); } catch {}
  }
  reclampExplicitEditorWidth();
  reclampDebugToolbarOffset();
  return sidebarVisible;
}

function getSidebarVisible() { return sidebarVisible; }

function loadSidebarView() {
  try {
    const stored = localStorage.getItem(SIDEBAR_VIEW_KEY);
    return stored === 'explorer' || stored === 'debug' ? stored : 'explorer';
  } catch { return 'explorer'; }
}

function setSidebarView(view, { persist = true } = {}) {
  if (view !== 'explorer' && view !== 'debug') {
    throw new TypeError('サイドバービューは explorer / debug で指定してください');
  }
  sidebarView = view;
  nodes.viewExplorer.hidden = view !== 'explorer';
  nodes.viewDebug.hidden = view !== 'debug';
  nodes.activityExplorer.setAttribute('aria-selected', String(view === 'explorer'));
  nodes.activityDebug.setAttribute('aria-selected', String(view === 'debug'));
  if (persist) {
    try { localStorage.setItem(SIDEBAR_VIEW_KEY, sidebarView); } catch {}
  }
  return sidebarView;
}

function getSidebarView() { return sidebarView; }

/** 選択中アイコンの再クリックは表示トグル（選択状態は保持）。未選択アイコンはビュー切替＋表示。 */
function handleActivityClick(view) {
  if (sidebarView === view) {
    setSidebarVisible(!sidebarVisible);
    return;
  }
  setSidebarView(view);
  setSidebarVisible(true);
}

const sidebarMedia = window.matchMedia('(max-width: 820px)');
sidebarMedia.addEventListener?.('change', (event) => {
  if (sidebarPreference === null) setSidebarVisible(!event.matches, { persist: false });
});

function setMaximizedPane(pane) {
  if (pane !== 'editor' && pane !== 'machine' && pane !== null) {
    throw new TypeError('最大化対象は editor / machine / null で指定してください');
  }
  maximizedPane = pane;
  document.body.classList.toggle('maximized-editor', pane === 'editor');
  document.body.classList.toggle('maximized-machine', pane === 'machine');
  nodes.maximizeEditor.setAttribute('aria-pressed', String(pane === 'editor'));
  nodes.maximizeMachine.setAttribute('aria-pressed', String(pane === 'machine'));
  if (pane === null) reclampExplicitEditorWidth();
  reclampDebugToolbarOffset();
  return maximizedPane;
}

function getMaximizedPane() { return maximizedPane; }

function activeTab() { return tabs.find((tab) => tab.id === activeTabId); }
function debugTab() { return tabs.find((tab) => tab.id === debugTabId); }
function isTabDirty(tab) { return Boolean(tab && tab.text !== tab.savedText); }

function updateSaveState() {
  const dirty = isTabDirty(activeTab());
  nodes.saveState.textContent = dirty ? '未保存の変更あり' : '保存済み';
  nodes.saveState.classList.toggle('dirty', dirty);
  renderTabs();
}

/**
 * 等倍以上ではドット感を残し、等倍未満へ縮小されるときだけ補間を効かせる。
 * 潰れたドットは文字が読めなくなるため。ゲストが解像度を切り替えるとcanvasの
 * width/height属性自体が変わり、これはResizeObserverでは拾えないのでMutationObserverも要る。
 */
const screenCanvas = document.querySelector('#screen');
function syncScreenScaling() {
  const intrinsic = screenCanvas.width || 640;
  const rendered = screenCanvas.getBoundingClientRect().width;
  const ratio = `${screenCanvas.width} / ${screenCanvas.height}`;
  // 監視対象の寸法を毎回書き戻すとResizeObserverが回り続けるので、変化したときだけ触る。
  if (screenCanvas.style.aspectRatio !== ratio) screenCanvas.style.aspectRatio = ratio;
  const smoothed = rendered > 0 && rendered < intrinsic;
  screenCanvas.classList.toggle('smoothed', smoothed);
  return { intrinsic, rendered, scale: rendered / intrinsic, smoothed };
}
new ResizeObserver(syncScreenScaling).observe(screenCanvas);
new MutationObserver(syncScreenScaling).observe(screenCanvas, {
  attributes: true, attributeFilter: ['width', 'height'],
});
// viewport変化・スプリッタ操作・サイドバー開閉など、.editor-card自体の幅が変わる経路を
// 個別に呼び分けるのではなく、実際の幅変化そのものを監視してフローティングツールバーを再クランプする。
new ResizeObserver(() => reclampDebugToolbarOffset()).observe(nodes.editorCard);

function splitBounds() {
  const gridStyle = getComputedStyle(nodes.workspace);
  const gridWidth = nodes.workspace.getBoundingClientRect().width
    - parseFloat(gridStyle.paddingLeft) - parseFloat(gridStyle.paddingRight);
  const activityWidth = nodes.activityBar.offsetParent === null ? 0 : nodes.activityBar.getBoundingClientRect().width;
  const sidebarWidth = nodes.sidebar.offsetParent === null ? 0 : nodes.sidebar.getBoundingClientRect().width;
  const splitterWidth = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--splitter-col')) || nodes.splitter.getBoundingClientRect().width || 6;
  const gap = parseFloat(gridStyle.columnGap) || 0;
  const trackCount = 3 + (activityWidth > 0 ? 1 : 0) + (sidebarWidth > 0 ? 1 : 0);
  const available = gridWidth - gap * (trackCount - 1);
  return {
    min: MIN_EDITOR_WIDTH,
    max: Math.max(MIN_EDITOR_WIDTH,
      Math.floor(available - activityWidth - sidebarWidth - splitterWidth - MIN_MACHINE_WIDTH)),
  };
}

function reclampExplicitEditorWidth() {
  const explicit = parseFloat(document.documentElement.style.getPropertyValue('--editor-col'));
  if (Number.isFinite(explicit)) setEditorWidth(explicit);
  else syncScreenScaling();
}

function setEditorWidth(px, { persist = true } = {}) {
  if (px === null) {
    document.documentElement.style.removeProperty('--editor-col');
    if (persist) {
      try { localStorage.removeItem(SPLIT_EDITOR_KEY); } catch {}
    }
  } else {
    const requested = Number(px);
    if (!Number.isFinite(requested)) throw new TypeError('エディタ幅は数値または null で指定してください');
    const { min, max } = splitBounds();
    const applied = Math.min(max, Math.max(min, Math.round(requested)));
    document.documentElement.style.setProperty('--editor-col', `${applied}px`);
    if (persist) {
      try { localStorage.setItem(SPLIT_EDITOR_KEY, String(applied)); } catch {}
    }
  }
  // ResizeObserver任せにせず、幅変更と同じターンで補間状態も合わせる。
  const editorWidth = nodes.editorCard.getBoundingClientRect().width;
  syncScreenScaling();
  reclampDebugToolbarOffset();
  return editorWidth;
}

function restoreEditorWidth() {
  try {
    const stored = localStorage.getItem(SPLIT_EDITOR_KEY);
    if (stored === null) return setEditorWidth(null, { persist: false });
    const width = Number(stored);
    if (!Number.isFinite(width)) {
      localStorage.removeItem(SPLIT_EDITOR_KEY);
      return setEditorWidth(null, { persist: false });
    }
    // 現在のviewport・サイドバー状態で可動範囲を再計算し、保存値も正規化する。
    return setEditorWidth(width);
  } catch {
    return setEditorWidth(null, { persist: false });
  }
}

/**
 * フローティングデバッグツールバーの可動範囲・既定位置。
 * タブ列やビルド状況欄に被せても操作の邪魔になるだけなので、.editor-card全体ではなく
 * #editorの矩形の内側だけに収める。left/topは.editor-card(position:relative)の
 * padding edge(border-boxからborder幅を引いた内側)を基準にしたpx値で直接指定する。
 */
function debugToolbarBounds() {
  const cardRect = nodes.editorCard.getBoundingClientRect();
  const cardStyle = getComputedStyle(nodes.editorCard);
  const containingLeft = cardRect.left + parseFloat(cardStyle.borderLeftWidth);
  const containingTop = cardRect.top + parseFloat(cardStyle.borderTopWidth);
  const editorRect = nodes.editor.getBoundingClientRect();
  const toolbarRect = nodes.debugActions.getBoundingClientRect();
  const toolbarWidth = toolbarRect.width || 0;
  const toolbarHeight = toolbarRect.height || 0;
  const editorLeft = editorRect.left - containingLeft;
  const editorTop = editorRect.top - containingTop;
  const halfX = Math.max(0, (editorRect.width - toolbarWidth) / 2);
  // 既定は#editor上端から8px下。上端方向はそこから8px戻ればeditor矩形の上端に達する。
  // 下端方向はeditor矩形の下端(editorTop + editorRect.height)を超えない範囲まで。
  const maxY = Math.max(-8, editorRect.height - toolbarHeight - 8);
  return {
    defaultLeft: editorLeft + halfX,
    defaultTop: editorTop + 8,
    x: { min: -halfX, max: halfX },
    y: { min: -8, max: maxY },
  };
}

function applyDebugToolbarPosition() {
  if (nodes.debugActions.hidden) return;
  const bounds = debugToolbarBounds();
  nodes.debugActions.style.left = `${Math.round(bounds.defaultLeft + debugToolbarOffset)}px`;
  nodes.debugActions.style.top = `${Math.round(bounds.defaultTop + debugToolbarOffsetY)}px`;
}

function setDebugToolbarOffset(px, { persist = true } = {}) {
  if (px === null) {
    debugToolbarOffset = 0;
    if (persist) {
      try { localStorage.removeItem(DEBUG_TOOLBAR_KEY); } catch {}
    }
  } else {
    const requested = Number(px);
    if (!Number.isFinite(requested)) throw new TypeError('デバッグツールバーの水平位置は数値または null で指定してください');
    const { x } = debugToolbarBounds();
    debugToolbarOffset = Math.min(x.max, Math.max(x.min, Math.round(requested)));
    if (persist) {
      try { localStorage.setItem(DEBUG_TOOLBAR_KEY, String(debugToolbarOffset)); } catch {}
    }
  }
  applyDebugToolbarPosition();
  return debugToolbarOffset;
}

function setDebugToolbarOffsetY(px, { persist = true } = {}) {
  if (px === null) {
    debugToolbarOffsetY = 0;
    if (persist) {
      try { localStorage.removeItem(DEBUG_TOOLBAR_Y_KEY); } catch {}
    }
  } else {
    const requested = Number(px);
    if (!Number.isFinite(requested)) throw new TypeError('デバッグツールバーの垂直位置は数値または null で指定してください');
    const { y } = debugToolbarBounds();
    debugToolbarOffsetY = Math.min(y.max, Math.max(y.min, Math.round(requested)));
    if (persist) {
      try { localStorage.setItem(DEBUG_TOOLBAR_Y_KEY, String(debugToolbarOffsetY)); } catch {}
    }
  }
  applyDebugToolbarPosition();
  return debugToolbarOffsetY;
}

/**
 * #editorの矩形が変わりうるすべての操作(スプリッタ・サイドバー開閉・最大化・
 * viewport変化・逆アセンブルパネルの開閉とその高さ調整)のあとに呼ぶ。2軸を必ず
 * 一緒に再クランプする(片方だけ直して他方を取りこぼす事故を構造的に防ぐ)。
 * reclampExplicitEditorWidth()と同じ考え方で、保存済みの論理オフセットを現在の
 * 可動範囲へ当てはめ直すだけで、ユーザーの意図(既定位置からのズレ)は保持する。
 */
function reclampDebugToolbarOffset() {
  setDebugToolbarOffset(debugToolbarOffset, { persist: false });
  setDebugToolbarOffsetY(debugToolbarOffsetY, { persist: false });
}

function restoreDebugToolbarOffset() {
  const restoreAxis = (key, setter) => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return setter(0, { persist: false });
      const offset = Number(stored);
      if (!Number.isFinite(offset)) {
        localStorage.removeItem(key);
        return setter(0, { persist: false });
      }
      return setter(offset);
    } catch {
      return setter(0, { persist: false });
    }
  };
  restoreAxis(DEBUG_TOOLBAR_KEY, setDebugToolbarOffset);
  restoreAxis(DEBUG_TOOLBAR_Y_KEY, setDebugToolbarOffsetY);
}

function getSplit() {
  const bounds = splitBounds();
  const screenWidth = screenCanvas.getBoundingClientRect().width;
  const debugToolbarRect = nodes.debugActions.getBoundingClientRect();
  return {
    editorWidth: nodes.editorCard.getBoundingClientRect().width,
    machineWidth: nodes.machineCard.getBoundingClientRect().width,
    screenWidth,
    screenScale: screenWidth / (screenCanvas.width || 640),
    minEditorWidth: bounds.min,
    maxEditorWidth: bounds.max,
    disassemblyHeight: nodes.disassemblyPanel.getBoundingClientRect().height,
    debugToolbar: {
      floating: getComputedStyle(nodes.debugActions).position === 'absolute',
      offset: debugToolbarOffset,
      offsetY: debugToolbarOffsetY,
      left: debugToolbarRect.left,
      top: debugToolbarRect.top,
      width: debugToolbarRect.width,
    },
  };
}

let disassemblySplitTotal;
function disassemblyBounds() {
  if (!disassemblySplitTotal && nodes.disassemblyPanel.offsetParent !== null) {
    disassemblySplitTotal = nodes.editor.getBoundingClientRect().height
      + nodes.disassemblyPanel.getBoundingClientRect().height;
  }
  return {
    min: MIN_DISASSEMBLY_HEIGHT,
    max: Math.max(MIN_DISASSEMBLY_HEIGHT, Math.min(
      MAX_DISASSEMBLY_HEIGHT,
      (disassemblySplitTotal || MAX_DISASSEMBLY_HEIGHT + MIN_SPLIT_EDITOR_HEIGHT)
        - MIN_SPLIT_EDITOR_HEIGHT,
    )),
  };
}

function setDisassemblyHeight(px, { persist = true } = {}) {
  if (px === null) {
    nodes.editor.style.removeProperty('height');
    nodes.disassemblyPanel.style.removeProperty('height');
    nodes.disassemblyPanel.style.removeProperty('max-height');
    disassemblySplitTotal = undefined;
    if (persist) {
      try { localStorage.removeItem(SPLIT_DISASSEMBLY_KEY); } catch {}
    }
  } else {
    const requested = Number(px);
    if (!Number.isFinite(requested)) throw new TypeError('逆アセンブルの高さは数値または null で指定してください');
    const { min, max } = disassemblyBounds();
    const applied = Math.min(max, Math.max(min, Math.round(requested)));
    nodes.disassemblyPanel.style.height = `${applied}px`;
    nodes.disassemblyPanel.style.maxHeight = 'none';
    if (disassemblySplitTotal) {
      nodes.editor.style.height = `${Math.max(MIN_SPLIT_EDITOR_HEIGHT, disassemblySplitTotal - applied)}px`;
    }
    if (persist) {
      try { localStorage.setItem(SPLIT_DISASSEMBLY_KEY, String(applied)); } catch {}
    }
  }
  // #editorの高さが変わるため、フローティングデバッグツールバーの縦位置も追従させる。
  reclampDebugToolbarOffset();
  return nodes.disassemblyPanel.getBoundingClientRect().height;
}

function restoreDisassemblyHeight() {
  if (nodes.disassemblyPanel.style.height) return;
  try {
    const stored = localStorage.getItem(SPLIT_DISASSEMBLY_KEY);
    if (stored === null) return;
    const height = Number(stored);
    if (!Number.isFinite(height)) {
      localStorage.removeItem(SPLIT_DISASSEMBLY_KEY);
      return;
    }
    setDisassemblyHeight(height, { persist: false });
  } catch {}
}

function editorWidthAtPointer(clientX, drag) {
  const gridRect = nodes.workspace.getBoundingClientRect();
  const gridStyle = getComputedStyle(nodes.workspace);
  const gap = parseFloat(gridStyle.columnGap) || 0;
  const contentLeft = gridRect.left + parseFloat(gridStyle.paddingLeft);
  const contentRight = gridRect.right - parseFloat(gridStyle.paddingRight);
  const activityWidth = nodes.activityBar.offsetParent === null ? 0 : nodes.activityBar.getBoundingClientRect().width;
  const sidebarWidth = nodes.sidebar.offsetParent === null ? 0 : nodes.sidebar.getBoundingClientRect().width;
  const splitterLeft = clientX - drag.pointerOffset;
  if (panesSwapped) {
    return contentRight - splitterLeft - drag.splitterSize - gap;
  }
  const leadingWidth = activityWidth + sidebarWidth
    + (activityWidth > 0 ? gap : 0) + (sidebarWidth > 0 ? gap : 0);
  const editorLeft = contentLeft + leadingWidth;
  return splitterLeft - gap - editorLeft;
}

function installSplitter({ node, axis, decreaseKey, increaseKey, getValue, setValue, valueAtPointer }) {
  let drag;
  const coordinate = (event) => (axis === 'vertical' ? event.clientX : event.clientY);
  const size = (rect) => (axis === 'vertical' ? rect.width : rect.height);
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || node.offsetParent === null) return;
    const rect = node.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startCoordinate: coordinate(event),
      startValue: getValue(),
      value: getValue(),
      pointerOffset: coordinate(event) - (axis === 'vertical' ? rect.left : rect.top),
      splitterSize: size(rect),
    };
    node.setPointerCapture(event.pointerId);
    document.body.classList.add('splitting', `splitting-${axis}`);
    event.preventDefault();
  });
  node.addEventListener('pointermove', (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    const requested = valueAtPointer
      ? valueAtPointer(coordinate(event), drag)
      : drag.startValue - (coordinate(event) - drag.startCoordinate);
    drag.value = setValue(requested, { persist: false });
  });
  const finish = (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    const { pointerId, value } = drag;
    drag = undefined;
    document.body.classList.remove('splitting', `splitting-${axis}`);
    if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    setValue(value);
  };
  node.addEventListener('pointerup', finish);
  node.addEventListener('pointercancel', finish);
  node.addEventListener('dblclick', () => setValue(null));
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Home') {
      event.preventDefault();
      setValue(null);
    } else if (event.key === decreaseKey || event.key === increaseKey) {
      event.preventDefault();
      setValue(getValue() + (event.key === decreaseKey ? -16 : 16));
    }
  });
}

installSplitter({
  node: nodes.splitter, axis: 'vertical', decreaseKey: 'ArrowLeft', increaseKey: 'ArrowRight',
  getValue: () => nodes.editorCard.getBoundingClientRect().width,
  setValue: setEditorWidth,
  valueAtPointer: editorWidthAtPointer,
});
installSplitter({
  node: nodes.disassemblySplitter, axis: 'horizontal',
  decreaseKey: 'ArrowDown', increaseKey: 'ArrowUp',
  getValue: () => nodes.disassemblyPanel.getBoundingClientRect().height,
  setValue: setDisassemblyHeight,
});

/**
 * デバッグツールバーのグリップは水平・垂直の2軸ドラッグ。installSplitter()は1軸専用
 * なので流用せず専用の2軸版を用意するが、pointer capture・キーボード(Home含む)・
 * ドラッグ中クラスの作法はそのまま踏襲する。
 */
function installDebugToolbarGripDrag(node) {
  let drag;
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || node.offsetParent === null) return;
    drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX, startClientY: event.clientY,
      startOffsetX: debugToolbarOffset, startOffsetY: debugToolbarOffsetY,
    };
    node.setPointerCapture(event.pointerId);
    document.body.classList.add('dragging-debug-toolbar');
    event.preventDefault();
  });
  node.addEventListener('pointermove', (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    setDebugToolbarOffset(drag.startOffsetX + (event.clientX - drag.startClientX), { persist: false });
    setDebugToolbarOffsetY(drag.startOffsetY + (event.clientY - drag.startClientY), { persist: false });
  });
  const finish = (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    const { pointerId } = drag;
    drag = undefined;
    document.body.classList.remove('dragging-debug-toolbar');
    if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    setDebugToolbarOffset(debugToolbarOffset);
    setDebugToolbarOffsetY(debugToolbarOffsetY);
  };
  node.addEventListener('pointerup', finish);
  node.addEventListener('pointercancel', finish);
  node.addEventListener('dblclick', () => { setDebugToolbarOffset(null); setDebugToolbarOffsetY(null); });
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Home') {
      event.preventDefault();
      setDebugToolbarOffset(null);
      setDebugToolbarOffsetY(null);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setDebugToolbarOffset(debugToolbarOffset + (event.key === 'ArrowLeft' ? -16 : 16));
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setDebugToolbarOffsetY(debugToolbarOffsetY + (event.key === 'ArrowUp' ? -16 : 16));
    }
  });
}

installDebugToolbarGripDrag(nodes.debugToolbarGrip);

/** TVRAMダンプは常に最新が見えるよう、行が増えたら最下段へ追従させる。 */
function setScreenText(text) {
  const node = nodes.screenText;
  const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
  node.textContent = text;
  if (atBottom) node.scrollTop = node.scrollHeight;
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
  const tab = activeTab();
  editor.dispatch({
    effects: setDebugMarks.of({
      breakpoints: [...(tab?.breakpoints ?? [])].sort((a, b) => a - b),
      currentLine: tab?.id === debugTabId ? currentLine : null,
    }),
  });
}

/**
 * 既定の defaultHighlightStyle は明るい背景向けで、暗背景だと紺や暗赤が沈んで読めない。
 * 配色をVS Codeへ寄せてあるので、トークン色もVS Code Dark+の割り当てに合わせる。
 */
const darkHighlightStyle = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: '#6a9955', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string), tags.character], color: '#ce9178' },
  { tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null], color: '#b5cea8' },
  { tag: [tags.keyword, tags.modifier, tags.self, tags.atom], color: '#569cd6' },
  { tag: [tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: '#c586c0' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], color: '#dcdcaa' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.typeName)], color: '#4ec9b0' },
  { tag: [tags.variableName, tags.propertyName, tags.attributeName], color: '#9cdcfe' },
  { tag: [tags.constant(tags.variableName), tags.standard(tags.variableName)], color: '#4fc1ff' },
  { tag: [tags.meta, tags.processingInstruction, tags.definitionKeyword], color: '#c586c0' },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: '#d4d4d4' },
  { tag: tags.labelName, color: '#dcdcaa' },
  { tag: tags.invalid, color: '#f14c4c' },
]);

const editor = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [
      breakpointGutter,
      readOnly.of([]),
      lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(),
      dropCursor(), EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(),
      rectangularSelection(), crosshairCursor(), highlightActiveLine(), syntaxHighlighting(darkHighlightStyle),
      // アセンブラは「命令のあとにタブでコメント桁を揃える」書き方をするので、Tabは行頭の
      // 字下げ(indentWithTab)ではなくカーソル位置への挿入にする。単位は本物のタブ、桁は8。
      indentUnit.of('\t'), EditorState.tabSize.of(8),
      keymap.of([...defaultKeymap, ...historyKeymap, { key: 'Tab', run: insertTab, shift: indentLess }]),
      lintGutter(), EditorView.lineWrapping,
      language.of([]),
      EditorView.updateListener.of((update) => {
        const tab = activeTab();
        if (!loadingDocument && tab && (update.docChanged || update.selectionSet)) {
          tab.text = update.state.doc.toString();
          tab.cursor = update.state.selection.main.head;
        }
        if (update.docChanged && !loadingDocument && tab) {
          tab.build = undefined;
          tab.debugMap = undefined;
          updateSaveState();
          // 実行中の対象はビルド時のバイト列のままなので、編集で行印が古くなったことを明示する。
          if (session?.isStarted() && tab.id === debugTabId) {
            setDebugStatus('編集後のソースはまだ実行対象ではありません（再ビルドが必要）');
          }
        }
      }),
    ],
  }),
  parent: nodes.editor,
});

function tabName(tab) { return tab.path.split(/[\\/]/).pop() ?? tab.path; }

function makeCloseIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('fill', 'none');
  const first = document.createElementNS(svg.namespaceURI, 'path');
  first.setAttribute('d', 'M7 7l10 10M17 7 7 17');
  svg.append(first);
  return svg;
}

function renderTabs() {
  nodes.tabStrip.replaceChildren(...tabs.map((tab) => {
    const item = document.createElement('div');
    item.className = `tab-item${tab.id === activeTabId ? ' active' : ''}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab';
    button.dataset.tabId = String(tab.id);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.id === activeTabId));
    button.title = `${ORIGIN_LABELS[tab.origin]} / ${tab.path}`;
    button.addEventListener('click', () => activateTab(tab.id));

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = tabName(tab);
    const dirty = document.createElement('span');
    dirty.className = 'tab-dirty';
    dirty.setAttribute('aria-hidden', 'true');
    dirty.textContent = '●';
    dirty.hidden = !isTabDirty(tab);
    button.append(name, dirty);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.dataset.tabId = String(tab.id);
    close.setAttribute('aria-label', `${tabName(tab)} を閉じる`);
    close.disabled = tabs.length === 1;
    close.append(makeCloseIcon());
    close.addEventListener('click', () => {
      closeTab(tab.id).catch((error) => setMachineStatus(error.message, true));
    });
    item.append(button, close);
    return item;
  }));
  syncFileTreeState();
}

function stashActiveTab() {
  const tab = activeTab();
  if (!tab) return;
  tab.text = currentText();
  tab.cursor = editor.state.selection.main.head;
}

function syncFileTreeState() {
  const tab = activeTab();
  for (const entry of nodes.fileTree.querySelectorAll('.file-entry')) {
    const active = Boolean(tab && entry.dataset.origin === tab.origin && entry.dataset.path === tab.path);
    const open = tabs.some((candidate) => (
      candidate.origin === entry.dataset.origin && candidate.path === entry.dataset.path
    ));
    entry.classList.toggle('active', active);
    entry.classList.toggle('open', open);
    entry.setAttribute('aria-selected', String(active));
  }
}

function renderBuildState() {
  const tab = activeTab();
  nodes.buildStatus.classList.toggle('error', Boolean(tab?.errors.length));
  if (tab?.errors.length) nodes.buildStatus.textContent = `${tab.errors.length}件のエラー`;
  else if (tab?.build) nodes.buildStatus.textContent = `${tab.build.dosName}: ${tab.build.output.byteLength} bytes / FAT12 FD生成完了`;
  else nodes.buildStatus.textContent = '.asm / .c を自動判別します';
}

function activateTab(id) {
  const next = tabs.find((tab) => tab.id === Number(id));
  if (!next) return false;
  if (activeTabId !== next.id) {
    stashActiveTab();
    activeTabId = next.id;
    loadingDocument = true;
    try {
      // 本文とカーソルは1つのトランザクションで渡す。分けると、更新中に再入したときに
      // 先の変更が保留されて editor.state が古いままになり、短い文書へ長い方の位置を
      // クランプしてしまう（実測: RangeError: Position 134 is out of range ...）。
      // transaction内のselectionは「変更後の文書」基準なので、次の本文の長さで丸める。
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: next.text },
        selection: { anchor: Math.min(next.cursor ?? 0, next.text.length) },
        effects: language.reconfigure(extensionFor(next.path) === 'c' ? cpp() : []),
      });
    } finally {
      loadingDocument = false;
    }
  }
  applyDiagnostics(next.errors);
  const debugLine = session?.isStarted() && session.isPaused() && next.id === debugTabId
    ? session.currentLine() : null;
  syncDebugMarks(debugLine);
  setCurrentPathLabel();
  syncFileTreeState();
  renderBuildState();
  renderBreakpointList();
  setDebugControls(Boolean(session?.isStarted()));
  updateSaveState();
  return true;
}

async function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === Number(id));
  if (index < 0 || tabs.length === 1) return false;
  if (tabs[index].id === activeTabId) stashActiveTab();
  const tab = tabs[index];
  if (isTabDirty(tab) && !confirmTabClose(`${tabName(tab)} の未保存の変更を破棄しますか？`)) return false;
  if (tab.id === debugTabId && session?.isStarted()) await stopDebug();
  tabs.splice(index, 1);
  if (tab.id === activeTabId) {
    activeTabId = undefined;
    activateTab(tabs[Math.min(index, tabs.length - 1)].id);
  } else {
    renderTabs();
  }
  return true;
}

function setConfirm(fn) {
  if (typeof fn !== 'function') throw new TypeError('確認処理は関数で指定してください');
  confirmTabClose = fn;
}

function getTabs() {
  return tabs.map((tab) => ({
    id: tab.id, origin: tab.origin, path: tab.path, name: tabName(tab),
    dirty: isTabDirty(tab), active: tab.id === activeTabId,
    breakpoints: [...tab.breakpoints].sort((a, b) => a - b),
  }));
}

function getBreakpointList() {
  const tab = activeTab();
  const fileName = tab ? tabName(tab) : '';
  return [...(tab?.breakpoints ?? [])].sort((a, b) => a - b)
    .map((line) => ({ line, label: `${fileName}:${line}` }));
}

function renderBreakpointList() {
  const breakpoints = getBreakpointList();
  nodes.breakpointCount.textContent = String(breakpoints.length);
  if (breakpoints.length === 0) {
    const guide = document.createElement('li');
    guide.className = 'breakpoint-empty';
    guide.textContent = 'BPはエディタ左端のgutterをクリックして設定します';
    nodes.breakpointList.replaceChildren(guide);
    return;
  }
  nodes.breakpointList.replaceChildren(...breakpoints.map(({ line, label }) => {
    const item = document.createElement('li');
    item.dataset.breakpointLine = String(line);

    const indicator = document.createElement('span');
    indicator.className = 'breakpoint-indicator';
    indicator.textContent = '●';
    indicator.setAttribute('aria-hidden', 'true');

    const goTo = document.createElement('button');
    goTo.type = 'button';
    goTo.className = 'breakpoint-goto';
    goTo.textContent = label;
    goTo.addEventListener('click', () => {
      if (line < 1 || line > editor.state.doc.lines) return;
      const sourceLine = editor.state.doc.line(line);
      editor.dispatch({
        selection: { anchor: sourceLine.from },
        effects: EditorView.scrollIntoView(sourceLine.from, { y: 'center' }),
      });
      editor.focus();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'breakpoint-remove';
    remove.title = 'ブレークポイントを削除';
    remove.setAttribute('aria-label', 'ブレークポイントを削除');
    remove.textContent = '×';
    remove.addEventListener('click', () => toggleBreakpoint(line));
    item.append(indicator, goTo, remove);
    return item;
  }));
}

/**
 * 位置は editor.state ではなく「対象の本文」から直接求める。タブ切替の最中は
 * 本文差し替えのトランザクションがまだ反映されておらず、editor.state が前のタブの
 * 長い文書のままになることがあり、短い文書へ範囲外の位置を渡してしまう
 * （実測: RangeError: Position 134 is out of range for changeset of length 83）。
 */
/**
 * lint表示の位置は「反映が終わったあとの文書」から求める。タブ切替では本文差し替えの
 * トランザクションが保留されることがあり、その最中に計算すると別の文書を基準にしてしまい
 * 範囲外になる（実測: RangeError: Position 134 is out of range for changeset of length 83）。
 * そこでCodeMirrorへの反映だけmicrotaskへ遅らせ、そのとき現に開いている文書で位置を出す。
 */
function applyDiagnostics(errors = []) {
  const tabId = activeTabId;
  queueMicrotask(() => {
    if (activeTabId !== tabId) return;
    const { doc } = editor.state;
    const diagnostics = errors.filter((error) => Number.isInteger(error.line) && error.line > 0).map((error) => {
      const line = doc.line(Math.min(error.line, doc.lines));
      const column = Math.max(0, (error.column ?? 1) - 1);
      const from = Math.min(line.to, line.from + column);
      return { from, to: Math.max(from, line.to), severity: 'error', message: error.message, source: error.stage };
    });
    editor.dispatch(setDiagnostics(editor.state, diagnostics));
  });
  nodes.errors.replaceChildren(...errors.map((error) => {
    const item = document.createElement('li');
    item.dataset.errorLine = String(error.line ?? 0);
    item.textContent = `${error.stage ?? 'build'}${error.line > 0 ? `:${error.line}` : ''}: ${error.message}`;
    return item;
  }));
}

function clearDiagnostics() {
  const tab = activeTab();
  if (tab) tab.errors = [];
  applyDiagnostics([]);
}

function showErrors(errors) {
  const tab = activeTab();
  if (tab) tab.errors = errors;
  applyDiagnostics(errors);
}

const ORIGIN_LABELS = { sample: 'サンプル', project: 'IndexedDB', directory: 'フォルダ' };

/** 書き込み先は「フォルダを繋いでいればフォルダ、でなければIndexedDB」。両者を同期はしない。 */
function writableOrigin() { return directoryFS ? 'directory' : 'project'; }
function backendFor(origin) { return origin === 'directory' ? directoryFS : projectFS; }

async function refreshFileTree() {
  const makeGroup = (label, files, origin) => {
    if (files.length === 0) return null;
    const group = document.createElement('div');
    group.className = 'file-group';
    group.setAttribute('role', 'group');
    const heading = document.createElement('div');
    heading.className = 'file-group-heading';
    heading.textContent = label;
    group.append(heading);
    for (const file of files) {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'file-entry';
      entry.setAttribute('role', 'treeitem');
      entry.dataset.origin = origin;
      entry.dataset.path = file.path;
      entry.title = `${ORIGIN_LABELS[origin]} / ${file.path}`;
      entry.textContent = file.path;
      entry.addEventListener('click', () => {
        openFile(origin, file.path).catch((error) => setMachineStatus(error.message, true));
      });
      group.append(entry);
    }
    return group;
  };
  const groups = [];
  if (directoryFS) {
    const listing = await directoryFS.listDetailed();
    directoryListing = listing;
    const notes = [`${listing.files.length}件`];
    if (listing.skipped > 0) notes.push(`対象外${listing.skipped}件`);
    if (listing.truncated) notes.push('上限で打切り');
    groups.push(makeGroup(`フォルダ ${directoryFS.name}（${notes.join(' / ')}）`, listing.files, 'directory'));
  }
  groups.push(makeGroup('IndexedDB プロジェクト', await projectFS.list(), 'project'));
  groups.push(makeGroup('同梱サンプル', SAMPLE_FILES, 'sample'));
  nodes.fileTree.replaceChildren(...groups.filter(Boolean));
  syncFileTreeState();
}

async function openFile(origin, path) {
  const opened = tabs.find((tab) => tab.origin === origin && tab.path === path);
  if (opened) {
    activateTab(opened.id);
    return;
  }
  let content;
  let encoding = 'utf-8';
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
    encoding = record.encoding ?? 'utf-8';
  }
  const tab = {
    id: nextTabId++, origin, path, encoding, text: content, savedText: content,
    breakpoints: new Set(), build: undefined, debugMap: undefined, cursor: 0, errors: [],
  };
  tabs.push(tab);
  activateTab(tab.id);
  await refreshFileTree();
}

function setCurrentPathLabel() {
  const tab = activeTab();
  if (!tab) { nodes.currentPath.textContent = ''; return; }
  const encoding = tab.encoding === 'utf-8' ? '' : `（${tab.encoding}）`;
  nodes.currentPath.textContent = `${ORIGIN_LABELS[tab.origin]} / ${tab.path}${encoding}`;
}

async function saveFile() {
  const tab = activeTab();
  if (!tab) throw new Error('保存対象がありません');
  tab.text = currentText();
  // サンプルは読み取り専用なので、保存すると書き込み可能なバックエンドへ複製される。
  const target = tab.origin === 'sample' ? writableOrigin() : tab.origin;
  await backendFor(target).write(tab.path, tab.text);
  tab.origin = target;
  tab.encoding = 'utf-8';
  tab.savedText = tab.text;
  renderTabs();
  if (activeTabId === tab.id) {
    updateSaveState();
    setCurrentPathLabel();
    await refreshFileTree();
  } else {
    await refreshFileTree();
  }
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
  const tab = activeTab();
  if (!tab) throw new Error('ビルド対象がありません');
  nodes.build.disabled = true; nodes.run.disabled = true; nodes.debug.disabled = true;
  nodes.buildStatus.textContent = `${tab.path} をビルド中…`; nodes.buildStatus.classList.remove('error');
  setMachineStatus(`${tab.path} をビルド中です`);
  clearDiagnostics();
  try {
    await saveFile();
    const result = await buildSource(tab.path, tab.text);
    if (!result.ok) {
      tab.errors = result.errors;
      if (activeTabId === tab.id) {
        showErrors(result.errors);
        nodes.buildStatus.textContent = `${result.errors.length}件のエラー`;
        nodes.buildStatus.classList.add('error');
      }
      setMachineStatus(`ビルドに失敗しました（${result.errors.length}件）`, true);
      tab.build = undefined;
      tab.debugMap = undefined;
      return result;
    }
    tab.build = result;
    // 行マップはビルド時点で確定させる。どの行にBPを張れるかを実行前に答えられるようにする。
    tab.debugMap = debugMapForBuild(result);
    renderTabs();
    if (activeTabId === tab.id) {
      syncDebugMarks(session?.isStarted() && tab.id === debugTabId ? session.currentLine() : null);
      nodes.buildStatus.textContent = `${result.dosName}: ${result.output.byteLength} bytes / FAT12 FD生成完了`;
    }
    setMachineStatus('ビルド完了。実行できます');
    return result;
  } finally {
    nodes.build.disabled = false; nodes.run.disabled = false; nodes.debug.disabled = false;
  }
}

/**
 * コアはページごとに1回しか起動できないため、FreeDOSは1度だけ起動し、
 * 以後はビルドのたびにB:のFDだけ差し替える。ビルド→実行→デバッグを何度でも繰り返せる。
 */
/**
 * 短い待ちは通常経路の最適化にすぎない。正しさはDOS画面のエラー検出と、
 * Rで直らない場合に排出からメディア交換をやり直す二段の自己回復で担保する。
 */
const settle = (ms) => new Promise((resolveSettle) => { setTimeout(resolveSettle, ms); });

function recordDriveErrorRetries(count) {
  const added = Number.isInteger(count) && count > 0 ? count : 0;
  if (added === 0) return false;
  driveErrorRetries += added;
  setMachineStatus(`ディスクの認識を再試行しました（${driveErrorRetries}回）`);
  return true;
}

function startBoot(programFd, programName, programKey) {
  setMachineStatus('エミュレータを起動しています…');
  let tracked;
  tracked = bootFreeDos(engine, {
    freeDos, freeDosKey: 'workbench:freedos', programFd, programName, programKey,
    onScreen: (screen) => { setScreenText(screen.text); },
  }).then((screen) => {
    if (!recordDriveErrorRetries(screen.driveErrorRetries)) {
      setMachineStatus('エミュレータ起動しました。実行の準備ができています');
    }
    return screen;
  }).catch((error) => {
    if (booted === tracked) booted = undefined;
    setMachineStatus(`エミュレータの起動に失敗しました: ${error.message}`, true);
    throw error;
  });
  booted = tracked;
  return tracked;
}

function startPrewarm() {
  setMachineStatus('エミュレータを起動しています…');
  const attempt = makeLoaderOnlyFd().then((fd) => (
    startBoot(fd, 'loader-only.xdf', 'workbench:loader-only')
  )).catch((error) => {
    setMachineStatus(`エミュレータの起動に失敗しました: ${error.message}`, true);
    throw error;
  });
  attempt.then(resolvePrewarm, rejectPrewarm);
  return attempt;
}

async function mountProgramFd(built) {
  const name = `${built.dosName}.xdf`;
  const key = `workbench:${built.dosName}:${runSequence++}`;
  if (!booted) {
    // 初回はB:へFDを入れた状態で起動する。空のB:で起動するとDOSがドライブ未準備を覚えてしまう。
    return { baseline: await startBoot(built.fd, name, key), name, key };
  }
  try { await booted; } catch {}
  // プリウォーム失敗後の最初の操作は、対象入りFDでブートそのものを再試行する。
  if (!booted) return { baseline: await startBoot(built.fd, name, key), name, key };
  // drive=2 は fd2 スロット、すなわち B:。1 を渡すと FreeDOS 側の A: を差し替えてしまう。
  // 挿入だけだとDOSがFATキャッシュを持ち越して「ドライブの準備ができていません」になるため、
  // 排出してからメディア交換として挿入する。
  // 排出と挿入の間はゲストを走らせたまま待つ必要がある。CPUを止めて交換するとゲストが
  // 「ディスクが無い」中間状態を一度も観測せず、交換に気付かないまま古いFATを使う（実測で失敗）。
  // 連続実行の区切りは、**メディア交換より前**に入れる。交換直後はDOSがドライブを
  // 読めない瞬間があり、そこへキーを送ると入力がドライブエラーの選択待ちへ吸われて
  // 再試行が空回りする（実測で再試行が上限に達した）。ディスクが安定している間に済ませる。
  const beforeSeparator = engine.getScreenText();
  let screen = beforeSeparator;
  try {
    // 先頭のESCで入力行を捨てる。ドライブエラーの応答(R/A)は、送る直前にダイアログが
    // 自力で消えていると**コマンド行へ打ち込まれてしまう**（実測: `A:\>RRRAB:\E0LOAD …`
    // となり次のコマンドが壊れた）。取りこぼした文字を必ず流してからコマンドを組み立てる。
    await engine.pasteText('\r\r\r');
    screen = await waitForCurrentDosPrompt(engine, { baseline: beforeSeparator.text, timeout: 30_000 });
    setScreenText(screen.text);
  } catch (error) {
    // 区切り行は見た目だけの処理なので、ここでの失敗でマウント自体を止めない。
    // 前の操作のドライブエラーが残っていれば中止で抜けて、交換のやり直しへ進む。
    if (DOS_DRIVE_ERROR_PATTERN.test(engine.getScreenText().text)) await answerDriveErrorAbort(engine);
    screen = engine.getScreenText();
  }

  setMachineStatus('作業用ディスクを挿入しています…');
  await swapProgramFd(built, name, key);
  return { baseline: screen, name, key };
}

async function swapProgramFd(built, name, key) {
  // insertFd がコア側の挿入遅延(20フレーム=約0.4秒)明けまで待って返すようになったので、
  // ホスト側の排出も実時間の待ちも要らない。挿入遅延はエミュレートフレーム基準なので、
  // setTimeout で待っても足りる保証が無かった（それが差し替えが不安定だった原因）。
  await engine.insertFd(2, { name, bytes: built.fd }, key);
}

async function abortDriveError() {
  // 中止は1回だけ送り、ダイアログが実際に消えるのを確認してから次へ進む。
  // 消えたかを見ずに送り足すと、余ったキーがコマンド行へ流れて次のコマンドを壊す。
  if (!DOS_DRIVE_ERROR_PATTERN.test(engine.getScreenText().text)) return false;
  await answerDriveErrorAbort(engine);
  const limit = Date.now() + 5_000;
  while (Date.now() < limit) {
    await settle(100);
    if (!DOS_DRIVE_ERROR_PATTERN.test(engine.getScreenText().text)) return true;
  }
  return false;
}

async function withDriveRecovery(operation, built, name) {
  for (let remount = 0; ; remount++) {
    try {
      return await operation();
    } catch (error) {
      recordDriveErrorRetries(error.driveErrorRetries);
      if (error.code !== 'DOS_DRIVE_ERROR' || remount >= 2) throw error;
      await abortDriveError();
      driveRemounts++;
      setMachineStatus(`ディスクを入れ直しています…（${remount + 1}回目）`);
      await swapProgramFd(built, name, `workbench:${built.dosName}:${runSequence++}`);
    }
  }
}

async function runCurrent() {
  const built = activeTab()?.build ?? await buildCurrent();
  if (!built?.ok) return built;
  if (session?.isStarted()) await stopDebug();
  const mounted = await mountProgramFd(built);
  const screen = await withDriveRecovery(async () => {
    const baseline = engine.getScreenText();
    setMachineStatus(`${built.dosName}を実行中…`);
    await engine.pasteText(`B:\\${built.dosName}\r`);
    return waitForCurrentDosPrompt(engine, { baseline: baseline.text, timeout: 60_000 });
  }, built, mounted.name);
  setScreenText(screen.text);
  if (!recordDriveErrorRetries(screen.driveErrorRetries)) {
    setMachineStatus(`${built.dosName} 終了・DOSプロンプト復帰`);
  }
  return { ...built, screen };
}

async function waitForPrompt(baseline) {
  const screen = await waitForCurrentDosPrompt(engine, { baseline, timeout: 60_000 });
  recordDriveErrorRetries(screen.driveErrorRetries);
  return screen;
}

const HEX = (value, width) => (value >>> 0).toString(16).toUpperCase().padStart(width, '0');

function setMachineStatus(message, error = false) {
  nodes.machineStatus.textContent = message;
  nodes.machineStatus.classList.toggle('error', error);
}

const setDebugStatus = setMachineStatus;

/**
 * contentEditableを保ったまま利用者入力だけを止め、BP gutter、プログラム的な差し替え、
 * contentEditableを測る既存レイアウト検証をいずれも有効なままにする。
 */
function setEditorReadOnly(value) {
  const locked = Boolean(value);
  if (editor.state.readOnly === locked) return;
  editor.dispatch({ effects: readOnly.reconfigure(locked ? EditorState.readOnly.of(true) : []) });
}

function setDebugControls(active) {
  const targetActive = active && activeTabId === debugTabId;
  // インフローの.editor-toolbar(#build-actionsのみ)はデバッグ中まるごと隠す。
  // #debug-actionsは既にフローティング(.editor-cardの直接の子)なので道連れにならない。
  nodes.editorToolbar.hidden = active;
  nodes.buildActions.hidden = active;
  nodes.debugActions.hidden = !active;
  if (active) reclampDebugToolbarOffset();
  nodes.debugPanel.hidden = !active;
  nodes.debugEmpty.hidden = active;
  nodes.disassemblySplitter.hidden = !active;
  nodes.disassemblyPanel.hidden = !active;
  if (active) restoreDisassemblyHeight();
  nodes.editLock.hidden = !targetActive;
  document.body.classList.toggle('debugging', active);
  setEditorReadOnly(targetActive);
  const paused = active && session?.isPaused();
  nodes.continue.disabled = !paused;
  nodes.stepOver.disabled = !paused;
  nodes.stepInto.disabled = !paused;
  nodes.stepInstruction.disabled = !paused;
  nodes.restart.disabled = !active || !activeTab()?.build;
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
  disassemblyView.update({
    seg: regs.cs,
    eip: regs.eip,
    lines: debugController.disassemble(regs.cs, regs.eip, 12),
    breakpoints: new Set(),
  });
  const line = session.currentLine();
  syncDebugMarks(line);
  setScreenText(engine.getScreenText().text);
  setDebugControls(true);
  return { regs, line };
}

/** BP行の集合を1つの真実として持ち、セッション中は即座にハードウェアBPへ反映する。 */
function toggleBreakpoint(line) {
  const tab = activeTab();
  if (!tab) return false;
  const previous = new Set(tab.breakpoints);
  const adding = !tab.breakpoints.has(line);
  if (adding && tab.debugMap && !tab.debugMap.isDebuggable(line)) {
    setDebugStatus(`${line}行には生成アドレスがないためBPを張れません`, true);
    renderBreakpointList();
    return false;
  }
  if (adding) tab.breakpoints.add(line); else tab.breakpoints.delete(line);
  if (session?.isStarted() && tab.id === debugTabId) {
    try {
      session.setBreakpointLines([...tab.breakpoints]);
    } catch (error) {
      tab.breakpoints.clear();
      for (const kept of previous) tab.breakpoints.add(kept);
      session.setBreakpointLines([...tab.breakpoints]);
      setDebugStatus(error.message, true);
      syncDebugMarks(session.currentLine());
      renderBreakpointList();
      return false;
    }
  }
  syncDebugMarks(session?.isStarted() && tab.id === debugTabId ? session.currentLine() : null);
  setDebugControls(Boolean(session?.isStarted()));
  renderBreakpointList();
  renderTabs();
  return true;
}

async function startDebug() {
  const tab = activeTab();
  const built = tab?.build ?? await buildCurrent();
  if (!built?.ok) return built;
  if (!tab?.debugMap) throw new Error('行マップを生成できませんでした');
  if (session?.isStarted()) await stopDebug();
  if (!disassemblyView) {
    disassemblyView = mountDisassemblyView(nodes.disassembly, {
      addBreakpointLabel: 'ブレークポイントを追加',
      removeBreakpointLabel: 'ブレークポイントを解除',
      onToggleBreakpoint: () => {},
    });
  }
  nodes.debugPanel.hidden = false;
  nodes.debugEmpty.hidden = true;
  setSidebarView('debug');
  setSidebarVisible(true);
  setDebugStatus('FreeDOSとデバッガローダを準備中…');
  const mounted = await mountProgramFd(built);
  session = createDebugSession(debugController);
  const started = await withDriveRecovery(() => session.start(
    engine, `B:\\${LOADER_NAME} B:\\${built.dosName}`, tab.debugMap, built.kind,
  ), built, mounted.name);
  debugTabId = tab.id;
  const recoveredDriveError = recordDriveErrorRetries(started.driveErrorRetries);
  const unmapped = [...tab.breakpoints].filter((line) => !tab.debugMap.isDebuggable(line));
  if (unmapped.length > 0) {
    // 張れないBPを黙って捨てると「効かないBP」になるため、外した行を明示してから続行する。
    for (const line of unmapped) tab.breakpoints.delete(line);
    setDebugStatus(`生成アドレスのない ${unmapped.join(', ')} 行のBPを解除しました`, true);
  }
  session.setBreakpointLines([...tab.breakpoints]);
  const view = refreshDebugViews();
  if (started.noDebuggableLines) {
    // 生成行が1つも無いビルドでは最初の生成行まで進めようがないため、黙って素のエントリで
    // 止めたままにせず、その旨を状況表示へ出す。
    setDebugStatus(
      `${built.dosName} に生成行が無いため素のエントリで停止しました CS:IP=`
      + `${HEX(started.control.cs, 4)}:${HEX(started.control.ip, 4)}`,
      true,
    );
  } else if (unmapped.length === 0 && !recoveredDriveError) {
    setDebugStatus(`${built.dosName} エントリ停止 CS:IP=${HEX(started.control.cs, 4)}:${HEX(started.control.ip, 4)}`);
  }
  renderBreakpointList();
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

function stepInto() {
  const result = requireSession().stepInto();
  refreshDebugViews();
  if (!result.entered && !result.steppedOverCall && result.line !== result.expectedLine) {
    throw new Error(`次行が不一致です: expected=${result.expectedLine}, actual=${result.line}`);
  }
  if (result.entered) setDebugStatus(`呼び先の ${result.line} 行へ入りました`);
  else if (result.steppedOverCall) setDebugStatus(`行情報の無い呼び先を抜けて ${result.line} 行へ進みました`);
  else setDebugStatus(`次のソース ${result.line} 行へ進みました`);
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

/** 対象の終了後、ローダ自身が終了コードを返す直前の診断値を取得する。 */
function runTargetToLoaderExit() {
  const diagnostic = requireSession().runToLoaderExit();
  const { registers, loaderControl } = diagnostic;
  refreshDebugViews();
  return {
    registers,
    loaderControl,
    screen: engine.getScreenText(),
    disassembly: debugController.disassemble(registers.cs, registers.eip, 4),
    waitDisassembly: debugController.disassemble(loaderControl.loaderPsp, loaderControl.waitIp, 2),
  };
}

/** BPが無ければ停止を解除し、通常の「続行」と同じくプログラム終了まで走らせる。 */
async function continueOrRun() {
  if ((debugTab()?.breakpoints.size ?? 0) > 0) return continueToBreakpoint();
  return stopDebug();
}

/** BPを外して通常実行へ戻す。プログラム終了後のDOSプロンプト復帰まで待つ。 */
async function stopDebug() {
  requireSession().detach();
  session = undefined;
  debugTabId = undefined;
  syncDebugMarks(null);
  setDebugControls(false);
  // 停止していないCPUのレジスタを表示し続けると嘘になるので、復帰と同時に消す。
  nodes.registers.replaceChildren();
  renderBreakpointList();
  setMachineStatus('通常実行中…');
  const screen = await waitForCurrentDosPrompt(engine, { timeout: 60_000 });
  setScreenText(screen.text);
  if (!recordDriveErrorRetries(screen.driveErrorRetries)) {
    setMachineStatus('実行終了・DOSプロンプト復帰');
  }
  return screen;
}

function setDirectoryLabel(message) {
  nodes.folderState.textContent = message;
  nodes.folderDisconnect.hidden = !directoryFS;
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
  await refreshFileTree();
  return { name: directoryFS.name, permission, ...listing };
}

async function disconnectDirectory() {
  directoryFS = undefined;
  directoryListing = undefined;
  await clearDirectoryHandle().catch(() => {});
  setDirectoryLabel('フォルダ未接続');
  // 開いていたのがフォルダのファイルなら、参照先を失うので同梱サンプルへ戻す。
  if (activeTab()?.origin === 'directory') await openFile('sample', 'samples/hello.asm');
  else await refreshFileTree();
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
  nodes.folderOpen.dataset.restoreHandle = 'true';
}

async function openFolder() {
  const stored = nodes.folderOpen.dataset.restoreHandle === 'true' ? await loadDirectoryHandle() : null;
  delete nodes.folderOpen.dataset.restoreHandle;
  return connectDirectory(stored ?? await pickDirectory());
}

async function initialize() {
  setSidebarView(loadSidebarView(), { persist: false });
  sidebarPreference = loadSidebarPreference();
  setSidebarVisible(sidebarPreference ?? !sidebarMedia.matches, { persist: false });
  setPanesSwapped(loadPanesSwapped());
  restoreEditorWidth();
  restoreDebugToolbarOffset();
  await projectFS.open();
  const response = await fetch('./freedos/fd98_2hd.xdf');
  if (!response.ok) throw new Error(`FreeDOS: HTTP ${response.status}`);
  freeDos = new Uint8Array(await response.arrayBuffer());
  // ローダだけのB:を入れて起動を始めるが、エディタ初期化は完了を待たずに進める。
  startPrewarm();
  // フォルダ復元に失敗しても、同梱サンプルだけで動く状態までは必ず立ち上げる。
  await restoreDirectory().catch((error) => setDirectoryLabel(`フォルダ復元に失敗: ${error.message}`));
  await refreshFileTree();
  await openFile('sample', 'samples/hello.asm');
  nodes.buildStatus.textContent = '準備完了';
}

nodes.newFile.addEventListener('click', () => createFile(nodes.newPath.value).catch((error) => showErrors([{ stage: 'input', line: 0, message: error.message }])));
nodes.save.addEventListener('click', () => saveFile().catch((error) => showErrors([{ stage: 'save', line: 0, message: error.message }])));
nodes.folderOpen.addEventListener('click', () => openFolder().catch((error) => setDirectoryLabel(error.message)));
nodes.folderDisconnect.addEventListener('click', () => disconnectDirectory().catch((error) => setDirectoryLabel(error.message)));
nodes.activityExplorer.addEventListener('click', () => handleActivityClick('explorer'));
nodes.activityDebug.addEventListener('click', () => handleActivityClick('debug'));
nodes.swapPanes.addEventListener('click', () => setPanesSwapped(!panesSwapped));
nodes.maximizeEditor.addEventListener('click', () => setMaximizedPane(maximizedPane === 'editor' ? null : 'editor'));
nodes.maximizeMachine.addEventListener('click', () => setMaximizedPane(maximizedPane === 'machine' ? null : 'machine'));
nodes.build.addEventListener('click', () => buildCurrent());
nodes.run.addEventListener('click', () => runCurrent());
nodes.debug.addEventListener('click', () => startDebug().catch((error) => setDebugStatus(error.message, true)));
nodes.continue.addEventListener('click', () => continueOrRun().catch((error) => setDebugStatus(error.message, true)));
nodes.stepOver.addEventListener('click', () => { try { stepOverLine(); } catch (error) { setDebugStatus(error.message, true); } });
nodes.stepInto.addEventListener('click', () => { try { stepInto(); } catch (error) { setDebugStatus(error.message, true); } });
nodes.stepInstruction.addEventListener('click', () => { try { stepInstruction(); } catch (error) { setDebugStatus(error.message, true); } });
nodes.restart.addEventListener('click', () => startDebug().catch((error) => setDebugStatus(error.message, true)));
nodes.stopDebug.addEventListener('click', () => stopDebug().catch((error) => setDebugStatus(error.message, true)));

function handleDebugShortcut(event) {
  if (!session?.isStarted()) return;
  const actions = {
    F5: ['continue', continueOrRun],
    F10: ['step-over', stepOverLine],
    F11: ['step-into', stepInto],
  };
  const selected = actions[event.key];
  if (!selected) return;
  event.preventDefault();
  lastShortcut = selected[0];
  Promise.resolve().then(selected[1]).catch((error) => setDebugStatus(error.message, true));
  return true;
}

for (const selector of GUARDED_KEYBOARD_TARGETS) {
  const node = document.querySelector(selector);
  for (const type of ['keydown', 'keypress', 'keyup']) {
    node.addEventListener(type, (event) => {
      if (type === 'keydown') handleDebugShortcut(event);
      /**
       * SDL2がdocumentでpreventDefaultする前にbubble段で止める。capture段で止めると
       * CodeMirrorやフォーム自身にも届かない。処理済みショートカットもdocumentへ渡さず二重発火を防ぐ。
       */
      event.stopPropagation();
    });
  }
}

// canvasやbodyにフォーカスがある場合も同じショートカット処理へ到達させる。
document.addEventListener('keydown', (event) => {
  handleDebugShortcut(event);
});

const ready = initialize();
ready.catch((error) => {
  nodes.buildStatus.textContent = error.message; nodes.buildStatus.classList.add('error');
  setMachineStatus(error.message, true);
  rejectPrewarm(error);
});
window.pc98workbench = {
  prewarm,
  ready, openFile, createFile, saveFile, buildCurrent, runCurrent,
  getTabs, activateTab, closeTab, setConfirm,
  startDebug, stopDebug, toggleBreakpoint, stepInstruction, stepOverLine, stepInto,
  continueToBreakpoint, continueOrRun, setPanesSwapped, getPanesSwapped,
  setMaximizedPane, getMaximizedPane,
  setSidebarVisible, getSidebarVisible,
  setSidebarView, getSidebarView,
  setEditorWidth, setDisassemblyHeight, getSplit, setDebugToolbarOffset, setDebugToolbarOffsetY,
  getLastShortcut: () => lastShortcut,
  getScreenScaling: syncScreenScaling,
  getGuardedKeyboardTargets: () => [...GUARDED_KEYBOARD_TARGETS],
  getDebugState: () => ({
    started: Boolean(session?.isStarted()), paused: Boolean(session?.isPaused()),
    kind: activeTab()?.debugMap?.kind ?? null,
    breakpoints: [...(activeTab()?.breakpoints ?? [])].sort((a, b) => a - b),
    currentLine: session?.isStarted() ? session.currentLine() : null,
    control: session?.control ?? null, debuggableLines: activeTab()?.debugMap?.debuggableLines() ?? [],
  }),
  getRegisters: () => (session?.isStarted() ? session.registers() : undefined),
  getBreakpointList,
  getCursorLine: () => editor.state.doc.lineAt(editor.state.selection.main.head).number,
  getMachineStatus: () => nodes.machineStatus.textContent,
  getToolbarMode: () => (nodes.debugActions.hidden ? 'build' : 'debug'),
  getDriveErrorRetries: () => driveErrorRetries,
  getDriveRemounts: () => driveRemounts,
  getBuiltOutput: () => (activeTab()?.build?.output ? Array.from(activeTab().build.output) : null),
  readGuestMemory: (address, length) => Array.from(debugController.readMemory(address, length)),
  disassembleAt: (segment, offset, count) => debugController.disassemble(segment, offset, count),
  getLoaderControl: () => {
    if (!session?.isStarted()) return null;
    const { address } = session.control;
    return { ...parseLoaderControl(debugController.readMemory(address, CONTROL.size), 0), address };
  },
  runTargetToLoaderExit,
  pasteDosCommand: (command) => engine.pasteText(`${command}\r`),
  waitForPrompt,
  isCpuPaused: () => engine.dbgIsPaused(),
  engine,
  setValue: (text) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } }),
  getValue: currentText,
  /** 実キー入力の検証で、押す前のカーソル位置を確定させるために使う。 */
  setCursorToLineEnd: (lineNumber) => {
    const line = editor.state.doc.line(lineNumber);
    editor.focus();
    editor.dispatch({ selection: { anchor: line.to } });
  },
  getState: () => {
    const tab = activeTab();
    return {
      currentPath: tab?.path, currentOrigin: tab?.origin, dirty: isTabDirty(tab),
      errors: tab?.errors ?? [], built: tab?.build?.dosName ?? null,
    };
  },
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
    sidebarView: getSidebarView(),
    disassemblyVisible: !nodes.disassemblyPanel.hidden,
    disassemblyRows: nodes.disassembly.querySelectorAll('[data-debugger-disasm-row="true"]').length,
    readOnly: editor.state.readOnly,
  }),
  isEditorReadOnly: () => editor.state.readOnly,
};
