import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, lanzarNavegadorVisual } from './lib-verificacion-visual.mjs';

const correo = process.env.GL_ADMIN_EMAIL;
const clave = process.env.GL_ADMIN_PASS;
if (!correo || !clave) {
  console.error('Faltan GL_ADMIN_EMAIL o GL_ADMIN_PASS. No se ejecuta la prueba real.');
  process.exit(1);
}

const out = path.resolve(RAIZ, 'docs/capturas-fase-3.6');
const base = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
fs.mkdirSync(out, { recursive: true });
const browser = await lanzarNavegadorVisual();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* modo privado */ } });
const errores = [];
const fallosRed = [];
page.on('pageerror', e => errores.push('PAGE ' + e.message));
page.on('console', m => { if (m.type() === 'error') errores.push('CONSOLE ' + m.text()); });
page.on('requestfailed', r => fallosRed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
page.on('response', r => { if (r.status() >= 400) fallosRed.push(r.status() + ' ' + r.url()); });

try {
  await page.goto(base + '/#administracion', { waitUntil: 'load' });
  await page.waitForSelector('#auth', { timeout: 30000 });
  await page.locator('#auth [data-modo="admin"]').last().click({ force: true });
  await page.waitForSelector('#form-admin');
  await page.evaluate(() => {
    try {
      localStorage.setItem('gl_tour_admin_v1', '1');
    } catch (e) { /* modo privado */ }
  });
  await page.locator('#ad-correo').last().fill(correo);
  await page.locator('#ad-clave').last().fill(clave);
  await page.locator('#form-admin button[type="submit"]').last().click();
  await page.waitForSelector('#vista [data-tab="equipos"]', { timeout: 60000 });
  await page.evaluate(() => {
    const overlay = document.querySelector('.ob-overlay');
    if (overlay) overlay.remove();
    try { localStorage.setItem('gl_tour_admin_v1', '1'); } catch (e) { /* modo privado */ }
  });
  await page.locator('#vista [data-tab="equipos"]').click();
  await page.waitForSelector('#vista .e6-pantalla', { timeout: 30000 });
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${out}/despues-equipos-real.png`, fullPage: true });
  const resultado = await page.evaluate(() => ({
    titulo: document.querySelector('#vista .e6-titulo')?.textContent.trim(),
    tarjetas: document.querySelectorAll('#vista .e6-card').length,
    kpis: [...document.querySelectorAll('#vista .e6-kpi-valor')].map(el => el.textContent.trim()),
    contador: document.querySelector('#e6-contador')?.textContent.trim(),
    miembrosContexto: (window.GL && GL.ctx.miembros || []).length,
    jugadoresContexto: (window.GL && GL.ctx.jugadores || []).length,
    scrollWidth: document.documentElement.scrollWidth,
    ancho: window.innerWidth
  }));

  const datos = {
    ejecutada: true,
    tipo: 'app real autenticada con Supabase',
    resultado,
    erroresConsola: errores,
    fallosRed,
    captura: `${out}/despues-equipos-real.png`
  };
  fs.writeFileSync(`${out}/verificacion-real.json`, JSON.stringify(datos, null, 2));
  console.log(JSON.stringify(datos, null, 2));
} catch (e) {
  const datos = {
    ejecutada: false,
    tipo: 'app real autenticada con Supabase',
    motivo: e.message,
    textoAuth: await page.locator('#auth').innerText().catch(() => ''),
    erroresConsola: errores,
    fallosRed
  };
  fs.writeFileSync(`${out}/verificacion-real.json`, JSON.stringify(datos, null, 2));
  console.log(JSON.stringify(datos, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
