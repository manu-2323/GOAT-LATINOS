/* =====================================================================
   1.6.0 — Panel de registro, torneo visual, PNG de jornada y reemplazos.
   Pruebas automatizadas estáticas y de helpers: no conectan con Supabase.
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const leer = ruta => readFileSync(resolve(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');

const config = leer('js/core/config.js');
const index = leer('index.html');
const menu = leer('js/ui/menu.js');
const gl = leer('js/core/gl.js');
const admin = leer('js/modulos/admin.js');
const tabla = leer('js/modulos/tabla.js');
const exportar = leer('js/modulos/exportar-png.js');
const dashboard = leer('js/modulos/dashboard-admin.js');
const panel = leer('js/modulos/jugadores.js');
const css = leer('css/estilos.css');

describe('1.6.0 — versión y navegación', () => {
  it('publica 1.6.0 y renueva el caché de los archivos modificados', () => {
    expect(config).toContain("VERSION: '1.6.0'");
    ['config', 'gl', 'supabase', 'menu', 'auth', 'app'].forEach(nombre =>
      expect(index).toContain('js/' + (nombre === 'config' || nombre === 'gl' || nombre === 'supabase' ? 'core/' :
        nombre === 'menu' || nombre === 'auth' ? 'ui/' : '') + nombre + '.js?v=1.6.0'));
    expect(index).toContain('css/estilos.css?v=3.24.0');
  });

  it('registra el panel dedicado en el menú de dirección', () => {
    expect(menu).toContain("id: 'jugadores'");
    expect(menu).toContain("nombre: 'Registro de jugadores'");
    expect(menu).toContain("modulo: 'jugadores'");
  });
});

describe('1.6.0 — panel de registro de jugadores', () => {
  it('existe como módulo independiente con tarjetas y WhatsApp', () => {
    expect(panel).toContain("Modulos.jugadores = Mod");
    expect(panel).toContain('soloGlobal: true');
    expect(panel).toContain('GL.linkWhatsapp(j, j.nombre_usuario)');
    expect(panel).toContain('data-reg-id');
    expect(panel).toContain('Número del jugador');
    expect(panel).toContain('GL.jugadoresGlobales()');
    expect(panel).toContain('onCreado: () => Mod.render(el)');
  });

  it('reutiliza el formulario validado sin inscribir en el torneo', () => {
    expect(admin).toContain('function modalAgregar(root, opciones)');
    expect(admin).toContain('const soloGlobal = cfg.soloGlobal === true;');
    expect(admin).toContain('torneoActual ? torneoActual.id : null');
    expect(admin).toContain('Mod.registrarJugador = modalAgregar;');
    expect(admin).toContain('Mod.editarJugador = modalEditar;');
  });

  it('elimina los alta redundantes de Administración y del centro de control', () => {
    expect(admin).not.toContain("data-agregar");
    expect(admin).not.toContain('#nt-jug-crear');
    expect(admin).not.toContain('crearJugadorRapido');
    expect(admin).not.toContain("'Agregar jugador',  'Registrá un nuevo participante'");
    expect(dashboard).not.toContain("'Agregar jugador'");
    expect(dashboard).toContain("accionBtn('user-plus',       'Registro de jugadores', 'jugadores')");
    expect(admin).toContain('data-ir-panel="jugadores"');
  });

  it('aporta estilos dedicados con tokens y diseño responsive', () => {
    expect(css).toContain('.reg-grid{display:grid');
    expect(css).toContain('.reg-card{');
    expect(css).toContain('@media (max-width:640px)');
  });
});

describe('1.6.0 — creación de torneo con lista visual', () => {
  it('muestra el catálogo completo y confirma cada alta con el texto pedido', () => {
    expect(admin).toContain('ancho: \'lg\'');
    expect(admin).toContain('tor-part-cabecera');
    expect(admin).toContain('data-tor-add');
    expect(admin).toContain("a sido añadido al torneo, espera asignar grupo");
    expect(admin).toContain('const participantes = Array.from(seleccionados)');
    expect(admin).not.toContain('#tor-participantes');
  });

  it('refresca el contexto después de inscribir, no antes', () => {
    const inscribir = admin.indexOf('await Auth.inscribirParticipantes');
    const recargar = admin.indexOf('await recargarContextoAdmin();', inscribir);
    expect(inscribir).toBeGreaterThan(-1);
    expect(recargar).toBeGreaterThan(inscribir);
    expect(admin).toContain('Recargar después de inscribir');
  });
});

describe('1.6.0 — reemplazos solo con jugadores disponibles', () => {
  it('centraliza el filtro en GL y lo usa el modal de baja', () => {
    expect(gl).toContain('jugadoresDisponiblesParaReemplazo(jugadorId)');
    expect(admin).toContain('GL.jugadoresDisponiblesParaReemplazo(j.id)');
    expect(admin).not.toContain('const candidatos = GL.jugadoresGlobales()');
  });

  it('excluye participantes activos, inactivos, expulsados y al propio jugador', () => {
    const GL = window.GL;
    GL.ctx = {
      jugadoresGlobales: [
        { id: 'yo', nombre_usuario: 'YO', activo: true },
        { id: 'dentro', nombre_usuario: 'DENTRO', activo: true },
        { id: 'fuera', nombre_usuario: 'FUERA', activo: true },
        { id: 'admin', nombre_usuario: 'ADMIN', activo: true, rol: 'admin' },
        { id: 'baja', nombre_usuario: 'BAJA', activo: false },
        { id: 'exp', nombre_usuario: 'EXP', activo: true, rol: 'expulsado' }
      ],
      participantes: [
        { jugador_id: 'yo', estado: 'activo' },
        { jugador_id: 'dentro', estado: 'activo' },
        { jugador_id: 'retirado', estado: 'retirado' }
      ]
    };
    const ids = GL.jugadoresDisponiblesParaReemplazo('yo').map(j => j.id);
    expect(ids).toEqual(['fuera', 'admin']);
  });
});

describe('1.6.0 — PNG de Partidos de hoy', () => {
  it('tiene delegado, plantilla por grupo y botones en la tabla', () => {
    expect(gl).toContain('exportarPartidosHoy(grupoId, nombre)');
    expect(exportar).toContain('async function exportarPartidosHoy(grupoId, nombre)');
    expect(exportar).toContain('async function htmlPlantillaPartidos(grupoId, jornadaNum)');
    expect(exportar).toContain('GL.partidos({ torneo_id: torneo.id, jornada: numero, grupo_id: grupoId })');
    expect(exportar).toContain('GOATS_Partidos');
    expect(tabla).toContain('data-export-partidos');
    expect(tabla).toContain('GL.exportarPartidosHoy(gid');
    expect(tabla).toContain("'PNG Grupo '");
  });

  it('usa una plantilla propia, legible y compatible con html2canvas', () => {
    expect(exportar).toContain('CSS_PARTIDOS');
    expect(exportar).toContain('.exp-partido-card{');
    expect(exportar).toContain('crossorigin="anonymous"');
    expect(exportar).toContain('Compartir por WhatsApp');
  });
});
