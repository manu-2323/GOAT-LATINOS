# Análisis · Carga histórica 2024 y revisión del sitio publicado

## 1. Estado de la carga

Ejecutado contra `zmjzlvsdlfzmhptmtmjx` (producción) con Supabase CLI.

| Tabla | Antes | Después |
|---|---:|---:|
| torneos | 1 (`Temporada 1`) | 1 (`2024`) |
| jugadores | 0 | 24 |
| grupos | 2 | 2 |
| grupo_jugadores | 0 | 24 |
| jornadas | 0 | 6 (J1–J3 × A/B, `cerrada`) |
| partidos | 0 | 36 (todos `jugado`) |
| partidos con stats | 0 | 5 |
| clasificación | 0 | 24 (recalculada desde `partidos`) |
| `auth.users` | 1 | 24 |
| `auth.identities` | 1 | 24 |

- `public.jugadores.user_id`: pasó de 1 fila a **24/24 vinculados**.
- Administradores: 3 (`Manuel`, `†ㅤGØA†`, `ツ ƈнєяy`); `super_admin`: 1 (Manuel).
- J4 **no** cargada, conforme al requerimiento.
- Script reproducible actualizado: `supabase/carga-historica-2024.sql`.
- Sitio live en `1.0.9`: `GLManager.version === '1.0.9'`, 0 errores de consola.

## 2. Hallazgos y resolución

### 2.1 Versión desincronizada en GitHub Pages 〔RESUELTO〕

El HTML servía `?v=1.0.8` mientras `config.js` respondía `1.0.5`. Se publicó `1.0.9` y se verificó
en el sitio en vivo que tanto `CONFIG.VERSION` como `GLManager.version` devuelven `1.0.9`.

### 2.2 Registro bloqueado por correos precargados 〔RESUELTO〕

Ya no se depende del flujo de registro: las 24 cuentas `auth.users` se crearon por SQL con hashing
bcrypt y se vincularon a su jugador histórico por `user_id`. Las 24 identidades `email` también
existen y los 24 hashes fueron verificados en base.

Detalle técnico que costó un diagnóstico: en esta versión de Supabase, `auth.users.instance_id`
debe ser `00000000-0000-0000-0000-000000000000`. Con `NULL`, GoTrue devolvía
`invalid_credentials` aunque el hash fuera correcto. También se normalizó `email_change = ''`.
Ninguna contraseña quedó en el repo, docs ni logs.

### 2.3 Upsert de fixture sin restricción de unicidad 〔RESUELTO〕

`js/modulos/fixture.js` ya bloquea la regeneración cuando hay resultados cargados y pide
confirmación antes de borrar partidos pendientes.

Además se ejecutó `supabase/migration-unicidad-historica.sql`. Verificado en `pg_indexes`:

- `jornadas_torneo_grupo_numero_key` → `UNIQUE (torneo_id, grupo_id, numero)`
- `partidos_torneo_grupo_jornada_local_visita_key` → `UNIQUE (torneo_id, grupo_id, jornada, local_id, visitante_id)`

No había duplicados previos (6 jornadas, 36 partidos), así que la creación de índices no alteró
ningún dato.

### 2.4 Clasificación manual vs. recálculo automático 〔RESUELTO〕

El usuario definió el criterio: «yo perdí con Joaquín 3-1 … aplica lógica». Se priorizó el
resultado real declarado sobre la tabla copiada y se corrigieron cuatro marcadores:

| Jornada | Partido | Valor final |
|---|---|---|
| J3 | Joaquín.11sb vs. Manuel | 3-1 |
| J2 | Romero99 vs. Jonna | 3-1 |
| J2 | Caicedo vs. Dairo | 4-1 |
| J2 | URIELantuna vs. †ㅤGØA† | 1-1 |

Después se recalcularon las 24 filas de `public.clasificacion` por SQL con la misma lógica de
`recalcularClasificacion()`. Desde una sesión de jugador, RLS bloquea esa escritura (correcto),
así que se hizo con permisos de servicio. El resultado se verificó recargando el sitio: Manuel
quedó con 1 punto y 2:5, y Joaquín con 9 puntos y 10:2. El detalle completo está en
`docs/QA-LIVE-1.0.9.md`.

### 2.5 Etiqueta de jornada 〔CORREGIDO〕

Las jornadas J4–J22 se generan en memoria (`jornada.virtual: true`) y antes se mostraban como
`Jornada Abierta`. `js/modulos/tabla.js` ahora distingue ese caso y muestra
`Pendiente de programación`, con el mensaje «Esta jornada todavía no tiene partidos
programados».

### 2.6 Marcador ambiguo 〔PENDIENTE〕

`Neymar 1-1 S.A.B.B` (J2, Grupo B) sigue marcado como `REVISAR`. Requiere confirmación del usuario
para darlo por definitivo.

## 3. Decisiones finales de datos

1. El torneo `Temporada 1` se normalizó a `2024` (misma fila, mismo ID) para no romper los grupos.
2. Correos no ASCII se sanitizaron: `goa@goatslatinos.com`, `chery@goatslatinos.com`. Manuel
   conserva su correo real.
3. Teléfonos con espacio (`+549225754 8471`, `+549115729 0737`) se guardaron sin espacio.
4. Las capturas `Joaquín 5-0 Dairo` y `S.A.B.B 2-2 Fabian10` se asociaron a J1, donde ya existían,
   en vez de duplicarlas.
5. Los cuatro marcadores corregidos (§2.4) reemplazan a los valores deducidos originalmente.
6. `Neymar 1-1 S.A.B.B` se cargó tal cual y sigue pendiente de confirmación.
7. La clasificación ya no se copia de la tabla oficial: se deriva de `public.partidos`.
8. Los rivales de varias capturas de J3 B no estaban identificados; se asignaron por diferencia de
   goles: `Thiago 3-0 Eber`, `Fabian 4-1 Neymar`, `Xxine 4-1 S.A.B.B`, `Chery 2-1 Itachik`.
9. J4 quedó sin cargar, según el requerimiento.

## 4. Responsive y acceso

- Responsive validado a `360×640` y `390×844`: tabla colapsable, fixture en cards, dropdown de
  jornada, bottom nav, modales 90vw/90dvh y toasts bottom-center.
- Login obligatorio publicado en `1.0.9`: `#vista` queda vacía hasta autenticar, el logout vuelve
  al overlay y la sesión persiste al recargar.

## 5. Verificación en vivo

- Login real con cuenta admin y con cuenta jugador: correcto; la navegación cambia según el rol.
- Tabla, fixture, estadísticas, perfil, pestañas de grupo, selector de jornada y filtro
  «Solo mis partidos»: correctos.
- Sin errores de consola en carga limpia.
- No se ejecutaron acciones de escritura desde la UI durante el QA.

## 6. Estado final

- Commits publicados: `e85da1a` (1.0.9), `87c45e2` (despliegue Pages), `253691b` (informe QA).
  La revisión final de documentación y etiqueta de J4 se publica en el push siguiente.
- No hay `SERVICE_ROLE_KEY`, `GEMINI_API_KEY` ni contraseñas en frontend, docs ni repo.
- `.gitignore` excluye `supabase/.temp/`.
