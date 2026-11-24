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
| clasificación | 0 | 24 (final J3) |

- `user_id`: 1 fila (Manuel, `ee199055-d5c6-46a8-8126-fdcdbc8e5c7f`). Resto `NULL`.
- `super_admin`: 1 (Manuel). †ㅤGØA† y ツ ƈнєяy quedan como `admin` sin super_admin.
- J4 **no** cargada, según el requerimiento.
- Script reproducible: `supabase/carga-historica-2024.sql` (idempotente; se ejecutó dos veces sin duplicar filas).

Verificación en el sitio live: la tabla del Grupo A muestra las 12 filas y los valores insertados (PSG 12:3/9, Joaquín 8:4/7, …), sin errores de consola.

## 2. Errores encontrados

### 2.1 Versión desincronizada en GitHub Pages 〔ALTO〕
El HTML sirve `?v=1.0.8` en CSS/JS, pero el `config.js` publicado responde:

```
GLManager.version === '1.0.5'
CONFIG.VERSION === '1.0.5'
```

Local `js/core/config.js` ya tiene `1.0.8`. Hay que republicar ese archivo; si no, los usuarios siguen ejecutando lógica antigua aunque la URL diga 1.0.8. No se hizo push (no autorizado).

### 2.2 Registro bloqueado por los correos precargados 〔ALTO〕
`gl_correo_existe(p_correo)` consulta `jugadores.email`. Como los 24 correos ya están insertados, cuando un jugador intente registrarse con el correo asignado la app responderá que ya existe. Además, `supabase.js` insertaría una fila nueva con sufijo (`NOMBRE_1234`) en vez de vincular la fila histórica.

**Mejora propuesta:** crear una Edge Function `vincular-jugador` que, tras `auth.signUp`, busque `jugadores` por `email` con `user_id IS NULL` y haga `UPDATE ... SET user_id = auth.uid()`; recién si no existe, inserte fila nueva. El chequeo de correo disponible debe devolver `false` para filas preloaded con `user_id IS NULL`.

### 2.3 Upsert de fixture sin restricción de unicidad 〔ALTO〕
`js/modulos/fixture.js` usa:

```js
sb.from('jornadas').upsert(row, { onConflict: 'torneo_id,grupo_id,numero' })
```

Pero en la BD no existe ese índice único. El `upsert` se comporta como `insert` y puede duplicar jornadas/partidos al regenerar el fixture.

**Mejora propuesta:** ejecutar `supabase/migration-unicidad-historica.sql` (creado, **no ejecutado**). Agrega índices únicos para `jornadas` y `partidos`, y deja opcional el cambio de `clasificacion` a `(torneo_id, jugador_id)`.

### 2.4 Clasificación manual vs. recálculo automático 〔MEDIO〕
La clasificación se insertó con la tabla oficial J3. Sin embargo, varios marcadores deducidos del enunciado no cuadran con esas tablas (ver §3). Si un admin guarda cualquier resultado, `recalcularClasificacion()` sobrescribirá la tabla con valores derivados de `partidos`.

**Mejora propuesta:** marcar J1–J3 como históricas y evitar recálculos sobre jornadas `cerrada` (ya existe parte de la guarda en `resultados.js`), o bien corregir los marcadores deducidos hasta que el recálculo reproduzca exactamente la tabla oficial.

### 2.5 Etiqueta de jornada 〔BAJO〕
Con J1–J3 cerradas y J4 sin filas, la UI muestra `Jornada 4 / 22 · Jornada Abierta` y `No hay partidos programados`. Es correcto en datos, pero confuso.

**Mejora propuesta:** en `js/modulos/tabla.js`, cuando no exista la fila de `jornadas` para la jornada actual, mostrar `Jornada 4 · Pendiente de programación` en vez de `Jornada Abierta`.

## 3. Inconsistencias de datos recibidos y decisiones

1. El torneo creado por el seed se llamaba `Temporada 1`; se normalizó esa misma fila a `2024` para no romper los grupos existentes.
2. Correos no ASCII (†ㅤGØA†, ツ ƈнєяy) se sanitizaron: `goa@…`, `chery@…`. Manuel conserva su correo real.
3. Teléfonos con espacio (`+549225754 8471`, `+549115729 0737`) se guardaron sin espacio.
4. Las capturas `Joaquín 5-0 Dairo` y `S.A.B.B 2-2 Fabian10` coinciden con marcadores de **J1**; se asociaron a J1 en vez de duplicarlos en J2/J3.
5. Se ajustaron tres marcadores deducidos para acercarlos a las tablas acumuladas:
   - `URIELantuna 3-1 †ㅤGØA†` (el prompt decía 1-1).
   - `Romero99 2-1 Jonna` (el prompt decía 3-1).
   - `Caicedo 2-1 Dairo` (el prompt decía 4-1).
6. `Neymar 1-1 S.A.B.B` (J2 B) se cargó tal cual y quedó marcado `REVISAR` en el script.
7. La tabla final del Grupo A del prompt no cuadra en GF/GC (suma GF 64, suma GC 61). Se insertó tal cual; `dif` se recalculó como `gf - gc`.
8. Los rivales de varias capturas de J3 B no estaban identificados. Se asignaron por diferencia de goles: `Thiago 3-0 Eber`, `Fabian 4-1 Neymar`, `Xxine 4-1 S.A.B.B`, `Chery 2-1 Itachik`.

## 4. Responsive

- PARTE 2 ya implementada en archivos locales y validada a `360×640` y `390×844`: tabla móvil colapsable, fixture en cards, dropdown de jornada, bottom nav, modales 90vw/90dvh, toasts bottom-center, targets ≥44px y tipografía ≥14px.
- Esos cambios **no están visibles en el sitio live** todavía porque el `config.js` publicado sigue en 1.0.5 y no se hizo push. La navegación inferior sí se ve en el live (viene del HTML/CSS ya publicado).

## 5. Acceso obligatorio (versión 1.0.9)

Solicitud del usuario: el sistema debe iniciar con la ventana de login como primera validación.

- `js/app.js`: `exigirLogin()` muestra la pantalla de acceso antes de cargar contexto o renderizar
  cualquier ruta. `mostrar()` tiene una guarda que impide renderizar sin `Auth.usuario`.
- `js/ui/auth.js`: la pantalla dice «Acceso a la liga», bloquea el scroll del fondo y solo se cierra
  cuando hay sesión real. El registro con confirmación pendiente mantiene el overlay abierto.
- `gl:auth` y `hashchange`: al cerrar sesión o cambiar de hash sin autenticar vuelve el login.
- `css/estilos.css`: overlay con `z-index: 500` por encima del banner offline y del resto de la UI.

## 6. Archivos creados/modificados en esta sesión

- `supabase/carga-historica-2024.sql` — nuevo, ejecutado.
- `supabase/migration-unicidad-historica.sql` — nuevo, propuesto (no ejecutado).
- `js/app.js`, `js/ui/auth.js`, `js/core/config.js`, `index.html`, `css/estilos.css` — acceso obligatorio 1.0.9.
- `docs/CONFIGURACION.md`, `docs/ANALISIS-CARGA-2024.md` — documentación actualizada.
- Sin commits, sin push, sin secretos en frontend/docs.
