CREATE OR REPLACE FUNCTION public.gl_es_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.jugadores j
    WHERE j.user_id = auth.uid()
      AND j.rol     = 'admin'
      AND j.activo  = TRUE
  );
$function$
