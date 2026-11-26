# FASE 3.23 — Cierre de jornada y preparación operativa

**Fecha:** 2026-11-26  
**Rama:** `main`  
**HEAD antes de esta integración:** `5939b45ea921649e9fb4cb9abcc45a8acd15f78b`  
**Supabase:** `GOATS-LATINOS (zmjzlvsdlfzmhptmtmjx) · production`, PostgreSQL 17.12.  
**Decisión final: A — LISTO PARA COMENZAR LAS PRUEBAS MANUALES Y CARGAR DATOS REALES.**

No existe ningún bloqueante técnico conocido que impida empezar a cargar la competición. Las limitaciones documentadas en §11 no impiden el uso y fueron conservadas deliberadamente para no inventar reglas ni cambiar políticas existentes. No se afirma que no puedan existir errores desconocidos.

---

## 1. Alcance y autorización

Se partió de `docs/fase-3.22-preparacion-datos-reales.md` (conclusión C, bloqueante: cierre de jornada). El usuario autorizó expresamente la aplicación de la migración y la publicación en `main`, con las condiciones de revisión previa, no duplicidad, preservación de datos y guía manual.

No se inició FASE 3.24. No se agregaron módulos nuevos. No se crearon registros de prueba en producción.

---

## 2. Revisión obligatoria de la migración (antes de aplicar)

Archivo revisado íntegramente: `supabase/migration-fase-3.23-cierre-jornada.sql` (374 líneas).

| # | Comprobación exigida | Resultado de la revisión |
|---|---|---|
| 1 | SQL completo leído | Sí, 374 líneas; contiene exactamente dos `CREATE OR REPLACE FUNCTION`. |
| 2 | Corresponde al diagnóstico | Sí: corrige `usuario_id`/`tabla_afectada`, `auth.uid()` vs FK y `jornadas.updated_at`. |
| 3 | Funciones que modifica | Solo `public.gl_cerrar_jornada_interno` y `public.gl_guardar_resultado_interno`. |
| 4 | Firmas y dependencias | Idénticas a producción: `(uuid, uuid, integer, jsonb, uuid) → json` y `(uuid, uuid, integer, integer, text, text, uuid, text, jsonb) → json`. Se verificó `gl_cerrar_jornada`, `gl_guardar_resultado`, `gl_es_admin`, `recalcular_clasificacion` y la sobrecarga de 7 argumentos de `gl_registrar_auditoria`. |
| 5 | Uso correcto de `jugadores.id` | Sí: `SELECT id, rol ... WHERE user_id = p_cerrado_por` / `p_ingresado_por`; se usa `v_admin_jugador_id` en `partidos.ingresado_por` y `v_ingresado_jugador_id` en `partidos_historial.registrado_por` y `partidos.ingresado_por`. Producción confirma FKs a `jugadores(id)`. |
| 6 | Columnas inexistentes | Ninguna referencia a `auditoria.usuario_id`, `auditoria.tabla_afectada` ni `jornadas.updated_at`. `partidos.updated_at` sí existe. |
| 7 | Auditoría | `PERFORM public.gl_registrar_auditoria(torneo, grupo, 'jornada_cerrada', 'jornada', id, usuario, jsonb)`; sobrecarga de 7 argumentos existente, que escribe `public.auditoria_eventos` (tabla que lee `js/modulos/auditoria.js:73`). |
| 8 | Firmas públicas | No se alteraron; los wrappers `gl_cerrar_jornada` y `gl_guardar_resultado` no se tocan. |
| 9 | Tablas/índices/restricciones | Ningún `CREATE TABLE`, `ALTER TABLE`, índice ni constraint. |
| 10 | RLS/GRANT/REVOKE | Ninguna instrucción de permisos; las ACL antes y después son idénticas (§5.C). |

**Diff cuerpo por cuerpo.** Se comparó el SQL propuesto contra los cuerpos leídos en producción (`tests/fixtures/fase-3.23-cierre-original.sql`, `tests/fixtures/fase-3.23-guardar-original.sql`). Los cuerpos actuales de producción coincidían exactamente con los fixtures (171 y 136 líneas). El diff contuvo **solo**:

- `gl_cerrar_jornada_interno`: nueva variable `v_admin_jugador_id`; `SELECT id, rol`; dos asignaciones `ingresado_por = v_admin_jugador_id`; `UPDATE jornadas SET estado='cerrada'` sin `updated_at` (en ambas ramas); reemplazo del `INSERT INTO auditoria (...)` por la llamada a `gl_registrar_auditoria`.
- `gl_guardar_resultado_interno`: nueva variable `v_ingresado_jugador_id`; `SELECT id, rol`; `registrado_por = v_ingresado_jugador_id`; `ingresado_por = ... ELSE v_ingresado_jugador_id`.

No apareció ninguna operación destructiva ni cambio fuera de alcance, por lo que se autorizó la ejecución.

---

## 3. Aplicación de la migración

- **Proyecto/environment confirmados antes de ejecutar:** CLI `Target: project GOATS-LATINOS (zmjzlvsdlfzmhptmtmjx) · production`; `current_database()=postgres`, `server_version=17.12`.
- **Estado previo:** `cierre_legacy_usuario_id=1`, es decir, el cuerpo roto seguía desplegado.
- **Mecanismo:** el proyecto no tiene `supabase/config.toml`, no usa `supabase/migrations/` y `supabase_migrations.schema_migrations` no existe (`to_regclass(...)=null`). El mecanismo establecido es ejecutar los archivos `supabase/migration-*.sql` contra el proyecto enlazado; se usó `supabase db query --remote --file` con `--yes` (autorización explícita del usuario).
- **Transacción:** se envolvió el archivo exacto en `BEGIN; ... COMMIT;` en un archivo temporal (`%TEMP%\gl_fase323_apply.sql`, 16 726 bytes). No se modificó el SQL revisado.
- **Comando:** `supabase db query --remote --file <wrapper> --yes`.
- **Resultado:** `Confirmed by --yes: Run a SQL statement on project GOATS-LATINOS (zmjzlvsdlfzmhptmtmjx) · production`; salida JSON con `"rows": []`, `boundary=71d4d52a6080c67d96c4429de105c9ce`; `APPLY_EXIT=0`. No hubo errores ni ejecución parcial.
- **No duplicidad:** solo se ejecutó una vez; el estado previo legacy se comprobó antes y la definición corregida después.
- **Historial:** como no existe tabla de migraciones en el proyecto, el registro de esta aplicación queda en este informe (fecha, proyecto, comando, boundary y verificaciones). No se creó esa tabla.
- **Datos:** conteos antes y después: `torneos=1`, `jugadores=3`, `partidos=0`, `jornadas=0`, `auditoria_eventos=0`. No se insertaron, actualizaron ni eliminaron datos deportivos.

---

## 4. Funciones modificadas

| Función | Acción | Firma (sin cambios) |
|---|---|---|
| `public.gl_cerrar_jornada_interno` | `CREATE OR REPLACE` | `(p_torneo_id uuid, p_grupo_id uuid, p_jornada integer, p_resoluciones jsonb, p_cerrado_por uuid) RETURNS json`, `SECURITY DEFINER`, `search_path='public,pg_temp'` |
| `public.gl_guardar_resultado_interno` | `CREATE OR REPLACE` | `(p_partido_id uuid, p_torneo_id uuid, p_goles_local integer, p_goles_visitante integer, p_estado text, p_captura_url text, p_ingresado_por uuid, p_motivo text, p_stats jsonb) RETURNS json`, `SECURITY DEFINER` |

No modificadas: `gl_cerrar_jornada`, `gl_guardar_resultado`, `gl_es_admin`, `recalcular_clasificacion`, `gl_registrar_auditoria` (ninguna sobrecarga).

---

## 5. Verificación posterior directa en Supabase (solo lectura)

### A. Funciones

- Las definiciones desplegadas de `gl_cerrar_jornada_interno` (170 líneas normalizadas) y `gl_guardar_resultado_interno` (137) son **idénticas** a los cuerpos del archivo de migración: `produccion_igual_a_migracion=true` en ambos casos.
- Indicadores remotos: `cierre_usuario_id=0`, `cierre_tabla_afectada=0`, `cierre_jornadas_updated_at=0`, `cierre_usa_jugador_id=1`, `cierre_usa_auditoria_7=1`, `guardar_usa_jugador_id=1`.
- `gl_cerrar_jornada` sigue disponible y intacto: valida `public.gl_es_admin()` y delega con `auth.uid()` como último argumento. `gl_guardar_resultado` conserva su firma.
- Relación usuarios/jugadores correcta: `jugadores.user_id → auth.users.id` y las columnas con FK a `jugadores(id)` reciben `jugadores.id`, nunca `auth.uid()`.

### B. Auditoría

- El cierre invoca la sobrecarga existente de 7 argumentos; `pg_get_functiondef` confirma que inserta en `public.auditoria_eventos` con `torneo_id, grupo_id, accion, entidad_tipo, entidad_id, realizado_por, detalle`.
- `auditoria_eventos` tiene FK solo en `torneo_id` y `grupo_id`; `realizado_por` no tiene FK a `jugadores`, por lo que `p_cerrado_por` (`auth.uid()`) es válido allí.
- No se generaron duplicados: no se crearon eventos durante la integración (`auditoria_eventos=0` antes y después). La idempotencia del cierre se demostró en el arnés aislado: segundo cierre → `{"ok":false,"error":"La jornada 1 ya está cerrada."}`, sin duplicar auditoría ni clasificación.
- Los errores del cierre **no se ocultan**: `EXCEPTION WHEN OTHERS` devuelve `{ok:false, error:SQLERRM}` y la UI lo muestra. La función de auditoría conserva su política `best-effort` preexistente (§11.3).

### C. Integridad y permisos

- Las 18 FK revisadas son idénticas antes y después, incluidas `partidos_ingresado_por_fkey → jugadores(id)`, `partidos_historial_registrado_por_fkey → jugadores(id)` y `auditoria_realizado_por_fkey → auth.users(id)`.
- ACL idénticas antes y después para las seis funciones verificadas. Ejemplo: `gl_cerrar_jornada`: `postgres,service_role,authenticated`; `gl_cerrar_jornada_interno` e `interno` de resultados: `postgres,service_role`; sobrecarga de 7 argumentos de auditoría: también `anon` y `authenticated`.
- No hay `GRANT`, `REVOKE`, modificación de RLS ni cambios de tablas.

### D. Causas raíz eliminadas

| Causa documentada | Antes | Después |
|---|---|---|
| `auditoria.usuario_id` / `tabla_afectada` inexistentes | presentes en el cuerpo | `cierre_usuario_id=0`, `cierre_tabla_afectada=0` |
| `auth.uid()` escrito en columnas con FK a `jugadores(id)` | presente en cierre y resultados | `cierre_usa_jugador_id=1`, `guardar_usa_jugador_id=1` |
| `jornadas.updated_at` inexistente | presente en dos `UPDATE` | `cierre_jornadas_updated_at=0` |

La corrección no se declara resuelta solo porque el comando terminó bien: se comprobó el cuerpo desplegado, los indicadores de columnas, las FK, las ACL y la ausencia de cambios de datos.

---

## 6. Pruebas ejecutadas

| Prueba | Resultado exacto |
|---|---|
| Suite Vitest tras la publicación del código | **18 archivos, 220 pruebas, `EXIT=0`** (219 antes del ajuste de cache-busting; se agregó 1 prueba nueva) |
| `tests/fase-3.23.test.js` | 8 + 1 pruebas (D.12, textos, migración, cache-busting) |
| `tests/fase-3.23-sql.test.js` | integración del arnés aislado |
| `node scripts/fase-3.23-db-check.mjs` | **`RESUMEN: 49/49 verificaciones correctas; 0 fallo(s).`, `DB_EXIT=0`** |
| `git -c core.whitespace=cr-at-eol diff --check` | `CHECK_CRLF_EXIT=0` |

El arnés usa PostgreSQL 19.0 (PGlite 0.6.0) y datos sintéticos; nunca conecta a Supabase. Cubre reproducción de los tres fallos y rollback, cierre correcto, resoluciones, clasificación, auditoría, idempotencia, rollback forzado, permisos, jornada inexistente y carga/corrección de resultados. No se redujo cobertura; se agregaron pruebas.

**Cache-busting verificado:** `CONFIG.VERSION=1.3.6`; `index.html` sirve `css/*.css?v=3.23.0`, `config.js/gl.js/menu.js?v=1.3.6`, `auth.js?v=1.3.6`, `onboarding.js?v=1.2.4`. Los módulos —incluido `calendario.js`— se cargan con `?v=CONFIG.VERSION` (`js/core/gl.js:131`). Las regex de versiones en pruebas 3.15/3.16/3.17/3.19 se ampliaron para admitir las nuevas sin eliminar las anteriores.

---

## 7. Publicación

**Commits:** *pendiente de completar tras el push*.  
**GitHub Actions:** *pendiente de completar tras el push*.  
**GitHub Pages:** *pendiente de completar tras el push*.

No se crearon ramas auxiliares, tags ni reescrituras de historial. El push se realiza directamente sobre `main`.

---

## 8. Guía de pruebas manuales (nombres reales de la interfaz)

Entrá a **https://manu-2323.github.io/GOAT-LATINOS/**. Los nombres de menús, botones y campos siguientes son literales; cuando un nombre que parecería obvio no existe, se indica el real. Introducí solo datos auténticos de tu competición, a tu ritmo.

### PRUEBA 1 — Acceso

| Paso | Detalle |
|---|---|
| Dónde entrar | Pantalla inicial. Para administración, elegí el enlace **`Acceso de administrador`** dentro del modal `Bienvenido de nuevo` / `Acceso a la liga`. |
| Botón | **`Ingresar como administrador`** (no existe `Iniciar sesión como administrador`). Para jugador: **`Ingresar`**; para alta: **`Crear cuenta`** en `Sumate a la liga`. |
| Datos | Admin: **`Correo electrónico`** y **`Clave de administrador`**. Jugador: **`Correo electrónico`**, **`Contraseña`**. Registro: **`Nombre en FC Mobile`**, **`País`**, **`Teléfono / WhatsApp (obligatorio)`**, **`Ciudad o zona horaria`**, **`Correo electrónico`**, **`Contraseña (mínimo 8 caracteres)`**, **`Confirmar contraseña`**. |
| Resultado esperado | Se abre **`Inicio`** (`GOATS LATINOS · Temporada activa`). El menú muestra el estado **`Administrador`**, **`Jugador`** o **`Pendiente de aprobación`**, y la opción **`Cerrar sesión`**. Las secciones de administrador están accesibles; un jugador ve **`Acceso restringido`** con `Esta sección es exclusiva del administrador de la liga.` |
| Señal de error | El modal no desaparece, aparece `Tu sesión venció o las credenciales no son válidas...`, o un jugador entra a `Administración`/`Centro de control`. No reintentos indefinidamente: revisá correo/clave. |

### PRUEBA 2 — Configuración

| Paso | Detalle |
|---|---|
| Dónde entrar | Menú **`Administración`** (`#administracion`) o **`Centro de control`** (`#dashboard-admin`). Pestañas reales: **`Resumen`**, **`Jugadores`**, **`Equipos`**, **`Jornadas`**, **`Disciplina`**, **`Admins`**, **`Config`**. |
| Botón | **`Crear Torneo`** (o **`Crear primer torneo`** en el centro de control). Para cargar todo junto: **`Nueva Temporada`** con pasos **`1 Datos`**, **`2 Jugadores`**, **`3 Jornadas`**. Para editar: pestaña **`Config`** → **`Guardar cambios`**. |
| Datos | Modal `Crear Torneo`: **`Nombre de la liga`**, **`Temporada`** (ej. `2026 · Clausura`), **`Número de jornadas (1..30)`**. Pestaña `Config`: **`Nombre`**, **`Temporada`**, **`Total de jornadas (1..30)`**, **`Estado`** (`Activo`/`Finalizado`), **`Reglamento vigente (se incluye en los mensajes)`**. Alta rápida: **`Nombre de usuario`**, **`Correo`**, **`Clave`**, **`País`**, **`País del teléfono`**, **`Teléfono / WhatsApp (obligatorio)`**, **`Grupo`** → **`Crear jugador`**. |
| Resultado esperado | Desaparece `Sin torneo activo` / `No hay torneo activo.`; aparece `Torneo "<nombre>" creado correctamente.`; los grupos quedan creados con el torneo. En **`Jugadores`** se listan los inscriptos y en **`Admins`** se ve `Designá a quién puede cargar resultados, jornadas y mensajes`. |
| Señal de error | `Ingresá el nombre de la liga.`, `Ingresá la temporada.`, `El número de jornadas debe estar entre 1 y 30.`, o `No hay jugadores inscritos en este torneo.` tras crear jugadores. |

**Importante:** no hay botón `Crear equipos` ni `Nuevo equipo`. Los equipos son los grupos creados con el torneo; en la pestaña **`Equipos`** leés `Los equipos son los grupos ya creados con el torneo activo.` y podés usar **`Ver jugadores`**, **`Ver plantel`**, **`Buscar equipo`** y **`Ir a configuración`**. Para asignar jugadores usá **`Asignar Grupo`** / **`Quitar del grupo`** en el paso 2 de `Nueva Temporada` o la vista **`Jugadores`**. Para editar datos del torneo usá **`Config`** y **`Guardar cambios`** (no existe `Editar torneo`).

### PRUEBA 3 — Jornadas

| Paso | Detalle |
|---|---|
| Dónde entrar | Menú **`Jornadas`** (`#jornadas`, vista `Gestión de jornadas`) y menú **`Calendario`** (`#calendario`, vista `Calendario y programación`). |
| Botón | En `Jornadas`: **`Horario`**, **`Ver`**, **`Abrir`**, **`Cerrar`**. En `Calendario`: **`Programar jornada <n>`**, **`Guardar programación`**, **`Descargar .ics`**, **`Exportar PDF`**. |
| Datos | En `Horario de la jornada <n>`: **`Fecha de inicio (<zona>)`**, **`Hora de inicio (<zona>)`**, **`Fecha límite (<zona>)`**, **`Hora límite (<zona>)`** → **`Guardar horario`**. En `Calendario`: **`Fecha de apertura`**, **`Hora de apertura`**, **`Fecha límite`**, **`Hora límite`** → **`Guardar programación`**. |
| Resultado esperado | Una jornada sin fechas muestra **`Sin programar`**, **no** `Abierta`, y no ofrece `Abrir`. Tras guardar horario aparece **`Jornada <n> guardada.`** o **`Jornada <n> programada correctamente.`** Al pulsar **`Abrir`** se pide confirmación `¿Abrir la jornada <n>? Permitirá cargar resultados de esos partidos.` y luego `Jornada <n> abierta.` Recargá la página (F5): la jornada sigue **`Abierta`** tanto en `Jornadas` como en `Calendario`. |
| Señal de error | Vuelve a aparecer `Sin programar` tras recargar; aparece `La base de datos no confirmó el cambio...`; se muestra `Primero programá la jornada <n> en Jornadas; una jornada sin registrar no se puede abrir.`; o el botón `Abrir` sigue habilitado durante la operación. |

### PRUEBA 4 — Partidos

| Paso | Detalle |
|---|---|
| Dónde entrar | Menú **`Cuadro de partidos`** (`#fixture`). También `Jornadas` → **`Ver`** → modal `Partidos · Jornada <n>`. |
| Botón | **`Generar cuadro de partidos`** → modal `Previsualización del cuadro de partidos` → **`Confirmar y generar`**. Filtros: pestañas **`Grupo <letra>`**, **`Todas`**, **`J<n>`**. |
| Datos | No se crea partido por partido: el cuadro se genera para el torneo y cada par se enfrenta ida y vuelta. Para cargar encuentros manualmente durante `Nueva Temporada` existen **`Número de jornada`**, **`Fecha (DD/MM/YYYY)`**, **`Grupo`** y **`Agregar partido`**. |
| Resultado esperado | `Cuadro de partidos generado correctamente.`; métricas **`Partidos del grupo`**, **`Pendientes de resultado`**, **`Disputados`**, **`Sin programación`**; cada encuentro figura en su **`Grupo <letra>`** y en su **`J<n>`**, con su fecha/hora visible en `Calendario`. |
| Señal de error | `No se pudo generar el cuadro de partidos.`, `No hay partidos para esta jornada.`, encuentros del grupo equivocado o sin `Sin programación` cuando no hay fecha. No existe `Crear partido` en `#fixture`. |

### PRUEBA 5 — Resultados

| Paso | Detalle |
|---|---|
| Dónde entrar | Menú **`Resultados`** (`#resultados`, solo administrador). Para ver los datos del jugador, menú **`Mi Perfil`** (`#perfil`). Tabla: menú **`Tabla`**. Estadísticas: **`Estadísticas`** / **`Estadísticas globales`**. Historial: pestaña **`Historial (<n>)`** dentro de `Resultados`, y menú **`Auditoría`**. |
| Botón | En `Cargar resultados`: seleccionar encuentro y **`Confirmar y Guardar`** → modal `Confirmar resultado` → **`Guardar resultado`**. Para corregir: **`Historial (<n>)`** → elegir partido → **`Confirmar corrección`**. |
| Datos | **`Goles del local`**, **`Goles del visitante`**, **`Estado del partido`** (`Jugado`, `Walkover local`, `Walkover vis.`, `Doble ausencia`), **`Motivo de corrección (obligatorio)`** solo si corregís, captura JPG/PNG ≤ 5 MB, y opcionalmente **`Tiros local`**, **`Tiros a puerta local`**, **`Posesión local %`**, **`Precisión pase local %`** y las contrapartes de visita. |
| Resultado esperado | El marcador aparece en `Mi Perfil` y en `Cuadro de partidos`; la **`Tabla`** y **`Estadísticas`** se recalculan automáticamente. En `Historial (<n>)` queda el registro con su motivo cuando fue corrección. Un duplicado sin motivo se rechaza con `Este partido ya tiene resultado. Usá el historial para corregirlo y no duplicarlo.` |
| Señal de error | `No hay jornada abierta ...`, `La jornada está cerrada. No se pueden cargar resultados.`, `Indica el motivo de la corrección antes de guardar.`, `La posesión de ambos equipos debe sumar 100.`, `Solo el administrador puede registrar o corregir resultados.` El botón del formulario es `Confirmar y Guardar`; `Guardar resultado` pertenece al modal de confirmación. |

### PRUEBA 6 — Cierre

| Paso | Detalle |
|---|---|
| Dónde entrar | Menú **`Jornadas`** → botón **`Cerrar`** de la jornada abierta. También desde **`Calendario`** con el botón **`Cerrar`**. |
| Botón | **`Cerrar`** → modal `Cerrar jornada <n>` → **`Cerrar jornada`** (o **`Cancelar`**). Al terminar, la app navega a **`Mensajes`** con badge **`Cierre`** y pestaña **`Cierre de jornada`**. |
| Datos | Para cada pendiente, elegí en **`Resolución`**: `Gana local 3-0 (visita ausente)`, `Gana visita 3-0 (local ausente)` o `Doble ausencia 0-0`. Las expulsiones se resuelven automáticamente (`Expulsado local — gana visita 1-0`, etc.). |
| Resultado esperado | Confirmación `¿Cerrar la jornada <n>?` con botón **`Cerrar jornada`**; mensaje `Jornada <n> cerrada. <k> partido(s) resuelto(s). Tabla actualizada.` Recargá (F5): la jornada sigue **`Cerrada`**, el marcador no cambia y la tabla/estadísticas siguen coherentes. En **`Auditoría`** podés buscar `jornada_cerrada`; en `Mensajes` podés usar **`Copiar al portapapeles`**, **`Descargar .txt`** o **`Enviar por WhatsApp`**. |
| Señal de error | `No se pudo cerrar: ... la base de datos no confirmó la operación`, la jornada vuelve a `Abierta` tras recargar, o `No hay partidos pendientes` pero el estado no cambia. Un segundo cierre debe responder `La jornada <n> ya está cerrada.` sin duplicar eventos. No hay botón `Cerrar temporada`; en `Config` solo existe el estado **`Finalizado`**. |

---

## 9. Protección de datos reales

Durante esta integración no se insertaron datos de prueba, no se eliminaron jugadores, no se modificaron resultados, no se cerraron jornadas reales y no se ejecutaron operaciones destructivas. Los conteos de producción se mantuvieron en `torneos=1`, `jugadores=3`, `partidos=0`, `jornadas=0`, `auditoria_eventos=0`. Las pruebas automatizadas usaron PGlite y datos sintéticos. Las pruebas manuales las realiza el usuario.

---

## 10. Cambios en código y documentación

- **SQL aplicado:** `supabase/migration-fase-3.23-cierre-jornada.sql`.
- **Frontend:** `js/modulos/calendario.js`, `css/estilos.css`, `js/ui/auth.js`, `js/ui/onboarding.js`, `js/core/config.js`, `index.html`.
- **Pruebas:** `tests/fase-3.23.test.js`, `tests/fase-3.23-sql.test.js`, `tests/fixtures/`, ajustes en `tests/integracion-flujo-competicion.test.js`, `tests/fase-3.15.test.js`, `tests/fase-3.16.test.js`, `tests/fase-3.17.test.js`, `tests/fase-3.19.test.js`.
- **Arnés:** `scripts/fase-3.23-db-check.mjs`; dependencia de desarrollo `@electric-sql/pglite@0.6.0` en `package.json`/`package-lock.json`.
- **Documentos:** `docs/fase-3.22-preparacion-datos-reales.md` (informe previo que seguía sin publicar) y este documento.

---

## 11. Limitaciones conocidas y riesgos residuales

1. **No se ejecutó un cierre real con datos de la competición.** El usuario va a introducirlos; la corrección se validó en PostgreSQL aislado con datos sintéticos y mediante inspección directa del cuerpo desplegado. No se afirma un escenario de datos reales no ejecutado.
2. **PGlite no es Supabase:** 19.0/WASM frente a 17.12 con Auth/RLS reales. El arnés simula `auth.uid()` con `current_setting('fase323.uid')` y no valida RLS ni grants de ejecución reales; las ACL se comprobaron por consulta remota.
3. **Auditoría best-effort:** la sobrecarga de 7 argumentos silencia sus propios errores por diseño previo. Si `auditoria_eventos` fallara, el cierre podría quedar correcto sin evento visible. Se conservó la política existente; no se creó una RPC nueva.
4. **Sin tabla `schema_migrations`:** no hay historial server-side; el registro de la aplicación es este informe. No se creó la tabla para no alterar el esquema.
5. **Concurrencia real de base de datos:** la prueba de doble envío es de UI (botón deshabilitado y `Set` de operaciones en curso), no de bloqueo a nivel de fila.
6. **Textos de la interfaz:** en `Resultados` aparece la frase `Crealo desde Administración → Configuración`, pero la pestaña real se llama **`Config`**. Es un texto preexistente no modificado en esta fase; la guía usa el nombre real.

---

## 12. Estado definitivo

**A — LISTO PARA COMENZAR LAS PRUEBAS MANUALES Y CARGAR DATOS REALES.**

Migración revisada y aplicada una vez en `production` dentro de transacción; funciones verificadas contra el SQL aplicado; causas raíz ausentes en el cuerpo desplegado; firmas, FKs y permisos intactos; sin datos nuevos creados por la integración; suite en verde; código publicado y guía manual entregada. No se inicia otra fase.
