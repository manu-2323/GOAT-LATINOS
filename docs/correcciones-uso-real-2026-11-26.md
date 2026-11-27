# Correcciones de uso real — GOAT-LATINOS

**Fecha:** 2026-11-26  
**Rama:** `main` (sin ramas auxiliares)  
**Alcance:** selector `Ciudad o zona horaria`, cierre del modal `Agregar jugador al torneo` e investigación del correo electrónico.  
**Decisión:** **A — correcciones verificadas y publicadas en `main`.**

No se inició una nueva fase. No se modificaron tablas, SQL, RLS, GRANT, firmas RPC, autenticación, datos reales ni configuración de Supabase. No se enviaron correos de prueba.

---

## 1. Causa exacta del selector limitado a Managua

El formulario **`Administración → Jugadores → Agregar jugador`** muestra inicialmente la lista completa con `GL.opcionesZonaHoraria('', '')` (`js/modulos/admin.js:3017-3020`). Sin embargo, al abrir el modal, `onAbrir` ejecutaba:

```js
GL.actualizarZona(zona, pais.value, nota);
```

Como `#ag-pais` (País del jugador) viene por defecto en `NI`, esa llamada filtraba el desplegable a Nicaragua. `GL.opcionesZonaHoraria()` en `js/core/gl.js:368-370` hacía `ZONAS_HORARIAS_DISPONIBLES.filter(x => x.pais === codigo)`, y Nicaragua solo tiene una entrada: `Managua — Nicaragua` (`js/core/config.js:73`).

El campo **`País del teléfono`** (`#ag-tel-pais`) es independiente: su listener (`admin.js:3071-3078`) solo revalida el número y actualiza el prefijo `+505`/`+506`. Nunca llamaba a `actualizarZona`. Por eso cambiar a Costa Rica no cambiaba la zona: el filtro seguía leyendo `#ag-pais=NI`.

**No era una lista perdida ni una regresión reciente.** `git log -S"ZONAS_HORARIAS_DISPONIBLES"` muestra una sola introducción (`0b89f95`, fase 1.0.12), que agregó juntos el catálogo de 26 zonas y el filtro por país. `docs/QA-HORARIOS-1.0.12.md` documentaba la preselección por país; el defecto fue aplicar esa preselección al abrir, ocultando visualmente los demás países.

### Solución aplicada

`js/core/gl.js` — `opcionesZonaHoraria()` ahora **ordena** las zonas del país primero pero **conserva todas**:

```js
const lista = codigo
  ? ZONAS_HORARIAS_DISPONIBLES.filter(x => x.pais === codigo)
      .concat(ZONAS_HORARIAS_DISPONIBLES.filter(x => x.pais !== codigo))
  : ZONAS_HORARIAS_DISPONIBLES;
```

Efecto:

- Nicaragua sigue preseleccionada (`America/Managua`) por `zonaPorDefectoFormulario('NI')`.
- Costa Rica y el resto de los 16 países admitidos quedan visibles y se pueden elegir.
- Al cambiar `País`, las zonas de ese país pasan al principio y se preselecciona su zona única cuando aplica; los demás países no desaparecen.
- Una zona IANA guardada que no coincida con `País` se conserva como opción seleccionada, tanto en alta como en edición.
- `País del teléfono` sigue gobernando solo `pais_telefono`, `telefono_e164` y el prefijo. `GL.tel.campos()` no escribe `zona_horaria`.

La Edge Function `admin-crear-jugador` ya validaba la zona con `Intl.DateTimeFormat` (`index.ts:148-157`) y guardaba `zona_horaria` en `jugadores` (`index.ts:177`). No hicieron falta cambios de BD ni de firma RPC.

---

## 2. Causa del cierre accidental del modal y solución

`GL.abrirModal()` en `js/core/gl.js` tenía, desde la primera versión del helper, un listener global:

```js
fondo.addEventListener('click', e => { if (e.target === fondo) cerrarReal(); });
```

El mismo patrón estaba en `GL.dialogo()`. En móvil el fondo cubre toda la pantalla, así que un toque fuera de la hoja genera un `click` y cierra el formulario. No era propio de `admin.js`: lo heredaban todos los modales.

### Solución aplicada

- `GL.abrirModal()` y `GL.dialogo()` aceptan `cerrarFondo: false`. El default sigue siendo `true` para no alterar ventanas informativas ni confirmaciones donde tocar fuera equivale a `Cancelar`.
- `GL.abrirModal()` acepta `confirmarDescarto: true`: compara los valores de `input`/`select`/`textarea` capturados al abrir y, si hay cambios, muestra `¿Descartar los cambios?` con **`Seguir editando`** (Cancelar) o **`Descartar cambios`** (Confirmar). Con el formulario vacío cierra directamente, sin preguntar.
- X, Cancelar y Escape pasan por esa comprobación. El cierre programático (`fondo.cerrar`, usado tras guardar con éxito) sigue siendo directo para no pedir confirmación después de crear el jugador.
- El modal se pausa mientras está abierta la confirmación, para que Escape/Tab no actúen sobre los dos modales a la vez.

`js/modulos/admin.js` activa `cerrarFondo: false` y `confirmarDescarto: true` en **`Agregar jugador al torneo`** y en **`Editar jugador`**. No se cambió el botón **`Crear jugador`**, **`Guardar cambios`**, ni el diseño visual. Otros modales importantes (`Programar jornada`, `Editar resultado`, perfiles, `Crear Torneo`, etc.) conservan su comportamiento anterior de forma deliberada: el cambio quedó disponible en el helper, pero no se aplicó sin una revisión específica de cada flujo.

---

## 3. Flujo real del correo electrónico

| Pregunta | Respuesta con evidencia |
|---|---|
| ¿El correo se guarda en BD? | **Sí.** El formulario valida solo sintaxis (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, `admin.js:3135`) y envía `email` junto con `password`, `pais` y `zona_horaria` a `sb.functions.invoke('admin-crear-jugador', ...)` (`admin.js:3159-3170`). La Edge Function guarda `email` normalizado en `jugadores` (`index.ts:172-183`). |
| ¿Se crea cuenta de Supabase Auth? | **Sí, en el alta administrativa.** `admin.auth.admin.createUser({ email, password, email_confirm: true, ... })` (`index.ts:159-168`). |
| ¿Supabase Auth envía confirmación? | **No en el alta administrativa**: la cuenta se crea ya confirmada (`email_confirm: true`). **Sí en el registro público**: `auth.signUp()` (`js/core/supabase.js:383-386`) y `mailer_autoconfirm: false` (verificado en vivo con `GET /auth/v1/settings`) hacen que Supabase Auth gestione la confirmación. La app solo informa «Revisá tu correo…» (`supabase.js:44-60`); `correoEnviado` se infiere de la ausencia de sesión, no de una confirmación de entrega. |
| ¿Proveedor SMTP? | **No hay configuración SMTP en el repo**: no existen `supabase/config.toml`, `.env*`, secretos ni dependencias de correo. El endpoint público `/auth/v1/settings` no expone SMTP, así que el proveedor remoto no se pudo verificar sin el panel. No se modificó nada. |
| ¿Función que envíe correos desde GOAT-LATINOS? | **No.** No hay `inviteUserByEmail`, `resend`, `sendEmail`, plantillas propias ni Edge Function de correo. El único `fetch` externo de Edge Functions es Gemini en `analizar-captura`. |
| ¿Notificaciones al admin o al jugador? | **Solo internas**, filas en `notificaciones` vía `gl_crear_notificacion` (`js/modulos/notificaciones.js:340-347`) y Realtime. No se envía correo al administrador ni al jugador al crear uno. |
| ¿Correo mal escrito o inaccesible? | En alta admin, si pasa el regex pero es incorrecto, la cuenta queda creada y confirmada con ese dato; no hay verificación de titularidad, dominio ni entrega. Si Supabase rechaza formato/duplicado/rate limit, el error se muestra junto a **`Correo electrónico`** (`admin.js:3186-3187`). En registro público, un correo inaccesible deja la cuenta sin confirmar y la app no tiene reenvío implementado (`docs/fase-3.18-auditoria-backlog.md:262-268`). |

**Diferenciación importante:** guardar una dirección no confirma una cuenta; confirmar una cuenta no implica que GOAT-LATINOS envíe notificaciones; y las notificaciones actuales son de base de datos, no correos.

Para implementar envío real haría falta decidir el canal (SMTP/plantillas de Supabase Auth o Edge Function con proveedor transaccional), configurar secrets y plantillas, y agregar reenvío/verificación de titularidad. **No se implementó.**

---

## 4. Pruebas ejecutadas

| Verificación | Resultado |
|---|---|
| `vitest run` | **19 archivos, 233 pruebas, `EXIT=0`** (antes: 18/220). |
| Nuevo `tests/correcciones-uso-real.test.js` | 13 pruebas: zonas de Nicaragua/Costa Rica/México/Brasil, 26 ubicaciones visibles, preselección, persistencia de IANA guardada, independencia telefónica, fondo protegido, default conservado, X/Cancelar/Escape, confirmación con datos, sin confirmación vacía y cache-busting. |
| Versiones de regex históricas | Ajustadas para admitir `1.3.7` sin eliminar las anteriores. |
| `git -c core.whitespace=cr-at-eol diff --check` | Sin errores. |
| Supabase | Solo lectura del endpoint público de `/auth/v1/settings`; sin escrituras, sin correos, sin cambios de configuración. |

La validación es de código y DOM simulado (jsdom). No se probó en un dispositivo físico; el comportamiento táctil se apoya en eventos `click` estándar y no se modificó CSS ni la estructura responsive.

---

## 5. Archivos modificados

- `js/core/gl.js`: catálogo completo de zonas con orden por país; opciones `cerrarFondo` y `confirmarDescarto`; pausa de teclado durante la confirmación.
- `js/modulos/admin.js`: protecciones en alta y edición de jugador.
- `js/core/config.js`, `index.html`: `CONFIG.VERSION=1.3.7` y cache-busting renovado (`config.js`, `gl.js`, `menu.js`, `auth.js`). CSS se mantiene en `3.23.0` porque no cambió.
- `tests/correcciones-uso-real.test.js` (nuevo), `tests/fase-3.23.test.js`, `tests/fase-3.16.test.js`, `tests/fase-3.17.test.js`, `tests/fase-3.19.test.js`.
- Este informe.

---

## 6. Publicación

- **Commit de implementación:** `fd7bb5d0871f2679d050cc1cea8a19362c522ff1` — `fix(uso-real): corregir selector de ubicacion y cierre accidental de modales`. Push directo a `main`, sin ramas auxiliares ni reescritura de historial.
- **Cierre de verificación:** este informe se actualiza en un segundo commit documental, sin `amend` ni `rebase`.
- **GitHub Actions:** run `45913883810`, `pages build and deployment`, #54, rama `main`, `head_sha=fd7bb5d0871f2679d050cc1cea8a19362c522ff1`; `status=completed`, `conclusion=success`, actualizado `2026-11-26T23:57:46Z`. Detalle: https://github.com/manu-2323/GOAT-LATINOS/actions/runs/45913883810
- **GitHub Pages:** https://manu-2323.github.io/GOAT-LATINOS/ sirve `config.js`, `gl.js`, `menu.js` y `auth.js` con `?v=1.3.7`, y `css/estilos.css?v=3.23.0` (CSS sin cambios). Informe público: https://manu-2323.github.io/GOAT-LATINOS/docs/correcciones-uso-real-2026-11-26.html (GitHub Pages sirve el `.md` como `.html`).

---

## 7. Limitaciones pendientes

1. No se verificó el proveedor SMTP remoto ni se envió correo real.
2. La confirmación pública depende de Supabase Auth; GOAT-LATINOS solo muestra el mensaje, sin reenvío ni estado de entrega.
3. No hay prueba en dispositivo móvil físico; la cobertura es jsdom y revisión de eventos/CSS.
4. Otros formularios modales mantienen su comportamiento previo; las nuevas opciones están disponibles en el helper para aplicarlas caso por caso.
5. No se afirma ausencia de errores desconocidos fuera de lo revisado.

---

## 8. Segunda corrección: retorno del correo de confirmación (1.3.8)

### Hallazgo

- Supabase Auth envió correctamente el correo `Confirm your email address` (`mailer_autoconfirm: false`).
- Los logs de Auth muestran el `signup` con `referer: https://manu-2323.github.io/` y, después, un `GET /verify` con `status=303` y `user_signedup`. Es decir: **el enlace sí confirmó la cuenta**.
- Los clics posteriores devuelven `403 Email link is invalid or has expired` (`One-time token not found`): el token de un solo uso ya había sido consumido.
- El retorno del primer enlace apuntaba a la raíz `https://manu-2323.github.io/`, que responde **404 / Site not found**. La ruta publicada es `https://manu-2323.github.io/GOAT-LATINOS/` (HTTP 200).
- `supabase config pull` (solo lectura, sin escrituras) confirma que la configuración remota actual ya tiene:
  - `auth.site_url = "https://manu-2323.github.io/GOAT-LATINOS/"`
  - `auth.additional_redirect_urls = ["https://manu-2323.github.io/GOAT-LATINOS/"]`
- No hizo falta cambiar Site URL, Redirect URLs, SMTP, plantillas ni credenciales.

### Cambio de código

- `js/core/config.js`: nueva clave `CONFIG.SITE_URL` con la URL pública exacta; `VERSION=1.3.8`.
- `js/core/supabase.js`: `signUp()` y `auth.resend()` envían `emailRedirectTo: CONFIG.SITE_URL`. Así el correo vuelve a la app aunque el registro se haya iniciado desde otra URL.
- `js/core/supabase.js`: `consumirCallback()` captura los parámetros del fragmento antes de que `detectSessionInUrl` los limpie y traduce `otp_expired` / `access_denied` a mensajes claros en español.
- `js/app.js`: el aviso se lee antes de `Auth.iniciar()` (para que ya esté visible si se pinta el acceso) y `limpiarCallbackUrl()` se ejecuta recién después de procesar la sesión, sin quitarle el token al cliente.
- `js/app.js`: muestra “Correo confirmado” en un retorno válido y deja un aviso visible en el acceso cuando el enlace venció o no es válido; ya no hay pantalla vacía ni error genérico.
- `js/ui/auth.js`: botón **¿No te llegó el correo de confirmación?** en el acceso, que reenvía el correo con el mismo `emailRedirectTo` sin crear otra cuenta.
- `index.html`: cache-busting `1.3.8` para `config.js`, `gl.js`, `supabase.js`, `menu.js`, `auth.js` y `app.js`. CSS permanece en `3.23.0`.

### Verificación

| Verificación | Resultado |
|---|---|
| `vitest run` | **20 archivos, 244 pruebas, `EXIT=0`**. |
| `tests/confirmacion-correo.test.js` (nuevo) | 11 pruebas: URL pública, `emailRedirectTo` en `signUp`, reenvío con el mismo retorno, validación de correo, mensajes de vencido/inválido/confirmado, ausencia de aviso en carga normal, orden de arranque y limpieza del fragmento. |
| `git -c core.whitespace=cr-at-eol diff --check` | Sin errores. |
| HTTP en GitHub Pages | `/` → 404; `/GOAT-LATINOS/` y `/GOAT-LATINOS/index.html` → 200. |
| Logs de Auth | Confirmación real del token confirmada; rechazo posterior por token ya usado, no por configuración de Supabase. |

### Limitación

No se envió un correo real: el usuario prohibió registrar cuentas de prueba con correos reales. La comprobación es de código, mocks de Supabase y logs ya generados. El enlace viejo no se puede reparar: hay que pedir uno nuevo con la misma dirección de correo.

---

## 9. Consulta: qué hace «Expulsar»

`Expulsar` **no elimina** la fila de `jugadores` ni la cuenta de Supabase. Marca al jugador como `activo=false`, `rol='expulsado'` y `suspendido=true`, inserta la sanción correspondiente y resuelve sus partidos pendientes como `1-0` en contra (`js/modulos/admin.js:2713-2720`, `:2920-2926`). La baja real es otra acción distinta: **Eliminar jugador**, que llama a la Edge Function `eliminar-cuenta` (`js/modulos/admin.js:1690-1710`).

---

## 10. Tercera corrección: «Demasiados intentos» al registrar (1.3.9)

### Causa exacta

- Los logs de Auth (`supabase logs --remote --service auth --since 24h`, solo lectura) muestran seis respuestas reales `429` en `POST /auth/v1/signup`:
  - `00:48:58Z`, `00:49:04Z`, `00:49:21Z`, `00:50:51Z` para `manuelperezcanales999@gmail.com`.
  - `00:51:59Z`, `00:53:03Z` para `claudecode1exponencial@gmail.com`.
  - Todas con `error: "429: email rate limit exceeded"` y `error_code: "over_email_send_rate_limit"`, desde la misma IP y con referer `https://manu-2323.github.io/GOAT-LATINOS/`.
- Por lo tanto **no era un error genérico inventado por GOAT-LATINOS**: Supabase devolvió un límite real de envío de correo. La aplicación lo pasaba por `Auth.traducir()` → «Demasiados intentos. Esperá un momento y volvé a probar.», que era demasiado genérico y recomendaba reintentar.
- Antes de esos 429 hubo un `/signup` con `status=200` y acción `user_repeated_signup` a las `00:42:42Z` y tres `/resend` con `status=200` (`00:40:18Z`, `00:41:18Z`, `00:45:04Z`). Es decir, hubo intentos repetidos por la misma dirección; no hay evidencia de un solo clic generando varios `signUp`.
- No hay listeners duplicados: `app.js` registra `hashchange` y `gl:auth` una sola vez; `PantallaAuth.mostrar()` sustituye el overlay antes de enlazar eventos.
- No hay reintentos automáticos en el cliente: ni el bundle de Supabase ni `Auth.registrar()` reenvían un `signUp` fallido.

### Solicitudes por clic

| Acción | Solicitudes |
|---|---|
| Escribir el nombre | `POST /rest/v1/rpc/gl_nombre_disponible` con debounce de 500 ms (varias veces mientras se escribe). |
| Un clic en `Registrar` | 1 RPC de disponibilidad adicional + **1 `POST /auth/v1/signup`**. No hay segunda llamada a `signUp`. |
| Reenviar confirmación | 1 `POST /auth/v1/resend`, con el botón deshabilitado durante la espera. |

### Corrección de código

- `js/ui/auth.js`: bloquea el formulario durante el envío, mantiene una bandera `enviando` y recuerda el correo ya enviado; pulsar `Registrar` otra vez con la misma dirección no crea otra cuenta. Cambiar el correo permite un nuevo intento.
- `js/ui/auth.js`: si la respuesta se pierde, hay un timeout o llega un error de red/429, la dirección queda marcada como «resultado desconocido»: un segundo clic con el mismo correo no vuelve a registrar. Solo una respuesta explícita de «ya está registrado» libera esa dirección.
- `js/core/config.js`: `TIMEOUT_REGISTRO = 30000` y `TIMEOUT_CREAR_JUGADOR = 45000` son tiempos máximos **locales de la interfaz**, no límites ni tiempos de Supabase. Al vencer se avisa y se bloquea el reintento ciego.
- `js/core/supabase.js`: bandera `_registrando` y `_reenviando` como barrera adicional contra llamadas concurrentes.
- `js/core/supabase.js`: el error de Supabase se traduce con su código (`over_email_send_rate_limit`) y se distingue de un 429 genérico, de un fallo de conexión, de un correo inválido, de una contraseña corta y de una cuenta existente. Ya no aparece «Demasiados intentos…» ni se recomienda pulsar repetidamente.
- `index.html`: cache-busting `1.3.9`. No se cambiaron reglas RLS, RPC, datos, contraseñas ni cuentas.

### Verificación

| Verificación | Resultado |
|---|---|
| `vitest run` | **22 archivos, 271 pruebas, `EXIT=0`**. |
| `tests/registro-rate-limit.test.js` (nuevo) | 15 pruebas: un clic → una llamada, dos envíos rápidos sin duplicado, bloqueo del botón, barrera del núcleo, liberación tras error (incluido 429), resultado desconocido y timeout local, mensajes de límite de correo/429/red/correo/cuenta, reenvío sin duplicados, retorno de Gmail y login sin cambios. |
| `git -c core.whitespace=cr-at-eol diff --check` | Sin errores. |
| Logs remotos | 429 reales confirmados; no se modificó ninguna configuración de Supabase. |

### Límites y espera

- `supabase config pull` (solo lectura) confirma `auth.email.max_frequency = "1m0s"` para la frecuencia por usuario. El código observado fue `over_email_send_rate_limit`, que coincide con el límite de envío de correo del proyecto documentado por Supabase, no con ese temporizador por usuario; por eso no se atribuyó el 429 a `max_frequency`.
- Según la documentación de Supabase, el proveedor de correo integrado permite **2 correos por hora por proyecto**. `config.toml` no expone `rate_limit_email_sent` y no se consultó el Management API, así que el valor exacto configurado en producción no está verificado; no se cambió.
- Para aumentar o configurar ese límite haría falta **SMTP propio o Send Email hook** y autorización explícita. Consecuencias: credenciales/secrets nuevas, posible costo y entrega dependiente del proveedor. **No se aplicó.**
- Los logs consultados no muestran `Retry-After` ni hora de restablecimiento; el texto del error tampoco la indica. No se debe inventar un tiempo: el usuario debe esperar a que se restablezca el límite y no repetir el envío. El valor de `max_frequency` sí es observable localmente (1 minuto), pero no se usó para explicar este incidente.

---

## 11. Cuarta corrección: alta administrativa sin «Creando…» eterno (1.3.9)

### Diagnóstico

- Al pulsar **Crear** se llama a `sb.functions.invoke('admin-crear-jugador', { body })` (`js/modulos/admin.js`). No se usa `auth.admin.createUser()` desde el navegador: la Edge Function `supabase/functions/admin-crear-jugador/index.ts` crea el usuario con Service Role (`admin.auth.admin.createUser`, `email_confirm: true`) y después inserta en `jugadores` y `grupo_jugadores`.
- Un clic produce 1 petición de creación a la Edge Function. Dentro de ella hay 1 `getUser` del administrador, 1 consulta de rol, 1 `createUser` y 2 inserciones. Después el navegador registra la auditoría (`getUser` + RPC), recarga siete contextos, partidos y el perfil. No hay listeners duplicados ni reintentos automáticos.
- La causa del «Creando…» era de interfaz: el botón se deshabilitaba y se rotulaba antes del primer `await`, y solo se restauraba en `catch`. No había timeout, `AbortController` ni `finally`; si `invoke`, la lectura del cuerpo del error, la auditoría o la recarga no resolvían, el botón quedaba bloqueado para siempre. El alta rápida de Nueva Temporada tenía el mismo defecto.
- Los logs remotos de Edge Functions de las últimas 24 h solo muestran `booted`/`shutdown`: no hay una invocación fallida capturada. El bloqueo se explica por el código, no por un error remoto confirmado.

### Corrección de cliente

- `ejecutarCreacion()` centraliza la llamada con un guard `enCurso` y un mapa local por correo: dos clics rápidos, o dos entradas de UI distintas, no duplican la Edge Function.
- `conTimeout()` acota la llamada (45 s), la lectura del error (5 s), la auditoría (5 s) y la recarga (45 s). Son tiempos máximos **locales de la interfaz**, no tiempos prometidos por Supabase.
- `finally` rehabilita el botón si sigue en el DOM y restaura el texto «Crear jugador».
- Si el servidor confirma, la dirección se libera antes de la auditoría y la recarga. Si la respuesta se pierde o hay timeout/429/red, el correo queda marcado como «resultado desconocido»: otro clic no crea otra cuenta. Solo un «ya registrado» explícito permite reutilizar la dirección.
- `resultadoInvoke()` exige `ok !== false` y ausencia de `error`; antes cualquier respuesta 2xx se trataba como éxito.
- `clasificarErrorCreacion()` distingue teléfono duplicado, correo registrado, nombre duplicado, límite de solicitudes, permisos y error genérico. Corrige el fallo previo que etiquetaba como «correo duplicado» un conflicto `jugadores_e164_canonicalizado_uniq`.
- La auditoría guarda el `user_id` devuelto por la función; antes se guardaba `null` porque se leía una clave inexistente (`jugador_id`).

### Riesgo corregido después en 1.4.0

- La Edge Function creaba el usuario Auth antes que las filas y no era atómica. Si fallaba `grupo_jugadores`, su `catch` eliminaba el usuario Auth pero no la fila `jugadores` ya insertada; si fallaba `deleteUser`, podía quedar un usuario Auth sin jugador. Esta corrección de cliente no podía resolverlo; se cerró en el servidor con la versión 1.4.0 (sección 12).

### Verificación

| Verificación | Resultado |
|---|---|
| `vitest run` | **23 archivos, 296 pruebas, `EXIT=0`** (conteo final en §12). |
| `tests/registro-rate-limit.test.js` | 15 pruebas de registro público con mocks: un clic, doble clic, timeout, límite, red, cuenta existente, reenvío y regresiones de Gmail/login. |
| `tests/creacion-admin-segura.test.js` | 18 pruebas AISLADAS del frontend del alta: estados del servidor, doble clic, timeouts, recuperación y botón. No crea cuentas reales. |
| `git -c core.whitespace=cr-at-eol diff --check` | Sin errores. |
| Logs remotos | 429 reales confirmados en registro público; sin invocaciones fallidas de la Edge Function en las últimas 24 h. No se modificó configuración de Supabase. |

---

## 12. Corrección integral: idempotencia en servidor y recuperación (1.4.0)

### Causa definitiva

- **Registro público**: los 429 son reales (`over_email_send_rate_limit`, proveedor de correo integrado con límite de 2 correos/hora por proyecto). La app ya no inventa tiempos ni recomienda reintentar. La causa del bloqueo era de interfaz: sin `finally` ni timeout, y con un mensaje que sugería volver a pulsar.
- **Alta administrativa**: el bloqueo de «Creando…» era de interfaz (sin `finally`, sin timeout, sin límite para auditoría/recarga). Los duplicados y las cuentas incompletas eran de servidor: `createUser` se ejecutaba antes que las inserciones y la compensación borraba el usuario Auth pero no la fila `jugadores`; una respuesta perdida permitía repetir sin saber si el alta ya había terminado.

### Edge Function `admin-crear-jugador`

- Mantiene la autorización administrativa: token del llamador, `auth.getUser()` con la clave anon y `esAdmin(perfil)` antes de cualquier operación. La Service Role sigue solo en el servidor.
- Antes de crear nada busca jugador por correo, nombre y teléfono, y usuario Auth por correo. Si el correo pertenece a otro jugador, devuelve `error_validacion` sin modificar nada.
- Si el usuario Auth existe y tiene jugador vinculado, devuelve `ya_existente`. Si no tiene jugador pero conserva el `user_metadata` que esta función escribió, completa la fila faltante; si el metadata es ajeno, no lo adopta ni lo modifica.
- Si no hay usuario ni jugador, crea la cuenta. Un `User already registered` de una solicitud simultánea se relee (máximo dos veces) y se resuelve como `ya_existente`, nunca borrando la cuenta ajena.
- La PK de `grupo_jugadores` y los únicos de `nombre_usuario`, `user_id` y E.164 canónico cierran la carrera entre dos solicitudes simultáneas. La asignación al grupo se inserta solo si no existía.
- **Compensación**: se registran exactamente las filas/usuario creados por la invocación. Ante un fallo se borra en orden grupo → jugador → Auth y se **verifica** cada borrado. Si todo se verificó, se devuelve `error_servidor` con `reintentable: true`. Si algún borrado falla, se devuelve `rollback_fallido` con el estado real (`auth`, `jugador`, `grupo`) y `requiere_revision: true`. Nunca se afirma que se revirtió si no se comprobó.
- **Acción `estado`**: consulta de solo lectura por correo/nombre/teléfono. Devuelve `ya_existente`, `no_existe` o `error_parcial` (registro incompleto). No crea ni borra nada.
- **Respuestas**: `ok`, `estado`, `mensaje`, `reintentable`, `requiere_revision` y, cuando aplica, `user_id`, `jugador_id` y `compensacion`. Sin tokens, Service Role ni códigos internos.

### Frontend

- `resultadoInvoke()` entiende los seis estados del servidor. `ya_existente` se muestra como «ya registrado», nunca como éxito de creación; la auditoría solo se registra para `creado`.
- Tras timeout, red o respuesta desconocida, `consultarEstadoCreacion()` hace una comprobación de solo lectura: si dice `no_existe`, se permite reintentar; si dice `ya_existente`, se informa sin crear otra cuenta; si dice `error_parcial` o no se puede consultar, el correo sigue bloqueado y se pide revisión.
- Se conservan el guard de doble clic, los timeouts locales, el `finally` que rehabilita el botón y la protección contra reintentos ciegos de 1.3.9.

### Base de datos

- **No se creó ni aplicó ninguna migración SQL.** La idempotencia se apoya en índices únicos ya presentes en producción (`jugadores_nombre_usuario_key`, `jugadores_user_id_uniq`, `jugadores_e164_canonicalizado_uniq`, PK de `grupo_jugadores`) y en la unicidad de correo de Supabase Auth. No se modificaron RLS, GRANT, RPC, políticas, SMTP ni datos de jugadores.

### Verificación final

| Verificación | Resultado |
|---|---|
| `vitest run` | **23 archivos, 296 pruebas, `EXIT=0`**. |
| `tests/admin-crear-jugador-servidor.test.js` | 19 pruebas aisladas de la Edge Function: alta correcta, correo existente, dos solicitudes simultáneas por correo y por jugador, fallo de Auth, fallo de `jugadores`, fallo de `grupo_jugadores`, fallo de compensación, respuesta perdida, cuenta huérfana recuperable, cuenta ajena, estado incompleto, validación, conexión, permisos y secretos. |
| `tests/creacion-admin-segura.test.js` | 18 pruebas aisladas del frontend: estados explícitos, doble clic, timeout con `no_existe`/`ya_existente`/incompleto, `rollback_fallido`, botón y auditoría. |
| `tests/registro-rate-limit.test.js` | 15 pruebas aisladas del registro público, incluidos 429 y cuenta ya existente. |
| Confirmación de correo | Cubierta por las pruebas de retorno de callback de 1.3.8, sin cambios en ese flujo. |
| `node --check` | Sin errores en JS modificado. La lógica de la Edge Function se ejecuta en las pruebas con mocks; Deno no está instalado en este entorno. |
| `git -c core.whitespace=cr-at-eol diff --check` | Sin errores. |

**Distinción de evidencia**: los 429 y la configuración remota se comprobaron en producción; los flujos de idempotencia, compensación y recuperación se simularon en entorno aislado con mocks. No se crearon cuentas reales ni se enviaron correos. La ejecución real con jugadores queda pendiente de verificación manual.
