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
    GL.notificar('No se pudo exportar: ' + (e && e.message ? e.message : 'intentalo de nuevo.'), 'error');
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
  async function capturarPlantilla(html, nombre, anchoFijo) {
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
      const canvas = await capturar(contenedor, 2, prepararClon);
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

  Modulos['exportar-png'] = { titulo: 'Exportar PNG', exportar, exportarTabla, exportarStats, exportarPerfil };
  GL.exportarPNG    = exportar;
  GL.exportarTabla  = exportarTabla;
  GL.exportarStats  = exportarStats;
  GL.exportarPerfil = exportarPerfil;
})();