/* =====================================================================
   FASE 3.23 — D.12 y textos obsoletos E.9/E.10.
   Todo se ejecuta con datos sintéticos: ninguna prueba toca Supabase.
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');
const codigoCalendario = leer('js/modulos/calendario.js');
const codigoAuth = leer('js/ui/auth.js');
const codigoOnboarding = leer('js/ui/onboarding.js');
const codigoIndex = leer('index.html');
const codigoConfig = leer('js/core/config.js');
const codigoGL = leer('js/core/gl.js');
const codigoMigracion = leer('supabase/migration-fase-3.23-cierre-jornada.sql');
const codigoOriginal = leer('tests/fixtures/fase-3.23-cierre-original.sql');
const espera = () => new Promise(resolve => setTimeout(resolve, 0));

function crearEscenario({
  jornadas = [], partidos = [], admin = true, confirma = true,
  rpcConfirma = true, demoraRpc = 0
} = {}) {
  const ctx = {
    torneo: { id: 't1', nombre: 'Torneo sintético', temporada: '2026', total_jornadas: 4 },
    grupos: [{ id: 'gA', nombre: 'Grupo A' }],
    jugadores: [{ id: 'j1', nombre_usuario: 'Local' }, { id: 'j2', nombre_usuario: 'Visita' }],
    jornadas: jornadas.map(j => ({ ...j })),
    clasificacion: [],
    sanciones: []
  };
  const registro = { update: [], insert: [], rpc: [], notificar: [], confirmar: [], auditoria: [] };
  let valoresPendientes = null;
  let filtros = {};
  const cadena = {
    update(valores) {
      valoresPendientes = valores;
      filtros = {};
      registro.update.push({ ...valores });
      return cadena;
    },
    eq(columna, valor) { filtros[columna] = valor; return cadena; },
    insert(valores) { registro.insert.push({ ...valores }); return Promise.resolve({ error: null }); },
    select() { return cadena; },
    order() { return Promise.resolve({ data: [], error: null }); },
    then(resolver, rechazar) {
      if (valoresPendientes) {
        const fila = ctx.jornadas.find(j => Object.entries(filtros).every(([k, v]) => j[k] === v));
        if (fila && valoresPendientes.estado) fila.estado = valoresPendientes.estado;
        valoresPendientes = null;
      }
      return Promise.resolve({ error: null }).then(resolver, rechazar);
    }
  };
  const sb = {
    from: vi.fn(() => cadena),
    rpc: vi.fn(async (_nombre, parametros) => {
      registro.rpc.push(parametros);
      if (demoraRpc) await new Promise(resolve => setTimeout(resolve, demoraRpc));
      if (rpcConfirma) {
        const fila = ctx.jornadas.find(j => j.numero === parametros.p_jornada &&
          j.grupo_id === parametros.p_grupo_id);
        if (fila) fila.estado = 'cerrada';
      }
      return { data: { ok: true, partidos_resueltos: 0 }, error: null };
    })
  };
  const GL = {
    ctx,
    esAdmin: () => admin,
    asegurarAdmin: vi.fn(async () => admin),
    cargarContexto: vi.fn(async () => ctx),
    invalidar: vi.fn(),
    torneo: () => ctx.torneo,
    grupos: () => ctx.grupos,
    grupo: id => ctx.grupos.find(g => g.id === id) || null,
    grupoDeJugador: () => ctx.grupos[0],
    zonaJugador: () => 'America/Managua',
    _zonaResuelta: zona => zona,
    partesEnZona: () => ({ year: 2026, month: 11, day: 26, hour: 12, minute: 0 }),
    momentoSZona: null,
    momentoZona: () => new Date('2026-11-26T18:00:00Z'),
    offsetZona: () => 'UTC-6',
    partidos: vi.fn(async () => partidos.map(p => ({ ...p }))),
    jugador: id => ctx.jugadores.find(j => j.id === id) || {},
    jugadores: () => ctx.jugadores,
    letraGrupo: g => String((g && g.nombre) || '').replace(/^Grupo\s*/, ''),
    etiquetaZona: () => 'América/Managua (UTC-6)',
    horarioZonaDetalle: () => '12:00',
    notaHorarios: () => 'Horarios informativos.',
    badge: (texto, color) => '<span class="badge ' + color + '">' + texto + '</span>',
    avatarHTML: () => '',
    banderaHTML: () => '',
    nombreJugador: id => String(id),
    nombrePais: () => 'Nicaragua',
    resultado: () => ({ texto: '0 - 0', estado: { label: 'Pendiente', color: 'orange', icono: 'clock' } }),
    linkWhatsapp: () => '',
    tel: { e164Jugador: () => '' },
    notificar: vi.fn((texto, tipo) => registro.notificar.push({ texto, tipo })),
    confirmar: vi.fn(async () => confirma),
    mensaje: e => String((e && e.message) || e),
    recalcularTodo: vi.fn(async () => ({})),
    auditoria: { registrar: vi.fn(async (...args) => { registro.auditoria.push(args); return { ok: true }; }) },
    skeleton: () => '',
    vacio: () => '',
    error: () => ''
  };
  const Modulos = {};
  const crear = new Function(
    'GL', 'Auth', 'Modulos', 'sb', 'CONFIG', 'ZONAS_HORARIAS_DISPONIBLES',
    'window', 'document', 'icono', 'esc', 'iniciarIconos',
    codigoCalendario + '\nreturn Modulos.calendario;'
  );
  const Mod = crear(
    GL, { jugador: { id: 'j1' }, usuario: { id: 'u-admin' } }, Modulos, sb,
    { VERSION: '1.3.3', NOMBRE_LIGA: 'GOATS LATINOS', ZONA_REFERENCIA: 'America/Managua',
      JORNADAS_FASE_REGULAR: 4 },
    [{ pais: 'NI', ciudad: 'Managua', zona: 'America/Managua' }],
    { Modulos }, document, () => '', valor => String(valor == null ? '' : valor), () => {}
  );
  const escenario = { Mod, GL, sb, ctx, registro, el: null };
  escenario.render = async () => {
    Mod.grupoId = 'gA';
    Mod.anio = null;
    Mod.mes = null;
    Mod.zona = null;
    const el = document.createElement('div');
    document.body.appendChild(el);
    escenario.el = el;
    await Mod.render(el);
    return el;
  };
  return escenario;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('FASE 3.23 — D.12: jornadas virtuales', () => {
  it('muestra una jornada virtual como sin programar y no ofrece abrirla', async () => {
    const escenario = crearEscenario({ jornadas: [
      { numero: 1, grupo_id: 'gA', torneo_id: 't1', estado: 'sin_programar', virtual: true },
      { id: 'j2', numero: 2, grupo_id: 'gA', torneo_id: 't1', estado: 'cerrada' }
    ] });
    const el = await escenario.render();
    const filaVirtual = el.querySelector('[data-jornada-fila="1"]');
    expect(filaVirtual).toBeTruthy();
    expect(filaVirtual.textContent).toContain('Sin programar');
    expect(filaVirtual.textContent).not.toContain('Abierta');
    expect(el.querySelector('[data-cal-estado="1"]')).toBeNull();
    expect(el.querySelector('[data-cal-estado="2"]').dataset.accion).toBe('abrir');
    expect(el.textContent).toContain('0 abiertas');
  });

  it('no inserta una jornada al intentar abrir una virtual', async () => {
    const escenario = crearEscenario({ jornadas: [
      { numero: 1, grupo_id: 'gA', torneo_id: 't1', estado: 'sin_programar', virtual: true }
    ] });
    await escenario.render();
    await escenario.Mod._cambiarEstado(escenario.el, escenario.Mod.datos, null, 1, 'abrir');
    expect(escenario.sb.from).not.toHaveBeenCalled();
    expect(escenario.registro.insert).toHaveLength(0);
    expect(escenario.registro.notificar.some(n => n.texto.includes('Primero programá'))).toBe(true);
  });
});

describe('FASE 3.23 — D.12: apertura y cierre persistentes', () => {
  it('abre sólo la fila persistida, con confirmación, y verifica tras recargar', async () => {
    const escenario = crearEscenario({ jornadas: [
      { id: 'j2', numero: 2, grupo_id: 'gA', torneo_id: 't1', estado: 'cerrada' }
    ] });
    const el = await escenario.render();
    el.querySelector('[data-cal-estado="2"]').click();
    await espera();
    expect(escenario.GL.confirmar).toHaveBeenCalled();
    expect(escenario.registro.update).toEqual([{ estado: 'abierta' }]);
    expect(escenario.registro.insert).toHaveLength(0);
    expect(escenario.GL.cargarContexto).toHaveBeenCalled();
    expect(escenario.ctx.jornadas[0].estado).toBe('abierta');
    expect(escenario.registro.notificar.some(n => n.tipo === 'exito' && n.texto.includes('abierta'))).toBe(true);
    expect(escenario.registro.auditoria.some(a => a[0] === 'calendario_jornada_abierta')).toBe(true);
  });

  it('rechaza el cierre cuando la recarga no confirma el estado', async () => {
    const escenario = crearEscenario({
      jornadas: [{ id: 'j2', numero: 2, grupo_id: 'gA', torneo_id: 't1', estado: 'abierta' }],
      rpcConfirma: false
    });
    const el = await escenario.render();
    el.querySelector('[data-cal-estado="2"]').click();
    await espera();
    expect(escenario.registro.rpc).toHaveLength(1);
    expect(escenario.GL.recalcularTodo).not.toHaveBeenCalled();
    expect(escenario.registro.auditoria).toHaveLength(0);
    expect(escenario.registro.notificar.some(n => n.tipo === 'error' && n.texto.includes('no confirmó'))).toBe(true);
    expect(escenario.registro.notificar.some(n => n.tipo === 'exito')).toBe(false);
  });

  it('bloquea envíos simultáneos de la misma jornada', async () => {
    const escenario = crearEscenario({
      jornadas: [
        { id: 'j2', numero: 2, grupo_id: 'gA', torneo_id: 't1', estado: 'abierta' },
        { id: 'j3', numero: 3, grupo_id: 'gA', torneo_id: 't1', estado: 'abierta' }
      ],
      demoraRpc: 30
    });
    await escenario.render();
    const primero = escenario.Mod._cambiarEstado(escenario.el, escenario.Mod.datos, null, 2, 'cerrar');
    const segundo = escenario.Mod._cambiarEstado(escenario.el, escenario.Mod.datos, null, 2, 'cerrar');
    await Promise.all([primero, segundo]);
    expect(escenario.registro.rpc).toHaveLength(1);
    expect(escenario.registro.notificar.some(n => n.texto.includes('operación en curso'))).toBe(true);
  });

  it('no ejecuta el RPC si el usuario cancela la confirmación', async () => {
    const escenario = crearEscenario({
      jornadas: [{ id: 'j2', numero: 2, grupo_id: 'gA', torneo_id: 't1', estado: 'abierta' }],
      confirma: false
    });
    const el = await escenario.render();
    el.querySelector('[data-cal-estado="2"]').click();
    await espera();
    expect(escenario.registro.rpc).toHaveLength(0);
    expect(escenario.GL.cargarContexto).toHaveBeenCalledTimes(1);
  });
});

describe('FASE 3.23 — E.9/E.10 y propuesta SQL', () => {
  it('los textos describen el funcionamiento real', () => {
    expect(codigoAuth).not.toContain('Solo dos correos están autorizados');
    expect(codigoAuth).toContain('La RPC del servidor valida correo y clave');
    expect(codigoOnboarding).not.toContain('Nadie más puede ver tu número');
    expect(codigoOnboarding).toContain('administradores y compañeros de grupo');
  });

  it('la migración propuesta corrige las tres causas y conserva las firmas', () => {
    expect(codigoOriginal).toContain('INSERT INTO auditoria (torneo_id, usuario_id, accion, tabla_afectada');
    expect(codigoMigracion).toContain('v_admin_jugador_id');
    expect(codigoMigracion).toContain('v_ingresado_jugador_id');
    expect(codigoMigracion).toContain('PERFORM public.gl_registrar_auditoria(');
    expect(codigoMigracion).toContain("UPDATE jornadas SET estado = 'cerrada'");
    expect(codigoMigracion).not.toMatch(/UPDATE jornadas SET\s+estado\s*=\s*'cerrada',\s*updated_at/);
    expect(codigoMigracion).toContain('gl_cerrar_jornada_interno(p_torneo_id uuid, p_grupo_id uuid, p_jornada integer, p_resoluciones jsonb, p_cerrado_por uuid)');
    expect(codigoMigracion).toContain('NO EJECUTAR EN PRODUCCIÓN SIN AUTORIZACIÓN EXPLÍCITA');
  });
});

describe('FASE 3.23 — cache-busting de los archivos modificados', () => {
  it('renueva CSS, textos y la versión con que se cargan los módulos', () => {
    const version = /VERSION: '([^']+)'/.exec(codigoConfig)[1];
    expect(version).toBe('1.3.9');
    expect(codigoIndex).toContain('css/tokens-3.1.css?v=3.23.0');
    expect(codigoIndex).toContain('css/estilos.css?v=3.23.0');
    expect(codigoIndex).toContain('js/core/config.js?v=' + version);
    expect(codigoIndex).toContain('js/core/gl.js?v=' + version);
    expect(codigoIndex).toContain('js/ui/menu.js?v=' + version);
    expect(codigoIndex).toContain('js/ui/auth.js?v=1.3.9');
    expect(codigoIndex).toContain('js/ui/onboarding.js?v=1.2.4');
    expect(codigoGL).toContain("'js/modulos/' + id + '.js?v=' + encodeURIComponent(CONFIG.VERSION)");
  });
});
