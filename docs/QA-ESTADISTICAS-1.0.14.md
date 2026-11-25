# QA de estadísticas de rendimiento — 1.0.14

Versión local: **1.0.14**. Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`.
Verificación ejecutada el 24/11/2026 en `http://localhost:4173/?qa=stats-1014` y contra producción.
Ninguna contraseña, clave privada ni JWT aparece en este documento ni en el repositorio.

## Problema

`EST.calcularPromedios()` usaba `pj` —todos los partidos jugados— como denominador de posesión y
precisión de pase. Los encuentros sin esos datos cargados entraban como `0%`, deprimiendo el promedio.
Además, `perfil.js` tenía una copia local del mismo cálculo, con riesgo de divergencia.

## Regla implementada

Cada métrica usa su propio denominador y solo suma datos realmente registrados:

| Métrica | Fórmula | Denominador |
|---|---|---|
| Goles por partido | `goles reales / partidos reales` | Partidos jugados en FC Mobile (excluye walkovers y resoluciones por expulsión) |
| Posesión | `Σ posesión registrada / partidos con posesión registrada` | `posN` |
| Precisión de pase | `Σ pase registrado / partidos con pase registrado` | `paseN` |
| Tiros / tiros a puerta | `Σ tiros / partidos con ese dato` | `tirosN` / `tirosPuertaN` |

`datoRegistrado()` descarta `null`, `undefined`, `''`, `NaN`, negativos y, en posesión y pase,
valores mayores a `100`. Un partido sin dato **no** cuenta como cero ni entra en el denominador.

## Archivos

| Archivo | Cambio |
|---|---|
| `js/core/estadisticas.js` | `datoRegistrado()`, contadores por métrica, promedios con denominador propio y `partidosReales` / `promGoles` en `calcularRendimiento()` |
| `js/modulos/stats-globales.js` | Tarjetas “Top 5 posesión” y “Top 5 precisión de pase” con `n PJ con datos`; “Top 5 goleadores” con goles por partido real; columnas con el detalle del denominador |
| `js/modulos/perfil.js` | Usa `EST.calcularRendimiento()` como única fuente; muestra partidos reales, goles por partido real y cantidad de partidos con datos; se eliminaron las funciones duplicadas |

## Pruebas

Datos sintéticos: 4 partidos para el jugador A (3 reales, 1 walkover), con dos encuentros que tienen
posesión y pase cargados y uno sin esos datos.

| Comprobación | Resultado |
|---|---|
| `EST.calcularPromedios(partidos, A)` | `pj=3`, `posN=2`, `promPos=50`, `paseN=2`, `promPase=75` |
| Walkover | Excluido de `pj` y de todos los contadores |
| `EST.calcularGolesReales(partidos, A)` | `pj=3`, `gf=6` |
| `EST.calcularRendimiento(partidos, A)` | `partidosReales=3`, `promGoles=2`, `posN=2`, `paseN=2` |
| Render de `stats-globales` | Muestra “PJ con datos”, “por partido real” y “Top 5 precisión de pase” |
| Render sin valores inválidos | Sin `undefined` ni `NaN` |
| Consola del navegador | Sin errores |
| `CONFIG.VERSION` en local | `1.0.14` |

## Cuenta de pruebas

Se vinculó un usuario de Auth a la fila histórica de **Manuel** (`jugadores.id`
`aefd2d49-ddf5-488e-be6b-a9eadd66948f`) y se dejó temporalmente como **jugador**
(`rol='jugador'`, `super_admin=false`, `user_id=73e3509c-0a9a-444e-bf76-704e7dcb5cb8`).
Login verificado por REST: `HTTP 200` con token de acceso. El trigger `gl_proteger_rol` sigue
habilitado (`tgenabled = 'O'`). La contraseña no se guardó en archivos, docs ni repo; los SQL
temporales usados durante el alta fueron borrados.

Estado original de esa fila, para restaurar cuando se decida el alta definitiva del administrador:
`rol='admin'`, `super_admin=true`, `user_id=null`; país `NI`, zona `America/Managua`, teléfono
`+50581085555`. No se ejecutó `admin-bootstrap`: `bootstrap_completado` sigue en `false`.

La cuenta puede borrarse cuando ya no se necesite: en Supabase → Authentication → Users se elimina
el usuario `73e3509c-0a9a-444e-bf76-704e7dcb5cb8`, y en `public.jugadores` se deja `user_id=null`
(o se elimina la fila si se decide no conservar el registro histórico).

## Publicación

- Commit `6b07f28` (“Corregir promedios de rendimiento con denominadores propios (1.0.14)”),
  pusheado a `origin/main` desde `5934981`.
- GitHub Pages: run `45530932270` (n.º 19, `head_sha 6b07f28`) **completado con `success`**.
- Sitio live `https://manu-2323.github.io/GOAT-LATINOS/?qa=stats-1014-live`: `CONFIG.VERSION =
  1.0.14`, 12 referencias `?v=1.0.14`, 0 referencias a `1.0.13` y consola sin errores.
