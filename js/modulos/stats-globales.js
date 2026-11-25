/* =====================================================================
   MÓDULO — Estadísticas globales del torneo
   Top 5, rachas, head-to-head, gráfico Chart.js y exportación PNG.
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Estadísticas globales',
    grupoId: null,
    _chart: null,

    async render(el) {
      el.innerHTML = GL.skeleton(8);
      try {
        await GL.cargarContexto(true);
        const grupos = GL.grupos();
        if (!GL.torneo()) { el.innerHTML = GL.vacio('No hay torneo activo todavía.', 'trophy', null); iniciarIconos(); return; }
        if (!grupos.length) { el.innerHTML = GL.vacio('No hay grupos configurados.', 'inbox', null); iniciarIconos(); return; }
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) Mod.grupoId = grupos[0].id;

        const todos = await GL.partidos({ torneo_id: GL.torneo().id });
        const jugados = todos.filter(p => p.estado !== 'pendiente');
        const allegado = jugados.filter(p => p.grupo_id === Mod.grupoId ||
          GL.ctx.miembros.some(m => m.grupo_id === Mod.grupoId && (m.jugador_id === p.local_id || m.jugador_id === p.visitante_id)));
        const stats = calcular(allegado);
        const idsGrupo = new Set((GL.ctx.miembros || []).filter(m => m.grupo_id === Mod.grupoId).map(m => m.jugador_id));
        const lista = stats.filter(s => idsGrupo.has(s.id));

        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Estadísticas globales</h2>' +
            '<p>Temporada completa · ' + jugados.length + ' resultados cargados · Lectura pública</p></div>' +
            '<div class="seccion-acciones"><button type="button" class="btn sec" data-export>' +
              icono('image', 16) + 'Exportar PNG</button></div></div>' +
          '<div class="tabs">' + grupos.map(g =>
            '<button type="button" class="tab' + (g.id === Mod.grupoId ? ' activo' : '') + '" data-grupo="' + g.id + '">' +
            'Grupo ' + GL.letraGrupo(g) + '</button>').join('') + '</div>' +
          '<div id="stats-globales-export" style="padding:6px;background:var(--bg-primary);border-radius:var(--radius)">' +
            '<div id="contenido-globales"></div>' +
            '<p class="nota-pie" style="text-align:right">GOATS LATINOS · Grupo ' + GL.letraGrupo(GL.grupo(Mod.grupoId)) +
              ' · ' + GL.fechaLarga(new Date()) + '</p>' +
          '</div>';

        const cont = el.querySelector('#contenido-globales');
        cont.innerHTML = htmlGlobales(lista, allegado, Mod.grupoId);
        pintarGrafico(lista);

        el.querySelectorAll('[data-grupo]').forEach(b => b.addEventListener('click', () => {
          if (Mod._chart) { Mod._chart.destroy(); Mod._chart = null; }
          Mod.grupoId = b.dataset.grupo;
          Mod.render(el);
        }));
        el.querySelector('[data-export]').addEventListener('click', () =>
          GL.exportarPNG('stats-globales-export',
            'GOATS_Estadisticas_Globales_G' + GL.letraGrupo(GL.grupo(Mod.grupoId))));
      } catch (e) {
        console.error(e);
        el.innerHTML = GL.error(e.message);
      }
      iniciarIconos();
    }
  };

  function calcular(partidos) {
    const cl = EST.calcularClasificacion(partidos);
    const gr = EST.calcularGolesReales(partidos);
    const prom = EST.calcularPromedios(partidos);
    const vallas = EST.calcularVallasInvictas(partidos);

    const ids = new Set([...cl.map(s => s.id), ...gr.map(s => s.id)]);
    return Array.from(ids).map(id => {
      const c = cl.find(s => s.id === id) || { pj: 0, pg: 0, pe: 0, pp: 0, pts: 0, gf: 0, gc: 0, dif: 0, resultados: [] };
      const g = gr.find(s => s.id === id) || { gf: 0, gc: 0, dif: 0 };
      const po = prom.find(s => s.id === id) || { promPos: 0, promPase: 0, posN: 0, paseN: 0 };
      const va = vallas.find(s => s.id === id) || { vallas: 0 };
      const rachaData = EST.calcularRachas(c.resultados);
      return {
        id,
        pj: c.pj, g: c.pg, e: c.pe, p: c.pp, puntos: c.pts,
        // gf/gc para ranking deportivo = goles reales (FC Mobile)
        gf: g.gf, gc: g.gc, dif: g.dif,
        // Denominador de rendimiento: partidos realmente jugados, no clasificación.
        pjReal: g.pj || 0,
        promGoles: g.pj ? Math.round((g.gf / g.pj) * 10) / 10 : 0,
        vallas: va.vallas,
        promPos: po.promPos, promPase: po.promPase,
        posN: po.posN || 0, paseN: po.paseN || 0,
        resultados: c.resultados,
        racha: rachaData.actual,
        mejorRacha: rachaData.mejorVictorias,
        n: rachaData.actual.n
      };
    });
  }

  function top(lista, clave, n, ascendente) {
    return lista.slice().sort((a, b) => ascendente
      ? (a[clave] || 0) - (b[clave] || 0)
      : (b[clave] || 0) - (a[clave] || 0)).slice(0, n || 5);
  }

  function avatar(id) {
    return GL.avatarHTML(GL.jugador(id) || {}, 'avatar-sm');
  }

  function metrica(titulo, ico, lista, clave, sufijo, extraFn) {
    return '<div class="card"><div class="card-titulo">' + icono(ico, 19) + esc(titulo) + '</div>' +
      '<ul class="lista-top">' + (lista.length ? lista.map((s, i) =>
        '<li style="animation-delay:' + (i * .05) + 's">' +
          '<span class="rank">' + (i + 1) + '</span>' + avatar(s.id) +
          '<span class="nombre">' + esc(GL.nombreJugador(s.id)) +
            '<small class="extra"> · ' + esc(GL.paisJugador(s.id)) + '</small></span>' +
          (extraFn ? '<small class="extra">' + esc(extraFn(s)) + '</small>' : '') +
          '<span class="cant">' + (s[clave] || 0) + (sufijo || '') + '</span></li>').join('')
        : '<li class="vacio-mensaje">Sin datos suficientes</li>') + '</ul></div>';
  }

  function rachasHtml(lista) {
    return '<div class="card"><div class="card-titulo">' + icono('flame', 19) + 'Rachas actuales</div>' +
      '<ul class="lista-top">' + (lista.length ? lista.slice().sort((a, b) => b.n - a.n).map((s, i) =>
        '<li style="animation-delay:' + (i * .04) + 's">' +
          '<span class="rank">' + (i + 1) + '</span>' + avatar(s.id) +
          '<span class="nombre">' + esc(GL.nombreJugador(s.id)) +
            '<span class="racha-item"><span class="racha-puntos">' + s.resultados.slice(-5).map(r =>
              '<span class="' + (r === 'V' ? 'v' : r === 'E' ? 'e' : 'd') + '" title="' + r + '"></span>').join('') +
            '</span></span></span>' +
          '<span class="cant">' + esc(s.racha.texto) + '</span></li>').join('')
        : '<li class="vacio-mensaje">Sin resultados cargados</li>') + '</ul></div>';
  }

  function h2hHtml(partidos, grupoId) {
    const ids = (GL.ctx.miembros || []).filter(m => m.grupo_id === grupoId).map(m => m.jugador_id)
      .filter(id => GL.jugador(id));
    if (!ids.length) return GL.vacio('No hay jugadores asignados a este grupo.', 'users', null);
    const caras = {};
    partidos.forEach(p => {
      if (!ids.includes(p.local_id) || !ids.includes(p.visitante_id)) return;
      const clave = [p.local_id, p.visitante_id].sort().join('|');
      if (!caras[clave]) caras[clave] = { a: clave.split('|')[0], b: clave.split('|')[1], g: 0, e: 0, p: 0, gf: 0, gc: 0 };
      const r = GL.resultado(p);
      const localEsA = p.local_id === caras[clave].a;
      const a = localEsA ? r.gf : r.gc, b = localEsA ? r.gc : r.gf;
      caras[clave].gf += a; caras[clave].gc += b;
      if (a > b) caras[clave].g++; else if (a === b) caras[clave].e++; else caras[clave].p++;
    });
    const filas = ids.map(id => {
      const celdas = ids.map(other => {
        if (id === other) return '<td class="fila-jugador">—</td>';
        const clave = [id, other].sort().join('|');
        const c = caras[clave];
        if (!c) return '<td class="muted">—</td>';
        const a = c.a === id, gf = a ? c.gf : c.gc, gc = a ? c.gc : c.gf;
        const g = a ? c.g : c.p, p = a ? c.p : c.g;
        const cls = g > p ? 'gana' : p > g ? 'pierde' : '';
        return '<td class="' + cls + '" title="' + esc(GL.nombreJugador(id) + ' vs ' + GL.nombreJugador(other)) + '">' +
          gf + ':' + gc + '<small class="extra"> ' + g + '-' + c.e + '-' + p + '</small></td>';
      }).join('');
      return '<tr><td class="izq fila-jugador">' + esc(GL.nombreJugador(id)) + '</td>' + celdas + '</tr>';
    }).join('');
    return '<div class="card"><div class="card-titulo">' + icono('git-compare-arrows', 19) +
      'Head to head · Grupo ' + GL.letraGrupo(GL.grupo(grupoId)) + '</div>' +
      '<div class="tabla-wrap"><table class="tabla h2h-tabla"><thead><tr><th class="izq">Jugador</th>' +
      ids.map(id => '<th title="' + esc(GL.nombreJugador(id)) + '">' + esc(GL.iniciales(GL.nombreJugador(id))) + '</th>').join('') +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<p class="nota-pie mt">Cada casilla muestra goles a favor:en contra y partidos ganados-empatados-perdidos desde la perspectiva del jugador de la fila.</p></div>';
  }

  function htmlGlobales(lista, partidos, grupoId) {
    if (!lista.length || !partidos.length) {
      return GL.vacio('Todavía no hay resultados cargados en este grupo.', 'chart-no-axes-column', null);
    }
    return '<div class="grid tres">' +
        metrica('Top 5 goleadores', 'goal', top(lista, 'gf', 5), 'gf', '',
          s => s.promGoles.toFixed(1) + ' por partido real · ' + s.pjReal + ' PJ reales') +
        metrica('Top 5 vallas invictas', 'shield', top(lista, 'vallas', 5), 'vallas', '') +
        metrica('Top 5 victorias', 'trophy', top(lista, 'g', 5), 'g', '', s => s.pj + ' partidos') +
        metrica('Top 5 mejor diferencia', 'trending-up', top(lista, 'dif', 5), 'dif', '') +
        metrica('Top 5 posesión', 'pie-chart', top(lista, 'promPos', 5), 'promPos', '%',
          s => s.posN + ' PJ con datos') +
        metrica('Top 5 precisión de pase', 'route', top(lista, 'promPase', 5), 'promPase', '%',
          s => s.paseN + ' PJ con datos') +
        rachasHtml(lista) +
      '</div>' +
      '<div class="card mt"><div class="card-titulo">' + icono('chart-no-axes-column', 19) + 'Goles por jugador</div>' +
        '<div class="chart-caja"><canvas id="grafico-global" aria-label="Gráfico de goles por jugador" role="img"></canvas></div>' +
      '</div>' +
      '<div class="mt">' + h2hHtml(partidos, grupoId) + '</div>' +
      '<div class="card mt"><div class="card-titulo">' + icono('table-2', 19) + 'Resumen completo</div>' +
        '<div class="tabla-wrap"><table class="tabla"><thead><tr><th class="izq">Jugador</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Dif</th><th>Vallas</th><th title="Sobre partidos con posesión registrada">Pos %</th><th title="Sobre partidos con precisión de pase registrada">Pase %</th><th>Pts</th></tr></thead><tbody>' +
        lista.slice().sort((a, b) => b.puntos - a.puntos || b.dif - a.dif).map((s, i) =>
          '<tr style="animation-delay:' + (i * .03) + 's"><td class="izq"><div class="jugador-celda">' + avatar(s.id) +
          esc(GL.nombreJugador(s.id)) + '</div></td><td class="num">' + s.pj + '</td><td class="num">' + s.g +
          '</td><td class="num">' + s.e + '</td><td class="num">' + s.p + '</td><td class="num verde-txt">' + s.gf +
          '</td><td class="num rojo-txt">' + s.gc + '</td><td class="num">' + GL.signo(s.dif) +
          '</td><td class="num">' + s.vallas +
          '</td><td class="num">' + s.promPos + '<small class="extra">' + s.posN + ' PJ con datos</small>' +
          '</td><td class="num">' + s.promPase + '<small class="extra">' + s.paseN + ' PJ con datos</small>' +
          '</td><td class="num dorado">' + s.puntos + '</td></tr>').join('') +
        '</tbody></table></div></div>';
  }

  function pintarGrafico(lista) {
    const canvas = document.getElementById('grafico-global');
    if (!canvas || typeof window.Chart !== 'function') {
      if (canvas) canvas.parentElement.innerHTML = '<p class="vacio-mensaje">El gráfico no está disponible.</p>';
      return;
    }
    const datos = top(lista, 'gf', 8);
    if (Mod._chart) { Mod._chart.destroy(); Mod._chart = null; }
    const estilo = getComputedStyle(document.documentElement);
    const oro = (estilo.getPropertyValue('--accent-gold') || '#f5c518').trim();
    Mod._chart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: datos.map(s => GL.nombreJugador(s.id)),
        datasets: [{
          label: 'Goles a favor',
          data: datos.map(s => s.gf),
          backgroundColor: datos.map((s, i) => i === 0 ? oro : 'rgba(245,197,24,0.45)'),
          borderColor: oro,
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 46
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y + ' goles' } }
        },
        scales: {
          x: {
            ticks: { color: '#9ca3af', font: { family: 'Inter', size: 11 }, maxRotation: 45, minRotation: 0 },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#9ca3af', font: { family: 'Inter', size: 11 }, precision: 0 },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  }

  Modulos['stats-globales'] = Mod;
})();
