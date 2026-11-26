# FASE 3.21 — Auditoría y consolidación de Resultados

**Estado:** Implementada y verificada localmente. **Pendiente de autorización para commit, push y publicación.**
**Rama:** `main`
**Base:** `a49b31e2876b32095e82544a5687c0c5c6279180` (= `origin/main`, FASE 3.20 publicada)
**Fecha:** 2026-11-26

## A) Resumen ejecutivo

La FASE 3.21 se concentró exclusivamente en el módulo **Resultados**. Se detectó y corrigió en frontend un fallo de coherencia deportiva: la pantalla anclaba la carga a la **primera jornada abierta global**, el selector de grupo sólo ocultaba tarjetas y la escritura no validaba jornada, grupo ni torneo contra el estado real. Como consecuencia, una jornada abierta en un grupo podía habilitar —o aparentar habilitar— la carga en otro, y una jornada cerrada podía seguir aceptando solicitudes de guardado desde una vista desactualizada.

Se mantuvo íntegramente FASE 3.20: tema oscuro, acentos rojos, tipografía Inter y `css/tokens-3.1.css`. No se modificó Supabase, SQL, migraciones, RLS, GRANT/REVOKE, RPC, Edge Functions, datos reales ni registros históricos. Tampoco se cambiaron reglas deportivas: las decisiones que requieren definición quedan documentadas en la sección I.

---

## B) Problemas auditados

| ID | Severidad | Problema reproducido | Estado |
|---|---|---|---|
| P0-01 | Alta | `GL.jornadaAbiertaNumero()` resolvía una jornada global, sin contexto de grupo. Una jornada abierta en A podía mostrar resultados de esa jornada aunque se estuviera viendo B. | **Corregido** en frontend |
| P0-02 | Alta | `#r7-grupo` sólo aplicaba `hidden` a las tarjetas; contadores, carga y panel seguían usando `Mod.partidos` sin filtrar. | **Corregido** en frontend |
| P0-03 | Alta | `guardarResultado()` no validaba que la jornada del partido estuviera abierta ni que perteneciera al grupo/torneo activo antes de llamar a la RPC. | **Corregido** en frontend con relectura fresca |
| P1-01 | Media | La auditoría tomaba `anterior` del snapshot inicial, no del registro releído; en correcciones concurrentes podía informar un marcador previo inexistente. | **Corregido** en frontend |
| P1-02 | Media | Tras guardar no se invalidaba el contexto; tabla/estadísticas podían permanecer desactualizadas hasta una recarga posterior. | **Corregido** en frontend |
| P1-03 | Media | Una respuesta `ok:false` con `mensaje` se informaba con un error genérico; se perdía el motivo del servidor. | **Corregido** en frontend |
| P1-04 | Media | `Mod.guardando` protegía el envío, pero los botones de vista/modo/filtros podían cambiar el estado de la pantalla durante el guardado. | **Corregido** en frontend |
| P2-01 | Media | No hay definición documentada de `goles_local/goles_visitante` como goles reglamentarios vs. goles reales (walkovers, dobles ausencias, estadísticas). | **Pendiente**: decisión deportiva + posible backend |
| P2-02 | Media | La validación de jornada es de frontend; un cliente que llame directamente a la RPC podría eludirla si el contrato interno no la aplica de forma atómica. | **Pendiente**: requiere Supabase |
| P2-03 | Baja | Auditoría, sanciones y valor anterior no están acoplados transaccionalmente al guardado. | **Pendiente**: requiere Supabase |
| P2-04 | Baja | Jornadas virtuales/sin programación y torneo finalizado need una regla explícita de corrección y cierre. | **Pendiente**: decisión deportiva |

> Los cuerpos de `gl_guardar_resultado_interno`, `gl_cerrar_jornada_interno` y `recalcular_clasificacion_interno` no están versionados en el repositorio. Por eso no se audita estáticamente su comportamiento real ni se afirma que hayan cambiado.

---

## C) Archivos revisados y modificados

### Revisados sin cambios

- `js/core/gl.js` — `cargarContexto`, `invalidar`, `partidos`, jornadas virtuales.
- `js/core/clasificacion.js` — recálculo y lectura de tabla.
- `js/core/estadisticas.js` — goles reales vs. reglamentarios.
- `js/modulos/calendario.js` — cierre de jornada vía `gl_cerrar_jornada`.
- `js/ui/menu.js` — carga perezosa de módulos.
- `supabase/migration-hardening-rpcs.sql` — wrapper `gl_guardar_resultado`; **no tocado**.
- `docs/fase-3.20-informe-experiencia-integral.md` — origen de P2-01/P2-02/P2-06.
- `tests/fase-3.15.test.js` — contrato previo de Resultados; sigue en verde.

### Modificados

- `js/modulos/resultados.js` — núcleo de la corrección.
- `js/core/config.js` — `VERSION` de `1.3.4` a `1.3.5`.
- `index.html` — cache-busting de `config.js`, `gl.js` y `menu.js` a `1.3.5`.
- `tests/fase-3.16.test.js`, `tests/fase-3.17.test.js`, `tests/fase-3.19.test.js` — regex de versión ampliadas para admitir `1.3.5`.
- `tests/fase-3.21.test.js` — **nuevo**, 17 pruebas aisladas con fixtures sintéticos.
- `docs/fase-3.21-resultados.md` — **nuevo**, este informe.

---

## D) Correcciones aplicadas: antes / después

| Área | Antes | Después |
|---|---|---|
| Jornada visible | `GL.jornadaAbiertaNumero()` global | `jornadaElegida(jornadasAbiertas(Mod.grupo))`, con selector `#r7-jornada` funcional |
| Grupo | Filtro visual sobre tarjetas | `partidosDeJornada(jn, Mod.grupo)` filtra los datos; `#r7-grupo` fuerza render y reinicia selección |
| Varias abiertas | Se tomaba la primera global | Se ordenan y se respeta `Mod.jornada` si pertenece a la lista |
| Ninguna abierta | Mensaje global engañoso | Mensaje contextual por grupo; no se listan partidos cargables |
| Cerrada | Sin comprobación en escritura | `validarContextoEscritura()` bloquea alta **y** corrección |
| Sin programación | Tratada como jornada inexistente | `jornadaDelPartido()` distingue fila ausente/virtual; bloquea alta sin inventar programación |
| Torneo finalizado | Sin regla explícita | Sin jornadas abiertas ⇒ sin alta; el historial de partidos permanece disponible |
| Relectura | Snapshot inicial | `GL.cargarContexto(true)` + `GL.partidos({ torneo_id: GL.torneoId() })` antes de escribir |
| Cambio concurrente | Sólo participantes | `verificarPartido()` también detecta cambio de `jornada`, `grupo_id` y `torneo_id` |
| Auditoría | `anterior` del snapshot | `anterior` del registro fresco vía `frescoDe()` |
| Caché | Sin invalidación | `GL.invalidar()` antes de `Mod.render()`; no se agrega `GL.recalcularTodo()` porque el RPC ya recalcula |
| Envíos repetidos | Guard en `guardarResultado` | Guard reforzado en navegación, filtros y limpieza; texto del botón se restaura sin republicarlo |
| Errores del servidor | `ok:false` ⇒ mensaje genérico | Se propaga `data.mensaje`; `Failed to fetch` nunca se informa como éxito |
| Cache-busting | `1.3.4` | `1.3.5` en `CONFIG.VERSION` y tres scripts núcleo; tests de versión actualizados |

Se expusieron helpers de prueba (`jornadasAbiertas`, `jornadaElegida`, `partidosDeJornada`, `jornadaDelPartido`, `validarContextoEscritura`, `frescoDe`, `esCerrada`) sin alterar el contrato público del módulo.

---

## E) Errores reproducidos

Antes de la corrección, con fixtures sintéticos y sin datos reales:

1. Con jornada 1 abierta en `gA` y jornada 1 abierta en `gB`, el mensaje de cabecera y la lista dependían de la primera jornada global; el selector de grupo no reducía `Mod.partidos`.
2. Con jornada 1 **cerrada**, el panel seguía ofreciendo “Confirmar y Guardar” y la RPC podía invocarse desde una vista cargada previamente.
3. Con un partido sin fila de jornada, no existía distinción entre “sin programación” y “jornada abierta”.
4. En una corrección concurrente, el fixture `snapshot = 9-9` contra el registro fresco `2-1` habría registrado `anterior: '9 - 9'`; después registra `anterior: '2 - 1'`.
5. Tras guardar, el contexto seguía marcado como válido; tabla y estadísticas podían leerse de la caché previa.
6. Una respuesta `{ ok:false, mensaje:'Jornada cerrada en servidor' }` se convertía en “El servidor rechazó el resultado.”; ahora se muestra el mensaje recibido.
7. Un doble envío concurrente se ensayó con dos promesas y una confirmación controlada: la RPC se ejecuta una sola vez.

---

## F) Pruebas ejecutadas

### Unitarias

```powershell
& 'C:/Users/manue/AppData/Local/Temp/opencode/node20/node_modules/node/bin/node.exe' node_modules/vitest/vitest.mjs run
```

**Resultado:** 16/16 archivos, **210/210 pruebas**, `EXIT=0`.
El archivo nuevo `tests/fase-3.21.test.js` aporta 17 pruebas. Los mensajes `Failed to fetch` y `column "telefono_nacional" does not exist` en stderr son ruido esperado de mocks de regresión; la suite termina en verde.

| # | Escenario obligatorio | Verificación |
|---|---|---|
| 1 | Grupos | `partidosDeJornada(1,'gA')` vs. `gB`; selector funcional sobre datos |
| 2 | Jornadas | Sólo `abierta`, real y `<= total_jornadas`; se descartan cerradas, virtuales y fuera de rango |
| 3 | Varias abiertas | `[1,2,3]` ordenadas; elección explícita 2 y fallback inválido a 1 |
| 4 | Ninguna abierta | `jornadaElegida()` ⇒ `null`; sin carga y sin RPC |
| 5 | Cerrada | Bloquea alta y corrección; aviso “está cerrada” |
| 6 | Sin programación | `jornadaDelPartido()` ⇒ `null`; relectura forzada y sin RPC |
| 7 | Finalizado | Sin jornadas abiertas; historial disponible; sin alta |
| 8 | Corrección | `anterior` tomado del registro fresco; auditoría `resultado_corregido` |
| 9 | Marcadores inválidos | `-1`, `1.5`, vacío y `100` rechazados antes de la RPC |
| 10 | Envíos repetidos | Doble envío ⇒ una sola RPC; partido ya registrado en relectura ⇒ sin RPC |
| 11 | Clasificación | `invalidar()` ocurre antes de `render()`; mensaje de tabla/estadísticas/cuadro; sin `GL.recalcularTodo()` extra |
| 12 | Estadísticas | `validarStats` bloquea `tiros_puerta_local > tiros_local`; datos coherentes llegan en `p_stats` |
| 13 | Errores de servidor | `Failed to fetch` y `ok:false` ⇒ error, nunca éxito; se propaga `mensaje` |
| 14 | Permisos insuficientes | Sin `GL.esAdmin()` ⇒ sin RPC; respuesta de permisos ⇒ error visible |
| 15 | Aislamiento entre grupos | Jornada abierta en A no habilita carga en B; aviso “otro grupo” |

### End-to-end

```powershell
& node node_modules/@playwright/test/cli.js test --reporter=dot
```

**Resultado:** **18 passed / 6 skipped**, `EXIT=0`. Los 6 skips son los ya omitidos en FASE 3.20.

### Verificadores visuales

Se ejecutaron los seis verificadores `3.3`, `3.4`, `3.5`, `3.6`, `3.7` y `3.8` con:

```powershell
$env:GL_CAPTURAS_DIR = 'C:/Users/manue/AppData/Local/Temp/opencode/capturas-3.21'
```

**Resultado:** 6 ejecuciones correctas, 8 anchos (320, 375, 390, 768, 1024, 1280, 1366, 1920 px), **77 capturas** fuera del repositorio. El verificador 3.7 guarda históricamente en `capturas-fase-3.17`.

### Estáticos

- `node --check` limpio para `js/modulos/resultados.js`, `js/core/config.js` y los cinco archivos de tests tocados.
- `git diff --check` limpio tras normalizar finales de línea.

---

## G) Limitaciones

- No se probó contra Supabase real ni con una sesión administrativa en producción; los fixtures son sintéticos y los navegadores usan mocks.
- La verificación en frontend reduce pero no elimina la ventana de carrera entre la relectura y la RPC. La garantía fuerte debe estar en el servidor.
- `GL.cargarContexto(true)` puede fallar por red o permisos; en ese caso se bloquea el guardado con un aviso explícito, sin escribir datos.
- No se auditan fórmulas de clasificación/estadísticas: el cambio asegura que lean el contexto fresco, pero no redefine reglas de negocio.
- Los tests E2E omitidos (accesibilidad/navegación) permanecen como en FASE 3.20.
- El selector de grupo reinicia `Mod.jornada` y el panel abierto; es intencional para evitar contextos mixtos, pero el usuario pierde el formulario en edición al cambiar de grupo.

---

## H) Cambios que requieren Supabase (no ejecutados)

Requieren autorización explícita; **no se aplicó ninguno**:

1. Hacer que `gl_guardar_resultado` valide de forma atómica, dentro de la transacción que escribe, grupo, jornada, torneo y estado abierto/cerrado. Así un cliente directo no puede eludir la comprobación de frontend.
2. Confirmar/versionar el contrato de respuesta de `gl_guardar_resultado` y `gl_cerrar_jornada` (`ok`, `mensaje`, `error`) para dejar de depender de un contrato no versionado.
3. Registrar auditoría y valor anterior dentro de la misma transacción del resultado, si se quiere trazabilidad frente a correcciones concurrentes.
4. Si se decide separar goles reglamentarios y reales, ajustar esquema/RPC y consumidores de tabla/estadísticas.
5. Si se requieren permisos por grupo o por jornada, definir RLS/GRANT/roles; no se inventaron permisos nuevos.
6. Revisar `gl_cerrar_jornada_interno` para que cierre y carga/corrección sean mutuamente excluyentes en servidor.

---

## I) Decisiones deportivas pendientes

1. **Goles reglamentarios vs. reales.** Definir qué significa `goles_local/goles_visitante` para clasificación y qué se usa para estadísticas, especialmente en `walkover_local`, `walkover_visitante` y `doble_ausencia`. Hoy se conserva el comportamiento previo.
2. **Corrección tras cierre.** Determinar si se permite, quién la autoriza y en qué ventana. La implementación actual la bloquea y sugiere reabrir desde Administración; no se habilitó “por decisión propia”.
3. **Jornadas virtuales o sin programación.** Definir si pueden abrirse/cerrarse y cómo se muestran en el cuadro cuando no hay fila real.
4. **Torneo finalizado.** Confirmar si el historial debe ser sólo lectura o si admite correcciones acotadas.
5. **Sanciones vinculadas al resultado.** Definir si tarjetas/ausencias se derivan automáticamente del marcador o se gestionan por separado; no se mezcló con este módulo.

---

## J) Riesgos

- Persiste una ventana de carrera frontend/servidor; mitigada por relectura, no eliminada.
- Un cambio de `GL.cargarContexto(true)` o de la forma de `GL.partidos()` podría afectar las validaciones; están aisladas en helpers y cubiertas por tests.
- El bump de versión toca scripts núcleo; todos los assets deben publicarse juntos para evitar mezcla de cachés.
- Cambiar de grupo descarta el formulario en edición; documentado y probado como comportamiento deliberado.
- Sin prueba real en Supabase, el despliegue debe verificarse con el flujo administrativo completo antes de considerar cerrada la fase en producción.

---

## K) Estado final

- Implementación local de FASE 3.21: **completa**.
- Pruebas locales: **verdes** (Vitest 210/210, Playwright 18/6 skip, 6 verificadores visuales, estáticos limpios).
- `HEAD` y `origin/main` siguen en `a49b31e2876b32095e82544a5687c0c5c6279180`.
- Árbol de trabajo: 6 archivos modificados y 2 archivos nuevos (`tests/fase-3.21.test.js`, este informe).
- **No hay commit, push ni publicación.** Se detiene aquí a la espera de autorización explícita para publicar FASE 3.21.
