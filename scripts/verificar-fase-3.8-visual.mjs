import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = 'file:///C:/Users/manue/AppData/Local/Temp/opencode/GOAT-LATINOS-deploy';
const out = 'docs/capturas-fase-3.8';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
});

const resultados = {
  capturas: [],
  responsive: [],
  estados: {},
  interacciones: null,
  foco: null,
  movimientoReducido: null,
  consola: [],
  errorEsperado: []
};

async function abrir(page, width, height, query = 'estado=datos') {
  await page.addInitScript(() => {
    window.__wa = [];
    window.open = function (url) { window.__wa.push(String(url)); return null; };
  });
  await page.route(/^https?:\/\//, route => route.abort());
  await page.setViewportSize({ width, height });
  await page.goto(base + '/mock-mensajes-3.8.html?' + query, { waitUntil: 'load' });
  if (query.includes('estado=carga')) {
    await page.waitForSelector('#vista .skeleton-wrap', { timeout: 20000 });
    return;
  }
  await page.waitForSelector('#vista .m8-pantalla, #vista .estado-vacio', { timeout: 20000 });
  await page.waitForTimeout(250);
}

async function captura(page, nombre, fullPage = true) {
  const ruta = `${out}/despues-${nombre}.png`;
  await page.screenshot({ path: ruta, fullPage });
  resultados.capturas.push({ nombre: 'despues-' + nombre, ruta });
}

async function metricas(page) {
  return page.evaluate(() => {
    const visibles = [...document.querySelectorAll('#vista *')].filter(el => {
      const s = getComputedStyle(el);
      return !el.classList.contains('sr-only') &&
        s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 &&
        el.getClientRects().length > 0 && el.textContent.trim();
    });
    const pequenos = visibles.filter(el => parseFloat(getComputedStyle(el).fontSize) < 12)
      .slice(0, 8).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] + ':' + getComputedStyle(el).fontSize);
    const controles = [...document.querySelectorAll('#vista button:not(:disabled), #vista a[href], #vista input:not(:disabled), #vista select:not(:disabled), #vista textarea:not(:disabled)')]
      .filter(el => el.getClientRects().length > 0);
    const alturas = controles.map(el => Math.round(el.getBoundingClientRect().height)).filter(n => n > 0);
    const kpis = [...document.querySelectorAll('#vista .m8-kpi')];
    const filasKpi = kpis.length ? new Set(kpis.map(el => Math.round(el.getBoundingClientRect().top))).size : 0;
    const desbordesInternos = visibles.filter(el => {
      const s = getComputedStyle(el);
      return el.scrollWidth > el.clientWidth + 1 &&
        s.textOverflow !== 'ellipsis' && s.overflowX !== 'hidden' &&
        ['DIV', 'LI', 'SPAN', 'STRONG', 'P', 'H1', 'H2', 'H3', 'LABEL', 'ARTICLE', 'BUTTON'].includes(el.tagName);
    }).slice(0, 8).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]);
    const contenedor = document.querySelector('#vista .m8-pantalla');
    const bloques = contenedor
      ? [...contenedor.children].filter(el => el.getClientRects().length > 0).map(el => el.getBoundingClientRect())
      : [];
    let traslapes = 0;
    for (let i = 0; i < bloques.length; i++) for (let j = i + 1; j < bloques.length; j++) {
      const a = bloques[i], b = bloques[j];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) traslapes++;
    }
    return {
      ancho: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      fuentesMenores12: pequenos,
      minControl: alturas.length ? Math.min(...alturas) : null,
      filasKpi,
      desbordesInternos,
      traslapes
    };
  });
}

const estados = [
  ['datos', 'estado=datos', 'con-datos'],
  ['vacio', 'estado=vacio', 'vacio'],
  ['carga', 'estado=carga', 'cargando'],
  ['error', 'estado=error', 'error'],
  ['bloqueado', 'estado=bloqueado', 'bloqueado'],
  ['cierreValido', 'estado=cerrada&tipo=cierre', 'cierre-valido']
];
for (const [clave, query, nombre] of estados) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGE ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('CONSOLE ' + m.text()); });
  await abrir(page, 1366, 900, query);
  await captura(page, nombre, clave !== 'carga');
  resultados.estados[clave] = await page.evaluate(() => ({
    pantalla: !!document.querySelector('#vista .m8-pantalla'),
    skeleton: !!document.querySelector('#vista .skeleton-wrap'),
    error: !!document.querySelector('#vista .estado-vacio.error'),
    chip: document.querySelector('#vista #m8-verificacion')?.textContent.trim() || null,
    estado: document.querySelector('#vista #msg-estado')?.innerText.trim().slice(0, 180) || null,
    problemas: document.querySelectorAll('#vista .m8-problemas li').length,
    botonesBloqueados: [...document.querySelectorAll('#vista .m8-acciones button')].filter(b => b.disabled).length,
    botones: document.querySelectorAll('#vista .m8-acciones button').length,
    largoTexto: document.querySelector('#vista #msg-texto')?.value.length || 0
  }));
  if (clave === 'error') resultados.errorEsperado = errores;
  else resultados.consola.push(...errores);
  await page.close();
}

for (const width of [320, 375, 390, 430, 768, 1024, 1366, 1920]) {
  const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 } });
  await abrir(page, width, width < 500 ? 844 : 900);
  resultados.responsive.push({ width, ...(await metricas(page)) });
  if (width === 1366) await captura(page, 'escritorio');
  if (width === 390) await captura(page, 'movil');
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGE ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('CONSOLE ' + m.text()); });
  await abrir(page, 1366, 900);

  const ids = await page.evaluate(() =>
    ['msg-grupo', 'msg-jornada', 'msg-estado', 'msg-texto', 'msg-preview'].filter(id => document.getElementById(id)));
  const pestanas = await page.locator('[data-tipo]').count();
  await page.locator('[data-tipo="apertura"]').click({ force: true });
  await page.waitForTimeout(120);
  await page.locator('#msg-jornada').selectOption('6');
  await page.waitForTimeout(180);
  const jornadaSinDatos = {
    chip: await page.locator('#m8-verificacion').innerText(),
    problemas: await page.locator('.m8-problemas li').count(),
    deshabilitados: await page.locator('.m8-acciones button:disabled').count()
  };
  await captura(page, 'jornada-sin-datos');

  await page.locator('#msg-jornada').selectOption('7');
  await page.waitForTimeout(180);
  const jornadaRestaurada = {
    chip: await page.locator('#m8-verificacion').innerText(),
    deshabilitados: await page.locator('.m8-acciones button:disabled').count()
  };

  await page.locator('#msg-grupo').selectOption('g2');
  await page.waitForTimeout(180);
  const grupoVacio = {
    chip: await page.locator('#m8-verificacion').innerText(),
    problemas: await page.locator('.m8-problemas li').count()
  };
  await captura(page, 'grupo-sin-datos');

  await page.locator('#msg-grupo').selectOption('g1');
  await page.waitForTimeout(180);
  await page.locator('[data-copiar]').click();
  await page.locator('[data-descargar]').click();
  await page.locator('[data-wa]').click();
  await page.waitForTimeout(120);
  const acciones = await page.evaluate(() => ({
    copiar: (window.__acciones || []).filter(a => a.tipo === 'copiar').length,
    descargar: (window.__acciones || []).filter(a => a.tipo === 'descargar').map(a => a.nombre),
    wa: (window.__wa || []).filter(u => u.startsWith('https://wa.me/')).length,
    copiado: !!document.querySelector('[data-copiar].copiado')
  }));
  await captura(page, 'copiado', false);

  await page.locator('[data-tipo="cierre"]').click();
  await page.waitForTimeout(200);
  const cierreSinCerrar = {
    chip: await page.locator('#m8-verificacion').innerText(),
    problemas: await page.locator('.m8-problemas li').count()
  };
  await captura(page, 'cierre-bloqueado');

  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
  resultados.foco = await page.evaluate(() => {
    const el = document.activeElement, s = getComputedStyle(el);
    return {
      etiqueta: el.tagName.toLowerCase(),
      id: el.id || null,
      clase: String(el.className || '').split(' ')[0],
      outlineColor: s.outlineColor,
      outlineWidth: s.outlineWidth
    };
  });
  resultados.interacciones = {
    ids,
    pestañas: pestanas,
    jornadaSinDatos,
    jornadaRestaurada,
    grupoVacio,
    acciones,
    cierreSinCerrar
  };
  resultados.consola.push(...errores);
  await page.close();
}

{
  const reduced = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await abrir(reduced, 1366, 900);
  resultados.movimientoReducido = await reduced.evaluate(() => ({
    tab: getComputedStyle(document.querySelector('.m8-tab')).transitionDuration
  }));
  await reduced.close();
}

await browser.close();
fs.writeFileSync(`${out}/verificacion-despues.json`, JSON.stringify(resultados, null, 2));
console.log(JSON.stringify({
  capturas: resultados.capturas.length,
  responsive: resultados.responsive.map(r => ({
    width: r.width, scrollWidth: r.scrollWidth, fuentes: r.fuentesMenores12.length,
    minControl: r.minControl, filasKpi: r.filasKpi,
    desbordes: r.desbordesInternos.length, traslapes: r.traslapes
  })),
  estados: resultados.estados,
  interacciones: resultados.interacciones,
  foco: resultados.foco,
  movimientoReducido: resultados.movimientoReducido,
  consola: resultados.consola,
  errorEsperado: resultados.errorEsperado.length
}, null, 2));
