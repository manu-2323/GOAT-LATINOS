-- ===========================================================================
-- GOATS LATINOS · Endurecimiento de RPC y RLS (auditoría 1.0.13)
-- ===========================================================================
-- Problemas corregidos:
--  1) anon podía ejecutar funciones SECURITY DEFINER que escriben en la BD.
--  2) Las RPC de administración creían la identidad del cliente (UUID enviado
--     en p_ingresado_por / p_cerrado_por / p_creado_por). Ahora usan auth.uid().
--  3) Funciones DEFINER sin search_path fijo: se fija '' en los wrappers y
--     'public, pg_temp' en las internas (pg_temp al final evita secuestro).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Separar las funciones internas de las verificadas
-- ---------------------------------------------------------------------------
alter function public.gl_generar_fixture(uuid) rename to gl_generar_fixture_interno;
alter function public.gl_generar_calendario(uuid) rename to gl_generar_calendario_interno;
alter function public.gl_guardar_resultado(uuid,uuid,integer,integer,text,text,uuid,text,jsonb)
  rename to gl_guardar_resultado_interno;
alter function public.gl_cerrar_jornada(uuid,uuid,integer,jsonb,uuid)
  rename to gl_cerrar_jornada_interno;
alter function public.gl_crear_temporada(uuid,text,text,integer,uuid)
  rename to gl_crear_temporada_interno;
alter function public.recalcular_clasificacion(uuid,uuid)
  rename to recalcular_clasificacion_interno;

-- Las internas siguen siendo SECURITY DEFINER pero solo las invoca el wrapper
-- verificado (que corre como postgres). Nadie más debe ejecutarlas.
alter function public.gl_generar_fixture_interno(uuid) set search_path = public, pg_temp;
alter function public.gl_generar_calendario_interno(uuid) set search_path = public, pg_temp;
alter function public.gl_guardar_resultado_interno(uuid,uuid,integer,integer,text,text,uuid,text,jsonb)
  set search_path = public, pg_temp;
alter function public.gl_cerrar_jornada_interno(uuid,uuid,integer,jsonb,uuid)
  set search_path = public, pg_temp;
alter function public.gl_crear_temporada_interno(uuid,text,text,integer,uuid)
  set search_path = public, pg_temp;
alter function public.recalcular_clasificacion_interno(uuid,uuid)
  set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2) Wrappers verificados: identidad desde el token, nunca desde el cliente
-- ---------------------------------------------------------------------------
create or replace function public.gl_generar_fixture(p_torneo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.gl_es_admin() then
    return jsonb_build_object('ok', false,
      'mensaje', 'No tenés permisos de administrador.', 'total_partidos', 0);
  end if;
  return public.gl_generar_fixture_interno(p_torneo_id);
end;
$$;

create or replace function public.gl_generar_calendario(p_torneo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.gl_es_admin() then
    return jsonb_build_object('ok', false,
      'mensaje', 'No tenés permisos de administrador.', 'total_partidos', 0);
  end if;
  return public.gl_generar_fixture_interno(p_torneo_id);
end;
$$;

create or replace function public.gl_guardar_resultado(
  p_partido_id uuid, p_torneo_id uuid,
  p_goles_local integer, p_goles_visitante integer,
  p_estado text, p_captura_url text,
  p_ingresado_por uuid, p_motivo text, p_stats jsonb)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public.gl_es_admin() then
    return json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  end if;
  -- p_ingresado_por se ignora: la identidad la da el JWT de la sesión.
  return public.gl_guardar_resultado_interno(
    p_partido_id, p_torneo_id, p_goles_local, p_goles_visitante,
    p_estado, p_captura_url, auth.uid(), p_motivo, p_stats);
end;
$$;

create or replace function public.gl_cerrar_jornada(
  p_torneo_id uuid, p_grupo_id uuid, p_jornada integer,
  p_resoluciones jsonb, p_cerrado_por uuid)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public.gl_es_admin() then
    return json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  end if;
  return public.gl_cerrar_jornada_interno(
    p_torneo_id, p_grupo_id, p_jornada, p_resoluciones, auth.uid());
end;
$$;

create or replace function public.gl_crear_temporada(
  p_torneo_anterior_id uuid, p_nombre_liga text, p_temporada text,
  p_total_jornadas integer, p_creado_por uuid)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public.gl_es_admin() then
    return json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  end if;
  return public.gl_crear_temporada_interno(
    p_torneo_anterior_id, p_nombre_liga, p_temporada, p_total_jornadas, auth.uid());
end;
$$;

create or replace function public.recalcular_clasificacion(
  p_torneo_id uuid, p_grupo_id uuid default null)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public.gl_es_admin() then
    return json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  end if;
  return public.recalcular_clasificacion_interno(p_torneo_id, p_grupo_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Notificaciones y auditoría: sin suplantación de jugador
-- ---------------------------------------------------------------------------
create or replace function public.gl_crear_notificacion(
  p_jugador_id uuid, p_torneo_id uuid, p_tipo text,
  p_titulo text, p_cuerpo text, p_link_hash text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para crear notificaciones.';
  end if;
  -- Cada jugador escribe las suyas; el admin puede escribir para cualquiera.
  if p_jugador_id <> auth.uid() and not public.gl_es_admin() then
    raise exception 'No podés crear notificaciones para otro jugador.';
  end if;
  if not exists (
    select 1 from public.jugadores
    where id = p_jugador_id and torneo_id = p_torneo_id
  ) then
    raise exception 'El jugador o el torneo no son válidos.';
  end if;
  insert into public.notificaciones (jugador_id, torneo_id, tipo, titulo, cuerpo, link_hash)
  values (p_jugador_id, p_torneo_id, p_tipo, p_titulo, p_cuerpo, p_link_hash);
end;
$$;

create or replace function public.gl_registrar_auditoria(
  p_torneo_id uuid, p_accion text, p_entidad_tipo text,
  p_entidad_id uuid, p_realizado_por uuid, p_detalle jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.gl_es_admin() then
    raise exception 'No tenés permisos para registrar auditoría.';
  end if;
  -- p_realizado_por se ignora: se guarda quien realmente ejecuta la acción.
  insert into public.auditoria (torneo_id, accion, entidad_tipo, entidad_id, realizado_por, detalle)
  values (p_torneo_id, p_accion, p_entidad_tipo, p_entidad_id, auth.uid(), coalesce(p_detalle, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Trigger con search_path fijo y tablas calificadas
-- ---------------------------------------------------------------------------
create or replace function public.fn_validar_jugador_unico_por_torneo()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_torneo_id uuid;
  v_ya_existe int;
begin
  select torneo_id into v_torneo_id from public.grupos where id = new.grupo_id;
  select count(*) into v_ya_existe
  from public.grupo_jugadores gj
  join public.grupos g on g.id = gj.grupo_id
  where gj.jugador_id = new.jugador_id
    and g.torneo_id = v_torneo_id
    and gj.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_ya_existe > 0 then
    raise exception 'El jugador ya pertenece a un grupo en este torneo.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Revocar EXECUTE: CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto
-- ---------------------------------------------------------------------------
alter function public.limpiar_rate_limits() set search_path = public, pg_temp;
alter function public.gl_gc(public.partidos) set search_path = public, pg_temp;
alter function public.gl_gf(public.partidos) set search_path = public, pg_temp;

revoke all on function public.gl_generar_fixture(uuid) from public, anon, authenticated;
revoke all on function public.gl_generar_calendario(uuid) from public, anon, authenticated;
revoke all on function public.gl_guardar_resultado(uuid,uuid,integer,integer,text,text,uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.gl_cerrar_jornada(uuid,uuid,integer,jsonb,uuid)
  from public, anon, authenticated;
revoke all on function public.gl_crear_temporada(uuid,text,text,integer,uuid)
  from public, anon, authenticated;
revoke all on function public.recalcular_clasificacion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.gl_crear_notificacion(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.gl_registrar_auditoria(uuid,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated;

-- Solo las funciones que el frontend llama con sesión iniciada.
grant execute on function public.gl_generar_fixture(uuid) to authenticated;
grant execute on function public.gl_generar_calendario(uuid) to authenticated;
grant execute on function public.gl_guardar_resultado(uuid,uuid,integer,integer,text,text,uuid,text,jsonb)
  to authenticated;
grant execute on function public.gl_cerrar_jornada(uuid,uuid,integer,jsonb,uuid) to authenticated;
grant execute on function public.gl_crear_temporada(uuid,text,text,integer,uuid) to authenticated;
grant execute on function public.recalcular_clasificacion(uuid,uuid) to authenticated;
grant execute on function public.gl_crear_notificacion(uuid,uuid,text,text,text,text)
  to authenticated;
grant execute on function public.gl_registrar_auditoria(uuid,text,text,uuid,uuid,jsonb)
  to authenticated;

-- Funciones internas, helpers y mantenimiento: solo las invoca el backend.
revoke all on function public.gl_generar_fixture_interno(uuid) from public, anon, authenticated;
revoke all on function public.gl_generar_calendario_interno(uuid) from public, anon, authenticated;
revoke all on function public.gl_guardar_resultado_interno(uuid,uuid,integer,integer,text,text,uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.gl_cerrar_jornada_interno(uuid,uuid,integer,jsonb,uuid)
  from public, anon, authenticated;
revoke all on function public.gl_crear_temporada_interno(uuid,text,text,integer,uuid)
  from public, anon, authenticated;
revoke all on function public.recalcular_clasificacion_interno(uuid,uuid) from public, anon, authenticated;
revoke all on function public.gl_recalcular_clasificacion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.limpiar_rate_limits() from public, anon, authenticated;
revoke all on function public.gl_gc(public.partidos) from public, anon, authenticated;
revoke all on function public.gl_gf(public.partidos) from public, anon, authenticated;
revoke all on function public.fn_validar_jugador_unico_por_torneo() from public, anon, authenticated;
revoke all on function public.fn_validar_jugadores_partido() from public, anon, authenticated;

-- gl_nombre_disponible debe seguir accesible sin sesión (registro).
grant execute on function public.gl_nombre_disponible(text) to anon, authenticated;

-- PostgREST debe ver los permisos nuevos sin reiniciar el proyecto.
notify pgrst, 'reload schema';

-- Fin del script.
