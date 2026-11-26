/* =====================================================================
   MÓDULO 2 — Cuadro de partidos (round-robin · 12 jugadores · 22 jornadas)
   =====================================================================
   Vista estructural del torneo: organiza los partidos reales por jornada,
   grupo y estado. La fecha pertenece a la jornada, nunca al partido: cuando
   no existe se muestra "Sin programación" sin inventar horarios.
   ===================================================================== */
(function () {
  const FILTROS = [
    { id: 'todos',          label: 'Todos' },
    { id: 'pendientes',     label: 'Pendientes' },
    { id: 'disputados',     label: 'Disputados' },
    { id: 'sin-programar',  label: 'Sin programación' }
  ];

  const Mod = {
    titulo: 'Cuadro de partidos',
    grupoId: null,
    jornada: 'todas',
    filtro: 'todos',
    soloMios: false,

    setGrupo(id) { Mod.grupoId = id; },

    async render(el) {
      el.innerHTML = GL.skeleton(6);
      try {
        await GL.cargarContexto(true);
        const torneo = GL.torneo();
        if (!torneo) {
          el.innerHTML = GL.vacio('No hay torneo activo todavía.', 'trophy', null);
          iniciarIconos();
          return;
        }
        const grupos = GL.grupos();
        if (!grupos.length) {
          el.innerHTML = GL.vacio('No hay grupos configurados.', 'users', null);
          iniciarIconos();
          return;
        }
        const miGrupo = GL.grupoDeJugador(Auth.jugador && Auth.jugador.id);
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) {
          Mod.grupoId = (miGrupo && miGrupo.id) || grupos[0].id;
        }

        const total = Number(torneo.total_jornadas) || CONFIG.JORNADAS_FASE_REGULAR || 22;
        const todos = await GL.partidos({ torneo_id: torneo.id });
        const { partidos, duplicados } = deduplicar(
          todos.filter(p => p.grupo_id === Mod.grupoId)
        );
        const jornadas = (GL.ctx.jornadas || [])
          .filter(j => j.grupo_id === Mod.grupoId && Number(j.numero) <= total)
          .map(j => Object.assign({}, j, { numero: Number(j.numero) }))
          .sort((a, b) => a.numero - b.numero);
        const mapa = {};
        jornadas.forEach(j => { mapa[j.numero] = j; });

        const datos = construirDatos({
          torneo, grupos, todos, partidos, duplicados, jornadas, mapa, total
        });
        el.innerHTML = htmlVista(datos);
        enlazarVista(el, datos);
      } catch (e) {
        console.error('[cuadro de partidos]', e);
        el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'el cuadro de partidos'), null, 'el cuadro de partidos');
      }
      iniciarIconos();
    },

    async generar(el) {
      if (!(await GL.asegurarAdmin(el))) return;
      const torneo = GL.torneo();
      if (!torneo) { GL.notificar('No hay torneo activo.', 'error'); return; }

      const grupos = GL.grupos();
      const ctx = GL.ctx;

      const conteos = grupos.map(g => {
        const ids = new Set((ctx.miembros || [])
          .filter(m => m.grupo_id === g.id)
          .map(m => m.jugador_id));
        const activos = (ctx.jugadores || []).filter(j => j.activo !== false && ids.has(j.id));
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

      const existentes = await GL.partidos({ torneo_id: torneo.id });
      const conResultado = existentes.filter(p =>
        Number(p.jornada) <= 22 && p.estado !== 'pendiente');
      if (conResultado.length) {
        GL.notificar(
          'Ya hay ' + conResultado.length + ' resultado(s) cargado(s). ' +
          'No se puede regenerar el cuadro de partidos. Creá una nueva temporada para empezar de cero.',
          'error'
        );
        return;
      }

      await mostrarPrevisualizacion(conteos, existentes.length, torneo, el);
    }
  };

  /* --------------------------- Datos --------------------------- */

  function instante(valor) {
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

  function fechaJornada(j) {
    if (!j) return null;
    return instante(j.fecha_inicio) || instante(j.hora_limite) || instante(j.fecha) || null;
  }

  function textoInstante(d) {
    if (!d) return 'Sin fecha asignada';
    const p = GL.partesEnZona(d, CONFIG.ZONA_REFERENCIA);
    const dos = n => String(n).padStart(2, '0');
    return dos(p.day) + '/' + dos(p.month) + '/' + p.year + ' ' +
           dos(p.hour) + ':' + dos(p.minute) + ' (' + GL.etiquetaZona(CONFIG.ZONA_REFERENCIA) + ')';
  }

  function deduplicar(lista) {
    const vistos = new Set();
    const partidos = [];
    const duplicados = [];
    lista.forEach(p => {
      const clave = [p.jornada, p.local_id, p.visitante_id].join('|');
      if (vistos.has(clave)) { duplicados.push(p); return; }
      vistos.add(clave);
      partidos.push(p);
    });
    return { partidos, duplicados };
  }

  function construirDatos(datos) {
    const yo = Auth.jugador && Auth.jugador.id;
    const porJornada = {};
    datos.partidos.forEach(p => {
      const n = Number(p.jornada);
      (porJornada[n] = porJornada[n] || []).push(p);
    });

    const proyectados = [];
    datos.jornadas.forEach(j => {
      const lista = porJornada[j.numero] || [];
      if (!lista.length) return;
      const fecha = fechaJornada(j);
      const visibles = lista.filter(p => aplicaFiltro(p, fecha, yo));
      if (visibles.length) {
        proyectados.push(Object.assign({}, j, {
          fecha,
          partidos: visibles.sort((a, b) => Number(a.id || 0) - Number(b.id || 0)),
          pendientes: visibles.filter(p => p.estado === 'pendiente').length,
          disputados: visibles.filter(p => p.estado !== 'pendiente').length
        }));
      }
    });

    /* Jornadas con partidos pero sin fila en jornadas: se agrupan igual, sin fecha. */
    Object.keys(porJornada).forEach(clave => {
      const numero = Number(clave);
      if (datos.mapa[numero]) return;
      const fecha = null;
      const visibles = porJornada[numero].filter(p => aplicaFiltro(p, fecha, yo));
      if (!visibles.length) return;
      proyectados.push({
        numero,
        estado: 'abierta',
        fecha,
        partidos: visibles,
        pendientes: visibles.filter(p => p.estado === 'pendiente').length,
        disputados: visibles.filter(p => p.estado !== 'pendiente').length,
        sinFila: true
      });
    });

    proyectados.sort((a, b) => a.numero - b.numero);

    const pendientes = datos.partidos.filter(p => p.estado === 'pendiente');
    const sinFecha = pendientes.filter(p => !fechaJornada(datos.mapa[Number(p.jornada)]));

    return Object.assign({}, datos, {
      yo,
      grupo: GL.grupo(Mod.grupoId),
      proyectados,
      totalPendientes: pendientes.length,
      totalDisputados: datos.partidos.length - pendientes.length,
      totalSinFecha: sinFecha.length,
      totalVisibles: proyectados.reduce((n, j) => n + j.partidos.length, 0)
    });
  }

  function aplicaFiltro(p, fecha, yo) {
    if (Mod.soloMios && yo && p.local_id !== yo && p.visitante_id !== yo) return false;
    if (Mod.jornada !== 'todas' && Number(p.jornada) !== Number(Mod.jornada)) return false;
    if (Mod.filtro === 'pendientes') return p.estado === 'pendiente';
    if (Mod.filtro === 'disputados') return p.estado !== 'pendiente';
    if (Mod.filtro === 'sin-programar') return p.estado === 'pendiente' && !fecha;
    return true;
  }

  /* --------------------------- Vista --------------------------- */

  function htmlVista(d) {
    const letra = d.grupo ? GL.letraGrupo(d.grupo) : '—';
    return '<div class="seccion-head"><div class="seccion-titulo">' +
        '<h2>Cuadro de partidos</h2>' +
        '<p>Grupo ' + esc(letra) + ' · Temporada ' + esc(d.torneo.temporada || '—') +
        ' · ' + d.total + ' jornadas · Ida y vuelta</p></div>' +
      '<div class="seccion-acciones">' + (GL.esAdmin()
        ? '<button type="button" class="btn sm" data-generar>' +
            icono('sparkles', 16) + 'Generar cuadro de partidos</button>'
        : '') + '</div></div>' +

      '<div class="grid cuatro fx-resumen">' +
        metrica('calendar-range', d.partidos.length, 'Partidos del grupo', 'blue') +
        metrica('clock', d.totalPendientes, 'Pendientes de resultado', 'orange') +
        metrica('circle-check', d.totalDisputados, 'Disputados', 'green') +
        metrica('calendar-x', d.totalSinFecha, 'Sin programación', 'red') +
      '</div>' +

      '<div class="tabs tabs-grupos">' + d.grupos.map(g =>
        '<button type="button" class="tab' + (g.id === Mod.grupoId ? ' activo' : '') +
        '" data-grupo="' + esc(g.id) + '">Grupo ' + esc(GL.letraGrupo(g)) + '</button>').join('') + '</div>' +

      '<section class="card tight fx-controles" aria-label="Filtros del cuadro de partidos">' +
        '<div class="fx-filtros">' +
          FILTROS.map(f =>
            '<button type="button" class="chip' + (Mod.filtro === f.id ? ' activo' : '') +
            '" data-fx-filtro="' + f.id + '">' + esc(f.label) + '</button>').join('') +
          (Mod.filtro !== 'todos' || Mod.jornada !== 'todas' || Mod.soloMios
            ? '<button type="button" class="chip" data-fx-reset>' +
                icono('rotate-ccw', 14) + 'Limpiar filtros</button>'
            : '') +
        '</div>' +
        '<div class="fx-selectores">' +
          '<label class="selector-jornada"><span>Jornada</span>' +
            '<select class="input" id="selector-jornada">' +
              '<option value="todas"' + (Mod.jornada === 'todas' ? ' selected' : '') + '>Todas</option>' +
              Array.from({ length: d.total }, (_, i) => i + 1).map(n =>
                '<option value="' + n + '"' + (Number(Mod.jornada) === n ? ' selected' : '') +
                '>Jornada ' + n + '</option>').join('') +
            '</select></label>' +
          (Auth.jugador
            ? '<label class="toggle"><input type="checkbox" id="solo-mios"' +
                (Mod.soloMios ? ' checked' : '') + '>' + icono('filter', 14) +
                ' Solo mis partidos</label>'
            : '') +
        '</div>' +
        '<div class="jornada-scroller" aria-label="Acceso rápido a jornadas">' +
          '<button type="button" class="jornada-btn' + (Mod.jornada === 'todas' ? ' activo' : '') +
          '" data-jornada="todas">Todas</button>' +
          Array.from({ length: d.total }, (_, i) => i + 1).map(n =>
            '<button type="button" class="jornada-btn' + (Number(Mod.jornada) === n ? ' activo' : '') +
            '" data-jornada="' + n + '">J' + n + '</button>').join('') +
        '</div>' +
      '</section>' +

      (d.duplicados.length
        ? '<div class="cal-aviso fx-alerta">' + icono('triangle-alert', 16) +
            '<span>Se detectaron ' + d.duplicados.length +
            ' partido(s) repetido(s) en esta jornada/grupo. Se muestran una sola vez; ' +
            'revisá la carga antes de cerrar la jornada.</span></div>'
        : '') +

      (d.proyectados.length
        ? '<div class="fx-jornadas">' + d.proyectados.map(j => htmlJornada(j, d)).join('') + '</div>'
        : GL.vacio('No hay encuentros con estos filtros.', 'filter',
            '<button type="button" class="btn sm sec" data-fx-reset>' +
            icono('rotate-ccw', 14) + 'Limpiar filtros</button>')) +

      '<p class="nota-pie">' + esc(GL.notaHorarios()) +
        ' La fecha mostrada pertenece a la jornada; en ' + CONFIG.NOMBRE_LIGA +
        ' no existe una fecha confirmada por partido.</p>';
  }

  function metrica(ico, valor, etiqueta, clase) {
    return '<div class="card tight cal-metrica ' + clase + '">' +
      '<div class="metrica"><span class="ico">' + icono(ico, 20) + '</span>' +
      '<div><div class="valor">' + esc(valor) + '</div>' +
      '<div class="label">' + esc(etiqueta) + '</div></div></div></div>';
  }

  function htmlJornada(j, d) {
    const when = j.fecha ? textoInstante(j.fecha) : 'Sin programación';
    const programacion = j.fecha
      ? GL.badge('Programada', 'blue', 'calendar-check')
      : GL.badge('Sin programación', 'orange', 'calendar-x');
    return '<section class="card fx-jornada" id="fx-j' + j.numero + '">' +
      '<div class="fx-jornada-cab"><div>' +
        '<span class="badge-jornada">J' + j.numero + '</span>' +
        '<h3>Jornada ' + j.numero + '</h3>' +
        '<p>' + icono('calendar-days', 14) + ' ' + esc(when) + '</p>' +
      '</div><div class="chips">' + programacion +
        GL.badge(j.pendientes + ' pendiente(s)', 'orange', 'clock') +
        GL.badge(j.disputados + ' disputado(s)', 'green', 'circle-check') +
      '</div></div>' +
      '<div class="partidos-lista">' + j.partidos.map(p => htmlPartido(p, j, d)).join('') + '</div>' +
      (j.sinFila
        ? '<p class="nota-pie">Esta jornada tiene partidos pero todavía no tiene fila en jornadas.</p>'
        : '') +
      '</section>';
  }

  function htmlPartido(p, jornada, d) {
    const local = GL.jugador(p.local_id) || {};
    const visita = GL.jugador(p.visitante_id) || {};
    const r = GL.resultado(p);
    const waLocal = GL.linkWhatsapp(local, local.nombre_usuario);
    const waVisita = GL.linkWhatsapp(visita, visita.nombre_usuario);
    const contacto = (waLocal || waVisita)
      ? '<div class="horario-linea" style="justify-content:space-between;flex-wrap:wrap">' +
          (waLocal || '<span></span>') + (waVisita || '<span></span>') + '</div>'
      : '';

    return '<article class="partido-card partido-card-fixture fx-partido">' +
      '<div class="fx-partido-cab">' +
        GL.badge(r.estado.label, r.estado.color, r.estado.icono) +
        (jornada.fecha ? GL.badge('Jornada programada', 'blue', 'calendar-check')
                       : GL.badge('Pendiente de programación', 'orange', 'calendar-x')) +
      '</div>' +
      '<div class="equipo-row local">' +
        '<div class="equipo">' + icono('home', 16) +
          '<span>' + esc(GL.nombreJugador(p.local_id)) + '</span>' +
          GL.banderaHTML(local.pais, 15) + '</div></div>' +
      '<div class="marcador-centro">' +
        '<div class="marcador ' + (r.pendiente ? '' : 'jugado') + '">' + r.texto + '</div>' +
      '</div>' +
      '<div class="equipo-row visita">' +
        '<div class="equipo visita">' + GL.banderaHTML(visita.pais, 15) +
          '<span>' + esc(GL.nombreJugador(p.visitante_id)) + '</span>' +
          icono('plane', 16) + '</div></div>' +
      '<div class="detalles-partido">' +
        '<div class="horario-linea">' + icono('clock', 14) +
          '<span>Local: ' + esc(GL.nombreJugador(p.local_id)) + ' · ' + esc(GL.horarioJugador(local)) + '</span></div>' +
        '<div class="horario-linea">' + icono('clock', 14) +
          '<span>Visitante: ' + esc(GL.nombreJugador(p.visitante_id)) + ' · ' + esc(GL.horarioJugador(visita)) + '</span></div>' +
        '<div class="horario-linea">' + icono('calendar-days', 14) +
          '<span>Jornada: ' + esc(jornada.fecha ? textoInstante(jornada.fecha) : 'Sin fecha asignada') + '</span></div>' +
        contacto +
      '</div></article>';
  }

  function enlazarVista(el, d) {
    el.querySelectorAll('[data-grupo]').forEach(b => b.addEventListener('click', () => {
      Mod.grupoId = b.dataset.grupo;
      Mod.jornada = 'todas';
      Mod.render(el);
    }));
    el.querySelectorAll('[data-jornada]').forEach(b => b.addEventListener('click', () => {
      Mod.jornada = b.dataset.jornada === 'todas' ? 'todas' : Number(b.dataset.jornada);
      Mod.render(el);
    }));
    el.querySelectorAll('[data-fx-filtro]').forEach(b => b.addEventListener('click', () => {
      Mod.filtro = b.dataset.fxFiltro;
      Mod.render(el);
    }));
    const selector = el.querySelector('#selector-jornada');
    if (selector) selector.addEventListener('change', () => {
      Mod.jornada = selector.value === 'todas' ? 'todas' : Number(selector.value);
      Mod.render(el);
    });
    const chk = el.querySelector('#solo-mios');
    if (chk) chk.addEventListener('change', () => { Mod.soloMios = chk.checked; Mod.render(el); });
    const reset = el.querySelector('[data-fx-reset]');
    if (reset) reset.addEventListener('click', () => {
      Mod.filtro = 'todos';
      Mod.jornada = 'todas';
      Mod.soloMios = false;
      Mod.render(el);
    });
    const gen = el.querySelector('[data-generar]');
    if (gen) gen.addEventListener('click', () => Mod.generar(el));
  }

  /* --------------------------- Generación --------------------------- */

  function mostrarPrevisualizacion(conteos, pendientesExistentes, torneo, el) {
    return new Promise(resolve => {
      const previews = conteos.map(({ g, jugadores }) => {
        const ids = jugadores.map(j => j.id);
        const rondas = roundRobin(ids);
        const j1 = rondas[0] || [];
        const j12 = j1.map(([a, b]) => [b, a]);
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
            htmlJornada(j1, 1) + htmlJornada(j12, 12) +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' +
            icono('info', 14) + ' Jornadas 1–11: ida · Jornadas 12–22: vuelta con equipos invertidos' +
          '</div></div>';
      };

      const advertencia = pendientesExistentes > 0
        ? '<div style="background:rgba(245,197,24,.12);border:1px solid var(--accent-gold);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px">' +
            icono('triangle-alert', 14) +
            ' <strong>Advertencia:</strong> ya existen <strong>' + pendientesExistentes +
            ' partidos pendientes</strong>. Se eliminarán y se reemplazarán por el nuevo cuadro de partidos.' +
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
        titulo: 'Previsualización del cuadro de partidos',
        ancho: 'lg',
        cuerpo:
          infoReglas + advertencia + previews.map(htmlGrupo).join('') +
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
    GL.notificar('Generando cuadro de partidos…', 'info', 'loader-circle');
    try {
      const { data, error } = await sb.rpc('gl_generar_fixture', { p_torneo_id: torneo.id });
      if (error) throw new Error(error.message);
      const resultado = data || {};
      if (resultado.ok === false) {
        GL.notificar(resultado.mensaje || 'No se pudo generar el cuadro de partidos.', 'error');
        return;
      }
      const detalle = Array.isArray(resultado.detalle_grupos)
        ? ' (' + resultado.detalle_grupos.map(d => d.grupo + ': ' + d.partidos + ' partidos').join(' · ') + ')'
        : '';
      GL.invalidar();
      await GL.cargarContexto(true);
      GL.notificar((resultado.mensaje || 'Cuadro de partidos generado correctamente.') + detalle,
        'exito', 'calendar-check');
      Mod.jornada = 'todas';
      Mod.render(el);
    } catch (e) {
      console.error('gl_generar_fixture:', e);
      GL.notificar(GL.mensaje(e, 'guardar', 'el cuadro de partidos'), 'error');
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

  Modulos.fixture = Mod;
  GL.fixtureRoundRobin = roundRobin;
})();
