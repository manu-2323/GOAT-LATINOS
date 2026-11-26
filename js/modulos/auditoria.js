/* =====================================================================
   MÓDULO — Auditoría y actividad administrativa
   Solo para administradores autorizados.
   Los registros son inmutables desde la interfaz.
   También expone GL.auditoria.registrar() para todos los módulos.
   ===================================================================== */
(function () {

  /* ── Catálogo de acciones ─────────────────────────────────────────── */
  const ACCIONES = {
    resultado_ingresado:    { ico: 'clipboard-check',  color: 'green',   label: 'Resultado ingresado'     },
    resultado_corregido:    { ico: 'pencil',           color: 'gold',    label: 'Resultado corregido'     },
    sancion_aplicada:       { ico: 'triangle-alert',   color: 'orange',  label: 'Sanción aplicada'        },
    sancion_modificada:     { ico: 'edit-3',           color: 'orange',  label: 'Sanción modificada'      },
    sancion_eliminada:      { ico: 'trash-2',          color: 'red',     label: 'Sanción eliminada'       },
    expulsion_jugador:      { ico: 'user-x',           color: 'red',     label: 'Expulsión'               },
    jugador_estado_cambio:  { ico: 'user-cog',         color: 'orange',  label: 'Estado de jugador'       },
    jugador_grupo_cambio:   { ico: 'shuffle',          color: 'blue',    label: 'Cambio de grupo'         },
    jugador_registrado:     { ico: 'user-plus',        color: 'green',   label: 'Jugador registrado'      },
    admin_asignado:         { ico: 'shield-plus',      color: 'gold',    label: 'Admin asignado'          },
    admin_removido:         { ico: 'shield-minus',     color: 'red',     label: 'Admin removido'          },
    jornada_abierta:        { ico: 'flag',             color: 'green',   label: 'Jornada abierta'         },
    jornada_cerrada:        { ico: 'lock',             color: 'neutral', label: 'Jornada cerrada'         },
    torneo_creado:          { ico: 'trophy',           color: 'gold',    label: 'Torneo creado'           },
    temporada_creada:       { ico: 'calendar-plus',    color: 'gold',    label: 'Temporada creada'        },
    torneo_finalizado:      { ico: 'archive',          color: 'neutral', label: 'Torneo finalizado'       },
    eliminatoria_cambio:    { ico: 'git-merge',        color: 'blue',    label: 'Eliminatoria modificada' },
    clasificacion_manual:   { ico: 'bar-chart-2',      color: 'blue',    label: 'Clasificación manual'    },
    config_modificada:      { ico: 'settings-2',       color: 'orange',  label: 'Configuración editada'   },
    fixture_generado:       { ico: 'calendar',         color: 'green',   label: 'Fixture generado'        },
    grupo_modificado:       { ico: 'layers',           color: 'blue',    label: 'Grupo modificado'        },
  };

  /* ── Grupos de acciones para filtro rápido ── */
  const GRUPOS_ACCION = {
    'Resultados':    ['resultado_ingresado','resultado_corregido'],
    'Disciplina':    ['sancion_aplicada','sancion_modificada','sancion_eliminada','expulsion_jugador'],
    'Jugadores':     ['jugador_registrado','jugador_estado_cambio','jugador_grupo_cambio'],
    'Torneos':       ['torneo_creado','temporada_creada','torneo_finalizado','jornada_abierta','jornada_cerrada'],
    'Administración':['admin_asignado','admin_removido','config_modificada','fixture_generado'],
  };

  /* ── Estado ─────────────────────────────────────────────────────── */
  const Mod = {
    titulo: 'Auditoría',
    _filtroAccion:   '',
    _filtroGrupo:    '',
    _filtroJugador:  '',
    _filtroFechaDesde: '',
    _filtroFechaHasta: '',
    _busqueda:       '',
    _pagina:          0,
    _POR_PAG:        25,
    _total:           0,
    _registros:      [],
    _todosAdmins:    [],

    async render(el) {
      if (!GL.esAdmin()) { el.innerHTML = GL.accesoDenegado('admin'); iniciarIconos(); return; }
      el.innerHTML = GL.skeleton(6, 20, true);
      iniciarIconos();
      await Mod._cargarAdmins();
      await Mod._cargar();
      Mod._pintar(el);
    },

    async _cargarAdmins() {
      const admins = (GL.ctx.jugadores || []).filter(j => j.rol === 'admin');
      Mod._todosAdmins = admins;
    },

    async _cargar() {
      let q = sb.from('auditoria_eventos')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(Mod._pagina * Mod._POR_PAG, (Mod._pagina + 1) * Mod._POR_PAG - 1);

      if (GL.torneo()) q = q.eq('torneo_id', GL.torneo().id);
      if (Mod._filtroAccion)    q = q.eq('accion', Mod._filtroAccion);
      if (Mod._filtroGrupo)     q = q.eq('grupo_id', Mod._filtroGrupo);
      if (Mod._filtroJugador)   q = q.eq('entidad_id', Mod._filtroJugador);
      if (Mod._filtroFechaDesde) q = q.gte('created_at', Mod._filtroFechaDesde + 'T00:00:00');
      if (Mod._filtroFechaHasta) q = q.lte('created_at', Mod._filtroFechaHasta + 'T23:59:59');

      const { data, error, count } = await q;
      if (error) {
        console.error('[Auditoría]', error.message);
        GL.notificar('No se pudo cargar la auditoría.', 'error');
        Mod._registros = []; Mod._total = 0;
        return;
      }
      Mod._registros = data || [];
      Mod._total     = count || 0;
    },

    _pintar(el) {
      const reg       = Mod._registros;
      const total     = Mod._total;
      const totalPags = Math.ceil(total / Mod._POR_PAG);
      const grupos    = GL.grupos();

      /* ── Métricas rápidas ── */
      const hoy       = new Date().toISOString().slice(0, 10);
      const contHoy   = reg.filter(r => (r.created_at || '').startsWith(hoy)).length;
      const contFallos= reg.filter(r => r.accion === 'error_resultado').length;
      const adminsAct = new Set(reg.map(r => r.realizado_por).filter(Boolean)).size;

      el.innerHTML =
        /* Encabezado */
        '<div class="seccion-head">' +
          '<div class="seccion-titulo">' +
            '<h2>' + icono('shield-check', 20) + ' Auditoría</h2>' +
            '<p>Registro inmutable de todas las operaciones administrativas</p>' +
          '</div>' +
          '<div class="seccion-acciones">' +
            GL.badge('SOLO LECTURA', 'neutral', 'lock') +
            '<button type="button" class="btn sec" id="aud-exportar">' +
              icono('download', 16) + 'Exportar CSV</button>' +
          '</div>' +
        '</div>' +

        /* ── Métricas ── */
        '<div class="aud-metricas">' +
          _metCard('Total de registros', total,     'activity',  'neutral', 'Histórico completo') +
          _metCard('Hoy',               contHoy,    'clock',     contHoy > 0 ? 'blue' : 'neutral', 'Registros de hoy') +
          _metCard('Operaciones fallidas', contFallos, 'circle-x', contFallos > 0 ? 'rojo' : 'neutral', 'En esta vista') +
          _metCard('Admins activos',    adminsAct,  'users',     'neutral', 'Últimos 25 registros') +
        '</div>' +

        /* ── Filtros ── */
        '<div class="card aud-filtros-card">' +
          '<div class="aud-filtros-titulo">' + icono('filter', 14) + ' Filtros</div>' +
          '<div class="aud-filtros-grid">' +

            /* Búsqueda libre */
            '<div class="campo">' +
              '<label>Buscar en detalle</label>' +
              '<div class="input-ico-wrap">' +
                icono('search', 14) +
                '<input type="text" class="input" id="aud-busqueda" placeholder="Jugador, partido, motivo…" value="' + esc(Mod._busqueda) + '">' +
              '</div>' +
            '</div>' +

            /* Tipo de acción */
            '<div class="campo">' +
              '<label>Tipo de acción</label>' +
              '<select class="input" id="aud-filtro-accion">' +
                '<option value="">Todas las acciones</option>' +
                Object.entries(GRUPOS_ACCION).map(([grupo, acciones]) =>
                  '<optgroup label="' + esc(grupo) + '">' +
                  acciones.map(k => '<option value="' + k + '"' + (Mod._filtroAccion === k ? ' selected' : '') + '>' +
                    (ACCIONES[k] ? ACCIONES[k].label : k) + '</option>').join('') +
                  '</optgroup>'
                ).join('') +
              '</select>' +
            '</div>' +

            /* Grupo */
            '<div class="campo">' +
              '<label>Grupo</label>' +
              '<select class="input" id="aud-filtro-grupo">' +
                '<option value="">Todos los grupos</option>' +
                grupos.map(g => '<option value="' + g.id + '"' + (Mod._filtroGrupo === g.id ? ' selected' : '') + '>' +
                  esc(g.nombre) + '</option>').join('') +
              '</select>' +
            '</div>' +

            /* Admin responsable */
            '<div class="campo">' +
              '<label>Administrador</label>' +
              '<select class="input" id="aud-filtro-admin">' +
                '<option value="">Todos</option>' +
                Mod._todosAdmins.map(a => '<option value="' + a.id + '"' + (Mod._filtroJugador === a.id ? ' selected' : '') + '>' +
                  esc(a.nombre_usuario) + '</option>').join('') +
              '</select>' +
            '</div>' +

            /* Fecha desde */
            '<div class="campo">' +
              '<label>Desde</label>' +
              '<input type="date" class="input" id="aud-fecha-desde" value="' + esc(Mod._filtroFechaDesde) + '">' +
            '</div>' +

            /* Fecha hasta */
            '<div class="campo">' +
              '<label>Hasta</label>' +
              '<input type="date" class="input" id="aud-fecha-hasta" value="' + esc(Mod._filtroFechaHasta) + '">' +
            '</div>' +

          '</div>' +
          '<div class="aud-filtros-acciones">' +
            '<button type="button" class="btn sec" id="aud-limpiar">' + icono('x', 14) + 'Limpiar filtros</button>' +
            '<button type="button" class="btn" id="aud-aplicar">' + icono('search', 14) + 'Aplicar</button>' +
          '</div>' +
        '</div>' +

        /* Contador y resumen */
        '<div class="aud-resumen-barra">' +
          '<span>' + icono('list', 14) + ' <strong>' + total + '</strong> registro' + (total !== 1 ? 's' : '') +
            (Mod._filtroAccion || Mod._filtroGrupo || Mod._filtroJugador || Mod._filtroFechaDesde
              ? ' <span class="badge gold" style="font-size:10px">Filtros activos</span>'
              : '') +
          '</span>' +
          '<span class="aud-pag-info">Página ' + (Mod._pagina + 1) + ' de ' + (totalPags || 1) + '</span>' +
        '</div>' +

        /* Tabla */
        (reg.length === 0
          ? GL.vacio(
              'No hay registros que coincidan con los filtros.',
              'shield-check',
              null,
              'Las operaciones administrativas quedan registradas aquí automáticamente.'
            )
          : '<div class="card" style="overflow-x:auto;padding:0">' +
              '<table class="tabla-base aud-tabla">' +
                '<thead><tr>' +
                  '<th style="width:140px">Fecha y hora</th>' +
                  '<th>Acción</th>' +
                  '<th>Resumen</th>' +
                  '<th>Entidad</th>' +
                  '<th>Responsable</th>' +
                  '<th style="width:60px"></th>' +
                '</tr></thead>' +
                '<tbody>' + reg.map(r => _htmlFila(r)).join('') + '</tbody>' +
              '</table>' +
            '</div>') +

        /* Paginación */
        (totalPags > 1
          ? '<div class="paginacion">' +
              (Mod._pagina > 0
                ? '<button type="button" class="btn sec" id="aud-ant">' + icono('chevron-left', 16) + 'Anterior</button>'
                : '<button class="btn sec" disabled>' + icono('chevron-left', 16) + 'Anterior</button>') +
              '<div class="paginacion-nums">' +
                Array.from({ length: Math.min(totalPags, 7) }, (_, i) => {
                  const p = i;
                  return '<button type="button" class="btn-pag' + (p === Mod._pagina ? ' activo' : '') +
                    '" data-pag="' + p + '">' + (p + 1) + '</button>';
                }).join('') +
              '</div>' +
              (Mod._pagina < totalPags - 1
                ? '<button type="button" class="btn sec" id="aud-sig">Siguiente ' + icono('chevron-right', 16) + '</button>'
                : '<button class="btn sec" disabled>Siguiente ' + icono('chevron-right', 16) + '</button>') +
            '</div>'
          : '') +

        /* Aviso de inmutabilidad */
        '<div class="aud-aviso-inmutable">' +
          icono('lock', 14) +
          ' Los registros de auditoría son inmutables y no pueden editarse ni eliminarse desde esta interfaz.' +
        '</div>';

      iniciarIconos();

      /* ── Eventos ── */
      el.querySelector('#aud-aplicar')?.addEventListener('click', async () => {
        Mod._busqueda        = el.querySelector('#aud-busqueda')?.value.trim() || '';
        Mod._filtroAccion    = el.querySelector('#aud-filtro-accion')?.value    || '';
        Mod._filtroGrupo     = el.querySelector('#aud-filtro-grupo')?.value     || '';
        Mod._filtroJugador   = el.querySelector('#aud-filtro-admin')?.value     || '';
        Mod._filtroFechaDesde= el.querySelector('#aud-fecha-desde')?.value      || '';
        Mod._filtroFechaHasta= el.querySelector('#aud-fecha-hasta')?.value      || '';
        Mod._pagina = 0;
        el.innerHTML = GL.skeleton(6);
        await Mod._cargar();
        Mod._pintar(el);
      });

      el.querySelector('#aud-limpiar')?.addEventListener('click', async () => {
        Mod._busqueda = Mod._filtroAccion = Mod._filtroGrupo =
        Mod._filtroJugador = Mod._filtroFechaDesde = Mod._filtroFechaHasta = '';
        Mod._pagina = 0;
        el.innerHTML = GL.skeleton(6);
        await Mod._cargar();
        Mod._pintar(el);
      });

      /* Enter en búsqueda */
      el.querySelector('#aud-busqueda')?.addEventListener('keydown', async e => {
        if (e.key === 'Enter') el.querySelector('#aud-aplicar').click();
      });

      el.querySelector('#aud-ant')?.addEventListener('click', async () => {
        Mod._pagina--;
        el.innerHTML = GL.skeleton(6);
        await Mod._cargar(); Mod._pintar(el);
      });
      el.querySelector('#aud-sig')?.addEventListener('click', async () => {
        Mod._pagina++;
        el.innerHTML = GL.skeleton(6);
        await Mod._cargar(); Mod._pintar(el);
      });
      el.querySelectorAll('[data-pag]').forEach(b =>
        b.addEventListener('click', async () => {
          Mod._pagina = Number(b.dataset.pag);
          el.innerHTML = GL.skeleton(6);
          await Mod._cargar(); Mod._pintar(el);
        })
      );

      el.querySelector('#aud-exportar')?.addEventListener('click', () => _exportarCSV(Mod._registros));

      /* Click en fila → modal de detalle */
      el.querySelectorAll('[data-aud-id]').forEach(tr =>
        tr.addEventListener('click', () => _modalDetalle(tr.dataset.audId))
      );
    }
  };

  /* ── Helpers HTML ───────────────────────────────────────────────── */

  function _metCard(label, valor, ico, tono, sub) {
    return '<div class="aud-met-card">' +
      '<div class="aud-met-ico aud-' + tono + '">' + icono(ico, 20) + '</div>' +
      '<div>' +
        '<div class="aud-met-valor aud-' + tono + '-txt">' + esc(String(valor)) + '</div>' +
        '<div class="aud-met-label">' + esc(label) + '</div>' +
        (sub ? '<div class="aud-met-sub">' + esc(sub) + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  function _htmlFila(r) {
    const cfg   = ACCIONES[r.accion] || { ico: 'activity', color: 'neutral', label: r.accion };
    const fecha = _formatFechaCorta(r.created_at);
    const quien = _nombreAdmin(r.realizado_por);
    const resumen = _resumenDetalle(r);

    return '<tr data-aud-id="' + esc(r.id) + '" class="aud-fila" title="Clic para ver detalle completo">' +
      '<td class="aud-fecha">' + esc(fecha) + '</td>' +
      '<td><span class="badge ' + esc(cfg.color) + '" style="white-space:nowrap">' +
        icono(cfg.ico, 12) + esc(cfg.label) + '</span></td>' +
      '<td class="aud-resumen">' + esc(resumen) + '</td>' +
      '<td><span class="badge neutral" style="font-size:10px">' + esc(r.entidad_tipo || '—') + '</span></td>' +
      '<td class="aud-quien">' + icono('user', 14) + esc(quien) + '</td>' +
      '<td><button class="btn-aud-det" title="Ver detalle">' + icono('eye', 14) + '</button></td>' +
    '</tr>';
  }

  function _resumenDetalle(r) {
    const d = r.detalle || {};
    switch (r.accion) {
      case 'resultado_ingresado':
        return (d.local||'?') + ' ' + (d.goles_local??'?') + '-' + (d.goles_visitante??'?') + ' ' + (d.visitante||'?') +
          (d.jornada ? ' · J' + d.jornada : '');
      case 'resultado_corregido':
        return (d.local||'?') + ' vs ' + (d.visitante||'?') + ': ' +
          (d.anterior||'?') + ' → ' + (d.nuevo||'?') +
          (d.motivo ? ' · "' + String(d.motivo).slice(0,40) + '"' : '');
      case 'sancion_aplicada':
      case 'sancion_modificada':
        return (d.jugador||'?') + ' · ' + (d.tipo||'?') +
          (d.puntos_descuento ? ' · -' + d.puntos_descuento + ' pts' : '') +
          (d.motivo ? ' · ' + String(d.motivo).slice(0,40) : '');
      case 'expulsion_jugador':
        return (d.jugador||'?') + (d.motivo ? ' — ' + String(d.motivo).slice(0,50) : '');
      case 'jugador_estado_cambio':
        return (d.jugador||'?') + ': ' + (d.estado_anterior||'?') + ' → ' + (d.estado_nuevo||'?');
      case 'jugador_grupo_cambio':
        return (d.jugador||'?') + ': ' + (d.grupo_anterior||'Sin grupo') + ' → ' + (d.grupo_nuevo||'?');
      case 'jugador_registrado':
        return (d.nombre||'?') + (d.pais ? ' · ' + d.pais : '');
      case 'admin_asignado':
      case 'admin_removido':
        return (d.jugador||'?') + (d.accion_por ? ' · por ' + d.accion_por : '');
      case 'jornada_abierta':
      case 'jornada_cerrada':
        return 'Jornada ' + (d.jornada||'?') + (d.grupo ? ' · ' + d.grupo : '') +
          (d.partidos_resueltos !== undefined ? ' · ' + d.partidos_resueltos + ' partidos' : '');
      case 'torneo_creado':
      case 'temporada_creada':
        return (d.nombre||d.temporada||'?') +
          (d.total_jornadas ? ' · ' + d.total_jornadas + ' jornadas' : '');
      case 'torneo_finalizado':
        return (d.nombre||'?') + (d.temporada ? ' · ' + d.temporada : '');
      case 'eliminatoria_cambio':
        return d.descripcion || 'Cambio en cruce eliminatorio';
      case 'config_modificada':
        return (d.campo||'?') + ': ' + (d.anterior||'?') + ' → ' + (d.nuevo||'?');
      case 'fixture_generado':
        return (d.total_partidos||'?') + ' partidos generados' + (d.grupo ? ' · ' + d.grupo : '');
      default:
        return JSON.stringify(d).slice(0, 90);
    }
  }

  function _modalDetalle(id) {
    const r = Mod._registros.find(x => x.id === id);
    if (!r) return;
    const cfg = ACCIONES[r.accion] || { ico: 'activity', color: 'neutral', label: r.accion };
    const d   = r.detalle || {};

    /* Construir filas de detalle según tipo de acción */
    const filasDet = [];
    if (r.accion === 'resultado_corregido' && d.anterior && d.nuevo) {
      filasDet.push({ k: 'Cambio', v:
        '<span class="badge red">' + esc(d.anterior) + '</span>' +
        ' <span style="color:var(--text-secondary)">→</span> ' +
        '<span class="badge green">' + esc(d.nuevo) + '</span>'
      });
      if (d.motivo) filasDet.push({ k: 'Motivo', v: esc(d.motivo) });
      if (d.captura) filasDet.push({ k: 'Con captura', v: d.captura ? '✓ Sí' : '✗ No' });
    }
    if (d.jornada) filasDet.push({ k: 'Jornada', v: 'Jornada ' + d.jornada });
    if (d.grupo)   filasDet.push({ k: 'Grupo', v: d.grupo });
    if (d.puntos_descuento !== undefined) filasDet.push({ k: 'Puntos descontados', v: '-' + d.puntos_descuento });
    if (d.partidos_suspension) filasDet.push({ k: 'Partidos de suspensión', v: d.partidos_suspension });

    /* Resto del detalle crudo */
    const clavesMostradas = new Set(['anterior','nuevo','motivo','jornada','grupo',
      'puntos_descuento','partidos_suspension','captura']);
    Object.entries(d).forEach(([k, v]) => {
      if (!clavesMostradas.has(k)) {
        filasDet.push({ k: k.replace(/_/g, ' '), v: esc(String(v)) });
      }
    });

    GL.abrirModal({
      titulo: '<span class="badge ' + cfg.color + '">' + icono(cfg.ico, 14) + esc(cfg.label) + '</span>',
      cuerpo:
        '<div class="aud-det-modal">' +

        /* Cabeza del modal */
        '<div class="aud-det-bloque">' +
          '<div class="aud-det-fila">' +
            '<span>Fecha exacta</span>' +
            '<strong>' + esc(_formatFechaCompleta(r.created_at)) + '</strong>' +
          '</div>' +
          '<div class="aud-det-fila">' +
            '<span>Responsable</span>' +
            '<strong>' + icono('user', 14) + esc(_nombreAdmin(r.realizado_por)) + '</strong>' +
          '</div>' +
          '<div class="aud-det-fila">' +
            '<span>Entidad afectada</span>' +
            '<strong>' + esc(r.entidad_tipo || '—') +
              (r.entidad_id ? ' <span style="font-size:10px;color:var(--text-secondary)">' +
                r.entidad_id.slice(0,8) + '…</span>' : '') +
            '</strong>' +
          '</div>' +
          (r.grupo_id
            ? '<div class="aud-det-fila"><span>Grupo</span><strong>' +
                esc((GL.grupo(r.grupo_id) && GL.grupo(r.grupo_id).nombre) || r.grupo_id.slice(0,8)) + '</strong></div>'
            : '') +
        '</div>' +

        (filasDet.length
          ? '<div class="aud-det-sep"></div>' +
            '<div class="aud-det-bloque">' +
            filasDet.map(f =>
              '<div class="aud-det-fila"><span>' + esc(f.k) + '</span>' +
              '<div>' + f.v + '</div></div>'
            ).join('') +
            '</div>'
          : '') +

        /* ID técnico para debug */
        '<div class="aud-det-sep"></div>' +
        '<details class="aud-det-raw">' +
          '<summary>Datos técnicos</summary>' +
          '<pre>' + esc(JSON.stringify({ id: r.id, torneo_id: r.torneo_id, ...d }, null, 2)) + '</pre>' +
        '</details>' +

        /* Aviso inmutabilidad */
        '<div class="aud-det-lock">' + icono('lock', 14) +
          ' Este registro es inmutable. No puede modificarse desde la interfaz.</div>' +

        '</div>',
      acciones: '<button type="button" class="btn" data-cerrar>Cerrar</button>'
    });
    iniciarIconos();
  }

  /* ── Helpers de formato ── */
  function _nombreAdmin(uid) {
    if (!uid) return 'Sistema';
    const j = GL.ctx.jugadores.find(x => x.user_id === uid || x.id === uid);
    return j ? j.nombre_usuario : uid.slice(0, 8) + '…';
  }

  function _formatFechaCorta(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short' }) +
             ' ' + d.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  function _formatFechaCompleta(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-NI', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch (e) { return iso; }
  }

  function _exportarCSV(registros) {
    const cab  = ['Fecha','Acción','Resumen','Entidad','ID Entidad','Responsable','Torneo ID'];
    const filas = registros.map(r => [
      _formatFechaCompleta(r.created_at),
      (ACCIONES[r.accion] && ACCIONES[r.accion].label) || r.accion,
      _resumenDetalle(r),
      r.entidad_tipo || '',
      r.entidad_id   || '',
      _nombreAdmin(r.realizado_por),
      r.torneo_id    || ''
    ]);
    const csv  = [cab, ...filas]
      .map(f => f.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'auditoria-goats-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── API pública: GL.auditoria.registrar() ── */
  GL.auditoria = {
    async registrar(accion, entidadTipo, entidadId, detalle, grupoId) {
      if (!Auth.jugador) return;
      try {
        const uid = (await sb.auth.getUser()).data?.user?.id;
        await sb.rpc('gl_registrar_auditoria', {
          p_torneo_id:     GL.torneoId() || null,
          p_accion:        accion,
          p_entidad_tipo:  entidadTipo,
          p_entidad_id:    entidadId     || null,
          p_realizado_por: uid,
          p_detalle:       grupoId
            ? Object.assign({}, detalle || {}, { grupo_id: grupoId })
            : (detalle || {})
        });
      } catch (e) {
        console.warn('[Auditoría]', e.message);
        // Fallo silencioso: la operación principal ya se completó
      }
    }
  };

  Modulos.auditoria = Mod;
})();