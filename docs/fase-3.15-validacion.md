# FASE 3.15 — Auditoría, corrección y renovación del módulo Resultados

## Alcance

Trabajo realizado en `main`, sin ramas, sin migraciones SQL, sin cambios de RLS/permisos/RPC, sin datos ficticios o reales de producción y sin modificar reglas del torneo. La corrección se limita al cliente (`js`/`css`) y al arnés de pruebas. Se conservan identificadores, `data-*` y rutas existentes para no romper integraciones.

## Auditoría previa (antes de tocar código)

Se revisaron `js/modulos/resultados.js`, `js/core/gl.js`, `js/core/config.js`, `js/core/clasificacion.js`, `js/core/estadisticas.js`, `js/modulos/fixture.js`, `js/modulos/calendario.js`, `js/modulos/inicio.js`, CSS 3.7, tests, E2E y el contrato desplegado de `gl_guardar_resultado_interno` documentado en `docs/fase-3.12-auditoria-funcional.md`. Una auditoría paralela independiente confirmó los hallazgos y aportó adicionales.

Hallazgos corregidos en esta fase:

- `Number(valor) || 0` convertía vacíos/inválidos en `0`; los pendientes se precargaban como `0-0`.
- `validarStats()` aceptaba decimales, `NaN` e inconsistencias (tiros a puerta > tiros, posesión ≠ 100).
- Modo IA no ofrecía selector de estado y eximía la captura obligatoria, por lo que podía enviar `jugado` sin evidencia.
- No existía corrección desde la UI: sólo se listaban partidos `pendiente`, así que `#motivo` y `p_motivo` eran inalcanzables.
- No había confirmación con participantes, jornada, marcador anterior/nuevo ni motivo.
- `if (data && !data.ok)` daba por buenas respuestas nulas o incompletas; un error de red se trataba como éxito visual.
- No existía guardia de envío concurrente: dos clics podían alcanzar dos veces la RPC.
- No se revalidaban partido, participantes, estado ni duplicados contra datos frescos antes de escribir.
- La auditoría se registraba sin `await` y sin `motivo`; podía fallar silenciosamente.
- El selector ofrecía `expulsion_local` / `expulsion_visitante`, estados rechazados por la RPC desplegada.
- No había deduplicación local (el Cuadro sí deduplicaba por `jornada|local|visitante`).
- Adjuntar una captura repintaba el formulario y borraba marcador y estadísticas ya escritos (detectado por el verificador visual).
- La consulta de partidos se repetía por jornada y en cada repintado.

## Cambios aplicados

### `js/modulos/resultados.js`

- Helpers puros expuestos para pruebas: `enteroNoNegativo`, `validarMarcador`, `verificarPartido`, `deduplicar`, `resumenCambio`, `confirmarCambio`, `respuestaConfirmada`, `validarStats`, `guardarResultado`, `estadosGuardables`.
- Validación estricta: `^\d+$`, rango `0..99` para goles y `0..100` para estadísticas, sin vacíos, negativos, decimales, signos ni notación exponencial. Los estados administrativos canonicalizan el marcador (`3-0`, `0-3`, `0-0`) con `GL.resultado()`.
- `Mod.guardando` se activa **antes del primer `await`**, bloqueando clics concurrentes; el botón se deshabilita y se restaura en `finally`.
- Relectura fresca del partido antes de la RPC: existencia, participantes no nulos/diferentes/pertenecientes al torneo, estado coherente (pendiente vs. corrección) y detección de duplicados con la misma clave del Cuadro.
- Confirmación vía `GL.confirmar()` (con fallback a `window.confirm`) mostrando participantes, jornada, marcador anterior y nuevo, estado y motivo. Cancelar no escribe nada.
- Éxito sólo tras RPC confirmada: `error`, respuesta no-objeto o `{ ok: false }` lanzan error; nunca se notifica éxito ante fallo de red o respuesta incompleta.
- Corrección desde el historial con `#motivo` obligatorio, `p_motivo` enviado a la RPC y auditoría `await` con `anterior`, `nuevo` y `motivo`.
- Historial real derivado de una sola consulta por torneo: jornada, grupo, participantes, marcador, fecha de programación de la jornada, estado, insignia «Reciente» (7 días) e insignia «Corregido» para correcciones confirmadas en la sesión (sin columnas nuevas).
- Filtros locales funcionales: búsqueda por participante, jornada, grupo, estado y «Solo recientes», con contadores y estados vacíos honestos («Todavía no hay resultados registrados» / «Sin resultados para ese filtro»).
- Una sola consulta `GL.partidos({ torneo_id })` por render; los cambios de modo, archivo y análisis repintan sólo el panel, sin recargar contexto.
- Aviso visible cuando existen partidos duplicados en BD; se muestran una sola vez.
- Adjuntar captura valida tipo y tamaño y actualiza sólo la dropzone, preservando los datos escritos.
- Se retiran `expulsion_*` del selector con aviso explícito: la RPC desplegada los rechaza y no se van a inventar marcadores.

### `css/estilos.css`

Nuevos estilos `.r7-tabs-vistas`, `.r7-aviso-duplicados`, `.r7-aviso-correccion`, `.r7-partido-h`, `.r7-marcador-final`, `.r7-filtros-h`, `.r7-check`, todos con tokens de `css/tokens-3.1.css`. Reglas responsive para 1920×1080, 1366×768 y 390×844; se eliminaron desbordes internos también a 320 px.

### Integraciones verificadas

- **Tabla/posiciones y estadísticas**: la RPC existente recalcula la clasificación; el cliente no duplica cálculos ni inventa desempates (`pts → dif → gf` sin cambios).
- **Cuadro de partidos**: misma clave de deduplicación y mismo estado canónico; el mensaje de éxito menciona explícitamente el cuadro.
- **Calendario**: sigue siendo programación/fechas/ICS; el historial toma la fecha real de `jornadas.fecha_inicio || fecha` y muestra «Sin programación» cuando no existe.
- **Inicio**: continúa usando `GL.resultado(p)` y `fechaJornada`, sin cambios de módulo.
- **Autorización**: `GL.asegurarAdmin()` al render y `GL.esAdmin()` antes de escribir; la RPC desplegada ya es admin-only.

### Arneses y versiones

- `tests/fase-3.15.test.js`: 23 pruebas aisladas (sin Supabase ni datos reales).
- `scripts/verificar-fase-3.7-visual.mjs`: capturas aisladas en `docs/capturas-fase-3.15`, añadida verificación del historial en móvil y captura a 1920 px; `mock-resultados-3.7.html` incorpora `GL.confirmar` y marcadores canónicos reales.
- `playwright.config.mjs`: proyecto `chromium-wide-1920` junto a 1366×768 y 390×844.
- `tests/e2e/flujo.spec.js`: prueba de ausencia de desbordamiento horizontal en la vista pública.
- Cache-busting: CSS `v=3.15.0`, scripts estáticos `v=1.3.0`, `CONFIG.VERSION = '1.3.0'` (los módulos dinámicos usan esa versión).

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `node --check js/modulos/resultados.js`, `js/core/config.js`, `tests/fase-3.15.test.js`, `scripts/verificar-fase-3.7-visual.mjs` | 0 fallos |
| Vitest completo (`vitest run`) | 11 archivos, 143 pruebas, 0 fallos |
| Playwright (`test --reporter=dot`) | 18 pasadas, 6 omitidas, 0 fallidas |
| `scripts/verificar-fase-3.7-visual.mjs` (arnés local) | 17 capturas, 8 anchos sin desbordes, consola limpia, RPC única, auditoría con motivo |
| Historial en el arnés | 2 resultados, filtros por jornada/estado/nombre, estado vacío y limpieza correctos |

Nota: los mensajes `[GL.mensaje] detalle técnico: Failed to fetch` y `column "telefono_nacional" does not exist` en el log de Vitest son esperados: pertenecen a pruebas que simulan fallos de red y a un arnés antiguo de telefonía; no hay pruebas fallidas.

## Omitido

- E2E con sesión real: sin credenciales `GL_ADMIN_EMAIL`, `GL_ADMIN_PASS`, `GL_PLAYER_EMAIL`, `GL_PLAYER_PASS` ni `PLAYWRIGHT_BASE_URL` (6 pruebas condicionales).
- Verificación de un torneo completo con datos reales: producción tiene `jornadas=0`, `partidos=0`, `clasificacion=0`, `jugadores=3`, `grupos=2`, `grupo_jugadores=1`; no se insertaron datos de prueba.
- No se ejecutaron migraciones ni se modificó Supabase.

## Limitaciones y autorizaciones pendientes

- `gl_guardar_resultado_interno` y `recalcular_clasificacion_interno` no están versionados en el repositorio (F-25). El wrapper endurecido confirma la operación, pero no es posible auditar estáticamente el cuerpo completo.
- Las resoluciones `expulsion_*` no se ofrecen desde Resultados porque la RPC desplegada las rechaza. Habilitarlas requiere autorización para cambiar la función SQL; no se hizo.
- No hay columnas versionadas para `motivo`, `anterior`, `corregido_por` ni bloqueo optimista transaccional. La trazabilidad depende de la auditoría client-side y de la transacción de la RPC (F-05).
- No se añadió unicidad/CHECK de dominio en BD, ni RPC de corrección dedicada, ni unificación de los caminos de cierre de jornada: todo eso requiere SQL/RLS y autorización (F-25/B1–B12).
- La subida de la captura ocurre antes de la RPC; sin atomicidad SQL, un fallo del servidor puede dejar un archivo huérfano. No se puede resolver desde el cliente.
- La insignia «Corregido» es de sesión; no se persiste porque no existe columna autorizada para hacerlo.
- No se inventaron criterios de desempate ni datos de producción para probar.

## Evidencia

`docs/capturas-fase-3.15/` contiene 17 capturas y `verificacion-despues.json` con métricas responsive, filtros, historial, formulario, modo IA, estados vacíos/cargando/error/cerrada, foco y movimiento reducido.
