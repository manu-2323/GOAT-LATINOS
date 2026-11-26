-- GOATS LATINOS · League Manager
-- Configuración idempotente para Supabase → SQL Editor.
-- Ejecutar una sola vez (o volver a ejecutar sin miedo a duplicar datos).
-- Incluye: columna opcional "numero", torneo/grupos iniciales, RLS, trigger de rol
-- y políticas del bucket de capturas. Las claves secretas NO van aquí.

-- ---------------------------------------------------------------------------
-- 1) Columna opcional de número de jugador
-- ---------------------------------------------------------------------------
alter table public.jugadores add column if not exists numero integer;
comment on column public.jugadores.numero is 'Número asignado por el administrador de la liga';

alter table public.jugadores add column if not exists email text;
comment on column public.jugadores.email is 'Correo de la cuenta vinculada (para gestionar administradores)';
create index if not exists jugadores_email_idx on public.jugadores (lower(email));

-- ---------------------------------------------------------------------------
-- 2) Torneo activo y grupos (idempotente)
-- ---------------------------------------------------------------------------
insert into public.torneos (nombre, temporada, estado, total_jornadas)
select 'GOATS LATINOS', 'Temporada 1', 'activo', 22
where not exists (
  select 1 from public.torneos
  where nombre = 'GOATS LATINOS' and temporada = 'Temporada 1'
);

with t as (
  select id from public.torneos
  where nombre = 'GOATS LATINOS' and temporada = 'Temporada 1'
  order by created_at desc limit 1
)
insert into public.grupos (torneo_id, nombre)
select t.id, g.nombre from t
cross join (values ('Grupo A'), ('Grupo B')) as g(nombre)
where not exists (
  select 1 from public.grupos existing
  where existing.torneo_id = t.id and existing.nombre = g.nombre
);

-- ---------------------------------------------------------------------------
-- 3) Función auxiliar y permisos base
-- ---------------------------------------------------------------------------
create or replace function public.gl_es_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from jugadores j
    where j.user_id = auth.uid() and j.rol = 'admin'
  );
$$;

grant usage on schema public to anon, authenticated;
/* FASE 2.3: jugadores es privado. anon solo lee la vista pública creada en
   migration-registro-seguro.sql y los catálogos sin datos personales. */
grant select on torneos, grupos, partidos, clasificacion, jornadas to anon, authenticated;
grant select on jugadores, grupo_jugadores, sanciones to authenticated;

alter table torneos         enable row level security;
alter table jugadores       enable row level security;
alter table grupos          enable row level security;
alter table grupo_jugadores enable row level security;
alter table partidos        enable row level security;
alter table sanciones       enable row level security;
alter table clasificacion   enable row level security;
alter table jornadas        enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Políticas RLS (se recrean para que el script sea idempotente)
-- ---------------------------------------------------------------------------
drop policy if exists gl_read on torneos;
drop policy if exists gl_read on jugadores;
drop policy if exists gl_read on grupos;
drop policy if exists gl_read on grupo_jugadores;
drop policy if exists gl_read on partidos;
drop policy if exists gl_read on sanciones;
drop policy if exists gl_read on clasificacion;
drop policy if exists gl_read on jornadas;

create policy gl_read on torneos         for select to anon, authenticated using (true);
create policy gl_read on jugadores       for select to authenticated using (true);
create policy gl_read on grupos          for select to anon, authenticated using (true);
create policy gl_read on grupo_jugadores for select to anon, authenticated using (true);
create policy gl_read on partidos        for select to anon, authenticated using (true);
create policy gl_read on sanciones       for select to anon, authenticated using (true);
create policy gl_read on clasificacion   for select to anon, authenticated using (true);
create policy gl_read on jornadas        for select to anon, authenticated using (true);

drop policy if exists gl_admin_write on torneos;
drop policy if exists gl_admin_write on grupos;
drop policy if exists gl_admin_write on grupo_jugadores;
drop policy if exists gl_admin_write on partidos;
drop policy if exists gl_admin_write on sanciones;
drop policy if exists gl_admin_write on clasificacion;
drop policy if exists gl_admin_write on jornadas;
drop policy if exists gl_admin_write on jugadores;
drop policy if exists gl_registro on jugadores;
drop policy if exists gl_propio_update on jugadores;

create policy gl_admin_write on torneos         for all to authenticated using (gl_es_admin()) with check (gl_es_admin());
create policy gl_admin_write on grupos          for all to authenticated using (gl_es_admin()) with check (gl_es_admin());
create policy gl_admin_write on grupo_jugadores for all to authenticated using (gl_es_admin()) with check (gl_es_admin());
create policy gl_admin_write on partidos        for all to authenticated using (gl_es_admin()) with check (gl_es_admin());
create policy gl_admin_write on sanciones       for all to authenticated using (gl_es_admin()) with check (gl_es_admin());
create policy gl_admin_write on clasificacion   for all to authenticated using (gl_es_admin()) with check (gl_es_admin());
create policy gl_admin_write on jornadas        for all to authenticated using (gl_es_admin()) with check (gl_es_admin());

-- Un jugador puede crear su propia fila al registrarse, pero NO puede autoasignarse rol admin.
create policy gl_registro on jugadores for insert to authenticated
  with check (user_id = auth.uid() and rol = 'jugador');

create policy gl_admin_write on jugadores for all to authenticated
  using (gl_es_admin()) with check (gl_es_admin());

-- Un jugador puede corregir su nombre/equipo, pero no escalar privilegios.
create policy gl_propio_update on jugadores for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) Trigger de roles: definición autoritativa en FASE 2.3
-- ---------------------------------------------------------------------------
-- FASE 2.3: NO se redefine gl_proteger_rol() aquí. Las versiones anteriores
-- permitían que un administrador normal promoviera a otros jugadores por REST.
-- La única definición válida se instala en:
--   supabase/migration-seguridad-2.3.sql
-- Reejecutar este script antiguo NO debe debilitar esa definición.

-- ---------------------------------------------------------------------------
-- 6) Bucket de capturas: público para leer, solo admins para subir/borrar
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capturas-partidos',
  'capturas-partidos',
  true,
  5242880,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gl_capturas_read on storage.objects;
drop policy if exists gl_capturas_insert on storage.objects;
drop policy if exists gl_capturas_update on storage.objects;
drop policy if exists gl_capturas_delete on storage.objects;

create policy gl_capturas_read on storage.objects
  for select to public
  using (bucket_id = 'capturas-partidos');

create policy gl_capturas_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capturas-partidos' and public.gl_es_admin());

create policy gl_capturas_update on storage.objects
  for update to authenticated
  using (bucket_id = 'capturas-partidos' and public.gl_es_admin())
  with check (bucket_id = 'capturas-partidos' and public.gl_es_admin());

create policy gl_capturas_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'capturas-partidos' and public.gl_es_admin());

-- Fin del script.
