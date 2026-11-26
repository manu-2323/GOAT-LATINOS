import { readFileSync } from 'node:fs';
import { beforeEach, describe, it, expect } from 'vitest';

const VERSION = '1.13.17';
const leer = ruta => readFileSync(ruta, 'utf8');
const sql121 = () => leer('supabase/migration-telefonos-1.2.1.sql');
const frontendAuth = () => leer('js/core/supabase.js');

/* Cliente falso, sin credenciales privilegiadas. Permite comprobar las
   llamadas reales de registro, recuperación y RPC sin Supabase remoto. */
function cadena(resultado) {
  const q = {
    select() { return q; },
    eq() { return q; },
    order() { return q; },
    limit() { return q; },
    maybeSingle() { return Promise.resolve(resultado); },
    single() { return Promise.resolve(resultado); },
    then(res, rej) { return Promise.resolve(resultado).then(res, rej); }
  };
  return q;
}

function clienteFalso(opciones = {}) {
  const llamadas = { rpc: [], signUp: [], insert: [], update: [], deleteUser: [], updateUser: [] };
  const usuario = opciones.usuario || {
    id: 'u-1', email: 'juan@example.com', user_metadata: {}
  };
  return {
    llamadas,
    auth: {
      admin: {
        deleteUser: async id => { llamadas.deleteUser.push(id); return {}; }
      },
      signUp: async args => {
        llamadas.signUp.push(args);
        if (opciones.signUp) return opciones.signUp(args);
        return { data: { user: { ...usuario, user_metadata: args.options.data } }, error: null };
      },
      signInWithPassword: async () => ({ data: { user: usuario }, error: null }),
      getUser: async () => ({ data: { user: usuario }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
      updateUser: async args => {
        llamadas.updateUser.push(args);
        if (opciones.updateUser) return opciones.updateUser(args);
        return { error: null };
      }
    },
    rpc: async (nombre, args) => {
      llamadas.rpc.push({ nombre, args });
      if (nombre === 'gl_nombre_disponible') return { data: { ok: true }, error: null };
      if (opciones.rpc) return opciones.rpc(nombre, args);
      return { data: {}, error: null };
    },
    from: tabla => ({
      select() {
        const r = opciones.select
          ? opciones.select(tabla)
          : { data: [], error: null };
        return cadena(r);
      },
      insert(fila) {
        llamadas.insert.push({ tabla, fila });
        const r = opciones.insert
          ? opciones.insert(tabla, fila)
          : { data: { id: 'j-1', ...fila }, error: null };
        return cadena(r);
      },
      update(datos) {
        llamadas.update.push({ tabla, datos });
        const r = opciones.update
          ? opciones.update(tabla, datos)
          : { data: { id: 'j-1' }, error: null };
        return cadena(r);
      }
    })
  };
}

beforeEach(() => {
  window.Auth.usuario = null;
  window.Auth.jugador = null;
  window.Auth._sb = null;
  window.Auth._verificando = {};
  window.Auth._perfilEnCurso = null;
  window.Auth.perfilPendienteTelefono = null;
  /* El contexto global depende de sb y no del cliente inyectado. */
  window.GL.cargarContexto = async () => null;
  window.GL.torneo = () => null;
  window.GL.invalidar = () => {};
});

describe('GOATS LATINOS 1.2.1 — teléfonos en frontend', () => {
  it('acepta 8108-5555 de Nicaragua y la normaliza a E.164 con +', () => {
    const v = window.GL.tel.validar('8108-5555', 'NI', true);
    expect(v.ok).toBe(true);
    expect(v.e164).toBe('+50581085555');
    expect(v.nacional).toBe('8108-5555');
    expect(v.pais).toBe('NI');
    expect(window.GL.tel.normalizar('8108-5555', 'NI')).toBe('50581085555');
  });

  it('acepta un número internacional válido sin reescribir su prefijo', () => {
    const v = window.GL.tel.validar('+505 8108 5555', 'NI', true);
    expect(v.ok).toBe(true);
    expect(v.e164).toBe('+50581085555');
    expect(window.GL.tel.prefijo('NI')).toBe('505');
  });

  it('rechaza un número incompleto con motivo explícito', () => {
    const v = window.GL.tel.validar('8108', 'NI', true);
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe('incompleto');
    expect(v.mensaje).toContain('incompleto');
  });

  it('exige teléfono cuando el formulario lo marca obligatorio', () => {
    const v = window.GL.tel.validar('', 'NI', true);
    expect(v.ok).toBe(false);
    expect(v.requerido).toBe(true);
    expect(v.mensaje).toContain('obligatorio');
    const opcional = window.GL.tel.validar('', 'NI', false);
    expect(opcional.ok).toBe(true);
    expect(opcional.e164).toBe('');
  });

  it('rechaza un prefijo que no corresponde al país elegido', () => {
    const v = window.GL.tel.validar('+505 8108 5555', 'CR', true);
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe('prefijo');
    expect(v.mensaje).toContain('+506');
  });

  it('rechaza el cero inicial del formato nacional', () => {
    const v = window.GL.tel.validar('08108555', 'NI', true);
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe('cero_inicial');
  });

  it('revalida el número al cambiar de país y de vuelta (cambio repetido)', () => {
    const internacional = '+505 8108 5555';
    expect(window.GL.tel.validar(internacional, 'NI', true).ok).toBe(true);
    expect(window.GL.tel.validar(internacional, 'CR', true).ok).toBe(false);
    expect(window.GL.tel.validar(internacional, 'NI', true).ok).toBe(true);

    const j = {
      telefono: '50581085555', telefono_e164: '+50581085555',
      pais: 'NI', pais_telefono: 'NI', telefono_valido_plan: null
    };
    expect(window.GL.tel.cambiosSiNuevos('8108-5555', 'NI', j))
      .toEqual({ telefono_valido_plan: true });
    expect(window.GL.tel.cambiosSiNuevos('8108-5555', 'NI', { ...j, telefono_valido_plan: true }))
      .toEqual({});
    expect(leer('js/modulos/perfil.js')).toContain('GL.tel.cambiosSiNuevos(');
  });

  it('canonicaliza dos escrituras distintas del mismo número (base del duplicado)', () => {
    const a = window.GL.tel.campos('8108-5555', 'NI');
    const b = window.GL.tel.campos('+505 8108 5555', 'NI');
    expect(a.telefono_e164).toBe('+50581085555');
    expect(b.telefono_e164).toBe(a.telefono_e164);
    expect(sql121()).toContain('jugadores_e164_canonicalizado_uniq');
    expect(frontendAuth()).toContain('jugadores_e164_canonicalizado_uniq');
    expect(leer('js/modulos/admin.js')).toContain('jugadores_e164_canonicalizado_uniq');
  });

  it('un formato válido NO acredita titularidad', () => {
    const campos = window.GL.tel.campos('8108-5555', 'NI');
    expect(campos.telefono_valido_plan).toBe(true);
    expect(campos).not.toHaveProperty('telefono_verificado');
    expect(frontendAuth()).not.toMatch(/telefono_verificado\s*:\s*.*(?:esValido|isValid|validoPlan)/);
    expect(leer('js/modulos/perfil.js')).not.toContain('telefono_verificado:');
    expect(leer('js/modulos/perfil.js')).toContain('Titularidad confirmada');
    expect(leer('js/modulos/perfil.js')).toContain('titularidad sin confirmar');
  });

  it('registro sin sesión inmediata devuelve requiereConfirmacion sin simular sesión', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    const r = await window.Auth.registrar(
      'Juan Perez', 'juan@example.com', 'segura123', 'NI', '8108-5555', 'America/Managua'
    );
    expect(r.usuario).toBeNull();
    expect(r.requiereConfirmacion).toBe(true);
    expect(r.mensaje).toContain('correo');
    expect(cliente.llamadas.insert).toHaveLength(0);
    expect(cliente.llamadas.signUp[0].options.data.telefono_e164).toBe('+50581085555');
    expect(cliente.llamadas.signUp[0].options.data).not.toHaveProperty('telefono_verificado');

    const codigo = frontendAuth();
    expect(codigo).toContain('options: { data: metadata }');
    expect(codigo).toContain('_crearPerfilDesdeMetadata');
    expect(leer('js/ui/auth.js')).toContain('resultado.requiereConfirmacion');
  });

  it('un teléfono duplicado falla de verdad y nunca dice «Cuenta creada»', async () => {
    const cliente = clienteFalso({
      signUp: args => ({
        data: {
          user: { id: 'u-duplicado', user_metadata: args.options.data },
          session: { access_token: 'temporal' }
        },
        error: null
      }),
      insert: () => ({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "jugadores_e164_canonicalizado_uniq"'
        }
      })
    });
    window.Auth._sb = cliente;

    let error;
    try {
      await window.Auth.registrar(
        'Juan Perez', 'juan@example.com', 'segura123', 'NI', '8108-5555', 'America/Managua'
      );
    } catch (e) { error = e; }

    expect(error).toBeTruthy();
    expect(error.code).toBe('TELEFONO_DUPLICADO');
    expect(error.cuentaCreadaSinPerfil).toBe(true);
    expect(error.message).not.toContain('Cuenta creada');
    expect(cliente.llamadas.signUp).toHaveLength(1);
    expect(cliente.llamadas.deleteUser).toHaveLength(0);
    expect(window.Auth.jugador).toBeNull();
  });

  it('recupera el perfil desde user_metadata sin duplicar cuenta ni borrar usuarios', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    await window.Auth.registrar(
      'Juan Perez', 'juan@example.com', 'segura123', 'NI', '8108-5555', 'America/Managua'
    );
    window.Auth.usuario = {
      id: 'u-1', email: 'juan@example.com',
      user_metadata: cliente.llamadas.signUp[0].options.data
    };
    window.Auth.jugador = null;
    const perfil = await window.Auth.cargarPerfil(true);

    expect(perfil).toBeTruthy();
    expect(cliente.llamadas.insert).toHaveLength(1);
    expect(cliente.llamadas.insert[0].fila.telefono_e164).toBe('+50581085555');
    expect(cliente.llamadas.insert[0].fila).not.toHaveProperty('telefono_verificado');
    expect(cliente.llamadas.signUp).toHaveLength(1);
    expect(cliente.llamadas.deleteUser).toHaveLength(0);
  });

  it('llama a la RPC con los cinco argumentos exactos y registra la auditoría', async () => {
    const cliente = clienteFalso({
      rpc: (nombre, args) => nombre === 'gl_confirmar_e164'
        ? {
            data: {
              nuevo: args.p_e164,
              titularidad_confirmada: args.p_confirmar_titularidad,
              validacion_plan: 'pendiente_js'
            },
            error: null
          }
        : { data: {}, error: null }
    });
    window.Auth._sb = cliente;
    const r = await window.Auth.confirmarE164({
      jugadorId: 'j-1',
      e164: '+50581085555',
      motivo: 'Llamada verificada por administración',
      confirmarTitularidad: true,
      evidencia: 'ticket-42'
    });
    const llamada = cliente.llamadas.rpc.find(x => x.nombre === 'gl_confirmar_e164');
    expect(llamada).toBeTruthy();
    expect(llamada.args).toEqual({
      p_jugador_id: 'j-1',
      p_e164: '+50581085555',
      p_motivo: 'Llamada verificada por administración',
      p_confirmar_titularidad: true,
      p_evidencia: 'ticket-42'
    });
    expect(r.validacion_plan).toBe('pendiente_js');
    expect(sql121()).toContain('create or replace function public.gl_confirmar_e164(');
    expect(sql121()).toContain('insert into auditoria.telefonos_confirmados');
  });

  it('la RPC sin confirmar titularidad deja el formato válido sin verificación', async () => {
    const cliente = clienteFalso({
      rpc: (nombre, args) => nombre === 'gl_confirmar_e164'
        ? { data: { titularidad_confirmada: args.p_confirmar_titularidad }, error: null }
        : { data: {}, error: null }
    });
    window.Auth._sb = cliente;
    const r = await window.Auth.confirmarE164({
      jugadorId: 'j-1', e164: '+50581085555', motivo: 'Solo normalización',
      confirmarTitularidad: false
    });
    expect(r.titularidad_confirmada).toBe(false);
    const llamada = cliente.llamadas.rpc.find(x => x.nombre === 'gl_confirmar_e164');
    expect(llamada.args.p_evidencia).toBeNull();
    expect(llamada.args.p_confirmar_titularidad).toBe(false);
    expect(sql121()).not.toContain('telefono_verificado = true');
  });

  it('mapea errores de autorización y duplicidad de la RPC con mensaje claro', async () => {
    const sinPermiso = clienteFalso({
      rpc: (nombre) => nombre === 'gl_confirmar_e164'
        ? { data: null, error: { message: 'no autorizado' } }
        : { data: {}, error: null }
    });
    window.Auth._sb = sinPermiso;
    await expect(window.Auth.confirmarE164({
      jugadorId: 'j-1', e164: '+50581085555', motivo: 'Prueba'
    })).rejects.toThrow(/No tenés autorización/);

    const duplicado = clienteFalso({
      rpc: (nombre) => nombre === 'gl_confirmar_e164'
        ? { data: null, error: { message: 'E.164 ya existe en otro jugador (conflicto concurrente)' } }
        : { data: {}, error: null }
    });
    window.Auth._sb = duplicado;
    await expect(window.Auth.confirmarE164({
      jugadorId: 'j-1', e164: '+50581085555', motivo: 'Prueba'
    })).rejects.toThrow(/ya está registrado en otro jugador/);
  });

  it('recalcula telefono_valido_plan sin tocar telefono_verificado', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    const ok = await window.Auth.recalcularTelefonoValidoPlan('j-1', '+50581085555');
    expect(ok).toBe(true);
    expect(cliente.llamadas.update).toHaveLength(1);
    expect(cliente.llamadas.update[0].datos).toEqual({ telefono_valido_plan: true });
    expect(cliente.llamadas.update[0].datos).not.toHaveProperty('telefono_verificado');
    expect(sql121()).toContain('telefono_valido_plan = null');
    expect(sql121()).toContain("'validacion_plan', 'pendiente_js'");
  });

  it('genera wa.me solo con jugador válido y se niega sin teléfono', () => {
    const jugador = {
      telefono_e164: '+50581085555', pais: 'NI', pais_telefono: 'NI',
      nombre_usuario: 'Joaquín'
    };
    const html = window.GL.linkWhatsapp(jugador);
    expect(html).toContain('https://wa.me/50581085555');
    expect(html).not.toMatch(/wa\.me\/[^\"]*[- +]/);
    expect(html.toLowerCase()).not.toContain('verificado');

    expect(window.GL.linkWhatsapp({ nombre_usuario: 'Sin teléfono' })).toBe('');
    expect(window.GL.linkWhatsapp('8108-5555')).toBe('');
    expect(window.GL.tel.e164Jugador({ telefono: '50581085555', pais: 'NI' }))
      .toBe('+50581085555');
  });

  it('fija una sola versión de libphonenumber-js en todos los artefactos', () => {
    const index = leer('index.html');
    expect(index).toContain('libphonenumber-js@' + VERSION + '/bundle/libphonenumber-min.js');
    expect(index).not.toMatch(/libphonenumber-js@latest/);

    const pkg = JSON.parse(leer('package.json'));
    expect(pkg.version).toBe('1.2.1');
    expect(pkg.devDependencies['libphonenumber-js']).toBe(VERSION);

    const lock = JSON.parse(leer('package-lock.json'));
    expect(lock.version).toBe('1.2.1');
    expect(lock.packages[''].devDependencies['libphonenumber-js']).toBe(VERSION);
    expect(lock.packages['node_modules/libphonenumber-js'].version).toBe(VERSION);

    expect(leer('supabase/functions/admin-crear-jugador/index.ts'))
      .toContain('libphonenumber-js@' + VERSION + '/min');
  });

  /* ------------------------- FASE 2.2 ------------------------- */

  it('2.2: un error de SELECT nunca desencadena una inserción', async () => {
    const cliente = clienteFalso({
      select: () => ({ data: null, error: { message: 'permission denied for table jugadores' } })
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', user_metadata: { telefono_e164: '+50581085555' } };
    let error;
    try { await window.Auth.cargarPerfil(true); } catch (e) { error = e; }
    expect(error).toBeTruthy();
    expect(error.message).toContain('No se pudo consultar tu perfil');
    expect(cliente.llamadas.insert).toHaveLength(0);
    expect(window.Auth.jugador).toBeNull();
  });

  it('2.2: dos cargas concurrentes comparten una sola consulta y una sola inserción', async () => {
    let resolver;
    const cliente = clienteFalso({
      select: () => new Promise(resolve => { resolver = resolve; })
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = {
      id: 'u-conc', email: 'u@example.com',
      user_metadata: { nombre_usuario: 'U', telefono_e164: '+50581085555', pais: 'NI' }
    };
    const a = window.Auth.cargarPerfil(true);
    const b = window.Auth.cargarPerfil(true);
    await Promise.resolve();
    resolver({ data: [], error: null });
    const [pa, pb] = await Promise.all([a, b]);
    expect(pa).toBe(pb);
    expect(cliente.llamadas.insert).toHaveLength(1);
    expect(cliente.llamadas.insert[0].fila.user_id).toBe('u-conc');
  });

  it('2.2: adopta el perfil existente ante un 23505 de user_id sin insertar un duplicado', async () => {
    let consultas = 0;
    let conflicto = true;
    const cliente = clienteFalso({
      select: () => {
        consultas += 1;
        if (consultas === 1) return { data: [], error: null };
        return { data: [{ id: 'j-adoptado', user_id: 'u-adopt' }], error: null };
      },
      insert: () => {
        expect(conflicto).toBe(true);
        conflicto = false;
        return {
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "jugadores_user_id_uniq"'
          }
        };
      }
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = {
      id: 'u-adopt', email: 'adopt@example.com',
      user_metadata: { nombre_usuario: 'ADOPT', telefono_e164: '+50581085555', pais: 'NI' }
    };
    const perfil = await window.Auth.cargarPerfil(true);
    expect(perfil.id).toBe('j-adoptado');
    expect(window.Auth.jugador.id).toBe('j-adoptado');
    expect(cliente.llamadas.insert).toHaveLength(1);
    expect(consultas).toBe(2);
    expect(window.Auth.perfilPendienteTelefono).toBeNull();
  });

  it('2.2: recupera una cuenta Auth sin perfil usando otro teléfono', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = {
      id: 'u-rec', email: 'rec@example.com',
      user_metadata: { nombre_usuario: 'REC', telefono_e164: '+50581085555', pais: 'NI' }
    };
    const perfil = await window.Auth.recuperarPerfilConTelefono('8877-2233', 'NI');
    expect(perfil).toBeTruthy();
    expect(cliente.llamadas.updateUser).toHaveLength(1);
    expect(cliente.llamadas.updateUser[0].data.telefono_e164).toBe('+50588772233');
    expect(cliente.llamadas.insert).toHaveLength(1);
    expect(cliente.llamadas.insert[0].fila.telefono_e164).toBe('+50588772233');
    expect(cliente.llamadas.deleteUser).toHaveLength(0);
  });

  it('2.2: RPC correcta con recálculo fallido devuelve estado parcial y el reintento no repite la RPC', async () => {
    let falloRecalculo = true;
    const cliente = clienteFalso({
      rpc: (nombre, args) => nombre === 'gl_confirmar_e164'
        ? { data: { nuevo: args.p_e164, titularidad_confirmada: true, recalculo_requerido: true }, error: null }
        : { data: {}, error: null },
      update: (tabla, datos) => falloRecalculo
        ? { data: null, error: { message: 'network down' } }
        : { data: { id: 'j-1', ...datos }, error: null }
    });
    window.Auth._sb = cliente;
    const estado = await window.Auth.confirmarYRecalcular({
      jugadorId: 'j-1', e164: '+50581085555', motivo: 'Prueba', confirmarTitularidad: true
    });
    expect(estado.confirmada).toBe(true);
    expect(estado.recalculoOk).toBe(false);
    expect(estado.requiereRecalculo).toBe(true);
    expect(estado.errorRecalculo).toBe('No hay conexión con el servidor. Revisá tu internet.');
    expect(cliente.llamadas.rpc.filter(x => x.nombre === 'gl_confirmar_e164')).toHaveLength(1);

    falloRecalculo = false;
    const reintentado = await window.Auth.reintentarRecalculo('j-1', '+50581085555');
    expect(reintentado.recalculoOk).toBe(true);
    expect(cliente.llamadas.rpc.filter(x => x.nombre === 'gl_confirmar_e164')).toHaveLength(1);
    expect(cliente.llamadas.update).toHaveLength(2);
    expect(cliente.llamadas.update.every(x => Object.keys(x.datos).join() === 'telefono_valido_plan')).toBe(true);
  });
});
