-- Migra las políticas que consultaban `public.jugadores` desde su propio USING/WITH CHECK.
-- Esa subconsulta disparaba de nuevo las políticas de `jugadores` y causaba
-- "infinite recursion detected in policy for relation jugadores" (42P17) en cada
-- lectura con sesión (authenticated). Las funciones gl_es_admin() y
-- gl_es_super_admin() son SECURITY DEFINER con search_path fijo: devuelven el
-- mismo resultado sin volver a evaluar RLS sobre `jugadores`.
-- Aplicar UNA vez. Idempotente: recrea las políticas por nombre.

begin;

  drop policy if exists "gl_read" on public.jugadores;
  create policy "gl_read" on public.jugadores
    for select to authenticated
    using (user_id = auth.uid() or public.gl_es_admin());

  drop policy if exists "jugadores_admin_lee_todo" on public.jugadores;
  create policy "jugadores_admin_lee_todo" on public.jugadores
    for select to authenticated
    using (public.gl_es_admin());

  drop policy if exists "solo admin modifica partidos" on public.partidos;
  create policy "solo admin modifica partidos" on public.partidos
    for all to public
    using (public.gl_es_admin())
    with check (public.gl_es_admin());

  drop policy if exists "audit_insert" on public.auditoria;
  create policy "audit_insert" on public.auditoria
    for insert to authenticated
    with check (public.gl_es_admin());

  drop policy if exists "audit_read" on public.auditoria;
  create policy "audit_read" on public.auditoria
    for select to authenticated
    using (public.gl_es_admin());

  drop policy if exists "audit_solo_superadmin" on public.admin_audit_log;
  create policy "audit_solo_superadmin" on public.admin_audit_log
    for select to authenticated
    using (public.gl_es_super_admin());

  drop policy if exists "gl_read" on public.bitacora_jornadas;
  create policy "gl_read" on public.bitacora_jornadas
    for select to authenticated
    using (public.gl_es_admin());

  drop policy if exists "notif_insert" on public.notificaciones;
  create policy "notif_insert" on public.notificaciones
    for insert to authenticated
    with check (public.gl_es_admin());

commit;

notify pgrst, 'reload schema';
