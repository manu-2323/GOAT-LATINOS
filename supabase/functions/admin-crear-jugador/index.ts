// Supabase Edge Function: admin-crear-jugador
// Crea, consulta o elimina (action:'delete') un usuario de Auth y su fila en
// `jugadores` usando la SERVICE ROLE. Verifica que quien llama sea administrador.
// La clave secreta NUNCA se expone al frontend.
// 1.2.1: el teléfono se valida en el servidor con la MISMA versión fija de
// libphonenumber-js que usa el frontend. `telefono_verificado` nunca se escribe
// desde aquí: la titularidad solo la confirma una persona.
// 1.4.0: idempotencia real en servidor, compensación verificada, respuestas
// estructuradas y consulta de estado de solo lectura. Sin cambios de esquema:
// se apoya en los únicos ya existentes (Auth.email, jugadores.user_id,
// jugadores.nombre_usuario, E.164 canónico y grupo_jugadores PK).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as phone from 'https://esm.sh/libphonenumber-js@1.13.17/min';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version, x-supabase-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/* === INICIO LÓGICA PURA (sin Deno ni imports; se prueba con mocks en Vitest) ===
   Todo lo que hay entre estas dos marcas es JavaScript válido y no usa redes,
   secretos ni globals de Deno. El wrapper de abajo inyecta los clientes. */

const PAISES_TELEFONO = new Set([
  'CR', 'NI', 'MX', 'GT', 'HN', 'SV', 'CO', 'EC',
  'PA', 'PE', 'VE', 'BO', 'AR', 'CL', 'PY', 'BR'
]);

const BASE_RESPUESTA = {
  creado: { ok: true, status: 200, reintentable: false, requiere_revision: false },
  ya_existente: { ok: true, status: 200, reintentable: false, requiere_revision: false },
  no_existe: { ok: true, status: 200, reintentable: true, requiere_revision: false },
  eliminado: { ok: true, status: 200, reintentable: false, requiere_revision: false },
  error_validacion: { ok: false, status: 400, reintentable: false, requiere_revision: false },
  error_parcial: { ok: false, status: 409, reintentable: false, requiere_revision: true },
  rollback_fallido: { ok: false, status: 409, reintentable: false, requiere_revision: true },
  error_servidor: { ok: false, status: 500, reintentable: false, requiere_revision: true }
};

function normalizarCorreo(valor) {
  return String(valor || '').trim().toLowerCase();
}

function normalizarNombre(valor) {
  return String(valor || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function digitosTelefono(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function mismoNombre(a, b) {
  const x = normalizarNombre(a);
  const y = normalizarNombre(b);
  return !!x && !!y && x === y;
}

function mismoTelefono(a, b) {
  const x = digitosTelefono(a);
  const y = digitosTelefono(b);
  return !!x && !!y && x === y;
}

function errorValidacion(mensaje, campo) {
  const e = new Error(mensaje);
  e.estado = 'error_validacion';
  e.campo = campo || null;
  return e;
}

// La autorización administrativa se mantiene en el wrapper; el helper permite
// verificarla con mocks sin exponer credenciales.
function esAdmin(perfil) {
  return !!perfil && perfil.rol === 'admin';
}

// Un jugador existente «pertenece» a esta operación si coincide al menos un
// identificador fuerte. Nunca se modifica una cuenta por el solo hecho de
// compartir el correo.
function perteneceJugador(fila, b) {
  if (!fila) return false;
  return mismoNombre(fila.nombre_usuario, b.nombre_usuario) ||
    mismoTelefono(fila.telefono_e164, b.telefono_e164) ||
    (!!fila.email && normalizarCorreo(fila.email) === normalizarCorreo(b.email));
}

// Un usuario Auth sin fila solo se adopta si conserva el metadata que ESSTA
// función escribió. Así no se secuestra el registro público de otra persona.
function perteneceMetadata(usuario, b) {
  const m = (usuario && usuario.user_metadata) || {};
  return mismoNombre(m.nombre_usuario, b.nombre_usuario) &&
    mismoTelefono(m.telefono_e164 || m.telefono, b.telefono_e164);
}

function camposTelefono(b, telefonia) {
  const e164 = String(b.telefono_e164 || '').trim();
  const pais = String(b.pais_telefono || b.pais || '').toUpperCase();
  const nacional = String(b.telefono_nacional || '').trim();

  if (!/^\+[1-9]\d{7,14}$/.test(e164))
    throw errorValidacion('El teléfono debe enviarse en formato E.164 válido (con +).', 'telefono');
  if (!PAISES_TELEFONO.has(pais))
    throw errorValidacion('El país del teléfono no está habilitado.', 'telefono');
  if (b.telefono_valido_plan !== true)
    throw errorValidacion('El teléfono debe tener formato válido para el plan.', 'telefono');

  const digitos = e164.slice(1);
  if (b.telefono) {
    const legado = String(b.telefono).replace(/\D/g, '');
    if (legado && legado !== digitos)
      throw errorValidacion('El teléfono y su representación E.164 no coinciden.', 'telefono');
  }

  const parsed = telefonia.parsePhoneNumberFromString(e164);
  if (!parsed || !parsed.isValid())
    throw errorValidacion('El teléfono no es válido según libphonenumber-js.', 'telefono');
  if (parsed.country && String(parsed.country).toUpperCase() !== pais)
    throw errorValidacion('El prefijo del teléfono no corresponde al país elegido.', 'telefono');

  const nacionalCalculado = (() => {
    const objeto = telefonia.parsePhoneNumberFromString(e164, pais);
    if (!objeto) return '';
    try {
      return typeof objeto.formatNational === 'function'
        ? objeto.formatNational()
        : objeto.format('NATIONAL');
    } catch (_) {
      return '';
    }
  })();

  return {
    telefono: digitos,
    telefono_e164: e164,
    telefono_nacional: nacional || nacionalCalculado,
    pais_telefono: pais,
    telefono_valido_plan: true
  };
}

function validarCreacion(b, telefonia) {
  if (!b || typeof b !== 'object')
    throw errorValidacion('Faltan datos obligatorios.', null);
  if (!normalizarCorreo(b.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarCorreo(b.email)))
    throw errorValidacion('El correo electrónico no es válido.', 'email');
  if (typeof b.password !== 'string' || b.password.length < 8)
    throw errorValidacion('La contraseña debe tener al menos 8 caracteres.', 'password');
  if (normalizarNombre(b.nombre_usuario).length < 2)
    throw errorValidacion('El nombre debe tener al menos 2 caracteres.', 'nombre_usuario');

  const telefono = camposTelefono(b, telefonia);

  let zonaHoraria = 'America/Managua';
  if (b.zona_horaria) {
    try {
      new Intl.DateTimeFormat('es-ES', { timeZone: String(b.zona_horaria) });
      zonaHoraria = String(b.zona_horaria);
    } catch (_) {
      throw errorValidacion('La ciudad o zona horaria no es válida.', 'zona_horaria');
    }
  }

  return { telefono, zonaHoraria, email: normalizarCorreo(b.email), nombre: normalizarNombre(b.nombre_usuario) };
}

// Respuesta consistente para el frontend. Nunca incluye tokens, Service Role
// ni mensajes internos del motor de base de datos.
function respuesta(estado, mensaje, extras) {
  const base = BASE_RESPUESTA[estado] || BASE_RESPUESTA.error_servidor;
  const opciones = extras || {};
  const cuerpo = {
    ok: base.ok,
    estado,
    mensaje,
    reintentable: typeof opciones.reintentable === 'boolean' ? opciones.reintentable : base.reintentable,
    requiere_revision: typeof opciones.requiere_revision === 'boolean'
      ? opciones.requiere_revision : base.requiere_revision
  };
  ['user_id', 'jugador_id', 'campos', 'compensacion', 'estado_consulta'].forEach(clave => {
    if (opciones[clave] !== undefined) cuerpo[clave] = opciones[clave];
  });
  if (!cuerpo.ok) cuerpo.error = mensaje;
  return { status: base.status, cuerpo };
}

function esConflicto(error) {
  const codigo = String((error && error.code) || '');
  const msg = String((error && error.message) || error || '');
  return codigo === '23505' || /unique constraint|duplicate key|ya existe|already exists/i.test(msg);
}

function esDuplicadoAuth(error) {
  const msg = String((error && error.message) || error || '');
  return /already registered|user already exists|already exists/i.test(msg);
}

async function leerFilas(admin, tabla, columnas, filtros) {
  let consulta = admin.from(tabla).select(columnas);
  (filtros || []).forEach(par => {
    if (par[1] !== undefined && par[1] !== null && par[1] !== '') consulta = consulta.eq(par[0], par[1]);
  });
  const { data, error } = await consulta.limit(20);
  if (error) throw error;
  return data || [];
}

async function insertarFila(admin, tabla, valores, columnas) {
  const { data, error } = await admin.from(tabla).insert(valores).select(columnas).maybeSingle();
  return { data, error };
}

async function borrarFilas(admin, tabla, filtros) {
  let consulta = admin.from(tabla).delete();
  filtros.forEach(par => { consulta = consulta.eq(par[0], par[1]); });
  const { error } = await consulta;
  if (error) return false;
  const restantes = await leerFilas(admin, tabla, '*', filtros);
  return restantes.length === 0;
}

async function borrarAuth(admin, id) {
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return false;
  const getter = admin.auth.admin.getUserById || admin.auth.admin.getUser;
  if (typeof getter !== 'function') return true;
  try {
    const { data, error: errLectura } = await getter.call(admin.auth.admin, id);
    return !errLectura && !(data && data.user);
  } catch (_) {
    return false;
  }
}

async function usuarioPorCorreo(admin, email) {
  const correo = normalizarCorreo(email);
  if (!correo) return null;
  try {
    /* @supabase/supabase-js@2 NO expone auth.admin.getUserByEmail. Usarlo
       lanzaba TypeError y hacía fallar la creación aunque no existiera el
       usuario (compensación correcta, pero alta imposible). Se mantiene el
       getter cuando un mock/cliente antiguo sí lo provee. */
    const getter = admin.auth.admin.getUserByEmail;
    if (typeof getter === 'function') {
      const { data, error } = await getter.call(admin.auth.admin, correo);
      if (error) {
        if (/not found|no user|404/i.test(String(error.message || error))) return null;
        throw error;
      }
      return (data && data.user) || null;
    }

    const porPagina = 200;
    for (let pagina = 1; pagina <= 50; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page: pagina,
        perPage: porPagina
      });
      if (error) throw error;
      const usuarios = (data && data.users) || [];
      const encontrado = usuarios.find(u => normalizarCorreo(u.email) === correo);
      if (encontrado) return encontrado;
      if (usuarios.length < porPagina) break;
    }
    return null;
  } catch (e) {
    if (/not found|no user|404/i.test(String((e && e.message) || e))) return null;
    throw e;
  }
}

async function buscarJugadores(admin, b, email, nombre, e164) {
  const columnas = 'id,user_id,email,nombre_usuario,telefono_e164,rol';
  const consultas = [
    leerFilas(admin, 'jugadores', columnas, [['email', email]]),
    leerFilas(admin, 'jugadores', columnas, [['nombre_usuario', nombre]]),
    leerFilas(admin, 'jugadores', columnas, [['telefono_e164', e164]])
  ];
  const grupos = await Promise.all(consultas);
  const vistos = {};
  const filas = [];
  grupos.forEach(lista => lista.forEach(fila => {
    if (!vistos[fila.id]) { vistos[fila.id] = true; filas.push(fila); }
  }));
  return filas;
}

// Solo inserta la asignación si no existía. La PK (jugador_id, grupo_id) cierra
// la carrera entre dos solicitudes simultáneas.
async function asegurarGrupo(admin, jugadorId, grupoId, creado) {
  if (!grupoId) return { ok: true, yaExistia: true };
  const filtros = [['jugador_id', jugadorId], ['grupo_id', grupoId]];
  const previas = await leerFilas(admin, 'grupo_jugadores', 'jugador_id', filtros);
  if (previas.length) return { ok: true, yaExistia: true };

  const { error } = await admin.from('grupo_jugadores')
    .insert({ grupo_id: grupoId, jugador_id: jugadorId });
  if (error) {
    if (esConflicto(error)) {
      const ahora = await leerFilas(admin, 'grupo_jugadores', 'jugador_id', filtros);
      if (ahora.length) return { ok: true, yaExistia: true };
    }
    return { ok: false, error };
  }
  creado.grupo = { jugador_id: jugadorId, grupo_id: grupoId };
  return { ok: true, yaExistia: false };
}

// Borra únicamente lo que ESTA invocación creó, y verifica cada borrado.
async function compensar(admin, creado) {
  const resultado = { auth: 'no_creado', jugador: 'no_creado', grupo: 'no_creado', completo: true };

  if (creado.grupo) {
    const borrado = await borrarFilas(admin, 'grupo_jugadores', [
      ['jugador_id', creado.grupo.jugador_id], ['grupo_id', creado.grupo.grupo_id]
    ]);
    resultado.grupo = borrado ? 'revertido' : 'fallido';
  }
  if (creado.jugador) {
    const borrado = await borrarFilas(admin, 'jugadores', [['id', creado.jugador]]);
    resultado.jugador = borrado ? 'revertido' : 'fallido';
  }
  if (creado.auth) {
    const borrado = await borrarAuth(admin, creado.auth.id);
    resultado.auth = borrado ? 'revertido' : 'fallido';
  }
  resultado.completo = resultado.auth !== 'fallido' &&
    resultado.jugador !== 'fallido' && resultado.grupo !== 'fallido';
  return resultado;
}

function resumenCompensacion(comp) {
  return 'Auth: ' + comp.auth + '; jugador: ' + comp.jugador + '; grupo: ' + comp.grupo + '.';
}

async function falloConCompensacion(admin, creado, estado, mensaje, extras) {
  const comp = await compensar(admin, creado);
  const opciones = Object.assign({}, extras || {}, { compensacion: comp });
  if (!comp.completo) {
    return respuesta('rollback_fallido',
      'No se pudo verificar la reversión completa. ' + resumenCompensacion(comp) +
      ' Revisá el estado antes de volver a intentar.', opciones);
  }
  return respuesta(estado, mensaje, Object.assign({ reintentable: true }, opciones));
}

async function insertarJugador(admin, userId, validos, b, creado) {
  return insertarFila(admin, 'jugadores', {
    user_id: userId,
    nombre_usuario: validos.nombre,
    email: validos.email,
    pais: b.pais || 'NI',
    zona_horaria: validos.zonaHoraria,
    ...validos.telefono,
    rol: 'jugador',
    activo: true,
    suspendido: false,
    torneo_id: b.torneo_id
  }, 'id');
}

async function crearJugadorServidor(admin, b, opciones) {
  const cfg = opciones || {};
  let validos;
  try {
    validos = validarCreacion(b, cfg.phone);
  } catch (e) {
    return respuesta('error_validacion', (e && e.message) || 'Datos inválidos.', {
      campos: e && e.campo ? [e.campo] : []
    });
  }

  const creado = { auth: null, jugador: null, grupo: null };
  const email = validos.email;
  const e164 = validos.telefono.telefono_e164;

  try {
    const respuestaInicial = await Promise.all([
      buscarJugadores(admin, b, email, validos.nombre, e164),
      usuarioPorCorreo(admin, email)
    ]);
    let jugadores = respuestaInicial[0];
    const usuario = respuestaInicial[1];

    if (usuario) {
      const porUsuario = jugadores.find(j => j.user_id === usuario.id);
      if (!porUsuario) {
        const directos = await leerFilas(admin, 'jugadores',
          'id,user_id,email,nombre_usuario,telefono_e164,rol', [['user_id', usuario.id]]);
        directos.forEach(fila => {
          if (!jugadores.some(j => j.id === fila.id)) jugadores.push(fila);
        });
      }
      const vinculado = jugadores.find(j => j.user_id === usuario.id);

      if (vinculado) {
        if (!perteneceJugador(vinculado, b)) {
          return respuesta('error_validacion',
            'Ese correo ya pertenece a otro jugador. No se creó ni modificó ninguna cuenta.',
            { campos: ['email'] });
        }
        const grupo = await asegurarGrupo(admin, vinculado.id, b.grupo_id, creado);
        if (!grupo.ok)
          return falloConCompensacion(admin, creado, 'error_servidor',
            'El jugador ya existía, pero no se pudo verificar su asignación al grupo.', {});
        return respuesta('ya_existente',
          'El jugador ya estaba registrado. No se creó otra cuenta.',
          { user_id: vinculado.user_id || usuario.id, jugador_id: vinculado.id });
      }

      // Cuenta Auth huérfana: solo se adoptan los datos escritos por esta función.
      if (!perteneceMetadata(usuario, b)) {
        return respuesta('error_validacion',
          'Ese correo ya tiene una cuenta que no pertenece a este jugador. No se modificó.',
          { campos: ['email'] });
      }
      const ins = await insertarJugador(admin, usuario.id, validos, b, creado);
      if (ins.error) {
        if (esConflicto(ins.error)) {
          const actuales = await leerFilas(admin, 'jugadores',
            'id,user_id,email,nombre_usuario,telefono_e164,rol', [['user_id', usuario.id]]);
          const ya = actuales.find(j => perteneceJugador(j, b));
          if (ya) {
            const grupo = await asegurarGrupo(admin, ya.id, b.grupo_id, creado);
            if (!grupo.ok)
              return falloConCompensacion(admin, creado, 'error_servidor',
                'El jugador ya existía, pero no se pudo verificar su asignación al grupo.', {});
            return respuesta('ya_existente',
              'La operación anterior ya había creado el jugador. No se duplicó.',
              { user_id: usuario.id, jugador_id: ya.id });
          }
        }
        return falloConCompensacion(admin, creado, 'error_servidor',
          'No se pudo completar el registro del jugador.', {});
      }
      creado.jugador = ins.data && ins.data.id;
      const grupo = await asegurarGrupo(admin, creado.jugador, b.grupo_id, creado);
      if (!grupo.ok)
        return falloConCompensacion(admin, creado, 'error_servidor',
          'La cuenta existía, pero no se pudo asignar al grupo.', {});
      return respuesta('ya_existente',
        'La cuenta existía y se completó el registro del jugador. No se creó otra cuenta.',
        { user_id: usuario.id, jugador_id: creado.jugador });
    }

    // Sin usuario ni jugador: antes de crear Auth descartamos colisiones de
    // nombre/teléfono/correo para no generar huérfanos.
    const porCorreo = jugadores.find(j => normalizarCorreo(j.email) === email);
    if (porCorreo)
      return respuesta('error_validacion',
        'Ese correo ya está asociado a otro jugador. No se creó otra cuenta.',
        { campos: ['email'] });
    const porIdentidad = jugadores.find(j =>
      mismoNombre(j.nombre_usuario, validos.nombre) || mismoTelefono(j.telefono_e164, e164));
    if (porIdentidad)
      return respuesta('error_validacion',
        'Ese nombre o teléfono ya pertenece a otro jugador. No se creó otra cuenta.',
        { campos: ['nombre_usuario', 'telefono'] });

    const { data: nuevo, error: errAuth } = await admin.auth.admin.createUser({
      email,
      password: b.password,
      email_confirm: true,
      user_metadata: {
        nombre_usuario: validos.nombre,
        pais: b.pais || 'NI',
        ...validos.telefono
      }
    });

    if (errAuth) {
      // Carrera con otra solicitud del mismo correo: releer, no borrar nada.
      if (esDuplicadoAuth(errAuth) && (cfg.revisiones || 0) < 2) {
        return crearJugadorServidor(admin, b,
          Object.assign({}, cfg, { revisiones: (cfg.revisiones || 0) + 1 }));
      }
      return respuesta('error_servidor',
        'No se pudo crear la cuenta de acceso. No se modificaron datos.',
        { reintentable: false });
    }

    creado.auth = nuevo && nuevo.user;
    if (!creado.auth || !creado.auth.id)
      return falloConCompensacion(admin, creado, 'error_servidor',
        'La cuenta de acceso no devolvió una identidad verificable.', {});

    const ins = await insertarJugador(admin, creado.auth.id, validos, b, creado);
    if (ins.error) {
      if (esConflicto(ins.error)) {
        const actuales = await leerFilas(admin, 'jugadores',
          'id,user_id,email,nombre_usuario,telefono_e164,rol', [['user_id', creado.auth.id]]);
        const ya = actuales.find(j => perteneceJugador(j, b));
        if (ya) {
          // La fila ya existe y usa NUESTRO usuario: no compensar Auth.
          creado.auth = null;
          const grupo = await asegurarGrupo(admin, ya.id, b.grupo_id, creado);
          if (!grupo.ok)
            return falloConCompensacion(admin, creado, 'error_servidor',
              'El jugador ya existía, pero no se pudo verificar su grupo.', {});
          return respuesta('ya_existente',
            'Otra solicitud creó el jugador primero. No se duplicó.',
            { user_id: ya.user_id, jugador_id: ya.id });
        }
        // La fila en conflicto es de otro jugador: solo se revierte lo nuestro.
        return falloConCompensacion(admin, creado, 'error_validacion',
          'Ese nombre o teléfono ya pertenece a otro jugador. No se creó otro registro.',
          { campos: ['nombre_usuario', 'telefono'], reintentable: false });
      }
      return falloConCompensacion(admin, creado, 'error_servidor',
        'No se pudo guardar el jugador. La cuenta creada por este intento se revirtió.', {});
    }

    creado.jugador = ins.data && ins.data.id;
    const grupo = await asegurarGrupo(admin, creado.jugador, b.grupo_id, creado);
    if (!grupo.ok)
      return falloConCompensacion(admin, creado, 'error_servidor',
        'No se pudo asignar el jugador al grupo. La creación se revirtió.', {});

    return respuesta('creado', b.grupo_id
      ? 'Jugador creado y asignado al grupo.'
      : 'Jugador creado; pendiente de asignar grupo.', {
      user_id: creado.auth.id,
      jugador_id: creado.jugador
    });
  } catch (e) {
    return falloConCompensacion(admin, creado, 'error_servidor',
      'No se pudo completar la creación. Se verificó la reversión de lo creado por este intento.', {});
  }
}

// Consulta de SOLO LECTURA: permite decidir si es seguro reintentar después de
// una respuesta perdida, sin crear ni borrar nada.
async function consultarEstado(admin, b) {
  const email = normalizarCorreo(b.email);
  const nombre = normalizarNombre(b.nombre_usuario);
  const e164 = String(b.telefono_e164 || '');
  if (!email && !nombre && !e164)
    return respuesta('error_validacion', 'Faltan datos para consultar el estado.', {});

  const filtros = [];
  if (email) filtros.push(['email', email]);
  if (nombre) filtros.push(['nombre_usuario', nombre]);
  if (e164) filtros.push(['telefono_e164', e164]);
  const columnas = 'id,user_id,email,nombre_usuario,telefono_e164';
  const grupos = await Promise.all(filtros.map(f => leerFilas(admin, 'jugadores', columnas, [f])));
  const vistos = {};
  const jugadores = [];
  grupos.forEach(lista => lista.forEach(fila => {
    if (!vistos[fila.id]) { vistos[fila.id] = true; jugadores.push(fila); }
  }));

  const usuario = email ? await usuarioPorCorreo(admin, email) : null;
  const vinculado = usuario && jugadores.find(j => j.user_id === usuario.id);
  if (vinculado)
    return respuesta('ya_existente',
      'El jugador ya está registrado. No se creó otra cuenta.',
      { user_id: vinculado.user_id, jugador_id: vinculado.id, estado_consulta: 'ya_existente' });

  const incompleto = (usuario && !vinculado) || jugadores.some(j => !j.user_id);
  if (incompleto)
    return respuesta('error_parcial',
      'Hay un registro incompleto asociado a esos datos. No reintentes: requiere revisión administrativa.',
      { estado_consulta: 'incompleto' });

  return respuesta('no_existe',
    'No hay jugador ni cuenta asociada a esos datos. Podés reintentar la creación.',
    { estado_consulta: 'no_existe' });
}

/* === FIN LÓGICA PURA === */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const enviar = (resultado) => new Response(JSON.stringify(resultado.cuerpo), {
    status: resultado.status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY');
    if (!serviceKey) throw new Error('Falta configurar la clave de servicio del servidor');

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) throw new Error('Falta token de sesión');
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: userData, error: userErr } = await caller.auth.getUser(token);
    if (userErr || !userData.user) throw new Error('Sesión inválida');

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: perfil } = await admin.from('jugadores')
      .select('rol').eq('user_id', userData.user.id).single();
    if (!esAdmin(perfil)) throw new Error('No tenés permisos de administrador');

    const b = await req.json();
    const action = String(b.action || 'create');

    if (action === 'estado') return enviar(await consultarEstado(admin, b));

    if (action === 'delete') {
      const jugadorId = String(b.jugador_id || '');
      if (!jugadorId)
        return enviar(respuesta('error_validacion', 'Falta el jugador a eliminar.', {}));
      const { data: objetivos, error: errObjetivo } = await admin.from('jugadores')
        .select('id,user_id,rol,nombre_usuario')
        .eq('id', jugadorId)
        .limit(1);
      if (errObjetivo) throw errObjetivo;
      const objetivo = objetivos && objetivos.length ? objetivos[0] : null;
      if (!objetivo)
        return enviar(respuesta('error_validacion', 'El jugador ya no existe.', {}));
      if (objetivo.rol === 'admin')
        return enviar(respuesta('error_validacion',
          'Las cuentas administradoras se gestionan desde la pestaña Admins', {}));

      await admin.from('partidos').delete().or(`local_id.eq.${objetivo.id},visitante_id.eq.${objetivo.id}`);
      await admin.from('clasificacion').delete().eq('jugador_id', objetivo.id);
      await admin.from('sanciones').delete().eq('jugador_id', objetivo.id);
      await admin.from('notificaciones').delete().eq('jugador_id', objetivo.id);
      await admin.from('grupo_jugadores').delete().eq('jugador_id', objetivo.id);

      const { error: errJugador } = await admin.from('jugadores').delete().eq('id', objetivo.id);
      if (errJugador) throw errJugador;

      if (objetivo.user_id) {
        const { error: errAvatar } = await admin.storage.from('avatares')
          .remove([objetivo.user_id + '/']);
        if (errAvatar) console.warn('No se pudo borrar el avatar:', errAvatar.message);
        const { error: errAuth } = await admin.auth.admin.deleteUser(objetivo.user_id);
        if (errAuth) throw errAuth;
      }

      return enviar(respuesta('eliminado', 'Jugador y cuenta eliminados correctamente.', {}));
    }

    if (action !== 'create')
      return enviar(respuesta('error_validacion', 'Acción no válida.', {}));

    return enviar(await crearJugadorServidor(admin, b, { phone }));
  } catch (error) {
    const msg = String((error && error.message) || error || '');
    const estado = /permiso|admin|sesi[oó]n|token/i.test(msg) ? 'error_validacion' : 'error_servidor';
    return enviar(respuesta(estado,
      estado === 'error_validacion'
        ? msg
        : 'No se pudo completar la operación. No se identificaron cambios verificables.',
      { reintentable: false }));
  }
});
