/* =====================================================================
   MÓDULO — Centro de notificaciones
   Jugadores: eventos de liga, partidos, sanciones, clasificación.
   Administradores: registro, validaciones, operaciones completadas.
   Realtime: actualización en vivo vía Supabase channel.
   ===================================================================== */
(function () {

  /* ── Tipos de notificación ──────────────────────────────────────── */
  const TIPOS = {
    /* Jugador */
    jornada_abierta:         { ico: 'flag',             color: 'blue',    label: 'Jornada abierta'          },
    partido_pendiente:       { ico: 'calendar',         color: 'blue',    label: 'Partido pendiente'        },
    resultado_publicado:     { ico: 'check-circle-2',   color: 'green',   label: 'Resultado publicado'      },
    clasificacion_cambio:    { ico: 'bar-chart-2',      color: 'gold',    label: 'Tabla actualizada'        },
    sancion_aplicada:        { ico: 'triangle-alert',   color: 'orange',  label: 'Sanción aplicada'         },
    sancion_modificada:      { ico: 'edit',             color: 'orange',  label: 'Sanción modificada'       },
    suspension:              { ico: 'user-x',           color: 'red',     label: 'Suspensión'               },
    clasifica_eliminatorias: { ico: 'trophy',           color: 'gold',    label: '¡Clasificado!'            },
    temporada_finalizada:    { ico: 'flag-off',         color: 'neutral', label: 'Temporada cerrada'        },
    jornada_cerrada:         { ico: 'lock',             color: 'neutral', label: 'Jornada cerrada'          },
    /* Admin */
    jugador_registrado:      { ico: 'user-plus',        color: 'green',   label: 'Nuevo jugador'            },
    perfil_pendiente:        { ico: 'user-cog',         color: 'orange',  label: 'Perfil pendiente'         },
    resultado_sin_validar:   { ico: 'clipboard-x',      color: 'orange',  label: 'Resultado pendiente'      },
    captura_recibida:        { ico: 'image',            color: 'blue',    label: 'Captura recibida'         },
    jornada_por_cerrar:      { ico: 'clock',            color: 'orange',  label: 'Jornada lista p/ cerrar'  },
    error_resultado:         { ico: 'circle-x',         color: 'red',     label: 'Error en resultado'       },
    jugador_expulsado:       { ico: 'user-x',           color: 'red',     label: 'Jugador expulsado'        },
    operacion_completada:    { ico: 'check-circle-2',   color: 'green',   label: 'Operación completada'     },
    /* Genérico */
    info:                    { ico: 'info',             color: 'blue',    label: 'Información'              },
    advertencia:             { ico: 'triangle-alert',   color: 'orange',  label: 'Advertencia'              },
  };

  /* ── Filtros de vista ────────────────────────────────────────────── */
  const FILTROS = [
    { id: 'todas',    label: 'Todas'      },
    { id: 'no_leida', label: 'Sin leer'   },
    { id: 'jugador',  label: 'Liga'       },
    { id: 'admin',    label: 'Administración' },
  ];

  const TIPOS_ADMIN = new Set([
    'jugador_registrado','perfil_pendiente','resultado_sin_validar',
    'captura_recibida','jornada_por_cerrar','error_resultado',
    'jugador_expulsado','operacion_completada'
  ]);

  /* ── Identidad estable de una notificación ─────────────────────────
     El texto visible NO es el identificador principal. La clave se arma con
     tipo + torneo + jugador + el dato estructural correspondiente (jornada,
     sanción, día). La lectura de texto queda sólo como respaldo de filas
     históricas creadas antes de existir esta clave. */
  const SEP = '|';

  function _valor(v) {
    return v === null || v === undefined ? '' : String(v);
  }

  function _diaDeNotificacion(n) {
    const fila = n || {};
    return _valor(fila.dia || _valor(fila.created_at).slice(0, 10)) || new Date().toISOString().slice(0, 10);
  }

  function _jornadaDeNotificacion(n) {
    const fila = n || {};
    const candidatos = [
      fila.jornada_numero, fila.jornada, fila.numero_jornada,
      fila.metadata && fila.metadata.jornada,
      fila.datos && fila.datos.jornada
    ];
    for (const valor of candidatos) {
      const numero = Number(valor);
      if (Number.isInteger(numero) && numero > 0) return numero;
    }
    /* Respaldo para filas históricas: anteriormente se comparaba Big/Little
       Endian de texto ('Jornada' vs 'jornada'); aquí la búsqueda es insensible
       a mayúsculas y lee tanto título como cuerpo. */
    const texto = _valor(fila.titulo) + ' ' + _valor(fila.cuerpo);
    const coincide = texto.match(/\bjornada\s*#?\s*(\d{1,3})\b/i);
    return coincide ? Number(coincide[1]) : null;
  }

  /* Dedup de vista: NO borra filas de Supabase. Conserva una sola entrada
     por identidad canónica y prefiere la más reciente; si alguna repetida
     sigue sin leer, conserva ese estado para no ocultar un aviso pendiente. */
  function _dedupHistorial(filas) {
    const vistas = new Map();
    (filas || []).forEach(n => {
      const clave = _claveNotificacion(n) || ('id:' + _valor(n && n.id));
      const anterior = vistas.get(clave);
      if (!anterior) { vistas.set(clave, n); return; }
      if (anterior.leida && !n.leida) { vistas.set(clave, n); return; }
      if (!anterior.leida && n.leida) return;
      const masReciente = _valor(n.created_at) > _valor(anterior.created_at);
      if (masReciente) vistas.set(clave, n);
    });
    return Array.from(vistas.values());
  }

  function _claveNotificacion(n) {
    const fila = n || {};
    const tipo = _valor(fila.tipo);
    if (!tipo) return '';
    const torneoId = _valor(fila.torneo_id ||
      (typeof GL !== 'undefined' && GL.torneo ? (GL.torneo() || {}).id : null));
    const jugadorId = _valor(fila.jugador_id ||
      (typeof Auth !== 'undefined' && Auth.jugador ? Auth.jugador.id : null));
    const base = [tipo, torneoId, jugadorId];

    if (tipo === 'jornada_abierta') {
      const jornada = _jornadaDeNotificacion(fila);
      return jornada ? base.concat('j' + jornada).join(SEP) : '';
    }
    if (tipo === 'sancion_aplicada' || tipo === 'suspension') {
      const sancionId = fila.sancion_id || fila.entidad_id ||
        (fila.metadata && fila.metadata.sancion_id);
      if (sancionId) return base.concat('s' + sancionId).join(SEP);
      const texto = (_valor(fila.titulo) + ' ' + _valor(fila.cuerpo)).trim().toLowerCase();
      return texto ? base.concat('legado', texto).join(SEP) : '';
    }
    if (tipo === 'clasifica_eliminatorias') return base.join(SEP);
    if (tipo === 'perfil_pendiente') {
      return base.concat('d' + _diaDeNotificacion(fila), 'sin_grupo').join(SEP);
    }
    if (tipo === 'jornada_por_cerrar') {
      return base.concat('d' + _diaDeNotificacion(fila)).join(SEP);
    }
    if (tipo === 'resultado_publicado' || tipo === 'partido_pendiente') {
      const partidoId = fila.partido_id || fila.entidad_id ||
        (fila.metadata && fila.metadata.partido_id);
      return partidoId ? base.concat('p' + partidoId).join(SEP) : '';
    }
    return '';
  }

  /* ── Estado del módulo ──────────────────────────────────────────── */
  const Mod = {
    titulo: 'Notificaciones',
    _panelAbierto: false,
    _cache:    [],
    _historial: [],
    _claves:   new Set(),
    _sinLeer:  0,
    _filtro:   'todas',
    _realtime: null,
    _elVista:  null,
    _generando: null,
    _cargando: null,
    _badgeCargadoPara: null,
    _listenerFuera: null,

    _existe(clave, alternativa) {
      return !!(clave && Mod._claves.has(clave)) ||
        !!(alternativa && Mod._claves.has(alternativa));
    },

    /* ── Vista principal (página completa) ── */
    async render(el) {
      Mod._elVista = el;
      if (!Auth.usuario) {
        el.innerHTML = GL.accesoDenegado('jugador');
        iniciarIconos(); return;
      }
      el.innerHTML = _skeletonNotif();
      iniciarIconos();
      await Mod._cargar();
      Mod._pintarVista(el);
      Mod._suscribirRealtime();
    },

    /* ── Carga desde Supabase ──
       La vista muestra como máximo 80 filas, pero la deduplicación consulta
       TODO el historial del jugador: el viejo `.limit(80)` permitía generar
       duplicados cuando la notificación existente caía fuera del bloque. */
    async _cargar() {
      if (Mod._cargando) return Mod._cargando;
      Mod._cargando = Mod._cargarInterno()
        .finally(() => { Mod._cargando = null; });
      return Mod._cargando;
    },

    async _cargarInterno() {
      if (!Auth.jugador) return;
      const { data, error } = await sb.from('notificaciones')
        .select('id,jugador_id,torneo_id,tipo,titulo,cuerpo,link_hash,leida,created_at')
        .eq('jugador_id', Auth.jugador.id)
        .order('created_at', { ascending: false });
      if (!error && data) {
        const visibles = _dedupHistorial(data);
        Mod._historial = data;
        Mod._cache     = visibles.slice(0, 80);
        Mod._sinLeer   = visibles.filter(n => !n.leida).length;
        Mod._claves    = new Set(data.map(n => _claveNotificacion(n)).filter(Boolean));
      } else if (error) {
        console.warn('[Notif] carga:', error.message);
      }
      await Mod._generarLocales();
    },

    /* ── Genera notificaciones desde el contexto GL ──
       La promesa en curso se reutiliza: dos cargas consecutivas o dos clics
       rápidos no pueden iniciar dos inserciones desde el mismo cliente. */
    async _generarLocales() {
      if (Mod._generando) return Mod._generando;
      Mod._generando = Mod._generarLocalesInterno()
        .finally(() => { Mod._generando = null; });
      return Mod._generando;
    },

    async _generarLocalesInterno() {
      if (!Auth.jugador || !GL.torneo()) return;
      const jid  = Auth.jugador.id;
      const tid  = GL.torneo().id;
      const hoy  = new Date().toISOString().slice(0, 10);
      const nuevas = [];

      /* Jornada abierta: identidad estable por tipo + torneo + jugador + jornada.
         El texto visible sólo se usa como respaldo para filas históricas. */
      const jornadaAbierta = typeof GL.jornadaAbiertaNumero === 'function'
        ? GL.jornadaAbiertaNumero()
        : (GL.jornadaActual() || {}).numero;
      if (jornadaAbierta) {
        const numero = jornadaAbierta;
        const titulo = 'Jornada ' + numero + ' abierta';
        const cuerpo = 'Tu jornada ' + numero + ' se encuentra abierta. Consultá tus partidos y coordiná con tu rival.';
        const clave = _claveNotificacion({
          tipo: 'jornada_abierta', torneo_id: tid, jugador_id: jid,
          jornada_numero: numero, titulo, cuerpo
        });
        if (!Mod._existe(clave)) nuevas.push({
          tipo: 'jornada_abierta',
          titulo, cuerpo,
          link_hash: 'fixture',
          jornada_numero: numero,
          torneo_id: tid,
          jugador_id: jid,
          _clave: clave
        });
      }

      /* Sanciones: usa el ID de la sanción cuando existe; el texto sólo se
         mantiene como clave de respaldo para notificaciones históricas. */
      const misSanciones = (GL.ctx.sanciones || []).filter(s => s.jugador_id === jid);
      misSanciones.forEach(s => {
        const grave = s.tipo === 'grave' || s.tipo === 'muy_grave';
        const tipo  = grave ? 'suspension' : 'sancion_aplicada';
        const titulo = grave ? 'Suspensión aplicada' : 'Sanción aplicada';
        const cuerpo = (s.motivo || 'Sin detalle') +
          (s.puntos_descuento ? ' · Descuento: -' + s.puntos_descuento + ' pts' : '') +
          (s.partidos_suspension ? ' · Suspendido ' + s.partidos_suspension + ' partido(s).' : '');
        const clave = _claveNotificacion({
          tipo, torneo_id: tid, jugador_id: jid,
          sancion_id: s.id, titulo, cuerpo
        });
        const legado = _claveNotificacion({
          tipo, torneo_id: tid, jugador_id: jid, titulo, cuerpo
        });
        if (!Mod._existe(clave, legado)) nuevas.push({
          tipo, titulo, cuerpo,
          link_hash: 'perfil',
          sancion_id: s.id || null,
          torneo_id: tid,
          jugador_id: jid,
          _clave: clave,
          _claveLegado: legado
        });
      });

      /* Clasificación a eliminatorias: una sola notificación por jugador/torneo. */
      const miGrupo = typeof GL.grupoDeJugador === 'function' ? GL.grupoDeJugador(jid) : null;
      const pos = GL.posicion ? GL.posicion(jid, miGrupo && miGrupo.id) : null;
      if (pos && pos <= 6) {
        const clave = _claveNotificacion({
          tipo: 'clasifica_eliminatorias', torneo_id: tid, jugador_id: jid
        });
        if (!Mod._existe(clave)) nuevas.push({
          tipo: 'clasifica_eliminatorias',
          titulo: '¡Estás clasificado!',
          cuerpo: 'Ocupás la posición ' + pos + ' — clasificás directamente a eliminatorias. ¡Seguí así!',
          link_hash: 'eliminatorias',
          torneo_id: tid,
          jugador_id: jid,
          _clave: clave
        });
      }

      /* ── Alertas admin ── */
      if (GL.esAdmin()) {
        /* Jugadores sin grupo: una alerta por día, torneo y administrador. */
        const sinGrupo = GL.jugadoresSinGrupo ? GL.jugadoresSinGrupo() : [];
        if (sinGrupo.length) {
          const clave = _claveNotificacion({
            tipo: 'perfil_pendiente', torneo_id: tid, jugador_id: jid,
            dia: hoy, created_at: new Date().toISOString()
          });
          if (!Mod._existe(clave)) nuevas.push({
            tipo: 'perfil_pendiente',
            titulo: sinGrupo.length + ' jugador(es) sin grupo',
            cuerpo: sinGrupo.length + ' jugador(es) están registrados pero sin grupo asignado. Asignalos desde Administración.',
            link_hash: 'administracion',
            torneo_id: tid,
            jugador_id: jid,
            dia: hoy,
            _clave: clave
          });
        }

        /* Jornadas listas para cerrar */
        const totalJornadas  = GL.torneo().total_jornadas || 22;
        const partidos       = await GL.partidos({ torneo_id: tid }).catch(() => []);
        const jornNums       = Array.from(new Set(partidos.map(p => p.jornada))).sort((a,b)=>a-b);
        const jornadasCerr   = new Set((GL.ctx.jornadas||[]).filter(j=>j.estado==='cerrada').map(j=>j.numero));
        const listasParaCerrar = jornNums.filter(n =>
          !jornadasCerr.has(n) &&
          partidos.filter(p=>p.jornada===n).every(p=>p.estado!=='pendiente'));
        if (listasParaCerrar.length) {
          const clave = _claveNotificacion({
            tipo: 'jornada_por_cerrar', torneo_id: tid, jugador_id: jid,
            dia: hoy, created_at: new Date().toISOString()
          });
          if (!Mod._existe(clave)) nuevas.push({
            tipo: 'jornada_por_cerrar',
            titulo: 'Jornada(s) lista(s) para cerrar',
            cuerpo: 'Las jornadas ' + listasParaCerrar.join(', ') + ' tienen todos sus partidos resueltos. Podés cerrarlas.',
            link_hash: 'jornadas',
            torneo_id: tid,
            jugador_id: jid,
            dia: hoy,
            _clave: clave
          });
        }
      }

      /* Guardar en Supabase. La clave se registra en memoria en cuanto la RPC
         responde OK; ésta es una mitigación de cliente, NO idempotencia del
         servidor (esa requiere una restricción única en la base de datos). */
      for (const n of nuevas) {
        try {
          const { error } = await sb.rpc('gl_crear_notificacion', {
            p_jugador_id: jid,
            p_torneo_id:  tid,
            p_tipo:       n.tipo,
            p_titulo:     n.titulo,
            p_cuerpo:     n.cuerpo,
            p_link_hash:  n.link_hash || null
          });
          if (!error) {
            const fila = {
              id: 'local_' + Date.now() + '_' + Math.random(),
              jugador_id: jid, torneo_id: tid,
              tipo: n.tipo, titulo: n.titulo, cuerpo: n.cuerpo,
              link_hash: n.link_hash, leida: false,
              created_at: new Date().toISOString(),
              jornada_numero: n.jornada_numero || null,
              sancion_id: n.sancion_id || null,
              dia: n.dia || null
            };
            if (n._clave) Mod._claves.add(n._clave);
            if (n._claveLegado) Mod._claves.add(n._claveLegado);
            Mod._historial.unshift(fila);
            Mod._cache.unshift(fila);
            if (Mod._cache.length > 80) Mod._cache.pop();
            Mod._sinLeer++;
          }
        } catch (e) { console.warn('[Notif] local:', e); }
      }
    },

    /* ── Suscripción Realtime ── */
    _suscribirRealtime() {
      if (!Auth.jugador || Mod._realtime) return;
      Mod._realtime = sb
        .channel('notificaciones_' + Auth.jugador.id)
        .on('postgres_changes', {
          event:  'INSERT',
          schema: 'public',
          table:  'notificaciones',
          filter: 'jugador_id=eq.' + Auth.jugador.id
        }, payload => {
          const nueva = payload.new;
          const clave = _claveNotificacion(nueva);
          const duplicada = (clave && Mod._claves.has(clave)) ||
            !!Mod._cache.find(n => _claveNotificacion(n) === clave && n.id !== nueva.id);
          if (!Mod._cache.find(n => n.id === nueva.id) && !duplicada) {
            if (clave) Mod._claves.add(clave);
            Mod._historial.unshift(nueva);
            Mod._cache.unshift(nueva);
            if (Mod._cache.length > 80) Mod._cache.pop();
            if (!nueva.leida) Mod._sinLeer++;
            Mod._actualizarBadge();
            /* Tocar la vista si está abierta */
            if (Mod._elVista && document.contains(Mod._elVista)) {
              Mod._pintarVista(Mod._elVista);
            }
            /* Mini-toast para notificación entrante */
            const cfg = TIPOS[nueva.tipo] || TIPOS.info;
            GL.notificar('🔔 ' + (nueva.titulo || cfg.label), 'info');
          }
        })
        .subscribe();
    },

    desuscribir() {
      if (Mod._realtime) { sb.removeChannel(Mod._realtime); Mod._realtime = null; }
    },

    /* ── Vista principal ── */
    _pintarVista(el) {
      const lista = Mod._filtrada();
      const sinLeer = Mod._sinLeer;

      el.innerHTML =
        /* Encabezado */
        '<div class="seccion-head">' +
          '<div class="seccion-titulo">' +
            '<h2>' + icono('bell', 20) + ' Notificaciones' +
              (sinLeer > 0
                ? ' <span class="notif-badge-titulo">' + (sinLeer > 99 ? '99+' : sinLeer) + ' nuevas</span>'
                : '') +
            '</h2>' +
            '<p>' + (sinLeer > 0 ? sinLeer + ' sin leer · ' : 'Todo al día · ') +
              Mod._cache.length + ' en total</p>' +
          '</div>' +
          '<div class="seccion-acciones">' +
            (sinLeer > 0
              ? '<button type="button" class="btn sec" id="notif-leer-todo">' +
                  icono('check-check', 16) + 'Marcar todas leídas</button>'
              : '') +
            '<button type="button" class="btn sec" id="notif-eliminar-todas">' +
              icono('trash-2', 16) + 'Limpiar leídas</button>' +
          '</div>' +
        '</div>' +

        /* Filtros */
        '<div class="notif-filtros">' +
          FILTROS.filter(f => GL.esAdmin() || f.id !== 'admin').map(f =>
            '<button type="button" class="notif-filtro-btn' + (Mod._filtro === f.id ? ' activo' : '') +
            '" data-filtro="' + f.id + '">' + esc(f.label) +
            (f.id === 'no_leida' && sinLeer > 0
              ? ' <span class="notif-filtro-cnt">' + sinLeer + '</span>'
              : '') +
            '</button>'
          ).join('') +
        '</div>' +

        /* Lista */
        (lista.length === 0
          ? GL.vacio(
              Mod._filtro === 'no_leida' ? 'No tenés notificaciones sin leer.' : 'No tenés notificaciones todavía.',
              'bell',
              null,
              'Las notificaciones aparecerán aquí cuando haya actividad en tu liga.'
            )
          : '<div class="notif-lista" id="notif-lista">' +
              lista.map(n => _htmlItem(n)).join('') +
            '</div>') +

        /* Aviso Realtime */
        '<div class="notif-realtime-estado" id="notif-realtime-est">' +
          icono('radio', 14) +
          '<span>Actualización en tiempo real ' + (Mod._realtime ? 'activa' : 'inactiva') + '</span>' +
        '</div>';

      iniciarIconos();

      /* Eventos */
      el.querySelectorAll('[data-filtro]').forEach(b =>
        b.addEventListener('click', () => { Mod._filtro = b.dataset.filtro; Mod._pintarVista(el); }));

      el.querySelector('#notif-leer-todo')?.addEventListener('click', () => Mod._marcarTodas(el));

      el.querySelector('#notif-eliminar-todas')?.addEventListener('click', async () => {
        const leidas = Mod._cache.filter(n => n.leida && !String(n.id).startsWith('local_'));
        const borradas = [];
        let error = null;
        for (const n of leidas) {
          const { error: err } = await sb.from('notificaciones').delete().eq('id', n.id);
          if (err) error = error || err;
          else borradas.push(n.id);
        }
        Mod._cache = Mod._cache.filter(n =>
          !n.leida || (!String(n.id).startsWith('local_') && !borradas.includes(n.id)));
        if (error) GL.notificar(GL.mensaje(error, 'guardar', 'las notificaciones'), 'error');
        else if (borradas.length) GL.notificar('Notificaciones leídas eliminadas.', 'exito');
        Mod._pintarVista(el);
      });

      el.querySelectorAll('[data-notif-id]').forEach(item =>
        item.addEventListener('click', async () => {
          const id   = item.dataset.notifId;
          const hash = item.dataset.notifHash;
          if (!(await Mod._marcarLeida(id))) return;
          item.classList.remove('no-leida');
          item.querySelector('.notif-punto')?.remove();
          Mod._actualizarBadge();
          if (hash) location.hash = hash;
        })
      );
    },

    /* ── Filtrar lista según selección ── */
    _filtrada() {
      const c = Mod._cache;
      if (Mod._filtro === 'no_leida')  return c.filter(n => !n.leida);
      if (Mod._filtro === 'admin')     return c.filter(n => TIPOS_ADMIN.has(n.tipo));
      if (Mod._filtro === 'jugador')   return c.filter(n => !TIPOS_ADMIN.has(n.tipo));
      return c;
    },

    /* ── Marcar leídas ── */
    async _marcarLeida(id) {
      if (!id || String(id).startsWith('local_')) return true;
      const { error } = await sb.from('notificaciones').update({ leida: true }).eq('id', id);
      if (error) {
        GL.notificar(GL.mensaje(error, 'guardar', 'la notificación'), 'error');
        return false;
      }
      const n = Mod._cache.find(x => x.id === id);
      if (n && !n.leida) { n.leida = true; Mod._sinLeer = Math.max(0, Mod._sinLeer - 1); }
      return true;
    },

    async _marcarTodas(el) {
      if (!Auth.jugador) return;
      const sinLeer = Mod._cache.filter(n => !n.leida && !String(n.id).startsWith('local_'));
      let error = null;
      for (const n of sinLeer) {
        const { error: err } = await sb.from('notificaciones').update({ leida: true }).eq('id', n.id);
        if (err) error = error || err;
        else n.leida = true;
      }
      Mod._sinLeer = Mod._cache.filter(n => !n.leida).length;
      if (error) GL.notificar(GL.mensaje(error, 'guardar', 'las notificaciones'), 'error');
      Mod._actualizarBadge();
      Mod._pintarVista(el);
    },

    /* ── Badge campana ── */
    _actualizarBadge() {
      const badge = document.getElementById('notif-badge');
      if (!badge) return;
      if (Mod._sinLeer > 0) {
        badge.textContent = Mod._sinLeer > 9 ? '9+' : String(Mod._sinLeer);
        badge.style.display = '';
        badge.setAttribute('aria-label', Mod._sinLeer + ' notificaciones sin leer');
      } else {
        badge.style.display = 'none';
      }
    },

    /* ── Panel flotante desde la campana ── */
    async abrirPanel() {
      if (Mod._panelAbierto) { Mod.cerrarPanel(); return; }
      Mod._panelAbierto = true;

      let panel = document.getElementById('notif-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id        = 'notif-panel';
        panel.className = 'notif-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Panel de notificaciones');
        document.body.appendChild(panel);
      }

      /* Skeleton mientras carga */
      panel.innerHTML =
        '<div class="notif-panel-cabeza">' +
          '<div class="notif-panel-titulo">' + icono('bell', 16) + '<strong>Notificaciones</strong></div>' +
          '<button type="button" class="notif-panel-cerrar" id="notif-panel-cerrar" aria-label="Cerrar">' +
            icono('x', 14) + '</button>' +
        '</div>' +
        '<div class="notif-panel-lista">' + _skeletonPanel() + '</div>';
      panel.style.display = '';
      iniciarIconos();

      await Mod._cargar();
      Mod._actualizarBadge();
      Mod._pintarPanel(panel);

      panel.querySelector('#notif-panel-cerrar')
        ?.addEventListener('click', Mod.cerrarPanel);

      /* Cerrar al hacer click fuera. Un único listener por panel: se retira
         en TODOS los caminos de cierre, no solo en el click externo. */
      setTimeout(() => {
        if (Mod._listenerFuera) document.removeEventListener('click', Mod._listenerFuera);
        const fuera = e => {
          if (!panel.contains(e.target) && !e.target.closest('#btn-notif')) {
            Mod.cerrarPanel();
          }
        };
        Mod._listenerFuera = fuera;
        document.addEventListener('click', fuera);
      }, 120);
    },

    _pintarPanel(panel) {
      const ultimas   = Mod._cache.slice(0, 10);
      const sinLeer   = Mod._sinLeer;
      const lista     = panel.querySelector('.notif-panel-lista');
      if (!lista) return;

      lista.innerHTML =
        (sinLeer > 0
          ? '<div class="notif-panel-acciones">' +
              '<span class="notif-panel-cnt">' + sinLeer + ' sin leer</span>' +
              '<button type="button" class="notif-panel-link" id="notif-p-leer-todo">' +
                icono('check-check', 14) + 'Marcar leídas</button>' +
            '</div>'
          : '<div class="notif-panel-acciones"><span class="notif-panel-cnt verde-txt">Todo al día</span></div>') +
        (ultimas.length
          ? ultimas.map(n => _htmlItem(n, true)).join('')
          : '<div class="notif-panel-vacio">' + icono('bell-off', 24) +
              '<p>Sin notificaciones aún.</p></div>') +
        '<div class="notif-panel-pie">' +
          '<a href="#notificaciones" class="notif-panel-link" id="notif-panel-ver-todas">' +
            icono('arrow-right', 14) + 'Ver todas</a>' +
        '</div>';

      iniciarIconos();

      lista.querySelector('#notif-p-leer-todo')?.addEventListener('click', async () => {
        await Mod._marcarTodas({ querySelector: () => null, querySelectorAll: () => [] });
        Mod._pintarPanel(panel);
        Mod._actualizarBadge();
      });

      lista.querySelector('#notif-panel-ver-todas')?.addEventListener('click', () => {
        Mod.cerrarPanel();
        location.hash = 'notificaciones';
      });

      lista.querySelectorAll('[data-notif-id]').forEach(item =>
        item.addEventListener('click', async () => {
          const id   = item.dataset.notifId;
          const hash = item.dataset.notifHash;
          await Mod._marcarLeida(id);
          Mod._actualizarBadge();
          Mod.cerrarPanel();
          if (hash) location.hash = hash;
        })
      );
    },

    cerrarPanel() {
      Mod._panelAbierto = false;
      if (Mod._listenerFuera) {
        document.removeEventListener('click', Mod._listenerFuera);
        Mod._listenerFuera = null;
      }
      const panel = document.getElementById('notif-panel');
      if (panel) panel.style.display = 'none';
    },

    /* El router invoca destruir() al cambiar de módulo: no debe quedar un
       canal Realtime ni un listener global apuntando a la vista anterior. */
    destruir() {
      Mod.cerrarPanel();
      Mod.desuscribir();
      Mod._elVista = null;
      Mod._badgeCargadoPara = null;
    }
  };

  /* ── Helpers de HTML ─────────────────────────────────────────────── */

  function _htmlItem(n, compacto) {
    const cfg    = TIPOS[n.tipo] || TIPOS.info;
    const fecha  = _formatFecha(n.created_at);
    const noLeida = !n.leida;
    const esAdmin = TIPOS_ADMIN.has(n.tipo);

    return '<div class="notif-item' + (noLeida ? ' no-leida' : '') + (compacto ? ' compacto' : '') + '"' +
      ' data-notif-id="' + esc(n.id) + '"' +
      (n.link_hash ? ' data-notif-hash="' + esc(n.link_hash) + '"' : '') +
      ' role="' + (n.link_hash ? 'button' : 'listitem') + '" tabindex="' + (n.link_hash ? '0' : '-1') + '"' +
      ' style="cursor:' + (n.link_hash ? 'pointer' : 'default') + '">' +

      '<div class="notif-ico-wrap notif-' + esc(cfg.color) + '">' +
        icono(cfg.ico, compacto ? 15 : 18) +
      '</div>' +

      '<div class="notif-contenido">' +
        '<div class="notif-cabeza">' +
          '<span class="notif-titulo">' + esc(n.titulo) + '</span>' +
          '<div class="notif-meta">' +
            (noLeida ? '<span class="notif-punto" aria-label="Sin leer"></span>' : '') +
            (esAdmin ? '<span class="badge neutral" style="font-size:9px;padding:1px 5px">Admin</span>' : '') +
          '</div>' +
        '</div>' +
        '<p class="notif-cuerpo">' + esc(n.cuerpo || '') + '</p>' +
        '<div class="notif-pie-item">' +
          '<span class="notif-tipo-label">' + icono(cfg.ico, 11) + esc(cfg.label) + '</span>' +
          '<span class="notif-fecha">' + esc(fecha) + '</span>' +
        '</div>' +
      '</div>' +

      (n.link_hash ? '<div class="notif-flecha">' + icono('chevron-right', 14) + '</div>' : '') +
    '</div>';
  }

  function _skeletonNotif() {
    let out = '<div class="skeleton-wrap">';
    out += '<div class="skeleton" style="width:38%;height:24px;border-radius:6px;margin-bottom:6px"></div>';
    out += '<div class="skeleton" style="width:22%;height:13px;border-radius:4px;margin-bottom:20px"></div>';
    for (let i = 0; i < 5; i++) {
      out += '<div class="notif-item" style="pointer-events:none;animation-delay:' + (i*.07) + 's">' +
        '<div class="notif-ico-wrap skeleton" style="width:40px;height:40px;border-radius:50%"></div>' +
        '<div class="notif-contenido">' +
          '<div class="skeleton" style="width:55%;height:14px;border-radius:4px;margin-bottom:6px"></div>' +
          '<div class="skeleton" style="width:85%;height:11px;border-radius:4px;margin-bottom:4px"></div>' +
          '<div class="skeleton" style="width:30%;height:10px;border-radius:4px"></div>' +
        '</div></div>';
    }
    return out + '</div>';
  }

  function _skeletonPanel() {
    let out = '';
    for (let i = 0; i < 4; i++) {
      out += '<div class="notif-item compacto" style="pointer-events:none">' +
        '<div class="notif-ico-wrap skeleton" style="width:34px;height:34px;border-radius:50%"></div>' +
        '<div class="notif-contenido">' +
          '<div class="skeleton" style="width:60%;height:12px;border-radius:4px;margin-bottom:5px"></div>' +
          '<div class="skeleton" style="width:80%;height:10px;border-radius:4px"></div>' +
        '</div></div>';
    }
    return out;
  }

  function _formatFecha(iso) {
    if (!iso) return '';
    try {
      const d    = new Date(iso);
      const diff = Math.floor((Date.now() - d) / 1000);
      if (diff < 60)    return 'Hace un momento';
      if (diff < 3600)  return 'Hace ' + Math.floor(diff / 60) + ' min';
      if (diff < 86400) return 'Hace ' + Math.floor(diff / 3600) + ' h';
      if (diff < 172800) return 'Ayer';
      return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short' });
    } catch (e) { return ''; }
  }

  /* ── Función global para crear notificaciones desde otros módulos ── */
  window.GL_notificarUsuario = async function(jugadorId, torneoId, tipo, titulo, cuerpo, linkHash) {
    if (!sb || !jugadorId) return;
    try {
      await sb.rpc('gl_crear_notificacion', {
        p_jugador_id: jugadorId,
        p_torneo_id:  torneoId || null,
        p_tipo:       tipo     || 'info',
        p_titulo:     titulo   || '',
        p_cuerpo:     cuerpo   || '',
        p_link_hash:  linkHash || null
      });
    } catch (e) { console.warn('[Notif global]', e); }
  };

  Mod._pruebas = {
    clave: _claveNotificacion,
    jornadaDe: _jornadaDeNotificacion,
    dedup: _dedupHistorial
  };

  Modulos.notificaciones = Mod;
  window.Notificaciones  = Mod;
})();