# FASE 3.12 — Auditoría funcional integral

## 1. Estado inicial y alcance

- Repositorio: `main`, limpio y sincronizado con `origin/main` en `27864ed81764ae5007a0d93e8289008abd79c7dc`.
- Última fase publicada: FASE 3.11; dos ejecuciones de GitHub Actions verificadas como exitosas para sus commits.
- App pública cargada con caché invalidada. Se detectó un error `400/42703` en la consulta anónima a `jugadores_publicos`.
- Supabase: solo consultas de lectura mediante el editor del panel y REST con clave pública/anon. No se ejecutaron `INSERT`, `UPDATE`, `DELETE`, DDL, cambios de RLS ni cambios de permisos.
- No se crearon datos de prueba en producción. Conteos leídos: 3 jugadores, 2 grupos, 1 relación jugador-grupo, 0 jornadas, 0 partidos y 0 filas de clasificación.
- Por la ausencia total de jornadas y partidos, **no fue posible recorrer un torneo real completo**. El recorrido jugadores → grupos → fixture → resultados → tabla se verificó por contrato de código, definiciones de RPC desplegadas y lectura de catálogo; las escrituras deportivas quedan pendientes de un entorno con datos autorizados.
- Auditoría complementaria de mensajes/notificaciones, perfil/cuentas y centro de control realizada en modo solo lectura sobre JS/HTML/CSS/SQL/tests/docs. No contactó Supabase ni modificó archivos.

## 2. Módulos auditados

| Módulo | Ámbito | Resultado |
|---|---|---|
| A | Jugadores: alta, edición, eliminación, teléfono, búsqueda y estados | Operativo; hallazgos de suspensión, borrado no atómico y reglas de nombre |
| B | Equipos/grupos: miembros, cobertura, asignación y movimiento | Operativo; hallazgos de alcance de borrado, contadores y falta de transacción |
| C | Fixture y jornadas | Operativo con RPC atómica; hallazgo de jornadas 23-30, doble camino de cierre y escrituras directas que eluden validaciones |
| D | Resultados | Operativo; hallazgos de motivo de corrección, estados de expulsión y cuerpo de RPC no versionado |
| E | Tabla de posiciones | Operativa; criterios visibles pts/dif/gf, sin desempate canónico documentado |
| F | Estadísticas | Operativas; corregido `ReferenceError` en el gráfico de efectividad |
| G | Mensajes/notificaciones | Generador local verificado; notificaciones con escritura directa, contrato backend no acreditado y éxito asumido |
| H | Perfil/cuentas | Whitelist de edición, RLS y borrado protegido verificados; MFA documentado pero no aplicado en código |
| I | Centro de control/administración | Revisado; hallazgos de consistencia operativa, atomicidad y bypass de triggers por GUC |

## 3. Hallazgos priorizados

| ID | Gravedad | Módulo | Archivo / función | Evidencia | Estado |
|---|---|---|---|---|---|
| F-01 | Crítico | Arranque público | `js/core/gl.js` → `_columnas.jugadores_publicos` | La app pedía `zona_horaria`, columna inexistente en la vista; REST devolvía `400/42703` | Corregido |
| F-02 | Alto | Integración pública | `js/core/gl.js` → `cargarContexto()` | `anon` recibía `401` al consultar `grupo_jugadores` y `sanciones`; FASE 2.3 revocó su `SELECT` | Corregido en cliente; decisión de permisos pendiente |
| F-03 | Alto | Resultados | `js/modulos/resultados.js` → `guardarResultado()` | Enviaba `p_motivo: null` incluso al corregir; el RPC exige motivo no nulo | Corregido |
| F-04 | Alto | Resultados | `js/core/config.js` → `ESTADOS_PARTIDO`; `gl_guardar_resultado_interno` | La UI ofrece `expulsion_local/visitante`, pero el RPC solo acepta `jugado`, walkovers y doble ausencia | Pendiente de decisión SQL |
| F-05 | Alto | Estadísticas | `js/modulos/stats-globales.js` → `graficoEfectividad()` | `data: ptsDatos` hacía fallar `new Chart()`; la corrección posterior era inalcanzable | Corregido |
| F-20 | Alto | Notificaciones | `js/modulos/notificaciones.js` → `_marcarLeida()`, `_marcarTodas()`, borrado | UPDATE/DELETE directos; en el repo solo aparece la política `notif_insert` (INSERT admin). El filtro por `jugador_id` es solo de cliente | Parcialmente corregido; contrato RLS/grants pendiente de verificación |
| F-21 | Alto | Eliminatorias | `js/modulos/eliminatorias.js` → ida/vuelta, partido extra, nueva ronda | Dos `.update()` separados; el propio aviso admite que la ida puede quedar guardada si falla la vuelta. Sin RPC transaccional | Pendiente de autorización SQL |
| F-06 | Medio | Jornadas | `js/core/gl.js` → `jornadaAbiertaNumero()` | Limitaba la búsqueda a 22 aunque `total_jornadas` permite hasta 30 | Corregido |
| F-07 | Medio | Grupos | `js/modulos/admin.js` → `cambiarGrupoRapido()`, `modalGrupo()` | `delete().eq('jugador_id', id)` podía borrar membresías de otras temporadas | Corregido |
| F-08 | Medio | Grupos | `js/modulos/admin.js` → selectores de grupo | Mostraban `clasificacion.length` en vez de relaciones reales; temporada nueva mostraba 0 | Corregido |
| F-09 | Medio | Jugadores | Edge Function `admin-crear-jugador` | Borrado dependiente encadenado sin revisar errores parciales | Pendiente de autorización |
| F-10 | Medio | Jugadores | `js/modulos/admin.js` → flujo de suspensión | No existe reactivación en UI cuando se agotan los partidos de suspensión | Pendiente de decisión de regla |
| F-11 | Medio | Grupos | `js/modulos/admin.js` → `cambiarGrupoRapido()` | Ruta rápida omite validaciones de torneo finalizado, ventana, expulsado y mismo grupo | Pendiente de decisión |
| F-12 | Medio | Equipos | `js/modulos/admin.js` → `e6Tarjeta()` | Cobertura cuenta suspendidos/expulsados como asignados | Pendiente de decisión de regla |
| F-13 | Medio | Jornadas manuales | `supabase/migration-1.1.0.sql` | No exige plantel completo ni evita repetir parejas entre jornadas | Pendiente de autorización SQL |
| F-14 | Medio | Jornadas | `js/modulos/calendario.js` → `cambiarEstado()` | Cierre/reapertura por REST directo convive con `gl_cerrar_jornada` | Pendiente de unificación |
| F-22 | Medio | Jornadas | `js/modulos/calendario.js`, `js/modulos/admin.js` | Insert/update/abrir/cerrar/programar por REST eluden `gl_guardar_jornada_manual`, que sí valida plantel, pertenencia y no repetición | Pendiente de autorización SQL |
| F-23 | Medio | Grupos y sanciones | `js/modulos/admin.js` → `modalGrupo()`, sanción, suspensión | `delete` + `insert`, e insert + update + resolución de partidos + recálculo se orquestan desde el navegador sin transacción | Pendiente de autorización SQL |
| F-24 | Medio | Seguridad | `migration-seguridad-2.3.sql`, `migration-1.1.0.sql` | Triggers omiten validación cuando el rol efectivo es `service_role`; RPC admin-only usan `set_config('request.jwt.claim.role', ...)`. No se encontró ruta no admin que lo active | Pendiente de endurecimiento |
| F-25 | Medio | Resultados | `supabase/migration-hardening-rpcs.sql` | Renombra y envuelve `gl_guardar_resultado`, pero el cuerpo de `gl_guardar_resultado_interno` no está versionado; no se puede verificar estáticamente captura y transacción | Pendiente de versionado |
| F-26 | Medio | Perfil/cuentas | `supabase/functions/admin-promover/index.ts` | Comentario anunciaba TOTP/MFA; el código solo valida JWT y rol `super_admin` | Comentario corregido; verificación AAL2 pendiente |
| F-15 | Bajo | Jugadores | `admin.js`, `gl.js`, `supabase.js`, `migration-registro-seguro.sql` | Nombre 2-32 en administración, 3-24 en registro/perfil y ayuda visual más restrictiva | Pendiente de decisión |
| F-16 | Bajo | Perfil | `js/modulos/admin.js` → edición | “Número del jugador” visible para admin normal pero trigger rechaza su cambio | Pendiente de decisión |
| F-17 | Bajo | Jugadores | `js/modulos/admin.js` → filtros | Filtro “Expulsado” queda sin filas por venir de `GL.jugadores()` | Pendiente |
| F-18 | Bajo | Repositorio SQL | `supabase/migration-hardening-rpcs.sql` | Funciones `*_interno` no están versionadas en el repo (relacionado con F-25) | Pendiente |
| F-19 | Bajo | Tabla | `js/modulos/tabla.js` → `indicadorZona()` | Cortes top 6 / últimos 3 hardcodeados; con planteles pequeños la zona media puede desaparecer | Pendiente de regla |
| F-27 | Bajo | Documentación | `docs/CONFIGURACION.md` → sección 8 | Decía que la vista pública exponía `zona_horaria`; solo existe en `public.jugadores` | Corregido |
| F-28 | Bajo | Estadísticas | `js/modulos/stats-globales.js` → fallback de Chart.js | Se carga copia local desde `index.html`, pero si falta se inyecta CDN remoto | Pendiente |
| F-29 | Bajo | Notificaciones | `js/modulos/notificaciones.js` → Realtime | Suscripción solo a `INSERT`; otra pestaña puede quedar con contador distinto | Pendiente |
| F-30 | Bajo | Mensajes | `js/modulos/mensajes.js` → preflight | El texto indicaba “Corregí estos puntos en Supabase”, poco accionable para el administrador | Corregido |

## 4. Clasificación por gravedad

- **Crítico (1):** fallo que impide el arranque limpio de la experiencia pública.
- **Alto (6):** error de consulta frecuente, rechazo sistemático de una operación, módulo que no se dibuja o escritura sin garantía de integridad.
- **Medio (14):** inconsistencia funcional u operativa con impacto parcial; depende de SQL o de una decisión de regla.
- **Bajo (9):** ambigüedad, detalle de UX o deuda documental sin pérdida de datos.

Criterio: se considera más grave cuanto más probable sea que un usuario real lo encuentre y mayor sea el impacto sobre integridad o visibilidad de datos. Ningún hallazgo implicó pérdida de datos en esta auditoría. Los hallazgos pendientes de SQL **no se aplicaron**: se listan para decisión y autorización.

## 5. Evidencias

- Consulta anónima a `jugadores_publicos` con `zona_horaria`: `400`, código `42703`, `column jugadores_publicos.zona_horaria does not exist`.
- Definición desplegada de la vista: 8 columnas deportivas, sin `zona_horaria`, `email`, `telefono`, `user_id`, `rol` ni `super_admin`.
- Consulta anónima corregida con las 8 columnas reales: `200`, 3 filas, columnas `id,nombre_usuario,pais,avatar_url,activo,suspendido,torneo_id,numero`.
- Consultas anónimas a `grupo_jugadores` y `sanciones`: `401`. ACL de `anon` sin `r`; RLS con políticas `gl_read` inactivas por falta de `GRANT SELECT`. En cambio `authenticated` sí tiene `SELECT` en ambas tablas.
- Definición desplegada de `gl_guardar_resultado_interno`: valida `ARRAY['jugado','walkover_local','walkover_visitante','doble_ausencia']`; exige `p_motivo` para correcciones; llama a `recalcular_clasificacion` en el paso 12. Queda descartada la sospecha de falta de recálculo tras guardar.
- Definición desplegada de `gl_cerrar_jornada_interno`: normaliza jugadores expulsados a walkover `1-0` y también recalcula.
- Definición desplegada de `recalcular_clasificacion_interno`: calcula PJ/PG/PE/PP/GF/GC/Dif/Pts con penalizaciones; no devuelve `posicion` ni aplica `ORDER BY`.
- Recarga de la copia local tras las correcciones: sin nuevos errores `401`/`42703` en consola. La comprobación funcional del modo invitado se apoya en REST directo y en pruebas de contrato porque el arranque de la app exige sesión para mostrar las vistas; **no se presentó como E2E con sesión real**.
- Notificaciones: `js/modulos/notificaciones.js` (borrado y marcar leídas) usa `.delete()`/`.update()` directos; en el repo solo aparece `notif_insert` en `migration-fix-rls-recursion.sql`. No se consultó el catálogo real de políticas de UPDATE/DELETE, por lo que F-20 es un hallazgo a verificar, no una explotación confirmada.
- Eliminatorias: `js/modulos/eliminatorias.js` guarda ida y vuelta con dos `.update()` separados e inserta rondas y partidos extra por REST; RLS de `partidos` exige admin, pero no hay RPC que garantice atomicidad deportiva.
- Jornadas: `js/modulos/calendario.js` y `js/modulos/admin.js` escriben `jornadas` directamente aunque `gl_guardar_jornada_manual` contiene validaciones de negocio.
- Seguridad: `migration-seguridad-2.3.sql` exime de triggers cuando el rol efectivo es `service_role`; el patrón `set_config` aparece en RPC verificadas como admin-only y en migraciones manuales.
- Perfil: `js/core/supabase.js` aplica whitelist de campos; RLS y trigger protegen el perfil; `admin-promover` solo valida JWT y rol, sin comprobación explícita de AAL2.
- Pruebas existentes (`tests/fase-2.2.test.js`, `fase-2.3.test.js`, `supabase/tests/fase-2.3.sql`) declaran explícitamente que son modelos/plantillas y que el SQL real con roles, RLS y txid queda pendiente.

## 6. Correcciones aplicadas

1. `GL._columnas.jugadores_publicos` alineado con la vista desplegada (8 columnas).
2. `cargarContexto()` evita consultas vedadas a `anon` y deriva miembros desde `clasificacion`, que sí es pública.
3. `jornadaAbiertaNumero()` usa `torneo.total_jornadas` con respaldo en 22.
4. Formulario de resultados solicita motivo cuando el partido ya tiene estado; `p_motivo` deja de ser `null` en correcciones.
5. Gráfico de efectividad usa `ptsPct`; se elimina la asignación muerta posterior.
6. Retirada/movimiento de grupo acotada a los grupos del torneo activo.
7. Selectores de grupo cuentan relaciones reales de `grupo_jugadores`.
8. Notificaciones: se verifica el error de cada `.update()`/`.delete()`; el estado local y el badge solo cambian si la escritura se completó, y el aviso de borrado se muestra solo cuando hubo borrados reales.
9. Texto del generador de mensajes: instrucción accionable en Administración/Jornadas/Perfil.
10. `admin-promover`: comentario alineado con el código (MFA no verificado).
11. `docs/CONFIGURACION.md`: corregidas las dos referencias a `zona_horaria` en la vista pública.

No se cambiaron esquemas, RLS, permisos, reglas de negocio ni datos de producción.

## 7. Archivos modificados

- `js/core/gl.js`
- `js/modulos/admin.js`
- `js/modulos/resultados.js`
- `js/modulos/stats-globales.js`
- `js/modulos/notificaciones.js`
- `js/modulos/mensajes.js`
- `supabase/functions/admin-promover/index.ts` (solo comentario)
- `docs/CONFIGURACION.md`
- `tests/fase-3.12.test.js` (nuevo)
- `docs/fase-3.12-auditoria-funcional.md` (nuevo)

## 8. Pruebas ejecutadas

- Vitest: 7 archivos, 93 pruebas, todas pasadas (incluye 12 pruebas nuevas de FASE 3.12).
- Sintaxis: `node --check` sobre 26 archivos `js/**/*.js`, sin errores.
- Recarga real en navegador contra copia local servida en `127.0.0.1`: sin nuevos errores de consola.
- REST anónimo contra Supabase: consulta a `jugadores_publicos` con las 8 columnas reales → `200` y 3 filas.
- Consultas Supabase solo lectura para functions, ACL, RLS, vista y conteos.
- Playwright: no ejecutado; el entorno tiene Node 18.4.0 y la versión instalada exige Node 20 o superior.
- No se ejecutaron pruebas SQL mutantes ni se escribieron datos. Las plantillas SQL existentes siguen siendo contratos/plantillas, no ejecución real.

## 9. Resultados

- Arranque público sin `400/42703`.
- Sin `401` esperables en la carga anónima.
- Correcciones de resultado alineadas con la regla existente del RPC.
- Gráfico de efectividad dibujado sin excepción.
- Jornadas 23-30 visibles para entrada de resultados.
- Movimientos de grupo preservan historial de otras temporadas.
- Contadores de grupo coherentes con las relaciones reales.
- Notificaciones: no se muestra éxito cuando la escritura falló.
- Mensajes: el bloqueo por datos sin verificar indica dónde corregir.
- Sin cambios en datos de producción.

## 10. Pendientes y decisiones requeridas

1. Definir si los estados `expulsion_*` deben aceptarse en `gl_guardar_resultado_interno` (cambio SQL autorizado) o si se retiran de la UI, preservando el flujo de sanciones que ya normaliza a 1-0.
2. Verificar las políticas/grants reales de `notificaciones` para SELECT/UPDATE/DELETE y, si faltan, crear RPC `SECURITY DEFINER` con `auth.uid()`; no restaurar acceso amplio a `anon`.
3. Migrar eliminatorias a RPC transaccionales de resultado y generación de rondas, con validaciones de marcador y desempate en servidor.
4. Unificar programación, apertura y cierre de jornadas en RPCs validadas, sin convivir con REST directo.
5. Hacer transaccionales y validar en servidor el cambio de grupo, la sanción y la suspensión; hoy la ventana de primera semana solo vive en la UI.
6. Reemplazar el patrón `set_config(... service_role ...)` por un mecanismo de mantenimiento con autorización dura por rol y limpieza en `exception`.
7. Versionar el cuerpo completo de `gl_guardar_resultado_interno` y de las demás funciones `*_interno`, con pruebas SQL reales.
8. Definir la reactivación de suspendidos y si el borrado de cuenta Auth debe ser atómico.
9. Alinear `admin-promover` con MFA: verificar AAL2 en la Edge Function o documentar explícitamente que MFA no se aplica.
10. Decidir si `anon` debe recuperar `SELECT` sobre `grupo_jugadores`/`sanciones` o conservarse el fallback actual desde `clasificacion`.
11. Decidir si la ruta rápida de asignación debe aplicar las mismas reglas que `modalGrupo()` y qué cuenta como “equipo completo” con suspendidos/expulsados.
12. Formalizar un orden de desempate canónico: hoy el cliente usa puntos, diferencia y goles a favor; la base almacena estadísticas sin orden ni `posicion`.
13. Priorizar Chart.js local antes del CDN y ampliar Realtime de notificaciones a `UPDATE`/`DELETE` o recargar al enfocar la pestaña.
14. Ejecutar Playwright con Node 20+ y credenciales de prueba autorizadas para cubrir escrituras administrativas y un torneo completo en entorno no productivo.

## 11. Recomendaciones

- Mantener el principio de menor privilegio: no restaurar `GRANT SELECT` a `anon` sin una necesidad funcional demostrada.
- Si se autoriza SQL, empaquetar los cambios en una migración con transacción y plantilla de validación con `ROLLBACK`; ejecutar primero en base desechable.
- Publicar primero estas correcciones de cliente y verificar Actions/Pages antes de cualquier cambio de backend.
- Distinguir en futuros informes entre pruebas unitarias con mocks, contratos estáticos, REST anónimo real, SQL real con roles y E2E con sesión real.
- Documentar reglas de desempate, ventanas de cambio y significado de “equipo completo” antes de modificar cálculos o validaciones.
