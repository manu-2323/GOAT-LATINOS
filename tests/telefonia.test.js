import { describe, it, expect } from 'vitest';

describe('Telefonía internacional con libphonenumber-js', () => {
  it('normaliza Nicaragua a E.164 sin forzar guiones en la base de datos', () => {
    expect(window.GL.tel.e164('8108-5555', 'NI')).toBe('+50581085555');
    expect(window.GL.tel.normalizar('8108-5555', 'NI')).toBe('50581085555');
  });

  it('usa el formato nacional de la metadata; en NI lo presenta 8108-5555', () => {
    expect(window.GL.tel.nacional('+50581085555', 'NI')).toBe('8108-5555');
  });

  it('no aplica el formato de Nicaragua a otros países', () => {
    const nacional = window.GL.tel.nacional('+12025550123', 'US');
    expect(nacional).not.toContain('-505');
    expect(window.GL.tel.esValido('+12025550123', 'US')).toBe(true);
  });

  it('rechaza un número inválido para el país elegido', () => {
    expect(window.GL.tel.validar('123', 'NI').ok).toBe(false);
  });

  it(' genera wa.me solo con dígitos y no afirma que exista cuenta de WhatsApp', () => {
    const html = window.GL.linkWhatsapp({
      telefono: '8108-5555', telefono_e164: '+50581085555', pais: 'NI', pais_telefono: 'NI', nombre_usuario: 'Joaquín'
    });
    expect(html).toContain('https://wa.me/50581085555');
    expect(html).not.toContain('wa.me/+');
    expect(html).not.toMatch(/wa\.me\/[^\"]*[- ]/);
    expect(html.toLowerCase()).not.toContain('verificado');
  });
});
