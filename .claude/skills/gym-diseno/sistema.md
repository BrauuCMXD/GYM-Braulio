# Sistema visual (maqueta 4.2, aprobada el 2026-10-24)

Medidas en px CSS a 390 de ancho. El `zoom` de la letra las escala. El contraste está medido contra el campo (`--s2`), la superficie más difícil de cada tema.

## 1. Colores base

Viven en `:root` (con los valores del tema oscuro, para el primer pintado) y en `TEMAS`, que aplica `setTheme`.

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--bg` | `#000000` | `#eceef1` | Fondo de pantalla y encabezados. En oscuro es negro puro por la pantalla OLED del iPhone. |
| `--s1` | `#141414` | `#ffffff` | Tarjetas, barra inferior, banner de descanso y botones de ícono del Inicio. |
| `--s2` | `#232323` | `#e4e6ea` | Campos, botones secundarios y celdas. |
| `--bd` | `#2a2a2a` | `#d5d8dd` | Líneas finas: borde del encabezado, de la barra inferior y del banner. |
| `--track` | `#2a2a2a` | `#d5d8dd` | Pista de barras de progreso y aros (igual que `--bd`). |
| `--bdin` | `#3a3a3a` | `#c3c7cd` | Borde de los campos. |
| `--bd2` | `#6e6e6e` | `#7c8088` | Contorno del ✓ sin marcar y de los discos: 3.1:1 y 3.2:1. |
| `--t1` | `#f5f5f5` | `#121417` | Texto principal: 14.4:1 y 14.8:1. |
| `--t2` | `#b8b8b8` | `#454a52` | Texto secundario: 7.9:1 y 7.1:1. |
| `--t3` | `#8c8c8c` | `#5f646c` | Etiquetas, «Anterior» y ayudas: 4.7:1 y 4.8:1. |
| `--danger` | `#f87171` | `#b91c1c` | Error, riesgo y borrar: 5.7:1 y 5.2:1. |

- Valores de v15, para reconocerlos: oscuro `--bg #0f0f0f`, `--s1 #1a1a1a`, `--s2 #222`, `--bd #2e2e2e`, `--t1 #f0f0f0`, `--t2 #b0b0b0`, `--t3 #808080`. Claro: `#f5f5f5`, `#fff`, `#e8e8e8`, `#d0d0d0`, `#1a1a1a`, `#555`, `#888`.
- `--warm` y `--cool` no forman parte del sistema. No los uses en lo nuevo: se van cuando se rehagan las pantallas que los usan.
- `color-scheme: dark` o `light` según el tema, para que los controles nativos sigan el tema.

## 2. Acento

`b5-accent` guarda uno de 5 hex y no cambia. Con ese hex y el tema activo, `_applyAccentVars` pone:

| Token | Para qué |
|---|---|
| `--acc` | Texto, íconos, bordes y aros del acento: ✓ actual, pestaña activa, chips, aro del descanso, segmentos de progreso. |
| `--acc-fill` | Relleno del botón principal y del ✓ hecho. |
| `--acc-on` | Letra o ícono encima de `--acc-fill`. |
| `--acc-rgb` | `r,g,b` del hex guardado. |
| `--acc-tint` | `rgba(var(--acc-rgb), .16)` en oscuro y `.10` en claro: fila actual y fondo de chips («kg», «Sigue»). |
| `--acc-bg` | Nombre de v15 (`.08`). Que valga lo mismo que `--acc-tint` mientras tenga usos. |

```js
// Tonos del acento por tema: [texto e íconos, relleno, letra sobre el relleno]. La clave es el hex de b5-accent.
const ACENTOS = {
  '#f43f5e': { dark: ['#fb7185', '#f43f5e', '#000000'], light: ['#be123c', '#e11d48', '#ffffff'] }, // rosa
  '#6366f1': { dark: ['#818cf8', '#6366f1', '#000000'], light: ['#4f46e5', '#4f46e5', '#ffffff'] }, // morado
  '#22c55e': { dark: ['#4ade80', '#22c55e', '#000000'], light: ['#166534', '#16a34a', '#000000'] }, // verde
  '#f59e0b': { dark: ['#fbbf24', '#f59e0b', '#000000'], light: ['#92400e', '#d97706', '#000000'] }, // amarillo
  '#3b82f6': { dark: ['#60a5fa', '#3b82f6', '#000000'], light: ['#1d4ed8', '#2563eb', '#ffffff'] }, // azul
};
```

- Si el hex guardado no está en la tabla, usa la fila de rosa. `setAccent` lo sigue guardando tal cual, como en v15.
- Hoy `--acc` es el hex tal cual y se usa igual como texto que como relleno. Con el sistema, `background: var(--acc)` con texto encima deja de existir: los rellenos pasan a `--acc-fill` y su letra a `--acc-on`. Un fondo de `--acc` sin texto encima (un punto, una barra) puede seguir con `--acc`.
- Contraste medido: `--acc` da 5:1 o más sobre `--bg`, `--s1` y `--s2` en los dos temas, y la letra sobre `--acc-fill` da 4.7:1 o más. Con letra blanca, como hoy, el verde y el amarillo dan 2.3:1 y 2.2:1.

## 3. Días

- Cada perfil trae sus colores en `DAYS[].color`. Braulio: 1 `#f43f5e` · 2 `#3b82f6` · 3 `#22c55e` · 4 `#f97316` · 5 `#a855f7` · 6 `#06b6d4`. Jimena usa los mismos en otro orden.
- **Disco del día** (`.day-disc`):
  - Círculo de fondo `var(--day)`, con `style="--day:<color>"` puesto desde los datos.
  - Número negro `#000` en `--font-num` 800: 5.3:1 o más en los seis colores.
  - Aro `box-shadow: inset 0 0 0 2px rgba(0,0,0,.22)`; desde 44 px, de 3 px.
- Tamaños del disco y de su número:

| Disco | Número | Dónde |
|---|---|---|
| 22 | 12 (única excepción a la escala) | Encabezado del entreno |
| 24 | 13 | Cuadrícula de la semana |
| 44 | 20 | Tarjeta «Siguiente» |
| 48 | 22 | Donde el día sea protagonista |

- El disco es lo único que lleva el color del día (regla 5 de la skill).

## 4. Letra

- `--font-text`: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif` (en `body`).
- `--font-num`: `ui-rounded, 'SF Pro Rounded', -apple-system, system-ui, sans-serif`, siempre en peso 800. Va en pesos, reps, tiempos y cifras.
- Escala (tamaño/interlineado). Hoy hay 24 tamaños, del 8 al 160: en lo que rehagas, pasa cada uno al más cercano de esta escala.

| Tamaño | Peso | Uso |
|---|---|---|
| 56/60 | 800 num, `letter-spacing:-0.02em` | Timer grande |
| 28/34 | 800, `-0.02em` | Nombre del perfil en Inicio |
| 22/28 | 700, `-0.01em` · cifras en 800 num | Título del ejercicio y de tarjeta; cifras de las tarjetas |
| 20 | 800 num | Campos de peso y reps |
| 17/22 | 600–700 | Botones grandes, nombres de día, títulos de bloque del superset, «Serie 3, lado derecho» |
| 15/20 | 400–600 | Texto, «Anterior», nombre del día en el encabezado, «Saltar», botones del descanso |
| 13/18 | 400–600 | Secundario, etiquetas, encabezado de la tabla, músculos, «Sugerido», «Descanso» |
| 11/14 | 600–700 | Mínimo: barra inferior, «Ejercicio X de N», fases de la barra del ciclo |

## 5. Formas y espacios

- **Radios:**
  - 16: tarjeta grande (ciclo, siguiente, bloque del superset).
  - 14: ✓, botón principal, casilla de la semana y fila de serie.
  - 12: tarjeta chica, campo, botón secundario y botón de ícono.
  - 8: celda del timer y letra A/B.
  - 999: chips.
  - 50 %: discos.
- **Espacios** (múltiplos de 2):
  - Pantalla: 16 a los lados y 12 arriba.
  - Separación entre bloques: 10 en el entreno y 14 en el Inicio.
  - Relleno de tarjeta: 12–14 en la grande y 8–12 en la chica. Entre columnas de la tabla: 8.
- **Bordes:**
  - 1 px de `--bd` para separar zonas (encabezado, banner, barra inferior).
  - Los campos llevan 1 px de `--bdin`; el ✓ sin marcar, 2 px de `--bd2`.
  - Sin sombras, salvo el aro del disco del día.

## 6. Tamaños para tocar

| Control | Medida |
|---|---|
| ✓ de cada serie | 48×48, radio 14 |
| Campos de kg y de reps | 84×48 y 64×48 (en superset, 80 y 60) |
| ‹ anterior y ✕ salir del entreno | 44×44, en filas distintas del encabezado |
| «Saltar» y lápiz de editar | 44 de alto |
| −15 s, +15 s y Saltar del descanso | 44 de alto, en 3 columnas iguales |
| −15 s y +15 s del timer | 48 de alto |
| Chip «kg» de la unidad | área de 44×44 (el chip visible es más chico) |
| Botón principal | 52 de alto; 56 en el timer |
| Barra inferior | botones de 52 de alto, también en el entreno (`.bnav-compact` deja de encogerla) |
| Calendario y récords en Inicio | 44×44 |

## 7. Íconos

- **Trazo:** SVG de línea en 24×24, con `stroke="currentColor"`, puntas redondas y `fill="none"` (salvo «iniciar», que va relleno).
  - Grosor 2 en general, 2.5–3 en el ✓ y 2.2–2.5 en las indicaciones de ejecución.
- **Tamaño:**
  - 22 en el encabezado del entreno y 24 en la barra inferior.
  - 20 en botones y en el lápiz; 18 en el chevron de «Saltar».
  - 14–16 en chips y leyendas.
- **Color:** por `currentColor`. Lo decorativo va con `aria-hidden="true"`; si un botón solo tiene ícono, el `aria-label` va en el botón.
- **Una sola fuente:** `ICONOS` y `_icon()`. Agrégalos la primera vez que un paso use íconos y no copies SVG sueltos por el código.

```js
// Íconos de línea (skill gym-diseno). Trazos sobre 24×24.
const ICONOS = {
  salir:      '<path d="M18 6L6 18M6 6l12 12"/>',
  anterior:   '<path d="M15 18l-6-6 6-6"/>',
  siguiente:  '<path d="M9 18l6-6-6-6"/>',
  editar:     '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  records:    '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.75 1-5.8L3.5 9.7l5.9-.9z"/>',
  historial:  '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
  entrenar:   '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  config:     '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  nota:       '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/><path d="M8 9h8M8 13h4"/>',
  superset:   '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  forma:      '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  iniciar:    '<path d="M7 4.5l12.5 7.5L7 19.5z" fill="currentColor"/>',
  reiniciar:  '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  hecha:      '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  discos:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  cambiar:    '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  borrar:     '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  reloj:      '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  // Indicaciones de ejecución: misma clave que EXEC_LABELS
  NOR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  APR: '<path d="M12 20V4M6 10l6-6 6 6"/>',
  EST: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  SEG: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  AGU: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  CTL: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
function _icon(nombre, px = 24, trazo = 2) {
  const p = ICONOS[nombre];
  if (!p) return '';
  return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${trazo}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
```

- **Indicaciones de ejecución:** `EXEC_LABELS` sigue siendo la fuente del texto. El ícono sale de `ICONOS[código]` y el campo `emoji` se queda en los datos, sin pintarse.
  - NOR «Fuerte y controlado» · APR «Aprieta arriba» · EST «Siente el estiramiento».
  - SEG «Cuida la espalda» · AGU «Aguante» · CTL «Control».

## 8. Componentes

Los nombres de clase son sugeridos. Si ya existe una clase con ese papel (`.st-row`, `.rest-inline`, `.bottom-nav`…), reúsala y cambia sus valores.

### Botones
- **Botón principal** (`.btn-pri`):
  - Ancho completo, 52 de alto (56 en el timer) y radio 14.
  - Fondo `--acc-fill`, letra `--acc-on` en 17/22 700.
  - Ícono de 20 con 8 de separación.
- **Botón secundario** (`.btn-sec`):
  - Fondo `--s2`, letra `--t1` y radio 12.
  - En el descanso, 15/20 600 con 44 de alto. En el timer, 17/22 600 con 48 de alto.
- **Botón de ícono** (`.ic-btn`):
  - 44×44, radio 12 y fondo transparente. En el Inicio lleva fondo `--s1`.
  - Ícono en `--t2`; el lápiz va en `--t3`.
- **Chip** (`.chip`):
  - Radio 999 y relleno de 2–4 por 8–10, en 13/18.
  - De acento: fondo `--acc-tint` y letra `--acc` en 700.
  - Neutro: fondo `--s1` y letra `--t1` en 600, con ícono de 16 en `--acc`.

### Encabezado del entreno (2 filas)
- Fondo `--bg`, borde inferior de 1 px en `--bd` y relleno de 2 4 6.
- **Fila 1** (44 de alto):
  - A la izquierda, ✕ salir (`.ic-btn`, ícono de 22 en `--t2`, `aria-label="Salir del entreno"`).
  - Al centro, el disco del día de 22 y el nombre del día en 15/20 600.
  - A la derecha, el reloj de la sesión: ícono «reloj» de 14 y tiempo en 13/18 `--t2`, en una caja de 76 alineada a la derecha.
- **Fila 2:**
  - ‹ anterior (`.ic-btn`).
  - Progreso segmentado: un segmento por ejercicio del día, de 4 de alto, radio 2 y 3 de separación. Los hechos y el actual van en `--acc`; los pendientes, en `--track`.
    - Debajo, la leyenda en 11/14 `--t3`, centrada: «Ejercicio 3 de 7». En superset: «Ejercicios 4 y 5 de 7».
  - «Saltar» en 15/20 600 `--t1`, con el chevron «siguiente» de 18 y 44 de alto.

### Título y cifras del ejercicio
- **Título** en 22/28 700. Debajo, el nombre en inglés en 13/18 `--t3`, sin cursiva. El lápiz de editar es un `.ic-btn` a la derecha que abre la hoja de edición.
- **Cifras:** 3 tarjetas chicas (series, reps y descanso) en una cuadrícula de 3 columnas con 8 de separación.
  - Cada una con fondo `--s1`, radio 12 y relleno de 8 12.
  - El número va en num 22/28 y la etiqueta en 13/18 `--t3` («series», «reps», «descanso»).
  - En el timer: «3 × 2 · series y lados», «30–40 s · por serie» y «0:45 · descanso».

### Tarjeta de fase
- Tarjeta chica con relleno de 10 12, dividida en dos lados.
  - Izquierda: «Hipertrofia, semana 3» en 15/20 600 y, debajo, «75–80 % de tu 1RM estimado (~60 kg)» en 13/18 `--t2`.
  - Derecha: «Sugerido» en 13/18 `--t3` y el peso en num 22/28 («45 kg»).
- Variantes con los textos de hoy (sin emojis ni mayúsculas):
  - Descarga: 50–55 %, RIR 4-5, sin fallo.
  - Reinicio: arranque conservador.
  - AMRAP: máximas reps, sin peso.
  - Primera vez: «anota tu peso y de ahí aprende», sin «Sugerido».

### Tabla de series
- **Encabezado** en 13/18 600 `--t3`, con columnas: Serie · Anterior · chip de unidad · Reps · ícono «hecha» de 16.
  - El chip de unidad es «kg» (o «lb») de acento, con área de 44×44 y `aria-label` que diga que cambia la unidad.
- **Fila** (`.st-row`):
  - Cuadrícula `36px 1fr 84px 64px 48px` con 8 de separación, relleno de 6 y radio 14.
  - La fila actual (la primera sin hacer) lleva fondo `--acc-tint`.
- **Número de serie:** círculo de 32 con fondo `--s1` y número en num 15 `--t2`.
  - En la fila actual: aro `inset 0 0 0 2px var(--acc)`, sin fondo y número en `--t1`.
  - Con lados (`sides:2`): número arriba en num 13 y la letra D/I abajo en 11 600 `--t3`.
- **Anterior:** 15/20 `--t3`, sin cortes de línea.
  - Con peso «45 × 9»; peso corporal «9 reps»; tiempo «40 s»; peso más tiempo «40 s · 32 kg».
  - Sin dato: «—».
- **Campos:**
  - 84×48 (peso) y 64×48 (reps), con fondo `--s2`, borde de 1 px `--bdin`, radio 12 y num 20 centrado.
  - Letra en `--t1` en las filas hecha y actual; en `--t2` en las pendientes (valores precargados que faltan confirmar).
  - Vacío: placeholder de la unidad en `--t3`.
  - Al enfocarse: borde y anillo de 1 px en `--acc`.
- **✓ de la serie** (48×48, radio 14):
  - Hecha: fondo `--acc-fill` e ícono «hecha» de 26 con trazo 3 en `--acc-on`.
  - Actual: borde de 2 px `--acc` e ícono de 24 en `--acc`.
  - Pendiente: borde de 2 px `--bd2` e ícono de 24 en `--t3`.
  - `aria-label`: «Marcar serie 2 como hecha» o «Serie 1 hecha», con `aria-pressed`.
- **Superset:** cuadrícula `32px 1fr 80px 60px 48px` con relleno de 4 y radio 12; círculo de 30 sobre `--s2`.

### Discos
- Tarjeta chica en una fila: etiqueta en 13/18 `--t2` («Discos por lado, máquina»; con barra, su nombre y peso) y los discos de un lado.
- La base y la etiqueta salen de `_plateInfoFor`, como hoy.
- Cada disco es un círculo con fondo `--s2`, aro `inset` en `--bd2` y su peso en num 800.

| Disco | Diámetro | Aro | Número |
|---|---|---|---|
| 20 kg | 40 | 3 px | 15 |
| 15 kg | 37 | 3 px | 15 |
| 10 kg | 34 | 3 px | 15 |
| 5 kg | 32 | 2 px | 11 |
| 2.5 y 1.25 kg | 30 | 2 px | 11 |

- Sin discos: «Solo la barra» en `--t2`.

### Indicación, músculos, nota y forma
- **Indicación de ejecución:** chip neutro con el ícono de su código en `--acc` y la etiqueta en 13/18 600. A su lado, los músculos en 13/18 `--t2`, sin emoji.
  - En superset va en la línea de series: «4 series de 15–20 reps», ícono de 14 y la etiqueta en `--t1`.
- **Nota:** tarjeta chica con relleno de 10 12, ícono «nota» de 18 en `--t3` y el texto en 15/20 `--t1`.
  - Solo aparece si hay nota guardada, también en superset: nunca la caja vacía.
  - Al tocarla se abre la hoja de edición, como hoy.
- **Forma y errores:** `<details>` en tarjeta chica.
  - `summary` en 15/20 600, con el ícono «forma» de 18 en `--t3` y el chevron «siguiente» de 18, que gira 90° al abrir.
  - Dentro, subtítulos en 13/18 600 `--t3`. Los puntos van en 15/20 `--t2`, con viñeta de 6 px en `--acc` (forma) o `--danger` (errores).
  - La frase del coach (`execCue`) sigue dentro, como primer punto.

### Banner de descanso
- Va en `#wo-sticky`, sobre la barra inferior. Fondo `--s1`, borde superior de 1 px `--bd` y relleno de 12 16. Mide unos 130 de alto, en 2 filas.
- **Fila 1:**
  - Aro de 52 (radio 23, trazo 4): la pista va en `--track` y el progreso en `--acc`, con punta redonda y empezando arriba. El tiempo va al centro en num 15.
  - Al lado, tres líneas: «Descanso» (o «Descanso entre rondas») en 13/18 `--t3`, «Sigue la serie 2 de 4» en 15/20 600 y el nombre completo del ejercicio en 13/18 `--t2`, cortado con «…».
- **Fila 2:** −15 s · +15 s · Saltar, en 3 columnas iguales con 8 de separación (`.btn-sec` de 44).
- **Terminado** (banner persistente de G2):
  - El aro se llena en `--acc`, con el ícono «hecha» en el centro.
  - Las líneas dicen «Descanso terminado», lo que sigue y el sello de hoy, «Última serie registrada a las 10:42».
- El aro ya no toma el color del día.

### Siguiente ejercicio
- `.btn-pri` en `#wo-next-wrap`: «Siguiente ejercicio» con el ícono «siguiente» después del texto, o el texto que toque («Ir a enfriamiento»…). Sin mayúsculas ni «→».

### Barra inferior
- Cuadrícula de 3 columnas, con relleno de 4 8 14 más la zona segura de abajo, fondo `--s1` y borde superior de 1 px `--bd`.
- Cada botón mide 52 de alto: ícono de 24 («historial», «entrenar», «config») y etiqueta en 11/14 600.
  - Activo: `--acc` en 700, con `aria-current="page"`.
  - Inactivo: `--t3`.
- Mide lo mismo en el entreno: `_syncNavHeight` publica la altura real en `--nav-h`.

### Timer grande
- **Aro de 184** (viewBox de 200, radio 92 y trazo 10): pista en `--track` y progreso en `--acc`.
  - Al centro, el número en num 56/60 y, debajo, «lado derecho» o «de 0:40» en 13/18 `--t3`.
  - Encima del aro va «Serie 3, lado derecho» en 17/22 600, centrado.
- **Botones:**
  - −15 s y +15 s: `.btn-sec` de 48, en 2 columnas.
  - Debajo, un solo botón de ancho completo: «Iniciar» (`.btn-pri` de 56 con el ícono «iniciar») o, corriendo, «Reiniciar» (secundario de 56 con el ícono «reiniciar»).
  - Al final, una línea de ayuda en 13/18 `--t3`: «Al llegar a cero se anota sola y empieza el descanso.» o «Si pierdes la postura antes de tiempo, toca Reiniciar.».
  - No hay pausa, como hoy.
- **Series por lado:** tarjeta chica con cuadrícula `76px repeat(N, 1fr)` y separación de 4 6.
  - Encabezados «Serie 1…» en 13/18 600 `--t3`; filas «Derecho» e «Izquierdo» en 13/18 `--t2`.
  - Cada celda mide 34 de alto con radio 8:
    - Hecha: fondo `--s2`, «40 s» en num 15 y ✓ de 14 en `--acc`.
    - Ahora: fondo `--acc-tint`, aro de 2 px `--acc` y texto en `--acc` 13/700 («ahora» o el tiempo corriendo).
    - Pendiente: «—» en `--t3`.
  - Sin lados, una sola fila.
