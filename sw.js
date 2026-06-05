// sw.js — GYM Braulio Service Worker
// Estrategia: cache-first ENDURECIDO para el app shell.
// La app funciona 100% offline; el SW garantiza que una recarga o navegación
// con red mala (gym) o red que bloquea GitHub NUNCA termine en pantalla en
// blanco si el shell ya está cacheado.
//
// Resumen Grupo 7 (// CAMBIO G7-N):
//   G7-1  fetch de red SIEMPRE envuelto en .catch() → un rechazo de red no
//         produce pantalla en blanco (la causa raíz reportada).
//   G7-2  navegación = app shell cache-first DURO: sirve ./index.html desde
//         cache sin tocar la red mientras exista versión cacheada.
//   G7-3  se elimina self.skipWaiting() y clients.claim() pasa a ser solo de
//         la primera instalación → un deploy nuevo NO reemplaza al SW activo
//         en caliente a media sesión.
//   G7-4  activación bajo demanda (postMessage 'SKIP_WAITING') para que la app
//         pueda actualizar SOLO cuando el usuario lo confirma y NO entrena.
//   G7-5  CACHE_NAME sube a v2 para que este SW reemplace al viejo en la
//         próxima carga limpia (el cache v1 se borra en 'activate').
//   G7-6  precache resiliente: el shell es el único asset REQUERIDO; el resto
//         es best-effort → un 404 (p.ej. manifest.json ausente) ya no aborta
//         el install (antes addAll() era atómico y el SW no se instalaba).
//   G7-7  el fetch handler solo intercepta GET (la Cache API solo guarda GET).

// CAMBIO G7-5: versión nueva del cache. El v1 se limpia en 'activate'.
const CACHE_NAME = 'gym-braulio-v2';

// Documento principal del app shell (GitHub Pages en subcarpeta /GYM-Braulio/,
// rutas relativas a la ubicación del SW).
const SHELL_URL = './index.html';

const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// CAMBIO G7-3: detectamos si esta es la PRIMERA instalación del SW.
// En el primer install no hay SW activo previo → self.registration.active es null.
// En una actualización, registration.active es el SW viejo que sigue controlando.
let _isFirstInstall = false;

// CAMBIO G7-4: bandera que indica que el usuario pidió actualizar explícitamente
// (vía postMessage 'SKIP_WAITING'). Solo entonces reclamamos clientes en caliente.
let _skipRequested = false;

// --- INSTALL: pre-cachear los assets principales ---
self.addEventListener('install', event => {
  // CAMBIO G7-3: marca de primera instalación (antes de pre-cachear).
  _isFirstInstall = !self.registration.active;

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // CAMBIO G7-6: el shell (index.html) es el ÚNICO asset REQUERIDO — es la
    // garantía offline. Si no se puede cachear, el install debe fallar (sin
    // shell no hay app). El resto (manifest, iconos) es best-effort: se cachea
    // individualmente y un 404/fallo NO aborta el install. Antes addAll() era
    // atómico: si manifest.json o un icono faltaban en GitHub Pages, el SW v2
    // nunca se instalaba y este fix nunca llegaba al usuario.
    await cache.add(SHELL_URL); // requerido: si falla, el install falla (correcto)
    await Promise.all(
      ASSETS
        .filter(url => url !== SHELL_URL)
        .map(url => cache.add(url).catch(() => { /* asset opcional ausente: se ignora */ }))
    );
  })());

  // CAMBIO G7-3: se ELIMINA self.skipWaiting().
  // Trade-off (a propósito): un deploy nuevo ya NO reemplaza al SW activo en
  // caliente. El SW nuevo queda en estado "waiting" y solo toma control cuando
  // la app se cierra del todo y se vuelve a abrir desde cero (o cuando el
  // usuario confirma la actualización, ver G7-4). Así nunca se cambia el shell
  // a media sesión de entreno. El usuario verá la versión nueva la próxima vez
  // que abra la app limpia, no al instante — que es justo lo que queremos.
});

// --- ACTIVATE: limpiar caches viejos + claim controlado ---
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Limpieza de caches de versiones anteriores (conserva solo CACHE_NAME).
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    );

    // CAMBIO G7-3 + G7-4: clients.claim() SOLO en la primera instalación
    // (para que el offline funcione de inmediato) o cuando el usuario pidió
    // actualizar explícitamente (G7-4). En una actualización automática NO
    // reclamamos: dejamos que el control pase en la próxima apertura limpia,
    // sin hot-swap a media sesión.
    if (_isFirstInstall || _skipRequested) {
      await self.clients.claim();
    }
  })());
});

// CAMBIO G7-4: activación bajo demanda.
// El SW nunca se auto-activa en caliente, pero la app SÍ puede pedir la
// activación explícitamente cuando el usuario lo confirma y NO está entrenando
// (el gate de hasActiveWorkout() vive en el registro del HTML). Al activarse
// por esta vía, activate() reclama los clientes → la página recibe
// controllerchange → recarga a la versión nueva.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    _skipRequested = true;
    self.skipWaiting();
  }
});

// --- FETCH: shell cache-first duro + red siempre con red de seguridad ---
self.addEventListener('fetch', event => {
  const req = event.request;

  // CAMBIO G7-7: solo interceptamos GET. La Cache API solo almacena GET;
  // interceptar POST u otros métodos no aporta y podría romper (cache.put
  // falla en no-GET). La app no hace POST hoy, pero es la red de seguridad.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Guard cross-origin: la app no usa URLs externas; cualquier request de otro
  // origen la deja pasar al navegador sin interceptar.
  if (url.origin !== self.location.origin) return;

  // CAMBIO G7-2: NAVEGACIÓN (documento) = app shell cache-first DURO.
  // Toda navegación o recarga se sirve SIEMPRE desde el ./index.html cacheado,
  // sin tocar la red mientras exista versión en cache. Así una red intermitente
  // del gym no dispara un re-fetch que pueda fallar a media sesión.
  // (Se compara contra SHELL_URL y no contra req: la URL navegada puede ser
  //  "/GYM-Braulio/" sin "index.html", que no haría match directo.)
  if (req.mode === 'navigate') {
  event.respondWith(
    fetch(req)
      .then(response => {
        const copy = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(SHELL_URL, copy);
        });

        return response;
      })
      .catch(() => caches.match(SHELL_URL))
  );
  return;
}

  // Resto de requests (manifest, iconos, etc.): cache-first con red de respaldo.
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      // No está en cache → fetch de red y cachear si la respuesta es válida.
      return fetch(req).then(response => {
        // Solo cachear respuestas válidas del mismo origen.
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, toCache));
        return response;
      }).catch(() =>
        // CAMBIO G7-1: el fetch va envuelto en .catch() para que un rechazo de
        // red no se propague como excepción. Para un asset no-crítico sin cache
        // ni red, devolvemos una respuesta controlada (503) en vez de romper.
        // El app shell sigue vivo y la app no se queda en blanco.
        new Response('', { status: 503, statusText: 'Offline' })
      );
    })
  );
});
