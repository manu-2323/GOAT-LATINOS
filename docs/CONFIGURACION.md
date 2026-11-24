# GOATS LATINOS · League Manager — Configuración

Versión actual: **1.0.5**. Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`.

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

Todo el SQL está en `supabase/` y es idempotente. Ejecutalo en Supabase → SQL Editor en este orden:

1. `configuracion-completa.sql` — torneo, grupos A/B, columna `numero`, `email`, RLS base y bucket `capturas-partidos`.
2. `migration-numero-jugador.sql` — compatibilidad con el número del jugador.
3. `migration-admin-email.sql` — correo vinculado al perfil (si no se usó la configuración completa).
4. `migration-mejoras-1-9.sql` — tabla `paises` (16 países), `super_admin`, `avatar_url`, helper
   `gl_es_super_admin()`, bucket `avatares`, `gl_correo_existe()` y protección de campos sensibles.
5. `migration-correo-existe.sql` — reafirma la RPC `gl_correo_existe(text)` usada por el registro.

Estado verificado en remoto: 16 países activos, 1 torneo activo, 2 grupos, columnas `numero`,
`email`, `super_admin`, `avatar_url`, bucket `avatares` público y RPC `gl_correo_existe` disponible.

Consulta rápida de verificación:

```sql
select (select count(*) from paises where activo) as paises,
       (select count(*) from torneos where estado='activo') as torneos,
       (select count(*) from grupos) as grupos;
select proname from pg_proc where proname like 'gl_%' order by proname;
```

La lectura de tablas del torneo es pública; la escritura está restringida a administradores.
El trigger `gl_proteger_rol` impide que un jugador se autoasigne `rol`, `activo`, `suspendido`,
`torneo_id`, `super_admin` o `email`. `service_role` y el `super_admin` pueden actualizar esos campos.

## 3. Seguridad de credenciales

| Credencial | Dónde va |
|---|---|
| URL + anon key | `js/core/config.js` (público, ya configurado) |
| **SERVICE_ROLE_KEY** | Solo secret de Supabase Edge Functions |
| **GEMINI_API_KEY** | Solo secret de la función `analizar-captura` |
| **ADMIN_PASSWORD** | Solo secret de las funciones de administración |

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
- `admin-bootstrap` valida la clave contra `ADMIN_PASSWORD`, crea/actualiza la cuenta y promueve la
  fila en `jugadores` usando Service Role. El navegador nunca compara la clave. Tiene límite de
  5 intentos por minuto.
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

Hay **6 funciones desplegadas**. Desde la CLI (con `--yes` para entornos no interactivos):

```bash
supabase functions deploy analizar-captura --yes
supabase functions deploy admin-crear-jugador --yes
supabase functions deploy admin-bootstrap --yes
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
6. Jornadas → Abrir jornada → Mensajes → revisá la vista previa y copiar/enviar por WhatsApp.
7. Resultados → cargar marcadores (manual o con captura + Gemini). La tabla se recalcula sola.
8. Jornadas → Cerrar: resolvé los pendientes `1-0`, se recalcula todo y se genera el mensaje de cierre.
9. Eliminatorias → generar rondas a medida que se definen los ganadores.
10. Estadísticas globales → consultá tops, rachas, head-to-head y exportá PNG.

## 6. Mejoras 1.0.5

- **Países dinámicos**: tabla `paises` cargada al arrancar; banderas reales vía `flagcdn.com` en tabla,
  fixture, perfil y administración. La bandera emoji queda solo para textos de WhatsApp.
- **Horarios por país**: base UTC-6 Nicaragua/Costa Rica `11:00 AM – 9:00 PM`, con ajuste por zona
  según el país (`PAISES` / `ZONAS_HORARIAS`). Se muestran en fixture, perfil y administración.
- **Perfil completo**: foto JPG/PNG de hasta 2 MB en bucket `avatares`, nombre, país, teléfono y
  horario con vista previa. Botón **Eliminar mi cuenta** con confirmación estricta.
- **Registro validado**: checkmark de correo y nombre en vivo (debounce 500 ms), validación de
  contraseña y confirmación, mensaje específico para Gmail.
- **Mensajes**: vista previa de WhatsApp, botón de envío y horarios agrupados por país.
- **Estadísticas globales**: top 5 de goles, vallas, victorias, diferencia y posesión; rachas;
  head-to-head; gráfico Chart.js local y exportación PNG.
- **Administración**: distinción de `Administrador principal`, pestaña restringida a `super_admin`,
  consulta de clave y columnas de horario/contacto/rol en la tabla de jugadores.
- **IA**: Gemini Flash-Lite (`gemini-3.5-flash-lite`, modelo 2.0 retirado por Google) reemplaza a la integración anterior; toast con icono animado
  `Analizando captura con Gemini AI...`.

## 7. Decisiones de diseño

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

## 8. Solución de problemas

| Síntoma | Acción |
|---|---|
| "Falta configurar SERVICE_ROLE_KEY" | Verificá el secret en Supabase → Edge Functions → Secrets con el nombre exacto `SERVICE_ROLE_KEY`. |
| "Falta configurar GEMINI_API_KEY" | Cargá la key de Google AI Studio y redeployá `analizar-captura`. |
| "Solo el administrador principal puede..." | Ingresá con la cuenta marcada como `super_admin` o corregí el flag con Service Role. |
| El registro dice que el correo existe | `gl_correo_existe` devuelve `true`; iniciá sesión o usá otro correo. |
| La tabla no muestra banderas | Revisá que `paises` tenga filas activas y que `flagcdn.com` sea accesible. |
| El gráfico no aparece | Confirmá que `librerias/chart.umd.js` esté presente y que `index.html` lo cargue antes de los módulos. |
