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
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) {
          Mod.grupoId = (typeof GL.grupoInicial === 'function' ? GL.grupoInicial() : grupos[0]).id;
        }
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
      } catch (e) { console.error(e); el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'las estadísticas'), null, 'las estadísticas de jornada'); }
      iniciarIconos();
    }
  };

  function calcular(partidos) {
    const gr = EST.calcularGolesReales(partidos);
    const prom = EST.calcularPromedios(partidos);
    const vallas = EST.calcularVallasInvictas(partidos);

    // Unificar en un mapa por jugador
    const ids = new Set([
      ...gr.map(s => s.id),
      ...prom.map(s => s.id),
      ...vallas.map(s => s.id)
    ]);
    return Array.from(ids).map(id => {
      const g = gr.find(s => s.id === id) || { gf: 0, gc: 0, dif: 0, pj: 0 };
      const po = prom.find(s => s.id === id) || { promPos: 0, promPase: 0, pj: 0 };
      const v = vallas.find(s => s.id === id) || { vallas: 0 };
      const pj = Math.max(g.pj, po.pj);
      return {
        id,
        pj,
        gf: g.gf, gc: g.gc, dif: g.dif,
        vallas: v.vallas,
        promPos: po.promPos,
        promPase: po.promPase,
        promedio: pj ? g.gf / pj : 0,
        score: g.gf + v.vallas
      };
    });
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
    // Mejor partido: solo partidos realmente jugados en FC Mobile
    const soloJugados = partidos.filter(p => p.estado === 'jugado');
    const mejorPartido = soloJugados.slice().sort((a, b) => {
      const ra = GL.golesReales(a), rb = GL.golesReales(b);
      return (rb.gf + rb.gc) - (ra.gf + ra.gc);
    })[0];
    // GL.golesReales() solo devuelve {gf, gc}: el marcador visible sale de GL.resultado().
    // Si todos los partidos están resueltos administrativamente no hay "mejor partido":
    // mostramos una nota clara en vez de leer local_id de undefined.
    const marcador = mejorPartido ? GL.resultado(mejorPartido) : null;
    const golesReales = mejorPartido ? GL.golesReales(mejorPartido) : { gf: 0, gc: 0 };
    const cardMejorPartido = mejorPartido
      ? '<div class="card"><div class="card-titulo">' + icono('star', 20) + 'Mejor partido de la jornada</div>' +
          '<div class="center" style="padding:16px 0">' +
            '<div style="font-family:var(--gl-font-sans);font-size:17px">' + esc(GL.nombreJugador(mejorPartido.local_id)) +
            ' <span class="dorado">' + esc(marcador.texto) + '</span> ' + esc(GL.nombreJugador(mejorPartido.visitante_id)) + '</div>' +
            '<div class="num dorado" style="font-size:38px;font-family:var(--gl-font-sans);font-weight:700;margin-top:6px">' +
              (golesReales.gf + golesReales.gc) + ' goles</div>' +
          '</div></div>'
      : '<div class="card"><div class="card-titulo">' + icono('star', 20) + 'Mejor partido de la jornada</div>' +
          GL.vacio('Todavía no hay partidos jugados en esta jornada.', 'swords', null) + '</div>';
    return '<div class="grid tres">' +
      metrica('Más porterías rasgadas', 'zap', top(s, 'gf'), 'gf', '', x => 'prom. ' + x.promedio.toFixed(1)) +
      metrica('Más porterías en 0', 'shield', top(s, 'vallas'), 'vallas', '') +
      metrica('Menos goles recibidos', 'lock', s.slice().sort((a, b) => a.gc - b.gc).slice(0, 3), 'gc', '') +
      metrica('Mejor diferencia de gol', 'trending-up', top(s, 'dif'), 'dif', '') +
      cardMejorPartido +
      metrica('Mejor jugador de la jornada', 'award', top(s, 'score'), 'score', ' pts', x => x.gf + ' goles · ' + x.vallas + ' vallas') +
      '</div>' +
      '<div class="card mt"><div class="card-titulo">' + icono('activity', 20) + 'Detalle por jugador</div>' +
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
