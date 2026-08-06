import { lineToOffset, offsetToLine } from '../toolchain/listing.mjs';
import { cLineToRanges, cOffsetToLocation } from '../toolchain/c-source-map.mjs';

/**
 * ASM listing map と C source map を、IDE が同じ手順で扱える 1 つの契約へ寄せる。
 * 契約は「行→BPを張る実行offsetの集合」「実行offset→行」「現在offsetの次の行」の3つだけで、
 * どちらの言語でも対応区間外は近傍行へ寄せず null を返す方針を維持する。
 */
function createDebugMap({ kind, entries, lineAt, breakpointOffsets }) {
  const ordered = [...entries].sort((a, b) => a.start - b.start || a.line - b.line);
  const lines = [...new Set(ordered.map((entry) => entry.line))].sort((a, b) => a - b);
  return {
    kind,
    entries: ordered,
    debuggableLines: () => [...lines],
    isDebuggable: (line) => lines.includes(line),
    breakpointOffsets,
    lineAt,
    /** 現在の実行offsetより後で、初めて別の行になる区間を返す。 */
    nextEntryFrom(offset) {
      if (!Number.isInteger(offset)) return null;
      const current = lineAt(offset);
      const next = ordered.find((entry) => entry.start > offset && entry.line !== current);
      return next ? { line: next.line, offsets: [next.start] } : null;
    },
  };
}

export function createAsmDebugMap(map) {
  if (!Array.isArray(map)) throw new TypeError('ASM listing map must be an array');
  const entries = map
    .filter((entry) => Number.isInteger(entry.srcLine) && Number.isInteger(entry.offset))
    .map((entry) => ({ line: entry.srcLine, start: entry.offset }));
  return createDebugMap({
    kind: 'asm',
    entries,
    lineAt: (offset) => offsetToLine(map, offset),
    breakpointOffsets: (line) => {
      const offset = lineToOffset(map, line);
      return offset === null ? [] : [offset];
    },
  });
}

export function createCDebugMap(map, file = 'in.c') {
  if (!map?.ranges) throw new TypeError('C source map must have ranges');
  const entries = map.ranges
    .filter((range) => range.file === file)
    .map((range) => ({ line: range.line, start: range.start }));
  return createDebugMap({
    kind: 'c',
    entries,
    lineAt: (offset) => cOffsetToLocation(map, offset)?.line ?? null,
    breakpointOffsets: (line) => cLineToRanges(map, line, file).map((range) => range.start),
  });
}

/** buildSource の結果から、拡張子ではなく生成物の種類で map を選ぶ。 */
export function debugMapForBuild(build) {
  if (build?.sourceMap?.ranges) return createCDebugMap(build.sourceMap);
  if (Array.isArray(build?.map)) return createAsmDebugMap(build.map);
  return null;
}
