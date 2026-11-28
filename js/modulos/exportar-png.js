/* =====================================================================
   MÓDULO 9 — Exportación a PNG
   Plantillas independientes: tabla, stats, perfil, eliminatorias.
   Vista previa antes de descargar. Dividido automático si canvas grande.
   ===================================================================== */
(function () {

  /* ── Cargar html2canvas bajo demanda (8 s por fuente + CDN alternativo) ── */
  const CDNS_H2C = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
  ];
  let _promesaH2C = null;

  function cargarHtml2Canvas() {
    if (typeof html2canvas === 'function') return Promise.resolve();
    if (_promesaH2C) return _promesaH2C;
    _promesaH2C = (async () => {
      for (const src of CDNS_H2C) {
        try {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            const t = setTimeout(() => {
              s.remove();
              rej(new Error('La descarga tardó más de 8 segundos.'));
            }, 8000);
            s.onload = () => { clearTimeout(t); res(); };
            s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error('No se pudo descargar la biblioteca.')); };
            document.head.appendChild(s);
          });
          if (typeof html2canvas === 'function') return;
        } catch (e) {
          console.warn('[exportar-png] CDN sin respuesta:', src, e.message);
        }
      }
      throw new Error('No se pudo cargar html2canvas. Revisá tu conexión e intentá de nuevo.');
    })().catch(e => { _promesaH2C = null; throw e; });
    return _promesaH2C;
  }

  function avisarError(e) {
    console.error('[exportar-png]', e);
    GL.notificar(GL.mensaje(e, 'png', 'la imagen'), 'error');
  }

  /* ── Esperar fuentes ── */
  async function esperarFuentes() {
    try { if (document.fonts) await document.fonts.ready; } catch (e) {}
  }

  /* ── Precarga de imágenes para evitar taint ── */
  async function precargarImagenes(nodo) {
    const imgs = Array.from(nodo.querySelectorAll('img'));
    await Promise.allSettled(imgs.map(img => new Promise(res => {
      if (img.complete) return res();
      img.onload = img.onerror = res;
    })));
  }

  /* ── Capturar nodo ya renderizado ── */
  async function capturar(nodo, escala, prepararClon) {
    const e = Math.min(escala || 2, 3);
    await precargarImagenes(nodo);
    const canvas = await html2canvas(nodo, {
      backgroundColor        : '#0a0e1a',
      scale                  : e,
      useCORS                : true,
      allowTaint             : false,
      logging                : false,
      width                  : nodo.offsetWidth,
      height                 : nodo.offsetHeight,
      windowWidth            : nodo.offsetWidth,
      windowHeight           : nodo.offsetHeight,
      x: 0, y: 0, scrollX: 0, scrollY: 0,
      foreignObjectRendering : false,
      imageTimeout           : 8000,
      onclone(doc, clon) { if (typeof prepararClon === 'function') prepararClon(doc, clon); }
    });
    if (!canvas || canvas.width < 10 || canvas.height < 10) {
      throw new Error('La imagen generada quedó vacía. Intentá de nuevo.');
    }
    // Límite de seguridad: > 16 384 px puede fallar en móvil/Safari
    const MAX = 16000;
    if (canvas.width > MAX || canvas.height > MAX) {
      const factor = Math.min(MAX / canvas.width, MAX / canvas.height);
      const c2 = document.createElement('canvas');
      c2.width  = Math.floor(canvas.width  * factor);
      c2.height = Math.floor(canvas.height * factor);
      c2.getContext('2d').drawImage(canvas, 0, 0, c2.width, c2.height);
      return c2;
    }
    return canvas;
  }

  /* ── Descargar canvas como PNG ── */
  function descargar(canvas, nombre) {
    const link = document.createElement('a');
    link.download = (nombre || 'GOATS_export') + '.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /* ── Dividir canvas grande en partes ── */
  function dividirCanvas(canvas, maxAlto) {
    const partes = [];
    let y = 0;
    while (y < canvas.height) {
      const alto = Math.min(maxAlto, canvas.height - y);
      const c = document.createElement('canvas');
      c.width  = canvas.width;
      c.height = alto;
      c.getContext('2d').drawImage(canvas, 0, -y);
      partes.push(c);
      y += maxAlto;
    }
    return partes;
  }

  /* ── Vista previa antes de descargar ── */
  function mostrarVistaPreviaYDescargar(canvas, nombre) {
    return new Promise(res => {
      const fondo = document.createElement('div');
      fondo.className = 'exp-preview-fondo';
      fondo.innerHTML =
        '<div class="exp-preview-modal">' +
          '<div class="exp-preview-head">' +
            '<strong>Vista previa</strong>' +
            '<button type="button" class="btn-icon" id="exp-cerrar" aria-label="Cerrar">✕</button>' +
          '</div>' +
          '<div class="exp-preview-scroll">' +
            '<img class="exp-preview-img" alt="Vista previa de la exportación">' +
          '</div>' +
          '<div class="exp-preview-pie">' +
            '<span class="muted" style="font-size:12px">' + canvas.width + ' × ' + canvas.height + ' px</span>' +
            '<div style="display:flex;gap:8px">' +
              '<button type="button" class="btn sec" id="exp-cancelar">Cancelar</button>' +
              '<button type="button" class="btn" id="exp-descargar">⬇ Descargar PNG</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(fondo);
      iniciarIconos();

      const MAX_PREVIEW_H = 12000;
      fondo.querySelector('.exp-preview-img').src = canvas.toDataURL('image/png');

      let cerrado = false;
      const onEscape = e => { if (e.key === 'Escape') { e.preventDefault(); cerrar(); } };
      function cerrar(resultado) {
        if (cerrado) return;
        cerrado = true;
        document.removeEventListener('keydown', onEscape);
        fondo.remove();
        res(resultado);
      }
      document.addEventListener('keydown', onEscape);

      fondo.querySelector('#exp-cerrar').addEventListener('click', () => cerrar(false), { once: true });
      fondo.querySelector('#exp-cancelar').addEventListener('click', () => cerrar(false), { once: true });
      fondo.addEventListener('click', e => { if (e.target === fondo) cerrar(false); });

      fondo.querySelector('#exp-descargar').addEventListener('click', async () => {
        try {
          if (canvas.height > MAX_PREVIEW_H) {
            const partes = dividirCanvas(canvas, MAX_PREVIEW_H);
            // Descargas secuenciales con breve espera: evita que el navegador
            // bloquee varios clics simultáneos como descargas múltiples.
            for (let i = 0; i < partes.length; i++) {
              descargar(partes[i], nombre + '_parte' + (i + 1));
              if (i < partes.length - 1) await new Promise(r => setTimeout(r, 350));
            }
            GL.notificar('Exportado en ' + partes.length + ' partes por tamaño.', 'info');
          } else {
            descargar(canvas, nombre);
            GL.notificar('Imagen descargada.', 'exito', 'image');
          }
          cerrar(true);
        } catch (e) {
          avisarError(e);
          cerrar(false);
        }
      }, { once: true });
    });
  }

  /* ── Montar plantilla, capturar, mostrar preview y desmontar ── */
  async function capturarPlantilla(html, nombre, anchoFijo, escala) {
    await cargarHtml2Canvas();
    await esperarFuentes();

    const contenedor = document.createElement('div');
    contenedor.className = 'exp-contenedor';
    contenedor.dataset.expPlantilla = '1';
    if (anchoFijo) contenedor.style.width = anchoFijo + 'px';
    // Fuera de pantalla y transparente en la página real; html2canvas trabaja
    // sobre un clon, donde se fuerza visibility/opacity para que el PNG tenga
    // contenido (antes quedaba oculto por heredar visibility:hidden).
    contenedor.style.cssText +=
      ';position:fixed;left:-10000px;top:0;z-index:-1;visibility:visible;opacity:0;pointer-events:none';
    contenedor.innerHTML = html;
    document.body.appendChild(contenedor);

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const prepararClon = (doc, clon) => {
      if (!clon) return;
      clon.style.setProperty('visibility', 'visible', 'important');
      clon.style.setProperty('opacity', '1', 'important');
      clon.style.setProperty('position', 'fixed', 'important');
      clon.style.setProperty('left', '0', 'important');
      clon.style.setProperty('top', '0', 'important');
      clon.style.setProperty('z-index', '99999', 'important');
    };

    try {
      const canvas = await capturar(contenedor, escala || 2, prepararClon);
      await mostrarVistaPreviaYDescargar(canvas, nombre);
    } finally {
      contenedor.remove();
    }
  }

  /* ================================================================
     CSS COMPARTIDO DE PLANTILLAS
     ================================================================ */
  const CSS_BASE = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&display=swap');
    .exp-contenedor *{box-sizing:border-box;margin:0;padding:0}
    .exp-contenedor{font-family:'Rajdhani',sans-serif;background:#0a0e1a;color:#fff;border-radius:0}
    .exp-header{background:linear-gradient(135deg,#f5c518 0%,#e67e22 100%);padding:20px 24px 16px;display:flex;align-items:center;justify-content:space-between}
    .exp-header-logo{font-size:28px;font-weight:700;color:#000;letter-spacing:1px;line-height:1}
    .exp-header-sub{font-size:12px;color:rgba(0,0,0,.65);font-weight:600;margin-top:3px;letter-spacing:.5px}
    .exp-header-grupo{font-size:36px;font-weight:700;color:#000;opacity:.18;letter-spacing:2px}
    .exp-info{background:#111827;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1f2937}
    .exp-info-jornada{font-size:13px;font-weight:700;color:#f5c518;letter-spacing:.5px}
    .exp-info-fecha{font-size:11px;color:#9ca3af}
    .exp-leyenda{display:flex;gap:16px;padding:8px 24px;background:#0d1424;border-bottom:1px solid #1f2937;flex-wrap:wrap}
    .exp-leyenda-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#9ca3af}
    .exp-leyenda-punto{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    table.exp-tabla{width:100%;border-collapse:collapse;table-layout:auto}
    table.exp-tabla thead{background:#1a2235}
    table.exp-tabla thead th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;padding:9px 8px;text-align:center;border-bottom:2px solid #f5c518;white-space:nowrap}
    table.exp-tabla thead th.izq{text-align:left;padding-left:12px}
    table.exp-tabla tbody tr{border-bottom:1px solid #131b2e}
    table.exp-tabla tbody tr:nth-child(even){background:#0d1424}
    table.exp-tabla tbody tr.exp-sep-row{background:transparent!important;border:none}
    .exp-sep-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#ff4757;text-align:right;padding:5px 12px 3px;border-top:1px solid rgba(255,71,87,.4);opacity:.85}
    table.exp-tabla tbody td{padding:8px;text-align:center;vertical-align:middle;font-size:14px;font-weight:600;white-space:nowrap}
    table.exp-tabla tbody td.izq{text-align:left;padding-left:12px}
    .exp-pos{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font-size:12px;font-weight:700}
    .exp-clasifica{background:#00d4aa;color:#000}
    .exp-medio{background:#ff8c00;color:#000}
    .exp-descenso{background:#ff4757;color:#fff}
    .exp-verde{color:#00d4aa}
    .exp-rojo{color:#ff4757}
    .exp-pts{color:#f5c518;font-size:15px;font-weight:700}
    .exp-bandera{width:20px;height:auto;border-radius:2px;vertical-align:middle}
    .exp-bandera-txt{font-size:11px;color:#9ca3af}
    .exp-footer{padding:10px 24px;background:#080c15;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #1f2937}
    .exp-footer-liga{font-size:11px;color:#4b5563;font-weight:600;letter-spacing:.5px}
    .exp-footer-nota{font-size:10px;color:#374151}
    .exp-zona-bar{display:inline-block;width:3px;height:22px;border-radius:2px;vertical-align:middle;margin-right:5px}
    .exp-zona-clasifica{background:#00d4aa}
    .exp-zona-medio{background:transparent}
    .exp-zona-descenso{background:#ff4757}
  </style>`;

  /* CSS específico para el PNG de «Partidos de hoy» (1.6). */
  const CSS_PARTIDOS = `
  <style>
    .exp-partidos-wrap{width:100%;background:#0a0e1a;color:#fff}
    .exp-partidos-lista{padding:16px 20px 10px;display:grid;gap:10px}
    .exp-partido-card{
      background:linear-gradient(135deg,#121b2e 0%,#0d1424 100%);
      border:1px solid #1f2b44;border-left:3px solid #f5c518;border-radius:10px;
      padding:12px 14px
    }
    .exp-partido-fila{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:38px}
    .exp-partido-fila.visitante{flex-direction:row-reverse}
    .exp-partido-equipo{display:flex;align-items:center;gap:9px;min-width:0;font-size:15px;font-weight:700}
    .exp-partido-equipo.visitante{text-align:right}
    .exp-partido-equipo span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .exp-partido-equipo img{width:18px;height:auto;border-radius:2px;flex:none}
    .exp-partido-scio{font-size:11px;color:#64748b;letter-spacing:.6px}
    .exp-partido-marcador{
      min-width:74px;text-align:center;font-size:22px;font-weight:700;color:#f5c518;
      background:rgba(245,197,24,.09);border:1px solid rgba(245,197,24,.25);
      border-radius:8px;padding:4px 8px
    }
    .exp-partido-marcador.jugado{color:#00d4aa;border-color:rgba(0,212,170,.3);background:rgba(0,212,170,.08)}
    .exp-partido-estado{
      display:flex;justify-content:center;gap:6px;margin-top:8px;padding-top:7px;
      border-top:1px solid #1f2b44;font-size:10px;font-weight:700;letter-spacing:.6px;
      text-transform:uppercase;color:#9ca3af
    }
    .exp-partido-nota{padding:4px 20px 14px;font-size:10px;color:#6b7280;text-align:center}
  </style>`;

  /* ================================================================
     PLANTILLA: TABLA DE POSICIONES
     Columnas correctas: #, Jugador, País, PJ, G, E, P, GF, GC, Dif, Pts
     ================================================================ */
  function htmlPlantillaTabla(grupoId, jornada) {
    const clasificacion  = GL.clasificacion(grupoId);
    const jugadoresGrupo = new Set((GL.ctx.miembros || []).filter(m => m.grupo_id === grupoId).map(m => m.jugador_id));
    const datos          = clasificacion.filter(f => jugadoresGrupo.has(f.jugador_id));
    const grupo          = GL.grupo(grupoId);
    const torneo         = GL.torneo();
    const letraGrupo     = GL.letraGrupo(grupo);
    const total          = datos.length;
    const fechaHoy       = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    const filas = datos.map((f, i) => {
      const pos    = i + 1;
      const j      = GL.jugador(f.jugador_id) || {};
      const clasePos    = pos <= 6 ? 'exp-clasifica' : pos > total - 3 ? 'exp-descenso' : 'exp-medio';
      const zonaBar     = pos <= 6 ? 'exp-zona-clasifica' : pos > total - 3 ? 'exp-zona-descenso' : 'exp-zona-medio';
      const separador   = pos === total - 2
        ? '<tr class="exp-sep-row"><td colspan="11"><div class="exp-sep-label">▼ Zona de descenso</div></td></tr>'
        : '';
      const urlBandera  = GL.banderaUrl ? GL.banderaUrl(j.pais) : null;
      const banderaImg  = urlBandera
        ? '<img src="' + urlBandera + '" alt="' + esc(j.pais || '') + '" class="exp-bandera" crossorigin="anonymous">'
        : '<span class="exp-bandera-txt">' + esc(j.pais || '—') + '</span>';
      const dif    = Number(f.dif) || 0;
      const difStr = dif > 0 ? '+' + dif : String(dif);
      const difCls = dif > 0 ? 'exp-verde' : dif < 0 ? 'exp-rojo' : '';
      return separador +
        '<tr>' +
          '<td><span class="exp-zona-bar ' + zonaBar + '"></span><span class="exp-pos ' + clasePos + '">' + pos + '</span></td>' +
          '<td class="izq" style="max-width:160px;overflow:hidden;text-overflow:ellipsis">' + esc(j.nombre_usuario || '—') + '</td>' +
          '<td>' + banderaImg + '</td>' +
          '<td>' + (f.pj || 0) + '</td>' +
          '<td class="exp-verde">' + (f.pg || 0) + '</td>' +
          '<td>' + (f.pe || 0) + '</td>' +
          '<td class="exp-rojo">' + (f.pp || 0) + '</td>' +
          '<td>' + (f.gf || 0) + '</td>' +
          '<td>' + (f.gc || 0) + '</td>' +
          '<td class="' + difCls + '">' + difStr + '</td>' +
          '<td class="exp-pts">' + (f.pts || 0) + '</td>' +
        '</tr>';
    }).join('');

    return CSS_BASE + `
<div class="exp-header">
  <div>
    <div class="exp-header-logo">GOATS LATINOS</div>
    <div class="exp-header-sub">${esc(torneo ? torneo.temporada || 'Temporada activa' : 'Liga')} · Grupo ${esc(letraGrupo)}</div>
  </div>
  <div class="exp-header-grupo">G${esc(letraGrupo)}</div>
</div>
<div class="exp-info">
  <span class="exp-info-jornada">Jornada ${esc(String(jornada ? jornada.numero : '—'))} / ${esc(String(torneo ? torneo.total_jornadas || 22 : 22))}</span>
  <span class="exp-info-fecha">${esc(fechaHoy)}</span>
</div>
<div class="exp-leyenda">
  <div class="exp-leyenda-item"><div class="exp-leyenda-punto" style="background:#00d4aa"></div>Clasifica (top 6)</div>
  <div class="exp-leyenda-item"><div class="exp-leyenda-punto" style="background:#ff8c00"></div>Zona media</div>
  <div class="exp-leyenda-item"><div class="exp-leyenda-punto" style="background:#ff4757"></div>Descenso</div>
</div>
<table class="exp-tabla">
  <thead><tr>
    <th>#</th><th class="izq">Jugador</th><th>País</th>
    <th title="Partidos jugados">PJ</th>
    <th class="exp-verde" title="Victorias">G</th>
    <th title="Empates">E</th>
    <th class="exp-rojo" title="Derrotas">P</th>
    <th title="Goles a favor">GF</th>
    <th title="Goles en contra">GC</th>
    <th title="Diferencia de gol">Dif</th>
    <th class="exp-pts" title="Puntos">Pts</th>
  </tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="exp-footer">
  <span class="exp-footer-liga">GOATS LATINOS LEAGUE MANAGER</span>
  <span class="exp-footer-nota">Clasifican 6 jugadores por grupo · ${esc(fechaHoy)}</span>
</div>`;
  }

  /* ================================================================
     PLANTILLA: ESTADÍSTICAS DE JORNADA
     ================================================================ */
  function htmlPlantillaStats(grupoId, jornadaNum) {
    const torneo  = GL.torneo();
    const grupo   = GL.grupo(grupoId);
    const fechaHoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    // Usar datos ya calculados desde EST si existe, si no aproximar desde partidos
    const partidos = (GL.ctx.partidos || []).filter(p =>
      p.grupo_id === grupoId && p.jornada === jornadaNum && p.estado !== 'pendiente'
    );
    const stats = {};
    const asegurar = id => stats[id] || (stats[id] = { id, pj:0, gf:0, gc:0, vallas:0 });
    partidos.forEach(p => {
      const gr = GL.golesReales(p);
      if (gr.pendiente) return;
      const l = asegurar(p.local_id), v = asegurar(p.visitante_id);
      l.pj++; v.pj++;
      l.gf += gr.gf; l.gc += gr.gc;
      v.gf += gr.gc; v.gc += gr.gf;
      if (p.estado === 'jugado' && gr.gc === 0) l.vallas++;
      if (p.estado === 'jugado' && gr.gf === 0) v.vallas++;
    });
    const lista = Object.values(stats).sort((a, b) => (b.gf - a.gf) || (a.gc - b.gc));
    const filas = lista.map((s, i) => {
      const j   = GL.jugador(s.id) || {};
      const dif = s.gf - s.gc;
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="izq">' + esc(j.nombre_usuario || '—') + '</td>' +
        '<td>' + s.pj + '</td>' +
        '<td class="exp-verde">' + s.gf + '</td>' +
        '<td class="exp-rojo">' + s.gc + '</td>' +
        '<td class="' + (dif > 0 ? 'exp-verde' : dif < 0 ? 'exp-rojo' : '') + '">' + (dif > 0 ? '+' : '') + dif + '</td>' +
        '<td class="exp-pts">' + s.vallas + '</td>' +
      '</tr>';
    }).join('');

    return CSS_BASE + `
<div class="exp-header">
  <div>
    <div class="exp-header-logo">GOATS LATINOS</div>
    <div class="exp-header-sub">Estadísticas · Grupo ${esc(GL.letraGrupo(grupo))} · Jornada ${esc(String(jornadaNum))}</div>
  </div>
  <div class="exp-header-grupo">J${esc(String(jornadaNum))}</div>
</div>
<div class="exp-info">
  <span class="exp-info-jornada">Estadísticas de la jornada ${esc(String(jornadaNum))}</span>
  <span class="exp-info-fecha">${esc(fechaHoy)}</span>
</div>
<table class="exp-tabla">
  <thead><tr>
    <th>#</th><th class="izq">Jugador</th><th>PJ</th>
    <th class="exp-verde">GF</th><th class="exp-rojo">GC</th>
    <th>Dif</th><th class="exp-pts" title="Vallas invictas">VI</th>
  </tr></thead>
  <tbody>${filas || '<tr><td colspan="7" style="color:#9ca3af;text-align:center;padding:16px">Sin datos para esta jornada</td></tr>'}</tbody>
</table>
<div class="exp-footer">
  <span class="exp-footer-liga">GOATS LATINOS LEAGUE MANAGER</span>
  <span class="exp-footer-nota">GF = Goles a favor · GC = Goles en contra · VI = Vallas invictas · ${esc(fechaHoy)}</span>
</div>`;
  }

  /* ================================================================
     PLANTILLA: PERFIL DE JUGADOR
     ================================================================ */
  function htmlPlantillaPerfil(jugadorId) {
    const j      = GL.jugador(jugadorId) || {};
    const torneo = GL.torneo();
    const fechaHoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const grupo  = GL.grupoDeJugador(jugadorId);
    const fila   = (GL.clasificacion(grupo && grupo.id) || []).find(f => f.jugador_id === jugadorId) || {};
    const dif    = Number(fila.dif) || 0;
    const stat   = (label, val, color) =>
      '<div style="text-align:center;padding:14px 10px;background:#111827;border-radius:8px;flex:1;min-width:80px">' +
        '<div style="font-size:28px;font-weight:700;color:' + (color || '#fff') + ';font-family:Rajdhani,sans-serif">' + val + '</div>' +
        '<div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-top:3px">' + label + '</div>' +
      '</div>';

    return CSS_BASE + `
<div class="exp-header">
  <div>
    <div class="exp-header-logo">GOATS LATINOS</div>
    <div class="exp-header-sub">Perfil · ${esc(j.nombre_usuario || 'Jugador')}</div>
  </div>
  <div style="display:flex;align-items:center;gap:10px">
    ${GL.banderaUrl && GL.banderaUrl(j.pais)
      ? '<img src="' + GL.banderaUrl(j.pais) + '" style="width:32px;border-radius:4px" crossorigin="anonymous">'
      : '<span style="font-size:22px;color:rgba(0,0,0,.3)">' + esc(j.pais || '') + '</span>'}
  </div>
</div>
<div style="padding:18px 24px;display:flex;gap:8px;flex-wrap:wrap;background:#0d1424;border-bottom:1px solid #1f2937">
  ${stat('PJ', fila.pj || 0, '#fff')}
  ${stat('Victorias', fila.pg || 0, '#00d4aa')}
  ${stat('Empates', fila.pe || 0, '#fff')}
  ${stat('Derrotas', fila.pp || 0, '#ff4757')}
  ${stat('GF', fila.gf || 0, '#00d4aa')}
  ${stat('GC', fila.gc || 0, '#ff4757')}
  ${stat('Dif', (dif > 0 ? '+' : '') + dif, dif >= 0 ? '#00d4aa' : '#ff4757')}
  ${stat('Pts', fila.pts || 0, '#f5c518')}
</div>
<div class="exp-footer">
  <span class="exp-footer-liga">GOATS LATINOS · ${esc(torneo ? torneo.temporada || '' : '')} · Grupo ${esc(grupo ? GL.letraGrupo(grupo) : '—')}</span>
  <span class="exp-footer-nota">${esc(fechaHoy)}</span>
</div>`;
  }

  /* ================================================================
     PLANTILLA: PARTIDOS DE HOY (1.6)
     Un PNG portrait por grupo, listo para compartir por WhatsApp.
     ================================================================ */
  async function htmlPlantillaPartidos(grupoId, jornadaNum) {
    const torneo = GL.torneo();
    const grupo = GL.grupo(grupoId);
    const letra = GL.letraGrupo(grupo);
    const jornadaActual = GL.jornadaActual();
    const numero = Number(jornadaNum || (jornadaActual && jornadaActual.numero)) || 1;
    const partidos = torneo
      ? await GL.partidos({ torneo_id: torneo.id, jornada: numero, grupo_id: grupoId })
      : [];
    const fechaHoy = new Date().toLocaleDateString('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    const tarjetas = partidos.map(p => {
      const r = GL.resultado(p);
      const local = GL.jugador(p.local_id) || {};
      const visita = GL.jugador(p.visitante_id) || {};
      const bandera = j => {
        const url = GL.banderaUrl ? GL.banderaUrl(j.pais) : null;
        return url
          ? '<img src="' + esc(url) + '" alt="' + esc(j.pais || '') + '" crossorigin="anonymous">'
          : '<span class="exp-partido-scio">' + esc(j.pais || '—') + '</span>';
      };
      const lado = (j, esLocal) =>
        '<div class="exp-partido-equipo' + (esLocal ? '' : ' visitante') + '">' +
          (esLocal ? bandera(j) : '') +
          '<span>' + esc(GL.nombreJugador(esLocal ? p.local_id : p.visitante_id)) + '</span>' +
          (esLocal ? '' : bandera(j)) +
        '</div>';
      return '<div class="exp-partido-card">' +
        '<div class="exp-partido-fila">' + lado(local, true) +
          '<div class="exp-partido-marcador' + (r.pendiente ? '' : ' jugado') + '">' +
            esc(r.texto) + '</div>' +
        '</div>' +
        '<div class="exp-partido-fila visitante">' + lado(visita, false) + '</div>' +
        '<div class="exp-partido-estado">' + esc(r.estado && r.estado.label ? r.estado.label : '') + '</div>' +
      '</div>';
    }).join('');

    const lista = tarjetas ||
      '<p class="exp-partido-nota">Esta jornada todavía no tiene partidos programados para el grupo.</p>';

    return CSS_BASE + CSS_PARTIDOS + `
<div class="exp-header">
  <div>
    <div class="exp-header-logo">GOATS LATINOS</div>
    <div class="exp-header-sub">Partidos de hoy · ${esc(torneo ? torneo.temporada || 'Temporada activa' : 'Liga')}</div>
  </div>
  <div class="exp-header-grupo">G${esc(letra)}</div>
</div>
<div class="exp-info">
  <span class="exp-info-jornada">Jornada ${esc(String(numero))} / ${esc(String(torneo ? torneo.total_jornadas || 22 : 22))} · Grupo ${esc(letra)}</span>
  <span class="exp-info-fecha">${esc(fechaHoy)}</span>
</div>
<div class="exp-partidos-lista">${lista}</div>
<div class="exp-partido-nota">${esc(GL.notaHorarios ? GL.notaHorarios() : '')}</div>
<div class="exp-footer">
  <span class="exp-footer-liga">GOATS LATINOS · Grupo ${esc(letra)}</span>
  <span class="exp-footer-nota">Compartir por WhatsApp</span>
</div>`;
  }

  /* ================================================================
     PLANTILLA DEDICADA: INFORME AVANZADO POR GRUPO/JORNADA
     Composición propia, 1080 × 1350 (capturada a escala 2). No captura
     el dashboard: no incluye botones, selectores ni controles.
     ================================================================ */

  const CSS_INFORME = `
  <style>
    .ea-doc,.ea-doc *{box-sizing:border-box;margin:0;padding:0}
    .ea-doc{width:1080px;height:1350px;position:relative;overflow:hidden;
      background:#0B0D10;color:#F5F6F7;
      font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif}
    .ea-cab{height:176px;padding:30px 40px;background:linear-gradient(135deg,#E11D35 0%,#8B1023 100%)}
    .ea-marca{font-size:12px;font-weight:800;letter-spacing:.18em;color:rgba(255,255,255,.78)}
    .ea-titulo{margin-top:8px;font-size:38px;font-weight:800;line-height:1.05}
    .ea-sub{margin-top:8px;font-size:15px;color:rgba(255,255,255,.82)}
    .ea-estado{position:absolute;right:40px;top:34px;padding:7px 14px;border:1px solid rgba(255,255,255,.45);
      border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
    .ea-kpis{position:relative;z-index:2;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;
      margin:-26px 40px 0}
    .ea-kpi{height:82px;padding:12px;border:1px solid #2E353D;border-radius:12px;background:#20252B}
    .ea-kpi strong{display:block;font-size:26px;line-height:1.1;font-weight:800;font-variant-numeric:tabular-nums}
    .ea-kpi small{display:block;margin-top:4px;font-size:10px;color:#9299A3;line-height:1.25}
    .ea-seccion{margin:18px 40px 0}
    .ea-seccion-titulo{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .ea-seccion-titulo strong{font-size:15px;font-weight:800;letter-spacing:.02em}
    .ea-seccion-titulo span{font-size:10px;color:#7A828E}
    .ea-tarjetas{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .ea-tarjeta{height:164px;padding:14px;border:1px solid #2E353D;border-radius:12px;background:#14171B}
    .ea-tarjeta h3{font-size:13px;font-weight:800;color:#FF6B7A;margin-bottom:10px}
    .ea-fila{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;align-items:center;
      padding:6px 0;border-top:1px solid #2E353D}
    .ea-fila:first-of-type{border-top:0}
    .ea-num{color:#FF6B7A;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums}
    .ea-nombre{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ea-valor{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}
    .ea-sin{font-size:11px;color:#7A828E;padding:18px 0;text-align:center}
    .ea-destacados{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
    .ea-dest{height:140px;padding:14px;border:1px solid #3B434D;border-radius:12px;background:#20252B}
    .ea-dest h3{font-size:12px;font-weight:800;color:#FF6B7A;margin-bottom:10px}
    .ea-marcador{font-size:30px;font-weight:800;color:#F5F6F7;font-variant-numeric:tabular-nums}
    .ea-duelo{font-size:13px;line-height:1.35;overflow-wrap:anywhere}
    .ea-nota-dest{font-size:10px;color:#9299A3;margin-top:6px}
    .ea-jugador{font-size:17px;font-weight:800;overflow-wrap:anywhere}
    .ea-detalle{margin:14px 40px 0}
    .ea-tabla{width:100%;border-collapse:collapse;background:#14171B;border:1px solid #2E353D}
    .ea-tabla th,.ea-tabla td{padding:7px 9px;border-bottom:1px solid #2E353D;font-size:11px;text-align:center;
      font-variant-numeric:tabular-nums}
    .ea-tabla th{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#9299A3;background:#20252B}
    .ea-tabla td:first-child{text-align:left;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ea-pie{position:absolute;left:40px;right:40px;bottom:22px;display:flex;justify-content:space-between;
      align-items:center;border-top:1px solid #2E353D;padding-top:10px;font-size:10px;color:#7A828E}
    .ea-pie strong{color:#F5F6F7;letter-spacing:.12em}
  </style>`;

  function textoPlano(valor) {
    return typeof esc === 'function' ? esc(valor) : String(valor === null || valor === undefined ? '' : valor);
  }

  function paisPlano(valor) {
    const codigo = String(valor || '');
    return /^[A-Za-z]{2}$/.test(codigo) ? codigo.toUpperCase() : 'Sin país registrado';
  }

  function numeroPlano(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  function valorTarjeta(tarjeta, jugador) {
    const n = numeroPlano(jugador[tarjeta.clave]);
    const conSigno = tarjeta.id === 'diferencia' && typeof GL.signo === 'function'
      ? GL.signo(n) : String(n);
    return conSigno + (tarjeta.sufijo || '');
  }

  function filasPlano(tarjeta) {
    if (!tarjeta.filas || !tarjeta.filas.length) {
      return '<div class="ea-sin">Sin datos registrados</div>';
    }
    return tarjeta.filas.slice(0, 3).map((j, i) =>
      '<div class="ea-fila"><span class="ea-num">' + (i + 1) + '</span>' +
        '<span class="ea-nombre">' + textoPlano(j.nombre) + '</span>' +
        '<strong class="ea-valor">' + textoPlano(valorTarjeta(tarjeta, j)) + '</strong></div>').join('');
  }

  function htmlPlantillaInformeEstadisticas(informe, opciones) {
    const d = informe || {};
    const o = opciones || {};
    const r = d.resumen || {};
    const letra = o.letraGrupo || (typeof GL.letraGrupo === 'function' && o.grupo
      ? GL.letraGrupo(o.grupo) : (o.grupo && o.grupo.nombre) || '—');
    const jornada = d.jornada === null || d.jornada === undefined ? '—' : d.jornada;
    const torneoNombre = o.torneoNombre || (typeof CONFIG !== 'undefined' && CONFIG.NOMBRE_LIGA) ||
      'GOATS LATINOS';
    const fecha = new Date().toLocaleDateString('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
    const estado = d.estadoJornada === 'cerrada' ? 'Jornada cerrada'
      : d.estadoJornada === 'abierta' ? 'Jornada abierta' : 'Sin programar';
    const kpis = [
      ['Partidos', r.partidos], ['Goles reales', r.golesReales],
      ['Goles regl.', r.golesReglamentarios], ['Vallas', r.vallas],
      ['Administrativos', r.partidosAdministrativos], ['Pendientes', r.pendientes]
    ];
    const partido = d.partidoDestacado;
    const jugador = d.jugadorDestacado;
    const detalle = (d.jugadores || []).slice().sort((a, b) =>
      numeroPlano(b.score) - numeroPlano(a.score) ||
      numeroPlano(b.gf) - numeroPlano(a.gf)).slice(0, 7);

    return CSS_INFORME +
      '<div class="ea-doc">' +
        '<header class="ea-cab">' +
          '<div class="ea-marca">' + textoPlano(torneoNombre).toUpperCase() + ' · LEAGUE MANAGER</div>' +
          '<div class="ea-titulo">Estadísticas · Grupo ' + textoPlano(letra) + '</div>' +
          '<div class="ea-sub">Jornada ' + textoPlano(jornada) +
            ' · Informe calculado desde resultados registrados</div>' +
          '<div class="ea-estado">' + textoPlano(estado) + '</div>' +
        '</header>' +
        '<section class="ea-kpis">' + kpis.map(([etiqueta, valor]) =>
          '<div class="ea-kpi"><strong>' + textoPlano(numeroPlano(valor)) + '</strong>' +
            '<small>' + textoPlano(etiqueta) + '</small></div>').join('') +
        '</section>' +
        '<section class="ea-seccion">' +
          '<div class="ea-seccion-titulo"><strong>Indicadores de la jornada</strong>' +
            '<span>Rendimiento real · resoluciones administrativas separadas</span></div>' +
          '<div class="ea-tarjetas">' + (d.tarjetas || []).map(t =>
            '<div class="ea-tarjeta"><h3>' + textoPlano(t.titulo) + '</h3>' +
              filasPlano(t) + '</div>').join('') + '</div>' +
        '</section>' +
        '<section class="ea-seccion ea-destacados">' +
          '<div class="ea-dest"><h3>PARTIDO DESTACADO</h3>' +
            (partido
              ? '<div class="ea-marcador">' + textoPlano(partido.marcador) + '</div>' +
                '<div class="ea-duelo">' + textoPlano(partido.local) + ' vs ' +
                  textoPlano(partido.visitante) + '</div>' +
                '<div class="ea-nota-dest">' + partido.goles + ' goles reales · J' +
                  textoPlano(partido.jornada) + '</div>'
              : '<div class="ea-sin">Sin partidos jugados en la jornada.</div>') +
          '</div>' +
          '<div class="ea-dest"><h3>JUGADOR DESTACADO</h3>' +
            (jugador
              ? '<div class="ea-jugador">' + textoPlano(jugador.nombre) + '</div>' +
                '<div class="ea-duelo">' + jugador.gf + ' goles · ' + jugador.vallas +
                  ' vallas · ' + jugador.score + ' pts</div>' +
                '<div class="ea-nota-dest">' + paisPlano(jugador.pais) +
                  ' · Grupo ' + textoPlano(letra) + '</div>'
              : '<div class="ea-sin">Sin jugador destacado.</div>') +
          '</div>' +
        '</section>' +
        '<section class="ea-detalle">' +
          '<div class="ea-seccion-titulo"><strong>Detalle por jugador</strong>' +
            '<span>Goles reales y porterías en 0</span></div>' +
          '<table class="ea-tabla"><thead><tr>' +
            '<th>Jugador</th><th>PJ</th><th>GF</th><th>GC</th><th>DG</th><th>Vallas</th>' +
          '</tr></thead><tbody>' + detalle.map(j =>
            '<tr><td>' + textoPlano(j.nombre) + '</td><td>' + j.pj + '</td><td>' + j.gf +
              '</td><td>' + j.gc + '</td><td>' +
              textoPlano(typeof GL.signo === 'function' ? GL.signo(j.dif) : j.dif) +
              '</td><td>' + j.vallas + '</td></tr>').join('') +
          '</tbody></table>' +
        '</section>' +
        '<footer class="ea-pie">' +
          '<span><strong>GOATS LATINOS</strong> · Grupo ' + textoPlano(letra) +
            ' · Jornada ' + textoPlano(jornada) + '</span>' +
          '<span>Generado ' + textoPlano(fecha) + ' · Sin datos de ejemplo</span>' +
        '</footer>' +
      '</div>';
  }

  function nombreSeguro(nombre) {
    return String(nombre || 'GOAT-LATINOS_Estadisticas')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function exportarInformeEstadisticas(informe, nombre) {
    GL.notificar('Preparando informe PNG…', 'info', 'loader-circle');
    try {
      await capturarPlantilla(
        htmlPlantillaInformeEstadisticas(informe, {
          letraGrupo: informe && informe.grupoLetra,
          grupo: informe && informe.grupo,
          torneoNombre: informe && informe.torneoNombre,
          jornada: informe && informe.jornada
        }),
        nombreSeguro(nombre || 'GOAT-LATINOS_Estadisticas'),
        1080,
        1
      );
    } catch (e) {
      avisarError(e);
    }
  }

  /* ================================================================
     API PÚBLICA
     ================================================================ */

  async function exportarTabla(grupoId, nombre) {
    const jornada = GL.jornadaActual();
    GL.notificar('Preparando imagen…', 'info', 'loader-circle');
    try {
      await capturarPlantilla(htmlPlantillaTabla(grupoId, jornada), nombre || 'GOATS_Tabla', 720);
    } catch (e) {
      avisarError(e);
    }
  }

  async function exportarStats(grupoId, jornadaNum, nombre) {
    GL.notificar('Preparando imagen…', 'info', 'loader-circle');
    try {
      await capturarPlantilla(htmlPlantillaStats(grupoId, jornadaNum), nombre || 'GOATS_Stats', 640);
    } catch (e) {
      avisarError(e);
    }
  }

  async function exportarPerfil(jugadorId, nombre) {
    GL.notificar('Preparando imagen…', 'info', 'loader-circle');
    try {
      await capturarPlantilla(htmlPlantillaPerfil(jugadorId), nombre || 'GOATS_Perfil', 560);
    } catch (e) {
      avisarError(e);
    }
  }

  async function exportarPartidosHoy(grupoId, nombre) {
    try {
      const plantilla = await htmlPlantillaPartidos(grupoId);
      GL.notificar('Preparando imagen…', 'info', 'loader-circle');
      await capturarPlantilla(plantilla, nombre || 'GOATS_Partidos', 720);
    } catch (e) {
      avisarError(e);
    }
  }

  /* Captura genérica de un elemento visible del DOM (stats visuales, brackets, etc.) */
  async function exportar(elementId, nombre) {
    const el = document.getElementById(elementId);
    if (!el) { GL.notificar('No se encontró el contenido a exportar.', 'error'); return; }
    GL.notificar('Preparando imagen…', 'info', 'loader-circle');
    const overflowPrev = el.style.overflow;
    const maxHPrev     = el.style.maxHeight;
    try {
      await cargarHtml2Canvas();
      await esperarFuentes();
      el.style.overflow  = 'visible';
      el.style.maxHeight = 'none';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await capturar(el, 2);
      await mostrarVistaPreviaYDescargar(canvas, nombre || 'GOATS_export');
    } catch (e) {
      avisarError(e);
    } finally {
      el.style.overflow  = overflowPrev;
      el.style.maxHeight = maxHPrev;
    }
  }

  Modulos['exportar-png'] = {
    titulo: 'Exportar PNG',
    exportar, exportarTabla, exportarStats, exportarPerfil, exportarPartidosHoy,
    exportarInformeEstadisticas,
    _htmlInforme: htmlPlantillaInformeEstadisticas,
    _nombreSeguro: nombreSeguro,
    _paisPlano: paisPlano
  };
  GL.exportarPNG         = exportar;
  GL.exportarTabla       = exportarTabla;
  GL.exportarStats       = exportarStats;
  GL.exportarInformeEstadisticas = exportarInformeEstadisticas;
  GL.exportarPerfil      = exportarPerfil;
  GL.exportarPartidosHoy = exportarPartidosHoy;
})();