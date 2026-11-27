/* =====================================================================
   1.4.1 — Pruebas AISLADAS de los seis problemas reportados.
   No crean cuentas, no escriben en Supabase y no envían correos.
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8');
const supabaseJs = () => leer('js/core/supabase.js');
const perfilJs = () => leer('js/modulos/perfil.js');
const adminJs = () => leer('js/modulos/admin.js');
const appJs = () => leer('js/app.js');
const glJs = () => leer('js/core/gl.js');
const edgeJs = () => leer('supabase/functions/admin-crear-jugador/index.ts');
const sqlParticipantes = () => leer('supabase/migration-participantes-1.4.1.sql');

const reserva = {
  usuario: window.Auth.usuario,
  jugador: window.Auth.jugador,
  cargarPerfil: window.Auth.cargarPerfil,
  _sb: window.Auth._sb
};

function clienteFalso(opciones = {}) {
  const llamadas = { signInWithPassword: [], updateUser: [], rpc: [] };
  const usuario = { id: 'u-1', email: 'jugador@example.com', user_metadata: {} };
  return {
    llamadas,
    auth: {
      signInWithPassword: async args => {
        llamadas.signInWithPassword.push(args);
        return opciones.signIn
          ? opciones.signIn(args)
          : { data: { user: usuario }, error: null };
      },
      updateUser: async args => {
        llamadas.updateUser.push(args);
        return opciones.updateUser
          ? opciones.updateUser(args)
          : { error: null };
      },
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({}),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    rpc: async (nombre, args) => {
      llamadas.rpc.push({ nombre, args });
      return opciones.rpc
        ? opciones.rpc(nombre, args)
        : { data: { ok: true, inscritos: 2 }, error: null };
    }
  };
}

function cargarModuloPerfil({ GL, Auth }) {
  const Modulos = {};
  const EST = { calcularRendimiento: () => ({ pj: 0, pg: 0, pe: 0, pp: 0, partidosReales: 0, gf: 0, gc: 0, promGoles: 0, dif: 0, vallas: 0, tiros: 0, tirosPuerta: 0, promPos: 0, posN: 0, promPase: 0, paseN: 0, racha: {}, mejorVictoria: '', peorDerrota: '' }) };
  return new Function(
    'Modulos', 'GL', 'Auth', 'EST', 'icono', 'esc', 'iniciarIconos', 'PantallaAuth',
    perfilJs() + '\nreturn Modulos.perfil;'
  )(
    Modulos, GL, Auth, EST,
    () => '', valor => String(valor ?? ''), () => {},
    { estado() {}, aviso: null }
  );
}

function glPerfil({ sinGrupo = true } = {}) {
  return {
    skeleton: () => '',
    accesoDenegado: () => '',
    cargarContexto: async () => {},
    torneo: () => ({ id: 't-1', nombre: 'GOATS LATINOS', temporada: '2026' }),
    esAdmin: () => false,
    grupoDeJugador: () => sinGrupo ? null : { id: 'g-1', nombre: 'Grupo A' },
    letraGrupo: g => String((g && g.nombre) || '').replace(/^Grupo\s+/i, ''),
    partidos: async () => [],
    jugador: () => null,
    grupos: () => [],
    jugadores: () => [],
    clasificacion: () => [],
    posicion: () => null,
    avatarHTML: () => '',
    banderaHTML: () => '',
    etiquetaZona: () => '',
    horarioJugador: () => '',
    zonaJugador: () => 'America/Managua',
    tel: { e164Jugador: () => '', paisJugador: () => 'NI', esValido: () => false },
    mensaje: e => String((e && e.message) || e),
    error: () => '',
    badge: texto => '<span>' + String(texto ?? '') + '</span>',
    vacio: () => '',
    linkWhatsapp: () => '',
    signo: v => String(v),
    abrirModal: () => ({})
  };
}

afterEach(() => {
  window.Auth.usuario = reserva.usuario;
  window.Auth.jugador = reserva.jugador;
  window.Auth.cargarPerfil = reserva.cargarPerfil;
  window.Auth._sb = reserva._sb;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('1.4.1 — perfil incompleto', () => {
  it('un perfil existente sin grupo muestra el perfil completo y solo informa la asignación pendiente', async () => {
    const Auth = {
      usuario: { id: 'u-1', email: 'juan@example.com', user_metadata: { nombre_usuario: 'JUAN' } },
      jugador: { id: 'j-1', rol: 'jugador', nombre_usuario: 'JUAN' },
      perfilPendienteTelefono: null
    };
    const mod = cargarModuloPerfil({ GL: glPerfil({ sinGrupo: true }), Auth });
    const el = document.createElement('div');
    await mod.render(el);

    expect(el.textContent).not.toContain('Tu registro aún no está completo');
    expect(el.textContent).not.toContain('Tu perfil ya está creado');
    expect(el.textContent).toContain('Perfil del jugador');
    expect(el.textContent).toContain('JUAN');
    expect(el.textContent).toContain('Pendiente de asignación');
    expect(el.textContent).toContain('Tu perfil está activo. Un administrador te asignará a un grupo cuando corresponda.');
    expect(el.querySelector('[data-editar]')).not.toBeNull();
    expect(el.querySelector('[data-actualizar-nombre]')).toBeNull();
    expect(el.querySelector('[data-reintentar-perfil]')).toBeNull();
    expect(el.querySelector('#h2h-rival').disabled).toBe(true);
  });

  it('sin perfil conserva el estado de recuperación telefónica', async () => {
    const Auth = {
      usuario: { id: 'u-2', email: 'ana@example.com', user_metadata: { nombre_usuario: 'ANA' } },
      jugador: null,
      perfilPendienteTelefono: { motivo: 'sin_telefono_en_metadata' }
    };
    const mod = cargarModuloPerfil({ GL: glPerfil(), Auth });
    const el = document.createElement('div');
    await mod.render(el);

    expect(el.textContent).toContain('Tu cuenta existe, pero el perfil quedó pendiente');
    expect(el.querySelector('[data-recuperar-telefono]')).not.toBeNull();
    expect(el.textContent).not.toContain('Tu perfil ya está creado');
  });
});

describe('1.4.1 — cambio de contraseña', () => {
  it('verifica la actual con signInWithPassword y actualiza con updateUser', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', email: 'jugador@example.com' };
    window.Auth.jugador = { id: 'j-1', rol: 'jugador' };
    window.Auth.cargarPerfil = vi.fn(async () => {
      window.Auth.jugador = { id: 'j-1', rol: 'jugador' };
    });

    await expect(window.Auth.cambiarContrasena('vieja123', 'nueva456', 'nueva456')).resolves.toBe(true);

    expect(cliente.llamadas.signInWithPassword).toEqual([{
      email: 'jugador@example.com', password: 'vieja123'
    }]);
    expect(cliente.llamadas.updateUser).toEqual([{ password: 'nueva456' }]);
    expect(cliente.llamadas.rpc).toHaveLength(0);
  });

  it('nunca cambia la clave compartida de una cuenta administradora', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-admin', email: 'admin@example.com' };
    window.Auth.jugador = { id: 'j-admin', rol: 'admin' };
    window.Auth.cargarPerfil = vi.fn(async () => {
      window.Auth.jugador = { id: 'j-admin', rol: 'admin' };
    });

    await expect(window.Auth.cambiarContrasena('vieja123', 'nueva456', 'nueva456'))
      .rejects.toThrow(/cuentas administradoras/);
    expect(cliente.llamadas.signInWithPassword).toHaveLength(0);
    expect(cliente.llamadas.updateUser).toHaveLength(0);
  });

  it('rechaza contraseñas nuevas que no coinciden antes de llamar a Auth', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', email: 'jugador@example.com' };
    window.Auth.jugador = { id: 'j-1', rol: 'jugador' };

    await expect(window.Auth.cambiarContrasena('vieja123', 'nueva456', 'otra456'))
      .rejects.toThrow(/no coinciden/);
    expect(cliente.llamadas.signInWithPassword).toHaveLength(0);
    expect(cliente.llamadas.updateUser).toHaveLength(0);
  });

  it('el editor del perfil ofrece el cambio solo al jugador y usa el método oficial', () => {
    const codigo = perfilJs();
    expect(codigo).toContain('id="perfil-clave-actual"');
    expect(codigo).toContain('id="perfil-clave-nueva"');
    expect(codigo).toContain('id="perfil-clave-confirmar"');
    expect(codigo).toContain("Auth.jugador.rol !== 'admin'");
    expect(codigo).toContain('await Auth.cambiarContrasena(claveActual, claveNueva, claveConfirmar)');
  });
});

describe('1.4.1 — grupos opcionales', () => {
  it('el alta principal permite dejar el grupo sin asignar', () => {
    const codigo = adminJs();
    expect(codigo).toContain('Sin asignar (pendiente)');
    expect(codigo).not.toContain("No hay grupos disponibles. Creá los grupos desde Configuración.");
    expect(codigo).toContain('const grupoEl = fondo.querySelector(\'#ag-grupo\')');
    expect(codigo).toContain('creado; pendiente de asignar grupo.');
  });

  it('el alta global no inscribe ni asigna grupo automáticamente', () => {
    const codigo = adminJs();
    expect(codigo).toContain('const soloGlobal = cfg.soloGlobal === true;');
    expect(codigo).toContain('torneoActual ? torneoActual.id : null');
    expect(codigo).toContain('El registro es global');
    expect(codigo).not.toContain('const grupoId = grupo || null;');
  });

  it('el servidor ya aceptaba grupo ausente y ahora informa el estado pendiente', () => {
    const codigo = edgeJs();
    expect(codigo).toContain('if (!grupoId) return { ok: true, yaExistia: true };');
    expect(codigo).toContain("'Jugador creado; pendiente de asignar grupo.'");
  });
});

describe('1.4.1 — participantes por torneo', () => {
  it('la migración propuesta es aditiva y no reescribe torneos ni grupos', () => {
    const sql = sqlParticipantes();
    expect(sql).toContain('PROPUESTA — NO APLICADA');
    expect(sql).toContain('create table if not exists public.torneo_participantes');
    expect(sql).toContain('primary key (torneo_id, jugador_id)');
    expect(sql).toContain('from public.grupo_jugadores gj');
    expect(sql).not.toContain('update public.torneos');
    expect(sql).not.toContain('update public.jugadores');
    expect(sql).not.toContain('delete from public.grupo_jugadores');
    expect(sql).toContain('create or replace function public.gl_inscribir_participantes');
    expect(sql).toContain('grant execute on function public.gl_inscribir_participantes(uuid, uuid[])');
  });

  it('el formulario de creación inscribe la selección visual solo después de crear el torneo', () => {
    const codigo = adminJs();
    expect(codigo).toContain('const participantes = Array.from(seleccionados)');
    expect(codigo).toContain('Auth.inscribirParticipantes(torneoId, participantes)');
    expect(codigo.indexOf('gl_crear_torneo')).toBeLessThan(codigo.indexOf('Auth.inscribirParticipantes'));
  });

  it('Auth envía una sola vez cada participante y traduce la falta de migración', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-admin', email: 'admin@example.com' };

    const resultado = await window.Auth.inscribirParticipantes('t-9', ['j-1', 'j-2', 'j-1']);
    expect(resultado).toEqual({ ok: true, inscritos: 2, datos: { ok: true, inscritos: 2 } });
    expect(cliente.llamadas.rpc[0]).toEqual({
      nombre: 'gl_inscribir_participantes',
      args: { p_torneo_id: 't-9', p_jugador_ids: ['j-1', 'j-2'] }
    });
  });
});

describe('1.4.1 — autorización de confirmación de teléfonos', () => {
  it('distingue sesión vencida, falta de rol y error de permisos de fila', () => {
    expect(window.Auth._mensajeRpcTelefono({ message: 'Sesión no autenticada' }))
      .toMatch(/sesión venció/i);
    expect(window.Auth._mensajeRpcTelefono({ message: 'No autorizado' }))
      .toMatch(/No tenés autorización.*administrador activa/);
    const permisos = window.Auth._mensajeRpcTelefono({ message: 'permission denied' });
    expect(permisos).toMatch(/estado del teléfono por permisos de la fila/);
    expect(permisos).toMatch(/cuenta administradora esté activa/);
    expect(permisos).not.toMatch(/Ingresá con una cuenta de administrador/);
  });

  it('la autoridad sigue siendo la RPC del servidor', () => {
    const sql = leer('supabase/migration-telefonos-2.2.sql');
    expect(sql).toContain('not public.gl_es_admin()');
    expect(supabaseJs()).toContain("rpc('gl_confirmar_e164'");
  });
});

describe('1.4.1 — navegación sin refresh', () => {
  it('el router limpia el módulo anterior y fuerza contexto fresco', () => {
    const codigo = appJs();
    expect(codigo).toContain('anterior.destruir()');
    expect(codigo).toContain('await GL.cargarContexto(true)');
    expect(codigo).toContain('sincronizarChrome()');
    expect(codigo).toContain('cambioDeSesion || evento ===');
  });

  it('un refresh de token con la misma sesión no fuerza un nuevo render', () => {
    const codigo = appJs();
    const inicio = codigo.indexOf("window.addEventListener('gl:auth'");
    const fin = codigo.indexOf("window.addEventListener('load'", inicio);
    const bloque = codigo.slice(inicio, fin);
    expect(bloque).toContain('cambioDeSesion');
    expect(bloque).toContain('GL.invalidar()');
    expect(bloque.indexOf('if (cambioDeSesion')).toBeLessThan(bloque.indexOf('await mostrar(_rutaActual)'));
    expect(bloque.indexOf('GL.invalidar()')).toBeGreaterThan(bloque.indexOf('await mostrar(_rutaActual)'));
  });

  it('GL.error reintenta la vista en lugar de recargar la página', () => {
    const codigo = glJs();
    expect(codigo).not.toContain('onclick="location.reload()"');
    expect(codigo).toContain('data-reintentar-vista');
    expect(appJs()).toContain("closest('[data-reintentar-vista]')");
    expect(appJs()).toContain('async function reintentarVista()');

    const html = window.GL.error('fallo de prueba');
    const contenedor = document.createElement('div');
    contenedor.innerHTML = html;
    const boton = contenedor.querySelector('[data-reintentar-vista]');
    expect(boton).not.toBeNull();
    expect(boton.getAttribute('onclick')).toBeNull();
  });

  it('los módulos con recursos globales exponen destruir()', () => {
    expect(leer('js/modulos/stats-globales.js')).toContain('destruir() {');
    expect(leer('js/modulos/dashboard-admin.js')).toContain('destruir() {');
    expect(leer('js/modulos/notificaciones.js')).toContain('Mod.desuscribir()');
    expect(adminJs()).toContain('cerrarMenuAcciones(); } catch');
  });
});

describe('1.4.1 — versión pública', () => {
  it('mantiene el historial y publica 1.6.0 en config y cache-busting', () => {
    const config = leer('js/core/config.js');
    const index = leer('index.html');
    expect(config).toContain("VERSION: '1.6.0'");
    expect(index.match(/\?v=1\.6\.0/g)).toHaveLength(7);
    expect(index).not.toContain('?v=1.4.2');
    expect(index).not.toContain('?v=1.4.1');
  });
});
