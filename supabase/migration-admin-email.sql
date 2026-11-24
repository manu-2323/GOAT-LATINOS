-- Necesario para el panel "Administradores".
-- Ejecutar en Supabase → SQL Editor si ya corriste la configuración anterior.

alter table public.jugadores add column if not exists email text;
comment on column public.jugadores.email is 'Correo de la cuenta vinculada (para gestionar administradores)';
create index if not exists jugadores_email_idx on public.jugadores (lower(email));
