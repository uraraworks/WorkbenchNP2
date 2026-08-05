#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_INPUT = resolve(ROOT, 'samples/legacy/saka/SAKA.ASM');
const DEFAULT_OUTPUT = resolve(ROOT, 'samples/legacy/saka/SAKA_NASM.ASM');
const EXPECTED_SHA256 = '7c76ecb3b3baae50fb36a237067ccde2dc65c44c6601e1886fb321e59d7c1f47';
const inputPath = resolve(process.argv[2] ?? DEFAULT_INPUT);
const outputPath = resolve(process.argv[3] ?? DEFAULT_OUTPUT);

const input = await readFile(inputPath);
assert.equal(createHash('sha256').update(input).digest('hex'), EXPECTED_SHA256, 'SAKA.ASMの原本ハッシュが不一致');

// コード構文はASCIIだけなのでlatin1で1 byte = 1 code pointとして扱い、CP932の本文を無変換で保つ。
const hadFinalCrlf = input.subarray(-2).equals(Buffer.from('\r\n'));
const lines = input.toString('latin1').split('\r\n');
if (hadFinalCrlf) lines.pop();

const dataSymbols = new Map();
const procAtLine = new Map();
const procLabels = new Map();
const procNames = new Set();
let inData = false;
let currentProc = null;

for (let index = 0; index < lines.length; index++) {
  const code = lines[index].split(';', 1)[0];
  if (/^\s*\.DATA\b/i.test(code)) inData = true;
  if (/^\s*\.CODE\b/i.test(code)) inData = false;
  if (inData) {
    const declaration = code.match(/^\s*([A-Za-z_?$@][\w?$@]*)\s+(DB|DW)\b/i);
    if (declaration) dataSymbols.set(declaration[1].toLowerCase(), declaration[2].toLowerCase());
  }
  const proc = code.match(/^\s*([A-Za-z_?$@][\w?$@]*)\s+PROC\b/i);
  if (proc) {
    currentProc = proc[1].toLowerCase();
    procNames.add(currentProc);
    procLabels.set(currentProc, new Map());
  }
  procAtLine.set(index, currentProc);
  if (currentProc) {
    const label = code.match(/^\s*([A-Za-z_?$@][\w?$@]*)\s*:/);
    if (label) procLabels.get(currentProc).set(label[1].toLowerCase(), index + 1);
  }
  if (/^\s*[A-Za-z_?$@][\w?$@]*\s+ENDP\b/i.test(code)) currentProc = null;
}

function splitComment(line) {
  let quote = '';
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === ';') return [line.slice(0, index), line.slice(index)];
  }
  return [line, ''];
}

function splitOperands(text) {
  const result = [];
  let start = 0, brackets = 0, quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '[') brackets++;
    if (char === ']') brackets--;
    if (char === ',' && brackets === 0) {
      result.push(text.slice(start, index).trim()); start = index + 1;
    }
  }
  result.push(text.slice(start).trim());
  return result.filter(Boolean);
}

const registerPattern = /^(?:[er]?(?:ax|bx|cx|dx|sp|bp|si|di)|[abcd][lh]|[cdefgs]s)$/i;
const branchPattern = /^(?:call|j[a-z]+|loop(?:e|ne|nz|z)?|jcxz)$/i;
const stats = {
  proc: 0, localDefinitions: 0, localReferences: 0, crossProcReferences: [],
  offset: 0, bareMemory: 0, ptrMemory: 0, sizeRequired: 0,
  dup: 0, question: 0, segmentRestores: [], manualRemainder: [], ems: 0,
};

const output = [
  '; NASM conversion generated mechanically from the adjacent original SAKA.ASM.',
  '; Keep SAKA.ASM unchanged; regenerate this file with: node toolchain/convert-saka.mjs',
  '%include "exebin.mac"',
  '\tCPU\t8086',
  '\tBITS\t16',
  '\tEXE_begin',
  '\tEXE_stack\t400h',
  '\tsection\t.text',
  'entry:',
  '\tjmp\tstart',
  '',
];

for (let index = 0; index < lines.length; index++) {
  const lineNumber = index + 1;
  const procName = procAtLine.get(index);
  let [code, comment] = splitComment(lines[index]);

  if (/^\s*\.MODEL\b/i.test(code) || /^\s*\.STACK\b/i.test(code)) {
    output.push(`; MASM ${code.trim()} replaced by EXE_begin/EXE_stack`);
    continue;
  }
  if (/^\s*\.DATA\b/i.test(code)) {
    output.push('; MASM .DATA flattened into the single .text section.');
    continue;
  }
  if (/^\s*\.CODE\b/i.test(code)) {
    output.push('', 'start:', '; MASM .CODE starts here; entry jumps over the flattened data above.');
    continue;
  }
  if (/^\s*END\s*$/i.test(code)) {
    output.push('', '\tEXE_end');
    continue;
  }

  const procStart = code.match(/^(\s*)([A-Za-z_?$@][\w?$@]*)\s+PROC\b/i);
  if (procStart) {
    stats.proc++;
    code = `${procStart[1]}${procStart[2]}:`;
  } else if (/^\s*[A-Za-z_?$@][\w?$@]*\s+ENDP\b/i.test(code)) {
    output.push(comment || '');
    continue;
  }

  if (procName) {
    const localLabels = procLabels.get(procName);
    const definition = code.match(/^(\s*)([A-Za-z_?$@][\w?$@]*)(\s*:)/);
    if (definition && localLabels.has(definition[2].toLowerCase())) {
      code = `${definition[1]}.${definition[2]}${definition[3]}${code.slice(definition[0].length)}`;
      stats.localDefinitions++;
    }
    const instruction = code.match(/^\s*(?:\.?[A-Za-z_?$@][\w?$@]*\s*:\s*)?([A-Za-z.]+)\s+([^,\s]+)\s*$/i);
    if (instruction && branchPattern.test(instruction[1])) {
      const target = instruction[2].toLowerCase();
      if (localLabels.has(target)) {
        const targetAt = code.lastIndexOf(instruction[2]);
        code = `${code.slice(0, targetAt)}.${code.slice(targetAt)}`;
        stats.localReferences++;
      } else if (!target.startsWith('.') && !procNames.has(target)) {
        const owners = [...procLabels].filter(([, labels]) => labels.has(target)).map(([owner]) => owner);
        if (owners.length > 0) stats.crossProcReferences.push({ line: lineNumber, proc: procName, target, owners });
      }
    }
    for (const match of code.matchAll(/[A-Za-z_?$@][\w?$@]*/g)) {
      if (localLabels.has(match[0].toLowerCase()) && code[match.index - 1] !== '.') {
        stats.manualRemainder.push({ line: lineNumber, operand: match[0], reason: 'unconverted local-label reference' });
      }
    }
  }

  const dgroup = code.match(/^(\s*)mov(\s+)ax\s*,\s*DGROUP\s*$/i);
  if (dgroup) {
    stats.segmentRestores.push(lineNumber);
    code = `${dgroup[1]}mov${dgroup[2]}ax,cs`;
  }

  const declaration = code.match(/^(\s*[A-Za-z_?$@][\w?$@]*\s+)(DB|DW)(\s+)(.+)$/i);
  if (declaration) {
    const dup = declaration[4].match(/^(.+?)\s+DUP\s*\(\s*(.*?)\s*\)\s*$/i);
    if (dup) {
      stats.dup++;
      let value = dup[2];
      if (value === '?') {
        value = '0';
        stats.question++;
        comment += `${comment ? ' ' : '; '}flat MZ keeps zero bytes in .text for monotonic listing offsets`;
      }
      code = `${declaration[1]}times ${dup[1].trim()} ${declaration[2].toLowerCase()} ${value}`;
    }
  } else {
    const instruction = code.match(/^(\s*(?:\.?[A-Za-z_?$@][\w?$@]*\s*:\s*)?)([A-Za-z.]+)(\s+)(.*)$/);
    if (instruction) {
      const mnemonic = instruction[2].toLowerCase();
      const operands = splitOperands(instruction[4]);
      if (mnemonic === 'int' && operands.length === 1 && /^67h$/i.test(operands[0])) stats.ems++;
      const converted = operands.map((originalOperand, operandIndex) => {
        let operand = originalOperand;
        let addressOnly = false;
        operand = operand.replace(/\bOFFSET\s+([A-Za-z_?$@][\w?$@]*)\b/gi, (match, symbol) => {
          if (!dataSymbols.has(symbol.toLowerCase())) return match;
          stats.offset++; addressOnly = true; return symbol;
        });
        operand = operand.replace(/\b(BYTE|WORD)\s+PTR\s+([A-Za-z_?$@][\w?$@]*)\b/gi, (match, size, symbol) => {
          if (!dataSymbols.has(symbol.toLowerCase())) return match;
          stats.ptrMemory++; return `${size.toLowerCase()} [${symbol}]`;
        });
        const symbols = [...operand.matchAll(/[A-Za-z_?$@][\w?$@]*/g)]
          .map((match) => match[0]).filter((symbol) => dataSymbols.has(symbol.toLowerCase()));
        if (!addressOnly && symbols.length > 0 && !/\[[^\]]*\]/.test(operand) && !/\b(?:BYTE|WORD)\s+\[/.test(operand)) {
          if (symbols.length !== 1 || operand.toLowerCase() !== symbols[0].toLowerCase()) {
            stats.manualRemainder.push({ line: lineNumber, operand: originalOperand, reason: 'complex bare data operand' });
            return operand;
          }
          const symbol = symbols[0];
          let size = '';
          if (operands.length === 1 || (operandIndex === 0 && !registerPattern.test(operands[1]))) {
            size = `${dataSymbols.get(symbol.toLowerCase()) === 'db' ? 'byte' : 'word'} `;
            stats.sizeRequired++;
          }
          stats.bareMemory++;
          operand = `${size}[${symbol}]`;
        }
        return operand;
      });
      code = `${instruction[1]}${instruction[2]}${instruction[3]}${converted.join(',')}`;
    }
  }

  output.push(`${code}${comment}`);
}

assert.equal(stats.proc, 31, 'PROC変換数');
assert.equal(stats.localDefinitions, 214, 'PROC内ラベル定義数');
assert.equal(stats.crossProcReferences.length, 0, 'PROC跨ぎローカル参照は個別確認が必要');
assert.equal(stats.offset, 53, 'OFFSET変換数');
assert.equal(stats.bareMemory, 264, '裸メモリ変換数');
assert.equal(stats.ptrMemory, 3, 'PTR変換数');
assert.equal(stats.sizeRequired, 73, 'size補完数');
assert.equal(stats.dup, 19, 'DUP変換数');
assert.equal(stats.question, 3, '?変換数');
assert.deepEqual(stats.segmentRestores, [92, 1500, 1952, 2462], 'DGROUP復帰箇所');
assert.equal(stats.manualRemainder.length, 0, '機械変換できないオペランドが残存');
assert.equal(stats.ems, 27, 'EMS命令数を維持');

// 文字列のCP932バイトは保持し、生成版だけ改行をLFへ正規化してGit差分を安定させる。
const normalizedOutput = output.map((line) => line.replace(/[ \t]+$/, ''));
const encoded = Buffer.from(`${normalizedOutput.join('\n')}\n`, 'latin1');
const generatedCode = normalizedOutput.map((line) => splitComment(line)[0]).join('\n');
for (const keyword of ['PROC', 'ENDP', 'OFFSET', 'PTR', 'DUP', 'DGROUP']) {
  assert.equal(new RegExp(`\\b${keyword}\\b`, 'i').test(generatedCode), false, `${keyword}が変換後に残存`);
}
await writeFile(outputPath, encoded);
console.log(JSON.stringify({ input: inputPath, output: outputPath, ...stats }, null, 2));
