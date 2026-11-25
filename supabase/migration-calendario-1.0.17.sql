-- =====================================================================
-- GOATS LATINOS — Migración 1.0.17
-- Calendario y programación: contacto de WhatsApp autorizado
-- =====================================================================
-- La vista pública sigue sin exponer teléfonos. Esta función devuelve el
-- contacto únicamente cuando el jugador autenticado comparte grupo con el
-- jugador consultado (o cuando quien consulta es administrador).
-- Se ejecuta como dueño de la función con search_path acotado.
-- =====================================================================

create or replace function public.gl_contactos_whatsapp(p_jugador_ids uuid[])
returns table (jugador_id uuid, pais text, telefono text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_yo        uuid;
  v_es_admin  boolean := false;
  v_cantidad  integer;
begin
  v_cantidad := coalesce(array_length(p_jugador_ids, 1), 0);
  if v_cantidad = 0 or v_cantidad > 50 then
    raise exception 'La consulta de contactos debe incluir entre 1 y 50 jugadores.';
  end if;

  select j.id, (j.rol = 'admin')
    into v_yo, v_es_admin
  from public.jugadores j
  where j.user_id = auth.uid()
    and j.activo is distinct from false
  limit 1;

  if v_yo is null then
    raise exception 'No hay un jugador activo asociado a esta sesión.';
  end if;

  return query
  select j.id, j.pais, j.telefono
  from public.jugadores j
  where j.id = any(p_jugador_ids)
    and j.activo is distinct from false
    and (
      v_es_admin
      or exists (
        select 1
        from public.grupo_jugadores mio
        join public.grupo_jugadores otro
          on otro.grupo_id = mio.grupo_id
        where mio.jugador_id = v_yo
          and otro.jugador_id = j.id
      )
    );
end;
$$;

revoke all on function public.gl_contactos_whatsapp(uuid[]) from public, anon;
grant execute on function public.gl_contactos_whatsapp(uuid[]) to authenticated;

comment on function public.gl_contactos_whatsapp(uuid[]) is
  'Devuelve teléfonos de WhatsApp solo para compañeros de grupo del jugador autenticado o para administradores.';

-- Fin del script.
