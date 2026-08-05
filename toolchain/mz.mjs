function readWord(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function writeWord(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

/** @param {Uint8Array} bytes */
export function parseMzHeader(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array');
  if (bytes.byteLength < 28 || readWord(bytes, 0) !== 0x5a4d) throw new Error('invalid MZ header');
  const lastPageBytes = readWord(bytes, 2);
  const pages = readWord(bytes, 4);
  const header = {
    lastPageBytes,
    pages,
    relocations: readWord(bytes, 6),
    headerParagraphs: readWord(bytes, 8),
    minAllocParagraphs: readWord(bytes, 10),
    maxAllocParagraphs: readWord(bytes, 12),
    ss: readWord(bytes, 14),
    sp: readWord(bytes, 16),
    ip: readWord(bytes, 20),
    cs: readWord(bytes, 22),
    relocationOffset: readWord(bytes, 24),
  };
  header.headerBytes = header.headerParagraphs * 16;
  header.declaredFileBytes = pages === 0 ? 0 : (pages - 1) * 512 + (lastPageBytes || 512);
  return header;
}

/** exebin.macのページ値はロードイメージ長なので、通常のMZファイル全長へ正規化する。 */
export function normalizeMzFileSize(bytes) {
  parseMzHeader(bytes);
  const output = new Uint8Array(bytes);
  const pages = Math.ceil(output.byteLength / 512);
  writeWord(output, 2, output.byteLength % 512);
  writeWord(output, 4, pages);
  const header = parseMzHeader(output);
  if (header.declaredFileBytes !== output.byteLength) throw new Error('failed to normalize MZ file size');
  return output;
}
