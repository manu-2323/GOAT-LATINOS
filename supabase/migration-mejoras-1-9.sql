-- ===========================================================================
-- GOATS LATINOS · Migración de mejoras 1, 2, 3 y 7
-- Idempotente: se puede ejecutar las veces que sea necesario.
-- Incluye: tabla de países, foto de perfil, super_admin, bucket de avatares,
-- políticas RLS de países y protección de campos sensibles en jugadores.
-- Las claves secretas NO aparecen aquí.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Países dinámicos
-- ---------------------------------------------------------------------------
create table if not exists public.paises (
  id         uuid primary key default gen_random_uuid(),
  codigo     varchar(2) not null unique,
  nombre     varchar(80) not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint paises_codigo_formato check (codigo ~ '^[A-Z]{2}$')
);

insert into public.paises (codigo, nombre, activo) values
  ('AR', 'Argentina', true),
  ('BO', 'Bolivia', true),
  ('BR', 'Brasil', true),
  ('CL', 'Chile', true),
  ('CO', 'Colombia', true),
  ('CR', 'Costa Rica', true),
  ('EC', 'Ecuador', true),
  ('GT', 'Guatemala', true),
  ('HN', 'Honduras', true),
  ('MX', 'México', true),
  ('NI', 'Nicaragua', true),
  ('PA', 'Panamá', true),
  ('PE', 'Perú', true),
  ('PY', 'Paraguay', true),
  ('SV', 'El Salvador', true),
  ('VE', 'Venezuela', true)
on conflict (codigo) do update set nombre = excluded.nombre, activo = true;

-- Columnas nuevas en jugadores (deben existir antes que el helper y las políticas).
alter table public.jugadores add column if not exists super_admin boolean not null default false;
alter table public.jugadores add column if not exists avatar_url text;
comment on column public.jugadores.super_admin is 'Único administrador con permiso para gestionar otros administradores';
comment on column public.jugadores.avatar_url is 'URL pública de la foto de perfil en el bucket avatares';

-- Helper de super_admin (se crea antes de las políticas que lo usan).
create or replace function public.gl_es_super_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from jugadores j
    where j.user_id = auth.uid() and j.rol = 'admin' and j.super_admin = true
  );
$$;

alter table public.paises enable row level security;
grant usage on schema public to anon, authenticated;
grant select on public.paises to anon, authenticated;
grant all on public.paises to authenticated;

drop policy if exists gl_paises_read on public.paises;
create policy gl_paises_read on public.paises
  for select to anon, authenticated using (activo = true);

drop policy if exists gl_paises_super_admin on public.paises;
create policy gl_paises_super_admin on public.paises
  for all to authenticated
  using (public.gl_es_super_admin())
  with check (public.gl_es_super_admin());

-- ---------------------------------------------------------------------------
-- 2) Administrador principal inicial
-- ---------------------------------------------------------------------------
-- El administrador más antiguo existente pasa a ser super_admin (si lo hay).
update public.jugadores j
set super_admin = true
where j.rol = 'admin'
  and not exists (
    select 1 from public.jugadores x
    where x.super_admin = true
  )
  and j.id = (
    select id from public.jugadores
    where rol = 'admin'
    order by created_at asc
    limit 1
  );

-- Verificación de correo existente para el registro (devuelve solo booleano).
create or replace function public.gl_correo_existe(p_correo text)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from jugadores j
    where lower(j.email) = lower(p_correo)
  );
$$;
revoke all on function public.gl_correo_existe(text) from public;
grant execute on function public.gl_correo_existe(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Protección de rol y campos sensibles (reemplaza el trigger anterior)
-- ---------------------------------------------------------------------------
create or replace function public.gl_proteger_rol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.gl_es_super_admin() then
    return new;
  end if;

  -- El resto de usuarios no puede escalar privilegios ni alterar datos de liga.
  if new.rol is distinct from old.rol
     or new.activo is distinct from old.activo
     or new.suspendido is distinct from old.suspendido
     or new.torneo_id is distinct from old.torneo_id
     or new.super_admin is distinct from old.super_admin
     or new.email is distinct from old.email then
    raise exception 'No tenés permisos para modificar el rol o los datos de liga';
  end if;

  return new;
end; $$;

drop trigger if exists gl_proteger_rol on public.jugadores;
create trigger gl_proteger_rol before update on public.jugadores
  for each row execute function public.gl_proteger_rol();

-- ---------------------------------------------------------------------------
-- 5) Bucket de avatares (JPG/PNG, máx. 2 MB)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  true,
  2097152,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gl_avatares_read on storage.objects;
drop policy if exists gl_avatares_insert on storage.objects;
drop policy if exists gl_avatares_update on storage.objects;
drop policy if exists gl_avatares_delete on storage.objects;

create policy gl_avatares_read on storage.objects
  for select to public
  using (bucket_id = 'avatares');

-- Cada jugador solo puede escribir dentro de su propia carpeta (user_id).
create policy gl_avatares_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy gl_avatares_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy gl_avatares_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Fin del script.
