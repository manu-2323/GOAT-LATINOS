import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const URL_PUBLICA = 'https://manu-2323.github.io/GOAT-LATINOS/';
const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8');

function clienteFalso(signUp) {
  const llamadas = { signUp: [], resend: [] };
  return {
    llamadas,
    auth: {
      signUp: async args => {
        llamadas.signUp.push(args);
        if (signUp) return signUp(args);
        return {
          data: { user: { id: 'u-1', email: 'jugador@example.com', user_metadata: args.options.data }, session: null },
          error: null
        };
      },
      resend: async args => {
        llamadas.resend.push(args);
        return { error: null };
      }
    },
    rpc: async nombre => {
      if (nombre === 'gl_nombre_disponible') return { data: { ok: true }, error: null };
      return { data: {}, error: null };
    }
  };
}

beforeEach(() => {
  window.Auth._sb = null;
  window.Auth.avisoCallback = null;
});

afterEach(() => {
  window.Auth._sb = null;
  window.Auth.avisoCallback = null;
});

describe('Confirmación de correo — retorno a la URL pública', () => {
  it('la URL pública es la raíz real del proyecto en GitHub Pages', () => {
    expect(leer('js/core/config.js')).toContain("SITE_URL: '" + URL_PUBLICA + "'");
  });

  it('registrar envía emailRedirectTo con la URL pública exacta', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;

    const resultado = await window.Auth.registrar(
      'JUGADOR_PRUEBA', 'jugador@example.com', 'Clave12345', 'NI',
      { e164: '+50581085555', paisTel: 'NI' }, 'America/Managua'
    );

    expect(resultado.requiereConfirmacion).toBe(true);
    expect(cliente.llamadas.signUp).toHaveLength(1);
    expect(cliente.llamadas.signUp[0].options.emailRedirectTo).toBe(URL_PUBLICA);
    expect(cliente.llamadas.signUp[0].options.data).not.toHaveProperty('emailRedirectTo');
  });

  it('reenviar confirmación usa el mismo retorno y no crea cuenta', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;

    await expect(window.Auth.reenviarConfirmacion(' JUGADOR@example.com ')).resolves.toBe(true);
    expect(cliente.llamadas.resend).toEqual([{
      email: 'jugador@example.com',
      type: 'signup',
      options: { emailRedirectTo: URL_PUBLICA }
    }]);
    expect(cliente.llamadas.signUp).toHaveLength(0);
  });

  it('rechaza reenviar sin un correo válido', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    await expect(window.Auth.reenviarConfirmacion('no-es-correo')).rejects.toThrow('Ingresá un correo válido.');
    expect(cliente.llamadas.resend).toHaveLength(0);
  });
});

describe('Confirmación de correo — mensajes al volver del enlace', () => {
  it('explica un enlace vencido o ya usado y deja aviso para la pantalla de acceso', () => {
    const aviso = window.Auth.consumirCallback({
      error: 'access_denied',
      error_code: 'otp_expired',
      error_description: 'Email link is invalid or has expired'
    });
    expect(aviso.error).toBe(true);
    expect(aviso.mensaje).toContain('venció');
    expect(window.Auth.avisoCallback).toBe(aviso.mensaje);
  });

  it('explica un enlace inválido sin culpar al usuario ni pedir otra cuenta', () => {
    const aviso = window.Auth.consumirCallback({
      error: 'access_denied',
      error_description: 'Email link is invalid'
    });
    expect(aviso.error).toBe(true);
    expect(aviso.mensaje).toContain('No cambies tu correo');
  });

  it('avisa que el correo quedó confirmado tras un retorno con sesión', () => {
    const aviso = window.Auth.consumirCallback({ type: 'signup', access_token: 'token-de-prueba' });
    expect(aviso.error).toBe(false);
    expect(aviso.mensaje).toContain('Correo confirmado');
    expect(window.Auth.avisoCallback).toBeNull();
  });

  it('no muestra nada en una carga normal sin parámetros de Auth', () => {
    expect(window.Auth.consumirCallback({ cb: 'normal' })).toBeNull();
    expect(window.Auth.avisoCallback).toBeNull();
  });

  it('la pantalla de acceso muestra el aviso y ofrece reenviar el correo', () => {
    const codigo = leer('js/ui/auth.js');
    expect(codigo).toContain('PantallaAuth.aviso');
    expect(codigo).toContain('role="alert"');
    expect(codigo).toContain('id="en-reenviar"');
    expect(codigo).toContain('Auth.reenviarConfirmacion(correo)');
  });

  it('arranca lee el aviso antes de iniciar y limpia la URL después de la sesión', () => {
    const codigo = leer('js/app.js');
    const lectura = codigo.indexOf('Auth.consumirCallback(undefined, false)');
    const inicio = codigo.indexOf('await Auth.iniciar()');
    const limpieza = codigo.indexOf('Auth.limpiarCallbackUrl()');
    expect(lectura).toBeGreaterThan(-1);
    expect(inicio).toBeGreaterThan(lectura);
    expect(limpieza).toBeGreaterThan(inicio);
    expect(codigo).toContain('PantallaAuth.aviso = avisoAuth.mensaje');
  });

  it('limpia el fragmento cuando se consume un retorno con el valor por defecto', () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired';
    window.Auth.consumirCallback({
      error: 'access_denied',
      error_code: 'otp_expired'
    });
    expect(window.location.hash).toBe('');
  });
});
