/* Crea/actualiza el jugador de prueba de QA sin guardar credenciales en el repo.
   Degrada gracefulmente si la migración 1.2.0 aún no está aplicada en remoto. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cfg = readFileSync(resolve('js/core/config.js'), 'utf8');
const URL_BASE = cfg.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const ANON = cfg.match(/SUPABASE_KEY:\s*'([^']+)'/)[1];
const EMAIL = 'joaquin.11sb.goats2026@gmail.com';
const NOMBRE = 'FC Mobile de Joaquín. 11sb';

async function req(ruta, { method = 'GET', key = ANON, body } = {}) {
  const r = await fetch(URL_BASE + ruta, {
    method,
    headers: {
      apikey: ANON,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(body ? { Prefer: 'return=representation' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { ok: r.ok, estado: r.status, datos };
}

const login = await req('/auth/v1/token?grant_type=password', {
  method: 'POST',
  body: { email: process.env.GL_ADMIN_EMAIL, password: process.env.GL_ADMIN_PASS }
});
if (!login.ok) throw new Error('No se pudo iniciar sesión como administrador: ' + JSON.stringify(login.datos));
const token = login.datos.access_token;

let busqueda = await req('/rest/v1/jugadores?email=eq.' + encodeURIComponent(EMAIL) + '&select=*', { key: token });
let fila = busqueda.datos && busqueda.datos[0];
if (!fila) {
  busqueda = await req('/rest/v1/jugadores?nombre_usuario=eq.' + encodeURIComponent(NOMBRE) + '&select=*', { key: token });
  fila = busqueda.datos && busqueda.datos[0];
}
const datosComunes = {
  nombre_usuario: NOMBRE,
  email: EMAIL,
  pais: 'NI',
  telefono: '50581085555',
  telefono_e164: '+50581085555',
  pais_telefono: 'NI',
  activo: true,
  suspendido: false
};
const datos120 = { ...datosComunes, telefono_nacional: '8108-5555', telefono_verificado: true };

if (!fila) {
  console.log('Creando fila del jugador de prueba…');
  let insercion = await req('/rest/v1/jugadores', { method: 'POST', key: token, body: [datos120] });
  if (!insercion.ok) {
    console.log('   Migración 1.2.0 pendiente; se inserta con columnas existentes.');
    insercion = await req('/rest/v1/jugadores', { method: 'POST', key: token, body: [datosComunes] });
  }
  if (!insercion.ok) throw new Error('No se pudo insertar: ' + JSON.stringify(insercion.datos));
  fila = insercion.datos[0];
} else {
  console.log('Fila existente: ' + fila.nombre_usuario);
}

let actualizacion = await req('/rest/v1/jugadores?id=eq.' + fila.id, { method: 'PATCH', key: token, body: datos120 });
if (!actualizacion.ok) {
  actualizacion = await req('/rest/v1/jugadores?id=eq.' + fila.id, { method: 'PATCH', key: token, body: datosComunes });
}
if (!actualizacion.ok) throw new Error('No se pudo actualizar: ' + JSON.stringify(actualizacion.datos));

const torneos = await req('/rest/v1/torneos?select=id&limit=1', { key: token });
const torneoId = torneos.datos && torneos.datos[0] && torneos.datos[0].id;
if (torneoId) {
  const grupos = await req('/rest/v1/grupos?torneo_id=eq.' + torneoId + '&select=id&limit=1', { key: token });
  const grupoId = grupos.datos && grupos.datos[0] && grupos.datos[0].id;
  if (grupoId) {
    const ya = await req('/rest/v1/grupo_jugadores?jugador_id=eq.' + fila.id + '&select=jugador_id', { key: token });
    if (!ya.datos || !ya.datos.length) {
      const asignacion = await req('/rest/v1/grupo_jugadores', {
        method: 'POST', key: token, body: [{ jugador_id: fila.id, grupo_id: grupoId }]
      });
      console.log('Grupo:', asignacion.ok ? 'asignado' : JSON.stringify(asignacion.datos).slice(0, 160));
    } else console.log('Grupo: ya asignado');
  }
}
const final = await req('/rest/v1/jugadores?id=eq.' + fila.id + '&select=id,nombre_usuario,email,pais,telefono_e164,pais_telefono', { key: token });
console.log('JUGADOR FINAL', JSON.stringify(final.datos && final.datos[0]));
