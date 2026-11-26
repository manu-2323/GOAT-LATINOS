import { describe, it, expect } from 'vitest';

describe('Mensajes legibles y cuatro estados', () => {
  it('traduce errores técnicos sin exponerlos al usuario', () => {
    const texto = window.GL.mensaje(new Error('Failed to fetch'), 'guardar', 'los resultados');
    expect(texto).toContain('Comprueba tu conexión');
    expect(texto).not.toContain('Failed to fetch');
  });

  it('clasifica 42703 como problema de esquema y no como fallo de conexión', () => {
    const tecnico = 'Failed to run sql query: ERROR: 42703: column "telefono_nacional" does not exist';
    const texto = window.GL.mensaje(new Error(tecnico), 'cargar', 'los resultados');
    expect(texto).toContain('estructura esperada');
    expect(texto).not.toContain('configuración con la base de datos');
    expect(texto).not.toContain('42703');
    expect(texto).not.toContain('does not exist');
  });

  it('unifica el tono y evita voseo', () => {
    expect(window.GL.textoAmigable('Comprobá los datos y usá otro nombre')).toBe('Comprueba los datos y usa otro nombre');
  });

  it('ofrece mensajes de carga concretos por acción', () => {
    expect(window.GL.mensajeCarga('png')).toBe('Generando PNG…');
    expect(window.GL.mensajeCarga('analizar')).toBe('Leyendo la captura…');
  });

  it('renderiza los cuatro estados sin pantallas en blanco', () => {
    const contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    ['cargando', 'vacio', 'error', 'listo'].forEach(modo => {
      window.GL.estado(contenedor, modo, { titulo: 'Prueba', texto: 'Texto', icono: 'inbox', contenido: '<p>Listo</p>' });
      expect(contenedor.innerHTML.length).toBeGreaterThan(20);
      expect(contenedor.getAttribute('aria-busy')).toBe(modo === 'cargando' ? 'true' : 'false');
    });
  });
});
