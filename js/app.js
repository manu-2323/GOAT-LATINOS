/* =====================================================================
   GOATS LEAGUE MANAGER — Enrutador, arranque y servicios globales
   ===================================================================== */
let _tokenVista = 0;
let _rutaActual = 'tabla';
let _moduloActual = null;
let _firmaAuth = null;

/* FASE 3.12 (ampliación): la entrada de la app es el panel principal cuando
   hay sesión; la Tabla sigue siendo la puerta pública para invitados. */
function rutaPorDefecto() {
  return (typeof Auth !== 'undefined' && Auth && Auth.usuario) ? 'inicio' : 'tabla';
}

function rutaActual() {
  const id = location.hash.replace('#', '').split('/')[0];
  return itemNav(id) ? id : rutaPorDefecto();
}

/* Firma mínima de la sesión. Un refresh de token NO cambia esta firma: la
   vista no debe destruirse mientras la persona está escribiendo. */
function firmaSesion() {
  const id = Auth.usuario ? Auth.usuario.id : null;
  const rol = Auth.jugador ? Auth.jugador.rol : null;
  return id + '|' + (rol || '');
}

/* Menú, chip de sesión y temporada también son parte de la navegación. */
function sincronizarChrome() {
  try {
    if (typeof dibujarMenu === 'function') dibujarMenu();
    if (typeof pintarSesion === 'function') pintarSesion();
    if (typeof pintarTemporada === 'function') pintarTemporada();
  } catch (e) { console.warn('[app] chrome', e); }
}

/* Reintento de la VISTA, no de toda la página. Los módulos ya usan este
   patrón localmente; ahora es una política central del router. */
async function reintentarVista() {
  GL.invalidar();
  try { await Promise.all([GL.cargarPaises(true), GL.cargarContexto(true)]); } catch (e) { console.warn(e); }
  await mostrar(_rutaActual);
}

function conectarReintento() {
  document.addEventListener('click', async e => {
    const boton = e.target && e.target.closest ? e.target.closest('[data-reintentar-vista]') : null;
    if (!boton) return;
    e.preventDefault();
    boton.disabled = true;
    try { await reintentarVista(); }
    finally { if (boton.isConnected) boton.disabled = false; }
  });
}

/* Acceso obligatorio: ninguna vista se renderiza sin una sesión válida. */
function exigirLogin(destino) {
  const ruta = destino || rutaActual();
  PantallaAuth.obligatorio = true;
  const vista = document.getElementById('vista');
  if (vista) vista.innerHTML = '';
  if (PantallaAuth.overlay) return;
  PantallaAuth.mostrar(async () => {
    try { await Promise.all([GL.cargarPaises(true), GL.cargarContexto(true)]); } catch (e) { console.warn(e); }
    dibujarMenu(); pintarSesion(); pintarTemporada();
    // Si no había una ruta explícita en la URL, entrar al panel principal.
    await mostrar(destino || (location.hash ? rutaActual() : rutaPorDefecto()));
  });
}

async function mostrar(id) {
  if (PantallaAuth.obligatorio && !Auth.usuario) {
    exigirLogin(id);
    return;
  }
  const item = itemNav(id) || itemNav(rutaPorDefecto()) || itemNav('tabla');
  const archivo = item.modulo || item.id;
  const nivel = item.nivel || 'publico';
  const vista = document.getElementById('vista');
  if (!vista) return;

  /* Contrato de ciclo de vida: un módulo libera charts, canales Realtime y
     listeners globales antes de que otro ocupe el mismo contenedor. */
  if (_moduloActual && _moduloActual !== archivo) {
    const anterior = window.Modulos && window.Modulos[_moduloActual];
    if (anterior && typeof anterior.destruir === 'function') {
      try { await anterior.destruir(); } catch (e) { console.warn('[app] cleanup', e); }
    }
  }
  _moduloActual = archivo;

  const token = ++_tokenVista;
  _rutaActual = item.id;
  sincronizarChrome();

  document.getElementById('titulo-pagina').textContent = item.nombre;
  document.querySelectorAll('.nav-link,.nav-movil a').forEach(a => {
    const activo = a.dataset.id === item.id;
    a.classList.toggle('activo', activo);
    if (activo) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const masBtn = document.getElementById('btn-mas-nav');
  if (masBtn) {
    const activoEnMas = (masBtn.dataset.masIds || '').split(',').includes(item.id);
    masBtn.classList.toggle('activo', activoEnMas);
    if (activoEnMas) masBtn.setAttribute('aria-current', 'page');
    else masBtn.removeAttribute('aria-current');
  }
  if (window.innerWidth <= 1050) {
    document.getElementById('app').classList.remove('menu-abierto');
    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) btnMenu.setAttribute('aria-expanded', 'false');
  }

  if (nivel !== 'publico' && !Auth.usuario) {
    vista.innerHTML = GL.accesoDenegado(nivel);
    enlazarLogin(vista);
    iniciarIconos();
    return;
  }
  vista.innerHTML = GL.skeleton(6);
  iniciarIconos();
  try {
    await GL.cargarContexto(true);
    if (token !== _tokenVista) return;
    if (nivel === 'admin' && !(await GL.asegurarAdmin(vista))) {
      enlazarLogin(vista); iniciarIconos(); return;
    }
    const mod = await GL.modulo(archivo);
    if (token !== _tokenVista) return;
    if (!mod || typeof mod.render !== 'function') throw new Error('Módulo "' + archivo + '" no disponible.');
    if (item.tab && typeof mod.setTab === 'function') mod.setTab(item.tab);
    await mod.render(vista);
    // 1.2.0: las tablas con desplazamiento deben ser alcanzables por teclado.
    vista.querySelectorAll('.tabla-scroll, .tabla-wrap, .tabla-wrap-scroll').forEach(t => {
      if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '0');
    });
    if (token === _tokenVista) iniciarIconos();
  } catch (e) {
    console.error(e);
    if (token === _tokenVista) {
      vista.innerHTML = GL.error(GL.mensaje(e, 'cargar', item.nombre), null, item.nombre);
      enlazarLogin(vista);
      iniciarIconos();
    }
  }
}

function enlazarLogin(root) {
  root.querySelectorAll('[data-login]').forEach(b => b.addEventListener('click', () => {
    PantallaAuth.mostrar(() => { dibujarMenu(); pintarSesion(); mostrar(_rutaActual); });
  }));
}

function conectarOffline() {
  const banner = document.getElementById('offline-banner');
  const pintar = () => {
    if (!banner) return;
    banner.classList.toggle('oculto', navigator.onLine !== false);
    iniciarIconos();
  };
  window.addEventListener('online', () => { pintar(); GL.notificar('Conexión restablecida', 'exito'); GL.invalidar(); mostrar(_rutaActual); });
  window.addEventListener('offline', () => { pintar(); GL.notificar('Sin conexión. Revisa tu red.', 'advertencia'); });
  pintar();
}

function conectarMenu() {
  const app = document.getElementById('app');
  const btn = document.getElementById('btn-menu');
  const fondo = document.getElementById('menu-fondo');
  if (btn) btn.addEventListener('click', () => {
    const abierto = app.classList.toggle('menu-abierto');
    btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  });
  if (fondo) fondo.addEventListener('click', () => {
    app.classList.remove('menu-abierto');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

function conectarAccesibilidad() {
  const salto = document.querySelector('.skip-link');
  const vista = document.getElementById('vista');
  if (salto && vista) salto.addEventListener('click', e => {
    e.preventDefault();
    vista.focus();
  });
}

async function arrancar() {
  PantallaAuth.obligatorio = true;
  conectarOffline();
  conectarMenu();
  conectarAccesibilidad();
  conectarReintento();
  iniciarIconos();
  dibujarMenu();
  pintarSesion();

  /* Se lee ANTES de iniciar para que el aviso ya exista si el evento gl:auth
     pinta el acceso; la URL se limpia recién después de procesar el fragmento. */
  const avisoAuth = Auth.consumirCallback ? Auth.consumirCallback(undefined, false) : null;
  if (avisoAuth && avisoAuth.error) PantallaAuth.aviso = avisoAuth.mensaje;
  try { await Auth.iniciar(); } catch (e) { console.warn(e); }
  _firmaAuth = firmaSesion();
  if (Auth.limpiarCallbackUrl) Auth.limpiarCallbackUrl();
  if (avisoAuth && Auth.usuario) {
    GL.notificar(avisoAuth.mensaje, avisoAuth.error ? 'advertencia' : 'exito',
      avisoAuth.error ? 'triangle-alert' : 'check-circle-2');
  }
  if (!Auth.usuario) {
    exigirLogin(rutaActual());
    return;
  }
  try { await Promise.all([GL.cargarPaises(true), GL.cargarContexto(true)]); } catch (e) { console.warn(e); }
  dibujarMenu(); pintarSesion(); pintarTemporada();
  await mostrar(rutaActual());
  if (Auth.usuario && GL.esAdmin() && window.OnboardingAdmin) {
    setTimeout(() => OnboardingAdmin.iniciar(false), 700);
  }
}

window.addEventListener('hashchange', () => mostrar(rutaActual()));
window.addEventListener('gl:auth', async e => {
  const firma = firmaSesion();
  const cambioDeSesion = firma !== _firmaAuth;
  const evento = String((e && e.detail && e.detail.evento) || '');
  _firmaAuth = firma;
  sincronizarChrome();
  // Sin sesión no se consulta el contexto; un SIGNED_OUT del refresco no
  // debe disparar lecturas prematuras.
  try { if (Auth.usuario) await GL.cargarContexto(true); } catch (err) { console.warn(err); }
  if (PantallaAuth.obligatorio && !Auth.usuario) {
    exigirLogin(_rutaActual);
    return;
  }
  if (Auth.usuario && PantallaAuth.overlay) PantallaAuth.ocultar(false);
  if (Auth.usuario && !location.hash) {
    _rutaActual = rutaPorDefecto();
    location.hash = _rutaActual;
  }

  /* Un TOKEN_REFRESHED con la misma identidad actualiza el contexto y el
     chrome, pero NO reemplaza el DOM: conserva foco, filtros y formularios. */
  if (cambioDeSesion || evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'PROFILE_UPDATED') {
    await mostrar(_rutaActual);
  } else {
    GL.invalidar();
  }

  if (cambioDeSesion && Auth.usuario && !GL.esAdmin() && window.OnboardingTour) {
    setTimeout(() => OnboardingTour.iniciar(false), 600);
  }
  if (cambioDeSesion && Auth.usuario && GL.esAdmin() && window.OnboardingAdmin) {
    setTimeout(() => OnboardingAdmin.iniciar(false), 700);
  }
});
window.addEventListener('load', arrancar);

/* Depuración rápida desde la consola. */
window.GLManager = {
  ir: id => { location.hash = id; },
  recalcular: () => recalcularTodosLosGrupos(),
  contexto: () => GL.ctx,
  version: CONFIG.VERSION
};
