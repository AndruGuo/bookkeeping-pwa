// 云端数据层：Cloudflare API 为唯一存储，本地不再缓存账单/分类
// 本地仅保留：登录 token/username（localStorage）与 API 地址设置
const SETTINGS_KEY = 'bk_backup_settings';
const TOKEN_KEY = 'bk_token';
const USERNAME_KEY = 'bk_username';
export const DEFAULT_API = 'https://api.andru.de5.net';

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

// ---- API 请求（X-Auth: session token）----
async function api(path, opts = {}) {
  const token = getToken();
  if (!token) throw new Error('NOAUTH');
  const headers = { 'X-Auth': token };
  if (opts.body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(apiBase() + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch {
    throw new Error('网络不可用，请检查网络连接');
  }
  if (res.status === 401) { setSession(null); throw new Error('登录已过期，请重新登录'); }
  if (!res.ok) throw new Error(`云端请求失败 (${res.status})`);
  return res.json();
}

// 导出数据（返回 Blob，触发下载）
export async function exportData() {
  const res = await fetch(apiBase() + '/api/export', { headers: { 'X-Auth': getToken() } });
  if (!res.ok) throw new Error(`导出失败 (${res.status})`);
  return res.blob();
}

export async function wipeData() {
  return api('/api/wipe', { method: 'POST', body: {} });
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

// ---- 拉取全量（唯一的数据读取入口）----
// 返回 { categories, transactions }；失败时抛出异常，由调用方提示且不改变 UI
export async function sync() {
  if (!isConfigured()) throw new Error('NOAUTH');
  const server = await api('/api/data');
  return {
    categories: (server.categories || []).map(catFromServer)
      .sort((a, b) => a.type - b.type || a.sortOrder - b.sortOrder || a.id - b.id),
    transactions: (server.transactions || []).map(txFromServer)
      .sort((a, b) => a.date - b.date || a.id - b.id)
  };
}

// ---- 写操作：直连云端，失败抛异常（不落本地、不进队列）----
export async function addTransaction(fields) {
  const t = { ...fields, createdAt: Date.now() };
  const j = await api('/api/tx', { method: 'POST', body: txToServer(t) });
  return { ...t, id: j.id };
}

export async function updateTransaction(id, fields) {
  const t = { ...fields, createdAt: fields.createdAt || Date.now() };
  await api('/api/tx/' + id, { method: 'PUT', body: txToServer(t) });
  return { ...t, id };
}

export async function deleteTransaction(id) {
  await api('/api/tx/' + id, { method: 'DELETE' });
}

export async function addCategory(fields) {
  const c = { ...fields, isSystem: 0 };
  const body = {
    name: c.name, icon: c.icon, type: c.type,
    is_system: 0, sort_order: c.sortOrder || 0
  };
  const j = await api('/api/cat', { method: 'POST', body });
  return { ...c, id: j.id };
}

export async function deleteCategory(id) {
  await api('/api/cat/' + id, { method: 'DELETE' });
}
