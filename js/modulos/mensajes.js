/* =====================================================================
   MÓDULO 5 — Generador de mensajes para WhatsApp (solo admin)
   Los textos se generan solo con datos verificados en Supabase.
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Mensajes',
    tipo: 'apertura',
    grupoId: null,
    jornada: null,

  setContexto(tipo, grupoId, jornada) {
    if (tipo) Mod.tipo = tipo;
    if (grupoId) Mod.grupoId = grupoId;
    if (jornada) Mod.jornada = Number(jornada);
  },

  async render(el) {
    el.innerHTML = GL.skeleton(6, 20, true);
    if (!(await GL.asegurarAdmin(el))) return;
    try {
      await GL.cargarContexto(true);
      const grupos = GL.grupos(), total = (GL.torneo() && Number(GL.torneo().total_jornadas)) || 22;
      if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) Mod.grupoId = grupos[0] && grupos[0].id;
      const jn = Mod.jornada || GL.jornadaActual().numero;
      const jdata = (GL.ctx.jornadas || []).find(j =>
        j.torneo_id === (GL.torneo() && GL.torneo().id) && j.grupo_id === Mod.grupoId && j.numero === jn);
      const estadoJornada = jdata ? (jdata.estado === 'cerrada' ? 'Cerrada' : 'Abierta') : 'Sin dato';
      const letra = GL.grupo(Mod.grupoId) ? GL.letraGrupo(GL.grupo(Mod.grupoId)) : '—';

      el.innerHTML =
        '<div class="m8-pantalla" data-mensajes>' +
          '<header class="m8-hero">' +
            '<div class="m8-hero-copy">' +
              '<span class="m8-eyebrow">' + icono('send', 14) + 'Dirección del torneo · Comunicación</span>' +
              '<h1 class="m8-titulo">Generador de mensajes</h1>' +
              '<p class="m8-bajada">Textos verificados, listos para copiar y pegar en el grupo de WhatsApp.</p>' +
            '</div>' +
            '<div class="m8-hero-acciones">' + GL.badge('WhatsApp', 'neutral', 'message-circle') +
              GL.badge(Mod.tipo === 'apertura' ? 'Apertura' : 'Cierre', 'gold', Mod.tipo === 'apertura' ? 'flag' : 'flag-off') +
            '</div>' +
          '</header>' +
          '<section class="m8-kpis" aria-label="Contexto del mensaje">' +
            m8Kpi(jn + ' / ' + total, 'Jornada', 'Dentro de la temporada', 'calendar-days') +
            m8Kpi('Grupo ' + letra, 'Destinatario', grupos.length + (grupos.length === 1 ? ' grupo' : ' grupos') + ' en el torneo', 'users') +
            m8Kpi(Mod.tipo === 'apertura' ? 'Apertura' : 'Cierre', 'Modalidad', 'Según el estado de la jornada', 'message-square-text') +
            m8Kpi(estadoJornada, 'Jornada', 'Dato real del torneo activo', estadoJornada === 'Cerrada' ? 'lock' : 'flag') +
          '</section>' +
          '<div class="m8-tabs" role="tablist" aria-label="Tipo de mensaje">' +
            '<button type="button" class="m8-tab' + (Mod.tipo === 'apertura' ? ' activo' : '') + '" data-tipo="apertura" role="tab" aria-selected="' + (Mod.tipo === 'apertura') + '">' +
              icono('flag', 16) + 'Apertura de jornada</button>' +
            '<button type="button" class="m8-tab' + (Mod.tipo === 'cierre' ? ' activo' : '') + '" data-tipo="cierre" role="tab" aria-selected="' + (Mod.tipo === 'cierre') + '">' +
              icono('flag-off', 16) + 'Cierre de jornada</button>' +
          '</div>' +
          '<div class="m8-layout">' +
            '<section class="m8-panel m8-config-panel" aria-labelledby="m8-config-titulo">' +
              '<div class="m8-panel-cab"><div><h2 id="m8-config-titulo">' + icono('sliders-horizontal', 18) + 'Contexto del mensaje</h2>' +
                '<p>Elegí el grupo y la jornada. El texto se genera con datos ya cargados.</p></div></div>' +
              '<div class="m8-campos">' +
                '<label class="m8-campo"><span>Grupo</span>' +
                  '<select class="input" id="msg-grupo">' +
                    grupos.map(g => '<option value="' + esc(g.id) + '"' + (g.id === Mod.grupoId ? ' selected' : '') + '>Grupo ' + esc(GL.letraGrupo(g)) + '</option>').join('') +
                  '</select></label>' +
                '<label class="m8-campo"><span>Jornada</span>' +
                  '<select class="input" id="msg-jornada">' +
                    Array.from({ length: total }, (_, i) => i + 1).map(n =>
                      '<option value="' + n + '"' + (n === jn ? ' selected' : '') + '>Jornada ' + n + '</option>').join('') +
                  '</select></label>' +
              '</div>' +
              '<p class="m8-nota">' + icono('info', 14) +
                ' Si falta algún dato verificable, el mensaje queda bloqueado. No se escribe nada en Supabase.</p>' +
              '<div class="m8-flujo">' +
                '<span class="m8-flujo-paso activo">' + icono('check', 14) + 'Datos</span>' +
                '<span class="m8-flujo-linea" aria-hidden="true"></span>' +
                '<span class="m8-flujo-paso activo">' + icono('check', 14) + 'Texto</span>' +
                '<span class="m8-flujo-linea" aria-hidden="true"></span>' +
                '<span class="m8-flujo-paso">' + icono('send', 14) + 'Compartir</span>' +
              '</div>' +
            '</section>' +
            '<section class="m8-panel m8-preview-panel" aria-labelledby="m8-preview-titulo">' +
              '<div class="m8-panel-cab"><div><h2 id="m8-preview-titulo">' + icono('message-square-text', 18) + 'Vista previa</h2>' +
                '<p>Revisá el texto antes de copiarlo o enviarlo.</p></div>' +
                '<span id="m8-verificacion" class="m8-chip">Verificando…</span></div>' +
              '<div id="msg-estado" class="m8-estado" aria-live="polite"></div>' +
              '<label class="m8-campo m8-campo-texto"><span>Texto generado</span>' +
                '<textarea class="input texto-mensaje m8-texto" id="msg-texto" readonly></textarea></label>' +
              '<div class="m8-wa"><div class="m8-wa-head">' + icono('message-circle', 14) + 'Vista previa en WhatsApp</div>' +
                '<pre id="msg-preview" class="m8-wa-cuerpo"></pre></div>' +
              '<div class="m8-acciones">' +
                '<button type="button" class="btn sec" data-descargar>' + icono('download', 16) + 'Descargar .txt</button>' +
                '<button type="button" class="btn sec" data-wa>' + icono('send', 16) + 'Enviar por WhatsApp</button>' +
                '<button type="button" class="btn" data-copiar>' + icono('copy', 16) + 'Copiar al portapapeles</button>' +
              '</div>' +
            '</section>' +
          '</div>' +
        '</div>';

      const grupoSel = el.querySelector('#msg-grupo');
      const jornadaSel = el.querySelector('#msg-jornada');
      const txt = el.querySelector('#msg-texto');
      const vista = el.querySelector('#msg-preview');
      const estado = el.querySelector('#msg-estado');
      const chip = el.querySelector('#m8-verificacion');
      const botones = Array.from(el.querySelectorAll('[data-descargar], [data-wa], [data-copiar]'));

      const actualizar = async () => {
        const resultado = await generar(Mod.tipo, grupoSel.value, Number(jornadaSel.value));
        txt.value = resultado.texto;
        vista.textContent = resultado.texto;
        const bloqueado = resultado.problemas.length > 0;
        estado.className = 'm8-estado ' + (bloqueado ? 'bloqueado' : 'verificado');
        estado.innerHTML = bloqueado
          ? '<strong>' + icono('triangle-alert', 16) + ' No se puede generar el mensaje todavía</strong>' +
            '<ul class="m8-problemas">' + resultado.problemas.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>'
          : '<strong>' + icono('check-circle-2', 16) + ' Datos verificados</strong> — la jornada está ' +
            (Mod.tipo === 'apertura' ? 'abierta' : 'cerrada') + ', con resultados y clasificación actualizados.';
        chip.className = 'm8-chip ' + (bloqueado ? 'bloqueado' : 'verificado');
        chip.innerHTML = icono(bloqueado ? 'lock' : 'check-circle-2', 14) +
          (bloqueado ? resultado.problemas.length + ' pendiente' + (resultado.problemas.length === 1 ? '' : 's') : 'Listo');
        botones.forEach(b => { b.disabled = bloqueado; });
      };

      grupoSel.addEventListener('change', () => { Mod.grupoId = grupoSel.value; actualizar(); });
      jornadaSel.addEventListener('change', () => { Mod.jornada = Number(jornadaSel.value); actualizar(); });
      el.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => {
        Mod.tipo = b.dataset.tipo;
        Mod.render(el);
      }));
      const btnCopiar = el.querySelector('[data-copiar]');
      btnCopiar.addEventListener('click', async () => {
        await GL.copiar(txt.value);
        btnCopiar.innerHTML = icono('check', 16) + 'Copiado';
        btnCopiar.classList.add('copiado');
        setTimeout(() => { Mod.render(el); }, 2000);
      });
      el.querySelector('[data-descargar]').addEventListener('click', () =>
        GL.descargarTexto('GOATS_' + Mod.tipo + '_J' + jornadaSel.value + '_G' + GL.letraGrupo(GL.grupo(grupoSel.value)), txt.value));
      el.querySelector('[data-wa]').addEventListener('click', () => {
        window.open('https://wa.me/?text=' + encodeURIComponent(txt.value), '_blank', 'noopener,noreferrer');
      });
      await actualizar();
    } catch (e) { console.error(e); el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'los mensajes'), null, 'los mensajes'); }
    iniciarIconos();
  }
  };

  function m8Kpi(valor, etiqueta, nota, ico) {
    return '<article class="m8-kpi">' +
      '<span class="m8-kpi-ico">' + icono(ico, 20) + '</span>' +
      '<span class="m8-kpi-copy">' +
        '<strong class="m8-kpi-valor">' + esc(valor) + '</strong>' +
        '<span class="m8-kpi-label">' + esc(etiqueta) + '</span>' +
        '<span class="m8-kpi-nota">' + esc(nota) + '</span>' +
      '</span>' +
    '</article>';
  }

  /* Zona explícita del jugador. Los países con varias zonas NO se infieren
     del país: si el jugador no eligió ciudad, el dato no es verificable. */
  function zonaVerificada(jugador) {
    const j = jugador || {};
    const explicita = GL._zonaResuelta(j.zona_horaria);
    if (explicita) return explicita;
    const opciones = ZONAS_HORARIAS_DISPONIBLES.filter(x => x.pais === String(j.pais || '').toUpperCase());
    return opciones.length > 1 ? '' : GL.zonaJugador(j);
  }

  function nombresCortos(ids, limite) {
    const nombres = ids.map(id => GL.nombreJugador(id));
    const max = limite || 5;
    return nombres.slice(0, max).join(', ') + (nombres.length > max ? ' y ' + (nombres.length - max) + ' más' : '');
  }

  /* Horarios reales: el instante guardado en la jornada se convierte a cada zona. */
  function horariosTexto(ids, inicio, limite) {
    const porZona = {};
    Array.from(new Set(ids)).forEach(id => {
      const j = GL.jugador(id);
      const zona = zonaVerificada(j);
      if (!zona) return;
      if (!porZona[zona]) porZona[zona] = [];
      const nombre = GL.nombreJugador(id);
      if (!porZona[zona].includes(nombre)) porZona[zona].push(nombre);
    });
    const lineas = Object.entries(porZona).map(([zona, nombres]) =>
      '· ' + nombres.join(', ') + ': ' +
      GL.fechaHoraEnZona(inicio, zona) + ' – ' + GL.fechaHoraEnZona(limite, zona) +
      ' · ' + GL.etiquetaZona(zona) + ' (' + GL.offsetZona(inicio, zona) + ')');
    return lineas.length ? lineas.join('\n') : 'Horarios por definir.';
  }

  function enfrentamientos(partidos) {
    return partidos.slice().sort((a, b) =>
      GL.nombreJugador(a.local_id).localeCompare(GL.nombreJugador(b.local_id))).map(p => {
        const l = GL.jugador(p.local_id), v = GL.jugador(p.visitante_id);
        return '· ' + bandera(l && l.pais) + ' ' + GL.nombreJugador(p.local_id).toUpperCase() +
          '  VS  ' + bandera(v && v.pais) + ' ' + GL.nombreJugador(p.visitante_id).toUpperCase();
      }).join('\n');
  }

  function problemasClasificacion(todos, grupoId) {
    const problemas = [];
    const miembros = Array.from(new Set((GL.ctx.miembros || [])
      .filter(m => m.grupo_id === grupoId).map(m => m.jugador_id)));
    if (!miembros.length) {
      problemas.push('El grupo no tiene jugadores asignados.');
      return problemas;
    }
    const filas = GL.clasificacion(grupoId);
    const porId = {};
    filas.forEach(f => { porId[f.jugador_id] = f; });
    const sinFila = miembros.filter(id => !porId[id]);
    if (sinFila.length) problemas.push('Faltan filas de clasificación para: ' + nombresCortos(sinFila) + '.');

    const ultimoPartido = todos.reduce((max, p) => Math.max(max, Date.parse(p.updated_at) || 0), 0);
    const desactualizadas = miembros.filter(id => {
      const f = porId[id];
      if (!f) return false;
      const momento = Date.parse(f.updated_at);
      return !momento || (ultimoPartido && momento < ultimoPartido);
    });
    if (desactualizadas.length) {
      problemas.push('La clasificación no está actualizada para: ' + nombresCortos(desactualizadas) + '. Vuelve a recalcular la tabla.');
      return problemas;
    }

    const esperado = {};
    EST.calcularClasificacion(todos).forEach(s => { esperado[s.id] = s; });
    const descuadre = miembros.filter(id => {
      const f = porId[id], e = esperado[id];
      if (!f || !e) return false;
      const penalizacion = Number(f.pts_penalizacion) || 0;
      return Number(f.pj || 0) !== e.pj || Number(f.pg || 0) !== e.pg ||
        Number(f.pe || 0) !== e.pe || Number(f.pp || 0) !== e.pp ||
        Number(f.gf || 0) !== e.gf || Number(f.gc || 0) !== e.gc ||
        Number(f.pts || 0) !== Math.max(0, e.pts - penalizacion);
    });
    if (descuadre.length) {
      problemas.push('La clasificación no coincide con los resultados cargados para: ' + nombresCortos(descuadre) + '.');
    }
    return problemas;
  }

  function plantillaApertura(ctx) {
    const torneo = ctx.torneo, total = ctx.total, jornada = ctx.jornada;
    const letra = GL.letraGrupo(GL.grupo(ctx.grupoId));
    const ptsTemporada = total * 18;
    return 'JORNADA ABIERTA — ' + String(torneo.nombre || CONFIG.NOMBRE_LIGA).toUpperCase() + '\n' +
      'TEMPORADA: ' + String(torneo.temporada || '—') + '\n' +
      'GRUPO: ' + letra + '\n' +
      'JORNADA: #' + jornada + ' / #' + total + '\n' +
      'PUNTOS EN DISPUTA: #18 / #' + ptsTemporada + '\n\n' +
      'INICIO: ' + GL.fechaHoraEnZona(ctx.inicio, CONFIG.ZONA_REFERENCIA) +
        ' · ' + GL.etiquetaZona(CONFIG.ZONA_REFERENCIA) + ' (' + GL.offsetZona(ctx.inicio, CONFIG.ZONA_REFERENCIA) + ')\n' +
      'HORA LÍMITE: ' + GL.fechaHoraEnZona(ctx.limite, CONFIG.ZONA_REFERENCIA) +
        ' · ' + GL.etiquetaZona(CONFIG.ZONA_REFERENCIA) + ' (' + GL.offsetZona(ctx.limite, CONFIG.ZONA_REFERENCIA) + ')\n\n' +
      'ENFRENTAMIENTOS (6):\n' + enfrentamientos(ctx.partidos) + '\n\n' +
      'HORARIOS CONVERTIDOS POR JUGADOR:\n' + horariosTexto(ctx.participantes, ctx.inicio, ctx.limite) + '\n\n' +
      'REGLAMENTO APLICABLE:\n' + ctx.reglamento + '\n\n' +
      'Al finalizar el tiempo reglamentario se publicarán los marcadores y las estadísticas. ' +
      'Cualquier partido no jugado se resolverá según el reglamento.\n\n' +
      'Buena suerte a todos los participantes.';
  }

  function plantillaCierre(ctx) {
    const torneo = ctx.torneo, total = ctx.total, jornada = ctx.jornada;
    const letra = GL.letraGrupo(GL.grupo(ctx.grupoId));
    const filas = GL.clasificacion(ctx.grupoId);
    const ids = new Set((GL.ctx.miembros || []).filter(m => m.grupo_id === ctx.grupoId).map(m => m.jugador_id));
    const datos = filas.filter(f => ids.has(f.jugador_id) || ctx.participantes.includes(f.jugador_id));
    const tabla = [
      'JORNADA CERRADA — ' + String(torneo.nombre || CONFIG.NOMBRE_LIGA).toUpperCase(),
      'TEMPORADA: ' + String(torneo.temporada || '—'),
      'GRUPO: ' + letra,
      'JORNADA: #' + jornada + ' / #' + total,
      '',
      'CLASIFICACIÓN ACTUALIZADA',
      '════════════════════════════════════════',
      '#  JUGADOR                 PJ  G  E  P  DIF  PTS'
    ];
    datos.forEach((f, i) => {
      const nombre = String(GL.nombreJugador(f.jugador_id)).toUpperCase().slice(0, 20).padEnd(21);
      tabla.push(String(i + 1).padStart(2) + ' ' + nombre +
        String(f.pj || 0).padStart(3) + ' ' + String(f.pg || 0).padStart(2) + ' ' +
        String(f.pe || 0).padStart(2) + ' ' + String(f.pp || 0).padStart(2) + ' ' +
        GL.signo(f.dif).padStart(5) + ' ' + String(f.pts || 0).padStart(4));
    });
    tabla.push('════════════════════════════════════════');

    tabla.push('', 'RESULTADOS DE LA JORNADA');
    ctx.partidos.slice().sort((a, b) =>
      GL.nombreJugador(a.local_id).localeCompare(GL.nombreJugador(b.local_id))).forEach(p => {
        const r = GL.resultado(p);
        const etiqueta = GL.esAdministrativo(p) ? 'RESOLUCIÓN ADMINISTRATIVA' : 'RESULTADO REAL';
        const estado = (ESTADOS_PARTIDO[p.estado] && ESTADOS_PARTIDO[p.estado].label) || p.estado;
        tabla.push('· ' + bandera(GL.paisJugador(p.local_id)) + ' ' + GL.nombreJugador(p.local_id) +
          ' ' + r.texto + ' ' + GL.nombreJugador(p.visitante_id) + ' ' + bandera(GL.paisJugador(p.visitante_id)) +
          ' [' + etiqueta + ' · ' + estado + ']');
      });

    const reales = EST.calcularGolesReales(ctx.partidos);
    const golesJornada = reales.reduce((suma, s) => suma + s.gf, 0);
    const goleadores = reales.filter(s => s.gf > 0).sort((a, b) => b.gf - a.gf).slice(0, 3);
    const promedios = EST.calcularPromedios(ctx.partidos).filter(s => s.paseN > 0 || s.posN > 0);
    tabla.push('', 'GOLES REALES Y ESTADÍSTICAS VÁLIDAS',
      '· Goles convertidos en FC Mobile: ' + golesJornada + ' (no incluye resoluciones administrativas).',
      '· Máximos goleadores de la jornada: ' +
        (goleadores.length
          ? goleadores.map(s => bandera(GL.paisJugador(s.id)) + ' ' + GL.nombreJugador(s.id) + ' (' + s.gf + ')').join(', ')
          : 'sin goles reales registrados en la jornada.'));
    if (promedios.length) {
      const conPase = promedios.filter(s => s.paseN > 0);
      if (conPase.length) {
        const mejorPase = conPase.slice().sort((a, b) => b.promPase - a.promPase)[0];
        tabla.push('· Mejor precisión de pase: ' + GL.nombreJugador(mejorPase.id) + ' ' +
          mejorPase.promPase + '% (' + mejorPase.paseN + ' partido(s) con dato real).');
      }
      const conPos = promedios.filter(s => s.posN > 0);
      if (conPos.length) {
        const mejorPos = conPos.slice().sort((a, b) => b.promPos - a.promPos)[0];
        tabla.push('· Mayor posesión: ' + GL.nombreJugador(mejorPos.id) + ' ' +
          mejorPos.promPos + '% (' + mejorPos.posN + ' partido(s) con dato real).');
      }
    } else {
      tabla.push('· Sin datos reales de posesión ni pases en esta jornada.');
    }

    const admin = ctx.partidos.filter(p => GL.esAdministrativo(p));
    tabla.push('', 'RESOLUCIONES ADMINISTRATIVAS',
      admin.length
        ? admin.map(p => {
            const etiqueta = (ESTADOS_PARTIDO[p.estado] && ESTADOS_PARTIDO[p.estado].label) || p.estado;
            return '· ' + GL.nombreJugador(p.local_id) + ' vs ' + GL.nombreJugador(p.visitante_id) +
              ' → ' + GL.resultado(p).texto + ' (' + etiqueta + ')';
          }).join('\n')
        : '· Ninguna. Todos los encuentros se jugaron en FC Mobile.');

    const siguiente = jornada + 1 <= total
      ? GL.ctx.jornadas.find(j => j.torneo_id === torneo.id && j.grupo_id === ctx.grupoId && j.numero === jornada + 1)
      : null;
    tabla.push('', 'PRÓXIMA JORNADA',
      siguiente
        ? '· Jornada #' + (jornada + 1) + ': ' +
          (siguiente.fecha_inicio
            ? GL.fechaHoraEnZona(siguiente.fecha_inicio, CONFIG.ZONA_REFERENCIA)
            : 'fecha y hora por definir') +
          (siguiente.hora_limite
            ? ' — límite ' + GL.fechaHoraEnZona(siguiente.hora_limite, CONFIG.ZONA_REFERENCIA)
            : ' — límite por definir') +
          ' · ' + GL.etiquetaZona(CONFIG.ZONA_REFERENCIA) + '.'
        : '· Temporada regular finalizada.');
    tabla.push('', 'Resultados oficiales publicados con datos verificados. ¡Nos vemos en la próxima jornada!');
    return tabla.join('\n');
  }

  /* Preflight: si falta algún dato verificable, no se genera ni se permite copiar. */
  async function generar(tipo, grupoId, jornada) {
    const torneo = GL.torneo();
    const total = (torneo && Number(torneo.total_jornadas)) || 22;
    const problemas = [];
    const todos = torneo && grupoId
      ? await GL.partidos({ torneo_id: torneo.id, grupo_id: grupoId })
      : [];
    const partidos = todos.filter(p => Number(p.jornada) === jornada);
    const jdata = torneo && GL.ctx.jornadas.find(j =>
      j.torneo_id === torneo.id && j.grupo_id === grupoId && j.numero === jornada);
    const participantes = Array.from(new Set(partidos.flatMap(p => [p.local_id, p.visitante_id]).filter(Boolean)));
    const reglamento = String((torneo && torneo.reglamento) || '').trim();
    const inicio = jdata && jdata.fecha_inicio ? new Date(jdata.fecha_inicio) : null;
    const limite = jdata && jdata.hora_limite ? new Date(jdata.hora_limite) : null;

    if (!torneo) problemas.push('No hay torneo activo.');
    if (!grupoId) problemas.push('Falta elegir un grupo.');
    if (!jornada || jornada > total) problemas.push('La jornada elegida no es válida.');
    if (partidos.length !== 6) problemas.push('La jornada tiene ' + partidos.length + ' de 6 enfrentamientos.');
    if (!reglamento) problemas.push('Falta el reglamento del torneo. Cargalo en Administración → Configuración.');
    if (!inicio || isNaN(inicio.getTime())) problemas.push('Falta la fecha y hora de inicio de la jornada. Cargalas en Administración → Jornadas.');
    if (!limite || isNaN(limite.getTime())) problemas.push('Falta la hora límite de la jornada. Cargala en Administración → Jornadas.');
    if (inicio && limite && limite <= inicio) problemas.push('La hora límite debe ser posterior al inicio de la jornada.');

    const sinZona = participantes.filter(id => !zonaVerificada(GL.jugador(id)));
    if (sinZona.length) problemas.push('Falta la ciudad o zona horaria de: ' + nombresCortos(sinZona) + '.');

    if (tipo === 'apertura') {
      if (!jdata || jdata.estado !== 'abierta') {
        problemas.push('La jornada no está abierta. Abrila en Administración → Jornadas antes de generar el mensaje.');
      }
    } else {
      if (!jdata || jdata.estado !== 'cerrada') {
        problemas.push('La jornada no está cerrada. Cerrala en Administración → Jornadas antes de generar el mensaje.');
      }
      const pendientes = partidos.filter(p => p.estado === 'pendiente');
      if (pendientes.length) {
        problemas.push('Hay ' + pendientes.length + ' partido(s) pendiente(s): ' +
          pendientes.map(p => GL.nombreJugador(p.local_id) + ' vs ' + GL.nombreJugador(p.visitante_id)).join(', ') + '.');
      }
      problemas.push.apply(problemas, problemasClasificacion(todos, grupoId));
    }

    if (problemas.length) {
      return {
        problemas,
        texto: 'MENSAJE NO DISPONIBLE — DATOS SIN VERIFICAR\n\n' +
          'Motivos:\n' + problemas.map((p, i) => (i + 1) + '. ' + p).join('\n') +
          '\n\nCorregí estos puntos en Supabase y volvé a generar el mensaje.'
      };
    }

    const ctx = {
      torneo, total, grupoId, jornada, partidos, participantes,
      reglamento, inicio, limite
    };
    return {
      problemas: [],
      texto: tipo === 'apertura' ? plantillaApertura(ctx) : plantillaCierre(ctx)
    };
  }

  Modulos.mensajes = Mod;
})();
