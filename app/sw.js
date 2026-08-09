/* Service worker: l'app deve partire anche senza rete.
   Il topino si comanda via Bluetooth, quindi una volta installata non c'è
   nessun motivo per cui debba dipendere da internet — e il salotto è spesso
   il punto peggiore del Wi-Fi di casa. */

const CACHE = 'topino-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './mouse-ble.js',
  './hunt.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // se un singolo file manca non voglio che l'installazione fallisca in blocco
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Rete per prima, cache come rete di scorta: così un aggiornamento pubblicato
   si vede subito, ma offline l'app parte lo stesso. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
