-- FASE 3.23 · Esquema aislado equivalente al de producción para pruebas SQL.
-- No se ejecuta contra Supabase. Los datos son sintéticos.
-- Las columnas, defaults, checks, únicos y foreign keys reproducen la
-- información leída en producción el 2026-11-26 (information_schema / pg_constraint).
-- gen_random_uuid() sustituye a extensions.uuid_generate_v4() (PG 19 WASM).

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('fase323.uid', true), '')::uuid;
$$;

create table public.torneos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  total_jornadas integer not null default 22
);

create table public.grupos (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id) on delete set null,
  nombre text
);

create table public.jugadores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  torneo_id uuid references public.torneos(id) on delete set null,
  nombre_usuario text unique,
  rol text not null default 'jugador',
  activo boolean not null default true,
  suspendido boolean not null default false
);

create table public.grupo_jugadores (
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  primary key (jugador_id, grupo_id)
);

create table public.jornadas (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id),
  grupo_id uuid references public.grupos(id),
  numero integer not null,
  estado text default 'cerrada',
  fecha date,
  created_at timestamptz default now(),
  fecha_inicio timestamptz,
  hora_limite timestamptz,
  unique (torneo_id, grupo_id, numero)
);

create table public.partidos (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id),
  grupo_id uuid references public.grupos(id),
  jornada integer not null check (jornada between 1 and 44),
  local_id uuid references public.jugadores(id),
  visitante_id uuid references public.jugadores(id),
  goles_local integer check (goles_local is null or goles_local between 0 and 99),
  goles_visitante integer check (goles_visitante is null or goles_visitante between 0 and 99),
  estado text default 'pendiente',
  tiros_local integer check (tiros_local is null or tiros_local >= 0),
  tiros_puerta_local integer check (tiros_puerta_local is null or tiros_local is null or (tiros_puerta_local >= 0 and tiros_puerta_local <= tiros_local)),
  posesion_local integer check (posesion_local is null or posesion_local between 0 and 100),
  pase_local integer check (pase_local is null or pase_local between 0 and 100),
  tiros_visitante integer check (tiros_visitante is null or tiros_visitante >= 0),
  tiros_puerta_visitante integer check (tiros_puerta_visitante is null or tiros_visitante is null or (tiros_puerta_visitante >= 0 and tiros_puerta_visitante <= tiros_visitante)),
  posesion_visitante integer check (posesion_visitante is null or posesion_visitante between 0 and 100),
  pase_visitante integer check (pase_visitante is null or pase_visitante between 0 and 100),
  check (posesion_local is null or posesion_visitante is null or posesion_local + posesion_visitante = 100),
  captura_url text,
  ingresado_por uuid references public.jugadores(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  es_extra boolean default false,
  unique (torneo_id, grupo_id, jornada, local_id, visitante_id)
);

create table public.clasificacion (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id),
  grupo_id uuid references public.grupos(id),
  jugador_id uuid references public.jugadores(id),
  pj integer default 0,
  pg integer default 0,
  pe integer default 0,
  pp integer default 0,
  gf integer default 0,
  gc integer default 0,
  dif integer default 0,
  pts integer default 0,
  pts_penalizacion integer default 0,
  updated_at timestamptz default now(),
  unique (torneo_id, grupo_id, jugador_id)
);

create table public.sanciones (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id),
  jugador_id uuid references public.jugadores(id),
  puntos_descuento integer not null default 0,
  motivo text
);

create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id) on delete set null,
  accion text not null,
  entidad_tipo text not null,
  entidad_id uuid,
  realizado_por uuid references auth.users(id) on delete set null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.auditoria_eventos (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id) on delete set null,
  grupo_id uuid references public.grupos(id) on delete set null,
  accion text not null,
  entidad_tipo text,
  entidad_id uuid,
  realizado_por uuid,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.bitacora_jornadas (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id),
  grupo_id uuid references public.grupos(id),
  jornada integer not null,
  partidos_resueltos integer not null default 0,
  cerrado_por uuid references auth.users(id),
  cerrado_at timestamptz not null default now()
);

create table public.partidos_historial (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  registrado_por uuid references public.jugadores(id),
  goles_local_ant integer,
  goles_visita_ant integer,
  estado_ant text,
  captura_url_ant text,
  goles_local_nuevo integer,
  goles_visita_nuevo integer,
  estado_nuevo text,
  captura_url_nuevo text,
  motivo text,
  created_at timestamptz not null default now()
);

-- Datos sintéticos. El admin tiene user_id distinto de jugadores.id, igual que
-- los dos administradores reales verificados en producción.
insert into auth.users (id, email) values
  ('33333333-3333-4333-8333-333333333333', 'admin@sintetico.local'),
  ('77777777-7777-4777-8777-777777777777', 'jugador@sintetico.local');

insert into public.torneos (id, nombre, total_jornadas) values
  ('11111111-1111-4111-8111-111111111111', 'Torneo sintético 3.23', 22);

insert into public.grupos (id, torneo_id, nombre) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Grupo A sintético');

insert into public.jugadores (id, user_id, torneo_id, nombre_usuario, rol, activo, suspendido) values
  ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'admin_sintetico', 'admin', true, false),
  ('55555555-5555-4555-8555-555555555555', null, '11111111-1111-4111-8111-111111111111', 'local_sintetico', 'jugador', true, false),
  ('66666666-6666-4666-8666-666666666666', null, '11111111-1111-4111-8111-111111111111', 'visitante_sintetico', 'jugador', true, false),
  ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'no_admin_sintetico', 'jugador', true, false);

-- Igual que producción: los administradores no pertenecen al grupo.
insert into public.grupo_jugadores (jugador_id, grupo_id) values
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222'),
  ('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222');
