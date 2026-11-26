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
          el.innerHTML = GL.vacio('Todavía no hay grupos configurados. El administrador debe crear el torneo y el cuadro de partidos.');
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
          GL.exportarTabla(Mod.grupoId, 'GOATS_Tabla_Grupo' + GL.letraGrupo(GL.grupo(Mod.grupoId))));
      } catch (e) {
        console.error(e);
        el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'la tabla'), null, 'la tabla de posiciones');
      }
      iniciarIconos();
    }
  };

  function htmlTabla(grupoId, partidos, jornada) {
    const filas = GL.clasificacion(grupoId);
    const jugadoresGrupo = new Set((GL.ctx.miembros || []).filter(m => m.grupo_id === grupoId).map(m => m.jugador_id));
    const datos = filas.filter(f => jugadoresGrupo.has(f.jugador_id));
    const yo = Auth.jugador && Auth.jugador.id;
    const total = datos.length;
    if (!datos.length) {
      return GL.vacio('Aún no hay clasificación para este grupo. El administrador debe generar el cuadro de partidos y cargar resultados.',
        'table-2', null) + '<div id="tabla-export" class="oculto"></div>';
    }

    // Calcular indicador lateral de clasificación/descenso
    // Clasifica top 6, zona media 7-10, descenso 11+
    function indicadorZona(pos, total) {
      if (pos <= 6) return { clase: 'zona-clasifica', titulo: 'Clasifica al siguiente torneo' };
      if (pos > total - 3) return { clase: 'zona-descenso', titulo: 'Zona de descenso' };
      return { clase: 'zona-media', titulo: '' };
    }

    let filasHtml = '', separador = false;
    datos.forEach((f, i) => {
      const pos = i + 1;
      const j = GL.jugador(f.jugador_id) || {};
      const clasePos = pos <= 6 ? 'clasifica' : pos > total - 3 ? 'descenso' : 'medio';
      const zona = indicadorZona(pos, total);
      const esMio = yo === f.jugador_id;
      const dif = f.dif || 0;
      const difClase = dif > 0 ? 'verde-txt' : dif < 0 ? 'rojo-txt' : '';
      const difTexto = dif > 0 ? '+' + dif : String(dif);

      if (pos === total - 2 && !separador) {
        filasHtml += '<tr class="fila-separadora"><td colspan="12"><div class="linea-descenso">' +
          icono('arrow-down', 14) + ' Zona de descenso</div></td></tr>';
        separador = true;
      }

      // Fila principal — siempre visible
      filasHtml +=
        '<tr class="tabla-fila' + (esMio ? ' fila-mia' : '') + (pos > total - 3 ? ' fila-descenso' : '') +
          '" style="animation-delay:' + (i * .04) + 's" data-fila-id="' + esc(f.jugador_id) + '">' +

          // Indicador lateral de zona
          '<td class="col-zona"><span class="zona-indicador ' + zona.clase + '"' +
            (zona.titulo ? ' title="' + zona.titulo + '"' : '') + '></span></td>' +

          // Posición
          '<td class="col-pos"><span class="pos-badge ' + clasePos + '">' + pos + '</span></td>' +

          // Nombre + avatar + bandera (columna fija en móvil)
          '<td class="col-nombre col-fija izq">' +
            '<div class="jugador-celda">' +
              GL.avatarHTML(j, 'avatar-sm') +
              '<div class="jugador-celda-info">' +
                '<span class="jugador-celda-nombre">' + esc(j.nombre_usuario || 'Jugador') +
                  (esMio ? ' <span class="badge gold badge-yo">TÚ</span>' : '') + '</span>' +
                '<span class="jugador-celda-pais">' + GL.banderaHTML(j.pais, 12) +
                  ' <span class="codigo-pais">' + esc(j.pais || '—') + '</span></span>' +
              '</div>' +
            '</div>' +
          '</td>' +

          // Partidos jugados
          '<td class="num col-j col-scroll" data-label="PJ">' + (f.pj || 0) + '</td>' +
          // Victorias
          '<td class="num col-g col-scroll verde-txt" data-label="G">' + (f.pg || 0) + '</td>' +
          // Empates
          '<td class="num col-e col-scroll" data-label="E">' + (f.pe || 0) + '</td>' +
          // Derrotas
          '<td class="num col-p col-scroll rojo-txt" data-label="P">' + (f.pp || 0) + '</td>' +
          // Goles a favor
          '<td class="num col-gf col-scroll" data-label="GF">' + (f.gf || 0) + '</td>' +
          // Goles en contra
          '<td class="num col-gc col-scroll" data-label="GC">' + (f.gc || 0) + '</td>' +
          // Diferencia
          '<td class="num col-dif col-scroll ' + difClase + '" data-label="Dif">' + difTexto + '</td>' +
          // Puntos — siempre visibles, resaltados
          '<td class="num col-pts dorado" data-label="Pts"><strong>' + (f.pts || 0) + '</strong></td>' +

          // Botón expandir stats secundarias en móvil
          '<td class="col-expand">' +
            '<button type="button" class="btn-expandir" data-expandir ' +
              'aria-expanded="false" aria-label="Ver detalle de ' + esc(j.nombre_usuario || 'jugador') + '">' +
              icono('chevron-down', 16) +
            '</button>' +
          '</td>' +
        '</tr>' +

        // Fila expandible — estadísticas secundarias visibles al pulsar en móvil
        '<tr class="fila-detalle" data-detalle-id="' + esc(f.jugador_id) + '">' +
          '<td colspan="12">' +
            '<div class="detalle-stats-grid">' +
              '<div class="detalle-stat"><span class="detalle-stat-label">PJ</span><span class="detalle-stat-valor">' + (f.pj || 0) + '</span></div>' +
              '<div class="detalle-stat verde-txt"><span class="detalle-stat-label">Victorias</span><span class="detalle-stat-valor">' + (f.pg || 0) + '</span></div>' +
              '<div class="detalle-stat"><span class="detalle-stat-label">Empates</span><span class="detalle-stat-valor">' + (f.pe || 0) + '</span></div>' +
              '<div class="detalle-stat rojo-txt"><span class="detalle-stat-label">Derrotas</span><span class="detalle-stat-valor">' + (f.pp || 0) + '</span></div>' +
              '<div class="detalle-stat"><span class="detalle-stat-label">GF</span><span class="detalle-stat-valor">' + (f.gf || 0) + '</span></div>' +
              '<div class="detalle-stat"><span class="detalle-stat-label">GC</span><span class="detalle-stat-valor">' + (f.gc || 0) + '</span></div>' +
              '<div class="detalle-stat ' + difClase + '"><span class="detalle-stat-label">Diferencia</span><span class="detalle-stat-valor">' + difTexto + '</span></div>' +
              '<div class="detalle-stat dorado"><span class="detalle-stat-label">Puntos</span><span class="detalle-stat-valor"><strong>' + (f.pts || 0) + '</strong></span></div>' +
            '</div>' +
          '</td>' +
        '</tr>';
    });

    // Leyenda de zonas
    const leyenda =
      '<div class="tabla-leyenda">' +
        '<span class="leyenda-item"><span class="zona-indicador zona-clasifica"></span> Clasifica</span>' +
        '<span class="leyenda-item"><span class="zona-indicador zona-media"></span> Zona media</span>' +
        '<span class="leyenda-item"><span class="zona-indicador zona-descenso"></span> Descenso</span>' +
        (yo ? '<span class="leyenda-item"><span class="badge gold badge-yo">TÚ</span> Tu posición</span>' : '') +
      '</div>';

    return '<div id="tabla-export" style="padding:6px;background:var(--bg-primary);border-radius:var(--radius)">' +
      '<div class="tabla-wrap tabla-wrap-scroll" tabindex="0" role="region" aria-label="Tabla de posiciones con desplazamiento horizontal">' +
        '<div class="tabla-scroll-hint" aria-hidden="true">' + icono('arrow-right', 14) + ' Deslizá para ver más</div>' +
        '<table class="tabla tabla-posiciones"><thead><tr>' +
          '<th class="col-zona" aria-label="Zona"></th>' +
          '<th class="col-pos">#</th>' +
          '<th class="col-nombre col-fija izq">Jugador</th>' +
          '<th class="num col-j col-scroll" title="Partidos jugados">PJ</th>' +
          '<th class="num col-g col-scroll verde-txt" title="Victorias">G</th>' +
          '<th class="num col-e col-scroll" title="Empates">E</th>' +
          '<th class="num col-p col-scroll rojo-txt" title="Derrotas">P</th>' +
          '<th class="num col-gf col-scroll" title="Goles a favor">GF</th>' +
          '<th class="num col-gc col-scroll" title="Goles en contra">GC</th>' +
          '<th class="num col-dif col-scroll" title="Diferencia de gol">Dif</th>' +
          '<th class="num col-pts dorado" title="Puntos">Pts</th>' +
          '<th class="col-expand"><span class="sr-only">Detalle</span></th>' +
        '</tr></thead>' +
        '<tbody>' + filasHtml + '</tbody></table>' +
      '</div>' +
      leyenda +
      '<p class="nota-pie" style="text-align:right;margin-top:6px">' +
        'Clasifican top 6 por grupo · Jornada ' + jornada.numero +
        ' · Generado el ' + GL.fechaLarga(new Date()) +
      '</p>' +
    '</div>';
  }

  function htmlPartidosHoy(partidos, jornada) {
    const cards = partidos.map((p, i) => {
      const r = GL.resultado(p);
      const local = GL.jugador(p.local_id) || {}, visita = GL.jugador(p.visitante_id) || {};
      const horarioLocal = GL.horarioJugador(local);
      const horarioVisita = GL.horarioJugador(visita);
      return '<div class="partido-card partido-card-fixture" style="animation-delay:' + (i * .05) + 's">' +
        '<div class="equipo-row local">' +
          '<div class="equipo">' + icono('home', 16) + '<span>' + esc(GL.nombreJugador(p.local_id)) + '</span>' + GL.banderaHTML(local.pais, 15) + '</div>' +
          (r.pendiente ? '<div class="hora">' + esc(horarioLocal) + '</div>' : '') +
        '</div>' +
        '<div class="marcador-centro">' +
          '<div class="marcador ' + (r.pendiente ? '' : 'jugado') + '">' + r.texto + '</div>' +
          '<div class="estado-mini" style="justify-content:center;margin-top:4px">' + icono(r.estado.icono, 12) + r.estado.label + '</div>' +
        '</div>' +
        '<div class="equipo-row visita">' +
          '<div class="equipo visita">' + GL.banderaHTML(visita.pais, 15) + '<span>' + esc(GL.nombreJugador(p.visitante_id)) + '</span>' + icono('plane', 16) + '</div>' +
          (r.pendiente ? '<div class="hora">' + esc(horarioVisita) + '</div>' : '') +
        '</div></div>';
    }).join('');
    return '<div class="card mt"><div class="card-titulo">' + icono('calendar-days', 20) + 'Partidos de hoy' +
      '<span class="badge neutral">Jornada ' + jornada.numero + '</span></div>' +
      (cards ? '<div class="partidos-lista">' + cards + '</div>' :
        '<p class="vacio-mensaje">' + (jornada.virtual
          ? 'Esta jornada todavía no tiene partidos programados.'
          : 'No hay partidos programados para esta jornada.') + '</p>') +
      (cards ? '<p class="nota-pie">' + esc(GL.notaHorarios()) + '</p>' : '') + '</div>';
  }

  Modulos.tabla = Mod;
})();
