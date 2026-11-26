CREATE OR REPLACE FUNCTION public.recalcular_clasificacion_interno(p_torneo_id uuid, p_grupo_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_grupo       RECORD;
  v_jugador     RECORD;
  v_partido     RECORD;
  v_pj          INT;
  v_pg          INT;
  v_pe          INT;
  v_pp          INT;
  v_gf          INT;
  v_gc          INT;
  v_dif         INT;
  v_pen         INT;
  v_brutos      INT;
  v_pts         INT;
  v_jornadas    INT;
BEGIN
  -- Obtener total de jornadas del torneo
  SELECT COALESCE(total_jornadas, 22)
    INTO v_jornadas
    FROM torneos
   WHERE id = p_torneo_id;

  -- Iterar sobre grupos a recalcular
  FOR v_grupo IN
    SELECT DISTINCT gj.grupo_id
    FROM grupo_jugadores gj
    JOIN grupos g ON g.id = gj.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND (p_grupo_id IS NULL OR gj.grupo_id = p_grupo_id)
  LOOP

    -- Iterar sobre cada jugador del grupo
    FOR v_jugador IN
      SELECT gj.jugador_id
      FROM grupo_jugadores gj
      WHERE gj.grupo_id = v_grupo.grupo_id
    LOOP
      v_pj := 0; v_pg := 0; v_pe := 0; v_pp := 0;
      v_gf := 0; v_gc := 0;

      -- Calcular stats partido a partido
      FOR v_partido IN
        SELECT
          p.estado,
          p.goles_local,
          p.goles_visitante,
          p.local_id,
          p.visitante_id
        FROM partidos p
        WHERE p.torneo_id = p_torneo_id
          AND p.grupo_id  = v_grupo.grupo_id
          AND p.estado   != 'pendiente'
          AND p.jornada  <= v_jornadas
          AND (p.local_id = v_jugador.jugador_id
               OR p.visitante_id = v_jugador.jugador_id)
      LOOP
        DECLARE
          v_a_favor   INT;
          v_en_contra INT;
        BEGIN
          -- Normalizar resultado según estado
          CASE v_partido.estado
            WHEN 'walkover_local' THEN
              IF v_partido.local_id = v_jugador.jugador_id THEN
                v_a_favor := 3; v_en_contra := 0;
              ELSE
                v_a_favor := 0; v_en_contra := 3;
              END IF;
            WHEN 'walkover_visitante' THEN
              IF v_partido.visitante_id = v_jugador.jugador_id THEN
                v_a_favor := 3; v_en_contra := 0;
              ELSE
                v_a_favor := 0; v_en_contra := 3;
              END IF;
            WHEN 'doble_ausencia' THEN
              v_a_favor := 0; v_en_contra := 0;
            ELSE -- 'jugado'
              IF v_partido.local_id = v_jugador.jugador_id THEN
                v_a_favor   := COALESCE(v_partido.goles_local, 0);
                v_en_contra := COALESCE(v_partido.goles_visitante, 0);
              ELSE
                v_a_favor   := COALESCE(v_partido.goles_visitante, 0);
                v_en_contra := COALESCE(v_partido.goles_local, 0);
              END IF;
          END CASE;

          v_pj := v_pj + 1;
          v_gf := v_gf + v_a_favor;
          v_gc := v_gc + v_en_contra;

          IF v_a_favor > v_en_contra THEN
            v_pg := v_pg + 1;
          ELSIF v_a_favor = v_en_contra THEN
            v_pe := v_pe + 1;
          ELSE
            v_pp := v_pp + 1;
          END IF;
        END;
      END LOOP;

      -- Penalizaciones
      SELECT COALESCE(SUM(puntos_descuento), 0)
        INTO v_pen
        FROM sanciones
       WHERE jugador_id = v_jugador.jugador_id
         AND torneo_id  = p_torneo_id;

      v_dif    := v_gf - v_gc;
      v_brutos := (v_pg * 3) + v_pe;
      v_pts    := GREATEST(0, v_brutos - v_pen);

      -- Upsert con la restricción única compuesta
      INSERT INTO clasificacion
        (torneo_id, grupo_id, jugador_id,
         pj, pg, pe, pp, gf, gc, dif, pts, pts_penalizacion, updated_at)
      VALUES
        (p_torneo_id, v_grupo.grupo_id, v_jugador.jugador_id,
         v_pj, v_pg, v_pe, v_pp, v_gf, v_gc, v_dif, v_pts, v_pen, NOW())
      ON CONFLICT (torneo_id, grupo_id, jugador_id)
      DO UPDATE SET
        pj               = EXCLUDED.pj,
        pg               = EXCLUDED.pg,
        pe               = EXCLUDED.pe,
        pp               = EXCLUDED.pp,
        gf               = EXCLUDED.gf,
        gc               = EXCLUDED.gc,
        dif              = EXCLUDED.dif,
        pts              = EXCLUDED.pts,
        pts_penalizacion = EXCLUDED.pts_penalizacion,
        updated_at       = EXCLUDED.updated_at;

    END LOOP; -- jugador
  END LOOP;   -- grupo

  RETURN json_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  -- ROLLBACK implícito; clasificación anterior intacta
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$function$
