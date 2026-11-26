# FASE 3.11 — Informe de corrección definitiva del esquema telefónico

Fecha: 2026-11-26
Repositorio: `manu-2323/GOAT-LATINOS`
Sitio publicado: https://manu-2323.github.io/GOAT-LATINOS/
Commit de la corrección: `dc9e05c85bdf892980653b85b19fb26ce125f4bd`
Estado final: **corrección aplicada, verificada y publicada**.

Este informe continúa el diagnóstico de la FASE 3.10 (`docs/diagnostico-error-configuracion-db-3.10.md`). No incluye credenciales, tokens, hashes de contraseñas ni datos personales de acceso.

---

## 1. Resumen ejecutivo

El aviso amarillo de “configuración de base de datos” no era un fallo de conexión ni de credenciales: la app consultaba columnas telefónicas que no existían en la base de datos real y el manejo global de errores traducía el PostgreSQL `42703` como un problema de configuración.

Se completaron las cinco fases previstas, con freno de seguridad antes de cualquier DDL:

| Fase | Resultado |
| --- | --- |
| Auditoría de migraciones | Solo faltaban `1.2.0`, `1.2.1`, `2.2` y `2.3`; el resto ya estaba aplicado o era historia. |
| Respaldo recuperable | Export lógico verificado de 19 tablas, SHA-256 validado, ruta de restauración documentada. |
| Aplicación de DDL | Cuatro migraciones aplicadas en orden, sin reejecutar las ya aplicadas. |
| Verificación | Columnas, índices, funciones, triggers, RLS, GRANT/REVOKE, integridad y consulta real de la app correctos. |
| Publicación | Commit y push a `main`, despliegue de Pages correcto, app cargada sin aviso ni errores de consola. |

No se eliminaron tablas ni registros, no se vació ni reinicializó la base, no se cambiaron contraseñas ni roles administrativos y no se debilitó RLS.

---

## 2. Auditoría previa de migraciones

Se inventariaron 23 archivos SQL del repositorio. La existencia de un archivo **no** se tomó como prueba de que estuviera pendiente: se contrastó con el catálogo real de la base.

Hallazgos relevantes:

- `supabase_migrations.schema_migrations` **no existe** en el proyecto; el dashboard mostraba “Sin migraciones”. No había, por tanto, un registro server-side fiable del que deducir pendencias.
- Se consultó directamente el catálogo (`information_schema`, `pg_catalog`) y se comprobó qué objetos existían realmente.
- Ya aplicadas / no reejecutadas: base `1.0.x`, `1.1.0`, `migration-vaciado-1.1.0.sql`, `carga-historica-2024.sql`, `migration-hardening-rpcs.sql`, `migration-fixture-atomico.sql` y `migration-admin-1.0.18.sql`.
- Pendientes y necesarias, en este orden:
  1. `migration-telefonos-1.2.0.sql`
  2. `migration-telefonos-1.2.1.sql`
  3. `migration-telefonos-2.2.sql`
  4. `migration-seguridad-2.3.sql`

Estado anterior confirmado:

- `public.jugadores` tenía 17 columnas; faltaban `telefono_nacional`, `telefono_verificado` y `telefono_valido_plan`.
- Solo existían los índices `jugadores_pkey`, `jugadores_nombre_usuario_key` y `jugadores_email_idx`.
- Único trigger de negocio sobre `jugadores`: `gl_proteger_rol`.
- No existían el esquema `auditoria`, el rol `gl_owner` ni la función `public.gl_confirmar_e164`.
- `anon` y `authenticated` tenían privilegios amplios sobre `jugadores` (`DELETE, INSERT, REFERENCES, SELECT, TRUNCATE, UPDATE`, entre otros).
- La consulta administrativa de la app fallaba con `42703: column "telefono_nacional" does not exist`.

---

## 3. Respaldo verificado y ruta de restauración

Antes de ejecutar cualquier DDL se exportó un respaldo lógico de las 19 tablas de datos:

- Archivo: `gl-backup-20261126.json` (fuera del repositorio, en la carpeta temporal aprobada).
- Tamaño: 15.945 bytes.
- SHA-256: `2dd2f590e08258aafe18d21380bd1549abf96a51a25717d013eb68d1f604cd43`.
- El hash calculado en el navegador coincidió con el calculado sobre el archivo local.
- Copia comprimida en base64: `gl-backup-20261126.b64`, que permite reconstruir el JSON original.
- El respaldo incluye `admin_credencial`; por ese motivo se guardó fuera del repo y **no** se versionó ni se reproduce en este documento.

La API de plataforma informó `is_physical_backups_enabled: true`, versión `supabase-postgres-17.12.0.000` y proyecto `ACTIVE_HEALTHY`; sin embargo, el dashboard no ofrecía un punto de restauración verifiable. Por eso se empleó el export lógico como respaldo recuperable.

Ruta de restauración documentada (no ejecutada porque no hubo pérdida de datos):

1. Decodificar `gl-backup-20261126.b64` con gzip a JSON.
2. Validar SHA-256 y los 19 conteos por tabla.
3. Reinsertar filas por tabla con SQL, respetando claves foráneas y el orden de dependencias.
4. Volver a verificar los conteos y las restricciones únicas antes de reanudar la app.

---

## 4. Resolución conservadora del duplicado E.164

El preflight de `1.2.1` detectó dos registros con el mismo E.164 canónico `+50581085555`:

- `FC Mobile de Joaquín. 11sb`: `user_id = NULL`, registro histórico sin cuenta de acceso.
- `Manuel`: usuario autenticado con rol `admin` y `super_admin = true`.

Con autorización explícita del usuario se aplicó la opción conservadora:

- Se dejó `telefono_e164 = NULL` y `pais_telefono = NULL` **solo** en el registro sin `user_id`.
- Se conservaron el registro, su `id`, `telefono = '50581085555'`, `telefono_nacional = '8108-5555'`, `pais = 'NI'`, `rol = 'jugador'` y `user_id = NULL`.
- No se modificó el número del usuario autenticado.
- No se borró ninguna fila.

La primera actualización se repitió entre `1.2.0` y `1.2.1` porque `1.2.0` reconstruye `telefono_e164` desde `telefono` durante el backfill. Verificación final: `0` E.164 duplicados y `0` `user_id` duplicados.

---

## 5. Aplicación de las migraciones pendientes

Las migraciones se ejecutaron contra Supabase mediante el SQL Editor / endpoint `pg-meta`, capturando la respuesta de cada ejecución y deteniéndose ante cualquier error de preflight.

| Migración | Resultado |
| --- | --- |
| `migration-telefonos-1.2.0.sql` | Aplicada. Crea `telefono_nacional`, `telefono_verificado` y hace backfill desde `telefono`. |
| `migration-telefonos-1.2.1.sql` | Aplicada tras corregir preflights. Crea esquema `auditoria`, rol `gl_owner`, RPC de 5 argumentos, índices únicos y políticas RPC. |
| `migration-telefonos-2.2.sql` | Aplicada tras corregir una incompatibilidad de catalogación de funciones. Canonización, trigger de titularidad y permisos. |
| `migration-seguridad-2.3.sql` | Aplicada. RLS final, vista pública y GRANT/REVOKE definitivos. |

Correcciones necesarias en el SQL del repositorio, todas incluidas en el commit `dc9e05c`:

1. **Sintaxis PL/pgSQL inválida** en tres `RAISE EXCEPTION`: se eliminó la coma antes de `USING HINT`. El error inicial fue `42601: missing expression at or near "using"`. No se aplicó ningún cambio a la base porque falló el parseo.
2. **Propiedad de función**: PostgreSQL exige que el creador pertenezca al rol destino y tenga `CREATE` sobre el esquema para hacer `ALTER FUNCTION ... OWNER TO gl_owner`. Se añadió `grant gl_owner to postgres;` y `grant create on schema public to gl_owner;`, y se revocó el `CREATE` inmediatamente después del cambio de propietario. El error previo fue `42501: must be able to SET ROLE "gl_owner"`. La pertenencia quedó solo en `postgres`, nunca en `anon` ni `authenticated`.
3. **Funciones no catalogadas bajo `pg_catalog`**: `pg_catalog.coalesce` y `pg_catalog.nullif` no existen como funciones resolubles (`42883`). Se sustituyeron por `coalesce` y `nullif` en `2.2`, `2.3` y la plantilla de prueba `supabase/tests/fase-2.3.sql`.
4. Se ajustaron las aserciones de los tests que citaban literalmente las formas antiguas del SQL.

No se reejecutó `1.2.1` después de `2.3`: la política restrictiva `to public` creada por `2.3` haría fallar su preflight.

---

## 6. Verificación de esquema y de la consulta real de la app

Estado final de `public.jugadores`: 20 columnas. Las tres que faltaban ya están presentes:

| Columna | Tipo | Nullable | Default |
| --- | --- | --- | --- |
| `telefono_nacional` | `text` | SÍ | — |
| `telefono_verificado` | `boolean` | NO | `false` |
| `telefono_valido_plan` | `boolean` | SÍ | — |

Además se verificaron `telefono_e164` (`text`) y `pais_telefono` (`character`), ya existentes, y el resto de columnas originales.

Índices presentes:

- `jugadores_pkey`
- `jugadores_nombre_usuario_key`
- `jugadores_email_idx`
- `jugadores_telefono_e164_idx`
- `jugadores_e164_canonicalizado_uniq`
- `jugadores_user_id_uniq`

Se ejecutó exactamente la proyección que la app construye desde `js/core/gl.js` (`id, nombre_usuario, pais, zona_horaria, avatar_url, activo, suspendido, rol, torneo_id, numero, telefono, telefono_e164, telefono_nacional, pais_telefono, telefono_verificado, telefono_valido_plan, email, user_id, super_admin, created_at`). Devuelve HTTP 201 con las 3 filas, sin `42703`.

No se aceptó como prueba suficiente la desaparición del aviso amarillo: la verificación se hizo contra el catálogo y contra la consulta real.

---

## 7. Verificación de seguridad: funciones, triggers, RLS y permisos

**Funciones y propiedad**

- `public.gl_confirmar_e164(uuid, text, text, boolean, text)` existe y es propiedad de `gl_owner`.
- ACL de la RPC: `gl_owner=X/gl_owner`, `service_role=X/gl_owner`, `authenticated=X/gl_owner`. No hay `EXECUTE` para `public`/`anon`.
- `gl_es_admin()`, `gl_es_super_admin()`, `gl_proteger_rol()` y el resto de funciones `gl_*` siguen siendo propiedad de `postgres`.
- `auditoria.gl_exigir_evidencia_titularidad()` existe y es propiedad de `postgres`.

**Triggers**

- `gl_proteger_insercion_jugador` — BEFORE INSERT sobre `public.jugadores`.
- `gl_proteger_rol` — BEFORE UPDATE sobre `public.jugadores`.
- `gl_sincronizar_titularidad_telefono` — BEFORE INSERT OR UPDATE de columnas telefónicas sobre `public.jugadores`.
- `gl_exigir_evidencia_titularidad` — BEFORE INSERT sobre `auditoria.telefonos_confirmados`.

**RLS y policies**

- `public.jugadores` conserva sus políticas permisivas originales y añade las restrictivas de `2.2`/`2.3`: `gl_23_bloquea_delete_clientes` (`to public`, DELETE), `gl_23_solo_insert_propio` y `gl_23_solo_update_propio_o_admin` (`to authenticated`), además de las políticas RPC de `gl_owner` con sus correspondientes restrictivas de ámbito.
- Las políticas restrictivas nuevas conviven con las permisivas preexistentes; **no se eliminó ni debilitó ninguna política de lectura legítima**.
- `auditoria.telefonos_confirmados` tiene RLS habilitado y sus GRANT quedaron reducidos a `postgres`.
- El esquema `auditoria` existe y no figura como expuesto.

**GRANT/REVOKE finales sobre `jugadores`**

| Rol | Privilegios |
| --- | --- |
| `authenticated` | `SELECT` |
| `gl_owner` | `SELECT` a nivel de columna sobre `id`, `telefono_e164`, `telefono_verificado` |
| `postgres`, `service_role` | Privilegios administrativos de plataforma (sin cambios) |
| `anon` | Sin acceso a la tabla base |

La vista `public.jugadores_publicos` solo expone `id, nombre_usuario, pais, avatar_url, activo, suspendido, torneo_id, numero` y es legible por `anon` y `authenticated`. Su ACL amplia procede de los *default privileges* previos de Supabase, no de esta corrección; no otorga acceso a la tabla base.

**Simulaciones de rol**

| Simulación | Resultado |
| --- | --- |
| `anon` sobre `public.jugadores` | `42501: permission denied for table jugadores` (correcto). |
| `anon` sobre `public.jugadores_publicos` | 3 filas, solo columnas deportivas. |
| `authenticated` con JWT del administrador | 3 filas. |
| `authenticated` sin JWT | 0 filas: ausencia legítima de contexto de sesión, **no** error de esquema ni de permisos. |

El rol `gl_owner` quedó con `rolcanlogin=false`, `rolsuper=false`, `rolinherit=false`, `rolbypassrls=false`, perteneciente solo a `postgres` y sin `CREATE` sobre `public`.

---

## 8. Integridad de datos y comparación con el respaldo

Los 19 conteos finales coinciden con el respaldo verificado:

| Tabla | Filas | Tabla | Filas |
| --- | ---: | --- | ---: |
| `jugadores` | 3 | `grupos` | 2 |
| `grupo_jugadores` | 1 | `torneos` | 1 |
| `jornadas` | 0 | `partidos` | 0 |
| `clasificacion` | 0 | `sanciones` | 0 |
| `paises` | 16 | `notificaciones` | 25 |
| `partidos_historial` | 0 | `admin_acceso` | 2 |
| `admin_credencial` | 1 | `sistema_config` | 1 |
| `auditoria` | 0 | `admin_audit_log` | 0 |
| `admin_rate_limit` | 0 | `auditoria_eventos` | 0 |
| `bitacora_jornadas` | 0 | | |

Comprobaciones adicionales:

- `0` filas con `id` nulo.
- `0` duplicados de `user_id`.
- `0` duplicados de E.164 canónico.
- Se conservaron los 3 jugadores originales y sus `telefono` históricos; solo quedó nulo el E.164 del registro sin `user_id` implicado en el duplicado, según lo autorizado.
- No hubo que ejecutar la restauración: no se perdió ninguna fila.

---

## 9. Clasificación correcta de errores y pruebas automatizadas

Se añadió una rama explícita en `GL.traducirError` (`js/core/gl.js`) antes del match genérico de `"supabase"` para los códigos `42703`, `42P01`, `42883`, `42704` y sus mensajes equivalentes (`column ... does not exist`, `relation ... does not exist`, `function ... does not exist`). El mensaje resultante indica problema de **estructura/esquema** y no de conexión o credenciales.

En `js/core/ui-estados.js` se amplió la detección de detalle técnico para que esos mismos códigos no se muestren al usuario, manteniendo el registro en consola.

Clasificación aplicada:

| Categoría | Ejemplo | Mensaje para el usuario |
| --- | --- | --- |
| Conexión | `Failed to fetch`, timeout | Comprobar conexión. |
| Autenticación / permisos | JWT inválido, `42501`, `401/403` | Comprobar acceso o permisos. |
| Esquema / compatibilidad | `42703`, `42P01`, `42883`, `42704` | La base no tiene la estructura esperada; contactar al administrador. |
| Consulta / datos | `duplicate key`, `violates` | Revisar los datos enviados. |
| Ausencia legítima de datos | 0 filas con sesión válida | Estado vacío informativo, sin error. |

Pruebas: `6` archivos, **`81` pruebas pasadas** con Vitest (`2.66 s`). Se incluyó un caso específico que verifica que un `42703` se traduce como “estructura esperada” y no como error de configuración.

---

## 10. Publicación, verificación de la app y cierre

- Commit descriptivo: `dc9e05c85bdf892980653b85b19fb26ce125f4bd` — `fix(db): aplicar migraciones telefonicas y clasificar errores 42703`.
- Push a `main`: `97b01f8..dc9e05c  main -> main`. `HEAD` y `origin/main` coinciden.
- GitHub Pages: run `45790817435` para `dc9e05c85b`, `status: completed`, `conclusion: success`.
- Los archivos publicados contienen el parche: `js/core/gl.js` incluye `estructura esperada` y los códigos `42703`/`42883`; `js/core/ui-estados.js` incluye la nueva detección técnica.
- Se cargó https://manu-2323.github.io/GOAT-LATINOS/ con caché invalidada: HTTP 200, sesión de administrador válida, sin aviso amarillo, sin alertas en el DOM y sin errores en consola.
- No se subieron credenciales, tokens ni el respaldo al repositorio.

**Conclusión:** la incompatibilidad de esquema telefónico quedó resuelta en la base de datos y en la app publicada, con respaldo recuperable, integridad de datos conservada y seguridad reforzada. Queda como recomendación operativa no reejecutar `1.2.1` después de `2.3` y, si en el futuro se habilita `schema_migrations`, registrar estas cuatro migraciones como aplicadas para evitar reaplicaciones accidentales.
