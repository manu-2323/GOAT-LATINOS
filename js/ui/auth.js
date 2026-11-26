/* =====================================================================
   GOATS LEAGUE MANAGER — Pantalla de acceso / registro
   El alta pide el nombre con el que el jugador aparece en FC Mobile.
   El acceso admin valida correo y clave en Supabase (nunca en el JS).
   ===================================================================== */
const PantallaAuth = {
  modo: 'entrar',
  alEntrar: null,
  overlay: null,
  obligatorio: false,
  _timers: {},

  campoClave(id, etiqueta, auto) {
    return '<label>' + etiqueta + '<span class="auth-clave">' +
      '<input class="input" type="password" id="' + id + '" autocomplete="' + (auto || 'off') + '" required>' +
      '<button type="button" class="auth-ver" data-ver="' + id + '" aria-label="Mostrar contraseña">' +
      icono('eye', 18) + '</button></span></label>';
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
    /* FASE 3.13: arranque y `gl:auth` pueden invocar mostrar() a la vez.
       Sin esta barrera, dos esperas resueltas creaban dos overlays con el
       mismo id y formularios duplicados en el acceso. */
    document.querySelectorAll('#auth.auth').forEach(x => x.remove());
    const o = document.createElement('div');
    o.className = 'auth'; o.id = 'auth';
    const esAdmin = PantallaAuth.modo === 'admin';
    const esEntrar = PantallaAuth.modo === 'entrar' || esAdmin;
    const cuerpo = esAdmin
      ? '<h2>Acceso de administrador</h2><p>Ingresá el correo autorizado y la clave de administrador. El servidor valida ambos.</p>' +
        '<form id="form-admin">' +
          '<label>Correo electrónico<input class="input" type="email" id="ad-correo" autocomplete="email" required></label>' +
          PantallaAuth.campoClave('ad-clave', 'Clave de administrador', 'current-password') +
          '<div class="auth-error" id="ad-error"></div>' +
          '<button class="btn auth-ancho" type="submit">Ingresar como administrador</button>' +
        '</form>' +
        '<p class="auth-cambiar"><button type="button" class="auth-enlace" data-modo="entrar">Ingreso de jugador</button> · ' +
          '<button type="button" class="auth-enlace" data-modo="registro">Registrate</button></p>'
      : esEntrar
        ? '<h2>' + (PantallaAuth.obligatorio ? 'Acceso a la liga' : 'Bienvenido de nuevo') + '</h2><p>' +
          (PantallaAuth.obligatorio
            ? 'Ingresá con tu cuenta para continuar al sistema.'
            : 'Ingresá para ver tu perfil y tus partidos.') + '</p>' +
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
            '<label>Nombre en FC Mobile<input class="input" type="text" id="rg-nombre" maxlength="32" placeholder="Ej. CR7_LATINO" required></label>' +
            PantallaAuth.indicador('rg-nombre-estado') +
            '<div class="campo-row">' +
              '<label>País<select class="input" id="rg-pais">' + GL.opcionesPais('NI', false) + '</select></label>' +
                '<label>Teléfono / WhatsApp (obligatorio)' +
                '<div class="tel-wrap">' +
                  '<button type="button" class="tel-prefijo" id="rg-tel-prefijo" aria-label="Código de país">+505</button>' +
                  '<input class="input" type="tel" id="rg-tel" placeholder="8108-5555" inputmode="numeric" autocomplete="tel-national" required>' +
                '</div>' +
                '<div class="campo-estado" id="rg-tel-estado" aria-live="polite"></div>' +
              '</label>' +
            '</div>' +
            '<label>Ciudad o zona horaria<select class="input" id="rg-zona" required>' +
              GL.opcionesZonaHoraria('', '') +
            '</select></label>' +
            '<p class="nota-pie" id="rg-zona-nota"></p>' +
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
          ? 'Solo dos correos están autorizados. La clave se valida en el servidor y nunca se guarda en el navegador.'
          : 'Al registrarte quedarás pendiente de aprobación hasta que el administrador te asigne a un grupo.') + '</p>' +
      '</div>';
    document.body.appendChild(o);
    document.body.classList.add('auth-activa');
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
        // No consultamos si el correo existe: eso permitiría enumerar cuentas.
        PantallaAuth.estado(estadoCorreo, 'Lo verificaremos al crear la cuenta.', 'neutral', 'info');
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

      /* ---- Sistema de teléfono internacional (libphonenumber-js 1.13.17) ---- */
      const telInput      = o.querySelector('#rg-tel');
      const telPrefijo    = o.querySelector('#rg-tel-prefijo');
      const telEstado     = o.querySelector('#rg-tel-estado');
      const paisSelect    = o.querySelector('#rg-pais');
      const zonaSelect    = o.querySelector('#rg-zona');
      const zonaNota      = o.querySelector('#rg-zona-nota');
      let   _telefono      = null;   // { e164, nacional, pais, validoPlan }

      function paisTelefono() {
        return String(paisSelect.value || 'NI').toUpperCase();
      }

      function actualizarPrefijo() {
        const iso = paisTelefono();
        telPrefijo.textContent = GL.tel.prefijo(iso) ? '+' + GL.tel.prefijo(iso) : '+?';
        telPrefijo.dataset.iso = iso;
      }

      function validarTelefono() {
        _telefono = null;
        const valor = telInput.value.trim();
        const v = GL.tel.validar(valor, paisTelefono(), true);
        if (!v.ok) {
          if (!valor) PantallaAuth.estado(telEstado, 'El teléfono es obligatorio.', 'mal', 'circle-x');
          else PantallaAuth.estado(telEstado, v.mensaje, 'mal', 'circle-x');
          return;
        }
        _telefono = v;
        PantallaAuth.estado(telEstado,
          'Formato válido: ' + v.nacional + ' → ' + v.e164 + '. La titularidad se confirmará aparte.',
          'bien', 'circle-check-big');
      }

      telInput.addEventListener('input', validarTelefono);
      telInput.addEventListener('blur', () => {
        if (_telefono && _telefono.nacional) telInput.value = _telefono.nacional;
      });

      paisSelect.addEventListener('change', () => {
        // El número se revalida SIEMPRE contra el país recién elegido.
        actualizarPrefijo();
        GL.actualizarZona(zonaSelect, paisSelect.value, zonaNota);
        validarTelefono();
      });

      // El prefijo rota el país seleccionado para no separar prefijo de validación.
      telPrefijo.addEventListener('click', () => {
        const opciones = Array.from(paisSelect.options).map(x => x.value).filter(Boolean);
        const indice = opciones.indexOf(paisTelefono());
        paisSelect.value = opciones[(indice + 1 + opciones.length) % opciones.length] || opciones[0];
        paisSelect.dispatchEvent(new Event('change'));
      });

      zonaSelect.addEventListener('change', () =>
        GL.actualizarZona(zonaSelect, paisSelect.value, zonaNota, true));

      // Inicializar con Nicaragua (+505) y su zona horaria.
      GL.actualizarZona(zonaSelect, paisSelect.value, zonaNota);
      actualizarPrefijo();
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
        if (!zonaSelect.value) { err.textContent = 'Elegí tu ciudad o zona horaria para ver los horarios correctos.'; return; }
        if (clave.value.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
        if (clave.value !== clave2.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
        if (!_telefono) {
          validarTelefono();
          err.textContent = 'Corregí el teléfono antes de continuar.';
          return;
        }
        ocupado(form, true);
        try {
          const resultado = await Auth.registrar(
            nombre.value.trim(),
            correo.value.trim(),
            clave.value,
            paisSelect.value,
            {
              visual:  _telefono.nacional,
              e164:    _telefono.e164,
              paisTel: _telefono.pais,
              validoPlan: true
            },
            zonaSelect.value
          );
          if (resultado && resultado.requiereConfirmacion) {
            err.textContent = resultado.mensaje;
            ocupado(form, false);
            return;
          }
          exito('Cuenta creada. ¡Bienvenido a la liga!', 'check-circle-2');
        } catch (e) { err.textContent = e.message; ocupado(form, false); }
      });
    }
  },

  ocultar(resetModo) {
    if (PantallaAuth.overlay) { PantallaAuth.overlay.remove(); PantallaAuth.overlay = null; }
    document.body.classList.remove('auth-activa');
    if (resetModo !== false) PantallaAuth.modo = 'entrar';
  }
};

window.PantallaAuth = PantallaAuth;
