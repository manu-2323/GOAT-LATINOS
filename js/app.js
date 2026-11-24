/* =====================================================================
   GOATS LEAGUE MANAGER — Enrutador, arranque y servicios globales
   ===================================================================== */
let _tokenVista = 0;
let _rutaActual = 'tabla';

function rutaActual() {
  const id = location.hash.replace('#', '').split('/')[0];
  return itemNav(id) ? id : 'tabla';
}

async function mostrar(id) {
  const item = itemNav(id) || itemNav('tabla');
  const archivo = item.modulo || item.id;
  const nivel = item.nivel || 'publico';
  const vista = document.getElementById('vista');
  if (!vista) return;
  const token = ++_tokenVista;
  _rutaActual = item.id;

  document.getElementById('titulo-pagina').textContent = item.nombre;
  document.querySelectorAll('.nav-link,.nav-movil a').forEach(a => a.classList.toggle('activo', a.dataset.id === item.id));
  if (window.innerWidth <= 1050) document.getElementById('app').classList.remove('menu-abierto');

  if (nivel !== 'publico' && !Auth.usuario) {
    vista.innerHTML = GL.accesoDenegado(nivel);
    enlazarLogin(vista);
    iniciarIconos();
    return;
  }
  vista.innerHTML = GL.skeleton(6);
  iniciarIconos();
  try {
    await GL.cargarContexto();
    if (token !== _tokenVista) return;
    if (nivel === 'admin' && !(await GL.asegurarAdmin(vista))) {
      enlazarLogin(vista); iniciarIconos(); return;
    }
    const mod = await GL.modulo(archivo);
    if (token !== _tokenVista) return;
    if (!mod || typeof mod.render !== 'function') throw new Error('Módulo "' + archivo + '" no disponible.');
    if (item.tab && typeof mod.setTab === 'function') mod.setTab(item.tab);
    await mod.render(vista);
    if (token === _tokenVista) iniciarIconos();
  } catch (e) {
    console.error(e);
    if (token === _tokenVista) {
      vista.innerHTML = GL.error(e.message);
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
    btn.setAttribute('aria-expanded', 'false');
  });
}

async function arrancar() {
  conectarOffline();
  conectarMenu();
  iniciarIconos();
  dibujarMenu();
  pintarSesion();

  try { await Auth.iniciar(); } catch (e) { console.warn(e); }
  try { await Promise.all([GL.cargarPaises(true), GL.cargarContexto(true)]); } catch (e) { console.warn(e); }
  dibujarMenu(); pintarSesion(); pintarTemporada();
  await mostrar(rutaActual());
}

window.addEventListener('hashchange', () => mostrar(rutaActual()));
window.addEventListener('gl:auth', async () => {
  dibujarMenu(); pintarSesion();
  try { await GL.cargarContexto(true); } catch (e) { console.warn(e); }
  pintarTemporada();
  mostrar(_rutaActual);
});
window.addEventListener('load', arrancar);

/* Depuración rápida desde la consola. */
window.GLManager = {
  ir: id => { location.hash = id; },
  recalcular: () => recalcularTodosLosGrupos(),
  contexto: () => GL.ctx,
  version: CONFIG.VERSION
};
