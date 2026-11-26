# FASE 3.22 — Preparación para datos reales

**Estado:** auditoría completada; **conclusión: C. NO LISTO**.
**Fecha:** 2026-11-26.
**Rama:** `main` @ `5939b45ea921649e9fb4cb9abcc45a8acd15f78b` (sin ramas auxiliares, sin commits ni pushes).
**Base:** FASE 3.21, cerrada y publicada en `main` (commits `4355d9e…` y `5939b45…`; Actions `45901486258` y `45901675340` en `completed/success`; Pages verificado).
**Método:** revisión estática del repositorio e inspección remota **exclusivamente de lectura** (`supabase db query --remote --read-only`) contra `GOATS-LATINOS (zmjzlvsdlfzmhptmtmjx) · production`, usuario `supabase_read_only_user`, PostgreSQL 17.12.
**Reglas respetadas:** no se modificaron datos reales, no se hicieron escrituras de prueba, migraciones, DDL/RLS/GRANT/REVOKE/RPC, ni despliegues de Edge Functions; no se crearon datos ficticios en producción; no se cambiaron permisos.

---

## A) Estado general

FASE 3.22 es una auditoría de preparación, no una fase de desarrollo. No se tocó el código ni la base: el repositorio quedó limpio (`git status --porcelain` sin líneas) y Supabase solo fue consultado en modo lectura.

La aplicación tiene una base desplegada y operativa: RLS activo, RPCs con wrappers de administrador, grants de lectura pública y Edge Functions desplegadas. Sin embargo, **no está lista para iniciar una competición con datos reales** porque el cierre de jornada —paso obligatorio del flujo de competición— revierte la operación antes de confirmarla.

La conclusión es **C. NO LISTO** por un único bloqueante (§C.1). El resto de hallazgos son importantes o mejorables, pero no impiden cargar los datos iniciales ni consultar la liga; pueden tratarse después del bloqueante.

Antecedentes vigentes: `docs/fase-3.18-auditoria-backlog.md` y `docs/fase-3.19-informe-estabilizacion.md` (deduplicación de notificaciones mitigada solo en cliente), `docs/fase-3.20-informe-experiencia-integral.md` y `docs/fase-3.21-resultados.md` (validaciones de resultados con fixtures sintéticos).

---

## B) Flujos revisados

| Flujo | Recorrido verificado | Estado con datos reales |
|---|---|---|
| **A. Administración inicial** | Overlay de acceso admin (`js/ui/auth.js:41-52,126-135`) → `Auth.entrarAdmin()` → validación servidor `gl_validar_acceso_admin` (definición en producción: solo `admin_acceso` + `jugadores`, bloqueo por intentos) → Centro de control → Administración (`js/ui/menu.js:27`, `GL.esAdmin()` en `js/ui/menu.js:79`) → crear/jugar torneo, grupos y jugadores. El alta de jugadores usa `admin-crear-jugador` (`js/modulos/admin.js:1473,1704,3166`), no INSERT directo: `authenticated` no tiene INSERT de tabla sobre `jugadores` (verificado), sí columnas permitidas para registro propio (`supabase/migration-seguridad-2.3.sql:344-347`). | Operable. Hay 2 correos admin activos y 2 jugadores con rol `admin` confirmados. Prerrequisito de datos: 12 jugadores activos por grupo para generar el fixture. La auditoría del flujo A no encontró botones sin handler ni bloqueante funcional propio; sí riesgos de consistencia (§D.8–D.11). |
| **B. Competición** | Generación de fixture (`js/modulos/admin.js:1594`, `js/modulos/fixture.js:476`; wrapper `gl_generar_fixture` verificado en producción con `gl_es_admin()` y delegación en `_interno`), jornada manual (`js/modulos/admin.js:1635`), fechas (`js/modulos/calendario.js:722-728`), apertura REST (`js/modulos/admin.js:1997-1998`, `js/modulos/calendario.js:759-765`), carga/corrección de resultados (`js/modulos/resultados.js:1027-1039`), cierre (`js/modulos/admin.js:3401-3413`, `js/modulos/calendario.js:791-804`), recálculo. | **Cierre bloqueado** (§C.1). Carga de resultados y recálculo sí son viables: `gl_guardar_resultado_interno` valida admin, estado, pertenencia al torneo, jornada cerrada, motivo de corrección, pertenencia al grupo, goles y estadísticas; escribe en `partidos_historial` (columnas verificadas) y recalcula; `recalcular_clasificacion_interno` aplica sanciones y usa el único compuesto correcto. |
| **C. Experiencia del jugador** | Login/registro (`js/ui/auth.js:136-170`), perfil y teléfono (`js/modulos/perfil.js:10-47,139-151`), grupo/posición (`js/core/gl.js:1079-1093,1183-1190`), inicio, tabla, cuadro, estadísticas de jornada/globales, calendario y `.ics`, contactos WhatsApp restringidos a compañeros (`js/modulos/calendario.js:197-225`), notificaciones (`js/modulos/notificaciones.js:159-199`). | Operable; los espacios vacíos son explícitos (“Sin grupo”, “Aún no hay clasificación…”, “Por programar”), no mocks. No hay vista no-admin de Resultados: el jugador consume resultados de forma indirecta. Campana de notificaciones sí tiene SELECT/UPDATE en producción (verificado), aunque acumula duplicados históricos. |
| **D. Administración y control** | Menús por nivel (`js/ui/menu.js:13-28,66,79,145`), exigencia de sesión (`js/app.js:18-31,141-154`), RPCs con `gl_es_admin()`, auditoría (`js/modulos/auditoria.js:73,523-538`), exportación CSV (`js/modulos/auditoria.js:500-518`), gestión de admins (`js/modulos/admin.js:1934,1960`). | Permisos reales correctos: `authenticated` tiene SELECT/INSERT/UPDATE/DELETE en `notificaciones`, `auditoria`, `auditoria_eventos`, `jornadas`, `partidos` y `grupo_jugadores`; RLS activa en todas las tablas base; REST con clave anon devuelve 200 para catálogos/tablas públicas y 401 para privadas. **Trazabilidad dividida** (§D.1). |

Nota: los archivos `mock-*.html` son arneses visuales aislados; `index.html` no los referencia. La carga real sale de `js/core/gl.js:130-138`. La revisión final de permisos y UI no encontró controles decorativos sin handler: el gate de sesión/admin (`js/app.js:18-31,141-164`; `js/core/gl.js:1129-1144`), el menú por nivel (`js/ui/menu.js:13-30,79`) y la gestión de administradores (Edge Function `admin-gestionar-admins`, solo superadmin) funcionan. El fallo del cierre está en la RPC, no en el botón.

---

## C) Bloqueantes

### C.1 — El cierre de jornada inserta en columnas que no existen y revierte toda la operación

**Evidencia (producción, lectura):**

- `pg_get_functiondef` de `public.gl_cerrar_jornada` confirma que el wrapper valida `gl_es_admin()` y delega en `public.gl_cerrar_jornada_interno(..., auth.uid())`.
- `gl_cerrar_jornada_interno`, paso 8, ejecuta:

  ```sql
  INSERT INTO auditoria (torneo_id, usuario_id, accion, tabla_afectada, detalle, created_at)
  VALUES (...);
  ```

- `information_schema.columns` de `public.auditoria` contiene solo: `id, torneo_id, accion, entidad_tipo, entidad_id, realizado_por, detalle, created_at`. **No existen `usuario_id` ni `tabla_afectada`.**
- El bloque interno es `EXCEPTION WHEN undefined_table THEN NULL`; un error de columna (`42703`) no se captura ahí. La función tiene un `EXCEPTION WHEN OTHERS THEN RETURN json_build_object('ok', false, 'error', SQLERRM)` al final: en PostgreSQL ese bloque revierte **todas** las escrituras anteriores del cierre.
- Ambos caminos de UI llaman al mismo RPC y rechazan `ok:false` (`js/modulos/admin.js:3401-3413`; `js/modulos/calendario.js:791-804`), así que el fallo será visible, pero el cierre no se producirá.

**Impacto:** es imposible cerrar una jornada real. No se publica el resumen, no se consolida la clasificación del cierre y cualquier resolución de pendientes queda revertida. Afecta al flujo B completo y al flujo D (control de jornadas).

**Corrección indispensable (NO ejecutada; requiere autorización explícita):** corregir el cuerpo de `gl_cerrar_jornada_interno` para registrar la auditoría con el esquema vigente —por ejemplo, delegando en `gl_registrar_auditoria` con la sobrecarga de 7 argumentos que escribe en `public.auditoria_eventos`— o usando las columnas reales de `public.auditoria`; ampliar el manejo de excepciones para que la auditoría nunca revierta la operación principal; versionar el cuerpo corregido en `supabase/`; y verificarlo primero en entorno de prueba con una jornada sintética. No se propone ejecutar SQL ni desplegar nada en producción dentro de esta fase.

No hay segundo bloqueante confirmado. La generación automática de fixture exige exactamente 12 jugadores activos por grupo (`migration-fixture-atomico.sql:92-159`, verificado en la definición de producción); hoy hay 1 y 0. Eso es un **prerrequisito de carga de datos**, no un defecto de código.

---

## D) Importantes

1. **D.1 — Auditoría escrita en una tabla y leída en otra.** `js/modulos/auditoria.js:73` consulta `public.auditoria_eventos`, pero `js/modulos/auditoria.js:529-538` llama a `gl_registrar_auditoria` con 6 argumentos, cuya sobrecarga en producción inserta en `public.auditoria`. Existe una segunda sobrecarga de 7 argumentos que sí inserta en `auditoria_eventos`, pero el cliente nunca la usa; no hay triggers de sincronización (consulta a `pg_trigger` sin filas). Consecuencia: la pantalla de Auditoría quedaría vacía aunque las acciones se registren en otra tabla. No bloquea la competición, pero deja el control sin trazabilidad visible. **Puede esperar al bloqueante**, aunque conviene resolverlo antes de cerrar la primera jornada real.

2. **D.2 — Notificaciones duplicadas y sin idempotencia en servidor.** 28 filas `jornada_abierta` con el mismo título (`Jornada 1 abierta`, 20 leídas) y 2 avisos `perfil_pendiente`. La deduplicación es solo de cliente (`js/modulos/notificaciones.js:335-337,382-386`); no hay unicidad en `notificaciones` (verificado en índices). Documentado en 3.18/3.19. No se borraron filas.

3. **D.3 — Cuentas y jugadores huérfanos.** `auth.users` tiene 3 cuentas: 2 confirmadas y vinculadas a los administradores; 1 sin confirmar y sin fila en `jugadores`. Además hay 1 jugador sin `user_id`, sin `torneo_id` y sin `numero`; los dos administradores no están asignados a grupo. Conviene revisar estas tres situaciones antes de cargar la nómina definitiva, sin borrar nada sin autorización.

4. **D.4 — Errores de lectura discretos.** `GL.partidos()` (`js/core/gl.js:1164-1173`) devuelve `[]` con `console.warn` si falla la consulta; Inicio, Perfil, Tabla, Cuadro, Estadísticas y Calendario muestran entonces estados vacíos indistinguibles de “no hay datos”. `js/core/gl.js:976-981` avisa solo por la primera consulta fallida.

5. **D.5 — Deuda de versionado y orden de migraciones.** El repositorio no contiene el DDL de las tablas deportivas base ni los grants/políticas vigentes de `notificaciones` y `auditoria_eventos`; esos objetos existen en producción (verificado), pero una reconstrucción desde cero fallaría. Además, `migration-fixture-atomico.sql:17-26,344-359` recrea `gl_generar_fixture` sin `gl_es_admin()` y sobrescribiría el wrapper endurecido si se reejecuta después de `migration-hardening-rpcs.sql`. En producción el wrapper correcto está instalado. No se planea ejecutar migraciones: registrar como riesgo de reproducibilidad.

6. **D.6 — Alcance amplio de lectura.** Cualquier `authenticated` puede leer todas las filas de `grupo_jugadores` y `sanciones`; la UI reduce la vista al grupo propio (`js/core/gl.js:1000-1017`), pero el permiso SQL es más amplio.

7. **D.7 — Sin cobertura end-to-end contra Supabase real.** La suite de FASE 3.21 (18 passed / 6 skipped) usa mocks/sintéticos; `tests/e2e/flujo.spec.js:4-20` entra siempre como admin. No hay prueba real del cierre de jornada ni del recorrido no-admin.

8. **D.8 — Reincorporación incompleta.** `js/modulos/admin.js:2773-2812` solo cambia `activo/rol/suspendido`: no revierte los resultados `1-0` generados en `:2535-2542`, no recalcula la clasificación y no exige motivo. Es un aviso, no una corrección deportiva.

9. **D.9 — Escrituras multi-paso sin compensación.** Guardar datos del torneo (`js/modulos/admin.js:1420-1428`), sanciones (`:2705-2729`), suspensión/expulsión (`:2918-2936`) y borrado de jugador (`supabase/functions/admin-crear-jugador/index.ts:119-135`) pueden dejar estado parcial si falla un paso posterior. No bloquean la carga inicial, pero requieren revisión manual.

10. **D.10 — Cambios de temporada y de jornadas sin migración ni depuración.** `gl_crear_torneo` mueve solo a los administradores al torneo nuevo (`supabase/migration-1.1.0.sql:57-81`) y el filtro por torneo activo (`js/core/gl.js:983-990`) deja fuera al plantel regular; reducir `total_jornadas` no elimina jornadas/partidos sobrantes (`js/modulos/admin.js:1409-1426`). Hoy hay un solo torneo activo: no crear otro durante la carga.

11. **D.11 — Invariantes y auditoría administrativa best-effort.** Capacidad de grupo no enforceada (`js/modulos/admin.js:819,1539,2357,2403`), suspensión/expulsión sin motivo obligatorio (`:2833-2968`), ayuda de auditoría que puede fallar en silencio (`:110-121`), alta rápida sin `auditar()` (`:1486-1488`) y registro que usa `user_id` como `jugador_id` en `:3169`. Los únicos en `nombre_usuario` y `grupo_jugadores` existen en producción, pero no están versionados (parte de D.5).

12. **D.12 — Apertura REST de jornadas virtuales sin RPC ni confirmación.** Calendario pinta las jornadas virtuales (`js/core/gl.js:1019-1034`) como abiertas y ofrece “Abrir” (`js/modulos/calendario.js:525-540,606-609,751-770`): la acción hace `update`/`insert` directo en `jornadas`, sin `GL.confirmar()` y sin pasar por un RPC transaccional, e inserta con `grupo_id: Mod.grupoId`. Después “Cerrar” se bloquea por falta de `id` (`:772-775`). Resultados sí trata esas filas como no abiertas (`js/modulos/resultados.js:250-304`). Es una inconsistencia de escritura, no solo visual.

---

## E) Mejoras no indispensables

- **E.1** Desfase de caché: `js/core/config.js:9` declara `1.3.5`, pero `index.html:86,91` carga `auth.js` y `app.js` con `?v=1.3.2` (sí está actualizado `menu.js` en `:85`). Riesgo de códigos mixtos en navegadores con caché.
- **E.2** `js/modulos/calendario.js:79-89` convierte una jornada con solo fecha a las 12:00, aunque el módulo dice no inventar horarios y la referencia es 11:00–21:00 (`js/core/config.js:18-22`).
- **E.3** Reclasificado como **D.12**: el criterio de jornadas virtuales difiere entre Calendario y Resultados y la apertura se hace por REST sin RPC ni confirmación.
- **E.4** Contratos de respuesta dispares entre Admin (`leerRpc`), Calendario y Resultados; `p_realizado_por`/`p_ingresado_por` se envían desde el cliente pero los wrappers los ignoran (comportamiento correcto, documentarlo).
- **E.5** `js/modulos/stats-globales.js:22-31` carga Chart.js desde CDN; si falla se muestra error (`js/modulos/stats-globales.js:422-425`).
- **E.6** “Disponibilidad” siempre muestra “Sin registrar” (`js/modulos/calendario.js:504-522`): está bien explicitado, pero es funcionalidad pendiente.
- **E.7** No existe vista pública consolidada de resultados ni exportación CSV/PDF de perfil/estadísticas. Depende de decisiones de producto; corresponde a la FASE 3.22 original como “Producto de temporada” (`docs/fase-3.18-auditoria-backlog.md:327-333`) y debe esperar a una temporada cerrada.
- **E.8** El archivo `supabase/migration-admin-1.0.18.sql:15-38` conserva correos/hash/IDs hardcodeados de seed; la RPC de producción valida contra `admin_acceso`, no contra esos valores. Rotar/secretizar en el futuro, sin tocar credenciales reales ahora.
- **E.9** Copia obsoleta en `js/ui/auth.js:100-102`: “Solo dos correos están autorizados”, aunque ya existe gestión dinámica de administradores (`js/modulos/admin.js:1013-1044,1925-1974`). Hoy hay 2 correos, pero el texto deja de ser cierto al agregar otro.
- **E.10** `js/ui/onboarding.js:40-48` afirma “Nadie más puede ver tu número”; la administración sí lo consulta para confirmar titularidad (`js/modulos/admin.js:1072-1076,1728-1747`). Ajustar la redacción de privacidad.

---

## F) Estado real de la base (solo lectura)

| Objeto | Estado verificado |
|---|---|
| `torneos` | 1 fila activa: `e48ae345-0d92-47f5-a1f6-ef986a5c4dbe`, `GOATS LATINOS`, temporada `2026`, `total_jornadas=22`, `reglamento=null`. |
| `grupos` | 2: `Grupo A` (`c3ea6e28…`) y `Grupo B` (`6ba598b6…`), ambos del torneo activo. No existe tabla `equipos`; la UI llama “equipos” a los grupos. |
| `jugadores` | 3: `Manuel` (`admin`, `super_admin`), `†ㅤGØA†` (`admin`) y `FC Mobile de Joaquín. 11sb` (`jugador`, sin `user_id`, sin `torneo_id`). Los 3 con `numero=null` y `avatar_url=null`. |
| `grupo_jugadores` | 1 fila: el jugador no admin en `Grupo A`. Los dos administradores, sin grupo. |
| `jornadas` / `partidos` / `clasificacion` / `sanciones` / `partidos_historial` / `bitacora_jornadas` / auditorías | 0 filas. |
| `notificaciones` | 30 filas: 28 `jornada_abierta` (“Jornada 1 abierta”, 20 leídas, `2026-11-25 15:25:53+00` → `2026-11-26 18:27:02+00`) y 2 `perfil_pendiente` (“2 jugador(es) sin grupo”). |
| `paises` | 16 códigos activos: `AR, BO, BR, CL, CO, CR, EC, GT, HN, MX, NI, PA, PE, PY, SV, VE`. |
| `admin_acceso` / `admin_credencial` / `sistema_config` | 2 accesos activos, sin bloqueo e `intentos_fallidos=0`, emails coincidentes con `jugadores`; 1 credencial; `sistema_config` solo con `bootstrap_completado=false`. |
| `auth.users` | 3 cuentas, 2 confirmadas y vinculadas a los admins (`last_sign_in_at` 2026-11-25 y 2026-11-26), 1 sin confirmar y sin jugador. `mailer_autoconfirm=false`, `disable_signup=false`. |
| Storage | Buckets públicos `avatares` y `capturas-partidos`; `storage.objects` sin filas (0 capturas, 0 avatares). |
| Seguridad | RLS activa en todas las tablas base. `authenticated` con SELECT/INSERT/UPDATE/DELETE en notificaciones/auditoría/jornadas/partidos/grupo_jugadores; sin INSERT de tabla en `jugadores` (sí columnas para registro propio). REST anon: 200 en torneos/grupos/jornadas/partidos/clasificacion/jugadores_publicos/paises; 401 en jugadores/grupo_jugadores/sanciones/notificaciones/admin_*. |
| RPCs | Ejecutables por `authenticated`: `recalcular_clasificacion`, `gl_guardar_resultado`, `gl_cerrar_jornada`, `gl_generar_calendario`, `gl_generar_fixture`, `gl_crear_torneo`, `gl_crear_temporada`, etc. Las `_interno` no. `gl_validar_acceso_admin` y `gl_nombre_disponible` accesibles por anon. |
| Edge Functions | 7 ACTIVE con `verify_jwt=true`: `admin-obtener-clave v7`, `analizar-captura v12`, `admin-crear-jugador v12`, `admin-promover v4`, `admin-gestionar-admins v6`, `eliminar-cuenta v6`, `admin-bootstrap v10`. |
|Índices| Únicos en `jornadas(torneo_id,grupo_id,numero)`, `partidos(torneo_id,grupo_id,jornada,local,visitante)`, `grupo_jugadores`, `clasificacion(torneo_id,grupo_id,jugador_id)`, `jugadores.nombre_usuario`, `jugadores.user_id`, E.164 canónico, `paises.codigo`, `admin_acceso.email`. No hay único en `notificaciones`, `grupos.nombre` ni `jugadores.numero`. |

---

## G) Orden recomendado de carga (propuesta, no ejecutada)

1. **Corregir primero el bloqueante C.1** en entorno de prueba, con autorización; verificar el cierre de una jornada sintética y recién después publicar la corrección. Sin esta corrección, no iniciar la competición.
2. Preflight de solo lectura: torneo activo, grupos, índices únicos, RLS/grants y cuentas huérfanas (§D.3). Revisar la cuenta sin confirmar y el jugador sin cuenta/torneo/número antes de dar de alta la nómina definitiva.
3. Confirmar el torneo y los grupos existentes; **no crear otro torneo** (`gl_crear_torneo` archiva el activo). Completar `reglamento` y `total_jornadas` si correspondiera, con autorización.
4. Dar de alta jugadores reales desde Administración (Edge Function `admin-crear-jugador`), con país, teléfono válido, zona horaria, grupo y número. Necesarios **12 activos por grupo** antes de generar el fixture automático; el jugador sin grupo debe quedar asignado.
5. Generar el cuadro (`gl_generar_fixture` / `gl_generar_calendario`): esperar 22 jornadas por grupo y 264 partidos. Comprobar que no haya resultados previos (hoy no los hay).
6. Programar fechas, apertura y límite de cada jornada; revisar solapamientos y zona `America/Managua`.
7. Abrir una jornada real, cargar resultados con captura y verificar Tabla, Estadísticas e Historial. No cargar datos de prueba en producción.
8. Cerrar la jornada usando el RPC corregido; verificar que se consolide la clasificación y que no haya rollback.
9. Notificaciones: mantener la deduplicación de cliente; no generar nuevas duplicando jornadas; cualquier limpieza de las 28 filas existentes requiere autorización explícita.
10. Cierre de fase: verificación final de solo lectura y exportación CSV de auditoría, ya con la corrección aplicada.

---

## H) Pruebas

- **FASE 3.22:** no se ejecutaron pruebas funcionales ni escrituras: el alcance fue de auditoría y lectura. No se generaron datos sintéticos en producción.
- **Antecedente vigente (FASE 3.21):** `18 passed / 6 skipped`, `EXIT=0`; seis verificadores visuales correctos; Actions y Pages verificados. Esa cobertura usa fixtures sintéticos y mocks, **no valida el cierre real**.
- **Verificación recomendada tras la corrección autorizada, en entorno de prueba:** (a) llamar a `gl_cerrar_jornada` con una jornada real y 0 pendientes, confirmando `ok=true`, estado `cerrada`, historial y clasificación; (b) repetir con pendientes resueltos y con jornada sin fila previa; (c) forzar un fallo de auditoría para confirmar que no revierte el cierre; (d) smoke no-admin de perfil/tabla/calendario/notificaciones; (e) matriz anon/authenticated/admin de RPCs y tablas; (f) comprobar que la pantalla de Auditoría muestra lo que la RPC registra.
- Comando de referencia de la suite existente: `& node node_modules/@playwright/test/cli.js test --reporter=dot`.

---

## I) Limitaciones

- El error del bloqueante se determina por el cuerpo SQL leído en producción y el esquema real; **no se ejecutó el RPC** porque eso exigiría escribir. El mensaje esperado es `42703: column "usuario_id" of relation "auditoria" does not exist`.
- Los cuerpos `_interno` no están versionados en `supabase/`; la evidencia procede de `pg_proc` en producción.
- No se consultaron logs de Edge Functions ni contenido de capturas (no hay objetos en Storage).
- No se verificó el valor de `admin_credencial.hash`, solo su existencia y los accesos activos.
- La base ya contiene datos reales: el informe no asume que esté vacía y no propone vaciado ni migración.
- La UI puede tener caché mixta por el desfase de versiones (§E.1).
- No se inició FASE 3.23 ni se realizó ningún cambio en el repositorio.

---

## J) Recomendación final

**C. NO LISTO.**

No se recomienda empezar a usar GOAT-LATINOS con datos reales de competición hasta corregir **C.1** (cierre de jornada). Los datos iniciales pueden revisarse y prepararse, y las consultas de liga funcionan, pero el recorrido de competición no puede completarse: el cierre siempre revierte.

**Indispensable antes de datos reales:** corregir y verificar en entorno de prueba el INSERT legacy de `gl_cerrar_jornada_interno`, con autorización explícita; no ejecutar SQL, migraciones ni despliegues en producción desde esta fase.

**Puede esperar sin impedir el arranque:** D.1 (auditoría partida), D.2 (duplicados de notificaciones), D.3 (cuentas/jugadores huérfanos, a revisar antes de la nómina), D.4–D.12 (lectura silenciosa, deuda de versionado, alcance RLS, cobertura de pruebas, reincorporación, escrituras parciales, cambios de temporada/jornadas, invariantes administrativas y apertura REST de jornadas virtuales) y todas las mejoras de §E. D.1 conviene resolverlo antes de cerrar la primera jornada real para no perder trazabilidad visible; D.10 implica no crear un torneo nuevo durante la carga.

**Condición para revisar la clasificación:** una vez corregido C.1 y verificada una jornada real en entorno de prueba, el estado pasaría como mínimo a **B. LISTO CON OBSERVACIONES**, con D.1–D.3 como observaciones a planificar. No se propone saltar directamente a A mientras la trazabilidad y la idempotencia de notificaciones sigan mitigadas solo en cliente.

**Estado de entrega:** sin commits, sin pushes, sin cambios en Supabase y sin ramas adicionales; `HEAD=5939b45ea921649e9fb4cb9abcc45a8acd15f78b`, `git status --porcelain` vacío al inicio de la auditoría (salvo la creación de este documento).
