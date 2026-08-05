#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.mjs';
import { normalizeCrLfForPreprocessor, normalizeDosTextSource } from './dos-text.mjs';
import { composeCSourceMap } from './c-source-map.mjs';
import { makeFd } from './makefd.mjs';
import { parseMzHeader } from './mz.mjs';

const require = createRequire(import.meta.url);
const createSmlrpp = require('./smlrc-wasm/smlrpp.js');
const createSmlrc = require('./smlrc-wasm/smlrc.js');
const createSmlrl = require('./smlrc-wasm/smlrl.js');
const TOOLCHAIN_DIR = dirname(fileURLToPath(import.meta.url));

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

function hasPreprocessorError(stderr) {
  return stderr.some((line) => /^(?:.*[\\/])?in\.c:\s*line\s+\d+:/i.test(String(line).trim()));
}

function parseCompilerErrors(stderr, exitCode) {
  const errors = [];
  for (let index = 0; index < stderr.length; index++) {
    const match = String(stderr[index]).trim()
      .match(/^Error in "(?:.*[\\/])?(?:in\.c|out\.i)"\s*\((\d+):(\d+)\)$/i);
    if (!match) continue;
    const detail = String(stderr[index + 1] ?? '').trim();
    errors.push({
      stage: 'smlrc', line: Number(match[1]), column: Number(match[2]),
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
  if (!(opts.library instanceof Uint8Array)) {
    throw new TypeError('opts.library must be the lcds.a Uint8Array');
  }
}

async function preprocess(source, includeFiles) {
  const stderr = [];
  const module = await createSmlrpp({ print: () => {}, printErr: (line) => stderr.push(String(line)) });
  module.FS.writeFile('/in.c', source);
  const args = [
    '-U', '__STDC_VERSION__', '-zI', '-D', '_DOS',
    '-D', '__SMALLER_C__', '-D', '__SMALLER_C_16__', '-D', '__SMALLER_C_SCHAR__',
    '-D', '__SMALLER_C_UWCHAR__', '-D', '__SMALLER_C_WCHAR16__', '-D', '__SMALLER_PP__',
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

async function compilePreprocessed(source) {
  const stderr = [];
  const module = await createSmlrc({
    print: (line) => stderr.push(String(line)), printErr: (line) => stderr.push(String(line)),
  });
  module.FS.writeFile('/out.i', source);
  const exitCode = module.callMain(['-seg16', '/out.i', '/out.asm']);
  if (exitCode !== 0) return { ok: false, errors: parseCompilerErrors(stderr, exitCode) };
  return { ok: true, output: new Uint8Array(module.FS.readFile('/out.asm')) };
}

async function linkSmall(object, library) {
  const stderr = [];
  try {
    // smlrlは異なる入力の2回目でfresh出力と一致しないため、リンクごとに新規生成する。
    const module = await createSmlrl({
      print: (line) => stderr.push(String(line)), printErr: (line) => stderr.push(String(line)),
    });
    module.FS.writeFile('/out.o', object);
    module.FS.writeFile('/lcds.a', library);
    const exitCode = module.callMain([
      '-small', '/out.o', '/lcds.a', '-map', '/out.map', '-o', '/out.exe',
    ]);
    if (exitCode !== 0) return { ok: false, errors: fallbackError('smlrl', stderr, exitCode) };
    return {
      ok: true,
      output: new Uint8Array(module.FS.readFile('/out.exe')),
      map: new TextDecoder().decode(module.FS.readFile('/out.map')),
    };
  } catch (error) {
    return { ok: false, errors: fallbackError('smlrl', [...stderr, error], 1) };
  }
}

/**
 * Cを16-bit DOS small-model MZ EXEへ変換する。各プロセス型ツールは毎回fresh wasmとする。
 * @param {Uint8Array} source
 * @param {{library: Uint8Array, includeFiles?: Record<string, Uint8Array>}} opts
 */
export async function compile(source, opts = {}) {
  if (!(source instanceof Uint8Array)) throw new TypeError('source must be a Uint8Array; strings are not accepted');
  validateOptions(opts);
  const normalized = normalizeDosTextSource(source);
  const lineEndings = normalizeCrLfForPreprocessor(normalized.source);
  const sourceNormalization = {
    dosEofBytesRemoved: normalized.dosEofBytesRemoved,
    crlfSequencesNormalized: lineEndings.crlfSequencesNormalized,
  };
  const previousExitCode = process.exitCode;
  try {
    const preprocessed = await preprocess(lineEndings.source, opts.includeFiles ?? {});
    if (!preprocessed.ok) return { ...preprocessed, sourceNormalization };
    const compiled = await compilePreprocessed(preprocessed.output);
    if (!compiled.ok) return { ...compiled, sourceNormalization };
    const assembled = await assemble(compiled.output, { format: 'elf', listing: true });
    if (!assembled.ok) {
      return {
        ok: false,
        errors: assembled.errors.map((error) => ({ ...error, stage: 'nasm' })),
        sourceNormalization,
      };
    }
    const linked = await linkSmall(assembled.output, opts.library);
    if (!linked.ok) return { ...linked, sourceNormalization };
    const header = parseMzHeader(linked.output);
    const sourceMap = composeCSourceMap({
      assembly: compiled.output,
      object: assembled.output,
      listing: assembled.listing,
      linkerMap: linked.map,
    });
    return {
      ok: true, output: linked.output, preprocessed: preprocessed.output,
      assembly: compiled.output, object: assembled.output, linkerMap: linked.map, header, sourceMap,
      sourceNormalization,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [{ stage: 'wasm', line: 0, message: error instanceof Error ? error.message : String(error) }],
      sourceNormalization,
    };
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
