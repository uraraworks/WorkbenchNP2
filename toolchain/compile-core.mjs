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
  if (!(opts.library instanceof Uint8Array)) throw new TypeError('opts.library must be the lcds.a Uint8Array');
}

async function preprocess(source, includeFiles, createSmlrpp) {
  const stderr = [];
  const module = await createSmlrpp({ print: () => {}, printErr: (line) => stderr.push(String(line)) });
  module.FS.writeFile('/in.c', source);
  const args = [
    '-U', '__STDC_VERSION__', '-zI', '-D', '_DOS', '-D', '__SMALLER_C__',
    '-D', '__SMALLER_C_16__', '-D', '__SMALLER_C_SCHAR__', '-D', '__SMALLER_C_UWCHAR__',
    '-D', '__SMALLER_C_WCHAR16__', '-D', '__SMALLER_PP__',
  ];
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

async function compilePreprocessed(source, createSmlrc) {
  const stderr = [];
  const module = await createSmlrc({ print: (line) => stderr.push(String(line)), printErr: (line) => stderr.push(String(line)) });
  module.FS.writeFile('/out.i', source);
  const exitCode = module.callMain(['-seg16', '/out.i', '/out.asm']);
  if (exitCode !== 0) return { ok: false, errors: parseCompilerErrors(stderr, exitCode) };
  return { ok: true, output: new Uint8Array(module.FS.readFile('/out.asm')) };
}

async function linkSmall(object, library, createSmlrl) {
  const stderr = [];
  try {
    const module = await createSmlrl({ print: (line) => stderr.push(String(line)), printErr: (line) => stderr.push(String(line)) });
    module.FS.writeFile('/out.o', object);
    module.FS.writeFile('/lcds.a', library);
    const exitCode = module.callMain(['-small', '/out.o', '/lcds.a', '-map', '/out.map', '-o', '/out.exe']);
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
  try {
    const preprocessed = await preprocess(lineEndings.source, opts.includeFiles ?? {}, tools.createSmlrpp);
    if (!preprocessed.ok) return { ...preprocessed, sourceNormalization };
    const compiled = await compilePreprocessed(preprocessed.output, tools.createSmlrc);
    if (!compiled.ok) return { ...compiled, sourceNormalization };
    const assembled = await tools.assemble(compiled.output, { format: 'elf', listing: true });
    if (!assembled.ok) {
      return { ok: false, errors: assembled.errors.map((error) => ({ ...error, stage: 'nasm' })), sourceNormalization };
    }
    const linked = await linkSmall(assembled.output, opts.library, tools.createSmlrl);
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
