/* =====================================================================
   GOATS LEAGUE MANAGER — Registro de módulos y navegación
   ===================================================================== */
const Modulos = {};
/* Los módulos se cargan de forma diferida y se leen desde window en el enrutador. */
window.Modulos = Modulos;

const SECCIONES = [
  { titulo: 'Competencia', items: [
    { id: 'tabla',        nombre: 'Tabla',          icono: 'layout-list',  nivel: 'publico' },
    { id: 'fixture',      nombre: 'Fixture',        icono: 'calendar',     nivel: 'publico' },
    { id: 'estadisticas', nombre: 'Estadísticas',   icono: 'bar-chart-2',  nivel: 'publico', modulo: 'stats-jornada' },
    { id: 'estadisticas-globales', nombre: 'Estadísticas globales', icono: 'chart-no-axes-column-increasing', nivel: 'publico', modulo: 'stats-globales' }
  ]},
  { titulo: 'Mi liga', items: [
    { id: 'perfil',       nombre: 'Mi Perfil',      icono: 'user',         nivel: 'jugador' }
  ]},
  { titulo: 'Dirección del torneo', items: [
    { id: 'resultados',   nombre: 'Resultados',     icono: 'clipboard-check', nivel: 'admin' },
    { id: 'jornadas',     nombre: 'Jornadas',       icono: 'flag',         nivel: 'admin', modulo: 'admin', tab: 'jornadas' },
    { id: 'administracion', nombre: 'Administración', icono: 'shield',     nivel: 'admin', modulo: 'admin', tab: 'jugadores' },
    { id: 'eliminatorias', nombre: 'Eliminatorias', icono: 'git-merge',    nivel: 'publico' },
    { id: 'mensajes',     nombre: 'Mensajes',       icono: 'message-square', nivel: 'admin' }
  ]}
];

const NAV_MOVIL = [
  { id: 'tabla', corto: 'Tabla' },
  { id: 'fixture', corto: 'Fixture' },
  { id: 'estadisticas', corto: 'Stats' },
  { id: 'estadisticas-globales', corto: 'Global' },
  { id: 'perfil', corto: 'Perfil' },
  { id: 'administracion', corto: 'Admin' }
];

function itemNav(id) {
  for (const s of SECCIONES) {
    const found = s.items.find(i => i.id === id);
    if (found) return found;
  }
  return null;
}

function nivelPermitido(nivel) {
  if (nivel === 'admin') return GL.esAdmin();
  if (nivel === 'jugador') return !!Auth.usuario;
  return true;
}

function dibujarMenu() {
  const nav = document.getElementById('navegacion');
  if (!nav) return;
  const actual = (location.hash || '#tabla').replace('#', '');
  nav.innerHTML = SECCIONES.map(sec => {
    const items = sec.items.filter(i => nivelPermitido(i.nivel));
    if (!items.length) return '';
    return '<div class="nav-group">' + esc(sec.titulo) + '</div>' + items.map(i =>
      '<a class="nav-link' + (i.id === actual ? ' activo' : '') + '" href="#' + i.id + '" data-id="' + i.id + '">' +
      icono(i.icono, 18) + esc(i.nombre) + '</a>'
    ).join('');
  }).join('');
  iniciarIconos();
  dibujarNavMovil();
}

function dibujarNavMovil() {
  const nav = document.getElementById('nav-movil');
  if (!nav) return;
  const actual = (location.hash || '#tabla').replace('#', '');
  nav.innerHTML = NAV_MOVIL.map(item => {
    const i = itemNav(item.id);
    if (!i || !nivelPermitido(i.nivel)) return '';
    return '<a href="#' + item.id + '" data-id="' + item.id + '" class="' + (item.id === actual ? 'activo' : '') + '">' +
      icono(i.icono, 20) + '<span>' + esc(item.corto) + '</span></a>';
  }).join('');
  iniciarIconos();
}

function pintarSesion() {
  const caja = document.getElementById('usuario-caja');
  const chip = document.getElementById('estado-sesion');
  if (!caja || !chip) return;
  if (Auth.usuario) {
    const nombre = (Auth.jugador && Auth.jugador.nombre_usuario) ||
      (Auth.usuario.user_metadata && Auth.usuario.user_metadata.nombre_usuario) ||
      Auth.usuario.email;
    caja.innerHTML = '<div class="usuario-mini">' + GL.avatarHTML(Auth.jugador, 'avatar') +
      '<div><strong>' + esc(nombre) + '</strong><small>' + esc(Auth.jugador ? (GL.esAdmin() ? 'Administrador' : 'Jugador') : 'Pendiente de aprobación') + '</small></div></div>' +
      '<button type="button" class="btn sec" id="btn-salir">' + icono('log-out', 16) + 'Cerrar sesión</button>';
    chip.className = 'sesion-chip';
    chip.innerHTML = '<span class="punto"></span><span class="txt">' + esc(nombre) + '</span>' +
      (GL.esAdmin() ? icono('shield', 14) : '');
    const b = caja.querySelector('#btn-salir');
    if (b) b.addEventListener('click', async () => {
      await Auth.salir();
      GL.notificar('Sesión cerrada', 'info');
      location.hash = 'tabla';
      dibujarMenu(); pintarSesion();
      window.dispatchEvent(new CustomEvent('gl:auth', { detail: { evento: 'SIGNED_OUT' } }));
    });
  } else {
    caja.innerHTML = '<button type="button" class="btn" id="btn-login-side">' + icono('log-in', 16) + 'Iniciar sesión</button>';
    chip.className = 'sesion-chip anonimo';
    chip.innerHTML = '<span class="punto"></span><span class="txt">Invitado</span>' +
      '<button type="button" class="btn sm" id="btn-login-top" style="padding:4px 10px">Ingresar</button>';
    [caja.querySelector('#btn-login-side'), chip.querySelector('#btn-login-top')].forEach(b => {
      if (b) b.addEventListener('click', () => PantallaAuth.mostrar(() => {
        dibujarMenu(); pintarSesion(); mostrar(rutaActual());
      }));
    });
  }
  iniciarIconos();
}

function pintarTemporada() {
  const el = document.getElementById('temporada-texto');
  if (!el) return;
  const t = GL.torneo();
  el.textContent = t ? ((t.nombre || CONFIG.NOMBRE_LIGA) + ' · ' + (t.temporada || 'Temporada actual')) : CONFIG.NOMBRE_LIGA;
  const sub = document.getElementById('subtitulo-pagina');
  if (sub) sub.textContent = t ? (CONFIG.NOMBRE_LIGA + ' · ' + (t.temporada || 'Temporada activa')) : CONFIG.NOMBRE_LIGA;
}
