# CLAUDE.md — Gym Braulio PWA

> **Al día con v13** (`c867ec2`, 2026-10-21). Verificado contra el código el 2026-10-24: las cifras se midieron en el archivo, no se copiaron de resúmenes. Ante cualquier duda **gana el código**.
> **Este archivo es PÚBLICO** (repo y GitHub Pages): solo reglas técnicas. Nada personal — medidas, salud, ubicación —; eso va en `CLAUDE.local.md`, que git ignora y Claude Code carga solo en sesiones locales. Los docs del director (`estado_actual.md`, `funciones.md`, `prompts_pendientes.md`, `backlog.md`) también son privados: en una sesión en la nube no existen; trabaja con el código y con este archivo.

## Proyecto
HTML monolítico PWA (12,144 líneas, ~890 KB en v13). Vanilla JS/CSS/HTML, sin frameworks, sin backend, 100% offline.
**Deploy:** https://brauucmxd.github.io/GYM-Braulio/ | **Archivo:** `index.html`

### Infraestructura PWA (G7)
GitHub Pages en subcarpeta `/GYM-Braulio/` → rutas del SW/manifest **relativas** (`./`), nunca absolutas (`/`). `sw.js` (raíz del repo) estrategia **cache-first del app shell**: navegación sirve `./index.html` desde cache sin tocar red mientras exista; todo `fetch` de red en `.catch()` con fallback a `./index.html` cacheado (esto elimina la pantalla en blanco con red mala). Precache resiliente (shell requerido, resto best-effort). **Sin hot-swap:** sin `skipWaiting()`; el SW nuevo queda en espera y toma control en la próxima apertura limpia o vía `postMessage('SKIP_WAITING')` tras confirmación del usuario — nunca recarga si `hasActiveWorkout()`. El registro del SW + `<link rel="manifest">` viven en el HTML (bloque G7-4/G7-8). El SW usa Cache Storage (`gym-braulio-v13`), NO localStorage — no interfiere con las keys `b5-*`.

## Perfiles (multi-usuario)
La app soporta múltiples perfiles desde el HTML. Hoy hay 2: **Braulio** (default, con supersets y cardio) y **Jimena** (workout periodizado v2 — 6 días, sin supersets ni cardio). **Ninguno trae 1RM en el código desde v12:** los dos lo calculan de sus registros. Diseñado para escalar a N perfiles. **Mismo motor data-driven para ambos, distinto contenido** (directriz: "cada perfil = otro dispositivo").

### Principio: perfiles aislados
**Ningún perfil hereda datos de otro.** Cada perfil define sus días, ejercicios, warmups, cooldowns, notas, historial y 1RM de forma independiente. Si un perfil tiene un día con `exercises: []`, se queda vacío — no copia de Braulio. Las decisiones de diseño asumen que cualquier perfil puede ser el "primero" en aparecer.

### Modelo
```js
PROFILES_DEFAULT = {
  braulio: { id, name, level:'A', days: DAYS, ormData: ORM_DATA, exSiblings: EX_SIBLINGS, barbellEx: BARBELL_EX, conditions: [...] },
  jimena:  { id, name, level:'A', days: JIMENA_DAYS, ormData: {}, exSiblings: {}, barbellEx: {}, conditions: [...] }
}
```
- `DAYS`, `ORM_DATA`, `EX_SIBLINGS`, `BARBELL_EX` son `let` (no `const`; `DIET_MEALS` se eliminó en v13). Se reasignan al perfil activo en `_reloadProfileData()`. Las funciones siguen leyendo esos identificadores sin cambios.
- Overrides por perfil: `b5-profiles` (JSON `{id: data}`). Si existe override, hace merge defensivo sobre el default.
- Perfil activo: `localStorage['b5-active-profile']` (default `'braulio'`).
- `conditions[]`: condiciones de salud del perfil (valores en `PROFILES_DEFAULT`; el porqué, en `CLAUDE.local.md`). Filtran variantes y destinos de swap vía `unsafeFor[]`.

### Helpers críticos
- `getActiveProfileId()` — string id, default `'braulio'`.
- `getActiveProfile()` — objeto perfil completo (merge defensivo store + default; nunca retorna campos null/undefined).
- `_pkey(suffix)` — construye key prefijada. Ej: `_pkey('hist')` → `'b5-braulio-hist'`. **Toda key per-perfil DEBE pasar por `_pkey`.**
- `saveProfile(id, data)` — persiste override en `b5-profiles`.
- `_reloadProfileData()` — reasigna las 4 variables-fachada (`DAYS`, `ORM_DATA`, `EX_SIBLINGS`, `BARBELL_EX`) al perfil activo. `ormData` y los `tip` de los slots salen SIEMPRE del código (v12: un perfil guardado en `b5-profiles` congelaba 1RM y textos viejos). Luego `_applyLiveOrmToCatalog()` y `_markCompoundExercises(DAYS)`. Se llama en arranque y en `switchProfile`.
- `switchProfile(newId)` — confirma, cancela entreno en curso, limpia timers y `S.sessionSwaps`, reasigna datos, recarga history/pbs/ww/recs/exHistory/CYCLE_START/peso/grasa/objetivo/fase/días, vuelve al home.
- `_loadProfileSection()` — render del selector visual en Config (sección 👤 Perfil).

### Migración legacy
IIFE `_migrateLegacyKeys()` se ejecuta una vez (gate: `b5-active-profile` ausente). Renombra 12 keys legacy → `b5-braulio-*` (v13 quitó `b5-diet-meals`), setea `b5-active-profile = 'braulio'`, garantiza `level:'A'` en ambos perfiles. Se mantiene permanentemente para usuarios que carguen versiones viejas.
IIFE `_purgeDietData()` (v13) corre en CADA arranque, fuera de ese gate: borra `b5-diet-meals` y `b5-{p}-diet-meals` y quita `dietMeals`/`dietRefWeight` de `b5-profiles`. `_migrateRenamedVariants()` (v12) renombra ids de variante (`soleo-sentado`: `mancuernas` → `mancuerna`) en el equipo elegido, el historial y "Anterior"; se llama en `load()` y al cambiar de perfil. Ambas idempotentes.

### Keys per-perfil (21)
`hist · pbs · ww · recs · last · cycle-start · user-phase · user-weight · user-fat · user-goal · days-week · active-days · notes · pre-deload-ww · phase-reset-pending · phase-reset-done · archived-swaps · equipment · orm-current · orm-pending · week-overrides`

### Keys globales del dispositivo (no se prefijan)
`theme · accent · font-size · sound-on · sound-type · vibrate · unit · rest-default · wake-lock · smith-bar-weight · active-profile · profiles`

### Keys efímeras de sesión (no se prefijan)
`sess · timebased-*`

## Catálogo unificado de ejercicios `EX_CATALOG`
**Reemplaza a `WU_CD_CATALOG`.** Un solo objeto `{ "id": ficha }` con TODOS los ejercicios reutilizables (warmups, cooldowns, principales, core, isométricos). Cada entry tiene `kind: 'warmup' | 'cooldown' | 'main'` para filtrar pero comparten estructura. **Los movimientos de core/isométricos NO usan un `kind` propio** — son `kind:'main'` con `primaryMuscle:'core'` (corregido 2026-06-12; el código nunca usó `kind:'core'`/`'iso'`, pese a versiones viejas de este doc). **`primaryMuscle` lo llevan TODOS los 134 mains** (no solo los core; 14 llevan `'core'` — medido en v13); el valor `'core'` es solo el que activa el tratamiento de core, los demás llevan su grupo muscular.

```js
EX_CATALOG = {
  "press-banca-barra": {
    kind: "main",
    name: "Press Banca con Barra",
    nameEn: "Barbell Bench Press",
    img: "bench",
    muscles: "Pectoral mayor · Tríceps · Deltoides anterior",
    form: [...],
    errors: [...],
    swaps: [{ ref:"press-plano-mancuernas", match:90, type:"perm", levels:["P","I","A"] }, ...]
  },
  ...
}
```

### Reglas del catálogo
- **Sin tips ni notas en el catálogo.** Las notas son por-perfil, viven en `b5-{profileId}-notes` keyed por exId. El catálogo solo tiene fichas técnicas neutrales.
- **Compartir entre perfiles.** Cualquier perfil puede referenciar `"press-banca-barra"` desde sus `DAYS`. La ficha es la misma; las notas, historial, 1RM y progresión son del perfil.
- **Referencias en DAYS** con `{ _ref: "id-catalogo", id: "1-1", sets: 4, reps: "6-8", rest: 180 }`. El `id` corto (1-1, 2-3) sigue siendo la clave para historial/ORM/notas. El `_ref` apunta al catálogo para form/errors/muscles/img/nameEn.
- **Override puntual** posible: `{ _ref: "iso-sentadilla-pared", val: 30, sets: 2, note: "..." }` — los campos en el objeto _ref ganan sobre el catálogo.
- `resolveEx(entry, d?)` consulta `getResolvedRefForSlot` ANTES de leer `_ref` (precedencia: swap puntual > _ref > null). Si hay swap activo, mergea desde ref del swap. Aplica a warmup, cooldown y exercises. El 2º arg `d` opcional permite resolver placeholders dinámicos (`_activation:"auto"`); sin `d`, fallback estático.
- **Campo `benefits`** (solo warmups/isos): línea corta que se renderiza en `#wu-benefits`. Inline italic 12px sin caja. Si no existe, bloque oculto.
- **Campo `warmupStep`** (`'mobility' | 'activation' | 'rampup'`): clasifica el rol del paso. `rampup` recibe el mismo tratamiento UI que las activaciones (`isAct=true`).
- **Campo `swaps[]`** (solo mains): lista de sustituciones recomendadas. Cada item `{ ref, match, type:'perm'|'pnt', levels:['P'|'I'|'A'], note? }`. Ver "Sistema de swaps".

### Activación dinámica del warmup (paso 4)
El último paso del warmup se decide en runtime según el 1er ejercicio del día. En `DAYS`, el slot se declara como `{ _activation: "auto" }`. **NO es matcheo contra catálogo de isos** — es siempre una **serie ligera del patrón principal al 50%**.

- `_resolveDynamicActivation(entry, d)` construye una ficha derivada del 1er ejercicio resuelto:
  - `name: "Serie Activación " + firstEx.name`, hereda muscles/form/errors del 1er ex.
  - `val: '5'` (reps) por defecto; `'20s'` si el 1er ex es `timeAndWeight`.
  - `sets: 1`, `warmupStep: 'rampup'`, `benefits` genérico.
  - Flags: `_isDynamic`, `_dynActExId`, `_dynFirstExKind` ∈ `'weighted' | 'bodyweight' | 'timeAndWeight'`.
- **Skip con `_skipDynamic:true`** en 3 casos: día vacío, 1er ex `kind:'iso'`, 1er ex time-based puro (sin `timeAndWeight`). `renderWarmup` y `openDay` filtran/saltan estos pasos.
- `wu-note` tiene 3 ramas según `_dynFirstExKind`: weighted → "1 × 5 reps · al 50%: X kg"; bodyweight → "1 × 5 reps · peso corporal"; timeAndWeight → "1 × 20s · al 50%: X kg (suma)" (v11).
- Mecánica multiusuario automática. Datos por perfil (cada perfil define su warmup independiente).
- **Caso especial inline preservado:** "Remo Polea Muy Ligero" del Día 4 NO usa `_activation:"auto"`. Tiene rama legacy con `activationFor:"4-1"` y `activationPct:20`.

### Ejercicios sin catálogo (legacy / personalizados)
Un perfil puede tener ejercicios definidos inline sin `_ref`. `resolveEx` retorna el objeto tal cual. Permite migración gradual.

## Tipos de ejercicios — flags de render
Ortogonales (un ejercicio puede ser uno solo):

- **Normal (default):** input de peso + reps + ✓. Plate calc si aplica.
- **`isTimeBased(ex)` puro:** sin peso, solo timer. Botón "▶ Iniciar". Header SS: "Serie | Anterior | Tiempo | —". Persiste `kind:'time'`, `vol:0`. Ej: Plancha, RKC.
- **`bodyweight: true`:** flag binario de render. Span "—" en lugar de input de peso, sin plate calc. "Anterior" muestra solo reps. Persiste `weight:0`. Ej: Rueda Abdominal.
- **`timeAndWeight: true`:** híbrido peso+tiempo (Caminata Granjero). **El peso es la SUMA de las dos mancuernas** (v11; antes pedía kg por mano). `renderTimeAndWeightTable(d, e)` con 2 inputs + botón "▶ Iniciar". Flow: `startTAWHold` → `_startCountdownThen(3)` → timer → registra serie `kind:'timeAndWeight'` → `startRestInline(90s)`. Persistencia `_tbKey('wo', exId, idx)` shape extendido. `renderWorkout` deriva a TAW antes del check `isTimeBased`.
- **`sides: 2`:** Side Plank (time-based) y **Sentadilla Búlgara de Jimena (con PESO, Grupo B)**. Renderiza `sets * sides` filas alternando D/I. `_totalSetsFor(ex)` lee `sets * (sides||1)` **sin mutar `e.sets`**. Log persiste `side:'D'|'I'`. `_stNumContent(num, sideLabel)` apila número (11px) + letra (8px) en cuadrito 28×28. **La búlgara fue el 1er caso peso+sides** → `renderSetTable`/`toggleSet` cuentan series por `_totalSetsFor` (antes `e.sets` crudo). Descanso por fila (cada lado D e I).
- **`amrap: true` (Grupo E):** tipo "máximas reps". `renderSetTable` input de reps con placeholder "reps" (sin objetivo), sin peso si además `bodyweight`. `renderWorkout` meta "AMRAP"; tarjeta de fase "máximas reps (AMRAP)" sin peso (rama antes de deload). `toggleSet` persiste `kind:'amrap'`. **Excluido de `checkDoubleProgression`, `_maybeRecalcOrm` y `getSuggestedWeight` (guardas → false/null).** Ej: Lagartijas burnout (Día 5 Jimena, `5-5`).

### Historial en `showWorkoutDetail`
3 modos según `kind` persistido: `timeAndWeight` → "Xs · Y kg" (suma); weighted → "Xkg × Y" + volumen; `time` puro → "Xs". **Agrupa series por `sets[].ref`** (P3B.2): si hubo swap mid-session, muestra bloques separados con el name correcto de cada ejercicio. Logs pre-3B.1 sin `ref` por serie → 1 bloque con `ex.name` (retrocompat).

## Cuenta regresiva 3s reutilizable
- Overlay `#countdown-overlay` (fixed full-screen, z-1000).
- `_startCountdownThen(secs, onDone, accent)` + `_playCountdownTick(isFinal)`. Beep 660Hz / 1320Hz final. `_ensureAudio()` al inicio.

## Plate calc en supersets
- `renderSupersetWorkout` llama `_ssRenderPlates(eA, eB)` al final.
- Funciones: `_exNeedsPlates`, `_ssActiveExForPlates`, `_ssRenderPlates`, `_renderPlateCalcFor`, `_onSSWeightFocus`, `_onSSWeightChange`. Todas deciden discos y base con `_plateInfoFor(ex)` (variante activa del ejercicio resuelto; considera swap) — ver «Plate calc por variante».

## Banner de descanso
- Compacto ~52px, una fila: círculo SVG 44px + label/serie + `−15` `+15` `Saltar`.
- Persistencia: `S.restEndTs` absoluto.
- `renderWorkout`, `nextExercise`, `woPrev` matan el banner solo si `S.restEndTs <= Date.now()`. `endRest` setea `S.restEndTs = null`.

## Sistema de notas
Cada ejercicio (principal, warmup, cooldown) puede tener una nota personal. Privadas y por-perfil.

- Persistencia: `b5-{profileId}-notes` → `{ exId: "texto", ... }`.
- ID de la nota = id corto del slot: `"1-1"` (workout), `"wu-{dayId}-{idx}"` (warmup), `"cd-{dayId}-{idx}"` (cooldown). **El catálogo no almacena notas.** Para `_activation:"auto"` el ID es del slot, no del ejercicio derivado dinámicamente.
- UI: sheet unificado `exercise-edit-sheet` (reemplaza al antiguo `note-edit-sheet`). Headers de ejercicio tappeables con hint ✏️ opacity:0.4 en workout/warmup/cooldown y en cada miembro del par SS. Bloque amarillo con la nota encima de "Forma y errores", solo si hay nota guardada.
- Sheet contiene 3 secciones, orden tras P4.3: **Cambiar equipo** (switch) → **Nota personal** (funcional) → **Cambiar ejercicio** (swaps).
- **Sección "Nota personal" compactada (P3B.2):** textarea 60px (no 120px), sin subtítulo, sin botón "Cancelar" (la × del header cumple ese rol), botón "Guardar" pequeño no full-width.
- Borrar nota pasa por `showConfirm` (botón Borrar oculto si no hay nota guardada).
- Funciones principales: `getNotes` `saveNotes` `getNoteForExercise` `setNoteForExercise` `resolveNoteForExercise` `openExerciseEditSheet(exId, opts)` + wrappers `ForWorkout`/`ForWarmup`/`ForCooldown`. `openNoteEditorFor(exId)` alias retrocompatible (necesario para onclick inline de supersets).

## Sistema de swaps
**P3B.1 — lógica core. P3B.2 — UI completa en `exercise-edit-sheet`, badges inline en workout, toast de confirmación, lenguaje claro para usuario no técnico.** Permite sustituir un ejercicio del plan por otro con mismo estímulo. Dos modos:

- **Puntual** — solo esta sesión. Vive en `S.sessionSwaps[slotId] = ref` + `b5-sess`. Se limpia al terminar/cancelar entreno o cambiar de perfil. Sin conversión de peso (sesión arranca fresh).
- **Permanente** — modifica `_ref` del slot en los DAYS del perfil + persiste vía `saveProfile`. Archiva el `fromRef` en `b5-{profileId}-archived-swaps`. Historial viejo intacto en `hist`.
- **Peso tras un swap (v12, sin estimaciones):** ni el puntual ni el permanente heredan peso ni 1RM del ejercicio de origen. Sin registros del ejercicio nuevo, el input queda vacío y la tarjeta dice "primera vez" (badge del permanente: "🔄 nuevo · anota tu peso"). El peso se recuerda por **ejercicio + equipo**, y un swap no alimenta el 1RM guardado del slot. Antes de v12 sugería el 80 % del peso archivado.

### Resolución del slot activo
`getResolvedRefForSlot(slotEntry)` retorna `{ ref, source }` con precedencia:
1. `S.sessionSwaps[slotId]` → `source: 'puntual'`
2. `slotEntry._ref` → `'default'` o `'permanente'` (indistinguibles en DAYS porque permanente ya escribió el nuevo `_ref`; se distingue con `_getArchivedSwap(id)`)
3. `null` → slot sin catálogo (legacy inline)

`resolveEx(entry, d)` consulta `getResolvedRefForSlot` ANTES de leer `_ref`. Expone `_resolvedRef` y `_swapSource` en el objeto resuelto.

**Revert automático (P3B.2):** `applySwapPuntual` borra `S.sessionSwaps[slotId]` si el `newRef` coincide con el `_ref` original del slot (en vez de setear un swap "fantasma" indistinguible del original).

### Campo `exRef` en logs
Cada serie en `S.logged[exId]` lleva `exRef = ref del catálogo activo`. `finishWorkout` guarda `exDetail` con shape `{slotId, name, sets: [{w, r, kind, ref}]}`.

- `slotId` = id corto del slot. `ref` = `exRef` de cada serie.
- Logs pre-3B.1 sin `slotId`/`ref` retrocompat: si hay archived-swap activo, se atribuyen al `fromRef`; sino al ref actual del slot.

### Archived-swaps storage
`b5-{profileId}-archived-swaps` → `{ slotId: { fromRef, toRef, ts } }`. Solo último permanente del slot.

- `applySwapPermanente` escribe el registro; `revertSwapPermanente` lo borra y restaura `_ref` al `fromRef`.
- (v12) Ya no hay sugerencia del 80 % con archived-swap; `_lastWeightForSlotRef` quedó sin llamadas.
- `checkDoubleProgression` filtra `logged` por `exRef === currentRef` (series sin `exRef` se incluyen).
- `getSwapBadgeForSlot` lo usa para distinguir permanente "nuevo" (sin logs nuevos) vs "establecido" (no badge).

### UI activa (P3B.2)
- Sección "🔄 Cambiar ejercicio" del sheet renderizada por `renderSwapSectionInSheet(exId, ctx)` al abrir. Sub-elementos: `#ees-swap-banner` (swap activo + ↩ Deshacer), `#ees-swap-warn` (deload), `#ees-swap-ss-note` (superset), `#ees-swap-list` (items), `#ees-swap-footer` (pendientes).
- Items con lenguaje natural sin jerga: "Mismo músculo, técnica casi igual" / "técnica distinta" / "Trabaja músculos parecidos" (en vez de %match). Niveles en palabras completas ("Recomendado para Intermedios y Avanzados") cuando no aplica al nivel del usuario.
- 2 botones inline expandidos al tap: "Cambiar / solo hoy" (puntual) y "Cambiar / en mi rutina" (permanente, **oculto durante entreno activo** vía `_isDuringActiveWorkout()`). Sin modal extra.
- Badges inline `#wo-swap-badge` y `#cd-swap-badge` al lado del nombre, poblados por `renderSwapBadgeInline(slotId, where)` desde `renderWorkout`/`renderCooldown`. Oculto en SS (`renderSupersetWorkout` lo limpia explícito).
- Toast `#swap-toast` (top:60px, fixed, z:1100, 2.6s auto-fade). Variantes `success` (verde) e `info` (azul). Necesario porque en warmup/cooldown el name del main no se ve.
- Ocultaciones: sección oculta en warmup/cooldown/`_activation:"auto"`. Item bloqueado (`opacity 0.45`, sin tap) si `inAnotherSlot`.
- Estado local: `_swapExpandedRef` (ref del item expandido) se resetea al abrir el sheet, NO dentro de `renderSwapSectionInSheet` (el reset interno rompe el toggle).

### Coexistencia con reset dl→acc
Desde v12 solo existe el **phase reset** (todos los slots con peso, viene de deload, dura hasta la 1ª serie post-deload de cada uno). El swap reset (`_swapReset`, 80 %) se eliminó: un swap sin registros propios no recibe sugerencia de peso.

### Edge cases
- Slot sin `_ref` (legacy inline): `getAvailableSwapsForSlot` retorna `noCatalog: true`.
- **Filtro por `conditions` (Lote 7):** `getAvailableSwapsForSlot(slot, d)` retorna `{available, pending, blocked, noCatalog}`. `blocked` = refs-destino vetados por seguridad del perfil vía `_refIsSafeForProfile(ref)` (mismo criterio `unsafeFor ∩ conditions` que las variantes; reusa `_variantAllowedForProfile`). `blocked` NO cuenta como `pending`. **Matiz:** `_refIsSafeForProfile` da `true` para fichas SIN `variants[]` — para poder vetar un ejercicio de equipo único por `conditions` hay que crearle una variante baseline con `unsafeFor` (patrón aplicado en `rdl-mancuernas`, `meadows-row`).
- Receptor de superset: el swap aplica al slot individual; la config del SS vive en el leader (`superset:{with:...}`) que no cambia. El par se mantiene.
- Slot con `_activation:"auto"`: la UI de swap oculta la sección.
- Warmup/cooldown: no aceptan swap por ahora.
- Restore de sesión pre-3B.1: `Object.assign(S, d.state)` no trae `sessionSwaps`; default `{}` queda intacto.

### Helpers de consola
```js
_testSwap("1-1", "press-plano-mancuernas", "puntual" | "permanente")
_testRevertSwap("1-1")   // detecta tipo automáticamente
_dumpSwapState()          // tabla legible del estado
```
(El swap permanente hoy solo se accede por consola — el botón de UI se oculta en entreno activo, único punto de entrada al sheet hasta la pantalla Config futura.)

## Sistema de switch de variantes de equipo (Feature C / 1.5 — P4.1 lógica, UI en 4.2)
**Mismo ejercicio, distinto equipo** (barra/Smith/máquina/mancuernas). Reemplaza a `BARBELL_EX` (toggle Libre↔Smith), generalizándolo. P4.1 deja la mecánica validable por consola; la UI ("⚙️ Cambiar equipo" del `exercise-edit-sheet`) llega en 4.2.

### Campo `variants[]` (solo mains)
Schema por variante: `{ id, name, factor, barWeight, tracking:'baseline'|'shared'|'separate', plateCalc:bool, default?:true }`
- `factor`: multiplicador de peso respecto a baseline (×1.00). Equivalente = `pesoActual × (factorNuevo/factorViejo)`.
- `tracking`: `baseline` · `shared` (factor ≤±5%, comparte historial y 1RM) · `separate` (factor >±5%, historial propio; no alimenta el 1RM guardado del slot, que es del equipo original).
- `plateCalc`: si muestra gráfica de discos. **Desde v10 lo declara cada variante** (ya no se deriva de `barWeight > 0` ni del nombre).
- `barWeight`: base de la gráfica. `> 0` → barra/Smith (Smith: el peso configurado en Config) · `0` con `plateCalc:true` → **máquina de discos** (discos por lado, sin barra). Barras de v11: recta y Z = 10 · olímpica = 20 · trap bar = 25 (supuestos, por confirmar en el gym).
- `default:true` en exactamente una variante.
- **`form[]` / `errors[]` (opcionales, P4.4):** ficha técnica propia de la variante. Si existen, `resolveEx` los prefiere sobre la ficha base (vía `_applyVariantFicha`). Si no, la variante hereda `form`/`errors` del ejercicio. Solo afectan form/errors — `muscles`/`nameEn`/`img` siguen siendo del ejercicio. Poblados en 16 variantes de 4 mains que difieren de raíz (Press Banca, Press Inclinado ×2, Hip Thrust, Press Hombros). El resto hereda (cues casi idénticos no justifican ficha separada — regla del coach).
- **v13 (medido):** **193 variantes en 89 mains** (89 baseline · 19 shared · 85 separate). **77 con discos:** 30 máquinas de discos (`barWeight:0`) · 28 de 10 kg (Smith y barras recta/Z) · 17 de 20 kg (olímpica) · 2 trap bar de 25. 16 con `unsafeFor`. *(Corrección 2026-10-24: los docs decían 132 variantes desde junio; v9 tenía 119 en 51 mains porque las fichas de las Tandas 2A/2B no llegaron a `main` hasta v11.)*

### Storage + resolución
- **Key per-perfil:** `b5-{profileId}-equipment` → `{ slotId: variantId }`. Preferencia persistente, NO se borra al terminar entreno. `S.equipmentMode` es cache de sesión NO autoritativo.
- `getActiveVariant(slotEntry)` precedencia: `equipment[slotId]` (`source:'user'`) > variante `default:true` (`source:'default'`) > `null` (ejercicio sin variants). Storage > default; el cache de sesión NO se consulta para resolver (un cambio de perfil/restore no deja modo fantasma). Si el id guardado ya no existe en el ref activo, cae a default.
- **Coexistencia con swaps:** `getActiveVariant` opera SIEMPRE sobre el ejercicio RESUELTO (`getResolvedRefForSlot` → ref activo). Swap a ejercicio sin variants → switch no aplica (`null`). Swap a ejercicio con variants → switch opera sobre las del ejercicio swappeado.

### Conversión y tracking
- `applyVariantSwitch(slotId, newVariantId)`: persiste el modo y retorna `{ ok, suggestedWeight, tracking, fromVariant, toVariant }`. Sigue calculando `suggestedWeight` por factor, pero **desde v12 la UI no lo usa**: `onEquipmentItemClick` precarga con `_prefillKgFor` (tu historial con ese equipo) y, sin registros, dice "primera vez: anota tu peso". `shared`/`baseline` comparten historial y 1RM; `separate` lleva historial propio.
- Cada log nuevo lleva `variant` (junto a `exRef`). Logs sin `variant` (pre-4.1) se atribuyen a la **baseline**.
- Ya no hay variant reset (×0.9, eliminado en v12): ver «Motor de peso». `checkDoubleProgression` y `_recentSessionsFor` filtran por variante activa cuando es `separate` (logs sin `variant` cuentan solo si la activa es la baseline); con baseline/shared activa se excluyen las series de variantes `separate`.

### Plate calc por variante (v10 — fuente única `_plateInfoFor`)
`_plateInfoFor(ex)` → `{ base, label }` o `null` es la ÚNICA fuente de "¿lleva discos?": la variante activa del ejercicio resuelto declara `plateCalc:true` y `base = _barWeightForVariant(v)`. La usan `_exNeedsPlates` (= `!!_plateInfoFor`), `renderPlateCalc` (delega en `_renderPlateCalcFor(curEx(), kg)`), `_renderPlateCalcFor` y `_ssRenderPlates`. `_barWeightForVariant(v)`: sin variante o sin `barWeight` numérico → 20 · `barWeight <= 0` → 0 · id con `'smith'` → `_getSmithBarWeight()` (`b5-smith-bar-weight`, global, default 10, clamp 5-20, Config → Entrenamiento) · si no, su `barWeight`. Etiqueta: nombre de la variante + kg reales; base 0 → "Máquina (disco c/lado)". **La regex por nombre de "máquinas de disco" se eliminó en v10** (por ella el Peso Muerto Rumano perdió los discos — B3). `getBarWeight(exId)` sigue existiendo, pero ya nadie la llama.

### Helpers de consola
```js
_testSwitchVariant("1-1", "smith")   // aplica + reporta peso equivalente
_dumpVariantState()                   // tabla por slot del día
```

## Motor de peso — todo sale de tus registros (v10–v12)
**Regla de fondo (decisión de Braulio, v12):** el peso y el 1RM salen SOLO de las series registradas, filtradas por el **ejercicio y el equipo activos** del slot. No hay 1RM escrito en el código ni estimaciones: sin registros propios de ese ejercicio/equipo → input vacío y tarjeta "primera vez: anota tu peso y de ahí aprende". Mismo motor para Braulio y Jimena. Toda sugerencia es **cargable** con el equipo activo.

- **Lectura del historial:** `_recentSessionsFor(slotId, opts)` es la fuente única (más nueva primero; filtra el ref activo — series sin `ref` solo sin swap — y el equipo `separate`; opciones `skipDeload`, `max`, `slot`). Encima de ella: `_lastSessionSetsFor` y `_lastSessionPhaseFor` (última sesión de TRABAJO, sin descargas), `_referenceWeightFor`, `_slotHasAnyHistory`, `_postDeloadWeightFor`. `exDetail` sigue siendo array de `{slotId, name, sets:[{w,r,kind,ref,variant}]}`: buscar por `slotId` y leer `s.w` (bug G3-1).
- **1RM efectivo:** `_liveE1RMFor(slotId)` = Epley `w × (1 + min(r,15)/30)` sobre las series de las últimas 3 sesiones de trabajo; gana la mayor; sin AMRAP ni time-and-weight. **Puede bajar.** Si no hay, respaldo: el 1RM guardado (`orm-current`), solo si no hay swap ni variante `separate` activos.
- **`getSuggestedWeight(exId)`** = envoltorio de `_getSuggestedWeightRaw` que deja el número cargable (`_roundLoadable`: base de barra o máquina + múltiplos de 2.5; par de mancuernas de 5 en 5. Si viene de tus registros, solo `_barFloorFor`: nunca menos que la barra sola). Orden de `_getSuggestedWeightRaw`:
  1. AMRAP → `null`.
  2. Fase = la elegida en Config (`user-phase`) o la del ciclo.
  3. Reinicio dl→acc pendiente → 78–82 % de `_referenceWeightFor` (`_resetPending`).
  4. Descarga → 50–55 % del 1RM efectivo (`_fromLive`) o, sin 1RM, de `_referenceWeightFor` (`_deloadComputed`).
  5. Fuera de descarga solo hay sugerencia si el slot tiene entrada en `ORM_DATA` o `needs1RM`.
  6. Con 1RM en vivo: compuesto cuya última sesión de trabajo fue en otra fase con OTRO rango de reps → re-ancla al % de la fase actual (`_phaseReanchor`; con un `repsOverride` igual al de antes no re-ancla). Si no, doble progresión sobre la última sesión de trabajo (`_fromLogs`): tope → +paso · en rango → igual · abajo → −paso. Paso = `_progressStepFor` (5 con par de mancuernas, 2.5 el resto). **Sin piso** del rango del 1RM.
  7. Sin historial → rango de la fase desde el 1RM guardado; con swap/`separate` o sin 1RM → `null`.
- **Prefill del input** (`_prefillKgFor`, orden en funciones.md): series de hoy > sugerencia de fase con precedencia (`_sugOverridesPrefill`: deload, reinicio, re-ancla) > tu última sesión de trabajo > "Anterior" filtrado > `workingWeights` solo si el slot no tiene ningún registro. `getActKg` (series de activación al X %) usa ese mismo peso.
- **Tarjetas:** fase EFECTIVA (`_currentPhaseKey()`), `_kgRangeTxt` ("7.5 kg" en vez de "7.5–7.5"), sello `_liveOrmHint` ("· tu 1RM estimado ~X kg") cuando el rango sale del 1RM en vivo. "Rec. anterior" solo del mismo ejercicio, equipo y fase (`_savedRecs` guarda `ref`/`variant`).
- **El deload no escribe `S.workingWeights`** (`toggleSet`, `toggleSetSS`, time-and-weight): al salir de la descarga el peso sigue siendo el de trabajo. `checkDoubleProgression` sigue congelada en deload.
- **Tabla de Fases** (Config → fase, `openDetailSheet('fase')`): compuestos de los días del perfil activo con 1RM en vivo, uno por ejercicio.

### Periodización unificada por compuesto (Grupo A, 2026-06-08)
**La decisión de periodizar pasa de "tiene 1RM" (`ORM_DATA`) a "es compuesto" (`_isCompound`) — genérica para todos los perfiles, desacoplada del 1RM. Mismo motor Braulio/Jimena, distinto contenido.**
- `getPhaseReps(exId)`: el gate cambió de `!!ORM_DATA[exId]` a `_isCompound` del ejercicio resuelto. Compuesto → reps de la fase activa (de `PHASES`, global: acc 12-15 · hyp 8-10 · str 5-7 · dl 12-15 ligero); aislamiento → `null` (cae a `e.reps` fijo del slot).
- **`repsOverride:{acc?,hyp?,str?,dl?}`** por slot, mergeado sobre las reps de fase. Excepción del RDL de Jimena (4-1, 6-1): `repsOverride:{str:'8-10'}` para NO bajar a 5-7 (indicación del coach; el motivo, en `CLAUDE.local.md`).
- `getSuggestedWeight`: la doble progresión se evalúa con las reps de fase en compuestos (`getPhaseReps`, respeta `repsOverride`) y con `e.reps` fijo en aislamientos — igual para slots con `ORM_DATA` y con `needs1RM`.
- **Aislamientos de Braulio con entrada en `ORM_DATA`, con reps FIJAS** (no periodizan): Pushdown (1-6) `10-15` · Ext OH (1-7/4-7) `10-15` · Curl Barra (2-7) `10-15` · Curl Isquios (3-6 `10-12`, 6-4 `12-15`) · Curl Invertido (5-7) `12-20`. *Curl Predicador (2-10, `10-15`) no tiene entrada en `ORM_DATA`; este doc lo listaba por error (corrección 2026-10-24).* Sus **compuestos** quedan idénticos.

### 1RM guardado (Epley diferido, per-perfil)
Convive con el 1RM en vivo: las sugerencias usan `_liveE1RMFor`; el **guardado** es respaldo cuando el slot aún no tiene historial utilizable y es lo que muestra el aviso de nuevo ciclo. `ORM_DATA` del `<script>` es **solo metadata** (`name`, `unit`) desde v12: ya no hay semilla ni `_seedOrm` que proteger.

- **Fórmula:** Epley `peso × (1 + reps/30)` redondeado a 2.5 kg. Reglas: reps **3-7** · **solo sube** · rechaza saltos **>15 %** contra el 1RM guardado o, si no hay, contra el 1RM en vivo (anti error de dedo). Disparo tras registrar serie con peso en `toggleSet`/`toggleSetSS`; **al desmarcarla, `_undoOrmPendingFor` revierte** lo que puso esa sesión. Solo alimentan el 1RM el ejercicio y equipo ORIGINALES del slot (sin swap y sin variante `separate` no default). AMRAP excluido.
- **Quién lleva 1RM:** slots con entrada en `ORM_DATA` (Braulio, 26) o `needs1RM:true` (Jimena). Sin 1RM previo, el primer Epley válido lo establece (bootstrap: entrada creada al vuelo con `name` del catálogo, `unit:'kg'`, `_bootstrap:true`). ⏳ Validación orgánica pendiente (fase de Fuerza).
- **Storage:** `b5-{p}-orm-current` `{exId: orm}` = guardado · `b5-{p}-orm-pending` `{exId:{orm, ts, sess, prev, …}}` = detectado, aún no aplicado.
- **Rangos por fase** (acc/hyp/str/dl) se **regeneran** con `_regenRangesFromOrm(orm)` y los % de `PHASES` (acc 65-70 · hyp 75-80 · str 82-87 · dl 50-55), redondeo 2.5 kg. `_applyLiveOrmToCatalog` borra los números de `ORM_DATA` y los vuelve a poner solo desde `orm-current`.
- **Aplicación diferida:** en `startCycle`, pendientes → current con aviso `showConfirm "💪 1RM actualizados"` (sin 1RM previo sale como "nueva marca").
- **Helpers consola:** `_dumpOrmState()` · `_applyOrmsNow()` (forzar sin esperar ciclo) · `_resetOrmAuto()` (vacía current y pending: el perfil vuelve a calcular solo desde sus registros).

## Avance de ciclo por TRABAJO HECHO (G4 — cambio de fondo)
**El ciclo ya NO avanza por tiempo (antes 7 días = 1 semana de fase).** Avanza contando entrenos completados. Esto alimenta `_isDeload`, la fase activa y el peso sugerido — cualquier cambio futuro de fases debe asumir este modelo.

- `getCurrentWeek` = `floor(trabajo_hecho / días-por-semana) + 1`, **tope 7**. `trabajo_hecho` = entrenos guardados + días marcados `done` + días marcados `skip`. Un día `skip` cuenta para avanzar (no atorar) pero no suma volumen.
- `isCycleExpired` por trabajo hecho (antes 49 días).
- `nextDayId` considera overrides al calcular el siguiente día.
- **Override manual:** `b5-{p}-week-overrides` → `{ "{cycleStartISO}-{absWeek}-{dayId}": "done"|"skip" }`. Permite marcar un día sin entrenar/guardar para que el ciclo no se atore. Se limpia en `startCycle`, `resetCycle`, `resetAllData`.
- Panel "¿Qué llevo esta semana?" (pantalla calendario): fase actual, regla de conteo explícita, lista de días del split con estado hecho/saltado/pendiente.
- Home: card unificada ciclo + progreso semanal (sin stats SESIONES/VOL/PRs).

## Fase Deload + transición a Acumulación
Lógica aplica a TODOS los perfiles. La fase vive en `_pkey('user-phase')`.

### En deload (`_isDeload() === true`)
- **Peso:** 50-55 % del 1RM efectivo (`_liveE1RMFor`, o el guardado); sin 1RM, 50-55 % de `_referenceWeightFor(exId)`, que prioriza tu última sesión de trabajo con el ejercicio y equipo activos > historial del slot > ww > snapshot pre-deload > pb. El deload **no escribe** `S.workingWeights`.
- **RIR/RPE:** card de fase muestra "12-15 reps · RIR 4-5 (sin fallo)".
- **Descansos:** `_phaseAdjustedRest(secs, isCompound, isBetween)` central. Compuesto → 90s · aislamiento → 60s · entre rondas SS (`isBetween:true`) → 45s.
- **Time-based:** `_deloadTimeVal(secs)` → `Math.max(5, Math.round(secs*0.7/5)*5)`. Aplica a `isTimeBased` y `timeAndWeight`.
- **DP congelada:** `checkDoubleProgression` early return si `_isDeload()`.
- **Cardio:** `_setupCardioModalForPhase()` muestra `#cardio-deload-banner` solo en deload. Botón "Cambiar a LISS".
- **Warmup/cooldown NUNCA descargan.**
- **Supersets se mantienen.** Solo se descarga peso y descansos.

### Identificación de compuestos
Set `COMPOUND_NAMES_EN` (47 entries: 27 hasta v10 + 20 de las fichas reconstruidas en v11 — *los docs decían 47 desde junio, pero el código tenía 27*) — fuente única de verdad por `nameEn`. `_markCompoundExercises(daysArray)` se llama desde `_reloadProfileData()` y marca `e.compound = true` solo si `e.compound === undefined` (override JSON respetado). Multiusuario automático.

**Lote 7 (2026-06-11) — deriva del ejercicio RESUELTO:** `_isCompound(ex)` ya NO confía en la marca `compound` del slot cuando hay swap activo. Con swap (puntual o permanente, vía `getResolvedRefForSlot`) deriva la condición del `nameEn` del **ref activo** contra `COMPOUND_NAMES_EN`. La marca/override `compound` del JSON solo es válida para el ejercicio ORIGINAL del slot — NO sobrevive a un swap. Cierra el bug del compound rancio (swap de un compuesto a Arnold Press dejaba `compound:true` y Arnold periodizaba a 5-7, prohibido por el coach). Cubre de raíz a `getPhaseReps`, `getSuggestedWeight` (F1b/B.5), `_phaseAdjustedRest` y avisos de DP — ninguno se modificó.
**Exclusiones permanentes de `COMPOUND_NAMES_EN`** (decisión del coach — NUNCA agregarlos): Arnold Press, Machine Triceps Press, Barbell Good Morning, **Puente de Glúteo Cargado, Step-up, Zancada Caminando, Zancada Hacia Atrás** (estas 4 añadidas en 2B). Multiarticulares o de patrón que NO toleran bajar a 5-7; van a rango fijo.

### Transición dl → acc (manual desde Config)
- `setUserPhase('acc')` desde deload dispara `showConfirm` "Reinicio de ciclo" con 6º arg `cancelCb`.
- Confirma → setea `_pkey('phase-reset-pending')` con `{exId: true}` para todos los ejercicios con peso.
- `getSuggestedWeight(exId)` retorna 78-82 % de `_referenceWeightFor(exId)` (desde v12, tu última sesión de trabajo; antes el snapshot pre-deload) mientras `_phaseResetPendingFor(exId) === true`. Tras 1ª serie con peso > 0, `_markPhaseResetDoneFor(exId)` limpia.
- Card de fase muestra "🔄 Reinicio · arranque conservador".
- Al pasar a `str` o `hyp`, `_clearAllPhaseResetFlags()` limpia.

### Snapshot pre-deload
`_savePreDeloadSnapshot()` guarda `S.workingWeights ∪ pbs` en `_pkey('pre-deload-ww')` al ENTRAR a deload.

### showConfirm extendido
Firma: `showConfirm(icon, title, body, okLabel, cb, cancelCb?)`. El 6º arg se ejecuta si el modal se cierra con X o tap fuera. Backward-compatible.

## Usuario y dispositivo
App personal de entrenamiento (perfiles Braulio y Jimena). Dispositivo objetivo: iPhone con Safari, PWA instalada, uso offline en el gym — pensar en una mano y pantalla chica. Medidas, salud y demás datos personales: en `CLAUDE.local.md` (privado).

## Rutina PPL×2 (Braulio)
| Día | Nombre | Foco | Ejercicios | Pares |
|---|---|---|---|---|
| 1 | Empuje A | Pecho·Hombros·Tríceps | 7 | SS 1-5↔1-6 |
| 2 | Jalón A | Espalda Ancho·Bíceps | 10 | SS 2-5↔2-10, SS 2-8↔2-9 |
| 3 | Piernas A | Cuádriceps·Isquios·Gemelos | 9 | SS 3-4↔3-7 *(no adyac)*, BS 3-8↔3-9 |
| 4 | Empuje B | Hombros·Pecho·Tríceps | 7 | SS 4-4↔4-6, SS 4-5↔4-7 |
| 5 | Jalón B | Espalda Grosor·Bíceps·Trampas | 9 | — |
| 6 | Piernas B | Cadena Posterior·Glúteos·Core | 9 | SS 6-5↔6-7 *(no adyac)*, BS 6-8↔6-9 |

Orden Día 4 tras reorden: `4-1, 4-2, 4-3, 4-4, 4-6, 4-5, 4-7`. Split NO hardcodeado.

## Rutina Jimena v2 (PERIODIZADA — sin supersets ni cardio; 1RM desde sus registros)
Avanzada (`level:'A'`), hipertrofia. Periodiza compuestos vía el motor unificado (Grupo A); aislamientos en rango fijo. RIR/tempo del coach guardados como `tip:` por ejercicio. 32 ejercicios (6 días: 5·6·5·6·5·5).

| Día | Nombre | Ejercicios (compuestos periodizan; aislamientos reps fijas) |
|---|---|---|
| 1 | Cuádriceps y Glúteo | Hip Thrust · Prensa · **Búlgara `sides:2` (3/pierna)** · Ext Cuádriceps · Abducción |
| 2 | Hombro y Tríceps | Press Hombros Máq · Laterales · Pushdown · Press Francés · **Face Pull** (reemplazó Tríceps Posterior) · **Elev. Talón Sentado** (sóleo, nuevo) |
| 3 | Espalda y Bíceps | Remo Apoyo Pecho · Jalón Ancho (swap→neutro/cerrado) · Curl Barra · Curl Martillo · **Jalón Brazo Recto** (reemplazó Curl Polea) — **5 ejercicios** (Remo Mancuerna NO cableado, respeta v2) |
| 4 | Cuádriceps y Femoral | RDL (`repsOverride str:8-10`) · Prensa · Curl Isquios Tumbado · Ext Cuádriceps · Curl Isquios Sentado · **Elev. Talón de Pie** (gastrocnemio, nuevo) |
| 5 | Pecho | Press Inclinado MC · Press Plano Máq · Pec Deck · Cruces Polea · **Lagartijas (`amrap`, burnout)** — poblado |
| 6 | Femoral y Glúteo | RDL (`repsOverride str:8-10`) · Hip Thrust · **Búlgara `sides:2`** · Curl Isquios Tumbado · Abducción |

Todos `needs1RM:true` (excepto lagartijas, `needs1RM:false`). Sin supersets. Búlgara `sides:2` con descanso por fila. Warmups/cooldowns de los 6 días cableados (Grupo 1 + Día 5 en B; sóleo extra en cooldown días 2/4 en Grupo D). Días con `exercises:[]` bloquean "Entrenar" (ya ninguno está vacío).

## ORM_DATA Braulio — solo metadata (v12)
`ORM_DATA` = **26 slots** de Braulio con `{name, unit}` y nada más: marca qué slots llevan 1RM y en qué unidad se muestra. **No hay 1RM en el código desde v12** (los números viejos eran aproximados y se borraron; un perfil guardado con ellos se ignora). Jimena: `ormData:{}` + `needs1RM:true` por slot.
Slots: `1-1 1-2 1-4 1-6 1-7 · 2-1 2-2 2-3 2-4 2-7 · 3-1 3-2 3-5 3-6 · 4-1 4-2 4-3 4-7 · 5-1 5-2 5-3 5-7 · 6-1 6-2 6-3 6-4`. Unidades: `kg barra` (1-1, 4-3, 6-1) · `kg total` (1-2, 6-3) · `kg total maq` (1-4, 4-1) · `kg c/brazo` (1-7, 4-7) · `kg maq` (3-1, 3-2) · `kg plat` (3-5, 6-2) · `kg` el resto.
> *(Corrección 2026-10-24: este doc decía "16 ejercicios con 1RM semilla"; el código siempre tuvo 26 entradas.)*

## Restricciones por perfil
Las restricciones de salud de cada perfil viven en `CLAUDE.local.md` (privado). En el código se expresan con `conditions[]` del perfil × `unsafeFor[]` de las variantes (filtran variantes y destinos de swap) y con los `tip`/`note` de cada slot. **Si vas a tocar ejercicios, swaps o variantes y no tienes `CLAUDE.local.md` (sesión en la nube), no quites ni relajes ninguna restricción existente (`unsafeFor`, `repsOverride`, tips): pregunta.**

## Estructura HTML
```
modales: confirm-modal, info-revert-modal, detail-sheet, days-picker-modal, cardio-modal, week-panel-modal, done-sc, workout-detail-modal, exercise-edit-sheet
screens: home, day, warmup, workout, cooldown, cardio-protocol, nutrition ("Análisis de la sesión"), history, prs, calendar, config  (v13: sin diet)
sheets: exercise-edit-sheet (incl. #ees-swap-section → #ees-swap-banner/-warn/-ss-note/-list/-footer)  (v13: sin edit-sheet ni swap-sheet, eran de Dieta)
overlays: countdown-overlay (z-1000) · #swap-toast (fixed top:60px, z-1100, feedback de swap)
headers: wo-name y cd-name en wrapper flex con span hermano #wo-swap-badge / #cd-swap-badge (oculto por default)
bottom-nav: Historial|Entrenar|⚙️Config (v13 quitó Dieta; visible durante entreno, compacta con .bnav-compact)
sticky: #wo-sticky dentro de screen-workout aloja #rest-inline y #wo-next-wrap
config: cfg-sec-profile arriba de Apariencia (incluye selector de perfil + fila "Nivel de entrenamiento" P/I/A, Grupo 4)
```

## CSS
Variables: `--bg --s1 --s2 --bd --t1 --t2 --t3 --acc --warm --cool`
Clases clave: `.screen .sf .ss .card .bottom-nav .today-card .cfg-* .st-row .st-input .bnav-compact .wo-sticky(.empty) .skip-chip`

## JS — funciones críticas (no romper)

Índice completo en `funciones.md` (privado: en una sesión en la nube no existe; busca en `index.html`). Consultar ANTES de crear/renombrar.

- **Perfiles:** `getActiveProfileId` `_pkey` `getActiveProfile` `saveProfile` `_reloadProfileData` `switchProfile` `_loadProfileSection` `_onNewProfileClick` `setProfileLevel` `_syncProfileLevelSeg` · IIFE `_migrateLegacyKeys`
- **Notas + sheet unificado:** `getNotes` `saveNotes` `getNoteForExercise` `setNoteForExercise` `resolveNoteForExercise` `openExerciseEditSheet(exId, opts)` + wrappers ForWorkout/ForWarmup/ForCooldown · acciones del sheet · `_refreshNoteUIFor` · alias retrocompat `openNoteEditorFor`
- **Swaps lógica (P3B.1):** `getResolvedRefForSlot` `getAvailableSwapsForSlot` `applySwapPuntual` `applySwapPermanente` `revertSwapPuntual` `revertSwapPermanente` `getSwapBadgeForSlot` · seguridad (Lote 7) `_refIsSafeForProfile(ref)` (reusa `_variantAllowedForProfile`; true sin `variants[]`) · internos `_archiveHistoryForSlot` `_getArchivedSwap` `_getAllArchivedSwaps` `_clearArchivedSwap` `_hasLogsWithRef` `_lastWeightForSlotRef` (sin llamadas desde v12) `_refForSlotInCurrentDays` · consola `_testSwap` `_testRevertSwap` `_dumpSwapState`
- **Swaps UI (P3B.2):** `renderSwapSectionInSheet` `renderSwapItemHTML` `renderSwapBadgeInline` `onSwapItemClick` `onSwapPuntualClick` `onSwapPermanenteClick` `onRevertSwapClick` `onSwapBadgeClick` `_showSwapToast` `_activeSlotIsBarbell` `_isDuringActiveWorkout` `_swapColorForMatch` `_slotEntryFromExId` `_dayIdForSlotId` `_rerenderAfterSwap` `_escHtml` `_escAttr` · estado `_swapExpandedRef`
- **Switch de variantes (P4.1):** `getActiveVariant(slot)` `_activeVariantForEx(ex)` `_slotShowsPlates(slot)` `applyVariantSwitch(slotId, newVariantId)` · ficha por variante (P4.4) `_applyVariantFicha(resolvedObj, entry)` · storage `_getEquipmentMap` `_saveEquipmentMap` `_setEquipmentForSlot` · lectura segmentada `_lastWeightForVariant` `_hasLogsForVariant` (sin llamadas desde v12) · UI (P4.2) `getAvailableVariantsForSlot` `renderEquipmentSectionInSheet` `renderEquipmentItemHTML` `onEquipmentItemClick` `renderEquipmentBadgeInline` `_variantEffectLabel` `_variantAllowedForProfile` · consola `_testSwitchVariant` `_dumpVariantState` · DEPRECADOS `BARBELL_EX={}` `toggleBarType`(no-op) `_activeSlotIsBarbell`(alias→`_slotShowsPlates`) — ninguno tiene llamadas en v13
- **Nav:** `showScreen` `switchTab` `hasActiveWorkout` · IIFE `initWoStickyObserver`
- **Workout:** `startWorkout→renderWarmup→renderWorkout→renderCooldown→finishWorkout`
- **SuperSet/Biserie:** `getSupersetConfig` `getSupersetPartner` `renderSupersetWorkout(d,eA,eB,cfg)` `buildSSTable` `toggleSetSS` `startSSHold(exId,idx,prefix)` `adjustSSHold` `resetSSHold` `_ssHoldLoop` `_isSupersetReceiver` `_getNextIdxAfterSuperset` `_getPrevIdxFrom` `_getNextPendingIdx` `_restoreNormalWorkoutUI`
- **Plate calc en SS:** `_exNeedsPlates` `_ssActiveExForPlates` `_ssRenderPlates` `_renderPlateCalcFor` `_onSSWeightFocus` `_onSSWeightChange` (todas vía `_plateInfoFor`)
- **Tipos de ejercicios:** `_totalSetsFor` `_sideLabelFor` `_stNumContent` `renderTimeAndWeightTable` `startTAWHold` `adjustTAWHold` `resetTAWHold` `_tawLoop` `undoTAWSet` `onTAWWeightChange` `onTAWTimeChange`
- **Countdown 3s:** `_startCountdownThen` `_playCountdownTick`
- **Timers time-based:** `_tbKey(ctx,id,idx,extra)` `_tbSave` `_tbLoad` `_tbClear` `_tbClearAll` `_tbDefaultSecs` `_tbClamp` `_wcContext`
- **Timer workout:** `renderWorkoutHold` `startWorkoutHold` `adjustWorkoutHold` `resetWorkoutHold` `_woHoldLoop`
- **Timer warmup/cooldown:** `renderPhaseTimer` `startPhaseCountdown` `adjustPhaseTimer` `resetPhaseTimer` `_phaseCountdownLoop` `_onPhaseCountdownEnd` `renderHoldTracker` `startHold` `adjustHoldTracker` `resetHoldTracker` `_holdTrackerLoop`
- **Discos y barras (v10):** `_plateInfoFor(ex)` (fuente única) `_barWeightForVariant(v)` `_getSmithBarWeight()` · sin llamadas: `getBarWeight(exId)` `toggleBarType(exId)` `_activeSlotIsBarbell(slot)`
- **Series:** `renderSetTable` `toggleSet(idx)` `startRestInline(secs,exId,restType)` `adjustRestInline` `_updateRestBtns` `updateRestInlineUI`
- **Audio iOS:** `_ensureAudio` `playBeep`
- **Cardio:** `closeCardioModal` `confirmBackFromCardio` `selectCardio` `getCardioIntervals` `startCardioInterval` `updateCardioTimer` `confirmFinishCardio`
- **Progresión / motor de peso (v10–v12):** `getSuggestedWeight` (envoltorio cargable) `_getSuggestedWeightRaw` `getPhaseReps` `checkDoubleProgression` `showDPNotification` · historial `_recentSessionsFor` `_lastSessionSetsFor` `_lastSessionPhaseFor` `_referenceWeightFor` `_slotHasAnyHistory` `_postDeloadWeightFor` `_progressiveSuggestion` · prefill `_prefillKgFor` `_sugOverridesPrefill` `getActKg` · cargable `_roundLoadable` `_barFloorFor` `_progressStepFor` · tarjeta `_kgRangeTxt` `_liveOrmHint`
- **1RM:** en vivo `_liveE1RMFor` · guardado `_phasePctRange(phaseKey)` `_regenRangesFromOrm(orm)` `_getOrmCurrent` `_getOrmPending` `_saveOrmCurrent` `_saveOrmPending` `_applyLiveOrmToCatalog` `_maybeRecalcOrm` `_undoOrmPendingFor` `_applyPendingOrms` · consola `_dumpOrmState` `_resetOrmAuto` `_applyOrmsNow`
- **Guardado de entrenos (incl. PARCIALES, 2026-08-26):** `_persistWorkoutToHistory(opts)` `_workoutProgress(loggedObj, dayId)` `_teardownWorkoutSession()` `_partialChipHtml(h)` `_offerSavePendingSession(d)` · consumidores `finishWorkout` `confirmCancel` `checkPendingSession`
- **Ciclo por trabajo (G4):** `getCurrentWeek` `isCycleExpired` `nextDayId` `startCycle` · week-overrides (getter/setter) · panel "¿Qué llevo?"
- **Limpieza y migraciones al arrancar:** IIFE `_purgeDietData` (v13) · `_migrateRenamedVariants` (v12). *(La Dieta se eliminó en v13; lista en funciones.md → ELIMINADAS.)*
- **Config:** `loadApariencia` `loadConfigGrupo2` `loadConfigGrupo3` `showInfoRevertModal` `openDetailSheet`
- **Resolvers:** `resolveEx(entry, d?)` `_resolveDynamicActivation(entry, d)` `resolveCardio(d)`
- **Fase deload:** `_currentPhaseKey` `_isDeload` `_isCompound` `_phaseAdjustedRest` `_deloadTimeVal` `_round25`
- **Reset acumulación:** `_savePreDeloadSnapshot` `_getPreDeloadSnapshot` `_referenceWeightFor` `_phaseResetPendingFor` `_markPhaseResetDoneFor` `_clearAllPhaseResetFlags`
- **Compound multiusuario:** `_markCompoundExercises(daysArray)` · Set `COMPOUND_NAMES_EN`
- **Cardio modal:** `_setupCardioModalForPhase`
- **showConfirm extendido:** `showConfirm(icon, title, body, okLabel, cb, cancelCb?)` · variable global `_confirmCancelCallback`

## Supersets y Biseries (Braulio — 9 pares)

### Modelo de datos (objeto, NO string)
```js
"superset": { "with": "id-receptor", "internal": 15, "between": 60, "type": "superset" }
```
- `with`: id del receptor · `internal`: descanso entre leader y receptor (s; `0` = biserie) · `between`: descanso al terminar el par · `type`: `"superset"` o `"biserie"`.
- **Retrocompat:** string legacy se normaliza. Todo acceso DEBE pasar por `getSupersetConfig(e)`.

### Pares configurados (Braulio)
| Día | Leader | Receptor | internal | between | type | Adyac |
|---|---|---|---|---|---|---|
| 1 | 1-5 Laterales | 1-6 Pushdown | 15 | 60 | superset | sí |
| 2 | 2-5 Jalón cara | 2-10 Curl Pred | 15 | 60 | superset | sí |
| 2 | 2-8 Martillo | 2-9 Invertido | 15 | 60 | superset | sí |
| 3 | 3-4 Abducción | 3-7 Gemelos | 15 | 60 | superset | **NO** |
| 3 | 3-8 Plancha | 3-9 Toes-to-Bar | 0 | 45 | biserie | sí |
| 4 | 4-4 Laterales | 4-6 Press Plano MC | 15 | 60 | superset | sí |
| 4 | 4-5 Aperturas Inv | 4-7 Ext OH | 15 | 60 | superset | sí |
| 6 | 6-5 Abducción | 6-7 Sóleo | 15 | 60 | superset | **NO** |
| 6 | 6-8 Rueda Abd | 6-9 Side Plank | 0 | 45 | biserie | sí |

### Reglas
- Receptor invisible: `_isSupersetReceiver(ex,d)` filtra en `renderWorkout`, `nextExercise`, `woSkipExercise`, `woPrev`.
- No adyacentes (3-4↔3-7, 6-5↔6-7): al salir aterriza en primer intermedio pendiente. Al regresar (`woPrev`), `_getPrevIdxFrom` hace el espejo: cae en el pendiente más cercano antes del receptor y, solo si no hay, en el líder (v9, B2).
- Biserie con time-based: `buildSSTable` detecta y renderiza botón timer.
- Biserie 6-8↔6-9: 9 series totales (3 leader + 6 con sides:2 del receptor).
- IIFE de validación: console.warn si leader+receiver están ambos en ORM_DATA.

## CARDIO_PROTOCOL (Braulio)
Compartido Día 2 y 4. Solo `{ type: "🏃 Cardio" }`. Intervalos LISS/HIIT desde `getCardioIntervals(type)`. En DAYS: `cardio: "_shared"`. `resolveCardio(d)` lo resuelve.

## EX_SIBLINGS (Braulio — 9 pares)
`3-7↔6-6` Gemelos · `1-4↔4-1` P.Hombros · `1-7↔4-7` Ext OH · `2-6↔5-6` Bayesian · `2-1↔5-3` Jalón · `2-2↔5-2` Remo · `3-5↔6-2` RDL · `3-4↔6-5` Abducción · `5-9↔6-9` Side Plank

## BARBELL_EX (Braulio) — DEPRECADO en P4.1
El toggle Libre↔Smith ahora lo cubren las variantes `barra-libre`+`smith` de cada main (campo `variants[]`). `BARBELL_EX = {}` (vacío) se conserva solo para retrocompat del merge de perfiles (`barbellEx: {}`); ya NO decide plate calc ni barra. `toggleBarType` es no-op. `_activeSlotIsBarbell` es alias delgado a `_slotShowsPlates`. Ninguno tiene llamadas en v13. **Migración: 1-1 (Press Banca) y 6-1 (Hip Thrust) migrados vía sus variantes barra/smith. Ninguno sin migrar.** El toggle UI viejo (`#wo-bar-toggle`) está oculto hasta que el switch UI de 4.2 lo reemplace.

## Estado S
**Persistente en sesión:** `dayId, phase, wuStep, cdStep, exIdx, logged, wStart, wkStart, wkEnd, workingWeights, restEndTs, restMinSecs, restOrigSecs, barType, sessionSwaps, equipmentMode`
**`S.equipmentMode`** (P4.1) es cache de sesión NO autoritativo (la verdad vive en `b5-{p}-equipment`). NO se persiste en `saveSession` (el storage se relee fresco). Se resetea `= {}` junto a `S.sessionSwaps` en arranque/fin/cancel de entreno y switchProfile.
**saveSession state:** persiste todos los anteriores excepto `phase` (separado en el wrapper) y `equipmentMode` (se relee del storage).
**`S.phase` debe asignarse explícitamente** al transicionar a workout (`wuAdvance`, `restoreSession`, `closeCardioModal`, post-cardio).

## localStorage (per-perfil + globales + efímeras)

### Per-perfil (21 keys, prefijo `b5-{profileId}-`)
**Entreno:** hist, pbs, ww, sess (efímera única), cycle-start, last, recs, notes
**Config entreno:** user-phase, days-week, active-days
**Perfil:** user-weight, user-fat, user-goal
**Fase deload/reset:** pre-deload-ww, phase-reset-pending, phase-reset-done
**Swaps:** archived-swaps
**Equipo:** equipment
**1RM automático (G3):** orm-current, orm-pending
**Calendarización (G4):** week-overrides

### Globales del dispositivo (sin prefijo)
**Apariencia:** theme, accent, font-size, wake-lock
**Config entreno global:** unit, rest-default, sound-on, sound-type, vibrate, smith-bar-weight
**Sistema:** active-profile, profiles

### Efímeras (sin prefijo)
**Sesión activa:** `b5-sess` (única; al cambiar de perfil se borra)
**Timers:** `b5-timebased-{ctx}-{id}-{idx}[-{extra}]` donde `ctx ∈ {wo, ss, wu, cd}`. Limpiadas con `_tbClearAll()` en `startWorkout`, `confirmCancel`, `clearSession`, `finishWorkout`, y al cambiar de perfil.

## Dieta — ELIMINADA (v13, 2026-10-21)
Braulio no la usaba. Se quitaron `FOOD_DB`, `DIET_MEALS`, `NUTR`, `NUTR_META`, `PROT_G_PER_KG`, la pantalla `diet`, `edit-sheet`, `swap-sheet`, la pestaña y 30 funciones (~970 líneas). Quedan: peso, grasa y objetivo del perfil, el recordatorio de agua y `showNutrition` como "Análisis de la sesión" (duración e incrementos sugeridos). `_purgeDietData` limpia lo guardado. No reintroducir sin decisión de Braulio.

## Datos en `<script>`
`EX_CATALOG{201}` (134 main · 34 warmup · 33 cooldown; 193 variantes en 89 mains, 77 con discos; 16 variantes con `form`/`errors` propios, P4.4; 16 con `unsafeFor`; `execLabel` en los 134 mains, frases `execCue` solo en 51 — faltan las 83 altas de las tandas; 44 mains con `swaps[]` (115 destinos) y **0 refs colgando**) `CARDIO_PROTOCOL{1}` `DAYS[6]` (51 ejercicios: 7·10·9·7·9·9) `JIMENA_DAYS[6]` (32: 5·6·5·6·5·5) `ORM_DATA{26}` (solo `name` + `unit`, Braulio) `PHASES[4]` (acc sem 1-2 12-15 · hyp 3-5 8-10 · str 6 5-7 · dl 7 12-15 ligero — fuente única de periodización y de los %) `PLATES[6]` (20·15·10·5·2.5·1.25) `BAND_SUBS{5}` `EX_SIBLINGS{9}` `TEMAS{2}` `BARBELL_EX{0}` (deprecado) `PROFILES_DEFAULT{2}` (con `conditions[]` por perfil — valores y pendientes en `CLAUDE.local.md`; `level` editable vía Config) `COMPOUND_NAMES_EN{47}` (Arnold Press, Machine Triceps Press, Barbell Good Morning, Puente Glúteo Cargado, Step-up, Zancada Caminando y Zancada Atrás excluidos A PROPÓSITO — rango fijo) `APP_BUILD`. Flags de ejercicio: `amrap:true` (Grupo E), `repsOverride:{fase:reps}` (Grupo A), `needs1RM` (Jimena), `primaryMuscle` (los 134 mains; 14 `'core'`). *(Medido en v13 el 2026-10-24. Antes de v11 el catálogo real era de 140 fichas y 73 mains: las Tandas 2A/2B no habían llegado a `main`.)*

## NUNCA
- Poner conteos de segundos por rep (tempo, pausas, apretones) en tip: o form[] — los segundos de apretón viven solo en execCue; isométricos/holds/respiraciones/descansos sí llevan segundos.
- `alert/confirm/prompt` nativos — usar `showConfirm(icon,title,body,okLabel,cb,cancelCb?)`
- `var` — solo let/const
- URLs externas — app offline
- PRs o doble progresión con 0kg
- `console.log` en producción
- localStorage sin prefijo `b5-`
- localStorage per-perfil sin pasar por `_pkey()`
- Duplicar ejercicios en perfiles distintos — usar `EX_CATALOG` con `_ref`
- **Hacer que un perfil herede datos de otro** — perfiles aislados
- **Compartir notas entre perfiles** — viven en `b5-{profileId}-notes`
- Poner `S.exIdx` directamente en el receptor de un superset
- Incluir Curl con Barra (2-7) en `BARBELL_EX`
- Parear dos ejercicios en ORM_DATA en un superset
- **Acceder directamente a `e.superset`** — siempre `getSupersetConfig(e)`
- **Renderizar un ejercicio receptor solo** — siempre retroceder al leader
- **Usar `ex.rest` del leader como descanso dentro del par** — usar `cfg.internal`/`cfg.between`
- **Asumir `leaderIdx === receiverIdx - 1`** — hay supersets no adyacentes
- **Bloquear la bottom-nav durante entreno**
- **`setInterval`/`setTimeout > 5s` sin persistir `endTs` absoluto**
- **Asumir `S.restMinSecs`/`S.restOrigSecs` siempre seteados** — defensa con `|| 10`
- **Llamar `startWorkoutHold(secs)` con argumento** — sin args
- **Llamar `startSSHold(...)` o `startPhaseCountdown(...)` con 4 args** — son 3
- **Reproducir audio sin haber llamado `_ensureAudio()`** desde gesto de usuario
- **Usar `inc-modal`, `showIncreaseModal`, `applyIncrease`** — eliminadas
- **Hardcodear datos de Braulio en lugares que apliquen a "el usuario"** — leer del perfil activo
- **Poner tips/notas dentro del JSON de DAYS o EX_CATALOG**
- **Heredar warmup/cooldown/exercises de Braulio para otros perfiles**
- **Mutar `e.sets` para multiplicar por sides** — usar `_totalSetsFor(ex)`
- **Leer la fase con string match** — usar `_isDeload()` / `_currentPhaseKey()`
- **Leer `e.compound` / `resolved.compound` para decidir si es compuesto** — usar `_isCompound(ex)`. Con swap activo la marca del slot está rancia (Lote 7); `_isCompound` deriva del ref resuelto
- **Agregar Arnold Press, Machine Triceps Press, Barbell Good Morning, Puente de Glúteo Cargado, Step-up, Zancada Caminando o Zancada Hacia Atrás a `COMPOUND_NAMES_EN`** — exclusión permanente del coach (rango fijo, no toleran 5-7)
- **Vetar un ref-destino por `conditions` sin `variants[]`** — `_refIsSafeForProfile` da `true` sin variantes; crear una variante baseline con `unsafeFor` para poder bloquearlo
- **Aplicar deload a warmup/cooldown**
- **Marcar `compound:true` en JSON** si está cubierto por `nameEn` en `COMPOUND_NAMES_EN`
- **Llamar `_phaseAdjustedRest` con `isBetween:true`** salvo en SS receptor
- **Mutar `S.workingWeights` como fuente de verdad para "pesos de fuerza"** — usar `_referenceWeightFor(exId)`
- **Mezclar paso 3 (iso de activación) con paso 4 (serie ligera al 50%)** — el placeholder `_activation:"auto"` es SIEMPRE paso 4
- **Inyectar `benefits` o `_activation:"auto"` en el catálogo** — el catálogo NO tiene placeholders dinámicos
- **Asumir que `resolveEx(entry)` con 1 solo arg resuelve dinámicos** — pasa `d` siempre que estés en contexto de día
- **Leer `entry._ref` directamente para resolver el ejercicio activo** — siempre `getResolvedRefForSlot(entry)`. El `_ref` no refleja swaps puntuales
- **Persistir logs sin `exRef`** desde nuevo código — leer `getResolvedRefForSlot(ex)?.ref` y guardar como `exRef`
- **Modificar `history`/`exDetail` para "actualizar" un swap permanente** — historial inmutable. La separación se hace en lectura con `archived-swaps`
- **Llamar `applySwapPermanente` durante entreno activo** — el botón de UI se oculta vía `_isDuringActiveWorkout()`
- **Setear `S.sessionSwaps[slotId]` con un ref que NO está en `EX_CATALOG`** — `applySwapPuntual` ya valida
- **Renderizar `wo-swap-badge`/`cd-swap-badge` sin pasar por `renderSwapBadgeInline`** — el helper limpia el span si no hay swap (evita badge stale)
- **Asumir que el badge inline aparece en supersets** — `renderSupersetWorkout` lo oculta (en SS `wo-name` queda vacío)
- **Leer `BARBELL_EX[ex.id]` directamente para decidir toggle/plate calc** — usar `_plateInfoFor(ex)` (considera swap y variante)
- **Asumir que `S.phase` se autoactualiza al cambiar de pantalla** — debe asignarse explícitamente en cada transición
- **Mostrar niveles P/I/A abreviados en UI** — usar palabras completas "Principiantes/Intermedios/Avanzados"
- **Resetear `_swapExpandedRef` dentro de `renderSwapSectionInSheet`** — rompe el toggle de expand; resetear solo al abrir el sheet
- **Leer `BARBELL_EX[exId]` o `S.barType` para decidir toggle/plate calc** — eliminados; usar `_plateInfoFor(ex)`
- **Decidir discos por el nombre del ejercicio** — la regex se eliminó en v10; cada variante declara `plateCalc` y `barWeight` (0 = máquina de discos)
- **Persistir logs sin `variant`** desde nuevo código — leer `getActiveVariant(ex)?.variant.id`
- **Borrar `b5-{p}-equipment` al terminar entreno** — es preferencia persistente, no efímera. Solo se resetea el cache `S.equipmentMode`
- **Forzar `barWeight:20` en Curl con Barra (2-7)** — su baseline es barra recta de 10 kg (supuesto de v11, por confirmar en el gym); la olímpica de 20 es otra variante
- **Setear `equipment[slotId]` con un variantId que NO está en `variants[]` del ref activo** — `applyVariantSwitch` valida; `getActiveVariant` cae a default si el id ya no existe
- **Duplicar `form`/`errors` en variantes cuando son casi idénticos a la base** — solo poblar variantes cuya técnica difiera de raíz (regla del coach). El resto hereda
- **Poner `muscles`/`nameEn`/`img` en una variante** — la variante solo personaliza `form`/`errors`; lo demás es del ejercicio
- **Ofrecer una variante con `unsafeFor` ∩ `conditions` del perfil** — `getAvailableVariantsForSlot` la filtra; si el modo guardado apunta a una bloqueada, `getActiveVariant` cae a default seguro
- **Hardcodear el peso de la barra Smith** — leer `_getSmithBarWeight()` (lee `b5-smith-bar-weight`, global). El `barWeight:10` del catálogo es solo el default
- **Escribir 1RM o rangos en `ORM_DATA` del `<script>`** — desde v12 es solo metadata (`name`, `unit`). El 1RM sale de los registros: en vivo `_liveE1RMFor`, guardado en `b5-{p}-orm-current`
- **Leer `exDetail` como objeto keyed por exId, o `s.weight`** — `exDetail` es array de `{slotId,name,sets:[{w,r,...}]}`; buscar por `slotId` y leer `s.w` (bug G3-1)
- **Mostrar la tarjeta de peso como rango estático cuando hay historial** — en fase normal se deriva de logs vía `_progressiveSuggestion`, sin piso del rango del 1RM (v12)
- **Aplicar un 1RM detectado de inmediato al guardado** — es diferido: va a `orm-pending` y se promueve a `orm-current` solo en `startCycle` (las sugerencias ya usan el 1RM en vivo)
- **Recalcular el 1RM guardado con reps fuera de 3-7, o aceptar saltos >15% / valores que bajen** — `_maybeRecalcOrm` los rechaza (el 1RM en vivo sí puede bajar, a propósito)
- **Asumir que el ciclo avanza por tiempo/días** — avanza por TRABAJO HECHO (`getCurrentWeek` = entrenos+done+skip). Alimenta `_isDeload`/fase/peso
- **Olvidar limpiar `week-overrides`** en `startCycle`/`resetCycle`/`resetAllData`
- **Descartar una sesión con series registradas sin ofrecer guardarla** — toda ruta de descarte (timeout ≥240 min, "no continuar", cancelar entreno) pasa por `_offerSavePendingSession(d)` o por el confirm con "Guardar y salir". Cerrar un modal con X / tap fuera NUNCA descarta un entreno con progreso
- **Escribir a `history` sin pasar por `_persistWorkoutToHistory(opts)`** — es la fuente única (arma `sess`, ordena por `id` desc, recorta a 40, actualiza `exHistory`, llama `save()`)
- **Excluir un entreno parcial del conteo del ciclo** — cuenta como trabajo hecho a propósito (`_trainedSessionsThisCycle` → `getCurrentWeek`), aunque acerque el deload
- **Subir `CACHE_NAME` sin subir `APP_BUILD.version`** (ni al revés) — van en el mismo commit
- **Inventar un peso para un ejercicio o equipo sin registros propios** (swap, variante `separate`, ejercicio nuevo) — sin registros el input queda vacío y la tarjeta dice "primera vez" (v12). Nada de 80 % ni ×0.9
- **Usar el peso, el 1RM guardado o `workingWeights` del slot con un swap o una variante `separate` activos** — son de OTRO ejercicio/equipo; leer con `_recentSessionsFor`
- **Escribir `S.workingWeights` en deload** — el peso de trabajo no se pisa con el ligero de la descarga
- **Repartir "por mano" el peso de UNA mancuerna** — solo los ids con `mancuernas`/`kettlebells` son par (`_variantIsDumbbell`); time-and-weight y BSS anotan la SUMA
- **Recorrer `history` a mano para leer el historial de un slot** — usar `_recentSessionsFor` (más nueva primero, filtra ejercicio y equipo, `skipDeload`)
- **Escribir datos personales en `CLAUDE.md`** (medidas, salud, ubicación, gym) — es PÚBLICO; van en `CLAUDE.local.md`

## SIEMPRE
- `showConfirm()` con 5 args (6º `cancelCb` opcional)
- `switchTab()` desde botones visibles (no `showScreen`)
- `padding-bottom:80px` en pantallas con bottom nav
- `_pkey('user-phase')` en TODAS las funciones de fase
- `getSiblingHistory()` en vez de `exHistory[]` directo
- `resolveEx(entry, d?)` al acceder ejercicios de cualquier slot desde DAYS
- `resolveCardio(d)` al acceder propiedades de `d.cardio`
- Español excepto: Press, Curl, Hip Thrust, RDL, Bayesian, RKC, Smith, Pushdown, Y-T-W, LISS, HIIT, Triceps, Core, Booty Builder, Reverse Lunge
- `getSupersetPartner(e, d)` antes de asumir que un ejercicio se renderiza solo
- `toggleSetSS(exId, idx, prefix)` en vez de `toggleSet(idx)` dentro de la UI del superset
- `_plateInfoFor(ex)` (base y etiqueta) / `_barWeightForVariant(v)` en vez de `BAR_WEIGHT` fijo
- `getSupersetConfig(e)` antes de acceder a `.superset`
- `_isSupersetReceiver(ex, d)` para filtrar receptores en cualquier navegación nueva
- `_getNextIdxAfterSuperset(d, idx, cfg)` al salir de un superset
- `_getNextPendingIdx(d, fromIdx)` como fallback para saltar receptores
- `_ensureAudio()` al inicio de cualquier botón nuevo que dispare un beep
- `_tbClearAll()` integrado en `startWorkout`/`confirmCancel`/`clearSession`/`finishWorkout` y al cambiar de perfil
- `_tbLoad`/`_tbSave`/`_tbClear` con `_tbKey` para cualquier timer time-based
- `S.wkStart`/`S.wkEnd` para tiempo de la fase workout
- **`getActiveProfile()` para leer datos del perfil activo** — nunca asumir Braulio
- **`_pkey(suffix)` para construir keys per-perfil**
- **Defensa contra días/perfiles vacíos:** `renderWarmup`, `renderCooldown`, `startWorkout`, `home` manejan `warmup:[]`, `cooldown:[]`, `exercises:[]` sin crashear
- **`_savedRecs = _savedRecs || {}`** después de cualquier `JSON.parse` que pueda devolver null
- **Notas con prefijo del slot:** `wu-{dayId}-{idx}` warmup, `cd-{dayId}-{idx}` cooldown, `{exId}` principales
- **`_totalSetsFor(ex)` para iterar series** cuando un ejercicio puede tener `sides:2`
- **`_startCountdownThen` con `_ensureAudio()` previo** para setup con cuenta regresiva
- **`_phaseAdjustedRest()`** cuando el rest aplique fuera de SS (en `startRestInline`)
- **Inicializar `targetSecs` de time-based con `_deloadTimeVal(_tbDefaultSecs(e))`**
- **Llamar `_markPhaseResetDoneFor(exId)`** tras registrar serie con peso > 0
- **Preservar override explícito de `compound` en JSON** — helper solo escribe si `undefined`
- **`_referenceWeightFor(exId)`** para leer "peso de fuerza"
- **Pasar `d` a `resolveEx(entry, d)`** cuando estés en contexto de día
- **Renderizar `#wu-benefits`** solo si `kind ∈ {'warmup','iso'}` y existe `benefits`. En cualquier otro caso, `display:none`
- **Skip `_skipDynamic:true`** en navegación de warmup: último paso → `wuAdvance()`; intermedio → `S.wuStep++` + `saveSession('warmup')` + `renderWarmup()`. Limpiar timer con `_tbClear` antes de avanzar
- **`getResolvedRefForSlot(slotEntry)` para saber qué ejercicio está activo en un slot** — vale para warmup/workout/cooldown
- **`exRef` en cualquier log nuevo** (`toggleSet`, `toggleSetSS`, `_tawLoop`) leyendo `getResolvedRefForSlot(ex)?.ref`
- **`slotId` y `sets[].ref` en `exDetail` de `finishWorkout`** — shape `{slotId, name, sets:[{w,r,kind,ref}]}`
- **`_pkey('archived-swaps')`** para storage de swaps permanentes
- **`saveSession` después de cualquier mutación de `S.sessionSwaps`**
- **Resetear `S.sessionSwaps = {}` en arranque/fin/cancel de entreno y al cambiar de perfil**
- **`renderSwapBadgeInline(slotId, where)` en cualquier render que setee el header de un slot** — limpia stale aunque no haya swap
- **`renderSwapSectionInSheet(exId, ctx)` al abrir `exercise-edit-sheet`** — ya integrado en `openExerciseEditSheet`
- **Asignar `S.phase` explícitamente al transicionar a workout** (`wuAdvance`, `restoreSession`, `closeCardioModal`, post-cardio)
- **`_showSwapToast(msg, tone)` después de aplicar/revertir swap** — feedback visible en cualquier fase, especialmente warmup/cooldown
- **`getResolvedRefForSlot(slot)` ANTES de `getActiveVariant(slot)`** — el switch opera sobre el ejercicio resuelto (considera swap)
- **`variant` en cualquier log nuevo** (`toggleSet`, `toggleSetSS`, `_tawLoop`) leyendo `getActiveVariant(ex)?.variant.id`
- **`variant` por serie en `exDetail` de `finishWorkout`** — shape `{slotId, name, sets:[{w,r,kind,ref,variant}]}`
- **`_pkey('equipment')`** para el storage de modos de equipo
- **`_plateInfoFor(ex)`** para decidir la gráfica de discos y su base — fuente única desde v10 (no `_activeSlotIsBarbell`, no regex de nombre)
- **`_refIsSafeForProfile(ref)` antes de ofrecer un ref como destino de swap** (Lote 7) — mismo filtro `unsafeFor ∩ conditions` que las variantes. `getAvailableSwapsForSlot` separa estos en `blocked`, no en `pending`
- **`_barWeightForVariant(v)`** para el peso de la barra (sin variante → 20 · `barWeight` 0 → máquina de discos · Smith → el configurado)
- **`getSuggestedWeight` como única puerta de cualquier peso sugerido** (deja el número cargable). Orden de `_getSuggestedWeightRaw`: AMRAP → reinicio dl→acc → descarga → re-ancla de fase → doble progresión → rango del 1RM guardado (detalle en «Motor de peso»)
- **Leer `exDetail` como array y `s.w`** en `_referenceWeightFor` / lectura de historial (buscar por `slotId`)
- **Disparar `_maybeRecalcOrm`** tras registrar serie con peso en `toggleSet`/`toggleSetSS` (Epley, reps 3-7, solo sube, rechaza >15%, va a `orm-pending`) y **`_undoOrmPendingFor`** al desmarcarla
- **Promover `orm-pending` → `orm-current` solo en `startCycle`** y regenerar rangos con `_regenRangesFromOrm` + aviso `showConfirm`
- **`getCurrentWeek` por trabajo hecho** (entrenos+done+skip / días-semana, tope 7) como base de `_isDeload`/fase/peso
- **Limpiar `week-overrides`** en `startCycle`/`resetCycle`/`resetAllData`
- **`_persistWorkoutToHistory(opts)` para cualquier escritura nueva a `history`** — `opts.partial` marca `sess.partial` + `sess.completionPct`; `opts.endTs` fija el final real (usado en `elapsed` con clamp 1..240 min, y en `sess.id`/`sess.date`); `opts.loggedObj`/`opts.dayId` permiten persistir desde un `logged` restaurado de `b5-sess`
- **Tratar la ausencia de `partial`/`completionPct` en un registro de `history` como entreno COMPLETO** — retrocompat de los entrenos previos a 2026-08-26
- **`renderHome()` sale gratis con `showScreen('home')`** — la función ya lo llama al final (corrección 2026-08-26: la doc asumía que no)
- **`getAvailableVariantsForSlot(slot)` para la lista del switch UI** — filtra por `conditions` ∩ `unsafeFor` del perfil activo
- **`_applyVariantFicha` dentro de `resolveEx`** para que `form`/`errors` sigan a la variante de equipo activa
- **Unidad de peso según variante activa** (P4.3): par de mancuernas → "kg total" (con desglose ~X/mano; una sola mancuerna, sin desglose), máquina → "kg", barra/Smith → "kg barra". Aplica en tarjeta deload, sugerencia e historial
- **`_recentSessionsFor(slotId, opts)`** para cualquier lectura nueva del historial de un slot (`skipDeload:true` si es para progresar o estimar el 1RM)
- **Recordar el peso por ejercicio + equipo:** `exHistory[slotId]` y `_savedRecs[slotId]` guardan `ref` y `variant`; "Anterior" y "Rec. anterior" solo se muestran si coinciden con lo activo
- **`_progressStepFor(exId)`** como paso de progresión (5 con par de mancuernas, 2.5 el resto)

## Optimización de tokens
- Con **Claude Code** el ejecutor lee el HTML de su carpeta (ya NO se pega en el prompt). Las pistas de abajo sirven para **acotar el prompt** (en qué enfocar a Code) y como mapa del director.
- Si toca solo Workout → "Solo revisa DAYS, EX_CATALOG, ORM_DATA y funciones de workout."
- Si toca solo Perfiles → "Solo revisa PROFILES_DEFAULT, switchProfile, _pkey, _reloadProfileData."
- *(Legacy del dev-chat: "dame solo las secciones modificadas".)* Con Code se revisa el **diff**; ya no se pegan ni se devuelven archivos a mano.

## Flujo de trabajo (Claude Code) + Protocolo de cierre
El desarrollo se hace con **Claude Code** sobre el repo local; otro chat (el "director") entrega prompts autocontenidos — uno por tarea (= una sesión de Code). Code edita `index.html` en sitio; Braulio revisa el diff, sube con GitHub Desktop y prueba en device (cerrar/reabrir la PWA por el SW cache-first).

**Antes de editar:** la doc puede estar desactualizada. Confirma en el HTML real que lo que vas a tocar existe y se llama como crees. Si código y doc se contradicen, gana el **código** y se reporta (ha pasado: el SW que el HTML nunca registraba; la "nota de ejercicio" que era texto descriptivo).

**Al entregar:** cada cambio comentado en español (`// CAMBIO:` o `// FIX:`). Reporte breve: qué se tocó, qué datos viejos/perfil podría verse afectado, contradicciones doc↔código halladas.

**Protocolo de cierre (obligatorio):** cuando Braulio confirme que funcionó en device ("aprobado" o equivalente), la última respuesta DEBE ser el **Resumen para el director**, sin que lo pida (nunca antes de la validación). Braulio lo relaya al chat director, que con él actualiza CLAUDE.md / funciones.md / estado_actual.md. Estructura exacta:
```
Resumen para el director — [feature/fix]
[fecha] · VALIDADO en device por Braulio · [alcance: solo display / toca persistencia / migración: sí-no]

**Qué es:** [2-3 líneas: qué hace, qué reemplaza si aplica]

**Para CLAUDE.md:**
- [datos/campos/constantes nuevos en <script>, conteos actualizados]
- [correcciones a doc existente si hallaste contradicciones]
- [NUNCA/SIEMPRE nuevos sugeridos]

**Para funciones.md:**
- Nuevas: [nombre(args) → retorno, módulo]
- Modificadas: [nombre — qué cambió]
- NO documentar: [funciones de iteraciones intermedias eliminadas del código final]

**Para estado_actual.md:**
- [entrada de historial propuesta]
- [pendientes que cierran/abren, bugs nuevos hallados]
- [métricas: líneas, KB, conteos]
```
Reglas: solo hechos del código final entregado (intermedias solo en "NO documentar") · declara renombres/eliminaciones respecto al prompt original · reporta discrepancias doc↔código, no las corrijas por tu cuenta.

## Deploy
```
git add index.html && git commit -m "feat: X" && git push origin main
```
**Repo incluye además (G7): `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png`, `icon.svg`.** Si un cambio toca el service worker o el manifest, incluirlos en el `git add` (`git add index.html sw.js manifest.json`). **Regla de deploy (desde 2026-07-22):** CADA deploy sube `APP_BUILD.version` en `index.html` (hoy `v13 · 21 oct 2026 · 14:38`) **y** `CACHE_NAME` en `sw.js` (hoy `gym-braulio-v13`) — van juntos SIEMPRE, aunque el cambio no toque el SW. Si no, el SW sirve el shell cacheado viejo y la prueba en device es falsa. El número se ve en el home (tap = `buscarActualizacion()`) y en Config → App: es la única forma de confirmar qué build cargó el teléfono. El SW NO hace hot-swap: el SW nuevo queda en espera y toma control en la próxima apertura limpia (o cuando el usuario confirma fuera del entreno), por diseño, para no romper sesiones en curso.
**Commits solo de docs** (`CLAUDE.md`, `.gitignore`): no cambian la app → no suben versión. `CLAUDE.md` es público: nunca lleva datos personales (van en `CLAUDE.local.md`, ignorado).

## Política de modelo
Default Opus. Sonnet solo si Braulio lo pide. Razón: tareas usan contexto similar; Opus reduce iteraciones.
