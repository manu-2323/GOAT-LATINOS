import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = 'file:///C:/Users/manue/AppData/Local/Temp/opencode/GOAT-LATINOS-deploy';
const out = 'docs/capturas-fase-3.6';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
});

const resultados = {
  capturas: [],
  responsive: [],
  filtros: null,
  relaciones: null,
  navegacion: null,
  estados: null,
  foco: null,
  movimientoReducido: null,
  consola: []
};

async function abrir(page, width, height, estado = 'datos') {
  await page.route(/^https?:\/\//, route => route.abort());
  await page.setViewportSize({ width, height });
  await page.goto(base + '/mock-equipos-3.6.html?estado=' + estado, { waitUntil: 'load' });
  if (estado === 'carga') {
    await page.waitForSelector('#vista .skeleton-wrap', { timeout: 20000 });
    return;
  }
  await page.waitForSelector('#vista .e6-pantalla, #vista .estado-vacio', { timeout: 20000 });
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
    const controles = [...document.querySelectorAll('#vista button:not(:disabled), #vista a[href], #vista [role="button"]')]
      .filter(el => el.getClientRects().length > 0);
    const alturas = controles.map(el => Math.round(el.getBoundingClientRect().height)).filter(n => n > 0);
    const kpis = [...document.querySelectorAll('#vista .e6-kpi')];
    const filasKpi = kpis.length ? new Set(kpis.map(el => Math.round(el.getBoundingClientRect().top))).size : 0;
    const desbordesInternos = visibles.filter(el =>
      el.scrollWidth > el.clientWidth + 1 &&
      ['DIV', 'LI', 'SPAN', 'STRONG', 'P', 'H1', 'H2', 'H3', 'LABEL', 'ARTICLE'].includes(el.tagName)
    ).slice(0, 8).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]);
    const contenedor = document.querySelector('#vista .e6-pantalla');
    const bloques = [...(contenedor
      ? contenedor.children
      : document.querySelectorAll('#vista > .estado-vacio'))]
      .filter(el => el.getClientRects().length > 0).map(el => el.getBoundingClientRect());
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

for (const [estado, nombre] of [['datos', 'con-datos'], ['vacio', 'vacio'], ['carga', 'cargando'], ['error', 'error']]) {
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
    tieneEstadoVacio: !!document.querySelector('#vista .e6-estado-vacio:not([hidden])'),
    esError: !!document.querySelector('#vista .estado-vacio.error'),
    tarjetas: document.querySelectorAll('#vista .e6-card:not([hidden])').length
  }));
  if (estado === 'error') {
    resultados.errorEsperado = errores;
  } else {
    resultados.consola.push(...errores);
  }
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

  const totalInicial = await page.locator('#e6-lista .e6-card:not([hidden])').count();
  await page.locator('#e6-buscar').fill('grupo b');
  await page.waitForTimeout(80);
  const trasBuscar = await page.locator('#e6-lista .e6-card:not([hidden])').count();
  await captura(page, 'busqueda');

  await page.locator('#e6-buscar').fill('');
  await page.locator('#e6-cobertura').selectOption('completo');
  await page.waitForTimeout(80);
  const completos = await page.locator('#e6-lista .e6-card:not([hidden])').count();

  await page.locator('#e6-cobertura').selectOption('incompleto');
  await page.waitForTimeout(80);
  const incompletos = await page.locator('#e6-lista .e6-card:not([hidden])').count();
  await captura(page, 'filtros-combinados');

  await page.locator('#e6-cobertura').selectOption('sin-jugadores');
  await page.waitForTimeout(80);
  const sinResultados = await page.locator('#e6-sin-resultados:not([hidden])').count();
  await captura(page, 'sin-resultados');
  await page.locator('#e6-sin-resultados [data-e6-limpiar]').click();
  const trasLimpiar = await page.locator('#e6-lista .e6-card:not([hidden])').count();
  resultados.filtros = {
    totalInicial, trasBuscar, completos, incompletos, sinResultados, trasLimpiar,
    contador: await page.locator('#e6-contador').innerText()
  };

  await page.locator('[data-e6-ver]').first().click();
  const panelAbierto = await page.locator('.e6-jugadores:not([hidden])').count();
  const miembrosVisibles = await page.locator('.e6-jugadores:not([hidden]) .e6-miembro').count();
  await captura(page, 'jugadores-asociados');
  resultados.relaciones = {
    tarjetas: await page.locator('.e6-card').count(),
    miembrosVisibles,
    panelAbierto,
    botonesEditar: await page.locator('.e6-miembro [data-accion^="editar-"]').count(),
    menusMovil: await page.locator('.e6-miembro .btn-menu-acciones').count(),
    totalAsignadosKpi: await page.locator('.e6-kpi').nth(1).locator('.e6-kpi-valor').innerText()
  };

  await page.locator('.e6-miembro [data-accion^="editar-"]').first().click();
  await page.waitForSelector('#ed-nombre');
  await captura(page, 'formulario-edicion', false);
  resultados.relaciones.idsEdicion = await page.evaluate(() =>
    ['ed-nombre', 'ed-pais', 'ed-zona', 'ed-tel', 'ed-guardar'].filter(id => document.getElementById(id)));
  await page.locator('.modal [data-cerrar]').first().click();

  await page.locator('.e6-card-acciones [data-tab-ir="jugadores"]').first().click();
  await page.waitForTimeout(120);
  resultados.navegacion = {
    abrioJugadores: await page.locator('#vista .j5-pantalla').count() === 1,
    equiposOculto: await page.locator('#vista .e6-pantalla').count() === 0
  };
  await captura(page, 'destino-plantel', false);
  await page.locator('#vista [data-tab="equipos"]').click();
  await page.waitForSelector('#vista .e6-pantalla');

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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGE ' + e.message));
  await abrir(page, 390, 844);
  await page.locator('[data-e6-ver]').first().click();
  await page.locator('.e6-miembro .btn-menu-acciones').first().click();
  const abrioSheet = await page.locator('.menu-bottom-sheet').count() === 1;
  await captura(page, 'menu-movil', false);
  await page.keyboard.press('Escape');
  const cerroSheet = await page.locator('.menu-bottom-sheet').count() === 0;
  resultados.navegacion.menuMovil = { abrioSheet, cerroSheet, errores };
  await page.close();

  const reduced = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await abrir(reduced, 1366, 900);
  resultados.movimientoReducido = await reduced.evaluate(() => ({
    transicion: getComputedStyle(document.querySelector('.e6-progreso span')).transitionDuration,
    animacion: getComputedStyle(document.querySelector('.e6-card')).animationDuration
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
  relaciones: resultados.relaciones,
  navegacion: resultados.navegacion,
  estados: resultados.estados,
  foco: resultados.foco,
  movimientoReducido: resultados.movimientoReducido,
  consola: resultados.consola
}, null, 2));
