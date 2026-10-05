// 静的ファイルだけをキャッシュする Service Worker。記録やバックアップは扱わない。
// リリースごとに CACHE_NAME の末尾を更新する。

const CACHE_PREFIX = 'personal-habits-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/habits.js',
  './js/dates.js',
  './js/model.js',
  './js/storage.js',
  './js/backup.js',
  './js/calendar.js',
  './js/record-view.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // skipWaiting は使わない（使用中のアプリを新版で強制置換しない）
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  // 自アプリの古い shell キャッシュだけ削除する
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;

  if (req.mode === 'navigate') {
    // ネットワーク優先、失敗時はキャッシュの index.html
    event.respondWith(
      fetch(req).catch(() => caches.open(CACHE_NAME)
        .then((cache) => cache.match(new URL('./index.html', self.registration.scope).href))
        .then((res) => res || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => cache.match(req, { ignoreSearch: true }))
      .then((cached) => cached || fetch(req)),
  );
});
