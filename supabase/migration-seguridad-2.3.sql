-- ===========================================================================
-- GOATS LATINOS · FASE 2.3 — Seguridad integral, permisos e integridad
-- ===========================================================================
-- DEFINICIÓN AUTORITATIVA. Esta migración manda sobre cualquier definición
-- anterior de gl_proteger_rol(), políticas de jugadores o grants.
--
-- ORDEN DE APLICACIÓN (documentado y validado por preflight):
--   1) supabase/configuracion-completa.sql
--   2) migraciones históricas 1.0.x / 1.1.0 / 1.2.0
--   3) supabase/migration-telefonos-1.2.1.sql
--   4) supabase/migration-telefonos-2.2.sql
--   5) ESTA MIGRACIÓN: supabase/migration-seguridad-2.3.sql
--
-- No se conecta a Supabase remoto. No se aplica en producción sin la
-- validación real en un entorno de pruebas autorizado.
--
-- MODELO DE SEGURIDAD
--   * PostgreSQL decide. El frontend solo presenta operaciones permitidas.
--   * super_admin / service_role: gestión completa de roles y liga.
--   * admin normal: gestión deportiva (suspender, reactivar, cambiar torneo y
--     número de jugadores), NUNCA privilegios, correo, identidad ni propio
--     torneo/flags. La promoción a admin queda reservada a super_admin o a la
--     Edge Function correspondiente con service_role.
--   * jugador: solo su propio perfil, sin rol, flags, torneo, número, correo
--     ni identidad. No puede borrar filas.
--   * anon: solo lectura pública (catálogos y vista jugadores_publicos).
--   * gl_owner: rol sin login/superuser/inherit/bypassrls, usado solo por la
--     RPC telefónica; sin INSERT/DELETE en jugadores.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preflight: exige el estado canónico antes de conceder nada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_duplicados text;
  v_owner text;
  v_atributos record;
begin
  if pg_catalog.to_regclass('public.jugadores') is null then
    raise exception 'Falta public.jugadores';
  end if;

  if pg_catalog.to_regclass('public.torneos') is null then
    raise exception 'Falta public.torneos';
  end if;

  if pg_catalog.to_regclass('auditoria.telefonos_confirmados') is null then
    raise exception 'Aplicar primero migration-telefonos-1.2.1.sql';
  end if;

  if pg_catalog.to_regprocedure('public.gl_es_admin()') is null
     or pg_catalog.to_regprocedure('public.gl_es_super_admin()') is null
     or pg_catalog.to_regprocedure('public.gl_confirmar_e164(uuid,text,text,boolean,text)') is null
     or pg_catalog.to_regprocedure('auth.uid()') is null
     or pg_catalog.to_regprocedure('auth.role()') is null then
    raise exception 'Faltan helpers de autenticación o administración';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'jugadores' and c.relrowsecurity
  ) then
    raise exception 'public.jugadores no tiene RLS habilitado';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'jugadores'
       and column_name in ('user_id', 'rol', 'super_admin', 'email',
                           'activo', 'suspendido', 'torneo_id', 'numero')
     group by table_schema, table_name
    having count(*) = 8
  ) then
    raise exception 'Faltan columnas sensibles en public.jugadores';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'gl_owner') then
    raise exception 'Falta el rol gl_owner; aplicar migration-telefonos-1.2.1.sql';
  end if;

  select rolcanlogin, rolsuper, rolinherit, rolbypassrls
    into v_atributos
    from pg_catalog.pg_roles
   where rolname = 'gl_owner';

  if v_atributos.rolcanlogin or v_atributos.rolsuper
     or v_atributos.rolinherit or v_atributos.rolbypassrls then
    raise exception 'gl_owner tiene atributos incompatibles con el modelo de seguridad';
  end if;

  if pg_catalog.pg_has_role('gl_owner', 'authenticated', 'USAGE')
     or pg_catalog.pg_has_role('gl_owner', 'anon', 'USAGE')
     or pg_catalog.pg_has_role('gl_owner', 'authenticated', 'SET')
     or pg_catalog.pg_has_role('gl_owner', 'anon', 'SET') then
    raise exception 'gl_owner pertenece a authenticated/anon; no se revoca automáticamente';
  end if;

  select p.proowner::regrole::text into v_owner
    from pg_catalog.pg_proc p
   where p.oid = pg_catalog.to_regprocedure('public.gl_es_admin()')::oid;

  if v_owner in ('gl_owner', 'authenticated', 'anon') then
    raise exception 'public.gl_es_admin() tiene un dueño incompatible: %', v_owner;
  end if;

  select pg_catalog.string_agg(user_id::text, ', ' order by user_id::text)
    into v_duplicados
    from (
      select user_id from public.jugadores
       where user_id is not null
       group by user_id having pg_catalog.count(*) > 1
    ) d;

  if v_duplicados is not null then
    raise exception 'Existen perfiles duplicados por user_id: %', v_duplicados;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Definición ÚNICA y autoritativa de gl_proteger_rol().
--    Reemplaza las versiones de configuracion-completa.sql y
--    migration-mejoras-1-9.sql. Ambas quedan documentadas como no autoritativas.
-- ---------------------------------------------------------------------------
create or replace function public.gl_proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_es_admin boolean;
  v_es_super boolean;
  v_es_propio boolean;
begin
  if auth.role() = 'service_role' then
    return NEW;
  end if;

  v_es_super := public.gl_es_super_admin();
  if v_es_super then
    return NEW;
  end if;

  v_es_admin := public.gl_es_admin();
  v_es_propio := OLD.user_id is not null and OLD.user_id = auth.uid();

  /* Un jugador NUNCA puede cambiar sus propios datos de liga o privilegios,
     aunque sea admin: el bypass de administración no se aplica a sí mismo. */
  if v_es_propio then
    if NEW.rol is distinct from OLD.rol
       or NEW.super_admin is distinct from OLD.super_admin
       or NEW.email is distinct from OLD.email
       or NEW.user_id is distinct from OLD.user_id
       or NEW.activo is distinct from OLD.activo
       or NEW.suspendido is distinct from OLD.suspendido
       or NEW.torneo_id is distinct from OLD.torneo_id
       or NEW.numero is distinct from OLD.numero then
      raise exception 'No podés modificar tus propios privilegios, torneo o flags';
    end if;
    return NEW;
  end if;

  /* Sin ser admin ni super_admin, RLS ya impide la fila. Defensa en profundidad. */
  if not v_es_admin then
    raise exception 'No autorizado para modificar otros jugadores';
  end if;

  /* admin normal: NO toca privilegios, correo, identidad ni super_admin. */
  if NEW.super_admin is distinct from OLD.super_admin
     or NEW.email is distinct from OLD.email
     or NEW.user_id is distinct from OLD.user_id then
    raise exception 'Solo el administrador principal puede modificar privilegios, correo o identidad';
  end if;

  if NEW.rol = 'admin' and coalesce(OLD.rol, '') <> 'admin' then
    raise exception 'Solo el administrador principal puede promover a administrador';
  end if;

  if OLD.rol = 'admin' and coalesce(NEW.rol, '') <> 'admin' then
    raise exception 'Solo el administrador principal puede revocar a un administrador';
  end if;

  /* Operación deportiva legítima: jugador <-> expulsado, suspender y
     reactivar. Cualquier otro rol es privilegio y queda fuera del alcance. */
  if NEW.rol is distinct from OLD.rol
     and not (
          (OLD.rol = 'jugador'   and NEW.rol = 'expulsado')
       or (OLD.rol = 'expulsado' and NEW.rol = 'jugador')
     ) then
    raise exception 'Transición de rol no permitida para un administrador normal';
  end if;

  if NEW.rol not in ('jugador', 'expulsado')
     and (NEW.activo is distinct from OLD.activo
          or NEW.suspendido is distinct from OLD.suspendido) then
    raise exception 'Estado inválido para un jugador';
  end if;

  /* torneo_id y numero son gestión deportiva permitida sobre OTROS jugadores. */
  return NEW;
end;
$$;

drop trigger if exists gl_proteger_rol on public.jugadores;
create trigger gl_proteger_rol
  before update on public.jugadores
  for each row execute function public.gl_proteger_rol();

revoke all on function public.gl_proteger_rol() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Protección de INSERT: los valores sensibles los fija el servidor.
--    El frontend NO envía rol, flags, torneo, número ni titularidad.
-- ---------------------------------------------------------------------------
create or replace function public.gl_proteger_insercion_jugador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_es_super boolean;
  v_torneo_id uuid;
begin
  if auth.role() = 'service_role' then
    return NEW;
  end if;

  v_es_super := public.gl_es_super_admin();
  if v_es_super then
    return NEW;
  end if;

  /* Un usuario normal solo puede crear SU perfil. Un admin normal tampoco
     crea perfiles ajenos por REST: para eso existe la Edge Function. */
  if NEW.user_id is distinct from auth.uid() then
    raise exception 'Solo podés crear tu propio perfil';
  end if;

  NEW.rol := 'jugador';
  NEW.super_admin := false;
  NEW.email := pg_catalog.lower(coalesce(auth.jwt() ->> 'email', ''));
  NEW.activo := true;
  NEW.suspendido := false;
  NEW.numero := null;

  /* I5: no depender del orden de GL.cargarContexto(). El servidor elige el
     torneo ACTIVO real; si no hay ninguno, queda NULL de forma explícita. */
  select id into v_torneo_id
    from public.torneos
   where estado = 'activo'
   order by created_at desc, id desc
   limit 1;
  NEW.torneo_id := v_torneo_id;

  return NEW;
end;
$$;

drop trigger if exists gl_proteger_insercion_jugador on public.jugadores;
create trigger gl_proteger_insercion_jugador
  before insert on public.jugadores
  for each row execute function public.gl_proteger_insercion_jugador();

revoke all on function public.gl_proteger_insercion_jugador()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) RLS definitiva sobre public.jugadores.
-- ---------------------------------------------------------------------------
drop policy if exists gl_read on public.jugadores;
create policy gl_read on public.jugadores
  for select to authenticated
  using (user_id = auth.uid() or public.gl_es_admin());

drop policy if exists jugadores_admin_lee_todo on public.jugadores;
create policy jugadores_admin_lee_todo on public.jugadores
  for select to authenticated
  using (public.gl_es_admin());

drop policy if exists gl_registro on public.jugadores;
create policy gl_registro on public.jugadores
  for insert to authenticated
  with check (
       user_id = auth.uid()
   and rol = 'jugador'
   and super_admin = false
   and activo = true
   and suspendido = false
  );

drop policy if exists gl_admin_write on public.jugadores;
create policy gl_admin_write on public.jugadores
  for all to authenticated
  using (public.gl_es_admin())
  with check (public.gl_es_admin());

drop policy if exists gl_propio_update on public.jugadores;
create policy gl_propio_update on public.jugadores
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Restrictivas: ninguna ruta alternativa puede eludir estos límites.
drop policy if exists gl_23_solo_insert_propio on public.jugadores;
create policy gl_23_solo_insert_propio on public.jugadores as restrictive
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists gl_23_solo_update_propio_o_admin on public.jugadores;
create policy gl_23_solo_update_propio_o_admin on public.jugadores as restrictive
  for update to authenticated
  using (user_id = auth.uid() or public.gl_es_admin())
  with check (user_id = auth.uid() or public.gl_es_admin());

drop policy if exists gl_23_bloquea_delete_clientes on public.jugadores;
create policy gl_23_bloquea_delete_clientes on public.jugadores as restrictive
  for delete to public
  using (false);

-- ---------------------------------------------------------------------------
-- 4) Privilegios finales, columna por columna.
--    UPDATE mantiene las columnas que el panel admin necesita por REST; todas
--    están gobernadas por gl_proteger_rol(). Nunca se concede super_admin,
--    email, user_id ni telefono_verificado.
--    INSERT solo datos personales: el trigger fija el resto.
-- ---------------------------------------------------------------------------
revoke all on public.jugadores from public, anon, authenticated;
revoke delete on public.jugadores from gl_owner;

grant select on public.jugadores to authenticated;

grant update (
  nombre_usuario, pais, zona_horaria, avatar_url,
  activo, suspendido, rol, torneo_id, numero,
  telefono, telefono_e164, telefono_nacional, pais_telefono, telefono_valido_plan
) on public.jugadores to authenticated;

grant insert (
  user_id, nombre_usuario, email, pais, zona_horaria, avatar_url,
  telefono, telefono_e164, telefono_nacional, pais_telefono, telefono_valido_plan
) on public.jugadores to authenticated;

grant execute on function public.gl_es_admin() to authenticated;
grant execute on function public.gl_es_super_admin() to authenticated;

revoke all on function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  to authenticated;

-- gl_owner: exactamente lo que necesita la RPC telefónica.
revoke all on public.jugadores from gl_owner;
grant select (id, telefono_e164, telefono_verificado) on public.jugadores to gl_owner;
grant update (telefono_e164, telefono_valido_plan, telefono_verificado)
  on public.jugadores to gl_owner;
grant usage on schema auditoria to gl_owner;
revoke all on auditoria.telefonos_confirmados from gl_owner;
grant insert (
  jugador_id, accion, valor_anterior, valor_nuevo,
  confirmado_por, confirmado_en, motivo, evidencia, txid
) on auditoria.telefonos_confirmados to gl_owner;
grant execute on function public.gl_es_admin() to gl_owner;
grant execute on function auditoria.gl_tiene_confirmacion_tx(uuid, text) to gl_owner;
grant execute on function auditoria.gl_exigir_evidencia_titularidad() to gl_owner;

-- ---------------------------------------------------------------------------
-- 5) anon: solo catálogos públicos y vista sin datos privados.
-- ---------------------------------------------------------------------------
revoke select on public.jugadores from anon;
revoke select on public.grupo_jugadores, public.sanciones,
  public.notificaciones, public.admin_audit_log from anon;
revoke all on auditoria.telefonos_confirmados from anon;

grant select on public.torneos, public.grupos, public.partidos,
  public.clasificacion, public.jornadas, public.paises to anon;

/* La vista creada en migration-registro-seguro.sql expone únicamente columnas
   deportivas y se ejecuta con su dueña (security_invoker = false). */
drop view if exists public.jugadores_publicos;
create view public.jugadores_publicos
with (security_invoker = false)
as
  select id, nombre_usuario, pais, avatar_url, activo, suspendido, torneo_id, numero
    from public.jugadores;
grant select on public.jugadores_publicos to anon, authenticated;

drop policy if exists "lectura publica jugadores" on public.jugadores;

-- ---------------------------------------------------------------------------
-- 6) Reafirmación de la auditoría telefónica y su evidencia.
-- ---------------------------------------------------------------------------
revoke all on auditoria.telefonos_confirmados from public, anon, authenticated;
alter table auditoria.telefonos_confirmados enable row level security;

drop trigger if exists gl_exigir_evidencia_titularidad
  on auditoria.telefonos_confirmados;
create trigger gl_exigir_evidencia_titularidad
  before insert on auditoria.telefonos_confirmados
  for each row execute function auditoria.gl_exigir_evidencia_titularidad();

-- Fin de la migración 2.3.
commit;

notify pgrst, 'reload schema';
