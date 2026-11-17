// Service worker: guarda la app en el celular para que abra sin señal.
// Cada vez que se publica un cambio hay que subir VERSION, así los celulares bajan lo nuevo.
const VERSION = 'v9';
const CACHE = 'rio2027-' + VERSION;
// Partes del mapa (teselas) ya vistas: quedan para usar sin señal. Se guarda aparte para no perderlas al actualizar.
const CACHE_MAPA = 'rio2027-mapa';
const MAX_TESELAS = 3000;

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/leaflet.css',
  './fonts/dmsans.woff2',
  './fonts/bricolage-800.woff2',
  './iconos/icono.svg',
  './iconos/icono-180.png',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/cuentas.js',
  './js/lugares.js',
  './js/db.js',
  './js/palabras.js',
  './js/sesion.js',
  './js/sync.js',
  './js/ui.js',
  './js/util.js',
  './js/pantallas/ajustes.js',
  './js/pantallas/entrada.js',
  './js/pantallas/fotos.js',
  './js/pantallas/gastos.js',
  './js/pantallas/ideas.js',
  './js/pantallas/inicio.js',
  './js/pantallas/itinerario.js',
  './js/pantallas/llevar.js',
  './js/pantallas/mapa.js',
  './js/pantallas/reservas.js',
  './js/vendor/dexie.mjs',
  './js/vendor/leaflet.js',
  './js/vendor/preact-htm.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE && k !== CACHE_MAPA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(tesela(req));
    return;
  }
  // Las llamadas a Apps Script y las búsquedas de lugares (otros dominios) van siempre a la red.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Cualquier página (también la del share_target, con ?url=...) abre la app guardada.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});

/** Tesela del mapa: la guardada si ya se vio; si no, de internet (y se guarda). */
async function tesela(req) {
  const cache = await caches.open(CACHE_MAPA);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const r = await fetch(req);
  if (r.ok) {
    await cache.put(req, r.clone());
    recortar(cache);
  }
  return r;
}

let recortando = false;
/** Si hay demasiadas teselas, borra las más viejas. */
async function recortar(cache) {
  if (recortando) return;
  recortando = true;
  try {
    const claves = await cache.keys();
    if (claves.length > MAX_TESELAS) await Promise.all(claves.slice(0, claves.length - MAX_TESELAS + 300).map((k) => cache.delete(k)));
  } finally {
    recortando = false;
  }
}
