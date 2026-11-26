/* =====================================================================
   ONBOARDING ADMIN — Recorrido guiado para administradores (1.2.0)
   Usa la misma interfaz del tour de jugadores, con pasos propios.
   Se muestra la primera vez que entra un admin y se puede repetir desde
   el Centro de control con el botón «Ver guía».
   ===================================================================== */
const OnboardingAdmin = (() => {
  const CLAVE_VISTO = 'gl_tour_admin_v1';

  /* El recorrido es por cuenta: un admin nuevo no debe heredarlo de otro
     usuario que haya usado el mismo navegador. */
  function claveVisto() {
    const id = (typeof Auth !== 'undefined' && Auth && Auth.jugador && Auth.jugador.id)
      ? Auth.jugador.id : (typeof Auth !== 'undefined' && Auth && Auth.usuario && Auth.usuario.id)
        ? Auth.usuario.id : 'anon';
    return CLAVE_VISTO + '::' + id;
  }

  const pasos = [
    {
      ico: 'layout-dashboard', titulo: 'Bienvenido al Centro de control',
      cuerpo: 'Aquí ves el estado del torneo en un solo lugar: grupos, jornadas y resultados pendientes. Empieza siempre por esta pantalla.',
      accion: null
    },
    {
      ico: 'trophy', titulo: '1 · Crea el torneo',
      cuerpo: 'En Administración → Configuración defines nombre, temporada y número de jornadas. Los equipos se generan con el torneo; después asigná los jugadores desde la pestaña Jugadores.',
      accion: { label: 'Abrir Administración', hash: 'administracion' }
    },
    {
      ico: 'users', titulo: '2 · Inscribe a los jugadores',
      cuerpo: 'En la pestaña Jugadores puedes crear cuentas, asignar grupos, cambiar el número y aplicar sanciones. El país define el formato del teléfono y los horarios.',
      accion: { label: 'Ir a Jugadores', hash: 'administracion' }
    },
    {
      ico: 'calendar-days', titulo: '3 · Programa y abre jornadas',
      cuerpo: 'En Jornadas fijas fecha, hora de apertura y de cierre. Abrir una jornada permite cargar resultados; cerrarla bloquea los cambios y publica el resumen.',
      accion: { label: 'Ir a Jornadas', hash: 'jornadas' }
    },
    {
      ico: 'clipboard-check', titulo: '4 · Carga resultados y usa la IA',
      cuerpo: 'En Resultados elige el partido, selecciona la captura y pulsa «Analizar captura con IA». Revisa los datos extraídos, corrígelos si hace falta y confirma. Sin captura el resultado no es válido.',
      accion: { label: 'Ir a Resultados', hash: 'resultados' }
    },
    {
      ico: 'bar-chart-2', titulo: '5 · Comprueba la tabla y las copas',
      cuerpo: 'La tabla se recalcula sola. Revisa clasificación, estadísticas y el bracket de eliminatorias. Si falta un partido extra, genéralo desde Eliminatorias.',
      accion: { label: 'Ver la tabla', hash: 'tabla' }
    },
    {
      ico: 'message-square', titulo: '6 · Envía los mensajes',
      cuerpo: 'Mensajes genera el texto de jornada con horarios por país y enlaces de WhatsApp. El enlace se crea con el número validado, pero no confirma que la cuenta exista: verifícalo con el jugador.',
      accion: { label: 'Ir a Mensajes', hash: 'mensajes' }
    },
    {
      ico: 'shield-check', titulo: '7 · Auditoría y exportaciones',
      cuerpo: 'Auditoría muestra los cambios registrados. Algunas acciones todavía no son trazables desde el cliente. Usa «Ver guía» en el Centro de control para repetir este recorrido.',
      accion: { label: 'Ir a Auditoría', hash: 'auditoria' }
    }
  ];

  let paso = 0;
  let overlay = null;
  let onKey = null;
  let focoTimer = null;

  function pct() { return Math.round(((paso + 1) / pasos.length) * 100); }

  function renderPaso() {
    const p = pasos[paso];
    overlay.querySelector('.ob-ico').innerHTML = icono(p.ico, 36);
    overlay.querySelector('.ob-titulo').textContent = p.titulo;
    overlay.querySelector('.ob-cuerpo').textContent = p.cuerpo;
    overlay.querySelector('.ob-barra-fill').style.width = pct() + '%';
    overlay.querySelector('.ob-cuenta').textContent = (paso + 1) + ' / ' + pasos.length;
    const atras = overlay.querySelector('.ob-atras');
    atras.style.visibility = paso > 0 ? 'visible' : 'hidden';
    const accion = overlay.querySelector('.ob-accion');
    if (p.accion) {
      accion.textContent = p.accion.label;
      accion.style.display = '';
    } else {
      accion.style.display = 'none';
    }
    overlay.querySelector('.ob-siguiente').textContent =
      paso === pasos.length - 1 ? 'Comenzar' : 'Siguiente';
    overlay.querySelectorAll('.ob-punto').forEach((d, i) => {
      d.className = 'ob-punto' + (i === paso ? ' activo' : (i < paso ? ' visto' : ''));
    });
    iniciarIconos();
  }

  function cerrar(irHash) {
    if (focoTimer) { clearTimeout(focoTimer); focoTimer = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    try { localStorage.setItem(claveVisto(), '1'); } catch (e) { /* modo privado */ }
    if (irHash) location.hash = irHash;
  }

  function iniciar(force) {
    if (!force) {
      try { if (localStorage.getItem(claveVisto())) return; } catch (e) { /* procede */ }
    }
    paso = 0;
    if (focoTimer) { clearTimeout(focoTimer); focoTimer = null; }
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.className = 'ob-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Guía para administradores');
    overlay.innerHTML =
      '<div class="ob-caja">' +
        '<div class="ob-cabeza">' +
          '<div class="ob-logo"><strong><span class="oro">GOATS</span> LATINOS · GUÍA ADMIN</strong></div>' +
          '<button type="button" class="ob-omitir" aria-label="Saltar la guía">Omitir ' + icono('x', 14) + '</button>' +
        '</div>' +
        '<div class="ob-barra"><div class="ob-barra-fill"></div></div>' +
        '<div class="ob-cuenta-wrap"><span class="ob-cuenta"></span></div>' +
        '<div class="ob-contenido">' +
          '<div class="ob-ico-wrap"><div class="ob-ico"></div></div>' +
          '<h2 class="ob-titulo"></h2><p class="ob-cuerpo"></p>' +
        '</div>' +
        '<div class="ob-puntos">' +
          pasos.map((_, i) => '<div class="ob-punto" data-i="' + i + '"></div>').join('') +
        '</div>' +
        '<div class="ob-pies">' +
          '<button type="button" class="btn-secundario ob-atras">' + icono('arrow-left', 16) + 'Anterior</button>' +
          '<button type="button" class="btn-secundario ob-accion" style="display:none"></button>' +
          '<button type="button" class="btn-primario ob-siguiente">Siguiente</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    renderPaso();

    overlay.querySelector('.ob-omitir').addEventListener('click', () => cerrar());
    overlay.querySelector('.ob-atras').addEventListener('click', () => {
      if (paso > 0) { paso--; renderPaso(); }
    });
    overlay.querySelector('.ob-siguiente').addEventListener('click', () => {
      if (paso < pasos.length - 1) { paso++; renderPaso(); }
      else cerrar(pasos[paso].accion ? pasos[paso].accion.hash : 'dashboard-admin');
    });
    overlay.querySelector('.ob-accion').addEventListener('click', () => {
      const p = pasos[paso];
      if (p.accion) { cerrar(p.accion.hash); }
    });
    overlay.querySelectorAll('.ob-punto').forEach(d => {
      d.addEventListener('click', () => {
        const i = Number(d.dataset.i);
        if (i >= 0 && i < pasos.length) { paso = i; renderPaso(); }
      });
    });
    onKey = e => {
      if (e.key === 'Escape') cerrar();
    };
    document.addEventListener('keydown', onKey);
    focoTimer = setTimeout(() => {
      focoTimer = null;
      if (!overlay) return;
      const b = overlay.querySelector('.ob-siguiente');
      if (b) b.focus();
    }, 50);
    iniciarIconos();
  }

  return { iniciar, pasos };
})();

window.OnboardingAdmin = OnboardingAdmin;
