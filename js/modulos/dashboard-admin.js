/* =====================================================================
   NUEVO MÓDULO — Centro de control (Dashboard Admin)
   Solo visible para administradores.
   Archivo: js/modulos/dashboard-admin.js
   ===================================================================== */
(function () {

  /* Instancias Chart.js activas — se destruyen al salir */
  const _charts = {};

  const Mod = {
    titulo: 'Centro de control',

    async render(el) {
      el.innerHTML = GL.skeleton(8, 20, true);
      if (!(await GL.asegurarAdmin(el))) return;

      try {
        await GL.cargarContexto(true);
        const torneo = GL.torneo();

        if (!torneo) {
          el.innerHTML = GL.vacio(
            'No hay torneo activo.',
            'trophy',
            '<button class="btn mt" onclick="location.hash=\'administracion\'">'+
              icono('plus',16)+' Crear primer torneo</button>',
            'Entrá a Administración para crear el torneo y comenzar a cargar datos.'
          );
          iniciarIconos(); return;
        }

        /* ── Datos base ── */
        const partidos  = await GL.partidos({ torneo_id: torneo.id });
        const jugadores = GL.jugadores();
        const grupos    = GL.grupos();
        const miembros  = GL.ctx.miembros || [];
        const jornadas  = GL.ctx.jornadas || [];
        const sanciones = GL.ctx.sanciones || [];

        /* ── Métricas ── */
        const totalJugadores   = jugadores.length;
        const activos          = jugadores.filter(j => j.activo !== false && j.rol !== 'expulsado').length;
        const suspendidos      = jugadores.filter(j => j.suspendido === true).length;
        const expulsados       = jugadores.filter(j => j.rol === 'expulsado' || j.activo === false).length;
        const jugados          = partidos.filter(p => p.estado !== 'pendiente').length;
        const pendientes       = partidos.filter(p => p.estado === 'pendiente').length;
        const jornadasAbiertas = jornadas.filter(j => j.estado !== 'cerrada').length;
        const jornadasCerradas = jornadas.filter(j => j.estado === 'cerrada').length;
        const sinGrupo         = GL.jugadoresSinGrupo ? GL.jugadoresSinGrupo() : [];
        const sinTelefono      = jugadores.filter(j => !j.telefono);
        const sinFoto          = jugadores.filter(j => !j.avatar_url);

        /* ── Alertas ── */
        const alertas = [];
        if (sinGrupo.length)    alertas.push({ tipo:'advertencia', ico:'user-x',       msg: sinGrupo.length + ' jugador(es) sin grupo asignado.', link:'administracion' });
        if (sinTelefono.length) alertas.push({ tipo:'info',        ico:'phone-off',    msg: sinTelefono.length + ' jugador(es) sin teléfono registrado.', link:'administracion' });
        if (sinFoto.length)     alertas.push({ tipo:'info',        ico:'image-off',    msg: sinFoto.length + ' jugador(es) sin fotografía de perfil.', link:'administracion' });

        /* Jornadas que pueden cerrarse (todos sus partidos resueltos) */
        const totalJornadas = torneo.total_jornadas || 22;
        const jornNums = Array.from(new Set(partidos.map(p => p.jornada))).sort((a,b)=>a-b);
        const jornadasListas = jornNums.filter(n => {
          const delGrupo = partidos.filter(p => p.jornada === n);
          return delGrupo.length > 0 && delGrupo.every(p => p.estado !== 'pendiente');
        });
        const jornadasYaCerradas = new Set(jornadas.filter(j=>j.estado==='cerrada').map(j=>j.numero));
        const jornadasParaCerrar = jornadasListas.filter(n => !jornadasYaCerradas.has(n));
        if (jornadasParaCerrar.length)
          alertas.push({ tipo:'advertencia', ico:'flag', msg: 'Jornada(s) ' + jornadasParaCerrar.join(', ') + ' lista(s) para cerrar.', link:'jornadas' });

        /* Sanciones próximas: jugadores con 2 tarjetas en la temporada */
        const amonestaciones = {};
        (sanciones).forEach(s => {
          if (s.tipo === 'amarilla') amonestaciones[s.jugador_id] = (amonestaciones[s.jugador_id]||0)+1;
        });
        const enRiesgo = Object.entries(amonestaciones).filter(([,n]) => n >= 2 && n % 3 === 2);
        if (enRiesgo.length)
          alertas.push({ tipo:'advertencia', ico:'triangle-alert', msg: enRiesgo.length + ' jugador(es) próximos a suspensión por acumulación.', link:'administracion' });

        if (pendientes === partidos.length && partidos.length > 0)
          alertas.push({ tipo:'error', ico:'alert-circle', msg: 'No hay resultados cargados aún en este torneo.', link:'resultados' });

        /* ── Render principal ── */
        // Destruir gráficas previas
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch(e){} });
        Object.keys(_charts).forEach(k => delete _charts[k]);

        el.innerHTML =
          /* Encabezado */
          '<div class="seccion-head">' +
            '<div class="seccion-titulo">' +
              '<h2>' + icono('layout-dashboard',22) + ' Centro de control</h2>' +
              '<p>' + esc(torneo.nombre) + ' · ' + esc(torneo.temporada) +
              ' · <span class="badge gold">' + icono('shield',12) + ' Administrador</span></p>' +
            '</div>' +
            '<div class="seccion-acciones">' +
              '<button type="button" class="btn-secundario" id="da-guia">' + icono('compass',15) + 'Ver guía</button>' +
              '<button type="button" class="btn-secundario" id="da-refrescar">' + icono('refresh-cw',15) + 'Actualizar</button>' +
            '</div>' +
          '</div>' +

          /* ── A. Métricas resumen ── */
          '<div class="da-seccion-label">' + icono('bar-chart-horizontal',14) + 'Resumen del torneo</div>' +
          '<div class="da-metricas">' +
            metCard('Jugadores',       totalJugadores, 'users',           'neutral',      'administracion',   'Total registrados') +
            metCard('Activos',         activos,        'user-check',      'verde',        'administracion',   'Pueden jugar') +
            metCard('Suspendidos',     suspendidos,    'user-minus',      suspendidos>0?'amarillo':'neutral', 'administracion', 'Sanción activa') +
            metCard('Expulsados',      expulsados,     'user-x',          expulsados>0?'rojo':'neutral',      'administracion', 'Inhabilitados') +
            metCard('Partidos totales',partidos.length,'calendar',        'neutral',      'fixture',          'Programados') +
            metCard('Jugados',         jugados,        'check-circle',    'verde',        'fixture',          'Con resultado') +
            metCard('Pendientes',      pendientes,     'clock',           pendientes>0?'amarillo':'neutral',  'resultados', 'Sin resultado') +
            metCard('Jornadas abiertas',jornadasAbiertas,'flag',          jornadasAbiertas>0?'amarillo':'neutral','jornadas','En curso') +
            metCard('Jornadas cerradas',jornadasCerradas,'flag-off',      'neutral',      'jornadas',         'Finalizadas') +
          '</div>' +

          /* ── B. Estado de grupos ── */
          '<div class="da-seccion-label">' + icono('users',14) + 'Estado de los grupos</div>' +
          '<div class="da-grupos">' + grupos.map(g => {
            const miembrosG = miembros.filter(m => m.grupo_id === g.id).length;
            const esperados = torneo.jugadores_por_grupo || 12;
            const completo  = miembrosG >= esperados;
            const pct       = Math.min(100, Math.round((miembrosG / esperados) * 100));
            const partidosG = partidos.filter(p => p.grupo_id === g.id);
            const jugadosG  = partidosG.filter(p => p.estado !== 'pendiente').length;
            return '<div class="da-grupo-card" role="button" tabindex="0" data-ir="administracion">' +
              '<div class="da-grupo-cabeza">' +
                '<span class="da-grupo-nombre">' + icono('shield',16) + 'Grupo ' + esc(GL.letraGrupo(g)) + '</span>' +
                '<span class="badge ' + (completo?'verde':'amarillo') + '">' + (completo?'Completo':'Incompleto') + '</span>' +
              '</div>' +
              '<div class="da-grupo-num">' + miembrosG + '<span>/' + esperados + '</span></div>' +
              '<div class="da-grupo-label">Jugadores asignados</div>' +
              '<div class="da-progreso-wrap"><div class="da-progreso-bar" style="width:'+pct+'%"></div></div>' +
              '<div class="da-grupo-stats">' +
                '<span>' + icono('calendar',12) + ' ' + totalJornadas + ' jornadas</span>' +
                '<span>' + icono('check-circle',12) + ' ' + jugadosG + ' partidos jugados</span>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>' +

          /* ── D. Alertas administrativas ── */
          (alertas.length ? (
            '<div class="da-seccion-label">' + icono('triangle-alert',14) + 'Alertas administrativas</div>' +
            '<div class="da-alertas">' + alertas.map(a =>
              '<div class="da-alerta ' + a.tipo + '" role="button" tabindex="0" data-ir="' + a.link + '">' +
                icono(a.ico, 16) + '<span>' + esc(a.msg) + '</span>' +
                '<span class="da-alerta-link">' + icono('arrow-right',14) + '</span>' +
              '</div>'
            ).join('') + '</div>'
          ) : (
            '<div class="da-seccion-label">' + icono('check-circle',14) + 'Alertas administrativas</div>' +
            '<div class="da-alerta-ok">' + icono('circle-check',20) + ' Todo en orden. No hay alertas pendientes.</div>'
          )) +

          /* ── C. Gráficas ── */
          '<div class="da-seccion-label">' + icono('chart-no-axes-column',14) + 'Gráficas del torneo</div>' +
          '<div class="da-graficas-grid">' +
            '<div class="da-grafica-card">' +
              '<div class="da-grafica-titulo">' + icono('trending-up',15) + 'Partidos completados por jornada</div>' +
              '<div class="da-canvas-wrap"><canvas id="da-chart-completados" aria-label="Partidos completados por jornada"></canvas></div>' +
            '</div>' +
            '<div class="da-grafica-card">' +
              '<div class="da-grafica-titulo">' + icono('goal',15) + 'Goles reales por jornada</div>' +
              '<div class="da-canvas-wrap"><canvas id="da-chart-goles" aria-label="Goles reales por jornada"></canvas></div>' +
            '</div>' +
            '<div class="da-grafica-card">' +
              '<div class="da-grafica-titulo">' + icono('pie-chart',15) + 'Resultados (V/E/D) globales</div>' +
              '<div class="da-canvas-wrap"><canvas id="da-chart-ved" aria-label="Distribución victorias empates derrotas"></canvas></div>' +
            '</div>' +
            '<div class="da-grafica-card">' +
              '<div class="da-grafica-titulo">' + icono('gavel',15) + 'Sanciones por tipo</div>' +
              '<div class="da-canvas-wrap"><canvas id="da-chart-sanciones" aria-label="Distribución de sanciones"></canvas></div>' +
            '</div>' +
          '</div>' +

          /* ── E. Acciones rápidas ── */
          '<div class="da-seccion-label">' + icono('zap',14) + 'Acciones rápidas</div>' +
          '<div class="da-acciones">' +
            accionBtn('user-plus',       'Agregar jugador',     'administracion') +
            accionBtn('flag',            'Abrir jornada',       'jornadas') +
            accionBtn('flag-off',        'Cerrar jornada',      'jornadas') +
            accionBtn('clipboard-check', 'Registrar resultado', 'resultados') +
            accionBtn('rotate-ccw',      'Nueva temporada',     'administracion') +
            accionBtn('message-square',  'Generar mensajes',    'mensajes') +
            accionBtn('bar-chart-2',     'Estadísticas',        'estadisticas-globales') +
            accionBtn('shield-check',    'Auditoría',           'auditoria') +
          '</div>' +

          /* Pie */
          '<p class="nota-pie" style="text-align:right;margin-top:16px">' +
            icono('clock',12) + ' Actualizado: ' + GL.fechaLarga(new Date()) +
          '</p>';

        /* ── Enlazar navegación ── */
        el.querySelectorAll('[data-ir]').forEach(b => {
          b.addEventListener('click',  () => { location.hash = b.dataset.ir; });
          b.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') location.hash = b.dataset.ir; });
        });
        const btnGuia = el.querySelector('#da-guia');
        if (btnGuia) btnGuia.addEventListener('click', () => {
          if (window.OnboardingAdmin) OnboardingAdmin.iniciar(true);
        });
        el.querySelector('#da-refrescar').addEventListener('click', () => Mod.render(el));

        /* ── Dibujar gráficas ── */
        pintarGraficaCompletados(partidos, totalJornadas);
        pintarGraficaGoles(partidos, totalJornadas);
        pintarGraficaVED(partidos);
        pintarGraficaSanciones(sanciones);

      } catch (e) {
        console.error(e);
        el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'el centro de control'), null, 'el centro de control');
      }
      iniciarIconos();
    }
  };

  /* ── Helpers de HTML ── */

  function metCard(label, valor, ico, tono, link, sub) {
    return '<div class="da-met-card da-met-' + tono + '" role="button" tabindex="0" data-ir="' + link + '">' +
      '<div class="da-met-ico">' + icono(ico, 22) + '</div>' +
      '<div class="da-met-info">' +
        '<div class="da-met-valor">' + valor + '</div>' +
        '<div class="da-met-label">' + esc(label) + '</div>' +
        (sub ? '<div class="da-met-sub">' + esc(sub) + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  function accionBtn(ico, label, link) {
    return '<button type="button" class="da-accion-btn" data-ir="' + link + '">' +
      '<span class="da-accion-ico">' + icono(ico, 20) + '</span>' +
      '<span class="da-accion-label">' + esc(label) + '</span>' +
    '</button>';
  }

  /* ── Opciones base Chart.js (mismo estilo que stats-globales) ── */
  const OPTS_BASE = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#d1d5db', font: { size: 11, family: 'Rajdhani, sans-serif' }, padding: 10, boxWidth: 12 }
      },
      tooltip: {
        backgroundColor: '#1a2235', borderColor: '#2d3748', borderWidth: 1,
        titleColor: '#f5c518', bodyColor: '#d1d5db', padding: 10
      }
    },
    scales: {}
  };

  function escalesOscuras(extra) {
    return Object.assign({
      grid:  { color: 'rgba(255,255,255,.07)' },
      ticks: { color: '#9ca3af', font: { size: 10, family: 'Rajdhani, sans-serif' } }
    }, extra || {});
  }

  function sinDatos(id, msg) {
    const c = document.getElementById(id);
    if (!c) return;
    c.parentElement.innerHTML =
      '<div class="sg-vacio">' + icono('bar-chart-2',28) +
      '<p>' + esc(msg || 'Sin datos suficientes.') + '</p></div>';
    iniciarIconos();
  }

  /* ── Gráfica 1: Partidos completados por jornada ── */
  function pintarGraficaCompletados(partidos, totalJornadas) {
    const jornadas = Array.from({length: totalJornadas}, (_, i) => i + 1);
    const datos = jornadas.map(n => partidos.filter(p => p.jornada === n && p.estado !== 'pendiente').length);
    if (datos.every(d => d === 0)) { sinDatos('da-chart-completados', 'Todavía no hay partidos jugados.'); return; }
    const canvas = document.getElementById('da-chart-completados');
    if (!canvas) return;
    _charts['completados'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: jornadas.map(n => 'J' + n),
        datasets: [{
          label: 'Partidos jugados',
          data: datos,
          backgroundColor: datos.map(d => d === 0 ? 'rgba(255,255,255,.1)' : '#00d4aa'),
          borderRadius: 4
        }]
      },
      options: {
        ...OPTS_BASE,
        plugins: { ...OPTS_BASE.plugins, legend: { display: false } },
        scales: { x: escalesOscuras(), y: escalesOscuras({ beginAtZero: true, ticks: { stepSize: 1, color:'#9ca3af' } }) }
      }
    });
  }

  /* ── Gráfica 2: Goles reales por jornada ── */
  function pintarGraficaGoles(partidos, totalJornadas) {
    const jornadas = Array.from({length: totalJornadas}, (_, i) => i + 1);
    const datos = jornadas.map(n => {
      return partidos.filter(p => p.jornada === n && p.estado === 'jugado')
        .reduce((s, p) => s + (Number(p.goles_local)||0) + (Number(p.goles_visitante)||0), 0);
    });
    if (datos.every(d => d === 0)) { sinDatos('da-chart-goles', 'No hay goles registrados aún.'); return; }
    const canvas = document.getElementById('da-chart-goles');
    if (!canvas) return;
    _charts['goles'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: jornadas.map(n => 'J' + n),
        datasets: [{
          label: 'Goles reales',
          data: datos,
          borderColor: '#f5c518',
          backgroundColor: 'rgba(245,197,24,.15)',
          pointBackgroundColor: '#f5c518',
          pointRadius: 4,
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        ...OPTS_BASE,
        plugins: { ...OPTS_BASE.plugins, legend: { display: false } },
        scales: { x: escalesOscuras(), y: escalesOscuras({ beginAtZero: true }) }
      }
    });
  }

  /* ── Gráfica 3: Victorias, empates, derrotas ── */
  function pintarGraficaVED(partidos) {
    const jugados = partidos.filter(p => p.estado !== 'pendiente');
    let v = 0, e = 0, d = 0;
    jugados.forEach(p => {
      const r = GL.resultado(p);
      if (r.gf > r.gc) v++;
      else if (r.gf === r.gc) e++;
      else d++;
    });
    if (v + e + d === 0) { sinDatos('da-chart-ved', 'Sin resultados para mostrar.'); return; }
    const canvas = document.getElementById('da-chart-ved');
    if (!canvas) return;
    _charts['ved'] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Victorias (' + v + ')', 'Empates (' + e + ')', 'Derrotas (' + d + ')'],
        datasets: [{
          data: [v, e, d],
          backgroundColor: ['#00d4aa', '#ff8c00', '#ff4757'],
          borderColor: '#1a2235',
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        ...OPTS_BASE,
        cutout: '62%',
        plugins: {
          ...OPTS_BASE.plugins,
          legend: { position: 'bottom', labels: { color: '#d1d5db', font: { size: 11, family: 'Rajdhani, sans-serif' }, padding: 12, boxWidth: 12 } }
        }
      }
    });
  }

  /* ── Gráfica 4: Sanciones por tipo ── */
  function pintarGraficaSanciones(sanciones) {
    const tipos = {};
    sanciones.forEach(s => { tipos[s.tipo || 'otro'] = (tipos[s.tipo || 'otro'] || 0) + 1; });
    if (!Object.keys(tipos).length) { sinDatos('da-chart-sanciones', 'No hay sanciones registradas.'); return; }
    const labels = Object.keys(tipos).map(t => t.charAt(0).toUpperCase() + t.slice(1));
    const datos  = Object.values(tipos);
    const colores = ['#ff8c00','#ff4757','#f5c518','#00d4aa','#8b5cf6'];
    const canvas = document.getElementById('da-chart-sanciones');
    if (!canvas) return;
    _charts['sanciones'] = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: datos,
          backgroundColor: colores.slice(0, labels.length),
          borderColor: '#1a2235',
          borderWidth: 2
        }]
      },
      options: {
        ...OPTS_BASE,
        plugins: {
          ...OPTS_BASE.plugins,
          legend: { position: 'bottom', labels: { color: '#d1d5db', font: { size: 11, family: 'Rajdhani, sans-serif' }, padding: 12, boxWidth: 12 } }
        }
      }
    });
  }

  Modulos['dashboard-admin'] = Mod;
})();
