/* =====================================================================
   GOATS LEAGUE MANAGER — Registro de módulos y navegación
   ===================================================================== */
const Modulos = {};
/* Los módulos se cargan de forma diferida y se leen desde window en el enrutador. */
window.Modulos = Modulos;

const SECCIONES = [
  { titulo: 'Competencia', items: [
    { id: 'tabla',        nombre: 'Tabla',          icono: 'layout-list',  nivel: 'publico' },
    { id: 'calendario',   nombre: 'Calendario',     icono: 'calendar-days', nivel: 'publico' },
    { id: 'fixture',      nombre: 'Fixture',        icono: 'calendar',     nivel: 'publico' },
    { id: 'estadisticas', nombre: 'Estadísticas',   icono: 'bar-chart-2',  nivel: 'publico', modulo: 'stats-jornada' },
    { id: 'estadisticas-globales', nombre: 'Estadísticas globales', icono: 'chart-no-axes-column-increasing', nivel: 'publico', modulo: 'stats-globales' }
  ]},
  { titulo: 'Mi liga', items: [
    { id: 'perfil',          nombre: 'Mi Perfil',       icono: 'user',   nivel: 'jugador' },
    { id: 'notificaciones',  nombre: 'Notificaciones',  icono: 'bell',   nivel: 'jugador' }
  ]},
  { titulo: 'Dirección del torneo', items: [
    { id: 'dashboard-admin', nombre: 'Centro de control', icono: 'layout-dashboard', nivel: 'admin', modulo: 'dashboard-admin' },
    { id: 'resultados',   nombre: 'Resultados',     icono: 'clipboard-check', nivel: 'admin' },
    { id: 'jornadas',     nombre: 'Jornadas',       icono: 'flag',         nivel: 'admin', modulo: 'admin', tab: 'jornadas' },
    { id: 'administracion', nombre: 'Administración', icono: 'shield',     nivel: 'admin', modulo: 'admin', tab: 'jugadores' },
    { id: 'eliminatorias', nombre: 'Eliminatorias', icono: 'git-merge',    nivel: 'publico' },
    { id: 'mensajes',     nombre: 'Mensajes',       icono: 'message-square', nivel: 'admin' },
    { id: 'auditoria',    nombre: 'Auditoría',      icono: 'shield-check',   nivel: 'admin', modulo: 'auditoria' }
  ]}
];

// Los 4 accesos fijos siempre visibles en la barra móvil
const NAV_MOVIL_FIJOS = [
  { id: 'tabla',        corto: 'Tabla',     icono: 'layout-list'  },
  { id: 'calendario',   corto: 'Calendario', icono: 'calendar-days' },
  { id: 'estadisticas', corto: 'Stats',     icono: 'bar-chart-2'  },
  { id: 'eliminatorias',corto: 'Copa',      icono: 'git-merge'    }
];

// Ítems del panel "Más" — se filtran por nivel de acceso en tiempo real
const NAV_MOVIL_MAS = [
  { id: 'perfil',               corto: 'Mi perfil',          icono: 'user',                    nivel: 'jugador' },
  { id: 'notificaciones',       corto: 'Notificaciones',     icono: 'bell',                    nivel: 'jugador' },
  { id: 'estadisticas-globales',corto: 'Stats globales',     icono: 'chart-no-axes-column-increasing', nivel: 'publico' },
  { id: 'fixture',               corto: 'Fixture',           icono: 'calendar',               nivel: 'publico' },
  { id: 'eliminatorias',        corto: 'Eliminatorias',      icono: 'git-merge',               nivel: 'publico' },
  { id: 'dashboard-admin',      corto: 'Control',            icono: 'layout-dashboard',        nivel: 'admin'   },
  { id: 'mensajes',             corto: 'Mensajes',           icono: 'message-square',          nivel: 'admin'   },
  { id: 'resultados',           corto: 'Resultados',         icono: 'clipboard-check',         nivel: 'admin'   },
  { id: 'administracion',       corto: 'Administración',     icono: 'shield',                  nivel: 'admin'   },
  { id: 'auditoria',            corto: 'Auditoría',          icono: 'shield-check',            nivel: 'admin'   }
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
    return '<div class="nav-group">' + esc(sec.titulo) + '</div>' + items.map(i => {
      const activo = i.id === actual;
      return '<a class="nav-link' + (activo ? ' activo' : '') + '" href="#' + i.id + '" data-id="' + i.id + '"' +
        (activo ? ' aria-current="page"' : '') + '>' + icono(i.icono, 18) + esc(i.nombre) + '</a>';
    }).join('');
  }).join('');
  iniciarIconos();
  dibujarNavMovil();
}

function dibujarNavMovil() {
  const nav = document.getElementById('nav-movil');
  if (!nav) return;
  const actual = (location.hash || '#tabla').replace('#', '');

  // Detectar si el ítem activo está dentro del panel "Más"
  const activoEnMas = NAV_MOVIL_MAS.some(x => x.id === actual);

  const fijosHTML = NAV_MOVIL_FIJOS.map(item => {
    // Si el ítem fijo es el activo, marcarlo; si es "eliminatorias" es público siempre
    const activo = item.id === actual;
    return '<a href="#' + item.id + '" data-id="' + item.id + '" class="nav-movil-link' +
      (activo ? ' activo' : '') + '"' + (activo ? ' aria-current="page"' : '') + '>' +
      icono(item.icono, 20) + '<span class="nav-label">' + esc(item.corto) + '</span>' +
    '</a>';
  }).join('');

  const masHTML =
    '<button type="button" id="btn-mas-nav" class="nav-movil-link' + (activoEnMas ? ' activo' : '') +
      '" aria-label="Más opciones" data-mas-ids="' + NAV_MOVIL_MAS.map(x => x.id).join(',') + '"' +
      (activoEnMas ? ' aria-current="page"' : '') + '>' +
      icono('grid-2x2', 20) +
      '<span class="nav-label">Más</span>' +
    '</button>';

  nav.innerHTML = fijosHTML + masHTML;

  // Botón "Más": abre panel lateral / bottom sheet
  nav.querySelector('#btn-mas-nav').addEventListener('click', abrirPanelMas);

  iniciarIconos();
}

function abrirPanelMas() {
  // Cerrar si ya está abierto
  document.getElementById('panel-mas-fondo') && cerrarPanelMas();

  const actual = (location.hash || '#tabla').replace('#', '');
  const esAdmin = GL.esAdmin();

  const itemsVisibles = NAV_MOVIL_MAS.filter(x => nivelPermitido(x.nivel));

  // Separar sección admin de sección jugador/público
  const deportivos = itemsVisibles.filter(x => x.nivel !== 'admin');
  const admin      = itemsVisibles.filter(x => x.nivel === 'admin');

  const renderItem = x =>
    '<a href="#' + x.id + '" class="panel-mas-item' + (x.id === actual ? ' activo' : '') + '" data-cerrar-mas>' +
      '<span class="panel-mas-ico">' + icono(x.icono, 18) + '</span>' +
      '<span class="panel-mas-label">' + esc(x.corto) + '</span>' +
      (x.id === actual ? '<span class="panel-mas-activo-dot"></span>' : '') +
    '</a>';

  const secAdmin = admin.length
    ? '<div class="panel-mas-separador">' + icono('shield', 14) + 'Administración</div>' +
      admin.map(renderItem).join('')
    : '';

  const fondo = document.createElement('div');
  fondo.id = 'panel-mas-fondo';
  fondo.className = 'panel-mas-fondo';

  const sheet = document.createElement('div');
  sheet.id = 'panel-mas';
  sheet.className = 'panel-mas';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Más opciones');
  sheet.innerHTML =
    '<div class="panel-mas-handle"></div>' +
    '<div class="panel-mas-titulo">' + icono('grid-2x2', 16) + 'Más opciones</div>' +
    '<div class="panel-mas-cuerpo">' +
      deportivos.map(renderItem).join('') +
      secAdmin +
    '</div>';

  document.body.appendChild(fondo);
  document.body.appendChild(sheet);
  iniciarIconos();

  // Cierre al tocar el fondo
  fondo.addEventListener('click', cerrarPanelMas);

  // Cierre al seleccionar un ítem
  sheet.querySelectorAll('[data-cerrar-mas]').forEach(a =>
    a.addEventListener('click', () => {
      cerrarPanelMas();
      // Redibujar nav para marcar activo
      setTimeout(dibujarNavMovil, 60);
    })
  );

  // Cierre con Escape
  const onKey = e => { if (e.key === 'Escape') cerrarPanelMas(); };
  document.addEventListener('keydown', onKey, { once: true });
  fondo._onKey = onKey;

  // Foco accesible
  sheet.querySelector('a, button') && sheet.querySelector('a, button').focus();
}

function cerrarPanelMas() {
  const f = document.getElementById('panel-mas-fondo');
  const s = document.getElementById('panel-mas');
  if (f) { if (f._onKey) document.removeEventListener('keydown', f._onKey); f.remove(); }
  if (s) s.remove();
}

function pintarCampana() {
  const btn = document.getElementById('btn-notif');
  if (!btn) return;
  if (Auth.usuario && !GL.esAdmin()) {
    btn.style.display = '';
    btn.onclick = () => {
      GL.modulo('notificaciones').then(m => m && m.abrirPanel()).catch(console.warn);
    };
    // Cargar conteo inicial
    GL.modulo('notificaciones').then(m => {
      if (m) { m._cargar().then(() => m._actualizarBadge()); }
    }).catch(() => {});
  } else {
    btn.style.display = 'none';
  }
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
      '<button type="button" class="btn sm" id="btn-login-top">Ingresar</button>';
    [caja.querySelector('#btn-login-side'), chip.querySelector('#btn-login-top')].forEach(b => {
      if (b) b.addEventListener('click', () => PantallaAuth.mostrar(() => {
        dibujarMenu(); pintarSesion(); mostrar(rutaActual());
      }));
    });
  }
  iniciarIconos();
  pintarCampana();
}

function pintarTemporada() {
  const el = document.getElementById('temporada-texto');
  if (!el) return;
  const t = GL.torneo();
  el.textContent = t ? ((t.nombre || CONFIG.NOMBRE_LIGA) + ' · ' + (t.temporada || 'Temporada actual')) : CONFIG.NOMBRE_LIGA;
  const sub = document.getElementById('subtitulo-pagina');
  if (sub) sub.textContent = t ? (CONFIG.NOMBRE_LIGA + ' · ' + (t.temporada || 'Temporada activa')) : CONFIG.NOMBRE_LIGA;
}
