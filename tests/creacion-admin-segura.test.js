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
  const sb = { functions: { invoke: invoke || vi.fn(async () => ({ data: { ok: true, estado: 'creado', user_id: 'u-1' }, error: null })) } };
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

function invokeCon(crear, consultar) {
  return vi.fn(async (_nombre, opciones) => {
    const b = (opciones && opciones.body) || {};
    if (b.action === 'estado') return { data: consultar, error: null };
    return crear();
  });
}

describe('1.4.0 — alta administrativa: una sola creación', () => {
  it('un clic confirma la creación y limpia el estado local', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, estado: 'creado', user_id: 'u-1' }, error: null }));
    const { Mod } = crearAdmin({ invoke });

    const r = await Mod._pruebas.ejecutarCreacion(body());

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('admin-crear-jugador');
    expect(invoke.mock.calls[0][1].body.email).toBe('jugador@gmail.com');
    expect(r).toMatchObject({ ok: true, estado: 'creado' });
    expect(Mod._pruebas.estadoCrear()).toEqual({ enCurso: false, correos: [] });
  });

  it('dos clics rápidos no duplican la llamada a la Edge Function', async () => {
    let resolver;
    const invoke = vi.fn(() => new Promise(r => { resolver = r; }));
    const { Mod } = crearAdmin({ invoke });

    const primera = Mod._pruebas.ejecutarCreacion(body());
    const segunda = await Mod._pruebas.ejecutarCreacion(body());

    expect(segunda).toMatchObject({ ok: false, estado: 'bloqueado' });
    resolver({ data: { ok: true, estado: 'creado', user_id: 'u-2' }, error: null });
    await primera;

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(Mod._pruebas.estadoCrear().enCurso).toBe(false);
  });

  it('después de una creación confirmada se permite otro correo distinto', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, estado: 'creado', user_id: 'u-3' }, error: null }));
    const { Mod } = crearAdmin({ invoke });

    await Mod._pruebas.ejecutarCreacion(body('uno@gmail.com'));
    await Mod._pruebas.ejecutarCreacion(body('dos@gmail.com'));

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(Mod._pruebas.estadoCrear().correos).toEqual([]);
  });
});

describe('1.4.0 — estados explícitos del servidor', () => {
  it('ya_existente se muestra como tal y nunca como creado', async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, estado: 'ya_existente', mensaje: 'El jugador ya estaba registrado.' }, error: null
    }));
    const { Mod } = crearAdmin({ invoke });

    const r = await Mod._pruebas.ejecutarCreacion(body());

    expect(r).toMatchObject({ ok: true, estado: 'ya_existente' });
    expect(r.mensaje).not.toContain('creado y asignado');
    expect(Mod._pruebas.estadoCrear().correos).toEqual([]);
  });

  it('error_validacion conserva el campo y libera la dirección', async () => {
    const invoke = vi.fn(async () => ({
      data: {
        ok: false, estado: 'error_validacion',
        mensaje: 'Ese correo ya está registrado en el sistema.',
        campos: ['email']
      }, error: null
    }));
    const { Mod } = crearAdmin({ invoke });

    const r = await Mod._pruebas.ejecutarCreacion(body());

    expect(r).toMatchObject({ ok: false, estado: 'error_validacion', campo: '#ag-email' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(Mod._pruebas.estadoCrear().correos).toEqual([]);
  });

  it('error_parcial bloquea el correo y exige comprobación', async () => {
    const parcial = {
      ok: false, estado: 'error_parcial', mensaje: 'Hay un registro incompleto. No reintentes.'
    };
    const invoke = invokeCon(() => ({ data: parcial, error: null }), parcial);
    const { Mod } = crearAdmin({ invoke });

    const r = await Mod._pruebas.ejecutarCreacion(body());

    expect(r).toMatchObject({ ok: false, estado: 'error_parcial', reintentable: false });
    expect(r.mensaje).toContain('No reintentes');
    expect(Mod._pruebas.estadoCrear().correos).toEqual([['jugador@gmail.com', 'pendiente']]);
    expect(invoke.mock.calls.filter(c => (c[1].body || {}).action === 'estado')).toHaveLength(1);
  });

  it('rollback_fallido no se presenta como reversión confirmada', async () => {
    const fallido = {
      ok: false, estado: 'rollback_fallido',
      mensaje: 'No se pudo verificar la reversión completa. Auth: fallido.'
    };
    const invoke = invokeCon(() => ({ data: fallido, error: null }), fallido);
    const { Mod } = crearAdmin({ invoke });

    const r = await Mod._pruebas.ejecutarCreacion(body());

    expect(r.estado).toBe('rollback_fallido');
    expect(r.mensaje).not.toContain('se revirtió');
    expect(r.reintentable).toBe(false);
    expect(Mod._pruebas.estadoCrear().correos).toHaveLength(1);
  });

  it('acepta la respuesta real y rechaza ok:false o error en 2xx', () => {
    const { Mod } = crearAdmin();
    expect(Mod._pruebas.resultadoInvoke({ ok: true, estado: 'creado' }).ok).toBe(true);
    expect(Mod._pruebas.resultadoInvoke({ ok: false, estado: 'error_validacion' }).estado)
      .toBe('error_validacion');
    expect(Mod._pruebas.resultadoInvoke({ error: 'fallo parcial' }).ok).toBe(false);
    expect(Mod._pruebas.resultadoInvoke(null).mensaje).toContain('No repitas');
  });
});

describe('1.4.0 — recuperación controlada después de un resultado incierto', () => {
  it('timeout con estado no_existe permite reintentar sin duplicar', async () => {
    const invoke = invokeCon(
      () => new Promise(() => {}),
      { ok: true, estado: 'no_existe', mensaje: 'No hay registro.' }
    );
    const { Mod } = crearAdmin({ invoke, configExtra: { TIMEOUT_CREAR_JUGADOR: 5 } });

    const r = await Mod._pruebas.ejecutarCreacion(body());

    expect(r).toMatchObject({ reintentable: true, estado: 'reintentable' });
    expect(r.mensaje).toContain('Podés volver a intentar');
    expect(Mod._pruebas.estadoCrear().correos).toEqual([]);
  });

  it('timeout con jugador ya creado no crea otra cuenta al reintentar', async () => {
    let creaciones = 0;
    const invoke = vi.fn(async (_nombre, opciones) => {
      const b = (opciones && opciones.body) || {};
      if (b.action === 'estado')
        return { data: { ok: true, estado: 'ya_existente', mensaje: 'El jugador ya está registrado.' }, error: null };
      creaciones++;
      if (creaciones === 1) return new Promise(() => {});
      return { data: { ok: true, estado: 'ya_existente', mensaje: 'El jugador ya está registrado.' }, error: null };
    });
    const { Mod } = crearAdmin({ invoke, configExtra: { TIMEOUT_CREAR_JUGADOR: 5 } });

    const r = await Mod._pruebas.ejecutarCreacion(body());

    expect(r.mensaje).toContain('ya está registrado');
    expect(invoke.mock.calls.filter(c => (c[1].body || {}).action !== 'estado')).toHaveLength(1);
    const segundo = await Mod._pruebas.ejecutarCreacion(body());
    expect(segundo).toMatchObject({ ok: true, estado: 'ya_existente' });
    expect(invoke.mock.calls.filter(c => (c[1].body || {}).action !== 'estado')).toHaveLength(2);
  });

  it('estado incompleto mantiene el bloqueo del correo', async () => {
    const incompleto = { ok: false, estado: 'error_parcial', mensaje: 'Registro incompleto.' };
    const invoke = invokeCon(() => ({ error: errorHttp('sin detalle'), data: null }), incompleto);
    const { Mod } = crearAdmin({ invoke });

    const r = await Mod._pruebas.ejecutarCreacion(body());

    expect(r.estado).toBe('error_parcial');
    expect(Mod._pruebas.estadoCrear().correos).toHaveLength(1);
  });

  it('un error de red se clasifica sin culpar al servidor', () => {
    const { Mod } = crearAdmin();
    const c = Mod._pruebas.clasificarErrorCreacion(new Error('Failed to fetch'));
    expect(c.estado).toBe('red');
    expect(c.mensaje).toContain('No se pudo conectar');
  });

  it('un teléfono duplicado no se confunde con correo duplicado', () => {
    const { Mod } = crearAdmin();
    const c = Mod._pruebas.clasificarErrorCreacion(
      new Error('duplicate key value violates unique constraint jugadores_e164_canonicalizado_uniq')
    );
    expect(c.campo).toBe('#ag-tel');
    expect(c.mensaje).not.toContain('correo');
  });

  it('un límite de solicitudes mantiene la barrera y no promete tiempos', () => {
    const { Mod } = crearAdmin();
    const c = Mod._pruebas.clasificarErrorCreacion(new Error('429: email rate limit exceeded'));
    expect(c.mensaje).toContain('No repitas');
    expect(c.mensaje).not.toMatch(/esper[áa] \d|minuto|hora/);
    expect(c.estado).toBe('desconocido');
  });
});

describe('1.4.0 — integración frontend con la Edge Function', () => {
  it('los dos botones usan el mismo guard, timeout y finally', () => {
    expect(codigoAdmin.match(/avisoCreacionBloqueada\(/g).length).toBeGreaterThanOrEqual(3);
    expect(codigoAdmin.match(/await ejecutarCreacion\(body\)/g)).toHaveLength(2);
    expect(codigoAdmin.match(/btn\.disabled = true; btn\.textContent = 'Creando…'/g)).toHaveLength(2);
    expect(codigoAdmin.match(/finally \{\s*if \(btn\.isConnected\) \{\s*btn\.disabled = false; btn\.textContent = 'Crear jugador'; \}/g)).toHaveLength(2);
    expect(codigoConfig).toContain('TIMEOUT_CREAR_JUGADOR: 45000');
    expect(codigoAdmin).toContain('CONFIG.TIMEOUT_CREAR_JUGADOR');
  });

  it('la comprobación posterior es de solo lectura y está acotada', () => {
    expect(codigoAdmin).toContain("body: { action: 'estado', email: correoClave(correo) }");
    expect(codigoAdmin).toContain('TIEMPO_LECTURA_ERROR, \'No se pudo comprobar el estado del jugador.\'');
    expect(codigoAdmin).toContain('const INCERTOS =');
  });

  it('la auditoría solo registra creaciones confirmadas', () => {
    expect(codigoAdmin).toContain("if (resultado.estado === 'creado') {");
    expect(codigoAdmin).toContain("if (resultado.estado === 'ya_existente') {");
    expect(codigoAdmin.match(/await conTimeout\(\s*refrescar\(root\)/g)).toHaveLength(1);
  });

  it('los timeouts siguen siendo locales de la interfaz', () => {
    expect(codigoConfig).toContain('Timeouts LOCALES de la interfaz');
    expect(codigoConfig).not.toContain('Tiempo de espera de Supabase');
  });
});
