// Supabase Edge Function: analizar-captura
// Extrae marcador y estadísticas de una captura de FC Mobile usando Gemini Flash-Lite.
// Requiere sesión de administrador. GEMINI_API_KEY y SERVICE_ROLE_KEY son secrets
// de Supabase; nunca se envían al navegador.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version, x-supabase-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const PROMPT = 'Analizá esta captura de FC Mobile. Extraé únicamente los datos del marcador y las estadísticas visibles. Respondé SOLO con un objeto JSON válido, sin texto adicional ni backticks, con exactamente estas claves numéricas: {"goles_local": 0, "goles_visitante": 0, "tiros_local": 0, "tiros_puerta_local": 0, "posesion_local": 0, "pase_local": 0, "tiros_visitante": 0, "tiros_puerta_visitante": 0, "posesion_visitante": 0, "pase_visitante": 0}. Si algún dato no aparece, usá 0.';
const CAMPOS = [
  'goles_local', 'goles_visitante', 'tiros_local', 'tiros_puerta_local',
  'posesion_local', 'pase_local', 'tiros_visitante', 'tiros_puerta_visitante',
  'posesion_visitante', 'pase_visitante'
];
const PORCENTAJES = new Set(['posesion_local', 'pase_local', 'posesion_visitante', 'pase_visitante']);
const MAX_BYTES = 5 * 1024 * 1024;
// Modelo estable y de baja latencia para extracción estructurada con imagen.
// El modelo Flash 3.8 piensa en nivel medium por defecto y su latencia es excesiva
// para este caso; el modelo 2.0 de Gemini fue retirado por Google.
const MODELO = 'gemini-3.5-flash-lite';
const TIMEOUT_GEMINI_MS = 18000;

function bytesDeBase64(valor: string): number {
  const s = valor.replace(/\s/g, '');
  if (!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) {
    throw new Error('La imagen debe venir en base64 válido');
  }
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - padding;
}

function normalizar(datos: any) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new Error('El modelo no devolvió un JSON válido');
  }
  const salida: Record<string, number> = {};
  for (const campo of CAMPOS) {
    const n = Number(datos[campo]);
    if (!Number.isFinite(n) || n < 0) throw new Error('Respuesta incompleta o inválida: ' + campo);
    salida[campo] = PORCENTAJES.has(campo) ? Math.min(100, Math.round(n)) : Math.round(n);
  }
  return salida;
}

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
    const { data: userData, error: userErr } = await caller.auth.getUser(token);
    if (userErr || !userData.user) throw new Error('Sesión inválida');

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: perfil } = await admin.from('jugadores')
      .select('rol').eq('user_id', userData.user.id).maybeSingle();
    if (!perfil || perfil.rol !== 'admin') throw new Error('No tenés permisos de administrador');

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('Falta configurar el secret GEMINI_API_KEY');

    const body = await req.json();
    const media_type = body.media_type;
    if (media_type !== 'image/jpeg' && media_type !== 'image/png') {
      throw new Error('Formato no admitido. Usá JPG o PNG');
    }
    const image = String(body.image || '').replace(/\s/g, '');
    if (bytesDeBase64(image) > MAX_BYTES) throw new Error('La imagen supera los 5 MB');

    const respuesta = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODELO + ':generateContent?key=' +
        encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_GEMINI_MS),
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: media_type, data: image } },
              { text: PROMPT }
            ]
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: 'minimal' }
          }
        })
      }
    );

    const json = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(json?.error?.message || 'Error de Gemini API: ' + respuesta.status);
    }
    const texto = (json.candidates || [])
      .map((c: any) => (c.content?.parts || []).map((p: any) => p.text || '').join(''))
      .join('')
      .replace(/```json|```/gi, '')
      .trim();
    if (!texto) throw new Error('Gemini no devolvió contenido');
    const datos = normalizar(JSON.parse(texto));
    return new Response(JSON.stringify(datos), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const raw = (error as Error).message || 'Error inesperado';
    const mensaje = /timeout|abort|timed out/i.test(raw)
      ? 'Gemini tardó demasiado en responder. Intentá de nuevo.'
      : raw;
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
