/* =====================================================================
   ESTADÍSTICAS — Servicio centralizado de cálculo
   Regla clave: clasificación usa GL.resultado() (incluye walkovers).
                Rendimiento deportivo usa GL.golesReales() (solo FC Mobile).
   ===================================================================== */
(function () {

  const EST = {

    /* ------------------------------------------------------------------
       calcularClasificacion(partidos, jugadorId?)
       Devuelve PJ/PG/PE/PP/GF-reglamentario/GC-reglamentario/Dif/Pts
       para todos los jugadores (o solo el indicado).
       GF/GC INCLUYEN walkovers porque determinan la tabla de posiciones.
    ------------------------------------------------------------------ */
    calcularClasificacion(partidos, jugadorId) {
      const stats = {};
      const a = id => stats[id] || (stats[id] = {
        id, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0, pts: 0, resultados: []
      });
      const ord = partidos.slice().sort((x, y) =>
        (Number(x.jornada) || 0) - (Number(y.jornada) || 0) ||
        String(x.created_at || '').localeCompare(String(y.created_at || '')));

      ord.forEach(p => {
        const r = GL.resultado(p);
        if (r.pendiente) return;
        const l = a(p.local_id), v = a(p.visitante_id);
        l.pj++; v.pj++;
        l.gf += r.gf; l.gc += r.gc; l.dif += r.gf - r.gc;
        v.gf += r.gc; v.gc += r.gf; v.dif += r.gc - r.gf;
        if (r.gf > r.gc) { l.pg++; v.pp++; l.pts += 3; l.resultados.push('V'); v.resultados.push('D'); }
        else if (r.gf === r.gc) { l.pe++; v.pe++; l.pts += 1; v.pts += 1; l.resultados.push('E'); v.resultados.push('E'); }
        else { l.pp++; v.pg++; v.pts += 3; l.resultados.push('D'); v.resultados.push('V'); }
      });

      const todos = Object.values(stats);
      if (jugadorId) return todos.filter(s => s.id === jugadorId)[0] || null;
      return todos;
    },

    /* ------------------------------------------------------------------
       calcularGolesReales(partidos, jugadorId?)
       Solo goles marcados en FC Mobile (p.estado === 'jugado').
       No cuenta walkovers ni resoluciones por expulsión.
    ------------------------------------------------------------------ */
    calcularGolesReales(partidos, jugadorId) {
      const stats = {};
      const a = id => stats[id] || (stats[id] = { id, gf: 0, gc: 0, dif: 0, pj: 0 });
      partidos.filter(p => p.estado === 'jugado' && !GL.esResolucionExpulsion(p)).forEach(p => {
        const gr = GL.golesReales(p);
        const l = a(p.local_id), v = a(p.visitante_id);
        l.pj++; v.pj++;
        l.gf += gr.gf; l.gc += gr.gc; l.dif += gr.gf - gr.gc;
        v.gf += gr.gc; v.gc += gr.gf; v.dif += gr.gc - gr.gf;
      });
      const todos = Object.values(stats);
      if (jugadorId) return todos.filter(s => s.id === jugadorId)[0] || { id: jugadorId, gf: 0, gc: 0, dif: 0, pj: 0 };
      return todos;
    },

    /* ------------------------------------------------------------------
       calcularVallasInvictas(partidos, jugadorId?)
       Solo partidos estado='jugado' sin resolución por expulsión.
       Cuenta valla del local si gc===0, del visitante si gf===0.
    ------------------------------------------------------------------ */
    calcularVallasInvictas(partidos, jugadorId) {
      const stats = {};
      const a = id => stats[id] || (stats[id] = { id, vallas: 0 });
      partidos.filter(p => p.estado === 'jugado' && !GL.esResolucionExpulsion(p)).forEach(p => {
        const gr = GL.golesReales(p);
        if (gr.gc === 0) a(p.local_id).vallas++;
        if (gr.gf === 0) a(p.visitante_id).vallas++;
      });
      const todos = Object.values(stats);
      if (jugadorId) return (todos.find(s => s.id === jugadorId) || { id: jugadorId, vallas: 0 }).vallas;
      return todos;
    },

    /* ------------------------------------------------------------------
       calcularPromedios(partidos, jugadorId?)
       Posesión y precisión de pase — solo partidos jugados en FC Mobile.
    ------------------------------------------------------------------ */
    calcularPromedios(partidos, jugadorId) {
      const stats = {};
      const a = id => stats[id] || (stats[id] = { id, pj: 0, posesion: 0, pase: 0, tiros: 0, tirosPuerta: 0 });
      // Solo partidos realmente jugados en FC Mobile.
      // Los walkovers y resoluciones por expulsión NO generan datos de posesión,
      // tiros ni precisión de pase — son marcadores administrativos, no rendimiento real.
      partidos.filter(p => p.estado === 'jugado' && !GL.esAdministrativo(p)).forEach(p => {
        const l = a(p.local_id), v = a(p.visitante_id);
        l.pj++; v.pj++;
        l.posesion += Number(p.posesion_local) || 0;
        v.posesion += Number(p.posesion_visitante) || 0;
        l.pase += Number(p.pase_local) || 0;
        v.pase += Number(p.pase_visitante) || 0;
        l.tiros += Number(p.tiros_local) || 0;
        v.tiros += Number(p.tiros_visitante) || 0;
        l.tirosPuerta += Number(p.tiros_puerta_local) || 0;
        v.tirosPuerta += Number(p.tiros_puerta_visitante) || 0;
      });
      Object.values(stats).forEach(s => {
        s.promPos = s.pj ? Math.round(s.posesion / s.pj) : 0;
        s.promPase = s.pj ? Math.round(s.pase / s.pj) : 0;
      });
      const todos = Object.values(stats);
      if (jugadorId) return todos.find(s => s.id === jugadorId) || { id: jugadorId, pj: 0, posesion: 0, pase: 0, tiros: 0, tirosPuerta: 0, promPos: 0, promPase: 0 };
      return todos;
    },

    /* ------------------------------------------------------------------
       calcularRachas(resultados[])
       Recibe array de strings 'V'|'E'|'D' cronológico (más antiguo primero).
    ------------------------------------------------------------------ */
    calcularRachas(resultados) {
      if (!resultados.length) return { actual: { tipo: '—', texto: '—', n: 0 }, mejorVictorias: 0 };
      const ultimo = resultados[resultados.length - 1];
      let nActual = 0;
      for (let i = resultados.length - 1; i >= 0 && resultados[i] === ultimo; i--) nActual++;
      let mejor = 0, actual = 0;
      resultados.forEach(r => { actual = r === 'V' ? actual + 1 : 0; mejor = Math.max(mejor, actual); });
      return {
        actual: { tipo: ultimo, texto: ultimo + nActual, n: nActual },
        mejorVictorias: mejor
      };
    },

    /* ------------------------------------------------------------------
       calcularRendimiento(partidos, jugadorId)
       Combina goles reales + clasificacion + promedios + vallas + racha
       en un único objeto listo para mostrar en el perfil.
    ------------------------------------------------------------------ */
    calcularRendimiento(partidos, jugadorId) {
      const cl = EST.calcularClasificacion(partidos, jugadorId) || {};
      const gr = EST.calcularGolesReales(partidos, jugadorId);
      const prom = EST.calcularPromedios(partidos, jugadorId);
      const vallas = EST.calcularVallasInvictas(partidos, jugadorId);
      const rachaData = EST.calcularRachas(cl.resultados || []);

      // Mejor victoria y peor derrota: sobre goles reales (estado jugado)
      let mejorVictoria = null, peorDerrota = null;
      partidos.filter(p => p.estado !== 'pendiente').forEach(p => {
        const r = GL.resultado(p);
        const local = p.local_id === jugadorId;
        const aFavor = local ? r.gf : r.gc;
        const enContra = local ? r.gc : r.gf;
        const diff = aFavor - enContra;
        if (diff > 0 && (!mejorVictoria || diff > mejorVictoria.diff))
          mejorVictoria = { diff, texto: aFavor + ' - ' + enContra };
        if (diff < 0 && (!peorDerrota || diff < peorDerrota.diff))
          peorDerrota = { diff, texto: aFavor + ' - ' + enContra };
      });

      return {
        id: jugadorId,
        // Clasificación (incluye walkovers)
        pj: cl.pj || 0, pg: cl.pg || 0, pe: cl.pe || 0, pp: cl.pp || 0,
        pts: cl.pts || 0,
        // Goles reglamentarios (para tabla de posiciones)
        gfReglamentario: cl.gf || 0,
        gcReglamentario: cl.gc || 0,
        difReglamentario: cl.dif || 0,
        // Goles reales (rendimiento deportivo, solo FC Mobile)
        gf: gr.gf, gc: gr.gc, dif: gr.dif,
        // Vallas y promedios
        vallas,
        promPos: prom.promPos, promPase: prom.promPase,
        tiros: prom.tiros, tirosPuerta: prom.tirosPuerta,
        // Racha
        racha: rachaData.actual,
        mejorRacha: rachaData.mejorVictorias,
        mejorVictoria: mejorVictoria ? mejorVictoria.texto : '—',
        peorDerrota: peorDerrota ? peorDerrota.texto : '—'
      };
    },

    /* ------------------------------------------------------------------
       calcularHeadToHead(partidos, idA, idB)
       Devuelve stats del enfrentamiento directo entre dos jugadores.
    ------------------------------------------------------------------ */
    calcularHeadToHead(partidos, idA, idB) {
      const js = partidos.filter(p => p.estado !== 'pendiente' &&
        ((p.local_id === idA && p.visitante_id === idB) ||
         (p.visitante_id === idA && p.local_id === idB)));
      let g = 0, e = 0, p = 0, gf = 0, gc = 0;
      js.forEach(x => {
        const r = GL.resultado(x);
        const local = x.local_id === idA;
        const a = local ? r.gf : r.gc, b = local ? r.gc : r.gf;
        gf += a; gc += b;
        if (a > b) g++; else if (a === b) e++; else p++;
      });
      return { partidos: js.length, g, e, p, gf, gc };
    }

  };

  window.EST = EST;
})();