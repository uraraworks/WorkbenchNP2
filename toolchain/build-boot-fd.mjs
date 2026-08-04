#!/usr/bin/env node

import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.mjs';
import { addFiles } from './fdadd.mjs';

const DEFAULT_BASE = fileURLToPath(new URL('../../WebNP2/public/freedos/fd98_2hd.xdf', import.meta.url));

function usage() {
  console.error('Usage: node build-boot-fd.mjs <input.asm>... -o <out.xdf> [--base <base.xdf>]');
}

function parseArgs(args) {
  const inputs = [];
  let output;
  let base = DEFAULT_BASE;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '-o' || arg === '--base') {
      if (index + 1 >= args.length) throw new Error(`${arg} requires a path`);
      const value = args[++index];
      if (arg === '-o') {
        if (output) throw new Error('-o may only be specified once');
        output = value;
      } else {
        base = value;
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`unexpected option: ${arg}`);
    } else {
      inputs.push(arg);
    }
  }
  if (inputs.length === 0) throw new Error('at least one input .asm file is required');
  if (!output) throw new Error('-o <out.xdf> is required');
  return { inputs, output, base };
}

function dosBaseName(path) {
  let stem = basename(path, extname(path));
  // NASM ports in this tree use *_nasm.asm beside their original output name.
  stem = stem.replace(/_nasm$/i, '');
  const normalized = stem.toUpperCase().replace(/[^A-Z0-9!#$%&'()\-@^_`{}~]/g, '_').slice(0, 8);
  if (!normalized) throw new Error(`${path}: filename cannot be converted to an 8.3 name`);
  return normalized;
}

async function sameFile(first, second) {
  if (resolve(first) === resolve(second)) return true;
  try {
    const [a, b] = await Promise.all([stat(first), stat(second)]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
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
    if (await sameFile(options.base, options.output)) {
      throw new Error('output path must be different from the base image');
    }

    const files = [];
    for (const input of options.inputs) {
      if (extname(input).toLowerCase() !== '.asm') throw new Error(`${input}: input must have an .asm extension`);
      const result = await assemble(await readFile(input));
      if (!result.ok) {
        for (const error of result.errors) {
          const location = error.line > 0 ? `${input}:${error.line}` : input;
          console.error(`${location}: error: ${error.message}`);
        }
        process.exitCode = 1;
        return;
      }
      files.push({ name: dosBaseName(input), ext: 'COM', data: result.output });
    }

    const baseImage = await readFile(options.base);
    const outputImage = addFiles(baseImage, files);
    await writeFile(options.output, outputImage);
    console.log(`wrote ${options.output} (${files.map((file) => `${file.name}.COM`).join(', ')})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
