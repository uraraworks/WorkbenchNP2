const DOS_COMPONENT = /^[A-Za-z0-9!#$%&'()\-@^_`{}~]+$/;

function validateComponent(value, label, maxLength, allowEmpty = false) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  if ((!allowEmpty && value.length === 0) || value.length > maxLength) {
    throw new Error(`${label} must be ${allowEmpty ? '0' : '1'}-${maxLength} characters`);
  }
  if (value && !DOS_COMPONENT.test(value)) {
    throw new Error(`${label} contains an invalid 8.3 filename character: ${value}`);
  }
  return value.toUpperCase();
}

function parseBpb(image) {
  if (!(image instanceof Uint8Array)) throw new TypeError('image must be a Uint8Array');
  if (image.byteLength < 36) throw new Error('image is too small to contain a FAT BPB');

  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const bytesPerSector = view.getUint16(11, true);
  const sectorsPerCluster = image[13];
  const reservedSectors = view.getUint16(14, true);
  const fatCount = image[16];
  const rootEntries = view.getUint16(17, true);
  const totalSectors16 = view.getUint16(19, true);
  const sectorsPerFat = view.getUint16(22, true);
  const totalSectors = totalSectors16 || view.getUint32(32, true);

  if (!bytesPerSector || (bytesPerSector & (bytesPerSector - 1)) !== 0) {
    throw new Error(`invalid BPB bytes per sector: ${bytesPerSector}`);
  }
  if (!sectorsPerCluster || (sectorsPerCluster & (sectorsPerCluster - 1)) !== 0) {
    throw new Error(`invalid BPB sectors per cluster: ${sectorsPerCluster}`);
  }
  if (!reservedSectors || !fatCount || !rootEntries || !sectorsPerFat || !totalSectors) {
    throw new Error('invalid or unsupported FAT BPB geometry');
  }

  const rootSectors = Math.ceil(rootEntries * 32 / bytesPerSector);
  const fatStartSector = reservedSectors;
  const rootStartSector = fatStartSector + fatCount * sectorsPerFat;
  const dataStartSector = rootStartSector + rootSectors;
  const dataSectors = totalSectors - dataStartSector;
  const clusterCount = Math.floor(dataSectors / sectorsPerCluster);
  const fatBytes = sectorsPerFat * bytesPerSector;
  const fatEntryCapacity = Math.floor(fatBytes * 2 / 3);

  if (dataSectors < 0 || clusterCount <= 0) throw new Error('BPB has no usable data area');
  if (clusterCount >= 4085) throw new Error(`image is not FAT12 (${clusterCount} data clusters)`);
  if (clusterCount + 2 > fatEntryCapacity) throw new Error('FAT is too small for the BPB data area');
  if (totalSectors * bytesPerSector > image.byteLength) {
    throw new Error('image is shorter than the total sector count in its BPB');
  }

  return {
    bytesPerSector,
    sectorsPerCluster,
    fatCount,
    rootEntries,
    sectorsPerFat,
    totalSectors,
    fatOffset: fatStartSector * bytesPerSector,
    fatBytes,
    rootOffset: rootStartSector * bytesPerSector,
    dataOffset: dataStartSector * bytesPerSector,
    clusterBytes: bytesPerSector * sectorsPerCluster,
    // 0xff0-0xff6 are reserved FAT12 values and cannot be chain links.
    maxCluster: Math.min(clusterCount + 1, 0xfef),
  };
}

function getFatEntry(image, bpb, cluster) {
  const offset = bpb.fatOffset + Math.floor(cluster * 3 / 2);
  const pair = image[offset] | (image[offset + 1] << 8);
  return cluster % 2 === 0 ? pair & 0x0fff : pair >>> 4;
}

function setFatEntry(image, bpb, cluster, value) {
  for (let copy = 0; copy < bpb.fatCount; copy++) {
    const fatOffset = bpb.fatOffset + copy * bpb.fatBytes;
    const offset = fatOffset + Math.floor(cluster * 3 / 2);
    if (cluster % 2 === 0) {
      image[offset] = value & 0xff;
      image[offset + 1] = (image[offset + 1] & 0xf0) | ((value >>> 8) & 0x0f);
    } else {
      image[offset] = (image[offset] & 0x0f) | ((value << 4) & 0xf0);
      image[offset + 1] = (value >>> 4) & 0xff;
    }
  }
}

function chainFor(image, bpb, firstCluster, label) {
  if (firstCluster === 0) return [];
  const chain = [];
  const visited = new Set();
  let cluster = firstCluster;
  while (true) {
    if (cluster < 2 || cluster > bpb.maxCluster) {
      throw new Error(`invalid FAT chain for ${label}: cluster ${cluster}`);
    }
    if (visited.has(cluster)) throw new Error(`invalid FAT chain for ${label}: loop at cluster ${cluster}`);
    visited.add(cluster);
    chain.push(cluster);
    const next = getFatEntry(image, bpb, cluster);
    if (next >= 0xff8) return chain;
    if (next === 0 || next === 0xff7 || next >= 0xff0) {
      throw new Error(`invalid FAT chain for ${label}: value 0x${next.toString(16)}`);
    }
    cluster = next;
  }
}

function shortNameBytes(name, ext) {
  const bytes = new Uint8Array(11).fill(0x20);
  for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i);
  for (let i = 0; i < ext.length; i++) bytes[8 + i] = ext.charCodeAt(i);
  return bytes;
}

function equalName(image, offset, bytes) {
  for (let i = 0; i < 11; i++) if (image[offset + i] !== bytes[i]) return false;
  return true;
}

/**
 * Add or replace files in the root directory of a FAT12 disk image.
 * The input image is never modified; a changed copy is returned.
 * @param {Uint8Array} image
 * @param {{name: string, ext: string, data: Uint8Array}[]} files
 * @returns {Uint8Array}
 */
export function addFiles(image, files) {
  const bpb = parseBpb(image);
  if (!Array.isArray(files)) throw new TypeError('files must be an array');

  const normalized = files.map((file, index) => {
    if (!file || typeof file !== 'object') throw new TypeError(`files[${index}] must be an object`);
    const name = validateComponent(file.name, `files[${index}].name`, 8);
    const ext = validateComponent(file.ext, `files[${index}].ext`, 3, true);
    if (!(file.data instanceof Uint8Array)) {
      throw new TypeError(`files[${index}].data must be a Uint8Array`);
    }
    return { name, ext, data: file.data, shortName: shortNameBytes(name, ext) };
  });

  const requested = new Set();
  for (const file of normalized) {
    const key = `${file.name}.${file.ext}`;
    if (requested.has(key)) throw new Error(`duplicate 8.3 filename: ${key}`);
    requested.add(key);
  }

  const output = new Uint8Array(image);
  const view = new DataView(output.buffer);

  for (const file of normalized) {
    let entryOffset = -1;
    let freeOffset = -1;
    for (let index = 0; index < bpb.rootEntries; index++) {
      const offset = bpb.rootOffset + index * 32;
      const first = output[offset];
      if ((first === 0x00 || first === 0xe5) && freeOffset < 0) freeOffset = offset;
      if (first === 0x00) break;
      if (first !== 0x00 && first !== 0xe5 && output[offset + 11] !== 0x0f &&
          equalName(output, offset, file.shortName)) {
        entryOffset = offset;
        break;
      }
    }

    if (entryOffset >= 0) {
      const attributes = output[entryOffset + 11];
      if (attributes & 0x18) throw new Error(`${file.name}.${file.ext} exists but is not a regular file`);
      const oldChain = chainFor(
        output,
        bpb,
        view.getUint16(entryOffset + 26, true),
        `${file.name}.${file.ext}`,
      );
      for (const cluster of oldChain) setFatEntry(output, bpb, cluster, 0);
    } else {
      if (freeOffset < 0) throw new Error(`root directory is full; cannot add ${file.name}.${file.ext}`);
      entryOffset = freeOffset;
    }

    const required = Math.ceil(file.data.byteLength / bpb.clusterBytes);
    const clusters = [];
    for (let cluster = 2; cluster <= bpb.maxCluster && clusters.length < required; cluster++) {
      if (getFatEntry(output, bpb, cluster) === 0) clusters.push(cluster);
    }
    if (clusters.length !== required) {
      throw new Error(`not enough free space for ${file.name}.${file.ext}: ${required} clusters required, ${clusters.length} available`);
    }

    for (let index = 0; index < clusters.length; index++) {
      const cluster = clusters[index];
      setFatEntry(output, bpb, cluster, index + 1 < clusters.length ? clusters[index + 1] : 0xfff);
      const destination = bpb.dataOffset + (cluster - 2) * bpb.clusterBytes;
      output.fill(0, destination, destination + bpb.clusterBytes);
      const source = index * bpb.clusterBytes;
      output.set(file.data.subarray(source, source + bpb.clusterBytes), destination);
    }

    output.fill(0, entryOffset, entryOffset + 32);
    output.set(file.shortName, entryOffset);
    output[entryOffset + 11] = 0x20;
    view.setUint16(entryOffset + 26, clusters[0] ?? 0, true);
    view.setUint32(entryOffset + 28, file.data.byteLength, true);
  }

  return output;
}
