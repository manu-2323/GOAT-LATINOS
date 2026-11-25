/* =====================================================================
   MÓDULO 8 — Eliminatorias (bracket visual, ida y vuelta)
   Los cruces se guardan en `partidos` con jornadas 23 a 30.
   Modelo de cruce formalizado:
     fase, numero, a (local ida), b (visitante ida),
     ida, vuelta, extra,
     globalA, globalB, golesVisitaA, golesVisitaB,
     necesitaExtra, ganador, estadoCruce
   ===================================================================== */
(function () {
  const BASE = {
    previa:  CONFIG.JORNADA_PLAYOFF_INICIO,      // 23-24
    cuartos: CONFIG.JORNADA_PLAYOFF_INICIO + 2,  // 25-26
    semis:   CONFIG.JORNADA_PLAYOFF_INICIO + 4,  // 27-28
    final:   CONFIG.JORNADA_PLAYOFF_INICIO + 6   // 29-30
  };
  const FASES = [
    { key: 'previa',  titulo: 'Ronda previa' },
    { key: 'cuartos', titulo: 'Cuartos de final' },
    { key: 'semis',   titulo: 'Semifinales' },
    { key: 'final',   titulo: 'Final' }
  ];
  // Los partidos extra van en una numeración propia (31 en adelante).
  // Antes se usaba base+2: la previa (23) ponía el extra en 25, donde ya
  // jugaban los cuartos, y semis en 29, donde ya jugaba la final.
  const JORNADA_EXTRA_BASE = CONFIG.JORNADA_PLAYOFF_FIN + 1;
  function jornadaExtraPara(fase, numero) {
    const orden = ['previa', 'cuartos', 'semis', 'final'];
    const bloque = Math.max(0, orden.indexOf(fase)) * 10;
    return JORNADA_EXTRA_BASE + bloque + (Number(numero) || 0);
  }

  // Guardia anti-doble-clic para generarSiguiente
  let _generando = false;

  const Mod = {
    titulo: 'Eliminatorias',
    partidos: [],
    seeds: null,

    async render(el) {
      el.innerHTML = GL.skeleton(6);
      try {
        await GL.cargarContexto(true);
        if (!GL.torneo()) {
          el.innerHTML = GL.vacio(
            'No hay ningún torneo activo. El administrador debe crear uno desde Administración → Configuración.',
            'trophy', null);
          iniciarIconos(); return;
        }
        Mod.partidos = (await GL.partidos({ torneo_id: GL.torneoId() }))
          .filter(p => Number(p.jornada) >= BASE.previa);
        Mod.seeds = calcularSeeds();
        const estado = estadoGeneral();
        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Eliminatorias</h2>' +
            '<p>12 clasificados (6 por grupo) · Global ida y vuelta · Gol de visita como desempate · Partido extra si persiste el empate</p></div>' +
            '<div class="seccion-acciones">' +
              GL.badge(estado, estado === 'Completa' ? 'green' : 'gold', 'git-merge') +
              '<button type="button" class="btn sec" data-export>' + icono('image', 16) + 'Exportar PNG</button>' +
              (GL.esAdmin() ? '<button type="button" class="btn" data-gen>' + icono('sparkles', 16) + 'Generar ronda</button>' : '') +
            '</div></div>' +
          '<div id="bracket-export" style="padding:8px;background:var(--bg-primary);border-radius:var(--radius)">' +
            '<div id="contenido-bracket"></div>' +
            '<p class="nota-pie mt">' +
              'Desempate 1: goles de visita · ' +
              'Desempate 2: partido extra en casa del mejor clasificado en fase regular · ' +
              '3er lugar: automático por rendimiento estadístico · ' +
              'Los marcadores de ida y vuelta nunca se modifican para simular desempate.' +
            '</p>' +
          '</div>';
        pintar(el);
        const gen = el.querySelector('[data-gen]');
        if (gen) gen.addEventListener('click', () => generarSiguiente(el));
        el.querySelector('[data-export]').addEventListener('click', () =>
          GL.exportarPNG('bracket-export', 'GOATS_Eliminatorias'));
      } catch (e) { console.error(e); el.innerHTML = GL.error(e.message, null, 'las eliminatorias'); }
      iniciarIconos();
    }
  };

  /* ------------------------------------------------------------------ */
  /* MODELO DE CRUCE FORMALIZADO                                         */
  /* Cada cruce expone todos sus campos de forma explícita.             */
  /* ------------------------------------------------------------------ */

  /**
   * Construye el modelo completo de un cruce a partir de sus partidos.
   * @param {object} ida       - Partido de ida (local = equipo A).
   * @param {object|null} vuelta - Partido de vuelta (local = equipo B).
   * @param {object|null} extra  - Partido extra independiente (es_extra=true).
   * @param {string} fase      - Clave de fase ('previa'|'cuartos'|'semis'|'final').
   * @param {number} numero    - Índice del cruce dentro de la ronda (0-based).
   * @returns {object} Modelo completo del cruce.
   */
  function construirCruce(ida, vuelta, extra, fase, numero) {
    const a = ida.local_id;    // Equipo A: local en la ida
    const b = ida.visitante_id; // Equipo B: visitante en la ida

    const idaJugada   = ida   && ida.estado   !== 'pendiente';
    const vueltaJugada = vuelta && vuelta.estado !== 'pendiente';
    const completo    = idaJugada && vueltaJugada;

    // Marcador global: suma de goles REALES de ambos partidos.
    // gl.golesReales() devuelve {gf:0,gc:0} para partidos administrativos,
    // pero en eliminatorias solo deberían existir partidos 'jugado'.
    // Se usa GL.resultado() para obtener el marcador oficial del partido.
    let globalA = 0, globalB = 0, golesVisitaA = 0, golesVisitaB = 0;
    if (idaJugada) {
      const r1 = GL.resultado(ida);
      globalA    += r1.gf;  // Goles de A en su casa (ida)
      globalB    += r1.gc;  // Goles de B en casa ajena (ida) → goles de visita de B
      golesVisitaB += r1.gc; // B anotó de visita en la ida
    }
    if (vueltaJugada) {
      const r2 = GL.resultado(vuelta);
      // En la vuelta: local=B, visitante=A
      globalB    += r2.gf;  // Goles de B en su casa (vuelta)
      globalA    += r2.gc;  // Goles de A en casa ajena (vuelta) → goles de visita de A
      golesVisitaA += r2.gc; // A anotó de visita en la vuelta
    }

    // Desempate y ganador
    let ganador = null, nota = '', necesitaExtra = false, estadoCruce = 'pendiente';
    if (completo) {
      if (globalA > globalB) {
        ganador = a;
        nota = '';
        estadoCruce = 'resuelto';
      } else if (globalB > globalA) {
        ganador = b;
        nota = '';
        estadoCruce = 'resuelto';
      } else if (golesVisitaA > golesVisitaB) {
        // A marcó más de visita
        ganador = a;
        nota = 'Avanza ' + GL.nombreJugador(a) + ' por gol de visita';
        estadoCruce = 'resuelto_visita';
      } else if (golesVisitaB > golesVisitaA) {
        // B marcó más de visita
        ganador = b;
        nota = 'Avanza ' + GL.nombreJugador(b) + ' por gol de visita';
        estadoCruce = 'resuelto_visita';
      } else {
        // Empate total — se requiere partido extra INDEPENDIENTE
        // No se modifican los marcadores de ida ni vuelta
        if (extra && extra.estado !== 'pendiente') {
          const re = GL.resultado(extra);
          if (re.gf > re.gc) {
            ganador = extra.local_id;
            nota = 'Partido extra: ' + re.gf + '-' + re.gc + ' — avanza ' + GL.nombreJugador(extra.local_id);
          } else if (re.gc > re.gf) {
            ganador = extra.visitante_id;
            nota = 'Partido extra: ' + re.gf + '-' + re.gc + ' — avanza ' + GL.nombreJugador(extra.visitante_id);
          } else {
            // Empate en el extra: gana el local del partido extra (mejor clasificado)
            ganador = extra.local_id;
            nota = 'Partido extra ' + re.gf + '-' + re.gc + ': avanza local (' + GL.nombreJugador(extra.local_id) + ') por mejor posición';
          }
          estadoCruce = 'resuelto_extra';
        } else {
          necesitaExtra = true;
          estadoCruce   = 'necesita_extra';
          nota = 'Empate total — se requiere partido extra';
        }
      }
    } else if (idaJugada) {
      estadoCruce = 'ida_jugada';
    }

    return {
      // Identificación
      fase,
      numero,
      // Equipos
      a,       // Equipo A: local en la ida
      b,       // Equipo B: visitante en la ida
      // Partidos
      ida,
      vuelta,
      extra,   // Partido independiente, nunca altera ida/vuelta
      // Marcador global (calculado a partir de ida+vuelta)
      globalA,
      globalB,
      textoGlobal: completo ? globalA + ' - ' + globalB : '—',
      // Goles de visita (para aplicar el desempate)
      golesVisitaA,
      golesVisitaB,
      // Estado y resolución
      completo,
      necesitaExtra,
      ganador,
      nota,
      estadoCruce  // 'pendiente'|'ida_jugada'|'necesita_extra'|'resuelto'|'resuelto_visita'|'resuelto_extra'
    };
  }

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
    const ida = Mod.partidos.filter(p => Number(p.jornada) === base && !p.es_extra);
    return ida.map((p, i) => {
      const vuelta = Mod.partidos.find(v =>
        Number(v.jornada) === base + 1 &&
        v.local_id === p.visitante_id && v.visitante_id === p.local_id &&
        !v.es_extra);
      // El partido extra tiene es_extra=true y es un partido independiente.
      // Su marcador NUNCA se traslada a ida o vuelta.
      const extra = Mod.partidos.find(v =>
        v.es_extra === true &&
        ((v.local_id === p.local_id    && v.visitante_id === p.visitante_id) ||
         (v.local_id === p.visitante_id && v.visitante_id === p.local_id)));
      const fase = Object.entries(BASE).find(([, v]) => v === base)?.[0] || 'previa';
      return construirCruce(p, vuelta || null, extra || null, fase, i);
    });
  }

  function existeRondaPosterior(fase) {
    const orden = ['previa', 'cuartos', 'semis', 'final'];
    const idx = orden.indexOf(fase);
    for (let i = idx + 1; i < orden.length; i++) {
      if (partidosDe(BASE[orden[i]]).length) return true;
    }
    return false;
  }

  function ganadores(base) {
    return crucesDe(base).map(c => c.ganador).filter(Boolean);
  }

  function estadoGeneral() {
    if (!partidosDe(BASE.previa).length) return 'Sin generar';
    if (partidosDe(BASE.final).length && ganadores(BASE.final).length) return 'Completa';
    if (partidosDe(BASE.semis).length && ganadores(BASE.semis).length) return 'Final en curso';
    if (partidosDe(BASE.cuartos).length && ganadores(BASE.cuartos).length) return 'Semifinales';
    return 'Ronda previa';
  }

  /* ------------------------------------------------------------------ */
  /* GENERAR PARTIDO EXTRA                                               */
  /* ------------------------------------------------------------------ */
  async function generarPartidoExtra(cruce, root) {
    if (!(await GL.asegurarAdmin(root))) return;
    if (cruce.extra) { GL.notificar('Ya existe un partido extra para este cruce.', 'advertencia'); return; }
    if (!cruce.necesitaExtra) { GL.notificar('Este cruce no requiere partido extra.', 'advertencia'); return; }
    const gid = GL.grupos()[0] && GL.grupos()[0].id;
    if (!gid) { GL.notificar('No hay grupo disponible.', 'error'); return; }

    // El local del partido extra es el mejor clasificado en la fase regular.
    const pts = id => {
      const f = GL.clasificacion().find(x => x.jugador_id === id);
      return f ? (f.pts || 0) * 1000 + (f.dif || 0) * 10 + (f.gf || 0) : 0;
    };
    const localExtra = pts(cruce.a) >= pts(cruce.b) ? cruce.a : cruce.b;
    const visitanteExtra = localExtra === cruce.a ? cruce.b : cruce.a;

    // El partido extra usa su propia numeración: nunca solapa con las rondas 23–30.
    const jornadaExtra = jornadaExtraPara(cruce.fase, cruce.numero);

    // Verificar que no exista ya
    const { data: yaExiste } = await sb.from('partidos').select('id')
      .eq('torneo_id', GL.torneo().id).eq('jornada', jornadaExtra)
      .eq('local_id', localExtra).eq('visitante_id', visitanteExtra).eq('es_extra', true).limit(1);
    if (yaExiste && yaExiste.length) {
      GL.notificar('Ya existe un partido extra registrado para este cruce.', 'advertencia'); return;
    }

    const { error } = await sb.from('partidos').insert({
      torneo_id: GL.torneo().id, grupo_id: gid,
      jornada: jornadaExtra,
      local_id: localExtra, visitante_id: visitanteExtra,
      goles_local: 0, goles_visitante: 0,
      estado: 'pendiente',
      es_extra: true
    });
    if (error) { GL.notificar('Error al crear partido extra: ' + error.message, 'error'); return; }
    GL.notificar(
      'Partido extra creado. ' + GL.nombreJugador(localExtra) + ' juega de local (mejor clasificado en fase regular).',
      'exito');
    Mod.render(root);
  }

  /* ------------------------------------------------------------------ */
  /* RENDER DEL BRACKET                                                  */
  /* ------------------------------------------------------------------ */
  function pintar(root) {
    const cont = root.querySelector('#contenido-bracket');
    if (!partidosDe(BASE.previa).length) {
      cont.innerHTML = GL.vacio(
        'Todavía no se generó el bracket. El administrador debe cargar los 6 clasificados por grupo y generar la ronda previa.',
        'git-merge',
        GL.esAdmin() ? '<button type="button" class="btn mt" data-gen2>' + icono('sparkles', 16) + 'Generar ronda previa</button>' : null);
      const b = cont.querySelector('[data-gen2]');
      if (b) b.addEventListener('click', () => generarSiguiente(root));
      iniciarIconos(); return;
    }
    const columnas = FASES.map(f => {
      const cruces = crucesDe(BASE[f.key]);
      return '<div class="bracket-col"><h3>' + esc(f.titulo) + '</h3>' +
        (cruces.length ? cruces.map((c, i) => htmlCruce(c, i)).join('') :
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
    cont.querySelectorAll('[data-editar-cruce-bloqueado]').forEach(b => b.addEventListener('click', () => {
      GL.abrirModal({
        titulo: 'Edición bloqueada',
        cuerpo: '<p class="modal-texto">Esta ronda ya tiene rondas posteriores generadas. ' +
          'Editar sus marcadores afectaría los cruces siguientes.</p>' +
          '<p class="modal-texto">Si necesitás corregir un error, eliminá manualmente las rondas posteriores en Supabase y luego regeneralas desde el sistema.</p>',
        acciones: '<button type="button" class="btn sec" data-cerrar>Entendido</button>'
      });
    }));
    cont.querySelectorAll('[data-generar-extra]').forEach(b => b.addEventListener('click', () => {
      const [base, idx] = b.dataset.generarExtra.split('|').map(Number);
      generarPartidoExtra(crucesDe(base)[idx], root);
    }));
    iniciarIconos();
  }

  function htmlCruce(c, idx) {
    const hayRondaPosterior = existeRondaPosterior(c.fase);
    const fila = (id, goles, esGanador) =>
      '<div class="lado ' + (esGanador ? 'ganador' : '') + '"><span>' + esc(GL.nombreJugador(id)) + '</span>' +
      '<b>' + (c.completo ? goles : '—') + '</b></div>';

    // Detalles del partido extra (es un partido independiente)
    let extraHtml = '';
    if (c.extra && c.extra.estado !== 'pendiente') {
      const re = GL.resultado(c.extra);
      extraHtml = '<div style="font-size:10px;color:var(--accent-blue);margin-top:4px">' +
        icono('zap', 11) + ' Partido extra: ' + re.gf + '-' + re.gc + '</div>';
    } else if (c.necesitaExtra && GL.esAdmin() && !c.extra) {
      extraHtml = '<button type="button" class="btn sm mt" style="width:100%" data-generar-extra="' +
        BASE[c.fase] + '|' + idx + '">' + icono('plus-circle', 13) + 'Crear partido extra</button>';
    } else if (c.necesitaExtra && c.extra) {
      extraHtml = '<div style="font-size:10px;color:var(--accent-gold);margin-top:4px">Partido extra pendiente de resultado.</div>';
    }

    // Botón de edición con validación estricta
    let btnEditar = '';
    if (GL.esAdmin()) {
      if (hayRondaPosterior) {
        btnEditar = '<button type="button" class="btn sm sec mt" style="width:100%;opacity:.5" data-editar-cruce-bloqueado="' +
          BASE[c.fase] + '|' + idx + '">' + icono('lock', 13) + 'Edición bloqueada</button>';
      } else if (c.extra && c.extra.estado !== 'pendiente') {
        // Si el partido extra ya se jugó, bloquear edición de ida/vuelta
        btnEditar = '<button type="button" class="btn sm sec mt" style="width:100%;opacity:.5" data-editar-cruce-bloqueado="' +
          BASE[c.fase] + '|' + idx + '">' + icono('lock', 13) + 'Extra resuelto — bloqueado</button>';
      } else {
        btnEditar = '<button type="button" class="btn sm sec mt" style="width:100%" data-editar-cruce="' +
          BASE[c.fase] + '|' + idx + '">' + icono('pencil', 13) + 'Editar marcador</button>';
      }
    }

    // Nota de desempate (gol de visita o extra)
    const notaHtml = c.nota
      ? '<div style="font-size:10px;color:var(--accent-gold);margin-top:4px">' + esc(c.nota) + '</div>'
      : '';

    return '<div class="bracket-cruce">' +
      fila(c.a, c.globalA, c.ganador === c.a) +
      fila(c.b, c.globalB, c.ganador === c.b) +
      '<div class="pies">' +
        '<span>Ida ' + (c.ida && c.ida.estado !== 'pendiente' ? GL.resultado(c.ida).texto : '—') +
          ' · Vuelta ' + (c.vuelta && c.vuelta.estado !== 'pendiente' ? GL.resultado(c.vuelta).texto : '—') + '</span>' +
        '<span class="global">' + esc(c.textoGlobal) + '</span>' +
      '</div>' +
      notaHtml + extraHtml + btnEditar +
      '</div>';
  }

  function calcularTercero() {
    const semis = crucesDe(BASE.semis);
    if (semis.length < 2) return null;
    const perdedores = semis.map(c => {
      if (!c.completo || !c.ganador) return null;
      return c.ganador === c.a ? c.b : c.a;
    }).filter(Boolean);
    if (perdedores.length < 2) return null;
    const pts = id => {
      const f = GL.clasificacion().find(x => x.jugador_id === id);
      return f ? (f.pts || 0) * 1000 + (f.dif || 0) * 10 + (f.gf || 0) : 0;
    };
    return perdedores.sort((a, b) => pts(b) - pts(a))[0];
  }

  /* ------------------------------------------------------------------ */
  /* MODAL EDITAR CRUCE                                                  */
  /* ------------------------------------------------------------------ */
  function modalEditarCruce(c, root) {
    if (!c) { GL.notificar('Cruce no encontrado.', 'error'); return; }
    if (!c.vuelta) { GL.notificar('Primero generá la vuelta de este cruce.', 'advertencia'); return; }

    // Validación estricta: no editar si hay ronda posterior
    if (existeRondaPosterior(c.fase)) {
      GL.notificar('No podés editar esta ronda: ya existen rondas posteriores generadas.', 'advertencia'); return;
    }
    // Validación estricta: no editar si el partido extra ya fue resuelto
    if (c.extra && c.extra.estado !== 'pendiente') {
      GL.notificar('No podés editar ida/vuelta: el partido extra de este cruce ya tiene resultado registrado.', 'advertencia'); return;
    }

    // Aviso si alguno de los partidos tenía estado administrativo previo
    const estadoAviso = (p, nombre) => {
      if (p && p.estado !== 'pendiente' && p.estado !== 'jugado') {
        return '<p class="modal-texto" style="color:var(--accent-gold)">' +
          icono('triangle-alert', 14) + ' El partido de ' + nombre +
          ' tiene estado "' + (ESTADOS_PARTIDO[p.estado] ? ESTADOS_PARTIDO[p.estado].label : p.estado) +
          '". Al guardar pasará a "Jugado" con el marcador que ingreses.</p>';
      }
      return '';
    };

    GL.abrirModal({
      titulo: 'Editar resultado del cruce',
      cuerpo:
        '<div class="info-box" style="margin-bottom:12px;padding:10px 14px;background:var(--bg-hover);border-radius:8px;font-size:13px">' +
          icono('info', 14) + ' El global se calcula sumando ida + vuelta. ' +
          'El gol de visita se aplica automáticamente si el global empata. ' +
          '<strong>Los marcadores de ida y vuelta son independientes del partido extra.</strong>' +
        '</div>' +
        estadoAviso(c.ida,    'ida')    +
        estadoAviso(c.vuelta, 'vuelta') +
        '<p class="modal-texto" style="font-weight:600;margin-bottom:4px">Partido de ida</p>' +
        '<div class="campo-row">' +
          '<label class="campo"><span>' + esc(GL.nombreJugador(c.a)) + ' (local)</span>' +
            '<input class="input" type="number" min="0" max="30" step="1" id="ec-i-a" value="' + (c.ida.goles_local     ?? 0) + '"></label>' +
          '<label class="campo"><span>' + esc(GL.nombreJugador(c.b)) + ' (visita)</span>' +
            '<input class="input" type="number" min="0" max="30" step="1" id="ec-i-b" value="' + (c.ida.goles_visitante ?? 0) + '"></label>' +
        '</div>' +
        '<p class="modal-texto" style="font-weight:600;margin-bottom:4px;margin-top:10px">Partido de vuelta</p>' +
        '<div class="campo-row">' +
          '<label class="campo"><span>' + esc(GL.nombreJugador(c.b)) + ' (local)</span>' +
            '<input class="input" type="number" min="0" max="30" step="1" id="ec-v-a" value="' + (c.vuelta.goles_local     ?? 0) + '"></label>' +
          '<label class="campo"><span>' + esc(GL.nombreJugador(c.a)) + ' (visita)</span>' +
            '<input class="input" type="number" min="0" max="30" step="1" id="ec-v-b" value="' + (c.vuelta.goles_visitante ?? 0) + '"></label>' +
        '</div>' +
        '<div id="ec-preview" style="margin-top:12px;padding:10px;background:var(--bg-hover);border-radius:8px;font-family:Rajdhani;font-size:15px;text-align:center"></div>',
      acciones:
        '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="ec-ok">Guardar resultado</button>',
      onAbrir(fondo, cerrar) {
        // Vista previa del marcador global en tiempo real
        const preview = fondo.querySelector('#ec-preview');
        const inputs  = ['#ec-i-a','#ec-i-b','#ec-v-a','#ec-v-b'].map(s => fondo.querySelector(s));
        const actualizarPreview = () => {
          const [ia, ib, va, vb] = inputs.map(el => parseInt(el.value, 10));
          if ([ia,ib,va,vb].some(n => isNaN(n) || n < 0)) { preview.textContent = '—'; return; }
          const gA = ia + vb, gB = ib + va;
          const avA = vb, avB = ib; // goles de visita
          let resultado = 'Global: ' + GL.nombreJugador(c.a) + ' ' + gA + ' - ' + gB + ' ' + GL.nombreJugador(c.b);
          if (gA > gB)      resultado += '  →  Avanza ' + GL.nombreJugador(c.a);
          else if (gB > gA) resultado += '  →  Avanza ' + GL.nombreJugador(c.b);
          else if (avA > avB) resultado += '  →  Gol de visita: avanza ' + GL.nombreJugador(c.a);
          else if (avB > avA) resultado += '  →  Gol de visita: avanza ' + GL.nombreJugador(c.b);
          else resultado += '  →  Empate total — se necesitará partido extra';
          preview.textContent = resultado;
        };
        inputs.forEach(el => el.addEventListener('input', actualizarPreview));
        actualizarPreview();

        fondo.querySelector('#ec-ok').addEventListener('click', async () => {
          const btn = fondo.querySelector('#ec-ok');
          btn.disabled = true;
          btn.textContent = 'Guardando…';

          const leerNum = selector => {
            const el  = fondo.querySelector(selector);
            const raw = el ? el.value.trim() : '';
            const n   = parseInt(raw, 10);
            // Entero, entre 0 y 30, sin decimales
            if (raw === '' || isNaN(n) || n < 0 || n > 30 || String(n) !== raw) return null;
            return n;
          };
          const ia = leerNum('#ec-i-a'), ib = leerNum('#ec-i-b');
          const va = leerNum('#ec-v-a'), vb = leerNum('#ec-v-b');

          if ([ia, ib, va, vb].some(v => v === null)) {
            GL.notificar('Todos los marcadores deben ser números enteros entre 0 y 30.', 'advertencia');
            btn.disabled = false; btn.textContent = 'Guardar resultado'; return;
          }

          // Guardar ida
          const r1 = await sb.from('partidos')
            .update({ estado: 'jugado', goles_local: ia, goles_visitante: ib })
            .eq('id', c.ida.id);
          if (r1.error) {
            GL.notificar('Error al guardar la ida: ' + r1.error.message, 'error');
            btn.disabled = false; btn.textContent = 'Guardar resultado'; return;
          }

          // Guardar vuelta — solo si la ida se guardó correctamente
          const r2 = await sb.from('partidos')
            .update({ estado: 'jugado', goles_local: va, goles_visitante: vb })
            .eq('id', c.vuelta.id);
          if (r2.error) {
            GL.notificar('Error al guardar la vuelta: ' + r2.error.message + '. La ida ya quedó guardada. Revisá manualmente.', 'error');
            btn.disabled = false; btn.textContent = 'Guardar resultado'; return;
          }

          cerrar();
          GL.notificar('Resultado del cruce actualizado correctamente.', 'exito');
          Mod.render(root);
        });
      }
    });
    iniciarIconos();
  }

  /* ------------------------------------------------------------------ */
  /* GENERAR SIGUIENTE RONDA                                             */
  /* ------------------------------------------------------------------ */
  async function generarSiguiente(root) {
    // Guardia anti-doble-clic / anti-concurrencia en memoria
    if (_generando) { GL.notificar('Ya se está generando una ronda. Esperá un momento.', 'advertencia'); return; }
    if (!(await GL.asegurarAdmin(root))) return;

    _generando = true;
    const btnGen = root.querySelector('[data-gen]');
    if (btnGen) btnGen.disabled = true;

    try {
      const gid = GL.grupos()[0] && GL.grupos()[0].id;
      if (!gid) { GL.notificar('No hay grupo para almacenar los cruces.', 'error'); return; }
      const S = Mod.seeds;
      if (!S || !S.A || !S.B || S.A.length < 6 || S.B.length < 6) {
        GL.notificar('Se necesitan exactamente 6 clasificados por grupo para armar el bracket.', 'error'); return;
      }

      let cruces = null, fase = null, claveBase = null;

      if (!partidosDe(BASE.previa).length) {
        claveBase = 'previa'; fase = 'Ronda previa';
        cruces = [
          [S.A[2], S.B[5]], [S.A[3], S.B[4]],
          [S.A[4], S.B[3]], [S.A[5], S.B[2]]
        ];
      } else if (!partidosDe(BASE.cuartos).length && ganadores(BASE.previa).length === 4) {
        claveBase = 'cuartos'; fase = 'Cuartos de final';
        const w = ganadores(BASE.previa);
        cruces = [[S.A[0], w[0]], [S.A[1], w[1]], [S.B[0], w[2]], [S.B[1], w[3]]];
      } else if (!partidosDe(BASE.semis).length && ganadores(BASE.cuartos).length === 4) {
        claveBase = 'semis'; fase = 'Semifinales';
        const w = ganadores(BASE.cuartos);
        cruces = [[w[0], w[1]], [w[2], w[3]]];
      } else if (!partidosDe(BASE.final).length && ganadores(BASE.semis).length === 2) {
        claveBase = 'final'; fase = 'Final';
        const w = ganadores(BASE.semis);
        cruces = [[w[0], w[1]]];
      }

      if (!cruces) {
        GL.notificar('Completá los resultados de la ronda anterior para generar la siguiente.', 'advertencia'); return;
      }

      const base = BASE[claveBase];

      // Re-verificar en base de datos que la ronda aún no existe (protección concurrencia)
      const { data: yaExisten, error: errVerif } = await sb.from('partidos').select('id')
        .eq('torneo_id', GL.torneo().id).gte('jornada', base).lte('jornada', base + 1).limit(1);
      if (errVerif) {
        GL.notificar('Error al verificar la base de datos: ' + errVerif.message, 'error'); return;
      }
      if (yaExisten && yaExisten.length) {
        GL.notificar('Esta ronda ya fue generada. Revisá los partidos existentes antes de regenerar.', 'error'); return;
      }

      // Construir todos los partidos de ida y vuelta
      const rows = [];
      cruces.forEach(([a, b]) => {
        rows.push({
          torneo_id: GL.torneo().id, grupo_id: gid, jornada: base,
          local_id: a, visitante_id: b,
          goles_local: 0, goles_visitante: 0, estado: 'pendiente'
        });
        rows.push({
          torneo_id: GL.torneo().id, grupo_id: gid, jornada: base + 1,
          local_id: b, visitante_id: a,
          goles_local: 0, goles_visitante: 0, estado: 'pendiente'
        });
      });

      const { error, data: insertados } = await sb.from('partidos').insert(rows).select('id');
      if (error) {
        GL.notificar('Error al generar la ronda: ' + error.message, 'error'); return;
      }
      if (!insertados || insertados.length !== rows.length) {
        GL.notificar(
          'La ronda se generó parcialmente (' + (insertados ? insertados.length : 0) + ' de ' + rows.length + ' partidos). Revisá la base de datos.',
          'advertencia'); return;
      }

      GL.notificar(fase + ' generada: ' + cruces.length + ' cruces (' + insertados.length + ' partidos).', 'exito');
      Mod.render(root);
    } finally {
      // Siempre liberar la guardia, incluso si hubo error
      _generando = false;
      if (btnGen) btnGen.disabled = false;
    }
  }

  Modulos.eliminatorias = Mod;
})();