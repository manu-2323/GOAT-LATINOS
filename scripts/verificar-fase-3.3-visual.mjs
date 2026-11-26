import { chromium } from '@playwright/test';
import fs from 'node:fs';

const modo = process.argv[2] === 'despues' ? 'despues' : 'antes';
const base = 'file:///C:/Users/manue/AppData/Local/Temp/opencode/GOAT-LATINOS-deploy';
const out = 'docs/capturas-fase-3.3';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
});

async function abrir(page, width, height) {
  await page.route(/^https?:\/\//, route => route.abort());
  await page.setViewportSize({ width, height });
  await page.goto(base + '/mock-componentes-3.3.html', { waitUntil: 'load' });
  await page.waitForSelector('[data-cmp="botones"]', { timeout: 20000 });
  await page.waitForTimeout(250);
}

const resultados = { modo, capturas: [], responsive: [], interaccion: null, foco: null, modal: null };

async function captura(page, nombre, selector) {
  const ruta = `${out}/${modo}-${nombre}.png`;
  if (selector) await page.locator(selector).screenshot({ path: ruta });
  else await page.screenshot({ path: ruta, fullPage: true });
  resultados.capturas.push({ nombre: `${modo}-${nombre}`, ruta });
}

{
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await abrir(page, 1366, 900);
  await captura(page, 'escritorio');
  await captura(page, 'botones', '[data-cmp="botones"]');
  await captura(page, 'formularios', '[data-cmp="formularios"]');
  await captura(page, 'tarjetas-kpi', '[data-cmp="tarjetas-kpi"]');
  await captura(page, 'tablas', '[data-cmp="tablas"]');
  await captura(page, 'estados', '[data-cmp="estados"]');

  await page.click('#demo-abrir-dialogo');
  await page.waitForSelector('.modal-fondo .modal');
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/${modo}-modales.png` });
  resultados.capturas.push({ nombre: `${modo}-modales`, ruta: `${out}/${modo}-modales.png` });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await abrir(page, 390, 844);
  await captura(page, 'movil');
  await page.close();
}

for (const width of [320, 375, 390, 430, 768, 1024, 1366, 1920]) {
  const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 } });
  await abrir(page, width, width < 500 ? 844 : 900);
  const m = await page.evaluate(() => {
    const visibles = [...document.querySelectorAll('body *')].filter(el => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 &&
        el.getClientRects().length > 0 && el.textContent.trim();
    });
    const pequenos = visibles.filter(el => parseFloat(getComputedStyle(el).fontSize) < 12)
      .slice(0, 5).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] + ':' + getComputedStyle(el).fontSize);
    const controles = [...document.querySelectorAll('.btn,.btn-icon,.btn-icono,.btn-pag,.input')]
      .filter(el => el.getClientRects().length > 0 && !el.disabled);
    const alturas = controles.map(el => Math.round(el.getBoundingClientRect().height)).filter(n => n > 0);
    const iconosSinLabel = [...document.querySelectorAll('.btn-icon,.btn-icono')]
      .filter(el => el.getClientRects().length > 0 && !el.getAttribute('aria-label')).length;
    const tabla = document.querySelector('.tabla');
    const wrap = document.querySelector('.tabla-wrap');
    return {
      ancho: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      fuentesMenores12: pequenos,
      minControl: alturas.length ? Math.min(...alturas) : null,
      iconosSinLabel,
      tablaDentroDeContenedor: !!(tabla && wrap && tabla.getBoundingClientRect().left >= wrap.getBoundingClientRect().left - 1)
    };
  });
  resultados.responsive.push({ width, ...m });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await abrir(page, 1366, 900);
  const accionados = await page.evaluate(() => {
    const botones = [...document.querySelectorAll('[data-accion]:not(:disabled)')];
    botones.forEach(b => b.click());
    return { total: botones.length, pulsados: botones.filter(b => b.dataset.pulsado === 'true').length };
  });
  resultados.interaccion = accionados;

  await page.keyboard.press('Tab');
  resultados.foco = await page.evaluate(() => {
    const el = document.activeElement, s = getComputedStyle(el);
    return { etiqueta: el.tagName.toLowerCase(), clase: el.className || '', outlineColor: s.outlineColor, outlineWidth: s.outlineWidth };
  });

  const disparador = page.locator('#demo-abrir-dialogo');
  await disparador.click();
  await page.waitForSelector('.modal-fondo .modal');
  await page.waitForTimeout(120);
  const dentro = await page.evaluate(() => {
    const m = document.querySelector('.modal').getBoundingClientRect();
    const f = document.activeElement;
    return {
      dentroViewport: m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight,
      focoDentro: !!f && document.querySelector('.modal').contains(f),
      tieneAriaModal: document.querySelector('.modal').getAttribute('aria-modal') === 'true'
    };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const trasCerrar = await page.evaluate(() => ({
    modalCerrado: !document.querySelector('.modal-fondo'),
    focoRestaurado: document.activeElement && document.activeElement.id === 'demo-abrir-dialogo'
  }));
  resultados.modal = { ...dentro, ...trasCerrar };
  await page.close();
}

await browser.close();
fs.writeFileSync(`${out}/verificacion-${modo}.json`, JSON.stringify(resultados, null, 2));
console.log(JSON.stringify({
  modo,
  capturas: resultados.capturas.length,
  responsive: resultados.responsive.map(r => ({ width: r.width, scrollWidth: r.scrollWidth, fuentes: r.fuentesMenores12.length, minControl: r.minControl, iconosSinLabel: r.iconosSinLabel })),
  interaccion: resultados.interaccion,
  foco: resultados.foco,
  modal: resultados.modal
}, null, 2));
