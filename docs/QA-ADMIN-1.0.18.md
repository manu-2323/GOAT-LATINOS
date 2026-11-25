# QA — Acceso de administrador 1.0.18

## Objetivo

Dos cuentas administradoras operativas con una clave compartida, validación de correo autorizado en
Supabase, acceso completo a los módulos y conservación de las estadísticas personales de quienes
también juegan. La clave **no se transcribe en este documento**.

## Cambios aplicados en Supabase

- Migración `supabase/migration-admin-1.0.18.sql` aplicada al proyecto de producción.
- `public.admin_credencial`: único registro con el hash bcrypt de la clave compartida (costo 12).
  No existe la clave en claro en tablas, funciones, frontend, repo ni documentación.
- `public.admin_acceso`: lista blanca con exactamente dos correos. RLS activo y `revoke all` a
  `anon`, `authenticated` y `public`; solo se manipula desde la RPC `SECURITY DEFINER`.
- `gl_validar_acceso_admin(text, text)` creada con `SECURITY DEFINER`, `search_path=''` y ejecución
  permitida a `anon`/`authenticated`/`service_role`. Valida correo autorizado, fila activa con
  `rol='admin'`, hash con `extensions.crypt` y bloqueo de 15 minutos tras 5 intentos fallidos.
- `ADMIN_PASSWORD` rotado en Secrets al mismo valor de la clave compartida.
- `admin-bootstrap` desactivado y redeplegado: devuelve 403 y ya no contiene ninguna clave fija.
  El flag `bootstrap_completado` no se modificó.

## Estado final de roles y cuentas

| Jugador | Correo | Rol | Superadmin | Usuario Auth | Datos deportivos |
|---|---|---|---|---|---|
| Manuel | `manuelperezcanales2021@gmail.com` | `admin` | `true` | vinculado, confirmado, bcrypt | conservados |
| †ㅤGØA† | `fcmobilegt00@gmail.com` | `admin` | `false` | creado, vinculado, confirmado, bcrypt | conservados |
| ツ ƈнєяy | `chery@goatslatinos.com` | `jugador` | `false` | sin cambios | conservados |

No se borró ni se modificó ningún partido, gol, clasificación, sanción, grupo ni historial.

## Validaciones

### Base de datos y RPC

- Consulta de roles: solo Manuel y GØA tienen `rol='admin'`; Chery quedó como `jugador`.
- Consulta de `admin_acceso`: dos filas activas, sin intentos fallidos ni bloqueo.
- Consulta de `auth.users`: ambos correos confirmados, identidad email presente y
  `encrypted_password` con prefijo bcrypt.
- Permisos de la RPC: `prosecdef=true`, `proconfig=["search_path=\"\""]`, `anon_puede_ejecutar=true`.
- Llamadas HTTP con el rol `anon`:
  - correo de Manuel + clave compartida → `{"ok":true}`;
  - correo de GØA + clave compartida → `{"ok":true}`;
  - correo de Chery + clave compartida → rechazado con «Ese correo no está habilitado…»;
  - correo de Manuel + clave incorrecta → rechazado con «Clave de administrador incorrecta.».
- Contador de intentos fallidos reiniciado a cero después de la prueba.

### Frontend y navegador

- Sitio local servido desde `proyecto-GOAT-LATINO` con `CONFIG.VERSION = 1.0.18`.
- Carga inicial sin errores de consola; menú con «Calendario» y «Fixture» en 1.0.18.
- Texto del formulario cambiado a «Ingresá el correo autorizado y la clave de administrador.
  El servidor valida ambos.»; pie: «Solo dos correos están autorizados…».
- Login admin de Manuel: sesión iniciada, `rol='admin'`, `super_admin=true`, menú de
  «Centro de control», «Administración», «Mi Perfil» y estadísticas personales visibles
  (3 partidos, 2 goles a favor, 0.7 goles por partido real).
- Login admin de GØA: sesión iniciada, `rol='admin'`, `super_admin=false`, menú de administración
  visible; la pestaña/acción de superadmin sigue restringida por `GL.esSuperAdmin()`.
- Intento con correo de Chery y clave correcta: mensaje «Ese correo no está habilitado como
  administrador.» y ninguna sesión iniciada.
- Sin errores de consola durante ninguno de los tres flujos.

### Seguridad

- Búsqueda en el repo de los valores de clave anteriores y de la nueva: **sin coincidencias**.
- No hay JWT, Service Role Key, Gemini API key ni clave de administrador en `js/`, `docs/` ni
  migraciones.
- No se usó `node` porque no está instalado; la validación de sintaxis se hizo cargando el sitio en
  Chromium, sin errores de parseo ni excepciones.

## Resultado

Apto para publicación 1.0.18. El acceso admin quedó reducido a dos correos autorizados, con clave
compartida validada como hash en Supabase, y ambos administradores conservan su perfil deportivo.
