/* =====================================================================
   GOATS LEAGUE MANAGER — Configuración global
   Credenciales públicas (anon). La Service Role NUNCA se usa aquí.
   ===================================================================== */
const CONFIG = {
  SUPABASE_URL: 'https://zmjzlvsdlfzmhptmtmjx.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptanpsdnNkbGZ6bWhwdG10bWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0ODE4MDIsImV4cCI6MjExMTA1NzgwMn0.4FosjYMKwl3n6ab-8Zw48lwxdmk1NQzsHAxynNFiRoA',
  NOMBRE_LIGA: 'GOATS LATINOS',
  VERSION: '1.0.10',
  BUCKET_CAPTURAS: 'capturas-partidos',
  BUCKET_AVATARES: 'avatares',
  JORNADAS_FASE_REGULAR: 22,
  JORNADA_PLAYOFF_INICIO: 23,
  JORNADA_PLAYOFF_FIN: 30,
  MAX_CAPTURA_BYTES: 5 * 1024 * 1024,
  MAX_AVATAR_BYTES: 2 * 1024 * 1024
  /* La clave de administrador NO vive aquí: se valida en una Edge Function. */
};

/* Horario base de referencia: Nicaragua / Costa Rica (UTC-6), 11:00 AM – 9:00 PM.
   La bandera emoji se usa SOLO en textos generados para WhatsApp. */
const PAISES = {
  // prefijo: código de país E.164 (sin +), digitos: longitud esperada del número local
  CR: { nombre: 'Costa Rica',  horario: '11:00 AM – 9:00 PM',  prefijo: '506', digitos: 8  },
  NI: { nombre: 'Nicaragua',   horario: '11:00 AM – 9:00 PM',  prefijo: '505', digitos: 8  },
  MX: { nombre: 'México',      horario: '11:00 AM – 9:00 PM',  prefijo: '52',  digitos: 10 },
  GT: { nombre: 'Guatemala',   horario: '11:00 AM – 9:00 PM',  prefijo: '502', digitos: 8  },
  HN: { nombre: 'Honduras',    horario: '11:00 AM – 9:00 PM',  prefijo: '504', digitos: 8  },
  SV: { nombre: 'El Salvador', horario: '11:00 AM – 9:00 PM',  prefijo: '503', digitos: 8  },
  CO: { nombre: 'Colombia',    horario: '12:00 PM – 10:00 PM', prefijo: '57',  digitos: 10 },
  EC: { nombre: 'Ecuador',     horario: '12:00 PM – 10:00 PM', prefijo: '593', digitos: 9  },
  PA: { nombre: 'Panamá',      horario: '12:00 PM – 10:00 PM', prefijo: '507', digitos: 8  },
  PE: { nombre: 'Perú',        horario: '12:00 PM – 10:00 PM', prefijo: '51',  digitos: 9  },
  VE: { nombre: 'Venezuela',   horario: '12:30 PM – 10:30 PM', prefijo: '58',  digitos: 10 },
  BO: { nombre: 'Bolivia',     horario: '1:00 PM – 11:00 PM',  prefijo: '591', digitos: 8  },
  AR: { nombre: 'Argentina',   horario: '2:00 PM – 12:00 AM',  prefijo: '54',  digitos: 10 },
  CL: { nombre: 'Chile',       horario: '2:00 PM – 12:00 AM',  prefijo: '56',  digitos: 9  },
  PY: { nombre: 'Paraguay',    horario: '2:00 PM – 12:00 AM',  prefijo: '595', digitos: 9  },
  BR: { nombre: 'Brasil',      horario: '2:00 PM – 12:00 AM',  prefijo: '55',  digitos: 11 }
};
const ZONAS_HORARIAS = {
  temprano:  '11:00 AM – 9:00 PM',
  medio:     '12:00 PM – 10:00 PM',
  tarde:     '12:30 PM – 10:30 PM',
  noche:     '1:00 PM – 11:00 PM',
  sur:       '2:00 PM – 12:00 AM'
};

const ESTADOS_PARTIDO = {
  pendiente:            { label: 'Pendiente',            icono: 'clock',        color: 'neutral' },
  jugado:               { label: 'Jugado',               icono: 'check-circle', color: 'green'   },
  walkover_local:       { label: 'Walkover local',       icono: 'x-circle',     color: 'orange'  },
  walkover_visitante:   { label: 'Walkover vis.',        icono: 'x-circle',     color: 'orange'  },
  doble_ausencia:       { label: 'Doble ausencia',       icono: 'minus-circle', color: 'red'     },
  expulsion_local:      { label: '1-0 por expulsión',    icono: 'user-x',       color: 'orange'  },
  expulsion_visitante:  { label: '0-1 por expulsión',    icono: 'user-x',       color: 'orange'  }
};

const TIPOS_SANCION = {
  leve:      { label: 'Leve',      puntos: 3, partidos: 0, descripcion: '-3 puntos' },
  moderada:  { label: 'Moderada',  puntos: 6, partidos: 0, descripcion: '-6 puntos' },
  grave:     { label: 'Grave',     puntos: 0, partidos: 1, descripcion: '1 partido de suspensión' },
  muy_grave: { label: 'Muy grave', puntos: 0, partidos: 0, descripcion: 'Expulsión del torneo', expulsion: true }
};

/* Bandera emoji: exclusivamente para mensajes de WhatsApp / exportación de texto. */
function bandera(codigo) {
  const c = String(codigo || '').toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...c.split('').map(ch => 127397 + ch.charCodeAt(0)));
}

function nombrePais(codigo) {
  return (typeof GL !== 'undefined' && GL && GL.nombrePais)
    ? GL.nombrePais(codigo)
    : ((PAISES[String(codigo || '').toUpperCase()] || {}).nombre || String(codigo || '—'));
}

function horarioPais(codigo) {
  return (typeof GL !== 'undefined' && GL && GL.horarioPais)
    ? GL.horarioPais(codigo)
    : ((PAISES[String(codigo || '').toUpperCase()] || {}).horario || ZONAS_HORARIAS.medio);
}
