// IndexedDB 数据层：数据模型与 Swift 端一致
// Transaction { id, type(0支出/1收入), amountInCents, categoryId, note, date(ms), createdAt(ms) }
// Category    { id, name, icon, type, isSystem(0/1), sortOrder }
import { SEED_CATEGORIES } from './util.js';

const DB_NAME = 'bookkeep';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('Transaction')) {
        const s = db.createObjectStore('Transaction', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
        s.createIndex('categoryId', 'categoryId');
      }
      if (!db.objectStoreNames.contains('Category')) {
        const s = db.createObjectStore('Category', { keyPath: 'id', autoIncrement: true });
        s.createIndex('type', 'type');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// ---- 初始化：首次启动写入内置分类 ----
export async function initDB() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction('Category', 'readonly');
    const req = t.objectStore('Category').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).then(async (count) => {
    if (count === 0) {
      const t = db.transaction('Category', 'readwrite');
      const store = t.objectStore('Category');
      for (const c of SEED_CATEGORIES) store.add(c);
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    }
  });
}

// ---- Category ----
export async function getCategories() {
  const list = await tx('Category', 'readonly', (s) => s.getAll());
  return list.sort((a, b) => a.type - b.type || a.sortOrder - b.sortOrder || a.id - b.id);
}

export async function addCategory({ name, icon, type, sortOrder }) {
  return tx('Category', 'readwrite', (s) =>
    s.add({ name, icon, type, isSystem: 0, sortOrder }));
}

export async function deleteCategory(id) {
  return tx('Category', 'readwrite', (s) => s.delete(id));
}

// ---- Transaction ----
export async function getAllTransactions() {
  const list = await tx('Transaction', 'readonly', (s) => s.getAll());
  return list.sort((a, b) => a.date - b.date || a.id - b.id);
}

export async function addTransaction({ type, amountInCents, categoryId, note, date }) {
  const now = Date.now();
  return tx('Transaction', 'readwrite', (s) =>
    s.add({ type, amountInCents, categoryId, note, date, createdAt: now }));
}

export async function updateTransaction(t) {
  return tx('Transaction', 'readwrite', (s) => s.put(t));
}

export async function deleteTransaction(id) {
  return tx('Transaction', 'readwrite', (s) => s.delete(id));
}

// ---- 备份/恢复 ----
export async function exportAll() {
  const [transactions, categories] = await Promise.all([
    getAllTransactions(), getCategories()
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: transactions.map((t) => ({
      type: t.type, amountInCents: t.amountInCents, categoryId: t.categoryId,
      note: t.note, date: t.date, createdAt: t.createdAt
    })),
    categories: categories.map((c) => ({
      id: c.id, name: c.name, icon: c.icon, type: c.type,
      isSystem: c.isSystem, sortOrder: c.sortOrder
    }))
  };
}

// 恢复：清空后全量回写，内置分类按种子重建，自定义分类按备份恢复
export async function importAll(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.transactions)) {
    throw new Error('备份文件格式无效');
  }
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['Transaction', 'Category'], 'readwrite');
    t.objectStore('Transaction').clear();
    t.objectStore('Category').clear();
    const ts = t.objectStore('Transaction');
    for (const tr of data.transactions) {
      ts.add({ ...tr });
    }
    // 保留原始分类 id，保证账单的 categoryId 引用不变
    const cs = t.objectStore('Category');
    for (const c of data.categories || []) {
      cs.add({ ...c });
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
