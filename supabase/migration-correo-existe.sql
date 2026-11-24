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
