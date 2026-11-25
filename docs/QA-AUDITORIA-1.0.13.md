# QA de auditoría de RPC y publicación — 1.0.13

Versión local: **1.0.13**. Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`.
Auditoría ejecutada el 24/11/2026 sobre producción, con `supabase db query --remote`.
Ninguna credencial privada (service role, Gemini, contraseña de bootstrap, JWT) aparece en el
frontend, en este documento ni en el repositorio.

## Hallazgos confirmados

| Hallazgo | Evidencia | Estado |
|---|---|---|
| `anon` podía ejecutar RPC `SECURITY DEFINER` que escriben | ACL de `pg_proc`: `anon=X` en `gl_generar_fixture`, `gl_crear_notificacion`, `gl_registrar_auditoria`, `gl_recalcular_clasificacion` y `limpiar_rate_limits` | Corregido |
| Identidad suplantable por UUID del cliente | `gl_guardar_resultado`, `gl_cerrar_jornada` y `gl_crear_temporada` usaban `p_ingresado_por`, `p_cerrado_por` y `p_creado_por` | Corregido |
| `search_path` sin fijar en funciones `DEFINER` | `proconfig` vacío en `gl_generar_fixture`, `gl_cerrar_jornada`, `gl_crear_temporada`, `gl_crear_notificacion`, `gl_registrar_auditoria`, `recalcular_clasificacion` y `limpiar_rate_limits` | Corregido |
| Trigger de unicidad sin `search_path` | `fn_validar_jugador_unico_por_torneo()` sin `SET search_path` | Corregido |
| `partidos_historial` | Políticas `ph_admin_read` / `ph_service_write` usan `gl_es_admin()`; sin grants directos a `anon`/`authenticated` | Ya seguro |

## Cambios aplicados

- `supabase/migration-hardening-rpcs.sql` (nueva, sección 7 de `docs/CONFIGURACION.md`):
  - Renombra a `*_interno` las seis RPC sensibles y sus cuerpos originales.
  - Crea wrappers con `security definer`, `set search_path = ''` y validación
    `public.gl_es_admin()`; sustituyen los UUID recibidos por `auth.uid()`.
  - `gl_generar_calendario` delega en el mismo generador verificado que `gl_generar_fixture`.
  - `gl_crear_notificacion` exige sesión, permite al jugador crear solo las suyas y al admin
    crear para cualquier jugador del torneo.
  - `gl_registrar_auditoria` guarda `auth.uid()` y no el UUID recibido.
  - Fija `search_path = public, pg_temp` en las internas, `gl_gc`, `gl_gf`,
    `limpiar_rate_limits` y el trigger de unicidad.
  - Revoca `EXECUTE` a `PUBLIC`, `anon` y `authenticated` y lo concede solo a `authenticated`
    en las RPC que el frontend llama con sesión; `gl_nombre_disponible` queda para `anon`.
  - Termina con `notify pgrst, 'reload schema'`.
- Aplicada en producción sin errores. Los tipos de retorno de wrappers e internas coinciden
  (`jsonb` / `json`, verificado con `pg_get_function_result`).

## Correcciones de frontend

| Archivo | Bug | Prueba |
|---|---|---|
| `js/modulos/stats-jornada.js` | `GL.golesReales()` no devuelve `texto`: se leía `r.texto` y `mejorPartido.local_id` con partidos vacíos | Marcador `2 - 1` y nota “Todavía no hay partidos jugados en esta jornada”; sin `undefined` |
| `js/core/clasificacion.js` | `ctx` apuntaba al objeto previo tras `cargarContexto(true)`: devolvía tabla vieja | Devuelve `GL.ctx.clasificacion` refrescada |
| `js/modulos/notificaciones.js` | `GL.ctx.partidos` no existe | Usa `await GL.partidos({ torneo_id, jornada })` |
| `js/modulos/eliminatorias.js` | El extra de previa caía en jornada 25 (cuartos) y el de semis en 29 (final) | Extra en jornadas `31+` por fase |

Probado en `http://localhost:4173/?qa=bugs-1`: consola sin errores, `GL.resultado(...)`
devuelve `2 - 1` y `GL.golesReales(...)` solo `{gf, gc}` como corresponde.

## Verificación de seguridad en remoto

| Prueba | Resultado |
|---|---|
| ACL de RPC sensibles | `postgres`, `service_role` y `authenticated`; sin `anon` ni `=X/public` |
| ACL de `*_interno` y `limpiar_rate_limits` | Solo `postgres` y `service_role` |
| `gl_nombre_disponible` con anon key (REST) | HTTP `200`, `{"ok": true, "mensaje": "Nombre disponible"}` |
| `gl_generar_fixture` con anon key (REST) | HTTP `401`, `42501 permission denied for function` |
| `gl_crear_notificacion` con anon key (REST) | HTTP `401`, `42501 permission denied for function` |
| `gl_generar_fixture_interno` con anon key (REST) | HTTP `401`, `42501 permission denied for function` |
| Simulación `authenticated` sin rol admin | Las seis RPC devuelven `{"ok": false, ...}` con “No tenés permisos de administrador.” |
| Notificación para otro jugador | Bloqueada: “No podés crear notificaciones para otro jugador.” |
| Auditoría sin rol admin | Bloqueada: “No tenés permisos para registrar auditoría.” |
| `search_path` en wrappers | `search_path=""` |
| `search_path` en internas/helpers | `search_path=public, pg_temp` |

## Limitaciones

- `auth.users = 0` y `auth.mfa_factors = 0`: no se pudieron probar flujos reales de
  administrador ni MFA. Las RPC se validaron con roles simulados y transacciones revertidas;
  cuando exista una cuenta admin real hay que repetir una generación de fixture, cierre de
  jornada y alta de temporada.
- El prueba de `signUp` quedó limitada por `email_address_invalid` y después por
  `over_email_send_rate_limit` (HTTP `429`) del proveedor de correo; no es un regression de esta versión.

## Publicación

- Commit `a362562` (“Endurecer RPC y corregir bugs de frontend (1.0.13)”), pusheado a
  `origin/main` desde `3c9ae1b`.
- GitHub Pages: run `45527630157` (n.º 16, `head_sha a362562`) **completado con `success`**.
- Sitio live `https://manu-2323.github.io/GOAT-LATINOS/`: `CONFIG.VERSION = 1.0.13`,
  `GL.resultado(...) = 2 - 1`, `GL.horarioZona('America/Tijuana') = 09:00 – 19:00`.
- `index.html` en vivo: 11 scripts y 1 hoja de estilos con `?v=1.0.13` (12 referencias),
  sin restos de `?v=1.0.12`.
- Consola sin errores. Red: `paises`, `torneos`, `grupos`, `jugadores_publicos`,
  `grupo_jugadores`, `jornadas`, `clasificacion` y `sanciones` devolvieron `200`. No hubo
  lecturas de `jugadores` ni llamadas a RPC sensibles sin sesión.
- Cierre: versión `1.0.13` publicada y verificada en local, base de datos remota y sitio live.
  Queda pendiente repetir los flujos administrativos reales cuando exista una cuenta admin.
