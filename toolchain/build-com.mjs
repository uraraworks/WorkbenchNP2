#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.mjs';
import { makeFd } from './makefd.mjs';

function usage() {
  console.error('Usage: node build-com.mjs <input.asm> [-o out.xdf]');
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
    const source = await readFile(options.input);
    const result = await assemble(source);
    if (!result.ok) {
      for (const error of result.errors) {
        const location = error.line > 0 ? `${options.input}:${error.line}` : options.input;
        console.error(`${location}: error: ${error.message}`);
      }
      process.exitCode = 1;
      return;
    }

    const image = makeFd([{ name: dosBaseName(options.input), ext: 'COM', data: result.output }]);
    await writeFile(options.output, image);
    console.log(`wrote ${options.output} (${result.output.byteLength}-byte COM)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
