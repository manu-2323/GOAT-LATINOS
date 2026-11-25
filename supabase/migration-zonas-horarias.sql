-- ===========================================================================
-- GOATS LATINOS · Horarios internacionales por jugador (mejora 16)
-- ===========================================================================
-- Antes: la franja horaria se deducía solo del país (PAISES[].horario).
-- Ahora: cada jugador guarda una zona IANA (zona_horaria) y el frontend
-- convierte el horario de referencia con Intl.DateTimeFormat.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Columna nueva con valor por defecto
-- ---------------------------------------------------------------------------
alter table public.jugadores add column if not exists zona_horaria text;

alter table public.jugadores
  alter column zona_horaria set default 'America/Managua';

comment on column public.jugadores.zona_horaria is
  'Zona horaria IANA elegida por el jugador (ej. America/Mexico_City). Permite conversiones con Intl y cambios estacionales.';

-- ---------------------------------------------------------------------------
-- 2) Backfill respetando el país histórico de cada jugador
-- ---------------------------------------------------------------------------
update public.jugadores
set zona_horaria = case upper(coalesce(pais, ''))
  when 'CR' then 'America/Costa_Rica'
  when 'NI' then 'America/Managua'
  when 'MX' then 'America/Mexico_City'
  when 'GT' then 'America/Guatemala'
  when 'HN' then 'America/Tegucigalpa'
  when 'SV' then 'America/El_Salvador'
  when 'CO' then 'America/Bogota'
  when 'EC' then 'America/Guayaquil'
  when 'PA' then 'America/Panama'
  when 'PE' then 'America/Lima'
  when 'VE' then 'America/Caracas'
  when 'BO' then 'America/La_Paz'
  when 'AR' then 'America/Argentina/Buenos_Aires'
  when 'CL' then 'America/Santiago'
  when 'PY' then 'America/Asuncion'
  when 'BR' then 'America/Sao_Paulo'
  else 'America/Managua'
end
where zona_horaria is null or btrim(zona_horaria) = '';

alter table public.jugadores alter column zona_horaria set not null;

-- Evita valores inventados que Intl.DateTimeFormat no pueda resolver.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jugadores_zona_horaria_formato'
  ) then
    alter table public.jugadores
      add constraint jugadores_zona_horaria_formato
      check (zona_horaria ~ '^[A-Za-z_]+/[A-Za-z0-9_+\-]+(/[A-Za-z0-9_+\-]+)*$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Vista pública: expone la zona (no expone correo, teléfono ni user_id)
-- ---------------------------------------------------------------------------
drop view if exists public.jugadores_publicos;

create view public.jugadores_publicos
with (security_invoker = false)
as
  select
    id,
    nombre_usuario,
    pais,
    zona_horaria,
    avatar_url,
    activo,
    suspendido,
    torneo_id,
    numero
  from public.jugadores;

grant select on public.jugadores_publicos to anon, authenticated;

-- Fin del script.
