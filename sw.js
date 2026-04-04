// sw.js — GYM Braulio Service Worker
// Estrategia: cache-first. La app ya funciona 100% offline;
// el SW existe para que iOS/Android reconozcan la PWA como instalable.

const CACHE_NAME = 'gym-braulio-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// --- INSTALL: pre-cachear los assets principales ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // Activar inmediatamente sin esperar a que cierren las pestañas anteriores
  self.skipWaiting();
});

// --- ACTIVATE: limpiar caches de versiones anteriores ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  // Tomar control de clientes ya abiertos
  self.clients.claim();
});

// --- FETCH: cache-first, luego red ---
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Solo interceptar requests del mismo origen (no hay URLs externas en la app,
  // pero por seguridad ignoramos cross-origin)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // No está en cache → fetch de red y cachear la respuesta
      return fetch(event.request).then(response => {
        // Solo cachear respuestas válidas
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});
