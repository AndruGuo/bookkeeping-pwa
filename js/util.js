// 通用工具与常量
export const EXPENSE = 0, INCOME = 1;

export const SF_TO_EMOJI = {
  'fork.knife': '🍴', 'cup.and.saucer.fill': '☕', 'car.fill': '🚗', 'bus.fill': '🚌',
  'cart.fill': '🛒', 'bag.fill': '👜', 'gift.fill': '🎁', 'gamecontroller.fill': '🎮',
  'house.fill': '🏠', 'bolt.fill': '⚡', 'drop.fill': '💧', 'phone.fill': '📞',
  'wifi': '📶', 'heart.fill': '❤️', 'cross.case.fill': '🩺', 'book.fill': '📚',
  'graduationcap.fill': '🎓', 'airplane': '✈️', 'film.fill': '🎬', 'music.note': '🎵',
  'pawprint.fill': '🐾', 'tshirt.fill': '👕', 'dumbbell.fill': '🏋️', 'pills.fill': '💊',
  'creditcard.fill': '💳', 'banknote.fill': '💵', 'bitcoinsign.circle.fill': '₿',
  'chart.line.uptrend.xyaxis': '📈', 'wallet.pass.fill': '👛', 'briefcase.fill': '💼',
  'star.fill': '⭐', 'sparkles': '✨', 'leaf.fill': '🍃', 'cup.fill': '🥤',
  'sportscourt.fill': '⚽', 'envelope.fill': '💌'
};

export function iconEmoji(sfName) {
  return SF_TO_EMOJI[sfName] || '🏷️';
}

// 分类图表颜色
export const CHART_COLORS = [
  '#FF8C26', '#F24D40', '#33BF73', '#3B82F6', '#A855F7', '#EC4899',
  '#14B8A6', '#F59E0B', '#6366F1', '#84CC16', '#EF4444', '#06B6D4',
  '#8B5CF6', '#F97316', '#10B981', '#EAB308', '#64748B', '#EC4899'
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
