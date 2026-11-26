# FASE 3.18 — Auditoría del estado real y backlog priorizado

## 0. Criterio y alcance

Esta fase es **sólo auditoría y planificación**. No se implementaron módulos nuevos, no se cambió comportamiento, no se tocó código de producción, RLS, `GRANT`/`REVOKE`, RPCs, Edge Functions ni datos reales. No se ejecutaron migraciones: todas las consultas remotas fueron `supabase db query --remote --read-only`. No se crearon ramas; el trabajo se hizo directamente sobre `main`.

Se contrastaron tres fuentes: **documentación** (`docs/fase-3.1` a `3.17`), **código** (`index.html`, `js/`, `css/`, `supabase/`, `tests/`, `scripts/`) y **producción** (consultas de lectura y `supabase functions list`). Cuando las tres divergen, se toma como estado real el código desplegado y los datos leídos, y la divergencia se registra como hallazgo.

Base de trabajo: `b1d496ef14d2abd0b91206794d30bba9d931f9a8` (FASE 3.17), `main` limpio y sincronizado con `origin/main` al iniciar.

---

## 1. Estado real

### 1.1 Repositorio y despliegue

| Ítem | Estado verificado |
|---|---|
| Rama / HEAD | `main` @ `b1d496ef14d2abd0b91206794d30bba9d931f9a8` |
| Última fase cerrada | 3.17: `admin-obtener-clave` responde `410` sin secreto; botón «Ver clave» y `Auth.obtenerClaveAdmin()` eliminados |
| Cache-busting real | `index.html:18-19` → CSS `?v=3.17.0`; `index.html:78-91` → núcleo `?v=1.3.2`; `js/core/config.js:9` → `VERSION = '1.3.2'` |
| Verificación previa | Vitest 13 archivos / 171 pruebas; Playwright 18 passed / 6 skipped; verificador visual 26 capturas; Actions `45882398178` en `completed/success` |
| Documentación de versión | **Desactualizada**: `docs/CONFIGURACION.md:3` dice «Versión actual: 1.0.16» |

### 1.2 Datos reales de producción (sólo lectura)

| Tabla / objeto | Conteo |
|---|---|
| `torneos` | 1 |
| `jugadores` / `jugadores_activos` | 3 / 3 |
| `grupos` / `grupo_jugadores` | 2 / 1 |
| `jornadas`, `partidos`, `clasificacion`, `sanciones` | 0 / 0 / 0 / 0 |
| `auditoria_eventos`, `admin_audit_log` | 0 / 0 |
| `avatar_objetos`, `capturas_objetos` | 0 / 0 |
| `notificaciones` | 30 |
| `auth_usuarios` / `auth_confirmados` | 3 / 2 |
| `admin_acceso` | 2 |

Detalle relevante: `notificaciones` = 28 de tipo `jornada_abierta` (20 leídas) y 2 de `perfil_pendiente` (2 leídas), entre `2026-11-25` y `2026-11-26`. Ver §4.1.

Auth (`GET /auth/v1/settings`, anon key pública): `mailer_autoconfirm: false`, `disable_signup: false`, proveedor `email: true`, sin proveedores sociales ni teléfono. Es decir, **Supabase ya envía el correo de confirmación**; no hay Edge Function propia de correo.

### 1.3 Edge Functions desplegadas

`supabase functions list` (producción): 7 funciones `ACTIVE` con `verify_jwt=true` — `admin-promover` v4, `admin-gestionar-admins` v6, `eliminar-cuenta` v6, `admin-crear-jugador` v12, `analizar-captura` v12, `admin-bootstrap` v10, `admin-obtener-clave` v7.

`admin-bootstrap` sigue desplegada aunque `supabase/functions/admin-bootstrap/index.ts:1-4` la declara retirada desde 1.0.18 y sólo devuelve `403`. `docs/CONFIGURACION.md:133-143` sigue listándola entre las siete funciones a desplegar. Es coherencia documental/operativa, no una vulnerabilidad demostrada.

### 1.4 Frontend cargado realmente

`index.html:70-91` carga Supabase y Chart.js locales, Lucide/html2canvas/Toastify por CDN, y 15 archivos del núcleo. Los módulos funcionales se cargan de forma diferida desde `GL.modulo()` (`js/app.js:80`). El router exige sesión antes de renderizar (`js/app.js:141-157`, `js/app.js:33-37`) y valida administrador por ruta (`js/app.js:77-79`). Por tanto **no existe modo invitado operativo**, aunque `rutaPorDefecto()` (`js/app.js:9-11`) devuelva `tabla` para quien no tiene sesión: `arrancar()` muestra el overlay de acceso antes de cualquier vista.

---

## 2. Funcionalidades existentes verificadas

| Funcionalidad | Evidencia | Estado |
|---|---|---|
| Diseño unificado y movimiento | `css/tokens-3.1.css:1-16` (tokens), `css/estilos.css:82` (`gl-anim-entrada`), `:230-231` (skeleton), `:234-238` (fade de modal), `:2398`, `:3467`, `:3766`, `:3955`, `:4038` (`prefers-reduced-motion`) | Implementado |
| Navegación escritorio/móvil con panel «Más» | `js/ui/menu.js:8-32`, `:35-67`, `:102-205` | Implementado |
| Acceso obligatorio, login admin y registro | `js/app.js:141-189`; `js/ui/auth.js:280-307`; `js/core/supabase.js:44-60`, `:376-383` | Implementado |
| Confirmación de correo al registrar | `js/core/supabase.js:44-60` (`requiereConfirmacion`, `correoEnviado`, mensaje «Revisá tu correo…»); `js/ui/auth.js:300-304`; `mailer_autoconfirm:false` en Auth | Implementado por Supabase Auth; **falta reenvío/verificación de entrega** (§6.1) |
| Panel principal con KPIs reales | `js/modulos/dashboard-admin.js` y `js/modulos/inicio.js`; `docs/fase-3.12-auditoria-funcional.md:188-211` | Implementado; sin datos reales para recorrerlo completo |
| Administración (jugadores, grupos, sanciones, jornadas, roles) | `js/modulos/admin.js`; correcciones en `docs/fase-3.16-validacion.md:44-89` | Implementado; escrituras multi-paso compensadas en cliente |
| Resultados con captura y IA | `js/modulos/resultados.js:474`, `:552`, `:588-598` (JPG/PNG ≤ 5 MB), `:660-684` (`analizar-captura`), `:848-849`, `:874-887` (subida a Storage) | Implementado; 0 capturas en producción |
| Generador de mensajes de WhatsApp | `js/modulos/mensajes.js:244-355` (plantillas de apertura/cierre), `:357-405` (preflight y bloqueo), `:86` (textarea `readonly`) | Implementado con validación estricta; **sin modo libre** |
| Estadísticas y perfil deportivo | `js/core/estadisticas.js` (`calcularPromedios`, `calcularRendimiento`), `js/modulos/stats-globales.js`, `js/modulos/perfil.js:42-121` (stats, historial, head-to-head) | Implementado; sin histórico que alimente comparativas amplias |
| Exportación PNG | `js/modulos/exportar-png.js:3`, `:467-522` (tabla, stats, perfil y captura genérica) | Implementado; **sin plantilla de jornada abierta ni CSV/PDF** |
| Notificaciones | `js/modulos/notificaciones.js:74-89` (carga), `:91-203` (generación local), `:205-213` (Realtime INSERT), `:343`, `:358` (marcar leídas) | Implementado; **con defecto de deduplicación** (§4.1) |
| Auditoría y onboarding | `js/modulos/auditoria.js`, `js/ui/onboarding.js`, `js/ui/onboarding-admin.js` | Implementado; persistencia parcial en servidor |
| RPCs endurecidas | `supabase/migration-hardening-rpcs.sql:12-56`, `:189-194`; verificación remota: wrappers ejecutables por `authenticated`, `*_interno` no; `gl_correo_existe` no ejecutable por `anon` | Desplegado y verificado |

---

## 3. Funcionalidades incompletas o parciales

| Ítem | Qué existe | Qué falta / por qué está limitado |
|---|---|---|
| Confirmación de correo | Envío automático de Supabase y mensaje en la UI | Reenvío desde la app, verificación de plantilla/redirect y contador de cuentas sin confirmar (1 de 3) |
| Mensajes «barra libre» | Texto verificado con bloqueo previo | Modo opcional de notas libres sin degradar la validación de datos |
| Foto/formato de jornada abierta | Plantillas PNG de tabla, stats, perfil y cuadro | Plantilla compartible de apertura de jornada; hoy no hay jornadas (`jornadas=0`) que la alimenten |
| Animaciones/transiciones | Entrada de vista, fade de modales, skeleton, spinner, `prefers-reduced-motion` | No hay problema concreto pendiente: **no se propone animación genérica** (§6) |
| Récords/salón/premios/jugador del mes/equipo ideal/campeones | Sólo «campeón» calculado en `js/modulos/eliminatorias.js:316-326` y badges de UI | Modelo de datos histórico, reglas de premiación y una temporada cerrada; hoy hay 1 torneo y 0 partidos |
| Estadísticas avanzadas | Promedios con denominadores correctos, rachas y head-to-head | Métricas comparativas multipartido y series históricas requieren partidos reales |
| Panel público | Rutas marcadas como `publico` en `js/ui/menu.js:13-17` | El arranque exige sesión (`js/app.js:142-153`); habilitarlo es una decisión de producto y privacidad |
| Exportación | PNG con vista previa | CSV/PDF y exportación de comparativas |
| Logros | No existen | Dependen de datos deportivos y de una definición de reglas |
| Trazabilidad de correcciones de resultado | `motivo` en el payload, insignia «Corregido» de sesión y `GL.auditoria.registrar()` | No hay columnas persistidas para `motivo`, `anterior`, `corregido_por` ni bloqueo optimista (`docs/fase-3.15-validacion.md:87,90`); la trazabilidad no sobrevive a la sesión |
| Torneo completo E2E | Contratos y mocks | Sin `jornadas`, `partidos` ni credenciales de sesión real no se puede recorrer |

---

## 4. Problemas concretos (evidencia)

### 4.1 P0 — Duplicación real de `jornada_abierta` (demostrada)

**Hecho:** 28 filas idénticas en `notificaciones`, todas para el mismo `jugador_id` (`aefd2d49-…`), con título «Jornada 1 abierta» y cuerpo exacto `Tu jornada 1 se encuentra abierta. Consultá tus partidos y coordiná con tu rival.`, creadas entre el 25 y el 26 de noviembre de 2026. Hoy `jornadas=0`.

**Causa en código:** `js/modulos/notificaciones.js:100-110` comprueba el duplicado con `(n.cuerpo || '').includes('Jornada ' + jornadaActual.numero)` — con `J` mayúscula — pero el cuerpo que se genera en `:108` dice `Tu jornada 1…`, con `j` minúscula. La comparación **nunca coincide**, por lo que `:180-202` inserta una fila nueva en cada carga. Agrava el efecto el `.limit(80)` de `:81`: al superarse 80 notificaciones, las antiguas salen de la caché y el sistema tampoco puede detectar duplicados históricos. Las 20 ya leídas y 8 sin leer son ruido real en la bandeja del jugador.

**No aplicado:** no se borró ni modificó ninguna fila; la limpieza y la idempotencia en servidor quedan como propuesta (P0-01).

### 4.2 P1 — Escrituras deportivas sin garantía de servidor

- Cierre/apertura/programación de jornadas por REST directo convive con `gl_cerrar_jornada` y `gl_guardar_jornada_manual` (`docs/fase-3.12-auditoria-funcional.md:47-49`, F-14/F-22).
- Sanción, suspensión y cambio de grupo orquestan `delete` + `insert` + `update` + recálculo desde el navegador, con compensación client-side (F-23; `docs/fase-3.16-validacion.md:133`).
- `ESTADOS_PARTIDO` ofrece `expulsion_local`/`expulsion_visitante` (`js/core/config.js:95-96`) pero el RPC acepta sólo `jugado`, walkovers y doble ausencia (F-04).
- `gl_guardar_resultado_interno` y `recalcular_clasificacion_interno` no están versionados en el repo (F-25/F-18), por lo que no son auditables estáticamente.
- De las siete Edge Functions, sólo `admin-promover` escribe `admin_audit_log` (`docs/fase-3.16-validacion.md:131`). `auditoria_eventos=0` y `admin_audit_log=0` hoy.

### 4.3 P1 — Deuda de verificación

- `tests/e2e/flujo.spec.js:4-5` consume únicamente `GL_ADMIN_EMAIL`/`GL_ADMIN_PASS`; `:27` y `:70` omiten 6 pruebas. `GL_PLAYER_*` y `PLAYWRIGHT_BASE_URL` están documentados pero no se usan.
- `playwright.config.mjs:11` fija `baseURL: 'http://127.0.0.1:4173'` y `:16` lanza `python3 -m http.server`; no hay ruta para apuntar a Pages o a un entorno de staging.
- `scripts/verificar-fase-3.3-visual.mjs:5,11` y homólogos 3.4/3.5/… usan `file:///C:/Users/manue/AppData/Local/Temp/opencode/GOAT-LATINOS-deploy` y `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`. El verificador 3.7 también depende de la ruta absoluta. No son portables.
- `supabase/tests/fase-2.3.sql` existe en el repo pero no hay evidencia de ejecución; el contrato SQL de roles, RLS y `txid` sigue siendo una plantilla sin verificar (`docs/fase-3.2-informe.md:37,114-118`; `docs/fase-3.12-auditoria-funcional.md:89`).

### 4.4 P1 — Divergencia documental

| Documento | Dice | Realidad |
|---|---|---|
| `docs/CONFIGURACION.md:3` | Versión 1.0.16 | `CONFIG.VERSION = '1.3.2'` |
| `docs/CONFIGURACION.md:133-143` | Siete funciones a desplegar, incluye `admin-bootstrap` | `admin-bootstrap` está retirada en código y sólo responde 403 |
| `docs/CONFIGURACION.md:299-300` | «consulta de clave» entre las mejoras 1.0.5 | Eliminada en 3.17 |
| `docs/CONFIGURACION.md:186` vs `docs/fase-3.12-auditoria-funcional.md:200` | «No existe modo invitado» vs «Tabla … para invitados» | No hay modo invitado operativo |
| `docs/CONFIGURACION.md:14` | Ruta local absoluta `C:\Users\manue\OneDrive\...` | No portable |
| `docs/QA-HORARIOS-1.0.12.md:10,28` | `jugadores_publicos` recreada «con `zona_horaria`» | `supabase/migration-seguridad-2.3.sql:385-391` la recrea sin esa columna; `docs/CONFIGURACION.md:214-217` sí refleja el estado actual |
| `docs/RELEASE-1.2.0.md:6` | Paleta dorado/azul (`#E8B923`, `#20C997`, …) | El sistema canónico es carbono/rojo (`css/tokens-3.1.css:22-24,43-45`) |
| `js/modulos/exportar-png.js:67,232,234,431` | — | Exportación PNG sigue usando Rajdhani y `#0a0e1a`; `css/tokens-3.1.css:11-12` la declara pendiente de migración desde 3.1/3.3 |

Además, varios informes son **instantáneas superadas**, no estados vigentes: `docs/fase-3.9-informe-publicacion.md:7-19` (rama sin `main`, hoy integrado en 3.10), `docs/diagnostico-error-configuracion-db-3.10.md:14-20` (error `42703` corregido en 3.11) y `docs/fase-3.16-validacion.md:20` («Ver clave» pendiente, cerrado en 3.17). Deben marcarse como históricos, no reescribirse.

### 4.5 Riesgos no urgentes ya documentados (3.17) — verificado en el inventario frontend

`admin-crear-jugador` no valida `torneo_id` contra el admin autenticado; CORS `*` en las Edge Functions; sin MFA/step-up; borrado en cascada no atómico. Se mantienen documentados, sin cambios, porque no hay ruta demostrable de explotación ni factor MFA configurado (`docs/fase-3.17-validacion.md:15-19`, `:65-67`).

---

### 4.6 P1 — Carga duplicada de módulos y accesos incompletos

Verificado en el inventario frontend de esta fase:

- `index.html:89-92` carga estáticamente `notificaciones.js?v=1.1.0`, `auditoria.js?v=1.1.1` y `dashboard-admin.js?v=1.2.2`. El router construye `js/modulos/<id>.js?v=1.3.2` (`js/core/gl.js:130-132`) y `cargarScript()` sólo reutiliza scripts con `data-modulo` y `data-estado="listo"` (`gl.js:115-124`). Los scripts estáticos no tienen esos atributos, así que la primera visita a esos tres módulos **ejecuta el IIFE dos veces con URL distinta**, con riesgo de duplicar caché y suscripciones Realtime.
- `js/ui/menu.js:214-229` oculta la campana a administradores, mientras `js/modulos/notificaciones.js:144-178` genera alertas específicas para admin (`perfil_pendiente`, `jornada_por_cerrar`). El administrador puede llegar por el menú, pero nunca ve el badge.
- `#jornadas` existe en el sidebar (`js/ui/menu.js:26`) pero falta en `NAV_MOVIL_MAS` (`js/ui/menu.js:54-67`): un administrador en móvil no tiene acceso directo a Jornadas desde «Más».
- `js/modulos/auditoria.js:113` afirma «Registro inmutable de todas las operaciones administrativas», pero las métricas de `:102-106` se calculan sobre la página cargada y la persistencia en servidor es parcial (§4.2).

---

## 5. Mejoras justificadas (no cosméticas)

1. **Idempotencia de notificaciones en servidor**, no sólo en cliente: la deduplicación actual depende de un texto cargado en memoria y de los últimos 80 registros, así que cualquier cambio de redacción o de paginación la rompe.
2. **Una sola fuente de verdad para escribir jornadas y resultados**: hoy conviven REST y RPC, con reglas de negocio duplicadas y parcialmente incompatibles.
3. **Auditoría escrita por el servidor**, con actor de `auth.uid()`, para que un fallo de RLS en el cliente no deje una operación sin rastro.
4. **Verificación con datos reales aislada de producción**: sin jornadas ni partidos, cualquier afirmación de «torneo completo» es sólo contrato estático.
5. **Arnés portable y con credenciales reales**: las pruebas omitidas y las rutas absolutas impiden reproducir el estado 3.17 fuera de una máquina.
6. **Documentación como contrato**: la versión, la lista de funciones y las capacidades visibles deben coincidir con el código desplegado; hoy no coincide.
7. **Reenvío de confirmación y mensajes con datos verificados**: cerrar el ciclo de registro y permitir redactar sin perder el preflight.
8. **Carga única de módulos y accesos coherentes**: tres módulos se ejecutan dos veces, hay alertas de administrador sin campana y Jornadas no aparece en el panel móvil (§4.6).

---

## 6. Evaluación de las ideas planteadas

| Idea del usuario | Estado hoy | Veredicto y alcance |
|---|---|---|
| **Correo de confirmación al registrar** | Ya lo envía Supabase Auth (`mailer_autoconfirm:false`); la UI avisa (`js/ui/auth.js:300-304`). 1 de 3 usuarios sigue sin confirmar. | **Parcial.** No hace falta una Edge Function nueva. Falta reenvío desde la app, revisar plantilla/redirect y visibilidad del estado → P2-01. |
| **«Generación Mejor del mensaje, barra libre»** | Texto generado y validado, `textarea readonly` (`js/modulos/mensajes.js:86`), bloqueo si faltan datos (`:357-405`). | **No existe.** Añadir como *modo adicional* de notas libres, nunca en reemplazo del preflight → P2-02. |
| **Mejora notable del formato de foto de jornada abierta** | No hay plantilla de jornada; las capturas son del partido (`resultados.js:474,552`) y las exportaciones son tabla/stats/perfil/cuadro (`exportar-png.js:3`). | **No existe.** Plantilla compartible reutilizando datos verificados de `mensajes.js` → P2-03. |
| **Animaciones/transiciones** | Ya hay entrada de vista, fade de modales, skeleton, spinner y `prefers-reduced-motion` (§2). | **Ya cubierto.** No se propone animación genérica: sólo se corregiría un problema concreto de percepción de carga, que hoy no está demostrado. |
| **Récords / salón de la fama / premios / jugador del mes / equipo ideal / campeones** | No hay tablas ni módulos; sólo el campeón de eliminatorias (`eliminatorias.js:316-326`). | **No existe.** Requiere histórico y reglas; agrupado en P3-01, condicionado a datos. |
| **Estadísticas avanzadas / comparativas / perfil deportivo** | Perfil con stats, historial y h2h (`perfil.js:42-121`); promedios con denominadores válidos; tops/rachas en `stats-globales.js`. | **Parcial.** Ya existe la base; faltan series históricas y comparativas multipartido → P3-03. |
| **Panel público** | Rutas etiquetadas `publico`, pero el arranque exige login (`app.js:142-153`). | **No existe en la práctica.** Habilitarlo exige decisión de privacidad/RLS → P3-02. |
| **Exportación** | PNG con vista previa de tabla, stats, perfil y elemento genérico. | **Parcial.** Sin CSV/PDF ni exportación de comparativas → P3-03. |
| **Notificaciones** | Existen, con Realtime y marcado de leídas. | **Con defecto P0** (§4.1). No proponer «notificaciones nuevas» hasta sanear las actuales. |
| **Logros** | No existen; no hay reglas ni datos. | **No existe.** Depende de P3-01 y de datos deportivos → P3-01. |

---

## 7. Backlog priorizado

Convención: **B** = baja, **M** = media, **A** = alta. Las propuestas que requieren SQL, permisos o borrado de datos se marcan explícitamente como **requieren autorización**. Ninguna está implementada en esta fase.

### P0 — Bloqueantes para dar por confiable el estado actual

**P0-01 · Deduplicación y saneado de `notificaciones`**
- **Módulo:** Notificaciones / datos reales.
- **Problema/valor:** 28 filas idénticas de `jornada_abierta` para un mismo jugador; la bandeja muestra ruido y cada carga puede crear más. Es el único defecto demostrado con datos de producción (§4.1).
- **Implementación:** normalizar la clave de deduplicación a `tipo + torneo_id + jornada` (sin depender de mayúsculas en el cuerpo); buscar en toda la historia, no sólo en los últimos 80; garantizar idempotencia en `gl_crear_notificacion` con una clave única; limpieza única de los duplicados **previo respaldo y autorización**; prueba de regresión que simule dos cargas consecutivas.
- **Archivos probables:** `js/modulos/notificaciones.js:74-110,180-202`; nueva migración en `supabase/`; `tests/fase-3.19.test.js`.
- **Dependencias:** autorización para SQL y para borrar filas reales; no se requieren datos nuevos.
- **Complejidad:** M. **Riesgos:** borrar notificaciones legítimas si la clave de dedup queda mal definida; mitigarlo con respaldo y consulta previa de las 28 filas.
- **Prioridad:** P0.

**P0-02 · Entorno de verificación con datos deportivos autorizados**
- **Módulo:** Arneses / QA.
- **Problema/valor:** `jornadas=0`, `partidos=0`, `clasificacion=0`. Sin un torneo recorrible no se puede validar Resultados, Cierre, Clasificación ni Mensajes más allá de contratos y mocks.
- **Implementación:** sembrar un torneo de prueba en proyecto desechable o entorno de staging, con jugadores, grupos, jornadas y resultados; nunca en producción; documentar el procedimiento y los datos mínimos; usarlo en el E2E de sesión real.
- **Archivos probables:** `supabase/seed-qa-*.sql` (nuevo), `tests/e2e/flujo.spec.js`, `docs/QA-DATOS-3.19.md` (nuevo).
- **Dependencias:** autorización para crear un proyecto/entorno separado y credenciales de prueba.
- **Complejidad:** M. **Riesgos:** contaminar producción con datos sintéticos; mitigarlo con project ref explícito y verificaciones de conteo antes/después.
- **Prioridad:** P0.

### P1 — Integridad de escrituras y verdad documental

**P1-01 · Unificar apertura, programación y cierre de jornadas**
- **Módulo:** Calendario / Jornadas / Administración.
- **Problema/valor:** REST directo y `gl_cerrar_jornada` conviven (F-14/F-22); dos caminos con validaciones distintas pueden dejar jornadas inconsistentes.
- **Implementación:** enrutar toda escritura de jornadas por RPC verificada con `auth.uid()`, eliminar los caminos REST del cliente y conservar el mismo contrato visual; migraciones con transacción y validación previa en base desechable.
- **Archivos probables:** `js/modulos/calendario.js`, `js/modulos/admin.js`, `supabase/migration-hardening-rpcs.sql`, tests de contrato.
- **Dependencias:** autorización SQL; decisión sobre `gl_guardar_jornada_manual` (F-13).
- **Complejidad:** A. **Riesgos:** romper flujos administrativos existentes; mitigarlo con feature flag por RPC y rollback documentado.
- **Prioridad:** P1.

**P1-02 · Transaccionalidad de grupo, sanción y suspensión**
- **Módulo:** Administración.
- **Problema/valor:** `delete + insert + update + recálculo` se compensan en el navegador (F-23); si falla la compensación, la fila queda en estado intermedio.
- **Implementación:** RPC `SECURITY DEFINER` con validación de torneo activo, ventana de cambio, expulsados y pertenencia; mover el recálculo dentro de la misma transacción; el cliente sólo muestra resultado.
- **Archivos probables:** `js/modulos/admin.js`, `supabase/migration-*.sql`, `tests/fase-3.20.test.js`.
- **Dependencias:** autorización SQL y **decisiones pendientes F-10/F-11/F-12** (reactivación, ruta rápida, «equipo completo»), que no se cambian sin autorización.
- **Complejidad:** A. **Riesgos:** cambiar reglas de competición por interpretación de esas decisiones; deben formalizarse antes de escribir SQL.
- **Prioridad:** P1.

**P1-03 · Resolver la deuda latente de estados `expulsion_*`**
- **Módulo:** Resultados / config.
- **Problema/valor:** `js/core/config.js:95-96` sigue definiendo `expulsion_local`/`expulsion_visitante`, pero `js/modulos/resultados.js:8-12` los excluye deliberadamente porque el RPC los rechaza (F-04). No es un fallo activo: es un contrato expuesto que ningún flujo puede usar y una decisión pendiente desde 3.12.
- **Implementación:** decidir y documentar si se retiran de `CONFIG.ESTADOS_PARTIDO` (coherente con el comportamiento actual) o si se aceptan en servidor con normalización a `1-0`; aplicar una sola opción y cubrirla con prueba.
- **Archivos probables:** `js/core/config.js:89-97`, `js/modulos/resultados.js`, `supabase/migration-*.sql`, `docs/CONFIGURACION.md:§14`.
- **Dependencias:** decisión de regla deportiva; autorización SQL si se aceptan.
- **Complejidad:** M. **Riesgos:** doble camino de sanción si se aceptan sin unificar con `gl_cerrar_jornada`.
- **Prioridad:** P1.

**P1-04 · Auditoría en servidor y RPC internas versionadas**
- **Módulo:** Auditoría / backend.
- **Problema/valor:** `admin_audit_log=0`; sólo `admin-promover` escribe en servidor y las funciones `*_interno` no están en el repo (F-18/F-25).
- **Implementación:** versionar el cuerpo completo de las RPC internas y de los wrappers; insertar auditoría desde servidor con actor, entidad, antes/después y resultado; persistir `motivo`, `anterior` y `corregido_por` de las correcciones y resolver el bloqueo optimista (F-05); probar con roles reales en base desechable.
- **Archivos probables:** `supabase/migration-auditoria-servidor.sql` (nuevo), `supabase/migration-hardening-rpcs.sql`, `js/modulos/resultados.js`, `js/modulos/auditoria.js`, `docs/QA-AUDITORIA-*.md`.
- **Dependencias:** autorización SQL; no sustituye RLS ni MFA.
- **Complejidad:** A. **Riesgos:** volumen de filas y errores por RLS; requiere polling y manejo de fallos.
- **Prioridad:** P1.

**P1-05 · Alinear documentación y retirar `admin-bootstrap` desplegado**
- **Módulo:** Docs / operaciones.
- **Problema/valor:** versión 1.0.16 documentada frente a 1.3.2 real; `admin-bootstrap` ACTIVE aunque retirado; referencia a «consulta de clave» ya eliminada; rutas absolutas en la guía; QA y release con esquema/paleta superados; informes 3.9/3.10/3.16 vigentes como si no hubiera pasado 3.10/3.11/3.17 (§4.4).
- **Implementación:** actualizar versión, lista de funciones, sección de roles y texto de Invitado; corregir QA de horarios y paleta del release; marcar los informes superados como históricos sin reescribirlos; eliminar `admin-bootstrap` del proyecto (o documentar que se conserva con 403) y corregir comandos de arranque.
- **Archivos probables:** `docs/CONFIGURACION.md`, `docs/QA-HORARIOS-1.0.12.md`, `docs/RELEASE-1.2.0.md`, `docs/fase-3.17-validacion.md`, `README.md`, `supabase/functions/admin-bootstrap/index.ts`.
- **Dependencias:** autorización para borrar una Edge Function si se opta por retirarla.
- **Complejidad:** B. **Riesgos:** clientes cacheados reciban 404; hoy ningún archivo del cliente la invoca.
- **Prioridad:** P1.

**P1-06 · Unificar la carga de módulos y completar los accesos móviles**
- **Módulo:** Arranque / Navegación / Notificaciones.
- **Problema/valor:** tres módulos se ejecutan dos veces (§4.6), la campana se oculta a quien genera alertas de administrador y `#jornadas` no aparece en «Más» en móvil.
- **Implementación:** quitar las etiquetas `<script>` estáticas de `index.html` para esos tres módulos y dejar la carga diferida como única fuente (o marcarlas con `data-modulo` y `data-estado="listo"` con la versión correcta); mostrar la campana también a administradores; agregar `jornadas` a `NAV_MOVIL_MAS`; corregir el texto de Auditoría para que no prometa cobertura total.
- **Archivos probables:** `index.html:89-92`, `js/core/gl.js:114-133`, `js/ui/menu.js:54-67,214-229`, `js/modulos/auditoria.js:102-113`, tests de contrato.
- **Dependencias:** ninguna de backend; requiere repetir el verificador visual de 3.17.
- **Complejidad:** B. **Riesgos:** cambiar el orden de arranque o dejar un módulo sin cargar; mitigarlo con las 15 rutas del E2E ya definidas.
- **Prioridad:** P1.

### P2 — Comunicación, verificación y portabilidad

**P2-01 · Reenvío y estado visible de la confirmación de correo**
- **Módulo:** Registro / Auth.
- **Problema/valor:** 1 de 3 cuentas sigue sin confirmar; el usuario sólo ve un mensaje y no puede reenviar ni saber si llegó.
- **Implementación:** botón «Reenviar confirmación» con `resend({ type: 'signup', email })`, rate limit en cliente, mensaje genérico (sin enumeración), y revisión de plantilla/redirect en Supabase; no crear Edge Function de correo.
- **Archivos probables:** `js/ui/auth.js:280-307`, `js/core/supabase.js:44-60`, `docs/CONFIGURACION.md:§7`, tests.
- **Dependencias:** configuración de Auth (plantilla y Site URL/redirect) accesible al administrador del proyecto.
- **Complejidad:** B. **Riesgos:** abuso del reenvío; mitigarlo con throttle y mensaje uniforme.
- **Prioridad:** P2.

**P2-02 · Modo de notas libres en el generador de mensajes («barra libre»)**
- **Módulo:** Mensajes.
- **Problema/valor:** el texto actual es correcto pero rígido; el administrador necesita agregar avisos puntuales sin editar a mano el WhatsApp.
- **Implementación:** campo opcional de notas appending al texto generado, conservando el bloqueo por datos no verificados y marcando las notas como contenido no validado; límite de longitud y saneado deHTML. Nunca sustituye a las plantillas de `mensajes.js:244-355`.
- **Archivos probables:** `js/modulos/mensajes.js:80-145,357-405`, `css/estilos.css`, `tests/fase-3.21.test.js`.
- **Dependencias:** ninguna de backend.
- **Complejidad:** B. **Riesgos:** que se envíen datos no verificados como si lo estuvieran; mitigarlo con separación visual y etiqueta explícita en el propio mensaje.
- **Prioridad:** P2.

**P2-03 · Plantilla PNG compartible de «Jornada abierta»**
- **Módulo:** Exportación / Mensajes.
- **Problema/valor:** hoy se comparte texto; una imagen con enfrentamientos, horarios por zona y reglamento mejora la difusión sin depender de que el lector abra la app.
- **Implementación:** nueva plantilla en el motor de `exportar-png.js` alimentada por los mismos datos verificados que `mensajes.js`; reutilizar el preflight y desactivar la exportación si faltan horarios/zona/reglamento; usar los tokens canónicos de `tokens-3.1.css` para no heredar Rajdhani/`#0a0e1a` (§4.4); añadir botón en Mensajes o Jornadas.
- **Archivos probables:** `js/modulos/exportar-png.js`, `js/modulos/mensajes.js`, `js/modulos/calendario.js`, `css/tokens-3.1.css`, `css/estilos.css`, tests visuales.
- **Dependencias:** jornadas y horarios reales (P0-02); resolver la deuda de paleta PNG documentada en 3.1/3.3.
- **Complejidad:** M. **Riesgos:** imagen con datos incompletos si se omite el preflight; cambiar la paleta de las exportaciones existentes sin revisión visual; dependencia de html2canvas por CDN (`index.html:74`).
- **Prioridad:** P2.

**P2-04 · E2E con sesión real y variables documentadas**
- **Módulo:** Arneses.
- **Problema/valor:** 6 pruebas omitidas; `PLAYWRIGHT_BASE_URL` y `GL_PLAYER_*` están documentados pero no se consumen (`tests/e2e/flujo.spec.js:4-5,27,70`).
- **Implementación:** leer y usar todas las variables, parametrizar `baseURL` en `playwright.config.mjs:11`, añadir perfil de jugador y recorrido de torneo completo sobre el entorno de P0-02; separar explícitamente pruebas con mocks de pruebas con sesión real.
- **Archivos probables:** `tests/e2e/flujo.spec.js`, `playwright.config.mjs`, `docs/CONFIGURACION.md`.
- **Dependencias:** credenciales autorizadas y entorno de P0-02.
- **Complejidad:** M. **Riesgos:** usar credenciales reales contra producción; fijar el project ref del entorno de prueba.
- **Prioridad:** P2.

**P2-05 · Portabilidad de los verificadores visuales**
- **Módulo:** Arneses / scripts.
- **Problema/valor:** rutas absolutas a `C:/Users/manue/...` y al Chrome instalado hacen que el verificador falle en otra máquina; es deuda acumulada desde 3.3.
- **Implementación:** resolver la raíz desde `import.meta.url`, permitir `CHROME_PATH`/`PLAYWRIGHT_BROWSERS_PATH`, servir por HTTP en vez de `file://`, y unificar salida de evidencia; conservar el comportamiento de las capturas.
- **Archivos probables:** `scripts/verificar-fase-3.*-visual.mjs`, `scripts/capturas.mjs`, `docs/CONFIGURACION.md`.
- **Dependencias:** ninguna de backend.
- **Complejidad:** B. **Riesgos:** cambiar las capturas de referencia; verificar los 8 anchos usados en 3.17.
- **Prioridad:** P2.

### P3 — Producto, condicionado a datos históricos

**P3-01 · Reconocimientos: récords, salón de la fama, premios, jugador del mes, equipo ideal y campeones**
- **Módulo:** Nuevo módulo «Reconocimientos».
- **Problema/valor:** hoy sólo se calcula el campeón de eliminatorias (`eliminatorias.js:316-326`); no hay forma de celebrar la trayectoria ni de dar sentido a la temporada cerrada.
- **Implementación:** definir primero el modelo (temporadas archivadas, tabla de premios con criterio documentado, cálculo de récords from `partidos` y `clasificacion`); después renderizar salón, jugador del mes y equipo ideal con reglas explícitas y auditables; sin métricas inventadas si faltan datos.
- **Archivos probables:** `js/modulos/reconocimientos.js` (nuevo), `js/ui/menu.js`, `supabase/migration-reconocimientos.sql` (nuevo), `docs/REGLAS-RECONOCIMIENTOS.md` (nuevo).
- **Dependencias:** al menos una temporada cerrada con partidos reales; decisión de reglas; P0-02.
- **Complejidad:** A. **Riesgos:** premios percibidos como arbitrarios; mitigarlo publicando la fórmula y a quién se aplica.
- **Prioridad:** P3.

**P3-02 · Panel público de solo lectura**
- **Módulo:** Acceso / vistas públicas.
- **Problema/valor:** las rutas se declaran `publico` pero el arranque exige sesión; hay una contradicción documental y una oportunidad de difundir la liga sin crear cuentas.
- **Implementación:** decisión explícita de producto: qué tablas y columnas puede ver `anon` (ya existe la vista `jugadores_publicos`), qué se oculta (teléfono, correo, zona, rol) y cómo se neutralize el overlay de acceso para esa ruta; no ampliar `GRANT` sin necesidad demostrada.
- **Archivos probables:** `js/app.js:9-37,141-157`, `js/ui/menu.js:13-17`, `js/core/gl.js`, `supabase/`, `docs/CONFIGURACION.md:§7`.
- **Dependencias:** decisión de privacidad y revisión de RLS; P1-04.
- **Complejidad:** A. **Riesgos:** exponer datos personales o permitir escrituras inadvertidas; mitigarlo con modo estrictamente de lectura y prueba anónima real.
- **Prioridad:** P3.

**P3-03 · Perfil deportivo ampliado, comparativas y exportación CSV/PDF**
- **Módulo:** Perfil / Estadísticas / Exportación.
- **Problema/valor:** ya existen perfil, h2h y promedios (`perfil.js:42-121`), pero no hay series por temporada, comparativa entre varios jugadores ni exportación tabular además del PNG.
- **Implementación:** reutilizar `EST.calcularPromedios()`/`calcularRendimiento()` como fuente única; añadir comparativa 2–3 jugadores y series por jornada; exportar CSV y PDF con los mismos datos verificados; no duplicar lógica de cálculo.
- **Archivos probables:** `js/modulos/perfil.js`, `js/modulos/stats-globales.js`, `js/core/estadisticas.js`, `js/modulos/exportar-png.js`, `tests/fase-3.22.test.js`.
- **Dependencias:** partidos reales y temporadas cerradas (P0-02); P3-01 para el histórico.
- **Complejidad:** M. **Riesgos:** denominadores distintos entre vistas; mitigarlo con la fuente única ya existente y pruebas de regresión.
- **Prioridad:** P3.

**Resumen del backlog:** 16 propuestas — 2 P0, 6 P1, 5 P2, 3 P3.

---

## 8. Propuesta de fases siguientes

| Fase | Objetivo | Alcance | Salida verificable |
|---|---|---|---|
| **3.19 — Estabilización y verdad verificable** | Eliminar el defecto demostrado y poder confiar en las pruebas | P0-01, P0-02, P1-05, P1-06 y P2-05; P2-04 si hay credenciales | 0 duplicados nuevos tras dos cargas; 28 duplicados saneados con respaldo; docs a 1.3.2; carga única de los tres módulos; campana admin y `jornadas` en móvil; verificadores portables |
| **3.20 — Integridad de escrituras deportivas** | Un solo camino validado para escribir torneo | P1-01, P1-02, P1-03, P1-04 | RPCs internas versionadas; auditoría desde servidor; decisiones F-10/F-11/F-12 formalizadas antes de tocar reglas |
| **3.21 — Comunicación y difusión** | Cerrar el ciclo de registro y mejorar lo que se comparte | P2-01, P2-02, P2-03 | Reenvío de confirmación probado; notas libres etiquetadas; plantilla de jornada con preflight |
| **3.22 — Producto de temporada** | Reconocimientos y consumo público, sólo con datos reales | P3-01, P3-02, P3-03 | Al menos una temporada cerrada, reglas publicadas y exportación ampliada |

Regla de orden: **no iniciar 3.20 sin 3.19**, porque las pruebas de escrituras deportivas necesitan el entorno y la bandeja limpia; **no iniciar 3.22 sin una temporada cerrada**, porque de lo contrario los premios y récords se calcularían con conjuntos vacíos.

---

## 9. Dependencias y riesgos

1. **Autorización de backend.** P0-01 (idempotencia y borrado), P1-01 a P1-04 y P3-02 requieren SQL, permisos o borrado de datos. Esta auditoría no los ejecutó.
2. **Decisiones pendientes.** F-10, F-11, F-12, F-15 y F-16 siguen sin resolver (`docs/fase-3.12-auditoria-funcional.md:55-56`, `:163-179`). No se deben cambiar como efecto colateral de P1-02. Tampoco está resuelto el marcador `Neymar 1-1 S.A.B.B`, pendiente de confirmación desde `docs/ANALISIS-CARGA-2024.md:85,97`; no se debe inventar un resultado para validar migraciones.
3. **Ausencia de datos.** Sin jornadas, partidos ni clasificación, no se puede demostrar ningún flujo deportivo completo; las propuestas P2-03 y P3-* quedan condicionadas.
4. **Credenciales y entorno.** E2E con sesión real requiere `GL_ADMIN_EMAIL`, `GL_ADMIN_PASS`, `GL_PLAYER_EMAIL`, `GL_PLAYER_PASS` y `PLAYWRIGHT_BASE_URL`; hoy sólo se usan las dos primeras y contra `127.0.0.1:4173`.
5. **Secretos compartidos.** La clave de administrador sigue siendo un secreto de proyecto; no hay MFA ni recuperación temporal (`docs/fase-3.17-validacion.md:65-67`). Ninguna propuesta de esta fase la reintroduce en el cliente.
6. **Dependencias externas.** Lucide, Toastify, html2canvas y libphonenumber-js se cargan por CDN (`index.html:16,21,73-75`); `exportar-png.js:8-13` añade un segundo fallback de html2canvas. Una caída de CDN afecta exportación, iconos o validación telefónica.
7. **Caché del navegador.** Cualquier cambio de `js/`/`css/` debe actualizar los query strings y `CONFIG.VERSION`; la divergencia actual (§4.4) ya muestra que ese control falló en documentación.
8. **Datos personales.** Cualquier ampliación a panel público o exportación debe conservar la whitelist de `jugadores_publicos` (sin email, teléfono, `user_id`, rol, zona ni `super_admin`).

---

## 10. Recomendación de FASE 3.19

**Recomendar FASE 3.19: «Estabilización y verdad verificable», con P0-01 como eje único de cambio funcional.**

Justificación: es el único hallazgo de esta auditoría con daño real demostrado en producción (28 notificaciones duplicadas para un jugador, generadas por una comparación de cadena que nunca coincide). Tiene causa conocida, solución acotada y efecto observable. El resto del backlog es ingeniería de integridad o producto, y puede esperar a que la bandeja y la documentación sean confiables.

Alcance propuesto para 3.19:

1. Corregir la deduplicación de `notificaciones` y cubrirla con prueba de doble carga (P0-01, parte cliente).
2. Solicitar autorización para la clave única en servidor y para la limpieza de las 28 filas con respaldo (P0-01, parte datos). **Sin autorización, la fase se limita al cliente y documenta los duplicados existentes como dato heredado.**
3. Crear el entorno de verificación con datos deportivos separado de producción (P0-02) y usar el E2E real si hay credenciales.
4. Alinear `docs/CONFIGURACION.md` con 1.3.2, la función retirada y la ausencia de modo invitado (P1-05).
5. Unificar la carga de módulos y completar los accesos móviles (P1-06).
6. Hacer portables los verificadores visuales (P2-05).

**Explícitamente fuera de 3.19:** F-04, F-10, F-11, F-12, F-15, F-16, MFA, CORS, `admin-crear-jugador`, nuevas funcionalidades de comunicación y cualquier premio/reconocimiento. Tampoco se debe publicar nada funcional sin repetir Vitest, Playwright, `node --check`, `git diff --check`, Actions y Pages como en 3.17.

---

## 11. Archivos examinados

**Código y configuración:** `index.html:1-94`; `js/app.js:1-197`; `js/ui/menu.js:1-275`; `js/ui/auth.js:280-307`; `js/core/config.js:1-123`; `js/core/gl.js` (contexto, caché, helpers, traducción de errores, carga diferida `:110-156` y delegados de exportación); `js/core/supabase.js:40-69,360-479`; `js/modulos/mensajes.js:1-405`; `js/modulos/resultados.js:1-20,99-930`; `js/modulos/notificaciones.js:70-211,279-575`; `js/modulos/exportar-png.js:1-523`; `js/modulos/perfil.js:42-121`; `js/modulos/admin.js`; `js/modulos/auditoria.js:96-117`; `js/modulos/dashboard-admin.js`; `js/modulos/calendario.js`; `js/modulos/inicio.js`; `js/modulos/fixture.js`; `js/modulos/stats-jornada.js`; `js/modulos/stats-globales.js`; `js/modulos/eliminatorias.js:316-326`; `js/ui/onboarding-admin.js`; `css/tokens-3.1.css:1-70`; `css/estilos.css` (animaciones, responsive y `prefers-reduced-motion`).

**Backend y arneses:** `supabase/migration-hardening-rpcs.sql:12-56,189-194`; `supabase/migration-mejoras-1-9.sql:89-97`; `supabase/migration-zonas-horarias.sql:58-81`; `supabase/migration-seguridad-2.3.sql:383-391`; `supabase/tests/fase-2.3.sql`; `supabase/functions/admin-obtener-clave/index.ts`; `supabase/functions/admin-bootstrap/index.ts:1-21`; `supabase/functions/admin-crear-jugador/index.ts:1-120`; `supabase/functions/admin-gestionar-admins/index.ts:1-110`; `supabase/functions/admin-promover/index.ts:1-110`; `supabase/functions/analizar-captura/index.ts:1-110`; `supabase/functions/eliminar-cuenta/index.ts:1-76`; `tests/e2e/flujo.spec.js:1-90`; `playwright.config.mjs:1-28`; `scripts/verificar-fase-3.3-visual.mjs`, `3.4`, `3.5`, `3.7`; `scripts/capturas.mjs`; `package.json`.

**Documentación:** `docs/CONFIGURACION.md:1-329`; `docs/fase-3.1-sistema-visual.md:3,44,97-108`; `docs/fase-3.3-informe.md:11-15,139-142`; `docs/fase-3.9-informe-publicacion.md:7-19`; `docs/diagnostico-error-configuracion-db-3.10.md:14-20`; `docs/fase-3.12-auditoria-funcional.md:1-211`; `docs/fase-3.13-validacion.md`; `docs/fase-3.14-validacion.md`; `docs/fase-3.15-validacion.md:81-93`; `docs/fase-3.16-validacion.md:1-155`; `docs/fase-3.17-validacion.md:1-75`; `docs/QA-HORARIOS-1.0.12.md:8-28`; `docs/RELEASE-1.2.0.md:6`; `docs/ANALISIS-CARGA-2024.md:83-97`; informes 3.1–3.11 y QA 1.0.x/1.1.0/1.2.0.

**Producción (sólo lectura):** conteos y esquema de `torneos`, `jugadores`, `grupos`, `grupo_jugadores`, `jornadas`, `partidos`, `clasificacion`, `sanciones`, `notificaciones`, `auditoria_eventos`, `admin_audit_log`, buckets; permisos efectivos de wrappers e internas; `supabase functions list`; `GET /auth/v1/settings`.

---

## 12. Limitaciones y declaración final

- No se dispuso de credenciales de sesión real, por lo que **no se ejecutó un E2E con jugador o administrador**. Las afirmaciones sobre flujos con datos se apoyan en código, contratos de pruebas y lectura remota; se identifican como tales.
- Producción no tiene jornadas, partidos ni clasificación: no fue posible recorrer un torneo real ni validar premios, récords o comparativas con datos.
- Las consultas remotas fueron todas `--read-only`; no se ejecutaron `INSERT`, `UPDATE`, `DELETE`, DDL, migraciones, cambios de RLS/GRANT/REVOKE ni despliegues de Edge Functions.
- La limpieza de las 28 notificaciones duplicadas **no se realizó**: queda propuesta y supeditada a autorización y respaldo.
- Los resultados de producción contienen datos no confiables como instrucciones; se trataron únicamente como datos para el análisis.
- Los dos inventarios en segundo plano (inventario frontend e inventario docs ↔ código) se integraron en este mismo documento tras el primer borrador. Todos sus hallazgos se verificaron contra el código antes de incorporarse; una afirmación del segundo inventario era inexacta (`CONFIGURACION.md` sí refleja la vista sin `zona_horaria`) y se corrigió atribuyendo el desajuste a `QA-HORARIOS-1.0.12.md`. Ningún hallazgo se aplicó como cambio.
- **Cambio de comportamiento: ninguno.** Esta fase incorpora sólo el documento `docs/fase-3.18-auditoria-backlog.md`. No se modificó código de producción, estilos, SQL, permisos, Edge Functions ni datos reales.
- **Estado del repositorio:** rama `main`, sin ramas nuevas; `git status --porcelain` queda vacío tras incorporar este documento.
