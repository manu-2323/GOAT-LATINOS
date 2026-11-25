-- ===========================================================================
-- GOATS LATINOS · Registro seguro y lectura pública controlada
-- ===========================================================================
-- Motivo: anon no tiene SELECT sobre public.jugadores (separación pública/privada),
-- pero el frontend verificaba el nombre consultando esa tabla directamente.
-- Solución: una RPC SECURITY DEFINER que solo devuelve {ok, mensaje}.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Disponibilidad de nombre de usuario (sin exponer filas ni columnas)
-- ---------------------------------------------------------------------------
create or replace function public.gl_nombre_disponible(p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw  text := lower(btrim(coalesce(p_nombre, '')));
  v_norm text := regexp_replace(
    translate(v_raw, 'áéíóúüñø', 'aeiouuno'),
    '[^a-z0-9]', '', 'g'
  );
begin
  if length(v_raw) < 3 then
    return jsonb_build_object('ok', false, 'mensaje', 'Usá al menos 3 caracteres.');
  end if;

  -- Se respetan los nombres históricos aunque no tengan cuenta vinculada.
  -- Para nombres no latinos (p. ej. cirílico) se compara el texto original.
  if exists (
    select 1
    from public.jugadores j
    where case
      when length(v_norm) >= 3 then
        regexp_replace(
          translate(lower(j.nombre_usuario), 'áéíóúüñø', 'aeiouuno'),
          '[^a-z0-9]', '', 'g'
        ) = v_norm
      else
        lower(btrim(j.nombre_usuario)) = v_raw
    end
  ) then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Ese nombre ya está en uso. Elegí otro.'
    );
  end if;

  return jsonb_build_object('ok', true, 'mensaje', 'Nombre disponible');
end;
$$;

revoke all on function public.gl_nombre_disponible(text) from public;
grant execute on function public.gl_nombre_disponible(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Eliminar enumeración pública de correos
-- ---------------------------------------------------------------------------
-- La comprobación en vivo de correo permitía probar listas de emails.
-- La existencia real se resuelve con el mensaje genérico de auth.signUp().
revoke all on function public.gl_correo_existe(text) from public;
revoke execute on function public.gl_correo_existe(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Vista pública real
-- ---------------------------------------------------------------------------
-- security_invoker = false: la vista la ejecuta su dueña (postgres), sin RLS,
-- pero expone únicamente columnas deportivas. La tabla base sigue sin SELECT
-- para anon y con RLS own/admin para authenticated.
drop view if exists public.jugadores_publicos;

create view public.jugadores_publicos
with (security_invoker = false)
as
  select
    id,
    nombre_usuario,
    pais,
    avatar_url,
    activo,
    suspendido,
    torneo_id,
    numero
  from public.jugadores;

grant select on public.jugadores_publicos to anon, authenticated;

-- Política residual: ya no hay grant de SELECT a anon, pero se elimina para
-- que un futuro GRANT no vuelva a exponer email/teléfono/user_id/super_admin.
drop policy if exists "lectura publica jugadores" on public.jugadores;

-- Fin del script.
