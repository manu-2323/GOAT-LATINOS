import fs from 'node:fs';
import path from 'node:path';
import {
  ANCHOS, RAIZ, bloquearExternos, iniciarServidorVisual, lanzarNavegadorVisual
} from './lib-verificacion-visual.mjs';

const modo = process.argv[2] === 'despues' ? 'despues' : 'antes';
const servidor = await iniciarServidorVisual();
const base = servidor.url;
const out = path.resolve(RAIZ, process.env.GL_CAPTURAS_DIR || '', 'docs/capturas-fase-3.4');
fs.mkdirSync(out, { recursive: true });

const browser = await lanzarNavegadorVisual();

async function abrir(page, width, height, estado = 'datos') {
  await bloquearExternos(page);
  await page.setViewportSize({ width, height });
  await page.goto(base + '/mock-dashboard-3.4.html?estado=' + estado, { waitUntil: 'load' });
  if (estado === 'carga') {
    await page.waitForSelector('#vista .skeleton-wrap', { timeout: 20000 });
    await page.waitForTimeout(120);
    return;
  }
  await page.waitForSelector('#vista .da-pantalla[data-dashboard], #vista .estado-vacio', { timeout: 20000 });
  await page.waitForTimeout(350);
}

const resultados = {
  modo,
  capturas: [],
  responsive: [],
  interacciones: null,
  estados: null,
  foco: null
};

async function captura(page, nombre, fullPage = true) {
  const ruta = `${out}/${modo}-${nombre}.png`;
  await page.screenshot({ path: ruta, fullPage });
  resultados.capturas.push({ nombre: `${modo}-${nombre}`, ruta });
}

{
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await abrir(page, 1366, 900);
  await captura(page, 'escritorio');
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await abrir(page, 390, 844);
  await captura(page, 'movil');
  await page.close();
}

for (const [estado, nombre] of [['datos','con-datos'], ['vacio','vacio'], ['carga','cargando'], ['error','error']]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await abrir(page, 1366, 900, estado);
  await captura(page, nombre, estado !== 'carga');
  const info = await page.evaluate(() => ({
    estado: document.querySelector('#mock-estado')?.textContent.trim(),
    tieneSkeleton: !!document.querySelector('.skeleton-wrap'),
    tieneEstadoVacio: !!document.querySelector('.estado-vacio'),
    esError: !!document.querySelector('.estado-vacio.error')
  }));
  resultados.estados = resultados.estados || {};
  resultados.estados[nombre] = info;
  await page.close();
}

for (const width of ANCHOS) {
  const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 } });
  await abrir(page, width, width < 500 ? 844 : 900);
  const m = await page.evaluate(() => {
    const visibles = [...document.querySelectorAll('#vista *')].filter(el => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 &&
        el.getClientRects().length > 0 && el.textContent.trim();
    });
    const pequenos = visibles.filter(el => parseFloat(getComputedStyle(el).fontSize) < 12)
      .slice(0, 6).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] + ':' + getComputedStyle(el).fontSize);
    const controles = [...document.querySelectorAll('#vista button:not(:disabled), #vista a[href], #vista [role="button"]')]
      .filter(el => el.getClientRects().length > 0);
    const alturas = controles.map(el => Math.round(el.getBoundingClientRect().height)).filter(n => n > 0);
    const kpis = [...document.querySelectorAll('#vista [data-kpi], #vista .da-met-card')];
    const columnas = kpis.length ? new Set(kpis.map(el => Math.round(el.getBoundingClientRect().top))).size : 0;
    const anchoMaximo = Math.max(0, ...[...document.querySelectorAll('#vista *')]
      .filter(el => el.getClientRects().length > 0)
      .map(el => Math.round(el.getBoundingClientRect().right)));
    const desbordesInternos = visibles.filter(el =>
      el.scrollWidth > el.clientWidth + 1 &&
      ['DIV','LI','SPAN','STRONG','P','H1','H2'].includes(el.tagName)
    ).slice(0, 6).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]);
    const bloques = [...document.querySelectorAll('#vista .da-pantalla > *')]
      .filter(el => el.getClientRects().length > 0).map(el => el.getBoundingClientRect());
    let traslapes = 0;
    for (let i = 0; i < bloques.length; i++) for (let j = i + 1; j < bloques.length; j++) {
      const a = bloques[i], b = bloques[j];
      if (Math.min(a.right,b.right) - Math.max(a.left,b.left) > 2 &&
          Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top) > 2) traslapes++;
    }
    return {
      ancho: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      fuentesMenores12: pequenos,
      minControl: alturas.length ? Math.min(...alturas) : null,
      filasKpi: columnas,
      anchoMaximo,
      solapaBarra: anchoMaximo > window.innerWidth + 1,
      desbordesInternos,
      traslapes
    };
  });
  resultados.responsive.push({ width, ...m });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await abrir(page, 1366, 900);

  await page.locator('#da-refrescar').click();
  const mostroSkeleton = await page.locator('#vista .skeleton-wrap').count() > 0;
  await page.waitForSelector('#vista .da-pantalla[data-dashboard]', { timeout: 20000 });
  const refrescoOK = await page.locator('#da-refrescar').count() === 1;

  await page.locator('#da-guia').click();
  const guiaClic = true;

  const enlaces = await page.evaluate(() => {
    const lista = [...document.querySelectorAll('#vista [data-ir]')];
    const destinos = [...new Set(lista.map(el => el.dataset.ir))];
    if (!lista.length) return { total: 0, destinos: [], primerDestino: null };
    const primero = lista[0];
    const destino = primero.dataset.ir;
    primero.click();
    return { total: lista.length, destinos, primerDestino: destino };
  });
  await page.waitForTimeout(120);
  const navego = await page.evaluate(() => document.body.dataset.nav || location.hash.replace('#',''));
  const acciones = await page.evaluate(() => ({
    guia: !!document.querySelector('#da-guia'),
    refrescar: !!document.querySelector('#da-refrescar')
  }));
  resultados.interacciones = {
    ...enlaces, navego, acciones, refrescoOK, mostroSkeleton, guiaClic, erroresConsola: errores
  };

  await page.keyboard.press('Tab');
  resultados.foco = await page.evaluate(() => {
    const el = document.activeElement, s = getComputedStyle(el);
    return { etiqueta: el.tagName.toLowerCase(), clase: String(el.className || '').split(' ')[0], outlineColor: s.outlineColor, outlineWidth: s.outlineWidth };
  });
  await page.close();
}

await browser.close();
await servidor.cerrar();
fs.writeFileSync(`${out}/verificacion-${modo}.json`, JSON.stringify(resultados, null, 2));
console.log(JSON.stringify({
  modo,
  capturas: resultados.capturas.length,
  responsive: resultados.responsive.map(r => ({ width: r.width, scrollWidth: r.scrollWidth, fuentes: r.fuentesMenores12.length, minControl: r.minControl, filasKpi: r.filasKpi })),
  interacciones: resultados.interacciones,
  estados: resultados.estados,
  foco: resultados.foco
}, null, 2));
