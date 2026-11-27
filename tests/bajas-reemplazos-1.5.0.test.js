/* =====================================================================
   1.5.0 — Pruebas aisladas de bajas, reemplazos y retiros.
   Incluye el arnés SQL (PGlite) y verificaciones de estadísticas reales.
   Nunca conecta con Supabase ni modifica datos de producción.
   ===================================================================== */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const sql = readFileSync(resolve(raiz, 'supabase/migration-bajas-reemplazos-1.5.0.sql'), 'utf8');
const sql154 = readFileSync(
  resolve(raiz, 'supabase/migration-reemplazo-reincorporacion-retirado-1.5.4.sql'), 'utf8');

const JUGADOR = 'jugador-1';
const RIVAL = 'jugador-2';
const partidoLibre = {
  torneo_id: 'torneo', grupo_id: 'grupo', jornada: 7,
  local_id: RIVAL, visitante_id: JUGADOR,
  goles_local: 3, goles_visitante: 0,
  estado: 'jornada_libre'
};

const cargarEstadisticas = () => {
  window.eval(readFileSync(resolve(raiz, 'js/core/estadisticas.js'), 'utf8'));
  return window.EST;
};

describe('1.5.0 — migración propuesta', () => {
  it('ejecuta el arnés SQL aislado sin errores', () => {
    const salida = execFileSync(process.execPath,
      [resolve(raiz, 'scripts/bajas-reemplazos-1.5.0-db-check.mjs')],
      { cwd: raiz, encoding: 'utf8', timeout: 120000 });
    expect(salida).toContain('RESUMEN: 83/83 verificaciones correctas; 0 fallo(s).');
  }, 120000);

  it('no reescribe jugadores.torneo_id', () => {
    expect(sql).not.toMatch(/update\s+public\.jugadores[\s\S]{0,80}set\s+torneo_id/);
  });

  it('valúa el plazo con secuencia y cierre explícito de la jornada 7', () => {
    expect(sql).toContain('create or replace function public.gl_evaluar_plazo_reemplazo');
    expect(sql).toContain("j.numero = 7");
    expect(sql).toContain("generate_series(1, 6)");
    expect(sql).toContain("'jornada_7_cerrada'");
    expect(sql).toContain("'secuencia_incompleta'");
  });

  it('repair del grupo en backfill y en gl_gestionar_baja', () => {
    expect(sql).toContain('coalesce(torneo_participantes.grupo_id, excluded.grupo_id)');
    expect(sql).toContain('Recuperación del grupo');
  });

  it('conserva la membresía histórica del saliente en grupo_jugadores', () => {
    expect(sql).not.toMatch(/delete\s+from\s+public\.grupo_jugadores/);
    expect(sql).toContain('NO se elimina de');
  });

  it('serializa inscripción y sustitución con cerrojo de torneo', () => {
    expect(sql.match(/for update/g).length).toBeGreaterThanOrEqual(3);
  });

  it('recalcula la clasificación dentro de la misma transacción del reemplazo', () => {
    expect(sql).toContain('foreach v_grupo_recalculo in array v_grupos_afectados loop');
    expect(sql).toContain("'grupos_recalculados'");
    expect(sql).not.toMatch(/if v_tipo = 'retiro' then[\s\S]{0,600}recalcular_clasificacion_interno/);
  });

  it('separa reasignación de resolución de partido', () => {
    expect(sql).toContain('reasignado_por');
    expect(sql).toContain('reasignado_en');
    expect(sql).toContain('reasignado_motivo');
    expect(sql).not.toContain("motivo_resolucion = 'Reemplazo de participante dentro del plazo'");
  });

  it('excluye al cierre con bloqueo de tabla incompatible antes del plazo', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.gl_gestionar_baja'));
    const partidos = 'lock table public.partidos in share row exclusive mode';
    const jornadas = 'lock table public.jornadas in share row exclusive mode';
    const plazo = 'v_plazo := public.gl_evaluar_plazo_reemplazo';
    expect(fn).toContain(partidos);
    expect(fn).toContain(jornadas);
    expect(fn.indexOf(partidos)).toBeLessThan(fn.indexOf(jornadas));
    expect(fn.indexOf(jornadas)).toBeLessThan(fn.indexOf(plazo));
    // El cierre desplegado no declara FOR UPDATE: no se puede demostrar un
    // orden de cerrojos de fila. La sincronización es por modo de tabla.
    expect(fn).not.toContain('for v_jornada_lock in');
  });

  it('el trigger de partidos encuentra al entrante ya en el grupo', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.gl_gestionar_baja'));
    const inscripcion = fn.indexOf('insert into public.grupo_jugadores');
    const reasignacion = fn.indexOf('set local_id = p_reemplazo_id');
    expect(inscripcion).toBeGreaterThan(-1);
    expect(inscripcion).toBeLessThan(reasignacion);
    expect(fn).toContain('foreach v_grupo_recalculo in array v_grupos_afectados loop');
  });

  it('guarda el resultado definitivo después del recálculo y antes de auditar', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.gl_gestionar_baja'));
    const calculo = fn.indexOf("'grupos_recalculados'");
    const guardado = fn.indexOf('set resultado = v_resultado');
    const auditoria = fn.indexOf('perform public.gl_registrar_auditoria(');
    expect(calculo).toBeGreaterThan(-1);
    expect(guardado).toBeGreaterThan(calculo);
    expect(guardado).toBeLessThan(auditoria);
    expect(fn.match(/set resultado = v_resultado/g)).toHaveLength(1);
  });

  it('comprueba coincidencia exacta de columnas en unicidad y FK', () => {
    expect(sql).not.toMatch(/conkey\s*@>/);
    expect(sql).not.toMatch(/confkey\s*@>/);
    expect(sql).toMatch(/c\.conkey\s*=\s*\(\s*select array_agg\(a\.attnum order by a\.attnum\)/);
    expect(sql.match(/and c\.confkey = \(/g)).toHaveLength(2);
  });

  it('exige ok=true y lee error del contrato real de recalcular_clasificacion_interno', () => {
    expect(sql).toContain("coalesce(v_recalculo->>'ok', 'false') <> 'true'");
    expect(sql).toContain("coalesce(v_recalculo->>'error', 'error desconocido')");
  });

  it('garantiza estructura mínima compatible con 1.4.1', () => {
    expect(sql).toContain('torneo_participantes_torneo_jugador_uidx');
    expect(sql).toContain('tp_torneo_fk');
    expect(sql).toContain('tp_jugador_fk');
    expect(sql).toContain('on conflict (torneo_id, jugador_id) do update');
  });

  it('conserva los privilegios de service_role', () => {
    expect(sql).toContain('grant all on public.torneo_participantes to service_role');
    expect(sql.match(/grant execute on function public\.gl_\w+[\s\S]{0,120}to service_role/g).length)
      .toBeGreaterThanOrEqual(4);
  });
});

describe('1.5.0 — jornada libre y estadísticas reales', () => {
  it('GL.resultado usa el 3-0 reglamentario y etiqueta jornada libre', () => {
    const r = window.GL.resultado(partidoLibre);
    expect(r.gf).toBe(3);
    expect(r.gc).toBe(0);
    expect(r.pendiente).toBe(false);
    expect(r.estado.label).toBe('Jornada libre');
  });

  it('GL.esAdministrativo incluye jornada libre', () => {
    expect(window.GL.esAdministrativo(partidoLibre)).toBe(true);
  });

  it('GL.golesReales no atribuye goles de FC Mobile a la jornada libre', () => {
    expect(window.GL.golesReales(partidoLibre)).toEqual({ gf: 0, gc: 0 });
  });

  it('la tabla cuenta 3 puntos y 3 GF reglamentarios', () => {
    const EST = cargarEstadisticas();
    const cl = EST.calcularClasificacion([partidoLibre], RIVAL);
    expect(cl.pts).toBe(3);
    expect(cl.pj).toBe(1);
    expect(cl.pg).toBe(1);
    expect(cl.gf).toBe(3);
    expect(cl.gc).toBe(0);
  });

  it('no cuenta como partido real ni genera goles/vallas reales', () => {
    const EST = cargarEstadisticas();
    expect(EST.calcularGolesReales([partidoLibre], RIVAL))
      .toMatchObject({ pj: 0, gf: 0, gc: 0 });
    expect(EST.calcularVallasInvictas([partidoLibre], RIVAL)).toBe(0);
    expect(EST.calcularPromedios([partidoLibre], RIVAL))
      .toMatchObject({ pj: 0, posN: 0, paseN: 0, tirosN: 0 });
  });

  it('el rendimiento separa clasificación de rendimiento real', () => {
    const EST = cargarEstadisticas();
    const r = EST.calcularRendimiento([partidoLibre], RIVAL);
    expect(r.pts).toBe(3);
    expect(r.gfReglamentario).toBe(3);
    expect(r.partidosReales).toBe(0);
    expect(r.gf).toBe(0);
    expect(r.vallas).toBe(0);
    expect(r.mejorVictoria).toBe('—');
  });

  it('el head-to-head no inventa enfrentamientos reales', () => {
    const EST = cargarEstadisticas();
    expect(EST.calcularHeadToHead([partidoLibre], RIVAL, JUGADOR))
      .toMatchObject({ partidos: 0, g: 0, gf: 0 });
  });
});

describe('1.5.1 — pertenencia por torneo en la UI de administración', () => {
  const codigoAdmin = readFileSync(resolve(raiz, 'js/modulos/admin.js'), 'utf8');
  const codigoGL = readFileSync(resolve(raiz, 'js/core/gl.js'), 'utf8');

  it('ofrece también a los administradores como participantes iniciales', () => {
    const inicio = codigoAdmin.indexOf('function abrirCrearTorneo');
    const fin = codigoAdmin.indexOf('function abrirEliminarTorneo');
    const bloque = codigoAdmin.slice(inicio, fin);
    expect(bloque).toContain('GL.jugadoresGlobales()');
    expect(bloque).not.toMatch(/rol\s*===\s*'jugador'/);
  });

  it('ofrece también administradores como reemplazo, nunca participantes del torneo', () => {
    const inicio = codigoAdmin.indexOf('function modalBajaParticipante');
    const bloque = codigoAdmin.slice(inicio, inicio + 2500);
    expect(bloque).toContain('GL.jugadoresDisponiblesParaReemplazo(j.id)');
    expect(bloque).not.toMatch(/rol\s*===\s*'jugador'/);
    const inicioHelper = codigoGL.indexOf('jugadoresDisponiblesParaReemplazo(jugadorId)');
    const helper = codigoGL.slice(inicioHelper, inicioHelper + 700);
    expect(helper).toContain('GL.participantesActivos()');
    expect(helper).not.toMatch(/rol\s*===\s*'jugador'/);
  });

  it('pasa la titularidad confirmada a la RPC con el nombre correcto', () => {
    const inicio = codigoAdmin.indexOf('function modalConfirmarTelefono');
    const fin = codigoAdmin.indexOf('\n  function ', inicio + 1);
    const bloque = codigoAdmin.slice(inicio, fin > inicio ? fin : undefined);
    expect(bloque).toContain("fondo.querySelector('#cf-titularidad').checked");
    expect(bloque).toContain('confirmarTitularidad,');
    expect(bloque).not.toContain('confirmaTitularidad');
  });

  it('carga el módulo de auditoría cuando una acción se registra antes de visitar la pestaña', () => {
    const inicio = codigoAdmin.indexOf('async function auditar(');
    const bloque = codigoAdmin.slice(inicio, inicio + 1000);
    expect(bloque).toContain("await GL.modulo('auditoria')");
  });

  it('mantiene disponible suspender/expulsar aunque el jugador esté suspendido', () => {
    const inicio = codigoAdmin.indexOf('const expulsado     = GL.esExpulsado(j);');
    expect(inicio).toBe(-1);
    expect(codigoAdmin).toContain("j.activo === false || j.rol === 'expulsado'");
  });
});

describe('1.5.4 — reincorporación sin duplicar solicitud ni membresía', () => {
  it('reactiva la fila histórica del retirado en lugar de insertar otra', () => {
    expect(sql154).toContain('on conflict (torneo_id, jugador_id) do update');
    expect(sql154).toContain("set estado = 'activo'");
  });

  it('deja la solicitud solo en la fila del saliente', () => {
    expect(sql154).not.toContain('solicitud_id = excluded.solicitud_id');
    expect(sql154).toContain('solicitud_id = null');
  });

  it('traslada la membresía histórica al grupo del saliente', () => {
    expect(sql154).toContain('set grupo_id = v_grupo_id');
    expect(sql154).toContain('trg_jugador_unico_por_torneo');
  });
});
