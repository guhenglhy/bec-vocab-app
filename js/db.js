/* IndexedDB 存储层 */
const DB_NAME = 'BecVocabDB';
const DB_VERSION = 1;
const STORES = { progress: 'wordProgress', stats: 'dailyStats', settings: 'settings' };

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.progress)) {
        const store = db.createObjectStore(STORES.progress, { keyPath: 'wordId' });
        store.createIndex('nextReview', 'nextReview', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.stats)) {
        const store = db.createObjectStore(STORES.stats, { keyPath: 'date' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

const DB = {
  /* ---- 单词进度 ---- */
  async getProgress(wordId) {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORES.progress, 'readonly');
      const req = tx.objectStore(STORES.progress).get(wordId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },

  async getAllProgress() {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORES.progress, 'readonly');
      const req = tx.objectStore(STORES.progress).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async saveProgress(progress) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.progress, 'readwrite');
      tx.objectStore(STORES.progress).put(progress);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async saveProgressBatch(items) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.progress, 'readwrite');
      const store = tx.objectStore(STORES.progress);
      items.forEach(item => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /* ---- 每日统计 ---- */
  async getTodayStats() {
    const today = new Date().toISOString().slice(0, 10);
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORES.stats, 'readonly');
      const req = tx.objectStore(STORES.stats).get(today);
      req.onsuccess = () => resolve(req.result || { date: today, learned: 0, quizCorrect: 0, quizTotal: 0, streak: 0 });
      req.onerror = () => resolve({ date: today, learned: 0, quizCorrect: 0, quizTotal: 0, streak: 0 });
    });
  },

  async updateTodayStats(updates) {
    const stats = await this.getTodayStats();
    Object.assign(stats, updates, { timestamp: Date.now() });

    // Calculate streak
    const allStats = await this.getAllStats();
    allStats.sort((a, b) => b.date.localeCompare(a.date));

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < allStats.length; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (allStats.some(s => s.date === dateStr && s.learned > 0)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    stats.streak = streak;

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.stats, 'readwrite');
      tx.objectStore(STORES.stats).put(stats);
      tx.oncomplete = () => resolve(stats);
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAllStats() {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORES.stats, 'readonly');
      const req = tx.objectStore(STORES.stats).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  /* ---- 设置 ---- */
  async getSetting(key, defaultValue = null) {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORES.settings, 'readonly');
      const req = tx.objectStore(STORES.settings).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
      req.onerror = () => resolve(defaultValue);
    });
  },

  async setSetting(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.settings, 'readwrite');
      tx.objectStore(STORES.settings).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /* ---- 数据管理 ---- */
  async clearAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(Object.values(STORES), 'readwrite');
      Object.values(STORES).forEach(name => {
        tx.objectStore(name).clear();
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};
