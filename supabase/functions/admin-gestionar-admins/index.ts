// Supabase Edge Function: admin-gestionar-admins
// Alta/baja de administradores. Solo puede llamarla un admin autenticado.
// La SERVICE ROLE se usa en el servidor; el frontend nunca la ve.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version, x-supabase-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY');
    if (!serviceKey) throw new Error('Falta configurar la clave de servicio del servidor');

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) throw new Error('Falta token de sesión');
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: sesion, error: errSesion } = await caller.auth.getUser(token);
    if (errSesion || !sesion.user) throw new Error('Sesión inválida');

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: perfil } = await admin.from('jugadores')
      .select('id,rol,super_admin').eq('user_id', sesion.user.id).limit(1);
    if (!perfil || !perfil.length || perfil[0].rol !== 'admin' || perfil[0].super_admin !== true) {
      throw new Error('Solo el administrador principal puede gestionar administradores');
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const correo = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(correo)) throw new Error('Ingresá un correo electrónico válido.');

    const { data: filas, error: errFilas } = await admin.from('jugadores')
      .select('id,user_id,rol,email,super_admin').eq('email', correo).limit(1);
    if (errFilas) throw errFilas;
    const fila = filas && filas.length ? filas[0] : null;

    if (action === 'remove') {
      if (fila && fila.user_id === sesion.user.id) {
        throw new Error('No podés quitarte el rol a vos mismo.');
      }
      if (fila && fila.super_admin) {
        throw new Error('No se puede quitar el rol al administrador principal.');
      }
      const { data: admins, error: errAdmins } = await admin.from('jugadores')
        .select('id').eq('rol', 'admin');
      if (errAdmins) throw errAdmins;
      if ((admins || []).length <= 1 && fila && fila.rol === 'admin') {
        throw new Error('Debe quedar al menos un administrador.');
      }
      if (!fila) throw new Error('Ese correo no tiene perfil en la liga.');
      const { error } = await admin.from('jugadores').update({
        rol: 'jugador', activo: true, suspendido: false
      }).eq('id', fila.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, action: 'remove' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    if (action !== 'add') throw new Error('Acción no válida.');

    let user = null;
    if (fila && fila.user_id) {
      const { data: userData, error: errUser } = await admin.auth.admin.getUserById(fila.user_id);
      if (errUser) throw errUser;
      user = userData?.user || null;
    }
    if (!user) user = await buscarUsuario(admin, correo);
    if (!user) {
      const password = Deno.env.get('ADMIN_PASSWORD');
      if (!password) throw new Error('Falta configurar el secret ADMIN_PASSWORD para crear la cuenta.');
      const nombre = nombreValido(body.nombre_usuario, correo);
      const { data, error } = await admin.auth.admin.createUser({
        email: correo,
        password,
        email_confirm: true,
        user_metadata: { nombre_usuario: nombre, nombre }
      });
      if (error) throw error;
      user = data.user;
    }
    if (!user) throw new Error('No se pudo resolver la cuenta.');
    if (user.id === sesion.user.id) throw new Error('Ya sos administrador.');

    const nombre = nombreValido(body.nombre_usuario || user.user_metadata?.nombre_usuario, correo);
    const datos = {
      nombre_usuario: nombre,
      email: correo,
      rol: 'admin',
      super_admin: false,
      activo: true,
      suspendido: false,
      torneo_id: body.torneo_id ? String(body.torneo_id) : null
    };
    if (fila) {
      const { error } = await admin.from('jugadores').update(datos).eq('id', fila.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('jugadores').insert({ user_id: user.id, ...datos });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, action: 'add', email: correo }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
