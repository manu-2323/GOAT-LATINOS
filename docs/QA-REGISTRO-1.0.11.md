# QA de registro seguro — 1.0.11

Versión local: **1.0.11**. Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`.
Ejecutado sobre `http://localhost:4173/` con el servidor estático del repo.

## Diagnóstico original

- `Auth.nombreDisponible()` consultaba `public.jugadores` directamente.
- `anon` no tiene `SELECT` sobre esa tabla (separación pública/privada).
- Supabase devolvía `401` / SQLSTATE `42501`: `permission denied for table jugadores`.
- El `catch` devolvía `ok:false`, `nombreOk` quedaba en `false` y el formulario bloqueaba el alta.
- La UI también exponía `gl_correo_existe`, que permitía enumerar correos registrados.

## Fix aplicado

- RPC `public.gl_nombre_disponible(text)`, `SECURITY DEFINER`, `search_path = ''`.
- Normalización con transliteración de acentos y fallback para nombres no latinos.
- `gl_correo_existe` revocada a `anon` y `authenticated`.
- Vista `public.jugadores_publicos` recreada con `security_invoker = false` y sin columnas
  sensibles (`email`, `telefono`, `user_id`, `rol`, `super_admin`).
- Política residual `lectura publica jugadores` eliminada.
- `GL._columnas.jugadores_publicos` actualizado sin `rol`.
- Todos los scripts de `index.html` pasaron a `?v=1.0.11`.

## Verificación REST con anon key

| Prueba | Resultado |
|---|---|
| `gl_nombre_disponible('NuevoNombreUnico987')` | `200` → `{ ok: true }` |
| `gl_nombre_disponible('Manuel')` | `200` → `{ ok: false }` |
| `gl_nombre_disponible('Joaquin.11sb')` | `200` → `{ ok: false }` |
| `gl_nombre_disponible('†ㅤGØA†')` | `200` → `{ ok: false }` |
| `gl_nombre_disponible('ツ ƈнєяy')` | `200` → `{ ok: false }` (fallback no latino) |
| `jugadores_publicos?select=id,nombre_usuario,pais,numero` | `200` |
| `jugadores_publicos?select=id,email` | `400` → la columna no existe |
| `rpc/gl_correo_existe` | `401` → permiso denegado |
| `jugadores?select=id` | `401` → permiso denegado |

## Verificación en navegador

- Overlay “Acceso a la liga” → **Registrate** → formulario “Sumate a la liga”.
- Se escribió `CR7_LATINO_NUEVO` en `NOMBRE EN FC MOBILE`.
- Apareció **Nombre disponible** sin errores de consola.
- Red: `POST /rest/v1/rpc/gl_nombre_disponible` → `200`, body
  `{"p_nombre":"CR7_LATINO_NUEVO"}` / `{"ok":true,"mensaje":"Nombre disponible"}`.
- No se registraron llamadas a `jugadores` ni a `gl_correo_existe`.
- Vista pública cargada con `200` y columnas seguras.

## Estado remoto al cierre del fix

- `auth.users = 0`.
- `jugadores = 24`, todas con `user_id = null`.
- `mfa_factors = 0`.
- `sistema_config.bootstrap_completado = 'false'`.

## Confirmación de correo

`auth.config` no existe en este proyecto, pero el endpoint público `/auth/v1/settings` devolvió
`mailer_autoconfirm: false`. Por lo tanto **Confirm email está activo**: `auth.signUp()` crea la
cuenta pero no devuelve sesión y el overlay permanece con “Cuenta creada. Revisá tu correo…”.
El flujo ya contempla ese caso y no simula una sesión.

Se intentó además una prueba de alta completa, pero GoTrue rechazó los correos de prueba
(`email_address_invalid` para dominios reservados) y luego aplicó `email rate limit exceeded`
(HTTP 429). No se creó ninguna cuenta: `auth.users = 0`, `jugadores = 24`, `mfa_factors = 0`
después de los intentos.

## Publicación

- Commit `839d986` en `main`; GitHub Pages build `45523292976` completado con éxito.
- Sitio live: `CONFIG.VERSION = 1.0.11` y `GLManager.version = 1.0.11`.
- `js/core/supabase.js` en vivo usa `gl_nombre_disponible` y ya no contiene `gl_correo_existe`.
- `index.html` en vivo tiene 12 scripts con `?v=1.0.11` y un solo `meta description`.
- Prueba en vivo: `LIVE_QA_1011` muestra **Nombre disponible** y 0 errores de consola.

## Conclusión

El bloqueo reportado (“ningún nombre tiene disponibilidad”) quedó resuelto: la UI muestra
“Nombre disponible” para nombres nuevos y “Ese nombre ya está en uso” para los históricos, sin
errores de consola ni llamadas a la tabla privada. Para registrar una cuenta real, la persona debe
confirmar su correo y después iniciar sesión; el alta en el torneo sigue pendiente de aprobación
administrativa.
