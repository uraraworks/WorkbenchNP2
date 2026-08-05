#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'node_modules');
const output = resolve(process.argv[3] ?? 'LICENSE.CodeMirror');
const expected = [
  ['@codemirror/autocomplete', '6.20.3'], ['@codemirror/commands', '6.10.4'],
  ['@codemirror/lang-cpp', '6.0.3'], ['@codemirror/language', '6.12.4'],
  ['@codemirror/lint', '6.9.7'], ['@codemirror/search', '6.7.1'],
  ['@codemirror/state', '6.7.1'], ['@codemirror/view', '6.43.8'],
  ['@lezer/common', '1.5.2'], ['@lezer/cpp', '1.1.6'],
  ['@lezer/highlight', '1.2.3'], ['@lezer/lr', '1.4.10'],
  ['@marijn/find-cluster-break', '1.0.3'], ['codemirror', '6.0.2'],
  ['crelt', '1.0.7'], ['style-mod', '4.1.3'], ['w3c-keyname', '2.2.8'],
];

const sections = [];
for (const [name, version] of expected) {
  const directory = join(root, ...name.split('/'));
  const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (metadata.name !== name || metadata.version !== version) {
    throw new Error(`${name}: expected ${version}, got ${metadata.name}@${metadata.version}`);
  }
  const license = (await readFile(join(directory, 'LICENSE'), 'utf8')).trim();
  if (!/^MIT License\b/.test(license) && !/Permission is hereby granted/.test(license)) {
    throw new Error(`${name}@${version}: LICENSE本文がMIT形式ではありません`);
  }
  sections.push(`===== ${name}@${version} =====\n\n${license}`);
}
await writeFile(output, `${sections.join('\n\n')}\n`);
console.log(`wrote ${output} (${expected.length} package LICENSE texts)`);
