-- 1.5.4 — Reemplazo real: reincorporar a un participante retirado.
--
-- Fallo observado en produccion (prueba manual real):
--   gl_gestionar_baja devolvio "Ese jugador ya participa en este torneo"
--   al intentar usar MANUEL como reemplazo de MANUEL999.
--
-- Causa: la validacion del entrante usaba EXISTS sobre torneo_participantes
--   sin distinguir estado. MANUEL habia sido dado de baja segundos antes para
--   liberar su lugar, por lo que su fila historica 'retirado' bloqueaba el
--   reemplazo, aunque la interfaz si lo ofrecia como candidato.
--
-- Correccion: se bloquea solo si el entrante esta ACTIVO. Si su participacion
--   esta retirada, se reactiva la misma fila (on conflict do update), se limpia
--   el resultado de la baja anterior y se actualiza el grupo. La solicitud se
--   deja solo en la fila del saliente (indice unico por torneo) y la membresia
--   historica se traslada al grupo del saliente (un grupo por torneo). No se
--   tocan RLS, GRANT/REVOKE, Auth ni jugadores.torneo_id.

begin;
CREATE OR REPLACE FUNCTION public.gl_gestionar_baja(p_torneo_id uuid, p_jugador_id uuid, p_motivo text, p_solicitud_id uuid, p_reemplazo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_jugador_id uuid;
  v_partido record;
  v_grupo_id uuid;
  v_grupo_original uuid;
  v_plazo jsonb;
  v_recalculo json;
  v_estado text;
  v_ya jsonb;
  v_resultado jsonb;
  v_reasignados integer := 0;
  v_resueltos integer := 0;
  v_tipo text;
  v_grupo_recalculo uuid;
  v_grupos_afectados uuid[] := '{}'::uuid[];
  v_entrante_estado text;
begin
  if auth.uid() is null then raise exception 'Sesi├│n no autenticada'; end if;
  if not public.gl_es_admin() then raise exception 'No autorizado'; end if;
  if p_torneo_id is null or p_jugador_id is null then raise exception 'Torneo y jugador son obligatorios'; end if;
  if p_solicitud_id is null then raise exception 'Falta el identificador de la solicitud'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'El motivo de la baja es obligatorio'; end if;

  -- Cerrojo de torneo PRIMERO: inscripci├│n y sustituci├│n comparten el mismo
  -- orden de bloqueo, por lo que no pueden incorporar al mismo jugador.
  perform 1 from public.torneos t where t.id = p_torneo_id for update;
  if not found then raise exception 'Torneo no v├ílido'; end if;

  select id into v_admin_jugador_id from public.jugadores where user_id = auth.uid() and rol = 'admin' limit 1;
  if v_admin_jugador_id is null then raise exception 'No autorizado'; end if;

  -- Cerrojo de fila del participante saliente.
  select tp.grupo_id, tp.estado, tp.resultado into v_grupo_id, v_estado, v_ya
  from public.torneo_participantes tp
  where tp.torneo_id = p_torneo_id and tp.jugador_id = p_jugador_id
  for update;

  if not found then
    raise exception 'El jugador no est├í inscripto en este torneo.';
  end if;

  -- Reintento tras timeout o doble clic: devuelve el resultado ya guardado.
  if v_estado = 'retirado' or v_ya is not null then
    return coalesce(v_ya, jsonb_build_object(
      'ok', true, 'ya_aplicado', true, 'estado', 'retirado',
      'solicitud_id', p_solicitud_id
    )) || jsonb_build_object('ya_aplicado', true);
  end if;

  if v_estado <> 'activo' then
    raise exception 'La participaci├│n no est├í activa.';
  end if;

  -- Recuperaci├│n del grupo: torneo_participantes -> grupo_jugadores ->
  -- partidos del torneo. Nunca se acepta un reemplazo sin grupo resuelto.
  v_grupo_original := v_grupo_id;
  if v_grupo_id is null then
    select gj.grupo_id into v_grupo_id
    from public.grupo_jugadores gj
    join public.grupos g on g.id = gj.grupo_id
    where gj.jugador_id = p_jugador_id and g.torneo_id = p_torneo_id
    limit 1;
  end if;
  if v_grupo_id is null then
    select p.grupo_id into v_grupo_id
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and (p.local_id = p_jugador_id or p.visitante_id = p_jugador_id)
      and p.grupo_id is not null
    order by p.jornada, p.id
    limit 1;
  end if;
  if v_grupo_id is not null and v_grupo_original is null then
    update public.torneo_participantes tp
    set grupo_id = v_grupo_id
    where tp.torneo_id = p_torneo_id and tp.jugador_id = p_jugador_id;
  end if;

  -- Sincronizaci├│n REAL con el cierre de jornada, demostrable por modos de
  -- bloqueo de PostgreSQL (no por orden de filas):
  --   * gl_cerrar_jornada_interno desplegado ejecuta UPDATE sobre partidos
  --     (pasos 4-6) y sobre jornadas (paso 7). Todo UPDATE mantiene
  --     RowExclusiveLock a nivel de TABLA hasta que la transacci├│n termina.
  --   * SHARE ROW EXCLUSIVE entra en conflicto con RowExclusiveLock. Por eso
  --     esta operaci├│n espera a cualquier cierre que est├® escribiendo, y un
  --     cierre que intente escribir espera a esta operaci├│n.
  --   * Se piden las tablas en orden fijo (partidos -> jornadas), que es el
  --     mismo orden en que el cierre desplegado ejecuta sus UPDATE. No hay
  --     inversi├│n de orden ni dependencia del plan de consulta.
  -- No se modifica la funci├│n de cierre: basta con el modo de bloqueo.
  lock table public.partidos in share row exclusive mode;
  lock table public.jornadas in share row exclusive mode;

  -- Evaluaci├│n del plazo con las tablas protegidas contra escritores. Si otra
  -- transacci├│n cerr├│ la J7, esta operaci├│n espera a que confirme y lee el estado final.
  v_plazo := public.gl_evaluar_plazo_reemplazo(p_torneo_id, v_grupo_id);

  if p_reemplazo_id is not null then
    --------------------------------------------------------------------------
    -- CASO A: reemplazo dentro del plazo (1..6 cerradas y 7 NO cerrada).
    --------------------------------------------------------------------------
    if v_grupo_id is null then
      raise exception 'No se pudo resolver el grupo del participante; el reemplazo no se incorpora sin grupo.';
    end if;
    if (v_plazo->>'permitido')::boolean is not true then
      raise exception 'Plazo de reemplazo cerrado: %', v_plazo->>'motivo';
    end if;
    if p_reemplazo_id = p_jugador_id then
      raise exception 'El reemplazo debe ser otro jugador.';
    end if;
    if not exists (
      select 1 from public.jugadores j
      where j.id = p_reemplazo_id and j.activo is not false and coalesce(j.suspendido, false) = false
    ) then
      raise exception 'El reemplazo debe ser un jugador registrado y activo.';
    end if;

    -- Bajo el cerrojo de torneo se bloquea la fila del entrante si existiera.
    -- Un participante RETIRADO puede volver a entrar: su fila historica se
    -- reactiva en lugar de insertar una duplicada. Solo bloquea a quien ya
    -- esta ACTIVO en este torneo.
    select tp.estado into v_entrante_estado
    from public.torneo_participantes tp
    where tp.torneo_id = p_torneo_id and tp.jugador_id = p_reemplazo_id
    for update;

    if v_entrante_estado = 'activo' then
      raise exception 'Ese jugador ya participa en este torneo.';
    end if;
    update public.torneo_participantes
    set estado = 'retirado', retirado_en = now(), motivo = p_motivo,
        resolucion = 'reemplazo', reemplazo_id = p_reemplazo_id,
        registrado_por = auth.uid(), solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and jugador_id = p_jugador_id;

    -- Reincorporacion: si el entrante ya tuvo una baja en este torneo, se
    -- reactiva su fila historica y se limpia el resultado de aquella baja.
    insert into public.torneo_participantes
      (torneo_id, jugador_id, grupo_id, estado, inscrito_en, registrado_por,
       retirado_en, motivo, resolucion, reemplazo_id, resultado)
    values
      (p_torneo_id, p_reemplazo_id, v_grupo_id, 'activo', now(), auth.uid(),
       null, null, null, null, null)
    on conflict (torneo_id, jugador_id) do update
      set estado = 'activo',
          grupo_id = excluded.grupo_id,
          inscrito_en = excluded.inscrito_en,
          registrado_por = excluded.registrado_por,
          retirado_en = null,
          motivo = null,
          resolucion = null,
          reemplazo_id = null,
          resultado = null,
          solicitud_id = null;
    -- No se modifica jugadores.torneo_id: torneo_participantes es la ├║nica
    -- fuente de pertenencia por torneo.

    -- Grupos de los pendientes que se van a reasignar. Se consultan con las
    -- tablas ya bloqueadas, sin FOR UPDATE de filas: el bloqueo de tabla
    -- SHARE ROW EXCLUSIVE excluye a cualquier otro escritor.
    select coalesce(array_agg(distinct p.grupo_id), '{}'::uuid[])
      into v_grupos_afectados
    from public.partidos p
    where p.torneo_id = p_torneo_id
      and p.estado = 'pendiente'
      and (p.local_id = p_jugador_id or p.visitante_id = p_jugador_id)
      and p.grupo_id is not null;

    -- El entrante ocupa el lugar competitivo; el saliente NO se elimina de
    -- grupo_jugadores: esa fila es la evidencia hist├│rica de pertenencia que
    -- usan Historial de grupos, recalcular_clasificacion_interno y el perfil.
    -- La baja se representa en torneo_participantes (estado='retirado'), no
    -- borrando la membres├¡a. La UI debe filtrar el plantel activo por estado.
    -- Se inscribe en TODOS los grupos con pendientes ANTES de tocar partidos:
    -- el trigger desplegado fn_validar_jugadores_partido exige que local y
    -- visitante ya pertenezcan al grupo del partido.
    if v_grupo_id is not null
       and not (v_grupo_id = any(v_grupos_afectados)) then
      v_grupos_afectados := array_append(v_grupos_afectados, v_grupo_id);
    end if;
    -- Un jugador solo puede pertenecer a un grupo por torneo
    -- (trg_jugador_unico_por_torneo). Si el entrante ya tenia una membresia
    -- historica en otro grupo, se traslada al grupo del saliente; si no,
    -- se crea la membresia. Asi el partido pendiente puede reasignarse.
    if exists (
      select 1
      from public.grupo_jugadores gj
      join public.grupos g on g.id = gj.grupo_id
      where gj.jugador_id = p_reemplazo_id and g.torneo_id = p_torneo_id
    ) then
      update public.grupo_jugadores gj
         set grupo_id = v_grupo_id
       where gj.id = (
         select gj2.id
         from public.grupo_jugadores gj2
         join public.grupos g2 on g2.id = gj2.grupo_id
         where gj2.jugador_id = p_reemplazo_id and g2.torneo_id = p_torneo_id
         order by gj2.id
         limit 1
       );
    else
      insert into public.grupo_jugadores (grupo_id, jugador_id)
      values (v_grupo_id, p_reemplazo_id);
    end if;

    -- Reasignaci├│n, NO resoluci├│n: el partido sigue 'pendiente', conserva
    -- jornada, grupo y rival; cambia solo el participante saliente. Se
    -- registran campos propios de reasignaci├│n, nunca los de resoluci├│n.
    update public.partidos
    set local_id = p_reemplazo_id, updated_at = now(),
        reasignado_por = auth.uid(), reasignado_en = now(),
        reasignado_motivo = 'Reemplazo de participante dentro del plazo',
        solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and estado = 'pendiente' and local_id = p_jugador_id;
    get diagnostics v_reasignados = row_count;

    update public.partidos
    set visitante_id = p_reemplazo_id, updated_at = now(),
        reasignado_por = auth.uid(), reasignado_en = now(),
        reasignado_motivo = 'Reemplazo de participante dentro del plazo',
        solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and estado = 'pendiente' and visitante_id = p_jugador_id;
    get diagnostics v_resueltos = row_count;
    v_reasignados := v_reasignados + v_resueltos;

    v_tipo := 'reemplazo';
    v_resultado := jsonb_build_object(
      'ok', true, 'tipo', v_tipo, 'ya_aplicado', false,
      'torneo_id', p_torneo_id, 'jugador_saliente', p_jugador_id,
      'jugador_entrante', p_reemplazo_id, 'grupo_id', v_grupo_id,
      'plazo', v_plazo,
      'partidos_pendientes_reasignados', v_reasignados,
      'resultados_anteriores', 'conservados en el jugador saliente',
      'solicitud_id', p_solicitud_id
    );
  else
    --------------------------------------------------------------------------
    -- CASO B: retiro sin reemplazo. Solo partidos PENDIENTES se resuelven.
    -- Los resultados ya cargados (incluida la jornada reci├®n cerrada) quedan.
    --------------------------------------------------------------------------
    for v_partido in
      select id, grupo_id, estado, goles_local, goles_visitante
      from public.partidos
      where torneo_id = p_torneo_id
        and estado = 'pendiente'
        and (local_id = p_jugador_id or visitante_id = p_jugador_id)
      order by jornada, id
      for update
    loop
      insert into public.partidos_historial
        (partido_id, torneo_id, registrado_por, goles_local_ant, goles_visita_ant,
         estado_ant, goles_local_nuevo, goles_visita_nuevo, estado_nuevo, motivo)
      values
        (v_partido.id, p_torneo_id, v_admin_jugador_id,
         v_partido.goles_local, v_partido.goles_visitante, v_partido.estado,
         case when exists (select 1 from public.partidos p where p.id = v_partido.id and p.local_id = p_jugador_id) then 0 else 3 end,
         case when exists (select 1 from public.partidos p where p.id = v_partido.id and p.local_id = p_jugador_id) then 3 else 0 end,
         'jornada_libre', p_motivo);

      update public.partidos
      set estado = 'jornada_libre',
          goles_local = case when local_id = p_jugador_id then 0 else 3 end,
          goles_visitante = case when local_id = p_jugador_id then 3 else 0 end,
          motivo_resolucion = 'Jornada libre por baja del torneo (3-0 al rival)',
          participante_retirado_id = p_jugador_id,
          resuelto_por = auth.uid(), resuelto_en = now(),
          ingresado_por = v_admin_jugador_id,
          solicitud_id = p_solicitud_id,
          updated_at = now()
      where id = v_partido.id and estado = 'pendiente';

      v_resueltos := v_resueltos + 1;
      if v_partido.grupo_id is not null
         and not (v_partido.grupo_id = any(v_grupos_afectados)) then
        v_grupos_afectados := array_append(v_grupos_afectados, v_partido.grupo_id);
      end if;
    end loop;

    update public.torneo_participantes
    set estado = 'retirado', retirado_en = now(), motivo = p_motivo,
        resolucion = 'jornada_libre', registrado_por = auth.uid(),
        solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and jugador_id = p_jugador_id;

    -- La fila de grupo se conserva como evidencia hist├│rica; el estado
    -- 'retirado' es lo que lo excluye del plantel activo en la interfaz.
    v_tipo := 'retiro';
    v_resultado := jsonb_build_object(
      'ok', true, 'tipo', v_tipo, 'ya_aplicado', false,
      'torneo_id', p_torneo_id, 'jugador_id', p_jugador_id,
      'grupo_id', v_grupo_id, 'plazo', v_plazo,
      'partidos_resueltos', v_resueltos,
      'criterio', '3-0 al rival en cada pendiente; mismo calculo que walkover, motivo propio',
      'resultados_anteriores', 'conservados sin cambios',
      'cuenta_global', 'conservada',
      'solicitud_id', p_solicitud_id
    );
  end if;

  -- Rec├ílculo de tabla DENTRO de la misma transacci├│n, tanto en reemplazo
  -- como en retiro. En el reemplazo, recalcular_clasificacion_interno lee
  -- grupo_jugadores (donde siguen el saliente y el entrante) y excluye los
  -- partidos pendientes: el saliente conserva sus resultados anteriores y
  -- el entrante aparece con 0 PJ hasta que se juegue su partido. Las
  -- estad├¡sticas de ambos quedan separadas porque el rec├ílculo filtra por
  -- local_id / visitante_id de cada partido.
  if v_grupo_id is not null and not (v_grupo_id = any(v_grupos_afectados)) then
    v_grupos_afectados := array_append(v_grupos_afectados, v_grupo_id);
  end if;
  foreach v_grupo_recalculo in array v_grupos_afectados loop
    v_recalculo := public.recalcular_clasificacion_interno(p_torneo_id, v_grupo_recalculo);
    if coalesce(v_recalculo->>'ok', 'false') <> 'true' then
      raise exception 'No se pudo recalcular la clasificaci├│n del grupo %: %',
        v_grupo_recalculo, coalesce(v_recalculo->>'error', 'error desconocido');
    end if;
  end loop;
  v_resultado := v_resultado || jsonb_build_object(
    'grupos_recalculados', to_jsonb(v_grupos_afectados));

  -- Resultado DEFINITIVO guardado antes de auditar. As├¡ la respuesta original
  -- y la de un reintento id├®ntico son la misma, incluidos los grupos
  -- recalculados. No se guarda el resultado preliminar de arriba.
  update public.torneo_participantes
  set resultado = v_resultado
  where torneo_id = p_torneo_id and jugador_id = p_jugador_id;

  -- Auditor├¡a en la tabla que lee la pantalla (sobrecarga de 7 argumentos).
  perform public.gl_registrar_auditoria(
    p_torneo_id, v_grupo_id, 'participante_' || v_tipo, 'participante',
    p_jugador_id, auth.uid(),
    v_resultado || jsonb_build_object(
      'estado_anterior', 'activo',
      'estado_nuevo', 'retirado',
      'motivo', p_motivo,
      'autorizado_por', auth.uid(),
      'fecha', now()
    )
  );

  return v_resultado;
exception when others then
  return jsonb_build_object(
    'ok', false,
    'mensaje', 'No se pudo gestionar la baja: ' || sqlerrm,
    'solicitud_id', p_solicitud_id
  );
end;
$function$;

alter function public.gl_gestionar_baja(uuid, uuid, text, uuid, uuid)
  owner to postgres;

notify pgrst, 'reload schema';

commit;