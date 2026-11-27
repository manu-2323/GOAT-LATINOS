/* 1.5.1 · Prueba aislada (PGlite) de la eliminación de torneo y su rollback.
   Nunca conecta a Supabase; los datos son sintéticos y viven solo en memoria. */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const raiz = process.cwd();
const leer = r => fs.readFileSync(path.join(raiz, r), 'utf8').replace(/^\uFEFF/, '');
const migracion150 = leer('supabase/migration-bajas-reemplazos-1.5.0.sql');
const migracion151 = leer('supabase/migration-eliminar-torneo-y-participantes-1.5.1.sql');

const T = 'aaaaaaa1-1111-4111-8111-111111111111';
const T2 = 'aaaaaaa2-2222-4222-8222-222222222222';
const G = 'bbbbbbb1-1111-4111-8111-111111111111';
const U_ADMIN = 'ccccccc1-1111-4111-8111-111111111111';
const U_JUG = 'ccccccc2-2222-4222-8222-222222222222';
const U_OTRO = 'ccccccc3-3333-4333-8333-333333333333';

let total = 0, fallos = 0;
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

for (const f of ['fase-3.23-esquema.sql', 'fase-3.23-gl_es_admin.sql',
  'fase-3.23-funciones-base.sql', 'fase-3.23-recalcular_clasificacion_interno.sql']) {
  await db.exec(leer('tests/fixtures/' + f));
}
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec('alter table public.jugadores add column if not exists created_at timestamptz;');
await db.exec("alter table public.torneos add column if not exists estado text default 'activo';");
await db.exec(`create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos(id) on delete cascade,
  jugador_id uuid,
  mensaje text
);`);
await db.exec(migracion150);

/* El fixture trae datos sintéticos propios. Los retiramos para que el backfill
   de 1.5.1 solo vea las tres asignaciones reales que este arnés simula. */
for (const tabla of ['partidos_historial', 'partidos', 'jornadas', 'clasificacion',
  'sanciones', 'auditoria', 'auditoria_eventos', 'bitacora_jornadas', 'notificaciones',
  'torneo_participantes', 'grupo_jugadores', 'grupos', 'jugadores', 'torneos']) {
  await db.exec('delete from public.' + tabla + ';');
}
await db.exec('delete from auth.users;');

await q(`insert into public.torneos (id,nombre,total_jornadas) values ('${T}','Torneo real',22)`);
await q(`insert into public.grupos (id,nombre,torneo_id) values ('${G}','Grupo A','${T}')`);
await q(`insert into auth.users (id,email) values
  ('${U_ADMIN}','admin@test.invalid'),('${U_JUG}','jugador@test.invalid'),('${U_OTRO}','otro@test.invalid')`);
await q(`insert into public.jugadores (id,user_id,torneo_id,nombre_usuario,rol,activo) values
  ('${U_ADMIN}','${U_ADMIN}','${T}','ADMIN','admin',true),
  ('${U_JUG}','${U_JUG}','${T}','JUGADOR','jugador',true),
  ('${U_OTRO}',null,'${T}','SIN_USUARIO','jugador',true)`);
await q(`insert into public.grupo_jugadores (grupo_id,jugador_id) values
  ('${G}','${U_JUG}'),('${G}','${U_OTRO}')`);

await db.exec(migracion151);

chk('MOTOR: PostgreSQL aislado', String(await escalar('select version()')).includes('PostgreSQL'));
chk('Backfill inscribe a los 3 jugadores reales',
  Number(await escalar('select count(*) from public.torneo_participantes')) === 3);
chk('Vista pública expone solo participantes activos',
  Number(await escalar('select count(*) from public.participantes_publicos')) === 3);

await uid(U_ADMIN);
chk('Admin autenticado', await escalar('select public.gl_es_admin()') === true);

let r = await rpc('gl_eliminar_torneo', T);
chk('Eliminación con jugador no-admin termina sin error de FK', r && r.ok === true, JSON.stringify(r));
chk('Devuelve jugadores desvinculados', Number(r.jugadores_desvinculados) === 3);
chk('Devuelve participantes eliminados', Number(r.participantes_eliminados) === 3);
chk('Torneo eliminado', Number(await escalar('select count(*) from public.torneos')) === 0);
chk('Participantes eliminados con el torneo',
  Number(await escalar('select count(*) from public.torneo_participantes')) === 0);
chk('Jugadores globales conservados',
  Number(await escalar('select count(*) from public.jugadores')) === 3);
chk('Cuentas Auth conservadas',
  Number(await escalar('select count(*) from auth.users')) === 3);
chk('Cuenta administradora conservada',
  Number(await escalar("select count(*) from public.jugadores where rol='admin'")) === 1);
chk('Ningún jugador queda apuntando al torneo borrado',
  Number(await escalar('select count(*) from public.jugadores where torneo_id is not null')) === 0);
chk('Vista pública queda vacía sin torneo activo',
  Number(await escalar('select count(*) from public.participantes_publicos')) === 0);

// ---- Rollback: dependencia NO ACTION no contemplada explícitamente -----------
await q(`insert into public.torneos (id,nombre,total_jornadas) values ('${T2}','Torneo rollback',22)`);
/* El jugador U_JUG ya existe: el torneo anterior se borró pero la cuenta global
   se conservó. Reutilizamos esa cuenta real en lugar de duplicarla. */
await q(`update public.jugadores set torneo_id='${T2}' where id='${U_JUG}'`);
await q(`insert into public.torneo_participantes (torneo_id,jugador_id,estado) values
  ('${T2}','${U_JUG}','activo')`);
await db.exec(`create table public.dependencia_no_action (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos(id)
);`);
await q(`insert into public.dependencia_no_action (torneo_id) values ('${T2}')`);

r = await rpc('gl_eliminar_torneo', T2);
chk('Falla imprevista devuelve ok=false con mensaje comprensible',
  r && r.ok === false && /No se pudo eliminar/.test(r.mensaje || ''), JSON.stringify(r));
chk('ROLLBACK: torneo sigue existiendo',
  Number(await escalar('select count(*) from public.torneos where id=$1', [T2])) === 1);
chk('ROLLBACK: jugador sigue vinculado',
  await escalar('select torneo_id from public.jugadores where id=$1', [U_JUG]) === T2);
chk('ROLLBACK: participante sigue existiendo',
  Number(await escalar('select count(*) from public.torneo_participantes where torneo_id=$1', [T2])) === 1);
chk('ROLLBACK: fila dependente sigue existiendo',
  Number(await escalar('select count(*) from public.dependencia_no_action')) === 1);

console.log('\nRESUMEN: ' + (total - fallos) + '/' + total + ' verificaciones correctas; ' + fallos + ' fallo(s).');
await db.close();
process.exit(fallos ? 1 : 0);
