/* =====================================================================
   MÓDULO 8 — Eliminatorias (bracket visual, ida y vuelta)
   Los cruces se guardan en `partidos` con jornadas 23 a 30.
   ===================================================================== */
(function () {
  const BASE = {
    previa: CONFIG.JORNADA_PLAYOFF_INICIO,      // 23-24
    cuartos: CONFIG.JORNADA_PLAYOFF_INICIO + 2, // 25-26
    semis: CONFIG.JORNADA_PLAYOFF_INICIO + 4,   // 27-28
    final: CONFIG.JORNADA_PLAYOFF_INICIO + 6    // 29-30
  };
  const FASES = [
    { key: 'previa',  titulo: 'Ronda previa' },
    { key: 'cuartos', titulo: 'Cuartos de final' },
    { key: 'semis',   titulo: 'Semifinales' },
    { key: 'final',   titulo: 'Final' }
  ];

  const Mod = {
    titulo: 'Eliminatorias',
    partidos: [],
    seeds: null,

    async render(el) {
      el.innerHTML = GL.skeleton(6);
      try {
        await GL.cargarContexto(true);
        if (!GL.torneo()) {
          el.innerHTML = GL.vacio('No hay ningún torneo activo. El administrador debe crear uno desde Administración → Configuración.', 'trophy', null);
          iniciarIconos(); return;
        }
        Mod.partidos = (await GL.partidos({ torneo_id: GL.torneoId() }))
          .filter(p => Number(p.jornada) >= BASE.previa);
        Mod.seeds = calcularSeeds();
        const estado = estadoGeneral();
        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Eliminatorias</h2>' +
            '<p>12 clasificados (6 por grupo) · Global ida y vuelta · Gol de visita como desempate</p></div>' +
            '<div class="seccion-acciones">' +
              GL.badge(estado, estado === 'Completa' ? 'green' : 'gold', 'git-merge') +
              '<button type="button" class="btn sec" data-export>' + icono('image', 16) + 'Exportar PNG</button>' +
              (GL.esAdmin() ? '<button type="button" class="btn" data-gen>' + icono('sparkles', 16) + 'Generar ronda</button>' : '') +
            '</div></div>' +
          '<div id="bracket-export" style="padding:8px;background:var(--bg-primary);border-radius:var(--radius)">' +
            '<div id="contenido-bracket"></div>' +
            '<p class="nota-pie mt">Desempate 1: goles de visita · Desempate 2: partido extra en casa del mejor clasificado en fase regular · ' +
              '3er lugar: automático por rendimiento estadístico.</p>' +
          '</div>';
        pintar(el);
        const gen = el.querySelector('[data-gen]');
        if (gen) gen.addEventListener('click', () => generarSiguiente(el));
        el.querySelector('[data-export]').addEventListener('click', () =>
          GL.exportarPNG('bracket-export', 'GOATS_Eliminatorias'));
      } catch (e) { console.error(e); el.innerHTML = GL.error(e.message); }
      iniciarIconos();
    }
  };

  function calcularSeeds() {
    const grupos = GL.grupos();
    const out = {};
    grupos.forEach(g => {
      const ids = new Set((GL.ctx.miembros || []).filter(m => m.grupo_id === g.id).map(m => m.jugador_id));
      out[GL.letraGrupo(g)] = GL.clasificacion(g.id).filter(c => ids.has(c.jugador_id)).slice(0, 6).map(c => c.jugador_id);
    });
    return out;
  }

  function partidosDe(base) {
    return Mod.partidos.filter(p => Number(p.jornada) === base || Number(p.jornada) === base + 1);
  }

  function crucesDe(base) {
    const ida = partidosDe(base).filter(p => Number(p.jornada) === base);
    return ida.map(p => {
      const vuelta = partidosDe(base).find(v => Number(v.jornada) === base + 1 &&
        v.local_id === p.visitante_id && v.visitante_id === p.local_id);
      return { ida: p, vuelta, a: p.local_id, b: p.visitante_id };
    });
  }

  function resultadoCruce(c) {
    if (!c.vuelta) return { completo: false, texto: 'Pendiente', a: 0, b: 0 };
    const r1 = GL.resultado(c.ida), r2 = GL.resultado(c.vuelta);
    const pa1 = r1.gf, pb1 = r1.gc, pa2 = r2.gc, pb2 = r2.gf;
    const a = pa1 + pa2, b = pb1 + pb2;
    const awayA = pa2, awayB = pb1;
    const completo = c.ida.estado !== 'pendiente' && c.vuelta.estado !== 'pendiente';
    let ganador = null, nota = '';
    if (completo) {
      if (a > b) ganador = c.a;
      else if (b > a) ganador = c.b;
      else if (awayA > awayB) { ganador = c.a; nota = 'Gol de visita'; }
      else if (awayB > awayA) { ganador = c.b; nota = 'Gol de visita'; }
      else { nota = 'Desempate por partido extra'; }
    }
    return { completo, a, b, awayA, awayB, ganador, nota,
      texto: completo ? a + ' - ' + b : '—' };
  }

  function ganadores(base) {
    return crucesDe(base).map(resultadoCruce).filter(r => r.ganador).map(r => r.ganador);
  }

  function estadoGeneral() {
    if (!partidosDe(BASE.previa).length) return 'Sin generar';
    if (partidosDe(BASE.final).length && ganadores(BASE.final).length) return 'Completa';
    if (partidosDe(BASE.semis).length && ganadores(BASE.semis).length) return 'Final en curso';
    if (partidosDe(BASE.cuartos).length && ganadores(BASE.cuartos).length) return 'Semifinales';
    return 'Ronda previa';
  }

  function pintar(root) {
    const cont = root.querySelector('#contenido-bracket');
    if (!partidosDe(BASE.previa).length) {
      cont.innerHTML = GL.vacio('Todavía no se generó el bracket. El administrador debe cargar los 6 clasificados por grupo y generar la ronda previa.',
        'git-merge', GL.esAdmin() ? '<button type="button" class="btn mt" data-gen2>' + icono('sparkles', 16) + 'Generar ronda previa</button>' : null);
      const b = cont.querySelector('[data-gen2]');
      if (b) b.addEventListener('click', () => generarSiguiente(root));
      iniciarIconos(); return;
    }
    const columnas = FASES.map(f => {
      const cruces = crucesDe(BASE[f.key]);
      return '<div class="bracket-col"><h3>' + esc(f.titulo) + '</h3>' +
        (cruces.length ? cruces.map((c, i) => htmlCruce(c, f.key, i)).join('') :
          '<div class="bracket-cruce"><p class="vacio-mensaje">Pendiente de ronda anterior</p></div>') +
        '</div>';
    }).join('');
    const campeon = ganadores(BASE.final)[0];
    const tercero = calcularTercero();
    cont.innerHTML =
      '<div class="bracket">' +
        '<svg class="bracket-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M23 10 H27 M23 30 H27 M48 12 H52 M48 38 H52 M73 25 H77"/></svg>' +
        columnas +
        '<div class="bracket-col"><h3>Campeón</h3>' +
          '<div class="bracket-cruce" style="border-color:rgba(245,197,24,.5);text-align:center;padding:18px 8px">' +
            icono('trophy', 30, 'dorado') +
            '<div style="font-family:Rajdhani;font-size:18px;font-weight:700;margin-top:6px">' +
              esc(campeon ? GL.nombreJugador(campeon) : 'Por definir') + '</div></div>' +
          '<div class="bracket-cruce" style="text-align:center"><small class="muted">Tercer lugar</small>' +
            '<div style="font-family:Rajdhani;font-weight:700;color:var(--accent-gold)">' +
              esc(tercero ? GL.nombreJugador(tercero) : 'Por definir') + '</div></div>' +
        '</div>' +
      '</div>';
    cont.querySelectorAll('[data-editar-cruce]').forEach(b => b.addEventListener('click', () => {
      const [base, idx] = b.dataset.editarCruce.split('|').map(Number);
      modalEditarCruce(crucesDe(base)[idx], root);
    }));
    iniciarIconos();
  }

  function htmlCruce(c, fase, idx) {
    const r = resultadoCruce(c);
    const completo = r.completo;
    const gg = (id) => GL.badge(GL.letraGrupo(GL.grupoDeJugador(id)), 'neutral');
    const fila = (id, goles, rival, esGanador) =>
      '<div class="lado ' + (esGanador ? 'ganador' : '') + '"><span>' + esc(GL.nombreJugador(id)) + '</span>' +
      '<b>' + (completo ? goles : '—') + '</b></div>';
    return '<div class="bracket-cruce">' +
      fila(c.a, r.a, c.b, r.ganador === c.a) +
      fila(c.b, r.b, c.a, r.ganador === c.b) +
      '<div class="pies"><span>Ida ' + (c.ida && c.ida.estado !== 'pendiente' ? GL.resultado(c.ida).texto : '—') +
        ' · Vuelta ' + (c.vuelta && c.vuelta.estado !== 'pendiente' ? GL.resultado(c.vuelta).texto : '—') + '</span>' +
        '<span class="global">' + esc(r.texto) + '</span></div>' +
      (r.nota ? '<div style="font-size:10px;color:var(--accent-gold);margin-top:4px">' + esc(r.nota) + '</div>' : '') +
      (GL.esAdmin() ? '<button type="button" class="btn sm sec mt" style="width:100%" data-editar-cruce="' +
        BASE[fase] + '|' + idx + '">' + icono('pencil', 13) + 'Editar marcador</button>' : '') +
      '</div>';
  }

  function calcularTercero() {
    const semis = crucesDe(BASE.semis);
    if (semis.length < 2) return null;
    const perdedores = semis.map(c => {
      const r = resultadoCruce(c);
      if (!r.completo || !r.ganador) return null;
      return r.ganador === c.a ? c.b : c.a;
    }).filter(Boolean);
    if (perdedores.length < 2) return null;
    const pts = id => {
      const f = GL.clasificacion().find(x => x.jugador_id === id);
      return f ? (f.pts || 0) * 1000 + (f.dif || 0) * 10 + (f.gf || 0) : 0;
    };
    return perdedores.sort((a, b) => pts(b) - pts(a))[0];
  }

  function modalEditarCruce(c, root) {
    if (!c || !c.vuelta) { GL.notificar('Primero generá la vuelta de este cruce.', 'advertencia'); return; }
    GL.abrirModal({
      titulo: 'Editar resultado del cruce',
      cuerpo: '<p class="modal-texto">Marcador global = ida + vuelta. El sistema aplica gol de visita automáticamente.</p>' +
        '<div class="campo-row">' +
          '<label class="campo"><span>Ida · ' + esc(GL.nombreJugador(c.a)) + '</span><input class="input" type="number" min="0" id="ec-i-a" value="' + (c.ida.goles_local || 0) + '"></label>' +
          '<label class="campo"><span>Ida · ' + esc(GL.nombreJugador(c.b)) + '</span><input class="input" type="number" min="0" id="ec-i-b" value="' + (c.ida.goles_visitante || 0) + '"></label>' +
        '</div><div class="campo-row">' +
          '<label class="campo"><span>Vuelta · ' + esc(GL.nombreJugador(c.b)) + '</span><input class="input" type="number" min="0" id="ec-v-a" value="' + (c.vuelta.goles_local || 0) + '"></label>' +
          '<label class="campo"><span>Vuelta · ' + esc(GL.nombreJugador(c.a)) + '</span><input class="input" type="number" min="0" id="ec-v-b" value="' + (c.vuelta.goles_visitante || 0) + '"></label>' +
        '</div><p class="nota-pie">Si hay empate global y de goles de visita, ajustá los marcadores para simular el partido extra.</p>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn" id="ec-ok">Guardar</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#ec-ok').addEventListener('click', async () => {
          const num = s => Number(fondo.querySelector(s).value) || 0;
          await sb.from('partidos').update({ estado: 'jugado', goles_local: num('#ec-i-a'), goles_visitante: num('#ec-i-b') }).eq('id', c.ida.id);
          await sb.from('partidos').update({ estado: 'jugado', goles_local: num('#ec-v-a'), goles_visitante: num('#ec-v-b') }).eq('id', c.vuelta.id);
          cerrar(); GL.notificar('Resultado del cruce actualizado.', 'exito');
          Mod.render(root);
        });
      }
    });
    iniciarIconos();
  }

  async function generarSiguiente(root) {
    if (!(await GL.asegurarAdmin(root))) return;
    const gid = GL.grupos()[0] && GL.grupos()[0].id;
    if (!gid) { GL.notificar('No hay grupo para almacenar los cruces.', 'error'); return; }
    const S = Mod.seeds;
    if (!S.A || !S.B || S.A.length < 6 || S.B.length < 6) {
      GL.notificar('Se necesitan 6 clasificados por grupo para armar el bracket.', 'error'); return;
    }
    let cruces = null, fase = null;
    if (!partidosDe(BASE.previa).length) {
      fase = 'Ronda previa';
      cruces = [
        [S.A[2], S.B[5]], [S.A[3], S.B[4]],
        [S.A[4], S.B[3]], [S.A[5], S.B[2]]
      ];
    } else if (!partidosDe(BASE.cuartos).length && ganadores(BASE.previa).length === 4) {
      fase = 'Cuartos de final';
      const w = ganadores(BASE.previa);
      cruces = [[S.A[0], w[0]], [S.A[1], w[1]], [S.B[0], w[2]], [S.B[1], w[3]]];
    } else if (!partidosDe(BASE.semis).length && ganadores(BASE.cuartos).length === 4) {
      fase = 'Semifinales';
      const w = ganadores(BASE.cuartos);
      cruces = [[w[0], w[1]], [w[2], w[3]]];
    } else if (!partidosDe(BASE.final).length && ganadores(BASE.semis).length === 2) {
      fase = 'Final';
      const w = ganadores(BASE.semis);
      cruces = [[w[0], w[1]]];
    }
    if (!cruces) {
      GL.notificar('Completá los resultados de la ronda anterior para generar la siguiente.', 'advertencia'); return;
    }
    const base = BASE[fase === 'Ronda previa' ? 'previa' : fase === 'Cuartos de final' ? 'cuartos' : fase === 'Semifinales' ? 'semis' : 'final'];
    const rows = [];
    cruces.forEach(([a, b]) => {
      rows.push({ torneo_id: GL.torneo().id, grupo_id: gid, jornada: base, local_id: a, visitante_id: b,
        goles_local: 0, goles_visitante: 0, estado: 'pendiente' });
      rows.push({ torneo_id: GL.torneo().id, grupo_id: gid, jornada: base + 1, local_id: b, visitante_id: a,
        goles_local: 0, goles_visitante: 0, estado: 'pendiente' });
    });
    const { error } = await sb.from('partidos').insert(rows);
    if (error) { GL.notificar(error.message, 'error'); return; }
    GL.notificar(fase + ' generada: ' + cruces.length + ' cruces.', 'exito');
    Mod.render(root);
  }

  Modulos.eliminatorias = Mod;
})();
