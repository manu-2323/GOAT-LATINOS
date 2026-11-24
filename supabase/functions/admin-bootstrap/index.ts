// Supabase Edge Function: admin-bootstrap
// Acceso de administrador: valida la CLAVE DE ADMINISTRADOR en el servidor.
// Cualquier correo puede usarla; la función crea/promueve ese usuario a admin
// usando la SERVICE ROLE. La clave NUNCA se envía al frontend ni se guarda allí.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version, x-supabase-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const intentos = new Map<string, { cuenta: number; reinicio: number }>();
const LIMITE = 5;
const VENTANA_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function claveIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hash(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
}

function nombreValido(valor: unknown, correo: string): string {
  const base = String(valor || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_');
  return (base || correo.split('@')[0].toUpperCase()).slice(0, 24);
}

async function buscarUsuario(admin: any, correo: string) {
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

async function promover(admin: any, user: any, body: any, correo: string, nombre: string, torneoId: string | null) {
  const { data: filas, error: errFilas } = await admin.from('jugadores')
    .select('id').eq('user_id', user.id).limit(1);
  if (errFilas) throw errFilas;

  const { data: superRows, error: errSuper } = await admin.from('jugadores')
    .select('id').eq('super_admin', true).limit(1);
  if (errSuper) throw errSuper;

  const fila: Record<string, unknown> = {
    nombre_usuario: nombre,
    email: correo,
    rol: 'admin',
    activo: true,
    suspendido: false,
    torneo_id: torneoId || null
  };
  // El primer administrador del sistema pasa a ser el administrador principal.
  if (!superRows || !superRows.length) fila.super_admin = true;
  if (filas && filas.length) {
    const { error } = await admin.from('jugadores').update(fila).eq('id', filas[0].id);
    if (error) throw error;
  } else {
    const { error } = await admin.from('jugadores').insert({ user_id: user.id, ...fila });
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY');
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');
    if (!serviceKey) throw new Error('Falta configurar SERVICE_ROLE_KEY');
    if (!adminPassword) throw new Error('Falta configurar el secret ADMIN_PASSWORD');

    const body = await req.json().catch(() => ({}));
    const correo = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!EMAIL_RE.test(correo)) throw new Error('Ingresá un correo electrónico válido.');
    if (password.length < 8) throw new Error('La clave de administrador es incorrecta.');

    const ip = String(req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    const claveLimit = correo + '|' + ip;
    const ahora = Date.now();
    const registro = intentos.get(claveLimit) || { cuenta: 0, reinicio: ahora + VENTANA_MS };
    if (ahora > registro.reinicio) { registro.cuenta = 0; registro.reinicio = ahora + VENTANA_MS; }
    if (registro.cuenta >= LIMITE) throw new Error('Demasiados intentos. Esperá un minuto y volvé a probar.');

    const esperada = await hash(adminPassword);
    const recibida = await hash(password);
    if (!claveIgual(esperada, recibida)) {
      registro.cuenta++;
      intentos.set(claveLimit, registro);
      throw new Error('La clave de administrador es incorrecta.');
    }
    intentos.delete(claveLimit);

    const admin = createClient(supabaseUrl, serviceKey);
    const nombre = nombreValido(body.nombre_usuario, correo);
    const torneoId = body.torneo_id ? String(body.torneo_id) : null;
    let user = await buscarUsuario(admin, correo);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: correo,
        password,
        email_confirm: true,
        user_metadata: { nombre_usuario: nombre, nombre }
      });
      if (error) throw error;
      user = data.user;
    } else {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        user_metadata: { ...(user.user_metadata || {}), nombre_usuario: nombre, nombre }
      });
      if (error) throw error;
    }
    if (!user) throw new Error('No se pudo crear la cuenta de administrador.');

    await promover(admin, user, body, correo, nombre, torneoId);

    return new Response(JSON.stringify({ ok: true, email: correo }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
