/* =====================================================================
   MÓDULO 7 — Panel de administración (validado en cada carga)
   A: Jugadores  B: Jornadas  C: Disciplina  D: Administradores  E: Configuración
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Administración',
    tab: 'jugadores',
    grupoJornadas: null,
    partidosCache: [],

    setTab(tab) { Mod.tab = tab || 'jugadores'; },

    async render(el) {
      el.innerHTML = GL.skeleton(8);
      if (!(await GL.asegurarAdmin(el))) return;
      try {
        await GL.cargarContexto(true);
        if (!GL.torneo()) {
          el.innerHTML = '<div class="card">' +
            '<div class="card-titulo">' + icono('trophy', 20) + 'No hay torneo activo</div>' +
            '<p class="muted">Creá el primer torneo y los grupos A/B para empezar a cargar datos.</p>' +
            '<button type="button" class="btn mt" id="crear-primero">' + icono('plus', 16) + 'Crear torneo inicial</button></div>';
          el.querySelector('#crear-primero').addEventListener('click', async () => {
            const { data: t, error } = await sb.from('torneos').insert({
              nombre: CONFIG.NOMBRE_LIGA, temporada: 'Temporada 1', estado: 'activo', total_jornadas: 22
            }).select().single();
            if (error) { GL.notificar(error.message, 'error'); return; }
            await sb.from('grupos').insert([
              { torneo_id: t.id, nombre: 'Grupo A' }, { torneo_id: t.id, nombre: 'Grupo B' }
            ]);
            GL.invalidar(); await GL.cargarContexto(true);
            GL.notificar('Torneo inicial creado.', 'exito'); Mod.render(el);
          });
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
          '<div class="tabs">' +
            tabBtn('jugadores', 'users', 'Jugadores') + tabBtn('jornadas', 'flag', 'Jornadas') +
            tabBtn('disciplina', 'gavel', 'Disciplina') +
            (superAdmin ? tabBtn('admins', 'shield-check', 'Administradores') : '') +
            tabBtn('config', 'settings-2', 'Configuración') +
          '</div><div id="contenido-admin"></div>';
        const cont = el.querySelector('#contenido-admin');
        const pintar = () => {
          cont.innerHTML = Mod.tab === 'jugadores' ? htmlJugadores() :
            Mod.tab === 'jornadas' ? htmlJornadas() :
            Mod.tab === 'disciplina' ? htmlDisciplina() :
            Mod.tab === 'admins' ? (superAdmin ? htmlAdmins() : GL.accesoDenegado('admin')) : htmlConfig();
          enlazar(cont, el);
          iniciarIconos();
        };
        pintar();
        el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
          Mod.tab = b.dataset.tab;
          el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('activo', x === b));
          pintar();
        }));
      } catch (e) { console.error(e); el.innerHTML = GL.error(e.message); }
      iniciarIconos();
    }
  };

  function tabBtn(id, ico, label) {
    return '<button type="button" class="tab' + (Mod.tab === id ? ' activo' : '') + '" data-tab="' + id + '">' +
      icono(ico, 16) + label + '</button>';
  }

  /* ---------------- A. Jugadores ---------------- */
  function htmlJugadores() {
    const jugadores = GL.jugadores();
    const primeraSemana = esPrimeraSemana();
    const filas = jugadores.map(j => {
      const g = GL.grupoDeJugador(j.id);
      const faltas = GL.faltas(j.id);
      const expulsado = j.activo === false || j.rol === 'expulsado';
      const acciones = iconBtn('editar-' + j.id, 'pencil', 'Editar jugador') +
        (g ? (primeraSemana ? iconBtn('grupo-' + j.id, 'users', 'Cambiar de grupo') : '')
           : iconBtn('asignar-' + j.id, 'user-plus', 'Asignar grupo')) +
        iconBtn('sancion-' + j.id, 'triangle-alert', 'Aplicar sanción') +
        iconBtn('suspender-' + j.id, 'user-x', 'Suspender / expulsar');
      const accionesMovil = accionBtn('editar-' + j.id, 'pencil', 'Editar jugador') +
        (g ? (primeraSemana ? accionBtn('grupo-' + j.id, 'users', 'Cambiar de grupo') : '')
           : accionBtn('asignar-' + j.id, 'user-plus', 'Asignar grupo')) +
        accionBtn('sancion-' + j.id, 'triangle-alert', 'Aplicar sanción') +
        accionBtn('suspender-' + j.id, 'user-x', 'Suspender / expulsar');
      return '<tr class="' + (faltas >= 3 ? 'fila-alerta' : '') + '" style="animation-delay:' + (jugadores.indexOf(j) * .03) + 's">' +
        '<td class="izq"><div class="jugador-celda">' + GL.avatarHTML(j, 'avatar-sm') +
          '<span>' + esc(j.nombre_usuario) + (faltas >= 3 ? ' ' + icono('octagon-alert', 14, 'rojo-txt') + '<span class="sr-only" title="Veto próximo torneo">Veto próximo torneo</span>' : '') + '</span></div></td>' +
        '<td><span class="pais-celda" title="' + esc(GL.nombrePais(j.pais)) + '">' + GL.banderaHTML(j.pais, 16) +
          '<span class="codigo-pais">' + esc(j.pais || '—') + '</span></span></td>' +
        '<td class="izq"><span class="muted" style="font-size:11px">' + esc(GL.horarioPais(j.pais)) + '</span></td>' +
        '<td>' + GL.linkWhatsapp(j.telefono, j.nombre_usuario) + '</td>' +
        '<td>' + (g ? 'Grupo ' + GL.letraGrupo(g) : 'Sin asignar') + '</td>' +
        '<td>' + GL.badge(j.rol === 'admin' ? (j.super_admin ? 'Principal' : 'Admin') : 'Jugador', j.rol === 'admin' ? 'gold' : 'neutral') + '</td>' +
        '<td>' + (expulsado ? GL.badge('Expulsado', 'red') : j.suspendido ? GL.badge('Suspendido', 'orange') : GL.badge('Activo', 'green')) + '</td>' +
        '<td class="num ' + (faltas >= 3 ? 'rojo-txt' : '') + '">' + faltas + '</td>' +
        '<td class="col-acciones">' +
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
    return '<div class="seccion-head"><div class="seccion-titulo"><h2>Gestión de jugadores</h2>' +
      '<p>' + jugadores.length + ' jugadores en el torneo' + (primeraSemana ? ' · Cambio de grupo disponible (primera semana)' : '') + '</p></div>' +
      '<div class="seccion-acciones"><button type="button" class="btn sm" data-agregar>' + icono('user-plus', 16) + 'Agregar jugador</button></div></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th class="izq">Nombre</th><th>País</th><th>Horario</th><th>Contacto</th><th>Grupo</th><th>Rol</th><th>Estado</th><th>Faltas</th><th>Acciones</th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="9" class="vacio-mensaje">No hay jugadores cargados.</td></tr>') + '</tbody></table></div>';
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
      if (tipo === 'grupo')    modalGrupo(j, root);
      if (tipo === 'asignar')  modalGrupo(j, root, true);
      if (tipo === 'sancion')  modalSancion(j, root);
      if (tipo === 'suspender') modalSuspender(j, root);
    };

    const botonesHTML = items.map(item =>
      '<button type="button" class="btn sec" data-accion-menu="' + esc(item.accion) + '">' +
        icono(item.ico, 16) + esc(item.label) +
      '</button>'
    ).join('');

    if (esMobile) {
      // Bottom sheet
      const fondo = document.createElement('div');
      fondo.className = 'menu-bottom-sheet-fondo';
      const sheet = document.createElement('div');
      sheet.className = 'menu-bottom-sheet';
      sheet.innerHTML =
        '<div class="menu-bottom-sheet-titulo">' + icono('user', 15) + esc(titulo) + '</div>' +
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
          '<small>' + esc(GL.fecha(jdata.fecha)) + ' · ' + hechos + '/' + parts.length + ' partidos</small>' +
          (jdata.estado === 'cerrada' ? GL.badge('Cerrada', 'red') : GL.badge('Abierta', 'green')) +
          '<div style="flex:1;min-width:90px;max-width:130px"><div class="barra-progreso"><span style="width:' + pct + '%"></span></div></div>' +
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
        '<td>' + esc(GL.fecha(s.created_at)) + '</td></tr>';
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
        '<div class="card"><div class="card-titulo">' + icono('shield-check', 19) + 'Rol asignado</div>' +
          '<div class="tabla-wrap"><table class="tabla"><thead><tr><th class="izq">Nombre</th><th class="izq">Correo</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead><tbody>' +
          (filas || '<tr><td colspan="5" class="vacio-mensaje">No hay administradores cargados.</td></tr>') +
          '</tbody></table></div></div>' +
        '<div class="card"><div class="card-titulo">' + icono('user-plus', 19) + 'Añadir administrador</div>' +
          '<p class="muted" style="font-size:12px">Si el correo ya tiene cuenta, conserva su contraseña. Si no, se crea con la clave de administrador configurada en el servidor.</p>' +
          '<label class="campo mt"><span>Correo electrónico</span><input class="input" type="email" id="adm-email" autocomplete="email" placeholder="jugador@correo.com" required></label>' +
          '<label class="campo"><span>Nombre en el juego (opcional)</span><input class="input" id="adm-nombre" maxlength="24" placeholder="Ej. GOAT_ADMIN"></label>' +
          '<button type="button" class="btn block" id="adm-agregar">' + icono('shield-plus', 16) + 'Designar administrador</button>' +
          '<p class="nota-pie">La clave de administrador no se guarda en el navegador: se valida en el servidor.</p>' +
        '</div>' +
        '<div class="card"><div class="card-titulo">' + icono('key-round', 19) + 'Clave de administrador</div>' +
          '<p class="muted" style="font-size:12px">Solo el administrador principal puede consultarla para compartirla de forma privada con otros administradores.</p>' +
          '<button type="button" class="btn sec block mt" data-ver-clave>' + icono('eye', 16) + 'Ver clave de administrador</button>' +
          '<p class="nota-pie">La clave se obtiene del servidor únicamente con tu sesión de administrador principal.</p>' +
        '</div></div>';
  }

  /* ---------------- E. Configuración ---------------- */
  function htmlConfig() {
    const t = GL.torneo() || {};
    return '<div class="grid dos">' +
      '<div class="card"><div class="card-titulo">' + icono('settings-2', 19) + 'Datos del torneo</div>' +
        '<label class="campo"><span>Nombre</span><input class="input" id="cfg-nombre" value="' + esc(t.nombre || '') + '"></label>' +
        '<label class="campo"><span>Temporada</span><input class="input" id="cfg-temporada" value="' + esc(t.temporada || '') + '"></label>' +
        '<label class="campo"><span>Total de jornadas</span><input class="input" type="number" min="' + CONFIG.JORNADAS_FASE_REGULAR + '" max="' + CONFIG.JORNADAS_FASE_REGULAR + '" id="cfg-jornadas" value="' + (t.total_jornadas || CONFIG.JORNADAS_FASE_REGULAR) + '"></label>' +
        '<label class="campo"><span>Estado</span><select class="input" id="cfg-estado">' +
          '<option value="activo"' + (t.estado === 'activo' ? ' selected' : '') + '>Activo</option>' +
          '<option value="finalizado"' + (t.estado === 'finalizado' ? ' selected' : '') + '>Finalizado</option>' +
        '</select></label>' +
        '<button type="button" class="btn" id="guardar-cfg">' + icono('save', 16) + 'Guardar cambios</button>' +
      '</div>' +
      '<div class="card"><div class="card-titulo">' + icono('rotate-ccw', 19) + 'Nueva temporada</div>' +
        '<p class="muted" style="font-size:12px">Archiva el torneo actual y crea uno nuevo con grupos A y B. Los datos históricos se conservan.</p>' +
        '<label class="campo mt"><span>Nombre de la nueva temporada</span><input class="input" id="nueva-temp" placeholder="Ej. 2026 · Clausura"></label>' +
        '<button type="button" class="btn peligro block" id="nuevo-torneo">' + icono('plus', 16) + 'Archivar y crear nuevo torneo</button>' +
      '</div></div>';
  }

  async function mensajeInvoke(error) {
    try {
      const cuerpo = await error.context.json();
      return cuerpo.error || error.message;
    } catch (e) { return error.message; }
  }

  /* ---------------- Enlaces de eventos ---------------- */
  function enlazar(cont, root) {
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
      if (accion === 'grupo')     modalGrupo(j, root);
      if (accion === 'asignar')   modalGrupo(j, root, true);
      if (accion === 'sancion')   modalSancion(j, root);
      if (accion === 'suspender') modalSuspender(j, root);
    }));
    const agregar = cont.querySelector('[data-agregar]');
    if (agregar) agregar.addEventListener('click', () => modalAgregar(root));

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
        GL.notificar(e.message, 'error');
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
            } catch (e) { GL.notificar(e.message, 'error'); btn.disabled = false; }
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
      } catch (e) { GL.notificar(e.message, 'error'); }
      finally { verClave.disabled = false; }
    });

    cont.querySelectorAll('[data-grupo-j]').forEach(b => b.addEventListener('click', () => {
      Mod.grupoJornadas = b.dataset.grupoJ; Mod.render(root);
    }));
    cont.querySelectorAll('[data-ver-jornada]').forEach(b => b.addEventListener('click', () =>
      modalVerJornada(Number(b.dataset.verJornada))));
    cont.querySelectorAll('[data-cerrar-jornada]').forEach(b => b.addEventListener('click', () =>
      modalCerrarJornada(Number(b.dataset.cerrarJornada), root)));
    cont.querySelectorAll('[data-abrir-jornada]').forEach(b => b.addEventListener('click', async () => {
      const n = Number(b.dataset.abrirJornada);
      const { error } = await sb.from('jornadas').update({ estado: 'abierta' })
        .eq('torneo_id', GL.torneo().id).eq('numero', n).eq('grupo_id', Mod.grupoJornadas);
      if (error) { GL.notificar(error.message, 'error'); return; }
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
    if (guardarCfg) guardarCfg.addEventListener('click', async () => {
      const update = {
        nombre: cont.querySelector('#cfg-nombre').value.trim(),
        temporada: cont.querySelector('#cfg-temporada').value.trim(),
        total_jornadas: Number(cont.querySelector('#cfg-jornadas').value) || CONFIG.JORNADAS_FASE_REGULAR,
        estado: cont.querySelector('#cfg-estado').value
      };
      if (update.total_jornadas !== CONFIG.JORNADAS_FASE_REGULAR) {
        GL.notificar('La fase regular debe tener exactamente ' + CONFIG.JORNADAS_FASE_REGULAR + ' jornadas.', 'advertencia'); return;
      }
      const { error } = await sb.from('torneos').update(update).eq('id', GL.torneo().id);
      if (error) GL.notificar(error.message, 'error');
      else { GL.invalidar(); await GL.cargarContexto(true); pintarTemporada(); GL.notificar('Configuración guardada.', 'exito'); Mod.render(root); }
    });
    const nuevo = cont.querySelector('#nuevo-torneo');
    if (nuevo) nuevo.addEventListener('click', () => nuevoTorneo(cont.querySelector('#nueva-temp').value.trim(), root));
  }

  /* ---------------- Modales de jugadores ---------------- */
  function modalEditar(j, root) {
    const m = GL.abrirModal({
      titulo: 'Editar jugador',
      cuerpo: '<label class="campo"><span>Nombre en el juego</span><input class="input" id="ed-nombre" value="' + esc(j.nombre_usuario) + '"></label>' +
        '<label class="campo"><span>País</span><select class="input" id="ed-pais">' +
        GL.opcionesPais(j.pais, true) +
        '</select></label>' +
        '<label class="campo"><span>Teléfono</span><input class="input" id="ed-tel" value="' + esc(j.telefono || '') + '"></label>' +
        ('numero' in j ? '<label class="campo"><span>Número del jugador</span><input class="input" type="number" min="0" max="99" id="ed-numero" value="' + esc(j.numero || '') + '"></label>' : ''),
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn" id="ed-guardar">Guardar</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#ed-guardar').addEventListener('click', async () => {
          const update = {
            nombre_usuario: GL.seguroTexto(fondo.querySelector('#ed-nombre').value).toUpperCase().replace(/\s+/g, '_'),
            pais: fondo.querySelector('#ed-pais').value,
            telefono: fondo.querySelector('#ed-tel').value.trim()
          };
          if ('numero' in j) {
            const n = fondo.querySelector('#ed-numero');
            update.numero = n && n.value !== '' ? Number(n.value) : null;
          }
          const { error } = await sb.from('jugadores').update(update).eq('id', j.id);
          if (error) GL.notificar(error.message, 'error');
          else { cerrar(); GL.invalidar(); GL.notificar('Jugador actualizado.', 'exito'); Mod.render(root); }
        });
      }
    });
    iniciarIconos(); return m;
  }

  function modalGrupo(j, root, asignar) {
    if (asignar !== true && !esPrimeraSemana()) {
      GL.notificar('El cambio de grupo solo está disponible durante la primera semana.', 'advertencia'); return;
    }
    const actualGrupo = GL.grupoDeJugador(j.id);
    const m = GL.abrirModal({
      titulo: asignar === true ? 'Asignar grupo' : 'Cambiar de grupo',
      cuerpo: '<p class="modal-texto">' + (asignar === true
        ? 'Asigná el grupo de este jugador. La asignación inicial siempre está disponible.'
        : 'Disponible solo durante la primera semana del torneo.') + '</p>' +
        '<label class="campo"><span>Grupo destino</span><select class="input" id="gr-grupo">' +
        GL.grupos().map(g => '<option value="' + g.id + '"' + (actualGrupo && g.id === actualGrupo.id ? ' selected' : '') + '>Grupo ' + GL.letraGrupo(g) + '</option>').join('') +
        '</select></label>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn" id="gr-guardar">' +
        (asignar === true ? 'Asignar' : 'Mover jugador') + '</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#gr-guardar').addEventListener('click', async () => {
          if (asignar !== true && !esPrimeraSemana()) {
            GL.notificar('La ventana de cambio de grupo ya cerró.', 'advertencia'); return;
          }
          const gid = fondo.querySelector('#gr-grupo').value;
          const { error: errDel } = await sb.from('grupo_jugadores').delete().eq('jugador_id', j.id);
          if (errDel) { GL.notificar(errDel.message, 'error'); return; }
          const { error } = await sb.from('grupo_jugadores').insert({ grupo_id: gid, jugador_id: j.id });
          if (error) { GL.notificar(error.message, 'error'); return; }
          const grupoAnt = actualGrupo ? GL.ctx.grupos.find(g => g.id === actualGrupo.id) : null;
          const grupoNvo = GL.ctx.grupos.find(g => g.id === gid);
          GL.auditoria && GL.auditoria.registrar('jugador_grupo_cambio', 'jugador', j.id, {
            jugador:        j.nombre_usuario,
            grupo_anterior: grupoAnt ? grupoAnt.nombre : 'Sin asignar',
            grupo_nuevo:    grupoNvo ? grupoNvo.nombre : '?'
          });
          cerrar(); GL.invalidar(); await GL.cargarContexto(true);
          GL.notificar(asignar === true ? 'Jugador asignado al grupo.' : 'Jugador movido de grupo.', 'exito');
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
          icono('info', 12) +
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
            GL.notificar('Error al registrar la sanción: ' + errSan.message, 'error');
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
            if (error) { GL.notificar(error.message, 'error'); btn.disabled = false; return; }
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
          icono('info', 12) + ' Este jugador ya está suspendido. ' +
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
            if (error) { GL.notificar('Error al expulsar: ' + error.message, 'error'); btnOk.disabled = false; return; }
            resPartidos = await resolverPartidosPorSancion(j.id, { tipo: 'expulsion' });
            estadoNuevo = 'expulsado';
          } else {
            const n = Number(fondo.querySelector('#sus-nparts').value) || 1;
            const { error } = await sb.from('jugadores')
              .update({ suspendido: true })
              .eq('id', j.id);
            if (error) { GL.notificar('Error al suspender: ' + error.message, 'error'); btnOk.disabled = false; return; }
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
    const m = GL.abrirModal({
      titulo: 'Agregar jugador',
      ancho: '',
      cuerpo: '<div class="campo-row">' +
          '<label class="campo"><span>Nombre en FC Mobile</span><input class="input" id="ag-nombre" maxlength="24" required></label>' +
          '<label class="campo"><span>País</span><select class="input" id="ag-pais">' +
            GL.opcionesPais('', false) +
          '</select></label></div>' +
        '<div class="campo-row">' +
          '<label class="campo"><span>Teléfono</span><input class="input" id="ag-tel"></label>' +
          '<label class="campo"><span>Grupo</span><select class="input" id="ag-grupo">' +
            GL.grupos().map(g => '<option value="' + g.id + '">Grupo ' + GL.letraGrupo(g) + '</option>').join('') +
          '</select></label></div>' +
        '<div class="campo-row">' +
          '<label class="campo"><span>Correo electrónico</span><input class="input" type="email" id="ag-email" required></label>' +
          '<label class="campo"><span>Contraseña temporal</span><input class="input" id="ag-clave" value="' + Math.random().toString(36).slice(2, 10) + '" required></label>' +
        '</div>' +
        '<p class="nota-pie">La cuenta se crea en Supabase Auth mediante una función segura del servidor. Entregale la contraseña al jugador por un canal privado.</p>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn" id="ag-crear">Crear jugador</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#ag-crear').addEventListener('click', async () => {
          const body = {
            nombre_usuario: GL.seguroTexto(fondo.querySelector('#ag-nombre').value).toUpperCase().replace(/\s+/g, '_'),
            pais: fondo.querySelector('#ag-pais').value,
            telefono: fondo.querySelector('#ag-tel').value.trim(),
            grupo_id: fondo.querySelector('#ag-grupo').value,
            torneo_id: GL.torneo().id,
            email: fondo.querySelector('#ag-email').value.trim(),
            password: fondo.querySelector('#ag-clave').value
          };
          if (!body.nombre_usuario || !body.email || body.password.length < 8) {
            GL.notificar('Completá nombre, correo y una contraseña de 8+ caracteres.', 'advertencia'); return;
          }
          const btn = fondo.querySelector('#ag-crear'); btn.disabled = true; btn.textContent = 'Creando…';
          try {
            const { data, error } = await sb.functions.invoke('admin-crear-jugador', { body });
            if (error) throw new Error(await mensajeInvoke(error));
            cerrar(); GL.invalidar(); await GL.cargarContexto(true);
            GL.notificar('Jugador creado y asignado al grupo.', 'exito'); Mod.render(root);
          } catch (e) {
            GL.notificar('No se pudo crear: ' + e.message, 'error');
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
            '<div style="font-family:Rajdhani;font-weight:600;font-size:15px;flex:1">' +
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
      GL.notificar('Error al cerrar: ' + error.message, 'error'); return;
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

  async function nuevoTorneo(temporada, root) {
    if (!temporada) { GL.notificar('Escribí el nombre de la nueva temporada.', 'advertencia'); return; }
    const torneoActual = GL.torneo();
    if (!torneoActual) { GL.notificar('No hay torneo activo para archivar.', 'error'); return; }
    const si = await GL.confirmar(
      'Se archivará "' + (torneoActual.nombre || CONFIG.NOMBRE_LIGA) + '" y se creará "' + temporada + '". ¿Continuar?',
      'Nuevo torneo', 'Archivar y crear'
    );
    if (!si) return;

    const user = (await sb.auth.getUser()).data.user;
    if (!user) { GL.notificar('Sesión expirada. Recargá la página.', 'error'); return; }

    const { data, error } = await sb.rpc('gl_crear_temporada', {
      p_torneo_anterior_id:  torneoActual.id,
      p_nombre_liga:         CONFIG.NOMBRE_LIGA,
      p_temporada:           temporada,
      p_total_jornadas:      CONFIG.JORNADAS_FASE_REGULAR,
      p_creado_por:          user.id
    });

    if (error) { GL.notificar('Error al crear temporada: ' + error.message, 'error'); return; }
    if (data && !data.ok) { GL.notificar('No se pudo crear: ' + data.error, 'error'); return; }

    GL.auditoria && GL.auditoria.registrar('torneo_creado', 'torneo', data.torneo_id, {
      nombre:    CONFIG.NOMBRE_LIGA,
      temporada: temporada
    });
    GL.invalidar();
    await GL.cargarContexto(true);
    pintarTemporada();
    GL.notificar('Nueva temporada "' + temporada + '" creada correctamente.', 'exito');
    location.hash = 'administracion';
    Mod.render(root);
  }

  Modulos.admin = Mod;
})();
