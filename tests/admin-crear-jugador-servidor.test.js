import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* PRUEBAS AISLADAS. No llaman a Supabase, no envían correos y no crean cuentas.
   Simulan los únicos existentes en producción y fuerzan fallos parciales. */
const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');
const codigo = leer('supabase/functions/admin-crear-jugador/index.ts');

function extraerLogica() {
  const inicio = codigo.indexOf('/* === INICIO LÓGICA PURA');
  const fin = codigo.indexOf('/* === FIN LÓGICA PURA === */');
  if (inicio < 0 || fin < 0) throw new Error('No se encontraron las marcas de lógica pura');
  const telefonia = {
    parsePhoneNumberFromString(valor, pais) {
      return {
        isValid: () => true,
        country: String(pais || 'NI').toUpperCase(),
        formatNational: () => '8108 5555',
        format: () => '8108 5555'
      };
    }
  };
  const fabrica = new Function('phone', codigo.slice(inicio, fin) +
    '\nreturn { crearJugadorServidor, consultarEstado, respuesta, compensar, esAdmin, telefonia: phone, ' +
    'normalizarCorreo, normalizarNombre, mismoTelefono, perteneceJugador, perteneceMetadata };');
  return fabrica(telefonia);
}

const api = extraerLogica();

const functionDigits = valor => String(valor || '').replace(/\D/g, '');

function normalizarError(fallo) {
  if (fallo instanceof Error) return { message: fallo.message, code: fallo.code || null };
  return fallo || { message: 'Fallo simulado' };
}

function crearAdminMock(opciones = {}) {
  const fallos = opciones.fallos || {};
  const estado = {
    usuarios: new Map(),
    jugadores: [],
    grupo_jugadores: [],
    llamadas: { createUser: 0, deleteUser: 0, insertJugadores: 0, insertGrupo: 0 }
  };
  let contador = 0;

  const coincide = (fila, filtros) => filtros.every(([col, val]) =>
    String(fila[col] == null ? '' : fila[col]) === String(val));

  function tabla(nombre) {
    const q = {
      _modo: 'select', _filtros: [], _valores: null,
      select() { return q; },
      eq(col, val) { q._filtros.push([col, val]); return q; },
      insert(valores) { q._modo = 'insert'; q._valores = valores; return q; },
      delete() { q._modo = 'delete'; return q; },
      limit() { return ejecutar(); },
      maybeSingle() { return ejecutar(); },
      then(res, rej) { return ejecutar().then(res, rej); }
    };

    async function ejecutar() {
      const falloLectura = fallos['lectura_' + nombre];
      if (q._modo === 'select' && falloLectura)
        return { data: null, error: normalizarError(falloLectura) };

      if (q._modo === 'insert') {
        const error = fallos['insercion_' + nombre];
        if (error) return { data: null, error: normalizarError(error) };
        const valores = q._valores || {};
        if (nombre === 'jugadores') {
          estado.llamadas.insertJugadores++;
          const duplicado = estado.jugadores.find(j =>
            (valores.user_id && j.user_id === valores.user_id) ||
            (valores.nombre_usuario && j.nombre_usuario === valores.nombre_usuario) ||
            (valores.telefono_e164 &&
              functionDigits(j.telefono_e164) === functionDigits(valores.telefono_e164)));
          if (duplicado)
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          const fila = Object.assign({ id: 'j-' + (++contador) }, valores);
          estado.jugadores.push(fila);
          return { data: fila, error: null };
        }
        if (nombre === 'grupo_jugadores') {
          estado.llamadas.insertGrupo++;
          const duplicado = estado.grupo_jugadores.some(g =>
            g.jugador_id === valores.jugador_id && g.grupo_id === valores.grupo_id);
          if (duplicado)
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          estado.grupo_jugadores.push(Object.assign({}, valores));
          return { data: valores, error: null };
        }
      }

      if (q._modo === 'delete') {
        const error = fallos['borrado_' + nombre];
        if (error) return { data: null, error: normalizarError(error) };
        estado[nombre] = (estado[nombre] || []).filter(fila => !coincide(fila, q._filtros));
        return { data: [], error: null };
      }

      const filas = (estado[nombre] || []).filter(fila => coincide(fila, q._filtros));
      return { data: filas, error: null };
    }

    return q;
  }

  const admin = {
    estado,
    from: tabla,
    auth: {
      admin: {
        async getUserByEmail(email) {
          if (fallos.usuarioPorCorreo) return { data: null, error: normalizarError(fallos.usuarioPorCorreo) };
          const u = estado.usuarios.get(String(email || '').toLowerCase());
          return u
            ? { data: { user: u }, error: null }
            : { data: { user: null }, error: { message: 'User not found', code: '404' } };
        },
        async createUser(datos) {
          estado.llamadas.createUser++;
          if (fallos.crearAuth) return { data: null, error: normalizarError(fallos.crearAuth) };
          const clave = String(datos.email || '').toLowerCase();
          if (estado.usuarios.has(clave))
            return { data: null, error: { message: 'User already registered' } };
          const usuario = {
            id: 'u-' + (++contador),
            email: clave,
            user_metadata: Object.assign({}, datos.user_metadata)
          };
          estado.usuarios.set(clave, usuario);
          return { data: { user: usuario }, error: null };
        },
        async deleteUser(id) {
          estado.llamadas.deleteUser++;
          if (fallos.borrarAuth) return { data: null, error: normalizarError(fallos.borrarAuth) };
          for (const [clave, u] of estado.usuarios) if (u.id === id) estado.usuarios.delete(clave);
          return { data: { user: null }, error: null };
        },
        async getUserById(id) {
          const u = Array.from(estado.usuarios.values()).find(x => x.id === id) || null;
          return { data: { user: u }, error: null };
        }
      }
    }
  };
  return admin;
}

function body(extra = {}) {
  return Object.assign({
    action: 'create',
    nombre_usuario: 'JUGADOR_PRUEBA',
    email: 'jugador@gmail.com',
    password: 'Clave12345',
    pais: 'NI',
    zona_horaria: 'America/Managua',
    telefono_e164: '+50581085555',
    telefono_valido_plan: true,
    grupo_id: 'g1',
    torneo_id: 't1'
  }, extra);
}

describe('admin-crear-jugador — idempotencia en servidor', () => {
  it('crea una sola cuenta, jugador y asignación', async () => {
    const admin = crearAdminMock();
    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'creado', reintentable: false });
    expect(admin.estado.usuarios.size).toBe(1);
    expect(admin.estado.jugadores).toHaveLength(1);
    expect(admin.estado.grupo_jugadores).toEqual([{ jugador_id: 'j-2', grupo_id: 'g1' }]);
    expect(r.cuerpo.user_id).toBe('u-1');
  });

  it('correo ya registrado con jugador vinculado devuelve ya_existente sin crear nada', async () => {
    const admin = crearAdminMock();
    await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });
    const llamadas = Object.assign({}, admin.estado.llamadas);

    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(r.cuerpo.estado).toBe('ya_existente');
    expect(admin.estado.llamadas.createUser).toBe(llamadas.createUser);
    expect(admin.estado.usuarios.size).toBe(1);
    expect(admin.estado.jugadores).toHaveLength(1);
  });

  it('dos solicitudes simultáneas para el mismo correo no duplican cuenta ni jugador', async () => {
    const admin = crearAdminMock();
    const [a, b] = await Promise.all([
      api.crearJugadorServidor(admin, body(), { phone: api.telefonia }),
      api.crearJugadorServidor(admin, body(), { phone: api.telefonia })
    ]);

    expect([a.cuerpo.estado, b.cuerpo.estado].sort()).toEqual(['creado', 'ya_existente']);
    expect(admin.estado.usuarios.size).toBe(1);
    expect(admin.estado.jugadores).toHaveLength(1);
    expect(admin.estado.grupo_jugadores).toHaveLength(1);
    expect(admin.estado.llamadas.deleteUser).toBe(0);
  });

  it('dos solicitudes simultáneas para el mismo jugador no duplican filas ni dejan Auth huérfano', async () => {
    const admin = crearAdminMock();
    const [a, b] = await Promise.all([
      api.crearJugadorServidor(admin, body(), { phone: api.telefonia }),
      api.crearJugadorServidor(admin, body({ email: 'otro@gmail.com' }), { phone: api.telefonia })
    ]);

    expect([a.cuerpo.estado, b.cuerpo.estado]).toContain('creado');
    expect(admin.estado.jugadores).toHaveLength(1);
    expect(admin.estado.usuarios.size).toBe(1);
    expect(admin.estado.llamadas.deleteUser).toBe(1);
  });
});

describe('admin-crear-jugador — compensación y recuperación', () => {
  it('fallo al crear Auth no crea jugador ni jugadores huérfanos', async () => {
    const admin = crearAdminMock({ fallos: { crearAuth: new Error('Auth caído') } });
    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(r.cuerpo.estado).toBe('error_servidor');
    expect(admin.estado.usuarios.size).toBe(0);
    expect(admin.estado.jugadores).toHaveLength(0);
  });

  it('fallo al insertar jugadores revierte la cuenta creada y permite reintentar', async () => {
    const admin = crearAdminMock({
      fallos: { insercion_jugadores: { code: '500', message: 'DB no disponible' } }
    });
    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(r.cuerpo).toMatchObject({ estado: 'error_servidor', reintentable: true });
    expect(r.cuerpo.compensacion.auth).toBe('revertido');
    expect(admin.estado.usuarios.size).toBe(0);
    expect(admin.estado.jugadores).toHaveLength(0);
  });

  it('fallo al insertar grupo_jugadores revierte jugador y Auth', async () => {
    const admin = crearAdminMock({
      fallos: { insercion_grupo_jugadores: { code: '500', message: 'No se pudo asignar' } }
    });
    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(r.cuerpo.estado).toBe('error_servidor');
    expect(r.cuerpo.compensacion).toMatchObject({ grupo: 'no_creado', jugador: 'revertido', auth: 'revertido' });
    expect(admin.estado.usuarios.size).toBe(0);
    expect(admin.estado.jugadores).toHaveLength(0);
    expect(admin.estado.grupo_jugadores).toHaveLength(0);
  });

  it('fallo de compensación devuelve rollback_fallido con el estado real', async () => {
    const admin = crearAdminMock({
      fallos: {
        insercion_jugadores: { code: '500', message: 'DB no disponible' },
        borrarAuth: new Error('No se pudo borrar Auth')
      }
    });
    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(r.status).toBe(409);
    expect(r.cuerpo).toMatchObject({
      ok: false, estado: 'rollback_fallido', reintentable: false, requiere_revision: true
    });
    expect(r.cuerpo.compensacion.auth).toBe('fallido');
    expect(r.cuerpo.mensaje).toContain('Auth: fallido');
    expect(admin.estado.usuarios.size).toBe(1);
  });

  it('respuesta perdida: el reintento reconoce el alta y no elimina la cuenta', async () => {
    const admin = crearAdminMock();
    const primera = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });
    const consulta = await api.consultarEstado(admin, body());
    const reintento = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(primera.cuerpo.estado).toBe('creado');
    expect(consulta.cuerpo.estado).toBe('ya_existente');
    expect(reintento.cuerpo.estado).toBe('ya_existente');
    expect(admin.estado.usuarios.size).toBe(1);
    expect(admin.estado.jugadores).toHaveLength(1);
    expect(admin.estado.llamadas.deleteUser).toBe(0);
  });

  it('cuenta Auth huérfana con metadata de esta función se recupera sin crear otra', async () => {
    const admin = crearAdminMock();
    const { data } = await admin.auth.admin.createUser({
      email: body().email,
      password: body().password,
      email_confirm: true,
      user_metadata: {
        nombre_usuario: 'JUGADOR_PRUEBA',
        pais: 'NI',
        telefono_e164: '+50581085555',
        telefono_valido_plan: true
      }
    });
    expect(data.user).toBeTruthy();

    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(r.cuerpo.estado).toBe('ya_existente');
    expect(admin.estado.usuarios.size).toBe(1);
    expect(admin.estado.jugadores).toHaveLength(1);
    expect(admin.estado.llamadas.deleteUser).toBe(0);
  });

  it('cuenta existente ajena no se adopta ni se modifica', async () => {
    const admin = crearAdminMock();
    await admin.auth.admin.createUser({
      email: body().email,
      password: body().password,
      email_confirm: true,
      user_metadata: { nombre_usuario: 'OTRO_JUGADOR', telefono_e164: '+50588887777' }
    });

    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(r.cuerpo).toMatchObject({ estado: 'error_validacion', reintentable: false });
    expect(r.cuerpo.campos).toContain('email');
    expect(admin.estado.usuarios.size).toBe(1);
    expect(admin.estado.jugadores).toHaveLength(0);
  });

  it('estado incompleto bloquea el reintento ciego y pide revisión', async () => {
    const admin = crearAdminMock();
    estadoJugadorHuerfano(admin, body());

    const r = await api.consultarEstado(admin, body());

    expect(r.cuerpo).toMatchObject({
      estado: 'error_parcial', requiere_revision: true, reintentable: false
    });
    expect(r.cuerpo.estado_consulta).toBe('incompleto');
  });

  it('sin registro previo la consulta autoriza un reintento', async () => {
    const admin = crearAdminMock();
    const r = await api.consultarEstado(admin, body());
    expect(r.cuerpo).toMatchObject({ estado: 'no_existe', reintentable: true });
  });
});

function estadoJugadorHuerfano(admin, datos) {
  admin.estado.jugadores.push({
    id: 'j-huerfano',
    user_id: null,
    email: datos.email,
    nombre_usuario: datos.nombre_usuario,
    telefono_e164: datos.telefono_e164
  });
}

describe('admin-crear-jugador — validación, permisos y respuestas', () => {
  it('datos inválidos devuelven error_validacion con el campo concreto', async () => {
    const admin = crearAdminMock();
    const r = await api.crearJugadorServidor(admin,
      body({ password: 'corta', telefono_e164: '+50581085555' }), { phone: api.telefonia });

    expect(r.status).toBe(400);
    expect(r.cuerpo.estado).toBe('error_validacion');
    expect(r.cuerpo.campos).toContain('password');
    expect(admin.estado.llamadas.createUser).toBe(0);
  });

  it('un telefono inválido se clasifica como validación y no como correo duplicado', async () => {
    const admin = crearAdminMock();
    const r = await api.crearJugadorServidor(admin,
      body({ telefono_e164: '81085555' }), { phone: api.telefonia });
    expect(r.cuerpo.estado).toBe('error_validacion');
    expect(r.cuerpo.campos).toContain('telefono');
    expect(r.cuerpo.mensaje).not.toContain('correo duplicado');
  });

  it('fallo de conexión al consultar devuelve error_servidor sin cambios', async () => {
    const admin = crearAdminMock({
      fallos: { usuarioPorCorreo: new Error('Failed to fetch') }
    });
    const r = await api.crearJugadorServidor(admin, body(), { phone: api.telefonia });

    expect(r.cuerpo.estado).toBe('error_servidor');
    expect(r.cuerpo.mensaje).not.toContain('Failed to fetch');
    expect(admin.estado.jugadores).toHaveLength(0);
  });

  it('la autorización administrativa sigue siendo estricta', () => {
    expect(api.esAdmin({ rol: 'admin' })).toBe(true);
    expect(api.esAdmin({ rol: 'jugador' })).toBe(false);
    expect(api.esAdmin(null)).toBe(false);
    expect(codigo).toContain("if (!esAdmin(perfil)) throw new Error('No tenés permisos de administrador')");
  });

  it('las respuestas no exponen secretos ni códigos internos', () => {
    const r = api.respuesta('error_servidor', 'No se pudo completar la creación.', {});
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/SERVICE_ROLE|SERVICE|Bearer|23505|supabase.co/i);
    expect(r.cuerpo.error).toBe(r.cuerpo.mensaje);
  });

  it('estados exigidos están definidos y son consistentes', () => {
    ['creado', 'ya_existente', 'error_validacion', 'error_parcial', 'rollback_fallido', 'error_servidor']
      .forEach(estado => {
        const r = api.respuesta(estado, 'mensaje', {});
        expect(r.cuerpo.estado).toBe(estado);
        expect(typeof r.cuerpo.ok).toBe('boolean');
        expect(typeof r.cuerpo.reintentable).toBe('boolean');
        expect(typeof r.cuerpo.requiere_revision).toBe('boolean');
      });
    expect(codigo).toContain("if (action === 'estado') return enviar(await consultarEstado(admin, b))");
  });
});
