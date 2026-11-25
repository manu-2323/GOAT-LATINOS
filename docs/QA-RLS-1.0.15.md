# QA de políticas RLS y publicación — 1.0.15

Versión local: **1.0.15**. Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`.
Verificación ejecutada el 24/11/2026 en producción y en el sitio live.
Ninguna contraseña, clave privada ni JWT aparece en este documento ni en el repositorio.

## Hallazgo

Al probar por primera vez un login real (la cuenta de pruebas creada para 1.0.14), las lecturas
con token devolvieron `500`. El log de PostgREST mostró:

```
{"code":"42P17","message":"infinite recursion detected in policy for relation \"jugadores\""}
```

Causa: las políticas `gl_read` y `jugadores_admin_lee_todo` de `public.jugadores` incluían un
`EXISTS (SELECT 1 FROM jugadores ...)`. Al evaluar la política sobre `jugadores`, la subconsulta
volvía a evaluar las políticas de `jugadores` de forma indefinida. Lo mismo afectaba a cualquier
consulta a otras tablas cuyas políticas consultaran `jugadores` (por ejemplo `partidos`).

Este fallo era preexistente: las versiones anteriores se verificaron sin usuarios de Auth, por lo
que nunca se ejercitó el rol `authenticated`.

## Fix aplicado

`supabase/migration-fix-rls-recursion.sql`, aplicada en producción sin errores. Se recrearon estas
políticas sustituyendo las subconsultas por funciones `SECURITY DEFINER` con `search_path = ''`:

| Tabla | Política | Expresión nueva |
|---|---|---|
| `jugadores` | `gl_read` | `user_id = auth.uid() or public.gl_es_admin()` |
| `jugadores` | `jugadores_admin_lee_todo` | `public.gl_es_admin()` |
| `partidos` | `solo admin modifica partidos` | `public.gl_es_admin()` (USING y WITH CHECK) |
| `auditoria` | `audit_insert` / `audit_read` | `public.gl_es_admin()` |
| `admin_audit_log` | `audit_solo_superadmin` | `public.gl_es_super_admin()` |
| `bitacora_jornadas` | `gl_read` | `public.gl_es_admin()` |
| `notificaciones` | `notif_insert` | `public.gl_es_admin()` |

`gl_es_admin()` y `gl_es_super_admin()` se ejecutan como el dueño de la función y consultan
`public.jugadores` sin volver a evaluar RLS. El resultado es el mismo que antes: un jugador ve solo
su fila; un admin ve todas. No se concedieron permisos nuevos.

## Verificación

| Prueba | Resultado |
|---|---|
| Login real en la app con la cuenta de pruebas | `Auth.usuario` cargado; `Auth.esAdmin() = false` |
| `GET /rest/v1/jugadores?select=...` con token | HTTP `200` |
| `GET /rest/v1/partidos?select=...` con token | HTTP `200` |
| Render de `stats-globales` con sesión | Muestra `PJ con datos` y `Top 5 precisión de pase`; sin `undefined` ni `NaN` |
| Consola del navegador | Sin errores |
| Log de PostgREST tras el fix | Sin `42P17` nuevo |

## Notas

- La cuenta de pruebas sigue siendo **jugador**; no se ejecutó `admin-bootstrap`.
- `1.0.14` quedó publicada y verificada (stats con denominadores propios); este release corrige
  únicamente la capa de RLS y el número de versión.
