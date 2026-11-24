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
    const stats = {};
    const asegurar = id => stats[id] || (stats[id] = {
      id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dif: 0,
      vallas: 0, tiros: 0, tirosPuerta: 0, posesion: 0, pase: 0,
      puntos: 0, resultados: []
    });
    const ordenados = partidos.slice().sort((a, b) =>
      (Number(a.jornada) || 0) - (Number(b.jornada) || 0) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')));

    ordenados.forEach(p => {
      const r = GL.resultado(p);
      const l = asegurar(p.local_id), v = asegurar(p.visitante_id);
      const puntosLocal = r.gf > r.gc ? 3 : r.gf === r.gc ? 1 : 0;
      const puntosVisita = r.gc > r.gf ? 3 : r.gf === r.gc ? 1 : 0;
      l.pj++; v.pj++;
      l.gf += r.gf; l.gc += r.gc; l.dif += r.gf - r.gc; l.puntos += puntosLocal;
      v.gf += r.gc; v.gc += r.gf; v.dif += r.gc - r.gf; v.puntos += puntosVisita;
      if (puntosLocal === 3) l.g++; else if (puntosLocal === 1) l.e++; else l.p++;
      if (puntosVisita === 3) v.g++; else if (puntosVisita === 1) v.e++; else v.p++;
      l.tiros += Number(p.tiros_local) || 0; v.tiros += Number(p.tiros_visitante) || 0;
      l.tirosPuerta += Number(p.tiros_puerta_local) || 0; v.tirosPuerta += Number(p.tiros_puerta_visitante) || 0;
      l.posesion += Number(p.posesion_local) || 0; v.posesion += Number(p.posesion_visitante) || 0;
      l.pase += Number(p.pase_local) || 0; v.pase += Number(p.pase_visitante) || 0;
      // Los partidos resueltos por expulsión no suman valla invicta.
      if (p.estado === 'jugado' && !GL.esResolucionExpulsion(p)) {
        if (r.gc === 0) l.vallas++;
        if (r.gf === 0) v.vallas++;
      }
      l.resultados.push(puntosLocal === 3 ? 'V' : puntosLocal === 1 ? 'E' : 'D');
      v.resultados.push(puntosVisita === 3 ? 'V' : puntosVisita === 1 ? 'E' : 'D');
    });

    Object.values(stats).forEach(s => {
      s.promPos = s.pj ? Math.round(s.posesion / s.pj) : 0;
      s.promPase = s.pj ? Math.round(s.pase / s.pj) : 0;
      s.racha = rachaActual(s.resultados);
      s.mejorRacha = mejorRacha(s.resultados);
    });
    return Object.values(stats);
  }

  function rachaActual(resultados) {
    if (!resultados.length) return { tipo: '—', texto: '—', n: 0 };
    const ultimo = resultados[resultados.length - 1];
    let n = 0;
    for (let i = resultados.length - 1; i >= 0 && resultados[i] === ultimo; i--) n++;
    return { tipo: ultimo, texto: ultimo + n, n };
  }

  function mejorRacha(resultados) {
    let mejor = 0, actual = 0;
    resultados.forEach(r => { actual = r === 'V' ? actual + 1 : 0; mejor = Math.max(mejor, actual); });
    return mejor;
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
        metrica('Top 5 goleadores', 'goal', top(lista, 'gf', 5), 'gf', '', s => s.pj + ' partidos') +
        metrica('Top 5 vallas invictas', 'shield', top(lista, 'vallas', 5), 'vallas', '') +
        metrica('Top 5 victorias', 'trophy', top(lista, 'g', 5), 'g', '', s => s.pj + ' partidos') +
        metrica('Top 5 mejor diferencia', 'trending-up', top(lista, 'dif', 5), 'dif', '') +
        metrica('Top 5 posesión', 'pie-chart', top(lista, 'promPos', 5), 'promPos', '%') +
        rachasHtml(lista) +
      '</div>' +
      '<div class="card mt"><div class="card-titulo">' + icono('chart-no-axes-column', 19) + 'Goles por jugador</div>' +
        '<div class="chart-caja"><canvas id="grafico-global" aria-label="Gráfico de goles por jugador" role="img"></canvas></div>' +
      '</div>' +
      '<div class="mt">' + h2hHtml(partidos, grupoId) + '</div>' +
      '<div class="card mt"><div class="card-titulo">' + icono('table-2', 19) + 'Resumen completo</div>' +
        '<div class="tabla-wrap"><table class="tabla"><thead><tr><th class="izq">Jugador</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Dif</th><th>Vallas</th><th>Pos %</th><th>Pase %</th><th>Pts</th></tr></thead><tbody>' +
        lista.slice().sort((a, b) => b.puntos - a.puntos || b.dif - a.dif).map((s, i) =>
          '<tr style="animation-delay:' + (i * .03) + 's"><td class="izq"><div class="jugador-celda">' + avatar(s.id) +
          esc(GL.nombreJugador(s.id)) + '</div></td><td class="num">' + s.pj + '</td><td class="num">' + s.g +
          '</td><td class="num">' + s.e + '</td><td class="num">' + s.p + '</td><td class="num verde-txt">' + s.gf +
          '</td><td class="num rojo-txt">' + s.gc + '</td><td class="num">' + GL.signo(s.dif) +
          '</td><td class="num">' + s.vallas + '</td><td class="num">' + s.promPos + '</td><td class="num">' + s.promPase +
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
