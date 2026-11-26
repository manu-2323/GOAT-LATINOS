import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const codigoAuth = readFileSync(resolve(raiz, 'js/ui/auth.js'), 'utf8');
const codigoConfig = readFileSync(resolve(raiz, 'js/core/config.js'), 'utf8');
const CONFIG = new Function(codigoConfig + '\nreturn CONFIG;')();

function cargarAuth(cargarPaises) {
  const GL = {
    ...window.GL,
    cargarPaises,
    notificar() {},
    error() {},
    mensaje: (_e, _a, c) => c || 'Error'
  };
  const crear = new Function(
    'GL', 'Auth', 'CONFIG', 'icono', 'esc', 'iniciarIconos',
    codigoAuth + '\nreturn PantallaAuth;'
  );
  return crear(
    GL, window.Auth, CONFIG,
    window.icono || (() => ''),
    window.esc || (valor => String(valor == null ? '' : valor)),
    window.iniciarIconos || (() => {})
  );
}

describe('FASE 3.13 — acceso sin duplicados', () => {
  it('mantiene un solo overlay cuando arranque y gl:auth llaman a mostrar a la vez', async () => {
    const resolvers = [];
    const pantalla = cargarAuth(() => new Promise(r => { resolvers.push(r); }));
    document.querySelectorAll('#auth').forEach(x => x.remove());

    const primera = pantalla.mostrar();
    const segunda = pantalla.mostrar();
    resolvers.forEach(r => r());
    await Promise.all([primera, segunda]);

    expect(document.querySelectorAll('#auth').length).toBe(1);
    expect(pantalla.overlay).toBe(document.querySelector('#auth'));
  });

  it('sustituye el overlay anterior en llamadas secuenciales', async () => {
    const pantalla = cargarAuth(async () => {});
    document.querySelectorAll('#auth').forEach(x => x.remove());

    await pantalla.mostrar();
    await pantalla.mostrar();

    expect(document.querySelectorAll('#auth').length).toBe(1);
  });
});
