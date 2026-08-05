import { assembleWithFactory } from '../toolchain/assemble-core.mjs';
import { compileWithFactories } from '../toolchain/compile-core.mjs';
import { makeFd } from '../toolchain/makefd.mjs';

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

let cResourcesPromise;
const fetchBytes = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

async function loadCResources() {
  if (!cResourcesPromise) cResourcesPromise = (async () => {
    const entries = await Promise.all(HEADER_NAMES.map(async (name) => {
      const area = INCLUDE_HEADERS.has(name) ? 'include' : 'srclib';
      return [name, await fetchBytes(`../toolchain/smallerc-src/v0100/${area}/${name}`)];
    }));
    return {
      includeFiles: Object.fromEntries(entries),
      library: await fetchBytes('../toolchain/smlrc-wasm/lcds.a'),
    };
  })();
  return cResourcesPromise;
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
    result = await browserAssemble(source, { format: 'bin' });
    outputExtension = 'COM';
  } else if (extension === 'c') {
    const resources = await loadCResources();
    result = await compileWithFactories(source, resources, {
      createSmlrpp: smallerFactory('createSmlrpp'),
      createSmlrc: smallerFactory('createSmlrc'),
      createSmlrl: smallerFactory('createSmlrl'),
      assemble: browserAssemble,
    });
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
  return {
    ...result, dosName: `${name}.${outputExtension}`,
    fd: makeFd([{ name, ext: outputExtension, data: result.output }]),
  };
}
