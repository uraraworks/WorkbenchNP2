function validatePath(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('path must be a non-empty string');
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('path must not contain empty, . or .. components');
  }
  return normalized;
}

/** 将来のFile System Access実装も同じ契約へ載せるProjectFS境界。 */
export class ProjectFS {
  async list() { throw new Error('ProjectFS.list() is not implemented'); }
  async read(_path) { throw new Error('ProjectFS.read() is not implemented'); }
  async write(_path, _content) { throw new Error('ProjectFS.write() is not implemented'); }
  async delete(_path) { throw new Error('ProjectFS.delete() is not implemented'); }
}

export class IndexedDbProjectFS extends ProjectFS {
  constructor({ indexedDB = globalThis.indexedDB, databaseName = 'PC98DevProjectFS' } = {}) {
    super();
    if (!indexedDB) throw new Error('IndexedDB is not available');
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.database = null;
  }

  async open() {
    if (this.database) return this;
    this.database = await new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'path' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    return this;
  }

  async request(mode, action) {
    await this.open();
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction('files', mode);
      const request = action(transaction.objectStore('files'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async list() {
    const records = await this.request('readonly', (store) => store.getAll());
    return records.sort((left, right) => left.path.localeCompare(right.path));
  }

  async read(path) {
    return (await this.request('readonly', (store) => store.get(validatePath(path)))) ?? null;
  }

  async write(path, content) {
    if (typeof content !== 'string') throw new TypeError('content must be a string');
    const record = { path: validatePath(path), content, updatedAt: Date.now() };
    await this.request('readwrite', (store) => store.put(record));
    return record;
  }

  async delete(path) {
    await this.request('readwrite', (store) => store.delete(validatePath(path)));
  }
}
