import { createRequire } from 'node:module';
import { assembleWithFactory } from './assemble-core.mjs';

const require = createRequire(import.meta.url);
const createNasm = require('./nasm-wasm/nasm.js');

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

  const previousExitCode = process.exitCode;
  try {
    return await assembleWithFactory(source, opts, createNasm);
  } finally {
    process.exitCode = previousExitCode;
  }
}
