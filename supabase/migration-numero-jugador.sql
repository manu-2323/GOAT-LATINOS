-- Opcional pero recomendado: permite al administrador asignar el número de cada jugador.
-- Ejecutar en Supabase → SQL Editor. El panel de administración detecta la columna automáticamente.

alter table public.jugadores add column if not exists numero integer;

comment on column public.jugadores.numero is 'Número asignado por el administrador de la liga';
