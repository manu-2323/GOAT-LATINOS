import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const raiz = process.cwd();
const leer = relativo => readFileSync(resolve(raiz, relativo), 'utf8');

describe('FASE 3.12 — contrato de lectura pública', () => {
  it('pide exactamente las columnas de jugadores_publicos definidas en la migración vigente', () => {
    const sql = leer('supabase/migration-seguridad-2.3.sql');
    const coincidencia = sql.match(/create view public\.jugadores_publicos[\s\S]*?select\s+([^\n;]+)\s+from public\.jugadores;/i);
    expect(coincidencia).not.toBeNull();
    const columnasVista = coincidencia[1].split(',').map(x => x.trim());
    const columnasApp = window.GL._columnas.jugadores_publicos.split(',').map(x => x.trim());
    expect(columnasApp).toEqual(columnasVista);
  });

  it('no pide columnas sensibles ni zona_horaria a la vista pública', () => {
    const columnas = window.GL._columnas.jugadores_publicos.split(',');
    ['zona_horaria', 'telefono', 'telefono_e164', 'email', 'user_id', 'rol', 'super_admin']
      .forEach(columna => expect(columnas).not.toContain(columna));
  });

  it('resuelve la zona del jugador público desde el país cuando la vista no expone zona_horaria', () => {
    expect(window.GL.zonaJugador({ pais: 'NI' })).toBe('America/Managua');
    expect(window.GL.zonaJugador({ pais: 'NI', zona_horaria: 'America/Managua' })).toBe('America/Managua');
  });

  it('no consulta tablas sin SELECT para anon y deriva miembros de la clasificación pública', () => {
    const codigo = leer('js/core/gl.js');
    const inicio = codigo.indexOf('async cargarContexto(force)');
    const fin = codigo.indexOf('invalidar() {', inicio);
    const cuerpo = codigo.slice(inicio, fin);
    expect(cuerpo).toContain("const esPublico = !(typeof Auth !== 'undefined' && Auth && Auth.usuario)");
    expect(cuerpo).toContain("esPublico ? sinDatos : GL.consultar('grupo_jugadores')");
    expect(cuerpo).toContain("esPublico ? sinDatos : GL.consultar('sanciones'");
    expect(cuerpo).toContain('GL.ctx.clasificacion.map');
  });
});

describe('FASE 3.12 — jornadas y resultados', () => {
  it('usa total_jornadas del torneo para encontrar la jornada abierta', () => {
    const ctxOriginal = window.GL.ctx;
    try {
      window.GL.ctx = {
        ...ctxOriginal,
        torneo: { id: 'torneo-a', total_jornadas: 30 },
        jornadas: [
          { numero: 12, estado: 'cerrada', grupo_id: 'g', torneo_id: 'torneo-a' },
          { numero: 23, estado: 'abierta', grupo_id: 'g', torneo_id: 'torneo-a' }
        ]
      };
      expect(window.GL.jornadaAbiertaNumero()).toBe(23);
    } finally {
      window.GL.ctx = ctxOriginal;
    }
  });

  it('pide un motivo al corregir un resultado, como exige el RPC', () => {
    const codigo = leer('js/modulos/resultados.js');
    expect(codigo).toContain('id="motivo"');
    expect(codigo).toContain('Indica el motivo de la corrección antes de guardar.');
    expect(codigo).toMatch(/p_motivo:\s*motivo/);
    expect(codigo).not.toMatch(/p_motivo:\s*null/);
  });
});

describe('FASE 3.12 — administración de grupos', () => {
  it('acota la retirada de grupos al torneo activo', () => {
    const codigo = leer('js/modulos/admin.js');
    const acotados = codigo.match(/\.delete\(\)\s*\.eq\('jugador_id', j\.id\)\.in\('grupo_id', idsGrupos\)/g) || [];
    expect(acotados.length).toBeGreaterThanOrEqual(2);
    expect(codigo).not.toMatch(/\.delete\(\)\.eq\('jugador_id', j\.id\)(?!\s*\.in)/);
  });

  it('muestra miembros reales en los selectores de grupo', () => {
    const codigo = leer('js/modulos/admin.js');
    expect(codigo).not.toMatch(/GL\.clasificacion\(g\.id\)\.length/);
    expect((codigo.match(/e6Miembros\(g\)\.length/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('FASE 3.12 — estadísticas globales', () => {
  it('dibuja el porcentaje de puntos con la variable calculada', () => {
    const codigo = leer('js/modulos/stats-globales.js');
    const efecto = codigo.slice(codigo.indexOf('function graficoEfectividad'));
    expect(efecto).not.toMatch(/\bptsDatos\b/);
    expect(efecto).toMatch(/label\s*:\s*'% Puntos máx'[\s\S]{0,80}data\s*:\s*ptsPct/);
  });
});

describe('FASE 3.12 — notificaciones y mensajes', () => {
  it('no marca notificaciones como leídas si la escritura falló', () => {
    const codigo = leer('js/modulos/notificaciones.js');
    expect(codigo).toContain('if (!(await Mod._marcarLeida(id))) return;');
    expect(codigo).toMatch(/const \{ error \} = await sb\.from\('notificaciones'\)\.update/);
    expect(codigo).toMatch(/Mod\._sinLeer = Mod\._cache\.filter\(n => !n\.leida\)\.length/);
  });

  it('no anuncia borrado de notificaciones que fallaron', () => {
    const codigo = leer('js/modulos/notificaciones.js');
    expect(codigo).toMatch(/if \(err\) error = error \|\| err;\s*else borradas\.push\(n\.id\)/);
    expect(codigo).toMatch(/else if \(borradas\.length\) GL\.notificar/);
  });

  it('da una instrucción accionable cuando faltan datos para el mensaje', () => {
    const codigo = leer('js/modulos/mensajes.js');
    expect(codigo).toContain('Corregí estos puntos en Administración, Jornadas o Perfil');
    expect(codigo).not.toContain('Corregí estos puntos en Supabase');
  });
});

describe('FASE 3.12 (ampliación) — aviso de la pantalla de acceso', () => {
  it('identifica la consulta fallida en lugar de culpar genéricamente a Supabase', () => {
    const codigo = leer('js/core/gl.js');
    const inicio = codigo.indexOf('async cargarContexto(force)');
    const fin = codigo.indexOf('invalidar() {', inicio);
    const cuerpo = codigo.slice(inicio, fin);
    expect(cuerpo).toContain('consultasContexto.find');
    expect(cuerpo).toContain("falló la consulta de ' + fallo[0]");
    expect(cuerpo).not.toContain("Supabase respondió con un error");
  });

  it('un refresh token vencido nunca se traduce como problema de configuración', () => {
    expect(window.GL.traducirError('Invalid Refresh Token: Refresh Token Not Found'))
      .toMatch(/sesión venció|credenciales no son válidas/);
    expect(window.GL.traducirError('AuthApiError: invalid login credentials'))
      .not.toContain('configuración con la base de datos');
  });

  it('no carga el contexto global cuando no hay usuario autenticado', () => {
    const codigo = leer('js/app.js');
    expect(codigo).toContain("if (Auth.usuario) await GL.cargarContexto(true)");
  });

  it('un error de esquema se distingue de un problema de configuración', () => {
    expect(window.GL.traducirError('42703: column jugadores_publicos.zona_horaria does not exist'))
      .toMatch(/estructura esperada|actualización de esquema/);
  });

  it('la sesión vencida solo se registra en consola, nunca como aviso amarillo', () => {
    const codigo = leer('js/core/supabase.js');
    const inicio = codigo.indexOf('async iniciar()');
    const fin = codigo.indexOf('async cargarPerfil(force)', inicio);
    const cuerpo = codigo.slice(inicio, fin);
    expect(cuerpo).toContain("console.warn('Sesión:', e.message)");
    expect(cuerpo).not.toContain('GL.notificar');
  });
});

describe('FASE 3.12 (ampliación) — panel principal', () => {
  const inicio = () => leer('js/modulos/inicio.js');

  it('el módulo es sintácticamente válido', () => {
    expect(() => new Function(inicio())).not.toThrow();
  });

  it('usa partidos y contexto reales, sin datos generados', () => {
    const codigo = inicio();
    expect(codigo).toContain("await GL.partidos(torneo ? { torneo_id: torneo.id } : {})");
    expect(codigo).toContain('GL.ctx.jugadores');
    expect(codigo).toContain('GL.ctx.clasificacion');
    expect(codigo).not.toMatch(/Math\.random|partidosDeEjemplo|datosFicticios/);
  });

  it('busca el próximo partido futuro en cualquier jornada con fecha', () => {
    const codigo = inicio();
    expect(codigo).toContain('x.instante.getTime() >= Date.now()');
    expect(codigo).not.toContain('jornadaAbiertaNumero');
  });

  it('muestra un estado vacío si la cuenta no tiene jugador vinculado', () => {
    expect(inicio()).toContain('Tu cuenta todavía no tiene un jugador vinculado.');
  });

  it('calcula las alertas y los KPIs del administrador desde datos reales', () => {
    const codigo = inicio();
    expect(codigo).toContain('jornadasPendientes.length');
    expect(codigo).toContain('GL.jugadoresSinGrupo');
    expect(codigo).toContain('sinTelefono.length');
    expect(codigo).toContain('GL.resultado(p)');
  });

  it('entra a Inicio con sesión y mantiene la Tabla como puerta pública', () => {
    const app = leer('js/app.js');
    const menu = leer('js/ui/menu.js');
    expect(app).toContain("return (typeof Auth !== 'undefined' && Auth && Auth.usuario) ? 'inicio' : 'tabla';");
    expect(menu).toContain("{ id: 'inicio', nombre: 'Inicio', icono: 'house', nivel: 'jugador', modulo: 'inicio' }");
    expect(menu).toContain("{ id: 'tabla',        nombre: 'Tabla',          icono: 'layout-list',  nivel: 'publico' }");
  });
});
