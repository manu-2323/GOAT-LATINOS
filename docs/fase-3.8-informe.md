# FASE 3.8 — Rediseño visual y UX real de Mensajes

**Estado:** implementada y verificada localmente.  
**Fecha:** 2026-11-26.  
**Base obligatoria:** FASE 3.3 / 3.4 / 3.5 / 3.6 / 3.7 y `docs/estandar-visual-modulos-3.4.md`.  
**Fuente única de verdad visual:** `css/tokens-3.1.css`.  
**Deuda técnica preservada:** `column jugadores.telefono_nacional does not exist`. **No corregida en esta fase.**

---

## 1. Inventario breve de módulos reales

Se revisaron `js/modulos/`, `js/core/`, `js/app.js`, `js/ui/menu.js`, `index.html`, `css/tokens-3.1.css` y la capa acumulada en `css/estilos.css`. La clasificación refleja el estado real del código, no la intención de rediseño:

| Clasificación | Módulos | Evidencia real |
|---|---|---|
| **Ya actualizados** | `dashboard-admin`, pestaña **Jugadores** dentro de `#administracion`, pestaña **Equipos** dentro de `#administracion`, `resultados`. | Capas dedicadas `.da-*` (3.4), `.j5-*` (3.5), `.e6-*` (3.6) y `.r7-*` (3.7), cada una con regresión propia. |
| **Parcialmente renovados** | Otras pestañas de `admin`, `calendario`, `auditoría`, `fixture`, `tabla`, `stats-jornada`, `stats-globales`, `notificaciones`, `perfil`, `eliminatorias`. | Heredan componentes 3.3 y tokens, pero no tienen capa de rediseño 3.4+ propia y verificada. |
| **Pendientes de rediseño dedicado antes de 3.8** | **`mensajes`**. | Antes de 3.8 era un panel con estilos en línea, sin KPIs, sin jerarquía de configuración/vista previa y sin un estado de verificación explícito. |

`js/modulos/exportar-png.js` es utilidad de exportación, no una vista administrativa; no entró en la selección. No se modificó la navegación: `mensajes` ya existe como hash y como ítem `nivel: 'admin'` en `js/ui/menu.js`.

---

## 2. Módulo seleccionado y motivo

Se seleccionó **un único módulo: Mensajes** (`js/modulos/mensajes.js`, `#mensajes`, menú “Dirección del torneo”).

Motivo real de prioridad:

1. **Impacto operativo:** se usa en cada apertura y cierre de jornada; es la comunicación final hacia los grupos de WhatsApp.
2. **Frecuencia:** es el paso posterior a cargar resultados, por lo que lo abre quien administra la jornada.
3. **Deuda visual concreta:** conservaba estilos en línea, poca jerarquía entre configuración y texto generado, y un estado de validación poco visible.
4. **Seguridad funcional:** el generador ya bloquea el texto cuando faltan datos verificables; la mejora debía hacer visible ese bloqueo sin relajar reglas.
5. **Viabilidad:** se podía rediseñar conservando `generar()`, plantillas, `setContexto()`, IDs y eventos, sin tocar Supabase, SQL ni cálculos.

No se seleccionaron Jornadas, Calendario, Auditoría, Tabla, Fixture ni Estadísticas en esta fase. **No se rediseñaron** Dashboard (3.4), Jugadores (3.5), Equipos (3.6) ni Resultados (3.7).

---

## 3. Archivos modificados y creados

### Modificados en FASE 3.8

| Archivo | Cambio |
|---|---|
| `js/modulos/mensajes.js` | Nueva estructura `.m8-*`, encabezado, KPIs, pestañas accesibles, panel de configuración, vista previa, estado de verificación, acciones y helper `m8Kpi()`. Se conservaron `generar()`, plantillas y contratos. |
| `css/estilos.css` | Capa final `FASE 3.8 — GENERADOR DE MENSAJES`, aditiva, usando exclusivamente `var(--gl-*)` y patrones de 3.3–3.7. |

### Creados para verificación y evidencia

| Archivo | Uso |
|---|---|
| `mock-mensajes-3.8.html` | Arnés local con `GL`, `EST`, `CONFIG` y `lucide` simulados. **No es la app real** y no conecta con Supabase. |
| `scripts/verificar-fase-3.8-visual.mjs` | Playwright: 8 anchos, 5 estados, pestañas, cambio de grupo/jornada, copiar/descargar/WhatsApp simulados, foco, movimiento reducido, consola y capturas. |
| `scripts/verificar-fase-3.8-real.mjs` | Playwright autenticado de **solo lectura del módulo** contra la app real servida en local. No pulsa copiar, descargar ni WhatsApp. |
| `scripts/servir-local-3.6.mjs` | Servidor estático local reutilizado; detenido al finalizar. |
| `docs/capturas-fase-3.8/` | 13 PNG y 2 JSON de verificación. |
| `docs/fase-3.8-informe.md` | Este informe. |

No se modificaron `index.html`, `js/app.js`, `js/ui/menu.js`, `js/core/gl.js`, `css/tokens-3.1.css`, `js/modulos/admin.js`, `js/modulos/dashboard-admin.js`, `js/modulos/resultados.js` ni arneses de fases anteriores.

---

## 4. Mejoras visuales implementadas

- Encabezado con eyebrow “Dirección del torneo · Comunicación”, título “Generador de mensajes”, bajada y badges de canal/modalidad.
- Cuatro KPI derivados del contexto ya cargado: jornada sobre total, destinatario, modalidad y estado real de la jornada.
- Pestañas `Apertura de jornada` / `Cierre de jornada` con `role="tab"`, `aria-selected`, iconos Lucide y estado activo en rojo de marca.
- Panel de contexto con selectors de grupo y jornada, nota de no escritura y flujo visual `Datos → Texto → Compartir`.
- Panel de vista previa con chip de verificación, bloque de estado `aria-live="polite"`, texto generado y vista WhatsApp monoespaciada.
- Acciones reorganizadas con botones 3.3: descargar, WhatsApp y copiar; el feedback “Copiado” usa clase `.copiado` en lugar de estilos en línea.
- Estados diferenciados: `verificado` en verde semántico y `bloqueado` en rojo de identidad, con lista de motivos.
- Superficies carbon, bordes sutiles, Inter, radios, sombras, espaciado, tipografía y foco exclusivamente desde tokens de `css/tokens-3.1.css`.
- `prefers-reduced-motion` respetado; sin `:root` alternativo, paleta nueva, fuente alterna ni Rajdhani en UI.

---

## 5. Mejoras UX

- La verificación dejó de ser implícita: el chip resume `Listo` o `N pendiente(s)` y el bloque de estado explica cada motivo.
- Los botones de copiar, descargar y WhatsApp se deshabilitan cuando el texto no está verificado, evitando compartir un mensaje incompleto.
- Cambiar grupo o jornada actualiza el texto y el estado sin recargar la vista completa.
- La vista previa separa “texto generado” de “aspecto en WhatsApp”, con scroll interno en el segundo bloque.
- El foco visible usa `var(--gl-brand-text)` y `var(--gl-focus-ring)`; las pestañas se pueden recorrer con teclado.
- No se añadieron pestañas, filtros que consulten datos, ni operaciones persistentes nuevas.

---

## 6. Funcionalidades comprobadas

**Mock local (datos simulados):**

- Render con datos, sin torneo, cargando, error simulado, datos incompletos y cierre válido.
- Pestañas `Apertura` y `Cierre`; el modo cierre sin jornada cerrada queda bloqueado con `1 pendiente`.
- Cambio de jornada a `6` → `4 pendientes` y 3 botones deshabilitados; volver a `7` → `Listo` y 0 deshabilitados.
- Cambio a grupo `g2` sin datos → `4 pendientes`; volver a `g1` restaura el estado.
- Acciones simuladas: `1` copia, descarga `GOATS_apertura_J7_GA`, `1` apertura de `https://wa.me/` y clase `.copiado` aplicada.
- Foco por teclado en `button.m8-tab`, con contorno visible.
- Movimiento reducido: transición de pestaña ≈ `1e-05s`.
- Consola limpia en todos los escenarios no forzados; el único error registrado corresponde al estado `error` simulado.

**App real autenticada (solo lectura del módulo):**

- Login admin real, navegación a `#mensajes` y render del módulo real con Supabase.
- No se pulsaron copiar, descargar ni WhatsApp; `escriturasModulo` quedó vacío.
- El estado real mostró `4 pendientes` y los tres botones deshabilitados, coherente con la deuda técnica preexistente.

---

## 7. Resultados exactos

| Comprobación | Resultado |
|---|---|
| Vitest | `6 passed` archivos, `80 passed` tests, duración `3.27s`. |
| Sintaxis JS | `36 archivos`, `0 fallos` (`node --check`), incluidos los dos scripts 3.8. |
| Estático 3.3 | `CSS PARSE OK`; `estilos.css` = `1684 reglas`; tokens definidos `125`; tokens consumidos `96`; fuentes `< 12px` = `0`; Rajdhani en UI = `0`; `STATIC 3.3 OK`. |
| Tokens 3.8 | Todas las variables `var(--gl-*)` usadas por la capa `.m8-*` existen en `css/tokens-3.1.css`. |
| Playwright 3.8 mock | `12 capturas`; consola limpia en escenarios no forzados; `1` error registrado únicamente en el estado de error simulado. |
| Estados mock | `datos` → `Listo`, `1076` caracteres, 0 botones bloqueados; `vacio` → `7 pendientes`, 3 bloqueados; `carga` → skeleton; `error` → estado de error; `bloqueado` → `3 pendientes`; `cierreValido` → `Listo`, `1436` caracteres. |
| Contratos conservados | `msg-grupo`, `msg-jornada`, `msg-estado`, `msg-texto`, `msg-preview`, `[data-tipo]`, `[data-descargar]`, `[data-wa]`, `[data-copiar]` presentes. |
| Foco y movimiento | Foco en `button.m8-tab`, `outlineColor rgb(255, 107, 122)`, `outlineWidth 2px`; transición con `prefers-reduced-motion` ≈ `1e-05s`. |
| Hashes Supabase | `4/4` idénticos a los registrados en FASE 3.7. |
| `git -c core.whitespace=cr-at-eol diff --check` | `GIT DIFF CHECK OK`. Persisten advertencias de normalización CRLF preexistentes en otros archivos. |
| Prueba real autenticada | `ejecutada: true`; `hash #mensajes`; título `Generador de mensajes`; KPIs `["1 / 22","Grupo A","Apertura","Abierta"]`; chip `4 pendientes`; `largoTexto 405`; `scrollWidth 1366` con ancho `1366`. |
| Error real preexistente | `3` respuestas HTTP `400` en `/rest/v1/jugadores?...telefono_nacional...`; marcado como deuda técnica heredada, **no corregido**. |

La prueba real incluyó el login existente: se registraron dos POST que corresponden a autenticación y a la RPC de validación de acceso. Ninguno fue introducido por FASE 3.8 y no se ejecutó ninguna escritura del módulo Mensajes.

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

No hubo scroll horizontal injustificado, desbordes internos ni traslapes entre bloques en ninguno de los 8 anchos. En móvil los KPI y los campos pasan a una columna; en tablet los KPI pasan a dos columnas y el layout se apila.

---

## 9. Regresiones ejecutadas

| Regresión | Modo | Resultado |
|---|---|---|
| FASE 3.4 — Dashboard | `despues` | 8 anchos con `scrollWidth` igual al viewport, 0 fuentes `< 12px`, `minControl 44`, 0 desbordes; estados con datos/vacío/carga/error correctos; foco visible. |
| FASE 3.5 — Jugadores | `despues` | 8 anchos sin desbordes; filtros `7 → 1 → 7`, combinados `1`, sin resultados `1`; IDs de registro/edición presentes; `3` errores de validación; guardado de edición simulado `true`; modal móvil dentro del viewport. |
| FASE 3.6 — Equipos | `despues` | 8 anchos sin desbordes; filtros `2 → 1 → 2`; `2` tarjetas, `12` miembros visibles, `16` botones de edición; navegación a Jugadores OK; bottom sheet móvil OK; estados y movimiento reducido OK; consola limpia. |
| FASE 3.7 — Resultados | `despues` | 8 anchos sin desbordes ni traslapes; filtros `4 → 2 → 4`; formulario, IA, estados y consola OK; `1` error únicamente en el estado forzado. |
| FASE 3.3 estático | único | OK, sin fuentes `< 12px` ni Rajdhani en UI. |
| Vitest y sintaxis | únicos | `80 passed`; `36/36` archivos JS sintácticamente válidos. |

Las regresiones se ejecutaron después de los cambios de 3.8. No se detectó degradación en las cuatro fases previas.

---

## 10. Confirmación de límites

- **No** se modificó SQL, migraciones, esquema, columnas, Supabase, RLS, triggers, RPC, Edge Functions ni Storage.
- **No** se modificaron auth, roles ni permisos; el login de prueba usó los mecanismos existentes sin cambios de código.
- **No** se corrigió `column jugadores.telefono_nacional does not exist`; continúa documentado como deuda técnica independiente.
- **No** se modificó `js/core/gl.js` ni las consultas de jugadores para ocultar el error real.
- **No** se cambiaron las plantillas, `generar()`, `setContexto()`, validaciones ni reglas de verificación del generador.
- **No** se añadieron consultas, operaciones persistentes ni escritura de datos desde Mensajes.
- **No** se cambió el contrato de `#administracion`, que sigue abriendo Jugadores por defecto.
- **No** se hicieron commit, push, deploy ni cambios en producción.
- **No** se realizó refactorización general: el cambio se limitó a Mensajes y una capa CSS aditiva al final de `estilos.css`.

---

## 11. Evidencias

Directorio: `docs/capturas-fase-3.8/`

- Capturas mock: `despues-con-datos.png`, `despues-vacio.png`, `despues-cargando.png`, `despues-error.png`, `despues-bloqueado.png`, `despues-cierre-valido.png`, `despues-escritorio.png`, `despues-movil.png`, `despues-jornada-sin-datos.png`, `despues-grupo-sin-datos.png`, `despues-copiado.png`, `despues-cierre-bloqueado.png`.
- Captura real: `despues-mensajes-real.png` (13 PNG en total).
- Datos: `verificacion-despues.json` (mock) y `verificacion-real.json` (app real autenticada, solo lectura del módulo).

Los JSON distinguen explícitamente `ejecutada`, `tipo`, errores de consola, fallos de red, peticiones no GET, escrituras del módulo, escrituras de autenticación y la deuda técnica preexistente.

---

## 12. Limitaciones y pruebas pendientes

- No se ejecutó copiar/descargar/WhatsApp contra la app real: se simuló en el mock para no abrir enlaces externos ni escribir archivos del navegador.
- La prueba real encontró el módulo bloqueado por datos incompletos; por eso no se pudo validar el texto completo de apertura/cierre con datos reales.
- No se corrigió `telefono_nacional`: queda fuera de FASE 3.8 por instrucción explícita.
- No se ejecutó `supabase/tests/fase-2.3.sql`: sigue pendiente por falta de PostgreSQL local; hallazgo heredado.
- No se probaron otros navegadores ni roles no administradores en esta fase.
- Las capturas del arnés local son evidencia de diseño y comportamiento con datos simulados; la evidencia real es únicamente `despues-mensajes-real.png` y su JSON.
- El servidor local usado para la prueba real quedó detenido y el puerto `4173` libre.

---

**Conclusión:** FASE 3.8 entregó un rediseño real y verificable de Mensajes, alineado con Dashboard, Jugadores, Equipos y Resultados, sin alterar datos, reglas de negocio, contratos ni la deuda técnica documentada.
