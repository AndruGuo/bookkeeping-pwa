// 云端数据层（A 方案）：云端实时写入 + 本地缓存 + 断网排队补传
// 本地存储：
//   bk_cache    —— 最近一次 GET /api/data 全量 {categories, transactions}（camelCase，同 sync 返回结构）
//   bk_pending  —— 待同步队列 {tx:[], txUpdates:[], txDeletes:[], cats:[], catDeletes:[]}
//   仅保留：登录 token/username（localStorage）与 API 地址设置
const SETTINGS_KEY = 'bk_backup_settings';
const TOKEN_KEY = 'bk_token';
const USERNAME_KEY = 'bk_username';
const CACHE_KEY = 'bk_cache';
const PENDING_KEY = 'bk_pending';
export const DEFAULT_API = 'https://api.andru.de5.net';

// 请求超时：超时视为网络失败（可排队补传），不等浏览器默认超时
const FETCH_TIMEOUT = 15000;
// 缓存超过 ~4MB 时只保留最近 2000 条交易
const CACHE_SOFT_LIMIT = 4 * 1024 * 1024;
const CACHE_TX_KEEP = 2000;

// ---- 设置（仅 API 地址）----
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ---- 用户会话 ----
export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function getUsername() { return localStorage.getItem(USERNAME_KEY) || ''; }
export function isAuthed() { return !!getToken(); }
function setSession(token, username) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username || '');
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  }
}

function apiBase() {
  return (loadSettings().apiBase || DEFAULT_API).replace(/\/+$/, '');
}

// ---- 认证接口 ----
export async function register(username, password, invite) {
  const res = await fetch(apiBase() + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, invite })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `注册失败 (${res.status})`);
  setSession(j.token, j.username);
  return j;
}

export async function login(username, password) {
  const res = await fetch(apiBase() + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `登录失败 (${res.status})`);
  setSession(j.token, j.username);
  return j;
}

export async function logout() {
  const token = getToken();
  if (token) {
    try {
      await fetch(apiBase() + '/api/logout', { method: 'POST', headers: { 'X-Auth': token } });
    } catch { /* 忽略网络错误，本地照常登出 */ }
  }
  setSession(null);
}

// ---- 离线状态 ----
let offlineFlag = false; // 最近一次全量拉取是否失败（退回缓存）
export function isOffline() { return offlineFlag || !navigator.onLine; }

// ---- 待同步队列 ----
function emptyPending() { return { tx: [], txUpdates: [], txDeletes: [], cats: [], catDeletes: [] }; }
function loadPending() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY));
    return p && typeof p === 'object' ? { ...emptyPending(), ...p } : emptyPending();
  } catch { return emptyPending(); }
}
function savePending(p) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); }
  catch { /* 队列过大写不进：保留内存态，下次操作重试 */ }
}
export function pendingCount() {
  const p = loadPending();
  return p.tx.length + p.txUpdates.length + p.txDeletes.length + p.cats.length + p.catDeletes.length;
}

// 本地临时 id：负数（UI 的 Number(dataset.txid) 兼容），与真实服务端 id（正数）不冲突
let tmpSeq = 0;
function tmpId() { return -(Date.now() * 10 + (++tmpSeq % 10)); }
const isTmpId = (id) => id < 0;

// ---- 本地缓存 ----
function trimCache(data) {
  // 按日期升序保留最近 CACHE_TX_KEEP 条（cache 里 transactions 已按 date 升序）
  if (!data || !Array.isArray(data.transactions) || data.transactions.length <= CACHE_TX_KEEP) return data;
  return { ...data, transactions: data.transactions.slice(-CACHE_TX_KEEP) };
}
function saveCache(data) {
  const d = trimCache(data);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(d));
  } catch {
    // 仍放不下（配额超限）：降级裁剪后重试一次
    try {
      const cut = { categories: d.categories || [], transactions: (d.transactions || []).slice(-CACHE_TX_KEEP) };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cut));
    } catch { /* 放弃缓存，云端仍是权威数据 */ }
  }
}
export function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!c || !Array.isArray(c.categories) || !Array.isArray(c.transactions)) return null;
    return c;
  } catch { return null; }
}
function updateCache(mutator) {
  const cur = loadCache() || { categories: [], transactions: [] };
  mutator(cur);
  saveCache(cur);
}

// ---- API 请求（X-Auth: session token）----
// 返回 {ok, status, json}；网络失败/超时 → ok:false, network:true；4xx/5xx → ok:false
async function apiRaw(path, opts = {}) {
  const token = getToken();
  if (!token) return { ok: false, status: 0, network: false, noauth: true };
  const headers = { 'X-Auth': token };
  if (opts.body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    res = await fetch(apiBase() + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal
    });
    clearTimeout(timer);
  } catch {
    return { ok: false, status: 0, network: true };
  }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

// 可排队（可重试）的失败：网络错误/超时/5xx。4xx 视为业务错误，立即抛给 UI
function isRetryable(r) { return r.network || r.status >= 500; }
function errFrom(r) {
  if (r.noauth) return new Error('NOAUTH');
  if (r.network) return new Error('网络不可用，请检查网络连接');
  return new Error(`云端请求失败 (${r.status})`);
}

// 导出数据（返回 Blob，触发下载）
export async function exportData() {
  const res = await fetch(apiBase() + '/api/export', { headers: { 'X-Auth': getToken() } });
  if (!res.ok) throw new Error(`导出失败 (${res.status})`);
  return res.blob();
}

export async function wipeData() {
  const r = await apiRaw('/api/wipe', { method: 'POST', body: {} });
  if (!r.ok) throw errFrom(r);
  // 清空成功：缓存与队列一并清掉
  saveCache({ categories: [], transactions: [] });
  savePending(emptyPending());
  return r.json;
}

export function isConfigured() {
  return isAuthed();
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
const catFromServer = (j) => ({
  id: j.id, name: j.name, icon: j.icon, type: j.type, isSystem: j.is_system || 0, sortOrder: j.sort_order || 0
});

const sortData = (data) => ({
  categories: (data.categories || []).map(catFromServer)
    .sort((a, b) => a.type - b.type || a.sortOrder - b.sortOrder || a.id - b.id),
  transactions: (data.transactions || []).map(txFromServer)
    .sort((a, b) => a.date - b.date || a.id - b.id)
});

// ---- 全量拉取 + 冲刷队列 ----
// 成功：冲刷 pending → 拉全量覆盖缓存（最后写入赢，以服务端为准），返回最新数据
// 失败：退回本地缓存数据（可能含乐观更新），标记 offline
export async function sync() {
  if (!isConfigured()) throw new Error('NOAUTH');
  try {
    await flushPending();
    const r = await apiRaw('/api/data');
    if (!r.ok) throw errFrom(r);
    const data = sortData({ categories: r.json.categories || [], transactions: r.json.transactions || [] });
    saveCache(data);
    offlineFlag = false;
    return data;
  } catch (e) {
    if (/NOAUTH|重新登录/.test(e.message || '')) throw e;
    // 网络失败：退回缓存
    offlineFlag = true;
    const cached = loadCache();
    if (cached) return cached;
    throw e; // 无缓存可用，向上抛
  }
}

// 冲刷待同步队列：逐条重放，成功则出队；临时 id 替换为服务端 id 并修正缓存引用
async function flushPending() {
  const p = loadPending();
  // 1. 新增交易
  for (let i = 0; i < p.tx.length; i++) {
    const r = await apiRaw('/api/tx', { method: 'POST', body: txToServer(p.tx[i]) });
    if (r.ok) {
      remapId('tx', p.tx[i].id, r.json.id);
      p.tx.splice(i, 1); i--;
    } else if (!isRetryable(r)) {
      p.tx.splice(i, 1); i--; // 4xx 业务错误：放弃该条（数据无效，重放也无用）
    }
  }
  // 2. 更新交易
  for (let i = 0; i < p.txUpdates.length; i++) {
    const u = p.txUpdates[i];
    if (isTmpId(u.id)) { p.txUpdates.splice(i, 1); i--; continue; } // 引用的临时单已消失（被 4xx 丢弃）：放弃
    const r = await apiRaw('/api/tx/' + u.id, { method: 'PUT', body: txToServer(u.fields) });
    if (r.ok) { p.txUpdates.splice(i, 1); i--; }
    else if (!isRetryable(r)) { p.txUpdates.splice(i, 1); i--; }
  }
  // 3. 删除交易
  for (let i = 0; i < p.txDeletes.length; i++) {
    const id = p.txDeletes[i];
    if (isTmpId(id)) { p.txDeletes.splice(i, 1); i--; continue; } // 临时单未上传即删：本地删过即可
    const r = await apiRaw('/api/tx/' + id, { method: 'DELETE' });
    if (r.ok || r.status === 404) { p.txDeletes.splice(i, 1); i--; }
    else if (!isRetryable(r)) { p.txDeletes.splice(i, 1); i--; }
  }
  // 4. 新增分类
  for (let i = 0; i < p.cats.length; i++) {
    const c = p.cats[i];
    const r = await apiRaw('/api/cat', {
      method: 'POST',
      body: { name: c.name, icon: c.icon, type: c.type, is_system: 0, sort_order: c.sortOrder || 0 }
    });
    if (r.ok) {
      remapId('cat', c.id, r.json.id);
      p.cats.splice(i, 1); i--;
    } else if (!isRetryable(r)) {
      p.cats.splice(i, 1); i--;
    }
  }
  // 5. 删除分类
  for (let i = 0; i < p.catDeletes.length; i++) {
    const id = p.catDeletes[i];
    if (isTmpId(id)) { p.catDeletes.splice(i, 1); i--; continue; }
    const r = await apiRaw('/api/cat/' + id, { method: 'DELETE' });
    if (r.ok || r.status === 404) { p.catDeletes.splice(i, 1); i--; }
    else if (!isRetryable(r)) { p.catDeletes.splice(i, 1); i--; }
  }
  savePending(p);
}

// 临时 id → 服务端 id：修正缓存 + 队列中所有引用
function remapId(kind, tmp, real) {
  updateCache((c) => {
    if (kind === 'tx') {
      for (const t of c.transactions) if (t.id === tmp) t.id = real;
    } else {
      for (const cat of c.categories) if (cat.id === tmp) cat.id = real;
      for (const t of c.transactions) if (t.categoryId === tmp) t.categoryId = real;
    }
  });
  const p = loadPending();
  if (kind === 'tx') {
    for (const u of p.txUpdates) if (u.id === tmp) u.id = real;
    p.txDeletes = p.txDeletes.map((id) => (id === tmp ? real : id));
  } else {
    for (const c2 of p.cats) if (c2.id === tmp) c2.id = real;
    p.catDeletes = p.catDeletes.map((id) => (id === tmp ? real : id));
  }
  savePending(p);
}

// ---- 写操作：先调 API；可重试失败 → 入队 + 乐观更新缓存，返回成功（用户无感）----
// 返回本地生效的记录（含真实 id 或临时 id）
export async function addTransaction(fields) {
  const t = { ...fields, createdAt: Date.now() };
  const r = await apiRaw('/api/tx', { method: 'POST', body: txToServer(t) });
  if (r.ok) {
    const full = { ...t, id: r.json.id };
    updateCache((c) => { c.transactions.push(full); });
    return full;
  }
  if (!isRetryable(r)) throw errFrom(r);
  // 断网：入队 + 乐观写入缓存（临时负数 id）
  const local = { ...t, id: tmpId() };
  const p = loadPending(); p.tx.push(local); savePending(p);
  updateCache((c) => { c.transactions.push(local); });
  return local;
}

export async function updateTransaction(id, fields) {
  const t = { ...fields, createdAt: fields.createdAt || Date.now() };
  // 目标是尚未上传的临时单：直接改队列里的那条 + 缓存，不上传 PUT
  if (isTmpId(id)) {
    const p = loadPending();
    const q = p.tx.find((x) => x.id === id);
    if (q) {
      Object.assign(q, t);
      savePending(p);
      updateCache((c) => {
        const lt = c.transactions.find((x) => x.id === id);
        if (lt) Object.assign(lt, t);
      });
      return { ...t, id };
    }
    // 临时单已被丢弃（4xx）：视为不存在
    throw new Error('该账单尚未同步，无法修改');
  }
  const r = await apiRaw('/api/tx/' + id, { method: 'PUT', body: txToServer(t) });
  if (r.ok) {
    updateCache((c) => {
      const lt = c.transactions.find((x) => x.id === id);
      if (lt) Object.assign(lt, t);
    });
    return { ...t, id };
  }
  if (!isRetryable(r)) throw errFrom(r);
  const p = loadPending();
  p.txUpdates.push({ id, fields: t });
  savePending(p);
  updateCache((c) => {
    const lt = c.transactions.find((x) => x.id === id);
    if (lt) Object.assign(lt, t);
  });
  return { ...t, id };
}

export async function deleteTransaction(id) {
  // 临时单：直接从队列和缓存里移除
  if (isTmpId(id)) {
    const p = loadPending();
    p.tx = p.tx.filter((x) => x.id !== id);
    savePending(p);
    updateCache((c) => { c.transactions = c.transactions.filter((x) => x.id !== id); });
    return;
  }
  const r = await apiRaw('/api/tx/' + id, { method: 'DELETE' });
  if (r.ok || r.status === 404) {
    updateCache((c) => { c.transactions = c.transactions.filter((x) => x.id !== id); });
    return;
  }
  if (!isRetryable(r)) throw errFrom(r);
  const p = loadPending(); p.txDeletes.push(id); savePending(p);
  updateCache((c) => { c.transactions = c.transactions.filter((x) => x.id !== id); });
}

export async function addCategory(fields) {
  const c = { ...fields, isSystem: 0 };
  const body = { name: c.name, icon: c.icon, type: c.type, is_system: 0, sort_order: c.sortOrder || 0 };
  const r = await apiRaw('/api/cat', { method: 'POST', body });
  if (r.ok) {
    const full = { ...c, id: r.json.id };
    updateCache((cache) => { cache.categories.push(full); });
    return full;
  }
  if (!isRetryable(r)) throw errFrom(r);
  const local = { ...c, id: tmpId() };
  const p = loadPending(); p.cats.push(local); savePending(p);
  updateCache((cache) => { cache.categories.push(local); });
  return local;
}

export async function deleteCategory(id) {
  if (isTmpId(id)) {
    const p = loadPending();
    p.cats = p.cats.filter((x) => x.id !== id);
    savePending(p);
    updateCache((c) => {
      c.categories = c.categories.filter((x) => x.id !== id);
      // 其下临时账单一并移除（未上传过）；引用它的已上传账单保留，显示未知分类
      const tmpIds = new Set(p.tx.map((x) => x.id));
      c.transactions = c.transactions.filter((x) => !(x.categoryId === id && tmpIds.has(x.id)));
    });
    return;
  }
  const r = await apiRaw('/api/cat/' + id, { method: 'DELETE' });
  if (r.ok || r.status === 404) {
    updateCache((c) => { c.categories = c.categories.filter((x) => x.id !== id); });
    return;
  }
  if (!isRetryable(r)) throw errFrom(r);
  const p = loadPending(); p.catDeletes.push(id); savePending(p);
  updateCache((c) => { c.categories = c.categories.filter((x) => x.id !== id); });
}
