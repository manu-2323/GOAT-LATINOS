// Supabase Edge Function: eliminar-cuenta
// Permite a un jugador autenticado borrar su propia cuenta y todos sus datos
// de la liga. Usa SERVICE_ROLE_KEY porque un usuario no puede borrarse a sí
// mismo desde el cliente. El super_admin y el último admin no pueden borrarse.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version, x-supabase-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY');
    if (!serviceKey) throw new Error('Falta configurar el secret SERVICE_ROLE_KEY');

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) throw new Error('Falta token de sesión');
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: sesion, error: errSesion } = await caller.auth.getUser(token);
    if (errSesion || !sesion.user) throw new Error('Sesión inválida');

    const body = await req.json().catch(() => ({}));
    if (String(body.confirmacion || '').toUpperCase() !== 'ELIMINAR') {
      throw new Error('Confirmá la eliminación para continuar');
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: filas, error: errPerfil } = await admin.from('jugadores')
      .select('id,user_id,rol,super_admin')
      .eq('user_id', sesion.user.id)
      .limit(1);
    if (errPerfil) throw errPerfil;
    const perfil = filas && filas[0];

    if (perfil && perfil.rol === 'admin') {
      if (perfil.super_admin) throw new Error('El administrador principal no puede eliminar su cuenta.');
      const { data: admins, error: errAdmins } = await admin.from('jugadores')
        .select('id').eq('rol', 'admin');
      if (errAdmins) throw errAdmins;
      if ((admins || []).length <= 1) throw new Error('Debe quedar al menos un administrador.');
    }

    const userId = sesion.user.id;

    if (perfil) {
      const id = perfil.id;
      await admin.from('partidos').delete().or(`local_id.eq.${id},visitante_id.eq.${id}`);
      await admin.from('clasificacion').delete().eq('jugador_id', id);
      await admin.from('sanciones').delete().eq('jugador_id', id);
      await admin.from('grupo_jugadores').delete().eq('jugador_id', id);
      await admin.from('jugadores').delete().eq('id', id);
    }

    const { error: errStorage } = await admin.storage.from('avatares').remove([userId + '/']);
    if (errStorage) console.warn('No se pudo borrar el avatar:', errStorage.message);

    const { error: errAuth } = await admin.auth.admin.deleteUser(userId);
    if (errAuth) throw errAuth;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
