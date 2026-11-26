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

  /* ── Estado del módulo ──────────────────────────────────────────── */
  const Mod = {
    titulo: 'Notificaciones',
    _panelAbierto: false,
    _cache:    [],
    _sinLeer:  0,
    _filtro:   'todas',
    _realtime: null,
    _elVista:  null,

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

    /* ── Carga desde Supabase ── */
    async _cargar() {
      if (!Auth.jugador) return;
      const { data, error } = await sb.from('notificaciones')
        .select('*')
        .eq('jugador_id', Auth.jugador.id)
        .order('created_at', { ascending: false })
        .limit(80);
      if (!error && data) {
        Mod._cache   = data;
        Mod._sinLeer = data.filter(n => !n.leida).length;
      } else if (error) {
        console.warn('[Notif] carga:', error.message);
      }
      await Mod._generarLocales();
    },

    /* ── Genera notificaciones desde el contexto GL ── */
    async _generarLocales() {
      if (!Auth.jugador || !GL.torneo()) return;
      const jid  = Auth.jugador.id;
      const tid  = GL.torneo().id;
      const hoy  = new Date().toISOString().slice(0, 10);
      const nuevas = [];

      /* Jornada abierta */
      const jornadaActual = GL.jornadaActual();
      if (jornadaActual) {
        const ya = Mod._cache.some(n =>
          n.tipo === 'jornada_abierta' &&
          (n.cuerpo || '').includes('Jornada ' + jornadaActual.numero));
        if (!ya) nuevas.push({
          tipo: 'jornada_abierta',
          titulo: 'Jornada ' + jornadaActual.numero + ' abierta',
          cuerpo: 'Tu jornada ' + jornadaActual.numero + ' se encuentra abierta. Consultá tus partidos y coordiná con tu rival.',
          link_hash: 'fixture'
        });
      }

      /* Sanciones */
      const misSanciones = (GL.ctx.sanciones || []).filter(s => s.jugador_id === jid);
      misSanciones.forEach(s => {
        const ya = Mod._cache.some(n =>
          (n.tipo === 'sancion_aplicada' || n.tipo === 'suspension') &&
          (n.cuerpo || '').includes(s.id || s.motivo || ''));
        if (!ya) {
          const grave = s.tipo === 'grave' || s.tipo === 'muy_grave';
          nuevas.push({
            tipo: grave ? 'suspension' : 'sancion_aplicada',
            titulo: grave ? 'Suspensión aplicada' : 'Sanción aplicada',
            cuerpo: (s.motivo || 'Sin detalle') +
              (s.puntos_descuento ? ' · Descuento: -' + s.puntos_descuento + ' pts' : '') +
              (s.partidos_suspension ? ' · Suspendido ' + s.partidos_suspension + ' partido(s).' : ''),
            link_hash: 'perfil'
          });
        }
      });

      /* Clasificación a eliminatorias */
      const pos = GL.posicion ? GL.posicion(jid) : null;
      if (pos && pos <= 6) {
        const ya = Mod._cache.some(n => n.tipo === 'clasifica_eliminatorias');
        if (!ya) nuevas.push({
          tipo: 'clasifica_eliminatorias',
          titulo: '¡Estás clasificado!',
          cuerpo: 'Ocupás la posición ' + pos + ' — clasificás directamente a eliminatorias. ¡Seguí así!',
          link_hash: 'eliminatorias'
        });
      }

      /* ── Alertas admin ── */
      if (GL.esAdmin()) {
        /* Jugadores sin grupo */
        const sinGrupo = GL.jugadoresSinGrupo ? GL.jugadoresSinGrupo() : [];
        if (sinGrupo.length) {
          const ya = Mod._cache.some(n =>
            n.tipo === 'perfil_pendiente' && (n.cuerpo||'').includes('sin grupo') &&
            (n.created_at||'').startsWith(hoy));
          if (!ya) nuevas.push({
            tipo: 'perfil_pendiente',
            titulo: sinGrupo.length + ' jugador(es) sin grupo',
            cuerpo: sinGrupo.length + ' jugador(es) están registrados pero sin grupo asignado. Asignalos desde Administración.',
            link_hash: 'administracion'
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
          const ya = Mod._cache.some(n =>
            n.tipo === 'jornada_por_cerrar' && (n.created_at||'').startsWith(hoy));
          if (!ya) nuevas.push({
            tipo: 'jornada_por_cerrar',
            titulo: 'Jornada(s) lista(s) para cerrar',
            cuerpo: 'Las jornadas ' + listasParaCerrar.join(', ') + ' tienen todos sus partidos resueltos. Podés cerrarlas.',
            link_hash: 'jornadas'
          });
        }
      }

      /* Guardar en Supabase */
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
            Mod._cache.unshift({
              id: 'local_' + Date.now() + '_' + Math.random(),
              jugador_id: jid, torneo_id: tid,
              tipo: n.tipo, titulo: n.titulo, cuerpo: n.cuerpo,
              link_hash: n.link_hash, leida: false,
              created_at: new Date().toISOString()
            });
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
          if (!Mod._cache.find(n => n.id === nueva.id)) {
            Mod._cache.unshift(nueva);
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
        for (const n of leidas) await sb.from('notificaciones').delete().eq('id', n.id);
        Mod._cache = Mod._cache.filter(n => !n.leida);
        GL.notificar('Notificaciones leídas eliminadas.', 'exito');
        Mod._pintarVista(el);
      });

      el.querySelectorAll('[data-notif-id]').forEach(item =>
        item.addEventListener('click', async () => {
          const id   = item.dataset.notifId;
          const hash = item.dataset.notifHash;
          await Mod._marcarLeida(id);
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
      if (!id || String(id).startsWith('local_')) return;
      await sb.from('notificaciones').update({ leida: true }).eq('id', id);
      const n = Mod._cache.find(x => x.id === id);
      if (n && !n.leida) { n.leida = true; Mod._sinLeer = Math.max(0, Mod._sinLeer - 1); }
    },

    async _marcarTodas(el) {
      if (!Auth.jugador) return;
      const sinLeer = Mod._cache.filter(n => !n.leida && !String(n.id).startsWith('local_'));
      for (const n of sinLeer) {
        await sb.from('notificaciones').update({ leida: true }).eq('id', n.id);
        n.leida = true;
      }
      Mod._sinLeer = 0;
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

      /* Cerrar al hacer click fuera */
      setTimeout(() => {
        const fuera = e => {
          if (!panel.contains(e.target) && !e.target.closest('#btn-notif')) {
            Mod.cerrarPanel();
            document.removeEventListener('click', fuera);
          }
        };
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
      const panel = document.getElementById('notif-panel');
      if (panel) panel.style.display = 'none';
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

  Modulos.notificaciones = Mod;
  window.Notificaciones  = Mod;
})();