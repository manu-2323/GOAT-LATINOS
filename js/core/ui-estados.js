/* =====================================================================
   GOATS LEAGUE MANAGER — Estados de interfaz y mensajes legibles (1.2.0)
   Capa añadida sobre GL. No elimina ni reemplaza la lógica existente:
   envuelve notificar() y ofrece helpers para los cuatro estados de módulo.
   ===================================================================== */
(function () {
  if (typeof GL === 'undefined') return;

  const CARGANDO = {
    guardar: 'Guardando cambios…',
    crear: 'Creando registro…',
    eliminar: 'Eliminando registro…',
    cargar: 'Cargando información…',
    generar: 'Generando datos…',
    calendario: 'Generando calendario…',
    png: 'Generando PNG…',
    imagen: 'Preparando imagen…',
    analizar: 'Leyendo la captura…',
    exportar: 'Preparando archivo…',
    subir: 'Subiendo archivo…',
    recalcular: 'Actualizando la tabla…',
    verificar: 'Comprobando datos…'
  };

  const FALLOS = {
    guardar: 'No pudimos guardar los cambios. Comprueba tu conexión e inténtalo nuevamente.',
    crear: 'No pudimos crear el registro. Revisa los datos e inténtalo nuevamente.',
    eliminar: 'No pudimos eliminar el registro. Inténtalo nuevamente.',
    cargar: 'No pudimos cargar la información. Comprueba tu conexión e inténtalo nuevamente.',
    generar: 'No pudimos generar los datos. Inténtalo nuevamente en unos segundos.',
    calendario: 'No pudimos generar el calendario. Inténtalo nuevamente.',
    png: 'No pudimos generar la imagen. Inténtalo nuevamente.',
    imagen: 'No pudimos preparar la imagen. Inténtalo nuevamente.',
    analizar: 'No pudimos leer la captura. Puedes introducir el resultado manualmente.',
    exportar: 'No pudimos preparar el archivo. Inténtalo nuevamente.',
    subir: 'No pudimos subir el archivo. Comprueba su tamaño e inténtalo nuevamente.',
    recalcular: 'No pudimos actualizar la tabla. Inténtalo nuevamente.',
    verificar: 'No pudimos comprobar los datos. Inténtalo nuevamente.'
  };

  /* Texto legible: unifica el tono y quita restos técnicos visibles. */
  function textoAmigable(mensaje) {
    let texto = String(mensaje == null ? '' : mensaje).trim();
    if (!texto) return '';
    const m = texto.toLowerCase();
    const tecnico = /failed to fetch|networkerror|unhandledpromiserejection|undefined is not|null is not|typeerror|referenceerror|supabase|jwt|fetch failed|timed out|status code|duplicate key value|violates|permission denied|42703|42p01|42883|42704|does not exist|undefined column|undefined table/i.test(m);
    if (tecnico && GL.traducirError) texto = GL.traducirError(texto);
    return texto
      .replace(/Comprobá/gi, 'Comprueba')
      .replace(/Usá/gi, 'usa')
      .replace(/Ingresá/gi, 'Introduce')
      .replace(/Elegí/gi, 'Elige')
      .replace(/Generá/gi, 'Genera')
      .replace(/Cerrá/gi, 'Cierra')
      .replace(/Volvé/gi, 'Vuelve')
      .replace(/Tocá/gi, 'Pulsa')
      .replace(/tenés/gi, 'tienes')
      .replace(/puedés/gi, 'puedes')
      .replace(/necesitás/gi, 'necesitas')
      .replace(/intentá/gi, 'intenta')
      .replace(/podés/gi, 'puedes')
      .replace(/estás/gi, 'estás');
  }

  /* Devuelve el texto del error para el usuario; el técnico queda en consola. */
  function mensaje(error, accion, contexto) {
    const tecnico = error && error.message ? error.message : String(error || '');
    if (tecnico && tecnico !== 'undefined') {
      console.debug('[GL.mensaje] detalle técnico:', tecnico, contexto || '');
    }
    if (!tecnico || tecnico === 'undefined') return FALLOS[accion] || FALLOS.cargar;
    /* Si el backend ya envió un mensaje humano, respetarlo. */
    if (tecnico.length < 100 && !/[:{]/.test(tecnico) && /[áéíóúñ¿¡]/i.test(tecnico) && !/error|failed|fetch|supabase|jwt|token|storage|bucket|column|row|no se pudo/i.test(tecnico)) {
      return textoAmigable(tecnico);
    }
    const traducido = GL.traducirError ? GL.traducirError(tecnico, contexto) : '';
    if (traducido && !/^No pudimos cargar/.test(traducido)) return textoAmigable(traducido);
    return FALLOS[accion] || FALLOS.cargar;
  }

  function mensajeCarga(accion) {
    return CARGANDO[accion] || CARGANDO.cargar;
  }

  /* Envuelve la acción de un botón con estado cargando y error amigable. */
  function conAccion(boton, accionOTexto, fn) {
    const texto = CARGANDO[accionOTexto] ? mensajeCarga(accionOTexto) : (accionOTexto || mensajeCarga('guardar'));
    const accion = CARGANDO[accionOTexto] ? accionOTexto : 'guardar';
    if (!boton) return Promise.resolve();
    const originalHTML = boton.innerHTML;
    const eraDeshabilitado = boton.disabled;
    boton.classList.add('cargando');
    boton.setAttribute('aria-busy', 'true');
    boton.disabled = true;
    boton.innerHTML = '<span class="gl-boton-spinner" aria-hidden="true"></span>' + texto;
    return Promise.resolve()
      .then(() => fn())
      .catch(e => {
        console.error('[GL.conAccion]', e);
        GL.notificar(mensaje(e, accion), 'error');
      })
      .finally(() => {
        boton.classList.remove('cargando');
        boton.removeAttribute('aria-busy');
        boton.disabled = eraDeshabilitado;
        boton.innerHTML = originalHTML;
      });
  }

  /* Cuatro estados: cargando | listo | vacio | error. */
  function estado(contenedor, modo, opciones) {
    if (!contenedor) return;
    const o = opciones || {};
    const ico = typeof icono === 'function' ? icono : function (n) { return ''; };
    const titulo = o.titulo || '';
    const texto = o.texto || '';
    const acciones = (o.acciones || []).map((a, i) =>
      '<button type="button" class="btn ' + (a.tipo || 'sec') + '" data-estado-accion="' + i + '">' +
        esc(a.etiqueta || 'Reintentar') + '</button>'
    ).join('');
    const comun = '<div class="panel-estado gl-anim-entrada" role="' +
      (modo === 'error' ? 'alert' : 'status') + '" aria-live="polite">' +
      '<div class="gl-estado-icono">' +
      ico(o.icono || 'inbox', 24) + '</div><div class="estado-titulo">' + esc(titulo) + '</div>' +
      (texto ? '<p class="estado-texto">' + esc(texto) + '</p>' : '');
    let html = '';
    if (modo === 'cargando') {
      html = comun.replace('panel-estado gl-anim-entrada', 'panel-estado is-cargando gl-anim-entrada') +
        '<div class="estado-barra" role="progressbar" aria-label="' + esc(titulo || 'Cargando') + '"><i></i></div></div>';
    } else if (modo === 'vacio') {
      html = comun.replace('panel-estado gl-anim-entrada', 'panel-estado is-vacio gl-anim-entrada') +
        (acciones ? '<div class="estado-accion">' + acciones + '</div>' : '') + '</div>';
    } else if (modo === 'error') {
      html = comun.replace('panel-estado gl-anim-entrada', 'panel-estado is-error gl-anim-entrada') +
        (acciones ? '<div class="estado-accion">' + acciones + '</div>' : '') + '</div>';
    } else {
      html = '<div class="panel-estado gl-anim-entrada" role="status" aria-live="polite">' +
        (o.contenido || '') + '</div>';
    }
    contenedor.setAttribute('aria-busy', modo === 'cargando' ? 'true' : 'false');
    contenedor.innerHTML = html;
    contenedor.querySelectorAll('[data-estado-accion]').forEach(b => {
      b.addEventListener('click', () => {
        const a = (o.acciones || [])[Number(b.dataset.estadoAccion)];
        if (a && typeof a.accion === 'function') a.accion();
      });
    });
    try { if (typeof iniciarIconos === 'function') iniciarIconos(); } catch (e) { /* opcional */ }
  }

  /* Envolver notificar para que nunca muestre texto técnico al usuario. */
  const notificarOriginal = GL.notificar.bind(GL);
  GL.notificar = function (mensaje, tipo, ico) {
    return notificarOriginal(textoAmigable(mensaje), tipo, ico);
  };

  Object.assign(GL, {
    textoAmigable,
    mensaje,
    mensajeCarga,
    conAccion,
    estado,
    estados: { CARGANDO: 'cargando', LISTO: 'listo', VACIO: 'vacio', ERROR: 'error' }
  });
  window.GLEstados = { textoAmigable, mensaje, mensajeCarga, conAccion, estado };
})();
