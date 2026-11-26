/* =====================================================================
   GOATS LEAGUE MANAGER — Núcleo compartido (helpers, estado, UI base)
   Se carga antes que cualquier módulo. Sin frameworks.
   ===================================================================== */
function esc(t) {
  return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function icono(nombre, tam, clases) {
  const escala = [14, 16, 18, 20, 24, 32];
  const n = Number(tam) || 18;
  const t = escala.reduce((mejor, v) => {
    const d = Math.abs(v - n), dm = Math.abs(mejor - n);
    return d < dm || (d === dm && v > mejor) ? v : mejor;
  }, escala[0]);
  return '<i data-lucide="' + esc(nombre) + '" class="' + esc(clases || '') +
    '" style="width:' + t + 'px;height:' + t + 'px;flex:none"></i>';
}

function iniciarIconos() {
  try { if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); } catch (e) { console.warn('Lucide:', e); }
}

/* FASE 3.3 — Accesibilidad compartida de modales: Escape, Tab contenido,
   cierre idempotente y devolución del foco al control que lo abrió. */
function activarModalAccesible(fondo, cerrar) {
  const anterior = document.activeElement;
  let cerrado = false;
  const enfocables = () => [...fondo.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )].filter(el => el.getClientRects().length > 0);
  const onKey = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = enfocables();
    if (!items.length) { e.preventDefault(); return; }
    const primero = items[0];
    const ultimo = items[items.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  return function finalizar() {
    if (cerrado) return;
    cerrado = true;
    document.removeEventListener('keydown', onKey);
    if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) {
      setTimeout(() => anterior.focus(), 0);
    }
  };
}

const GL = {
  ctx: { torneo: null, grupos: [], jugadores: [], miembros: [], jornadas: [], clasificacion: [], sanciones: [] },
  paises: [],
  _paisesCargados: false,
  _ctxPromise: null,
  _ctxTime: 0,
  _scripts: {},
  _notificaciones: 0,

  /* FASE 3.3 — Colores de gráficos leídos de los tokens canónicos.
     No define una paleta nueva: si CSS no está disponible, se usan los
     mismos valores de css/tokens-3.1.css como respaldo. */
  tema: (() => {
    const leer = (nombre, respaldo) => {
      try {
        const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
        if (valor) return valor;
      } catch (e) { /* entorno sin CSS */ }
      return respaldo;
    };
    return {
      fuente: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      bg: leer('--gl-bg', '#0B0D10'),
      superficie: leer('--gl-surface-1', '#14171B'),
      superficie2: leer('--gl-surface-2', '#20252B'),
      borde: leer('--gl-border', '#2E353D'),
      bordeFuerte: leer('--gl-border-strong', '#3B434D'),
      texto: leer('--gl-text', '#F5F6F7'),
      texto2: leer('--gl-text-secondary', '#9299A3'),
      texto3: leer('--gl-text-tertiary', '#7A828E'),
      marca: leer('--gl-brand', '#E11D35'),
      marcaTexto: leer('--gl-brand-text', '#FF6B7A'),
      exito: leer('--gl-success', '#00D4AA'),
      advertencia: leer('--gl-warning', '#F5B301'),
      info: leer('--gl-info', '#5B9BFF'),
      alfa: function (color, valor) {
        const c = String(color || '').trim();
        if (c.charAt(0) === '#') {
          const h = c.slice(1);
          const hex = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
          const n = parseInt(hex, 16);
          if (!isNaN(n)) {
            return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + valor + ')';
          }
        }
        if (c.indexOf('rgb(') === 0) return c.replace('rgb(', 'rgba(').replace(')', ',' + valor + ')');
        return c;
      }
    };
  })(),

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

  /* ---------- Exportación a PNG: stubs disponibles desde el primer clic ----------
     Los módulos se cargan bajo demanda. Estos delegados cargan exportar-png.js
     y llaman a la implementación real; el módulo puede sobrescribirlos sin
     recursion porque la delegación siempre invoca al método del módulo. */
  _delegarExport(nombre, args) {
    /* 1.2.0: mensaje de carga legible desde el primer clic. */
    GL.notificar(GL.mensajeCarga ? GL.mensajeCarga('png') : 'Generando PNG…', 'info', 'loader-circle');
    return GL.modulo('exportar-png').then(modulo => {
      const clave = nombre === 'exportarPNG' ? 'exportar' : nombre;
      const fn = modulo && modulo[clave];
      if (typeof fn !== 'function') throw new Error('La exportación a PNG no está disponible.');
      GL[nombre] = fn; // el módulo real ya cargado reemplaza al stub
      return fn.apply(GL, args);
    }).catch(e => {
      GL.notificar(GL.mensaje(e, 'png', 'la exportación'), 'error');
    });
  },

  exportarPNG(id, nombre) { return GL._delegarExport('exportarPNG', [id, nombre]); },
  exportarTabla(grupoId, nombre) { return GL._delegarExport('exportarTabla', [grupoId, nombre]); },
  exportarStats(grupoId, jornadaNum, nombre) { return GL._delegarExport('exportarStats', [grupoId, jornadaNum, nombre]); },
  exportarPerfil(jugadorId, nombre) { return GL._delegarExport('exportarPerfil', [jugadorId, nombre]); },

  /* ---------- Países dinámicos (tabla `paises`) ---------- */
  async cargarPaises(force) {
    if (GL._paisesCargados && !force) return GL.paises;
    if (typeof sb !== 'undefined' && sb) {
      const { data, error } = await sb.from('paises').select('codigo,nombre').eq('activo', true).order('nombre');
      if (!error && data && data.length) {
        GL.paises = data.map(p => ({
          codigo: String(p.codigo).toUpperCase(), nombre: p.nombre,
          zona: (PAISES[String(p.codigo).toUpperCase()] || {}).zona || CONFIG.ZONA_REFERENCIA
        }));
      } else if (error) {
        console.warn('Países:', error.message);
      }
    }
    if (!GL.paises.length) {
      GL.paises = Object.entries(PAISES).map(([codigo, v]) => ({ codigo, nombre: v.nombre }));
    }
    GL.paises.forEach(p => {
      if (!PAISES[p.codigo]) {
        PAISES[p.codigo] = { nombre: p.nombre, horario: ZONAS_HORARIAS.medio, zona: p.zona || CONFIG.ZONA_REFERENCIA };
      } else {
        PAISES[p.codigo].nombre = p.nombre;
        if (!PAISES[p.codigo].zona) PAISES[p.codigo].zona = p.zona || CONFIG.ZONA_REFERENCIA;
      }
    });
    GL._paisesCargados = true;
    return GL.paises;
  },

  nombrePais(codigo) {
    const c = String(codigo || '').toUpperCase();
    const dynamic = GL.paises.find(p => p.codigo === c);
    return (dynamic && dynamic.nombre) || (PAISES[c] && PAISES[c].nombre) || String(codigo || '—');
  },

  /* ---------- Horarios por zona horaria (Intl.DateTimeFormat) ----------
     Referencia deportiva: 11:00 – 21:00 en America/Managua.
     Cada jugador ve ese mismo instante convertido a su zona elegida.
     Ningún horario depende solo del país (México, Brasil y Chile tienen varias zonas). */
  _zonaResuelta(zona) {
    const nombre = String(zona || '').trim();
    if (!nombre) return '';
    try { new Intl.DateTimeFormat('es-ES', { timeZone: nombre }); return nombre; }
    catch (e) { return ''; }
  },

  zonaPorPais(codigo) {
    const c = String(codigo || '').toUpperCase();
    const fijo = PAISES[c];
    const dinamico = GL.paises.find(p => p.codigo === c);
    return GL._zonaResuelta((fijo && fijo.zona) || (dinamico && dinamico.zona)) || CONFIG.ZONA_REFERENCIA;
  },

  /* Prioridad: zona elegida por el jugador → zona habitual del país → referencia. */
  zonaJugador(jugador, codigoPais) {
    const j = jugador || {};
    return GL._zonaResuelta(j.zona_horaria) || GL.zonaPorPais(j.pais || codigoPais);
  },

  partesEnZona(instante, zona) {
    const z = GL._zonaResuelta(zona) || CONFIG.ZONA_REFERENCIA;
    const fecha = instante instanceof Date ? instante : new Date(instante);
    const partes = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(fecha).forEach(p => {
      if (p.type !== 'literal') partes[p.type] = Number(p.value);
    });
    if (partes.hour === 24) partes.hour = 0;
    return partes;
  },

  /* Date UTC cuyo reloj local en la zona de referencia marca la hora pedida. */
  momentoReferencia(fecha, fin) {
    const base = fecha instanceof Date && !isNaN(fecha.getTime()) ? fecha : new Date();
    const p = GL.partesEnZona(base, CONFIG.ZONA_REFERENCIA);
    const hhmm = String(fin ? CONFIG.HORA_FIN_REFERENCIA : CONFIG.HORA_INICIO_REFERENCIA).split(':');
    const objetivo = Date.UTC(p.year, p.month - 1, p.day, Number(hhmm[0]) || 0, Number(hhmm[1]) || 0);
    let instante = objetivo;
    // Ajuste iterativo: cubre cambios estacionales (horario de verano).
    for (let i = 0; i < 4; i++) {
      const q = GL.partesEnZona(instante, CONFIG.ZONA_REFERENCIA);
      const obtenido = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute);
      const delta = objetivo - obtenido;
      if (!delta) break;
      instante += delta;
    }
    return new Date(instante);
  },

  /* Instante UTC que corresponde a una fecha y hora LOCAL en la zona IANA dada.
     Ajuste iterativo para cambios estacionales. Devuelve null si los datos no son válidos. */
  momentoZona(fecha, hora, zona) {
    const z = GL._zonaResuelta(zona) || CONFIG.ZONA_REFERENCIA;
    const f = String(fecha || '').slice(0, 10);
    const h = String(hora || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{1,2}:\d{2}$/.test(h)) return null;
    const [anio, mes, dia] = f.split('-').map(Number);
    const [hh, mm] = h.split(':').map(Number);
    if (hh > 23 || mm > 59 || !mes || mes > 12 || !dia || dia > 31) return null;
    const objetivo = Date.UTC(anio, mes - 1, dia, hh, mm);
    const fechaObjetivo = new Date(objetivo);
    if (isNaN(fechaObjetivo.getTime()) ||
        fechaObjetivo.getUTCFullYear() !== anio || fechaObjetivo.getUTCMonth() !== mes - 1 ||
        fechaObjetivo.getUTCDate() !== dia) return null;
    let instante = objetivo;
    for (let i = 0; i < 5; i++) {
      const p = GL.partesEnZona(instante, z);
      const obtenido = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
      const delta = objetivo - obtenido;
      if (!delta) break;
      instante += delta;
    }
    return new Date(instante);
  },

  /* Fecha de un instante en una zona: DD/MM/YYYY. */
  fechaEnZona(instante, zona) {
    if (!instante) return 'Por definir';
    const d = instante instanceof Date ? instante : new Date(instante);
    if (isNaN(d.getTime())) return 'Por definir';
    const p = GL.partesEnZona(d, zona);
    return String(p.day).padStart(2, '0') + '/' + String(p.month).padStart(2, '0') + '/' + p.year;
  },

  /* Fecha y hora de un instante en una zona: DD/MM HH:mm. */
  fechaHoraEnZona(instante, zona) {
    if (!instante) return 'Por definir';
    const d = instante instanceof Date ? instante : new Date(instante);
    if (isNaN(d.getTime())) return 'Por definir';
    const p = GL.partesEnZona(d, zona);
    return String(p.day).padStart(2, '0') + '/' + String(p.month).padStart(2, '0') + ' ' +
      String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0');
  },

  horaEnZona(instante, zona) {
    const z = GL._zonaResuelta(zona) || CONFIG.ZONA_REFERENCIA;
    const fecha = instante instanceof Date ? instante : new Date(instante);
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: z, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(fecha).replace(/^24:/, '00:');
  },

  offsetZona(instante, zona) {
    const fecha = instante instanceof Date ? instante : new Date(instante);
    const p = GL.partesEnZona(fecha, zona);
    const localComoUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const actual = Math.floor(fecha.getTime() / 60000) * 60000;
    const minutos = Math.round((localComoUTC - actual) / 60000);
    const signo = minutos < 0 ? '-' : '+';
    const abs = Math.abs(minutos);
    return 'UTC' + signo + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0');
  },

  /* Texto corto del horario de juego en una zona (ej. "12:00 – 22:00"). */
  horarioZona(zona, fecha) {
    const z = GL.zonaJugador({ zona_horaria: zona });
    return GL.horaEnZona(GL.momentoReferencia(fecha, false), z) + ' – ' +
      GL.horaEnZona(GL.momentoReferencia(fecha, true), z);
  },

  horarioJugador(jugador, fecha, codigoPais) {
    const j = jugador || {};
    return GL.horarioZona(GL.zonaJugador(j, codigoPais || j.pais), fecha);
  },

  /* Compatibilidad: ahora devuelve el horario calculado para la zona del país. */
  horarioPais(codigo, fecha) { return GL.horarioZona(GL.zonaPorPais(codigo), fecha); },

  horarioZonaDetalle(zona, fecha) {
    const z = GL.zonaJugador({ zona_horaria: zona });
    return GL.horarioZona(z, fecha) + ' · ' + GL.etiquetaZona(z) +
      ' (' + GL.offsetZona(GL.momentoReferencia(fecha, false), z) + ')';
  },

  notaHorarios() {
    return 'Horarios estimados: ' + CONFIG.HORA_INICIO_REFERENCIA + ' – ' + CONFIG.HORA_FIN_REFERENCIA +
      ' en ' + GL.etiquetaZona(CONFIG.ZONA_REFERENCIA) +
      '. Cada jugador ve su hora local según la ciudad elegida en su perfil.';
  },

  etiquetaZona(zona) {
    const z = GL._zonaResuelta(zona);
    if (!z) return 'Zona por definir';
    const opcion = ZONAS_HORARIAS_DISPONIBLES.find(x => x.zona === z);
    if (opcion) return opcion.ciudad + ' (' + GL.nombrePais(opcion.pais) + ')';
    if (z === CONFIG.ZONA_REFERENCIA) return 'Managua (Nicaragua)';
    return z.split('/').pop().replace(/_/g, ' ');
  },

  /* Los países con una sola zona se preseleccionan; los que tienen varias
     obligan al jugador a elegir su ciudad. */
  zonaPorDefectoFormulario(pais) {
    const opciones = ZONAS_HORARIAS_DISPONIBLES.filter(x => x.pais === String(pais || '').toUpperCase());
    return opciones.length === 1 ? opciones[0].zona : '';
  },

  opcionesZonaHoraria(valor, pais) {
    const actual = GL._zonaResuelta(valor) || GL.zonaPorDefectoFormulario(pais);
    const codigo = String(pais || '').toUpperCase();
    const lista = codigo
      ? ZONAS_HORARIAS_DISPONIBLES.filter(x => x.pais === codigo)
      : ZONAS_HORARIAS_DISPONIBLES;
    const visibles = new Set(lista.map(x => x.zona));
    const extra = actual && !visibles.has(actual)
      ? '<option value="' + esc(actual) + '" selected>' + esc(GL.etiquetaZona(actual)) + '</option>' : '';
    return '<option value="">Seleccioná tu ciudad o zona horaria</option>' +
      lista.map(x => '<option value="' + esc(x.zona) + '"' + (x.zona === actual ? ' selected' : '') + '>' +
        esc(x.ciudad + ' — ' + GL.nombrePais(x.pais)) + '</option>').join('') + extra;
  },

  /* Actualiza el selector y su nota al cambiar de país. */
  actualizarZona(select, pais, nota, conservar) {
    if (!select) return;
    select.innerHTML = GL.opcionesZonaHoraria(conservar ? select.value : '', pais);
    if (nota) {
      nota.innerHTML = select.value
        ? icono('clock', 14) + ' Horario de juego: ' + esc(GL.horarioZonaDetalle(select.value))
        : icono('info', 14) + ' Elegí tu ciudad para ver tu horario de juego.';
    }
    iniciarIconos();
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

    longitudes(codigoPais) {
      const p = PAISES[String(codigoPais || '').toUpperCase()];
      return p ? (p.longitudes || [p.digitos]) : [];
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
      icono('message-circle', 14) + esc(display) + '</a>';
  },

  /* ---------- Notificaciones ---------- */
  notificar(mensaje, tipo, ico) {
    const estilos = {
      exito:       { background: GL.tema.exito, color: GL.tema.bg },
      error:       { background: GL.tema.marca, color: GL.tema.texto },
      advertencia: { background: GL.tema.advertencia, color: GL.tema.bg },
      info:        { background: GL.tema.info, color: GL.tema.bg }
    };
    const est = estilos[tipo] || estilos.exito;
    const texto = ico ? icono(ico, 16, 'gl-toast-ico' + (ico === 'loader-circle' ? ' girando' : '')) + esc(mensaje) : esc(mensaje);
    const movil = !!(window.matchMedia && window.matchMedia('(max-width:780px)').matches);
    if (typeof Toastify === 'function') {
      Toastify({
        text: texto, duration: 3500, gravity: movil ? 'bottom' : 'top', position: movil ? 'center' : 'right',
        style: Object.assign({}, est, {
          borderRadius: '8px', fontFamily: GL.tema.fuente, fontWeight: '600',
          fontSize: '14px', border: '1px solid ' + GL.tema.bordeFuerte,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)'
        })
      }).showToast();
      if (ico) setTimeout(iniciarIconos, 0);
    } else {
      console.log('[' + (tipo || 'exito') + '] ' + mensaje);
    }
  },

  /* ---------- Feedback visual ---------- */
  skeleton(filas, alto, titulo) {
    const n = filas || 5, h = alto || 18;
    // Anchos variados para que se vea más natural
    const anchos = [
      ['12%','38%','10%','14%','10%'],
      ['14%','30%','12%','18%','8%'],
      ['10%','42%','8%','12%','12%'],
      ['16%','28%','14%','10%','14%'],
      ['12%','36%','10%','16%','10%']
    ];
    let out = '<div class="skeleton-wrap" aria-busy="true" aria-label="Cargando contenido">';
    if (titulo) {
      out += '<div class="skeleton-header">' +
        '<span class="skeleton" style="width:38%;height:22px;border-radius:6px;display:block;margin-bottom:8px"></span>' +
        '<span class="skeleton" style="width:55%;height:13px;border-radius:4px;display:block"></span>' +
        '</div>';
    }
    out += '<div class="skeleton-lista">';
    for (let i = 0; i < n; i++) {
      const aw = anchos[i % anchos.length];
      out += '<div class="skeleton-fila" style="animation-delay:' + (i * 0.07) + 's">' +
        aw.map(w => '<span class="skeleton" style="width:' + w + ';height:' + h + 'px"></span>').join('') +
        '</div>';
    }
    return out + '</div>' +
      '<p class="skeleton-leyenda" style="text-align:center;font-size:11px;color:var(--text-secondary);margin-top:10px">' +
        icono('loader', 14) + ' Cargando información…</p>';
    /* 1.2.0: se conserva el cierre sobrante como referencia histórica en comentario:
       antes se devolvía un </div> adicional que desequilibraba el panel. */
  },

  vacio(mensaje, ico, accion, sugerencia) {
    return '<div class="estado-vacio" role="status">' +
      '<div class="estado-ico-wrap">' + icono(ico || 'inbox', 38) + '</div>' +
      '<h3>' + esc(mensaje || 'No hay datos para mostrar') + '</h3>' +
      (sugerencia
        ? '<p class="estado-sugerencia">' + esc(sugerencia) + '</p>'
        : '') +
      (accion ? '<div class="estado-accion">' + accion + '</div>' : '') +
    '</div>';
  },

  error(mensajeTecnico, ico, contexto) {
    // Traducir el error técnico a un mensaje amigable para el usuario
    const amigable = GL.traducirError(mensajeTecnico, contexto);
    // El error técnico siempre queda en consola para debug
    if (mensajeTecnico && mensajeTecnico !== amigable) {
      console.debug('[GL.error técnico]', mensajeTecnico);
    }
    return '<div class="estado-vacio error" role="alert">' +
      '<div class="estado-ico-wrap">' + icono(ico || 'triangle-alert', 38) + '</div>' +
      '<h3>Algo salió mal</h3>' +
      '<p class="estado-desc">' + esc(amigable) + '</p>' +
      '<div class="estado-accion">' +
        '<button type="button" class="btn sec" onclick="location.reload()">' +
          icono('refresh-cw', 16) + 'Reintentar' +
        '</button>' +
      '</div>' +
      /* 1.2.0: el detalle técnico ya no se muestra al usuario; queda solo en consola. */
    '</div>';
  },

  /* Traduce mensajes de error técnicos a textos comprensibles para el usuario.
     contexto: string opcional que identifica el módulo ('estadísticas', 'fixture', etc.) */
  traducirError(msg, contexto) {
    if (!msg) return 'Ocurrió un error inesperado. Intentá recargar la página.';
    const m = String(msg).toLowerCase();
    const ctx = contexto ? ' al cargar ' + contexto : '';

    // Red / conectividad
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed'))
      return 'No pudimos conectarnos con el servidor' + ctx + '. Comprueba tu conexión a internet e intenta de nuevo.';
    if (m.includes('timeout') || m.includes('timed out'))
      return 'La respuesta tardó demasiado' + ctx + '. El servidor puede estar ocupado. Esperá un momento y reintenta.';
    if (m.includes('abort'))
      return 'La solicitud fue interrumpida' + ctx + '. Intentá recargar la página.';

    // Autenticación / sesión. Antes del match genérico de "supabase": un
    // refresh token vencido NO es un problema de configuración de la BD.
    if (m.includes('refresh token') || m.includes('invalid login credentials') ||
        m.includes('email not confirmed') || m.includes('user not found'))
      return 'Tu sesión venció o las credenciales no son válidas. Cerrá sesión y volvé a ingresar.';
    if (m.includes('jwt') || m.includes('token') || m.includes('session') || m.includes('unauthorized') || m.includes('401'))
      return 'Tu sesión expiró. Cerrá sesión, volvé a ingresar e intenta de nuevo.';
    if (m.includes('403') || m.includes('forbidden') || m.includes('row-level security'))
      return 'No tenés permiso para realizar esta acción. Si creés que es un error, contactá al administrador.';

    // Esquema / compatibilidad de base de datos (errores PostgreSQL 42xxx).
    // Antes del match genérico de "supabase": no es un problema de conexión
    // ni de credenciales, sino de columnas/tablas/funciones ausentes.
    if (/\b(42703|42p01|42883|42704)\b/.test(m) ||
        /column .* does not exist|relation .* does not exist|function .* does not exist|undefined column|undefined table/i.test(m))
      return 'La base de datos no tiene la estructura esperada' + ctx + '. Contactá al administrador para que aplique la actualización de esquema.';

    // Base de datos
    if (m.includes('duplicate') || m.includes('unique') || m.includes('already exists'))
      return 'Este registro ya existe. Revisá si ya fue ingresado previamente.';
    if (m.includes('foreign key') || m.includes('violates'))
      return 'No se puede completar la operación porque hay datos relacionados que lo impiden.';
    if (m.includes('not found') || m.includes('no rows') || m.includes('404'))
      return 'No encontramos la información solicitada. Es posible que haya sido eliminada o movida.';
    if (m.includes('supabase no configurado') || m.includes('supabase'))
      return 'Hay un problema de configuración con la base de datos. Contactá al administrador.';

    // Almacenamiento
    if (m.includes('storage') || m.includes('bucket') || m.includes('upload'))
      return 'No se pudo subir el archivo. Verificá que sea JPG o PNG y que no supere los 5 MB.';

    // Límites
    if (m.includes('too large') || m.includes('payload'))
      return 'El archivo o los datos enviados son demasiado grandes. Reducí el tamaño e intenta de nuevo.';
    if (m.includes('rate limit') || m.includes('too many requests') || m.includes('429'))
      return 'Estás haciendo demasiadas solicitudes en poco tiempo. Esperá unos segundos e intenta de nuevo.';

    // Servidor
    if (m.includes('500') || m.includes('internal server'))
      return 'El servidor encontró un error interno. Intentá de nuevo en unos minutos.';
    if (m.includes('503') || m.includes('service unavailable'))
      return 'El servicio no está disponible en este momento. Intentá más tarde.';

    // Sin conexión explícita (modo offline del navegador)
    if (!navigator.onLine)
      return 'No tenés conexión a internet. Conectate y recargá la página.';

    // Genérico legible: si el mensaje es corto y en español, mostrarlo directo
    if (msg.length < 120 && /[áéíóúñ¿¡]|[a-záéíóúñ ]{6,}/i.test(msg))
      return msg;

    return 'No pudimos cargar' + ctx + ' correctamente. Intentá de nuevo o contactá al administrador si el problema persiste.';
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
    fondo.innerHTML = '<div class="modal' + (o.ancho ? ' modal-' + o.ancho : '') +
      '" role="dialog" aria-modal="true" aria-labelledby="modal-titulo-id">' +
      '<div class="modal-head"><h2 id="modal-titulo-id">' + esc(o.titulo || '') + '</h2>' +
      '<button type="button" class="btn-icon" data-cerrar aria-label="Cerrar">' + icono('x', 20) + '</button></div>' +
      '<div class="modal-cuerpo">' + (o.cuerpo || '') + '</div>' +
      (o.acciones ? '<div class="modal-acciones">' + o.acciones + '</div>' : '') + '</div>';
    root.appendChild(fondo);
    let cerrando = false;
    const cerrarReal = () => {
      if (cerrando) return;
      cerrando = true;
      try { if (typeof o.alCerrar === 'function') o.alCerrar(); } catch (e) { console.warn('[GL.abrirModal] alCerrar:', e); }
      finalizar();
      fondo.classList.add('saliendo');
      setTimeout(() => { if (fondo.parentNode) fondo.remove(); }, 180);
    };
    const finalizar = activarModalAccesible(fondo, cerrarReal);
    fondo.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrarReal));
    fondo.addEventListener('click', e => { if (e.target === fondo) cerrarReal(); });
    fondo.cerrar = cerrarReal;
    if (o.onAbrir) o.onAbrir(fondo, cerrarReal);
    setTimeout(() => {
      const f = fondo.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[data-confirmar],[data-si],.modal-acciones .btn,button');
      if (f) f.focus();
    }, 60);
    return fondo;
  },

  confirmar(mensaje, titulo, aceptarTexto) {
    return new Promise(res => {
      let resuelto = false;
      const resolver = valor => { if (!resuelto) { resuelto = true; res(valor); } };
      GL.abrirModal({
        titulo: titulo || 'Confirmar acción',
        cuerpo: '<p class="modal-texto">' + esc(mensaje) + '</p>',
        acciones: '<button type="button" class="btn sec" data-no>Cancelar</button>' +
          '<button type="button" class="btn" data-si>' + esc(aceptarTexto || 'Confirmar') + '</button>',
        alCerrar: () => resolver(false),
        onAbrir(fondo, cerrar) {
          fondo.querySelector('[data-no]').addEventListener('click', () => { resolver(false); cerrar(); });
          fondo.querySelector('[data-si]').addEventListener('click', () => { resolver(true); cerrar(); });
        }
      });
    });
  },

  /* ─────────────────────────────────────────────────────────────────
     GL.dialogo — sistema unificado de diálogos
     ─────────────────────────────────────────────────────────────────
     opciones: {
       titulo        string         encabezado del diálogo
       icono         string         nombre del icono Lucide (opcional)
       cuerpo        string|fn      HTML estático o función(modal)→string
       acciones      string         HTML de botones (opcional, se sobreescribe con tipo)
       ancho         string         'sm'|'md'|'lg' (default: 'md')
       tipo          string         'normal'|'peligro'|'info'|'carga'
       confirmTexto  string         texto del botón confirmar
       cancelTexto   string         texto del botón cancelar
       onAbrir       fn(modal,cerrar) callback cuando abre
       onConfirmar   fn(modal,cerrar,setBloqueado) callback al confirmar
       consecuencias string         HTML explicativo en diálogos peligrosos
     }
     Devuelve el elemento del modal con:
       modal.cerrar()
       modal.setError(msg)
       modal.setBloqueado(bool)
  ─────────────────────────────────────────────────────────────────── */
  dialogo(opciones) {
    const o = opciones || {};
    const tipo  = o.tipo || 'normal';
    const ancho = o.ancho || 'md';
    const esPeligro = tipo === 'peligro';

    // Icono del encabezado
    const icoHead = o.icono
      ? '<span class="modal-head-ico modal-head-ico-' + tipo + '">' + icono(o.icono, 18) + '</span>'
      : '';

    // Bloque de consecuencias para acciones peligrosas
    const bloqConsecuencias = esPeligro && o.consecuencias
      ? '<div class="modal-consecuencias">' +
          '<div class="modal-consecuencias-titulo">' + icono('triangle-alert', 14) + 'Consecuencias de esta acción</div>' +
          o.consecuencias +
        '</div>'
      : '';

    // Área de error inline (vacía al inicio)
    const bloqError = '<div class="modal-error-inline" style="display:none" role="alert"></div>';

    // Cuerpo completo
    const cuerpoHTML = bloqConsecuencias +
      (typeof o.cuerpo === 'string' ? o.cuerpo : '') +
      bloqError;

    // Botones
    let accionesHTML = o.acciones || '';
    if (!o.acciones) {
      const cancelBtn = '<button type="button" class="btn sec" data-cerrar>' +
        esc(o.cancelTexto || 'Cancelar') + '</button>';
      const confirmBtn = esPeligro
        ? '<button type="button" class="btn btn-peligro" data-confirmar>' +
            icono('triangle-alert', 14) + esc(o.confirmTexto || 'Confirmar') + '</button>'
        : '<button type="button" class="btn" data-confirmar>' +
            esc(o.confirmTexto || 'Aceptar') + '</button>';
      accionesHTML = cancelBtn + confirmBtn;
    }

    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML =
      '<div class="modal modal-' + ancho + (esPeligro ? ' modal-peligro' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-titulo-id">' +
        '<div class="modal-head">' +
          icoHead +
          '<h2 id="modal-titulo-id">' + esc(o.titulo || '') + '</h2>' +
          '<button type="button" class="btn-icon" data-cerrar aria-label="Cerrar">' + icono('x', 20) + '</button>' +
        '</div>' +
        '<div class="modal-cuerpo">' + cuerpoHTML + '</div>' +
        (accionesHTML ? '<div class="modal-acciones">' + accionesHTML + '</div>' : '') +
      '</div>';

    const root = document.getElementById('modal-root') || document.body;
    root.appendChild(fondo);
    iniciarIconos();

    // Helpers expuestos en el elemento
    let cerrando = false;
    const cerrarReal = () => {
      if (cerrando) return;
      cerrando = true;
      try { if (typeof o.alCerrar === 'function') o.alCerrar(); } catch (e) { console.warn('[GL.dialogo] alCerrar:', e); }
      finalizar();
      fondo.classList.add('saliendo');
      setTimeout(() => { if (fondo.parentNode) fondo.remove(); }, 180);
    };
    const finalizar = activarModalAccesible(fondo, cerrarReal);
    fondo.cerrar = cerrarReal;

    fondo.setError = (msg) => {
      const el = fondo.querySelector('.modal-error-inline');
      if (!el) return;
      if (msg) {
        el.innerHTML = icono('circle-alert', 14) + ' ' + esc(msg);
        el.style.display = 'flex';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.style.display = 'none';
        el.innerHTML = '';
      }
    };

    fondo.setBloqueado = (bloq) => {
      fondo.querySelectorAll('button, input, select, textarea').forEach(el => {
        el.disabled = !!bloq;
      });
      const confirmBtn = fondo.querySelector('[data-confirmar]');
      if (confirmBtn) {
        confirmBtn.innerHTML = bloq
          ? icono('loader-circle', 14, 'girando') + ' Guardando…'
          : (esPeligro
              ? icono('triangle-alert', 14) + esc(o.confirmTexto || 'Confirmar')
              : esc(o.confirmTexto || 'Aceptar'));
      }
    };

    // Cierre con Escape, Tab contenido y retorno de foco: activarModalAccesible().

    // Cierre por fondo
    fondo.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrarReal));
    fondo.addEventListener('click', e => { if (e.target === fondo) cerrarReal(); });

    // Botón confirmar
    const confirmBtn = fondo.querySelector('[data-confirmar]');
    if (confirmBtn && o.onConfirmar) {
      confirmBtn.addEventListener('click', () => {
        fondo.setError('');
        o.onConfirmar(fondo, cerrarReal, fondo.setBloqueado);
      });
    }

    // Callback de apertura (para cuerpo dinámico o event listeners adicionales)
    if (typeof o.cuerpo === 'function') {
      fondo.querySelector('.modal-cuerpo').insertAdjacentHTML('afterbegin', o.cuerpo(fondo));
    }
    if (o.onAbrir) o.onAbrir(fondo, cerrarReal);

    // Foco inicial
    setTimeout(() => {
      const primer = fondo.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[data-confirmar],.modal-acciones .btn,button:not([disabled])');
      if (primer) primer.focus();
    }, 60);

    return fondo;
  },

  /* Confirmación peligrosa con consecuencias explícitas — devuelve Promise<bool> */
  confirmarPeligro(opciones) {
    const o = opciones || {};
    return new Promise(res => {
      let resuelto = false;
      const resolver = valor => { if (!resuelto) { resuelto = true; res(valor); } };
      GL.dialogo({
        titulo:        o.titulo        || '¿Estás seguro?',
        icono:         o.icono         || 'triangle-alert',
        tipo:          'peligro',
        ancho:         'sm',
        consecuencias: o.consecuencias || '',
        cuerpo:        '<p class="modal-texto">' + esc(o.mensaje || '¿Querés continuar?') + '</p>',
        confirmTexto:  o.confirmTexto  || 'Sí, continuar',
        cancelTexto:   o.cancelTexto   || 'Cancelar',
        alCerrar: () => resolver(false),
        onConfirmar(fondo, cerrar) { resolver(true); cerrar(); }
      });
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

  /* ---------- Consultas a Supabase ---------- */
  // Columnas seguras para leer según la tabla.
  // 'jugadores' solo lo lee el admin (por RLS); no necesita filtrar aquí.
  // 'jugadores_publicos' es la vista ya filtrada en la base de datos.
  _columnas: {
    jugadores:         'id,nombre_usuario,pais,zona_horaria,avatar_url,activo,suspendido,rol,torneo_id,numero,telefono,telefono_e164,telefono_nacional,pais_telefono,telefono_verificado,telefono_valido_plan,email,user_id,super_admin,created_at',
    jugadores_publicos:'id,nombre_usuario,pais,avatar_url,activo,suspendido,torneo_id,numero',
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
      /* FASE 2.3 revocó SELECT de anon sobre grupo_jugadores y sanciones.
         El invitado no debe consultarlas: la pertenencia se derive de clasificacion. */
      const esPublico = !(typeof Auth !== 'undefined' && Auth && Auth.usuario);
      const sinDatos = Promise.resolve({ data: [], error: null });
      const [torneos, grupos, jugadores, miembros, jornadas, clasificacion, sanciones] = await Promise.all([
        GL.consultar('torneos', q => q.eq('estado', 'activo').order('created_at', { ascending: false }).limit(1)),
        GL.consultar('grupos', q => q.order('nombre')),
        GL.esAdmin()
          ? GL.consultar('jugadores', q => q.order('nombre_usuario'))
          : GL.consultar('jugadores_publicos', q => q.order('nombre_usuario')),
        esPublico ? sinDatos : GL.consultar('grupo_jugadores'),
        GL.consultar('jornadas', q => q.order('numero', { ascending: true })),
        GL.consultar('clasificacion', q => q.order('pts', { ascending: false })),
        esPublico ? sinDatos : GL.consultar('sanciones', q => q.order('created_at', { ascending: false }))
      ]);
      /* FASE 3.12 (ampliación): identificar QUÉ consulta falló. El texto genérico
         que contenía "Supabase" se traducía como "problema de configuración",
         aunque el error real fuera de esquema, RLS o autenticación. */
      const consultasContexto = [
        ['torneos', torneos], ['grupos', grupos], ['jugadores', jugadores],
        ['grupo_jugadores/sanciones', miembros], ['jornadas', jornadas],
        ['clasificacion', clasificacion], ['sanciones', sanciones]
      ];
      const fallo = consultasContexto.find(([, r]) => r && r.error);
      if (fallo) {
        console.warn('Contexto GL: falló la consulta de ' + fallo[0], fallo[1].error);
        if (GL._notificaciones++ === 0) {
          GL.notificar('No se pudo cargar ' + fallo[0] + '. El detalle real está en la consola; revisa permisos y estructura.', 'advertencia');
        }
      }
      const torneo = (torneos.data || [])[0] || t || null;
      const tid = torneo && torneo.id;
      const filtrar = arr => !tid ? arr : arr.filter(x => !x.torneo_id || x.torneo_id === tid);
      GL.ctx = {
        torneo,
        grupos: filtrar(grupos.data || []),
        jugadores: filtrar(jugadores.data || []),
        miembros: [],
        jornadas: filtrar(jornadas.data || []),
        clasificacion: filtrar(clasificacion.data || []),
        sanciones: filtrar(sanciones.data || [])
      };
      // El invitado no puede leer grupo_jugadores: usa la clasificación pública.
      const miembrosBase = esPublico
        ? GL.ctx.clasificacion.map(c => ({ grupo_id: c.grupo_id, jugador_id: c.jugador_id }))
        : (miembros.data || []);
      // Filtrar miembros al torneo activo usando los grupos ya filtrados
      const gruposDelTorneo = new Set(GL.ctx.grupos.map(g => g.id));
      GL.ctx.miembros = miembrosBase.filter(m => gruposDelTorneo.has(m.grupo_id));

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
  zonaHorariaJugador(id) { const j = GL.jugador(id); return j ? GL.zonaJugador(j) : GL.zonaPorPais(''); },

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
    const total = Number(GL.torneo() && GL.torneo().total_jornadas) || CONFIG.JORNADAS_FASE_REGULAR;
    const j = GL.ctx.jornadas.find(x => x.estado === 'abierta' && x.numero <= total);
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
    return '<div class="acceso-denegado">' + icono('lock-keyhole', 32) +
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
/* ---------------------------------------------------------------------
   1.2.0 — Teléfonos con libphonenumber-js (metadata nacional real).
   Se añade después del objeto GL para poder leer la implementación anterior.
   --------------------------------------------------------------------- */
const GL_telIntl = (function () {
    const L = window.libphonenumber;
    const disponible = !!(L && typeof L.parsePhoneNumberFromString === 'function');
    if (!disponible) {
      console.warn('[GL.tel] libphonenumber-js no disponible; se usa el formato histórico.');
    }
    const original = {
      normalizar: GL.tel.normalizar.bind(GL.tel),
      validar: GL.tel.validar.bind(GL.tel),
      formatear: GL.tel.formatear.bind(GL.tel)
    };
    const paisDe = codigo => String(codigo || '').toUpperCase() || 'NI';

    function parsear(valor, codigoPais) {
      if (!disponible) return null;
      try {
        const p = L.parsePhoneNumberFromString(String(valor || '').trim(), paisDe(codigoPais));
        return p && p.isValid() ? p : null;
      } catch (e) {
        return null;
      }
    }

    function digitos(valor) { return String(valor || '').replace(/\D/g, ''); }

    function e164(valor, codigoPais) {
      const p = parsear(valor, codigoPais);
      return p ? p.number : '';
    }

    function nacional(valor, codigoPais) {
      const numero = e164(valor, codigoPais);
      if (!numero) return '';
      try {
        /* El bundle CDN expone PhoneNumber.format(), no formatNumber(). */
        const objeto = L.parsePhoneNumberFromString(numero, paisDe(codigoPais));
        let texto = objeto ? objeto.format('NATIONAL') : '';
        if (!texto) return '+' + numero.replace('+', '');
        /* Nicaragua: la metadata devuelve 4+4; se presenta con guion solo ahí. */
        if (paisDe(codigoPais) === 'NI' && /^\d{4}\s\d{4}$/.test(texto)) {
          texto = texto.replace(' ', '-');
        }
        return texto;
      } catch (e) {
        return '+' + numero.replace('+', '');
      }
    }

    GL.tel.normalizar = function (telefono, codigoPais) {
      const numero = e164(telefono, codigoPais);
      return numero ? digitos(numero) : original.normalizar(telefono, codigoPais);
    };
    GL.tel.e164 = e164;
    GL.tel.nacional = nacional;
    GL.tel.esValido = function (telefono, codigoPais) { return !!parsear(telefono, codigoPais); };
    GL.tel.validar = function (telefono, codigoPais, obligatorio) {
      const valor = String(telefono ?? '').trim();
      const pais = paisDe(codigoPais);
      const nombre = (PAISES[pais] || {}).nombre || 'ese país';
      const prefijo = GL.tel.prefijo(pais) ? '+' + GL.tel.prefijo(pais) : '';

      if (!valor) {
        if (obligatorio) {
          return { ok: false, requerido: true, motivo: 'requerido', pais, mensaje: 'El teléfono es obligatorio.' };
        }
        return { ok: true, e164: '', nacional: '', pais, motivo: '', mensaje: '' };
      }
      if (!disponible) return original.validar(valor, pais);

      const p = parsear(valor, pais);
      if (!p) {
        const soloDigitos = digitos(valor);
        let motivo = 'invalido';
        if (!valor.startsWith('+') && /^0/.test(soloDigitos)) motivo = 'cero_inicial';
        else if (soloDigitos.length && soloDigitos.length < 8) motivo = 'incompleto';
        else if (valor.startsWith('+')) {
          const otro = parsear(valor);
          if (otro && otro.country && otro.country !== pais) motivo = 'prefijo';
        }
        const mensajes = {
          requerido: 'El teléfono es obligatorio.',
          incompleto: 'El número está incompleto. Completá todos los dígitos.',
          cero_inicial: 'El formato nacional no puede empezar con cero. Quitá el cero inicial.',
          prefijo: 'El prefijo no corresponde a ' + nombre + (prefijo ? '. Usá ' + prefijo : '') + '.',
          invalido: 'El número no parece válido para ' + nombre + '. Comprueba el prefijo y vuelve a intentarlo.'
        };
        return { ok: false, motivo, pais, mensaje: mensajes[motivo] };
      }

      if (p.country && pais && p.country !== pais) {
        return {
          ok: false, motivo: 'prefijo', pais,
          mensaje: 'El prefijo no corresponde a ' + nombre + (prefijo ? '. Usá ' + prefijo : '') + '.'
        };
      }
      return {
        ok: true, e164: p.number, nacional: nacional(p.number, pais),
        pais: p.country || pais, motivo: '', mensaje: ''
      };
    };
    GL.tel.formatear = function (valor, codigoPais) {
      const texto = nacional(valor, codigoPais);
      return texto || original.formatear(valor, codigoPais);
    };

    /* 1.2.1 — Una sola ruta para construir los campos canónicos. Nunca se
       incluye telefono_verificado; la titularidad solo la confirma una persona. */
    GL.tel.campos = function (valor, codigoPais) {
      const estado = GL.tel.validar(valor, codigoPais, false);
      if (!estado.ok || !estado.e164) {
        return {
          telefono: '', telefono_e164: '', telefono_valido_plan: null,
          telefono_nacional: '', pais_telefono: paisDe(codigoPais)
        };
      }
      return {
        telefono: digitos(estado.e164),
        telefono_e164: estado.e164,
        telefono_valido_plan: true,
        telefono_nacional: estado.nacional,
        pais_telefono: estado.pais || paisDe(codigoPais)
      };
    };

    GL.tel.pais = function (valor) {
      const p = parsear(valor);
      return p && p.country ? p.country : '';
    };

    GL.tel.paisJugador = function (jugador) {
      if (!jugador || typeof jugador !== 'object') return '';
      return String(jugador.pais_telefono || jugador.pais || '').toUpperCase();
    };

    /* Acepta telefonos históricos con o sin '+'. Solo devuelve un E.164
       cuando libphonenumber-js puede parsearlo; nunca inventa un enlace. */
    GL.tel.e164Jugador = function e164Jugador(jugador) {
      if (!jugador || typeof jugador !== 'object') return '';
      const valor = String(jugador.telefono_e164 || jugador.telefono || '').trim();
      if (!valor) return '';
      if (valor.startsWith('+')) {
        const p = parsear(valor);
        return p ? p.number : '';
      }
      /* Formatos históricos sin '+': si ya traen el prefijo del país, se
         reinterpretan como internacionales en vez de como nacionales. */
      const paisJugador = GL.tel.paisJugador(jugador);
      const soloDigitos = digitos(valor);
      const prefijo = GL.tel.prefijo(paisJugador);
      const candidato = prefijo && soloDigitos.startsWith(prefijo)
        ? '+' + soloDigitos : valor;
      return e164(candidato, paisJugador);
    };

    /* El número no cambió: recalcula la validez de formato cuando el campo
       quedó NULL, sin tocar telefono ni telefono_verificado. */
    GL.tel.cambiosSiNuevos = function cambiosSiNuevos(valor, codigoPais, jugador) {
      const anterior = GL.tel.e164Jugador(jugador);
      const escrito = String(valor ?? '').trim();
      if (!escrito) {
        if (!anterior) return {};
        return {
          telefono: '', telefono_e164: '', telefono_nacional: '',
          pais_telefono: '', telefono_valido_plan: null
        };
      }
      const estado = GL.tel.validar(escrito, codigoPais || GL.tel.paisJugador(jugador), false);
      if (!estado.ok) return { __error: estado };
      if (estado.e164 === anterior) {
        return jugador && jugador.telefono_valido_plan === true
          ? {} : { telefono_valido_plan: true };
      }
      return GL.tel.campos(estado.e164, estado.pais || codigoPais);
    };
    return { disponible, e164, nacional, parsear };
})();

/* 1.2.1 — WhatsApp: solo con objeto jugador y E.164 válido. Genera wa.me sin
   +, espacios ni guiones. No afirma que el número tenga cuenta de WhatsApp ni
   que la titularidad esté confirmada. */
(function () {
  GL.linkWhatsapp = function (jugador, nombreFallback) {
    if (!jugador || typeof jugador !== 'object') return '';
    const numero = GL.tel.e164Jugador(jugador);
    if (!numero) return '';
    const soloDigitos = String(numero).replace(/\D/g, '');
    if (!/^[1-9]\d{7,14}$/.test(soloDigitos)) return '';
    const nombre = nombreFallback || jugador.nombre_usuario || '';
    const display = GL.tel.formatear(numero, GL.tel.paisJugador(jugador)) || numero;
    return '<a class="wa-link" href="https://wa.me/' + soloDigitos +
      '" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="Abrir chat con ' + esc(nombre || 'este jugador') + ' por WhatsApp" ' +
      'title="Abrir chat con ' + esc(nombre || 'este jugador') + '">' +
      icono('message-circle', 14) + esc(display) + '</a>';
  };
})();

window.GL = GL;
