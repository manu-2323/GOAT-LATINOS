-- ===========================================================================
-- GOATS LATINOS · Migración 1.1.0
-- Administración de torneos y carga manual de jornadas.
-- ===========================================================================
-- Idempotente: se puede volver a ejecutar sin duplicar datos.
-- Todas las RPC validan public.gl_es_admin(), corren como SECURITY DEFINER con
-- search_path = '' y referencian las tablas de forma totalmente calificada.
-- anon NUNCA recibe EXECUTE: solo authenticated.
-- No se escriben secretos, contraseñas ni tokens en este archivo.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) gl_crear_torneo: archiva el torneo vigente y abre uno nuevo
-- ---------------------------------------------------------------------------
drop function if exists public.gl_crear_torneo(text, text, integer);

create or replace function public.gl_crear_torneo(
  p_nombre_liga text,
  p_temporada text,
  p_total_jornadas integer default 22
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_torneo_id uuid;
  v_grupos    jsonb;
begin
  if not public.gl_es_admin() then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No tenés permisos de administrador.'
    );
  end if;

  if p_total_jornadas is null
     or p_total_jornadas < 1
     or p_total_jornadas > 30 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El total de jornadas debe estar entre 1 y 30.'
    );
  end if;

  if nullif(btrim(coalesce(p_nombre_liga, '')), '') is null
     or nullif(btrim(coalesce(p_temporada, '')), '') is null then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El nombre de la liga y la temporada son obligatorios.'
    );
  end if;

  update public.torneos
     set estado = 'archivado'
   where estado = 'activo';

  insert into public.torneos (nombre, temporada, estado, total_jornadas)
  values (
    btrim(p_nombre_liga),
    btrim(p_temporada),
    'activo',
    p_total_jornadas
  )
  returning id into v_torneo_id;

  -- El trigger de jugadores exige service_role o super_admin para mover
  -- torneo_id. La sesión ya fue verificada como administrador arriba.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  -- Los administradores siguen teniendo acceso, sin inscribirlos en grupos.
  update public.jugadores
     set torneo_id = v_torneo_id
   where rol = 'admin';

  insert into public.grupos (torneo_id, nombre)
  select v_torneo_id, x.nombre
  from (values ('Grupo A'), ('Grupo B')) as x(nombre);

  select coalesce(
           jsonb_agg(
             jsonb_build_object('id', g.id, 'nombre', g.nombre)
             order by g.nombre
           ),
           '[]'::jsonb
         )
    into v_grupos
    from public.grupos g
   where g.torneo_id = v_torneo_id;

  return jsonb_build_object(
    'ok', true,
    'mensaje', 'Torneo creado correctamente.',
    'torneo_id', v_torneo_id,
    'grupos', v_grupos,
    'total_jornadas', p_total_jornadas
  );

exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se pudo crear el torneo: ' || sqlerrm
    );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2) gl_eliminar_torneo: borra un torneo sin tocar jugadores ni Auth
-- ---------------------------------------------------------------------------
drop function if exists public.gl_eliminar_torneo(uuid);

create or replace function public.gl_eliminar_torneo(p_torneo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_estado text;
begin
  if not public.gl_es_admin() then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No tenés permisos de administrador.'
    );
  end if;

  select t.estado into v_estado
    from public.torneos t
   where t.id = p_torneo_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El torneo no existe.'
    );
  end if;

  if v_estado = 'archivado' then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se puede eliminar un torneo archivado.'
    );
  end if;

  -- El ID llega explícitamente en la llamada: se permite borrar el torneo
  -- activo o cualquier otro estado distinto de 'archivado'.
  -- Los administradores quedan sin torneo, pero conservan usuario y acceso.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  update public.jugadores
     set torneo_id = null
   where rol = 'admin'
     and torneo_id = p_torneo_id;

  delete from public.partidos          where torneo_id = p_torneo_id;
  delete from public.partidos_historial where torneo_id = p_torneo_id;
  delete from public.jornadas          where torneo_id = p_torneo_id;
  delete from public.clasificacion     where torneo_id = p_torneo_id;
  delete from public.sanciones         where torneo_id = p_torneo_id;
  delete from public.notificaciones    where torneo_id = p_torneo_id;
  delete from public.auditoria         where torneo_id = p_torneo_id;
  delete from public.auditoria_eventos where torneo_id = p_torneo_id;
  delete from public.bitacora_jornadas where torneo_id = p_torneo_id;

  delete from public.grupo_jugadores
   where grupo_id in (
     select g.id from public.grupos g where g.torneo_id = p_torneo_id
   );

  delete from public.grupos  where torneo_id = p_torneo_id;
  delete from public.torneos where id = p_torneo_id;

  return jsonb_build_object(
    'ok', true,
    'mensaje', 'Torneo eliminado correctamente.',
    'torneo_eliminado', p_torneo_id
  );

exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se pudo eliminar el torneo: ' || sqlerrm
    );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3) gl_actualizar_total_jornadas
-- ---------------------------------------------------------------------------
drop function if exists public.gl_actualizar_total_jornadas(uuid, integer);

create or replace function public.gl_actualizar_total_jornadas(
  p_torneo_id uuid,
  p_total integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.gl_es_admin() then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No tenés permisos de administrador.'
    );
  end if;

  if p_total is null or p_total < 1 or p_total > 30 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El total de jornadas debe estar entre 1 y 30.'
    );
  end if;

  if not exists (select 1 from public.torneos t where t.id = p_torneo_id) then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El torneo no existe.'
    );
  end if;

  update public.torneos
     set total_jornadas = p_total
   where id = p_torneo_id;

  return jsonb_build_object(
    'ok', true,
    'mensaje', 'Total de jornadas actualizado correctamente.',
    'total_jornadas', p_total
  );

exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se pudo actualizar el total de jornadas: ' || sqlerrm
    );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4) gl_guardar_jornada_manual
-- ---------------------------------------------------------------------------
drop function if exists public.gl_guardar_jornada_manual(uuid, uuid, integer, date, jsonb);

create or replace function public.gl_guardar_jornada_manual(
  p_torneo_id uuid,
  p_grupo_id uuid,
  p_numero integer,
  p_fecha date,
  p_partidos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_total_jornadas integer;
  v_total_partidos integer;
  v_jugadores_unicos integer;
  v_invalidos integer;
  v_con_resultados integer;
  v_jornada_id uuid;
begin
  if not public.gl_es_admin() then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No tenés permisos de administrador.'
    );
  end if;

  select t.total_jornadas into v_total_jornadas
    from public.torneos t
   where t.id = p_torneo_id
     and t.estado = 'activo';

  if not found then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El torneo no existe o no está activo.'
    );
  end if;

  if not exists (
    select 1 from public.grupos g
     where g.id = p_grupo_id
       and g.torneo_id = p_torneo_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El grupo no pertenece al torneo.'
    );
  end if;

  if p_numero is null
     or p_numero < 1
     or p_numero > v_total_jornadas then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'La jornada debe estar entre 1 y ' || v_total_jornadas || '.'
    );
  end if;

  if p_partidos is null or jsonb_typeof(p_partidos) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'La lista de partidos debe ser un arreglo.'
    );
  end if;

  if jsonb_array_length(p_partidos) = 0 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'La jornada debe incluir al menos un partido.'
    );
  end if;

  -- Cada elemento: {"local_id":"uuid","visitante_id":"uuid"}
  select count(*) into v_invalidos
    from (
      select (x.elem ->> 'local_id')::uuid     as local_id,
             (x.elem ->> 'visitante_id')::uuid as visitante_id
        from jsonb_array_elements(p_partidos) as x(elem)
    ) p
   where p.local_id is null
      or p.visitante_id is null
      or p.local_id = p.visitante_id
      or not exists (
           select 1
             from public.jugadores j
             join public.grupo_jugadores gj on gj.jugador_id = j.id
            where j.id = p.local_id
              and j.activo is true
              and gj.grupo_id = p_grupo_id
         )
      or not exists (
           select 1
             from public.jugadores j
             join public.grupo_jugadores gj on gj.jugador_id = j.id
            where j.id = p.visitante_id
              and j.activo is true
              and gj.grupo_id = p_grupo_id
         );

  if v_invalidos > 0 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Hay ' || v_invalidos ||
                 ' partido(s) inválido(s): los jugadores deben existir, estar activos, ' ||
                 'pertenecer al grupo y no repetirse dentro de la jornada.'
    );
  end if;

  select count(*), count(distinct jugador_id)
    into v_total_partidos, v_jugadores_unicos
    from (
      select (x.elem ->> 'local_id')::uuid as jugador_id
        from jsonb_array_elements(p_partidos) as x(elem)
      union all
      select (x.elem ->> 'visitante_id')::uuid as jugador_id
        from jsonb_array_elements(p_partidos) as x(elem)
    ) todos;

  if v_total_partidos <> v_jugadores_unicos then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Un jugador aparece más de una vez en la jornada.'
    );
  end if;

  select count(*) into v_con_resultados
    from public.partidos pnt
   where pnt.torneo_id = p_torneo_id
     and pnt.grupo_id = p_grupo_id
     and pnt.jornada = p_numero
     and pnt.estado is distinct from 'pendiente';

  if v_con_resultados > 0 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'La jornada ya tiene resultados cargados. No se puede sobrescribir.'
    );
  end if;

  delete from public.partidos
   where torneo_id = p_torneo_id
     and grupo_id = p_grupo_id
     and jornada = p_numero
     and estado = 'pendiente';

  insert into public.jornadas (torneo_id, grupo_id, numero, fecha, estado)
  values (p_torneo_id, p_grupo_id, p_numero, p_fecha, 'programada')
  on conflict (torneo_id, grupo_id, numero)
  do update set
    fecha = excluded.fecha,
    estado = excluded.estado
  returning id into v_jornada_id;

  insert into public.partidos (
    torneo_id, grupo_id, jornada,
    local_id, visitante_id,
    goles_local, goles_visitante, estado
  )
  select
    p_torneo_id, p_grupo_id, p_numero,
    (x.elem ->> 'local_id')::uuid,
    (x.elem ->> 'visitante_id')::uuid,
    0, 0, 'pendiente'
  from jsonb_array_elements(p_partidos) as x(elem);

  return jsonb_build_object(
    'ok', true,
    'mensaje', 'Jornada ' || p_numero || ' guardada correctamente.',
    'jornada_id', v_jornada_id,
    'total_partidos', v_total_partidos
  );

exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se pudo guardar la jornada: ' || sqlerrm
    );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5) gl_borrar_jornada_manual
-- ---------------------------------------------------------------------------
drop function if exists public.gl_borrar_jornada_manual(uuid, uuid, integer);

create or replace function public.gl_borrar_jornada_manual(
  p_torneo_id uuid,
  p_grupo_id uuid,
  p_numero integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_total_jornadas integer;
begin
  if not public.gl_es_admin() then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No tenés permisos de administrador.'
    );
  end if;

  select t.total_jornadas into v_total_jornadas
    from public.torneos t
   where t.id = p_torneo_id
     and t.estado = 'activo';

  if not found then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El torneo no existe o no está activo.'
    );
  end if;

  if not exists (
    select 1 from public.grupos g
     where g.id = p_grupo_id
       and g.torneo_id = p_torneo_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El grupo no pertenece al torneo.'
    );
  end if;

  if p_numero is null or p_numero < 1 or p_numero > v_total_jornadas then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'La jornada debe estar entre 1 y ' || v_total_jornadas || '.'
    );
  end if;

  if exists (
    select 1
      from public.partidos pnt
     where pnt.torneo_id = p_torneo_id
       and pnt.grupo_id = p_grupo_id
       and pnt.jornada = p_numero
       and pnt.estado is distinct from 'pendiente'
  ) then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'La jornada tiene resultados cargados. No se puede borrar.'
    );
  end if;

  delete from public.partidos
   where torneo_id = p_torneo_id
     and grupo_id = p_grupo_id
     and jornada = p_numero
     and estado = 'pendiente';

  delete from public.jornadas
   where torneo_id = p_torneo_id
     and grupo_id = p_grupo_id
     and numero = p_numero;

  return jsonb_build_object(
    'ok', true,
    'mensaje', 'Jornada ' || p_numero || ' borrada correctamente.'
  );

exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se pudo borrar la jornada: ' || sqlerrm
    );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6) Permisos: CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto
-- ---------------------------------------------------------------------------
revoke all on function public.gl_crear_torneo(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.gl_eliminar_torneo(uuid)
  from public, anon, authenticated;
revoke all on function public.gl_actualizar_total_jornadas(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.gl_guardar_jornada_manual(uuid, uuid, integer, date, jsonb)
  from public, anon, authenticated;
revoke all on function public.gl_borrar_jornada_manual(uuid, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.gl_crear_torneo(text, text, integer) to authenticated;
grant execute on function public.gl_eliminar_torneo(uuid) to authenticated;
grant execute on function public.gl_actualizar_total_jornadas(uuid, integer) to authenticated;
grant execute on function public.gl_guardar_jornada_manual(uuid, uuid, integer, date, jsonb)
  to authenticated;
grant execute on function public.gl_borrar_jornada_manual(uuid, uuid, integer)
  to authenticated;

commit;

-- PostgREST debe ver los permisos nuevos sin reiniciar el proyecto.
notify pgrst, 'reload schema';

-- Fin del script.
