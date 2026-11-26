/* =====================================================================
   ONBOARDING — Tour guiado para nuevos jugadores
   Se activa la primera vez que el jugador inicia sesión.
   Puede repetirse desde el perfil con GL.onboarding.iniciar(true).
   ===================================================================== */
const OnboardingTour = (() => {

  /* FASE 3.20 — la clave incluye la cuenta: antes un mismo navegador
     compartía el tour entre jugadores distintos. */
  const CLAVE_BASE = 'gl_tour_completo_v1';

  function claveVisto() {
    const id = (typeof Auth !== 'undefined' && Auth && Auth.jugador && Auth.jugador.id)
      ? Auth.jugador.id
      : ((typeof Auth !== 'undefined' && Auth && Auth.usuario && Auth.usuario.id)
        ? Auth.usuario.id : 'invitado');
    return CLAVE_BASE + ':' + id;
  }

  // ── Pasos del tour ────────────────────────────────────────────────
  const pasos = [
    {
      id: 'bienvenida',
      ico: 'trophy',
      titulo: '¡Bienvenido a GOATS LATINOS!',
      cuerpo: 'Sos parte de una de las ligas de FC Mobile más organizadas de Latinoamérica. ' +
              'Este sistema reemplaza el trabajo manual: aquí están las tablas, el cuadro de partidos, ' +
              'las estadísticas y los mensajes de WhatsApp. Todo en un lugar.',
      accion: null
    },
    {
      id: 'perfil',
      ico: 'user-circle',
      titulo: 'Completá tu perfil',
      cuerpo: 'Tu nombre de usuario, país y foto son lo que el resto de la liga ve de vos. ' +
              'Un perfil completo ayuda al administrador a identificarte y a generar los mensajes ' +
              'de jornada correctamente.',
      accion: { label: 'Ir a mi perfil', hash: 'perfil' }
    },
    {
      id: 'telefono',
      ico: 'smartphone',
      titulo: 'País, teléfono y WhatsApp',
      cuerpo: 'El sistema usa tu teléfono únicamente para generar el enlace de WhatsApp que el ' +
              'administrador incluye en los mensajes de jornada. Nadie más puede ver tu número. ' +
              'Elegí el país del teléfono y confirmá el formato: validarlo no confirma la titularidad.',
      accion: { label: 'Actualizar mi teléfono', hash: 'perfil' }
    },
    {
      id: 'foto',
      ico: 'camera',
      titulo: 'Foto de perfil',
      cuerpo: 'Podés subir una foto de perfil desde la sección de perfil. ' +
              'Se muestra en la tabla de posiciones y en las estadísticas. ' +
              'Usá JPG o PNG de hasta 2 MB.',
      accion: { label: 'Subir mi foto', hash: 'perfil' }
    },
    {
      id: 'tabla',
      ico: 'bar-chart-2',
      titulo: 'La tabla de posiciones',
      cuerpo: 'La pantalla principal muestra la tabla de tu grupo en tiempo real. ' +
              'Las posiciones 1–6 clasifican a eliminatorias (verde). ' +
              'Las posiciones 7–10 están en zona de alerta (naranja). ' +
              'Las posiciones 11–12 descienden al finalizar la temporada (rojo).',
      accion: { label: 'Ver la tabla', hash: 'tabla' }
    },
    {
      id: 'fixture',
      ico: 'calendar',
      titulo: 'Cómo consultar tus partidos',
      cuerpo: 'En Cuadro de partidos encontrás la organización completa de las 22 jornadas. ' +
              'Usá el filtro "Solo mis partidos" para ver únicamente los que te corresponden. ' +
              'El jugador de la izquierda siempre es quien crea la sala en FC Mobile.',
      accion: { label: 'Ver el cuadro', hash: 'fixture' }
    },
    {
      id: 'reglamento',
      ico: 'shield-check',
      titulo: 'Reglamento y sanciones',
      cuerpo: 'Cada jornada dura 4 horas del mismo día. Si acordaste una hora específica ' +
              'tenés ±20 minutos de margen. Si no aparecés: 3-0 para el que sí estuvo. ' +
              'Si ninguno apareció: 0-0. Las sanciones se aplican por puntos o por suspensión. ' +
              'Siempre debés subir la captura del resultado para que sea válido.',
      accion: null
    },
    {
      id: 'listo',
      ico: 'check-circle-2',
      titulo: '¡Todo listo!',
      cuerpo: 'Ya conocés lo esencial de GOATS LATINOS. ' +
              'Si querés repetir este recorrido en cualquier momento, ' +
              'encontrás el botón "Ver tour" en la sección de tu perfil. ' +
              '¡Que gane el mejor GOAT!',
      accion: { label: 'Ir a la tabla', hash: 'tabla' }
    }
  ];

  // ── Estado interno ────────────────────────────────────────────────
  let paso    = 0;
  let overlay = null;
  let forzado = false;

  // ── Helpers ───────────────────────────────────────────────────────
  function pct() { return Math.round(((paso + 1) / pasos.length) * 100); }

  function renderPaso() {
    const p     = pasos[paso];
    const total = pasos.length;
    const esUlt = paso === total - 1;

    overlay.querySelector('.ob-ico').innerHTML   = icono(p.ico, 36);
    overlay.querySelector('.ob-titulo').textContent  = p.titulo;
    overlay.querySelector('.ob-cuerpo').textContent  = p.cuerpo;
    overlay.querySelector('.ob-barra-fill').style.width = pct() + '%';
    overlay.querySelector('.ob-cuenta').textContent = (paso + 1) + ' / ' + total;

    // Botón anterior
    const btnAtras = overlay.querySelector('.ob-atras');
    btnAtras.style.visibility = paso > 0 ? 'visible' : 'hidden';

    // Botón de acción secundaria
    const btnAccion = overlay.querySelector('.ob-accion');
    if (p.accion) {
      btnAccion.textContent = p.accion.label;
      btnAccion.style.display = '';
    } else {
      btnAccion.style.display = 'none';
    }

    // Botón siguiente / finalizar
    const btnNext = overlay.querySelector('.ob-siguiente');
    btnNext.textContent = esUlt ? 'Comenzar' : 'Siguiente';

    // Puntos indicadores
    overlay.querySelectorAll('.ob-punto').forEach((d, i) => {
      d.className = 'ob-punto' + (i === paso ? ' activo' : (i < paso ? ' visto' : ''));
    });

    iniciarIconos();
  }

  function cerrar(irHash) {
    if (overlay) { overlay.remove(); overlay = null; }
    try { localStorage.setItem(claveVisto(), '1'); } catch (e) { /* privado */ }
    if (irHash) location.hash = irHash;
  }

  // ── API pública ───────────────────────────────────────────────────
  function iniciar(force) {
    // Si ya lo vio y no se fuerza, salir silenciosamente
    if (!force) {
      try { if (localStorage.getItem(claveVisto())) return; } catch (e) { /* privado, procede */ }
    }
    forzado = !!force;
    paso = 0;
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.className = 'ob-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Tour de bienvenida');

    overlay.innerHTML =
      '<div class="ob-caja">' +
        '<div class="ob-cabeza">' +
          '<div class="ob-logo"><strong><span class="oro">GOATS</span> LATINOS</strong></div>' +
          '<button type="button" class="ob-omitir" title="Saltar el tour">Omitir ' +
            icono('x', 14) + '</button>' +
        '</div>' +
        '<div class="ob-barra"><div class="ob-barra-fill"></div></div>' +
        '<div class="ob-cuenta-wrap"><span class="ob-cuenta"></span></div>' +
        '<div class="ob-contenido">' +
          '<div class="ob-ico-wrap"><div class="ob-ico"></div></div>' +
          '<h2 class="ob-titulo"></h2>' +
          '<p class="ob-cuerpo"></p>' +
        '</div>' +
        '<div class="ob-puntos">' +
          pasos.map((_, i) => '<div class="ob-punto" data-i="' + i + '"></div>').join('') +
        '</div>' +
        '<div class="ob-pies">' +
          '<button type="button" class="btn sec ob-atras">' + icono('arrow-left', 16) + 'Anterior</button>' +
          '<button type="button" class="btn sec ob-accion" style="display:none"></button>' +
          '<button type="button" class="btn ob-siguiente">Siguiente</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    renderPaso();

    // ── Eventos ───────────────────────────────────────────────────
    overlay.querySelector('.ob-omitir').addEventListener('click', () => cerrar());

    overlay.querySelector('.ob-atras').addEventListener('click', () => {
      if (paso > 0) { paso--; renderPaso(); }
    });

    overlay.querySelector('.ob-siguiente').addEventListener('click', () => {
      if (paso < pasos.length - 1) {
        paso++; renderPaso();
      } else {
        const hash = pasos[paso].accion ? pasos[paso].accion.hash : 'tabla';
        cerrar(hash);
      }
    });

    overlay.querySelector('.ob-accion').addEventListener('click', () => {
      const p = pasos[paso];
      if (p.accion) {
        paso = Math.min(paso + 1, pasos.length - 1);
        renderPaso();
        cerrar(p.accion.hash);
      }
    });

    // Click en puntos de navegación directa
    overlay.querySelectorAll('.ob-punto').forEach(d => {
      d.addEventListener('click', () => {
        const i = Number(d.dataset.i);
        if (!isNaN(i) && i >= 0 && i < pasos.length) { paso = i; renderPaso(); }
      });
    });

    // ESC cierra
    const onKey = e => { if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);

    iniciarIconos();
  }

  // ── Barra de progreso de perfil (% de completitud) ────────────────
  function progresoPerfil(j) {
    if (!j) return 0;
    const campos = [
      !!j.nombre_usuario,
      !!j.pais,
      !!GL.tel.e164Jugador(j),
      !!j.avatar_url
    ];
    return Math.round((campos.filter(Boolean).length / campos.length) * 100);
  }

  function htmlBarraPerfil(j) {
    const pct = progresoPerfil(j);
    const color = pct === 100 ? 'var(--accent-green)' : (pct >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)');
    const label = pct === 100 ? 'Perfil completo' : 'Perfil ' + pct + '% completado';
    return '<div class="perfil-progreso" title="' + esc(label) + '">' +
      '<div class="perfil-progreso-label">' + icono('user-check', 14) + esc(label) + '</div>' +
      '<div class="perfil-progreso-track">' +
        '<div class="perfil-progreso-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
      '</div>' +
    '</div>';
  }

  return { iniciar, progresoPerfil, htmlBarraPerfil };
})();

window.OnboardingTour = OnboardingTour;