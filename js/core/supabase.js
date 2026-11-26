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
  /* 2.2 — Una sola lectura/creación de perfil por usuario. Evita que iniciar()
     y onAuthStateChange() inserten dos filas con el mismo user_id. */
  _perfilEnCurso: null,
  /* Estado explícito para la UI cuando la cuenta Auth existe pero el perfil
     no pudo completarse (por ejemplo, teléfono en poder de otro jugador). */
  perfilPendienteTelefono: null,

  /* 1.2.1 — Un único cliente (inyectable en pruebas, nunca privilegiado).
     telefono_verificado`: eso solo lo confirma una persona, jamás isValid(). */
  _cliente() { return Auth._sb || sb; },

  /* 2.3 — Los metadatos los escribe el usuario. Solo se aceptan países del
     catálogo; el resto de campos sensibles siempre los fija PostgreSQL. */
  _paisSeguro(valor, respaldo) {
    const codigo = String(valor || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(codigo) && PAISES[codigo]) return codigo;
    const fallback = String(respaldo || '').toUpperCase();
    return /^[A-Z]{2}$/.test(fallback) && PAISES[fallback] ? fallback : 'NI';
  },

  _resultadoRegistro(data) {
    const creado = data || {};
    const usuarioSesion = creado.session ? (creado.user || null) : null;
    const meta = (creado.user && creado.user.user_metadata) || {};
    const requiereConfirmacion = !creado.session;
    return {
      ok: true,
      usuario: usuarioSesion,
      /* Valor literal para el caso sin sesión: la UI no debe inventar ingreso. */
      ...(requiereConfirmacion
        ? { requiereConfirmacion: true }
        : { requiereConfirmacion: false }),
      usuarioId: (creado.user && creado.user.id) || null,
      correoEnviado: requiereConfirmacion,
      mensaje: requiereConfirmacion
        ? 'Cuenta de autenticación creada. Revisá tu correo para confirmarla; el perfil de jugador se completará cuando inicies sesión.'
        : 'Cuenta creada. ¡Bienvenido a la liga!',
      metadata: {
        nombre_usuario: meta.nombre_usuario || meta.nombre || '',
        nombre: meta.nombre || meta.nombre_usuario || '',
        zona_horaria: meta.zona_horaria || '',
        ...(meta.telefono_e164 ? { telefono_e164: meta.telefono_e164 } : {})
      }
    };
  },

  _esConflictoTelefono(error) {
    if (!error) return false;
    const texto = [error.code, error.message, error.details, error.hint]
      .filter(Boolean).join(' ').toLowerCase();
    /* Un 23505 de user_id NO es un conflicto de teléfono: se resuelve por
       adopción del perfil existente, no como error de número duplicado. */
    if (texto.includes('jugadores_user_id_uniq')) return false;
    if (String(error.code || '').toLowerCase() !== '23505') return false;
    return texto.includes('jugadores_e164_canonicalizado_uniq') ||
      texto.includes('ya está registrado') ||
      texto.includes('ya esta registrado') ||
      (texto.includes('unique constraint') && texto.includes('telefono_e164'));
  },

  _detalleConflictoTelefono(error) {
    const texto = [error && error.message, error && error.details, error && error.hint]
      .filter(Boolean).join(' ').trim();
    if (/[áéíóúñ]/i.test(texto) || /ya (está|esta) registrado/i.test(texto)) return texto;
    return 'Ese teléfono ya está registrado en otro jugador. Iniciá sesión para recuperar tu perfil o hablá con administración.';
  },

  /* 2.2 — Un error 23505 sobre user_id significa que otra carga concurrente ya
     ganó la carrera. Nunca se inserta un segundo perfil. */
  _esConflictoUserId(error) {
    if (!error) return false;
    const texto = [error.code, error.message, error.details, error.hint]
      .filter(Boolean).join(' ').toLowerCase();
    if (texto.includes('jugadores_user_id_uniq')) return true;
    return String(error.code || '').toLowerCase() === '23505' &&
      texto.includes('user_id');
  },

  /* Un error de SELECT nunca se interpreta como «perfil inexistente». */
  _mensajeErrorPerfil(error) {
    const msg = String((error && error.message) || error || 'Error desconocido');
    const m = msg.toLowerCase();
    if (m.includes('row-level security') || m.includes('permission denied')) {
      return 'No se pudo consultar tu perfil: permisos insuficientes.';
    }
    if (m.includes('failed to fetch') || m.includes('network')) {
      return 'No se pudo consultar tu perfil: sin conexión con el servidor.';
    }
    return 'No se pudo consultar tu perfil: ' + msg;
  },

  _falloTelefonoDuplicado(error) {
    const fallo = new Error(Auth._detalleConflictoTelefono(error));
    fallo.esTelefonoDuplicado = true;
    fallo.code = 'TELEFONO_DUPLICADO';
    return fallo;
  },

  /* 2.3 — Un fallo de red/permisos no es un «perfil pendiente de aprobación». */
  _marcarErrorPerfil(error) {
    console.warn(error);
    if (!Auth.perfilPendienteTelefono) {
      Auth.perfilPendienteTelefono = {
        motivo: 'error_carga_perfil',
        detalle: (error && error.message) || String(error)
      };
    }
  },

  async _leerPerfilPorUserId(userId) {
    if (!Auth._cliente() || !userId) return null;
    const { data, error } = await Auth._cliente().from('jugadores')
      .select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(Auth._mensajeErrorPerfil(error));
    return (data && data[0]) || null;
  },

  /* telefono_verificado ignorado deliberadamente: se reconstruye el perfil
     pendiente sin cambiar la titularidad confirmada por una persona. */
  async _crearPerfilDesdeMetadata(user) {
    if (!Auth._cliente() || !user) return null;
    const meta = user.user_metadata || {};
    const e164 = String(meta.telefono_e164 || '').trim();
    if (!e164) {
      Auth.perfilPendienteTelefono = { motivo: 'sin_telefono_en_metadata' };
      return null;
    }
    const pais = Auth._paisSeguro(meta.pais_telefono || meta.pais, 'NI');
    const campos = GL.tel.campos(e164, pais);
    if (!campos.telefono_e164) {
      Auth.perfilPendienteTelefono = { motivo: 'telefono_invalido_en_metadata' };
      return null;
    }
    const nombre = GL.seguroTexto(meta.nombre_usuario || meta.nombre || user.email || 'Jugador')
      .toUpperCase().replace(/\s+/g, '_').slice(0, 32) || 'JUGADOR';
    const zona = GL._zonaResuelta(meta.zona_horaria) || GL.zonaPorPais(pais);
    /* 2.3 — rol, flags, torneo y número NO se envían: los fija el trigger
       gl_proteger_insercion_jugador() usando auth.uid() y el torneo activo. */
    const { data, error } = await Auth._cliente().from('jugadores').insert({
      user_id: user.id,
      nombre_usuario: nombre,
      email: String(user.email || '').toLowerCase(),
      pais,
      zona_horaria: zona,
      ...campos
    }).select('*').single();
    if (error) {
      if (Auth._esConflictoUserId(error)) {
        /* Perdimos una carrera: otro flujo ya creó el perfil. Se adopta esa fila
           en vez de insertar una segunda. */
        const existente = await Auth._leerPerfilPorUserId(user.id);
        if (existente) {
          Auth.perfilPendienteTelefono = null;
          Auth.jugador = existente;
          return existente;
        }
        throw new Error('El perfil ya existe pero no se pudo leer. Volvé a iniciar sesión.');
      }
      if (Auth._esConflictoTelefono(error)) {
        const fallo = Auth._falloTelefonoDuplicado(error);
        fallo.cuentaCreadaSinPerfil = true;
        fallo.usuarioId = user.id;
        Auth.perfilPendienteTelefono = {
          motivo: 'telefono_duplicado', detalle: fallo.message
        };
        throw fallo;
      }
      throw error;
    }
    Auth.perfilPendienteTelefono = null;
    Auth.jugador = data || null;
    return Auth.jugador;
  },

  /* 2.2 — Recuperación de una cuenta Auth sin perfil. Nunca crea otra cuenta,
     nunca borra usuarios y nunca sobrescribe el perfil de otro jugador: solo
     actualiza el metadata propio y reintenta la creación una vez. */
  async recuperarPerfilConTelefono(valor, codigoPais) {
    if (!Auth._cliente() || !Auth.usuario) {
      throw new Error('Iniciá sesión para recuperar tu perfil.');
    }
    const meta = Auth.usuario.user_metadata || {};
    const pais = Auth._paisSeguro(codigoPais || meta.pais_telefono || meta.pais, 'NI');
    const estado = GL.tel.validar(valor, pais, true);
    if (!estado.ok) throw new Error(estado.mensaje || 'Ingresá un teléfono válido.');
    /* 2.3 — Solo datos personales. Nunca se copian claves privilegiadas que
       el propio usuario podría haber puesto en user_metadata. */
    const datos = {
      nombre_usuario: GL.seguroTexto(
        meta.nombre_usuario || meta.nombre || Auth.usuario.email || 'JUGADOR'
      ).toUpperCase().replace(/\s+/g, '_').slice(0, 32) || 'JUGADOR',
      nombre: meta.nombre || meta.nombre_usuario || '',
      pais,
      zona_horaria: GL._zonaResuelta(meta.zona_horaria) || GL.zonaPorPais(pais),
      ...GL.tel.campos(estado.e164, estado.pais || pais)
    };
    try {
      const { error } = await Auth._cliente().auth.updateUser({ data: datos });
      if (error) throw new Error(Auth.traducir(error.message));
      Auth.usuario = { ...Auth.usuario, user_metadata: datos };
      Auth.jugador = null;
      const perfil = await Auth.cargarPerfil(true);
      /* El estado pendiente se limpia SOLO después de tener un perfil real. */
      Auth.perfilPendienteTelefono = null;
      return perfil;
    } catch (e) {
      /* Un conflicto de teléfono ya dejó un estado específico y veraz. */
      if (e && e.esTelefonoDuplicado) throw e;
      Auth.perfilPendienteTelefono = {
        motivo: 'fallo_recuperacion',
        detalle: (e && e.message) || String(e)
      };
      throw e;
    }
  },

  async iniciar() {
    Auth.cargando = true;
    if (!Auth._cliente()) { Auth.cargando = false; return null; }
    let sesion;
    try {
      sesion = await Auth._cliente().auth.getSession();
    } catch (e) {
      console.warn('Sesión:', e.message);
      Auth.usuario = null;
      Auth.jugador = null;
      Auth.cargando = false;
      return null;
    }
    Auth.usuario = sesion && sesion.data && sesion.data.session
      ? sesion.data.session.user : null;
    if (Auth.usuario) {
      try { await Auth.cargarPerfil(); }
      catch (e) {
        /* No se cierra la sesión: la cuenta Auth existe y la UI debe poder
           ofrecer recuperación del perfil. El error real se conserva para no
           mostrar un falso «pendiente de aprobación». */
        if (!(e && e.esTelefonoDuplicado)) Auth._marcarErrorPerfil(e);
      }
    }
    Auth._cliente().auth.onAuthStateChange(async (evento, session) => {
      Auth.usuario = session ? session.user : null;
      Auth.jugador = null;
      if (!Auth.usuario) Auth.perfilPendienteTelefono = null;
      if (Auth.usuario) {
        try { await Auth.cargarPerfil(true); }
        catch (e) {
          /* La cuenta Auth existe: no se cierra sesión ni se borra nada. La UI
             puede ofrecer recuperación desde perfilPendienteTelefono. */
          if (!(e && e.esTelefonoDuplicado)) Auth._marcarErrorPerfil(e);
        }
      }
      Auth.cargando = false;
      window.dispatchEvent(new CustomEvent('gl:auth', { detail: { evento } }));
    });
    Auth.cargando = false;
    return Auth.usuario;
  },

  /* Se ejecuta en CADA carga de módulo: el rol se valida contra la BD, no contra el login.
     Si el registro quedó pendiente de correo, el perfil se reconstruye desde
     user_metadata sin crear otra cuenta de autenticación. */
  async cargarPerfil(force) {
    if (!Auth._cliente() || !Auth.usuario) { Auth.jugador = null; return null; }
    if (Auth.jugador && !force) return Auth.jugador;
    const userId = Auth.usuario.id;
    /* 2.2 — single-flight: iniciar() y onAuthStateChange() comparten la misma
       promesa. Ninguna de las dos inserta un segundo perfil. */
    if (Auth._perfilEnCurso && Auth._perfilEnCurso.userId === userId) {
      return Auth._perfilEnCurso.promise;
    }
    const promesa = Auth._cargarPerfilUnico(userId)
      .then(perfil => {
        if (Auth.usuario && Auth.usuario.id === userId) Auth.jugador = perfil;
        return perfil;
      })
      .finally(() => {
        if (Auth._perfilEnCurso && Auth._perfilEnCurso.userId === userId) {
          Auth._perfilEnCurso = null;
        }
      });
    Auth._perfilEnCurso = { userId, promise: promesa };
    return promesa;
  },

  async _cargarPerfilUnico(userId) {
    const { data, error } = await Auth._cliente().from('jugadores')
      .select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(1);
    /* 2.2 — «no existe» solo se afirma si la consulta terminó sin error. */
    if (error) throw new Error(Auth._mensajeErrorPerfil(error));
    const existente = (data && data[0]) || null;
    if (existente) {
      Auth.perfilPendienteTelefono = null;
      return existente;
    }
    return await Auth._crearPerfilDesdeMetadata(Auth.usuario);
  },

  esAdmin() { return !!(Auth.jugador && Auth.jugador.rol === 'admin'); },

  /* La tabla jugadores es privada: anon no tiene SELECT. La disponibilidad
     se resuelve con una RPC SECURITY DEFINER que no devuelve filas. */
  nombreDisponible(nombre) {
    const n = GL.seguroTexto(nombre).slice(0, 24);
    if (n.length < 3) return Promise.resolve({ ok: false, mensaje: 'Usá al menos 3 caracteres.' });
    if (!Auth._cliente()) return Promise.resolve({ ok: false, mensaje: 'Supabase no está configurado.' });
    return Auth._cliente().rpc('gl_nombre_disponible', { p_nombre: n })
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

  /* Registro: la cuenta de autenticación y el perfil se crean por pasos.
     Un teléfono duplicado nunca se disfraza de éxito ni borra usuarios de Auth. */
  async registrar(nombreJuego, correo, clave, pais, telefono, zonaHoraria) {
    if (!Auth._cliente()) throw new Error('Supabase no está configurado.');
    const nombre = GL.seguroTexto(nombreJuego).slice(0, 24);
    if (nombre.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres.');
    const email = String(correo || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresá un correo válido.');
    if (String(clave || '').length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    if (!pais) throw new Error('Seleccioná tu país.');
    const paisSeguro = Auth._paisSeguro(pais, 'NI');
    const zona = GL._zonaResuelta(zonaHoraria) || GL.zonaPorPais(paisSeguro);

    const paisTel = Auth._paisSeguro(
      (telefono && typeof telefono === 'object' && (telefono.paisTel || telefono.pais)) || paisSeguro,
      paisSeguro
    );
    const escrito = telefono && typeof telefono === 'object'
      ? (telefono.numero !== undefined ? telefono.numero : telefono.e164)
      : telefono;
    const estado = GL.tel.validar(escrito, paisTel, true);
    if (!estado.ok) throw new Error(estado.mensaje || 'El teléfono es obligatorio y debe ser válido.');
    const campos = GL.tel.campos(estado.e164, estado.pais || paisTel);
    if (!campos.telefono_e164) throw new Error('El teléfono es obligatorio y debe ser válido.');

    const disponible = await Auth.nombreDisponible(nombre);
    if (!disponible.ok) throw new Error(disponible.mensaje);

    const metadata = {
      nombre_usuario: nombre.toUpperCase().replace(/\s+/g, '_'),
      nombre,
      pais: paisSeguro,
      zona_horaria: zona,
      ...campos
    };
    const { data, error } = await Auth._cliente().auth.signUp({
      email, password: clave,
      options: { data: metadata }
    });
    if (error) throw new Error(Auth.traducir(error.message));
    if (!data || !data.user) throw new Error('No se pudo crear la cuenta de autenticación. Revisá los datos e intentá de nuevo.');

    /* Confirmación de correo: no hay sesión y NO se crea el perfil todavía.
       Queda en user_metadata para reconstruirlo al volver a iniciar sesión. */
    if (!data.session) return Auth._resultadoRegistro({ user: data.user, session: null });

    Auth.usuario = data.user;
    Auth.jugador = null;
    try {
      /* 2.3 — No se espera GL.cargarContexto(): el trigger SQL asigna el
         torneo activo y los flags desde el servidor. */
      const base = metadata.nombre_usuario;
      const candidatos = [base, base + '_' + Math.floor(1000 + Math.random() * 9000)];
      let insertado = null;
      for (const nombre_usuario of candidatos) {
        /* 2.3 — rol, activo, suspendido, torneo_id y número NO se envían.
           El trigger gl_proteger_insercion_jugador() los fija en servidor. */
        const { data: fila, error: errIns } = await Auth._cliente().from('jugadores').insert({
          user_id: data.user.id,
          nombre_usuario,
          email,
          pais: metadata.pais,
          zona_horaria: zona,
          ...campos
        }).select('*').single();
        if (errIns) {
          if (Auth._esConflictoUserId(errIns)) {
            /* Otra pestaña/sesión ganó la carrera: adoptar ese perfil, nunca
               insertar un duplicado ni crear otra cuenta. */
            const existente = await Auth._leerPerfilPorUserId(data.user.id);
            if (!existente) {
              throw new Error('El perfil ya existe pero no se pudo leer. Volvé a iniciar sesión.');
            }
            insertado = existente;
            break;
          }
          if (Auth._esConflictoTelefono(errIns)) {
            const fallo = Auth._falloTelefonoDuplicado(errIns);
            fallo.cuentaCreadaSinPerfil = true;
            fallo.usuarioId = data.user.id;
            Auth.perfilPendienteTelefono = {
              motivo: 'telefono_duplicado', detalle: fallo.message
            };
            throw fallo;
          }
          if (!/duplicate|unique/i.test(String((errIns && errIns.message) || ''))) throw errIns;
          continue;
        }
        insertado = fila;
        break;
      }
      if (!insertado) throw new Error('No se pudo crear el perfil del jugador.');
      Auth.jugador = insertado;
      Auth.perfilPendienteTelefono = null;
    } catch (e) {
      Auth.jugador = null;
      const fallo = e instanceof Error ? e : new Error(String(e));
      if (!fallo.cuentaCreadaSinPerfil) {
        fallo.cuentaCreadaSinPerfil = true;
        fallo.usuarioId = data.user.id;
      }
      throw fallo;
    }
    return Auth._resultadoRegistro(data);
  },

  async entrar(correo, clave) {
    if (!Auth._cliente()) throw new Error('Supabase no está configurado.');
    const { data, error } = await Auth._cliente().auth.signInWithPassword({
      email: String(correo || '').trim().toLowerCase(), password: clave
    });
    if (error) throw new Error(Auth.traducir(error.message));
    Auth.usuario = data.user;
    try {
      await Auth.cargarPerfil(true);
    } catch (e) {
      if (e && e.esTelefonoDuplicado) {
        throw new Error('Tu cuenta existe, pero el teléfono guardado ya pertenece a otro jugador. No se creó otra cuenta; hablá con administración para regularizar el perfil.');
      }
      throw new Error(Auth.traducir((e && e.message) || 'No se pudo cargar el perfil.'));
    }
    return Auth.usuario;
  },

  /* Acceso admin: la RPC valida correo autorizado + clave hash antes del login. */
  async entrarAdmin(correo, clave) {
    if (!Auth._cliente()) throw new Error('Supabase no está configurado.');
    const email = String(correo || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresá un correo electrónico válido.');
    if (!clave) throw new Error('Ingresá la clave de administrador.');

    const { data: validacion, error: errValidar } = await Auth._cliente().rpc('gl_validar_acceso_admin', {
      p_email: email, p_clave: clave
    });
    if (errValidar) throw new Error(Auth.traducir(errValidar.message));
    if (!validacion || validacion.ok !== true) {
      throw new Error((validacion && validacion.mensaje) || 'Acceso de administrador no autorizado.');
    }

    const { data, error: errLogin } = await Auth._cliente().auth.signInWithPassword({ email, password: clave });
    if (errLogin) throw new Error(Auth.traducir(errLogin.message));
    Auth.usuario = data.user;
    await Auth.cargarPerfil(true);
    if (!Auth.esAdmin()) {
      await Auth._cliente().auth.signOut();
      Auth.usuario = null;
      Auth.jugador = null;
      throw new Error('Ese correo no está habilitado como administrador.');
    }
    return Auth.usuario;
  },

  async salir() {
    Auth.usuario = null;
    Auth.jugador = null;
    Auth._perfilEnCurso = null;
    Auth.perfilPendienteTelefono = null;
    if (Auth._cliente()) await Auth._cliente().auth.signOut();
  },

  async actualizarNombreJuego(nombre, zonaHoraria) {
    if (!Auth._cliente() || !Auth.usuario) throw new Error('Inicia sesión para continuar.');
    const n = GL.seguroTexto(nombre).slice(0, 24);
    if (n.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres.');
    if (Auth.jugador) {
      const { data, error } = await Auth._cliente().from('jugadores')
        .update({ nombre_usuario: n.toUpperCase().replace(/\s+/g, '_') })
        .eq('id', Auth.jugador.id).select().single();
      if (error) throw new Error(Auth.traducir(error.message));
      Auth.jugador = data;
    }
    const zona = GL._zonaResuelta(zonaHoraria);
    await Auth._cliente().auth.updateUser({ data: zona ? { nombre_usuario: n, zona_horaria: zona } : { nombre_usuario: n } });
    GL.invalidar();
    return Auth.jugador;
  },

  /* Actualiza nombre, país, teléfono y avatar del perfil. El perfil pendiente
     se recupera antes de guardar; no se crea una segunda cuenta de Auth. */
  async actualizarPerfil(cambios) {
    if (!Auth._cliente() || !Auth.usuario) throw new Error('Iniciá sesión para continuar.');
    if (!Auth.jugador) await Auth.cargarPerfil(true);
    if (!Auth.jugador) throw new Error('Tu perfil todavía no está listo. Volvé a iniciar sesión para recuperarlo.');
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
    /* Los campos telefónicos llegan de GL.tel.cambiosSiNuevos(). Nunca se
       acepta telefono_verificado desde el formulario. */
    ['telefono', 'telefono_e164', 'telefono_nacional', 'pais_telefono', 'telefono_valido_plan']
      .forEach(campo => {
        if (Object.prototype.hasOwnProperty.call(cambios, campo)) datos[campo] = cambios[campo];
      });
    if (Object.prototype.hasOwnProperty.call(cambios, 'avatar_url')) {
      datos.avatar_url = cambios.avatar_url ? String(cambios.avatar_url) : null;
    }
    if (!Object.keys(datos).length) throw new Error('No hay cambios para guardar.');
    const { data, error } = await Auth._cliente().from('jugadores').update(datos)
      .eq('id', Auth.jugador.id).select().single();
    if (error) {
      if (Auth._esConflictoTelefono(error)) {
        throw new Error('Ese teléfono ya está registrado en otro jugador. Elegí otro número o hablá con administración.');
      }
      throw new Error(Auth.traducir(error.message));
    }
    Auth.jugador = data;
    GL.invalidar();
    return data;
  },

  async subirAvatar(file) {
    if (!Auth._cliente() || !Auth.usuario) throw new Error('Inicia sesión para continuar.');
    if (!file) throw new Error('Seleccioná una imagen.');
    if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error('Usá una imagen JPG o PNG.');
    if (file.size > CONFIG.MAX_AVATAR_BYTES) throw new Error('La imagen no puede superar los 2 MB.');
    const ruta = Auth.usuario.id + '/avatar-' + Date.now() + (file.type === 'image/png' ? '.png' : '.jpg');
    const { error } = await Auth._cliente().storage.from(CONFIG.BUCKET_AVATARES).upload(ruta, file, {
      cacheControl: '3600', upsert: true, contentType: file.type
    });
    if (error) throw new Error(Auth.traducir(error.message));
    const url = Auth._cliente().storage.from(CONFIG.BUCKET_AVATARES).getPublicUrl(ruta).data.publicUrl;
    await Auth.actualizarPerfil({ avatar_url: url });
    return url;
  },

  async eliminarAvatar() {
    if (!Auth._cliente() || !Auth.jugador || !Auth.jugador.avatar_url) return;
    const url = String(Auth.jugador.avatar_url);
    const marca = '/' + CONFIG.BUCKET_AVATARES + '/';
    const idx = url.indexOf(marca);
    if (idx >= 0) {
      const ruta = decodeURIComponent(url.slice(idx + marca.length).split('?')[0]);
      await Auth._cliente().storage.from(CONFIG.BUCKET_AVATARES).remove([ruta]);
    }
    await Auth.actualizarPerfil({ avatar_url: null });
  },

  /* Confirmación estricta: ELIMINAR. Borra cuenta, datos de liga y avatar. */
  async eliminarMiCuenta(confirma) {
    if (!Auth._cliente() || !Auth.usuario) throw new Error('Inicia sesión para continuar.');
    if (String(confirma || '').toUpperCase() !== 'ELIMINAR') throw new Error('Escribí ELIMINAR para confirmar.');
    const { data: sesion } = await Auth._cliente().auth.getSession();
    const token = sesion && sesion.session && sesion.session.access_token;
    if (!token) throw new Error('Tu sesión venció. Iniciá sesión nuevamente.');
    const { error } = await Auth._cliente().functions.invoke('eliminar-cuenta', {
      body: { confirmacion: 'ELIMINAR' }
    });
    if (error) throw new Error(Auth.traducir(await mensajeFuncion(error)));
    Auth.usuario = null; Auth.jugador = null;
    try { await Auth._cliente().auth.signOut(); } catch (e) { console.warn(e); }
    return true;
  },

  /* Firma exacta de la migración 1.2.1:
     public.gl_confirmar_e164(uuid, text, text, boolean default false, text default null)
     Devuelve jsonb. La titularidad solo se marca cuando el admin lo pide. */
  _mensajeRpcTelefono(error) {
    const msg = String((error && error.message) || error || 'No se pudo completar la confirmación.');
    const m = msg.toLowerCase();
    if (m.includes('no autorizado') || m.includes('sesión no autenticada') ||
        m.includes('permission denied') || m.includes('row-level security')) {
      return 'No tenés autorización para confirmar teléfonos. Ingresá con una cuenta de administrador.';
    }
    if (m.includes('ya existe en otro jugador') || m.includes('jugadores_e164_canonicalizado_uniq') ||
        m.includes('duplicate key') || m.includes('unique constraint')) {
      return 'Ese teléfono ya está registrado en otro jugador. No se modificó ningún perfil.';
    }
    if (m.includes('motivo es obligatorio')) return 'Escribí el motivo de la confirmación.';
    if (m.includes('e.164')) return msg;
    if (/tel[eé]fono/i.test(msg)) return msg;
    return Auth.traducir(msg);
  },

  async confirmarE164({ jugadorId, e164, motivo, confirmarTitularidad, evidencia }) {
    if (!Auth._cliente()) throw new Error('Supabase no está configurado.');
    const numero = String(e164 || '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(numero)) {
      throw new Error('El teléfono debe estar en formato E.164 canónico (con +).');
    }
    if (!motivo || !String(motivo).trim()) throw new Error('Escribí el motivo de la confirmación.');
    const { data, error } = await Auth._cliente().rpc('gl_confirmar_e164', {
      p_jugador_id: jugadorId,
      p_e164: numero,
      p_motivo: String(motivo).trim(),
      p_confirmar_titularidad: Boolean(confirmarTitularidad),
      p_evidencia: evidencia ? String(evidencia).trim() : null
    });
    if (error) throw new Error(Auth._mensajeRpcTelefono(error));
    return data || {};
  },

  /* La RPC deja telefono_valido_plan en NULL: se recalcula en JS con la
     misma librería y sin tocar telefono_verificado. */
  async recalcularTelefonoValidoPlan(jugadorId, e164) {
    if (!Auth._cliente()) throw new Error('Supabase no está configurado.');
    const numero = String(e164 || '').trim();
    const pais = GL.tel.pais(numero) || 'NI';
    const estado = GL.tel.validar(numero, pais, false);
    const { error } = await Auth._cliente().from('jugadores')
      .update({ telefono_valido_plan: estado.ok })
      .eq('id', jugadorId);
    if (error) throw new Error(Auth._mensajeRpcTelefono(error));
    return estado.ok;
  },

  /* 2.2 — La RPC y el recálculo son dos pasos. Si el segundo falla, la
     titularidad confirmada NO se deshace: se devuelve un estado pendiente de
     reconciliación. Repetir el recálculo no genera nueva auditoría. */
  async confirmarYRecalcular(args) {
    const resultado = await Auth.confirmarE164(args);
    const estado = {
      /* 2.3 — El RPC puede confirmar solo formato. No presentar titularidad
         cuando p_confirmar_titularidad fue falso. */
      confirmada: Boolean(
        (resultado && resultado.titularidad_confirmada) || args.confirmarTitularidad
      ),
      resultado: resultado || {},
      recalculoOk: false,
      requiereRecalculo: resultado && resultado.recalculo_requerido !== false,
      validoPlan: null,
      errorRecalculo: null
    };
    if (!estado.requiereRecalculo) return estado;
    try {
      estado.validoPlan = await Auth.recalcularTelefonoValidoPlan(
        args.jugadorId,
        (resultado && resultado.nuevo) || args.e164
      );
      estado.recalculoOk = true;
      estado.requiereRecalculo = false;
    } catch (e) {
      estado.errorRecalculo = (e && e.message) || String(e);
    }
    return estado;
  },

  /* Reintento explícito: solo vuelve a escribir telefono_valido_plan. La RPC
     y su auditoría no se repiten. */
  async reintentarRecalculo(jugadorId, e164) {
    const validoPlan = await Auth.recalcularTelefonoValidoPlan(jugadorId, e164);
    return { recalculoOk: true, requiereRecalculo: false, validoPlan };
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
