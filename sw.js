const CACHE = 'bec-vocab-v1';
const ASSETS = [
  '/bec-vocab-app/',
  '/bec-vocab-app/index.html',
  '/bec-vocab-app/css/style.css',
  '/bec-vocab-app/js/data.js',
  '/bec-vocab-app/js/db.js',
  '/bec-vocab-app/js/srs.js',
  '/bec-vocab-app/js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
