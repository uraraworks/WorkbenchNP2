function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function readName(table, offset) {
  let end = offset;
  while (end < table.length && table[end] !== 0) end++;
  return new TextDecoder().decode(table.subarray(offset, end));
}

/** NASMのELF32 little-endian relocatable objectから指定sectionを取り出す。 */
export function extractElfSection(bytes, wantedName) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array');
  if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c
      || bytes[3] !== 0x46 || bytes[4] !== 1 || bytes[5] !== 1) {
    throw new Error('ELF32 little-endian objectではありません');
  }
  const sectionOffset = readU32(bytes, 32);
  const sectionEntrySize = readU16(bytes, 46);
  const sectionCount = readU16(bytes, 48);
  const namesIndex = readU16(bytes, 50);
  if (sectionEntrySize < 40 || namesIndex >= sectionCount
      || sectionOffset + sectionEntrySize * sectionCount > bytes.length) {
    throw new Error('ELF section tableが不正です');
  }
  const namesHeader = sectionOffset + namesIndex * sectionEntrySize;
  const namesOffset = readU32(bytes, namesHeader + 16);
  const namesSize = readU32(bytes, namesHeader + 20);
  if (namesOffset + namesSize > bytes.length) throw new Error('ELF section name tableが不正です');
  const names = bytes.subarray(namesOffset, namesOffset + namesSize);
  for (let index = 0; index < sectionCount; index++) {
    const header = sectionOffset + index * sectionEntrySize;
    if (readName(names, readU32(bytes, header)) !== wantedName) continue;
    const offset = readU32(bytes, header + 16);
    const size = readU32(bytes, header + 20);
    if (offset + size > bytes.length) throw new Error(`${wantedName} sectionがELF範囲外です`);
    return new Uint8Array(bytes.slice(offset, offset + size));
  }
  throw new Error(`${wantedName} sectionがありません`);
}
