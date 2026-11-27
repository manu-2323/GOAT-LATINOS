import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8');
const URL_PUBLICA = 'https://goat-latinos.pages.dev/';
const URL_RECUPERACION = URL_PUBLICA + '?recuperacion=1';
const codigoAuth = leer('js/ui/auth.js');
const codigoApp = leer('js/app.js');
const CONFIG = new Function(leer('js/core/config.js') + '\nreturn CONFIG;')();
const cargarPerfilOriginal = window.Auth.cargarPerfil;

function clienteFalso(opciones = {}) {
  const llamadas = { resetPasswordForEmail: [], updateUser: [], signOut: [] };
  return {
    llamadas,
    auth: {
      resetPasswordForEmail: async (email, options) => {
        const args = { email, options };
        llamadas.resetPasswordForEmail.push(args);
        return opciones.reset ? opciones.reset(args) : { error: null };
      },
      updateUser: async args => {
        llamadas.updateUser.push(args);
        return opciones.update ? opciones.update(args) : { error: null };
      },
      signOut: async () => {
        llamadas.signOut.push(true);
        return { error: null };
      }
    }
  };
}

function cargarPantalla() {
  const GL = {
    ...window.GL,
    cargarPaises: async () => {},
    notificar() {},
    error() {},
    mensaje: (_e, _a, c) => c || 'Error'
  };
  const crear = new Function(
    'GL', 'Auth', 'CONFIG', 'icono', 'esc', 'iniciarIconos',
    codigoAuth + '\nreturn PantallaAuth;'
  );
  document.querySelectorAll('#auth').forEach(x => x.remove());
  return crear(
    GL, window.Auth, CONFIG,
    () => '', valor => String(valor == null ? '' : valor), () => {}
  );
}

const esperarTick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  window.Auth._sb = null;
  window.Auth.usuario = null;
  window.Auth.jugador = null;
  window.Auth.avisoCallback = null;
  window.Auth.cargarPerfil = async () => null;
});

afterEach(() => {
  window.Auth._sb = null;
  window.Auth.usuario = null;
  window.Auth.jugador = null;
  window.Auth.avisoCallback = null;
  window.Auth.cargarPerfil = cargarPerfilOriginal;
  window.history.replaceState({}, '', URL_PUBLICA);
  document.querySelectorAll('#auth').forEach(x => x.remove());
  document.body.classList.remove('auth-activa');
});

describe('Recuperación de contraseña — retorno del enlace', () => {
  it('reconoce un callback de recuperación sin mostrar el aviso de correo confirmado', () => {
    const aviso = window.Auth.consumirCallback({ type: 'recovery', access_token: 'token-de-prueba' });
    expect(aviso).toMatchObject({ error: false, recuperacion: true });
    expect(aviso.mensaje).toBeNull();
    expect(window.Auth.avisoCallback).toBeNull();
  });

  it('reconoce el marcador de la query aunque Supabase solo devuelva un error', () => {
    const aviso = window.Auth.consumirCallback({
      recuperacion: '1',
      error: 'access_denied',
      error_code: 'otp_expired',
      error_description: 'Email link is invalid or has expired'
    });
    expect(aviso.recuperacion).toBe(true);
    expect(aviso.mensaje).toContain('contraseña');
  });

  it('explica un enlace de recuperación vencido y permite volver al ingreso', () => {
    const aviso = window.Auth.consumirCallback({
      type: 'recovery',
      error: 'access_denied',
      error_code: 'otp_expired',
      error_description: 'Email link is invalid or has expired'
    });
    expect(aviso.error).toBe(true);
    expect(aviso.recuperacion).toBe(true);
    expect(aviso.mensaje).toContain('contraseña');
    expect(aviso.mensaje).toContain('Pedí uno nuevo');
    expect(window.Auth.avisoCallback).toBe(aviso.mensaje);
  });

  it('no confunde un error de confirmación de correo con el de recuperación', () => {
    const aviso = window.Auth.consumirCallback({
      error: 'access_denied',
      error_description: 'Email link is invalid'
    });
    expect(aviso.recuperacion).toBe(false);
    expect(aviso.mensaje).toContain('No cambies tu correo');
  });

  it('limpia el marcador y el fragmento para que la próxima carga sea normal', () => {
    window.history.replaceState({}, '', URL_RECUPERACION + '#access_token=token-de-prueba');
    window.Auth.consumirCallback({ recuperacion: '1', access_token: 'token-de-prueba' });
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('el arranque abre la pantalla de recuperación y evita que la sesión temporal la cierre', () => {
    expect(codigoApp).toContain("avisoAuth && avisoAuth.recuperacion");
    expect(codigoApp).toContain("PantallaAuth.modo = 'recuperar'");
    expect(codigoApp).toContain("PantallaAuth.modo !== 'recuperar'");
  });
});

describe('Recuperación de contraseña — envío y actualización', () => {
  it('pide el enlace a la URL pública con mensaje genérico', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    await expect(window.Auth.solicitarRecuperacion(' JUGADOR@EXAMPLE.COM ')).resolves.toBe(true);
    expect(cliente.llamadas.resetPasswordForEmail).toEqual([{
      email: 'jugador@example.com',
      options: { emailRedirectTo: URL_RECUPERACION }
    }]);
  });

  it('rechaza una dirección inválida sin enviar correo', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    await expect(window.Auth.solicitarRecuperacion('no-es-correo')).rejects.toThrow('Ingresá un correo válido.');
    expect(cliente.llamadas.resetPasswordForEmail).toHaveLength(0);
  });

  it('valida los requisitos antes de llamar a Supabase', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', email: 'jugador@example.com' };
    await expect(window.Auth.actualizarContrasenaRecuperacion('corta', 'corta')).rejects.toThrow('al menos 8');
    await expect(window.Auth.actualizarContrasenaRecuperacion('NuevaClave123', 'OtraClave123')).rejects.toThrow('no coinciden');
    expect(cliente.llamadas.updateUser).toHaveLength(0);
  });

  it('actualiza la contraseña con la sesión del enlace', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', email: 'jugador@example.com' };
    await expect(window.Auth.actualizarContrasenaRecuperacion('NuevaClave123', 'NuevaClave123')).resolves.toBe(true);
    expect(cliente.llamadas.updateUser).toEqual([{ password: 'NuevaClave123' }]);
  });

  it('explica un enlace vencido al actualizar sin culpar al usuario', async () => {
    const cliente = clienteFalso({
      update: () => ({ error: { message: 'Token has expired' } })
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', email: 'jugador@example.com' };
    await expect(window.Auth.actualizarContrasenaRecuperacion('NuevaClave123', 'NuevaClave123'))
      .rejects.toThrow('El enlace venció');
  });

  it('no cambia la clave compartida de una cuenta administradora', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'admin-1', email: 'admin@example.com' };
    window.Auth.cargarPerfil = async () => {
      window.Auth.jugador = { rol: 'admin' };
      return window.Auth.jugador;
    };
    await expect(window.Auth.actualizarContrasenaRecuperacion('NuevaClave123', 'NuevaClave123'))
      .rejects.toThrow('administrador');
    expect(cliente.llamadas.updateUser).toHaveLength(0);
  });
});

describe('Recuperación de contraseña — pantallas', () => {
  it('el acceso ofrece «¿Olvidaste tu contraseña?» y envía el correo', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    const pantalla = cargarPantalla();
    pantalla.modo = 'entrar';
    await pantalla.mostrar();

    const overlay = document.querySelector('#auth');
    expect(overlay.querySelector('#en-recuperar')).not.toBeNull();
    overlay.querySelector('#en-correo').value = 'JUGADOR@EXAMPLE.COM';
    overlay.querySelector('#en-recuperar').click();
    await esperarTick();

    expect(cliente.llamadas.resetPasswordForEmail[0].email).toBe('jugador@example.com');
    expect(overlay.querySelector('#en-recuperacion-estado').textContent).toContain('Si la cuenta existe');
  });

  it('la pantalla de recuperación pide y confirma la nueva contraseña', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', email: 'jugador@example.com' };
    const pantalla = cargarPantalla();
    pantalla.modo = 'recuperar';
    await pantalla.mostrar();

    const overlay = document.querySelector('#auth');
    expect(overlay.querySelector('#form-recuperar')).not.toBeNull();
    expect(overlay.querySelector('#rc-clave')).not.toBeNull();
    expect(overlay.querySelector('#rc-clave2')).not.toBeNull();
    expect(overlay.querySelector('#rc-volver')).not.toBeNull();

    overlay.querySelector('#rc-clave').value = 'NuevaClave123';
    overlay.querySelector('#rc-clave2').value = 'NuevaClave123';
    overlay.querySelector('#form-recuperar').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await esperarTick();

    expect(cliente.llamadas.updateUser).toEqual([{ password: 'NuevaClave123' }]);
    expect(cliente.llamadas.signOut).toHaveLength(1);
    expect(pantalla.modo).toBe('entrar');
    expect(pantalla.aviso).toContain('Contraseña actualizada');
  });

  it('un enlace vencido ofrece volver al ingreso sin quedar atrapado', async () => {
    const pantalla = cargarPantalla();
    pantalla.modo = 'recuperar';
    pantalla.aviso = 'El enlace para restablecer tu contraseña venció.';
    await pantalla.mostrar();

    const overlay = document.querySelector('#auth');
    expect(overlay.querySelector('[role="alert"]').textContent).toContain('venció');
    overlay.querySelector('#rc-volver').click();
    await esperarTick();

    expect(pantalla.modo).toBe('entrar');
    expect(pantalla.aviso).toBeNull();
    expect(document.querySelector('#form-entrar')).not.toBeNull();
  });
});
