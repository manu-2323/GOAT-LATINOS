# FASE 3.6 — Rediseño visual y UX real de Equipos

**Estado:** implementada y verificada localmente.  
**Fecha:** 2026-11-25.  
**Base obligatoria:** FASE 3.3 / 3.4 / 3.5 y `docs/estandar-visual-modulos-3.4.md`.  
**Fuente única de verdad visual:** `css/tokens-3.1.css`.

---

## 1. Archivos modificados y creados

### Modificados en FASE 3.6

| Archivo | Cambio |
|---|---|
| `js/modulos/admin.js` | Nueva pestaña aditiva `equipos` dentro de `#administracion`, helpers de presentación, filtros locales y panel expandible de jugadores. No se tocó `htmlJugadores()` ni `modalGrupo()`. |
| `css/estilos.css` | Capa final `FASE 3.6 — EQUIPOS REALES (GRUPOS DEL TORNEO)`, con `var(--gl-*)` y componentes 3.3/3.4/3.5. |

No se modificaron `dashboard-admin.js`, `mock-jugadores-3.5.html`, `mock-dashboard-3.4.html`, SQL, Supabase, auth, roles ni permisos.

### Creados para verificación y evidencia

| Archivo | Uso |
|---|---|
| `mock-equipos-3.6.html` | Arnés local con `GL` simulado y `sb` falso. **No es la app real.** |
| `scripts/verificar-fase-3.6-visual.mjs` | Playwright: capturas, 8 anchos, filtros, relaciones, modales, navegación, estados, foco, movimiento reducido y consola. |
| `scripts/verificar-fase-3.6-real.mjs` | Playwright de lectura autenticada contra la app real servida en local. No ejecuta escrituras. |
| `scripts/servir-local-3.6.mjs` | Servidor estático local usado para la prueba real. |
| `docs/capturas-fase-3.6/` | 14 PNG y 2 JSON: 13 capturas con mocks + 1 captura real autenticada. |
| `docs/fase-3.6-informe.md` | Este informe. |

---

## 2. Decisión de alcance: qué significa “Equipos”

En el código real **no existe** un módulo ni hash `#equipos`. Los equipos reales son los **grupos del torneo activo**:

- `GL.grupos()` → grupos creados por `gl_crear_torneo`.
- `GL.ctx.miembros` → relaciones `grupo_jugadores` ya cargadas y filtradas al torneo activo.
- `GL.jugadores(g.id)` / `GL.jugador(id)` → resolución de cada relación.
- `Mod.partidosCache` → partidos ya registrados por grupo.

Por eso se añadió una pestaña `equipos` **dentro de `#administracion`**, sin crear un hash nuevo, sin modificar `menu.js` y sin quitar `jugadores` como pestaña por defecto. No se crearon operaciones de alta, edición, eliminación ni activación de equipos porque esas operaciones no existen en el producto.

---

## 3. Mejoras visuales implementadas

- Encabezado **Equipos** con eyebrow, bajada, torneo activo y cupo esperado por equipo.
- Cuatro KPI derivados **solo de datos ya cargados**: `Equipos`, `Jugadores asignados`, `Sin equipo` y `Completos`.
- Tarjetas de grupo con escudo simbólico, nombre real, letra de grupo, badge `Completo` / `Incompleto` / `Sin jugadores`, contador `n/esperados`, barra de progreso, partidos jugados, partidos pendientes y alerta de disponibilidad.
- Panel de búsqueda y filtros con contador en vivo y nota que aclara que no modifica el torneo.
- Panel expandible **Ver jugadores / Ocultar jugadores** con `aria-expanded` y `aria-controls`.
- Lista de jugadores con avatar, nombre real, país y estado; en escritorio conserva `data-accion="editar-<id>"` y en móvil conserva el bottom sheet existente.
- Estados visuales con tokens: con datos, vacío, sin coincidencias, carga y error.
- Foco visible del rojo de marca, hover/disabled heredados y `prefers-reduced-motion` respetado.
- Iconografía exclusivamente vía `icono()`/Lucide; Inter; superficies carbon; bordes, radios, sombras y espaciado de tokens.

No se declaró un nuevo `:root`, paleta, fuente ni dependencia. Rajdhani en UI = 0.

---

## 4. Mejoras de experiencia de usuario

- El panel de administración ahora permite ver los equipos sin salir de `#administracion`.
- Los filtros son **locales de solo presentación**: nombre (sin distinción de tildes) y cobertura (`completo`, `incompleto`, `sin-jugadores`), con combinación, contador y limpieza. No hacen consultas ni escriben datos.
- El estado “sin coincidencias” explica qué ocurrió y ofrece limpiar filtros.
- Cada tarjeta muestra cobertura real y partidos ya registrados, sin inventar resultados.
- “Ver plantel” reutiliza `data-tab-ir="jugadores"` y lleva a la pestaña 3.5 sin cambiar su contrato.
- Si el contexto de jugadores está vacío pero hay relaciones registradas, se muestra un aviso sobrio y se listan las relaciones por `jugador_id`; es un estado derivado de los datos cargados, no un dato inventado.
- Las pestañas administrativas envuelven en móvil y mantienen objetivo táctil de 44 px.
- Se conservaron IDs, `data-*`, eventos, navegación y contratos existentes de FASE 3.4/3.5.

---

## 5. Relaciones equipo-jugador revisadas (sin cambios)

Se revisó el flujo real y se dejó intacto:

- Los grupos se crean solo con `gl_crear_torneo` (`Grupo A` y `Grupo B`).
- La asignación real sigue en `modalGrupo(j, root, asignar)` con `#gr-grupo` / `#gr-guardar`.
- Se mantiene el borrado e inserción de `grupo_jugadores`, la auditoría `jugador_grupo_cambio`, `GL.invalidar()` y la recarga posterior.
- No se cambiaron las reglas de primera semana, jugadores expulsados, mismo grupo, unicidad por torneo, admins fuera de grupos ni el fixture de 12 activos por grupo.
- La vista 3.6 solo **lee** relaciones: filtra `GL.ctx.miembros` por `grupo_id`, resuelve `GL.jugador(m.jugador_id)` y muestra el resultado. No escribe `grupo_jugadores`, no reasigna y no crea grupos.

---

## 6. Funcionalidades comprobadas

- Render real de `Modulos.admin` con `setTab('equipos')`.
- Navegación autenticada real a `#administracion` → pestaña **Equipos**: título `Equipos`, 2 tarjetas reales, contador `2 equipos` y `scrollWidth === 1366`.
- Con mocks: 2 equipos, 16 relaciones, KPI `16`, panel con 12 jugadores visibles al expandir, 16 botones de edición y 16 menús móviles.
- Búsqueda: 2 equipos → 1 con `grupo b` → 2 al limpiar.
- Cobertura `completo`: 1 equipo; `incompleto`: 1 equipo; `sin-jugadores`: 0 tarjetas y estado sin coincidencias visible.
- Limpieza desde el estado sin coincidencias restaura los 2 equipos.
- Expansión de jugadores: `aria-expanded` cambia y el panel deja de estar `hidden`.
- Modal de edición heredado: IDs `ed-nombre`, `ed-pais`, `ed-zona`, `ed-tel`, `ed-guardar` presentes y cierre correcto.
- “Ver plantel”: abre `jugadores`, oculta `equipos` y conserva `.j5-pantalla`.
- Menú móvil: abre bottom sheet y cierra con `Escape`.
- Estados `datos`, `vacio`, `carga` y `error` verificados con mocks.
- Foco visible y movimiento reducido verificados.

---

## 7. Resultados exactos de las pruebas

| Prueba | Resultado |
|---|---|
| Vitest completo | `80 passed (80)`, 6 archivos, 1.61 s. |
| Sintaxis JavaScript | `48 archivos JS/MJS`, `0 fallos`. |
| Verificador estático FASE 3.3 | `CSS PARSE OK`, `estilos.css` 1512 reglas, 125 tokens definidos / 94 consumidos, fuentes < 12 px = 0, Rajdhani en UI = 0, `STATIC 3.3 OK`. |
| Parseo de CSS | OK, incluido en el verificador estático. |
| Regresión visual FASE 3.4 | 8/8 anchos con `scrollWidth === width`; 0 fuentes < 12 px; `minControl=44`; 37 `data-ir`; 8 destinos; refresco con skeleton; foco `rgb(255,107,122)`; consola sin errores. |
| Regresión visual FASE 3.5 | 13 capturas; 8/8 anchos sin desbordes ni traslapes; filtros, formularios, guardado simulado, menú y estados OK; `jugadoresActivo: true`, `sigueJ5: true`; consola sin errores. La lista de pestañas ahora incluye `equipos` de forma aditiva. |
| Playwright FASE 3.6 | 13 capturas con mocks; 8/8 anchos sin overflow; `minControl=44`; filtros, relaciones, modal, navegación, estados, foco y movimiento reducido OK; `erroresConsola: []`. |
| Prueba real autenticada | `ejecutada: true`; solo lectura; 2 tarjetas reales; sin escritura en Supabase. |
| Foco visible | `outlineColor: rgb(255, 107, 122)`, `outlineWidth: 2px`. |
| Movimiento reducido | `transitionDuration` y `animationDuration` = `1e-05s`. |
| `git -c core.whitespace=cr-at-eol diff --check` | `GIT_DIFF_CHECK=0` (warnings CRLF preexistentes). |
| Hashes Supabase | 4/4 idénticos (ver §9). |

**Hallazgo real, preexistente y fuera de alcance:** la app real devuelve HTTP 400 en la consulta de `jugadores` de `js/core/gl.js`:

```
42703 · column jugadores.telefono_nacional does not exist
```

Eso deja `GL.ctx.jugadores` vacío en el entorno remoto actual. La vista 3.6 no modifica esa consulta ni la base de datos; por eso, en la captura real, los nombres no se muestran y el aviso condicional indica que solo hay relaciones registradas. La prueba con mocks cubre la presentación completa con nombres y estados.

---

## 8. Resoluciones verificadas

| Ancho | `scrollWidth` | Fuentes < 12 px | Control mínimo | Filas KPI | Desbordes internos | Traslapes |
|---:|---:|---:|---:|---:|---:|---:|
| 320 | 320 | 0 | 44 px | 4 | 0 | 0 |
| 375 | 375 | 0 | 44 px | 4 | 0 | 0 |
| 390 | 390 | 0 | 44 px | 2 | 0 | 0 |
| 430 | 430 | 0 | 44 px | 2 | 0 | 0 |
| 768 | 768 | 0 | 44 px | 2 | 0 | 0 |
| 1024 | 1024 | 0 | 44 px | 2 | 0 | 0 |
| 1366 | 1366 | 0 | 44 px | 1 | 0 | 0 |
| 1920 | 1920 | 0 | 44 px | 1 | 0 | 0 |

---

## 9. Confirmación de límites

- No se modificaron archivos SQL, migraciones, RLS, triggers, RPC, Edge Functions, Supabase remoto, autenticación, roles, permisos, datos persistidos ni estructura de datos.
- No se cambiaron reglas de negocio, cálculos deportivos, asignación, inscripción, ni operaciones de crear/editar/eliminar/activar equipos.
- No se modificaron FASE 3.4 ni FASE 3.5 en código fuente; sus verificadores se ejecutaron solo como regresión.
- Hashes confirmados:
  - `supabase/migration-seguridad-2.3.sql` = `BED31B2D08D3CA38576FE46E997BD218CA09B8B9B7B53AF97AF811BAB7363D18`
  - `supabase/tests/fase-2.3.sql` = `BC29237F03E36A8FF20CCB8AEE077E1CFE90129A08C93995F3D00E5AC4D81D0C`
  - `supabase/configuracion-completa.sql` = `D844045A8B28FA867C871E085B7AA354070474EA0E242D274C4A4FCE9FEBC197`
  - `supabase/migration-telefonos-2.2.sql` = `C2D0022B7243A78D118F8605014AD24E43CFBAFAC077059C2FF072B9753D1286`
- `git status` incluye cambios preexistentes de FASE 2.x/3.x; FASE 3.6 solo tocó `js/modulos/admin.js` y `css/estilos.css` dentro del código fuente.
- No se hizo commit, push ni deploy.

---

## 10. Capturas, limitaciones y pruebas no ejecutadas

### Capturas

- `docs/capturas-fase-3.6/despues-con-datos.png`
- `docs/capturas-fase-3.6/despues-escritorio.png`
- `docs/capturas-fase-3.6/despues-movil.png`
- `docs/capturas-fase-3.6/despues-busqueda.png`
- `docs/capturas-fase-3.6/despues-filtros-combinados.png`
- `docs/capturas-fase-3.6/despues-sin-resultados.png`
- `docs/capturas-fase-3.6/despues-jugadores-asociados.png`
- `docs/capturas-fase-3.6/despues-formulario-edicion.png`
- `docs/capturas-fase-3.6/despues-menu-movil.png`
- `docs/capturas-fase-3.6/despues-vacio.png`
- `docs/capturas-fase-3.6/despues-cargando.png`
- `docs/capturas-fase-3.6/despues-error.png`
- `docs/capturas-fase-3.6/despues-destino-plantel.png`
- `docs/capturas-fase-3.6/despues-equipos-real.png`
- `docs/capturas-fase-3.6/verificacion-despues.json`
- `docs/capturas-fase-3.6/verificacion-real.json`

Las capturas `despues-*.png` salvo `despues-equipos-real.png` provienen del arnés local con datos simulados; **no se presentan como capturas de Supabase remoto ni de producción**. `despues-equipos-real.png` sí proviene de la app real autenticada en local, con datos reales de grupos y relaciones.

### Limitaciones

- No se generaron capturas “antes” de 3.6: la pestaña `equipos` no existía y el punto de partida es el estado verificado de FASE 3.5.
- La prueba real se hizo con las credenciales proporcionadas, inyectadas por variables de entorno y sin exponerlas en el informe. Solo navegó y leyó; no creó, editó ni eliminó nada.
- El error 400 preexistente de `jugadores.telefono_nacional` impide ver nombres reales en el entorno remoto actual. No se corrigió porque requeriría tocar la consulta base / esquema, fuera de esta fase.
- No hay PostgreSQL local: `supabase/tests/fase-2.3.sql` sigue sin ejecutarse (heredado).
- No se realizó deploy ni verificación en GitHub Pages.

La FASE 3.6 queda implementada, comprobada y documentada localmente.
