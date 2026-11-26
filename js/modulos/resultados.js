/* =====================================================================
   MÓDULO 3 — Ingreso de resultados (solo admin)
   Modo A: análisis de captura con Gemini Flash (vía Edge Function)
   Modo B: ingreso manual
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Resultados',
    modo: 'manual',
    partidoId: null,
    archivo: null,
    datosIA: null,
    analizando: false,

    async render(el) {
      el.innerHTML = GL.skeleton(6);
      if (!(await GL.asegurarAdmin(el))) return;
      try {
        await GL.cargarContexto(true);
        if (!GL.torneo()) { el.innerHTML = GL.vacio('No hay torneo activo. Crealo desde Administración → Configuración.', 'trophy', null); iniciarIconos(); return; }
        const jn = GL.jornadaAbiertaNumero();
        if (!jn) {
          el.innerHTML = GL.vacio('No hay jornadas abiertas. Abrí una desde Administración → Jornadas.', 'lock', null);
          iniciarIconos(); return;
        }
        const partidosJornada = await GL.partidos({ torneo_id: GL.torneo().id, jornada: jn });
        const pendientes = partidosJornada.filter(p => p.estado === 'pendiente');
        const jugados = partidosJornada.length - pendientes.length;
        const progreso = partidosJornada.length ? Math.round((jugados / partidosJornada.length) * 100) : 0;
        const totalJornadas = Number((GL.torneo() && GL.torneo().total_jornadas) || 22);
        if (Mod.partidoId && !pendientes.some(p => p.id === Mod.partidoId)) Mod.partidoId = null;
        if (!Mod.partidoId && pendientes.length) Mod.partidoId = pendientes[0].id;

        const gruposPendientes = [...new Set(pendientes.map(p => p.grupo_id))].map(id => {
          const g = GL.grupo(id);
          return '<option value="' + esc(id) + '">Grupo ' + esc(GL.letraGrupo(g)) + '</option>';
        }).join('');

        el.innerHTML =
          '<div class="r7-pantalla" data-resultados>' +
            '<header class="r7-hero">' +
              '<div class="r7-hero-copy">' +
                '<span class="r7-eyebrow">' + icono('clipboard-check', 14) + 'Dirección del torneo · Resultados</span>' +
                '<h1 class="r7-titulo">Carga de resultados</h1>' +
                '<p class="r7-bajada">Jornada ' + jn + ' · Validá el marcador antes de guardar. El cálculo de tabla es automático.</p>' +
              '</div>' +
              '<div class="r7-hero-acciones">' +
                GL.badge(jn + ' / ' + totalJornadas, 'gold', 'flag') +
                GL.badge(partidosJornada.length + ' partidos', 'neutral', 'calendar-days') +
              '</div>' +
            '</header>' +
            '<section class="r7-kpis" aria-label="Progreso de la jornada">' +
              r7Kpi(pendientes.length, 'Pendientes', 'Partidos sin resultado', 'clock', true, progreso) +
              r7Kpi(jugados, 'Cargados', 'Resultados ya registrados', 'check-circle-2') +
              r7Kpi(partidosJornada.length, 'Total', 'Partidos de la jornada', 'calendar-days') +
              r7Kpi(progreso + '%', 'Progreso', 'Jornada en curso', 'chart-no-axes-column') +
            '</section>' +
            '<div class="r7-tabs" role="tablist" aria-label="Modo de carga">' +
              '<button type="button" class="r7-tab' + (Mod.modo === 'manual' ? ' activo' : '') + '" data-modo="manual" role="tab" aria-selected="' + (Mod.modo === 'manual') + '">' +
                icono('keyboard', 16) + 'Ingreso manual</button>' +
              '<button type="button" class="r7-tab' + (Mod.modo === 'ia' ? ' activo' : '') + '" data-modo="ia" role="tab" aria-selected="' + (Mod.modo === 'ia') + '">' +
                icono('scan-eye', 16) + 'Análisis de captura (IA)</button>' +
            '</div>' +
            '<div class="r7-layout">' +
              '<section class="r7-panel r7-lista-panel" aria-labelledby="r7-lista-titulo">' +
                '<div class="r7-panel-cab"><div><h2 id="r7-lista-titulo">' + icono('list-checks', 18) + 'Partidos pendientes</h2>' +
                  '<p>Seleccioná un encuentro para cargar su resultado.</p></div>' +
                  '<span id="r7-contador" aria-live="polite">' + pendientes.length + (pendientes.length === 1 ? ' partido' : ' partidos') + '</span></div>' +
                '<div class="r7-filtros">' +
                  '<label class="r7-campo"><span>Buscar partido</span>' +
                    '<span class="r7-input-ico">' + icono('search', 16) +
                      '<input class="input" id="r7-buscar" type="search" placeholder="Ej: jugador o equipo" autocomplete="off" aria-label="Buscar partidos pendientes">' +
                    '</span></label>' +
                  '<label class="r7-campo"><span>Grupo</span>' +
                    '<select class="input" id="r7-grupo" aria-label="Filtrar partidos por grupo">' +
                      '<option value="">Todos los grupos</option>' + gruposPendientes +
                    '</select></label>' +
                  '<button type="button" class="btn sec r7-limpiar" data-r7-limpiar>' + icono('rotate-ccw', 16) + 'Limpiar</button>' +
                '</div>' +
                '<div id="lista-pendientes" class="r7-lista">' + htmlLista(pendientes) + '</div>' +
                '<div class="r7-estado-vacio" id="r7-sin-resultados" hidden>' + icono('search-x', 28) +
                  '<strong>Sin coincidencias</strong><span>Probá con otro nombre o quitá el filtro de grupo.</span>' +
                  '<button type="button" class="btn sec sm" data-r7-limpiar>' + icono('rotate-ccw', 15) + 'Limpiar filtros</button></div>' +
              '</section>' +
              '<section class="r7-panel r7-editor-panel" aria-label="Editor de resultado"><div id="panel-resultado"></div></section>' +
            '</div>' +
          '</div>';

        const panel = el.querySelector('#panel-resultado');
        const pintarPanel = () => {
          const p = pendientes.find(x => x.id === Mod.partidoId);
          panel.innerHTML = !p ? GL.vacio('No hay partidos pendientes en esta jornada.', 'check-check', null)
            : (Mod.modo === 'manual' ? htmlManual(p) : htmlIA(p));
          enlazarPanel(panel, p, pintarPanel);
          iniciarIconos();
        };
        pintarPanel();

        el.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
          Mod.modo = b.dataset.modo; Mod.datosIA = null; Mod.archivo = null; Mod.render(el);
        }));
        el.querySelectorAll('[data-partido]').forEach(b => b.addEventListener('click', () => {
          Mod.partidoId = b.dataset.partido; Mod.datosIA = null; Mod.archivo = null;
          el.querySelectorAll('[data-partido]').forEach(x => x.classList.toggle('activo', x === b));
          pintarPanel();
        }));
        enlazarFiltros(el);
      } catch (e) { console.error(e); el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'los resultados'), null, 'los resultados'); }
      iniciarIconos();
    }
  };

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

  /* Filtros locales de solo presentación sobre los partidos ya cargados. */
  function enlazarFiltros(cont) {
    const buscar = cont.querySelector('#r7-buscar');
    const grupo = cont.querySelector('#r7-grupo');
    const lista = cont.querySelector('#lista-pendientes');
    if (!buscar || !grupo || !lista) return;
    const contador = cont.querySelector('#r7-contador');
    const sinResultados = cont.querySelector('#r7-sin-resultados');
    const tarjetas = [...lista.querySelectorAll('.r7-partido')];
    const total = tarjetas.length;
    const normalizar = texto => String(texto || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const aplicar = () => {
      const texto = normalizar(buscar.value.trim());
      const grupoId = grupo.value;
      let visibles = 0;
      tarjetas.forEach(tarjeta => {
        const coincideTexto = !texto || normalizar(tarjeta.dataset.r7Nombre).includes(texto);
        const coincideGrupo = !grupoId || tarjeta.dataset.r7Grupo === grupoId;
        const mostrar = coincideTexto && coincideGrupo;
        tarjeta.hidden = !mostrar;
        if (mostrar) visibles++;
      });
      if (contador) {
        contador.textContent = visibles + (visibles === 1 ? ' partido' : ' partidos') +
          (visibles !== total ? ' de ' + total : '');
      }
      if (sinResultados) sinResultados.hidden = !(total > 0 && visibles === 0);
    };

    [buscar, grupo].forEach(el =>
      el.addEventListener(el === buscar ? 'input' : 'change', aplicar));
    cont.querySelectorAll('[data-r7-limpiar]').forEach(b => b.addEventListener('click', () => {
      buscar.value = ''; grupo.value = '';
      aplicar();
      buscar.focus();
    }));
    aplicar();
  }

  function htmlManual(p) {
    const cerrada = esCerrada(p);
    const local = esc(GL.nombreJugador(p.local_id));
    const visita = esc(GL.nombreJugador(p.visitante_id));
    return '<div class="r7-forma">' +
      '<div class="r7-forma-cab"><div><span class="r7-forma-eyebrow">' + icono('keyboard', 14) + 'Modo manual</span>' +
        '<h3>Resultado del encuentro</h3></div>' +
        (cerrada ? GL.badge('Jornada cerrada', 'red', 'lock') : GL.badge('Editable', 'green', 'pencil')) + '</div>' +
      (cerrada ? '<p class="r7-aviso">' + icono('info', 14) + 'Esta jornada está cerrada; no se puede editar el resultado.</p>' : '') +
      '<div class="r7-marcador">' +
        '<div class="r7-equipo"><span class="r7-equipo-rol">Local</span>' +
          '<strong class="r7-equipo-nombre">' + local + '</strong>' +
          '<input class="input" type="number" min="0" max="99" id="g-local" value="' + (p.goles_local || 0) + '"' + (cerrada ? ' disabled' : '') + ' aria-label="Goles del local"></div>' +
        '<span class="r7-vs" aria-hidden="true">VS</span>' +
        '<div class="r7-equipo"><span class="r7-equipo-rol">Visitante</span>' +
          '<strong class="r7-equipo-nombre">' + visita + '</strong>' +
          '<input class="input" type="number" min="0" max="99" id="g-visita" value="' + (p.goles_visitante || 0) + '"' + (cerrada ? ' disabled' : '') + ' aria-label="Goles del visitante"></div>' +
      '</div>' +
      '<label class="r7-campo"><span>Estado del partido</span>' +
        '<select class="input" id="estado"' + (cerrada ? ' disabled' : '') + '>' +
          Object.entries(ESTADOS_PARTIDO).filter(([k]) => k !== 'pendiente').map(([k, v]) =>
            '<option value="' + k + '"' + (p.estado === k ? ' selected' : '') + '>' + v.label + '</option>').join('') +
        '</select></label>' +
      (p.estado && p.estado !== 'pendiente'
        ? '<label class="r7-campo"><span>Motivo de corrección</span>' +
            '<input class="input" type="text" id="motivo" maxlength="160" placeholder="Describe qué se corrigió" required>' +
          '</label>'
        : '') +
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
          icono('save', 18) + 'Confirmar y Guardar</button>' +
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
          '<input class="input" type="number" min="0" max="100" id="' + k + '" value="' +
          (d[k] !== undefined ? d[k] : (p[k] !== undefined ? p[k] : '')) + '"' + (cerrada ? ' disabled' : '') + '>' +
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
        '<div class="r7-marcador r7-marcador-ia">' +
          '<div class="r7-equipo"><span class="r7-equipo-rol">Local</span>' +
            '<strong class="r7-equipo-nombre">' + esc(GL.nombreJugador(p.local_id)) + '</strong>' +
            '<input class="input" type="number" min="0" id="g-local" value="' + (d.goles_local || 0) + '" aria-label="Goles del local"></div>' +
          '<span class="r7-vs" aria-hidden="true">VS</span>' +
          '<div class="r7-equipo"><span class="r7-equipo-rol">Visitante</span>' +
            '<strong class="r7-equipo-nombre">' + esc(GL.nombreJugador(p.visitante_id)) + '</strong>' +
            '<input class="input" type="number" min="0" id="g-visita" value="' + (d.goles_visitante || 0) + '" aria-label="Goles del visitante"></div>' +
        '</div>' +
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

  function enlazarPanel(panel, p, actualizarPanel) {
    const g = s => panel.querySelector(s);

    // Dropzone de captura en modo manual
    const dropzoneManual = g('#dropzone-manual');
    const archivoManual  = g('#archivo-manual');
    if (dropzoneManual && archivoManual) {
      dropzoneManual.addEventListener('click', () => archivoManual.click());
      dropzoneManual.addEventListener('dragover', e => { e.preventDefault(); dropzoneManual.style.borderColor = 'var(--accent-gold)'; });
      dropzoneManual.addEventListener('dragleave', () => { dropzoneManual.style.borderColor = 'var(--border)'; });
      dropzoneManual.addEventListener('drop', e => {
        e.preventDefault();
        dropzoneManual.style.borderColor = 'var(--border)';
        const f = e.dataTransfer.files[0];
        if (f && ['image/jpeg', 'image/png'].includes(f.type)) { Mod.archivo = f; actualizarPanel(); }
        else GL.notificar('Solo se aceptan JPG o PNG.', 'advertencia');
      });
      archivoManual.addEventListener('change', () => {
        const f = archivoManual.files[0];
        if (f) { Mod.archivo = f; actualizarPanel(); }
      });
    }

    const selEstado = g('#estado');
    if (selEstado) selEstado.addEventListener('change', () => {
      const v = selEstado.value, gl = g('#g-local'), gv = g('#g-visita');
      if (!gl || !gv) return;
      if (v === 'walkover_local') { gl.value = 3; gv.value = 0; }
      if (v === 'walkover_visitante') { gl.value = 0; gv.value = 3; }
      if (v === 'doble_ausencia') { gl.value = 0; gv.value = 0; }
      if (v === 'expulsion_local') { gl.value = 1; gv.value = 0; }
      if (v === 'expulsion_visitante') { gl.value = 0; gv.value = 1; }
    });

    const drop = g('#dropzone'), input = g('#archivo');
    if (drop && input) {
      const elegir = () => input.click();
      drop.addEventListener('click', e => { if (e.target.id !== 'preview') elegir(); });
      ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('arrastrando'); }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('arrastrando'); }));
      drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) procesarArchivo(e.dataTransfer.files[0], panel, p); });
      input.addEventListener('change', () => { if (input.files[0]) procesarArchivo(input.files[0], panel, p); });
      const btnElegir = g('#elegir-captura');
      if (btnElegir) btnElegir.addEventListener('click', () => input.click());
    }
    const analizar = g('#analizar');
    if (analizar) analizar.addEventListener('click', () => GL.conAccion(analizar, 'analizar', () => analizarCaptura(p)));
    const rehacer = g('#re-hacer');
    if (rehacer) rehacer.addEventListener('click', () => { Mod.datosIA = null; Mod.archivo = null; Mod.render(panel.closest('#vista') || document.getElementById('vista')); });
    const guardar = g('#guardar');
    if (guardar) guardar.addEventListener('click', () => GL.conAccion(guardar, 'guardar', () => guardarResultado(p, panel)));
  }

  function procesarArchivo(file, panel, p) {
    const ok = ['image/jpeg', 'image/png'].includes(file.type);
    if (!ok) { GL.notificar('Formato no admitido. Usá JPG o PNG.', 'error'); return; }
    if (file.size > CONFIG.MAX_CAPTURA_BYTES) { GL.notificar('La imagen supera los 5 MB.', 'error'); return; }
    Mod.archivo = file;
    if (Mod.analizando === false) {
      // Vuelve a pintar el panel con la vista previa y el botón de análisis.
      Mod.render(document.getElementById('vista'));
    }
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
    if (!Mod.archivo) return;
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
      Mod.render(document.getElementById('vista'));
    }
  }

  // ── Validación de estadísticas en frontend ──────────────────
  function validarStats(panel, estado) {
    // En walkover/doble ausencia no hay stats que validar
    if (estado && estado !== 'jugado') return null;

    const n = id => { const el = panel.querySelector('#' + id); return el && el.value !== '' ? Number(el.value) : null; };

    const tL  = n('tiros_local'),        tpL = n('tiros_puerta_local');
    const tV  = n('tiros_visitante'),    tpV = n('tiros_puerta_visitante');
    const posL = n('posesion_local'),    posV = n('posesion_visitante');
    const paL  = n('pase_local'),        paV  = n('pase_visitante');

    if (tL  !== null && tL  < 0) return 'Tiros local no puede ser negativo.';
    if (tV  !== null && tV  < 0) return 'Tiros visitante no puede ser negativo.';
    if (tpL !== null && tpL < 0) return 'Tiros a puerta local no puede ser negativo.';
    if (tpV !== null && tpV < 0) return 'Tiros a puerta visitante no puede ser negativo.';
    if (tL  !== null && tpL !== null && tpL > tL)  return 'Tiros a puerta local no puede superar los tiros totales.';
    if (tV  !== null && tpV !== null && tpV > tV)  return 'Tiros a puerta visitante no puede superar los tiros totales.';
    if (posL !== null && (posL < 0 || posL > 100)) return 'Posesión local debe estar entre 0 y 100.';
    if (posV !== null && (posV < 0 || posV > 100)) return 'Posesión visitante debe estar entre 0 y 100.';
    if (posL !== null && posV !== null && posL + posV !== 100) return 'La posesión de ambos equipos debe sumar 100.';
    if (paL  !== null && (paL  < 0 || paL  > 100)) return 'Precisión de pase local debe estar entre 0 y 100.';
    if (paV  !== null && (paV  < 0 || paV  > 100)) return 'Precisión de pase visitante debe estar entre 0 y 100.';

    return null; // sin errores
  }

  async function guardarResultado(p, panel) {
    const val = id => panel.querySelector(id) ? Number(panel.querySelector(id).value) || 0 : 0;
    const camposStats = ['tiros_local', 'tiros_puerta_local', 'posesion_local', 'pase_local',
      'tiros_visitante', 'tiros_puerta_visitante', 'posesion_visitante', 'pase_visitante'];

    let golesLocal = val('#g-local'), golesVisita = val('#g-visita');
    const estado = panel.querySelector('#estado') ? panel.querySelector('#estado').value : 'jugado';
    const esCorreccion = !!p.estado && p.estado !== 'pendiente';
    const motivoEl = panel.querySelector('#motivo');
    const motivo = esCorreccion ? String((motivoEl && motivoEl.value) || '').trim() : null;

    if (esCorreccion && !motivo) {
      GL.notificar('Indica el motivo de la corrección antes de guardar.', 'advertencia'); return;
    }

    if (GL.esResolucionExpulsion({ estado })) {
      const r = GL.resultado({ estado });
      golesLocal = r.gf; golesVisita = r.gc;
    }

    // ── Validaciones frontend ────────────────────────────────
    if (!Number.isInteger(golesLocal) || !Number.isInteger(golesVisita) ||
        golesLocal < 0 || golesVisita < 0 || golesLocal > 99 || golesVisita > 99) {
      GL.notificar('Los goles deben ser enteros entre 0 y 99.', 'advertencia'); return;
    }

    const errStats = validarStats(panel, estado);
    if (errStats) { GL.notificar(errStats, 'advertencia'); return; }

    // Captura obligatoria en partidos normales (modo manual sin datos de IA)
    if (estado === 'jugado' && !Mod.archivo && !p.captura_url && !Mod.datosIA) {
      GL.notificar('La captura es obligatoria para validar el resultado. Subí la imagen del partido.', 'advertencia');
      return;
    }

    const btn = panel.querySelector('#guardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Guardando…'; }

    try {
      // ── Subir captura primero si hay archivo ─────────────
      let capturaUrl = p.captura_url || null;
      if (Mod.archivo) {
        if (!['image/jpeg', 'image/png'].includes(Mod.archivo.type))
          throw new Error('Solo se aceptan imágenes JPG o PNG.');
        if (Mod.archivo.size > 5 * 1024 * 1024)
          throw new Error('La captura no puede superar 5 MB.');
        const ext  = Mod.archivo.type === 'image/png' ? 'png' : 'jpg';
        const ruta = GL.torneo().id + '/' + p.id + '-' + Date.now() + '.' + ext;
        const up   = await sb.storage.from(CONFIG.BUCKET_CAPTURAS).upload(ruta, Mod.archivo,
          { upsert: true, contentType: Mod.archivo.type });
        if (up.error) throw new Error('No se pudo subir la captura: ' + up.error.message);
        capturaUrl = sb.storage.from(CONFIG.BUCKET_CAPTURAS).getPublicUrl(ruta).data.publicUrl;
      }

      // ── Construir objeto de stats ────────────────────────
      const stats = {};
      camposStats.forEach(c => {
        const el = panel.querySelector('#' + c);
        stats[c] = (el && el.value !== '') ? Number(el.value) : null;
      });

      // ── Llamar al RPC transaccional ──────────────────────
      const user = (await sb.auth.getUser()).data.user;
      const { data, error } = await sb.rpc('gl_guardar_resultado', {
        p_partido_id:      p.id,
        p_torneo_id:       GL.torneoId(),
        p_goles_local:     golesLocal,
        p_goles_visitante: golesVisita,
        p_estado:          estado,
        p_captura_url:     capturaUrl,
        p_ingresado_por:   user ? user.id : null,
        p_motivo:          motivo, // null = ingreso inicial; texto = corrección con motivo
        p_stats:           stats
      });

      if (error) throw new Error(error.message);
      if (data && !data.ok) throw new Error(data.error);

      // ── Auditoría ────────────────────────────────────────
      GL.auditoria && GL.auditoria.registrar(
        data.es_correccion ? 'resultado_corregido' : 'resultado_ingresado',
        'partido', p.id,
        {
          local:            GL.nombreJugador(p.local_id),
          visitante:        GL.nombreJugador(p.visitante_id),
          goles_local:      golesLocal,
          goles_visitante:  golesVisita,
          estado,
          jornada:          p.jornada,
          anterior:         data.anterior || null,
          nuevo:            golesLocal + '-' + golesVisita,
          captura:          !!capturaUrl
        }
      );

      GL.notificar('Resultado guardado y tabla actualizada.', 'exito');
      Mod.partidoId = null; Mod.archivo = null; Mod.datosIA = null;
      await Mod.render(document.getElementById('vista'));

    } catch (e) {
      console.error(e);
      GL.notificar(GL.mensaje(e, 'guardar', 'los resultados'), 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = icono('save', 18) + 'Confirmar y Guardar'; }
    }
  }

  Modulos.resultados = Mod;
})();
