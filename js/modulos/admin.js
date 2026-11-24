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
          '<details class="acciones-movil">' +
            '<summary class="btn-icon" aria-label="Acciones de ' + esc(j.nombre_usuario) + '">' + icono('ellipsis', 18) + '</summary>' +
            '<div class="acciones-desplegable">' + accionesMovil + '</div>' +
          '</details>' +
        '</td></tr>';
    }).join('');
    return '<div class="seccion-head"><div class="seccion-titulo"><h2>Gestión de jugadores</h2>' +
      '<p>' + jugadores.length + ' jugadores en el torneo' + (primeraSemana ? ' · Cambio de grupo disponible (primera semana)' : '') + '</p></div>' +
      '<div class="seccion-acciones"><button type="button" class="btn sm" data-agregar>' + icono('user-plus', 16) + 'Agregar jugador</button></div></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th class="izq">Nombre</th><th>País</th><th>Horario</th><th>Contacto</th><th>Grupo</th><th>Rol</th><th>Estado</th><th>Faltas</th><th>Acciones</th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="9" class="vacio-mensaje">No hay jugadores cargados.</td></tr>') + '</tbody></table></div>';
  }

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
    cont.querySelectorAll('.acciones-movil').forEach(d => d.addEventListener('toggle', () => {
      if (d.open) cont.querySelectorAll('.acciones-movil').forEach(x => { if (x !== d) x.open = false; });
    }));
    cont.querySelectorAll('[data-accion]').forEach(b => b.addEventListener('click', () => {
      const raw = b.dataset.accion, corte = raw.indexOf('-');
      const accion = raw.slice(0, corte), id = raw.slice(corte + 1);
      const j = GL.jugador(id);
      if (!j) return;
      if (accion === 'editar') modalEditar(j, root);
      if (accion === 'grupo') modalGrupo(j, root);
      if (accion === 'asignar') modalGrupo(j, root, true);
      if (accion === 'sancion') modalSancion(j, root);
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
      if (error) GL.notificar(error.message, 'error');
      else { GL.notificar('Jornada ' + n + ' abierta.', 'exito'); GL.invalidar(); Mod.render(root); }
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
          if (error) GL.notificar(error.message, 'error');
          else {
            cerrar(); GL.invalidar(); await GL.cargarContexto(true);
            GL.notificar(asignar === true ? 'Jugador asignado al grupo.' : 'Jugador movido de grupo.', 'exito');
            Mod.render(root);
          }
        });
      }
    });
    iniciarIconos(); return m;
  }

  /* Resuelve 1-0 los pendientes de un jugador expulsado, sin valla invicta. */
  async function resolverPartidosPorExpulsion(jugadorId) {
    const pendientes = Mod.partidosCache.filter(p =>
      p.estado === 'pendiente' && (p.local_id === jugadorId || p.visitante_id === jugadorId));
    for (const p of pendientes) {
      const estado = p.local_id === jugadorId ? 'expulsion_visitante' : 'expulsion_local';
      const r = GL.resultado({ estado });
      const { error } = await sb.from('partidos').update({
        estado, goles_local: r.gf, goles_visitante: r.gc, updated_at: new Date().toISOString()
      }).eq('id', p.id).eq('estado', 'pendiente');
      if (error) console.warn('Resolver expulsión:', error.message);
    }
  }

  function modalSancion(j, root) {
    const m = GL.abrirModal({
      titulo: 'Aplicar sanción',
      cuerpo: '<label class="campo"><span>Tipo de falta</span><select class="input" id="san-tipo">' +
        Object.entries(TIPOS_SANCION).map(([k, v]) => '<option value="' + k + '">' + v.label + ' · ' + v.descripcion + '</option>').join('') +
        '</select></label>' +
        '<div class="campo-row">' +
          '<label class="campo"><span>Puntos a descontar</span><input class="input" type="number" min="0" id="san-puntos" value="3"></label>' +
          '<label class="campo"><span>Partidos de suspensión</span><input class="input" type="number" min="0" id="san-partidos" value="0"></label>' +
        '</div>' +
        '<label class="campo"><span>Motivo</span><textarea class="input" id="san-motivo" placeholder="Describí lo ocurrido"></textarea></label>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn peligro" id="san-aplicar">Aplicar sanción</button>',
      onAbrir(fondo, cerrar) {
        const sel = fondo.querySelector('#san-tipo');
        sel.addEventListener('change', () => {
          const t = TIPOS_SANCION[sel.value];
          fondo.querySelector('#san-puntos').value = t.puntos || 0;
          fondo.querySelector('#san-partidos').value = t.partidos || 0;
        });
        fondo.querySelector('#san-aplicar').addEventListener('click', async () => {
          const tipo = sel.value, t = TIPOS_SANCION[tipo];
          const row = {
            jugador_id: j.id, torneo_id: GL.torneo().id, tipo,
            puntos_descuento: Number(fondo.querySelector('#san-puntos').value) || 0,
            partidos_suspension: Number(fondo.querySelector('#san-partidos').value) || 0,
            motivo: fondo.querySelector('#san-motivo').value.trim(),
            aplicada_por: Auth.jugador.id
          };
          const { error } = await sb.from('sanciones').insert(row);
          if (error) { GL.notificar(error.message, 'error'); return; }
          if (t.expulsion) {
            await sb.from('jugadores').update({ activo: false, rol: 'expulsado', suspendido: true }).eq('id', j.id);
            await resolverPartidosPorExpulsion(j.id);
          } else if (row.partidos_suspension > 0) {
            await sb.from('jugadores').update({ suspendido: true }).eq('id', j.id);
          }
          await recalcularTodosLosGrupos();
          cerrar(); GL.notificar('Sanción aplicada y clasificación recalculada.', 'exito'); Mod.render(root);
        });
      }
    });
    iniciarIconos(); return m;
  }

  function modalSuspender(j, root) {
    const expulsado = j.activo === false || j.rol === 'expulsado';
    const m = GL.abrirModal({
      titulo: expulsado ? 'Reincorporar jugador' : 'Suspender / expulsar jugador',
      cuerpo: '<p class="modal-texto">' + (expulsado
        ? 'El jugador fue expulsado del torneo. ¿Querés reincorporarlo?'
        : 'Si lo expulsás, sus partidos pendientes se resuelven 1-0 a favor del rival, sin contar valla invicta.') + '</p>' +
        (expulsado ? '' : '<label class="toggle"><input type="checkbox" id="sus-expulsar"> Marcar como expulsión definitiva</label>'),
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn ' + (expulsado ? 'verde' : 'peligro') + '" id="sus-ok">' +
        (expulsado ? 'Reincorporar' : 'Confirmar') + '</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#sus-ok').addEventListener('click', async () => {
          const exp = !expulsado && fondo.querySelector('#sus-expulsar').checked;
          const update = exp ? { activo: false, rol: 'expulsado', suspendido: true } :
            expulsado ? { activo: true, rol: 'jugador', suspendido: false } : { suspendido: !j.suspendido };
          const { error } = await sb.from('jugadores').update(update).eq('id', j.id);
          if (error) { GL.notificar(error.message, 'error'); return; }
          if (exp) await resolverPartidosPorExpulsion(j.id);
          await recalcularTodosLosGrupos();
          cerrar(); GL.notificar('Estado del jugador actualizado.', 'exito'); Mod.render(root);
        });
      }
    });
    iniciarIconos(); return m;
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

  function modalCerrarJornada(n, root) {
    const pendientes = Mod.partidosCache.filter(p => p.jornada === n && p.grupo_id === Mod.grupoJornadas && p.estado === 'pendiente');
    if (!pendientes.length) {
      cerrarDirecto(n, root); return;
    }
    const m = GL.abrirModal({
      titulo: 'Cerrar jornada ' + n,
      ancho: 'ancho',
      cuerpo: '<p class="modal-texto">Elegí cómo resolver cada partido pendiente según el reglamento.</p>' +
        pendientes.map(p =>
          '<div class="campo-row" data-pend="' + p.id + '" style="align-items:end;border-bottom:1px solid var(--border);padding-bottom:10px">' +
            '<div style="font-family:Rajdhani;font-weight:600;font-size:15px;flex:1">' +
              esc(GL.nombreJugador(p.local_id)) + ' vs ' + esc(GL.nombreJugador(p.visitante_id)) + '</div>' +
            '<label class="campo" style="margin:0;min-width:190px"><span>Resolución</span><select class="input" data-res="' + p.id + '">' +
              '<option value="walkover_local">Gana local 3-0 (visita ausente)</option>' +
              '<option value="walkover_visitante">Gana visita 3-0 (local ausente)</option>' +
              '<option value="doble_ausencia" selected>Doble ausencia 0-0</option>' +
            '</select></label></div>').join(''),
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn" id="cj-ok">Cerrar jornada</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#cj-ok').addEventListener('click', async () => {
          const fallos = [];
          for (const p of pendientes) {
            const elegido = fondo.querySelector('[data-res="' + p.id + '"]').value;
            const estado = estadoCierre(p, elegido);
            const r = GL.resultado({ estado });
            const { error } = await sb.from('partidos').update({
              estado, goles_local: r.gf, goles_visitante: r.gc, updated_at: new Date().toISOString()
            }).eq('id', p.id).eq('estado', 'pendiente');
            if (error) fallos.push(error.message);
          }
          if (fallos.length) {
            GL.notificar('No se pudieron resolver todos los pendientes: ' + fallos[0], 'error'); return;
          }
          cerrar(); await cerrarDirecto(n, root);
        });
      }
    });
    iniciarIconos(); return m;
  }

  async function cerrarDirecto(n, root) {
    const { error } = await sb.from('jornadas').update({ estado: 'cerrada' })
      .eq('torneo_id', GL.torneo().id).eq('numero', n).eq('grupo_id', Mod.grupoJornadas);
    if (error) { GL.notificar(error.message, 'error'); return; }
    await recalcularTodosLosGrupos();
    GL.invalidar();
    GL.notificar('Jornada ' + n + ' cerrada. Tabla y estadísticas actualizadas.', 'exito');
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
    const si = await GL.confirmar('Se archivará "' + (GL.torneo().nombre || CONFIG.NOMBRE_LIGA) + '" y se creará "' + temporada + '". ¿Continuar?',
      'Nuevo torneo', 'Archivar y crear');
    if (!si) return;
    try {
      await sb.from('torneos').update({ estado: 'finalizado' }).eq('id', GL.torneo().id);
      const { data: torneo, error } = await sb.from('torneos').insert({
        nombre: CONFIG.NOMBRE_LIGA, temporada, estado: 'activo', total_jornadas: CONFIG.JORNADAS_FASE_REGULAR
      }).select().single();
      if (error) throw error;
      await sb.from('grupos').insert([
        { torneo_id: torneo.id, nombre: 'Grupo A' },
        { torneo_id: torneo.id, nombre: 'Grupo B' }
      ]);
      GL.invalidar(); await GL.cargarContexto(true);
      pintarTemporada(); GL.notificar('Nueva temporada creada.', 'exito');
      location.hash = 'administracion'; Mod.render(root);
    } catch (e) { GL.notificar(e.message, 'error'); }
  }

  Modulos.admin = Mod;
})();
