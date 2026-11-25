/* =====================================================================
   GOATS LEAGUE MANAGER — Núcleo compartido (helpers, estado, UI base)
   Se carga antes que cualquier módulo. Sin frameworks.
   ===================================================================== */
function esc(t) {
  return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function icono(nombre, tam, clases) {
  const t = tam || 18;
  return '<i data-lucide="' + esc(nombre) + '" class="' + esc(clases || '') +
    '" style="width:' + t + 'px;height:' + t + 'px;flex:none"></i>';
}

function iniciarIconos() {
  try { if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); } catch (e) { console.warn('Lucide:', e); }
}

const GL = {
  ctx: { torneo: null, grupos: [], jugadores: [], miembros: [], jornadas: [], clasificacion: [], sanciones: [] },
  paises: [],
  _paisesCargados: false,
  _ctxPromise: null,
  _ctxTime: 0,
  _scripts: {},
  _notificaciones: 0,

  /* ---------- Carga diferida de módulos ---------- */
  cargarScript(ruta) {
    if (!GL._scripts[ruta]) {
      GL._scripts[ruta] = new Promise((res, rej) => {
        const viejo = document.querySelector('script[data-modulo="' + ruta + '"]');
        if (viejo && viejo.dataset.estado === 'listo') return res();
        const s = document.createElement('script');
        s.src = ruta; s.dataset.modulo = ruta; s.dataset.estado = 'cargando';
        s.onload = () => { s.dataset.estado = 'listo'; res(); };
        s.onerror = () => { s.dataset.estado = 'error'; delete GL._scripts[ruta]; rej(new Error('No se pudo cargar ' + ruta)); };
        document.head.appendChild(s);
      });
    }
    return GL._scripts[ruta];
  },

  modulo(id) {
    const ruta = 'js/modulos/' + id + '.js?v=' + encodeURIComponent(CONFIG.VERSION);
    return GL.cargarScript(ruta).then(() => (window.Modulos || {})[id]);
  },

  /* ---------- Países dinámicos (tabla `paises`) ---------- */
  async cargarPaises(force) {
    if (GL._paisesCargados && !force) return GL.paises;
    if (typeof sb !== 'undefined' && sb) {
      const { data, error } = await sb.from('paises').select('codigo,nombre').eq('activo', true).order('nombre');
      if (!error && data && data.length) {
        GL.paises = data.map(p => ({ codigo: String(p.codigo).toUpperCase(), nombre: p.nombre }));
      } else if (error) {
        console.warn('Países:', error.message);
      }
    }
    if (!GL.paises.length) {
      GL.paises = Object.entries(PAISES).map(([codigo, v]) => ({ codigo, nombre: v.nombre }));
    }
    GL.paises.forEach(p => {
      if (!PAISES[p.codigo]) PAISES[p.codigo] = { nombre: p.nombre, horario: ZONAS_HORARIAS.medio };
      else PAISES[p.codigo].nombre = p.nombre;
    });
    GL._paisesCargados = true;
    return GL.paises;
  },

  nombrePais(codigo) {
    const c = String(codigo || '').toUpperCase();
    const dynamic = GL.paises.find(p => p.codigo === c);
    return (dynamic && dynamic.nombre) || (PAISES[c] && PAISES[c].nombre) || String(codigo || '—');
  },

  horarioPais(codigo) {
    const c = String(codigo || '').toUpperCase();
    return (PAISES[c] && PAISES[c].horario) || ZONAS_HORARIAS.medio;
  },

  opcionesPais(valor, incluirVacio) {
    const actual = String(valor || '').toUpperCase();
    const lista = GL.paises.length ? GL.paises : Object.entries(PAISES).map(([codigo, v]) => ({ codigo, nombre: v.nombre }));
    return (incluirVacio ? '<option value="">Seleccioná un país</option>' : '') +
      lista.map(p => '<option value="' + esc(p.codigo) + '"' + (p.codigo === actual ? ' selected' : '') + '>' +
        esc(p.nombre) + '</option>').join('');
  },

  banderaUrl(codigo) {
    const c = String(codigo || '').toLowerCase();
    return /^[a-z]{2}$/.test(c) ? 'https://flagcdn.com/w40/' + c + '.png' : '';
  },

  banderaHTML(codigo, tam, titulo) {
    const url = GL.banderaUrl(codigo);
    if (!url) return '';
    const t = Number(tam) || 18;
    return '<img src="' + esc(url) + '" alt="' + esc(titulo || GL.nombrePais(codigo)) + '" title="' +
      esc(titulo || GL.nombrePais(codigo)) + '" class="bandera" style="width:' + t + 'px;height:auto" loading="lazy">';
  },

  avatarHTML(jugador, clase, tam) {
    const j = jugador || {};
    const nombre = j.nombre_usuario || j.nombre || '?';
    const t = Number(tam) || 0;
    const size = t ? 'width:' + t + 'px;height:' + t + 'px;' : '';
    if (j.avatar_url) {
      return '<span class="' + esc(clase || 'avatar') + ' avatar-con-foto" style="' + size +
        'background-image:url(' + esc(j.avatar_url) + ')"></span>';
    }
    return '<span class="' + esc(clase || 'avatar') + '" style="' + size + '">' + esc(GL.iniciales(nombre)) + '</span>';
  },

  // ── Servicio común de teléfonos ──────────────────────────────────────
  // Punto de entrada único para normalizar, validar y formatear teléfonos.
  // Todos los módulos (perfil, admin, mensajes, tabla) lo usan.
  tel: {
    // Devuelve el prefijo E.164 del país, o '' si el país no está en PAISES.
    prefijo(codigoPais) {
      const p = PAISES[String(codigoPais || '').toUpperCase()];
      return p ? p.prefijo : '';
    },

    // Normaliza un número escrito por el usuario al formato E.164 (solo dígitos, sin +).
    // Usa el país del jugador como referencia para agregar el prefijo cuando falta.
    // Devuelve '' si no puede producir un número válido.
    normalizar(telefono, codigoPais) {
      const raw   = String(telefono || '').replace(/\D/g, '');
      if (!raw) return '';
      const pais  = PAISES[String(codigoPais || '').toUpperCase()];
      const pref  = pais ? pais.prefijo : '';
      const digs  = pais ? pais.digitos : 0;

      // Ya trae prefijo completo (empieza con el prefijo del país)
      if (pref && raw.startsWith(pref) && raw.length === pref.length + digs) return raw;

      // Trae un 0 adelante (formato local con cero)
      if (pref && digs && raw.startsWith('0') && raw.length === digs + 1) return pref + raw.slice(1);

      // Número local sin prefijo, longitud correcta según el país
      if (pref && digs && raw.length === digs) return pref + raw;

      // Número que ya tiene algún prefijo pero no es el del país
      // (ej: alguien puso +1 siendo de Nicaragua) — lo dejamos como está
      if (raw.length >= 10 && raw.length <= 15) return raw;

      return ''; // demasiado corto o imposible de interpretar
    },

    // Valida que el número ingresado sea coherente con el país seleccionado.
    // Devuelve { ok: true } o { ok: false, mensaje: '...' }
    validar(telefono, codigoPais) {
      if (!telefono) return { ok: true }; // teléfono es opcional
      const normalizado = GL.tel.normalizar(telefono, codigoPais);
      if (!normalizado) return { ok: false, mensaje: 'El número no parece válido para ese país.' };
      const pais = PAISES[String(codigoPais || '').toUpperCase()];
      if (pais) {
        const local = normalizado.startsWith(pais.prefijo)
          ? normalizado.slice(pais.prefijo.length)
          : normalizado;
        if (local.length !== pais.digitos) {
          return {
            ok: false,
            mensaje: 'Para ' + pais.nombre + ' el número debe tener ' + pais.digitos + ' dígitos locales.'
          };
        }
      }
      return { ok: true };
    },

    // Formatea para mostrar: agrega el + y un espacio después del prefijo.
    // Ej: "50588112233" → "+505 88112233"
    formatear(e164, codigoPais) {
      const n = String(e164 || '').replace(/\D/g, '');
      if (!n) return '';
      const pais = PAISES[String(codigoPais || '').toUpperCase()];
      if (pais && n.startsWith(pais.prefijo)) {
        return '+' + pais.prefijo + ' ' + n.slice(pais.prefijo.length);
      }
      return '+' + n;
    }
  },

  // Genera el enlace wa.me a partir del objeto jugador (con j.pais para normalizar).
  // Retrocompatible: también acepta (string, nombre) como antes.
  linkWhatsapp(jugador, nombreFallback) {
    let telefono = '', codigoPais = '', nombre = nombreFallback || '';
    if (jugador && typeof jugador === 'object') {
      telefono   = String(jugador.telefono || '');
      codigoPais = String(jugador.pais     || '');
      nombre     = nombreFallback || jugador.nombre_usuario || '';
    } else {
      telefono = String(jugador || '');
    }
    const numero = GL.tel.normalizar(telefono, codigoPais);
    if (!numero) return '';
    const display = GL.tel.formatear(numero, codigoPais) || ('+' + numero);
    return '<a class="wa-link" href="https://wa.me/' + esc(numero) +
      '" target="_blank" rel="noopener noreferrer" ' +
      'title="Escribir a ' + esc(nombre) + ' por WhatsApp">' +
      icono('message-circle', 13) + esc(display) + '</a>';
  },

  /* ---------- Notificaciones ---------- */
  notificar(mensaje, tipo, ico) {
    const estilos = {
      exito:       { background: '#00d4aa', color: '#000' },
      error:       { background: '#ff4757', color: '#fff' },
      advertencia: { background: '#f5c518', color: '#000' },
      info:        { background: '#3b82f6', color: '#fff' }
    };
    const est = estilos[tipo] || estilos.exito;
    const texto = ico ? icono(ico, 16, 'gl-toast-ico' + (ico === 'loader-circle' ? ' girando' : '')) + esc(mensaje) : esc(mensaje);
    const movil = !!(window.matchMedia && window.matchMedia('(max-width:780px)').matches);
    if (typeof Toastify === 'function') {
      Toastify({
        text: texto, duration: 3500, gravity: movil ? 'bottom' : 'top', position: movil ? 'center' : 'right',
        style: Object.assign({}, est, {
          borderRadius: '8px', fontFamily: 'Rajdhani, sans-serif', fontWeight: '600',
          fontSize: '15px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
        })
      }).showToast();
      if (ico) setTimeout(iniciarIconos, 0);
    } else {
      console.log('[' + (tipo || 'exito') + '] ' + mensaje);
    }
  },

  /* ---------- Feedback visual ---------- */
  skeleton(filas, alto) {
    const n = filas || 5, h = alto || 18;
    let out = '<div class="skeleton-lista" aria-label="Cargando">';
    for (let i = 0; i < n; i++) {
      out += '<div class="skeleton-fila" style="animation-delay:' + (i * 0.08) + 's">' +
        '<span class="skeleton" style="width:12%"></span>' +
        '<span class="skeleton" style="width:34%"></span>' +
        '<span class="skeleton" style="width:10%"></span>' +
        '<span class="skeleton" style="width:14%"></span>' +
        '<span class="skeleton" style="width:10%"></span></div>';
    }
    return out + '</div>';
  },

  vacio(mensaje, ico, accion) {
    return '<div class="estado-vacio">' + icono(ico || 'inbox', 34) +
      '<h3>' + esc(mensaje || 'No hay datos para mostrar') + '</h3>' +
      (accion || '') + '</div>';
  },

  error(mensaje, ico) {
    return '<div class="estado-vacio error">' + icono(ico || 'triangle-alert', 34) +
      '<h3>No se pudo cargar la información</h3><p>' + esc(mensaje || 'Revisa tu conexión e inténtalo de nuevo.') + '</p></div>';
  },

  encabezado(titulo, subtitulo, botones) {
    return '<div class="seccion-head"><div class="seccion-titulo">' +
      '<h2>' + esc(titulo) + '</h2>' + (subtitulo ? '<p>' + esc(subtitulo) + '</p>' : '') +
      '</div>' + (botones ? '<div class="seccion-acciones">' + botones + '</div>' : '') + '</div>';
  },

  badge(texto, tono, ico) {
    return '<span class="badge ' + esc(tono || 'neutral') + '">' +
      (ico ? icono(ico, 14) : '') + esc(texto) + '</span>';
  },

  /* ---------- Modales ---------- */
  abrirModal(opciones) {
    const o = opciones || {};
    const root = document.getElementById('modal-root') || document.body;
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = '<div class="modal' + (o.ancho ? ' modal-' + o.ancho : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2>' + esc(o.titulo || '') + '</h2>' +
      '<button type="button" class="btn-icon" data-cerrar aria-label="Cerrar">' + icono('x', 20) + '</button></div>' +
      '<div class="modal-cuerpo">' + (o.cuerpo || '') + '</div>' +
      (o.acciones ? '<div class="modal-acciones">' + o.acciones + '</div>' : '') + '</div>';
    root.appendChild(fondo);
    const cerrar = () => { fondo.classList.add('saliendo'); setTimeout(() => fondo.remove(), 180); };
    fondo.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrar));
    fondo.addEventListener('click', e => { if (e.target === fondo) cerrar(); });
    fondo.cerrar = cerrar;
    if (o.onAbrir) o.onAbrir(fondo, cerrar);
    setTimeout(() => { const f = fondo.querySelector('input,select,textarea,button'); if (f) f.focus(); }, 60);
    return fondo;
  },

  confirmar(mensaje, titulo, aceptarTexto) {
    return new Promise(res => {
      const m = GL.abrirModal({
        titulo: titulo || 'Confirmar acción',
        cuerpo: '<p class="modal-texto">' + esc(mensaje) + '</p>',
        acciones: '<button type="button" class="btn sec" data-no>Cancelar</button>' +
          '<button type="button" class="btn" data-si>' + esc(aceptarTexto || 'Confirmar') + '</button>',
        onAbrir(fondo, cerrar) {
          fondo.querySelector('[data-no]').addEventListener('click', () => { cerrar(); res(false); });
          fondo.querySelector('[data-si]').addEventListener('click', () => { cerrar(); res(true); });
        }
      });
      m.addEventListener('click', e => { if (e.target === m) res(false); });
    });
  },

  copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).catch(() => GL.copiarFallback(texto));
    }
    return Promise.resolve(GL.copiarFallback(texto));
  },

  copiarFallback(texto) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { console.warn(e); }
    ta.remove();
  },

  descargarTexto(nombre, contenido) {
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  exportarPNG(id, nombre) {
    GL.modulo('exportar-png').then(m => m && m.exportar(id, nombre))
      .catch(e => GL.notificar(e.message, 'error'));
  },

  /* ---------- Consultas a Supabase ---------- */
  // Columnas seguras para leer según la tabla.
  // 'jugadores' solo lo lee el admin (por RLS); no necesita filtrar aquí.
  // 'jugadores_publicos' es la vista ya filtrada en la base de datos.
  _columnas: {
    jugadores:         'id,nombre_usuario,pais,avatar_url,activo,suspendido,rol,torneo_id,numero,telefono,email,user_id,super_admin,created_at',
    jugadores_publicos:'id,nombre_usuario,pais,avatar_url,activo,suspendido,rol,torneo_id,numero',
    sanciones:         'id,jugador_id,torneo_id,tipo,puntos_descuento,partidos_suspension,motivo,created_at'
  },

  async consultar(tabla, fn) {
    if (typeof sb === 'undefined' || !sb) return { data: [], error: new Error('Supabase no configurado') };
    const cols = GL._columnas[tabla] || '*';
    let q = sb.from(tabla).select(cols);
    try { if (fn) q = fn(q); } catch (e) { return { data: [], error: e }; }
    return q;
  },

  async cargarContexto(force) {
    const ahora = Date.now();
    if (!force && GL._ctxPromise && ahora - GL._ctxTime < 15000) return GL._ctxPromise;
    GL._ctxTime = ahora;
    GL._ctxPromise = (async () => {
      const t = GL.ctx.torneo;
      const [torneos, grupos, jugadores, miembros, jornadas, clasificacion, sanciones] = await Promise.all([
        GL.consultar('torneos', q => q.eq('estado', 'activo').order('created_at', { ascending: false }).limit(1)),
        GL.consultar('grupos', q => q.order('nombre')),
        GL.esAdmin()
          ? GL.consultar('jugadores', q => q.order('nombre_usuario'))
          : GL.consultar('jugadores_publicos', q => q.order('nombre_usuario')),
        GL.consultar('grupo_jugadores'),
        GL.consultar('jornadas', q => q.order('numero', { ascending: true })),
        GL.consultar('clasificacion', q => q.order('pts', { ascending: false })),
        GL.consultar('sanciones', q => q.order('created_at', { ascending: false }))
      ]);
      const error = torneos.error || grupos.error || jugadores.error || miembros.error || jornadas.error || clasificacion.error || sanciones.error;
      if (error) {
        console.warn('Contexto GL:', error.message);
        if (GL._notificaciones++ === 0) GL.notificar('Supabase respondió con un error. Revisa las políticas RLS y tu conexión.', 'advertencia');
      }
      const torneo = (torneos.data || [])[0] || t || null;
      const tid = torneo && torneo.id;
      const filtrar = arr => !tid ? arr : arr.filter(x => !x.torneo_id || x.torneo_id === tid);
      GL.ctx = {
        torneo,
        grupos: filtrar(grupos.data || []),
        jugadores: filtrar(jugadores.data || []),
        miembros: miembros.data || [],
        jornadas: filtrar(jornadas.data || []),
        clasificacion: filtrar(clasificacion.data || []),
        sanciones: filtrar(sanciones.data || [])
      };
      // Filtrar miembros al torneo activo usando los grupos ya filtrados
      const gruposDelTorneo = new Set(GL.ctx.grupos.map(g => g.id));
      GL.ctx.miembros = (miembros.data || []).filter(m => gruposDelTorneo.has(m.grupo_id));

      // Detectar jugadores en dos grupos del mismo torneo (no debería pasar, pero lo bloqueamos)
      const jugadorEnGrupo = {};
      GL.ctx.miembros = GL.ctx.miembros.filter(m => {
        if (jugadorEnGrupo[m.jugador_id]) {
          console.warn('[GL] Jugador ' + m.jugador_id + ' aparece en más de un grupo del torneo activo. Se ignora la relación duplicada.');
          return false;
        }
        jugadorEnGrupo[m.jugador_id] = m.grupo_id;
        return true;
      });

      GL._miembrosCache = {};
      GL.ctx.miembros.forEach(m => {
        if (!GL._miembrosCache[m.grupo_id]) GL._miembrosCache[m.grupo_id] = [];
        GL._miembrosCache[m.grupo_id].push(m.jugador_id);
      });
      // La tabla jornadas puede no tener las 22 filas creadas todavía: se completan en memoria.
      if (torneo) {
        const total = Number(torneo.total_jornadas) || CONFIG.JORNADAS_FASE_REGULAR;
        const existentes = new Set(GL.ctx.jornadas.filter(j => j.numero <= total).map(j => j.numero + '|' + (j.grupo_id || '')));
        GL.ctx.grupos.forEach(g => {
          for (let n = 1; n <= total; n++) {
            if (!existentes.has(n + '|' + g.id)) {
              GL.ctx.jornadas.push({ numero: n, grupo_id: g.id, torneo_id: torneo.id, estado: 'abierta', fecha: null, virtual: true });
            }
          }
        });
        GL.ctx.jornadas.sort((a, b) => a.numero - b.numero);
      }
      return GL.ctx;
    })().catch(e => { GL._ctxPromise = null; throw e; });
    return GL._ctxPromise;
  },

  invalidar() { GL._ctxPromise = null; GL._ctxTime = 0; },

  /* ---------- Accesores ---------- */
  torneo() { return GL.ctx.torneo; },
  torneoId() { return GL.ctx.torneo ? GL.ctx.torneo.id : null; },
  grupos() { return GL.ctx.grupos.slice(); },
  grupo(id) { return GL.ctx.grupos.find(g => g.id === id) || null; },
  grupoPorNombre(nombre) {
    const n = String(nombre || '').toLowerCase();
    return GL.ctx.grupos.find(g => String(g.nombre || '').toLowerCase().includes(n.replace('grupo', '').trim())) || GL.ctx.grupos[0] || null;
  },
  letraGrupo(grupo) {
    const n = String((grupo && grupo.nombre) || '');
    const m = n.match(/[A-Za-z]$/);
    return m ? m[0].toUpperCase() : (n || '—');
  },
  jugadores(grupoId) {
    let arr = GL.ctx.jugadores.filter(j => j.activo !== false);
    if (grupoId) {
      // Siempre filtrar: si el grupo existe pero está vacío → array vacío
      const ids = new Set(GL._miembrosCache && GL._miembrosCache[grupoId] ? GL._miembrosCache[grupoId] : []);
      arr = arr.filter(j => ids.has(j.id));
    }
    return arr;
  },

  // Jugadores activos sin grupo asignado en el torneo actual
  jugadoresSinGrupo() {
    const conGrupo = new Set(GL.ctx.miembros.map(m => m.jugador_id));
    return GL.ctx.jugadores.filter(j => j.activo !== false && !conGrupo.has(j.id));
  },
  jugador(id) { return GL.ctx.jugadores.find(j => j.id === id) || null; },
  nombreJugador(id) {
    const j = GL.jugador(id);
    return j ? j.nombre_usuario : 'Por definir';
  },
  paisJugador(id) { const j = GL.jugador(id); return j ? j.pais : ''; },

  grupoDeJugador(id) {
    // ctx.miembros ya está filtrado al torneo activo desde cargarContexto
    const m = (GL.ctx.miembros || []).find(x => x.jugador_id === id);
    return m ? GL.grupo(m.grupo_id) : null;
  },

  // Historial de grupos de un jugador en temporadas anteriores
  async historialGruposJugador(jugadorId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from('grupo_jugadores')
      .select('grupo_id, grupos(nombre, torneo_id, torneos(temporada, nombre))')
      .eq('jugador_id', jugadorId);
    if (error) { console.warn('[GL] historialGrupos:', error.message); return []; }
    return (data || []).map(r => ({
      grupo_id:   r.grupo_id,
      grupo:      r.grupos ? r.grupos.nombre : '—',
      torneo_id:  r.grupos ? r.grupos.torneo_id : null,
      temporada:  r.grupos && r.grupos.torneos ? r.grupos.torneos.temporada : '—',
      liga:       r.grupos && r.grupos.torneos ? r.grupos.torneos.nombre : '—'
    }));
  },

  faltas(jugadorId) { return GL.ctx.sanciones.filter(s => s.jugador_id === jugadorId).length; },

  jornadaActual() {
    const js = GL.ctx.jornadas.filter(j => j.numero <= (GL.torneo() ? Number(GL.torneo().total_jornadas) || 22 : 22));
    return js.find(j => j.estado === 'abierta') ||
      js.slice().sort((a, b) => b.numero - a.numero)[0] || { numero: 1, estado: 'abierta' };
  },

  jornadaAbiertaNumero() {
    const j = GL.ctx.jornadas.find(x => x.estado === 'abierta' && x.numero <= CONFIG.JORNADAS_FASE_REGULAR);
    return j ? j.numero : null;
  },

  esAdmin() {
    return !!(typeof Auth !== 'undefined' && Auth && Auth.usuario && Auth.jugador && Auth.jugador.rol === 'admin');
  },

  esSuperAdmin() {
    return GL.esAdmin() && Auth.jugador.super_admin === true;
  },

  async asegurarAdmin(vista) {
    if (typeof Auth !== 'undefined' && Auth.usuario) {
      try { await Auth.cargarPerfil(true); } catch (e) { console.warn(e); }
    }
    if (GL.esAdmin()) return true;
    if (vista) vista.innerHTML = GL.accesoDenegado('admin');
    return false;
  },

  async asegurarSuperAdmin(vista) {
    if (typeof Auth !== 'undefined' && Auth.usuario) {
      try { await Auth.cargarPerfil(true); } catch (e) { console.warn(e); }
    }
    if (GL.esSuperAdmin()) return true;
    if (vista) vista.innerHTML = GL.accesoDenegado('admin');
    return false;
  },

  accesoDenegado(requerido) {
    return '<div class="acceso-denegado">' + icono('lock-keyhole', 48) +
      '<h2>Acceso restringido</h2><p>' +
      (requerido === 'admin'
        ? 'Esta sección es exclusiva del administrador de la liga.'
        : 'Inicia sesión con tu cuenta de jugador para acceder a esta sección.') +
      '</p><button type="button" class="btn" data-login>' + icono('log-in', 18) + 'Iniciar sesión</button></div>';
  },

  async partidos(filtros) {
    if (typeof sb === 'undefined' || !sb) return [];
    let q = sb.from('partidos').select('*');
    Object.entries(filtros || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q = q.eq(k, v);
    });
    const { data, error } = await q.order('jornada', { ascending: true }).order('id', { ascending: true });
    if (error) { console.warn('partidos:', error.message); return []; }
    return data || [];
  },

  clasificacion(grupoId) {
    return GL.ctx.clasificacion
      .filter(c => !grupoId || c.grupo_id === grupoId)
      .sort((a, b) => (Number(b.pts) || 0) - (Number(a.pts) || 0) ||
        (Number(b.dif) || 0) - (Number(a.dif) || 0) ||
        (Number(b.gf) || 0) - (Number(a.gf) || 0));
  },

  posicion(jugadorId, grupoId) {
    const tabla = GL.clasificacion(grupoId);
    const i = tabla.findIndex(c => c.jugador_id === jugadorId);
    return i < 0 ? null : i + 1;
  },

  /* Resultado canónico de un partido (los walkover valen 3-0, las expulsiones 1-0). */
  resultado(p) {
    let gf = Number(p.goles_local) || 0, gc = Number(p.goles_visitante) || 0;
    if (p.estado === 'walkover_local') { gf = 3; gc = 0; }
    if (p.estado === 'walkover_visitante') { gf = 0; gc = 3; }
    if (p.estado === 'doble_ausencia') { gf = 0; gc = 0; }
    if (p.estado === 'expulsion_local') { gf = 1; gc = 0; }
    if (p.estado === 'expulsion_visitante') { gf = 0; gc = 1; }
    const pendiente = p.estado === 'pendiente';
    return {
      gf, gc, pendiente,
      texto: pendiente ? '—' : gf + ' - ' + gc,
      estado: ESTADOS_PARTIDO[p.estado] || ESTADOS_PARTIDO.pendiente
    };
  },

  puntosPorPartido(p, jugadorId) {
    const r = GL.resultado(p);
    if (r.pendiente || !p.local_id || !p.visitante_id) return 0;
    if (p.local_id !== jugadorId && p.visitante_id !== jugadorId) return 0;
    const esLocal = p.local_id === jugadorId;
    const aFavor = esLocal ? r.gf : r.gc;
    const enContra = esLocal ? r.gc : r.gf;
    return aFavor > enContra ? 3 : aFavor === enContra ? 1 : 0;
  },

  esExpulsado(j) { return !!(j && (j.activo === false || j.suspendido === true || j.rol === 'expulsado')); },

  /* Los partidos resueltos por expulsión se guardan como 1-0 y no suman valla invicta. */
  esResolucionExpulsion(p) { return /^expulsion_/.test(String((p && p.estado) || '')); },

  /* Devuelve true si el partido fue resuelto de forma administrativa,
     es decir, que el marcador no refleja goles reales marcados en FC Mobile. */
  esAdministrativo(p) {
    const e = String((p && p.estado) || '');
    return e === 'walkover_local' || e === 'walkover_visitante' ||
           e === 'doble_ausencia' || /^expulsion_/.test(e);
  },

  /* Goles efectivamente marcados dentro del juego en FC Mobile.
     Para partidos administrativos devuelve {gf:0, gc:0} porque
     nunca se jugaron — el marcador es una resolución reglamentaria.
     Usar para estadísticas de goleadores y rendimiento deportivo.
     Usar GL.resultado() para clasificación y puntos. */
  golesReales(p) {
    if (!p || GL.esAdministrativo(p) || p.estado === 'pendiente') {
      return { gf: 0, gc: 0 };
    }
    return {
      gf: Number(p.goles_local)    || 0,
      gc: Number(p.goles_visitante) || 0
    };
  },

  /* ---------- Formato ---------- */
  fecha(v) {
    if (!v) return 'Por definir';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
  fechaLarga(v) {
    if (!v) return 'Por definir';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
  signo(n) { const v = Number(n) || 0; return v > 0 ? '+' + v : String(v); },
  iniciales(nombre) {
    return String(nombre || '?').trim().split(/[\s_-]+/).slice(0, 2)
      .map(p => p.charAt(0).toUpperCase()).join('') || '?';
  },
  seguroTexto(s) { return String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim(); }
};

/* Acciones de sesión enlazadas desde app.js (evita acoplamiento circular). */
window.GL = GL;
