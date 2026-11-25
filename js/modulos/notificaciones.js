/* =====================================================================
   MÓDULO — Centro de notificaciones
   Muestra notificaciones persistentes por jugador.
   También genera notificaciones desde el contexto local (sin servidor).
   ===================================================================== */
(function () {

  // ── Configuración de tipos ────────────────────────────────────────
  const TIPOS = {
    partido_proximo:        { ico: 'calendar',       color: 'blue',    label: 'Próximo partido'          },
    jornada_abierta:        { ico: 'flag',            color: 'green',   label: 'Jornada abierta'          },
    resultado_registrado:   { ico: 'check-circle-2',  color: 'green',   label: 'Resultado registrado'     },
    clasificacion_cambio:   { ico: 'bar-chart-2',    color: 'gold',    label: 'Tabla actualizada'        },
    sancion_aplicada:       { ico: 'alert-triangle', color: 'orange',  label: 'Sanción aplicada'         },
    suspension:             { ico: 'user-x',         color: 'red',     label: 'Suspensión'               },
    partido_vence_hoy:      { ico: 'clock',          color: 'orange',  label: 'Partido vence hoy'        },
    jornada_cerrada:        { ico: 'lock',           color: 'neutral', label: 'Jornada cerrada'          },
    clasifica_eliminatorias:{ ico: 'trophy',         color: 'gold',    label: '¡Clasificado!'            }
  };

  // ── Estado del módulo ─────────────────────────────────────────────
  const Mod = {
    titulo: 'Notificaciones',
    _panelAbierto: false,
    _cache: [],
    _sinLeer: 0,

    async render(el) {
      if (!Auth.usuario) {
        el.innerHTML = GL.accesoDenegado('jugador');
        iniciarIconos(); return;
      }
      el.innerHTML = GL.skeleton(5);
      await Mod._cargar();
      Mod._pintarVista(el);
    },

    // Carga notificaciones desde Supabase
    async _cargar() {
      if (!Auth.jugador) return;
      const { data, error } = await sb.from('notificaciones')
        .select('*')
        .eq('jugador_id', Auth.jugador.id)
        .order('created_at', { ascending: false })
        .limit(60);
      if (!error && data) {
        Mod._cache    = data;
        Mod._sinLeer  = data.filter(n => !n.leida).length;
      }
      // Generar notificaciones del contexto local que no estén ya registradas
      await Mod._generarLocales();
    },

    // Genera notificaciones a partir del contexto GL (sin llamadas extra)
    async _generarLocales() {
      if (!Auth.jugador || !GL.torneo()) return;
      const jid = Auth.jugador.id;
      const tid = GL.torneo().id;
      const ahora = new Date();
      const hoy   = ahora.toISOString().slice(0, 10);
      const nuevas = [];

      // ── Jornada abierta ──────────────────────────────────────────
      const jornadaActual = GL.jornadaActual();
      if (jornadaActual) {
        const yaExiste = Mod._cache.some(n =>
          n.tipo === 'jornada_abierta' && n.cuerpo.includes('Jornada ' + jornadaActual.numero));
        if (!yaExiste) {
          nuevas.push({
            tipo: 'jornada_abierta',
            titulo: 'Nueva jornada abierta',
            cuerpo: 'Jornada ' + jornadaActual.numero + ' está disponible. Coordiná tu partido.',
            link_hash: 'fixture'
          });
        }
      }

      // ── Sanciones aplicadas ──────────────────────────────────────
      const misSanciones = GL.ctx.sanciones.filter(s => s.jugador_id === jid);
      misSanciones.forEach(s => {
        const yaExiste = Mod._cache.some(n =>
          n.tipo === 'sancion_aplicada' && n.created_at && n.created_at.startsWith(s.created_at ? s.created_at.slice(0,10) : hoy));
        if (!yaExiste) {
          const cfg = s.tipo === 'grave' || s.tipo === 'muy_grave' ? 'suspension' : 'sancion_aplicada';
          nuevas.push({
            tipo: cfg,
            titulo: cfg === 'suspension' ? 'Suspensión aplicada' : 'Sanción aplicada',
            cuerpo: 'Motivo: ' + (s.motivo || 'Sin detalle') +
              (s.puntos_descuento ? '. Descuento: -' + s.puntos_descuento + ' pts.' : '') +
              (s.partidos_suspension ? ' Suspendido ' + s.partidos_suspension + ' partido(s).' : ''),
            link_hash: 'perfil'
          });
        }
      });

      // ── Próximo partido ──────────────────────────────────────────
      if (jornadaActual) {
        // GL.ctx no contiene partidos: se consultan bajo demanda (Tabla de posiciones los usa igual).
        const partidos = await GL.partidos({ torneo_id: tid, jornada: jornadaActual.numero });
        const proximo = partidos.find(p =>
          p.estado === 'pendiente' &&
          (p.local_id === jid || p.visitante_id === jid));
        if (proximo) {
          const rival = GL.nombreJugador(proximo.local_id === jid ? proximo.visitante_id : proximo.local_id);
          const yaExiste = Mod._cache.some(n =>
            n.tipo === 'partido_proximo' && n.cuerpo.includes(rival) &&
            n.created_at && n.created_at.startsWith(hoy));
          if (!yaExiste) {
            nuevas.push({
              tipo: 'partido_proximo',
              titulo: 'Tu partido de hoy',
              cuerpo: 'Jornada ' + jornadaActual.numero + ' — vs ' + rival +
                '. Recordá coordinar el horario.',
              link_hash: 'fixture'
            });
          }
        }
      }

      // ── Clasificación a eliminatorias ────────────────────────────
      const pos = GL.posicion(jid);
      if (pos && pos <= 6) {
        const yaExiste = Mod._cache.some(n => n.tipo === 'clasifica_eliminatorias');
        if (!yaExiste) {
          nuevas.push({
            tipo: 'clasifica_eliminatorias',
            titulo: '¡Estás clasificado!',
            cuerpo: 'Ocupás la posición ' + pos + ' — clasificás directamente a eliminatorias. Seguí así.',
            link_hash: 'eliminatorias'
          });
        }
      }

      // ── Guardar nuevas en Supabase ───────────────────────────────
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
        } catch (e) { console.warn('notif:', e); }
      }
    },

    // Dibuja la vista principal del módulo
    _pintarVista(el) {
      const total    = Mod._cache.length;
      const sinLeer  = Mod._sinLeer;
      const noPendientes = total === 0;

      el.innerHTML =
        '<div class="seccion-head">' +
          '<div class="seccion-titulo"><h2>Notificaciones</h2>' +
            '<p>' + (sinLeer > 0 ? sinLeer + ' sin leer' : 'Todo al día') + '</p></div>' +
          (sinLeer > 0
            ? '<div class="seccion-acciones"><button type="button" class="btn sec" id="notif-leer-todo">' +
              icono('check-check', 15) + 'Marcar todas como leídas</button></div>'
            : '') +
        '</div>' +
        (noPendientes
          ? GL.vacio('No tenés notificaciones todavía.', 'bell', null)
          : '<div class="notif-lista" id="notif-lista">' +
            Mod._cache.map(n => Mod._htmlItem(n)).join('') +
          '</div>');

      iniciarIconos();

      // Marcar todas
      el.querySelector('#notif-leer-todo')?.addEventListener('click', () => Mod._marcarTodas(el));

      // Click en ítem: marcar como leída + navegar
      el.querySelectorAll('[data-notif-id]').forEach(item => {
        item.addEventListener('click', async () => {
          const id = item.dataset.notifId;
          const hash = item.dataset.notifHash;
          await Mod._marcarLeida(id);
          item.classList.remove('no-leida');
          item.querySelector('.notif-punto')?.remove();
          Mod._actualizarBadge();
          if (hash) location.hash = hash;
        });
      });
    },

    _htmlItem(n) {
      const cfg     = TIPOS[n.tipo] || { ico: 'bell', color: 'neutral', label: n.tipo };
      const fecha   = Mod._formatFecha(n.created_at);
      const sinLeer = !n.leida;

      return '<div class="notif-item' + (sinLeer ? ' no-leida' : '') + '"' +
        ' data-notif-id="' + esc(n.id) + '"' +
        (n.link_hash ? ' data-notif-hash="' + esc(n.link_hash) + '"' : '') +
        ' style="cursor:' + (n.link_hash ? 'pointer' : 'default') + '">' +
        '<div class="notif-ico-wrap badge ' + esc(cfg.color) + '">' + icono(cfg.ico, 16) + '</div>' +
        '<div class="notif-contenido">' +
          '<div class="notif-cabeza">' +
            '<span class="notif-titulo">' + esc(n.titulo) + '</span>' +
            (sinLeer ? '<span class="notif-punto"></span>' : '') +
          '</div>' +
          '<p class="notif-cuerpo">' + esc(n.cuerpo) + '</p>' +
          '<span class="notif-fecha">' + esc(cfg.label) + ' · ' + esc(fecha) + '</span>' +
        '</div>' +
      '</div>';
    },

    async _marcarLeida(id) {
      if (!id || id.startsWith('local_')) return;
      await sb.from('notificaciones').update({ leida: true }).eq('id', id);
      const n = Mod._cache.find(x => x.id === id);
      if (n && !n.leida) { n.leida = true; Mod._sinLeer = Math.max(0, Mod._sinLeer - 1); }
    },

    async _marcarTodas(el) {
      if (!Auth.jugador) return;
      const sinLeer = Mod._cache.filter(n => !n.leida && !n.id.startsWith('local_'));
      for (const n of sinLeer) {
        await sb.from('notificaciones').update({ leida: true }).eq('id', n.id);
        n.leida = true;
      }
      Mod._sinLeer = 0;
      Mod._actualizarBadge();
      Mod._pintarVista(el);
    },

    _formatFecha(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        const ahora = new Date();
        const diff  = Math.floor((ahora - d) / 1000);
        if (diff < 60)   return 'Hace un momento';
        if (diff < 3600) return 'Hace ' + Math.floor(diff / 60) + ' min';
        if (diff < 86400) return 'Hace ' + Math.floor(diff / 3600) + ' h';
        return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short' });
      } catch (e) { return ''; }
    },

    // Actualiza el badge de la campana en el header
    _actualizarBadge() {
      const badge = document.getElementById('notif-badge');
      if (!badge) return;
      if (Mod._sinLeer > 0) {
        badge.textContent = Mod._sinLeer > 9 ? '9+' : Mod._sinLeer;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    },

    // Panel flotante desde la campana del header
    async abrirPanel() {
      if (Mod._panelAbierto) { Mod.cerrarPanel(); return; }
      Mod._panelAbierto = true;
      let panel = document.getElementById('notif-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'notif-panel';
        panel.className = 'notif-panel';
        document.body.appendChild(panel);
      }
      panel.innerHTML = '<div class="notif-panel-cabeza">' +
        icono('bell', 16) + '<strong>Notificaciones</strong>' +
        '<button type="button" class="notif-panel-cerrar" id="notif-panel-cerrar">' + icono('x', 14) + '</button>' +
        '</div>' +
        '<div class="notif-panel-lista"><div class="notif-cargando">' +
          icono('loader-circle', 18, 'girando') + ' Cargando…</div></div>';
      panel.style.display = '';
      iniciarIconos();

      panel.querySelector('#notif-panel-cerrar').addEventListener('click', Mod.cerrarPanel);

      await Mod._cargar();
      Mod._actualizarBadge();

      const lista = panel.querySelector('.notif-panel-lista');
      if (!Mod._cache.length) {
        lista.innerHTML = '<p class="notif-vacio">Sin notificaciones aún.</p>';
      } else {
        lista.innerHTML = Mod._cache.slice(0, 8).map(n => Mod._htmlItem(n)).join('');
        iniciarIconos();
        lista.querySelectorAll('[data-notif-id]').forEach(item => {
          item.addEventListener('click', async () => {
            const id   = item.dataset.notifId;
            const hash = item.dataset.notifHash;
            await Mod._marcarLeida(id);
            Mod._actualizarBadge();
            Mod.cerrarPanel();
            if (hash) location.hash = hash;
          });
        });
      }

      // Cerrar al clickear fuera
      setTimeout(() => {
        const fuera = e => {
          if (!panel.contains(e.target) && !e.target.closest('#btn-notif')) {
            Mod.cerrarPanel();
            document.removeEventListener('click', fuera);
          }
        };
        document.addEventListener('click', fuera);
      }, 100);
    },

    cerrarPanel() {
      Mod._panelAbierto = false;
      const panel = document.getElementById('notif-panel');
      if (panel) panel.style.display = 'none';
    }
  };

  Modulos.notificaciones = Mod;
  window.Notificaciones  = Mod;
})();