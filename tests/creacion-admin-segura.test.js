import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/* Pruebas AISLADAS con mocks. No crean cuentas ni escriben en Supabase. */
const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');
const codigoAdmin = leer('js/modulos/admin.js');
const codigoConfig = leer('js/core/config.js');

function crearAdmin({ invoke, configExtra = {} } = {}) {
  const Modulos = {};
  const GL = {
    ctx: {
      torneo: { id: 't1', nombre: 'Liga', total_jornadas: 22 },
      jugadores: [],
      grupos: [{ id: 'g1', nombre: 'Grupo A' }],
      jornadas: [], sanciones: [], miembros: []
    },
    invalidar: vi.fn(),
    cargarContexto: vi.fn(async () => {}),
    torneo: () => ({ id: 't1', nombre: 'Liga' }),
    torneoId: () => 't1',
    grupos: () => [{ id: 'g1', nombre: 'Grupo A' }],
    partidos: vi.fn(async () => []),
    notificar: vi.fn(),
    auditoria: { registrar: vi.fn(async () => ({ ok: true })) },
    zonaPorPais: () => 'America/Managua',
    mensaje: error => (error && error.message) || String(error || '')
  };
  const crear = new Function(
    'CONFIG', 'Modulos', 'GL', 'Auth', 'icono', 'esc', 'iniciarIconos', 'sb',
    codigoAdmin + '\nreturn Modulos.admin;'
  );
  const CONFIG = new Function(codigoConfig + '\nreturn CONFIG;')();
  Object.assign(CONFIG, configExtra);
  const sb = { functions: { invoke: invoke || vi.fn(async () => ({ data: { ok: true, user_id: 'u-1' }, error: null })) } };
  const Mod = crear(
    CONFIG, Modulos, GL, { usuario: { id: 'admin-1' } },
    () => '', valor => String(valor == null ? '' : valor), () => {}, sb
  );
  return { Mod, GL, sb };
}

function body(email = 'jugador@gmail.com') {
  return {
    nombre_usuario: 'JUGADOR_PRUEBA',
    email,
    password: 'Clave12345',
    pais: 'NI',
    zona_horaria: 'America/Managua',
    grupo_id: 'g1',
    torneo_id: 't1',
    telefono_e164: '+50581085555'
  };
}

function errorHttp(detalle) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: {
      clone: () => ({
        json: async () => ({ error: detalle }),
        text: async () => ''
      })
    }
  };
}

describe('1.3.9 — alta administrativa: una sola creación', () => {
  it('un clic confirma la creación y limpia el estado local', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, user_id: 'u-1' }, error: null }));
    const { Mod } = crearAdmin({ invoke });

    const datos = await Mod._pruebas.ejecutarCreacion(body());

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('admin-crear-jugador');
    expect(invoke.mock.calls[0][1].body.email).toBe('jugador@gmail.com');
    expect(datos.user_id).toBe('u-1');
    expect(Mod._pruebas.estadoCrear()).toEqual({ enCurso: false, correos: [] });
  });

  it('dos clics rápidos no duplican la llamada a la Edge Function', async () => {
    let resolver;
    const invoke = vi.fn(() => new Promise(r => { resolver = r; }));
    const { Mod } = crearAdmin({ invoke });

    const primera = Mod._pruebas.ejecutarCreacion(body());
    await expect(Mod._pruebas.ejecutarCreacion(body()))
      .rejects.toThrow('Ya hay una creación en curso');

    resolver({ data: { ok: true, user_id: 'u-2' }, error: null });
    await primera;

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(Mod._pruebas.estadoCrear().enCurso).toBe(false);
  });

  it('después de una creación confirmada se permite otro correo distinto', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, user_id: 'u-3' }, error: null }));
    const { Mod } = crearAdmin({ invoke });

    await Mod._pruebas.ejecutarCreacion(body('uno@gmail.com'));
    await Mod._pruebas.ejecutarCreacion(body('dos@gmail.com'));

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(Mod._pruebas.estadoCrear().correos).toEqual([]);
  });

  it('una respuesta perdida bloquea el mismo correo y permite otro', async () => {
    const invoke = vi.fn(() => new Promise(() => {}));
    const { Mod } = crearAdmin({ invoke, configExtra: { TIMEOUT_CREAR_JUGADOR: 5 } });

    await expect(Mod._pruebas.ejecutarCreacion(body()))
      .rejects.toThrow('tardó demasiado');
    expect(Mod._pruebas.estadoCrear().correos).toEqual([['jugador@gmail.com', 'pendiente']]);

    await expect(Mod._pruebas.ejecutarCreacion(body()))
      .rejects.toThrow('no sabemos con certeza');
    expect(invoke).toHaveBeenCalledTimes(1);

    invoke.mockImplementationOnce(async () => ({ data: { ok: true, user_id: 'u-9' }, error: null }));
    await expect(Mod._pruebas.ejecutarCreacion(body('otro@gmail.com')))
      .resolves.toMatchObject({ ok: true, user_id: 'u-9' });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe('1.3.9 — alta administrativa: interpretación de respuestas', () => {
  it('acepta la respuesta real de la función y rechaza ok:false o error en 2xx', () => {
    const { Mod } = crearAdmin();
    expect(Mod._pruebas.resultadoInvoke({ ok: true, user_id: 'u-1' }).ok).toBe(true);
    expect(Mod._pruebas.resultadoInvoke({ ok: false, error: 'sin grupo' }).ok).toBe(false);
    expect(Mod._pruebas.resultadoInvoke({ error: 'fallo parcial' }).ok).toBe(false);
    expect(Mod._pruebas.resultadoInvoke(null).mensaje).toContain('No repitas');
  });

  it('identifica correo ya registrado y libera esa dirección', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: errorHttp('User already registered') }));
    const { Mod } = crearAdmin({ invoke });

    await expect(Mod._pruebas.ejecutarCreacion(body())).rejects.toThrow('User already registered');
    const c = Mod._pruebas.clasificarErrorCreacion(new Error('User already registered'));
    expect(c.campo).toBe('#ag-email');
    expect(c.mensaje).toContain('ya está registrado');
    expect(c.estado).toBe('duplicado');
    expect(Mod._pruebas.estadoCrear().correos).toEqual([]);
  });

  it('no confunde un teléfono duplicado con un correo duplicado', () => {
    const { Mod } = crearAdmin();
    const c = Mod._pruebas.clasificarErrorCreacion(
      new Error('duplicate key value violates unique constraint jugadores_e164_canonicalizado_uniq')
    );
    expect(c.campo).toBe('#ag-tel');
    expect(c.mensaje).toContain('teléfono');
    expect(c.mensaje).not.toContain('correo');
  });

  it('un límite de solicitudes mantiene la barrera y no recomienda repetir', () => {
    const { Mod } = crearAdmin();
    const c = Mod._pruebas.clasificarErrorCreacion(new Error('429: email rate limit exceeded'));
    expect(c.mensaje).toContain('limitó las solicitudes');
    expect(c.mensaje).toContain('No repitas');
    expect(c.estado).toBe('desconocido');
  });

  it('un error de permisos tiene mensaje propio', () => {
    const { Mod } = crearAdmin();
    const c = Mod._pruebas.clasificarErrorCreacion(new Error('403: JWT unauthorized'));
    expect(c.mensaje).toContain('No tenés permisos');
    expect(c.mensaje).not.toContain('limitó');
  });
});

describe('1.3.9 — alta administrativa: estado visible y timeout en la UI', () => {
  it('los dos botones de creación usan el mismo guard, timeout y finally', () => {
    expect(codigoAdmin.match(/avisoCreacionBloqueada\(/g).length).toBeGreaterThanOrEqual(3);
    expect(codigoAdmin.match(/await ejecutarCreacion\(body\)/g)).toHaveLength(2);
    expect(codigoAdmin.match(/btn\.disabled = true; btn\.textContent = 'Creando…'/g)).toHaveLength(2);
    expect(codigoAdmin.match(/finally \{\s*if \(btn\.isConnected\) \{\s*btn\.disabled = false; btn\.textContent = 'Crear jugador'; \}/g)).toHaveLength(2);
    expect(codigoConfig).toContain('TIMEOUT_CREAR_JUGADOR: 45000');
    expect(codigoAdmin).toContain('CONFIG.TIMEOUT_CREAR_JUGADOR');
  });

  it('la auditoría y la recarga están acotadas por timeout', () => {
    expect(codigoAdmin).toContain("TIEMPO_LECTURA_ERROR, 'La auditoría tardó demasiado.'");
    expect(codigoAdmin).toContain("refrescar(root), CONFIG.TIMEOUT_CREAR_JUGADOR");
    expect(codigoAdmin).toContain("recargarContextoAdmin(), CONFIG.TIMEOUT_CREAR_JUGADOR");
    expect(codigoAdmin.match(/await conTimeout\(\s*refrescar\(root\)/g)).toHaveLength(1);
  });

  it('el timeout local no afirma ser un tiempo de Supabase', () => {
    expect(codigoConfig).toContain('Timeouts LOCALES de la interfaz');
    expect(codigoConfig).not.toContain('Tiempo de espera de Supabase');
  });
});
