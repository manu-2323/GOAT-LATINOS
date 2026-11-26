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
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Calendario de la liga</h2>' +
            '<p>Ida y vuelta · 12 jugadores por grupo · El local crea el partido en FC Mobile</p></div>' +
            '<div class="seccion-acciones">' + (GL.esAdmin() ?
              '<button type="button" class="btn sm" data-generar>' + icono('sparkles', 16) + 'Generar calendario</button>' : '') +
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
      } catch (e) { console.error(e); el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'el fixture'), null, 'el fixture'); }
      iniciarIconos();
    },

    async generar(el) {
      if (!(await GL.asegurarAdmin(el))) return;
      const torneo = GL.torneo();
      if (!torneo) { GL.notificar('No hay torneo activo.', 'error'); return; }

      // ── Pre-validación en cliente ──────────────────────────────────────────
      const grupos = GL.grupos();
      const ctx    = GL.ctx;

      const conteos = grupos.map(g => {
        const ids = new Set((ctx.miembros || [])
          .filter(m => m.grupo_id === g.id)
          .map(m => m.jugador_id));
        const activos = ctx.jugadores.filter(j => j.activo !== false && ids.has(j.id));
        return { g, n: activos.length, jugadores: activos };
      });
      const mal = conteos.filter(c => c.n !== 12);
      if (mal.length) {
        GL.notificar(
          'Cada grupo necesita exactamente 12 jugadores activos. ' +
          mal.map(c => 'Grupo ' + GL.letraGrupo(c.g) + ': tiene ' + c.n).join(' · ') + '.',
          'error'
        );
        return;
      }

      // Bloquear si ya hay resultados cargados
      const existentes = await GL.partidos({ torneo_id: torneo.id });
      const conResultado = existentes.filter(p =>
        Number(p.jornada) <= 22 && p.estado !== 'pendiente');
      if (conResultado.length) {
        GL.notificar(
          'Ya hay ' + conResultado.length + ' resultado(s) cargado(s). ' +
          'No se puede regenerar el calendario. Creá una nueva temporada para empezar de cero.',
          'error'
        );
        return;
      }

      // ── Previsualización antes de confirmar ───────────────────────────────
      await mostrarPrevisualizacion(conteos, existentes.length, torneo, el);
    }
  };
  /* ── Pantalla de previsualización antes de generar ──────────────────────── */
  function mostrarPrevisualizacion(conteos, pendientesExistentes, torneo, el) {
    return new Promise(resolve => {
      // Simular el fixture en memoria para mostrarlo antes de confirmar
      const previews = conteos.map(({ g, jugadores }) => {
        const ids = jugadores.map(j => j.id);
        const rondas = roundRobin(ids); // 11 rondas de ida
        // Jornada 1 (ida) y jornada 12 (vuelta) como muestra
        const j1 = rondas[0] || [];
        const j12 = j1.map(([a, b]) => [b, a]); // vuelta invertida
        return { g, jugadores, j1, j12, totalPartidos: rondas.length * j1.length * 2 };
      });

      const htmlGrupo = ({ g, jugadores, j1, j12, totalPartidos }) => {
        const letra = GL.letraGrupo(g);
        const htmlJornada = (partidos, nJornada) =>
          '<div style="margin-bottom:8px">' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Jornada ' + nJornada + ' (muestra)</div>' +
          partidos.map(([a, b]) =>
            '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 6px;background:var(--bg-secondary);border-radius:4px;margin-bottom:2px">' +
            '<span style="color:var(--text-primary)">' + esc(GL.nombreJugador(a)) + '</span>' +
            '<span style="color:var(--text-muted)">vs</span>' +
            '<span style="color:var(--text-primary)">' + esc(GL.nombreJugador(b)) + '</span></div>'
          ).join('') + '</div>';

        return '<div style="margin-bottom:16px">' +
          '<div style="font-weight:600;font-family:var(--gl-font-sans);font-size:15px;margin-bottom:8px;color:var(--accent-gold)">' +
            icono('users', 14) + ' Grupo ' + letra + ' — ' + jugadores.length + ' jugadores · ' + totalPartidos + ' partidos · 22 jornadas</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            htmlJornada(j1, 1) +
            htmlJornada(j12, 12) +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' +
            icono('info', 14) + ' Jornadas 1–11: ida · Jornadas 12–22: vuelta con equipos invertidos' +
          '</div></div>';
      };

      const advertencia = pendientesExistentes > 0
        ? '<div style="background:rgba(245,197,24,.12);border:1px solid var(--accent-gold);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px">' +
            icono('triangle-alert', 14) +
            ' <strong>Advertencia:</strong> ya existen <strong>' + pendientesExistentes +
            ' partidos pendientes</strong>. Se eliminarán y se reemplazarán por el nuevo calendario.' +
          '</div>'
        : '';

      const infoReglas =
        '<div style="background:var(--bg-hover);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--text-secondary)">' +
          '<strong style="color:var(--text-primary)">El sistema garantiza:</strong><br>' +
          '· Exactamente 12 jugadores por grupo<br>' +
          '· 6 partidos por jornada · 22 jornadas · 132 partidos por grupo · 264 en total<br>' +
          '· Cada par se enfrenta exactamente 2 veces (ida y vuelta)<br>' +
          '· La vuelta invierte local y visitante<br>' +
          '· La operación es atómica: si algo falla, no queda nada a medias' +
        '</div>';

      GL.abrirModal({
        titulo: 'Previsualización del calendario',
        ancho: 'lg',
        cuerpo:
          infoReglas +
          advertencia +
          previews.map(htmlGrupo).join('') +
          '<p style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:8px">' +
            'Se muestran las jornadas 1 y 12 como muestra. La generación completa la realiza PostgreSQL de forma validada.' +
          '</p>',
        acciones:
          '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
          '<button type="button" class="btn" id="prev-confirmar">' +
            icono('sparkles', 16) + 'Confirmar y generar</button>',
        onAbrir(fondo, cerrar) {
          fondo.querySelector('#prev-confirmar').addEventListener('click', async () => {
            const btn = fondo.querySelector('#prev-confirmar');
            btn.disabled = true;
            btn.innerHTML = icono('loader-circle', 16, 'girando') + 'Generando…';
            cerrar();
            await ejecutarGeneracion(torneo, el);
            resolve();
          });
          fondo.querySelector('[data-cerrar]').addEventListener('click', () => { cerrar(); resolve(); });
        }
      });
      iniciarIconos();
    });
  }

  async function ejecutarGeneracion(torneo, el) {
    GL.notificar('Generando calendario…', 'info', 'loader-circle');
    try {
      const { data, error } = await sb.rpc('gl_generar_fixture', {
        p_torneo_id: torneo.id
      });
      if (error) throw new Error(error.message);
      const resultado = data || {};
      if (resultado.ok === false) {
        GL.notificar(resultado.mensaje || 'No se pudo generar el calendario.', 'error');
        return;
      }
      // Mostrar detalle de grupos si está disponible
      const detalle = Array.isArray(resultado.detalle_grupos)
        ? ' (' + resultado.detalle_grupos.map(d => d.grupo + ': ' + d.partidos + ' partidos').join(' · ') + ')'
        : '';
      GL.invalidar();
      await GL.cargarContexto(true);
      GL.notificar((resultado.mensaje || 'Calendario generado correctamente.') + detalle, 'exito', 'calendar-check');
      Mod.jornada = 1;
      Mod.render(el);
    } catch (e) {
      console.error('gl_generar_fixture:', e);
      GL.notificar(GL.mensaje(e, 'guardar', 'el fixture'), 'error');
    }
  }

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
    if (!partidos.length) return GL.vacio('No hay partidos en esta jornada. Generá el calendario desde el botón superior.',
      'calendar-x', null);
    const yo = Auth.jugador && Auth.jugador.id;
    const visibles = partidos.filter(p => !Mod.soloMios || p.local_id === yo || p.visitante_id === yo);
    if (!visibles.length) return GL.vacio('No tenés partidos en esta jornada.', 'filter', null);
    return '<div class="partidos-lista">' + visibles.map((p, i) => {
      const r = GL.resultado(p);
      const local = GL.jugador(p.local_id) || {};
      const visita = GL.jugador(p.visitante_id) || {};
      const horarioLocal = GL.horarioJugador(local);
      const horarioVisita = GL.horarioJugador(visita);
      const waLocal = GL.linkWhatsapp(local, local.nombre_usuario);
      const waVisita = GL.linkWhatsapp(visita, visita.nombre_usuario);
      const contacto = (waLocal || waVisita)
        ? '<div class="horario-linea" style="justify-content:space-between;flex-wrap:wrap">' +
            (waLocal || '<span></span>') + (waVisita || '<span></span>') + '</div>'
        : '';
      return '<div class="partido-card partido-card-fixture" style="animation-delay:' + (i * .04) + 's">' +
        '<div class="equipo-row local">' +
          '<div class="equipo">' + icono('home', 16) +
            '<span>' + esc(GL.nombreJugador(p.local_id)) + '</span>' + GL.banderaHTML(local.pais, 15) + '</div></div>' +
        '<div class="marcador-centro">' +
          '<div class="marcador ' + (r.pendiente ? '' : 'jugado') + '">' + r.texto + '</div>' +
          '<div class="estado-mini" style="justify-content:center;margin-top:4px">' + icono(r.estado.icono, 12) + r.estado.label + '</div></div>' +
        '<div class="equipo-row visita">' +
          '<div class="equipo visita">' + GL.banderaHTML(visita.pais, 15) +
            '<span>' + esc(GL.nombreJugador(p.visitante_id)) + '</span>' + icono('plane', 16) + '</div></div>' +
        '<div class="detalles-partido">' +
          '<div class="horario-linea">' + icono('clock', 14) +
            '<span>' + esc(GL.nombreJugador(p.local_id)) + ': ' + esc(horarioLocal) + '</span></div>' +
          '<div class="horario-linea">' + icono('clock', 14) +
            '<span>' + esc(GL.nombreJugador(p.visitante_id)) + ': ' + esc(horarioVisita) + '</span></div>' +
          contacto +
        '</div></div>';
    }).join('') + '</div>' +
      '<p class="nota-pie">' + esc(GL.notaHorarios()) + '</p>';
  }

  Modulos.fixture = Mod;
  GL.fixtureRoundRobin = roundRobin;
})();
