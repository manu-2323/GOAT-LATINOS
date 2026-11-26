import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

/*
 * FASE 2.3 — 20 escenarios de corrección B1/B2/B3 e I1/I2/I4/I5/I6/I7.
 *
 * CLASIFICACIÓN DE PRUEBAS (no se mezclan):
 *   [modelo SQL]       modelo ejecutable en JS de las reglas PostgreSQL.
 *   [contrato SQL]     comprobación estructural de los archivos SQL locales.
 *   [Auth/jsdom]       comportamiento real del frontend cargado en jsdom con
 *                      cliente Supabase falso e inyectable.
 *   [SQL real pendiente] plantilla en supabase/tests/fase-2.3.sql. NO se ha
 *                      ejecutado: este entorno no dispone de PostgreSQL y la
 *                      fase prohíbe contactar Supabase remoto.
 *
 * Cuando un escenario dice «modelo + contrato», la aserción JavaScrip verifica
 * la regla modelada y, por separado, que el SQL implementa esa misma regla.
 * Nunca se afirma aquí una ejecución real de RLS, triggers, RPC ni txid.
 */

const sql22 = readFileSync('supabase/migration-telefonos-2.2.sql', 'utf8');
const sql23 = readFileSync('supabase/migration-seguridad-2.3.sql', 'utf8');
const frontend = readFileSync('js/core/supabase.js', 'utf8');

/* ---------------------- Modelo ejecutable ---------------------- */

function canonico(valor) {
  const texto = String(valor || '');
  return /^\+[1-9]\d{7,14}$/.test(texto) ? texto : null;
}

function normalizarHist(valor) {
  const texto = String(valor || '').trim();
  const digitos = texto.replace(/\D/g, '');
  if (texto && !canonico(texto) && /^[1-9]\d{7,14}$/.test(digitos)) {
    return '+' + digitos;
  }
  return texto;
}

function aplicarInsert(fila, actor, torneoActivo) {
  const resultado = { ...fila };
  if (actor.service_role || actor.super_admin) return resultado;
  if (resultado.user_id !== actor.user_id) {
    throw new Error('Solo podés crear tu propio perfil');
  }
  resultado.rol = 'jugador';
  resultado.super_admin = false;
  resultado.email = String(actor.email || '').toLowerCase();
  resultado.activo = true;
  resultado.suspendido = false;
  resultado.numero = null;
  resultado.torneo_id = torneoActivo;
  return resultado;
}

function aplicarUpdateRol(actor, anterior, cambios) {
  const nuevo = { ...anterior, ...cambios };
  if (actor.service_role || actor.super_admin) {
    return { ok: true, fila: nuevo };
  }

  if (anterior.user_id && anterior.user_id === actor.user_id) {
    const sensibles = [
      'rol', 'super_admin', 'email', 'user_id', 'activo',
      'suspendido', 'torneo_id', 'numero'
    ];
    if (sensibles.some(c => nuevo[c] !== anterior[c])) {
      return { ok: false, error: 'No podés modificar tus propios privilegios, torneo o flags' };
    }
    return { ok: true, fila: nuevo };
  }

  if (!actor.admin) {
    return { ok: false, error: 'No autorizado para modificar otros jugadores' };
  }
  if (['super_admin', 'email', 'user_id'].some(c => nuevo[c] !== anterior[c])) {
    return { ok: false, error: 'Solo el administrador principal puede modificar privilegios, correo o identidad' };
  }
  if (nuevo.rol === 'admin' && anterior.rol !== 'admin') {
    return { ok: false, error: 'Solo el administrador principal puede promover a administrador' };
  }
  if (anterior.rol === 'admin' && nuevo.rol !== 'admin') {
    return { ok: false, error: 'Solo el administrador principal puede revocar a un administrador' };
  }
  const transicion =
    (anterior.rol === 'jugador' && nuevo.rol === 'expulsado') ||
    (anterior.rol === 'expulsado' && nuevo.rol === 'jugador');
  if (nuevo.rol !== anterior.rol && !transicion) {
    return { ok: false, error: 'Transición de rol no permitida para un administrador normal' };
  }
  if (!['jugador', 'expulsado'].includes(nuevo.rol) &&
      (nuevo.activo !== anterior.activo || nuevo.suspendido !== anterior.suspendido)) {
    return { ok: false, error: 'Estado inválido para un jugador' };
  }
  return { ok: true, fila: nuevo };
}

function aplicarTitularidad(anterior, nuevo, confirmadaEnTx) {
  const e164Anterior = canonico(anterior.telefono_e164);
  const e164Nuevo = canonico(nuevo.telefono_e164);
  const cambioNumero = e164Nuevo !== e164Anterior;
  const cambioRepresentacion = [
    'telefono', 'telefono_nacional', 'pais_telefono'
  ].some(c => anterior[c] !== nuevo[c]);

  if (cambioNumero || cambioRepresentacion) {
    return confirmadaEnTx && Boolean(nuevo.telefono_verificado);
  }
  /* B1: la invalidación siempre pasa; fijar true exige auditoría en la tx. */
  if (!confirmadaEnTx && nuevo.telefono_verificado && !anterior.telefono_verificado) {
    return false;
  }
  return Boolean(nuevo.telefono_verificado);
}

function conservarHistorico(fila, auditorias) {
  const propias = auditorias
    .filter(a => a.jugador_id === fila.id)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const ultima = propias[propias.length - 1];
  if (!ultima || ultima.accion !== 'confirmacion_e164_y_titularidad') return false;
  if (!String(ultima.evidencia || '').trim()) return false;
  return canonico(ultima.valor_nuevo) === canonico(fila.telefono_e164);
}

/* Intérprete mínimo de GRANT/REVOKE sobre tablas: respeta el orden del SQL. */
function permisosFinales(sqlTexto, rol, tabla) {
  const estado = { select: new Set(), insert: new Set(), update: new Set(), delete: new Set() };
  const re = /\b(grant|revoke)\s+(all|select|insert|update|delete)(?:\s*\(([^)]*)\))?\s+on\s+([\w.]+)\s+(?:to|from)\s+([a-z_][\w]*(?:\s*,\s*[a-z_][\w]*)*)\s*;/gi;
  const operaciones = ['select', 'insert', 'update', 'delete'];
  for (const m of sqlTexto.matchAll(re)) {
    if (m[4] !== tabla) continue;
    const roles = m[5].split(',').map(x => x.trim());
    if (!roles.includes(rol)) continue;
    const ops = m[2] === 'all' ? operaciones : [m[2]];
    const cols = m[3]
      ? m[3].split(',').map(x => x.trim()).filter(Boolean)
      : ['*'];
    for (const op of ops) {
      if (m[1] === 'grant') {
        cols.forEach(c => estado[op].add(c));
      } else if (cols.includes('*')) {
        estado[op].clear();
      } else {
        cols.forEach(c => estado[op].delete(c));
      }
    }
  }
  return estado;
}

function columnas(sqlTexto, rol, tabla, operacion) {
  const p = permisosFinales(sqlTexto, rol, tabla)[operacion];
  return p.has('*') ? '*' : [...p].sort();
}

function cuerpo(sqlTexto, inicio, fin) {
  const a = sqlTexto.indexOf(inicio);
  const b = fin ? sqlTexto.indexOf(fin, a) : sqlTexto.length;
  return a < 0 ? '' : sqlTexto.slice(a, b < 0 ? sqlTexto.length : b);
}

function clienteFalso(opciones = {}) {
  const llamadas = {
    insert: [], update: [], rpc: [], updateUser: [], signOut: []
  };
  const usuario = opciones.usuario || {
    id: 'u-1',
    email: 'juan@example.com',
    user_metadata: { nombre_usuario: 'JUAN', pais: 'NI', telefono_e164: '+50581085555' }
  };
  const cadena = resultado => {
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
  };
  return {
    llamadas,
    auth: {
      signUp: async args => ({
        data: { user: { ...usuario, user_metadata: args.options.data } }, error: null
      }),
      signInWithPassword: async () => ({ data: { user: usuario }, error: null }),
      getUser: async () => ({ data: { user: usuario }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      updateUser: async args => {
        llamadas.updateUser.push(args);
        return opciones.updateUser ? opciones.updateUser(args) : { error: null };
      },
      signOut: async () => { llamadas.signOut.push(true); return {}; }
    },
    rpc: async (nombre, args) => {
      llamadas.rpc.push({ nombre, args });
      if (opciones.rpc) return opciones.rpc(nombre, args);
      return { data: {}, error: null };
    },
    from: tabla => ({
      select() {
        const r = opciones.select ? opciones.select(tabla) : { data: [], error: null };
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
        const r = opciones.update ? opciones.update(tabla, datos) : { data: { id: 'j-1' }, error: null };
        return cadena(r);
      }
    })
  };
}

const perfilBase = {
  id: 'j-2', user_id: 'u-2', nombre_usuario: 'PEDRO', pais: 'NI',
  rol: 'jugador', super_admin: false, email: 'pedro@example.com',
  activo: true, suspendido: false, torneo_id: 't-viejo', numero: 7,
  telefono_e164: '+50581085555', telefono: '8108-5555',
  telefono_nacional: '8108-5555', pais_telefono: 'NI',
  telefono_verificado: true
};

const adminNormal = { user_id: 'u-admin', admin: true, super_admin: false, email: 'admin@example.com' };
const superAdmin = { user_id: 'u-super', admin: true, super_admin: true, email: 'super@example.com' };

beforeEach(() => {
  window.Auth.usuario = null;
  window.Auth.jugador = null;
  window.Auth._sb = null;
  window.Auth._perfilEnCurso = null;
  window.Auth.perfilPendienteTelefono = null;
  window.Auth._verificando = {};
  /* Prueba deliberada de que la recuperación ya no depende del contexto. */
  window.GL.cargarContexto = async () => { throw new Error('contexto no disponible'); };
  window.GL.torneo = () => null;
  window.GL.invalidar = () => {};
});

describe('FASE 2.3 - 20 escenarios de seguridad', () => {
  it('1. [modelo + Auth/jsdom] INSERT propio con rol manipulado: el servidor fuerza jugador', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    await window.Auth._crearPerfilDesdeMetadata({
      id: 'u-1', email: 'juan@example.com',
      user_metadata: {
        nombre_usuario: 'JUAN', pais: 'NI', telefono_e164: '+50581085555',
        rol: 'admin', super_admin: true
      }
    });
    const fila = cliente.llamadas.insert[0].fila;
    expect(fila).not.toHaveProperty('rol');
    expect(fila).not.toHaveProperty('super_admin');
    expect(aplicarInsert({ user_id: 'u-1', rol: 'admin', super_admin: true },
      { user_id: 'u-1', email: 'juan@example.com' }, 't-activo'))
      .toMatchObject({ rol: 'jugador', super_admin: false });
    expect(sql23).toContain("NEW.rol := 'jugador'");
    expect(sql23).toContain('NEW.super_admin := false');
    expect(frontend).not.toMatch(/insert\(\{[\s\S]{0,300}\brol:/);
  });

  it('2. [modelo + Auth/jsdom] INSERT propio con torneo manipulado: manda el torneo activo', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    await window.Auth._crearPerfilDesdeMetadata({
      id: 'u-1', email: 'juan@example.com',
      user_metadata: {
        nombre_usuario: 'JUAN', pais: 'NI', telefono_e164: '+50581085555',
        torneo_id: 't-manipulado'
      }
    });
    expect(cliente.llamadas.insert[0].fila).not.toHaveProperty('torneo_id');
    expect(aplicarInsert({ user_id: 'u-1', torneo_id: 't-manipulado' },
      { user_id: 'u-1' }, 't-activo').torneo_id).toBe('t-activo');
    expect(sql23).toContain("where estado = 'activo'");
    expect(sql23).toContain('NEW.torneo_id := v_torneo_id');
  });

  it('3. [modelo + Auth/jsdom] INSERT propio con suspendido/activo/número manipulados', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    await window.Auth._crearPerfilDesdeMetadata({
      id: 'u-1', email: 'juan@example.com',
      user_metadata: {
        nombre_usuario: 'JUAN', pais: 'NI', telefono_e164: '+50581085555',
        activo: false, suspendido: true, numero: 99
      }
    });
    const fila = cliente.llamadas.insert[0].fila;
    ['activo', 'suspendido', 'numero'].forEach(c => expect(fila).not.toHaveProperty(c));
    expect(aplicarInsert({ user_id: 'u-1', activo: false, suspendido: true, numero: 99 },
      { user_id: 'u-1' }, null)).toMatchObject({ activo: true, suspendido: false, numero: null });
    expect(columnas(sql23, 'authenticated', 'public.jugadores', 'insert'))
      .not.toContain('suspendido');
  });

  it('4. [modelo + contrato SQL] UPDATE propio a admin queda bloqueado', () => {
    const actor = { ...adminNormal, user_id: 'u-2' };
    const resultado = aplicarUpdateRol(actor, perfilBase, { rol: 'admin', super_admin: true });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/propios privilegios/);
    expect(cuerpo(sql23, 'create or replace function public.gl_proteger_rol()', 'drop trigger if exists gl_proteger_rol'))
      .toContain('if v_es_propio then');
  });

  it('5. [modelo + contrato SQL] UPDATE propio cambiando torneo o flags queda bloqueado', () => {
    expect(aplicarUpdateRol({ user_id: 'u-2' }, perfilBase, { torneo_id: 't-otro' }).ok).toBe(false);
    expect(aplicarUpdateRol({ user_id: 'u-2' }, perfilBase, { suspendido: true }).ok).toBe(false);
    expect(aplicarUpdateRol({ user_id: 'u-2' }, perfilBase, { activo: false }).ok).toBe(false);
    const cuerpoRol = cuerpo(sql23, 'create or replace function public.gl_proteger_rol()', 'drop trigger if exists gl_proteger_rol');
    ['NEW.activo', 'NEW.suspendido', 'NEW.torneo_id', 'NEW.numero'].forEach(c =>
      expect(cuerpoRol).toContain(c)
    );
  });

  it('6. [modelo + contrato SQL] Un administrador normal no puede promover a admin', () => {
    expect(aplicarUpdateRol(adminNormal, perfilBase, { rol: 'admin' }))
      .toMatchObject({ ok: false });
    expect(sql23).toContain('Solo el administrador principal puede promover a administrador');
    expect(sql23).toContain("if NEW.rol = 'admin' and pg_catalog.coalesce(OLD.rol, '') <> 'admin' then");
  });

  it('7. [modelo + contrato SQL] super_admin sí puede promover, alterar correo y flags', () => {
    const resultado = aplicarUpdateRol(superAdmin, perfilBase, {
      rol: 'admin', super_admin: true, email: 'nuevo@example.com', suspendido: true
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.fila).toMatchObject({ rol: 'admin', super_admin: true, suspendido: true });
    const cuerpoRol = cuerpo(sql23, 'create or replace function public.gl_proteger_rol()', 'drop trigger if exists gl_proteger_rol');
    expect(cuerpoRol).toContain('v_es_super := public.gl_es_super_admin()');
    expect(cuerpoRol).toMatch(/if v_es_super then\s+return NEW;/);
  });

  it('8. [modelo + contrato SQL] Un administrador normal sí puede suspender a otro jugador', () => {
    const resultado = aplicarUpdateRol(adminNormal, perfilBase, { suspendido: true });
    expect(resultado.ok).toBe(true);
    expect(resultado.fila.suspendido).toBe(true);
    expect(sql23).toContain("(OLD.rol = 'jugador'   and NEW.rol = 'expulsado')");
    expect(columnas(sql23, 'authenticated', 'public.jugadores', 'update')).toContain('suspendido');
  });

  it('9. [modelo + contrato SQL] Reejecutar 2.2 no restaura titularidad: true -> false permitido', () => {
    expect(aplicarTitularidad(
      { telefono_e164: '+50581085555', telefono_verificado: true },
      { telefono_e164: '+50581085555', telefono_verificado: false },
      false
    )).toBe(false);
    expect(aplicarTitularidad(
      { telefono_e164: '+50581085555', telefono_verificado: false },
      { telefono_e164: '+50581085555', telefono_verificado: true },
      false
    )).toBe(false);
    expect(cuerpo(sql22, 'create or replace function public.gl_sincronizar_titularidad_telefono()', 'revoke all on function public.gl_sincronizar_titularidad_telefono()'))
      .toContain('NEW.telefono_verificado is true');
    expect(sql22).toContain('bloquear SOLO el intento de fijar true sin auditoría');
  });

  it('10. [modelo + contrato SQL] Auditoría antigua o número restaurado no conserva titularidad', () => {
    const fila = { id: 'j-1', telefono_e164: '+50581085555', telefono_verificado: true };
    const antigua = {
      id: 1, jugador_id: 'j-1', accion: 'confirmacion_e164_y_titularidad',
      valor_nuevo: '+50581085555', evidencia: 'ticket-antiguo'
    };
    const ultimaDeOtroNumero = {
      id: 2, jugador_id: 'j-1', accion: 'confirmacion_e164_y_titularidad',
      valor_nuevo: '+50588772233', evidencia: 'ticket-reciente'
    };
    expect(conservarHistorico(fila, [antigua, ultimaDeOtroNumero])).toBe(false);
    expect(conservarHistorico(fila, [
      antigua,
      { ...ultimaDeOtroNumero, valor_nuevo: '+50581085555' }
    ])).toBe(true);
    const normalizacion = cuerpo(sql22, 'update public.jugadores j', '-- 2) Unicidad real');
    expect(normalizacion).toContain('select pg_catalog.max(a2.id)');
    expect(normalizacion).toContain('a.valor_nuevo = j.telefono_e164');
    expect(normalizacion).toContain('coalesce(a.evidencia');
  });

  it('11. [modelo + contrato SQL] E.164 con caracteres se canonicaliza sólo si los dígitos son válidos', () => {
    expect(normalizarHist('+505 8108-5555')).toBe('+50581085555');
    expect(normalizarHist('+505 (8108) 5555 ext')).toBe('+50581085555');
    expect(canonico('+505 8108-5555')).toBe(null);
    expect(canonico('+50581085555')).toBe('+50581085555');
    expect(sql22).toContain("telefono_e164 !~ '^\\+[1-9][0-9]{7,14}$'");
    expect(sql22).toContain("'\\D', '', 'g'");
    expect(sql22).toContain("a.valor_nuevo = j.telefono_e164");
  });

  it('12. [modelo + contrato SQL] Cambiar campos secundarios invalida la titularidad', () => {
    const anterior = {
      telefono_e164: '+50581085555', telefono: '8108-5555',
      telefono_nacional: '8108-5555', pais_telefono: 'NI', telefono_verificado: true
    };
    expect(aplicarTitularidad(anterior, { ...anterior, telefono: '81085555' }, false)).toBe(false);
    expect(aplicarTitularidad(anterior, { ...anterior, pais_telefono: 'CR' }, false)).toBe(false);
    expect(aplicarTitularidad(anterior, { ...anterior }, false)).toBe(true);
    expect(cuerpo(sql22, 'create or replace function public.gl_sincronizar_titularidad_telefono()', 'revoke all on function public.gl_sincronizar_titularidad_telefono()'))
      .toMatch(/NEW\.pais_telefono\s+is distinct from OLD\.pais_telefono/);
    expect(sql22).toContain('telefono, telefono_nacional, pais_telefono, telefono_verificado');
  });

  it('13. [Auth/jsdom] Recuperación sin contexto: crea/usa perfil con el cliente inyectado', async () => {
    const cliente = clienteFalso({
      select: () => ({
        data: [{ id: 'j-1', user_id: 'u-1', telefono_e164: '+50581085555' }],
        error: null
      })
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = {
      id: 'u-1', email: 'juan@example.com',
      user_metadata: { nombre_usuario: 'JUAN', pais: 'XX', telefono_e164: '+50581085555' }
    };
    const perfil = await window.Auth.recuperarPerfilConTelefono('8108-5555', 'NI');
    expect(perfil.id).toBe('j-1');
    expect(window.Auth.perfilPendienteTelefono).toBe(null);
    expect(cliente.llamadas.updateUser[0].data).toMatchObject({ pais: 'NI', telefono_e164: '+50581085555' });
    expect(cliente.llamadas.updateUser[0].data).not.toHaveProperty('rol');
    expect(frontend).not.toMatch(/recuperarPerfilConTelefono[\s\S]{0,900}GL\.cargarContexto/);
  });

  it('14. [Auth/jsdom] Fallo de recuperación deja estado veraz y el reintento lo limpia', async () => {
    const cliente = clienteFalso({
      updateUser: async () => ({ error: { message: 'network error' } })
    });
    window.Auth._sb = cliente;
    window.Auth.usuario = {
      id: 'u-1', email: 'juan@example.com',
      user_metadata: { nombre_usuario: 'JUAN', pais: 'NI', telefono_e164: '+50581085555' }
    };
    await expect(window.Auth.recuperarPerfilConTelefono('8108-5555', 'NI')).rejects.toThrow();
    expect(window.Auth.perfilPendienteTelefono.motivo).toBe('fallo_recuperacion');

    cliente.llamadas.updateUser.length = 0;
    cliente.auth.updateUser = async () => ({ error: null });
    await window.Auth.recuperarPerfilConTelefono('8108-5555', 'NI');
    expect(window.Auth.perfilPendienteTelefono).toBe(null);
    expect(readFileSync('js/modulos/perfil.js', 'utf8')).toContain('data-reintentar-perfil');
  });

  it('15. [Auth/jsdom] salir() limpia usuario, perfil, recovery y petición en curso', async () => {
    const cliente = clienteFalso();
    window.Auth._sb = cliente;
    window.Auth.usuario = { id: 'u-1', user_metadata: {} };
    window.Auth.jugador = { id: 'j-1' };
    window.Auth._perfilEnCurso = { userId: 'u-1', promise: Promise.resolve(null) };
    window.Auth.perfilPendienteTelefono = { motivo: 'telefono_duplicado' };
    await window.Auth.salir();
    expect(window.Auth.usuario).toBe(null);
    expect(window.Auth.jugador).toBe(null);
    expect(window.Auth._perfilEnCurso).toBe(null);
    expect(window.Auth.perfilPendienteTelefono).toBe(null);
    expect(cliente.llamadas.signOut).toHaveLength(1);
  });

  it('16. [contrato SQL] Lectura pública usa vista sin identidad, correo ni teléfono', () => {
    const vista = cuerpo(sql23, 'create view public.jugadores_publicos', 'grant select on public.jugadores_publicos');
    ['email', 'telefono', 'telefono_e164', 'user_id', 'super_admin'].forEach(c =>
      expect(vista).not.toContain(c)
    );
    expect(columnas(sql23, 'anon', 'public.jugadores_publicos', 'select')).toBe('*');
    expect(columnas(sql23, 'authenticated', 'public.jugadores_publicos', 'select')).toBe('*');
    expect(sql23).toContain('with (security_invoker = false)');
  });

  it('17. [modelo + contrato SQL] anon no accede a la tabla privada jugadores', () => {
    expect(columnas(sql23, 'anon', 'public.jugadores', 'select')).toEqual([]);
    expect(columnas(sql23, 'anon', 'public.jugadores', 'insert')).toEqual([]);
    expect(columnas(sql23, 'anon', 'public.jugadores', 'update')).toEqual([]);
    expect(columnas(sql23, 'anon', 'public.jugadores', 'delete')).toEqual([]);
    expect(sql23).not.toMatch(/create policy[^\n]*on public\.jugadores[^\n]*to anon/);
    expect(readFileSync('supabase/configuracion-completa.sql', 'utf8'))
      .toContain('grant select on jugadores, grupo_jugadores, sanciones to authenticated');
  });

  it('18. [modelo + contrato SQL] DELETE directo de jugadores está bloqueado para clientes', () => {
    ['public', 'anon', 'authenticated', 'gl_owner'].forEach(rol =>
      expect(columnas(sql23, rol, 'public.jugadores', 'delete')).toEqual([])
    );
    expect(sql23).toContain('create policy gl_23_bloquea_delete_clientes on public.jugadores as restrictive');
    expect(sql23).toContain('for delete to public');
    expect(sql23).toContain('using (false)');
    expect(sql22).toContain('revoke delete on public.jugadores from public, anon, authenticated');
  });

  it('19. [modelo + contrato SQL] Compatibilidad admin: REST sigue funcionando bajo trigger', () => {
    const cambios = { suspendido: true, torneo_id: 't-nuevo', numero: 12, nombre_usuario: 'PEDRO2' };
    expect(aplicarUpdateRol(adminNormal, perfilBase, cambios)).toMatchObject({ ok: true });
    const columnasUpdate = columnas(sql23, 'authenticated', 'public.jugadores', 'update');
    ['activo', 'suspendido', 'rol', 'torneo_id', 'numero', 'nombre_usuario'].forEach(c =>
      expect(columnasUpdate).toContain(c)
    );
    ['telefono_verificado', 'super_admin', 'email', 'user_id'].forEach(c =>
      expect(columnasUpdate).not.toContain(c)
    );
    expect(sql23).toContain('before update on public.jugadores');
    expect(sql23).toContain('for each row execute function public.gl_proteger_rol()');
  });

  it('20. [Auth/jsdom + contrato SQL] Integración RPC: evidencia, txid y estado veraz', async () => {
    const cliente = clienteFalso({
      rpc: () => ({
        data: {
          titularidad_confirmada: true, recalculo_requerido: true,
          anterior: '+50581085555', nuevo: '+50581085555'
        },
        error: null
      })
    });
    window.Auth._sb = cliente;
    const estado = await window.Auth.confirmarYRecalcular({
      jugadorId: 'j-1', e164: '+50581085555', motivo: 'Verificación presencial',
      confirmarTitularidad: true, evidencia: 'ticket-927'
    });
    expect(cliente.llamadas.rpc[0]).toMatchObject({
      nombre: 'gl_confirmar_e164',
      args: {
        p_jugador_id: 'j-1', p_e164: '+50581085555',
        p_confirmar_titularidad: true, p_evidencia: 'ticket-927'
      }
    });
    expect(estado.confirmada).toBe(true);
    expect(sql22).toContain('pg_catalog.txid_current()');
    expect(sql22).toContain("and a.txid = pg_catalog.txid_current()");
    expect(sql22).toContain('La titularidad requiere evidencia verificable');
    expect(sql23).toContain('grant execute on function public.gl_confirmar_e164(uuid, text, text, boolean, text)');
  });
});
