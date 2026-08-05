#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.mjs';
import { parseListing } from './listing.mjs';
import { makeFd } from './makefd.mjs';
import { normalizeMzFileSize, parseMzHeader } from './mz.mjs';

const TOOLCHAIN_DIR = dirname(fileURLToPath(import.meta.url));
const EXEBIN_MAC = join(TOOLCHAIN_DIR, 'nasm-src', 'misc', 'exebin.mac');

function usage() {
  console.error('Usage: node build-exe.mjs <input.asm> [-o out.xdf]');
}

function parseArgs(args) {
  let input;
  let output;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o') {
      if (output || i + 1 >= args.length) throw new Error('-o requires one output path');
      output = args[++i];
    } else if (args[i].startsWith('-') || input) {
      throw new Error(`unexpected argument: ${args[i]}`);
    } else {
      input = args[i];
    }
  }
  if (!input) throw new Error('input .asm file is required');
  const extension = extname(input);
  const defaultOutput = `${extension ? input.slice(0, -extension.length) : input}.xdf`;
  return { input, output: output ?? defaultOutput };
}

function dosBaseName(path) {
  const stem = basename(path, extname(path)).toUpperCase();
  const normalized = stem.replace(/[^A-Z0-9!#$%&'()\-@^_`{}~]/g, '_').slice(0, 8);
  if (!normalized) throw new Error('input filename cannot be converted to an 8.3 name');
  return normalized;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage();
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  try {
    const [source, exebin] = await Promise.all([readFile(options.input), readFile(EXEBIN_MAC)]);
    const result = await assemble(source, { listing: true, includeFiles: { 'exebin.mac': exebin } });
    if (!result.ok) {
      for (const error of result.errors) {
        const location = error.line > 0 ? `${options.input}:${error.line}` : options.input;
        console.error(`${location}: error: ${error.message}`);
      }
      process.exitCode = 1;
      return;
    }

    const exe = normalizeMzFileSize(result.output);
    const header = parseMzHeader(exe);
    if (header.headerBytes !== 32 || header.relocations !== 0
        || header.cs !== 0xfff0 || header.ip !== 0x0100 || header.ss !== 0xfff0) {
      throw new Error(`unexpected exebin.mac MZ layout: ${JSON.stringify(header)}`);
    }
    const map = parseListing(result.listing, exe, { startAddress: header.headerBytes });
    const inputStem = basename(options.input, extname(options.input));
    const exePath = join(dirname(options.output), `${inputStem}.exe`);
    const mapPath = `${exePath}.map.json`;
    const image = makeFd([{ name: dosBaseName(options.input), ext: 'EXE', data: exe }]);
    await Promise.all([
      writeFile(options.output, image),
      writeFile(exePath, exe),
      writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`),
    ]);
    console.log(`wrote ${options.output} (${exe.byteLength}-byte MZ EXE)`);
    console.log(`MZ CS:IP=${header.cs.toString(16).padStart(4, '0')}:${header.ip.toString(16).padStart(4, '0')} `
      + `SS:SP=${header.ss.toString(16).padStart(4, '0')}:${header.sp.toString(16).padStart(4, '0')} `
      + `relocations=${header.relocations}`);
    console.log(`wrote ${exePath} and ${mapPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
