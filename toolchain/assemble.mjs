import { createRequire } from 'node:module';
import { normalizeDosTextSource } from './dos-text.mjs';

const require = createRequire(import.meta.url);
const createNasm = require('./nasm-wasm/nasm.js');

function parseErrors(stderr, exitCode) {
  const errors = [];

  for (const rawLine of stderr) {
    const line = String(rawLine).trim();
    if (!line) continue;

    const match = line.match(/^(?:.*[\\/])?in\.asm:(\d+):\s*(?:fatal:\s*|error:\s*)?(.*)$/i);
    if (match && /(?:^|:\s*)(?:fatal|error):/i.test(line)) {
      errors.push({ line: Number(match[1]), message: match[2].trim() });
    }
  }

  if (errors.length === 0 && exitCode !== 0) {
    const message = stderr.map(String).map((line) => line.trim()).filter(Boolean).join('\n');
    errors.push({ line: 0, message: message || `NASM exited with status ${exitCode}` });
  }

  return errors;
}

/**
 * Assemble source bytes with a fresh NASM WebAssembly instance.
 * @param {Uint8Array} source Source bytes. Only trailing DOS EOF bytes are normalized before NASM.
 * @param {{ format?: string, listing?: boolean, includeFiles?: Record<string, Uint8Array> }} opts
 * @returns {Promise<
 *   {ok: true, output: Uint8Array, listing?: string, sourceNormalization: {dosEofBytesRemoved: number}} |
 *   {ok: false, errors: {line: number, message: string}[], sourceNormalization: {dosEofBytesRemoved: number}}
 * >}
 */
export async function assemble(source, opts = {}) {
  if (!(source instanceof Uint8Array)) {
    throw new TypeError('source must be a Uint8Array; strings are not accepted');
  }

  const format = opts.format ?? 'bin';
  if (typeof format !== 'string' || !/^[A-Za-z0-9_-]+$/.test(format)) {
    throw new TypeError('opts.format must be a non-empty format name');
  }
  if (opts.listing !== undefined && typeof opts.listing !== 'boolean') {
    throw new TypeError('opts.listing must be a boolean');
  }
  if (opts.includeFiles !== undefined && (opts.includeFiles === null || Array.isArray(opts.includeFiles)
      || typeof opts.includeFiles !== 'object')) {
    throw new TypeError('opts.includeFiles must be an object');
  }

  const normalized = normalizeDosTextSource(source);
  const sourceNormalization = { dosEofBytesRemoved: normalized.dosEofBytesRemoved };

  const stderr = [];
  const previousExitCode = process.exitCode;

  try {
    // NASM keeps process-global state, so an instance must never be reused.
    const module = await createNasm({
      print: () => {},
      printErr: (line) => stderr.push(String(line)),
    });
    module.FS.writeFile('/in.asm', normalized.source);
    for (const [name, bytes] of Object.entries(opts.includeFiles ?? {})) {
      if (!/^[A-Za-z0-9_.-]+$/.test(name) || !(bytes instanceof Uint8Array)) {
        throw new TypeError('includeFiles entries must have simple names and Uint8Array values');
      }
      module.FS.writeFile(`/${name}`, bytes);
    }
    const args = ['-f', format];
    if (opts.listing) args.push('-l', '/out.lst');
    args.push('-o', '/out.bin', '/in.asm');
    const exitCode = module.callMain(args);

    if (exitCode !== 0) {
      return { ok: false, errors: parseErrors(stderr, exitCode), sourceNormalization };
    }

    const result = {
      ok: true, output: new Uint8Array(module.FS.readFile('/out.bin')), sourceNormalization,
    };
    if (opts.listing) {
      const bytes = new Uint8Array(module.FS.readFile('/out.lst'));
      // リスティング末尾のソース文字列は入力と同じ符号化。UTF-8を優先し、
      // PC-98資産で標準のCP932はShift_JISデコーダへフォールバックする。
      try {
        result.listing = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        result.listing = new TextDecoder('shift_jis').decode(bytes);
      }
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      errors: parseErrors(
        [...stderr, error instanceof Error ? error.message : String(error)],
        1,
      ),
      sourceNormalization,
    };
  } finally {
    process.exitCode = previousExitCode;
  }
}
