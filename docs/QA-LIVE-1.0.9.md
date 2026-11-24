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

### 4.1 CRÍTICO — La clasificación cargada no coincide con los partidos

`public.clasificacion` contiene la tabla oficial informada, pero los marcadores de `public.partidos`
son deducidos. Al recalcular, la tabla visible cambiaría. Ejemplos del Grupo A:

| Jugador | Según partidos | Tabla oficial |
|---|---:|---:|
| Joaquín.11sb | 6 pts, 8:4, 2V-0E-1D | 7 pts, 8:4, 2V-1E-0D |
| Manuel | 4 pts, 4:3, 1V-0E-1D | 2 pts, 4:5, 0V-2E-1D |
| TheKing | 3 pts, 2:6, 1V-0E-2D | 4 pts, 5:6, 1V-1E-1D |
| Waltercinho7 | 4 pts, 2:2 | 4 pts, 4:5 |

Grupo B:

| Jugador | Según partidos | Tabla oficial |
|---|---:|---:|
| Fabian10 | 5 pts, 8:5 | 7 pts, 5:2 |
| Juliocesar | 6 pts, 6:5 | 0 pts, 1:11 |
| Eber504 | 0 pts, 0:11 | 1 pt, 3:8 |
| Warriburrito | 3 pts, 3:4 | 4 pts, 3:3 |

Además, los propios datos de origen son contradictorios: por ejemplo, Joaquín no puede tener
8:4 y 7 puntos con una victoria 2-1 en J2 y un empate en J3 (esa combinación da 8:2). Lo mismo ocurre con Romero99/Jonna y con varios renglones del Grupo B.

**Recomendación:** conseguir los marcadores oficiales de J2 y J3 desde la app Winner (o las
capturas faltantes) y recargar `partidos`. Hasta entonces, evitar guardar resultados: existe
`recalcularClasificacion()` que sobrescribe la tabla manual. Una mejora defensiva sería marcar
J1–J3 como `historica` y saltar el recálculo para esas jornadas.

### 4.2 ALTO — Botón “Generar fixture” puede duplicar partidos

El fixture usa `upsert(..., { onConflict: 'torneo_id,grupo_id,numero' })`, pero no existe un índice
único real con esas columnas (ver `supabase/migration-unicidad-historica.sql`, aún no ejecutada).
Si un administrador presiona “Generar fixture” con 36 partidos ya cargados, Supabase insertará
duplicados.

**Recomendación:** ejecutar la migración de unicidad y además deshabilitar/ocultar el botón cuando
ya existan partidos para el torneo, con un confirmado explícito si se quiere regenerar.

### 4.3 MEDIO — Perfil de administrador no arranca en el propio jugador

Con Manuel logueado, `Mi Perfil` muestra el selector en `†ㅤGØA†` (primer jugador alfabético) en
vez del usuario autenticado. El perfil de jugador sí muestra sus datos directamente.

**Recomendación:** setear `#sel-jugador.value = Auth.jugador.id` al renderizar para administradores.

### 4.4 MEDIO — Etiqueta confusa para J4

Con J1–J3 cerradas y J4 sin programar, la UI dice `Jornada Abierta` y `No hay partidos
programados para esta jornada`. Es técnicamente correcto, pero confunde.

**Recomendación:** mostrar `Jornada 4 · Pendiente de programación` cuando no exista fila en
`jornadas` ni partidos para ese número.

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
estadísticas responden correctamente en el sitio live. El principal riesgo no es de código sino
de **consistencia de datos históricos**: mientras no se confirmen los marcadores oficiales de J2/J3,
la clasificación manual y los partidos describen dos realidades distintas. Cualquier guardado de
resultados debe esperar a esa corrección.
