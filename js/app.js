// 主应用：页面渲染与交互
import {
  EXPENSE, INCOME, iconEmoji, fmtCents, fmtYuanInput, dateKey, dayTitle,
  monthKey, monthTitle, shiftMonth, monthRange, parseMonth, pad2,
  toast, confirmDialog, esc, CHART_COLORS
} from './util.js';
import * as cloud from './cloud.js';
import { registerSW } from './sw-register.js';

const state = {
  tab: 'home',
  month: monthKey(new Date()),
  categories: [],
  transactions: [],
  filterType: EXPENSE, // 统计页排行切换
  filter: { q: '', cat: '', scope: 'month' } // 账单搜索/筛选
};

// ---------- 数据加载 ----------
// 离线时若本地有缓存，直接渲染缓存数据（云端仍为权威数据）
async function refresh() {
  const data = await cloud.sync(); // 成功返回云端最新；网络失败自动退回本地缓存
  state.categories = data.categories;
  state.transactions = data.transactions;
  render();
  // sync 成功（非离线）后检查周期模板，到期自动创建账单
  if (!cloud.isOffline()) checkRecurring().catch(() => {});
}

// 静默补传/刷新：不弹错误 toast，只更新离线横幅
async function backgroundSync() {
  if (!cloud.isAuthed()) return;
  try {
    await refresh();
  } catch { /* 无缓存可用：保持现状 */ }
  updateOfflineBanner();
}

// 写操作统一包装：成功后拉全量刷新 UI，失败只弹 toast，UI 状态不变
async function cloudAction(fn, successMsg) {
  try {
    await fn();
    await refresh();
    if (successMsg) toast(successMsg);
    return true;
  } catch (e) {
    if (/重新登录/.test(e.message || '')) { showAuthScreen(); return false; }
    toast(e.message || '操作失败，请重试', 4000);
    return false;
  }
}

function catById(id) {
  return state.categories.find((c) => c.id === id);
}

function monthTx() {
  const { start, end } = monthRange(state.month);
  return state.transactions.filter((t) => t.date >= +start && t.date < +end);
}

// ---------- 分类使用频次（bk_cat_freq：记账时更新，用于常用分类置顶） ----------
function loadCatFreq() {
  try { return JSON.parse(localStorage.getItem('bk_cat_freq')) || {}; }
  catch { return {}; }
}
function bumpCatFreq(id) {
  if (id === null) return;
  const f = loadCatFreq();
  f[id] = (f[id] || 0) + 1;
  try { localStorage.setItem('bk_cat_freq', JSON.stringify(f)); } catch { /* 配额满：忽略 */ }
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
  const showMonth = state.tab === 'stats';
  const titles = { home: '记账本', stats: '统计', categories: '分类管理', settings: '我的' };
  titleEl.textContent = state.tab === 'stats' ? monthTitle(state.month) : titles[state.tab];
  document.getElementById('monthPrev').style.visibility = showMonth ? 'visible' : 'hidden';
  document.getElementById('monthNext').style.visibility = showMonth ? 'visible' : 'hidden';
  const av = document.getElementById('navAvatarWrap');
  if (av) av.style.visibility = (state.tab === 'home' || state.tab === 'settings') ? 'visible' : 'hidden';
}

// ---------- 黄色头部（月份切换 + 收入/支出汇总） ----------
function monthSwitchHTML(home) {
  const p = home ? 'Home' : '';
  return `
    <div class="month-switch">
      <button class="nav-btn" id="monthPrev${p}" aria-label="上一月">‹</button>
      <span>${monthTitle(state.month)}</span>
      <button class="nav-btn" id="monthNext${p}" aria-label="下一月">›</button>
    </div>`;
}

function summaryInlineHTML() {
  const s = monthSummary();
  const big = (v) => {
    const yuan = Math.floor(Math.abs(v) / 100);
    const fen = (Math.abs(v) % 100).toString().padStart(2, '0');
    return `${fmtCents(v).slice(0, fmtCents(v).length - 3)}<small>.${fen}</small>`;
  };
  return `
    <div class="head-summary">
      <div><div class="hl">收入</div><div class="hv">${big(s.income)}</div></div>
      <div><div class="hl">支出</div><div class="hv">${big(s.expense)}</div></div>
      <div><div class="hl">结余</div><div class="hv">${big(s.balance)}</div></div>
    </div>`;
}

function headSummaryCardHTML(withBudget, withSwitch = true) {
  const s = monthSummary();
  const budget = monthlyBudget();
  let budgetHTML = '';
  if (withBudget && budget > 0) {
    const pct = Math.min(100, Math.round((s.expense / (budget * 100)) * 100));
    budgetHTML = `
      <div class="budget-bar" style="background:rgba(255,255,255,0.45);border-radius:3px;height:6px;margin-top:12px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#222;border-radius:3px"></div>
      </div>
      <div style="font-size:12px;color:#444;margin-top:4px">月预算 ¥${budget.toLocaleString('en-US')}，已用 ${pct}%</div>`;
  }
  return `<div class="home-head">${withSwitch ? monthSwitchHTML(true) : ''}${summaryInlineHTML()}${budgetHTML}</div>`;
}

// ---------- 空态 ----------
function emptyArt(emoji, text, sub) {
  return `<div class="empty"><span class="empty-art">${emoji}</span>${text}${sub ? `<span class="empty-sub">${sub}</span>` : ''}</div>`;
}
function emptyArtHome() {
  return emptyArt('🧾', '本月暂无账单', '点击下方 ＋ 记一笔');
}

// ---------- 快捷入口（白色圆角卡 + 黄色描线图标） ----------
function quickCardHTML() {
  const W = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const ic = (body) => `<svg viewBox="0 0 24 24" ${W}>${body}</svg>`;
  return `
    <div class="quick-card">
      <button id="quickSearch">${ic('<circle class="ic-fill" cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>')}<span>搜索</span></button>
      <button id="quickRecur">${ic('<rect class="ic-fill" x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3.5v3m7-3v3"/><path d="M9 15h6"/>')}<span>周期</span></button>
      <button id="quickExport">${ic('<path d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5"/><path class="ic-fill" d="M4.5 15.5v3A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5v-3"/>')}<span>导出</span></button>
      <button id="quickChart">${ic('<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7.5 14l3.5-4 3 2.5 4-5"/><circle class="ic-fill" cx="18" cy="7.5" r="1.6" stroke-width="2"/>')}<span>图表</span></button>
      <button id="quickMore">${ic('<circle class="ic-fill" cx="12" cy="12" r="8.5"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="3"/>')}<span>设置</span></button>
    </div>`;
}

// ---------- 首页（含搜索/筛选） ----------
// 纯前端过滤：对云端/缓存数据按备注、分类名、分类、月份范围筛选
function filteredTx() {
  const { q, cat, scope } = state.filter;
  let txs = state.transactions;
  if (scope === 'month') {
    const { start, end } = monthRange(state.month);
    txs = txs.filter((t) => t.date >= +start && t.date < +end);
  }
  if (cat) txs = txs.filter((t) => String(t.categoryId) === String(cat));
  if (q) {
    const s = q.trim().toLowerCase();
    if (s) txs = txs.filter((t) => {
      const c = catById(t.categoryId);
      return (t.note || '').toLowerCase().includes(s) || (c ? c.name.toLowerCase().includes(s) : false);
    });
  }
  return txs;
}

function filterBarHTML() {
  const catOpts = state.categories.map((c) =>
    `<option value="${c.id}" ${String(c.id) === String(state.filter.cat) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `
    <div class="filter-bar">
      <input id="searchInput" type="search" placeholder="搜索备注 / 分类" value="" autocomplete="off">
      <div class="filter-selects">
        <select id="filterCat">
          <option value="">全部分类</option>${catOpts}
        </select>
        <select id="filterMonth">
          <option value="month" ${state.filter.scope === 'month' ? 'selected' : ''}>本月</option>
          <option value="all" ${state.filter.scope === 'all' ? 'selected' : ''}>全部</option>
        </select>
      </div>
    </div>`;
}

function renderHome() {
  return `<div class="page">${headSummaryCardHTML(true)}${quickCardHTML()}${filterBarHTML()}<div id="txList">${txListHTML()}</div></div>`;
}

function txListHTML() {
  const txs = filteredTx().slice().reverse();
  let listHTML = '';
  if (txs.length === 0) {
    listHTML = emptyArtHome();
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
            <span class="tx-amount ${color}">${t.type === EXPENSE ? '-' : ''}${fmtCents(t.amountInCents)}</span>
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
  return listHTML;
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

// ---------- Chart.js 图表（黄黑主题） ----------
function chartTheme() {
  return {
    text: '#999999',
    grid: 'rgba(0,0,0,0.05)',
    tooltipBg: 'rgba(34,34,34,0.92)'
  };
}
const chartInstances = [];
function destroyCharts() {
  while (chartInstances.length) chartInstances.pop().destroy();
}
function tooltipStyle() {
  const t = chartTheme();
  return {
    backgroundColor: t.tooltipBg,
    titleColor: '#fff', bodyColor: '#fff',
    padding: 10, cornerRadius: 10, displayColors: false,
    titleFont: { weight: '600' },
    callbacks: { label: (ctx) => ` ¥${(ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed) / 100}` }
  };
}

// 近 30 天支出/收入趋势（双平滑折线）
function mountTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;
  const days = 30;
  const labels = [], exp = [], inc = [];
  const today = new Date(); today.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 86400000;
    let e = 0, n = 0;
    for (const t of state.transactions) {
      if (t.date >= dayStart && t.date < dayEnd) {
        if (t.type === EXPENSE) e += t.amountInCents; else n += t.amountInCents;
      }
    }
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    exp.push(e / 100); inc.push(n / 100);
  }
  const th = chartTheme();
  chartInstances.push(new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '支出', data: exp, borderColor: '#222222', backgroundColor: 'rgba(255,216,53,0.25)',
          fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHitRadius: 12, pointHoverRadius: 4 },
        { label: '收入', data: inc, borderColor: '#FFC400', backgroundColor: 'rgba(255,216,53,0.15)',
          fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHitRadius: 12, pointHoverRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom', labels: { color: th.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 16 }
        },
        tooltip: tooltipStyle()
      },
      scales: {
        x: { ticks: { color: th.text, maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
        y: { ticks: { color: th.text, maxTicksLimit: 5 }, grid: { color: th.grid }, border: { display: false } }
      }
    }
  }));
}

// 日历热力图（当月每日支出强度，CSS grid）
function heatmapHTML() {
  const { year, month } = parseMonth(state.month);
  const days = new Date(year, month + 1, 0).getDate();
  const daily = new Array(days + 1).fill(0);
  for (const t of monthTx()) {
    if (t.type === EXPENSE) daily[new Date(t.date).getDate()] += t.amountInCents;
  }
  const max = Math.max(...daily.slice(1), 1);
  const firstDow = new Date(year, month, 1).getDay();
  const todayKey = dateKey(new Date());
  let cells = ['日', '一', '二', '三', '四', '五', '六'].map((w) => `<span class="hm-wd">${w}</span>`).join('');
  cells += '<span></span>'.repeat(firstDow);
  for (let d = 1; d <= days; d++) {
    const v = daily[d];
    const lvl = v === 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.99));
    const isToday = dateKey(new Date(year, month, d)) === todayKey;
    cells += `<span class="hm-cell lv${lvl}${isToday ? ' today' : ''}" title="${d}日 ¥${fmtCents(v)}">${d}</span>`;
  }
  return `<div class="heatmap">${cells}</div>`;
}

// 近 6 个月收支对比（分组柱状图）
function mountMonthlyBarChart() {
  const canvas = document.getElementById('monthBarChart');
  if (!canvas) return;
  const labels = [], expData = [], incData = [];
  for (let i = 5; i >= 0; i--) {
    const mk = shiftMonth(state.month, -i);
    const { start, end } = monthRange(mk);
    let e = 0, n = 0;
    for (const t of state.transactions) {
      if (t.date >= +start && t.date < +end) {
        if (t.type === EXPENSE) e += t.amountInCents; else n += t.amountInCents;
      }
    }
    labels.push(`${parseMonth(mk).month + 1}月`);
    expData.push(e / 100); incData.push(n / 100);
  }
  const th = chartTheme();
  chartInstances.push(new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '支出', data: expData, backgroundColor: '#222222', borderRadius: 6, maxBarThickness: 22 },
        { label: '收入', data: incData, backgroundColor: '#FFD835', borderRadius: 6, maxBarThickness: 22 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: th.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 16 } },
        tooltip: tooltipStyle()
      },
      scales: {
        x: { ticks: { color: th.text, maxRotation: 0 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: th.text, maxTicksLimit: 5 }, grid: { color: th.grid }, border: { display: false } }
      }
    }
  }));
}

// 当月分类支出占比（环形图，图例点击可过滤）
function mountDoughnutChart() {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;
  const stats = categoryStats(EXPENSE);
  const items = stats.items.slice(0, 12);
  const th = chartTheme();
  chartInstances.push(new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: items.map((it) => it.category.name),
      datasets: [{
        data: items.map((it) => it.amount / 100),
        backgroundColor: CHART_COLORS.slice(0, items.length),
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: th.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 12 } }
        },
        tooltip: tooltipStyle()
      }
    }
  }));
}
function mountCharts() {
  if (state.tab !== 'stats' || typeof Chart === 'undefined') return;
  mountTrendChart();
  mountDoughnutChart();
  mountMonthlyBarChart();
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
        <div class="bar-rect income-bar-static" style="height:${(yearlyInc[i] / maxY * 100).toFixed(1)}%;background:#222222;width:40%;border-radius:3px 3px 0 0"></div>
      </div>
      ${(i + 1) % 2 === 1 ? `<div class="bar-label">${i + 1}月</div>` : '<div class="bar-label">&nbsp;</div>'}
    </div>`).join('');

  // 分类排行
  const rankStats = state.filterType === EXPENSE ? exp : inc;
  const rankColor = state.filterType === EXPENSE ? 'var(--expense)' : 'var(--income)';
  const rankHTML = rankStats.items.length === 0
    ? emptyArt('🏷️', `本月暂无${state.filterType === EXPENSE ? '支出' : '收入'}`)
    : rankStats.items.map((it, i) => `
      <div class="rank-item">
        <span class="rank-num ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <span class="tx-icon ${state.filterType === EXPENSE ? 'expense' : 'income'}">${iconEmoji(it.category.icon)}</span>
        <span class="tx-info">
          <span class="name" style="font-size:14px">${esc(it.category.name)}</span>
          <span class="rank-bar"><span style="width:${Math.max(2, it.pct * 100).toFixed(1)}%;background:${rankColor}"></span></span>
        </span>
        <span class="tx-amount" style="color:${rankColor}">¥${fmtCents(it.amount)}</span>
      </div>`).join('');

  // 近 30 天趋势
  const trendEmpty = state.transactions.length === 0;

  // 近 6 个月收支（月度对比柱状图数据）
  const sixMonths = [];
  for (let i = 5; i >= 0; i--) {
    const mk = shiftMonth(state.month, -i);
    const { start, end } = monthRange(mk);
    let e = 0, n = 0;
    for (const t of state.transactions) {
      if (t.date >= +start && t.date < +end) {
        if (t.type === EXPENSE) e += t.amountInCents; else n += t.amountInCents;
      }
    }
    sixMonths.push({ label: `${parseMonth(mk).month + 1}月`, expense: e, income: n });
  }
  const sixEmpty = sixMonths.every((m) => m.expense === 0 && m.income === 0);

  return `<div class="page">
    ${headSummaryCardHTML(false, false)}
    <div class="card">
      <h3>近 30 天收支趋势</h3>
      ${trendEmpty ? emptyArt('📉', '暂无收支数据', '记一笔后即可看到趋势曲线') : '<div class="chart-box"><canvas id="trendChart"></canvas></div>'}
    </div>
    <div class="card">
      <h3>近 6 个月收支对比</h3>
      ${sixEmpty
        ? emptyArt('📊', '暂无近 6 个月数据')
        : '<div class="chart-box"><canvas id="monthBarChart"></canvas></div>'}
    </div>
    <div class="card">
      <h3>当月支出日历</h3>
      ${exp.total === 0 ? emptyArt('🗓️', '本月暂无支出') : `${heatmapHTML()}<div class="hm-legend">少 <span class="hm-dots"><span class="hm-dot lv0"></span><span class="hm-dot lv1"></span><span class="hm-dot lv2"></span><span class="hm-dot lv3"></span><span class="hm-dot lv4"></span></span> 多</div>`}
    </div>
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
        ? emptyArt('🍩', '本月暂无支出', '分类占比会在这里展示')
        : '<div class="pie-wrap"><canvas id="donutChart"></canvas></div>'}
    </div>
    <div class="card">
      <h3>每日支出趋势</h3>
      ${exp.total === 0 ? emptyArt('📊', '本月暂无支出') : `<div class="bar-chart">${bars}</div>`}
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
        ? emptyArt('🗓️', '本年暂无数据')
        : `<div class="bar-chart" style="height:160px">${yearBars}</div>
           <div class="pie-legend"><span><span class="dot" style="background:#FFD835"></span>支出</span><span><span class="dot" style="background:#222222"></span>收入</span></div>`}
    </div>
  </div>`;
}

// ---------- 分类管理 ----------
function renderCategories() {
  const list = state.categories;
  const rows = list.map((c) => {
    return `
      <div class="tx-item">
        <span class="tx-icon">${iconEmoji(c.icon)}</span>
        <span class="tx-info">
          <span class="name">${esc(c.name)}</span>
          <span class="note">${c.isSystem ? '内置分类' : (c.type === EXPENSE ? '支出' : '收入')}</span>
        </span>
        ${c.isSystem
          ? '<span class="muted" style="font-size:12px">不可删除</span>'
          : `<button class="text-btn" data-delcat="${c.id}">删除</button>`}
      </div>`;
  }).join('');
  return `<div class="page">
    <button class="btn-block primary" id="addCatBtn" style="margin-top:14px">＋ 新建分类</button>
    <div class="card" style="padding:0">${rows || '<div class="empty">暂无分类</div>'}</div>
  </div>`;
}

// ---------- 周期记账（bk_recurring：模板存 localStorage，sync 成功后检查到期自动记账） ----------
// 模板: { id, name, type, amountInCents, categoryId, period: 'weekly'|'monthly'|'yearly',
//         startDow(0-6 周几), startDay(1-31 几号), startYmmd('MM-DD'), lastRun('YYYY-MM-DD') }
function loadRecurring() {
  try { return JSON.parse(localStorage.getItem('bk_recurring')) || []; }
  catch { return []; }
}
function saveRecurring(list) {
  localStorage.setItem('bk_recurring', JSON.stringify(list));
}

function recDesc(r) {
  const c = catById(r.categoryId);
  let when = '';
  if (r.period === 'weekly') when = `周${'日一二三四五六'[r.startDow]}`;
  else if (r.period === 'monthly') when = `每月 ${r.startDay} 日`;
  else when = `每年 ${r.startYmmd.replace('-', ' 月 ')} 日`;
  return `¥${fmtCents(r.amountInCents)} · ${c ? esc(c.name) : '未知分类'} · ${when}`;
}

function recurringRowsHTML() {
  const list = loadRecurring();
  if (!list.length) return '<div class="empty" style="padding:20px 0">暂无周期模板</div>';
  return list.map((r) => `
    <div class="tx-item">
      <span class="tx-icon ${r.type === EXPENSE ? 'expense' : 'income'}">${iconEmoji(catById(r.categoryId)?.icon)}</span>
      <span class="tx-info">
        <span class="name">${esc(r.name)}</span>
        <span class="note">${recDesc(r)}${r.lastRun ? ` · 上次 ${r.lastRun}` : ''}</span>
      </span>
      <button class="text-btn" data-delrecur="${r.id}">删除</button>
    </div>`).join('');
}

function showAddRecurring() {
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  mask.innerHTML = `
    <div class="sheet">
      <div class="sheet-header">
        <button class="text-btn" id="recCancel">取消</button>
        <h2>添加周期模板</h2>
        <button class="text-btn primary" id="recSave">保存</button>
      </div>
      <div class="seg-tabs">
        <button class="seg active" data-rtype="0">支出</button>
        <button class="seg" data-rtype="1">收入</button>
      </div>
      <div class="form-group">
        <div class="form-row plain" style="border-radius:12px 12px 0 0"><label>名称</label><input id="recName" type="text" placeholder="如：房租" maxlength="20"></div>
        <div class="form-row plain"><label>金额（元）</label><input id="recAmount" type="text" inputmode="decimal" placeholder="0.00"></div>
        <div class="form-row plain"><label>分类</label><select id="recCat"></select></div>
        <div class="form-row plain"><label>周期</label><select id="recPeriod"><option value="weekly">每周</option><option value="monthly" selected>每月</option><option value="yearly">每年</option></select></div>
        <div class="form-row plain" style="border-radius:0 0 12px 12px;border-bottom:none"><label>起始日</label><input id="recStart" type="date"></div>
      </div>
      <div class="status-text">到期后将自动创建账单；起始日决定每周几 / 每月几号 / 每年哪天执行。</div>
    </div>`;
  document.body.appendChild(mask);
  let type = EXPENSE;
  const catSel = mask.querySelector('#recCat');
  const fillCats = () => {
    catSel.innerHTML = state.categories.filter((c) => c.type === type)
      .map((c) => `<option value="${c.id}">${iconEmoji(c.icon)} ${esc(c.name)}</option>`).join('');
  };
  fillCats();
  mask.querySelectorAll('[data-rtype]').forEach((b) => b.addEventListener('click', () => {
    mask.querySelectorAll('[data-rtype]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    type = Number(b.dataset.rtype);
    fillCats();
  }));
  mask.querySelector('#recCancel').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  mask.querySelector('#recSave').addEventListener('click', () => {
    const name = mask.querySelector('#recName').value.trim();
    const amount = Math.round(parseFloat(mask.querySelector('#recAmount').value.replace(/[,，\s]/g, '')) * 100);
    const startVal = mask.querySelector('#recStart').value;
    if (!name) return toast('请填写名称');
    if (!amount || amount <= 0) return toast('请输入有效金额');
    if (!startVal) return toast('请选择起始日');
    const start = new Date(startVal + 'T12:00:00');
    const period = mask.querySelector('#recPeriod').value;
    const list = loadRecurring();
    list.push({
      id: Date.now(),
      name,
      type,
      amountInCents: amount,
      categoryId: Number(catSel.value),
      period,
      startDow: start.getDay(),
      startDay: start.getDate(),
      startYmmd: startVal.slice(5), // MM-DD
      startYmd: startVal, // 完整起始日 YYYY-MM-DD
      lastRun: ''
    });
    saveRecurring(list);
    mask.remove();
    render();
    toast('✅ 周期模板已添加');
  });
}

// 到期检查：sync 成功后调用，自动创建账单（lastRun 防重复，每天至多触发一次）
async function checkRecurring() {
  const list = loadRecurring();
  if (!list.length) return;
  const today = new Date();
  const tk = dateKey(today);
  const monthStr = monthKey(today);
  const yearStr = String(today.getFullYear());
  let created = 0;
  for (const r of list) {
    if (r.lastRun === tk) continue;
    if (r.startYmd && tk < r.startYmd) continue; // 起始日未到不触发
    let due = false;
    if (r.period === 'weekly') due = today.getDay() === r.startDow;
    else if (r.period === 'monthly') due = monthStr !== (r.lastRun || '').slice(0, 7) && today.getDate() >= Math.min(r.startDay, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate());
    else if (r.period === 'yearly') due = yearStr !== (r.lastRun || '').slice(0, 4) && r.startYmmd === tk.slice(5);
    if (!due) continue;
    r.lastRun = tk; // 先记后建：即便失败也避免当天重复弹单
    try {
      await cloud.addTransaction({
        type: r.type,
        amountInCents: r.amountInCents,
        categoryId: r.categoryId,
        note: `${r.name}（周期记账）`,
        date: new Date(tk + 'T12:00:00').getTime()
      });
      created++;
    } catch { /* 失败时本地仍会排队补传（数据层兜底） */ }
  }
  saveRecurring(list);
  if (created > 0) {
    toast(`✅ 周期记账已创建 ${created} 笔`);
    await refresh();
  }
}

// ---------- 设置页（我的） ----------
function bookkeepingStats() {
  const days = new Set(state.transactions.map((t) => dateKey(new Date(t.date))));
  // 连续记账天数：从今天（或昨天）往前连续有账单的天数
  let streak = 0;
  let cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor = new Date(Date.now() - 86400000);
  while (days.has(dateKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return { totalDays: days.size, totalTx: state.transactions.length, streak };
}

function renderSettings() {
  const st = bookkeepingStats();
  const ic = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `<div class="page">
    <div class="profile-head">
      <div class="profile-row">
        <img class="avatar" src="assets/avatar.png" alt="头像">
        <div class="profile-name">${esc(cloud.getUsername() || '已登录')}</div>
      </div>
      <div class="profile-stats">
        <div><div class="pv">${st.streak}</div><div class="pl">连续记账天数</div></div>
        <div><div class="pv">${st.totalDays}</div><div class="pl">记账天数</div></div>
        <div><div class="pv">${st.totalTx}</div><div class="pl">总笔数</div></div>
      </div>
    </div>
    <div class="list-card">
      <button class="list-row" id="exportBtn"><span class="row-icon">${ic('<path d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5"/><path d="M4.5 15.5v3A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5v-3"/>')}</span><span class="row-label">导出数据（JSON）</span><span class="arrow">›</span></button>
      <button class="list-row" id="addRecurEntry"><span class="row-icon">${ic('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3.5v3m7-3v3"/><path d="M9 15h6"/>')}</span><span class="row-label">周期记账</span><span class="row-extra">${loadRecurring().length || ''}</span><span class="arrow">›</span></button>
      <button class="list-row" id="wipeBtn"><span class="row-icon">${ic('<path d="M5 7h14"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M7 7l1 13h8l1-13"/>')}</span><span class="row-label">清空云端数据</span><span class="arrow">›</span></button>
    </div>
    <div class="section-title">云端同步</div>
    <div class="form-group">
      <div class="form-row"><label>API 地址</label><input id="setApiBase" type="text" placeholder="${esc(cloud.DEFAULT_API)}" value="${esc(cloud.loadSettings().apiBase || '')}"></div>
      <div class="form-row"><label>月度预算（元）</label><input id="setBudget" type="number" inputmode="decimal" placeholder="不设置" value="${monthlyBudget() || ''}"></div>
    </div>
    <div class="status-text">数据实时写入云端；本地保留缓存，断网时可正常记账查看，恢复网络后自动补传同步。</div>
    <div class="section-title">周期记账模板</div>
    <div class="card" style="padding:0">${recurringRowsHTML()}</div>
    <button class="btn-block primary" id="addRecurBtn">＋ 添加周期模板</button>
    <div class="list-card">
      <button class="list-row" id="logoutBtn"><span class="row-icon">${ic('<path d="M15 12H4m0 0l3.5-3.5M4 12l3.5 3.5"/><path d="M12 4h5.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H12"/>')}</span><span class="row-label">退出登录</span><span class="arrow">›</span></button>
    </div>
    <div class="status-text">记账本 PWA <span id="swVersion"></span> · 数据模型与 iOS 版一致，金额以「分」存储。数据保存在云端，可随时导出备份。</div>
  </div>`;
}

// ---------- 渲染 ----------
function render() {
  updateNav();
  destroyCharts();
  const container = document.getElementById('pageContainer');
  if (state.tab === 'home') container.innerHTML = renderHome();
  else if (state.tab === 'stats') container.innerHTML = renderStats();
  else if (state.tab === 'categories') container.innerHTML = renderCategories();
  else container.innerHTML = renderSettings();
  container.scrollTop = 0;
  bindPageEvents();
  mountCharts();
}

// ---------- 导出数据（首页快捷入口与设置页共用） ----------
async function doExport() {
  let exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.disabled = true;
  try {
    const blob = await cloud.exportData();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bookkeep-${cloud.getUsername() || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('✅ 已导出');
  } catch (e) {
    toast('导出失败：' + e.message, 4000);
  } finally {
    if (exportBtn) exportBtn.disabled = false;
  }
}

// ---------- 页面事件 ----------
function bindPageEvents() {
  const container = document.getElementById('pageContainer');

  // 首页搜索/筛选：只重绘账单列表，保持搜索框焦点
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      state.filter.q = searchInput.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const list = document.getElementById('txList');
        if (list) list.innerHTML = txListHTML();
        bindTxListEvents();
      }, 200);
    });
    const filterCat = document.getElementById('filterCat');
    filterCat.addEventListener('change', () => {
      state.filter.cat = filterCat.value;
      document.getElementById('txList').innerHTML = txListHTML();
      bindTxListEvents();
    });
    const filterMonth = document.getElementById('filterMonth');
    filterMonth.addEventListener('change', () => {
      state.filter.scope = filterMonth.value;
      document.getElementById('txList').innerHTML = txListHTML();
      bindTxListEvents();
    });
  }

  // 账单列表项（局部重绘后可单独重绑）
  bindTxListEvents();

  // 分类删除
  container.querySelectorAll('[data-delcat]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number(el.dataset.delcat);
      const used = state.transactions.some((t) => t.categoryId === id);
      if (await confirmDialog(used ? '该分类下已有账单，删除后账单将显示为「未知分类」，确定删除？' : '确定删除该分类？')) {
        await cloudAction(() => cloud.deleteCategory(id), '已删除');
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

  // 周期记账
  const addRecurBtn = document.getElementById('addRecurBtn');
  if (addRecurBtn) {
    addRecurBtn.addEventListener('click', showAddRecurring);
    container.querySelectorAll('[data-delrecur]').forEach((el) => {
      el.addEventListener('click', async () => {
        if (!(await confirmDialog('确定删除该周期模板？已创建的账单不受影响。'))) return;
        saveRecurring(loadRecurring().filter((r) => String(r.id) !== el.dataset.delrecur));
        render();
        toast('已删除');
      });
    });
  }

  // 快捷入口（首页）
  const quickSearch = document.getElementById('quickSearch');
  if (quickSearch) {
    quickSearch.addEventListener('click', () => {
      const si = document.getElementById('searchInput');
      if (si) si.focus();
    });
    document.getElementById('quickRecur').addEventListener('click', () => switchTab('settings'));
    document.getElementById('quickExport').addEventListener('click', doExport);
    document.getElementById('quickChart').addEventListener('click', () => switchTab('stats'));
    document.getElementById('quickMore').addEventListener('click', () => switchTab('settings'));
    // 首页头部月份切换（元素可能不存在于其它视图，须判空）
    const mp = document.getElementById('monthPrevHome');
    if (mp) mp.addEventListener('click', () => {
      state.month = shiftMonth(state.month, -1); render();
    });
    const mn = document.getElementById('monthNextHome');
    if (mn) mn.addEventListener('click', () => {
      state.month = shiftMonth(state.month, 1); render();
    });
  }

  // 设置页
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', doExport);
    const recurEntry = document.getElementById('addRecurEntry');
    if (recurEntry) recurEntry.addEventListener('click', () => {
      const target = document.getElementById('addRecurBtn');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.getElementById('wipeBtn').addEventListener('click', async () => {
      if (!(await confirmDialog('将清空你账号下的全部云端账单与分类，且不可恢复，确定继续？'))) return;
      if (!(await confirmDialog('再次确认：真的要清空全部数据吗？'))) return;
      try {
        await cloud.wipeData();
        toast('✅ 已清空');
        await refresh();
      } catch (e) {
        toast('清空失败：' + e.message, 4000);
      }
    });
    const verEl = document.getElementById('swVersion');
    if (verEl && navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('get-version');
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (typeof e.data === 'string' && e.data.startsWith('bookkeep-')) {
          verEl.textContent = '(' + e.data.replace('bookkeep-v', '') + ')';
        }
      });
    }
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      if (!(await confirmDialog('确定退出登录？'))) return;
      await cloud.logout();
      location.reload();
    });
    const apiBaseEl = document.getElementById('setApiBase');
    apiBaseEl.addEventListener('change', async () => {
      const s = cloud.loadSettings();
      s.apiBase = apiBaseEl.value.trim();
      localStorage.setItem('bk_backup_settings', JSON.stringify(s));
      toast('API 地址已保存');
    });
    const setBudget = document.getElementById('setBudget');
    setBudget.addEventListener('change', () => {
      localStorage.setItem('bk_monthly_budget', setBudget.value || '0');
      toast('预算已保存');
    });
  }
}

// ---------- 账单列表项事件 ----------
function bindTxListEvents() {
  document.querySelectorAll('#txList [data-txid]').forEach((el) => {
    el.addEventListener('click', () => showTxDetail(Number(el.dataset.txid)));
  });
}

// ---------- 账单详情 ----------
async function showTxDetail(id) {
  const t = state.transactions.find((x) => x.id === id);
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
      const ok = await cloudAction(() => cloud.deleteTransaction(id), '已删除');
      if (ok) mask.remove();
    }
  });
}

// ---------- 新建分类 ----------
async function showAddCategory() {
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const icons = ['fork.knife', 'cup.and.saucer.fill', 'car.fill', 'bus.fill', 'cart.fill', 'bag.fill', 'gift.fill', 'gamecontroller.fill', 'house.fill', 'bolt.fill', 'drop.fill', 'phone.fill', 'heart.fill', 'cross.case.fill', 'book.fill', 'graduationcap.fill', 'airplane', 'film.fill', 'music.note', 'pawprint.fill', 'tshirt.fill', 'dumbbell.fill', 'creditcard.fill', 'banknote.fill', 'wallet.pass.fill', 'briefcase.fill', 'star.fill', 'sportscourt.fill', 'tag'];
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
      <div class="form-row plain" style="border-radius:0 0 12px 12px;border-bottom:none"><label>图标</label><span id="catIconPreview" style="width:28px;height:28px;display:inline-flex">${iconEmoji('tag')}</span></div>
      <div class="icon-grid" id="catIcons">${icons.map((ic, i) => `
        <button class="icon-cell small ${i === icons.length - 1 ? 'selected' : ''}" data-icon="${ic}">${iconEmoji(ic)}</button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(mask);
  let type = EXPENSE;
  let icon = 'tag';
  mask.querySelectorAll('[data-ctype]').forEach((b) => b.addEventListener('click', () => {
    mask.querySelectorAll('[data-ctype]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    type = Number(b.dataset.ctype);
  }));
  mask.querySelectorAll('[data-icon]').forEach((b) => b.addEventListener('click', () => {
    mask.querySelectorAll('[data-icon]').forEach((x) => x.classList.remove('selected'));
    b.classList.add('selected');
    icon = b.dataset.icon;
    mask.querySelector('#catIconPreview').innerHTML = iconEmoji(icon);
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
    await cloudAction(() => cloud.addCategory({ name, icon, type, sortOrder: maxSort + 1 }), '已添加');
    mask.remove();
  });
}

// ---------- 记一笔 ----------
let addType = EXPENSE;
let addCategoryId = null;

function renderAddCategories() {
  const grid = document.getElementById('addCategories');
  const freq = loadCatFreq();
  // 常用分类置顶：按使用频次降序，其次按原有排序
  const list = state.categories.filter((c) => c.type === addType)
    .sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0) || (a.sortOrder - b.sortOrder) || (a.id - b.id));
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
  const ok = await cloudAction(() => cloud.addTransaction({
    type: addType,
    amountInCents: amount,
    categoryId: addCategoryId,
    note: document.getElementById('noteInput').value.trim(),
    date
  }), '已记账');
  if (!ok) return; // 失败：保留输入，不关闭弹层
  bumpCatFreq(addCategoryId);
  document.getElementById('addSheet').classList.add('hidden');
}

// ---------- 登录 / 注册页 ----------
function showAuthScreen(mode = 'login') {
  const container = document.getElementById('pageContainer');
  document.body.classList.add('overscroll-yellow');
  document.querySelector('.tab-bar').classList.add('hidden');
  document.getElementById('navTitle').textContent = '记账本';
  document.getElementById('monthPrev').style.visibility = 'hidden';
  document.getElementById('monthNext').style.visibility = 'hidden';
  container.style.paddingTop = '0';
  container.innerHTML = `
    <div style="background:var(--primary);margin:0 -16px;padding:12px 16px 18px;text-align:center">
      <img class="avatar avatar-lg" src="assets/avatar.png" alt="记账本头像" style="border-width:3px">
        <div style="font-size:22px;font-weight:700;margin-top:4px">记账本</div>
        <div style="font-size:13px;color:#666;margin-top:4px">简单清晰地记好每一笔</div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="seg-tabs" style="margin-bottom:16px">
          <button class="seg ${mode === 'login' ? 'active' : ''}" data-amode="login">登录</button>
          <button class="seg ${mode === 'register' ? 'active' : ''}" data-amode="register">注册</button>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <div class="form-row plain" style="border-radius:12px 12px 0 0"><label>用户名</label><input id="authUser" type="text" placeholder="3-20 位字母、数字或下划线" maxlength="20" autocomplete="username"></div>
          <div class="form-row plain" style="${mode === 'register' ? '' : 'border-radius:0 0 12px 12px;border-bottom:none'}"><label>密码</label><input id="authPwd" type="password" placeholder="${mode === 'register' ? '至少 8 位' : '密码'}" autocomplete="current-password"></div>
          ${mode === 'register' ? '<div class="form-row plain" style="border-radius:0 0 12px 12px;border-bottom:none"><label>邀请码</label><input id="authInvite" type="text" placeholder="请输入邀请码"></div>' : ''}
        </div>
        <button class="btn-block primary" id="authSubmit" style="margin-top:16px">${mode === 'login' ? '登录' : '注册并登录'}</button>
        <div class="status-text" id="authMsg" style="text-align:center"></div>
      </div>
    </div>`;
  container.querySelectorAll('[data-amode]').forEach((b) => {
    b.addEventListener('click', () => showAuthScreen(b.dataset.amode));
  });
  container.querySelector('#authSubmit').addEventListener('click', async () => {
    const btn = container.querySelector('#authSubmit');
    const msg = container.querySelector('#authMsg');
    const user = container.querySelector('#authUser').value.trim();
    const pwd = container.querySelector('#authPwd').value;
    const invite = (container.querySelector('#authInvite') || {}).value || '';
    msg.textContent = '';
    if (!user || !pwd) { msg.textContent = '请填写用户名和密码'; return; }
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>' + (mode === 'login' ? '登录中…' : '注册中…');
    try {
      if (mode === 'login') await cloud.login(user, pwd);
      else await cloud.register(user, pwd, invite);
      toast(`欢迎，${cloud.getUsername()}`);
      await initAndRender();
    } catch (e) {
      msg.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });
  container.querySelector('#authPwd').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') container.querySelector('#authSubmit').click();
  });
}

// ---------- 初始化 ----------
function switchTab(tab) {
  if (!cloud.isAuthed()) { showAuthScreen(); return; }
  state.tab = tab;
  // 橡皮筋回弹底色：黄头页面启用顶部黄条，白头页面保持纯白
  document.body.classList.toggle('overscroll-yellow', tab !== 'categories');
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
  document.getElementById('addBtn').addEventListener('click', () => {
    if (!cloud.isAuthed()) { showAuthScreen(); return; }
    openAddSheet();
  });
  document.getElementById('addCancel').addEventListener('click', () => {
    document.getElementById('addSheet').classList.add('hidden');
  });
  document.getElementById('segExpense').addEventListener('click', () => { addType = EXPENSE; updateAddSeg(); renderAddCategories(); });
  document.getElementById('segIncome').addEventListener('click', () => { addType = INCOME; updateAddSeg(); renderAddCategories(); });
  document.getElementById('addSave').addEventListener('click', saveAdd);
  // 快捷金额：+10/+50/+100 叠加到当前输入；自定义聚焦输入框
  document.querySelectorAll('.quick-amounts .qa[data-amt]').forEach((b) => {
    b.addEventListener('click', () => {
      const input = document.getElementById('amountInput');
      const cur = parseFloat(input.value.replace(/[,，\s]/g, '')) || 0;
      input.value = (cur + Number(b.dataset.amt)).toFixed(2).replace(/\.00$/, '');
    });
  });
  document.getElementById('qaCustom').addEventListener('click', () => {
    document.getElementById('amountInput').focus();
  });
  // 明细页下拉刷新：拉过阈值即同步云端
  const pc = document.getElementById('pageContainer');
  let pullStartY = 0, pullArmed = false;
  pc.addEventListener('touchstart', (e) => {
    pullArmed = pc.scrollTop <= 0 && cloud.isAuthed();
    pullStartY = e.touches[0].clientY;
  }, { passive: true });
  pc.addEventListener('touchmove', (e) => {
    if (!pullArmed || pc.dataset.refreshing) return;
    if (e.touches[0].clientY - pullStartY > 75) {
      pc.dataset.refreshing = '1';
      toast('正在同步…');
      Promise.resolve().then(() => refresh()).then(() => toast('账本已更新')).catch(() => {})
        .finally(() => { delete pc.dataset.refreshing; });
    }
  }, { passive: true });

  // 日期快捷选择：今天/昨天/前天
  document.getElementById('dateChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const d = new Date();
    d.setDate(d.getDate() - Number(chip.dataset.day));
    document.getElementById('dateInput').value = dateKey(d);
    document.querySelectorAll('#dateChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
  });

  registerSW();
  setupOfflineBanner();
  initAndRender();
}

// ---------- 离线横幅 ----------
function updateOfflineBanner() {
  const el = document.getElementById('offlineBanner');
  if (el) el.classList.toggle('hidden', !cloud.isOffline());
}

function setupOfflineBanner() {
  updateOfflineBanner();
  window.addEventListener('offline', updateOfflineBanner);
  window.addEventListener('online', async () => {
    updateOfflineBanner();
    // 网络恢复：冲刷队列 + 拉取全量
    await backgroundSync();
    if (cloud.isAuthed() && !cloud.isOffline()) toast('网络已恢复，数据已同步');
  });
  // 回前台/启动时补传
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') backgroundSync();
  });
}

async function initAndRender() {
  // 登录门：无 token 时先显示登录/注册页
  if (!cloud.isAuthed()) {
    showAuthScreen();
    return;
  }
  document.querySelector('.tab-bar').classList.remove('hidden');
  try {
    await refresh(); // 启动即从云端拉全量
  } catch (e) {
    if (/NOAUTH|重新登录/.test(e.message || '')) { showAuthScreen(); return; }
    toast(e.message || '云端数据加载失败，请检查网络', 4000);
    updateOfflineBanner();
  }
}

init();
