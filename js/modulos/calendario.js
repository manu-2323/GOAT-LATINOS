/* =====================================================================
   MÓDULO 06 — Calendario y programación
   =====================================================================
   Calendario mensual, jornadas abiertas/cerradas, pendientes, próximos
   enfrentamientos, fechas límite, horarios internacionales e historial.
   Los horarios se convierten con Intl.DateTimeFormat; la disponibilidad
   nunca se inventa: si no hay registro oficial se muestra "Sin registrar".
   El contacto por WhatsApp se obtiene mediante una RPC autorizada.
   ===================================================================== */
(function () {
  const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const SIN_DISPONIBILIDAD = 'Sin registrar';

  const Mod = {
    titulo: 'Calendario y programación',
    anio: null,
    mes: null,
    grupoId: null,
    zona: null,
    datos: null,
    partidos: [],
    contactos: {},
    contactosError: false,

    setTab(tab) { Mod.vista = tab || 'resumen'; },

    async render(el) {
      el.innerHTML = GL.skeleton(8);
      try {
        await GL.cargarContexto(true);
        const torneo = GL.torneo();
        if (!torneo) {
          el.innerHTML = GL.vacio('Todavía no hay un torneo activo.', 'trophy', null);
          iniciarIconos();
          return;
        }
        const grupos = GL.grupos();
        if (!grupos.length) {
          el.innerHTML = GL.vacio('Todavía no hay grupos configurados.', 'users', null);
          iniciarIconos();
          return;
        }
        const miGrupo = GL.grupoDeJugador(Auth.jugador && Auth.jugador.id);
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) {
          Mod.grupoId = (miGrupo && miGrupo.id) || grupos[0].id;
        }
        const zonaSesion = GL.zonaJugador(Auth.jugador) || CONFIG.ZONA_REFERENCIA;
        Mod.zona = GL._zonaResuelta(Mod.zona) || zonaSesion;
        if (Mod.anio === null || Mod.mes === null) {
          const ahora = GL.partesEnZona(new Date(), Mod.zona);
          Mod.anio = ahora.year;
          Mod.mes = ahora.month - 1;
        }

        const todos = await GL.partidos({ torneo_id: torneo.id });
        Mod.partidos = todos.filter(p => p.grupo_id === Mod.grupoId);
        const datos = construirDatos(torneo, grupos);
        Mod.datos = datos;

        const ids = [];
        Mod.partidos.forEach(p => { ids.push(p.local_id, p.visitante_id); });
        await cargarContactos(ids, datos.admin);

        el.innerHTML = htmlVista(datos);
        enlazarVista(el, datos);
        el.querySelector('#calendario-print').innerHTML = htmlImprimir(datos);
      } catch (e) {
        console.error('[calendario]', e);
        el.innerHTML = GL.error(e.message, null, 'el calendario');
      }
      iniciarIconos();
    }
  };

  /* --------------------------- Datos --------------------------- */

  function aInstante(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
    const texto = String(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      return GL.momentoZona(texto, '12:00', CONFIG.ZONA_REFERENCIA) ||
             new Date(texto + 'T12:00:00Z');
    }
    const d = new Date(texto);
    return isNaN(d.getTime()) ? null : d;
  }

  function fechaCompletaEnZona(instante, zona) {
    if (!instante) return 'Por programar';
    const d = instante instanceof Date ? instante : new Date(instante);
    if (isNaN(d.getTime())) return 'Por programar';
    const p = GL.partesEnZona(d, zona);
    const dos = x => String(x).padStart(2, '0');
    return dos(p.day) + '/' + dos(p.month) + '/' + p.year + ' ' +
           dos(p.hour) + ':' + dos(p.minute);
  }

  function construirDatos(torneo, grupos) {
    const total = Number(torneo.total_jornadas) || CONFIG.JORNADAS_FASE_REGULAR;
    const admin = GL.esAdmin();
    const yoId = Auth.jugador && Auth.jugador.id;
    const grupo = GL.grupo(Mod.grupoId);

    const jornadas = GL.ctx.jornadas
      .filter(j => j.grupo_id === Mod.grupoId && Number(j.numero) <= total)
      .map(j => {
        const inicio = aInstante(j.fecha_inicio);
        const limite = aInstante(j.hora_limite);
        const fecha = inicio || limite || aInstante(j.fecha);
        const p = fecha ? GL.partesEnZona(fecha, Mod.zona) : null;
        const partidos = Mod.partidos.filter(x => Number(x.jornada) === Number(j.numero));
        return Object.assign({}, j, {
          numero: Number(j.numero),
          inicio,
          limite,
          fecha,
          anio: p ? p.year : null,
          mes: p ? p.month - 1 : null,
          dia: p ? p.day : null,
          partidos,
          pendientes: partidos.filter(x => x.estado === 'pendiente').length,
          abierta: j.estado !== 'cerrada'
        });
      })
      .sort((a, b) => a.numero - b.numero);

    const mapa = {};
    jornadas.forEach(j => { mapa[j.numero] = j; });

    const mios = Mod.partidos.filter(p => p.local_id === yoId || p.visitante_id === yoId);
    const foco = admin || !mios.length ? Mod.partidos : mios;
    const proximos = foco
      .filter(p => p.estado === 'pendiente')
      .sort((a, b) => a.jornada - b.jornada)
      .slice(0, 6);
    const historial = foco
      .filter(p => p.estado !== 'pendiente')
      .sort((a, b) => b.jornada - a.jornada)
      .slice(0, 8);

    const limites = jornadas
      .filter(j => j.limite)
      .sort((a, b) => a.limite - b.limite);

    return {
      torneo,
      grupos,
      grupo,
      admin,
      yoId,
      total,
      jornadas,
      mapa,
      proximos,
      historial,
      limites,
      abiertas: jornadas.filter(j => j.abierta).length,
      cerradas: jornadas.filter(j => !j.abierta).length,
      pendientes: jornadas.reduce((n, j) => n + j.pendientes, 0),
      programadas: jornadas.filter(j => j.inicio || j.limite || j.fecha).length,
      conflictos: detectarConflictos(jornadas),
      jugadores: GL.jugadores(Mod.grupoId),
      siguiente: proximos[0] || null
    };
  }

  function detectarConflictos(jornadas) {
    const lista = [];
    jornadas.forEach(j => {
      if (j.inicio && j.limite && j.limite <= j.inicio) {
        lista.push({
          numero: j.numero,
          texto: 'La jornada ' + j.numero + ' cierra antes de abrir. Corregí el horario.'
        });
      }
    });
    const conRango = jornadas
      .filter(j => j.inicio && j.limite && j.limite > j.inicio)
      .sort((a, b) => a.inicio - b.inicio);
    for (let i = 1; i < conRango.length; i++) {
      const anterior = conRango[i - 1];
      const actual = conRango[i];
      if (actual.inicio < anterior.limite) {
        lista.push({
          numero: actual.numero,
          texto: 'La jornada ' + actual.numero + ' se superpone con la jornada ' +
                 anterior.numero + '. Revisá aperturas y cierres.'
        });
      }
    }
    return lista;
  }

  async function cargarContactos(ids, admin) {
    const limpios = Array.from(new Set(ids.filter(Boolean)));
    Mod.contactos = {};
    Mod.contactosError = false;
    if (!limpios.length) return;
    if (admin || typeof sb === 'undefined' || !sb) {
      limpios.forEach(id => {
        const j = GL.jugador(id);
        if (j) Mod.contactos[id] = j;
      });
      return;
    }
    try {
      const { data, error } = await sb.rpc('gl_contactos_whatsapp', {
        p_jugador_ids: limpios
      });
      if (error) throw error;
      (data || []).forEach(r => {
        Mod.contactos[r.jugador_id] = {
          id: r.jugador_id,
          pais: r.pais,
          telefono: r.telefono,
          nombre_usuario: GL.nombreJugador(r.jugador_id)
        };
      });
    } catch (e) {
      Mod.contactosError = true;
      console.warn('[calendario] No se pudo consultar el contacto por WhatsApp:', e.message);
    }
  }

  function linkContacto(jugadorId) {
    const base = GL.jugador(jugadorId) || {};
    const contacto = Mod.contactos[jugadorId] || {};
    const datos = Object.assign({}, contacto, {
      nombre_usuario: base.nombre_usuario || contacto.nombre_usuario || GL.nombreJugador(jugadorId)
    });
    if (!contacto.telefono) return '';
    return GL.linkWhatsapp(datos, datos.nombre_usuario);
  }

  /* --------------------------- Vista --------------------------- */

  function htmlVista(d) {
    const grupoTexto = d.grupo ? 'Grupo ' + GL.letraGrupo(d.grupo) : 'Todos los grupos';
    return '<div class="seccion-head"><div class="seccion-titulo">' +
        '<h2>Calendario y programación</h2>' +
        '<p>Temporada ' + esc(d.torneo.temporada || '—') + ' · ' + esc(grupoTexto) +
        ' · ' + esc(GL.etiquetaZona(Mod.zona)) + '</p></div>' +
      '<div class="seccion-acciones">' +
        '<button type="button" class="btn sm sec" data-cal-pdf>' +
          icono('file-down', 15) + 'Exportar PDF</button>' +
        '<button type="button" class="btn sm sec" data-cal-enlaces>' +
          icono('link', 15) + 'Enlaces de calendario</button>' +
        '<button type="button" class="btn sm sec" data-cal-ics>' +
          icono('download', 15) + 'Descargar .ics</button>' +
      '</div></div>' +

      '<div class="cal-metricas grid cuatro">' +
        metrica('calendar-check', d.abiertas, 'Jornadas abiertas', 'cal-verde') +
        metrica('lock-keyhole', d.cerradas, 'Jornadas cerradas', 'cal-rojo') +
        metrica('clock', d.pendientes, 'Partidos pendientes', 'cal-dorado') +
        metrica('calendar-clock', d.programadas + '/' + d.total, 'Jornadas con fecha', 'cal-azul') +
      '</div>' +

      '<div class="tabs tabs-grupos">' + d.grupos.map(g =>
        '<button type="button" class="tab' + (g.id === Mod.grupoId ? ' activo' : '') +
        '" data-cal-grupo="' + esc(g.id) + '">Grupo ' + esc(GL.letraGrupo(g)) + '</button>').join('') + '</div>' +

      '<div class="cal-controles card tight">' +
        '<div class="cal-nav-mes">' +
          '<button type="button" class="btn-icon" data-cal-mes="-1" aria-label="Mes anterior">' +
            icono('chevron-left', 18) + '</button>' +
          '<strong>' + esc(nombreMes(Mod.anio, Mod.mes)) + '</strong>' +
          '<button type="button" class="btn-icon" data-cal-mes="1" aria-label="Mes siguiente">' +
            icono('chevron-right', 18) + '</button>' +
          '<button type="button" class="btn sm sec" data-cal-hoy>' + icono('rotate-ccw', 14) + 'Hoy</button>' +
        '</div>' +
        '<label class="cal-zona"><span>' + icono('globe', 14) + 'Zona horaria</span>' +
          '<select class="input" id="cal-zona">' + opcionesZona(Mod.zona) + '</select></label>' +
      '</div>' +

      '<div class="cal-principal">' +
        htmlMes(d) + htmlLateral(d) +
      '</div>' +

      '<div class="cal-bloques">' +
        htmlProximos(d) + htmlPendientes(d) +
      '</div>' +
      '<div class="cal-bloques">' +
        htmlHistorial(d) + htmlDisponibilidad(d) +
      '</div>' +
      (d.admin ? htmlAdmin(d) : '') +
      '<div id="calendario-print" class="cal-print"></div>';
  }

  function metrica(ico, valor, etiqueta, clase) {
    return '<div class="card tight cal-metrica ' + clase + '">' +
      '<div class="metrica"><span class="ico">' + icono(ico, 20) + '</span>' +
      '<div><div class="valor">' + esc(valor) + '</div>' +
      '<div class="label">' + esc(etiqueta) + '</div></div></div></div>';
  }

  function nombreMes(anio, mes) {
    const texto = MESES[mes] || '';
    return texto.charAt(0).toUpperCase() + texto.slice(1) + ' ' + anio;
  }

  function opcionesZona(actual) {
    const lista = ZONAS_HORARIAS_DISPONIBLES.slice();
    if (!lista.some(x => x.zona === actual)) {
      lista.unshift({ pais: '', ciudad: GL.etiquetaZona(actual), zona: actual });
    }
    return lista.map(x =>
      '<option value="' + esc(x.zona) + '"' + (x.zona === actual ? ' selected' : '') + '>' +
      esc(x.ciudad + (x.pais ? ' — ' + GL.nombrePais(x.pais) : '')) + '</option>').join('');
  }

  function htmlMes(d) {
    const celdas = celdasMes(Mod.anio, Mod.mes, d.jornadas);
    return '<section class="card cal-card-mes">' +
      '<div class="cal-card-head"><div><h3>' + esc(nombreMes(Mod.anio, Mod.mes)) + '</h3>' +
        '<p>Jornadas programadas en tu zona horaria</p></div>' +
        GL.badge(d.grupo ? 'Grupo ' + GL.letraGrupo(d.grupo) : 'Liga', 'gold', 'users') + '</div>' +
      '<div class="cal-semana">' + DIAS_SEMANA.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' +
      '<div class="cal-mes">' + celdas.map(c => {
        const eventos = d.jornadas.filter(j =>
          j.anio === c.anio && j.mes === c.mes && j.dia === c.dia);
        return '<div class="cal-celda' + (c.fuera ? ' fuera' : '') +
            (c.hoy ? ' hoy' : '') + '">' +
          '<span class="cal-dia">' + c.dia + '</span>' +
          '<div class="cal-eventos">' + eventos.slice(0, 2).map(j =>
            '<button type="button" class="cal-evento ' + (j.abierta ? 'abierta' : 'cerrada') +
            '" data-cal-jornada="' + j.numero + '" title="Ver jornada ' + j.numero + '">' +
            'J' + j.numero + (j.pendientes ? '<small>' + j.pendientes + ' pend.</small>' : '') +
            '</button>').join('') +
            (eventos.length > 2 ? '<span class="cal-mas">+' + (eventos.length - 2) + '</span>' : '') +
          '</div></div>';
      }).join('') + '</div>' +
      '<div class="cal-leyenda">' +
        '<span><i class="cal-punto abierta"></i>Abierta</span>' +
        '<span><i class="cal-punto cerrada"></i>Cerrada</span>' +
        '<span><i class="cal-punto programa"></i>Sin fecha asignada: ' +
          (d.total - d.programadas) + '</span>' +
      '</div>' +
      '<p class="nota-pie">' + esc(GL.notaHorarios()) + '</p></section>';
  }

  function celdasMes(anio, mes, jornadas) {
    const primerDia = new Date(Date.UTC(anio, mes, 1));
    const offset = (primerDia.getUTCDay() + 6) % 7;
    const total = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const hoy = GL.partesEnZona(new Date(), Mod.zona);
    const celdas = [];
    for (let i = offset; i > 0; i--) {
      const d = new Date(Date.UTC(anio, mes, 1 - i));
      celdas.push({ anio: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate(), fuera: true });
    }
    for (let dia = 1; dia <= total; dia++) {
      celdas.push({
        anio, mes, dia, fuera: false,
        hoy: hoy.year === anio && hoy.month - 1 === mes && hoy.day === dia
      });
    }
    while (celdas.length % 7) {
      const ultima = celdas[celdas.length - 1];
      const d = new Date(Date.UTC(ultima.anio, ultima.mes, ultima.dia + 1));
      celdas.push({ anio: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate(), fuera: true });
    }
    return celdas;
  }

  function htmlLateral(d) {
    const textoTiempo = j => {
      const mins = Math.round((j.limite.getTime() - Date.now()) / 60000);
      if (mins < 0) return 'Venció';
      if (mins < 60) return 'En ' + Math.max(1, mins) + ' min';
      if (mins < 1440) return 'En ' + Math.round(mins / 60) + ' h';
      return 'En ' + Math.round(mins / 1440) + ' días';
    };
    const limitesHTML = d.limites.length
      ? d.limites.slice(0, 5).map(j =>
          '<button type="button" class="cal-limite" data-cal-jornada="' + j.numero + '">' +
            '<span><strong>Jornada ' + j.numero + '</strong>' +
            '<small>' + esc(fechaCompletaEnZona(j.limite, Mod.zona)) + '</small></span>' +
            GL.badge(textoTiempo(j), j.limite.getTime() < Date.now() ? 'red' : 'orange') +
          '</button>').join('')
      : '<p class="vacio-mensaje">Todavía no hay fechas límite programadas.</p>';

    const siguienteApertura = d.jornadas.find(j => j.inicio && j.inicio.getTime() > Date.now());
    const horarios = siguienteApertura
      ? fechaCompletaEnZona(siguienteApertura.inicio, Mod.zona) +
        ' · ' + GL.offsetZona(siguienteApertura.inicio, Mod.zona)
      : 'Sin apertura programada';

    return '<aside class="cal-lateral">' +
      '<section class="card tight"><div class="cal-card-head"><h3>Fechas límite</h3>' +
        icono('calendar-clock', 17) + '</div>' + limitesHTML + '</section>' +
      '<section class="card tight"><div class="cal-card-head"><h3>Estado de jornadas</h3>' +
        icono('flag', 17) + '</div>' +
        '<div class="chips">' + GL.badge(d.abiertas + ' abiertas', 'green', 'unlock') +
          GL.badge(d.cerradas + ' cerradas', 'red', 'lock') +
          GL.badge(d.pendientes + ' pendientes', 'orange', 'clock') + '</div>' +
        '<div class="cal-estado-lista">' + d.jornadas.slice(-6).map(j =>
          '<button type="button" data-cal-jornada="' + j.numero + '">' +
            '<span>Jornada ' + j.numero + '</span>' +
            GL.badge(j.abierta ? 'Abierta' : 'Cerrada', j.abierta ? 'green' : 'red') +
          '</button>').join('') + '</div></section>' +
      '<section class="card tight"><div class="cal-card-head"><h3>Horarios internacionales</h3>' +
        icono('globe', 17) + '</div>' +
        '<div class="cal-zona-actual">' + icono('map-pin', 14) +
          esc(GL.etiquetaZona(Mod.zona)) + '</div>' +
        '<div class="cal-horario-linea"><span>Referencia</span><strong>' +
          esc(GL.horarioZonaDetalle(CONFIG.ZONA_REFERENCIA, new Date())) + '</strong></div>' +
        '<div class="cal-horario-linea"><span>Próxima apertura</span><strong>' +
          esc(horarios) + '</strong></div>' +
        '<p class="nota-pie">La zona se toma del perfil de cada jugador. ' +
          'México, Brasil, Chile y Argentina usan la ciudad elegida.</p></section>' +
    '</aside>';
  }

  function htmlProximos(d) {
    const titulo = d.admin ? 'Próximos enfrentamientos del grupo' : 'Mis próximos partidos';
    return '<section class="card"><div class="cal-card-head"><div><h3>' + esc(titulo) + '</h3>' +
      '<p>Fecha, hora local, rival, país y contacto</p></div>' +
      GL.badge(d.proximos.length + ' pendientes', 'orange', 'clock') + '</div>' +
      (d.proximos.length
        ? '<div class="cal-partidos">' + d.proximos.map(p => htmlPartido(p, d, true)).join('') + '</div>'
        : GL.vacio('No hay partidos pendientes en esta vista.', 'calendar-check', null)) +
      '</section>';
  }

  function htmlPartido(p, d, conRival) {
    const local = GL.jugador(p.local_id) || {};
    const visita = GL.jugador(p.visitante_id) || {};
    const esMio = p.local_id === d.yoId || p.visitante_id === d.yoId;
    const soyLocal = p.local_id === d.yoId;
    const rival = conRival && esMio ? (soyLocal ? visita : local) : null;
    const j = d.mapa[Number(p.jornada)] || {};
    const cuando = j.inicio
      ? fechaCompletaEnZona(j.inicio, Mod.zona)
      : (j.limite ? 'Límite ' + fechaCompletaEnZona(j.limite, Mod.zona) : 'Por programar');
    const resultado = GL.resultado(p);
    const contactoRival = rival && rival.id ? linkContacto(rival.id) : '';
    const contactoLocal = linkContacto(p.local_id);
    const contactoVisita = linkContacto(p.visitante_id);
    const contacto = rival
      ? (contactoRival || '<span class="cal-sin-contacto">Sin teléfono cargado</span>')
      : ((contactoLocal || '') + (contactoVisita || ''));

    return '<article class="cal-partido">' +
      '<div class="cal-partido-top">' +
        '<span class="badge-jornada">J' + esc(p.jornada) + '</span>' +
        (p.estado === 'pendiente' ? GL.badge('Pendiente', 'orange', 'clock') : GL.badge(resultado.estado.label,
          resultado.estado.color, resultado.estado.icono)) +
        '<span class="cal-cuando">' + icono('clock', 13) + esc(cuando) + '</span>' +
      '</div>' +
      '<div class="cal-partido-equipos">' +
        '<span' + (soyLocal ? ' class="cal-mio"' : '') + '>' +
          (soyLocal ? icono('home', 13) : '') + esc(GL.nombreJugador(p.local_id)) +
          GL.banderaHTML(local.pais, 14) + '</span>' +
        '<strong class="cal-marcador">' + esc(resultado.texto) + '</strong>' +
        '<span' + (!soyLocal && esMio ? ' class="cal-mio"' : '') + '>' +
          GL.banderaHTML(visita.pais, 14) + esc(GL.nombreJugador(p.visitante_id)) +
          (!soyLocal && esMio ? icono('plane', 13) : '') + '</span>' +
      '</div>' +
      (rival ? '<div class="cal-rival">' + icono('swords', 13) + 'Rival: ' +
          esc(GL.nombreJugador(rival.id)) + ' · ' + esc(GL.nombrePais(rival.pais)) +
          (GL.banderaHTML(rival.pais, 14) || '') + '</div>' : '') +
      '<div class="cal-partido-contacto">' + icono('message-circle', 13) + contacto + '</div>' +
      '<div class="cal-dispo">' + icono('info', 12) + 'Disponibilidad: ' + SIN_DISPONIBILIDAD + '</div>' +
    '</article>';
  }

  function htmlPendientes(d) {
    const filas = d.jornadas.filter(j => j.pendientes);
    return '<section class="card"><div class="cal-card-head"><div><h3>Partidos pendientes por jornada</h3>' +
      '<p>Revisá qué jornadas todavía tienen resultados por cargar</p></div></div>' +
      (filas.length
        ? '<div class="cal-pendientes">' + filas.map(j =>
            '<button type="button" data-cal-jornada="' + j.numero + '">' +
              '<span class="badge-jornada">J' + j.numero + '</span>' +
              '<span><strong>' + j.pendientes + ' pendiente(s)</strong>' +
              '<small>' + esc(j.inicio ? fechaCompletaEnZona(j.inicio, Mod.zona) :
                (j.limite ? 'Límite ' + fechaCompletaEnZona(j.limite, Mod.zona) : 'Sin fecha asignada')) +
              '</small></span>' +
              GL.badge(j.abierta ? 'Abierta' : 'Cerrada', j.abierta ? 'green' : 'red') +
            '</button>').join('') + '</div>'
        : GL.vacio('No hay partidos pendientes en el grupo.', 'circle-check', null)) +
      '</section>';
  }

  function htmlHistorial(d) {
    return '<section class="card"><div class="cal-card-head"><div><h3>Historial de encuentros</h3>' +
      '<p>Últimos resultados registrados en el calendario</p></div>' +
      icono('history', 18) + '</div>' +
      (d.historial.length
        ? '<div class="cal-partidos">' + d.historial.map(p => htmlPartido(p, d, true)).join('') + '</div>'
        : GL.vacio('Todavía no hay encuentros finalizados.', 'history', null)) +
      '</section>';
  }

  function htmlDisponibilidad(d) {
    const aviso = Mod.contactosError
      ? '<p class="nota-pie">No se pudo consultar el contacto por WhatsApp. ' +
        'Verificá que la función segura de calendario esté instalada.</p>'
      : '';
    const lista = d.admin
      ? '<div class="cal-sin-dispo-lista">' + d.jugadores.map(j =>
          '<div>' + GL.avatarHTML(j, 'avatar-sm') + '<span>' + esc(GL.nombreJugador(j.id)) + '</span>' +
          GL.badge(SIN_DISPONIBILIDAD, 'neutral', 'help-circle') +
          (linkContacto(j.id) || '') + '</div>').join('') + '</div>'
      : '<p class="modal-texto">En tus próximos partidos, la disponibilidad figura como ' +
        '<strong>' + SIN_DISPONIBILIDAD + '</strong> porque la liga todavía no cuenta con un registro oficial.</p>';
    return '<section class="card"><div class="cal-card-head"><div><h3>Disponibilidad</h3>' +
      '<p>Estado real de los participantes</p></div>' +
      GL.badge(SIN_DISPONIBILIDAD, 'neutral', 'help-circle') + '</div>' +
      '<div class="cal-aviso">' + icono('info', 14) +
        '<span>No existe un registro oficial de disponibilidad. No se inventan confirmaciones: ' +
        'este dato es informativo hasta que se habilite un sistema de respuesta.</span></div>' +
      lista + aviso + '</section>';
  }

  function htmlAdmin(d) {
    const filas = d.jornadas.map(j =>
      '<tr data-jornada-fila="' + j.numero + '">' +
        '<td><strong>J' + j.numero + '</strong></td>' +
        '<td>' + GL.badge(j.abierta ? 'Abierta' : 'Cerrada', j.abierta ? 'green' : 'red') + '</td>' +
        '<td>' + esc(j.inicio ? fechaCompletaEnZona(j.inicio, CONFIG.ZONA_REFERENCIA) : 'Por programar') + '</td>' +
        '<td>' + esc(j.limite ? fechaCompletaEnZona(j.limite, CONFIG.ZONA_REFERENCIA) : 'Por programar') + '</td>' +
        '<td>' + esc(j.pendientes) + '</td>' +
        '<td class="cal-acciones-admin">' +
          '<button type="button" class="btn sm sec" data-cal-horario="' + j.numero + '">' +
            icono('calendar-clock', 13) + 'Fechas</button>' +
          (j.abierta
            ? '<button type="button" class="btn sm" data-cal-estado="' + j.numero +
              '" data-accion="cerrar">' + icono('lock', 13) + 'Cerrar</button>'
            : '<button type="button" class="btn sm sec" data-cal-estado="' + j.numero +
              '" data-accion="abrir">' + icono('unlock', 13) + 'Abrir</button>') +
          '<button type="button" class="btn-icon" data-cal-jornada="' + j.numero +
            '" aria-label="Ver jornada ' + j.numero + '">' + icono('eye', 15) + '</button>' +
        '</td></tr>').join('');

    return '<section class="card cal-admin"><div class="cal-card-head"><div>' +
      '<h3>Programación de la dirección del torneo</h3>' +
      '<p>Modificar fechas, establecer límites, programar aperturas y cierres</p></div>' +
      GL.badge('Solo administradores', 'red', 'shield') + '</div>' +
      '<div class="tabla-wrap"><table class="tabla cal-tabla-admin"><thead><tr>' +
        '<th>Jornada</th><th>Estado</th><th>Apertura</th><th>Límite</th>' +
        '<th>Pendientes</th><th>Acciones</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<div class="cal-admin-bloques">' +
        '<div><h4>' + icono('triangle-alert', 15) + 'Conflictos de horario</h4>' +
          (d.conflictos.length
            ? '<ul class="cal-lista-alertas">' + d.conflictos.map(c =>
                '<li>J' + c.numero + ' · ' + esc(c.texto) + '</li>').join('') + '</ul>'
            : '<p class="vacio-mensaje">No se detectaron superposiciones entre jornadas con fecha.</p>') +
        '</div>' +
        '<div><h4>' + icono('users', 15) + 'Participantes sin disponibilidad</h4>' +
          (d.jugadores.length
            ? '<div class="chips">' + d.jugadores.map(j =>
                GL.badge(GL.nombreJugador(j.id) + ': ' + SIN_DISPONIBILIDAD, 'neutral')) .join('') + '</div>'
            : '<p class="vacio-mensaje">No hay jugadores activos en este grupo.</p>') +
        '</div>' +
      '</div></section>';
  }

  /* --------------------------- Eventos --------------------------- */

  function enlazarVista(el, d) {
    el.querySelectorAll('[data-cal-grupo]').forEach(b => b.addEventListener('click', () => {
      Mod.grupoId = b.dataset.calGrupo;
      Mod.anio = null;
      Mod.mes = null;
      Mod.render(el);
    }));
    el.querySelectorAll('[data-cal-mes]').forEach(b => b.addEventListener('click', () => {
      const siguiente = new Date(Date.UTC(Mod.anio, Mod.mes + Number(b.dataset.calMes), 1));
      Mod.anio = siguiente.getUTCFullYear();
      Mod.mes = siguiente.getUTCMonth();
      Mod.render(el);
    }));
    const hoy = el.querySelector('[data-cal-hoy]');
    if (hoy) hoy.addEventListener('click', () => {
      const p = GL.partesEnZona(new Date(), Mod.zona);
      Mod.anio = p.year;
      Mod.mes = p.month - 1;
      Mod.render(el);
    });
    const zona = el.querySelector('#cal-zona');
    if (zona) zona.addEventListener('change', () => {
      Mod.zona = zona.value;
      const p = GL.partesEnZona(new Date(), Mod.zona);
      Mod.anio = p.year;
      Mod.mes = p.month - 1;
      Mod.render(el);
    });
    el.querySelectorAll('[data-cal-jornada]').forEach(b => b.addEventListener('click', () =>
      modalJornada(el, d, Number(b.dataset.calJornada))));
    const pdf = el.querySelector('[data-cal-pdf]');
    if (pdf) pdf.addEventListener('click', () => window.print());
    const enlaces = el.querySelector('[data-cal-enlaces]');
    if (enlaces) enlaces.addEventListener('click', () => modalEnlaces(d));
    const ics = el.querySelector('[data-cal-ics]');
    if (ics) ics.addEventListener('click', () => descargarICS(d));
    el.querySelectorAll('[data-cal-horario]').forEach(b => b.addEventListener('click', () =>
      modalHorario(el, d, Number(b.dataset.calHorario))));
    el.querySelectorAll('[data-cal-estado]').forEach(b => b.addEventListener('click', () =>
      cambiarEstado(el, d, Number(b.dataset.calEstado), b.dataset.accion)));
  }

  function modalJornada(el, d, numero) {
    const j = d.mapa[numero] || { numero, estado: 'abierta', partidos: [], pendientes: 0 };
    const inicio = j.inicio ? fechaCompletaEnZona(j.inicio, Mod.zona) : 'Por programar';
    const limite = j.limite ? fechaCompletaEnZona(j.limite, Mod.zona) : 'Por programar';
    const cuerpo =
      '<div class="cal-modal-resumen">' +
        '<div><span>Apertura</span><strong>' + esc(inicio) + '</strong></div>' +
        '<div><span>Fecha límite</span><strong>' + esc(limite) + '</strong></div>' +
        '<div><span>Estado</span>' + GL.badge(j.abierta ? 'Abierta' : 'Cerrada',
          j.abierta ? 'green' : 'red') + '</div>' +
        '<div><span>Pendientes</span>' + GL.badge(j.pendientes + ' partido(s)',
          j.pendientes ? 'orange' : 'green') + '</div>' +
      '</div>' +
      '<p class="modal-texto">Horario local: ' + esc(GL.etiquetaZona(Mod.zona)) +
        '. Referencia: ' + esc(GL.horarioZonaDetalle(CONFIG.ZONA_REFERENCIA, j.inicio || new Date())) + '.</p>' +
      (j.partidos.length
        ? '<div class="cal-partidos cal-modal-partidos">' + j.partidos.map(p => htmlPartido(p, d, true)).join('') + '</div>'
        : GL.vacio('Esta jornada todavía no tiene partidos generados.', 'calendar-x', null)) +
      (d.admin ? '<p class="nota-pie">Disponibilidad de participantes: ' + SIN_DISPONIBILIDAD + '.</p>' : '');

    const acciones = '<button type="button" class="btn sec" data-cerrar>Cerrar</button>' +
      (d.admin
        ? '<button type="button" class="btn" data-cal-modal-horario="' + numero + '">' +
            icono('calendar-clock', 15) + 'Editar horario</button>'
        : '') +
      '<button type="button" class="btn sec" data-cal-modal-gcal="' + numero + '">' +
        icono('link', 15) + 'Google Calendar</button>';

    GL.abrirModal({
      titulo: 'Jornada ' + numero,
      ancho: 'lg',
      cuerpo,
      acciones,
      onAbrir(fondo, cerrar) {
        const editar = fondo.querySelector('[data-cal-modal-horario]');
        if (editar) editar.addEventListener('click', () => { cerrar(); modalHorario(el, d, numero); });
        const gcal = fondo.querySelector('[data-cal-modal-gcal]');
        if (gcal) {
          if (!j.inicio) gcal.classList.add('oculto');
          else gcal.addEventListener('click', () => window.open(urlGoogle(j, d), '_blank', 'noopener,noreferrer'));
        }
      }
    });
    iniciarIconos();
  }

  function partesEnReferencia(instante) {
    if (!instante) return { fecha: '', hora: '' };
    const d = instante instanceof Date ? instante : new Date(instante);
    if (isNaN(d.getTime())) return { fecha: '', hora: '' };
    const p = GL.partesEnZona(d, CONFIG.ZONA_REFERENCIA);
    const dos = x => String(x).padStart(2, '0');
    return {
      fecha: p.year + '-' + dos(p.month) + '-' + dos(p.day),
      hora: dos(p.hour) + ':' + dos(p.minute)
    };
  }

  function modalHorario(el, d, numero) {
    const j = d.mapa[numero] || { numero, estado: 'abierta' };
    const ini = partesEnReferencia(j.inicio);
    const fin = partesEnReferencia(j.limite);
    const etiqueta = GL.etiquetaZona(CONFIG.ZONA_REFERENCIA);

    GL.abrirModal({
      titulo: 'Programar jornada ' + numero,
      ancho: 'md',
      cuerpo:
        '<p class="modal-texto">Cargá los instantes reales de apertura y cierre en ' +
          esc(etiqueta) + '. El sistema los convierte luego a la zona de cada jugador.</p>' +
        '<div class="campo-row">' +
          '<label class="campo" style="margin:0"><span>Fecha de apertura</span>' +
            '<input class="input" type="date" id="cal-h-fecha-ini" value="' + esc(ini.fecha) + '"></label>' +
          '<label class="campo" style="margin:0"><span>Hora de apertura</span>' +
            '<input class="input" type="time" id="cal-h-hora-ini" value="' + esc(ini.hora) + '"></label>' +
        '</div>' +
        '<div class="campo-row mt">' +
          '<label class="campo" style="margin:0"><span>Fecha límite</span>' +
            '<input class="input" type="date" id="cal-h-fecha-fin" value="' + esc(fin.fecha || ini.fecha) + '"></label>' +
          '<label class="campo" style="margin:0"><span>Hora límite</span>' +
            '<input class="input" type="time" id="cal-h-hora-fin" value="' + esc(fin.hora) + '"></label>' +
        '</div>' +
        '<p class="nota-pie">La fecha límite debe ser posterior a la apertura. ' +
          'Si las franjas se superponen con otra jornada, el sistema te avisará antes de guardar.</p>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="cal-h-guardar">' +
          icono('save', 15) + 'Guardar programación</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#cal-h-guardar').addEventListener('click', async () => {
          if (!(await GL.asegurarAdmin(el))) { cerrar(); return; }
          const inicio = GL.momentoZona(fondo.querySelector('#cal-h-fecha-ini').value,
            fondo.querySelector('#cal-h-hora-ini').value, CONFIG.ZONA_REFERENCIA);
          const limite = GL.momentoZona(fondo.querySelector('#cal-h-fecha-fin').value,
            fondo.querySelector('#cal-h-hora-fin').value, CONFIG.ZONA_REFERENCIA);
          if (!inicio || !limite) {
            GL.notificar('Completá fecha y hora de apertura y de cierre.', 'advertencia');
            return;
          }
          if (limite <= inicio) {
            GL.notificar('La fecha límite debe ser posterior a la apertura.', 'advertencia');
            return;
          }
          const conflicto = detectarConflictos(d.jornadas.map(x => x.numero === numero
            ? Object.assign({}, x, { inicio, limite }) : x));
          if (conflicto.length && !(await GL.confirmar(
            conflicto[0].texto + ' ¿Querés guardar de todos modos?',
            'Conflicto de horario', 'Guardar de todos modos'))) return;

          const btn = fondo.querySelector('#cal-h-guardar');
          btn.disabled = true;
          const values = { fecha_inicio: inicio.toISOString(), hora_limite: limite.toISOString() };
          const { error } = j.id
            ? await sb.from('jornadas').update(values).eq('id', j.id)
            : await sb.from('jornadas').insert(Object.assign({
                torneo_id: d.torneo.id, grupo_id: Mod.grupoId, numero,
                estado: j.estado || 'abierta'
              }, values));
          if (error) {
            GL.notificar('No se pudo guardar: ' + error.message, 'error');
            btn.disabled = false;
            return;
          }
          GL.auditoria && GL.auditoria.registrar('calendario_jornada_programada', 'jornada', null, {
            numero,
            grupo: d.grupo ? d.grupo.nombre : '?',
            inicio: fechaCompletaEnZona(inicio, CONFIG.ZONA_REFERENCIA),
            limite: fechaCompletaEnZona(limite, CONFIG.ZONA_REFERENCIA)
          });
          cerrar();
          GL.invalidar();
          await GL.cargarContexto(true);
          GL.notificar('Jornada ' + numero + ' programada correctamente.', 'exito', 'calendar-check');
          Mod.render(el);
        });
      }
    });
    iniciarIconos();
  }

  async function cambiarEstado(el, d, numero, accion) {
    if (!(await GL.asegurarAdmin(el))) return;
    const j = d.mapa[numero] || {};
    if (accion === 'abrir') {
      if (j.id && j.abierta) {
        GL.notificar('La jornada ' + numero + ' ya está abierta.', 'info');
        return;
      }
      const values = { estado: 'abierta' };
      if (!j.id) Object.assign(values, {
        torneo_id: d.torneo.id, grupo_id: Mod.grupoId, numero
      });
      const { error } = j.id
        ? await sb.from('jornadas').update(values).eq('id', j.id)
        : await sb.from('jornadas').insert(values);
      if (error) { GL.notificar(error.message, 'error'); return; }
      GL.auditoria && GL.auditoria.registrar('calendario_jornada_abierta', 'jornada', null, {
        numero, grupo: d.grupo ? d.grupo.nombre : '?'
      });
      GL.notificar('Jornada ' + numero + ' abierta.', 'exito');
    } else {
      if (!j.id) {
        GL.notificar('Primero programá la jornada ' + numero + ' antes de cerrarla.', 'advertencia');
        return;
      }
      if (!j.abierta) {
        GL.notificar('La jornada ' + numero + ' ya está cerrada.', 'info');
        return;
      }
      if (j.pendientes) {
        GL.notificar('La jornada ' + numero + ' tiene ' + j.pendientes +
          ' partido(s) pendiente(s). Resolvelos en Jornadas antes de cerrarla.', 'advertencia');
        return;
      }
      if (!(await GL.confirmar('¿Cerrar la jornada ' + numero + '?',
        'Cerrar jornada', 'Cerrar'))) return;
      const { error } = await sb.from('jornadas').update({ estado: 'cerrada' }).eq('id', j.id);
      if (error) { GL.notificar(error.message, 'error'); return; }
      GL.auditoria && GL.auditoria.registrar('calendario_jornada_cerrada', 'jornada', null, {
        numero, grupo: d.grupo ? d.grupo.nombre : '?'
      });
      GL.notificar('Jornada ' + numero + ' cerrada.', 'exito');
    }
    GL.invalidar();
    await GL.cargarContexto(true);
    Mod.render(el);
  }

  /* --------------------------- Exportación --------------------------- */

  function icsFecha(instante) {
    return instante.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function escaparICS(texto) {
    return String(texto || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function plegarLinea(linea) {
    let restante = String(linea);
    let salida = '';
    while (restante.length > 72) {
      salida += restante.slice(0, 72) + '\r\n ';
      restante = restante.slice(72);
    }
    return salida + restante;
  }

  function datosEvento(j, d) {
    const grupo = d.grupo ? 'Grupo ' + GL.letraGrupo(d.grupo) : 'Liga';
    const fin = j.limite || new Date(j.inicio.getTime() + 3600000);
    return {
      uid: 'jornada-' + String(j.id || (d.torneo.id + '-' + grupo + '-' + j.numero))
            .replace(/[^A-Za-z0-9-]/g, '') + '@goats-latinos',
      inicio: icsFecha(j.inicio),
      fin: icsFecha(fin),
      titulo: CONFIG.NOMBRE_LIGA + ' - Jornada ' + j.numero + ' (' + grupo + ')',
      detalle: 'Estado: ' + (j.abierta ? 'Abierta' : 'Cerrada') + '\n' +
               'Partidos pendientes: ' + j.pendientes + '\n' +
               'Horario de referencia: ' + CONFIG.ZONA_REFERENCIA + '\n' +
               'Zona del calendario: ' + Mod.zona,
      lugar: CONFIG.NOMBRE_LIGA + ' · ' + grupo
    };
  }

  function urlGoogle(j, d) {
    const e = datosEvento(j, d);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(e.titulo) +
      '&dates=' + encodeURIComponent(e.inicio + '/' + e.fin) +
      '&details=' + encodeURIComponent(e.detalle.replace(/\\n/g, '\n')) +
      '&location=' + encodeURIComponent(e.lugar);
  }

  function modalEnlaces(d) {
    const conFecha = d.jornadas.filter(j => j.inicio && j.limite);
    const html = conFecha.length
      ? '<p class="modal-texto">Abrí un enlace para agregar la jornada a Google Calendar ' +
        'o copialo para compartirlo. También podés descargar el archivo .ics con todas las jornadas.</p>' +
        '<div class="cal-enlaces-lista">' + conFecha.map(j =>
          '<div><span><strong>Jornada ' + j.numero + '</strong>' +
            '<small>' + esc(fechaCompletaEnZona(j.inicio, Mod.zona)) + '</small></span>' +
            '<button type="button" class="btn sm sec" data-cal-gcal="' + j.numero + '">' +
              icono('external-link', 13) + 'Google</button>' +
            '<button type="button" class="btn-icon" data-cal-copiar="' + j.numero +
              '" aria-label="Copiar enlace">' + icono('copy', 14) + '</button>' +
          '</div>').join('') + '</div>'
      : GL.vacio('No hay jornadas con fecha y límite para generar enlaces.', 'link', null);
    GL.abrirModal({
      titulo: 'Enlaces de calendario',
      ancho: 'md',
      cuerpo: html,
      acciones: '<button type="button" class="btn sec" data-cerrar>Cerrar</button>' +
        '<button type="button" class="btn" id="cal-ics-modal">' +
          icono('download', 15) + 'Descargar .ics</button>',
      onAbrir(fondo) {
        fondo.querySelector('#cal-ics-modal').addEventListener('click', () => descargarICS(d));
        fondo.querySelectorAll('[data-cal-gcal]').forEach(b => b.addEventListener('click', () => {
          const j = d.mapa[Number(b.dataset.calGcal)];
          if (j) window.open(urlGoogle(j, d), '_blank', 'noopener,noreferrer');
        }));
        fondo.querySelectorAll('[data-cal-copiar]').forEach(b => b.addEventListener('click', async () => {
          const j = d.mapa[Number(b.dataset.calCopiar)];
          if (!j) return;
          await GL.copiar(urlGoogle(j, d));
          GL.notificar('Enlace de Google Calendar copiado.', 'exito', 'copy');
        }));
      }
    });
    iniciarIconos();
  }

  function descargarICS(d) {
    const conFecha = d.jornadas.filter(j => j.inicio && j.limite);
    if (!conFecha.length) {
      GL.notificar('No hay jornadas con fecha para exportar.', 'advertencia');
      return;
    }
    const lineas = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GOATS LATINOS//Calendario y programacion//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:GOATS LATINOS - Calendario',
      'X-WR-TIMEZONE:UTC'
    ];
    conFecha.forEach(j => {
      const e = datosEvento(j, d);
      lineas.push(
        'BEGIN:VEVENT',
        'UID:' + e.uid,
        'DTSTAMP:' + icsFecha(new Date()),
        'DTSTART:' + e.inicio,
        'DTEND:' + e.fin,
        'SUMMARY:' + escaparICS(e.titulo),
        'DESCRIPTION:' + escaparICS(e.detalle),
        'LOCATION:' + escaparICS(e.lugar),
        'END:VEVENT'
      );
    });
    lineas.push('END:VCALENDAR');
    const contenido = lineas.map(plegarLinea).join('\r\n') + '\r\n';
    const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'goats-latinos-calendario-' + String(d.torneo.temporada || 'torneo')
      .replace(/[^\p{L}\p{N}-]/gu, '-') + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    GL.notificar('Archivo iCalendar descargado.', 'exito', 'calendar-check');
  }

  function htmlImprimir(d) {
    const filas = d.jornadas.map(j =>
      '<tr><td>J' + j.numero + '</td>' +
      '<td>' + esc(j.abierta ? 'Abierta' : 'Cerrada') + '</td>' +
      '<td>' + esc(j.inicio ? fechaCompletaEnZona(j.inicio, Mod.zona) : 'Por programar') + '</td>' +
      '<td>' + esc(j.limite ? fechaCompletaEnZona(j.limite, Mod.zona) : 'Por programar') + '</td>' +
      '<td>' + esc(j.pendientes) + '</td></tr>').join('');
    const partidos = d.proximos.map(p => {
      const local = GL.nombreJugador(p.local_id);
      const visita = GL.nombreJugador(p.visitante_id);
      const j = d.mapa[Number(p.jornada)] || {};
      return '<li>J' + esc(p.jornada) + ' · ' + esc(local) + ' vs ' + esc(visita) +
        ' · ' + esc(j.inicio ? fechaCompletaEnZona(j.inicio, Mod.zona) : 'Por programar') + '</li>';
    }).join('');
    return '<div class="cal-print-cabecera">' +
        '<h1>' + esc(CONFIG.NOMBRE_LIGA) + ' — Calendario</h1>' +
        '<p>Temporada ' + esc(d.torneo.temporada || '—') + ' · ' +
        (d.grupo ? 'Grupo ' + esc(GL.letraGrupo(d.grupo)) : 'Liga') +
        ' · Zona: ' + esc(GL.etiquetaZona(Mod.zona)) + '</p>' +
        '<p>Generado: ' + esc(fechaCompletaEnZona(new Date(), Mod.zona)) + '</p>' +
      '</div>' +
      '<table class="cal-print-tabla"><thead><tr><th>Jornada</th><th>Estado</th>' +
        '<th>Apertura</th><th>Fecha límite</th><th>Pendientes</th></tr></thead>' +
        '<tbody>' + filas + '</tbody></table>' +
      '<h2>Próximos enfrentamientos</h2>' +
      (partidos ? '<ul>' + partidos + '</ul>' : '<p>Sin partidos pendientes.</p>') +
      '<p class="cal-print-nota">' + esc(GL.notaHorarios()) +
        ' Disponibilidad: ' + SIN_DISPONIBILIDAD + '.</p>';
  }

  Modulos.calendario = Mod;
})();
