---
name: gym-diseno
description: Sistema visual de la app GYM Braulio (maqueta 4.2 aprobada) — colores por tema y acento, letra, tamaños para tocar, íconos y componentes — y reglas para cambiar cómo se ve sin tocar la lógica. Úsala SIEMPRE antes de cambiar CSS, clases, estilos, HTML o funciones que pintan pantallas en index.html (rediseño 4.3 o cualquier cambio visual) y al revisar uno.
allowed-tools: Bash(node .claude/skills/gym-diseno/*)
---

# gym-diseno — cómo se ve la app

Braulio aprobó la maqueta 4.2 el 2026-10-24. Esta skill la convierte en reglas para Code:

- **`sistema.md`** — tokens de color (dos temas, cinco acentos), letra, formas, tamaños para tocar, íconos (`_icon`) y componentes con sus medidas.
- **`pantallas.md`** — qué cambia en cada pantalla, los estados que hay que revisar y el orden del rediseño (4.3).
- **`maqueta/`** — capturas de la maqueta a 390×844, en oscuro y en claro. Míralas antes de rehacer una pantalla.
- **`capturas.mjs`** — capturas de la app para comparar (ver «Verificar»).

Lo que esta skill no define (una pantalla sin diseño, un componente nuevo) no lo inventes: pregúntalo o repórtalo.

## Cuándo
- Antes de tocar el `<style>`, clases, atributos `style`, el HTML de una pantalla o una función que arma HTML (`render…`, `build…`, `…HTML`).
- En cada paso del rediseño 4.3 (ver `pantallas.md`).
- Al revisar un cambio visual, tuyo o ajeno.

## Reglas
1. **Solo presentación.** No cambies lógica: motor de peso, 1RM, fases, timers (descanso, plancha, calentamiento), contador de series, `S`, guardado, `history`, swaps, variantes, supersets, navegación ni ciclo. Si un cambio visual pide tocar lógica, detente y repórtalo.
2. **IDs y handlers intactos.** Antes de quitar o renombrar un `id`, una clase o un `onclick`, busca todos sus usos (`getElementById`, `querySelector`, `classList`, los `onclick` en el HTML y en los templates, `tools/`). Si cambia, cambian todos en el mismo diff. Los `el.style.display = …` que muestran u ocultan algo según el estado se quedan.
3. **Offline.** Nada externo: ni fuentes web, ni CDN, ni imágenes remotas. Letra del sistema e íconos SVG dentro del HTML (`_icon`, en `sistema.md`).
4. **Tokens, no colores sueltos.** En lo que hagas o rehagas, todo color sale de una variable CSS (`var(--…)`). Únicas excepciones: el color de cada día (`DAYS[].color`, viene de los datos) en su disco, y el negro del número sobre ese disco.
5. **El color del día solo identifica el día:** un disco con su número. Nunca pinta botones, ✓, el aro del descanso, barras de progreso, títulos ni texto. Lo que se toca o marca avance usa el acento (`--acc`, `--acc-fill` con `--acc-on`, `--acc-tint`). Las fases tampoco tienen color en la interfaz (`PHASES[].color` se queda en los datos).
6. **Dos temas, cinco acentos, tres tamaños de letra.** Todo se ve y se lee en oscuro y en claro, con cualquier acento (`b5-accent`) y con letra chica, normal o grande (`zoom: var(--fs-zoom)` en `body`). Medidas en px (el zoom las escala). En las pantallas de entreno el alto sale de `--app-vh` y `--nav-h` (`_syncNavHeight`): no uses `vh` suelto.
7. **Tamaño para tocar:** 44×44 como mínimo en todo lo que se toca; el ✓ de cada serie mide 48×48. Campos de peso y reps de 48 de alto con letra de 20. Un botón que solo tiene ícono lleva `aria-label`.
8. **Letra:** solo los tamaños de la escala (11 · 13 · 15 · 17 · 20 en campos · 22 · 28 · 56). Números con `var(--font-num)` en peso 800; el ancho fijo (`tabular-nums`) ya está en `body`.
9. **Textos:**
   - En español, con las excepciones de `CLAUDE.md` (Press, Curl, RDL…).
   - Mayúscula solo al inicio: nada de etiquetas o botones en MAYÚSCULAS ni `letter-spacing` de mayúsculas.
   - Sin «→» ni «▸» en botones: el ícono basta.
   - Cifras con `toLocaleString('es-MX')` y espacio antes de la unidad («12,450 kg», «15 s», «75–80 %»).
   - Rangos con guion largo al pintarlos («8–10»), sin tocar los datos.
   - Niveles P/I/A con palabras completas.
10. **Emojis solo para celebrar:** nuevo PR, 1RM actualizado y ciclo nuevo. Además se quedan el «⚠️» de la leyenda de riesgo (regla v14 de `CLAUDE.md`) y los íconos de `showConfirm` hasta que se diseñen los diálogos. Todo lo demás usa íconos de línea. Si una regla de `CLAUDE.md` fija un texto con emoji (p. ej. el badge «🔄 nuevo»), cámbialo por el ícono y dilo en el reporte.
11. **Estilos en clases.** Lo que rehagas queda en clases del `<style>`, no en `style="…"`. Inline solo para valores que vienen de datos: el color del día (`style="--day:#f97316"`) o anchos de progreso. Una clase por papel (título, cifra, tarjeta, fila…), no por valor. Reusa una clase existente solo si cumple el mismo papel en todos sus usos.
12. **Movimiento:** transiciones cortas (≤ 200 ms) y solo de `opacity`, `transform`, `background-color`, `color` o `stroke-dashoffset`; nunca `transition: all`. Con `prefers-reduced-motion: reduce`, sin animación.
13. **Siguen valiendo las reglas de `CLAUDE.md`:** `showConfirm` (nada de `alert`/`confirm`/`prompt`), la barra inferior no se bloquea en el entreno, `let`/`const`, nada de `console.log`, keys `b5-` con `_pkey`.

## Cómo trabajar un paso
1. Lee en `pantallas.md` la parte del paso y abre sus capturas en `maqueta/`.
2. Ubica en `index.html` el HTML de la pantalla y las funciones que la pintan. Anota los `id` y las clases que lee el JS.
3. Rehaz la presentación con los tokens y componentes de `sistema.md`. Si algo de la maqueta no existe en la app (o al revés), no lo inventes ni lo borres: repórtalo.
4. Recorre los estados de la pantalla (lista en `pantallas.md`): con y sin datos, los dos perfiles, superset, lados (`sides:2`), AMRAP, peso corporal, peso más tiempo, descarga, descanso corriendo y terminado.
5. Verifica (abajo) y sube `APP_BUILD.version` y `CACHE_NAME` juntos.

## Verificar
- `node tools/verificar.mjs` (skill `gym-verificar`), siempre. `node tools/simular-peso.mjs` solo aplica si tocaste algo de peso, y en un paso visual no deberías.
- **Capturas:** `node .claude/skills/gym-diseno/capturas.mjs` saca las pantallas clave a 390×844 en oscuro, en claro y con letra grande. Lista lo tocable que mide menos de 44 px y los errores de consola, y deja todo en una carpeta temporal con un `resumen.md`. Con `--ref HEAD` saca las de antes del cambio. Necesita Playwright: si no está (la PC de Braulio no lo tiene), **no lo instales**; di en el reporte que faltan las capturas y las saca el director.
- Compara tus capturas con `maqueta/`. Las diferencias que sean a propósito o inevitables, dilas en el reporte.
- Contraste mínimo: 4.5:1 en texto y 3:1 en contornos e íconos, en los dos temas. Los tokens ya cumplen; si usas un color fuera de ellos, mídelo.

## En el reporte
- Pantallas y estados que tocaste, y funciones que cambiaron.
- `id` o clases renombrados o eliminados, y dónde se actualizaron.
- Diferencias con la maqueta y por qué.
- Ruta de las capturas o «sin capturas: falta Playwright».
