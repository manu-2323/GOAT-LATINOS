import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const sql = readFileSync(
  'supabase/migration-telefonos-1.2.1.sql',
  'utf8'
);

function mapas() {
  const bloques = [...sql.matchAll(
    /^[ \t]*with\s+map\(pais,\s*prefijo,\s*longitudes\)\s+as\s*\(\s*values\s*([\s\S]*?)^\s*\),\s*$/gm
  )];

  return bloques.map(b => [...b[1].matchAll(
    /\('([A-Z]{2})'\s*,\s*'(\d+)'\s*,\s*array\[([\d,\s]+)\]\)/g
  )]
    .map(m => `${m[1]}|${m[2]}|${m[3].replace(/\s/g, '')}`)
    .sort());
}

describe('Migración telefónica 1.2.1', () => {
  it('es una transacción completa y no elimina tablas ni la firma antigua', () => {
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).not.toContain('drop table');
    expect(sql).not.toContain('drop function');
    expect(sql).toContain('rename to gl_confirmar_e164_legacy');
  });

  it('crea gl_owner sin privilegios peligrosos y sin BYPASSRLS', () => {
    expect(sql).toMatch(/create role gl_owner\s+nologin nosuperuser nocreatedb nocreaterole\s+noinherit noreplication nobypassrls/);
    expect(sql).not.toContain('grant bypassrls');
    expect(sql).not.toContain('alter table public.jugadores owner to gl_owner');
  });

  it('prepara auditoría privada con RLS y columna de evidencia', () => {
    expect(sql).toContain('create schema if not exists auditoria');
    expect(sql).toContain('create table if not exists auditoria.telefonos_confirmados');
    expect(sql).toContain('alter table auditoria.telefonos_confirmados enable row level security');
    expect(sql).toContain('add column if not exists evidencia text');
  });

  it('mantiene mapas idénticos de 16 países en migración y RPC', () => {
    const [migracion, rpc] = mapas();
    expect(migracion).toHaveLength(16);
    expect(rpc).toEqual(migracion);
  });

  it('protege contra duplicados concurrentes', () => {
    expect(sql).toContain('create unique index if not exists jugadores_e164_canonicalizado_uniq');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('get stacked diagnostics');
    expect(sql).toContain("v_restriccion = 'jugadores_e164_canonicalizado_uniq'");
    expect(sql).toContain('Violación de unicidad no telefónica');
  });

  it('exige E.164 canónico y no marca titularidad automáticamente', () => {
    expect(sql).toContain("pg_catalog.left(p_e164, 1) <> '+'");
    expect(sql).toContain("p_e164 !~ '^\\+[1-9][0-9]{7,14}$'");
    expect(sql).toContain('telefono_valido_plan = null');
    expect(sql).not.toContain('telefono_verificado = true');
  });

  it('usa RLS permisiva y restrictiva con permisos por columna', () => {
    expect(sql.match(/as restrictive/g)).toHaveLength(5);
    expect(sql).toContain('gl_rpc_select_jugadores');
    expect(sql).toContain('gl_rpc_update_jugadores');
    expect(sql).toContain('gl_rpc_block_insert_jugadores');
    expect(sql).toContain('gl_rpc_block_delete_jugadores');
    expect(sql).toContain('gl_rpc_insert_auditoria');
    expect(sql).toContain("current_setting('app.gl_jugador_id', true)");
    expect(sql).toContain("current_setting('app.gl_admin_id', true)");
    expect(sql).toContain('grant select (id, telefono_e164, telefono_verificado)');
    expect(sql).toContain('grant update (telefono_e164, telefono_valido_plan, telefono_verificado)');
    expect(sql).not.toContain('grant insert on auditoria.telefonos_confirmados');
  });

  it('no sobrescribe el teléfono histórico', () => {
    expect(sql).not.toMatch(/^\s*telefono\s*=/m);
  });
});

/* ------------------------- FASE 2.2 ------------------------- */
const sql22 = readFileSync(
  'supabase/migration-telefonos-2.2.sql',
  'utf8'
);

/* Contrato estructural: se extraen los privilegios REALES concedidos y se
   comparan como conjuntos, no como búsquedas sueltas de texto. */
function privilegios(sqlTexto, rol, operacion) {
  const patron = new RegExp(
    'grant\\s+' + operacion + '\\s*\\(([^)]*)\\)\\s*on\\s+([\\w.]+)\\s+to\\s+' + rol + '\\s*;',
    'gi'
  );
  const resultado = [];
  for (const m of sqlTexto.matchAll(patron)) {
    resultado.push({
      tabla: m[2],
      columnas: m[1].split(',').map(x => x.trim()).filter(Boolean).sort()
    });
  }
  return resultado;
}

describe('Migración correctiva 2.2 — contrato de seguridad', () => {
  it('authenticated conserva UPDATE sobre las columnas legítimas y NUNCA sobre telefono_verificado', () => {
    const upd = privilegios(sql22, 'authenticated', 'update');
    expect(upd).toHaveLength(1);
    expect(upd[0].tabla).toBe('public.jugadores');
    expect(upd[0].columnas).toEqual([
      'activo', 'avatar_url', 'nombre_usuario', 'numero', 'pais',
      'pais_telefono', 'rol', 'suspendido', 'telefono',
      'telefono_e164', 'telefono_nacional', 'telefono_valido_plan',
      'torneo_id', 'zona_horaria'
    ].sort());
    expect(upd[0].columnas).not.toContain('telefono_verificado');
  });

  it('authenticated puede insertar el perfil propio sin fijar titularidad', () => {
    const ins = privilegios(sql22, 'authenticated', 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0].columnas).toContain('user_id');
    expect(ins[0].columnas).not.toContain('telefono_verificado');
  });

  it('gl_owner tiene exactamente los privilegios mínimos de la RPC', () => {
    const upd = privilegios(sql22, 'gl_owner', 'update');
    expect(upd).toHaveLength(1);
    expect(upd[0].tabla).toBe('public.jugadores');
    expect(upd[0].columnas).toEqual([
      'telefono_e164', 'telefono_valido_plan', 'telefono_verificado'
    ]);
    const ins = privilegios(sql22, 'gl_owner', 'insert');
    expect(ins[0].tabla).toBe('auditoria.telefonos_confirmados');
    expect(ins[0].columnas).toContain('txid');
  });

  it('la autorización del trigger depende de auditoría en la misma transacción, no de una GUC', () => {
    const cuerpo = sql22.slice(
      sql22.indexOf('create or replace function public.gl_sincronizar_titularidad_telefono()'),
      sql22.indexOf('alter function public.gl_sincronizar_titularidad_telefono()')
    );
    expect(cuerpo).toMatch(/v_nuevo is distinct from v_anterior/);
    expect((cuerpo.match(/telefono_verificado := false/g) || []).length).toBe(2);
    expect(cuerpo).toContain('auditoria.gl_tiene_confirmacion_tx(NEW.id, v_nuevo)');
    expect(sql22).not.toContain('app.gl_confirmacion_autorizada');
    expect(sql22).toContain('before insert or update of');
    expect(sql22).toContain('telefono_nacional, pais_telefono, telefono_verificado');
    expect(cuerpo).toContain('NEW.telefono_verificado is true');
  });

  it('la normalización histórica exige auditoría del MISMO E.164', () => {
    const cuerpo = sql22.slice(
      sql22.indexOf('update public.jugadores j'),
      sql22.indexOf('-- 2) Unicidad real')
    );
    expect(cuerpo).toContain('set telefono_verificado = false');
    expect(cuerpo).toContain('not exists');
    expect(cuerpo).toContain("a.accion = 'confirmacion_e164_y_titularidad'");
    expect(cuerpo).toMatch(/a\.jugador_id = j\.id/);
    expect(cuerpo).toContain('a.valor_nuevo = j.telefono_e164');
    expect(cuerpo).toContain("nullif(pg_catalog.btrim(coalesce(a.evidencia, '')), '') is not null");
    expect(cuerpo).toContain('select pg_catalog.max(a2.id)');
  });

  it('la unicidad de user_id se crea con preflight de duplicados', () => {
    expect(sql22).toContain('create unique index if not exists jugadores_user_id_uniq');
    expect(sql22).toMatch(/having pg_catalog\.count\(\*\) > 1/);
    expect(sql22).toContain('Resolver manualmente antes de crear el índice único');
  });
});
