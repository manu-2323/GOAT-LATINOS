/* =====================================================================
   MÓDULO 2 — Fixture round-robin (12 jugadores · 22 jornadas)
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Fixture',
    grupoId: null,
    jornada: 1,
    soloMios: false,

    setGrupo(id) { Mod.grupoId = id; },

    async render(el) {
      el.innerHTML = GL.skeleton(6);
      try {
        await GL.cargarContexto(true);
        const grupos = GL.grupos();
        if (!GL.torneo()) { el.innerHTML = GL.vacio('No hay torneo activo todavía.', 'trophy', null); iniciarIconos(); return; }
        if (!grupos.length) { el.innerHTML = GL.vacio('No hay grupos configurados.'); iniciarIconos(); return; }
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) Mod.grupoId = grupos[0].id;
        const total = (GL.torneo() && Number(GL.torneo().total_jornadas)) || 22;
        if (Mod.jornada > total) Mod.jornada = total;
        const todos = await GL.partidos({ torneo_id: GL.torneo().id });
        const partidos = todos.filter(p => p.grupo_id === Mod.grupoId && Number(p.jornada) === Mod.jornada);

        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Fixture de la liga</h2>' +
            '<p>Ida y vuelta · 12 jugadores por grupo · El local crea el partido en FC Mobile</p></div>' +
            '<div class="seccion-acciones">' + (GL.esAdmin() ?
              '<button type="button" class="btn sm" data-generar>' + icono('sparkles', 16) + 'Generar fixture</button>' : '') +
            '</div></div>' +
          '<div class="tabs tabs-grupos">' + grupos.map(g =>
            '<button type="button" class="tab' + (g.id === Mod.grupoId ? ' activo' : '') + '" data-grupo="' + g.id + '">' +
            'Grupo ' + GL.letraGrupo(g) + '</button>').join('') + '</div>' +
          '<div class="chips" style="margin-bottom:14px">' +
            (Auth.jugador ? '<label class="toggle"><input type="checkbox" id="solo-mios"' + (Mod.soloMios ? ' checked' : '') + '>' + icono('filter', 14) + ' Solo mis partidos</label>' : '') +
            '<span class="badge neutral">' + todos.length + ' partidos cargados</span>' +
          '</div>' +
          '<label class="selector-jornada"><span>Jornada</span>' +
            '<select class="input" id="selector-jornada">' + Array.from({ length: total }, (_, i) => i + 1).map(n =>
              '<option value="' + n + '"' + (n === Mod.jornada ? ' selected' : '') + '>Jornada ' + n + '</option>').join('') +
            '</select></label>' +
          '<div class="jornada-scroller">' + Array.from({ length: total }, (_, i) => i + 1).map(n =>
            '<button type="button" class="jornada-btn' + (n === Mod.jornada ? ' activo' : '') + '" data-jornada="' + n + '">J' + n + '</button>').join('') + '</div>' +
          '<div id="fixture-lista"></div>';

        const lista = el.querySelector('#fixture-lista');
        lista.innerHTML = htmlPartidos(partidos);
        el.querySelectorAll('[data-grupo]').forEach(b => b.addEventListener('click', () => { Mod.grupoId = b.dataset.grupo; Mod.render(el); }));
        el.querySelectorAll('[data-jornada]').forEach(b => b.addEventListener('click', () => { Mod.jornada = Number(b.dataset.jornada); Mod.render(el); }));
        const selJornada = el.querySelector('#selector-jornada');
        if (selJornada) selJornada.addEventListener('change', () => { Mod.jornada = Number(selJornada.value); Mod.render(el); });
        const chk = el.querySelector('#solo-mios');
        if (chk) chk.addEventListener('change', () => { Mod.soloMios = chk.checked; Mod.render(el); });
        const gen = el.querySelector('[data-generar]');
        if (gen) gen.addEventListener('click', () => Mod.generar(el));
      } catch (e) { console.error(e); el.innerHTML = GL.error(e.message); }
      iniciarIconos();
    },

    async generar(el) {
      if (!(await GL.asegurarAdmin(el))) return;
      const grupos = GL.grupos(), ctx = GL.ctx;
      const conteos = grupos.map(g => ({
        g, n: ctx.jugadores.filter(j => (ctx.miembros || []).some(m => m.grupo_id === g.id && m.jugador_id === j.id)).length
      }));
      const mal = conteos.filter(c => c.n !== 12);
      if (mal.length) {
        GL.notificar('Cada grupo debe tener exactamente 12 jugadores asignados (' +
          mal.map(c => 'Grupo ' + GL.letraGrupo(c.g) + ': ' + c.n).join(', ') + ').', 'error');
        return;
      }
      const total = (GL.torneo() && Number(GL.torneo().total_jornadas)) || 22;
      if (total !== CONFIG.JORNADAS_FASE_REGULAR) {
        GL.notificar('El fixture de ida y vuelta requiere exactamente ' + CONFIG.JORNADAS_FASE_REGULAR + ' jornadas.', 'error');
        return;
      }
      const existentes = await GL.partidos({ torneo_id: GL.torneo().id });
      if (existentes.some(p => p.estado !== 'pendiente')) {
        GL.notificar('Ya hay resultados cargados. No se puede regenerar el fixture: eso duplicaría los partidos. Creá una nueva temporada para empezar de cero.', 'error');
        return;
      }
      if (existentes.length) {
        const si = await GL.confirmar('Ya existen ' + existentes.length + ' partidos pendientes. Se borrarán todos y se generará el fixture completo. ¿Continuar?',
          'Regenerar fixture', 'Regenerar');
        if (!si) return;
        const { error } = await sb.from('partidos').delete().eq('torneo_id', GL.torneo().id);
        if (error) { GL.notificar(error.message, 'error'); return; }
      }

      const jornadasRows = [], partidosRows = [];
      grupos.forEach(g => {
        const ids = ctx.jugadores.filter(j => (ctx.miembros || []).some(m => m.grupo_id === g.id && m.jugador_id === j.id)).map(j => j.id);
        const rondas = roundRobin(ids);
        for (let n = 1; n <= total; n++) {
          jornadasRows.push({ torneo_id: GL.torneo().id, grupo_id: g.id, numero: n,
            estado: 'abierta', fecha: null });
        }
        rondas.forEach((ronda, idx) => {
          ronda.forEach(([local, visita]) => {
            if (!local || !visita) return;
            partidosRows.push({
              torneo_id: GL.torneo().id, grupo_id: g.id, jornada: idx + 1,
              local_id: local, visitante_id: visita, goles_local: 0, goles_visitante: 0,
              estado: 'pendiente', ingresado_por: Auth.jugador ? Auth.jugador.id : null
            });
            partidosRows.push({
              torneo_id: GL.torneo().id, grupo_id: g.id, jornada: idx + 1 + rondas.length,
              local_id: visita, visitante_id: local, goles_local: 0, goles_visitante: 0,
              estado: 'pendiente', ingresado_por: Auth.jugador ? Auth.jugador.id : null
            });
          });
        });
      });

      try {
        for (const row of jornadasRows) {
          const { error } = await sb.from('jornadas').upsert(row, { onConflict: 'torneo_id,grupo_id,numero' });
          if (error && !/duplicate|unique/i.test(error.message)) console.warn('jornada:', error.message);
        }
        for (let i = 0; i < partidosRows.length; i += 60) {
          const { error } = await sb.from('partidos').insert(partidosRows.slice(i, i + 60));
          if (error) throw error;
        }
        GL.invalidar();
        await GL.cargarContexto(true);
        GL.notificar('Fixture generado: ' + partidosRows.length + ' partidos.', 'exito');
        Mod.jornada = 1;
        Mod.render(el);
      } catch (e) { GL.notificar('No se pudo generar el fixture: ' + e.message, 'error'); }
    }
  };

  /* Circle method: devuelve 11 rondas de 6 cruces (BYE incluido si hace falta). */
  function roundRobin(ids) {
    const arr = ids.slice();
    if (arr.length % 2) arr.push(null);
    const n = arr.length, rondas = [];
    for (let r = 0; r < n - 1; r++) {
      const pares = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        if (!a || !b) continue;
        pares.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rondas.push(pares);
      arr.splice(1, 0, arr.pop());
    }
    return rondas;
  }

  function htmlPartidos(partidos) {
    if (!partidos.length) return GL.vacio('No hay partidos en esta jornada. Generá el fixture desde el botón superior.',
      'calendar-x', null);
    const yo = Auth.jugador && Auth.jugador.id;
    const visibles = partidos.filter(p => !Mod.soloMios || p.local_id === yo || p.visitante_id === yo);
    if (!visibles.length) return GL.vacio('No tenés partidos en esta jornada.', 'filter', null);
    return '<div class="partidos-lista">' + visibles.map((p, i) => {
      const r = GL.resultado(p);
      const local = GL.jugador(p.local_id) || {};
      const visita = GL.jugador(p.visitante_id) || {};
      const horario = GL.horarioPais(local.pais);
      const waLocal = GL.linkWhatsapp(local.telefono, local.nombre_usuario);
      const waVisita = GL.linkWhatsapp(visita.telefono, visita.nombre_usuario);
      const contacto = (waLocal || waVisita)
        ? '<div class="horario-linea" style="justify-content:space-between;flex-wrap:wrap">' +
            (waLocal || '<span></span>') + (waVisita || '<span></span>') + '</div>'
        : '';
      return '<div class="partido-card partido-card-fixture" style="animation-delay:' + (i * .04) + 's">' +
        '<div class="equipo-row local">' +
          '<div class="equipo">' + icono('home', 15) +
            '<span>' + esc(GL.nombreJugador(p.local_id)) + '</span>' + GL.banderaHTML(local.pais, 15) + '</div></div>' +
        '<div class="marcador-centro">' +
          '<div class="marcador ' + (r.pendiente ? '' : 'jugado') + '">' + r.texto + '</div>' +
          '<div class="estado-mini" style="justify-content:center;margin-top:4px">' + icono(r.estado.icono, 12) + r.estado.label + '</div></div>' +
        '<div class="equipo-row visita">' +
          '<div class="equipo visita">' + GL.banderaHTML(visita.pais, 15) +
            '<span>' + esc(GL.nombreJugador(p.visitante_id)) + '</span>' + icono('plane', 15) + '</div></div>' +
        '<div class="detalles-partido">' +
          '<div class="horario-linea" style="justify-content:center">' + icono('clock', 13) +
            '<span>Horario ' + esc(GL.nombrePais(local.pais)) + ': ' + esc(horario) + '</span></div>' +
          contacto +
        '</div></div>';
    }).join('') + '</div>';
  }

  Modulos.fixture = Mod;
  GL.fixtureRoundRobin = roundRobin;
})();
