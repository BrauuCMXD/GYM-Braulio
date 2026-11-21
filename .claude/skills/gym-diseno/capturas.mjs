#!/usr/bin/env node
// capturas.mjs — capturas de la app a tamaño iPhone (390×844, DPR 2) para la skill gym-diseno.
// Solo lee el repo: copia index.html (o el de un commit, con --ref) a una carpeta temporal,
// lo abre en Chromium desde file:// (sin service worker), siembra 3 entrenos y recorre las
// pantallas clave en tema oscuro, tema claro y letra grande.
//
// Uso, desde la raíz del repo:
//   node .claude/skills/gym-diseno/capturas.mjs              capturas del index.html de la carpeta
//   node .claude/skills/gym-diseno/capturas.mjs --ref HEAD   capturas del último commit (el "antes")
// Opciones:
//   --salida <carpeta>   dónde guardar (por defecto, una carpeta nueva en el temporal del sistema)
//   --acento rosa|morado|verde|amarillo|azul   (por defecto rosa)
//   --solo inicio,entreno,...   solo esas pantallas (los nombres están en PANTALLAS)
//
// Necesita Playwright con Chromium. Si no están, avisa y termina sin error.
// No lo instales en la PC de Braulio: dilo en el reporte y las capturas las saca el director.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('Sin Playwright: no se sacaron capturas. No lo instales; dilo en el reporte (el director las saca).');
  process.exit(0);
}

// ── Opciones ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (nombre, def) => {
  const i = args.indexOf('--' + nombre);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const REF = opt('ref', null);
const ACENTOS = { rosa: '#f43f5e', morado: '#6366f1', verde: '#22c55e', amarillo: '#f59e0b', azul: '#3b82f6' };
const ACENTO_NOMBRE = ACENTOS[opt('acento', 'rosa')] ? opt('acento', 'rosa') : 'rosa';
const ACENTO = ACENTOS[ACENTO_NOMBRE];
const SOLO = (opt('solo', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const sello = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const SALIDA = path.resolve(opt('salida',
  path.join(os.tmpdir(), 'gym-capturas-' + sello + (REF ? '-' + REF.replace(/[^\w.-]/g, '_') : ''))));

// Pantallas, en el orden en que se recorren.
const PANTALLAS = ['inicio', 'dia', 'calentamiento', 'entreno', 'descanso', 'superset',
  'edicion', 'timer', 'historial', 'config', 'calendario'];
for (const s of SOLO) {
  if (!PANTALLAS.includes(s)) { console.error(`--solo: "${s}" no existe. Pantallas: ${PANTALLAS.join(', ')}`); process.exit(1); }
}

// ── 1) Copia de la app (de la carpeta o del commit) ────────────────────────
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-site-'));
const gitEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
for (const f of ['index.html', 'sw.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png']) {
  try {
    const buf = REF
      ? execFileSync('git', ['show', `${REF}:${f}`], { env: gitEnv, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
      : fs.readFileSync(f);
    fs.writeFileSync(path.join(site, f), buf);
  } catch {
    if (f === 'index.html') {
      console.error(`No encontré index.html${REF ? ' en ' + REF : ''}. Corre esto desde la raíz del repo.`);
      process.exit(1);
    }
  }
}
const URL_APP = pathToFileURL(path.join(site, 'index.html')).href;
fs.mkdirSync(SALIDA, { recursive: true });

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// ── 2) Recorrido ───────────────────────────────────────────────────────────
// Siembra 3 entrenos pasados (Días 1-3) con pesos plausibles, igual que la auditoría 4.1.
function sembrar() {
  const ahora = Date.now();
  const base = { 1: [60, 24, 20, 30, 8, 22, 12], 2: [55, 50, 40, 45, 20, 30, 25, 12, 10, 15], 3: [140, 120, 50, 40, 70, 45, 60, 0, 0] };
  [1, 2, 3].forEach((dn, i) => {
    const d = DAYS.find(x => x.id === dn);
    if (!d) return;
    const loggedObj = {};
    d.exercises.forEach((ex, j) => {
      const r = resolveEx(ex, d);
      const w = (base[dn] || [])[j] ?? 20;
      const n = _totalSetsFor(ex);
      const av = getActiveVariant(ex);
      const ref = getResolvedRefForSlot(ex);
      loggedObj[ex.id] = Array.from({ length: n }, (_, k) => ({
        weight: w, reps: 10 - (k % 3), vol: w * (10 - (k % 3)),
        exRef: ref ? ref.ref : null, variant: av ? av.variant.id : null,
        kind: isTimeBased(r) ? 'time' : null,
      }));
    });
    const endTs = ahora - (3 - i) * 86400000 - 3600000;
    S.wkStart = endTs - 68 * 60000;
    _persistWorkoutToHistory({ dayId: dn, loggedObj, endTs });
  });
}

// Pasos: [nombre, función que se evalúa en la página]. La navegación corre siempre; --solo solo filtra capturas.
const PASOS = [
  ['inicio', () => switchTab('home')],
  ['dia', () => openDay(4)],
  ['calentamiento', () => startWorkout()],
  ['entreno', () => { for (let i = 0; i < 30 && S.phase !== 'workout'; i++) { try { wuAdvance(); } catch (e) { break; } } }],
  ['descanso', () => {
    const w = document.getElementById('st-w-0');
    if (w) { w.value = '40'; w.dispatchEvent(new Event('input', { bubbles: true })); }
    const r = document.getElementById('st-r-0');
    if (r) r.value = '10';
    toggleSet(0);
  }],
  ['superset', () => {
    const d = day();
    const idx = d.exercises.findIndex(e => e.id === '4-4');
    if (idx >= 0) { S.exIdx = idx; renderWorkout(); }
    const ss = document.querySelector('#screen-workout .ss');
    if (ss) ss.scrollTop = 0;
  }],
  ['edicion', () => { S.exIdx = 0; renderWorkout(); openExerciseEditSheetForWorkout(); }],
  ['timer', () => {
    try { closeExerciseEditSheet(); } catch (e) { }
    clearSession();
    openDay(5);
    startWorkout();
    for (let i = 0; i < 30 && S.phase !== 'workout'; i++) { try { wuAdvance(); } catch (e) { break; } }
    const d = day();
    const idx = d.exercises.findIndex(e => e.id === '5-9');
    if (idx >= 0) { S.exIdx = idx; renderWorkout(); }
  }],
  ['historial', () => switchTab('history')],
  ['config', () => switchTab('config')],
  ['calendario', () => switchTab('calendar')],
];

// Mide lo tocable visible: devuelve lo que mide menos de 44 px de lado.
function medirToque() {
  const els = [...document.querySelectorAll('button, [onclick], input, select, textarea, summary, label.cfg-toggle')];
  const vistos = new Set();
  return els.map(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight)) return null;
    const t = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.id || el.className || el.tagName)
      .toString().trim().replace(/\s+/g, ' ').slice(0, 40);
    return { t, w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(x => {
    if (!x || Math.min(x.w, x.h) >= 44) return false;
    const k = x.t + x.w + x.h;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

async function recorrido(browser, { carpeta, tema, letra, pantallas, medir }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA,
    timezoneId: 'America/Mexico_City', locale: 'es-MX',
  });
  // Fecha fija (un viernes): los entrenos sembrados caen en la misma semana y las capturas
  // salen iguales en cada corrida, así el antes y el después se comparan sin ruido.
  if (ctx.clock && ctx.clock.setFixedTime) await ctx.clock.setFixedTime(new Date('2026-11-20T10:00:00-06:00'));
  await ctx.addInitScript(([t, a, l]) => {
    try { localStorage.setItem('b5-theme', t); localStorage.setItem('b5-accent', a); localStorage.setItem('b5-font-size', l); } catch (e) { }
  }, [tema, ACENTO, letra]);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('console.error: ' + m.text()); });

  await page.goto(URL_APP);
  await page.waitForTimeout(800);
  // A veces Chromium pierde lo guardado justo antes de recargar: si falta, se siembra y se recarga otra vez.
  for (let intento = 0; intento < 3; intento++) {
    await page.evaluate(sembrar);
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForTimeout(900);
    if (await page.evaluate(() => history.length) >= 3) break;
  }

  const dir = path.join(SALIDA, carpeta);
  fs.mkdirSync(dir, { recursive: true });
  const hechas = [];
  const toque = {};
  let n = 0;
  for (const [nombre, fn] of PASOS) {
    n++;
    try { await page.evaluate(fn); } catch (e) { errores.push(`paso ${nombre}: ${e.message.split('\n')[0]}`); }
    if (!pantallas.includes(nombre) || (SOLO.length && !SOLO.includes(nombre))) continue;
    await page.waitForTimeout(400);
    const archivo = path.join(dir, `${String(n).padStart(2, '0')}-${nombre}.png`);
    await page.screenshot({ path: archivo });
    hechas.push(archivo);
    if (medir) toque[nombre] = await page.evaluate(medirToque);
  }
  await ctx.close();
  return { carpeta, hechas, errores, toque };
}

// ── 3) Correr y resumir ────────────────────────────────────────────────────
const browser = await chromium.launch();
const resultados = [];
try {
  resultados.push(await recorrido(browser, { carpeta: 'oscuro', tema: 'dark', letra: 'normal', pantallas: PANTALLAS, medir: true }));
  resultados.push(await recorrido(browser, { carpeta: 'claro', tema: 'light', letra: 'normal', pantallas: PANTALLAS, medir: false }));
  resultados.push(await recorrido(browser, { carpeta: 'letra-grande', tema: 'dark', letra: 'large', pantallas: ['inicio', 'entreno', 'descanso', 'timer'], medir: false }));
} finally {
  await browser.close();
}

const lineas = [
  `# Capturas de GYM Braulio`,
  ``,
  `- Origen: ${REF ? 'commit ' + REF : 'index.html de la carpeta'} · acento ${ACENTO_NOMBRE} · 390×844, DPR 2`,
  `- Fecha: ${new Date().toISOString()}`,
  ``,
];
let totalErr = 0;
for (const r of resultados) {
  lineas.push(`## ${r.carpeta}: ${r.hechas.length} capturas`);
  if (r.errores.length) { totalErr += r.errores.length; lineas.push('Errores:', ...r.errores.map(e => '- ' + e)); }
  for (const [pantalla, lista] of Object.entries(r.toque)) {
    if (!lista.length) continue;
    lineas.push(`- ${pantalla}: ${lista.length} tocables con un lado < 44 px`);
    lista.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h))
      .forEach(x => lineas.push(`  - ${x.w}×${x.h} ${x.t}`));
  }
  lineas.push('');
}
fs.writeFileSync(path.join(SALIDA, 'resumen.md'), lineas.join('\n'));
const totalCap = resultados.reduce((a, r) => a + r.hechas.length, 0);
const chicos = Object.values(resultados[0].toque).reduce((a, l) => a + l.length, 0);
console.log(`Capturas: ${totalCap} en ${SALIDA}`);
console.log(`Tocables < 44 px (tema oscuro): ${chicos} · errores de consola: ${totalErr} · detalle en resumen.md`);
