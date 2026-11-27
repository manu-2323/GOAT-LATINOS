/* =====================================================================
   1.5.0 · Pruebas SQL aisladas de bajas, reemplazos y retiros.
   Ejecuta la migración PROPUESTA contra PGlite; nunca conecta a Supabase.
   Los datos son sintéticos y viven solo en memoria.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const raiz = process.cwd();
const fx = nombre => fs.readFileSync(path.join(raiz, 'tests', 'fixtures', nombre), 'utf8').replace(/^\uFEFF/, '');
const migracion = fs.readFileSync(path.join(raiz, 'supabase', 'migration-bajas-reemplazos-1.5.0.sql'), 'utf8').replace(/^\uFEFF/, '');

const T = '11111111-1111-4111-8111-111111111111';
const T2 = '12121212-1212-4212-8212-121212121212';
const G = '22222222-2222-4222-8222-222222222222';
const U_ADMIN = '33333333-3333-4333-8333-333333333333';
const J_ADMIN = '44444444-4444-4444-8444-444444444444';
const J_SAL = '55555555-5555-4555-8555-555555555555';
const J_RIV = '66666666-6666-4666-8666-666666666666';
const J_NEW = '99999999-9999-4999-8999-999999999999';
const J_NEW2 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const S1 = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S2 = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S3 = 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S4 = 'aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S5 = 'aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let fallos = 0, total = 0;
const chk = (nombre, ok, detalle = '') => {
  total++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + nombre + (detalle ? ' — ' + detalle : ''));
  if (!ok) fallos++;
};

const db = new PGlite();
const q = (sql, params = []) => db.query(sql, params);
const escalar = async (sql, params = []) => Object.values((await q(sql, params)).rows[0] || {})[0];
const uid = valor => q('select set_config($1,$2,false)', ['fase323.uid', valor || '']);
const rpc = async (nombre, ...args) => {
  const marcadores = args.map((_, i) => '$' + (i + 1)).join(',');
  const r = await q(`select public.${nombre}(${marcadores}) as r`, args);
  return r.rows[0].r;
};

const bases = ['fase-3.23-esquema.sql', 'fase-3.23-gl_es_admin.sql',
  'fase-3.23-funciones-base.sql', 'fase-3.23-recalcular_clasificacion_interno.sql'];
const cargarBase = async motor => {
  for (const f of bases) await motor.exec(fx(f));
  await motor.exec('create role anon; create role authenticated; create role service_role;');
};
const ayudas = motor => ({
  q: (sql, params = []) => motor.query(sql, params),
  escalar: async (sql, params = []) => Object.values((await motor.query(sql, params)).rows[0] || {})[0],
  uid: valor => motor.query('select set_config($1,$2,false)', ['fase323.uid', valor || '']),
  rpc: async (nombre, ...args) => {
    const marcadores = args.map((_, i) => '$' + (i + 1)).join(',');
    const r = await motor.query(`select public.${nombre}(${marcadores}) as r`, args);
    return r.rows[0].r;
  }
});

await cargarBase(db);
await db.exec(migracion);
chk('MOTOR: PostgreSQL aislado', String(await escalar('select version()')).includes('PostgreSQL'));

await q(`insert into public.torneos (id,nombre,total_jornadas) values ('${T2}','Otra temporada',22)`);
await q(`insert into auth.users (id,email) values
  ('${J_NEW}','entrante@test.invalid'),('${J_NEW2}','entrante2@test.invalid')`);
await q(`insert into public.jugadores (id,user_id,torneo_id,nombre_usuario,rol) values
  ('${J_NEW}','${J_NEW}','${T2}','ENTRANTE','jugador'),
  ('${J_NEW2}','${J_NEW2}','${T2}','ENTRANTE2','jugador')`);
for (let n = 1; n <= 7; n++) {
  await q(`insert into public.jornadas (torneo_id,grupo_id,numero,estado)
    values ('${T}','${G}',${n},'${n <= 6 ? 'cerrada' : 'abierta'}')`);
}
for (let n = 1; n <= 6; n++) {
  await q(`insert into public.partidos (torneo_id,grupo_id,jornada,local_id,visitante_id,estado,goles_local,goles_visitante)
    values ('${T}','${G}',${n},'${J_SAL}','${J_RIV}','jugado',2,1)`);
}
await q(`insert into public.partidos (torneo_id,grupo_id,jornada,local_id,visitante_id,estado)
  values ('${T}','${G}',7,'${J_RIV}','${J_SAL}','pendiente')`);
await q('select public.recalcular_clasificacion_interno($1,$2)', [T, G]);

await uid(U_ADMIN);
chk('Admin autenticado por gl_es_admin', await escalar('select public.gl_es_admin()') === true);
chk('Backfill inscribe participantes reales', Number(await escalar('select count(*) from public.torneo_participantes')) === 2);

// ---- 1) Plazo: secuencia y jornada 7 -------------------------------------
let v = await rpc('gl_ventana_reemplazo', T, J_SAL);
chk('Plazo permite con 1..6 cerradas y 7 abierta', v.reemplazo_permitido === true && v.plazo.motivo === 'dentro_del_plazo', JSON.stringify(v.plazo));

await q(`update public.jornadas set estado='abierta' where torneo_id='${T}' and grupo_id='${G}' and numero=5`);
v = await rpc('gl_ventana_reemplazo', T, J_SAL);
chk('Hueco en la secuencia bloquea', v.reemplazo_permitido === false && v.plazo.motivo === 'secuencia_incompleta', JSON.stringify(v.plazo));
chk('El hueco informa la jornada faltante', JSON.stringify(v.plazo.faltantes) === '[5]', JSON.stringify(v.plazo.faltantes));
await q(`update public.jornadas set estado='cerrada' where torneo_id='${T}' and grupo_id='${G}' and numero=5`);

await q(`update public.jornadas set estado='cerrada' where torneo_id='${T}' and grupo_id='${G}' and numero=7`);
v = await rpc('gl_ventana_reemplazo', T, J_SAL);
chk('Jornada 7 cerrada bloquea explícitamente', v.reemplazo_permitido === false && v.plazo.motivo === 'jornada_7_cerrada', JSON.stringify(v.plazo));
await q(`update public.jornadas set estado='abierta' where torneo_id='${T}' and grupo_id='${G}' and numero=7`);

// ---- 2) Reemplazo dentro del plazo ---------------------------------------
const clsSalAntes = (await q(`select pj,pg,gf,gc,pts from public.clasificacion where jugador_id='${J_SAL}'`)).rows[0];
const clsNewAntes = Number(await escalar(`select count(*) from public.clasificacion where jugador_id='${J_NEW}'`));
chk('Antes: saliente tiene 6 victorias y 18 puntos', clsSalAntes?.pj === 6 && clsSalAntes?.pts === 18, JSON.stringify(clsSalAntes));
chk('Antes: entrante no tiene fila de clasificación', clsNewAntes === 0);

const r1 = await rpc('gl_gestionar_baja', T, J_SAL, 'Prueba aislada', S1, J_NEW);
chk('Reemplazo ejecutado', r1.ok === true && r1.tipo === 'reemplazo', JSON.stringify(r1));
chk('Pendiente reasignado al entrante', Number(await escalar(`select count(*) from public.partidos where estado='pendiente' and visitante_id='${J_NEW}'`)) === 1);
chk('Resultados jugados siguen con el saliente', Number(await escalar(`select count(*) from public.partidos where estado='jugado' and local_id='${J_SAL}'`)) === 6);
chk('Saliente marcado retirado', await escalar(`select estado from public.torneo_participantes where jugador_id='${J_SAL}'`) === 'retirado');
chk('Entrante activo en el mismo grupo', await escalar(`select grupo_id from public.torneo_participantes where jugador_id='${J_NEW}'`) === G);
chk('No se creó otro jugador', Number(await escalar('select count(*) from public.jugadores')) === 6);
chk('No se escribe jugadores.torneo_id en el reemplazo', await escalar(`select torneo_id from public.jugadores where id='${J_NEW}'`) === T2);
const clsSalDespues = (await q(`select pj,pg,gf,gc,pts from public.clasificacion where jugador_id='${J_SAL}'`)).rows[0];
const clsNewDespues = (await q(`select pj,pg,gf,gc,pts from public.clasificacion where jugador_id='${J_NEW}'`)).rows[0];
chk('El saliente sigue en clasificación histórica', Number(await escalar(`select count(*) from public.clasificacion where jugador_id='${J_SAL}'`)) === 1);
chk('Tras reemplazo: saliente conserva 6 victorias y 18 puntos',
  clsSalDespues?.pj === 6 && clsSalDespues?.pg === 6 && clsSalDespues?.pts === 18 &&
  clsSalDespues?.gf === 12 && clsSalDespues?.gc === 6, JSON.stringify(clsSalDespues));
chk('Tras reemplazo: entrante aparece con 0 PJ y 0 puntos (pendiente excluido)',
  clsNewDespues?.pj === 0 && clsNewDespues?.pg === 0 && clsNewDespues?.pts === 0 &&
  clsNewDespues?.gf === 0 && clsNewDespues?.gc === 0, JSON.stringify(clsNewDespues));
chk('No se mezclan goles ni puntos entre saliente y entrante',
  clsSalDespues?.gf === 12 && clsNewDespues?.gf === 0 && clsSalDespues?.pts !== clsNewDespues?.pts);
chk('La RPC informa los grupos recalculados',
  Array.isArray(r1.grupos_recalculados) && r1.grupos_recalculados.includes(G), JSON.stringify(r1.grupos_recalculados));
chk('El histórico de partidos sigue nombrando al saliente', Number(await escalar(`select count(*) from public.partidos where local_id='${J_SAL}'`)) === 6);

const p7re = (await q(`select * from public.partidos where torneo_id='${T}' and jornada=7`)).rows[0];
chk('Reasignación: el partido sigue pendiente', p7re.estado === 'pendiente', p7re.estado);
chk('Reasignación: conserva jornada y grupo', p7re.jornada === 7 && p7re.grupo_id === G);
chk('Reasignación: conserva al rival original y cambia solo el saliente',
  p7re.local_id === J_RIV && p7re.visitante_id === J_NEW && p7re.visitante_id !== J_SAL);
chk('Reasignación: NO escribe campos de resolución',
  p7re.motivo_resolucion === null && p7re.resuelto_por === null && p7re.resuelto_en === null && p7re.participante_retirado_id === null);
chk('Reasignación: conserva autor, momento y motivo propios',
  p7re.reasignado_por === U_ADMIN && p7re.reasignado_en !== null && /Reemplazo/.test(p7re.reasignado_motivo || ''));
chk('El saliente conserva su membresía histórica en grupo_jugadores',
  Number(await escalar(`select count(*) from public.grupo_jugadores where jugador_id='${J_SAL}' and grupo_id='${G}'`)) === 1);
chk('El entrante se incorpora al mismo grupo sin desplazar al saliente',
  Number(await escalar(`select count(*) from public.grupo_jugadores where grupo_id='${G}'`)) === 3);

chk('Resultado guardado ya incluye grupos_recalculados',
  Array.isArray((await q(`select resultado->'grupos_recalculados' as g from public.torneo_participantes where jugador_id='${J_SAL}'`)).rows[0].g));
const retry1 = await rpc('gl_gestionar_baja', T, J_SAL, 'Prueba aislada', S1, J_NEW);
chk('Reintento idempotente del reemplazo', retry1.ya_aplicado === true && retry1.ok === true);
chk('Reintento devuelve los grupos recalculados guardados',
  Array.isArray(retry1.grupos_recalculados) && retry1.grupos_recalculados.includes(G), JSON.stringify(retry1.grupos_recalculados));
chk('Reintento conserva el resto del resultado definitivo',
  retry1.tipo === r1.tipo &&
  retry1.jugador_entrante === r1.jugador_entrante &&
  retry1.partidos_pendientes_reasignados === r1.partidos_pendientes_reasignados);
chk('Reintento no duplica participantes', Number(await escalar('select count(*) from public.torneo_participantes')) === 3);
const yaInscripto = await rpc('gl_inscribir_participantes', T, [J_SAL]);
chk('Inscripción repetida no duplica filas', yaInscripto.ok === true && yaInscripto.inscritos === 0 && Number(await escalar('select count(*) from public.torneo_participantes')) === 3);
const rechazado = await rpc('gl_gestionar_baja', T, J_RIV, 'Otro intento', S5, J_NEW);
chk('Reemplazo con jugador ya participante es rechazado', rechazado.ok === false, JSON.stringify(rechazado));

// ---- 3) Backfill repara grupo_id vacío -----------------------------------
await q(`update public.torneo_participantes set grupo_id=null where torneo_id='${T}' and jugador_id='${J_RIV}'`);
await db.exec(migracion);
chk('Backfill repara grupo_id vacío sin borrar filas',
  await escalar(`select grupo_id from public.torneo_participantes where torneo_id='${T}' and jugador_id='${J_RIV}'`) === G &&
  Number(await escalar('select count(*) from public.torneo_participantes')) === 3);

// ---- 4) Recuperación de grupo en gl_gestionar_baja -----------------------
const reiniciar = async reemplazo => {
  if (reemplazo) {
    // El saliente conserva su membresía histórica; se retira solo al entrante.
    await q(`delete from public.grupo_jugadores where jugador_id='${reemplazo}'`);
    await q(`delete from public.torneo_participantes where torneo_id='${T}' and jugador_id='${reemplazo}'`);
    await q(`update public.partidos set visitante_id='${J_SAL}' where torneo_id='${T}' and jornada=7`);
  }
  await q(`update public.torneo_participantes
    set estado='activo', retirado_en=null, motivo=null, resolucion=null,
        reemplazo_id=null, solicitud_id=null, resultado=null, grupo_id=null
    where torneo_id='${T}' and jugador_id='${J_SAL}'`);
  await q(`update public.jornadas set estado='abierta' where torneo_id='${T}' and grupo_id='${G}' and numero=7`);
};
await reiniciar(J_NEW);
const r2 = await rpc('gl_gestionar_baja', T, J_SAL, 'Recuperar grupo', S2, J_NEW2);
chk('Baja resuelve grupo desde grupo_jugadores', r2.ok === true && r2.grupo_id === G, JSON.stringify(r2));
chk('Participante saliente queda con grupo_id reparado',
  await escalar(`select grupo_id from public.torneo_participantes where jugador_id='${J_SAL}'`) === G);
chk('Entrante se incorpora con grupo resuelto',
  await escalar(`select grupo_id from public.torneo_participantes where jugador_id='${J_NEW2}'`) === G);
chk('Puntero de otra temporada permanece intacto',
  await escalar(`select torneo_id from public.jugadores where id='${J_NEW2}'`) === T2);

// ---- 5) Retiro sin reemplazo ---------------------------------------------
await reiniciar(J_NEW2);
await q(`update public.jornadas set estado='cerrada' where torneo_id='${T}' and grupo_id='${G}' and numero=7`);
v = await rpc('gl_ventana_reemplazo', T, J_SAL);
chk('Ventana cerrada tras jornada 7', v.reemplazo_permitido === false && v.plazo.motivo === 'jornada_7_cerrada');
const bloqueado = await rpc('gl_gestionar_baja', T, J_SAL, 'Intento fuera de plazo', S4, J_NEW);
chk('RPC bloquea reemplazo aunque se llame directo', bloqueado.ok === false, JSON.stringify(bloqueado));

const r3 = await rpc('gl_gestionar_baja', T, J_SAL, 'Retiro definitivo', S2);
chk('Retiro ejecutado', r3.ok === true && r3.tipo === 'retiro', JSON.stringify(r3));
const p7 = (await q(`select * from public.partidos where torneo_id='${T}' and jornada=7`)).rows[0];
chk('Jornada libre guarda 3-0 al rival', p7.estado === 'jornada_libre' && p7.goles_local === 3 && p7.goles_visitante === 0,
  JSON.stringify({ estado: p7.estado, gl: p7.goles_local, gv: p7.goles_visitante }));
chk('Motivo y autoría registrados', /baja del torneo/.test(p7.motivo_resolucion) && p7.resuelto_por === U_ADMIN);
chk('Historial del partido guardado', Number(await escalar(`select count(*) from public.partidos_historial where partido_id='${p7.id}' and estado_nuevo='jornada_libre'`)) === 1);
chk('Partidos jugados intactos', Number(await escalar(`select count(*) from public.partidos where estado='jugado' and goles_local=2 and goles_visitante=1`)) === 6);
chk('Auditoría visible', Number(await escalar(`select count(*) from public.auditoria_eventos where entidad_tipo='participante' and accion='participante_retiro'`)) === 1);
const clsRiv = (await q(`select pts,gf,gc,pj,pg from public.clasificacion where jugador_id='${J_RIV}'`)).rows[0];
const clsSal = (await q(`select pts,gf,gc,pj,pg from public.clasificacion where jugador_id='${J_SAL}'`)).rows[0];
chk('Clasificación del rival: 3-0 reglamentario', clsRiv?.pts === 3 && clsRiv?.gf === 9 && clsRiv?.gc === 12 && clsRiv?.pg === 1, JSON.stringify(clsRiv));
chk('Clasificación del retirado conserva 6 victorias', clsSal?.pts === 18 && clsSal?.pj === 7 && clsSal?.pg === 6 && clsSal?.gf === 12 && clsSal?.gc === 9, JSON.stringify(clsSal));
chk('Cuenta global intacta', Number(await escalar(`select count(*) from public.jugadores where id='${J_SAL}'`)) === 1);
chk('Estado retirado en participantes', await escalar(`select estado from public.torneo_participantes where jugador_id='${J_SAL}'`) === 'retirado');
chk('Grupo del participante no se pierde en el retiro',
  await escalar(`select grupo_id from public.torneo_participantes where jugador_id='${J_SAL}'`) === G);
const retry3 = await rpc('gl_gestionar_baja', T, J_SAL, 'Retiro definitivo', S2);
chk('Reintento del retiro no duplica jornadas libres', retry3.ya_aplicado === true && Number(await escalar(`select count(*) from public.partidos where estado='jornada_libre'`)) === 1);
chk('Reintento no duplica auditoría', Number(await escalar(`select count(*) from public.auditoria_eventos where accion='participante_retiro'`)) === 1);

// ---- 6) Permisos de service_role -----------------------------------------
chk('service_role conserva SELECT en la tabla nueva',
  await escalar(`select has_table_privilege('service_role','public.torneo_participantes','SELECT')`) === true);
for (const firma of [
  'gl_inscribir_participantes(uuid, uuid[])',
  'gl_ventana_reemplazo(uuid, uuid)',
  'gl_evaluar_plazo_reemplazo(uuid, uuid)',
  'gl_gestionar_baja(uuid, uuid, text, uuid, uuid)'
]) {
  chk('service_role conserva EXECUTE en ' + firma,
    await escalar(`select has_function_privilege('service_role','public.${firma}','EXECUTE')`) === true);
}

// ---- 7) Compatibilidad estructural B: 1.4.1 ya aplicada -------------------
const sql141 = fs.readFileSync(path.join(raiz, 'supabase', 'migration-participantes-1.4.1.sql'), 'utf8').replace(/^\uFEFF/, '');
const db141 = new PGlite();
await cargarBase(db141);
const h141 = ayudas(db141);
await db141.exec(sql141);
chk('1.4.1: PK EXACTA (torneo_id, jugador_id) antes de 1.5.0',
  Number(await h141.escalar(`select count(*) from pg_constraint
    where conrelid='public.torneo_participantes'::regclass and contype='p'
      and conkey = (select array_agg(attnum order by attnum)::smallint[] from pg_attribute
        where attrelid='public.torneo_participantes'::regclass and attname in ('torneo_id','jugador_id'))`)) === 1);
chk('1.4.1: FK exactas a torneos(id) y jugadores(id)',
  Number(await h141.escalar(`select count(*) from pg_constraint c
    where c.conrelid='public.torneo_participantes'::regclass and c.contype='f'
      and ((c.confrelid='public.torneos'::regclass
              and c.conkey = (select array_agg(attnum order by attnum)::smallint[] from pg_attribute where attrelid=c.conrelid and attname='torneo_id')
              and c.confkey = (select array_agg(attnum order by attnum)::smallint[] from pg_attribute where attrelid=c.confrelid and attname='id'))
         or (c.confrelid='public.jugadores'::regclass
              and c.conkey = (select array_agg(attnum order by attnum)::smallint[] from pg_attribute where attrelid=c.conrelid and attname='jugador_id')
              and c.confkey = (select array_agg(attnum order by attnum)::smallint[] from pg_attribute where attrelid=c.confrelid and attname='id')))`)) === 2);
chk('1.4.1: backfill inserta participantes reales',
  Number(await h141.escalar('select count(*) from public.torneo_participantes')) === 2);

await db141.exec(migracion);
chk('1.5.0 sobre 1.4.1: columnas nuevas agregadas',
  Number(await h141.escalar(`select count(*) from information_schema.columns
    where table_schema='public' and table_name='torneo_participantes'
      and column_name in ('grupo_id','estado','retirado_en','motivo','resolucion',
        'reemplazo_id','registrado_por','solicitud_id','resultado')`)) === 9);
chk('1.5.0 sobre 1.4.1: CHECK de estado y resolución',
  Number(await h141.escalar(`select count(*) from pg_constraint
    where conrelid='public.torneo_participantes'::regclass
      and conname in ('tp_estado_valido','tp_resolucion_valida')`)) === 2);
chk('1.5.0 sobre 1.4.1: ON CONFLICT no duplica filas',
  Number(await h141.escalar('select count(*) from public.torneo_participantes')) === 2);
await h141.q('create table public.tmp_tres (a uuid, b uuid, c uuid, unique (a,b,c))');
chk('Comprobación exacta rechaza única con columna adicional',
  Number(await h141.escalar(`select count(*) from pg_constraint c
    where c.conrelid='public.tmp_tres'::regclass and c.contype='u'
      and c.conkey = (select array_agg(attnum order by attnum)::smallint[] from pg_attribute
        where attrelid=c.conrelid and attname in ('a','b'))`)) === 0);
chk('1.5.0 sobre 1.4.1: filas heredadas quedan activas',
  Number(await h141.escalar(`select count(*) from public.torneo_participantes where estado='activo'`)) === 2);
chk('1.5.0 sobre 1.4.1: políticas de la tabla nueva conservadas',
  Number(await h141.escalar(`select count(*) from pg_policies
    where schemaname='public' and tablename='torneo_participantes'
      and policyname in ('tp_select','tp_admin_write')`)) === 2);
chk('1.5.0 sobre 1.4.1: authenticated conserva SELECT/INSERT/DELETE y suma UPDATE',
  await h141.escalar(`select has_table_privilege('authenticated','public.torneo_participantes','SELECT')`) === true &&
  await h141.escalar(`select has_table_privilege('authenticated','public.torneo_participantes','INSERT')`) === true &&
  await h141.escalar(`select has_table_privilege('authenticated','public.torneo_participantes','DELETE')`) === true &&
  await h141.escalar(`select has_table_privilege('authenticated','public.torneo_participantes','UPDATE')`) === true);
let privilegios141 = true;
for (const p of ['SELECT','INSERT','UPDATE','DELETE']) {
  privilegios141 = privilegios141 &&
    await h141.escalar(`select has_table_privilege('service_role','public.torneo_participantes','${p}')`) === true;
}
chk('1.5.0 sobre 1.4.1: service_role conserva los cuatro privilegios', privilegios141);

// ---- 8) Concurrencia: ambos órdenes de reemplazo y cierre de J7 -----------
// Arnés local: reproduce el orden de escrituras de gl_cerrar_jornada_interno
// desplegado (UPDATE partidos -> UPDATE jornadas, sin FOR UPDATE explícito).
// La exclusión mutua NO depende de este orden de filas: se demuestra en el
// apartado 9 por modos de bloqueo de TABLA incompatibles.
const cerradorDesplegado = `
create or replace function public.gl_cerrar_jornada_interno(
  p_torneo_id uuid, p_grupo_id uuid, p_jornada integer,
  p_resoluciones jsonb, p_cerrado_por uuid)
returns json language plpgsql security definer set search_path = '' as $c$
declare v_admin_id uuid;
begin
  select id into v_admin_id from public.jugadores
   where user_id = p_cerrado_por and rol = 'admin' limit 1;
  if v_admin_id is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;
  if not exists (select 1 from public.jornadas
    where torneo_id=p_torneo_id and grupo_id=p_grupo_id
      and numero=p_jornada and estado <> 'cerrada') then
    return json_build_object('ok', false, 'error', 'Jornada no abierta');
  end if;
  update public.partidos
     set estado='doble_ausencia', goles_local=0, goles_visitante=0,
         ingresado_por=v_admin_id, updated_at=now()
   where torneo_id=p_torneo_id and grupo_id=p_grupo_id
     and jornada=p_jornada and estado='pendiente';
  update public.jornadas set estado='cerrada'
   where torneo_id=p_torneo_id and grupo_id=p_grupo_id and numero=p_jornada;
  perform public.recalcular_clasificacion_interno(p_torneo_id, p_grupo_id);
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false, 'error', sqlerrm);
end $c$;`;

const sembrarConc = async h => {
  await h.q(`insert into public.torneos (id,nombre,total_jornadas) values ('${T2}','Otra temporada',22)`);
  await h.q(`insert into auth.users (id,email) values
    ('${J_NEW}','entranteA@test.invalid'),('${J_NEW2}','entranteB@test.invalid')`);
  await h.q(`insert into public.jugadores (id,user_id,torneo_id,nombre_usuario,rol) values
    ('${J_NEW}','${J_NEW}','${T2}','ENTRANTE_A','jugador'),
    ('${J_NEW2}','${J_NEW2}','${T2}','ENTRANTE_B','jugador')`);
  for (let n = 1; n <= 7; n++) {
    await h.q(`insert into public.jornadas (torneo_id,grupo_id,numero,estado)
      values ('${T}','${G}',${n},'${n <= 6 ? 'cerrada' : 'abierta'}')`);
  }
  for (let n = 1; n <= 6; n++) {
    await h.q(`insert into public.partidos (torneo_id,grupo_id,jornada,local_id,visitante_id,estado,goles_local,goles_visitante)
      values ('${T}','${G}',${n},'${J_SAL}','${J_RIV}','jugado',2,1)`);
  }
  await h.q(`insert into public.partidos (torneo_id,grupo_id,jornada,local_id,visitante_id,estado)
    values ('${T}','${G}',7,'${J_RIV}','${J_SAL}','pendiente')`);
  await h.q('select public.recalcular_clasificacion_interno($1,$2)', [T, G]);
  await h.uid(U_ADMIN);
};
const cerrarJ7 = async h => {
  const r = await h.q(`select public.gl_cerrar_jornada_interno($1,$2,$3,$4,$5) as r`,
    [T, G, 7, '[]', U_ADMIN]);
  return r.rows[0].r;
};

// Orden A: reemplazo primero, cierre de J7 después. El reemplazo es válido;
// cualquier intendente posterior debe quedar bloqueado.
const dbA = new PGlite();
await cargarBase(dbA);
await dbA.exec(migracion);
await dbA.exec(cerradorDesplegado);
const hA = ayudas(dbA);
await sembrarConc(hA);
const raA = await hA.rpc('gl_gestionar_baja', T, J_SAL, 'Orden A', S1, J_NEW);
chk('Concurrencia A: reemplazo antes de cerrar J7 es aceptado', raA.ok === true, JSON.stringify(raA));
const rcA = await cerrarJ7(hA);
chk('Concurrencia A: cierre de J7 posterior es aceptado', rcA.ok === true, JSON.stringify(rcA));
chk('Concurrencia A: J7 queda cerrada',
  await hA.escalar(`select estado from public.jornadas where torneo_id='${T}' and grupo_id='${G}' and numero=7`) === 'cerrada');
const rbA = await hA.rpc('gl_gestionar_baja', T, J_RIV, 'Orden A tardío', S2, J_NEW2);
chk('Concurrencia A: reemplazo tardío tras J7 es rechazado',
  rbA.ok === false && /jornada_7_cerrada/.test(rbA.mensaje || ''), JSON.stringify(rbA));
chk('Concurrencia A: el reemplazo tardío no agrega participante',
  Number(await hA.escalar(`select count(*) from public.torneo_participantes where jugador_id='${J_NEW2}'`)) === 0);

// Orden B: cierre de J7 primero, reemplazo después. Debe rechazarse.
const dbB = new PGlite();
await cargarBase(dbB);
await dbB.exec(migracion);
await dbB.exec(cerradorDesplegado);
const hB = ayudas(dbB);
await sembrarConc(hB);
const rcB = await cerrarJ7(hB);
chk('Concurrencia B: cierre de J7 es aceptado', rcB.ok === true, JSON.stringify(rcB));
const rbB = await hB.rpc('gl_gestionar_baja', T, J_SAL, 'Orden B', S1, J_NEW);
chk('Concurrencia B: reemplazo posterior a J7 es rechazado',
  rbB.ok === false && /jornada_7_cerrada/.test(rbB.mensaje || ''), JSON.stringify(rbB));
chk('Concurrencia B: no se reasigna ningún pendiente al entrante',
  Number(await hB.escalar(`select count(*) from public.partidos where visitante_id='${J_NEW}'`)) === 0);
chk('Concurrencia B: el saliente sigue activo en participantes',
  await hB.escalar(`select estado from public.torneo_participantes where jugador_id='${J_SAL}'`) === 'activo');

// ---- 9) Modos de bloqueo: demostración de exclusión mutua ----------------
await q('begin');
await q('lock table public.partidos in share row exclusive mode');
await q('lock table public.jornadas in share row exclusive mode');
const modosBaja = (await q(`select mode from pg_locks
  where pid=pg_backend_pid() and granted
    and relation in ('public.partidos'::regclass,'public.jornadas'::regclass)`)).rows.map(r => r.mode);
chk('La baja toma ShareRowExclusiveLock en partidos y jornadas',
  modosBaja.filter(m => m === 'ShareRowExclusiveLock').length === 2, JSON.stringify(modosBaja));
await q('rollback');

await q('begin');
await q('update public.partidos set updated_at=updated_at where id=(select id from public.partidos limit 1)');
await q('update public.jornadas set estado=estado where id=(select id from public.jornadas limit 1)');
const modosCierre = (await q(`select mode from pg_locks
  where pid=pg_backend_pid() and granted
    and relation in ('public.partidos'::regclass,'public.jornadas'::regclass)`)).rows.map(r => r.mode);
chk('Los UPDATE del cierre toman RowExclusiveLock en partidos y jornadas',
  modosCierre.filter(m => m === 'RowExclusiveLock').length === 2, JSON.stringify(modosCierre));
await q('rollback');

console.log(`RESUMEN: ${total - fallos}/${total} verificaciones correctas; ${fallos} fallo(s).`);
process.exit(fallos ? 1 : 0);
