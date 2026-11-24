/* =====================================================================
   GOATS LEAGUE MANAGER — Cálculo de clasificación (helper compartido)
   Se llama siempre que se guarda un partido, una sanción o se cierra jornada.
   ===================================================================== */
async function recalcularClasificacion(torneo_id, grupo_id) {
  if (!sb) throw new Error('Supabase no configurado');
  await GL.cargarContexto(true);
  const ctx = GL.ctx;
  const tid = torneo_id || (ctx.torneo && ctx.torneo.id);
  if (!tid) throw new Error('No hay torneo activo');

  const jugadoresGrupo = grupo_id
    ? ctx.jugadores.filter(j => (ctx.miembros || []).some(m => m.grupo_id === grupo_id && m.jugador_id === j.id))
    : ctx.jugadores.slice();

  const idsGrupo = new Set(jugadoresGrupo.map(j => j.id));
  const gid = grupo_id || (jugadoresGrupo[0] && (ctx.miembros || []).find(m => m.jugador_id === jugadoresGrupo[0].id));

  const [partidosTodos, sancionesTodas] = await Promise.all([
    sb.from('partidos').select('*').eq('torneo_id', tid),
    sb.from('sanciones').select('*').eq('torneo_id', tid)
  ]);
  if (partidosTodos.error) throw new Error(partidosTodos.error.message);

  const jornadasMax = (ctx.torneo && Number(ctx.torneo.total_jornadas)) || CONFIG.JORNADAS_FASE_REGULAR;
  const partidos = (partidosTodos.data || []).filter(p =>
    p.estado !== 'pendiente' &&
    Number(p.jornada) <= jornadasMax &&
    idsGrupo.has(p.local_id) && idsGrupo.has(p.visitante_id) &&
    (!grupo_id || p.grupo_id === grupo_id)
  );
  const sanciones = sancionesTodas.data || [];

  const filas = jugadoresGrupo.map(j => {
    const propios = partidos.filter(p => p.local_id === j.id || p.visitante_id === j.id);
    let pj = 0, pg = 0, pe = 0, pp = 0, gf = 0, gc = 0;
    propios.forEach(p => {
      const r = GL.resultado(p);
      if (r.pendiente) return;
      pj++;
      const aFavor = p.local_id === j.id ? r.gf : r.gc;
      const enContra = p.local_id === j.id ? r.gc : r.gf;
      gf += aFavor; gc += enContra;
      if (aFavor > enContra) pg++; else if (aFavor === enContra) pe++; else pp++;
    });
    const dif = gf - gc;
    const ptsPenalizacion = sanciones
      .filter(s => s.jugador_id === j.id)
      .reduce((a, s) => a + (Number(s.puntos_descuento) || 0), 0);
    const brutos = pg * 3 + pe;
    return {
      torneo_id: tid,
      grupo_id: (grupo_id || (ctx.miembros || []).find(m => m.jugador_id === j.id && ctx.grupos.some(g => g.id === m.grupo_id))?.grupo_id) || gid || null,
      jugador_id: j.id,
      pj, pg, pe, pp, gf, gc, dif,
      pts: Math.max(0, brutos - ptsPenalizacion),
      pts_penalizacion: ptsPenalizacion,
      updated_at: new Date().toISOString()
    };
  });

  filas.sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf);

  const conflictos = ['jugador_id', 'torneo_id,jugador_id'];
  let ultimo = null;
  for (const on of conflictos) {
    const { error } = await sb.from('clasificacion').upsert(filas, { onConflict: on });
    if (!error) { ultimo = null; break; }
    ultimo = error;
  }
  if (ultimo) {
    // Último recurso: borrar las filas del grupo y volver a insertar.
    if (gid) await sb.from('clasificacion').delete().eq('torneo_id', tid).eq('grupo_id', gid);
    const { error } = await sb.from('clasificacion').insert(filas);
    if (error) throw new Error(error.message);
  }
  GL.invalidar();
  await GL.cargarContexto(true);
  return filas;
}

async function recalcularTodosLosGrupos(torneo_id) {
  await GL.cargarContexto(true);
  const tid = torneo_id || (GL.torneo() && GL.torneo().id);
  const grupos = GL.grupos();
  for (const g of grupos) await recalcularClasificacion(tid, g.id);
  return true;
}

GL.recalcularClasificacion = recalcularClasificacion;
GL.recalcularTodo = recalcularTodosLosGrupos;
window.recalcularClasificacion = recalcularClasificacion;
