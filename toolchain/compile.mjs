#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.mjs';
import { compileWithFactories } from './compile-core.mjs';
import { makeFd } from './makefd.mjs';

const require = createRequire(import.meta.url);
const createSmlrpp = require('./smlrc-wasm/smlrpp.js');
const createSmlrc = require('./smlrc-wasm/smlrc.js');
const createSmlrl = require('./smlrc-wasm/smlrl.js');
const TOOLCHAIN_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Cを16-bit DOS small-model MZ EXEへ変換する。各プロセス型ツールは毎回fresh wasmとする。
 * @param {Uint8Array} source
 * @param {{library: Uint8Array, includeFiles?: Record<string, Uint8Array>}} opts
 */
export async function compile(source, opts = {}) {
  const previousExitCode = process.exitCode;
  try {
    return await compileWithFactories(source, opts, { createSmlrpp, createSmlrc, createSmlrl, assemble });
  } finally {
    process.exitCode = previousExitCode;
  }
}

function usage() {
  console.error('Usage: node compile.mjs <input.c> [-o out.xdf]');
}

function parseArgs(args) {
  let input;
  let output;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '-o') {
      if (output || index + 1 >= args.length) throw new Error('-o requires one output path');
      output = args[++index];
    } else if (args[index].startsWith('-') || input) {
      throw new Error(`unexpected argument: ${args[index]}`);
    } else input = args[index];
  }
  if (!input) throw new Error('input .c file is required');
  const extension = extname(input);
  return { input, output: output ?? `${extension ? input.slice(0, -extension.length) : input}.xdf` };
}

function dosBaseName(path) {
  const stem = basename(path, extname(path)).toUpperCase();
  const normalized = stem.replace(/[^A-Z0-9!#$%&'()\-@^_`{}~]/g, '_').slice(0, 8);
  if (!normalized) throw new Error('input filename cannot be converted to an 8.3 name');
  return normalized;
}

export async function loadDefaultHeaders() {
  const includeFiles = {};
  for (const directory of [
    join(TOOLCHAIN_DIR, 'smallerc-src', 'v0100', 'include'),
    join(TOOLCHAIN_DIR, 'smallerc-src', 'v0100', 'srclib'),
  ]) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.h') && includeFiles[entry.name] === undefined) {
        includeFiles[entry.name] = new Uint8Array(await readFile(join(directory, entry.name)));
      }
    }
  }
  return includeFiles;
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { usage(); console.error(error.message); process.exitCode = 2; return; }
  try {
    const [source, library, includeFiles] = await Promise.all([
      readFile(options.input), readFile(join(TOOLCHAIN_DIR, 'smlrc-wasm', 'lcds.a')), loadDefaultHeaders(),
    ]);
    const result = await compile(new Uint8Array(source), {
      library: new Uint8Array(library), includeFiles,
    });
    if (result.sourceNormalization.dosEofBytesRemoved > 0) {
      console.log(`normalized DOS text EOF: removed ${result.sourceNormalization.dosEofBytesRemoved} trailing 0x1A byte(s)`);
    }
    if (!result.ok) {
      for (const error of result.errors) {
        const location = error.line > 0 ? `${options.input}:${error.line}` : options.input;
        console.error(`${location}: error [${error.stage}]: ${error.message}`);
      }
      process.exitCode = 1; return;
    }
    const stem = basename(options.input, extname(options.input));
    const exePath = join(dirname(options.output), `${stem}.exe`);
    const asmPath = join(dirname(options.output), `${stem}.asm`);
    const mapPath = `${exePath}.map`;
    const image = makeFd([{ name: dosBaseName(options.input), ext: 'EXE', data: result.output }]);
    await Promise.all([
      writeFile(options.output, image), writeFile(exePath, result.output),
      writeFile(asmPath, result.assembly), writeFile(mapPath, result.linkerMap),
    ]);
    console.log(`wrote ${options.output} (${result.output.byteLength}-byte small-model MZ EXE)`);
    console.log(`wrote ${exePath}, ${asmPath}, and ${mapPath}`);
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
