/* =====================================================================
   FASE 3.19 — Arneses visuales portables

   Un único punto para:
   - resolver la raíz del proyecto desde import.meta.url;
   - servir los mocks por HTTP sin depender de rutas personales ni Python;
   - lanzar Chromium de Playwright o el navegador indicado por CHROME_PATH;
   - abortar sólo tráfico externo, permitiendo el servidor local;
   - compartir los anchos verificados en FASE 3.19.
   ===================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ANCHOS = [320, 375, 390, 768, 1024, 1280, 1366, 1920];

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

export function iniciarServidorVisual() {
  const servidor = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const archivo = path.resolve(RAIZ, rel);
    if (archivo !== RAIZ && !archivo.startsWith(RAIZ + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(archivo, (error, datos) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      }).end(datos);
    });
  });

  return new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    const puerto = Number(process.env.GL_PUERTO || 0);
    servidor.listen(puerto, '127.0.0.1', () => {
      servidor.off('error', rechazar);
      resolver({
        url: 'http://127.0.0.1:' + servidor.address().port,
        cerrar: () => new Promise((res, rej) =>
          servidor.close(err => err ? rej(err) : res()))
      });
    });
  });
}

export function lanzarNavegadorVisual() {
  const opciones = { headless: true, args: ['--no-sandbox'] };
  if (process.env.CHROME_PATH) opciones.executablePath = process.env.CHROME_PATH;
  return chromium.launch(opciones);
}

export async function bloquearExternos(page) {
  await page.route(/^https?:\/\//, route => {
    const destino = new URL(route.request().url());
    if (destino.hostname === '127.0.0.1' || destino.hostname === 'localhost') {
      return route.continue();
    }
    return route.abort();
  });
}
