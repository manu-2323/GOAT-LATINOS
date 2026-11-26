import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');
const codigoAdmin = leer('js/modulos/admin.js');
const codigoDashboard = leer('js/modulos/dashboard-admin.js');
const codigoOnboarding = leer('js/ui/onboarding-admin.js');
const codigoAuditoria = leer('js/modulos/auditoria.js');
const codigoIndex = leer('index.html');
const codigoConfig = leer('js/core/config.js');
const codigoCSS = leer('css/estilos.css');

function crearAdmin({ auditoria = { registrar: vi.fn(async () => ({ ok: true })) }, ctx = {} } = {}) {
  const Modulos = {};
  const GL = {
    ctx: Object.assign({
      torneo: { id: 't1', total_jornadas: 22, nombre: 'Liga' },
      jugadores: [
        { id: 'j1', nombre_usuario: 'ALPHA', activo: true, rol: 'jugador' },
        { id: 'j2', nombre_usuario: 'BRAVO', activo: false, rol: 'expulsado' }
      ],
      grupos: [{ id: 'g1', nombre: 'Grupo A' }],
      miembros: [],
      jornadas: [],
      sanciones: []
    }, ctx),
    invalidar: vi.fn(),
    cargarContexto: vi.fn(async () => {}),
    torneo: () => ({ id: 't1', total_jornadas: 22, nombre: 'Liga' }),
    torneoId: () => 't1',
    grupos: () => [{ id: 'g1', nombre: 'Grupo A' }],
    partidos: vi.fn(async () => []),
    notificar: vi.fn(),
    auditoria
  };
  const crear = new Function(
    'CONFIG', 'Modulos', 'GL', 'Auth', 'icono', 'esc', 'iniciarIconos', 'sb',
    codigoAdmin + '\nreturn Modulos.admin;'
  );
  const Mod = crear(
    new Function(codigoConfig + '\nreturn CONFIG;')(), Modulos, GL,
    { jugador: { id: 'u-admin' }, usuario: { id: 'u-admin' } },
    () => '', valor => String(valor == null ? '' : valor), () => {}, {}
  );
  return { Mod, GL };
}

function crearMetricas() {
  const Modulos = {};
  const GL = {
    tel: { e164Jugador: j => j.telefono_e164 || '' },
    letraGrupo: g => (g.nombre || '?').slice(-1),
    tema: {
      texto2: '', fuente: '', superficie: '', bordeFuerte: '', advertencia: '',
      texto: '', borde: '', alfa: () => '', exito: '', marca: '', info: '',
      marcaTexto: '', bg: ''
    }
  };
  const crear = new Function(
    'CONFIG', 'Modulos', 'GL', 'Chart', 'icono', 'esc', 'iniciarIconos',
    codigoDashboard + '\nreturn Modulos["dashboard-admin"];'
  );
  return crear(
    new Function(codigoConfig + '\nreturn CONFIG;')(), Modulos, GL, undefined,
    () => '', valor => String(valor == null ? '' : valor), () => {}, Modulos
  )._metricas;
}

let reservas;

beforeEach(() => {
  document.body.innerHTML = '';
  reservas = {
    add: document.addEventListener,
    remove: document.removeEventListener,
    Auth: window.Auth
  };
});

afterEach(() => {
  document.addEventListener = reservas.add;
  document.removeEventListener = reservas.remove;
  window.Auth = reservas.Auth;
  document.body.innerHTML = '';
});

describe('FASE 3.16 — auditoría de Administración', () => {
  it('elimina la carga duplicada de contexto en el render del módulo', () => {
    const inicio = codigoAdmin.slice(0, codigoAdmin.indexOf('function tabBtn'));
    expect(inicio).not.toContain('await GL.cargarContexto(true)');
    expect(codigoAdmin).toContain('El router (app.js) ya cargó y validó el contexto');
  });

  it('toda la auditoría del módulo pasa por el helper esperado', () => {
    expect(codigoAdmin).not.toContain('GL.auditoria && GL.auditoria.registrar');
    expect(codigoAdmin.match(/await auditar\(/g).length).toBeGreaterThanOrEqual(10);
    expect(codigoAuditoria).toContain('return { ok: false, motivo:');
    expect(codigoAuditoria).toContain('return { ok: false, error:');
  });

  it('reincorporar es alcanzable desde la tabla, el menú móvil y el escritorio', () => {
    expect(codigoAdmin.match(/reincorporar-/g).length).toBeGreaterThanOrEqual(2);
    expect(codigoAdmin).toContain("if (tipo === 'reincorporar') modalSuspender(j, root)");
    expect(codigoAdmin).toContain("if (accion === 'reincorporar') modalSuspender(j, root)");
  });

  it('las acciones destructivas piden confirmación', () => {
    expect(codigoAdmin).toContain("'Quitar del grupo'");
    expect(codigoAdmin).toContain("'Abrir jornada'");
    expect(codigoAdmin).toContain('GL.dialogo({');
  });

  it('el cierre de jornada no descarta el modal antes de que la RPC responda', () => {
    const bloque = codigoAdmin.slice(codigoAdmin.indexOf("fondo.querySelector('#cj-ok')"));
    expect(bloque.indexOf('await cerrarConFuncion')).toBeLessThan(bloque.indexOf('cerrar();'));
    expect(codigoAdmin).toContain("if (!Mod.grupoJornadas)");
    expect(codigoAdmin).toContain('opciones.onError');
    expect(codigoAdmin).toContain("if (!data || typeof data !== 'object' || data.ok === false)");
  });

  it('los errores de Edge Function se leen de JSON o de texto sin perder el cuerpo', () => {
    expect(codigoAdmin).toContain('ctx.clone');
    expect(codigoAdmin).toContain('copia.text()');
  });

  it('la pestaña Equipos declara que es consultiva', () => {
    expect(codigoAdmin).toContain('no crea, elimina ni cambia grupos');
  });

  it('renueva el cache-busting y evita cargar módulos dos veces', () => {
    expect(codigoConfig).toMatch(/VERSION: '1\.3\.[123456]'/);
    expect(codigoIndex).toMatch(/\?v=3\.(16|17|19|20|23)\.0/);
    expect(codigoIndex).toMatch(/onboarding-admin\.js\?v=1\.2\.[12]/);
    expect(codigoIndex).not.toMatch(/<script src="js\/modulos\/(auditoria|dashboard-admin|notificaciones)\.js\?v=/);
    expect(codigoCSS).toContain('.j5-check-inactivos');
  });
});

describe('FASE 3.16 — helpers administrativos', () => {
  it('jugadoresAdmin incluye inactivos y expulsados', () => {
    const { Mod } = crearAdmin();
    expect(Mod._pruebas.jugadoresAdmin()).toHaveLength(2);
    expect(Mod._pruebas.jugadorAdmin('j2').rol).toBe('expulsado');
  });

  it('auditar devuelve el resultado real y no lo traga', async () => {
    const registrar = vi.fn(async () => ({ ok: false, error: 'RLS' }));
    const { Mod } = crearAdmin({ auditoria: { registrar } });
    expect(await Mod._pruebas.auditar('accion', 'jugador', 'j1', {})).toBe(false);
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('auditar devuelve false si el registro lanza una excepción', async () => {
    const { Mod } = crearAdmin({
      auditoria: { registrar: vi.fn(async () => { throw new Error('sin permiso'); }) }
    });
    expect(await Mod._pruebas.auditar('accion', 'jugador', 'j1', {})).toBe(false);
  });

  it('refrescar recarga el contexto antes de repintar aunque se invalidó', async () => {
    const { Mod, GL } = crearAdmin();
    Mod.render = vi.fn();
    await Mod._pruebas.refrescar({ id: 'root' });
    expect(GL.invalidar).toHaveBeenCalledTimes(1);
    expect(GL.cargarContexto).toHaveBeenCalledWith(true);
    expect(Mod.render).toHaveBeenCalledWith({ id: 'root' });
  });

  it('mensajeInvoke extrae el error del cuerpo clonado', async () => {
    const { Mod } = crearAdmin();
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        clone: () => ({
          json: async () => ({ error: 'Sin permisos para crear jugadores' }),
          text: async () => ''
        })
      }
    };
    expect(await Mod._pruebas.mensajeInvoke(error)).toBe('Sin permisos para crear jugadores');
  });

  it('validarTotal acepta 1 y 30 pero rechaza 0, 31 y decimales', () => {
    const { Mod } = crearAdmin();
    expect(Mod._pruebas.validarTotal(1).ok).toBe(true);
    expect(Mod._pruebas.validarTotal(30).ok).toBe(true);
    [0, 31, 1.5, 'abc'].forEach(v => expect(Mod._pruebas.validarTotal(v).ok).toBe(false));
  });
});

describe('FASE 3.16 — KPIs del Centro de control', () => {
  const metricas = crearMetricas();
  const datos = () => ({
    jugadores: [
      { id: 'j1', activo: true, rol: 'jugador', suspendido: true, telefono_e164: '+50512345678' },
      { id: 'j2', activo: false, rol: 'expulsado', suspendido: true },
      { id: 'j3', activo: true, rol: 'jugador', suspendido: false, telefono: '8888-8888' },
      { id: 'j4', activo: true, rol: 'jugador', suspendido: false }
    ],
    partidos: [
      { id: 'p1', jornada: 1, grupo_id: 'g1', estado: 'jugado' },
      { id: 'p2', jornada: 1, grupo_id: 'g2', estado: 'pendiente' },
      { id: 'p3', jornada: 2, grupo_id: 'g1', estado: 'jugado' },
      { id: 'p4', jornada: 2, grupo_id: 'g2', estado: 'jugado' }
    ],
    jornadas: [
      { numero: 1, grupo_id: 'g1', estado: 'abierta' },
      { numero: 2, grupo_id: 'g1', estado: 'cerrada' },
      { numero: 1, grupo_id: 'g2', estado: 'abierta' },
      { numero: 2, grupo_id: 'g2', estado: 'abierta' },
      { numero: 3, grupo_id: 'g1', estado: 'abierta', virtual: true }
    ],
    grupos: [{ id: 'g1', nombre: 'Grupo A' }, { id: 'g2', nombre: 'Grupo B' }],
    miembros: [
      { jugador_id: 'j1', grupo_id: 'g1' },
      { jugador_id: 'j4', grupo_id: 'g2' }
    ]
  });

  it('cuenta inactivos y expulsados del plantel real', () => {
    const r = metricas(datos());
    expect(r.totalJugadores).toBe(4);
    expect(r.activos).toBe(3);
    expect(r.expulsados).toBe(1);
    expect(r.suspendidos).toBe(1);
  });

  it('no cuenta jornadas virtuales como abiertas', () => {
    const r = metricas(datos());
    expect(r.jornadasAbiertas).toBe(3);
    expect(r.jornadasCerradas).toBe(1);
  });

  it('detecta cierres por jornada y grupo, no solo por número', () => {
    const r = metricas(datos());
    expect(r.jornadasParaCerrar).toEqual(['J1 · A', 'J2 · B']);
  });

  it('reconoce teléfono guardado como E.164', () => {
    const r = metricas(datos());
    expect(r.sinTelefono.map(j => j.id)).toEqual(['j4']);
    expect(r.sinGrupo.map(j => j.id)).toEqual(['j3']);
  });

  it('el dashboard no fuerza contexto en el render y bloquea el botón de refresco', () => {
    expect(codigoDashboard.match(/await GL\.cargarContexto\(true\)/g)).toHaveLength(1);
    expect(codigoDashboard).toContain('if (btnRefrescar.disabled) return;');
    expect(codigoDashboard).toContain('Mod._metricas = metricasAdmin');
  });
});

describe('FASE 3.16 — onboarding de administradores', () => {
  it('usa una clave por cuenta y no acumula listeners de teclado', () => {
    window.Auth = { jugador: { id: 'u-admin-316' } };
    const crear = new Function(
      'Auth', 'icono', 'iniciarIconos',
      codigoOnboarding + '\nreturn OnboardingAdmin;'
    );
    const Ob = crear(window.Auth, () => '', () => {});
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');

    Ob.iniciar(true);
    expect(add.mock.calls.filter(c => c[0] === 'keydown')).toHaveLength(1);
    Ob.iniciar(true);
    expect(remove.mock.calls.filter(c => c[0] === 'keydown')).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(remove.mock.calls.filter(c => c[0] === 'keydown')).toHaveLength(2);
    expect(localStorage.getItem('gl_tour_admin_v1::u-admin-316')).toBe('1');
  });

  it('no promete CRUD de equipos en la guía', () => {
    expect(codigoOnboarding).not.toContain('Después crea los grupos');
    expect(codigoOnboarding).toContain('Los equipos se generan con el torneo');
  });
});
