import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';

const base = 'file:///C:/Users/manue/AppData/Local/Temp/opencode/GOAT-LATINOS-deploy';
const out = 'docs/capturas-fase-3.7';
fs.mkdirSync(out, { recursive: true });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
});

const resultados = {
  capturas: [],
  responsive: [],
  filtros: null,
  formulario: null,
  ia: null,
  estados: null,
  navegacion: null,
  foco: null,
  movimientoReducido: null,
  consola: [],
  errorEsperado: []
};

async function abrir(page, width, height, estado = 'datos') {
  await page.route(/^https?:\/\//, route => route.abort());
  await page.setViewportSize({ width, height });
  await page.goto(base + '/mock-resultados-3.7.html?estado=' + estado, { waitUntil: 'load' });
  if (estado === 'carga') {
    await page.waitForSelector('#vista .skeleton-wrap', { timeout: 20000 });
    return;
  }
  await page.waitForSelector('#vista .r7-pantalla, #vista .estado-vacio', { timeout: 20000 });
  await page.waitForTimeout(200);
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
    const controles = [...document.querySelectorAll('#vista button:not(:disabled), #vista a[href], #vista input:not(:disabled), #vista select:not(:disabled)')]
      .filter(el => el.getClientRects().length > 0);
    const alturas = controles.map(el => Math.round(el.getBoundingClientRect().height)).filter(n => n > 0);
    const kpis = [...document.querySelectorAll('#vista .r7-kpi')];
    const filasKpi = kpis.length ? new Set(kpis.map(el => Math.round(el.getBoundingClientRect().top))).size : 0;
    const desbordesInternos = visibles.filter(el => {
      const s = getComputedStyle(el);
      return el.scrollWidth > el.clientWidth + 1 &&
        s.textOverflow !== 'ellipsis' && s.overflowX !== 'hidden' &&
        ['DIV', 'LI', 'SPAN', 'STRONG', 'P', 'H1', 'H2', 'H3', 'LABEL', 'ARTICLE', 'BUTTON'].includes(el.tagName);
    }).slice(0, 8).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]);
    const contenedor = document.querySelector('#vista .r7-pantalla');
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

for (const [estado, nombre] of [
  ['datos', 'con-datos'], ['vacio', 'vacio'], ['carga', 'cargando'],
  ['error', 'error'], ['cerrada', 'cerrada']
]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGE ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('CONSOLE ' + m.text()); });
  await abrir(page, 1366, 900, estado);
  await captura(page, nombre, estado !== 'carga');
  resultados.estados = resultados.estados || {};
  resultados.estados[nombre] = await page.evaluate(() => ({
    estado: document.querySelector('#mock-estado')?.textContent.trim(),
    tieneSkeleton: !!document.querySelector('#vista .skeleton-wrap'),
    tieneVacio: !!document.querySelector('#vista .estado-vacio:not(.error)'),
    esError: !!document.querySelector('#vista .estado-vacio.error'),
    pantalla: !!document.querySelector('#vista .r7-pantalla'),
    partidos: document.querySelectorAll('#vista .r7-partido:not([hidden])').length,
    guardarDeshabilitado: document.querySelector('#vista #guardar')?.disabled || false
  }));
  if (estado === 'error') resultados.errorEsperado = errores;
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

  const totalInicial = await page.locator('#lista-pendientes .r7-partido:not([hidden])').count();
  await page.locator('#r7-buscar').fill('chicharito');
  await page.waitForTimeout(80);
  const trasBuscar = await page.locator('#lista-pendientes .r7-partido:not([hidden])').count();
  await captura(page, 'busqueda');

  await page.locator('#r7-buscar').fill('');
  await page.locator('#r7-grupo').selectOption('g1');
  await page.waitForTimeout(80);
  const grupoG1 = await page.locator('#lista-pendientes .r7-partido:not([hidden])').count();
  await captura(page, 'filtro-grupo');

  await page.locator('#r7-buscar').fill('neymar');
  await page.waitForTimeout(80);
  const combinados = await page.locator('#lista-pendientes .r7-partido:not([hidden])').count();

  await page.locator('#r7-buscar').fill('no-existe');
  await page.waitForTimeout(80);
  const sinResultados = await page.locator('#r7-sin-resultados:not([hidden])').count();
  await captura(page, 'sin-resultados');
  await page.locator('#r7-sin-resultados [data-r7-limpiar]').click();
  const trasLimpiar = await page.locator('#lista-pendientes .r7-partido:not([hidden])').count();
  resultados.filtros = {
    totalInicial, trasBuscar, grupoG1, combinados, sinResultados, trasLimpiar,
    contador: await page.locator('#r7-contador').innerText()
  };

  await page.locator('#lista-pendientes [data-partido]').first().click();
  await page.waitForSelector('#g-local');
  const idsManuales = await page.evaluate(() =>
    ['g-local', 'g-visita', 'estado', 'guardar', 'dropzone-manual', 'archivo-manual', 'tiros_local', 'posesion_local']
      .filter(id => document.getElementById(id)));
  await captura(page, 'ingreso-manual');
  await page.locator('.r7-detalles summary').click();
  await page.waitForTimeout(80);

  await page.locator('#estado').selectOption('walkover_local');
  const marcadorWalkover = {
    local: await page.locator('#g-local').inputValue(),
    visita: await page.locator('#g-visita').inputValue()
  };

  await page.locator('#estado').selectOption('jugado');
  await page.locator('#posesion_local').fill('70');
  await page.locator('#posesion_visitante').fill('20');
  await page.locator('#guardar').click();
  await page.waitForTimeout(120);
  const avisoValidacion = await page.evaluate(() => {
    const t = window.__toasts.slice(-1)[0];
    return t ? t.texto : '';
  });

  await page.locator('#posesion_local').fill('60');
  await page.locator('#posesion_visitante').fill('40');
  await page.locator('#archivo-manual').setInputFiles({
    name: 'captura.png', mimeType: 'image/png', buffer: PNG
  });
  await page.waitForSelector('#dropzone-manual');
  await page.locator('#guardar').click();
  await page.waitForFunction(() => window.__rpc.length > 0, { timeout: 10000 });
  const rpc = await page.evaluate(() => window.__rpc[0]);
  resultados.formulario = {
    idsManuales,
    marcadorWalkover,
    avisoValidacion,
    guardo: rpc && rpc.nombre === 'gl_guardar_resultado',
    golesEnviados: rpc ? [rpc.params.p_goles_local, rpc.params.p_goles_visitante] : [],
    auditoria: await page.evaluate(() => window.__audit.length),
    toastExito: await page.evaluate(() => {
      const t = window.__toasts.slice(-1)[0];
      return t ? t.texto : '';
    })
  };
  await captura(page, 'guardado-simulado', false);

  await page.locator('[data-modo="ia"]').click();
  await page.waitForSelector('#dropzone');
  await captura(page, 'ia-captura');
  const analizarDeshabilitado = await page.locator('#analizar').isDisabled();
  await page.locator('#archivo').setInputFiles({
    name: 'captura.png', mimeType: 'image/png', buffer: PNG
  });
  await page.waitForSelector('#preview');
  const analizarHabilitado = !(await page.locator('#analizar').isDisabled());
  await page.locator('#analizar').click();
  await page.waitForSelector('#re-hacer', { timeout: 10000 });
  resultados.ia = {
    analizarDeshabilitado,
    analizarHabilitado,
    golesDetectados: [
      await page.locator('#g-local').inputValue(),
      await page.locator('#g-visita').inputValue()
    ],
    ids: await page.evaluate(() =>
      ['g-local', 'g-visita', 're-hacer', 'guardar', 'tiros_local', 'posesion_local'].filter(id => document.getElementById(id)))
  };
  await captura(page, 'ia-datos-detectados');

  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
  resultados.foco = await page.evaluate(() => {
    const el = document.activeElement, s = getComputedStyle(el);
    return {
      etiqueta: el.tagName.toLowerCase(),
      clase: String(el.className || '').split(' ')[0],
      outlineColor: s.outlineColor,
      outlineWidth: s.outlineWidth
    };
  });
  resultados.consola.push(...errores);
  await page.close();
}

{
  const reduced = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await abrir(reduced, 1366, 900);
  resultados.movimientoReducido = await reduced.evaluate(() => ({
    barra: getComputedStyle(document.querySelector('.r7-kpi-bar>span')).transitionDuration,
    boton: getComputedStyle(document.querySelector('.r7-tab')).transitionDuration
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
  filtros: resultados.filtros,
  formulario: resultados.formulario,
  ia: resultados.ia,
  estados: resultados.estados,
  foco: resultados.foco,
  movimientoReducido: resultados.movimientoReducido,
  consola: resultados.consola,
  errorEsperado: resultados.errorEsperado.length
}, null, 2));
