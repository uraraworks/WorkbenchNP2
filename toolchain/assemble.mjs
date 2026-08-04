import { createRequire } from 'node:module';

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
 * @param {Uint8Array} source Source bytes. They are copied verbatim into NASM's FS.
 * @param {{ format?: string }} opts
 * @returns {Promise<{ok: true, output: Uint8Array} | {ok: false, errors: {line: number, message: string}[]}>}
 */
export async function assemble(source, opts = {}) {
  if (!(source instanceof Uint8Array)) {
    throw new TypeError('source must be a Uint8Array; strings are not accepted');
  }

  const format = opts.format ?? 'bin';
  if (typeof format !== 'string' || !/^[A-Za-z0-9_-]+$/.test(format)) {
    throw new TypeError('opts.format must be a non-empty format name');
  }

  const stderr = [];
  const previousExitCode = process.exitCode;

  try {
    // NASM keeps process-global state, so an instance must never be reused.
    const module = await createNasm({
      print: () => {},
      printErr: (line) => stderr.push(String(line)),
    });
    module.FS.writeFile('/in.asm', source);
    const exitCode = module.callMain(['-f', format, '-o', '/out.bin', '/in.asm']);

    if (exitCode !== 0) {
      return { ok: false, errors: parseErrors(stderr, exitCode) };
    }

    return { ok: true, output: new Uint8Array(module.FS.readFile('/out.bin')) };
  } catch (error) {
    return {
      ok: false,
      errors: parseErrors(
        [...stderr, error instanceof Error ? error.message : String(error)],
        1,
      ),
    };
  } finally {
    process.exitCode = previousExitCode;
  }
}
