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

// 内置分类种子数据（与 SeedData.swift 一致）
export const SEED_CATEGORIES = [
  // 支出
  { name: '餐饮', icon: 'fork.knife', type: EXPENSE, isSystem: 1, sortOrder: 0 },
  { name: '交通', icon: 'car.fill', type: EXPENSE, isSystem: 1, sortOrder: 1 },
  { name: '购物', icon: 'cart.fill', type: EXPENSE, isSystem: 1, sortOrder: 2 },
  { name: '娱乐', icon: 'gamecontroller.fill', type: EXPENSE, isSystem: 1, sortOrder: 3 },
  { name: '居住', icon: 'house.fill', type: EXPENSE, isSystem: 1, sortOrder: 4 },
  { name: '水电煤', icon: 'bolt.fill', type: EXPENSE, isSystem: 1, sortOrder: 5 },
  { name: '通讯', icon: 'phone.fill', type: EXPENSE, isSystem: 1, sortOrder: 6 },
  { name: '医疗', icon: 'cross.case.fill', type: EXPENSE, isSystem: 1, sortOrder: 7 },
  { name: '教育', icon: 'graduationcap.fill', type: EXPENSE, isSystem: 1, sortOrder: 8 },
  { name: '旅行', icon: 'airplane', type: EXPENSE, isSystem: 1, sortOrder: 9 },
  { name: '服饰', icon: 'tshirt.fill', type: EXPENSE, isSystem: 1, sortOrder: 10 },
  { name: '运动', icon: 'dumbbell.fill', type: EXPENSE, isSystem: 1, sortOrder: 11 },
  { name: '宠物', icon: 'pawprint.fill', type: EXPENSE, isSystem: 1, sortOrder: 12 },
  { name: '其他', icon: 'ellipsis.circle.fill', type: EXPENSE, isSystem: 1, sortOrder: 13 },
  // 收入
  { name: '工资', icon: 'banknote.fill', type: INCOME, isSystem: 1, sortOrder: 0 },
  { name: '奖金', icon: 'gift.fill', type: INCOME, isSystem: 1, sortOrder: 1 },
  { name: '理财', icon: 'chart.line.uptrend.xyaxis', type: INCOME, isSystem: 1, sortOrder: 2 },
  { name: '兼职', icon: 'briefcase.fill', type: INCOME, isSystem: 1, sortOrder: 3 },
  { name: '红包', icon: 'envelope.fill', type: INCOME, isSystem: 1, sortOrder: 4 },
  { name: '其他', icon: 'ellipsis.circle.fill', type: INCOME, isSystem: 1, sortOrder: 5 }
];

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
