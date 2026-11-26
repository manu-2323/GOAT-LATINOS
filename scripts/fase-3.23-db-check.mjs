/* =====================================================================
   FASE 3.23 · Pruebas SQL reales en entorno aislado (PGlite / PostgreSQL)
   =====================================================================
   No conecta con Supabase. Ejecuta los cuerpos SQL leídos en producción
   contra un esquema sintético con las mismas restricciones y una migración
   propuesta. Los datos son ficticios y viven solo en memoria.

   Uso: node scripts/fase-3.23-db-check.mjs
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const raiz = process.cwd();
const fx = nombre => fs.readFileSync(path.join(raiz, 'tests', 'fixtures', nombre), 'utf8').replace(/^\uFEFF/, '');
const migracion = fs.readFileSync(path.join(raiz, 'supabase', 'migration-fase-3.23-cierre-jornada.sql'), 'utf8').replace(/^\uFEFF/, '');

const T = '11111111-1111-4111-8111-111111111111';
const G = '22222222-2222-4222-8222-222222222222';
const U_ADMIN = '33333333-3333-4333-8333-333333333333';
const J_ADMIN = '44444444-4444-4444-8444-444444444444';
const J_LOCAL = '55555555-5555-4555-8555-555555555555';
const J_VISITA = '66666666-6666-4666-8666-666666666666';
const U_NO_ADMIN = '77777777-7777-4777-8777-777777777777';
const JORNADA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTIDO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let fallos = 0;
let total = 0;
const db = new PGlite();

function chequeo(nombre, condicion, detalle = '') {
  total++;
  if (condicion) {
    console.log('PASS  ' + nombre + (detalle ? ' — ' + detalle : ''));
  } else {
    fallos++;
    console.log('FAIL  ' + nombre + (detalle ? ' — ' + detalle : ''));
  }
}

const query = (sql, params = []) => db.query(sql, params);
const fila = async (sql, params = []) => (await query(sql, params)).rows[0];
const escalar = async (sql, params = []) => Object.values((await fila(sql, params)) || {})[0];
const cant = async (tabla, where = '', params = []) =>
  Number(await escalar(`select count(*) from public.${tabla} ${where}`, params));

async function uid(valor) {
  await query('select set_config($1, $2, false)', ['fase323.uid', valor || '']);
}

async function reiniciar() {
  await db.exec(`
    truncate public.partidos_historial, public.partidos, public.jornadas,
      public.clasificacion, public.sanciones, public.auditoria,
      public.auditoria_eventos, public.bitacora_jornadas cascade;
    insert into public.jornadas
      (id, torneo_id, grupo_id, numero, estado)
    values ('${JORNADA}', '${T}', '${G}', 1, 'abierta');
    insert into public.partidos
      (id, torneo_id, grupo_id, jornada, local_id, visitante_id, estado, goles_local, goles_visitante)
    values ('${PARTIDO}', '${T}', '${G}', 1, '${J_LOCAL}', '${J_VISITA}', 'pendiente', null, null);
  `);
}

const cerrar = resoluciones => query(
  'select public.gl_cerrar_jornada($1::uuid,$2::uuid,$3::integer,$4::jsonb,$5::uuid) as resultado',
  [T, G, 1, JSON.stringify(resoluciones || []), U_ADMIN]
).then(r => r.rows[0].resultado);

const guardar = (golesLocal, golesVisita, motivo = null, estado = 'jugado') => query(
  'select public.gl_guardar_resultado($1::uuid,$2::uuid,$3::integer,$4::integer,$5::text,$6::text,$7::uuid,$8::text,$9::jsonb) as resultado',
  [PARTIDO, T, golesLocal, golesVisita, estado, null, U_ADMIN, motivo, '{}']
).then(r => r.rows[0].resultado);

console.log('FASE 3.23 · verificación SQL aislada');
const version = (await query('select version() as v')).rows[0].v;
console.log('MOTOR: ' + version);
console.log('FECHA: 2026-11-26');
console.log('');

try {
  await db.exec(fx('fase-3.23-esquema.sql'));
  await db.exec(fx('fase-3.23-gl_es_admin.sql'));
  await db.exec(fx('fase-3.23-recalcular_clasificacion_interno.sql'));
  await db.exec(fx('fase-3.23-funciones-base.sql'));
  await db.exec(fx('fase-3.23-cierre-original.sql'));
  await db.exec(fx('fase-3.23-guardar-original.sql'));
  await uid(U_ADMIN);

  console.log('-- A. Reproducción con el código actual de producción --');
  await reiniciar();
  let sqlstate = null;
  try {
    await query(`insert into public.auditoria
      (torneo_id, usuario_id, accion, tabla_afectada, detalle, created_at)
      values ($1::uuid, $2::uuid, 'jornada_cerrada', 'jornadas', '{}'::jsonb, now())`, [T, U_ADMIN]);
  } catch (e) { sqlstate = e.code || null; }
  chequeo('A1 INSERT legacy devuelve SQLSTATE 42703', sqlstate === '42703', 'sqlstate=' + sqlstate);

  let r = await cerrar([]);
  chequeo('A2 cierre actual devuelve ok=false', r && r.ok === false, JSON.stringify(r));
  chequeo('A3 mensaje identifica la FK de ingresado_por', String(r.error || '').includes('partidos_ingresado_por_fkey'));

  // Sin partidos pendientes se evita la FK y se alcanza el INSERT legacy.
  await reiniciar();
  await db.exec(`update public.partidos set estado='jugado', goles_local=1, goles_visitante=0 where id='${PARTIDO}';`);
  const rLegacy = await cerrar([]);
  chequeo('A3b sin pendientes aparece el error de jornadas.updated_at',
    rLegacy && rLegacy.ok === false && String(rLegacy.error).includes('updated_at'), JSON.stringify(rLegacy));
  chequeo('A3c el rollback deja la jornada abierta',
    (await escalar('select estado from public.jornadas where id=$1', [JORNADA])) === 'abierta');
  await reiniciar();
  chequeo('A4 jornada sigue abierta tras el fallo',
    (await escalar('select estado from public.jornadas where id=$1', [JORNADA])) === 'abierta');
  chequeo('A5 partido sigue pendiente tras el fallo',
    (await escalar('select estado from public.partidos where id=$1', [PARTIDO])) === 'pendiente');
  chequeo('A6 sin auditoría ni clasificación escrita',
    (await cant('auditoria_eventos')) === 0 && (await cant('clasificacion')) === 0);

  await reiniciar();
  r = await guardar(2, 1);
  chequeo('A7 carga de resultado actual devuelve ok=false', r && r.ok === false, JSON.stringify(r));
  chequeo('A8 fallo es por FK de registrado_por',
    String(r.error || '').includes('partidos_historial') && String(r.error || '').includes('foreign key'));
  chequeo('A9 partido no queda modificado',
    (await escalar('select estado from public.partidos where id=$1', [PARTIDO])) === 'pendiente');

  console.log('');
  console.log('-- B. Aplicación de la migración propuesta en el arnés --');
  const partesMigracion = migracion
    .split(/(?=^CREATE OR REPLACE FUNCTION )/m)
    .filter(parte => parte.trimStart().startsWith('CREATE OR REPLACE FUNCTION'));
  for (const parte of partesMigracion) await db.exec(parte);
  chequeo('B0 migración contiene dos funciones corregidas', partesMigracion.length === 2, 'partes=' + partesMigracion.length);
  chequeo('B1 migración crea la función corregida',
    Number(await escalar("select count(*) from pg_proc where proname='gl_cerrar_jornada_interno'")) >= 1);

  console.log('');
  console.log('-- C. Cierre correcto --');
  await reiniciar();
  await uid(U_ADMIN);
  r = await cerrar([]);
  chequeo('C1 cierre devuelve ok=true', r && r.ok === true, JSON.stringify(r));
  chequeo('C2 contador informa solo resoluciones explícitas', r && r.partidos_resueltos === 0);
  chequeo('C3 jornada queda cerrada',
    (await escalar('select estado from public.jornadas where id=$1', [JORNADA])) === 'cerrada');
  const partido = await fila('select * from public.partidos where id=$1', [PARTIDO]);
  chequeo('C4 partido en doble_ausencia 0-0', partido.estado === 'doble_ausencia' && partido.goles_local === 0 && partido.goles_visitante === 0);
  chequeo('C5 ingresado_por es jugador_id (FK), no auth.uid()', partido.ingresado_por === J_ADMIN, String(partido.ingresado_por));
  chequeo('C6 clasificación tiene 2 filas, sin duplicados', (await cant('clasificacion')) === 2);
  const clasif = await fila('select * from public.clasificacion where jugador_id=$1', [J_LOCAL]);
  chequeo('C7 clasificación recalculada', clasif.pj === 1 && clasif.pe === 1 && clasif.pts === 1, JSON.stringify(clasif));
  const aud = await fila('select * from public.auditoria_eventos');
  chequeo('C8 auditoría visible en auditoria_eventos',
    !!aud && aud.accion === 'jornada_cerrada' && aud.entidad_tipo === 'jornada' && aud.entidad_id === JORNADA,
    JSON.stringify(aud));
  chequeo('C9 auditoría conserva grupo, usuario y detalle',
    !!aud && aud.grupo_id === G && aud.realizado_por === U_ADMIN &&
      aud.detalle.jornada === 1 && aud.detalle.partidos_resueltos === 0,
    JSON.stringify(aud && aud.detalle));
  chequeo('C10 la tabla auditoria legacy no recibe filas', (await cant('auditoria')) === 0);
  chequeo('C11 relaciones válidas (auditoría → jornada → grupo)',
    Number(await escalar(`select count(*) from public.auditoria_eventos a
      join public.jornadas j on j.id=a.entidad_id
      join public.grupos g on g.id=j.grupo_id and g.id=a.grupo_id`)) === 1);

  console.log('');
  console.log('-- D. Envíos repetidos e idempotencia --');
  r = await cerrar([]);
  chequeo('D1 segundo cierre devuelve ok=false', r && r.ok === false, JSON.stringify(r));
  chequeo('D2 mensaje de jornada ya cerrada', String(r.error || '').includes('ya está cerrada'));
  chequeo('D3 no duplica auditoría', (await cant('auditoria_eventos')) === 1);
  chequeo('D4 no duplica clasificación', (await cant('clasificacion')) === 2);

  console.log('');
  console.log('-- E. Resolución administrativa --');
  await reiniciar();
  r = await cerrar([{ partido_id: PARTIDO, estado: 'walkover_local' }]);
  const resuelto = await fila('select * from public.partidos where id=$1', [PARTIDO]);
  chequeo('E1 acepta resolución walkover_local', r && r.ok === true && resuelto.estado === 'walkover_local' && resuelto.goles_local === 3 && resuelto.goles_visitante === 0, JSON.stringify(r));
  const local = await fila('select * from public.clasificacion where jugador_id=$1', [J_LOCAL]);
  chequeo('E2 clasificación del ganador', local.pg === 1 && local.pts === 3 && local.gf === 3, JSON.stringify(local));
  chequeo('E3 detalle cuenta solo resoluciones explícitas',
    (await escalar('select detalle->>\'partidos_resueltos\' from public.auditoria_eventos limit 1')) === '1');

  console.log('');
  console.log('-- F. Rollback transaccional ante fallo dependiente --');
  await reiniciar();
  await db.exec(`create or replace function public.recalcular_clasificacion_interno(
    p_torneo_id uuid, p_grupo_id uuid default null)
    returns json language plpgsql security definer set search_path = 'public', 'pg_temp' as $f$
    begin raise exception 'fallo forzado 3.23'; end; $f$;`);
  r = await cerrar([]);
  chequeo('F1 fallo dependiente devuelve ok=false', r && r.ok === false, JSON.stringify(r));
  chequeo('F2 jornada no queda cerrada',
    (await escalar('select estado from public.jornadas where id=$1', [JORNADA])) === 'abierta');
  chequeo('F3 partido no queda resuelto',
    (await escalar('select estado from public.partidos where id=$1', [PARTIDO])) === 'pendiente');
  chequeo('F4 no queda auditoría', (await cant('auditoria_eventos')) === 0);
  await db.exec(fx('fase-3.23-recalcular_clasificacion_interno.sql'));

  console.log('');
  console.log('-- G. Permisos y jornada no persistida --');
  await reiniciar();
  await uid(U_NO_ADMIN);
  r = await cerrar([]);
  chequeo('G1 no-admin no puede cerrar', r && r.ok === false && String(r.error).includes('permisos'), JSON.stringify(r));
  chequeo('G2 sin cambios para no-admin',
    (await escalar('select estado from public.jornadas where id=$1', [JORNADA])) === 'abierta');
  await uid(null);
  r = await cerrar([]);
  chequeo('G3 sin sesión no puede cerrar', r && r.ok === false, JSON.stringify(r));

  await uid(U_ADMIN);
  await db.exec(`delete from public.partidos where id='${PARTIDO}'; delete from public.jornadas where id='${JORNADA}';`);
  r = await cerrar([]);
  chequeo('G4 jornada virtual sin id es rechazada', r && r.ok === false && String(r.error).includes('no encontrada'), JSON.stringify(r));
  chequeo('G5 no se crea jornada fantasma', (await cant('jornadas')) === 0);

  console.log('');
  console.log('-- H. Carga y corrección de resultados --');
  await reiniciar();
  await uid(U_ADMIN);
  r = await guardar(2, 1);
  chequeo('H1 resultado corregido devuelve ok=true', r && r.ok === true, JSON.stringify(r));
  const jugado = await fila('select * from public.partidos where id=$1', [PARTIDO]);
  chequeo('H2 marcador guardado', jugado.estado === 'jugado' && jugado.goles_local === 2 && jugado.goles_visitante === 1);
  chequeo('H3 ingresado_por usa jugador_id', jugado.ingresado_por === J_ADMIN);
  const hist = await fila('select * from public.partidos_historial');
  chequeo('H4 historial usa registrado_por jugador_id', !!hist && hist.registrado_por === J_ADMIN, JSON.stringify(hist));
  chequeo('H5 historial tiene una sola fila', (await cant('partidos_historial')) === 1);
  r = await guardar(2, 1);
  chequeo('H6 resultado duplicado sin motivo es rechazado', r && r.ok === false && String(r.error).includes('motivo'), JSON.stringify(r));
  r = await guardar(3, 1, 'corrección de prueba');
  chequeo('H7 corrección con motivo es aceptada', r && r.ok === true && r.es_correccion === true, JSON.stringify(r));
  chequeo('H8 historial registra ambas versiones', (await cant('partidos_historial')) === 2);
  chequeo('H9 no se duplica el partido', (await cant('partidos', "where id=$1", [PARTIDO])) === 1);
} catch (e) {
  fallos++;
  console.log('FAIL  Error inesperado del arnés — ' + (e.stack || e.message));
}

console.log('');
console.log(`RESUMEN: ${total - fallos}/${total} verificaciones correctas; ${fallos} fallo(s).`);
await db.close();
process.exit(fallos ? 1 : 0);
