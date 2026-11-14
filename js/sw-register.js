// Service Worker 注册
let _reloaded = false;
export function registerSW() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!_reloaded) { _reloaded = true; location.reload(); } // 新 SW 接管即刷新，用户无需二次重开
    });
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      setInterval(() => reg.update().catch(() => {}), 300000); // 每 5 分钟检查更新（省 KV 配额）
    }).catch((err) => {
      console.warn('[PWA] Service Worker 注册失败:', err);
    });
  }
}
