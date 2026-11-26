-- FASE 3.23 · Funciones de soporte existentes en producción, reproducidas en
-- el arnés aislado. No son propuestas de cambio: son dependencias del RPC.

create or replace function public.gl_registrar_auditoria(
  p_torneo_id uuid, p_grupo_id uuid, p_accion text, p_entidad_tipo text,
  p_entidad_id uuid, p_realizado_por uuid, p_detalle jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  insert into public.auditoria_eventos
    (torneo_id, grupo_id, accion, entidad_tipo, entidad_id, realizado_por, detalle)
  values
    (p_torneo_id, p_grupo_id, p_accion, p_entidad_tipo, p_entidad_id, p_realizado_por, coalesce(p_detalle,'{}'));
exception when others then
  -- Política vigente: la auditoría nunca rompe la operación principal.
  null;
end;
$function$;

create or replace function public.recalcular_clasificacion(
  p_torneo_id uuid, p_grupo_id uuid default null)
returns json language plpgsql security definer set search_path = '' as $function$
begin
  if not public.gl_es_admin() then
    return json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  end if;
  return public.recalcular_clasificacion_interno(p_torneo_id, p_grupo_id);
end;
$function$;

create or replace function public.gl_cerrar_jornada(
  p_torneo_id uuid, p_grupo_id uuid, p_jornada integer,
  p_resoluciones jsonb, p_cerrado_por uuid)
returns json language plpgsql security definer set search_path = '' as $function$
begin
  if not public.gl_es_admin() then
    return json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  end if;
  return public.gl_cerrar_jornada_interno(
    p_torneo_id, p_grupo_id, p_jornada, p_resoluciones, auth.uid());
end;
$function$;

create or replace function public.gl_guardar_resultado(
  p_partido_id uuid, p_torneo_id uuid, p_goles_local integer,
  p_goles_visitante integer, p_estado text, p_captura_url text,
  p_ingresado_por uuid, p_motivo text, p_stats jsonb)
returns json language plpgsql security definer set search_path = '' as $function$
begin
  if not public.gl_es_admin() then
    return json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  end if;
  return public.gl_guardar_resultado_interno(
    p_partido_id, p_torneo_id, p_goles_local, p_goles_visitante,
    p_estado, p_captura_url, auth.uid(), p_motivo, p_stats);
end;
$function$;
