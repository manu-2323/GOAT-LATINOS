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

  function horariosTexto() {
    const grupos = {};
    Object.entries(PAISES).forEach(([codigo, datos]) => {
      const horario = datos.horario || ZONAS_HORARIAS.medio;
      if (!grupos[horario]) grupos[horario] = [];
      grupos[horario].push(datos.nombre || codigo);
    });
    return Object.entries(grupos).map(([horario, nombres]) => nombres.join(' / ') + ': ' + horario).join('\n');
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
    return 'JORNADA ABIERTA — GRUPO ' + letra + '\n' +
      'JORNADA: #' + jornada + ' / #' + total + '\n' +
      'PUNTOS EN DISPUTA: #' + pts + ' / #' + ptsTemporada + '\n\n' +
      'HORARIOS DE JORNADA (según país):\n' + horariosTexto() + '\n\n' +
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
    const goles = partidos.reduce((a, p) => a + (Number(p.goles_local) || 0) + (Number(p.goles_visitante) || 0), 0);
    const mejores = partidos.slice().sort((a, b) =>
      ((Number(b.goles_local) || 0) + (Number(b.goles_visitante) || 0)) -
      ((Number(a.goles_local) || 0) + (Number(a.goles_visitante) || 0)))[0];
    tabla.push('', 'ESTADÍSTICAS DE LA JORNADA',
      '· Goles totales: ' + goles,
      '· Partidos jugados: ' + partidos.length);
    if (mejores) {
      tabla.push('· Mejor partido: ' + GL.nombreJugador(mejores.local_id) + ' ' + GL.resultado(mejores).texto +
        ' ' + GL.nombreJugador(mejores.visitante_id));
    }
    const porGoles = {};
    partidos.forEach(p => {
      const r = GL.resultado(p);
      porGoles[p.local_id] = (porGoles[p.local_id] || 0) + r.gf;
      porGoles[p.visitante_id] = (porGoles[p.visitante_id] || 0) + r.gc;
    });
    const topGoles = Object.entries(porGoles).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topGoles.length) {
      tabla.push('· Más goles: ' + topGoles.map(([id, g]) =>
        bandera(GL.paisJugador(id)) + ' ' + GL.nombreJugador(id) + ' (' + g + ')').join(', '));
    }
    tabla.push('', 'Resultados oficiales publicados. ¡Nos vemos en la próxima jornada!');
    return tabla.join('\n');
  }

  Modulos.mensajes = Mod;
})();
