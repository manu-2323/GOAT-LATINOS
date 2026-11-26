// Supabase Edge Function: admin-obtener-clave
// FASE 3.17: este endpoint ya NO entrega ADMIN_PASSWORD. La clave compartida
// vive solo en los secretos del proyecto y se usa server-side para crear
// cuentas administradoras; ninguna pantalla del panel la muestra ni la copia.
// Se conserva el slug para que una versión antigua del cliente reciba una
// respuesta explícita en vez de un 404 opaco.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version, x-supabase-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MENSAJE = 'La clave de administrador no se entrega desde la aplicación. ' +
  'Gestionala en los secretos del proyecto de Supabase.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  return new Response(JSON.stringify({ ok: false, error: MENSAJE, mensaje: MENSAJE }), {
    status: 410,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
});
