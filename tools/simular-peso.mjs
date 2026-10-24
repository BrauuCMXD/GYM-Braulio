#!/usr/bin/env node
// tools/simular-peso.mjs — regresión del motor de peso de GYM Braulio (v10–v12).
//
// Uso (desde la raíz del repo):
//   node tools/simular-peso.mjs              simula con el index.html del disco
//   node tools/simular-peso.mjs --ref HEAD   simula con el de un commit (git show)
//
// Cada escenario carga la app de cero (almacenamiento limpio), siembra `history`, fija la fase
// (_pkey('user-phase')) y ABRE EL DÍA del ejercicio (S.dayId): el motor resuelve el slot con
// _slotEntryFromExId → day(); sin el día abierto no ve swaps ni variantes.
// Compara contra los valores que el director obtuvo en v13 (escenario 10: v14, escoliosis avisa en vez
// de bloquear). Si el motor cambia a propósito, actualiza aquí los esperados en el mismo cambio y
// explica por qué.
// Solo lectura, sin red, sin dependencias (Node 18+). Sale con código 1 si algo no coincide.

import { cargarApp, leerArchivo, argRef, git, hayGit } from './lib/app.mjs';

const REF = argRef();
const html = leerArchivo('index.html', REF);

// ─── salida ──────────────────────────────────────────────────────────────────

const conteo = { ok: 0, aviso: 0, error: 0 };
function ok(t) { conteo.ok++; console.log('✅ ' + t); }
function error(t) { conteo.error++; console.log('❌ ' + t); }
function titulo(t) { console.log('\n── ' + t); }
function tabla(cols, filas) {
  const ancho = cols.map((c, k) => Math.max(c.length, ...filas.map((f) => String(f[k]).length)));
  const linea = (f) => '   ' + f.map((x, k) => String(x).padEnd(ancho[k])).join('  ').trimEnd();
  console.log(linea(cols));
  filas.forEach((f) => console.log(linea(f)));
}

const num = (x) => (x === null || x === undefined ? '—' : String(+Number(x).toFixed(2)));
const rango = (s) => (!s ? 'null' : s.lo === s.hi ? num(s.lo) : `${num(s.lo)}–${num(s.hi)}`);
const cerca = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6;

// Compara un valor y deja una línea ✅/❌.
function espera(etiqueta, real, esperado, fmt = num) {
  const igual = (real === null || esperado === null || typeof esperado !== 'number')
    ? JSON.stringify(real) === JSON.stringify(esperado)
    : cerca(real, esperado);
  if (igual) ok(`${etiqueta}: ${fmt(real)}`);
  else error(`${etiqueta}: esperaba ${fmt(esperado)} y salió ${fmt(real)}`);
}
// Compara una sugerencia { lo, hi, origen } (o null) contra la esperada.
function esperaSug(etiqueta, real, esperado) {
  const txt = (s) => (s ? `${rango(s)}${s.origen ? ` (${s.origen})` : ''}` : 'null');
  const igual = (!real && !esperado)
    || (real && esperado && cerca(real.lo, esperado.lo) && cerca(real.hi, esperado.hi) && (!esperado.origen || real.origen === esperado.origen));
  if (igual) ok(`${etiqueta}: ${txt(real)}`);
  else error(`${etiqueta}: esperaba ${txt(esperado)} y salió ${txt(real)}`);
}
function verdad(etiqueta, cond, detalle = '') {
  if (cond) ok(etiqueta + (detalle ? ` (${detalle})` : ''));
  else error(etiqueta + (detalle ? ` — ${detalle}` : ''));
}

// ─── ayudantes sobre la app ──────────────────────────────────────────────────

const FASES = ['acc', 'hyp', 'str', 'dl'];
let reloj = Date.UTC(2026, 9, 1, 18); // ids de sesión crecientes (la más nueva va primero en history)

// Una sesión de history con un solo ejercicio. series = [[kg, reps], ...]
function sesion(fase, slotId, ref, variant, series) {
  reloj += 2 * 86400000;
  return { id: reloj, phase: fase, exDetail: [{ slotId, name: ref, sets: series.map(([w, r]) => ({ w, r, ref, variant })) }] };
}
const tres = (kg, reps) => [[kg, reps], [kg, reps], [kg, reps]];

// App limpia con atajos. Cada escenario crea la suya. `storage` siembra localStorage antes de cargar
// (para simular una recarga: nuevaApp(perfil, otraApp.storage.volcar())).
function nuevaApp(perfil = 'braulio', storage = {}) {
  const { q, logs, storage: almacen } = cargarApp({ html, perfil, storage });
  const js = (v) => JSON.stringify(v);
  return {
    q,
    logs,
    storage: almacen,
    abrirDia: (id) => q(`S.dayId = ${Number(id)}`),
    fase: (f) => q(`localStorage.setItem(_pkey('user-phase'), ${js(f)})`),
    historial: (sesiones) => q(`history = ${js(sesiones)}`),
    registrar: (s) => q(`history.unshift(${js(s)})`),
    equipo: (slot, v) => q(`_setEquipmentForSlot(${js(slot)}, ${js(v)})`),
    // getSuggestedWeight → { lo, hi, origen } o null. `origen` = qué camino del motor la produjo.
    sug: (slot) => {
      const s = q(`getSuggestedWeight(${js(slot)})`);
      if (!s) return null;
      let origen = '1RM guardado';
      if (s._resetPending) origen = 'reinicio dl→acc';
      else if (s._phaseReanchor) origen = 're-ancla';
      else if (s._fromLogs) origen = 'doble progresión';
      else if (s._deloadComputed) origen = 'descarga del peso de ref.';
      else if (s.phase && s.phase.key === 'dl') origen = 'descarga del 1RM';
      return { lo: s.lo, hi: s.hi, origen };
    },
    prefill: (slot) => q(`_prefillKgFor(${js(slot)}, [], null, null)`),
    live: (slot) => q(`_liveE1RMFor(${js(slot)})`),
    plates: (slot) => {
      const p = q(`_plateInfoFor(_slotEntryFromExId(${js(slot)}, 'workout'))`);
      return p ? { base: p.base, label: p.label } : null;
    },
    cargable: (kg, slot) => q(`_roundLoadable(${Number(kg)}, ${js(slot)})`),
    recalc: (slot, kg, reps) => { const r = q(`_maybeRecalcOrm(${js(slot)}, ${Number(kg)}, ${Number(reps)})`); return { stored: !!(r && r.stored), est: r && r.est }; },
    pendiente: (slot) => { const p = q(`_getOrmPending()[${js(slot)}]`); return p ? p.orm : null; },
  };
}

// Corre un escenario aislado: si truena, es un ❌ y se sigue con el siguiente.
let escenarios = 0;
function escenario(nombre, fn) {
  escenarios++;
  titulo(`${escenarios}. ${nombre}`);
  try { fn(); } catch (e) { error(`el escenario tronó: ${e && e.message}`); }
}

// Fila de tabla por fase: sugerido, origen, prefill.
function filasPorFase(app, slot) {
  return FASES.map((f) => {
    app.fase(f);
    const s = app.sug(slot);
    return { f, s, pre: app.prefill(slot) };
  });
}
function imprimirFases(filas) {
  tabla(['fase', 'sugerido', 'origen', 'prefill'], filas.map(({ f, s, pre }) => [f, rango(s), s ? s.origen : '—', num(pre)]));
}

// ─── escenarios ──────────────────────────────────────────────────────────────

const t0 = Date.now();
const origenTxt = REF ? `del commit ${REF}${hayGit() ? ` (${(git(['rev-parse', '--short', REF]) || '?').trim()})` : ''}` : 'del disco';
console.log(`gym-verificar · simular-peso.mjs · motor de peso con index.html ${origenTxt}`);
if (html === null) {
  error(REF ? `no pude leer index.html de ${REF}` : 'no encontré index.html en la raíz del repo');
  console.log(`\nRESULTADO: FALLA (${conteo.error} errores)`);
  process.exit(1);
}

const BANCA = ['1-1', 'press-banca-barra', 'barra-libre'];
const fuerza60 = () => sesion('str', ...BANCA, [[60, 6], [60, 6], [60, 5]]);

escenario('Press Banca 1-1 (barra libre, barra de 20) · una sesión de Fuerza 60×6, 60×6, 60×5', () => {
  const app = nuevaApp();
  app.abrirDia(1);
  app.historial([fuerza60()]);
  const filas = filasPorFase(app, '1-1');
  imprimirFases(filas);
  espera('_liveE1RMFor(1-1)', app.live('1-1'), 72);
  const esperado = {
    acc: { lo: 47.5, hi: 50, origen: 're-ancla' },
    hyp: { lo: 55, hi: 57.5, origen: 're-ancla' },
    str: { lo: 60, hi: 60, origen: 'doble progresión' },
    dl: { lo: 35, hi: 40, origen: 'descarga del 1RM' },
  };
  for (const { f, s, pre } of filas) {
    esperaSug(`${f}: getSuggestedWeight`, s, esperado[f]);
    espera(`${f}: _prefillKgFor = lo de la sugerencia`, pre, esperado[f].lo);
  }
  const dl = filas.find((x) => x.f === 'dl').s;
  verdad('descarga sin el bug viejo (57.5 kg con 60 en Fuerza)', dl && dl.hi < 60 * 0.7, `descarga ${rango(dl)} < 70 % de 60 = 42`);
});

escenario('Mismo slot · Fuerza con 60×7 las tres series', () => {
  const app = nuevaApp();
  app.abrirDia(1);
  app.historial([sesion('str', ...BANCA, tres(60, 7))]);
  app.fase('str');
  const s = app.sug('1-1');
  tabla(['fase', 'sugerido', 'origen', 'prefill'], [['str', rango(s), s ? s.origen : '—', num(app.prefill('1-1'))]]);
  esperaSug('str: sube un paso', s, { lo: 62.5, hi: 62.5, origen: 'doble progresión' });
});

escenario('Swap puntual 1-1 → press-plano-mancuernas, sin registros del ejercicio nuevo', () => {
  const app = nuevaApp();
  app.abrirDia(1);
  app.historial([fuerza60()]);
  app.q(`S.sessionSwaps = { '1-1': 'press-plano-mancuernas' }`);
  const filas = filasPorFase(app, '1-1');
  imprimirFases(filas);
  for (const { f, s, pre } of filas) {
    esperaSug(`${f}: sin sugerencia (no hereda peso de la barra)`, s, null);
    espera(`${f}: prefill vacío`, pre, 0);
  }
  espera('_maybeRecalcOrm(1-1, 70, 5).stored (un swap no mueve el 1RM del slot)', app.recalc('1-1', 70, 5).stored, false, String);
  espera('sin 1RM pendiente', app.pendiente('1-1'), null);
});

escenario('Variante separate 1-1 → mancuernas, sin registros con ese equipo', () => {
  const app = nuevaApp();
  app.abrirDia(1);
  app.historial([fuerza60()]);
  app.equipo('1-1', 'mancuernas');
  const filas = filasPorFase(app, '1-1');
  imprimirFases(filas);
  for (const { f, s, pre } of filas) {
    esperaSug(`${f}: sin sugerencia (no hereda peso de la barra)`, s, null);
    espera(`${f}: prefill vacío`, pre, 0);
  }
  espera('_maybeRecalcOrm(1-1, 70, 5).stored (otro equipo no mueve el 1RM del slot)', app.recalc('1-1', 70, 5).stored, false, String);
  app.equipo('1-1', 'barra-libre');
  app.fase('acc');
  const s = app.sug('1-1');
  console.log(`   de vuelta a barra-libre, acc: sugerido ${rango(s)} (${s ? s.origen : '—'}) · prefill ${num(app.prefill('1-1'))}`);
  espera('de vuelta a barra-libre (acc): prefill', app.prefill('1-1'), 47.5);
});

escenario('Par de mancuernas 1-2 (press-inclinado-mancuernas) · Acumulación 30×15 las tres', () => {
  const app = nuevaApp();
  app.abrirDia(1);
  app.historial([sesion('acc', '1-2', 'press-inclinado-mancuernas', 'mancuernas', tres(30, 15))]);
  app.fase('acc');
  const s = app.sug('1-2');
  tabla(['fase', 'sugerido', 'origen', 'paso', '_roundLoadable(41)'], [['acc', rango(s), s ? s.origen : '—', num(app.q(`_progressStepFor('1-2')`)), num(app.cargable(41, '1-2'))]]);
  esperaSug('acc: sube 5 (2.5 por mano)', s, { lo: 35, hi: 35, origen: 'doble progresión' });
  espera('_progressStepFor(1-2)', app.q(`_progressStepFor('1-2')`), 5);
  espera('_roundLoadable(41, 1-2)', app.cargable(41, '1-2'), 40);
});

escenario('Máquina de discos 3-5 (rdl-plataforma, día 3)', () => {
  const app = nuevaApp();
  app.abrirDia(3);
  const p = app.plates('3-5');
  console.log(`   _plateInfoFor → ${JSON.stringify(p)} · _roundLoadable(41) → ${num(app.cargable(41, '3-5'))}`);
  espera('_plateInfoFor(3-5)', p, { base: 0, label: 'Máquina (disco c/lado)' }, JSON.stringify);
  espera('_roundLoadable(41, 3-5)', app.cargable(41, '3-5'), 40);
});

escenario('Smith configurable · b5-smith-bar-weight = 15 y variante smith en 1-1', () => {
  const app = nuevaApp();
  app.abrirDia(1);
  app.q(`localStorage.setItem('b5-smith-bar-weight', '15')`);
  app.equipo('1-1', 'smith');
  const p = app.plates('1-1');
  console.log(`   _plateInfoFor → ${JSON.stringify(p)} · _roundLoadable(41) → ${num(app.cargable(41, '1-1'))} · _roundLoadable(10) → ${num(app.cargable(10, '1-1'))}`);
  espera('_plateInfoFor(1-1)', p, { base: 15, label: 'Smith 15kg' }, JSON.stringify);
  espera('_roundLoadable(41, 1-1)', app.cargable(41, '1-1'), 40);
  espera('_roundLoadable(10, 1-1) (nunca menos que la barra)', app.cargable(10, '1-1'), 15);
});

escenario('Jimena · día 1, 1-1 = hip-thrust-barra con needs1RM · bootstrap y "deshacer" del 1RM', () => {
  const app = nuevaApp('jimena');
  app.abrirDia(1);
  const slot = app.q(`(() => { const s = _slotEntryFromExId('1-1', 'workout'); return s ? { ref: s._ref, needs1RM: !!s.needs1RM } : null; })()`);
  espera('slot 1-1 de Jimena', slot, { ref: 'hip-thrust-barra', needs1RM: true }, JSON.stringify);
  const filas = filasPorFase(app, '1-1');
  imprimirFases(filas);
  for (const { f, s } of filas) esperaSug(`${f}: sin registros → sin sugerencia`, s, null);
  app.q('S.wStart = 1761000000000; S.logged = {}');
  const r = app.recalc('1-1', 60, 5);
  console.log(`   _maybeRecalcOrm(1-1, 60, 5) → stored ${r.stored}, est ${num(r.est)} · pendiente ${num(app.pendiente('1-1'))}`);
  espera('_maybeRecalcOrm(1-1, 60, 5) → pendiente (bootstrap, Epley 60×5)', app.pendiente('1-1'), 70);
  app.q(`_undoOrmPendingFor('1-1')`);
  espera('_undoOrmPendingFor(1-1) → sin pendiente', app.pendiente('1-1'), null);
});

escenario('Ciclo de 7 semanas en lazo cerrado sobre 1-1 (acc, acc, hyp, hyp, hyp, str, dl)', () => {
  const app = nuevaApp();
  app.abrirDia(1);
  const plan = ['acc', 'acc', 'hyp', 'hyp', 'hyp', 'str', 'dl'];
  const tope = { acc: 15, hyp: 10, str: 7, dl: 15 };
  const esperado = { 2: [50, 50], 3: [57.5, 60], 4: [60, 60], 5: [62.5, 62.5], 6: [67.5, 72.5], 7: [42.5, 45] };
  const filas = [];
  const semanas = []; // { sem, f, s } para comparar después de imprimir la tabla
  let maxTrabajo = 0, liveDl = null, sugDl = null;
  plan.forEach((f, k) => {
    const sem = k + 1;
    app.fase(f);
    const s = app.sug('1-1');
    const live = app.live('1-1');
    const pre = app.prefill('1-1');
    // Semana 1: 50×12. Después: el lo sugerido con las reps al tope de la fase.
    let kg, reps;
    if (sem === 1) { kg = 50; reps = 12; } else { kg = s ? s.lo : null; reps = tope[f]; }
    filas.push([sem, f, rango(s), s ? s.origen : '—', num(pre), num(live), kg !== null ? `${num(kg)}×${reps} ×3` : '—']);
    semanas.push({ sem, f, s });
    if (f === 'dl') { liveDl = live; sugDl = s; }
    if (kg !== null) {
      app.registrar(sesion(f, ...BANCA, tres(kg, reps)));
      if (f !== 'dl') maxTrabajo = Math.max(maxTrabajo, kg);
    }
  });
  tabla(['sem', 'fase', 'sugerido', 'origen', 'prefill', '1RM vivo', 'registra'], filas);
  for (const { sem, f, s } of semanas) {
    if (sem === 1) esperaSug('sem 1 (acc, sin historial)', s, null);
    else esperaSug(`sem ${sem} (${f})`, s, { lo: esperado[sem][0], hi: esperado[sem][1] });
  }
  const sugeridos = semanas.filter(({ sem, s }) => sem > 1 && s);
  verdad('desde la semana 2 nunca sale null', sugeridos.length === plan.length - 1, `${sugeridos.length} de ${plan.length - 1}`);
  const esCargable = (x) => { const pasos = (x - 20) / 2.5; return x >= 20 && cerca(pasos, Math.round(pasos)); };
  const noCargables = sugeridos.flatMap(({ sem, s }) => [s.lo, s.hi].filter((x) => !esCargable(x)).map((x) => `sem ${sem}: ${x}`));
  verdad('todo sugerido es cargable con barra de 20 (20 + múltiplos de 2.5, nunca menos de 20)', noCargables.length === 0, noCargables.join(' · ') || 'ok');
  if (sugDl && liveDl) {
    const lo = liveDl * 0.5 - 2.5, hi = liveDl * 0.55 + 2.5;
    verdad('descarga en 50–55 % del 1RM vivo (±2.5 de redondeo)', sugDl.lo >= lo - 1e-9 && sugDl.hi <= hi + 1e-9, `${rango(sugDl)} con 1RM vivo ${num(liveDl)} → ${num(liveDl * 0.5)}–${num(liveDl * 0.55)}`);
    verdad('descarga entera por debajo del 70 % del peso de trabajo más alto', sugDl.hi < maxTrabajo * 0.7, `${rango(sugDl)} < 70 % de ${num(maxTrabajo)} = ${num(maxTrabajo * 0.7)}`);
  } else {
    error('no hubo sugerencia de descarga en la semana 7');
  }
});

escenario('Escoliosis: avisar, no bloquear (v14) · perfil Braulio, conditions [scoliosis]', () => {
  // Hasta v13 lo riesgoso (unsafeFor ∩ conditions) se ocultaba: 3-5 mostraba solo plataforma (blocked 4,
  // noVariants true) y 0 destinos de swap (blocked 4). Desde v14 todo se lista con `risky` y blocked = 0.
  const variantesDe = (app, slot) => app.q(`(() => { const r = getAvailableVariantsForSlot(_slotEntryFromExId(${JSON.stringify(slot)}, 'workout'));
    return { ids: r.variants.map(v => v.id), risky: r.risky || [], blocked: r.blocked, noVariants: r.noVariants, active: r.active ? r.active.id : null }; })()`);
  const swapsDe = (app, slot) => app.q(`(() => { const r = getAvailableSwapsForSlot(_slotEntryFromExId(${JSON.stringify(slot)}, 'workout'), day());
    return { refs: r.available.map(x => x.ref), risky: r.available.filter(x => x.risky).map(x => x.ref), blocked: r.blocked }; })()`);
  const activa = (app, slot) => app.q(`(() => { const a = getActiveVariant(_slotEntryFromExId(${JSON.stringify(slot)}, 'workout')); return a ? { id: a.variant.id, source: a.source } : null; })()`);

  // a. Variantes de 3-5 (RDL plataforma, día 3).
  const app = nuevaApp();
  app.abrirDia(3);
  const v35 = variantesDe(app, '3-5');
  console.log(`   3-5 variantes: ${v35.ids.join(', ')} · riesgosas: ${v35.risky.join(', ')} · activa ${v35.active}`);
  espera('3-5: las 5 variantes', v35.ids, ['plataforma', 'barra', 'smith', 'mancuernas', 'trap-bar'], JSON.stringify);
  espera('3-5: risky', v35.risky, ['barra', 'smith', 'mancuernas', 'trap-bar'], JSON.stringify);
  espera('3-5: blocked', v35.blocked, 0);
  espera('3-5: noVariants', v35.noVariants, false, String);
  espera('3-5: activa sin elección (la segura)', v35.active, 'plataforma', String);

  // b. Swaps de 3-5: los 4 destinos, todos riesgosos.
  const s35 = swapsDe(app, '3-5');
  console.log(`   3-5 swaps: ${s35.refs.join(', ')} · riesgosos: ${s35.risky.length}`);
  espera('3-5: destinos de swap', s35.refs, ['rdl-mancuernas', 'rdl-smith', 'trap-bar-deadlift', 'good-morning-barra'], JSON.stringify);
  espera('3-5: los 4 destinos con risky:true', s35.risky, s35.refs, JSON.stringify);
  espera('3-5: swaps blocked', s35.blocked, 0);

  // c. Elegir mancuernas (riesgosa): se aplica, se respeta y es un equipo sin registros.
  app.historial([sesion('str', '3-5', 'rdl-plataforma', 'plataforma', [[80, 8], [80, 8], [80, 7]])]);
  app.fase('str');
  verdad('control: con plataforma y su historial sí hay sugerencia', app.sug('3-5') !== null, rango(app.sug('3-5')));
  const r = app.q(`(() => { const x = applyVariantSwitch('3-5', 'mancuernas'); return { ok: x.ok, risky: x.risky }; })()`);
  espera(`applyVariantSwitch('3-5', 'mancuernas')`, r, { ok: true, risky: true }, JSON.stringify);
  espera('getActiveVariant(3-5) tras elegirla', activa(app, '3-5'), { id: 'mancuernas', source: 'user' }, JSON.stringify);
  const filas = filasPorFase(app, '3-5');
  imprimirFases(filas);
  for (const { f, s, pre } of filas) {
    esperaSug(`${f}: mancuernas sin registros → sin sugerencia`, s, null);
    espera(`${f}: prefill vacío`, pre, 0);
  }

  // d. Recorrido de los 6 días (app limpia, sin elecciones): blocked 0 y risky exacto.
  const recorrido = (perfil, espVar, espSwap) => {
    const a = nuevaApp(perfil);
    const malos = [];
    let slots = 0;
    for (const dia of a.q('DAYS.map(d => d.id)')) {
      a.abrirDia(dia);
      for (const id of a.q('day().exercises.map(s => s.id)')) {
        slots++;
        const v = variantesDe(a, id);
        const s = swapsDe(a, id);
        if (v.blocked !== 0) malos.push(`${id} variantes blocked ${v.blocked}`);
        if (s.blocked !== 0) malos.push(`${id} swaps blocked ${s.blocked}`);
        if (v.risky.length !== (espVar[id] || 0)) malos.push(`${id} variantes risky ${v.risky.length} (esperaba ${espVar[id] || 0})`);
        if (s.risky.length !== (espSwap[id] || 0)) malos.push(`${id} swaps risky ${s.risky.length} (esperaba ${espSwap[id] || 0})`);
      }
    }
    return { slots, malos };
  };
  const espVar = { '1-4': 2, '4-1': 2, '3-5': 4, '6-2': 4, '6-3': 2 };
  const espSwap = { '1-4': 1, '4-1': 1, '3-1': 1, '3-7': 1, '6-6': 1, '3-5': 4, '6-2': 4 };
  const rb = recorrido('braulio', espVar, espSwap);
  verdad(`Braulio, 6 días: blocked 0 y risky exacto en los ${rb.slots} slots`, rb.malos.length === 0,
    rb.malos.join(' · ') || 'variantes 1-4/4-1 → 2, 3-5/6-2 → 4, 6-3 → 2 · swaps 1-4/4-1/3-1/3-7/6-6 → 1, 3-5/6-2 → 4');

  // e. Limpieza única: una elección riesgosa vieja (de v13) se borra una vez; la de v14 se respeta.
  const vieja = nuevaApp('braulio', { 'b5-braulio-equipment': JSON.stringify({ '1-4': 'smith-vertical' }) });
  vieja.abrirDia(1);
  espera('limpieza: 1-4 con smith-vertical guardada de antes → activa', activa(vieja, '1-4'), { id: 'maquina', source: 'default' }, JSON.stringify);
  espera('limpieza: la entrada de 1-4 se borró', JSON.parse(vieja.storage.getItem('b5-braulio-equipment') || '{}')['1-4'] ?? null, null, String);
  espera('limpieza: marca b5-braulio-risky-cleanup-v14', vieja.storage.getItem('b5-braulio-risky-cleanup-v14'), '1', String);
  vieja.q(`applyVariantSwitch('1-4', 'smith-vertical')`);
  const recargada = nuevaApp('braulio', vieja.storage.volcar());
  recargada.abrirDia(1);
  espera('elegida en v14 y recargada → se respeta', activa(recargada, '1-4'), { id: 'smith-vertical', source: 'user' }, JSON.stringify);

  // f. Jimena (conditions []) no cambia: nada riesgoso ni bloqueado en sus 6 días.
  const rj = recorrido('jimena', {}, {});
  verdad(`Jimena, 6 días: ningún risky ni blocked en los ${rj.slots} slots`, rj.malos.length === 0, rj.malos.join(' · ') || 'ok');
});

// ─── resultado ───────────────────────────────────────────────────────────────

const total = conteo.ok + conteo.error;
const seg = ((Date.now() - t0) / 1000).toFixed(1);
if (conteo.error === 0) {
  console.log(`\nPara el resumen: simular-peso OK (${escenarios} escenarios)  [${seg} s]`);
  console.log(`RESULTADO: OK (${total} chequeos, ${conteo.aviso} avisos)`);
} else {
  console.log(`\n[${seg} s]`);
  console.log(`RESULTADO: FALLA (${conteo.error} errores)`);
  process.exit(1);
}
