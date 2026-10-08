// Service worker de NotesGim: desa l'app a l'ordinador perquè funcioni sense internet.
// Puja la versió cada cop que canviïs index.html i els ordinadors es descarregaran la nova.
// (Les dades no passen mai per aquí: són al localStorage del navegador.)
const VERSION = 'notesgim-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('notesgim-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) {
        // el tenim: el servim de seguida i mirem si n'hi ha un de nou per a la pròxima
        fetch(e.request)
          .then(res => res.ok && caches.open(VERSION).then(c => c.put(e.request, res)))
          .catch(() => {});
        return hit;
      }
      return fetch(e.request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
