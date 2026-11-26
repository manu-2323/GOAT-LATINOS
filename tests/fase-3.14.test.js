import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const raiz = process.cwd();
const codigoConfig = readFileSync(resolve(raiz, 'js/core/config.js'), 'utf8');
const CONFIG = new Function(codigoConfig + '\nreturn CONFIG;')();
const codigoFixture = readFileSync(resolve(raiz, 'js/modulos/fixture.js'), 'utf8');
const codigoCalendario = readFileSync(resolve(raiz, 'js/modulos/calendario.js'), 'utf8');
const codigoMenu = readFileSync(resolve(raiz, 'js/ui/menu.js'), 'utf8');
const codigoOnboarding = readFileSync(resolve(raiz, 'js/ui/onboarding.js'), 'utf8');
const codigoInicio = readFileSync(resolve(raiz, 'js/modulos/inicio.js'), 'utf8');
const codigoDashboard = readFileSync(resolve(raiz, 'js/modulos/dashboard-admin.js'), 'utf8');

const CLAVES_GL = [
  'ctx', 'cargarContexto', 'esAdmin', 'torneo', 'grupos', 'grupo', 'grupoDeJugador',
  'partidos', 'skeleton', 'vacio', 'error', 'mensaje', 'badge', 'nombreJugador',
  'jugador', 'banderaHTML', 'linkWhatsapp', 'horarioJugador', 'etiquetaZona',
  'partesEnZona', 'momentoZona', 'notaHorarios', 'invalidar', 'fixtureRoundRobin'
];

const TORNEO = { id: 't1', nombre: 'Liga de prueba', temporada: '2026', total_jornadas: 22 };
const GRUPOS = [{ id: 'g1', nombre: 'Grupo A' }, { id: 'g2', nombre: 'Grupo B' }];
const JUGADORES = [
  { id: 'j1', nombre_usuario: 'Alpha', pais: 'NI' },
  { id: 'j2', nombre_usuario: 'Bravo', pais: 'NI' },
  { id: 'j3', nombre_usuario: 'Charlie', pais: 'NI' },
  { id: 'j4', nombre_usuario: 'Delta', pais: 'NI' }
];
const JORNADAS = [
  { numero: 1, grupo_id: 'g1', estado: 'abierta', fecha_inicio: '2026-02-01T12:00:00Z' },
  { numero: 2, grupo_id: 'g1', estado: 'abierta', fecha: null },
  { numero: 1, grupo_id: 'g2', estado: 'abierta', fecha: null }
];
const PARTIDOS = [
  { id: 'p1', jornada: 1, grupo_id: 'g1', local_id: 'j1', visitante_id: 'j2',
    estado: 'jugado', goles_local: 2, goles_visitante: 1 },
  { id: 'p1-duplicado', jornada: 1, grupo_id: 'g1', local_id: 'j1', visitante_id: 'j2',
    estado: 'jugado', goles_local: 2, goles_visitante: 1 },
  { id: 'p2', jornada: 2, grupo_id: 'g1', local_id: 'j3', visitante_id: 'j4',
    estado: 'walkover_local', goles_local: 3, goles_visitante: 0 },
  { id: 'p3', jornada: 2, grupo_id: 'g1', local_id: 'j1', visitante_id: 'j3',
    estado: 'pendiente', goles_local: 0, goles_visitante: 0 },
  { id: 'p4', jornada: 1, grupo_id: 'g2', local_id: 'j1', visitante_id: 'j2',
    estado: 'pendiente' }
];

let reservas;
let llamadasPartidos;

function cargarModulo() {
  const Modulos = {};
  const crear = new Function(
    'CONFIG', 'Modulos', 'GL', 'Auth', 'icono', 'esc', 'iniciarIconos', 'sb',
    codigoFixture + '\nreturn Modulos.fixture;'
  );
  return crear(
    CONFIG, Modulos, window.GL, window.Auth,
    window.icono || (() => ''),
    window.esc || (valor => String(valor == null ? '' : valor)),
    window.iniciarIconos || (() => {}),
    undefined
  );
}

beforeEach(() => {
  reservas = { gl: {}, usuario: window.Auth.usuario, jugador: window.Auth.jugador };
  CLAVES_GL.forEach(clave => { reservas.gl[clave] = window.GL[clave]; });

  llamadasPartidos = [];
  window.Auth.usuario = { id: 'u-jugador' };
  window.Auth.jugador = { id: 'j1' };
  window.GL.ctx = {
    torneo: TORNEO,
    grupos: GRUPOS,
    jugadores: JUGADORES,
    miembros: [],
    jornadas: JORNADAS.map(j => ({ ...j })),
    clasificacion: []
  };
  window.GL.cargarContexto = async () => window.GL.ctx;
  window.GL.esAdmin = () => false;
  window.GL.torneo = () => TORNEO;
  window.GL.grupos = () => GRUPOS.slice();
  window.GL.grupo = id => GRUPOS.find(g => g.id === id) || null;
  window.GL.grupoDeJugador = id => (id === 'j1' ? GRUPOS[0] : null);
  window.GL.partidos = async filtros => {
    llamadasPartidos.push(filtros);
    return PARTIDOS.map(p => ({ ...p }));
  };
});

afterEach(() => {
  CLAVES_GL.forEach(clave => { window.GL[clave] = reservas.gl[clave]; });
  window.Auth.usuario = reservas.usuario;
  window.Auth.jugador = reservas.jugador;
});

describe('FASE 3.14 — Cuadro de partidos', () => {
  it('usa el sinónimo visible y conserva Calendario como módulo distinto', () => {
    const fixture = cargarModulo();
    expect(fixture.titulo).toBe('Cuadro de partidos');
    expect(codigoFixture).toContain('titulo: \'Cuadro de partidos\'');
    expect(codigoFixture).not.toContain('titulo: \'Fixture\'');
    expect(codigoCalendario).toContain('titulo: \'Calendario y programación\'');
    expect(codigoCalendario).toContain('function icsFecha');
    expect(codigoFixture).toContain('data-fx-filtro');
  });

  it('reemplaza “Fixture” en todas las etiquetas visibles revisadas', () => {
    expect(codigoMenu).not.toMatch(/nombre:\s*'Fixture'/);
    expect(codigoMenu).not.toMatch(/corto:\s*'Fixture'/);
    expect(codigoMenu).toContain("nombre: 'Cuadro de partidos'");
    expect(codigoMenu).toContain("corto: 'Cuadro'");
    expect(codigoOnboarding).not.toMatch(/'[^']*Fixture[^']*'/);
    expect(codigoInicio).not.toMatch(/acceso\('fixture',[^)]*'Fixture'/);
    expect(codigoDashboard).not.toContain("'Ver fixture'");
    expect(codigoDashboard).not.toContain("'Partidos pendientes del fixture'");
  });

  it('agrupa por jornada real, elimina duplicados y no muestra otros grupos', async () => {
    const mod = cargarModulo();
    const el = document.createElement('div');

    await mod.render(el);

    expect(llamadasPartidos).toEqual([{ torneo_id: 't1' }]);
    expect(el.querySelectorAll('.fx-partido').length).toBe(3);
    expect(el.textContent).toContain('Cuadro de partidos');
    expect(el.textContent).toContain('Grupo A');
    expect(el.textContent).toContain('Jornada 1');
    expect(el.textContent).toContain('Jornada 2');
    expect(el.textContent).not.toContain('Fixture');
    expect(el.querySelectorAll('.fx-jornada').length).toBe(2);
  });

  it('muestra solo estados reales y marca la jornada sin fecha como sin programación', async () => {
    const mod = cargarModulo();
    const el = document.createElement('div');

    await mod.render(el);

    expect(el.textContent).toContain('Walkover local');
    expect(el.textContent).toContain('Pendiente');
    expect(el.textContent).toContain('Sin programación');
    expect(el.textContent).not.toMatch(/En curso|Cancelado|Suspendido/);
  });

  it('filtra pendientes desde los controles y permite limpiar el filtro', async () => {
    const mod = cargarModulo();
    const el = document.createElement('div');
    await mod.render(el);

    el.querySelector('[data-fx-filtro="pendientes"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(el.querySelectorAll('.fx-partido').length).toBe(1);
    expect(el.textContent).toContain('Charlie');
    expect(el.textContent).not.toContain('Bravo');

    el.querySelector('[data-fx-reset]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(el.querySelectorAll('.fx-partido').length).toBe(3);
  });

  it('respeta el selector de jornada sin duplicar consultas', async () => {
    const mod = cargarModulo();
    const el = document.createElement('div');
    await mod.render(el);

    const selector = el.querySelector('#selector-jornada');
    selector.value = '1';
    selector.dispatchEvent(new window.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(el.querySelectorAll('.fx-jornada').length).toBe(1);
    expect(el.textContent).toContain('Jornada 1');
    expect(llamadasPartidos.length).toBe(2);
  });

  it('muestra la generación solo al administrador', async () => {
    const mod = cargarModulo();
    const publico = document.createElement('div');
    await mod.render(publico);
    expect(publico.querySelector('[data-generar]')).toBeNull();

    window.GL.esAdmin = () => true;
    const admin = document.createElement('div');
    await mod.render(admin);
    expect(admin.querySelector('[data-generar]')).not.toBeNull();
    expect(admin.textContent).toContain('Generar cuadro de partidos');
  });

  it('conserva el round-robin de 12 jugadores sin enfrentamientos repetidos', () => {
    cargarModulo();
    const ids = Array.from({ length: 12 }, (_, i) => 'j' + (i + 1));
    const rondas = window.GL.fixtureRoundRobin(ids);
    const pares = rondas.flat().map(([a, b]) => [a, b].sort().join('|'));

    expect(rondas.length).toBe(11);
    expect(rondas.every(r => r.length === 6)).toBe(true);
    expect(pares.length).toBe(66);
    expect(new Set(pares).size).toBe(66);
  });
});
