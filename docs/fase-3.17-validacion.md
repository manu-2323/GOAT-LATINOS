# FASE 3.17 — Revisión puntual de seguridad y continuidad

> La actualización documental de `CONFIGURACION.md` fue parcial: FASE 3.18 detectó versión 1.0.16,
> `admin-bootstrap` en el listado y ausencia de `admin-promover`; se corrigió en FASE 3.19. En 3.18
> el inventario remoto era de 7 funciones `ACTIVE`, con `admin-bootstrap` retirada en código.

## Criterio

Seguridad **proporcional al riesgo**, no seguridad por acumulación de medidas. La fase se limitó a revisar los riesgos importantes, corregir los que son reales y demostrables, dejar documentado el resto y no frenar el desarrollo de funcionalidades.

No se hizo una auditoría general ni se endurecieron capas que ya estaban correctas. No se modificaron RLS, `GRANT`/`REVOKE`, permisos de producción, migraciones SQL, RPCs, datos reales ni reglas de competición. La única escritura remota fue el despliegue de **una** Edge Function, explicada abajo y autorizada expresamente.

## Hallazgos evaluados

| Gravedad | Hallazgo | Evidencia | Decisión |
|---|---|---|---|
| Crítico | `admin-obtener-clave` devolvía `ADMIN_PASSWORD` en claro y el panel lo mostraba y lo copiaba al portapapeles. | Código de la función + botón `data-ver-clave` + `Auth.obtenerClaveAdmin()`; función `ACTIVE` en producción (v6). | **Corregido y desplegado.** La función responde `410` sin leer ni devolver el secreto; el botón y la llamada se eliminaron. |
| Alto (potencial) | Un usuario normal podría ejecutar acciones de administración por REST/RPC. | Consulta **sólo de lectura** a producción: políticas restrictivas `gl_23_*` y `gl_rpc_*` presentes, triggers `gl_proteger_rol` y `gl_proteger_insercion_jugador` presentes, `gl_es_admin()` es `SECURITY DEFINER`, `gl_cerrar_jornada` ejecutable por `authenticated` pero su versión `*_interno` no. Los wrappers devuelven `ok:false` si no hay admin. | **No demostrable.** No se tocó nada. Las defensas ya están desplegadas. |
| Medio | `admin-crear-jugador` no valida `torneo_id` contra el administrador autenticado. | Código de la función; producción tiene **1** torneo, 3 jugadores y 2 administradores. | **Documentado, no corregido.** Con un solo torneo no hay una ruta cross-torneo real hoy. |
| Medio | CORS `*` en las Edge Functions. | Todas las funciones declaran `Access-Control-Allow-Origin: *`, pero exigen JWT válido y las sensibles exigen `super_admin`. | **Documentado, no corregido.** No hay evidencia de abuso; restringir orígenes sin un requisito concreto sería acumular medidas. |
| Medio | Sin MFA/step-up para acciones sensibles. | No hay factor MFA habilitado en el proyecto. | **Documentado, no corregido.** Exigir AAL2 sin factor configurado no protege nada y rompería flujos. |
| Medio | Auditoría persistente parcial en Edge Functions. | Sólo `admin-promover` escribe `admin_audit_log`; las escrituras del cliente sí usan `gl_registrar_auditoria`, que valida `gl_es_admin()`. | **Documentado, no corregido.** Es trazabilidad, no una vulnerabilidad explotable. |
| Bajo | Borrado en cascada no atómico en `admin-crear-jugador`. | Borra hijos sin revisar todos los errores y compensa parcialmente. | **Documentado, no corregido.** Sin evidencia de fallo parcial en producción. |

## Cambios aplicados

### `supabase/functions/admin-obtener-clave/index.ts`

- Ya **no lee** `Deno.env.get('ADMIN_PASSWORD')` y no construye ninguna respuesta con `password`.
- Responde `410 Gone` con `{ ok: false, error, mensaje }` e instrucciones para gestionar la clave en los secretos del proyecto.
- Se conserva el slug para que un cliente cacheado reciba una respuesta explícita y no un 404 opaco.
- Desplegado en producción: **versión 7**, `ACTIVE`, `verify_jwt=true`, nuevo hash `cbe7447685bfa2760502ac90cf5811bbbf98759c15bdff8f8587c0d6507500df`.

### Cliente

- `js/modulos/admin.js`: eliminado el botón «Ver clave de administrador», su modal, la copia al portapapeles y el listener asociado. La tarjeta ahora explica que la clave se gestiona en secretos y no se muestra en la app.
- `js/core/supabase.js`: eliminado `Auth.obtenerClaveAdmin()` y, con él, la única invocación al endpoint.
- `docs/CONFIGURACION.md`: actualizada la tabla de secretos, el rol `super_admin`, el listado de deploy y la descripción de la función.
- Cache-busting: `CONFIG.VERSION = '1.3.2'`, CSS y vistas `?v=3.17.0`, núcleo `?v=1.3.2`, `js/core/supabase.js?v=1.2.2`.

### Pruebas y arneses

- `tests/fase-3.17.test.js`: 7 pruebas nuevas. Ejecutan el handler real de la Edge Function y comprueban el `410`, la ausencia de `password`, el preflight CORS, la desaparición del botón y de la llamada, la exactitud documental y el cache-busting.
- `tests/fase-3.15.test.js` y `tests/fase-3.16.test.js`: expectativas de versión ampliadas para aceptar la renovación 3.17/1.3.2.
- `scripts/verificar-fase-3.7-visual.mjs`: salida de evidencia cambiada a `docs/capturas-fase-3.17`.

## Verificación

| Comando / comprobación | Resultado exacto |
|---|---|
| `node --check` sobre `admin.js`, `supabase.js`, `config.js` y los tres archivos de prueba | `NODE_CHECK_OK` |
| Vitest completo | **13 archivos, 171 pruebas, 0 fallos**, exit 0 (4,49 s) |
| Playwright | **18 passed, 6 skipped, 0 failed** (24 tests, 54,7 s), exit 0 |
| `scripts/verificar-fase-3.7-visual.mjs` | **26 capturas**, sin desbordes ni errores de consola, exit 0 |
| `supabase functions deploy admin-obtener-clave --yes` | `Deployed Functions.`, exit 0 |
| `supabase functions list` | `admin-obtener-clave`: `ACTIVE`, `version 7`, `verify_jwt: true` |
| Invocación real al endpoint desplegado (con la anon key pública) | `STATUS=410`, cuerpo sin `password` |
| `git diff --check` | Sin avisos de whitespace |

Los mensajes `[GL.mensaje] detalle técnico` del log de Vitest pertenecen a pruebas que simulan fallos y son esperados.

## Omitido y por qué

- **RLS, GRANT/REVOKE y RPCs:** las defensas relevantes ya están desplegadas y no se encontró una ruta demostrable para sortearlas. Cambiarlas habría sido seguridad por acumulación, con riesgo de romper flujos que funcionan.
- **Cinco Edge Functions restantes:** no se encontró un riesgo nuevo y demostrable en esta revisión puntual; se dejan intactas.
- **MFA/AAL2:** no hay factor habilitado; queda como decisión de producto, no como parche de esta fase.
- **Datos de torneo completos:** producción sigue sin jornadas ni partidos suficientes; no se insertaron datos de prueba.

## Limitaciones conocidas

La clave compartida sigue siendo un secreto de proyecto: el cambio elimina su exposición en la app y en el navegador, pero no sustituye una rotación ni un flujo de recuperación temporal. Si la clave se compartió por canales inseguros, debe rotarse desde Secrets y actualizarse en `admin-gestionar-admins`. Las escrituras multi-paso de `admin-crear-jugador` siguen sin ser atómicas; se documenta sin modificar por no haberse demostrado un fallo.

## Integraciones

El contrato de la app no cambió: el router sigue validando administrador antes de renderizar, `GL`/Supabase conservan las mismas tablas y RPCs, y no se agregaron rutas REST nuevas. El único contrato modificado es el de `admin-obtener-clave`, que ahora responde `410` y no tiene consumidor en el cliente. Los módulos de Resultados, Cuadro, Calendario y Onboarding general no se tocaron.

## Estado y continuidad

Este cierre termina el bloque de seguridad puntual. Las mejoras no urgentes quedan registradas arriba para decidirlas por riesgo, no por inventario. El trabajo siguiente de la fase es funcionalidad, no más endurecimiento preventivo. Los identificadores de Actions y Pages se confirman tras el push y se reportan en el cierre de la fase.
