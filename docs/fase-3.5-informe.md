# FASE 3.5 — Rediseño profesional del módulo de Jugadores

**Estado:** implementada y verificada localmente.  
**Fecha:** 2026-11-25.  
**Base obligatoria:** FASE 3.1 / 3.2 / 3.3 y, especialmente, el estándar de FASE 3.4 (`docs/estandar-visual-modulos-3.4.md`).  
**Fuente única de verdad visual:** `css/tokens-3.1.css`.

---

## 1. Archivos modificados y creados

### Modificados en FASE 3.5

| Archivo | Cambio |
|---|---|
| `js/modulos/admin.js` | Rediseño de la pestaña real `jugadores`, filtros locales, helpers visuales y presentación de los modales de alta/edición. |
| `css/estilos.css` | Capa final `FASE 3.5 — JUGADORES DE REFERENCIA`, usando solo `var(--gl-*)`. |

No se modificaron `dashboard-admin.js`, `perfil.js`, `admin.js` → pestaña “Resumen”, SQL, Supabase, auth, roles ni permisos.

### Creados para verificación y evidencia

| Archivo | Uso |
|---|---|
| `mock-jugadores-3.5.html` | Arnés local con `GL` simulado y Supabase falso. No es la app real. |
| `scripts/verificar-fase-3.5-visual.mjs` | Playwright de capturas, responsive, filtros, formularios, modales, estados y consola. |
| `docs/capturas-fase-3.5/` | 19 PNG y 2 JSON: 6 “antes”, 13 “después”. |
| `docs/fase-3.5-informe.md` | Este informe. |

---

## 2. Mejoras visuales implementadas

- Encabezado compacto **Jugadores** con eyebrow, descripción, torneo activo y acción principal “Agregar jugador”.
- Cuatro KPI derivados **solo de datos ya cargados**: `En plantel`, `Sin grupo`, `Con alerta` y `Inactivos`.
- Panel de búsqueda/filtros compacto con contador en vivo y nota que aclara que no modifica el torneo.
- Plantel con jerarquía clara: avatar, nombre, país, horario, contacto, grupo, rol, estado, faltas y acciones.
- Tabla moderna en escritorio; **tarjetas adaptables hasta 1024 px** mediante `data-label`, sin scroll horizontal incómodo.
- Estados visuales con `GL` y tokens: carga, vacío, sin coincidencias, error y datos.
- Modales de alta y edición reorganizados en dos secciones, con intro, leyenda de obligatorios, ayudas y aviso de seguridad.
- Foco visible del rojo de marca, hover/disabled heredados de FASE 3.3 y `prefers-reduced-motion` respetado.
- Iconografía exclusivamente vía `icono()`/Lucide; tipografía Inter; superficies carbon; bordes y elevación de tokens.

No se declaró un nuevo `:root`, paleta, fuente ni dependencia.

---

## 3. Mejoras de experiencia de usuario

- Los filtros no existían en la pestaña Jugadores. Se añadieron **controles locales de solo presentación** sobre la lista ya cargada: nombre, grupo, estado, combinación entre ellos, contador y limpieza. No hacen consultas ni escriben datos.
- El estado “sin coincidencias” explica qué pasó y ofrece limpiar filtros.
- El menú de acciones móvil sigue siendo bottom sheet y conserva `aria-haspopup`, `aria-expanded`, cierre por `Escape` y `window._menuAccionesActivo`.
- Los formularios mantienen todos sus IDs y validaciones, pero ahora muestran mejor las ayudas, los obligatorios y la organización de campos.
- Las pestañas administrativas envuelven en móvil y tienen objetivo táctil de 44 px.
- Se conservaron todos los `data-accion`, `data-agregar`, `data-tab`, IDs de formulario y eventos existentes.

---

## 4. Funcionalidades comprobadas

- Render real del módulo `Modulos.admin` con `setTab('jugadores')`.
- Navegación a `#administracion` y pestaña `jugadores` activa.
- 41 botones `data-accion` conservados en el listado.
- Búsqueda: 7 jugadores → 1 con `CR7` → 7 al limpiar.
- Combinación grupo `g2` + estado `activo`: 1 jugador.
- Grupo `g1` + estado `suspendido`: estado sin coincidencias visible.
- Limpieza desde el estado vacío restaura los 7 jugadores.
- Modal de registro: presentes `ag-nombre`, `ag-pais`, `ag-zona`, `ag-tel`, `ag-grupo`, `ag-email`, `ag-clave`, `ag-crear`.
- Validaciones visibles al enviar el formulario vacío: 3 errores inline.
- Modal de edición: presentes `ed-nombre`, `ed-pais`, `ed-zona`, `ed-tel`, `ed-guardar`; cierra correctamente.
- Guardado de edición simulado con `sb` local: el modal se cierra, el contexto se recarga y el nombre editado aparece en el listado (`guardoEdicion: true`). No hubo escritura remota.
- Modal de registro en móvil: ancho 351 px dentro de viewport de 390 px y cuerpo desplazable.
- Menú móvil: abre bottom sheet y cierra con `Escape`.
- Estados `datos`, `vacio`, `carga` y `error` verificados con mocks locales.

---

## 5. Resultados exactos de las pruebas

| Prueba | Resultado |
|---|---|
| Vitest completo | `80 passed (80)`, 6 archivos, 2.17 s. |
| Sintaxis JavaScript | `SYNTAX OK (36 archivos)`. |
| Verificador estático FASE 3.3 | `CSS PARSE OK`, `estilos.css` 1418 reglas, 125 tokens definidos / 93 consumidos, fuentes < 12 px = 0, Rajdhani en UI = 0, `STATIC 3.3 OK`. |
| Parseo de CSS | OK, incluido en el verificador estático. |
| Regresión visual FASE 3.4 | 8/8 anchos con `scrollWidth === width`; 0 fuentes < 12 px; `minControl=44`; 37 `data-ir`; 8 destinos; refresco con skeleton; foco `rgb(255,107,122)`; consola sin errores. |
| Playwright FASE 3.5 | 13 capturas “después”; filtros, formularios, guardado simulado, menú, estados y navegación OK; `erroresConsola: []`. |
| Foco visible | `outlineColor: rgb(255, 107, 122)`, `outlineWidth: 2px`. |
| Movimiento reducido | `transitionDuration` y `animationDuration` = `1e-05s`. |
| `git -c core.whitespace=cr-at-eol diff --check` | `GIT_DIFF_CHECK=0` (warnings CRLF preexistentes). |
| Hashes Supabase | 4/4 idénticos (ver §8). |

Comparación “antes → después” en el arnés: fuentes menores de 12 px `7 → 0`, control mínimo `18 px → 44 px` en escritorio, desbordes internos `1-3 → 0`.

---

## 6. Resoluciones verificadas

| Ancho | `scrollWidth` | Fuentes < 12 px | Control mínimo | Filas KPI | Desbordes internos | Traslapes | `tablaScroll` |
|---:|---:|---:|---:|---:|---:|---:|---|
| 320 | 320 | 0 | 44 px | 4 | 0 | 0 | 270/270 |
| 375 | 375 | 0 | 44 px | 2 | 0 | 0 | 325/325 |
| 390 | 390 | 0 | 44 px | 2 | 0 | 0 | 340/340 |
| 430 | 430 | 0 | 44 px | 2 | 0 | 0 | 380/380 |
| 768 | 768 | 0 | 44 px | 2 | 0 | 0 | 690/690 |
| 1024 | 1024 | 0 | 44 px | 2 | 0 | 0 | 946/946 |
| 1366 | 1366 | 0 | 44 px | 1 | 0 | 0 | 1286/1286 |
| 1920 | 1920 | 0 | 44 px | 1 | 0 | 0 | 1360/1360 |

---

## 7. Problemas encontrados que quedaron pendientes

- Ninguno dentro del alcance de FASE 3.5.
- No existe ficha individual en el módulo Jugadores dentro de `admin.js`; no se creó una nueva funcionalidad de perfil ni se modificó `perfil.js`.
- `js/modulos/exportar-png.js` conserva Rajdhani y la paleta anterior: hallazgo heredado, migración prevista fuera de esta fase y deuda vigente en 3.19.
- `supabase/tests/fase-2.3.sql` sigue sin ejecutarse por falta de PostgreSQL local: hallazgo heredado de FASE 2.3, no bloquea esta fase.

---

## 8. Confirmación de límites

- No se modificaron archivos SQL, migraciones, RLS, triggers, RPC, Edge Functions, Supabase remoto, autenticación, roles, permisos, datos persistidos ni estructura de datos.
- No se cambiaron reglas de validación, campos persistidos, contratos de funciones, cálculos deportivos, inscripción, asignación ni operaciones de crear/editar/eliminar/activar/desactivar/asignar.
- Hashes confirmados:
  - `supabase/migration-seguridad-2.3.sql` = `BED31B2D08D3CA38576FE46E997BD218CA09B8B9B7B53AF97AF811BAB7363D18`
  - `supabase/tests/fase-2.3.sql` = `BC29237F03E36A8FF20CCB8AEE077E1CFE90129A08C93995F3D00E5AC4D81D0C`
  - `supabase/configuracion-completa.sql` = `D844045A8B28FA867C871E085B7AA354070474EA0E242D274C4A4FCE9FEBC197`
  - `supabase/migration-telefonos-2.2.sql` = `C2D0022B7243A78D118F8605014AD24E43CFBAFAC077059C2FF072B9753D1286`
- `git status` incluye cambios Supabase/preexistentes de FASE 2.x; FASE 3.5 solo tocó `js/modulos/admin.js` y `css/estilos.css` dentro del código fuente.
- No se hizo commit, push ni deploy.

---

## 9. Ubicación de capturas y documentación

- `docs/capturas-fase-3.5/despues-escritorio.png`
- `docs/capturas-fase-3.5/despues-movil.png`
- `docs/capturas-fase-3.5/despues-busqueda.png`
- `docs/capturas-fase-3.5/despues-filtros-combinados.png`
- `docs/capturas-fase-3.5/despues-sin-resultados.png`
- `docs/capturas-fase-3.5/despues-formulario-registro.png`
- `docs/capturas-fase-3.5/despues-formulario-edicion.png`
- `docs/capturas-fase-3.5/despues-formulario-registro-movil.png`
- `docs/capturas-fase-3.5/despues-menu-movil.png`
- `docs/capturas-fase-3.5/despues-vacio.png`
- `docs/capturas-fase-3.5/despues-cargando.png`
- `docs/capturas-fase-3.5/despues-error.png`
- `docs/capturas-fase-3.5/despues-con-datos.png`
- `docs/capturas-fase-3.5/verificacion-despues.json`
- `docs/capturas-fase-3.5/antes-*.png` y `verificacion-antes.json` como línea base.

Las capturas provienen del arnés local `mock-jugadores-3.5.html`; **no se presentan como capturas de Supabase remoto ni de producción**.

---

## 10. Limitaciones y pruebas no ejecutadas

- No había `GL_ADMIN_EMAIL` / `GL_ADMIN_PASS`: no se ejecutó E2E con login real contra Supabase remoto. Las pruebas visuales usaron mocks locales con datos simulados y `sb` falso.
- No hay PostgreSQL local: no se ejecutó `supabase/tests/fase-2.3.sql` (heredado).
- Supabase remoto se mantuvo bloqueado para pruebas visuales, según restricción de la fase.
- No se realizó deploy ni verificación en GitHub Pages.

La FASE 3.5 queda implementada, comprobada y documentada localmente.
