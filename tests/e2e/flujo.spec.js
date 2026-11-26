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
    fixture: 'Cuadro de partidos', estadisticas: 'Estadísticas de la jornada',
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

test('navegación visible: “Cuadro de partidos” sustituye a “Fixture”', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#sidebar');
  const texto = await page.locator('#sidebar').textContent();
  expect(texto).toContain('Cuadro de partidos');
  expect(texto).not.toContain('Fixture');
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

test('acceso limpio: un overlay, sin avisos y sin consultas administrativas', async ({ page }) => {
  const rest = [];
  const auth = [];
  page.on('request', r => {
    if (r.url().includes('/rest/v1/')) rest.push(r.url());
    if (r.url().includes('/auth/v1/')) auth.push(r.url());
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.GL && !!window.Auth && !!document.querySelector('#auth'));
  await page.waitForLoadState('networkidle').catch(() => {});

  const estado = await page.evaluate(() => ({
    overlays: document.querySelectorAll('#auth').length,
    avisos: document.querySelectorAll('.toastify, .gl-notificacion').length,
    notificaciones: window.GL && window.GL._notificaciones
  }));
  expect(estado.overlays).toBe(1);
  expect(estado.avisos).toBe(0);
  expect(estado.notificaciones).toBe(0);
  expect(auth.filter(u => u.includes('refresh_token'))).toEqual([]);
  expect(rest.filter(u => /jugadores|grupos|partidos|clasificacion|jornadas|notificaciones|auditoria/.test(u))).toEqual([]);
});

test('refresh vencido: se limpia y recupera sin aviso amarillo', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.Auth && !!window.Auth._cliente);
  await page.evaluate(() => {
    const cliente = window.Auth._cliente();
    const key = (cliente && cliente.auth && cliente.auth.storageKey) || 'sb-zmjzlvsdlfzmhptmtmjx-auth-token';
    localStorage.setItem(key, JSON.stringify({
      access_token: 'expired-test-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) - 7200,
      refresh_token: 'expired-test-refresh-token',
      user: {
        id: '00000000-0000-0000-0000-000000000000',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'expired-test@example.invalid'
      }
    }));
  });

  const rest = [];
  page.on('request', r => {
    if (r.url().includes('/rest/v1/')) rest.push(r.url());
  });
  const refresco = page.waitForResponse(r => r.url().includes('/auth/v1/token?grant_type=refresh_token')).catch(() => null);
  await page.reload();
  const respuesta = await refresco;
  await page.waitForFunction(() => !!window.GL && !!window.Auth && !!document.querySelector('#auth'));
  await page.waitForLoadState('networkidle').catch(() => {});

  expect(respuesta && respuesta.status()).toBe(400);
  const estado = await page.evaluate(() => ({
    overlays: document.querySelectorAll('#auth').length,
    avisos: document.querySelectorAll('.toastify, .gl-notificacion').length,
    notificaciones: window.GL && window.GL._notificaciones,
    usuario: !!window.Auth.usuario
  }));
  expect(estado.overlays).toBe(1);
  expect(estado.avisos).toBe(0);
  expect(estado.notificaciones).toBe(0);
  expect(estado.usuario).toBe(false);
  expect(rest.filter(u => /jugadores|grupos|partidos|clasificacion|jornadas|notificaciones|auditoria/.test(u))).toEqual([]);

  await page.evaluate(() => {
    const cliente = window.Auth._cliente();
    const key = (cliente && cliente.auth && cliente.auth.storageKey) || 'sb-zmjzlvsdlfzmhptmtmjx-auth-token';
    localStorage.removeItem(key);
  });
  await page.reload();
  await page.waitForFunction(() => !!window.Auth && !!document.querySelector('#auth'));
  const trasLimpiar = await page.evaluate(() => ({
    overlays: document.querySelectorAll('#auth').length,
    avisos: document.querySelectorAll('.toastify, .gl-notificacion').length
  }));
  expect(trasLimpiar.overlays).toBe(1);
  expect(trasLimpiar.avisos).toBe(0);
});

test('acceso responsive: sin desbordes en laptop, escritorio y móvil', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#auth');
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    const estado = await page.evaluate(() => {
      const overlay = document.querySelector('#auth');
      const estilo = overlay && getComputedStyle(overlay);
      const caja = overlay && overlay.querySelector('.auth-marco');
      const r = caja && caja.getBoundingClientRect();
      const rr = overlay && overlay.getBoundingClientRect();
      return {
        desborde: document.documentElement.scrollWidth - window.innerWidth,
        overlays: document.querySelectorAll('#auth').length,
        visible: !!estilo && estilo.display !== 'none' && estilo.visibility !== 'hidden' &&
          !!rr && rr.width > 0 && rr.height > 0,
        cajaDentro: !!r && r.left >= -1 && r.right <= window.innerWidth + 1,
        campos: overlay ? overlay.querySelectorAll('input').length : 0
      };
    });
    expect(estado.desborde, `desborde en ${viewport.width}px`).toBeLessThanOrEqual(1);
    expect(estado.overlays).toBe(1);
    expect(estado.visible).toBe(true);
    expect(estado.cajaDentro).toBe(true);
    expect(estado.campos).toBeGreaterThan(0);
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
