// Supabase Edge Function: admin-bootstrap
// Propósito: crear el PRIMER y ÚNICO superadministrador del sistema.
// Una vez ejecutado con éxito, esta función queda permanentemente bloqueada.
// Para promover admins adicionales usar: admin-promover (solo superadmin).
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
const LIMITE_INTENTOS = 5;
const VENTANA_MINUTOS = 15;
// Contraseña bootstrap fija — solo se usa UNA vez en la vida del sistema.
// Después el bootstrap queda bloqueado para siempre.
const BOOTSTRAP_PASSWORD = 'GOATSLATINOS678';

function timing_safe_equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function nombreValido(valor: unknown, correo: string): string {
  const base = String(valor || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_');
  return (base || correo.split('@')[0].toUpperCase()).slice(0, 24);
}

async function buscarUsuario(admin: ReturnType<typeof createClient>, correo: string) {
  let pagina = 1;
  while (pagina <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    const usuarios = data?.users || [];
    const encontrado = usuarios.find((u: any) => String(u.email || '').toLowerCase() === correo);
    if (encontrado) return encontrado;
    if (usuarios.length < 200) break;
    pagina++;
  }
  return null;
}

async function checkRateLimit(admin: ReturnType<typeof createClient>, clave: string): Promise<void> {
  const ahora = new Date().toISOString();

  // Leer registro actual
  const { data } = await admin
    .from('admin_rate_limit')
    .select('intentos, reinicio_at, bloqueado_hasta')
    .eq('clave', clave)
    .single();

  if (data) {
    // ¿Está bloqueado permanentemente o por tiempo?
    if (data.bloqueado_hasta && new Date(data.bloqueado_hasta) > new Date()) {
      throw new Error('Demasiados intentos fallidos. Intentá de nuevo más tarde.');
    }
    // ¿Ventana expirada? Reiniciar contador
    if (new Date(data.reinicio_at) < new Date()) {
      await admin.from('admin_rate_limit').update({
        intentos: 0,
        reinicio_at: new Date(Date.now() + VENTANA_MINUTOS * 60_000).toISOString(),
        bloqueado_hasta: null
      }).eq('clave', clave);
    } else if (data.intentos >= LIMITE_INTENTOS) {
      // Bloquear por 1 hora al superar el límite
      await admin.from('admin_rate_limit').update({
        bloqueado_hasta: new Date(Date.now() + 60 * 60_000).toISOString()
      }).eq('clave', clave);
      throw new Error('Demasiados intentos fallidos. Cuenta bloqueada 1 hora.');
    }
  }
}

async function registrarIntento(admin: ReturnType<typeof createClient>, clave: string, exito: boolean): Promise<void> {
  if (exito) {
    await admin.from('admin_rate_limit').delete().eq('clave', clave);
    return;
  }
  const { data } = await admin
    .from('admin_rate_limit')
    .select('intentos')
    .eq('clave', clave)
    .single();

  if (data) {
    await admin.from('admin_rate_limit').update({
      intentos: (data.intentos || 0) + 1
    }).eq('clave', clave);
  } else {
    await admin.from('admin_rate_limit').insert({
      clave,
      intentos: 1,
      reinicio_at: new Date(Date.now() + VENTANA_MINUTOS * 60_000).toISOString()
    });
  }
}

async function registrarAuditoria(
  admin: ReturnType<typeof createClient>,
  accion: string,
  usuarioId: string,
  email: string,
  ip: string,
  detalle: object
): Promise<void> {
  await admin.from('admin_audit_log').insert({
    accion,
    usuario_id: usuarioId,
    email,
    realizado_por: usuarioId,
    ip,
    detalle
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ip = String(req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const clave_rl = 'bootstrap|' + ip;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SERVICE_ROLE_KEY');
    if (!serviceKey) throw new Error('Configuración del servidor incompleta.');

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ── 1. Verificar que el bootstrap no fue ejecutado antes ──────────
    const { data: cfg } = await admin
      .from('sistema_config')
      .select('valor')
      .eq('clave', 'bootstrap_completado')
      .single();

    if (cfg && cfg.valor === 'true') {
      return new Response(
        JSON.stringify({ error: 'El sistema ya fue inicializado. Para crear administradores adicionales, el superadministrador debe usar el panel de administración.' }),
        { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. Rate limiting persistente ──────────────────────────────────
    await checkRateLimit(admin, clave_rl);

    // ── 3. Validar body ───────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const correo   = String(body.email    || '').trim().toLowerCase();
    const password = String(body.password || '');
    const nombre   = nombreValido(body.nombre_usuario, correo);

    if (!EMAIL_RE.test(correo)) {
      await registrarIntento(admin, clave_rl, false);
      throw new Error('Ingresá un correo electrónico válido.');
    }
    if (!password) {
      await registrarIntento(admin, clave_rl, false);
      throw new Error('La clave de bootstrap es obligatoria.');
    }

    // ── 4. Verificar clave bootstrap (timing-safe, hardcodeada) ───────
    if (!timing_safe_equal(password, BOOTSTRAP_PASSWORD)) {
      await registrarIntento(admin, clave_rl, false);
      throw new Error('Clave de bootstrap incorrecta.');
    }

    // ── 5. Crear o recuperar cuenta en auth.users ─────────────────────
    let user = await buscarUsuario(admin, correo);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: correo,
        email_confirm: true,
        user_metadata: { nombre_usuario: nombre, nombre }
      });
      if (error) throw error;
      user = data.user;
    } else {
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...(user.user_metadata || {}), nombre_usuario: nombre, nombre }
      });
    }
    if (!user) throw new Error('No se pudo crear la cuenta.');

    // ── 6. Verificar que no hay superadmin ya ─────────────────────────
    const { data: superRows } = await admin
      .from('jugadores')
      .select('id')
      .eq('super_admin', true)
      .limit(1);

    if (superRows && superRows.length > 0) {
      await registrarIntento(admin, clave_rl, false);
      return new Response(
        JSON.stringify({ error: 'Ya existe un superadministrador. Usá el panel de administración.' }),
        { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // ── 7. Promover a superadmin ──────────────────────────────────────
    const torneoId = body.torneo_id ? String(body.torneo_id) : null;
    const fila = {
      nombre_usuario: nombre,
      email: correo,
      rol: 'admin',
      super_admin: true,
      activo: true,
      suspendido: false,
      torneo_id: torneoId
    };

    const { data: filaExistente } = await admin
      .from('jugadores')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (filaExistente && filaExistente.length > 0) {
      const { error } = await admin.from('jugadores').update(fila).eq('id', filaExistente[0].id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('jugadores').insert({ user_id: user.id, ...fila });
      if (error) throw error;
    }

    // ── 8. Marcar bootstrap como completado (bloqueo permanente) ──────
    await admin.from('sistema_config').update({
      valor: 'true',
      updated_at: new Date().toISOString()
    }).eq('clave', 'bootstrap_completado');

    // ── 9. Registrar en auditoría ─────────────────────────────────────
    await registrarAuditoria(admin, 'bootstrap', user.id, correo, ip, {
      nombre_usuario: nombre,
      torneo_id: torneoId
    });

    // ── 10. Limpiar rate limit del IP (éxito) ─────────────────────────
    await registrarIntento(admin, clave_rl, true);

    return new Response(
      JSON.stringify({
        ok: true,
        email: correo,
        mensaje: 'Superadministrador creado. El bootstrap está ahora permanentemente bloqueado.'
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