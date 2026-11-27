-- 1.5.3 — Corrección real de gl_confirmar_e164 (fallo detectado en prueba manual).
--
-- Error observado en producción con MANUEL999:
--   relation "existentes_bloqueantes" does not exist
--
-- Causa: la definición desplegada declara los CTE `existentes_bloqueantes` y
-- `existentes_no_estructurales` dentro de una sentencia, pero los consulta en
-- sentencias posteriores. En PostgreSQL un CTE solo existe para la sentencia
-- que lo define. La corrección unifica la detección de duplicados en UNA
-- sola sentencia y conserva el resto del contrato (validación E.164, mapa de
-- países, cerrojo advisory, auditoría, UPDATE y respuesta jsonb).
begin;

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
as $fn$
declare
  v_admin uuid;
  v_tipo text;
  v_anterior text;
  v_digitos text;
  v_candidato record;
  v_duplicados record;
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

  -- Un solo CTE para resolver el país, prefijo y longitudes del número.
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

  -- Todos los CTE se consumen AQUÍ, en la misma sentencia.
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
  )
  select
    exists (
      select 1 from existentes_bloqueantes e
      where e.id <> p_jugador_id and e.e164_norm = v_candidato.e164_norm
    ) as bloqueante,
    coalesce((
      select pg_catalog.jsonb_agg(e.id)
      from existentes_no_estructurales e
      where e.id <> p_jugador_id and e.e164_norm = v_candidato.e164_norm
    ), '[]'::jsonb) as no_estructurales
  into v_duplicados;

  if v_duplicados.bloqueante then
    raise exception 'E.164 ya existe en otro jugador';
  end if;

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
    'recalculo_requerido', true,
    'telefono_historico', 'no_modificado',
    'duplicados_no_estructurales_ignorados', v_duplicados.no_estructurales
  );
end;
$fn$;

alter function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  owner to postgres;

notify pgrst, 'reload schema';

commit;
