import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');

const codigoIndex = leer('index.html');
const codigoConfig = leer('js/core/config.js');
const codigoGL = leer('js/core/gl.js');
const codigoMenu = leer('js/ui/menu.js');
const codigoNotificaciones = leer('js/modulos/notificaciones.js');
const codigoAuditoria = leer('js/modulos/auditoria.js');
const codigoLibVisual = leer('scripts/lib-verificacion-visual.mjs');
const codigoPlaywright = leer('playwright.config.mjs');

function crearNotificaciones({ filas = [], rpc = vi.fn(async () => ({ error: null })) } = {}) {
  const Modulos = {};
  const ventana = {};
  const cadena = {
    select: vi.fn(() => cadena),
    eq: vi.fn(() => cadena),
    order: vi.fn(async () => ({ data: filas, error: null }))
  };
  const sb = {
    from: vi.fn(() => cadena),
    rpc,
    channel: vi.fn(() => ({ on() { return this; }, subscribe() { return this; } })),
    removeChannel: vi.fn()
  };
  const GL = {
    ctx: { torneo: { id: 't1' }, sanciones: [] },
    torneo: () => ({ id: 't1' }),
    jornadaActual: () => ({ numero: 3 }),
    posicion: () => null,
    esAdmin: () => false,
    notificar: () => {}
  };
  const Auth = { jugador: { id: 'j1' }, usuario: { id: 'j1' } };
  const crear = new Function(
    'sb', 'Auth', 'GL', 'CONFIG', 'Modulos', 'window', 'icono', 'esc', 'iniciarIconos', 'document',
    codigoNotificaciones + '\nreturn Modulos.notificaciones;'
  );
  const Mod = crear(
    sb, Auth, GL, { VERSION: '1.3.4' }, Modulos, ventana,
    () => '', valor => String(valor == null ? '' : valor), () => {}, globalThis.document
  );
  return { Mod, sb, cadena, rpc, GL, Auth };
}

function filaJornada(sobre = {}) {
  return Object.assign({
    id: 'n-legacy',
    jugador_id: 'j1',
    torneo_id: 't1',
    tipo: 'jornada_abierta',
    titulo: 'Jornada 3 abierta',
    cuerpo: 'Tu jornada 3 se encuentra abierta. Consultá tus partidos.',
    link_hash: 'fixture',
    leida: false,
    created_at: '2026-01-01T00:00:00Z'
  }, sobre);
}

describe('FASE 3.19 — deduplicación de notificaciones', () => {
  it('deduplica por atributos estables aunque la fila esté fuera del bloque de 80', async () => {
    const filas = Array.from({ length: 80 }, (_, i) => filaJornada({
      id: 'info-' + i, tipo: 'info', titulo: 'Aviso ' + i, cuerpo: 'Sin relación con jornadas', leida: true
    }));
    filas.push(filaJornada({ leida: true }));
    const { Mod, cadena, rpc } = crearNotificaciones({ filas });

    await Mod._cargar();

    expect(cadena.limit).toBeUndefined();
    expect(Mod._historial).toHaveLength(81);
    expect(Mod._cache).toHaveLength(80);
    expect(Mod._sinLeer).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(Mod._pruebas.clave({
      tipo: 'jornada_abierta', torneo_id: 't1', jugador_id: 'j1', jornada_numero: 3
    })).toBeTruthy();

    await Mod._generarLocales();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('normaliza la jornada sin depender de mayúsculas ni del texto exacto', () => {
    const { Mod } = crearNotificaciones();
    const claveEstructurada = Mod._pruebas.clave({
      tipo: 'jornada_abierta', torneo_id: 't1', jugador_id: 'j1', jornada_numero: 3
    });
    const claveHistorica = Mod._pruebas.clave(filaJornada({
      titulo: 'jornada #3 abierta', cuerpo: 'tu jornada 3 se encuentra abierta'
    }));
    expect(claveHistorica).toBe(claveEstructurada);
  });

  it('dos cargas simultáneas generan una sola inserción en el cliente', async () => {
    const rpc = vi.fn(async () => {
      await new Promise(resolver => setTimeout(resolver, 10));
      return { error: null };
    });
    const { Mod } = crearNotificaciones({ filas: [], rpc });

    await Promise.all([Mod._cargar(), Mod._cargar()]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(Mod._cache).toHaveLength(1);
    expect(Mod._sinLeer).toBe(1);

    await Mod._cargar();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('respeta que una notificación histórica ya fue leída', async () => {
    const { Mod, rpc } = crearNotificaciones({ filas: [filaJornada({ leida: true })] });

    await Mod._cargar();

    expect(rpc).not.toHaveBeenCalled();
    expect(Mod._sinLeer).toBe(0);
  });
});

describe('FASE 3.19 — carga única de módulos', () => {
  it('no vuelve a cargar un módulo ya registrado', async () => {
    const ModulosOriginales = window.Modulos;
    const cargarOriginal = window.GL.cargarScript;
    const modulo = { titulo: 'Ya cargado' };
    window.Modulos = { notificaciones: modulo };
    window.GL.cargarScript = vi.fn(() => {
      throw new Error('No debería cargarse dos veces');
    });

    try {
      await expect(window.GL.modulo('notificaciones')).resolves.toBe(modulo);
      expect(window.GL.cargarScript).not.toHaveBeenCalled();
    } finally {
      window.GL.cargarScript = cargarOriginal;
      window.Modulos = ModulosOriginales;
    }
  });

  it('index.html no incluye como estáticos los módulos diferidos', () => {
    expect(codigoIndex).not.toMatch(
      /<script[^>]+src="js\/modulos\/(notificaciones|auditoria|dashboard-admin)\.js\?v=/
    );
    expect(codigoIndex).toContain('desde GL.modulo(); no se incluyen como scripts estáticos.');
    expect(codigoGL).toContain('if ((window.Modulos || {})[id])');
    expect(codigoGL).toContain('GL._scripts[ruta] = GL._scripts[ruta] || Promise.resolve();');
  });

  it('renueva el cache-busting de lo modificado', () => {
    expect(codigoConfig).toMatch(/VERSION: '1\.3\.[3456]'/);
    expect(codigoIndex).toMatch(/css\/tokens-3\.1\.css\?v=3\.(19|20|23)\.0/);
    expect(codigoIndex).toMatch(/css\/estilos\.css\?v=3\.(19|20|23)\.0/);
    expect(codigoIndex).toMatch(/js\/core\/config\.js\?v=1\.3\.[3456]/);
    expect(codigoIndex).toMatch(/js\/core\/gl\.js\?v=1\.3\.[3456]/);
    expect(codigoIndex).toMatch(/js\/ui\/menu\.js\?v=1\.3\.[3456]/);
  });
});

describe('FASE 3.19 — navegación y redacción', () => {
  it('mantiene las 15 rutas y añade Jornadas al menú "Más"', () => {
    const secciones = codigoMenu.slice(
      codigoMenu.indexOf('const SECCIONES'),
      codigoMenu.indexOf('// Los 4 accesos fijos')
    );
    const ids = [...secciones.matchAll(/\bid:\s*'([^']+)'/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(15);
    expect(ids).toContain('jornadas');

    const mas = codigoMenu.slice(
      codigoMenu.indexOf('const NAV_MOVIL_MAS'),
      codigoMenu.indexOf('function itemNav')
    );
    expect(mas).toContain("id: 'jornadas'");
  });

  it('muestra la campana también a los administradores', () => {
    const inicio = codigoMenu.indexOf('function pintarCampana()');
    const bloque = codigoMenu.slice(inicio, codigoMenu.indexOf('\n}', inicio) + 2);
    expect(bloque).toContain('if (Auth.usuario)');
    expect(bloque).not.toContain('!GL.esAdmin()');
    expect(bloque).toContain('_badgeCargadoPara');
  });

  it('no sobrepromete la cobertura de Auditoría', () => {
    expect(codigoAuditoria).toContain('Eventos disponibles para consulta; cobertura parcial y solo lectura');
    expect(codigoAuditoria).not.toContain('Registro inmutable de todas las operaciones administrativas');
    expect(codigoAuditoria).not.toContain("'Histórico completo'");
  });
});

describe('FASE 3.19 — verificadores portables', () => {
  it('elimina rutas personales, Chrome fijo y Python de los arneses', () => {
    const archivos = [
      'scripts/verificar-fase-3.3-visual.mjs',
      'scripts/verificar-fase-3.4-visual.mjs',
      'scripts/verificar-fase-3.5-visual.mjs',
      'scripts/verificar-fase-3.6-visual.mjs',
      'scripts/verificar-fase-3.7-visual.mjs',
      'scripts/verificar-fase-3.8-visual.mjs',
      'scripts/verificar-fase-3.6-real.mjs',
      'scripts/verificar-fase-3.7-real.mjs',
      'scripts/verificar-fase-3.8-real.mjs',
      'scripts/capturas.mjs',
      'scripts/generar-pdf.mjs',
      'scripts/verificar-fase-3.3-estatico.mjs'
    ];
    for (const archivo of archivos) {
      const codigo = leer(archivo);
      expect(codigo, archivo).not.toMatch(/C:\/Users\/manue|C:\\Users\\manue|C:\\\\Program Files|file:\/\/\/C:/);
      expect(codigo, archivo).not.toContain('python3 -m http.server');
    }
  });

  it('usa raíz desde import.meta.url, navegador configurable y HTTP local', () => {
    expect(codigoLibVisual).toContain('fileURLToPath(import.meta.url)');
    expect(codigoLibVisual).toContain('process.env.CHROME_PATH');
    expect(codigoLibVisual).toContain('127.0.0.1');
    expect(codigoLibVisual).toContain(
      'export const ANCHOS = [320, 375, 390, 768, 1024, 1280, 1366, 1920];'
    );
    expect(codigoPlaywright).toContain('process.env.PLAYWRIGHT_BASE_URL');
    expect(codigoPlaywright).toContain('scripts/servir-local-3.6.mjs');
    expect(codigoPlaywright).not.toContain('python3');
  });

  it('documenta las variables de entorno y el servidor local', () => {
    const readme = leer('README.md');
    const configuracion = leer('docs/CONFIGURACION.md');
    for (const texto of [readme, configuracion]) {
      expect(texto).toContain('CHROME_PATH');
      expect(texto).toContain('PLAYWRIGHT_BROWSERS_PATH');
      expect(texto).toContain('scripts/servir-local-3.6.mjs');
      expect(texto).toContain('GL_CAPTURAS_DIR');
    }
  });
});
