CREATE OR REPLACE FUNCTION public.gl_guardar_resultado_interno(p_partido_id uuid, p_torneo_id uuid, p_goles_local integer, p_goles_visitante integer, p_estado text, p_captura_url text, p_ingresado_por uuid, p_motivo text, p_stats jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rol             TEXT;
  v_partido         RECORD;
  v_jornada_estado  TEXT;
  v_es_correccion   BOOLEAN := FALSE;
  v_anterior        TEXT;
  v_estados_validos TEXT[] := ARRAY['jugado','walkover_local','walkover_visitante','doble_ausencia'];

  -- Stats extraídas del JSONB
  v_tiros_l    INT; v_tiros_pl   INT;
  v_pos_l      INT; v_pase_l     INT;
  v_tiros_v    INT; v_tiros_pv   INT;
  v_pos_v      INT; v_pase_v     INT;
BEGIN

  -- ── 1. Verificar admin ───────────────────────────────────
  SELECT rol INTO v_rol
  FROM public.jugadores
  WHERE user_id = p_ingresado_por AND activo = TRUE
  LIMIT 1;
  IF v_rol IS NULL OR v_rol != 'admin' THEN
    RETURN json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  END IF;

  -- ── 2. Validar estado ────────────────────────────────────
  IF p_estado IS NULL OR NOT (p_estado = ANY(v_estados_validos)) THEN
    RETURN json_build_object('ok', false, 'error', 'Estado de partido inválido: ' || COALESCE(p_estado, 'null'));
  END IF;

  -- ── 3. Leer partido y verificar pertenencia al torneo ────
  SELECT p.*, j.estado AS jornada_estado
    INTO v_partido
  FROM public.partidos p
  LEFT JOIN public.jornadas j
    ON j.torneo_id = p.torneo_id
   AND j.grupo_id  = p.grupo_id
   AND j.numero    = p.jornada
  WHERE p.id        = p_partido_id
    AND p.torneo_id = p_torneo_id;

  IF v_partido.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Partido no encontrado en este torneo.');
  END IF;

  -- ── 4. Bloquear si jornada está cerrada ──────────────────
  IF v_partido.jornada_estado = 'cerrada' THEN
    RETURN json_build_object('ok', false, 'error', 'La jornada está cerrada. No se pueden cargar resultados.');
  END IF;

  -- ── 5. Detectar si es ingreso inicial o corrección ───────
  IF v_partido.estado != 'pendiente' THEN
    v_es_correccion := TRUE;
    v_anterior := v_partido.goles_local::TEXT || '-' || v_partido.goles_visitante::TEXT;
  END IF;

  -- ── 6. Bloquear duplicado en ingreso inicial ──────────────
  -- (si ya tiene resultado y no hay motivo de corrección explícito)
  IF v_es_correccion AND p_motivo IS NULL THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'Este partido ya tiene resultado. Para corregirlo indicá un motivo.'
    );
  END IF;

  -- ── 7. Validar que local y visitante pertenecen al grupo ──
  IF NOT EXISTS (
    SELECT 1 FROM public.grupo_jugadores
    WHERE grupo_id = v_partido.grupo_id AND jugador_id = v_partido.local_id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'El jugador local no pertenece al grupo del partido.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.grupo_jugadores
    WHERE grupo_id = v_partido.grupo_id AND jugador_id = v_partido.visitante_id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'El jugador visitante no pertenece al grupo del partido.');
  END IF;

  -- ── 8. Validar goles ─────────────────────────────────────
  IF p_goles_local < 0 OR p_goles_local > 99 OR p_goles_visitante < 0 OR p_goles_visitante > 99 THEN
    RETURN json_build_object('ok', false, 'error', 'Los goles deben estar entre 0 y 99.');
  END IF;

  -- ── 9. Extraer y validar estadísticas del JSONB ──────────
  v_tiros_l  := (p_stats->>'tiros_local')::INT;
  v_tiros_pl := (p_stats->>'tiros_puerta_local')::INT;
  v_pos_l    := (p_stats->>'posesion_local')::INT;
  v_pase_l   := (p_stats->>'pase_local')::INT;
  v_tiros_v  := (p_stats->>'tiros_visitante')::INT;
  v_tiros_pv := (p_stats->>'tiros_puerta_visitante')::INT;
  v_pos_v    := (p_stats->>'posesion_visitante')::INT;
  v_pase_v   := (p_stats->>'pase_visitante')::INT;

  IF v_tiros_l  IS NOT NULL AND v_tiros_l  < 0 THEN RETURN json_build_object('ok',false,'error','Tiros local no puede ser negativo.'); END IF;
  IF v_tiros_v  IS NOT NULL AND v_tiros_v  < 0 THEN RETURN json_build_object('ok',false,'error','Tiros visitante no puede ser negativo.'); END IF;
  IF v_tiros_pl IS NOT NULL AND v_tiros_pl < 0 THEN RETURN json_build_object('ok',false,'error','Tiros a puerta local no puede ser negativo.'); END IF;
  IF v_tiros_pv IS NOT NULL AND v_tiros_pv < 0 THEN RETURN json_build_object('ok',false,'error','Tiros a puerta visitante no puede ser negativo.'); END IF;
  IF v_tiros_l  IS NOT NULL AND v_tiros_pl IS NOT NULL AND v_tiros_pl > v_tiros_l  THEN RETURN json_build_object('ok',false,'error','Tiros a puerta local no puede superar los tiros totales.'); END IF;
  IF v_tiros_v  IS NOT NULL AND v_tiros_pv IS NOT NULL AND v_tiros_pv > v_tiros_v  THEN RETURN json_build_object('ok',false,'error','Tiros a puerta visitante no puede superar los tiros totales.'); END IF;
  IF v_pos_l IS NOT NULL AND (v_pos_l < 0 OR v_pos_l > 100) THEN RETURN json_build_object('ok',false,'error','Posesión local debe estar entre 0 y 100.'); END IF;
  IF v_pos_v IS NOT NULL AND (v_pos_v < 0 OR v_pos_v > 100) THEN RETURN json_build_object('ok',false,'error','Posesión visitante debe estar entre 0 y 100.'); END IF;
  IF v_pos_l IS NOT NULL AND v_pos_v IS NOT NULL AND v_pos_l + v_pos_v != 100 THEN RETURN json_build_object('ok',false,'error','La posesión de ambos equipos debe sumar 100.'); END IF;

  -- ── 10. Registrar historial antes de modificar ───────────
  INSERT INTO public.partidos_historial (
    partido_id, torneo_id, registrado_por,
    goles_local_ant, goles_visita_ant, estado_ant, captura_url_ant,
    goles_local_nuevo, goles_visita_nuevo, estado_nuevo, captura_url_nuevo,
    motivo
  ) VALUES (
    p_partido_id, p_torneo_id, p_ingresado_por,
    v_partido.goles_local, v_partido.goles_visitante, v_partido.estado, v_partido.captura_url,
    p_goles_local, p_goles_visitante, p_estado, p_captura_url,
    p_motivo
  );

  -- ── 11. Actualizar el partido ────────────────────────────
  UPDATE public.partidos SET
    goles_local          = p_goles_local,
    goles_visitante      = p_goles_visitante,
    estado               = p_estado,
    captura_url          = COALESCE(p_captura_url, captura_url),
    ingresado_por        = CASE WHEN v_es_correccion THEN ingresado_por ELSE p_ingresado_por END,
    tiros_local          = v_tiros_l,
    tiros_puerta_local   = v_tiros_pl,
    posesion_local       = v_pos_l,
    pase_local           = v_pase_l,
    tiros_visitante      = v_tiros_v,
    tiros_puerta_visitante = v_tiros_pv,
    posesion_visitante   = v_pos_v,
    pase_visitante       = v_pase_v,
    updated_at           = NOW()
  WHERE id = p_partido_id;

  -- ── 12. Recalcular clasificación del grupo ───────────────
  PERFORM public.recalcular_clasificacion(p_torneo_id, v_partido.grupo_id);

  RETURN json_build_object(
    'ok',           true,
    'es_correccion', v_es_correccion,
    'anterior',      v_anterior
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$function$
