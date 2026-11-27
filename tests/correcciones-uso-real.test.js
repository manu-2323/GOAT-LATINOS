import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const raiz = process.cwd();
const leer = ruta => readFileSync(resolve(raiz, ruta), 'utf8');
const esperar = ms => new Promise(res => setTimeout(res, ms));
const clicFondo = nodo => nodo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const escape = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

async function abrirPrueba(opciones = {}) {
  const modal = window.GL.abrirModal(Object.assign({
    titulo: 'Prueba',
    cuerpo: '<input class="input" id="dato" value="">',
    acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>'
  }, opciones));
  await esperar(80);
  return modal;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="modal-root"></div>';
});

afterEach(async () => {
  document.body.innerHTML = '<div id="modal-root"></div>';
  await esperar(0);
});

describe('Correcciones de uso real — selector de ubicación', () => {
  it('muestra Nicaragua preseleccionada sin ocultar los demás países admitidos', () => {
    const html = window.GL.opcionesZonaHoraria('America/Managua', 'NI');
    expect(html).toContain('value="America/Managua" selected');
    expect(html).toContain('value="America/Costa_Rica"');
    expect(html).toContain('value="America/Mexico_City"');
    expect(html).toContain('value="America/Tijuana"');
    expect(html).toContain('value="America/Sao_Paulo"');
    expect((html.match(/<option /g) || []).length).toBe(27);
  });

  it('preselecciona Costa Rica al cambiar el país del jugador y mantiene todas las zonas', () => {
    const html = window.GL.opcionesZonaHoraria('', 'CR');
    expect(html).toContain('value="America/Costa_Rica" selected');
    expect(html.indexOf('America/Costa_Rica')).toBeLessThan(html.indexOf('America/Managua'));
    expect((html.match(/<option /g) || []).length).toBe(27);
  });

  it('conserva la zona IANA guardada aunque no coincida con el país del jugador', () => {
    const html = window.GL.opcionesZonaHoraria('America/Tijuana', 'NI');
    expect(html).toContain('value="America/Tijuana" selected');
    expect(html).toContain('Managua — Nicaragua');
  });

  it('no descarta la zona elegida al actualizar la nota horaria', () => {
    const select = document.createElement('select');
    select.innerHTML = window.GL.opcionesZonaHoraria('America/Costa_Rica', 'CR');
    const nota = document.createElement('p');
    window.GL.actualizarZona(select, 'NI', nota, true);
    expect(select.value).toBe('America/Costa_Rica');
    expect(select.innerHTML).toContain('value="America/Managua"');
    expect(nota.textContent).toContain('Horario de juego');
  });

  it('el país del teléfono no escribe zona_horaria en los campos canónicos', () => {
    const campos = window.GL.tel.campos('8108-5555', 'NI');
    expect(campos.pais_telefono).toBe('NI');
    expect(campos.telefono_e164).toBe('+50581085555');
    expect(campos.zona_horaria).toBeUndefined();

    const admin = leer('js/modulos/admin.js');
    const inicio = admin.indexOf('function modalAgregar(root)');
    const fin = admin.indexOf('/* ---------------- Modales de jornadas');
    const modal = admin.slice(inicio, fin);
    const listenerTel = modal.match(/telPais\.addEventListener\('change'[\s\S]*?\n        \}\);/)[0];
    expect(listenerTel).not.toContain('actualizarZona');
    expect(modal).toContain('zona_horaria:   zona.value');
    expect(modal).toContain('pais:           pais.value');
  });
});

describe('Correcciones de uso real — cierre del modal', () => {
  it('el fondo NO cierra el formulario protegido, pero X sí', async () => {
    const modal = await abrirPrueba({ cerrarFondo: false });
    clicFondo(modal);
    await esperar(40);
    expect(modal.isConnected).toBe(true);
    modal.querySelector('.modal-head [data-cerrar]').click();
    await esperar(230);
    expect(modal.isConnected).toBe(false);
  });

  it('los modales que no se protegen conservan el cierre por fondo', async () => {
    const modal = await abrirPrueba();
    clicFondo(modal);
    await esperar(230);
    expect(modal.isConnected).toBe(false);
  });

  it('GL.dialogo también admite cerrarFondo:false sin cambiar el default', async () => {
    const protegido = window.GL.dialogo({ titulo: 'Diálogo', cuerpo: '<p>Contenido</p>', cerrarFondo: false });
    clicFondo(protegido);
    await esperar(40);
    expect(protegido.isConnected).toBe(true);
    protegido.querySelector('.modal-head [data-cerrar]').click();
    await esperar(230);

    const normal = window.GL.dialogo({ titulo: 'Diálogo', cuerpo: '<p>Contenido</p>' });
    clicFondo(normal);
    await esperar(230);
    expect(normal.isConnected).toBe(false);
  });

  it('cierra sin preguntar cuando el formulario está vacío', async () => {
    const modal = await abrirPrueba({ confirmarDescarto: true });
    modal.querySelector('[data-cerrar]').click();
    await esperar(230);
    expect(document.querySelectorAll('.modal-fondo')).toHaveLength(0);
  });

  it('pide confirmación al descartar datos, permite seguir editando y permite descartar', async () => {
    const modal = await abrirPrueba({ confirmarDescarto: true });
    modal.querySelector('#dato').value = 'Dato sin guardar';

    modal.querySelector('[data-cerrar]').click();
    await esperar(40);
    expect(modal.isConnected).toBe(true);
    expect(document.body.textContent).toContain('Los datos que ingresaste no se guardaron.');

    document.querySelectorAll('.modal-fondo')[1].querySelector('[data-no]').click();
    await esperar(230);
    expect(modal.isConnected).toBe(true);
    expect(document.querySelectorAll('.modal-fondo')).toHaveLength(1);

    modal.querySelector('.modal-head [data-cerrar]').click();
    await esperar(40);
    document.querySelectorAll('.modal-fondo')[1].querySelector('[data-si]').click();
    await esperar(240);
    expect(modal.isConnected).toBe(false);
  });

  it('Escape también respeta la confirmación de descarte', async () => {
    const modal = await abrirPrueba({ confirmarDescarto: true });
    modal.querySelector('#dato').value = 'Cambio';
    escape();
    await esperar(40);
    expect(modal.isConnected).toBe(true);
    expect(document.body.textContent).toContain('¿Descartar los cambios?');
    document.querySelectorAll('.modal-fondo')[1].querySelector('[data-no]').click();
    await esperar(230);
    expect(modal.isConnected).toBe(true);
  });

  it('los formularios de alta y edición de jugador usan ambas protecciones', () => {
    const admin = leer('js/modulos/admin.js').replace(/\r\n/g, '\n');
    expect(admin).toContain("titulo: 'Agregar jugador al torneo',\n      ancho: 'j5-forma',\n      cerrarFondo: false,\n      confirmarDescarto: true,");
    expect(admin).toContain("titulo: 'Editar jugador — ' + esc(j.nombre_usuario),\n      ancho: 'j5-forma',\n      cerrarFondo: false,\n      confirmarDescarto: true,");
  });
});

describe('Correcciones de uso real — cache-busting', () => {
  it('renueva la versión de los archivos modificados', () => {
    expect(leer('js/core/config.js')).toContain("VERSION: '1.3.9'");
    const index = leer('index.html');
    expect(index).toContain('js/core/config.js?v=1.3.9');
    expect(index).toContain('js/core/gl.js?v=1.3.9');
    expect(index).toContain('js/core/supabase.js?v=1.3.9');
    expect(index).toContain('js/ui/menu.js?v=1.3.9');
    expect(index).toContain('js/ui/auth.js?v=1.3.9');
    expect(index).toContain('js/app.js?v=1.3.9');
  });
});
