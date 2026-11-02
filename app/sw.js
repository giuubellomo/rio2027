// Service worker: guarda la app en el celular para que abra sin señal.
// Cada vez que se publica un cambio hay que subir VERSION, así los celulares bajan lo nuevo.
const VERSION = 'v1';
const CACHE = 'rio2027-' + VERSION;

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/dmsans.woff2',
  './fonts/bricolage-800.woff2',
  './iconos/icono.svg',
  './iconos/icono-180.png',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/db.js',
  './js/sesion.js',
  './js/sync.js',
  './js/ui.js',
  './js/util.js',
  './js/pantallas/ajustes.js',
  './js/pantallas/entrada.js',
  './js/pantallas/inicio.js',
  './js/pantallas/pronto.js',
  './js/vendor/dexie.mjs',
  './js/vendor/preact-htm.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Las llamadas a Apps Script (otro dominio) van siempre a la red.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Cualquier página (también la del share_target, con ?url=...) abre la app guardada.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
