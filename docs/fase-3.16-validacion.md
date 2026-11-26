# FASE 3.16 — Auditoría, corrección y cierre del módulo Administración

## Resumen ejecutivo

Se auditó el módulo **Administración** de GOAT-LATINOS para dejar un cierre confiable y predecible sin tocar backend. La corrección se limitó al cliente (`js`/`css`), al arnés de pruebas y a la documentación. Se conservaron identificadores, `data-*` y rutas existentes para no romper integraciones.

La base de trabajo fue el commit `202b0040b3b4f1a5522d621f4ea149041bbf4789` (FASE 3.15), directamente en `main`. No se crearon ramas, no se ejecutaron migraciones SQL, no se modificaron RLS/GRANT/REVOKE/RPCs/Edge Functions, no se insertaron datos ficticios ni se eliminaron o alteraron datos reales de producción para probar. Tampoco se cambiaron reglas de competición.

Estado funcional: las operaciones administrativas ya recargan el contexto real antes de repintar, esperan la auditoría, bloquean envíos concurrentes, informan fallos y permiten reincorporar jugadores expulsados. El Centro de control muestra métricas derivadas de datos reales. Quedan documentadas, sin ejecutar, las correcciones que requieren autorización de backend.

## Auditoría previa

Se revisaron tres informes independientes y, además, el código directo de `js/modulos/admin.js`, `js/modulos/auditoria.js`, `js/modulos/dashboard-admin.js`, `js/ui/onboarding-admin.js`, `js/core/gl.js`, `js/core/supabase.js`, `js/app.js`, `css/estilos.css`, los mocks locales, Vitest, Playwright y las siete Edge Functions desplegadas (`admin-bootstrap`, `admin-crear-jugador`, `admin-gestionar-admins`, `admin-obtener-clave`, `admin-promover`, `analizar-captura`, `eliminar-cuenta`).

### Hallazgos clasificados

| Gravedad | Hallazgo | Estado |
|---|---|---|
| Crítico | La autorización efectiva no puede demostrarse desde el cliente: ocultar botones no equivale a impedir una llamada directa a Supabase. | Mitigado en cliente con `GL.asegurarAdmin()` en el router; el refuerzo de RLS/permisos queda **propuesto, sin aplicar**. |
| Crítico | `admin-obtener-clave` devuelve `ADMIN_PASSWORD` en claro al cliente autorizado. | **Pendiente**: requiere cambiar la Edge Function. |
| Alto | `admin-crear-jugador` exige `rol === 'admin'` pero no valida explícitamente el `torneo_id` solicitado; borra filas hijas sin revisar todos los errores y compensa de forma parcial. | **Pendiente**: requiere RPC/Edge Function transaccional. Se mitigó el mensaje de error y el repintado en cliente. |
| Alto | `admin-gestionar-admins`, `admin-promover` y `admin-obtener-clave` no verifican MFA/step-up para acciones sensibles. | **Pendiente**: requiere decisión y cambio de backend. |
| Alto | Todas las Edge Functions revisadas declaran CORS `*`. | **Pendiente**: requiere configuración de orígenes permitidos. |
| Alto | `Mod.render()` de Administración volvía a cargar contexto que el router ya había cargado y validado. | **Corregido**. |
| Alto | Tras varias escrituras se llamaba a `GL.invalidar()` y se repintaba sin recargar: `GL.ctx` seguía con datos viejos. | **Corregido** con `refrescar(root)`. |
| Alto | Las auditorías se registraban sin `await`; un fallo de RLS/red pasaba desapercibido y la operación se informaba como completamente trazable. | **Corregido** con `auditar()` esperado y aviso cuando no se registra. |
| Alto | «Reincorporar jugador» era inalcanzable: `GL.jugadores()` filtra inactivos y el menú sólo buscaba en esa lista. | **Corregido** con `jugadoresAdmin()`/`jugadorAdmin()`. |
| Alto | El modal de cierre de jornada se cerraba antes de que respondiera la RPC; un error dejaba al usuario sin formulario y sin explicación. | **Corregido**: cierre condicionado al éxito y botón restaurado en error. |
| Alto | La respuesta nula de `gl_cerrar_jornada` podía interpretarse como éxito. | **Corregido**: se exige objeto con `ok !== false`. |
| Alto | Varias escrituras multi-paso no tenían `try/catch`: fallos parciales dejaban cargando el botón o no avisaban. | **Corregido** en sanción, suspensión/reincorporación, grupo, jornada, creación/eliminación y roles de administrador. |
| Alto | El Centro de control contaba jornadas virtuales como abiertas, excluía inactivos del plantel real y agrupaba cierres sólo por número, mezclando equipos. | **Corregido** con `metricasAdmin()`. |
| Medio | No había confirmación para quitar a un jugador del grupo ni para abrir una jornada. | **Corregido** con `GL.confirmar()`. |
| Medio | Los errores de Edge Function se reducían al mensaje genérico «non-2xx». | **Corregido**: `mensajeInvoke()` clona la respuesta y lee JSON o texto. |
| Medio | Al eliminar un jugador se mostraban dos notificaciones de error. | **Corregido**. |
| Medio | La clave global del tour de administradores se compartía entre cuentas del mismo navegador y el listener de `keydown` se acumulaba al reiniciar. | **Corregido**: clave por usuario y eliminación del listener. |
| Medio | La guía prometía crear grupos/equipos y afirmaba que «cada cambio» quedaba registrado. | **Corregido**: texto honesto sobre la vista consultiva y la trazabilidad parcial. |
| Medio | `#da-refrescar` podía pulsarse varias veces y no bloqueaba la interfaz. | **Corregido**. |
| Medio | El listado de inactivos/expulsados no tenía estilo propio y las filas ocultas podían interferir con la tabla. | **Corregido** en CSS. |
| Bajo | Cache-busting desactualizado para los archivos modificados. | **Corregido**. |
| Bajo | Cobertura insuficiente de regresiones de Administración. | **Corregido**: 21 pruebas nuevas y verificador visual ampliado. |

No se encontró evidencia de datos manipulados para forzar resultados de pruebas. La producción sigue sin suficientes jornadas/partidos/clasificación para una prueba E2E de torneo completo; ese escenario se documenta como omitido.

## Cambios aplicados

### `js/modulos/admin.js`

- Eliminada la carga duplicada de contexto en `Mod.render()`; el router `app.js` ya hace `GL.cargarContexto()` y `GL.asegurarAdmin()`.
- Nuevos helpers `auditar()`, `refrescar()`, `jugadoresAdmin()`, `jugadorAdmin()` y `mensajeInvoke()`.
- Toda la auditoría del módulo pasa por `await auditar(...)`; cuando el registro falla se añade el aviso «No se pudo registrar la auditoría» al resultado de la operación.
- `refrescar(root)` invalida, **recarga** contexto, actualiza la caché de partidos y luego repinta. Sustituye a los antiguos caminos que sólo invalidaban.
- El listado incluye inactivos y expulsados con `data-j5-inactivo`, checkbox `#j5-inactivos`, filtros y estado vacío acordes. La acción «Reincorporar jugador» existe en tabla, menú de escritorio y bottom sheet móvil.
- Confirmación antes de quitar del grupo y antes de abrir jornada. Confirmaciones existentes de borrado/expulsión se conservan.
- `cambiarGrupoRapido()` compensa un fallo del `insert` restaurando el grupo anterior, audita el cambio y refresca.
- `modalEditar()`, `modalGrupo()`, `modalSancion()`, `modalSuspender()`, `modalEditarJornada()`, `modalAgregar()`, alta/baja de administradores y cierre de jornada tienen manejo explícito de errores, auditoría esperada y refresco real.
- `cerrarConFuncion()` no cierra el modal hasta que la RPC confirma; exige una respuesta válida, restaura el botón en error y notifica la auditoría real.
- `modalEliminarJugador()` dejó de duplicar la notificación de error.
- Se expone `Mod._pruebas` únicamente para pruebas aisladas.

### `js/modulos/auditoria.js`

`GL.auditoria.registrar()` ahora devuelve `{ ok: true }`, `{ ok: false, error }` o `{ ok: false, motivo: 'sin_sesion' }`. Los llamadores históricos que ignoran el valor no cambian de conducta; los nuevos pueden informar con precisión.

### `js/modulos/dashboard-admin.js`

- `metricasAdmin()` centraliza el cálculo y se expone como `Mod._metricas` para pruebas puras (sin DOM ni Supabase).
- Los jugadores se cuentan desde `GL.ctx.jugadores`, no desde `GL.jugadores()` (que oculta inactivos).
- Las jornadas virtuales inyectadas en memoria por `gl.js` se excluyen de «abiertas».
- «Listas para cerrar» se calcula por `grupo_id|jornada`, no sólo por número.
- Teléfono se reconoce en `telefono_e164` además de formatos anteriores.
- `#da-refrescar` se bloquea mientras recarga y muestra el error sin dejar el botón inactivo para siempre.
- Eliminada la carga de contexto duplicada en `render()`.

### `js/ui/onboarding-admin.js`

Clave `gl_tour_admin_v1::<id de cuenta>`, listener de teclado único y eliminado en `cerrar()`, textos que no prometen CRUD de equipos ni trazabilidad total.

### `css/estilos.css`, `index.html`, `js/core/config.js`

- `.j5-check-inactivos` con tokens de `css/tokens-3.1.css`; `.j5-tabla tr[hidden]` y opacidad de filas inactivas.
- Cache-busting: CSS y módulos dinámicos `?v=3.16.0`, núcleo `?v=1.3.1`, `CONFIG.VERSION = '1.3.1'`; versiones específicas de `onboarding-admin.js`, `auditoria.js` y `dashboard-admin.js`.

### Arneses

- `tests/fase-3.16.test.js`: 21 pruebas de regresión (helpers, auditoría, KPIs, onboarding, cache-busting y estática de acciones).
- `tests/fase-3.15.test.js`: se ajustó la aserción de versiones para aceptar la renovación 3.16/1.3.1 sin perder la comprobación de conteo.
- `scripts/verificar-fase-3.7-visual.mjs`: salida en `docs/capturas-fase-3.16`, capturas adicionales de Jugadores, Equipos y Centro de control a 1920×1080, 1366×768 y 390×844; comprobación del checkbox de inactivos, botones de reincorporación y KPIs.
- `mock-dashboard-3.4.html`: jornadas con `grupo_id` y una jornada virtual para verificar el filtro.

## Mejoras funcionales, visuales y de seguridad entregadas

- **Funcionales**: reincorporación alcanzable, confirmaciones en acciones destructivas, errores de Edge Function legibles,.refresh consistente, KPIs correctos, botón de refresco con bloqueo, onboarding por cuenta.
- **Visuales**: estilo del checkbox de inactivos, filas inactivas atenuadas, textos honestos en Equipos/Auditoría, sin desbordes en los tres anchos objetivo.
- **Seguridad en cliente**: todas las escrituras sensibles siguen detrás de `GL.asegurarAdmin()` en el router y de `GL.esAdmin()` en el módulo; la auditoría ya no se considera exitosa si el registro falla. **Esto no sustituye RLS ni permisos de servidor**: ver la sección de propuestas.

## Integraciones verificadas

- **Router/app**: `app.js` continúa cargando contexto y validando administrador antes de renderizar; `admin.js` ya no duplica esa carga.
- **GL/Supabase**: se conservan las tablas `jugadores`, `grupo_jugadores`, `jornadas`, `sanciones`, `torneos` y las RPCs existentes; no se crearon nuevas consultas persistentes ni se cambió contrato de datos.
- **Edge Functions**: se mantienen las siete funciones desplegadas; sólo se mejoró la lectura del error devuelto al cliente.
- **Auditoría**: el módulo Admin ahora espera `gl_registrar_auditoria`; la persistencia depende de RLS y de la función desplegada.
- **Centro de control/Entrenador**: KPIs y alertas comparten las mismas reglas de grupo/jornada y estado que Administración.
- **Onboarding**: el recorrido general (`onboarding.js`) no se tocó; el de administradores usa su propia clave por cuenta.
- **Resultados y Cuadro**: sin cambios en reglas ni en deduplicación; FASE 3.15 queda intacta.

## Pruebas ejecutadas

| Comando | Resultado exacto |
|---|---|
| `node --check` sobre `admin.js`, `dashboard-admin.js`, `auditoria.js`, `onboarding-admin.js`, `config.js`, `tests/fase-3.16.test.js`, `tests/fase-3.15.test.js`, `scripts/verificar-fase-3.7-visual.mjs` | `NODE_CHECK_OK` (0 fallos) |
| `vitest run tests/fase-3.16.test.js --reporter=dot` | 21 pruebas, 0 fallos |
| `vitest run --reporter=dot` | **12 archivos, 164 pruebas, 0 fallos** (4,92 s) |
| `playwright test --reporter=dot` | **18 passed, 6 skipped, 0 failed** (24 tests, 49,6 s) |
| `scripts/verificar-fase-3.7-visual.mjs` | **26 capturas**, 8 anchos sin desbordes, consola limpia, error esperado 1 |
| Verificador · Jugadores | 6 filas visibles → 8 al marcar «Incluir inactivos»; 2 botones «Reincorporar»; sin errores a 390/1366/1920 |
| Verificador · Equipos | vista consultiva sin desbordes ni errores a 390/1366/1920 |
| Verificador · Dashboard | KPIs `Jugadores 6 / 5 activos`, `Jornadas abiertas 4 / de 4`, `Jornadas cerradas 4`; la jornada virtual no se cuenta |
| `git diff --check` | Sin avisos de whitespace |

Los mensajes `[GL.mensaje] detalle técnico: Failed to fetch`, `column "telefono_nacional" does not exist` y el `console.warn` de auditoría en el log de Vitest son esperados: pertenecen a pruebas que simulan fallos o a arneses antiguos. Ninguna prueba falló.

## Omitido

- E2E con sesión real: 6 pruebas condicionales omitidas por falta de `GL_ADMIN_EMAIL`, `GL_ADMIN_PASS`, `GL_PLAYER_EMAIL`, `GL_PLAYER_PASS` y `PLAYWRIGHT_BASE_URL`. Además, `PLAYWRIGHT_BASE_URL` y `GL_PLAYER_*` están documentados pero hoy no se consumen en `tests/e2e/flujo.spec.js`; queda como deuda del arnés, no se cambió en esta fase.
- Verificación de un torneo completo con datos reales: producción reporta `jornadas=0`, `partidos=0`, `clasificacion=0`, `jugadores=3`, `grupos=2`, `grupo_jugadores=1`. No se insertaron datos de prueba.
- No se ejecutaron migraciones, `supabase db lint`, cambios de RLS ni despliegues de Edge Functions.
- No se probaron flujos de MFA/AAL2 porque no existe configuración autorizada para habilitarlos.

## Limitaciones

- La auditoría persistente es parcial: de las siete Edge Functions revisadas, sólo `admin-promover` escribe `admin_audit_log`. Creación/borrado de jugadores, bajorroles de administrador, cambios de grupo, sanciones, apertura/cierre de jornada y borrado de cuenta no quedan todos registrados en servidor.
- `gl_guardar_resultado_interno` y `recalcular_clasificacion_interno` siguen sin versionarse en el repositorio (F-25); no son auditables estáticamente desde aquí.
- Sin transacción en base de datos, `modalSancion()` y `cambiarGrupoRapido()` usan compensación client-side: si falla la compensación, el aviso lo indica, pero no se puede garantizar atomicidad.
- La verificación de «freshness» durante un modal abierto usa el contexto cargado; un cambio concurrente de otro administrador requiere bloqueo optimista en servidor.
- La clave de administrador entregada por `admin-obtener-clave` sigue siendo un secreto compartido; el cliente no puede corregir ese diseño.

## Propuestas que requieren autorización expresa

No implementadas. Se entregan como propuesta separada para que se decidan con criterio de backend/seguridad:

1. **E-01 a E-08 / Edge Functions**: revisar `admin-crear-jugador` para validar `torneo_id` contra el admin autenticado, usar una sola transacción para borrar/insertar relaciones y fallar sin compensaciones parciales.
2. **Step-up MFA (AAL2)**: exigir reautenticación reciente antes de crear/eliminar jugadores, otorgar/quitar roles, ver/clave de administrador, expulsar y cerrar jornada.
3. **No devolver secretos en claro**: sustituir `admin-obtener-clave` por un flujo de recuperación temporal, con expiración y registro de quién la solicitó.
4. **CORS restringido**: reemplazar `*` por los orígenes exactos de la app en producción y previsualizaciones autorizadas.
5. **Auditoría persistente (A4/A5/A6/A7)**: insertar `admin_audit_log` desde el servidor para **toda** acción administrativa, con actor, torneo, entidad, antes/después y resultado; no depender del cliente.
6. **RLS/GRANT/REVOKE (F-09, F-22/F-23)**: verificar que un admin de un torneo no pueda escribir en otro torneo mediante REST directo, y que las tablas sensibles no queden expuestas por permisos amplios. No se asumió seguridad porque el botón esté oculto.
7. **Eliminación atómica**: mover el borrado de jugador/cuenta y sus dependencias a una RPC transaccional con verificación de errores en cada paso.
8. **RPCs internas sin versionar (F-25)**: versionar `gl_guardar_resultado_interno` y `recalcular_clasificacion_interno` para poder auditarlas y endurecerlas.
9. **Bloqueo optimista**: columna de versión o `updated_at` verificada en servidor para rechazar escrituras basadas en contexto viejo.

## Evidencia

`docs/capturas-fase-3.16/` contiene 26 capturas y `verificacion-despues.json` con métricas responsive, filtros, historial, estados, foco, movimiento reducido y el bloque `admin` con Jugadores/Equipos/Centro de control. Todo se generó con mocks locales y tráfico HTTP bloqueado; no se usaron credenciales ni datos de producción.

El commit que incorpora este documento se publica en `main` tras verificar Vitest, Playwright, Actions y Pages; el hash y los identificadores de despliegue se reportan en el cierre de la fase.
