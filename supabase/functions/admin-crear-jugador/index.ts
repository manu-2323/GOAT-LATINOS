// Supabase Edge Function: admin-crear-jugador
// Crea o elimina (action:'delete') un usuario de Auth y su fila en `jugadores`
// usando la SERVICE ROLE. Verifica que quien llama sea administrador.
// La clave secreta NUNCA se expone al frontend.
// 1.2.1: el teléfono se valida en el servidor con la MISMA versión fija de
// libphonenumber-js que usa el frontend. `telefono_verificado` nunca se escribe
// desde aquí: la titularidad solo la confirma una persona.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as phone from 'https://esm.sh/libphonenumber-js@1.13.17/min';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version, x-supabase-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Los 16 países activos del mapa 1.2.1. Un prefijo fuera de esta lista no
// puede acreditarse como "válido para el plan".
const PAISES_TELEFONO = new Set([
  'CR', 'NI', 'MX', 'GT', 'HN', 'SV', 'CO', 'EC',
  'PA', 'PE', 'VE', 'BO', 'AR', 'CL', 'PY', 'BR'
]);

function camposTelefono(b: any) {
  const e164 = String(b.telefono_e164 || '').trim();
  const pais = String(b.pais_telefono || b.pais || '').toUpperCase();
  const nacional = String(b.telefono_nacional || '').trim();

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw new Error('El teléfono debe enviarse en formato E.164 válido (con +).');
  }
  if (!PAISES_TELEFONO.has(pais)) {
    throw new Error('El país del teléfono no está habilitado.');
  }
  if (b.telefono_valido_plan !== true) {
    throw new Error('El teléfono debe tener formato válido para el plan.');
  }

  const digitos = e164.slice(1);
  // El campo histórico se conserva solo como dígitos y debe coincidir.
  if (b.telefono) {
    const legado = String(b.telefono).replace(/\D/g, '');
    if (legado && legado !== digitos) {
      throw new Error('El teléfono y su representación E.164 no coinciden.');
    }
  }

  const parsed = phone.parsePhoneNumberFromString(e164);
  if (!parsed || !parsed.isValid()) {
    throw new Error('El teléfono no es válido según libphonenumber-js.');
  }
  if (parsed.country && String(parsed.country).toUpperCase() !== pais) {
    throw new Error('El prefijo del teléfono no corresponde al país elegido.');
  }

  // El campo nacional no puede quedar como E.164 cuando el formulario no lo
  // envió. Se recalcula con la misma librería y el país ya validado.
  const nacionalCalculado = (() => {
    const objeto = phone.parsePhoneNumberFromString(e164, pais);
    if (!objeto) return '';
    try {
      return typeof objeto.formatNational === 'function'
        ? objeto.formatNational()
        : objeto.format('NATIONAL');
    } catch (_) {
      return '';
    }
  })();

  return {
    telefono: digitos,
    telefono_e164: e164,
    telefono_nacional: nacional || nacionalCalculado,
    pais_telefono: pais,
    telefono_valido_plan: true
  };
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
    const { data: userData, error: userErr } = await caller.auth.getUser(token);
    if (userErr || !userData.user) throw new Error('Sesión inválida');

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: perfil } = await admin.from('jugadores')
      .select('rol').eq('user_id', userData.user.id).single();
    if (!perfil || perfil.rol !== 'admin') throw new Error('No tenés permisos de administrador');

    const b = await req.json();
    const action = String(b.action || 'create');

    if (action === 'delete') {
      const jugadorId = String(b.jugador_id || '');
      if (!jugadorId) throw new Error('Falta el jugador a eliminar');

      const { data: objetivos, error: errObjetivo } = await admin.from('jugadores')
        .select('id,user_id,rol,nombre_usuario')
        .eq('id', jugadorId)
        .limit(1);
      if (errObjetivo) throw errObjetivo;
      const objetivo = objetivos && objetivos.length ? objetivos[0] : null;
      if (!objetivo) throw new Error('El jugador ya no existe');
      if (objetivo.rol === 'admin') {
        throw new Error('Las cuentas administradoras se gestionan desde la pestaña Admins');
      }

      await admin.from('partidos').delete().or(`local_id.eq.${objetivo.id},visitante_id.eq.${objetivo.id}`);
      await admin.from('clasificacion').delete().eq('jugador_id', objetivo.id);
      await admin.from('sanciones').delete().eq('jugador_id', objetivo.id);
      await admin.from('notificaciones').delete().eq('jugador_id', objetivo.id);
      await admin.from('grupo_jugadores').delete().eq('jugador_id', objetivo.id);

      const { error: errJugador } = await admin.from('jugadores').delete().eq('id', objetivo.id);
      if (errJugador) throw errJugador;

      if (objetivo.user_id) {
        const { error: errAvatar } = await admin.storage.from('avatares')
          .remove([objetivo.user_id + '/']);
        if (errAvatar) console.warn('No se pudo borrar el avatar:', errAvatar.message);

        const { error: errAuth } = await admin.auth.admin.deleteUser(objetivo.user_id);
        if (errAuth) throw errAuth;
      }

      return new Response(JSON.stringify({
        ok: true,
        action: 'delete',
        mensaje: 'Jugador y cuenta eliminados correctamente.'
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action !== 'create') throw new Error('Acción no válida');
    if (!b.email || !b.password || !b.nombre_usuario) throw new Error('Faltan datos obligatorios');
    const telefono = camposTelefono(b);

    // La zona IANA se valida en el servidor: Intl la rechaza si no existe.
    let zonaHoraria = 'America/Managua';
    if (b.zona_horaria) {
      try {
        new Intl.DateTimeFormat('es-ES', { timeZone: String(b.zona_horaria) });
        zonaHoraria = String(b.zona_horaria);
      } catch (_) {
        throw new Error('La ciudad o zona horaria no es válida');
      }
    }

    const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
      email: b.email,
      password: b.password,
      email_confirm: true,
      user_metadata: {
        nombre_usuario: b.nombre_usuario,
        pais: b.pais || 'NI',
        ...telefono
      }
    });
    if (errAuth) throw errAuth;

    try {
      const { data: fila, error: errJugador } = await admin.from('jugadores').insert({
        user_id: creado.user.id,
        nombre_usuario: b.nombre_usuario,
        email: String(b.email || '').trim().toLowerCase(),
        pais: b.pais || 'NI',
        zona_horaria: zonaHoraria,
        ...telefono,
        rol: 'jugador',
        activo: true,
        suspendido: false,
        torneo_id: b.torneo_id
      }).select('id').single();
      if (errJugador) throw errJugador;

      if (b.grupo_id) {
        const { error: errGrupo } = await admin.from('grupo_jugadores')
          .insert({ grupo_id: b.grupo_id, jugador_id: fila.id });
        if (errGrupo) throw errGrupo;
      }
    } catch (error) {
      // Evita dejar un usuario de Auth huérfano si falla la base de datos.
      await admin.auth.admin.deleteUser(creado.user.id);
      throw error;
    }

    return new Response(JSON.stringify({ ok: true, user_id: creado.user.id }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
