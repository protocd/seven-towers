/* Service worker: кэширует всё приложение при первой загрузке, дальше работает без сети.
   При любом изменении файлов увеличь VERSION, иначе телефоны останутся на старой копии. */
const VERSION = 'sevenkeys-v1.4.5';
const FILES = [
  './',
  './app.css',
  './app.js',
  './data.js',
  './fonts.css',
  './fonts/ibm-plex-mono-cyrillic-500-normal.woff2',
  './fonts/ibm-plex-mono-latin-500-normal.woff2',
  './fonts/ibm-plex-sans-cyrillic-400-normal.woff2',
  './fonts/ibm-plex-sans-cyrillic-500-normal.woff2',
  './fonts/ibm-plex-sans-cyrillic-600-normal.woff2',
  './fonts/ibm-plex-sans-latin-400-normal.woff2',
  './fonts/ibm-plex-sans-latin-500-normal.woff2',
  './fonts/ibm-plex-sans-latin-600-normal.woff2',
  './fonts/oswald-cyrillic-500-normal.woff2',
  './fonts/oswald-cyrillic-600-normal.woff2',
  './fonts/oswald-latin-500-normal.woff2',
  './fonts/oswald-latin-600-normal.woff2',
  './fx.js',
  './map-data.js',
  './mapview.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './index.html',
  './keys.json',
  './manifest.webmanifest',
  './scan-core.js',
  './scan-worker.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* сначала кэш, сеть только если файла нет (например, после обновления списка) */
self.addEventListener('fetch', e => {
  if (new URL(e.request.url).pathname.endsWith('/keys.json')){
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('./keys.json', c)); return r; }).catch(() => caches.match('./keys.json')));
    return;
  }
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./')))
  );
});
