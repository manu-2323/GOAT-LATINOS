import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const raiz = process.cwd();
const codigo = readFileSync(resolve(raiz, 'js/modulos/inicio.js'), 'utf8');
const codigoConfig = readFileSync(resolve(raiz, 'js/core/config.js'), 'utf8');
const CONFIG = new Function(codigoConfig + '\nreturn CONFIG;')();

const CLAVES_GL = [
  'cargarContexto', 'esAdmin', 'asegurarAdmin', 'partidos', 'ctx', 'torneo',
  'jugador', 'jugadoresSinGrupo', 'grupoDeJugador', 'clasificacion', 'posicion',
  'resultado', 'avatarHTML', 'badge', 'banderaHTML', 'nombrePais',
  'nombreJugador', 'letraGrupo', 'partesEnZona', 'fechaLarga', 'signo'
];

let reservas;

function cargarModulo() {
  window.Modulos = window.Modulos || {};
  /* El módulo es un IIFE vanilla que espera globals del navegador. En jsdom
     se inyectan explícitamente para no depender del orden de window.eval(). */
  const crear = new Function(
    'CONFIG', 'Modulos', 'GL', 'Auth', 'icono', 'esc', 'iniciarIconos',
    codigo + '\nreturn Modulos.inicio;'
  );
  return crear(
    CONFIG, window.Modulos, window.GL, window.Auth,
    window.icono || (() => ''),
    window.esc || (valor => String(valor == null ? '' : valor)),
    window.iniciarIconos || (() => {})
  );
}

beforeEach(() => {
  reservas = { gl: {}, usuario: window.Auth.usuario, jugador: window.Auth.jugador };
  CLAVES_GL.forEach(clave => { reservas.gl[clave] = window.GL[clave]; });
  window.GL.cargarContexto = async () => {};
  window.GL.esAdmin = () => false;
  window.GL.asegurarAdmin = async () => true;
});

afterEach(() => {
  CLAVES_GL.forEach(clave => { window.GL[clave] = reservas.gl[clave]; });
  window.Auth.usuario = reservas.usuario;
  window.Auth.jugador = reservas.jugador;
});

describe('Módulo Inicio — panel principal', () => {
  it('se registra y expone render', () => {
    const mod = cargarModulo();
    expect(mod).toBeTruthy();
    expect(typeof mod.render).toBe('function');
  });

  it('dibuja KPIs y alertas reales en el panel de administrador', async () => {
    const mod = cargarModulo();
    const manana = new Date(Date.now() + 86400000).toISOString();
    window.Auth.usuario = { id: 'u-admin' };
    window.Auth.jugador = { id: 'j-admin', rol: 'admin' };
    window.GL.esAdmin = () => true;
    window.GL.partidos = async () => [
      { id: 'p1', jornada: 1, local_id: 'j1', visitante_id: 'j2', estado: 'jugado',
        goles_local: 2, goles_visitante: 1, updated_at: manana },
      { id: 'p2', jornada: 2, local_id: 'j1', visitante_id: 'j2', estado: 'pendiente' }
    ];
    window.GL.ctx = {
      torneo: { id: 't1', nombre: 'Liga de prueba', temporada: '2026' },
      jugadores: [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }],
      grupos: [{ id: 'g1', nombre: 'Grupo A' }],
      miembros: [{ jugador_id: 'j1', grupo_id: 'g1' }, { jugador_id: 'j2', grupo_id: 'g1' }],
      jornadas: [
        { numero: 1, grupo_id: 'g1', estado: 'cerrada', fecha_inicio: '2026-01-01T12:00:00Z' },
        { numero: 2, grupo_id: 'g1', estado: 'abierta', fecha_inicio: manana }
      ],
      clasificacion: []
    };
    window.GL.jugadoresSinGrupo = () => [{ id: 'j3' }];

    const el = document.createElement('div');
    await mod.render(el);
    const texto = el.textContent;
    expect(texto).toContain('Jugadores registrados');
    expect(texto).toContain('Jornadas pendientes');
    expect(texto).toContain('sin grupo asignado');
    expect(texto).toContain('Próximos encuentros');
    expect(texto).toContain('Resultados recientes');
  });

  it('muestra partidos y estadísticas del jugador vinculado', async () => {
    const mod = cargarModulo();
    const manana = new Date(Date.now() + 86400000).toISOString();
    window.Auth.usuario = { id: 'u-jugador' };
    window.Auth.jugador = { id: 'j1' };
    window.GL.partidos = async () => [
      { id: 'p1', jornada: 1, local_id: 'j1', visitante_id: 'j2', estado: 'jugado',
        goles_local: 2, goles_visitante: 1, updated_at: '2026-01-01T12:00:00Z' },
      { id: 'p2', jornada: 2, local_id: 'j2', visitante_id: 'j1', estado: 'pendiente' }
    ];
    window.GL.ctx = {
      torneo: { id: 't1', nombre: 'Liga de prueba', temporada: '2026' },
      jugadores: [
        { id: 'j1', nombre_usuario: 'YO', pais: 'NI' },
        { id: 'j2', nombre_usuario: 'RIVAL', pais: 'NI' }
      ],
      grupos: [{ id: 'g1', nombre: 'Grupo A' }],
      miembros: [{ jugador_id: 'j1', grupo_id: 'g1' }],
      jornadas: [
        { numero: 1, grupo_id: 'g1', estado: 'cerrada', fecha: '2026-01-01' },
        { numero: 2, grupo_id: 'g1', estado: 'cerrada', fecha_inicio: manana }
      ],
      clasificacion: [{
        jugador_id: 'j1', grupo_id: 'g1', pj: 1, pg: 1, pe: 0, pp: 0,
        gf: 2, gc: 1, dif: 1, pts: 3
      }]
    };
    window.GL.grupoDeJugador = () => window.GL.ctx.grupos[0];
    window.GL.posicion = () => 1;

    const el = document.createElement('div');
    await mod.render(el);
    const texto = el.textContent;
    expect(texto).toContain('Último partido');
    expect(texto).toContain('Próximo partido');
    expect(texto).toContain('Mis estadísticas');
    expect(texto).toContain('Victoria');
    /* La jornada está cerrada, pero tiene fecha futura: sigue siendo próxima. */
    expect(texto).toContain('Programado');
    expect(texto).toContain('RIVAL');
    expect(el.querySelector('a[href="#tabla"]')).not.toBeNull();
  });

  it('explica el estado vacío cuando la cuenta no tiene jugador vinculado', async () => {
    const mod = cargarModulo();
    window.Auth.usuario = { id: 'u-sin-vinculo' };
    window.Auth.jugador = null;
    window.GL.ctx = {
      torneo: null, jugadores: [], grupos: [], miembros: [], jornadas: [], clasificacion: []
    };

    const el = document.createElement('div');
    await mod.render(el);
    expect(el.textContent).toContain('Tu cuenta todavía no tiene un jugador vinculado.');
    expect(el.querySelector('a[href="#perfil"]')).not.toBeNull();
  });

  it('deja KPIs en cero y estados vacíos cuando el torneo no tiene datos', async () => {
    const mod = cargarModulo();
    window.Auth.usuario = { id: 'u-admin' };
    window.Auth.jugador = { id: 'j-admin', rol: 'admin' };
    window.GL.esAdmin = () => true;
    window.GL.partidos = async () => [];
    window.GL.ctx = {
      torneo: { id: 't1', nombre: 'Liga vacía', temporada: '2026' },
      jugadores: [], grupos: [], miembros: [], jornadas: [], clasificacion: []
    };
    window.GL.jugadoresSinGrupo = () => [];

    const el = document.createElement('div');
    await mod.render(el);
    const texto = el.textContent;
    expect(texto).toContain('Jugadores registrados');
    expect(texto).toContain('Partidos disputados');
    expect(texto).toContain('Jornadas pendientes');
    expect(texto).toContain('Sin actividad registrada');
    expect(texto).toContain('No hay alertas pendientes.');
    expect(texto).toContain('No hay encuentros futuros con fecha.');
  });

  it('invita a crear un torneo cuando no hay torneo activo', async () => {
    const mod = cargarModulo();
    window.Auth.usuario = { id: 'u-admin' };
    window.Auth.jugador = { id: 'j-admin', rol: 'admin' };
    window.GL.esAdmin = () => true;
    window.GL.partidos = async () => { throw new Error('no debe consultarse sin torneo'); };
    window.GL.ctx = {
      torneo: null, jugadores: [], grupos: [], miembros: [], jornadas: [], clasificacion: []
    };

    const el = document.createElement('div');
    await mod.render(el);
    expect(el.textContent).toContain('No hay torneo activo.');
    expect(el.querySelector('a[href="#administracion"]')).not.toBeNull();
  });
});
