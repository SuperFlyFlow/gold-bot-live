// Gold Bot Live service worker: keeps the app's own files for a fast, installable start.
// Network first (so updates arrive), cache as the fallback. Supabase and other hosts are never cached.
const CACHE = 'gold-bot-live-v2';
const SHELL = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;   // data and CDNs: straight to network
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })   // always check GitHub for a newer copy, so page and script never mismatch
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html')))
  );
});
