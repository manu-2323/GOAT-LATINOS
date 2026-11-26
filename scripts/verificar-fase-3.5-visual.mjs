import fs from 'node:fs';
import path from 'node:path';
import {
  ANCHOS, RAIZ, bloquearExternos, iniciarServidorVisual, lanzarNavegadorVisual
} from './lib-verificacion-visual.mjs';

const modo = process.argv[2] === 'despues' ? 'despues' : 'antes';
const servidor = await iniciarServidorVisual();
const base = servidor.url;
const out = path.resolve(RAIZ, process.env.GL_CAPTURAS_DIR || '', 'docs/capturas-fase-3.5');
fs.mkdirSync(out, { recursive: true });

const browser = await lanzarNavegadorVisual();

async function abrir(page, width, height, estado = 'datos') {
  await bloquearExternos(page);
  await page.setViewportSize({ width, height });
  await page.goto(base + '/mock-jugadores-3.5.html?estado=' + estado, { waitUntil: 'load' });
  if (estado === 'carga') {
    await page.waitForSelector('#vista .skeleton-wrap', { timeout: 20000 });
    return;
  }
  await page.waitForSelector('#vista .j5-pantalla, #vista .seccion-head, #vista .estado-vacio', { timeout: 20000 });
  await page.waitForTimeout(180);
}

const resultados = {
  modo,
  capturas: [],
  responsive: [],
  filtros: null,
  formularios: null,
  navegacion: null,
  estados: null,
  foco: null,
  movimientoReducido: null
};

async function captura(page, nombre, fullPage = true) {
  const ruta = `${out}/${modo}-${nombre}.png`;
  await page.screenshot({ path: ruta, fullPage });
  resultados.capturas.push({ nombre: `${modo}-${nombre}`, ruta });
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
    const tabla = document.querySelector('.j5-tabla-wrap');
    const kpis = [...document.querySelectorAll('#vista .j5-kpi')];
    const filasKpi = kpis.length ? new Set(kpis.map(el => Math.round(el.getBoundingClientRect().top))).size : 0;
    const desbordesInternos = visibles.filter(el =>
      el.scrollWidth > el.clientWidth + 1 &&
      ['DIV', 'LI', 'SPAN', 'STRONG', 'P', 'H1', 'H2', 'H3', 'LABEL'].includes(el.tagName)
    ).slice(0, 8).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]);
    const contenedor = document.querySelector('#vista .j5-pantalla');
    const bloques = [...(contenedor
      ? contenedor.children
      : document.querySelectorAll('#vista > .seccion-head, #vista > .tabs-admin, #vista > #contenido-admin'))]
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
      tablaScroll: tabla ? { clientWidth: tabla.clientWidth, scrollWidth: tabla.scrollWidth } : null,
      desbordesInternos,
      traslapes
    };
  });
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

for (const [estado, nombre] of [['datos', 'con-datos'], ['vacio', 'vacio'], ['carga', 'cargando'], ['error', 'error']]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await abrir(page, 1366, 900, estado);
  await captura(page, nombre, estado !== 'carga');
  const info = await page.evaluate(() => ({
    estado: document.querySelector('#mock-estado')?.textContent.trim(),
    tieneSkeleton: !!document.querySelector('#vista .skeleton-wrap'),
    tieneEstadoVacio: !!document.querySelector('#vista .estado-vacio, #vista .j5-fila-vacia:not([hidden]), #vista .j5-fila-sin-resultados:not([hidden])'),
    esError: !!document.querySelector('#vista .estado-vacio.error')
  }));
  resultados.estados = resultados.estados || {};
  resultados.estados[nombre] = info;
  await page.close();
}

for (const width of ANCHOS) {
  const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 } });
  await abrir(page, width, width < 500 ? 844 : 900);
  resultados.responsive.push({ width, ...(await metricas(page)) });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await abrir(page, 1366, 900);

  if (modo === 'despues') {
    const totalInicial = await page.locator('#j5-body tr.j5-fila:not([hidden])').count();
    await page.locator('#j5-buscar').fill('CR7');
    await page.waitForTimeout(80);
    const trasBuscar = await page.locator('#j5-body tr.j5-fila:not([hidden])').count();
    await captura(page, 'busqueda');
    await page.locator('[data-j5-limpiar]').first().click();
    const trasLimpiar = await page.locator('#j5-body tr.j5-fila:not([hidden])').count();

    await page.locator('#j5-grupo').selectOption('g2');
    await page.locator('#j5-estado').selectOption('activo');
    await page.waitForTimeout(80);
    const combinados = await page.locator('#j5-body tr.j5-fila:not([hidden])').count();
    await captura(page, 'filtros-combinados');
    await page.locator('#j5-grupo').selectOption('g1');
    await page.locator('#j5-estado').selectOption('suspendido');
    await page.waitForTimeout(80);
    const sinResultados = await page.locator('#j5-body tr.j5-fila-sin-resultados:not([hidden])').count();
    await captura(page, 'sin-resultados');
    await page.locator('[data-j5-limpiar]').last().click();
    const trasLimpiarFinal = await page.locator('#j5-body tr.j5-fila:not([hidden])').count();
    resultados.filtros = {
      totalInicial, trasBuscar, trasLimpiar, combinados, sinResultados,
      trasLimpiarFinal,
      contador: await page.locator('#j5-contador').innerText()
    };

    await page.locator('[data-agregar]').first().click();
    await page.waitForSelector('#vista .modal, #modal-root .modal');
    const idsRegistro = await page.evaluate(() => ['ag-nombre', 'ag-pais', 'ag-zona', 'ag-tel', 'ag-grupo', 'ag-email', 'ag-clave', 'ag-crear']
      .filter(id => document.getElementById(id)));
    await captura(page, 'formulario-registro', false);
    await page.locator('#ag-crear').click();
    await page.waitForTimeout(80);
    const erroresValidacion = await page.locator('[data-err-for]:not([style*="display: none"])').count();
    await page.locator('.modal [data-cerrar]').first().click();

    await page.locator('.acciones-escritorio [data-accion="editar-j1"]').click();
    await page.waitForSelector('#ed-nombre');
    const idsEdicion = await page.evaluate(() => ['ed-nombre', 'ed-pais', 'ed-zona', 'ed-tel', 'ed-guardar']
      .filter(id => document.getElementById(id)));
    await captura(page, 'formulario-edicion', false);
    await page.locator('#ed-nombre').fill('EDITADO_TEST');
    await page.locator('#ed-guardar').click();
    await page.waitForFunction(() => !document.querySelector('#ed-nombre'), null, { timeout: 10000 });
    await page.waitForSelector('#vista .j5-pantalla');
    const guardoEdicion = await page.locator('#vista tr[data-j5-nombre="EDITADO_TEST"]').count() === 1;
    resultados.formularios = {
      idsRegistro, idsEdicion, erroresValidacion, guardoEdicion,
      modalesCerrados: await page.locator('.modal').count() === 0
    };

    const acciones = await page.evaluate(() => ({
      dataAgregar: document.querySelectorAll('#vista [data-agregar]').length,
      dataAccion: document.querySelectorAll('#vista [data-accion]').length,
      menuMovil: document.querySelectorAll('#vista .btn-menu-acciones').length,
      pestañas: [...document.querySelectorAll('#vista [data-tab]')].map(b => b.dataset.tab)
    }));
    const primeraPestana = page.locator('#vista [data-tab="jugadores"]');
    await primeraPestana.click();
    await page.waitForTimeout(80);
    resultados.navegacion = {
      ...acciones,
      jugadoresActivo: await page.locator('#vista [data-tab="jugadores"].activo').count() === 1,
      sigueJ5: await page.locator('#vista .j5-pantalla').count() === 1
    };
  } else {
    resultados.filtros = { disponible: false, motivo: 'La versión previa no tenía filtros en Jugadores.' };
    resultados.formularios = { disponible: false, motivo: 'Solo se capturó el estado previo.' };
    resultados.navegacion = { disponible: false, motivo: 'Solo se capturó el estado previo.' };
  }

  await page.keyboard.press('Tab');
  await page.waitForTimeout(250); // dejar terminar la transición de foco
  resultados.foco = await page.evaluate(() => {
    const el = document.activeElement, s = getComputedStyle(el);
    return {
      etiqueta: el.tagName.toLowerCase(),
      clase: String(el.className || '').split(' ')[0],
      outlineColor: s.outlineColor,
      outlineWidth: s.outlineWidth
    };
  });
  resultados.consola = errores;
  await page.close();
}

if (modo === 'despues') {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await abrir(page, 390, 844);
  await page.locator('#vista .btn-menu-acciones').first().click();
  const abrioSheet = await page.locator('.menu-bottom-sheet').count() === 1;
  await captura(page, 'menu-movil', false);
  await page.keyboard.press('Escape');
  const cerroSheet = await page.locator('.menu-bottom-sheet').count() === 0;
  resultados.navegacion.menuMovil = { abrioSheet, cerroSheet, errores };
  await page.locator('[data-agregar]').first().click();
  await page.waitForSelector('.modal-j5-forma');
  await captura(page, 'formulario-registro-movil', false);
  resultados.formularios.modalMovil = await page.evaluate(() => {
    const modal = document.querySelector('.modal-j5-forma').getBoundingClientRect();
    const cuerpo = document.querySelector('.modal-j5-forma .modal-cuerpo');
    return {
      dentroDelViewport: modal.left >= 0 && modal.right <= window.innerWidth + 1,
      ancho: Math.round(modal.width),
      cuerpoDesplazable: cuerpo.scrollHeight > cuerpo.clientHeight
    };
  });
  await page.close();

  const reduced = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await abrir(reduced, 1366, 900);
  resultados.movimientoReducido = await reduced.evaluate(() => {
    const el = document.querySelector('.j5-kpi') || document.body;
    return { transicion: getComputedStyle(el).transitionDuration, animacion: getComputedStyle(el).animationDuration };
  });
  await reduced.close();
}

await browser.close();
await servidor.cerrar();
fs.writeFileSync(`${out}/verificacion-${modo}.json`, JSON.stringify(resultados, null, 2));
console.log(JSON.stringify({
  modo,
  capturas: resultados.capturas.length,
  responsive: resultados.responsive.map(r => ({
    width: r.width, scrollWidth: r.scrollWidth, fuentes: r.fuentesMenores12.length,
    minControl: r.minControl, filasKpi: r.filasKpi, tablaScroll: r.tablaScroll,
    desbordes: r.desbordesInternos.length, traslapes: r.traslapes
  })),
  filtros: resultados.filtros,
  formularios: resultados.formularios,
  navegacion: resultados.navegacion,
  estados: resultados.estados,
  foco: resultados.foco,
  movimientoReducido: resultados.movimientoReducido,
  consola: resultados.consola
}, null, 2));
