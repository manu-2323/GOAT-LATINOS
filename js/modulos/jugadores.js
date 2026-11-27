/* =====================================================================
   1.6 — REGISTRO DE JUGADORES (panel dedicado, sin depender de torneo)
   Catálogo global con tarjetas: nombre de juego, número y WhatsApp.
   El alta y la edición reutilizan los formularios validados de admin.js.
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Registro de jugadores',

    async render(el) {
      el.innerHTML = GL.skeleton(6);
      try {
        if (!(await GL.asegurarAdmin(el))) return;
        await GL.cargarContexto(true);
        const admin = await GL.modulo('admin');
        if (!admin || typeof admin.registrarJugador !== 'function')
          throw new Error('El formulario de registro no está disponible.');

        const todos = GL.jugadoresGlobales()
          .slice()
          .sort((a, b) => String(a.nombre_usuario || '').localeCompare(String(b.nombre_usuario || '')));
        const enTorneo = new Set(GL.participantesActivos().map(p => p.jugador_id));
        const activos = todos.filter(j => j.activo !== false && j.rol !== 'expulsado').length;
        const disponibles = GL.jugadoresDisponiblesParaReemplazo(null).length;
        const hayTorneo = !!GL.torneo();

        el.innerHTML =
          '<div class="reg-pantalla">' +
            '<header class="reg-hero">' +
              '<div class="reg-hero-copy">' +
                '<span class="reg-eyebrow">' + icono('contact-round', 14) + 'Liga · Catálogo global</span>' +
                '<h1 class="reg-titulo">Registro de jugadores</h1>' +
                '<p class="reg-bajada">Alta, contacto y estado de todos los jugadores registrados. ' +
                  'Este panel funciona con o sin torneo activo; la inscripción competitiva se decide al crear el torneo.</p>' +
              '</div>' +
              '<div class="reg-hero-actions">' +
                '<label class="reg-buscar"><input class="input" id="reg-buscar" type="search" ' +
                  'placeholder="Buscar jugador o número" aria-label="Buscar jugadores registrados"></label>' +
                '<button type="button" class="btn" id="reg-crear">' +
                  icono('user-plus', 16) + 'Registrar jugador</button>' +
              '</div>' +
            '</header>' +

            '<section class="reg-kpis" aria-label="Indicadores del registro">' +
              kpi(todos.length, 'Registrados', 'Cuentas en el catálogo') +
              kpi(activos, 'Activos', 'Disponibles para competir') +
              kpi(enTorneo.size, 'En el torneo', hayTorneo ? 'Participantes actuales' : 'Sin torneo activo') +
              kpi(disponibles, 'Disponibles', 'Sin participación actual') +
            '</section>' +

            '<section class="reg-grid" id="reg-grid" aria-label="Tarjetas de jugadores">' +
              (todos.length ? todos.map(j => tarjeta(j, enTorneo, hayTorneo)).join('') :
                '<div class="card">' + icono('users', 24) +
                  '<p class="reg-nota">Todavía no hay jugadores registrados. ' +
                  'Usá «Registrar jugador» para crear el primero.</p></div>') +
            '</section>' +
            '<p class="nota-pie" id="reg-contador" aria-live="polite">' +
              todos.length + (todos.length === 1 ? ' jugador registrado' : ' jugadores registrados') + '</p>' +
          '</div>';

        enlazar(el, admin);
      } catch (e) {
        console.error(e);
        el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'el registro de jugadores'), null,
          'el registro de jugadores');
      }
      iniciarIconos();
    }
  };

  function kpi(valor, etiqueta, nota) {
    return '<div class="reg-kpi"><strong>' + esc(valor) + '</strong>' +
      '<span>' + esc(etiqueta) + '</span>' +
      '<span style="text-transform:none;letter-spacing:normal">' + esc(nota) + '</span></div>';
  }

  function estadoGlobal(j) {
    if (j.activo === false || j.rol === 'expulsado') return GL.badge('Expulsado', 'red', 'user-x');
    if (j.suspendido) return GL.badge('Suspendido', 'orange', 'triangle-alert');
    return GL.badge('Activo', 'green', 'circle-check');
  }

  function tarjeta(j, enTorneo, hayTorneo) {
    const numero = j.numero == null ? '—' : j.numero;
    const competition = !hayTorneo
      ? GL.badge('Sin torneo', 'neutral', 'trophy')
      : enTorneo.has(j.id)
        ? GL.badge('En torneo', 'blue', 'trophy')
        : GL.badge('Disponible', 'neutral', 'user-round-plus');
    return '<article class="reg-card" data-reg-id="' + esc(j.id) + '" ' +
        'data-buscar="' + esc(String(j.nombre_usuario || '') + ' ' + numero).toLowerCase() + '">' +
      '<div class="reg-card-cab">' +
        GL.avatarHTML(j, 'avatar') +
        '<span class="reg-numero" title="Número del jugador">' + esc(numero) + '</span>' +
      '</div>' +
      '<div>' +
        '<h2 class="reg-card-nombre">' + esc(j.nombre_usuario || 'Jugador') + '</h2>' +
        '<p class="reg-card-meta">' + GL.banderaHTML(j.pais, 14) + ' ' + esc(j.pais || '—') +
          ' · ' + esc(j.zona_horaria || 'Sin zona') + '</p>' +
      '</div>' +
      '<div class="reg-card-meta">' + estadoGlobal(j) + competition + '</div>' +
      '<div class="reg-card-contacto">' +
        (GL.linkWhatsapp(j, j.nombre_usuario) || 'Sin teléfono registrado') +
      '</div>' +
      '<div class="reg-card-acciones">' +
        '<button type="button" class="btn sec sm" data-reg-editar="' + esc(j.id) + '">' +
          icono('pencil', 14) + 'Editar datos</button>' +
        '<button type="button" class="btn sec sm" data-ir-panel="administracion">' +
          icono('shield', 14) + 'Administración</button>' +
      '</div>' +
    '</article>';
  }

  function enlazar(el, admin) {
    el.querySelectorAll('[data-ir-panel]').forEach(b => b.addEventListener('click', () => {
      location.hash = b.dataset.irPanel;
    }));

    const crear = el.querySelector('#reg-crear');
    if (crear) crear.addEventListener('click', () => admin.registrarJugador(el, {
      soloGlobal: true,
      onCreado: () => Mod.render(el)
    }));

    el.querySelectorAll('[data-reg-editar]').forEach(b => b.addEventListener('click', () => {
      const j = GL.jugadoresGlobales().find(x => x.id === b.dataset.regEditar);
      if (j) admin.editarJugador(j, null, () => Mod.render(el));
    }));

    const buscar = el.querySelector('#reg-buscar');
    const contador = el.querySelector('#reg-contador');
    if (buscar) buscar.addEventListener('input', () => {
      const q = buscar.value.trim().toLowerCase();
      let visibles = 0;
      el.querySelectorAll('[data-buscar]').forEach(card => {
        const mostrar = !q || card.dataset.buscar.includes(q);
        card.classList.toggle('oculto', !mostrar);
        if (mostrar) visibles++;
      });
      if (contador) contador.textContent = visibles +
        (visibles === 1 ? ' jugador visible' : ' jugadores visibles');
    });
  }

  Modulos.jugadores = Mod;
})();
