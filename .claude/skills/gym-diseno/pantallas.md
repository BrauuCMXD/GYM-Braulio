# Pantallas y orden del rediseño (4.3)

Capturas de la maqueta en `maqueta/` (390×844, DPR 2):
- `inicio-*`, `entreno-*` y `superset-*`.
- `timer-listo-*` y `timer-corriendo-*`.

Cada una existe en `-oscuro` y en `-claro`. Los datos de las capturas son de ejemplo.

## Orden
Va un prompt por paso. Cada paso sube versión y deja la app usable en los dos temas.

1. **Base, en toda la app y sin mover nada de lugar.** La paleta cambia y ningún elemento cambia de sitio.
   - Tokens nuevos en `:root` y `TEMAS`.
   - Acento por tema en `_applyAccentVars`: todos los rellenos de acento pasan a `--acc-fill` con `--acc-on`.
   - Pilas `--font-text` y `--font-num`.
   - `color-scheme` y `<meta name="theme-color">` según el tema.
   - Los colores fijos que rompen el tema claro (A5 de la auditoría: la tarjeta «Ciclo no iniciado», el ✓ sin marcar, la nota ámbar y el tag de PR) pasan a tokens.
2. **Entreno, serie por serie:**
   - Encabezado de 2 filas, título y cifras, tarjeta de fase, tabla, discos, indicación, nota y «Forma y errores».
   - Banner de descanso y botón «Siguiente ejercicio».
   - La barra inferior (sin `.bnav-compact`) e `ICONOS`/`_icon`.
3. **Superset y biserie.**
4. **Timers:** `renderWorkoutHold`, `renderPhaseTimer` y `renderHoldTracker`, con `renderTimeAndWeightTable` en el mismo lenguaje. El encabezado de 2 filas pasa también a calentamiento y enfriamiento.
5. **Inicio.**
6. **Config:** llega «Borrar todo» y se rehacen los selectores de tema y acento.
7. **Lo que falta diseñar:** el director lo diseña con este sistema antes de su prompt (lista al final).

La maqueta proponía un paso 0 sin cambio visual: pasar los 815 `style=` a clases. Se hace dentro de cada paso: cada pantalla pasa sus estilos a clases cuando se rehace, así cada estilo se toca una sola vez.

## Inicio (paso 5)
Maqueta: `inicio-oscuro.png` y `inicio-claro.png`. Funciones: `renderHome` y `renderProgressionBanner` (`fmtVolShort` ya quedó bien en v15).

**Encabezado:**
- Rutina en 13/18 600 `--t3`, en frase: «Rutina PPL × 2» o «Tu rutina» (hoy `#home-header-rutina` las pone en mayúsculas).
- Nombre del perfil en 28/34 800.
- La maqueta no muestra la línea de edad, peso y grasa (`#home-header-sub`). Antes de quitarla, pregúntale al director.
- Versión tocable en 13/18 `--t3` con 44 de alto: «v15 del 24 oct», de `APP_BUILD`. Al tocarla, `buscarActualizacion()`.
- A la derecha, calendario y récords (`.ic-btn` sobre `--s1`).
- «Borrar todo» sale de aquí y pasa a Config (paso 6). Hasta entonces se queda.

**Tarjeta del ciclo** (tarjeta grande):
- «Ciclo de progresión» en 13/18 600 `--t3` y «Semana 3 de 7» en 13/18 `--t2`.
- La fase en 22/28 700 y «8–10 reps al 75–80 % de tu 1RM» en 15/20 `--t2`.
- Barra de 7 segmentos agrupados por fase (cuadrícula `2fr 3fr 1fr 1fr` con 6 de separación). Cada segmento mide 8 de alto con radio 4 y 4 de separación:
  - Hechos en `--acc` y pendientes en `--track`.
  - La semana actual se llena en proporción a los días hechos.
  - Debajo, el nombre de cada fase en 11/14: la actual en `--t1` 700 y las demás en `--t3`.
- Sin ciclo iniciado: la tarjeta invita a iniciarlo (`.btn-pri`), sin el fondo fijo `#22222233`.

**Tarjeta «Siguiente»** (tarjeta grande):
- Disco del día de 44, «Siguiente, día 4» en 13/18 600 `--t3` y el nombre del día en 22/28 700.
- Resumen en 15/20 `--t2`: «Hombros, pecho y tríceps. 7 ejercicios con 2 supersets y cardio al final.».
- Botón principal «Abrir el día 4», que abre el día como hoy.

**Esta semana:**
- «Esta semana» en 13/18 600 `--t3` y «3 de 6 hechos» en 13/18 `--t2`.
- Cuadrícula de 2 columnas con 10 de separación. Cada casilla es un `<button>` sobre `--s1` con radio 14, relleno de 12 y 72 de alto mínimo.
  - Primera línea: disco de 24, nombre en 17/22 600 (cortado con «…») y, si está hecho, ✓ de 18 en `--acc`.
  - Segunda línea, en 13/18 `--t2`: «12,450 kg el lunes» si está hecho; si no, el número de ejercicios.
  - El siguiente lleva aro `inset 0 0 0 2px var(--acc)` y el chip de acento «Sigue».
  - El foco del día ya no sale aquí.

**Estados:**
- Ciclo sin iniciar, en curso (semanas 1 a 7) y en descarga.
- Días hechos, saltados (marca manual) y pendientes.
- Día vacío, que bloquea «Entrenar».
- Perfil Jimena.
- Letra grande.

## Entreno, serie por serie (paso 2)
Maqueta: `entreno-oscuro.png` y `entreno-claro.png`.
Funciones: `renderWorkout`, `renderSetTable`, `_execBlockHTML`, `renderPlateCalc` y `_renderPlateCalcFor`, `startRestInline` y `updateRestInlineUI`, `showScreen` (barra inferior), y el HTML de `#screen-workout` y `#bottom-nav`.

Orden de arriba abajo:
1. Encabezado de 2 filas.
2. Título y nombre en inglés.
3. Cifras.
4. Tarjeta de fase.
5. **Tabla de series.**
6. Discos.
7. Indicación y músculos.
8. Nota.
9. «Forma y errores».
10. Abajo, fijos: el banner de descanso o «Siguiente ejercicio», y la barra inferior.

Hoy la nota y «Forma y errores» van antes de la tabla: la tabla sube.

Detalles:
- El título ya no toma el color del día.
- El ✓ hecho ya no se rellena con el color del día, y el aro del descanso tampoco: los dos usan el acento.
- Badges junto al nombre (`#wo-swap-badge`, `#wo-equip-badge`): chips neutros de 13/18. El de riesgo lleva la letra en `--danger`. Se pintan con las mismas funciones de hoy (`renderSwapBadgeInline`, `renderEquipmentBadgeInline`).
- El tag de PR: chip de celebración (aquí sí va el emoji ⭐), legible en los dos temas.
- «Rec. anterior» (`#wo-prev-rec`) no sale en la maqueta. No lo quites: ponlo como una línea de 13/18 `--t2` dentro de la tarjeta de fase o justo debajo, y dilo en el reporte.
- El recordatorio de agua y el toast de swap se quedan como están hasta que se diseñen; solo cambian a tokens si el paso 1 no lo hizo ya.

**Estados:**
- Ejercicio con peso; primera vez (sin registros: campo vacío y «primera vez»).
- Con discos: barra, Smith y máquina de discos.
- Par de mancuernas («kg total» o «kg (par)»), peso corporal y AMRAP (Jimena 5-5).
- Lados con peso (Jimena 1-3 y 6-3, búlgara) y peso más tiempo (Braulio 5-8, caminata de granjero).
- Descarga y reinicio.
- Swap activo y variante riesgosa.
- Con y sin nota.
- Descanso corriendo y terminado.
- Todas las series hechas («Siguiente ejercicio»).

## Superset y biserie (paso 3)
Maqueta: `superset-oscuro.png` y `superset-claro.png`. Funciones: `renderSupersetWorkout` y `buildSSTable`.

**Arriba:** ícono «superset» de 20 en `--t2`, con dos líneas:
- «Superset, ronda 2 de 4» en 15/20 600.
- Las reglas de descanso en 13/18 `--t2`, sacadas de `getSupersetConfig`:
  - Superset: «15 s entre A y B, 60 s entre rondas».
  - Biserie: «sin descanso entre A y B, 45 s entre rondas».

**Bloques A y B:** tarjeta grande con relleno de 12.
- La letra va en un cuadro de 28 con radio 8, sobre `--s2`, en 15/800.
- El nombre va en 17/22 700.
- Debajo, «4 series de 15–20 reps» y la indicación (ícono de 14 en `--acc` y etiqueta en `--t1`).
- A la derecha, el lápiz (`.ic-btn`, `aria-label="Editar <nombre>"`).
- Después, la tabla compacta: con par de mancuernas, el encabezado dice «kg (par)».

**Banner:** «Descanso entre rondas» o «Descanso» según toque, y «Sigue A, serie 2 de 4».

Reglas:
- Sin la caja «MI NOTA · Tap para agregar» cuando no hay nota.
- Sin el nombre en inglés del ejercicio anterior.
- La leyenda de riesgo sigue bajo el nombre (`_ssRiskNoteHtml`).

**Estados:**
- Superset normal: 15 s y 60 s.
- Biserie: 0 s y 45 s.
- Par no adyacente (3-4 con 3-7, 6-5 con 6-7).
- Biserie con tiempo y lados (6-8 con 6-9, plancha lateral).
- Discos dentro del superset.
- La última ronda.

## Timers (paso 4)
Maqueta: `timer-listo-*` y `timer-corriendo-*`. Funciones: `renderWorkoutHold` (plancha y holds del entreno), `renderPhaseTimer` y `renderHoldTracker` (calentamiento y enfriamiento), y `renderTimeAndWeightTable`.

- Orden de arriba abajo:
  1. Encabezado.
  2. Título, con la indicación junto al nombre en inglés.
  3. Cifras: «3 × 2 · series y lados», «30–40 s · por serie» y «0:45 · descanso».
  4. Cuadrícula de series por lado.
  5. Abajo, el timer: «Serie 3, lado derecho», aro de 184, −15 s y +15 s, «Iniciar» o «Reiniciar», y la línea de ayuda.
- La cuenta regresiva 3-2-1 (`#countdown-overlay`) se queda como está: falta diseñarla.
- `renderTimeAndWeightTable` (peso más tiempo) usa los mismos campos y el mismo timer.
- **Estados:** listo, corriendo y terminado; con y sin lados; paso de calentamiento con tiempo y sin él (reps); descarga (tiempo al 70 %).

## Config (paso 6)
- Llega «Borrar todo», con su confirmación de siempre (`resetAllData`).
- Selectores de tema y acento: cada opción con 44 de alto. Los puntos de acento muestran el relleno (`--acc-fill`) de su fila en el tema activo.
- El resto de Config usa los componentes del sistema; no cambia qué se guarda.

## Falta diseñar
El director lo diseña antes de su prompt. Mientras tanto, estas pantallas solo reciben los tokens del paso 1:
- Pantalla del día (`openDay`).
- Calentamiento y enfriamiento con repeticiones.
- Historial y detalle de un entreno.
- Calendario y récords.
- Hoja de edición (equipo, nota y cambio de ejercicio).
- Diálogos (`showConfirm`), toasts y recordatorio de agua.
- Cuenta regresiva.
- Modal de cardio y «Análisis de la sesión».
- La barra de estado del iPhone en tema claro: `apple-mobile-web-app-status-bar-style` solo se lee al abrir la app.

## Imágenes de ejercicios (paso 4.4, cuando lleguen)
- Miniatura de 56×56 con radio 12 a la izquierda del título en Entreno, Timer, Calentamiento y Enfriamiento.
- De 44×44 en cada bloque del superset, con su letra encima.
- De 40×40 en las listas de cambio de ejercicio y de equipo.
- Al tocarla se abre «Forma y errores» con la imagen a todo lo ancho.
- **Sin imagen no queda hueco:** la pantalla se ve como en la maqueta.
- Archivos en `img/ex/<id>.webp`, lista `EX_FOTOS` y la imagen del ejercicio resuelto (respeta los swaps).
- Caché propia en el SW (`gym-braulio-img`), que no se borra al subir de versión.
- Lo integra un prompt propio, después del piloto.
