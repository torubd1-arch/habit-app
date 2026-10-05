// テスト用の localStorage 互換オブジェクト

export class MemoryStorage {
  constructor() {
    this.map = new Map();
    this.failSet = null; // (key) => boolean を返す関数。true で setItem が例外
    this.failGet = false;
  }

  getItem(key) {
    if (this.failGet) throw new Error('SecurityError');
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    if (this.failSet && this.failSet(key)) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}
