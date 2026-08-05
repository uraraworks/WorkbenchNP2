import { extractElfSection } from './elf.mjs';
import { parseListing } from './listing.mjs';

const MARKER = /^\s*;\s*@pc98dev-c-line\t(\d+)(?:\t(.+))?\s*$/;

function textSectionAddress(linkerMap) {
  const match = linkerMap.match(/^\s*([0-9a-f]+)\s+section\s+\.text:\s*$/im);
  if (!match) throw new Error('linker mapに.text sectionがありません');
  return Number.parseInt(match[1], 16);
}

function markerByAssemblyLine(assembly) {
  const states = [];
  let current = null;
  for (const [index, text] of assembly.split(/\r?\n/).entries()) {
    const match = text.match(MARKER);
    if (match) current = Number(match[1]) === 0 ? null : { line: Number(match[1]), file: match[2] };
    states[index + 1] = current;
  }
  return states;
}

function textAssemblyLines(assembly) {
  const lines = new Set();
  let inText = false;
  for (const [index, text] of assembly.split(/\r?\n/).entries()) {
    const section = text.match(/^\s*section\s+([^\s;]+)/i);
    if (section) inText = section[1].toLowerCase() === '.text';
    if (inText) lines.add(index + 1);
  }
  return lines;
}

function textOnlyListing(listing, sourceLines) {
  return listing.split(/\r?\n/).filter((text) => {
    const line = Number.parseInt(text.slice(0, 6).trim(), 10);
    return Number.isInteger(line) && sourceLines.has(line);
  }).join('\n');
}

/** C行コメント→物理ASM行→NASM listing addressを合成し、全非連続区間を保持する。 */
export function composeCSourceMap({ assembly, object, listing, linkerMap }) {
  if (!(assembly instanceof Uint8Array) || !(object instanceof Uint8Array)) {
    throw new TypeError('assembly and object must be Uint8Array');
  }
  const assemblyText = new TextDecoder().decode(assembly);
  const text = extractElfSection(object, '.text');
  // ELF listingはsectionごとにaddressが0へ戻るため、.textの物理ASM行だけを既存parserへ渡す。
  const asmMap = parseListing(textOnlyListing(listing, textAssemblyLines(assemblyText)), text);
  const markers = markerByAssemblyLine(assemblyText);
  const bias = textSectionAddress(linkerMap);
  const ranges = [];
  for (const entry of asmMap) {
    const marker = markers[entry.srcLine];
    if (!marker || entry.bytes.length === 0) continue;
    const start = bias + entry.offset;
    const end = start + entry.bytes.length;
    const previous = ranges.at(-1);
    if (previous && previous.file === marker.file && previous.line === marker.line
        && previous.end === start) {
      previous.end = end;
      previous.asmLines.push(entry.srcLine);
    } else {
      ranges.push({ file: marker.file, line: marker.line, start, end, asmLines: [entry.srcLine] });
    }
  }
  return { ranges, textAddress: bias, textSize: text.length };
}

export function cLineToRanges(map, line, file = 'in.c') {
  if (!map?.ranges || !Number.isInteger(line)) return [];
  return map.ranges.filter((range) => range.line === line && range.file === file);
}

/** どの区間にも属さないprologue/epilogue/library addressは、近傍行へ寄せずnullを返す。 */
export function cOffsetToLocation(map, offset) {
  if (!map?.ranges || !Number.isInteger(offset)) return null;
  const range = map.ranges.find((item) => offset >= item.start && offset < item.end);
  return range ? { file: range.file, line: range.line } : null;
}
