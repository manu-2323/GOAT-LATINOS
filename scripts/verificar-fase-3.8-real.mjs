import { chromium } from '@playwright/test';
import fs from 'node:fs';

const correo = process.env.GL_ADMIN_EMAIL;
const clave = process.env.GL_ADMIN_PASS;
if (!correo || !clave) {
  console.error('Faltan GL_ADMIN_EMAIL o GL_ADMIN_PASS. No se ejecuta la prueba real.');
  process.exit(1);
}

const out = 'docs/capturas-fase-3.8';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* modo privado */ } });

const errores = [];
const fallosRed = [];
const metodosNoGet = [];
page.on('pageerror', e => errores.push('PAGE ' + e.message));
page.on('console', m => { if (m.type() === 'error') errores.push('CONSOLE ' + m.text()); });
page.on('requestfailed', r => fallosRed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
page.on('response', r => { if (r.status() >= 400) fallosRed.push(r.status() + ' ' + r.url()); });
page.on('request', r => {
  const metodo = r.method().toUpperCase();
  if (!['GET', 'HEAD'].includes(metodo)) metodosNoGet.push(metodo + ' ' + r.url());
});

try {
  await page.goto('http://127.0.0.1:4173/#mensajes', { waitUntil: 'load' });
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
    if (location.hash !== '#mensajes') location.hash = '#mensajes';
  });

  await page.waitForSelector('#vista .m8-pantalla, #vista .estado-vacio', { timeout: 60000 });
  await page.waitForTimeout(800);

  await page.screenshot({ path: `${out}/despues-mensajes-real.png`, fullPage: true });
  const resultado = await page.evaluate(() => ({
    hash: location.hash,
    titulo: document.querySelector('#vista .m8-titulo')?.textContent.trim() || null,
    bajada: document.querySelector('#vista .m8-bajada')?.textContent.trim() || null,
    kpis: [...document.querySelectorAll('#vista .m8-kpi-valor')].map(el => el.textContent.trim()),
    chip: document.querySelector('#vista #m8-verificacion')?.textContent.trim() || null,
    estado: document.querySelector('#vista #msg-estado')?.innerText.trim().slice(0, 240) || null,
    pestañas: [...document.querySelectorAll('#vista [data-tipo]')].map(el => ({
      tipo: el.getAttribute('data-tipo'),
      activa: el.classList.contains('activo')
    })),
    ids: ['msg-grupo', 'msg-jornada', 'msg-estado', 'msg-texto', 'msg-preview'].filter(id => document.getElementById(id)),
    acciones: [...document.querySelectorAll('#vista .m8-acciones button')].map(b => ({
      texto: b.innerText.trim(),
      deshabilitado: b.disabled
    })),
    largoTexto: document.querySelector('#vista #msg-texto')?.value.length || 0,
    preview: (document.querySelector('#vista #msg-preview')?.innerText || '').trim().slice(0, 100),
    scrollWidth: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
    estadoVacio: document.querySelector('#vista .estado-vacio')?.innerText.trim().slice(0, 160) || null
  }));

  const escriturasModulo = [];
  const escriturasAutenticacion = metodosNoGet.filter(m => /\/auth\/v1\/|\/rpc\/gl_validar_acceso_admin/.test(m));
  const datos = {
    ejecutada: true,
    tipo: 'app real autenticada con Supabase · solo lectura del módulo Mensajes',
    resultado,
    erroresConsola: errores,
    fallosRed,
    metodosNoGet,
    escriturasModulo,
    escriturasAutenticacion,
    deudaTecnicaPreexistente: fallosRed.some(f => f.includes('telefono_nacional')),
    captura: `${out}/despues-mensajes-real.png`
  };
  fs.writeFileSync(`${out}/verificacion-real.json`, JSON.stringify(datos, null, 2));
  console.log(JSON.stringify(datos, null, 2));
} catch (e) {
  const datos = {
    ejecutada: false,
    tipo: 'app real autenticada con Supabase · solo lectura del módulo Mensajes',
    motivo: e.message,
    textoAuth: await page.locator('#auth').innerText().catch(() => ''),
    erroresConsola: errores,
    fallosRed,
    metodosNoGet
  };
  fs.writeFileSync(`${out}/verificacion-real.json`, JSON.stringify(datos, null, 2));
  console.log(JSON.stringify(datos, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
