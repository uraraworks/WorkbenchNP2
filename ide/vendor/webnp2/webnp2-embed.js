var it = Object.defineProperty;
var dt = (e, o, t) => o in e ? it(e, o, { enumerable: !0, configurable: !0, writable: !0, value: t }) : e[o] = t;
var R = (e, o, t) => dt(e, typeof o != "symbol" ? o + "" : o, t);
const lt = "9276ee4-dirty";
function ct(e) {
  switch (e) {
    case "ro":
      return 1;
    case "rw":
      return 3;
    case "rwd":
      return 7;
  }
}
function ye() {
  var e;
  return ((e = window.Module) == null ? void 0 : e.FS) ?? window.FS;
}
function ut() {
  var e;
  return ((e = window.Module) == null ? void 0 : e.ccall) ?? window.ccall;
}
function G() {
  var e;
  return ((e = window.Module) == null ? void 0 : e.HEAPU8) ?? window.HEAPU8;
}
function ft() {
  var e;
  return ((e = window.Module) == null ? void 0 : e.HEAPU32) ?? window.HEAPU32;
}
function y() {
  const e = ut();
  if (!e)
    throw new Error("ccall is not available (core not booted yet?)");
  return e;
}
const Q = "./core/", we = "webnp2-core-script";
function J(e) {
  return `${e}?v=${lt}`;
}
const ht = [
  "2608_bd.wav",
  "2608_sd.wav",
  "2608_top.wav",
  "2608_hh.wav",
  "2608_tom.wav",
  "2608_rim.wav"
], mt = new Set(ht);
function pt(e) {
  return mt.has(e) ? e.toUpperCase() : void 0;
}
let ee = !1;
function gt(e) {
  var n;
  const t = ["[NekoProject21kai]", ((n = e.roms) == null ? void 0 : n.some((s) => s.name.toLowerCase() === "font.rom")) ?? !1 ? "fontfile=/font.rom" : "fontfile=/font.bmp"];
  e.hdd && t.push(`HDD1FILE=/disk/${e.hdd.name}`), t.push(`Latencys=${e.latencyMs ?? 40}`), t.push("keyrepeat_enable=true"), t.push("keyrepeat_delay=500"), t.push("keyrepeat_interval=50"), t.push("USEFMGEN=true"), t.push("PEGCPLNE=true");
  const r = Math.max(0, Math.min(230, Math.floor(e.extMemMB ?? 1)));
  if (t.push(`ExMemory=${r}`), e.clkMult !== void 0) {
    const s = Math.max(1, Math.min(32, Math.floor(e.clkMult)));
    t.push(`clk_mult=${s}`);
  }
  if (e.hostdrv) {
    const s = e.hostdrv.root ?? le;
    je(s), t.push("use_hdrv=true"), t.push(`hdrvroot=${s}`), t.push(`hdrv_acc=${ct(e.hostdrv.access ?? "rw")}`);
  }
  return t.join(`
`) + `
`;
}
const le = "/hostdrv";
function je(e) {
  if (!e.startsWith("/"))
    throw new Error(`hostdrv.root must start with '/': ${e}`);
  if (e.split("/").filter((t) => t.length > 0).some((t) => t === ".."))
    throw new Error(`hostdrv.root must not contain '..': ${e}`);
}
function bt(e, o) {
  const t = o.split("/").filter((n) => n.length > 0);
  let r = "";
  for (const n of t)
    r += `/${n}`, e.analyzePath(r).exists || e.mkdir(r);
}
function yt(e, o) {
  const t = o.root ?? le;
  je(t), bt(e, t);
  for (const r of o.files ?? [])
    e.writeFile(`${t}/${r.name}`, r.bytes);
}
function ce(e) {
  if (!e || e === "." || e === ".." || e.includes("/") || e.includes("\\"))
    throw new Error(`invalid hostdrv file name (root直下のみ許可): ${e}`);
}
function wt(e, o, t, r) {
  ce(t), e.writeFile(`${o}/${t}`, r);
}
function Dt(e, o, t) {
  ce(t);
  const r = `${o}/${t}`;
  return e.analyzePath(r).exists ? e.readFile(r, { encoding: "binary" }) : null;
}
function St(e, o) {
  return e.readdir(o).filter((t) => t !== "." && t !== "..");
}
function Pt(e, o, t) {
  ce(t);
  const r = `${o}/${t}`;
  return e.analyzePath(r).exists ? (e.unlink(r), !0) : !1;
}
function kt(e, o) {
  if (!e || !o)
    throw new Error("hostdrv is not enabled (boot() に hostdrv を渡していません)");
  return { fs: e, root: o };
}
function Et(e, o) {
  return ee ? Promise.reject(new Error("core is already booted (reload the page to reboot)")) : (ee = !0, new Promise((t, r) => {
    let n = !1;
    const s = (c) => {
      n || (n = !0, ee = !1, r(c instanceof Error ? c : new Error(String(c))));
    };
    window.onerror = (c, u, f, p, h) => (console.error("[WebNP2 core] window.onerror", c, u, f, p, h), s(h ?? c), !1);
    const a = {
      canvas: o,
      preRun: [
        function() {
          const u = ye();
          if (!u) {
            s(new Error("FS is not available in preRun"));
            return;
          }
          try {
            u.analyzePath("/disk").exists || u.mkdir("/disk"), e.hdd && u.writeFile(`/disk/${e.hdd.name}`, e.hdd.bytes);
            for (const f of e.fds)
              u.writeFile(`/disk/${f.name}`, f.bytes);
            for (const f of e.roms ?? []) {
              const p = f.name.toLowerCase();
              u.writeFile(`/${p}`, f.bytes);
              const h = pt(p);
              h && u.writeFile(`/${h}`, f.bytes);
            }
            u.createPreloadedFile("/", "font.bmp", J(`${Q}font.bmp`), !0, !1), e.hostdrv && yt(u, e.hostdrv), u.writeFile("/np21kai.cfg", gt(e));
          } catch (f) {
            s(f);
          }
        }
      ],
      print: (c) => console.log("[WebNP2 core stdout]", c),
      printErr: (c) => console.log("[WebNP2 core stderr]", c),
      // locateFile はこのビルドでは emnp21kai_sdl2.wasm の取得先解決にのみ使われる
      // (emnp21kai_sdl2.js内のlocateFile("emnp21kai_sdl2.wasm")呼び出し1箇所のみ)。
      locateFile: (c) => J(Q + c),
      arguments: e.fds.map((c) => `/disk/${c.name}`),
      onRuntimeInitialized: () => {
        if (n) return;
        n = !0;
        const c = ye();
        if (!c) {
          s(new Error("FS is not available after runtime init"));
          return;
        }
        t(c);
      },
      onAbort: (c) => {
        console.error("[WebNP2 core] aborted", c), s(new Error(`core aborted: ${String(c)}`));
      }
    }, i = o.getContext.bind(o);
    o.getContext = (c, u) => c === "webgl" || c === "webgl2" || c === "experimental-webgl" ? i(c, { ...u ?? {}, preserveDrawingBuffer: !0 }) : i(c, u), window.Module = a;
    const d = document.getElementById(we);
    d && d.remove();
    const l = document.createElement("script");
    l.id = we, l.src = J(`${Q}emnp21kai_sdl2.js`), l.onerror = () => s(new Error(`failed to load ${l.src}`)), document.body.appendChild(l);
  }));
}
function U(e, o) {
  return e.readFile(`/disk/${o}`, { encoding: "binary" });
}
function O(e, o) {
  try {
    const t = e.stat(`/disk/${o}`), r = t.mtime instanceof Date ? t.mtime.getTime() : Number(t.mtime);
    return Number.isFinite(r) ? { mtimeMs: r, size: t.size } : null;
  } catch {
    return null;
  }
}
function Rt() {
  y()("webnp2_reset", null, [], []);
}
function K(e, o) {
  y()("webnp2_set_fdd", null, ["number", "string"], [e, o]);
}
function Ft(e) {
  return y()("webnp2_fdd_ready", "number", ["number"], [e]);
}
function De(e) {
  return y()("webnp2_statsave", "number", ["string"], [e]);
}
function Se(e) {
  return y()("webnp2_statload", "number", ["string"], [e]);
}
function Tt(e, o) {
  y()("webnp2_mouse_move", null, ["number", "number"], [e, o]);
}
function vt() {
  return y()("webnp2_mouse_pending", "number", [], []);
}
function W(e, o) {
  y()("webnp2_mouse_button", null, ["number", "number"], [e, o]);
}
function E(e, o) {
  y()("webnp2_key", null, ["number", "number"], [e, o ? 1 : 0]);
}
function Pe(e) {
  return y()("webnp2_push_key_buffer", "number", ["number"], [e]);
}
function $t(e, o) {
  return y()("webnp2_push_key_buffer_pair", "number", ["number", "number"], [e, o]);
}
function te() {
  return y()("webnp2_find_mailbox", "number", [], []);
}
function Ct(e) {
  return y()("webnp2_mailbox_space", "number", ["number"], [e]);
}
function Bt(e, o) {
  return y()("webnp2_mailbox_put", "number", ["number", "number"], [e, o]);
}
function ke(e, o) {
  y()("webnp2_mailbox_pending", null, ["number", "number"], [e, o]);
}
function xt() {
  const e = y(), o = e("webnp2_read_tvram", "number", [], []), t = e("webnp2_tvram_size", "number", [], []), r = G();
  if (!r)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  return r.slice(o, o + t);
}
function At(e, o) {
  const t = y(), r = t("webnp2_mem_ptr", "number", [], []), n = t("webnp2_mem_size", "number", [], []);
  if (e < 0 || o < 0 || e + o > n)
    throw new Error(`coreReadMemory: out of range (addr=${e}, len=${o}, memSize=${n})`);
  const s = G();
  if (!s)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  return s.slice(r + e, r + e + o);
}
function Mt(e, o) {
  const t = y(), r = t("webnp2_mem_ptr", "number", [], []), n = t("webnp2_mem_size", "number", [], []);
  if (e < 0 || e + o.byteLength > n)
    throw new Error(`coreWriteMemory: out of range (addr=${e}, len=${o.byteLength}, memSize=${n})`);
  const s = G();
  if (!s)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  s.set(o, r + e);
}
function Lt(e) {
  y()("webnp2_dbg_set_paused", null, ["number"], [e ? 1 : 0]);
}
function Nt() {
  return y()("webnp2_dbg_paused", "number", [], []);
}
function _t(e) {
  return y()("webnp2_dbg_step", "number", ["number"], [e]);
}
function It() {
  const e = y(), o = e("webnp2_dbg_regs", "number", [], []), t = e("webnp2_dbg_regs_size", "number", [], []), r = ft();
  if (!o || !r || t <= 0 || o & 3 || t & 3)
    throw new Error("webnp2_dbg_regs returned an invalid buffer");
  const n = o >>> 2;
  return r.slice(n, n + (t >>> 2));
}
function Ht(e, o, t) {
  const r = y()(
    "webnp2_dbg_disasm",
    "number",
    ["number", "number", "number"],
    [e, o, t]
  ), n = G();
  if (!r || !n)
    throw new Error("webnp2_dbg_disasm returned an invalid buffer");
  let s = r;
  for (; s < n.length && n[s] !== 0; ) s++;
  if (s === n.length)
    throw new Error("webnp2_dbg_disasm returned a non-terminated string");
  return new TextDecoder().decode(n.subarray(r, s));
}
function Ut(e, o, t, r) {
  y()(
    "webnp2_dbg_set_bp",
    null,
    ["number", "number", "number", "number"],
    [e, o, t, r ? 1 : 0]
  );
}
function Ot(e) {
  return y()("webnp2_dbg_run_until_bp", "number", ["number"], [e]);
}
const Kt = "webnp2", Wt = 1, F = "images";
let j = null;
function H() {
  return j || (j = new Promise((e, o) => {
    const t = indexedDB.open(Kt, Wt);
    t.onupgradeneeded = () => {
      const r = t.result;
      r.objectStoreNames.contains(F) || r.createObjectStore(F, { keyPath: "sourceKey" });
    }, t.onsuccess = () => e(t.result), t.onerror = () => o(t.error ?? new Error("failed to open IndexedDB"));
  }), j);
}
async function B(e) {
  const o = await H();
  return new Promise((t, r) => {
    const a = o.transaction(F, "readonly").objectStore(F).get(e);
    a.onsuccess = () => t(a.result ?? void 0), a.onerror = () => r(a.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function L(e) {
  const o = await H();
  return new Promise((t, r) => {
    const n = o.transaction(F, "readwrite");
    n.objectStore(F).put(e), n.oncomplete = () => t(), n.onerror = () => r(n.error ?? new Error("failed to write to IndexedDB"));
  });
}
async function jt(e) {
  const o = await B(e.sourceKey);
  if (!o) {
    await L(e);
    return;
  }
  const t = o.displayName !== void 0 || o.group !== void 0 || o.groupName !== void 0 || o.groupIndex !== void 0;
  await L({
    ...e,
    displayName: t ? o.displayName : e.displayName,
    group: t ? o.group : e.group,
    groupName: t ? o.groupName : e.groupName,
    groupIndex: t ? o.groupIndex : e.groupIndex
  });
}
async function zt(e) {
  const o = await H();
  return new Promise((t, r) => {
    const s = o.transaction(F, "readonly").objectStore(F), a = IDBKeyRange.bound(e, e + "￿"), i = s.getAll(a);
    i.onsuccess = () => t(i.result ?? []), i.onerror = () => r(i.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function Vt() {
  const e = await H();
  return new Promise((o, t) => {
    const s = e.transaction(F, "readonly").objectStore(F).getAll();
    s.onsuccess = () => o(s.result ?? []), s.onerror = () => t(s.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function Gt(e) {
  const o = await H();
  return new Promise((t, r) => {
    const n = o.transaction(F, "readwrite");
    n.objectStore(F).delete(e), n.oncomplete = () => t(), n.onerror = () => r(n.error ?? new Error("failed to delete from IndexedDB"));
  });
}
const Yt = "webnp2.lang", Xt = {
  ja: {
    title: () => "WebNP2 - PC-98 Emulator",
    footerCopyright: () => "© URARA-works",
    footerGithubLabel: () => "GitHubで見る",
    footerAboutLabel: () => "WebNP2について",
    toolbarHelp: () => "使い方",
    toolbarMore: () => "その他",
    toolbarGroupInput: () => "入力",
    toolbarGroupDisk: () => "ディスク",
    toolbarGroupState: () => "ステート",
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
    statusStateSaved: () => "ステートを保存しました。",
    statusStateLoaded: () => "ステートを復元しました。",
    statusFdInserted: ({ drive: e, name: o }) => `FDD${e} に挿入しました: ${o}`,
    statusFdEjected: ({ drive: e }) => `FDD${e} を排出しました。`,
    statusFreeDosInserted: ({ drive: e }) => `FDD${e} に FreeDOS(98) を挿入しました。マシンリセットで起動します。`,
    dropUnsupported: () => "対応していないファイル形式です（HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup 等、圧縮: .zip/.lzh）",
    dropNoDiskImage: () => "ディスクイメージが見つかりませんでした。",
    statusArchiveFailed: ({ name: e, message: o }) => `${e} の展開に失敗しました: ${o}`,
    statusLibraryAdded: ({ count: e }) => `ディスクライブラリに${e}件追加しました。`,
    statusArchiveResumed: ({ label: e, count: o }) => `${e}: 前回展開した圧縮ファイルの${o}件を復元しました。`,
    statusArchiveNoDiskImage: ({ label: e }) => `${e}: 圧縮ファイル内にディスクイメージが見つかりませんでした。`,
    statusArchiveKindMismatch: ({ label: e, kind: o }) => `${e}: 圧縮ファイル内に${o === "hdd" ? "HDD" : "FD"}イメージが見つかりませんでした。`,
    statusArchiveNeedsSelection: () => "圧縮ファイルに複数のディスクが含まれています。ディスクライブラリから使うディスクを選んでください。",
    statusDiskSet: ({ name: e }) => `${e} をセットしました。起動前ならファイル転送で中身を編集できます。起動ボタンで起動します。`,
    statusDiskUnset: ({ name: e }) => `${e} を外しました。`,
    statusHddBlankCreated: ({ name: e }) => `ブランクHDD ${e} を作成してセットしました(40MB・FAT16)。単体では起動できないため、FDからDOSを起動してデータ用ドライブとして使ってください。`,
    dropConfirm: ({ count: e, names: o }) => `${e}件のファイルを読み込みます: ${o}
よろしいですか？`,
    diskReplaceUnsupported: () => "起動後のディスク差し替えは Phase 2 で対応予定です。ページを再読み込みしてください。",
    noMountedImage: () => "マウント中のイメージがありません。",
    pickSlotPrompt: ({ action: e, slots: o }) => `${e}対象を選択してください: ${o}`,
    pickSlotActionReset: () => "初期状態に戻す",
    statusPreparing: () => "起動準備中…",
    statusNoImage: () => "イメージが指定されていません。ファイルをドラッグ&ドロップして読み込んでください。",
    statusCoreBooting: () => "コアを起動しています…",
    statusBootSuccess: () => "起動しました。",
    statusBootFailed: ({ message: e }) => `起動に失敗しました: ${e}`,
    statusResumed: ({ label: e, name: o }) => `${e}: 前回の続きから再開中です（${o}）`,
    urlLibSlotLabel: ({ index: e }) => `ライブラリ${e}`,
    statusFetching: ({ label: e, name: o }) => `${e} を取得中: ${o}`,
    statusFetchingProgress: ({ label: e, name: o, loaded: t, total: r }) => `${e} を取得中: ${o} (${t}${r ? " / " + r : ""})`,
    fetchFailedNetwork: ({ url: e }) => `イメージの取得に失敗しました（ネットワークエラーまたはCORS設定を確認してください）: ${e}`,
    fetchFailedHttp: ({ url: e, status: o }) => `イメージの取得に失敗しました（HTTP ${o}）: ${e}`,
    fetchFailedOneDrive: ({ url: e }) => `イメージの取得に失敗しました: ${e}
OneDriveの共有リンクは仕様上ご利用いただけません。Google DriveかDropboxをお使いください。`,
    fetchFailedNeedsProxy: ({ url: e }) => `イメージの取得に失敗しました: ${e}
この配信元は中継サーバ経由でのみ取得できますが、このビルドでは中継(VITE_DISK_PROXY)が設定されていません。自分でホストしている場合は VITE_DISK_PROXY を設定してください(詳細はREADME)。`,
    fetchFailedProxy: ({ url: e, reason: o }) => `イメージの取得に失敗しました: ${e}
${o}`,
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
    romDialogSaved: ({ saved: e, skipped: o }) => `${e}件のファイルを登録しました。${o > 0 ? `(${o}件は非対応形式のためスキップ)` : ""}`,
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
    libraryDeleteGroupConfirm: ({ name: e, count: o }) => `フォルダ「${e}」内の${o}件をすべて削除します。よろしいですか？`,
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
    statusPasteSkipped: ({ count: e, chars: o }) => `${e}文字を送信できずスキップしました: ${o}`,
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
    debuggerBreakpointAdded: ({ index: e, seg: o, off: t }) => `BP${e}: ${o}:${t} を設定しました。`,
    debuggerBreakpointRemoved: ({ seg: e, off: o }) => `${e}:${o} のBPを解除しました。`,
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
    fmArchiveError: ({ name: e, message: o }) => `${e} の展開に失敗しました: ${o}`,
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
    fmFreeSpaceLabel: ({ free: e, total: o }) => `空き容量: ${e} / ${o}`,
    fmSelectEditableTarget: () => "編集可能なディスクを選択してください(D88は非対応、HDDは起動前のみ編集できます)。",
    fmEmptyDir: () => "(空のフォルダ)",
    fmRenameConfirm: ({ list: e }) => `以下のファイル名でディスクへ転送します(8.3形式へ変換済み)。よろしいですか？

${e}`,
    fmOverwriteConfirm: ({ names: e }) => `同名のファイルを上書きします: ${e}
よろしいですか？`,
    fmInsufficientSpace: ({ needed: e, free: o }) => `空き容量が不足しています(必要: ${e} / 空き: ${o})。`,
    fmTransferring: ({ current: e, total: o }) => `転送中… (${e}/${o})`,
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
    gamepadAxisLabel: ({ index: e, dir: o }) => `軸${e} ${o}`,
    gamepadAxisInvalidSuffix: () => "(無効・範囲外の値)",
    gamepadAxisUncalibratedSuffix: () => "(未較正・一度動かすと使えます)",
    gamepadAxisCalibratingSuffix: () => "(較正中・そのまま数秒待ってください)",
    gamepadPositionalButtonLabel: ({ index: e, position: o }) => `#${e} (${o})`,
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
    toolbarGroupInput: () => "Input",
    toolbarGroupDisk: () => "Disk",
    toolbarGroupState: () => "State",
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
    statusStateSaved: () => "State saved.",
    statusStateLoaded: () => "State loaded.",
    statusFdInserted: ({ drive: e, name: o }) => `Inserted into FDD${e}: ${o}`,
    statusFdEjected: ({ drive: e }) => `Ejected FDD${e}.`,
    statusFreeDosInserted: ({ drive: e }) => `Inserted FreeDOS(98) into FDD${e}. Reset the machine to boot it.`,
    dropUnsupported: () => "Unsupported file format (HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup, archives: .zip/.lzh)",
    dropNoDiskImage: () => "No disk image was found.",
    statusArchiveFailed: ({ name: e, message: o }) => `Failed to extract ${e}: ${o}`,
    statusLibraryAdded: ({ count: e }) => `Added ${e} image(s) to the disk library.`,
    statusArchiveResumed: ({ label: e, count: o }) => `${e}: Resumed ${o} image(s) from the previously extracted archive.`,
    statusArchiveNoDiskImage: ({ label: e }) => `${e}: No disk image found inside the archive.`,
    statusArchiveKindMismatch: ({ label: e, kind: o }) => `${e}: No ${o === "hdd" ? "HDD" : "FD"} image found inside the archive.`,
    statusArchiveNeedsSelection: () => "The archive contains multiple disks. Please choose one from the disk library.",
    statusDiskSet: ({ name: e }) => `Set ${e}. You can edit its contents via file transfer before boot. Press the boot button to start.`,
    statusDiskUnset: ({ name: e }) => `Removed ${e}.`,
    statusHddBlankCreated: ({ name: e }) => `Created and set blank HDD ${e} (40MB, FAT16). It is not bootable on its own — boot DOS from a floppy and use it as a data drive.`,
    dropConfirm: ({ count: e, names: o }) => `Loading ${e} file(s): ${o}
Continue?`,
    diskReplaceUnsupported: () => "Swapping disks after boot is planned for Phase 2. Please reload the page.",
    noMountedImage: () => "No image is currently mounted.",
    pickSlotPrompt: ({ action: e, slots: o }) => `Select a target to ${e}: ${o}`,
    pickSlotActionReset: () => "reset",
    statusPreparing: () => "Preparing to start…",
    statusNoImage: () => "No image specified. Drag & drop a file to load it.",
    statusCoreBooting: () => "Starting the core…",
    statusBootSuccess: () => "Started.",
    statusBootFailed: ({ message: e }) => `Failed to start: ${e}`,
    statusResumed: ({ label: e, name: o }) => `${e}: Resuming from previous session (${o})`,
    urlLibSlotLabel: ({ index: e }) => `Library ${e}`,
    statusFetching: ({ label: e, name: o }) => `Fetching ${e}: ${o}`,
    statusFetchingProgress: ({ label: e, name: o, loaded: t, total: r }) => `Fetching ${e}: ${o} (${t}${r ? " / " + r : ""})`,
    fetchFailedNetwork: ({ url: e }) => `Failed to fetch image (check network error or CORS settings): ${e}`,
    fetchFailedHttp: ({ url: e, status: o }) => `Failed to fetch image (HTTP ${o}): ${e}`,
    fetchFailedOneDrive: ({ url: e }) => `Failed to fetch image: ${e}
OneDrive share links can't be used due to OneDrive's own restrictions. Please use Google Drive or Dropbox instead.`,
    fetchFailedNeedsProxy: ({ url: e }) => `Failed to fetch image: ${e}
This source can only be fetched through the relay server, but this build has no relay (VITE_DISK_PROXY) configured. If you're hosting this yourself, set VITE_DISK_PROXY (see the README for details).`,
    fetchFailedProxy: ({ url: e, reason: o }) => `Failed to fetch image: ${e}
${o}`,
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
    romDialogSaved: ({ saved: e, skipped: o }) => `Registered ${e} file(s).${o > 0 ? ` (${o} skipped as unsupported)` : ""}`,
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
    libraryDeleteGroupConfirm: ({ name: e, count: o }) => `This will delete all ${o} image(s) in the folder "${e}". Continue?`,
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
    statusPasteSkipped: ({ count: e, chars: o }) => `Skipped ${e} unsupported character(s): ${o}`,
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
    debuggerBreakpointAdded: ({ index: e, seg: o, off: t }) => `Set BP${e} at ${o}:${t}.`,
    debuggerBreakpointRemoved: ({ seg: e, off: o }) => `Removed BP at ${e}:${o}.`,
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
    fmArchiveError: ({ name: e, message: o }) => `Failed to extract ${e}: ${o}`,
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
    fmFreeSpaceLabel: ({ free: e, total: o }) => `Free space: ${e} / ${o}`,
    fmSelectEditableTarget: () => "Select an editable disk (D88 is unsupported; HDD images can only be edited before boot).",
    fmEmptyDir: () => "(empty folder)",
    fmRenameConfirm: ({ list: e }) => `These files will be sent to the disk with the following 8.3 names. Continue?

${e}`,
    fmOverwriteConfirm: ({ names: e }) => `This will overwrite existing file(s): ${e}
Continue?`,
    fmInsufficientSpace: ({ needed: e, free: o }) => `Not enough free space (needed: ${e} / free: ${o}).`,
    fmTransferring: ({ current: e, total: o }) => `Transferring… (${e}/${o})`,
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
    gamepadAxisLabel: ({ index: e, dir: o }) => `Axis ${e} ${o}`,
    gamepadAxisInvalidSuffix: () => "(invalid, out of range)",
    gamepadAxisUncalibratedSuffix: () => "(not calibrated yet — move it once to use)",
    gamepadAxisCalibratingSuffix: () => "(calibrating — please wait a few seconds)",
    gamepadPositionalButtonLabel: ({ index: e, position: o }) => `#${e} (${o})`,
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
function qt() {
  try {
    const e = localStorage.getItem(Yt);
    return e === "ja" || e === "en" ? e : null;
  } catch {
    return null;
  }
}
function Zt() {
  var t;
  const e = new URLSearchParams(location.search).get("lang");
  if (e === "ja" || e === "en") return e;
  const o = qt();
  return o || ((t = navigator.language) != null && t.toLowerCase().startsWith("ja") ? "ja" : "en");
}
let re = null;
function Qt() {
  return re === null && (re = Zt()), re;
}
function S(e, ...o) {
  const t = Xt[Qt()][e];
  return t(...o);
}
const ie = "".trim().replace(/\/+$/, ""), Jt = ["1drv.ms", "onedrive.live.com", "sharepoint.com"], er = ["drive.google.com", "docs.google.com", "www.dropbox.com", "dropbox.com"], tr = ["drive.google.com", "docs.google.com"], rr = ["www.dropbox.com", "dropbox.com"], or = "dl.dropboxusercontent.com";
function nr(e) {
  let o;
  try {
    o = new URL(e);
  } catch {
    return e;
  }
  return z(o.hostname, rr) ? (o.hostname = or, o.toString()) : e;
}
function sr(e) {
  try {
    return new URL(e).hostname;
  } catch {
    return "";
  }
}
function z(e, o) {
  return o.some((t) => e === t || e.endsWith(`.${t}`));
}
const ar = ["<!do", "<htm", "<?xm"];
function ze(e, o) {
  if (o && o.toLowerCase().startsWith("text/html")) return !0;
  if (e.length < 4) return !1;
  const t = new TextDecoder("ascii", { fatal: !1 }).decode(e.subarray(0, 5)).toLowerCase();
  return ar.some((r) => t.startsWith(r));
}
function ir(e, o) {
  switch (o) {
    case "bad_url":
      return S("proxyReasonBadUrl");
    case "origin_not_allowed":
      return S("proxyReasonOriginNotAllowed");
    case "host_not_allowed":
      return S("proxyReasonHostNotAllowed");
    case "too_large":
      return S("proxyReasonTooLarge");
    case "rate_limited":
      return S("proxyReasonRateLimited");
    case "upstream_failed":
      return S("proxyReasonUpstreamFailed");
    case "redirect_not_allowed":
      return S("proxyReasonRedirectNotAllowed");
    default:
      return S("proxyReasonUnknown", { status: e });
  }
}
async function Ve(e, o) {
  const t = e.headers.get("content-length"), r = t ? Number(t) : null;
  if (!e.body) {
    const l = await e.arrayBuffer();
    return o(l.byteLength, r), new Uint8Array(l);
  }
  const n = e.body.getReader(), s = [];
  let a = 0;
  for (; ; ) {
    const { done: l, value: c } = await n.read();
    if (l) break;
    c && (s.push(c), a += c.byteLength, o(a, r));
  }
  const i = new Uint8Array(a);
  let d = 0;
  for (const l of s)
    i.set(l, d), d += l.byteLength;
  return i;
}
async function dr(e, o, t) {
  const r = `${ie}/fetch?url=${encodeURIComponent(e)}`;
  let n;
  try {
    n = await fetch(r);
  } catch {
    throw t;
  }
  if (!n.ok) {
    let a;
    try {
      a = (await n.clone().json()).error;
    } catch {
    }
    throw new Error(S("fetchFailedProxy", { url: e, reason: ir(n.status, a) }));
  }
  const s = await Ve(n, o);
  if (ze(s, n.headers.get("content-type")))
    throw new Error(S("fetchFailedHtmlPage", { url: e }));
  return s;
}
async function lr(e, o) {
  const t = () => {
  }, r = sr(e);
  if (z(r, Jt))
    throw new Error(S("fetchFailedOneDrive", { url: e }));
  const n = !!ie && z(r, tr);
  let s, a = !1;
  if (!n) {
    const d = nr(e);
    try {
      const l = await fetch(d);
      if (!l.ok)
        throw new Error(S("fetchFailedHttp", { url: d, status: l.status }));
      const c = await Ve(l, t);
      if (!ze(c, l.headers.get("content-type")))
        return c;
      a = !0;
    } catch (l) {
      s = l instanceof Error && l.message ? l : new Error(S("fetchFailedNetwork", { url: d }));
    }
  }
  if (!ie)
    throw a ? new Error(S("fetchFailedHtmlPage", { url: e })) : s ? z(r, er) ? new Error(S("fetchFailedNeedsProxy", { url: e })) : s : new Error(S("fetchFailedNeedsProxy", { url: e }));
  const i = s ?? new Error(S("fetchFailedNetwork", { url: e }));
  return await dr(e, t, i);
}
const A = {
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
}, oe = {
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
}, Ee = {
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
function Re(e) {
  if (e === `
` || e === "\r")
    return { code: A.ENTER, shift: !1 };
  if (e.length === 1 && e >= "A" && e <= "Z") {
    const o = e.toLowerCase(), t = oe[o];
    return t !== void 0 ? { code: t, shift: !0 } : void 0;
  }
  if (Object.prototype.hasOwnProperty.call(oe, e))
    return { code: oe[e], shift: !1 };
  if (Object.prototype.hasOwnProperty.call(Ee, e))
    return { code: Ee[e], shift: !0 };
}
let ne = null;
function cr() {
  const e = /* @__PURE__ */ new Map(), o = new TextDecoder("shift_jis"), t = [
    [129, 159],
    [224, 239]
  ], r = [
    [64, 126],
    [128, 252]
  ];
  for (const [n, s] of t)
    for (let a = n; a <= s; a++)
      for (const [i, d] of r)
        for (let l = i; l <= d; l++) {
          const c = o.decode(new Uint8Array([a, l]));
          c.length === 1 && c !== "�" && (e.has(c) || e.set(c, [a, l]));
        }
  return e;
}
function ur() {
  return ne || (ne = cr()), ne;
}
const Fe = {
  "〜": "～",
  "−": "－",
  "―": "—"
};
function de(e) {
  const o = ur(), t = [], r = [], n = Array.from(e);
  for (let s = 0; s < n.length; s++) {
    let a = n[s];
    if (a === "\r") {
      n[s + 1] === `
` && s++, t.push([13]);
      continue;
    }
    if (a === `
`) {
      t.push([13]);
      continue;
    }
    const i = a.codePointAt(0) ?? 0;
    if (i >= 32 && i <= 126) {
      t.push([i]);
      continue;
    }
    if (i >= 65377 && i <= 65439) {
      t.push([161 + (i - 65377)]);
      continue;
    }
    if (a === "¥") {
      t.push([92]);
      continue;
    }
    Fe[a] && (a = Fe[a]);
    const d = o.get(a);
    if (d) {
      t.push([d[0], d[1]]);
      continue;
    }
    r.push(a);
  }
  return { units: t, skipped: r };
}
class $ extends Error {
  constructor(o, t, r = {}) {
    super(t), this.code = o, this.params = r, this.name = "DiskError";
  }
}
const fr = [128, 256, 512, 1024, 2048], N = 32, Ge = 8, x = 16, Ye = 15, _ = 229, I = 0;
function P(e, o) {
  return e[o] | e[o + 1] << 8;
}
function v(e, o) {
  return (e[o] | e[o + 1] << 8 | e[o + 2] << 16 | e[o + 3] << 24) >>> 0;
}
function w(e, o, t) {
  e[o] = t & 255, e[o + 1] = t >> 8 & 255;
}
function ue(e, o, t) {
  e[o] = t & 255, e[o + 1] = t >>> 8 & 255, e[o + 2] = t >>> 16 & 255, e[o + 3] = t >>> 24 & 255;
}
function V(e, o = 0) {
  if (e.length < o + 512)
    throw new Error(`openFat: image too small (${e.length} bytes)`);
  const t = e, r = o, n = P(t, r + 11), s = t[r + 13], a = P(t, r + 14), i = t[r + 16], d = P(t, r + 17), l = P(t, r + 19), c = P(t, r + 22), u = v(t, r + 32), f = l !== 0 ? l : u;
  if (!fr.includes(n))
    throw new Error(`openFat: invalid BPB (bytes/sector=${n})`);
  if (s === 0)
    throw new Error("openFat: invalid BPB (sectors/cluster=0)");
  if (i === 0)
    throw new Error("openFat: invalid BPB (FAT count=0)");
  if (c === 0)
    throw new Error("openFat: invalid BPB (sectors/FAT=0)");
  if (f === 0)
    throw new Error("openFat: invalid BPB (total sectors=0)");
  const p = Math.ceil(d * N / n), h = a, m = h + i * c, g = m + p, k = f - g, D = Math.floor(k / s), T = D < 4085 ? "FAT12" : "FAT16";
  return {
    image: e,
    imageOffset: o,
    bytesPerSector: n,
    sectorsPerCluster: s,
    reservedSectors: a,
    numFats: i,
    rootEntries: d,
    sectorsPerFat: c,
    totalSectors: f,
    fatType: T,
    fatStartByte: r + h * n,
    rootStartByte: r + m * n,
    rootDirBytes: p * n,
    dataStartByte: r + g * n,
    totalClusters: D,
    bytesPerCluster: s * n
  };
}
const Xe = { FAT12: 4095, FAT16: 65535 };
function fe(e, o) {
  const t = e.fatStartByte;
  if (e.fatType === "FAT12") {
    const n = t + Math.floor(o * 3 / 2), s = e.image[n], a = e.image[n + 1];
    return o % 2 === 0 ? s | (a & 15) << 8 : s >> 4 | a << 4;
  }
  const r = t + o * 2;
  return P(e.image, r);
}
function he(e, o, t) {
  for (let r = 0; r < e.numFats; r++) {
    const n = e.fatStartByte + r * e.sectorsPerFat * e.bytesPerSector;
    if (e.fatType === "FAT12") {
      const s = n + Math.floor(o * 3 / 2);
      o % 2 === 0 ? (e.image[s] = t & 255, e.image[s + 1] = e.image[s + 1] & 240 | t >> 8 & 15) : (e.image[s] = e.image[s] & 15 | t << 4 & 240, e.image[s + 1] = t >> 4 & 255);
    } else {
      const s = n + o * 2;
      w(e.image, s, t & 65535);
    }
  }
}
function hr(e, o) {
  return e.fatType === "FAT12" ? o >= 4087 : o >= 65527;
}
function me(e) {
  return e === 0;
}
function Y(e, o) {
  return e.dataStartByte + (o - 2) * e.bytesPerCluster;
}
function pe(e, o) {
  const t = [], r = /* @__PURE__ */ new Set();
  let n = o;
  for (; n >= 2 && !hr(e, n) && !me(n) && !r.has(n); )
    r.add(n), t.push(n), n = fe(e, n);
  return t;
}
function qe(e, o) {
  const t = [];
  for (let r = 2; r < e.totalClusters + 2 && t.length < o; r++)
    me(fe(e, r)) && t.push(r);
  if (t.length < o)
    throw new Error(
      `fatWriteFile: not enough free space (need ${o} cluster(s), found ${t.length})`
    );
  return t;
}
function Ze(e, o) {
  if (o < 2) return;
  const t = pe(e, o);
  for (const r of t)
    he(e, r, 0);
}
function X(e) {
  const o = e.toUpperCase(), t = o.lastIndexOf("."), r = t >= 0 ? o.slice(0, t) : o, n = t >= 0 ? o.slice(t + 1) : "";
  if (r.length === 0 || r.length > 8 || n.length > 3)
    throw new Error(`invalid 8.3 filename: ${e}`);
  const s = new Uint8Array(8).fill(32), a = new Uint8Array(3).fill(32);
  for (let d = 0; d < r.length; d++) s[d] = r.charCodeAt(d) & 255;
  for (let d = 0; d < n.length; d++) a[d] = n.charCodeAt(d) & 255;
  const i = n.length > 0 ? `${r}.${n}` : r;
  return { rawName: s, rawExt: a, display: i };
}
function Qe(e, o) {
  let t = "";
  for (let n = 0; n < 8 && e[n] !== 32; n++)
    t += String.fromCharCode(e[n]);
  let r = "";
  for (let n = 0; n < 3 && o[n] !== 32; n++)
    r += String.fromCharCode(o[n]);
  return r.length > 0 ? `${t}.${r}` : t;
}
function q(e) {
  return e.split(/[\\/]/).map((o) => o.trim()).filter((o) => o.length > 0);
}
function ge(e, o) {
  const t = [];
  if (o === null) {
    for (let s = 0; s < e.rootEntries; s++)
      t.push({ offset: e.rootStartByte + s * N });
    return t;
  }
  const r = pe(e, o), n = Math.floor(e.bytesPerCluster / N);
  for (const s of r) {
    const a = Y(e, s);
    for (let i = 0; i < n; i++)
      t.push({ offset: a + i * N });
  }
  return t;
}
function mr(e, o, t) {
  const r = P(e, o), n = P(e, t), s = 1980 + (r >> 9 & 127), a = r >> 5 & 15, i = r & 31, d = n >> 11 & 31, l = n >> 5 & 63, c = (n & 31) * 2;
  return a === 0 || i === 0 ? 0 : new Date(s, a - 1, i, d, l, c).getTime();
}
function Je(e, o, t, r) {
  const n = (r.getFullYear() - 1980 & 127) << 9 | r.getMonth() + 1 << 5 | r.getDate(), s = r.getHours() << 11 | r.getMinutes() << 5 | Math.floor(r.getSeconds() / 2);
  w(e, o, n), w(e, t, s);
}
function pr(e, o, t) {
  const r = e.image, n = o.offset, s = r[n];
  if (s === I || s === _) return null;
  const a = r[n + 11];
  if (a === Ye || a & Ge) return null;
  const i = r.subarray(n, n + 8), d = r.subarray(n + 8, n + 11), l = Qe(i, d);
  if (l === "." || l === "..") return null;
  const c = P(r, n + 26), u = v(r, n + 28), f = mr(r, n + 24, n + 22);
  return { slotIndex: t, offset: n, attr: a, name: l, cluster: c, size: u, mtime: f };
}
function Z(e, o) {
  const t = ge(e, o), r = [];
  for (let n = 0; n < t.length && e.image[t[n].offset] !== I; n++) {
    const s = pr(e, t[n], n);
    s && r.push(s);
  }
  return r;
}
function et(e, o) {
  let t = null;
  for (let r = 0; r < o.length; r++) {
    const n = X(o[r]).display, a = Z(e, t).find((i) => i.name === n);
    if (!a) throw new Error(`directory not found: ${o.slice(0, r + 1).join("/")}`);
    if (!(a.attr & x))
      throw new Error(`not a directory: ${o.slice(0, r + 1).join("/")}`);
    t = a.cluster;
  }
  return t;
}
function be(e, o) {
  return et(e, o.slice(0, -1));
}
const Te = "T98HDDIMAGE.R0", ve = "VHD", $e = 220;
function Ce(e, o, t) {
  let r = "";
  for (let n = 0; n < t; n++) r += String.fromCharCode(e[o + n]);
  return r;
}
function gr(e, o) {
  if (o.endsWith(".thd"))
    return { headerSize: 256, surfaces: 8, sectorsPerTrack: 33, bytesPerSector: 256 };
  if (o.endsWith(".nhd")) {
    if (e.length < 288 || Ce(e, 0, Te.length) !== Te)
      throw new $("hddInvalidHeader", "NHDヘッダが不正です", { format: "NHD" });
    return {
      headerSize: v(e, 272),
      surfaces: P(e, 280),
      sectorsPerTrack: P(e, 282),
      bytesPerSector: P(e, 284)
    };
  }
  if (o.endsWith(".hdi")) {
    if (e.length < 32)
      throw new $("hddInvalidHeader", "HDIヘッダが不正です", { format: "HDI" });
    return {
      headerSize: v(e, 8),
      surfaces: v(e, 24),
      sectorsPerTrack: v(e, 20),
      bytesPerSector: v(e, 16)
    };
  }
  if (o.endsWith(".hdd")) {
    if (e.length < $e || Ce(e, 0, ve.length) !== ve)
      throw new $("hddInvalidHeader", "Virtual98(.hdd)ヘッダが不正です", {
        format: "Virtual98(.hdd)"
      });
    return {
      headerSize: $e,
      surfaces: e[145],
      sectorsPerTrack: e[144],
      bytesPerSector: P(e, 142)
    };
  }
  return null;
}
const Be = 32, br = 16;
function yr(e, o) {
  const t = o.headerSize + o.bytesPerSector, r = [];
  for (let n = 0; n < br; n++) {
    const s = t + n * Be;
    if (s + Be > e.length) break;
    if (e[s + 1] === 0) continue;
    const a = e[s + 8], i = e[s + 9], l = (P(e, s + 10) * o.surfaces + i) * o.sectorsPerTrack + a, c = o.headerSize + l * o.bytesPerSector;
    c > 0 && c < e.length && r.push(c);
  }
  return r;
}
function wr(e, o) {
  for (const t of yr(e, o))
    try {
      return V(e, t);
    } catch {
    }
  try {
    return V(e, o.headerSize);
  } catch {
    throw new $("hddNoFatPartition", "HDDイメージ内にFAT16/12パーティションが見つかりません");
  }
}
const Dr = 4096;
function xe(e, o) {
  const t = o.toLowerCase();
  if (t.endsWith(".d88"))
    throw new $("d88NotEditable", "D88形式は編集非対応です");
  const r = gr(e, t);
  if (r)
    return wr(e, r);
  if (t.endsWith(".fdi")) {
    let n = Dr;
    if (e.length >= 16) {
      const s = v(e, 8), a = v(e, 12);
      s >= 16 && s < e.length && a > 0 && s + a <= e.length && (n = s);
    }
    return V(e, n);
  }
  return V(e, 0);
}
const tt = 1024, rt = 8, Sr = 77, ot = 2, Pr = tt * rt * Sr * ot;
function kr() {
  const e = tt, o = 1, t = 1, r = 2, n = 192, s = 1232, a = 254, i = 2, d = new Uint8Array(Pr);
  d[0] = 235, d[1] = 254, d[2] = 144, w(d, 11, e), d[13] = o, w(d, 14, t), d[16] = r, w(d, 17, n), w(d, 19, s), d[21] = a, w(d, 22, i), w(d, 24, rt), w(d, 26, ot), ue(d, 32, 0), d[510] = 85, d[511] = 170;
  const l = t * e;
  for (let c = 0; c < r; c++) {
    const u = l + c * i * e;
    d[u] = a, d[u + 1] = 255, d[u + 2] = 255;
  }
  return d;
}
function Ae(e, o) {
  const t = q(o), r = et(e, t);
  return Z(e, r).map((s) => ({
    name: s.name,
    size: s.size,
    isDir: (s.attr & x) !== 0,
    cluster: s.cluster,
    mtime: s.mtime
  }));
}
function nt(e, o) {
  const t = q(o);
  if (t.length === 0) throw new Error("empty file path");
  const r = be(e, t), n = X(t[t.length - 1]).display, a = Z(e, r).find((i) => i.name === n);
  if (!a) throw new Error(`file not found: ${o}`);
  return { dirCluster: r, entry: a };
}
function Me(e, o) {
  const { entry: t } = nt(e, o);
  if (t.attr & x) throw new Error(`is a directory: ${o}`);
  if (t.size === 0 || t.cluster === 0) return new Uint8Array(0);
  const r = pe(e, t.cluster), n = new Uint8Array(t.size);
  let s = 0;
  for (const a of r) {
    if (s >= t.size) break;
    const i = Y(e, a), d = Math.min(e.bytesPerCluster, t.size - s);
    n.set(e.image.subarray(i, i + d), s), s += d;
  }
  if (s < t.size)
    throw new Error(`fatReadFile: cluster chain shorter than file size for ${o}`);
  return n;
}
function Le(e, o, t) {
  const r = q(o);
  if (r.length === 0) throw new Error("empty file path");
  const n = be(e, r), { display: s, rawName: a, rawExt: i } = X(r[r.length - 1]), d = ge(e, n);
  let l = -1, c = 0;
  for (let m = 0; m < d.length; m++) {
    const g = e.image[d[m].offset];
    if (g === I) break;
    if (g === _) continue;
    const k = e.image[d[m].offset + 11];
    if (k === Ye || k & Ge) continue;
    if (Qe(
      e.image.subarray(d[m].offset, d[m].offset + 8),
      e.image.subarray(d[m].offset + 8, d[m].offset + 11)
    ) === s) {
      l = m, c = P(e.image, d[m].offset + 26);
      break;
    }
  }
  if (l < 0) {
    for (let m = 0; m < d.length; m++) {
      const g = e.image[d[m].offset];
      if (g === I || g === _) {
        l = m;
        break;
      }
    }
    if (l < 0)
      throw new Error(`fatWriteFile: directory is full, cannot create ${o}`);
  }
  c >= 2 && Ze(e, c);
  const u = t.length === 0 ? 0 : Math.ceil(t.length / e.bytesPerCluster), f = u > 0 ? qe(e, u) : [];
  let p = 0;
  for (let m = 0; m < f.length; m++) {
    const g = f[m], k = m === f.length - 1;
    he(e, g, k ? Xe[e.fatType] : f[m + 1]);
    const D = Y(e, g), T = Math.min(e.bytesPerCluster, t.length - p);
    e.image.set(t.subarray(p, p + T), D), T < e.bytesPerCluster && e.image.fill(0, D + T, D + e.bytesPerCluster), p += T;
  }
  const h = d[l].offset;
  e.image.set(a, h), e.image.set(i, h + 8), e.image[h + 11] = 32, e.image[h + 12] = 0, w(e.image, h + 14, 0), w(e.image, h + 16, 0), w(e.image, h + 18, 0), w(e.image, h + 20, 0), Je(e.image, h + 24, h + 22, /* @__PURE__ */ new Date()), w(e.image, h + 26, f.length > 0 ? f[0] : 0), ue(e.image, h + 28, t.length);
}
function se(e, o, t, r, n, s, a, i) {
  e.image.set(t, o), e.image.set(r, o + 8), e.image[o + 11] = n, e.image[o + 12] = 0, w(e.image, o + 14, 0), w(e.image, o + 16, 0), w(e.image, o + 18, 0), w(e.image, o + 20, 0), Je(e.image, o + 24, o + 22, i), w(e.image, o + 26, s), ue(e.image, o + 28, a);
}
function Ne(e) {
  const o = new Uint8Array(8).fill(32);
  for (let r = 0; r < e; r++) o[r] = 46;
  const t = new Uint8Array(3).fill(32);
  return { rawName: o, rawExt: t };
}
function _e(e, o) {
  const t = q(o);
  if (t.length === 0) throw new Error("empty directory path");
  const r = be(e, t), { display: n, rawName: s, rawExt: a } = X(t[t.length - 1]);
  if (Z(e, r).some((m) => m.name === n))
    throw new Error(`fatMakeDir: already exists: ${o}`);
  const [d] = qe(e, 1);
  he(e, d, Xe[e.fatType]);
  const l = Y(e, d);
  e.image.fill(0, l, l + e.bytesPerCluster);
  const c = /* @__PURE__ */ new Date(), u = Ne(1), f = Ne(2);
  se(e, l, u.rawName, u.rawExt, x, d, 0, c), se(
    e,
    l + N,
    f.rawName,
    f.rawExt,
    x,
    r ?? 0,
    0,
    c
  );
  const p = ge(e, r);
  let h = -1;
  for (let m = 0; m < p.length; m++) {
    const g = e.image[p[m].offset];
    if (g === I || g === _) {
      h = m;
      break;
    }
  }
  if (h < 0)
    throw new Error(`fatMakeDir: directory is full, cannot create ${o}`);
  se(e, p[h].offset, s, a, x, d, 0, c);
}
function Ie(e, o) {
  const { entry: t } = nt(e, o);
  if (t.attr & x) throw new Error(`is a directory: ${o}`);
  t.cluster >= 2 && Ze(e, t.cluster), e.image[t.offset] = _;
}
function He(e) {
  let o = 0;
  for (let t = 2; t < e.totalClusters + 2; t++)
    me(fe(e, t)) && o++;
  return {
    total: e.totalClusters * e.bytesPerCluster,
    free: o * e.bytesPerCluster
  };
}
const C = "/state0.sav";
function Er(e) {
  const o = [], t = [], r = Array.from(e);
  for (let n = 0; n < r.length; n++) {
    const s = r[n];
    if (s === "\r") {
      if (r[n + 1] === `
`) continue;
      o.push(13, 10);
      continue;
    }
    if (s === `
`) {
      o.push(13, 10);
      continue;
    }
    const { units: a, skipped: i } = de(s);
    a.length > 0 && o.push(...a[0]), t.push(...i);
  }
  return { bytes: new Uint8Array(o), skipped: t };
}
function Ue(e) {
  let o = "";
  for (let r = 0; r < e.length; r += 8192)
    o += String.fromCharCode(...e.subarray(r, r + 8192));
  return btoa(o);
}
function Rr(e) {
  const o = atob(e), t = new Uint8Array(o.length);
  for (let r = 0; r < o.length; r++) t[r] = o.charCodeAt(r);
  return t;
}
function Oe(e) {
  const o = e.split(/[\\/]/).filter((r) => r.length > 0), t = o[o.length - 1];
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
function Fr(e, o) {
  return e.split(`
`).slice(-8).join(`
`);
}
const Tr = ["個のファイルをコピーしました", "file(s) copied", "file copied"], vr = [
  "ファイルが見つかりません",
  "指定されたパスが見つかりません",
  "File not found",
  "Path not found",
  "書き込み保護",
  "このドライブには",
  "ディスクの空き容量が",
  "Insufficient disk space",
  "無効なパスです"
], $r = ["を上書きしますか", "Overwrite", "overwrite"], Cr = { 1: "B:", 2: "C:" };
class Br {
  constructor() {
    R(this, "listeners", /* @__PURE__ */ new Map());
  }
  on(o, t) {
    let r = this.listeners.get(o);
    return r || (r = /* @__PURE__ */ new Set(), this.listeners.set(o, r)), r.add(t), () => r == null ? void 0 : r.delete(t);
  }
  emit(o, t) {
    const r = this.listeners.get(o);
    if (r)
      for (const n of r)
        n(t);
  }
}
const xr = 5e3, Ar = 3e4, Ke = 4096, Mr = 300;
function Lr(e) {
  const { isReady: o, raf: t, timeoutMs: r = 1e4, maxIdleFrames: n = Mr } = e, s = e.setTimeoutFn ?? ((i, d) => setTimeout(i, d)), a = e.clearTimeoutFn ?? ((i) => clearTimeout(i));
  return o() ? Promise.resolve(!0) : new Promise((i) => {
    let d = !1;
    const l = () => {
      d || (d = !0, a(c), i(o()));
    }, c = s(l, r);
    let u = 0;
    const f = () => {
      if (!d) {
        if (o()) {
          l();
          return;
        }
        if (u += 1, u >= n) {
          l();
          return;
        }
        t(f);
      }
    };
    t(f);
  });
}
class Nr extends Br {
  constructor(t) {
    super();
    R(this, "canvas");
    R(this, "fs", null);
    /** boot()時のhostdrv.root(既定'/hostdrv')。hostdrv未設定でbootした場合はnullのまま。 */
    R(this, "hostdrvRoot", null);
    R(this, "mounted", /* @__PURE__ */ new Map());
    R(this, "persistTimer", null);
    R(this, "boundOnVisibilityChange", () => this.onVisibilityChange());
    R(this, "boundOnPageHide", () => void this.persistNow({ force: !0 }));
    /** ホスト側が推定するバスマウスのカーソル位置(0-639, 0-399)。null=未ホーミング(未確定)。 */
    R(this, "mousePos", null);
    /** persistNow の再入ガード。タイマーと visibilitychange が重なると二重保存になるため。 */
    R(this, "persisting", !1);
    this.canvas = t;
  }
  isBooted() {
    return this.fs !== null;
  }
  /** CPU実行の一時停止を切り替える。描画・イベント処理は継続する。 */
  dbgSetPaused(t) {
    if (!this.isBooted()) throw new Error("not booted");
    Lt(t);
  }
  /** CPUがデバッガによって一時停止中かを返す。 */
  dbgIsPaused() {
    if (!this.isBooted()) throw new Error("not booted");
    return Nt() !== 0;
  }
  /** 一時停止中に指定命令数だけ実行し、実際の実行数を返す。 */
  dbgStep(t) {
    if (!this.isBooted()) throw new Error("not booted");
    return _t(Math.trunc(t));
  }
  /** CPUレジスタを名前付きオブジェクトとして取得する。 */
  dbgReadRegs() {
    if (!this.isBooted()) throw new Error("not booted");
    const t = It();
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
  dbgDisasm(t, r, n) {
    if (!this.isBooted()) throw new Error("not booted");
    const s = Ht(t, r, Math.trunc(n));
    let a = r >>> 0;
    return s.split(`
`).filter((i) => i.length > 0).map((i) => {
      const [d, l, ...c] = i.split("	"), u = Number.parseInt(d, 10);
      if (!Number.isInteger(u) || u <= 0 || l.length !== u * 2)
        throw new Error(`invalid debugger disassembly line: ${i}`);
      const f = [];
      for (let h = 0; h < l.length; h += 2) {
        const m = Number.parseInt(l.slice(h, h + 2), 16);
        if (!Number.isInteger(m))
          throw new Error(`invalid debugger disassembly bytes: ${l}`);
        f.push(m);
      }
      const p = { addr: a, len: u, bytes: f, text: c.join("	") };
      return a = a + u >>> 0, p;
    });
  }
  /** index 0..7のソフトウェアブレークポイントを設定する。 */
  dbgSetBreakpoint(t, r, n, s) {
    if (!this.isBooted()) throw new Error("not booted");
    Ut(Math.trunc(t), r, n, s);
  }
  /** 最大命令数まで実行し、ヒットしたブレークポイントindex（無ヒットは-1）を返す。 */
  dbgRunUntilBreakpoint(t) {
    if (!this.isBooted()) throw new Error("not booted");
    return Ot(Math.trunc(t));
  }
  getMountedImages() {
    return Array.from(this.mounted.values()).map(({ slot: t, name: r, sourceKey: n, url: s }) => ({
      slot: t,
      name: r,
      sourceKey: n,
      url: s
    }));
  }
  /** 現在マウント中のディスク一覧を返す(getMountedImagesの整形版)。 */
  listDisks() {
    return this.getMountedImages().map(({ slot: t, name: r, sourceKey: n }) => ({ slot: t, name: r, sourceKey: n }));
  }
  /**
   * IndexedDBに保存済みのディスクイメージ一覧を返す(rom:/state: プレフィックスは除外)。
   * 拡張子からhdd/fdを判定する。savedAt降順。
   */
  async listDiskLibrary() {
    const t = await Vt(), r = [];
    for (const n of t) {
      if (n.sourceKey.startsWith("rom:") || n.sourceKey.startsWith("state:")) continue;
      const s = ae(n.name);
      s && r.push({
        sourceKey: n.sourceKey,
        name: n.name,
        size: n.bytes.byteLength,
        savedAt: n.savedAt,
        kind: s
      });
    }
    return r.sort((n, s) => s.savedAt - n.savedAt), r;
  }
  /** URLからディスクイメージをfetchしてFDドライブへ挿入する。ファイル名はURLのbasename。 */
  async insertFdFromUrl(t, r) {
    const n = await lr(r), s = Hr(r);
    return await this.insertFd(t, { name: s, bytes: n }, r, r), { name: s };
  }
  /** IndexedDBのディスクライブラリからsourceKeyで指定したイメージをFDドライブへ挿入する。 */
  async insertFdFromLibraryKey(t, r) {
    const n = await B(r);
    if (!n) throw new Error(`no library entry found for sourceKey: ${r}`);
    const s = n.name;
    return await this.insertFd(t, { name: s, bytes: new Uint8Array(n.bytes) }, r, n.url), { name: s };
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
    const n = U(this.fs, r.name), s = 5 * 1024 * 1024;
    if (n.length > s)
      throw new Error(
        `image too large to export as base64 (${n.length} bytes > 5MB). 大きすぎるためUIのダウンロードボタンを使うこと`
      );
    let a = "";
    const i = 8192;
    for (let l = 0; l < n.length; l += i) {
      const c = n.subarray(l, l + i);
      a += String.fromCharCode(...c);
    }
    const d = btoa(a);
    return { name: r.name, base64: d, size: n.length };
  }
  /**
   * コアを起動する。config には hdd/fd1/fd2 の由来情報 (sourceKey/url) を渡す。
   */
  async boot(t) {
    var s;
    const r = [];
    t.fd1 && r.push({ slot: "fd1", ...t.fd1 }), t.fd2 && r.push({ slot: "fd2", ...t.fd2 });
    const n = {
      hdd: (s = t.hdd) == null ? void 0 : s.file,
      fds: r.map((a) => a.file),
      latencyMs: t.latencyMs,
      extMemMB: t.extMemMB,
      clkMult: t.clkMult,
      roms: t.roms,
      hostdrv: t.hostdrv
    };
    try {
      const a = await Et(n, this.canvas);
      this.fs = a, this.hostdrvRoot = t.hostdrv ? t.hostdrv.root ?? le : null, this.mounted.clear(), t.hdd && this.mounted.set("hdd", {
        slot: "hdd",
        name: t.hdd.file.name,
        sourceKey: t.hdd.sourceKey,
        url: t.hdd.url,
        lastSavedStat: t.hdd.alreadyPersisted ? O(a, t.hdd.file.name) ?? void 0 : void 0
      });
      for (const i of r)
        this.mounted.set(i.slot, {
          slot: i.slot,
          name: i.file.name,
          sourceKey: i.sourceKey,
          url: i.url,
          lastSavedStat: i.alreadyPersisted ? O(a, i.file.name) ?? void 0 : void 0
        });
      this.startPersistLoop(), await this.restoreStateIfPresent(), this.emit("booted", { fs: a });
    } catch (a) {
      const i = a instanceof Error ? a : new Error(String(a));
      throw this.emit("bootError", { error: i }), i;
    }
  }
  /** hostdrv未設定(boot時にhostdrvを渡していない)ならErrorを投げてFS/rootを返す。 */
  requireHostDrv() {
    return kt(this.fs, this.hostdrvRoot);
  }
  /** hostdrvルート直下へファイルを書き込む(IDEがビルド成果物をゲストへ渡す用途)。 */
  writeHostFile(t, r) {
    const { fs: n, root: s } = this.requireHostDrv();
    wt(n, s, t, r);
  }
  /** hostdrvルート直下のファイルを読む。無ければnull。 */
  readHostFile(t) {
    const { fs: r, root: n } = this.requireHostDrv();
    return Dt(r, n, t);
  }
  /** hostdrvルート直下のファイル名一覧を返す。 */
  listHostFiles() {
    const { fs: t, root: r } = this.requireHostDrv();
    return St(t, r);
  }
  /** hostdrvルート直下のファイルを削除する。存在しなければfalse。 */
  deleteHostFile(t) {
    const { fs: r, root: n } = this.requireHostDrv();
    return Pt(r, n, t);
  }
  startPersistLoop() {
    this.stopPersistLoop(), this.persistTimer = setInterval(() => {
      this.persistNow();
    }, xr), document.addEventListener("visibilitychange", this.boundOnVisibilityChange), window.addEventListener("pagehide", this.boundOnPageHide);
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
    let n = 0;
    for (const a of this.mounted.values())
      try {
        if (!t && ae(a.name) === "hdd" && a.lastSavedAt !== void 0 && Date.now() - a.lastSavedAt < Ar)
          continue;
        const i = O(this.fs, a.name);
        if (i && a.lastSavedStat && i.mtimeMs === a.lastSavedStat.mtimeMs && i.size === a.lastSavedStat.size)
          continue;
        const d = U(this.fs, a.name);
        if (!i && !this.hasChanged(a, d)) continue;
        await jt({
          sourceKey: a.sourceKey,
          url: a.url,
          name: a.name,
          bytes: d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength),
          savedAt: Date.now()
        }), n += d.byteLength, a.lastSavedSnapshot = this.snapshotOf(d), a.lastSavedStat = i ?? void 0, a.lastSavedAt = Date.now(), this.emit("persisted", { slot: a.slot, name: a.name });
      } catch (i) {
        this.emit("log", {
          level: "error",
          message: `persist failed for ${a.name}: ${String(i)}`
        });
      }
    const s = performance.now() - r;
    s > 50 && this.emit("log", {
      level: "info",
      message: `persist took ${s.toFixed(0)}ms (${(n / 1048576).toFixed(1)}MB written)`
    });
  }
  snapshotOf(t) {
    const r = t.slice(0, Math.min(Ke, t.length)), n = t.slice(Math.max(0, t.length - Ke));
    return { length: t.length, head: r, tail: n };
  }
  hasChanged(t, r) {
    const n = t.lastSavedSnapshot;
    if (!n || n.length !== r.length) return !0;
    const s = this.snapshotOf(r);
    return !We(n.head, s.head) || !We(n.tail, s.tail);
  }
  /** 現在のイメージをダウンロードさせる。 */
  async exportDisk(t) {
    if (!this.fs) throw new Error("not booted");
    const r = this.mounted.get(t);
    if (!r) throw new Error(`no image mounted in ${t}`);
    const n = U(this.fs, r.name), s = new Blob([n.slice()], { type: "application/octet-stream" }), a = URL.createObjectURL(s);
    try {
      const i = document.createElement("a");
      i.href = a, i.download = r.name, document.body.appendChild(i), i.click(), i.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(a), 1e4);
    }
  }
  /** IndexedDB の保存を削除し、ページをリロードして配布元から再フェッチさせる。 */
  async resetToOriginal(t) {
    const r = this.mounted.get(t);
    if (!r) throw new Error(`no image mounted in ${t}`);
    await Gt(r.sourceKey), location.reload();
  }
  /** canvas をフルスクリーン表示する。 */
  async fullscreen() {
    this.canvas.requestFullscreen && await this.canvas.requestFullscreen();
  }
  /** マシンをリセットする (pccore_cfgupdate + pccore_reset)。 */
  resetMachine() {
    if (!this.fs) throw new Error("not booted");
    Rt();
  }
  /**
   * 実行中の FD ドライブへイメージを挿入する。既存スロットがマウント中なら先に永続化してから差し替える。
   * IndexedDB に同 sourceKey の保存があればそちらを優先ロードする（前回の続き優先）。
   */
  async insertFd(t, r, n, s) {
    if (!this.fs) throw new Error("not booted");
    const a = t === 1 ? "fd1" : "fd2";
    this.mounted.has(a) && await this.persistNow({ force: !0 });
    let i = r.bytes, d = r.name;
    const l = await B(n);
    if (l && (i = new Uint8Array(l.bytes), d = l.name), this.fs.writeFile(`/disk/${d}`, i), K(t - 1, `/disk/${d}`), !await this.waitForFddReady(t))
      throw new Error(
        `FDドライブ${t}の準備がタイムアウトしました(挿入遅延の間、webnp2_fdd_readyが0のままでした。CPUが極端に遅い/タブが背面化している可能性があります)`
      );
    this.mounted.set(a, {
      slot: a,
      name: d,
      sourceKey: n,
      url: s,
      lastSavedSnapshot: void 0,
      lastSavedStat: l ? O(this.fs, d) ?? void 0 : void 0
    }), this.emit("fdChanged", { drive: t, name: d });
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
    return Lr({
      isReady: () => Ft(t - 1) !== 0,
      raf: (n) => {
        requestAnimationFrame(n);
      },
      timeoutMs: r
    });
  }
  /** 実行中の FD ドライブからイメージを排出する。 */
  async ejectFd(t) {
    if (!this.fs) throw new Error("not booted");
    const r = t === 1 ? "fd1" : "fd2";
    this.mounted.has(r) && await this.persistNow({ force: !0 }), K(t - 1, ""), this.mounted.delete(r), this.emit("fdChanged", { drive: t, name: void 0 });
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
    const r = this.getSlotImageName(t), n = U(this.fs, r), s = xe(n, r);
    return { name: r, image: n, vol: s };
  }
  /**
   * FAT操作で書き換えたイメージをMEMFSへ書き戻し、DOSのディスクキャッシュを捨てさせるために
   * 排出→再挿入(メディア交換)を行ってからIndexedDBへ永続化する。
   * ゲストがそのドライブへアクセス中に呼ぶとゲスト側のI/Oと競合し得るため、
   * MCPツールの説明では「ゲストが書き込み中でないタイミングで実行すること」と案内している。
   */
  async writeBackSlotImage(t, r, n) {
    if (!this.fs) throw new Error("not booted");
    const s = t === "fd1" ? 1 : 2;
    if (this.fs.writeFile(`/disk/${r}`, n), K(s - 1, `/disk/${r}`), !await this.waitForFddReady(s))
      throw new Error(`FDドライブ${s}の準備がタイムアウトしました(書き戻しの再挿入後)`);
    await this.persistNow({ force: !0 });
  }
  /** FD内のFAT12/16ディスクイメージのファイル一覧と空き容量を返す。path省略時はルート。 */
  async diskListFiles(t, r = "") {
    const { vol: n } = this.openSlotFat(t), s = Ae(n, r), { free: a, total: i } = He(n);
    return { entries: s, free: a, total: i };
  }
  /** FD内のFAT12/16ディスクイメージからファイルを読み出す。 */
  async diskReadFile(t, r) {
    const { vol: n } = this.openSlotFat(t);
    return Me(n, r);
  }
  /** FD内のFAT12/16ディスクイメージへファイルを書き込む(新規作成/上書き)。 */
  async diskWriteFile(t, r, n) {
    const { name: s, image: a, vol: i } = this.openSlotFat(t);
    Le(i, r, n), await this.writeBackSlotImage(t, s, a);
  }
  /** FD内のFAT12/16ディスクイメージからファイルを削除する。 */
  async diskDeleteFile(t, r) {
    const { name: n, image: s, vol: a } = this.openSlotFat(t);
    Ie(a, r), await this.writeBackSlotImage(t, n, s);
  }
  /** FD内のFAT12/16ディスクイメージにディレクトリを作成する(ファイルマネージャUI向け)。 */
  async diskMakeDir(t, r) {
    const { name: n, image: s, vol: a } = this.openSlotFat(t);
    _e(a, r), await this.writeBackSlotImage(t, n, s);
  }
  /** sourceKey が現在いずれかのスロットにマウント中かどうかを返す。 */
  isSourceKeyMounted(t) {
    for (const r of this.mounted.values())
      if (r.sourceKey === t) return !0;
    return !1;
  }
  /** IndexedDB上のライブラリイメージを読み出し FAT ボリュームとして開く。 */
  async openLibraryFat(t) {
    const r = await B(t);
    if (!r) throw new Error(`no library entry found for sourceKey: ${t}`);
    const n = new Uint8Array(r.bytes), s = xe(n, r.name);
    return { stored: r, image: n, vol: s };
  }
  /** 変更系ライブラリ操作の前提チェック(マウント中/起動後HDD)。問題があればErrorを投げる。 */
  assertLibraryWritable(t, r) {
    if (this.isSourceKeyMounted(t))
      throw new $("mountedUseSlotApi", "マウント中のイメージはスロット側APIを使ってください");
    if (ae(r) === "hdd" && this.isBooted())
      throw new $("hddEditBeforeBootOnly", "HDDイメージの編集は起動前のみ可能です");
  }
  /** ライブラリ(未マウント)イメージ内のファイル一覧と空き容量を返す。マウント中でも読み取りは許可する。 */
  async libraryListFiles(t, r = "") {
    const { vol: n } = await this.openLibraryFat(t), s = Ae(n, r), { free: a, total: i } = He(n);
    return { entries: s, free: a, total: i };
  }
  /** ライブラリ(未マウント)イメージ内のファイルを読み出す。マウント中でも読み取りは許可する。 */
  async libraryReadFile(t, r) {
    const { vol: n } = await this.openLibraryFat(t);
    return Me(n, r);
  }
  /** ライブラリ(未マウント)イメージへファイルを書き込み、IndexedDBへ書き戻す。 */
  async libraryWriteFile(t, r, n) {
    const { stored: s, image: a, vol: i } = await this.openLibraryFat(t);
    this.assertLibraryWritable(t, s.name), Le(i, r, n), await this.putLibraryImage(s, a);
  }
  /** ライブラリ(未マウント)イメージからファイルを削除し、IndexedDBへ書き戻す。 */
  async libraryDeleteFile(t, r) {
    const { stored: n, image: s, vol: a } = await this.openLibraryFat(t);
    this.assertLibraryWritable(t, n.name), Ie(a, r), await this.putLibraryImage(n, s);
  }
  /** ライブラリ(未マウント)イメージ内にディレクトリを作成し、IndexedDBへ書き戻す。 */
  async libraryMakeDir(t, r) {
    const { stored: n, image: s, vol: a } = await this.openLibraryFat(t);
    this.assertLibraryWritable(t, n.name), _e(a, r), await this.putLibraryImage(n, s);
  }
  /** 変更後のライブラリイメージ全体をIndexedDBへ書き戻す。 */
  async putLibraryImage(t, r) {
    await L({
      ...t,
      bytes: r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength),
      savedAt: Date.now()
    });
  }
  /**
   * FD経由のゲスト転送に使うFDが指定ドライブに無ければ、同梱のツールFD(FAT12フォーマット済み)を
   * 挿入して用意する。転送用ツール(COPY等)を同梱している同梱ツールFDを使う。
   * 既にマウント中ならそのイメージ名をそのまま返す(挿入しない)。
   */
  async ensureTransferFd(t) {
    const r = t === 1 ? "fd1" : "fd2", n = this.mounted.get(r);
    if (n) return n.name;
    const { name: s } = await this.insertFdFromUrl(t, "./tools/webnp2tools.xdf");
    return s;
  }
  /** FDドライブ番号からゲスト側ドライブレターを推定する(HDD起動時の既定: FD1='B:', FD2='C:')。 */
  guestDriveLetter(t) {
    return Cr[t];
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
    const r = t.drive ?? 1, n = r === 1 ? "fd1" : "fd2", s = Oe(t.path);
    await this.ensureTransferFd(r);
    let a;
    if (t.bytes !== void 0)
      a = t.bytes;
    else if (t.content !== void 0)
      a = Er(t.content).bytes;
    else
      throw new Error("putFileToGuest: specify content or bytes");
    await this.diskWriteFile(n, s, a);
    const i = this.guestDriveLetter(r), d = await this.runGuestCopy(`COPY ${i}\\${s} ${t.path}`, t.timeoutMs);
    return d.ok ? { ok: !0, message: "ゲストへのコピーに成功しました", screen: d.screen } : { ok: !1, message: d.message, screen: d.screen };
  }
  /**
   * ゲストで COPY を実行し、完了(または失敗)を画面から判定する。
   * 上書き確認が出たら自動で Yes と答える。答えないとゲストが入力待ちのまま
   * 止まり、以降の操作がすべて詰まってしまうため。
   */
  async runGuestCopy(t, r) {
    const n = this.countPatterns(this.getScreenText().text);
    await this.typeText(`${t}
`);
    const s = Date.now() + Math.min(Math.max(r ?? 8e3, 1e3), 6e4);
    let a = !1;
    for (; ; ) {
      await this.sleep(400);
      const i = this.getScreenText().text, d = Fr(i), l = this.countPatterns(i);
      if (l.error > n.error)
        return { ok: !1, message: "コピーに失敗しました(ゲスト側エラー)", screen: d };
      if (l.success > n.success)
        return { ok: !0, message: "コピーに成功しました", screen: d };
      if (!a && l.overwrite > n.overwrite) {
        a = !0, await this.typeText(`y
`);
        continue;
      }
      if (Date.now() >= s)
        return { ok: !1, message: "コピー結果を確認できませんでした", screen: d };
    }
  }
  /** 画面テキスト中の判定用パターンの出現回数を数える。 */
  countPatterns(t) {
    const r = (n) => n.reduce((s, a) => s + t.split(a).length - 1, 0);
    return {
      success: r(Tr),
      error: r(vr),
      overwrite: r($r)
    };
  }
  /**
   * ゲストの任意ドライブ上のファイルを、転送用FD経由でホストへ取り出す。
   * 手順: (1) 転送用FDを用意 (2) ゲストでCOPY実行 (3) 結果文字列判定
   * (4) ゲストの書き込みがMEMFS上のイメージへ反映されるのを少し待ってからホストがFATを読む。
   */
  async getFileFromGuest(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const r = t.drive ?? 1, n = r === 1 ? "fd1" : "fd2", s = Oe(t.path);
    await this.ensureTransferFd(r);
    try {
      await this.diskDeleteFile(n, s);
    } catch {
    }
    const a = this.guestDriveLetter(r), i = await this.runGuestCopy(`COPY ${t.path} ${a}\\`, t.timeoutMs), d = i.screen;
    if (!i.ok)
      return { ok: !1, message: i.message, screen: d };
    await this.sleep(500);
    try {
      const l = await this.diskReadFile(n, s);
      if ((t.encoding ?? "text") === "base64")
        return {
          ok: !0,
          message: "ゲストからの取得に成功しました",
          screen: d,
          base64: Ue(l),
          size: l.length
        };
      const c = new TextDecoder("shift_jis").decode(l);
      return { ok: !0, message: "ゲストからの取得に成功しました", screen: d, text: c, size: l.length };
    } catch (l) {
      return { ok: !1, message: `FD上のファイル読み取りに失敗しました: ${String(l)}`, screen: d };
    }
  }
  /** セーブ用の1.25MB(2HD)ベタイメージを生成する。FAT12フォーマット済みですぐ使える。 */
  createBlankFd() {
    const t = new Set(Array.from(this.mounted.values()).map((n) => n.name));
    let r = "blank.xdf";
    for (let n = 2; t.has(r); n++)
      r = `blank${n}.xdf`;
    return { name: r, bytes: kr() };
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
    const r = De(C);
    if (r < 0) {
      this.emit("log", { level: "error", message: `saveState failed (rc=${r})` });
      return;
    }
    r !== 0 && this.emit("log", { level: "info", message: `saveState finished with warnings (rc=${r})` });
    const n = this.fs.readFile(C, { encoding: "binary" });
    await L({
      sourceKey: `state:${t.sourceKey}`,
      name: "state0.sav",
      bytes: n.buffer.slice(n.byteOffset, n.byteOffset + n.byteLength),
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
    if (!this.fs.analyzePath(C).exists) {
      const n = await B(`state:${t.sourceKey}`);
      if (!n) {
        this.emit("log", { level: "error", message: "loadState: no saved state found" });
        return;
      }
      this.fs.writeFile(C, new Uint8Array(n.bytes));
    }
    const r = Se(C);
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
    const r = this.validateSlot(t), n = this.primaryEntry();
    if (!n) {
      this.emit("log", { level: "error", message: "saveStateSlot: no mounted image to key the state by" });
      return;
    }
    const s = `/state_${r}.sav`, a = De(s);
    if (a < 0) {
      this.emit("log", { level: "error", message: `saveStateSlot(${r}) failed (rc=${a})` });
      return;
    }
    a !== 0 && this.emit("log", { level: "info", message: `saveStateSlot(${r}) finished with warnings (rc=${a})` });
    const i = this.fs.readFile(s, { encoding: "binary" });
    await L({
      sourceKey: `state:${n.sourceKey}:${r}`,
      name: `state_${r}.sav`,
      bytes: i.buffer.slice(i.byteOffset, i.byteOffset + i.byteLength),
      savedAt: Date.now()
    }), this.emit("stateSaved", {});
  }
  /** 名前付きスロットからIndexedDBに保存済みのステートをMEMFSへ書き戻してロードする。 */
  async loadStateSlot(t) {
    if (!this.fs) throw new Error("not booted");
    const r = this.validateSlot(t), n = this.primaryEntry();
    if (!n) {
      this.emit("log", { level: "error", message: "loadStateSlot: no mounted image to key the state by" });
      return;
    }
    const s = `/state_${r}.sav`, a = await B(`state:${n.sourceKey}:${r}`);
    if (!a) {
      this.emit("log", { level: "error", message: `loadStateSlot: no saved state found for slot "${r}"` });
      return;
    }
    this.fs.writeFile(s, new Uint8Array(a.bytes));
    const i = Se(s);
    if (i < 0) {
      this.emit("log", { level: "error", message: `loadStateSlot(${r}) failed (rc=${i})` });
      return;
    }
    i !== 0 && this.emit("log", { level: "info", message: `loadStateSlot(${r}) finished with warnings (rc=${i})` }), this.emit("stateLoaded", {});
  }
  /** 保存済みのステートスロット一覧を、保存日時の新しい順で返す。 */
  async listStateSlots() {
    const t = this.primaryEntry();
    if (!t) return [];
    const r = `state:${t.sourceKey}:`;
    return (await zt(r)).map((s) => ({ slot: s.sourceKey.slice(r.length), savedAt: s.savedAt })).sort((s, a) => a.savedAt - s.savedAt);
  }
  /**
   * 画面テキストが変化し、その後 stableMs の間変化が止まるまで待つ。
   * ロード完了やコマンド終了検出など、待つべき文字列が未知な場合に固定sleepの代わりに使う。
   * stableMs は既定800ms(最大5000ms)、timeoutMs は既定15000ms(最大60000ms)にクランプ。
   * 一度も変化が無いままタイムアウトした場合は changed:false を返す。
   */
  async waitScreenChange(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const r = Math.min(Math.max((t == null ? void 0 : t.stableMs) ?? 800, 0), 5e3), n = Math.min(Math.max((t == null ? void 0 : t.timeoutMs) ?? 15e3, 0), 6e4), s = Date.now();
    let i = this.getScreenText().text, d = !1, l = Date.now();
    for (; ; ) {
      const c = Date.now();
      if (d) {
        if (c - l >= r)
          return { changed: !0, text: i };
        if (c - s >= n)
          return { changed: !0, text: i };
      } else if (c - s >= n)
        return { changed: !1, text: i };
      await this.sleep(200);
      const u = this.getScreenText().text;
      u !== i && (d = !0, l = Date.now()), i = u;
    }
  }
  /** テキストVRAMを読み出し、SJISデコード済みの画面テキストとカーソル位置を返す。 */
  getScreenText() {
    const t = xt(), r = new DataView(t.buffer, t.byteOffset, t.byteLength), n = t[0], s = t[1], a = r.getInt16(2, !0), i = [], d = new TextDecoder("shift_jis");
    let l = 0;
    for (let c = 0; c < s; c++) {
      const u = [];
      let f = !1;
      for (let h = 0; h < n; h++) {
        const m = 4 + l * 2, g = r.getUint16(m, !0);
        if (l++, g === 0) {
          if (f) {
            f = !1;
            continue;
          }
          u.push(46);
          continue;
        }
        const k = g >> 8;
        if (g <= 255) {
          g >= 32 && g <= 126 || g >= 161 && g <= 223 ? u.push(g) : u.push(46), f = !1;
          continue;
        }
        if (k >= 33) {
          const D = k, T = g & 255, st = (D + 1 >> 1) + (D < 95 ? 112 : 176), at = T + (D & 1 ? T < 96 ? 31 : 32 : 126);
          u.push(st & 255, at & 255), f = !0;
          continue;
        }
        u.push(46), f = !1;
      }
      const p = d.decode(new Uint8Array(u)).trimEnd();
      i.push(p);
    }
    return {
      text: i.join(`
`),
      lines: i,
      cursor: a >= 0 ? { row: Math.floor(a / n), col: a % n } : null
    };
  }
  /**
   * デバッグ/解析用。PC-98メインRAMの[addr, addr+len)をBase64文字列で取得する。
   * 範囲チェックはcoreReadMemory側(0<=addr, addr+len<=メインRAMサイズ)で行う。
   */
  readMemoryBase64(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = At(t, r);
    return { addr: t, len: r, base64: Ue(n) };
  }
  /** デバッグ用にPC-98メインRAMへ書き込む。CPU停止中の利用を前提とする。 */
  writeMemoryBase64(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = Rr(r);
    return Mt(t, n), { addr: t, len: n.byteLength };
  }
  /** PC-98スキャンコードを1回注入する。 */
  sendKey(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    E(t, r);
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
    const s = Math.max(Math.ceil(Math.abs(t) / 64), Math.ceil(Math.abs(r) / 64), t === 0 && r === 0 ? 0 : 1);
    for (let a = 0; a < s; a++) {
      const i = s - a, d = Math.trunc(t / i), l = Math.trunc(r / i);
      t -= d, r -= l, Tt(d, l);
      const c = Date.now();
      for (; vt() !== 0 && Date.now() - c < 300; )
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
    const n = Math.min(Math.max(Math.round(t), 0), 639), s = Math.min(Math.max(Math.round(r), 0), 399);
    this.mousePos || await this.mouseHome();
    const a = this.mousePos;
    return await this.mouseStep(n - a.x, s - a.y), this.mousePos = { x: n, y: s }, this.mousePos;
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
    const r = (t == null ? void 0 : t.button) === "right" ? 1 : 0, n = Math.min(Math.max((t == null ? void 0 : t.count) ?? 1, 1), 3);
    for (let s = 0; s < n; s++)
      W(r, 1), await this.sleep(80), W(r, 0), s < n - 1 && await this.sleep(120);
  }
  /** from から to へドラッグする(移動→押下→移動→解放)。button既定'left'。 */
  async mouseDrag(t, r, n) {
    if (!this.isBooted()) throw new Error("not booted");
    const s = n === "right" ? 1 : 0;
    await this.mouseMoveTo(t.x, t.y), W(s, 1), await this.sleep(100), await this.mouseMoveTo(r.x, r.y), await this.sleep(100), W(s, 0);
  }
  /**
   * 画面テキスト(getScreenText().lines)からneedleを含む位置(行・列)を検索する。
   * colは文字インデックス(全角文字を含む行でもlinesは既にデコード済み文字列のため)。
   * opts.all=falseまたは省略時は最初の1件のみ、trueなら全件を返す。大文字小文字は区別する。
   */
  findScreenText(t, r) {
    const { lines: n } = this.getScreenText(), s = [];
    if (t.length === 0) return s;
    for (let a = 0; a < n.length; a++) {
      const i = n[a];
      let d = 0;
      for (; ; ) {
        const l = i.indexOf(t, d);
        if (l < 0) break;
        if (s.push({ row: a, col: l, text: i }), !(r != null && r.all)) return s;
        d = l + t.length;
      }
    }
    return s;
  }
  /**
   * 画面テキスト中のneedleを見つけてクリックする。occurrence(既定0=最初)番目の一致を使う。
   * テキストセルサイズ(横8px×縦16px、80x25で640x400)から x = col*8+4, y = row*16+8 を計算する。
   * 見つからなければ found:false を返す。
   */
  async clickScreenText(t, r) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = (r == null ? void 0 : r.occurrence) ?? 0, a = this.findScreenText(t, { all: !0 })[n];
    if (!a)
      return { found: !1 };
    const i = a.col * 8 + 4, d = a.row * 16 + 8;
    return await this.mouseClick({ x: i, y: d, button: r == null ? void 0 : r.button }), { found: !0, x: i, y: d };
  }
  /**
   * '+'区切りのキーコンボ文字列("CTRL+C" 等)を修飾キーコード列とメインキーコードへ解決する。
   * 解決できない場合は Error を投げる。
   */
  resolveCombo(t) {
    const r = t.split("+").map((l) => l.trim());
    if (r.length === 0 || r.some((l) => l.length === 0))
      throw new Error(`invalid key combo: ${t}`);
    const n = r[r.length - 1], a = r.slice(0, -1).filter((l) => Object.prototype.hasOwnProperty.call(A, l.toUpperCase())).map((l) => A[l.toUpperCase()]);
    let i;
    const d = A[n.toUpperCase()];
    if (d !== void 0)
      i = d;
    else {
      const l = Re(n);
      if (!l)
        throw new Error(`cannot resolve key: ${n}`);
      i = l.code;
    }
    return { modifierCodes: a, mainCode: i };
  }
  /**
   * "CTRL+C" や "ENTER" のようなキーコンボを送る。
   * '+'区切りの最後のトークンがメインキー、それ以前は修飾キー(NAMED_KEYSに存在するもののみ)。
   */
  async sendKeys(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const { modifierCodes: r, mainCode: n } = this.resolveCombo(t);
    for (const s of r)
      E(s, !0), await this.sleep(30);
    E(n, !0), await this.sleep(30), E(n, !1), await this.sleep(30);
    for (const s of [...r].reverse())
      E(s, !1), await this.sleep(30);
  }
  /**
   * キー操作のマクロを順番に実行する(press/down/up/wait/text/paste)。
   * 長押し(holdMs指定のpress)や押しっぱなし→他操作→離す、といったキーシーケンスの再現に使う。
   * ステップ単体は最大10秒待ちにクランプ、シーケンス全体の累積待ち時間は60秒を超えるとErrorを投げる。
   * 例外発生時も、down で押しっぱなしのままのキーはすべて try/finally で自動的に up する。
   */
  async runKeySequence(t) {
    if (!this.isBooted()) throw new Error("not booted");
    const r = 1e4, n = 6e4, s = /* @__PURE__ */ new Set();
    let a = 0, i = 0;
    const d = async (u) => {
      const f = Math.min(Math.max(u, 0), r);
      if (a += f, a > n)
        throw new Error(`runKeySequence: total wait time exceeded ${n}ms limit`);
      await this.sleep(f);
    }, l = async (u) => {
      E(u, !0), s.add(u), await d(30);
    }, c = async (u) => {
      E(u, !1), s.delete(u), await d(30);
    };
    try {
      for (let u = 0; u < t.length; u++) {
        const f = t[u];
        try {
          switch (f.type) {
            case "press": {
              const { modifierCodes: p, mainCode: h } = this.resolveCombo(f.keys);
              for (const m of p) await l(m);
              await l(h), await d(f.holdMs ?? 30), await c(h);
              for (const m of [...p].reverse()) await c(m);
              break;
            }
            case "down": {
              const { modifierCodes: p, mainCode: h } = this.resolveCombo(f.keys);
              for (const m of p) await l(m);
              await l(h);
              break;
            }
            case "up": {
              const { modifierCodes: p, mainCode: h } = this.resolveCombo(f.keys);
              await c(h);
              for (const m of [...p].reverse()) await c(m);
              break;
            }
            case "wait": {
              await d(f.ms);
              break;
            }
            case "text": {
              await this.typeText(f.text);
              break;
            }
            case "paste": {
              await this.pasteText(f.text);
              break;
            }
            default: {
              const p = f;
              throw new Error(`unknown step type: ${JSON.stringify(p)}`);
            }
          }
        } catch (p) {
          const h = p instanceof Error ? p.message : String(p);
          throw new Error(`runKeySequence: step ${u} (${f.type}) failed: ${h}`);
        }
        i++;
      }
    } finally {
      for (const u of Array.from(s).reverse())
        E(u, !1), s.delete(u);
    }
    return { executed: i };
  }
  /** 文字列を1文字ずつキー入力として送る。解決できない文字はスキップしログ通知する。 */
  async typeText(t) {
    if (!this.isBooted()) throw new Error("not booted");
    for (const r of t) {
      const n = Re(r);
      if (!n) {
        this.emit("log", { level: "info", message: `typeText: skipped unresolvable char ${JSON.stringify(r)}` });
        continue;
      }
      const { code: s, shift: a } = n;
      a ? (E(A.SHIFT, !0), await this.sleep(30), E(s, !0), await this.sleep(30), E(s, !1), await this.sleep(30), E(A.SHIFT, !1), await this.sleep(30)) : (E(s, !0), await this.sleep(30), E(s, !1), await this.sleep(30));
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
      r = te();
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
    const { units: n, skipped: s } = de(r), a = n.flat();
    ke(t, 1);
    let i = 0;
    for (const d of a) {
      for (; !Bt(t, d); )
        await this.sleep(20);
      i++;
    }
    return ke(t, 0), await this.sleep(600), Ct(t) < 255 && Pe(13), { sent: i, skipped: s };
  }
  /**
   * キーバッファ経路(従来): SJISバイト列(1バイト=1エントリ、上位scan=0)を
   * PC-98キーボードBIOSリングバッファへ直接積む。ゲスト側FEP無しで全角文字を
   * 入力できる。バッファは16エントリしかないため、満杯時は20ms待って再試行する
   * バックプレッシャで長文を流す。
   */
  async pasteTextViaKeyBuffer(t) {
    const { units: r, skipped: n } = de(t);
    let s = 0, a = 0;
    for (const i of r) {
      for (; !(i.length === 2 ? $t(i[0], i[1]) : Pe(i[0])); )
        await this.sleep(20);
      s += i.length, a++, a % 4 === 0 && await this.sleep(10);
    }
    return { sent: s, skipped: n };
  }
  /**
   * 画面テキストに指定文字列が現れるまでポーリングして待つ。固定sleepの代わりに使う。
   * timeoutMs は 60000ms にクランプ。タイムアウト時は found:false と最後に読んだテキストを返す。
   */
  async waitScreenText(t, r = 1e4) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = Math.min(Math.max(r, 0), 6e4), s = Date.now();
    let a = "";
    for (; ; ) {
      if (a = this.getScreenText().text, a.includes(t))
        return { found: !0, text: a };
      if (Date.now() - s >= n)
        return { found: !1, text: a };
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
      if (te() >= 0)
        return { ok: !0, message: "paste helper is already resident" };
    } catch {
    }
    const r = (t == null ? void 0 : t.drive) ?? 1, n = (t == null ? void 0 : t.command) ?? "b:paste";
    let s;
    try {
      const i = await fetch("./tools/webnp2tools.xdf");
      if (!i.ok)
        return { ok: !1, message: `failed to fetch webnp2tools.xdf (HTTP ${i.status})` };
      s = new Uint8Array(await i.arrayBuffer());
    } catch (i) {
      return { ok: !1, message: `failed to fetch webnp2tools.xdf: ${String(i)}` };
    }
    this.fs.writeFile("/disk/webnp2tools.xdf", s), K(r - 1, "/disk/webnp2tools.xdf"), await this.sleep(800), await this.typeText(`${n}
`);
    const a = Date.now();
    for (; ; ) {
      let i = -1;
      try {
        i = te();
      } catch {
        i = -1;
      }
      if (i >= 0)
        return { ok: !0, message: "paste helper is now resident" };
      if (Date.now() - a >= 8e3)
        return {
          ok: !1,
          message: `paste helper not detected. DOSプロンプトで ${n} を実行してください`
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
        const r = await B(`state:${t.sourceKey}`);
        r && !this.fs.analyzePath(C).exists && this.fs.writeFile(C, new Uint8Array(r.bytes));
      } catch (r) {
        this.emit("log", { level: "error", message: `restoreStateIfPresent failed: ${String(r)}` });
      }
  }
}
const _r = [".thd", ".hdi", ".nhd", ".hdd"], Ir = [
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
function ae(e) {
  const o = e.toLowerCase();
  return _r.some((t) => o.endsWith(t)) ? "hdd" : Ir.some((t) => o.endsWith(t)) ? "fd" : null;
}
function Hr(e) {
  try {
    const t = new URL(e, typeof location < "u" ? location.href : void 0).pathname, r = t.slice(t.lastIndexOf("/") + 1);
    return decodeURIComponent(r) || "disk.xdf";
  } catch {
    const o = e.split("?")[0].split("#")[0];
    return o.slice(o.lastIndexOf("/") + 1) || "disk.xdf";
  }
}
function We(e, o) {
  if (e.length !== o.length) return !1;
  for (let t = 0; t < e.length; t++)
    if (e[t] !== o[t]) return !1;
  return !0;
}
function Vr(e) {
  return new Nr(e);
}
class Ur {
  constructor(o) {
    R(this, "pauseListeners", /* @__PURE__ */ new Set());
    R(this, "breakpointListeners", /* @__PURE__ */ new Set());
    this.target = o;
  }
  isBooted() {
    return this.target.isBooted();
  }
  setPaused(o) {
    this.target.dbgSetPaused(o);
    const t = { paused: this.target.dbgIsPaused() };
    for (const r of this.pauseListeners) r(t);
  }
  isPaused() {
    return this.target.dbgIsPaused();
  }
  step(o) {
    return this.target.dbgStep(o);
  }
  readRegisters() {
    return this.target.dbgReadRegs();
  }
  disassemble(o, t, r) {
    return this.target.dbgDisasm(o, t, r);
  }
  setBreakpoint(o, t, r, n) {
    this.target.dbgSetBreakpoint(o, t, r, n);
  }
  runUntilBreakpoint(o) {
    const t = this.target.dbgRunUntilBreakpoint(o);
    if (t >= 0) {
      const r = { index: t, registers: this.readRegisters() };
      for (const n of this.breakpointListeners) n(r);
    }
    return t;
  }
  readMemory(o, t) {
    const r = atob(this.target.readMemoryBase64(o, t).base64);
    return Uint8Array.from(r, (n) => n.charCodeAt(0));
  }
  /** ゲストRAMへ書き込む。実行中CPUとの競合を避けるためpause中だけ許可する。 */
  writeMemory(o, t) {
    if (!this.isPaused()) throw new Error("writeMemory requires paused CPU");
    if (!(t instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
    let r = "";
    const n = 8192;
    for (let s = 0; s < t.length; s += n)
      r += String.fromCharCode(...t.subarray(s, s + n));
    this.target.writeMemoryBase64(o, btoa(r));
  }
  onPause(o) {
    return this.pauseListeners.add(o), () => this.pauseListeners.delete(o);
  }
  onBreakpoint(o) {
    return this.breakpointListeners.add(o), () => this.breakpointListeners.delete(o);
  }
}
function Gr(e) {
  return new Ur(e);
}
function b(e, o = {}) {
  const t = document.createElement(e);
  for (const [r, n] of Object.entries(o))
    r === "class" ? t.className = n : t.setAttribute(r, n);
  return t;
}
function M(e, o) {
  return (e >>> 0).toString(16).toUpperCase().padStart(o, "0");
}
function Or(e, o) {
  return `${e & 65535}:${o >>> 0}`;
}
function Yr(e, o) {
  const t = b("div", { class: "debugger-toolbar" }), r = b("button", { type: "button", "data-debugger-pause": "true" }), n = b("button", { type: "button", "data-debugger-step": "true" }), s = b("button", { type: "button", "data-debugger-step10": "true" }), a = b("button", { type: "button", "data-debugger-run": "true" }), i = b("button", { type: "button", class: "debugger-close-btn" });
  t.append(r, n, s, a, i), e.append(t);
  let d = o.labels, l = !1;
  const c = () => {
    r.textContent = l ? d.resume : d.pause, n.textContent = d.step, s.textContent = d.step10, a.textContent = d.runToBreakpoint, i.textContent = d.close;
  };
  return r.addEventListener("click", o.onPauseToggle), n.addEventListener("click", () => o.onStep(1)), s.addEventListener("click", () => o.onStep(10)), a.addEventListener("click", o.onRunToBreakpoint), i.addEventListener("click", o.onClose), c(), {
    update(u) {
      l = u.paused, r.disabled = !u.enabled, n.disabled = !u.enabled || !l, s.disabled = !u.enabled || !l, a.disabled = !u.enabled || !l || !u.hasBreakpoints, c();
    },
    setLabels(u) {
      d = u, c();
    },
    destroy() {
      t.remove();
    }
  };
}
const Kr = [
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
], Wr = /* @__PURE__ */ new Set(["cs", "ds", "es", "ss", "fs", "gs"]), jr = [["CF", 0], ["PF", 2], ["AF", 4], ["ZF", 6], ["SF", 7], ["TF", 8], ["IF", 9], ["DF", 10], ["OF", 11]];
function Xr(e) {
  const o = b("div", { class: "debugger-register-grid" });
  e.append(o);
  let t;
  return {
    update(r) {
      o.replaceChildren();
      for (const n of Kr) {
        const s = b("div", {
          class: t && t[n] !== r[n] ? "debugger-register changed" : "debugger-register",
          "data-debugger-register": n
        }), a = b("span", { class: "debugger-register-name" });
        a.textContent = n.toUpperCase();
        const i = b("span", { class: "debugger-register-value" });
        if (i.textContent = M(r[n], Wr.has(n) ? 4 : 8), s.append(a, i), n === "eflags") {
          const d = b("span", { class: "debugger-flags" });
          d.textContent = jr.filter(([, l]) => (r.eflags & 1 << l) !== 0).map(([l]) => l).join(" ") || "—", s.append(d);
        }
        o.append(s);
      }
      t = { ...r };
    },
    destroy() {
      o.remove();
    }
  };
}
function qr(e, o) {
  const t = b("div", { class: "debugger-disasm-list" });
  e.append(t);
  let r = { addBreakpoint: o.addBreakpointLabel, removeBreakpoint: o.removeBreakpointLabel }, n;
  const s = ({ seg: a, eip: i, lines: d, breakpoints: l }) => {
    t.replaceChildren();
    for (const c of d) {
      const u = l.has(Or(a, c.addr)), f = b("button", {
        type: "button",
        class: `debugger-disasm-row${c.addr === i ? " current" : ""}${u ? " breakpoint" : ""}`,
        "data-debugger-disasm-row": "true",
        "data-seg": String(a),
        "data-off": String(c.addr),
        "aria-label": u ? r.removeBreakpoint : r.addBreakpoint
      }), p = b("span", { class: "debugger-bp-marker", "aria-hidden": "true" });
      p.textContent = u ? "●" : "○";
      const h = b("span", { class: "debugger-disasm-address" });
      h.textContent = `${M(a, 4)}:${M(c.addr, 8)}`;
      const m = b("span", { class: "debugger-disasm-bytes" });
      m.textContent = c.bytes.map((k) => M(k, 2)).join(" ");
      const g = b("span", { class: "debugger-disasm-text" });
      g.textContent = c.text, f.append(p, h, m, g), f.addEventListener("click", () => o.onToggleBreakpoint(a, c.addr)), t.append(f);
    }
  };
  return {
    update(a) {
      n = a, s(a);
    },
    setLabels(a) {
      r = a, n && s(n);
    },
    destroy() {
      t.remove();
    }
  };
}
function Zr(e, o) {
  const t = b("input", {
    type: "text",
    inputmode: "text",
    value: "00000000",
    class: "debugger-memory-address"
  }), r = b("button", { type: "button", class: "debugger-memory-read" }), n = b("div", { class: "debugger-memory-controls" });
  n.append(t, r);
  const s = b("div", { class: "debugger-memory-dump" });
  e.append(n, s);
  let a = o.labels;
  const i = () => {
    t.setAttribute("aria-label", a.address), r.textContent = a.read;
  }, d = () => {
    var f, p;
    const c = t.value.trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]+$/i.test(c)) {
      (f = o.onError) == null || f.call(o, a.invalidAddress);
      return;
    }
    const u = Number.parseInt(c, 16);
    try {
      l.update(u, o.onRead(u));
    } catch (h) {
      (p = o.onError) == null || p.call(o, h instanceof Error ? h.message : String(h));
    }
  };
  r.addEventListener("click", d), t.addEventListener("keydown", (c) => {
    c.key === "Enter" && d();
  });
  const l = {
    update(c, u) {
      s.replaceChildren();
      for (let f = 0; f < u.length; f += 16) {
        const p = u.subarray(f, f + 16), h = b("div", { class: "debugger-memory-row" }), m = b("span", { class: "debugger-memory-offset" });
        m.textContent = M(c + f, 8);
        const g = b("span", { class: "debugger-memory-hex" });
        g.textContent = Array.from(p, (D) => M(D, 2)).join(" ");
        const k = b("span", { class: "debugger-memory-ascii" });
        k.textContent = Array.from(p, (D) => D >= 32 && D <= 126 ? String.fromCharCode(D) : ".").join(""), h.append(m, g, k), s.append(h);
      }
    },
    read: d,
    setEnabled(c) {
      r.disabled = !c;
    },
    setLabels(c) {
      a = c, i();
    },
    destroy() {
      n.remove(), s.remove();
    }
  };
  return i(), l;
}
export {
  Ur as DebuggerController,
  Or as breakpointKey,
  Gr as createDebugger,
  Vr as createWebNP2,
  Me as fatReadFile,
  Yr as mountDebuggerToolbar,
  qr as mountDisassemblyView,
  Zr as mountMemoryDump,
  Xr as mountRegisterView,
  xe as openDiskImage
};
