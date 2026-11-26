/* =====================================================================
   MÓDULO 7 — Panel de administración (validado en cada carga)
   A: Jugadores  A2: Equipos (grupos reales)  B: Jornadas
   C: Disciplina  D: Administradores  E: Configuración
   ===================================================================== */
(function () {
  const MAX_JORNADAS = 30; // Rango permitido para el total de jornadas (1..30)

  const Mod = {
    titulo: 'Administración',
    tab: 'resumen',
    grupoJornadas: null,
    partidosCache: [],

    setTab(tab) { Mod.tab = tab || 'resumen'; },

    async render(el) {
      el.innerHTML = GL.skeleton(8);
      if (!(await GL.asegurarAdmin(el))) return;
      try {
        await GL.cargarContexto(true);
        if (!GL.torneo()) {
          el.innerHTML = htmlSinTorneo();
          enlazar(el, el);
          iniciarIconos(); return;
        }
        Mod.partidosCache = await GL.partidos({ torneo_id: GL.torneoId() });
        if (!Mod.grupoJornadas) Mod.grupoJornadas = GL.grupos()[0] && GL.grupos()[0].id;
        const superAdmin = GL.esSuperAdmin();
        if (!superAdmin && Mod.tab === 'admins') Mod.tab = 'jugadores';

        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Panel de administración</h2>' +
            '<p>' + esc((GL.torneo() && GL.torneo().nombre) || CONFIG.NOMBRE_LIGA) + ' · Control total del torneo</p></div>' +
            '<div class="seccion-acciones">' + GL.badge('ADMIN', 'gold', 'shield') +
              (superAdmin ? GL.badge('ADMINISTRADOR PRINCIPAL', 'gold', 'crown') : '') + '</div></div>' +
          '<div class="tabs tabs-admin">' +
            tabBtn('resumen',    'layout-dashboard', 'Resumen') +
            tabBtn('jugadores',  'users',            'Jugadores') +
            tabBtn('equipos',    'shield',           'Equipos') +
            tabBtn('jornadas',   'flag',             'Jornadas') +
            tabBtn('disciplina', 'gavel',            'Disciplina') +
            (superAdmin ? tabBtn('admins', 'shield-check', 'Admins') : '') +
            tabBtn('config', 'settings-2', 'Config') +
          '</div><div id="contenido-admin"></div>';
        pintarAdmin(el);
        el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
          irATab(b.dataset.tab, el);
        }));
      } catch (e) { console.error(e); el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'la administración'), null, 'la administración'); }
      iniciarIconos();
    }
  };

  function tabBtn(id, ico, label) {
    return '<button type="button" class="tab' + (Mod.tab === id ? ' activo' : '') + '" data-tab="' + id + '">' +
      icono(ico, 16) + label + '</button>';
  }

  /* ---------------- Helpers comunes de arranque / estado ---------------- */

  // Fecha legible en DD/MM/YYYY. Acepta Date, ISO con o sin hora y DD/MM/YYYY.
  function aDDMMYYYY(valor) {
    if (!valor) return 'Por definir';
    const texto = String(valor).trim();
    const barra = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
    if (barra) return texto;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const d = new Date(texto);
    if (isNaN(d.getTime())) return texto;
    return String(d.getDate()).padStart(2, '0') + '/' +
      String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  // Convierte DD/MM/YYYY a YYYY-MM-DD (tipo date de Postgres). null si no es válida.
  function fechaDDMMYYYYaISO(valor) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valor || '').trim());
    if (!m) return null;
    const d = Number(m[1]), mes = Number(m[2]), anio = Number(m[3]);
    if (d < 1 || mes < 1 || mes > 12 || anio < 1900) return null;
    const f = new Date(Date.UTC(anio, mes - 1, d));
    if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
    return anio + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // Normaliza la respuesta de cualquier RPC {ok, mensaje, ...}.
  function leerRpc(data, error, textoFallo) {
    if (error) return { ok: false, mensaje: error.message || textoFallo || 'No se pudo completar la operación.' };
    const r = data || {};
    if (r.ok === false) return {
      ok: false,
      mensaje: r.mensaje || r.error || textoFallo || 'No se pudo completar la operación.',
      datos: r
    };
    return { ok: true, mensaje: r.mensaje || textoFallo || 'Operación completada.', datos: r };
  }

  // Recarga el contexto global y la caché de partidos. sinTorneo fuerza el estado vacío.
  async function recargarContextoAdmin(opciones) {
    if (opciones && opciones.sinTorneo) GL.ctx.torneo = null;
    GL.invalidar();
    await GL.cargarContexto(true);
    Mod.partidosCache = GL.torneoId() ? await GL.partidos({ torneo_id: GL.torneoId() }) : [];
    if (!GL.grupos().some(g => g.id === Mod.grupoJornadas))
      Mod.grupoJornadas = GL.grupos().length ? GL.grupos()[0].id : null;
  }

  // Pinta solamente el contenido de la pestaña activa (lo usa render y el acceso rápido).
  function pintarAdmin(root) {
    const cont = root.querySelector('#contenido-admin');
    if (!cont) return;
    const superAdmin = GL.esSuperAdmin();
    if (!superAdmin && Mod.tab === 'admins') Mod.tab = 'jugadores';
    cont.innerHTML =
      Mod.tab === 'resumen'    ? htmlResumen(superAdmin) :
      Mod.tab === 'jugadores'  ? htmlJugadores() :
      Mod.tab === 'equipos'    ? htmlEquipos() :
      Mod.tab === 'jornadas'   ? htmlJornadas() :
      Mod.tab === 'disciplina' ? htmlDisciplina() :
      Mod.tab === 'admins'     ? htmlAdmins() :
      htmlConfig();
    enlazar(cont, root);
    iniciarIconos();
  }

  function irATab(tab, root) {
    if (tab === 'admins' && !GL.esSuperAdmin()) {
      GL.notificar('Acceso restringido: solo el administrador principal puede abrir Administradores.', 'advertencia');
      return;
    }
    Mod.tab = tab || 'resumen';
    root.querySelectorAll('[data-tab]').forEach(x =>
      x.classList.toggle('activo', x.dataset.tab === Mod.tab));
    pintarAdmin(root);
  }

  function htmlSinTorneo() {
    return '<div class="card">' +
      '<div class="card-titulo">' + icono('trophy', 20) + 'Sin torneo activo</div>' +
      '<p class="muted">Todavía no hay un torneo en curso. Creá uno para cargar jugadores, jornadas y resultados.</p>' +
      '<p class="nota-pie">El torneo nuevo se crea con sus grupos listos para cargar la temporada.</p>' +
      '<button type="button" class="btn mt" id="tor-crear">' + icono('plus', 16) + 'Crear Torneo</button>' +
      '</div>';
  }

  // Bloque visible tanto en Resumen como en Configuración.
  function htmlAccionesTorneo() {
    const t = GL.torneo() || {};
    return '<div class="card mt">' +
      '<div class="card-titulo">' + icono('trophy', 20) + 'Arrancar desde cero</div>' +
      '<p class="muted" style="font-size:12px">' +
        (t.id
          ? 'Torneo actual: <strong>' + esc(t.nombre || CONFIG.NOMBRE_LIGA) + '</strong> · ' +
            esc(t.temporada || 'Sin temporada') + ' · ' + (Number(t.total_jornadas) || 22) + ' jornadas.'
          : 'No hay torneo activo: creá uno para empezar.') +
      '</p>' +
      '<div class="seccion-acciones" style="flex-wrap:wrap;gap:8px">' +
        '<button type="button" class="btn" id="tor-crear">' + icono('plus', 16) + 'Crear Torneo</button>' +
        (t.id
          ? '<button type="button" class="btn peligro" id="tor-eliminar">' +
              icono('trash-2', 16) + 'Eliminar torneo actual' + '</button>'
          : '<span class="muted" style="font-size:12px">No hay torneo para eliminar.</span>') +
      '</div></div>';
  }

  /* ---------------- RESUMEN (pantalla de inicio del admin) ---------------- */
  function htmlResumen(superAdmin) {
    const torneo      = GL.torneo() || {};
    const jugadores   = GL.jugadores();
    const grupos      = GL.grupos();
    const jornada     = GL.jornadaActual();
    const partidos    = Mod.partidosCache;
    const sanciones   = GL.ctx.sanciones || [];
    const total       = Number(torneo.total_jornadas) || 22;

    // ── Métricas generales ──
    const totalJugadores  = jugadores.length;
    const sinGrupo        = jugadores.filter(j => !GL.grupoDeJugador(j.id)).length;
    const suspendidos     = jugadores.filter(j => j.suspendido || j.activo === false).length;
    const conFaltas3      = jugadores.filter(j => GL.faltas(j.id) >= 3).length;
    const jornadasCerradas = (GL.ctx.jornadas || []).filter(j => j.estado === 'cerrada').length;
    const pct             = Math.round((jornada.numero / total) * 100);

    // Partidos de la jornada actual
    const partidosJornada   = partidos.filter(p => p.jornada === jornada.numero);
    const jugados           = partidosJornada.filter(p => p.estado !== 'pendiente').length;
    const pendientes        = partidosJornada.length - jugados;
    const pctJornada        = partidosJornada.length ? Math.round(jugados / partidosJornada.length * 100) : 0;

    // Jornadas abiertas (no la actual sola, todas)
    const jornadasAbiertas = (GL.ctx.jornadas || []).filter(j => j.estado === 'abierta');

    // ── Alertas dinámicas ──
    const alertas = [];
    if (sinGrupo > 0)
      alertas.push({ tipo: 'warn', ico: 'users', msg: sinGrupo + ' jugador' + (sinGrupo > 1 ? 'es sin grupo asignado' : ' sin grupo asignado'), tab: 'jugadores' });
    if (conFaltas3 > 0)
      alertas.push({ tipo: 'warn', ico: 'octagon-alert', msg: conFaltas3 + ' jugador' + (conFaltas3 > 1 ? 'es con 3 o más faltas' : ' con 3 o más faltas') + ' (veto automático próximo torneo)', tab: 'disciplina' });
    if (suspendidos > 0)
      alertas.push({ tipo: 'info', ico: 'user-x', msg: suspendidos + ' jugador' + (suspendidos > 1 ? 'es suspendidos' : ' suspendido') + ' actualmente', tab: 'jugadores' });
    if (pendientes > 0)
      alertas.push({ tipo: 'info', ico: 'clock', msg: pendientes + ' partido' + (pendientes > 1 ? 's pendientes' : ' pendiente') + ' en la jornada ' + jornada.numero, tab: 'jornadas' });
    if (jornadasAbiertas.length > 1)
      alertas.push({ tipo: 'warn', ico: 'flag', msg: jornadasAbiertas.length + ' jornadas abiertas al mismo tiempo — revisá si alguna debería cerrarse', tab: 'jornadas' });
    if (!torneo.id)
      alertas.push({ tipo: 'error', ico: 'trophy', msg: 'No hay torneo activo. Usá el botón Crear Torneo.', tab: 'resumen' });

    // ── Actividad reciente: últimos 5 partidos cargados ──
    const recientes = partidos
      .filter(p => p.estado !== 'pendiente')
      .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
      .slice(0, 5);

    // ── HTML ──
    const tarjetaKpi = (valor, label, ico, color) =>
      '<div class="kpi-card">' +
        '<div class="kpi-ico" style="color:' + color + '">' + icono(ico, 22) + '</div>' +
        '<div class="kpi-valor">' + valor + '</div>' +
        '<div class="kpi-label">' + label + '</div>' +
      '</div>';

    const htmlAlertas = alertas.length
      ? '<div class="card mt">' +
          '<div class="card-titulo">' + icono('bell-ring', 20) + 'Atención requerida' +
            '<span class="badge red">' + alertas.length + '</span>' +
          '</div>' +
          alertas.map(a =>
            '<div class="alerta-item alerta-' + a.tipo + '">' +
              icono(a.ico, 15) +
              '<span>' + a.msg + '</span>' +
              '<button type="button" class="btn sm sec alerta-ir" data-tab-ir="' + a.tab + '">' +
                icono('arrow-right', 14) + 'Ver' +
              '</button>' +
            '</div>'
          ).join('') +
        '</div>'
      : '<div class="card mt"><div class="alerta-item alerta-ok">' +
          icono('circle-check', 16) + '<span>Todo en orden. No hay alertas pendientes.</span>' +
        '</div></div>';

    const htmlJornada =
      '<div class="card">' +
        '<div class="card-titulo">' + icono('flag', 20) + 'Estado de la temporada</div>' +
        '<div class="temporada-progreso">' +
          '<div class="temporada-barra"><span style="width:' + pct + '%"></span></div>' +
          '<div class="temporada-labels">' +
            '<span>Jornada ' + jornada.numero + ' / ' + total + '</span>' +
            '<span>' + pct + '% completado</span>' +
          '</div>' +
        '</div>' +
        '<div class="temporada-detalle">' +
          '<div class="temporada-stat">' + icono('check-circle', 14) + jornadasCerradas + ' jornadas cerradas</div>' +
          '<div class="temporada-stat">' + icono('unlock', 14) + jornadasAbiertas.length + ' abierta' + (jornadasAbiertas.length !== 1 ? 's' : '') + '</div>' +
          '<div class="temporada-stat">' + icono('calendar-days', 14) + (total - jornada.numero) + ' por jugar</div>' +
        '</div>' +
        '<div class="jornada-progreso-wrap">' +
          '<div class="jornada-progreso-titulo">' + icono('activity', 14) + 'Jornada ' + jornada.numero + ' — ' + jugados + '/' + partidosJornada.length + ' partidos</div>' +
          '<div class="temporada-barra"><span style="width:' + pctJornada + '%"></span></div>' +
        '</div>' +
      '</div>';

    const htmlRecientes = recientes.length
      ? '<div class="card mt">' +
          '<div class="card-titulo">' + icono('activity', 20) + 'Actividad reciente</div>' +
          '<ul class="actividad-lista">' +
          recientes.map(p => {
            const r = GL.resultado(p);
            return '<li class="actividad-item">' +
              '<span class="actividad-nombres">' +
                esc(GL.nombreJugador(p.local_id)) +
                ' <strong>' + r.texto + '</strong> ' +
                esc(GL.nombreJugador(p.visitante_id)) +
              '</span>' +
              '<span class="actividad-meta">J' + p.jornada + ' · ' + esc(aDDMMYYYY(p.updated_at || p.created_at)) + '</span>' +
            '</li>';
          }).join('') +
          '</ul>' +
        '</div>'
      : '';

    const htmlAccionesRapidas =
      '<div class="card mt">' +
        '<div class="card-titulo">' + icono('zap', 20) + 'Acciones rápidas</div>' +
        '<div class="acciones-rapidas-grid">' +
          accionRapida('jugadores', 'user-plus',   'Agregar jugador',  'Registrá un nuevo participante') +
          accionRapida('jornadas',  'flag',         'Gestionar jornadas','Abrí, cerrá y revisá partidos') +
          accionRapida('disciplina','gavel',         'Disciplina',       'Revisá sanciones y faltas') +
          (superAdmin ? accionRapida('admins', 'shield-check', 'Administradores', 'Gestioná quién puede administrar') : '') +
        '</div>' +
      '</div>';

    return htmlAccionesTorneo() +
      '<div class="grid dos mt">' +
        htmlJornada +
        '<div class="card">' +
          '<div class="card-titulo">' + icono('bar-chart-2', 20) + 'Resumen del torneo</div>' +
          '<div class="kpi-grid">' +
            tarjetaKpi(totalJugadores, 'Jugadores',   'users',         'var(--accent-primary)') +
            tarjetaKpi(grupos.length,  'Grupos',       'layout-grid',   'var(--accent-secondary,#8e44ad)') +
            tarjetaKpi(sanciones.length,'Sanciones',  'gavel',         'var(--accent-orange,#e67e22)') +
            tarjetaKpi(suspendidos,    'Suspendidos',  'user-x',        'var(--accent-red,#e74c3c)') +
          '</div>' +
        '</div>' +
      '</div>' +
      htmlAlertas +
      htmlAccionesRapidas +
      htmlRecientes;
  }

  function accionRapida(tab, ico, titulo, desc) {
    return '<button type="button" class="accion-rapida-btn" data-tab-ir="' + tab + '">' +
      '<div class="accion-rapida-ico">' + icono(ico, 20) + '</div>' +
      '<div class="accion-rapida-texto">' +
        '<strong>' + titulo + '</strong>' +
        '<span>' + desc + '</span>' +
      '</div>' +
      icono('chevron-right', 14) +
    '</button>';
  }

  /* ---------------- A. Jugadores ---------------- */
  function j5Kpi(valor, etiqueta, nota, ico) {
    return '<article class="j5-kpi">' +
      '<span class="j5-kpi-ico">' + icono(ico, 20) + '</span>' +
      '<span class="j5-kpi-copy">' +
        '<strong class="j5-kpi-valor">' + esc(valor) + '</strong>' +
        '<span class="j5-kpi-label">' + esc(etiqueta) + '</span>' +
        '<span class="j5-kpi-nota">' + esc(nota) + '</span>' +
      '</span></article>';
  }

  function j5Requerido() {
    return '<span class="j5-req" aria-hidden="true">*</span><span class="sr-only"> (obligatorio)</span>';
  }

  function j5FormIntro(texto) {
    return '<div class="j5-form-intro">' + icono('info', 18) +
      '<div><strong>Datos del jugador</strong>' +
      '<p>' + esc(texto) + '</p>' +
      '<span>Los campos marcados con <b aria-hidden="true">*</b> son obligatorios.</span></div></div>';
  }

  function htmlJugadores() {
    const jugadores = GL.jugadores();
    const primeraSemana = esPrimeraSemana();
    const total = jugadores.length;
    const sinGrupo = GL.jugadoresSinGrupo().length;
    const inactivos = (GL.ctx.jugadores || []).filter(j => j.activo === false).length;
    const conAlerta = jugadores.filter(j => GL.faltas(j.id) >= 3).length;

    const opcionesGrupo = GL.grupos().map(g =>
      '<option value="' + esc(g.id) + '">Grupo ' + esc(GL.letraGrupo(g)) + '</option>').join('');

    const filas = jugadores.map((j, indice) => {
      const g = GL.grupoDeJugador(j.id);
      const faltas = GL.faltas(j.id);
      const expulsado = j.activo === false || j.rol === 'expulsado';
      const estado = expulsado ? 'expulsado' : (j.suspendido ? 'suspendido' : 'activo');
      const estadoTexto = expulsado ? 'Expulsado' : (j.suspendido ? 'Suspendido' : 'Activo');
      const rolTexto = j.rol === 'admin' ? (j.super_admin ? 'Principal' : 'Admin') : 'Jugador';
      const grupoTexto = g ? 'Grupo ' + GL.letraGrupo(g) : 'Sin asignar';
      const acciones = iconBtn('editar-' + j.id, 'pencil', 'Editar jugador') +
        iconBtn('telefono-' + j.id, 'phone', 'Confirmar teléfono / titularidad') +
        (g ? (primeraSemana ? iconBtn('grupo-' + j.id, 'users', 'Cambiar de grupo') : '')
           : iconBtn('asignar-' + j.id, 'user-plus', 'Asignar grupo')) +
        iconBtn('sancion-' + j.id, 'triangle-alert', 'Aplicar sanción') +
        iconBtn('suspender-' + j.id, 'user-x', 'Suspender / expulsar') +
        (j.rol === 'admin'
          ? ''
          : accionBtn('eliminar-' + j.id, 'trash-2', 'Eliminar jugador'));

      return '<tr class="j5-fila ' + (faltas >= 3 ? 'fila-alerta' : '') + '" ' +
          'data-j5-id="' + esc(j.id) + '" ' +
          'data-j5-nombre="' + esc(j.nombre_usuario) + '" ' +
          'data-j5-grupo="' + esc(g ? g.id : '') + '" ' +
          'data-j5-estado="' + estado + '" ' +
          'style="animation-delay:' + (indice * .03) + 's">' +
        '<td class="izq j5-celda-nombre" data-label="Jugador"><div class="jugador-celda">' +
          GL.avatarHTML(j, 'avatar-sm') +
          '<span class="j5-nombre-celda"><span class="j5-nombre">' + esc(j.nombre_usuario) +
            (faltas >= 3 ? ' ' + icono('octagon-alert', 14, 'rojo-txt') + '<span class="sr-only">Veto próximo torneo</span>' : '') +
          '</span></span></div></td>' +
        '<td data-label="País"><span class="pais-celda" title="' + esc(GL.nombrePais(j.pais)) + '">' +
          GL.banderaHTML(j.pais, 16) + '<span class="codigo-pais">' + esc(j.pais || '—') + '</span></span></td>' +
        '<td class="izq" data-label="Horario"><span class="j5-horario" title="' + esc(GL.etiquetaZona(GL.zonaJugador(j))) + '">' +
          esc(GL.horarioJugador(j)) + '</span></td>' +
        '<td data-label="Contacto">' + GL.linkWhatsapp(j, j.nombre_usuario) + '</td>' +
        '<td data-label="Grupo"><span class="j5-grupo">' + esc(grupoTexto) + '</span></td>' +
        '<td data-label="Rol">' + GL.badge(rolTexto, j.rol === 'admin' ? 'gold' : 'neutral') + '</td>' +
        '<td data-label="Estado">' + GL.badge(estadoTexto, estado === 'expulsado' ? 'red' : estado === 'suspendido' ? 'orange' : 'green') + '</td>' +
        '<td class="num ' + (faltas >= 3 ? 'rojo-txt' : '') + '" data-label="Faltas">' + faltas + '</td>' +
        '<td class="col-acciones" data-label="Acciones">' +
          '<div class="acciones-tabla acciones-escritorio">' + acciones + '</div>' +
          '<div class="acciones-movil">' +
            '<button type="button" class="btn-icon btn-menu-acciones" ' +
              'data-jugador-id="' + esc(j.id) + '" ' +
              'data-jugador-nombre="' + esc(j.nombre_usuario) + '" ' +
              'aria-label="Acciones de ' + esc(j.nombre_usuario) + '" ' +
              'aria-haspopup="true" aria-expanded="false">' +
              icono('ellipsis', 18) +
            '</button>' +
          '</div>' +
        '</td></tr>';
    }).join('');

    const filaVacia = '<tr class="j5-fila-vacia"><td colspan="9" class="vacio-mensaje">' +
      '<div class="j5-estado-vacio">' + icono('users', 30) +
      '<strong>Sin jugadores en el torneo</strong>' +
      '<span>Agregá el primer jugador para comenzar a organizar el plantel.</span></div></td></tr>';
    const filaSinResultados = '<tr class="j5-fila-sin-resultados" hidden><td colspan="9" class="vacio-mensaje">' +
      '<div class="j5-estado-vacio">' + icono('search-x', 30) +
      '<strong>Sin coincidencias</strong>' +
      '<span>Probá con otro nombre o quitá los filtros activos.</span>' +
      '<button type="button" class="btn sec sm" data-j5-limpiar>' + icono('rotate-ccw', 15) + 'Limpiar filtros</button>' +
      '</div></td></tr>';

    return '<div class="j5-pantalla" data-jugadores>' +
      '<header class="j5-hero">' +
        '<div class="j5-hero-copy">' +
          '<span class="j5-eyebrow">' + icono('shield', 14) + 'Administración · Plantel</span>' +
          '<h1 class="j5-titulo">Jugadores</h1>' +
          '<p class="j5-bajada">Consultá, organizá y mantené el plantel del torneo activo.</p>' +
        '</div>' +
        '<div class="j5-hero-acciones">' +
          '<span class="j5-contexto">' + icono('trophy', 14) +
            esc((GL.torneo() && GL.torneo().nombre) || CONFIG.NOMBRE_LIGA) + '</span>' +
          '<button type="button" class="btn" data-agregar>' + icono('user-plus', 16) + 'Agregar jugador</button>' +
        '</div>' +
      '</header>' +

      '<section class="j5-kpis" aria-label="Indicadores del plantel">' +
        j5Kpi(total, 'En plantel', 'Visibles en el listado', 'users') +
        j5Kpi(sinGrupo, 'Sin grupo', 'Pendientes de asignación', 'user-round-plus') +
        j5Kpi(conAlerta, 'Con alerta', 'Tres o más faltas', 'octagon-alert') +
        j5Kpi(inactivos, 'Inactivos', 'Fuera del listado activo', 'user-x') +
      '</section>' +

      '<section class="j5-filtros" aria-label="Buscar y filtrar jugadores">' +
        '<div class="j5-filtros-cab"><h2>' + icono('list-filter', 16) + 'Buscar y filtrar</h2>' +
          '<span id="j5-contador" aria-live="polite">' + total + (total === 1 ? ' jugador' : ' jugadores') + '</span></div>' +
        '<div class="j5-filtros-grid">' +
          '<label class="j5-campo"><span>Buscar por nombre</span>' +
            '<span class="j5-input-ico">' + icono('search', 16) +
              '<input class="input" id="j5-buscar" type="search" placeholder="Ej: CR7" ' +
              'autocomplete="off" aria-label="Buscar jugadores por nombre">' +
            '</span></label>' +
          '<label class="j5-campo"><span>Grupo</span>' +
            '<select class="input" id="j5-grupo" aria-label="Filtrar por grupo">' +
              '<option value="">Todos los grupos</option>' + opcionesGrupo +
              (sinGrupo ? '<option value="__sin">Sin asignar</option>' : '') +
            '</select></label>' +
          '<label class="j5-campo"><span>Estado</span>' +
            '<select class="input" id="j5-estado" aria-label="Filtrar por estado">' +
              '<option value="">Todos los estados</option>' +
              '<option value="activo">Activo</option>' +
              '<option value="suspendido">Suspendido</option>' +
              '<option value="expulsado">Expulsado</option>' +
            '</select></label>' +
          '<button type="button" class="btn sec j5-limpiar" data-j5-limpiar>' +
            icono('rotate-ccw', 16) + 'Limpiar</button>' +
        '</div>' +
        '<p class="j5-filtros-nota">' + icono('info', 14) +
          'Los filtros actúan sobre la lista ya cargada; no modifican el torneo.</p>' +
      '</section>' +

      '<section class="j5-panel">' +
        '<div class="j5-panel-cab">' +
          '<div><h2>Plantel del torneo</h2>' +
            '<p>' + (primeraSemana ? 'Cambio de grupo disponible durante la primera semana.' :
              'Gestioná roles, contacto, grupo y disciplina de cada jugador.') + '</p></div>' +
          GL.badge(total + (total === 1 ? ' activo' : ' activos'), 'neutral', 'users') +
        '</div>' +
        '<div class="tabla-wrap j5-tabla-wrap">' +
          '<table class="tabla j5-tabla">' +
            '<caption class="sr-only">Listado de jugadores del torneo activo</caption>' +
            '<thead><tr><th class="izq">Nombre</th><th>País</th><th>Horario</th><th>Contacto</th>' +
            '<th>Grupo</th><th>Rol</th><th>Estado</th><th>Faltas</th><th>Acciones</th></tr></thead>' +
            '<tbody id="j5-body">' + (filas || filaVacia) + filaSinResultados + '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  /* Filtros locales de solo presentación: reutilizan la lista ya cargada. */
  function enlazarFiltrosJugadores(cont) {
    const buscar = cont.querySelector('#j5-buscar');
    const grupo = cont.querySelector('#j5-grupo');
    const estado = cont.querySelector('#j5-estado');
    const contador = cont.querySelector('#j5-contador');
    const cuerpo = cont.querySelector('#j5-body');
    if (!buscar || !grupo || !estado || !cuerpo) return;

    const filas = [...cuerpo.querySelectorAll('tr.j5-fila')];
    const filaVacia = cuerpo.querySelector('.j5-fila-vacia');
    const filaSinResultados = cuerpo.querySelector('.j5-fila-sin-resultados');
    const total = filas.length;
    const normalizar = texto => String(texto || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const aplicar = () => {
      const texto = normalizar(buscar.value.trim());
      const grupoValor = grupo.value;
      const estadoValor = estado.value;
      let visibles = 0;

      filas.forEach(fila => {
        const coincideTexto = !texto || normalizar(fila.dataset.j5Nombre).includes(texto);
        const coincideGrupo = !grupoValor ||
          (grupoValor === '__sin' ? !fila.dataset.j5Grupo : fila.dataset.j5Grupo === grupoValor);
        const coincideEstado = !estadoValor || fila.dataset.j5Estado === estadoValor;
        const mostrar = coincideTexto && coincideGrupo && coincideEstado;
        fila.hidden = !mostrar;
        if (mostrar) visibles++;
      });

      if (contador) {
        contador.textContent = visibles + (visibles === 1 ? ' jugador' : ' jugadores') +
          (visibles !== total ? ' de ' + total : '');
      }
      if (filaVacia) filaVacia.hidden = total > 0;
      if (filaSinResultados) filaSinResultados.hidden = !(total > 0 && visibles === 0);
    };

    [buscar, grupo, estado].forEach(el =>
      el.addEventListener(el === buscar ? 'input' : 'change', aplicar));
    cont.querySelectorAll('[data-j5-limpiar]').forEach(b => b.addEventListener('click', () => {
      buscar.value = ''; grupo.value = ''; estado.value = '';
      aplicar();
      buscar.focus();
    }));
    aplicar();
  }
  /* ── Menú flotante / bottom sheet ── */
  function abrirMenuAcciones(ancla, titulo, items, jugador, root, esMobile) {
    // Cerrar cualquier menú previo
    cerrarMenuAcciones();

    const accionar = (accion) => {
      cerrarMenuAcciones();
      const corte = accion.indexOf('-');
      const tipo  = accion.slice(0, corte);
      const id    = accion.slice(corte + 1);
      const j     = GL.jugador(id);
      if (!j) return;
      if (tipo === 'editar')   modalEditar(j, root);
      if (tipo === 'telefono') modalConfirmarTelefono(j, root);
      if (tipo === 'grupo')    modalGrupo(j, root);
      if (tipo === 'asignar')  modalGrupo(j, root, true);
      if (tipo === 'sancion')  modalSancion(j, root);
      if (tipo === 'suspender') modalSuspender(j, root);
      if (tipo === 'eliminar')  modalEliminarJugador(j, root);
    };

    const ACCIONES_PELIGROSAS = ['suspender', 'eliminar', 'expulsar'];
    const esPeligrosa = accion => ACCIONES_PELIGROSAS.some(p => accion.startsWith(p));
    const botonesHTML = items.map(item => {
      const peligrosa = esPeligrosa(item.accion);
      return '<button type="button" class="btn sec menu-accion-btn' +
        (peligrosa ? ' menu-accion-peligrosa' : '') +
        '" data-accion-menu="' + esc(item.accion) + '" aria-label="' + esc(item.label) + '">' +
        icono(item.ico, 16) +
        '<span class="menu-accion-label">' + esc(item.label) + '</span>' +
        (peligrosa ? '<span class="menu-accion-aviso" aria-hidden="true">⚠</span>' : '') +
      '</button>';
    }).join('');

    if (esMobile) {
      // Bottom sheet
      const fondo = document.createElement('div');
      fondo.className = 'menu-bottom-sheet-fondo';
      const sheet = document.createElement('div');
      sheet.className = 'menu-bottom-sheet';
      sheet.innerHTML =
        '<div class="menu-bottom-sheet-titulo">' + icono('user', 16) + esc(titulo) + '</div>' +
        botonesHTML;
      document.body.appendChild(fondo);
      document.body.appendChild(sheet);
      iniciarIconos();
      sheet.querySelectorAll('[data-accion-menu]').forEach(b =>
        b.addEventListener('click', () => accionar(b.dataset.accionMenu)));
      fondo.addEventListener('click', cerrarMenuAcciones);
      // Accesibilidad teclado: Escape cierra
      const onKey = e => { if (e.key === 'Escape') cerrarMenuAcciones(); };
      document.addEventListener('keydown', onKey, { once: true });
      fondo._onKey = onKey;
      ancla.setAttribute('aria-expanded', 'true');
      window._menuAccionesActivo = { fondo, sheet, ancla };
    } else {
      // Menú flotante posicionado respecto a la pantalla
      const fondo = document.createElement('div');
      fondo.className = 'menu-flotante-fondo';
      const menu = document.createElement('div');
      menu.className = 'menu-flotante';
      menu.setAttribute('role', 'menu');
      menu.innerHTML = botonesHTML;

      document.body.appendChild(fondo);
      document.body.appendChild(menu);
      iniciarIconos();

      // Posicionar: calcular para que no se salga de la pantalla
      const rect   = ancla.getBoundingClientRect();
      const mW     = menu.offsetWidth  || 210;
      const mH     = menu.offsetHeight || 160;
      const vW     = window.innerWidth;
      const vH     = window.innerHeight;
      let top  = rect.bottom + 6;
      let left = rect.right - mW;
      if (left < 8)        left = 8;
      if (left + mW > vW)  left = vW - mW - 8;
      if (top + mH > vH)   top  = rect.top - mH - 6;  // abre hacia arriba si no hay espacio
      if (top < 8)         top  = 8;
      menu.style.top  = top  + 'px';
      menu.style.left = left + 'px';

      menu.querySelectorAll('[data-accion-menu]').forEach(b =>
        b.addEventListener('click', () => accionar(b.dataset.accionMenu)));
      fondo.addEventListener('click', cerrarMenuAcciones);
      const onKey = e => { if (e.key === 'Escape') cerrarMenuAcciones(); };
      document.addEventListener('keydown', onKey, { once: true });
      fondo._onKey = onKey;
      ancla.setAttribute('aria-expanded', 'true');
      window._menuAccionesActivo = { fondo, menu, ancla };
    }
  }

  function cerrarMenuAcciones() {
    const activo = window._menuAccionesActivo;
    if (!activo) return;
    if (activo.fondo)  { if (activo.fondo._onKey) document.removeEventListener('keydown', activo.fondo._onKey); activo.fondo.remove(); }
    if (activo.sheet)  activo.sheet.remove();
    if (activo.menu)   activo.menu.remove();
    if (activo.ancla)  activo.ancla.setAttribute('aria-expanded', 'false');
    window._menuAccionesActivo = null;
  }

  /* ── Fin menú flotante ── */
  function iconBtn(id, ico, title) {
    return '<button type="button" class="btn-icon" data-accion="' + id + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
      icono(ico, 15) + '</button>';
  }

  function accionBtn(id, ico, label) {
    return '<button type="button" class="btn sec sm" data-accion="' + id + '">' + icono(ico, 15) + esc(label) + '</button>';
  }

  function esPrimeraSemana() {
    const t = GL.torneo();
    if (!t || !t.created_at) return false;
    const inicio = Date.parse(t.created_at);
    if (!Number.isFinite(inicio)) return false;
    return (Date.now() - inicio) <= 7 * 24 * 3600 * 1000;
  }

  /* ---------------- A2. Equipos (grupos reales del torneo) ---------------- */
  function e6Miembros(g) {
    return (GL.ctx.miembros || []).filter(m => m.grupo_id === g.id);
  }

  function e6Kpi(valor, etiqueta, nota, ico) {
    return '<article class="e6-kpi">' +
      '<span class="e6-kpi-ico">' + icono(ico, 20) + '</span>' +
      '<span class="e6-kpi-copy">' +
        '<strong class="e6-kpi-valor">' + esc(valor) + '</strong>' +
        '<span class="e6-kpi-label">' + esc(etiqueta) + '</span>' +
        '<span class="e6-kpi-nota">' + esc(nota) + '</span>' +
      '</span></article>';
  }

  function e6Estado(j) {
    if (j.activo === false || j.rol === 'expulsado') return { texto: 'Expulsado', tono: 'red' };
    if (j.suspendido) return { texto: 'Suspendido', tono: 'orange' };
    return { texto: 'Activo', tono: 'green' };
  }

  function e6MiembroHTML(j) {
    const estado = e6Estado(j);
    return '<li class="e6-miembro">' +
      GL.avatarHTML(j, 'avatar-sm') +
      '<span class="e6-miembro-copy"><strong>' + esc(j.nombre_usuario) + '</strong>' +
        '<small>' + esc(GL.nombrePais(j.pais)) + ' · ' + esc(estado.texto) + '</small></span>' +
      '<span class="e6-miembro-acciones acciones-escritorio">' +
        '<span class="acciones-tabla">' + iconBtn('editar-' + j.id, 'pencil', 'Editar jugador') + '</span>' +
      '</span>' +
      '<span class="e6-miembro-acciones acciones-movil">' +
        '<button type="button" class="btn-icon btn-menu-acciones" ' +
          'data-jugador-id="' + esc(j.id) + '" data-jugador-nombre="' + esc(j.nombre_usuario) + '" ' +
          'aria-label="Acciones de ' + esc(j.nombre_usuario) + '" ' +
          'aria-haspopup="true" aria-expanded="false">' + icono('ellipsis', 18) + '</button>' +
      '</span></li>';
  }

  function e6FichaHTML(m) {
    const j = GL.jugador(m.jugador_id);
    if (j) return e6MiembroHTML(j);
    const idCorto = String(m.jugador_id || '').slice(0, 8);
    return '<li class="e6-miembro">' +
      '<span class="avatar-sm" aria-hidden="true">?</span>' +
      '<span class="e6-miembro-copy"><strong>Jugador ' + esc(idCorto) + '</strong>' +
        '<small>Relación registrada · detalle no disponible</small></span>' +
    '</li>';
  }

  function e6Tarjeta(g, esperados) {
    const miembros = e6Miembros(g);
    const cantidad = miembros.length;
    const completo = cantidad >= esperados;
    const pct = esperados > 0 ? Math.min(100, Math.round((cantidad / esperados) * 100)) : 0;
    const cobertura = cantidad === 0 ? 'sin-jugadores' : (completo ? 'completo' : 'incompleto');
    const estadoTexto = cantidad === 0 ? 'Sin jugadores' : (completo ? 'Completo' : 'Incompleto');
    const estadoTono = cantidad === 0 ? 'neutral' : (completo ? 'green' : 'orange');
    const partidosG = Mod.partidosCache.filter(p => p.grupo_id === g.id);
    const jugados = partidosG.filter(p => p.estado !== 'pendiente').length;
    const pendientes = partidosG.length - jugados;
    const fichas = miembros.map(m => GL.jugador(m.jugador_id)).filter(Boolean);
    const suspendidos = fichas.filter(j => j.activo === false || j.suspendido || j.rol === 'expulsado').length;
    const letra = esc(GL.letraGrupo(g));
    const panelId = 'e6-jugadores-' + esc(g.id);

    return '<article class="e6-card" data-e6-id="' + esc(g.id) + '" ' +
        'data-e6-nombre="' + esc((g.nombre || '') + ' grupo ' + letra) + '" ' +
        'data-e6-cobertura="' + cobertura + '" data-e6-jugadores="' + cantidad + '">' +
      '<header class="e6-card-cabeza">' +
        '<span class="e6-escudo" aria-hidden="true">' + icono('shield', 24) + '</span>' +
        '<span class="e6-identidad"><h3 class="e6-nombre">' + esc(g.nombre || ('Grupo ' + letra)) + '</h3>' +
          '<span class="e6-subtitulo">Grupo ' + letra + ' · Equipo del torneo</span></span>' +
        GL.badge(estadoTexto, estadoTono) +
      '</header>' +
      '<div class="e6-metrica">' +
        '<strong>' + cantidad + '<span>/' + esperados + '</span></strong>' +
        '<span>Jugadores asignados</span>' +
      '</div>' +
      '<div class="e6-progreso" role="img" aria-label="' + cantidad + ' de ' + esperados + ' jugadores asignados">' +
        '<span style="width:' + pct + '%"></span></div>' +
      '<div class="e6-card-stats">' +
        '<span>' + icono('check-circle-2', 14) + jugados + ' partidos jugados</span>' +
        '<span>' + icono('clock', 14) + pendientes + ' pendientes</span>' +
        (suspendidos ? '<span>' + icono('triangle-alert', 14) + suspendidos + ' sin disponibilidad</span>' : '') +
      '</div>' +
      '<div class="e6-card-acciones">' +
        '<button type="button" class="btn sec sm" data-e6-ver="' + esc(g.id) + '" ' +
          'aria-expanded="false" aria-controls="' + panelId + '">' +
          icono('users', 16) + 'Ver jugadores</button>' +
        '<button type="button" class="btn sec sm" data-tab-ir="jugadores">' +
          icono('list', 16) + 'Ver plantel</button>' +
      '</div>' +
      '<div class="e6-jugadores" id="' + panelId + '" hidden>' +
        '<div class="e6-jugadores-cab"><strong>Jugadores asignados</strong>' +
          '<span>' + cantidad + '</span></div>' +
        (cantidad
          ? '<ul class="e6-lista-jugadores">' + miembros.map(e6FichaHTML).join('') + '</ul>'
          : '<p class="e6-lista-vacia">' + icono('user-round-plus', 16) +
            'Este equipo todavía no tiene jugadores asignados.</p>') +
      '</div>' +
    '</article>';
  }

  function htmlEquipos() {
    const grupos = GL.grupos();
    const esperados = Number((GL.torneo() && GL.torneo().jugadores_por_grupo) || 12);
    const asignados = grupos.reduce((n, g) => n + e6Miembros(g).length, 0);
    const sinGrupo = GL.jugadoresSinGrupo().length;
    const completos = grupos.filter(g => e6Miembros(g).length >= esperados).length;
    const torneo = GL.torneo() || {};
    const detalleJugadores = !(GL.ctx.jugadores || []).length && (GL.ctx.miembros || []).length
      ? ' Los nombres de jugadores no están disponibles en este momento; se muestran las relaciones registradas.'
      : '';

    const kpis = e6Kpi(grupos.length, 'Equipos', 'Grupos del torneo activo', 'shield') +
      e6Kpi(asignados, 'Jugadores asignados', 'Vinculados a un equipo', 'users') +
      e6Kpi(sinGrupo, 'Sin equipo', 'Pendientes de asignación', 'user-round-plus') +
      e6Kpi(completos, 'Completos', 'Con la cantidad esperada', 'circle-check-big');

    return '<div class="e6-pantalla" data-equipos>' +
      '<header class="e6-hero">' +
        '<div class="e6-hero-copy">' +
          '<span class="e6-eyebrow">' + icono('shield', 14) + 'Administración · Equipos</span>' +
          '<h1 class="e6-titulo">Equipos</h1>' +
          '<p class="e6-bajada">Los equipos de la temporada son los grupos ya creados con el torneo activo.</p>' +
        '</div>' +
        '<div class="e6-hero-acciones">' +
          '<span class="e6-contexto">' + icono('trophy', 14) + esc(torneo.nombre || CONFIG.NOMBRE_LIGA) + '</span>' +
          '<span class="e6-contexto">' + icono('users', 14) + esperados + ' jugadores por equipo</span>' +
        '</div>' +
      '</header>' +
      '<p class="e6-nota">' + icono('info', 14) +
        ' Los equipos se generan al crear el torneo. Esta vista consulta la relación con los jugadores; no crea, elimina ni cambia grupos.' +
        detalleJugadores +
      '</p>' +
      '<section class="e6-kpis" aria-label="Indicadores de equipos">' + kpis + '</section>' +
      (grupos.length
        ? '<section class="e6-filtros" aria-label="Buscar y filtrar equipos">' +
            '<div class="e6-filtros-cab"><h2>' + icono('list-filter', 16) + 'Buscar y filtrar</h2>' +
              '<span id="e6-contador" aria-live="polite">' + grupos.length +
                (grupos.length === 1 ? ' equipo' : ' equipos') + '</span></div>' +
            '<div class="e6-filtros-grid">' +
              '<label class="e6-campo"><span>Buscar equipo</span>' +
                '<span class="e6-input-ico">' + icono('search', 16) +
                  '<input class="input" id="e6-buscar" type="search" placeholder="Ej: Grupo A" ' +
                  'autocomplete="off" aria-label="Buscar equipos por nombre">' +
                '</span></label>' +
              '<label class="e6-campo"><span>Cobertura</span>' +
                '<select class="input" id="e6-cobertura" aria-label="Filtrar equipos por cobertura">' +
                  '<option value="">Todas las coberturas</option>' +
                  '<option value="completo">Completos</option>' +
                  '<option value="incompleto">Incompletos</option>' +
                  '<option value="sin-jugadores">Sin jugadores</option>' +
                '</select></label>' +
              '<button type="button" class="btn sec e6-limpiar" data-e6-limpiar>' +
                icono('rotate-ccw', 16) + 'Limpiar</button>' +
            '</div>' +
            '<p class="e6-filtros-nota">' + icono('info', 14) +
              ' Los filtros actúan sobre los equipos ya cargados; no modifican el torneo.</p>' +
          '</section>' +
          '<section class="e6-panel">' +
            '<div class="e6-panel-cab"><div><h2>Equipos del torneo</h2>' +
              '<p>Cobertura real del plantel y partidos ya registrados por equipo.</p></div>' +
              GL.badge(grupos.length + (grupos.length === 1 ? ' equipo' : ' equipos'), 'neutral', 'shield') +
            '</div>' +
            '<div class="e6-grid" id="e6-lista">' + grupos.map(g => e6Tarjeta(g, esperados)).join('') + '</div>' +
            '<div class="e6-estado-vacio" id="e6-sin-resultados" hidden>' + icono('search-x', 30) +
              '<strong>Sin coincidencias</strong>' +
              '<span>Probá con otro nombre o quitá los filtros activos.</span>' +
              '<button type="button" class="btn sec sm" data-e6-limpiar>' +
                icono('rotate-ccw', 15) + 'Limpiar filtros</button></div>' +
          '</section>'
        : '<section class="e6-panel"><div class="e6-estado-vacio" id="e6-vacio">' +
            icono('shield', 30) + '<strong>Sin equipos registrados</strong>' +
            '<span>El torneo activo no tiene grupos cargados.</span>' +
            '<button type="button" class="btn sec sm" data-tab-ir="config">' +
              icono('settings-2', 15) + 'Ir a configuración</button></div></section>') +
    '</div>';
  }

  /* Filtros locales de solo presentación sobre los grupos ya cargados. */
  function enlazarFiltrosEquipos(cont) {
    const buscar = cont.querySelector('#e6-buscar');
    const cobertura = cont.querySelector('#e6-cobertura');
    const contador = cont.querySelector('#e6-contador');
    const lista = cont.querySelector('#e6-lista');
    if (!buscar || !cobertura || !lista) return;

    const tarjetas = [...lista.querySelectorAll('.e6-card')];
    const sinResultados = cont.querySelector('#e6-sin-resultados');
    const total = tarjetas.length;
    const normalizar = texto => String(texto || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const aplicar = () => {
      const texto = normalizar(buscar.value.trim());
      const estado = cobertura.value;
      let visibles = 0;
      tarjetas.forEach(tarjeta => {
        const coincideTexto = !texto || normalizar(tarjeta.dataset.e6Nombre).includes(texto);
        const coincideCobertura = !estado || tarjeta.dataset.e6Cobertura === estado;
        const mostrar = coincideTexto && coincideCobertura;
        tarjeta.hidden = !mostrar;
        if (mostrar) visibles++;
      });
      if (contador) {
        contador.textContent = visibles + (visibles === 1 ? ' equipo' : ' equipos') +
          (visibles !== total ? ' de ' + total : '');
      }
      if (sinResultados) sinResultados.hidden = !(total > 0 && visibles === 0);
    };

    [buscar, cobertura].forEach(el =>
      el.addEventListener(el === buscar ? 'input' : 'change', aplicar));
    cont.querySelectorAll('[data-e6-limpiar]').forEach(b => b.addEventListener('click', () => {
      buscar.value = ''; cobertura.value = '';
      aplicar();
      buscar.focus();
    }));
    aplicar();
  }

  function enlazarEquipos(cont) {
    cont.querySelectorAll('[data-e6-ver]').forEach(btn => btn.addEventListener('click', () => {
      const tarjeta = btn.closest('.e6-card');
      const panel = tarjeta && tarjeta.querySelector('.e6-jugadores');
      if (!panel) return;
      const abierto = btn.getAttribute('aria-expanded') === 'true';
      panel.hidden = abierto;
      btn.setAttribute('aria-expanded', String(!abierto));
      btn.innerHTML = icono('users', 16) + (abierto ? 'Ver jugadores' : 'Ocultar jugadores');
      iniciarIconos();
    }));
  }

  /* ---------------- B. Jornadas ---------------- */
  function htmlJornadas() {
    const grupos = GL.grupos();
    const total = (GL.torneo() && Number(GL.torneo().total_jornadas)) || 22;
    const actual = GL.jornadaActual().numero;
    const jornadas = GL.ctx.jornadas.filter(j => j.grupo_id === Mod.grupoJornadas && j.numero <= total);
    const items = Array.from({ length: total }, (_, i) => i + 1).map(n => {
      const jdata = jornadas.find(x => x.numero === n) || { estado: 'abierta', fecha: null, numero: n };
      const parts = Mod.partidosCache.filter(p => p.jornada === n && p.grupo_id === Mod.grupoJornadas);
      const hechos = parts.filter(p => p.estado !== 'pendiente').length;
      const pct = parts.length ? Math.round(hechos / parts.length * 100) : 0;
      return '<div class="timeline-item ' + (n === actual ? 'activa' : '') + (jdata.estado === 'cerrada' ? ' cerrada' : '') + '">' +
        '<div class="timeline-num">' + n + '</div>' +
        '<div class="timeline-contenido"><strong>Jornada ' + n + '</strong>' +
          '<small>' + esc(aDDMMYYYY(jdata.fecha)) + ' · ' +
            (jdata.fecha_inicio && jdata.hora_limite
              ? aDDMMYYYY(jdata.fecha_inicio) + ' · ' +
                GL.horaEnZona(jdata.fecha_inicio, CONFIG.ZONA_REFERENCIA) + ' – ' +
                GL.horaEnZona(jdata.hora_limite, CONFIG.ZONA_REFERENCIA)
              : 'Horario por definir') +
            ' · ' + hechos + '/' + parts.length + ' partidos</small>' +
          (jdata.estado === 'cerrada' ? GL.badge('Cerrada', 'red') : GL.badge('Abierta', 'green')) +
          '<div style="flex:1;min-width:90px;max-width:130px"><div class="barra-progreso"><span style="width:' + pct + '%"></span></div></div>' +
          '<button type="button" class="btn sm sec" data-editar-jornada="' + n + '">' + icono('clock', 14) + 'Horario</button>' +
          '<button type="button" class="btn sm sec" data-ver-jornada="' + n + '">' + icono('eye', 14) + 'Ver</button>' +
          (jdata.estado === 'abierta'
            ? '<button type="button" class="btn sm" data-cerrar-jornada="' + n + '">' + icono('lock', 14) + 'Cerrar</button>'
            : '<button type="button" class="btn sm sec" data-abrir-jornada="' + n + '">' + icono('unlock', 14) + 'Abrir</button>') +
        '</div></div>';
    }).join('');
    return '<div class="seccion-head"><div class="seccion-titulo"><h2>Gestión de jornadas</h2>' +
      '<p>Abrí, cerrá y resolvé los partidos pendientes al cierre</p></div></div>' +
      '<div class="tabs">' + grupos.map(g => '<button type="button" class="tab' +
        (g.id === Mod.grupoJornadas ? ' activo' : '') + '" data-grupo-j="' + g.id + '">Grupo ' + GL.letraGrupo(g) + '</button>').join('') + '</div>' +
      '<div class="card"><div class="timeline">' + items + '</div></div>';
  }

  /* ---------------- C. Disciplina ---------------- */
  function htmlDisciplina() {
    const sanciones = GL.ctx.sanciones;
    const contador = {};
    sanciones.forEach(s => contador[s.jugador_id] = (contador[s.jugador_id] || 0) + 1);
    const filas = sanciones.map((s, i) => {
      const tipo = TIPOS_SANCION[s.tipo] || { label: s.tipo };
      return '<tr data-fila-sancion="' + esc((GL.nombreJugador(s.jugador_id) + ' ' + (s.motivo || '')).toLowerCase()) + '" style="animation-delay:' + (i * .03) + 's">' +
        '<td class="izq">' + esc(GL.nombreJugador(s.jugador_id)) + '<small class="extra"> · ' + (contador[s.jugador_id] || 1) + ' falta(s)</small></td>' +
        '<td>' + GL.badge(tipo.label, s.tipo === 'muy_grave' ? 'red' : s.tipo === 'grave' ? 'orange' : 'neutral') + '</td>' +
        '<td class="num">-' + (s.puntos_descuento || 0) + '</td>' +
        '<td class="num">' + (s.partidos_suspension || 0) + '</td>' +
        '<td>' + esc(s.motivo || '—') + '</td>' +
        '<td>' + esc(aDDMMYYYY(s.created_at)) + '</td></tr>';
    }).join('');
    return '<div class="seccion-head"><div class="seccion-titulo"><h2>Disciplina</h2>' +
      '<p>' + sanciones.length + ' sanciones registradas en el torneo</p></div>' +
      '<div class="seccion-acciones"><label class="campo" style="margin:0"><span>Buscar</span>' +
        '<input class="input" id="buscar-sancion" placeholder="Jugador o motivo">' +
      '</label></div></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th class="izq">Jugador</th><th>Tipo</th><th>Puntos</th><th>Partidos</th><th class="izq">Motivo</th><th>Fecha</th></tr></thead>' +
      '<tbody id="cuerpo-sanciones">' + (filas || '<tr><td colspan="6" class="vacio-mensaje">Sin sanciones registradas.</td></tr>') + '</tbody></table></div>';
  }

  /* ---------------- D. Administradores ---------------- */
  function htmlAdmins() {
    const admins = GL.jugadores().filter(j => j.rol === 'admin');
    const filas = admins.map(j => {
      const yo = Auth.usuario && j.user_id === Auth.usuario.id;
      const correo = j.email || 'Sin correo cargado';
      return '<tr><td class="izq"><div class="jugador-celda">' + GL.avatarHTML(j, 'avatar-sm') +
        '<span>' + esc(j.nombre_usuario) + (yo ? ' ' + GL.badge('Vos', 'gold') : '') + '</span></div></td>' +
        '<td class="izq">' + esc(correo) + '</td>' +
        '<td>' + GL.badge(j.super_admin ? 'Administrador principal' : 'Administrador', 'gold', 'shield') + '</td>' +
        '<td>' + (j.activo === false ? GL.badge('Inactivo', 'red') : GL.badge('Activo', 'green')) + '</td>' +
        '<td>' + (j.email && !yo && !j.super_admin
          ? '<button type="button" class="btn sm sec" data-admin-quitar="' + esc(j.email) + '">' + icono('user-minus', 14) + 'Quitar rol</button>'
          : '<span class="muted">—</span>') + '</td></tr>';
    }).join('');
    return '<div class="seccion-head"><div class="seccion-titulo"><h2>Administradores</h2>' +
      '<p>Designá a quién puede cargar resultados, jornadas y mensajes</p></div></div>' +
      '<div class="grid dos">' +
        '<div class="card"><div class="card-titulo">' + icono('shield-check', 20) + 'Rol asignado</div>' +
          '<div class="tabla-wrap"><table class="tabla"><thead><tr><th class="izq">Nombre</th><th class="izq">Correo</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead><tbody>' +
          (filas || '<tr><td colspan="5" class="vacio-mensaje">No hay administradores cargados.</td></tr>') +
          '</tbody></table></div></div>' +
        '<div class="card"><div class="card-titulo">' + icono('user-plus', 20) + 'Añadir administrador</div>' +
          '<p class="muted" style="font-size:12px">Si el correo ya tiene cuenta, conserva su contraseña. Si no, se crea con la clave de administrador configurada en el servidor.</p>' +
          '<label class="campo mt"><span>Correo electrónico</span><input class="input" type="email" id="adm-email" autocomplete="email" placeholder="jugador@correo.com" required></label>' +
          '<label class="campo"><span>Nombre en el juego (opcional)</span><input class="input" id="adm-nombre" maxlength="32" placeholder="Ej. GOAT_ADMIN"></label>' +
          '<button type="button" class="btn block" id="adm-agregar">' + icono('shield-plus', 16) + 'Designar administrador</button>' +
          '<p class="nota-pie">La clave de administrador no se guarda en el navegador: se valida en el servidor.</p>' +
        '</div>' +
        '<div class="card"><div class="card-titulo">' + icono('key-round', 20) + 'Clave de administrador</div>' +
          '<p class="muted" style="font-size:12px">Solo el administrador principal puede consultarla para compartirla de forma privada con otros administradores.</p>' +
          '<button type="button" class="btn sec block mt" data-ver-clave>' + icono('eye', 16) + 'Ver clave de administrador</button>' +
          '<p class="nota-pie">La clave se obtiene del servidor únicamente con tu sesión de administrador principal.</p>' +
        '</div></div>';
  }

  /* ---------------- E. Configuración ---------------- */
  function htmlConfig() {
    const t = GL.torneo() || {};
    return htmlAccionesTorneo() +
      '<div class="card mt"><div class="card-titulo">' + icono('settings-2', 20) + 'Datos generales del torneo</div>' +
        '<label class="campo"><span>Nombre</span><input class="input" id="cfg-nombre" value="' + esc(t.nombre || '') + '"></label>' +
        '<label class="campo"><span>Temporada</span><input class="input" id="cfg-temporada" value="' + esc(t.temporada || '') + '"></label>' +
        '<label class="campo"><span>Total de jornadas (1..' + MAX_JORNADAS + ')</span>' +
          '<input class="input" type="number" min="1" max="' + MAX_JORNADAS + '" id="cfg-jornadas" value="' +
          (Number(t.total_jornadas) || CONFIG.JORNADAS_FASE_REGULAR) + '"></label>' +
        '<p class="nota-pie">El generador aleatorio solo trabaja con 22 jornadas. Para otro valor, cargá las jornadas de forma manual en el paso 3.</p>' +
        '<label class="campo"><span>Estado</span><select class="input" id="cfg-estado">' +
          '<option value="activo"' + (t.estado === 'activo' ? ' selected' : '') + '>Activo</option>' +
          '<option value="finalizado"' + (t.estado === 'finalizado' ? ' selected' : '') + '>Finalizado</option>' +
        '</select></label>' +
        '<label class="campo"><span>Reglamento vigente (se incluye en los mensajes)</span>' +
          '<textarea class="input" id="cfg-reglamento" rows="5" placeholder="Reglas de duración, margen, inasistencias y capturas">' + esc(t.reglamento || '') + '</textarea></label>' +
        '<p class="nota-pie">Este texto se usa en la apertura de cada jornada. Si está vacío, el generador de mensajes bloquea la vista previa.</p>' +
        '<button type="button" class="btn" id="guardar-cfg">' + icono('save', 16) + 'Guardar cambios</button>' +
      '</div>' +
      htmlNuevaTemporada();
  }

  /* ---------------- Nueva Temporada (pasos numerados) ---------------- */

  function telefonoLegible(j) {
    const e164 = GL.tel.e164Jugador(j);
    if (!e164) return 'Sin teléfono';
    return GL.tel.formatear(e164, GL.tel.paisJugador(j)) || e164;
  }

  /* Etiqueta corta del prefijo según el país seleccionado en cada formulario. */
  function hintTel(paisVal) {
    const cfg = PAISES[String(paisVal || '').toUpperCase()];
    if (!cfg) return '';
    const longs = GL.tel.longitudes(paisVal);
    return '+' + cfg.prefijo + ' · ' + (longs.length === 1
      ? longs[0] + ' dígitos'
      : longs.join('/') + ' dígitos');
  }

  /* El prefijo y la validación siguen siempre al país del TELÉFONO, que puede
     diferir del país del jugador. El botón rota países para no separarlos. */
  function enlazarCampoTelefono(cont, opciones) {
    const selPais = cont.querySelector(opciones.pais);
    const input = cont.querySelector(opciones.tel);
    const boton = cont.querySelector(opciones.prefijo);
    const etiqueta = opciones.hint ? cont.querySelector(opciones.hint) : null;
    if (!selPais || !input || !boton) return;
    const actualizar = () => {
      const iso = selPais.value || 'NI';
      boton.textContent = GL.tel.prefijo(iso) ? '+' + GL.tel.prefijo(iso) : '+?';
      boton.dataset.iso = iso;
      if (etiqueta) etiqueta.textContent = hintTel(iso);
    };
    selPais.addEventListener('change', actualizar);
    boton.addEventListener('click', () => {
      const opcs = Array.from(selPais.options).map(x => x.value).filter(Boolean);
      const i = opcs.indexOf(selPais.value);
      selPais.value = opcs[(i + 1 + opcs.length) % opcs.length] || opcs[0];
      selPais.dispatchEvent(new Event('change'));
    });
    actualizar();
  }

  function pasoHTML(numero, titulo, ico, cuerpo) {
    return '<div class="card mt">' +
      '<div class="card-titulo"><span class="badge gold">' + numero + '</span>' +
        icono(ico, 18) + titulo + '</div>' + cuerpo + '</div>';
  }

  function opcionesJugadoresGrupo(grupoId, seleccionado) {
    const lista = GL.jugadores(grupoId);
    return '<option value="">Seleccioná un jugador</option>' +
      lista.map(j => {
        const etiqueta = String(j.nombre_usuario || '').toUpperCase() + ' · ' + telefonoLegible(j);
        return '<option value="' + esc(j.id) + '"' + (seleccionado === j.id ? ' selected' : '') + '>' +
          esc(etiqueta) + '</option>';
      }).join('');
  }

  function filaPartidoHTML(grupoId, datos) {
    const d = datos || {};
    return '<div class="campo-row" data-fila-partido style="align-items:end">' +
      '<label class="campo" style="margin:0;flex:1"><span>Local</span>' +
        '<select class="input" data-local>' + opcionesJugadoresGrupo(grupoId, d.local) + '</select></label>' +
      '<label class="campo" style="margin:0;flex:1"><span>Visitante</span>' +
        '<select class="input" data-visita>' + opcionesJugadoresGrupo(grupoId, d.visitante) + '</select></label>' +
      '<button type="button" class="btn-icon" data-quitar-partido title="Quitar partido" aria-label="Quitar partido">' +
        icono('x', 16) + '</button>' +
      '</div>';
  }

  function jornadasGuardadasHTML() {
    const tid = GL.torneoId();
    const guardadas = GL.ctx.jornadas
      .filter(j => j.torneo_id === tid && !j.virtual)
      .slice()
      .sort((a, b) => (a.numero || 0) - (b.numero || 0));
    if (!guardadas.length) return '<p class="muted" style="font-size:12px">Todavía no hay jornadas guardadas en la base de datos.</p>';
    return '<div class="tabla-wrap"><table class="tabla"><thead><tr>' +
      '<th>Jornada</th><th>Grupo</th><th>Fecha</th><th>Acción</th>' +
      '</tr></thead><tbody>' + guardadas.map(j => {
        const g = GL.ctx.grupos.find(x => x.id === j.grupo_id);
        return '<tr>' +
          '<td>Jornada ' + esc(j.numero) + '</td>' +
          '<td>' + (g ? 'Grupo ' + esc(GL.letraGrupo(g)) : '—') + '</td>' +
          '<td>' + esc(aDDMMYYYY(j.fecha || j.fecha_inicio)) + '</td>' +
          '<td><button type="button" class="btn sec sm" data-nt-borrar-jornada="' + esc(j.numero) +
            '" data-grupo="' + esc(j.grupo_id || '') + '">' + icono('trash-2', 14) + 'Eliminar jornada</button></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function htmlNuevaTemporada() {
    const t = GL.torneo() || {};
    const total = Number(t.total_jornadas) || CONFIG.JORNADAS_FASE_REGULAR;
    const grupos = GL.grupos();
    const jugadores = GL.jugadores();
    const grupoInicial = grupos.length ? grupos[0].id : '';
    const modoManual = total !== 22;

    const pasoDatos =
      '<p class="muted" style="font-size:12px">Definí la identidad de la temporada y cuántas jornadas tendrá. Se aceptan de 1 a ' +
        MAX_JORNADAS + ' jornadas.</p>' +
      '<div class="campo-row">' +
        '<label class="campo"><span>Nombre de la liga</span><input class="input" id="nt-nombre" maxlength="40" value="' +
          esc(t.nombre || CONFIG.NOMBRE_LIGA) + '"></label>' +
        '<label class="campo"><span>Temporada</span><input class="input" id="nt-temporada" maxlength="30" value="' +
          esc(t.temporada || '') + '"></label>' +
      '</div>' +
      '<label class="campo"><span>Número de jornadas</span><input class="input" type="number" min="1" max="' +
        MAX_JORNADAS + '" id="nt-jornadas" value="' + total + '"></label>' +
      '<button type="button" class="btn" id="nt-guardar-datos">' + icono('save', 16) + 'Guardar datos</button>';

    const filasJugadores = jugadores.length
      ? '<div class="tabla-wrap"><table class="tabla"><thead><tr>' +
          '<th class="izq">Nombre</th><th>Teléfono</th><th>Grupo</th><th>Acciones</th>' +
        '</tr></thead><tbody>' + jugadores.map(j => {
          const g = GL.grupoDeJugador(j.id);
          const esAdmin = j.rol === 'admin';
          return '<tr>' +
            '<td class="izq">' + esc(j.nombre_usuario) + (esAdmin ? ' ' + GL.badge('Admin', 'gold') : '') + '</td>' +
            '<td>' + esc(telefonoLegible(j)) + '</td>' +
            '<td>' + (g ? 'Grupo ' + esc(GL.letraGrupo(g)) : 'Sin asignar') + '</td>' +
            '<td>' +
              (g
                ? '<button type="button" class="btn sec sm" data-nt-quitar="' + esc(j.id) + '">Quitar del grupo</button> '
                : '<button type="button" class="btn sm" data-nt-asignar="' + esc(j.id) + '">Asignar Grupo</button> ') +
              (esAdmin
                ? '<span class="muted" style="font-size:11px">Las cuentas admin no se borran desde aquí.</span>'
                : '<button type="button" class="btn sec sm" data-nt-eliminar="' + esc(j.id) + '">Eliminar</button>') +
            '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : GL.vacio('No hay jugadores inscritos en este torneo.', 'users', null,
          'Usá el alta rápida de arriba para cargar el primer jugador.');

    const pasoJugadores =
      '<p class="muted" style="font-size:12px">Alta rápida: se crea la cuenta, se guarda el jugador y se lo asigna al grupo elegido.</p>' +
      '<div class="campo-row">' +
        '<label class="campo"><span>Nombre de usuario</span><input class="input" id="nt-jug-nombre" maxlength="32" placeholder="Ej. GOAT_PEREZ"></label>' +
        '<label class="campo"><span>Correo</span><input class="input" type="email" id="nt-jug-email" placeholder="jugador@correo.com"></label>' +
        '<label class="campo"><span>Clave</span><input class="input" id="nt-jug-clave" value="' +
          Math.random().toString(36).slice(2, 10) + '" autocomplete="new-password"></label>' +
      '</div>' +
      '<div class="campo-row">' +
        '<label class="campo"><span>País</span><select class="input" id="nt-jug-pais">' + GL.opcionesPais('NI', true) + '</select></label>' +
        '<label class="campo"><span>País del teléfono</span><select class="input" id="nt-jug-tel-pais">' + GL.opcionesPais('NI', false) + '</select></label>' +
        '<label class="campo"><span>Teléfono / WhatsApp (obligatorio)' +
          '<small id="nt-jug-tel-hint" style="color:var(--text-secondary)">' + hintTel('NI') + '</small></span>' +
          '<div class="tel-wrap">' +
            '<button type="button" class="tel-prefijo" id="nt-jug-tel-prefijo" aria-label="Código de país">+505</button>' +
            '<input class="input" id="nt-jug-tel" inputmode="numeric" placeholder="8108-5555" required>' +
          '</div>' +
        '</label>' +
        '<label class="campo"><span>Grupo</span><select class="input" id="nt-jug-grupo">' +
          (grupos.length
            ? grupos.map(g => '<option value="' + esc(g.id) + '">Grupo ' + esc(GL.letraGrupo(g)) + '</option>').join('')
            : '<option value="">Sin grupos disponibles</option>') +
        '</select></label>' +
      '</div>' +
      '<button type="button" class="btn" id="nt-jug-crear">' + icono('user-plus', 16) + 'Crear jugador</button>' +
      '<div class="mt" id="nt-lista-jugadores">' + filasJugadores + '</div>';

    const avisoRandom = total !== 22
      ? '<div style="background:rgba(245,197,24,.1);border:1px solid var(--accent-gold);border-radius:8px;' +
          'padding:10px 14px;margin-bottom:10px;font-size:13px">' +
          icono('triangle-alert', 14) + ' El generador aleatorio trabaja con <strong>22 jornadas</strong> y este torneo tiene ' +
          total + '. Usá el modo <strong>Cargar manualmente</strong> para respetar la configuración actual.' +
        '</div>'
      : '<p class="muted" style="font-size:12px">Genera las 22 jornadas con el calendario aleatorio del servidor.</p>';

    const pasoJornadas =
      '<p class="muted" style="font-size:12px">Elegí un modo. El modo manual respeta el número de jornadas configurado en el paso 1.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:18px;margin:8px 0 14px">' +
        '<label style="display:flex;gap:8px;align-items:center;cursor:pointer">' +
          '<input type="radio" name="nt-modo" id="nt-modo-aleatorio" value="aleatorio"' + (modoManual ? '' : ' checked') + '>' +
          'Generar aleatoriamente</label>' +
        '<label style="display:flex;gap:8px;align-items:center;cursor:pointer">' +
          '<input type="radio" name="nt-modo" id="nt-modo-manual" value="manual"' + (modoManual ? ' checked' : '') + '>' +
          'Cargar manualmente</label>' +
      '</div>' +
      '<div id="nt-panel-aleatorio" style="display:' + (modoManual ? 'none' : 'block') + '">' +
        avisoRandom +
        '<button type="button" class="btn" id="nt-generar-fixture">' + icono('shuffle', 16) + 'Generar calendario aleatorio</button>' +
      '</div>' +
      '<div id="nt-panel-manual" style="display:' + (modoManual ? 'block' : 'none') + '">' +
        '<div class="campo-row">' +
          '<label class="campo"><span>Número de jornada</span><input class="input" type="number" min="1" max="' +
            MAX_JORNADAS + '" id="nt-manual-numero" value="1"></label>' +
          '<label class="campo"><span>Fecha (DD/MM/YYYY)</span><input class="input" id="nt-manual-fecha" placeholder="DD/MM/YYYY"></label>' +
          '<label class="campo"><span>Grupo</span><select class="input" id="nt-manual-grupo">' +
            (grupos.length
              ? grupos.map(g => '<option value="' + esc(g.id) + '">Grupo ' + esc(GL.letraGrupo(g)) + '</option>').join('')
              : '<option value="">Sin grupos disponibles</option>') +
          '</select></label>' +
        '</div>' +
        '<div id="nt-partidos">' + filaPartidoHTML(grupoInicial, {}) + '</div>' +
        '<div class="seccion-acciones" style="flex-wrap:wrap;gap:8px;margin-top:8px">' +
          '<button type="button" class="btn sec" id="nt-agregar-partido">' + icono('plus', 16) + 'Agregar partido</button>' +
          '<button type="button" class="btn" id="nt-guardar-jornada">' + icono('save', 16) + 'Guardar jornada</button>' +
        '</div>' +
      '</div>' +
      '<div class="mt"><strong>Jornadas guardadas</strong>' + jornadasGuardadasHTML() + '</div>';

    return '<div class="seccion-head mt"><div class="seccion-titulo"><h2>Nueva Temporada</h2>' +
        '<p>Prepará la temporada en tres pasos: datos, jugadores y jornadas.</p>' +
      '</div></div>' +
      pasoHTML(1, 'Datos', 'settings-2', pasoDatos) +
      pasoHTML(2, 'Jugadores', 'users', pasoJugadores) +
      pasoHTML(3, 'Jornadas', 'calendar-days', pasoJornadas);
  }

  async function mensajeInvoke(error) {
    try {
      const cuerpo = await error.context.json();
      return cuerpo.error || error.message;
    } catch (e) { return error.message; }
  }

  /* ---------------- Acciones de torneo y Nueva Temporada ---------------- */

  function validarTotal(valor) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1 || n > MAX_JORNADAS)
      return { ok: false, mensaje: 'El número de jornadas debe estar entre 1 y ' + MAX_JORNADAS + '.' };
    return { ok: true, valor: n };
  }

  function abrirCrearTorneo(root) {
    const hayTorneo = !!GL.torneo();
    GL.dialogo({
      titulo: 'Crear Torneo',
      icono: 'trophy',
      ancho: 'md',
      confirmTexto: 'Crear torneo',
      cuerpo:
        '<p class="modal-texto">Se creará un torneo nuevo y quedará activo. ' +
          (hayTorneo ? 'El torneo anterior quedará archivado.' : 'Con él se cargan los grupos para empezar.') + '</p>' +
        '<label class="campo"><span>Nombre de la liga</span><input class="input" id="tor-nombre" maxlength="40" value="' +
          esc(CONFIG.NOMBRE_LIGA) + '"></label>' +
        '<label class="campo"><span>Temporada</span><input class="input" id="tor-temporada" maxlength="30" ' +
          'placeholder="Ej. 2026 · Clausura"></label>' +
        '<label class="campo"><span>Número de jornadas (1..' + MAX_JORNADAS + ')</span>' +
          '<input class="input" type="number" min="1" max="' + MAX_JORNADAS + '" id="tor-jornadas" value="' +
          CONFIG.JORNADAS_FASE_REGULAR + '"></label>',
      onConfirmar(fondo, cerrar, setBloqueado) {
        const nombre = fondo.querySelector('#tor-nombre').value.trim();
        const temporada = fondo.querySelector('#tor-temporada').value.trim();
        const jornadas = validarTotal(fondo.querySelector('#tor-jornadas').value);
        if (!nombre) { fondo.setError('Ingresá el nombre de la liga.'); return; }
        if (!temporada) { fondo.setError('Ingresá la temporada.'); return; }
        if (!jornadas.ok) { fondo.setError(jornadas.mensaje); return; }
        setBloqueado(true);
        (async () => {
          try {
            const { data, error } = await sb.rpc('gl_crear_torneo', {
              p_nombre_liga: nombre,
              p_temporada: temporada,
              p_total_jornadas: jornadas.valor
            });
            const r = leerRpc(data, error, 'No se pudo crear el torneo.');
            if (!r.ok) { fondo.setError(r.mensaje); setBloqueado(false); return; }
            cerrar();
            await recargarContextoAdmin();
            GL.notificar(r.mensaje || 'Torneo "' + nombre + '" creado correctamente.', 'exito');
            Mod.tab = 'resumen';
            Mod.render(root);
          } catch (e) {
            fondo.setError(GL.mensaje(e, 'guardar', 'la administración'));
            setBloqueado(false);
          }
        })();
      }
    });
    iniciarIconos();
  }

  function abrirEliminarTorneo(root) {
    const t = GL.torneo();
    if (!t) { GL.notificar('No hay torneo activo para eliminar.', 'advertencia'); return; }
    GL.dialogo({
      titulo: 'Eliminar torneo actual',
      icono: 'triangle-alert',
      tipo: 'peligro',
      ancho: 'sm',
      confirmTexto: 'Eliminar torneo',
      consecuencias:
        '<ul>' +
          '<li>Se eliminará el torneo <strong>' + esc(t.nombre || CONFIG.NOMBRE_LIGA) + '</strong> y sus datos asociados.</li>' +
          '<li>No se pueden eliminar cuentas administradoras: solo se quita el torneo.</li>' +
          '<li>Después la pantalla quedará en estado «sin torneo: creá uno».</li>' +
        '</ul>',
      cuerpo: '<p class="modal-texto">Esta acción no se puede deshacer. ¿Querés continuar?</p>',
      onConfirmar(fondo, cerrar, setBloqueado) {
        setBloqueado(true);
        (async () => {
          try {
            const { data, error } = await sb.rpc('gl_eliminar_torneo', { p_torneo_id: t.id });
            const r = leerRpc(data, error, 'No se pudo eliminar el torneo.');
            if (!r.ok) { fondo.setError(r.mensaje); setBloqueado(false); return; }
            cerrar();
            await recargarContextoAdmin({ sinTorneo: true });
            GL.notificar(r.mensaje || 'Torneo eliminado. Creá uno para empezar.', 'exito');
            Mod.tab = 'resumen';
            Mod.render(root);
          } catch (e) {
            fondo.setError(GL.mensaje(e, 'guardar', 'la administración'));
            setBloqueado(false);
          }
        })();
      }
    });
  }

  // Guarda datos generales (config) o del paso 1. El total de jornadas va por RPC.
  async function guardarDatosTorneo(cont, root, origen) {
    if (!GL.torneo()) { GL.notificar('No hay torneo activo.', 'error'); return; }
    const pref = origen === 'nt' ? 'nt-' : 'cfg-';
    const nombre = cont.querySelector('#' + pref + 'nombre').value.trim();
    const temporada = cont.querySelector('#' + pref + 'temporada').value.trim();
    const jornadas = validarTotal(cont.querySelector('#' + pref + 'jornadas').value);
    if (!nombre) { GL.notificar('Ingresá el nombre de la liga.', 'advertencia'); return; }
    if (!temporada) { GL.notificar('Ingresá la temporada.', 'advertencia'); return; }
    if (!jornadas.ok) { GL.notificar(jornadas.mensaje, 'advertencia'); return; }

    try {
      const update = { nombre, temporada };
      if (origen === 'cfg') {
        update.estado = cont.querySelector('#cfg-estado').value;
        update.reglamento = cont.querySelector('#cfg-reglamento').value.trim();
      }
      const { error: errUpdate } = await sb.from('torneos').update(update).eq('id', GL.torneo().id);
      if (errUpdate) { GL.notificar(GL.mensaje(errUpdate, 'guardar', 'la administración'), 'error'); return; }

      const { data, error } = await sb.rpc('gl_actualizar_total_jornadas', {
        p_torneo_id: GL.torneo().id,
        p_total: jornadas.valor
      });
      const r = leerRpc(data, error, 'No se pudo actualizar el total de jornadas.');
      if (!r.ok) { GL.notificar(r.mensaje, 'error'); return; }
      await recargarContextoAdmin();
      GL.notificar(r.mensaje || 'Datos guardados. El torneo tiene ' + jornadas.valor + ' jornadas.', 'exito');
      Mod.render(root);
    } catch (e) { GL.notificar(GL.mensaje(e, 'guardar', 'la administración'), 'error'); }
  }

  async function crearJugadorRapido(cont, root) {
    const torneo = GL.torneo();
    if (!torneo) { GL.notificar('No hay torneo activo.', 'error'); return; }
    const nombreRaw = cont.querySelector('#nt-jug-nombre').value;
    const nombre = GL.seguroTexto(nombreRaw).toUpperCase().replace(/\s+/g, '_');
    const email = cont.querySelector('#nt-jug-email').value.trim().toLowerCase();
    const clave = cont.querySelector('#nt-jug-clave').value;
    const pais = cont.querySelector('#nt-jug-pais').value;
    const paisTel = cont.querySelector('#nt-jug-tel-pais').value || pais;
    const telRaw = cont.querySelector('#nt-jug-tel').value.trim();
    const grupo = cont.querySelector('#nt-jug-grupo').value;

    if (nombre.length < 2 || nombre.length > 32) {
      GL.notificar('El nombre debe tener entre 2 y 32 caracteres válidos.', 'advertencia'); return;
    }
    if ((GL.ctx.jugadores || []).some(x => x.nombre_usuario === nombre)) {
      GL.notificar('Ese nombre ya está en uso por otro jugador.', 'advertencia'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      GL.notificar('Ingresá un correo electrónico válido.', 'advertencia'); return;
    }
    if (clave.length < 8) {
      GL.notificar('La contraseña debe tener al menos 8 caracteres.', 'advertencia'); return;
    }
    if (!pais) { GL.notificar('Seleccioná el país del jugador.', 'advertencia'); return; }
    const validacionTel = GL.tel.validar(telRaw, paisTel, true);
    if (!validacionTel.ok) {
      GL.notificar(validacionTel.mensaje || 'El teléfono es obligatorio y debe ser válido.', 'advertencia'); return;
    }
    const camposTel = GL.tel.campos(validacionTel.e164, validacionTel.pais || paisTel);
    if (!camposTel.telefono_e164) {
      GL.notificar('El teléfono es obligatorio.', 'advertencia'); return;
    }
    if (!grupo) { GL.notificar('Seleccioná un grupo para el jugador.', 'advertencia'); return; }

    const btn = cont.querySelector('#nt-jug-crear');
    btn.disabled = true; btn.textContent = 'Creando…';
    try {
      const { data, error } = await sb.functions.invoke('admin-crear-jugador', {
        body: Object.assign({
          nombre_usuario: nombre,
          email,
          password: clave,
          pais,
          zona_horaria: GL.zonaPorPais(pais),
          grupo_id: grupo,
          torneo_id: torneo.id
        }, camposTel)
      });
      if (error) throw new Error(await mensajeInvoke(error));
      if (data && data.ok === false) throw new Error(data.mensaje || data.error || 'No se pudo crear el jugador.');
      await recargarContextoAdmin();
      GL.notificar(nombre + ' creado y asignado al grupo.', 'exito');
      Mod.render(root);
    } catch (e) {
      const msg = GL.mensaje(e, 'guardar', 'la administración');
      GL.notificar(/jugadores_e164_canonicalizado_uniq|tel[eé]fono ya est[aá] registrado/i.test(msg)
        ? 'Ese teléfono ya está registrado en otro jugador.' : msg, 'error');
      btn.disabled = false; btn.textContent = 'Crear jugador';
    }
  }

  async function cambiarGrupoRapido(j, root, quitar) {
    if (!j) return;
    if (quitar) {
      try {
        const idsGrupos = GL.grupos().map(g => g.id);
        if (!idsGrupos.length) { GL.notificar('No hay grupos del torneo activo.', 'advertencia'); return; }
        const { error } = await sb.from('grupo_jugadores').delete()
          .eq('jugador_id', j.id).in('grupo_id', idsGrupos);
        if (error) { GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error'); return; }
        await recargarContextoAdmin();
        GL.notificar(j.nombre_usuario + ' quedó sin grupo.', 'exito');
        Mod.render(root);
      } catch (e) { GL.notificar(GL.mensaje(e, 'guardar', 'la administración'), 'error'); }
      return;
    }
    const grupos = GL.grupos();
    if (!grupos.length) { GL.notificar('No hay grupos disponibles.', 'advertencia'); return; }
    GL.dialogo({
      titulo: 'Asignar Grupo — ' + esc(j.nombre_usuario),
      icono: 'users',
      confirmTexto: 'Asignar grupo',
      cuerpo: '<p class="modal-texto">Elegí el grupo del torneo actual.</p>' +
        '<label class="campo"><span>Grupo</span><select class="input" id="nt-grupo-select">' +
          grupos.map(g => '<option value="' + esc(g.id) + '">Grupo ' + esc(GL.letraGrupo(g)) + '</option>').join('') +
        '</select></label>',
      onConfirmar(fondo, cerrar, setBloqueado) {
        const gid = fondo.querySelector('#nt-grupo-select').value;
        if (!gid) { fondo.setError('Seleccioná un grupo.'); return; }
        setBloqueado(true);
        (async () => {
          try {
            const { error } = await sb.from('grupo_jugadores').insert({ grupo_id: gid, jugador_id: j.id });
            if (error) { fondo.setError(GL.mensaje(error, 'guardar', 'la administración')); setBloqueado(false); return; }
            cerrar();
            await recargarContextoAdmin();
            GL.notificar(j.nombre_usuario + ' asignado al grupo.', 'exito');
            Mod.render(root);
          } catch (e) { fondo.setError(GL.mensaje(e, 'guardar', 'la administración')); setBloqueado(false); }
        })();
      }
    });
  }

  function enlazarFilasPartido(cont) {
    cont.querySelectorAll('[data-quitar-partido]').forEach(b => b.addEventListener('click', () => {
      const filas = cont.querySelectorAll('[data-fila-partido]');
      if (filas.length <= 1) { GL.notificar('Debe quedar al menos un partido.', 'advertencia'); return; }
      b.closest('[data-fila-partido]').remove();
    }));
  }

  function renderFilasPartido(cont, grupoId, datos) {
    const zona = cont.querySelector('#nt-partidos');
    if (!zona) return;
    const filas = datos && datos.length ? datos : [{}];
    zona.innerHTML = filas.map(d => filaPartidoHTML(grupoId, d)).join('');
    enlazarFilasPartido(cont);
    iniciarIconos();
  }

  function actualizarPanelModo(cont, modo) {
    const aleatorio = cont.querySelector('#nt-panel-aleatorio');
    const manual = cont.querySelector('#nt-panel-manual');
    if (aleatorio) aleatorio.style.display = modo === 'aleatorio' ? 'block' : 'none';
    if (manual) manual.style.display = modo === 'manual' ? 'block' : 'none';
  }

  async function generarFixtureAleatorio(root) {
    if (!GL.torneo()) { GL.notificar('No hay torneo activo.', 'error'); return; }
    GL.dialogo({
      titulo: 'Generar calendario aleatorio',
      icono: 'shuffle',
      tipo: 'peligro',
      ancho: 'sm',
      confirmTexto: 'Generar calendario',
      consecuencias: '<ul><li>El generador trabaja con <strong>22 jornadas</strong>.</li>' +
        '<li>Reemplazará los partidos generados anteriormente.</li></ul>',
      cuerpo: '<p class="modal-texto">¿Querés generar el calendario aleatorio del torneo actual?</p>',
      onConfirmar(fondo, cerrar, setBloqueado) {
        setBloqueado(true);
        (async () => {
          try {
            const { data, error } = await sb.rpc('gl_generar_fixture', { p_torneo_id: GL.torneoId() });
            const r = leerRpc(data, error, 'No se pudo generar el calendario.');
            if (!r.ok) { fondo.setError(r.mensaje); setBloqueado(false); return; }
            cerrar();
            await recargarContextoAdmin();
            GL.notificar(r.mensaje || 'Calendario generado correctamente.', 'exito');
            Mod.render(root);
          } catch (e) { fondo.setError(GL.mensaje(e, 'guardar', 'la administración')); setBloqueado(false); }
        })();
      }
    });
  }

  async function guardarJornadaManual(cont, root) {
    const torneo = GL.torneo();
    if (!torneo) { GL.notificar('No hay torneo activo.', 'error'); return; }
    const n = Number(cont.querySelector('#nt-manual-numero').value);
    const fechaISO = fechaDDMMYYYYaISO(cont.querySelector('#nt-manual-fecha').value);
    const grupo = cont.querySelector('#nt-manual-grupo').value;
    const total = Number(torneo.total_jornadas) || CONFIG.JORNADAS_FASE_REGULAR;
    if (!Number.isInteger(n) || n < 1 || n > total) {
      GL.notificar('La jornada debe estar entre 1 y ' + total + '.', 'advertencia'); return;
    }
    if (!fechaISO) { GL.notificar('Ingresá una fecha válida con formato DD/MM/YYYY.', 'advertencia'); return; }
    if (!grupo) { GL.notificar('Seleccioná un grupo.', 'advertencia'); return; }

    const pares = Array.from(cont.querySelectorAll('[data-fila-partido]')).map(fila => ({
      local_id: fila.querySelector('[data-local]').value,
      visitante_id: fila.querySelector('[data-visita]').value
    }));
    if (!pares.length) { GL.notificar('Agregá al menos un partido.', 'advertencia'); return; }
    if (pares.some(p => !p.local_id || !p.visitante_id)) {
      GL.notificar('Completá los dos jugadores de cada partido.', 'advertencia'); return;
    }
    if (pares.some(p => p.local_id === p.visitante_id)) {
      GL.notificar('Un jugador no puede enfrentarse a sí mismo.', 'advertencia'); return;
    }

    const btn = cont.querySelector('#nt-guardar-jornada');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const { data, error } = await sb.rpc('gl_guardar_jornada_manual', {
        p_torneo_id: torneo.id,
        p_grupo_id: grupo,
        p_numero: n,
        p_fecha: fechaISO,
        p_partidos: pares.map(p => ({ local_id: p.local_id, visitante_id: p.visitante_id }))
      });
      const r = leerRpc(data, error, 'No se pudo guardar la jornada.');
      if (!r.ok) { GL.notificar(r.mensaje, 'error'); btn.disabled = false; btn.textContent = 'Guardar jornada'; return; }
      await recargarContextoAdmin();
      GL.notificar(r.mensaje || 'Jornada ' + n + ' guardada para el ' + aDDMMYYYY(fechaISO) + '.', 'exito');
      Mod.render(root);
    } catch (e) {
      GL.notificar(GL.mensaje(e, 'guardar', 'la administración'), 'error');
      btn.disabled = false; btn.textContent = 'Guardar jornada';
    }
  }

  function borrarJornadaManual(n, grupoId, root) {
    if (!GL.torneo()) { GL.notificar('No hay torneo activo.', 'error'); return; }
    GL.dialogo({
      titulo: 'Eliminar jornada ' + n,
      icono: 'trash-2',
      tipo: 'peligro',
      ancho: 'sm',
      confirmTexto: 'Eliminar jornada',
      consecuencias: '<ul><li>Se borrará la jornada ' + n + ' y sus partidos.</li>' +
        '<li>El resto del torneo no se modifica.</li></ul>',
      cuerpo: '<p class="modal-texto">¿Querés eliminar esta jornada guardada?</p>',
      onConfirmar(fondo, cerrar, setBloqueado) {
        setBloqueado(true);
        (async () => {
          try {
            const { data, error } = await sb.rpc('gl_borrar_jornada_manual', {
              p_torneo_id: GL.torneoId(),
              p_grupo_id: grupoId,
              p_numero: Number(n)
            });
            const r = leerRpc(data, error, 'No se pudo eliminar la jornada.');
            if (!r.ok) { fondo.setError(r.mensaje); setBloqueado(false); return; }
            cerrar();
            await recargarContextoAdmin();
            GL.notificar(r.mensaje || 'Jornada ' + n + ' eliminada.', 'exito');
            Mod.render(root);
          } catch (e) { fondo.setError(GL.mensaje(e, 'guardar', 'la administración')); setBloqueado(false); }
        })();
      }
    });
  }

  function modalEliminarJugador(j, root) {
    if (!j) return;
    if (j.rol === 'admin') {
      GL.notificar('Las cuentas administradoras no se eliminan desde esta opción.', 'advertencia'); return;
    }
    GL.dialogo({
      titulo: 'Eliminar jugador',
      icono: 'user-x',
      tipo: 'peligro',
      ancho: 'sm',
      confirmTexto: 'Eliminar jugador',
      consecuencias: '<ul><li>Se eliminará la cuenta de <strong>' + esc(j.nombre_usuario) + '</strong>.</li>' +
        '<li>También se borrarán sus partidos, sanciones y grupos.</li>' +
        '<li>Las cuentas administradoras no se eliminan desde aquí.</li></ul>',
      cuerpo: '<p class="modal-texto">Esta acción no se puede deshacer. ¿Querés continuar?</p>',
      onConfirmar(fondo, cerrar, setBloqueado) {
        setBloqueado(true);
        (async () => {
          try {
            const { data, error } = await sb.functions.invoke('admin-crear-jugador', {
              body: { action: 'delete', jugador_id: j.id }
            });
            if (error) throw new Error(await mensajeInvoke(error));
            if (data && data.ok === false) throw new Error(data.mensaje || data.error || 'No se pudo eliminar el jugador.');
            cerrar();
            await recargarContextoAdmin();
            GL.notificar((data && data.mensaje) || j.nombre_usuario + ' eliminado correctamente.', 'exito');
            Mod.render(root);
          } catch (e) {
            fondo.setError(GL.mensaje(e, 'guardar', 'la administración'));
            GL.notificar(GL.mensaje(e, 'guardar', 'la administración'), 'error');
            setBloqueado(false);
          }
        })();
      }
    });
    iniciarIconos();
  }

  /* 1.2.1 — Confirmación administrativa explícita con motivo y auditoría.
     No hay verificación por SMS ni WhatsApp automático: una persona declara
     que comprobó la titularidad y la RPC la registra. */
  function modalConfirmarTelefono(j, root) {
    if (!j) return;
    const e164Actual = GL.tel.e164Jugador(j);
    const pais = GL.tel.paisJugador(j) || j.pais || 'NI';
    const visible = e164Actual
      ? (GL.tel.nacional(e164Actual, pais) || e164Actual)
      : String(j.telefono_e164 || j.telefono || '');
    const titularidadActual = j.telefono_verificado === true;

    const m = GL.abrirModal({
      titulo: 'Confirmar teléfono — ' + esc(j.nombre_usuario),
      ancho: 'ancho',
      cuerpo:
        '<div style="background:var(--bg-hover);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px">' +
          icono('phone', 14) + ' Teléfono actual: <strong>' + esc(visible || 'sin teléfono cargado') + '</strong>' +
          (e164Actual ? ' <span class="nota-pie">(' + esc(e164Actual) + ')</span>' : '') +
          '<br>' + (titularidadActual
            ? 'Titularidad: confirmada anteriormente.'
            : 'Titularidad: sin confirmar.') +
        '</div>' +
        '<p class="modal-texto">La confirmación es una acción humana registrada en auditoría. ' +
          'No se envía SMS ni WhatsApp automático; solo se marca la titularidad si vos la verificaste personalmente.</p>' +
        '<label class="campo"><span>Motivo de la confirmación (obligatorio)</span>' +
          '<input class="input" id="cf-motivo" maxlength="200" autocomplete="off" ' +
            'placeholder="Ej.: verificó su número por llamada telefónica"></label>' +
        '<label class="campo"><span>Evidencia (obligatoria si confirmás titularidad)</span>' +
          '<input class="input" id="cf-evidencia" maxlength="200" autocomplete="off" ' +
            'placeholder="N° de ticket, correo o referencia verificable"></label>' +
        '<label class="campo"><span>' +
          '<input type="checkbox" id="cf-titularidad"> Confirmé personalmente la titularidad del número' +
        '</span></label>' +
        '<p class="nota-pie" id="cf-estado" aria-live="polite"></p>',

      acciones:
        '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="cf-confirmar">' +
          icono('phone', 16) + 'Confirmar teléfono' +
        '</button>',

      onAbrir(fondo, cerrar) {
        const boton = fondo.querySelector('#cf-confirmar');
        const estado = fondo.querySelector('#cf-estado');
        /* 2.2 — Estado parcial: la RPC ya se aplicó, pero el recálculo falló.
           El reintento NO vuelve a llamar a la RPC, por lo que no duplica
           registros de auditoría ni deshace una titularidad válida. */
        let pendiente = null;

        const finalizar = async (resultado) => {
          cerrar();
          await recargarContextoAdmin();
          Mod.render(root);
          const nuevo = (resultado && resultado.nuevo) || e164Actual;
          GL.notificar(
            'Teléfono confirmado: ' + nuevo + '. ' +
            (resultado && resultado.titularidad_confirmada
              ? 'Titularidad confirmada por administración.'
              : 'Titularidad no modificada.'),
            'exito'
          );
        };

        boton.addEventListener('click', async () => {
          if (pendiente) {
            boton.disabled = true;
            boton.textContent = 'Reintentando…';
            try {
              await Auth.reintentarRecalculo(pendiente.jugadorId, pendiente.e164);
              await finalizar(pendiente.resultado);
            } catch (e) {
              estado.textContent = 'No se pudo actualizar la validación del plan: ' + e.message;
              GL.notificar(e.message, 'error');
              boton.disabled = false;
              boton.textContent = 'Reintentar validación del plan';
            }
            return;
          }

          const motivo = fondo.querySelector('#cf-motivo').value.trim();
          if (!e164Actual) {
            estado.textContent = 'Este jugador no tiene un teléfono E.164 válido para confirmar.';
            return;
          }
          if (!motivo) {
            errorCampo(fondo, '#cf-motivo', 'Escribí el motivo de la confirmación.');
            return;
          }
          const confirmaTitularidad = fondo.querySelector('#cf-titularidad').checked;
          const evidencia = fondo.querySelector('#cf-evidencia').value.trim();
          if (confirmaTitularidad && !evidencia) {
            errorCampo(fondo, '#cf-evidencia', 'La titularidad requiere evidencia verificable.');
            return;
          }
          errorCampo(fondo, '#cf-evidencia', '');
          errorCampo(fondo, '#cf-motivo', '');
          boton.disabled = true;
          boton.textContent = 'Confirmando…';
          estado.textContent = '';
          try {
            const resultado = await Auth.confirmarYRecalcular({
              jugadorId: j.id,
              e164: e164Actual,
              motivo,
              confirmarTitularidad: confirmaTitularidad,
              evidencia: evidencia || null
            });
            if (!resultado.recalculoOk) {
              pendiente = {
                jugadorId: j.id,
                e164: (resultado.resultado && resultado.resultado.nuevo) || e164Actual,
                resultado: resultado.resultado
              };
              estado.textContent =
                'La confirmación quedó registrada, pero no se pudo recalcular la validez del plan. ' +
                (resultado.errorRecalculo ? resultado.errorRecalculo + '. ' : '') +
                'Podés reintentar sin repetir la confirmación ni la auditoría.';
              boton.disabled = false;
              boton.textContent = 'Reintentar validación del plan';
              GL.notificar('Confirmación registrada; queda pendiente la validación del plan.', 'advertencia');
              return;
            }
            await finalizar(resultado.resultado);
          } catch (e) {
            estado.textContent = e.message;
            GL.notificar(e.message, 'error');
            boton.disabled = false;
            boton.textContent = 'Confirmar teléfono';
          }
        });
      }
    });
    iniciarIconos();
    return m;
  }

  /* ---------------- Enlaces de eventos ---------------- */
  function enlazar(cont, root) {
    // Botones de acceso rápido desde el resumen
    cont.querySelectorAll('[data-tab-ir]').forEach(b => {
      b.addEventListener('click', () => irATab(b.dataset.tabIr, root));
    });
    /* ── Menú flotante / bottom sheet para móvil ── */
    cont.querySelectorAll('.btn-menu-acciones').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const jugadorId     = btn.dataset.jugadorId;
        const jugadorNombre = btn.dataset.jugadorNombre;
        const j             = GL.jugador(jugadorId);
        if (!j) return;

        const primeraSemana = esPrimeraSemana();
        const g             = GL.grupoDeJugador(j.id);
        const expulsado     = GL.esExpulsado(j);
        const esMobile      = window.matchMedia('(max-width:480px)').matches;

        // Construir items del menú
        const items = [
          { accion: 'editar-'    + j.id, ico: 'pencil',         label: 'Editar jugador'    },
          { accion: 'telefono-'  + j.id, ico: 'phone',          label: 'Confirmar teléfono' },
          g && primeraSemana
            ? { accion: 'grupo-' + j.id, ico: 'users',          label: 'Cambiar de grupo'  }
            : !g
            ? { accion: 'asignar-'+ j.id, ico: 'user-plus',     label: 'Asignar grupo'     }
            : null,
          !expulsado
            ? { accion: 'sancion-'  + j.id, ico: 'triangle-alert', label: 'Aplicar sanción'   }
            : null,
          !expulsado
            ? { accion: 'suspender-'+ j.id, ico: 'user-x',         label: 'Suspender / expulsar' }
            : null,
          j.rol !== 'admin'
            ? { accion: 'eliminar-' + j.id, ico: 'trash-2', label: 'Eliminar jugador' }
            : null
        ].filter(Boolean);

        abrirMenuAcciones(btn, jugadorNombre, items, j, root, esMobile);
      });
    });
    cont.querySelectorAll('.acciones-escritorio [data-accion]').forEach(b => b.addEventListener('click', () => {
      const raw = b.dataset.accion, corte = raw.indexOf('-');
      const accion = raw.slice(0, corte), id = raw.slice(corte + 1);
      const j = GL.jugador(id);
      if (!j) return;
      if (accion === 'editar')    modalEditar(j, root);
      if (accion === 'telefono')  modalConfirmarTelefono(j, root);
      if (accion === 'grupo')     modalGrupo(j, root);
      if (accion === 'asignar')   modalGrupo(j, root, true);
      if (accion === 'sancion')   modalSancion(j, root);
      if (accion === 'suspender') modalSuspender(j, root);
      if (accion === 'eliminar')  modalEliminarJugador(j, root);
    }));
    const agregar = cont.querySelector('[data-agregar]');
    if (agregar) agregar.addEventListener('click', () => modalAgregar(root));
    enlazarFiltrosJugadores(cont);
    enlazarFiltrosEquipos(cont);
    enlazarEquipos(cont);

    const agregarAdmin = cont.querySelector('#adm-agregar');
    if (agregarAdmin) agregarAdmin.addEventListener('click', async () => {
      const email = cont.querySelector('#adm-email').value.trim().toLowerCase();
      const nombre = cont.querySelector('#adm-nombre').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        GL.notificar('Ingresá un correo electrónico válido.', 'advertencia'); return;
      }
      agregarAdmin.disabled = true;
      try {
        const { error } = await sb.functions.invoke('admin-gestionar-admins', {
          body: { action: 'add', email, nombre_usuario: nombre, torneo_id: GL.torneoId() }
        });
        if (error) throw new Error(await mensajeInvoke(error));
        GL.invalidar(); await GL.cargarContexto(true);
        GL.notificar(email + ' ahora es administrador.', 'exito');
        Mod.render(root);
      } catch (e) {
        GL.notificar(GL.mensaje(e, 'guardar', 'la administración'), 'error');
        agregarAdmin.disabled = false;
      }
    });
    cont.querySelectorAll('[data-admin-quitar]').forEach(b => b.addEventListener('click', () => {
      const email = b.dataset.adminQuitar;
      GL.abrirModal({
        titulo: 'Quitar rol de administrador',
        cuerpo: '<p class="modal-texto">¿Querés quitar el rol de administrador a <strong>' + esc(email) + '</strong>? El usuario conserva su cuenta de jugador.</p>',
        acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
          '<button type="button" class="btn peligro" id="adm-quitar-ok">Quitar rol</button>',
        onAbrir(fondo, cerrar) {
          fondo.querySelector('#adm-quitar-ok').addEventListener('click', async () => {
            const btn = fondo.querySelector('#adm-quitar-ok');
            btn.disabled = true;
            try {
              const { error } = await sb.functions.invoke('admin-gestionar-admins', {
                body: { action: 'remove', email, torneo_id: GL.torneoId() }
              });
              if (error) throw new Error(await mensajeInvoke(error));
              cerrar(); GL.invalidar(); await GL.cargarContexto(true);
              GL.notificar('Rol de administrador quitado.', 'exito');
              Mod.render(root);
            } catch (e) { GL.notificar(GL.mensaje(e, 'guardar', 'la administración'), 'error'); btn.disabled = false; }
          });
        }
      });
      iniciarIconos();
    }));
    const verClave = cont.querySelector('[data-ver-clave]');
    if (verClave) verClave.addEventListener('click', async () => {
      verClave.disabled = true;
      try {
        const clave = await Auth.obtenerClaveAdmin();
        const m = GL.abrirModal({
          titulo: 'Clave de administrador',
          cuerpo: '<p class="modal-texto">Compartila solo con personas autorizadas. No la publiques en el grupo.</p>' +
            '<div class="nota-clave" id="clave-valor">' + esc(clave) + '</div>',
          acciones: '<button type="button" class="btn sec" data-cerrar>Cerrar</button>' +
            '<button type="button" class="btn" id="clave-copiar">' + icono('copy', 16) + 'Copiar clave</button>',
          onAbrir(fondo) {
            fondo.querySelector('#clave-copiar').addEventListener('click', async () => {
              await GL.copiar(clave);
              GL.notificar('Clave copiada al portapapeles.', 'exito', 'copy');
            });
          }
        });
        iniciarIconos();
        return m;
      } catch (e) { GL.notificar(GL.mensaje(e, 'guardar', 'la administración'), 'error'); }
      finally { verClave.disabled = false; }
    });

    cont.querySelectorAll('[data-grupo-j]').forEach(b => b.addEventListener('click', () => {
      Mod.grupoJornadas = b.dataset.grupoJ; Mod.render(root);
    }));
    cont.querySelectorAll('[data-editar-jornada]').forEach(b => b.addEventListener('click', () =>
      modalEditarJornada(Number(b.dataset.editarJornada), root)));
    cont.querySelectorAll('[data-ver-jornada]').forEach(b => b.addEventListener('click', () =>
      modalVerJornada(Number(b.dataset.verJornada))));
    cont.querySelectorAll('[data-cerrar-jornada]').forEach(b => b.addEventListener('click', () =>
      modalCerrarJornada(Number(b.dataset.cerrarJornada), root)));
    cont.querySelectorAll('[data-abrir-jornada]').forEach(b => b.addEventListener('click', async () => {
      const n = Number(b.dataset.abrirJornada);
      const { error } = await sb.from('jornadas').update({ estado: 'abierta' })
        .eq('torneo_id', GL.torneo().id).eq('numero', n).eq('grupo_id', Mod.grupoJornadas);
      if (error) { GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error'); return; }
      const grupoAud = GL.ctx.grupos.find(g => g.id === Mod.grupoJornadas);
      GL.auditoria && GL.auditoria.registrar('jornada_abierta', 'jornada', null, {
        numero: n, grupo: grupoAud ? grupoAud.nombre : '?'
      });
      GL.notificar('Jornada ' + n + ' abierta.', 'exito'); GL.invalidar(); Mod.render(root);
    }));
    const buscar = cont.querySelector('#buscar-sancion');
    if (buscar) buscar.addEventListener('input', () => {
      const q = buscar.value.toLowerCase();
      cont.querySelectorAll('[data-fila-sancion]').forEach(f => f.classList.toggle('oculto', !f.dataset.filaSancion.includes(q)));
    });
    const guardarCfg = cont.querySelector('#guardar-cfg');
    if (guardarCfg) guardarCfg.addEventListener('click', () => guardarDatosTorneo(cont, root, 'cfg'));

    /* ── Botones de torneo (Resumen, Configuración y estado sin torneo) ── */
    const crearTorneo = cont.querySelector('#tor-crear');
    if (crearTorneo) crearTorneo.addEventListener('click', () => abrirCrearTorneo(root));
    const eliminarTorneo = cont.querySelector('#tor-eliminar');
    if (eliminarTorneo) eliminarTorneo.addEventListener('click', () => abrirEliminarTorneo(root));

    /* ── Nueva Temporada: paso 1 ── */
    const guardarDatosNT = cont.querySelector('#nt-guardar-datos');
    if (guardarDatosNT) guardarDatosNT.addEventListener('click', () => guardarDatosTorneo(cont, root, 'nt'));

    /* ── Nueva Temporada: paso 2 ── */
    const crearJugadorNT = cont.querySelector('#nt-jug-crear');
    if (crearJugadorNT) crearJugadorNT.addEventListener('click', () => crearJugadorRapido(cont, root));
    enlazarCampoTelefono(cont, {
      pais: '#nt-jug-tel-pais', tel: '#nt-jug-tel',
      prefijo: '#nt-jug-tel-prefijo', hint: '#nt-jug-tel-hint'
    });
    /* Creación rápida: el país del jugador arrastra al teléfono mientras el
      administrador no haya elegido uno distinto manualmente. */
    const paisJugadorNT = cont.querySelector('#nt-jug-pais');
    const paisTelNT = cont.querySelector('#nt-jug-tel-pais');
    if (paisTelNT) paisTelNT.addEventListener('change', () => { paisTelNT.dataset.manual = '1'; });
    if (paisJugadorNT && paisTelNT) paisJugadorNT.addEventListener('change', () => {
      if (paisTelNT.dataset.manual === '1') return;
      paisTelNT.value = paisJugadorNT.value || 'NI';
      paisTelNT.dispatchEvent(new Event('change'));
    });
    cont.querySelectorAll('[data-nt-eliminar]').forEach(b => b.addEventListener('click', () => {
      modalEliminarJugador(GL.jugador(b.dataset.ntEliminar), root);
    }));
    cont.querySelectorAll('[data-nt-quitar]').forEach(b => b.addEventListener('click', () => {
      cambiarGrupoRapido(GL.jugador(b.dataset.ntQuitar), root, true);
    }));
    cont.querySelectorAll('[data-nt-asignar]').forEach(b => b.addEventListener('click', () => {
      cambiarGrupoRapido(GL.jugador(b.dataset.ntAsignar), root, false);
    }));

    /* ── Nueva Temporada: paso 3 ── */
    cont.querySelectorAll('[name="nt-modo"]').forEach(r => r.addEventListener('change', () => {
      actualizarPanelModo(cont, r.value);
    }));
    const generarFixture = cont.querySelector('#nt-generar-fixture');
    if (generarFixture) generarFixture.addEventListener('click', () => generarFixtureAleatorio(root));

    const selGrupoManual = cont.querySelector('#nt-manual-grupo');
    if (selGrupoManual) selGrupoManual.addEventListener('change', () => {
      const actuales = Array.from(cont.querySelectorAll('[data-fila-partido]')).map(f => ({
        local: f.querySelector('[data-local]').value,
        visitante: f.querySelector('[data-visita]').value
      }));
      renderFilasPartido(cont, selGrupoManual.value, actuales);
      GL.notificar('Los desplegables ahora muestran solo los jugadores del grupo elegido.', 'info');
    });
    const agregarPartido = cont.querySelector('#nt-agregar-partido');
    if (agregarPartido) agregarPartido.addEventListener('click', () => {
      const actuales = Array.from(cont.querySelectorAll('[data-fila-partido]')).map(f => ({
        local: f.querySelector('[data-local]').value,
        visitante: f.querySelector('[data-visita]').value
      }));
      actuales.push({});
      renderFilasPartido(cont, selGrupoManual ? selGrupoManual.value : '', actuales);
    });
    enlazarFilasPartido(cont);
    const guardarJornada = cont.querySelector('#nt-guardar-jornada');
    if (guardarJornada) guardarJornada.addEventListener('click', () => guardarJornadaManual(cont, root));
    cont.querySelectorAll('[data-nt-borrar-jornada]').forEach(b => b.addEventListener('click', () => {
      borrarJornadaManual(b.dataset.ntBorrarJornada, b.dataset.grupo, root);
    }));
  }
  /* ── Helper: errores inline junto al campo ──────────────────────────
     Resalta el campo y muestra/oculta un mensaje de error debajo de él.
     id:  selector CSS del input o select (ej: '#ed-nombre').
     msg: texto del error; null o '' para limpiar el estado.
  -------------------------------------------------------------------- */
  function errorCampo(fondo, id, msg) {
    const el = fondo.querySelector(id);
    if (!el) return;
    el.style.borderColor = msg ? 'var(--accent-orange)' : '';
    const key = id.replace(/^#/, '');
    // Buscar o crear el <small> de error ligado a este campo
    let err = fondo.querySelector('[data-err-for="' + key + '"]');
    if (!err) {
      const wrap = el.closest('.campo') || el.parentElement;
      if (!wrap) return;
      err = document.createElement('small');
      err.setAttribute('data-err-for', key);
      err.style.cssText =
        'color:var(--accent-orange);font-size:11px;margin-top:3px;' +
        'display:none;line-height:1.3;grid-column:1/-1';
      wrap.appendChild(err);
    }
    if (msg) { err.textContent = msg; err.style.display = 'block'; }
    else      { err.textContent = '';  err.style.display = 'none';  }
  }

  /* ---------------- Modales de jugadores ---------------- */
  function modalEditar(j, root) {
    const paisTelInicial = GL.tel.paisJugador(j) || j.pais || 'NI';
    const e164Inicial = GL.tel.e164Jugador(j);
    const telInicial = e164Inicial
      ? (GL.tel.nacional(e164Inicial, paisTelInicial) || e164Inicial)
      : String(j.telefono || '');

    const m = GL.abrirModal({
      titulo: 'Editar jugador — ' + esc(j.nombre_usuario),
      ancho: 'j5-forma',
      cuerpo:
        j5FormIntro('Actualizá los datos visibles del jugador. El teléfono se conserva si no se modifica.') +
        '<div class="j5-form-grid">' +
          '<div class="j5-form-section">' +
            '<h3 class="j5-form-titulo">' + icono('user', 16) + 'Identidad</h3>' +
            '<label class="campo"><span>Nombre en el juego ' + j5Requerido() + '</span>' +
              '<input class="input" id="ed-nombre" maxlength="32" ' +
                'value="' + esc(j.nombre_usuario) + '" ' +
                'placeholder="Ej: GOAT_PEREZ" ' +
                'autocomplete="off">' +
              '<small class="campo-ayuda">Solo letras, números y guión bajo (_). Máximo 32 caracteres.</small>' +
            '</label>' +
            '<label class="campo"><span>País ' + j5Requerido() + '</span>' +
              '<select class="input" id="ed-pais">' +
                GL.opcionesPais(j.pais, true) +
              '</select>' +
            '</label>' +
          '</div>' +
          '<div class="j5-form-section">' +
            '<h3 class="j5-form-titulo">' + icono('clock', 16) + 'Contacto y horario</h3>' +
            '<label class="campo"><span>Ciudad o zona horaria ' + j5Requerido() + '</span>' +
              '<select class="input" id="ed-zona">' +
                GL.opcionesZonaHoraria(j.zona_horaria, j.pais) +
              '</select>' +
            '</label>' +
            '<p class="nota-pie" id="ed-horario"></p>' +
            '<label class="campo"><span>País del teléfono</span>' +
              '<select class="input" id="ed-tel-pais">' +
                GL.opcionesPais(paisTelInicial, false) +
              '</select></label>' +
            '<label class="campo">' +
              '<span>Teléfono / WhatsApp <small id="ed-tel-hint" class="j5-tel-hint">' +
                esc(hintTel(paisTelInicial)) +
              '</small></span>' +
              '<div class="tel-wrap">' +
                '<button type="button" class="tel-prefijo" id="ed-tel-prefijo" aria-label="Código de país">' +
                  (GL.tel.prefijo(paisTelInicial) ? '+' + GL.tel.prefijo(paisTelInicial) : '+?') + '</button>' +
                '<input class="input" id="ed-tel" value="' + esc(telInicial) + '" ' +
                  'placeholder="8108-5555" inputmode="numeric">' +
              '</div>' +
              '<small class="campo-ayuda">El formato válido no confirma la titularidad del número.</small>' +
            '</label>' +
            ('numero' in j
              ? '<label class="campo"><span>Número del jugador</span>' +
                  '<input class="input" type="number" min="0" max="99" step="1" id="ed-numero" ' +
                    'value="' + esc(j.numero ?? '') + '"></label>'
              : '') +
          '</div>' +
        '</div>',

      acciones:
        '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="ed-guardar">' + icono('save', 16) + 'Guardar cambios</button>',

      onAbrir(fondo, cerrar) {
        const pais = fondo.querySelector('#ed-pais');
        const zona = fondo.querySelector('#ed-zona');
        const nota = fondo.querySelector('#ed-horario');
        const telPais = fondo.querySelector('#ed-tel-pais');

        pais.addEventListener('change', () => GL.actualizarZona(zona, pais.value, nota));
        zona.addEventListener('change', () => GL.actualizarZona(zona, pais.value, nota, true));
        GL.actualizarZona(zona, pais.value, nota, true);
        enlazarCampoTelefono(fondo, {
          pais: '#ed-tel-pais', tel: '#ed-tel',
          prefijo: '#ed-tel-prefijo', hint: '#ed-tel-hint'
        });
        telPais.addEventListener('change', () => {
          errorCampo(fondo, '#ed-tel', null);
          const escrito = fondo.querySelector('#ed-tel').value.trim();
          if (escrito) {
            const revalidado = GL.tel.validar(escrito, telPais.value, false);
            if (!revalidado.ok) errorCampo(fondo, '#ed-tel', revalidado.mensaje);
          }
        });

        fondo.querySelector('#ed-guardar').addEventListener('click', async () => {
          // Limpiar todos los errores inline
          ['#ed-nombre', '#ed-pais', '#ed-zona', '#ed-tel'].forEach(id => errorCampo(fondo, id, null));
          let hayError = false;

          // ── Validar nombre ──────────────────────────────────────────
          const nombreRaw  = fondo.querySelector('#ed-nombre').value;
          const nombreNorm = GL.seguroTexto(nombreRaw).toUpperCase().replace(/\s+/g, '_');
          if (!nombreNorm || nombreNorm.length < 2) {
            errorCampo(fondo, '#ed-nombre', 'El nombre debe tener al menos 2 caracteres.');
            hayError = true;
          } else if (nombreNorm.length > 32) {
            errorCampo(fondo, '#ed-nombre', 'Máximo 32 caracteres (actual: ' + nombreNorm.length + ').');
            hayError = true;
          } else {
            // Verificar duplicado en el contexto actual (excluyendo al propio jugador)
            const dupl = (GL.ctx.jugadores || []).find(x =>
              x.nombre_usuario === nombreNorm && x.id !== j.id);
            if (dupl) {
              errorCampo(fondo, '#ed-nombre', 'Ese nombre ya está en uso por otro jugador.');
              hayError = true;
            }
          }

          // ── Validar país ───────────────────────────────────────────
          if (!pais.value) {
            errorCampo(fondo, '#ed-pais', 'Seleccioná el país del jugador.');
            hayError = true;
          }

          // ── Validar zona horaria ───────────────────────────────────
          if (!zona.value) {
            errorCampo(fondo, '#ed-zona', 'Elegí la ciudad o zona horaria.');
            hayError = true;
          }

          // ── Validar teléfono contra su propio país ─────────────────
          const telRaw = fondo.querySelector('#ed-tel').value.trim();
          const telCambios = GL.tel.cambiosSiNuevos(telRaw, telPais.value, j);
          if (telCambios.__error) {
            errorCampo(fondo, '#ed-tel', telCambios.__error.mensaje);
            hayError = true;
          }

          if (hayError) return; // Dejar el botón activo para corregir

          const btn = fondo.querySelector('#ed-guardar');
          btn.disabled = true; btn.textContent = 'Guardando…';

          const update = {
            nombre_usuario: nombreNorm,
            pais:           pais.value,
            zona_horaria:   zona.value
          };
          // {} cuando el teléfono no cambió: no se borra ni se reescribe.
          Object.assign(update, telCambios);
          if ('numero' in j) {
            const nEl = fondo.querySelector('#ed-numero');
            update.numero = nEl && nEl.value !== '' ? Number(nEl.value) : null;
          }

          const { error } = await sb.from('jugadores').update(update).eq('id', j.id);
          if (error) {
            // Detectar error de unicidad del servidor (segundo nivel de protección)
            if (error.message && /jugadores_e164_canonicalizado_uniq|tel[eé]fono ya est[aá] registrado/i.test(error.message)) {
              errorCampo(fondo, '#ed-tel', 'Ese teléfono ya está registrado en otro jugador.');
            } else if (error.message && /unique|duplicat/i.test(error.message)) {
              errorCampo(fondo, '#ed-nombre',
                'El servidor rechazó el nombre: ya existe en la base de datos.');
            } else {
              GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error');
            }
            btn.disabled = false; btn.textContent = 'Guardar cambios';
          } else {
            cerrar();
            GL.invalidar();
            GL.notificar(esc(nombreNorm) + ' actualizado correctamente.', 'exito');
            Mod.render(root);
          }
        });
      }
    });
    iniciarIconos(); return m;
  }

  function modalGrupo(j, root, asignar) {
    // ── Validaciones previas al abrir el modal ─────────────────────────

    // 1. No se pueden asignar grupos si el torneo ya finalizó
    const torneo = GL.torneo();
    if (torneo && torneo.estado === 'finalizado') {
      GL.notificar('No se pueden cambiar grupos: el torneo ya finalizó.', 'advertencia'); return;
    }

    // 2. No se puede mover a un jugador expulsado (puede existir en la tabla sin grupo)
    const expulsado = j.activo === false || j.rol === 'expulsado';
    if (expulsado) {
      GL.abrirModal({
        titulo: 'Acción no permitida',
        cuerpo:
          '<p class="modal-texto">' + esc(j.nombre_usuario) + ' está expulsado del torneo.</p>' +
          '<p class="modal-texto">Para asignarle un grupo primero debés reincorporarlo desde la opción ' +
            '"Suspender / Expulsar" → "Reincorporar jugador".</p>',
        acciones: '<button type="button" class="btn sec" data-cerrar>Entendido</button>'
      });
      iniciarIconos(); return;
    }

    // 3. Cambio de grupo (no asignación inicial) solo en primera semana
    if (asignar !== true && !esPrimeraSemana()) {
      GL.notificar('El cambio de grupo solo está disponible durante la primera semana.', 'advertencia'); return;
    }

    // 4. Verificar que haya grupos disponibles
    const grupos = GL.grupos();
    if (!grupos.length) {
      GL.notificar('No hay grupos configurados en este torneo.', 'error'); return;
    }

    const actualGrupo = GL.grupoDeJugador(j.id);

    const m = GL.abrirModal({
      titulo: asignar === true ? 'Asignar grupo — ' + esc(j.nombre_usuario)
                               : 'Cambiar de grupo — ' + esc(j.nombre_usuario),
      cuerpo:
        // Aviso si ya tiene grupo asignado
        (actualGrupo
          ? '<div style="background:var(--bg-hover);border-radius:8px;padding:10px 14px;' +
              'margin-bottom:12px;font-size:13px">' +
              icono('info', 14) + ' Grupo actual: <strong>Grupo ' +
              esc(GL.letraGrupo(actualGrupo)) + '</strong></div>'
          : '<div style="background:rgba(245,197,24,.1);border:1px solid var(--accent-gold);' +
              'border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px">' +
              icono('alert-triangle', 14) + ' Este jugador no tiene grupo asignado todavía.</div>') +

        '<p class="modal-texto">' +
          (asignar === true
            ? 'La asignación inicial siempre está disponible mientras el torneo esté activo.'
            : 'El cambio de grupo solo está disponible durante la primera semana del torneo.') +
        '</p>' +

        '<label class="campo"><span>Grupo destino</span>' +
          '<select class="input" id="gr-grupo">' +
            grupos.map(g =>
              '<option value="' + g.id + '"' +
                (actualGrupo && g.id === actualGrupo.id ? ' selected' : '') + '>' +
                'Grupo ' + GL.letraGrupo(g) + ' — ' + e6Miembros(g).length + ' jugador(es)' +
              '</option>'
            ).join('') +
          '</select>' +
        '</label>',

      acciones:
        '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="gr-guardar">' +
          (asignar === true ? icono('user-plus', 16) + 'Asignar' : icono('shuffle', 16) + 'Mover jugador') +
        '</button>',

      onAbrir(fondo, cerrar) {
        fondo.querySelector('#gr-guardar').addEventListener('click', async () => {
          // Verificar que la ventana de cambio siga abierta
          if (asignar !== true && !esPrimeraSemana()) {
            GL.notificar('La ventana de cambio de grupo ya cerró.', 'advertencia'); return;
          }

          const gid = fondo.querySelector('#gr-grupo').value;

          // Detectar asignación al mismo grupo actual
          if (actualGrupo && gid === actualGrupo.id) {
            GL.notificar(
              esc(j.nombre_usuario) + ' ya pertenece a Grupo ' + GL.letraGrupo(actualGrupo) + '.',
              'advertencia');
            return;
          }

          const btn = fondo.querySelector('#gr-guardar');
          btn.disabled = true; btn.textContent = 'Moviendo…';

          const idsGrupos = GL.grupos().map(g => g.id);
          if (!idsGrupos.length) {
            GL.notificar('No hay grupos del torneo activo.', 'advertencia');
            btn.disabled = false; btn.textContent = asignar === true ? 'Asignar' : 'Mover jugador';
            return;
          }
          const { error: errDel } = await sb.from('grupo_jugadores').delete()
            .eq('jugador_id', j.id).in('grupo_id', idsGrupos);
          if (errDel) {
            GL.notificar(GL.mensaje(errDel, 'guardar', 'la administración'), 'error');
            btn.disabled = false; btn.textContent = asignar === true ? 'Asignar' : 'Mover jugador';
            return;
          }
          const { error } = await sb.from('grupo_jugadores').insert({ grupo_id: gid, jugador_id: j.id });
          if (error) {
            GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error');
            btn.disabled = false; btn.textContent = asignar === true ? 'Asignar' : 'Mover jugador';
            return;
          }

          const grupoAnt = actualGrupo ? GL.ctx.grupos.find(g => g.id === actualGrupo.id) : null;
          const grupoNvo = GL.ctx.grupos.find(g => g.id === gid);
          GL.auditoria && GL.auditoria.registrar('jugador_grupo_cambio', 'jugador', j.id, {
            jugador:        j.nombre_usuario,
            grupo_anterior: grupoAnt ? grupoAnt.nombre : 'Sin asignar',
            grupo_nuevo:    grupoNvo ? grupoNvo.nombre : '?'
          });

          cerrar();
          GL.invalidar();
          await GL.cargarContexto(true);
          GL.notificar(
            esc(j.nombre_usuario) + (asignar === true
              ? ' asignado a Grupo ' + (grupoNvo ? GL.letraGrupo(grupoNvo) : '?') + '.'
              : ' movido a Grupo ' + (grupoNvo ? GL.letraGrupo(grupoNvo) : '?') + '.'),
            'exito');
          Mod.render(root);
        });
      }
    });
    iniciarIconos(); return m;
  }

  /* ================================================================
     resolverPartidosPorSancion(jugadorId, opciones)
     Función centralizada para resolver partidos afectados por
     expulsión o suspensión. Controla:
       · Partidos ya jugados (no se tocan).
       · Partidos con estado administrativo previo (no se duplica).
       · Partidos de fase regular e ida/vuelta de eliminatorias.
       · Partidos de eliminatorias (jornadas ≥ CONFIG.JORNADA_PLAYOFF_INICIO).
       · Suspensiones: solo resuelve los N próximos partidos pendientes.
       · Expulsiones: resuelve TODOS los pendientes como 1-0.
       · Protección contra doble aplicación del mismo beneficio.

     opciones = {
       tipo: 'expulsion' | 'suspension',
       partidosSuspension: number,  // solo para tipo='suspension'
     }
     Devuelve { resueltos: number, errores: string[], advertencias: string[] }
  ================================================================ */
  async function resolverPartidosPorSancion(jugadorId, opciones) {
    const opt = opciones || {};
    const tipo = opt.tipo || 'expulsion';
    const result = { resueltos: 0, errores: [], advertencias: [] };

    // Refrescar la cache antes de operar (evita trabajar con datos viejos)
    Mod.partidosCache = await GL.partidos({ torneo_id: GL.torneoId() });

    // Identificar TODOS los partidos del jugador
    const todos = Mod.partidosCache.filter(p =>
      p.local_id === jugadorId || p.visitante_id === jugadorId);

    // Separar por categoría
    const yaJugados         = todos.filter(p => p.estado === 'jugado');
    const yaAdministrativos = todos.filter(p =>
      GL.esAdministrativo(p) && p.estado !== 'pendiente');
    const pendientes        = todos.filter(p => p.estado === 'pendiente');
    const deEliminatorias   = pendientes.filter(p =>
      Number(p.jornada) >= CONFIG.JORNADA_PLAYOFF_INICIO);
    const deFaseRegular     = pendientes.filter(p =>
      Number(p.jornada) < CONFIG.JORNADA_PLAYOFF_INICIO);

    // Avisar sobre partidos que no se tocan
    if (yaJugados.length) {
      result.advertencias.push(
        yaJugados.length + ' partido(s) ya jugado(s) no se modifican.');
    }
    if (yaAdministrativos.length) {
      result.advertencias.push(
        yaAdministrativos.length + ' partido(s) ya tenían resolución administrativa previa y no se vuelven a aplicar.');
    }

    // Determinar qué partidos pendientes resolver y con qué estado
    let aResolver = [];

    if (tipo === 'expulsion') {
      // Expulsión: resolver TODOS los pendientes (fase regular + eliminatorias)
      aResolver = pendientes;
      if (deEliminatorias.length) {
        result.advertencias.push(
          deEliminatorias.length + ' partido(s) de eliminatorias resuelto(s) por expulsión (1-0 al rival).');
      }
    } else if (tipo === 'suspension') {
      const n = Number(opt.partidosSuspension) || 0;
      if (n <= 0) return result; // Sin partidos de suspensión, nada que resolver aquí
      // Suspensión: solo los N próximos de fase regular, ordenados por jornada
      const ordenados = deFaseRegular.slice().sort((a, b) => a.jornada - b.jornada);
      aResolver = ordenados.slice(0, n);
      if (deEliminatorias.length) {
        result.advertencias.push(
          'Los partidos de eliminatorias (' + deEliminatorias.length +
          ') no se resuelven automáticamente por suspensión — el admin debe decidirlos al cerrar cada jornada.');
      }
      if (aResolver.length < n) {
        result.advertencias.push(
          'La suspensión es de ' + n + ' partido(s) pero solo hay ' +
          aResolver.length + ' pendiente(s) disponible(s) en fase regular.');
      }
    }

    if (!aResolver.length) {
      result.advertencias.push('No hay partidos pendientes que resolver para este jugador.');
      return result;
    }

    // Resolver cada partido con el estado correcto
    for (const p of aResolver) {
      // Protección contra doble aplicación: verificar que siga siendo pendiente en BD
      // (el .eq('estado', 'pendiente') en el update actúa como cerrojo optimista)
      const esLocal  = p.local_id === jugadorId;
      const esVisita = p.visitante_id === jugadorId;

      // Determinar estado de resolución según quién es el sancionado
      let estadoNuevo, golesLocal, golesVisita;
      if (tipo === 'expulsion') {
        if (esLocal) {
          estadoNuevo = 'expulsion_visitante'; // rival (visitante) gana 1-0
          golesLocal = 0; golesVisita = 1;
        } else {
          estadoNuevo = 'expulsion_local'; // rival (local) gana 1-0
          golesLocal = 1; golesVisita = 0;
        }
      } else {
        // Suspensión: se aplica como walkover — el rival gana 3-0
        if (esLocal) {
          estadoNuevo = 'walkover_visitante';
          golesLocal = 0; golesVisita = 3;
        } else {
          estadoNuevo = 'walkover_local';
          golesLocal = 3; golesVisita = 0;
        }
      }

      const { error } = await sb.from('partidos').update({
        estado: estadoNuevo,
        goles_local:     golesLocal,
        goles_visitante: golesVisita,
        updated_at: new Date().toISOString()
      })
        .eq('id', p.id)
        .eq('estado', 'pendiente'); // Cerrojo optimista: solo actualiza si sigue pendiente

      if (error) {
        result.errores.push('Partido jornada ' + p.jornada + ': ' + error.message);
      } else {
        result.resueltos++;
      }
    }

    return result;
  }

  /* Calcula suspensiones acumuladas pendientes de cumplir para un jugador.
     Devuelve el total de partidos de suspensión aún no cumplidos. */
  function suspensionAcumulada(jugadorId) {
    const sanciones = GL.ctx.sanciones.filter(s =>
      s.jugador_id === jugadorId && (s.partidos_suspension || 0) > 0);
    const totalSuspendidos = sanciones.reduce((a, s) => a + (s.partidos_suspension || 0), 0);
    // Contar partidos que ya se resolvieron como walkover por suspensión de este jugador
    const walkoversCumplidos = Mod.partidosCache.filter(p =>
      (p.local_id === jugadorId || p.visitante_id === jugadorId) &&
      (p.estado === 'walkover_local' || p.estado === 'walkover_visitante') &&
      !GL.esResolucionExpulsion(p)
    ).length;
    return Math.max(0, totalSuspendidos - walkoversCumplidos);
  }

  function modalSancion(j, root) {
    // Protección: no sancionar a un jugador ya expulsado
    if (j.activo === false || j.rol === 'expulsado') {
      GL.notificar('No se puede aplicar una sanción a un jugador ya expulsado del torneo.', 'advertencia');
      return;
    }

    // Calcular suspensión acumulada para mostrar advertencia si está cerca del límite
    const acumulada = suspensionAcumulada(j.id);
    const faltas    = GL.faltas(j.id);
    const alertaAcumulacion = faltas >= 2
      ? '<div style="background:rgba(255,71,87,.12);border:1px solid var(--accent-red);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px">' +
          icono('octagon-alert', 14) +
          ' <strong>Atención:</strong> ' + esc(j.nombre_usuario) + ' ya tiene <strong>' + faltas + ' falta(s)</strong>. ' +
          (faltas >= 3 ? 'Con otra falta grave quedará vetado en el próximo torneo.' : 'Una más activa alerta de veto.') +
        '</div>'
      : '';
    const alertaSuspension = acumulada > 0
      ? '<div style="background:rgba(245,197,24,.1);border:1px solid var(--accent-gold);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px">' +
          icono('info', 14) +
          ' Este jugador tiene <strong>' + acumulada + ' partido(s)</strong> de suspensión aún no cumplido(s).' +
        '</div>'
      : '';

    // Contar partidos pendientes disponibles para mostrar contexto
    const pendientesDisponibles = (Mod.partidosCache || []).filter(p =>
      p.estado === 'pendiente' &&
      (p.local_id === j.id || p.visitante_id === j.id) &&
      Number(p.jornada) < CONFIG.JORNADA_PLAYOFF_INICIO).length;

    const m = GL.abrirModal({
      titulo: 'Aplicar sanción — ' + esc(j.nombre_usuario),
      cuerpo:
        alertaAcumulacion +
        alertaSuspension +
        '<label class="campo"><span>Tipo de falta</span><select class="input" id="san-tipo">' +
          Object.entries(TIPOS_SANCION).map(([k, v]) =>
            '<option value="' + k + '">' + v.label + ' · ' + v.descripcion + '</option>').join('') +
        '</select></label>' +
        '<div class="campo-row">' +
          '<label class="campo"><span>Puntos a descontar</span><input class="input" type="number" min="0" max="99" id="san-puntos" value="3"></label>' +
          '<label class="campo"><span>Partidos de suspensión</span><input class="input" type="number" min="0" max="22" id="san-partidos" value="0"></label>' +
        '</div>' +
        '<label class="campo"><span>Motivo (obligatorio)</span><textarea class="input" id="san-motivo" placeholder="Describí claramente lo ocurrido" required></textarea></label>' +
        '<div id="san-preview" style="margin-top:10px;padding:10px;background:var(--bg-hover);border-radius:8px;font-size:12px;color:var(--text-secondary)"></div>',
      acciones:
        '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn peligro" id="san-aplicar">' + icono('gavel', 16) + 'Aplicar sanción</button>',
      onAbrir(fondo, cerrar) {
        const sel      = fondo.querySelector('#san-tipo');
        const inPuntos = fondo.querySelector('#san-puntos');
        const inParts  = fondo.querySelector('#san-partidos');
        const preview  = fondo.querySelector('#san-preview');

        // Vista previa de consecuencias en tiempo real
        const actualizarPreview = () => {
          const t     = TIPOS_SANCION[sel.value] || {};
          const nPts  = Number(inPuntos.value) || 0;
          const nPart = Number(inParts.value) || 0;
          const lineas = [];
          if (nPts > 0)   lineas.push('· Descuento de ' + nPts + ' punto(s) en la tabla');
          if (t.expulsion) {
            lineas.push('· EXPULSIÓN: el jugador sale del torneo');
            lineas.push('· Sus ' + pendientesDisponibles + ' partido(s) pendiente(s) se resolverán 1-0 a favor del rival (sin valla invicta)');
          } else if (nPart > 0) {
            lineas.push('· Suspensión de ' + nPart + ' partido(s)');
            lineas.push('· Los próximos ' + Math.min(nPart, pendientesDisponibles) + ' partido(s) pendientes en fase regular se resolverán 3-0 al rival');
            if (nPart > pendientesDisponibles) {
              lineas.push('· Solo hay ' + pendientesDisponibles + ' pendiente(s) disponibles en fase regular');
            }
          }
          preview.innerHTML = lineas.length
            ? '<strong>Consecuencias:</strong><br>' + lineas.join('<br>')
            : '<span class="muted">Completá los campos para ver el impacto.</span>';
        };

        sel.addEventListener('change', () => {
          const t = TIPOS_SANCION[sel.value];
          inPuntos.value = t.puntos  || 0;
          inParts.value  = t.partidos || 0;
          actualizarPreview();
        });
        inPuntos.addEventListener('input', actualizarPreview);
        inParts.addEventListener('input', actualizarPreview);
        actualizarPreview();

        fondo.querySelector('#san-aplicar').addEventListener('click', async () => {
          const btn   = fondo.querySelector('#san-aplicar');
          const tipo  = sel.value;
          const t     = TIPOS_SANCION[tipo];
          const motivo = fondo.querySelector('#san-motivo').value.trim();

          if (!motivo) {
            GL.notificar('El motivo de la sanción es obligatorio.', 'advertencia'); return;
          }
          // Verificación final: el jugador no fue expulsado mientras el modal estaba abierto
          const jFresco = GL.jugador(j.id);
          if (jFresco && (jFresco.activo === false || jFresco.rol === 'expulsado')) {
            GL.notificar('El jugador ya fue expulsado. No se puede aplicar otra sanción.', 'advertencia');
            cerrar(); return;
          }

          btn.disabled = true;
          btn.innerHTML = icono('loader-circle', 16, 'girando') + 'Aplicando…';

          const row = {
            jugador_id:          j.id,
            torneo_id:           GL.torneo().id,
            tipo,
            puntos_descuento:    Number(inPuntos.value) || 0,
            partidos_suspension: Number(inParts.value)  || 0,
            motivo,
            aplicada_por:        Auth.jugador.id
          };

          // 1. Registrar la sanción
          const { error: errSan } = await sb.from('sanciones').insert(row);
          if (errSan) {
            GL.notificar(GL.mensaje(errSan, 'guardar', 'la administración'), 'error');
            btn.disabled = false;
            btn.innerHTML = icono('gavel', 16) + 'Aplicar sanción';
            return;
          }

          // 2. Actualizar estado del jugador y resolver partidos
          let resPartidos = { resueltos: 0, errores: [], advertencias: [] };

          if (t.expulsion) {
            // Expulsión definitiva
            const { error: errJ } = await sb.from('jugadores')
              .update({ activo: false, rol: 'expulsado', suspendido: true })
              .eq('id', j.id)
              .neq('rol', 'expulsado'); // No re-expulsar si ya lo era (protección)
            if (errJ) console.warn('Expulsión jugador:', errJ.message);
            resPartidos = await resolverPartidosPorSancion(j.id, { tipo: 'expulsion' });
          } else if (row.partidos_suspension > 0) {
            // Suspensión temporal
            const { error: errJ } = await sb.from('jugadores')
              .update({ suspendido: true })
              .eq('id', j.id);
            if (errJ) console.warn('Suspensión jugador:', errJ.message);
            resPartidos = await resolverPartidosPorSancion(j.id, {
              tipo: 'suspension',
              partidosSuspension: row.partidos_suspension
            });
          }

          // 3. Recalcular tabla
          await recalcularTodosLosGrupos();

          // 4. Auditoría
          GL.auditoria && GL.auditoria.registrar('sancion_aplicada', 'sancion', null, {
            jugador:    j.nombre_usuario,
            tipo:       row.tipo,
            puntos:     row.puntos_descuento,
            partidos:   row.partidos_suspension,
            motivo:     row.motivo,
            resueltos:  resPartidos.resueltos
          });

          // 5. Notificación con detalle
          let msg = 'Sanción aplicada.';
          if (resPartidos.resueltos) msg += ' ' + resPartidos.resueltos + ' partido(s) resuelto(s).';
          if (resPartidos.errores.length) {
            msg += ' Hubo errores en ' + resPartidos.errores.length + ' partido(s): ' + resPartidos.errores[0];
          }
          if (resPartidos.advertencias.length) {
            resPartidos.advertencias.forEach(a => GL.notificar(a, 'advertencia'));
          }

          cerrar();
          GL.notificar(msg, resPartidos.errores.length ? 'advertencia' : 'exito');
          GL.invalidar();
          Mod.render(root);
        });
      }
    });
    iniciarIconos(); return m;
  }

  function modalSuspender(j, root) {
    const expulsado  = j.activo === false || j.rol === 'expulsado';
    const suspendido = !expulsado && j.suspendido === true;

    // ── Flujo A: Reincorporar ─────────────────────────────────────────────
    if (expulsado) {
      GL.abrirModal({
        titulo: 'Reincorporar jugador',
        cuerpo:
          '<p class="modal-texto">El jugador fue expulsado del torneo. Al reincorporarlo quedará activo como jugador regular.</p>' +
          '<div style="background:rgba(245,197,24,.1);border:1px solid var(--accent-gold);border-radius:8px;padding:10px 14px;font-size:13px;margin-top:8px">' +
            icono('info', 14) +
            ' Los partidos que se resolvieron 1-0 por la expulsión <strong>no se revertirán automáticamente</strong>. ' +
            'Si necesitás corregirlos, hacelo desde el módulo de resultados.' +
          '</div>',
        acciones:
          '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
          '<button type="button" class="btn" id="sus-ok">' + icono('user-check', 16) + 'Reincorporar</button>',
        onAbrir(fondo, cerrar) {
          fondo.querySelector('#sus-ok').addEventListener('click', async () => {
            const btn = fondo.querySelector('#sus-ok');
            btn.disabled = true;
            const { error } = await sb.from('jugadores')
              .update({ activo: true, rol: 'jugador', suspendido: false })
              .eq('id', j.id);
            if (error) { GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error'); btn.disabled = false; return; }
            GL.auditoria && GL.auditoria.registrar('jugador_estado_cambio', 'jugador', j.id, {
              jugador:         j.nombre_usuario,
              estado_anterior: 'expulsado',
              estado_nuevo:    'activo'
            });
            cerrar();
            GL.notificar(esc(j.nombre_usuario) + ' reincorporado al torneo.', 'exito');
            GL.invalidar(); Mod.render(root);
          });
        }
      });
      iniciarIconos(); return;
    }

    // ── Flujo B: Suspender o expulsar ────────────────────────────────────
    // Contar partidos pendientes para mostrar impacto
    const pendientesFR = (Mod.partidosCache || []).filter(p =>
      p.estado === 'pendiente' &&
      (p.local_id === j.id || p.visitante_id === j.id) &&
      Number(p.jornada) < CONFIG.JORNADA_PLAYOFF_INICIO).length;
    const pendientesEL = (Mod.partidosCache || []).filter(p =>
      p.estado === 'pendiente' &&
      (p.local_id === j.id || p.visitante_id === j.id) &&
      Number(p.jornada) >= CONFIG.JORNADA_PLAYOFF_INICIO).length;
    const acumulada = suspensionAcumulada(j.id);

    const alertaSuspendido = suspendido
      ? '<div style="background:rgba(255,140,0,.1);border:1px solid var(--accent-gold-2);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px">' +
          icono('info', 14) + ' Este jugador ya está suspendido. ' +
          (acumulada > 0 ? 'Le quedan <strong>' + acumulada + '</strong> partido(s) por cumplir.' : 'No quedan partidos de suspensión pendientes.') +
        '</div>'
      : '';

    GL.abrirModal({
      titulo: 'Suspender / expulsar — ' + esc(j.nombre_usuario),
      cuerpo:
        alertaSuspendido +
        '<p class="modal-texto">Elegí la acción disciplinaria. Los efectos sobre los partidos se aplican de forma inmediata.</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">' +

          // Opción 1: Suspensión temporal
          '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;background:var(--bg-hover);border-radius:8px;cursor:pointer">' +
            '<input type="radio" name="sus-accion" value="suspension" id="sus-opt-sus" style="margin-top:3px">' +
            '<div><div style="font-weight:600;font-size:14px">' + icono('clock', 14) + ' Suspensión temporal</div>' +
              '<div style="font-size:12px;color:var(--text-secondary);margin-top:3px">' +
                'Los próximos N partidos se resuelven 3-0 al rival. No se concede valla invicta al rival.' +
              '</div>' +
              '<label class="campo" style="margin-top:8px">' +
                '<span>Número de partidos de suspensión</span>' +
                '<input class="input" type="number" min="1" max="10" id="sus-nparts" value="1">' +
              '</label>' +
            '</div></label>' +

          // Opción 2: Expulsión definitiva
          '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;background:var(--bg-hover);border-radius:8px;cursor:pointer">' +
            '<input type="radio" name="sus-accion" value="expulsion" id="sus-opt-exp" style="margin-top:3px">' +
            '<div><div style="font-weight:600;font-size:14px;color:var(--accent-red)">' + icono('user-x', 14) + ' Expulsión definitiva</div>' +
              '<div style="font-size:12px;color:var(--text-secondary);margin-top:3px">' +
                'El jugador sale del torneo. Sus ' + pendientesFR + ' partido(s) pendientes en fase regular se ' +
                'resuelven 1-0 al rival (sin valla invicta).' +
                (pendientesEL ? ' También hay ' + pendientesEL + ' partido(s) de eliminatorias que se resolverán 1-0.' : '') +
              '</div>' +
            '</div></label>' +

        '</div>' +
        '<div id="sus-preview" style="padding:10px;background:var(--bg-secondary);border-radius:8px;font-size:12px;color:var(--text-secondary)"></div>',
      acciones:
        '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn peligro" id="sus-ok" disabled>' + icono('shield-off', 16) + 'Confirmar acción</button>',
      onAbrir(fondo, cerrar) {
        const preview = fondo.querySelector('#sus-preview');
        const btnOk   = fondo.querySelector('#sus-ok');

        const actualizarPreview = () => {
          const sel = fondo.querySelector('[name="sus-accion"]:checked');
          if (!sel) { preview.textContent = 'Seleccioná una acción.'; btnOk.disabled = true; return; }
          btnOk.disabled = false;
          if (sel.value === 'suspension') {
            const n = Number(fondo.querySelector('#sus-nparts').value) || 1;
            const afecta = Math.min(n, pendientesFR);
            preview.innerHTML =
              '· Suspensión de <strong>' + n + '</strong> partido(s)<br>' +
              '· Se resolverán <strong>' + afecta + '</strong> partido(s) pendiente(s) en fase regular como 3-0 al rival<br>' +
              (n > pendientesFR ? '· Solo hay ' + pendientesFR + ' partido(s) disponibles en fase regular<br>' : '') +
              '· El jugador queda marcado como "suspendido" hasta cumplir los partidos';
          } else {
            preview.innerHTML =
              '· <strong style="color:var(--accent-red)">Expulsión definitiva — acción irreversible</strong><br>' +
              '· ' + pendientesFR + ' partido(s) de fase regular → 1-0 al rival (sin valla invicta)<br>' +
              (pendientesEL ? '· ' + pendientesEL + ' partido(s) de eliminatorias → 1-0 al rival<br>' : '') +
              '· El jugador queda como "expulsado" y no puede participar más en este torneo';
          }
        };

        fondo.querySelectorAll('[name="sus-accion"]').forEach(r => r.addEventListener('change', actualizarPreview));
        fondo.querySelector('#sus-nparts').addEventListener('input', actualizarPreview);
        actualizarPreview();

        btnOk.addEventListener('click', async () => {
          const sel = fondo.querySelector('[name="sus-accion"]:checked');
          if (!sel) { GL.notificar('Seleccioná una acción.', 'advertencia'); return; }
          const accion = sel.value;

          // Protección: verificar que el jugador no fue expulsado mientras el modal estaba abierto
          const jFresco = GL.jugador(j.id);
          if (accion === 'expulsion' && jFresco && (jFresco.activo === false || jFresco.rol === 'expulsado')) {
            GL.notificar('El jugador ya fue expulsado previamente. Cerrá y recargá la vista.', 'advertencia');
            cerrar(); return;
          }

          btnOk.disabled = true;
          btnOk.innerHTML = icono('loader-circle', 16, 'girando') + 'Aplicando…';

          let resPartidos = { resueltos: 0, errores: [], advertencias: [] };
          let estadoAnterior = suspendido ? 'suspendido' : 'activo';
          let estadoNuevo    = '';

          if (accion === 'expulsion') {
            const { error } = await sb.from('jugadores')
              .update({ activo: false, rol: 'expulsado', suspendido: true })
              .eq('id', j.id)
              .neq('rol', 'expulsado'); // Protección anti-doble-expulsión
            if (error) { GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error'); btnOk.disabled = false; return; }
            resPartidos = await resolverPartidosPorSancion(j.id, { tipo: 'expulsion' });
            estadoNuevo = 'expulsado';
          } else {
            const n = Number(fondo.querySelector('#sus-nparts').value) || 1;
            const { error } = await sb.from('jugadores')
              .update({ suspendido: true })
              .eq('id', j.id);
            if (error) { GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error'); btnOk.disabled = false; return; }
            resPartidos = await resolverPartidosPorSancion(j.id, {
              tipo: 'suspension',
              partidosSuspension: n
            });
            estadoNuevo = 'suspendido';
          }

          await recalcularTodosLosGrupos();

          GL.auditoria && GL.auditoria.registrar('jugador_estado_cambio', 'jugador', j.id, {
            jugador:         j.nombre_usuario,
            estado_anterior: estadoAnterior,
            estado_nuevo:    estadoNuevo,
            resueltos:       resPartidos.resueltos
          });

          // Notificaciones
          resPartidos.advertencias.forEach(a => GL.notificar(a, 'advertencia'));

          let msg = esc(j.nombre_usuario) + (accion === 'expulsion' ? ' expulsado.' : ' suspendido.');
          if (resPartidos.resueltos) msg += ' ' + resPartidos.resueltos + ' partido(s) resuelto(s).';
          if (resPartidos.errores.length) msg += ' Error en ' + resPartidos.errores.length + ' partido(s).';

          cerrar();
          GL.notificar(msg, resPartidos.errores.length ? 'advertencia' : 'exito');
          GL.invalidar();
          Mod.render(root);
        });
      }
    });
    iniciarIconos();
  }

  function modalAgregar(root) {
    // Bloquear si el torneo ya finalizó
    const torneoActual = GL.torneo();
    if (torneoActual && torneoActual.estado === 'finalizado') {
      GL.notificar('El torneo ya finalizó. No se pueden agregar nuevos jugadores.', 'advertencia'); return;
    }
    if (!torneoActual) {
      GL.notificar('No hay un torneo activo. Creá uno desde Administración → Configuración.', 'advertencia'); return;
    }

    const grupos = GL.grupos();

    const m = GL.abrirModal({
      titulo: 'Agregar jugador al torneo',
      ancho: 'j5-forma',
      cuerpo:
        j5FormIntro('Completá los datos para crear la cuenta y asignar al jugador al torneo activo.') +
        '<div class="j5-form-grid">' +
          '<div class="j5-form-section">' +
            '<h3 class="j5-form-titulo">' + icono('user', 16) + 'Identidad y acceso</h3>' +
            '<label class="campo"><span>Nombre en FC Mobile ' + j5Requerido() + '</span>' +
              '<input class="input" id="ag-nombre" maxlength="32" ' +
                'placeholder="Ej: GOAT_PEREZ" autocomplete="off">' +
              '<small class="campo-ayuda">Solo letras, números y guión bajo. Máximo 32 caracteres.</small>' +
            '</label>' +
            '<label class="campo"><span>País ' + j5Requerido() + '</span>' +
              '<select class="input" id="ag-pais">' +
                GL.opcionesPais('NI', false) +
              '</select>' +
            '</label>' +
            '<label class="campo"><span>Correo electrónico ' + j5Requerido() + '</span>' +
              '<input class="input" type="email" id="ag-email" ' +
                'placeholder="jugador@correo.com" autocomplete="off">' +
            '</label>' +
            '<label class="campo"><span>Contraseña temporal ' + j5Requerido() + '</span>' +
              '<input class="input" id="ag-clave" ' +
                'value="' + Math.random().toString(36).slice(2, 10) + '" ' +
                'autocomplete="new-password">' +
              '<small class="campo-ayuda">Mínimo 8 caracteres. Entregala por un canal privado.</small>' +
            '</label>' +
          '</div>' +
          '<div class="j5-form-section">' +
            '<h3 class="j5-form-titulo">' + icono('phone', 16) + 'Contacto y torneo</h3>' +
            '<label class="campo"><span>Ciudad o zona horaria ' + j5Requerido() + '</span>' +
              '<select class="input" id="ag-zona">' +
                GL.opcionesZonaHoraria('', '') +
              '</select>' +
            '</label>' +
            '<p class="nota-pie" id="ag-horario"></p>' +
            '<label class="campo"><span>País del teléfono</span>' +
              '<select class="input" id="ag-tel-pais">' +
                GL.opcionesPais('NI', false) +
              '</select>' +
            '</label>' +
            '<label class="campo">' +
              '<span>Teléfono / WhatsApp (obligatorio) ' +
                '<small id="ag-tel-hint" class="j5-tel-hint">' + hintTel('NI') + '</small></span>' +
              '<div class="tel-wrap">' +
                '<button type="button" class="tel-prefijo" id="ag-tel-prefijo" aria-label="Código de país">+505</button>' +
                '<input class="input" id="ag-tel" placeholder="8108-5555" inputmode="numeric" required>' +
              '</div>' +
              '<small class="campo-ayuda">El formato válido no confirma la titularidad del número.</small>' +
            '</label>' +
            '<label class="campo"><span>Grupo ' + j5Requerido() + '</span>' +
              '<select class="input" id="ag-grupo">' +
                (grupos.length
                  ? grupos.map(g =>
                      '<option value="' + g.id + '">Grupo ' + GL.letraGrupo(g) +
                      ' — ' + e6Miembros(g).length + ' jugador(es)</option>'
                    ).join('')
                  : '<option value="">Sin grupos disponibles</option>') +
              '</select>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="j5-form-aviso">' + icono('info', 14) +
          ' La cuenta se crea en Supabase Auth mediante una función segura del servidor. ' +
          'El jugador podrá cambiar su contraseña desde el perfil.' +
        '</div>',

      acciones:
        '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="ag-crear">' + icono('user-plus', 16) + 'Crear jugador</button>',

      onAbrir(fondo, cerrar) {
        const pais = fondo.querySelector('#ag-pais');
        const zona = fondo.querySelector('#ag-zona');
        const nota = fondo.querySelector('#ag-horario');
        const telPais = fondo.querySelector('#ag-tel-pais');

        pais.addEventListener('change', () => GL.actualizarZona(zona, pais.value, nota));
        zona.addEventListener('change', () => GL.actualizarZona(zona, pais.value, nota, true));
        GL.actualizarZona(zona, pais.value, nota);
        enlazarCampoTelefono(fondo, {
          pais: '#ag-tel-pais', tel: '#ag-tel',
          prefijo: '#ag-tel-prefijo', hint: '#ag-tel-hint'
        });
        telPais.addEventListener('change', () => {
          errorCampo(fondo, '#ag-tel', null);
          const escrito = fondo.querySelector('#ag-tel').value.trim();
          if (escrito) {
            const revalidado = GL.tel.validar(escrito, telPais.value, false);
            if (!revalidado.ok) errorCampo(fondo, '#ag-tel', revalidado.mensaje);
          }
        });

        fondo.querySelector('#ag-crear').addEventListener('click', async () => {
          // Limpiar errores anteriores
          ['#ag-nombre', '#ag-pais', '#ag-zona', '#ag-tel', '#ag-email', '#ag-clave'].forEach(id =>
            errorCampo(fondo, id, null));
          let hayError = false;

          // ── Validar nombre ──────────────────────────────────────────
          const nombreRaw  = fondo.querySelector('#ag-nombre').value;
          const nombreNorm = GL.seguroTexto(nombreRaw).toUpperCase().replace(/\s+/g, '_');
          if (!nombreNorm || nombreNorm.length < 2) {
            errorCampo(fondo, '#ag-nombre', 'El nombre debe tener al menos 2 caracteres.');
            hayError = true;
          } else if (nombreNorm.length > 32) {
            errorCampo(fondo, '#ag-nombre', 'Máximo 32 caracteres (actual: ' + nombreNorm.length + ').');
            hayError = true;
          } else {
            const dupl = (GL.ctx.jugadores || []).find(x => x.nombre_usuario === nombreNorm);
            if (dupl) {
              errorCampo(fondo, '#ag-nombre', 'Ese nombre ya está en uso por otro jugador.');
              hayError = true;
            }
          }

          // ── Validar país ───────────────────────────────────────────
          if (!pais.value) {
            errorCampo(fondo, '#ag-pais', 'Seleccioná el país del jugador.');
            hayError = true;
          }

          // ── Validar zona horaria ───────────────────────────────────
          if (!zona.value) {
            errorCampo(fondo, '#ag-zona', 'Elegí la ciudad o zona horaria.');
            hayError = true;
          }

          // ── Validar teléfono obligatorio contra su propio país ────
          const telRaw = fondo.querySelector('#ag-tel').value.trim();
          const vTel = GL.tel.validar(telRaw, telPais.value, true);
          let camposTel = null;
          if (!vTel.ok) {
            errorCampo(fondo, '#ag-tel', vTel.mensaje);
            hayError = true;
          } else {
            camposTel = GL.tel.campos(vTel.e164, vTel.pais || telPais.value);
            if (!camposTel.telefono_e164) {
              errorCampo(fondo, '#ag-tel', 'El teléfono es obligatorio.');
              hayError = true;
            }
          }

          // ── Validar email ──────────────────────────────────────────
          const emailVal = fondo.querySelector('#ag-email').value.trim();
          if (!emailVal) {
            errorCampo(fondo, '#ag-email', 'El correo electrónico es obligatorio.');
            hayError = true;
          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
            errorCampo(fondo, '#ag-email', 'El formato del correo no es válido.');
            hayError = true;
          }

          // ── Validar contraseña ─────────────────────────────────────
          const claveVal = fondo.querySelector('#ag-clave').value;
          if (!claveVal || claveVal.length < 8) {
            errorCampo(fondo, '#ag-clave', 'La contraseña debe tener al menos 8 caracteres.');
            hayError = true;
          }

          // ── Validar grupo ──────────────────────────────────────────
          const grupoVal = fondo.querySelector('#ag-grupo').value;
          if (!grupoVal) {
            GL.notificar('No hay grupos disponibles. Creá los grupos desde Configuración.', 'error');
            hayError = true;
          }

          if (hayError) return;

          const btn = fondo.querySelector('#ag-crear');
          btn.disabled = true; btn.textContent = 'Creando…';

          const body = Object.assign({
            nombre_usuario: nombreNorm,
            pais:           pais.value,
            zona_horaria:   zona.value,
            grupo_id:       grupoVal,
            torneo_id:      torneoActual.id,
            email:          emailVal,
            password:       claveVal
          }, camposTel);

          try {
            const { data, error } = await sb.functions.invoke('admin-crear-jugador', { body });
            if (error) throw new Error(await mensajeInvoke(error));
            cerrar();
            GL.invalidar();
            await GL.cargarContexto(true);
            GL.notificar(esc(nombreNorm) + ' creado y asignado al grupo.', 'exito');
            Mod.render(root);
          } catch (e) {
            // Detectar errores específicos del servidor y mostrarlos junto al campo
            const msg = e.message || '';
            if (/jugadores_e164_canonicalizado_uniq|tel[eé]fono ya est[aá] registrado/i.test(msg)) {
              errorCampo(fondo, '#ag-tel', 'Ese teléfono ya está registrado en otro jugador.');
            } else if (/email|correo|ya existe/i.test(msg)) {
              errorCampo(fondo, '#ag-email', 'Ese correo ya está registrado en el sistema.');
            } else if (/nombre|duplicate/i.test(msg)) {
              errorCampo(fondo, '#ag-nombre', 'Ese nombre ya existe en la base de datos.');
            } else {
              GL.notificar('No se pudo crear el jugador: ' + msg, 'error');
            }
            btn.disabled = false; btn.textContent = 'Crear jugador';
          }
        });
      }
    });
    iniciarIconos(); return m;
  }

  /* ---------------- Modales de jornadas ---------------- */
  function modalVerJornada(n) {
    const parts = Mod.partidosCache.filter(p => p.jornada === n && p.grupo_id === Mod.grupoJornadas);
    GL.abrirModal({
      titulo: 'Partidos · Jornada ' + n,
      cuerpo: parts.length ? '<div class="partidos-lista" style="grid-template-columns:1fr">' + parts.map(p => {
        const r = GL.resultado(p);
        return '<div class="partido-card"><div class="equipo">' + icono('home', 14) + esc(GL.nombreJugador(p.local_id)) + '</div>' +
          '<div class="marcador ' + (r.pendiente ? '' : 'jugado') + '">' + r.texto + '</div>' +
          '<div class="equipo visita">' + esc(GL.nombreJugador(p.visitante_id)) + icono('plane', 14) + '</div></div>';
      }).join('') + '</div>' : GL.vacio('No hay partidos para esta jornada.', 'calendar-x', null)
    });
    iniciarIconos();
  }

  /* Horario real de una jornada: se guarda como instante y se edita en la
     zona de referencia para que el mensaje pueda convertirlo por jugador. */
  function modalEditarJornada(n, root) {
    const torneo = GL.torneo();
    if (!torneo) { GL.notificar('No hay torneo activo.', 'error'); return; }
    const jdata = GL.ctx.jornadas.find(j =>
      j.torneo_id === torneo.id && j.grupo_id === Mod.grupoJornadas && j.numero === n) || {};
    const partes = instante => {
      if (!instante) return { fecha: '', hora: '' };
      const d = new Date(instante);
      if (isNaN(d.getTime())) return { fecha: '', hora: '' };
      const p = GL.partesEnZona(d, CONFIG.ZONA_REFERENCIA);
      const dos = x => String(x).padStart(2, '0');
      return { fecha: p.year + '-' + dos(p.month) + '-' + dos(p.day), hora: dos(p.hour) + ':' + dos(p.minute) };
    };
    const ini = partes(jdata.fecha_inicio), fin = partes(jdata.hora_limite);
    const zona = GL.etiquetaZona(CONFIG.ZONA_REFERENCIA);
    GL.abrirModal({
      titulo: 'Horario de la jornada ' + n,
      cuerpo:
        '<p class="modal-texto">Cargá el instante real de inicio y de cierre. Se guarda en UTC y el generador de mensajes lo convierte a la zona de cada jugador.</p>' +
        '<div class="campo-row">' +
          '<label class="campo" style="margin:0"><span>Fecha de inicio (' + esc(zona) + ')</span>' +
            '<input class="input" type="date" id="jh-fecha-inicio" value="' + esc(ini.fecha) + '"></label>' +
          '<label class="campo" style="margin:0"><span>Hora de inicio (' + esc(zona) + ')</span>' +
            '<input class="input" type="time" id="jh-hora-inicio" value="' + esc(ini.hora) + '"></label>' +
        '</div>' +
        '<div class="campo-row mt">' +
          '<label class="campo" style="margin:0"><span>Fecha límite (' + esc(zona) + ')</span>' +
            '<input class="input" type="date" id="jh-fecha-limite" value="' + esc(fin.fecha || ini.fecha) + '"></label>' +
          '<label class="campo" style="margin:0"><span>Hora límite (' + esc(zona) + ')</span>' +
            '<input class="input" type="time" id="jh-hora-limite" value="' + esc(fin.hora) + '"></label>' +
        '</div>' +
        '<p class="nota-pie">Si falta alguno de estos datos, el generador de mensajes bloquea la vista previa hasta cargarlos.</p>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
                '<button type="button" class="btn" id="jh-guardar">' + icono('save', 16) + 'Guardar horario</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#jh-guardar').addEventListener('click', async () => {
          const btn = fondo.querySelector('#jh-guardar');
          const inicio = GL.momentoZona(fondo.querySelector('#jh-fecha-inicio').value,
            fondo.querySelector('#jh-hora-inicio').value, CONFIG.ZONA_REFERENCIA);
          const limite = GL.momentoZona(fondo.querySelector('#jh-fecha-limite').value,
            fondo.querySelector('#jh-hora-limite').value, CONFIG.ZONA_REFERENCIA);
          if (!inicio || !limite) {
            GL.notificar('Completá fecha y hora de inicio y de cierre.', 'advertencia'); return;
          }
          if (limite <= inicio) {
            GL.notificar('La hora límite debe ser posterior al inicio.', 'advertencia'); return;
          }
          btn.disabled = true;
          const values = { fecha_inicio: inicio.toISOString(), hora_limite: limite.toISOString() };
          const { error } = jdata.id
            ? await sb.from('jornadas').update(values).eq('id', jdata.id)
            : await sb.from('jornadas').insert(Object.assign({
                torneo_id: torneo.id, grupo_id: Mod.grupoJornadas, numero: n
              }, values));
          if (error) { GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error'); btn.disabled = false; return; }
          const grupoAud = GL.ctx.grupos.find(g => g.id === Mod.grupoJornadas);
          GL.auditoria && GL.auditoria.registrar('jornada_horario_actualizado', 'jornada', null, {
            numero: n,
            grupo: grupoAud ? grupoAud.nombre : '?',
            inicio: GL.fechaHoraEnZona(inicio, CONFIG.ZONA_REFERENCIA),
            limite: GL.fechaHoraEnZona(limite, CONFIG.ZONA_REFERENCIA)
          });
          cerrar();
          GL.invalidar();
          await GL.cargarContexto(true);
          GL.notificar('Horario de la jornada ' + n + ' guardado.', 'exito');
          Mod.render(root);
        });
      }
    });
    iniciarIconos();
  }

  /* Un expulsado nunca pierde 3-0: sus pendientes se resuelven 1-0 en contra. */
  function estadoCierre(p, elegido) {
    const localExp = GL.esExpulsado(GL.jugador(p.local_id));
    const visitaExp = GL.esExpulsado(GL.jugador(p.visitante_id));
    if (localExp && visitaExp) return 'doble_ausencia';
    if (localExp) return 'expulsion_visitante';
    if (visitaExp) return 'expulsion_local';
    return elegido;
  }

  // Genera el resumen de confirmación antes de ejecutar el cierre
  function resumenCierre(pendientes, fondo) {
    const conteo = { walkover_local: 0, walkover_visitante: 0, doble_ausencia: 0, expulsion: 0 };
    pendientes.forEach(p => {
      const local_exp  = GL.esExpulsado(GL.jugador(p.local_id));
      const visita_exp = GL.esExpulsado(GL.jugador(p.visitante_id));
      if (local_exp || visita_exp) { conteo.expulsion++; return; }
      const val = fondo ? (fondo.querySelector('[data-res="' + p.id + '"]') || {}).value || 'doble_ausencia' : 'doble_ausencia';
      conteo[val] = (conteo[val] || 0) + 1;
    });
    const lineas = [];
    if (conteo.walkover_local)     lineas.push(conteo.walkover_local     + ' victoria administrativa (local gana)');
    if (conteo.walkover_visitante) lineas.push(conteo.walkover_visitante + ' victoria administrativa (visita gana)');
    if (conteo.doble_ausencia)     lineas.push(conteo.doble_ausencia     + ' doble ausencia (0-0)');
    if (conteo.expulsion)          lineas.push(conteo.expulsion          + ' partido con jugador expulsado');
    return lineas;
  }

  function modalCerrarJornada(n, root) {
    const pendientes = Mod.partidosCache.filter(p =>
      p.jornada === n && p.grupo_id === Mod.grupoJornadas && p.estado === 'pendiente');

    if (!pendientes.length) { cerrarConFuncion(n, [], root); return; }

    const m = GL.abrirModal({
      titulo: 'Cerrar jornada ' + n,
      ancho: 'ancho',
      cuerpo:
        '<p class="modal-texto">Elegí cómo resolver cada partido pendiente según el reglamento.</p>' +
        pendientes.map(p => {
          const localExp  = GL.esExpulsado(GL.jugador(p.local_id));
          const visitaExp = GL.esExpulsado(GL.jugador(p.visitante_id));
          const autoLabel = localExp && visitaExp ? 'Doble ausencia (expulsados)'
            : localExp  ? 'Expulsado local — gana visita 1-0'
            : visitaExp ? 'Expulsado visita — gana local 1-0'
            : null;
          return '<div class="campo-row" data-pend="' + p.id + '" style="align-items:end;border-bottom:1px solid var(--border);padding-bottom:10px">' +
            '<div style="font-family:var(--gl-font-sans);font-weight:600;font-size:15px;flex:1">' +
              esc(GL.nombreJugador(p.local_id)) + ' vs ' + esc(GL.nombreJugador(p.visitante_id)) + '</div>' +
            (autoLabel
              ? '<span style="color:var(--text-secondary);font-size:13px">' + esc(autoLabel) + '</span>'
              : '<label class="campo" style="margin:0;min-width:200px"><span>Resolución</span>' +
                '<select class="input" data-res="' + p.id + '">' +
                  '<option value="walkover_local">Gana local 3-0 (visita ausente)</option>' +
                  '<option value="walkover_visitante">Gana visita 3-0 (local ausente)</option>' +
                  '<option value="doble_ausencia" selected>Doble ausencia 0-0</option>' +
                '</select></label>') +
          '</div>';
        }).join('') +
        '<div id="cj-resumen" style="margin-top:14px;padding:10px 12px;background:var(--bg-secondary);border-radius:var(--radius);font-size:13px;color:var(--text-secondary)"></div>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
                '<button type="button" class="btn" id="cj-ok">Cerrar jornada</button>',
      onAbrir(fondo, cerrar) {
        // Actualizar resumen al cambiar cualquier select
        function actualizarResumen() {
          const lineas = resumenCierre(pendientes, fondo);
          fondo.querySelector('#cj-resumen').innerHTML =
            '<strong>Resumen:</strong> ' + pendientes.length + ' partido(s) a resolver — ' +
            (lineas.length ? lineas.join(' · ') : 'todo automático por expulsiones');
        }
        fondo.querySelectorAll('[data-res]').forEach(s => s.addEventListener('change', actualizarResumen));
        actualizarResumen();

        fondo.querySelector('#cj-ok').addEventListener('click', async () => {
          const btn = fondo.querySelector('#cj-ok');
          btn.disabled = true;
          btn.textContent = 'Cerrando...';

          const resoluciones = pendientes
            .filter(p => !GL.esExpulsado(GL.jugador(p.local_id)) && !GL.esExpulsado(GL.jugador(p.visitante_id)))
            .map(p => ({
              partido_id: p.id,
              estado: fondo.querySelector('[data-res="' + p.id + '"]')
                ? fondo.querySelector('[data-res="' + p.id + '"]').value
                : 'doble_ausencia'
            }));

          cerrar();
          await cerrarConFuncion(n, resoluciones, root);
        });
      }
    });
    iniciarIconos(); return m;
  }

  async function cerrarConFuncion(n, resoluciones, root) {
    const torneo = GL.torneo();
    if (!torneo) { GL.notificar('No hay torneo activo.', 'error'); return; }

    // Buscar el grupo_id correspondiente
    const jornadaObj = GL.ctx.jornadas.find(j =>
      j.torneo_id === torneo.id && j.numero === n && j.grupo_id === Mod.grupoJornadas);

    // Llamar a la función transaccional en Supabase
    const { data, error } = await sb.rpc('gl_cerrar_jornada', {
      p_torneo_id:    torneo.id,
      p_grupo_id:     Mod.grupoJornadas,
      p_jornada:      n,
      p_resoluciones: resoluciones,
      p_cerrado_por:  (await sb.auth.getUser()).data.user.id
    });

    if (error) {
      GL.notificar(GL.mensaje(error, 'guardar', 'la administración'), 'error'); return;
    }
    if (data && !data.ok) {
      GL.notificar('No se pudo cerrar: ' + data.error, 'error'); return;
    }

    await recalcularTodosLosGrupos();
    GL.invalidar();

    const resueltos = data && data.partidos_resueltos ? data.partidos_resueltos : 0;
    const grupoAudC = GL.ctx.grupos.find(g => g.id === Mod.grupoJornadas);
    GL.auditoria && GL.auditoria.registrar('jornada_cerrada', 'jornada', null, {
      numero:             n,
      grupo:              grupoAudC ? grupoAudC.nombre : '?',
      partidos_resueltos: resueltos
    });
    GL.notificar(
      'Jornada ' + n + ' cerrada.' + (resueltos ? ' ' + resueltos + ' partido(s) resuelto(s).' : '') + ' Tabla actualizada.',
      'exito'
    );
    Mod.render(root);

    try {
      const mensajes = await GL.modulo('mensajes');
      if (mensajes && typeof mensajes.setContexto === 'function') {
        mensajes.setContexto('cierre', Mod.grupoJornadas, n);
      }
    } catch (e) { console.warn(e); }
    location.hash = 'mensajes';
  }

  Modulos.admin = Mod;
})();
