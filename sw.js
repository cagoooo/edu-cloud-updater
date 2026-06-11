/* 學生教育雲帳號更新工具 — Service Worker
 * 版本閘門式（version-gated）：新版進入 waiting，由使用者在通知列決定何時套用。
 * HTML network-first、其餘資源（含 CDN 函式庫）cache-first + 背景更新 → 也可離線使用。
 */
const BUILD_VERSION = '2026.06.11-4';   // 每次部署改它（或跑 scripts/bump-version.ps1）
const CACHE = 'eduacct-' + BUILD_VERSION;
const PRECACHE = [
  './', './index.html',
  './favicon.svg', './favicon.ico', './apple-touch-icon.png',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/xlsx.full.min.js', './vendor/exceljs.min.js',
];

self.addEventListener('install', (e) => {
  // 不自動 skipWaiting → 保留 waiting 狀態才有東西可提示使用者
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.allSettled(PRECACHE.map((u) => c.add(u).catch(() => {})))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('eduacct-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    (await self.clients.matchAll({ type: 'window' }))
      .forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: BUILD_VERSION }));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  const sameOrigin = url.origin === self.location.origin;

  // version.json 永遠拿最新（更新偵測用）
  if (sameOrigin && url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // HTML network-first（確保拿到最新頁面，離線退快取）
  if (sameOrigin && (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html'))) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 其餘資源（含跨網域 CDN 函式庫）cache-first + 背景更新
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
