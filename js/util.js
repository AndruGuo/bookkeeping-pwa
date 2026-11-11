// 通用工具与常量
export const EXPENSE = 0, INCOME = 1;

// ---------- 鲨鱼记账风格内联 SVG 图标体系 ----------
// 粗描边（2.5px）圆角线条，黄色点缀由 CSS/背景提供
const S = 'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';
const CAT_ICONS = {
  'fork.knife': `<g ${S}><path d="M8 3v6a2 2 0 0 1-2 2v10"/><path d="M6 3v5"/><ellipse cx="8" cy="4.5" rx="2" ry="2.6"/><path d="M15 3c2 0 3 2.2 3 5.5S17 14 15 14v7"/><path d="M15 3v11"/></g>`,
  'cup.and.saucer.fill': `<g ${S}><path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8z"/><path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M4 21h13"/><path d="M9 4c0 1 .8 1 .8 2M12.5 4c0 1 .8 1 .8 2" stroke-width="2"/></g>`,
  'car.fill': `<g ${S}><path d="M4 13l1.6-4.5A2 2 0 0 1 7.5 7h9a2 2 0 0 1 1.9 1.5L20 13v5h-2.5M4 18v-5m0 5h2.5m11 0h-11m0 0v1.5m11-1.5v1.5"/><path d="M5.5 13h13"/><path d="M7.5 15.8h.01M16.5 15.8h.01" stroke-width="3"/></g>`,
  'bus.fill': `<g ${S}><rect x="5" y="4" width="14" height="14" rx="2.5"/><path d="M5 11h14"/><path d="M8.5 18v2m7-2v2"/><path d="M8 7.5h8"/></g>`,
  'cart.fill': `<g ${S}><path d="M4 5h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6.4"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></g>`,
  'bag.fill': `<g ${S}><path d="M5.5 8.5h13l-1 11a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8l-1-11z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></g>`,
  'gift.fill': `<g ${S}><rect x="4" y="10" width="16" height="4" rx="1"/><path d="M6 14v6a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 20v-6"/><path d="M12 10v11.5"/><path d="M12 10c-4 0-5.5-1.2-5.5-3A2 2 0 0 1 8.5 5C10.5 5 12 7 12 10zm0 0c4 0 5.5-1.2 5.5-3A2 2 0 0 0 15.5 5C13.5 5 12 7 12 10z"/></g>`,
  'gamecontroller.fill': `<g ${S}><path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.4l-.8 4a3 3 0 0 1-5.3 1.2L14 17h-4l-1.3 1.6a3 3 0 0 1-5.3-1.2l-.8-4A4.5 4.5 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11.5" r="0.5"/><circle cx="18" cy="13.5" r="0.5"/></g>`,
  'house.fill': `<g ${S}><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></g>`,
  'bolt.fill': `<g ${S}><path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12L13 3z"/></g>`,
  'drop.fill': `<g ${S}><path d="M12 3.5s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></g>`,
  'phone.fill': `<g ${S}><path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/></g>`,
  'wifi': `<g ${S}><path d="M4 9.5a12 12 0 0 1 16 0"/><path d="M7 13a8 8 0 0 1 10 0"/><path d="M10 16.5a4 4 0 0 1 4 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none"/></g>`,
  'heart.fill': `<g ${S}><path d="M12 20s-7.5-4.8-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 3c0 5.2-7.5 10-7.5 10z"/></g>`,
  'cross.case.fill': `<g ${S}><rect x="4" y="7" width="16" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M12 10.5v6M9 13.5h6"/></g>`,
  'book.fill': `<g ${S}><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v14.5"/><path d="M5 4.5V19a2 2 0 0 0 2 2h12"/><path d="M5 18.5A1.5 1.5 0 0 1 6.5 17H19"/></g>`,
  'graduationcap.fill': `<g ${S}><path d="M12 4L2.5 9 12 14l9.5-5L12 4z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M21.5 9v5"/></g>`,
  'airplane': `<g ${S}><path d="M10.5 13.5L3 11l1.5-1.5 6 1 5-6.5 2.5.5-3 7 5.5 1.5L19 15l-6-1-2.5 6.5L9 21l1.5-7.5z"/></g>`,
  'film.fill': `<g ${S}><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M8 5v14M16 5v14M3.5 9h4.5M3.5 15h4.5M16 9h4.5M16 15h4.5"/></g>`,
  'music.note': `<g ${S}><path d="M9 18V5.5L19 4v12.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></g>`,
  'pawprint.fill': `<g ${S}><circle cx="7" cy="9" r="1.8"/><circle cx="11" cy="6.5" r="1.8"/><circle cx="16" cy="7.5" r="1.8"/><circle cx="19" cy="11.5" r="1.6"/><path d="M12.5 12c2.5 0 5 2 5 4.5 0 2-1.5 3.5-3.5 3.5-1 0-1.5-.5-2.5-.5s-1.5.5-2.5.5c-2 0-3.5-1.5-3.5-3.5 0-2.5 2.5-4.5 5-4.5z" transform="translate(-1 0)"/></g>`,
  'tshirt.fill': `<g ${S}><path d="M8 4L4 7l2 3 1.5-1V20h9V9l1.5 1 2-3-4-3a4 4 0 0 1-8 0z"/></g>`,
  'dumbbell.fill': `<g ${S}><path d="M3 10.5v3M6 8v8M18 8v8M21 10.5v3M6 12h12"/></g>`,
  'pills.fill': `<g ${S}><rect x="3.5" y="10" width="12" height="7" rx="3.5" transform="rotate(-20 9.5 13.5)"/><path d="M8 9l4 7" transform="rotate(0)"/><circle cx="17.5" cy="16.5" r="3.5"/><path d="M15.5 18.5l4-4"/></g>`,
  'creditcard.fill': `<g ${S}><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18"/><path d="M6.5 15h4"/></g>`,
  'banknote.fill': `<g ${S}><rect x="3" y="7" width="18" height="11" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6.5 10.5h.01M17.5 14.5h.01" stroke-width="3"/></g>`,
  'bitcoinsign.circle.fill': `<g ${S}><circle cx="12" cy="12" r="8.5"/><path d="M10 8.5h3a1.8 1.8 0 0 1 0 3.5h-3m0 0h3.5a1.8 1.8 0 0 1 0 3.5H10m0-7V8m0 8v.5m0-8.5v7"/><path d="M10 8.5V7.5m0 9v-1"/></g>`,
  'chart.line.uptrend.xyaxis': `<g ${S}><path d="M4 4v16h16"/><path d="M7 15l4-4 3 2.5 5.5-6"/><circle cx="19.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></g>`,
  'wallet.pass.fill': `<g ${S}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9z"/><path d="M4 9.5h16"/><path d="M14.5 13.5h3"/></g>`,
  'briefcase.fill': `<g ${S}><rect x="3.5" y="8" width="17" height="12" rx="2.5"/><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8"/><path d="M3.5 12.5h17"/><rect x="10" y="11" width="4" height="3" rx="0.8"/></g>`,
  'star.fill': `<g ${S}><path d="M12 4l2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.3 7 19l1.1-5.5L4 9.7 9.6 9 12 4z"/></g>`,
  'sparkles': `<g ${S}><path d="M12 5l1.5 4L18 10.5 13.5 12 12 16l-1.5-4L6 10.5 10.5 9 12 5z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/></g>`,
  'leaf.fill': `<g ${S}><path d="M6 18C6 10 11 5.5 19 5c.5 8-3.5 13-11 13-1 0-2-.3-2-.3S5.5 18.5 4 20"/><path d="M6.5 17.5C9 13 12 10.5 16 8.5"/></g>`,
  'cup.fill': `<g ${S}><path d="M6 4h12l-1.2 15a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 4z"/><path d="M6.5 9h11"/></g>`,
  'sportscourt.fill': `<g ${S}><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v3m0 11v3"/><path d="M12 9a3 3 0 0 1 0 6 3 3 0 0 1 0-6z"/></g>`,
  'envelope.fill': `<g ${S}><rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M4.5 8l7.5 5.5L19.5 8"/></g>`,
  // 通用标签（自定义分类兜底）
  'tag': `<g ${S}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V5a2 2 0 0 1 2-2h8l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none"/></g>`
};

export function iconEmoji(sfName) {
  const body = CAT_ICONS[sfName] || CAT_ICONS['tag'];
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// 分类图表颜色（黄黑主体系的延伸色板）
export const CHART_COLORS = [
  '#FFD835', '#222222', '#FFE993', '#8A8A8A', '#FFC400', '#4A4A4A',
  '#FFF3BF', '#B8860B', '#D9D9D9', '#E8B004', '#666666', '#F5E27A',
  '#999999', '#FFDE6B', '#3A3A3A', '#CAB641', '#AAAAAA', '#FFEB99'
];

export function fmtCents(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  const s = yuan.toLocaleString('en-US') + '.' + String(fen).padStart(2, '0');
  return (neg ? '-' : '') + s;
}

export function fmtYuanInput(cents) {
  return (cents / 100).toFixed(2);
}

export function pad2(n) { return String(n).padStart(2, '0'); }

export function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function monthKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// 'YYYY-MM' -> {year, month(0-based)}
export function parseMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m - 1 };
}

export function monthTitle(key) {
  const { year, month } = parseMonth(key);
  return `${year}年${month + 1}月`;
}

export function shiftMonth(key, delta) {
  const { year, month } = parseMonth(key);
  const d = new Date(year, month + delta, 1);
  return monthKey(d);
}

export function monthRange(key) {
  const { year, month } = parseMonth(key);
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return { start, end };
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function dayTitle(key) {
  const today = dateKey(new Date());
  if (key === today) return '今天';
  const yesterday = dateKey(new Date(Date.now() - 86400000));
  if (key === yesterday) return '昨天';
  const d = new Date(key + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

export function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 简易 toast
let toastTimer = null;
export function toast(msg, duration = 2000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// 确认弹窗，返回 Promise<boolean>
export function confirmDialog(text) {
  return new Promise((resolve) => {
    const mask = document.getElementById('confirmDialog');
    document.getElementById('confirmText').textContent = text;
    mask.classList.remove('hidden');
    const done = (v) => {
      mask.classList.add('hidden');
      ok.onclick = cancel.onclick = null;
      resolve(v);
    };
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
  });
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
