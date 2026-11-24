/* =====================================================================
   GOATS LEAGUE MANAGER — Pantalla de acceso / registro
   El alta pide el nombre con el que el jugador aparece en FC Mobile.
   El acceso admin valida la clave en una Edge Function (nunca en el JS).
   ===================================================================== */
const PantallaAuth = {
  modo: 'entrar',
  alEntrar: null,
  overlay: null,
  _timers: {},

  campoClave(id, etiqueta, auto) {
    return '<label>' + etiqueta + '<span class="auth-clave">' +
      '<input class="input" type="password" id="' + id + '" autocomplete="' + (auto || 'off') + '" required>' +
      '<button type="button" class="auth-ver" data-ver="' + id + '" aria-label="Mostrar contraseña">' +
      icono('eye', 17) + '</button></span></label>';
  },

  indicador(id) {
    return '<div class="campo-estado" id="' + id + '" aria-live="polite"></div>';
  },

  estado(el, texto, tono, ico) {
    if (!el) return;
    el.className = 'campo-estado ' + (tono || '');
    el.innerHTML = (ico ? icono(ico, 14) : '') + esc(texto);
    iniciarIconos();
  },

  async mostrar(alEntrar) {
    if (alEntrar) PantallaAuth.alEntrar = alEntrar;
    PantallaAuth.ocultar(false);
    try { await GL.cargarPaises(); } catch (e) { console.warn(e); }
    const o = document.createElement('div');
    o.className = 'auth'; o.id = 'auth';
    const esAdmin = PantallaAuth.modo === 'admin';
    const esEntrar = PantallaAuth.modo === 'entrar' || esAdmin;
    const cuerpo = esAdmin
      ? '<h2>Acceso de administrador</h2><p>Usá cualquier correo y la clave de administrador. El servidor valida el acceso.</p>' +
        '<form id="form-admin">' +
          '<label>Correo electrónico<input class="input" type="email" id="ad-correo" autocomplete="email" required></label>' +
          PantallaAuth.campoClave('ad-clave', 'Clave de administrador', 'current-password') +
          '<div class="auth-error" id="ad-error"></div>' +
          '<button class="btn auth-ancho" type="submit">Ingresar como administrador</button>' +
        '</form>' +
        '<p class="auth-cambiar"><button type="button" class="auth-enlace" data-modo="entrar">Ingreso de jugador</button> · ' +
          '<button type="button" class="auth-enlace" data-modo="registro">Registrate</button></p>'
      : esEntrar
        ? '<h2>Bienvenido de nuevo</h2><p>Ingresá para ver tu perfil y tus partidos.</p>' +
          '<form id="form-entrar">' +
            '<label>Correo electrónico<input class="input" type="email" id="en-correo" autocomplete="email" required></label>' +
            PantallaAuth.campoClave('en-clave', 'Contraseña', 'current-password') +
            '<div class="auth-error" id="en-error"></div>' +
            '<button class="btn auth-ancho" type="submit">Ingresar</button>' +
          '</form>' +
          '<p class="auth-cambiar">¿Todavía no tenés cuenta? <button type="button" class="auth-enlace" data-modo="registro">Registrate</button></p>' +
          '<p class="auth-cambiar" style="margin-top:4px"><button type="button" class="auth-enlace" data-modo="admin">Acceso de administrador</button></p>'
        : '<h2>Sumate a la liga</h2><p>Tu nombre en el juego es clave: el administrador lo usará para asignarte.</p>' +
          '<form id="form-registro">' +
            '<label>Nombre en FC Mobile<input class="input" type="text" id="rg-nombre" maxlength="24" placeholder="Ej. CR7_LATINO" required></label>' +
            PantallaAuth.indicador('rg-nombre-estado') +
            '<div class="campo-row">' +
              '<label>País<select class="input" id="rg-pais">' + GL.opcionesPais('', false) + '</select></label>' +
              '<label>Teléfono (opcional)<input class="input" type="tel" id="rg-tel" placeholder="9999-9999"></label>' +
            '</div>' +
            '<label>Correo electrónico<input class="input" type="email" id="rg-correo" autocomplete="email" placeholder="tu@gmail.com" required></label>' +
            PantallaAuth.indicador('rg-correo-estado') +
            PantallaAuth.campoClave('rg-clave', 'Contraseña (mínimo 8 caracteres)', 'new-password') +
            PantallaAuth.indicador('rg-clave-estado') +
            PantallaAuth.campoClave('rg-clave2', 'Confirmar contraseña', 'new-password') +
            '<div class="auth-error" id="rg-error"></div>' +
            '<button class="btn auth-ancho" type="submit">Crear cuenta</button>' +
          '</form>' +
          '<p class="auth-cambiar">¿Ya tenés cuenta? <button type="button" class="auth-enlace" data-modo="entrar">Ingresá acá</button></p>' +
          '<p class="auth-cambiar" style="margin-top:4px"><button type="button" class="auth-enlace" data-modo="admin">Acceso de administrador</button></p>';

    o.innerHTML =
      '<div class="auth-marco">' +
        '<div class="auth-logo"><strong><span class="oro">GOATS</span> LATINOS</strong>' +
        '<small>LEAGUE MANAGER</small></div>' +
        '<div class="auth-caja">' + cuerpo + '</div>' +
        '<p class="auth-pie">' + (esAdmin
          ? 'La clave de administrador se configura en el servidor. Nunca se guarda en el navegador.'
          : 'Al registrarte quedarás pendiente de aprobación hasta que el administrador te asigne a un grupo.') + '</p>' +
      '</div>';
    document.body.appendChild(o);
    PantallaAuth.overlay = o;
    iniciarIconos();

    o.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
      const campo = o.querySelector('#' + b.dataset.ver);
      campo.type = campo.type === 'password' ? 'text' : 'password';
      b.innerHTML = icono(campo.type === 'text' ? 'eye-off' : 'eye', 17);
      iniciarIconos();
    }));
    o.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
      PantallaAuth.modo = b.dataset.modo; PantallaAuth.mostrar(PantallaAuth.alEntrar);
    }));

    const ocupado = (form, si) => form.querySelectorAll('button,input,select').forEach(x => x.disabled = si);
    const exito = (mensaje, ico) => {
      PantallaAuth.ocultar();
      if (mensaje) GL.notificar(mensaje, 'exito', ico || 'check-circle-2');
      if (PantallaAuth.alEntrar) PantallaAuth.alEntrar();
    };

    if (esAdmin) {
      o.querySelector('#form-admin').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = o.querySelector('#ad-error'); err.textContent = '';
        const form = ev.target; ocupado(form, true);
        try {
          await Auth.entrarAdmin(o.querySelector('#ad-correo').value.trim(), o.querySelector('#ad-clave').value);
          exito();
        } catch (e) { err.textContent = e.message; ocupado(form, false); }
      });
    } else if (esEntrar) {
      o.querySelector('#form-entrar').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = o.querySelector('#en-error'); err.textContent = '';
        const form = ev.target; ocupado(form, true);
        try {
          await Auth.entrar(o.querySelector('#en-correo').value.trim(), o.querySelector('#en-clave').value);
          exito();
        } catch (e) { err.textContent = e.message; ocupado(form, false); }
      });
    } else {
      const nombre = o.querySelector('#rg-nombre');
      const correo = o.querySelector('#rg-correo');
      const clave = o.querySelector('#rg-clave');
      const clave2 = o.querySelector('#rg-clave2');
      const estadoNombre = o.querySelector('#rg-nombre-estado');
      const estadoCorreo = o.querySelector('#rg-correo-estado');
      const estadoClave = o.querySelector('#rg-clave-estado');
      let nombreOk = false;

      const verificarNombre = () => {
        clearTimeout(PantallaAuth._timers.nombre);
        const valor = nombre.value.trim();
        if (valor.length < 3) {
          nombreOk = false;
          PantallaAuth.estado(estadoNombre, valor ? 'Usá al menos 3 caracteres.' : '', valor ? 'mal' : '', 'info');
          return;
        }
        nombreOk = false;
        PantallaAuth.estado(estadoNombre, 'Verificando nombre...', 'neutral', 'loader-circle');
        PantallaAuth._timers.nombre = setTimeout(async () => {
          try {
            const r = await Auth.nombreDisponible(valor);
            if (nombre.value.trim() !== valor) return;
            nombreOk = r.ok;
            PantallaAuth.estado(estadoNombre, r.mensaje, r.ok ? 'bien' : 'mal', r.ok ? 'circle-check-big' : 'circle-x');
          } catch (e) {
            PantallaAuth.estado(estadoNombre, 'No se pudo verificar el nombre.', 'mal', 'circle-x');
          }
        }, 500);
      };

      const verificarCorreo = () => {
        clearTimeout(PantallaAuth._timers.correo);
        const valor = correo.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
          PantallaAuth.estado(estadoCorreo, valor ? 'Ingresá un correo válido.' : '', valor ? 'mal' : '', 'info');
          return;
        }
        PantallaAuth.estado(estadoCorreo, 'Verificando correo...', 'neutral', 'loader-circle');
        PantallaAuth._timers.correo = setTimeout(async () => {
          try {
            const existe = await Auth.correoExiste(valor);
            if (correo.value.trim() !== valor) return;
            PantallaAuth.estado(estadoCorreo,
              existe ? 'Este correo ya está registrado. Ingresá con él.' : 'Correo disponible',
              existe ? 'mal' : 'bien', existe ? 'circle-x' : 'circle-check-big');
          } catch (e) {
            PantallaAuth.estado(estadoCorreo, 'No se pudo verificar el correo.', 'neutral', 'info');
          }
        }, 500);
      };

      const verificarClave = () => {
        const v = clave.value;
        if (!v) { PantallaAuth.estado(estadoClave, '', '', ''); return; }
        const ok = v.length >= 8;
        const fuerte = ok && /[A-ZÁÉÍÓÚÑ]/.test(v) && /\d/.test(v);
        PantallaAuth.estado(estadoClave,
          !ok ? 'La contraseña debe tener al menos 8 caracteres.' :
            (fuerte ? 'Contraseña segura.' : 'Mínimo 8 caracteres. Sumá mayúsculas y números para mayor seguridad.'),
          !ok ? 'mal' : (fuerte ? 'bien' : 'neutral'), !ok ? 'circle-x' : 'circle-check-big');
      };

      nombre.addEventListener('input', verificarNombre);
      correo.addEventListener('input', verificarCorreo);
      clave.addEventListener('input', verificarClave);
      clave2.addEventListener('input', () => {
        if (!clave2.value) return;
        const ok = clave2.value === clave.value;
        PantallaAuth.estado(estadoClave,
          ok ? 'Las contraseñas coinciden.' : 'Las contraseñas no coinciden.',
          ok ? 'bien' : 'mal', ok ? 'circle-check-big' : 'circle-x');
      });

      o.querySelector('#form-registro').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = o.querySelector('#rg-error'); err.textContent = '';
        const form = ev.target;
        if (!nombreOk) { err.textContent = 'Esperá a que el nombre aparezca como disponible.'; return; }
        if (clave.value.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
        if (clave.value !== clave2.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
        ocupado(form, true);
        try {
          await Auth.registrar(nombre.value.trim(), correo.value.trim(), clave.value,
            o.querySelector('#rg-pais').value, o.querySelector('#rg-tel').value.trim());
          PantallaAuth.ocultar();
          GL.notificar('Cuenta creada. Revisá tu Gmail para confirmar el correo.', 'exito', 'mail');
          if (PantallaAuth.alEntrar) PantallaAuth.alEntrar();
        } catch (e) { err.textContent = e.message; ocupado(form, false); }
      });
    }
  },

  ocultar(resetModo) {
    if (PantallaAuth.overlay) { PantallaAuth.overlay.remove(); PantallaAuth.overlay = null; }
    if (resetModo !== false) PantallaAuth.modo = 'entrar';
  }
};

window.PantallaAuth = PantallaAuth;
