// 主应用：页面渲染与交互
import {
  EXPENSE, INCOME, iconEmoji, fmtCents, fmtYuanInput, dateKey, dayTitle,
  monthKey, monthTitle, shiftMonth, monthRange, parseMonth, pad2,
  toast, confirmDialog, esc, CHART_COLORS
} from './util.js';
import * as db from './db.js';
import {
  loadSettings, saveSettings, backupToGitHub, restoreFromGitHub,
  getToken, setToken, setPassword, maskToken
} from './backup.js';
import * as cloud from './cloud.js';
import { registerSW } from './sw-register.js';

const state = {
  tab: 'home',
  month: monthKey(new Date()),
  categories: [],
  transactions: [],
  filterType: EXPENSE // 统计页排行切换
};

// ---------- 数据加载 ----------
async function reload() {
  const [categories, transactions] = await Promise.all([
    db.getCategories(), db.getAllTransactions()
  ]);
  state.categories = categories;
  state.transactions = transactions;
  render();
}

function catById(id) {
  return state.categories.find((c) => c.id === id);
}

function monthTx() {
  const { start, end } = monthRange(state.month);
  return state.transactions.filter((t) => t.date >= +start && t.date < +end);
}

function monthSummary() {
  let expense = 0, income = 0;
  for (const t of monthTx()) {
    if (t.type === EXPENSE) expense += t.amountInCents;
    else income += t.amountInCents;
  }
  return { expense, income, balance: income - expense };
}

function monthlyBudget() {
  return Number(localStorage.getItem('bk_monthly_budget')) || 0;
}

// ---------- 顶部标题 ----------
function updateNav() {
  const titleEl = document.getElementById('navTitle');
  const showMonth = state.tab === 'home' || state.tab === 'stats';
  titleEl.textContent = showMonth ? monthTitle(state.month) : { home: '明细', stats: '统计', categories: '分类管理', settings: '设置' }[state.tab];
  document.getElementById('monthPrev').style.visibility = showMonth ? 'visible' : 'hidden';
  document.getElementById('monthNext').style.visibility = showMonth ? 'visible' : 'hidden';
}

// ---------- 汇总卡 ----------
function summaryCardHTML() {
  const s = monthSummary();
  const budget = monthlyBudget();
  let budgetHTML = '';
  if (budget > 0) {
    const pct = Math.min(100, Math.round((s.expense / (budget * 100)) * 100));
    budgetHTML = `
      <div class="budget-bar ${pct >= 100 ? 'budget-over' : ''}" style="background:rgba(255,255,255,0.3)">
        <div style="width:${pct}%"></div>
      </div>
      <div style="font-size:12px;opacity:.9;margin-top:4px">月预算 ¥${budget.toLocaleString('en-US')}，已用 ${pct}%</div>`;
  }
  return `
    <div class="summary-card">
      <div class="label">本月结余</div>
      <div class="big">¥${fmtCents(s.balance)}</div>
      <div class="summary-row">
        <div><div class="label">本月支出</div><div class="num">¥${fmtCents(s.expense)}</div></div>
        <div><div class="label">本月收入</div><div class="num">¥${fmtCents(s.income)}</div></div>
      </div>
      ${budgetHTML}
    </div>`;
}

// ---------- 首页 ----------
function renderHome() {
  const txs = monthTx().slice().reverse();
  let listHTML = '';
  if (txs.length === 0) {
    listHTML = '<div class="empty">本月暂无账单<br><span style="font-size:12px">点击下方 ＋ 记一笔</span></div>';
  } else {
    const byDay = new Map();
    for (const t of txs) {
      const k = dateKey(new Date(t.date));
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(t);
    }
    for (const [day, items] of byDay) {
      let dayExp = 0, dayInc = 0;
      for (const t of items) {
        if (t.type === EXPENSE) dayExp += t.amountInCents; else dayInc += t.amountInCents;
      }
      const rows = items.map((t) => {
        const c = catById(t.categoryId);
        const color = t.type === EXPENSE ? 'expense' : 'income';
        return `
          <button class="tx-item" data-txid="${t.id}" style="width:100%;text-align:left">
            <span class="tx-icon ${color}">${iconEmoji(c ? c.icon : '')}</span>
            <span class="tx-info">
              <span class="name">${esc(c ? c.name : '未知分类')}</span>
              ${t.note ? `<span class="note">${esc(t.note)}</span>` : ''}
            </span>
            <span class="tx-amount ${color}">${t.type === EXPENSE ? '-' : '+'}${fmtCents(t.amountInCents)}</span>
          </button>`;
      }).join('');
      listHTML += `
        <div class="day-group">
          <div class="day-header">
            <span>${dayTitle(day)}</span>
            <span>${dayExp ? `支出 ¥${fmtCents(dayExp)}` : ''}${dayExp && dayInc ? ' · ' : ''}${dayInc ? `收入 ¥${fmtCents(dayInc)}` : ''}</span>
          </div>
          ${rows}
        </div>`;
    }
  }
  return `<div class="page">${summaryCardHTML()}${listHTML}</div>`;
}

// ---------- 统计页 ----------
function categoryStats(type) {
  const map = new Map();
  let total = 0;
  for (const t of monthTx()) {
    if (t.type !== type) continue;
    const cur = map.get(t.categoryId) || { amount: 0 };
    cur.amount += t.amountInCents;
    map.set(t.categoryId, cur);
    total += t.amountInCents;
  }
  return {
    total,
    items: [...map.entries()]
      .map(([id, v]) => {
        const c = catById(id);
        return { category: c || { name: '未知', icon: '' }, amount: v.amount, pct: total ? v.amount / total : 0 };
      })
      .sort((a, b) => b.amount - a.amount)
  };
}

function donutSVG(stats) {
  const size = 200, r = 80, cx = size / 2, cy = size / 2, inner = 0.6;
  let angle = -Math.PI / 2;
  const paths = stats.items.slice(0, 12).map((s, i) => {
    const sweep = s.pct * Math.PI * 2;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
    const ri = r * inner;
    const x3 = cx + ri * Math.cos(angle), y3 = cy + ri * Math.sin(angle);
    const x4 = cx + ri * Math.cos(angle - sweep), y4 = cy + ri * Math.sin(angle - sweep);
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${ri},${ri} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z" fill="${color}"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
}

function renderStats() {
  const exp = categoryStats(EXPENSE);
  const inc = categoryStats(INCOME);
  const s = monthSummary();
  // 月度环比
  const lastMonth = shiftMonth(state.month, -1);
  const savedMonth = state.month;
  state.month = lastMonth;
  const last = monthSummary();
  state.month = savedMonth;
  const mom = (cur, lastV) => {
    if (!lastV) return '<span class="muted" style="font-size:12px">上月无数据</span>';
    const change = (cur - lastV) / lastV;
    const up = change > 0;
    return `<div style="font-size:12px;font-weight:600;color:${up ? 'var(--expense)' : 'var(--income)'}">${up ? '↑' : '↓'} ${(Math.abs(change) * 100).toFixed(1)}%</div>`;
  };

  // 饼图图例
  const legend = exp.items.slice(0, 12).map((it, i) =>
    `<span><span class="dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${esc(it.category.name)} ${(it.pct * 100).toFixed(0)}%</span>`
  ).join('');

  // 每日支出柱状图
  const { year, month } = parseMonth(state.month);
  const days = new Date(year, month + 1, 0).getDate();
  const daily = new Array(days).fill(0);
  for (const t of monthTx()) {
    if (t.type === EXPENSE) daily[new Date(t.date).getDate() - 1] += t.amountInCents;
  }
  const maxDay = Math.max(...daily, 1);
  const bars = daily.map((v, i) => `
    <div class="bar-col">
      <div class="bar-rect" style="height:${(v / maxDay * 100).toFixed(1)}%" title="${i + 1}日 ¥${fmtCents(v)}"></div>
      ${(i + 1) % 5 === 0 || i === 0 ? `<div class="bar-label">${i + 1}</div>` : '<div class="bar-label">&nbsp;</div>'}
    </div>`).join('');

  // 年度对比
  const yearlyExp = new Array(12).fill(0), yearlyInc = new Array(12).fill(0);
  for (const t of state.transactions) {
    const d = new Date(t.date);
    if (d.getFullYear() !== year) continue;
    if (t.type === EXPENSE) yearlyExp[d.getMonth()] += t.amountInCents;
    else yearlyInc[d.getMonth()] += t.amountInCents;
  }
  const maxY = Math.max(...yearlyExp, ...yearlyInc, 1);
  const yearBars = yearlyExp.map((ev, i) => `
    <div class="bar-col" style="position:relative">
      <div style="display:flex;align-items:flex-end;gap:1px;height:100%;width:100%;justify-content:center">
        <div class="bar-rect" style="height:${(ev / maxY * 100).toFixed(1)}%"></div>
        <div class="bar-rect income-bar-static" style="height:${(yearlyInc[i] / maxY * 100).toFixed(1)}%;background:rgba(51,191,115,0.8);width:40%;border-radius:3px 3px 0 0"></div>
      </div>
      ${(i + 1) % 2 === 1 ? `<div class="bar-label">${i + 1}月</div>` : '<div class="bar-label">&nbsp;</div>'}
    </div>`).join('');

  // 分类排行
  const rankStats = state.filterType === EXPENSE ? exp : inc;
  const rankColor = state.filterType === EXPENSE ? 'var(--expense)' : 'var(--income)';
  const rankHTML = rankStats.items.length === 0
    ? `<div class="empty">本月暂无${state.filterType === EXPENSE ? '支出' : '收入'}</div>`
    : rankStats.items.map((it, i) => `
      <div class="rank-item">
        <span class="rank-num ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <span class="tx-icon ${state.filterType === EXPENSE ? 'expense' : 'income'}">${iconEmoji(it.category.icon)}</span>
        <span class="tx-info">
          <span class="name" style="font-size:14px">${esc(it.category.name)}</span>
          <span class="note">${(it.pct * 100).toFixed(0)}%</span>
        </span>
        <span class="tx-amount" style="color:${rankColor}">¥${fmtCents(it.amount)}</span>
      </div>`).join('');

  return `<div class="page">
    ${summaryCardHTML()}
    <div class="card">
      <h3>月度环比</h3>
      <div class="mom-row">
        <div>
          <div class="muted">支出 vs 上月</div>
          <div style="font-size:17px;font-weight:600;color:var(--expense)">¥${fmtCents(s.expense)}</div>
          ${mom(s.expense, last.expense)}
        </div>
        <div class="divider"></div>
        <div>
          <div class="muted">收入 vs 上月</div>
          <div style="font-size:17px;font-weight:600;color:var(--income)">¥${fmtCents(s.income)}</div>
          ${mom(s.income, last.income)}
        </div>
      </div>
    </div>
    <div class="card">
      <h3>支出分类占比</h3>
      ${exp.items.length === 0
        ? '<div class="empty">本月暂无支出</div>'
        : `<div class="pie-wrap">${donutSVG(exp)}</div><div class="pie-legend">${legend}</div>`}
    </div>
    <div class="card">
      <h3>每日支出趋势</h3>
      ${exp.total === 0 ? '<div class="empty">本月暂无支出</div>' : `<div class="bar-chart">${bars}</div>`}
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">分类排行</h3>
        <div class="seg-sm">
          <button class="${state.filterType === EXPENSE ? 'active' : ''}" data-rank="0">支出</button>
          <button class="${state.filterType === INCOME ? 'active' : ''}" data-rank="1">收入</button>
        </div>
      </div>
      ${rankHTML}
    </div>
    <div class="card">
      <h3>${year}年收支对比</h3>
      ${yearlyExp.every((v) => v === 0) && yearlyInc.every((v) => v === 0)
        ? '<div class="empty">本年暂无数据</div>'
        : `<div class="bar-chart" style="height:160px">${yearBars}</div>
           <div class="pie-legend"><span><span class="dot" style="background:rgba(242,77,64,0.8)"></span>支出</span><span><span class="dot" style="background:rgba(51,191,115,0.8)"></span>收入</span></div>`}
    </div>
  </div>`;
}

// ---------- 分类管理 ----------
function renderCategories() {
  const list = state.categories;
  const rows = list.map((c) => {
    const typeIcon = c.type === EXPENSE ? 'expense' : 'income';
    return `
      <div class="tx-item" style="background:var(--card)">
        <span class="tx-icon ${typeIcon}">${iconEmoji(c.icon)}</span>
        <span class="tx-info">
          <span class="name">${esc(c.name)}</span>
          <span class="note">${c.isSystem ? '内置分类' : (c.type === EXPENSE ? '支出' : '收入')}</span>
        </span>
        ${c.isSystem
          ? '<span class="muted" style="font-size:12px">不可删除</span>'
          : `<button class="text-btn" style="color:var(--expense)" data-delcat="${c.id}">删除</button>`}
      </div>`;
  }).join('');
  return `<div class="page">
    <button class="btn-block" id="addCatBtn">＋ 新建分类</button>
    <div class="card" style="padding:0">${rows || '<div class="empty">暂无分类</div>'}</div>
  </div>`;
}

// ---------- 设置页 ----------
function renderSettings() {
  const s = loadSettings();
  const syncInfo = cloud.lastSyncInfo();
  const syncStatus = !cloud.isConfigured()
    ? '<span style="color:var(--expense)">未配置：填入访问密码后开始云端同步</span>'
    : (syncInfo ? (syncInfo.ok
      ? `上次同步成功：${new Date(syncInfo.at).toLocaleString('zh-CN')}（${syncInfo.txs} 笔账单）`
      : `<span style="color:var(--expense)">上次同步失败：${esc(syncInfo.msg || '网络不可用')}（离线模式，改动已保存本地）</span>`)
      : '尚未同步');
  return `<div class="page">
    <div class="section-title">云端同步</div>
    <div class="form-group">
      <div class="form-row"><label>API 地址</label><input id="setApiBase" type="text" placeholder="${esc(cloud.DEFAULT_API)}" value="${esc(s.apiBase || '')}"></div>
      <div class="form-row"><label>访问密码</label><input id="setAuthPwd" type="password" placeholder="${s.password || s.passwordSealed ? '已保存，输入新值可替换' : '填入访问密码后开始云端同步'}" value=""></div>
    </div>
    <div class="status-text">${syncStatus}</div>
    <div class="status-text">数据以云端为主存储，本机 IndexedDB 作为离线缓存；网络不可用时改动保存本地，恢复后自动同步。</div>
    <div class="section-title">GitHub 加密备份</div>
    <div class="form-group">
      <div class="form-row"><label>Personal Access Token</label><input id="setToken" type="password" placeholder="${s.tokenSealed ? '已保存（' + esc(maskToken(s.tokenSealed)) + '），输入新值可替换' : 'ghp_ 或 github_pat_...'}" value=""></div>
      <div class="form-row"><label>仓库</label><input id="setRepo" type="text" placeholder="owner/repo（私有仓库）" value="${esc(s.repo || '')}"></div>
      <div class="form-row"><label>文件路径</label><input id="setPath" type="text" placeholder="backup/bookkeep.json" value="${esc(s.path || 'backup/bookkeep.json')}"></div>
      <div class="form-row"><label>分支</label><input id="setBranch" type="text" placeholder="main" value="${esc(s.branch || 'main')}"></div>
      <div class="form-row"><label>加密密码</label><input id="setPassword" type="password" placeholder="AES-256 备份密码"></div>
    </div>
    <div class="status-text">数据在本地使用 AES-GCM（PBKDF2 派生密钥）加密后上传到 GitHub 私有仓库；Token 与密码仅保存在本机 localStorage。Token 需要该仓库的 Contents 读写权限。</div>
    <button class="btn-block" id="backupBtn">↑ 备份到 GitHub</button>
    <button class="btn-block" id="restoreBtn">↓ 从 GitHub 恢复</button>
    <div class="section-title">预算</div>
    <div class="form-group">
      <div class="form-row"><label>月度预算（元）</label><input id="setBudget" type="number" inputmode="decimal" placeholder="不设置" value="${monthlyBudget() || ''}"></div>
    </div>
    <div class="section-title">关于</div>
    <div class="status-text">记账本 PWA · 数据模型与 iOS 版一致，金额以「分」存储。数据保存在浏览器 IndexedDB 中，建议定期备份。</div>
  </div>`;
}

// ---------- 渲染 ----------
function render() {
  updateNav();
  const container = document.getElementById('pageContainer');
  if (state.tab === 'home') container.innerHTML = renderHome();
  else if (state.tab === 'stats') container.innerHTML = renderStats();
  else if (state.tab === 'categories') container.innerHTML = renderCategories();
  else container.innerHTML = renderSettings();
  container.scrollTop = 0;
  bindPageEvents();
}

// ---------- 页面事件 ----------
function bindPageEvents() {
  const container = document.getElementById('pageContainer');

  // 账单详情
  container.querySelectorAll('[data-txid]').forEach((el) => {
    el.addEventListener('click', () => showTxDetail(Number(el.dataset.txid)));
  });

  // 分类删除
  container.querySelectorAll('[data-delcat]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number(el.dataset.delcat);
      const used = state.transactions.some((t) => t.categoryId === id);
      if (await confirmDialog(used ? '该分类下已有账单，删除后账单将显示为「未知分类」，确定删除？' : '确定删除该分类？')) {
        await cloud.deleteCategory(id);
        await reload();
        toast('已删除');
      }
    });
  });

  const addCatBtn = document.getElementById('addCatBtn');
  if (addCatBtn) addCatBtn.addEventListener('click', showAddCategory);

  // 统计排行切换
  container.querySelectorAll('[data-rank]').forEach((el) => {
    el.addEventListener('click', () => {
      state.filterType = Number(el.dataset.rank);
      render();
    });
  });

  // 设置页
  const backupBtn = document.getElementById('backupBtn');
  if (backupBtn) {
    const inputs = ['setToken', 'setRepo', 'setPath', 'setBranch', 'setPassword', 'setBudget', 'setApiBase', 'setAuthPwd'];
    inputs.forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener('change', async () => {
        let s = loadSettings();
        // token/密码仅在输入了新值时更新（输入框不回显旧值，留空即保持不变）
        const newToken = document.getElementById('setToken').value.trim();
        if (newToken) s = await setToken(s, newToken);
        const newPwd = document.getElementById('setPassword').value;
        if (newPwd) s = await setPassword(s, newPwd);
        s.repo = document.getElementById('setRepo').value.trim();
        s.path = document.getElementById('setPath').value.trim() || 'backup/bookkeep.json';
        s.branch = document.getElementById('setBranch').value.trim() || 'main';
        const apiBaseEl = document.getElementById('setApiBase');
        if (apiBaseEl) s.apiBase = apiBaseEl.value.trim();
        const authPwdEl = document.getElementById('setAuthPwd');
        const syncChanged = apiBaseEl && document.activeElement === apiBaseEl || authPwdEl && document.activeElement === authPwdEl;
        if (authPwdEl && authPwdEl.value) s = await setPassword(s, authPwdEl.value);
        saveSettings(s);
        localStorage.setItem('bk_monthly_budget', document.getElementById('setBudget').value || '0');
        toast('设置已保存（敏感信息已加密存储）');
        if (syncChanged) {
          try {
            const r = await cloud.sync();
            if (r.status === 'ok') { toast('✅ 云端同步成功'); await reload(); }
            else if (r.status === 'noauth') toast('请填写访问密码以开始云端同步', 4000);
            else if (r.status === 'offline') toast('当前离线，改动已保存本地', 4000);
            if (state.tab === 'settings') render();
          } catch (e) { /* 同步失败已在 sync 内记录 */ }
        }
      });
    });
    backupBtn.addEventListener('click', async () => {
      const s = loadSettings();
      const token = await getToken(s);
      if (!token || !s.repo) return toast('请先填写 Token 和仓库');
      if (!s.password) return toast('请设置加密密码');
      backupBtn.disabled = true;
      try {
        const msg = await backupToGitHub({ ...s, token });
        toast('✅ ' + msg);
      } catch (e) {
        toast('备份失败：' + e.message, 4000);
      } finally {
        backupBtn.disabled = false;
      }
    });
    document.getElementById('restoreBtn').addEventListener('click', async () => {
      const s = loadSettings();
      const token = await getToken(s);
      if (!token || !s.repo) return toast('请先填写 Token 和仓库');
      if (!s.password) return toast('请输入加密密码');
      if (!(await confirmDialog('恢复将覆盖本地全部数据，确定继续？'))) return;
      try {
        const msg = await restoreFromGitHub({ ...s, token });
        toast('✅ ' + msg);
        await reload();
      } catch (e) {
        toast('恢复失败：' + e.message, 4000);
      }
    });
  }
}

// ---------- 账单详情 ----------
async function showTxDetail(id) {
  const all = await db.getAllTransactions();
  const t = all.find((x) => x.id === id);
  if (!t) return;
  const c = catById(t.categoryId);
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  mask.innerHTML = `
    <div class="sheet">
      <div class="sheet-header">
        <button class="text-btn" id="txDel" style="color:var(--expense)">删除</button>
        <h2>账单详情</h2>
        <button class="text-btn" id="txClose">关闭</button>
      </div>
      <div class="amount-row">
        <span class="currency">¥</span>
        <span style="font-size:36px;font-weight:700">${fmtCents(t.amountInCents)}</span>
      </div>
      <div class="form-group">
        <div class="form-row"><label>类型</label><span>${t.type === EXPENSE ? '支出' : '收入'}</span></div>
        <div class="form-row"><label>分类</label><span>${iconEmoji(c ? c.icon : '')} ${esc(c ? c.name : '未知分类')}</span></div>
        <div class="form-row"><label>备注</label><span>${esc(t.note || '-')}</span></div>
        <div class="form-row"><label>日期</label><span>${new Date(t.date).toLocaleString('zh-CN')}</span></div>
        <div class="form-row"><label>创建时间</label><span>${new Date(t.createdAt).toLocaleString('zh-CN')}</span></div>
      </div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('#txClose').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  mask.querySelector('#txDel').addEventListener('click', async () => {
    if (await confirmDialog('确定删除该账单？')) {
      await cloud.deleteTransaction(id);
      mask.remove();
      await reload();
      toast('已删除');
    }
  });
}

// ---------- 新建分类 ----------
async function showAddCategory() {
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const icons = ['🍴', '☕', '🚗', '🛒', '👜', '🎁', '🎮', '🏠', '⚡', '💧', '❤️', '🩺', '📚', '🎓', '✈️', '🎬', '🎵', '🐾', '👕', '🏋️', '💊', '💳', '👛', '💼', '⭐', '✨', '🍀', '⚽', '🏷️'];
  mask.innerHTML = `
    <div class="sheet">
      <div class="sheet-header">
        <button class="text-btn" id="catCancel">取消</button>
        <h2>新建分类</h2>
        <button class="text-btn primary" id="catSave">保存</button>
      </div>
      <div class="seg-tabs">
        <button class="seg active" data-ctype="0">支出</button>
        <button class="seg" data-ctype="1">收入</button>
      </div>
      <div class="form-row plain" style="border-radius:12px 12px 0 0"><label>名称</label><input id="catName" type="text" placeholder="分类名称" maxlength="10"></div>
      <div class="form-row plain" style="border-radius:0 0 12px 12px;border-bottom:none"><label>图标</label><span id="catIconPreview" style="font-size:20px">🏷️</span></div>
      <div class="icon-grid" id="catIcons">${icons.map((ic, i) => `
        <button class="icon-cell small ${i === icons.length - 1 ? 'selected' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(mask);
  let type = EXPENSE;
  let icon = '🏷️';
  mask.querySelectorAll('[data-ctype]').forEach((b) => b.addEventListener('click', () => {
    mask.querySelectorAll('[data-ctype]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    type = Number(b.dataset.ctype);
  }));
  mask.querySelectorAll('[data-icon]').forEach((b) => b.addEventListener('click', () => {
    mask.querySelectorAll('[data-icon]').forEach((x) => x.classList.remove('selected'));
    b.classList.add('selected');
    icon = b.dataset.icon;
    mask.querySelector('#catIconPreview').textContent = icon;
  }));
  mask.querySelector('#catCancel').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  mask.querySelector('#catSave').addEventListener('click', async () => {
    const name = mask.querySelector('#catName').value.trim();
    if (!name) return toast('请填写分类名称');
    if (state.categories.some((c) => c.name === name && c.type === type)) {
      return toast('同名分类已存在');
    }
    const maxSort = Math.max(0, ...state.categories.filter((c) => c.type === type).map((c) => c.sortOrder));
    await cloud.addCategory({ name, icon, type, sortOrder: maxSort + 1 });
    mask.remove();
    await reload();
    toast('已添加');
  });
}

// ---------- 记一笔 ----------
let addType = EXPENSE;
let addCategoryId = null;

function renderAddCategories() {
  const grid = document.getElementById('addCategories');
  const list = state.categories.filter((c) => c.type === addType);
  if (addCategoryId === null || !list.some((c) => c.id === addCategoryId)) {
    addCategoryId = list.length ? list[0].id : null;
  }
  grid.innerHTML = list.map((c) => `
    <button class="icon-cell ${c.id === addCategoryId ? 'selected' : ''}" data-catid="${c.id}">
      ${iconEmoji(c.icon)}<span>${esc(c.name)}</span>
    </button>`).join('');
  grid.querySelectorAll('[data-catid]').forEach((b) => b.addEventListener('click', () => {
    addCategoryId = Number(b.dataset.catid);
    renderAddCategories();
  }));
}

function openAddSheet() {
  addType = EXPENSE;
  addCategoryId = null;
  const mask = document.getElementById('addSheet');
  mask.classList.remove('hidden');
  document.getElementById('amountInput').value = '';
  document.getElementById('noteInput').value = '';
  document.getElementById('dateInput').value = dateKey(new Date());
  updateAddSeg();
  renderAddCategories();
}

function updateAddSeg() {
  const e = document.getElementById('segExpense'), i = document.getElementById('segIncome');
  e.classList.toggle('active', addType === EXPENSE);
  i.classList.toggle('active', addType === INCOME);
  e.classList.toggle('expense-seg', addType === EXPENSE);
  i.classList.toggle('income-seg', addType === INCOME);
}

async function saveAdd() {
  const raw = document.getElementById('amountInput').value.replace(/[,，\s]/g, '');
  const amount = Math.round(parseFloat(raw) * 100);
  if (!amount || amount <= 0) return toast('请输入有效金额');
  if (addCategoryId === null) return toast('请选择分类');
  const dateStr = document.getElementById('dateInput').value;
  const date = dateStr ? new Date(dateStr + 'T12:00:00').getTime() : Date.now();
  await cloud.addTransaction({
    type: addType,
    amountInCents: amount,
    categoryId: addCategoryId,
    note: document.getElementById('noteInput').value.trim(),
    date
  });
  document.getElementById('addSheet').classList.add('hidden');
  await reload();
  toast('已记账');
}

// ---------- 初始化 ----------
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  render();
}

function init() {
  // 底部标签
  document.querySelectorAll('.tab-item').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  // 月份切换
  document.getElementById('monthPrev').addEventListener('click', () => {
    state.month = shiftMonth(state.month, -1);
    render();
  });
  document.getElementById('monthNext').addEventListener('click', () => {
    state.month = shiftMonth(state.month, 1);
    render();
  });
  // 左右滑动切月（首页/统计）
  let touchX = null, touchY = null;
  document.addEventListener('touchstart', (e) => {
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    if (state.tab !== 'home' && state.tab !== 'stats') { touchX = null; return; }
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 50) {
      state.month = shiftMonth(state.month, dx < 0 ? 1 : -1);
      render();
    }
    touchX = null;
  }, { passive: true });

  // 记一笔
  document.getElementById('addBtn').addEventListener('click', openAddSheet);
  document.getElementById('addCancel').addEventListener('click', () => {
    document.getElementById('addSheet').classList.add('hidden');
  });
  document.getElementById('segExpense').addEventListener('click', () => { addType = EXPENSE; updateAddSeg(); renderAddCategories(); });
  document.getElementById('segIncome').addEventListener('click', () => { addType = INCOME; updateAddSeg(); renderAddCategories(); });
  document.getElementById('addSave').addEventListener('click', saveAdd);

  registerSW();
  initDBAndRender();
}

async function initDBAndRender() {
  await db.initDB();
  await reload();
  // 云端为主：启动时全量同步，失败则离线模式（沿用本地数据）
  try {
    const r = await cloud.sync();
    if (r.status === 'ok') {
      await reload();
    } else if (r.status === 'offline') {
      toast('当前离线，使用本地数据', 4000);
    }
  } catch (e) { /* 保持本地数据 */ }
  // 网络恢复时自动重试同步
  window.addEventListener('online', async () => {
    try {
      const r = await cloud.sync();
      if (r.status === 'ok') { toast('网络已恢复，云端同步完成'); await reload(); }
    } catch (e) { /* 忽略 */ }
  });
}

init();
