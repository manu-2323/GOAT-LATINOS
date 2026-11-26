import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, lanzarNavegadorVisual } from './lib-verificacion-visual.mjs';

const correo = process.env.GL_ADMIN_EMAIL;
const clave = process.env.GL_ADMIN_PASS;
if (!correo || !clave) {
  console.error('Faltan GL_ADMIN_EMAIL o GL_ADMIN_PASS. No se ejecuta la prueba real.');
  process.exit(1);
}

const out = path.resolve(RAIZ, 'docs/capturas-fase-3.7');
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
  await page.goto(base + '/#resultados', { waitUntil: 'load' });
  await page.waitForSelector('#auth', { timeout: 30000 });
  await page.locator('#auth [data-modo="admin"]').last().click({ force: true });
  await page.waitForSelector('#form-admin');
  await page.evaluate(() => {
    try { localStorage.setItem('gl_tour_admin_v1', '1'); } catch (e) { /* modo privado */ }
  });
  await page.locator('#ad-correo').last().fill(correo);
  await page.locator('#ad-clave').last().fill(clave);
  await page.locator('#form-admin button[type="submit"]').last().click();

  await page.waitForFunction(() => !!document.querySelector('#vista'), { timeout: 60000 });
  await page.evaluate(() => {
    const overlay = document.querySelector('.ob-overlay');
    if (overlay) overlay.remove();
    try { localStorage.setItem('gl_tour_admin_v1', '1'); } catch (e) { /* modo privado */ }
    if (location.hash !== '#resultados') location.hash = '#resultados';
  });

  await page.waitForSelector('#vista .r7-pantalla, #vista .estado-vacio', { timeout: 60000 });
  await page.waitForTimeout(700);

  await page.screenshot({ path: `${out}/despues-resultados-real.png`, fullPage: true });
  const resultado = await page.evaluate(() => ({
    hash: location.hash,
    titulo: document.querySelector('#vista .r7-titulo')?.textContent.trim() || null,
    kpis: [...document.querySelectorAll('#vista .r7-kpi-valor')].map(el => el.textContent.trim()),
    partidos: document.querySelectorAll('#vista .r7-partido').length,
    contador: document.querySelector('#vista #r7-contador')?.textContent.trim() || null,
    panelManual: !!document.querySelector('#vista #g-local'),
    AIATab: !!document.querySelector('#vista [data-modo="ia"]'),
    scrollWidth: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
    estadoVacio: document.querySelector('#vista .estado-vacio')?.innerText.trim().slice(0, 160) || null
  }));

  const datos = {
    ejecutada: true,
    tipo: 'app real autenticada con Supabase · solo lectura',
    resultado,
    erroresConsola: errores,
    fallosRed,
    deudaTecnicaPreexistente: fallosRed.some(f => f.includes('telefono_nacional')),
    captura: `${out}/despues-resultados-real.png`
  };
  fs.writeFileSync(`${out}/verificacion-real.json`, JSON.stringify(datos, null, 2));
  console.log(JSON.stringify(datos, null, 2));
} catch (e) {
  const datos = {
    ejecutada: false,
    tipo: 'app real autenticada con Supabase · solo lectura',
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
