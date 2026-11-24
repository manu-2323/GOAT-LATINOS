-- ===========================================================================
-- GOATS LATINOS · Migración de unicidad histórica (ejecutada en producción)
--===========================================================================
-- Corrige un fallo lógico detectado durante la carga histórica:
--   · fixture.js hace upsert de jornadas con onConflict 'torneo_id,grupo_id,numero'
--     pero esa tupla NO tiene restricción de unicidad → el upsert inserta duplicados.
--   · partidos no tiene restricción que evite regenerar el mismo encuentro.
--   · clasificacion es única por jugador, no por temporada → impide multitemporada.
--
-- Ejecutada el 24/11/2026 en el proyecto zmjzlvsdlfzmhptmtmjx.
-- Se puede volver a ejecutar: usa IF NOT EXISTS y no modifica datos existentes.
-- ===========================================================================

begin;

create unique index if not exists jornadas_torneo_grupo_numero_key
  on public.jornadas (torneo_id, grupo_id, numero);

create unique index if not exists partidos_torneo_grupo_jornada_local_visita_key
  on public.partidos (torneo_id, grupo_id, jornada, local_id, visitante_id);

-- Opcional, solo si se va a soportar más de una temporada activa:
-- alter table public.clasificacion drop constraint if exists clasificacion_jugador_id_key;
-- create unique index if not exists clasificacion_torneo_jugador_key
--   on public.clasificacion (torneo_id, jugador_id);

commit;
