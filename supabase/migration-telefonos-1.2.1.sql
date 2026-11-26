-- ===========================================================================
-- GOATS LATINOS · Migración 1.2.1 — Sistema telefónico y confirmación segura
-- ===========================================================================
-- Diseño cerrado en las revisiones 1.2.1. No ejecutar en producción sin:
--   1) backup verificado;
--   2) diagnóstico con rol con SELECT sobre public.jugadores;
--   3) resolución manual de duplicados y conflictos de país;
--   4) comprobación de políticas/membresías reales (ver bloque 0).
--
-- Decisiones conservadas:
--   * telefono_e164       = formato E.164, NO validez del plan.
--   * telefono_valido_plan= resultado de libphonenumber-js; se crea en NULL.
--   * telefono_verificado = titularidad confirmada por una persona.
--   * telefonos dudosos NO se convierten automáticamente en válidos.
--   * telefono historico NO se sobrescribe.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preflight. Si alguna comprobación falla, la transacción se cancela.
--    No se revocan membresías ni se eliminan políticas existentes aquí.
-- ---------------------------------------------------------------------------
do $$
declare
  v_canlogin boolean;
  v_super boolean;
  v_inherit boolean;
  v_bypass boolean;
  v_owner text;
  v_policies text;
begin
  if pg_catalog.to_regprocedure('public.gl_es_admin()') is null then
    raise exception 'Falta public.gl_es_admin()';
  end if;

  if pg_catalog.to_regprocedure('auth.uid()') is null then
    raise exception 'Falta auth.uid()';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'jugadores'
       and c.relrowsecurity
  ) then
    raise exception 'public.jugadores no tiene RLS habilitado';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'gl_owner') then
    create role gl_owner
      nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  else
    select rolcanlogin, rolsuper, rolinherit, rolbypassrls
      into v_canlogin, v_super, v_inherit, v_bypass
      from pg_catalog.pg_roles
     where rolname = 'gl_owner';

    if v_canlogin or v_super or v_inherit or v_bypass then
      raise exception
        'gl_owner existe con atributos incompatibles (login/superuser/inherit/bypassrls)';
    end if;
  end if;

  if pg_catalog.pg_has_role('gl_owner', 'authenticated', 'USAGE')
     or pg_catalog.pg_has_role('gl_owner', 'anon', 'USAGE')
     or pg_catalog.pg_has_role('gl_owner', 'authenticated', 'SET')
     or pg_catalog.pg_has_role('gl_owner', 'anon', 'SET') then
    raise exception
      'gl_owner pertenece efectivamente a authenticated/anon'
      using hint = 'Revisar grantor, herencia y dependencias antes de revocar. No se revoca automáticamente.';
  end if;

  select proowner::regrole::text
    into v_owner
    from pg_catalog.pg_proc
   where oid = pg_catalog.to_regprocedure('public.gl_es_admin()')::oid;

  if v_owner = 'gl_owner' then
    raise exception
      'public.gl_es_admin() es propiedad de gl_owner; las políticas restrictivas romperían la validación';
  end if;

  select string_agg(policyname, ', ' order by policyname)
    into v_policies
    from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename = 'jugadores'
     and permissive = 'RESTRICTIVE'
     and ('gl_owner' = any(roles) or 'public' = any(roles));

  if v_policies is not null then
    raise exception
      'Existen políticas RESTRICTIVE aplicables a gl_owner: %', v_policies
      using hint = 'Revisarlas manualmente antes de ejecutar la migración.';
  end if;

  if exists (
    select 1
      from (
        select '+' || pg_catalog.regexp_replace(telefono_e164, '\D', '', 'g') as k
          from public.jugadores
         where nullif(pg_catalog.btrim(coalesce(telefono_e164, '')), '') is not null
           and pg_catalog.regexp_replace(telefono_e164, '\D', '', 'g') <> ''
           and pg_catalog.regexp_replace(telefono_e164, '\D', '', 'g') not like '0%'
           and pg_catalog.length(
                 pg_catalog.regexp_replace(telefono_e164, '\D', '', 'g')
               ) between 8 and 15
      ) x
     group by k
    having count(*) > 1
  ) then
    raise exception
      'Existen E.164 canónicos duplicados en public.jugadores'
      using hint = 'Resolver manualmente antes de crear el índice único. No se modifica ningún número existente.';
  end if;

  if pg_catalog.to_regclass('public.jugadores_e164_canonicalizado_uniq') is not null
     and not exists (
       select 1
         from pg_catalog.pg_indexes
        where schemaname = 'public'
          and tablename = 'jugadores'
          and indexname = 'jugadores_e164_canonicalizado_uniq'
          and indexdef ilike '%regexp_replace%'
          and indexdef ilike '%telefono_e164%'
     ) then
    raise exception
      'El índice jugadores_e164_canonicalizado_uniq existe con una definición distinta';
  end if;
end $$;

-- PostgreSQL exige pertenencia al rol y CREATE sobre el esquema para
-- transferir la propiedad de una función a gl_owner (creador sin
-- createrole_self_grant). El CREATE se revoca justo después del cambio de
-- propietario (bloque 5); la pertenencia queda solo en postgres, rol
-- administrativo de la base, nunca en anon/authenticated.
grant gl_owner to postgres;
grant create on schema public to gl_owner;

-- ---------------------------------------------------------------------------
-- 1) Esquema privado de auditoría. No debe figurar en "Exposed schemas".
-- ---------------------------------------------------------------------------
create schema if not exists auditoria;

revoke all on schema auditoria from public, anon, authenticated;

create table if not exists auditoria.telefonos_confirmados (
  id bigint generated always as identity primary key,
  jugador_id uuid not null,
  accion text not null,
  valor_anterior text,
  valor_nuevo text not null,
  confirmado_por uuid not null,
  confirmado_en timestamptz not null default pg_catalog.now(),
  motivo text not null,
  evidencia text
);

alter table auditoria.telefonos_confirmados add column if not exists evidencia text;
alter table auditoria.telefonos_confirmados enable row level security;

revoke all on auditoria.telefonos_confirmados from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Columnas y significados. No se añaden CHECK constraints todavía.
-- ---------------------------------------------------------------------------
alter table public.jugadores add column if not exists telefono_e164 text;
alter table public.jugadores add column if not exists telefono_nacional text;
alter table public.jugadores add column if not exists pais_telefono text;
alter table public.jugadores add column if not exists telefono_verificado boolean not null default false;
alter table public.jugadores add column if not exists telefono_valido_plan boolean;

comment on column public.jugadores.telefono_e164 is
  'E.164 canónico con +. Formato, NO validación del plan ni titularidad.';
comment on column public.jugadores.telefono_nacional is
  'Número nacional sin prefijo internacional. Solo NI se deriva en SQL; el resto se recalcula con libphonenumber-js.';
comment on column public.jugadores.pais_telefono is
  'ISO usado como referencia del número. No se sobrescribe en conflictos.';
comment on column public.jugadores.telefono_valido_plan is
  'Resultado de libphonenumber-js. NULL = no evaluado.';
comment on column public.jugadores.telefono_verificado is
  'Confirmación de titularidad hecha por una persona. Nunca se deriva de formato ni de isValid().';

-- ---------------------------------------------------------------------------
-- 3) Firma antigua del RPC: se renombra, no se elimina.
-- ---------------------------------------------------------------------------
do $$
begin
  if pg_catalog.to_regprocedure(
       'public.gl_confirmar_e164(uuid,text,boolean,text)'
     ) is not null then
    execute 'alter function public.gl_confirmar_e164(uuid, text, boolean, text) rename to gl_confirmar_e164_legacy';
  end if;

  if pg_catalog.to_regprocedure(
       'public.gl_confirmar_e164_legacy(uuid,text,boolean,text)'
     ) is not null then
    execute 'revoke all on function public.gl_confirmar_e164_legacy(uuid, text, boolean, text) from public, anon, authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Normalización determinista del histórico.
--    telefonos dudosos quedan en revisión; nun se inventa validez.
-- ---------------------------------------------------------------------------
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

base as (
  select
    j.id,
    j.telefono                                              as tel_original,
    j.telefono_nacional                                     as nacional_original,
    j.telefono_verificado                                   as verificado_original,
    nullif(btrim(coalesce(j.telefono_e164, '')), '')        as e164_txt,
    nullif(btrim(coalesce(j.telefono, '')), '')             as tel_txt,
    upper(nullif(btrim(coalesce(j.pais_telefono, '')), '')) as pais_tel,
    upper(nullif(btrim(coalesce(j.pais, '')), ''))          as pais_jugador
  from public.jugadores j
),

pais_estado as (
  select
    b.*,
    case
      when b.pais_tel is null and b.pais_jugador is null
        then 'sin_pais'
      when b.pais_tel is null
        then case
               when exists (select 1 from map m where m.pais = b.pais_jugador)
                 then 'ok_desde_jugador'
               else 'pais_jugador_desconocido'
             end
      when not exists (select 1 from map m where m.pais = b.pais_tel)
        then 'pais_telefono_desconocido'
      when b.pais_jugador is not null
       and not exists (select 1 from map m where m.pais = b.pais_jugador)
        then 'pais_jugador_desconocido'
      when b.pais_jugador is not null and b.pais_tel <> b.pais_jugador
        then 'pais_conflictivo'
      when b.pais_jugador is null
        then 'ok_desde_telefono'
      else 'ok_coincidente'
    end as estado_pais
  from base b
),

pais_resuelto as (
  select
    e.*,
    case
      when e.estado_pais in ('ok_desde_jugador', 'ok_desde_telefono', 'ok_coincidente')
        then coalesce(e.pais_tel, e.pais_jugador)
      else null
    end as pais_final
  from pais_estado e
),

preparado as (
  select
    p.*,
    (p.tel_txt like '+%' or p.tel_txt like '00%') as tel_explicito_intl,
    regexp_replace(coalesce(p.e164_txt, ''), '\D', '', 'g') as e164_digitos,
    regexp_replace(coalesce(p.tel_txt, ''), '\D', '', 'g')  as tel_digitos
  from pais_resuelto p
),

e164_prefijo as (
  select
    p.*,
    mp.pais       as pais_e164,
    mp.prefijo    as prefijo_e164,
    mp.longitudes as longs_e164
  from preparado p
  left join lateral (
    select m.pais, m.prefijo, m.longitudes
    from map m
    where p.e164_digitos like m.prefijo || '%'
    order by length(m.prefijo) desc
    limit 1
  ) mp on true
),

tel_prefijo as (
  select
    e.*,
    case
      when e.tel_digitos like '00%' then substring(e.tel_digitos from 3)
      else e.tel_digitos
    end as tel_digitos_normales,
    mt.pais       as pais_tel_prefijo,
    mt.prefijo    as prefijo_tel,
    mt.longitudes as longs_tel
  from e164_prefijo e
  left join lateral (
    select m.pais, m.prefijo, m.longitudes
    from map m
    where (
      case
        when e.tel_digitos like '00%' then substring(e.tel_digitos from 3)
        else e.tel_digitos
      end
    ) like m.prefijo || '%'
    order by length(m.prefijo) desc
    limit 1
  ) mt on true
),

con_pais as (
  select
    t.*,
    mc.prefijo    as prefijo_pais,
    mc.longitudes as longs_pais
  from tel_prefijo t
  left join map mc on mc.pais = t.pais_final
),

-- Candidato derivado del histórico: solo candidato de formato, NO validez.
con_historico as (
  select
    c.*,
    case
      when c.estado_pais not in ('ok_desde_jugador', 'ok_desde_telefono', 'ok_coincidente')
        then null
      when c.tel_txt is null then null
      when c.tel_digitos = '' then null

      when c.tel_explicito_intl then
        case
          when c.pais_tel_prefijo is null
            or c.prefijo_tel is null
            or c.pais_tel_prefijo <> c.pais_final
            or c.tel_digitos_normales not like c.prefijo_tel || '%'
            or length(c.tel_digitos_normales) <= length(c.prefijo_tel)
            or not (
                 (length(c.tel_digitos_normales) - length(c.prefijo_tel)) = any(c.longs_tel)
               )
            then null
          else '+' || c.tel_digitos_normales
        end

      when not c.tel_explicito_intl then
        case
          when c.pais_tel_prefijo is not null
           and c.prefijo_tel is not null
           and c.pais_tel_prefijo = c.pais_final
           and c.tel_digitos_normales like c.prefijo_tel || '%'
           and length(c.tel_digitos_normales) > length(c.prefijo_tel)
           and (length(c.tel_digitos_normales) - length(c.prefijo_tel)) = any(c.longs_tel)
            then '+' || c.tel_digitos_normales

          when c.tel_digitos_normales like '0%'
            then null

          when length(c.tel_digitos_normales) = any(c.longs_pais)
            then '+' || c.prefijo_pais || c.tel_digitos_normales

          else null
        end
    end as hist_candidato
  from con_pais c
),

clasificado as (
  select
    c.*,
    case
      when c.estado_pais not in ('ok_desde_jugador', 'ok_desde_telefono', 'ok_coincidente')
        then c.estado_pais

      when c.e164_txt is not null then
        case
          when c.e164_digitos = '' then 'e164_incompleto'
          when c.pais_e164 is null then 'prefijo_no_reconocido'
          when c.pais_e164 <> c.pais_final then 'e164_incompatible_pais'
          when c.e164_digitos like '0%'
            or length(c.e164_digitos) not between 8 and 15
            or not (
                 (length(c.e164_digitos) - length(c.prefijo_e164)) = any(c.longs_e164)
               )
            then 'e164_incompleto'
          when c.hist_candidato is null then 'e164_sin_confirmacion_historica'
          when '+' || c.e164_digitos <> c.hist_candidato then 'e164_contradice_historico'
          else 'e164_coherente'
        end

      when c.tel_txt is null then 'sin_telefono'
      when c.tel_digitos = '' then 'invalido'

      when c.tel_explicito_intl then
        case
          when c.pais_tel_prefijo is null then 'prefijo_no_reconocido'
          when c.pais_tel_prefijo <> c.pais_final then 'prefijo_incompatible'
          when (length(c.tel_digitos_normales) - length(c.prefijo_tel)) = any(c.longs_tel)
            then 'internacional_aparentemente_correcto'
          else 'invalido'
        end

      when not c.tel_explicito_intl then
        case
          when c.pais_tel_prefijo = c.pais_final
           and c.tel_digitos_normales like c.prefijo_tel || '%'
           and (length(c.tel_digitos_normales) - length(c.prefijo_tel)) = any(c.longs_tel)
            then 'internacional_aparentemente_correcto'
          when c.tel_digitos_normales like '0%' then 'cero_inicial_revision'
          when length(c.tel_digitos_normales) = any(c.longs_pais) then 'local_requiere_prefijo'
          when c.pais_tel_prefijo is not null
           and c.pais_tel_prefijo <> c.pais_final
           and (length(c.tel_digitos_normales) - length(c.prefijo_tel)) = any(c.longs_tel)
            then 'prefijo_incompatible'
          else 'invalido'
        end

      else 'invalido'
    end as categoria,

    case
      when c.estado_pais not in ('ok_desde_jugador', 'ok_desde_telefono', 'ok_coincidente')
        then null

      when c.e164_txt is not null then
        case
          when c.e164_digitos <> ''
           and c.pais_final is not null
           and c.pais_e164 = c.pais_final
           and c.e164_digitos not like '0%'
           and length(c.e164_digitos) between 8 and 15
           and (length(c.e164_digitos) - length(c.prefijo_e164)) = any(c.longs_e164)
           and c.hist_candidato = '+' || c.e164_digitos
            then '+' || c.e164_digitos
          else null
        end

      when c.tel_txt is null then null
      when c.tel_digitos = '' then null

      when c.tel_explicito_intl then
        case
          when c.pais_tel_prefijo = c.pais_final
           and c.tel_digitos_normales like c.prefijo_tel || '%'
           and (length(c.tel_digitos_normales) - length(c.prefijo_tel)) = any(c.longs_tel)
            then '+' || c.tel_digitos_normales
          else null
        end

      when not c.tel_explicito_intl then
        case
          when c.pais_tel_prefijo = c.pais_final
           and c.tel_digitos_normales like c.prefijo_tel || '%'
           and (length(c.tel_digitos_normales) - length(c.prefijo_tel)) = any(c.longs_tel)
            then '+' || c.tel_digitos_normales
          when c.tel_digitos_normales like '0%' then null
          when length(c.tel_digitos_normales) = any(c.longs_pais)
            then '+' || c.prefijo_pais || c.tel_digitos_normales
          else null
        end

      else null
    end as e164_propuesto
  from con_historico c
),

existentes_normalizados as (
  select
    j.id,
    regexp_replace(j.telefono_e164, '\D', '', 'g') as digitos,
    '+' || regexp_replace(j.telefono_e164, '\D', '', 'g') as e164_norm,
    mp.pais as pais_prefijo,
    mp.prefijo,
    mp.longitudes
  from public.jugadores j
  left join lateral (
    select m.pais, m.prefijo, m.longitudes
    from map m
    where regexp_replace(j.telefono_e164, '\D', '', 'g') like m.prefijo || '%'
    order by length(m.prefijo) desc
    limit 1
  ) mp on true
  where nullif(btrim(coalesce(j.telefono_e164, '')), '') is not null
),

existentes_bloqueantes as (
  select e.*
  from existentes_normalizados e
  where e.digitos <> ''
    and e.digitos not like '0%'
    and length(e.digitos) between 8 and 15
    and e.pais_prefijo is not null
    and (length(e.digitos) - length(e.prefijo)) = any(e.longitudes)
),

existentes_no_estructurales as (
  select e.*
  from existentes_normalizados e
  where not (
        e.digitos <> ''
    and e.digitos not like '0%'
    and length(e.digitos) between 8 and 15
    and e.pais_prefijo is not null
    and (length(e.digitos) - length(e.prefijo)) = any(e.longitudes)
  )
),

conflictos as (
  select c.id, 'duplicado_propuesto' as tipo
  from clasificado c
  where c.e164_propuesto is not null
    and exists (
      select 1 from clasificado c2
      where c2.id <> c.id and c2.e164_propuesto = c.e164_propuesto
    )

  union

  select c.id, 'duplicado_existente_otra_fila' as tipo
  from clasificado c
  where c.e164_propuesto is not null
    and exists (
      select 1 from existentes_bloqueantes e
      where e.id <> c.id and e.e164_norm = c.e164_propuesto
    )

  union

  select c.id, 'duplicado_existente_previo' as tipo
  from clasificado c
  where c.e164_txt is not null
    and exists (
      select 1 from existentes_bloqueantes e
      where e.id <> c.id
        and e.e164_norm = '+' || regexp_replace(c.e164_txt, '\D', '', 'g')
    )
),

conflictos_agrupados as (
  select id, array_agg(tipo order by tipo) as tipos_conflicto
  from conflictos
  group by id
),

con_duplicado as (
  select
    c.*,
    case when ca.id is not null then 'duplicado_posible' else c.categoria end as categoria_final,
    case when ca.id is not null then null else c.e164_propuesto end as e164_a_aplicar,
    ca.tipos_conflicto
  from clasificado c
  left join conflictos_agrupados ca on ca.id = c.id
),

nacional_evaluado as (
  select
    d.*,
    mm.prefijo as prefijo_final,
    case
      when d.e164_a_aplicar is null then 'sin_e164'
      when mm.pais = 'NI' and d.e164_a_aplicar ~ '^\+505[0-9]{8}$' then 'generado_sql'
      when nullif(btrim(coalesce(d.nacional_original, '')), '') is null then 'pendiente_calculo_js'
      when regexp_replace(d.nacional_original, '\D', '', 'g')
           = substring(d.e164_a_aplicar from length(mm.prefijo) + 2)
        then 'existente_coherente'
      else 'pendiente_revision_js'
    end as nacional_estado,
    case
      when mm.pais = 'NI' and d.e164_a_aplicar ~ '^\+505[0-9]{8}$'
        then regexp_replace(d.e164_a_aplicar, '^\+505([0-9]{4})([0-9]{4})$', '\1-\2')
      else d.nacional_original
    end as nacional_a_aplicar
  from con_duplicado d
  left join map mm on mm.pais = d.pais_final
)

update public.jugadores j
set
  telefono_e164     = l.e164_a_aplicar,
  pais_telefono     = l.pais_final,
  telefono_nacional = l.nacional_a_aplicar
from nacional_evaluado l
where j.id = l.id
  and l.e164_a_aplicar is not null
  and l.categoria_final in (
        'local_requiere_prefijo',
        'internacional_aparentemente_correcto',
        'e164_coherente'
      )
  and (
        j.telefono_e164     is distinct from l.e164_a_aplicar
     or j.pais_telefono     is distinct from l.pais_final
     or j.telefono_nacional is distinct from l.nacional_a_aplicar
      );

create index if not exists jugadores_telefono_e164_idx
  on public.jugadores (telefono_e164)
  where telefono_e164 is not null;

create unique index if not exists jugadores_e164_canonicalizado_uniq
  on public.jugadores (
    ('+' || regexp_replace(telefono_e164, '\D', '', 'g'))
  )
  where nullif(btrim(coalesce(telefono_e164, '')), '') is not null
    and regexp_replace(telefono_e164, '\D', '', 'g') <> ''
    and regexp_replace(telefono_e164, '\D', '', 'g') not like '0%'
    and length(regexp_replace(telefono_e164, '\D', '', 'g')) between 8 and 15;

analyze public.jugadores;

-- ---------------------------------------------------------------------------
-- 5) RPC de confirmación administrativa. Entrada E.164 canónica obligatoria.
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

  perform pg_catalog.set_config('app.gl_jugador_id', p_jugador_id::text, true);
  perform pg_catalog.set_config('app.gl_admin_id', v_admin::text, true);

  -- E.164 canónico: +, sin espacios/guiones, sin cero inicial, 8-15 dígitos.
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
      confirmado_por, confirmado_en, motivo, evidencia
    )
    values (
      p_jugador_id, v_tipo, v_anterior, v_candidato.e164_norm,
      v_admin, pg_catalog.now(), pg_catalog.btrim(p_motivo),
      nullif(pg_catalog.btrim(p_evidencia), '')
    );

    -- Nunca se escribe telefono. La validez del plan se reevaluará en JS.
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
    'telefono_historico', 'no_modificado',
    'duplicados_no_estructurales_ignorados', v_no_estructurales
  );
end;
$$;

alter function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  owner to gl_owner;

revoke create on schema public from gl_owner;

revoke all on function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  from public, anon, authenticated;

grant execute on function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Políticas RLS. No se eliminan políticas existentes; solo se crean las
--    nuevas de este diseño (con drop if exists de esos mismos nombres).
-- ---------------------------------------------------------------------------
drop policy if exists gl_rpc_select_jugadores on public.jugadores;
create policy gl_rpc_select_jugadores
  on public.jugadores
  for select to gl_owner
  using (
       telefono_e164 is not null
    or id = pg_catalog.current_setting('app.gl_jugador_id', true)::uuid
  );

drop policy if exists gl_rpc_update_jugadores on public.jugadores;
create policy gl_rpc_update_jugadores
  on public.jugadores
  for update to gl_owner
  using (id = pg_catalog.current_setting('app.gl_jugador_id', true)::uuid)
  with check (id = pg_catalog.current_setting('app.gl_jugador_id', true)::uuid);

drop policy if exists gl_rpc_select_limit_jugadores on public.jugadores;
create policy gl_rpc_select_limit_jugadores
  on public.jugadores as restrictive
  for select to gl_owner
  using (
       telefono_e164 is not null
    or id = pg_catalog.current_setting('app.gl_jugador_id', true)::uuid
  );

drop policy if exists gl_rpc_update_limit_jugadores on public.jugadores;
create policy gl_rpc_update_limit_jugadores
  on public.jugadores as restrictive
  for update to gl_owner
  using (id = pg_catalog.current_setting('app.gl_jugador_id', true)::uuid)
  with check (id = pg_catalog.current_setting('app.gl_jugador_id', true)::uuid);

drop policy if exists gl_rpc_block_insert_jugadores on public.jugadores;
create policy gl_rpc_block_insert_jugadores
  on public.jugadores as restrictive
  for insert to gl_owner
  with check (false);

drop policy if exists gl_rpc_block_delete_jugadores on public.jugadores;
create policy gl_rpc_block_delete_jugadores
  on public.jugadores as restrictive
  for delete to gl_owner
  using (false);

drop policy if exists gl_rpc_insert_auditoria on auditoria.telefonos_confirmados;
create policy gl_rpc_insert_auditoria
  on auditoria.telefonos_confirmados
  for insert to gl_owner
  with check (
       confirmado_por = pg_catalog.current_setting('app.gl_admin_id', true)::uuid
   and accion in ('confirmacion_e164', 'confirmacion_e164_y_titularidad')
  );

drop policy if exists gl_rpc_insert_limit_auditoria on auditoria.telefonos_confirmados;
create policy gl_rpc_insert_limit_auditoria
  on auditoria.telefonos_confirmados as restrictive
  for insert to gl_owner
  with check (
       confirmado_por = pg_catalog.current_setting('app.gl_admin_id', true)::uuid
   and accion in ('confirmacion_e164', 'confirmacion_e164_y_titularidad')
  );

-- ---------------------------------------------------------------------------
-- 7) Permisos mínimos por columna. gl_owner NO es propietario de las tablas
--    y NO tiene BYPASSRLS.
-- ---------------------------------------------------------------------------
revoke all on public.jugadores from gl_owner;
grant select (id, telefono_e164, telefono_verificado)
  on public.jugadores to gl_owner;
grant update (telefono_e164, telefono_valido_plan, telefono_verificado)
  on public.jugadores to gl_owner;

grant usage on schema auditoria to gl_owner;
revoke all on auditoria.telefonos_confirmados from gl_owner;
grant insert (
  jugador_id, accion, valor_anterior, valor_nuevo,
  confirmado_por, confirmado_en, motivo, evidencia
) on auditoria.telefonos_confirmados to gl_owner;

grant execute on function public.gl_es_admin() to gl_owner;

-- Fin de la migración 1.2.1.
commit;
