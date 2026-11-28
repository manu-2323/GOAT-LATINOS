/* =====================================================================
   GOATS LEAGUE MANAGER — Panel principal (FASE 3.12, ampliación)
   Pantalla de entrada después del inicio de sesión. Adapta su contenido
   al jugador vinculado a la cuenta o al rol de administrador.
   Todos los datos proceden del contexto ya cargado y de Supabase;
   no se generan marcadores, fechas ni estadísticas de ejemplo.
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Inicio',

    async render(el) {
      el.innerHTML = GL.skeleton(6, 20, true);
      try {
        await GL.cargarContexto(true);
      } catch (e) {
        el.innerHTML = GL.error(e && e.message, 'triangle-alert', 'el inicio');
        iniciarIconos();
        return;
      }
      if (GL.esAdmin()) await renderAdmin(el);
      else await renderJugador(el);
    }
  };

  /* ---------- Utilidades compartidas ---------- */

  function jornadaDe(partido) {
    const lista = (GL.ctx.jornadas || []).filter(j =>
      Number(j.numero) === Number(partido.jornada) &&
      (!partido.grupo_id || !j.grupo_id || j.grupo_id === partido.grupo_id));
    return lista.find(j => fechaJornada(j)) || lista[0] || null;
  }

  function fechaJornada(jornada) {
    if (!jornada) return null;
    const valor = jornada.fecha_inicio || jornada.hora_limite || jornada.fecha || null;
    if (!valor) return null;
    const d = new Date(valor);
    return isNaN(d.getTime()) ? null : d;
  }

  function textoFecha(instante) {
    if (!instante) return 'Por programar';
    const p = GL.partesEnZona(instante, CONFIG.ZONA_REFERENCIA);
    const dos = n => String(n).padStart(2, '0');
    return GL.fechaLarga(instante) + ' · ' + dos(p.hora) + ':' + dos(p.minuto) +
      ' (' + CONFIG.ZONA_REFERENCIA + ')';
  }

  function instanteActualizacion(p) {
    const d = new Date(p.updated_at || p.created_at || 0);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function acceso(id, iconoNombre, etiqueta, detalle) {
    return '<a class="ini-acceso" href="#' + esc(id) + '">' +
      '<span class="ini-acceso-ico">' + icono(iconoNombre, 20) + '</span>' +
      '<span><strong>' + esc(etiqueta) + '</strong><small>' + esc(detalle) + '</small></span>' +
      icono('chevron-right', 16) + '</a>';
  }

  function tarjetaPartido(p, jugadorId, instante, esProximo) {
    const soyLocal = p.local_id === jugadorId;
    const rivalId = soyLocal ? p.visitante_id : p.local_id;
    const rival = GL.jugador(rivalId) || {};
    const jornada = jornadaDe(p);
    const cuando = instante || fechaJornada(jornada);
    const res = GL.resultado(p);
    const gf = soyLocal ? res.gf : res.gc;
    const gc = soyLocal ? res.gc : res.gf;
    const desenlace = res.pendiente
      ? (cuando ? 'Programado' : 'Pendiente de programación')
      : (gf > gc ? 'Victoria' : gf < gc ? 'Derrota' : 'Empate');
    const tono = res.pendiente ? 'neutral' : gf > gc ? 'green' : gf < gc ? 'red' : 'blue';
    return '<article class="ini-partido">' +
      '<div class="ini-partido-cab">' +
        '<span class="badge ' + tono + '">' + icono(res.pendiente ? 'clock' : 'circle-check', 13) +
          esc(desenlace) + '</span>' +
        '<span class="ini-partido-jornada">Jornada ' + Number(p.jornada) + '</span>' +
      '</div>' +
      '<div class="ini-partido-rival">' +
        GL.avatarHTML(rival, 'avatar', 42) +
        '<div><strong>' + esc(GL.nombreJugador(rivalId)) + '</strong>' +
        '<small>' + GL.banderaHTML(rival.pais, 14) + ' ' +
          esc(GL.nombrePais(rival.pais) || 'Sin país') + '</small></div>' +
        (res.pendiente ? '' : '<span class="ini-marcador">' + gf + ' : ' + gc + '</span>') +
      '</div>' +
      '<p class="ini-partido-fecha">' + icono('calendar-days', 14) + ' ' +
        esc(esProximo ? textoFecha(cuando) : (cuando ? GL.fechaLarga(cuando) : 'Sin fecha asignada')) +
      '</p>' +
    '</article>';
  }

  /* Resumen compacto de la última jornada cerrada. Se calcula con EST y no
     duplica lógica: si EST no está disponible, el bloque simplemente se omite. */
  function resumenJornadaHTML(grupo, partidos) {
    if (!grupo || typeof EST === 'undefined' || !EST || typeof EST.calcularInformeJornada !== 'function') return '';
    const torneo = GL.torneo();
    const cerradas = (GL.ctx.jornadas || [])
      .filter(j => j.grupo_id === grupo.id && j.estado === 'cerrada')
      .map(j => Number(j.numero)).filter(Number.isFinite);
    if (!cerradas.length) return '';
    const jornada = Math.max.apply(null, cerradas);
    const informe = EST.calcularInformeJornada(partidos || [], {
      torneoId: torneo && torneo.id,
      grupoId: grupo.id,
      jornada,
      jugadores: typeof GL.jugadores === 'function' ? GL.jugadores(grupo.id) : [],
      estadoJornada: 'cerrada'
    });
    if (!informe.resumen.partidos && !informe.resumen.partidosAdministrativos) return '';
    const r = informe.resumen;
    const lider = ((typeof GL.clasificacion === 'function' ? GL.clasificacion(grupo.id) : []) || [])[0] || null;
    const destacado = informe.jugadorDestacado;
    const kpi = (valor, etiqueta) =>
      '<div class="ea-kpi"><strong>' + esc(valor) + '</strong><small>' + esc(etiqueta) + '</small></div>';
    return '<section class="card ini-bloque ea-inicio-resumen" aria-labelledby="ea-ini-resumen">' +
      '<div class="ea-resumen-cab">' +
        '<h2 id="ea-ini-resumen">' + icono('chart-no-axes-column-increasing', 18) +
          'Resumen de jornada · Grupo ' + esc(GL.letraGrupo(grupo)) + '</h2>' +
        '<a href="#estadisticas">Ver informe completo</a>' +
      '</div>' +
      '<div class="ea-resumen-compacto">' +
        kpi('J' + jornada, 'Última cerrada') +
        kpi(lider ? GL.signo(lider.dif) : '—', 'DG tabla (líder)') +
        kpi(r.golesReales, 'Goles reales') +
        kpi(r.vallas, 'Vallas invictas') +
        kpi(destacado ? destacado.nombre : '—', 'Jugador destacado') +
      '</div>' +
      '<p class="ea-nota">El DG se toma sin recalcular de la clasificación oficial (PTS → DG → GF). ' +
        'El detalle por jornada está en el informe completo.</p>' +
    '</section>';
  }

  /* ---------- Panel del jugador ---------- */

  async function renderJugador(el) {
    const usuario = Auth.usuario;
    const perfil = Auth.jugador || null;
    const jugador = (GL.ctx.jugadores || []).find(j => perfil && j.id === perfil.id) || perfil;

    if (!jugador || (usuario && perfil && jugador.id !== perfil.id)) {
      el.innerHTML = '<div class="ini-pantalla">' + GL.vacio(
        'Tu cuenta todavía no tiene un jugador vinculado.',
        'user-round-plus',
        '<a class="btn" href="#perfil">' + icono('user', 16) + 'Ir a Mi Perfil</a>',
        'Cuando el administrador complete tu perfil, acá vas a ver tus partidos y tus estadísticas.'
      ) + '</div>';
      iniciarIconos();
      return;
    }

    const id = jugador.id;
    const grupo = GL.grupoDeJugador(id);
    const fila = grupo ? (GL.clasificacion(grupo.id) || []).find(c => c.jugador_id === id) : null;
    const posicion = grupo ? GL.posicion(id, grupo.id) : null;
    const torneo = GL.torneo();

    const partidos = await GL.partidos(torneo ? { torneo_id: torneo.id } : {});
    const mios = partidos.filter(p => p.local_id === id || p.visitante_id === id);
    /* Criterio del módulo Perfil: jornada descendente y fecha de actualización
       como desempate. No se inventa una fecha en public.partidos. */
    const jugados = mios.filter(p => p.estado !== 'pendiente')
      .sort((a, b) => Number(b.jornada) - Number(a.jornada) ||
        instanteActualizacion(b) - instanteActualizacion(a));
    const pendientes = mios.filter(p => p.estado === 'pendiente');
    const conFecha = pendientes.map(p => ({ p, instante: fechaJornada(jornadaDe(p)) }))
      .filter(x => x.instante);
    const programados = conFecha.filter(x => x.instante.getTime() >= Date.now())
      .sort((a, b) => a.instante - b.instante);
    const sinFecha = pendientes.filter(p => !fechaJornada(jornadaDe(p)));
    const proximo = programados[0] || null;
    const ultimo = jugados[0] || null;

    const estadisticas = fila
      ? [
          ['PJ', Number(fila.pj) || 0, 'Partidos jugados'],
          ['PG', Number(fila.pg) || 0, 'Victorias'],
          ['PE', Number(fila.pe) || 0, 'Empates'],
          ['PP', Number(fila.pp) || 0, 'Derrotas'],
          ['GF', Number(fila.gf) || 0, 'Goles a favor'],
          ['GC', Number(fila.gc) || 0, 'Goles en contra'],
          ['DIF', GL.signo(fila.dif), 'Diferencia de goles'],
          ['PTS', Number(fila.pts) || 0, 'Puntos']
        ]
      : [];

    const estadoTorneo = jugador.suspendido === true
      ? 'Suspendido'
      : (jugador.activo === false ? 'Inactivo' : 'Participando');

    el.innerHTML = '<div class="ini-pantalla">' +
      '<header class="ini-hero card">' +
        '<div class="ini-hero-id">' +
          GL.avatarHTML(jugador, 'avatar ini-avatar', 76) +
          '<div>' +
            '<p class="ini-eyebrow">' + icono('house', 14) + 'Panel principal</p>' +
            '<h1>' + esc(jugador.nombre_usuario || 'Jugador') + '</h1>' +
            '<p class="ini-hero-sub">' + GL.banderaHTML(jugador.pais, 16) + ' ' +
              esc(GL.nombrePais(jugador.pais) || 'Sin país') + '</p>' +
            '<div class="ini-hero-chips">' +
              GL.badge(grupo ? 'Grupo ' + esc(GL.letraGrupo(grupo)) : 'Sin grupo', 'gold', 'users') +
              GL.badge(posicion ? 'Puesto ' + posicion : 'Sin posición', 'neutral', 'trophy') +
              GL.badge(estadoTorneo, estadoTorneo === 'Participando' ? 'green' : 'orange', 'circle-dot') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ini-hero-torneo">' +
          '<span>' + icono('trophy', 15) + ' ' + esc(torneo ? torneo.nombre || CONFIG.NOMBRE_LIGA : CONFIG.NOMBRE_LIGA) + '</span>' +
          '<small>' + esc(torneo ? torneo.temporada || 'Temporada activa' : 'Sin torneo activo') + '</small>' +
        '</div>' +
      '</header>' +

      '<div class="ini-columnas">' +
        '<section class="card ini-bloque" aria-labelledby="ini-ultimo">' +
          '<h2 id="ini-ultimo" class="ini-titulo">' + icono('history', 18) + 'Último partido</h2>' +
          (ultimo
            ? tarjetaPartido(ultimo, id, null, false)
            : GL.vacio('Todavía no disputaste ningún partido.', 'clock', null,
                'Cuando se registre un resultado, va a aparecer acá.')) +
        '</section>' +

        '<section class="card ini-bloque" aria-labelledby="ini-proximo">' +
          '<h2 id="ini-proximo" class="ini-titulo">' + icono('calendar-clock', 18) + 'Próximo partido</h2>' +
          (proximo
            ? tarjetaPartido(proximo.p, id, proximo.instante, true)
            : (sinFecha.length
                ? GL.vacio('Tenés ' + sinFecha.length + ' partido(s) sin programar.', 'calendar-clock', null,
                    'La jornada todavía no tiene fecha asignada; no es un encuentro programado.')
                : GL.vacio('No hay próximos encuentros registrados.', 'calendar-x', null,
                    'Cuando se programe un partido con fecha, va a aparecer acá.'))) +
        '</section>' +
      '</div>' +

      '<section class="card ini-bloque" aria-labelledby="ini-stats">' +
        '<h2 id="ini-stats" class="ini-titulo">' + icono('chart-no-axes-column-increasing', 18) + 'Mis estadísticas</h2>' +
        (fila
          ? '<div class="ini-stats">' + estadisticas.map(([sigla, valor, etiqueta]) =>
              '<div class="ini-stat"><span>' + esc(sigla) + '</span><strong>' + esc(valor) + '</strong><small>' + esc(etiqueta) + '</small></div>'
            ).join('') + '</div>'
          : GL.vacio('Todavía no hay estadísticas para este jugador.', 'bar-chart-3', null,
              'La clasificación se actualiza cuando se cargan resultados.')) +
      '</section>' +

      resumenJornadaHTML(grupo, partidos) +

      '<section class="card ini-bloque" aria-labelledby="ini-accesos">' +
        '<h2 id="ini-accesos" class="ini-titulo">' + icono('grid-2x2', 18) + 'Accesos rápidos</h2>' +
        '<div class="ini-accesos">' +
          acceso('tabla', 'layout-list', 'Tabla de posiciones', 'Clasificación del torneo') +
          acceso('calendario', 'calendar-days', 'Calendario', 'Fechas y horarios') +
          acceso('fixture', 'calendar', 'Cuadro de partidos', 'Cruces y jornadas') +
          acceso('estadisticas', 'bar-chart-2', 'Estadísticas', 'Números de la jornada') +
        '</div>' +
      '</section>' +
    '</div>';
    iniciarIconos();
  }

  /* ---------- Panel del administrador ---------- */

  async function renderAdmin(el) {
    if (!(await GL.asegurarAdmin(el))) { iniciarIconos(); return; }
    const torneo = GL.torneo();
    if (!torneo) {
      el.innerHTML = '<div class="ini-pantalla">' + GL.vacio(
        'No hay torneo activo.',
        'trophy',
        '<a class="btn" href="#administracion">' + icono('plus', 16) + 'Crear torneo</a>',
        'Creá el torneo desde Administración para ver el estado general.'
      ) + '</div>';
      iniciarIconos();
      return;
    }

    const partidos = await GL.partidos({ torneo_id: torneo.id });
    const jugadores = GL.ctx.jugadores || [];
    const grupos = GL.ctx.grupos || [];
    const miembros = GL.ctx.miembros || [];
    const jornadas = (GL.ctx.jornadas || []).filter(j => !j.virtual);
    const jugados = partidos.filter(p => p.estado !== 'pendiente');
    const pendientes = partidos.filter(p => p.estado === 'pendiente');
    const sinFechaJornadas = jornadas.filter(j => !fechaJornada(j));
    const jornadasPendientes = jornadas.filter(j => j.estado !== 'cerrada');

    const recientes = jugados.slice().sort((a, b) => instanteActualizacion(b) - instanteActualizacion(a)).slice(0, 5);
    const proximos = pendientes.map(p => ({ p, instante: fechaJornada(jornadaDe(p)) }))
      .filter(x => x.instante && x.instante.getTime() >= Date.now())
      .sort((a, b) => a.instante - b.instante).slice(0, 4);
    const actividad = recientes.length
      ? instanteActualizacion(recientes[0])
      : Math.max(0, ...(GL.ctx.clasificacion || []).map(c => instanteActualizacion(c)));
    const sinGrupo = (typeof GL.jugadoresSinGrupo === 'function' ? GL.jugadoresSinGrupo() : []);
    const sinTelefono = jugadores.filter(j => !j.telefono);
    const grupoResumen = typeof GL.grupoInicial === 'function' ? GL.grupoInicial() : grupos[0];
    const resumenJornada = resumenJornadaHTML(grupoResumen, partidos);

    const alertas = [];
    if (sinGrupo.length) alertas.push({ ico: 'user-x', texto: sinGrupo.length + ' jugador(es) sin grupo asignado.', link: 'administracion' });
    if (sinTelefono.length) alertas.push({ ico: 'phone-off', texto: sinTelefono.length + ' jugador(es) sin teléfono registrado.', link: 'administracion' });
    if (sinFechaJornadas.length) alertas.push({ ico: 'calendar-clock', texto: sinFechaJornadas.length + ' jornada(s) sin fecha programada.', link: 'jornadas' });
    if (partidos.length && !jugados.length) alertas.push({ ico: 'clipboard-check', texto: 'Todavía no hay resultados cargados en este torneo.', link: 'resultados' });

    const kpi = (valor, etiqueta, ico) =>
      '<div class="ini-kpi"><span class="ini-kpi-ico">' + icono(ico, 18) + '</span>' +
      '<strong>' + esc(valor) + '</strong><small>' + esc(etiqueta) + '</small></div>';

    const listaPartido = (p, conFecha) => {
      const j = jornadaDe(p);
      return '<li>' + icono(conFecha ? 'calendar-days' : 'clock', 14) +
        '<span>J' + Number(p.jornada) + ' · ' + esc(GL.nombreJugador(p.local_id)) +
        ' vs ' + esc(GL.nombreJugador(p.visitante_id)) + '</span>' +
        '<small>' + esc(conFecha ? textoFecha(fechaJornada(j)) : 'Por programar') + '</small></li>';
    };

    el.innerHTML = '<div class="ini-pantalla">' +
      '<header class="ini-hero card ini-hero-admin">' +
        '<div class="ini-hero-id">' +
          '<span class="ini-avatar ini-avatar-admin">' + icono('shield', 32) + '</span>' +
          '<div>' +
            '<p class="ini-eyebrow">' + icono('layout-dashboard', 14) + 'Panel principal · Administración</p>' +
            '<h1>' + esc(torneo.nombre || CONFIG.NOMBRE_LIGA) + '</h1>' +
            '<p class="ini-hero-sub">' + esc(torneo.temporada || 'Temporada activa') + '</p>' +
            '<p class="ini-hero-sub">' + icono('activity', 13) +
              esc(actividad ? 'Última actividad: ' + GL.fechaLarga(actividad) : 'Sin actividad registrada') +
            '</p>' +
          '</div>' +
        '</div>' +
        '<div class="ini-hero-torneo">' + GL.badge('ADMINISTRADOR', 'gold', 'shield') + '</div>' +
      '</header>' +

      '<section class="ini-kpis" aria-label="Resumen del torneo">' +
        kpi(jugadores.length, 'Jugadores registrados', 'users') +
        kpi(grupos.length, 'Grupos', 'users-round') +
        kpi(miembros.length, 'Participantes asignados', 'user-check') +
        kpi(jugados.length, 'Partidos disputados', 'circle-check') +
        kpi(pendientes.length, 'Partidos pendientes', 'clock') +
        kpi(jornadasPendientes.length, 'Jornadas pendientes', 'calendar-days') +
        kpi(jornadas.filter(j => fechaJornada(j)).length, 'Jornadas con fecha', 'calendar-clock') +
      '</section>' +

      resumenJornada +

      '<div class="ini-columnas">' +
        '<section class="card ini-bloque" aria-labelledby="ini-proximos">' +
          '<h2 id="ini-proximos" class="ini-titulo">' + icono('calendar-clock', 18) + 'Próximos encuentros</h2>' +
          (proximos.length
            ? '<ul class="ini-lista">' + proximos.map(x => listaPartido(x.p, true)).join('') + '</ul>'
            : GL.vacio('No hay encuentros futuros con fecha.', 'calendar-x', null,
                'Programá fechas de jornada para ver los próximos partidos.')) +
        '</section>' +

        '<section class="card ini-bloque" aria-labelledby="ini-recientes">' +
          '<h2 id="ini-recientes" class="ini-titulo">' + icono('history', 18) + 'Resultados recientes</h2>' +
          (recientes.length
            ? '<ul class="ini-lista">' + recientes.map(p => {
                const r = GL.resultado(p);
                return '<li>' + icono('flag', 14) +
                  '<span>J' + Number(p.jornada) + ' · ' + esc(GL.nombreJugador(p.local_id)) +
                  ' ' + esc(r.texto) + ' ' + esc(GL.nombreJugador(p.visitante_id)) + '</span>' +
                  '<small>' + esc(GL.fechaLarga(p.updated_at || p.created_at)) + '</small></li>';
              }).join('') + '</ul>'
            : GL.vacio('Todavía no hay resultados registrados.', 'clipboard-check', null,
                'Los resultados que se carguen aparecerán acá.')) +
        '</section>' +
      '</div>' +

      '<div class="ini-columnas">' +
        '<section class="card ini-bloque" aria-labelledby="ini-alertas">' +
          '<h2 id="ini-alertas" class="ini-titulo">' + icono('triangle-alert', 18) + 'Alertas del torneo</h2>' +
          (alertas.length
            ? '<ul class="ini-alertas">' + alertas.map(a =>
                '<li>' + icono(a.ico, 15) + '<span>' + esc(a.texto) + '</span>' +
                '<a href="#' + esc(a.link) + '">Abrir</a></li>').join('') + '</ul>'
            : GL.vacio('No hay alertas pendientes.', 'circle-check-big', null,
                'Las alertas surgen de datos reales: grupos, teléfonos, fechas y resultados.')) +
        '</section>' +

        '<section class="card ini-bloque" aria-labelledby="ini-accesos-admin">' +
          '<h2 id="ini-accesos-admin" class="ini-titulo">' + icono('grid-2x2', 18) + 'Accesos rápidos</h2>' +
          '<div class="ini-accesos">' +
            acceso('administracion', 'users', 'Jugadores y equipos', 'Alta, grupos y disciplina') +
            acceso('jornadas', 'flag', 'Jornadas', 'Fechas y cierre') +
            acceso('fixture', 'calendar', 'Cuadro de partidos', 'Organización del torneo') +
            acceso('resultados', 'clipboard-check', 'Resultados', 'Carga y correcciones') +
            acceso('dashboard-admin', 'layout-dashboard', 'Centro de control', 'Vista completa del torneo') +
          '</div>' +
        '</section>' +
      '</div>' +
    '</div>';
    iniciarIconos();
  }

  Modulos.inicio = Mod;
})();
