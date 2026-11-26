/* =====================================================================
   FASE 3.23 — Integración de la verificación SQL aislada en la suite.
   Ejecuta el arnés PGlite como proceso separado; nunca conecta a Supabase.
   ===================================================================== */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();

describe('FASE 3.23 — verificación SQL en PostgreSQL aislado', () => {
  it('reproduce los fallos actuales y valida la migración propuesta', () => {
    const salida = execFileSync(process.execPath,
      [resolve(raiz, 'scripts/fase-3.23-db-check.mjs')],
      { cwd: raiz, encoding: 'utf8', timeout: 120000 });
    expect(salida).toContain('MOTOR: PostgreSQL 19.0 (PGlite 0.6.0)');
    expect(salida).toContain('INSERT legacy devuelve SQLSTATE 42703');
    expect(salida).toContain('fallo es por FK de registrado_por');
    expect(salida).toContain('error de jornadas.updated_at');
    expect(salida).toContain('auditoría visible en auditoria_eventos');
    expect(salida).toContain('RESUMEN: 49/49 verificaciones correctas; 0 fallo(s).');
  }, 120000);
});
