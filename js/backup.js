// GitHub 加密备份：IndexedDB 全量数据 → JSON → AES-GCM 加密（PBKDF2 派生密钥）→ 提交到私有仓库单文件
import { exportAll, importAll } from './db.js';

const LS_KEY = 'bk_backup_settings';
const PBKDF2_ITERATIONS = 100000;

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

export function saveSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// ---- 加密 ----
// 输出格式: base64("BKGB" + salt(16) + iv(12) + ciphertext)
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function unb64(s) {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encryptJSON(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const magic = new TextEncoder().encode('BKGB');
  const out = new Uint8Array(magic.length + salt.length + iv.length + ct.byteLength);
  out.set(magic, 0);
  out.set(salt, magic.length);
  out.set(iv, magic.length + salt.length);
  out.set(new Uint8Array(ct), magic.length + salt.length + iv.length);
  return b64(out);
}

export async function decryptPayload(b64str, password) {
  const raw = unb64(b64str);
  const magic = new TextDecoder().decode(raw.slice(0, 4));
  if (magic !== 'BKGB') throw new Error('备份文件格式不正确');
  const salt = raw.slice(4, 20);
  const iv = raw.slice(20, 32);
  const ct = raw.slice(32);
  const key = await deriveKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---- GitHub Contents API ----
function ghHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

function parseRepo(repo) {
  // 支持 "owner/name" 或完整 URL
  const m = repo.match(/github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : repo.trim();
}

async function getFileSha({ token, repo, path, branch }) {
  const r = parseRepo(repo);
  const url = `https://api.github.com/repos/${r}/contents/${path}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取远端文件失败 (${res.status})：${(await res.json()).message || ''}`);
  const j = await res.json();
  return j.sha;
}

// 备份到 GitHub 单文件，返回提交信息
export async function backupToGitHub({ token, repo, path, branch, password }) {
  const data = await exportAll();
  const encrypted = await encryptJSON(data, password);
  const sha = await getFileSha({ token, repo, path, branch });
  const body = {
    message: `记账本备份 ${new Date().toISOString()}`,
    content: encrypted,
    branch: branch || undefined
  };
  if (sha) body.sha = sha;
  const r = parseRepo(repo);
  const res = await fetch(`https://api.github.com/repos/${r}/contents/${path}`, {
    method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(body)
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`提交失败 (${res.status})：${j.message || '未知错误'}`);
  }
  return `已备份 ${data.transactions.length} 笔账单、${data.categories.length} 个分类`;
}

// 从 GitHub 恢复：下载文件 → 解密 → 回写数据库
export async function restoreFromGitHub({ token, repo, path, branch, password }) {
  const r = parseRepo(repo);
  const url = `https://api.github.com/repos/${r}/contents/${path}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`下载失败 (${res.status})`);
  const j = await res.json();
  const content = (j.content || '').replace(/\s/g, '');
  const data = await decryptPayload(content, password);
  await importAll(data);
  return `已恢复 ${data.transactions.length} 笔账单、${(data.categories || []).length} 个分类`;
}
