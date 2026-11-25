/* =====================================================================
   MÓDULO 9 — Exportación a PNG
   Genera una plantilla visual independiente (nunca captura el DOM visible).
   Espera fuentes, evita overflow, controla tamaño máximo del canvas.
   ===================================================================== */
(function () {

  /* ── Cargar html2canvas bajo demanda ── */
  async function cargarHtml2Canvas() {
    if (typeof html2canvas === 'function') return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('No se pudo cargar html2canvas. Verificá tu conexión.'));
      document.head.appendChild(s);
    });
  }

  /* ── Esperar a que las fuentes estén listas ── */
  async function esperarFuentes() {
    try {
      if (document.fonts && typeof document.fonts.ready === 'object') {
        await document.fonts.ready;
      }
    } catch (e) { /* fallback silencioso */ }
  }

  /* ── Capturar un nodo ya preparado ── */
  async function capturar(nodo, escala) {
    const esc = Math.min(escala || 2, 3);
    const canvas = await html2canvas(nodo, {
      backgroundColor : '#0a0e1a',
      scale           : esc,
      useCORS         : true,
      allowTaint      : false,
      logging         : false,
      width           : nodo.offsetWidth,
      height          : nodo.offsetHeight,
      windowWidth     : nodo.offsetWidth,
      windowHeight    : nodo.offsetHeight,
      x               : 0,
      y               : 0,
      scrollX         : 0,
      scrollY         : 0,
      foreignObjectRendering: false
    });
    // Límite de seguridad: canvas > 16 384 px en algún eje puede fallar en móvil
    const MAX_PX = 16000;
    if (canvas.width > MAX_PX || canvas.height > MAX_PX) {
      const factor = Math.min(MAX_PX / canvas.width, MAX_PX / canvas.height);
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
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  /* ── Montar plantilla, capturar y desmontar ── */
  async function capturarPlantilla(html, nombre, anchoFijo) {
    await cargarHtml2Canvas();
    await esperarFuentes();

    const contenedor = document.createElement('div');
    contenedor.className = 'exp-contenedor';
    if (anchoFijo) contenedor.style.width = anchoFijo + 'px';
    contenedor.innerHTML = html;

    // Fuera de pantalla pero renderizable (no display:none)
    contenedor.style.cssText +=
      ';position:fixed;left:-9999px;top:0;z-index:-1;visibility:hidden';
    document.body.appendChild(contenedor);

    // Esperar un frame para que el layout se calcule
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      const canvas = await capturar(contenedor, 2);
      descargar(canvas, nombre);
      GL.notificar('Imagen exportada correctamente.', 'exito', 'image');
    } finally {
      contenedor.remove();
    }
  }

  /* ================================================================
     PLANTILLA: TABLA DE POSICIONES
     ================================================================ */
  function htmlPlantillaTabla(grupoId, jornada) {
    const clasificacion = GL.clasificacion(grupoId);
    const jugadoresGrupo = new Set(
      (GL.ctx.miembros || []).filter(m => m.grupo_id === grupoId).map(m => m.jugador_id)
    );
    const datos = clasificacion.filter(f => jugadoresGrupo.has(f.jugador_id));
    const grupo = GL.grupo(grupoId);
    const torneo = GL.torneo();
    const letraGrupo = GL.letraGrupo(grupo);
    const fechaHoy = new Date().toLocaleDateString('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    const filas = datos.map((f, i) => {
      const pos = i + 1;
      const j = GL.jugador(f.jugador_id) || {};
      const clasePos = pos <= 6 ? 'exp-clasifica' : pos <= 10 ? 'exp-medio' : 'exp-descenso';
      const separador = pos === 11
        ? '<tr class="exp-sep-row"><td colspan="10"><div class="exp-sep-label">Zona de descenso</div></td></tr>'
        : '';
      const urlBandera = GL.banderaUrl(j.pais);
      const banderaImg = urlBandera
        ? '<img src="' + urlBandera + '" alt="' + esc(j.pais || '') + '" class="exp-bandera" crossorigin="anonymous">'
        : '<span class="exp-bandera-txt">' + esc(j.pais || '—') + '</span>';
      const dif = Number(f.dif) || 0;
      const difStr = dif > 0 ? '+' + dif : String(dif);
      const difCls = dif > 0 ? 'exp-verde' : dif < 0 ? 'exp-rojo' : '';
      return separador +
        '<tr>' +
          '<td><span class="exp-pos ' + clasePos + '">' + pos + '</span></td>' +
          '<td class="exp-nombre">' + esc(j.nombre_usuario || '—') + '</td>' +
          '<td class="exp-pais">' + banderaImg + '</td>' +
          '<td class="exp-num">' + (f.pj || 0) + '</td>' +
          '<td class="exp-num exp-verde">' + (f.pg || 0) + '</td>' +
          '<td class="exp-num">' + (f.pe || 0) + '</td>' +
          '<td class="exp-num exp-rojo">' + (f.pp || 0) + '</td>' +
          '<td class="exp-num">' + (f.gf || 0) + ':' + (f.gc || 0) + '</td>' +
          '<td class="exp-num ' + difCls + '">' + difStr + '</td>' +
          '<td class="exp-num exp-pts">' + (f.pts || 0) + '</td>' +
        '</tr>';
    }).join('');

    return `
<style>
  .exp-contenedor{font-family:'Rajdhani',sans-serif;background:#0a0e1a;color:#fff;width:640px;padding:0;border-radius:0}
  .exp-header{background:linear-gradient(135deg,#f5c518 0%,#ff8c00 100%);padding:20px 24px 16px;display:flex;align-items:center;justify-content:space-between}
  .exp-header-logo{font-size:28px;font-weight:700;color:#000;letter-spacing:1px;line-height:1}
  .exp-header-sub{font-size:12px;color:rgba(0,0,0,.65);font-weight:600;margin-top:3px;letter-spacing:.5px}
  .exp-header-grupo{font-size:36px;font-weight:700;color:#000;opacity:.18;letter-spacing:2px}
  .exp-info{background:#111827;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1f2937}
  .exp-info-jornada{font-size:13px;font-weight:700;color:#f5c518;letter-spacing:.5px}
  .exp-info-fecha{font-size:11px;color:#9ca3af}
  .exp-leyenda{display:flex;gap:12px;padding:8px 24px;background:#0d1424;border-bottom:1px solid #1f2937}
  .exp-leyenda-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#9ca3af}
  .exp-leyenda-punto{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  table.exp-tabla{width:100%;border-collapse:collapse;table-layout:fixed}
  table.exp-tabla thead{background:#1a2235}
  table.exp-tabla thead th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;padding:9px 8px;text-align:center;border-bottom:2px solid #f5c518}
  table.exp-tabla thead th:nth-child(2){text-align:left;padding-left:12px;width:30%}
  table.exp-tabla tbody tr{border-bottom:1px solid #1a2235;transition:background .15s}
  table.exp-tabla tbody tr:nth-child(even){background:#0d1424}
  table.exp-tabla tbody tr.exp-sep-row{background:transparent!important;border:none}
  .exp-sep-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#ff4757;text-align:right;padding:5px 12px 3px;border-top:1px solid #ff4757;margin-top:2px;opacity:.8}
  table.exp-tabla tbody td{padding:8px;text-align:center;vertical-align:middle;font-size:14px;font-weight:600}
  table.exp-tabla tbody td:nth-child(2){text-align:left;padding-left:12px;font-size:13px}
  .exp-pos{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font-size:12px;font-weight:700;flex-shrink:0}
  .exp-clasifica{background:#00d4aa;color:#000}
  .exp-medio{background:#ff8c00;color:#000}
  .exp-descenso{background:#ff4757;color:#fff}
  .exp-num{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px}
  .exp-verde{color:#00d4aa}
  .exp-rojo{color:#ff4757}
  .exp-pts{color:#f5c518;font-size:16px}
  .exp-pais{text-align:center}
  .exp-bandera{width:20px;height:auto;border-radius:2px;vertical-align:middle}
  .exp-bandera-txt{font-size:11px;color:#9ca3af}
  .exp-nombre{max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .exp-footer{padding:10px 24px;background:#080c15;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #1f2937}
  .exp-footer-liga{font-size:11px;color:#4b5563;font-weight:600;letter-spacing:.5px}
  .exp-footer-nota{font-size:10px;color:#374151}
</style>
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
  <div class="exp-leyenda-item"><div class="exp-leyenda-punto" style="background:#00d4aa"></div>Clasifican (top 6)</div>
  <div class="exp-leyenda-item"><div class="exp-leyenda-punto" style="background:#ff8c00"></div>Zona media</div>
  <div class="exp-leyenda-item"><div class="exp-leyenda-punto" style="background:#ff4757"></div>Descenso (11-12)</div>
</div>
<table class="exp-tabla">
  <thead><tr>
    <th>#</th><th>Jugador</th><th>País</th><th>J</th><th>G</th><th>E</th><th>P</th><th>+/-</th><th>Dif</th><th>Pts</th>
  </tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="exp-footer">
  <span class="exp-footer-liga">GOATS LATINOS LEAGUE MANAGER</span>
  <span class="exp-footer-nota">Clasifican 6 jugadores por grupo</span>
</div>`;
  }

  /* ================================================================
     API PÚBLICA
     ================================================================ */

  /**
   * Exportar tabla de posiciones de un grupo.
   * @param {string} grupoId - UUID del grupo
   * @param {string} nombre  - nombre del archivo de descarga
   */
  async function exportarTabla(grupoId, nombre) {
    const jornada = GL.jornadaActual();
    GL.notificar('Preparando imagen…', 'info', 'loader-circle');
    try {
      await capturarPlantilla(htmlPlantillaTabla(grupoId, jornada), nombre || 'GOATS_Tabla', 640);
    } catch (e) {
      console.error(e);
      GL.notificar('No se pudo exportar: ' + e.message, 'error');
    }
  }

  /**
   * Exportar cualquier elemento visible del DOM (stats, bracket, etc.)
   * con las correcciones de overflow y fuentes aplicadas.
   * @param {string} elementId - id del elemento a capturar
   * @param {string} nombre    - nombre del archivo
   */
  async function exportar(elementId, nombre) {
    const el = document.getElementById(elementId);
    if (!el) { GL.notificar('No se encontró el contenido a exportar.', 'error'); return; }
    GL.notificar('Preparando imagen…', 'info', 'loader-circle');
    try {
      await cargarHtml2Canvas();
      await esperarFuentes();
      // Forzar que el elemento no tenga overflow durante la captura
      const overflowPrev = el.style.overflow;
      const maxHPrev     = el.style.maxHeight;
      el.style.overflow  = 'visible';
      el.style.maxHeight = 'none';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await capturar(el, 2);
      el.style.overflow  = overflowPrev;
      el.style.maxHeight = maxHPrev;
      descargar(canvas, nombre || 'GOATS_export');
      GL.notificar('Imagen exportada correctamente.', 'exito', 'image');
    } catch (e) {
      console.error(e);
      GL.notificar('No se pudo exportar: ' + e.message, 'error');
    }
  }

  Modulos['exportar-png'] = { titulo: 'Exportar PNG', exportar, exportarTabla };
  GL.exportarPNG    = exportar;
  GL.exportarTabla  = exportarTabla;
})();