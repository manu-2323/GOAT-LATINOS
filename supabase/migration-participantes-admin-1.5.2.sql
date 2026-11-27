-- 1.5.2 — corrección de pertenencia por torneo.
-- La pertenencia competitiva la define torneo_participantes, no el rol global.
-- Administradores activos pueden inscribirse y ser reemplazo.
begin;

create or replace function public.gl_inscribir_participantes(
  p_torneo_id uuid,
  p_jugador_ids uuid[]
)
returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_inscritos integer := 0;
  v_pid uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no autenticada'; end if;
  if not public.gl_es_admin() then raise exception 'No autorizado'; end if;
  if p_torneo_id is null then raise exception 'Torneo no válido'; end if;

  -- Cerrojo de torneo: inscripción y sustitución se serializan entre sí.
  -- Sin este bloqueo, dos administradores podrían verificar "no participa"
  -- al mismo tiempo y competir por la misma fila.
  perform 1 from public.torneos t where t.id = p_torneo_id for update;
  if not found then raise exception 'Torneo no válido'; end if;

  p_jugador_ids := coalesce(p_jugador_ids, '{}'::uuid[]);
  foreach v_pid in array p_jugador_ids loop
    if not exists (select 1 from public.jugadores j where j.id = v_pid and j.activo is not false and coalesce(j.suspendido, false) = false) then
      raise exception 'Participante no válido para el torneo: %', v_pid::text;
    end if;
  end loop;

  insert into public.torneo_participantes (torneo_id, jugador_id)
  select p_torneo_id, u.jugador_id
  from unnest(p_jugador_ids) as u(jugador_id)
  on conflict (torneo_id, jugador_id) do nothing;
  get diagnostics v_inscritos = row_count;

  -- NO se toca jugadores.torneo_id: la pertenencia a cada competencia la
  -- define torneo_participantes. El puntero global queda como dato histórico
  -- del contexto del jugador y no se reescribe al inscribirlo en otro torneo.

  return jsonb_build_object('ok', true, 'torneo_id', p_torneo_id,
    'inscritos', v_inscritos, 'mensaje', 'Participantes inscriptos en el torneo.');
exception when others then
  return jsonb_build_object('ok', false,
    'mensaje', 'No se pudieron inscribir los participantes: ' || sqlerrm);
end;
$fn$;

create or replace function public.gl_gestionar_baja(
  p_torneo_id uuid,
  p_jugador_id uuid,
  p_motivo text,
  p_solicitud_id uuid,
  p_reemplazo_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $fn$
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
begin
  if auth.uid() is null then raise exception 'Sesión no autenticada'; end if;
  if not public.gl_es_admin() then raise exception 'No autorizado'; end if;
  if p_torneo_id is null or p_jugador_id is null then raise exception 'Torneo y jugador son obligatorios'; end if;
  if p_solicitud_id is null then raise exception 'Falta el identificador de la solicitud'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'El motivo de la baja es obligatorio'; end if;

  -- Cerrojo de torneo PRIMERO: inscripción y sustitución comparten el mismo
  -- orden de bloqueo, por lo que no pueden incorporar al mismo jugador.
  perform 1 from public.torneos t where t.id = p_torneo_id for update;
  if not found then raise exception 'Torneo no válido'; end if;

  select id into v_admin_jugador_id from public.jugadores where user_id = auth.uid() and rol = 'admin' limit 1;
  if v_admin_jugador_id is null then raise exception 'No autorizado'; end if;

  -- Cerrojo de fila del participante saliente.
  select tp.grupo_id, tp.estado, tp.resultado into v_grupo_id, v_estado, v_ya
  from public.torneo_participantes tp
  where tp.torneo_id = p_torneo_id and tp.jugador_id = p_jugador_id
  for update;

  if not found then
    raise exception 'El jugador no está inscripto en este torneo.';
  end if;

  -- Reintento tras timeout o doble clic: devuelve el resultado ya guardado.
  if v_estado = 'retirado' or v_ya is not null then
    return coalesce(v_ya, jsonb_build_object(
      'ok', true, 'ya_aplicado', true, 'estado', 'retirado',
      'solicitud_id', p_solicitud_id
    )) || jsonb_build_object('ya_aplicado', true);
  end if;

  if v_estado <> 'activo' then
    raise exception 'La participación no está activa.';
  end if;

  -- Recuperación del grupo: torneo_participantes -> grupo_jugadores ->
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

  -- Sincronización REAL con el cierre de jornada, demostrable por modos de
  -- bloqueo de PostgreSQL (no por orden de filas):
  --   * gl_cerrar_jornada_interno desplegado ejecuta UPDATE sobre partidos
  --     (pasos 4-6) y sobre jornadas (paso 7). Todo UPDATE mantiene
  --     RowExclusiveLock a nivel de TABLA hasta que la transacción termina.
  --   * SHARE ROW EXCLUSIVE entra en conflicto con RowExclusiveLock. Por eso
  --     esta operación espera a cualquier cierre que esté escribiendo, y un
  --     cierre que intente escribir espera a esta operación.
  --   * Se piden las tablas en orden fijo (partidos -> jornadas), que es el
  --     mismo orden en que el cierre desplegado ejecuta sus UPDATE. No hay
  --     inversión de orden ni dependencia del plan de consulta.
  -- No se modifica la función de cierre: basta con el modo de bloqueo.
  lock table public.partidos in share row exclusive mode;
  lock table public.jornadas in share row exclusive mode;

  -- Evaluación del plazo con las tablas protegidas contra escritores. Si otra
  -- transacción cerró la J7, esta operación espera a que confirme y lee el estado final.
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

    -- Bajo el cerrojo de torneo, bloqueamos también la fila del entrante si
    -- ya existiera. Una inscripción simultánea espera al mismo cerrojo.
    perform 1 from public.torneo_participantes tp
    where tp.torneo_id = p_torneo_id and tp.jugador_id = p_reemplazo_id
    for update;
    if exists (
      select 1 from public.torneo_participantes tp
      where tp.torneo_id = p_torneo_id and tp.jugador_id = p_reemplazo_id
    ) or exists (
      select 1 from public.grupo_jugadores gj
      join public.grupos g on g.id = gj.grupo_id
      where g.torneo_id = p_torneo_id and gj.jugador_id = p_reemplazo_id
    ) then
      raise exception 'Ese jugador ya participa en este torneo.';
    end if;

    update public.torneo_participantes
    set estado = 'retirado', retirado_en = now(), motivo = p_motivo,
        resolucion = 'reemplazo', reemplazo_id = p_reemplazo_id,
        registrado_por = auth.uid(), solicitud_id = p_solicitud_id
    where torneo_id = p_torneo_id and jugador_id = p_jugador_id;

    insert into public.torneo_participantes
      (torneo_id, jugador_id, grupo_id, estado, inscrito_en, registrado_por)
    values (p_torneo_id, p_reemplazo_id, v_grupo_id, 'activo', now(), auth.uid())
    on conflict (torneo_id, jugador_id) do nothing;

    -- No se modifica jugadores.torneo_id: torneo_participantes es la única
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
    -- grupo_jugadores: esa fila es la evidencia histórica de pertenencia que
    -- usan Historial de grupos, recalcular_clasificacion_interno y el perfil.
    -- La baja se representa en torneo_participantes (estado='retirado'), no
    -- borrando la membresía. La UI debe filtrar el plantel activo por estado.
    -- Se inscribe en TODOS los grupos con pendientes ANTES de tocar partidos:
    -- el trigger desplegado fn_validar_jugadores_partido exige que local y
    -- visitante ya pertenezcan al grupo del partido.
    if v_grupo_id is not null
       and not (v_grupo_id = any(v_grupos_afectados)) then
      v_grupos_afectados := array_append(v_grupos_afectados, v_grupo_id);
    end if;
    foreach v_grupo_recalculo in array v_grupos_afectados loop
      insert into public.grupo_jugadores (grupo_id, jugador_id)
      values (v_grupo_recalculo, p_reemplazo_id)
      on conflict do nothing;
    end loop;

    -- Reasignación, NO resolución: el partido sigue 'pendiente', conserva
    -- jornada, grupo y rival; cambia solo el participante saliente. Se
    -- registran campos propios de reasignación, nunca los de resolución.
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
    -- Los resultados ya cargados (incluida la jornada recién cerrada) quedan.
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

    -- La fila de grupo se conserva como evidencia histórica; el estado
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

  -- Recálculo de tabla DENTRO de la misma transacción, tanto en reemplazo
  -- como en retiro. En el reemplazo, recalcular_clasificacion_interno lee
  -- grupo_jugadores (donde siguen el saliente y el entrante) y excluye los
  -- partidos pendientes: el saliente conserva sus resultados anteriores y
  -- el entrante aparece con 0 PJ hasta que se juegue su partido. Las
  -- estadísticas de ambos quedan separadas porque el recálculo filtra por
  -- local_id / visitante_id de cada partido.
  if v_grupo_id is not null and not (v_grupo_id = any(v_grupos_afectados)) then
    v_grupos_afectados := array_append(v_grupos_afectados, v_grupo_id);
  end if;
  foreach v_grupo_recalculo in array v_grupos_afectados loop
    v_recalculo := public.recalcular_clasificacion_interno(p_torneo_id, v_grupo_recalculo);
    if coalesce(v_recalculo->>'ok', 'false') <> 'true' then
      raise exception 'No se pudo recalcular la clasificación del grupo %: %',
        v_grupo_recalculo, coalesce(v_recalculo->>'error', 'error desconocido');
    end if;
  end loop;
  v_resultado := v_resultado || jsonb_build_object(
    'grupos_recalculados', to_jsonb(v_grupos_afectados));

  -- Resultado DEFINITIVO guardado antes de auditar. Así la respuesta original
  -- y la de un reintento idéntico son la misma, incluidos los grupos
  -- recalculados. No se guarda el resultado preliminar de arriba.
  update public.torneo_participantes
  set resultado = v_resultado
  where torneo_id = p_torneo_id and jugador_id = p_jugador_id;

  -- Auditoría en la tabla que lee la pantalla (sobrecarga de 7 argumentos).
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
$fn$;
revoke all on function public.gl_inscribir_participantes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.gl_inscribir_participantes(uuid, uuid[]) to authenticated;
grant execute on function public.gl_inscribir_participantes(uuid, uuid[]) to service_role;

revoke all on function public.gl_gestionar_baja(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.gl_gestionar_baja(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.gl_gestionar_baja(uuid, uuid, text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
