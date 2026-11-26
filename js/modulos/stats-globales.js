/* =====================================================================
   MÓDULO — Estadísticas Globales
   Gestión completa de gráficos Chart.js: destrucción, sincronización,
   redimensionado, estados vacíos y alternativa textual accesible.
   ===================================================================== */
(function () {

  /* ── Registro de instancias Chart.js activas ── */
  const _charts = {};

  function destruirGrafico(clave) {
    if (_charts[clave]) {
      try { _charts[clave].destroy(); } catch (e) {}
      delete _charts[clave];
    }
  }

  function destruirTodos() {
    Object.keys(_charts).forEach(destruirGrafico);
  }

  /* ── Cargar Chart.js bajo demanda ── */
  async function cargarChartJS() {
    if (typeof Chart !== 'undefined') return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('No se pudo cargar Chart.js. Verificá tu conexión.'));
      document.head.appendChild(s);
    });
  }

  /* ── Crear canvas limpio (evita duplicados) ── */
  function crearCanvas(contenedor, clave) {
    destruirGrafico(clave);
    const viejo = contenedor.querySelector('canvas');
    if (viejo) viejo.remove();
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Gráfico de estadísticas — ver tabla de datos debajo');
    contenedor.appendChild(canvas);
    return canvas;
  }

  /* ── Opciones base Chart.js ── */
  const OPTS_BASE = {
    responsive    : true,
    maintainAspectRatio: false,
    animation     : { duration: 500 },
    plugins: {
      legend: {
        position: 'bottom',
        labels  : { color: GL.tema.texto2, font: { size: 12, family: GL.tema.fuente }, padding: 12, boxWidth: 12 }
      },
      tooltip: {
        backgroundColor: GL.tema.superficie,
        borderColor    : GL.tema.bordeFuerte,
        borderWidth    : 1,
        titleColor     : GL.tema.advertencia,
        bodyColor      : GL.tema.texto,
        padding        : 10,
        callbacks       : {}
      }
    },
    scales: {}
  };

  function escalesOscuras(eje) {
    return {
      grid  : { color: GL.tema.borde },
      ticks : { color: GL.tema.texto2, font: { size: 12, family: GL.tema.fuente } },
      ...eje
    };
  }

  /* ── Estado vacío en un contenedor ── */
  function mostrarVacio(contenedor, msg) {
    contenedor.innerHTML =
      '<div class="sg-vacio" role="status" aria-live="polite">' +
        icono('bar-chart-2', 32) +
        '<p>' + esc(msg || 'Sin datos suficientes para mostrar el gráfico.') + '</p>' +
      '</div>';
    iniciarIconos();
  }

  /* ================================================================
     GRÁFICO 1 — Puntos por jugador (barras horizontales)
     Muestra quién lidera la tabla, con color por zona de clasificación.
     ================================================================ */
  async function graficoPuntos(contenedor, datos) {
    if (!datos.length) { mostrarVacio(contenedor, 'No hay partidos jugados aún.'); return; }

    const top = datos.slice(0, 15);
    const total = datos.length;
    const colores = top.map((_, i) => {
      const pos = i + 1;
      if (pos <= 6) return GL.tema.exito;
      if (pos > total - 3) return GL.tema.marca;
      return GL.tema.advertencia;
    });
    const labels = top.map(d => {
      const j = GL.jugador(d.jugador_id);
      return j ? j.nombre_usuario : '—';
    });
    const ptsDatos = top.map(d => d.pts || 0);
    const pgDatos  = top.map(d => d.pg  || 0);
    const peDatos  = top.map(d => d.pe  || 0);
    const ppDatos  = top.map(d => d.pp  || 0);

    const canvas = crearCanvas(contenedor, 'puntos');

    // Tabla textual accesible debajo del canvas
    _agregarTablaAccesible(contenedor, ['Jugador','Pts','G','E','P'],
      top.map((d, i) => [labels[i], ptsDatos[i], pgDatos[i], peDatos[i], ppDatos[i]]));

    _charts['puntos'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Victorias', data: pgDatos, backgroundColor: GL.tema.exito, stack: 'partidos', borderRadius: 2 },
          { label: 'Empates',   data: peDatos, backgroundColor: GL.tema.advertencia, stack: 'partidos', borderRadius: 2 },
          { label: 'Derrotas',  data: ppDatos, backgroundColor: GL.tema.marca, stack: 'partidos', borderRadius: 2 },
          { label: 'Puntos',    data: ptsDatos, backgroundColor: colores, borderRadius: 4, type: 'bar', yAxisID: 'yPts' }
        ]
      },
      options: {
        ...OPTS_BASE,
        indexAxis: 'y',
        plugins: {
          ...OPTS_BASE.plugins,
          tooltip: {
            ...OPTS_BASE.plugins.tooltip,
            callbacks: {
              label: ctx => {
                const d = top[ctx.dataIndex];
                if (ctx.dataset.label === 'Puntos') return ' Puntos: ' + (d.pts || 0);
                return ' ' + ctx.dataset.label + ': ' + ctx.raw;
              },
              afterBody: ctx => {
                const d = top[ctx[0].dataIndex];
                return ['GF: ' + (d.gf || 0) + '  GC: ' + (d.gc || 0) + '  Dif: ' + GL.signo(d.dif)];
              }
            }
          }
        },
        scales: {
          x : escalesOscuras({ stacked: true }),
          y : escalesOscuras({ stacked: true }),
          yPts: { display: false, beginAtZero: true }
        }
      }
    });
  }

  /* ================================================================
     GRÁFICO 2 — Goles a favor vs en contra (barras agrupadas)
     Permite comparar ataque y defensa de cada jugador.
     ================================================================ */
  async function graficoGoles(contenedor, datos) {
    if (!datos.length) { mostrarVacio(contenedor, 'No hay goles registrados.'); return; }

    const top = datos.slice().sort((a, b) => (b.gf || 0) - (a.gf || 0)).slice(0, 12);
    const labels = top.map(d => { const j = GL.jugador(d.jugador_id); return j ? j.nombre_usuario : '—'; });
    const gfDatos = top.map(d => d.gf || 0);
    const gcDatos = top.map(d => d.gc || 0);
    const difDatos = top.map(d => (d.gf || 0) - (d.gc || 0));

    const canvas = crearCanvas(contenedor, 'goles');

    _agregarTablaAccesible(contenedor, ['Jugador','GF','GC','Dif'],
      top.map((d, i) => [labels[i], gfDatos[i], gcDatos[i], difDatos[i]]));

    _charts['goles'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Goles a favor',  data: gfDatos,  backgroundColor: GL.tema.exito, borderRadius: 4 },
          { label: 'Goles en contra',data: gcDatos,  backgroundColor: GL.tema.marca, borderRadius: 4 },
          { label: 'Diferencia',     data: difDatos, type: 'line', borderColor: GL.tema.advertencia,
            backgroundColor: GL.tema.alfa(GL.tema.advertencia, 0.12), pointBackgroundColor: GL.tema.advertencia,
            pointRadius: 4, tension: 0.3, fill: true, yAxisID: 'yDif' }
        ]
      },
      options: {
        ...OPTS_BASE,
        plugins: {
          ...OPTS_BASE.plugins,
          tooltip: {
            ...OPTS_BASE.plugins.tooltip,
            callbacks: {
              label: ctx => {
                const tags = { 'Goles a favor': 'GF', 'Goles en contra': 'GC', 'Diferencia': 'Dif' };
                return ' ' + (tags[ctx.dataset.label] || ctx.dataset.label) + ': ' + (ctx.raw >= 0 ? '+' + ctx.raw : ctx.raw);
              }
            }
          }
        },
        scales: {
          x   : escalesOscuras({}),
          y   : escalesOscuras({ beginAtZero: true }),
          yDif: { display: false }
        }
      }
    });
  }

  /* ================================================================
     GRÁFICO 3 — Distribución de resultados (línea de evolución)
     Muestra el promedio de victorias/empates/derrotas del torneo.
     ================================================================ */
  async function graficoDistribucion(contenedor, datos) {
    const total = datos.length;
    if (!total) { mostrarVacio(contenedor, 'No hay partidos jugados.'); return; }

    const totalPJ = datos.reduce((s, d) => s + (d.pj || 0), 0);
    const totalPG = datos.reduce((s, d) => s + (d.pg || 0), 0);
    const totalPE = datos.reduce((s, d) => s + (d.pe || 0), 0);
    const totalPP = datos.reduce((s, d) => s + (d.pp || 0), 0);
    const totalGF = datos.reduce((s, d) => s + (d.gf || 0), 0);
    const totalGC = datos.reduce((s, d) => s + (d.gc || 0), 0);

    const pct = v => totalPJ > 0 ? Math.round((v / totalPJ) * 100) : 0;

    const canvas = crearCanvas(contenedor, 'dist');

    _agregarTablaAccesible(contenedor,
      ['Resultado','Partidos','%'],
      [
        ['Victorias', totalPG, pct(totalPG) + '%'],
        ['Empates',   totalPE, pct(totalPE) + '%'],
        ['Derrotas',  totalPP, pct(totalPP) + '%'],
        ['GF total',  totalGF, '—'],
        ['GC total',  totalGC, '—'],
        ['Prom. GF/partido', totalPJ > 0 ? (totalGF / totalPJ).toFixed(1) : 0, '—'],
      ]
    );

    _charts['dist'] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels  : ['Victorias', 'Empates', 'Derrotas'],
        datasets: [{
          data            : [totalPG, totalPE, totalPP],
          backgroundColor : [GL.tema.exito, GL.tema.advertencia, GL.tema.marca],
          borderColor     : GL.tema.bg,
          borderWidth     : 3,
          hoverOffset     : 8
        }]
      },
      options: {
        ...OPTS_BASE,
        cutout : '65%',
        plugins : {
          ...OPTS_BASE.plugins,
          tooltip: {
            ...OPTS_BASE.plugins.tooltip,
            callbacks: {
              label: ctx => {
                const val = ctx.raw;
                const pctVal = pct(val);
                return ' ' + ctx.label + ': ' + val + ' (' + pctVal + '%)';
              },
              afterLabel: ctx => {
                if (ctx.label === 'Victorias') return '  Prom GF: ' + (totalPJ > 0 ? (totalGF / totalPJ).toFixed(1) : 0);
                return '';
              }
            }
          }
        }
      }
    });

    // Texto central del doughnut con promedio
    const promPts = totalPJ > 0
      ? (datos.reduce((s, d) => s + (d.pts || 0), 0) / total).toFixed(1)
      : '—';
    const info = document.createElement('div');
    info.className = 'sg-doughnut-centro';
    info.innerHTML = '<span class="sg-num">' + promPts + '</span><span class="sg-lbl">pts/jugador</span>';
    contenedor.style.position = 'relative';
    contenedor.appendChild(info);
  }

  /* ================================================================
     GRÁFICO 4 — Racha de victorias (top 8 jugadores)
     Muestra la efectividad relativa: victorias / partidos jugados.
     ================================================================ */
  async function graficoEfectividad(contenedor, datos) {
    if (!datos.length) { mostrarVacio(contenedor, 'Sin datos de efectividad.'); return; }

    const conPartidos = datos.filter(d => (d.pj || 0) >= 2);
    if (!conPartidos.length) {
      mostrarVacio(contenedor, 'Se necesitan al menos 2 partidos por jugador para calcular efectividad.');
      return;
    }

    const conEfect = conPartidos.map(d => ({
      ...d,
      efectividad: ((d.pg || 0) / (d.pj || 1)) * 100,
      puntosMaxi : ((d.pj || 0) * 3)
    })).sort((a, b) => b.efectividad - a.efectividad).slice(0, 10);

    const labels    = conEfect.map(d => { const j = GL.jugador(d.jugador_id); return j ? j.nombre_usuario : '—'; });
    const efectDatos = conEfect.map(d => Math.round(d.efectividad));
    const ptsPct    = conEfect.map(d => d.puntosMaxi > 0 ? Math.round((d.pts / d.puntosMaxi) * 100) : 0);

    const canvas = crearCanvas(contenedor, 'efectividad');

    _agregarTablaAccesible(contenedor, ['Jugador','% Victorias','% Pts máx','PJ'],
      conEfect.map((d, i) => [labels[i], efectDatos[i] + '%', ptsPct[i] + '%', d.pj]));

    _charts['efectividad'] = new Chart(canvas, {
      type: 'radar',
      data: {
        labels  : labels,
        datasets: [
          {
            label          : '% Victorias',
            data           : efectDatos,
            borderColor    : GL.tema.exito,
            backgroundColor: GL.tema.alfa(GL.tema.exito, 0.15),
            pointBackgroundColor: GL.tema.exito,
            pointRadius    : 4,
            tension        : 0.2
          },
          {
            label          : '% Puntos máx',
            data           : ptsPct,
            borderColor    : GL.tema.advertencia,
            backgroundColor: GL.tema.alfa(GL.tema.advertencia, 0.1),
            pointBackgroundColor: GL.tema.advertencia,
            pointRadius    : 4,
            tension        : 0.2
          }
        ]
      },
      options: {
        ...OPTS_BASE,
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { color: GL.tema.texto3, font: { size: 12 }, stepSize: 25 },
            grid : { color: GL.tema.borde },
            pointLabels: { color: GL.tema.texto2, font: { size: 12, family: GL.tema.fuente } },
            angleLines  : { color: GL.tema.borde }
          }
        }
      }
    });
  }

  /* ── Tabla accesible debajo del gráfico ── */
  function _agregarTablaAccesible(contenedor, cabeceras, filas) {
    const wrap = document.createElement('div');
    wrap.className = 'sg-tabla-accesible';
    wrap.setAttribute('aria-label', 'Datos del gráfico en formato tabla');
    const cabHtml = cabeceras.map(c => '<th scope="col">' + esc(String(c)) + '</th>').join('');
    const filasHtml = filas.map(f =>
      '<tr>' + f.map((v, i) => i === 0 ? '<th scope="row">' + esc(String(v)) + '</th>' : '<td>' + esc(String(v)) + '</td>').join('') + '</tr>'
    ).join('');
    wrap.innerHTML = '<table><thead><tr>' + cabHtml + '</tr></thead><tbody>' + filasHtml + '</tbody></table>';
    contenedor.appendChild(wrap);
  }

  /* ================================================================
     MÓDULO PRINCIPAL
     ================================================================ */
  const Mod = {
    titulo   : 'Estadísticas Globales',
    grupoId  : null,
    _observer: null,

    async render(el) {
      destruirTodos();
      el.innerHTML = GL.skeleton(5);

      try {
        await GL.cargarContexto(true);
        await cargarChartJS();

        if (!GL.torneo()) {
          el.innerHTML = GL.vacio('No hay torneo activo.', 'bar-chart-2', null);
          iniciarIconos(); return;
        }

        const grupos = GL.grupos();
        if (!grupos.length) {
          el.innerHTML = GL.vacio('No hay grupos configurados.', 'bar-chart-2', null);
          iniciarIconos(); return;
        }

        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) {
          Mod.grupoId = (typeof GL.grupoInicial === 'function' ? GL.grupoInicial() : grupos[0]).id;
        }

        el.innerHTML = _htmlEsqueleto(grupos, Mod.grupoId);
        iniciarIconos();

        el.querySelectorAll('[data-grupo-sg]').forEach(btn => {
          btn.addEventListener('click', () => {
            if (btn.dataset.grupoSg === Mod.grupoId) return;
            Mod.grupoId = btn.dataset.grupoSg;
            el.querySelectorAll('[data-grupo-sg]').forEach(b =>
              b.classList.toggle('activo', b.dataset.grupoSg === Mod.grupoId));
            destruirTodos();
            _renderGraficos(el, Mod.grupoId);
          });
        });

        await _renderGraficos(el, Mod.grupoId);

        // Redimensionar al cambiar tamaño de ventana
        if (Mod._observer) Mod._observer.disconnect();
        Mod._observer = new ResizeObserver(() => {
          Object.values(_charts).forEach(c => { try { c.resize(); } catch (e) {} });
        });
        Mod._observer.observe(el);

      } catch (e) {
        console.error(e);
       el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'las estadísticas'), null, 'las estadísticas globales');
        iniciarIconos();
      }
    },

    destruir() {
      destruirTodos();
      if (Mod._observer) { Mod._observer.disconnect(); Mod._observer = null; }
    }
  };

  /* ── Render de los 4 gráficos para un grupo ── */
  async function _renderGraficos(el, grupoId) {
    const datos = _datosClasificacion(grupoId);

    if (!datos.length) {
      const grid = el.querySelector('.sg-grid');
      if (grid) {
        grid.innerHTML =
          '<div class="sg-vacio-grande" style="grid-column:1/-1" role="status">' +
            icono('bar-chart-2', 32) +
            '<h3>Sin datos para este grupo</h3>' +
            '<p>El administrador debe cargar resultados de al menos una jornada.</p>' +
          '</div>';
        iniciarIconos();
      }
      return;
    }

    const kpis = _calcularKPIs(datos, grupoId);
    _pintarKPIs(el, kpis);

    const contenedores = {
      puntos     : el.querySelector('[data-graf="puntos"]'),
      goles      : el.querySelector('[data-graf="goles"]'),
      dist       : el.querySelector('[data-graf="dist"]'),
      efectividad: el.querySelector('[data-graf="efectividad"]')
    };

    await Promise.allSettled([
      contenedores.puntos      && graficoPuntos(contenedores.puntos, datos),
      contenedores.goles       && graficoGoles(contenedores.goles, datos),
      contenedores.dist        && graficoDistribucion(contenedores.dist, datos),
      contenedores.efectividad && graficoEfectividad(contenedores.efectividad, datos)
    ]);
  }

  /* ── Datos de clasificación filtrados por grupo ── */
  function _datosClasificacion(grupoId) {
    const clasificacion    = GL.clasificacion(grupoId) || [];
    const jugadoresGrupo   = new Set(
      (GL.ctx.miembros || []).filter(m => m.grupo_id === grupoId).map(m => m.jugador_id)
    );
    return clasificacion.filter(f => jugadoresGrupo.has(f.jugador_id));
  }

  /* ── KPIs globales del grupo ── */
  function _calcularKPIs(datos, grupoId) {
    const totalPJ   = datos.reduce((s, d) => s + (d.pj || 0), 0);
    const totalGF   = datos.reduce((s, d) => s + (d.gf || 0), 0);
    const totalGC   = datos.reduce((s, d) => s + (d.gc || 0), 0);
    const lider     = datos[0];
    const liderJ    = lider ? GL.jugador(lider.jugador_id) : null;
    const maxGF     = datos.slice().sort((a, b) => (b.gf || 0) - (a.gf || 0))[0];
    const maxGFJ    = maxGF ? GL.jugador(maxGF.jugador_id) : null;
    const promGol   = totalPJ > 0 ? (totalGF / (totalPJ / 2)).toFixed(2) : '—';
    const jugConJuegos = datos.filter(d => (d.pj || 0) > 0).length;
    const sinJugar  = datos.length - jugConJuegos;

    return { totalPJ: Math.floor(totalPJ / 2), totalGF, totalGC, promGol, lider, liderJ, maxGF, maxGFJ, sinJugar };
  }

  /* ── Pintar tarjetas KPI ── */
  function _pintarKPIs(el, k) {
    const wrap = el.querySelector('.sg-kpis');
    if (!wrap) return;
    const kpi = (ico, lbl, val, sub, color) =>
      '<div class="sg-kpi">' +
        '<div class="sg-kpi-ico" style="color:' + (color || GL.tema.marcaTexto) + '">' + icono(ico, 24) + '</div>' +
        '<div class="sg-kpi-val">' + esc(String(val)) + '</div>' +
        '<div class="sg-kpi-lbl">' + esc(lbl) + '</div>' +
        (sub ? '<div class="sg-kpi-sub">' + esc(sub) + '</div>' : '') +
      '</div>';

    wrap.innerHTML =
      kpi('calendar-check', 'Partidos jugados',   k.totalPJ,  '', GL.tema.info) +
      kpi('target',         'Goles totales (GF)',  k.totalGF,  'Prom: ' + k.promGol + ' por partido', GL.tema.exito) +
      kpi('shield',         'Goles en contra (GC)',k.totalGC,  '', GL.tema.marca) +
      kpi('trophy',         'Líder',               k.liderJ ? k.liderJ.nombre_usuario : '—',
          k.lider ? k.lider.pts + ' pts' : '', GL.tema.advertencia) +
      kpi('flame',          'Más goles a favor',   k.maxGFJ ? k.maxGFJ.nombre_usuario : '—',
          k.maxGF ? k.maxGF.gf + ' GF' : '', GL.tema.marcaTexto) +
      (k.sinJugar > 0
        ? kpi('alert-triangle', 'Sin partidos aún', k.sinJugar + ' jugadores', 'Pendiente de programación', GL.tema.marca)
        : kpi('check-circle',   'Participación', '100%', 'Todos han jugado', GL.tema.exito));

    iniciarIconos();
  }

  /* ── HTML del esqueleto de la vista ── */
  function _htmlEsqueleto(grupos, grupoIdActivo) {
    const tabsGrupos = grupos.map(g =>
      '<button type="button" class="tab' + (g.id === grupoIdActivo ? ' activo' : '') + '" data-grupo-sg="' + g.id + '">' +
      'Grupo ' + GL.letraGrupo(g) + '</button>'
    ).join('');

    return `
<div class="seccion-head">
  <div class="seccion-titulo">
    <h2>Estadísticas Globales</h2>
    <p class="seccion-desc muted">Resumen de rendimiento por grupo · Gráficos con datos reales</p>
  </div>
</div>
<div class="tabs sg-tabs-grupo">${tabsGrupos}</div>
<div class="sg-kpis" role="region" aria-label="Indicadores clave del grupo"></div>
<div class="sg-grid">
  <div class="sg-bloque sg-bloque-ancho" aria-label="Gráfico de puntos y partidos">
    <div class="sg-bloque-titulo">${icono('award', 16)} Tabla de líderes — Puntos y resultados</div>
    <div class="sg-info muted" style="font-size:12px;margin-bottom:8px">
      Verde = zona de clasificación · Naranja = zona media · Rojo = descenso
    </div>
    <div class="sg-chart-wrap" data-graf="puntos"></div>
  </div>
  <div class="sg-bloque" aria-label="Gráfico de goles">
    <div class="sg-bloque-titulo">${icono('target', 16)} Goles a favor vs en contra</div>
    <div class="sg-info muted" style="font-size:12px;margin-bottom:8px">
      Comparación de ataque y defensa · La línea amarilla muestra la diferencia
    </div>
    <div class="sg-chart-wrap" data-graf="goles"></div>
  </div>
  <div class="sg-bloque" aria-label="Distribución de resultados">
    <div class="sg-bloque-titulo">${icono('pie-chart', 16)} Distribución de resultados</div>
    <div class="sg-info muted" style="font-size:12px;margin-bottom:8px">
      Proporción de victorias, empates y derrotas en el torneo completo
    </div>
    <div class="sg-chart-wrap sg-chart-doughnut" data-graf="dist"></div>
  </div>
  <div class="sg-bloque" aria-label="Gráfico de efectividad">
    <div class="sg-bloque-titulo">${icono('zap', 16)} Efectividad de los jugadores</div>
    <div class="sg-info muted" style="font-size:12px;margin-bottom:8px">
      % de victorias y % de puntos obtenidos vs máximo posible (mín. 2 partidos)
    </div>
    <div class="sg-chart-wrap" data-graf="efectividad"></div>
  </div>
</div>`;
  }

  Modulos['stats-globales'] = Mod;
})();
