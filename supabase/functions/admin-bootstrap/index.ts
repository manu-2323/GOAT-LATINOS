// Supabase Edge Function: admin-bootstrap (retirada en 1.0.18)
// El acceso de administrador ya no usa bootstrap. Ahora se valida con la RPC
// pública gl_validar_acceso_admin: correo autorizado + hash bcrypt + intentos.
// Esta función queda desactivada permanentemente y no contiene ninguna clave.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  return new Response(
    JSON.stringify({
      error: 'El acceso bootstrap fue retirado. Usá Acceso de administrador con tu correo autorizado.'
    }),
    { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
});
