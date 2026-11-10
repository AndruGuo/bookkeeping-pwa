// 云端同步层：Cloudflare API 为主存储，IndexedDB 为离线缓存
// 策略：
//  - 启动/网络恢复时 sync()：重放本地未同步的改动 → 拉取全量覆盖本地
//  - 写操作：先发云端，成功后写本地；失败则只写本地并记入 pending，待下次 sync 重放
//  - 冲突：以本地为准（重放 push），随后拉全量覆盖本地
import * as db from './db.js';
import { loadSettings, getPassword } from './backup.js';

const PENDING_KEY = 'bk_pending';
const LAST_SYNC_KEY = 'bk_last_sync';
export const DEFAULT_API = 'https://api.andru.de5.net';

function emptyPending() {
  return { txAdds: [], txDeletes: [], catAdds: [], catDeletes: [], catIdMap: {} };
}
function loadPending() {
  try { return { ...emptyPending(), ...(JSON.parse(localStorage.getItem(PENDING_KEY)) || {}) }; }
  catch { return emptyPending(); }
}
function savePending(p) { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); }

export function lastSyncInfo() {
  try { return JSON.parse(localStorage.getItem(LAST_SYNC_KEY)) || null; }
  catch { return null; }
}
function setLastSync(info) { localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(info)); }

export function isConfigured() {
  const s = loadSettings();
  return !!(s.password || s.passwordSealed);
}

// ---- API 请求（X-Auth 鉴权）----
async function api(path, opts = {}) {
  const s = loadSettings();
  const base = (s.apiBase || DEFAULT_API).replace(/\/+$/, '');
  const pwd = await getPassword(s);
  if (!pwd) throw new Error('NOAUTH');
  const headers = { 'X-Auth': pwd };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error(`云端请求失败 (${res.status})`);
  return res.json();
}

// ---- 字段映射：本地 camelCase ↔ 云端 snake_case ----
const txToServer = (t) => ({
  type: t.type, amount_in_cents: t.amountInCents, category_id: t.categoryId,
  note: t.note || '', date: t.date, created_at: t.createdAt || Date.now()
});
const txFromServer = (j) => ({
  id: j.id, type: j.type, amountInCents: j.amount_in_cents, categoryId: j.category_id,
  note: j.note || '', date: j.date, createdAt: j.created_at
});
const catToServer = (c) => ({
  name: c.name, icon: c.icon, type: c.type, is_system: c.isSystem || 0, sort_order: c.sortOrder || 0
});
const catFromServer = (j) => ({
  id: j.id, name: j.name, icon: j.icon, type: j.type, isSystem: j.is_system || 0, sortOrder: j.sort_order || 0
});

// ---- 全量同步：重放 pending → 拉全量覆盖本地 ----
export async function sync() {
  if (!isConfigured()) return { status: 'noauth' };
  let server;
  try {
    server = await api('/api/data');
  } catch (e) {
    setLastSync({ at: Date.now(), ok: false, msg: e.message });
    return { status: 'offline', msg: e.message };
  }

  const p = loadPending();
  let localTxs = await db.getAllTransactions();
  let localCats = await db.getCategories();

  // 本地多出的记录 adopt 上去（仅当云端为空且本地有数据、无未重放项时，避免重复）
  if (server.categories.length === 0 && localCats.length > 0 && p.catAdds.length === 0) {
    p.catAdds = localCats.map((c) => ({ ...c }));
  }
  if (server.transactions.length === 0 && localTxs.length > 0 && p.txAdds.length === 0) {
    p.txAdds = localTxs.map((t) => ({ ...t }));
  }

  // 重放 pending：失败的保留，下次再试
  const remain = emptyPending();
  remain.catIdMap = { ...p.catIdMap };
  for (const c of p.catDeletes) {
    try { await api('/api/cat/' + c.id, { method: 'DELETE' }); }
    catch (e) { if (!/404/.test(e.message)) remain.catDeletes.push(c); }
  }
  for (const c of p.catAdds) {
    try {
      const j = await api('/api/cat', { method: 'POST', body: catToServer(c) });
      remain.catIdMap[c.id] = j.id;
    } catch (e) { remain.catAdds.push(c); }
  }
  for (const t of p.txAdds) {
    try {
      const body = txToServer(t);
      body.category_id = remain.catIdMap[body.category_id] || body.category_id;
      await api('/api/tx', { method: 'POST', body });
    } catch (e) { remain.txAdds.push(t); }
  }
  for (const id of p.txDeletes) {
    try { await api('/api/tx/' + id, { method: 'DELETE' }); }
    catch (e) { if (!/404/.test(e.message)) remain.txDeletes.push(id); }
  }
  savePending(remain);

  if (remain.txAdds.length || remain.catAdds.length || remain.txDeletes.length || remain.catDeletes.length) {
    // 有未重放成功的改动：不覆盖本地（以本地为准），保持离线标记
    setLastSync({ at: Date.now(), ok: false, msg: '部分改动未同步，将在下次重试' });
    return { status: 'partial' };
  }

  // 全部重放成功：拉全量覆盖本地
  server = await api('/api/data');
  await db.replaceAll(
    server.categories.map(catFromServer),
    server.transactions.map(txFromServer)
  );
  setLastSync({ at: Date.now(), ok: true, txs: server.transactions.length, cats: server.categories.length });
  return { status: 'ok', txs: server.transactions.length, cats: server.categories.length };
}

// ---- 写操作：云端优先，失败则本地 + pending ----
export async function addTransaction(fields) {
  const t = { ...fields, createdAt: Date.now() };
  try {
    const j = await api('/api/tx', { method: 'POST', body: txToServer(t) });
    const rec = { ...t, id: j.id };
    await db.putTransaction(rec);
    return rec.id;
  } catch (e) {
    const id = await db.addTransaction(t);
    const p = loadPending();
    p.txAdds.push({ ...t, id });
    savePending(p);
    return id;
  }
}

export async function deleteTransaction(id) {
  const all = await db.getAllTransactions();
  const t = all.find((x) => x.id === id);
  const p = loadPending();
  // 从未同步成功过的本地新增：直接丢弃，不请求云端
  const pendIdx = p.txAdds.findIndex((x) => x.id === id);
  if (pendIdx >= 0) {
    p.txAdds.splice(pendIdx, 1);
    savePending(p);
    await db.deleteTransaction(id);
    return;
  }
  let cloudDone = false;
  try {
    await api('/api/tx/' + id, { method: 'DELETE' });
    cloudDone = true;
  } catch (e) {
    if (!/404/.test(e.message)) { p.txDeletes.push(id); savePending(p); }
  }
  await db.deleteTransaction(id);
  return cloudDone;
}

export async function addCategory(fields) {
  const c = { ...fields, isSystem: 0 };
  try {
    const j = await api('/api/cat', { method: 'POST', body: catToServer(c) });
    const rec = { ...c, id: j.id };
    await db.putCategory(rec);
    return rec.id;
  } catch (e) {
    const id = await db.addCategory(c);
    const p = loadPending();
    p.catAdds.push({ ...c, id });
    savePending(p);
    return id;
  }
}

export async function deleteCategory(id) {
  const p = loadPending();
  const pendIdx = p.catAdds.findIndex((x) => x.id === id);
  if (pendIdx >= 0) {
    p.catAdds.splice(pendIdx, 1);
    savePending(p);
    await db.deleteCategory(id);
    return;
  }
  try {
    await api('/api/cat/' + id, { method: 'DELETE' });
  } catch (e) {
    if (!/404/.test(e.message)) { p.catDeletes.push({ id }); savePending(p); }
  }
  await db.deleteCategory(id);
}
