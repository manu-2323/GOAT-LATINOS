/* =====================================================================
   NUEVO MÓDULO — Centro de control (Dashboard Admin)
   Solo visible para administradores.
   Archivo: js/modulos/dashboard-admin.js
   ===================================================================== */
(function () {

  /* Instancias Chart.js activas — se destruyen al salir */
  const _charts = {};

  /* Métricas puras, sin DOM: se prueban en tests/fase-3.16.test.js.
     Las jornadas virtuales y los jugadores inactivos se excluyen donde
     corresponde para no inflar los indicadores del panel. */
  function metricasAdmin({ jugadores, partidos, jornadas, grupos, miembros }) {
    const activosArray = jugadores.filter(j => j.activo !== false && j.rol !== 'expulsado');
    const jornadasReales = jornadas.filter(j => !j.virtual);
    const porGrupoJornada = new Map();
    partidos.forEach(p => {
      const clave = (p.grupo_id || '') + '|' + p.jornada;
      if (!porGrupoJornada.has(clave))
        porGrupoJornada.set(clave, { numero: Number(p.jornada), grupo_id: p.grupo_id || '', partidos: [] });
      porGrupoJornada.get(clave).partidos.push(p);
    });
    const cerradas = new Set(jornadasReales.filter(j => j.estado === 'cerrada')
      .map(j => (j.grupo_id || '') + '|' + j.numero));
    const jornadasParaCerrar = Array.from(porGrupoJornada.values())
      .filter(x => x.partidos.length && x.partidos.every(p => p.estado !== 'pendiente') &&
        !cerradas.has(x.grupo_id + '|' + x.numero))
      .sort((a, b) => a.numero - b.numero)
      .map(x => {
        const g = grupos.find(gr => gr.id === x.grupo_id);
        return g && GL.letraGrupo ? 'J' + x.numero + ' · ' + GL.letraGrupo(g) : 'J' + x.numero;
      });
    return {
      totalJugadores: jugadores.length,
      activos: activosArray.length,
      suspendidos: activosArray.filter(j => j.suspendido === true).length,
      expulsados: jugadores.filter(j => j.activo === false || j.rol === 'expulsado').length,
      jugados: partidos.filter(p => p.estado !== 'pendiente').length,
      pendientes: partidos.filter(p => p.estado === 'pendiente').length,
      jornadasAbiertas: jornadasReales.filter(j => j.estado === 'abierta').length,
      jornadasCerradas: cerradas.size,
      sinGrupo: activosArray.filter(j => !(miembros || []).some(m => m.jugador_id === j.id)),
      sinTelefono: activosArray.filter(j =>
        !(GL.tel && GL.tel.e164Jugador && GL.tel.e164Jugador(j)) && !j.telefono_e164 && !j.telefono),
      sinFoto: activosArray.filter(j => !j.avatar_url),
      jornadasParaCerrar
    };
  }

  const Mod = {
    titulo: 'Centro de control',

    destruir() {
      Object.values(_charts).forEach(c => { try { c.destroy(); } catch (e) {} });
      Object.keys(_charts).forEach(k => delete _charts[k]);
    },

    async render(el) {
      el.innerHTML = GL.skeleton(8, 20, true);
      if (!(await GL.asegurarAdmin(el))) return;

      try {
        /* El router ya cargó el contexto; recargarlo aquí duplicaba consultas. */
        const torneo = GL.torneo();

        if (!torneo) {
          el.innerHTML = '<div class="da-pantalla" data-dashboard>' +
            GL.vacio(
              'No hay torneo activo.',
              'trophy',
              '<button type="button" class="btn" data-ir="administracion">' +
                icono('plus', 16) + ' Crear primer torneo</button>',
              'Entrá a Administración para crear el torneo y comenzar a cargar datos.'
            ) + '</div>';
          enlazarNavegacion(el);
          iniciarIconos(); return;
        }

        /* ── Datos base: una sola consulta, reutilizada por todas las secciones ── */
        const partidos  = await GL.partidos({ torneo_id: torneo.id });
        /* GL.jugadores() oculta inactivos: el panel debe contar el plantel real. */
        const jugadores = GL.ctx.jugadores || [];
        const grupos    = GL.grupos();
        const miembros  = GL.ctx.miembros || [];
        /* Las jornadas virtuales se inyectan en memoria para completar el
           calendario; no son jornadas abiertas de verdad. */
        const jornadas  = (GL.ctx.jornadas || []).filter(j => !j.virtual);
        const sanciones = GL.ctx.sanciones || [];

        /* ── Métricas calculadas sobre datos reales ── */
        const {
          totalJugadores, activos, suspendidos, expulsados, jugados, pendientes,
          jornadasAbiertas, jornadasCerradas, sinGrupo, sinTelefono, sinFoto,
          jornadasParaCerrar
        } = metricasAdmin({ jugadores, partidos, jornadas, grupos, miembros });

        /* ── Alertas (criterios existentes, sin cambios) ── */
        const alertas = [];
        if (sinGrupo.length)    alertas.push({ tipo:'advertencia', ico:'user-x',       msg: sinGrupo.length + ' jugador(es) sin grupo asignado.', link:'administracion' });
        if (sinTelefono.length) alertas.push({ tipo:'info',        ico:'phone-off',    msg: sinTelefono.length + ' jugador(es) sin teléfono registrado.', link:'administracion' });
        if (sinFoto.length)     alertas.push({ tipo:'info',        ico:'image-off',    msg: sinFoto.length + ' jugador(es) sin fotografía de perfil.', link:'administracion' });
        if (jornadasParaCerrar.length)
          alertas.push({ tipo:'advertencia', ico:'flag', msg: 'Jornada(s) ' + jornadasParaCerrar.join(', ') + ' lista(s) para cerrar.', link:'jornadas' });

        const totalJornadas = torneo.total_jornadas || 22;

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

        /* ── Información contextual derivada de los mismos datos ── */
        const jornadaActual = jornadas.find(j => j.estado === 'abierta') ||
          jornadas.slice().sort((a,b) => Number(b.numero) - Number(a.numero))[0] || { numero: 1 };
        const partidosJornada = partidos.filter(p => p.jornada === jornadaActual.numero);
        const jugadosJornada  = partidosJornada.filter(p => p.estado !== 'pendiente').length;
        const pctJornada      = partidosJornada.length ? Math.round(jugadosJornada / partidosJornada.length * 100) : 0;

        /* Actividad real: últimos partidos con resultado cargado. */
        const recientes = partidos
          .filter(p => p.estado !== 'pendiente')
          .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
          .slice(0, 5);

        /* Próximos encuentros reales: partidos pendientes, sin fechas inventadas. */
        const proximos = partidos
          .filter(p => p.estado === 'pendiente')
          .sort((a, b) => Number(a.jornada) - Number(b.jornada) || String(a.id).localeCompare(String(b.id)))
          .slice(0, 4);

        /* Resumen de clasificación: usa GL.clasificacion(), sin recalcular nada. */
        const posiciones = (GL.clasificacion ? GL.clasificacion() : []).slice(0, 4);

        /* ── Render principal ── */
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch(e){} });
        Object.keys(_charts).forEach(k => delete _charts[k]);

        el.innerHTML =
          '<div class="da-pantalla" data-dashboard>' +

            /* A. Encabezado compacto */
            '<header class="da-hero card">' +
              '<div class="da-hero-cuerpo">' +
                '<div class="da-eyebrow">' + icono('layout-dashboard', 14) + 'Centro de control</div>' +
                '<h1>' + esc(torneo.nombre || CONFIG.NOMBRE_LIGA) + '</h1>' +
                '<p>' + esc(torneo.temporada || 'Temporada activa') + ' · Vista general del torneo en curso</p>' +
                '<div class="da-hero-meta">' +
                  GL.badge('ADMINISTRADOR', 'gold', 'shield') +
                  '<span>' + icono('flag', 14) + ' Jornada ' + Number(jornadaActual.numero) + ' de ' + totalJornadas + '</span>' +
                  '<span>' + icono('clock', 14) + ' Actualizado ' + esc(GL.fechaLarga(new Date())) + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="da-hero-acciones">' +
                '<button type="button" class="btn contorno" id="da-guia">' + icono('compass', 16) + 'Ver guía</button>' +
                '<button type="button" class="btn" id="da-refrescar">' + icono('refresh-cw', 16) + 'Actualizar</button>' +
              '</div>' +
            '</header>' +

            /* B. Indicadores con jerarquía */
            '<section class="da-bloque" aria-labelledby="da-resumen-titulo">' +
              '<div class="da-bloque-cab">' +
                '<div><h2 id="da-resumen-titulo">Resumen del torneo</h2>' +
                '<p>Datos disponibles en la temporada activa</p></div>' +
              '</div>' +
              '<div class="da-kpis">' +
                kpiPrincipal('Partidos jugados', jugados, 'target',
                  'de ' + partidos.length + ' programados · Jornada ' + Number(jornadaActual.numero),
                  pctJornada, 'fixture') +
                kpi('Jugadores', totalJugadores, 'users', activos + ' activos', 'administracion', 'neutral') +
                kpi('Pendientes', pendientes, 'clock', 'sin resultado', 'resultados', 'warning') +
                kpi('Jornadas abiertas', jornadasAbiertas, 'flag', 'de ' + totalJornadas, 'jornadas', 'warning') +
                kpi('Jornadas cerradas', jornadasCerradas, 'flag-off', 'finalizadas', 'jornadas', 'neutral') +
                kpi('Grupos', grupos.length, 'layers', 'en el torneo', 'administracion', 'neutral') +
                kpi('Suspendidos', suspendidos, 'user-x', expulsados + ' expulsados', 'administracion',
                    suspendidos || expulsados ? 'danger' : 'neutral') +
              '</div>' +
            '</section>' +

            /* C/D/F. Distribución en dos columnas */
            '<div class="da-layout">' +
              '<div class="da-col-principal">' +

                '<section class="card da-panel" aria-labelledby="da-actividad-titulo">' +
                  panelCab('da-actividad-titulo', 'activity', 'Actividad reciente',
                    'Últimos resultados cargados', 'resultados', 'Ver resultados') +
                  (recientes.length
                    ? '<ul class="da-lista">' + recientes.map(filaActividad).join('') + '</ul>'
                    : placeholder('Todavía no hay resultados', 'Cuando se cargue un partido aparecerá aquí.', 'clipboard-check')) +
                '</section>' +

                '<section class="card da-panel" aria-labelledby="da-proximos-titulo">' +
                  panelCab('da-proximos-titulo', 'calendar-days', 'Próximos encuentros',
                    'Partidos pendientes del cuadro', 'fixture', 'Ver cuadro') +
                  (proximos.length
                    ? '<ul class="da-lista da-lista-partidos">' + proximos.map(filaProximo).join('') + '</ul>'
                    : placeholder('No hay partidos programados', 'Los encuentros pendientes aparecerán en esta sección.', 'calendar')) +
                '</section>' +

                '<section class="da-panel da-graficas-panel" aria-labelledby="da-graficas-titulo">' +
                  panelCab('da-graficas-titulo', 'chart-no-axes-column', 'Rendimiento del torneo',
                    'Gráficas construidas con los datos existentes', 'estadisticas-globales', 'Ver estadísticas') +
                  '<div class="da-graficas-grid">' +
                    '<div class="da-grafica-card">' +
                      '<div class="da-grafica-titulo">' + icono('trending-up',16) + 'Partidos completados por jornada</div>' +
                      '<div class="da-canvas-wrap"><canvas id="da-chart-completados" aria-label="Partidos completados por jornada"></canvas></div>' +
                    '</div>' +
                    '<div class="da-grafica-card">' +
                      '<div class="da-grafica-titulo">' + icono('goal',16) + 'Goles reales por jornada</div>' +
                      '<div class="da-canvas-wrap"><canvas id="da-chart-goles" aria-label="Goles reales por jornada"></canvas></div>' +
                    '</div>' +
                    '<div class="da-grafica-card">' +
                      '<div class="da-grafica-titulo">' + icono('pie-chart',16) + 'Resultados (V/E/D) globales</div>' +
                      '<div class="da-canvas-wrap"><canvas id="da-chart-ved" aria-label="Distribución victorias empates derrotas"></canvas></div>' +
                    '</div>' +
                    '<div class="da-grafica-card">' +
                      '<div class="da-grafica-titulo">' + icono('gavel',16) + 'Sanciones por tipo</div>' +
                      '<div class="da-canvas-wrap"><canvas id="da-chart-sanciones" aria-label="Distribución de sanciones"></canvas></div>' +
                    '</div>' +
                  '</div>' +
                '</section>' +

              '</div>' +

              '<aside class="da-col-lateral" aria-label="Información complementaria">' +

                '<section class="card da-panel" aria-labelledby="da-alertas-titulo">' +
                  panelCab('da-alertas-titulo', 'bell-ring', 'Atención requerida',
                    'Situaciones que conviene revisar', null, null) +
                  (alertas.length
                    ? '<ul class="da-alertas">' + alertas.map(filaAlerta).join('') + '</ul>'
                    : '<div class="da-ok">' + icono('circle-check', 20) + 'Todo en orden. No hay alertas pendientes.</div>') +
                '</section>' +

                '<section class="card da-panel" aria-labelledby="da-clasificacion-titulo">' +
                  panelCab('da-clasificacion-titulo', 'trophy', 'Clasificación',
                    'Principales posiciones del torneo', 'tabla', 'Ver tabla') +
                  (posiciones.length
                    ? '<ol class="da-clasificacion">' + posiciones.map(filaClasificacion).join('') + '</ol>'
                    : placeholder('Sin clasificación disponible', 'Las posiciones aparecerán cuando haya resultados.', 'chart-no-axes-column')) +
                '</section>' +

                '<section class="card da-panel" aria-labelledby="da-grupos-titulo">' +
                  panelCab('da-grupos-titulo', 'users', 'Estado de los grupos',
                    'Cobertura de jugadores por grupo', 'administracion', 'Gestionar') +
                  (grupos.length
                    ? '<div class="da-grupos">' + grupos.map(g => tarjetaGrupo(g, partidos)).join('') + '</div>'
                    : placeholder('No hay grupos', 'Cuando se creen grupos aparecerán aquí.', 'users')) +
                '</section>' +

                '<section class="card da-panel" aria-labelledby="da-acciones-titulo">' +
                  panelCab('da-acciones-titulo', 'zap', 'Acciones rápidas',
                    'Atajos a módulos existentes', null, null) +
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
                '</section>' +

              '</aside>' +
            '</div>' +

            '<p class="nota-pie da-pie">' +
              icono('clock', 14) + ' Información actualizada el ' + esc(GL.fechaLarga(new Date())) +
            '</p>' +
          '</div>';

        /* Enlaces y estados del dashboard */
        enlazarNavegacion(el);
        iniciarEstadosVacio(el);

        const btnGuia = el.querySelector('#da-guia');
        if (btnGuia) btnGuia.addEventListener('click', () => {
          if (window.OnboardingAdmin) OnboardingAdmin.iniciar(true);
        });
        const btnRefrescar = el.querySelector('#da-refrescar');
        if (btnRefrescar) btnRefrescar.addEventListener('click', async () => {
          if (btnRefrescar.disabled) return;
          btnRefrescar.disabled = true;
          btnRefrescar.textContent = 'Actualizando…';
          try {
            GL.invalidar();
            await GL.cargarContexto(true);
            await Mod.render(el);
          } catch (e) {
            GL.notificar(GL.mensaje(e, 'cargar', 'el centro de control'), 'error');
            btnRefrescar.disabled = false;
            btnRefrescar.textContent = 'Actualizar';
          }
        });

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

  function panelCab(id, ico, titulo, subtitulo, link, accion) {
    return '<div class="da-panel-cab">' +
      '<div class="da-panel-titulo">' +
        '<h2 id="' + id + '">' + icono(ico, 18) + esc(titulo) + '</h2>' +
        (subtitulo ? '<p>' + esc(subtitulo) + '</p>' : '') +
      '</div>' +
      (link && accion
        ? '<button type="button" class="btn texto" data-ir="' + link + '">' + esc(accion) + icono('arrow-right', 14) + '</button>'
        : '') +
    '</div>';
  }

  function kpi(valor, label, ico, sub, link, tono) {
    return '<div class="da-kpi da-kpi-' + esc(tono || 'neutral') + '" data-kpi role="button" tabindex="0" data-ir="' + esc(link) + '">' +
      '<span class="da-kpi-ico">' + icono(ico, 20) + '</span>' +
      '<span class="da-kpi-valor">' + valor + '</span>' +
      '<span class="da-kpi-label">' + esc(label) + '</span>' +
      (sub ? '<span class="da-kpi-sub">' + esc(sub) + '</span>' : '') +
    '</div>';
  }

  function kpiPrincipal(label, valor, ico, sub, pct, link) {
    return '<div class="da-kpi da-kpi-principal" data-kpi role="button" tabindex="0" data-ir="' + esc(link) + '">' +
      '<div class="da-kpi-principal-cab">' +
        '<span class="da-kpi-ico">' + icono(ico, 20) + '</span>' +
        '<span class="da-kpi-label">' + esc(label) + '</span>' +
      '</div>' +
      '<div class="da-kpi-valor">' + valor + '</div>' +
      '<div class="da-kpi-sub">' + esc(sub) + '</div>' +
      '<div class="da-progreso-wrap" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Progreso de la jornada">' +
        '<div class="da-progreso-bar" style="width:' + pct + '%"></div>' +
      '</div>' +
    '</div>';
  }

  function fechaCorta(valor) {
    if (!valor) return 'Sin fecha';
    const texto = String(valor).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const d = new Date(texto);
    if (isNaN(d.getTime())) return texto;
    return String(d.getDate()).padStart(2, '0') + '/' +
      String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function fechaJornada(j) {
    if (!j) return 'Sin fecha definida';
    if (j.fecha_inicio) return esc(GL.fechaHoraEnZona(j.fecha_inicio));
    if (j.fecha) return esc(fechaCorta(j.fecha));
    return 'Sin fecha definida';
  }

  function filaActividad(p) {
    const r = GL.resultado(p);
    return '<li class="da-lista-item" role="button" tabindex="0" data-ir="resultados">' +
      '<span class="da-lista-ico">' + icono('circle-check', 16) + '</span>' +
      '<span class="da-lista-cuerpo">' +
        '<strong>' + esc(GL.nombreJugador(p.local_id)) + ' <span class="da-vs">vs</span> ' + esc(GL.nombreJugador(p.visitante_id)) + '</strong>' +
        '<small>Jornada ' + Number(p.jornada) + ' · ' + esc(fechaCorta(p.updated_at || p.created_at)) + '</small>' +
      '</span>' +
      '<span class="da-marcador">' + r.gf + ' : ' + r.gc + '</span>' +
    '</li>';
  }

  function filaProximo(p) {
    const j = jornadasLocales().find(x => x.numero === p.jornada) || {};
    return '<li class="da-lista-item da-partido-item" role="button" tabindex="0" data-ir="fixture">' +
      '<span class="da-lista-ico">' + icono('calendar-clock', 16) + '</span>' +
      '<span class="da-lista-cuerpo">' +
        '<strong>' + esc(GL.nombreJugador(p.local_id)) + ' <span class="da-vs">vs</span> ' + esc(GL.nombreJugador(p.visitante_id)) + '</strong>' +
        '<small>Jornada ' + Number(p.jornada) + ' · ' + fechaJornada(j) + '</small>' +
      '</span>' +
      '<span class="badge orange">Pendiente</span>' +
    '</li>';
  }

  function jornadasLocales() { return (GL.ctx && GL.ctx.jornadas) || []; }

  function filaAlerta(a) {
    const tono = a.tipo === 'advertencia' ? 'warning' : a.tipo === 'error' ? 'danger' : 'info';
    return '<li class="da-alerta da-alerta-' + tono + '" role="button" tabindex="0" data-ir="' + esc(a.link) + '">' +
      icono(a.ico, 16) + '<span>' + esc(a.msg) + '</span>' + icono('arrow-right', 14) +
    '</li>';
  }

  function filaClasificacion(c, i) {
    const j = GL.jugador(c.jugador_id) || {};
    const g = GL.grupo(c.grupo_id);
    return '<li class="da-clas-fila" role="button" tabindex="0" data-ir="tabla">' +
      '<span class="da-pos' + (i === 0 ? ' lider' : '') + '">' + (i + 1) + '</span>' +
      '<span class="da-clas-nombre">' + esc(j.nombre_usuario || '—') +
        '<small>' + esc(g ? 'Grupo ' + GL.letraGrupo(g) : 'General') + ' · PJ ' + Number(c.pj || 0) + ' · DG ' + Number(c.dif || 0) + '</small>' +
      '</span>' +
      '<span class="da-clas-pts">' + Number(c.pts || 0) + '<small>Pts</small></span>' +
    '</li>';
  }

  function tarjetaGrupo(g, partidos) {
    const miembrosG = (GL.ctx.miembros || []).filter(m => m.grupo_id === g.id).length;
    const esperados = GL.torneo().jugadores_por_grupo || 12;
    const completo  = miembrosG >= esperados;
    const pct       = Math.min(100, Math.round((miembrosG / esperados) * 100));
    const partidosG = (partidos || []).filter(p => p.grupo_id === g.id);
    const jugadosG  = partidosG.filter(p => p.estado !== 'pendiente').length;
    return '<div class="da-grupo-card" role="button" tabindex="0" data-ir="administracion">' +
      '<div class="da-grupo-cabeza">' +
        '<span class="da-grupo-nombre">' + icono('shield', 16) + 'Grupo ' + esc(GL.letraGrupo(g)) + '</span>' +
        '<span class="badge ' + (completo ? 'green' : 'orange') + '">' + (completo ? 'Completo' : 'Incompleto') + '</span>' +
      '</div>' +
      '<div class="da-grupo-num">' + miembrosG + '<span>/' + esperados + '</span></div>' +
      '<div class="da-grupo-label">Jugadores asignados</div>' +
      '<div class="da-progreso-wrap"><div class="da-progreso-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="da-grupo-stats">' +
        '<span>' + icono('check-circle', 14) + ' ' + jugadosG + ' partidos jugados</span>' +
      '</div>' +
    '</div>';
  }

  function placeholder(titulo, texto, ico) {
    return '<div class="da-estado-vacio" data-estado-vacio data-titulo="' + esc(titulo) +
      '" data-texto="' + esc(texto) + '" data-icono="' + esc(ico || 'inbox') + '"></div>';
  }

  function iniciarEstadosVacio(root) {
    root.querySelectorAll('[data-estado-vacio]').forEach(n => {
      if (typeof GL.estado === 'function') {
        GL.estado(n, 'vacio', {
          titulo: n.dataset.titulo,
          texto: n.dataset.texto,
          icono: n.dataset.icono
        });
      } else {
        n.innerHTML = GL.vacio(n.dataset.titulo, n.dataset.icono, null, n.dataset.texto);
      }
    });
  }

  function accionBtn(ico, label, link) {
    return '<button type="button" class="da-accion-btn" data-ir="' + link + '">' +
      '<span class="da-accion-ico">' + icono(ico, 18) + '</span>' +
      '<span class="da-accion-label">' + esc(label) + '</span>' +
    '</button>';
  }

  function enlazarNavegacion(root) {
    root.querySelectorAll('[data-ir]').forEach(b => {
      const ir = () => { location.hash = b.dataset.ir; };
      b.addEventListener('click', ir);
      b.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
      });
    });
  }

  /* ── Opciones base Chart.js (mismo estilo que stats-globales) ── */
  const OPTS_BASE = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: GL.tema.texto2, font: { size: 12, family: GL.tema.fuente }, padding: 10, boxWidth: 12 }
      },
      tooltip: {
        backgroundColor: GL.tema.superficie, borderColor: GL.tema.bordeFuerte, borderWidth: 1,
        titleColor: GL.tema.advertencia, bodyColor: GL.tema.texto, padding: 10
      }
    },
    scales: {}
  };

  function escalesOscuras(extra) {
    return Object.assign({
      grid:  { color: GL.tema.borde },
      ticks: { color: GL.tema.texto2, font: { size: 12, family: GL.tema.fuente } }
    }, extra || {});
  }

  function sinDatos(id, msg) {
    const c = document.getElementById(id);
    if (!c) return;
    c.parentElement.innerHTML =
      '<div class="sg-vacio">' + icono('bar-chart-2',32) +
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
          backgroundColor: datos.map(d => d === 0 ? GL.tema.alfa(GL.tema.bordeFuerte, 0.5) : GL.tema.exito),
          borderRadius: 4
        }]
      },
      options: {
        ...OPTS_BASE,
        plugins: { ...OPTS_BASE.plugins, legend: { display: false } },
        scales: { x: escalesOscuras(), y: escalesOscuras({ beginAtZero: true, ticks: { stepSize: 1, color: GL.tema.texto2 } }) }
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
          borderColor: GL.tema.advertencia,
          backgroundColor: GL.tema.alfa(GL.tema.advertencia, 0.15),
          pointBackgroundColor: GL.tema.advertencia,
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
          backgroundColor: [GL.tema.exito, GL.tema.advertencia, GL.tema.marca],
          borderColor: GL.tema.bg,
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        ...OPTS_BASE,
        cutout: '62%',
        plugins: {
          ...OPTS_BASE.plugins,
          legend: { position: 'bottom', labels: { color: GL.tema.texto2, font: { size: 12, family: GL.tema.fuente }, padding: 12, boxWidth: 12 } }
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
    const colores = [
      GL.tema.advertencia, GL.tema.marca, GL.tema.info, GL.tema.exito,
      GL.tema.marcaTexto, GL.tema.texto2, GL.tema.bordeFuerte
    ];
    const canvas = document.getElementById('da-chart-sanciones');
    if (!canvas) return;
    _charts['sanciones'] = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: datos,
          backgroundColor: colores.slice(0, labels.length),
          borderColor: GL.tema.bg,
          borderWidth: 2
        }]
      },
      options: {
        ...OPTS_BASE,
        plugins: {
          ...OPTS_BASE.plugins,
          legend: { position: 'bottom', labels: { color: GL.tema.texto2, font: { size: 12, family: GL.tema.fuente }, padding: 12, boxWidth: 12 } }
        }
      }
    });
  }

  /* API de solo pruebas: cálculo sin DOM ni Supabase. */
  Mod._metricas = metricasAdmin;

  Modulos['dashboard-admin'] = Mod;
})();
