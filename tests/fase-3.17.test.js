import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const leer = archivo => readFileSync(resolve(raiz, archivo), 'utf8');

const codigoFuncion = leer('supabase/functions/admin-obtener-clave/index.ts');
const codigoAdmin = leer('js/modulos/admin.js');
const codigoSupabase = leer('js/core/supabase.js');
const codigoIndex = leer('index.html');
const codigoConfig = leer('js/core/config.js');
const codigoConfiguracionDoc = leer('docs/CONFIGURACION.md');

function crearHandler() {
  let handler = null;
  const Deno = { serve: fn => { handler = fn; } };
  // El archivo ya no tiene imports ni tipos: es JavaScript ejecutable.
  new Function('Deno', codigoFuncion)(Deno);
  if (typeof handler !== 'function') throw new Error('La Edge Function no registró handler');
  return handler;
}

describe('FASE 3.17 — revisión puntual de seguridad', () => {
  it('la Edge Function no lee ni devuelve ADMIN_PASSWORD', () => {
    expect(codigoFuncion).not.toContain("Deno.env.get('ADMIN_PASSWORD')");
    expect(codigoFuncion).not.toContain('{ password }');
    expect(codigoFuncion).not.toContain('data.password');
    expect(codigoFuncion).toContain('no se entrega desde la aplicación');
  });

  it('la Edge Function responde 410 sin ningún secreto', async () => {
    const handler = crearHandler();
    const respuesta = await handler({ method: 'POST', headers: new Headers() });
    expect(respuesta.status).toBe(410);
    const cuerpo = await respuesta.json();
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo).not.toHaveProperty('password');
    expect(JSON.stringify(cuerpo)).not.toContain('ADMIN_PASSWORD');
    expect(cuerpo.error).toContain('secretos del proyecto');
  });

  it('la Edge Function sigue respondiendo al preflight CORS', async () => {
    const handler = crearHandler();
    const respuesta = await handler({ method: 'OPTIONS', headers: new Headers() });
    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toBe('ok');
  });

  it('el panel ya no ofrece ver ni copiar la clave', () => {
    expect(codigoAdmin).not.toContain('data-ver-clave');
    expect(codigoAdmin).not.toContain('obtenerClaveAdmin');
    expect(codigoAdmin).not.toContain('clave-copiar');
    expect(codigoAdmin).toContain('no se muestra en la aplicación');
  });

  it('el cliente ya no invoca admin-obtener-clave', () => {
    expect(codigoSupabase).not.toContain('obtenerClaveAdmin');
    expect(codigoSupabase).not.toContain('admin-obtener-clave');
    expect(codigoAdmin).not.toContain('admin-obtener-clave');
  });

  it('la documentación de configuración no promete la entrega de la clave', () => {
    expect(codigoConfiguracionDoc).not.toContain('Devuelve la clave de administrador solo al');
    expect(codigoConfiguracionDoc).toContain('no lee ni devuelve `ADMIN_PASSWORD`');
  });

  it('el cache-busting conserva la corrección y se renueva en fases posteriores', () => {
    expect(codigoConfig).toMatch(/VERSION: '1\.3\.[23]'/);
    expect(codigoIndex).toMatch(/\?v=3\.(17|19)\.0/);
    expect(codigoIndex).toMatch(/js\/core\/config\.js\?v=1\.3\.[23]/);
    expect(codigoIndex).toContain('js/core/supabase.js?v=1.2.2');
    expect(codigoIndex).not.toContain('?v=1.3.1');
    expect(codigoIndex).not.toContain('?v=3.16.0');
  });
});
