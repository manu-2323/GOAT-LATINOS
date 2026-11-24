/* =====================================================================
   MÓDULO 1 — Tabla de posiciones (pública)
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Tabla de Posiciones',
    grupoId: null,
    jornada: null,

    setGrupo(id) { Mod.grupoId = id; },

    async render(el) {
      el.innerHTML = GL.skeleton(7);
      try {
        await GL.cargarContexto(true);
        if (!GL.torneo()) { el.innerHTML = GL.vacio('No hay torneo activo todavía.', 'trophy', null); iniciarIconos(); return; }
        const grupos = GL.grupos();
        if (!grupos.length) {
          el.innerHTML = GL.vacio('Todavía no hay grupos configurados. El administrador debe crear el torneo y el fixture.');
          iniciarIconos(); return;
        }
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) Mod.grupoId = grupos[0].id;
        const jornada = GL.jornadaActual();
        Mod.jornada = jornada.numero;
        const partidos = await GL.partidos({ torneo_id: GL.torneo().id, jornada: jornada.numero, grupo_id: Mod.grupoId });

        el.innerHTML =
          '<div class="seccion-head">' +
            '<div class="seccion-titulo"><h2>Tabla de Posiciones</h2>' +
              '<div class="tabla-head-datos">' +
                '<span class="badge-jornada">Jornada ' + jornada.numero + ' / ' +
                  ((GL.torneo() && GL.torneo().total_jornadas) || 22) + '</span>' +
                '<span class="estado-jornada"><span class="punto-estado ' +
                  (!jornada.virtual && jornada.estado === 'abierta' ? 'abierta' : '') + '"></span>' +
                  (jornada.virtual ? 'Pendiente de programación' :
                    (jornada.estado === 'abierta' ? 'Jornada Abierta' : 'Jornada Cerrada')) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="seccion-acciones">' +
              '<button type="button" class="btn sec" data-export>' + icono('image', 16) + 'Compartir PNG</button>' +
            '</div>' +
          '</div>' +
          '<div class="tabs tabs-grupos">' + grupos.map(g =>
            '<button type="button" class="tab' + (g.id === Mod.grupoId ? ' activo' : '') + '" data-grupo="' + g.id + '">' +
            'Grupo ' + GL.letraGrupo(g) + '</button>').join('') + '</div>' +
          '<div id="contenido-tabla"></div>';

        const contenido = el.querySelector('#contenido-tabla');
        contenido.innerHTML = htmlTabla(Mod.grupoId, partidos, jornada) + htmlPartidosHoy(partidos, jornada);
        contenido.querySelectorAll('[data-expandir]').forEach(b => b.addEventListener('click', () => {
          const fila = b.closest('tr');
          const abierta = fila.classList.toggle('expandida');
          b.setAttribute('aria-expanded', abierta ? 'true' : 'false');
          b.setAttribute('aria-label', abierta ? 'Ocultar G, E, P y goles' : 'Ver G, E, P y goles');
        }));

        el.querySelectorAll('[data-grupo]').forEach(b => b.addEventListener('click', () => {
          Mod.grupoId = b.dataset.grupo;
          Mod.render(el);
        }));
        el.querySelector('[data-export]').addEventListener('click', () =>
          GL.exportarPNG('tabla-export', 'GOATS_Tabla_Grupo' + GL.letraGrupo(GL.grupo(Mod.grupoId))));
      } catch (e) {
        console.error(e);
        el.innerHTML = GL.error(e.message);
      }
      iniciarIconos();
    }
  };

  function htmlTabla(grupoId, partidos, jornada) {
    const filas = GL.clasificacion(grupoId);
    const jugadoresGrupo = new Set((GL.ctx.miembros || []).filter(m => m.grupo_id === grupoId).map(m => m.jugador_id));
    const datos = filas.filter(f => jugadoresGrupo.has(f.jugador_id));
    const yo = Auth.jugador && Auth.jugador.id;
    if (!datos.length) {
      return GL.vacio('Aún no hay clasificación para este grupo. El administrador debe generar el fixture y cargar resultados.',
        'table-2', null) + '<div id="tabla-export" class="oculto"></div>';
    }
    let filasHtml = '', separador = false;
    datos.forEach((f, i) => {
      const pos = i + 1;
      const j = GL.jugador(f.jugador_id) || {};
      const clasePos = pos <= 6 ? 'clasifica' : pos <= 10 ? 'medio' : 'descenso';
      if (pos === 11 && !separador) {
        filasHtml += '<tr class="fila-separadora"><td colspan="10"><div class="linea-descenso">Zona de descenso</div></td></tr>';
        separador = true;
      }
      filasHtml += '<tr class="' + (yo === f.jugador_id ? 'fila-mia ' : '') + (pos > 10 ? 'fila-descenso' : '') + '" style="animation-delay:' + (i * .04) + 's">' +
        '<td><span class="pos-badge ' + clasePos + '">' + pos + '</span></td>' +
        '<td><div class="jugador-celda">' + GL.avatarHTML(j, 'avatar-sm') +
          '<span class="bandera-movil">' + GL.banderaHTML(j.pais, 16) + '</span>' +
          '<span>' + esc(j.nombre_usuario || 'Jugador') + (yo === f.jugador_id ? ' <span class="dorado" style="font-size:9px">TÚ</span>' : '') + '</span></div></td>' +
        '<td class="col-pais"><span class="pais-celda" title="' + esc(GL.nombrePais(j.pais)) + '">' + GL.banderaHTML(j.pais, 16) +
          '<span class="codigo-pais">' + esc(j.pais || '—') + '</span></span></td>' +
        '<td class="num col-j">' + (f.pj || 0) + '</td>' +
        '<td class="num col-g" style="color:var(--accent-green)">' + (f.pg || 0) + '</td>' +
        '<td class="num col-e">' + (f.pe || 0) + '</td>' +
        '<td class="num col-p" style="color:var(--accent-red)">' + (f.pp || 0) + '</td>' +
        '<td class="num col-gf">' + (f.gf || 0) + ':' + (f.gc || 0) + '</td>' +
        '<td class="num col-dif ' + ((f.dif || 0) > 0 ? 'verde-txt' : (f.dif || 0) < 0 ? 'rojo-txt' : '') + '">' + GL.signo(f.dif) + '</td>' +
        '<td class="num col-pts dorado">' + (f.pts || 0) + '</td>' +
        '<td class="col-expand"><button type="button" class="btn-expandir" data-expandir aria-expanded="false" aria-label="Ver G, E, P y goles">' + icono('chevron-down', 16) + '</button></td></tr>';
    });

    return '<div id="tabla-export" style="padding:6px;background:var(--bg-primary);border-radius:var(--radius)">' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr>' +
      '<th>#</th><th class="izq">Jugador</th><th class="col-pais">País</th><th class="col-j">J</th>' +
      '<th class="col-g">G</th><th class="col-e">E</th><th class="col-p">P</th><th class="col-gf">+/-</th>' +
      '<th class="col-dif">Dif</th><th class="col-pts">Pts</th>' +
      '<th class="col-expand"><span class="sr-only">Detalles</span></th>' +
      '</tr></thead><tbody>' + filasHtml + '</tbody></table></div>' +
      '<p class="nota-pie" style="text-align:right;margin-top:6px">Clasifican 6 por grupo · Jornada ' + jornada.numero +
      ' · Generado el ' + GL.fechaLarga(new Date()) + '</p></div>';
  }

  function htmlPartidosHoy(partidos, jornada) {
    const cards = partidos.map((p, i) => {
      const r = GL.resultado(p);
      const local = GL.jugador(p.local_id) || {}, visita = GL.jugador(p.visitante_id) || {};
      const horarioLocal = GL.horarioPais(local.pais);
      const horarioVisita = GL.horarioPais(visita.pais);
      return '<div class="partido-card partido-card-fixture" style="animation-delay:' + (i * .05) + 's">' +
        '<div class="equipo-row local">' +
          '<div class="equipo">' + icono('home', 15) + '<span>' + esc(GL.nombreJugador(p.local_id)) + '</span>' + GL.banderaHTML(local.pais, 15) + '</div>' +
          (r.pendiente ? '<div class="hora">' + esc(horarioLocal) + '</div>' : '') +
        '</div>' +
        '<div class="marcador-centro">' +
          '<div class="marcador ' + (r.pendiente ? '' : 'jugado') + '">' + r.texto + '</div>' +
          '<div class="estado-mini" style="justify-content:center;margin-top:4px">' + icono(r.estado.icono, 12) + r.estado.label + '</div>' +
        '</div>' +
        '<div class="equipo-row visita">' +
          '<div class="equipo visita">' + GL.banderaHTML(visita.pais, 15) + '<span>' + esc(GL.nombreJugador(p.visitante_id)) + '</span>' + icono('plane', 15) + '</div>' +
          (r.pendiente ? '<div class="hora">' + esc(horarioVisita) + '</div>' : '') +
        '</div></div>';
    }).join('');
    return '<div class="card mt"><div class="card-titulo">' + icono('calendar-days', 20) + 'Partidos de hoy' +
      '<span class="badge neutral">Jornada ' + jornada.numero + '</span></div>' +
      (cards ? '<div class="partidos-lista">' + cards + '</div>' :
        '<p class="vacio-mensaje">' + (jornada.virtual
          ? 'Esta jornada todavía no tiene partidos programados.'
          : 'No hay partidos programados para esta jornada.') + '</p>') + '</div>';
  }

  Modulos.tabla = Mod;
})();
