-- 1.5.3 — Confirmación telefónica real: owner coherente de la RPC.
--
-- Fallo observado en producción (prueba manual real con MANUEL999):
--   POST /rest/v1/rpc/gl_confirmar_e164 → 42501 "permission denied for schema auth"
--
-- Causa comprobada en catálogo:
--   gl_confirmar_e164(uuid,text,text,boolean,text) es SECURITY DEFINER y es
--   el único SECURITY DEFINER de este flujo cuyo owner es gl_owner; todas las
--   RPC vecinas (gl_es_admin, gl_inscribir_participantes, gl_gestionar_baja,
--   gl_cerrar_jornada) son owner de postgres. gl_owner no tiene USAGE sobre
--   el esquema gestionado `auth`, por lo que auth.uid() falla antes de
--   cualquier validación.
--
-- Se intentó el permiso mínimo `grant usage on schema auth to gl_owner`, pero
-- la ACL de `auth` es administrada por la plataforma y el GRANT no quedó
-- registrado (verificado en pg_namespace.nspacl y has_schema_privilege).
-- Por eso se alinea el owner de esta función con el del resto de RPC del
-- proyecto. No se tocan RLS, tablas de Auth, proveedores ni SMTP.
begin;

alter function public.gl_confirmar_e164(uuid, text, text, boolean, text)
  owner to postgres;

notify pgrst, 'reload schema';

commit;
