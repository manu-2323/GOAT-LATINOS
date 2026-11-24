// Supabase Edge Function: admin-obtener-clave
// Devuelve ADMIN_PASSWORD únicamente al super_admin autenticado, para que
// pueda compartirla manualmente con los nuevos administradores.
// La clave nunca se guarda en el frontend ni en la base de datos.

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

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: perfil } = await admin.from('jugadores')
      .select('rol,super_admin')
      .eq('user_id', sesion.user.id)
      .maybeSingle();
    if (!perfil || perfil.rol !== 'admin' || perfil.super_admin !== true) {
      throw new Error('Solo el administrador principal puede ver la clave.');
    }

    const password = Deno.env.get('ADMIN_PASSWORD');
    if (!password) throw new Error('Falta configurar el secret ADMIN_PASSWORD');

    return new Response(JSON.stringify({ password }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
