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
        const pendientes = (await GL.partidos({ torneo_id: GL.torneo().id, jornada: jn }))
          .filter(p => p.estado === 'pendiente');
        if (Mod.partidoId && !pendientes.some(p => p.id === Mod.partidoId)) Mod.partidoId = null;
        if (!Mod.partidoId && pendientes.length) Mod.partidoId = pendientes[0].id;

        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Carga de resultados</h2>' +
            '<p>Jornada ' + jn + ' · Validá el marcador antes de guardar. El cálculo de tabla es automático.</p></div>' +
            '<div class="seccion-acciones">' + GL.badge(jn + ' / ' + ((GL.torneo()&&GL.torneo().total_jornadas)||22), 'gold', 'flag') + '</div></div>' +
          '<div class="tabs">' +
            '<button type="button" class="tab' + (Mod.modo === 'manual' ? ' activo' : '') + '" data-modo="manual">' + icono('keyboard', 16) + 'Ingreso manual</button>' +
            '<button type="button" class="tab' + (Mod.modo === 'ia' ? ' activo' : '') + '" data-modo="ia">' + icono('scan-eye', 16) + 'Análisis de captura (IA)</button>' +
          '</div>' +
          '<div class="grid dos resultado-grid">' +
            '<div class="card"><div class="card-titulo">' + icono('list-checks', 19) + 'Partidos pendientes</div>' +
              '<div id="lista-pendientes">' + htmlLista(pendientes) + '</div></div>' +
            '<div id="panel-resultado"></div>' +
          '</div>';

        const panel = el.querySelector('#panel-resultado');
        const pintarPanel = () => {
          const p = pendientes.find(x => x.id === Mod.partidoId);
          panel.innerHTML = !p ? GL.vacio('No hay partidos pendientes en esta jornada.', 'check-check', null)
            : (Mod.modo === 'manual' ? htmlManual(p) : htmlIA(p));
          enlazarPanel(panel, p);
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
      } catch (e) { console.error(e); el.innerHTML = GL.error(e.message, null, 'los resultados'); }
      iniciarIconos();
    }
  };

  function htmlLista(pendientes) {
    if (!pendientes.length) return '<p class="vacio-mensaje">Todos los partidos de la jornada ya tienen resultado.</p>';
    return '<div style="display:flex;flex-direction:column;gap:7px;max-height:520px;overflow:auto">' +
      pendientes.map(p => {
        const cerrada = esCerrada(p);
        return '<button type="button" class="partido-card' + (p.id === Mod.partidoId ? ' activo' : '') + '" data-partido="' + p.id + '"' +
          ' style="width:100%;text-align:left;' + (p.id === Mod.partidoId ? 'border-color:var(--accent-gold);background:rgba(245,197,24,.05)' : '') + '">' +
          '<div style="flex:1;min-width:0"><div style="font-size:9px;color:var(--text-muted)">J' + p.jornada + ' · Grupo ' +
            GL.letraGrupo(GL.grupo(p.grupo_id)) + '</div>' +
            '<div style="font-family:Rajdhani;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            esc(GL.nombreJugador(p.local_id)) + ' vs ' + esc(GL.nombreJugador(p.visitante_id)) + '</div></div>' +
          (cerrada ? GL.badge('Cerrada', 'red') : icono('chevron-right', 16)) + '</button>';
      }).join('') + '</div>';
  }

  function htmlManual(p) {
    const cerrada = esCerrada(p);
    return '<div class="card"><div class="card-titulo">' + icono('clipboard-check', 20) + 'Resultado manual</div>' +
      (cerrada ? '<div class="badge red" style="margin-bottom:12px">' + icono('lock', 14) + 'Jornada cerrada — no se puede editar</div>' : '') +
      '<div class="campo-row">' +
        '<label class="campo"><span>Local · ' + esc(GL.nombreJugador(p.local_id)) + '</span>' +
          '<input class="input" type="number" min="0" max="99" id="g-local" value="' + (p.goles_local || 0) + '"' + (cerrada ? ' disabled' : '') + '></label>' +
        '<label class="campo"><span>Visitante · ' + esc(GL.nombreJugador(p.visitante_id)) + '</span>' +
          '<input class="input" type="number" min="0" max="99" id="g-visita" value="' + (p.goles_visitante || 0) + '"' + (cerrada ? ' disabled' : '') + '></label>' +
      '</div>' +
      '<label class="campo"><span>Estado del partido</span><select class="input" id="estado"' + (cerrada ? ' disabled' : '') + '>' +
        Object.entries(ESTADOS_PARTIDO).filter(([k]) => k !== 'pendiente').map(([k, v]) =>
          '<option value="' + k + '"' + (p.estado === k ? ' selected' : '') + '>' + v.label + '</option>').join('') +
      '</select></label>' +
      '<details class=\"mt\"><summary style=\"cursor:pointer;color:var(--text-secondary);font-size:12px\">' + icono('chart-no-axes-column', 14) + ' Estadísticas avanzadas (opcional)</summary>' +
        '<div class=\"campo-stats-grid mt\">' + camposStats(p, cerrada) + '</div></details>' +
      // Captura obligatoria en ingreso manual
      (!cerrada ? (
        '<div class=\"campo mt\">' +
          '<span style=\"font-size:12px;color:var(--text-secondary)\">' + icono('image', 14) + ' Captura del partido' +
            (p.captura_url ? ' <span class=\"badge green\" style=\"font-size:11px\">Ya tiene captura</span>' : ' <span class=\"badge red\" style=\"font-size:11px\">Obligatoria</span>') +
          '</span>' +
          '<div class=\"dropzone mini\" id=\"dropzone-manual\" style=\"margin-top:6px;padding:12px;border:1px dashed var(--border);border-radius:var(--radius);text-align:center;cursor:pointer\">' +
            (Mod.archivo
              ? icono('image-check', 20) + ' <span style=\"font-size:12px\">' + esc(Mod.archivo.name) + '</span>'
              : icono('upload', 20) + ' <span style=\"font-size:12px\">Clic para adjuntar JPG/PNG (máx. 5 MB)</span>') +
          '</div>' +
          '<input type=\"file\" id=\"archivo-manual\" accept=\"image/jpeg,image/png\" class=\"oculto\">' +
        '</div>'
      ) : '') +
      '<div class=\"barra-acciones mt\" style=\"display:flex;gap:9px;justify-content:flex-end\">' +
        '<button type=\"button\" class=\"btn\" id=\"guardar\"' + (cerrada ? ' disabled' : '') + '>' + icono('save', 17) + 'Confirmar y Guardar</button>' +
      '</div></div>';
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
      '<label class="campo campo-stats"><span>' + label + '</span>' +
      '<input class="input" type="number" min="0" max="100" id="' + k + '" value="' +
      (d[k] !== undefined ? d[k] : (p[k] !== undefined ? p[k] : '')) + '"' + (cerrada ? ' disabled' : '') + '>' +
      icono('pencil', 13) + '</label>').join('');
  }

  function htmlIA(p) {
    if (esCerrada(p)) {
      return '<div class="card"><div class="card-titulo">' + icono('lock', 19) + 'Jornada cerrada</div>' +
        '<p class="muted">No se pueden cargar resultados de una jornada cerrada. Reabrí la jornada desde Administración si necesitás corregirla.</p></div>';
    }
    if (Mod.analizando) {
      return '<div class="card center"><div class="analizando" style="justify-content:center">' +
        '<span class="spinner"></span>Analizando captura con Gemini AI...</div>' +
        '<p class="muted mt">Extrayendo marcador y estadísticas de la captura.</p></div>';
    }
    if (Mod.datosIA) {
      const d = Mod.datosIA;
      return '<div class="card"><div class="card-titulo">' + icono('sparkles', 19) + 'Datos detectados <span class="badge gold">Revisá antes de guardar</span></div>' +
        '<div class="campo-row">' +
          '<label class="campo"><span>Goles local · ' + esc(GL.nombreJugador(p.local_id)) + '</span><input class="input" type="number" min="0" id="g-local" value="' + (d.goles_local || 0) + '"></label>' +
          '<label class="campo"><span>Goles visitante · ' + esc(GL.nombreJugador(p.visitante_id)) + '</span><input class="input" type="number" min="0" id="g-visita" value="' + (d.goles_visitante || 0) + '"></label>' +
        '</div>' +
        '<div class="campo-stats-grid">' + camposStats(p, false, d) + '</div>' +
        '<div class="barra-acciones mt" style="display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap">' +
          '<button type="button" class="btn sec" id="re-hacer">' + icono('rotate-ccw', 16) + 'Otra captura</button>' +
          '<button type="button" class="btn" id="guardar">' + icono('save', 17) + 'Confirmar y Guardar</button>' +
        '</div></div>';
    }
    return '<div class="card"><div class="card-titulo">' + icono('upload-cloud', 19) + 'Análisis de captura</div>' +
      '<p class="muted" style="font-size:12px;margin-bottom:12px">Subí una captura de la pantalla de resultados de FC Mobile. El sistema extrae los datos y vos los confirmás.</p>' +
      (esCerrada(p) ? '<div class="badge red" style="margin-bottom:12px">Jornada cerrada</div>' : '') +
      '<div class="dropzone" id="dropzone">' + icono('image-plus', 34) +
        '<strong>Arrastrá la captura aquí</strong><p>o hacé clic para elegir un archivo · JPG/PNG máx. 5 MB</p>' +
        (Mod.archivo ? '<img id="preview" alt="Vista previa de la captura" src="' + URL.createObjectURL(Mod.archivo) + '">' : '') +
      '</div>' +
      '<button type="button" class="btn sec block mt" id="elegir-captura">' + icono('upload', 16) + 'Seleccionar captura</button>' +
      '<input type="file" id="archivo" accept="image/jpeg,image/png" class="oculto">' +
      (Mod.archivo ? '<button type="button" class="btn block mt" id="analizar">' + icono('scan-eye', 17) + 'Analizar captura</button>' : '') +
      '</div>';
  }

  function esCerrada(p) {
    const j = (GL.ctx.jornadas || []).find(x => x.numero === p.jornada && x.grupo_id === p.grupo_id);
    return !!(j && j.estado === 'cerrada');
  }

  function enlazarPanel(panel, p) {
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
        if (f && ['image/jpeg', 'image/png'].includes(f.type)) { Mod.archivo = f; pintarPanel(); }
        else GL.notificar('Solo se aceptan JPG o PNG.', 'advertencia');
      });
      archivoManual.addEventListener('change', () => {
        const f = archivoManual.files[0];
        if (f) { Mod.archivo = f; pintarPanel(); }
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
    if (analizar) analizar.addEventListener('click', () => analizarCaptura(p));
    const rehacer = g('#re-hacer');
    if (rehacer) rehacer.addEventListener('click', () => { Mod.datosIA = null; Mod.archivo = null; Mod.render(panel.closest('#vista') || document.getElementById('vista')); });
    const guardar = g('#guardar');
    if (guardar) guardar.addEventListener('click', () => guardarResultado(p, panel));
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
    panel.innerHTML = '<div class="card center"><div class="analizando" style="justify-content:center">' +
      '<span class="spinner"></span>Analizando captura con Gemini AI...</div></div>';
    GL.notificar('Analizando captura con Gemini AI...', 'info', 'loader-circle');
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
      GL.notificar('No se pudo analizar: ' + e.message + '. Podés usar el ingreso manual.', 'error');
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
        p_motivo:          null,   // null = ingreso inicial; string = corrección con motivo
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
      GL.notificar('No se pudo guardar: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = icono('save', 17) + 'Confirmar y Guardar'; }
    }
  }

  Modulos.resultados = Mod;
})();
