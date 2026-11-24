/* =====================================================================
   MÓDULO 9 — Exportación a PNG (html2canvas)
   ===================================================================== */
(function () {
  async function cargarHtml2Canvas() {
    if (typeof html2canvas === 'function') return true;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
      s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar html2canvas'));
      document.head.appendChild(s);
    });
    return typeof html2canvas === 'function';
  }

  async function exportar(elementId, nombreArchivo) {
    const el = document.getElementById(elementId);
    if (!el) { GL.notificar('No se encontró el contenido a exportar.', 'error'); return; }
    try {
      await cargarHtml2Canvas();
      GL.notificar('Generando imagen…', 'info');
      const canvas = await html2canvas(el, {
        backgroundColor: '#0a0e1a', scale: 2, useCORS: true, logging: false,
        windowWidth: el.scrollWidth, windowHeight: el.scrollHeight
      });
      const link = document.createElement('a');
      link.download = (nombreArchivo || 'GOATS_export') + '.png';
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link); link.click(); link.remove();
      GL.notificar('Imagen lista para compartir.', 'exito');
    } catch (e) {
      console.error(e);
      GL.notificar('No se pudo exportar: ' + e.message, 'error');
    }
  }

  Modulos['exportar-png'] = { titulo: 'Exportar PNG', exportar };
  GL.exportarPNG = exportar;
})();
