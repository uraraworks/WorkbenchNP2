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

/**
 * ucppはCRLFの#include復帰位置で空行を二重計上し得るため、Cプリプロセッサへ
 * 渡すコピーだけをLFへ揃える。改行数と原文の行番号は変えず、変換件数を返して
 * 暗黙の入力変更にしない。単独CRは意味を決めつけず、そのまま保持する。
 */
export function normalizeCrLfForPreprocessor(source) {
  if (!(source instanceof Uint8Array)) throw new TypeError('source must be a Uint8Array');
  let count = 0;
  for (let index = 0; index + 1 < source.length; index++) {
    if (source[index] === 0x0d && source[index + 1] === 0x0a) count++;
  }
  if (count === 0) return { source, crlfSequencesNormalized: 0 };
  const output = new Uint8Array(source.length - count);
  let target = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] === 0x0d && source[index + 1] === 0x0a) continue;
    output[target++] = source[index];
  }
  return { source: output, crlfSequencesNormalized: count };
}
