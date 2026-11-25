-- ===========================================================================
-- GOATS LATINOS · Vaciado deportivo 1.1.0 — DESTRUCTIVO
-- ===========================================================================
-- REQUIERE BACKUP PREVIO. NO se ejecuta automáticamente: ejecutar una sola vez
-- desde el SQL Editor, de forma manual, después de respaldar la base.
-- Borra toda la actividad deportiva y las cuentas Auth de los jugadores,
-- preservando admin_acceso, admin_credencial, paises, sistema_config y las
-- filas de jugadores con rol='admin' junto con sus user_id de auth.users.
-- No se escriben secretos, contraseñas ni tokens en este archivo.
-- ===========================================================================

begin;

-- Permite escrituras de mantenimiento sobre auth.users y evita que las
-- políticas RLS estorben durante la limpieza.
set local search_path = public, auth, extensions;
set local row_security = off;
select set_config('request.jwt.claim.role', 'service_role', true);

-- ---------------------------------------------------------------------------
-- 1) Administradores: acceso intacto, sin número ni torneo (FK)
--    Se hace antes de borrar torneos para no romper jugadores.torneo_id.
--    NO se tocan email, teléfono, zona horaria, rol ni hash.
-- ---------------------------------------------------------------------------
update public.jugadores
   set activo = true,
       suspendido = false,
       numero = null,
       torneo_id = null
 where rol = 'admin';

-- ---------------------------------------------------------------------------
-- 2) Borrado de todo lo deportivo, en el orden solicitado.
--    El borrado de jugadores no administradores se intercala antes de grupos y
--    torneos por las claves foráneas y para liberar nombres/correos.
-- ---------------------------------------------------------------------------
delete from public.partidos;
delete from public.partidos_historial;
delete from public.jornadas;
delete from public.clasificacion;
delete from public.sanciones;
delete from public.notificaciones;
delete from public.auditoria;
delete from public.auditoria_eventos;
delete from public.bitacora_jornadas;
delete from public.grupo_jugadores;

-- Se conserva cualquier fila referenciada por admin_acceso (lista blanca).
delete from public.jugadores j
 where j.rol is distinct from 'admin'
   and not exists (
     select 1 from public.admin_acceso a where a.jugador_id = j.id
   );

delete from public.grupos;
delete from public.torneos;
delete from public.admin_rate_limit;

-- ---------------------------------------------------------------------------
-- 3) Auth: solo se eliminan cuentas que NO pertenezcan a un administrador.
--    Las identidades se borran primero de forma explícita.
-- ---------------------------------------------------------------------------
delete from auth.identities i
 where not exists (
   select 1
     from public.jugadores j
    where j.rol = 'admin'
      and j.user_id = i.user_id
 );

delete from auth.users u
 where not exists (
   select 1
     from public.jugadores j
    where j.rol = 'admin'
      and j.user_id = u.id
 );

-- ---------------------------------------------------------------------------
-- 4) Torneo nuevo y grupos. Los administradores quedan asignados al torneo
--    sin inscribirlos en ningún grupo.
-- ---------------------------------------------------------------------------
insert into public.torneos (nombre, temporada, estado, total_jornadas)
select 'GOATS LATINOS 2026', '2026', 'activo', 22
where not exists (
  select 1 from public.torneos
   where nombre = 'GOATS LATINOS 2026' and temporada = '2026'
);

with t as (
  select id
    from public.torneos
   where nombre = 'GOATS LATINOS 2026'
     and temporada = '2026'
   order by created_at desc
   limit 1
)
insert into public.grupos (torneo_id, nombre)
select t.id, x.nombre
from t
cross join (values ('Grupo A'), ('Grupo B')) as x(nombre)
where not exists (
  select 1 from public.grupos g
   where g.torneo_id = t.id and g.nombre = x.nombre
);

update public.jugadores
   set torneo_id = (
     select id
       from public.torneos
      where nombre = 'GOATS LATINOS 2026'
        and temporada = '2026'
      order by created_at desc
      limit 1
   )
 where rol = 'admin';

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5) Verificación final: conteos por tabla
-- ---------------------------------------------------------------------------
select 'torneos' as tabla, count(*)::text as total from public.torneos
union all select 'grupos', count(*)::text from public.grupos
union all select 'jugadores', count(*)::text from public.jugadores
union all select 'jugadores_admin', count(*)::text from public.jugadores where rol = 'admin'
union all select 'jugadores_no_admin', count(*)::text from public.jugadores where rol is distinct from 'admin'
union all select 'grupo_jugadores', count(*)::text from public.grupo_jugadores
union all select 'jornadas', count(*)::text from public.jornadas
union all select 'partidos', count(*)::text from public.partidos
union all select 'partidos_historial', count(*)::text from public.partidos_historial
union all select 'clasificacion', count(*)::text from public.clasificacion
union all select 'sanciones', count(*)::text from public.sanciones
union all select 'notificaciones', count(*)::text from public.notificaciones
union all select 'auditoria', count(*)::text from public.auditoria
union all select 'auditoria_eventos', count(*)::text from public.auditoria_eventos
union all select 'bitacora_jornadas', count(*)::text from public.bitacora_jornadas
union all select 'admin_rate_limit', count(*)::text from public.admin_rate_limit
union all select 'admin_acceso', count(*)::text from public.admin_acceso
union all select 'admin_credencial', count(*)::text from public.admin_credencial
union all select 'paises', count(*)::text from public.paises
union all select 'sistema_config', count(*)::text from public.sistema_config
union all select 'auth_users', count(*)::text from auth.users
union all select 'auth_users_admin', count(*)::text from auth.users u
  where exists (
    select 1 from public.jugadores j where j.rol = 'admin' and j.user_id = u.id
  )
order by tabla;

-- Fin del script.
