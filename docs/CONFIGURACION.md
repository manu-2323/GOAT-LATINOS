# GOATS LATINOS · League Manager — Configuración

Versión actual: **1.0.16**. Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`.

## 1. Arranque

Abrí `index.html` directamente (funciona con `file://`) o servilo con cualquier servidor estático.
No hay npm, build ni frameworks. Las credenciales públicas (URL y anon key) ya están en
`js/core/config.js`. Las librerías `supabase.js`, `chart.umd.js` y `exportar-png.js` son locales.

Si querés servirlo con HTTPS local:

```bash
cd C:\Users\manue\OneDrive\Desktop\proyecto-GOAT-LATINO
npx --yes serve . -l 4173
```

> `npx` es solo una opción para servir archivos estáticos; la app no depende de npm para funcionar.

## 2. Base de datos

El SQL está en `supabase/` y, salvo la migración 7, es idempotente. `migration-hardening-rpcs.sql`
se aplica **una sola vez** porque renombra funciones (repetirla daría error de “función no existe”).
Ejecutalo en Supabase → SQL Editor en este orden:

1. `configuracion-completa.sql` — torneo, grupos A/B, columna `numero`, `email`, RLS base y bucket `capturas-partidos`.
2. `migration-numero-jugador.sql` — compatibilidad con el número del jugador.
3. `migration-admin-email.sql` — correo vinculado al perfil (si no se usó la configuración completa).
4. `migration-mejoras-1-9.sql` — tabla `paises` (16 países), `super_admin`, `avatar_url`, helper
   `gl_es_super_admin()`, bucket `avatares` y protección de campos sensibles.
5. `migration-registro-seguro.sql` — RPC `gl_nombre_disponible(text)`, retiro de `gl_correo_existe`,
   vista pública `jugadores_publicos` sin campos sensibles y limpieza de políticas residuales.
   Ejecutar **después** de las migraciones base para no revertir el endurecimiento.
6. `migration-zonas-horarias.sql` — columna `jugadores.zona_horaria` con backfill por país,
   vista pública actualizada y validación de formato IANA. Ejecutar **después** de
   `migration-registro-seguro.sql` para conservar la vista con la columna nueva.
7. `migration-hardening-rpcs.sql` (1.0.13) — renombra las RPC sensibles a `*_interno`, crea
   wrappers que validan `public.gl_es_admin()` con `auth.uid()`, revoca `EXECUTE` a `anon`/`PUBLIC`,
   fija `search_path` en funciones `SECURITY DEFINER` y termina con `notify pgrst, 'reload schema'`.
   Aplicada en producción sin errores; ver `docs/QA-AUDITORIA-1.0.13.md`.
8. `migration-fix-rls-recursion.sql` (1.0.15) — reemplaza las subconsultas a `jugadores` dentro de
   políticas RLS por `gl_es_admin()` / `gl_es_super_admin()` (SECURITY DEFINER). Sin esto, cualquier
   usuario con sesión recibía `42P17: infinite recursion detected in policy for relation jugadores`.
   Aplicada en producción; ver `docs/QA-RLS-1.0.15.md`.
 9. `migration-mensajes-1.0.16.sql` — agrega `jornadas.fecha_inicio` y `jornadas.hora_limite`
    (`timestamptz`), y `torneos.reglamento` (`text`); siembra el reglamento vigente. Aplicada en
    producción; ver `docs/QA-MENSAJES-1.0.16.md`.

Estado verificado en remoto: 16 países activos, 1 torneo activo, 2 grupos, columnas `numero`,
`email`, `super_admin`, `avatar_url`, `zona_horaria`, bucket `avatares` público, RPC
`gl_nombre_disponible` disponible para `anon`/`authenticated` y RPC `gl_correo_existe` revocada.

Consulta rápida de verificación:

```sql
select (select count(*) from paises where activo) as paises,
       (select count(*) from torneos where estado='activo') as torneos,
       (select count(*) from grupos) as grupos;
select proname from pg_proc where proname like 'gl_%' order by proname;
```

La lectura de tablas del torneo es pública; la escritura está restringida a administradores.
`public.jugadores` es privada: `anon` no tiene `SELECT` y la app lee solo la vista
`public.jugadores_publicos`, que expone `id`, `nombre_usuario`, `pais`, `zona_horaria`, `avatar_url`,
`activo`, `suspendido`, `torneo_id` y `numero`. Nunca expone `email`, `telefono`, `user_id`, `rol` ni
`super_admin`. El trigger `gl_proteger_rol` impide que un jugador se autoasigne `rol`, `activo`,
`suspendido`, `torneo_id`, `super_admin` o `email`. `service_role` y el `super_admin` pueden
actualizar esos campos.

El registro valida el nombre con `gl_nombre_disponible(text)`, una RPC `SECURITY DEFINER` con
`search_path = ''` que devuelve solo `{ ok, mensaje }`. No se consultan filas de `jugadores`
desde el navegador y la comprobación de correo se dejó de exponer para evitar enumeración de
cuentas.

## 3. Seguridad de credenciales

| Credencial | Dónde va |
|---|---|
| URL + anon key | `js/core/config.js` (público, ya configurado) |
| **SERVICE_ROLE_KEY** | Solo secret de Supabase Edge Functions |
| **GEMINI_API_KEY** | Solo secret de la función `analizar-captura` |
| **ADMIN_PASSWORD** | Solo secret de `admin-gestionar-admins` y `admin-obtener-clave` |
| Contraseña bootstrap | Constante server-side en `admin-bootstrap`; nunca en frontend, repo ni docs |

> La Service Role Key, la API key de Gemini y la clave de administrador **nunca** se escriben en el
> frontend, en este repo ni en docs. Si expusiste alguna, rotala desde Supabase → Settings → API
> (Service Role), Google AI Studio (Gemini) y el panel de Secrets (administrador).

Los secrets ya configurados en remoto son `SERVICE_ROLE_KEY`, `GEMINI_API_KEY` y `ADMIN_PASSWORD`.
Si necesitás setearlos en otro proyecto:

```bash
supabase secrets set SERVICE_ROLE_KEY=<service_role_key_del_proyecto>
supabase secrets set GEMINI_API_KEY=<api_key_de_google_ai_studio>
supabase secrets set ADMIN_PASSWORD=<clave_de_administrador>
```

No reescribas los valores actuales salvo rotación intencional.

### Roles y acceso de administrador

- No hay lista fija de correos: **cualquier correo puede ingresar como admin si conoce la clave**.
- En la pantalla de acceso, tocá **Acceso de administrador**, escribí el correo y la clave.
- `admin-bootstrap` valida la clave contra la constante bootstrap del propio Edge Function, crea/
  actualiza la cuenta y promueve la fila en `jugadores` usando Service Role. El navegador nunca
  compara la clave. Se bloquea de forma permanente después del primer alta exitosa y limita intentos.
- Las altas posteriores de administradores usan `admin-gestionar-admins` con `ADMIN_PASSWORD` y
  `admin-promover`, ambos restringidos al `super_admin`.
- El **primer administrador** queda marcado como `super_admin`. Ese rol habilita la pestaña
  **Administradores**, la gestión de otros admins, la consulta de la clave y la edición de países.
- `admin-gestionar-admins` exige `super_admin`. Los nuevos administrarios se crean con
  `super_admin: false`. No se puede quitar el rol al administrador principal ni dejar menos de un admin.
- `admin-obtener-clave` devuelve `ADMIN_PASSWORD` únicamente al `super_admin` autenticado. Se muestra
  en **Administración → Administradores → Ver clave de administrador**.
- Los roles se verifican contra la base de datos **en cada carga de módulo**, no solo al iniciar sesión.

Para corregir un rol a mano (solo si hace falta):

```sql
update jugadores set rol = 'admin'
where user_id = (select id from auth.users where lower(email) = lower('TU_EMAIL@ejemplo.com'));
```

## 4. Edge Functions

Hay **7 funciones desplegadas**. Desde la CLI (con `--yes` para entornos no interactivos):

```bash
supabase functions deploy analizar-captura --yes
supabase functions deploy admin-crear-jugador --yes
supabase functions deploy admin-bootstrap --yes
supabase functions deploy admin-promover --yes
supabase functions deploy admin-gestionar-admins --yes
supabase functions deploy admin-obtener-clave --yes
supabase functions deploy eliminar-cuenta --yes
```

| Función | Qué hace |
|---|---|
| `analizar-captura` | Valida sesión de admin, acepta JPG/PNG de hasta 5 MB y llama a **Gemini Flash-Lite** (`gemini-3.5-flash-lite:generateContent`) con thinking mínimo y timeout de 18 s. El modelo 2.0 fue retirado por Google y 3.8 Flash tiene una latencia excesiva para esta extracción. Devuelve exactamente 10 campos numéricos: goles, tiros, tiros a puerta, posesión y pases de ambos equipos. |
| `admin-crear-jugador` | Crea cuenta Auth y fila en `jugadores` con Service Role verificando que quien llama es admin. Si falla la BD, borra el usuario creado. |
| `admin-bootstrap` | Valida la clave de administrador, crea/actualiza la cuenta, promueve a admin y asigna `super_admin` al primero. Límite: 5 intentos/minuto. |
| `admin-gestionar-admins` | Alta y baja de administradores, solo para `super_admin`. Bloquea auto-despromoción, quitar al principal y dejar menos de un admin. |
| `admin-obtener-clave` | Devuelve la clave de administrador solo al `super_admin`; nunca se guarda en frontend ni BD. |
| `eliminar-cuenta` | Borra cuenta Auth, fila de jugador, partidos, clasificación, sanciones, membresías y avatar. Exige escribir `ELIMINAR`. Bloquea borrar al `super_admin` o al último admin. |

Si `analizar-captura` no responde, el módulo **Resultados** avisa y se puede usar el ingreso manual.

## 5. Flujo recomendado del admin

1. Ejecutá el SQL de la sección 2, configurá los secrets y desplegá las seis funciones.
2. Entrá con **Acceso de administrador** usando cualquier correo y la clave configurada.
3. Administración → Configuración: revisá nombre, temporada y jornadas (22).
4. Administración → Jugadores: agregá a los 12 jugadores de cada grupo (o esperá a que se registren).
5. Fixture → Generar fixture (exactamente 12 por grupo).
6. Jornadas → cargá el **Horario** de inicio y límite de cada jornada y abrila. Configuración →
   revisá el reglamento. Mensajes → revisá la vista previa; si falta un dato, los botones quedan bloqueados.
7. Resultados → cargar marcadores (manual o con captura + Gemini). La tabla se recalcula sola.
8. Jornadas → Cerrar: resolvé los pendientes `1-0`, se recalcula todo y se genera el mensaje de cierre.
9. Eliminatorias → generar rondas a medida que se definen los ganadores.
10. Estadísticas globales → consultá tops, rachas, head-to-head y exportá PNG.

## 6. Mejoras 1.0.8 — Responsive en celular

- **Viewport** base `width=device-width, initial-scale=1.0` y cache-busting de CSS/JS.
- **Tabla**: en menos de 480 px se muestran `# | Jugador | J | Pts | Dif`, con la bandera dentro
  del nombre; un botón despliega G, E, P y goles. Pestañas de grupo a ancho completo.
- **Fixture**: partido en card vertical (local, marcador, visitante) y selector de jornada como
  desplegable grande.
- **Resultados**: botón de captura de 44 px, estadísticas en dos columnas y modal que cabe en 360 px.
- **Administración**: tablas con scroll horizontal y acciones en menú desplegable.
- **Navegación**: barra inferior con iconos Lucide y etiquetas cortas, objetivo táctil de 56 px.
- **Modales y toasts**: modales de hasta 90 % del ancho con scroll interno; toasts abajo y centrados.
- **General**: texto desde 14 px, botones y campos desde 44 px y padding lateral de 12 px.

## 7. Mejoras 1.0.9 — Acceso obligatorio

- **Login inicial**: al arrancar, si no hay sesión válida se muestra la pantalla de acceso antes de
  cargar cualquier vista. No existe modo invitado.
- **Bloqueo de navegación**: `#hash`, eventos de autenticación y cierre de sesión no pueden renderizar
  tabla, fixture ni estadísticas sin `Auth.usuario`. Al cerrar sesión vuelve el login.
- **Registro**: el overlay solo se cierra si Supabase devuelve sesión. Si el correo requiere
  confirmación, permanece el formulario con el mensaje correspondiente.
- **1.0.11**: el nombre se valida con `gl_nombre_disponible`; antes fallaba con `42501` porque
  `anon` intentaba leer `public.jugadores`. El correo ya no se comprueba en vivo: el formulario
  muestra “Lo verificaremos al crear la cuenta.” y `auth.signUp()` resuelve la existencia con un
  mensaje genérico. Los nombres históricos siguen reservados aunque no tengan cuenta vinculada.
- **Confirmación de correo**: verificado en `/auth/v1/settings` (`mailer_autoconfirm: false`).
  Por eso `signUp()` crea la cuenta pero no devuelve sesión; el overlay permanece con
  “Cuenta creada. Revisá tu correo…”. Después de confirmar, la persona inicia sesión con su
  contraseña y queda pendiente de aprobación hasta que un admin le asigne grupo.
- **Capa visual**: el overlay cubre toda la pantalla (incluido el banner offline) y bloquea el scroll
  del fondo mientras se autentica.

## 8. Mejoras 1.0.12 — Horarios internacionales

- **Zona por jugador**: el registro y el perfil piden **ciudad o zona horaria** (`zona_horaria`,
  valor IANA). Países con una sola zona se preseleccionan; México, Brasil, Chile y Argentina
  obligan a elegir ciudad. Ejemplos: `America/Mexico_City`, `America/Tijuana`, `America/Manaus`,
  `America/Santiago`, `America/Argentina/Buenos_Aires`.
- **Referencia deportiva**: `11:00 – 21:00` en `America/Managua`. No hay fecha/hora programada
  en `public.partidos`, por eso se muestra el horario estimado de la jornada, no una fecha falsa.
- **Conversión real**: `Intl.DateTimeFormat` convierte ese instante a la zona de cada jugador,
  respetando cambios estacionales (Tijuana y Santiago cambian; Ciudad de México y Buenos Aires no).
- **Vistas afectadas**: fixture y “Partidos de hoy” muestran la hora de local y visitante;
  administración muestra la zona junto al horario; mensajes de WhatsApp agrupan por zona real.
- **Backend**: la columna existe en `public.jugadores` y en la vista pública; el alta desde
  administración envía la zona y la Edge Function la valida con `Intl` antes de insertar.
- **Novatos**: notas con el horario local y su offset (`UTC-06:00`), selector con nombres de
  ciudad y mensaje de ayuda si todavía no eligieron zona.

## 9. Mejoras 1.0.13 — Auditoría de RPC y correcciones

- **RPC endurecidas**: `gl_generar_fixture`, `gl_generar_calendario`, `gl_guardar_resultado`,
  `gl_cerrar_jornada`, `gl_crear_temporada` y `recalcular_clasificacion` ahora son wrappers que
  validan `public.gl_es_admin()` y toman la identidad de `auth.uid()`, nunca del UUID que enviaba
  el navegador (`p_ingresado_por`, `p_cerrado_por`, `p_creado_por`).
- **Sin `anon` escribiendo**: se revocó `EXECUTE` a `anon` y `PUBLIC` en esas RPC y en las
  internas `*_interno`, notificaciones, auditoría, `limpiar_rate_limits` y triggers. El frontend
  con sesión conserva acceso; `gl_nombre_disponible` sigue público para el registro.
- **`search_path` fijo**: `''` en los wrappers y `public, pg_temp` en las funciones internas y
  helpers, para evitar secuestro de `search_path`.
- **Notificaciones**: un jugador solo crea las suyas; el admin puede crear para cualquiera.
  Auditoría registra siempre a quien ejecuta la acción (`auth.uid()`).
- **`partidos_historial`**: sin grants directos a `anon`/`authenticated`; sus políticas
  `ph_admin_read` / `ph_service_write` ya usan `gl_es_admin()`.
- **Bugs corregidos**: `stats-jornada.js` lee el marcador con `GL.resultado()` (antes `undefined`),
  `clasificacion.js` devuelve el contexto refrescado, `notificaciones.js` consulta partidos con
  `GL.partidos()` (antes `GL.ctx.partidos`, inexistente) y las eliminatorias ponen el partido extra
  en jornadas 31+ para no colisionar con cuartos, semifinales y final.
- **Verificación**: anon `401` en RPC sensibles, `200` en `gl_nombre_disponible`, y simulación
  con `authenticated` sin rol admin bloqueada en todas las RPC. Detalle en
  `docs/QA-AUDITORIA-1.0.13.md`.

## 10. Mejoras 1.0.14 — Estadísticas de rendimiento

- **Denominador correcto por métrica**: goles por partido real, posesión sobre partidos con posesión
  registrada y precisión de pase sobre partidos con pase registrado. Un encuentro sin dato no cuenta
  como `0%` ni entra en el denominador; los walkovers y resoluciones por expulsión quedan fuera.
- **Fuente única**: `EST.calcularPromedios()` y `EST.calcularRendimiento()` son los únicos que
  calculan estos promedios. `stats-globales.js` y `perfil.js` consumen ese resultado, sin lógica
  duplicada.
- **Visibilidad**: las globales muestran `n PJ con datos` junto a posesión y pase, y goles por partido
  real en el top de goleadores; el perfil muestra partidos reales, goles por partido real y la cuenta
  de partidos con datos.
- **Verificación**: datos sintéticos con denominadores `posN=2`, `paseN=2` y `promGoles=2`; render sin
  `undefined`/`NaN` y consola sin errores. Detalle en `docs/QA-ESTADISTICAS-1.0.14.md`.

## 11. Mejoras 1.0.15 — Políticas RLS sin recursión

- **Causa**: varias políticas de `jugadores` (y de `partidos`, `auditoria`, `notificaciones`, etc.)
  consultaban `public.jugadores` desde su propio `USING`/`WITH CHECK`. Al iniciar sesión, evaluar
  esa política volvía a evaluar las políticas de `jugadores` y PostgreSQL devolvía `500` con
  `42P17: infinite recursion detected in policy for relation jugadores`.
- **Fix**: esas subconsultas se cambiaron por `public.gl_es_admin()` y `public.gl_es_super_admin()`,
  funciones `SECURITY DEFINER` con `search_path` fijo que devuelven el mismo resultado sin reevaluar
  RLS. Los permisos efectivos no cambian: un jugador sigue viendo solo su fila y un admin ve todas.
- **Verificación**: con la cuenta de pruebas logueada, `GET /rest/v1/jugadores` y
  `GET /rest/v1/partidos` devuelven `200`, el módulo de estadísticas globales renderiza con
  `PJ con datos` y la consola no registra errores. Detalle en `docs/QA-RLS-1.0.15.md`.

## 12. Mejoras 1.0.16 — Mensajes verificados

- **Datos reales**: la jornada tiene `fecha_inicio` y `hora_limite`; el torneo tiene `reglamento`.
  El generador ya no usa la franja fija `11:00–21:00`, sino esos instantes convertidos a la zona IANA de cada jugador.
- **Apertura**: incluye torneo, temporada, grupo, número de jornada, inicio, límite, seis enfrentamientos,
  horarios por jugador y reglamento aplicable.
- **Cierre**: incluye clasificación actualizada, resultados, goles y goleadores reales, estadísticas con
  denominadores válidos, resoluciones administrativas separadas y próxima jornada.
- **Verificación previa**: si falta horario, reglamento, zona horaria, sexto encuentro, cierre de jornada
  o actualización de la clasificación, se muestran los motivos y se desactivan copiar, descargar y enviar.
- **Edición**: botón **Horario** por jornada y campo **Reglamento vigente** en Configuración.
  Detalle en `docs/QA-MENSAJES-1.0.16.md`.

## 13. Mejoras 1.0.5

- **Países dinámicos**: tabla `paises` cargada al arrancar; banderas reales vía `flagcdn.com` en tabla,
  fixture, perfil y administración. La bandera emoji queda solo para textos de WhatsApp.
- **Horarios por país** (histórico, reemplazado en 1.0.12 por la sección 8): base UTC-6
  Nicaragua/Costa Rica `11:00 AM – 9:00 PM`, con ajuste por país (`PAISES` / `ZONAS_HORARIAS`).
  Los textos `PAISES[].horario` se conservan solo como respaldo.
- **Perfil completo**: foto JPG/PNG de hasta 2 MB en bucket `avatares`, nombre, país, teléfono y
  horario con vista previa. Botón **Eliminar mi cuenta** con confirmación estricta.
- **Registro validado**: checkmark de nombre en vivo (debounce 500 ms) contra la RPC segura, correo
  sin enumeración, validación de contraseña y confirmación, mensaje específico para Gmail.
- **Mensajes**: vista previa de WhatsApp, botón de envío y horarios; desde 1.0.12 se agrupan
  por zona horaria real de cada participante.
- **Estadísticas globales**: top 5 de goles, vallas, victorias, diferencia y posesión; rachas;
  head-to-head; gráfico Chart.js local y exportación PNG.
- **Administración**: distinción de `Administrador principal`, pestaña restringida a `super_admin`,
  consulta de clave y columnas de horario/contacto/rol en la tabla de jugadores.
- **IA**: Gemini Flash-Lite (`gemini-3.5-flash-lite`, modelo 2.0 retirado por Google) reemplaza a la integración anterior; toast con icono animado
  `Analizando captura con Gemini AI...`.

## 14. Decisiones de diseño

- **Sin emojis en la UI.** El código de país se muestra como chip tipográfico y bandera de imagen.
  Las banderas emoji se usan únicamente en textos generados para WhatsApp.
- **Idioma**: todo el texto visible está en español; fechas en `DD/MM/YYYY`.
- **WhatsApp**: denominador confirmado `#18 / #396`.
- **Suspensiones/expulsiones**: partidos pendientes se resuelven `1-0` y **no** suman valla invicta.
- **Clasificación**: `pts = max(0, PG*3 + PE - sanciones)`, orden por puntos → diferencia → goles a favor.
- **Playoffs**: se guardan en `partidos` con jornada 23-30; el recálculo ignora jornadas mayores a `total_jornadas`.
- **Fixture**: requiere exactamente 12 jugadores por grupo y 22 jornadas. No se regenera si ya hay resultados.
- **Cambio de grupo**: solo durante los primeros 7 días del torneo; la asignación inicial de pendientes sigue disponible.
- **Confirmaciones**: acciones destructivas usan modal; el resto de acciones confirman con toast.
- Todas las vistas muestran skeleton mientras cargan y reinicializan Lucide después de cada render.

## 15. Solución de problemas

| Síntoma | Acción |
|---|---|
| "Falta configurar SERVICE_ROLE_KEY" | Verificá el secret en Supabase → Edge Functions → Secrets con el nombre exacto `SERVICE_ROLE_KEY`. |
| "Falta configurar GEMINI_API_KEY" | Cargá la key de Google AI Studio y redeployá `analizar-captura`. |
| "Solo el administrador principal puede..." | Ingresá con la cuenta marcada como `super_admin` o corregí el flag con Service Role. |
| El registro dice que el nombre está en uso | Es un nombre histórico reservado; elegí otro o pedí a un admin que vincule esa fila. |
| “No se pudo verificar el nombre” | Revisá que `gl_nombre_disponible` esté ejecutada en remoto (`supabase/migration-registro-seguro.sql`). |
| El correo dice “Lo verificaremos al crear la cuenta” | Comportamiento normal: no enumeramos correos; `signUp` informa si ya existe. |
| La tabla no muestra banderas | Revisá que `paises` tenga filas activas y que `flagcdn.com` sea accesible. |
| El gráfico no aparece | Confirmá que `librerias/chart.umd.js` esté presente y que `index.html` lo cargue antes de los módulos. |
