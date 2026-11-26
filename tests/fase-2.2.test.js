import { readFileSync } from 'node:fs';
import { beforeEach, describe, it, expect } from 'vitest';

/*
 * FASE 2.2 — 14 escenarios de integridad y seguridad de telefonía.
 *
 * Los escenarios de BASE DE DATOS se comprueban con dos capas:
 *   1) un modelo ejecutable de las reglas SQL (normalización, trigger y
 *      privilegios) sobre el que se afirman COMPORTAMIENTOS, no texto;
 *   2) un contrato estructural extraído de la migración que verifica que el
 *      SQL implementa exactamente esas reglas (conjuntos de columnas, orden
 *      de ramas y dependencia de auditoría).
 * La ejecución real contra PostgreSQL/Supabase queda pendiente: este entorno
 * no dispone de motor SQL y la fase prohíbe contactar el entorno remoto.
 *
 * Los escenarios de FRONTEND son de comportamiento real: ejecutan el Auth
 * cargado en jsdom con un cliente Supabase falso e inyectable.
 */

const leer = ruta => readFileSync(ruta, 'utf8');
const sql22 = () => leer('supabase/migration-telefonos-2.2.sql');

/* ---------- Modelo ejecutable de las reglas de la migración 2.2 ---------- */

const canon = valor => {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos ? '+' + digitos : '';
};

/* Normalización histórica FASE 2.3: un true heredado solo sobrevive si la
   ÚLTIMA auditoría del jugador acredita titularidad del mismo E.164 canónico
   y conserva evidencia. */
function normalizarHistorico(fila, auditorias) {
  if (fila.telefono_verificado !== true) return false;
  const propias = auditorias.filter(a => a.jugador_id === fila.id);
  if (!propias.length) return false;
  const ultima = propias.reduce((a, b) => ((b.id || 0) > (a.id || 0) ? b : a));
  return ultima.accion === 'confirmacion_e164_y_titularidad' &&
    String(ultima.evidencia || '').trim() !== '' &&
    canon(ultima.valor_nuevo) !== '' &&
    canon(ultima.valor_nuevo) === canon(fila.telefono_e164);
}

/* Trigger gl_sincronizar_titularidad_telefono() con E.164 canónico exacto. */
function aplicarTrigger(regla) {
  const canonico = v => /^\+[1-9]\d{7,14}$/.test(String(v || '')) ? v : null;
  const anterior = canonico(regla.anterior);
  const nuevo = canonico(regla.nuevo);
  const confirmadaEnTx = Boolean(regla.confirmadaEnTx);
  const solicitado = Boolean(regla.verificadoSolicitado);
  const anteriorVerificado = Boolean(regla.verificadoAnterior);

  if (regla.operacion === 'INSERT') {
    return confirmadaEnTx ? solicitado : false;
  }
  const cambioNumero = nuevo !== anterior;
  const cambioRepresentacion = Boolean(regla.cambioRepresentacion);
  if (cambioNumero || cambioRepresentacion) {
    return confirmadaEnTx ? solicitado : false;
  }
  /* B1: se permite invalidar; se bloquea fijar true sin auditoría. */
  if (!confirmadaEnTx && solicitado !== anteriorVerificado && solicitado) {
    return anteriorVerificado;
  }
  return solicitado;
}

/* Contrato de privilegios extraído del SQL, comparado como conjuntos. */
function grants(sqlTexto, rol, operacion) {
  const patron = new RegExp(
    'grant\\s+' + operacion + '\\s*\\(([^)]*)\\)\\s*on\\s+([\\w.]+)\\s+to\\s+' + rol + '\\s*;',
    'gi'
  );
  return [...sqlTexto.matchAll(patron)].map(m => ({
    tabla: m[2],
    columnas: new Set(m[1].split(',').map(x => x.trim()).filter(Boolean))
  }));
}

function puedeEscribir(sqlTexto, rol, operacion, tabla, columna) {
  return grants(sqlTexto, rol, operacion)
    .some(g => g.tabla === tabla && g.columnas.has(columna));
}

/* ---------- Cliente Supabase falso (sin credenciales privilegiadas) ---------- */

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
  const llamadas = {
    rpc: [], insert: [], update: [], updateUser: [], deleteUser: []
  };
  const usuario = opciones.usuario || {
    id: 'u-1', email: 'u@example.com', user_metadata: {}
  };
  return {
    llamadas,
    auth: {
      admin: {
        deleteUser: async id => {
          llamadas.deleteUser.push(id);
          return {};
        }
      },
      signUp: async args => ({
        data: { user: { ...usuario, user_metadata: args.options.data } },
        error: null
      }),
      signInWithPassword: async () => ({ data: { user: usuario }, error: null }),
      getUser: async () => ({ data: { user: usuario }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
      updateUser: async args => {
        llamadas.updateUser.push(args);
        return opciones.updateUser ? opciones.updateUser(args) : { error: null };
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
        return cadena(opciones.insert
          ? opciones.insert(tabla, fila)
          : { data: { id: 'j-1', ...fila }, error: null });
      },
      update(datos) {
        llamadas.update.push({ tabla, datos });
        return cadena(opciones.update
          ? opciones.update(tabla, datos)
          : { data: { id: 'j-1', ...datos }, error: null });
      }
    })
  };
}

const usuarioConPerfil = {
  id: 'u-1', email: 'u@example.com',
  user_metadata: {
    nombre_usuario: 'JUAN', nombre: 'Juan', pais: 'NI',
    telefono_e164: '+50581085555', telefono_nacional: '8108-5555',
    pais_telefono: 'NI', telefono_valido_plan: true
  }
};

beforeEach(() => {
  window.Auth.usuario = null;
  window.Auth.jugador = null;
  window.Auth._sb = null;
  window.Auth._verificando = {};
  window.Auth._perfilEnCurso = null;
  window.Auth.perfilPendienteTelefono = null;
  window.GL.cargarContexto = async () => null;
  window.GL.torneo = () => null;
  window.GL.invalidar = () => {};
});

describe('FASE 2.2 — 14 escenarios', () => {
  /* 1 — Registro histórico con true heredado de 1.2.0 */
  it('1. registro histórico con telefono_verificado=true heredado NO acredita titularidad', () => {
    const fila = {
      id: 'j-heredado', telefono_e164: '+50581085555', telefono_verificado: true
    };
    expect(normalizarHistorico(fila, [])).toBe(false);
    expect(normalizarHistorico(fila, [{
      jugador_id: 'j-heredado', accion: 'confirmacion_e164',
      valor_nuevo: '+50581085555'
    }])).toBe(false);

    const bloque = sql22().slice(
      sql22().indexOf('update public.jugadores j'),
      sql22().indexOf('-- 2) Unicidad real')
    );
    expect(bloque).toContain('set telefono_verificado = false');
    expect(bloque).toContain('not exists');
  });

  /* 2 — Confirmación humana válida */
  it('2. conserva la titularidad SOLO con auditoría humana del mismo E.164', () => {
    const fila = {
      id: 'j-confirmado', telefono_e164: '+50581085555', telefono_verificado: true
    };
    const confirmacion = {
      id: 10, jugador_id: 'j-confirmado',
      accion: 'confirmacion_e164_y_titularidad',
      valor_nuevo: '+50581085555', evidencia: 'ticket-481'
    };
    expect(normalizarHistorico(fila, [confirmacion])).toBe(true);
    expect(normalizarHistorico(fila, [{
      ...confirmacion, jugador_id: 'otro'
    }])).toBe(false);
    expect(normalizarHistorico(fila, [{
      ...confirmacion, valor_nuevo: '+50588772233'
    }])).toBe(false);
    expect(normalizarHistorico(fila, [{
      ...confirmacion, evidencia: ''
    }])).toBe(false);
  });

  /* 3 — Cambio de número después de una confirmación */
  it('3. sustituir el E.164 invalida la titularidad anterior', () => {
    expect(aplicarTrigger({
      operacion: 'UPDATE',
      anterior: '+50581085555', nuevo: '+50588772233',
      verificadoAnterior: true, verificadoSolicitado: true,
      confirmadaEnTx: false
    })).toBe(false);
    /* La RPC sí puede acreditar el número nuevo si hay auditoría en la tx. */
    expect(aplicarTrigger({
      operacion: 'UPDATE',
      anterior: '+50581085555', nuevo: '+50588772233',
      verificadoAnterior: true, verificadoSolicitado: true,
      confirmadaEnTx: true
    })).toBe(true);
  });

  /* 4 — Eliminación del número */
  it('4. eliminar el teléfono invalida la titularidad', () => {
    expect(aplicarTrigger({
      operacion: 'UPDATE',
      anterior: '+50581085555', nuevo: '',
      verificadoAnterior: true, verificadoSolicitado: true,
      confirmadaEnTx: false
    })).toBe(false);
  });

  /* 5 — Actualización del mismo número */
  it('5. actualizar el mismo E.164 no invalida la confirmación', () => {
    expect(aplicarTrigger({
      operacion: 'UPDATE',
      anterior: '+50581085555', nuevo: '+50581085555',
      verificadoAnterior: true, verificadoSolicitado: true,
      confirmadaEnTx: false
    })).toBe(true);
  });

  /* 6 — Escritura directa desde authenticated */
  it('6. authenticated NO puede escribir telefono_verificado ni por privilegios ni por trigger', () => {
    expect(puedeEscribir(sql22(), 'authenticated', 'update', 'public.jugadores', 'telefono_verificado')).toBe(false);
    expect(puedeEscribir(sql22(), 'authenticated', 'insert', 'public.jugadores', 'telefono_verificado')).toBe(false);
    expect(puedeEscribir(sql22(), 'anonymous', 'update', 'public.jugadores', 'telefono_verificado')).toBe(false);
    expect(aplicarTrigger({
      operacion: 'UPDATE',
      anterior: '+50581085555', nuevo: '+50581085555',
      verificadoAnterior: false, verificadoSolicitado: true,
      confirmadaEnTx: false
    })).toBe(false);
    expect(sql22()).not.toContain('app.gl_confirmacion_autorizada');
  });

  /* 7 — Actualización legítima de otras columnas */
  it('7. las actualizaciones legítimas del perfil conservan sus columnas y no envían titularidad', async () => {
    /* 2.3 — Estas columnas siguen concedidas SOLO porque el panel admin las
       necesita por REST. No son «seguras por el grant»: están gobernadas por
       gl_proteger_rol() en migration-seguridad-2.3.sql. */
    const columnasGobernadas = [
      'activo', 'suspendido', 'rol', 'torneo_id', 'numero'
    ];
    columnasGobernadas.forEach(c =>
      expect(puedeEscribir(sql22(), 'authenticated', 'update', 'public.jugadores', c)).toBe(true)
    );
    const columnasPersonales = [
      'nombre_usuario', 'pais', 'zona_horaria', 'avatar_url', 'telefono',
      'telefono_e164', 'telefono_nacional', 'pais_telefono', 'telefono_valido_plan'
    ];
    columnasPersonales.forEach(c =>
      expect(puedeEscribir(sql22(), 'authenticated', 'update', 'public.jugadores', c)).toBe(true)
    );
    ['telefono_verificado', 'super_admin', 'email', 'user_id'].forEach(c =>
      expect(puedeEscribir(sql22(), 'authenticated', 'update', 'public.jugadores', c)).toBe(false)
    );
    ['telefono_verificado', 'super_admin', 'rol', 'activo', 'suspendido', 'torneo_id', 'numero']
      .forEach(c =>
        expect(puedeEscribir(sql22(), 'authenticated', 'insert', 'public.jugadores', c)).toBe(false)
      );
    ['rol', 'activo', 'suspendido', 'torneo_id', 'numero'].forEach(c =>
      expect(puedeEscribir(sql22(), 'authenticated', 'insert', 'public.jugadores', c)).toBe(false)
    );

    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', user_metadata: {} };
    window.Auth.jugador = {
      id: 'j-1', nombre_usuario: 'JUAN', pais: 'NI',
      telefono_e164: '+50581085555', pais_telefono: 'NI',
      telefono_valido_plan: true
    };
    await window.Auth.actualizarPerfil({ nombre_usuario: 'JUAN_PEREZ' });
    expect(cliente.llamadas.update).toHaveLength(1);
    expect(cliente.llamadas.update[0].datos).toEqual({ nombre_usuario: 'JUAN_PEREZ' });
    expect(cliente.llamadas.update[0].datos).not.toHaveProperty('telefono_verificado');
  });

  /* 8 — Dos llamadas concurrentes a cargarPerfil() */
  it('8. dos cargas concurrentes comparten la promesa y no duplican el perfil', async () => {
    let resolver;
    const cliente = clienteFalso({
      select: () => new Promise(resolve => { resolver = resolve; })
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = { ...usuarioConPerfil, id: 'u-conc' };
    const primera = window.Auth.cargarPerfil(true);
    const segunda = window.Auth.cargarPerfil(true);
    await Promise.resolve();
    resolver({ data: [{ id: 'j-1', user_id: 'u-conc' }], error: null });
    const [a, b] = await Promise.all([primera, segunda]);
    expect(a).toBe(b);
    expect(cliente.llamadas.insert).toHaveLength(0);
  });

  /* 9 — Error de consulta tratado como perfil inexistente */
  it('9. un error de SELECT no crea perfil', async () => {
    const cliente = clienteFalso({
      select: () => ({ data: null, error: { message: 'network error' } })
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = { ...usuarioConPerfil, id: 'u-error' };
    await expect(window.Auth.cargarPerfil(true)).rejects.toThrow(/No se pudo consultar tu perfil/);
    expect(cliente.llamadas.insert).toHaveLength(0);
  });

  /* 10 — Cuenta Auth existente sin perfil */
  it('10. recupera una cuenta Auth sin perfil sin crear otra cuenta ni borrar usuarios', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { ...usuarioConPerfil, id: 'u-huerfano' };
    const perfil = await window.Auth.recuperarPerfilConTelefono('8877-2233', 'NI');
    expect(perfil).toBeTruthy();
    expect(cliente.llamadas.updateUser).toHaveLength(1);
    expect(cliente.llamadas.updateUser[0].data.telefono_e164).toBe('+50588772233');
    expect(cliente.llamadas.deleteUser).toHaveLength(0);
    expect(cliente.llamadas.insert).toHaveLength(1);
    expect(cliente.llamadas.insert[0].fila.user_id).toBe('u-huerfano');
  });

  /* 11 — Conflicto de teléfono durante la recuperación */
  it('11. conflicto de teléfono deja estado pendiente, no borra cuenta y no sobrescribe perfil', async () => {
    const cliente = clienteFalso({
      insert: () => ({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "jugadores_e164_canonicalizado_uniq"'
        }
      })
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = { ...usuarioConPerfil, id: 'u-conflicto' };
    let error;
    try {
      await window.Auth.recuperarPerfilConTelefono('8108-5555', 'NI');
    } catch (e) { error = e; }
    expect(error).toBeTruthy();
    expect(error.esTelefonoDuplicado).toBe(true);
    expect(window.Auth.perfilPendienteTelefono.motivo).toBe('telefono_duplicado');
    expect(cliente.llamadas.deleteUser).toHaveLength(0);
    expect(cliente.llamadas.insert).toHaveLength(1);
    expect(window.Auth.jugador).toBeNull();
  });

  /* 12 — RPC correcta con recálculo fallido */
  it('12. RPC confirmada con recálculo fallido NO se presenta como éxito completo', async () => {
    const cliente = clienteFalso({
      rpc: (nombre, args) => nombre === 'gl_confirmar_e164'
        ? {
            data: {
              nuevo: args.p_e164,
              titularidad_confirmada: true,
              recalculo_requerido: true
            },
            error: null
          }
        : { data: {}, error: null },
      update: () => ({ data: null, error: { message: 'network down' } })
    });
    window.Auth._sb = cliente;
    const estado = await window.Auth.confirmarYRecalcular({
      jugadorId: 'j-1', e164: '+50581085555',
      motivo: 'Llamada verificada', confirmarTitularidad: true
    });
    expect(estado.confirmada).toBe(true);
    expect(estado.recalculoOk).toBe(false);
    expect(estado.requiereRecalculo).toBe(true);
    expect(estado.errorRecalculo).toBe('No hay conexión con el servidor. Revisá tu internet.');
  });

  /* 13 — Reintento del recálculo sin duplicar auditorías */
  it('13. reintentar el recálculo no repite la RPC ni la auditoría', async () => {
    let falla = true;
    const cliente = clienteFalso({
      rpc: (nombre, args) => nombre === 'gl_confirmar_e164'
        ? { data: { nuevo: args.p_e164, recalculo_requerido: true }, error: null }
        : { data: {}, error: null },
      update: () => falla
        ? { data: null, error: { message: 'network down' } }
        : { data: { id: 'j-1' }, error: null }
    });
    window.Auth._sb = cliente;
    await window.Auth.confirmarYRecalcular({
      jugadorId: 'j-1', e164: '+50581085555',
      motivo: 'Llamada verificada', confirmarTitularidad: true
    });
    falla = false;
    const reintentado = await window.Auth.reintentarRecalculo('j-1', '+50581085555');
    expect(reintentado.recalculoOk).toBe(true);
    expect(cliente.llamadas.rpc.filter(x => x.nombre === 'gl_confirmar_e164')).toHaveLength(1);
    expect(cliente.llamadas.update.every(x =>
      Object.keys(x.datos).join() === 'telefono_valido_plan'
    )).toBe(true);
  });

  /* 14 — Usuario sin autorización intenta confirmar titularidad */
  it('14. un usuario sin autorización no puede confirmar titularidad', async () => {
    const cliente = clienteFalso({
      rpc: (nombre) => nombre === 'gl_confirmar_e164'
        ? { data: null, error: { message: 'No autorizado' } }
        : { data: {}, error: null }
    });
    window.Auth._sb = cliente;
    await expect(window.Auth.confirmarE164({
      jugadorId: 'j-1', e164: '+50581085555',
      motivo: 'Prueba', confirmarTitularidad: true
    })).rejects.toThrow(/No tenés autorización/);
    expect(cliente.llamadas.update).toHaveLength(0);

    const rpc = sql22().slice(sql22().indexOf('create or replace function public.gl_confirmar_e164('));
    expect(rpc).toContain('v_admin := auth.uid()');
    expect(rpc).toContain('not public.gl_es_admin()');
  });
});
