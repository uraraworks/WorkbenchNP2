import { ProjectFS, validatePath } from './project-fs.mjs';

export const DIRECTORY_LIMITS = { maxDepth: 8, maxFiles: 2000 };
export const TEXT_EXTENSIONS = new Set(['asm', 'inc', 'mac', 'c', 'h', 'txt', 'md']);

const DATABASE_NAME = 'PC98DevDirectoryHandle';
const STORE_NAME = 'handles';
const ROOT_KEY = 'root';

export function isDirectoryPickerAvailable() {
  return typeof globalThis.showDirectoryPicker === 'function';
}

export function pickDirectory() {
  return globalThis.showDirectoryPicker({ mode: 'readwrite' });
}

function openHandleDatabase() {
  if (!globalThis.indexedDB) throw new Error('IndexedDB is not available');
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function requestHandleStore(mode, action) {
  const database = await openHandleDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function saveDirectoryHandle(handle) {
  await requestHandleStore('readwrite', (store) => store.put(handle, ROOT_KEY));
}

export async function loadDirectoryHandle() {
  return (await requestHandleStore('readonly', (store) => store.get(ROOT_KEY))) ?? null;
}

export async function clearDirectoryHandle() {
  await requestHandleStore('readwrite', (store) => store.delete(ROOT_KEY));
}

function isNotFound(error) {
  return error?.name === 'NotFoundError';
}

function decodeBytes(bytes) {
  try {
    return { content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { content: new TextDecoder('shift_jis').decode(bytes), encoding: 'shift_jis' };
  }
}

export class DirectoryProjectFS extends ProjectFS {
  constructor(handle, { limits = DIRECTORY_LIMITS } = {}) {
    super();
    if (handle?.kind !== 'directory') throw new TypeError('handle must be a directory handle');
    this.handle = handle;
    this.limits = limits;
  }

  get name() {
    return this.handle.name;
  }

  async ensurePermission(mode = 'readwrite', { request = false } = {}) {
    /** OPFS由来など権限APIを持たない本物のハンドルは、追加許可が不要なので許可済みとして扱う。 */
    if (typeof this.handle.queryPermission !== 'function') return 'granted';
    let permission = await this.handle.queryPermission({ mode });
    if (permission !== 'granted' && request && typeof this.handle.requestPermission === 'function') {
      permission = await this.handle.requestPermission({ mode });
    }
    return permission;
  }

  async listDetailed() {
    const files = [];
    let truncated = false;
    let skipped = 0;

    const visit = async (directory, prefix, depth) => {
      for await (const [name, entry] of directory.entries()) {
        if (name.startsWith('.')) continue;
        const path = validatePath(prefix ? `${prefix}/${name}` : name);
        if (entry.kind === 'directory') {
          if (depth < this.limits.maxDepth) await visit(entry, path, depth + 1);
          if (truncated) return;
          continue;
        }
        const dot = name.lastIndexOf('.');
        const extension = dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
        if (!TEXT_EXTENSIONS.has(extension)) {
          skipped += 1;
          continue;
        }
        const file = await entry.getFile();
        files.push({ path, size: file.size, updatedAt: file.lastModified });
        /** 上限到達を黙って正常完了にせず、呼び出し側が省略を表示できるよう打切り状態を残す。 */
        if (files.length >= this.limits.maxFiles) {
          truncated = true;
          return;
        }
      }
    };

    await visit(this.handle, '', 0);
    files.sort((left, right) => left.path.localeCompare(right.path));
    return { files, truncated, skipped };
  }

  async list() {
    return (await this.listDetailed()).files;
  }

  async parentDirectory(path, { create = false } = {}) {
    const normalized = validatePath(path);
    const parts = normalized.split('/');
    const fileName = parts.pop();
    let directory = this.handle;
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
    return { normalized, directory, fileName };
  }

  async read(path) {
    // 途中のディレクトリが無い場合も getDirectoryHandle が NotFoundError を投げる。
    // 「ファイルだけ無い」ケースと同じく null に寄せ、存在しないパスで例外にしない。
    let located;
    let handle;
    try {
      located = await this.parentDirectory(path);
      handle = await located.directory.getFileHandle(located.fileName);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const { normalized } = located;
    const file = await handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = decodeBytes(bytes);
    return {
      path: normalized,
      content: decoded.content,
      encoding: decoded.encoding,
      size: file.size,
      updatedAt: file.lastModified,
    };
  }

  async write(path, content, { overwriteEncoding = false } = {}) {
    if (typeof content !== 'string') throw new TypeError('content must be a string');
    const { normalized, directory, fileName } = await this.parentDirectory(path, { create: true });
    let handle;
    try {
      handle = await directory.getFileHandle(fileName);
      const existing = await handle.getFile();
      const bytes = new Uint8Array(await existing.arrayBuffer());
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        /** 当時のShift_JIS資産を利用者の明示なしにUTF-8へ不可逆変換しない。 */
        if (!overwriteEncoding) {
          throw new Error(`既存ファイルがShift_JISです。UTF-8で上書きするには明示指定が必要です: ${normalized}`);
        }
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
      handle = await directory.getFileHandle(fileName, { create: true });
    }
    const writable = await handle.createWritable();
    await writable.write(new TextEncoder().encode(content));
    await writable.close();
    const file = await handle.getFile();
    return {
      path: normalized,
      content,
      encoding: 'utf-8',
      size: file.size,
      updatedAt: file.lastModified,
    };
  }

  async delete(path) {
    // 途中のディレクトリごと存在しない場合も、IndexedDb実装と同じく黙って何もしない。
    try {
      const { directory, fileName } = await this.parentDirectory(path);
      await directory.getFileHandle(fileName);
      await directory.removeEntry(fileName);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}
