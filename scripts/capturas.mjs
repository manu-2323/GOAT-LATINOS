/* Capturas reales de la aplicación para el informe y manual (1.2.0). */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'docs/capturas');
mkdirSync(OUT, { recursive: true });
const servidor = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const navegador = await chromium.launch({ args: ['--no-sandbox'] });
const pagina = await navegador.newPage({ viewport: { width: 1366, height: 768 } });
const manifest = [];

async function entrar() {
  await pagina.goto('http://127.0.0.1:4173/');
  await pagina.waitForSelector('#auth', { timeout: 30000 });
  await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('#auth [data-modo="admin"]')].find(x => x.offsetParent !== null);
    if (b) b.click();
  });
  await pagina.fill('#ad-correo', process.env.GL_ADMIN_EMAIL || '');
  await pagina.fill('#ad-clave', process.env.GL_ADMIN_PASS || '');
  await pagina.click('#form-admin button[type="submit"]');
  await pagina.waitForSelector('.ob-overlay', { timeout: 45000 }).catch(() => {});
  if (await pagina.locator('.ob-omitir').count()) await pagina.locator('.ob-omitir').first().click();
  await pagina.waitForTimeout(1200);
}

async function captura(ruta, nombre, ancho, alto) {
  await pagina.setViewportSize({ width: ancho, height: alto });
  await pagina.evaluate(h => { location.hash = h; }, ruta);
  const titulos = {
    'dashboard-admin': 'Centro de control', tabla: 'Tabla de Posiciones',
    calendario: 'Calendario y programación', fixture: 'Calendario de la liga',
    estadisticas: 'Estadísticas de la jornada', 'estadisticas-globales': 'Estadísticas Globales',
    eliminatorias: 'Eliminatorias', resultados: 'Carga de resultados',
    jornadas: 'Jornadas', administracion: 'Jugadores', mensajes: 'Generador de mensajes',
    auditoria: 'Auditoría', perfil: 'Perfil del jugador', notificaciones: 'Notificaciones'
  };
  await pagina.waitForFunction(([h, titulo]) => {
    const vista = document.getElementById('vista');
    const texto = vista ? vista.innerText.trim() : '';
    return texto.length > 10 && texto.toLowerCase().includes(titulo.toLowerCase());
  }, [ruta, titulos[ruta]], { timeout: 30000 }).catch(() => {});
  await pagina.waitForTimeout(350);
  const archivo = resolve(OUT, nombre + '.png');
  await pagina.screenshot({ path: archivo });
  manifest.push({ ruta, nombre, ancho, alto, archivo: 'capturas/' + nombre + '.png' });
  console.log('captura', nombre);
}

try {
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.goto('http://127.0.0.1:4173/');
  await pagina.waitForSelector('#auth', { timeout: 30000 });
  await pagina.screenshot({ path: resolve(OUT, '00-acceso-movil.png') });
  manifest.push({ ruta: 'acceso', nombre: '00-acceso-movil', ancho: 390, alto: 844, archivo: 'capturas/00-acceso-movil.png' });

  await entrar();
  const modulos = [
    ['dashboard-admin', '01-centro-control'],
    ['tabla', '02-tabla'],
    ['calendario', '03-calendario'],
    ['fixture', '04-fixture'],
    ['estadisticas', '05-estadisticas-jornada'],
    ['estadisticas-globales', '06-estadisticas-globales'],
    ['eliminatorias', '07-eliminatorias'],
    ['resultados', '08-resultados-ia'],
    ['jornadas', '09-jornadas'],
    ['administracion', '10-administracion'],
    ['mensajes', '11-mensajes'],
    ['auditoria', '12-auditoria'],
    ['perfil', '13-perfil'],
    ['notificaciones', '14-notificaciones']
  ];
  for (const [ruta, nombre] of modulos) await captura(ruta, nombre, 1366, 768);

  for (const [ancho, alto, etiqueta] of [
    [360, 800, '360x800'], [390, 844, '390x844'], [412, 915, '412x915'],
    [768, 1024, '768x1024'], [1920, 1080, '1920x1080']
  ]) {
    await captura('tabla', '15-tabla-' + etiqueta, ancho, alto);
  }
  writeFileSync(resolve(OUT, 'manifiesto.json'), JSON.stringify(manifest, null, 2));
  console.log('capturas:', manifest.length);
} catch (e) {
  console.error('Error al capturar:', e.message);
  process.exitCode = 1;
} finally {
  await navegador.close();
  servidor.kill();
}
