var Ye = Object.defineProperty;
var qe = (r, s, e) => s in r ? Ye(r, s, { enumerable: !0, configurable: !0, writable: !0, value: e }) : r[s] = e;
var T = (r, s, e) => qe(r, typeof s != "symbol" ? s + "" : s, e);
function de() {
  var r;
  return ((r = window.Module) == null ? void 0 : r.FS) ?? window.FS;
}
function Xe() {
  var r;
  return ((r = window.Module) == null ? void 0 : r.ccall) ?? window.ccall;
}
function j() {
  var r;
  return ((r = window.Module) == null ? void 0 : r.HEAPU8) ?? window.HEAPU8;
}
function Ze() {
  var r;
  return ((r = window.Module) == null ? void 0 : r.HEAPU32) ?? window.HEAPU32;
}
function y() {
  const r = Xe();
  if (!r)
    throw new Error("ccall is not available (core not booted yet?)");
  return r;
}
const X = "./core/", le = "webnp2-core-script";
let Z = !1;
function Je(r) {
  var n;
  const e = ["[NekoProject21kai]", ((n = r.roms) == null ? void 0 : n.some((o) => o.name.toLowerCase() === "font.rom")) ?? !1 ? "fontfile=/font.rom" : "fontfile=/font.bmp"];
  r.hdd && e.push(`HDD1FILE=/disk/${r.hdd.name}`), e.push(`Latencys=${r.latencyMs ?? 40}`), e.push("keyrepeat_enable=true"), e.push("keyrepeat_delay=500"), e.push("keyrepeat_interval=50"), e.push("USEFMGEN=true"), e.push("PEGCPLNE=true");
  const t = Math.max(0, Math.min(230, Math.floor(r.extMemMB ?? 1)));
  if (e.push(`ExMemory=${t}`), r.clkMult !== void 0) {
    const o = Math.max(1, Math.min(32, Math.floor(r.clkMult)));
    e.push(`clk_mult=${o}`);
  }
  return e.join(`
`) + `
`;
}
function Qe(r, s) {
  return Z ? Promise.reject(new Error("core is already booted (reload the page to reboot)")) : (Z = !0, new Promise((e, t) => {
    let n = !1;
    const o = (l) => {
      n || (n = !0, Z = !1, t(l instanceof Error ? l : new Error(String(l))));
    };
    window.onerror = (l, u, f, w, m) => (console.error("[WebNP2 core] window.onerror", l, u, f, w, m), o(m ?? l), !1);
    const i = {
      canvas: s,
      preRun: [
        function() {
          const u = de();
          if (!u) {
            o(new Error("FS is not available in preRun"));
            return;
          }
          try {
            u.analyzePath("/disk").exists || u.mkdir("/disk"), r.hdd && u.writeFile(`/disk/${r.hdd.name}`, r.hdd.bytes);
            for (const f of r.fds)
              u.writeFile(`/disk/${f.name}`, f.bytes);
            for (const f of r.roms ?? [])
              u.writeFile(`/${f.name}`, f.bytes);
            u.createPreloadedFile("/", "font.bmp", `${X}font.bmp`, !0, !1), u.writeFile("/np21kai.cfg", Je(r));
          } catch (f) {
            o(f);
          }
        }
      ],
      print: (l) => console.log("[WebNP2 core stdout]", l),
      printErr: (l) => console.log("[WebNP2 core stderr]", l),
      locateFile: (l) => X + l,
      arguments: r.fds.map((l) => `/disk/${l.name}`),
      onRuntimeInitialized: () => {
        if (n) return;
        n = !0;
        const l = de();
        if (!l) {
          o(new Error("FS is not available after runtime init"));
          return;
        }
        e(l);
      },
      onAbort: (l) => {
        console.error("[WebNP2 core] aborted", l), o(new Error(`core aborted: ${String(l)}`));
      }
    }, a = s.getContext.bind(s);
    s.getContext = (l, u) => l === "webgl" || l === "webgl2" || l === "experimental-webgl" ? a(l, { ...u ?? {}, preserveDrawingBuffer: !0 }) : a(l, u), window.Module = i;
    const c = document.getElementById(le);
    c && c.remove();
    const d = document.createElement("script");
    d.id = le, d.src = `${X}emnp21kai_sdl2.js?v=${Date.now()}`, d.onerror = () => o(new Error(`failed to load ${d.src}`)), document.body.appendChild(d);
  }));
}
function O(r, s) {
  return r.readFile(`/disk/${s}`, { encoding: "binary" });
}
function H(r, s) {
  try {
    const e = r.stat(`/disk/${s}`), t = e.mtime instanceof Date ? e.mtime.getTime() : Number(e.mtime);
    return Number.isFinite(t) ? { mtimeMs: t, size: e.size } : null;
  } catch {
    return null;
  }
}
function et() {
  y()("webnp2_reset", null, [], []);
}
function B(r, s) {
  y()("webnp2_set_fdd", null, ["number", "string"], [r, s]);
}
function ue(r) {
  return y()("webnp2_statsave", "number", ["string"], [r]);
}
function fe(r) {
  return y()("webnp2_statload", "number", ["string"], [r]);
}
function tt(r, s) {
  y()("webnp2_mouse_move", null, ["number", "number"], [r, s]);
}
function rt() {
  return y()("webnp2_mouse_pending", "number", [], []);
}
function z(r, s) {
  y()("webnp2_mouse_button", null, ["number", "number"], [r, s]);
}
function x(r, s) {
  y()("webnp2_key", null, ["number", "number"], [r, s ? 1 : 0]);
}
function he(r) {
  return y()("webnp2_push_key_buffer", "number", ["number"], [r]);
}
function nt(r, s) {
  return y()("webnp2_push_key_buffer_pair", "number", ["number", "number"], [r, s]);
}
function J() {
  return y()("webnp2_find_mailbox", "number", [], []);
}
function st(r) {
  return y()("webnp2_mailbox_space", "number", ["number"], [r]);
}
function ot(r, s) {
  return y()("webnp2_mailbox_put", "number", ["number", "number"], [r, s]);
}
function me(r, s) {
  y()("webnp2_mailbox_pending", null, ["number", "number"], [r, s]);
}
function it() {
  const r = y(), s = r("webnp2_read_tvram", "number", [], []), e = r("webnp2_tvram_size", "number", [], []), t = j();
  if (!t)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  return t.slice(s, s + e);
}
function at(r, s) {
  const e = y(), t = e("webnp2_mem_ptr", "number", [], []), n = e("webnp2_mem_size", "number", [], []);
  if (r < 0 || s < 0 || r + s > n)
    throw new Error(`coreReadMemory: out of range (addr=${r}, len=${s}, memSize=${n})`);
  const o = j();
  if (!o)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  return o.slice(t + r, t + r + s);
}
function ct(r, s) {
  const e = y(), t = e("webnp2_mem_ptr", "number", [], []), n = e("webnp2_mem_size", "number", [], []);
  if (r < 0 || r + s.byteLength > n)
    throw new Error(`coreWriteMemory: out of range (addr=${r}, len=${s.byteLength}, memSize=${n})`);
  const o = j();
  if (!o)
    throw new Error("HEAPU8 is not available (core not booted yet?)");
  o.set(s, t + r);
}
function dt(r) {
  y()("webnp2_dbg_set_paused", null, ["number"], [r ? 1 : 0]);
}
function lt() {
  return y()("webnp2_dbg_paused", "number", [], []);
}
function ut(r) {
  return y()("webnp2_dbg_step", "number", ["number"], [r]);
}
function ft() {
  const r = y(), s = r("webnp2_dbg_regs", "number", [], []), e = r("webnp2_dbg_regs_size", "number", [], []), t = Ze();
  if (!s || !t || e <= 0 || s & 3 || e & 3)
    throw new Error("webnp2_dbg_regs returned an invalid buffer");
  const n = s >>> 2;
  return t.slice(n, n + (e >>> 2));
}
function ht(r, s, e) {
  const t = y()(
    "webnp2_dbg_disasm",
    "number",
    ["number", "number", "number"],
    [r, s, e]
  ), n = j();
  if (!t || !n)
    throw new Error("webnp2_dbg_disasm returned an invalid buffer");
  let o = t;
  for (; o < n.length && n[o] !== 0; ) o++;
  if (o === n.length)
    throw new Error("webnp2_dbg_disasm returned a non-terminated string");
  return new TextDecoder().decode(n.subarray(t, o));
}
function mt(r, s, e, t) {
  y()(
    "webnp2_dbg_set_bp",
    null,
    ["number", "number", "number", "number"],
    [r, s, e, t ? 1 : 0]
  );
}
function wt(r) {
  return y()("webnp2_dbg_run_until_bp", "number", ["number"], [r]);
}
const bt = "webnp2", gt = 1, C = "images";
let K = null;
function U() {
  return K || (K = new Promise((r, s) => {
    const e = indexedDB.open(bt, gt);
    e.onupgradeneeded = () => {
      const t = e.result;
      t.objectStoreNames.contains(C) || t.createObjectStore(C, { keyPath: "sourceKey" });
    }, e.onsuccess = () => r(e.result), e.onerror = () => s(e.error ?? new Error("failed to open IndexedDB"));
  }), K);
}
async function D(r) {
  const s = await U();
  return new Promise((e, t) => {
    const i = s.transaction(C, "readonly").objectStore(C).get(r);
    i.onsuccess = () => e(i.result ?? void 0), i.onerror = () => t(i.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function L(r) {
  const s = await U();
  return new Promise((e, t) => {
    const n = s.transaction(C, "readwrite");
    n.objectStore(C).put(r), n.oncomplete = () => e(), n.onerror = () => t(n.error ?? new Error("failed to write to IndexedDB"));
  });
}
async function yt(r) {
  const s = await D(r.sourceKey);
  if (!s) {
    await L(r);
    return;
  }
  const e = s.displayName !== void 0 || s.group !== void 0 || s.groupName !== void 0 || s.groupIndex !== void 0;
  await L({
    ...r,
    displayName: e ? s.displayName : r.displayName,
    group: e ? s.group : r.group,
    groupName: e ? s.groupName : r.groupName,
    groupIndex: e ? s.groupIndex : r.groupIndex
  });
}
async function pt(r) {
  const s = await U();
  return new Promise((e, t) => {
    const o = s.transaction(C, "readonly").objectStore(C), i = IDBKeyRange.bound(r, r + "￿"), a = o.getAll(i);
    a.onsuccess = () => e(a.result ?? []), a.onerror = () => t(a.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function St() {
  const r = await U();
  return new Promise((s, e) => {
    const o = r.transaction(C, "readonly").objectStore(C).getAll();
    o.onsuccess = () => s(o.result ?? []), o.onerror = () => e(o.error ?? new Error("failed to read from IndexedDB"));
  });
}
async function Et(r) {
  const s = await U();
  return new Promise((e, t) => {
    const n = s.transaction(C, "readwrite");
    n.objectStore(C).delete(r), n.oncomplete = () => e(), n.onerror = () => t(n.error ?? new Error("failed to delete from IndexedDB"));
  });
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
  CTRL: 116
}, Q = {
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
}, we = {
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
function be(r) {
  if (r === `
` || r === "\r")
    return { code: A.ENTER, shift: !1 };
  if (r.length === 1 && r >= "A" && r <= "Z") {
    const s = r.toLowerCase(), e = Q[s];
    return e !== void 0 ? { code: e, shift: !0 } : void 0;
  }
  if (Object.prototype.hasOwnProperty.call(Q, r))
    return { code: Q[r], shift: !1 };
  if (Object.prototype.hasOwnProperty.call(we, r))
    return { code: we[r], shift: !0 };
}
let ee = null;
function xt() {
  const r = /* @__PURE__ */ new Map(), s = new TextDecoder("shift_jis"), e = [
    [129, 159],
    [224, 239]
  ], t = [
    [64, 126],
    [128, 252]
  ];
  for (const [n, o] of e)
    for (let i = n; i <= o; i++)
      for (const [a, c] of t)
        for (let d = a; d <= c; d++) {
          const l = s.decode(new Uint8Array([i, d]));
          l.length === 1 && l !== "�" && (r.has(l) || r.set(l, [i, d]));
        }
  return r;
}
function kt() {
  return ee || (ee = xt()), ee;
}
const ge = {
  "〜": "～",
  "−": "－",
  "―": "—"
};
function re(r) {
  const s = kt(), e = [], t = [], n = Array.from(r);
  for (let o = 0; o < n.length; o++) {
    let i = n[o];
    if (i === "\r") {
      n[o + 1] === `
` && o++, e.push([13]);
      continue;
    }
    if (i === `
`) {
      e.push([13]);
      continue;
    }
    const a = i.codePointAt(0) ?? 0;
    if (a >= 32 && a <= 126) {
      e.push([a]);
      continue;
    }
    if (a >= 65377 && a <= 65439) {
      e.push([161 + (a - 65377)]);
      continue;
    }
    if (i === "¥") {
      e.push([92]);
      continue;
    }
    ge[i] && (i = ge[i]);
    const c = s.get(i);
    if (c) {
      e.push([c[0], c[1]]);
      continue;
    }
    t.push(i);
  }
  return { units: e, skipped: t };
}
class P extends Error {
  constructor(s, e, t = {}) {
    super(e), this.code = s, this.params = t, this.name = "DiskError";
  }
}
const Tt = [128, 256, 512, 1024, 2048], R = 32, Re = 8, v = 16, Ie = 15, I = 229, N = 0;
function S(r, s) {
  return r[s] | r[s + 1] << 8;
}
function M(r, s) {
  return (r[s] | r[s + 1] << 8 | r[s + 2] << 16 | r[s + 3] << 24) >>> 0;
}
function k(r, s, e) {
  r[s] = e & 255, r[s + 1] = e >> 8 & 255;
}
function Ne(r, s, e) {
  r[s] = e & 255, r[s + 1] = e >>> 8 & 255, r[s + 2] = e >>> 16 & 255, r[s + 3] = e >>> 24 & 255;
}
function W(r, s = 0) {
  if (r.length < s + 512)
    throw new Error(`openFat: image too small (${r.length} bytes)`);
  const e = r, t = s, n = S(e, t + 11), o = e[t + 13], i = S(e, t + 14), a = e[t + 16], c = S(e, t + 17), d = S(e, t + 19), l = S(e, t + 22), u = M(e, t + 32), f = d !== 0 ? d : u;
  if (!Tt.includes(n))
    throw new Error(`openFat: invalid BPB (bytes/sector=${n})`);
  if (o === 0)
    throw new Error("openFat: invalid BPB (sectors/cluster=0)");
  if (a === 0)
    throw new Error("openFat: invalid BPB (FAT count=0)");
  if (l === 0)
    throw new Error("openFat: invalid BPB (sectors/FAT=0)");
  if (f === 0)
    throw new Error("openFat: invalid BPB (total sectors=0)");
  const w = Math.ceil(c * R / n), m = i, h = m + a * l, b = h + w, E = f - b, p = Math.floor(E / o), F = p < 4085 ? "FAT12" : "FAT16";
  return {
    image: r,
    imageOffset: s,
    bytesPerSector: n,
    sectorsPerCluster: o,
    reservedSectors: i,
    numFats: a,
    rootEntries: c,
    sectorsPerFat: l,
    totalSectors: f,
    fatType: F,
    fatStartByte: t + m * n,
    rootStartByte: t + h * n,
    rootDirBytes: w * n,
    dataStartByte: t + b * n,
    totalClusters: p,
    bytesPerCluster: o * n
  };
}
const Ue = { FAT12: 4095, FAT16: 65535 };
function ne(r, s) {
  const e = r.fatStartByte;
  if (r.fatType === "FAT12") {
    const n = e + Math.floor(s * 3 / 2), o = r.image[n], i = r.image[n + 1];
    return s % 2 === 0 ? o | (i & 15) << 8 : o >> 4 | i << 4;
  }
  const t = e + s * 2;
  return S(r.image, t);
}
function se(r, s, e) {
  for (let t = 0; t < r.numFats; t++) {
    const n = r.fatStartByte + t * r.sectorsPerFat * r.bytesPerSector;
    if (r.fatType === "FAT12") {
      const o = n + Math.floor(s * 3 / 2);
      s % 2 === 0 ? (r.image[o] = e & 255, r.image[o + 1] = r.image[o + 1] & 240 | e >> 8 & 15) : (r.image[o] = r.image[o] & 15 | e << 4 & 240, r.image[o + 1] = e >> 4 & 255);
    } else {
      const o = n + s * 2;
      k(r.image, o, e & 65535);
    }
  }
}
function Ct(r, s) {
  return r.fatType === "FAT12" ? s >= 4087 : s >= 65527;
}
function oe(r) {
  return r === 0;
}
function V(r, s) {
  return r.dataStartByte + (s - 2) * r.bytesPerCluster;
}
function ie(r, s) {
  const e = [], t = /* @__PURE__ */ new Set();
  let n = s;
  for (; n >= 2 && !Ct(r, n) && !oe(n) && !t.has(n); )
    t.add(n), e.push(n), n = ne(r, n);
  return e;
}
function Oe(r, s) {
  const e = [];
  for (let t = 2; t < r.totalClusters + 2 && e.length < s; t++)
    oe(ne(r, t)) && e.push(t);
  if (e.length < s)
    throw new Error(
      `fatWriteFile: not enough free space (need ${s} cluster(s), found ${e.length})`
    );
  return e;
}
function He(r, s) {
  if (s < 2) return;
  const e = ie(r, s);
  for (const t of e)
    se(r, t, 0);
}
function G(r) {
  const s = r.toUpperCase(), e = s.lastIndexOf("."), t = e >= 0 ? s.slice(0, e) : s, n = e >= 0 ? s.slice(e + 1) : "";
  if (t.length === 0 || t.length > 8 || n.length > 3)
    throw new Error(`invalid 8.3 filename: ${r}`);
  const o = new Uint8Array(8).fill(32), i = new Uint8Array(3).fill(32);
  for (let c = 0; c < t.length; c++) o[c] = t.charCodeAt(c) & 255;
  for (let c = 0; c < n.length; c++) i[c] = n.charCodeAt(c) & 255;
  const a = n.length > 0 ? `${t}.${n}` : t;
  return { rawName: o, rawExt: i, display: a };
}
function ze(r, s) {
  let e = "";
  for (let n = 0; n < 8 && r[n] !== 32; n++)
    e += String.fromCharCode(r[n]);
  let t = "";
  for (let n = 0; n < 3 && s[n] !== 32; n++)
    t += String.fromCharCode(s[n]);
  return t.length > 0 ? `${e}.${t}` : e;
}
function Y(r) {
  return r.split(/[\\/]/).map((s) => s.trim()).filter((s) => s.length > 0);
}
function ae(r, s) {
  const e = [];
  if (s === null) {
    for (let o = 0; o < r.rootEntries; o++)
      e.push({ offset: r.rootStartByte + o * R });
    return e;
  }
  const t = ie(r, s), n = Math.floor(r.bytesPerCluster / R);
  for (const o of t) {
    const i = V(r, o);
    for (let a = 0; a < n; a++)
      e.push({ offset: i + a * R });
  }
  return e;
}
function Ft(r, s, e) {
  const t = S(r, s), n = S(r, e), o = 1980 + (t >> 9 & 127), i = t >> 5 & 15, a = t & 31, c = n >> 11 & 31, d = n >> 5 & 63, l = (n & 31) * 2;
  return i === 0 || a === 0 ? 0 : new Date(o, i - 1, a, c, d, l).getTime();
}
function Ke(r, s, e, t) {
  const n = (t.getFullYear() - 1980 & 127) << 9 | t.getMonth() + 1 << 5 | t.getDate(), o = t.getHours() << 11 | t.getMinutes() << 5 | Math.floor(t.getSeconds() / 2);
  k(r, s, n), k(r, e, o);
}
function Mt(r, s, e) {
  const t = r.image, n = s.offset, o = t[n];
  if (o === N || o === I) return null;
  const i = t[n + 11];
  if (i === Ie || i & Re) return null;
  const a = t.subarray(n, n + 8), c = t.subarray(n + 8, n + 11), d = ze(a, c);
  if (d === "." || d === "..") return null;
  const l = S(t, n + 26), u = M(t, n + 28), f = Ft(t, n + 24, n + 22);
  return { slotIndex: e, offset: n, attr: i, name: d, cluster: l, size: u, mtime: f };
}
function q(r, s) {
  const e = ae(r, s), t = [];
  for (let n = 0; n < e.length && r.image[e[n].offset] !== N; n++) {
    const o = Mt(r, e[n], n);
    o && t.push(o);
  }
  return t;
}
function We(r, s) {
  let e = null;
  for (let t = 0; t < s.length; t++) {
    const n = G(s[t]).display, i = q(r, e).find((a) => a.name === n);
    if (!i) throw new Error(`directory not found: ${s.slice(0, t + 1).join("/")}`);
    if (!(i.attr & v))
      throw new Error(`not a directory: ${s.slice(0, t + 1).join("/")}`);
    e = i.cluster;
  }
  return e;
}
function ce(r, s) {
  return We(r, s.slice(0, -1));
}
const ye = "T98HDDIMAGE.R0", pe = "VHD", Se = 220;
function Ee(r, s, e) {
  let t = "";
  for (let n = 0; n < e; n++) t += String.fromCharCode(r[s + n]);
  return t;
}
function Pt(r, s) {
  if (s.endsWith(".thd"))
    return { headerSize: 256, surfaces: 8, sectorsPerTrack: 33, bytesPerSector: 256 };
  if (s.endsWith(".nhd")) {
    if (r.length < 288 || Ee(r, 0, ye.length) !== ye)
      throw new P("hddInvalidHeader", "NHDヘッダが不正です", { format: "NHD" });
    return {
      headerSize: M(r, 272),
      surfaces: S(r, 280),
      sectorsPerTrack: S(r, 282),
      bytesPerSector: S(r, 284)
    };
  }
  if (s.endsWith(".hdi")) {
    if (r.length < 32)
      throw new P("hddInvalidHeader", "HDIヘッダが不正です", { format: "HDI" });
    return {
      headerSize: M(r, 8),
      surfaces: M(r, 24),
      sectorsPerTrack: M(r, 20),
      bytesPerSector: M(r, 16)
    };
  }
  if (s.endsWith(".hdd")) {
    if (r.length < Se || Ee(r, 0, pe.length) !== pe)
      throw new P("hddInvalidHeader", "Virtual98(.hdd)ヘッダが不正です", {
        format: "Virtual98(.hdd)"
      });
    return {
      headerSize: Se,
      surfaces: r[145],
      sectorsPerTrack: r[144],
      bytesPerSector: S(r, 142)
    };
  }
  return null;
}
const xe = 32, _t = 16;
function Dt(r, s) {
  const e = s.headerSize + s.bytesPerSector, t = [];
  for (let n = 0; n < _t; n++) {
    const o = e + n * xe;
    if (o + xe > r.length) break;
    if (r[o + 1] === 0) continue;
    const i = r[o + 8], a = r[o + 9], d = (S(r, o + 10) * s.surfaces + a) * s.sectorsPerTrack + i, l = s.headerSize + d * s.bytesPerSector;
    l > 0 && l < r.length && t.push(l);
  }
  return t;
}
function vt(r, s) {
  for (const e of Dt(r, s))
    try {
      return W(r, e);
    } catch {
    }
  try {
    return W(r, s.headerSize);
  } catch {
    throw new P("hddNoFatPartition", "HDDイメージ内にFAT16/12パーティションが見つかりません");
  }
}
const At = 4096;
function ke(r, s) {
  const e = s.toLowerCase();
  if (e.endsWith(".d88"))
    throw new P("d88NotEditable", "D88形式は編集非対応です");
  const t = Pt(r, e);
  if (t)
    return vt(r, t);
  if (e.endsWith(".fdi")) {
    let n = At;
    if (r.length >= 16) {
      const o = M(r, 8), i = M(r, 12);
      o >= 16 && o < r.length && i > 0 && o + i <= r.length && (n = o);
    }
    return W(r, n);
  }
  return W(r, 0);
}
function Te(r, s) {
  const e = Y(s), t = We(r, e);
  return q(r, t).map((o) => ({
    name: o.name,
    size: o.size,
    isDir: (o.attr & v) !== 0,
    cluster: o.cluster,
    mtime: o.mtime
  }));
}
function je(r, s) {
  const e = Y(s);
  if (e.length === 0) throw new Error("empty file path");
  const t = ce(r, e), n = G(e[e.length - 1]).display, i = q(r, t).find((a) => a.name === n);
  if (!i) throw new Error(`file not found: ${s}`);
  return { dirCluster: t, entry: i };
}
function Ce(r, s) {
  const { entry: e } = je(r, s);
  if (e.attr & v) throw new Error(`is a directory: ${s}`);
  if (e.size === 0 || e.cluster === 0) return new Uint8Array(0);
  const t = ie(r, e.cluster), n = new Uint8Array(e.size);
  let o = 0;
  for (const i of t) {
    if (o >= e.size) break;
    const a = V(r, i), c = Math.min(r.bytesPerCluster, e.size - o);
    n.set(r.image.subarray(a, a + c), o), o += c;
  }
  if (o < e.size)
    throw new Error(`fatReadFile: cluster chain shorter than file size for ${s}`);
  return n;
}
function Fe(r, s, e) {
  const t = Y(s);
  if (t.length === 0) throw new Error("empty file path");
  const n = ce(r, t), { display: o, rawName: i, rawExt: a } = G(t[t.length - 1]), c = ae(r, n);
  let d = -1, l = 0;
  for (let h = 0; h < c.length; h++) {
    const b = r.image[c[h].offset];
    if (b === N) break;
    if (b === I) continue;
    const E = r.image[c[h].offset + 11];
    if (E === Ie || E & Re) continue;
    if (ze(
      r.image.subarray(c[h].offset, c[h].offset + 8),
      r.image.subarray(c[h].offset + 8, c[h].offset + 11)
    ) === o) {
      d = h, l = S(r.image, c[h].offset + 26);
      break;
    }
  }
  if (d < 0) {
    for (let h = 0; h < c.length; h++) {
      const b = r.image[c[h].offset];
      if (b === N || b === I) {
        d = h;
        break;
      }
    }
    if (d < 0)
      throw new Error(`fatWriteFile: directory is full, cannot create ${s}`);
  }
  l >= 2 && He(r, l);
  const u = e.length === 0 ? 0 : Math.ceil(e.length / r.bytesPerCluster), f = u > 0 ? Oe(r, u) : [];
  let w = 0;
  for (let h = 0; h < f.length; h++) {
    const b = f[h], E = h === f.length - 1;
    se(r, b, E ? Ue[r.fatType] : f[h + 1]);
    const p = V(r, b), F = Math.min(r.bytesPerCluster, e.length - w);
    r.image.set(e.subarray(w, w + F), p), F < r.bytesPerCluster && r.image.fill(0, p + F, p + r.bytesPerCluster), w += F;
  }
  const m = c[d].offset;
  r.image.set(i, m), r.image.set(a, m + 8), r.image[m + 11] = 32, r.image[m + 12] = 0, k(r.image, m + 14, 0), k(r.image, m + 16, 0), k(r.image, m + 18, 0), k(r.image, m + 20, 0), Ke(r.image, m + 24, m + 22, /* @__PURE__ */ new Date()), k(r.image, m + 26, f.length > 0 ? f[0] : 0), Ne(r.image, m + 28, e.length);
}
function te(r, s, e, t, n, o, i, a) {
  r.image.set(e, s), r.image.set(t, s + 8), r.image[s + 11] = n, r.image[s + 12] = 0, k(r.image, s + 14, 0), k(r.image, s + 16, 0), k(r.image, s + 18, 0), k(r.image, s + 20, 0), Ke(r.image, s + 24, s + 22, a), k(r.image, s + 26, o), Ne(r.image, s + 28, i);
}
function Me(r) {
  const s = new Uint8Array(8).fill(32);
  for (let t = 0; t < r; t++) s[t] = 46;
  const e = new Uint8Array(3).fill(32);
  return { rawName: s, rawExt: e };
}
function Pe(r, s) {
  const e = Y(s);
  if (e.length === 0) throw new Error("empty directory path");
  const t = ce(r, e), { display: n, rawName: o, rawExt: i } = G(e[e.length - 1]);
  if (q(r, t).some((h) => h.name === n))
    throw new Error(`fatMakeDir: already exists: ${s}`);
  const [c] = Oe(r, 1);
  se(r, c, Ue[r.fatType]);
  const d = V(r, c);
  r.image.fill(0, d, d + r.bytesPerCluster);
  const l = /* @__PURE__ */ new Date(), u = Me(1), f = Me(2);
  te(r, d, u.rawName, u.rawExt, v, c, 0, l), te(
    r,
    d + R,
    f.rawName,
    f.rawExt,
    v,
    t ?? 0,
    0,
    l
  );
  const w = ae(r, t);
  let m = -1;
  for (let h = 0; h < w.length; h++) {
    const b = r.image[w[h].offset];
    if (b === N || b === I) {
      m = h;
      break;
    }
  }
  if (m < 0)
    throw new Error(`fatMakeDir: directory is full, cannot create ${s}`);
  te(r, w[m].offset, o, i, v, c, 0, l);
}
function _e(r, s) {
  const { entry: e } = je(r, s);
  if (e.attr & v) throw new Error(`is a directory: ${s}`);
  e.cluster >= 2 && He(r, e.cluster), r.image[e.offset] = I;
}
function De(r) {
  let s = 0;
  for (let e = 2; e < r.totalClusters + 2; e++)
    oe(ne(r, e)) && s++;
  return {
    total: r.totalClusters * r.bytesPerCluster,
    free: s * r.bytesPerCluster
  };
}
const _ = "/state0.sav", $t = 1261568;
function Bt(r) {
  const s = [], e = [], t = Array.from(r);
  for (let n = 0; n < t.length; n++) {
    const o = t[n];
    if (o === "\r") {
      if (t[n + 1] === `
`) continue;
      s.push(13, 10);
      continue;
    }
    if (o === `
`) {
      s.push(13, 10);
      continue;
    }
    const { units: i, skipped: a } = re(o);
    i.length > 0 && s.push(...i[0]), e.push(...a);
  }
  return { bytes: new Uint8Array(s), skipped: e };
}
function ve(r) {
  let s = "";
  for (let t = 0; t < r.length; t += 8192)
    s += String.fromCharCode(...r.subarray(t, t + 8192));
  return btoa(s);
}
function Lt(r) {
  const s = atob(r), e = new Uint8Array(s.length);
  for (let t = 0; t < s.length; t++) e[t] = s.charCodeAt(t);
  return e;
}
function Ae(r) {
  const s = r.split(/[\\/]/).filter((t) => t.length > 0), e = s[s.length - 1];
  if (!e)
    throw new Error(`invalid guest path: ${r}`);
  if (!/^[A-Za-z0-9_\-$~!#%'@(){}^]{1,8}(\.[A-Za-z0-9_\-$~!#%'@(){}^]{1,3})?$/.test(e))
    throw new P(
      "invalidShortName",
      `ファイル名は8.3形式にしてください(2バイト文字/長い名前は不可): ${e}`,
      { name: e }
    );
  return e;
}
function Rt(r, s) {
  return r.split(`
`).slice(-8).join(`
`);
}
const It = ["個のファイルをコピーしました", "file(s) copied", "file copied"], Nt = [
  "ファイルが見つかりません",
  "指定されたパスが見つかりません",
  "File not found",
  "Path not found",
  "書き込み保護",
  "このドライブには",
  "ディスクの空き容量が",
  "Insufficient disk space",
  "無効なパスです"
], Ut = ["を上書きしますか", "Overwrite", "overwrite"], Ot = { 1: "B:", 2: "C:" };
class Ht {
  constructor() {
    T(this, "listeners", /* @__PURE__ */ new Map());
  }
  on(s, e) {
    let t = this.listeners.get(s);
    return t || (t = /* @__PURE__ */ new Set(), this.listeners.set(s, t)), t.add(e), () => t == null ? void 0 : t.delete(e);
  }
  emit(s, e) {
    const t = this.listeners.get(s);
    if (t)
      for (const n of t)
        n(e);
  }
}
const zt = 3e4, $e = 4096;
class Kt extends Ht {
  constructor(e) {
    super();
    T(this, "canvas");
    T(this, "fs", null);
    T(this, "mounted", /* @__PURE__ */ new Map());
    T(this, "persistTimer", null);
    T(this, "boundOnVisibilityChange", () => this.onVisibilityChange());
    T(this, "boundOnPageHide", () => void this.persistNow());
    /** ホスト側が推定するバスマウスのカーソル位置(0-639, 0-399)。null=未ホーミング(未確定)。 */
    T(this, "mousePos", null);
    /** persistNow の再入ガード。タイマーと visibilitychange が重なると二重保存になるため。 */
    T(this, "persisting", !1);
    this.canvas = e;
  }
  isBooted() {
    return this.fs !== null;
  }
  /** CPU実行の一時停止を切り替える。描画・イベント処理は継続する。 */
  dbgSetPaused(e) {
    if (!this.isBooted()) throw new Error("not booted");
    dt(e);
  }
  /** CPUがデバッガによって一時停止中かを返す。 */
  dbgIsPaused() {
    if (!this.isBooted()) throw new Error("not booted");
    return lt() !== 0;
  }
  /** 一時停止中に指定命令数だけ実行し、実際の実行数を返す。 */
  dbgStep(e) {
    if (!this.isBooted()) throw new Error("not booted");
    return ut(Math.trunc(e));
  }
  /** CPUレジスタを名前付きオブジェクトとして取得する。 */
  dbgReadRegs() {
    if (!this.isBooted()) throw new Error("not booted");
    const e = ft();
    if (e.length < 17)
      throw new Error(`invalid debugger register count: ${e.length}`);
    return {
      eax: e[0],
      ecx: e[1],
      edx: e[2],
      ebx: e[3],
      esp: e[4],
      ebp: e[5],
      esi: e[6],
      edi: e[7],
      eip: e[8],
      eflags: e[9],
      cs: e[10],
      ds: e[11],
      es: e[12],
      ss: e[13],
      fs: e[14],
      gs: e[15],
      cr0: e[16]
    };
  }
  /** 逆アセンブル文字列を解析し、各行のaddrを命令長の積算で補う。 */
  dbgDisasm(e, t, n) {
    if (!this.isBooted()) throw new Error("not booted");
    const o = ht(e, t, Math.trunc(n));
    let i = t >>> 0;
    return o.split(`
`).filter((a) => a.length > 0).map((a) => {
      const [c, d, ...l] = a.split("	"), u = Number.parseInt(c, 10);
      if (!Number.isInteger(u) || u <= 0 || d.length !== u * 2)
        throw new Error(`invalid debugger disassembly line: ${a}`);
      const f = [];
      for (let m = 0; m < d.length; m += 2) {
        const h = Number.parseInt(d.slice(m, m + 2), 16);
        if (!Number.isInteger(h))
          throw new Error(`invalid debugger disassembly bytes: ${d}`);
        f.push(h);
      }
      const w = { addr: i, len: u, bytes: f, text: l.join("	") };
      return i = i + u >>> 0, w;
    });
  }
  /** index 0..7のソフトウェアブレークポイントを設定する。 */
  dbgSetBreakpoint(e, t, n, o) {
    if (!this.isBooted()) throw new Error("not booted");
    mt(Math.trunc(e), t, n, o);
  }
  /** 最大命令数まで実行し、ヒットしたブレークポイントindex（無ヒットは-1）を返す。 */
  dbgRunUntilBreakpoint(e) {
    if (!this.isBooted()) throw new Error("not booted");
    return wt(Math.trunc(e));
  }
  getMountedImages() {
    return Array.from(this.mounted.values()).map(({ slot: e, name: t, sourceKey: n, url: o }) => ({
      slot: e,
      name: t,
      sourceKey: n,
      url: o
    }));
  }
  /** 現在マウント中のディスク一覧を返す(getMountedImagesの整形版)。 */
  listDisks() {
    return this.getMountedImages().map(({ slot: e, name: t, sourceKey: n }) => ({ slot: e, name: t, sourceKey: n }));
  }
  /**
   * IndexedDBに保存済みのディスクイメージ一覧を返す(rom:/state: プレフィックスは除外)。
   * 拡張子からhdd/fdを判定する。savedAt降順。
   */
  async listDiskLibrary() {
    const e = await St(), t = [];
    for (const n of e) {
      if (n.sourceKey.startsWith("rom:") || n.sourceKey.startsWith("state:")) continue;
      const o = Be(n.name);
      o && t.push({
        sourceKey: n.sourceKey,
        name: n.name,
        size: n.bytes.byteLength,
        savedAt: n.savedAt,
        kind: o
      });
    }
    return t.sort((n, o) => o.savedAt - n.savedAt), t;
  }
  /** URLからディスクイメージをfetchしてFDドライブへ挿入する。ファイル名はURLのbasename。 */
  async insertFdFromUrl(e, t) {
    let n;
    try {
      n = await fetch(t);
    } catch (a) {
      throw new Error(`failed to fetch ${t}: ${String(a)} (CORSでブロックされている可能性があります)`);
    }
    if (!n.ok)
      throw new Error(`failed to fetch ${t}: HTTP ${n.status} (CORSでブロックされている可能性があります)`);
    const o = new Uint8Array(await n.arrayBuffer()), i = Vt(t);
    return await this.insertFd(e, { name: i, bytes: o }, t, t), { name: i };
  }
  /** IndexedDBのディスクライブラリからsourceKeyで指定したイメージをFDドライブへ挿入する。 */
  async insertFdFromLibraryKey(e, t) {
    const n = await D(t);
    if (!n) throw new Error(`no library entry found for sourceKey: ${t}`);
    const o = n.name;
    return await this.insertFd(e, { name: o, bytes: new Uint8Array(n.bytes) }, t, n.url), { name: o };
  }
  /** 未フォーマットの空FDを生成してFDドライブへ挿入する。 */
  async insertBlankFd(e) {
    const t = this.createBlankFd();
    return await this.insertFd(e, t, `file:${t.name}:${t.bytes.length}`), { name: t.name };
  }
  /**
   * マウント中イメージのバイト列をbase64で返す。5MBを超える場合はErrorを投げる
   * (HDDイメージなど巨大なものはUIのダウンロードボタンを使うよう案内する)。
   */
  async exportDiskBase64(e) {
    if (!this.fs) throw new Error("not booted");
    const t = this.mounted.get(e);
    if (!t) throw new Error(`no image mounted in ${e}`);
    const n = O(this.fs, t.name), o = 5 * 1024 * 1024;
    if (n.length > o)
      throw new Error(
        `image too large to export as base64 (${n.length} bytes > 5MB). 大きすぎるためUIのダウンロードボタンを使うこと`
      );
    let i = "";
    const a = 8192;
    for (let d = 0; d < n.length; d += a) {
      const l = n.subarray(d, d + a);
      i += String.fromCharCode(...l);
    }
    const c = btoa(i);
    return { name: t.name, base64: c, size: n.length };
  }
  /**
   * コアを起動する。config には hdd/fd1/fd2 の由来情報 (sourceKey/url) を渡す。
   */
  async boot(e) {
    var o;
    const t = [];
    e.fd1 && t.push({ slot: "fd1", ...e.fd1 }), e.fd2 && t.push({ slot: "fd2", ...e.fd2 });
    const n = {
      hdd: (o = e.hdd) == null ? void 0 : o.file,
      fds: t.map((i) => i.file),
      latencyMs: e.latencyMs,
      extMemMB: e.extMemMB,
      clkMult: e.clkMult,
      roms: e.roms
    };
    try {
      const i = await Qe(n, this.canvas);
      this.fs = i, this.mounted.clear(), e.hdd && this.mounted.set("hdd", {
        slot: "hdd",
        name: e.hdd.file.name,
        sourceKey: e.hdd.sourceKey,
        url: e.hdd.url,
        lastSavedStat: e.hdd.alreadyPersisted ? H(i, e.hdd.file.name) ?? void 0 : void 0
      });
      for (const a of t)
        this.mounted.set(a.slot, {
          slot: a.slot,
          name: a.file.name,
          sourceKey: a.sourceKey,
          url: a.url,
          lastSavedStat: a.alreadyPersisted ? H(i, a.file.name) ?? void 0 : void 0
        });
      this.startPersistLoop(), await this.restoreStateIfPresent(), this.emit("booted", { fs: i });
    } catch (i) {
      const a = i instanceof Error ? i : new Error(String(i));
      throw this.emit("bootError", { error: a }), a;
    }
  }
  startPersistLoop() {
    this.stopPersistLoop(), this.persistTimer = setInterval(() => {
      this.persistNow();
    }, zt), document.addEventListener("visibilitychange", this.boundOnVisibilityChange), window.addEventListener("pagehide", this.boundOnPageHide);
  }
  stopPersistLoop() {
    this.persistTimer !== null && (clearInterval(this.persistTimer), this.persistTimer = null), document.removeEventListener("visibilitychange", this.boundOnVisibilityChange), window.removeEventListener("pagehide", this.boundOnPageHide);
  }
  onVisibilityChange() {
    document.hidden && this.persistNow();
  }
  /** マウント中の各イメージのうち変化したものだけ IndexedDB へ保存する。 */
  async persistNow() {
    if (this.fs && !this.persisting) {
      this.persisting = !0;
      try {
        await this.persistNowInner();
      } finally {
        this.persisting = !1;
      }
    }
  }
  async persistNowInner() {
    if (!this.fs) return;
    const e = performance.now();
    let t = 0;
    for (const o of this.mounted.values())
      try {
        const i = H(this.fs, o.name);
        if (i && o.lastSavedStat && i.mtimeMs === o.lastSavedStat.mtimeMs && i.size === o.lastSavedStat.size)
          continue;
        const a = O(this.fs, o.name);
        if (!i && !this.hasChanged(o, a)) continue;
        await yt({
          sourceKey: o.sourceKey,
          url: o.url,
          name: o.name,
          bytes: a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength),
          savedAt: Date.now()
        }), t += a.byteLength, o.lastSavedSnapshot = this.snapshotOf(a), o.lastSavedStat = i ?? void 0, this.emit("persisted", { slot: o.slot, name: o.name });
      } catch (i) {
        this.emit("log", {
          level: "error",
          message: `persist failed for ${o.name}: ${String(i)}`
        });
      }
    const n = performance.now() - e;
    n > 50 && this.emit("log", {
      level: "info",
      message: `persist took ${n.toFixed(0)}ms (${(t / 1048576).toFixed(1)}MB written)`
    });
  }
  snapshotOf(e) {
    const t = e.slice(0, Math.min($e, e.length)), n = e.slice(Math.max(0, e.length - $e));
    return { length: e.length, head: t, tail: n };
  }
  hasChanged(e, t) {
    const n = e.lastSavedSnapshot;
    if (!n || n.length !== t.length) return !0;
    const o = this.snapshotOf(t);
    return !Le(n.head, o.head) || !Le(n.tail, o.tail);
  }
  /** 現在のイメージをダウンロードさせる。 */
  async exportDisk(e) {
    if (!this.fs) throw new Error("not booted");
    const t = this.mounted.get(e);
    if (!t) throw new Error(`no image mounted in ${e}`);
    const n = O(this.fs, t.name), o = new Blob([n.slice()], { type: "application/octet-stream" }), i = URL.createObjectURL(o);
    try {
      const a = document.createElement("a");
      a.href = i, a.download = t.name, document.body.appendChild(a), a.click(), a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(i), 1e4);
    }
  }
  /** IndexedDB の保存を削除し、ページをリロードして配布元から再フェッチさせる。 */
  async resetToOriginal(e) {
    const t = this.mounted.get(e);
    if (!t) throw new Error(`no image mounted in ${e}`);
    await Et(t.sourceKey), location.reload();
  }
  /** canvas をフルスクリーン表示する。 */
  async fullscreen() {
    this.canvas.requestFullscreen && await this.canvas.requestFullscreen();
  }
  /** マシンをリセットする (pccore_cfgupdate + pccore_reset)。 */
  resetMachine() {
    if (!this.fs) throw new Error("not booted");
    et();
  }
  /**
   * 実行中の FD ドライブへイメージを挿入する。既存スロットがマウント中なら先に永続化してから差し替える。
   * IndexedDB に同 sourceKey の保存があればそちらを優先ロードする（前回の続き優先）。
   */
  async insertFd(e, t, n, o) {
    if (!this.fs) throw new Error("not booted");
    const i = e === 1 ? "fd1" : "fd2";
    this.mounted.has(i) && await this.persistNow();
    let a = t.bytes, c = t.name;
    const d = await D(n);
    d && (a = new Uint8Array(d.bytes), c = d.name), this.fs.writeFile(`/disk/${c}`, a), B(e - 1, `/disk/${c}`), this.mounted.set(i, {
      slot: i,
      name: c,
      sourceKey: n,
      url: o,
      lastSavedSnapshot: void 0,
      lastSavedStat: d ? H(this.fs, c) ?? void 0 : void 0
    }), this.emit("fdChanged", { drive: e, name: c });
  }
  /** 実行中の FD ドライブからイメージを排出する。 */
  async ejectFd(e) {
    if (!this.fs) throw new Error("not booted");
    const t = e === 1 ? "fd1" : "fd2";
    this.mounted.has(t) && await this.persistNow(), B(e - 1, ""), this.mounted.delete(t), this.emit("fdChanged", { drive: e, name: void 0 });
  }
  /** 'fd1'|'fd2' 以外(hdd等)が渡された場合にErrorを投げる。FAT操作はFDのみ対応。 */
  assertFdSlot(e) {
    if (e !== "fd1" && e !== "fd2")
      throw new P("hddSlotUnsupported", `HDDは未対応です(fd1/fd2のみ): ${e}`);
  }
  /** 指定スロットにマウント中のイメージ名を返す。マウントが無ければError。 */
  getSlotImageName(e) {
    this.assertFdSlot(e);
    const t = this.mounted.get(e);
    if (!t) throw new Error(`no image mounted in ${e}`);
    return t.name;
  }
  /** MEMFS上のディスクイメージを読み出し FAT ボリュームとして開く。 */
  openSlotFat(e) {
    if (!this.fs) throw new Error("not booted");
    const t = this.getSlotImageName(e), n = O(this.fs, t), o = ke(n, t);
    return { name: t, image: n, vol: o };
  }
  /**
   * FAT操作で書き換えたイメージをMEMFSへ書き戻し、DOSのディスクキャッシュを捨てさせるために
   * 排出→再挿入(メディア交換)を行ってからIndexedDBへ永続化する。
   * ゲストがそのドライブへアクセス中に呼ぶとゲスト側のI/Oと競合し得るため、
   * MCPツールの説明では「ゲストが書き込み中でないタイミングで実行すること」と案内している。
   */
  async writeBackSlotImage(e, t, n) {
    if (!this.fs) throw new Error("not booted");
    const o = e === "fd1" ? 1 : 2;
    this.fs.writeFile(`/disk/${t}`, n), B(o - 1, ""), await this.sleep(100), B(o - 1, `/disk/${t}`), await this.persistNow();
  }
  /** FD内のFAT12/16ディスクイメージのファイル一覧と空き容量を返す。path省略時はルート。 */
  async diskListFiles(e, t = "") {
    const { vol: n } = this.openSlotFat(e), o = Te(n, t), { free: i, total: a } = De(n);
    return { entries: o, free: i, total: a };
  }
  /** FD内のFAT12/16ディスクイメージからファイルを読み出す。 */
  async diskReadFile(e, t) {
    const { vol: n } = this.openSlotFat(e);
    return Ce(n, t);
  }
  /** FD内のFAT12/16ディスクイメージへファイルを書き込む(新規作成/上書き)。 */
  async diskWriteFile(e, t, n) {
    const { name: o, image: i, vol: a } = this.openSlotFat(e);
    Fe(a, t, n), await this.writeBackSlotImage(e, o, i);
  }
  /** FD内のFAT12/16ディスクイメージからファイルを削除する。 */
  async diskDeleteFile(e, t) {
    const { name: n, image: o, vol: i } = this.openSlotFat(e);
    _e(i, t), await this.writeBackSlotImage(e, n, o);
  }
  /** FD内のFAT12/16ディスクイメージにディレクトリを作成する(ファイルマネージャUI向け)。 */
  async diskMakeDir(e, t) {
    const { name: n, image: o, vol: i } = this.openSlotFat(e);
    Pe(i, t), await this.writeBackSlotImage(e, n, o);
  }
  /** sourceKey が現在いずれかのスロットにマウント中かどうかを返す。 */
  isSourceKeyMounted(e) {
    for (const t of this.mounted.values())
      if (t.sourceKey === e) return !0;
    return !1;
  }
  /** IndexedDB上のライブラリイメージを読み出し FAT ボリュームとして開く。 */
  async openLibraryFat(e) {
    const t = await D(e);
    if (!t) throw new Error(`no library entry found for sourceKey: ${e}`);
    const n = new Uint8Array(t.bytes), o = ke(n, t.name);
    return { stored: t, image: n, vol: o };
  }
  /** 変更系ライブラリ操作の前提チェック(マウント中/起動後HDD)。問題があればErrorを投げる。 */
  assertLibraryWritable(e, t) {
    if (this.isSourceKeyMounted(e))
      throw new P("mountedUseSlotApi", "マウント中のイメージはスロット側APIを使ってください");
    if (Be(t) === "hdd" && this.isBooted())
      throw new P("hddEditBeforeBootOnly", "HDDイメージの編集は起動前のみ可能です");
  }
  /** ライブラリ(未マウント)イメージ内のファイル一覧と空き容量を返す。マウント中でも読み取りは許可する。 */
  async libraryListFiles(e, t = "") {
    const { vol: n } = await this.openLibraryFat(e), o = Te(n, t), { free: i, total: a } = De(n);
    return { entries: o, free: i, total: a };
  }
  /** ライブラリ(未マウント)イメージ内のファイルを読み出す。マウント中でも読み取りは許可する。 */
  async libraryReadFile(e, t) {
    const { vol: n } = await this.openLibraryFat(e);
    return Ce(n, t);
  }
  /** ライブラリ(未マウント)イメージへファイルを書き込み、IndexedDBへ書き戻す。 */
  async libraryWriteFile(e, t, n) {
    const { stored: o, image: i, vol: a } = await this.openLibraryFat(e);
    this.assertLibraryWritable(e, o.name), Fe(a, t, n), await this.putLibraryImage(o, i);
  }
  /** ライブラリ(未マウント)イメージからファイルを削除し、IndexedDBへ書き戻す。 */
  async libraryDeleteFile(e, t) {
    const { stored: n, image: o, vol: i } = await this.openLibraryFat(e);
    this.assertLibraryWritable(e, n.name), _e(i, t), await this.putLibraryImage(n, o);
  }
  /** ライブラリ(未マウント)イメージ内にディレクトリを作成し、IndexedDBへ書き戻す。 */
  async libraryMakeDir(e, t) {
    const { stored: n, image: o, vol: i } = await this.openLibraryFat(e);
    this.assertLibraryWritable(e, n.name), Pe(i, t), await this.putLibraryImage(n, o);
  }
  /** 変更後のライブラリイメージ全体をIndexedDBへ書き戻す。 */
  async putLibraryImage(e, t) {
    await L({
      ...e,
      bytes: t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength),
      savedAt: Date.now()
    });
  }
  /**
   * FD経由のゲスト転送に使うFDが指定ドライブに無ければ、同梱のツールFD(FAT12フォーマット済み)を
   * 挿入して用意する。ブランクFD(insertBlankFd)は未フォーマットでFATとして使えないため使わない。
   * 既にマウント中ならそのイメージ名をそのまま返す(挿入しない)。
   */
  async ensureTransferFd(e) {
    const t = e === 1 ? "fd1" : "fd2", n = this.mounted.get(t);
    if (n) return n.name;
    const { name: o } = await this.insertFdFromUrl(e, "./tools/webnp2tools.xdf");
    return o;
  }
  /** FDドライブ番号からゲスト側ドライブレターを推定する(HDD起動時の既定: FD1='B:', FD2='C:')。 */
  guestDriveLetter(e) {
    return Ot[e];
  }
  /**
   * ホストのテキスト/バイナリを、転送用FD経由でゲストの任意ドライブへ配置する。
   * 手順: (1) 転送用FDを用意 (2) FDへホストデータを書き込み (3) ゲストでCOPYを実行
   * (4) 画面に出る結果文字列で成功/失敗を判定する。HDDをホストが直接書き換えないため、
   * DOSのディスクキャッシュと衝突する危険を避けられる。
   * opts.path はゲスト側の宛先フルパス(例 "A:\\WORK\\FOO.TXT")。ファイル名は8.3形式のみ。
   */
  async putFileToGuest(e) {
    if (!this.isBooted()) throw new Error("not booted");
    const t = e.drive ?? 1, n = t === 1 ? "fd1" : "fd2", o = Ae(e.path);
    await this.ensureTransferFd(t);
    let i;
    if (e.bytes !== void 0)
      i = e.bytes;
    else if (e.content !== void 0)
      i = Bt(e.content).bytes;
    else
      throw new Error("putFileToGuest: specify content or bytes");
    await this.diskWriteFile(n, o, i);
    const a = this.guestDriveLetter(t), c = await this.runGuestCopy(`COPY ${a}\\${o} ${e.path}`, e.timeoutMs);
    return c.ok ? { ok: !0, message: "ゲストへのコピーに成功しました", screen: c.screen } : { ok: !1, message: c.message, screen: c.screen };
  }
  /**
   * ゲストで COPY を実行し、完了(または失敗)を画面から判定する。
   * 上書き確認が出たら自動で Yes と答える。答えないとゲストが入力待ちのまま
   * 止まり、以降の操作がすべて詰まってしまうため。
   */
  async runGuestCopy(e, t) {
    const n = this.countPatterns(this.getScreenText().text);
    await this.typeText(`${e}
`);
    const o = Date.now() + Math.min(Math.max(t ?? 8e3, 1e3), 6e4);
    let i = !1;
    for (; ; ) {
      await this.sleep(400);
      const a = this.getScreenText().text, c = Rt(a), d = this.countPatterns(a);
      if (d.error > n.error)
        return { ok: !1, message: "コピーに失敗しました(ゲスト側エラー)", screen: c };
      if (d.success > n.success)
        return { ok: !0, message: "コピーに成功しました", screen: c };
      if (!i && d.overwrite > n.overwrite) {
        i = !0, await this.typeText(`y
`);
        continue;
      }
      if (Date.now() >= o)
        return { ok: !1, message: "コピー結果を確認できませんでした", screen: c };
    }
  }
  /** 画面テキスト中の判定用パターンの出現回数を数える。 */
  countPatterns(e) {
    const t = (n) => n.reduce((o, i) => o + e.split(i).length - 1, 0);
    return {
      success: t(It),
      error: t(Nt),
      overwrite: t(Ut)
    };
  }
  /**
   * ゲストの任意ドライブ上のファイルを、転送用FD経由でホストへ取り出す。
   * 手順: (1) 転送用FDを用意 (2) ゲストでCOPY実行 (3) 結果文字列判定
   * (4) ゲストの書き込みがMEMFS上のイメージへ反映されるのを少し待ってからホストがFATを読む。
   */
  async getFileFromGuest(e) {
    if (!this.isBooted()) throw new Error("not booted");
    const t = e.drive ?? 1, n = t === 1 ? "fd1" : "fd2", o = Ae(e.path);
    await this.ensureTransferFd(t);
    try {
      await this.diskDeleteFile(n, o);
    } catch {
    }
    const i = this.guestDriveLetter(t), a = await this.runGuestCopy(`COPY ${e.path} ${i}\\`, e.timeoutMs), c = a.screen;
    if (!a.ok)
      return { ok: !1, message: a.message, screen: c };
    await this.sleep(500);
    try {
      const d = await this.diskReadFile(n, o);
      if ((e.encoding ?? "text") === "base64")
        return {
          ok: !0,
          message: "ゲストからの取得に成功しました",
          screen: c,
          base64: ve(d),
          size: d.length
        };
      const l = new TextDecoder("shift_jis").decode(d);
      return { ok: !0, message: "ゲストからの取得に成功しました", screen: c, text: l, size: d.length };
    } catch (d) {
      return { ok: !1, message: `FD上のファイル読み取りに失敗しました: ${String(d)}`, screen: c };
    }
  }
  /** セーブ用の未フォーマット1.25MB(2HD)ベタイメージを生成する。DOS側でFORMATが必要。 */
  createBlankFd() {
    const e = new Set(Array.from(this.mounted.values()).map((n) => n.name));
    let t = "blank.xdf";
    for (let n = 2; e.has(t); n++)
      t = `blank${n}.xdf`;
    return { name: t, bytes: new Uint8Array($t) };
  }
  primaryEntry() {
    return this.mounted.get("hdd") ?? this.mounted.get("fd1") ?? this.mounted.get("fd2");
  }
  /** 現在の実行状態を statsave しIndexedDBへ保存する。キーは主ディスク(hdd→fd1→fd2)のsourceKeyから決める。 */
  async saveState() {
    if (!this.fs) throw new Error("not booted");
    const e = this.primaryEntry();
    if (!e) {
      this.emit("log", { level: "error", message: "saveState: no mounted image to key the state by" });
      return;
    }
    const t = ue(_);
    if (t < 0) {
      this.emit("log", { level: "error", message: `saveState failed (rc=${t})` });
      return;
    }
    t !== 0 && this.emit("log", { level: "info", message: `saveState finished with warnings (rc=${t})` });
    const n = this.fs.readFile(_, { encoding: "binary" });
    await L({
      sourceKey: `state:${e.sourceKey}`,
      name: "state0.sav",
      bytes: n.buffer.slice(n.byteOffset, n.byteOffset + n.byteLength),
      savedAt: Date.now()
    }), this.emit("stateSaved", {});
  }
  /** IndexedDBに保存済みのステートがあればMEMFSへ書き戻してからロードする。 */
  async loadState() {
    if (!this.fs) throw new Error("not booted");
    const e = this.primaryEntry();
    if (!e) {
      this.emit("log", { level: "error", message: "loadState: no mounted image to key the state by" });
      return;
    }
    if (!this.fs.analyzePath(_).exists) {
      const n = await D(`state:${e.sourceKey}`);
      if (!n) {
        this.emit("log", { level: "error", message: "loadState: no saved state found" });
        return;
      }
      this.fs.writeFile(_, new Uint8Array(n.bytes));
    }
    const t = fe(_);
    if (t < 0) {
      this.emit("log", { level: "error", message: `loadState failed (rc=${t})` });
      return;
    }
    t !== 0 && this.emit("log", { level: "info", message: `loadState finished with warnings (rc=${t})` }), this.emit("stateLoaded", {});
  }
  validateSlot(e) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(e))
      throw new Error(`invalid slot name: ${e}`);
    return e;
  }
  /** 名前付きスロットへ現在の実行状態を statsave し保存する。キーは `state:<主ディスクsourceKey>:<slot>`。 */
  async saveStateSlot(e) {
    if (!this.fs) throw new Error("not booted");
    const t = this.validateSlot(e), n = this.primaryEntry();
    if (!n) {
      this.emit("log", { level: "error", message: "saveStateSlot: no mounted image to key the state by" });
      return;
    }
    const o = `/state_${t}.sav`, i = ue(o);
    if (i < 0) {
      this.emit("log", { level: "error", message: `saveStateSlot(${t}) failed (rc=${i})` });
      return;
    }
    i !== 0 && this.emit("log", { level: "info", message: `saveStateSlot(${t}) finished with warnings (rc=${i})` });
    const a = this.fs.readFile(o, { encoding: "binary" });
    await L({
      sourceKey: `state:${n.sourceKey}:${t}`,
      name: `state_${t}.sav`,
      bytes: a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength),
      savedAt: Date.now()
    }), this.emit("stateSaved", {});
  }
  /** 名前付きスロットからIndexedDBに保存済みのステートをMEMFSへ書き戻してロードする。 */
  async loadStateSlot(e) {
    if (!this.fs) throw new Error("not booted");
    const t = this.validateSlot(e), n = this.primaryEntry();
    if (!n) {
      this.emit("log", { level: "error", message: "loadStateSlot: no mounted image to key the state by" });
      return;
    }
    const o = `/state_${t}.sav`, i = await D(`state:${n.sourceKey}:${t}`);
    if (!i) {
      this.emit("log", { level: "error", message: `loadStateSlot: no saved state found for slot "${t}"` });
      return;
    }
    this.fs.writeFile(o, new Uint8Array(i.bytes));
    const a = fe(o);
    if (a < 0) {
      this.emit("log", { level: "error", message: `loadStateSlot(${t}) failed (rc=${a})` });
      return;
    }
    a !== 0 && this.emit("log", { level: "info", message: `loadStateSlot(${t}) finished with warnings (rc=${a})` }), this.emit("stateLoaded", {});
  }
  /** 保存済みのステートスロット一覧を、保存日時の新しい順で返す。 */
  async listStateSlots() {
    const e = this.primaryEntry();
    if (!e) return [];
    const t = `state:${e.sourceKey}:`;
    return (await pt(t)).map((o) => ({ slot: o.sourceKey.slice(t.length), savedAt: o.savedAt })).sort((o, i) => i.savedAt - o.savedAt);
  }
  /**
   * 画面テキストが変化し、その後 stableMs の間変化が止まるまで待つ。
   * ロード完了やコマンド終了検出など、待つべき文字列が未知な場合に固定sleepの代わりに使う。
   * stableMs は既定800ms(最大5000ms)、timeoutMs は既定15000ms(最大60000ms)にクランプ。
   * 一度も変化が無いままタイムアウトした場合は changed:false を返す。
   */
  async waitScreenChange(e) {
    if (!this.isBooted()) throw new Error("not booted");
    const t = Math.min(Math.max((e == null ? void 0 : e.stableMs) ?? 800, 0), 5e3), n = Math.min(Math.max((e == null ? void 0 : e.timeoutMs) ?? 15e3, 0), 6e4), o = Date.now();
    let a = this.getScreenText().text, c = !1, d = Date.now();
    for (; ; ) {
      const l = Date.now();
      if (c) {
        if (l - d >= t)
          return { changed: !0, text: a };
        if (l - o >= n)
          return { changed: !0, text: a };
      } else if (l - o >= n)
        return { changed: !1, text: a };
      await this.sleep(200);
      const u = this.getScreenText().text;
      u !== a && (c = !0, d = Date.now()), a = u;
    }
  }
  /** テキストVRAMを読み出し、SJISデコード済みの画面テキストとカーソル位置を返す。 */
  getScreenText() {
    const e = it(), t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = e[0], o = e[1], i = t.getInt16(2, !0), a = [], c = new TextDecoder("shift_jis");
    let d = 0;
    for (let l = 0; l < o; l++) {
      const u = [];
      let f = !1;
      for (let m = 0; m < n; m++) {
        const h = 4 + d * 2, b = t.getUint16(h, !0);
        if (d++, b === 0) {
          if (f) {
            f = !1;
            continue;
          }
          u.push(46);
          continue;
        }
        const E = b >> 8;
        if (b <= 255) {
          b >= 32 && b <= 126 || b >= 161 && b <= 223 ? u.push(b) : u.push(46), f = !1;
          continue;
        }
        if (E >= 33) {
          const p = E, F = b & 255, Ve = (p + 1 >> 1) + (p < 95 ? 112 : 176), Ge = F + (p & 1 ? F < 96 ? 31 : 32 : 126);
          u.push(Ve & 255, Ge & 255), f = !0;
          continue;
        }
        u.push(46), f = !1;
      }
      const w = c.decode(new Uint8Array(u)).trimEnd();
      a.push(w);
    }
    return {
      text: a.join(`
`),
      lines: a,
      cursor: i >= 0 ? { row: Math.floor(i / n), col: i % n } : null
    };
  }
  /**
   * デバッグ/解析用。PC-98メインRAMの[addr, addr+len)をBase64文字列で取得する。
   * 範囲チェックはcoreReadMemory側(0<=addr, addr+len<=メインRAMサイズ)で行う。
   */
  readMemoryBase64(e, t) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = at(e, t);
    return { addr: e, len: t, base64: ve(n) };
  }
  /** デバッグ用にPC-98メインRAMへ書き込む。CPU停止中の利用を前提とする。 */
  writeMemoryBase64(e, t) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = Lt(t);
    return ct(e, n), { addr: e, len: n.byteLength };
  }
  /** PC-98スキャンコードを1回注入する。 */
  sendKey(e, t) {
    if (!this.isBooted()) throw new Error("not booted");
    x(e, t);
  }
  sleep(e) {
    return new Promise((t) => setTimeout(t, e));
  }
  /**
   * バスマウスの相対移動を、コアが一度に飲み込める量(±64)に分割して送る。
   * 各ステップ後、コアが移動量を消費し切る(webnp2_mouse_pending()が0になる)まで
   * 最大300ms待つ(10ms間隔)。ゲスト側がマウスを読まないソフトでハングしないよう、
   * 0にならなくても諦めて次のステップへ進む。
   */
  async mouseStep(e, t) {
    const o = Math.max(Math.ceil(Math.abs(e) / 64), Math.ceil(Math.abs(t) / 64), e === 0 && t === 0 ? 0 : 1);
    for (let i = 0; i < o; i++) {
      const a = o - i, c = Math.trunc(e / a), d = Math.trunc(t / a);
      e -= c, t -= d, tt(c, d);
      const l = Date.now();
      for (; rt() !== 0 && Date.now() - l < 300; )
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
  async mouseMoveTo(e, t) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = Math.min(Math.max(Math.round(e), 0), 639), o = Math.min(Math.max(Math.round(t), 0), 399);
    this.mousePos || await this.mouseHome();
    const i = this.mousePos;
    return await this.mouseStep(n - i.x, o - i.y), this.mousePos = { x: n, y: o }, this.mousePos;
  }
  /** 現在のホスト側推定マウス位置を返す。未ホーミングなら null。 */
  getMousePosition() {
    return this.mousePos;
  }
  /**
   * マウスクリックを送る。x,y指定があれば先に mouseMoveTo する。
   * button既定は'left'、count既定1(最大3、ダブル/トリプルクリック用)。
   */
  async mouseClick(e) {
    if (!this.isBooted()) throw new Error("not booted");
    (e == null ? void 0 : e.x) !== void 0 && (e == null ? void 0 : e.y) !== void 0 && await this.mouseMoveTo(e.x, e.y);
    const t = (e == null ? void 0 : e.button) === "right" ? 1 : 0, n = Math.min(Math.max((e == null ? void 0 : e.count) ?? 1, 1), 3);
    for (let o = 0; o < n; o++)
      z(t, 1), await this.sleep(80), z(t, 0), o < n - 1 && await this.sleep(120);
  }
  /** from から to へドラッグする(移動→押下→移動→解放)。button既定'left'。 */
  async mouseDrag(e, t, n) {
    if (!this.isBooted()) throw new Error("not booted");
    const o = n === "right" ? 1 : 0;
    await this.mouseMoveTo(e.x, e.y), z(o, 1), await this.sleep(100), await this.mouseMoveTo(t.x, t.y), await this.sleep(100), z(o, 0);
  }
  /**
   * 画面テキスト(getScreenText().lines)からneedleを含む位置(行・列)を検索する。
   * colは文字インデックス(全角文字を含む行でもlinesは既にデコード済み文字列のため)。
   * opts.all=falseまたは省略時は最初の1件のみ、trueなら全件を返す。大文字小文字は区別する。
   */
  findScreenText(e, t) {
    const { lines: n } = this.getScreenText(), o = [];
    if (e.length === 0) return o;
    for (let i = 0; i < n.length; i++) {
      const a = n[i];
      let c = 0;
      for (; ; ) {
        const d = a.indexOf(e, c);
        if (d < 0) break;
        if (o.push({ row: i, col: d, text: a }), !(t != null && t.all)) return o;
        c = d + e.length;
      }
    }
    return o;
  }
  /**
   * 画面テキスト中のneedleを見つけてクリックする。occurrence(既定0=最初)番目の一致を使う。
   * テキストセルサイズ(横8px×縦16px、80x25で640x400)から x = col*8+4, y = row*16+8 を計算する。
   * 見つからなければ found:false を返す。
   */
  async clickScreenText(e, t) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = (t == null ? void 0 : t.occurrence) ?? 0, i = this.findScreenText(e, { all: !0 })[n];
    if (!i)
      return { found: !1 };
    const a = i.col * 8 + 4, c = i.row * 16 + 8;
    return await this.mouseClick({ x: a, y: c, button: t == null ? void 0 : t.button }), { found: !0, x: a, y: c };
  }
  /**
   * '+'区切りのキーコンボ文字列("CTRL+C" 等)を修飾キーコード列とメインキーコードへ解決する。
   * 解決できない場合は Error を投げる。
   */
  resolveCombo(e) {
    const t = e.split("+").map((d) => d.trim());
    if (t.length === 0 || t.some((d) => d.length === 0))
      throw new Error(`invalid key combo: ${e}`);
    const n = t[t.length - 1], i = t.slice(0, -1).filter((d) => Object.prototype.hasOwnProperty.call(A, d.toUpperCase())).map((d) => A[d.toUpperCase()]);
    let a;
    const c = A[n.toUpperCase()];
    if (c !== void 0)
      a = c;
    else {
      const d = be(n);
      if (!d)
        throw new Error(`cannot resolve key: ${n}`);
      a = d.code;
    }
    return { modifierCodes: i, mainCode: a };
  }
  /**
   * "CTRL+C" や "ENTER" のようなキーコンボを送る。
   * '+'区切りの最後のトークンがメインキー、それ以前は修飾キー(NAMED_KEYSに存在するもののみ)。
   */
  async sendKeys(e) {
    if (!this.isBooted()) throw new Error("not booted");
    const { modifierCodes: t, mainCode: n } = this.resolveCombo(e);
    for (const o of t)
      x(o, !0), await this.sleep(30);
    x(n, !0), await this.sleep(30), x(n, !1), await this.sleep(30);
    for (const o of [...t].reverse())
      x(o, !1), await this.sleep(30);
  }
  /**
   * キー操作のマクロを順番に実行する(press/down/up/wait/text/paste)。
   * 長押し(holdMs指定のpress)や押しっぱなし→他操作→離す、といったキーシーケンスの再現に使う。
   * ステップ単体は最大10秒待ちにクランプ、シーケンス全体の累積待ち時間は60秒を超えるとErrorを投げる。
   * 例外発生時も、down で押しっぱなしのままのキーはすべて try/finally で自動的に up する。
   */
  async runKeySequence(e) {
    if (!this.isBooted()) throw new Error("not booted");
    const t = 1e4, n = 6e4, o = /* @__PURE__ */ new Set();
    let i = 0, a = 0;
    const c = async (u) => {
      const f = Math.min(Math.max(u, 0), t);
      if (i += f, i > n)
        throw new Error(`runKeySequence: total wait time exceeded ${n}ms limit`);
      await this.sleep(f);
    }, d = async (u) => {
      x(u, !0), o.add(u), await c(30);
    }, l = async (u) => {
      x(u, !1), o.delete(u), await c(30);
    };
    try {
      for (let u = 0; u < e.length; u++) {
        const f = e[u];
        try {
          switch (f.type) {
            case "press": {
              const { modifierCodes: w, mainCode: m } = this.resolveCombo(f.keys);
              for (const h of w) await d(h);
              await d(m), await c(f.holdMs ?? 30), await l(m);
              for (const h of [...w].reverse()) await l(h);
              break;
            }
            case "down": {
              const { modifierCodes: w, mainCode: m } = this.resolveCombo(f.keys);
              for (const h of w) await d(h);
              await d(m);
              break;
            }
            case "up": {
              const { modifierCodes: w, mainCode: m } = this.resolveCombo(f.keys);
              await l(m);
              for (const h of [...w].reverse()) await l(h);
              break;
            }
            case "wait": {
              await c(f.ms);
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
              const w = f;
              throw new Error(`unknown step type: ${JSON.stringify(w)}`);
            }
          }
        } catch (w) {
          const m = w instanceof Error ? w.message : String(w);
          throw new Error(`runKeySequence: step ${u} (${f.type}) failed: ${m}`);
        }
        a++;
      }
    } finally {
      for (const u of Array.from(o).reverse())
        x(u, !1), o.delete(u);
    }
    return { executed: a };
  }
  /** 文字列を1文字ずつキー入力として送る。解決できない文字はスキップしログ通知する。 */
  async typeText(e) {
    if (!this.isBooted()) throw new Error("not booted");
    for (const t of e) {
      const n = be(t);
      if (!n) {
        this.emit("log", { level: "info", message: `typeText: skipped unresolvable char ${JSON.stringify(t)}` });
        continue;
      }
      const { code: o, shift: i } = n;
      i ? (x(A.SHIFT, !0), await this.sleep(30), x(o, !0), await this.sleep(30), x(o, !1), await this.sleep(30), x(A.SHIFT, !1), await this.sleep(30)) : (x(o, !0), await this.sleep(30), x(o, !1), await this.sleep(30));
    }
  }
  /**
   * ホスト側からテキストを送信する。ゲスト常駐TSR(PASTE.COM)のメールボックスが
   * 見つかればそちら経由(TSR経路)、無ければ従来のキーバッファ直接注入(キーバッファ経路)
   * を自動的に使い分ける。
   */
  async pasteText(e) {
    if (!this.isBooted()) throw new Error("not booted");
    let t = -1;
    try {
      t = J();
    } catch {
      t = -1;
    }
    return t >= 0 ? this.pasteTextViaMailbox(t, e) : this.pasteTextViaKeyBuffer(e);
  }
  /**
   * TSR経路: SJISバイト列をメールボックスのリングバッファへ書き込む。
   * DOSが旧ハンドラ内で入力待ちブロック中だと次の入力要求まで読まれないため、
   * 書き込み後に空きが全量(255)へ戻っていなければCR(0x0D)を1つキーバッファへ送り、
   * 現在の入力待ちを完了させて次の要求でTSRに拾わせる。
   */
  async pasteTextViaMailbox(e, t) {
    const { units: n, skipped: o } = re(t), i = n.flat();
    me(e, 1);
    let a = 0;
    for (const c of i) {
      for (; !ot(e, c); )
        await this.sleep(20);
      a++;
    }
    return me(e, 0), await this.sleep(600), st(e) < 255 && he(13), { sent: a, skipped: o };
  }
  /**
   * キーバッファ経路(従来): SJISバイト列(1バイト=1エントリ、上位scan=0)を
   * PC-98キーボードBIOSリングバッファへ直接積む。ゲスト側FEP無しで全角文字を
   * 入力できる。バッファは16エントリしかないため、満杯時は20ms待って再試行する
   * バックプレッシャで長文を流す。
   */
  async pasteTextViaKeyBuffer(e) {
    const { units: t, skipped: n } = re(e);
    let o = 0, i = 0;
    for (const a of t) {
      for (; !(a.length === 2 ? nt(a[0], a[1]) : he(a[0])); )
        await this.sleep(20);
      o += a.length, i++, i % 4 === 0 && await this.sleep(10);
    }
    return { sent: o, skipped: n };
  }
  /**
   * 画面テキストに指定文字列が現れるまでポーリングして待つ。固定sleepの代わりに使う。
   * timeoutMs は 60000ms にクランプ。タイムアウト時は found:false と最後に読んだテキストを返す。
   */
  async waitScreenText(e, t = 1e4) {
    if (!this.isBooted()) throw new Error("not booted");
    const n = Math.min(Math.max(t, 0), 6e4), o = Date.now();
    let i = "";
    for (; ; ) {
      if (i = this.getScreenText().text, i.includes(e))
        return { found: !0, text: i };
      if (Date.now() - o >= n)
        return { found: !1, text: i };
      await this.sleep(200);
    }
  }
  /**
   * ゲストへペースト用TSR(PASTE.COM)入りツールFDを一時挿入し実行して、
   * 全角ペーストのTSR経路を有効化する。既に有効ならFD挿入せず即成功を返す。
   * mount管理には登録しない(一時挿入のため)。
   */
  async setupPasteHelper(e) {
    if (!this.fs) throw new Error("not booted");
    try {
      if (J() >= 0)
        return { ok: !0, message: "paste helper is already resident" };
    } catch {
    }
    const t = (e == null ? void 0 : e.drive) ?? 1, n = (e == null ? void 0 : e.command) ?? "b:paste";
    let o;
    try {
      const a = await fetch("./tools/webnp2tools.xdf");
      if (!a.ok)
        return { ok: !1, message: `failed to fetch webnp2tools.xdf (HTTP ${a.status})` };
      o = new Uint8Array(await a.arrayBuffer());
    } catch (a) {
      return { ok: !1, message: `failed to fetch webnp2tools.xdf: ${String(a)}` };
    }
    this.fs.writeFile("/disk/webnp2tools.xdf", o), B(t - 1, "/disk/webnp2tools.xdf"), await this.sleep(800), await this.typeText(`${n}
`);
    const i = Date.now();
    for (; ; ) {
      let a = -1;
      try {
        a = J();
      } catch {
        a = -1;
      }
      if (a >= 0)
        return { ok: !0, message: "paste helper is now resident" };
      if (Date.now() - i >= 8e3)
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
    const e = this.primaryEntry();
    if (e)
      try {
        const t = await D(`state:${e.sourceKey}`);
        t && !this.fs.analyzePath(_).exists && this.fs.writeFile(_, new Uint8Array(t.bytes));
      } catch (t) {
        this.emit("log", { level: "error", message: `restoreStateIfPresent failed: ${String(t)}` });
      }
  }
}
const Wt = [".thd", ".hdi", ".nhd", ".hdd"], jt = [".d88", ".fdi", ".xdf", ".dup", ".fdd", ".hdm"];
function Be(r) {
  const s = r.toLowerCase();
  return Wt.some((e) => s.endsWith(e)) ? "hdd" : jt.some((e) => s.endsWith(e)) ? "fd" : null;
}
function Vt(r) {
  try {
    const e = new URL(r, typeof location < "u" ? location.href : void 0).pathname, t = e.slice(e.lastIndexOf("/") + 1);
    return decodeURIComponent(t) || "disk.xdf";
  } catch {
    const s = r.split("?")[0].split("#")[0];
    return s.slice(s.lastIndexOf("/") + 1) || "disk.xdf";
  }
}
function Le(r, s) {
  if (r.length !== s.length) return !1;
  for (let e = 0; e < r.length; e++)
    if (r[e] !== s[e]) return !1;
  return !0;
}
function Qt(r) {
  return new Kt(r);
}
class Gt {
  constructor(s) {
    T(this, "pauseListeners", /* @__PURE__ */ new Set());
    T(this, "breakpointListeners", /* @__PURE__ */ new Set());
    this.target = s;
  }
  isBooted() {
    return this.target.isBooted();
  }
  setPaused(s) {
    this.target.dbgSetPaused(s);
    const e = { paused: this.target.dbgIsPaused() };
    for (const t of this.pauseListeners) t(e);
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
  disassemble(s, e, t) {
    return this.target.dbgDisasm(s, e, t);
  }
  setBreakpoint(s, e, t, n) {
    this.target.dbgSetBreakpoint(s, e, t, n);
  }
  runUntilBreakpoint(s) {
    const e = this.target.dbgRunUntilBreakpoint(s);
    if (e >= 0) {
      const t = { index: e, registers: this.readRegisters() };
      for (const n of this.breakpointListeners) n(t);
    }
    return e;
  }
  readMemory(s, e) {
    const t = atob(this.target.readMemoryBase64(s, e).base64);
    return Uint8Array.from(t, (n) => n.charCodeAt(0));
  }
  /** ゲストRAMへ書き込む。実行中CPUとの競合を避けるためpause中だけ許可する。 */
  writeMemory(s, e) {
    if (!this.isPaused()) throw new Error("writeMemory requires paused CPU");
    if (!(e instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
    let t = "";
    const n = 8192;
    for (let o = 0; o < e.length; o += n)
      t += String.fromCharCode(...e.subarray(o, o + n));
    this.target.writeMemoryBase64(s, btoa(t));
  }
  onPause(s) {
    return this.pauseListeners.add(s), () => this.pauseListeners.delete(s);
  }
  onBreakpoint(s) {
    return this.breakpointListeners.add(s), () => this.breakpointListeners.delete(s);
  }
}
function er(r) {
  return new Gt(r);
}
function g(r, s = {}) {
  const e = document.createElement(r);
  for (const [t, n] of Object.entries(s))
    t === "class" ? e.className = n : e.setAttribute(t, n);
  return e;
}
function $(r, s) {
  return (r >>> 0).toString(16).toUpperCase().padStart(s, "0");
}
function Yt(r, s) {
  return `${r & 65535}:${s >>> 0}`;
}
function tr(r, s) {
  const e = g("div", { class: "debugger-toolbar" }), t = g("button", { type: "button", "data-debugger-pause": "true" }), n = g("button", { type: "button", "data-debugger-step": "true" }), o = g("button", { type: "button", "data-debugger-step10": "true" }), i = g("button", { type: "button", "data-debugger-run": "true" }), a = g("button", { type: "button", class: "debugger-close-btn" });
  e.append(t, n, o, i, a), r.append(e);
  let c = s.labels, d = !1;
  const l = () => {
    t.textContent = d ? c.resume : c.pause, n.textContent = c.step, o.textContent = c.step10, i.textContent = c.runToBreakpoint, a.textContent = c.close;
  };
  return t.addEventListener("click", s.onPauseToggle), n.addEventListener("click", () => s.onStep(1)), o.addEventListener("click", () => s.onStep(10)), i.addEventListener("click", s.onRunToBreakpoint), a.addEventListener("click", s.onClose), l(), {
    update(u) {
      d = u.paused, t.disabled = !u.enabled, n.disabled = !u.enabled || !d, o.disabled = !u.enabled || !d, i.disabled = !u.enabled || !d || !u.hasBreakpoints, l();
    },
    setLabels(u) {
      c = u, l();
    },
    destroy() {
      e.remove();
    }
  };
}
const qt = [
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
], Xt = /* @__PURE__ */ new Set(["cs", "ds", "es", "ss", "fs", "gs"]), Zt = [["CF", 0], ["PF", 2], ["AF", 4], ["ZF", 6], ["SF", 7], ["TF", 8], ["IF", 9], ["DF", 10], ["OF", 11]];
function rr(r) {
  const s = g("div", { class: "debugger-register-grid" });
  r.append(s);
  let e;
  return {
    update(t) {
      s.replaceChildren();
      for (const n of qt) {
        const o = g("div", {
          class: e && e[n] !== t[n] ? "debugger-register changed" : "debugger-register",
          "data-debugger-register": n
        }), i = g("span", { class: "debugger-register-name" });
        i.textContent = n.toUpperCase();
        const a = g("span", { class: "debugger-register-value" });
        if (a.textContent = $(t[n], Xt.has(n) ? 4 : 8), o.append(i, a), n === "eflags") {
          const c = g("span", { class: "debugger-flags" });
          c.textContent = Zt.filter(([, d]) => (t.eflags & 1 << d) !== 0).map(([d]) => d).join(" ") || "—", o.append(c);
        }
        s.append(o);
      }
      e = { ...t };
    },
    destroy() {
      s.remove();
    }
  };
}
function nr(r, s) {
  const e = g("div", { class: "debugger-disasm-list" });
  r.append(e);
  let t = { addBreakpoint: s.addBreakpointLabel, removeBreakpoint: s.removeBreakpointLabel }, n;
  const o = ({ seg: i, eip: a, lines: c, breakpoints: d }) => {
    e.replaceChildren();
    for (const l of c) {
      const u = d.has(Yt(i, l.addr)), f = g("button", {
        type: "button",
        class: `debugger-disasm-row${l.addr === a ? " current" : ""}${u ? " breakpoint" : ""}`,
        "data-debugger-disasm-row": "true",
        "data-seg": String(i),
        "data-off": String(l.addr),
        "aria-label": u ? t.removeBreakpoint : t.addBreakpoint
      }), w = g("span", { class: "debugger-bp-marker", "aria-hidden": "true" });
      w.textContent = u ? "●" : "○";
      const m = g("span", { class: "debugger-disasm-address" });
      m.textContent = `${$(i, 4)}:${$(l.addr, 8)}`;
      const h = g("span", { class: "debugger-disasm-bytes" });
      h.textContent = l.bytes.map((E) => $(E, 2)).join(" ");
      const b = g("span", { class: "debugger-disasm-text" });
      b.textContent = l.text, f.append(w, m, h, b), f.addEventListener("click", () => s.onToggleBreakpoint(i, l.addr)), e.append(f);
    }
  };
  return {
    update(i) {
      n = i, o(i);
    },
    setLabels(i) {
      t = i, n && o(n);
    },
    destroy() {
      e.remove();
    }
  };
}
function sr(r, s) {
  const e = g("input", {
    type: "text",
    inputmode: "text",
    value: "00000000",
    class: "debugger-memory-address"
  }), t = g("button", { type: "button", class: "debugger-memory-read" }), n = g("div", { class: "debugger-memory-controls" });
  n.append(e, t);
  const o = g("div", { class: "debugger-memory-dump" });
  r.append(n, o);
  let i = s.labels;
  const a = () => {
    e.setAttribute("aria-label", i.address), t.textContent = i.read;
  }, c = () => {
    var f, w;
    const l = e.value.trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]+$/i.test(l)) {
      (f = s.onError) == null || f.call(s, i.invalidAddress);
      return;
    }
    const u = Number.parseInt(l, 16);
    try {
      d.update(u, s.onRead(u));
    } catch (m) {
      (w = s.onError) == null || w.call(s, m instanceof Error ? m.message : String(m));
    }
  };
  t.addEventListener("click", c), e.addEventListener("keydown", (l) => {
    l.key === "Enter" && c();
  });
  const d = {
    update(l, u) {
      o.replaceChildren();
      for (let f = 0; f < u.length; f += 16) {
        const w = u.subarray(f, f + 16), m = g("div", { class: "debugger-memory-row" }), h = g("span", { class: "debugger-memory-offset" });
        h.textContent = $(l + f, 8);
        const b = g("span", { class: "debugger-memory-hex" });
        b.textContent = Array.from(w, (p) => $(p, 2)).join(" ");
        const E = g("span", { class: "debugger-memory-ascii" });
        E.textContent = Array.from(w, (p) => p >= 32 && p <= 126 ? String.fromCharCode(p) : ".").join(""), m.append(h, b, E), o.append(m);
      }
    },
    read: c,
    setEnabled(l) {
      t.disabled = !l;
    },
    setLabels(l) {
      i = l, a();
    },
    destroy() {
      n.remove(), o.remove();
    }
  };
  return a(), d;
}
export {
  Gt as DebuggerController,
  Yt as breakpointKey,
  er as createDebugger,
  Qt as createWebNP2,
  Ce as fatReadFile,
  tr as mountDebuggerToolbar,
  nr as mountDisassemblyView,
  sr as mountMemoryDump,
  rr as mountRegisterView,
  ke as openDiskImage
};
