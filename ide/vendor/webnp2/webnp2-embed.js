var Tt = Object.defineProperty;
var Rt = (e, s, t) => s in e ? Tt(e, s, { enumerable: !0, configurable: !0, writable: !0, value: t }) : e[s] = t;
var g = (e, s, t) => Rt(e, typeof s != "symbol" ? s + "" : s, t);
function U(e) {
  return e.buffer instanceof ArrayBuffer && e.byteOffset === 0 && e.byteLength === e.buffer.byteLength ? e.buffer : new Uint8Array(e).buffer;
}
const Ft = "6011519-dirty";
function Ct(e) {
  switch (e) {
    case "ro":
      return 1;
    case "rw":
      return 3;
    case "rwd":
      return 7;
  }
}
function Ee() {
  var e;
  return ((e = window.Module) == null ? void 0 : e.FS) ?? window.FS;
}
function $t() {
  var e;
  return ((e = window.Module) == null ? void 0 : e.ccall) ?? window.ccall;
}
function Y() {
  var e;
  return ((e = window.Module) == null ? void 0 : e.HEAPU8) ?? window.HEAPU8;
}
function Bt() {
  var e;
  return ((e = window.Module) == null ? void 0 : e.HEAPU32) ?? window.HEAPU32;
}
function y() {
  const e = $t();
  if (!e)
    throw new Error("ccall is not available (core not booted yet?)");
  return e;
}
function xt(e, s) {
  return e === "0" ? "full" : e === "1" || s ? "jspi" : "full";
}
let me;
const ee = "./core/", Te = "webnp2-core-script";
function te(e) {
  return `${e}?v=${Ft}`;
}
const At = [
  "2608_bd.wav",
  "2608_sd.wav",
  "2608_top.wav",
  "2608_hh.wav",
  "2608_tom.wav",
  "2608_rim.wav"
], Mt = new Set(At);
function Nt(e) {
  return Mt.has(e) ? e.toUpperCase() : void 0;
}
let re = !1;
function Lt(e) {
  var o;
  const t = ["[NekoProject21kai]", ((o = e.roms) == null ? void 0 : o.some((n) => n.name.toLowerCase() === "font.rom")) ?? !1 ? "fontfile=/font.rom" : "fontfile=/font.bmp"];
  e.hdd && t.push(`HDD1FILE=/disk/${e.hdd.name}`), t.push(`Latencys=${e.latencyMs ?? 40}`), t.push("keyrepeat_enable=true"), t.push("keyrepeat_delay=500"), t.push("keyrepeat_interval=50"), t.push("USEFMGEN=true"), t.push("PEGCPLNE=true");
  const r = Math.max(0, Math.min(230, Math.floor(e.extMemMB ?? 1)));
  if (t.push(`ExMemory=${r}`), e.clkMult !== void 0) {
    const n = Math.max(1, Math.min(32, Math.floor(e.clkMult)));
    t.push(`clk_mult=${n}`);
  }
  if (e.nowait && t.push("s_NOWAIT=true"), t.push("Seek_Vol=25"), t.push(`Seek_Snd=${e.seekSound ?? !0 ? "true" : "false"}`), e.hostdrv) {
    const n = e.hostdrv.root ?? pe;
    at(n), t.push("use_hdrv=true"), t.push(`hdrvroot=${n}`), t.push(`hdrv_acc=${Ct(e.hostdrv.access ?? "rw")}`);
  }
  return t.join(`
`) + `
`;
}
const pe = "/hostdrv";
function at(e) {
  if (!e.startsWith("/"))
    throw new Error(`hostdrv.root must start with '/': ${e}`);
  if (e.split("/").filter((t) => t.length > 0).some((t) => t === ".."))
    throw new Error(`hostdrv.root must not contain '..': ${e}`);
}
function _t(e, s) {
  const t = s.split("/").filter((o) => o.length > 0);
  let r = "";
  for (const o of t)
    r += `/${o}`, e.analyzePath(r).exists || e.mkdir(r);
}
function It(e, s) {
  const t = s.root ?? pe;
  at(t), _t(e, t);
  for (const r of s.files ?? [])
    e.writeFile(`${t}/${r.name}`, r.bytes);
}
function ge(e) {
  if (!e || e === "." || e === ".." || e.includes("/") || e.includes("\\"))
    throw new Error(`invalid hostdrv file name (root直下のみ許可): ${e}`);
}
function Ht(e, s, t, r) {
  ge(t), e.writeFile(`${s}/${t}`, r);
}
function Ot(e, s, t) {
  ge(t);
  const r = `${s}/${t}`;
  return e.analyzePath(r).exists ? e.readFile(r, { encoding: "binary" }) : null;
}
function Ut(e, s) {
  return e.readdir(s).filter((t) => t !== "." && t !== "..");
}
function Kt(e, s, t) {
  ge(t);
  const r = `${s}/${t}`;
  return e.analyzePath(r).exists ? (e.unlink(r), !0) : !1;
}
function jt(e, s) {
  if (!e || !s)
    throw new Error("hostdrv is not enabled (boot() に hostdrv を渡していません)");
  return { fs: e, root: s };
}
function Wt(e, s) {
  if (re)
    return Promise.reject(new Error("core is already booted (reload the page to reboot)"));
  re = !0;
  const t = xt(
    new URLSearchParams(location.search).get("jspi"),
    typeof WebAssembly.Suspending == "function"
  );
  return me = t, new Promise((r, o) => {
    let n = !1;
    const i = (c) => {
      n || (n = !0, re = !1, o(c instanceof Error ? c : new Error(String(c))));
    };
    window.onerror = (c, h, f, m, p) => (console.error("[WebNP2 core] window.onerror", c, h, f, m, p), i(p ?? c), !1);
    const a = {
      canvas: s,
      preRun: [
        function() {
          const h = Ee();
          if (!h) {
            i(new Error("FS is not available in preRun"));
            return;
          }
          try {
            h.analyzePath("/disk").exists || h.mkdir("/disk"), e.hdd && h.writeFile(`/disk/${e.hdd.name}`, e.hdd.bytes);
            for (const f of e.fds)
              h.writeFile(`/disk/${f.name}`, f.bytes);
            for (const f of e.roms ?? []) {
              const m = f.name.toLowerCase();
              h.writeFile(`/${m}`, f.bytes);
              const p = Nt(m);
              p && h.writeFile(`/${p}`, f.bytes);
            }
            h.createPreloadedFile("/", "font.bmp", te(`${ee}font.bmp`), !0, !1), e.hostdrv && It(h, e.hostdrv), h.writeFile("/np21kai.cfg", Lt(e));
          } catch (f) {
            i(f);
          }
        }
      ],
      print: (c) => console.log("[WebNP2 core stdout]", c),
      printErr: (c) => console.log("[WebNP2 core stderr]", c),
      // 両ビルドとも元の wasm 名を要求するため、JSPI版だけ取り込み後の名前へ変換する。
      locateFile: (c) => te(ee + (t === "jspi" && c === "emnp21kai_sdl2.wasm" ? "emnp21kai_sdl2_jspi.wasm" : c)),
      arguments: e.fds.map((c) => `/disk/${c.name}`),
      onRuntimeInitialized: () => {
        if (n) return;
        n = !0;
        const c = Ee();
        if (!c) {
          i(new Error("FS is not available after runtime init"));
          return;
        }
        r(c);
      },
      onAbort: (c) => {
        console.error("[WebNP2 core] aborted", c), i(new Error(`core aborted: ${String(c)}`));
      }
    }, l = s.getContext.bind(s);
    s.getContext = (c, h) => c === "webgl" || c === "webgl2" || c === "experimental-webgl" ? l(c, { ...h ?? {}, preserveDrawingBuffer: !0 }) : l(c, h), window.Module = a;
    const d = document.getElementById(Te);
    d && d.remove();
    const u = document.createElement("script");
    u.id = Te, u.src = te(`${ee}emnp21kai_sdl2${t === "jspi" ? "_jspi" : ""}.js`), u.onerror = () => i(new Error(`failed to load ${u.src}`)), document.body.appendChild(u);
  });
}
function K(e, s) {
  return e.readFile(`/disk/${s}`, { encoding: "binary" });
}
function j(e, s) {
  try {
    const t = e.stat(`/disk/${s}`), r = t.mtime instanceof Date ? t.mtime.getTime() : Number(t.mtime);
    return Number.isFinite(r) ? { mtimeMs: r, size: t.size } : null;
  } catch {
    return null;
  }
}
function zt() {
  y()("webnp2_reset", null, [], []);
}
function W(e, s) {
  y()("webnp2_set_fdd", null, ["number", "string"], [e, s]);
}
function Vt(e) {
  return y()("webnp2_fdd_ready", "number", ["number"], [e]);
}
function Gt(e) {
  try {
    y()("webnp2_set_pause_sleep_ms", null, ["number"], [Math.trunc(e)]);
  } catch {
  }
}
function Re(e) {
  return y()("webnp2_statsave", "number", ["string"], [e]);
}
function Fe(e) {
  return y()("webnp2_statload", "number", ["string"], [e]);
}
function Yt(e, s) {
  y()("webnp2_mouse_move", null, ["number", "number"], [e, s]);
}
function Xt() {
  return y()("webnp2_mouse_pending", "number", [], []);
}
function z(e, s) {
  y()("webnp2_mouse_button", null, ["number", "number"], [e, s]);
}
function T(e, s) {
  y()("webnp2_key", null, ["number", "number"], [e, s ? 1 : 0]);
}
function Ce(e) {
  return y()("webnp2_push_key_buffer", "number", ["number"], [e]);
}
function qt(e, s) {
  return y()("webnp2_push_key_buffer_pair", "number", ["number", "number"], [e, s]);
}
function se() {
  return y()("webnp2_find_mailbox", "number", [], []);
}
function Zt(e) {
  return y()("webnp2_mailbox_space", "number", ["number"], [e]);
}
function Jt(e, s) {
  return y()("webnp2_mailbox_put", "number", ["number", "number"], [e, s]);
}
function $e(e, s) {
  y()("webnp2_mailbox_pending", null, ["number", "number"], [e, s]);
}
function Qt() {
  const e = y(), s = e("webnp2_read_tvram", "number", [], []), t = e("webnp2_tvram_size", "number", [], []), r = Y();
  if (!r)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  return r.slice(s, s + t);
}
function Be(e, s) {
  const t = y(), r = t("webnp2_mem_ptr", "number", [], []), o = t("webnp2_mem_size", "number", [], []);
  if (e < 0 || s < 0 || e + s > o)
    throw new Error(`coreReadMemory: out of range (addr=${e}, len=${s}, memSize=${o})`);
  const n = Y();
  if (!n)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  return n.slice(r + e, r + e + s);
}
function er(e, s) {
  const t = y(), r = t("webnp2_mem_ptr", "number", [], []), o = t("webnp2_mem_size", "number", [], []);
  if (e < 0 || e + s.byteLength > o)
    throw new Error(`coreWriteMemory: out of range (addr=${e}, len=${s.byteLength}, memSize=${o})`);
  const n = Y();
  if (!n)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  n.set(s, r + e);
}
function tr(e) {
  y()("webnp2_dbg_set_paused", null, ["number"], [e ? 1 : 0]);
}
function rr() {
  return y()("webnp2_dbg_paused", "number", [], []);
}
async function sr(e) {
  return await y()("webnp2_dbg_step", "number", ["number"], [e], me === "jspi" ? { async: !0 } : void 0);
}
function or() {
  const e = y(), s = e("webnp2_dbg_regs", "number", [], []), t = e("webnp2_dbg_regs_size", "number", [], []), r = Bt();
  if (!s || !r || t <= 0 || s & 3 || t & 3)
    throw new Error("webnp2_dbg_regs returned an invalid buffer");
  const o = s >>> 2;
  return r.slice(o, o + (t >>> 2));
}
function nr(e, s, t) {
  const r = y()(
    "webnp2_dbg_disasm",
    "number",
    ["number", "number", "number"],
    [e, s, t]
  ), o = Y();
  if (!r || !o)
    throw new Error("webnp2_dbg_disasm returned an invalid buffer");
  let n = r;
  for (; n < o.length && o[n] !== 0; ) n++;
  if (n === o.length)
    throw new Error("webnp2_dbg_disasm returned a non-terminated string");
  return new TextDecoder().decode(o.subarray(r, n));
}
function ir(e, s, t, r) {
  y()(
    "webnp2_dbg_set_bp",
    null,
    ["number", "number", "number", "number"],
    [e, s, t, r ? 1 : 0]
  );
}
async function ar(e) {
  return await y()("webnp2_dbg_run_until_bp", "number", ["number"], [e], me === "jspi" ? { async: !0 } : void 0);
}
const xe = "webnp2", P = "images", R = "index";
let B = null;
function Ae(e) {
  e.objectStoreNames.contains(P) || e.createObjectStore(P, { keyPath: "sourceKey" }), e.objectStoreNames.contains(R) || e.createObjectStore(R, { keyPath: "sourceKey" });
}
function ue(e) {
  const { bytes: s, ...t } = e;
  return { ...t, size: s.byteLength };
}
function M() {
  if (B) return B;
  const e = new Promise((s, t) => {
    const r = (n) => (n.onversionchange = () => {
      n.close(), B === e && (B = null);
    }, n), o = indexedDB.open(xe);
    o.onupgradeneeded = () => {
      Ae(o.result);
    }, o.onerror = () => t(o.error ?? new Error("failed to open IndexedDB")), o.onsuccess = () => {
      const n = r(o.result);
      if (n.objectStoreNames.contains(P) && n.objectStoreNames.contains(R)) {
        s(n);
        return;
      }
      const i = n.version + 1;
      n.close();
      const a = indexedDB.open(xe, i);
      a.onupgradeneeded = () => {
        Ae(a.result);
      }, a.onblocked = () => {
      }, a.onerror = () => {
        t(a.error ?? new Error("failed to upgrade IndexedDB"));
      }, a.onsuccess = () => {
        s(r(a.result));
      };
    };
  });
  return B = e, e.catch(() => {
    B === e && (B = null);
  }), e;
}
function be(e) {
  return e.objectStoreNames.contains(R) ? [P, R] : [P];
}
function X(e) {
  return new Promise((s, t) => {
    e.oncomplete = () => s(), e.onabort = () => t(e.error ?? new Error("IndexedDB transaction aborted")), e.onerror = () => t(e.error ?? new Error("IndexedDB transaction failed"));
  });
}
function lt(e, s) {
  e.objectStore(P).put(s), e.objectStoreNames.contains(R) && e.objectStore(R).put(ue(s));
}
async function N(e) {
  const s = await M();
  return new Promise((t, r) => {
    const i = s.transaction(P, "readonly").objectStore(P).get(e);
    i.onsuccess = () => t(i.result ?? void 0), i.onerror = () => r(i.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function oe(e) {
  const s = await M(), t = s.transaction(be(s), "readwrite");
  lt(t, e), await X(t);
}
async function lr(e) {
  const s = await M(), t = s.transaction(be(s), "readwrite"), r = t.objectStore(P), o = (i) => {
    const a = i && (i.displayName !== void 0 || i.group !== void 0 || i.groupName !== void 0 || i.groupIndex !== void 0);
    lt(t, a ? {
      ...e,
      displayName: i.displayName,
      group: i.group,
      groupName: i.groupName,
      groupIndex: i.groupIndex
    } : e);
  }, n = () => {
    const i = r.get(e.sourceKey);
    i.onsuccess = () => o(i.result);
  };
  if (t.objectStoreNames.contains(R)) {
    const i = t.objectStore(R).get(e.sourceKey);
    i.onsuccess = () => {
      i.result ? o(i.result) : n();
    };
  } else
    n();
  await X(t);
}
async function dr() {
  const e = await M();
  if (!e.objectStoreNames.contains(R)) return (await ur()).map(ue);
  const s = e.transaction([P, R], "readwrite"), t = s.objectStore(P), r = s.objectStore(R), o = t.getAllKeys(), n = r.getAll();
  let i = [];
  return n.onsuccess = () => {
    const a = n.result, l = new Set(o.result), d = new Set(a.map((u) => u.sourceKey));
    i = a.filter((u) => l.has(u.sourceKey) ? !0 : (r.delete(u.sourceKey), !1));
    for (const u of l) {
      if (d.has(u)) continue;
      const c = t.get(u);
      c.onsuccess = () => {
        if (c.result) {
          const h = ue(c.result);
          r.put(h), i.push(h);
        }
      };
    }
  }, await X(s), i;
}
async function cr(e) {
  const s = await M();
  return new Promise((t, r) => {
    const n = s.transaction(P, "readonly").objectStore(P), i = IDBKeyRange.bound(e, e + "￿"), a = n.getAll(i);
    a.onsuccess = () => t(a.result ?? []), a.onerror = () => r(a.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function ur() {
  const e = await M();
  return new Promise((s, t) => {
    const n = e.transaction(P, "readonly").objectStore(P).getAll();
    n.onsuccess = () => s(n.result ?? []), n.onerror = () => t(n.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function hr(e) {
  const s = await M(), t = s.transaction(be(s), "readwrite");
  t.objectStore(P).delete(e), t.objectStoreNames.contains(R) && t.objectStore(R).delete(e), await X(t);
}
const fr = "webnp2.lang", mr = {
  ja: {
    title: () => "WebNP2 - PC-98 Emulator",
    footerCopyright: () => "© URARA-works",
    footerGithubLabel: () => "GitHubで見る",
    footerAboutLabel: () => "WebNP2について",
    toolbarHelp: () => "使い方",
    toolbarMore: () => "その他",
    toolbarGroupDisplay: () => "表示",
    toolbarGroupInput: () => "入力",
    toolbarGroupSound: () => "サウンド",
    toolbarGroupDisk: () => "ディスク",
    toolbarGroupState: () => "ステート",
    toolbarAspect: () => "表示モード",
    toolbarAspect43: () => "4:3表示",
    toolbarAspectNative: () => "ドット等倍",
    toolbarMute: () => "ミュート",
    toolbarFddSeekSound: () => "FDDシーク音",
    toolbarToggleHddSlot: () => "HDD欄を表示",
    toggleOn: () => "ON",
    toggleOff: () => "OFF",
    overlayNote1: () => "音声再生の制限上、クリック操作で起動します。",
    overlayNote2: () => "ファイルをドラッグ&ドロップしてHDD/FDイメージを読み込むこともできます。",
    startBtn: () => "クリックして起動",
    startBtnPlain: () => "ディスク無しで起動",
    startBtnPending: () => "セットしたディスクで起動",
    startBtnFreeDos: () => "FreeDOS(98) で起動",
    toolbarReset: () => "初期状態に戻す",
    toolbarFullscreen: () => "フルスクリーン",
    toolbarMachineReset: () => "マシンリセット",
    toolbarScreenshot: () => "スクリーンショット",
    toolbarPause: () => "ポーズ",
    toolbarResume: () => "再開",
    pauseOverlayLabel: () => "ポーズ中",
    statusScreenshotSaved: () => "スクリーンショットを保存しました。",
    toolbarMouse: () => "マウスキャプチャ (画面を右ダブルクリックでも開始)",
    statusMouseCaptured: () => "マウスをキャプチャしました。Esc キーで解除できます。",
    statusMouseReleased: () => "マウスキャプチャを解除しました。",
    toolbarMouseResync: () => "マウス再同期 (カーソルがズレたとき)",
    statusMouseResynced: () => "マウス位置を再同期しました。",
    toolbarSaveState: () => "ステート保存",
    toolbarLoadState: () => "ステート復元",
    toolbarLanguage: () => "言語",
    resetConfirm: () => "現在の進行状況を破棄し、配布元の初期状態に戻します。よろしいですか？",
    fdSlotLabel: ({ drive: e }) => `FDD${e}`,
    hddSlotLabel: () => "HDD",
    fdEmpty: () => "(空)",
    fdInsert: () => "挿入",
    hddInsertSet: () => "HDDイメージをセット(起動はしない)",
    hddEject: () => "セットしたHDDを外す",
    hddSetFromLibrary: () => "ライブラリからセット",
    hddSetFromLibraryTitle: () => "HDDにセット",
    hddCreateBlank: () => "ブランクHDDを作成(40MB・FAT16)",
    fdInsertFreeDos: () => "FreeDOS(98) 挿入",
    diskLampLabel: ({ drive: e }) => `${e} アクセスランプ`,
    fdInsertFromLibrary: () => "ライブラリから挿入",
    fdInsertFromLibraryTitle: ({ drive: e }) => `FDD${e} へ挿入`,
    fdEject: () => "排出",
    fdCreateBlank: () => "ブランクFDを作成(1.2MB・FAT12フォーマット済み)",
    slotDownload: () => "ダウンロード",
    statusMachineReset: () => "マシンをリセットしました。",
    statusClkTuning: () => "最適なCPU速度を調整中...",
    statusClkAuto: ({ clk: e }) => `CPU速度: ×${e}（自動判定）`,
    statusStateSaved: () => "ステートを保存しました。",
    statusStateLoaded: () => "ステートを復元しました。",
    statusFdInserted: ({ drive: e, name: s }) => `FDD${e} に挿入しました: ${s}`,
    statusFdEjected: ({ drive: e }) => `FDD${e} を排出しました。`,
    statusFreeDosInserted: ({ drive: e }) => `FDD${e} に FreeDOS(98) を挿入しました。マシンリセットで起動します。`,
    dropUnsupported: () => "対応していないファイル形式です（HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup 等、圧縮: .zip/.lzh）",
    dropNoDiskImage: () => "ディスクイメージが見つかりませんでした。",
    statusArchiveFailed: ({ name: e, message: s }) => `${e} の展開に失敗しました: ${s}`,
    statusLibraryAdded: ({ count: e }) => `ディスクライブラリに${e}件追加しました。`,
    statusArchiveResumed: ({ label: e, count: s }) => `${e}: 前回展開した圧縮ファイルの${s}件を復元しました。`,
    statusArchiveNoDiskImage: ({ label: e }) => `${e}: 圧縮ファイル内にディスクイメージが見つかりませんでした。`,
    statusArchiveKindMismatch: ({ label: e, kind: s }) => `${e}: 圧縮ファイル内に${s === "hdd" ? "HDD" : "FD"}イメージが見つかりませんでした。`,
    statusArchiveNeedsSelection: () => "圧縮ファイルに複数のディスクが含まれています。ディスクライブラリから使うディスクを選んでください。",
    statusDiskSet: ({ name: e }) => `${e} をセットしました。起動前ならファイル転送で中身を編集できます。起動ボタンで起動します。`,
    statusDiskUnset: ({ name: e }) => `${e} を外しました。`,
    statusHddBlankCreated: ({ name: e }) => `ブランクHDD ${e} を作成してセットしました(40MB・FAT16)。単体では起動できないため、FDからDOSを起動してデータ用ドライブとして使ってください。`,
    dropConfirm: ({ count: e, names: s }) => `${e}件のファイルを読み込みます: ${s}
よろしいですか？`,
    diskReplaceUnsupported: () => "起動後のディスク差し替えは Phase 2 で対応予定です。ページを再読み込みしてください。",
    noMountedImage: () => "マウント中のイメージがありません。",
    pickSlotPrompt: ({ action: e, slots: s }) => `${e}対象を選択してください: ${s}`,
    pickSlotActionReset: () => "初期状態に戻す",
    statusPreparing: () => "起動準備中…",
    statusDbUpgradeBlocked: () => "ほかの WebNP2 / WorkbenchNP2 のタブを閉じてください。",
    statusNoImage: () => "イメージが指定されていません。ファイルをドラッグ&ドロップして読み込んでください。",
    statusCoreBooting: () => "コアを起動しています…",
    statusBootSuccess: () => "起動しました。",
    statusBootFailed: ({ message: e }) => `起動に失敗しました: ${e}`,
    statusResumed: ({ label: e, name: s }) => `${e}: 前回の続きから再開中です（${s}）`,
    urlLibSlotLabel: ({ index: e }) => `ライブラリ${e}`,
    statusFetching: ({ label: e, name: s }) => `${e} を取得中: ${s}`,
    statusFetchingProgress: ({ label: e, name: s, loaded: t, total: r }) => `${e} を取得中: ${s} (${t}${r ? " / " + r : ""})`,
    fetchFailedNetwork: ({ url: e }) => `イメージの取得に失敗しました（ネットワークエラーまたはCORS設定を確認してください）: ${e}`,
    fetchFailedHttp: ({ url: e, status: s }) => `イメージの取得に失敗しました（HTTP ${s}）: ${e}`,
    fetchFailedOneDrive: ({ url: e }) => `イメージの取得に失敗しました: ${e}
OneDriveの共有リンクは仕様上ご利用いただけません。Google DriveかDropboxをお使いください。`,
    fetchFailedNeedsProxy: ({ url: e }) => `イメージの取得に失敗しました: ${e}
この配信元は中継サーバ経由でのみ取得できますが、このビルドでは中継(VITE_DISK_PROXY)が設定されていません。自分でホストしている場合は VITE_DISK_PROXY を設定してください(詳細はREADME)。`,
    fetchFailedProxy: ({ url: e, reason: s }) => `イメージの取得に失敗しました: ${e}
${s}`,
    fetchFailedHtmlPage: ({ url: e }) => `取得結果がディスクイメージではなくWebページでした: ${e}
共有リンクの公開設定(リンクを知っている全員が閲覧可)を確認するか、ダウンロードしたファイルを画面へドラッグ&ドロップしてください。`,
    proxyReasonBadUrl: () => "中継サーバがURLを解釈できませんでした。",
    proxyReasonOriginNotAllowed: () => "中継サーバがこのサイトからのリクエストを許可していません。",
    proxyReasonHostNotAllowed: () => "中継サーバがこの配信元への転送を許可していません。",
    proxyReasonTooLarge: () => "ファイルサイズが中継サーバの上限を超えています。",
    proxyReasonRateLimited: () => "中継サーバのリクエスト数が上限に達しています。しばらく待って再度お試しください。",
    proxyReasonUpstreamFailed: () => "中継サーバから配信元への取得に失敗しました。",
    proxyReasonRedirectNotAllowed: () => "配信元が別のサイト(ログイン画面など)へ転送しようとしたため中断しました。共有設定が「リンクを知っている全員が閲覧可」になっているか、共有リンクを省略せず全部コピーしているかご確認ください。",
    proxyReasonUnknown: ({ status: e }) => `中継サーバでエラーが発生しました (HTTP ${e})。`,
    audioMuted: () => "🔇 音声はミュート中です。クリックで有効になります",
    toolbarRomManager: () => "ROM登録",
    romDialogTitle: () => "ROM/素材ファイル登録",
    romDialogDescription: () => "デスクトップ版NP2kaiで使っていたROM/素材ファイル(bios.rom, itf.rom, sound.rom, font.rom等)を登録すると、ブラウザ内(IndexedDB)にのみ保存され、次回以降の起動時に自動で組み込まれます。サーバーには送信されません。なお、YM2608リズム音源(2608_*.wav)は代替音を同梱済みのため未登録でも鳴ります(実機のYM2608実チップのリズム音そのものではなく、作者が独自に制作した代替音です)。実機由来の本物をお持ちの場合は2608_*.wavを登録すればそちらが優先されます。",
    romDialogSelectFiles: () => "ファイルを選択",
    romDialogDropHint: () => "このダイアログへファイルをドラッグ＆ドロップしても登録できます。",
    romDialogListEmpty: () => "登録済みのファイルはありません。",
    romDialogDelete: () => "削除",
    romDialogReloadNote: () => "反映には再起動(ページのリロード)が必要です。",
    romDialogReloadBtn: () => "ページを再読み込み",
    romDialogClose: () => "閉じる",
    romDialogSaved: ({ saved: e, skipped: s }) => `${e}件のファイルを登録しました。${s > 0 ? `(${s}件は非対応形式のためスキップ)` : ""}`,
    romDialogSkippedNote: ({ names: e }) => `非対応のためスキップ: ${e}`,
    romDialogRejectedNote: ({ items: e }) => `登録できませんでした(fmgenが受け付けない形式のまま登録すると、そのファイルだけでなくリズム音源6本すべてが無音になるため、登録自体を中止しました): ${e}`,
    rhythmRejectReasonNotRiffWave: () => "RIFF/WAVE形式のファイルではありません。",
    rhythmRejectReasonNoFmtChunk: () => "標準的なWAVと構造が異なり、fmtチャンクの位置を認識できません。",
    rhythmRejectReasonNotPcm: () => "リニアPCM形式ではありません(圧縮WAV等は非対応)。",
    rhythmRejectReasonNotMono: () => "モノラルのWAVではありません(ステレオ等は非対応)。",
    rhythmRejectReasonNoDataChunk: () => "dataチャンクが見つかりません。",
    rhythmRejectReasonTooManySamples: () => "サンプル数が多すぎます(長すぎるWAVです)。",
    rhythmRejectReasonNot16Bit: () => "16bitのリニアPCMではありません。モノラル・16bit・リニアPCMのWAVのみ登録できます。",
    overlayLibraryBtn: () => "保存済みディスクから起動",
    toolbarDiskLibrary: () => "ディスクライブラリ",
    libraryDialogTitle: () => "ディスクライブラリ",
    libraryDialogDescription: () => "これまでにブラウザ内(IndexedDB)に保存されたHDD/FDイメージの一覧です。前回の続き(変更後のデータ)がそのまま保存されています。サーバーには送信されません。このダイアログへファイルをドラッグ＆ドロップして登録することもできます。",
    libraryGroupFocusHint: () => "取り込んだ圧縮ファイルの中身です。使うディスクを選んでください。",
    libraryDialogListEmpty: () => "保存済みのディスクイメージはありません。",
    libraryKindHdd: () => "HDD",
    libraryKindFd: () => "FD",
    libraryActionBoot: () => "起動",
    libraryActionSetHdd: () => "HDDにセット",
    libraryActionInsertFd1: () => "FD1へ挿入",
    libraryActionInsertFd2: () => "FD2へ挿入",
    libraryActionDelete: () => "削除",
    libraryActionNeedsRestart: () => "起動には再読み込みが必要です",
    libraryDeleteConfirm: ({ name: e }) => `保存済みデータ「${e}」を削除します。よろしいですか？`,
    libraryActionRename: () => "名前変更",
    libraryRenamePrompt: ({ name: e }) => `表示名を入力してください（元のファイル名: ${e}）`,
    libraryRenameGroupPrompt: () => "フォルダ名を入力してください",
    libraryGroupCount: ({ count: e }) => `${e}枚`,
    libraryDeleteGroupConfirm: ({ name: e, count: s }) => `フォルダ「${e}」内の${s}件をすべて削除します。よろしいですか？`,
    libraryMenuBack: () => "← 戻る",
    libraryDialogClose: () => "閉じる",
    toolbarPasteText: () => "テキスト送信 (Shiftキー2回でも開く)",
    toolbarVirtualKbd: () => "ソフトキーボード",
    pasteBarPlaceholder: () => "ここに送信するテキストを入力…",
    pasteBarSetupBtn: () => "日本語入力を有効化",
    pasteBarSetupNote: () => "このゲストでは全角が届きません。ゲスト常駐ヘルパー(同梱ツールFD)を導入すると全角を送れます。DOSのコマンド待ち状態で実行してください。",
    statusPasteHelperSetup: () => "日本語入力を有効化しています…",
    statusPasteHelperOk: () => "日本語入力を有効化しました。",
    statusPasteHelperFailed: ({ message: e }) => `日本語入力の有効化に失敗しました: ${e}`,
    pasteBarEnterLabel: () => "Enter付き",
    pasteBarSend: () => "送信",
    pasteBarClose: () => "閉じる",
    statusPasteSkipped: ({ count: e, chars: s }) => `${e}文字を送信できずスキップしました: ${s}`,
    toolbarDebugger: () => "デバッガ",
    debuggerTitle: () => "CPUデバッガ",
    debuggerPause: () => "一時停止",
    debuggerResume: () => "再開",
    debuggerStep: () => "Step (1命令)",
    debuggerStep10: () => "Step ×10",
    debuggerRunToBp: () => "BPまで実行",
    debuggerClose: () => "閉じる",
    debuggerRegisters: () => "レジスタ",
    debuggerDisassembly: () => "逆アセンブル（行をタップしてBP切替）",
    debuggerMemory: () => "メモリダンプ",
    debuggerMemoryAddress: () => "物理アドレス（16進）",
    debuggerMemoryRead: () => "読み出し",
    debuggerMemoryInvalid: () => "メモリアドレスを16進数で入力してください。",
    debuggerPaused: () => "CPUを一時停止しました。",
    debuggerResumed: () => "CPU実行を再開しました。",
    debuggerStepped: ({ count: e }) => `${e}命令を実行しました。`,
    debuggerAddBreakpoint: () => "ブレークポイントを追加",
    debuggerRemoveBreakpoint: () => "ブレークポイントを解除",
    debuggerBreakpointAdded: ({ index: e, seg: s, off: t }) => `BP${e}: ${s}:${t} を設定しました。`,
    debuggerBreakpointRemoved: ({ seg: e, off: s }) => `${e}:${s} のBPを解除しました。`,
    debuggerBreakpointLimit: () => "ブレークポイントは最大8個です。不要なBPを解除してください。",
    debuggerBreakpointHit: ({ index: e }) => `BP${e} で停止しました。`,
    debuggerBreakpointMiss: () => "100000命令以内にBPへ到達しませんでした。",
    toolbarFileManager: () => "ファイル転送",
    fmDialogTitle: () => "ファイル転送",
    fmDialogNote: () => "注意: ゲストがフロッピーへアクセス中(FDDランプ点灯中)の転送は避けてください。HDDイメージは起動前のみ選択できます。",
    fmHostPaneTitle: () => "このブラウザ",
    fmDiskPaneTitle: () => "ディスクイメージ(PC-98側)",
    fmSelectFilesBtn: () => "ファイルを選択",
    fmDropHint: () => "ここへファイルをドラッグ＆ドロップできます(.lzh/.zipは自動展開されます)。",
    fmStagedEmpty: () => "追加されたファイルはありません。",
    fmArchiveError: ({ name: e, message: s }) => `${e} の展開に失敗しました: ${s}`,
    fmRemoveBtn: () => "削除",
    fmTransferToDiskBtn: () => "ディスクへ転送 (→)",
    fmTransferToHostBtn: () => "ホストへ取得 (←)",
    fmUnmountedLabel: () => "未マウント",
    fmMountedBadge: () => "マウント中",
    fmNotEditableNote: () => "編集非対応",
    fmPathRoot: () => "/ (ルート)",
    fmUpDir: () => ".. 上へ",
    fmDirMarker: () => "DIR",
    fmDeleteSelectedBtn: () => "選択を削除",
    fmMakeDirBtn: () => "新規フォルダ",
    fmMakeDirPrompt: () => "新規フォルダ名(8.3形式)を入力してください:",
    fmMakeDirInvalidName: ({ name: e }) => `フォルダ名は8.3形式にしてください(2バイト文字/長い名前は不可): ${e}`,
    fmCreateTransferFdBtn: () => "転送用FDを作成",
    fmTransferFdCreated: ({ name: e }) => `転送用FD「${e}」を作成しました。`,
    fmFreeSpaceLabel: ({ free: e, total: s }) => `空き容量: ${e} / ${s}`,
    fmSelectEditableTarget: () => "編集可能なディスクを選択してください(D88は非対応、HDDは起動前のみ編集できます)。",
    fmEmptyDir: () => "(空のフォルダ)",
    fmRenameConfirm: ({ list: e }) => `以下のファイル名でディスクへ転送します(8.3形式へ変換済み)。よろしいですか？

${e}`,
    fmOverwriteConfirm: ({ names: e }) => `同名のファイルを上書きします: ${e}
よろしいですか？`,
    fmInsufficientSpace: ({ needed: e, free: s }) => `空き容量が不足しています(必要: ${e} / 空き: ${s})。`,
    fmTransferring: ({ current: e, total: s }) => `転送中… (${e}/${s})`,
    fmTransferDone: ({ succeeded: e }) => `${e}件の転送が完了しました。`,
    fmTransferFailedDetail: ({ names: e }) => `一部の転送に失敗しました: ${e}`,
    fmDeleteConfirm: ({ names: e }) => `以下のファイルを削除します: ${e}
よろしいですか？`,
    fmCloseBtn: () => "閉じる",
    fmListLoadFailed: ({ message: e }) => `一覧の取得に失敗しました: ${e}`,
    toolbarGamepad: () => "入力設定(ゲームパッド/キーボード)",
    gamepadDialogTitle: () => "ゲームパッド設定",
    gamepadDialogDescription: () => "接続中の各パッドについて、ボタン/軸をPC-98のキーへ割り当てます。設定はブラウザにパッドごと保存されます。",
    gamepadDialogClose: () => "閉じる",
    gamepadNoPads: () => "パッドが検出されていません。パッドのボタンを1回押すと認識されます。",
    gamepadConnectedTitle: () => "接続中のパッド",
    gamepadLiveTitle: ({ name: e }) => e,
    gamepadPhysicalTitle: () => "物理入力",
    gamepadKeysTitle: () => "PC-98側キー出力",
    gamepadEditingPadLabel: () => "編集するパッド",
    gamepadBindingsTitle: () => "割当編集",
    gamepadBindingsEmpty: () => "割当はまだありません。下の[新規検出]から追加してください。",
    gamepadUnassignedKeyLabel: () => "(未設定)",
    gamepadClearBtn: () => "クリア",
    gamepadClearBtnTitle: () => "この行の割当を解除します",
    gamepadRedetectBtn: () => "再検出",
    gamepadRedetectBtnTitle: () => "次に押した入力へこの行の物理入力を置き換えます(割り当てるキーは変わりません)",
    gamepadAddBtn: () => "新規検出",
    gamepadAddBtnTitle: () => "次に押したボタン/軸を新しい行として追加します",
    gamepadCancelBtn: () => "キャンセル",
    gamepadCancelBtnTitle: () => "入力待ちを中止して元に戻ります",
    gamepadDetectWaiting: () => "入力を待っています…(Escでキャンセル)",
    gamepadPendingPickKey: () => "検出しました。下のキーボードで割り当てるキーを選んでください。",
    gamepadRowSelectedHint: () => "行を選択中: 下のキーボードでキーを押すと、この行に割り当てます。",
    gamepadPickerIdleHint: () => "割り当てる行を選ぶか、[新規検出]を押してパッドのボタンを押してください。",
    gamepadDeadzoneLabel: () => "デッドゾーン",
    gamepadKeyPickerTitle: () => "PC-98キーボード(クリックで選択、送信はされません)",
    gamepadPresetCursorZxBtn: () => "カーソルキー+Z/X",
    gamepadPresetCursorZxBtnTitle: () => "十字キー/左スティックをカーソルキーへ、A/BをZ/Xへ割り当て直します(既存の割当は消去)",
    gamepadPresetTenkeySpaceBtn: () => "テンキー+SPACE",
    gamepadPresetTenkeySpaceBtnTitle: () => "十字キー/左スティックをテンキー方向へ、A/BをSPACE/ENTERへ割り当て直します(既存の割当は消去)",
    gamepadButtonLabel: ({ index: e }) => `ボタン${e}`,
    gamepadAxisLabel: ({ index: e, dir: s }) => `軸${e} ${s}`,
    gamepadAxisInvalidSuffix: () => "(無効・範囲外の値)",
    gamepadAxisUncalibratedSuffix: () => "(未較正・一度動かすと使えます)",
    gamepadAxisCalibratingSuffix: () => "(較正中・そのまま数秒待ってください)",
    gamepadPositionalButtonLabel: ({ index: e, position: s }) => `#${e} (${s})`,
    gamepadPosDown: () => "下",
    gamepadPosRight: () => "右",
    gamepadPosLeft: () => "左",
    gamepadPosUp: () => "上",
    gamepadPosL: () => "L",
    gamepadPosR: () => "R",
    gamepadPosL2: () => "L2",
    gamepadPosR2: () => "R2",
    gamepadPosSelect: () => "Select",
    gamepadPosStart: () => "Start",
    gamepadPosL3: () => "L3",
    gamepadPosR3: () => "R3",
    gamepadPosDpadUp: () => "十字上",
    gamepadPosDpadDown: () => "十字下",
    gamepadPosDpadLeft: () => "十字左",
    gamepadPosDpadRight: () => "十字右",
    gamepadPosHome: () => "Home",
    inputSettingsDialogTitle: () => "入力設定",
    inputTabGamepad: () => "ゲームパッド",
    inputTabHostkey: () => "キーボード",
    inputTabVpad: () => "バーチャルパッド",
    inputPanelSwitchKeyboard: () => "仮想キーボードに切替",
    inputPanelSwitchPad: () => "バーチャルパッドに切替",
    inputPanelSwitchTrackpad: () => "バーチャルトラックパッドに切替",
    kbdToggleTenkey: () => "テンキー",
    vpadEditAssignmentsMenuItem: () => "割当を編集",
    vpadDialogDescription: () => "画面上の方向パッドと各ボタンへPC-98キーを割り当てます。組み込み設定は複製して編集してください。",
    vpadProfileLabel: () => "プロファイル",
    vpadProfileCursorZx: () => "カーソルキー + Z/X",
    vpadProfileTenkey: () => "テンキー + Z/X",
    vpadNewProfileBtn: () => "新規",
    vpadNewProfilePrompt: () => "新しいプロファイル名を入力してください:",
    vpadDuplicateProfileBtn: () => "複製",
    vpadDuplicateProfilePrompt: () => "複製後のプロファイル名を入力してください:",
    vpadDuplicateDefaultName: ({ name: e }) => `${e} のコピー`,
    vpadRenameProfileBtn: () => "リネーム",
    vpadRenameProfilePrompt: () => "新しいプロファイル名を入力してください:",
    vpadDeleteProfileBtn: () => "削除",
    vpadDeleteProfileConfirm: ({ name: e }) => `プロファイル「${e}」を削除します。よろしいですか？`,
    vpadBuiltinReadonlyNote: () => "組み込みプロファイルは編集・削除できません。複製すると編集できます。",
    vpadSourceUp: () => "方向 上",
    vpadSourceDown: () => "方向 下",
    vpadSourceLeft: () => "方向 左",
    vpadSourceRight: () => "方向 右",
    vpadSourceButton: ({ name: e }) => `ボタン ${e}`,
    vpadSourceOption: ({ n: e }) => `補助ボタン ${e}`,
    vpadUnassigned: () => "(未設定)",
    vpadClearBindingBtn: () => "クリア",
    vpadPickerIdleHint: () => "編集可能なプロファイルの割当行を選択してください。",
    vpadPendingPickKey: () => "選択中の行へ割り当てるPC-98キーを下から選んでください。",
    hostkeyDialogDescription: () => "ホストPC(実機)のキーをPC-98の任意のキーへ再割り当てします。テンキーの無いノートPC等で、テンキー専用の操作をカーソルキー等から行えるようにするための機能です。",
    hostkeyEnableLabel: () => "キー再割り当てを有効化",
    hostkeyBuiltinTenkeyLabel: () => "テンキー移動(矢印キー→テンキー)",
    hostkeyProfileLabel: () => "プロファイル",
    hostkeyNewProfileBtn: () => "新規",
    hostkeyNewProfilePrompt: () => "新しいプロファイル名を入力してください:",
    hostkeyDuplicateProfileBtn: () => "複製",
    hostkeyDuplicateProfilePrompt: ({ name: e }) => `「${e}」を複製します。複製後のプロファイル名を入力してください:`,
    hostkeyDuplicateDefaultName: ({ name: e }) => `${e} のコピー`,
    hostkeyRenameProfileBtn: () => "リネーム",
    hostkeyRenameProfilePrompt: () => "新しいプロファイル名を入力してください:",
    hostkeyDeleteProfileBtn: () => "削除",
    hostkeyDeleteProfileConfirm: ({ name: e }) => `プロファイル「${e}」を削除します。よろしいですか？`,
    profileNameInputLabel: () => "プロファイル名",
    profileNameOk: () => "OK",
    profileNameCancel: () => "キャンセル",
    profileNameRequired: () => "空白以外の名前を入力してください。",
    hostkeyBuiltinReadonlyNote: () => "組み込みプロファイルは編集・削除できません(複製してから編集してください)。",
    hostkeyBindingsEmpty: () => "割当はまだありません。下の[追加]から割り当ててください。",
    hostkeyAddBtn: () => "追加",
    hostkeyAddBtnTitle: () => "次に押したホストの物理キーを新しい行として追加します",
    hostkeyDetectWaiting: () => "ホストのキーを押してください…(Escでキャンセル)",
    hostkeyPendingPickKey: () => "検出しました。下のキーボードで割り当てるPC-98キーを選んでください。",
    hostkeyPickerIdleHint: () => "[追加]を押してホストのキーを押してください。",
    hostkeyClearBtn: () => "クリア",
    hostkeyClearBtnTitle: () => "この行の割当を解除します",
    hostkeyCancelBtn: () => "キャンセル",
    tenkeyKeyLabel: ({ key: e }) => `テンキー${e}`,
    errD88NotEditable: () => "D88形式は編集に対応していません。",
    errHddInvalidHeader: ({ format: e }) => `${e}のヘッダが不正です。`,
    errHddNoFatPartition: () => "HDDイメージ内にFAT16/12パーティションが見つかりません。",
    errMountedUseSlotApi: () => "マウント中のイメージはスロット側の操作を使ってください。",
    errHddEditBeforeBootOnly: () => "HDDイメージの編集は起動前のみ可能です。",
    errHddSlotUnsupported: () => "この操作はFD1/FD2のみ対応しています(HDDは非対応)。",
    errInvalidShortName: ({ name: e }) => `ファイル名は8.3形式にしてください(2バイト文字・長い名前は不可): ${e}`
  },
  en: {
    title: () => "WebNP2 - PC-98 Emulator",
    footerCopyright: () => "© URARA-works",
    footerGithubLabel: () => "View on GitHub",
    footerAboutLabel: () => "About WebNP2",
    toolbarHelp: () => "Help",
    toolbarMore: () => "More",
    toolbarGroupDisplay: () => "Display",
    toolbarGroupInput: () => "Input",
    toolbarGroupSound: () => "Sound",
    toolbarGroupDisk: () => "Disk",
    toolbarGroupState: () => "State",
    toolbarAspect: () => "Display Mode",
    toolbarAspect43: () => "4:3 Display",
    toolbarAspectNative: () => "Pixel-perfect",
    toolbarMute: () => "Mute",
    toolbarFddSeekSound: () => "FDD Seek Sound",
    toolbarToggleHddSlot: () => "Show HDD slot",
    toggleOn: () => "ON",
    toggleOff: () => "OFF",
    overlayNote1: () => "Audio requires a user gesture, so click to start.",
    overlayNote2: () => "You can also drag & drop HDD/FD disk images.",
    startBtn: () => "Click to Start",
    startBtnPlain: () => "Start Without a Disk",
    startBtnPending: () => "Boot with the Selected Disks",
    startBtnFreeDos: () => "Start with FreeDOS(98)",
    toolbarReset: () => "Reset to Original",
    toolbarFullscreen: () => "Fullscreen",
    toolbarMachineReset: () => "Reset Machine",
    toolbarScreenshot: () => "Screenshot",
    toolbarPause: () => "Pause",
    toolbarResume: () => "Resume",
    pauseOverlayLabel: () => "Paused",
    statusScreenshotSaved: () => "Screenshot saved.",
    toolbarMouse: () => "Capture Mouse (or right double-click the screen)",
    statusMouseCaptured: () => "Mouse captured. Press Esc to release.",
    statusMouseReleased: () => "Mouse capture released.",
    toolbarMouseResync: () => "Resync mouse (when the cursor drifts)",
    statusMouseResynced: () => "Mouse position resynced.",
    toolbarSaveState: () => "Save State",
    toolbarLoadState: () => "Load State",
    toolbarLanguage: () => "Language",
    resetConfirm: () => "This will discard your current progress and reset to the original distributed image. Continue?",
    fdSlotLabel: ({ drive: e }) => `FDD${e}`,
    hddSlotLabel: () => "HDD",
    fdEmpty: () => "(empty)",
    fdInsert: () => "Insert",
    hddInsertSet: () => "Set HDD image (does not boot)",
    hddEject: () => "Remove the selected HDD",
    hddSetFromLibrary: () => "Set from library",
    hddSetFromLibraryTitle: () => "Set as HDD",
    hddCreateBlank: () => "Create blank HDD (40MB, FAT16)",
    fdInsertFreeDos: () => "Insert FreeDOS(98)",
    diskLampLabel: ({ drive: e }) => `${e} access lamp`,
    fdInsertFromLibrary: () => "Insert from library",
    fdInsertFromLibraryTitle: ({ drive: e }) => `Insert into FDD${e}`,
    fdEject: () => "Eject",
    fdCreateBlank: () => "Create blank FD (1.2MB, FAT12 formatted)",
    slotDownload: () => "Download",
    statusMachineReset: () => "Machine reset.",
    statusClkTuning: () => "Tuning the optimal CPU speed...",
    statusClkAuto: ({ clk: e }) => `CPU speed: x${e} (auto)`,
    statusStateSaved: () => "State saved.",
    statusStateLoaded: () => "State loaded.",
    statusFdInserted: ({ drive: e, name: s }) => `Inserted into FDD${e}: ${s}`,
    statusFdEjected: ({ drive: e }) => `Ejected FDD${e}.`,
    statusFreeDosInserted: ({ drive: e }) => `Inserted FreeDOS(98) into FDD${e}. Reset the machine to boot it.`,
    dropUnsupported: () => "Unsupported file format (HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup, archives: .zip/.lzh)",
    dropNoDiskImage: () => "No disk image was found.",
    statusArchiveFailed: ({ name: e, message: s }) => `Failed to extract ${e}: ${s}`,
    statusLibraryAdded: ({ count: e }) => `Added ${e} image(s) to the disk library.`,
    statusArchiveResumed: ({ label: e, count: s }) => `${e}: Resumed ${s} image(s) from the previously extracted archive.`,
    statusArchiveNoDiskImage: ({ label: e }) => `${e}: No disk image found inside the archive.`,
    statusArchiveKindMismatch: ({ label: e, kind: s }) => `${e}: No ${s === "hdd" ? "HDD" : "FD"} image found inside the archive.`,
    statusArchiveNeedsSelection: () => "The archive contains multiple disks. Please choose one from the disk library.",
    statusDiskSet: ({ name: e }) => `Set ${e}. You can edit its contents via file transfer before boot. Press the boot button to start.`,
    statusDiskUnset: ({ name: e }) => `Removed ${e}.`,
    statusHddBlankCreated: ({ name: e }) => `Created and set blank HDD ${e} (40MB, FAT16). It is not bootable on its own — boot DOS from a floppy and use it as a data drive.`,
    dropConfirm: ({ count: e, names: s }) => `Loading ${e} file(s): ${s}
Continue?`,
    diskReplaceUnsupported: () => "Swapping disks after boot is planned for Phase 2. Please reload the page.",
    noMountedImage: () => "No image is currently mounted.",
    pickSlotPrompt: ({ action: e, slots: s }) => `Select a target to ${e}: ${s}`,
    pickSlotActionReset: () => "reset",
    statusPreparing: () => "Preparing to start…",
    statusDbUpgradeBlocked: () => "Please close other WebNP2 / WorkbenchNP2 tabs.",
    statusNoImage: () => "No image specified. Drag & drop a file to load it.",
    statusCoreBooting: () => "Starting the core…",
    statusBootSuccess: () => "Started.",
    statusBootFailed: ({ message: e }) => `Failed to start: ${e}`,
    statusResumed: ({ label: e, name: s }) => `${e}: Resuming from previous session (${s})`,
    urlLibSlotLabel: ({ index: e }) => `Library ${e}`,
    statusFetching: ({ label: e, name: s }) => `Fetching ${e}: ${s}`,
    statusFetchingProgress: ({ label: e, name: s, loaded: t, total: r }) => `Fetching ${e}: ${s} (${t}${r ? " / " + r : ""})`,
    fetchFailedNetwork: ({ url: e }) => `Failed to fetch image (check network error or CORS settings): ${e}`,
    fetchFailedHttp: ({ url: e, status: s }) => `Failed to fetch image (HTTP ${s}): ${e}`,
    fetchFailedOneDrive: ({ url: e }) => `Failed to fetch image: ${e}
OneDrive share links can't be used due to OneDrive's own restrictions. Please use Google Drive or Dropbox instead.`,
    fetchFailedNeedsProxy: ({ url: e }) => `Failed to fetch image: ${e}
This source can only be fetched through the relay server, but this build has no relay (VITE_DISK_PROXY) configured. If you're hosting this yourself, set VITE_DISK_PROXY (see the README for details).`,
    fetchFailedProxy: ({ url: e, reason: s }) => `Failed to fetch image: ${e}
${s}`,
    fetchFailedHtmlPage: ({ url: e }) => `The result was a web page, not a disk image: ${e}
Check that the share link is set to "Anyone with the link" can view, or drag & drop the downloaded file onto the page instead.`,
    proxyReasonBadUrl: () => "The relay server could not parse the URL.",
    proxyReasonOriginNotAllowed: () => "The relay server does not allow requests from this site.",
    proxyReasonHostNotAllowed: () => "The relay server does not allow forwarding to this source.",
    proxyReasonTooLarge: () => "The file exceeds the relay server's size limit.",
    proxyReasonRateLimited: () => "The relay server rate limit was reached. Please try again later.",
    proxyReasonUpstreamFailed: () => "The relay server failed to fetch from the source.",
    proxyReasonRedirectNotAllowed: () => 'The source tried to redirect to another site (e.g. a login page), so the request was blocked. Check that sharing is set to "Anyone with the link" and that you copied the full share link.',
    proxyReasonUnknown: ({ status: e }) => `The relay server returned an error (HTTP ${e}).`,
    audioMuted: () => "Audio is muted. Click to unmute",
    toolbarRomManager: () => "ROM Files",
    romDialogTitle: () => "Register ROM/Asset Files",
    romDialogDescription: () => "Register the ROM/asset files you use with the desktop NP2kai (bios.rom, itf.rom, sound.rom, font.rom, etc.). They are saved only in your browser (IndexedDB) and automatically loaded on future starts. Nothing is sent to any server. YM2608 rhythm samples (2608_*.wav) already work without registering anything, since a substitute set is bundled (it is not the real YM2608 chip's rhythm sound, but an alternative crafted by its author). If you have the real thing, registering 2608_*.wav will take priority over the bundled substitute.",
    romDialogSelectFiles: () => "Select Files",
    romDialogDropHint: () => "You can also drag & drop files onto this dialog to register them.",
    romDialogListEmpty: () => "No files registered yet.",
    romDialogDelete: () => "Delete",
    romDialogReloadNote: () => "Reload the page for changes to take effect.",
    romDialogReloadBtn: () => "Reload Page",
    romDialogClose: () => "Close",
    romDialogSaved: ({ saved: e, skipped: s }) => `Registered ${e} file(s).${s > 0 ? ` (${s} skipped as unsupported)` : ""}`,
    romDialogSkippedNote: ({ names: e }) => `Skipped unsupported files: ${e}`,
    romDialogRejectedNote: ({ items: e }) => `Not registered (fmgen cannot load this format, and registering it as-is would silence not just this file but all 6 rhythm samples, so registration was cancelled): ${e}`,
    rhythmRejectReasonNotRiffWave: () => "Not a RIFF/WAVE file.",
    rhythmRejectReasonNoFmtChunk: () => "Structure differs from a standard WAV; can't locate the fmt chunk.",
    rhythmRejectReasonNotPcm: () => "Not linear PCM (compressed WAV is unsupported).",
    rhythmRejectReasonNotMono: () => "Not a mono WAV (stereo etc. is unsupported).",
    rhythmRejectReasonNoDataChunk: () => "No data chunk found.",
    rhythmRejectReasonTooManySamples: () => "Too many samples (the WAV is too long).",
    rhythmRejectReasonNot16Bit: () => "Not 16-bit linear PCM. Only mono, 16-bit, linear PCM WAV files can be registered.",
    overlayLibraryBtn: () => "Boot from Saved Disk",
    toolbarDiskLibrary: () => "Disk Library",
    libraryDialogTitle: () => "Disk Library",
    libraryDialogDescription: () => "These are the HDD/FD disk images previously saved in your browser (IndexedDB), including your progress. Nothing is sent to any server. You can also drag & drop files onto this dialog to register them.",
    libraryGroupFocusHint: () => "Contents of the imported archive. Choose a disk to use.",
    libraryDialogListEmpty: () => "No saved disk images yet.",
    libraryKindHdd: () => "HDD",
    libraryKindFd: () => "FD",
    libraryActionBoot: () => "Boot",
    libraryActionSetHdd: () => "Set as HDD",
    libraryActionInsertFd1: () => "Insert into FD1",
    libraryActionInsertFd2: () => "Insert into FD2",
    libraryActionDelete: () => "Delete",
    libraryActionNeedsRestart: () => "Reload the page to boot from this",
    libraryDeleteConfirm: ({ name: e }) => `This will delete the saved data "${e}". Continue?`,
    libraryActionRename: () => "Rename",
    libraryRenamePrompt: ({ name: e }) => `Enter a display name (original file name: ${e})`,
    libraryRenameGroupPrompt: () => "Enter a folder name",
    libraryGroupCount: ({ count: e }) => `${e} disk(s)`,
    libraryDeleteGroupConfirm: ({ name: e, count: s }) => `This will delete all ${s} image(s) in the folder "${e}". Continue?`,
    libraryMenuBack: () => "← Back",
    libraryDialogClose: () => "Close",
    toolbarPasteText: () => "Send Text (or double-tap Shift)",
    toolbarVirtualKbd: () => "On-screen keyboard",
    pasteBarPlaceholder: () => "Type text to send…",
    pasteBarSetupBtn: () => "Enable full-width input",
    pasteBarSetupNote: () => "This guest drops full-width characters. Installing the guest helper (bundled tool disk) enables them. Run it at a DOS command prompt.",
    statusPasteHelperSetup: () => "Enabling full-width input…",
    statusPasteHelperOk: () => "Full-width input enabled.",
    statusPasteHelperFailed: ({ message: e }) => `Could not enable full-width input: ${e}`,
    pasteBarEnterLabel: () => "With Enter",
    pasteBarSend: () => "Send",
    pasteBarClose: () => "Close",
    statusPasteSkipped: ({ count: e, chars: s }) => `Skipped ${e} unsupported character(s): ${s}`,
    toolbarDebugger: () => "Debugger",
    debuggerTitle: () => "CPU Debugger",
    debuggerPause: () => "Pause",
    debuggerResume: () => "Resume",
    debuggerStep: () => "Step (1 instruction)",
    debuggerStep10: () => "Step ×10",
    debuggerRunToBp: () => "Run to BP",
    debuggerClose: () => "Close",
    debuggerRegisters: () => "Registers",
    debuggerDisassembly: () => "Disassembly (tap a line to toggle BP)",
    debuggerMemory: () => "Memory dump",
    debuggerMemoryAddress: () => "Physical address (hex)",
    debuggerMemoryRead: () => "Read",
    debuggerMemoryInvalid: () => "Enter a hexadecimal memory address.",
    debuggerPaused: () => "CPU paused.",
    debuggerResumed: () => "CPU resumed.",
    debuggerStepped: ({ count: e }) => `Executed ${e} instruction(s).`,
    debuggerAddBreakpoint: () => "Add breakpoint",
    debuggerRemoveBreakpoint: () => "Remove breakpoint",
    debuggerBreakpointAdded: ({ index: e, seg: s, off: t }) => `Set BP${e} at ${s}:${t}.`,
    debuggerBreakpointRemoved: ({ seg: e, off: s }) => `Removed BP at ${e}:${s}.`,
    debuggerBreakpointLimit: () => "The maximum of 8 breakpoints is already in use.",
    debuggerBreakpointHit: ({ index: e }) => `Stopped at BP${e}.`,
    debuggerBreakpointMiss: () => "No breakpoint reached within 100000 instructions.",
    toolbarFileManager: () => "File Transfer",
    fmDialogTitle: () => "File Transfer",
    fmDialogNote: () => "Note: avoid transferring while the guest is accessing the floppy (FDD light on). HDD images can only be selected before boot.",
    fmHostPaneTitle: () => "This browser",
    fmDiskPaneTitle: () => "Disk image (PC-98)",
    fmSelectFilesBtn: () => "Select Files",
    fmDropHint: () => "You can drag & drop files here (.lzh/.zip are extracted automatically).",
    fmStagedEmpty: () => "No files added yet.",
    fmArchiveError: ({ name: e, message: s }) => `Failed to extract ${e}: ${s}`,
    fmRemoveBtn: () => "Remove",
    fmTransferToDiskBtn: () => "Send to Disk (→)",
    fmTransferToHostBtn: () => "Fetch to Host (←)",
    fmUnmountedLabel: () => "not mounted",
    fmMountedBadge: () => "mounted",
    fmNotEditableNote: () => "not editable",
    fmPathRoot: () => "/ (root)",
    fmUpDir: () => ".. Up",
    fmDirMarker: () => "DIR",
    fmDeleteSelectedBtn: () => "Delete Selected",
    fmMakeDirBtn: () => "New Folder",
    fmMakeDirPrompt: () => "Enter a new folder name (8.3 format):",
    fmMakeDirInvalidName: ({ name: e }) => `Folder name must be 8.3 format (no double-byte/long names): ${e}`,
    fmCreateTransferFdBtn: () => "Create Transfer FD",
    fmTransferFdCreated: ({ name: e }) => `Created transfer FD "${e}".`,
    fmFreeSpaceLabel: ({ free: e, total: s }) => `Free space: ${e} / ${s}`,
    fmSelectEditableTarget: () => "Select an editable disk (D88 is unsupported; HDD images can only be edited before boot).",
    fmEmptyDir: () => "(empty folder)",
    fmRenameConfirm: ({ list: e }) => `These files will be sent to the disk with the following 8.3 names. Continue?

${e}`,
    fmOverwriteConfirm: ({ names: e }) => `This will overwrite existing file(s): ${e}
Continue?`,
    fmInsufficientSpace: ({ needed: e, free: s }) => `Not enough free space (needed: ${e} / free: ${s}).`,
    fmTransferring: ({ current: e, total: s }) => `Transferring… (${e}/${s})`,
    fmTransferDone: ({ succeeded: e }) => `${e} file(s) transferred successfully.`,
    fmTransferFailedDetail: ({ names: e }) => `Some transfers failed: ${e}`,
    fmDeleteConfirm: ({ names: e }) => `This will delete the following file(s): ${e}
Continue?`,
    fmCloseBtn: () => "Close",
    fmListLoadFailed: ({ message: e }) => `Failed to load listing: ${e}`,
    toolbarGamepad: () => "Input Settings (Gamepad/Keyboard)",
    gamepadDialogTitle: () => "Gamepad Settings",
    gamepadDialogDescription: () => "Assign buttons/axes on each connected gamepad to PC-98 keys. Settings are saved in your browser, per pad.",
    gamepadDialogClose: () => "Close",
    gamepadNoPads: () => "No pad detected. Press any button on the pad once to have it recognized.",
    gamepadConnectedTitle: () => "Connected Pads",
    gamepadLiveTitle: ({ name: e }) => e,
    gamepadPhysicalTitle: () => "Physical Input",
    gamepadKeysTitle: () => "PC-98 Key Output",
    gamepadEditingPadLabel: () => "Editing Pad",
    gamepadBindingsTitle: () => "Edit Assignment",
    gamepadBindingsEmpty: () => "No assignments yet. Use [Add] below to create one.",
    gamepadUnassignedKeyLabel: () => "(unset)",
    gamepadClearBtn: () => "Clear",
    gamepadClearBtnTitle: () => "Remove this row's assignment",
    gamepadRedetectBtn: () => "Redetect",
    gamepadRedetectBtnTitle: () => "Replaces this row's physical input with the next one you press (the assigned key stays the same)",
    gamepadAddBtn: () => "Add",
    gamepadAddBtnTitle: () => "Adds a new row for the next button/axis you press",
    gamepadCancelBtn: () => "Cancel",
    gamepadCancelBtnTitle: () => "Stops waiting for input and returns to normal",
    gamepadDetectWaiting: () => "Waiting for input… (Esc to cancel)",
    gamepadPendingPickKey: () => "Detected. Pick the key to assign on the keyboard below.",
    gamepadRowSelectedHint: () => "Row selected: press a key on the keyboard below to assign it to this row.",
    gamepadPickerIdleHint: () => "Select a row to assign, or press [Detect New] and then press a button on the pad.",
    gamepadDeadzoneLabel: () => "Deadzone",
    gamepadKeyPickerTitle: () => "PC-98 keyboard (click to select, no keys are sent)",
    gamepadPresetCursorZxBtn: () => "Cursor Keys + Z/X",
    gamepadPresetCursorZxBtnTitle: () => "Reassigns the D-Pad/left stick to cursor keys and A/B to Z/X (clears existing assignments)",
    gamepadPresetTenkeySpaceBtn: () => "Numpad + SPACE",
    gamepadPresetTenkeySpaceBtnTitle: () => "Reassigns the D-Pad/left stick to numpad directions and A/B to SPACE/ENTER (clears existing assignments)",
    gamepadButtonLabel: ({ index: e }) => `Button ${e}`,
    gamepadAxisLabel: ({ index: e, dir: s }) => `Axis ${e} ${s}`,
    gamepadAxisInvalidSuffix: () => "(invalid, out of range)",
    gamepadAxisUncalibratedSuffix: () => "(not calibrated yet — move it once to use)",
    gamepadAxisCalibratingSuffix: () => "(calibrating — please wait a few seconds)",
    gamepadPositionalButtonLabel: ({ index: e, position: s }) => `#${e} (${s})`,
    gamepadPosDown: () => "Down",
    gamepadPosRight: () => "Right",
    gamepadPosLeft: () => "Left",
    gamepadPosUp: () => "Up",
    gamepadPosL: () => "L",
    gamepadPosR: () => "R",
    gamepadPosL2: () => "L2",
    gamepadPosR2: () => "R2",
    gamepadPosSelect: () => "Select",
    gamepadPosStart: () => "Start",
    gamepadPosL3: () => "L3",
    gamepadPosR3: () => "R3",
    gamepadPosDpadUp: () => "D-Pad Up",
    gamepadPosDpadDown: () => "D-Pad Down",
    gamepadPosDpadLeft: () => "D-Pad Left",
    gamepadPosDpadRight: () => "D-Pad Right",
    gamepadPosHome: () => "Home",
    inputSettingsDialogTitle: () => "Input Settings",
    inputTabGamepad: () => "Gamepad",
    inputTabHostkey: () => "Keyboard",
    inputTabVpad: () => "Virtual Pad",
    inputPanelSwitchKeyboard: () => "Switch to virtual keyboard",
    inputPanelSwitchPad: () => "Switch to virtual pad",
    inputPanelSwitchTrackpad: () => "Switch to virtual trackpad",
    kbdToggleTenkey: () => "Numpad",
    vpadEditAssignmentsMenuItem: () => "Edit assignments",
    vpadDialogDescription: () => "Assign PC-98 keys to the on-screen direction pad and buttons. Duplicate a built-in profile to edit it.",
    vpadProfileLabel: () => "Profile",
    vpadProfileCursorZx: () => "Cursor Keys + Z/X",
    vpadProfileTenkey: () => "Tenkey + Z/X",
    vpadNewProfileBtn: () => "New",
    vpadNewProfilePrompt: () => "Enter a name for the new profile:",
    vpadDuplicateProfileBtn: () => "Duplicate",
    vpadDuplicateProfilePrompt: () => "Enter a name for the duplicated profile:",
    vpadDuplicateDefaultName: ({ name: e }) => `${e} copy`,
    vpadRenameProfileBtn: () => "Rename",
    vpadRenameProfilePrompt: () => "Enter a new profile name:",
    vpadDeleteProfileBtn: () => "Delete",
    vpadDeleteProfileConfirm: ({ name: e }) => `Delete profile "${e}"?`,
    vpadBuiltinReadonlyNote: () => "Built-in profiles cannot be edited or deleted. Duplicate one to edit it.",
    vpadSourceUp: () => "Direction Up",
    vpadSourceDown: () => "Direction Down",
    vpadSourceLeft: () => "Direction Left",
    vpadSourceRight: () => "Direction Right",
    vpadSourceButton: ({ name: e }) => `Button ${e}`,
    vpadSourceOption: ({ n: e }) => `Option ${e}`,
    vpadUnassigned: () => "(unset)",
    vpadClearBindingBtn: () => "Clear",
    vpadPickerIdleHint: () => "Select a binding row in an editable profile.",
    vpadPendingPickKey: () => "Pick the PC-98 key to assign to the selected row below.",
    hostkeyDialogDescription: () => "Remap physical keys on your host PC to any PC-98 key. Useful on laptops without a numeric keypad, so tenkey-only controls can be driven from e.g. the arrow keys.",
    hostkeyEnableLabel: () => "Enable key remapping",
    hostkeyBuiltinTenkeyLabel: () => "Tenkey Movement (Arrows → Tenkey)",
    hostkeyProfileLabel: () => "Profile",
    hostkeyNewProfileBtn: () => "New",
    hostkeyNewProfilePrompt: () => "Enter a name for the new profile:",
    hostkeyDuplicateProfileBtn: () => "Duplicate",
    hostkeyDuplicateProfilePrompt: ({ name: e }) => `Duplicating "${e}". Enter a name for the copy:`,
    hostkeyDuplicateDefaultName: ({ name: e }) => `${e} copy`,
    hostkeyRenameProfileBtn: () => "Rename",
    hostkeyRenameProfilePrompt: () => "Enter a new name for the profile:",
    hostkeyDeleteProfileBtn: () => "Delete",
    hostkeyDeleteProfileConfirm: ({ name: e }) => `Delete profile "${e}"? This cannot be undone.`,
    profileNameInputLabel: () => "Profile name",
    profileNameOk: () => "OK",
    profileNameCancel: () => "Cancel",
    profileNameRequired: () => "Enter a name containing non-whitespace characters.",
    hostkeyBuiltinReadonlyNote: () => "Built-in profiles cannot be edited or deleted (duplicate it first).",
    hostkeyBindingsEmpty: () => "No bindings yet. Use [Add] below to add one.",
    hostkeyAddBtn: () => "Add",
    hostkeyAddBtnTitle: () => "Adds a new row for the next physical key you press on the host",
    hostkeyDetectWaiting: () => "Press a key on the host…(Esc to cancel)",
    hostkeyPendingPickKey: () => "Detected. Now pick the PC-98 key to assign it to, below.",
    hostkeyPickerIdleHint: () => "Press [Add], then press a key on the host keyboard.",
    hostkeyClearBtn: () => "Clear",
    hostkeyClearBtnTitle: () => "Clears the binding for this row",
    hostkeyCancelBtn: () => "Cancel",
    tenkeyKeyLabel: ({ key: e }) => `Tenkey ${e}`,
    errD88NotEditable: () => "The D88 format is not supported for editing.",
    errHddInvalidHeader: ({ format: e }) => `Invalid ${e} header.`,
    errHddNoFatPartition: () => "No FAT16/12 partition was found in this HDD image.",
    errMountedUseSlotApi: () => "This image is mounted — use the slot controls instead.",
    errHddEditBeforeBootOnly: () => "HDD images can only be edited before boot.",
    errHddSlotUnsupported: () => "This operation supports FD1/FD2 only (not HDD).",
    errInvalidShortName: ({ name: e }) => `File names must be in 8.3 form (no double-byte or long names): ${e}`
  }
};
function pr() {
  try {
    const e = localStorage.getItem(fr);
    return e === "ja" || e === "en" ? e : null;
  } catch {
    return null;
  }
}
function gr() {
  var t;
  const e = new URLSearchParams(location.search).get("lang");
  if (e === "ja" || e === "en") return e;
  const s = pr();
  return s || ((t = navigator.language) != null && t.toLowerCase().startsWith("ja") ? "ja" : "en");
}
let ne = null;
function br() {
  return ne === null && (ne = gr()), ne;
}
function k(e, ...s) {
  const t = mr[br()][e];
  return t(...s);
}
const he = "".trim().replace(/\/+$/, ""), yr = ["1drv.ms", "onedrive.live.com", "sharepoint.com"], wr = ["drive.google.com", "docs.google.com", "www.dropbox.com", "dropbox.com"], Sr = ["drive.google.com", "docs.google.com"], Dr = ["www.dropbox.com", "dropbox.com"], kr = "dl.dropboxusercontent.com";
function Pr(e) {
  let s;
  try {
    s = new URL(e);
  } catch {
    return e;
  }
  return V(s.hostname, Dr) ? (s.hostname = kr, s.toString()) : e;
}
function vr(e) {
  try {
    return new URL(e).hostname;
  } catch {
    return "";
  }
}
function V(e, s) {
  return s.some((t) => e === t || e.endsWith(`.${t}`));
}
const Er = ["<!do", "<htm", "<?xm"];
function dt(e, s) {
  if (s && s.toLowerCase().startsWith("text/html")) return !0;
  if (e.length < 4) return !1;
  const t = new TextDecoder("ascii", { fatal: !1 }).decode(e.subarray(0, 5)).toLowerCase();
  return Er.some((r) => t.startsWith(r));
}
function Tr(e, s) {
  switch (s) {
    case "bad_url":
      return k("proxyReasonBadUrl");
    case "origin_not_allowed":
      return k("proxyReasonOriginNotAllowed");
    case "host_not_allowed":
      return k("proxyReasonHostNotAllowed");
    case "too_large":
      return k("proxyReasonTooLarge");
    case "rate_limited":
      return k("proxyReasonRateLimited");
    case "upstream_failed":
      return k("proxyReasonUpstreamFailed");
    case "redirect_not_allowed":
      return k("proxyReasonRedirectNotAllowed");
    default:
      return k("proxyReasonUnknown", { status: e });
  }
}
async function ct(e, s) {
  const t = e.headers.get("content-length"), r = t ? Number(t) : null;
  if (!e.body) {
    const d = await e.arrayBuffer();
    return s(d.byteLength, r), new Uint8Array(d);
  }
  const o = e.body.getReader(), n = [];
  let i = 0;
  for (; ; ) {
    const { done: d, value: u } = await o.read();
    if (d) break;
    u && (n.push(u), i += u.byteLength, s(i, r));
  }
  const a = new Uint8Array(i);
  let l = 0;
  for (const d of n)
    a.set(d, l), l += d.byteLength;
  return a;
}
async function Rr(e, s, t) {
  const r = `${he}/fetch?url=${encodeURIComponent(e)}`;
  let o;
  try {
    o = await fetch(r);
  } catch {
    throw t;
  }
  if (!o.ok) {
    let i;
    try {
      i = (await o.clone().json()).error;
    } catch {
    }
    throw new Error(k("fetchFailedProxy", { url: e, reason: Tr(o.status, i) }));
  }
  const n = await ct(o, s);
  if (dt(n, o.headers.get("content-type")))
    throw new Error(k("fetchFailedHtmlPage", { url: e }));
  return n;
}
async function Fr(e, s) {
  const t = () => {
  }, r = vr(e);
  if (V(r, yr))
    throw new Error(k("fetchFailedOneDrive", { url: e }));
  const o = !!he && V(r, Sr);
  let n, i = !1;
  if (!o) {
    const l = Pr(e);
    try {
      const d = await fetch(l);
      if (!d.ok)
        throw new Error(k("fetchFailedHttp", { url: l, status: d.status }));
      const u = await ct(d, t);
      if (!dt(u, d.headers.get("content-type")))
        return u;
      i = !0;
    } catch (d) {
      n = d instanceof Error && d.message ? d : new Error(k("fetchFailedNetwork", { url: l }));
    }
  }
  if (!he)
    throw i ? new Error(k("fetchFailedHtmlPage", { url: e })) : n ? V(r, wr) ? new Error(k("fetchFailedNeedsProxy", { url: e })) : n : new Error(k("fetchFailedNeedsProxy", { url: e }));
  const a = n ?? new Error(k("fetchFailedNetwork", { url: e }));
  return await Rr(e, t, a);
}
const Cr = 12, ut = (e) => e.replace(/\s+$/, ""), $r = /^\.+$/;
function Me(e, s) {
  let t = -1;
  for (let o = e.length - 1; o >= 0; o--)
    if (e[o] !== "") {
      t = o;
      break;
    }
  const r = s ? Math.min(Math.max(s.row, 0), e.length - 1) : -1;
  return Math.max(r, t, 0);
}
function Ne(e) {
  return e.map((s) => {
    const t = ut(s);
    return $r.test(t) ? "" : t;
  });
}
function ie(e, s) {
  const t = [];
  let r = 0;
  for (; r < s && e[r] === ""; ) r++;
  for (let o = r; o < s; o++) t.push({ type: "line", text: e[o] });
  return (e[s] !== "" || t.length > 0) && t.push({ type: "pending", text: e[s] }), t;
}
function Br(e, s, t, r) {
  const o = Ne(t), n = o.length;
  if (n === 0) return [];
  const i = Me(o, r);
  if (e === null) return ie(o, i);
  const a = Ne(e);
  if (a.length !== n)
    return a.every((f) => f === "") ? ie(o, i) : [{ type: "takeover" }];
  const l = Me(a, s), d = (f) => {
    for (let m = f; m < l; m++)
      if (o[m - f] !== a[m]) return !1;
    return !0;
  }, u = (f) => {
    let m = a[l].length;
    for (let p = f; p < l; p++) m += a[p].length;
    return m;
  };
  let c = -1;
  for (let f = 0; f <= l && !(f > 0 && i !== n - 1); f++) {
    if (!d(f)) continue;
    const m = l - f;
    if (o[m].startsWith(a[l]) && !(f > 0 && u(f) < Cr)) {
      c = f;
      break;
    }
  }
  if (c < 0 && d(0) && i === l && (c = 0), c >= 0) {
    const f = l - c;
    if (i < f) return [{ type: "takeover" }];
    const m = [];
    for (let b = f; b < i; b++) m.push({ type: "line", text: o[b] });
    const p = i !== f || o[i] !== a[l];
    return (m.length > 0 || p) && m.push({ type: "pending", text: o[i] }), m;
  }
  if (i === n - 1) {
    const f = [{ type: "gap" }];
    for (let m = 0; m < i; m++) f.push({ type: "line", text: o[m] });
    return f.push({ type: "pending", text: o[i] }), f;
  }
  if (r && xr(o) > Math.min(r.row, n - 1)) return [{ type: "takeover" }];
  const h = [{ type: "clear" }];
  return h.push(...ie(o, i)), h;
}
function xr(e) {
  for (let s = e.length - 1; s >= 0; s--) if (e[s] !== "") return s;
  return -1;
}
function Ar(e, s) {
  return e.length < 2 || !s ? 0 : ut(e[e.length - 1]) !== "" && s.row < e.length - 1 ? 1 : 0;
}
function Le(e, s, t) {
  if (t <= 0) return { lines: e, cursor: s };
  const r = e.slice(0, e.length - t);
  return { lines: r, cursor: s && s.row < r.length ? s : null };
}
class _e {
  constructor(s = 3) {
    g(this, "prev", null);
    g(this, "prevKey", "");
    g(this, "candidate", null);
    g(this, "held", 0);
    g(this, "statusRows", 0);
    g(this, "inTakeover", !1);
    this.maxHold = s;
  }
  push(s, t) {
    if (s.length === 0) return [];
    const r = JSON.stringify([s, t]);
    if (this.candidate === null)
      return this.prev !== null && r === this.prevKey ? [] : (this.candidate = { key: r, lines: s, cursor: t }, this.held = 0, []);
    if (r === this.candidate.key) {
      const o = this.candidate;
      return this.candidate = null, this.commit(o.key, o.lines, o.cursor);
    }
    return this.held++, this.held >= this.maxHold ? (this.candidate = null, this.commit(r, s, t)) : (this.candidate = { key: r, lines: s, cursor: t }, []);
  }
  commit(s, t, r) {
    this.statusRows = Math.max(this.statusRows, Ar(t, r));
    const o = Le(t, r, this.statusRows), n = this.prev ? Le(this.prev.lines, this.prev.cursor, this.statusRows) : null;
    let i = Br((n == null ? void 0 : n.lines) ?? null, (n == null ? void 0 : n.cursor) ?? null, o.lines, o.cursor);
    return i.length === 1 && i[0].type === "takeover" ? (this.inTakeover && (i = []), this.inTakeover = !0) : i.length > 0 && (this.inTakeover = !1), this.prev = { lines: t, cursor: r }, this.prevKey = s, i;
  }
}
const Mr = 41 * 4, Nr = 259, Lr = 16;
class _r {
  constructor() {
    g(this, "base", -1);
    // ヘッダの物理アドレス
    g(this, "last", 0);
  }
  // 前回読んだ総数
  /** ヘッダの物理アドレスと内容を返す。TSR でなければ null。 */
  header(s) {
    let t;
    try {
      t = s(Mr, 4);
    } catch {
      return null;
    }
    const r = t[2] | t[3] << 8, o = r * 16 + Nr;
    let n;
    try {
      n = s(o, Lr);
    } catch {
      return null;
    }
    if (n[0] !== 67 || n[1] !== 79 || n[2] !== 78 || n[3] !== 72)
      return null;
    const i = n[4] | n[5] << 8, a = n[6] | n[7] << 8;
    if (i !== 1 || a < 256 || a & a - 1) return null;
    const l = (n[8] | n[9] << 8 | n[10] << 16 | n[11] << 24) >>> 0, d = n[12] | n[13] << 8;
    return { base: o, size: a, total: l, bufAddr: r * 16 + d };
  }
  /** TSR が常駐しているかだけを調べる(基準は動かさない)。 */
  isResident(s) {
    return this.header(s) !== null;
  }
  poll(s) {
    const t = new Uint8Array(0), r = this.header(s);
    if (!r)
      return this.base = -1, { resident: !1, bytes: t, lost: 0, attached: !1 };
    if (r.base !== this.base)
      return this.base = r.base, this.last = r.total, { resident: !0, bytes: t, lost: 0, attached: !0 };
    const o = r.total - this.last >>> 0;
    if (o === 0)
      return { resident: !0, bytes: t, lost: 0, attached: !1 };
    if (o > 2147483648)
      return this.last = r.total, { resident: !0, bytes: t, lost: 0, attached: !0 };
    let n = 0, i = o;
    o > r.size && (n = o - r.size, i = r.size);
    const l = r.total - i >>> 0 & r.size - 1, d = Math.min(i, r.size - l), u = new Uint8Array(i);
    return u.set(s(r.bufAddr + l, d), 0), d < i && u.set(s(r.bufAddr, i - d), d), this.last = r.total, { resident: !0, bytes: u, lost: n, attached: !1 };
  }
}
const Ir = (e) => e.replace(/\s+$/, ""), Ie = typeof TextDecoder < "u" ? new TextDecoder("shift_jis") : null, He = /* @__PURE__ */ new Map();
function Hr(e, s) {
  const t = e << 8 | s;
  let r = He.get(t);
  return r === void 0 && (r = Ie ? Ie.decode(new Uint8Array([e, s])) : "?", r.length !== 1 && (r = "?"), He.set(t, r)), r;
}
const Or = (e) => e >= 129 && e <= 159 || e >= 224 && e <= 252, Ur = (e) => e >= 64 && e <= 252 && e !== 127;
class Oe {
  constructor() {
    g(this, "cells", []);
    g(this, "col", 0);
    g(this, "lead", -1);
    g(this, "esc", "none");
    g(this, "csi", "");
    g(this, "takeover", !1);
    g(this, "sawPrintable", !1);
    g(this, "skipToLf", !1);
    g(this, "lastPending", null);
    g(this, "lineRow", null);
    // 入力行の推定行番号(1始まり)
    g(this, "maxRow", 24);
    g(this, "evs", []);
    g(this, "linesThisPush", 0);
  }
  /** 現在の入力行の内容を与える(screen 方式から stream 方式へ切り替える時に使う)。 */
  seed(s) {
    this.cells = [], this.col = 0;
    for (const t of s) {
      const r = t.codePointAt(0) > 255 && !(t >= "｡" && t <= "ﾟ");
      this.cells[this.col++] = t, r && (this.cells[this.col++] = null);
    }
    this.lastPending = this.lineText();
  }
  /** バイト列を流し込み、確定した行・入力中の行などをイベントで返す。 */
  push(s) {
    this.evs = [], this.linesThisPush = 0;
    for (let r = 0; r < s.length; r++) this.feed(s[r] & 255);
    this.flushPending();
    const t = this.evs;
    return this.evs = [], t;
  }
  /** バイト列の途中を失った。 */
  gap() {
    return this.cells = [], this.col = 0, this.lead = -1, this.esc = "none", this.csi = "", this.skipToLf = !0, this.takeover = !1, this.lineRow = null, this.lastPending = "", [{ type: "gap" }, { type: "pending", text: "" }];
  }
  lineText() {
    let s = "";
    for (let t = 0; t < this.cells.length; t++) {
      const r = this.cells[t];
      s += r === void 0 ? " " : r ?? "";
    }
    return Ir(s);
  }
  flushPending() {
    if (this.takeover) return;
    const s = this.lineText();
    (this.linesThisPush > 0 || s !== this.lastPending) && (this.evs.push({ type: "pending", text: s }), this.lastPending = s);
  }
  put(s, t) {
    if (this.sawPrintable = !0, this.takeover) return;
    this.cells[this.col] === null && this.col > 0 && (this.cells[this.col - 1] = " "), t && this.cells[this.col + 1] === null && (this.cells[this.col + 2] = " ");
    const r = this.cells[this.col];
    typeof r == "string" && r.codePointAt(0) > 255 && !(r >= "｡" && r <= "ﾟ") && (this.cells[this.col + 1] = " "), this.cells[this.col++] = s, t && (this.cells[this.col++] = null);
  }
  newline() {
    if (this.takeover) {
      this.sawPrintable && (this.takeover = !1), this.cells = [], this.col = 0;
      return;
    }
    this.evs.push({ type: "line", text: this.lineText() }), this.linesThisPush++, this.lineRow !== null && (this.lineRow = Math.min(this.lineRow + 1, this.maxRow)), this.cells = [], this.col = 0, this.lastPending = null;
  }
  enterTakeover() {
    this.sawPrintable = !1, !this.takeover && (this.takeover = !0, this.cells = [], this.col = 0, this.evs.push({ type: "takeover" }));
  }
  doClear() {
    this.takeover || (this.cells = [], this.col = 0, this.lineRow = 1, this.lastPending = null, this.evs.push({ type: "clear" }));
  }
  feed(s) {
    if (this.skipToLf) {
      s === 10 && (this.skipToLf = !1, this.lastPending = null);
      return;
    }
    if (this.esc !== "none") {
      this.feedEsc(s);
      return;
    }
    if (this.lead >= 0) {
      const t = this.lead;
      if (this.lead = -1, Ur(s)) {
        this.put(Hr(t, s), !0);
        return;
      }
    }
    s === 27 ? this.esc = "esc" : s === 10 ? this.newline() : s === 13 ? this.col = 0 : s === 8 ? this.col > 0 && this.col-- : s === 9 ? this.col = this.col + 8 & -8 : s < 32 || (s <= 126 ? this.put(String.fromCharCode(s), !1) : s >= 161 && s <= 223 ? this.put(String.fromCharCode(65377 + (s - 161)), !1) : Or(s) && (this.lead = s));
  }
  feedEsc(s) {
    switch (this.esc) {
      case "esc":
        s === 91 ? (this.esc = "csi", this.csi = "") : s === 61 ? (this.esc = "skip2", this.enterTakeover()) : s === 40 || s === 41 || s === 42 || s === 43 ? this.esc = "skip1" : (this.esc = "none", s === 99 ? this.doClear() : s === 69 ? this.newline() : (s === 68 || s === 77) && this.enterTakeover());
        return;
      case "skip1":
        this.esc = "none";
        return;
      case "skip2":
        this.esc = "skip1";
        return;
      case "csi":
        s >= 64 && s <= 126 ? (this.esc = "none", this.csiFinal(s, this.csi), this.csi = "") : s >= 32 && s <= 63 ? this.csi.length < 32 && (this.csi += String.fromCharCode(s)) : (this.esc = "none", this.csi = "");
    }
  }
  csiFinal(s, t) {
    const r = String.fromCharCode(s);
    if (/^[>?<=]/.test(t)) return;
    const o = parseInt(t.split(";")[0], 10), n = Number.isFinite(o) ? o : NaN, i = Number.isFinite(n) && n > 0 ? n : 1;
    switch (r) {
      case "J":
        n === 2 ? this.doClear() : this.takeover || (this.cells.length = Math.min(this.cells.length, this.col));
        return;
      case "K":
        if (this.takeover) return;
        if (Number.isNaN(n) || n === 0)
          this.cells.length = Math.min(this.cells.length, this.col);
        else if (n === 1)
          for (let a = 0; a <= this.col; a++) this.cells[a] = " ";
        else this.cells = [];
        return;
      case "D":
        this.takeover || (this.col = Math.max(0, this.col - i));
        return;
      case "C":
        this.takeover || (this.col += i);
        return;
      case "H":
      case "f": {
        const a = t.split(";"), l = Math.max(1, parseInt(a[0], 10) || 1), d = Math.max(1, parseInt(a[1], 10) || 1);
        !this.takeover && (this.lineRow === l || d - 1 === this.col) ? (this.lineRow = l, this.maxRow = Math.max(this.maxRow, l), this.col = d - 1) : this.enterTakeover();
        return;
      }
      case "A":
      case "B":
      case "E":
      case "F":
      case "G":
      case "d":
      case "s":
      case "u":
      case "L":
      case "M":
      case "P":
      case "@":
        this.enterTakeover();
        return;
      default:
        return;
    }
  }
}
const L = {
  ESC: 0,
  BS: 14,
  TAB: 15,
  ENTER: 28,
  CR: 28,
  RETURN: 28,
  SPACE: 52,
  UP: 58,
  LEFT: 59,
  RIGHT: 60,
  DOWN: 61,
  INS: 56,
  DEL: 57,
  ROLLUP: 54,
  ROLLDOWN: 55,
  HOME: 62,
  CLR: 62,
  HELP: 63,
  XFER: 53,
  NFER: 81,
  STOP: 96,
  COPY: 97,
  F1: 98,
  F2: 99,
  F3: 100,
  F4: 101,
  F5: 102,
  F6: 103,
  F7: 104,
  F8: 105,
  F9: 106,
  F10: 107,
  SHIFT: 112,
  CAPS: 113,
  KANA: 114,
  GRPH: 115,
  CTRL: 116,
  // テンキー(出典: NP2kai sdl/kbtrans.c:109-126)。
  KP_MINUS: 64,
  KP_DIVIDE: 65,
  KP7: 66,
  KP8: 67,
  KP9: 68,
  KP_MULTIPLY: 69,
  KP4: 70,
  KP5: 71,
  KP6: 72,
  KP_PLUS: 73,
  KP1: 74,
  KP2: 75,
  KP3: 76,
  KP_EQUALS: 77,
  KP0: 78,
  KP_COMMA: 79,
  KP_PERIOD: 80
}, ae = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  0: 10,
  "-": 11,
  "^": 12,
  "\\": 13,
  q: 16,
  w: 17,
  e: 18,
  r: 19,
  t: 20,
  y: 21,
  u: 22,
  i: 23,
  o: 24,
  p: 25,
  "@": 26,
  "[": 27,
  a: 29,
  s: 30,
  d: 31,
  f: 32,
  g: 33,
  h: 34,
  j: 35,
  k: 36,
  l: 37,
  ";": 38,
  ":": 39,
  "]": 40,
  z: 41,
  x: 42,
  c: 43,
  v: 44,
  b: 45,
  n: 46,
  m: 47,
  ",": 48,
  ".": 49,
  "/": 50,
  " ": 52
}, Ue = {
  "!": 1,
  '"': 2,
  "#": 3,
  $: 4,
  "%": 5,
  "&": 6,
  "'": 7,
  "(": 8,
  ")": 9,
  "=": 11,
  "`": 12,
  "|": 13,
  "~": 26,
  "{": 27,
  "+": 38,
  "*": 39,
  "}": 40,
  "<": 48,
  ">": 49,
  "?": 50,
  _: 51
};
function Ke(e) {
  if (e === `
` || e === "\r")
    return { code: L.ENTER, shift: !1 };
  if (e.length === 1 && e >= "A" && e <= "Z") {
    const s = e.toLowerCase(), t = ae[s];
    return t !== void 0 ? { code: t, shift: !0 } : void 0;
  }
  if (Object.prototype.hasOwnProperty.call(ae, e))
    return { code: ae[e], shift: !1 };
  if (Object.prototype.hasOwnProperty.call(Ue, e))
    return { code: Ue[e], shift: !0 };
}
let le = null;
function Kr() {
  const e = /* @__PURE__ */ new Map(), s = new TextDecoder("shift_jis"), t = [
    [129, 159],
    [224, 239]
  ], r = [
    [64, 126],
    [128, 252]
  ];
  for (const [o, n] of t)
    for (let i = o; i <= n; i++)
      for (const [a, l] of r)
        for (let d = a; d <= l; d++) {
          const u = s.decode(new Uint8Array([i, d]));
          u.length === 1 && u !== "�" && (e.has(u) || e.set(u, [i, d]));
        }
  return e;
}
function jr() {
  return le || (le = Kr()), le;
}
const je = {
  "〜": "～",
  "−": "－",
  "―": "—"
};
function fe(e) {
  const s = jr(), t = [], r = [], o = Array.from(e);
  for (let n = 0; n < o.length; n++) {
    let i = o[n];
    if (i === "\r") {
      o[n + 1] === `
` && n++, t.push([13]);
      continue;
    }
    if (i === `
`) {
      t.push([13]);
      continue;
    }
    const a = i.codePointAt(0) ?? 0;
    if (a >= 32 && a <= 126) {
      t.push([a]);
      continue;
    }
    if (a >= 65377 && a <= 65439) {
      t.push([161 + (a - 65377)]);
      continue;
    }
    if (i === "¥") {
      t.push([92]);
      continue;
    }
    je[i] && (i = je[i]);
    const l = s.get(i);
    if (l) {
      t.push([l[0], l[1]]);
      continue;
    }
    r.push(i);
  }
  return { units: t, skipped: r };
}
class $ extends Error {
  constructor(s, t, r = {}) {
    super(t), this.code = s, this.params = r, this.name = "DiskError";
  }
}
const Wr = [128, 256, 512, 1024, 2048], I = 32, ht = 8, A = 16, ft = 15, H = 229, O = 0;
function v(e, s) {
  return e[s] | e[s + 1] << 8;
}
function C(e, s) {
  return (e[s] | e[s + 1] << 8 | e[s + 2] << 16 | e[s + 3] << 24) >>> 0;
}
function S(e, s, t) {
  e[s] = t & 255, e[s + 1] = t >> 8 & 255;
}
function ye(e, s, t) {
  e[s] = t & 255, e[s + 1] = t >>> 8 & 255, e[s + 2] = t >>> 16 & 255, e[s + 3] = t >>> 24 & 255;
}
function G(e, s = 0) {
  if (e.length < s + 512)
    throw new Error(`openFat: image too small (${e.length} bytes)`);
  const t = e, r = s, o = v(t, r + 11), n = t[r + 13], i = v(t, r + 14), a = t[r + 16], l = v(t, r + 17), d = v(t, r + 19), u = v(t, r + 22), c = C(t, r + 32), h = d !== 0 ? d : c;
  if (!Wr.includes(o))
    throw new Error(`openFat: invalid BPB (bytes/sector=${o})`);
  if (n === 0)
    throw new Error("openFat: invalid BPB (sectors/cluster=0)");
  if (a === 0)
    throw new Error("openFat: invalid BPB (FAT count=0)");
  if (u === 0)
    throw new Error("openFat: invalid BPB (sectors/FAT=0)");
  if (h === 0)
    throw new Error("openFat: invalid BPB (total sectors=0)");
  const f = Math.ceil(l * I / o), m = i, p = m + a * u, b = p + f, E = h - b, D = Math.floor(E / n), F = D < 4085 ? "FAT12" : "FAT16";
  return {
    image: e,
    imageOffset: s,
    bytesPerSector: o,
    sectorsPerCluster: n,
    reservedSectors: i,
    numFats: a,
    rootEntries: l,
    sectorsPerFat: u,
    totalSectors: h,
    fatType: F,
    fatStartByte: r + m * o,
    rootStartByte: r + p * o,
    rootDirBytes: f * o,
    dataStartByte: r + b * o,
    totalClusters: D,
    bytesPerCluster: n * o
  };
}
const mt = { FAT12: 4095, FAT16: 65535 };
function we(e, s) {
  const t = e.fatStartByte;
  if (e.fatType === "FAT12") {
    const o = t + Math.floor(s * 3 / 2), n = e.image[o], i = e.image[o + 1];
    return s % 2 === 0 ? n | (i & 15) << 8 : n >> 4 | i << 4;
  }
  const r = t + s * 2;
  return v(e.image, r);
}
function Se(e, s, t) {
  for (let r = 0; r < e.numFats; r++) {
    const o = e.fatStartByte + r * e.sectorsPerFat * e.bytesPerSector;
    if (e.fatType === "FAT12") {
      const n = o + Math.floor(s * 3 / 2);
      s % 2 === 0 ? (e.image[n] = t & 255, e.image[n + 1] = e.image[n + 1] & 240 | t >> 8 & 15) : (e.image[n] = e.image[n] & 15 | t << 4 & 240, e.image[n + 1] = t >> 4 & 255);
    } else {
      const n = o + s * 2;
      S(e.image, n, t & 65535);
    }
  }
}
function zr(e, s) {
  return e.fatType === "FAT12" ? s >= 4087 : s >= 65527;
}
function De(e) {
  return e === 0;
}
function q(e, s) {
  return e.dataStartByte + (s - 2) * e.bytesPerCluster;
}
function ke(e, s) {
  const t = [], r = /* @__PURE__ */ new Set();
  let o = s;
  for (; o >= 2 && !zr(e, o) && !De(o) && !r.has(o); )
    r.add(o), t.push(o), o = we(e, o);
  return t;
}
function pt(e, s) {
  const t = [];
  for (let r = 2; r < e.totalClusters + 2 && t.length < s; r++)
    De(we(e, r)) && t.push(r);
  if (t.length < s)
    throw new Error(
      `fatWriteFile: not enough free space (need ${s} cluster(s), found ${t.length})`
    );
  return t;
}
function gt(e, s) {
  if (s < 2) return;
  const t = ke(e, s);
  for (const r of t)
    Se(e, r, 0);
}
function Z(e) {
  const s = e.toUpperCase(), t = s.lastIndexOf("."), r = t >= 0 ? s.slice(0, t) : s, o = t >= 0 ? s.slice(t + 1) : "";
  if (r.length === 0 || r.length > 8 || o.length > 3)
    throw new Error(`invalid 8.3 filename: ${e}`);
  const n = new Uint8Array(8).fill(32), i = new Uint8Array(3).fill(32);
  for (let l = 0; l < r.length; l++) n[l] = r.charCodeAt(l) & 255;
  for (let l = 0; l < o.length; l++) i[l] = o.charCodeAt(l) & 255;
  const a = o.length > 0 ? `${r}.${o}` : r;
  return { rawName: n, rawExt: i, display: a };
}
function bt(e, s) {
  let t = "";
  for (let o = 0; o < 8 && e[o] !== 32; o++)
    t += String.fromCharCode(e[o]);
  let r = "";
  for (let o = 0; o < 3 && s[o] !== 32; o++)
    r += String.fromCharCode(s[o]);
  return r.length > 0 ? `${t}.${r}` : t;
}
function J(e) {
  return e.split(/[\\/]/).map((s) => s.trim()).filter((s) => s.length > 0);
}
function Pe(e, s) {
  const t = [];
  if (s === null) {
    for (let n = 0; n < e.rootEntries; n++)
      t.push({ offset: e.rootStartByte + n * I });
    return t;
  }
  const r = ke(e, s), o = Math.floor(e.bytesPerCluster / I);
  for (const n of r) {
    const i = q(e, n);
    for (let a = 0; a < o; a++)
      t.push({ offset: i + a * I });
  }
  return t;
}
function Vr(e, s, t) {
  const r = v(e, s), o = v(e, t), n = 1980 + (r >> 9 & 127), i = r >> 5 & 15, a = r & 31, l = o >> 11 & 31, d = o >> 5 & 63, u = (o & 31) * 2;
  return i === 0 || a === 0 ? 0 : new Date(n, i - 1, a, l, d, u).getTime();
}
function yt(e, s, t, r) {
  const o = (r.getFullYear() - 1980 & 127) << 9 | r.getMonth() + 1 << 5 | r.getDate(), n = r.getHours() << 11 | r.getMinutes() << 5 | Math.floor(r.getSeconds() / 2);
  S(e, s, o), S(e, t, n);
}
function Gr(e, s, t) {
  const r = e.image, o = s.offset, n = r[o];
  if (n === O || n === H) return null;
  const i = r[o + 11];
  if (i === ft || i & ht) return null;
  const a = r.subarray(o, o + 8), l = r.subarray(o + 8, o + 11), d = bt(a, l);
  if (d === "." || d === "..") return null;
  const u = v(r, o + 26), c = C(r, o + 28), h = Vr(r, o + 24, o + 22);
  return { slotIndex: t, offset: o, attr: i, name: d, cluster: u, size: c, mtime: h };
}
function Q(e, s) {
  const t = Pe(e, s), r = [];
  for (let o = 0; o < t.length && e.image[t[o].offset] !== O; o++) {
    const n = Gr(e, t[o], o);
    n && r.push(n);
  }
  return r;
}
function wt(e, s) {
  let t = null;
  for (let r = 0; r < s.length; r++) {
    const o = Z(s[r]).display, i = Q(e, t).find((a) => a.name === o);
    if (!i) throw new Error(`directory not found: ${s.slice(0, r + 1).join("/")}`);
    if (!(i.attr & A))
      throw new Error(`not a directory: ${s.slice(0, r + 1).join("/")}`);
    t = i.cluster;
  }
  return t;
}
function ve(e, s) {
  return wt(e, s.slice(0, -1));
}
const We = "T98HDDIMAGE.R0", ze = "VHD", Ve = 220;
function Ge(e, s, t) {
  let r = "";
  for (let o = 0; o < t; o++) r += String.fromCharCode(e[s + o]);
  return r;
}
function Yr(e, s) {
  if (s.endsWith(".thd"))
    return { headerSize: 256, surfaces: 8, sectorsPerTrack: 33, bytesPerSector: 256 };
  if (s.endsWith(".nhd")) {
    if (e.length < 288 || Ge(e, 0, We.length) !== We)
      throw new $("hddInvalidHeader", "NHDヘッダが不正です", { format: "NHD" });
    return {
      headerSize: C(e, 272),
      surfaces: v(e, 280),
      sectorsPerTrack: v(e, 282),
      bytesPerSector: v(e, 284)
    };
  }
  if (s.endsWith(".hdi")) {
    if (e.length < 32)
      throw new $("hddInvalidHeader", "HDIヘッダが不正です", { format: "HDI" });
    return {
      headerSize: C(e, 8),
      surfaces: C(e, 24),
      sectorsPerTrack: C(e, 20),
      bytesPerSector: C(e, 16)
    };
  }
  if (s.endsWith(".hdd")) {
    if (e.length < Ve || Ge(e, 0, ze.length) !== ze)
      throw new $("hddInvalidHeader", "Virtual98(.hdd)ヘッダが不正です", {
        format: "Virtual98(.hdd)"
      });
    return {
      headerSize: Ve,
      surfaces: e[145],
      sectorsPerTrack: e[144],
      bytesPerSector: v(e, 142)
    };
  }
  return null;
}
const Ye = 32, Xr = 16;
function qr(e, s) {
  const t = s.headerSize + s.bytesPerSector, r = [];
  for (let o = 0; o < Xr; o++) {
    const n = t + o * Ye;
    if (n + Ye > e.length) break;
    if (e[n + 1] === 0) continue;
    const i = e[n + 8], a = e[n + 9], d = (v(e, n + 10) * s.surfaces + a) * s.sectorsPerTrack + i, u = s.headerSize + d * s.bytesPerSector;
    u > 0 && u < e.length && r.push(u);
  }
  return r;
}
function Zr(e, s) {
  for (const t of qr(e, s))
    try {
      return G(e, t);
    } catch {
    }
  try {
    return G(e, s.headerSize);
  } catch {
    throw new $("hddNoFatPartition", "HDDイメージ内にFAT16/12パーティションが見つかりません");
  }
}
const Jr = 4096;
function Xe(e, s) {
  const t = s.toLowerCase();
  if (t.endsWith(".d88"))
    throw new $("d88NotEditable", "D88形式は編集非対応です");
  const r = Yr(e, t);
  if (r)
    return Zr(e, r);
  if (t.endsWith(".fdi")) {
    let o = Jr;
    if (e.length >= 16) {
      const n = C(e, 8), i = C(e, 12);
      n >= 16 && n < e.length && i > 0 && n + i <= e.length && (o = n);
    }
    return G(e, o);
  }
  return G(e, 0);
}
const St = 1024, Dt = 8, Qr = 77, kt = 2, es = St * Dt * Qr * kt;
function ts() {
  const e = St, s = 1, t = 1, r = 2, o = 192, n = 1232, i = 254, a = 2, l = new Uint8Array(es);
  l[0] = 235, l[1] = 254, l[2] = 144, S(l, 11, e), l[13] = s, S(l, 14, t), l[16] = r, S(l, 17, o), S(l, 19, n), l[21] = i, S(l, 22, a), S(l, 24, Dt), S(l, 26, kt), ye(l, 32, 0), l[510] = 85, l[511] = 170;
  const d = t * e;
  for (let u = 0; u < r; u++) {
    const c = d + u * a * e;
    l[c] = i, l[c + 1] = 255, l[c + 2] = 255;
  }
  return l;
}
function qe(e, s) {
  const t = J(s), r = wt(e, t);
  return Q(e, r).map((n) => ({
    name: n.name,
    size: n.size,
    isDir: (n.attr & A) !== 0,
    cluster: n.cluster,
    mtime: n.mtime
  }));
}
function Pt(e, s) {
  const t = J(s);
  if (t.length === 0) throw new Error("empty file path");
  const r = ve(e, t), o = Z(t[t.length - 1]).display, i = Q(e, r).find((a) => a.name === o);
  if (!i) throw new Error(`file not found: ${s}`);
  return { dirCluster: r, entry: i };
}
function Ze(e, s) {
  const { entry: t } = Pt(e, s);
  if (t.attr & A) throw new Error(`is a directory: ${s}`);
  if (t.size === 0 || t.cluster === 0) return new Uint8Array(0);
  const r = ke(e, t.cluster), o = new Uint8Array(t.size);
  let n = 0;
  for (const i of r) {
    if (n >= t.size) break;
    const a = q(e, i), l = Math.min(e.bytesPerCluster, t.size - n);
    o.set(e.image.subarray(a, a + l), n), n += l;
  }
  if (n < t.size)
    throw new Error(`fatReadFile: cluster chain shorter than file size for ${s}`);
  return o;
}
function Je(e, s, t) {
  const r = J(s);
  if (r.length === 0) throw new Error("empty file path");
  const o = ve(e, r), { display: n, rawName: i, rawExt: a } = Z(r[r.length - 1]), l = Pe(e, o);
  let d = -1, u = 0;
  for (let p = 0; p < l.length; p++) {
    const b = e.image[l[p].offset];
    if (b === O) break;
    if (b === H) continue;
    const E = e.image[l[p].offset + 11];
    if (E === ft || E & ht) continue;
    if (bt(
      e.image.subarray(l[p].offset, l[p].offset + 8),
      e.image.subarray(l[p].offset + 8, l[p].offset + 11)
    ) === n) {
      d = p, u = v(e.image, l[p].offset + 26);
      break;
    }
  }
  if (d < 0) {
    for (let p = 0; p < l.length; p++) {
      const b = e.image[l[p].offset];
      if (b === O || b === H) {
        d = p;
        break;
      }
    }
    if (d < 0)
      throw new Error(`fatWriteFile: directory is full, cannot create ${s}`);
  }
  u >= 2 && gt(e, u);
  const c = t.length === 0 ? 0 : Math.ceil(t.length / e.bytesPerCluster), h = c > 0 ? pt(e, c) : [];
  let f = 0;
  for (let p = 0; p < h.length; p++) {
    const b = h[p], E = p === h.length - 1;
    Se(e, b, E ? mt[e.fatType] : h[p + 1]);
    const D = q(e, b), F = Math.min(e.bytesPerCluster, t.length - f);
    e.image.set(t.subarray(f, f + F), D), F < e.bytesPerCluster && e.image.fill(0, D + F, D + e.bytesPerCluster), f += F;
  }
  const m = l[d].offset;
  e.image.set(i, m), e.image.set(a, m + 8), e.image[m + 11] = 32, e.image[m + 12] = 0, S(e.image, m + 14, 0), S(e.image, m + 16, 0), S(e.image, m + 18, 0), S(e.image, m + 20, 0), yt(e.image, m + 24, m + 22, /* @__PURE__ */ new Date()), S(e.image, m + 26, h.length > 0 ? h[0] : 0), ye(e.image, m + 28, t.length);
}
function de(e, s, t, r, o, n, i, a) {
  e.image.set(t, s), e.image.set(r, s + 8), e.image[s + 11] = o, e.image[s + 12] = 0, S(e.image, s + 14, 0), S(e.image, s + 16, 0), S(e.image, s + 18, 0), S(e.image, s + 20, 0), yt(e.image, s + 24, s + 22, a), S(e.image, s + 26, n), ye(e.image, s + 28, i);
}
function Qe(e) {
  const s = new Uint8Array(8).fill(32);
  for (let r = 0; r < e; r++) s[r] = 46;
  const t = new Uint8Array(3).fill(32);
  return { rawName: s, rawExt: t };
}
function et(e, s) {
  const t = J(s);
  if (t.length === 0) throw new Error("empty directory path");
  const r = ve(e, t), { display: o, rawName: n, rawExt: i } = Z(t[t.length - 1]);
  if (Q(e, r).some((p) => p.name === o))
    throw new Error(`fatMakeDir: already exists: ${s}`);
  const [l] = pt(e, 1);
  Se(e, l, mt[e.fatType]);
  const d = q(e, l);
  e.image.fill(0, d, d + e.bytesPerCluster);
  const u = /* @__PURE__ */ new Date(), c = Qe(1), h = Qe(2);
  de(e, d, c.rawName, c.rawExt, A, l, 0, u), de(
    e,
    d + I,
    h.rawName,
    h.rawExt,
    A,
    r ?? 0,
    0,
    u
  );
  const f = Pe(e, r);
  let m = -1;
  for (let p = 0; p < f.length; p++) {
    const b = e.image[f[p].offset];
    if (b === O || b === H) {
      m = p;
      break;
    }
  }
  if (m < 0)
    throw new Error(`fatMakeDir: directory is full, cannot create ${s}`);
  de(e, f[m].offset, n, i, A, l, 0, u);
}
function tt(e, s) {
  const { entry: t } = Pt(e, s);
  if (t.attr & A) throw new Error(`is a directory: ${s}`);
  t.cluster >= 2 && gt(e, t.cluster), e.image[t.offset] = H;
}
function rt(e) {
  let s = 0;
  for (let t = 2; t < e.totalClusters + 2; t++)
    De(we(e, t)) && s++;
  return {
    total: e.totalClusters * e.bytesPerCluster,
    free: s * e.bytesPerCluster
  };
}
const x = "/state0.sav";
function rs(e) {
  const s = [], t = [], r = Array.from(e);
  for (let o = 0; o < r.length; o++) {
    const n = r[o];
    if (n === "\r") {
      if (r[o + 1] === `
`) continue;
      s.push(13, 10);
      continue;
    }
    if (n === `
`) {
      s.push(13, 10);
      continue;
    }
    const { units: i, skipped: a } = fe(n);
    i.length > 0 && s.push(...i[0]), t.push(...a);
  }
  return { bytes: new Uint8Array(s), skipped: t };
}
function st(e) {
  let s = "";
  for (let r = 0; r < e.length; r += 8192)
    s += String.fromCharCode(...e.subarray(r, r + 8192));
  return btoa(s);
}
function ss(e) {
  const s = atob(e), t = new Uint8Array(s.length);
  for (let r = 0; r < s.length; r++) t[r] = s.charCodeAt(r);
  return t;
}
function ot(e) {
  const s = e.split(/[\\/]/).filter((r) => r.length > 0), t = s[s.length - 1];
  if (!t)
    throw new Error(`invalid guest path: ${e}`);
  if (!/^[A-Za-z0-9_\-$~!#%'@(){}^]{1,8}(\.[A-Za-z0-9_\-$~!#%'@(){}^]{1,3})?$/.test(t))
    throw new $(
      "invalidShortName",
      `ファイル名は8.3形式にしてください(2バイト文字/長い名前は不可): ${t}`,
      { name: t }
    );
  return t;
}
function os(e, s) {
  return e.split(`
`).slice(-8).join(`
`);
}
const ns = ["個のファイルをコピーしました", "file(s) copied", "file copied"], is = [
  "ファイルが見つかりません",
  "指定されたパスが見つかりません",
  "File not found",
  "Path not found",
  "書き込み保護",
  "このドライブには",
  "ディスクの空き容量が",
  "Insufficient disk space",
  "無効なパスです"
], as = ["を上書きしますか", "Overwrite", "overwrite"], ls = { 1: "B:", 2: "C:" };
class ds {
  constructor() {
    g(this, "listeners", /* @__PURE__ */ new Map());
  }
  on(s, t) {
    let r = this.listeners.get(s);
    return r || (r = /* @__PURE__ */ new Set(), this.listeners.set(s, r)), r.add(t), () => r == null ? void 0 : r.delete(t);
  }
  emit(s, t) {
    const r = this.listeners.get(s);
    if (r)
      for (const o of r)
        o(t);
  }
}
const cs = 5e3, us = 3e4, nt = 4096, hs = 300;
function fs(e) {
  const { isReady: s, raf: t, timeoutMs: r = 1e4, maxIdleFrames: o = hs } = e, n = e.setTimeoutFn ?? ((a, l) => setTimeout(a, l)), i = e.clearTimeoutFn ?? ((a) => clearTimeout(a));
  return s() ? Promise.resolve(!0) : new Promise((a) => {
    let l = !1;
    const d = () => {
      l || (l = !0, i(u), a(s()));
    }, u = n(d, r);
    let c = 0;
    const h = () => {
      if (!l) {
        if (s()) {
          d();
          return;
        }
        if (c += 1, c >= o) {
          d();
          return;
        }
        t(h);
      }
    };
    t(h);
  });
}
class ms extends ds {
  constructor(t) {
    super();
    g(this, "canvas");
    g(this, "fs", null);
    /** boot()時のhostdrv.root(既定'/hostdrv')。hostdrv未設定でbootした場合はnullのまま。 */
    g(this, "hostdrvRoot", null);
    g(this, "mounted", /* @__PURE__ */ new Map());
    g(this, "persistTimer", null);
    g(this, "boundOnVisibilityChange", () => this.onVisibilityChange());
    g(this, "boundOnPageHide", () => void this.persistNow({ force: !0 }));
    /** ホスト側が推定するバスマウスのカーソル位置(0-639, 0-399)。null=未ホーミング(未確定)。 */
    g(this, "mousePos", null);
    /** persistNow の再入ガード。タイマーと visibilitychange が重なると二重保存になるため。 */
    g(this, "persisting", !1);
    g(this, "outputSubs", /* @__PURE__ */ new Set());
    g(this, "outputTimer", null);
    g(this, "streamTimer", null);
    g(this, "streamTick", 0);
    this.canvas = t;
  }
  isBooted() {
    return this.fs !== null;
  }
  /** CPU実行の一時停止を切り替える。描画・イベント処理は継続する。 */
  dbgSetPaused(t) {
    if (!this.isBooted()) throw new Error("not booted");
    tr(t);
  }
  /**
   * ポーズ中のイベントループ待ち時間(ms)を切り替える。呼び出し元(ツールバー/デバッガ)で
   * 待ち時間を使い分けるための入口。未対応コアでは coreSetPauseSleepMs 内で無視される。
   */
  dbgSetPauseSleepMs(t) {
    if (!this.isBooted()) throw new Error("not booted");
    Gt(t);
  }
  /** CPUがデバッガによって一時停止中かを返す。 */
  dbgIsPaused() {
    if (!this.isBooted()) throw new Error("not booted");
    return rr() !== 0;
  }
  /** 一時停止中に指定命令数だけ実行し、実際の実行数を返す。 */
  dbgStep(t) {
    if (!this.isBooted()) throw new Error("not booted");
    return sr(Math.trunc(t));
  }
  /** CPUレジスタを名前付きオブジェクトとして取得する。 */
  dbgReadRegs() {
    if (!this.isBooted()) throw new Error("not booted");
    const t = or();
    if (t.length < 17)
      throw new Error(`invalid debugger register count: ${t.length}`);
    return {
      eax: t[0],
      ecx: t[1],
      edx: t[2],
      ebx: t[3],
      esp: t[4],
      ebp: t[5],
      esi: t[6],
      edi: t[7],
      eip: t[8],
      eflags: t[9],
      cs: t[10],
      ds: t[11],
      es: t[12],
      ss: t[13],
      fs: t[14],
      gs: t[15],
      cr0: t[16]
    };
  }
  /** 逆アセンブル文字列を解析し、各行のaddrを命令長の積算で補う。 */
  dbgDisasm(t, r, o) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = nr(t, r, Math.trunc(o));
    let i = r >>> 0;
    return n.split(`
`).filter((a) => a.length > 0).map((a) => {
      const [l, d, ...u] = a.split("	"), c = Number.parseInt(l, 10);
      if (!Number.isInteger(c) || c <= 0 || d.length !== c * 2)
        throw new Error(`invalid debugger disassembly line: ${a}`);
      const h = [];
      for (let m = 0; m < d.length; m += 2) {
        const p = Number.parseInt(d.slice(m, m + 2), 16);
        if (!Number.isInteger(p))
          throw new Error(`invalid debugger disassembly bytes: ${d}`);
        h.push(p);
      }
      const f = { addr: i, len: c, bytes: h, text: u.join("	") };
      return i = i + c >>> 0, f;
    });
  }
  /** index 0..7のソフトウェアブレークポイントを設定する。 */
  dbgSetBreakpoint(t, r, o, n) {
    if (!this.isBooted()) throw new Error("not booted");
    ir(Math.trunc(t), r, o, n);
  }
  /** 最大命令数まで実行し、ヒットしたブレークポイントindex（無ヒットは-1）を返す。 */
  dbgRunUntilBreakpoint(t) {
    if (!this.isBooted()) throw new Error("not booted");
    return ar(Math.trunc(t));
  }
  getMountedImages() {
    return Array.from(this.mounted.values()).map(({ slot: t, name: r, sourceKey: o, url: n }) => ({
      slot: t,
      name: r,
      sourceKey: o,
      url: n
    }));
  }
  /** 現在マウント中のディスク一覧を返す(getMountedImagesの整形版)。 */
  listDisks() {
    return this.getMountedImages().map(({ slot: t, name: r, sourceKey: o }) => ({ slot: t, name: r, sourceKey: o }));
  }
  /**
   * IndexedDBに保存済みのディスクイメージ一覧を返す(rom:/state: プレフィックスは除外)。
   * 拡張子からhdd/fdを判定する。savedAt降順。
   */
  async listDiskLibrary() {
    const t = await dr(), r = [];
    for (const o of t) {
      if (o.sourceKey.startsWith("rom:") || o.sourceKey.startsWith("state:")) continue;
      const n = ce(o.name);
      n && r.push({
        sourceKey: o.sourceKey,
        name: o.name,
        size: o.size,
        savedAt: o.savedAt,
        kind: n
      });
    }
    return r.sort((o, n) => n.savedAt - o.savedAt), r;
  }
  /** URLからディスクイメージをfetchしてFDドライブへ挿入する。ファイル名はURLのbasename。 */
  async insertFdFromUrl(t, r) {
    const o = await Fr(r), n = bs(r);
    return await this.insertFd(t, { name: n, bytes: o }, r, r), { name: n };
  }
  /** IndexedDBのディスクライブラリからsourceKeyで指定したイメージをFDドライブへ挿入する。 */
  async insertFdFromLibraryKey(t, r) {
    const o = await N(r);
    if (!o) throw new Error(`no library entry found for sourceKey: ${r}`);
    const n = o.name;
    return await this.insertFd(t, { name: n, bytes: new Uint8Array(o.bytes) }, r, o.url), { name: n };
  }
  /** FAT12フォーマット済みですぐ使える空FDを生成してFDドライブへ挿入する。 */
  async insertBlankFd(t) {
    const r = this.createBlankFd();
    return await this.insertFd(t, r, `file:${r.name}:${r.bytes.length}`), { name: r.name };
  }
  /**
   * マウント中イメージのバイト列をbase64で返す。5MBを超える場合はErrorを投げる
   * (HDDイメージなど巨大なものはUIのダウンロードボタンを使うよう案内する)。
   */
  async exportDiskBase64(t) {
    if (!this.fs) throw new Error("not booted");
    const r = this.mounted.get(t);
    if (!r) throw new Error(`no image mounted in ${t}`);
    const o = K(this.fs, r.name), n = 5 * 1024 * 1024;
    if (o.length > n)
      throw new Error(
        `image too large to export as base64 (${o.length} bytes > 5MB). 大きすぎるためUIのダウンロードボタンを使うこと`
      );
    let i = "";
    const a = 8192;
    for (let d = 0; d < o.length; d += a) {
      const u = o.subarray(d, d + a);
      i += String.fromCharCode(...u);
    }
    const l = btoa(i);
    return { name: r.name, base64: l, size: o.length };
  }
  /**
   * コアを起動する。config には hdd/fd1/fd2 の由来情報 (sourceKey/url) を渡す。
   */
  async boot(t) {
    var n;
    const r = [];
    t.fd1 && r.push({ slot: "fd1", ...t.fd1 }), t.fd2 && r.push({ slot: "fd2", ...t.fd2 });
    const o = {
      hdd: (n = t.hdd) == null ? void 0 : n.file,
      fds: r.map((i) => i.file),
      latencyMs: t.latencyMs,
      extMemMB: t.extMemMB,
      clkMult: t.clkMult,
      roms: t.roms,
      hostdrv: t.hostdrv,
      seekSound: t.seekSound,
      nowait: t.nowait
    };
    try {
      const i = await Wt(o, this.canvas);
      this.fs = i, this.hostdrvRoot = t.hostdrv ? t.hostdrv.root ?? pe : null, this.mounted.clear(), t.hdd && this.mounted.set("hdd", {
        slot: "hdd",
        name: t.hdd.file.name,
        sourceKey: t.hdd.sourceKey,
        url: t.hdd.url,
        lastSavedStat: t.hdd.alreadyPersisted ? j(i, t.hdd.file.name) ?? void 0 : void 0
      });
      for (const a of r)
        this.mounted.set(a.slot, {
          slot: a.slot,
          name: a.file.name,
          sourceKey: a.sourceKey,
          url: a.url,
          lastSavedStat: a.alreadyPersisted ? j(i, a.file.name) ?? void 0 : void 0
        });
      this.startPersistLoop(), await this.restoreStateIfPresent(), this.emit("booted", { fs: i });
    } catch (i) {
      const a = i instanceof Error ? i : new Error(String(i));
      throw this.emit("bootError", { error: a }), a;
    }
  }
  /** hostdrv未設定(boot時にhostdrvを渡していない)ならErrorを投げてFS/rootを返す。 */
  requireHostDrv() {
    return jt(this.fs, this.hostdrvRoot);
  }
  /** hostdrvルート直下へファイルを書き込む(IDEがビルド成果物をゲストへ渡す用途)。 */
  writeHostFile(t, r) {
    const { fs: o, root: n } = this.requireHostDrv();
    Ht(o, n, t, r);
  }
  /** hostdrvルート直下のファイルを読む。無ければnull。 */
  readHostFile(t) {
    const { fs: r, root: o } = this.requireHostDrv();
    return Ot(r, o, t);
  }
  /** hostdrvルート直下のファイル名一覧を返す。 */
  listHostFiles() {
    const { fs: t, root: r } = this.requireHostDrv();
    return Ut(t, r);
  }
  /** hostdrvルート直下のファイルを削除する。存在しなければfalse。 */
  deleteHostFile(t) {
    const { fs: r, root: o } = this.requireHostDrv();
    return Kt(r, o, t);
  }
  startPersistLoop() {
    this.stopPersistLoop(), this.persistTimer = setInterval(() => {
      this.persistNow();
    }, cs), document.addEventListener("visibilitychange", this.boundOnVisibilityChange), window.addEventListener("pagehide", this.boundOnPageHide);
  }
  stopPersistLoop() {
    this.persistTimer !== null && (clearInterval(this.persistTimer), this.persistTimer = null), document.removeEventListener("visibilitychange", this.boundOnVisibilityChange), window.removeEventListener("pagehide", this.boundOnPageHide);
  }
  onVisibilityChange() {
    document.hidden && this.persistNow({ force: !0 });
  }
  /**
   * マウント中の各イメージのうち変化したものだけ IndexedDB へ保存する。
   * force=true では HDD の最短保存間隔を無視する(排出・タブ離脱・明示要求など、
   * 「ここで保存できないと失われる」場面で間隔を理由に飛ばさないため)。
   */
  async persistNow(t) {
    if (this.fs && !this.persisting) {
      this.persisting = !0;
      try {
        await this.persistNowInner((t == null ? void 0 : t.force) ?? !1);
      } finally {
        this.persisting = !1;
      }
    }
  }
  async persistNowInner(t) {
    if (!this.fs) return;
    const r = performance.now();
    let o = 0;
    for (const i of this.mounted.values())
      try {
        if (!t && ce(i.name) === "hdd" && i.lastSavedAt !== void 0 && Date.now() - i.lastSavedAt < us)
          continue;
        const a = j(this.fs, i.name);
        if (a && i.lastSavedStat && a.mtimeMs === i.lastSavedStat.mtimeMs && a.size === i.lastSavedStat.size)
          continue;
        const l = K(this.fs, i.name);
        if (!a && !this.hasChanged(i, l)) continue;
        await lr({
          sourceKey: i.sourceKey,
          url: i.url,
          name: i.name,
          bytes: U(l),
          savedAt: Date.now()
        }), o += l.byteLength, i.lastSavedSnapshot = this.snapshotOf(l), i.lastSavedStat = a ?? void 0, i.lastSavedAt = Date.now(), this.emit("persisted", { slot: i.slot, name: i.name });
      } catch (a) {
        this.emit("log", {
          level: "error",
          message: `persist failed for ${i.name}: ${String(a)}`
        });
      }
    const n = performance.now() - r;
    n > 50 && this.emit("log", {
      level: "info",
      message: `persist took ${n.toFixed(0)}ms (${(o / 1048576).toFixed(1)}MB written)`
    });
  }
  snapshotOf(t) {
    const r = t.slice(0, Math.min(nt, t.length)), o = t.slice(Math.max(0, t.length - nt));
    return { length: t.length, head: r, tail: o };
  }
  hasChanged(t, r) {
    const o = t.lastSavedSnapshot;
    if (!o || o.length !== r.length) return !0;
    const n = this.snapshotOf(r);
    return !it(o.head, n.head) || !it(o.tail, n.tail);
  }
  /** 現在のイメージをダウンロードさせる。 */
  async exportDisk(t) {
    if (!this.fs) throw new Error("not booted");
    const r = this.mounted.get(t);
    if (!r) throw new Error(`no image mounted in ${t}`);
    const o = K(this.fs, r.name), n = new Blob([o.slice()], { type: "application/octet-stream" }), i = URL.createObjectURL(n);
    try {
      const a = document.createElement("a");
      a.href = i, a.download = r.name, document.body.appendChild(a), a.click(), a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(i), 1e4);
    }
  }
  /** IndexedDB の保存を削除し、ページをリロードして配布元から再フェッチさせる。 */
  async resetToOriginal(t) {
    const r = this.mounted.get(t);
    if (!r) throw new Error(`no image mounted in ${t}`);
    await hr(r.sourceKey), location.reload();
  }
  /** canvas をフルスクリーン表示する。 */
  async fullscreen() {
    this.canvas.requestFullscreen && await this.canvas.requestFullscreen();
  }
  /** マシンをリセットする (pccore_cfgupdate + pccore_reset)。 */
  resetMachine() {
    if (!this.fs) throw new Error("not booted");
    zt();
  }
  /**
   * 実行中の FD ドライブへイメージを挿入する。既存スロットがマウント中なら先に永続化してから差し替える。
   * IndexedDB に同 sourceKey の保存があればそちらを優先ロードする（前回の続き優先）。
   */
  async insertFd(t, r, o, n) {
    if (!this.fs) throw new Error("not booted");
    const i = t === 1 ? "fd1" : "fd2";
    this.mounted.has(i) && await this.persistNow({ force: !0 });
    let a = r.bytes, l = r.name;
    const d = await N(o);
    if (d && (a = new Uint8Array(d.bytes), l = d.name), this.fs.writeFile(`/disk/${l}`, a), W(t - 1, `/disk/${l}`), !await this.waitForFddReady(t))
      throw new Error(
        `FDドライブ${t}の準備がタイムアウトしました(挿入遅延の間、webnp2_fdd_readyが0のままでした。CPUが極端に遅い/タブが背面化している可能性があります)`
      );
    this.mounted.set(i, {
      slot: i,
      name: l,
      sourceKey: o,
      url: n,
      lastSavedSnapshot: void 0,
      lastSavedStat: d ? j(this.fs, l) ?? void 0 : void 0
    }), this.emit("fdChanged", { drive: t, name: l });
  }
  /**
   * FDドライブが読み書きできる状態になるまで待つ。
   *
   * NP2kai は挿入から 20 フレーム(約0.4秒)を Not Ready として模倣する(実機どおり)。
   * この遅延はコア(NP2kai)側の comment 通り **エミュレート1フレームごと**(np2exec の
   * メインループが1周するたび)に減る。CPUが HLT で止まっていてもフレーム/割り込みは
   * 進むため、CPUのEIPが変化しているかどうかはこの遅延の進み方と直結しない
   * (EIPは「CPUが命令を実行したか」であり「フレームが1つ進んだか」ではないため、
   * DOSが正当にHLT待機している間もEIPが動かないまま遅延だけは明ける、という
   * ケースを誤検出しうる。EIPを主指標に採用しなかった理由はこれ)。
   * 実時間での sleep では足りる保証がない(**スロットル中・タブ背面化中は特に**)。
   * 挿入直後にゲストへコマンドを投げる用途では必ずこれで待つこと。
   *
   * 打ち切りは requestAnimationFrame の呼び出し回数(=描画フレームの実際の到着回数)を
   * 主基準にする(pollUntilReady参照)。rAFはブラウザの合成タイミングに紐づき、
   * NP2kaiのメインループもrAF駆動で1フレームずつ進むため、同じ描画フレームの中で
   * 両者は基本的に足並みが揃う。つまり「rAFが呼ばれた回数」は「コアが実際に処理した
   * フレーム数」の妥当な代理指標になる(タブ背面化やCPU飽和でrAF自体が来なくなる
   * 場合は後述の壁時計が拾う)。
   *
   * 実測(CPU 4倍スロットリング、Chrome DevTools Emulation.setCPUThrottlingRate):
   * 挿入から準備完了までに要したrAF呼び出し回数は 20〜24 回(20フレームの遅延と一致、
   * 誤差はスケジューリングのジッタ)。壁時計では約3.2秒だった。つまり「フレーム数」は
   * スロットル倍率に関わらずほぼ一定(≈20)で、壁時計だけが伸びる。
   * FDD_READY_MAX_IDLE_FRAMES=300 はこの実測値(20〜24)の10倍超の余裕を持たせた値で、
   * 「20フレームでは説明できないほど長くrAFが来続けているのに一向に準備が整わない」
   * ことをもって初めて諦める(=より重い環境でも早期に見捨てない側に倒す)。
   * @param drive 1|2
   * @param timeoutMs 保険の壁時計上限(既定10秒)。rAFそのものが一切来なくなる
   *   (タブが完全に背面化/凍結する等)場合だけの最終防波堤。
   *   フレーム基準より先に効くことは通常想定していない。
   */
  async waitForFddReady(t, r = 1e4) {
    if (!this.fs) throw new Error("not booted");
    return fs({
      isReady: () => Vt(t - 1) !== 0,
      raf: (o) => {
        requestAnimationFrame(o);
      },
      timeoutMs: r
    });
  }
  /** 実行中の FD ドライブからイメージを排出する。 */
  async ejectFd(t) {
    if (!this.fs) throw new Error("not booted");
    const r = t === 1 ? "fd1" : "fd2";
    this.mounted.has(r) && await this.persistNow({ force: !0 }), W(t - 1, ""), this.mounted.delete(r), this.emit("fdChanged", { drive: t, name: void 0 });
  }
  /** 'fd1'|'fd2' 以外(hdd等)が渡された場合にErrorを投げる。FAT操作はFDのみ対応。 */
  assertFdSlot(t) {
    if (t !== "fd1" && t !== "fd2")
      throw new $("hddSlotUnsupported", `HDDは未対応です(fd1/fd2のみ): ${t}`);
  }
  /** 指定スロットにマウント中のイメージ名を返す。マウントが無ければError。 */
  getSlotImageName(t) {
    this.assertFdSlot(t);
    const r = this.mounted.get(t);
    if (!r) throw new Error(`no image mounted in ${t}`);
    return r.name;
  }
  /** MEMFS上のディスクイメージを読み出し FAT ボリュームとして開く。 */
  openSlotFat(t) {
    if (!this.fs) throw new Error("not booted");
    const r = this.getSlotImageName(t), o = K(this.fs, r), n = Xe(o, r);
    return { name: r, image: o, vol: n };
  }
  /**
   * FAT操作で書き換えたイメージをMEMFSへ書き戻し、DOSのディスクキャッシュを捨てさせるために
   * 排出→再挿入(メディア交換)を行ってからIndexedDBへ永続化する。
   * ゲストがそのドライブへアクセス中に呼ぶとゲスト側のI/Oと競合し得るため、
   * MCPツールの説明では「ゲストが書き込み中でないタイミングで実行すること」と案内している。
   */
  async writeBackSlotImage(t, r, o) {
    if (!this.fs) throw new Error("not booted");
    const n = t === "fd1" ? 1 : 2;
    if (this.fs.writeFile(`/disk/${r}`, o), W(n - 1, `/disk/${r}`), !await this.waitForFddReady(n))
      throw new Error(`FDドライブ${n}の準備がタイムアウトしました(書き戻しの再挿入後)`);
    await this.persistNow({ force: !0 });
  }
  /** FD内のFAT12/16ディスクイメージのファイル一覧と空き容量を返す。path省略時はルート。 */
  async diskListFiles(t, r = "") {
    const { vol: o } = this.openSlotFat(t), n = qe(o, r), { free: i, total: a } = rt(o);
    return { entries: n, free: i, total: a };
  }
  /** FD内のFAT12/16ディスクイメージからファイルを読み出す。 */
  async diskReadFile(t, r) {
    const { vol: o } = this.openSlotFat(t);
    return Ze(o, r);
  }
  /** FD内のFAT12/16ディスクイメージへファイルを書き込む(新規作成/上書き)。 */
  async diskWriteFile(t, r, o) {
    const { name: n, image: i, vol: a } = this.openSlotFat(t);
    Je(a, r, o), await this.writeBackSlotImage(t, n, i);
  }
  /** FD内のFAT12/16ディスクイメージからファイルを削除する。 */
  async diskDeleteFile(t, r) {
    const { name: o, image: n, vol: i } = this.openSlotFat(t);
    tt(i, r), await this.writeBackSlotImage(t, o, n);
  }
  /** FD内のFAT12/16ディスクイメージにディレクトリを作成する(ファイルマネージャUI向け)。 */
  async diskMakeDir(t, r) {
    const { name: o, image: n, vol: i } = this.openSlotFat(t);
    et(i, r), await this.writeBackSlotImage(t, o, n);
  }
  /** sourceKey が現在いずれかのスロットにマウント中かどうかを返す。 */
  isSourceKeyMounted(t) {
    for (const r of this.mounted.values())
      if (r.sourceKey === t) return !0;
    return !1;
  }
  /** IndexedDB上のライブラリイメージを読み出し FAT ボリュームとして開く。 */
  async openLibraryFat(t) {
    const r = await N(t);
    if (!r) throw new Error(`no library entry found for sourceKey: ${t}`);
    const o = new Uint8Array(r.bytes), n = Xe(o, r.name);
    return { stored: r, image: o, vol: n };
  }
  /** 変更系ライブラリ操作の前提チェック(マウント中/起動後HDD)。問題があればErrorを投げる。 */
  assertLibraryWritable(t, r) {
    if (this.isSourceKeyMounted(t))
      throw new $("mountedUseSlotApi", "マウント中のイメージはスロット側APIを使ってください");
    if (ce(r) === "hdd" && this.isBooted())
      throw new $("hddEditBeforeBootOnly", "HDDイメージの編集は起動前のみ可能です");
  }
  /** ライブラリ(未マウント)イメージ内のファイル一覧と空き容量を返す。マウント中でも読み取りは許可する。 */
  async libraryListFiles(t, r = "") {
    const { vol: o } = await this.openLibraryFat(t), n = qe(o, r), { free: i, total: a } = rt(o);
    return { entries: n, free: i, total: a };
  }
  /** ライブラリ(未マウント)イメージ内のファイルを読み出す。マウント中でも読み取りは許可する。 */
  async libraryReadFile(t, r) {
    const { vol: o } = await this.openLibraryFat(t);
    return Ze(o, r);
  }
  /** ライブラリ(未マウント)イメージへファイルを書き込み、IndexedDBへ書き戻す。 */
  async libraryWriteFile(t, r, o) {
    const { stored: n, image: i, vol: a } = await this.openLibraryFat(t);
    this.assertLibraryWritable(t, n.name), Je(a, r, o), await this.putLibraryImage(n, i);
  }
  /** ライブラリ(未マウント)イメージからファイルを削除し、IndexedDBへ書き戻す。 */
  async libraryDeleteFile(t, r) {
    const { stored: o, image: n, vol: i } = await this.openLibraryFat(t);
    this.assertLibraryWritable(t, o.name), tt(i, r), await this.putLibraryImage(o, n);
  }
  /** ライブラリ(未マウント)イメージ内にディレクトリを作成し、IndexedDBへ書き戻す。 */
  async libraryMakeDir(t, r) {
    const { stored: o, image: n, vol: i } = await this.openLibraryFat(t);
    this.assertLibraryWritable(t, o.name), et(i, r), await this.putLibraryImage(o, n);
  }
  /** 変更後のライブラリイメージ全体をIndexedDBへ書き戻す。 */
  async putLibraryImage(t, r) {
    await oe({
      ...t,
      bytes: U(r),
      savedAt: Date.now()
    });
  }
  /**
   * FD経由のゲスト転送に使うFDが指定ドライブに無ければ、同梱のツールFD(FAT12フォーマット済み)を
   * 挿入して用意する。転送用ツール(COPY等)を同梱している同梱ツールFDを使う。
   * 既にマウント中ならそのイメージ名をそのまま返す(挿入しない)。
   */
  async ensureTransferFd(t) {
    const r = t === 1 ? "fd1" : "fd2", o = this.mounted.get(r);
    if (o) return o.name;
    const { name: n } = await this.insertFdFromUrl(t, "./tools/webnp2tools.xdf");
    return n;
  }
  /** FDドライブ番号からゲスト側ドライブレターを推定する(HDD起動時の既定: FD1='B:', FD2='C:')。 */
  guestDriveLetter(t) {
    return ls[t];
  }
  /**
   * ホストのテキスト/バイナリを、転送用FD経由でゲストの任意ドライブへ配置する。
   * 手順: (1) 転送用FDを用意 (2) FDへホストデータを書き込み (3) ゲストでCOPYを実行
   * (4) 画面に出る結果文字列で成功/失敗を判定する。HDDをホストが直接書き換えないため、
   * DOSのディスクキャッシュと衝突する危険を避けられる。
   * opts.path はゲスト側の宛先フルパス(例 "A:\\WORK\\FOO.TXT")。ファイル名は8.3形式のみ。
   */
  async putFileToGuest(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const r = t.drive ?? 1, o = r === 1 ? "fd1" : "fd2", n = ot(t.path);
    await this.ensureTransferFd(r);
    let i;
    if (t.bytes !== void 0)
      i = t.bytes;
    else if (t.content !== void 0)
      i = rs(t.content).bytes;
    else
      throw new Error("putFileToGuest: specify content or bytes");
    await this.diskWriteFile(o, n, i);
    const a = this.guestDriveLetter(r), l = await this.runGuestCopy(`COPY ${a}\\${n} ${t.path}`, t.timeoutMs);
    return l.ok ? { ok: !0, message: "ゲストへのコピーに成功しました", screen: l.screen } : { ok: !1, message: l.message, screen: l.screen };
  }
  /**
   * ゲストで COPY を実行し、完了(または失敗)を画面から判定する。
   * 上書き確認が出たら自動で Yes と答える。答えないとゲストが入力待ちのまま
   * 止まり、以降の操作がすべて詰まってしまうため。
   */
  async runGuestCopy(t, r) {
    const o = this.countPatterns(this.getScreenText().text);
    await this.typeText(`${t}
`);
    const n = Date.now() + Math.min(Math.max(r ?? 8e3, 1e3), 6e4);
    let i = !1;
    for (; ; ) {
      await this.sleep(400);
      const a = this.getScreenText().text, l = os(a), d = this.countPatterns(a);
      if (d.error > o.error)
        return { ok: !1, message: "コピーに失敗しました(ゲスト側エラー)", screen: l };
      if (d.success > o.success)
        return { ok: !0, message: "コピーに成功しました", screen: l };
      if (!i && d.overwrite > o.overwrite) {
        i = !0, await this.typeText(`y
`);
        continue;
      }
      if (Date.now() >= n)
        return { ok: !1, message: "コピー結果を確認できませんでした", screen: l };
    }
  }
  /** 画面テキスト中の判定用パターンの出現回数を数える。 */
  countPatterns(t) {
    const r = (o) => o.reduce((n, i) => n + t.split(i).length - 1, 0);
    return {
      success: r(ns),
      error: r(is),
      overwrite: r(as)
    };
  }
  /**
   * ゲストの任意ドライブ上のファイルを、転送用FD経由でホストへ取り出す。
   * 手順: (1) 転送用FDを用意 (2) ゲストでCOPY実行 (3) 結果文字列判定
   * (4) ゲストの書き込みがMEMFS上のイメージへ反映されるのを少し待ってからホストがFATを読む。
   */
  async getFileFromGuest(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const r = t.drive ?? 1, o = r === 1 ? "fd1" : "fd2", n = ot(t.path);
    await this.ensureTransferFd(r);
    try {
      await this.diskDeleteFile(o, n);
    } catch {
    }
    const i = this.guestDriveLetter(r), a = await this.runGuestCopy(`COPY ${t.path} ${i}\\`, t.timeoutMs), l = a.screen;
    if (!a.ok)
      return { ok: !1, message: a.message, screen: l };
    await this.sleep(500);
    try {
      const d = await this.diskReadFile(o, n);
      if ((t.encoding ?? "text") === "base64")
        return {
          ok: !0,
          message: "ゲストからの取得に成功しました",
          screen: l,
          base64: st(d),
          size: d.length
        };
      const u = new TextDecoder("shift_jis").decode(d);
      return { ok: !0, message: "ゲストからの取得に成功しました", screen: l, text: u, size: d.length };
    } catch (d) {
      return { ok: !1, message: `FD上のファイル読み取りに失敗しました: ${String(d)}`, screen: l };
    }
  }
  /** セーブ用の1.25MB(2HD)ベタイメージを生成する。FAT12フォーマット済みですぐ使える。 */
  createBlankFd() {
    const t = new Set(Array.from(this.mounted.values()).map((o) => o.name));
    let r = "blank.xdf";
    for (let o = 2; t.has(r); o++)
      r = `blank${o}.xdf`;
    return { name: r, bytes: ts() };
  }
  primaryEntry() {
    return this.mounted.get("hdd") ?? this.mounted.get("fd1") ?? this.mounted.get("fd2");
  }
  /** 現在の実行状態を statsave しIndexedDBへ保存する。キーは主ディスク(hdd→fd1→fd2)のsourceKeyから決める。 */
  async saveState() {
    if (!this.fs) throw new Error("not booted");
    const t = this.primaryEntry();
    if (!t) {
      this.emit("log", { level: "error", message: "saveState: no mounted image to key the state by" });
      return;
    }
    const r = Re(x);
    if (r < 0) {
      this.emit("log", { level: "error", message: `saveState failed (rc=${r})` });
      return;
    }
    r !== 0 && this.emit("log", { level: "info", message: `saveState finished with warnings (rc=${r})` });
    const o = this.fs.readFile(x, { encoding: "binary" });
    await oe({
      sourceKey: `state:${t.sourceKey}`,
      name: "state0.sav",
      bytes: U(o),
      savedAt: Date.now()
    }), this.emit("stateSaved", {});
  }
  /** IndexedDBに保存済みのステートがあればMEMFSへ書き戻してからロードする。 */
  async loadState() {
    if (!this.fs) throw new Error("not booted");
    const t = this.primaryEntry();
    if (!t) {
      this.emit("log", { level: "error", message: "loadState: no mounted image to key the state by" });
      return;
    }
    if (!this.fs.analyzePath(x).exists) {
      const o = await N(`state:${t.sourceKey}`);
      if (!o) {
        this.emit("log", { level: "error", message: "loadState: no saved state found" });
        return;
      }
      this.fs.writeFile(x, new Uint8Array(o.bytes));
    }
    const r = Fe(x);
    if (r < 0) {
      this.emit("log", { level: "error", message: `loadState failed (rc=${r})` });
      return;
    }
    r !== 0 && this.emit("log", { level: "info", message: `loadState finished with warnings (rc=${r})` }), this.emit("stateLoaded", {});
  }
  validateSlot(t) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(t))
      throw new Error(`invalid slot name: ${t}`);
    return t;
  }
  /** 名前付きスロットへ現在の実行状態を statsave し保存する。キーは `state:<主ディスクsourceKey>:<slot>`。 */
  async saveStateSlot(t) {
    if (!this.fs) throw new Error("not booted");
    const r = this.validateSlot(t), o = this.primaryEntry();
    if (!o) {
      this.emit("log", { level: "error", message: "saveStateSlot: no mounted image to key the state by" });
      return;
    }
    const n = `/state_${r}.sav`, i = Re(n);
    if (i < 0) {
      this.emit("log", { level: "error", message: `saveStateSlot(${r}) failed (rc=${i})` });
      return;
    }
    i !== 0 && this.emit("log", { level: "info", message: `saveStateSlot(${r}) finished with warnings (rc=${i})` });
    const a = this.fs.readFile(n, { encoding: "binary" });
    await oe({
      sourceKey: `state:${o.sourceKey}:${r}`,
      name: `state_${r}.sav`,
      bytes: U(a),
      savedAt: Date.now()
    }), this.emit("stateSaved", {});
  }
  /** 名前付きスロットからIndexedDBに保存済みのステートをMEMFSへ書き戻してロードする。 */
  async loadStateSlot(t) {
    if (!this.fs) throw new Error("not booted");
    const r = this.validateSlot(t), o = this.primaryEntry();
    if (!o) {
      this.emit("log", { level: "error", message: "loadStateSlot: no mounted image to key the state by" });
      return;
    }
    const n = `/state_${r}.sav`, i = await N(`state:${o.sourceKey}:${r}`);
    if (!i) {
      this.emit("log", { level: "error", message: `loadStateSlot: no saved state found for slot "${r}"` });
      return;
    }
    this.fs.writeFile(n, new Uint8Array(i.bytes));
    const a = Fe(n);
    if (a < 0) {
      this.emit("log", { level: "error", message: `loadStateSlot(${r}) failed (rc=${a})` });
      return;
    }
    a !== 0 && this.emit("log", { level: "info", message: `loadStateSlot(${r}) finished with warnings (rc=${a})` }), this.emit("stateLoaded", {});
  }
  /** 保存済みのステートスロット一覧を、保存日時の新しい順で返す。 */
  async listStateSlots() {
    const t = this.primaryEntry();
    if (!t) return [];
    const r = `state:${t.sourceKey}:`;
    return (await cr(r)).map((n) => ({ slot: n.sourceKey.slice(r.length), savedAt: n.savedAt })).sort((n, i) => i.savedAt - n.savedAt);
  }
  /**
   * 画面テキストの差分から「新しく流れた出力」をイベントとして通知する(試作)。
   * 購読者がいる間だけ約100msごとに getScreenText() を読み、screen-diff で
   * line(確定行) / pending(入力中の行) / clear / takeover / gap に変換して cb へ渡す。
   * 最初の1回は現在の画面全体を流す。未起動の間は何も流さず、起動後に始まる。
   * 戻り値は購読解除関数(購読者が0になるとポーリングも止まる)。
   *
   * opts.source で出力源を選べる:
   *  - 'screen': 従来どおり画面の差分だけ(既定の挙動はこれと同じ)
   *  - 'stream': ゲスト側 TSR(guest/conhook/CONHOOK.COM)が捕まえた出力の流れを読む。
   *              TSR が常駐するまでは何も流さない。
   *  - 'auto'(既定): TSR が常駐していれば stream、いなければ screen。TSR が後から常駐したら
   *              その時点で screen から stream へ切り替わる。
   * opts.onSource は現在の出力源が決まる/切り替わるたびに呼ばれる。
   */
  onOutput(t, r) {
    const o = (r == null ? void 0 : r.source) ?? "auto", n = {
      cb: t,
      tracker: new _e(),
      source: o,
      mode: o === "stream" ? "stream" : "screen",
      reader: new _r(),
      parser: new Oe(),
      lastPending: "",
      onSource: r == null ? void 0 : r.onSource
    };
    return this.outputSubs.add(n), this.safeOnSource(n), this.outputTimer === null && (this.outputTimer = setInterval(() => this.pollOutput(), 100)), o !== "screen" && this.streamTimer === null && (this.streamTimer = setInterval(() => this.pollStream(), 25)), () => {
      this.outputSubs.delete(n), this.outputSubs.size === 0 && this.outputTimer !== null && (clearInterval(this.outputTimer), this.outputTimer = null), ![...this.outputSubs].some((i) => i.source !== "screen") && this.streamTimer !== null && (clearInterval(this.streamTimer), this.streamTimer = null);
    };
  }
  safeOnSource(t) {
    var r;
    try {
      (r = t.onSource) == null || r.call(t, t.mode);
    } catch (o) {
      console.error("[WebNP2] onOutput onSource error", o);
    }
  }
  emitOutput(t, r) {
    for (const o of r) {
      o.type === "pending" ? t.lastPending = o.text : (o.type === "line" || o.type === "clear") && (t.lastPending = "");
      try {
        t.cb(o);
      } catch (n) {
        console.error("[WebNP2] onOutput callback error", n);
      }
    }
  }
  pollOutput() {
    if (!this.isBooted()) return;
    let t = null;
    for (const r of [...this.outputSubs])
      if (r.mode === "screen") {
        if (t === null)
          try {
            t = this.getScreenText();
          } catch {
            return;
          }
        this.emitOutput(r, r.tracker.push(t.lines, t.cursor));
      }
  }
  /** 画面方式の残りを流し切り(flush=true のとき)、現在の入力行をパーサへ引き継ぐ。 */
  handoverToStream(t, r = !0) {
    t.parser = new Oe();
    let o = t.lastPending;
    try {
      const n = this.getScreenText();
      if (r && (this.emitOutput(t, t.tracker.push(n.lines, n.cursor)), this.emitOutput(t, t.tracker.push(n.lines, n.cursor))), n.cursor && n.lines.length > 0) {
        const i = Math.min(Math.max(n.cursor.row, 0), n.lines.length - 1);
        o = n.lines[i].replace(/\s+$/, "");
      }
    } catch {
    }
    t.parser.seed(o);
  }
  /** TSR のリングバッファを25msごとに読む。auto の購読者が screen のときも毎回常駐を探す。 */
  pollStream() {
    if (!this.isBooted()) return;
    this.streamTick++;
    const t = (r, o) => Be(r, o);
    for (const r of [...this.outputSubs])
      if (r.source !== "screen")
        try {
          if (r.mode === "screen") {
            if (!r.reader.isResident(t)) continue;
            r.reader.poll(t), this.handoverToStream(r), r.mode = "stream", this.safeOnSource(r);
            continue;
          }
          const o = r.reader.poll(t);
          if (!o.resident) {
            r.source === "auto" && (r.mode = "screen", r.tracker = new _e(), this.safeOnSource(r));
            continue;
          }
          if (o.attached) {
            this.handoverToStream(r, !1), this.safeOnSource(r);
            continue;
          }
          o.lost > 0 && this.emitOutput(r, r.parser.gap()), o.bytes.length > 0 && this.emitOutput(r, r.parser.push(o.bytes));
        } catch {
        }
  }
  /**
   * 画面テキストが変化し、その後 stableMs の間変化が止まるまで待つ。
   * ロード完了やコマンド終了検出など、待つべき文字列が未知な場合に固定sleepの代わりに使う。
   * stableMs は既定800ms(最大5000ms)、timeoutMs は既定15000ms(最大60000ms)にクランプ。
   * 一度も変化が無いままタイムアウトした場合は changed:false を返す。
   */
  async waitScreenChange(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const r = Math.min(Math.max((t == null ? void 0 : t.stableMs) ?? 800, 0), 5e3), o = Math.min(Math.max((t == null ? void 0 : t.timeoutMs) ?? 15e3, 0), 6e4), n = Date.now();
    let a = this.getScreenText().text, l = !1, d = Date.now();
    for (; ; ) {
      const u = Date.now();
      if (l) {
        if (u - d >= r)
          return { changed: !0, text: a };
        if (u - n >= o)
          return { changed: !0, text: a };
      } else if (u - n >= o)
        return { changed: !1, text: a };
      await this.sleep(200);
      const c = this.getScreenText().text;
      c !== a && (l = !0, d = Date.now()), a = c;
    }
  }
  /** テキストVRAMを読み出し、SJISデコード済みの画面テキストとカーソル位置を返す。 */
  getScreenText() {
    const t = Qt(), r = new DataView(t.buffer, t.byteOffset, t.byteLength), o = t[0], n = t[1], i = r.getInt16(2, !0), a = [], l = new TextDecoder("shift_jis");
    let d = 0;
    for (let u = 0; u < n; u++) {
      const c = [];
      let h = !1;
      for (let m = 0; m < o; m++) {
        const p = 4 + d * 2, b = r.getUint16(p, !0);
        if (d++, b === 0) {
          if (h) {
            h = !1;
            continue;
          }
          c.push(46);
          continue;
        }
        const E = b >> 8;
        if (b <= 255) {
          b >= 32 && b <= 126 || b >= 161 && b <= 223 ? c.push(b) : c.push(46), h = !1;
          continue;
        }
        if (E >= 33) {
          const D = E, F = b & 255, vt = (D + 1 >> 1) + (D < 95 ? 112 : 176), Et = F + (D & 1 ? F < 96 ? 31 : 32 : 126);
          c.push(vt & 255, Et & 255), h = !0;
          continue;
        }
        c.push(46), h = !1;
      }
      const f = l.decode(new Uint8Array(c)).trimEnd();
      a.push(f);
    }
    return {
      text: a.join(`
`),
      lines: a,
      cursor: i >= 0 ? { row: Math.floor(i / o), col: i % o } : null
    };
  }
  /**
   * デバッグ/解析用。PC-98メインRAMの[addr, addr+len)をBase64文字列で取得する。
   * 範囲チェックはcoreReadMemory側(0<=addr, addr+len<=メインRAMサイズ)で行う。
   */
  readMemoryBase64(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    const o = Be(t, r);
    return { addr: t, len: r, base64: st(o) };
  }
  /** デバッグ用にPC-98メインRAMへ書き込む。CPU停止中の利用を前提とする。 */
  writeMemoryBase64(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    const o = ss(r);
    return er(t, o), { addr: t, len: o.byteLength };
  }
  /** PC-98スキャンコードを1回注入する。 */
  sendKey(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    T(t, r);
  }
  sleep(t) {
    return new Promise((r) => setTimeout(r, t));
  }
  /**
   * バスマウスの相対移動を、コアが一度に飲み込める量(±64)に分割して送る。
   * 各ステップ後、コアが移動量を消費し切る(webnp2_mouse_pending()が0になる)まで
   * 最大300ms待つ(10ms間隔)。ゲスト側がマウスを読まないソフトでハングしないよう、
   * 0にならなくても諦めて次のステップへ進む。
   */
  async mouseStep(t, r) {
    const n = Math.max(Math.ceil(Math.abs(t) / 64), Math.ceil(Math.abs(r) / 64), t === 0 && r === 0 ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const a = n - i, l = Math.trunc(t / a), d = Math.trunc(r / a);
      t -= l, r -= d, Yt(l, d);
      const u = Date.now();
      for (; Xt() !== 0 && Date.now() - u < 300; )
        await this.sleep(10);
    }
  }
  /**
   * バスマウスを画面外まで大きく動かして左上へ押し付ける(ホーミング)。
   * PC-98バスマウスは相対移動のみでカーソル位置はゲスト側が保持するため、
   * 絶対座標指定はここを基準に相対移動を積み上げて行う。
   */
  async mouseHome() {
    if (!this.isBooted()) throw new Error("not booted");
    await this.mouseStep(-1600, -1e3), this.mousePos = { x: 0, y: 0 };
  }
  /**
   * マウスカーソルを画面座標(x,y)へ移動する。x,yは0-639/0-399にクランプされる。
   * 現在位置が未確定(未ホーミング)なら先に mouseHome() する。
   * 戻り値は移動後のホスト側推定位置。
   */
  async mouseMoveTo(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    const o = Math.min(Math.max(Math.round(t), 0), 639), n = Math.min(Math.max(Math.round(r), 0), 399);
    this.mousePos || await this.mouseHome();
    const i = this.mousePos;
    return await this.mouseStep(o - i.x, n - i.y), this.mousePos = { x: o, y: n }, this.mousePos;
  }
  /** 現在のホスト側推定マウス位置を返す。未ホーミングなら null。 */
  getMousePosition() {
    return this.mousePos;
  }
  /**
   * マウスクリックを送る。x,y指定があれば先に mouseMoveTo する。
   * button既定は'left'、count既定1(最大3、ダブル/トリプルクリック用)。
   */
  async mouseClick(t) {
    if (!this.isBooted()) throw new Error("not booted");
    (t == null ? void 0 : t.x) !== void 0 && (t == null ? void 0 : t.y) !== void 0 && await this.mouseMoveTo(t.x, t.y);
    const r = (t == null ? void 0 : t.button) === "right" ? 1 : 0, o = Math.min(Math.max((t == null ? void 0 : t.count) ?? 1, 1), 3);
    for (let n = 0; n < o; n++)
      z(r, 1), await this.sleep(80), z(r, 0), n < o - 1 && await this.sleep(120);
  }
  /** from から to へドラッグする(移動→押下→移動→解放)。button既定'left'。 */
  async mouseDrag(t, r, o) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = o === "right" ? 1 : 0;
    await this.mouseMoveTo(t.x, t.y), z(n, 1), await this.sleep(100), await this.mouseMoveTo(r.x, r.y), await this.sleep(100), z(n, 0);
  }
  /**
   * 画面テキスト(getScreenText().lines)からneedleを含む位置(行・列)を検索する。
   * colは文字インデックス(全角文字を含む行でもlinesは既にデコード済み文字列のため)。
   * opts.all=falseまたは省略時は最初の1件のみ、trueなら全件を返す。大文字小文字は区別する。
   */
  findScreenText(t, r) {
    const { lines: o } = this.getScreenText(), n = [];
    if (t.length === 0) return n;
    for (let i = 0; i < o.length; i++) {
      const a = o[i];
      let l = 0;
      for (; ; ) {
        const d = a.indexOf(t, l);
        if (d < 0) break;
        if (n.push({ row: i, col: d, text: a }), !(r != null && r.all)) return n;
        l = d + t.length;
      }
    }
    return n;
  }
  /**
   * 画面テキスト中のneedleを見つけてクリックする。occurrence(既定0=最初)番目の一致を使う。
   * テキストセルサイズ(横8px×縦16px、80x25で640x400)から x = col*8+4, y = row*16+8 を計算する。
   * 見つからなければ found:false を返す。
   */
  async clickScreenText(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    const o = (r == null ? void 0 : r.occurrence) ?? 0, i = this.findScreenText(t, { all: !0 })[o];
    if (!i)
      return { found: !1 };
    const a = i.col * 8 + 4, l = i.row * 16 + 8;
    return await this.mouseClick({ x: a, y: l, button: r == null ? void 0 : r.button }), { found: !0, x: a, y: l };
  }
  /**
   * '+'区切りのキーコンボ文字列("CTRL+C" 等)を修飾キーコード列とメインキーコードへ解決する。
   * 解決できない場合は Error を投げる。
   */
  resolveCombo(t) {
    const r = t.split("+").map((d) => d.trim());
    if (r.length === 0 || r.some((d) => d.length === 0))
      throw new Error(`invalid key combo: ${t}`);
    const o = r[r.length - 1], i = r.slice(0, -1).filter((d) => Object.prototype.hasOwnProperty.call(L, d.toUpperCase())).map((d) => L[d.toUpperCase()]);
    let a;
    const l = L[o.toUpperCase()];
    if (l !== void 0)
      a = l;
    else {
      const d = Ke(o);
      if (!d)
        throw new Error(`cannot resolve key: ${o}`);
      a = d.code;
    }
    return { modifierCodes: i, mainCode: a };
  }
  /**
   * "CTRL+C" や "ENTER" のようなキーコンボを送る。
   * '+'区切りの最後のトークンがメインキー、それ以前は修飾キー(NAMED_KEYSに存在するもののみ)。
   */
  async sendKeys(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const { modifierCodes: r, mainCode: o } = this.resolveCombo(t);
    for (const n of r)
      T(n, !0), await this.sleep(30);
    T(o, !0), await this.sleep(30), T(o, !1), await this.sleep(30);
    for (const n of [...r].reverse())
      T(n, !1), await this.sleep(30);
  }
  /**
   * キー操作のマクロを順番に実行する(press/down/up/wait/text/paste)。
   * 長押し(holdMs指定のpress)や押しっぱなし→他操作→離す、といったキーシーケンスの再現に使う。
   * ステップ単体は最大10秒待ちにクランプ、シーケンス全体の累積待ち時間は60秒を超えるとErrorを投げる。
   * 例外発生時も、down で押しっぱなしのままのキーはすべて try/finally で自動的に up する。
   */
  async runKeySequence(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const r = 1e4, o = 6e4, n = /* @__PURE__ */ new Set();
    let i = 0, a = 0;
    const l = async (c) => {
      const h = Math.min(Math.max(c, 0), r);
      if (i += h, i > o)
        throw new Error(`runKeySequence: total wait time exceeded ${o}ms limit`);
      await this.sleep(h);
    }, d = async (c) => {
      T(c, !0), n.add(c), await l(30);
    }, u = async (c) => {
      T(c, !1), n.delete(c), await l(30);
    };
    try {
      for (let c = 0; c < t.length; c++) {
        const h = t[c];
        try {
          switch (h.type) {
            case "press": {
              const { modifierCodes: f, mainCode: m } = this.resolveCombo(h.keys);
              for (const p of f) await d(p);
              await d(m), await l(h.holdMs ?? 30), await u(m);
              for (const p of [...f].reverse()) await u(p);
              break;
            }
            case "down": {
              const { modifierCodes: f, mainCode: m } = this.resolveCombo(h.keys);
              for (const p of f) await d(p);
              await d(m);
              break;
            }
            case "up": {
              const { modifierCodes: f, mainCode: m } = this.resolveCombo(h.keys);
              await u(m);
              for (const p of [...f].reverse()) await u(p);
              break;
            }
            case "wait": {
              await l(h.ms);
              break;
            }
            case "text": {
              await this.typeText(h.text);
              break;
            }
            case "paste": {
              await this.pasteText(h.text);
              break;
            }
            default: {
              const f = h;
              throw new Error(`unknown step type: ${JSON.stringify(f)}`);
            }
          }
        } catch (f) {
          const m = f instanceof Error ? f.message : String(f);
          throw new Error(`runKeySequence: step ${c} (${h.type}) failed: ${m}`);
        }
        a++;
      }
    } finally {
      for (const c of Array.from(n).reverse())
        T(c, !1), n.delete(c);
    }
    return { executed: a };
  }
  /** 文字列を1文字ずつキー入力として送る。解決できない文字はスキップしログ通知する。 */
  async typeText(t) {
    if (!this.isBooted()) throw new Error("not booted");
    for (const r of t) {
      const o = Ke(r);
      if (!o) {
        this.emit("log", { level: "info", message: `typeText: skipped unresolvable char ${JSON.stringify(r)}` });
        continue;
      }
      const { code: n, shift: i } = o;
      i ? (T(L.SHIFT, !0), await this.sleep(30), T(n, !0), await this.sleep(30), T(n, !1), await this.sleep(30), T(L.SHIFT, !1), await this.sleep(30)) : (T(n, !0), await this.sleep(30), T(n, !1), await this.sleep(30));
    }
  }
  /**
   * ホスト側からテキストを送信する。ゲスト常駐TSR(PASTE.COM)のメールボックスが
   * 見つかればそちら経由(TSR経路)、無ければ従来のキーバッファ直接注入(キーバッファ経路)
   * を自動的に使い分ける。
   */
  async pasteText(t) {
    if (!this.isBooted()) throw new Error("not booted");
    let r = -1;
    try {
      r = se();
    } catch {
      r = -1;
    }
    return r >= 0 ? this.pasteTextViaMailbox(r, t) : this.pasteTextViaKeyBuffer(t);
  }
  /**
   * TSR経路: SJISバイト列をメールボックスのリングバッファへ書き込む。
   * DOSが旧ハンドラ内で入力待ちブロック中だと次の入力要求まで読まれないため、
   * 書き込み後に空きが全量(255)へ戻っていなければCR(0x0D)を1つキーバッファへ送り、
   * 現在の入力待ちを完了させて次の要求でTSRに拾わせる。
   */
  async pasteTextViaMailbox(t, r) {
    const { units: o, skipped: n } = fe(r), i = o.flat();
    $e(t, 1);
    let a = 0;
    for (const l of i) {
      for (; !Jt(t, l); )
        await this.sleep(20);
      a++;
    }
    return $e(t, 0), await this.sleep(600), Zt(t) < 255 && Ce(13), { sent: a, skipped: n };
  }
  /**
   * キーバッファ経路(従来): SJISバイト列(1バイト=1エントリ、上位scan=0)を
   * PC-98キーボードBIOSリングバッファへ直接積む。ゲスト側FEP無しで全角文字を
   * 入力できる。バッファは16エントリしかないため、満杯時は20ms待って再試行する
   * バックプレッシャで長文を流す。
   */
  async pasteTextViaKeyBuffer(t) {
    const { units: r, skipped: o } = fe(t);
    let n = 0, i = 0;
    for (const a of r) {
      for (; !(a.length === 2 ? qt(a[0], a[1]) : Ce(a[0])); )
        await this.sleep(20);
      n += a.length, i++, i % 4 === 0 && await this.sleep(10);
    }
    return { sent: n, skipped: o };
  }
  /**
   * 画面テキストに指定文字列が現れるまでポーリングして待つ。固定sleepの代わりに使う。
   * timeoutMs は 60000ms にクランプ。タイムアウト時は found:false と最後に読んだテキストを返す。
   */
  async waitScreenText(t, r = 1e4) {
    if (!this.isBooted()) throw new Error("not booted");
    const o = Math.min(Math.max(r, 0), 6e4), n = Date.now();
    let i = "";
    for (; ; ) {
      if (i = this.getScreenText().text, i.includes(t))
        return { found: !0, text: i };
      if (Date.now() - n >= o)
        return { found: !1, text: i };
      await this.sleep(200);
    }
  }
  /**
   * ゲストへペースト用TSR(PASTE.COM)入りツールFDを一時挿入し実行して、
   * 全角ペーストのTSR経路を有効化する。既に有効ならFD挿入せず即成功を返す。
   * mount管理には登録しない(一時挿入のため)。
   */
  async setupPasteHelper(t) {
    if (!this.fs) throw new Error("not booted");
    try {
      if (se() >= 0)
        return { ok: !0, message: "paste helper is already resident" };
    } catch {
    }
    const r = (t == null ? void 0 : t.drive) ?? 1, o = (t == null ? void 0 : t.command) ?? "b:paste";
    let n;
    try {
      const a = await fetch("./tools/webnp2tools.xdf");
      if (!a.ok)
        return { ok: !1, message: `failed to fetch webnp2tools.xdf (HTTP ${a.status})` };
      n = new Uint8Array(await a.arrayBuffer());
    } catch (a) {
      return { ok: !1, message: `failed to fetch webnp2tools.xdf: ${String(a)}` };
    }
    this.fs.writeFile("/disk/webnp2tools.xdf", n), W(r - 1, "/disk/webnp2tools.xdf"), await this.sleep(800), await this.typeText(`${o}
`);
    const i = Date.now();
    for (; ; ) {
      let a = -1;
      try {
        a = se();
      } catch {
        a = -1;
      }
      if (a >= 0)
        return { ok: !0, message: "paste helper is now resident" };
      if (Date.now() - i >= 8e3)
        return {
          ok: !1,
          message: `paste helper not detected. DOSプロンプトで ${o} を実行してください`
        };
      await this.sleep(500);
    }
  }
  /** boot完了時、IndexedDBに保存済みのステートがあればMEMFSへ先に書き戻しておく（実際のロードはユーザー操作で行う）。 */
  async restoreStateIfPresent() {
    if (!this.fs) return;
    const t = this.primaryEntry();
    if (t)
      try {
        const r = await N(`state:${t.sourceKey}`);
        r && !this.fs.analyzePath(x).exists && this.fs.writeFile(x, new Uint8Array(r.bytes));
      } catch (r) {
        this.emit("log", { level: "error", message: `restoreStateIfPresent failed: ${String(r)}` });
      }
  }
}
const ps = [".thd", ".hdi", ".nhd", ".hdd"], gs = [
  ".d88",
  ".d98",
  ".fdi",
  ".hdm",
  ".xdf",
  ".dup",
  ".2hd",
  ".nfd",
  ".fdd",
  ".hd4",
  ".hd5",
  ".hd9",
  ".h01",
  ".hdb",
  ".ddb",
  ".dd6",
  ".dd9",
  ".dcp",
  ".dcu",
  ".flp",
  ".tfd",
  ".fim",
  ".img",
  ".ima"
];
function ce(e) {
  const s = e.toLowerCase();
  return ps.some((t) => s.endsWith(t)) ? "hdd" : gs.some((t) => s.endsWith(t)) ? "fd" : null;
}
function bs(e) {
  try {
    const t = new URL(e, typeof location < "u" ? location.href : void 0).pathname, r = t.slice(t.lastIndexOf("/") + 1);
    return decodeURIComponent(r) || "disk.xdf";
  } catch {
    const s = e.split("?")[0].split("#")[0];
    return s.slice(s.lastIndexOf("/") + 1) || "disk.xdf";
  }
}
function it(e, s) {
  if (e.length !== s.length) return !1;
  for (let t = 0; t < e.length; t++)
    if (e[t] !== s[t]) return !1;
  return !0;
}
function vs(e) {
  return new ms(e);
}
class ys {
  constructor(s) {
    g(this, "pauseListeners", /* @__PURE__ */ new Set());
    g(this, "breakpointListeners", /* @__PURE__ */ new Set());
    this.target = s;
  }
  isBooted() {
    return this.target.isBooted();
  }
  setPaused(s) {
    this.target.dbgSetPaused(s);
    const t = { paused: this.target.dbgIsPaused() };
    for (const r of this.pauseListeners) r(t);
  }
  /** ポーズ中のイベントループ待ち時間(ms)を切り替える。呼び出し側(UI/デバッガ)で使い分ける。 */
  setPauseSleepMs(s) {
    this.target.dbgSetPauseSleepMs(s);
  }
  isPaused() {
    return this.target.dbgIsPaused();
  }
  step(s) {
    return this.target.dbgStep(s);
  }
  readRegisters() {
    return this.target.dbgReadRegs();
  }
  disassemble(s, t, r) {
    return this.target.dbgDisasm(s, t, r);
  }
  setBreakpoint(s, t, r, o) {
    this.target.dbgSetBreakpoint(s, t, r, o);
  }
  async runUntilBreakpoint(s) {
    const t = await this.target.dbgRunUntilBreakpoint(s);
    if (t >= 0) {
      const r = { index: t, registers: this.readRegisters() };
      for (const o of this.breakpointListeners) o(r);
    }
    return t;
  }
  readMemory(s, t) {
    const r = atob(this.target.readMemoryBase64(s, t).base64);
    return Uint8Array.from(r, (o) => o.charCodeAt(0));
  }
  /** ゲストRAMへ書き込む。実行中CPUとの競合を避けるためpause中だけ許可する。 */
  writeMemory(s, t) {
    if (!this.isPaused()) throw new Error("writeMemory requires paused CPU");
    if (!(t instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
    let r = "";
    const o = 8192;
    for (let n = 0; n < t.length; n += o)
      r += String.fromCharCode(...t.subarray(n, n + o));
    this.target.writeMemoryBase64(s, btoa(r));
  }
  onPause(s) {
    return this.pauseListeners.add(s), () => this.pauseListeners.delete(s);
  }
  onBreakpoint(s) {
    return this.breakpointListeners.add(s), () => this.breakpointListeners.delete(s);
  }
}
function Es(e) {
  return new ys(e);
}
function w(e, s = {}) {
  const t = document.createElement(e);
  for (const [r, o] of Object.entries(s))
    r === "class" ? t.className = o : t.setAttribute(r, o);
  return t;
}
function _(e, s) {
  return (e >>> 0).toString(16).toUpperCase().padStart(s, "0");
}
function ws(e, s) {
  return `${e & 65535}:${s >>> 0}`;
}
function Ts(e, s) {
  const t = w("div", { class: "debugger-toolbar" }), r = w("button", { type: "button", "data-debugger-pause": "true" }), o = w("button", { type: "button", "data-debugger-step": "true" }), n = w("button", { type: "button", "data-debugger-step10": "true" }), i = w("button", { type: "button", "data-debugger-run": "true" }), a = w("button", { type: "button", class: "debugger-close-btn" });
  t.append(r, o, n, i, a), e.append(t);
  let l = s.labels, d = !1;
  const u = () => {
    r.textContent = d ? l.resume : l.pause, o.textContent = l.step, n.textContent = l.step10, i.textContent = l.runToBreakpoint, a.textContent = l.close;
  };
  return r.addEventListener("click", s.onPauseToggle), o.addEventListener("click", () => s.onStep(1)), n.addEventListener("click", () => s.onStep(10)), i.addEventListener("click", s.onRunToBreakpoint), a.addEventListener("click", s.onClose), u(), {
    update(c) {
      d = c.paused, r.disabled = !c.enabled, o.disabled = !c.enabled || !d, n.disabled = !c.enabled || !d, i.disabled = !c.enabled || !d || !c.hasBreakpoints, u();
    },
    setLabels(c) {
      l = c, u();
    },
    destroy() {
      t.remove();
    }
  };
}
const Ss = [
  "eax",
  "ecx",
  "edx",
  "ebx",
  "esp",
  "ebp",
  "esi",
  "edi",
  "eip",
  "eflags",
  "cs",
  "ds",
  "es",
  "ss",
  "fs",
  "gs",
  "cr0"
], Ds = /* @__PURE__ */ new Set(["cs", "ds", "es", "ss", "fs", "gs"]), ks = [["CF", 0], ["PF", 2], ["AF", 4], ["ZF", 6], ["SF", 7], ["TF", 8], ["IF", 9], ["DF", 10], ["OF", 11]];
function Rs(e) {
  const s = w("div", { class: "debugger-register-grid" });
  e.append(s);
  let t;
  return {
    update(r) {
      s.replaceChildren();
      for (const o of Ss) {
        const n = w("div", {
          class: t && t[o] !== r[o] ? "debugger-register changed" : "debugger-register",
          "data-debugger-register": o
        }), i = w("span", { class: "debugger-register-name" });
        i.textContent = o.toUpperCase();
        const a = w("span", { class: "debugger-register-value" });
        if (a.textContent = _(r[o], Ds.has(o) ? 4 : 8), n.append(i, a), o === "eflags") {
          const l = w("span", { class: "debugger-flags" });
          l.textContent = ks.filter(([, d]) => (r.eflags & 1 << d) !== 0).map(([d]) => d).join(" ") || "—", n.append(l);
        }
        s.append(n);
      }
      t = { ...r };
    },
    destroy() {
      s.remove();
    }
  };
}
function Fs(e, s) {
  const t = w("div", { class: "debugger-disasm-list" });
  e.append(t);
  let r = { addBreakpoint: s.addBreakpointLabel, removeBreakpoint: s.removeBreakpointLabel }, o;
  const n = ({ seg: i, eip: a, lines: l, breakpoints: d }) => {
    t.replaceChildren();
    for (const u of l) {
      const c = d.has(ws(i, u.addr)), h = w("button", {
        type: "button",
        class: `debugger-disasm-row${u.addr === a ? " current" : ""}${c ? " breakpoint" : ""}`,
        "data-debugger-disasm-row": "true",
        "data-seg": String(i),
        "data-off": String(u.addr),
        "aria-label": c ? r.removeBreakpoint : r.addBreakpoint
      }), f = w("span", { class: "debugger-bp-marker", "aria-hidden": "true" });
      f.textContent = c ? "●" : "○";
      const m = w("span", { class: "debugger-disasm-address" });
      m.textContent = `${_(i, 4)}:${_(u.addr, 8)}`;
      const p = w("span", { class: "debugger-disasm-bytes" });
      p.textContent = u.bytes.map((E) => _(E, 2)).join(" ");
      const b = w("span", { class: "debugger-disasm-text" });
      b.textContent = u.text, h.append(f, m, p, b), h.addEventListener("click", () => s.onToggleBreakpoint(i, u.addr)), t.append(h);
    }
  };
  return {
    update(i) {
      o = i, n(i);
    },
    setLabels(i) {
      r = i, o && n(o);
    },
    destroy() {
      t.remove();
    }
  };
}
function Cs(e, s) {
  const t = w("input", {
    type: "text",
    inputmode: "text",
    value: "00000000",
    class: "debugger-memory-address"
  }), r = w("button", { type: "button", class: "debugger-memory-read" }), o = w("div", { class: "debugger-memory-controls" });
  o.append(t, r);
  const n = w("div", { class: "debugger-memory-dump" });
  e.append(o, n);
  let i = s.labels;
  const a = () => {
    t.setAttribute("aria-label", i.address), r.textContent = i.read;
  }, l = () => {
    var h, f;
    const u = t.value.trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]+$/i.test(u)) {
      (h = s.onError) == null || h.call(s, i.invalidAddress);
      return;
    }
    const c = Number.parseInt(u, 16);
    try {
      d.update(c, s.onRead(c));
    } catch (m) {
      (f = s.onError) == null || f.call(s, m instanceof Error ? m.message : String(m));
    }
  };
  r.addEventListener("click", l), t.addEventListener("keydown", (u) => {
    u.key === "Enter" && l();
  });
  const d = {
    update(u, c) {
      n.replaceChildren();
      for (let h = 0; h < c.length; h += 16) {
        const f = c.subarray(h, h + 16), m = w("div", { class: "debugger-memory-row" }), p = w("span", { class: "debugger-memory-offset" });
        p.textContent = _(u + h, 8);
        const b = w("span", { class: "debugger-memory-hex" });
        b.textContent = Array.from(f, (D) => _(D, 2)).join(" ");
        const E = w("span", { class: "debugger-memory-ascii" });
        E.textContent = Array.from(f, (D) => D >= 32 && D <= 126 ? String.fromCharCode(D) : ".").join(""), m.append(p, b, E), n.append(m);
      }
    },
    read: l,
    setEnabled(u) {
      r.disabled = !u;
    },
    setLabels(u) {
      i = u, a();
    },
    destroy() {
      o.remove(), n.remove();
    }
  };
  return a(), d;
}
export {
  ys as DebuggerController,
  ws as breakpointKey,
  Es as createDebugger,
  vs as createWebNP2,
  Ze as fatReadFile,
  Ts as mountDebuggerToolbar,
  Fs as mountDisassemblyView,
  Cs as mountMemoryDump,
  Rs as mountRegisterView,
  Xe as openDiskImage
};
