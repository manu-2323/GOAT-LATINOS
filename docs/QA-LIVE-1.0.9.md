# QA en producción — versión 1.0.9

Fecha: 24/11/2026  
Sitio: https://manu-2323.github.io/GOAT-LATINOS/  
Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`  
Commit publicado: `e85da1a` (el despliegue final de Pages fue `87c45e2`, que conserva el mismo contenido).

## 1. Estado general

| Verificación | Resultado |
|---|---|
| Versión en vivo (`GLManager.version`) | `1.0.9` |
| Login como primera pantalla | OK — `#vista` queda vacía hasta autenticar |
| Cuentas `auth.users` | 24 |
| Identidades `email` | 24 |
| Jugadores con `user_id` | 24/24 |
| Administradores / super_admin | 3 / 1 (Manuel) |
| Partidos históricos | 36 (J1–J3) |
| Clasificación histórica | 24 filas |
| Errores de consola en carga limpia | 0 |

## 2. Cuentas de acceso

- Las 24 cuentas existen en `auth.users`, están confirmadas y vinculadas a `public.jugadores.user_id`.
- Los 3 administradores (`Manuel`, `†ㅤGØA†`, `ツ ƈнєяy`) usan la clave de administración; los 21 restantes usan la clave de jugador.
- Verificación SQL: los 24 hashes bcrypt coinciden con la clave asignada según su rol.
- **Detalle técnico importante:** en Supabase, `auth.users.instance_id` debe ser
  `00000000-0000-0000-0000-000000000000`. Las cuentas insertadas quedaron con `NULL` y GoTrue
  devolvía `invalid_credentials` aunque el hash era correcto. Ya se corrigieron las 24 filas.
  Cualquier script futuro que cree usuarios por SQL debe setear ese campo.

No se guardaron contraseñas en el repositorio, docs ni logs de aplicación.

## 3. Recorrido de UI ejecutado (solo acciones seguras)

Sesión administrador (Manuel):

- Login con cuenta real → overlay se cierra, se renderiza la tabla y aparecen las opciones de dirección.
- Navegación por `Tabla`, `Fixture`, `Estadísticas`, `Estadísticas globales` y `Mi Perfil`: correcta.
- Pestañas `Grupo A` / `Grupo B` de tabla y fixture: correctas.
- Selector de jornada del fixture (J3), botones J1..J22 y filtro `Solo mis partidos`: correctos.
  - Con Manuel en Grupo A y J3, aparece `Joaquín.11sb 1 - 3 Manuel`.
  - Con Grupo B y `Solo mis partidos`, aparece el mensaje “No tenés partidos en esta jornada”.
- Cierre de sesión → vuelve el login y `#vista` se limpia.
- Recarga con sesión activa → la sesión persiste y no reaparece el login.

Sesión jugador (Caicedo):

- Login con cuenta real → rol `jugador`, sin enlaces de `Resultados`, `Jornadas`,
  `Administración` ni `Mensajes`.
- Tabla con marcador `TÚ` al propio jugador, perfil individual y estadísticas: correcto.
- Recarga con sesión activa → sesión persistida.

No se ejecutaron acciones de escritura desde la UI: ni guardado de resultados, ni cierre de
jornadas, ni regeneración de fixture, ni eliminatorias, ni borrado de cuentas/capturas.

## 4. Hallazgos y mejoras propuestas

### 4.1 RESUELTO — Criterio: el resultado real manda sobre la tabla copiada

El usuario aclaró: «yo perdí con Joaquín 3-1 … aplica lógica». Se priorizó el resultado real
declarado y los marcadores explícitos por encima de la clasificación copiada.

Marcadores corregidos en `public.partidos`:

| Jornada | Partido | Valor final |
|---|---|---|
| J3 | Joaquín.11sb vs. Manuel | **3-1** (antes 1-3) |
| J2 | Romero99 vs. Jonna | **3-1** (antes 2-1) |
| J2 | Caicedo vs. Dairo | **4-1** (antes 2-1) |
| J2 | URIELantuna vs. †ㅤGØA† | **1-1** (antes 3-1) |

Luego se recalcularon las 24 filas de `public.clasificacion` por SQL, replicando la lógica de
`recalcularClasificacion()` (3 puntos por victoria, 1 por empate, `dif = gf - gc`). No se pudo
hacer desde la UI con sesión de jugador porque RLS bloquea la escritura de `clasificacion`, que es
el comportamiento esperado.

Clasificación final del Grupo A verificada en el sitio live:

| # | Jugador | PJ | PG | PE | PP | Goles | Dif | Pts |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | PSG | 3 | 3 | 0 | 0 | 12:3 | +9 | 9 |
| 2 | Joaquín.11sb | 3 | 3 | 0 | 0 | 10:2 | +8 | 9 |
| 3 | †ㅤGØA† | 3 | 2 | 1 | 0 | 6:2 | +4 | 7 |
| 4 | Romero99 | 3 | 2 | 0 | 1 | 7:3 | +4 | 6 |
| 5 | Caicedo | 3 | 2 | 0 | 1 | 6:4 | +2 | 6 |
| 6 | URIELantuna | 3 | 1 | 1 | 1 | 3:3 | 0 | 4 |
| 7 | Waltercinho7 | 3 | 1 | 1 | 1 | 2:2 | 0 | 4 |
| 8 | Jonna | 3 | 1 | 0 | 2 | 3:5 | -2 | 3 |
| 9 | TheKing | 3 | 1 | 0 | 2 | 2:6 | -4 | 3 |
| 10 | Manuel | 3 | 0 | 1 | 2 | 2:5 | -3 | 1 |
| 11 | Escorpioncr7 | 3 | 0 | 0 | 3 | 3:10 | -7 | 0 |
| 12 | Dairo | 3 | 0 | 0 | 3 | 1:12 | -11 | 0 |

Recarga realizada después del recálculo: la tabla live muestra estos valores y no hay errores de
consola. `supabase/carga-historica-2024.sql` quedó actualizado para reproducir este estado.

### 4.2 RESUELTO — “Generar fixture” no puede duplicar datos

`js/modulos/fixture.js` ya contiene la guarda: si existe cualquier resultado, bloquea la
regeneración; si solo hay partidos pendientes, pide confirmación y los borra antes de insertar.

Además se ejecutó `supabase/migration-unicidad-historica.sql` en producción. Verificado en
`pg_indexes`:

- `jornadas_torneo_grupo_numero_key` → `UNIQUE (torneo_id, grupo_id, numero)`
- `partidos_torneo_grupo_jornada_local_visita_key` → `UNIQUE (torneo_id, grupo_id, jornada, local_id, visitante_id)`

Antes de crearlos había 0 duplicados (6 jornadas, 36 partidos), por lo que no se perdió ni se
modificó ningún dato.

### 4.3 RESUELTO — Perfil de administrador

`js/modulos/perfil.js` inicializa `Mod.jugadorId = Auth.jugador.id`, de modo que Manuel arranca en
su propio perfil y el selector `#sel-jugador` viene marcado con su nombre. Confirmado en el código
publicado.

### 4.4 CORREGIDO — Etiqueta de J4

`js/modulos/tabla.js` detecta las jornadas virtuales (`jornada.virtual`, generadas en memoria para
J4–J22) y muestra `Pendiente de programación` en vez de `Jornada Abierta`. El mensaje de la tarjeta
pasa a ser «Esta jornada todavía no tiene partidos programados». Este cambio se incluye en el push
final de esta revisión.

### 4.5 BAJO — Registro visible con cupos preasignados

El overlay ofrece “Registrate”, pero los 24 correos ya están precargados y
`gl_correo_existe()` bloqueará esos correos; además el alta queda pendiente de aprobación.

**Recomendación:** ocultar el registro en el login obligatorio o cambiar el texto a
“¿No tenés cuenta? Contactá al administrador”.

### 4.6 BAJO — Marcador pendiente de revisión

`Neymar 1-1 S.A.B.B` quedó marcado como `REVISAR` porque el dato original era ambiguo.
Requiere confirmación antes de usar el recálculo automático.

## 5. Seguridad

- `config.js` solo contiene URL y anon key públicas.
- No hay `SERVICE_ROLE_KEY`, `GEMINI_API_KEY` ni contraseñas en el frontend, docs o repo.
- `.gitignore` ahora excluye `supabase/.temp/`.
- Los secrets continúan configurados únicamente como Secrets de Supabase Edge Functions.

## 6. Conclusión

El sistema publicado funciona: autenticación obligatoria, roles, navegación, filtros y
estadísticas responden correctamente en el sitio live. La inconsistencia histórica quedó
resuelta aplicando el criterio del usuario: los resultados reales mandan y la clasificación se
recalculó desde `partidos`. Queda un único dato pendiente: confirmar `Neymar 1-1 S.A.B.B` (J2,
Grupo B), que seguirá marcado como `REVISAR` hasta nueva indicación.
