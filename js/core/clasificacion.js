/* =====================================================================
   GOATS LEAGUE MANAGER — Cálculo de clasificación (helper compartido)
   Se llama siempre que se guarda un partido, una sanción o se cierra jornada.
   El recálculo real ocurre en PostgreSQL vía RPC (recalcular_clasificacion).
   ===================================================================== */
async function recalcularClasificacion(torneo_id, grupo_id) {
  if (!sb) throw new Error('Supabase no configurado');

  await GL.cargarContexto(true);
  const ctx = GL.ctx;

  // ── 1. Resolver torneo_id ────────────────────────────────────────────
  const tid = torneo_id || (ctx.torneo && ctx.torneo.id);
  if (!tid) throw new Error('No hay torneo activo');

  // ── 2. Resolver grupo_id → siempre un UUID o null ───────────────────
  let gid = null;
  if (grupo_id) {
    // Ya viene el UUID directo
    gid = grupo_id;
  } else {
    // Inferir desde los miembros del contexto
    const miembros = ctx.miembros || [];
    if (miembros.length > 0 && ctx.jugadores && ctx.jugadores.length > 0) {
      const primerJugador = ctx.jugadores[0];
      const miembro = miembros.find(m => m.jugador_id === primerJugador.id);
      // miembro.grupo_id es el UUID del grupo
      gid = (miembro && typeof miembro.grupo_id === 'string') ? miembro.grupo_id : null;
    }
  }

  // ── 3. Delegar el recálculo a PostgreSQL vía RPC ─────────────────────
  //    La función SQL recalcular_clasificacion(p_torneo_id, p_grupo_id)
  //    opera dentro de una transacción: si algo falla, conserva los datos
  //    anteriores y devuelve un objeto { ok, error }.
  const { data, error } = await sb.rpc('recalcular_clasificacion', {
    p_torneo_id: tid,
    p_grupo_id:  gid   // null = todos los grupos del torneo
  });

  if (error) {
    console.error('[Clasificación] RPC falló, clasificación anterior conservada:', error.message);
    throw new Error('No se pudo actualizar la clasificación: ' + error.message);
  }

  if (data && data.error) {
    console.error('[Clasificación] Error interno del RPC:', data.error);
    throw new Error('No se pudo actualizar la clasificación: ' + data.error);
  }

  GL.invalidar();
  await GL.cargarContexto(true);

  // Devolver las filas actualizadas desde el contexto ya refrescado
  const clasificacion = (ctx.clasificacion || []).filter(
    c => c.torneo_id === tid && (!gid || c.grupo_id === gid)
  );
  return clasificacion;
}

async function recalcularTodosLosGrupos(torneo_id) {
  await GL.cargarContexto(true);
  const tid = torneo_id || (GL.torneo() && GL.torneo().id);
  if (!tid) throw new Error('No hay torneo activo');

  // Pasar grupo_id = null para que el RPC procese todos los grupos del torneo
  return recalcularClasificacion(tid, null);
}

GL.recalcularClasificacion = recalcularClasificacion;
GL.recalcularTodo          = recalcularTodosLosGrupos;
window.recalcularClasificacion = recalcularClasificacion;