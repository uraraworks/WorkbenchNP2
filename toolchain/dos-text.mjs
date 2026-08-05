const DOS_EOF = 0x1a;

/**
 * DOS時代のテキストツールはファイル末尾のCtrl-Zを論理EOFとして扱う。
 * 末尾から連続する0x1Aだけを除き、途中の0x1Aはバイナリ的な意図を壊さないよう
 * 書き換えず、そのまま各ツールへ渡せるよう位置だけを報告する。
 */
export function normalizeDosTextSource(source) {
  if (!(source instanceof Uint8Array)) throw new TypeError('source must be a Uint8Array');
  let logicalEnd = source.length;
  while (logicalEnd > 0 && source[logicalEnd - 1] === DOS_EOF) logicalEnd--;
  const normalized = logicalEnd === source.length ? source : source.slice(0, logicalEnd);
  return {
    source: normalized,
    dosEofBytesRemoved: source.length - logicalEnd,
    interiorDosEofOffset: normalized.indexOf(DOS_EOF),
  };
}
