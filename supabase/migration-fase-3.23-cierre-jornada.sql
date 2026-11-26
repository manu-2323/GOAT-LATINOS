-- ===========================================================================
-- GOATS LATINOS · FASE 3.23 — Corrección del ciclo de jornadas
-- ===========================================================================
-- PROPUESTA TÉCNICA: NO EJECUTAR EN PRODUCCIÓN SIN AUTORIZACIÓN EXPLÍCITA.
--
-- Causa raíz 1 (cierre): el paso 8 del cuerpo desplegado de
-- gl_cerrar_jornada_interno inserta en public.auditoria las columnas
-- usuario_id y tabla_afectada, que no existen (realizado_por / entidad_tipo).
-- El error 42703 no lo captura WHEN undefined_table y el manejador externo
-- EXCEPTION WHEN OTHERS revierte todas las escrituras del cierre.
--
-- Causa raíz 2 (cierre y resultados): los cuerpos internos escriben auth.uid()
-- en partidos.ingresado_por y partidos_historial.registrado_por, columnas con
-- FOREIGN KEY a jugadores(id). En producción el jugador.id del administrador
-- es distinto de su auth.users.id: PostgreSQL devuelve 23503 y revierte.
--
-- Causa raíz 3 (cierre): el paso 7 actualiza jornadas.updated_at, columna que
-- tampoco existe en public.jornadas (sólo created_at). Produce 42703 y revierte.
--
-- Corrección: resolver el jugador administrador por user_id = auth.uid() y
-- usar ese id en las columnas con FK; actualizar sólo jornadas.estado; delegar
-- la auditoría en la sobrecarga existente de 7 argumentos de
-- gl_registrar_auditoria (auditoria_eventos, tabla que lee la UI). No se crean
-- RPC nuevas ni se cambian las firmas.
--
-- Generado desde las definiciones leídas en producción el 2026-11-26.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.gl_cerrar_jornada_interno(p_torneo_id uuid, p_grupo_id uuid, p_jornada integer, p_resoluciones jsonb, p_cerrado_por uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_jornada_id      UUID;
  v_admin_jugador_id UUID;
  v_jornada_estado  TEXT;
  v_torneo_id       UUID;
  v_jugador_rol     TEXT;
  v_res             JSONB;
  v_partido_id      UUID;
  v_estado_nuevo    TEXT;
  v_local_id        UUID;
  v_visitante_id    UUID;
  v_local_exp       BOOL;
  v_visita_exp      BOOL;
  v_goles_local     INT;
  v_goles_visita    INT;
  v_partidos_resueltos INT := 0;
  v_estados_validos TEXT[] := ARRAY['walkover_local','walkover_visitante','doble_ausencia'];
BEGIN

  -- ── 1. Verificar que el usuario es administrador ─────────────────────
  SELECT id, rol INTO v_admin_jugador_id, v_jugador_rol
  FROM jugadores
  WHERE user_id = p_cerrado_por
    AND torneo_id = p_torneo_id
    AND activo = TRUE
  LIMIT 1;

  IF v_jugador_rol IS NULL OR v_jugador_rol != 'admin' THEN
    RETURN json_build_object('ok', false, 'error', 'No tenés permisos de administrador.');
  END IF;

  -- ── 2. Verificar que la jornada pertenece al torneo activo ───────────
  SELECT j.id, j.estado, g.torneo_id
    INTO v_jornada_id, v_jornada_estado, v_torneo_id
  FROM jornadas j
  JOIN grupos g ON g.id = j.grupo_id
  WHERE j.numero    = p_jornada
    AND j.grupo_id  = p_grupo_id
    AND g.torneo_id = p_torneo_id
  LIMIT 1;

  IF v_jornada_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Jornada ' || p_jornada || ' no encontrada en este torneo/grupo.');
  END IF;

  IF v_torneo_id != p_torneo_id THEN
    RETURN json_build_object('ok', false, 'error', 'La jornada no pertenece al torneo activo.');
  END IF;

  -- ── 3. Comprobar que está abierta ────────────────────────────────────
  IF v_jornada_estado = 'cerrada' THEN
    RETURN json_build_object('ok', false, 'error', 'La jornada ' || p_jornada || ' ya está cerrada.');
  END IF;

  -- ── 4–6. Procesar cada resolución administrativa ─────────────────────
  IF p_resoluciones IS NOT NULL AND jsonb_array_length(p_resoluciones) > 0 THEN
    FOR v_res IN SELECT * FROM jsonb_array_elements(p_resoluciones)
    LOOP
      v_partido_id  := (v_res->>'partido_id')::UUID;
      v_estado_nuevo := v_res->>'estado';

      -- 5. Validar estado recibido
      IF v_estado_nuevo IS NULL OR NOT (v_estado_nuevo = ANY(v_estados_validos)) THEN
        RETURN json_build_object(
          'ok', false,
          'error', 'Estado inválido "' || COALESCE(v_estado_nuevo,'null') || '" para partido ' || v_partido_id::TEXT
        );
      END IF;

      -- Verificar que el partido pertenece a este torneo/grupo/jornada y está pendiente
      SELECT local_id, visitante_id
        INTO v_local_id, v_visitante_id
      FROM partidos
      WHERE id         = v_partido_id
        AND torneo_id  = p_torneo_id
        AND grupo_id   = p_grupo_id
        AND jornada    = p_jornada
        AND estado     = 'pendiente';

      IF v_local_id IS NULL THEN
        RETURN json_build_object(
          'ok', false,
          'error', 'Partido ' || v_partido_id::TEXT || ' no es pendiente o no pertenece a esta jornada.'
        );
      END IF;

      -- Detectar expulsados → forzar resolución correcta
      SELECT COALESCE(suspendido, FALSE) INTO v_local_exp
      FROM jugadores WHERE id = v_local_id;
      SELECT COALESCE(suspendido, FALSE) INTO v_visita_exp
      FROM jugadores WHERE id = v_visitante_id;

      -- Ajustar goles según resolución
      CASE v_estado_nuevo
        WHEN 'walkover_local' THEN
          v_goles_local  := 3; v_goles_visita := 0;
        WHEN 'walkover_visitante' THEN
          v_goles_local  := 0; v_goles_visita := 3;
        WHEN 'doble_ausencia' THEN
          v_goles_local  := 0; v_goles_visita := 0;
      END CASE;

      -- Si alguno está expulsado, resultado es 1-0 al rival
      IF v_local_exp AND NOT v_visita_exp THEN
        v_estado_nuevo := 'walkover_visitante';
        v_goles_local  := 0; v_goles_visita := 1;
      ELSIF v_visita_exp AND NOT v_local_exp THEN
        v_estado_nuevo := 'walkover_local';
        v_goles_local  := 1; v_goles_visita := 0;
      ELSIF v_local_exp AND v_visita_exp THEN
        v_estado_nuevo := 'doble_ausencia';
        v_goles_local  := 0; v_goles_visita := 0;
      END IF;

      -- 6. Resolver el partido
      UPDATE partidos SET
        estado          = v_estado_nuevo,
        goles_local     = v_goles_local,
        goles_visitante = v_goles_visita,
        ingresado_por   = v_admin_jugador_id,
        updated_at      = NOW()
      WHERE id = v_partido_id;

      v_partidos_resueltos := v_partidos_resueltos + 1;
    END LOOP;
  END IF;

  -- Resolver partidos pendientes sin resolución enviada → doble ausencia
  UPDATE partidos SET
    estado          = 'doble_ausencia',
    goles_local     = 0,
    goles_visitante = 0,
    ingresado_por   = v_admin_jugador_id,
    updated_at      = NOW()
  WHERE torneo_id = p_torneo_id
    AND grupo_id  = p_grupo_id
    AND jornada   = p_jornada
    AND estado    = 'pendiente';

  -- ── 7. Cerrar la jornada ─────────────────────────────────────────────
  IF v_jornada_id IS NOT NULL THEN
    -- FASE 3.23: public.jornadas no tiene columna updated_at (verificado en
    -- information_schema). No se inventa columna: sólo se cambia el estado.
    UPDATE jornadas SET estado = 'cerrada'
    WHERE id = v_jornada_id;
  ELSE
    -- Puede no existir la fila si nunca se creó explícitamente
    INSERT INTO jornadas (torneo_id, grupo_id, numero, estado, fecha)
    VALUES (p_torneo_id, p_grupo_id, p_jornada, 'cerrada', CURRENT_DATE)
    ON CONFLICT (torneo_id, grupo_id, numero) DO UPDATE
      SET estado = 'cerrada';
  END IF;

  -- ── 8. Registrar el cierre en la auditoría que lee la interfaz ──────────
  -- FASE 3.23: se usa la sobrecarga existente de 7 argumentos, que escribe en
  -- public.auditoria_eventos (origen de la pantalla de Auditoría). No se crea
  -- una RPC nueva y se conserva la política best-effort ya vigente.
  PERFORM public.gl_registrar_auditoria(
    p_torneo_id,
    p_grupo_id,
    'jornada_cerrada',
    'jornada',
    v_jornada_id,
    p_cerrado_por,
    jsonb_build_object(
      'jornada',             p_jornada,
      'grupo_id',            p_grupo_id,
      'partidos_resueltos',  v_partidos_resueltos
    )
  );

  -- ── 9. Recalcular clasificación del grupo ────────────────────────────
  PERFORM recalcular_clasificacion(p_torneo_id, p_grupo_id);

  -- ── 10. Todo OK → la transacción se confirma sola al retornar ────────
  RETURN json_build_object(
    'ok',                 true,
    'partidos_resueltos', v_partidos_resueltos
  );

EXCEPTION WHEN OTHERS THEN
  -- Cualquier fallo revierte todo lo anterior automáticamente
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.gl_guardar_resultado_interno(p_partido_id uuid, p_torneo_id uuid, p_goles_local integer, p_goles_visitante integer, p_estado text, p_captura_url text, p_ingresado_por uuid, p_motivo text, p_stats jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rol             TEXT;
  v_ingresado_jugador_id UUID;
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
  SELECT id, rol INTO v_ingresado_jugador_id, v_rol
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
    p_partido_id, p_torneo_id, v_ingresado_jugador_id,
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
    ingresado_por        = CASE WHEN v_es_correccion THEN ingresado_por ELSE v_ingresado_jugador_id END,
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
$function$;
