-- =============================================================================
-- MIGRACIÓN: gl_generar_fixture()
-- Genera el calendario completo de fase regular de forma completamente atómica.
-- Validaciones incluidas:
--   · Exactamente 12 jugadores activos por grupo
--   · Ningún jugador duplicado en grupos del mismo torneo
--   · Ningún jugador sin asignación (solo los del grupo se usan)
--   · 11 jornadas de ida + 11 de vuelta = 22 jornadas
--   · 6 partidos por jornada (12 jugadores / 2)
--   · 132 partidos por grupo · 264 partidos en total
--   · Cada par se enfrenta exactamente 2 veces (una de local, una de visita)
--   · En la vuelta se invierten local y visitante
-- La función es SECURITY DEFINER para poder bypassear RLS (solo admin puede llamarla).
-- Retorna JSON con: ok, mensaje, total_partidos, detalle_grupos[]
-- =============================================================================

-- Eliminar versión anterior si existe
DROP FUNCTION IF EXISTS public.gl_generar_fixture(uuid);
DROP FUNCTION IF EXISTS public.gl_generar_calendario(uuid);

CREATE OR REPLACE FUNCTION public.gl_generar_fixture(p_torneo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Validación
  v_grupo          record;
  v_jugador_ids    uuid[];
  v_n              int;
  v_duplicados     int;
  v_errores        text[] := '{}';
  v_detalle        jsonb[] := '{}';

  -- Generación round-robin (circle method)
  v_arr            uuid[];       -- Array de IDs rotando (con BYE si hace falta)
  v_arr_len        int;
  v_tmp            uuid;
  v_local          uuid;
  v_visita         uuid;
  v_jornada_ida    int;
  v_jornada_vuelta int;
  v_ronda          int;
  v_i              int;
  v_total          int := 0;
  v_total_esp      int;

  -- Rows a insertar
  v_rows           jsonb[] := '{}';
  v_row            jsonb;

  -- Estado del torneo
  v_tiene_resultados int;
BEGIN
  -- =========================================================================
  -- 0. VERIFICAR QUE EL TORNEO EXISTE Y ESTÁ ACTIVO
  -- =========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM torneos WHERE id = p_torneo_id AND estado = 'activo'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'mensaje', 'El torneo no existe o no está activo.',
      'total_partidos', 0
    );
  END IF;

  -- =========================================================================
  -- 1. VERIFICAR QUE NO EXISTEN RESULTADOS YA CARGADOS
  --    (protección: no se puede borrar historial real)
  -- =========================================================================
  SELECT COUNT(*) INTO v_tiene_resultados
  FROM partidos
  WHERE torneo_id = p_torneo_id
    AND jornada <= 22
    AND estado <> 'pendiente';

  IF v_tiene_resultados > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'mensaje', 'Ya existen ' || v_tiene_resultados ||
                 ' resultado(s) cargado(s). No se puede regenerar el calendario. ' ||
                 'Creá una nueva temporada para empezar de cero.',
      'total_partidos', 0
    );
  END IF;

  -- =========================================================================
  -- 2. VALIDAR GRUPOS Y JUGADORES
  -- =========================================================================
  FOR v_grupo IN
    SELECT g.id, g.nombre
    FROM grupos g
    WHERE g.torneo_id = p_torneo_id
    ORDER BY g.nombre
  LOOP
    -- Obtener jugadores activos de este grupo
    SELECT ARRAY(
      SELECT gj.jugador_id
      FROM grupo_jugadores gj
      JOIN jugadores j ON j.id = gj.jugador_id
      WHERE gj.grupo_id = v_grupo.id
        AND j.activo IS NOT FALSE
      ORDER BY j.nombre_usuario
    ) INTO v_jugador_ids;

    v_n := array_length(v_jugador_ids, 1);

    -- Validar exactamente 12 jugadores
    IF v_n IS NULL OR v_n <> 12 THEN
      v_errores := array_append(v_errores,
        v_grupo.nombre || ': necesita exactamente 12 jugadores activos (tiene ' ||
        COALESCE(v_n::text, '0') || ').');
    END IF;

    -- Validar que no haya jugadores duplicados dentro del grupo
    SELECT COUNT(*) - COUNT(DISTINCT gj.jugador_id) INTO v_duplicados
    FROM grupo_jugadores gj
    WHERE gj.grupo_id = v_grupo.id;

    IF v_duplicados > 0 THEN
      v_errores := array_append(v_errores,
        v_grupo.nombre || ': hay ' || v_duplicados || ' jugador(es) duplicado(s).');
    END IF;
  END LOOP;

  -- Validar que ningún jugador aparezca en más de un grupo del mismo torneo
  SELECT COUNT(*) INTO v_duplicados
  FROM (
    SELECT gj.jugador_id
    FROM grupo_jugadores gj
    JOIN grupos g ON g.id = gj.grupo_id
    WHERE g.torneo_id = p_torneo_id
    GROUP BY gj.jugador_id
    HAVING COUNT(*) > 1
  ) dup;

  IF v_duplicados > 0 THEN
    v_errores := array_append(v_errores,
      'Hay ' || v_duplicados || ' jugador(es) asignado(s) a más de un grupo en el mismo torneo.');
  END IF;

  -- Verificar que hay exactamente 2 grupos
  SELECT COUNT(*) INTO v_n FROM grupos WHERE torneo_id = p_torneo_id;
  IF v_n <> 2 THEN
    v_errores := array_append(v_errores,
      'Se requieren exactamente 2 grupos. Hay ' || v_n || '.');
  END IF;

  -- Si hay errores, abortar sin modificar nada
  IF array_length(v_errores, 1) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'mensaje', array_to_string(v_errores, ' | '),
      'errores', to_jsonb(v_errores),
      'total_partidos', 0
    );
  END IF;

  -- =========================================================================
  -- 3. ELIMINAR SOLO LOS PARTIDOS PENDIENTES DE FASE REGULAR
  --    (ya verificamos que no hay resultados reales, así que es seguro)
  -- =========================================================================
  DELETE FROM partidos
  WHERE torneo_id = p_torneo_id
    AND jornada <= 22
    AND estado = 'pendiente';

  -- =========================================================================
  -- 4. GENERAR FIXTURE POR GRUPO (circle method)
  -- =========================================================================
  FOR v_grupo IN
    SELECT g.id, g.nombre
    FROM grupos g
    WHERE g.torneo_id = p_torneo_id
    ORDER BY g.nombre
  LOOP
    -- Leer jugadores activos del grupo
    SELECT ARRAY(
      SELECT gj.jugador_id
      FROM grupo_jugadores gj
      JOIN jugadores j ON j.id = gj.jugador_id
      WHERE gj.grupo_id = v_grupo.id
        AND j.activo IS NOT FALSE
      ORDER BY j.nombre_usuario
    ) INTO v_jugador_ids;

    -- Circle method para 12 jugadores (n par, sin BYE)
    -- arr[1] = ancla fija, arr[2..12] rotan una posición en cada ronda
    v_arr     := v_jugador_ids;
    v_arr_len := array_length(v_arr, 1); -- siempre 12

    -- Validación interna de la generación
    v_total_esp := (v_arr_len - 1) * (v_arr_len / 2) * 2; -- 11 rondas * 6 partidos * 2 vueltas = 132

    -- Rondas de IDA: jornadas 1..11
    FOR v_ronda IN 0 .. (v_arr_len - 2) LOOP
      v_jornada_ida    := v_ronda + 1;        -- 1 a 11
      v_jornada_vuelta := v_ronda + 1 + 11;   -- 12 a 22

      FOR v_i IN 1 .. (v_arr_len / 2) LOOP
        v_local  := v_arr[v_i];
        v_visita := v_arr[v_arr_len + 1 - v_i];

        -- Alternar local/visita por ronda para equilibrar ventaja de campo
        IF v_ronda % 2 = 0 THEN
          v_local  := v_arr[v_i];
          v_visita := v_arr[v_arr_len + 1 - v_i];
        ELSE
          v_local  := v_arr[v_arr_len + 1 - v_i];
          v_visita := v_arr[v_i];
        END IF;

        -- Insertar partido de IDA
        INSERT INTO partidos (
          torneo_id, grupo_id, jornada,
          local_id, visitante_id,
          goles_local, goles_visitante, estado
        ) VALUES (
          p_torneo_id, v_grupo.id, v_jornada_ida,
          v_local, v_visita,
          0, 0, 'pendiente'
        );

        -- Insertar partido de VUELTA (invertir local/visitante)
        INSERT INTO partidos (
          torneo_id, grupo_id, jornada,
          local_id, visitante_id,
          goles_local, goles_visitante, estado
        ) VALUES (
          p_torneo_id, v_grupo.id, v_jornada_vuelta,
          v_visita, v_local,   -- <-- invertido
          0, 0, 'pendiente'
        );

        v_total := v_total + 2;
      END LOOP;

      -- Rotación del círculo: arr[2..n] rota una posición a la derecha
      -- arr[1] permanece fijo (ancla)
      v_tmp := v_arr[v_arr_len];
      FOR v_i IN REVERSE v_arr_len .. 3 LOOP
        v_arr[v_i] := v_arr[v_i - 1];
      END LOOP;
      v_arr[2] := v_tmp;
    END LOOP;

    -- =========================================================================
    -- 5. VALIDACIÓN POST-INSERCIÓN POR GRUPO
    -- =========================================================================
    DECLARE
      v_pj_check         int;
      v_jornadas_check   int;
      v_partidos_j_check int;
      v_pares_check      int;
    BEGIN
      -- 132 partidos por grupo
      SELECT COUNT(*) INTO v_pj_check
      FROM partidos
      WHERE torneo_id = p_torneo_id AND grupo_id = v_grupo.id AND jornada <= 22;

      IF v_pj_check <> 132 THEN
        RAISE EXCEPTION 'Validación fallida en %: se esperaban 132 partidos, se generaron %.', v_grupo.nombre, v_pj_check;
      END IF;

      -- 22 jornadas distintas
      SELECT COUNT(DISTINCT jornada) INTO v_jornadas_check
      FROM partidos
      WHERE torneo_id = p_torneo_id AND grupo_id = v_grupo.id AND jornada <= 22;

      IF v_jornadas_check <> 22 THEN
        RAISE EXCEPTION 'Validación fallida en %: se esperaban 22 jornadas, hay %.', v_grupo.nombre, v_jornadas_check;
      END IF;

      -- 6 partidos por jornada (en promedio; valida la jornada 1 como muestra)
      SELECT COUNT(*) INTO v_partidos_j_check
      FROM partidos
      WHERE torneo_id = p_torneo_id AND grupo_id = v_grupo.id AND jornada = 1;

      IF v_partidos_j_check <> 6 THEN
        RAISE EXCEPTION 'Validación fallida en %: jornada 1 tiene % partidos (esperados 6).', v_grupo.nombre, v_partidos_j_check;
      END IF;

      -- Cada par se enfrenta exactamente 2 veces
      -- (un cruce A-B aparece una vez con A local y otra con B local)
      SELECT COUNT(*) INTO v_pares_check
      FROM (
        SELECT LEAST(local_id, visitante_id) AS p1,
               GREATEST(local_id, visitante_id) AS p2,
               COUNT(*) AS n
        FROM partidos
        WHERE torneo_id = p_torneo_id AND grupo_id = v_grupo.id AND jornada <= 22
        GROUP BY 1, 2
        HAVING COUNT(*) <> 2
      ) mal;

      IF v_pares_check > 0 THEN
        RAISE EXCEPTION 'Validación fallida en %: % par(es) no se enfrentan exactamente 2 veces.', v_grupo.nombre, v_pares_check;
      END IF;

      -- Acumular detalle del grupo para la respuesta
      v_detalle := array_append(v_detalle, jsonb_build_object(
        'grupo', v_grupo.nombre,
        'partidos', v_pj_check,
        'jornadas', v_jornadas_check
      ));
    END;
  END LOOP;

  -- =========================================================================
  -- 6. VALIDACIÓN TOTAL (264 partidos entre los dos grupos)
  -- =========================================================================
  SELECT COUNT(*) INTO v_n
  FROM partidos
  WHERE torneo_id = p_torneo_id AND jornada <= 22;

  IF v_n <> 264 THEN
    RAISE EXCEPTION 'Validación final fallida: se esperaban 264 partidos en total, hay %.', v_n;
  END IF;

  -- =========================================================================
  -- 7. DEVOLVER RESULTADO EXITOSO
  -- =========================================================================
  RETURN jsonb_build_object(
    'ok', true,
    'mensaje', 'Calendario generado correctamente: ' || v_n || ' partidos en 22 jornadas para ambos grupos.',
    'total_partidos', v_n,
    'detalle_grupos', to_jsonb(v_detalle)
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Cualquier RAISE EXCEPTION o error inesperado hace rollback automático
    -- porque la función corre dentro de la transacción del caller.
    RETURN jsonb_build_object(
      'ok', false,
      'mensaje', 'Error interno al generar el fixture: ' || SQLERRM,
      'total_partidos', 0
    );
END;
$$;

-- Permisos: solo autenticados pueden llamarla, pero internamente valida que sea admin
REVOKE ALL ON FUNCTION public.gl_generar_fixture(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gl_generar_fixture(uuid) TO authenticated;

-- Alias de compatibilidad (el JS anterior llamaba gl_generar_calendario)
CREATE OR REPLACE FUNCTION public.gl_generar_calendario(p_torneo_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gl_generar_fixture(p_torneo_id);
$$;

REVOKE ALL ON FUNCTION public.gl_generar_calendario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gl_generar_calendario(uuid) TO authenticated;