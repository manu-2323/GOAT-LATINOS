# Diagnóstico del aviso de configuración de base de datos — post FASE 3.10

> Documento histórico: el error `42703` se corrigió en FASE 3.11
> (`fase-3.11-informe-correccion-esquema-telefonia.md`). No alterar el diagnóstico original.

Fecha: 2026-11-26
Repositorio: `manu-2323/GOAT-LATINOS`
Sitio analizado: https://manu-2323.github.io/GOAT-LATINOS/
Alcance: **solo diagnóstico**. No se ejecutaron migraciones, DDL, escrituras, cambios de RLS, permisos, autenticación ni registros de prueba.

## 1. Causa raíz identificada e hipótesis pendientes

### Causa raíz — CONFIRMADO

El aviso amarillo no indica que GitHub Pages esté fallando ni que la URL/clave de Supabase sea inválida. Es el resultado de dos hechos encadenados:

1. **El código consulta tres columnas que no existen en la base de datos real:**
   `jugadores.telefono_nacional`, `jugadores.telefono_verificado` y `jugadores.telefono_valido_plan`.
2. **El manejo global de errores traduce cualquier mensaje que contenga “Supabase” como un problema de configuración**, aunque el error real sea de esquema (`42703`).

La consulta fallida devuelve HTTP `400` con PostgreSQL `42703`; `GL.cargarContexto()` detecta el error, escribe la advertencia técnica en consola y llama a `GL.notificar('Supabase respondió con un error...', 'advertencia')`. La capa `ui-estados.js` envuelve `GL.notificar` y, como ese texto contiene “Supabase”, `GL.traducirError()` lo convierte en:

> Hay un problema de configuración con la base de datos. Contactá al administrador.

Por lo tanto, **el texto del aviso es engañoso**: la conexión existe, hay sesión válida y otras consultas a Supabase responden `200`.

### Hipótesis pendientes

- **PENDIENTE DE VERIFICAR:** qué migraciones de Supabase fueron ejecutadas realmente. Los archivos `supabase/migration-telefonos-1.2.0.sql`, `1.2.1.sql`, `2.2.sql` y `migration-seguridad-2.3.sql` están en el repositorio, pero no se consultó el historial interno de migraciones de la base de datos.
- **PENDIENTE DE VERIFICAR:** si existen funciones o vistas en la base de datos que dependan de las tres columnas ausentes. En el repositorio local hay definiciones SQL que las referencian; no se ejecutaron esas funciones para evitar escrituras.
- **PROBABLE:** la base de datos quedó en un estado parcial: tiene `telefono_e164` y `pais_telefono`, pero no las tres columnas nuevas. Esto encaja con una migración telefónica no aplicada, aplicada parcialmente o revertida.

## 2. Evidencia de consola y Network

Reproducción realizada en la versión publicada, con sesión de administrador, sin escrituras. Se capturaron 25 solicitudes a Supabase; **22 respondieron `200` y 3 respondieron `400`**. No hubo errores de red, CORS, `401`, `403` ni `42501`.

### Consola

```text
Failed to load resource: the server responded with a status of 400 ()

Contexto GL: column jugadores.telefono_nacional does not exist
  js/core/gl.js?v=1.2.1:949
```

El segundo mensaje apareció **tres veces**, una por cada refresco del contexto global durante el arranque.

### Toast observado en la app publicada

```text
Hay un problema de configuración con la base de datos. Contactá al administrador.
```

### Network — solicitud fallida

```text
GET /rest/v1/jugadores
    ?select=id,nombre_usuario,pais,zona_horaria,avatar_url,activo,suspendido,
            rol,torneo_id,numero,telefono,telefono_e164,telefono_nacional,
            pais_telefono,telefono_verificado,telefono_valido_plan,email,
            user_id,super_admin,created_at
    &order=nombre_usuario.asc
```

Respuesta:

```json
{
  "code": "42703",
  "details": null,
  "hint": null,
  "message": "column jugadores.telefono_nacional does not exist"
}
```

Las tres repeticiones ocurrieron en el arranque, aproximadamente en `08:33:15.508Z`, `08:33:15.745Z` y `08:33:16.072Z` (UTC). El resto de consultas —`paises`, `torneos`, `grupos`, `grupo_jugadores`, `jornadas`, `clasificacion`, `sanciones` y `partidos`— respondieron `200`.

No se registraron tokens ni credenciales en este diagnóstico; las cabeceras de autorización no se incluyeron en la evidencia.

## 3. Solicitud que origina el error

**CONFIRMADO:** la primera operación que falla es la lectura del contexto global de administrador:

```js
GL.esAdmin()
  ? GL.consultar('jugadores', q => q.order('nombre_usuario'))
  : GL.consultar('jugadores_publicos', q => q.order('nombre_usuario'))
```

La rama de administrador consulta directamente `public.jugadores` con la lista de columnas definida en `GL._columnas.jugadores`. La rama pública usa la vista `jugadores_publicos`, que no expone columnas telefónicas y **sí funciona**.

La consulta fallida ocurre después de cuatro lecturas correctas (`jugadores` por `user_id`, `paises`, `torneos` y `grupos`). Por eso el aviso aparece “al ingresar” y no antes.

Las tres repeticiones se explican porque `GL.cargarContexto(true)` se solicita desde:

- `js/app.js:20` — después de abrir la pantalla de acceso.
- `js/app.js:148` — arranque con sesión ya activa.
- `js/modulos/tabla.js:15` — render de la vista Tabla.

Otros módulos también fuerzan el mismo contexto al entrar, por lo que el error se reproduce al navegar.

## 4. Código y archivo responsable

**CONFIRMADO — origen de la consulta:**

- `js/core/gl.js:916-920` — `GL._columnas.jugadores` incluye las tres columnas inexistentes.
- `js/core/gl.js:922-928` — `GL.consultar()` construye `sb.from(tabla).select(cols)`.
- `js/core/gl.js:936-946` — `GL.cargarContexto()` ejecuta siete consultas en `Promise.all`; la tercera es la fallida cuando `GL.esAdmin()` es verdadero.
- `js/core/gl.js:947-951` — detecta `error`, hace `console.warn` y emite el aviso genérico de Supabase.

**CONFIRMADO — origen del texto amarillo:**

- `js/core/gl.js:627-628` — traduce cualquier mensaje con “supabase” a “Hay un problema de configuración con la base de datos…”.
- `js/core/ui-estados.js:42-47` — detecta la palabra técnica y aplica la traducción.
- `js/core/ui-estados.js:151-155` — envuelve `GL.notificar()` con `textoAmigable()`.

**CONFIRMADO — origen del estado vacío de la Tabla:**

- `js/modulos/tabla.js:15` — fuerza `GL.cargarContexto(true)`.
- `js/modulos/tabla.js:25` — consulta `partidos` de la jornada/grupo activos.
- `js/modulos/tabla.js:72-79` — si no hay filas de clasificación, muestra “Aún no hay clasificación para este grupo…”.

No se modificó ninguno de estos archivos.

## 5. Tablas y columnas involucradas

| Objeto | Estado | Evidencia |
|---|---|---|
| `public.jugadores` | CONFIRMADO — existe y es legible | `select=*` devolvió `3` filas |
| `jugadores.telefono_nacional` | CONFIRMADO — no existe | Error `42703` al consultarla; ausente en `select=*` |
| `jugadores.telefono_verificado` | CONFIRMADO — no existe | Error `42703` al consultarla; ausente en `select=*` |
| `jugadores.telefono_valido_plan` | CONFIRMADO — no existe | Error `42703` al consultarla; ausente en `select=*` |
| `jugadores.telefono_e164` | CONFIRMADO — existe y es legible | Consulta aislada correcta; presente en `select=*` |
| `jugadores.pais_telefono` | CONFIRMADO — existe y es legible | Consulta aislada correcta; presente en `select=*` |
| `public.jugadores_publicos` | CONFIRMADO — existe y funciona | `3` filas devueltas; definición local sin columnas telefónicas |
| `public.grupos` | CONFIRMADO — `2` filas | Respuesta `200` en Network |
| `public.grupo_jugadores` | CONFIRMADO — `1` fila, jugador existente | Respuesta `200` en Network |
| `public.jornadas` | CONFIRMADO — `0` filas en la tabla | Respuesta `200` con `[]`; la UI crea jornadas virtuales en memoria |
| `public.partidos` | CONFIRMADO — `0` filas | Consulta directa de solo lectura |
| `public.clasificacion` | CONFIRMADO — `0` filas | Respuesta `200` con `[]` en Network y consulta directa |
| `public.sanciones` | CONFIRMADO — `0` filas | Respuesta `200` con `[]` |
| `public.resultados` | CONFIRMADO — no existe | `PGRST205: Could not find the table 'public.resultados'`; el código usa el RPC `gl_guardar_resultado` sobre `partidos` |

Columnas realmente visibles en `jugadores`: `activo`, `avatar_url`, `created_at`, `email`, `id`, `nombre_usuario`, `numero`, `pais`, `pais_telefono`, `rol`, `super_admin`, `suspendido`, `telefono`, `telefono_e164`, `torneo_id`, `user_id`, `zona_horaria`.

## 6. Módulos afectados

### Afectados por la consulta fallida — CONFIRMADO

Como `GL.ctx.jugadores` queda vacío cuando la consulta de administrador falla (se midió `0` elementos, aunque la tabla tiene `3`), se ven afectados todos los módulos que dependen del contexto global con sesión admin:

- `js/app.js` — arranque y refresco posterior al login.
- `js/modulos/tabla.js` — nombres y referencias de jugadores en la clasificación.
- `js/modulos/calendario.js`, `fixture.js`, `dashboard-admin.js`, `eliminatorias.js`, `mensajes.js`, `perfil.js`, `resultados.js`, `stats-globales.js`, `stats-jornada.js`.
- `js/modulos/admin.js` — Administración/Jugadores y Equipos.
- `js/core/clasificacion.js` — usa `GL.cargarContexto(true)` antes y después del RPC de recálculo.

El rol público/no administrador usa `jugadores_publicos`, por lo que **no** presentaría este `42703` en el arranque.

### Afectados por las columnas ausentes en rutas de escritura — PROBABLE / PENDIENTE DE EJECUTAR

No se probaron escrituras, pero el código las contempla; si se ejecutan, es previsible que fallen con el mismo `42703`:

- `js/core/supabase.js:548-557` — `Auth.actualizarPerfil()` intenta escribir `telefono_nacional` y `telefono_valido_plan`.
- `js/core/supabase.js:661-669` — `recalcularTelefonoValidoPlan()` intenta actualizar `telefono_valido_plan`.
- `js/core/supabase.js:641-655` — RPC `gl_confirmar_e164`; su migración espera columnas y trigger que no se verificaron en la BD.
- `js/modulos/admin.js:1630-1637` — confirmación administrativa de titularidad depende de `telefono_verificado`.
- `js/modulos/perfil.js:141-150` — distintivo de teléfono depende de `telefono_verificado` y `telefono_valido_plan`.
- `js/core/gl.js:1324-1389` — construcción de campos telefónicos.

## 7. Consecuencias para la aplicación

- **CONFIRMADO:** aparece el aviso amarillo en cada arranque con sesión de administrador.
- **CONFIRMADO:** se emiten tres solicitudes `400` innecesarias por arranque; el mensaje de consola se repite tres veces.
- **CONFIRMADO:** `GL.ctx.jugadores` queda vacío para el administrador, aunque hay `3` jugadores en la base de datos. Esto puede hacer que la interfaz muestre lugares vacíos o nombres ausentes.
- **CONFIRMADO:** la Tabla muestra “Aún no hay clasificación…” y “Jornada 1 / 22 · Pendiente de programación”.
- **CONFIRMADO:** no hay pérdida de datos por esta incidencia; es un error de lectura por columna inexistente.
- **CONFIRMADO:** no hay evidencia de fallo de Pages, de credenciales inválidas, de RLS denegado ni de red caída.
- **PENDIENTE DE VERIFICAR:** el impacto total en flujos de escritura telefónica, porque no se ejecutaron esas acciones durante el diagnóstico.

## 8. Diferencia entre el esquema esperado y el real

| Columna | Esperado por código/migraciones | Real en Supabase | Clasificación |
|---|---|---|---|
| `jugadores.telefono_nacional` | Sí — `gl.js:917`, migración 1.2.0:11, 1.2.1:164 | No existe | CONFIRMADO |
| `jugadores.telefono_verificado` | Sí — `gl.js:917`, migración 1.2.0:13, 1.2.1:166 | No existe | CONFIRMADO |
| `jugadores.telefono_valido_plan` | Sí — `gl.js:917`, migración 1.2.1:167 | No existe | CONFIRMADO |
| `jugadores.telefono_e164` | Sí | Existe | CONFIRMADO |
| `jugadores.pais_telefono` | Sí | Existe | CONFIRMADO |
| `jugadores.zona_horaria` | Sí | Existe | CONFIRMADO |

Además:

- `supabase/migration-telefonos-2.2.sql:73-75` exige explícitamente `telefono_verificado`; si esa migración se hubiera aplicado sobre el esquema actual, habría fallado. Esto refuerza la hipótesis de migración pendiente, pero **no prueba** cuál fue ejecutada.
- La vista `jugadores_publicos` definida en `migration-seguridad-2.3.sql:385-391` solo expone ocho columnas deportivas; por eso la ruta pública no falla.

### Sobre la Tabla — CONFIRMADO

El mensaje de “sin clasificación” **es correcto en el estado actual de datos**, no es un error disfrazado:

- Hay `2` grupos y `1` jugador asignado a un grupo.
- Hay `3` jugadores en `jugadores`.
- La tabla `jornadas` tiene `0` filas; la aplicación genera `44` jornadas virtuales en memoria (`22` × `2` grupos) y por eso muestra “Pendiente de programación”.
- Hay `0` partidos, `0` resultados en `partidos`, `0` filas en `clasificacion` y `0` sanciones.

La incidencia telefónica afecta los nombres del contexto admin, pero **no es la causa** de que la clasificación esté vacía. Para que aparezca la tabla hace falta generar el fixture y cargar resultados, lo cual no se hizo durante este diagnóstico.

## 9. Solución técnica recomendada

**No implementada.** Orden recomendado para decidir después de revisar la evidencia:

1. **CONFIRMADO como primer paso:** consultar el historial real de migraciones de Supabase y el esquema de `public.jugadores` desde el panel de Supabase, sin ejecutar nada. Comparar con los archivos `supabase/migration-telefonos-*.sql`, `migration-seguridad-2.3.sql` y `RELEASE-1.2.0.md`.
2. **RECOMENDADO — alinear la base con el código:** si las migraciones están pendientes, aplicarlas en orden controlado, con respaldo previo, verificando columnas, triggers, funciones RPC, grants y políticas RLS. Después validar con una lectura aislada que las tres columnas existan y que la consulta de contexto devuelva `200`.
3. **RECOMENDADO — corregir el diagnóstico visible:** distinguir `42703` de un problema de configuración. El mensaje debe decir que el esquema no coincide con la versión de la aplicación, no “configuración de base de datos”.
4. **RECOMENDADO — validar después:** recargar la app con sesión admin y confirmar `0` respuestas `400`, `GL.ctx.jugadores.length = 3` y aviso amarillo ausente.
5. **Alternativa no recomendada como solución final:** quitar las columnas ausentes de `GL._columnas.jugadores` y desactivar las rutas telefónicas hasta migrar. Detendría el aviso, pero ocultaría una incompatibilidad real y dejaría funciones sin operar; además entraría en conflicto con la instrucción de no sustituir errores reales por estados vacíos.

No se debe inventar clasificación ni crear registros para “probar” la Tabla.

## 10. Riesgos de aplicar la solución

- **RIESGO ALTO — DDL en producción:** `ALTER TABLE` sobre `jugadores` puede bloquear escrituras brevemente; debe planificarse en ventana controlada.
- **RIESGO ALTO — migración parcial:** aplicar 1.2.1 sin 1.2.0/2.2/seguridad puede dejar triggers, RPC o grants inconsistentes.
- **RIESGO MEDIO — backfill telefónico:** los archivos SQL convierten y normalizan números; hay que revisar unicidad de `telefono_e164`, valores nulos y datos históricos antes de ejecutar.
- **RIESGO MEDIO — RLS/permisos:** las migraciones modifican grants y vistas; un cambio incorrecto puede exponer datos o bloquear lecturas legítimas.
- **RIESGO MEDIO — funciones dependientes:** existen definiciones SQL que referencian las columnas ausentes; conviene verificar que las funciones aplicadas sean compatibles con el esquema final.
- **RIESGO BAJO — corrección de mensajes:** cambiar la traducción no resuelve el esquema, pero evita diagnosticar erróneamente el fallo como “configuración”.
- **RIESGO DE NO HACER NADA:** cada arranque admin seguirá emitiendo `400`, `ctx.jugadores` seguirá vacío y las acciones telefónicas podrán fallar al ejecutarse.

**Estado final del diagnóstico:** se entregó evidencia y causa raíz. No se aplicó ninguna corrección, migración ni cambio de datos.
