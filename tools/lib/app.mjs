// tools/lib/app.mjs — cargador compartido de la app GYM Braulio para los scripts de verificación.
//
// Corre los <script> inline de index.html dentro de un contexto de Node (vm) con un DOM de mentira,
// para poder consultar los datos (EX_CATALOG, DAYS, …) y el motor de peso sin navegador.
// Solo lectura: no escribe archivos ni usa red. Sin dependencias (Node 18+).

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Raíz del repo = dos carpetas arriba de este archivo (tools/lib/ → raíz).
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─── git ─────────────────────────────────────────────────────────────────────

// Corre git en la raíz del repo, siempre con --no-optional-locks (no toca el índice).
// Devuelve stdout como texto, o null si git no está o el comando falla.
export function git(args) {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], {
      cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

// ¿Hay git y estamos dentro de un repo?
export function hayGit() {
  const r = git(['rev-parse', '--is-inside-work-tree']);
  return r !== null && r.trim() === 'true';
}

// Lee un archivo del repo: del disco, o de un commit con `git show <ref>:<archivo>` si se pasa ref.
// Devuelve el texto, o null si no existe.
export function leerArchivo(nombre, ref = null) {
  if (ref) return git(['show', `${ref}:${nombre}`]);
  try {
    return fs.readFileSync(path.join(RAIZ, nombre), 'utf8');
  } catch {
    return null;
  }
}

// Lee el valor de `--ref <commit>` (o `--ref=<commit>`) de los argumentos. null si no viene.
// `--ref` sin commit termina el script con error (si no, revisaría el disco sin avisar).
export function argRef(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    let v;
    if (argv[i] === '--ref') v = argv[i + 1];
    else if (argv[i].startsWith('--ref=')) v = argv[i].slice(6);
    else continue;
    if (!v || v.startsWith('--')) {
      console.log('❌ falta el commit después de --ref (ej.: --ref HEAD)');
      console.log('\nRESULTADO: FALLA (1 errores)');
      process.exit(1);
    }
    return v;
  }
  return null;
}

// ─── scripts inline ──────────────────────────────────────────────────────────

// Extrae los <script> inline (sin src) de un HTML, en orden.
// Cada item: { codigo, linea, columna, inicio } — linea/columna = dónde empieza el código en
// index.html (para que errores y pilas apunten a la línea real) · inicio = offset en el HTML.
export function extraerScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    // Solo JavaScript clásico (sin type, o type JS). JSON-LD, plantillas, etc. no se corren.
    const t = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (t && !/^(text|application)\/(java|ecma)script$/i.test(t[1])) continue;
    const inicio = m.index + m[0].indexOf('>') + 1; // primer carácter del código
    const antes = html.slice(0, inicio);
    const linea = antes.split('\n').length;
    const columna = inicio - (antes.lastIndexOf('\n') + 1);
    out.push({ codigo: m[2], linea, columna, inicio });
  }
  return out;
}

// Opciones de vm.Script para que las líneas de error sean las de index.html.
export function opcionesScript(s, nombre = 'index.html') {
  return { filename: nombre, lineOffset: s.linea - 1, columnOffset: s.columna };
}

// Línea real de un error de vm (SyntaxError o excepción) a partir de su pila. null si no se sabe.
export function lineaDeError(err, nombre = 'index.html') {
  const pila = String((err && err.stack) || '');
  const re = new RegExp(nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)');
  const m = re.exec(pila);
  return m ? Number(m[1]) : null;
}

// ─── DOM de mentira ──────────────────────────────────────────────────────────

// Stub universal: se puede leer cualquier propiedad (devuelve otro stub, cacheado), asignar,
// llamar y construir. Como texto vale '' y como número 0; iterarlo no da nada.
// (Los módulos ESM son estrictos, así que la función base no tiene `arguments`/`caller` propios
// y el Proxy no choca con invariantes.)
function crearStub() {
  const base = function () {};
  const props = new Map();
  const stub = new Proxy(base, {
    get(_t, prop) {
      if (props.has(prop)) return props.get(prop);
      if (prop === Symbol.toPrimitive) return (hint) => (hint === 'number' ? 0 : '');
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'toString' || prop === 'valueOf') return () => '';
      if (prop === 'then') return undefined; // que no parezca una promesa
      if (prop === 'length') return 0;
      if (typeof prop === 'symbol') return undefined;
      const hijo = crearStub();
      props.set(prop, hijo);
      return hijo;
    },
    set(_t, prop, valor) { props.set(prop, valor); return true; },
    apply() { return crearStub(); },
    construct() { return crearStub(); },
  });
  return stub;
}

// Storage en memoria (localStorage / sessionStorage) con la API del navegador.
class AlmacenMemoria {
  constructor(semilla = {}) {
    Object.defineProperty(this, '_m', { value: new Map(), enumerable: false });
    for (const [k, v] of Object.entries(semilla)) this._m.set(String(k), String(v));
  }
  get length() { return this._m.size; }
  key(i) { return Array.from(this._m.keys())[i] ?? null; }
  getItem(k) { k = String(k); return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) { this._m.set(String(k), String(v)); }
  removeItem(k) { this._m.delete(String(k)); }
  clear() { this._m.clear(); }
  // Copia plana para inspección desde los scripts.
  volcar() { return Object.fromEntries(this._m); }
}

class ObservadorVacio {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

function prohibida(nombre) {
  return () => { throw new Error(`la app llamó a ${nombre}() nativo (debe usar showConfirm)`); };
}

// Construye el objeto global del contexto.
function crearGlobal({ storage, logs }) {
  const consola = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    consola[nivel] = (...args) => logs.push({ nivel, texto: args.map(formatear).join(' ') });
  }
  consola.table = (datos) => logs.push({ nivel: 'log', texto: formatear(datos) });
  consola.group = consola.groupCollapsed = (...args) => logs.push({ nivel: 'log', texto: args.map(formatear).join(' ') });
  consola.groupEnd = () => {};
  consola.time = consola.timeEnd = consola.trace = consola.assert = () => {};

  const document = crearStub();
  const porId = new Map();
  document.getElementById = (id) => {
    if (!porId.has(id)) porId.set(id, crearStub());
    return porId.get(id);
  };
  document.querySelector = () => crearStub();
  document.querySelectorAll = () => [];
  document.getElementsByClassName = () => [];
  document.getElementsByTagName = () => [];
  document.createElement = () => crearStub();
  document.createElementNS = () => crearStub();
  document.createTextNode = () => crearStub();
  document.addEventListener = () => {};
  document.removeEventListener = () => {};
  document.visibilityState = 'visible';
  document.hidden = false;
  document.readyState = 'complete';

  let siguienteTimer = 1;
  const g = {
    console: consola,
    document,
    localStorage: storage,
    sessionStorage: new AlmacenMemoria(),
    navigator: { userAgent: 'node-verificar', language: 'es-MX', platform: 'node', maxTouchPoints: 0, onLine: true, standalone: false },
    location: crearStub(),
    screen: crearStub(),
    performance: { now: () => Date.now() },
    setTimeout: () => siguienteTimer++,
    setInterval: () => siguienteTimer++,
    clearTimeout: () => {},
    clearInterval: () => {},
    requestAnimationFrame: () => siguienteTimer++,
    cancelAnimationFrame: () => {},
    queueMicrotask: (fn) => Promise.resolve().then(fn),
    matchMedia: (media) => ({
      matches: false, media, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }),
    getComputedStyle: () => crearStub(),
    MutationObserver: ObservadorVacio,
    ResizeObserver: ObservadorVacio,
    IntersectionObserver: ObservadorVacio,
    alert: prohibida('alert'),
    confirm: prohibida('confirm'),
    prompt: prohibida('prompt'),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    scrollTo: () => {},
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
  };
  return g;
}

// Texto legible de lo que la app manda a consola.
function formatear(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

// ─── cargarApp ───────────────────────────────────────────────────────────────

/**
 * Carga la app en un contexto aislado.
 * @param {object} o
 * @param {string} o.html     contenido de index.html
 * @param {string} [o.perfil] perfil activo (se fija en localStorage['b5-active-profile'] antes de cargar)
 * @param {object} [o.storage] claves de localStorage sembradas antes de cargar
 * @returns {{ q: (expr: string) => any, storage: AlmacenMemoria, logs: {nivel:string, texto:string}[] }}
 * Lanza el error de la app (con su línea real en index.html) si un script truena al cargar.
 */
export function cargarApp({ html, perfil = 'braulio', storage = {} } = {}) {
  if (typeof html !== 'string') throw new Error('cargarApp: falta html');
  const almacen = new AlmacenMemoria(storage);
  almacen.setItem('b5-active-profile', perfil);
  const logs = [];
  const ctx = vm.createContext(crearGlobal({ storage: almacen, logs }));
  // window y self = el propio global del contexto (no el objeto de afuera).
  vm.runInContext('globalThis.window = globalThis; globalThis.self = globalThis;', ctx);

  for (const s of extraerScripts(html)) {
    new vm.Script(s.codigo, opcionesScript(s)).runInContext(ctx);
  }

  // q(expr): evalúa una expresión dentro del contexto. Las const/let de nivel superior se leen
  // por su nombre, igual que en la consola del navegador: q('EX_CATALOG'), q('S.dayId = 1').
  const q = (expr) => vm.runInContext(String(expr), ctx);
  return { q, storage: almacen, logs };
}
