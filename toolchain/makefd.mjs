const BYTES_PER_SECTOR = 1024;
const SECTORS_PER_CLUSTER = 1;
const RESERVED_SECTORS = 1;
const FAT_COUNT = 2;
const ROOT_ENTRIES = 192;
const TOTAL_SECTORS = 1232;
const MEDIA = 0xfe;
const SECTORS_PER_FAT = 2;
const SECTORS_PER_TRACK = 8;
const HEADS = 2;

const ROOT_SECTORS = (ROOT_ENTRIES * 32) / BYTES_PER_SECTOR;
const FAT_START = RESERVED_SECTORS;
const ROOT_START = FAT_START + FAT_COUNT * SECTORS_PER_FAT;
const DATA_START = ROOT_START + ROOT_SECTORS;
const DATA_CLUSTER_COUNT = TOTAL_SECTORS - DATA_START;
const DOS_COMPONENT = /^[A-Za-z0-9!#$%&'()\-@^_`{}~]+$/;

function validateComponent(value, label, maxLength, allowEmpty = false) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  if ((!allowEmpty && value.length === 0) || value.length > maxLength) {
    throw new Error(`${label} must be ${allowEmpty ? '0' : '1'}-${maxLength} characters`);
  }
  if (value.length > 0 && !DOS_COMPONENT.test(value)) {
    throw new Error(`${label} contains an invalid 8.3 filename character: ${value}`);
  }
  return value.toUpperCase();
}

function writeAscii(target, offset, text, width) {
  target.fill(0x20, offset, offset + width);
  for (let i = 0; i < text.length; i++) target[offset + i] = text.charCodeAt(i);
}

function setFatEntry(fat, cluster, value) {
  const offset = Math.floor(cluster * 3 / 2);
  if (cluster % 2 === 0) {
    fat[offset] = value & 0xff;
    fat[offset + 1] = (fat[offset + 1] & 0xf0) | ((value >> 8) & 0x0f);
  } else {
    fat[offset] = (fat[offset] & 0x0f) | ((value << 4) & 0xf0);
    fat[offset + 1] = (value >> 4) & 0xff;
  }
}

/**
 * Build a PC-98 2HD 1232 KiB FAT12 image.
 * @param {{name: string, ext: string, data: Uint8Array}[]} files
 * @returns {Uint8Array}
 */
export function makeFd(files) {
  if (!Array.isArray(files)) throw new TypeError('files must be an array');
  if (files.length > ROOT_ENTRIES) throw new Error(`too many files (maximum ${ROOT_ENTRIES})`);

  const normalized = files.map((file, index) => {
    if (!file || typeof file !== 'object') throw new TypeError(`files[${index}] must be an object`);
    const name = validateComponent(file.name, `files[${index}].name`, 8);
    const ext = validateComponent(file.ext, `files[${index}].ext`, 3, true);
    if (!(file.data instanceof Uint8Array)) {
      throw new TypeError(`files[${index}].data must be a Uint8Array`);
    }
    const clusters = Math.max(1, Math.ceil(file.data.byteLength / BYTES_PER_SECTOR));
    return { name, ext, data: file.data, clusters };
  });

  const names = new Set();
  for (const file of normalized) {
    const fullName = `${file.name}.${file.ext}`;
    if (names.has(fullName)) throw new Error(`duplicate 8.3 filename: ${fullName}`);
    names.add(fullName);
  }

  const requiredClusters = normalized.reduce((sum, file) => sum + file.clusters, 0);
  if (requiredClusters > DATA_CLUSTER_COUNT) {
    throw new Error(`files exceed floppy capacity (${requiredClusters} clusters required, ${DATA_CLUSTER_COUNT} available)`);
  }

  const image = new Uint8Array(TOTAL_SECTORS * BYTES_PER_SECTOR);
  const view = new DataView(image.buffer);

  image.set([0xeb, 0x3c, 0x90], 0);
  writeAscii(image, 3, 'PC98DEV', 8);
  view.setUint16(11, BYTES_PER_SECTOR, true);
  image[13] = SECTORS_PER_CLUSTER;
  view.setUint16(14, RESERVED_SECTORS, true);
  image[16] = FAT_COUNT;
  view.setUint16(17, ROOT_ENTRIES, true);
  view.setUint16(19, TOTAL_SECTORS, true);
  image[21] = MEDIA;
  view.setUint16(22, SECTORS_PER_FAT, true);
  view.setUint16(24, SECTORS_PER_TRACK, true);
  view.setUint16(26, HEADS, true);
  view.setUint32(28, 0, true);
  image[510] = 0x55;
  image[511] = 0xaa;

  const fat = new Uint8Array(SECTORS_PER_FAT * BYTES_PER_SECTOR);
  setFatEntry(fat, 0, 0xf00 | MEDIA);
  setFatEntry(fat, 1, 0xfff);

  const root = new Uint8Array(ROOT_SECTORS * BYTES_PER_SECTOR);
  const rootView = new DataView(root.buffer);
  let nextCluster = 2;

  normalized.forEach((file, fileIndex) => {
    const firstCluster = nextCluster;
    for (let i = 0; i < file.clusters; i++) {
      const cluster = firstCluster + i;
      setFatEntry(fat, cluster, i === file.clusters - 1 ? 0xfff : cluster + 1);
      const sourceStart = i * BYTES_PER_SECTOR;
      const sourceEnd = Math.min(sourceStart + BYTES_PER_SECTOR, file.data.byteLength);
      const destination = (DATA_START + cluster - 2) * BYTES_PER_SECTOR;
      image.set(file.data.subarray(sourceStart, sourceEnd), destination);
    }
    nextCluster += file.clusters;

    const offset = fileIndex * 32;
    writeAscii(root, offset, file.name, 8);
    writeAscii(root, offset + 8, file.ext, 3);
    root[offset + 11] = 0x20;
    rootView.setUint16(offset + 22, 0, true);
    rootView.setUint16(offset + 24, ((2026 - 1980) << 9) | (7 << 5) | 31, true);
    rootView.setUint16(offset + 26, firstCluster, true);
    rootView.setUint32(offset + 28, file.data.byteLength, true);
  });

  for (let i = 0; i < FAT_COUNT; i++) {
    image.set(fat, (FAT_START + i * SECTORS_PER_FAT) * BYTES_PER_SECTOR);
  }
  image.set(root, ROOT_START * BYTES_PER_SECTOR);
  return image;
}
