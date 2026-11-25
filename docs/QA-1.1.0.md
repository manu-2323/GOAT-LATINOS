# QA — RESET 1.1.0

## Objetivo

Vaciar la liga, conservar solo las dos cuentas administradoras, reconstruir el torneo desde cero y
dejar una administración clara con torneo, temporada, jornadas, jugadores y exportación PNG
operativos. La clave de administrador **no se transcribe en este documento**.

## Respaldos y migraciones

- Respaldo previo al vaciado: `backup-pre-1.1.0.json` (239.562 bytes).
  SHA256: `7F601D506FB94A41C8C2FC9226F6679E586EC9C3C42C6D86035D1B5A7DFFAF62`.
  Incluye 19 tablas públicas, 2 usuarios de Auth y 2 identidades.
- `supabase/migration-1.1.0.sql` aplicada: `gl_crear_torneo`, `gl_eliminar_torneo`,
  `gl_actualizar_total_jornadas`, `gl_guardar_jornada_manual` y `gl_borrar_jornada_manual`.
- Las cinco RPC nuevas están verificadas en remoto como `SECURITY DEFINER`, con
  `search_path=''`, owner `postgres` y permisos para `postgres`, `service_role` y
  `authenticated`; `anon` no tiene ejecución.
- `supabase/migration-vaciado-1.1.0.sql` aplicada: torneo `GOATS LATINOS 2026`, temporada `2026`,
  estado `activo`, 22 jornadas, 2 grupos, jugadores y cuenta Auth reducidos a los dos admins,
  tablas deportivas en cero y reglamento en blanco.

## Hallazgo importante de infraestructura

El secret remoto llamado `SERVICE_ROLE_KEY` estaba inválido y devolvía `Invalid API key`; el secret
actualizado `SUPABASE_SERVICE_ROLE_KEY` funciona correctamente. Todas las Edge Functions que usan
credenciales de servicio ahora leen primero `SUPABASE_SERVICE_ROLE_KEY` y conservan
`SERVICE_ROLE_KEY` solo como respaldo:

- `admin-crear-jugador`
- `admin-gestionar-admins`
- `admin-obtener-clave`
- `admin-promover`
- `eliminar-cuenta`
- `analizar-captura`

No se guardó ningún valor de secret en el repositorio, en documentación ni en el frontend.

## Estado final remoto

| Elemento | Estado |
|---|---|
| Torneos | 1: `GOATS LATINOS 2026`, temporada `2026`, `activo`, 22 jornadas |
| Jugadores | 2 admins activos, ambos con `torneo_id` asignado |
| Usuarios Auth | 2, los correos autorizados preexistentes |
| `admin_acceso` | 2 filas |
| `admin_credencial` | 1 fila con hash bcrypt |
| Países | 16 |
| Grupos | 2 |
| Jornadas / partidos / grupo_jugadores | 0 / 0 / 0 |

## Validaciones en frontend

- Sitio local servido desde `index.html?qa=1.1.0`: `CONFIG.VERSION = 1.1.0`, sin errores de
  consola, y `GL.exportarTabla`, `GL.exportarPNG` y `GL.exportarPerfil` disponibles como funciones.
- Cache busting `?v=1.1.0` en estilos, scripts base y carga dinámica de módulos.
- Login con el correo autorizado del administrador principal y la clave vigente: sesión iniciada,
  `rol='admin'` y `super_admin=true`.
- Login con la cuenta GØA: sesión iniciada, `rol='admin'` y `super_admin=false`.
- La alta rápida de jugadores crea la cuenta Auth, el jugador y la asignación al grupo elegido;
  el teléfono se guarda en formato E.164 con prefijo `+505` para Nicaragua.
- La baja de jugadores elimina cuenta Auth, jugador, partidos, sanciones y grupos; las cuentas
  administradoras no aparecen como eliminables.
- **Crear Torneo**: abre el formulario y la RPC `gl_crear_torneo` responde `200`.
- **Eliminar torneo actual**: abre confirmación de peligro y la RPC `gl_eliminar_torneo`
  responde `200`. La prueba se revertó y el torneo original quedó reactivado.
- **Nueva Temporada**: muestra los tres pasos. El modo manual ofrece desplegables de jugadores
  inscritos con teléfono (`NOMBRE · +505 XXXX XXXX`), guarda y borra jornadas con
  `gl_guardar_jornada_manual` y `gl_borrar_jornada_manual` (`200` en ambos casos).
- Exportar PNG desde Tabla abre la vista previa al primer clic (`1440 × 474 px`), genera una
  imagen de 230.798 caracteres en `data:` y Cancelar cierra la vista sin errores.
- «Ver tour» en Mi Perfil reinicia el recorrido desde el paso 1 de 8 sin errores.
- El formulario de registro muestra `+505` al elegir Nicaragua y actualiza la zona a
  `America/Managua`.

## Responsive

Se verificó con iframes del propio sitio para forzar anchos reales de `360`, `390`, `1024`,
`1280`, `1440` y `1920` px en Tabla, Calendario, Administración y Mi Perfil:

- `documentElement.scrollWidth === innerWidth` en todos los casos.
- Sin elementos visibles que excedan el ancho del viewport.
- A `360`/`390` px aparece la navegación móvil; desde `781` px se oculta.
- De `1024` a `1920` px el contenido conserva el sidebar, el ancho principal y la tabla sin
  desbordes ni solapamientos.

Los jugadores temporales creados para QA se eliminaron y las jornadas de prueba se borraron.
El estado remoto final se consultó después de esas limpiezas.

## Publicación

- Commit funcional `9c0d896` en `main`.
- GitHub Pages: run `45569624972`, deployment `8051353870`, estado **success**.
- Sitio live `https://manu-2323.github.io/GOAT-LATINOS/`: `CONFIG.VERSION = 1.1.0`,
  `config.js?v=1.1.0` con HTTP 200, sin errores de consola en carga limpia.
- El torneo visible en live es `GOATS LATINOS 2026 · 2026`, sin datos deportivos.
- Login admin en live con el correo autorizado y la clave vigente: sesión iniciada,
  `rol='admin'` y `super_admin=true`; la clave no se transcribe aquí. Cierre de sesión correcto.

## Incidencia de QA en live

Durante la verificación aparecieron `AbortError` de `navigator.locks` y un refresh token inválido
por las pestañas QA antiguas abiertas en el mismo origen `manu-2323.github.io`. Al cerrar esas
pestañas y limpiar el almacenamiento local del origen, la carga quedó limpia y el torneo 2026 se
mostró correctamente. No requirió cambios de código.

## Resultado

Publicado y funcional en `1.1.0`. El valor antiguo del secret de servicio debe considerarse
inválido; el despliegue depende únicamente de `SUPABASE_SERVICE_ROLE_KEY`.
