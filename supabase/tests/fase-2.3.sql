-- ===========================================================================
-- FASE 2.3 — Plantilla de PRUEBAS PostgreSQL REALES
-- ===========================================================================
-- ESTADO: NO EJECUTADA.
--   * No se ha contactado Supabase remoto.
--   * No hay PostgreSQL local en el entorno de trabajo.
--   * Ejecutar SOLO en una base desechable, después de aplicar en orden:
--       configuracion-completa.sql
--       migraciones históricas
--       migration-telefonos-1.2.1.sql
--       migration-telefonos-2.2.sql
--       migration-seguridad-2.3.sql
--
-- Todas las comprobaciones están dentro de una transacción que termina en
-- ROLLBACK. Los helpers viven en pg_temp y no quedan instalados.
--
-- CLASIFICACIÓN:
--   Este archivo contiene los 20 escenarios con SQL ejecutable cuando exista
--   un motor PostgreSQL/Supabase autorizado. El escenario 15 es de frontend y
--   se valida con Vitest (tests/fase-2.3.test.js); aquí queda documentado como
--   NO APLICABLE a SQL para no simular una prueba que no lo es.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helpers de aserción y cambio de sesión (equivalente local a claims JWT).
-- ---------------------------------------------------------------------------
create or replace function pg_temp.assert(p_ok boolean, p_mensaje text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'ASSERT FAILED: %', p_mensaje;
  end if;
end;
$$;

create or replace function pg_temp.como(p_rol text, p_uid text, p_email text)
returns void language plpgsql as $$
begin
  execute format('set local role %I', p_rol);
  perform pg_catalog.set_config('request.jwt.claim.role', p_rol, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', p_uid, true);
  perform pg_catalog.set_config('request.jwt.claim.email', p_email, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'role', p_rol, 'sub', p_uid, 'email', p_email
    )::text,
    true
  );
end;
$$;

create or replace function pg_temp.debe_fallar(
  p_sql text, p_escenario text, p_patron text default '%'
)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if SQLERRM not like p_patron then
      raise exception '%: falló con mensaje inesperado: %', p_escenario, SQLERRM;
    end if;
    return;
  end;
  raise exception 'ASSERT FAILED: % no falló como se esperaba', p_escenario;
end;
$$;

-- ---------------------------------------------------------------------------
-- Datos de prueba. Se usa el claim service_role para preparar el escenario;
-- el rol de base de datos sigue siendo el de la sesión de pruebas.
-- ---------------------------------------------------------------------------
select pg_temp.como('service_role', '00000000-0000-4000-8000-000000000000', 'test@local');

do $$
declare
  v_torneo uuid;
begin
  select id into v_torneo
    from public.torneos
   where estado = 'activo'
   order by created_at desc, id desc
   limit 1;

  if v_torneo is null then
    raise exception 'La base de pruebas necesita un torneo activo';
  end if;

  perform pg_catalog.set_config('app.gl_test_torneo', v_torneo::text, true);
end;
$$;

insert into public.jugadores (
  user_id, nombre_usuario, email, pais, zona_horaria,
  telefono, telefono_e164, telefono_nacional, pais_telefono,
  rol, super_admin, activo, suspendido, torneo_id
) values
  ('11111111-1111-4111-8111-111111111111', 'PROPIO', 'propio@local', 'NI', 'America/Managua',
   '81000001', '+50581000001', '8100-0001', 'NI', 'jugador', false, true, false,
   pg_catalog.current_setting('app.gl_test_torneo')::uuid),
  ('22222222-2222-4222-8222-222222222222', 'ADMIN', 'admin@local', 'NI', 'America/Managua',
   '81000002', '+50581000002', '8100-0002', 'NI', 'admin', false, true, false,
   pg_catalog.current_setting('app.gl_test_torneo')::uuid),
  ('33333333-3333-4333-8333-333333333333', 'SUPER', 'super@local', 'NI', 'America/Managua',
   '81000003', '+50581000003', '8100-0003', 'NI', 'admin', true, true, false,
   pg_catalog.current_setting('app.gl_test_torneo')::uuid),
  ('44444444-4444-4444-8444-444444444444', 'OTRO', 'otro@local', 'NI', 'America/Managua',
   '81000004', '+50581000004', '8100-0004', 'NI', 'jugador', false, true, false,
   pg_catalog.current_setting('app.gl_test_torneo')::uuid);

-- 1) INSERT propio con rol manipulado: columna privilegiada no se concede;
--    un INSERT seguro queda forzado a rol jugador.
select pg_temp.como('authenticated', '55555555-5555-4555-8555-555555555555', 'nuevo@local');
select pg_temp.debe_fallar($sql$
  insert into public.jugadores (user_id, nombre_usuario, email, pais, rol, super_admin)
  values ('55555555-5555-4555-8555-555555555555', 'NUEVO', 'nuevo@local', 'NI', 'admin', true)
$sql$, 'INSERT con rol manipulado', '%permission denied%');
insert into public.jugadores (user_id, nombre_usuario, email, pais, telefono_e164)
values ('55555555-5555-4555-8555-555555555555', 'NUEVO', 'nuevo@local', 'NI', '+50581000005');
select pg_temp.assert(
  (select rol = 'jugador' and super_admin = false
     from public.jugadores
    where user_id = '55555555-5555-4555-8555-555555555555'),
  '1: INSERT seguro fuerza rol jugador');

-- 2) INSERT con torneo manipulado: la columna no se concede y el servidor elige
--    el torneo activo.
select pg_temp.debe_fallar($sql$
  insert into public.jugadores (user_id, nombre_usuario, email, pais, torneo_id)
  values ('55555555-5555-4555-8555-555555555556', 'NUEVO2', 'nuevo2@local', 'NI',
          '99999999-9999-4999-8999-999999999999')
$sql$, 'INSERT con torneo manipulado', '%permission denied%');
insert into public.jugadores (user_id, nombre_usuario, email, pais, telefono_e164)
values ('55555555-5555-4555-8555-555555555556', 'NUEVO2', 'nuevo2@local', 'NI', '+50581000006');
select pg_temp.assert(
  (select torneo_id = pg_catalog.current_setting('app.gl_test_torneo')::uuid
     from public.jugadores
    where user_id = '55555555-5555-4555-8555-555555555556'),
  '2: INSERT usa el torneo activo de la BD');

-- 3) INSERT con activo/suspendido/número manipulados.
select pg_temp.debe_fallar($sql$
  insert into public.jugadores (user_id, nombre_usuario, email, pais, activo, suspendido, numero)
  values ('55555555-5555-4555-8555-555555555557', 'NUEVO3', 'nuevo3@local', 'NI', false, true, 99)
$sql$, 'INSERT con flags manipulados', '%permission denied%');
insert into public.jugadores (user_id, nombre_usuario, email, pais, telefono_e164)
values ('55555555-5555-4555-8555-555555555557', 'NUEVO3', 'nuevo3@local', 'NI', '+50581000007');
select pg_temp.assert(
  (select activo and not suspendido and numero is null
     from public.jugadores
    where user_id = '55555555-5555-4555-8555-555555555557'),
  '3: INSERT fuerza flags seguros');

-- 4) UPDATE propio a admin: bloqueado por gl_proteger_rol().
select pg_temp.debe_fallar($sql$
  update public.jugadores set rol = 'admin'
   where user_id = '11111111-1111-4111-8111-111111111111'
$sql$, 'UPDATE propio a admin', '%propios privilegios%');

-- 5) UPDATE propio de torneo/flags: bloqueado.
select pg_temp.debe_fallar($sql$
  update public.jugadores set torneo_id = null, suspendido = true
   where user_id = '11111111-1111-4111-8111-111111111111'
$sql$, 'UPDATE propio de torneo/flags', '%propios privilegios%');

-- 6) Admin normal promoviendo a otro jugador: bloqueado.
select pg_temp.como('authenticated', '22222222-2222-4222-8222-222222222222', 'admin@local');
select pg_temp.debe_fallar($sql$
  update public.jugadores set rol = 'admin'
   where user_id = '44444444-4444-4444-8444-444444444444'
$sql$, 'Admin normal promoviendo', '%promover a administrador%');

-- 7) super_admin autorizado: promoción, correo y super_admin.
select pg_temp.como('authenticated', '33333333-3333-4333-8333-333333333333', 'super@local');
update public.jugadores
   set rol = 'admin', super_admin = true, email = 'promovido@local'
 where user_id = '44444444-4444-4444-8444-444444444444';
select pg_temp.assert(
  (select rol = 'admin' and super_admin and email = 'promovido@local'
     from public.jugadores
    where user_id = '44444444-4444-4444-8444-444444444444'),
  '7: super_admin puede promover');

-- 8) Admin normal suspendiendo a otro jugador: permitido.
select pg_temp.como('authenticated', '22222222-2222-4222-8222-222222222222', 'admin@local');
update public.jugadores set suspendido = true
 where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(
  (select suspendido from public.jugadores
    where user_id = '11111111-1111-4111-8111-111111111111'),
  '8: admin normal suspende');

-- 9) B1: fijar true sin auditoría falla; invalidar a false funciona incluso al
--    reejecutar la corrección (el trigger ya no restaura el valor anterior).
select pg_temp.como('service_role', '00000000-0000-4000-8000-000000000000', 'test@local');
update public.jugadores set telefono_verificado = true
 where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.como('authenticated', '22222222-2222-4222-8222-222222222222', 'admin@local');
select pg_temp.debe_fallar($sql$
  update public.jugadores set telefono_verificado = true
   where user_id = '11111111-1111-4111-8111-111111111111'
$sql$, 'B1 fijar true sin auditoría', '%permission denied%');
update public.jugadores set telefono_verificado = false
 where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(
  (select not telefono_verificado from public.jugadores
    where user_id = '11111111-1111-4111-8111-111111111111'),
  '9: invalidación permitida en reejecución');

-- 10) I1: auditoría antigua o número restaurado no basta para conservar true.
--     La comprobación replica la condición canónica de migration-telefonos-2.2.
select pg_temp.assert(
  not exists (
    select 1
      from public.jugadores j
     where j.telefono_verificado
       and not exists (
         select 1
           from auditoria.telefonos_confirmados a
          where a.jugador_id = j.id
            and a.accion = 'confirmacion_e164_y_titularidad'
            and a.valor_nuevo = j.telefono_e164
            and nullif(pg_catalog.btrim(coalesce(a.evidencia, '')), '') is not null
            and a.id = (
              select pg_catalog.max(a2.id)
                from auditoria.telefonos_confirmados a2
               where a2.jugador_id = j.id
            )
       )
  ),
  '10: ningún true sin última auditoría válida');

-- 11) I2: E.164 con caracteres no se acepta como canónico en la RPC; el valor
--     canónico sí se acepta.
select pg_temp.debe_fallar($sql$
  select public.gl_confirmar_e164(
    '11111111-1111-4111-8111-111111111111', '+505 8100-0001', 'formato', false, null)
$sql$, 'E.164 no canónico', '%E.164 canónico%');
select pg_temp.assert(
  (public.gl_confirmar_e164(
     '11111111-1111-4111-8111-111111111111', '+50581000001', 'formato', false, null
   )->>'nuevo') = '+50581000001',
  '11: E.164 canónico accepted');

-- 12) I4: cambiar la representación sin cambiar el E.164 invalida titularidad.
select pg_temp.como('service_role', '00000000-0000-4000-8000-000000000000', 'test@local');
update public.jugadores
   set telefono_verificado = true, telefono = '81000001'
 where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(
  (select telefono_verificado from public.jugadores
    where user_id = '11111111-1111-4111-8111-111111111111'),
  '12: estado inicial confirmado');
select pg_temp.como('authenticated', '22222222-2222-4222-8222-222222222222', 'admin@local');
update public.jugadores set telefono_nacional = '8100 0001'
 where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(
  (select not telefono_verificado from public.jugadores
    where user_id = '11111111-1111-4111-8111-111111111111'),
  '12: campo secundario invalida titularidad');

-- 13) I5: la recuperación no depende de que el frontend haya cargado contexto:
--     el INSERT simple ya asignó el torneo activo (comprobado en 2).
select pg_temp.assert(
  (select torneo_id is not null from public.jugadores
    where user_id = '55555555-5555-4555-8555-555555555556'),
  '13: torneo asignado sin contexto frontend');

-- 14) I6: evidencia obligatoria y reintento con evidencia válida.
select pg_temp.debe_fallar($sql$
  select public.gl_confirmar_e164(
    '11111111-1111-4111-8111-111111111111',
    '+50581000001', 'titularidad', true, null)
$sql$, 'titularidad sin evidencia', '%evidencia verificable%');
select pg_temp.assert(
  (public.gl_confirmar_e164(
     '11111111-1111-4111-8111-111111111111',
     '+50581000001', 'titularidad', true, 'ticket-927'
   )->>'titularidad_confirmada')::boolean,
  '14: reintento con evidencia confiere titularidad');

-- 15) I7: limpieza al salir. NO APLICABLE en SQL.
--     Cubierto por tests/fase-2.3.test.js escenario 15 con cliente jsdom:
--     Auth.salir() limpia usuario, jugador, _perfilEnCurso y
--     perfilPendienteTelefono, y llama signOut().

-- 16) Lectura pública: anon lee la vista y no ve columnas privadas.
select pg_temp.como('anon', '', '');
select pg_temp.assert(
  (select count(*) >= 1 from public.jugadores_publicos),
  '16: anon lee vista pública');
select pg_temp.assert(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'jugadores_publicos'
       and column_name in ('email', 'telefono', 'telefono_e164', 'user_id', 'super_admin')
  ),
  '16: vista sin columnas privadas');
select pg_temp.assert(
  not exists (
    select 1 from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' and table_name = 'jugadores'
  ),
  '16: anon sin GRANT sobre jugadores');

-- 17) anon no accede a la tabla privada.
select pg_temp.debe_fallar(
  'select * from public.jugadores limit 1',
  'anon lee jugadores', '%permission denied%|row-level security%');

-- 18) DELETE directo: bloqueado por falta de GRANT y por política restrictiva.
select pg_temp.como('authenticated', '22222222-2222-4222-8222-222222222222', 'admin@local');
select pg_temp.debe_fallar(
  'delete from public.jugadores where user_id = ''11111111-1111-4111-8111-111111111111''',
  'DELETE directo', '%permission denied%|row-level security%');

-- 19) Compatibilidad admin: operaciones deportivas por REST siguen funcionando,
--     mientras que las columnas sensibles no se conceden.
update public.jugadores
   set suspendido = false, numero = 10,
       torneo_id = pg_catalog.current_setting('app.gl_test_torneo')::uuid
 where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(
  (select not suspendido and numero = 10 from public.jugadores
    where user_id = '11111111-1111-4111-8111-111111111111'),
  '19: gestión deportiva permitida');
select pg_temp.debe_fallar($sql$
  update public.jugadores set email = 'hackeado@local'
   where user_id = '11111111-1111-4111-8111-111111111111'
$sql$, 'UPDATE de correo', '%permission denied%');

-- 20) Integración RPC: evidencia, auditoría en la misma transacción y txid.
select pg_temp.assert(
  exists (
    select 1
      from auditoria.telefonos_confirmados a
     where a.jugador_id = '11111111-1111-4111-8111-111111111111'
       and a.accion = 'confirmacion_e164_y_titularidad'
       and a.evidencia = 'ticket-927'
       and a.txid = pg_catalog.txid_current()
  ),
  '20: auditoría con evidencia y txid de la transacción');

-- La transacción se revierte: ningún dato de prueba queda instalado.
rollback;
