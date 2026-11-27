-- ============================================================================
-- PROPUESTA — NO APLICADA — Participantes por torneo (1.4.1)
-- ============================================================================
-- Requiere aprobación expresa antes de ejecutarse en Supabase.
--
-- Objetivo: que "pertenecer a un torneo" sea un hecho explícito e
-- independiente del grupo. No reutiliza grupo_jugadores, no crea
-- jugadores.grupo_id y no modifica torneos, jugadores, grupos ni
-- grupo_jugadores existentes.
--
-- Compatibilidad: el backfill solo lee membresías REALES ya existentes en
-- grupo_jugadores. No usa jugadores.torneo_id (ese campo es un puntero único
-- que gl_crear_torneo reescribe solo a administradores).
-- ============================================================================

begin;

-- 1) Relación inequívoca torneo <-> jugador.
create table if not exists public.torneo_participantes (
  torneo_id   uuid not null references public.torneos(id)    on delete cascade,
  jugador_id  uuid not null references public.jugadores(id)  on delete cascade,
  inscrito_en timestamptz not null default now(),
  primary key (torneo_id, jugador_id)
);

-- La PK ya indexa torneo -> jugadores. Este índice cubre el historial inverso.
create index if not exists torneo_participantes_jugador_idx
  on public.torneo_participantes (jugador_id, torneo_id);

comment on table public.torneo_participantes is
  'Plantel inscripto por torneo. No sustituye ni modifica grupo_jugadores.';

-- 2) Backfill compatible: solo evidencia real de pertenencia a un grupo.
insert into public.torneo_participantes (torneo_id, jugador_id)
select g.torneo_id, gj.jugador_id
from public.grupo_jugadores gj
join public.grupos g on g.id = gj.grupo_id
where g.torneo_id is not null
on conflict (torneo_id, jugador_id) do nothing;

-- 3) RLS mínima de la tabla NUEVA. No altera políticas existentes.
alter table public.torneo_participantes enable row level security;

drop policy if exists tp_select on public.torneo_participantes;
create policy tp_select on public.torneo_participantes
  for select to authenticated
  using (
    public.gl_es_admin()
    or exists (
      select 1 from public.jugadores j
      where j.id = public.torneo_participantes.jugador_id
        and j.user_id = auth.uid()
    )
  );

drop policy if exists tp_admin_write on public.torneo_participantes;
create policy tp_admin_write on public.torneo_participantes
  for all to authenticated
  using (public.gl_es_admin()) with check (public.gl_es_admin());

revoke all on public.torneo_participantes from public, anon, authenticated;
grant select, insert, delete on public.torneo_participantes to authenticated;
-- service_role conserva sus privilegios: no se le ha revocado nada.

-- 4) RPC aditiva. NO reemplaza gl_crear_torneo: el alta actual sigue intacta.
--    El frontend la llama DESPUÉS de crear el torneo, con los participantes
--    elegidos. Si falla, el torneo ya creado no se toca.
create or replace function public.gl_inscribir_participantes(
  p_torneo_id uuid,
  p_jugador_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_inscritos integer := 0;
  v_pid uuid;
begin
  if auth.uid() is null then
    raise exception 'Sesión no autenticada';
  end if;
  if not public.gl_es_admin() then
    raise exception 'No autorizado';
  end if;
  if p_torneo_id is null then
    raise exception 'El torneo es obligatorio';
  end if;
  if not exists (select 1 from public.torneos t where t.id = p_torneo_id) then
    raise exception 'Torneo no válido';
  end if;

  p_jugador_ids := coalesce(p_jugador_ids, '{}'::uuid[]);

  -- Validación ANTES de escribir: ningún participante inventado ni admin.
  foreach v_pid in array p_jugador_ids loop
    if not exists (
      select 1 from public.jugadores j
      where j.id = v_pid and j.rol = 'jugador'
    ) then
      raise exception 'Participante no válido para el torneo: %', v_pid::text;
    end if;
  end loop;

  insert into public.torneo_participantes (torneo_id, jugador_id)
  select p_torneo_id, u.jugador_id
  from unnest(p_jugador_ids) as u(jugador_id)
  on conflict (torneo_id, jugador_id) do nothing;
  get diagnostics v_inscritos = row_count;

  return jsonb_build_object(
    'ok', true,
    'torneo_id', p_torneo_id,
    'inscritos', v_inscritos,
    'mensaje', 'Participantes inscriptos en el torneo.'
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se pudieron inscribir los participantes: ' || sqlerrm
    );
end;
$fn$;

revoke all on function public.gl_inscribir_participantes(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.gl_inscribir_participantes(uuid, uuid[])
  to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación posterior (SOLO LECTURA), una vez aprobada y aplicada:
--
-- select t.temporada, count(*) as participantes
-- from public.torneo_participantes p
-- join public.torneos t on t.id = p.torneo_id
-- group by t.temporada order by t.temporada;
--
-- select count(*) as participantes_sin_jugador
-- from public.torneo_participantes p
-- left join public.jugadores j on j.id = p.jugador_id
-- where j.id is null;
--
-- select t.nombre, t.temporada, count(gj.jugador_id) as con_grupo,
--        count(*) filter (where gj.jugador_id is null) as sin_grupo
-- from public.torneos t
-- join public.torneo_participantes p on p.torneo_id = t.id
-- left join public.grupos g on g.torneo_id = t.id
-- left join public.grupo_jugadores gj
--   on gj.jugador_id = p.jugador_id and gj.grupo_id = g.id
-- group by t.id order by t.created_at desc;
-- ============================================================================
