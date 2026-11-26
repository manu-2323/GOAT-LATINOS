import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const EMAIL = process.env.GL_ADMIN_EMAIL || '';
const CLAVE = process.env.GL_ADMIN_PASS || '';
const RUTAS = ['inicio', 'tabla', 'calendario', 'fixture', 'estadisticas', 'estadisticas-globales',
  'eliminatorias', 'resultados', 'jornadas', 'administracion', 'mensajes', 'auditoria',
  'dashboard-admin', 'perfil', 'notificaciones'];

async function entrar(page) {
  await page.goto('/');
  await page.waitForSelector('#auth', { timeout: 30000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#auth [data-modo="admin"]')].find(x => x.offsetParent !== null);
    if (b) b.click();
  });
  await page.fill('#ad-correo', EMAIL);
  await page.fill('#ad-clave', CLAVE);
  await page.click('#form-admin button[type="submit"]');
  await page.waitForSelector('.ob-overlay', { timeout: 45000 }).catch(() => {});
  const omitir = page.locator('.ob-omitir');
  if (await omitir.count()) await omitir.first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
}

test('navegación y estados: sin pantallas en blanco', async ({ page }) => {
  test.skip(!EMAIL || !CLAVE, 'Faltan credenciales de administrador en el entorno');
  await entrar(page);
  await page.waitForFunction(() => location.hash === '#inicio' &&
    !!document.querySelector('#vista .ini-pantalla'), null, { timeout: 30000 });
  const titulos = {
    inicio: 'Panel principal', tabla: 'Tabla de Posiciones', calendario: 'Calendario y programación',
    fixture: 'Calendario de la liga', estadisticas: 'Estadísticas de la jornada',
    'estadisticas-globales': 'Estadísticas Globales', eliminatorias: 'Eliminatorias',
    resultados: 'Carga de resultados', jornadas: 'Jornadas', administracion: 'Jugadores',
    mensajes: 'Generador de mensajes', auditoria: 'Auditoría',
    'dashboard-admin': 'Centro de control', perfil: 'Perfil del jugador',
    notificaciones: 'Notificaciones'
  };
  for (const ruta of RUTAS) {
    await page.evaluate(h => { location.hash = h; }, ruta);
    await page.waitForFunction(([h, titulo]) => {
      const vista = document.getElementById('vista');
      const texto = vista ? vista.innerText.trim() : '';
      return texto.length > 10 && texto.toLowerCase().includes(titulo.toLowerCase());
    }, [ruta, titulos[ruta]], { timeout: 30000 });
  }
});

test('accesibilidad: sin violaciones críticas', async ({ page }) => {
  test.skip(!EMAIL || !CLAVE, 'Faltan credenciales de administrador en el entorno');
  await entrar(page);
  for (const ruta of ['inicio', 'tabla', 'resultados', 'administracion', 'perfil']) {
    await page.evaluate(h => { location.hash = h; }, ruta);
    await page.waitForFunction(() => !document.querySelector('#vista [aria-busy="true"]'), null, { timeout: 30000 });
    await page.waitForTimeout(900);
    const resultados = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const graves = resultados.violations.filter(v => ['critical', 'serious'].includes(v.impact));
    expect(graves.map(v => v.id), `Violaciones en ${ruta}`).toEqual([]);
  }
});

test('WhatsApp y teléfono: formato nacional y enlace sin +', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.GL && !!window.GL.tel, null, { timeout: 30000 });
  const resultado = await page.evaluate(() => ({
    e164: window.GL && window.GL.tel.e164('8108-5555', 'NI'),
    nacional: window.GL && window.GL.tel.nacional('+50581085555', 'NI'),
    enlace: window.GL && window.GL.linkWhatsapp({
      telefono_e164: '+50581085555', pais: 'NI', nombre_usuario: 'Prueba'
    })
  }));
  expect(resultado.e164).toBe('+50581085555');
  expect(resultado.nacional).toBe('8108-5555');
  expect(resultado.enlace).toContain('https://wa.me/50581085555');
});
