/* =====================================================================
   MÓDULO 5 — Generador de mensajes para WhatsApp (solo admin)
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
      el.innerHTML = GL.skeleton(5);
      if (!(await GL.asegurarAdmin(el))) return;
      try {
        await GL.cargarContexto(true);
        const grupos = GL.grupos(), total = (GL.torneo() && Number(GL.torneo().total_jornadas)) || 22;
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) Mod.grupoId = grupos[0] && grupos[0].id;
        const jn = Mod.jornada || GL.jornadaActual().numero;
        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Generador de mensajes</h2>' +
            '<p>Textos listos para copiar y pegar en el grupo de WhatsApp</p></div></div>' +
          '<div class="tabs">' +
            '<button type="button" class="tab' + (Mod.tipo === 'apertura' ? ' activo' : '') + '" data-tipo="apertura">' + icono('flag', 16) + 'Apertura de jornada</button>' +
            '<button type="button" class="tab' + (Mod.tipo === 'cierre' ? ' activo' : '') + '" data-tipo="cierre">' + icono('flag-off', 16) + 'Cierre de jornada</button>' +
          '</div>' +
          '<div class="card"><div class="campo-row">' +
            '<label class="campo"><span>Grupo</span><select class="input" id="msg-grupo">' +
              grupos.map(g => '<option value="' + g.id + '"' + (g.id === Mod.grupoId ? ' selected' : '') + '>Grupo ' + GL.letraGrupo(g) + '</option>').join('') +
            '</select></label>' +
            '<label class="campo"><span>Jornada</span><select class="input" id="msg-jornada">' +
              Array.from({ length: total }, (_, i) => i + 1).map(n =>
                '<option value="' + n + '"' + (n === jn ? ' selected' : '') + '>Jornada ' + n + '</option>').join('') +
            '</select></label>' +
          '</div></div>' +
          '<div class="card"><div class="card-titulo">' + icono('message-square-text', 19) + 'Vista previa' +
            '<span class="spacer"></span><span class="badge neutral">WhatsApp</span></div>' +
            '<textarea class="input texto-mensaje" id="msg-texto" readonly></textarea>' +
            '<div class="vista-previa wa-preview"><div class="vista-previa-head">' + icono('message-circle', 14) +
              'Vista previa en WhatsApp</div><pre id="msg-preview"></pre></div>' +
            '<div class="barra-acciones mt" style="display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap">' +
              '<button type="button" class="btn sec" data-descargar>' + icono('download', 16) + 'Descargar .txt</button>' +
              '<button type="button" class="btn sec" data-wa>' + icono('send', 16) + 'Enviar por WhatsApp</button>' +
              '<button type="button" class="btn" data-copiar>' + icono('copy', 16) + 'Copiar al portapapeles</button>' +
            '</div></div>';

        const grupoSel = el.querySelector('#msg-grupo'), jornadaSel = el.querySelector('#msg-jornada'), txt = el.querySelector('#msg-texto');
        const vista = el.querySelector('#msg-preview');
        const actualizar = async () => {
          txt.value = Mod.tipo === 'apertura'
            ? await generarApertura(grupoSel.value, Number(jornadaSel.value))
            : await generarCierre(grupoSel.value, Number(jornadaSel.value));
          vista.textContent = txt.value;
        };
        grupoSel.addEventListener('change', () => { Mod.grupoId = grupoSel.value; actualizar(); });
        jornadaSel.addEventListener('change', () => { Mod.jornada = Number(jornadaSel.value); actualizar(); });
        el.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => { Mod.tipo = b.dataset.tipo; Mod.render(el); }));
        const btnCopiar = el.querySelector('[data-copiar]');
        btnCopiar.addEventListener('click', async () => {
          await GL.copiar(txt.value);
          btnCopiar.innerHTML = icono('check', 16) + 'Copiado';
          btnCopiar.style.background = 'var(--accent-green)';
          btnCopiar.style.color = '#000';
          setTimeout(() => { Mod.render(el); }, 2000);
        });
        el.querySelector('[data-descargar]').addEventListener('click', () =>
          GL.descargarTexto('GOATS_' + Mod.tipo + '_J' + jornadaSel.value + '_G' + GL.letraGrupo(GL.grupo(grupoSel.value)), txt.value));
        el.querySelector('[data-wa]').addEventListener('click', () => {
          window.open('https://wa.me/?text=' + encodeURIComponent(txt.value), '_blank', 'noopener,noreferrer');
        });
        await actualizar();
      } catch (e) { console.error(e); el.innerHTML = GL.error(e.message); }
      iniciarIconos();
    }
  };

  /* Horarios reales de los participantes, agrupados por zona elegida. */
  function horariosTexto(ids) {
    const jugadores = (ids && ids.length
      ? Array.from(new Set(ids)).map(id => GL.jugador(id)).filter(Boolean)
      : GL.jugadores());
    const grupos = {};
    jugadores.forEach(j => {
      const zona = GL.zonaJugador(j);
      const horario = GL.horarioZona(zona);
      const clave = horario + '|' + GL.etiquetaZona(zona);
      if (!grupos[clave]) grupos[clave] = [];
      if (!grupos[clave].includes(j.nombre_usuario)) grupos[clave].push(j.nombre_usuario);
    });
    const lineas = Object.entries(grupos).map(([clave, nombres]) => {
      const separador = clave.indexOf('|');
      return nombres.join(', ') + ': ' + clave.slice(0, separador) + ' (' + clave.slice(separador + 1) + ')';
    });
    return lineas.length ? lineas.join('\n') : 'Horarios por definir.';
  }

  async function generarApertura(grupoId, jornada) {
    const partidos = (await GL.partidos({ torneo_id: GL.torneo().id, jornada, grupo_id: grupoId }));
    const letra = GL.letraGrupo(GL.grupo(grupoId));
    const total = (GL.torneo() && Number(GL.torneo().total_jornadas)) || 22;
    // 6 partidos por jornada × 3 puntos = 18 puntos en disputa por jornada.
    const pts = 18;
    const ptsTemporada = total * 18;
    const lista = partidos.map(p => {
      const l = GL.jugador(p.local_id), v = GL.jugador(p.visitante_id);
      return '· ' + bandera(l && l.pais) + ' ' + GL.nombreJugador(p.local_id).toUpperCase() +
        '  VS  ' + bandera(v && v.pais) + ' ' + GL.nombreJugador(p.visitante_id).toUpperCase();
    }).join('\n');
    const participantes = partidos.flatMap(p => [p.local_id, p.visitante_id]).filter(Boolean);
    return 'JORNADA ABIERTA — GRUPO ' + letra + '\n' +
      'JORNADA: #' + jornada + ' / #' + total + '\n' +
      'PUNTOS EN DISPUTA: #' + pts + ' / #' + ptsTemporada + '\n\n' +
      'HORARIOS DE JORNADA (hora local de cada jugador):\n' + horariosTexto(participantes) + '\n' +
      'Referencia: ' + CONFIG.HORA_INICIO_REFERENCIA + '–' + CONFIG.HORA_FIN_REFERENCIA +
      ' en ' + GL.etiquetaZona(CONFIG.ZONA_REFERENCIA) + '.\n\n' +
      'Formato: Mismo día\n\n' +
      (lista || '· Partidos por definir') + '\n\n' +
      'Al finalizar el tiempo reglamentario, se publicarán los marcadores y estadísticas.\n' +
      'Cualquier partido no jugado se resolverá según el reglamento.\n\n' +
      'Buena suerte a todos los participantes.';
  }

  async function generarCierre(grupoId, jornada) {
    const letra = GL.letraGrupo(GL.grupo(grupoId));
    const total = (GL.torneo() && Number(GL.torneo().total_jornadas)) || 22;
    const filas = GL.clasificacion(grupoId);
    const ids = new Set((GL.ctx.miembros || []).filter(m => m.grupo_id === grupoId).map(m => m.jugador_id));
    const datos = filas.filter(f => ids.has(f.jugador_id));
    const tabla = ['JORNADA CERRADA — GRUPO ' + letra, 'JORNADA: #' + jornada + ' / #' + total, '',
      'TABLA DE POSICIONES', '════════════════════════════════════════',
      '#  JUGADOR                 PJ  G  E  P  DIF  PTS'];
    datos.forEach((f, i) => {
      const nombre = String(GL.nombreJugador(f.jugador_id)).toUpperCase().slice(0, 20).padEnd(21);
      tabla.push(String(i + 1).padStart(2) + ' ' + nombre +
        String(f.pj || 0).padStart(3) + ' ' + String(f.pg || 0).padStart(2) + ' ' +
        String(f.pe || 0).padStart(2) + ' ' + String(f.pp || 0).padStart(2) + ' ' +
        GL.signo(f.dif).padStart(5) + ' ' + String(f.pts || 0).padStart(4));
    });
    tabla.push('════════════════════════════════════════');
    const partidos = (await GL.partidos({ torneo_id: GL.torneo().id, jornada, grupo_id: grupoId }))
      .filter(p => p.estado !== 'pendiente');
    // Separar partidos reales de administrativos para estadísticas correctas
    const jugados     = partidos.filter(p => p.estado === 'jugado');
    const admin       = partidos.filter(p => GL.esAdministrativo(p));

    const golesReales = jugados.reduce((a, p) => {
      const r = GL.golesReales(p);
      return a + r.gf + r.gc;
    }, 0);

    // Mejor partido: solo entre partidos realmente jugados (más goles en FC Mobile)
    const mejores = jugados.slice().sort((a, b) => {
      const ra = GL.golesReales(a), rb = GL.golesReales(b);
      return (rb.gf + rb.gc) - (ra.gf + ra.gc);
    })[0];

    tabla.push('', 'ESTADÍSTICAS DE LA JORNADA',
      '· Partidos jugados en FC Mobile: ' + jugados.length +
        (admin.length ? ' (' + admin.length + ' resueltos por reglamento)' : ''),
      '· Goles marcados en FC Mobile: ' + golesReales);

    if (mejores) {
      const rm = GL.golesReales(mejores);
      tabla.push('· Mejor partido: ' +
        GL.nombreJugador(mejores.local_id) + ' ' + rm.gf + ' - ' + rm.gc +
        ' ' + GL.nombreJugador(mejores.visitante_id));
    }

    // Goleadores: solo goles reales marcados en FC Mobile, nunca administrativos
    const porGoles = {};
    jugados.forEach(p => {
      const r = GL.golesReales(p);
      porGoles[p.local_id]     = (porGoles[p.local_id]     || 0) + r.gf;
      porGoles[p.visitante_id] = (porGoles[p.visitante_id] || 0) + r.gc;
    });
    const topGoles = Object.entries(porGoles)
      .filter(([, g]) => g > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (topGoles.length) {
      tabla.push('· Más goles en FC Mobile: ' + topGoles.map(([id, g]) =>
        bandera(GL.paisJugador(id)) + ' ' + GL.nombreJugador(id) + ' (' + g + ')').join(', '));
    }
    if (admin.length) {
      tabla.push('· Resultados por reglamento: ' + admin.map(p =>
        GL.nombreJugador(p.local_id) + ' vs ' + GL.nombreJugador(p.visitante_id) +
        ' (' + (ESTADOS_PARTIDO[p.estado] && ESTADOS_PARTIDO[p.estado].label || p.estado) + ')'
      ).join(', '));
    }
    tabla.push('', 'Resultados oficiales publicados. ¡Nos vemos en la próxima jornada!');
    return tabla.join('\n');
  }

  Modulos.mensajes = Mod;
})();
