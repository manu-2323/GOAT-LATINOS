-- ===========================================================================
-- GOATS LATINOS · Migración correctiva 2.2 — Integridad de titularidad telefónica
-- ===========================================================================
-- ORDEN DE APLICACIÓN (revisado en FASE 2.3):
--   1) supabase/configuracion-completa.sql
--   2) migraciones históricas ya aplicadas (1.0.x / 1.1.0 / 1.2.0)
--   3) supabase/migration-telefonos-1.2.1.sql
--   4) ESTA MIGRACIÓN: supabase/migration-telefonos-2.2.sql
--   5) supabase/migration-seguridad-2.3.sql  (modelo de seguridad autoritativo)
--
-- NOTA DE VERSIONADO (FASE 2.3):
--   Este archivo no había sido publicado. Se corrige aquí para que sea seguro
--   reejecutarlo, pero la definición final de permisos y del trigger de roles
--   vive en migration-seguridad-2.3.sql. No ejecutar 2.2 sin aplicar 2.3
--   después en un entorno compartido.
--
-- Motivo:
--   * En 1.2.0, telefono_verificado=true significaba "formato validado".
--   * En 1.2.1, ese mismo valor pasó a significar "titularidad confirmada por
--     una persona". Los valores heredados no son evidencia humana.
--   * La titularidad confirmada pertenece a un E.164 concreto: cambiar o borrar
--     el número debe invalidarla en servidor.
--   * RLS y privilegios SQL son controles distintos. Una política de UPDATE no
--     debe autorizar columnas sensibles por sí sola.
--
-- Diseño corregido en 2.3:
--   * Normalización histórica: se conserva true SOLO si la ÚLTIMA auditoría del
--     jugador acredita titularidad humana del mismo E.164 canónico y tiene
--     evidencia. Una auditoría antigua o de otro número no la conserva.
--   * El trigger se elimina antes de normalizar y, además, permite invalidar
--     (true -> false) sin auditoría. Una reejecución ya no restaura valores.
--   * E.164 canónico exacto: únicamente se compara texto canónico
--     '^\+[1-9][0-9]{7,14}$'. No se eliminan caracteres arbitrariamente para
--     declarar que dos valores son el mismo número.
--   * Titularidad: INSERT sin auditoría de titularidad en la misma transacción
--     => false. UPDATE que cambia número o representación => false salvo RPC
--     auditada. UPDATE aislado del boolean => se conserva el valor anterior;
--     NUNCA se autoriza un true sin auditoría en la tx.
--   * Privilegios: UPDATE se concede columna por columna para las operaciones
--     legítimas del panel (incluidas suspendido/rol/torneo_id), pero TODAS
--     quedan bajo el trigger autoritativo de migration-seguridad-2.3.sql.
--     INSERT NO concede columnas de liga ni privilegios: el servidor las fija.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preflight. No asume que 1.2.1 esté perfecta, pero exige que esté aplicada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_duplicados text;
begin
  if pg_catalog.to_regclass('public.jugadores') is null then
    raise exception 'Falta public.jugadores';
  end if;

  if pg_catalog.to_regclass('auditoria.telefonos_confirmados') is null then
    raise exception 'Aplicar primero supabase/migration-telefonos-1.2.1.sql';
  end if;

  if pg_catalog.to_regprocedure(
       'public.gl_confirmar_e164(uuid,text,text,boolean,text)'
     ) is null then
    raise exception 'Falta la firma final de public.gl_confirmar_e164';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'jugadores'
       and column_name = 'telefono_verificado'
  ) then
    raise exception 'Falta public.jugadores.telefono_verificado';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'jugadores'
       and column_name = 'telefono_e164'
  ) then
    raise exception 'Falta public.jugadores.telefono_e164';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'auditoria'
       and table_name = 'telefonos_confirmados'
       and column_name = 'evidencia'
  ) then
    raise exception 'Falta auditoria.telefonos_confirmados.evidencia';
  end if;

  select pg_catalog.string_agg(user_id::text, ', ' order by user_id::text)
    into v_duplicados
    from (
      select user_id
        from public.jugadores
       where user_id is not null
       group by user_id
      having pg_catalog.count(*) > 1
    ) d;

  if v_duplicados is not null then
    raise exception
      'Existen perfiles duplicados por user_id: %. Resolver manualmente antes de crear el índice único',
      v_duplicados;
  end if;

  if pg_catalog.to_regclass('public.jugadores_user_id_uniq') is not null
     and not exists (
       select 1
         from pg_catalog.pg_index
        where indrelid = 'public.jugadores'::regclass
          and indnkeyatts = 1
          and indpred is not null
          and pg_catalog.pg_get_indexdef(indexrelid) ilike '%user_id%'
          and pg_catalog.pg_get_indexdef(indexrelid) ilike '%is not null%'
     ) then
    raise exception
      'El índice jugadores_user_id_uniq existe con una definición distinta';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Canonicalización previa y normalización histórica segura.
--    No se inventa titularidad. Un true heredado solo sobrevive si la ÚLTIMA
--    auditoría del jugador acredita titularidad humana del E.164 vigente y
--    conserva evidencia. Una auditoría antigua, de otro número o sin evidencia
--    no autoriza nada.
-- ---------------------------------------------------------------------------
do $$
begin
  /* B1: si el trigger ya existe, se retira antes de normalizar. Además, la
     nueva lógica del trigger permite expresamente true -> false. */
  if exists (
    select 1
      from pg_catalog.pg_trigger
     where tgrelid = 'public.jugadores'::regclass
       and tgname = 'gl_sincronizar_titularidad_telefono'
  ) then
    execute 'drop trigger gl_sincronizar_titularidad_telefono on public.jugadores';
  end if;
end $$;

/* I2: se normaliza el E.164 histórico antes de compararlo. Solo se transforma
   cuando la forma canónica es estructuralmente válida; los valores dudosos se
   dejan intactos y NO pueden acreditar titularidad. */
update public.jugadores
   set telefono_e164 =
     '+' || pg_catalog.regexp_replace(pg_catalog.btrim(telefono_e164), '\D', '', 'g')
 where nullif(pg_catalog.btrim(coalesce(telefono_e164, '')), '') is not null
   and telefono_e164 !~ '^\+[1-9][0-9]{7,14}$'
   and pg_catalog.regexp_replace(pg_catalog.btrim(telefono_e164), '\D', '', 'g')
         ~ '^[1-9][0-9]{7,14}$';

update public.jugadores j
   set telefono_verificado = false
 where coalesce(j.telefono_verificado, false)
   and not exists (
         select 1
           from auditoria.telefonos_confirmados a
          where a.jugador_id = j.id
            and a.accion = 'confirmacion_e164_y_titularidad'
            and a.valor_nuevo = j.telefono_e164
            and nullif(pg_catalog.btrim(coalesce(a.evidencia, '')), '') is not null
            /* I1: la evidencia debe ser la ÚLTIMA del jugador. Si después hubo
               otra auditoría, el número pudo sustituirse y restaurarse. */
            and a.id = (
                  select pg_catalog.max(a2.id)
                    from auditoria.telefonos_confirmados a2
                   where a2.jugador_id = j.id
                )
       );

-- ---------------------------------------------------------------------------
-- 2) Unicidad real de perfil por usuario autenticado.
-- ---------------------------------------------------------------------------
create unique index if not exists jugadores_user_id_uniq
  on public.jugadores (user_id)
 where user_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Titularidad ligada al número exacto, aplicada en servidor.
-- ---------------------------------------------------------------------------
alter table auditoria.telefonos_confirmados
  add column if not exists txid bigint;

create index if not exists telefonos_confirmados_tx_idx
  on auditoria.telefonos_confirmados (txid, jugador_id);

/* Helpers SECURITY DEFINER: solo el código SQL autorizado puede insertar en
   auditoria; un cliente autenticado no tiene GRANT allí y tampoco puede
   fabricar una fila con su txid. La comparación es de E.164 canónico exacto. */
create or replace function auditoria.gl_tiene_confirmacion_tx(
  p_jugador_id uuid,
  p_e164 text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auditoria.telefonos_confirmados a
     where a.jugador_id = p_jugador_id
       and a.txid = pg_catalog.txid_current()
       and a.accion = 'confirmacion_e164_y_titularidad'
       and a.valor_nuevo = p_e164
  );
$$;

revoke all on function auditoria.gl_tiene_confirmacion_tx(uuid, text)
  from public, anon, authenticated;
grant execute on function auditoria.gl_tiene_confirmacion_tx(uuid, text)
  to gl_owner;

/* Evidencia humana obligatoria para cualquier auditoría de titularidad. */
create or replace function auditoria.gl_exigir_evidencia_titularidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.accion = 'confirmacion_e164_y_titularidad'
     and nullif(pg_catalog.btrim(coalesce(NEW.evidencia, '')), '') is null then
    raise exception 'La titularidad requiere evidencia verificable';
  end if;
  return NEW;
end;
$$;

revoke all on function auditoria.gl_exigir_evidencia_titularidad()
  from public, anon, authenticated;
grant execute on function auditoria.gl_exigir_evidencia_titularidad() to gl_owner;

drop trigger if exists gl_exigir_evidencia_titularidad
  on auditoria.telefonos_confirmados;
create trigger gl_exigir_evidencia_titularidad
  before insert on auditoria.telefonos_confirmados
  for each row execute function auditoria.gl_exigir_evidencia_titularidad();

create or replace function public.gl_sincronizar_titularidad_telefono()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmada_en_tx boolean;
  v_anterior text;
  v_nuevo text;
  v_numero_cambio boolean;
  v_representacion_cambio boolean;
begin
  v_nuevo := case
    when NEW.telefono_e164 ~ '^\+[1-9][0-9]{7,14}$'
      then NEW.telefono_e164
    else null
  end;

  v_confirmada_en_tx :=
    v_nuevo is not null
    and auditoria.gl_tiene_confirmacion_tx(NEW.id, v_nuevo);

  if TG_OP = 'INSERT' then
    if not v_confirmada_en_tx then
      NEW.telefono_verificado := false;
    end if;
    return NEW;
  end if;

  v_anterior := case
    when OLD.telefono_e164 ~ '^\+[1-9][0-9]{7,14}$'
      then OLD.telefono_e164
    else null
  end;

  v_numero_cambio := v_nuevo is distinct from v_anterior;
  v_representacion_cambio :=
       NEW.telefono         is distinct from OLD.telefono
    or NEW.telefono_nacional is distinct from OLD.telefono_nacional
    or NEW.pais_telefono    is distinct from OLD.pais_telefono;

  if v_numero_cambio or v_representacion_cambio then
    /* Sustitución, borrado o cambio de representación: se pierde la
       titularidad anterior. Solo la RPC con auditoría humana puede acreditar
       el número nuevo en esta transacción. */
    if not v_confirmada_en_tx then
      NEW.telefono_verificado := false;
    end if;
  elsif not v_confirmada_en_tx
    and NEW.telefono_verificado is distinct from OLD.telefono_verificado
    and NEW.telefono_verificado is true then
    /* B1: bloquear SOLO el intento de fijar true sin auditoría. Permitir
       siempre la invalidación (true -> false), incluso en reejecuciones. */
    NEW.telefono_verificado := OLD.telefono_verificado;
  end if;

  return NEW;
end;
$$;

revoke all on function public.gl_sincronizar_titularidad_telefono()
  from public, anon, authenticated;

drop trigger if exists gl_sincronizar_titularidad_telefono on public.jugadores;
create trigger gl_sincronizar_titularidad_telefono
  before insert or update of
    telefono_e164, telefono, telefono_nacional, pais_telefono, telefono_verificado
  on public.jugadores
  for each row execute function public.gl_sincronizar_titularidad_telefono();

-- ---------------------------------------------------------------------------
-- 4) RPC de confirmación. Firma conservada. Autoriza con auth.uid() y
--    gl_es_admin(); exige evidencia para acreditar titularidad y deja auditoría
--    con txid para que el trigger acepte el cambio en la MISMA transacción.
-- ---------------------------------------------------------------------------
create or replace function public.gl_confirmar_e164(
  p_jugador_id uuid,
  p_e164 text,
  p_motivo text,
  p_confirmar_titularidad boolean default false,
  p_evidencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_tipo text;
  v_anterior text;
  v_digitos text;
  v_candidato record;
  v_no_estructurales jsonb := '[]'::jsonb;
  v_mensaje text;
  v_restriccion text;
  v_esquema text;
  v_tabla text;
begin
  v_admin := auth.uid();

  if v_admin is null then
    raise exception 'Sesión no autenticada';
  end if;

  if not public.gl_es_admin() then
    raise exception 'No autorizado';
  end if;

  if nullif(pg_catalog.btrim(p_motivo), '') is null then
    raise exception 'El motivo es obligatorio';
  end if;

  if p_confirmar_titularidad
     and nullif(pg_catalog.btrim(coalesce(p_evidencia, '')), '') is null then
    raise exception 'La titularidad requiere evidencia verificable';
  end if;

  perform pg_catalog.set_config('app.gl_jugador_id', p_jugador_id::text, true);
  perform pg_catalog.set_config('app.gl_admin_id', v_admin::text, true);

  if p_e164 is null
     or pg_catalog.left(p_e164, 1) <> '+'
     or p_e164 !~ '^\+[1-9][0-9]{7,14}$'
  then
    raise exception
      'p_e164 debe ser E.164 canónico: + y 8-15 dígitos, sin cero inicial';
  end if;

  v_digitos := pg_catalog.substr(p_e164, 2);

  with map(pais, prefijo, longitudes) as (
    values
      ('CR','506', array[8,10]),
      ('NI','505', array[8]),
      ('MX','52',  array[10]),
      ('GT','502', array[8,11]),
      ('HN','504', array[8,11]),
      ('SV','503', array[7,8,11]),
      ('CO','57',  array[8,10,11]),
      ('EC','593', array[8,9,10,11]),
      ('PA','507', array[7,8,10,11]),
      ('PE','51',  array[8,9]),
      ('VE','58',  array[10]),
      ('BO','591', array[8,9]),
      ('AR','54',  array[10,11]),
      ('CL','56',  array[9,10,11]),
      ('PY','595', array[6,7,8,9,10,11]),
      ('BR','55',  array[8,9,10,11])
  ),
  existentes_normalizados as (
    select
      j.id,
      pg_catalog.regexp_replace(j.telefono_e164, '\D', '', 'g') as digitos,
      '+' || pg_catalog.regexp_replace(j.telefono_e164, '\D', '', 'g') as e164_norm,
      mp.pais as pais_prefijo,
      mp.prefijo,
      mp.longitudes
    from public.jugadores j
    left join lateral (
      select m.pais, m.prefijo, m.longitudes
      from map m
      where pg_catalog.regexp_replace(j.telefono_e164, '\D', '', 'g') like m.prefijo || '%'
      order by pg_catalog.length(m.prefijo) desc
      limit 1
    ) mp on true
    where nullif(pg_catalog.btrim(coalesce(j.telefono_e164, '')), '') is not null
  ),
  existentes_bloqueantes as (
    select e.*
    from existentes_normalizados e
    where e.digitos <> ''
      and e.digitos not like '0%'
      and pg_catalog.length(e.digitos) between 8 and 15
      and e.pais_prefijo is not null
      and (pg_catalog.length(e.digitos) - pg_catalog.length(e.prefijo)) = any(e.longitudes)
  ),
  existentes_no_estructurales as (
    select e.*
    from existentes_normalizados e
    where not (
          e.digitos <> ''
      and e.digitos not like '0%'
      and pg_catalog.length(e.digitos) between 8 and 15
      and e.pais_prefijo is not null
      and (pg_catalog.length(e.digitos) - pg_catalog.length(e.prefijo)) = any(e.longitudes)
    )
  ),
  candidato as (
    select
      v_digitos as digitos,
      '+' || v_digitos as e164_norm,
      mp.pais as pais_prefijo,
      mp.prefijo,
      mp.longitudes
    from (select 1) x
    left join lateral (
      select m.pais, m.prefijo, m.longitudes
      from map m
      where v_digitos like m.prefijo || '%'
      order by pg_catalog.length(m.prefijo) desc
      limit 1
    ) mp on true
  )
  select c.* into v_candidato from candidato c;

  if v_candidato.digitos = ''
     or v_candidato.digitos like '0%'
     or pg_catalog.length(v_candidato.digitos) not between 8 and 15
     or v_candidato.pais_prefijo is null
     or not (
          (pg_catalog.length(v_candidato.digitos) - pg_catalog.length(v_candidato.prefijo))
            = any(v_candidato.longitudes)
        )
  then
    raise exception 'E.164 no estructuralmente válido según el mapa de países';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('+' || v_digitos, 0)
  );

  if exists (
    select 1
    from existentes_bloqueantes e
    where e.id <> p_jugador_id
      and e.e164_norm = v_candidato.e164_norm
  ) then
    raise exception 'E.164 ya existe en otro jugador';
  end if;

  select coalesce(pg_catalog.jsonb_agg(e.id), '[]'::jsonb)
    into v_no_estructurales
    from existentes_no_estructurales e
   where e.id <> p_jugador_id
     and e.e164_norm = v_candidato.e164_norm;

  select j.telefono_e164 into v_anterior
  from public.jugadores j
  where j.id = p_jugador_id;

  if not found then
    raise exception 'Jugador no existe';
  end if;

  v_tipo := case
    when p_confirmar_titularidad then 'confirmacion_e164_y_titularidad'
    else 'confirmacion_e164'
  end;

  begin
    insert into auditoria.telefonos_confirmados (
      jugador_id, accion, valor_anterior, valor_nuevo,
      confirmado_por, confirmado_en, motivo, evidencia, txid
    )
    values (
      p_jugador_id, v_tipo, v_anterior, v_candidato.e164_norm,
      v_admin, pg_catalog.now(), pg_catalog.btrim(p_motivo),
      nullif(pg_catalog.btrim(p_evidencia), ''),
      pg_catalog.txid_current()
    );

    /* Una sola transacción: la auditoría y el UPDATE se confirman o se
       revierten juntos. El trigger usa txid_current() para acreditar. */
    update public.jugadores j
       set telefono_e164        = v_candidato.e164_norm,
           telefono_valido_plan = null,
           telefono_verificado  = case
             when p_confirmar_titularidad then true
             else j.telefono_verificado
           end
     where j.id = p_jugador_id;
  exception
    when unique_violation then
      get stacked diagnostics
        v_mensaje     = message_text,
        v_restriccion = constraint_name,
        v_esquema     = schema_name,
        v_tabla       = table_name;

      if v_restriccion = 'jugadores_e164_canonicalizado_uniq' then
        raise exception 'E.164 ya existe en otro jugador (conflicto concurrente)';
      else
        raise exception
          'Violación de unicidad no telefónica: restricción % en %.% (%)',
          coalesce(v_restriccion, 'desconocida'),
          coalesce(v_esquema, 'desconocido'),
          coalesce(v_tabla, 'desconocida'),
          v_mensaje;
      end if;
  end;

  return pg_catalog.jsonb_build_object(
    'anterior', v_anterior,
    'nuevo', v_candidato.e164_norm,
    'tipo', v_tipo,
    'titularidad_confirmada', p_confirmar_titularidad,
    'validacion_plan', 'pendiente_js',
    'recalculo_requerido', true,
    'telefono_historico', 'no_modificado',
    'duplicados_no_estructurales_ignorados', v_no_estructurales
  );
end;
$$;

revoke all on function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Privilegios efectivos.
--    UPDATE: columnas legítimas del panel, todas bajo el trigger autoritativo
--    de migration-seguridad-2.3.sql. Nunca telefono_verificado, super_admin,
--    email ni user_id.
--    INSERT: solo datos personales. El servidor fija rol, flags, torneo y
--    número. El trigger de titularidad fija telefono_verificado.
--    DELETE: bloqueado para clientes; solo Edge Functions/service_role.
-- ---------------------------------------------------------------------------
revoke update on public.jugadores from public, anon, authenticated;
revoke insert on public.jugadores from public, anon, authenticated;
revoke delete on public.jugadores from public, anon, authenticated;
revoke update (telefono_verificado, super_admin, email, user_id)
  on public.jugadores from public, anon, authenticated;
revoke insert (telefono_verificado, super_admin, rol, activo, suspendido, torneo_id, numero)
  on public.jugadores from public, anon, authenticated;

grant update (
  nombre_usuario, pais, zona_horaria, avatar_url,
  activo, suspendido, rol, torneo_id, numero,
  telefono, telefono_e164, telefono_nacional, pais_telefono, telefono_valido_plan
) on public.jugadores to authenticated;

grant insert (
  user_id, nombre_usuario, email, pais, zona_horaria, avatar_url,
  telefono, telefono_e164, telefono_nacional, pais_telefono, telefono_valido_plan
) on public.jugadores to authenticated;

-- gl_owner: mínimos de 1.2.1, reafirmados tras los REVOKE anteriores.
revoke all on public.jugadores from gl_owner;
grant select (id, telefono_e164, telefono_verificado)
  on public.jugadores to gl_owner;
grant update (telefono_e164, telefono_valido_plan, telefono_verificado)
  on public.jugadores to gl_owner;

grant usage on schema auditoria to gl_owner;
revoke all on auditoria.telefonos_confirmados from gl_owner;
grant insert (
  jugador_id, accion, valor_anterior, valor_nuevo,
  confirmado_por, confirmado_en, motivo, evidencia, txid
) on auditoria.telefonos_confirmados to gl_owner;

grant execute on function public.gl_es_admin() to gl_owner;
grant execute on function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  to authenticated;

-- Fin de la migración 2.2. La definición autoritativa de roles y permisos
-- se instala en migration-seguridad-2.3.sql.
commit;
