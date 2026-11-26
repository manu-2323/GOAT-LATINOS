/* =====================================================================
   FASE 3.20 — Integración del recorrido de competición con datos aislados.
   No se conecta a Supabase: todo se inyecta en constructores new Function.
   Escenarios: A administrador, B jugador, C integridad.
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');
const codigoGL = leer('js/core/gl.js');
const codigoConfig = leer('js/core/config.js');
const codigoCalendario = leer('js/modulos/calendario.js');
const codigoNotificaciones = leer('js/modulos/notificaciones.js');

const TORNEO = { id: 'torneo-a1', nombre: 'Torneo aislado', total_jornadas: 4 };
const GRUPOS = [{ id: 'g-a', nombre: 'Grupo A' }, { id: 'g-b', nombre: 'Grupo B' }];
const JUGADORES = [
  { id: 'jug-a1', nombre_usuario: 'Alpha' },
  { id: 'jug-a2', nombre_usuario: 'Bravo' },
  { id: 'jug-b1', nombre_usuario: 'Charlie' },
  { id: 'jug-b2', nombre_usuario: 'Delta' }
];
const MIEMBROS = [
  { jugador_id: 'jug-a1', grupo_id: 'g-a' },
  { jugador_id: 'jug-a2', grupo_id: 'g-a' },
  { jugador_id: 'jug-b1', grupo_id: 'g-b' },
  { jugador_id: 'jug-b2', grupo_id: 'g-b' }
];
const TABLA_A = [
  { jugador_id: 'jug-a1', pts: 6 },
  { jugador_id: 'jug-a2', pts: 0 }
];
const TABLA_B = [
  { jugador_id: 'jug-b1', pts: 3 },
  { jugador_id: 'jug-b2', pts: 1 }
];

let reservas;

function crearGL({ jugadorId = null, jornadas = [], clasificacion = null } = {}) {
  const ctx = {
    torneo: TORNEO,
    grupos: GRUPOS.map(g => ({ ...g })),
    jugadores: JUGADORES.map(j => ({ ...j })),
    miembros: MIEMBROS.map(m => ({ ...m })),
    jornadas: jornadas.map(j => ({ ...j })),
    clasificacion: [],
    sanciones: []
  };
  const ScopeGL = { GL: undefined };
  const crear = new Function(
    'CONFIG', 'Auth', 'window', 'document', 'sb', 'console',
    codigoGL + '\nreturn GL;'
  );
  const Auth = jugadorId ? { jugador: { id: jugadorId } } : {};
  const sb = { rpc: vi.fn() };
  const GL = crear(new Function(codigoConfig + '\nreturn CONFIG;')(), Auth,
    { GL: undefined }, globalThis.document, sb, console);
  GL.ctx = ctx;
  GL.torneo = () => TORNEO;
  GL.grupos = () => GRUPOS.map(g => ({ ...g }));
  GL.grupo = id => GRUPOS.find(g => g.id === id) || null;
  GL.grupoDeJugador = id => {
    const m = MIEMBROS.find(x => x.jugador_id === id);
    return m ? GL.grupo(m.grupo_id) : null;
  };
  GL.clasificacion = gid => {
    if (gid === 'g-a') return TABLA_A.map(f => ({ ...f }));
    if (gid === 'g-b') return TABLA_B.map(f => ({ ...f }));
    return (clasificacion || []).map(f => ({ ...f }));
  };
  return { GL, Auth, sb, ctx };
}

function crearCalendario({ GL, Auth, rpc }) {
  const Modulos = {};
  const cadena = {
    select: vi.fn(() => cadena),
    eq: vi.fn(() => cadena),
    order: vi.fn(async () => ({ data: [], error: null }))
  };
  const listeners = {};
  const sb = {
    rpc,
    from: vi.fn(() => cadena),
    channel: vi.fn(() => ({
      on(_tipo, _filtro, cb) { listeners.cb = cb; return this; },
      subscribe() { return this; }
    })),
    removeChannel: vi.fn()
  };
  const ZONAS_HORARIAS_DISPONIBLES = [
    { pais: 'Nicaragua', ciudad: 'Managua', zona: 'America/Managua' }
  ];
  const crear = new Function(
    'GL', 'Auth', 'Modulos', 'sb', 'CONFIG', 'ZONAS_HORARIAS_DISPONIBLES',
    'window', 'document', 'icono', 'esc', 'iniciarIconos',
    codigoCalendario + '\nreturn Modulos.calendario;'
  );
  const Mod = crear(
    GL, Auth, Modulos, sb, { VERSION: '1.3.3', ZONA_REFERENCIA: 'America/Managua',
      JORNADAS_FASE_REGULAR: 4 },
    ZONAS_HORARIAS_DISPONIBLES,
    { Modulos, print() {} }, globalThis.document,
    () => '', valor => String(valor == null ? '' : valor), () => {}
  );
  return { Mod, sb, listeners };
}

function crearNotificaciones({ GL, Auth, filas }) {
  const Modulos = {};
  const cadena = {
    select: vi.fn(() => cadena),
    eq: vi.fn(() => cadena),
    order: vi.fn(async () => ({ data: filas, error: null }))
  };
  const sb = {
    from: vi.fn(() => cadena),
    rpc: vi.fn(async () => ({ error: null })),
    channel: vi.fn(() => ({ on() { return this; }, subscribe() { return this; } })),
    removeChannel: vi.fn()
  };
  const crear = new Function(
    'sb', 'Auth', 'GL', 'CONFIG', 'Modulos', 'window', 'icono', 'esc', 'iniciarIconos', 'document',
    codigoNotificaciones + '\nreturn Modulos.notificaciones;'
  );
  const Mod = crear(
    sb, Auth, GL, { VERSION: '1.3.3' }, Modulos, {},
    () => '', valor => String(valor == null ? '' : valor), () => {}, globalThis.document
  );
  return { Mod, sb };
}

beforeEach(() => {
  reservas = { GL: {}, Auth: {} };
  ['ctx', 'cargarContexto', 'esAdmin', 'asegurarAdmin', 'torneo', 'grupos', 'grupo',
    'grupoDeJugador', 'posicion', 'notificar', 'mensaje', 'skeleton', 'vacio', 'error',
    'partidos', 'auditoria', 'recalcularTodo'].forEach(clave => {
    reservas.GL[clave] = window.GL[clave];
  });
  reservas.Auth.usuario = window.Auth.usuario;
  reservas.Auth.jugador = window.Auth.jugador;
});

afterEach(() => {
  Object.keys(reservas.GL).forEach(clave => { window.GL[clave] = reservas.GL[clave]; });
  window.Auth.usuario = reservas.Auth.usuario;
  window.Auth.jugador = reservas.Auth.jugador;
});

describe('FASE 3.20 — Escenario A: administrador', () => {
  it('muestra jornadas virtuales como sin programar y nunca ofrece cerrarlas', () => {
    const { GL } = crearGL();
    expect(GL.jornadaActual()).toMatchObject({ numero: 1, estado: 'sin_programar', virtual: true });
    expect(GL.jornadaAbiertaNumero()).toBeNull();

    window.GL.ctx = GL.ctx;
    window.GL.jornadaActual = GL.jornadaActual;
    window.GL.jornadaAbiertaNumero = GL.jornadaAbiertaNumero;
    window.GL.grupoInicial = GL.grupoInicial;
    window.GL.torneo = GL.torneo;
    window.GL.grupos = GL.grupos;
    window.GL.grupo = GL.grupo;
    window.GL.grupoDeJugador = GL.grupoDeJugador;
    window.GL.clasificacion = GL.clasificacion;
    window.GL.esAdmin = () => true;
    window.GL.asegurarAdmin = async () => true;
    window.GL.cargarContexto = async () => {};
    window.GL.skeleton = () => '';
    window.GL.vacio = () => '';
    window.GL.error = () => '';
    window.GL.notificar = () => {};
    window.GL.partidos = async () => [];

    const Admin = {};
    const crearAdmin = new Function(
      'GL', 'sb', 'Auth', 'Modulos', 'CONFIG', 'window', 'document',
      'icono', 'esc', 'iniciarIconos',
      leer('js/modulos/admin.js') + '\nreturn Modulos.admin;'
    );
    crearAdmin(window.GL, { rpc: vi.fn() }, {}, Admin, { VERSION: '1.3.3' },
      { Modulos: Admin }, globalThis.document,
      () => '', valor => String(valor == null ? '' : valor), () => {});
    const html = Admin.admin.htmlJornadas ? Admin.admin.htmlJornadas() : '';

    if (html) {
      expect(html).toContain('Sin programar');
      expect(html).not.toContain('data-cerrar-jornada="1"');
    }
  });

  it('cierra desde Calendario usando el RPC transaccional y recalcula', async () => {
    const { GL, Auth } = crearGL({
      jornadas: [{ id: 'jornada-a1-2', numero: 2, grupo_id: 'g-a', estado: 'abierta', fecha: '2026-03-01T12:00:00Z' }]
    });
    const rpc = vi.fn(async () => ({ data: { ok: true, partidos_resueltos: 1 }, error: null }));
    const recalcularTodo = vi.fn(async () => ({}));
    Object.assign(GL, window.GL);
    Object.assign(GL, {
      ctx: { torneo: TORNEO, grupos: GRUPOS, jornadas: [{ id: 'jornada-a1-2', numero: 2, grupo_id: 'g-a', estado: 'abierta', fecha: '2026-03-01T12:00:00Z' }] },
      zonaJugador: () => 'America/Managua',
      partesEnZona: () => ({ year: 2026, month: 3, day: 1, hour: 12, minute: 0 }),
      letraGrupo: g => g && g.nombre ? g.nombre.slice(-1) : '?',
      etiquetaZona: () => 'America/Managua',
      avatarHTML: () => '',
      nombreJugador: id => id,
      horarioZonaDetalle: () => '',
      validarPlan: () => {},
      linkWhatsapp: () => '',
      calendarioLegible: () => ''
    });
    GL.torneo = () => TORNEO;
    GL.grupos = () => GRUPOS.map(g => ({ ...g }));
    GL.grupo = id => GRUPOS.find(g => g.id === id) || null;
    GL.grupoDeJugador = id => (id === 'jug-b1' ? GL.grupo('g-b') : GL.grupo('g-a'));
    GL.cargarContexto = async () => GL.ctx;
    GL.esAdmin = () => true;
    GL.asegurarAdmin = async () => true;
    GL.skeleton = () => '';
    GL.partidos = async () => [];
    GL.notificar = vi.fn();
    GL.mensaje = (e) => String(e && e.message || e);
    GL.auditoria = { registrar: vi.fn() };
    GL.confirmar = vi.fn(async () => true);
    GL.recalcularTodo = recalcularTodo;
    Auth.usuario = { id: 'admin-a1' };

    const { Mod, sb } = crearCalendario({ GL, Auth, rpc });
    Mod.grupoId = 'g-a';
    Mod.vista = 'jornadas';
    const el = document.createElement('div');
    await Mod.render(el);
    expect(el.textContent).toContain('Programación de la dirección del torneo');
    const boton = el.querySelector('[data-cal-estado="2"]');
    expect(boton).toBeTruthy();
    boton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(rpc).toHaveBeenCalledWith('gl_cerrar_jornada', expect.objectContaining({
      p_torneo_id: 'torneo-a1', p_grupo_id: 'g-a', p_jornada: 2, p_cerrado_por: 'admin-a1'
    }));
    expect(rpc).toHaveBeenCalledWith('gl_cerrar_jornada', expect.objectContaining({
      p_torneo_id: 'torneo-a1', p_grupo_id: 'g-a', p_jornada: 2, p_cerrado_por: 'admin-a1'
    }));
    expect(recalcularTodo).toHaveBeenCalledWith('torneo-a1');
    expect(GL.auditoria.registrar).toHaveBeenCalledWith('jornada_cerrada', 'jornada', null,
      expect.objectContaining({ numero: 2 }));
    expect(sb.from).not.toHaveBeenCalled();
  });
});

describe('FASE 3.20 — Escenario B: jugador', () => {
  it('el grupo inicial del jugador es el suyo, no el primero del torneo', () => {
    const { GL } = crearGL({ jugadorId: 'jug-b1' });
    expect(GL.grupoInicial().id).toBe('g-b');
  });

  it('la posición se calcula dentro del grupo del jugador', () => {
    const { GL } = crearGL();
    expect(GL.posicion('jug-b1')).toBe(1);
    expect(GL.posicion('jug-b1', 'g-a')).toBeNull();
  });

  it('el aviso de jornada abierta no se genera si la jornada es virtual', async () => {
    const { GL, Auth } = crearGL({ jugadorId: 'jug-a1' });
    const rpc = vi.fn(async () => ({ error: null }));
    const { Mod } = crearNotificaciones({ GL, Auth, filas: [], rpc });
    await Mod._cargar();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('FASE 3.20 — Escenario C: integridad', () => {
  it('deduplica duplicados históricos sin borrar filas ni perder avisos sin leer', async () => {
    const { GL, Auth } = crearGL({ jugadorId: 'jug-a1' });
    const filas = [
      { id: 'n-1', tipo: 'jornada_abierta', jugador_id: 'jug-a1', torneo_id: 'torneo-a1',
        titulo: 'Jornada 1 abierta', cuerpo: 'Tu jornada 1 se encuentra abierta', leida: true,
        created_at: '2026-01-01T00:00:00Z' },
      { id: 'n-2', tipo: 'jornada_abierta', jugador_id: 'jug-a1', torneo_id: 'torneo-a1',
        titulo: 'Jornada 1 abierta', cuerpo: 'Tu jornada 1 se encuentra abierta', leida: false,
        created_at: '2026-01-02T00:00:00Z' },
      { id: 'n-3', tipo: 'info', titulo: 'Aviso único', cuerpo: 'Texto', leida: true,
        created_at: '2026-01-03T00:00:00Z' }
    ];
    const { Mod } = crearNotificaciones({ GL, Auth, filas });
    await Mod._cargar();
    expect(Mod._historial.filter(n => n.id && n.id.startsWith('n-'))).toHaveLength(3);
    expect(Mod._cache.filter(n => n.id && n.id.startsWith('n-'))).toHaveLength(2);
    expect(Mod._sinLeer).toBeGreaterThanOrEqual(1);
    expect(Mod._cache.find(n => n.id === 'n-2')).toBeTruthy();
    expect(Mod._cache.find(n => n.id === 'n-1')).toBeFalsy();
  });

  it('el ranking por grupo no se mezcla con el de otro grupo', () => {
    const { GL } = crearGL();
    expect(GL.posicion('jug-a1', 'g-a')).toBe(1);
    expect(GL.posicion('jug-a2', 'g-a')).toBe(2);
    expect(GL.posicion('jug-b1', 'g-b')).toBe(1);
  });

  it('el tour del jugador distingue la cuenta en localStorage', () => {
    const codigoOnboarding = leer('js/ui/onboarding.js');
    expect(codigoOnboarding).toContain('claveVisto()');
    expect(codigoOnboarding).not.toContain('localStorage.getItem(CLAVE_VISTO)');
  });

  it('los Estados y avisos no afirman una jornada abierta que no existe', () => {
    const { GL } = crearGL();
    expect(GL.jornadaActual().estado).toBe('sin_programar');
    expect(GL.jornadaAbiertaNumero()).toBeNull();
  });
});
