-- =====================================================================
-- GOATS LATINOS — Migración 1.2.0
-- Teléfonos internacionales: separa país, E.164, formato nacional y
-- verificación. Mantiene `telefono` por compatibilidad con el código 1.1.0.
-- Idempotente: se puede ejecutar más de una vez sin duplicar columnas.
-- =====================================================================

begin;

alter table public.jugadores add column if not exists telefono_e164 text;
alter table public.jugadores add column if not exists telefono_nacional text;
alter table public.jugadores add column if not exists pais_telefono text;
alter table public.jugadores add column if not exists telefono_verificado boolean not null default false;

comment on column public.jugadores.telefono_e164 is
  'Número E.164 canónico con + y prefijo internacional, p. ej. +50581085555';
comment on column public.jugadores.telefono_nacional is
  'Formato nacional según metadata de libphonenumber-js, p. ej. 8108-5555 en Nicaragua';
comment on column public.jugadores.pais_telefono is
  'ISO 3166-1 alpha-2 usado para formatear y validar el número';
comment on column public.jugadores.telefono_verificado is
  'Indica que el formato fue validado. NO implica que exista cuenta de WhatsApp.';

-- Backfill ordenado: se limpian espacios, guiones y el + heredado.
update public.jugadores
   set telefono_e164 = case
         when nullif(btrim(coalesce(telefono_e164, '')), '') is not null
           then '+' || regexp_replace(telefono_e164, '\D', '', 'g')
         when nullif(btrim(coalesce(telefono, '')), '') is not null
           then '+' || regexp_replace(telefono, '\D', '', 'g')
         else null
       end,
       pais_telefono = coalesce(
         nullif(upper(btrim(coalesce(pais_telefono, ''))), ''),
         nullif(upper(btrim(coalesce(pais, ''))), '')
       ),
       telefono_nacional = case
         when upper(coalesce(pais_telefono, pais, '')) = 'NI'
          and regexp_replace(coalesce(telefono_e164, telefono, ''), '\D', '', 'g') ~ '^505[0-9]{8}$'
           then regexp_replace(
                  regexp_replace(coalesce(telefono_e164, telefono, ''), '\D', '', 'g'),
                  '^505([0-9]{4})([0-9]{4})$', '\1-\2')
         else coalesce(telefono_nacional, telefono)
       end
 where nullif(btrim(coalesce(telefono_e164, telefono, '')), '') is not null;

create index if not exists jugadores_telefono_e164_idx
  on public.jugadores (telefono_e164)
  where telefono_e164 is not null;

commit;
