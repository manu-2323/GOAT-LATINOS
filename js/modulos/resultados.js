/* =====================================================================
   MÓDULO 3 — Registro y corrección de resultados (solo admin)
   Modo A: análisis de captura con Gemini Flash (vía Edge Function)
   Modo B: ingreso manual
   FASE 3.15: validación estricta, historial real y trazabilidad de cambios.
   FASE 3.21: jornada y grupo contextuales, filtros sobre datos y escritura
   verificada contra el estado real de la jornada.
   ===================================================================== */
(function () {
  /* Contrato desplegado de gl_guardar_resultado_interno: solo estos estados.
     Las resoluciones por expulsión se registran al cerrar la jornada; ofrecerlas
     aquí produciría un rechazo del RPC y un falso éxito en la interfaz. */
  const ESTADOS_GUARDABLES = ['jugado', 'walkover_local', 'walkover_visitante', 'doble_ausencia'];
  const ESTADOS_CANONICOS = ['walkover_local', 'walkover_visitante', 'doble_ausencia'];
  const MAX_GOLES = 99;
  const DIAS_RECIENTES = 7;

  const Mod = {
    titulo: 'Resultados',
    modo: 'manual',
    vista: 'carga',          // 'carga' | 'historial'
    partidoId: null,
    jornada: null,          // FASE 3.21: jornada abierta seleccionada (null = primera abierta)
    grupo: null,            // FASE 3.21: grupo seleccionado (null = todos)
    archivo: null,
    datosIA: null,
    analizando: false,
    guardando: false,        // bloquea clics y solicitudes simultáneas
    partidos: [],            // una sola consulta por render, reutilizada por ambas vistas
    corregidos: new Set(),   // correcciones confirmadas en esta sesión (sin columnas nuevas)

    async render(el) {
      el.innerHTML = GL.skeleton(6);
      if (!(await GL.asegurarAdmin(el))) return;
      try {
        await GL.cargarContexto(true);
        if (!GL.torneo()) {
          el.innerHTML = GL.vacio('No hay torneo activo. Crealo desde Administración → Configuración.', 'trophy', null);
          iniciarIconos();
          return;
        }

        /* FASE 3.21: la jornada se resuelve dentro del grupo seleccionado y
           el filtro de grupo se aplica a los datos, no sólo a las tarjetas. */
        const consulta = await GL.partidos({ torneo_id: GL.torneo().id });
        const { partidos, duplicados } = deduplicar(Array.isArray(consulta) ? consulta : []);
        Mod.partidos = partidos;

        const abiertas = jornadasAbiertas(Mod.grupo);
        const jn = jornadaElegida(abiertas);
        Mod.jornada = jn;
        const deJornada = partidosDeJornada(jn, Mod.grupo);
        const pendientes = deJornada.filter(p => p.estado === 'pendiente');
        const jugados = deJornada.length - pendientes.length;
        const progreso = deJornada.length ? Math.round((jugados / deJornada.length) * 100) : 0;
        const totalJornadas = Number((GL.torneo() && GL.torneo().total_jornadas) || 22);
        const historial = Mod.partidos
          .filter(p => p.estado && p.estado !== 'pendiente')
          .sort((a, b) => Number(b.jornada) - Number(a.jornada) || String(b.id).localeCompare(String(a.id)));

        const pool = Mod.vista === 'historial' ? historial : pendientes;
        if (Mod.partidoId && !pool.some(p => p.id === Mod.partidoId)) Mod.partidoId = null;
        if (!Mod.partidoId && pool.length) Mod.partidoId = pool[0].id;

        el.innerHTML =
          '<div class="r7-pantalla" data-resultados>' +
            '<header class="r7-hero">' +
              '<div class="r7-hero-copy">' +
                '<span class="r7-eyebrow">' + icono('clipboard-check', 14) + 'Dirección del torneo · Resultados</span>' +
                '<h1 class="r7-titulo">Carga de resultados</h1>' +
                '<p class="r7-bajada">' +
                  (jn ? 'Jornada ' + jn + (Mod.grupo ? ' · Grupo ' + esc(etiquetaGrupo(Mod.grupo)) : '') +
                        ' · Validá el marcador antes de guardar. El cálculo de tabla es automático.'
                      : 'No hay jornada abierta' + (Mod.grupo ? ' en este grupo' : '') +
                        '. Podés consultar y corregir el historial; abrí una jornada para cargar resultados nuevos.') +
                '</p>' +
              '</div>' +
              '<div class="r7-hero-acciones">' +
                GL.badge((jn || '—') + ' / ' + totalJornadas, 'gold', 'flag') +
                GL.badge(historial.length + ' registrados', 'neutral', 'list-checks') +
              '</div>' +
            '</header>' +
            '<section class="r7-kpis" aria-label="Progreso de la jornada">' +
              r7Kpi(pendientes.length, 'Pendientes', 'Partidos sin resultado', 'clock', true, progreso) +
              r7Kpi(jugados, 'Cargados', 'Resultados ya registrados', 'check-circle-2') +
              r7Kpi(deJornada.length, 'Total', 'Partidos de la jornada', 'calendar-days') +
              r7Kpi(progreso + '%', 'Progreso', 'Jornada en curso', 'chart-no-axes-column') +
            '</section>' +
            '<div class="r7-tabs r7-tabs-vistas" role="tablist" aria-label="Sección de resultados">' +
              '<button type="button" class="r7-tab' + (Mod.vista === 'carga' ? ' activo' : '') +
                '" data-vista="carga" role="tab" aria-selected="' + (Mod.vista === 'carga') + '">' +
                icono('clipboard-check', 16) + 'Cargar resultados</button>' +
              '<button type="button" class="r7-tab' + (Mod.vista === 'historial' ? ' activo' : '') +
                '" data-vista="historial" role="tab" aria-selected="' + (Mod.vista === 'historial') + '">' +
                icono('history', 16) + 'Historial (' + historial.length + ')</button>' +
            '</div>' +
            (duplicados.length
              ? '<div class="r7-aviso r7-aviso-duplicados">' + icono('triangle-alert', 14) +
                '<span>Se detectaron ' + duplicados.length + ' partidos repetidos en el torneo. ' +
                'Se muestran una sola vez para evitar cargar el mismo resultado dos veces.</span></div>'
              : '') +
            (Mod.vista === 'carga'
              ? '<div class="r7-tabs" role="tablist" aria-label="Modo de carga">' +
                  '<button type="button" class="r7-tab' + (Mod.modo === 'manual' ? ' activo' : '') +
                    '" data-modo="manual" role="tab" aria-selected="' + (Mod.modo === 'manual') + '">' +
                    icono('keyboard', 16) + 'Ingreso manual</button>' +
                  '<button type="button" class="r7-tab' + (Mod.modo === 'ia' ? ' activo' : '') +
                    '" data-modo="ia" role="tab" aria-selected="' + (Mod.modo === 'ia') + '">' +
                    icono('scan-eye', 16) + 'Análisis de captura (IA)</button>' +
                '</div>'
              : '') +
            '<div class="r7-layout">' +
              (Mod.vista === 'carga'
                ? '<section class="r7-panel r7-lista-panel" aria-labelledby="r7-lista-titulo">' +
                    '<div class="r7-panel-cab"><div><h2 id="r7-lista-titulo">' + icono('list-checks', 18) + 'Partidos pendientes</h2>' +
                      '<p>Seleccioná un encuentro para cargar su resultado.</p></div>' +
                      '<span id="r7-contador" aria-live="polite">' + pendientes.length + (pendientes.length === 1 ? ' partido' : ' partidos') + '</span></div>' +
                    '<div class="r7-filtros">' +
                      '<label class="r7-campo"><span>Jornada abierta</span>' +
                        '<select class="input" id="r7-jornada" aria-label="Elegir jornada abierta">' +
                          opcionesJornadaAbierta(abiertas, jn) +
                        '</select></label>' +
                      '<label class="r7-campo"><span>Grupo</span>' +
                        '<select class="input" id="r7-grupo" aria-label="Filtrar partidos por grupo">' +
                          '<option value="">Todos los grupos</option>' + opcionesGrupo(Mod.partidos, Mod.grupo) +
                        '</select></label>' +
                      '<label class="r7-campo"><span>Buscar partido</span>' +
                        '<span class="r7-input-ico">' + icono('search', 16) +
                          '<input class="input" id="r7-buscar" type="search" placeholder="Ej: jugador o equipo" autocomplete="off" aria-label="Buscar partidos pendientes">' +
                        '</span></label>' +
                      '<button type="button" class="btn sec r7-limpiar" data-r7-limpiar>' + icono('rotate-ccw', 16) + 'Limpiar</button>' +
                    '</div>' +
                    '<div id="lista-pendientes" class="r7-lista">' + htmlLista(pendientes) + '</div>' +
                    '<div class="r7-estado-vacio" id="r7-sin-resultados" hidden>' + icono('search-x', 28) +
                      '<strong>Sin coincidencias</strong><span>Probá con otro nombre o quitá el filtro de grupo.</span>' +
                      '<button type="button" class="btn sec sm" data-r7-limpiar>' + icono('rotate-ccw', 15) + 'Limpiar filtros</button></div>' +
                  '</section>'
                : '<section class="r7-panel r7-lista-panel" aria-labelledby="r7-h-titulo">' +
                    '<div class="r7-panel-cab"><div><h2 id="r7-h-titulo">' + icono('history', 18) + 'Historial de resultados</h2>' +
                      '<p>Consultá partidos disputados y corregí uno cuando sea necesario.</p></div>' +
                      '<span id="r7-h-contador" aria-live="polite">' + historial.length + (historial.length === 1 ? ' resultado' : ' resultados') + '</span></div>' +
                    '<div class="r7-filtros r7-filtros-h">' +
                      '<label class="r7-campo"><span>Buscar participante</span>' +
                        '<span class="r7-input-ico">' + icono('search', 16) +
                          '<input class="input" id="r7-h-buscar" type="search" placeholder="Nombre del jugador" autocomplete="off" aria-label="Buscar en el historial">' +
                        '</span></label>' +
                      '<label class="r7-campo"><span>Jornada</span>' +
                        '<select class="input" id="r7-h-jornada" aria-label="Filtrar historial por jornada">' +
                          '<option value="">Todas</option>' + opcionesJornada(historial) +
                        '</select></label>' +
                      '<label class="r7-campo"><span>Grupo</span>' +
                        '<select class="input" id="r7-h-grupo" aria-label="Filtrar historial por grupo">' +
                          '<option value="">Todos</option>' + opcionesGrupo(historial) +
                        '</select></label>' +
                      '<label class="r7-campo"><span>Estado</span>' +
                        '<select class="input" id="r7-h-estado" aria-label="Filtrar historial por estado">' +
                          '<option value="">Todos</option>' + opcionesEstado(historial) +
                        '</select></label>' +
                      '<label class="r7-check"><input type="checkbox" id="r7-h-recientes">' +
                        '<span>Solo recientes (' + DIAS_RECIENTES + ' días)</span></label>' +
                      '<button type="button" class="btn sec r7-limpiar" data-r7-limpiar-h>' + icono('rotate-ccw', 16) + 'Limpiar</button>' +
                    '</div>' +
                    '<div id="lista-resultados" class="r7-lista">' + htmlHistorial(historial) + '</div>' +
                    '<div class="r7-estado-vacio" id="r7-h-vacio" hidden>' + icono('search-x', 28) +
                      '<strong>Sin resultados para ese filtro</strong>' +
                      '<span>Ajustá la búsqueda, la jornada o el estado.</span>' +
                      '<button type="button" class="btn sec sm" data-r7-limpiar-h>' + icono('rotate-ccw', 15) + 'Limpiar filtros</button></div>' +
                  '</section>') +
              '<section class="r7-panel r7-editor-panel" aria-label="Editor de resultado"><div id="panel-resultado"></div></section>' +
            '</div>' +
          '</div>';

        const panel = el.querySelector('#panel-resultado');
        const pintarPanel = () => {
          const lista = Mod.vista === 'historial' ? historial : pendientes;
          const p = lista.find(x => x.id === Mod.partidoId) || null;
          panel.innerHTML = !p
            ? GL.vacio(Mod.vista === 'historial'
                ? 'Todavía no hay resultados registrados. Cuando se cargue uno, aparecerá acá.'
                : (!jn ? 'No hay jornada abierta. Abrí una desde Administración → Jornadas para cargar resultados.'
                       : 'No hay partidos pendientes en esta jornada.'), 'check-check', null)
            : (Mod.vista === 'historial' || Mod.modo === 'manual' ? htmlManual(p, Mod.vista === 'historial') : htmlIA(p));
          enlazarPanel(panel, p, pintarPanel);
          iniciarIconos();
        };
        Mod._repintar = pintarPanel;
        pintarPanel();

        el.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => {
          if (Mod.guardando) return;
          Mod.vista = b.dataset.vista;
          Mod.partidoId = null; Mod.archivo = null; Mod.datosIA = null;
          Mod.render(el);
        }));
        el.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
          if (Mod.guardando) return;
          Mod.modo = b.dataset.modo; Mod.datosIA = null; Mod.archivo = null; Mod.render(el);
        }));
        el.querySelectorAll('[data-partido],[data-resultado]').forEach(b => b.addEventListener('click', () => {
          if (Mod.guardando) return;
          Mod.partidoId = b.dataset.partido || b.dataset.resultado;
          Mod.archivo = null; Mod.datosIA = null;
          el.querySelectorAll('[data-partido],[data-resultado]').forEach(x =>
            x.classList.toggle('activo', x === b));
          pintarPanel();
        }));
        if (Mod.vista === 'carga') enlazarFiltros(el);
        else enlazarFiltrosHistorial(el);
      } catch (e) {
        console.error(e);
        el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'los resultados'), null, 'los resultados');
      }
      iniciarIconos();
    }
  };

  /* Misma clave que el Cuadro de partidos: jornada|local|visitante. */
  function deduplicar(lista) {
    const vistos = new Set();
    const partidos = [];
    const duplicados = [];
    (lista || []).forEach(p => {
      const clave = [p.jornada, p.local_id, p.visitante_id].join('|');
      if (vistos.has(clave)) { duplicados.push(p); return; }
      vistos.add(clave);
      partidos.push(p);
    });
    return { partidos, duplicados };
  }

  function r7Kpi(valor, etiqueta, nota, ico, principal, progreso) {
    return '<article class="r7-kpi' + (principal ? ' principal' : '') + '">' +
      '<span class="r7-kpi-ico">' + icono(ico, 20) + '</span>' +
      '<span class="r7-kpi-copy">' +
        '<strong class="r7-kpi-valor">' + esc(valor) + '</strong>' +
        '<span class="r7-kpi-label">' + esc(etiqueta) + '</span>' +
        '<span class="r7-kpi-nota">' + esc(nota) + '</span>' +
      '</span>' +
      (principal
        ? '<span class="r7-kpi-bar" role="progressbar" aria-valuenow="' + Number(progreso || 0) +
          '" aria-valuemin="0" aria-valuemax="100" aria-label="Progreso de la jornada">' +
          '<span style="width:' + Number(progreso || 0) + '%"></span></span>'
        : '') +
    '</article>';
  }

  /* ── Contexto deportivo (FASE 3.21) ──────────────────────────────────
     Funciones puras sobre GL.ctx y Mod.partidos: permiten auditar jornada,
     grupo, ausencia de programación y aislamiento sin depender del DOM. */
  function jornadasAbiertas(grupoId) {
    const total = Number((GL.torneo() && GL.torneo().total_jornadas) || 22);
    const vistos = new Set();
    return ((GL.ctx && GL.ctx.jornadas) || [])
      .filter(j => !j.virtual && j.estado === 'abierta' &&
        Number.isFinite(Number(j.numero)) && Number(j.numero) <= total &&
        (!grupoId || !j.grupo_id || j.grupo_id === grupoId))
      .map(j => Number(j.numero))
      .filter(n => { if (vistos.has(n)) return false; vistos.add(n); return true; })
      .sort((a, b) => a - b);
  }

  function jornadaElegida(abiertas) {
    const lista = (abiertas || []).filter(Number.isFinite);
    if (!lista.length) return null;
    if (Mod.jornada !== null && Mod.jornada !== undefined && Mod.jornada !== '' &&
        lista.includes(Number(Mod.jornada))) return Number(Mod.jornada);
    return lista[0];
  }

  function partidosDeJornada(numero, grupoId) {
    if (numero === null || numero === undefined || numero === '') return [];
    return (Mod.partidos || []).filter(p =>
      Number(p.jornada) === Number(numero) && (!grupoId || p.grupo_id === grupoId));
  }

  function etiquetaGrupo(id) {
    const g = typeof GL.grupo === 'function' ? GL.grupo(id) : null;
    return typeof GL.letraGrupo === 'function' ? GL.letraGrupo(g) : id;
  }

  function jornadaDelPartido(p) {
    if (!p || !(GL.ctx && GL.ctx.jornadas)) return null;
    return GL.ctx.jornadas.find(j =>
      Number(j.numero) === Number(p.jornada) &&
      (!j.grupo_id || !p.grupo_id || j.grupo_id === p.grupo_id)) || null;
  }

  function validarContextoEscritura(p, estado, esCorreccion) {
    if (!p) return 'No se identificó el partido. Recargá la vista antes de guardar.';
    if (Mod.grupo && p.grupo_id && Mod.grupo !== p.grupo_id) {
      return 'El partido pertenece a otro grupo. Recargá la vista antes de guardar.';
    }
    const j = jornadaDelPartido(p);
    const numero = 'J' + Number(p.jornada);
    if (esCorreccion) {
      return (j && j.estado === 'cerrada')
        ? 'La ' + numero + ' está cerrada; no se puede corregir este resultado. Reabrí la jornada desde Administración.'
        : null;
    }
    if (!j || j.virtual || j.estado !== 'abierta') {
      return 'La ' + numero + ' no está abierta. Abrí esa jornada desde Administración para cargar resultados nuevos.';
    }
    return null;
  }

  function frescoDe(p, partidosActuales) {
    if (!p) return null;
    return (partidosActuales || []).find(x => x.id === p.id) || null;
  }

  function opcionesGrupo(partidos, seleccionado) {
    return [...new Set((partidos || []).map(p => p.grupo_id).filter(Boolean))].map(id =>
      '<option value="' + esc(id) + '"' + (seleccionado === id ? ' selected' : '') + '>Grupo ' +
      esc(etiquetaGrupo(id)) + '</option>').join('');
  }

  function opcionesJornadaAbierta(abiertas, elegida) {
    const lista = abiertas || [];
    if (!lista.length) return '<option value="">Sin jornada abierta</option>';
    return lista.map(n => '<option value="' + n + '"' + (Number(elegida) === n ? ' selected' : '') +
      '>Jornada ' + n + '</option>').join('');
  }

  function opcionesGuardables(p) {
    return Object.entries(ESTADOS_PARTIDO)
      .filter(([k]) => ESTADOS_GUARDABLES.includes(k) || k === p.estado)
      .map(([k, v]) => '<option value="' + k + '"' + (p.estado === k ? ' selected' : '') + '>' + v.label + '</option>').join('');
  }

  function opcionesJornada(partidos) {
    return [...new Set(partidos.map(p => Number(p.jornada)).filter(Number.isFinite))]
      .sort((a, b) => b - a)
      .map(n => '<option value="' + n + '">Jornada ' + n + '</option>').join('');
  }

  function opcionesEstado(partidos) {
    return [...new Set(partidos.map(p => p.estado).filter(Boolean))]
      .map(k => '<option value="' + esc(k) + '">' + esc((ESTADOS_PARTIDO[k] || {}).label || k) + '</option>').join('');
  }

  function htmlLista(pendientes) {
    if (!pendientes.length) {
      return '<div class="r7-vacio">' + icono('check-check', 28) +
        '<strong>Todos los partidos tienen resultado</strong>' +
        '<span>No hay encuentros pendientes en esta jornada.</span></div>';
    }
    return '<div class="r7-lista-items">' + pendientes.map(p => {
      const cerrada = esCerrada(p);
      const local = esc(GL.nombreJugador(p.local_id));
      const visita = esc(GL.nombreJugador(p.visitante_id));
      const grupo = esc(GL.letraGrupo(GL.grupo(p.grupo_id)));
      return '<button type="button" class="partido-card r7-partido' + (p.id === Mod.partidoId ? ' activo' : '') + '"' +
        ' data-partido="' + esc(p.id) + '" data-r7-nombre="' + esc(local + ' ' + visita) + '"' +
        ' data-r7-grupo="' + esc(p.grupo_id) + '"' +
        (p.id === Mod.partidoId ? ' aria-current="true"' : '') + '>' +
          '<span class="r7-partido-top"><span class="r7-partido-jornada">J' + Number(p.jornada) + ' · Grupo ' + grupo + '</span>' +
            (cerrada ? GL.badge('Cerrada', 'red', 'lock') : GL.badge('Pendiente', 'neutral', 'clock')) + '</span>' +
          '<span class="r7-partido-nombres">' + local + ' <span>vs</span> ' + visita + '</span>' +
          '<span class="r7-partido-foot"><span>Resultado pendiente</span>' + icono('chevron-right', 16) + '</span>' +
        '</button>';
    }).join('') + '</div>';
  }

  function fechaPartido(p) {
    const j = (GL.ctx.jornadas || []).find(x =>
      Number(x.numero) === Number(p.jornada) && (!p.grupo_id || !x.grupo_id || x.grupo_id === p.grupo_id));
    const valor = j && (j.fecha_inicio || j.fecha);
    if (!valor) return 'Sin programación';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return 'Sin programación';
    try {
      return new Intl.DateTimeFormat('es-NI', {
        timeZone: CONFIG.ZONA_REFERENCIA, day: '2-digit', month: 'short', year: 'numeric'
      }).format(fecha);
    } catch (e) {
      return fecha.toISOString().slice(0, 10);
    }
  }

  function esReciente(p) {
    const valor = p.updated_at || p.created_at;
    if (!valor) return false;
    const instante = Date.parse(valor);
    return Number.isFinite(instante) && (Date.now() - instante) <= DIAS_RECIENTES * 24 * 60 * 60 * 1000;
  }

  function htmlHistorial(partidos) {
    if (!partidos.length) {
      return '<div class="r7-vacio">' + icono('history', 28) +
        '<strong>Todavía no hay resultados registrados</strong>' +
        '<span>Cuando se cargue un marcador aparecerá acá con su jornada y su estado.</span></div>';
    }
    return '<div class="r7-lista-items">' + partidos.map(p => {
      const res = GL.resultado(p);
      const local = esc(GL.nombreJugador(p.local_id));
      const visita = esc(GL.nombreJugador(p.visitante_id));
      const cuando = esc(fechaPartido(p));
      const estado = (ESTADOS_PARTIDO[p.estado] || ESTADOS_PARTIDO.pendiente).label;
      const reciente = esReciente(p);
      return '<button type="button" class="partido-card r7-partido r7-partido-h' + (p.id === Mod.partidoId ? ' activo' : '') + '"' +
        ' data-resultado="' + esc(p.id) + '" data-r7-h-nombre="' + esc(local + ' ' + visita) + '"' +
        ' data-r7-h-jornada="' + Number(p.jornada) + '" data-r7-h-grupo="' + esc(p.grupo_id) + '"' +
        ' data-r7-h-estado="' + esc(p.estado) + '" data-r7-h-reciente="' + (reciente ? '1' : '0') + '"' +
        (p.id === Mod.partidoId ? ' aria-current="true"' : '') + '>' +
          '<span class="r7-partido-top"><span class="r7-partido-jornada">J' + Number(p.jornada) + ' · ' + esc(cuando) + '</span>' +
            (Mod.corregidos.has(p.id) ? GL.badge('Corregido', 'gold', 'pencil')
              : reciente ? GL.badge('Reciente', 'green', 'sparkles') : '') + '</span>' +
          '<span class="r7-partido-nombres">' + local + ' <span>vs</span> ' + visita + '</span>' +
          '<span class="r7-marcador-final" aria-label="Marcador">' + esc(res.texto) + '</span>' +
          '<span class="r7-partido-foot"><span>' + esc(estado) + '</span>' + icono('pencil', 15) + '</span>' +
        '</button>';
    }).join('') + '</div>';
  }

  /* La búsqueda es local; jornada y grupo cambian el conjunto de datos y
     fuerzan un render para recalcular contadores, selección y panel. */
  function enlazarFiltros(cont) {
    const buscar = cont.querySelector('#r7-buscar');
    const grupo = cont.querySelector('#r7-grupo');
    const jornada = cont.querySelector('#r7-jornada');
    const lista = cont.querySelector('#lista-pendientes');
    if (!buscar || !grupo || !lista) return;
    const contador = cont.querySelector('#r7-contador');
    const sinResultados = cont.querySelector('#r7-sin-resultados');
    const tarjetas = [...lista.querySelectorAll('.r7-partido')];
    const total = tarjetas.length;
    const normalizar = texto => String(texto || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const repintar = () => {
      const vista = document.getElementById('vista');
      if (vista) Mod.render(vista);
    };

    const aplicar = () => {
      const texto = normalizar(buscar.value.trim());
      let visibles = 0;
      tarjetas.forEach(tarjeta => {
        const mostrar = !texto || normalizar(tarjeta.dataset.r7Nombre).includes(texto);
        tarjeta.hidden = !mostrar;
        if (mostrar) visibles++;
      });
      if (contador) {
        contador.textContent = visibles + (visibles === 1 ? ' partido' : ' partidos') +
          (visibles !== total ? ' de ' + total : '');
      }
      if (sinResultados) sinResultados.hidden = !(total > 0 && visibles === 0);
    };

    buscar.addEventListener('input', aplicar);
    if (jornada) jornada.addEventListener('change', () => {
      if (Mod.guardando) return;
      Mod.jornada = jornada.value === '' ? null : Number(jornada.value);
      Mod.partidoId = null; Mod.archivo = null; Mod.datosIA = null;
      repintar();
    });
    grupo.addEventListener('change', () => {
      if (Mod.guardando) return;
      Mod.grupo = grupo.value || null;
      Mod.jornada = null;
      Mod.partidoId = null; Mod.archivo = null; Mod.datosIA = null;
      repintar();
    });
    cont.querySelectorAll('[data-r7-limpiar]').forEach(b => b.addEventListener('click', () => {
      if (Mod.guardando) return;
      Mod.grupo = null; Mod.jornada = null; Mod.partidoId = null;
      repintar();
    }));
    aplicar();
  }

  function enlazarFiltrosHistorial(cont) {
    const buscar = cont.querySelector('#r7-h-buscar');
    const jornada = cont.querySelector('#r7-h-jornada');
    const grupo = cont.querySelector('#r7-h-grupo');
    const estado = cont.querySelector('#r7-h-estado');
    const recientes = cont.querySelector('#r7-h-recientes');
    const lista = cont.querySelector('#lista-resultados');
    if (!buscar || !jornada || !grupo || !estado || !recientes || !lista) return;
    const contador = cont.querySelector('#r7-h-contador');
    const vacio = cont.querySelector('#r7-h-vacio');
    const tarjetas = [...lista.querySelectorAll('.r7-partido-h')];
    const total = tarjetas.length;
    const normalizar = texto => String(texto || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const aplicar = () => {
      const texto = normalizar(buscar.value.trim());
      let visibles = 0;
      tarjetas.forEach(tarjeta => {
        const d = tarjeta.dataset;
        const mostrar =
          (!texto || normalizar(d.r7HNombre).includes(texto)) &&
          (!jornada.value || d.r7HJornada === jornada.value) &&
          (!grupo.value || d.r7HGrupo === grupo.value) &&
          (!estado.value || d.r7HEstado === estado.value) &&
          (!recientes.checked || d.r7HReciente === '1');
        tarjeta.hidden = !mostrar;
        if (mostrar) visibles++;
      });
      if (contador) {
        contador.textContent = visibles + (visibles === 1 ? ' resultado' : ' resultados') +
          (visibles !== total ? ' de ' + total : '');
      }
      if (vacio) vacio.hidden = !(total > 0 && visibles === 0);
    };

    [buscar, jornada, grupo, estado, recientes].forEach(el =>
      el.addEventListener(el === buscar ? 'input' : 'change', aplicar));
    cont.querySelectorAll('[data-r7-limpiar-h]').forEach(b => b.addEventListener('click', () => {
      buscar.value = ''; jornada.value = ''; grupo.value = ''; estado.value = ''; recientes.checked = false;
      aplicar();
      buscar.focus();
    }));
    aplicar();
  }

  /* Un partido pendiente puede traer 0 en BD; no debe precargarse como 0-0. */
  function valorInput(p, clave, mostrarCero) {
    const valor = p && p[clave] !== null && p[clave] !== undefined ? p[clave] : '';
    if (!mostrarCero && p && p.estado === 'pendiente' && Number(valor) === 0) return '';
    return esc(valor);
  }

  function htmlManual(p, esCorreccion) {
    const cerrada = esCerrada(p);
    const local = esc(GL.nombreJugador(p.local_id));
    const visita = esc(GL.nombreJugador(p.visitante_id));
    const anterior = GL.resultado(p);
    const opciones = opcionesGuardables(p);
    return '<div class="r7-forma">' +
      '<div class="r7-forma-cab"><div><span class="r7-forma-eyebrow">' + icono(esCorreccion ? 'triangle-alert' : 'keyboard', 14) +
        (esCorreccion ? 'Corrección' : 'Modo manual') + '</span>' +
        '<h3>' + (esCorreccion ? 'Corregir resultado registrado' : 'Resultado del encuentro') + '</h3></div>' +
        (cerrada ? GL.badge('Jornada cerrada', 'red', 'lock') : GL.badge(esCorreccion ? 'Corrección' : 'Editable', 'green', 'pencil')) + '</div>' +
      (esCorreccion
        ? '<div class="r7-aviso r7-aviso-correccion">' + icono('triangle-alert', 14) + '<span>' +
            'Estás modificando <strong>' + local + ' vs ' + visita + '</strong> (J' + Number(p.jornada) + '). ' +
            'Valor registrado: <strong>' + esc(anterior.texto) + '</strong> · ' + esc(anterior.estado.label) + '. ' +
            'La corrección queda sujeta al motivo que indiques.'
          + '</span></div>'
        : '<p class="r7-aviso">' + icono('info', 14) +
          'Partido seleccionado: <strong>' + local + ' vs ' + visita + '</strong> (J' + Number(p.jornada) + '). Confirmá antes de guardar.</p>') +
      (cerrada ? '<p class="r7-aviso">' + icono('info', 14) + 'Esta jornada está cerrada; no se puede editar el resultado.</p>' : '') +
      '<div class="r7-marcador">' +
        '<div class="r7-equipo"><span class="r7-equipo-rol">Local</span>' +
          '<strong class="r7-equipo-nombre">' + local + '</strong>' +
          '<input class="input" type="number" min="0" max="' + MAX_GOLES + '" step="1" inputmode="numeric" id="g-local" value="' +
            valorInput(p, 'goles_local', esCorreccion) + '"' + (cerrada ? ' disabled' : '') + ' aria-label="Goles del local"></div>' +
        '<span class="r7-vs" aria-hidden="true">VS</span>' +
        '<div class="r7-equipo"><span class="r7-equipo-rol">Visitante</span>' +
          '<strong class="r7-equipo-nombre">' + visita + '</strong>' +
          '<input class="input" type="number" min="0" max="' + MAX_GOLES + '" step="1" inputmode="numeric" id="g-visita" value="' +
            valorInput(p, 'goles_visitante', esCorreccion) + '"' + (cerrada ? ' disabled' : '') + ' aria-label="Goles del visitante"></div>' +
      '</div>' +
      '<label class="r7-campo"><span>Estado del partido</span>' +
        '<select class="input" id="estado"' + (cerrada ? ' disabled' : '') + '>' + opciones + '</select></label>' +
      (esCorreccion
        ? '<label class="r7-campo"><span>Motivo de corrección (obligatorio)</span>' +
            '<input class="input" type="text" id="motivo" maxlength="160" placeholder="Describe qué se corrigió" required>' +
          '</label>'
        : '') +
      '<p class="r7-pista">Estados disponibles para esta RPC: Jugado, Walkover local, Walkover vis. y Doble ausencia. ' +
        'Las resoluciones por expulsión se registran al cerrar la jornada.</p>' +
      '<details class="r7-detalles"><summary>' + icono('chart-no-axes-column', 14) + ' Estadísticas avanzadas (opcional)</summary>' +
        '<div class="r7-stats-grid">' + camposStats(p, cerrada) + '</div></details>' +
      (!cerrada ? (
        '<div class="r7-captura">' +
          '<div class="r7-captura-cab"><span>' + icono('image', 14) + ' Captura del partido</span>' +
            (p.captura_url ? GL.badge('Ya tiene captura', 'green', 'check-circle-2') : GL.badge('Obligatoria', 'red', 'image')) +
          '</div>' +
          '<div class="dropzone mini r7-dropzone" id="dropzone-manual">' +
            (Mod.archivo
              ? icono('image-check', 20) + ' <span class="r7-dropzone-texto">' + esc(Mod.archivo.name) + '</span>'
              : icono('upload', 20) + ' <span class="r7-dropzone-texto">Clic para adjuntar JPG/PNG (máx. 5 MB)</span>') +
          '</div>' +
          '<input type="file" id="archivo-manual" accept="image/jpeg,image/png" class="oculto">' +
        '</div>'
      ) : '') +
      '<div class="r7-acciones">' +
        '<button type="button" class="btn" id="guardar"' + (cerrada ? ' disabled' : '') + '>' +
          icono('save', 18) + (esCorreccion ? 'Confirmar corrección' : 'Confirmar y Guardar') + '</button>' +
      '</div>' +
    '</div>';
  }

  function camposStats(p, cerrada, datos) {
    const d = datos || {};
    const campos = [
      ['tiros_local', 'Tiros local'], ['tiros_puerta_local', 'Tiros a puerta local'],
      ['posesion_local', 'Posesión local %'], ['pase_local', 'Precisión pase local %'],
      ['tiros_visitante', 'Tiros visita'], ['tiros_puerta_visitante', 'Tiros a puerta visita'],
      ['posesion_visitante', 'Posesión visita %'], ['pase_visitante', 'Precisión pase visita %']
    ];
    return campos.map(([k, label]) =>
      '<label class="r7-campo r7-stat"><span>' + label + '</span>' +
        '<span class="r7-input-ico">' +
          '<input class="input" type="number" min="0" max="100" step="1" inputmode="numeric" id="' + k + '" value="' +
          (d[k] !== undefined && d[k] !== null ? esc(d[k]) : valorInput(p, k)) + '"' + (cerrada ? ' disabled' : '') + '>' +
          icono('pencil', 14) +
        '</span></label>').join('');
  }

  function htmlIA(p) {
    if (esCerrada(p)) {
      return '<div class="r7-forma"><div class="r7-forma-cab"><div>' +
        '<span class="r7-forma-eyebrow">' + icono('scan-eye', 14) + 'Modo IA</span><h3>Jornada cerrada</h3></div>' +
        GL.badge('Sin edición', 'red', 'lock') + '</div>' +
        '<p class="r7-aviso">No se pueden cargar resultados de una jornada cerrada. Reabrí la jornada desde Administración si necesitás corregirla.</p></div>';
    }
    if (Mod.analizando) {
      return '<div class="r7-forma"><div class="r7-forma-cab"><div>' +
        '<span class="r7-forma-eyebrow">' + icono('scan-eye', 14) + 'Modo IA</span><h3>Analizando captura</h3></div>' +
        GL.badge('Procesando', 'neutral', 'loader-circle') + '</div>' +
        '<div class="r7-analizando"><span class="spinner"></span>' +
        '<strong>Analizando captura con Gemini AI…</strong>' +
        '<span>Extrayendo marcador y estadísticas visibles. Podés revisar los datos antes de guardar.</span></div></div>';
    }
    if (Mod.datosIA) {
      const d = Mod.datosIA;
      return '<div class="r7-forma"><div class="r7-forma-cab"><div>' +
        '<span class="r7-forma-eyebrow">' + icono('sparkles', 14) + 'Modo IA</span><h3>Datos detectados</h3></div>' +
        GL.badge('Revisá antes de guardar', 'gold', 'triangle-alert') + '</div>' +
        '<p class="r7-aviso">Partido: <strong>' + esc(GL.nombreJugador(p.local_id)) + ' vs ' +
          esc(GL.nombreJugador(p.visitante_id)) + '</strong> (J' + Number(p.jornada) + ').</p>' +
        '<div class="r7-marcador r7-marcador-ia">' +
          '<div class="r7-equipo"><span class="r7-equipo-rol">Local</span>' +
            '<strong class="r7-equipo-nombre">' + esc(GL.nombreJugador(p.local_id)) + '</strong>' +
            '<input class="input" type="number" min="0" max="' + MAX_GOLES + '" step="1" inputmode="numeric" id="g-local" value="' +
              (d.goles_local === undefined || d.goles_local === null ? '' : esc(d.goles_local)) + '" aria-label="Goles del local"></div>' +
          '<span class="r7-vs" aria-hidden="true">VS</span>' +
          '<div class="r7-equipo"><span class="r7-equipo-rol">Visitante</span>' +
            '<strong class="r7-equipo-nombre">' + esc(GL.nombreJugador(p.visitante_id)) + '</strong>' +
            '<input class="input" type="number" min="0" max="' + MAX_GOLES + '" step="1" inputmode="numeric" id="g-visita" value="' +
              (d.goles_visitante === undefined || d.goles_visitante === null ? '' : esc(d.goles_visitante)) + '" aria-label="Goles del visitante"></div>' +
        '</div>' +
        '<label class="r7-campo"><span>Estado del partido</span>' +
          '<select class="input" id="estado" aria-label="Estado del partido">' + opcionesGuardables(p) + '</select></label>' +
        '<details class="r7-detalles" open><summary>' + icono('chart-no-axes-column', 14) + ' Estadísticas detectadas</summary>' +
          '<div class="r7-stats-grid">' + camposStats(p, false, d) + '</div></details>' +
        '<div class="r7-acciones">' +
          '<button type="button" class="btn sec" id="re-hacer">' + icono('rotate-ccw', 16) + 'Otra captura</button>' +
          '<button type="button" class="btn" id="guardar">' + icono('save', 18) + 'Confirmar y Guardar</button>' +
        '</div></div>';
    }
    return '<div class="r7-forma"><div class="r7-forma-cab"><div>' +
      '<span class="r7-forma-eyebrow">' + icono('scan-eye', 14) + 'Modo IA</span><h3>Análisis de captura</h3></div>' +
      GL.badge('Asistido', 'neutral', 'image-plus') + '</div>' +
      '<p class="r7-bajada r7-bajada-forma">Subí una captura de la pantalla de resultados de FC Mobile. El sistema extrae los datos y vos los confirmás.</p>' +
      '<div class="dropzone r7-dropzone r7-dropzone-grande" id="dropzone">' + icono('image-plus', 32) +
        '<strong>Arrastrá la captura aquí</strong>' +
        '<span>o hacé clic para elegir un archivo · JPG/PNG máx. 5 MB</span>' +
        (Mod.archivo ? '<img id="preview" alt="Vista previa de la captura" src="' + URL.createObjectURL(Mod.archivo) + '">' : '') +
      '</div>' +
      '<input type="file" id="archivo" accept="image/jpeg,image/png" class="oculto">' +
      '<div class="r7-acciones r7-acciones-ia">' +
        '<button type="button" class="btn sec" id="elegir-captura">' + icono('upload', 16) + 'Seleccionar captura</button>' +
        '<button type="button" class="btn" id="analizar" ' + (Mod.archivo ? '' : 'disabled aria-disabled="true"') + '>' +
          icono('scan-eye', 18) + 'Analizar captura con IA</button>' +
      '</div>' +
      (Mod.archivo ? '' : '<p class="r7-pista">Elegí una captura para activar el análisis automático.</p>') +
    '</div>';
  }

  function esCerrada(p) {
    const j = (GL.ctx.jornadas || []).find(x => x.numero === p.jornada && x.grupo_id === p.grupo_id);
    return !!(j && j.estado === 'cerrada');
  }

  /* Adjuntar la captura no debe repintar el formulario: se perdería el
     marcador y las estadísticas que el administrador ya escribió. */
  function mostrarArchivoManual(zona, file) {
    zona.innerHTML = icono('image-check', 20) + ' <span class="r7-dropzone-texto">' + esc(file.name) + '</span>';
    iniciarIconos();
  }

  function enlazarPanel(panel, p, actualizarPanel) {
    const g = s => panel.querySelector(s);

    const dropzoneManual = g('#dropzone-manual');
    const archivoManual  = g('#archivo-manual');
    if (dropzoneManual && archivoManual) {
      dropzoneManual.addEventListener('click', () => archivoManual.click());
      dropzoneManual.addEventListener('dragover', e => {
        e.preventDefault(); dropzoneManual.style.borderColor = 'var(--gl-brand-ring)';
      });
      dropzoneManual.addEventListener('dragleave', () => { dropzoneManual.style.borderColor = ''; });
      dropzoneManual.addEventListener('drop', e => {
        e.preventDefault(); dropzoneManual.style.borderColor = '';
        const f = e.dataTransfer.files[0];
        if (f && ['image/jpeg', 'image/png'].includes(f.type) && f.size <= CONFIG.MAX_CAPTURA_BYTES) {
          Mod.archivo = f;
          mostrarArchivoManual(dropzoneManual, f);
        } else {
          GL.notificar('Solo se aceptan JPG o PNG de hasta 5 MB.', 'advertencia');
        }
      });
      archivoManual.addEventListener('change', () => {
        const f = archivoManual.files[0];
        if (!f) return;
        if (!['image/jpeg', 'image/png'].includes(f.type) || f.size > CONFIG.MAX_CAPTURA_BYTES) {
          GL.notificar('Usá una imagen JPG o PNG de hasta 5 MB.', 'advertencia');
          archivoManual.value = '';
          return;
        }
        Mod.archivo = f;
        mostrarArchivoManual(dropzoneManual, f);
      });
    }

    const selEstado = g('#estado');
    if (selEstado) selEstado.addEventListener('change', () => {
      const v = selEstado.value, gl = g('#g-local'), gv = g('#g-visita');
      if (!gl || !gv) return;
      if (!ESTADOS_CANONICOS.includes(v)) return;
      const r = GL.resultado({ estado: v });
      gl.value = r.gf; gv.value = r.gc;
    });

    const drop = g('#dropzone'), input = g('#archivo');
    if (drop && input) {
      const elegir = () => input.click();
      drop.addEventListener('click', e => { if (e.target.id !== 'preview') elegir(); });
      ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
        e.preventDefault(); drop.classList.add('arrastrando');
      }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
        e.preventDefault(); drop.classList.remove('arrastrando');
      }));
      drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) procesarArchivo(e.dataTransfer.files[0]); });
      input.addEventListener('change', () => { if (input.files[0]) procesarArchivo(input.files[0]); });
      const btnElegir = g('#elegir-captura');
      if (btnElegir) btnElegir.addEventListener('click', elegir);
    }
    const analizar = g('#analizar');
    if (analizar) analizar.addEventListener('click', () => GL.conAccion(analizar, 'analizar', () => analizarCaptura(p)));
    const rehacer = g('#re-hacer');
    if (rehacer) rehacer.addEventListener('click', () => {
      Mod.datosIA = null; Mod.archivo = null;
      if (Mod._repintar) Mod._repintar();
    });
    const guardar = g('#guardar');
    if (guardar) guardar.addEventListener('click', () => guardarResultado(p, panel));
  }

  function procesarArchivo(file) {
    const ok = ['image/jpeg', 'image/png'].includes(file.type);
    if (!ok) { GL.notificar('Formato no admitido. Usá JPG o PNG.', 'error'); return; }
    if (file.size > CONFIG.MAX_CAPTURA_BYTES) { GL.notificar('La imagen supera los 5 MB.', 'error'); return; }
    Mod.archivo = file;
    if (Mod._repintar) Mod._repintar();
  }

  function aBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  async function analizarCaptura(p) {
    if (!Mod.archivo || Mod.analizando) return;
    Mod.analizando = true;
    const panel = document.getElementById('panel-resultado');
    GL.estado(panel, 'cargando', {
      titulo: 'Leyendo la captura…',
      texto: 'Extrayendo el marcador y las estadísticas visibles. Puedes revisar y corregir los datos antes de guardar.',
      icono: 'scan-eye'
    });
    GL.notificar('Leyendo la captura…', 'info', 'loader-circle');
    iniciarIconos();
    try {
      if (!sb) throw new Error('Supabase no configurado');
      const base64 = await aBase64(Mod.archivo);
      const { data, error } = await sb.functions.invoke('analizar-captura', {
        body: { image: base64, media_type: Mod.archivo.type }
      });
      if (error) throw new Error(await mensajeFuncion(error));
      if (!data) throw new Error('La función no devolvió datos');
      const d = typeof data === 'string' ? JSON.parse(data) : data;
      Mod.datosIA = d;
      GL.notificar('Datos extraídos. Confirmá o corregí antes de guardar.', 'exito');
    } catch (e) {
      console.error(e);
      GL.notificar(GL.mensaje(e, 'analizar', 'la captura') + ' Puedes introducir el resultado manualmente.', 'error');
    } finally {
      Mod.analizando = false;
      if (Mod._repintar) Mod._repintar();
    }
  }

  /* ── Validación estricta (funciones puras, expuestas para pruebas) ──── */
  function enteroNoNegativo(valor, etiqueta, max) {
    const texto = String(valor === null || valor === undefined ? '' : valor).trim();
    if (texto === '') return { ok: false, error: etiqueta + ' no puede estar vacío.' };
    if (!/^\d+$/.test(texto)) {
      return { ok: false, error: etiqueta + ' debe ser un número entero no negativo (sin decimales ni signos).' };
    }
    const numero = Number(texto);
    if (!Number.isSafeInteger(numero)) return { ok: false, error: etiqueta + ' no es un número válido.' };
    if (max !== undefined && numero > max) return { ok: false, error: etiqueta + ' no puede superar ' + max + '.' };
    return { ok: true, valor: numero };
  }

  function validarMarcador(local, visita, estado) {
    if (ESTADOS_CANONICOS.includes(estado)) {
      const r = GL.resultado({ estado });
      return { ok: true, golesLocal: r.gf, golesVisita: r.gc };
    }
    const l = enteroNoNegativo(local, 'Goles del local', MAX_GOLES);
    if (!l.ok) return l;
    const v = enteroNoNegativo(visita, 'Goles del visitante', MAX_GOLES);
    if (!v.ok) return v;
    return { ok: true, golesLocal: l.valor, golesVisita: v.valor };
  }

  function verificarPartido(p, partidosActuales, esCorreccion) {
    const lista = partidosActuales || [];
    const actual = lista.find(x => x.id === p.id);
    if (!actual) return 'El partido ya no existe en el torneo. Recargá la vista.';
    if (!actual.local_id || !actual.visitante_id || actual.local_id === actual.visitante_id) {
      return 'Los participantes del partido no son válidos.';
    }
    if (actual.local_id !== p.local_id || actual.visitante_id !== p.visitante_id) {
      return 'Los participantes cambiaron desde que abriste el formulario. Recargá la vista.';
    }
    if (p.jornada !== undefined && actual.jornada !== undefined &&
        Number(actual.jornada) !== Number(p.jornada)) {
      return 'La jornada del partido cambió desde que abriste el formulario. Recargá la vista.';
    }
    if (p.grupo_id && actual.grupo_id && actual.grupo_id !== p.grupo_id) {
      return 'El partido cambió de grupo desde que abriste el formulario. Recargá la vista.';
    }
    if (p.torneo_id && actual.torneo_id && actual.torneo_id !== p.torneo_id) {
      return 'El partido ya no pertenece al torneo activo. Recargá la vista.';
    }
    const clave = [p.jornada, p.local_id, p.visitante_id].join('|');
    if (lista.filter(x => [x.jornada, x.local_id, x.visitante_id].join('|') === clave).length > 1) {
      return 'Hay partidos duplicados para ese cruce. No se guardó nada para no repetir el resultado.';
    }
    const jugadores = (GL.ctx && GL.ctx.jugadores) || [];
    if (jugadores.length && (!jugadores.some(j => j.id === actual.local_id) ||
        !jugadores.some(j => j.id === actual.visitante_id))) {
      return 'Los participantes no pertenecen al torneo activo.';
    }
    if (esCorreccion && actual.estado === 'pendiente') {
      return 'El partido volvió a pendiente. No se puede corregir un resultado inexistente.';
    }
    if (!esCorreccion && actual.estado !== 'pendiente') {
      return 'Este partido ya tiene resultado. Usá el historial para corregirlo y no duplicarlo.';
    }
    return null;
  }

  function resumenCambio(p, datos, esCorreccion) {
    const local = GL.nombreJugador(p.local_id);
    const visita = GL.nombreJugador(p.visitante_id);
    const anterior = GL.resultado(p);
    return (esCorreccion ? 'CORRECCIÓN DE RESULTADO' : 'NUEVO RESULTADO') + '\n\n' +
      'Partido: ' + local + ' vs ' + visita + ' (J' + Number(p.jornada) + ')\n' +
      (esCorreccion ? 'Valor actual: ' + anterior.texto + ' · ' + anterior.estado.label + '\n' : '') +
      'Nuevo marcador: ' + datos.golesLocal + ' - ' + datos.golesVisita + '\n' +
      'Estado: ' + ((ESTADOS_PARTIDO[datos.estado] || {}).label || datos.estado) + '\n' +
      (esCorreccion ? 'Motivo: ' + datos.motivo + '\n' : '') +
      '\n¿Confirmás este guardado?';
  }

  async function confirmarCambio(resumen) {
    if (typeof GL !== 'undefined' && typeof GL.confirmar === 'function') {
      return GL.confirmar(resumen, 'Confirmar resultado', 'Guardar resultado');
    }
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return window.confirm(resumen);
    }
    return true;
  }

  function respuestaConfirmada(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('La base de datos no confirmó el guardado. No se informó éxito.');
    }
    if (data.error || data.ok === false) {
      throw new Error(String(data.error || data.mensaje || 'El servidor rechazó el resultado.'));
    }
    return data;
  }

  /* Validación de estadísticas opcionales: mismas reglas que el marcador. */
  function validarStats(panel, estado) {
    if (estado !== 'jugado') return null;
    const campos = {
      tiros_local: 'Tiros local', tiros_puerta_local: 'Tiros a puerta local',
      posesion_local: 'Posesión local', pase_local: 'Precisión de pase local',
      tiros_visitante: 'Tiros visita', tiros_puerta_visitante: 'Tiros a puerta visita',
      posesion_visitante: 'Posesión visita', pase_visitante: 'Precisión de pase visita'
    };
    const valores = {};
    for (const [id, etiqueta] of Object.entries(campos)) {
      const el = panel.querySelector('#' + id);
      if (!el || String(el.value).trim() === '') { valores[id] = null; continue; }
      const r = enteroNoNegativo(el.value, etiqueta, 100);
      if (!r.ok) return r.error;
      valores[id] = r.valor;
    }
    if (valores.tiros_puerta_local !== null && valores.tiros_local !== null &&
        valores.tiros_puerta_local > valores.tiros_local) {
      return 'Tiros a puerta local no puede superar los tiros totales.';
    }
    if (valores.tiros_puerta_visitante !== null && valores.tiros_visitante !== null &&
        valores.tiros_puerta_visitante > valores.tiros_visitante) {
      return 'Tiros a puerta visitante no puede superar los tiros totales.';
    }
    if (valores.posesion_local !== null && valores.posesion_visitante !== null &&
        valores.posesion_local + valores.posesion_visitante !== 100) {
      return 'La posesión de ambos equipos debe sumar 100.';
    }
    return null;
  }

  async function guardarResultado(p, panel) {
    if (Mod.guardando) return;
    if (!GL.esAdmin()) {
      GL.notificar('Solo el administrador puede registrar o corregir resultados.', 'error');
      return;
    }

    /* El bloqueo se activa antes del primer await: dos clics rápidos o dos
       pestañas del mismo formulario no pueden alcanzar la RPC dos veces. */
    Mod.guardando = true;
    const btn = panel.querySelector('#guardar');
    const textoBoton = btn ? btn.innerHTML : '';
    if (btn) btn.disabled = true;

    try {
      const esCorreccion = !!p && !!p.estado && p.estado !== 'pendiente';
      const selEstado = panel.querySelector('#estado');
      const estado = selEstado ? selEstado.value : 'jugado';
      if (!ESTADOS_GUARDABLES.includes(estado)) {
        GL.notificar('Ese estado no puede guardarse desde Resultados. Las expulsiones se registran al cerrar la jornada.', 'advertencia');
        return;
      }

      const motivoEl = panel.querySelector('#motivo');
      const motivo = esCorreccion ? String((motivoEl && motivoEl.value) || '').trim() : null;
      if (esCorreccion && !motivo) {
        GL.notificar('Indica el motivo de la corrección antes de guardar.', 'advertencia');
        return;
      }

      const valor = selector => {
        const el = panel.querySelector(selector);
        return el ? el.value : '';
      };
      const marcador = validarMarcador(valor('#g-local'), valor('#g-visita'), estado);
      if (!marcador.ok) { GL.notificar(marcador.error, 'advertencia'); return; }

      const errStats = validarStats(panel, estado);
      if (errStats) { GL.notificar(errStats, 'advertencia'); return; }

      if (estado === 'jugado' && !Mod.archivo && !p.captura_url && !Mod.datosIA) {
        GL.notificar('La captura es obligatoria para validar el resultado. Subí la imagen del partido.', 'advertencia');
        return;
      }

      /* FASE 3.21: refrescar el contexto antes de releer. Sin esto, una
         jornada cerrada en otro pestaña podría seguir viéndose abierta. */
      if (typeof GL.cargarContexto === 'function') {
        try {
          await GL.cargarContexto(true);
        } catch (e) {
          GL.notificar('No se pudo verificar el estado de la jornada. No se guardó ningún cambio.', 'error');
          return;
        }
      }

      /* Releer el partido justo antes de escribir: evita duplicados y carreras. */
      let actuales = [];
      try {
        actuales = await GL.partidos({ torneo_id: GL.torneoId() });
      } catch (e) {
        GL.notificar('No se pudo verificar el partido antes de guardar. No se realizó ningún cambio.', 'error');
        return;
      }
      const problema = verificarPartido(p, actuales, esCorreccion);
      if (problema) { GL.notificar(problema, 'advertencia'); return; }

      const fresco = frescoDe(p, actuales);
      const contexto = validarContextoEscritura(fresco || p, estado, esCorreccion);
      if (contexto) { GL.notificar(contexto, 'advertencia'); return; }
      const base = fresco || p;

      const datos = {
        golesLocal: marcador.golesLocal, golesVisita: marcador.golesVisita,
        estado, motivo
      };
      if (!(await confirmarCambio(resumenCambio(base, datos, esCorreccion)))) {
        GL.notificar('Guardado cancelado. No se modificó ningún dato.', 'info');
        return;
      }

      if (btn) btn.innerHTML = '<span class="spinner"></span>Guardando…';
      let capturaUrl = p.captura_url || null;
      if (Mod.archivo) {
        if (!['image/jpeg', 'image/png'].includes(Mod.archivo.type)) {
          throw new Error('Solo se aceptan imágenes JPG o PNG.');
        }
        if (Mod.archivo.size > CONFIG.MAX_CAPTURA_BYTES) {
          throw new Error('La captura no puede superar 5 MB.');
        }
        const ext = Mod.archivo.type === 'image/png' ? 'png' : 'jpg';
        const ruta = GL.torneoId() + '/' + p.id + '-' + Date.now() + '.' + ext;
        const up = await sb.storage.from(CONFIG.BUCKET_CAPTURAS).upload(ruta, Mod.archivo,
          { upsert: true, contentType: Mod.archivo.type });
        if (up.error) throw new Error('No se pudo subir la captura: ' + up.error.message);
        capturaUrl = sb.storage.from(CONFIG.BUCKET_CAPTURAS).getPublicUrl(ruta).data.publicUrl;
      }

      const stats = {};
      ['tiros_local', 'tiros_puerta_local', 'posesion_local', 'pase_local',
       'tiros_visitante', 'tiros_puerta_visitante', 'posesion_visitante', 'pase_visitante'].forEach(c => {
        const el = panel.querySelector('#' + c);
        stats[c] = (el && String(el.value).trim() !== '') ? Number(el.value) : null;
      });

      const user = (await sb.auth.getUser()).data.user;
      const { data, error } = await sb.rpc('gl_guardar_resultado', {
        p_partido_id:      p.id,
        p_torneo_id:       GL.torneoId(),
        p_goles_local:     marcador.golesLocal,
        p_goles_visitante: marcador.golesVisita,
        p_estado:          estado,
        p_captura_url:     capturaUrl,
        /* El wrapper endurecido ignora este valor y usa auth.uid(); se envía
           únicamente por compatibilidad con despliegues anteriores. */
        p_ingresado_por:   user ? user.id : null,
        p_motivo:          motivo,
        p_stats:           stats
      });

      if (error) throw new Error(error.message || 'El servidor no confirmó el guardado.');
      respuestaConfirmada(data);

      /* La auditoría es complementaria: el RPC ya registra motivo e identidad.
         Un fallo aquí no debe convertir un guardado real en error visible. */
      try {
        if (GL.auditoria && GL.auditoria.registrar) {
          await GL.auditoria.registrar(esCorreccion ? 'resultado_corregido' : 'resultado_ingresado',
            'partido', p.id, {
              local: GL.nombreJugador(base.local_id),
              visitante: GL.nombreJugador(base.visitante_id),
              goles_local: marcador.golesLocal,
              goles_visitante: marcador.golesVisita,
              estado,
              jornada: base.jornada,
              /* anterior se toma del registro releído, no del snapshot inicial. */
              anterior: esCorreccion ? GL.resultado(base).texto : null,
              nuevo: marcador.golesLocal + '-' + marcador.golesVisita,
              motivo: motivo || null,
              captura: !!capturaUrl
            });
        }
      } catch (e) {
        console.warn('Auditoría de resultado no registrada:', e);
      }

      if (esCorreccion) Mod.corregidos.add(p.id);
      GL.notificar(esCorreccion
        ? 'Corrección guardada. Tabla, estadísticas y cuadro actualizados.'
        : 'Resultado registrado. Tabla, estadísticas y cuadro actualizados.', 'exito');
      Mod.partidoId = null; Mod.archivo = null; Mod.datosIA = null;
      /* El RPC recalcula; invalidar fuerza que tabla y estadísticas lean el
         contexto fresco en lugar de una caché previa al guardado. */
      if (typeof GL.invalidar === 'function') GL.invalidar();
      await Mod.render(document.getElementById('vista'));
    } catch (e) {
      console.error(e);
      GL.notificar(GL.mensaje(e, 'guardar', 'los resultados'), 'error');
    } finally {
      Mod.guardando = false;
      if (btn) { btn.disabled = false; btn.innerHTML = textoBoton; }
    }
  }

  /* API pura para pruebas unitarias: sin DOM, sin Supabase y sin efectos. */
  Mod.enteroNoNegativo = enteroNoNegativo;
  Mod.validarMarcador = validarMarcador;
  Mod.verificarPartido = verificarPartido;
  Mod.deduplicar = deduplicar;
  Mod.resumenCambio = resumenCambio;
  Mod.confirmarCambio = confirmarCambio;
  Mod.respuestaConfirmada = respuestaConfirmada;
  Mod.validarStats = validarStats;
  Mod.guardarResultado = guardarResultado;
  Mod.jornadasAbiertas = jornadasAbiertas;
  Mod.jornadaElegida = jornadaElegida;
  Mod.partidosDeJornada = partidosDeJornada;
  Mod.jornadaDelPartido = jornadaDelPartido;
  Mod.validarContextoEscritura = validarContextoEscritura;
  Mod.frescoDe = frescoDe;
  Mod.esCerrada = esCerrada;
  Mod.estadosGuardables = ESTADOS_GUARDABLES.slice();

  Modulos.resultados = Mod;
})();
