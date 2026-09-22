import { assembleWithFactory } from '../toolchain/assemble-core.mjs';
import { compileWithFactories, compileToObjectWithFactories } from '../toolchain/compile-core.mjs';
import { parseListing } from '../toolchain/listing.mjs';
import { makeFd } from '../toolchain/makefd.mjs';
import { addHostdrv } from '../toolchain/hostdrv.mjs';
import { assembleDebugLoader } from './toolchain.js';

/** hostdrv経路でIDEがゲストへ渡す成果物をマウントするドライブ文字。AUTOEXEC.BATの常駐先と揃える。 */
export const HOSTDRV_DRIVE = 'D';

const HEADER_NAMES = [
  'assert.h', 'ctype.h', 'errno.h', 'fcntl.h', 'float.h', 'inttypes.h', 'iso646.h',
  'limits.h', 'locale.h', 'math.h', 'setjmp.h', 'signal.h', 'stdarg.h', 'stddef.h',
  'stdint.h', 'stdio.h', 'stdlib.h', 'string.h', 'time.h', 'unistd.h', 'dimports.h',
  'ictype.h', 'idos.h', 'idpmi.h', 'ifp.h', 'istdio.h', 'itime.h', 'iwin32.h', 'mm.h',
];
const INCLUDE_HEADERS = new Set([
  'assert.h', 'ctype.h', 'errno.h', 'fcntl.h', 'float.h', 'inttypes.h', 'iso646.h',
  'limits.h', 'locale.h', 'math.h', 'setjmp.h', 'signal.h', 'stdarg.h', 'stddef.h',
  'stdint.h', 'stdio.h', 'stdlib.h', 'string.h', 'time.h', 'unistd.h',
]);

export const LOADER_NAME = 'E0LOAD';

let cResourcesPromise;
let debugLoaderPromise;
let loaderOnlyFdPromise;

/** デバッガローダは対象と同じFDへ常に同梱する。実行・デバッグでFDを作り分けない。 */
function loadDebugLoader() {
  if (!debugLoaderPromise) {
    debugLoaderPromise = assembleDebugLoader().then((result) => result.output).catch((error) => {
      debugLoaderPromise = undefined;
      throw error;
    });
  }
  return debugLoaderPromise;
}

/**
 * hostdrv経路用: デバッグローダ(E0LOAD.COM)のバイト列だけを取り出す。
 * FD経路はbuildSource()のfdへ同梱済みだが、hostdrv経路はホスト側へ個別に
 * writeHostFile()する必要があるため公開する。キャッシュはloadDebugLoader()と共有する。
 */
export function getDebugLoaderBytes() {
  return loadDebugLoader();
}

/** FreeDOSのプリウォーム用に、ローダだけを収録したB:イメージを1度だけ生成する。 */
export function makeLoaderOnlyFd() {
  if (!loaderOnlyFdPromise) {
    loaderOnlyFdPromise = loadDebugLoader().then((loader) => makeFd([
      { name: LOADER_NAME, ext: 'COM', data: loader },
    ])).catch((error) => {
      loaderOnlyFdPromise = undefined;
      throw error;
    });
  }
  return loaderOnlyFdPromise;
}

const fetchBytes = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * hostdrv経路用: 同梱のFreeDOS(98)起動イメージ(freeDosBytes)のコピーへHOSTDRV.COMを
 * 追加し、AUTOEXEC.BATが起動直後にHOSTDRV_DRIVE(既定D:)へ常駐するようにする。
 * 既存のFD経由の経路(makeLoaderOnlyFd/buildSourceのfd)はここでは一切変更しない。
 */
export async function buildHostdrvBootImage(freeDosBytes) {
  const hostdrvCom = await fetchBytes('./freedos/HOSTDRV.COM.bin');
  return addHostdrv(freeDosBytes, hostdrvCom, { drive: HOSTDRV_DRIVE });
}

async function loadCResources() {
  if (!cResourcesPromise) cResourcesPromise = (async () => {
    const entries = await Promise.all(HEADER_NAMES.map(async (name) => {
      const area = INCLUDE_HEADERS.has(name) ? 'include' : 'srclib';
      // upstreamツリー(toolchain/smallerc-src/)は十数MBあり .gitignore しているため、
      // 実行時に要る29本だけを csrc/ へ複製して配布対象に含めている。
      // ここを smallerc-src/ へ戻すと手元では動くが公開サイトで404になる（実際に踏んだ）。
      return [name, await fetchBytes(`../toolchain/smlrc-wasm/csrc/${area}/${name}`)];
    }));
    return {
      includeFiles: Object.fromEntries(entries),
      library: await fetchBytes('../toolchain/smlrc-wasm/lcds.a'),
    };
  })();
  return cResourcesPromise;
}

let p98ResourcesPromise;

/**
 * p98lib(別リポジトリ。vendor/p98lib/ へ配信用にバイト単位コピーしている。
 * 経緯は vendor/p98lib/README.md参照)のビルドに要る資材をまとめて取得する。
 * C標準ヘッダ29本は loadCResources() のものをそのまま使い回し、p98.h/mag_assets.hを
 * 追加する。ライブラリは small用のlcds.aではなくhuge用のlcdh.a(p98libはhuge固定)。
 */
async function loadP98Resources() {
  if (!p98ResourcesPromise) p98ResourcesPromise = (async () => {
    const [cResources, p98Header, p98Source, p98AsmSource, magAssetsHeader, library] = await Promise.all([
      loadCResources(),
      fetchBytes('../vendor/p98lib/include/p98.h'),
      fetchBytes('../vendor/p98lib/src/p98.c'),
      fetchBytes('../vendor/p98lib/src/p98_asm.asm'),
      fetchBytes('../vendor/p98lib/samples/mag_assets.h'),
      fetchBytes('../toolchain/smlrc-wasm/lcdh.a'),
    ]);
    return {
      includeFiles: { ...cResources.includeFiles, 'p98.h': p98Header, 'mag_assets.h': magAssetsHeader },
      p98Source, p98AsmSource, library,
    };
  })();
  return p98ResourcesPromise;
}

// p98lib(huge model + p98.c/p98_asm.asmのリンクが要る別ライブラリ)を使っているかどうかの
// ヒューリスティックな判定。IDEはユーザーの.cソースの中身しか見えないため、
// #include "p98.h" があるかどうかで判断する。行頭に空白を許すが、コメント中の
// #include もこの判定に引っかかる(誤検出はビルドが通る側に倒れるだけで安全)。
const P98LIB_INCLUDE_PATTERN = /^\s*#\s*include\s*"p98\.h"/m;

/**
 * p98lib経路のビルド。p98lib/tools/build.mjs のNode版と同じ3段の手順を
 * ブラウザのwasm factory経由で行う:
 *   1. p98.c を単独でELFオブジェクト化(リンクしない)
 *   2. p98_asm.asm を単独でELFオブジェクトへアセンブル
 *   3. ユーザーの.cをコンパイルし、1.と2.をextraLinkInputsとしてリンク段で束ねる
 * p98.c/p98_asm.asm側の失敗はユーザーのコードの行番号ではないため、stageを
 * 'p98lib'/'nasm(p98lib)' として区別し、利用者が「自分のコードの行ではない」と
 * 分かるようにする。
 */
async function buildWithP98lib(source) {
  const resources = await loadP98Resources();

  const libObject = await compileToObjectWithFactories(resources.p98Source, {
    includeFiles: resources.includeFiles, model: 'huge',
  }, {
    createSmlrpp: smallerFactory('createSmlrpp'),
    createSmlrc: smallerFactory('createSmlrc'),
    assemble: browserAssemble,
  });
  if (!libObject.ok) {
    return { ok: false, errors: libObject.errors.map((error) => ({ ...error, stage: error.stage === 'nasm' ? 'nasm(p98lib)' : 'p98lib' })) };
  }

  const asmObject = await browserAssemble(resources.p98AsmSource, { format: 'elf', listing: true });
  if (!asmObject.ok) {
    return { ok: false, errors: asmObject.errors.map((error) => ({ ...error, stage: 'nasm(p98lib)' })) };
  }

  return compileWithFactories(source, {
    library: resources.library, includeFiles: resources.includeFiles, model: 'huge',
    extraLinkInputs: [
      { name: 'p98lib.o', bytes: libObject.object },
      { name: 'p98asm.o', bytes: asmObject.output },
    ],
  }, {
    createSmlrpp: smallerFactory('createSmlrpp'),
    createSmlrc: smallerFactory('createSmlrc'),
    createSmlrl: smallerFactory('createSmlrl'),
    assemble: browserAssemble,
  });
}

const nasmFactory = (options) => window.createNasm({
  ...options, locateFile: (name) => new URL(`../toolchain/nasm-wasm/${name}`, location.href).href,
});
const smallerFactory = (globalName) => (options) => window[globalName]({
  ...options, locateFile: (name) => new URL(`../toolchain/smlrc-wasm/${name}`, location.href).href,
});
const browserAssemble = (source, opts) => assembleWithFactory(source, opts, nasmFactory);

function dosName(path) {
  const file = path.split('/').at(-1) ?? 'PROGRAM';
  const stem = file.replace(/\.[^.]*$/, '').toUpperCase().replace(/[^A-Z0-9!#$%&'()\-@^_`{}~]/g, '_').slice(0, 8);
  return stem || 'PROGRAM';
}

export async function buildSource(path, text) {
  const extension = path.match(/\.([^.]+)$/)?.[1].toLowerCase();
  const source = new TextEncoder().encode(text);
  let result;
  let outputExtension;
  if (extension === 'asm') {
    result = await browserAssemble(source, { format: 'bin', listing: true });
    // listingは行→offsetマップ専用に読む。BIN出力バイト自体は listing 無しと同一である。
    if (result.ok) result = { ...result, map: parseListing(result.listing, result.output) };
    outputExtension = 'COM';
  } else if (extension === 'c') {
    if (P98LIB_INCLUDE_PATTERN.test(text)) {
      result = await buildWithP98lib(source);
    } else {
      const resources = await loadCResources();
      result = await compileWithFactories(source, resources, {
        createSmlrpp: smallerFactory('createSmlrpp'),
        createSmlrc: smallerFactory('createSmlrc'),
        createSmlrl: smallerFactory('createSmlrl'),
        assemble: browserAssemble,
      });
    }
    outputExtension = 'EXE';
  } else {
    return { ok: false, errors: [{ stage: 'input', line: 0, message: '対応拡張子は .asm / .c です' }] };
  }
  if (!result.ok) {
    // assemble APIは単段利用向けにline/messageだけを返す。IDEではCの4段結果と
    // 同じ表示契約に揃え、利用者が失敗したツールを判別できるようNASMを明記する。
    return extension === 'asm'
      ? { ...result, errors: result.errors.map((error) => ({ ...error, stage: 'nasm' })) }
      : result;
  }
  const name = dosName(path);
  const loader = await loadDebugLoader();
  return {
    ...result, dosName: `${name}.${outputExtension}`, kind: outputExtension,
    loaderName: `${LOADER_NAME}.COM`,
    fd: makeFd([
      { name: LOADER_NAME, ext: 'COM', data: loader },
      { name, ext: outputExtension, data: result.output },
    ]),
  };
}
