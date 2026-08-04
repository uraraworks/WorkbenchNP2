// NASM -l リスティングを、ソース行と.COM内オフセットの対応へ変換する。
// 実行時CSはDOSローダが決めるため保持しない。.COMのORG 100hだけを加えた
// セグメント内オフセットを返し、CSとの組合せはデバッガ側の責務とする。

function parseNumber(text) {
  const value = text.trim();
  if (/^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value.slice(2), 16);
  if (/^[0-9a-f]+h$/i.test(value)) return Number.parseInt(value.slice(0, -1), 16);
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  return undefined;
}

function detectOrigin(lines) {
  for (const line of lines) {
    const source = line.length > 40 ? line.slice(40) : '';
    const match = source.match(/^\s*ORG\s+([^\s;]+)/i);
    if (!match) continue;
    const origin = parseNumber(match[1]);
    if (origin !== undefined) return origin;
  }
  return 0;
}

/**
 * @typedef {{srcLine: number, offset: number, bytes: number[], text: string}} ListingEntry
 */

/**
 * NASMリスティングを解析する。`BA[0C00]`や`AA<rep 14h>`は最終バイト表現ではないため、
 * アドレス欄から範囲だけを求め、bytesは必ず実際の生成物outputからコピーする。
 * したがってbytesとoutputの一致を再比較しても検証にはならない。アドレス欄の正しさは
 * verify-listing.mjsがリスティング自身の通常hexカラムを独立に読み、outputと突合して担保する。
 * 特殊表記の例: `BA[0C00]`は再配置値（実体はORG加算後の`BA0C01`）、
 * `AA<rep 14h>`は0xAAを0x14回反復する省略表記なので、単純なhex比較からは明示的に除外する。
 * 長いデータ行末の`4865...43-`に付く`-`は継続記号で、hex部分自体は比較可能。
 * 長いdb/timesの継続行は1エントリへ結合する。マクロ展開（<1>等）は呼出行へ対応付け、
 * 1行が複数命令になった場合は同じsrcLineを持つ複数エントリとして残す。
 *
 * @param {string} listing NASM -l の文字列
 * @param {Uint8Array} output NASMが生成した実バイナリ
 * @param {{origin?: number}} opts
 * @returns {ListingEntry[]}
 */
export function parseListing(listing, output, opts = {}) {
  if (typeof listing !== 'string') throw new TypeError('listing must be a string');
  if (!(output instanceof Uint8Array)) throw new TypeError('output must be a Uint8Array');
  const lines = listing.split(/\r?\n/);
  const origin = opts.origin ?? detectOrigin(lines);
  if (!Number.isInteger(origin) || origin < 0) throw new TypeError('origin must be a non-negative integer');

  const records = [];
  let macroInvocation;
  for (const line of lines) {
    if (!line.trim()) continue;
    const srcLine = Number.parseInt(line.slice(0, 6).trim(), 10);
    if (!Number.isInteger(srcLine) || srcLine < 1) continue;
    const addressText = line.slice(7, 15);
    const sourceText = line.length > 40 ? line.slice(40).trimEnd() : '';
    const expansion = /^<\d+>$/.test(line.slice(35, 40).trim());
    if (!/^[0-9a-f]{8}$/i.test(addressText)) {
      if (sourceText.trim()) macroInvocation = { srcLine, text: sourceText.trim() };
      continue;
    }
    const address = Number.parseInt(addressText, 16);
    records.push({
      srcLine: expansion && macroInvocation ? macroInvocation.srcLine : srcLine,
      address,
      text: expansion && macroInvocation ? macroInvocation.text : sourceText.trim(),
      continuation: !expansion && sourceText.trim().length === 0,
    });
  }

  const map = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const end = index + 1 < records.length ? records[index + 1].address : output.byteLength;
    if (record.address < 0 || end <= record.address || end > output.byteLength) {
      throw new Error(`invalid listing address range: ${record.address}..${end}`);
    }
    const bytes = Array.from(output.subarray(record.address, end));
    const previous = map[map.length - 1];
    if (record.continuation && previous?.srcLine === record.srcLine) {
      previous.bytes.push(...bytes);
      continue;
    }
    map.push({ srcLine: record.srcLine, offset: origin + record.address, bytes, text: record.text });
  }
  return map;
}

/** offsetが生成バイト列の途中なら、そのバイトを含むソース行番号を返す。 */
export function offsetToLine(map, offset) {
  if (!Array.isArray(map) || !Number.isInteger(offset)) return null;
  const entry = map.find((item) => offset >= item.offset && offset < item.offset + item.bytes.length);
  return entry?.srcLine ?? null;
}

/** ソース行が複数命令を生成する場合は、先頭命令のセグメント内オフセットを返す。 */
export function lineToOffset(map, srcLine) {
  if (!Array.isArray(map) || !Number.isInteger(srcLine)) return null;
  return map.find((item) => item.srcLine === srcLine)?.offset ?? null;
}
