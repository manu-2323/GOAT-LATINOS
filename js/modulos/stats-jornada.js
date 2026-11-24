/* =====================================================================
   MÓDULO 4 — Estadísticas avanzadas de jornada
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Estadísticas',
    grupoId: null,
    jornada: null,

    async render(el) {
      el.innerHTML = GL.skeleton(8);
      try {
        await GL.cargarContexto(true);
        const grupos = GL.grupos();
        if (!GL.torneo()) { el.innerHTML = GL.vacio('No hay torneo activo todavía.', 'trophy', null); iniciarIconos(); return; }
        if (!grupos.length) { el.innerHTML = GL.vacio('No hay grupos configurados.'); iniciarIconos(); return; }
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) Mod.grupoId = grupos[0].id;
        if (!Mod.jornada) Mod.jornada = GL.jornadaActual().numero;
        const total = (GL.torneo() && GL.torneo().total_jornadas) || 22;
        const partidos = (await GL.partidos({ torneo_id: GL.torneo().id, jornada: Mod.jornada }))
          .filter(p => p.grupo_id === Mod.grupoId && p.estado !== 'pendiente');

        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Estadísticas de la jornada</h2>' +
            '<p>Lectura pública · Datos calculados a partir de los resultados cargados</p></div>' +
            '<div class="seccion-acciones"><button type="button" class="btn sec" data-export>' +
              icono('image', 16) + 'Exportar PNG</button></div></div>' +
          '<div class="tabs">' + grupos.map(g =>
            '<button type="button" class="tab' + (g.id === Mod.grupoId ? ' activo' : '') + '" data-grupo="' + g.id + '">' +
            'Grupo ' + GL.letraGrupo(g) + '</button>').join('') + '</div>' +
          '<div class="jornada-scroller">' + Array.from({ length: total }, (_, i) => i + 1).map(n =>
            '<button type="button" class="jornada-btn' + (n === Mod.jornada ? ' activo' : '') + '" data-jornada="' + n + '">J' + n + '</button>').join('') + '</div>' +
          '<div id="stats-export" style="padding:6px;background:var(--bg-primary);border-radius:var(--radius)">' +
            '<div id="contenido-stats"></div>' +
            '<p class="nota-pie" style="text-align:right">GOATS LATINOS · Jornada ' + Mod.jornada +
              ' · Grupo ' + GL.letraGrupo(GL.grupo(Mod.grupoId)) + ' · ' + GL.fechaLarga(new Date()) + '</p>' +
          '</div>';

        el.querySelector('#contenido-stats').innerHTML = htmlStats(partidos);
        el.querySelectorAll('[data-grupo]').forEach(b => b.addEventListener('click', () => { Mod.grupoId = b.dataset.grupo; Mod.render(el); }));
        el.querySelectorAll('[data-jornada]').forEach(b => b.addEventListener('click', () => { Mod.jornada = Number(b.dataset.jornada); Mod.render(el); }));
        el.querySelector('[data-export]').addEventListener('click', () =>
          GL.exportarPNG('stats-export', 'GOATS_Stats_J' + Mod.jornada + '_G' + GL.letraGrupo(GL.grupo(Mod.grupoId))));
      } catch (e) { console.error(e); el.innerHTML = GL.error(e.message); }
      iniciarIconos();
    }
  };

  function calcular(partidos) {
    const stats = {};
    const asegurar = id => stats[id] || (stats[id] = {
      id, pj: 0, gf: 0, gc: 0, dif: 0, vallas: 0, tiros: 0, tirosPuerta: 0, posesion: 0, pase: 0
    });
    partidos.forEach(p => {
      const r = GL.resultado(p);
      const l = asegurar(p.local_id), v = asegurar(p.visitante_id);
      l.pj++; v.pj++;
      l.gf += r.gf; l.gc += r.gc; l.dif += r.gf - r.gc;
      v.gf += r.gc; v.gc += r.gf; v.dif += r.gc - r.gf;
      l.tiros += Number(p.tiros_local) || 0; v.tiros += Number(p.tiros_visitante) || 0;
      l.tirosPuerta += Number(p.tiros_puerta_local) || 0; v.tirosPuerta += Number(p.tiros_puerta_visitante) || 0;
      l.posesion += Number(p.posesion_local) || 0; v.posesion += Number(p.posesion_visitante) || 0;
      l.pase += Number(p.pase_local) || 0; v.pase += Number(p.pase_visitante) || 0;
      // No se contabiliza la valla invicta en partidos resueltos por expulsión (regla 10).
      if (p.estado === 'jugado' && r.gc === 0 && !GL.esResolucionExpulsion(p)) l.vallas++;
      if (p.estado === 'jugado' && r.gf === 0 && !GL.esResolucionExpulsion(p)) v.vallas++;
    });
    Object.values(stats).forEach(s => {
      s.promedio = s.pj ? (s.gf / s.pj) : 0;
      s.promPos = s.pj ? Math.round(s.posesion / s.pj) : 0;
      s.promPase = s.pj ? Math.round(s.pase / s.pj) : 0;
      s.score = s.gf + s.vallas;
    });
    return Object.values(stats);
  }

  function top(lista, clave, n) {
    return lista.slice().sort((a, b) => (b[clave] || 0) - (a[clave] || 0)).slice(0, n || 3);
  }

  function fila(s, valor, extra) {
    return '<li><span class="rank">' + esc(GL.nombreJugador(s.id)) + '</span>' +
      '<span class="codigo-pais">' + esc(GL.paisJugador(s.id)) + '</span>' +
      '<span class="nombre">' + (extra || '') + '</span>' +
      '<span class="cant">' + valor + '</span></li>';
  }

  function metrica(titulo, ico, lista, clave, sufijo, extraFn) {
    return '<div class="card"><div class="card-titulo">' + icono(ico, 19) + esc(titulo) + '</div>' +
      '<ul class="lista-top">' + lista.map((s, i) =>
        '<li style="animation-delay:' + (i * .06) + 's">' +
          '<span class="rank">' + (i + 1) + '</span>' +
          '<span class="avatar-sm">' + esc(GL.iniciales(GL.nombreJugador(s.id))) + '</span>' +
          '<span class="nombre">' + esc(GL.nombreJugador(s.id)) +
            '<small class="extra"> · ' + esc(GL.paisJugador(s.id)) + '</small></span>' +
          (extraFn ? '<small class="extra">' + esc(extraFn(s)) + '</small>' : '') +
          '<span class="cant">' + (s[clave] || 0) + (sufijo || '') + '</span></li>').join('') +
      '</ul></div>';
  }

  function htmlStats(partidos) {
    if (!partidos.length) return GL.vacio('Todavía no hay resultados en esta jornada.', 'chart-no-axes-column', null);
    const s = calcular(partidos);
    const mejorPartido = partidos.slice().sort((a, b) =>
      ((Number(a.goles_local) || 0) + (Number(a.goles_visitante) || 0)) <
      ((Number(b.goles_local) || 0) + (Number(b.goles_visitante) || 0)) ? 1 : -1)[0];
    const r = GL.resultado(mejorPartido);
    return '<div class="grid tres">' +
      metrica('Más porterías rasgadas', 'zap', top(s, 'gf'), 'gf', '', x => 'prom. ' + x.promedio.toFixed(1)) +
      metrica('Más porterías en 0', 'shield', top(s, 'vallas'), 'vallas', '') +
      metrica('Menos goles recibidos', 'lock', s.slice().sort((a, b) => a.gc - b.gc).slice(0, 3), 'gc', '') +
      metrica('Mejor diferencia de gol', 'trending-up', top(s, 'dif'), 'dif', '') +
      '<div class="card"><div class="card-titulo">' + icono('star', 19) + 'Mejor partido de la jornada</div>' +
        '<div class="center" style="padding:16px 0">' +
          '<div style="font-family:Rajdhani;font-size:17px">' + esc(GL.nombreJugador(mejorPartido.local_id)) +
          ' <span class="dorado">' + r.texto + '</span> ' + esc(GL.nombreJugador(mejorPartido.visitante_id)) + '</div>' +
          '<div class="num dorado" style="font-size:38px;font-family:Rajdhani;font-weight:700;margin-top:6px">' +
            ((Number(mejorPartido.goles_local) || 0) + (Number(mejorPartido.goles_visitante) || 0)) + ' goles</div>' +
        '</div></div>' +
      metrica('Mejor jugador de la jornada', 'award', top(s, 'score'), 'score', ' pts', x => x.gf + ' goles · ' + x.vallas + ' vallas') +
      '</div>' +
      '<div class="card mt"><div class="card-titulo">' + icono('activity', 19) + 'Detalle por jugador</div>' +
        '<div class="tabla-wrap"><table class="tabla"><thead><tr><th class="izq">Jugador</th><th>PJ</th><th>GF</th><th>GC</th><th>Vallas</th><th>Pos %</th><th>Pase %</th></tr></thead><tbody>' +
        s.sort((a, b) => b.score - a.score).map((x, i) =>
          '<tr style="animation-delay:' + (i * .03) + 's"><td class="izq"><div class="jugador-celda">' +
          '<span class="avatar-sm">' + esc(GL.iniciales(GL.nombreJugador(x.id))) + '</span>' +
          esc(GL.nombreJugador(x.id)) + '</div></td><td class="num">' + x.pj + '</td><td class="num verde-txt">' + x.gf +
          '</td><td class="num rojo-txt">' + x.gc + '</td><td class="num">' + x.vallas + '</td><td class="num">' +
          x.promPos + '</td><td class="num">' + x.promPase + '</td></tr>').join('') +
        '</tbody></table></div></div>';
  }

  Modulos['stats-jornada'] = Mod;
})();
