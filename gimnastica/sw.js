// Service worker de NotesGim: desa l'app a l'aparell perquè funcioni sense internet.
// VERSION: la publicació automàtica (GitHub Pages) hi posa el commit, i així cada aparell es posa al dia sol.
// Si la publiques a mà, puja-la cada cop que canviïs index.html.
// (Les dades no passen mai per aquí: són al navegador de cada aparell.)
const VERSION = 'notesgim-v10';
const SCOPE = self.registration.scope;              // …/gimnastica/
const PAGE = new URL('./', SCOPE).href;             // la pàgina de l'app, sempre amb la mateixa clau
const SHELL = ['./manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload': directament del servidor, no de la memòria del navegador (que podria ser la versió d'abans)
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all([
        fetch(new Request(PAGE, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return c.put(PAGE, r); }),
        ...SHELL.map(u => fetch(new Request(new URL(u, SCOPE).href, { cache: 'reload' })).then(r => r.ok && c.put(new URL(u, SCOPE).href, r)).catch(() => {})),
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('notesgim-')) { if (k !== VERSION) await caches.delete(k); continue; }
      // una altra app del mateix lloc (p. ex. NUS) pot haver desat pàgines de NotesGim: fora, que serien velles
      const c = await caches.open(k);
      for (const req of await c.keys()) if (req.url.startsWith(SCOPE)) await c.delete(req);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  const url = new URL(req.url);
  if (url.pathname.startsWith(new URL('api/', SCOPE).pathname)) return;
  const isPage = req.mode === 'navigate' || url.href.split(/[?#]/)[0] === PAGE || url.pathname.endsWith('/index.html');
  const key = isPage ? PAGE : url.origin + url.pathname;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(key);
    // es mira si n'hi ha una de nova (per a la pròxima vegada), però es respon de seguida amb la desada
    const net = fetch(isPage ? PAGE : key, { cache: 'no-cache' })
      .then(res => { if (res.ok && res.type === 'basic') return cache.put(key, res.clone()).then(() => res); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    try { return await net; }
    catch (err) { return (isPage && await cache.match(PAGE)) || Response.error(); }
  })());
});
