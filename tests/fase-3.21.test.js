import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');
const codigoResultados = leer('js/modulos/resultados.js');
const codigoConfig = leer('js/core/config.js');
const codigoIndex = leer('index.html');
const CONFIG = new Function(codigoConfig + '\nreturn CONFIG;')();
const ESTADOS_PARTIDO = new Function(codigoConfig + '\nreturn ESTADOS_PARTIDO;')();

function partido(id, jornada, grupo_id, estado = 'pendiente', marcador = null) {
  return {
    id, jornada, grupo_id, torneo_id: 't1',
    local_id: grupo_id === 'gA' ? 'j1' : 'j3',
    visitante_id: grupo_id === 'gA' ? 'j2' : 'j4',
    estado,
    goles_local: marcador ? marcador[0] : null,
    goles_visitante: marcador ? marcador[1] : null,
    captura_url: 'https://ejemplo.invalid/captura.jpg'
  };
}

function crearMod({ jornadas = [], partidos = [], admin = true, total = 4 } = {}) {
  const GL = {
    ctx: {
      torneo: { id: 't1', total_jornadas: total },
      jornadas,
      grupos: [{ id: 'gA', nombre: 'Grupo A' }, { id: 'gB', nombre: 'Grupo B' }],
      jugadores: [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }, { id: 'j4' }]
    },
    esAdmin: () => admin,
    torneo: () => GL.ctx.torneo,
    torneoId: () => 't1',
    partidos: vi.fn(async () => partidos.map(p => ({ ...p }))),
    notificar: vi.fn(),
    confirmar: vi.fn(async () => true),
    mensaje: e => String((e && e.message) || e),
    nombreJugador: id => id,
    resultado: p => {
      const estado = String((p && p.estado) || 'pendiente');
      const reglas = {
        walkover_local: [3, 0, 'Walkover local'],
        walkover_visitante: [0, 3, 'Walkover visitante'],
        doble_ausencia: [0, 0, 'Doble ausencia']
      };
      const [gf, gc, etiqueta] = reglas[estado] ||
        [Number(p && p.goles_local) || 0, Number(p && p.goles_visitante) || 0, estado];
      return { gf, gc, texto: gf + ' - ' + gc, estado: { label: etiqueta } };
    },
    grupo: id => GL.ctx.grupos.find(g => g.id === id) || null,
    letraGrupo: g => String((g && g.nombre) || '').replace(/^Grupo\s*/, ''),
    auditoria: { registrar: vi.fn(async () => {}) },
    cargarContexto: vi.fn(async () => {}),
    invalidar: vi.fn()
  };
  const Modulos = {};
  const crear = new Function(
    'CONFIG', 'ESTADOS_PARTIDO', 'Modulos', 'GL', 'Auth', 'icono', 'esc',
    'iniciarIconos', 'sb', 'document',
    codigoResultados + '\nreturn Modulos.resultados;'
  );
  const sb = {
    rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-admin' } } })) },
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: () => ({ data: { publicUrl: 'https://ejemplo.invalid/nueva.jpg' } })
      })
    }
  };
  const Mod = crear(CONFIG, ESTADOS_PARTIDO, Modulos, GL, { usuario: { id: 'u-admin' } },
    () => '', valor => String(valor === null || valor === undefined ? '' : valor), () => {}, sb, document);
  Mod.render = vi.fn(async () => {});
  return { Mod, GL, sb };
}

function crearPanel({ local = '2', visita = '1', estado = 'jugado', motivo = null, stats = {} } = {}) {
  const el = document.createElement('div');
  el.innerHTML =
    '<input id="g-local" value="' + local + '">' +
    '<input id="g-visita" value="' + visita + '">' +
    '<select id="estado"><option value="' + estado + '" selected>' + estado + '</option></select>' +
    (motivo !== null ? '<input id="motivo" value="' + motivo + '">' : '') +
    '<button id="guardar" type="button">Confirmar y Guardar</button>' +
    Object.entries(stats).map(([k, v]) => '<input id="' + k + '" value="' + v + '">').join('');
  document.body.appendChild(el);
  return el;
}

function avisos(GL, tipo) {
  return GL.notificar.mock.calls.filter(c => c[1] === tipo).map(c => c[0]);
}

const abierta = (numero, grupo_id) => ({ numero, grupo_id, estado: 'abierta', fecha: null });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FASE 3.21 — contexto de jornada y grupo', () => {
  it('1. aplica el grupo seleccionado a los datos, no sólo a las tarjetas', () => {
    const pA = partido('pA', 1, 'gA');
    const pB = partido('pB', 1, 'gB');
    const { Mod } = crearMod({ jornadas: [abierta(1, 'gA'), abierta(1, 'gB')], partidos: [pA, pB] });
    Mod.partidos = [pA, pB];
    Mod.grupo = 'gA';

    expect(Mod.partidosDeJornada(1, 'gA').map(p => p.id)).toEqual(['pA']);
    expect(Mod.partidosDeJornada(1, 'gB').map(p => p.id)).toEqual(['pB']);
    expect(codigoResultados).toContain('opcionesGrupo(Mod.partidos, Mod.grupo)');
    expect(codigoResultados).toContain('id="r7-grupo"');
  });

  it('2. acepta sólo jornadas reales, abiertas y dentro del total', () => {
    const { Mod } = crearMod({
      total: 3,
      jornadas: [
        abierta(1, 'gA'),
        { numero: 2, grupo_id: 'gA', estado: 'cerrada' },
        { numero: 3, grupo_id: 'gA', estado: 'sin_programar', virtual: true },
        abierta(4, 'gA')
      ]
    });
    expect(Mod.jornadasAbiertas('gA')).toEqual([1]);
  });

  it('3. con varias jornadas abiertas elige una y respeta la selección', () => {
    const { Mod } = crearMod({ jornadas: [abierta(3, 'gA'), abierta(1, 'gA'), abierta(2, 'gA')] });
    expect(Mod.jornadasAbiertas('gA')).toEqual([1, 2, 3]);
    expect(Mod.jornadaElegida([1, 2, 3])).toBe(1);
    Mod.jornada = 2;
    expect(Mod.jornadaElegida([1, 2, 3])).toBe(2);
    Mod.jornada = 99;
    expect(Mod.jornadaElegida([1, 2, 3])).toBe(1);
  });

  it('4. sin jornada abierta no selecciona partido ni permite cargar', async () => {
    const p = partido('p1', 1, 'gA');
    const { Mod, GL, sb } = crearMod({
      jornadas: [{ numero: 1, grupo_id: 'gA', estado: 'cerrada' }],
      partidos: [p]
    });
    expect(Mod.jornadaElegida(Mod.jornadasAbiertas('gA'))).toBeNull();
    expect(Mod.partidosDeJornada(null, 'gA')).toEqual([]);
    await Mod.guardarResultado(p, crearPanel());
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(avisos(GL, 'advertencia')[0]).toMatch(/no está abierta/);
  });

  it('5. una jornada cerrada bloquea alta y corrección', async () => {
    const p = partido('p1', 1, 'gA', 'jugado', [2, 1]);
    const jornadas = [{ numero: 1, grupo_id: 'gA', estado: 'cerrada' }];
    const { Mod, GL, sb } = crearMod({ jornadas, partidos: [p] });
    expect(Mod.esCerrada(p)).toBe(true);
    expect(Mod.validarContextoEscritura(p, 'jugado', false)).toMatch(/no está abierta/);
    expect(Mod.validarContextoEscritura(p, 'jugado', true)).toMatch(/está cerrada/);
    await Mod.guardarResultado(p, crearPanel({ local: '3', visita: '0', motivo: 'Ajuste' }));
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(avisos(GL, 'advertencia')[0]).toMatch(/está cerrada/);
  });

  it('6. sin programación (sin fila de jornada) no se puede cargar', async () => {
    const p = partido('p1', 5, 'gA');
    const { Mod, GL, sb } = crearMod({ jornadas: [abierta(1, 'gA')], partidos: [p] });
    expect(Mod.jornadaDelPartido(p)).toBeNull();
    expect(Mod.validarContextoEscritura(p, 'jugado', false)).toMatch(/no está abierta/);
    await Mod.guardarResultado(p, crearPanel());
    expect(GL.cargarContexto).toHaveBeenCalledWith(true);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('7. torneo finalizado: sin jornadas abiertas, pero el historial sigue disponible', async () => {
    const p = partido('p1', 2, 'gA', 'jugado', [1, 0]);
    const { Mod, GL, sb } = crearMod({
      total: 2,
      jornadas: [
        { numero: 1, grupo_id: 'gA', estado: 'cerrada' },
        { numero: 2, grupo_id: 'gA', estado: 'cerrada' }
      ],
      partidos: [p]
    });
    expect(Mod.jornadasAbiertas('gA')).toEqual([]);
    Mod.partidos = [p];
    expect(Mod.partidos).toHaveLength(1);
    await Mod.guardarResultado(p, crearPanel({ motivo: 'Revisión' }));
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(avisos(GL, 'advertencia')[0]).toMatch(/cerrada|no está abierta/);
  });

  it('15. aísla grupos: una jornada abierta en A no habilita cargar en B', async () => {
    const pB = partido('pB', 1, 'gB');
    const { Mod, GL, sb } = crearMod({
      jornadas: [abierta(1, 'gA')],
      partidos: [pB]
    });
    expect(Mod.jornadasAbiertas('gA')).toEqual([1]);
    expect(Mod.jornadasAbiertas('gB')).toEqual([]);
    Mod.grupo = 'gA';
    expect(Mod.validarContextoEscritura(pB, 'jugado', false)).toMatch(/otro grupo/);
    await Mod.guardarResultado(pB, crearPanel());
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(avisos(GL, 'advertencia')[0]).toMatch(/otro grupo/);
  });
});

describe('FASE 3.21 — escritura, trazabilidad y consistencia', () => {
  const jornadasAbiertas = [abierta(1, 'gA')];

  it('8. corrección con motivo usa el registro releído como valor anterior', async () => {
    const snapshot = partido('p1', 1, 'gA', 'jugado', [9, 9]);
    const fresco = partido('p1', 1, 'gA', 'jugado', [2, 1]);
    const { Mod, GL, sb } = crearMod({ jornadas: jornadasAbiertas, partidos: [fresco] });

    await Mod.guardarResultado(snapshot, crearPanel({ local: '3', visita: '0', motivo: 'Marcador incorrecto' }));

    expect(Mod.frescoDe(snapshot, [fresco])).toMatchObject({ goles_local: 2, goles_visitante: 1 });
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(GL.auditoria.registrar).toHaveBeenCalledWith('resultado_corregido', 'partido', 'p1',
      expect.objectContaining({ anterior: '2 - 1', motivo: 'Marcador incorrecto' }));
    expect(Mod.corregidos.has('p1')).toBe(true);
  });

  it('9. rechaza marcadores inválidos antes de llamar a la RPC', async () => {
    const p = partido('p1', 1, 'gA');
    for (const [local, visita] of [['-1', '0'], ['1.5', '2'], ['', '1'], ['100', '0']]) {
      const { Mod, GL, sb } = crearMod({ jornadas: jornadasAbiertas, partidos: [p] });
      await Mod.guardarResultado(p, crearPanel({ local, visita }));
      expect(sb.rpc, local + '-' + visita).not.toHaveBeenCalled();
      expect(avisos(GL, 'advertencia').length).toBe(1);
    }
  });

  it('10. evita envíos repetidos y partidos ya registrados en la relectura', async () => {
    const p = partido('p1', 1, 'gA');
    const { Mod, GL, sb } = crearMod({ jornadas: jornadasAbiertas, partidos: [p] });
    let autorizar;
    GL.confirmar = () => new Promise(res => { autorizar = res; });
    const panel = crearPanel();
    const primera = Mod.guardarResultado(p, panel);
    const segunda = Mod.guardarResultado(p, panel);
    await vi.waitFor(() => expect(autorizar).toBeTypeOf('function'));
    autorizar(true);
    await Promise.all([primera, segunda]);
    expect(sb.rpc).toHaveBeenCalledTimes(1);

    const resuelto = partido('p1', 1, 'gA', 'jugado', [2, 1]);
    const segundo = crearMod({ jornadas: jornadasAbiertas, partidos: [resuelto] });
    await segundo.Mod.guardarResultado(p, crearPanel());
    expect(segundo.sb.rpc).not.toHaveBeenCalled();
    expect(avisos(segundo.GL, 'advertencia')[0]).toMatch(/ya tiene resultado/);
  });

  it('11. tras guardar invalida el contexto y repinta tabla y estadísticas', async () => {
    const p = partido('p1', 1, 'gA');
    const { Mod, GL, sb } = crearMod({ jornadas: jornadasAbiertas, partidos: [p] });
    await Mod.guardarResultado(p, crearPanel());
    expect(sb.rpc.mock.calls[0][0]).toBe('gl_guardar_resultado');
    expect(GL.cargarContexto).toHaveBeenCalledWith(true);
    expect(GL.invalidar).toHaveBeenCalledTimes(1);
    expect(Mod.render).toHaveBeenCalledTimes(1);
    /* La clasificación debe leerse después de invalidar, no desde la caché
       previa al guardado; el RPC documentado ya recalcula la tabla. */
    expect(GL.invalidar.mock.invocationCallOrder[0])
      .toBeLessThan(Mod.render.mock.invocationCallOrder[0]);
    expect(codigoResultados).not.toContain('GL.recalcularTodo()');
    expect(avisos(GL, 'exito')[0]).toMatch(/Tabla, estadísticas y cuadro actualizados/);
  });

  it('12. valida las estadísticas y las envía sólo cuando son coherentes', async () => {
    const p = partido('p1', 1, 'gA');
    const stats = {
      tiros_local: 8, tiros_puerta_local: 3, posesion_local: 55, pase_local: 80,
      tiros_visitante: 5, tiros_puerta_visitante: 2, posesion_visitante: 45, pase_visitante: 70
    };
    const invalido = crearMod({ jornadas: jornadasAbiertas, partidos: [p] });
    await invalido.Mod.guardarResultado(p, crearPanel({
      stats: { ...stats, tiros_puerta_local: 9 }
    }));
    expect(invalido.sb.rpc).not.toHaveBeenCalled();

    const valido = crearMod({ jornadas: jornadasAbiertas, partidos: [p] });
    await valido.Mod.guardarResultado(p, crearPanel({ stats }));
    expect(valido.sb.rpc.mock.calls[0][1].p_stats).toMatchObject({
      tiros_local: 8, posesion_local: 55, posesion_visitante: 45
    });
  });

  it('13. errores de red y respuestas rechazadas nunca se informan como éxito', async () => {
    const p = partido('p1', 1, 'gA');
    const red = crearMod({ jornadas: jornadasAbiertas, partidos: [p] });
    red.sb.rpc = vi.fn(async () => { throw new Error('Failed to fetch'); });
    await red.Mod.guardarResultado(p, crearPanel());
    expect(avisos(red.GL, 'exito')).toEqual([]);
    expect(avisos(red.GL, 'error').length).toBe(1);

    const rechazo = crearMod({ jornadas: jornadasAbiertas, partidos: [p] });
    rechazo.sb.rpc = vi.fn(async () => ({ data: { ok: false, mensaje: 'Jornada cerrada en servidor' }, error: null }));
    await rechazo.Mod.guardarResultado(p, crearPanel());
    expect(avisos(rechazo.GL, 'exito')).toEqual([]);
    expect(avisos(rechazo.GL, 'error').some(t => /Jornada cerrada en servidor/.test(t))).toBe(true);
  });

  it('14. sin permisos no se llama a la RPC ni se informa éxito', async () => {
    const p = partido('p1', 1, 'gA');
    const sinAdmin = crearMod({ jornadas: jornadasAbiertas, partidos: [p], admin: false });
    await sinAdmin.Mod.guardarResultado(p, crearPanel());
    expect(sinAdmin.sb.rpc).not.toHaveBeenCalled();
    expect(avisos(sinAdmin.GL, 'error')[0]).toMatch(/Solo el administrador/);

    const rechazado = crearMod({ jornadas: jornadasAbiertas, partidos: [p] });
    rechazado.sb.rpc = vi.fn(async () => ({
      data: { ok: false, error: 'No tenés permisos de administrador.' }, error: null
    }));
    await rechazado.Mod.guardarResultado(p, crearPanel());
    expect(avisos(rechazado.GL, 'error').some(t => /No tenés permisos/.test(t))).toBe(true);
  });

  it('verifica jornada, grupo y torneo contra el registro fresco', () => {
    const original = partido('p1', 1, 'gA');
    const { Mod } = crearMod();
    expect(Mod.verificarPartido(original, [{ ...original, jornada: 2 }], false)).toMatch(/jornada del partido cambió/);
    expect(Mod.verificarPartido(original, [{ ...original, grupo_id: 'gB' }], false)).toMatch(/cambió de grupo/);
    expect(Mod.verificarPartido(original, [{ ...original, torneo_id: 'otro' }], false)).toMatch(/ya no pertenece/);
  });

  it('mantiene el cache-busting coordinado de la fase', () => {
    /* La aserción se deriva de CONFIG.VERSION para no quedar atada a una
       versión ya cacheada en el navegador; sí exige que se haya renovado. */
    expect(CONFIG.VERSION).not.toBe('1.3.4');
    expect(codigoIndex).toContain('js/core/config.js?v=' + CONFIG.VERSION);
    expect(codigoIndex).toContain('js/core/gl.js?v=' + CONFIG.VERSION);
    expect(codigoIndex).toContain('js/ui/menu.js?v=' + CONFIG.VERSION);
    expect(codigoIndex).not.toContain('js/core/config.js?v=1.3.4');
    expect(codigoResultados).toContain('data-r7-grupo');
    expect(codigoResultados).toContain('if (Mod.guardando) return;');
  });
});
