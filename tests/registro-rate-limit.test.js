import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const raiz = process.cwd();
const leer = ruta => readFileSync(resolve(raiz, ruta), 'utf8');
const codigoAuth = leer('js/ui/auth.js');
const URL_PUBLICA = 'https://manu-2323.github.io/GOAT-LATINOS/';

const telFalso = {
  prefijo: () => '505',
  validar(valor, pais) {
    const digitos = String(valor || '').replace(/\D/g, '');
    if (!digitos) return { ok: false, mensaje: 'El teléfono es obligatorio.' };
    return { ok: true, nacional: digitos, e164: '+505' + digitos, pais: pais || 'NI' };
  },
  campos(e164, pais) {
    return { telefono_e164: e164, telefono_nacional: String(e164 || '').slice(4), pais_telefono: pais || 'NI' };
  }
};

function GLFalso() {
  return {
    ...window.GL,
    cargarPaises: async () => {},
    notificar: () => {},
    error: () => 'Error',
    mensaje: (_e, _a, c) => c || 'Error',
    opcionesPais: () => '<option value="NI">Nicaragua</option><option value="CR">Costa Rica</option>',
    opcionesZonaHoraria: () => '<option value="">Elegí tu zona</option><option value="America/Managua">Managua</option>',
    actualizarZona(select) {
      if (!select.options.length) select.innerHTML = '<option value="America/Managua">Managua</option>';
      select.value = 'America/Managua';
    },
    tel: telFalso
  };
}

function cargarPantalla(registrar, nombreDisponible = async () => ({ ok: true, mensaje: 'Nombre disponible' }), configExtra = {}) {
  const auth = {
    ...window.Auth,
    _sb: null,
    registrar,
    nombreDisponible,
    reenviarConfirmacion: async () => true,
    entrar: async () => {},
    entrarAdmin: async () => {}
  };
  const crear = new Function(
    'GL', 'Auth', 'CONFIG', 'icono', 'esc', 'iniciarIconos',
    codigoAuth + '\nreturn PantallaAuth;'
  );
  const CONFIG = new Function(leer('js/core/config.js') + '\nreturn CONFIG;')();
  Object.assign(CONFIG, configExtra);
  return crear(
    GLFalso(), auth, CONFIG,
    window.icono || (() => ''),
    window.esc || (valor => String(valor == null ? '' : valor)),
    window.iniciarIconos || (() => {})
  );
}

async function abrirRegistro(registrar, configExtra = {}) {
  document.querySelectorAll('#auth').forEach(x => x.remove());
  const pantalla = cargarPantalla(registrar, undefined, configExtra);
  pantalla.modo = 'registro';
  await pantalla.mostrar();

  const form = document.querySelector('#form-registro');
  const nombre = form.querySelector('#rg-nombre');
  nombre.value = 'JUGADOR_PRUEBA';
  nombre.dispatchEvent(new Event('input', { bubbles: true }));

  const correo = form.querySelector('#rg-correo');
  correo.value = 'jugador@gmail.com';
  correo.dispatchEvent(new Event('input', { bubbles: true }));

  const clave = form.querySelector('#rg-clave');
  clave.value = 'Clave12345';
  clave.dispatchEvent(new Event('input', { bubbles: true }));
  const clave2 = form.querySelector('#rg-clave2');
  clave2.value = 'Clave12345';
  clave2.dispatchEvent(new Event('input', { bubbles: true }));

  const telefono = form.querySelector('#rg-tel');
  telefono.value = '81085555';
  telefono.dispatchEvent(new Event('input', { bubbles: true }));

  /* La verificación de nombre tiene debounce real de 500 ms en la UI. */
  await new Promise(resolve => setTimeout(resolve, 600));

  return {
    form,
    correo,
    boton: form.querySelector('button[type="submit"]'),
    error: form.querySelector('#rg-error')
  };
}

function enviar(form) {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function clienteFalso(signUp) {
  return {
    auth: {
      signUp: vi.fn(signUp || (async () => ({
        data: { user: { id: 'u-1', email: 'jugador@gmail.com' }, session: null },
        error: null
      }))),
      resend: vi.fn(async () => ({ error: null }))
    },
    rpc: vi.fn(async nombre => {
      if (nombre === 'gl_nombre_disponible') return { data: { ok: true, mensaje: 'Nombre disponible' }, error: null };
      return { data: {}, error: null };
    })
  };
}

const argumentosRegistro = [
  'JUGADOR_PRUEBA', 'jugador@gmail.com', 'Clave12345', 'NI',
  { e164: '+50581085555', paisTel: 'NI' }, 'America/Managua'
];

beforeEach(() => {
  window.Auth._sb = null;
  window.Auth._registrando = false;
  window.Auth._reenviando = false;
});

afterEach(() => {
  window.Auth._sb = null;
  window.Auth._registrando = false;
  window.Auth._reenviando = false;
  document.querySelectorAll('#auth').forEach(x => x.remove());
});

describe('1.3.9 — un clic, un solo registro', () => {
  it('un envío llama a registrar una sola vez y bloquea el botón mientras espera', async () => {
    let resolver;
    const registrar = vi.fn(() => new Promise(r => { resolver = r; }));
    const { form, boton } = await abrirRegistro(registrar);

    expect(boton.disabled).toBe(false);
    enviar(form);

    expect(registrar).toHaveBeenCalledTimes(1);
    expect(boton.disabled).toBe(true);
    expect(boton.disabled).toBe(true);

    resolver({ requiereConfirmacion: true, mensaje: 'Revisá tu correo para confirmarla.' });
    await new Promise(r => setTimeout(r, 0));

    expect(boton.disabled).toBe(false);
  });

  it('dos envíos rápidos no duplican la cuenta ni el correo', async () => {
    const registrar = vi.fn(async () => ({ requiereConfirmacion: true, mensaje: 'Revisá tu correo.' }));
    const { form, correo, error } = await abrirRegistro(registrar);

    enviar(form);
    enviar(form);
    expect(registrar).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 0));
    enviar(form);
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(error.textContent).toContain('Ya enviamos el correo a esta dirección');

    correo.value = 'otro@gmail.com';
    correo.dispatchEvent(new Event('input', { bubbles: true }));
    enviar(form);
    await new Promise(r => setTimeout(r, 0));
    expect(registrar).toHaveBeenCalledTimes(2);
  });

  it('el núcleo impide dos registros concurrentes aunque la UI no bloquee', async () => {
    const cliente = clienteFalso(async () => {
      await new Promise(r => setTimeout(r, 20));
      return { data: { user: { id: 'u-1', email: 'jugador@gmail.com' }, session: null }, error: null };
    });
    window.Auth._sb = cliente;

    const primera = window.Auth.registrar(...argumentosRegistro);
    await expect(window.Auth.registrar(...argumentosRegistro))
      .rejects.toThrow('Ya hay un registro en curso');
    await primera;

    expect(cliente.auth.signUp).toHaveBeenCalledTimes(1);
    expect(window.Auth._registrando).toBe(false);
  });

  it('el botón y el guard se liberan cuando el registro falla', async () => {
    const registrar = vi.fn(async () => { throw new Error('Fallo de red.'); });
    const { form, boton, error } = await abrirRegistro(registrar);

    enviar(form);
    await new Promise(r => setTimeout(r, 0));

    expect(boton.disabled).toBe(false);
    expect(error.textContent).toBe('Fallo de red.');
  });

  it('un 429 de correo deja el botón usable y no inventa un tiempo de espera', async () => {
    const mensaje = window.Auth.traducir('429: email rate limit exceeded (over_email_send_rate_limit)');
    const registrar = vi.fn(async () => { throw new Error(mensaje); });
    const { form, boton, error } = await abrirRegistro(registrar);

    enviar(form);
    await new Promise(r => setTimeout(r, 0));

    expect(registrar).toHaveBeenCalledTimes(1);
    expect(boton.disabled).toBe(false);
    expect(error.textContent).toBe(mensaje);
    expect(error.textContent).not.toMatch(/\d+ (minutos|horas|segundos)/i);
  });

  it('si la respuesta se pierde, repetir el mismo correo no crea otra cuenta', async () => {
    const registrar = vi.fn(async () => { throw new Error('No hay conexión con el servidor. Revisá tu internet.'); });
    const { form, correo, boton, error } = await abrirRegistro(registrar);

    enviar(form);
    await new Promise(r => setTimeout(r, 0));
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(boton.disabled).toBe(false);

    enviar(form);
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(error.textContent).toContain('No sabemos con certeza');

    correo.value = 'otro@gmail.com';
    correo.dispatchEvent(new Event('input', { bubbles: true }));
    enviar(form);
    await new Promise(r => setTimeout(r, 0));
    expect(registrar).toHaveBeenCalledTimes(2);
  });

  it('un timeout local avisa y bloquea el reintento con el mismo correo', async () => {
    const registrar = vi.fn(() => new Promise(() => {}));
    const { form, error } = await abrirRegistro(registrar, { TIMEOUT_REGISTRO: 5 });

    enviar(form);
    await new Promise(r => setTimeout(r, 40));

    expect(registrar).toHaveBeenCalledTimes(1);
    expect(error.textContent).toContain('tardó demasiado');
    expect(error.textContent).not.toMatch(/\d+ (minutos|horas|segundos)/i);

    enviar(form);
    expect(registrar).toHaveBeenCalledTimes(1);
  });
});

describe('1.3.9 — interpretación de errores sin culpar al usuario', () => {
  it('identifica el límite de envío de correo de Supabase y no inventa un tiempo', () => {
    const mensaje = window.Auth.traducir('429: email rate limit exceeded (over_email_send_rate_limit)');
    expect(mensaje).toContain('correo de confirmación');
    expect(mensaje).toContain('No repitas el registro');
    expect(mensaje).toMatch(/no indica el tiempo exacto/i);
    expect(mensaje).not.toContain('Demasiados intentos');
    expect(mensaje).not.toContain('volvé a probar');
  });

  it('un límite genérico de solicitudes se distingue del de correo', () => {
    const mensaje = window.Auth.traducir('429: too many requests');
    expect(mensaje).toContain('limitó las solicitudes');
    expect(mensaje).toContain('no indicó cuánto tiempo falta');
    expect(mensaje).not.toContain('proveedor de correo');
  });

  it('un error de conexión muestra otro mensaje', () => {
    const conexion = window.Auth.traducir('Failed to fetch');
    const limite = window.Auth.traducir('email rate limit exceeded');
    expect(conexion).toContain('No hay conexión');
    expect(conexion).not.toBe(limite);
  });

  it('una cuenta existente conserva su mensaje propio', () => {
    expect(window.Auth.traducir('already registered')).toContain('ya está registrado');
    expect(window.Auth.traducir('email_address_invalid')).toContain('correo no es válido');
  });
});

describe('1.3.9 — reenvío sin duplicados', () => {
  it('impide dos reenvíos concurrentes', async () => {
    let resolver;
    const cliente = clienteFalso();
    cliente.auth.resend = vi.fn(() => new Promise(r => { resolver = r; }));
    window.Auth._sb = cliente;

    const primera = window.Auth.reenviarConfirmacion('jugador@gmail.com');
    await expect(window.Auth.reenviarConfirmacion('jugador@gmail.com'))
      .rejects.toThrow('Ya hay un correo en envío');
    resolver({ error: null });
    await expect(primera).resolves.toBe(true);

    expect(cliente.auth.resend).toHaveBeenCalledTimes(1);
    expect(window.Auth._reenviando).toBe(false);
  });

  it('traduce el límite de correo del reenvío usando el código de Supabase', async () => {
    const cliente = clienteFalso();
    cliente.auth.resend = vi.fn(async () => ({
      error: { message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' }
    }));
    window.Auth._sb = cliente;

    await expect(window.Auth.reenviarConfirmacion('jugador@gmail.com'))
      .rejects.toThrow('proveedor de correo');
    expect(cliente.auth.resend).toHaveBeenCalledTimes(1);
    expect(cliente.auth.resend.mock.calls[0][0].options.emailRedirectTo).toBe(URL_PUBLICA);
  });
});

describe('1.3.9 — regresiones del flujo ya corregido', () => {
  it('un correo de Gmail sigue recibiendo el retorno público correcto', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;

    const resultado = await window.Auth.registrar(...argumentosRegistro);

    expect(resultado.requiereConfirmacion).toBe(true);
    expect(cliente.auth.signUp).toHaveBeenCalledTimes(1);
    expect(cliente.auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(URL_PUBLICA);
  });

  it('el ingreso con correo y clave sigue haciendo una sola llamada', async () => {
    const cliente = clienteFalso();
    cliente.auth.signInWithPassword = vi.fn(async () => ({
      data: { user: { id: 'u-1', email: 'jugador@gmail.com' } }, error: null
    }));
    window.Auth._sb = cliente;
    const perfilOriginal = window.Auth.cargarPerfil;
    window.Auth.cargarPerfil = vi.fn(async () => null);
    try {
      await window.Auth.entrar('jugador@gmail.com', 'Clave12345');
      expect(cliente.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    } finally {
      window.Auth.cargarPerfil = perfilOriginal;
    }
  });
});
