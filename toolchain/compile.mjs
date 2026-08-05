import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const createSmlrpp = require('./smlrc-wasm/smlrpp.js');
const createSmlrc = require('./smlrc-wasm/smlrc.js');

function fallbackError(stage, stderr, exitCode) {
  const message = stderr.map(String).map((line) => line.trim()).filter(Boolean).join('\n');
  return [{ stage, line: 0, message: message || `${stage} exited with status ${exitCode}` }];
}

function parsePreprocessorErrors(stderr, exitCode) {
  const errors = [];
  for (const rawLine of stderr) {
    const line = String(rawLine).trim();
    const match = line.match(/^(?:.*[\\/])?in\.c:\s*line\s+(\d+):\s*(.*)$/i);
    if (match) errors.push({ stage: 'smlrpp', line: Number(match[1]), message: match[2].trim() });
  }
  return errors.length > 0 ? errors : fallbackError('smlrpp', stderr, exitCode);
}

function hasPreprocessorError(stderr) {
  return stderr.some((rawLine) => /^(?:.*[\\/])?in\.c:\s*line\s+\d+:/i.test(String(rawLine).trim()));
}

function parseCompilerErrors(stderr, exitCode) {
  const errors = [];
  for (let index = 0; index < stderr.length; index++) {
    const line = String(stderr[index]).trim();
    const match = line.match(/^Error in "(?:.*[\\/])?(?:in\.c|out\.i)"\s*\((\d+):(\d+)\)$/i);
    if (!match) continue;
    const detail = String(stderr[index + 1] ?? '').trim();
    errors.push({
      stage: 'smlrc',
      line: Number(match[1]),
      column: Number(match[2]),
      message: detail || 'compilation failed',
    });
    if (detail) index++;
  }
  return errors.length > 0 ? errors : fallbackError('smlrc', stderr, exitCode);
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
}

async function preprocess(source, includeFiles) {
  const stderr = [];
  const module = await createSmlrpp({
    print: () => {},
    printErr: (line) => stderr.push(String(line)),
  });
  module.FS.writeFile('/in.c', source);
  const args = ['-zI'];
  if (Object.keys(includeFiles).length > 0) {
    module.FS.mkdir('/include');
    for (const [name, bytes] of Object.entries(includeFiles)) {
      module.FS.writeFile(`/include/${name}`, bytes);
    }
    args.push('-I/include');
  }
  args.push('-o', '/out.i', 'in.c');
  const exitCode = module.callMain(args);
  module._fflush(0);
  // ucppは未終端#if等を報告しても0を返すため、診断行の存在も失敗条件にする。
  if (exitCode !== 0 || hasPreprocessorError(stderr)) {
    return { ok: false, errors: parsePreprocessorErrors(stderr, exitCode) };
  }
  return { ok: true, output: new Uint8Array(module.FS.readFile('/out.i')) };
}

async function compilePreprocessed(source) {
  const stderr = [];
  const module = await createSmlrc({
    // smlrcは診断もstdoutへ出すため、両出力を同じ順序で収集する。
    print: (line) => stderr.push(String(line)),
    printErr: (line) => stderr.push(String(line)),
  });
  module.FS.writeFile('/out.i', source);
  const exitCode = module.callMain(['-seg16', '/out.i', '/out.asm']);
  if (exitCode !== 0) return { ok: false, errors: parseCompilerErrors(stderr, exitCode) };
  return { ok: true, output: new Uint8Array(module.FS.readFile('/out.asm')) };
}

/**
 * C source bytesをSmallerCの16-bit small model向けNASM assemblyへ変換する。
 * smlrpp/smlrcとも呼出しごとに新しいwasmインスタンスを使う。
 *
 * @param {Uint8Array} source
 * @param {{includeFiles?: Record<string, Uint8Array>}} opts
 * @returns {Promise<
 *   {ok: true, output: Uint8Array, preprocessed: Uint8Array} |
 *   {ok: false, errors: {stage: string, line: number, column?: number, message: string}[]}
 * >}
 */
export async function compile(source, opts = {}) {
  if (!(source instanceof Uint8Array)) {
    throw new TypeError('source must be a Uint8Array; strings are not accepted');
  }
  validateOptions(opts);
  const previousExitCode = process.exitCode;
  try {
    const preprocessed = await preprocess(source, opts.includeFiles ?? {});
    if (!preprocessed.ok) return preprocessed;
    const compiled = await compilePreprocessed(preprocessed.output);
    if (!compiled.ok) return compiled;
    return { ok: true, output: compiled.output, preprocessed: preprocessed.output };
  } catch (error) {
    return {
      ok: false,
      errors: [{
        stage: 'wasm',
        line: 0,
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  } finally {
    process.exitCode = previousExitCode;
  }
}
