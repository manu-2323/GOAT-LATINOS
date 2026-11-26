# Correcciones de uso real — GOAT-LATINOS

**Fecha:** 2026-11-26  
**Rama:** `main` (sin ramas auxiliares)  
**Alcance:** selector `Ciudad o zona horaria`, cierre del modal `Agregar jugador al torneo` e investigación del correo electrónico.  
**Decisión:** **A — correcciones verificadas localmente; pendiente de cierre de publicación.**

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

*Pendiente de completar tras el push: commits, GitHub Actions y GitHub Pages.*

---

## 7. Limitaciones pendientes

1. No se verificó el proveedor SMTP remoto ni se envió correo real.
2. La confirmación pública depende de Supabase Auth; GOAT-LATINOS solo muestra el mensaje, sin reenvío ni estado de entrega.
3. No hay prueba en dispositivo móvil físico; la cobertura es jsdom y revisión de eventos/CSS.
4. Otros formularios modales mantienen su comportamiento previo; las nuevas opciones están disponibles en el helper para aplicarlas caso por caso.
5. No se afirma ausencia de errores desconocidos fuera de lo revisado.
