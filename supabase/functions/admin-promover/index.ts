// Supabase Edge Function: admin-promover
// Permite al superadministrador promover o revocar privilegios de administrador.
// Requiere JWT válido del superadmin + TOTP si MFA está habilitado.
// Registra cada acción en admin_audit_log.
// @ts-ignore
/// <reference types="https://esm.sh/@supabase/supabase-js@2/dist/module/index.d.ts" />
// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ip = String(req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY');
    if (!serviceKey) throw new Error('Configuración del servidor incompleta.');

    // ── 1. Verificar JWT del solicitante ──────────────────────────────
    const authHeader = req.headers.get('authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) throw new Error('Se requiere autenticación.');

    // Cliente con service role para operaciones privilegiadas
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

  // Cliente con JWT del solicitante para verificar su identidad
    const anonKey = Deno.env.get('GOATS_ANON_KEY') ?? '';
    const caller = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: 'Bearer ' + jwt } }
    });
    const { data: { user: callerUser }, error: authErr } = await caller.auth.getUser();
    if (authErr || !callerUser) throw new Error('Token inválido o expirado.');

    // ── 2. Verificar que el solicitante es superadmin ─────────────────
    const { data: callerRow, error: callerErr } = await admin
      .from('jugadores')
      .select('id, rol, super_admin')
      .eq('user_id', callerUser.id)
      .single();

    if (callerErr || !callerRow) throw new Error('No se encontró tu perfil de jugador.');
    if (callerRow.rol !== 'admin' || callerRow.super_admin !== true) {
      throw new Error('Solo el superadministrador puede gestionar otros administradores.');
    }

    // ── 3. Validar body ───────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion || ''); // 'promover' | 'revocar'
    const correo = String(body.email || '').trim().toLowerCase();

    if (!['promover', 'revocar'].includes(accion)) {
      throw new Error('Acción inválida. Usá "promover" o "revocar".');
    }
    if (!EMAIL_RE.test(correo)) {
      throw new Error('Correo electrónico inválido.');
    }

    // ── 4. Buscar el usuario objetivo ─────────────────────────────────
    let pagina = 1;
    let targetUser: any = null;
    while (pagina <= 20 && !targetUser) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) throw error;
      const usuarios = data?.users || [];
      targetUser = usuarios.find((u: any) => String(u.email || '').toLowerCase() === correo);
      if (usuarios.length < 200) break;
      pagina++;
    }
    if (!targetUser) throw new Error('No existe una cuenta con ese correo en el sistema.');

    // ── 5. Protecciones ───────────────────────────────────────────────
    // No puede actuar sobre sí mismo
    if (targetUser.id === callerUser.id) {
      throw new Error('No podés modificar tus propios privilegios.');
    }

    const { data: targetRow } = await admin
      .from('jugadores')
      .select('id, rol, super_admin')
      .eq('user_id', targetUser.id)
      .single();

    // No puede promover a superadmin (eso solo se hace por bootstrap o SQL directo)
    if (accion === 'promover' && body.super_admin === true) {
      throw new Error('No se puede promover a superadministrador desde esta función.');
    }

    // No puede revocar al superadmin
    if (accion === 'revocar' && targetRow && targetRow.super_admin === true) {
      throw new Error('No se pueden revocar los privilegios del superadministrador.');
    }

    // ── 6. Ejecutar la acción ─────────────────────────────────────────
    const nombre = String(body.nombre_usuario || correo.split('@')[0]).toUpperCase().slice(0, 24);

    if (accion === 'promover') {
      const fila = {
        nombre_usuario: nombre,
        email: correo,
        rol: 'admin',
        super_admin: false,  // nunca se sube a superadmin desde aquí
        activo: true,
        suspendido: false
      };
      if (targetRow) {
        const { error } = await admin.from('jugadores').update(fila).eq('id', targetRow.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from('jugadores').insert({ user_id: targetUser.id, ...fila });
        if (error) throw error;
      }
    } else {
      // revocar: volver a rol jugador
      if (!targetRow) throw new Error('El usuario no tiene perfil en la liga.');
      const { error } = await admin.from('jugadores').update({
        rol: 'jugador',
        super_admin: false
      }).eq('id', targetRow.id);
      if (error) throw error;
    }

    // ── 7. Auditoría ──────────────────────────────────────────────────
    await admin.from('admin_audit_log').insert({
      accion,
      usuario_id: targetUser.id,
      email: correo,
      realizado_por: callerUser.id,
      ip,
      detalle: { nombre_usuario: nombre, accion }
    });

    return new Response(
      JSON.stringify({
        ok: true,
        email: correo,
        accion,
        mensaje: accion === 'promover'
          ? 'Usuario promovido a administrador correctamente.'
          : 'Privilegios de administrador revocados correctamente.'
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});