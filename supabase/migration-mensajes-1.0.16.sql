-- Mensajes verificados (1.0.16)
-- La jornada pasa a tener horario real y el torneo un reglamento editable.
-- Los valores son instantes UTC (timestamptz): el navegador los convierte a la
-- zona IANA de cada jugador con Intl.DateTimeFormat. Idempotente.

begin;

  alter table public.jornadas
    add column if not exists fecha_inicio timestamptz,
    add column if not exists hora_limite timestamptz;

  alter table public.torneos
    add column if not exists reglamento text;

  comment on column public.jornadas.fecha_inicio is
    'Instante real de inicio de la jornada, cargado por el administrador.';
  comment on column public.jornadas.hora_limite is
    'Instante real de cierre de la jornada, cargado por el administrador.';
  comment on column public.torneos.reglamento is
    'Reglamento vigente que se incluye en los mensajes de WhatsApp.';

  update public.torneos
     set reglamento = 'Cada jornada dura 4 horas del mismo día. Si acordaste una hora específica tenés ±20 minutos de margen. Si no aparecés: 3-0 para el que sí estuvo. Si ninguno apareció: 0-0. Las sanciones se aplican por puntos o por suspensión. Siempre debés subir la captura del resultado para que sea válido.'
   where reglamento is null;

commit;

notify pgrst, 'reload schema';
