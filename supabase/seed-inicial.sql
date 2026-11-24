-- Ejecutar en Supabase → SQL Editor. Es idempotente: se puede volver a correr sin duplicar datos.
-- Crea el torneo activo y sus dos grupos. No inserta jugadores: se registran desde la web.

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

-- Opcional: reemplaza TU_EMAIL@ejemplo.com por tu correo para ser administrador.
-- update public.jugadores set rol = 'admin'
-- where user_id = (select id from auth.users where email = 'TU_EMAIL@ejemplo.com');
