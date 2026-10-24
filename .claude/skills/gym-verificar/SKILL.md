---
name: gym-verificar
description: Revisa un cambio a la app GYM Braulio antes de entregarlo — sintaxis de index.html y sw.js, versión (APP_BUILD = CACHE_NAME), catálogo y rutinas, reglas del código y simulación del motor de peso. Úsala SIEMPRE antes de mostrar el diff final de un cambio a index.html, sw.js o manifest.json, y cuando pidan verificar, revisar que no se rompió nada o el Resumen para el director.
allowed-tools: Bash(node tools/*)
---

# gym-verificar — revisar antes de entregar

La app es un solo `index.html` sin build ni tests automáticos. Esta skill es la red de seguridad: dos scripts de Node sin dependencias que **solo leen** el repo. Los corre Code antes de entregar y el director para comprobar.

## Cuándo
- Antes de mostrar el diff final de cualquier cambio a `index.html`, `sw.js` o `manifest.json`.
- Cuando el usuario o el director pidan verificar.
- Al armar el **Resumen para el director**: las métricas salen de aquí.

## Cómo (desde la raíz del repo)
1. `node tools/verificar.mjs` — siempre.
2. `node tools/simular-peso.mjs` — además, si el cambio toca peso sugerido, 1RM, fases o deload, doble progresión, swaps, variantes de equipo, discos y barras, o el historial (`history`, `exHistory`, `_savedRecs`).
3. Lee la última línea:
   - `RESULTADO: OK …` → entrega y pega el resumen en tu reporte.
   - `RESULTADO: FALLA …` → corrígelo antes de entregar. Para saber si la falla ya estaba antes de tu cambio, corre el mismo script con `--ref HEAD` (revisa el último commit sin tocar tus archivos). Si ya estaba, repórtala como preexistente y no la arregles sin permiso.

## Reglas
- Los scripts no escriben archivos ni usan red. No los cambies para que un chequeo pase.
- Si una regla cambió de verdad (decisión de Braulio o del director), actualiza el chequeo en el mismo cambio y dilo en el reporte.
- Si cambias el modelo de datos (campo o regla nueva), agrega su chequeo a `tools/verificar.mjs`.
- Si cambias a propósito el comportamiento del motor de peso, actualiza los valores esperados de `tools/simular-peso.mjs` en el mismo cambio y explica por qué cambian.
- Versión: si `index.html`, `sw.js` o `manifest.json` cambiaron respecto al último commit, `APP_BUILD.version` y `CACHE_NAME` suben juntos. El chequeo de versión falla si no.
- Para simular un ejercicio hay que abrir su día (`S.dayId`): el motor resuelve el slot con `_slotEntryFromExId`, que depende de `day()`.

## Qué revisa
- **verificar.mjs:** sintaxis · que la app cargue en un DOM de mentira sin `console.error` · versión · catálogo (refs, swaps, variantes, discos, `unsafeFor`, `execLabel`, `primaryMuscle`) · rutinas (slots, supersets, hermanos) · `ORM_DATA` sin 1RM · `COMPOUND_NAMES_EN` · reglas (`var`, `alert`/`confirm`/`prompt`, URLs externas, keys `b5-`) · métricas.
- **simular-peso.mjs:** Press Banca por fases (incluido el bug viejo del deload a 57.5), doble progresión, swaps y variantes sin registros, par de mancuernas, máquina de discos, Smith configurable, bootstrap y "deshacer" del 1RM de Jimena, y un ciclo de 7 semanas en lazo cerrado.

## En el Resumen para el director
Agrega una línea:
`**Verificación:** verificar OK (N chequeos, M avisos) · simular-peso OK (N escenarios) · vNN · L líneas · F fichas · V variantes`
