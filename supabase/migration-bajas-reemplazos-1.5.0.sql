-- ============================================================================
-- PROPUESTA — NO APLICADA — 1.5.0
-- Bajas, reemplazos y retiros de participantes por torneo
-- ============================================================================
-- Requiere APROBACIÓN EXPRESA antes de ejecutarse en Supabase.
-- No elimina cuentas Auth, jugadores globales, torneos, jornadas ni resultados.
-- No modifica RLS, GRANT ni REVOKE de tablas existentes.
--
-- REGLAS APROBADAS POR EL USUARIO (2026-11-26):
--   1. El plazo NO es de días calendario: exige jornadas 1..6 cerradas EN
--      SECUENCIA y jornada 7 NO cerrada. Al cerrar la 7 queda cerrado para
--      siempre. Un hueco en 1..6 bloquea. Lo calcula Postgres, nunca el navegador.
--   2. 3-0 administrativo = misma regla del walkover vigente: 3 puntos y
--      3 GF / 0 GC en tabla; 0 goles reales, 0 vallas, 0 tiros en estadísticas.
--   3. "Jornada libre" por baja también es 3-0 para el rival, pero se guarda
--      con estado, motivo y auditoría propios. No se reutiliza el estado
--      'walkover_*' para simularla.
--   4. Con reemplazo dentro del plazo: el entrante hereda los partidos
--      PENDIENTES (misma jornada y rival). Los resultados ya jugados siguen
--      asociados al saliente.
--   5. Sin reemplazo: se retira al participante; sus partidos pendientes se
--      resuelven 3-0 con etiqueta de jornada libre. Los ya disputados quedan
--      intactos (incluidos los de la jornada que se acaba de cerrar).
--
-- COMPATIBILIDAD:
--   * `torneo_participantes` extiende la propuesta pendiente
--     supabase/migration-participantes-1.4.1.sql. Si esa migración ya se
--     aplicara en otro entorno, este archivo es idempotente: create if not
--     exists + add column if not exists.
--   * El backfill solo usa filas REALES de grupo_jugadores, nunca
--     jugadores.torneo_id (puntero que gl_crear_torneo reescribe).
--   * La clasificación existente ya normaliza estados desconocidos con los
--     goles guardados; por eso 'jornada_libre' con 3-0 cuenta sin tocar
--     recalcular_clasificacion_interno. Las estadísticas reales de FC Mobile
--     filtran por estado='jugado', por lo que una jornada libre NO suma PJ
--     real ni goles/vallas reales: se verifica en las pruebas aisladas.
--   * NO se escribe jugadores.torneo_id: torneo_participantes es la fuente de
--     pertenencia por torneo. La UI actual debe adaptarse antes de publicarse.
--   * Tras un REEMPLAZO se recalcula la clasificación de los grupos afectados
--     DENTRO de la misma transacción. recalcular_clasificacion_interno itera
--     grupo_jugadores (donde siguen ambos jugadores) y excluye pendientes,
--     por lo que el saliente conserva sus resultados y el entrante arranca
--     sin puntos hasta que se juegue su primer partido. No se mezclan stats.
--   * La REASIGNACIÓN de un pendiente NO es una resolución: se guarda en
--     campos propios (reasignado_*), el partido sigue en estado 'pendiente'
--     y NO se escriben motivo_resolucion / resuelto_por / resuelto_en.
--   * Sincronización con el cierre de J7 sin tocar la función desplegada:
--     gl_cerrar_jornada_interno ejecuta UPDATE sobre partidos y jornadas,
--     por lo que mantiene RowExclusiveLock a nivel de tabla. gl_gestionar_baja
--     toma SHARE ROW EXCLUSIVE sobre esas dos tablas (partidos -> jornadas),
--     modo que entra en conflicto con RowExclusiveLock. Así ambas operaciones
--     se excluyen entre sí por modos de bloqueo, no por el orden en que se
--     bloqueen filas individuales, y no hace falta modificar el cierre.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Participantes por torneo: identidad de competición, separada del usuario.
--    Un retiro NO borra la fila de jugadores ni la cuenta de auth.users.
-- ----------------------------------------------------------------------------
create table if not exists public.torneo_participantes (
  torneo_id     uuid not null references public.torneos(id)   on delete cascade,
  jugador_id    uuid not null references public.jugadores(id) on delete cascade,
  grupo_id      uuid references public.grupos(id) on delete set null,
  estado        text not null default 'activo',
  inscrito_en   timestamptz not null default now(),
  retirado_en   timestamptz,
  motivo        text,
  resolucion    text,
  reemplazo_id  uuid references public.jugadores(id) on delete set null,
  registrado_por uuid references auth.users(id) on delete set null,
  solicitud_id  uuid,
  resultado     jsonb,
  primary key (torneo_id, jugador_id),
  constraint tp_estado_valido check (estado in ('activo', 'retirado')),
  constraint tp_resolucion_valida check (resolucion in ('ninguna', 'reemplazo', 'jornada_libre'))
);

-- Columnas adicionales si el entorno ya tenía la tabla de la propuesta 1.4.1.
alter table public.torneo_participantes add column if not exists grupo_id       uuid references public.grupos(id) on delete set null;
alter table public.torneo_participantes add column if not exists estado        text not null default 'activo';
alter table public.torneo_participantes add column if not exists retirado_en   timestamptz;
alter table public.torneo_participantes add column if not exists motivo        text;
alter table public.torneo_participantes add column if not exists resolucion    text;
alter table public.torneo_participantes add column if not exists reemplazo_id  uuid references public.jugadores(id) on delete set null;
alter table public.torneo_participantes add column if not exists registrado_por uuid references auth.users(id) on delete set null;
alter table public.torneo_participantes add column if not exists solicitud_id  uuid;
alter table public.torneo_participantes add column if not exists resultado     jsonb;

-- Si el entorno ya tenía la tabla 1.4.1, estas restricciones se agregan sin
-- reescribir filas existentes (el backfill de abajo solo inserta).
do $ddl$ begin
  if not exists (select 1 from pg_constraint where conname = 'tp_estado_valido' and conrelid = 'public.torneo_participantes'::regclass) then
    alter table public.torneo_participantes add constraint tp_estado_valido
      check (estado in ('activo', 'retirado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tp_resolucion_valida' and conrelid = 'public.torneo_participantes'::regclass) then
    alter table public.torneo_participantes add constraint tp_resolucion_valida
      check (resolucion in ('ninguna', 'reemplazo', 'jornada_libre'));
  end if;
end $ddl$;

-- Garantía estructural para las dos instalaciones admitidas:
-- A) sin torneo_participantes (create table arriba) y
-- B) con la propuesta 1.4.1 ya aplicada (PK + FK a torneos/jugadores).
-- La ON CONFLICT del backfill exige unicidad EXACTA en (torneo_id, jugador_id);
-- si una instalación heredera no la tuviera, se crea. La comparación usa
-- igualdad de arreglos, no contención (@>), para rechazar restricciones con
-- columnas adicionales. Las FK se comprueban por tabla y columnas exactas, no
-- por nombre, para no duplicar las de 1.4.1.
do $ddl$ begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.torneo_participantes'::regclass
      and c.contype in ('p', 'u')
      and c.conkey = (
        select array_agg(a.attnum order by a.attnum)::smallint[]
        from pg_attribute a
        where a.attrelid = c.conrelid
          and a.attname in ('torneo_id', 'jugador_id')
      )
  ) then
    create unique index if not exists torneo_participantes_torneo_jugador_uidx
      on public.torneo_participantes (torneo_id, jugador_id);
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.torneo_participantes'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.torneos'::regclass
      and c.conkey = (
        select array_agg(a.attnum order by a.attnum)::smallint[]
        from pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'torneo_id'
      )
      and c.confkey = (
        select array_agg(a.attnum order by a.attnum)::smallint[]
        from pg_attribute a
        where a.attrelid = c.confrelid and a.attname = 'id'
      )
  ) then
    alter table public.torneo_participantes add constraint tp_torneo_fk
      foreign key (torneo_id) references public.torneos(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.torneo_participantes'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.jugadores'::regclass
      and c.conkey = (
        select array_agg(a.attnum order by a.attnum)::smallint[]
        from pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'jugador_id'
      )
      and c.confkey = (
        select array_agg(a.attnum order by a.attnum)::smallint[]
        from pg_attribute a
        where a.attrelid = c.confrelid and a.attname = 'id'
      )
  ) then
    alter table public.torneo_participantes add constraint tp_jugador_fk
      foreign key (jugador_id) references public.jugadores(id) on delete cascade;
  end if;
end $ddl$;

-- Unicidad: un torneo + jugador una sola vez; una solicitud, una sola baja.
create index if not exists torneo_participantes_jugador_idx
  on public.torneo_participantes (jugador_id, torneo_id);
create unique index if not exists torneo_participantes_solicitud_uidx
  on public.torneo_participantes (torneo_id, solicitud_id)
  where solicitud_id is not null;

-- Backfill aditivo: solo evidencia real de pertenencia a un grupo del torneo.
insert into public.torneo_participantes (torneo_id, jugador_id, grupo_id)
select g.torneo_id, gj.jugador_id, g.id
from public.grupo_jugadores gj
join public.grupos g on g.id = gj.grupo_id
where g.torneo_id is not null
-- Si ya existía con grupo_id vacío, se completa; si ya tenía grupo, se respeta.
on conflict (torneo_id, jugador_id) do update
set grupo_id = coalesce(torneo_participantes.grupo_id, excluded.grupo_id);

comment on table public.torneo_participantes is
  'Plantel inscripto por torneo. Un retiro cambia estado a retirado; nunca elimina el jugador global.';

-- ----------------------------------------------------------------------------
-- 2) Partidos: campos propios para la resolución por baja.
--    No se crea un marcador falso: 'jornada_libre' guarda 3-0 reglamentario
--    con motivo, autoría y jugador retirado identificados.
-- ----------------------------------------------------------------------------
-- Resolución (solo cuando el partido deja de estar pendiente).
alter table public.partidos add column if not exists motivo_resolucion      text;
alter table public.partidos add column if not exists resuelto_por           uuid references auth.users(id) on delete set null;
alter table public.partidos add column if not exists resuelto_en            timestamptz;
alter table public.partidos add column if not exists participante_retirado_id uuid references public.jugadores(id) on delete set null;
alter table public.partidos add column if not exists solicitud_id           uuid;

-- Reasignación (el partido SIGUE pendiente): campos distintos de los de
-- resolución. Ninguno de estos valores implica que el partido se disputó.
alter table public.partidos add column if not exists reasignado_por         uuid references auth.users(id) on delete set null;
alter table public.partidos add column if not exists reasignado_en          timestamptz;
alter table public.partidos add column if not exists reasignado_motivo      text;

comment on column public.partidos.estado is
  'Incluye jornada_libre: 3-0 reglamentario por baja, distinto de walkover_* aunque coincida en puntos.';

-- ----------------------------------------------------------------------------
-- 3) RLS de la tabla NUEVA. No se tocan políticas de tablas existentes.
-- ----------------------------------------------------------------------------
alter table public.torneo_participantes enable row level security;

-- Si 1.4.1 ya aplicó estas políticas, se conservan tal cual: no se hace
-- DROP/CREATE sobre una política existente. Solo se crean las que falten.
do $ddl$ begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='torneo_participantes'
      and policyname='tp_select') then
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
  end if;
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='torneo_participantes'
      and policyname='tp_admin_write') then
    create policy tp_admin_write on public.torneo_participantes
      for all to authenticated
      using (public.gl_es_admin()) with check (public.gl_es_admin());
  end if;
end $ddl$;

-- Solo se retira el acceso anónimo/PÚBLICO si la tabla nueva lo heredó de
-- default privileges. No se revoca nada a authenticated ni a service_role.
do $ddl$ begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='torneo_participantes'
      and grantee in ('anon', 'public')
  ) then
    revoke all on public.torneo_participantes from public, anon;
  end if;
end $ddl$;
-- GRANT es aditivo: conserva lo que 1.4.1 ya hubiera otorgado y agrega UPDATE.
grant select, insert, update, delete on public.torneo_participantes to authenticated;
grant all on public.torneo_participantes to service_role;

-- ----------------------------------------------------------------------------
-- 4) Inscripción (la propuesta 1.4.1 pendiente, integrada aquí).
--    Permite que quien abandonó 2026 vuelva a inscribirse en 2027 sin alta nueva.
-- ----------------------------------------------------------------------------
create or replace function public.gl_inscribir_participantes(
  p_torneo_id uuid,
  p_jugador_ids uuid[]
)
returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_inscritos integer := 0;
  v_pid uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no autenticada'; end if;
  if not public.gl_es_admin() then raise exception 'No autorizado'; end if;
  if p_torneo_id is null then raise exception 'Torneo no válido'; end if;

  -- Cerrojo de torneo: inscripción y sustitución se serializan entre sí.
  -- Sin este bloqueo, dos administradores podrían verificar "no participa"
  -- al mismo tiempo y competir por la misma fila.
  perform 1 from public.torneos t where t.id = p_torneo_id for update;
  if not found then raise exception 'Torneo no válido'; end if;

  p_jugador_ids := coalesce(p_jugador_ids, '{}'::uuid[]);
  foreach v_pid in array p_jugador_ids loop
    if not exists (select 1 from public.jugadores j where j.id = v_pid and j.rol = 'jugador') then
      raise exception 'Participante no válido para el torneo: %', v_pid::text;
    end if;
  end loop;

  insert into public.torneo_participantes (torneo_id, jugador_id)
  select p_torneo_id, u.jugador_id
  from unnest(p_jugador_ids) as u(jugador_id)
  on conflict (torneo_id, jugador_id) do nothing;
  get diagnostics v_inscritos = row_count;

  -- NO se toca jugadores.torneo_id: la pertenencia a cada competencia la
  -- define torneo_participantes. El puntero global queda como dato histórico
  -- del contexto del jugador y no se reescribe al inscribirlo en otro torneo.

  return jsonb_build_object('ok', true, 'torneo_id', p_torneo_id,
    'inscritos', v_inscritos, 'mensaje', 'Participantes inscriptos en el torneo.');
exception when others then
  return jsonb_build_object('ok', false,
    'mensaje', 'No se pudieron inscribir los participantes: ' || sqlerrm);
end;
$fn$;

revoke all on function public.gl_inscribir_participantes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.gl_inscribir_participantes(uuid, uuid[]) to authenticated;
-- service_role conserva el acceso para integraciones existentes.
grant execute on function public.gl_inscribir_participantes(uuid, uuid[]) to service_role;

-- ----------------------------------------------------------------------------
-- 5) Ventana de reemplazo: evaluación inequívoca en BD.
--    Regla: hace falta que las jornadas 1..6 estén cerradas EN SECUENCIA y que
--    la jornada 7 NO esté cerrada. Si la 7 se cerró, el plazo queda cerrado
--    para siempre. Un hueco en 1..6 bloquea hasta que se corrija la secuencia.
--    Sin reloj del navegador, sin created_at y sin fecha inventada.
-- ----------------------------------------------------------------------------
create or replace function public.gl_evaluar_plazo_reemplazo(
  p_torneo_id uuid,
  p_grupo_id uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_j7_cerrada boolean := false;
  v_cerradas_1_6 integer := 0;
  v_faltantes integer[] := '{}'::integer[];
  v_permitido boolean := false;
  v_motivo text;
begin
  if auth.uid() is null then raise exception 'Sesión no autenticada'; end if;
  if not public.gl_es_admin() then raise exception 'No autorizado'; end if;

  if p_torneo_id is null or p_grupo_id is null then
    return jsonb_build_object(
      'permitido', false, 'motivo', 'sin_grupo',
      'jornada_7_cerrada', false, 'jornadas_1_6_cerradas', 0,
      'faltantes', '[]'::jsonb,
      'inicio', 'Jornada 1', 'limite', 'Cierre de la Jornada 7'
    );
  end if;

  -- Cierre explícito de la jornada 7: no basta con contar cerradas.
  select exists (
    select 1 from public.jornadas j
    where j.torneo_id = p_torneo_id
      and j.grupo_id = p_grupo_id
      and j.numero = 7
      and j.estado = 'cerrada'
  ) into v_j7_cerrada;

  select count(*) into v_cerradas_1_6
  from public.jornadas j
  where j.torneo_id = p_torneo_id
    and j.grupo_id = p_grupo_id
    and j.numero between 1 and 6
    and j.estado = 'cerrada';

  -- Un hueco (por ejemplo 1,2,3,4,6) invalida la secuencia.
  select coalesce(array_agg(n order by n), '{}'::integer[]) into v_faltantes
  from generate_series(1, 6) as n
  where not exists (
    select 1 from public.jornadas j
    where j.torneo_id = p_torneo_id
      and j.grupo_id = p_grupo_id
      and j.numero = n
      and j.estado = 'cerrada'
  );

  if v_j7_cerrada then
    v_permitido := false;
    v_motivo := 'jornada_7_cerrada';
  elsif cardinality(v_faltantes) > 0 then
    v_permitido := false;
    v_motivo := 'secuencia_incompleta';
  else
    v_permitido := true;
    v_motivo := 'dentro_del_plazo';
  end if;

  return jsonb_build_object(
    'permitido', v_permitido,
    'motivo', v_motivo,
    'jornada_7_cerrada', v_j7_cerrada,
    'jornadas_1_6_cerradas', v_cerradas_1_6,
    'faltantes', to_jsonb(v_faltantes),
    'inicio', 'Jornada 1',
    'limite', 'Cierre de la Jornada 7'
  );
end;
$fn$;

revoke all on function public.gl_evaluar_plazo_reemplazo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gl_evaluar_plazo_reemplazo(uuid, uuid) to authenticated;
grant execute on function public.gl_evaluar_plazo_reemplazo(uuid, uuid) to service_role;

create or replace function public.gl_ventana_reemplazo(
  p_torneo_id uuid,
  p_jugador_id uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_grupo_id uuid;
  v_estado text;
  v_plazo jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión no autenticada'; end if;
  if not public.gl_es_admin() then raise exception 'No autorizado'; end if;

  select tp.grupo_id, tp.estado into v_grupo_id, v_estado
  from public.torneo_participantes tp
  where tp.torneo_id = p_torneo_id and tp.jugador_id = p_jugador_id;

  -- Compatibilidad con torneos anteriores al backfill: se deriva del grupo real.
  if v_grupo_id is null then
    select g.id into v_grupo_id
    from public.grupo_jugadores gj
    join public.grupos g on g.id = gj.grupo_id
    where gj.jugador_id = p_jugador_id and g.torneo_id = p_torneo_id
    limit 1;
  end if;
  v_estado := coalesce(v_estado, 'activo');

  v_plazo := public.gl_evaluar_plazo_reemplazo(p_torneo_id, v_grupo_id);

  return jsonb_build_object(
    'ok', true,
    'torneo_id', p_torneo_id,
    'jugador_id', p_jugador_id,
    'grupo_id', v_grupo_id,
    'estado_participacion', v_estado,
    'plazo', v_plazo,
    'jornadas_1_6_cerradas', v_plazo->'jornadas_1_6_cerradas',
    'jornada_7_cerrada', v_plazo->'jornada_7_cerrada',
    'faltantes', v_plazo->'faltantes',
    'motivo_plazo', v_plazo->>'motivo',
    'plazo_jornadas', 7,
    'reemplazo_permitido', ((v_plazo->>'permitido')::boolean and v_estado = 'activo'),
    'inicio', 'Jornada 1',
    'limite', 'Cierre de la Jornada 7'
  );
end;
$fn$;

revoke all on function public.gl_ventana_reemplazo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gl_ventana_reemplazo(uuid, uuid) to authenticated;
grant execute on function public.gl_ventana_reemplazo(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 6) Operación atómica: baja con reemplazo opcional.
--    Una sola RPC hace participante + grupo + partidos + historial + clasificación
--    + auditoría. Si algo falla, rollback completo.
--    p_solicitud_id hace idempotente el doble clic, el timeout y el reintento.
-- ----------------------------------------------------------------------------
create or replace function public.gl_gestionar_baja(
  p_torneo_id uuid,
  p_jugador_id uuid,
  p_motivo text,
  p_solicitud_id uuid,
  p_reemplazo_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_admin_jugador_id uuid;
  v_partido record;
  v_grupo_id uuid;
  v_grupo_original uuid;
  v_plazo jsonb;
  v_recalculo json;
  v_estado text;
  v_ya jsonb;
  v_resultado jsonb;
  v_reasignados integer := 0;
  v_resueltos integer := 0;
  v_tipo text;
  v_grupo_recalculo uuid;
  v_grupos_afectados uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null then raise exception 'Sesión no autenticada'; end if;
  if not public.gl_es_admin() then raise exception 'No autorizado'; end if;
  if p_torneo_id is null or p_jugador_id is null then raise exception 'Torneo y jugador son obligatorios'; end if;
  if p_solicitud_id is null then raise exception 'Falta el identificador de la solicitud'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'El motivo de la baja es obligatorio'; end if;

  -- Cerrojo de torneo PRIMERO: inscripción y sustitución comparten el mismo
  -- orden de bloqueo, por lo que no pueden incorporar al mismo jugador.
  perform 1 from public.torneos t where t.id = p_torneo_id for update;
  if not found then raise exception 'Torneo no válido'; end if;

  select id into v_admin_jugador_id from public.jugadores where user_id = auth.uid() and rol = 'admin' limit 1;
  if v_admin_jugador_id is null then raise exception 'No autorizado'; end if;

  -- Cerrojo de fila del participante saliente.
  select tp.grupo_id, tp.estado, tp.resultado into v_grupo_id, v_estado, v_ya
  from public.torneo_participantes tp
  where tp.torneo_id = p_torneo_id and tp.jugador_id = p_jugador_id
  for update;

  if not found then
    raise exception 'El jugador no está inscripto en este torneo.';
  end if;

  -- Reintento tras timeout o doble clic: devuelve el resultado ya guardado.
  if v_estado = 'retirado' or v_ya is not null then
    return coalesce(v_ya, jsonb_build_object(
      'ok', true, 'ya_aplicado', true, 'estado', 'retirado',
      'solicitud_id', p_solicitud_id
    )) || jsonb_build_object('ya_aplicado', true);
  end if;

  if v_estado <> 'activo' then
    raise exception 'La participación no está activa.';
  end if;

  -- Recuperación del grupo: torneo_participantes -> grupo_jugadores ->
  -- partidos del torneo. Nunca se acepta un reemplazo sin grupo resuelto.
  v_grupo_original := v_grupo_id;
  if v_grupo_id is null then
    select gj.grupo_id into v_grupo_id
    from public.grupo_jugadores gj
    join public.grupos g on g.id = gj.grupo_id
    where gj.jugador_id = p_jugador_id and g.torneo_id = p_torneo_id
    limit 1;
  end if;
  if v_grupo_id is null then
    select p.grupo_id into v_grupo_id
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and (p.local_id = p_jugador_id or p.visitante_id = p_jugador_id)
      and p.grupo_id is not null
    order by p.jornada, p.id
    limit 1;
  end if;
  if v_grupo_id is not null and v_grupo_original is null then
    update public.torneo_participantes tp
    set grupo_id = v_grupo_id
    where tp.torneo_id = p_torneo_id and tp.jugador_id = p_jugador_id;
  end if;

  -- Sincronización REAL con el cierre de jornada, demostrable por modos de
  -- bloqueo de PostgreSQL (no por orden de filas):
  --   * gl_cerrar_jornada_interno desplegado ejecuta UPDATE sobre partidos
  --     (pasos 4-6) y sobre jornadas (paso 7). Todo UPDATE mantiene
  --     RowExclusiveLock a nivel de TABLA hasta que la transacción termina.
  --   * SHARE ROW EXCLUSIVE entra en conflicto con RowExclusiveLock. Por eso
  --     esta operación espera a cualquier cierre que esté escribiendo, y un
  --     cierre que intente escribir espera a esta operación.
  --   * Se piden las tablas en orden fijo (partidos -> jornadas), que es el
  --     mismo orden en que el cierre desplegado ejecuta sus UPDATE. No hay
  --     inversión de orden ni dependencia del plan de consulta.
  -- No se modifica la función de cierre: basta con el modo de bloqueo.
  lock table public.partidos in share row exclusive mode;
  lock table public.jornadas in share row exclusive mode;

  -- Evaluación del plazo con las tablas protegidas contra escritores. Si otra
  -- transacción cerró la J7, esta operación espera a que confirme y lee el estado final.
  v_plazo := public.gl_evaluar_plazo_reemplazo(p_torneo_id, v_grupo_id);

  if p_reemplazo_id is not null then
    --------------------------------------------------------------------------
    -- CASO A: reemplazo dentro del plazo (1..6 cerradas y 7 NO cerrada).
    --------------------------------------------------------------------------
    if v_grupo_id is null then
      raise exception 'No se pudo resolver el grupo del participante; el reemplazo no se incorpora sin grupo.';
    end if;
    if (v_plazo->>'permitido')::boolean is not true then
      raise exception 'Plazo de reemplazo cerrado: %', v_plazo->>'motivo';
    end if;
    if p_reemplazo_id = p_jugador_id then
      raise exception 'El reemplazo debe ser otro jugador.';
    end if;
    if not exists (
      select 1 from public.jugadores j
      where j.id = p_reemplazo_id and j.rol = 'jugador' and j.activo is true
    ) then
      raise exception 'El reemplazo debe ser un jugador registrado y activo.';
    end if;

    -- Bajo el cerrojo de torneo, bloqueamos también la fila del entrante si
    -- ya existiera. Una inscripción simultánea espera al mismo cerrojo.
    perform 1 from public.torneo_participantes tp
    where tp.torneo_id = p_torneo_id and tp.jugador_id = p_reemplazo_id
    for update;
    if exists (
      select 1 from public.torneo_participantes tp
      where tp.torneo_id = p_torneo_id and tp.jugador_id = p_reemplazo_id
    ) or exists (
      select 1 from public.grupo_jugadores gj
      join public.grupos g on g.id = gj.grupo_id
      where g.torneo_id = p_torneo_id and gj.jugador_id = p_reemplazo_id
    ) then
      raise exception 'Ese jugador ya participa en este torneo.';
    end if;

    update public.torneo_participantes
    set estado = 'retirado', retirado_en = now(), motivo = p_motivo,
        resolucion = 'reemplazo', reemplazo_id = p_reemplazo_id,
        registrado_por = auth.uid(), solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and jugador_id = p_jugador_id;

    insert into public.torneo_participantes
      (torneo_id, jugador_id, grupo_id, estado, inscrito_en, registrado_por)
    values (p_torneo_id, p_reemplazo_id, v_grupo_id, 'activo', now(), auth.uid())
    on conflict (torneo_id, jugador_id) do nothing;

    -- No se modifica jugadores.torneo_id: torneo_participantes es la única
    -- fuente de pertenencia por torneo.

    -- Grupos de los pendientes que se van a reasignar. Se consultan con las
    -- tablas ya bloqueadas, sin FOR UPDATE de filas: el bloqueo de tabla
    -- SHARE ROW EXCLUSIVE excluye a cualquier otro escritor.
    select coalesce(array_agg(distinct p.grupo_id), '{}'::uuid[])
      into v_grupos_afectados
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.estado = 'pendiente'
      and (p.local_id = p_jugador_id or p.visitante_id = p_jugador_id)
      and p.grupo_id is not null;

    -- El entrante ocupa el lugar competitivo; el saliente NO se elimina de
    -- grupo_jugadores: esa fila es la evidencia histórica de pertenencia que
    -- usan Historial de grupos, recalcular_clasificacion_interno y el perfil.
    -- La baja se representa en torneo_participantes (estado='retirado'), no
    -- borrando la membresía. La UI debe filtrar el plantel activo por estado.
    -- Se inscribe en TODOS los grupos con pendientes ANTES de tocar partidos:
    -- el trigger desplegado fn_validar_jugadores_partido exige que local y
    -- visitante ya pertenezcan al grupo del partido.
    if v_grupo_id is not null
       and not (v_grupo_id = any(v_grupos_afectados)) then
      v_grupos_afectados := array_append(v_grupos_afectados, v_grupo_id);
    end if;
    foreach v_grupo_recalculo in array v_grupos_afectados loop
      insert into public.grupo_jugadores (grupo_id, jugador_id)
      values (v_grupo_recalculo, p_reemplazo_id)
      on conflict do nothing;
    end loop;

    -- Reasignación, NO resolución: el partido sigue 'pendiente', conserva
    -- jornada, grupo y rival; cambia solo el participante saliente. Se
    -- registran campos propios de reasignación, nunca los de resolución.
    update public.partidos
    set local_id = p_reemplazo_id, updated_at = now(),
        reasignado_por = auth.uid(), reasignado_en = now(),
        reasignado_motivo = 'Reemplazo de participante dentro del plazo',
        solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and estado = 'pendiente' and local_id = p_jugador_id;
    get diagnostics v_reasignados = row_count;

    update public.partidos
    set visitante_id = p_reemplazo_id, updated_at = now(),
        reasignado_por = auth.uid(), reasignado_en = now(),
        reasignado_motivo = 'Reemplazo de participante dentro del plazo',
        solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and estado = 'pendiente' and visitante_id = p_jugador_id;
    get diagnostics v_resueltos = row_count;
    v_reasignados := v_reasignados + v_resueltos;

    v_tipo := 'reemplazo';
    v_resultado := jsonb_build_object(
      'ok', true, 'tipo', v_tipo, 'ya_aplicado', false,
      'torneo_id', p_torneo_id, 'jugador_saliente', p_jugador_id,
      'jugador_entrante', p_reemplazo_id, 'grupo_id', v_grupo_id,
      'plazo', v_plazo,
      'partidos_pendientes_reasignados', v_reasignados,
      'resultados_anteriores', 'conservados en el jugador saliente',
      'solicitud_id', p_solicitud_id
    );
  else
    --------------------------------------------------------------------------
    -- CASO B: retiro sin reemplazo. Solo partidos PENDIENTES se resuelven.
    -- Los resultados ya cargados (incluida la jornada recién cerrada) quedan.
    --------------------------------------------------------------------------
    for v_partido in
      select id, grupo_id, estado, goles_local, goles_visitante
      from public.partidos
      where torneo_id = p_torneo_id
        and estado = 'pendiente'
        and (local_id = p_jugador_id or visitante_id = p_jugador_id)
      order by jornada, id
      for update
    loop
      insert into public.partidos_historial
        (partido_id, torneo_id, registrado_por, goles_local_ant, goles_visita_ant,
         estado_ant, goles_local_nuevo, goles_visita_nuevo, estado_nuevo, motivo)
      values
        (v_partido.id, p_torneo_id, v_admin_jugador_id,
         v_partido.goles_local, v_partido.goles_visitante, v_partido.estado,
         case when exists (select 1 from public.partidos p where p.id = v_partido.id and p.local_id = p_jugador_id) then 0 else 3 end,
         case when exists (select 1 from public.partidos p where p.id = v_partido.id and p.local_id = p_jugador_id) then 3 else 0 end,
         'jornada_libre', p_motivo);

      update public.partidos
      set estado = 'jornada_libre',
          goles_local = case when local_id = p_jugador_id then 0 else 3 end,
          goles_visitante = case when local_id = p_jugador_id then 3 else 0 end,
          motivo_resolucion = 'Jornada libre por baja del torneo (3-0 al rival)',
          participante_retirado_id = p_jugador_id,
          resuelto_por = auth.uid(), resuelto_en = now(),
          ingresado_por = v_admin_jugador_id,
          solicitud_id = p_solicitud_id,
          updated_at = now()
      where id = v_partido.id and estado = 'pendiente';

      v_resueltos := v_resueltos + 1;
      if v_partido.grupo_id is not null
         and not (v_partido.grupo_id = any(v_grupos_afectados)) then
        v_grupos_afectados := array_append(v_grupos_afectados, v_partido.grupo_id);
      end if;
    end loop;

    update public.torneo_participantes
    set estado = 'retirado', retirado_en = now(), motivo = p_motivo,
        resolucion = 'jornada_libre', registrado_por = auth.uid(),
        solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and jugador_id = p_jugador_id;

    -- La fila de grupo se conserva como evidencia histórica; el estado
    -- 'retirado' es lo que lo excluye del plantel activo en la interfaz.
    v_tipo := 'retiro';
    v_resultado := jsonb_build_object(
      'ok', true, 'tipo', v_tipo, 'ya_aplicado', false,
      'torneo_id', p_torneo_id, 'jugador_id', p_jugador_id,
      'grupo_id', v_grupo_id, 'plazo', v_plazo,
      'partidos_resueltos', v_resueltos,
      'criterio', '3-0 al rival en cada pendiente; mismo calculo que walkover, motivo propio',
      'resultados_anteriores', 'conservados sin cambios',
      'cuenta_global', 'conservada',
      'solicitud_id', p_solicitud_id
    );
  end if;

  -- Recálculo de tabla DENTRO de la misma transacción, tanto en reemplazo
  -- como en retiro. En el reemplazo, recalcular_clasificacion_interno lee
  -- grupo_jugadores (donde siguen el saliente y el entrante) y excluye los
  -- partidos pendientes: el saliente conserva sus resultados anteriores y
  -- el entrante aparece con 0 PJ hasta que se juegue su partido. Las
  -- estadísticas de ambos quedan separadas porque el recálculo filtra por
  -- local_id / visitante_id de cada partido.
  if v_grupo_id is not null and not (v_grupo_id = any(v_grupos_afectados)) then
    v_grupos_afectados := array_append(v_grupos_afectados, v_grupo_id);
  end if;
  foreach v_grupo_recalculo in array v_grupos_afectados loop
    v_recalculo := public.recalcular_clasificacion_interno(p_torneo_id, v_grupo_recalculo);
    if coalesce(v_recalculo->>'ok', 'false') <> 'true' then
      raise exception 'No se pudo recalcular la clasificación del grupo %: %',
        v_grupo_recalculo, coalesce(v_recalculo->>'error', 'error desconocido');
    end if;
  end loop;
  v_resultado := v_resultado || jsonb_build_object(
    'grupos_recalculados', to_jsonb(v_grupos_afectados));

  -- Resultado DEFINITIVO guardado antes de auditar. Así la respuesta original
  -- y la de un reintento idéntico son la misma, incluidos los grupos
  -- recalculados. No se guarda el resultado preliminar de arriba.
  update public.torneo_participantes
  set resultado = v_resultado
  where torneo_id = p_torneo_id and jugador_id = p_jugador_id;

  -- Auditoría en la tabla que lee la pantalla (sobrecarga de 7 argumentos).
  perform public.gl_registrar_auditoria(
    p_torneo_id, v_grupo_id, 'participante_' || v_tipo, 'participante',
    p_jugador_id, auth.uid(),
    v_resultado || jsonb_build_object(
      'estado_anterior', 'activo',
      'estado_nuevo', 'retirado',
      'motivo', p_motivo,
      'autorizado_por', auth.uid(),
      'fecha', now()
    )
  );

  return v_resultado;
exception when others then
  return jsonb_build_object(
    'ok', false,
    'mensaje', 'No se pudo gestionar la baja: ' || sqlerrm,
    'solicitud_id', p_solicitud_id
  );
end;
$fn$;

revoke all on function public.gl_gestionar_baja(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.gl_gestionar_baja(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.gl_gestionar_baja(uuid, uuid, text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICACIÓN POSTERIOR (SOLO LECTURA), después de la aprobación:
--
-- select tp.estado, count(*) from public.torneo_participantes tp
--   join public.torneos t on t.id=tp.torneo_id
--   where t.estado='activo' group by tp.estado;
--
-- select tp.jugador_id, tp.estado, tp.motivo, tp.resolucion, tp.retirado_en
--   from public.torneo_participantes tp where tp.estado='retirado';
--
-- select p.jornada, p.estado, p.goles_local, p.goles_visitante,
--        p.motivo_resolucion, p.participante_retirado_id
--   from public.partidos p where p.estado='jornada_libre' order by p.jornada;
--
-- select accion, entidad_id, detalle from public.auditoria_eventos
--   where entidad_tipo='participante' order by created_at desc limit 20;
--
-- select jugador_id, torneo_id, estado from public.torneo_participantes
--   where jugador_id = 'f35fa5f0-743f-43e8-8238-494bdd8c7efa';
-- ============================================================================
