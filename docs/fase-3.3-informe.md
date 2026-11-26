# FASE 3.3 — Renovación real de componentes UI

**Estado:** implementada y verificada localmente.  
**Fecha:** 2026-11-25.  
**Base:** FASE 3.2 (`docs/fase-3.2-informe.md`), tokens canónicos en `css/tokens-3.1.css`.

---

## A. Resumen ejecutivo

Se renovaron los componentes visibles del sistema —botones, formularios, tarjetas/paneles, tablas, KPI/gráficos, modales y estados— usando **exclusivamente** los tokens de `css/tokens-3.1.css`. No se creó una segunda paleta ni un `:root` alternativo.

Los cambios quedaron en una capa de consistencia al final de `css/estilos.css`, más ajustes puntuales en helpers compartidos (`js/core/gl.js`, `js/core/ui-estados.js`) y en las opciones visuales de los gráficos. Se conservaron clases, IDs, eventos, acciones y estructura funcional.

La verificación fue local y sin red: Vitest `80 passed (80)`, sintaxis JS `26/26`, CSS parseable, 8 anchos sin scroll horizontal, controles táctiles de 44 px, foco visible, modales accesibles, hashes Supabase intactos y capturas antes/después en `docs/capturas-fase-3.3/`.

El banco de pruebas `mock-componentes-3.3.html` se mantuvo abierto en el panel de navegador del lado derecho para mostrar los cambios en tiempo real mientras se aplicaban.

---

## B. Archivos modificados

### Modificados

| Archivo | Cambio de FASE 3.3 |
|---|---|
| `css/estilos.css` | Capa `FASE 3.3 — SISTEMA DE COMPONENTES`: botones 44 px y variantes, formularios, tarjetas/KPI, tablas, modales, estados, skeleton y responsive. Corrección de `.estado-sugerencia`, `.modal-head-ico-info` y especificidad de `.btn.sec/.peligro/.verde`. |
| `js/core/gl.js` | `GL.tema` lee colores desde tokens; toasts con Inter y colores canónicos; `activarModalAccesible()` con Escape, Tab contenido, cierre idempotente y retorno de foco; `abrirModal`, `dialogo`, `confirmar` y `confirmarPeligro` usan el helper; spinner del diálogo con `loader-circle`. |
| `js/core/ui-estados.js` | `GL.estado()` emite `is-cargando`, `is-vacio` e `is-error`, icono dentro de escala (24 px) y `role/aria-live` adecuados. |
| `js/modulos/stats-globales.js` | Gráficos y KPI usan `GL.tema` (Inter + roles de color canónicos); se eliminaron Rajdhani y colores legacy de la UI. |
| `js/modulos/dashboard-admin.js` | Ídem en las cuatro gráficas del centro de control; paleta categórica reducida a roles de tokens. |
| `js/modulos/eliminatorias.js` | `font-family:Rajdhani` → `font-family:var(--gl-font-sans)` (3 ocurrencias). |
| `js/modulos/fixture.js` | Ídem (1 ocurrencia). |
| `js/modulos/admin.js` | Ídem (1 ocurrencia). |
| `js/modulos/resultados.js` | Ídem (1 ocurrencia). |
| `js/modulos/perfil.js` | Ídem (1 ocurrencia). |
| `js/modulos/stats-jornada.js` | Ídem (2 ocurrencias). |

### Creados

| Archivo | Propósito |
|---|---|
| `scripts/verificar-fase-3.2.ps1` | Verificador estático del estado esperado tras FASE 3.2 (no existía). El histórico `verificar-fase-3.1.ps1` quedó intacto. |
| `scripts/verificar-fase-3.3-estatico.mjs` | Parseo CSS, `:root` único, tokens consumidos, fuentes, colores legacy y escala de iconos. |
| `scripts/verificar-fase-3.3-visual.mjs` | Harness Playwright local: 8 anchos, interacción, foco, modal y capturas antes/después. |
| `mock-componentes-3.3.html` | Banco de pruebas local con componentes reales y `supabase.createClient` simulado. |
| `docs/capturas-fase-3.3/` | 16 PNG (8 antes + 8 después) y 2 JSON de verificación. |
| `docs/fase-3.3-informe.md` | Este informe. |

> No se modificaron `index.html`, SQL, migraciones, RLS, Supabase remoto, auth, permisos, roles, datos, cálculos, validaciones, rutas ni IDs en FASE 3.3.

---

## C. Componentes renovados

1. **Botones y acciones**
   - Altura mínima 44 px en todas las variantes, incluidas `.btn.sec`, `.btn.peligro`, `.btn.verde`, `.btn.contorno`, `.btn.texto` y `.btn.sm`.
   - Jerarquía: primario rojo de marca, secundario superficie, contorno, texto, peligro y éxito.
   - `.btn-icon`, `.btn-icono`, `.btn-pag`, `.btn-expandir` y `.btn-aud-det` comparten contenedor cuadrado de 44 px y foco tokenizado.
   - Estados `disabled`, `aria-disabled` y `.cargando` con spinner y `aria-busy`.

2. **Formularios y campos**
   - Etiquetas uppercase con `--gl-track-label`, campos obligatorios en rojo de marca.
   - Inputs/selects/textareas de 44 px con borde, hover, foco con `--gl-focus-ring` y placeholder legible.
   - Errores con borde de marca, barra lateral y `.campo-estado.mal` sobre `--gl-danger-bg`.
   - Ayuda, validación, toggles y campo de contraseña de auth alineados con la misma escala.

3. **Tarjetas, paneles y KPI**
   - Superficie única, borde `--gl-border`, radio `--gl-radius` y elevación `--gl-shadow-1`.
   - `.card-titulo`, `.metrica`, `.lista-top` y `.partido-card` con jerarquía y cifras `tabular-nums`.
   - Gráficos sobre `GL.tema`: Inter, textos secundarios, tooltip carbon y semánticos success/warning/brand/info.

4. **Tablas y listados**
   - `.tabla-wrap` y `.tabla-wrap-scroll` con borde y superficie consistentes.
   - Cabecera uppercase, celdas de 13 px, filas alternas tenues, hover, selección con barra de marca y columnas numéricas tabulares.
   - Paginación de 44 px y contenedor con scroll sin provocar overflow en 320–1920 px.

5. **Modales y diálogos**
   - Fondo con blur, tamaños `sm/md/lg`, cabecera, cuerpo con scroll y acciones en pie.
   - En móvil: modal inferior y pie sticky con botones flexibles.
   - `aria-modal`, `aria-labelledby`, foco inicial dentro, trampa de Tab, Escape, cierre por fondo y devolución del foco al disparador.
   - Iconos de estado semánticos: normal/info azul, peligro rojo de marca.

6. **Estados de interfaz**
   - `GL.estado()` produce `is-cargando`, `is-vacio` e `is-error` con `role=status/alert` y `aria-live`.
   - Barra de progreso, skeleton y estados vacíos sobre superficies canónicas.
   - `GL.conAccion()` conserva el HTML original del botón y restaura `disabled` y `aria-busy` al finalizar.

7. **Notificaciones**
   - Toastify usa Inter, radios y sombras del sistema, y colores de estado leídos de tokens.

---

## D. Verificaciones

| Verificación | Resultado |
|---|---|
| Vitest (`vitest run --no-cache`) | **80 passed (80)**, 6 archivos |
| Sintaxis JS (`node --check` sobre `js/`) | **SYNTAX OK (26 archivos)** |
| Parseo CSS (PostCSS) | `tokens-3.1.css` 1 regla · `estilos.css` 1190 reglas · **OK** |
| `scripts/verificar-fase-3.2.ps1` | **OK** |
| Verificador histórico 3.1 | Quedó intacto; sigue fallando por diseño |
| `scripts/verificar-fase-3.3-estatico.mjs` | **OK**: `:root`=1 solo en tokens, 125 tokens definidos / 87 consumidos, Rajdhani en UI=0, fuentes <12 px=0, colores legacy en UI=0 |
| Hashes Supabase | **4/4 OK** (migration-seguridad 2.3, tests/fase-2.3, configuracion-completa, migration-telefonos 2.2) |
| `git diff --check` | Con la configuración del repo, CRLF preexistentes se reportan como whitespace; `git -c core.whitespace=cr-at-eol diff --check` quedó **limpio** |
| Playwright local (Chrome del sistema, sin red) | **8/8 anchos** sin scroll horizontal; `scrollWidth === width` en 320, 375, 390, 430, 768, 1024, 1366 y 1920 |
| Controles táctiles | `minControl = 44 px` en los 8 anchos |
| Iconografía accesible | 0 botones icono sin `aria-label` |
| Foco | `:focus-visible` con outline 2 px `rgb(255,107,122)` |
| Modales | Dentro del viewport, `aria-modal=true`, foco dentro al abrir, cierre con Escape y foco restaurado |
| Interacción | 9/9 botones del arnés respondieron a sus eventos |
| Consola del navegador | 0 errores en el arnés cargado en el panel derecho |
| Supabase remoto | Bloqueado: `window.supabase.createClient` simulado y rutas HTTP(S) abortadas |

---

## E. Evidencia visual

Directorio: `docs/capturas-fase-3.3/`

| Captura | Contenido |
|---|---|
| `antes-escritorio.png` / `despues-escritorio.png` | Vista completa del arnés a 1366 px |
| `antes-botones.png` / `despues-botones.png` | Botones, variantes, iconos, disabled y cargando |
| `antes-formularios.png` / `despues-formularios.png` | Campos, ayuda, error, selects, fechas y toggles |
| `antes-tarjetas-kpi.png` / `despues-tarjetas-kpi.png` | Tarjetas, métricas y paneles |
| `antes-tablas.png` / `despues-tablas.png` | Tabla, badges, acciones y paginación |
| `antes-estados.png` / `despues-estados.png` | Carga, vacío, error y skeleton |
| `antes-modales.png` / `despues-modales.png` | Diálogo peligroso abierto |
| `antes-movil.png` / `despues-movil.png` | Vista móvil a 390 px |
| `verificacion-antes.json` / `verificacion-despues.json` | Métricas crudas de cada pasada |

Comparación observable: antes los botones `.sec/.peligro/.verde` medían 40 px y los estados no emitían clases `is-*`; después todos los controles miden 44 px, el modal devuelve el foco y los estados exponen su variante semántica.

---

## F. Pendientes

1. `js/modulos/exportar-png.js` conserva Rajdhani y la paleta anterior porque la exportación PNG quedó explícitamente fuera de FASE 3.2/3.3; la migración **no** se ejecutó en 3.4 y sigue como deuda P2-03.
2. No hay PostgreSQL local: `supabase/tests/fase-2.3.sql` sigue sin ejecutarse y FASE 2.3 no está en producción (heredado de fases anteriores).
3. Los E2E con login real siguen desactivados por ausencia de `GL_ADMIN_EMAIL` / `GL_ADMIN_PASS`.
4. Las pantallas que dependen de datos remotos no se probaron contra Supabase; la evidencia visual usa el arnés local con mocks.
5. Los warnings de CRLF y los cambios SQL/preexistentes visibles en `git status` pertenecen a FASE 2.x; FASE 3.3 no los tocó.

---

## G. Confirmaciones finales

- No se instalaron dependencias.
- No se hizo commit, push ni deploy.
- No se modificaron DB, SQL, RLS, Supabase remoto, auth, permisos, roles ni datos.
- No se modificaron cálculos, validaciones, rutas, IDs, clases funcionales ni eventos existentes.
- `css/tokens-3.1.css` sigue siendo la única fuente de tokens; `css/estilos.css` solo los consume.
- Los cambios son locales y reversibles desde el árbol de trabajo.
