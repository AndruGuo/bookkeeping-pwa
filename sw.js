// Service Worker：缓存静态资源，离线可用
const CACHE_NAME = 'bookkeep-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/util.js',
  './js/db.js',
  './js/backup.js',
  './js/cloud.js',
  './js/app.js',
  './js/sw-register.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 所有跨域请求（含 API、GitHub API）一律 network only，不经过 SW 缓存
  if (url.origin !== location.origin) return;
  // 导航请求：网络优先，失败回退缓存
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // 静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
