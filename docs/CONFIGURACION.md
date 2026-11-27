# GOATS LATINOS · League Manager — Configuración

Versión funcional actual: **1.3.3** (`CONFIG.VERSION`, FASE 3.19; CSS con `?v=3.19.0`).
Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`. Las secciones históricas conservan las versiones de su fecha.

## 1. Arranque

La app en producción no requiere build ni frameworks; las librerías `supabase.js`,
`chart.umd.js` y `exportar-png.js` son locales y las credenciales públicas (URL y anon key) ya
están en `js/core/config.js`. Para reproducir el entorno de pruebas se recomienda servirla por HTTP:

```bash
cd <raiz-del-repositorio>
python3 -m http.server 4173 --bind 127.0.0.1
# alternativa sin Python:
node scripts/servir-local-3.6.mjs
```

También se puede abrir `index.html` con `file://` para una revisión rápida, pero los arneses
visuales y E2E usan HTTP local. `npx --yes serve . -l 4173` sigue siendo una opción, no una
dependencia: las herramientas de desarrollo se instalan por separado con `npm ci`.

Los arneses no contienen rutas personales: resuelven la raíz desde `import.meta.url`, usan
`PLAYWRIGHT_BASE_URL` (por defecto `http://127.0.0.1:4173`) y aceptan `CHROME_PATH` para un
navegador del sistema. Con Chromium gestionado por Playwright, definir `PLAYWRIGHT_BROWSERS_PATH`
antes de `npx playwright install chromium`. Anchos verificados: 320, 375, 390, 768, 1024, 1280,
1366 y 1920 px. `GL_CAPTURAS_DIR` permite redirigir las capturas generadas a otra carpeta sin
sobrescribir evidencias históricas.

## 2. Base de datos

El SQL está en `supabase/` y, salvo la migración 7, es idempotente. `migration-hardening-rpcs.sql`
se aplica **una sola vez** porque renombra funciones (repetirla daría error de “función no existe”).
Ejecutalo en Supabase → SQL Editor en este orden:

> Lista histórica de migraciones base. El estado posterior se documenta en los informes 3.11 y
> 3.12; FASE 3.19 no amplía ni reordena esta sección ni ejecuta migraciones en producción.

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
`public.jugadores_publicos`, que expone `id`, `nombre_usuario`, `pais`, `avatar_url`, `activo`,
`suspendido`, `torneo_id` y `numero`. Nunca expone `email`, `telefono`, `user_id`, `rol`, `zona_horaria` ni
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
| **ADMIN_PASSWORD** | Solo secret de `admin-gestionar-admins`; `admin-obtener-clave` ya no lo entrega |
| Clave de administrador | Hash bcrypt en `public.admin_credencial` + secreto `ADMIN_PASSWORD`; nunca en claro en frontend, repo ni docs |

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

### Roles y acceso de administrador (1.0.18)

- Hay **exactamente dos cuentas autorizadas**: `manuelperezcanales2021@gmail.com` (superadministrador)
  y `fcmobilegt00@gmail.com` (administrador). Un jugador que conozca la clave **no puede entrar** con
  otro correo: la RPC rechaza el correo antes de comparar la clave.
- En la pantalla de acceso, tocá **Acceso de administrador**, escribí el correo autorizado y la clave.
- `gl_validar_acceso_admin(p_email, p_clave)` es una RPC `SECURITY DEFINER` ejecutable por `anon`.
  Consulta `public.admin_acceso`, compara la clave con el hash bcrypt de `public.admin_credencial` usando
  `extensions.crypt`, exige que la fila siga siendo `rol='admin'` y `activo=true`, y bloquea tras
  **5 intentos fallidos por correo durante 15 minutos**. El navegador nunca compara la clave.
- Después de validar, el cliente hace `signInWithPassword` con la misma clave, recarga el perfil y
  cierra la sesión si la fila no es administrador. La sesión de Supabase es el único estado de acceso.
- `admin-bootstrap` quedó **retirado del flujo y sin clave**: ya no crea administradores y responde
  `403`. Según FASE 3.18 sigue `ACTIVE` en producción; borrarlo o redesplegarlo requiere autorización.
- Ambos administradores tienen `rol='admin'`, por lo que acceden a **todos los módulos** —incluido
  Calendario, Jornadas, Resultados, Mensajes y Administración— y conservan su fila original de jugador,
  con grupo, partidos y estadísticas personales intactos.
- Manuel conserva `super_admin=true`: esa flag habilita la pestaña **Administradores** y la edición de
  países. Desde 3.17 **no habilita consultar la clave**: el panel no la muestra ni la copia. GØA tiene
  `super_admin=false` pero acceso completo vía `rol='admin'`.
- `ツ ƈнєяy` pasó a `rol='jugador'` sin perder ningún dato deportivo.
- `admin-gestionar-admins` sigue exigiendo `super_admin` y usa el secreto `ADMIN_PASSWORD`, rotado a la
  misma clave compartida. `admin-obtener-clave` quedó como respuesta `410`: no entrega ningún secreto.
- Los roles se verifican contra la base de datos **en cada carga de módulo**, no solo al iniciar sesión.

Para corregir un rol a mano (solo si hace falta):

```sql
update jugadores set rol = 'admin'
where user_id = (select id from auth.users where lower(email) = lower('TU_EMAIL@ejemplo.com'));
```

## 4. Edge Functions

Según FASE 3.18 hay **7 funciones `ACTIVE`**, de las cuales **6 son operativas**. `admin-bootstrap`
sigue desplegada, pero está retirada en código y sólo responde `403`: **no se redespliega**. Desde la
CLI (con `--yes` para entornos no interactivos):

```bash
supabase functions deploy analizar-captura --yes
supabase functions deploy admin-crear-jugador --yes
supabase functions deploy admin-promover --yes
supabase functions deploy admin-gestionar-admins --yes
supabase functions deploy admin-obtener-clave --yes
supabase functions deploy eliminar-cuenta --yes
```

| Función | Qué hace |
|---|---|
| `analizar-captura` | Valida sesión de admin, acepta JPG/PNG de hasta 5 MB y llama a **Gemini Flash-Lite** (`gemini-3.5-flash-lite:generateContent`) con thinking mínimo y timeout de 18 s. El modelo 2.0 fue retirado por Google y 3.8 Flash tiene una latencia excesiva para esta extracción. Devuelve exactamente 10 campos numéricos: goles, tiros, tiros a puerta, posesión y pases de ambos equipos. |
| `admin-crear-jugador` | Crea cuenta Auth y fila en `jugadores` con Service Role verificando que quien llama es admin. Si falla la BD, borra el usuario creado. |
| `admin-bootstrap` | Retirada en 1.0.18. Sigue `ACTIVE` en producción pero devuelve `403` y no contiene clave: el acceso usa la RPC `gl_validar_acceso_admin`. No redesplegar ni borrar sin autorización. |
| `admin-promover` | Promueve o revoca privilegios de administrador; exige JWT de superadministrador y registra en `admin_audit_log`. No incorpora AAL2/MFA. |
| `admin-gestionar-admins` | Alta y baja de administradores, solo para `super_admin`. Bloquea auto-despromoción, quitar al principal y dejar menos de un admin. |
| `admin-obtener-clave` | Desde 3.17 responde `410` con instrucciones; no lee ni devuelve `ADMIN_PASSWORD`. El botón «Ver clave» fue retirado del panel. |
| `eliminar-cuenta` | Borra cuenta Auth, fila de jugador, partidos, clasificación, sanciones, membresías y avatar. Exige escribir `ELIMINAR`. Bloquea borrar al `super_admin` o al último admin. |

Si `analizar-captura` no responde, el módulo **Resultados** avisa y se puede usar el ingreso manual.

## 5. Flujo recomendado del admin

1. Ejecutá el SQL de la sección 2, aplicá `supabase/migration-admin-1.0.18.sql`, configurá los secrets y desplegá las funciones operativas listadas en §4; `admin-bootstrap` no se redespliega.
2. Entrá con **Acceso de administrador** usando uno de los dos correos autorizados y la clave compartida.
3. Administración → Configuración: revisá nombre, temporada y jornadas (22).
4. Administración → Jugadores: agregá a los 12 jugadores de cada grupo (o esperá a que se registren).
5. Cuadro de partidos → Generar cuadro de partidos (exactamente 12 por grupo).
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
- **Cuadro de partidos**: partido en card vertical (local, marcador, visitante) y selector de jornada como
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
  tabla, cuadro de partidos ni estadísticas sin `Auth.usuario`. Al cerrar sesión vuelve el login.
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
- **Vistas afectadas**: cuadro de partidos y “Partidos de hoy” muestran la hora de local y visitante;
  administración muestra la zona junto al horario; mensajes de WhatsApp agrupan por zona real.
- **Backend**: la columna existe en `public.jugadores`; el alta desde administración envía la
  zona y la Edge Function la valida con `Intl` antes de insertar. La vista pública
  `public.jugadores_publicos` **no expone `zona_horaria`**: el administrativo lee la tabla
  completa; cuando una vista pública no trae `zona_horaria`, el cliente deriva la zona desde
  `pais` con `GL.zonaJugador()`. No hay modo invitado operativo (§7).
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
- **Administración (histórico 1.0.5)**: distinción de `Administrador principal`, pestaña restringida
  a `super_admin`, consulta de clave y columnas de horario/contacto/rol en la tabla de jugadores.
  La consulta de clave se retiró en 3.17 (`docs/fase-3.17-validacion.md`); la exportación PNG
  conserva estilos heredados, deuda P2-03 prevista para FASE 3.21.
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
- **Cuadro de partidos**: requiere exactamente 12 jugadores por grupo y 22 jornadas. No se regenera si ya hay resultados.
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
| El enlace de confirmación cae en 404 | Usá siempre `https://goat-latinos.pages.dev/`. GitHub Pages sigue como respaldo en `https://manu-2323.github.io/GOAT-LATINOS/`. Si el correo es viejo, pedí uno nuevo desde **¿No te llegó el correo de confirmación?** en el acceso. |
| «Supabase no pudo enviar el correo de confirmación» | Límite real de envío de correo de Supabase (SMTP integrado). No repitas el registro ni el reenvío; esperá a que se restablezca. La respuesta no incluye hora exacta. |
| «Creando…» se queda en alta administrativa | Antes no había timeout ni `finally`. Ahora el botón se rehabilita solo; si el correo queda como «resultado desconocido», revisá la lista de jugadores antes de volver a crear. |

## 16. Confirmación de correo 1.3.8

- **URL pública**: `CONFIG.SITE_URL = https://goat-latinos.pages.dev/`. `Auth.registrar()` y `Auth.reenviarConfirmacion()` envían ese valor como `emailRedirectTo`, de modo que el correo no dependa de la página desde la que se hizo el registro.
- **Configuración remota**: en Supabase Auth, `Site URL = https://goat-latinos.pages.dev/` y `Redirect URLs` conserva temporalmente `https://manu-2323.github.io/GOAT-LATINOS/` para correos ya enviados. No se cambiaron SMTP, plantillas ni credenciales.
- **Retorno del enlace**: `Auth.consumirCallback()` distingue éxito, expiración y enlace inválido antes de que `detectSessionInUrl` limpie el fragmento. Los errores se muestran en la pantalla de acceso con texto propio y se limpia la URL; un retorno válido muestra “Correo confirmado”.
- **Recuperación**: el acceso ofrece **¿No te llegó el correo de confirmación?** y llama a `auth.resend({ type: 'signup' })` con el mismo `emailRedirectTo`. No crea cuentas, no cambia correos ni contraseñas.
- **Cuentas ya registradas**: el enlace antiguo no se reescribe. Si el token ya se usó o venció, se solicita un correo nuevo con la misma dirección; la cuenta y su perfil siguen iguales.

## 17. Registro sin duplicados 1.3.9

- **Una sola llamada**: la UI bloquea el formulario desde el inicio del envío y `Auth.registrar()` tiene una barrera `_registrando` que rechaza registros concurrentes. Un clic produce una llamada a `signUp()`; además se consulta `gl_nombre_disponible` para validar el nombre en servidor.
- **Sin reenvíos duplicados**: `Auth.reenviarConfirmacion()` usa `_reenviando` además del botón deshabilitado.
- **Después de enviar el correo**: repetir `Registrar` con la misma dirección solo muestra un aviso; cambiar el correo habilita un nuevo intento.
- **Resultado desconocido**: si la respuesta se pierde, hay un timeout o falla la red, esa dirección queda bloqueada para nuevos registros hasta que se cambie el correo. Así un segundo clic no crea otra cuenta.
- **Errores**: `over_email_send_rate_limit` / `email rate limit exceeded` se explican como límite de proveedor de correo; un 429 genérico se describe como límite de solicitudes. Ninguno inventa un tiempo de espera ni recomienda pulsar repetidamente. Conexión, correo, contraseña y cuenta existente mantienen mensajes distintos.
- **Timeout local**: `CONFIG.TIMEOUT_REGISTRO = 30000` ms. Es una guardia de la interfaz, no un tiempo prometido por Supabase; al vencer se avisa y no se reintenta automáticamente.
- **No se modificaron** SMTP, plantillas, Site URL, Redirect URLs, rate limits de producción, RLS ni datos reales.

## 18. Alta administrativa sin bloqueos 1.3.9

- **Flujo real**: `Administración → Añadir jugador` y el alta rápida de Nueva Temporada llaman a la Edge Function `admin-crear-jugador` (`js/modulos/admin.js`). El navegador no usa Service Role; la función crea el usuario Auth con `admin.auth.admin.createUser` y luego inserta `jugadores` y `grupo_jugadores`.
- **Un clic**: una sola llamada a la Edge Function. Dentro de ella: validación del administrador, `createUser` y dos inserciones. Después: auditoría y recarga del contexto. No hay duplicados ni reintentos automáticos.
- **Sin «Creando…» eterno**: la llamada, la lectura del error, la auditoría y la recarga tienen timeout local (`CONFIG.TIMEOUT_CREAR_JUGADOR = 45000` ms; lectura/auditoría 5000 ms). `finally` rehabilita el botón y restaura «Crear jugador».
- **Sin doble cuenta**: un guard `enCurso` y un mapa por correo bloquean un segundo clic. Si el servidor confirma, la dirección se libera; si la respuesta se pierde o hay timeout/429/red, queda como «resultado desconocido» y solo se permite otro correo.
- **Errores claros**: se distinguen teléfono duplicado, correo ya registrado, nombre duplicado, límite de solicitudes, permisos y error genérico. Ya no se etiqueta un teléfono duplicado como correo duplicado.
- **Parte servidor resuelta en 1.4.0**: ver sección 19.

## 19. Idempotencia y recuperación del alta 1.4.0

- **Servidor**: `admin-crear-jugador` busca usuario Auth y jugador antes de crear; devuelve `creado`, `ya_existente`, `error_validacion`, `error_parcial`, `rollback_fallido` o `error_servidor`. Nunca crea un segundo Auth ni una segunda fila para el mismo jugador.
- **Compensación**: borra solo lo creado por la invocación (grupo → jugador → Auth) y verifica cada borrado. Si falla, devuelve `rollback_fallido` con el estado real; nunca dice que se revirtió sin comprobarlo.
- **Consulta segura**: `action: 'estado'` es de solo lectura. Tras un timeout o pérdida de respuesta, el frontend la usa para saber si puede reintentar (`no_existe`), si ya está creado (`ya_existente`) o si requiere revisión (`error_parcial`).
- **Frontend**: `ya_existente` no se muestra como creado; la auditoría solo se registra en `creado`; se mantienen doble-clic, timeouts, `finally` y bloqueo del correo ante resultado incierto.
- **Sin migración**: se usan los únicos ya existentes en producción. No se cambiaron RLS, GRANT, RPC, Auth ni datos reales.
- **Pendiente de verificación manual**: ejecutar un alta real con jugadores y comprobar la lista y la auditoría. Las pruebas automatizadas son aisladas con mocks.
