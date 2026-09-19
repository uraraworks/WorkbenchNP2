import { composeCSourceMap } from './c-source-map.mjs';
import { normalizeCrLfForPreprocessor, normalizeDosTextSource } from './dos-text.mjs';
import { parseMzHeader } from './mz.mjs';

function fallbackError(stage, stderr, exitCode) {
  const message = stderr.map(String).map((line) => line.trim()).filter(Boolean).join('\n');
  return [{ stage, line: 0, message: message || `${stage} exited with status ${exitCode}` }];
}

function parsePreprocessorErrors(stderr, exitCode) {
  const errors = [];
  for (const rawLine of stderr) {
    const match = String(rawLine).trim().match(/^(?:.*[\\/])?in\.c:\s*line\s+(\d+):\s*(.*)$/i);
    if (match) errors.push({ stage: 'smlrpp', line: Number(match[1]), message: match[2].trim() });
  }
  return errors.length > 0 ? errors : fallbackError('smlrpp', stderr, exitCode);
}

function parseCompilerErrors(stderr, exitCode) {
  const errors = [];
  for (let index = 0; index < stderr.length; index++) {
    const match = String(stderr[index]).trim()
      .match(/^Error in "(?:.*[\\/])?(?:in\.c|out\.i)"\s*\((\d+):(\d+)\)$/i);
    if (!match) continue;
    const detail = String(stderr[index + 1] ?? '').trim();
    errors.push({ stage: 'smlrc', line: Number(match[1]), column: Number(match[2]), message: detail || 'compilation failed' });
    if (detail) index++;
  }
  return errors.length > 0 ? errors : fallbackError('smlrc', stderr, exitCode);
}

function hasPreprocessorError(stderr) {
  return stderr.some((line) => /^(?:.*[\\/])?in\.c:\s*line\s+\d+:/i.test(String(line).trim()));
}

const AR_GLOBAL_HEADER = '!<arch>\n';
// ar(1)アーカイブの先頭メンバ名(グローバルヘッダ8バイト直後、16バイトのASCII名フィールド)は
// lcds.a/lcdh.aそれぞれで実際に生成した結果、c0ds.o/ と c0dh.o/ で始まることを
// `xxd toolchain/smlrc-wasm/lcds.a|lcdh.a`実測で確認済み。ファイル名や呼び出し側の
// 申告ではなく、渡されたバイト列そのものからモデルを判別してmodelとの取り違えを検出する。
const LIBRARY_FIRST_MEMBER_BY_MODEL = { small: 'c0ds.o', huge: 'c0dh.o' };

function detectLibraryModel(library) {
  const header = new TextDecoder('ascii').decode(library.subarray(0, 8));
  if (header !== AR_GLOBAL_HEADER) return null;
  const nameField = new TextDecoder('ascii').decode(library.subarray(8, 24));
  const name = nameField.trimEnd().replace(/\/$/, '');
  for (const [model, expected] of Object.entries(LIBRARY_FIRST_MEMBER_BY_MODEL)) {
    if (name === expected) return model;
  }
  return null;
}

function validateOptions(opts) {
  if (opts.includeFiles !== undefined && (opts.includeFiles === null
      || Array.isArray(opts.includeFiles) || typeof opts.includeFiles !== 'object')) {
    throw new TypeError('opts.includeFiles must be an object');
  }
  for (const [name, bytes] of Object.entries(opts.includeFiles ?? {})) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || !(bytes instanceof Uint8Array)) {
      throw new TypeError('includeFiles entries must have simple names and Uint8Array values');
    }
  }
  if (!(opts.library instanceof Uint8Array)) throw new TypeError('opts.library must be the lcds.a/lcdh.a Uint8Array');
  if (opts.model !== undefined && opts.model !== 'small' && opts.model !== 'huge') {
    throw new TypeError('opts.model must be "small" or "huge" when given');
  }
  const model = opts.model ?? 'small';
  const detected = detectLibraryModel(opts.library);
  if (detected !== null && detected !== model) {
    throw new TypeError(
      `opts.library appears to be the '${detected}' model library (first archive member `
      + `'${LIBRARY_FIRST_MEMBER_BY_MODEL[detected]}') but opts.model is '${model}'; `
      + `pass lcds.a for model:'small' or lcdh.a for model:'huge'`,
    );
  }
}

// smlrcc.c 1917-1959行相当: -doss/-dosh いずれも _DOS, __SMALLER_C__, char/wchar_tの
// 既定(signed char・unsigned wchar_t・16bit wchar_t)は共通。モデル別に変わるのは
// __SMALLER_C_16__/__SMALLER_C_32__+__HUGE__ の部分のみ(smlrcc.c 1915-1949行)。
const MODEL_MACROS = {
  small: ['__SMALLER_C_16__'],
  huge: ['__SMALLER_C_32__', '__HUGE__'],
};

async function preprocess(source, includeFiles, createSmlrpp, model) {
  const stderr = [];
  const module = await createSmlrpp({ print: () => {}, printErr: (line) => stderr.push(String(line)) });
  module.FS.writeFile('/in.c', source);
  const args = [
    '-U', '__STDC_VERSION__', '-zI', '-D', '_DOS', '-D', '__SMALLER_C__',
  ];
  for (const macro of MODEL_MACROS[model]) args.push('-D', macro);
  args.push(
    '-D', '__SMALLER_C_SCHAR__', '-D', '__SMALLER_C_UWCHAR__',
    '-D', '__SMALLER_C_WCHAR16__', '-D', '__SMALLER_PP__',
  );
  if (Object.keys(includeFiles).length > 0) {
    module.FS.mkdir('/include');
    for (const [name, bytes] of Object.entries(includeFiles)) module.FS.writeFile(`/include/${name}`, bytes);
    args.push('-I/include');
  }
  args.push('-o', '/out.i', 'in.c');
  const exitCode = module.callMain(args);
  module._fflush(0);
  if (exitCode !== 0 || hasPreprocessorError(stderr)) {
    return { ok: false, errors: parsePreprocessorErrors(stderr, exitCode) };
  }
  return { ok: true, output: new Uint8Array(module.FS.readFile('/out.i')) };
}

// smlrcc.c 1544-1590行相当: -doss は smlrc へ -seg16、-dosh は -huge を渡す。
const COMPILER_MODEL_FLAG = { small: '-seg16', huge: '-huge' };
// smlrcc.c 1572/1590行相当: -doss は smlrl へ -small、-dosh は -huge を渡す。
const LINKER_MODEL_FLAG = { small: '-small', huge: '-huge' };

async function compilePreprocessed(source, createSmlrc, model) {
  const stderr = [];
  const module = await createSmlrc({ print: (line) => stderr.push(String(line)), printErr: (line) => stderr.push(String(line)) });
  module.FS.writeFile('/out.i', source);
  const exitCode = module.callMain([COMPILER_MODEL_FLAG[model], '/out.i', '/out.asm']);
  if (exitCode !== 0) return { ok: false, errors: parseCompilerErrors(stderr, exitCode) };
  return { ok: true, output: new Uint8Array(module.FS.readFile('/out.asm')) };
}

async function link(object, library, createSmlrl, model) {
  const stderr = [];
  try {
    const module = await createSmlrl({ print: (line) => stderr.push(String(line)), printErr: (line) => stderr.push(String(line)) });
    module.FS.writeFile('/out.o', object);
    module.FS.writeFile('/lib.a', library);
    const exitCode = module.callMain([LINKER_MODEL_FLAG[model], '/out.o', '/lib.a', '-map', '/out.map', '-o', '/out.exe']);
    if (exitCode !== 0) return { ok: false, errors: fallbackError('smlrl', stderr, exitCode) };
    return {
      ok: true, output: new Uint8Array(module.FS.readFile('/out.exe')),
      map: new TextDecoder().decode(module.FS.readFile('/out.map')),
    };
  } catch (error) {
    return { ok: false, errors: fallbackError('smlrl', [...stderr, error], 1) };
  }
}

/** Node/ブラウザで共有するC→MZ EXE実装。各wasm factoryとNASM APIだけを注入する。 */
export async function compileWithFactories(source, opts, tools) {
  if (!(source instanceof Uint8Array)) throw new TypeError('source must be a Uint8Array; strings are not accepted');
  validateOptions(opts);
  for (const name of ['createSmlrpp', 'createSmlrc', 'createSmlrl', 'assemble']) {
    if (typeof tools?.[name] !== 'function') throw new TypeError(`tools.${name} must be a function`);
  }
  const normalized = normalizeDosTextSource(source);
  const lineEndings = normalizeCrLfForPreprocessor(normalized.source);
  const sourceNormalization = {
    dosEofBytesRemoved: normalized.dosEofBytesRemoved,
    crlfSequencesNormalized: lineEndings.crlfSequencesNormalized,
  };
  const model = opts.model ?? 'small';
  try {
    const preprocessed = await preprocess(lineEndings.source, opts.includeFiles ?? {}, tools.createSmlrpp, model);
    if (!preprocessed.ok) return { ...preprocessed, sourceNormalization };
    const compiled = await compilePreprocessed(preprocessed.output, tools.createSmlrc, model);
    if (!compiled.ok) return { ...compiled, sourceNormalization };
    const assembled = await tools.assemble(compiled.output, { format: 'elf', listing: true });
    if (!assembled.ok) {
      return { ok: false, errors: assembled.errors.map((error) => ({ ...error, stage: 'nasm' })), sourceNormalization };
    }
    const linked = await link(assembled.output, opts.library, tools.createSmlrl, model);
    if (!linked.ok) return { ...linked, sourceNormalization };
    const header = parseMzHeader(linked.output);
    const sourceMap = composeCSourceMap({ assembly: compiled.output, object: assembled.output, listing: assembled.listing, linkerMap: linked.map });
    return {
      ok: true, output: linked.output, preprocessed: preprocessed.output, assembly: compiled.output,
      object: assembled.output, linkerMap: linked.map, header, sourceMap, sourceNormalization,
    };
  } catch (error) {
    return { ok: false, errors: [{ stage: 'wasm', line: 0, message: error instanceof Error ? error.message : String(error) }], sourceNormalization };
  }
}
