import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const raiz = process.cwd();
const leer = ruta => readFileSync(resolve(raiz, ruta), 'utf8');
const codigoEST = leer('js/core/estadisticas.js');
const codigoStats = leer('js/modulos/stats-jornada.js');
const codigoExportar = leer('js/modulos/exportar-png.js');
const codigoInicio = leer('js/modulos/inicio.js');
const codigoConfig = leer('js/core/config.js');
const codigoCSS = leer('css/estadisticas-avanzadas.css');
const CONFIG = new Function(codigoConfig + '\nreturn CONFIG;')();

function cargarEST() {
  window.eval(codigoEST);
  return window.EST;
}

function partido(id, grupoId, jornada, localId, visitanteId, estado, golesLocal, golesVisitante, stats = {}) {
  return Object.assign({
    id,
    torneo_id: 't1',
    grupo_id: grupoId,
    jornada,
    local_id: localId,
    visitante_id: visitanteId,
    estado,
    goles_local: golesLocal,
    goles_visitante: golesVisitante,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z'
  }, stats);
}

const JUGADORES = [
  { id: 'j1', nombre_usuario: 'Jugador Uno', pais: 'NI' },
  { id: 'j2', nombre_usuario: 'Jugador Dos', pais: 'AR' },
  { id: 'j3', nombre_usuario: 'Jugador Tres', pais: 'MX' }
];

const CLAVES_GL = [
  'cargarContexto', 'torneo', 'grupos', 'grupo', 'letraGrupo', 'jugadores',
  'clasificacion', 'partidos', 'ctx', 'skeleton', 'vacio', 'error', 'mensaje',
  'badge', 'iniciales', 'nombreJugador', 'signo', 'exportarInformeEstadisticas',
  'avatarHTML', 'banderaHTML', 'nombrePais', 'partesEnZona', 'fechaLarga',
  'grupoDeJugador', 'posicion', 'resultado', 'esAdmin', 'asegurarAdmin',
  'jugadoresSinGrupo', 'notificar'
];

let reservas;

beforeEach(() => {
  cargarEST();
  reservas = {};
  CLAVES_GL.forEach(clave => { reservas[clave] = window.GL[clave]; });
  window.Modulos = window.Modulos || {};
});

afterEach(() => {
  CLAVES_GL.forEach(clave => { window.GL[clave] = reservas[clave]; });
});

describe('EST — informe avanzado por grupo/jornada', () => {
  it('filtra grupo, jornada, pendientes y duplicados; separa goles reales y reglamentarios', () => {
    const partidos = [
      partido('p1', 'gA', 7, 'j1', 'j2', 'jugado', 3, 1, {
        posesion_local: 60, posesion_visitante: 40,
        pase_local: 80, pase_visitante: 70
      }),
      partido('p1-duplicado', 'gA', 7, 'j1', 'j2', 'jugado', 3, 1),
      partido('p2', 'gA', 7, 'j2', 'j1', 'walkover_visitante', 0, 3),
      partido('p3', 'gA', 7, 'j1', 'j3', 'pendiente', 0, 0),
      partido('p4', 'gA', 7, 'j2', 'j3', 'jornada_libre', 3, 0),
      partido('p5', 'gB', 7, 'j1', 'j2', 'jugado', 9, 0),
      partido('p6', 'gA', 8, 'j1', 'j2', 'jugado', 1, 1)
    ];
    const informe = window.EST.calcularInformeJornada(partidos, {
      torneoId: 't1', grupoId: 'gA', jornada: 7, jugadores: JUGADORES
    });

    expect(informe.resumen.partidos).toBe(2);
    expect(informe.reales).toHaveLength(1);
    expect(informe.administrativos).toHaveLength(1);
    expect(informe.pendientes).toHaveLength(1);
    expect(informe.resumen.golesReales).toBe(4);
    expect(informe.resumen.golesReglamentarios).toBe(7);

    const uno = informe.jugadores.find(j => j.id === 'j1');
    const dos = informe.jugadores.find(j => j.id === 'j2');
    expect(uno.gf).toBe(3);
    expect(uno.gc).toBe(1);
    expect(uno.gfReglamentario).toBe(6);
    expect(dos.gfReglamentario).toBe(1);
    expect(uno.difReglamentario).toBe(5);
    expect(dos.difReglamentario).toBe(-5);
    expect(informe.partidoDestacado.goles).toBe(4);
    expect(informe.partidoDestacado.marcador).toBe('3 - 1');
    expect(informe.jugadorDestacado.id).toBe('j1');
  });

  it('excluye partidos anulados, marcados como anulados o con estado desconocido', () => {
    const partidos = [
      partido('n1', 'gA', 7, 'j1', 'j2', 'anulado', 9, 0),
      Object.assign(partido('n2', 'gA', 7, 'j2', 'j3', 'jugado', 4, 0), { anulado: true }),
      partido('n3', 'gA', 7, 'j1', 'j3', 'borrador', 2, 0)
    ];
    const informe = window.EST.calcularInformeJornada(partidos, {
      grupoId: 'gA', jornada: 7, jugadores: JUGADORES
    });
    expect(informe.resumen.partidos).toBe(0);
    expect(informe.reales).toHaveLength(0);
    expect(informe.administrativos).toHaveLength(0);
    expect(informe.tarjetas.every(t => t.filas.length === 0)).toBe(true);
  });

  it('devuelve un informe vacío y estable cuando no hay resultados', () => {
    const informe = window.EST.calcularInformeJornada([], {
      torneoId: 't1', grupoId: 'gB', jornada: 4, jugadores: JUGADORES
    });
    expect(informe.jugadores).toHaveLength(3);
    expect(informe.tarjetas.every(t => t.filas.length === 0)).toBe(true);
    expect(informe.partidoDestacado).toBeNull();
    expect(informe.jugadorDestacado).toBeNull();
    expect(informe.resumen.partidos).toBe(0);
    expect(informe.resumen.golesReales).toBe(0);
  });

  it('excluye expulsiones del rendimiento pero las conserva en el marcador reglamentario', () => {
    const partidos = [
      partido('e1', 'gA', 7, 'j1', 'j2', 'expulsion_local', 1, 0),
      partido('e2', 'gA', 7, 'j2', 'j3', 'expulsion_visitante', 0, 1)
    ];
    const informe = window.EST.calcularInformeJornada(partidos, {
      grupoId: 'gA', jornada: 7, jugadores: JUGADORES
    });
    expect(informe.reales).toHaveLength(0);
    expect(informe.administrativos).toHaveLength(2);
    expect(informe.resumen.golesReales).toBe(0);
    expect(informe.resumen.golesReglamentarios).toBe(2);
    expect(informe.jugadores.find(j => j.id === 'j2').vallas).toBe(0);
    expect(informe.partidoDestacado).toBeNull();
  });

  it('no inventa eventos individuales que no existen en la fuente', () => {
    const informe = window.EST.calcularInformeJornada([
      partido('s1', 'gA', 7, 'j1', 'j2', 'jugado', 2, 2, {
        tiros_local: 10, tiros_visitante: 8,
        tiros_puerta_local: 5, tiros_puerta_visitante: 4
      })
    ], { grupoId: 'gA', jornada: 7, jugadores: JUGADORES });
    const texto = JSON.stringify(informe).toLowerCase();
    expect(texto).not.toContain('sustitucion');
    expect(texto).not.toContain('minuto');
    expect(texto).not.toContain('amarilla');
    expect(texto).not.toContain('sancion');
  });

  it('atribuye el rendimiento al jugador que efectivamente jugó y respeta la baja local', () => {
    const jugadores = JUGADORES.concat([{ id: 'j4', nombre_usuario: 'Reemplazo & <rápido>', pais: 'MX' }]);
    const partidos = [
      partido('s1', 'gA', 7, 'j4', 'j2', 'jugado', 2, 1, {
        pase_local: 75, pase_visitante: 60,
        posesion_local: 54, posesion_visitante: 46
      }),
      partido('b1', 'gA', 7, 'j1', 'j2', 'walkover_local', 0, 3)
    ];
    const informe = window.EST.calcularInformeJornada(partidos, {
      grupoId: 'gA', jornada: 7, jugadores, estadoJornada: 'cerrada'
    });
    const reemplazo = informe.jugadores.find(j => j.id === 'j4');
    const baja = informe.jugadores.find(j => j.id === 'j1');

    expect(reemplazo.gf).toBe(2);
    expect(reemplazo.gc).toBe(1);
    expect(reemplazo.paseN).toBe(1);
    expect(reemplazo.posN).toBe(1);
    expect(baja.pj).toBe(0);
    expect(baja.gf).toBe(0);
    expect(baja.gfReglamentario).toBe(3);
    expect(informe.resumen.golesReales).toBe(3);
    expect(informe.resumen.golesReglamentarios).toBe(6);
    expect(informe.jugadorDestacado.id).toBe('j4');
  });

  it('respeta empates y dobles ausencias sin inventar vallas ni goles reales', () => {
    const partidos = [
      partido('emp', 'gA', 7, 'j1', 'j2', 'jugado', 1, 1),
      partido('da', 'gA', 7, 'j2', 'j3', 'doble_ausencia', 0, 0)
    ];
    const informe = window.EST.calcularInformeJornada(partidos, {
      grupoId: 'gA', jornada: 7, jugadores: JUGADORES
    });
    const uno = informe.jugadores.find(j => j.id === 'j1');
    const dos = informe.jugadores.find(j => j.id === 'j2');
    expect(uno.puntosReglamentarios).toBe(1);
    expect(dos.puntosReglamentarios).toBe(2);
    expect(uno.vallas).toBe(0);
    expect(dos.vallas).toBe(0);
    expect(informe.resumen.golesReales).toBe(2);
    expect(informe.resumen.golesReglamentarios).toBe(2);
    expect(informe.administrativos.map(p => p.estado)).toEqual(['doble_ausencia']);
  });

  it('respeta posiciones compartidas por igualdad exacta de pts, dif y gf', () => {
    const filas = [
      { jugador_id: 'j1', nombre_usuario: 'Uno', pts: 9, dif: 5, gf: 7, gc: 2, pj: 3 },
      { jugador_id: 'j2', nombre_usuario: 'Dos', pts: 9, dif: 5, gf: 7, gc: 2, pj: 3 },
      { jugador_id: 'j3', nombre_usuario: 'Tres', pts: 9, dif: 5, gf: 7, gc: 2, pj: 3 },
      { jugador_id: 'j4', nombre_usuario: 'Cuatro', pts: 6, dif: 2, gf: 5, gc: 3, pj: 3 }
    ];
    const ordenadas = window.EST.posicionesCompartidas(filas);
    expect(ordenadas.slice(0, 3).map(f => f.posicion)).toEqual([1, 1, 1]);
    expect(ordenadas.slice(0, 3).every(f => f.compartida)).toBe(true);
    expect(ordenadas[3].posicion).toBe(4);
    expect(ordenadas[3].compartida).toBe(false);
  });

  it('mantiene J7 estable al cerrar J8 y no duplica al reprocesar', () => {
    const j7 = [
      partido('j7a', 'gA', 7, 'j1', 'j2', 'jugado', 2, 0),
      partido('j7b', 'gA', 7, 'j2', 'j3', 'walkover_visitante', 0, 3)
    ];
    const jornadas = [
      { numero: 7, grupo_id: 'gA', estado: 'cerrada' },
      { numero: 8, grupo_id: 'gA', estado: 'abierta' }
    ];
    const opciones = { torneoId: 't1', grupoId: 'gA', jornadas, jugadores: JUGADORES };
    const antes = window.EST.calcularHistorialJornadas(j7, opciones).find(h => h.numero === 7);
    const historialDespues = window.EST.calcularHistorialJornadas(
      j7.concat([partido('j8a', 'gA', 8, 'j1', 'j3', 'jugado', 5, 4)]),
      Object.assign({}, opciones, {
        jornadas: jornadas.map(j => j.numero === 8
          ? Object.assign({}, j, { estado: 'cerrada' }) : j)
      })
    );
    const despues = historialDespues.find(h => h.numero === 7);
    expect(despues).toEqual(antes);
    expect(historialDespues.find(h => h.numero === 8).partidos).toBe(1);
    expect(despues.partidos).toBe(2);

    const informe = window.EST.calcularInformeJornada(j7, { grupoId: 'gA', jornada: 7 });
    const reprocesado = window.EST.calcularInformeJornada(j7, { grupoId: 'gA', jornada: 7 });
    expect(reprocesado.partidos).toHaveLength(informe.partidos.length);
    expect(reprocesado.resumen).toEqual(informe.resumen);
  });
});

function cargarModuloStats() {
  const crear = new Function(
    'CONFIG', 'Modulos', 'GL', 'EST', 'icono', 'esc', 'iniciarIconos', 'console',
    codigoStats + '\nreturn Modulos["stats-jornada"];'
  );
  return crear(
    CONFIG, window.Modulos, window.GL, window.EST,
    () => '', valor => String(valor === null || valor === undefined ? '' : valor),
    () => {}, console
  );
}

function prepararVista() {
  const partidos = [
    partido('a7', 'gA', 7, 'j1', 'j2', 'jugado', 2, 1, {
      posesion_local: 55, posesion_visitante: 45, pase_local: 81, pase_visitante: 76
    }),
    partido('a7admin', 'gA', 7, 'j2', 'j3', 'walkover_visitante', 0, 3),
    partido('a8', 'gA', 8, 'j1', 'j3', 'jugado', 4, 4),
    partido('b7', 'gB', 7, 'j1', 'j2', 'jugado', 1, 0)
  ];
  window.GL.cargarContexto = async () => {};
  window.GL.torneo = () => ({ id: 't1', nombre: 'Liga de prueba', temporada: '2026', total_jornadas: 8 });
  window.GL.grupos = () => [{ id: 'gA', nombre: 'Grupo A' }, { id: 'gB', nombre: 'Grupo B' }];
  window.GL.grupo = id => ({ gA: { id: 'gA', nombre: 'Grupo A' }, gB: { id: 'gB', nombre: 'Grupo B' } }[id] || null);
  window.GL.jugadores = () => JUGADORES;
  window.GL.clasificacion = () => [
    { jugador_id: 'j1', grupo_id: 'gA', nombre_usuario: 'Jugador Uno', pj: 2, gf: 6, gc: 5, dif: 1, pts: 4 },
    { jugador_id: 'j2', grupo_id: 'gA', nombre_usuario: 'Jugador Dos', pj: 2, gf: 4, gc: 5, dif: -1, pts: 1 }
  ];
  window.GL.partidos = async () => partidos;
  window.GL.ctx = {
    jornadas: [
      { numero: 7, grupo_id: 'gA', estado: 'cerrada' },
      { numero: 8, grupo_id: 'gA', estado: 'cerrada' },
      { numero: 7, grupo_id: 'gB', estado: 'cerrada' }
    ]
  };
  window.GL.exportarInformeEstadisticas = vi.fn();
  return partidos;
}

const espera = () => new Promise(res => setTimeout(res, 0));

describe('Módulo stats-jornada — vista y exportación', () => {
  it('renderiza tarjetas, destacados, histórico y tabla con la jornada cerrada del grupo', async () => {
    prepararVista();
    const mod = cargarModuloStats();
    mod.grupoId = null;
    mod.jornada = 7;
    const el = document.createElement('div');
    await mod.render(el);
    const texto = el.textContent;
    expect(texto).toContain('EXPORTAR INFORME PNG');
    expect(texto).toContain('Resumen · Grupo A · J7');
    expect(texto).toContain('Más goles reales');
    expect(texto).toContain('Partido destacado');
    expect(texto).toContain('Jugador destacado');
    expect(texto).toContain('Tabla de posiciones');
    expect(texto).toContain('Histórico');
    expect(texto).toContain('Última jornada cerrada del grupo: J8');
    expect(el.querySelectorAll('.ea-historial-btn')).toHaveLength(2);
    expect(el.querySelectorAll('.ea-metrica')).toHaveLength(6);
  });

  it('cambia de jornada y de grupo sin duplicar tarjetas ni contaminar datos', async () => {
    prepararVista();
    const mod = cargarModuloStats();
    mod.grupoId = null;
    mod.jornada = 7;
    const el = document.createElement('div');
    await mod.render(el);

    el.querySelector('[data-jornada="8"]').click();
    await espera();
    expect(el.textContent).toContain('Resumen · Grupo A · J8');
    expect(el.querySelectorAll('.ea-metrica')).toHaveLength(6);

    el.querySelector('[data-grupo="gB"]').click();
    await espera();
    expect(el.textContent).toContain('Resumen · Grupo B · J7');
    expect(el.textContent).not.toContain('Resumen · Grupo A · J8');
    expect(el.querySelectorAll('.ea-metrica')).toHaveLength(6);
  });

  it('envía el informe ya calculado al exportador con nombre de archivo válido', async () => {
    prepararVista();
    const mod = cargarModuloStats();
    mod.grupoId = null;
    mod.jornada = 7;
    const el = document.createElement('div');
    await mod.render(el);
    const informe = mod._ultimoInforme;
    expect(informe.jornada).toBe(7);
    expect(mod._ultimoNombre).toBe('GOAT-LATINOS_Estadisticas_Grupo-A_Jornada-7');

    el.querySelector('[data-export]').click();
    await espera();
    expect(window.GL.exportarInformeEstadisticas).toHaveBeenCalledTimes(1);
    expect(window.GL.exportarInformeEstadisticas.mock.calls[0][0]).toBe(informe);
    expect(window.GL.exportarInformeEstadisticas.mock.calls[0][1]).toContain('Grupo-A_Jornada-7');
  });
});

function cargarModuloExportar() {
  const crear = new Function(
    'Modulos', 'GL', 'CONFIG', 'esc', 'iniciarIconos', 'console',
    codigoExportar + '\nreturn Modulos["exportar-png"];'
  );
  const escapar = valor => String(valor === null || valor === undefined ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return crear(
    window.Modulos, window.GL, CONFIG,
    escapar,
    () => {}, console
  );
}

describe('Exportación PNG — informe avanzado', () => {
  it('compone un informe propio de 1080 × 1350 sin controles y escapa nombres largos', () => {
    const mod = cargarModuloExportar();
    const jugadores = [
      { id: 'j1', nombre_usuario: 'Jugador con nombre larguísimo & <marcado>', pais: 'ARG' },
      { id: 'j2', nombre_usuario: 'Jugador Dos', pais: 'ARG' }
    ];
    const informe = window.EST.calcularInformeJornada([
      partido('x', 'gA', 7, 'j1', 'j2', 'jugado', 3, 0, {
        pase_local: 88, pase_visitante: 70, posesion_local: 62, posesion_visitante: 38
      })
    ], { grupoId: 'gA', jornada: 7, jugadores, estadoJornada: 'cerrada' });
    const html = mod._htmlInforme(informe, {
      letraGrupo: 'A', torneoNombre: 'Liga con nombre larguísimo & especial'
    });
    expect(html).toContain('width:1080px;height:1350px');
    expect(html).toContain("font-family:'Inter'");
    expect(html).toContain('#E11D35');
    expect(html).toContain('Estadísticas · Grupo A');
    expect(html).toContain('Jugador con nombre larguísimo &amp; &lt;marcado&gt;');
    expect(html).not.toContain('<marcado>');
    expect(html).toContain('Sin país registrado');
    expect(mod._paisPlano('NI')).toBe('NI');
    expect(mod._paisPlano('ARG')).toBe('Sin país registrado');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('GL.ctx.partidos');
    expect(mod._nombreSeguro('Grupo B/J7: prueba')).toBe('Grupo B-J7- prueba');
  });

  it('incluye adaptación móvil, nombres largos y sin emojis decorativos en el CSS', () => {
    expect(codigoCSS).toContain('@media (max-width: 720px)');
    expect(codigoCSS).toContain('.ea-nombre-largo');
    expect(codigoCSS).toContain('word-break: break-word');
    expect(codigoCSS).not.toContain('font-family: emoji');
    expect(codigoStats).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(codigoCSS).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

function cargarModuloInicio() {
  const crear = new Function(
    'CONFIG', 'Modulos', 'GL', 'Auth', 'icono', 'esc', 'iniciarIconos',
    codigoInicio + '\nreturn Modulos.inicio;'
  );
  return crear(
    CONFIG, window.Modulos, window.GL, window.Auth,
    () => '', valor => String(valor === null || valor === undefined ? '' : valor),
    () => {}
  );
}

describe('Inicio — resumen compacto de jornada', () => {
  it('muestra el resumen de la última jornada cerrada sin rediseñar el dashboard', async () => {
    const usuarioPrevio = window.Auth.usuario;
    const jugadorPrevio = window.Auth.jugador;
    window.Auth.usuario = { id: 'u-jugador' };
    window.Auth.jugador = { id: 'j1' };
    window.GL.cargarContexto = async () => {};
    window.GL.esAdmin = () => false;
    window.GL.asegurarAdmin = async () => true;
    window.GL.partidos = async () => [partido('r1', 'gA', 7, 'j1', 'j2', 'jugado', 3, 1)];
    window.GL.ctx = {
      torneo: { id: 't1', nombre: 'Liga', temporada: '2026' },
      jugadores: JUGADORES,
      grupos: [{ id: 'gA', nombre: 'Grupo A' }],
      miembros: [{ jugador_id: 'j1', grupo_id: 'gA' }],
      jornadas: [{ numero: 7, grupo_id: 'gA', estado: 'cerrada' }],
      clasificacion: []
    };
    window.GL.grupoDeJugador = () => window.GL.ctx.grupos[0];
    window.GL.posicion = () => 1;
    window.GL.jugadores = () => JUGADORES;

    const mod = cargarModuloInicio();
    const el = document.createElement('div');
    await mod.render(el);
    expect(el.textContent).toContain('Resumen de jornada · Grupo A');
    expect(el.textContent).toContain('DG tabla (líder)');
    expect(el.querySelector('a[href="#estadisticas"]')).not.toBeNull();

    window.Auth.usuario = usuarioPrevio;
    window.Auth.jugador = jugadorPrevio;
  });
});
