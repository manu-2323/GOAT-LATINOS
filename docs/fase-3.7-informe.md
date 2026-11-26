# FASE 3.7 — Rediseño visual y UX real de Resultados

**Estado:** implementada y verificada localmente.  
**Fecha:** 2026-11-25.  
**Base obligatoria:** FASE 3.3 / 3.4 / 3.5 / 3.6 y `docs/estandar-visual-modulos-3.4.md`.  
**Fuente única de verdad visual:** `css/tokens-3.1.css`.  
**Deuda técnica preservada:** `column jugadores.telefono_nacional does not exist`. **No corregida en esta fase.**

---

## 1. Inventario breve de módulos reales

Se revisaron `js/modulos/`, `js/core/`, `js/app.js`, `js/ui/menu.js` y la capa visual existente en `css/estilos.css`. El inventario se clasificó por estado real de rediseño, no por intención:

| Clasificación | Módulos | Evidencia real |
|---|---|---|
| **Renovados** | `dashboard-admin` (Centro de control), pestaña **Jugadores** dentro de `#administracion`, pestaña **Equipos** dentro de `#administracion`. | Capas dedicadas `.da-*` (3.4), `.j5-*` (3.5) y `.e6-*` (3.6), con verificación propia. |
| **Parcialmente renovados** | `admin` (Resumen/Jornadas), `calendario`, `auditoria`, `fixture`, `tabla`, `stats-jornada`, `stats-globales`, `notificaciones`, `perfil`, `eliminatorias`, `mensajes`. | Heredan componentes 3.3 y algunos tienen CSS propio anterior (`.aud-*`, `.cal-*`, etc.), pero no capa de rediseño 3.4+. |
| **Pendientes de rediseño dedicado** | **`resultados`** | Antes de 3.7 solo tenía `.resultado-grid`, estilos en línea, dos modos de carga y ningún KPI, filtro local, contador ni estado “sin coincidencias” propio. |

`js/modulos/exportar-png.js` es una utilidad de exportación, no una vista administrativa; no entró en la selección. No se modificó la navegación: `resultados` ya existe como hash y como ítem `nivel: 'admin'` en `js/ui/menu.js`.

---

## 2. Módulo seleccionado y motivo

Se seleccionó **un único módulo: Resultados** (`js/modulos/resultados.js`, `#resultados`, menú “Dirección del torneo”).

Motivo real de prioridad:

1. **Importancia administrativa:** es la operación que registra marcadores; de ella dependen tabla, estadísticas y clubes.
2. **Frecuencia de uso:** interviene en cada jornada abierta y es el destino natural de alertas del Centro de control.
3. **Impacto UX:** antes de 3.7 presentaba estilos en línea, poca jerarquía visual, sin progreso de jornada y sin localización de partidos dentro de una lista larga.
4. **Antigüedad/inconsistencia:** era la vista administrativa crítica sin capa propia frente a Dashboard, Jugadores y Equipos.
5. **Viabilidad:** se podía mejorar conservando IDs, `data-partido`, `data-modo`, `#g-local`, `#g-visita`, `#estado`, `#guardar`, `#dropzone`, `#archivo`, `#analizar`, `#re-hacer`, estados de jornada cerrada y las dos operaciones existentes, sin tocar SQL ni reglas de negocio.

No se rediseñaron Dashboard, Jugadores ni Equipos.

---

## 3. Archivos modificados y creados

### Modificados en FASE 3.7

| Archivo | Cambio |
|---|---|
| `js/modulos/resultados.js` | Nueva estructura `.r7-*`, KPI reales, filtros locales, listado, editor manual/IA rediseñados y corrección del repintado de captura heredado. |
| `css/estilos.css` | Capa final `FASE 3.7 — CARGA DE RESULTADOS`, usando exclusivamente `var(--gl-*)`, componentes 3.3 y patrones 3.4/3.5/3.6. |

### Creados para verificación y evidencia

| Archivo | Uso |
|---|---|
| `mock-resultados-3.7.html` | Arnés local con `GL` simulado y `sb` falso. **No es la app real.** |
| `scripts/verificar-fase-3.7-visual.mjs` | Playwright: 8 anchos, capturas, filtros, formulario, validaciones, IA, estados, foco, teclado y movimiento reducido. |
| `scripts/verificar-fase-3.7-real.mjs` | Playwright autenticado de **solo lectura** contra la app real servida en local. No pulsa guardar. |
| `scripts/servir-local-3.6.mjs` | Servidor estático local reutilizado; detenido al finalizar. |
| `docs/capturas-fase-3.7/` | 15 PNG y 2 JSON de verificación. |
| `docs/fase-3.7-informe.md` | Este informe. |

No se modificaron `index.html`, `js/app.js`, `js/ui/menu.js`, `js/core/gl.js`, `js/modulos/admin.js`, `js/modulos/dashboard-admin.js`, `mock-jugadores-3.5.html` ni `mock-equipos-3.6.html` en esta fase.

---

## 4. Mejoras visuales implementadas

- Encabezado con eyebrow “Dirección del torneo · Resultados”, título, bajada de jornada y badges de jornada/total de partidos.
- Cuatro KPI derivados **únicamente** de los partidos ya cargados: `Pendientes`, `Cargados`, `Total` y `Progreso`, con barra `role="progressbar"`.
- Listado de partidos como tarjetas con jornada, grupo, estado `Pendiente`/`Cerrada`, nombres reales y chevron; selección activa con borde rojo de marca.
- Panel de búsqueda y filtro de grupo con contador en vivo y botón de limpieza.
- Estado “sin coincidencias” y estado “todos los partidos tienen resultado” con iconografía Lucide.
- Editor manual reorganizado: cabecera de modo, marcador local/visitante, estado, estadísticas avanzadas plegables y zona de captura.
- Editor IA reorganizado: captura, estado de análisis, datos detectados para revisión y acciones “Otra captura” / “Confirmar y Guardar”.
- Superficies carbon, bordes sutiles, rojo de identidad, Inter, radios, sombras, espaciado y tipografía solo desde tokens de `css/tokens-3.1.css`.
- Foco visible con `var(--gl-brand-text)` y `var(--gl-focus-ring)`; `prefers-reduced-motion` respetado.
- Sin `:root` alternativo, paleta nueva, fuente alterna ni Rajdhani en UI.

---

## 5. Mejoras funcionales

- Filtros **locales de solo presentación**: texto (insensible a tildes) y grupo; se combinan, actualizan `#r7-contador` y pueden limpiarse. No hacen consultas ni escriben datos.
- El progreso y los KPI se calculan por derivación de lectura sobre `GL.partidos()` y `GL.torneo()`, sin nuevas llamadas por tarjeta.
- Las pestañas manual/IA conservan `data-modo` y ahora exponen `role="tab"` / `aria-selected`.
- Se conservan todos los IDs y contratos existentes: `#lista-pendientes`, `#panel-resultado`, `#g-local`, `#g-visita`, `#estado`, `#guardar`, `#dropzone`, `#archivo`, `#analizar`, `#re-hacer`, `#dropzone-manual`, `#archivo-manual`, campos de estadísticas y `data-partido`.
- Se corrigió un defecto heredado de UI: `enlazarPanel()` llamaba a `pintarPanel()` fuera de su ámbito al adjuntar captura manual. Ahora recibe `actualizarPanel` como parámetro. No cambia validaciones, RPC, Storage ni cálculo de resultados.
- No se añadió CRUD, hash nuevo, columna, migración, trigger, RPC ni cambio de permisos.

---

## 6. Funcionalidades comprobadas

**Mock local (datos simulados):**

- Render con datos, sin jornada abierta, cargando, error simulado y jornada cerrada.
- Búsqueda por nombre, filtro por grupo, combinación de filtros, sin coincidencias y limpieza.
- Selección de partido y conservación de la tarjeta activa.
- Ingreso manual: cambio de estado a walkover (`3–0`), validación de posesión, adjuntar captura y guardado simulado mediante `gl_guardar_resultado`.
- Modo IA: botón deshabilitado sin archivo, habilitado con archivo, análisis simulado y datos detectados `3–2` listos para revisión.
- Foco por teclado en `.r7-tab`, con contorno visible.
- Movimiento reducido: transiciones canceladas.

**App real autenticada (solo lectura):**

- Login admin real, navegación a `#resultados` y render del módulo real con Supabase.
- Sin pulsar guardar, sin subir archivos y sin invocar IA real.

---

## 7. Resultados exactos

| Comprobación | Resultado |
|---|---|
| Vitest | `6 passed` archivos, `80 passed` tests, duración `2.04s`. |
| Sintaxis JS | `34 archivos`, `0 fallos` (`node --check`). |
| Estático 3.3 | `CSS PARSE OK`; `estilos.css` = `1614 reglas`; tokens definidos `125`; tokens consumidos `95`; fuentes `< 12px` = `0`; Rajdhani en UI = `0`; `STATIC 3.3 OK`. |
| Playwright 3.7 mock | `14 capturas`; consola limpia en escenarios no forzados; `1` error registrado únicamente en el estado de error simulado. |
| Filtros 3.7 | Inicial `4`; “chicharito” → `2`; grupo `g1` → `2`; “neymar” + `g1` → `2`; “no-existe” → estado sin resultados `1`; limpiar → `4`; contador final `4 partidos`. |
| Formulario 3.7 | IDs presentes: `g-local`, `g-visita`, `estado`, `guardar`, `dropzone-manual`, `archivo-manual`, `tiros_local`, `posesion_local`; walkover local `3–0`; aviso `La posesión de ambos equipos debe sumar 100.`; guardado simulado `true`; goles enviados `[0,0]` tras adjuntar archivo; auditoría `1`; toast `Resultado guardado y tabla actualizada.` |
| IA 3.7 | `#analizar` deshabilitado antes de elegir captura, habilitado después; goles detectados `[3,2]`; IDs `g-local`, `g-visita`, `re-hacer`, `guardar`, `tiros_local`, `posesion_local` presentes. |
| Estados 3.7 | Con datos: `4` partidos; vacío: estado vacío visible; carga: skeleton visible; error: estado de error visible; cerrada: `4` partidos y `#guardar` deshabilitado. |
| Foco y movimiento | Foco en `button.r7-tab`, `outlineColor rgb(255, 107, 122)`, `outlineWidth 2px`; transiciones con `prefers-reduced-motion` = `1e-05s`. |
| Hashes Supabase | 4/4 idénticos a los registrados en FASE 3.6. |
| `git -c core.whitespace=cr-at-eol diff --check` | `DIFF CHECK OK`. Persisten advertencias de normalización CRLF preexistentes en otros archivos. |
| Prueba real autenticada | `ejecutada: true`; `hash #resultados`; título `Carga de resultados`; KPIs `["0","0","0","0%"]`; partidos `0`; contador `0 partidos`; `scrollWidth 1366` con ancho `1366`. |
| Error real preexistente | `3` respuestas HTTP `400` en `/rest/v1/jugadores?...telefono_nacional...`; marcado como deuda técnica heredada, **no corregido**. |

La prueba real mostró `0 partidos pendientes` en el estado actual de datos; por eso las interacciones de guardado, validaciones e IA se verificaron en el mock, no contra Supabase.

---

## 8. Resoluciones y comportamiento responsive

| Ancho | `scrollWidth` | Filas de KPI | Fuente < 12px | Control mínimo | Desbordes internos | Traslapes |
|---:|---:|---:|---:|---:|---:|---:|
| 320 | 320 | 4 | 0 | 44 px | 0 | 0 |
| 375 | 375 | 4 | 0 | 44 px | 0 | 0 |
| 390 | 390 | 4 | 0 | 44 px | 0 | 0 |
| 430 | 430 | 4 | 0 | 44 px | 0 | 0 |
| 768 | 768 | 2 | 0 | 44 px | 0 | 0 |
| 1024 | 1024 | 2 | 0 | 44 px | 0 | 0 |
| 1366 | 1366 | 1 | 0 | 44 px | 0 | 0 |
| 1920 | 1920 | 1 | 0 | 44 px | 0 | 0 |

No hubo scroll horizontal injustificado, desbordes internos ni traslapes entre bloques en ninguno de los 8 anchos. En móvil el marcador y los filtros pasan a una columna; en tablet los KPI pasan a dos columnas.

---

## 9. Regresiones ejecutadas

| Regresión | Modo | Resultado |
|---|---|---|
| FASE 3.4 — Dashboard | `antes` y `despues` | 6 capturas por modo; 8 anchos con `minControl 44`; 37 interacciones; destinos `fixture`, `administracion`, `resultados`, `jornadas`, `estadisticas-globales`, `tabla`, `mensajes`, `auditoria`; skeleton/refresh/guía OK; consola sin errores. |
| FASE 3.5 — Jugadores | `antes` y `despues` | 6 + 13 capturas; filtros `7 → 1 → 7`, combinados `1`, sin resultados `1`; IDs de registro/edición presentes; `3` errores de validación; guardado de edición simulado `true`; modales cerrados y modal móvil dentro del viewport; consola limpia. |
| FASE 3.6 — Equipos | `despues` | 13 capturas; filtros `2 → 1 → 2`; `2` tarjetas, `12` miembros visibles, `16` botones de edición; navegación a Jugadores OK; bottom sheet móvil OK; estados y movimiento reducido OK; consola limpia. |
| FASE 3.3 estático | único | OK, sin fuentes < 12 px ni Rajdhani en UI. |
| Vitest y sintaxis | únicos | `80 passed`; `34/34` archivos JS sintácticamente válidos. |

Las regresiones se ejecutaron después de los cambios de 3.7. No se detectó degradación en las tres fases previas.

---

## 10. Confirmación de límites

- **No** se modificó SQL, migraciones, esquema, columnas, Supabase, RLS, triggers, RPC, Edge Functions ni Storage.
- **No** se modificaron auth, roles, permisos ni `js/core/gl.js`.
- **No** se corrigió `column jugadores.telefono_nacional does not exist`; continúa documentado como deuda técnica independiente.
- **No** se cambiaron consultas de jugadores ni el cálculo de tabla, clasificación o estadísticas.
- **No** se introduces operaciones persistentes nuevas: el único guardado es el ya existente en `guardarResultado()`.
- **No** se cambió el contrato de `#administracion`, que sigue abriendo Jugadores por defecto.
- **No** se hicieron commit, push, deploy ni cambios en producción.
- **No** se realizó refactorización general: el cambio se limitó a Resultados y una capa CSS aditiva al final de `estilos.css`.

---

## 11. Evidencias

Directorio: `docs/capturas-fase-3.7/`

- Capturas mock: `despues-con-datos.png`, `despues-vacio.png`, `despues-cargando.png`, `despues-error.png`, `despues-cerrada.png`, `despues-escritorio.png`, `despues-movil.png`, `despues-busqueda.png`, `despues-filtro-grupo.png`, `despues-sin-resultados.png`, `despues-ingreso-manual.png`, `despues-guardado-simulado.png`, `despues-ia-captura.png`, `despues-ia-datos-detectados.png`.
- Captura real: `despues-resultados-real.png`.
- Datos: `verificacion-despues.json` (mock) y `verificacion-real.json` (app real autenticada de solo lectura).

Los JSON distinguen explícitamente `ejecutada`, `tipo`, errores de consola, fallos de red y la deuda técnica preexistente.

---

## 12. Pruebas pendientes

- Guardar un resultado **real** contra Supabase: no se ejecutó para evitar escribir datos de producción.
- Subir una captura real a Storage: no se ejecutó; se simuló con archivo local en el mock.
- Invocar la Edge Function real `analizar-captura`: no se ejecutó; se simuló su respuesta.
- Verificar el formulario real con partidos pendientes: la prueba autenticada encontró `0` partidos pendientes en el estado actual del torneo.
- Corregir y validar `telefono_nacional`: queda fuera de FASE 3.7 por instrucción explícita.
- Ejecutar `supabase/tests/fase-2.3.sql`: sigue pendiente por falta de PostgreSQL local; hallazgo heredado.
- Pruebas en otros navegadores y con roles no administradores: no se ejecutaron en esta fase.

---

**Conclusión:** FASE 3.7 entregó un rediseño real y verificable de Resultados, integrado visualmente con Dashboard, Jugadores y Equipos, sin alterar datos, reglas de negocio, contratos ni la deuda técnica documentada.
