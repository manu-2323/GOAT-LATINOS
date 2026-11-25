/* =====================================================================
   GOATS LEAGUE MANAGER — Procesamiento de imágenes (1.2.0)
   Canvas puro, sin dependencias: recorte 1:1 centrado, compresión gradual
   y validación real del contenido por cabecera (magic bytes).
   ===================================================================== */
(function () {
  const CABECERAS = [
    { nombre: 'jpeg', bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
    { nombre: 'png',  bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },
    { nombre: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }
  ];

  function firmasCoinciden(bytes) {
    return CABECERAS.find(c => c.bytes.every((b, i) => bytes[i] === b));
  }

  async function validarContenido(archivo) {
    const slice = archivo.slice(0, 12);
    const buffer = await slice.arrayBuffer();
    const firma = firmasCoinciden(new Uint8Array(buffer));
    return {
      ok: !!firma,
      mime: firma ? firma.mime : '',
      mensaje: firma ? '' : 'El archivo no parece una imagen válida. Usa JPG, PNG o WebP.'
    };
  }

  function cargarImagen(archivo) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No pudimos leer la imagen. Prueba con otra.')); };
      img.src = url;
    });
  }

  function dibujarCuadrado(img, lado) {
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#080D18';
    ctx.fillRect(0, 0, lado, lado);
    const ladoOriginal = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - ladoOriginal) / 2;
    const sy = ((img.naturalHeight || img.height) - ladoOriginal) / 2;
    ctx.drawImage(img, sx, sy, ladoOriginal, ladoOriginal, 0, 0, lado, lado);
    return canvas;
  }

  async function procesar(archivo, opciones) {
    const o = opciones || {};
    const maxBytes = o.maxBytes || 2 * 1024 * 1024;
    const lado = o.lado || 512;
    const contenido = await validarContenido(archivo);
    if (!contenido.ok) throw new Error(contenido.mensaje);
    const img = await cargarImagen(archivo);
    const canvas = dibujarCuadrado(img, lado);
    let calidad = 0.9;
    let blob = null;
    for (let i = 0; i < 6; i++) {
      blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', calidad));
      if (blob && blob.size <= maxBytes) break;
      calidad -= 0.13;
    }
    if (!blob || blob.size > maxBytes) {
      throw new Error('La imagen sigue siendo demasiado pesada. Prueba con una foto más pequeña.');
    }
    return {
      blob,
      nombre: String(archivo.name || 'avatar').replace(/\.[^.]+$/, '') + '.jpg',
      mime: 'image/jpeg',
      tamano: blob.size,
      vistaPrevia: URL.createObjectURL(blob),
      recorte: '1:1 centrado'
    };
  }

  GL.imagen = { validarContenido, procesar };
  window.GLImagen = GL.imagen;
})();
