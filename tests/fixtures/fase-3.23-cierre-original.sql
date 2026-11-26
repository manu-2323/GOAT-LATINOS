CREATE OR REPLACE FUNCTION public.gl_cerrar_jornada_interno(p_torneo_id uuid, p_grupo_id uuid, p_jornada integer, p_resoluciones jsonb, p_cerrado_por uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_jornada_id      UUID;
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
  SELECT rol INTO v_jugador_rol
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
        ingresado_por   = p_cerrado_por,
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
    ingresado_por   = p_cerrado_por,
    updated_at      = NOW()
  WHERE torneo_id = p_torneo_id
    AND grupo_id  = p_grupo_id
    AND jornada   = p_jornada
    AND estado    = 'pendiente';

  -- ── 7. Cerrar la jornada ─────────────────────────────────────────────
  IF v_jornada_id IS NOT NULL THEN
    UPDATE jornadas SET
      estado     = 'cerrada',
      updated_at = NOW()
    WHERE id = v_jornada_id;
  ELSE
    -- Puede no existir la fila si nunca se creó explícitamente
    INSERT INTO jornadas (torneo_id, grupo_id, numero, estado, fecha)
    VALUES (p_torneo_id, p_grupo_id, p_jornada, 'cerrada', CURRENT_DATE)
    ON CONFLICT (torneo_id, grupo_id, numero) DO UPDATE
      SET estado = 'cerrada', updated_at = NOW();
  END IF;

  -- ── 8. Registrar quién realizó la operación (tabla auditoria si existe) ──
  BEGIN
    INSERT INTO auditoria (torneo_id, usuario_id, accion, tabla_afectada, detalle, created_at)
    VALUES (
      p_torneo_id,
      p_cerrado_por,
      'jornada_cerrada',
      'jornadas',
      json_build_object(
        'jornada',             p_jornada,
        'grupo_id',            p_grupo_id,
        'partidos_resueltos',  v_partidos_resueltos
      )::TEXT,
      NOW()
    );
  EXCEPTION WHEN undefined_table THEN
    -- La tabla auditoria no existe aún; continuar sin error
    NULL;
  END;

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
$function$
