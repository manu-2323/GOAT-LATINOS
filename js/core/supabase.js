/* =====================================================================
   GOATS LEAGUE MANAGER — Cliente Supabase + autenticación y roles
   Solo credenciales públicas. La Service Role vive en Edge Functions.
   ===================================================================== */
const configurado = typeof supabase !== 'undefined' &&
  /^https:\/\//.test(CONFIG.SUPABASE_URL) && CONFIG.SUPABASE_KEY.indexOf('PEGA_AQUI') === -1;

const sb = configurado ? supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

async function mensajeFuncion(error) {
  try {
    const cuerpo = await error.context.json();
    return cuerpo.error || cuerpo.message || error.message;
  } catch (e) { return error.message; }
}

const Auth = {
  usuario: null,
  jugador: null,
  cargando: true,
  _verificando: {},

  async iniciar() {
    Auth.cargando = true;
    if (!sb) { Auth.cargando = false; return null; }
    try {
      const { data } = await sb.auth.getSession();
      Auth.usuario = data.session ? data.session.user : null;
      if (Auth.usuario) await Auth.cargarPerfil();
    } catch (e) {
      console.warn('Sesión:', e.message);
      Auth.usuario = null;
    }
    sb.auth.onAuthStateChange(async (evento, session) => {
      Auth.usuario = session ? session.user : null;
      Auth.jugador = null;
      if (Auth.usuario) {
        try { await Auth.cargarPerfil(); } catch (e) { console.warn(e); }
      }
      Auth.cargando = false;
      window.dispatchEvent(new CustomEvent('gl:auth', { detail: { evento } }));
    });
    Auth.cargando = false;
    return Auth.usuario;
  },

  /* Se ejecuta en CADA carga de módulo: el rol se valida contra la BD, no contra el login. */
  async cargarPerfil(force) {
    if (!sb || !Auth.usuario) { Auth.jugador = null; return null; }
    if (Auth.jugador && !force) return Auth.jugador;
    const { data, error } = await sb.from('jugadores')
      .select('*').eq('user_id', Auth.usuario.id).order('created_at', { ascending: false }).limit(1);
    if (error) console.warn('Perfil jugador:', error.message);
    Auth.jugador = (data && data[0]) || null;
    return Auth.jugador;
  },

  esAdmin() { return !!(Auth.jugador && Auth.jugador.rol === 'admin'); },

  /* La tabla jugadores es privada: anon no tiene SELECT. La disponibilidad
     se resuelve con una RPC SECURITY DEFINER que no devuelve filas. */
  nombreDisponible(nombre) {
    const n = GL.seguroTexto(nombre).slice(0, 24);
    if (n.length < 3) return Promise.resolve({ ok: false, mensaje: 'Usá al menos 3 caracteres.' });
    if (!sb) return Promise.resolve({ ok: false, mensaje: 'Supabase no está configurado.' });
    return sb.rpc('gl_nombre_disponible', { p_nombre: n })
      .then(({ data, error }) => {
        if (error) return { ok: false, mensaje: 'No se pudo verificar el nombre.' };
        return {
          ok: !!(data && data.ok),
          mensaje: (data && data.mensaje) || 'Nombre disponible'
        };
      })
      .catch(() => ({ ok: false, mensaje: 'No se pudo verificar el nombre.' }));
  },

  /* No enumeramos correos: auth.signUp() responde con mensaje genérico. */
  correoExiste() {
    return Promise.resolve(false);
  },

  /* Registro: el jugador escribe el nombre con el que aparece en FC Mobile. */
  async registrar(nombreJuego, correo, clave, pais, telefono, zonaHoraria) {
    if (!sb) throw new Error('Supabase no está configurado.');
    const nombre = GL.seguroTexto(nombreJuego).slice(0, 24);
    if (nombre.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || '').trim())) throw new Error('Ingresá un correo válido.');
    if (String(clave || '').length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    if (!pais) throw new Error('Seleccioná tu país.');
    const zona = GL._zonaResuelta(zonaHoraria) || GL.zonaPorPais(pais);

    const disponible = await Auth.nombreDisponible(nombre);
    if (!disponible.ok) throw new Error(disponible.mensaje);

    const { data, error } = await sb.auth.signUp({
      email: String(correo).trim().toLowerCase(), password: clave,
      options: { data: { nombre_usuario: nombre, nombre: nombre, zona_horaria: zona } }
    });
    if (error) throw new Error(Auth.traducir(error.message));
    // Si Supabase exige confirmación de correo, avisamos y no simulamos una sesión.
    if (!data.session || !data.user) {
      throw new Error('Cuenta creada. Revisá tu correo para confirmarla y después iniciá sesión.');
    }
    Auth.usuario = data.user;

    try {
      await GL.cargarContexto();
      const base = nombre.toUpperCase().replace(/\s+/g, '_');
      const candidatos = [base, base + '_' + Math.floor(1000 + Math.random() * 9000)];
      for (const nombre_usuario of candidatos) {
        const { error: errIns } = await sb.from('jugadores').insert({
          user_id: data.user.id,
          nombre_usuario,
          email: String(correo).trim().toLowerCase(),
          pais: String(pais).toUpperCase(),
          zona_horaria:   zona,
          telefono:       typeof telefono === 'object' ? (telefono.visual || '') : String(telefono || '').replace(/[^\d+\s\-]/g, '').slice(0, 25),
          telefono_e164:  typeof telefono === 'object' ? (telefono.e164   || '') : '',
          pais_telefono:  typeof telefono === 'object' ? (telefono.paisTel || pais).toUpperCase() : String(pais || '').toUpperCase(),
          // 1.2.0: formato nacional y verificación de formato (no de cuenta WhatsApp).
          telefono_nacional: typeof telefono === 'object'
            ? (GL.tel && GL.tel.nacional ? GL.tel.nacional(telefono.e164 || telefono.visual || '', telefono.paisTel || pais) : '')
            : '',
          telefono_verificado: typeof telefono === 'object'
            ? !!(telefono.e164 && GL.tel && GL.tel.esValido && GL.tel.esValido(telefono.e164, telefono.paisTel || pais))
            : false,
          rol: 'jugador',
          activo: true,
          suspendido: false,
          torneo_id: GL.torneo() ? GL.torneo().id : null
        });
        if (!errIns) break;
        if (!/duplicate|unique/i.test(errIns.message)) throw errIns;
      }
    } catch (e) {
      console.warn('No se pudo crear la fila de jugador (pendiente de aprobación):', e.message);
    }
    await Auth.cargarPerfil(true);
    return Auth.usuario;
  },

  async entrar(correo, clave) {
    if (!sb) throw new Error('Supabase no está configurado.');
    const { data, error } = await sb.auth.signInWithPassword({
      email: String(correo || '').trim().toLowerCase(), password: clave
    });
    if (error) throw new Error(Auth.traducir(error.message));
    Auth.usuario = data.user;
    await Auth.cargarPerfil(true);
    return Auth.usuario;
  },

  /* Acceso admin: la RPC valida correo autorizado + clave hash antes del login. */
  async entrarAdmin(correo, clave) {
    if (!sb) throw new Error('Supabase no está configurado.');
    const email = String(correo || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresá un correo electrónico válido.');
    if (!clave) throw new Error('Ingresá la clave de administrador.');

    const { data: validacion, error: errValidar } = await sb.rpc('gl_validar_acceso_admin', {
      p_email: email, p_clave: clave
    });
    if (errValidar) throw new Error(Auth.traducir(errValidar.message));
    if (!validacion || validacion.ok !== true) {
      throw new Error((validacion && validacion.mensaje) || 'Acceso de administrador no autorizado.');
    }

    const { data, error: errLogin } = await sb.auth.signInWithPassword({ email, password: clave });
    if (errLogin) throw new Error(Auth.traducir(errLogin.message));
    Auth.usuario = data.user;
    await Auth.cargarPerfil(true);
    if (!Auth.esAdmin()) {
      await sb.auth.signOut();
      Auth.usuario = null;
      Auth.jugador = null;
      throw new Error('Ese correo no está habilitado como administrador.');
    }
    return Auth.usuario;
  },

  async salir() {
    Auth.usuario = null; Auth.jugador = null;
    if (sb) await sb.auth.signOut();
  },

  async actualizarNombreJuego(nombre, zonaHoraria) {
    if (!sb || !Auth.usuario) throw new Error('Inicia sesión para continuar.');
    const n = GL.seguroTexto(nombre).slice(0, 24);
    if (n.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres.');
    if (Auth.jugador) {
      const { data, error } = await sb.from('jugadores')
        .update({ nombre_usuario: n.toUpperCase().replace(/\s+/g, '_') })
        .eq('id', Auth.jugador.id).select().single();
      if (error) throw new Error(Auth.traducir(error.message));
      Auth.jugador = data;
    }
    const zona = GL._zonaResuelta(zonaHoraria);
    await sb.auth.updateUser({ data: zona ? { nombre_usuario: n, zona_horaria: zona } : { nombre_usuario: n } });
    GL.invalidar();
    return Auth.jugador;
  },

  /* Actualiza nombre, país, teléfono y avatar del perfil. */
  async actualizarPerfil(cambios) {
    if (!sb || !Auth.usuario || !Auth.jugador) throw new Error('Inicia sesión para continuar.');
    const datos = {};
    if (Object.prototype.hasOwnProperty.call(cambios, 'nombre_usuario')) {
      const nombre = GL.seguroTexto(cambios.nombre_usuario).slice(0, 24);
      if (nombre.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres.');
      datos.nombre_usuario = nombre.toUpperCase().replace(/\s+/g, '_');
    }
    if (Object.prototype.hasOwnProperty.call(cambios, 'pais')) {
      if (!/^[A-Z]{2}$/.test(String(cambios.pais || '').toUpperCase())) throw new Error('Seleccioná un país válido.');
      datos.pais = String(cambios.pais).toUpperCase();
    }
    if (Object.prototype.hasOwnProperty.call(cambios, 'zona_horaria')) {
      const zona = GL._zonaResuelta(cambios.zona_horaria);
      if (!zona) throw new Error('Elegí una ciudad o zona horaria válida.');
      datos.zona_horaria = zona;
    }
    if (Object.prototype.hasOwnProperty.call(cambios, 'telefono')) {
      datos.telefono = String(cambios.telefono || '').replace(/[^\d+]/g, '').slice(0, 20);
    }
    if (Object.prototype.hasOwnProperty.call(cambios, 'avatar_url')) {
      datos.avatar_url = cambios.avatar_url ? String(cambios.avatar_url) : null;
    }
    if (!Object.keys(datos).length) throw new Error('No hay cambios para guardar.');
    const { data, error } = await sb.from('jugadores').update(datos)
      .eq('id', Auth.jugador.id).select().single();
    if (error) throw new Error(Auth.traducir(error.message));
    Auth.jugador = data;
    GL.invalidar();
    return data;
  },

  async subirAvatar(file) {
    if (!sb || !Auth.usuario) throw new Error('Inicia sesión para continuar.');
    if (!file) throw new Error('Seleccioná una imagen.');
    if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error('Usá una imagen JPG o PNG.');
    if (file.size > CONFIG.MAX_AVATAR_BYTES) throw new Error('La imagen no puede superar los 2 MB.');
    const ruta = Auth.usuario.id + '/avatar-' + Date.now() + (file.type === 'image/png' ? '.png' : '.jpg');
    const { error } = await sb.storage.from(CONFIG.BUCKET_AVATARES).upload(ruta, file, {
      cacheControl: '3600', upsert: true, contentType: file.type
    });
    if (error) throw new Error(Auth.traducir(error.message));
    const url = sb.storage.from(CONFIG.BUCKET_AVATARES).getPublicUrl(ruta).data.publicUrl;
    await Auth.actualizarPerfil({ avatar_url: url });
    return url;
  },

  async eliminarAvatar() {
    if (!sb || !Auth.jugador || !Auth.jugador.avatar_url) return;
    const url = String(Auth.jugador.avatar_url);
    const marca = '/' + CONFIG.BUCKET_AVATARES + '/';
    const idx = url.indexOf(marca);
    if (idx >= 0) {
      const ruta = decodeURIComponent(url.slice(idx + marca.length).split('?')[0]);
      await sb.storage.from(CONFIG.BUCKET_AVATARES).remove([ruta]);
    }
    await Auth.actualizarPerfil({ avatar_url: null });
  },

  /* Confirmación estricta: ELIMINAR. Borra cuenta, datos de liga y avatar. */
  async eliminarMiCuenta(confirma) {
    if (!sb || !Auth.usuario) throw new Error('Inicia sesión para continuar.');
    if (String(confirma || '').toUpperCase() !== 'ELIMINAR') throw new Error('Escribí ELIMINAR para confirmar.');
    const { data: sesion } = await sb.auth.getSession();
    const token = sesion && sesion.session && sesion.session.access_token;
    if (!token) throw new Error('Tu sesión venció. Iniciá sesión nuevamente.');
    const { error } = await sb.functions.invoke('eliminar-cuenta', {
      body: { confirmacion: 'ELIMINAR' }
    });
    if (error) throw new Error(Auth.traducir(await mensajeFuncion(error)));
    Auth.usuario = null; Auth.jugador = null;
    try { await sb.auth.signOut(); } catch (e) { console.warn(e); }
    return true;
  },

  /* Solo super_admin: la clave llega desde la Edge Function, nunca de un archivo. */
  async obtenerClaveAdmin() {
    if (!sb || !Auth.usuario) throw new Error('Inicia sesión para continuar.');
    const { data, error } = await sb.functions.invoke('admin-obtener-clave', { body: {} });
    if (error) throw new Error(Auth.traducir(await mensajeFuncion(error)));
    if (!data || !data.password) throw new Error('No se pudo obtener la clave de administrador.');
    return String(data.password);
  },

  traducir(msg) {
    const m = String(msg || '').toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Correo o contraseña incorrectos.';
    if (m.includes('already registered') || m.includes('ya está registrado')) return 'Ese correo ya está registrado. Inicia sesión.';
    if (m.includes('at least')) return 'La contraseña es demasiado corta.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Esperá un momento y volvé a probar.';
    if (m.includes('invalid format') || m.includes('valid email')) return 'El correo no es válido.';
    if (m.includes('email not confirmed')) return 'Confirmá tu correo electrónico antes de ingresar.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión con el servidor. Revisá tu internet.';
    if (m.includes('row-level security') || m.includes('permission denied')) return 'No tenés permisos para realizar esta acción.';
    return 'No se pudo completar la acción: ' + msg;
  }
};

window.Auth = Auth;
