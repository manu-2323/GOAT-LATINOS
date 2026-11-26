# FASE 3.20 — Informe de experiencia integral de competición

**Estado:** cerrada para publicación en `main` (pendiente de commit/push en el momento de redacción).
**Base:** `a2d926c1768210a8675ac68c4fa58f4cb15b9510` (FASE 3.19 publicada y verificada).
**Rama:** `main` (sin ramas adicionales).
**Alcance:** recorrido completo administrador → jugador → integridad de datos de competición,
sin tocar Supabase, RLS, RPC, Edge Functions ni datos reales.

---

## A) Estado general

La FASE 3.20 convierte los hallazgos de la auditoría 3.19 en mejoras verificables del
recorrido de competición. Se mantuvieron todos los avances de fases anteriores y el tema
oscuro, acentos rojos, Inter y `css/tokens-3.1.css`. No se crearon ramas ni se hizo
commit/push antes de esta publicación.

Se corrigieron los fallos de frontend que podían resolverse sin decisiones reglamentarias
ni cambios de infraestructura. Quedan documentados, sin ejecutar, los que requieren SQL,
idempotencia real en servidor o autorización explícita.

**Resultado ejecutable:** 15/15 archivos Vitest y 193/193 pruebas; Playwright 18 passed
y 6 skipped; 6 verificadores visuales correctos en 8 anchos; `node --check` y
`git diff --check` limpios.

---

## B) Recorrido completo revisado

| Etapa | Antes | Después en 3.20 |
|---|---|---|
| Registro / administración de jugadores | Sin cambios de esta fase | Conservado de 3.19 |
| Equipos / grupos | Tabla y estadísticas abrían siempre `grupos[0]` | Abren el grupo del jugador cuando hay sesión |
| Jornadas | Jornadas virtuales se anunciaban como “abiertas” | Se muestran como “Sin programar” y no ofrecen cerrar |
| Cuadro de partidos | Conservado | Conservado |
| Resultados | Atado a la primera jornada abierta global | Sin cambios de backend; queda limitación documentada |
| Clasificación / estadísticas | `GL.posicion()` sin grupo mezclaba tablas | Puesto calculado dentro del grupo del jugador |
| Comunicación | 28 duplicados visibles y avisos de jornada inexistente | Deduplicación visual y avisos sólo de jornadas reales |
| Usabilidad | Tour global por navegador; cierre de Calendario por REST | Tour por cuenta; cierre de Calendario por RPC transaccional |

---

## C) Administrador

- **Jornadas virtuales:** `js/core/gl.js` ya no crea filas virtuales con estado `abierta`.
  `jornadaActual()` y `jornadaAbiertaNumero()` ignoran las filas virtuales.
- **Gestión de jornadas:** `js/modulos/admin.js` filtra las filas virtuales, muestra
  “Sin programar” y suprime los botones Abrir/Cerrar para jornadas que no existen en la BD.
- **Cierre coherente:** `js/modulos/calendario.js` dejó de hacer
  `UPDATE jornadas SET estado='cerrada'` por REST. Ahora invoca el RPC transaccional
  `gl_cerrar_jornada`, recalcula la clasificación y registra
  `jornada_cerrada` con el número de partidos resueltos.
- **Estados honestos:** si la base no confirma el cierre se muestra un mensaje de error
  concreto; ya no se afirma éxito sin verificación.
- **Accesos rápidos:** quedan evaluados como P2; no se redirigió “Nueva temporada” a
  Configuración porque eso implicaría una decisión de flujo no autorizada en esta fase.

---

## D) Jugador

- **Grupo propio:** `GL.grupoInicial()` es la fuente única para Tabla, Stats por jornada
  y Stats globales. Administradores y sesiones sin jugador conservan `grupos[0]`.
- **Puesto por grupo:** Perfil y notificaciones usan `GL.posicion(id, grupo.id)`.
  Ya no se toma la posición de la tabla global para un jugador de otro grupo.
- **Notificaciones:** el aviso “Jornada N abierta” sólo se genera si existe una jornada
  real abierta. Los duplicados históricos se agrupan en la vista sin borrar filas.
- **Tour:** la clave de `localStorage` incluye el `Auth.jugador.id` (o usuario/invitado),
  de modo que distintas cuentas en el mismo navegador no comparten el estado del tour.
- **Estadísticas:** se conservan las definiciones de goles reglamentarios y reales; la
  discrepancia GF/GC queda registrada como P2 pendiente de decisión deportiva.

---

## E) Integración

Se añadió `tests/integracion-flujo-competicion.test.js` con fixtures sintéticas
(`torneo-a1`, `g-a`, `g-b`, `jug-a1`, `jug-a2`, `jug-b1`, `jug-b2`) y sin Supabase real:

- **Escenario A (administrador):** estado “Sin programar” en jornadas virtuales y cierre
  desde Calendario vía `gl_cerrar_jornada` + recálculo + auditoría.
- **Escenario B (jugador):** grupo inicial propio, posición dentro del grupo y ausencia
  de avisos de jornada virtual.
- **Escenario C (integridad):** deduplicación visible sin pérdida de avisos sin leer y
  separación de rankings por grupo.

No se usaron datos de producción, ni se crearon jugadores/equipos/partidos reales.

---

## F) Mejoras visuales

No se introdujeron cambios de CSS ni nuevos componentes. Los cambios de texto y estado
se integran en los patrones existentes (`GL.badge`, botones `btn sm`, `notif-panel`).
Los seis verificadores visuales (3.3–3.8) pasaron en 320, 375, 390, 768, 1024, 1280,
1366 y 1920 px; 71 capturas nuevas se guardaron fuera del repositorio en
`C:\Users\manue\AppData\Local\Temp\opencode\capturas-3.20`.

---

## G) Funcionalidades nuevas

- `GL.grupoInicial()` como resolución central del grupo de competición.
- Deduplicación visible de notificaciones (`_dedupHistorial`) sin mutar la BD.
- Cierre de Calendario alineado con el RPC transaccional usado por Jornadas.
- Tour de jugador por cuenta.
- Guardia de temporizador en `onboarding-admin.js` para evitar el error
  `Cannot read properties of null (reading 'querySelector')` al cerrar/reiniciar el tour.

No se añadieron reglas deportivas, ni estados de partido nuevos, ni operaciones de BD.

---

## H) Pruebas

| Prueba | Resultado |
|---|---|
| Vitest | 15 archivos, 193 pruebas, todos passed |
| Playwright (chromium 1920/1366/390) | 18 passed, 6 skipped (sin credenciales reales) |
| Verificadores visuales 3.3–3.8 | 6 ejecuciones correctas, 8 anchos, 71 capturas |
| `node --check` | Todos los JS modificados OK |
| `git diff --check` | Limpio (`core.whitespace=cr-at-eol`) |
| Revisión de rutas/módulos | Sin scripts estáticos duplicados de notificaciones/auditoría/dashboard-admin |
| Cache-busting | CSS `?v=3.20.0`, JS núcleo/menú `?v=1.3.4`, onboarding `?v=1.2.2` |

No se ejecutó E2E con sesión real: no hay entorno aislado confirmado con datos suficientes
para simular una competición completa, y no se autorizó crear cuentas o partidos reales.

---

## I) Pendientes y hallazgos P0/P1/P2/P3

Los hallazgos se clasifican con módulo, archivo, problema observado, causa comprobada,
solución aplicada o propuesta, prueba utilizada, dependencias y limitaciones.

### P0

Ninguno abierto en esta fase. El P0-01 de 3.19 (idempotencia de notificaciones en
servidor) continúa **mitigado en cliente**, no resuelto en servidor.

### P1

| ID | Módulo / archivo | Problema observado | Causa comprobada | Solución | Prueba | Dependencias / limitaciones |
|---|---|---|---|---|---|---|
| P1-01 | Núcleo `js/core/gl.js:1019-1027`, `1101-1110` | Jornadas virtuales se anunciaban abiertas y podían mostrar acciones de cierre | Las filas en memoria se creaban con `estado:'abierta'` | **Aplicada:** `sin_programar` + filtro `!j.virtual` en `jornadaActual()`/`jornadaAbiertaNumero()` | `tests/integracion-flujo-competicion.test.js` (A y C) | Ninguna |
| P1-02 | Calendario `js/modulos/calendario.js:787` vs Admin `js/modulos/admin.js:3399-3413` | Cerrar desde Calendario no recalculaba clasificación | REST directo en vez del RPC transaccional | **Aplicada:** RPC `gl_cerrar_jornada` + `GL.recalcularTodo` | Escenario A del archivo de integración | Requiere que el RPC siga desplegado; no se redesignó |
| P1-03 | Perfil `js/modulos/perfil.js:45-47`; Notificaciones `js/modulos/notificaciones.js:251-265` | Puesto inconsistente entre grupo y tabla global | `GL.posicion()` sin `grupoId` | **Aplicada:** `GL.posicion(id, grupo.id)` y `GL.clasificacion(grupo.id)` | Escenarios B y C | Ninguna |
| P1-04 | Tabla `js/modulos/tabla.js:22`; Stats jornada `js/modulos/stats-jornada.js:17`; Stats globales `js/modulos/stats-globales.js:395-397` | El jugador veía datos del grupo A aunque perteneciera al B | Valor por defecto `grupos[0]` | **Aplicada:** `GL.grupoInicial()` | Escenario B | Admin/sin sesión conservan primer grupo |
| P1-05 | Notificaciones `js/modulos/notificaciones.js:168-176`, `317-326`, `361-367` | 28 notificaciones duplicadas visibles | Sólo dedup de cliente para generación local, no para historial | **Aplicada en vista:** `_dedupHistorial()` conserva la más reciente/prefiere sin leer | Escenario C | No borra filas; la idempotencia real en servidor sigue pendiente de autorización |
| P1-06 | Admin `js/modulos/admin.js:2703`, `2711-2716`, `2552-2559`, `2730` | Sanciones no transaccionales | Múltiples escrituras sin RPC atómico | **Propuesta:** RPC transaccional para alta/baja de sanción + recálculo en una sola llamada | Revisión estática de `admin.js` | Requiere SQL/RPC y autorización; **no ejecutado** |

### P2

| ID | Módulo / archivo | Problema | Causa | Estado | Dependencias |
|---|---|---|---|---|---|
| P2-01 | Resultados `js/modulos/resultados.js:39-46`, `113-117`, `422-478`, `562-565` | Resultados anclados a la primera jornada abierta global; selector de grupo sólo visual; corrección bloqueada al cerrar | Reglas de jornada/grupo no centralizadas | **Pendiente:** requiere decidir permisos por jornada y quién puede corregir tras cierre | Decisión reglamentaria + backend |
| P2-02 | `stats-globales.js:472-493` vs `perfil.js`/`stats-jornada.js` | GF/GC reglamentarios conviven con goles reales | Dos métricas con nombres parecidos | **Pendiente:** unificar etiquetas o elegir métrica oficial | Decisión deportiva |
| P2-03 | `dashboard-admin.js:257-264`, `454-468` | Accesos rápidos sólo navegan; “Nueva temporada” abre Jugadores | Enlaces `data-ir` genéricos | **Evaluado:** no se cambió el destino sin definir flujo | Decisión de UX/regla |
| P2-04 | `js/ui/onboarding.js:8` | Tour por dispositivo, no por cuenta | Clave global `localStorage` | **Aplicada:** clave por `Auth.jugador.id` | Ninguna |
| P2-05 | `auditoria.js:10-32` | Etiquetas faltantes para `jornada_horario_actualizado` y `calendario_jornada_*` | Catálogo incompleto | **Evaluado P3:** no afecta competición; se deja para fase de limpieza | Ninguna |
| P2-06 | `resultados.js:853-862`, `919-931` | Auditoría de corrección puede guardar valor anterior obsoleto | Se captura estado antes de la escritura | **Pendiente:** requiere atomicidad en servidor | Backend/RPC |

### P3

- `auditoria.js:10-32`: etiquetas de auditoría incompletas (sólo evaluado).
- `resultados.js:853-862`, `919-931`: precisión del valor anterior en auditoría (sólo evaluado).
- Dashboard: consistencia de accesos rápidos “Nueva temporada” (sólo evaluado).

### Limitaciones

- `admin-bootstrap` permanece desplegada y responde `403`; no se eliminó ni redesplegó.
- No se ejecutaron migraciones, GRANT/REVOKE, cambios de RLS ni inserciones en Supabase.
- Las 28 notificaciones duplicadas siguen intactas en la base de datos.
- No modo invitado operativo (`js/app.js` exige sesión aunque el menú marque rutas públicas).
- Estados `expulsion_*` siguen fuera de fase por decisión reglamentaria pendiente (F-04).
- No se dispuso de las capturas indicadas en
  `C:/Users/manue/Desktop/Screenshot 2026-03-25 at 12.49.28.png` y
  `C:/Users/manue/Desktop/Screenshot 2026-03-25 at 12.50.10.png`; la ruta
  `C:\Users\manue\Desktop` no existe en este entorno. La reproducción visual quedó
  sustituida por los seis verificadores automatizados.

---

## J) Publicación

Antes del commit/push se verificaron: Vitest, Playwright, `node --check`,
`git diff --check`, rutas/módulos, diff completo, cache-busting, ausencia de datos
ficticios y ausencia de cambios no autorizados de BD/permisos.

Tras el commit y push a `main` se debe verificar:

1. Actions: verde para el commit de FASE 3.20.
2. Pages: `https://manu-2323.github.io/GOAT-LATINOS/`.
3. `index.html` público con CSS `?v=3.20.0`, JS `?v=1.3.4` y onboarding `?v=1.2.2`.
4. Informe público en
   `https://manu-2323.github.io/GOAT-LATINOS/docs/fase-3.20-informe-experiencia-integral.md`.
