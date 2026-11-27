-- 1.5.3 — Sanciones reales: corrección del trigger de auditoría.
--
-- Fallo observado en producción al aplicar una sanción desde el panel:
--   POST /rest/v1/sanciones → 22P02
--   invalid input syntax for type boolean: "sancion_aplicada"
--
-- Causa comprobada en pg_proc.trg_auditoria_sancion:
--   TG_OP = 'INSERT' AND 'sancion_aplicada' OR 'sancion_modificada'
-- PostgreSQL interpreta AND/OR como operadores booleanos e intenta castear
-- las etiquetas de texto a boolean; ninguna sanción podía insertarse.
-- Se reemplaza por CASE WHEN ... THEN ... ELSE ... END. El resto del trigger
-- (tabla destino, entidad, detalle y valor de retorno) se conserva sin cambios.
begin;

create or replace function public.trg_auditoria_sancion()
returns trigger
language plpgsql
as $fn$
DECLARE
  v_nombre TEXT;
BEGIN
  SELECT nombre_usuario INTO v_nombre
  FROM public.jugadores
  WHERE id = NEW.jugador_id
  LIMIT 1;

  PERFORM public.gl_registrar_auditoria(
    NEW.torneo_id,
    NULL,
    CASE WHEN TG_OP = 'INSERT' THEN 'sancion_aplicada' ELSE 'sancion_modificada' END,
    'jugador',
    NEW.jugador_id,
    NULL,
    json_build_object(
      'jugador',             COALESCE(v_nombre, '?'),
      'tipo',                NEW.tipo,
      'motivo',              COALESCE(NEW.motivo, ''),
      'puntos_descuento',    COALESCE(NEW.puntos_descuento, 0),
      'partidos_suspension', COALESCE(NEW.partidos_suspension, 0)
    )::jsonb
  );
  RETURN NEW;
END;
$fn$;

commit;
