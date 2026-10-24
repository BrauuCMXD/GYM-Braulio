#!/usr/bin/env node
// tools/verificar.mjs — chequeos de la app GYM Braulio antes de entregar un cambio.
//
// Uso (desde la raíz del repo):
//   node tools/verificar.mjs              revisa index.html y sw.js del disco
//   node tools/verificar.mjs --ref HEAD   revisa los de un commit (git show), sin tocar tus archivos
//
// Revisa: sintaxis · que la app cargue sin console.error · versión (APP_BUILD = CACHE_NAME) ·
// catálogo y rutinas · reglas del código · métricas para el Resumen para el director.
// Solo lectura, sin red, sin dependencias (Node 18+). Sale con código 1 si hay errores.

import vm from 'node:vm';
import {
  cargarApp, extraerScripts, opcionesScript, lineaDeError, leerArchivo, argRef, git, hayGit,
} from './lib/app.mjs';

const REF = argRef();
const ARCHIVOS_APP = ['index.html', 'sw.js', 'manifest.json'];

// Condiciones de salud que el código conoce (unsafeFor de las variantes y conditions de los perfiles).
// Si se agrega una de verdad, súmala aquí en el mismo cambio.
const CONDICIONES_CONOCIDAS = ['scoliosis'];

// Exclusiones permanentes del coach para COMPOUND_NAMES_EN (CLAUDE.md, «Identificación de compuestos»).
// Se comparan contra el nameEn real del catálogo; la doc usa nombres cortos y el código los largos
// (p. ej. "Machine Triceps Press (Seated Dip)", "Barbell Glute Bridge", "Dumbbell High Step-Up").
const EXCLUSIONES_COMPUESTO = [
  ['Arnold Press', /arnold press/i],
  ['Machine Triceps Press', /machine triceps press/i],
  ['Barbell Good Morning', /good morning/i],
  ['Puente de Glúteo Cargado', /glute bridge/i],
  ['Step-up', /step-?up/i],
  ['Zancada Caminando / Hacia Atrás', /lunge/i],
];

// ─── salida ──────────────────────────────────────────────────────────────────

const conteo = { ok: 0, aviso: 0, error: 0 };
function ok(t) { conteo.ok++; console.log('✅ ' + t); }
function aviso(t) { conteo.aviso++; console.log('⚠️  ' + t); }
function error(t) { conteo.error++; console.log('❌ ' + t); }
function seccion(t) { console.log('\n── ' + t); }
// Un chequeo con lista de problemas: ✅ si está vacía, ❌ con los primeros si no.
function chequeo(problemas, textoOk, textoError) {
  if (problemas.length === 0) ok(textoOk);
  else error(`${textoError}: ${muestra(problemas)}`);
}
function muestra(lista, max = 6) {
  const extra = lista.length > max ? ` (+${lista.length - max} más)` : '';
  return lista.slice(0, max).join(' · ') + extra;
}
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ─── lector de JS: separa comentarios y cadenas ──────────────────────────────

// Palabras tras las cuales un "/" abre una regex (no es división).
const PALABRAS_ANTES_DE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);
const PUNTUACION_ANTES_DE_REGEX = new Set('(,=:[!&|?{};+-*%<>~^}'.split(''));

// Devuelve dos copias del código con la MISMA longitud y los mismos saltos de línea (los offsets
// y las líneas siguen valiendo):
//   sinCom → comentarios en blanco (cadenas intactas)
//   sinCad → además, el contenido de cadenas, plantillas y regex en blanco (las expresiones ${…}
//            de las plantillas se conservan: son código)
function limpiarJs(src) {
  const sinCom = src.split('');
  const sinCad = src.split('');
  const n = src.length;
  const blanco = (arr, k) => { if (k < n && arr[k] !== '\n' && arr[k] !== '\r') arr[k] = ' '; };
  let i = 0;
  let prev = '';        // último token significativo (puntuación o palabra)
  let llaves = 0;       // profundidad de { }
  const pila = [];      // profundidad al abrir cada ${ de una plantilla

  // Texto de plantilla desde i: termina en ` (fin) o en ${ (expresión de código).
  const leerPlantilla = () => {
    while (i < n) {
      const c = src[i];
      if (c === '\\') { blanco(sinCad, i); blanco(sinCad, i + 1); i += 2; continue; }
      if (c === '`') { i++; return 'fin'; }
      if (c === '$' && src[i + 1] === '{') { pila.push(llaves); llaves++; i += 2; return 'expr'; }
      blanco(sinCad, i); i++;
    }
    return 'fin';
  };
  const trasPlantilla = (r) => { prev = r === 'expr' ? '{' : 'cadena'; };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { // comentario de línea
      while (i < n && src[i] !== '\n') { blanco(sinCom, i); blanco(sinCad, i); i++; }
      continue;
    }
    if (c === '/' && d === '*') { // comentario de bloque
      const fin = src.indexOf('*/', i + 2);
      const hasta = fin < 0 ? n : fin + 2;
      for (; i < hasta; i++) { blanco(sinCom, i); blanco(sinCad, i); }
      continue;
    }
    if (c === '"' || c === "'") { // cadena de una línea
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { blanco(sinCad, i); i++; }
        blanco(sinCad, i); i++;
      }
      i++; prev = 'cadena';
      continue;
    }
    if (c === '`') { i++; trasPlantilla(leerPlantilla()); continue; }
    if (c === '}' && pila.length && llaves - 1 === pila[pila.length - 1]) { // cierra un ${ … }
      llaves--; pila.pop(); i++; trasPlantilla(leerPlantilla());
      continue;
    }
    if (c === '{') { llaves++; prev = '{'; i++; continue; }
    if (c === '}') { llaves--; prev = '}'; i++; continue; }
    if (c === '/') {
      if (prev === '' || PUNTUACION_ANTES_DE_REGEX.has(prev) || PALABRAS_ANTES_DE_REGEX.has(prev)) {
        i++; // regex literal: hasta la / que no esté escapada ni dentro de [ ]
        let enClase = false;
        while (i < n && src[i] !== '\n') {
          const x = src[i];
          if (x === '\\') { blanco(sinCad, i); blanco(sinCad, i + 1); i += 2; continue; }
          if (x === '[') enClase = true;
          else if (x === ']') enClase = false;
          else if (x === '/' && !enClase) break;
          blanco(sinCad, i); i++;
        }
        i++;
        while (i < n && /[a-z]/i.test(src[i])) i++; // banderas
        prev = 'regex';
        continue;
      }
      prev = '/'; i++;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      prev = src.slice(i, j); i = j;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return { sinCom: sinCom.join(''), sinCad: sinCad.join('') };
}

// Línea (1-based) de un offset dentro de un texto.
function lineaEn(texto, offset) {
  let l = 1;
  for (let k = 0; k < offset; k++) if (texto.charCodeAt(k) === 10) l++;
  return l;
}

// HTML con TODOS los comentarios en blanco: <!-- --> fuera de scripts, /* */ en <style> y los de JS.
function htmlSinComentarios(html, scripts, limpios) {
  const a = html.split('');
  const blanquear = (x, y) => { for (let k = x; k < y; k++) if (a[k] !== '\n' && a[k] !== '\r') a[k] = ' '; };
  const enScript = (k) => scripts.some((s) => k >= s.inicio && k < s.inicio + s.codigo.length);
  for (const m of html.matchAll(/<!--[\s\S]*?-->/g)) if (!enScript(m.index)) blanquear(m.index, m.index + m[0].length);
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const base = m.index + m[0].indexOf('>') + 1;
    for (const c of m[1].matchAll(/\/\*[\s\S]*?\*\//g)) blanquear(base + c.index, base + c.index + c[0].length);
  }
  scripts.forEach((s, k) => { const t = limpios[k].sinCom; for (let j = 0; j < t.length; j++) a[s.inicio + j] = t[j]; });
  return a.join('');
}

// Lee del CÓDIGO FUENTE el literal de una declaración de nivel superior (`let NOMBRE = {…}`), sin
// correr la app. Hace falta para ORM_DATA: al cargar, _applyLiveOrmToCatalog le borra cualquier
// `orm`/rango, así que leerlo con q() escondería un 1RM escrito en el código.
function literalDeclarado(scripts, limpios, nombre) {
  for (let k = 0; k < scripts.length; k++) {
    const { sinCad } = limpios[k];
    const m = new RegExp(`\\b(?:let|const)\\s+${nombre}\\s*=\\s*`).exec(sinCad);
    if (!m) continue;
    const i = m.index + m[0].length;
    const abre = sinCad[i];
    if (abre !== '{' && abre !== '[') return undefined;
    const cierra = abre === '{' ? '}' : ']';
    let prof = 0;
    for (let j = i; j < sinCad.length; j++) {
      if (sinCad[j] === abre) prof++;
      else if (sinCad[j] === cierra && --prof === 0) {
        return vm.runInNewContext('(' + scripts[k].codigo.slice(i, j + 1) + ')');
      }
    }
  }
  return undefined;
}

// Versión declarada en el código (sin comentarios). null si no se encuentra.
function versionApp(sinComHtml) {
  const m = /\bAPP_BUILD\s*=\s*\{\s*version\s*:\s*['"`]([^'"`]+)['"`]/.exec(sinComHtml || '');
  return m ? m[1] : null;
}
function cacheName(sinComSw) {
  const m = /\bCACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/.exec(sinComSw || '');
  return m ? m[1] : null;
}
function contarConsoleLog(scripts, limpios) {
  let n = 0;
  scripts.forEach((_, k) => { n += (limpios[k].sinCad.match(/\bconsole\s*\.\s*log\s*\(/g) || []).length; });
  return n;
}
// Análisis estático completo de un index.html (se usa con el del disco/ref y con el de HEAD).
function analizarHtml(html) {
  const scripts = extraerScripts(html);
  const limpios = scripts.map((s) => limpiarJs(s.codigo));
  const sinCom = htmlSinComentarios(html, scripts, limpios);
  return { scripts, limpios, sinCom };
}

// ─── inicio ──────────────────────────────────────────────────────────────────

const t0 = Date.now();
const origen = REF ? `del commit ${REF}${hayGit() ? ` (${(git(['rev-parse', '--short', REF]) || '?').trim()})` : ''}` : 'del disco';
console.log(`gym-verificar · verificar.mjs · index.html y sw.js ${origen}`);

const html = leerArchivo('index.html', REF);
const sw = leerArchivo('sw.js', REF);
if (html === null) {
  error(REF ? `no pude leer index.html de ${REF} (¿existe el commit? ¿hay git?)` : 'no encontré index.html en la raíz del repo');
  console.log(`\nRESULTADO: FALLA (${conteo.error} errores)`);
  process.exit(1);
}
const A = analizarHtml(html);
const swLimpio = sw !== null ? limpiarJs(sw) : null;

// ─── a. sintaxis ─────────────────────────────────────────────────────────────

seccion('Sintaxis');
let sintaxisOk = true;
if (A.scripts.length === 0) { error('index.html no tiene <script> inline'); sintaxisOk = false; }
A.scripts.forEach((s, k) => {
  try {
    new vm.Script(s.codigo, opcionesScript(s));
  } catch (e) {
    sintaxisOk = false;
    error(`index.html, script ${k + 1}: ${e.message} (línea ${lineaDeError(e) ?? s.linea} de index.html)`);
  }
});
if (sintaxisOk) ok(`index.html: los ${A.scripts.length} <script> inline compilan`);
if (sw === null) {
  error(`no pude leer sw.js${REF ? ` de ${REF}` : ''}`);
} else {
  try {
    new vm.Script(sw, { filename: 'sw.js' });
    ok('sw.js compila');
  } catch (e) {
    error(`sw.js: ${e.message} (línea ${lineaDeError(e, 'sw.js') ?? '?'})`);
  }
}

// ─── b. carga ────────────────────────────────────────────────────────────────

seccion('Carga');
let app = null;
if (!sintaxisOk) {
  error('la app no se cargó: hay errores de sintaxis');
} else {
  const cargar = (perfil) => {
    try {
      const r = cargarApp({ html, perfil });
      const errores = r.logs.filter((l) => l.nivel === 'error');
      const warns = r.logs.filter((l) => l.nivel === 'warn');
      if (errores.length) error(`perfil ${perfil}: la app escribió console.error al cargar → ${muestra(errores.map((l) => l.texto), 3)}`);
      else ok(`perfil ${perfil}: la app carga en el DOM de mentira sin excepciones ni console.error`);
      warns.forEach((l) => aviso(`perfil ${perfil}: console.warn al cargar → ${l.texto}`));
      return r;
    } catch (e) {
      error(`perfil ${perfil}: la app truena al cargar → ${e && e.message} (línea ${lineaDeError(e) ?? '?'} de index.html)`);
      return null;
    }
  };
  app = cargar('braulio');
  if (app) {
    // El resto de los perfiles del código también tienen que arrancar.
    for (const pid of Object.keys(app.q('PROFILES_DEFAULT'))) if (pid !== 'braulio') cargar(pid);
  }
}

// ─── c. versión ──────────────────────────────────────────────────────────────

seccion('Versión');
const version = versionApp(A.sinCom);
const cache = swLimpio ? cacheName(swLimpio.sinCom) : null;
if (!version) error('no encontré APP_BUILD.version en index.html');
if (sw !== null && !cache) error('no encontré CACHE_NAME en sw.js');
if (version && cache) {
  if (!/^v\d+$/.test(version)) error(`APP_BUILD.version "${version}" no tiene la forma vN`);
  else if (cache !== `gym-braulio-${version}`) error(`APP_BUILD ${version} ≠ CACHE_NAME ${cache} (deben ir juntos: gym-braulio-${version})`);
  else ok(`APP_BUILD ${version} = CACHE_NAME ${cache}`);
}
// ¿Cambió la app sin subir la versión? Disco → contra HEAD. Con --ref X → el commit X contra su padre.
let htmlBase = null; // index.html de la base de comparación (también para el conteo de console.log)
if (!hayGit()) {
  aviso('sin git: no se comparó la versión contra el último commit');
} else {
  const base = REF ? `${REF}^` : 'HEAD';
  const existeBase = git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) !== null;
  if (!existeBase) {
    aviso(`no hay commit ${base} contra el cual comparar la versión`);
  } else {
    // Con --ref: diff entre dos commits. En disco: hash del archivo (hash-object) contra el de HEAD
    // (rev-parse HEAD:<archivo>), archivo por archivo. Ninguno de los dos toca el índice, así que no
    // deja .git/index.lock (git diff contra la carpeta sí podía, y ese candado bloquea GitHub Desktop).
    // Un archivo que no existe en HEAD cuenta como cambiado (y uno borrado del disco también).
    const cambiados = REF
      ? (git(['diff', '--name-only', base, REF, '--', ...ARCHIVOS_APP]) || '').split(/\r?\n/).filter(Boolean)
      : ARCHIVOS_APP.filter((f) => {
        const disco = git(['hash-object', '--', f]);
        const enHead = git(['rev-parse', '--verify', '--quiet', `${base}:${f}`]);
        if (disco === null) return enHead !== null;
        return enHead === null || enHead.trim() !== disco.trim();
      });
    htmlBase = leerArchivo('index.html', base);
    const versionBase = htmlBase ? versionApp(analizarHtml(htmlBase).sinCom) : null;
    const quien = REF ? `el commit ${REF} respecto a su padre` : 'respecto a HEAD';
    if (cambiados.length === 0) {
      ok(`la app (${ARCHIVOS_APP.join(', ')}) no cambió ${quien}`);
    } else if (version && versionBase && version === versionBase) {
      error(`cambiaste la app y no subiste la versión: ${cambiados.join(', ')} ${cambiados.length > 1 ? 'difieren' : 'difiere'} ${quien} y APP_BUILD sigue en ${version} (sube APP_BUILD.version y CACHE_NAME juntos)`);
    } else if (version && versionBase) {
      ok(`cambió ${cambiados.join(', ')} ${quien} y la versión subió: ${versionBase} → ${version}`);
    } else {
      aviso(`cambió ${cambiados.join(', ')} ${quien}, pero no pude leer la versión anterior`);
    }
  }
}

// ─── d. catálogo y rutinas ───────────────────────────────────────────────────

seccion('Catálogo y rutinas');
const M = {}; // métricas para el final
if (!app) {
  error('catálogo y rutinas: no se revisaron (la app no cargó)');
} else {
  const { q } = app;
  const cat = q('EX_CATALOG');
  const perfiles = q('PROFILES_DEFAULT');
  const execLabels = q('EXEC_LABELS');
  const fichas = Object.entries(cat);
  const mains = fichas.filter(([, f]) => f && f.kind === 'main');
  const SECCIONES = ['warmup', 'exercises', 'cooldown'];

  // Refs de las rutinas de todos los perfiles.
  {
    const malos = [];
    let n = 0;
    for (const [pid, p] of Object.entries(perfiles)) {
      for (const d of p.days || []) for (const sec of SECCIONES) for (const e of d[sec] || []) {
        if (!e || !e._ref) continue;
        n++;
        if (!cat[e._ref]) malos.push(`${pid} día ${d.id} ${sec}: "${e._ref}"`);
      }
    }
    chequeo(malos, `rutinas: los ${n} _ref de warmup/exercises/cooldown (${Object.keys(perfiles).length} perfiles) existen en EX_CATALOG`, '_ref que no existen en EX_CATALOG');
  }

  // swaps[] — destino existe y es un main; type y levels válidos; solo en mains.
  {
    const malos = [];
    let n = 0;
    for (const [id, f] of fichas) {
      if (!Array.isArray(f.swaps)) continue;
      if (f.kind !== 'main') malos.push(`${id}: swaps[] en una ficha ${f.kind}`);
      for (const s of f.swaps) {
        n++;
        if (!s || !cat[s.ref]) malos.push(`${id} → "${s && s.ref}" no existe`);
        else if (cat[s.ref].kind !== 'main') malos.push(`${id} → ${s.ref} no es main`);
        else if (s.ref === id) malos.push(`${id} → a sí mismo`);
        if (s && !['perm', 'pnt'].includes(s.type)) malos.push(`${id} → ${s.ref}: type "${s.type}"`);
        if (s && (!Array.isArray(s.levels) || s.levels.some((l) => !['P', 'I', 'A'].includes(l)))) malos.push(`${id} → ${s.ref}: levels ${JSON.stringify(s.levels)}`);
      }
    }
    chequeo(malos, `swaps: los ${n} destinos existen y son mains (type perm/pnt, levels P/I/A)`, 'swaps con problemas');
  }

  // variants[] — ids únicos, una default = única baseline, tracking válido, factor > 0.
  const conVariantes = fichas.filter(([, f]) => Array.isArray(f.variants) && f.variants.length);
  const todasVariantes = conVariantes.flatMap(([id, f]) => f.variants.map((v) => ({ id, v })));
  {
    const malos = [];
    for (const [id, f] of conVariantes) {
      if (f.kind !== 'main') malos.push(`${id}: variants[] en una ficha ${f.kind}`);
      const vs = f.variants;
      const ids = vs.map((v) => v && v.id);
      if (ids.some((x) => typeof x !== 'string' || !x)) malos.push(`${id}: variante sin id`);
      if (new Set(ids).size !== ids.length) malos.push(`${id}: ids repetidos`);
      const defs = vs.filter((v) => v && v.default === true);
      const bases = vs.filter((v) => v && v.tracking === 'baseline');
      if (defs.length !== 1) malos.push(`${id}: ${defs.length} default:true`);
      else if (bases.length !== 1 || bases[0] !== defs[0]) malos.push(`${id}: la default (${defs[0].id}) no es la única baseline`);
      for (const v of vs) {
        if (v && !['baseline', 'shared', 'separate'].includes(v.tracking)) malos.push(`${id}/${v.id}: tracking "${v.tracking}"`);
        if (v && !(typeof v.factor === 'number' && v.factor > 0)) malos.push(`${id}/${v.id}: factor ${v.factor}`);
      }
    }
    chequeo(malos, `variantes: ${todasVariantes.length} en ${conVariantes.length} mains — ids únicos, una default por ejercicio y es la única baseline, tracking válido`, 'variantes con problemas');
  }

  // plateCalc:true ⇒ barWeight numérico ≥ 0.
  {
    const conDiscos = todasVariantes.filter(({ v }) => v.plateCalc === true);
    const malos = conDiscos.filter(({ v }) => !(typeof v.barWeight === 'number' && v.barWeight >= 0)).map(({ id, v }) => `${id}/${v.id}: barWeight ${v.barWeight}`);
    chequeo(malos, `discos: las ${conDiscos.length} variantes con plateCalc declaran barWeight numérico ≥ 0`, 'plateCalc sin barWeight válido');
  }

  // unsafeFor y conditions — solo condiciones conocidas.
  {
    const malos = [];
    const conUnsafe = todasVariantes.filter(({ v }) => v.unsafeFor !== undefined);
    for (const { id, v } of conUnsafe) {
      if (!Array.isArray(v.unsafeFor)) malos.push(`${id}/${v.id}: unsafeFor no es arreglo`);
      else v.unsafeFor.filter((c) => !CONDICIONES_CONOCIDAS.includes(c)).forEach((c) => malos.push(`${id}/${v.id}: "${c}"`));
    }
    for (const [pid, p] of Object.entries(perfiles)) {
      if (!Array.isArray(p.conditions)) malos.push(`perfil ${pid}: conditions no es arreglo`);
      else p.conditions.filter((c) => !CONDICIONES_CONOCIDAS.includes(c)).forEach((c) => malos.push(`perfil ${pid}: "${c}"`));
    }
    chequeo(malos, `unsafeFor: ${conUnsafe.length} variantes y las conditions de los perfiles usan solo condiciones conocidas (${CONDICIONES_CONOCIDAS.join(', ')})`, 'condiciones desconocidas');
    M.unsafe = conUnsafe.length;
  }

  // Mains: primaryMuscle y execLabel válido (también el execLabel propio de una variante).
  {
    const malos = mains.filter(([, f]) => typeof f.primaryMuscle !== 'string' || !f.primaryMuscle.trim()).map(([id]) => id);
    chequeo(malos, `primaryMuscle en los ${mains.length} mains`, 'mains sin primaryMuscle');
  }
  {
    const malos = mains.filter(([, f]) => !f.execLabel || !execLabels[f.execLabel]).map(([id, f]) => `${id} ("${f.execLabel}")`);
    const varConLabel = todasVariantes.filter(({ v }) => v.execLabel !== undefined);
    varConLabel.filter(({ v }) => !execLabels[v.execLabel]).forEach(({ id, v }) => malos.push(`${id}/${v.id} ("${v.execLabel}")`));
    chequeo(malos, `execLabel existente en EXEC_LABELS en los ${mains.length} mains${varConLabel.length ? ` y ${varConLabel.length} variantes` : ''}`, 'execLabel ausente o desconocido');
  }

  // Slots: ids únicos por perfil y todo ejercicio con id.
  {
    const malos = [];
    const resumen = [];
    for (const [pid, p] of Object.entries(perfiles)) {
      const vistos = new Map();
      let nEx = 0;
      for (const d of p.days || []) for (const sec of SECCIONES) (d[sec] || []).forEach((e, k) => {
        if (!e) return;
        if (sec === 'exercises') nEx++;
        if (!e.id) { if (sec === 'exercises') malos.push(`${pid} día ${d.id}: ejercicio #${k + 1} sin id`); return; }
        if (vistos.has(e.id)) malos.push(`${pid}: "${e.id}" repetido (día ${vistos.get(e.id)} y día ${d.id})`);
        else vistos.set(e.id, d.id);
      });
      resumen.push(`${pid} ${nEx} ejercicios`);
    }
    chequeo(malos, `ids de slot únicos por perfil (${resumen.join(', ')})`, 'ids de slot con problemas');
  }

  // Supersets: objeto completo, receptor en el mismo día, sin dos slots de ORM_DATA en el par.
  {
    const malos = [];
    let ss = 0, bs = 0;
    for (const [pid, p] of Object.entries(perfiles)) {
      const orm = p.ormData || {};
      for (const d of p.days || []) for (const e of d.exercises || []) {
        if (!e || e.superset === undefined) continue;
        const c = e.superset;
        const donde = `${pid} ${e.id}`;
        if (!c || typeof c !== 'object' || Array.isArray(c)) { malos.push(`${donde}: superset no es objeto (${JSON.stringify(c)})`); continue; }
        if (typeof c.with !== 'string' || !c.with) malos.push(`${donde}: falta "with"`);
        if (!(typeof c.internal === 'number' && c.internal >= 0)) malos.push(`${donde}: internal ${c.internal}`);
        if (!(typeof c.between === 'number' && c.between >= 0)) malos.push(`${donde}: between ${c.between}`);
        if (c.type === 'superset') ss++; else if (c.type === 'biserie') bs++; else malos.push(`${donde}: type "${c.type}"`);
        if (c.with === e.id) malos.push(`${donde}: se parea consigo mismo`);
        else if (!(d.exercises || []).some((x) => x && x.id === c.with)) malos.push(`${donde}: el receptor ${c.with} no está en el día ${d.id}`);
        if (orm[e.id] && orm[c.with]) malos.push(`${donde}↔${c.with}: los dos están en ORM_DATA`);
      }
    }
    chequeo(malos, `supersets: ${ss + bs} pares (${ss} SS + ${bs} BS) con {with, internal, between, type} y el receptor en el mismo día`, 'supersets con problemas');
    M.ss = ss; M.bs = bs;
  }

  // EX_SIBLINGS: simétrico y con slots que existen en el perfil.
  {
    const malos = [];
    let pares = 0;
    for (const [pid, p] of Object.entries(perfiles)) {
      const sib = p.exSiblings || {};
      const slots = new Set((p.days || []).flatMap((d) => (d.exercises || []).map((e) => e && e.id)));
      for (const [a, b] of Object.entries(sib)) {
        if (a < b) pares++;
        if (!slots.has(a)) malos.push(`${pid}: ${a} no es un slot`);
        if (!slots.has(b)) malos.push(`${pid}: ${a}→${b}, ${b} no es un slot`);
        if (a === b) malos.push(`${pid}: ${a} hermano de sí mismo`);
        else if (sib[b] !== a) malos.push(`${pid}: ${a}→${b} sin ${b}→${a}`);
      }
    }
    chequeo(malos, `EX_SIBLINGS: ${pares} pares simétricos con slots existentes`, 'EX_SIBLINGS con problemas');
  }

  // ORM_DATA: solo metadata (desde v12 no hay 1RM en el código). Se lee del código fuente.
  {
    const malos = [];
    const literal = literalDeclarado(A.scripts, A.limpios, 'ORM_DATA');
    const esOrmData = (pid) => q(`PROFILES_DEFAULT[${JSON.stringify(pid)}].ormData === ORM_DATA`);
    if (!literal || typeof literal !== 'object') malos.push('no encontré la declaración de ORM_DATA en el código');
    for (const [pid, p] of Object.entries(perfiles)) {
      const datos = esOrmData(pid) ? literal : p.ormData;
      if (!datos || typeof datos !== 'object') continue;
      const slots = new Set((p.days || []).flatMap((d) => (d.exercises || []).map((e) => e && e.id)));
      for (const [k, v] of Object.entries(datos)) {
        if (!slots.has(k)) malos.push(`${pid}: "${k}" no es un slot del perfil`);
        const extra = Object.keys(v || {}).filter((x) => x !== 'name' && x !== 'unit');
        if (extra.length) malos.push(`${pid} ${k}: trae ${extra.join(', ')}`);
        if (!v || typeof v.name !== 'string' || !v.name || typeof v.unit !== 'string' || !v.unit) malos.push(`${pid} ${k}: falta name o unit`);
      }
    }
    M.orm = literal && typeof literal === 'object' ? Object.keys(literal).length : 0;
    chequeo(malos, `ORM_DATA: ${M.orm} entradas, todas slots de braulio y solo {name, unit} (sin 1RM en el código)`, 'ORM_DATA con problemas');
  }

  // COMPOUND_NAMES_EN: en el catálogo y sin exclusiones del coach.
  {
    const compuestos = [...q('COMPOUND_NAMES_EN')];
    const nombres = new Set(fichas.map(([, f]) => f && typeof f.nameEn === 'string' && f.nameEn.trim()).filter(Boolean));
    const huerfanos = compuestos.filter((n) => !nombres.has(String(n).trim())).map((n) => `"${n}"`);
    chequeo(huerfanos, `COMPOUND_NAMES_EN: los ${compuestos.length} nombres son nameEn del catálogo`, 'COMPOUND_NAMES_EN con nombres que no están en el catálogo');
    const prohibidos = [];
    for (const n of compuestos) for (const [doc, re] of EXCLUSIONES_COMPUESTO) if (re.test(n)) prohibidos.push(`"${n}" (${doc})`);
    chequeo(prohibidos, 'COMPOUND_NAMES_EN sin exclusiones permanentes del coach (Arnold, Press Tríceps Máquina, Good Morning, puente de glúteo, step-up, zancadas)', 'COMPOUND_NAMES_EN incluye una exclusión permanente del coach');
    M.compuestos = compuestos.length;
  }

  // Métricas.
  const porKind = {};
  fichas.forEach(([, f]) => { porKind[f.kind] = (porKind[f.kind] || 0) + 1; });
  M.fichas = fichas.length;
  M.porKind = porKind;
  M.variantes = todasVariantes.length;
  M.mainsConVariantes = conVariantes.length;
  M.conDiscos = todasVariantes.filter(({ v }) => v.plateCalc === true).length;
  M.maquinas = todasVariantes.filter(({ v }) => v.plateCalc === true && v.barWeight === 0).length;
  M.rutinas = Object.entries(perfiles).map(([pid, p]) => {
    const n = (p.days || []).map((d) => (d.exercises || []).length);
    return `${pid} ${n.reduce((a, b) => a + b, 0)} (${n.join('·')})`;
  });
}

// ─── e. reglas del código ────────────────────────────────────────────────────

seccion('Reglas del código (sin contar comentarios)');
{
  // Dónde está cada script: { nombre, texto (sin comentarios / sin cadenas), linea base }.
  const fuentes = A.scripts.map((s, k) => ({ nombre: 'index.html', linea: s.linea, ...A.limpios[k] }));
  if (swLimpio) fuentes.push({ nombre: 'sw.js', linea: 1, ...swLimpio });
  const donde = (f, off, campo) => `${f.nombre}:${f.linea - 1 + lineaEn(f[campo], off)}`;
  // Handlers inline del HTML (onclick="…") fuera de los scripts, ya sin comentarios.
  const handlers = [];
  for (const m of A.sinCom.matchAll(/\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    if (A.scripts.some((s) => m.index >= s.inicio && m.index < s.inicio + s.codigo.length)) continue;
    handlers.push({ codigo: m[2] ?? m[3] ?? '', linea: lineaEn(html, m.index) });
  }

  // var (en código: sin cadenas, así `var(--acc)` del CSS en plantillas no cuenta).
  {
    const malos = [];
    for (const f of fuentes) for (const m of f.sinCad.matchAll(/\bvar\s+[A-Za-z_$]/g)) malos.push(donde(f, m.index, 'sinCad'));
    for (const h of handlers) if (/\bvar\s+[A-Za-z_$]/.test(h.codigo)) malos.push(`index.html:${h.linea} (onclick)`);
    chequeo(malos, 'sin `var` (index.html y sw.js)', '`var` encontrado (solo let/const)');
  }
  // alert/confirm/prompt nativos (con cadenas: así se ven también los onclick armados en plantillas).
  {
    const malos = [];
    const re = /(?<![\w$.])(alert|confirm|prompt)\s*\(|\b(?:window|self|globalThis)\s*\.\s*(alert|confirm|prompt)\s*\(/g;
    for (const f of fuentes) for (const m of f.sinCom.matchAll(re)) malos.push(`${donde(f, m.index, 'sinCom')} ${m[1] || m[2]}(`);
    for (const h of handlers) for (const m of h.codigo.matchAll(re)) malos.push(`index.html:${h.linea} ${m[1] || m[2]}( (onclick)`);
    chequeo(malos, 'sin alert(/confirm(/prompt( nativos (se usa showConfirm)', 'diálogo nativo encontrado (usar showConfirm)');
  }
  // URLs externas en index.html.
  {
    const malos = [...A.sinCom.matchAll(/https?:\/\/[^\s"'`<>)]*/gi)].map((m) => `index.html:${lineaEn(html, m.index)} ${m[0].slice(0, 60)}`);
    chequeo(malos, 'sin URLs http(s):// en index.html (app offline)', 'URL externa en index.html');
  }
  // Keys literales de localStorage con prefijo b5-.
  {
    const malos = [];
    let n = 0;
    const re = /\blocalStorage\s*(?:\.\s*(?:getItem|setItem|removeItem)\s*\(\s*|\[\s*)(['"`])/g;
    for (const f of fuentes) for (const m of f.sinCom.matchAll(re)) {
      const ini = m.index + m[0].length;
      const q = m[1];
      let fin = ini;
      while (fin < f.sinCom.length && f.sinCom[fin] !== q && f.sinCom[fin] !== '\n' && !(q === '`' && f.sinCom[fin] === '$' && f.sinCom[fin + 1] === '{')) fin++;
      const key = f.sinCom.slice(ini, fin);
      n++;
      if (!key.startsWith('b5-')) malos.push(`${donde(f, m.index, 'sinCom')} "${key}"`);
    }
    chequeo(malos, `keys literales de localStorage: las ${n} empiezan con b5-`, 'key de localStorage sin prefijo b5-');
  }
  // console.log: solo se cuenta (los hay en los helpers de consola). Aviso si subió respecto a la base.
  {
    const n = contarConsoleLog(A.scripts, A.limpios);
    const nBase = htmlBase ? (() => { const B = analizarHtml(htmlBase); return contarConsoleLog(B.scripts, B.limpios); })() : null;
    if (nBase !== null && n > nBase) aviso(`console.log: ${n} (antes ${nBase}) — subió; en producción no van console.log fuera de los helpers de consola`);
    else ok(`console.log: ${n} (helpers de consola; solo se cuenta)`);
    M.consoleLog = n;
  }
}

// ─── f. métricas ─────────────────────────────────────────────────────────────

seccion('Métricas (para el Resumen para el director)');
const lineas = html.split('\n').length - (html.endsWith('\n') ? 1 : 0);
// Tamaño con CRLF, como está en disco: `git show` (--ref) entrega LF y daría ~12 KB menos.
const kb = Math.round(Buffer.byteLength(html.replace(/\r?\n/g, '\r\n'), 'utf8') / 1024);
console.log(`  • index.html: ${miles(lineas)} líneas · ${kb} KB · ${A.scripts.length} <script> inline`);
if (M.fichas !== undefined) {
  const k = M.porKind;
  console.log(`  • EX_CATALOG: ${M.fichas} fichas (${k.main || 0} main · ${k.warmup || 0} warmup · ${k.cooldown || 0} cooldown${Object.keys(k).filter((x) => !['main', 'warmup', 'cooldown'].includes(x)).map((x) => ` · ${k[x]} ${x}`).join('')})`);
  console.log(`  • variantes: ${M.variantes} en ${M.mainsConVariantes} mains, ${M.conDiscos} con discos (${M.maquinas} máquinas de discos) · ${M.unsafe} con unsafeFor`);
  console.log(`  • ${M.compuestos} compuestos · ${M.orm} entradas de ORM_DATA · ${M.ss} SS + ${M.bs} BS`);
  console.log(`  • ejercicios: ${M.rutinas.join(' / ')}`);
}
console.log(`  • APP_BUILD ${version ?? '?'} · CACHE_NAME ${cache ?? '?'} · ${M.consoleLog} console.log`);

const total = conteo.ok + conteo.aviso + conteo.error;
const seg = ((Date.now() - t0) / 1000).toFixed(1);
if (conteo.error === 0) {
  console.log(`\nPara el resumen: verificar OK (${total} chequeos, ${conteo.aviso} avisos) · ${version} · ${miles(lineas)} líneas · ${M.fichas ?? '?'} fichas · ${M.variantes ?? '?'} variantes  [${seg} s]`);
  console.log(`RESULTADO: OK (${total} chequeos, ${conteo.aviso} avisos)`);
} else {
  console.log(`\n[${seg} s]`);
  console.log(`RESULTADO: FALLA (${conteo.error} errores)`);
  process.exit(1);
}
