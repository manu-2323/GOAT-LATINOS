-- ============================================================================
-- 1.5.1 — Eliminación segura de torneo + participantes legibles por la UI
-- ============================================================================
-- Corrige la FK jugadores_torneo_id_fkey sin tocar la restricción: desvincula
-- TODOS los jugadores globales (no solo admins) antes de borrar el torneo.
-- Conserva auth.users, jugadores, cuentas administradoras e historial global.
-- La excepción de la RPC revierte la transacción completa.
-- El backfill usa asignaciones REALES ya existentes (jugadores.torneo_id), no
-- datos inventados; después de esto la UI usa solo torneo_participantes.

begin;

-- 1) Backfill idempotente de la pertenencia competitiva real ya existente.
insert into public.torneo_participantes
  (torneo_id, jugador_id, grupo_id, estado, inscrito_en)
select
  j.torneo_id,
  j.id,
  gm.grupo_id,
  'activo',
  coalesce(j.created_at, now())
from public.jugadores j
left join lateral (
  select gj.grupo_id
    from public.grupo_jugadores gj
    join public.grupos g on g.id = gj.grupo_id
   where gj.jugador_id = j.id and g.torneo_id = j.torneo_id
   limit 1
) gm on true
where j.torneo_id is not null
on conflict (torneo_id, jugador_id) do update
   set grupo_id = coalesce(public.torneo_participantes.grupo_id, excluded.grupo_id);

-- 2) Vista pública de participantes activos del torneo vigente.
--    security_invoker=false evita que el visitante necesite SELECT directo
--    sobre torneo_participantes (cuya RLS es solo para authenticated).
create or replace view public.participantes_publicos
  with (security_invoker = false) as
select tp.torneo_id, tp.jugador_id, tp.grupo_id, tp.estado
  from public.torneo_participantes tp
  join public.torneos t on t.id = tp.torneo_id
 where t.estado = 'activo' and tp.estado = 'activo';

grant select on public.participantes_publicos to anon, authenticated;

-- 3) RPC de eliminación corregida. Misma firma, permisos y SECURITY DEFINER.
create or replace function public.gl_eliminar_torneo(p_torneo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_estado text;
  v_jugadores_desvinculados integer := 0;
  v_participantes_eliminados integer := 0;
begin
  if not public.gl_es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'No tenés permisos de administrador.');
  end if;

  select t.estado into v_estado
    from public.torneos t
   where t.id = p_torneo_id;

  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'El torneo no existe.');
  end if;

  if v_estado = 'archivado' then
    return jsonb_build_object('ok', false, 'mensaje', 'No se puede eliminar un torneo archivado.');
  end if;

  -- El trigger gl_proteger_rol() permite el bypass con service_role.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  -- CAUSA RAÍZ: la versión anterior solo nuleaba rol='admin'. La FK real es
  -- NO ACTION, así que cualquier jugador no-admin bloqueaba el DELETE.
  update public.jugadores
     set torneo_id = null
   where torneo_id = p_torneo_id;
  get diagnostics v_jugadores_desvinculados = row_count;

  if exists (select 1 from public.jugadores where torneo_id = p_torneo_id) then
    raise exception 'Quedaron jugadores vinculados al torneo; no se eliminó nada.';
  end if;

  delete from public.partidos          where torneo_id = p_torneo_id;
  delete from public.partidos_historial where torneo_id = p_torneo_id;
  delete from public.jornadas          where torneo_id = p_torneo_id;
  delete from public.clasificacion     where torneo_id = p_torneo_id;
  delete from public.sanciones         where torneo_id = p_torneo_id;
  delete from public.notificaciones    where torneo_id = p_torneo_id;
  delete from public.auditoria         where torneo_id = p_torneo_id;
  delete from public.auditoria_eventos where torneo_id = p_torneo_id;
  delete from public.bitacora_jornadas where torneo_id = p_torneo_id;

  delete from public.torneo_participantes where torneo_id = p_torneo_id;
  get diagnostics v_participantes_eliminados = row_count;

  delete from public.grupo_jugadores
   where grupo_id in (
     select g.id from public.grupos g where g.torneo_id = p_torneo_id
   );

  delete from public.grupos  where torneo_id = p_torneo_id;
  delete from public.torneos where id = p_torneo_id;

  return jsonb_build_object(
    'ok', true,
    'mensaje', 'Torneo eliminado correctamente. Los jugadores y sus cuentas se conservan.',
    'torneo_eliminado', p_torneo_id,
    'jugadores_desvinculados', v_jugadores_desvinculados,
    'participantes_eliminados', v_participantes_eliminados
  );

exception
  when others then
    -- El bloque EXCEPTION revierte TODO lo hecho dentro de él.
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se pudo eliminar el torneo: ' || sqlerrm
    );
end;
$fn$;

commit;
