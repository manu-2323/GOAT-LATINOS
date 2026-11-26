# FASE 3.4 — Dashboard de referencia (Centro de control)

**Estado:** implementada y verificada localmente.  
**Fecha:** 2026-11-25.  
**Base:** FASE 3.2 y FASE 3.3 (`docs/fase-3.2-informe.md`, `docs/fase-3.3-informe.md`), tokens canónicos en `css/tokens-3.1.css`.

---

## 1. Alcance real de la fase

Se rediseñó el dashboard real de GOAT-LATINOS: `js/modulos/dashboard-admin.js`, accesible en `#dashboard-admin` y titulado **Centro de control**. Se eligió ese módulo porque es el único dashboard explícito del sistema y ya concentraba KPI, alertas, cuatro gráficas y acciones administrativas reales.

`js/modulos/admin.js` (“Resumen”) es un panel administrativo distinto y **no se modificó**.

No se convirtió la fase en una auditoría: se revisaron brevemente los informes previos, los tokens, la capa de componentes 3.3, el enrutador (`js/app.js`), la navegación (`js/ui/menu.js`), el módulo, los estilos `.da-*` y los helpers `GL`, y después se implementó directamente.

---

## 2. Archivos modificados y creados

### Modificados en FASE 3.4

| Archivo | Cambio |
|---|---|
| `js/modulos/dashboard-admin.js` | Render completo del Centro de control: encabezado compacto, KPI jerarquizados, columna principal y lateral, actividad reciente, próximos encuentros, clasificación resumida, grupos, alertas, acciones rápidas, estados y gráficas. Conserva IDs, eventos, navegación y cálculos previos. |
| `css/estilos.css` | Nueva capa `FASE 3.4 — DASHBOARD DE REFERENCIA` al final del archivo, después de la capa 3.3. Solo consume tokens de `css/tokens-3.1.css`; no define `:root`, colores nuevos ni fuentes nuevas. |

### Creados para verificación

| Archivo | Propósito |
|---|---|
| `mock-dashboard-3.4.html` | Arnés local del módulo real con `GL` simulado, `supabase.createClient` falso, Chart.js local y rutas HTTP(S) bloqueadas. Parámetros `?estado=datos\|vacio\|carga\|error`. |
| `scripts/verificar-fase-3.4-visual.mjs` | Playwright local: capturas antes/después, 8 anchos, foco, interacciones, estados y métricas de distribución. |
| `docs/capturas-fase-3.4/` | 12 PNG (6 antes + 6 después) y 2 JSON de verificación. |
| `docs/fase-3.4-informe.md` | Este informe. |
| `docs/estandar-visual-modulos-3.4.md` | Guía reutilizable para aplicar el mismo sistema visual a otros módulos. |

> No se modificó `css/tokens-3.1.css`, SQL, migraciones, Supabase remoto, RLS, auth, permisos, roles, datos persistentes ni la lógica de torneos, partidos o clasificación.

---

## 3. Composición visual y jerarquía

El dashboard pasó de una lista larga y plana de tarjetas a una pantalla con jerarquía explícita:

1. **Encabezado compacto** con liga, temporada, rol, jornada actual y acciones `Ver guía` / `Actualizar`.
2. **Resumen del torneo** con un KPI principal —partidos jugados con progreso de jornada— seguido de seis KPI de apoyo: jugadores, pendientes, jornadas abiertas, jornadas cerradas, grupos y suspendidos. Las cifras usan `font-variant-numeric: tabular-nums`.
3. **Distribución en dos columnas**: a la izquierda, actividad reciente, próximos encuentros y gráficas; a la derecha, atención requerida, clasificación, grupos y acciones rápidas.
4. **Actividad reciente**: últimos partidos con resultado, marcador real y fecha de actualización existente.
5. **Próximos encuentros**: partidos pendientes ordenados por jornada, sin fechas inventadas; cuando la jornada tiene fecha propia se muestra esa fecha real.
6. **Clasificación resumida**: primeras posiciones devueltas por `GL.clasificacion()`, sin recalcular puntos ni desempates.
7. **Grupos**: cobertura real de miembros, estado completo/incompleto y partidos jugados por grupo.
8. **Alertas**: los mismos criterios del módulo original —sin grupo, sin teléfono, sin foto, jornadas listas para cerrar, tarjetas acumuladas y sin resultados— con presentación semántica.
9. **Gráficas**: las cuatro existentes, ahora dentro de tarjetas uniformes y con `GL.tema`.
10. **Acciones rápidas**: los ocho ataques reales a módulos existentes, conservados uno a uno.

La distribución se colapsa a una sola columna en pantallas medias y estrechas, sin dejar huecos incómodos en la cuadrícula de KPI.

---

## 4. Datos reales y ausencia de invenciones

Se conservó la única consulta de partidos:

```js
const partidos = await GL.partidos({ torneo_id: torneo.id });
```

El resto viene de datos ya cargados por el módulo o por el contexto global: `GL.jugadores()`, `GL.grupos()`, `GL.ctx.miembros`, `GL.ctx.jornadas`, `GL.ctx.sanciones` y `GL.clasificacion()`.

No se añadieron:

- fechas u horas de partidos;
- torneos, jornadas, grupos ni clasificaciones falsas;
- porcentajes calculados fuera de los datos reales;
- actividades ni enfrentamientos simulados en la UI;
- acciones decorativas sin destino existente;
- consultas Supabase adicionales por tarjeta.

El progreso mostrado en el KPI principal deriva de `jugados / partidos de la jornada`, y el resto de derivaciones son solo lectura visual sobre los mismos datos.

---

## 5. Tokens y sistema de componentes

La capa nueva de `css/estilos.css` usa exclusivamente variables de `css/tokens-3.1.css`:

- superficies: `--gl-surface-1/2/3`, `--gl-bg`;
- bordes y radios: `--gl-border`, `--gl-border-strong`, `--gl-brand-ring`, `--gl-radius`, `--gl-radius-sm`, `--gl-radius-pill`;
- tipografía: `--gl-font-sans`, `--gl-fs-*`, `--gl-track-label`, `--gl-track-display`, `--gl-numeric`;
- color semántico: `--gl-brand`, `--gl-brand-text`, `--gl-success`, `--gl-warning`, `--gl-danger-*`, `--gl-info`, `--gl-text*`;
- movimiento y sombra: `--gl-motion-fast`, `--gl-motion-base`, `--gl-ease`, `--gl-shadow-1`, `--gl-focus-ring`.

Se reutilizaron `.btn`, `.btn.contorno`, `.btn.texto`, `.badge`, `.card`, `.skeleton-wrap`, `.estado-vacio`, `.panel-estado`, `GL.estado()` y `icono()` con su escala permitida `[14,16,18,20,24,32]`. No se creó otra paleta, otro `:root`, otra librería de iconos ni dependencia nueva.

---

## 6. Contratos funcionales conservados

| Contrato | Estado |
|---|---|
| `#dashboard-admin` y `modulo: 'dashboard-admin'` | Intactos. |
| `#da-guia` y `#da-refrescar` | Presentes y con sus eventos originales. |
| `data-ir` / `location.hash` | 37 enlaces reales hacia 8 módulos existentes. |
| IDs `da-chart-completados`, `da-chart-goles`, `da-chart-ved`, `da-chart-sanciones` | Conservados. |
| Eventos de teclado `Enter` / `Espacio` en elementos `role="button"` | Conservados y ampliados a las nuevas filas. |
| `GL.partidos({ torneo_id })`, `GL.asegurarAdmin`, `GL.cargarContexto` | Una sola llamada cada una, sin cambios de firma. |
| `GL.vacio`, `GL.error`, `GL.skeleton`, `GL.estado`, `GL.badge`, `GL.fechaLarga`, `GL.resultado`, `GL.nombreJugador`, `GL.letraGrupo` | Reutilizados. |
| `window.GLManager`, `window.GLEstados`, `window.Modulos`, `#modal-root` | No se modificaron. |
| Cálculos de jugadores, partidos, sanciones, jornadas y clasificación | No se alteraron. |

---

## 7. Verificación responsive

Playwright local con Chrome del sistema, sin red. Para cada ancho se midió `scrollWidth`, fuentes visibles, controles, KPI, desbordes internos y traslapes entre bloques:

| Ancho | `scrollWidth` | Fuentes < 12 px | Control mínimo | Filas de KPI | Desbordes internos | Traslapes |
|---:|---:|---:|---:|---:|---:|---:|
| 320 | 320 | 0 | 44 px | 7 | 0 | 0 |
| 375 | 375 | 0 | 44 px | 4 | 0 | 0 |
| 390 | 390 | 0 | 44 px | 4 | 0 | 0 |
| 430 | 430 | 0 | 44 px | 4 | 0 | 0 |
| 768 | 768 | 0 | 44 px | 4 | 0 | 0 |
| 1024 | 1024 | 0 | 44 px | 2 | 0 | 0 |
| 1366 | 1366 | 0 | 44 px | 2 | 0 | 0 |
| 1920 | 1920 | 0 | 44 px | 2 | 0 | 0 |

No hay scroll horizontal ni distribuciones incómodas en los ocho anchos exigidos.

---

## 8. Verificaciones automáticas

| Verificación | Resultado |
|---|---|
| Vitest (`vitest run --no-cache`) | **80 passed (80)**, 6 archivos |
| Sintaxis JS (`node --check` sobre `js/`) | **SYNTAX OK (26 archivos)** |
| `scripts/verificar-fase-3.3-estatico.mjs` | **OK**: CSS parseable (`tokens` 1 regla, `estilos` 1312 reglas), 125 tokens definidos / 89 consumidos, `:root` único, Rajdhani en UI = 0, fuentes < 12 px = 0 |
| `git -c core.whitespace=cr-at-eol diff --check` | **Limpio** (`GIT_DIFF_CHECK=0`). Los warnings de CRLF son preexistentes del repo |
| Hashes Supabase | **4/4 OK**: `migration-seguridad-2.3.sql=BED31B2D…63D18`, `tests/fase-2.3.sql=BC29237F…81D0C`, `configuracion-completa.sql=D844045A…C197`, `migration-telefonos-2.2.sql=C2D0022B…51286` |
| Playwright local | **8/8 anchos** sin overflow, sin desbordes internos y sin traslapes |
| Consola del navegador | **0 errores** durante carga, refresco, guía y navegación |
| Foco visible | `:focus-visible` con outline `2px rgb(255, 107, 122)` |
| Supabase remoto | Bloqueado: `createClient` simulado y rutas HTTP(S) abortadas |

---

## 9. Evidencia visual, interacción y estados

Directorio: `docs/capturas-fase-3.4/`.

| Captura | Contenido |
|---|---|
| `antes-escritorio.png` / `despues-escritorio.png` | Vista completa a 1366 px, antes y después. |
| `antes-movil.png` / `despues-movil.png` | Vista completa a 390 px, antes y después. |
| `despues-con-datos.png` | Dashboard con datos reales simulados localmente. |
| `despues-vacio.png` | Sin torneo activo, con acción real hacia `administracion`. |
| `despues-cargando.png` | Skeleton con `aria-busy`. |
| `despues-error.png` | Estado de error amigable con `role="alert"`. |
| `verificacion-antes.json` / `verificacion-despues.json` | Métricas crudas de cada pasada. |

Interacciones verificadas:

- 37 elementos `data-ir` hacia `fixture`, `administracion`, `resultados`, `jornadas`, `estadisticas-globales`, `tabla`, `mensajes` y `auditoria`.
- El primer enlace cambia efectivamente `location.hash` a `fixture`.
- `#da-refrescar` muestra skeleton y vuelve al panel completo sin errores.
- `#da-guia` dispara la acción real cuando `OnboardingAdmin` está disponible; en el arnés no produce error.
- Estados `datos`, `vacio`, `carga` y `error` detectados correctamente.

---

## 10. Confirmaciones finales y pendientes

### Confirmaciones

- No se instalaron dependencias.
- No se hizo commit, push ni deploy.
- No se modificaron DB, SQL, migraciones, RLS, Supabase remoto, auth, permisos, roles, datos persistentes, cálculos de negocio, rutas ni IDs existentes.
- `css/tokens-3.1.css` sigue siendo la única fuente de tokens.
- Los cambios quedaron locales y reversibles en el árbol de trabajo.

### Pendientes heredados / fuera de alcance

1. No hay `GL_ADMIN_EMAIL` / `GL_ADMIN_PASS`: los E2E con login real siguen desactivados.
2. No hay PostgreSQL local: `supabase/tests/fase-2.3.sql` sigue sin ejecutarse; FASE 2.3 no está en producción.
3. Las pruebas visuales usan mocks locales; no dependen de Supabase remoto.
4. `js/modulos/exportar-png.js` conserva Rajdhani y la paleta anterior; su migración quedó fuera de este dashboard.
5. Los cambios SQL/preexistentes visibles en `git status` pertenecen a FASE 2.x y no fueron tocados.
