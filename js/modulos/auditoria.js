/* =====================================================================
   MÓDULO — Historial y auditoría administrativa
   Exclusivo del administrador.
   También expone GL.auditoria.registrar() para que otros módulos logueen.
   ===================================================================== */
(function () {

  // ── Configuración de acciones ─────────────────────────────────────
  const ACCIONES = {
    resultado_ingresado:   { ico: 'clipboard-check', color: 'green',   label: 'Resultado ingresado'    },
    resultado_corregido:   { ico: 'pencil',          color: 'gold',    label: 'Resultado corregido'    },
    sancion_aplicada:      { ico: 'alert-triangle',  color: 'orange',  label: 'Sanción aplicada'       },
    jugador_estado_cambio: { ico: 'user-cog',        color: 'orange',  label: 'Estado de jugador'      },
    jugador_grupo_cambio:  { ico: 'shuffle',         color: 'blue',    label: 'Cambio de grupo'        },
    jornada_abierta:       { ico: 'flag',            color: 'green',   label: 'Jornada abierta'        },
    jornada_cerrada:       { ico: 'lock',            color: 'neutral', label: 'Jornada cerrada'        },
    torneo_creado:         { ico: 'trophy',          color: 'gold',    label: 'Torneo creado'          },
    torneo_finalizado:     { ico: 'archive',         color: 'neutral', label: 'Torneo finalizado'      },
    eliminatoria_cambio:   { ico: 'git-merge',       color: 'blue',    label: 'Eliminatoria modificada'}
  };

  // ── Estado del módulo ─────────────────────────────────────────────
  const Mod = {
    titulo: 'Auditoría',
    _filtroAccion: '',
    _filtroJugador: '',
    _pagina: 0,
    _POR_PAG: 30,

    async render(el) {
      if (!GL.esAdmin()) { el.innerHTML = GL.accesoDenegado('admin'); iniciarIconos(); return; }
      el.innerHTML = GL.skeleton(6);
      const { registros, total } = await Mod._cargar();
      Mod._pintar(el, registros, total);
    },

    async _cargar() {
      let q = sb.from('auditoria')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(Mod._pagina * Mod._POR_PAG, (Mod._pagina + 1) * Mod._POR_PAG - 1);

      if (GL.torneo()) q = q.eq('torneo_id', GL.torneo().id);
      if (Mod._filtroAccion)   q = q.eq('accion', Mod._filtroAccion);

      const { data, error, count } = await q;
      if (error) { GL.notificar('No se pudo cargar la auditoría.', 'error'); return { registros: [], total: 0 }; }
      return { registros: data || [], total: count || 0 };
    },

    _pintar(el, registros, total) {
      const totalPags = Math.ceil(total / Mod._POR_PAG);

      el.innerHTML =
        '<div class="seccion-head">' +
          '<div class="seccion-titulo"><h2>Auditoría</h2>' +
            '<p>' + total + ' registro' + (total !== 1 ? 's' : '') + ' en este torneo</p></div>' +
          '<div class="seccion-acciones">' +
            '<select class="input" id="aud-filtro-accion" style="min-width:200px">' +
              '<option value="">Todas las acciones</option>' +
              Object.entries(ACCIONES).map(([k, v]) =>
                '<option value="' + k + '"' + (Mod._filtroAccion === k ? ' selected' : '') + '>' + v.label + '</option>'
              ).join('') +
            '</select>' +
            '<button type="button" class="btn sec" id="aud-exportar">' + icono('download', 15) + 'Exportar CSV</button>' +
          '</div>' +
        '</div>' +

        (registros.length === 0
          ? GL.vacio('No hay registros de auditoría todavía.', 'shield-check', null)
          : '<div class="card" style="overflow-x:auto"><table class="tabla-base">' +
              '<thead><tr>' +
                '<th>Fecha</th><th>Acción</th><th>Detalle</th>' +
                '<th>Entidad</th><th>Realizado por</th>' +
              '</tr></thead>' +
              '<tbody>' +
              registros.map(r => Mod._htmlFila(r)).join('') +
              '</tbody></table></div>') +

        (totalPags > 1
          ? '<div class="paginacion">' +
            (Mod._pagina > 0
              ? '<button type="button" class="btn sec" id="aud-ant">' + icono('chevron-left', 15) + 'Anterior</button>'
              : '') +
            '<span class="paginacion-info">Página ' + (Mod._pagina + 1) + ' de ' + totalPags + '</span>' +
            (Mod._pagina < totalPags - 1
              ? '<button type="button" class="btn sec" id="aud-sig">Siguiente ' + icono('chevron-right', 15) + '</button>'
              : '') +
          '</div>'
          : '');

      iniciarIconos();

      // Filtro por acción
      el.querySelector('#aud-filtro-accion')?.addEventListener('change', e => {
        Mod._filtroAccion = e.target.value;
        Mod._pagina = 0;
        Mod.render(el);
      });

      // Paginación
      el.querySelector('#aud-ant')?.addEventListener('click', () => { Mod._pagina--; Mod.render(el); });
      el.querySelector('#aud-sig')?.addEventListener('click', () => { Mod._pagina++; Mod.render(el); });

      // Exportar CSV
      el.querySelector('#aud-exportar')?.addEventListener('click', () => Mod._exportarCSV(registros));

      // Click en fila para ver detalle completo
      el.querySelectorAll('[data-aud-id]').forEach(tr => {
        tr.addEventListener('click', () => Mod._modalDetalle(tr.dataset.audId, registros));
      });
    },

    _htmlFila(r) {
      const cfg    = ACCIONES[r.accion] || { ico: 'activity', color: 'neutral', label: r.accion };
      const fecha  = Mod._formatFecha(r.created_at);
      const quien  = Mod._nombreAdmin(r.realizado_por);
      const titulo = Mod._tituloDetalle(r);

      return '<tr data-aud-id="' + esc(r.id) + '" style="cursor:pointer">' +
        '<td style="white-space:nowrap;font-size:12px;color:var(--text-secondary)">' + esc(fecha) + '</td>' +
        '<td><span class="badge ' + esc(cfg.color) + '">' + icono(cfg.ico, 13) + esc(cfg.label) + '</span></td>' +
        '<td style="max-width:260px">' + esc(titulo) + '</td>' +
        '<td><span class="badge neutral" style="font-size:11px">' + esc(r.entidad_tipo) + '</span></td>' +
        '<td style="font-size:13px">' + esc(quien) + '</td>' +
      '</tr>';
    },

    _tituloDetalle(r) {
      const d = r.detalle || {};
      switch (r.accion) {
        case 'resultado_ingresado':
          return (d.local || '?') + ' ' + (d.goles_local ?? '?') + '-' + (d.goles_visitante ?? '?') + ' ' + (d.visitante || '?');
        case 'resultado_corregido':
          return (d.local || '?') + ': ' + (d.anterior || '?') + ' → ' + (d.nuevo || '?');
        case 'sancion_aplicada':
          return (d.jugador || '?') + ' · ' + (d.tipo || '?') + (d.motivo ? ' — ' + d.motivo.slice(0, 50) : '');
        case 'jugador_estado_cambio':
          return (d.jugador || '?') + ': ' + (d.estado_anterior || '?') + ' → ' + (d.estado_nuevo || '?');
        case 'jugador_grupo_cambio':
          return (d.jugador || '?') + ': ' + (d.grupo_anterior || '?') + ' → ' + (d.grupo_nuevo || '?');
        case 'jornada_abierta':
        case 'jornada_cerrada':
          return 'Jornada ' + (d.numero || '?') + (d.grupo ? ' · ' + d.grupo : '');
        case 'torneo_creado':
        case 'torneo_finalizado':
          return d.nombre || d.temporada || '?';
        case 'eliminatoria_cambio':
          return (d.descripcion || 'Cambio en cruce');
        default:
          return JSON.stringify(d).slice(0, 80);
      }
    },

    _modalDetalle(id, registros) {
      const r = registros.find(x => x.id === id);
      if (!r) return;
      const cfg = ACCIONES[r.accion] || { ico: 'activity', color: 'neutral', label: r.accion };
      const d   = r.detalle || {};

      GL.abrirModal({
        titulo: cfg.label,
        cuerpo:
          '<div class="audit-detalle">' +
            '<div class="audit-det-fila"><span>Fecha</span><strong>' + esc(Mod._formatFechaCompleta(r.created_at)) + '</strong></div>' +
            '<div class="audit-det-fila"><span>Acción</span><span class="badge ' + esc(cfg.color) + '">' + icono(cfg.ico, 13) + esc(cfg.label) + '</span></div>' +
            '<div class="audit-det-fila"><span>Entidad</span><strong>' + esc(r.entidad_tipo) + (r.entidad_id ? ' · ' + r.entidad_id.slice(0,8) + '…' : '') + '</strong></div>' +
            '<div class="audit-det-fila"><span>Realizado por</span><strong>' + esc(Mod._nombreAdmin(r.realizado_por)) + '</strong></div>' +
            '<div class="audit-det-sep"></div>' +
            Object.entries(d).map(([k, v]) =>
              '<div class="audit-det-fila"><span>' + esc(k.replace(/_/g, ' ')) + '</span><strong>' + esc(String(v)) + '</strong></div>'
            ).join('') +
          '</div>',
        acciones: '<button type="button" class="btn" data-cerrar>Cerrar</button>'
      });
      iniciarIconos();
    },

    _nombreAdmin(uid) {
      if (!uid) return 'Sistema';
      const j = GL.ctx.jugadores.find(x => x.user_id === uid);
      return j ? j.nombre_usuario : uid.slice(0, 8) + '…';
    },

    _formatFecha(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short' }) +
               ' ' + d.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
      } catch (e) { return iso; }
    },

    _formatFechaCompleta(iso) {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleString('es-NI', {
          day: '2-digit', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
      } catch (e) { return iso; }
    },

    _exportarCSV(registros) {
      const cab = ['Fecha', 'Accion', 'Entidad', 'Detalle', 'Realizado por'];
      const filas = registros.map(r => [
        Mod._formatFechaCompleta(r.created_at),
        r.accion,
        r.entidad_tipo,
        Mod._tituloDetalle(r),
        Mod._nombreAdmin(r.realizado_por)
      ]);
      const csv = [cab, ...filas].map(f => f.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'auditoria-goats-' + new Date().toISOString().slice(0,10) + '.csv';
      a.click(); URL.revokeObjectURL(url);
    }
  };

  // ── API pública: GL.auditoria.registrar() ─────────────────────────
  // Llaman a este método todos los módulos después de cada operación crítica.
  GL.auditoria = {
    async registrar(accion, entidadTipo, entidadId, detalle) {
      if (!Auth.jugador || !GL.esAdmin()) return;
      try {
        await sb.rpc('gl_registrar_auditoria', {
          p_torneo_id:     GL.torneoId() || null,
          p_accion:        accion,
          p_entidad_tipo:  entidadTipo,
          p_entidad_id:    entidadId || null,
          p_realizado_por: (await sb.auth.getUser()).data.user.id,
          p_detalle:       detalle || {}
        });
      } catch (e) {
        console.warn('[auditoria]', e.message);
        // Fallo silencioso: la operación principal ya se hizo
      }
    }
  };

  Modulos.auditoria = Mod;
})();