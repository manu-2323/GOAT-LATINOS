import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');
const codigoResultados = leer('js/modulos/resultados.js');
const codigoCSS = leer('css/estilos.css');
const codigoCalendario = leer('js/modulos/calendario.js');
const codigoCuadro = leer('js/modulos/fixture.js');
const codigoInicio = leer('js/modulos/inicio.js');
const codigoConfig = leer('js/core/config.js');
const CONFIG = new Function(codigoConfig + '\nreturn CONFIG;')();
const ESTADOS_PARTIDO = new Function(codigoConfig + '\nreturn ESTADOS_PARTIDO;')();

const PENDIENTE = {
  id: 'p1', jornada: 3, grupo_id: 'g1', local_id: 'j1', visitante_id: 'j2',
  estado: 'pendiente', goles_local: null, goles_visitante: null,
  captura_url: 'https://ejemplo.invalid/captura.jpg'
};
const JUGADO = { ...PENDIENTE, estado: 'jugado', goles_local: 2, goles_visitante: 1 };

let GLBase;
let reservas;

function cargarModulo(gl, sb) {
  const Modulos = {};
  const crear = new Function(
    'CONFIG', 'ESTADOS_PARTIDO', 'Modulos', 'GL', 'Auth', 'icono', 'esc', 'iniciarIconos', 'sb',
    codigoResultados + '\nreturn Modulos.resultados;'
  );
  const Mod = crear(CONFIG, ESTADOS_PARTIDO, Modulos, gl, { usuario: { id: 'u-admin' } },
    () => '', valor => String(valor === null || valor === undefined ? '' : valor), () => {}, sb);
  Mod.render = vi.fn(async () => {});
  return Mod;
}

function crearGL({ partidos = [PENDIENTE], admin = true } = {}) {
  const gl = {
    ...GLBase,
    ctx: {
      torneo: { id: 't1', total_jornadas: 22 },
      jornadas: [{ numero: 3, grupo_id: 'g1', estado: 'abierta', fecha_inicio: '2026-02-01T12:00:00Z' }],
      jugadores: [{ id: 'j1', nombre_usuario: 'Alpha' }, { id: 'j2', nombre_usuario: 'Bravo' }],
      clasificacion: [
        { jugador_id: 'j1', grupo_id: 'g1', pj: 1, pg: 1, pe: 0, pp: 0, gf: 2, gc: 1, dif: 1, pts: 3 }
      ]
    },
    esAdmin: () => admin,
    torneo: () => ({ id: 't1', total_jornadas: 22 }),
    torneoId: () => 't1',
    partidos: vi.fn(async () => partidos.map(p => ({ ...p }))),
    notificar: vi.fn(),
    confirmar: vi.fn(async () => true),
    nombreJugador: id => (id === 'j1' ? 'Alpha' : id === 'j2' ? 'Bravo' : id),
    resultado: GLBase.resultado,
    mensaje: GLBase.mensaje,
    auditoria: { registrar: vi.fn(async () => {}) }
  };
  return gl;
}

function crearSB(respuesta = { data: { ok: true, es_correccion: false }, error: null }) {
  return {
    rpc: vi.fn(async () => respuesta),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-admin' } } })) },
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: () => ({ data: { publicUrl: 'https://ejemplo.invalid/nueva.jpg' } })
      })
    }
  };
}

function crearPanel({ local = '2', visita = '1', estado = 'jugado', motivo = '', stats = {} } = {}) {
  const el = document.createElement('div');
  el.innerHTML =
    '<input id="g-local" value="' + local + '">' +
    '<input id="g-visita" value="' + visita + '">' +
    '<select id="estado"><option value="' + estado + '" selected>' + estado + '</option></select>' +
    (motivo !== null ? '<input id="motivo" value="' + motivo + '">' : '') +
    '<button id="guardar" type="button">Guardar</button>' +
    Object.entries(stats).map(([k, v]) => '<input id="' + k + '" value="' + v + '">').join('');
  document.body.appendChild(el);
  return el;
}

function avisos(gl, tipo) {
  return gl.notificar.mock.calls.filter(c => c[1] === tipo).map(c => c[0]);
}

beforeEach(() => {
  GLBase = window.GL;
  reservas = { notificar: GLBase.notificar, confirmar: GLBase.confirmar };
  document.body.innerHTML = '';
});

afterEach(() => {
  GLBase.notificar = reservas.notificar;
  GLBase.confirmar = reservas.confirmar;
  document.body.innerHTML = '';
});

describe('FASE 3.15 — validación estricta del marcador', () => {
  it('acepta enteros no negativos y rechaza vacíos, negativos, decimales y texto', () => {
    const Mod = cargarModulo(crearGL(), crearSB());
    expect(Mod.enteroNoNegativo('0', 'Goles', 99)).toEqual({ ok: true, valor: 0 });
    expect(Mod.enteroNoNegativo(7, 'Goles', 99)).toEqual({ ok: true, valor: 7 });
    ['', '   ', '-1', '1.5', 'abc', '1e3', '+2'].forEach(valor =>
      expect(Mod.enteroNoNegativo(valor, 'Goles', 99).ok, valor).toBe(false));
    expect(Mod.enteroNoNegativo('100', 'Goles', 99).ok).toBe(false);
  });

  it('canonicaliza los marcadores de estados administrativos', () => {
    const Mod = cargarModulo(crearGL(), crearSB());
    expect(Mod.validarMarcador('5', '9', 'walkover_local')).toMatchObject({ golesLocal: 3, golesVisita: 0 });
    expect(Mod.validarMarcador('5', '9', 'walkover_visitante')).toMatchObject({ golesLocal: 0, golesVisita: 3 });
    expect(Mod.validarMarcador('5', '9', 'doble_ausencia')).toMatchObject({ golesLocal: 0, golesVisita: 0 });
    expect(Mod.validarMarcador('', '1', 'jugado').ok).toBe(false);
  });

  it('rechaza estadísticas no enteras y coherencias imposibles', () => {
    const Mod = cargarModulo(crearGL(), crearSB());
    const panel = crearPanel({ stats: {
      tiros_local: 4, tiros_puerta_local: 5, posesion_local: 50, posesion_visitante: 50
    } });
    expect(Mod.validarStats(panel, 'jugado')).toMatch(/no puede superar/);
    panel.querySelector('#tiros_puerta_local').value = '2.5';
    expect(Mod.validarStats(panel, 'jugado')).toMatch(/entero no negativo/);
    panel.querySelector('#tiros_puerta_local').value = '2';
    panel.querySelector('#posesion_local').value = '60';
    panel.querySelector('#posesion_visitante').value = '50';
    expect(Mod.validarStats(panel, 'jugado')).toMatch(/debe sumar 100/);
  });

  it('expone solo los estados que acepta la RPC desplegada', () => {
    const Mod = cargarModulo(crearGL(), crearSB());
    expect(Mod.estadosGuardables).toEqual(['jugado', 'walkover_local', 'walkover_visitante', 'doble_ausencia']);
    expect(codigoResultados).toContain('ESTADOS_GUARDABLES.includes(estado)');
  });
});

describe('FASE 3.15 — integridad del partido', () => {
  it('deduplica con la misma clave que el Cuadro de partidos', () => {
    const Mod = cargarModulo(crearGL(), crearSB());
    const repetido = { ...JUGADO, id: 'p2' };
    const resultado = Mod.deduplicar([JUGADO, repetido]);
    expect(resultado.partidos).toHaveLength(1);
    expect(resultado.duplicados).toHaveLength(1);
    expect(codigoCuadro).toContain("[p.jornada, p.local_id, p.visitante_id].join('|')");
  });

  it('detecta partido inexistente, participantes inválidos y estado obsoleto', () => {
    const Mod = cargarModulo(crearGL(), crearSB());
    expect(Mod.verificarPartido(PENDIENTE, [], false)).toMatch(/ya no existe/);
    expect(Mod.verificarPartido(PENDIENTE, [{ ...PENDIENTE, local_id: null }], false)).toMatch(/no son válidos/);
    expect(Mod.verificarPartido(PENDIENTE, [JUGADO], false)).toMatch(/ya tiene resultado/);
    expect(Mod.verificarPartido(JUGADO, [PENDIENTE], true)).toMatch(/volvió a pendiente/);
    expect(Mod.verificarPartido(PENDIENTE, [PENDIENTE, { ...PENDIENTE, id: 'otro' }], false)).toMatch(/duplicados/);
    expect(Mod.verificarPartido(PENDIENTE, [PENDIENTE], false)).toBeNull();
  });

  it('rechaza respuestas incompletas y errores internos del RPC', () => {
    const Mod = cargarModulo(crearGL(), crearSB());
    expect(() => Mod.respuestaConfirmada(null)).toThrow(/no confirmó/);
    expect(() => Mod.respuestaConfirmada({ error: 'sin permiso' })).toThrow(/sin permiso/);
    expect(() => Mod.respuestaConfirmada({ ok: false })).toThrow(/rechazó/);
    expect(Mod.respuestaConfirmada({ ok: true })).toEqual({ ok: true });
  });

  it('el resumen de confirmación identifica el partido, el valor previo y el motivo', () => {
    const Mod = cargarModulo(crearGL(), crearSB());
    const texto = Mod.resumenCambio(JUGADO,
      { golesLocal: 3, golesVisita: 0, estado: 'jugado', motivo: 'Marcador incorrecto' }, true);
    expect(texto).toContain('CORRECCIÓN DE RESULTADO');
    expect(texto).toContain('Alpha vs Bravo (J3)');
    expect(texto).toContain('Valor actual: 2 - 1');
    expect(texto).toContain('Nuevo marcador: 3 - 0');
    expect(texto).toContain('Motivo: Marcador incorrecto');
  });
});

describe('FASE 3.15 — registro y corrección', () => {
  it('registra un resultado válido y actualiza la tabla y las estadísticas vía RPC', async () => {
    const gl = crearGL();
    const sb = crearSB();
    const Mod = cargarModulo(gl, sb);
    const panel = crearPanel();

    await Mod.guardarResultado(PENDIENTE, panel);

    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc.mock.calls[0][1]).toMatchObject({
      p_partido_id: 'p1', p_goles_local: 2, p_goles_visitante: 1,
      p_estado: 'jugado', p_motivo: null
    });
    expect(avisos(gl, 'exito')).toContain('Resultado registrado. Tabla, estadísticas y cuadro actualizados.');
    expect(gl.auditoria.registrar).toHaveBeenCalledWith(
      'resultado_ingresado', 'partido', 'p1', expect.objectContaining({ nuevo: '2-1' }));
    expect(Mod.render).toHaveBeenCalledTimes(1);
  });

  it('rechaza marcadores negativos, decimales y vacíos sin llamar a la RPC', async () => {
    for (const [local, visita] of [['-1', '0'], ['1.5', '2'], ['', '1'], ['2', '']]) {
      const gl = crearGL();
      const sb = crearSB();
      const Mod = cargarModulo(gl, sb);
      const panel = crearPanel({ local, visita });

      await Mod.guardarResultado(PENDIENTE, panel);

      expect(sb.rpc, local + '-' + visita).not.toHaveBeenCalled();
      expect(avisos(gl, 'advertencia').length).toBe(1);
      expect(avisos(gl, 'exito')).toEqual([]);
    }
  });

  it('impide registrar dos veces el mismo partido', async () => {
    const gl = crearGL({ partidos: [JUGADO] });
    const sb = crearSB();
    const Mod = cargarModulo(gl, sb);

    await Mod.guardarResultado(PENDIENTE, crearPanel());

    expect(sb.rpc).not.toHaveBeenCalled();
    expect(avisos(gl, 'advertencia')[0]).toMatch(/ya tiene resultado/);
  });

  it('corrige un resultado existente con motivo y trazabilidad', async () => {
    const gl = crearGL({ partidos: [JUGADO] });
    const sb = crearSB({ data: { ok: true, es_correccion: true, anterior: '2-1' }, error: null });
    const Mod = cargarModulo(gl, sb);
    const panel = crearPanel({ local: '3', visita: '0', estado: 'jugado', motivo: 'Marcador incorrecto' });

    await Mod.guardarResultado(JUGADO, panel);

    expect(sb.rpc.mock.calls[0][1]).toMatchObject({
      p_goles_local: 3, p_goles_visitante: 0, p_motivo: 'Marcador incorrecto'
    });
    expect(avisos(gl, 'exito')[0]).toMatch(/Corrección guardada/);
    expect(gl.auditoria.registrar).toHaveBeenCalledWith(
      'resultado_corregido', 'partido', 'p1',
      expect.objectContaining({ motivo: 'Marcador incorrecto', anterior: '2 - 1', nuevo: '3-0' }));
    expect(Mod.corregidos.has('p1')).toBe(true);
    expect(codigoResultados).toContain("GL.badge('Corregido', 'gold', 'pencil')");
  });

  it('exige motivo para corregir y respeta una cancelación del administrador', async () => {
    const gl = crearGL({ partidos: [JUGADO] });
    const sb = crearSB();
    const Mod = cargarModulo(gl, sb);

    await Mod.guardarResultado(JUGADO, crearPanel({ motivo: '   ' }));
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(avisos(gl, 'advertencia')[0]).toMatch(/Indica el motivo/);

    gl.confirmar = vi.fn(async () => false);
    await Mod.guardarResultado(JUGADO, crearPanel({ motivo: 'Cambio validado' }));
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(avisos(gl, 'info')[0]).toMatch(/No se modificó ningún dato/);
  });

  it('no informa éxito ante un error de red ni ante una respuesta incompleta', async () => {
    const gl = crearGL();
    const sb = crearSB();
    sb.rpc = vi.fn(async () => { throw new Error('Failed to fetch'); });
    let Mod = cargarModulo(gl, sb);
    await Mod.guardarResultado(PENDIENTE, crearPanel());
    expect(avisos(gl, 'exito')).toEqual([]);
    expect(avisos(gl, 'error').length).toBe(1);

    const gl2 = crearGL();
    const sb2 = crearSB({ data: null, error: null });
    Mod = cargarModulo(gl2, sb2);
    await Mod.guardarResultado(PENDIENTE, crearPanel());
    expect(avisos(gl2, 'exito')).toEqual([]);
    expect(avisos(gl2, 'error').some(t => /no confirmó/.test(t))).toBe(true);
  });

  it('bloquea dos guardados simultáneos en una sola RPC', async () => {
    const gl = crearGL();
    const sb = crearSB();
    const Mod = cargarModulo(gl, sb);
    let autorizar;
    gl.confirmar = vi.fn(() => new Promise(res => { autorizar = res; }));
    const panel = crearPanel();

    const primera = Mod.guardarResultado(PENDIENTE, panel);
    const segunda = Mod.guardarResultado(PENDIENTE, panel);
    await vi.waitFor(() => expect(gl.confirmar).toHaveBeenCalled());
    autorizar(true);
    await Promise.all([primera, segunda]);

    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(Mod.render).toHaveBeenCalledTimes(1);
  });

  it('no expone escritura a un jugador aunque la interfaz esté cargada', async () => {
    const gl = crearGL({ admin: false });
    const sb = crearSB();
    const Mod = cargarModulo(gl, sb);

    await Mod.guardarResultado(PENDIENTE, crearPanel());

    expect(sb.rpc).not.toHaveBeenCalled();
    expect(avisos(gl, 'error')[0]).toMatch(/Solo el administrador/);
  });
});

describe('FASE 3.15 — consulta, integración y presentación', () => {
  it('ofrece historial con filtros reales y estados vacíos sin datos ficticios', () => {
    expect(codigoResultados).toContain("data-vista=\"historial\"");
    expect(codigoResultados).toContain('id="r7-h-buscar"');
    expect(codigoResultados).toContain('id="r7-h-jornada"');
    expect(codigoResultados).toContain('id="r7-h-grupo"');
    expect(codigoResultados).toContain('id="r7-h-estado"');
    expect(codigoResultados).toContain('id="r7-h-recientes"');
    expect(codigoResultados).toContain('Todavía no hay resultados registrados');
    expect(codigoResultados).toContain('Sin resultados para ese filtro');
    expect(codigoResultados).not.toMatch(/Math\.random|ficticio|ejemplo\.com/i);
  });

  it('reutiliza una sola consulta por render y refresca el contexto antes de repintar', () => {
    expect(codigoResultados.match(/GL\.partidos\(\{ torneo_id: GL\.torneo\(\)\.id \}\)/g)).toHaveLength(1);
    expect(codigoResultados).toContain('await GL.cargarContexto(true)');
    expect(codigoResultados).toContain('await Mod.render(document.getElementById(\'vista\'))');
    expect(codigoResultados).toContain('if (Mod._repintar) Mod._repintar();');
    expect(codigoCalendario).toContain("titulo: 'Calendario y programación'");
    expect(codigoCuadro).toContain("titulo: 'Cuadro de partidos'");
    expect(codigoInicio).toContain('GL.resultado(p)');
  });

  it('mantiene la fecha real de la jornada y distingue recientes sin inventar fecha', () => {
    expect(codigoResultados).toContain('j.fecha_inicio || j.fecha');
    expect(codigoResultados).toContain("return 'Sin programación'");
    expect(codigoResultados).toContain('updated_at || p.created_at');
    expect(codigoInicio).toContain('fechaJornada(jornadaDe(p))'); // misma fuente real de fecha
  });

  it('adjuntar la captura no repinta ni borra los datos ya escritos', () => {
    expect(codigoResultados).toContain('function mostrarArchivoManual(zona, file)');
    expect(codigoResultados).toContain('mostrarArchivoManual(dropzoneManual, f)');
    expect(codigoResultados).not.toMatch(/Mod\.archivo = f;\s*actualizarPanel\(\);/);
  });

  it('no precarga 0-0 en partidos pendientes', () => {
    expect(codigoResultados).toContain("p.estado === 'pendiente' && Number(valor) === 0");
    expect(codigoResultados).toContain("valorInput(p, 'goles_local', esCorreccion)");
  });

  it('renueva el cache-busting de los archivos modificados', () => {
    const index = leer('index.html');
    const config = leer('js/core/config.js');
    expect(config).toMatch(/VERSION: '1\.3\.[012]'/);
    expect(index.match(/\?v=1\.3\.[012]/g)).toHaveLength(5);
    expect(index.match(/\?v=3\.(15|16|17)\.0/g)).toHaveLength(2);
    expect(index).not.toContain('?v=1.2.3');
    expect(index).not.toContain('?v=3.2.2');
  });

  it('usa tokens de diseño y reglas responsive para el nuevo historial', () => {
    ['.r7-tabs-vistas', '.r7-aviso-correccion', '.r7-marcador-final',
     '.r7-filtros-h', '.r7-check'].forEach(clave => expect(codigoCSS).toContain(clave));
    expect(codigoCSS).toMatch(/@media \(max-width:720px\)\{[\s\S]*\.r7-filtros-h \.r7-campo/);
    expect(codigoCSS).toMatch(/@media \(max-width:460px\)\{[\s\S]*\.r7-tab\{flex:1 1 100%\}/);
    expect(codigoCSS).not.toMatch(/\.r7-[a-z-]+\{[^}]*#[0-9a-f]{3,6}/i);
  });
});
