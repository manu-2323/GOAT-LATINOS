/* =====================================================================
   1.4.2 — Pruebas AISLADAS del perfil independiente del grupo.
   No crean cuentas, no escriben en Supabase y no envían correos.
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8');
const codigoPerfil = () => leer('js/modulos/perfil.js');
const codigoSupabase = () => leer('js/core/supabase.js');
const codigoCss = () => leer('css/estilos.css');

const GRUPO_A = { id: 'g-a', nombre: 'Grupo A' };
const GRUPO_B = { id: 'g-b', nombre: 'Grupo B' };

function estadoBase() {
  const jugador = {
    id: 'j-1', user_id: 'u-1', rol: 'jugador', nombre_usuario: 'FABIAN10',
    pais: 'NI', zona_horaria: 'America/Managua', telefono: '',
    activo: true, suspendido: false, torneo_id: 't-1'
  };
  const rivalA = { id: 'j-2', nombre_usuario: 'RIVAL_A', pais: 'NI', activo: true };
  const rivalB = { id: 'j-3', nombre_usuario: 'RIVAL_B', pais: 'NI', activo: true };
  return {
    jugador,
    todos: [jugador, rivalA, rivalB],
    grupo: null,
    gruposPorJugador: {},
    partidos: [],
    miembros: { 'g-a': [jugador, rivalA], 'g-b': [jugador, rivalB] },
    clasificacion: [
      { jugador_id: 'j-1', grupo_id: 'g-a', pts: 9 },
      { jugador_id: 'j-2', grupo_id: 'g-a', pts: 6 },
      { jugador_id: 'j-1', grupo_id: 'g-b', pts: 3 },
      { jugador_id: 'j-3', grupo_id: 'g-b', pts: 1 }
    ],
    notificaciones: [],
    contexto: 0,
    esAdmin: false
  };
}

function crearGL(estado) {
  const GL = { ...window.GL };
  GL.cargarContexto = async () => { estado.contexto += 1; };
  GL.torneo = () => ({ id: 't-1', nombre: 'GOATS LATINOS', temporada: '2026' });
  GL.esAdmin = () => estado.esAdmin;
  GL.grupoDeJugador = id => id === estado.jugador.id
    ? estado.grupo
    : (estado.gruposPorJugador[id] || null);
  GL.partidos = async () => estado.partidos;
  GL.jugadores = grupoId => (estado.miembros[grupoId] || []).filter(j => j.activo !== false);
  GL.jugador = id => estado.todos.find(j => j.id === id) || null;
  GL.nombreJugador = id => (GL.jugador(id) || {}).nombre_usuario || 'Por definir';
  GL.clasificacion = grupoId => estado.clasificacion.filter(c => c.grupo_id === grupoId);
  GL.posicion = (jugadorId, grupoId) => {
    const tabla = GL.clasificacion(grupoId);
    const indice = tabla.findIndex(c => c.jugador_id === jugadorId);
    return indice < 0 ? null : indice + 1;
  };
  GL.notificar = (mensaje, tipo) => estado.notificaciones.push({ mensaje, tipo });
  GL.mensaje = e => String((e && e.message) || e);
  GL.linkWhatsapp = () => '';
  GL.abrirModal = opciones => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = '<div class="modal"><h2>' + String(opciones.titulo || '') + '</h2>' +
      '<div class="modal-cuerpo">' + (opciones.cuerpo || '') + '</div>' +
      '<div class="modal-acciones">' + (opciones.acciones || '') + '</div></div>';
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    if (opciones.onAbrir) opciones.onAbrir(fondo, cerrar);
    return fondo;
  };
  return GL;
}

function crearAuth(estado) {
  return {
    usuario: { id: 'u-1', email: 'fabian@example.com', user_metadata: {} },
    jugador: estado.jugador,
    perfilPendienteTelefono: null,
    actualizarPerfil: vi.fn(async cambios => {
      Object.assign(estado.jugador, cambios);
    }),
    subirAvatar: vi.fn(async () => {}),
    eliminarAvatar: vi.fn(async () => {}),
    cambiarContrasena: vi.fn(async () => true),
    cargarPerfil: vi.fn(async () => {}),
    _marcarErrorPerfil: vi.fn()
  };
}

async function renderPerfil(opciones = {}) {
  const estado = opciones.estado || estadoBase();
  if (opciones.grupo !== undefined) estado.grupo = opciones.grupo;
  if (opciones.partidos) estado.partidos = opciones.partidos;
  if (opciones.esAdmin) estado.esAdmin = true;
  if (opciones.rol) estado.jugador.rol = opciones.rol;
  const GL = crearGL(estado);
  const Auth = crearAuth(estado);
  const el = document.createElement('div');
  document.body.appendChild(el);
  /* El módulo cierra sobre los parámetros inyectados; se construye con los
     objetos de este escenario sin volver a leer el archivo. */
  const modular = new Function(
    'Modulos', 'GL', 'Auth', 'EST', 'icono', 'esc', 'iniciarIconos', 'PantallaAuth',
    codigoPerfil() + '\nreturn Modulos.perfil;'
  )(
    {}, GL, Auth, { calcularRendimiento: () => ({
      pj: estado.partidos.filter(p => p.estado !== 'pendiente').length,
      pg: 1, pe: 0, pp: 0, partidosReales: 1, gf: 2, gc: 1,
      promGoles: 2.0, dif: 1, vallas: 0, tiros: 0, tirosPuerta: 0,
      promPos: 0, posN: 0, promPase: 0, paseN: 0,
      racha: { tipo: 'V', texto: 'V1' }, mejorVictoria: '2 - 1', peorDerrota: '—'
    }) },
    () => '', valor => String(valor ?? ''), () => {},
    { estado() {}, aviso: null }
  );
  await modular.render(el);
  return { estado, GL, Auth, mod: modular, el };
}

function abrirEditor(el) {
  el.querySelector('[data-editar]').click();
  return document.querySelector('.modal-fondo');
}

async function esperar() {
  await new Promise(res => setTimeout(res, 0));
  await new Promise(res => setTimeout(res, 0));
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('1.4.2 — perfil sin grupo', () => {
  it('1. jugador con perfil completo y sin grupo ve el perfil, no una pantalla de espera', async () => {
    const { el, estado } = await renderPerfil();
    expect(el.textContent).toContain('Perfil del jugador');
    expect(el.textContent).toContain('FABIAN10');
    expect(el.textContent).toContain('Partidos jugados');
    expect(el.textContent).toContain('Historial de partidos');
    expect(el.textContent).toContain('Próximo partido');
    expect(el.textContent).toContain('Head to head');
    expect(el.textContent).toContain('Pendiente de asignación');
    expect(el.textContent).toContain('Tu perfil está activo. Un administrador te asignará a un grupo cuando corresponda.');
    expect(el.textContent).not.toContain('Tu perfil ya está creado');
    expect(el.textContent).not.toContain('Tu registro aún no está completo');
    expect(el.querySelector('[data-reintentar-perfil]')).toBeNull();
    expect(el.querySelector('[data-editar]')).not.toBeNull();
    expect(estado.contexto).toBe(1);
  });

  it('2. asignado al Grupo A muestra la pertenencia real del torneo', async () => {
    const { el } = await renderPerfil({ grupo: GRUPO_A });
    expect(el.textContent).toContain('Perteneces al Grupo A del torneo GOATS LATINOS · 2026');
    expect(el.textContent).toContain('Puesto 1');
    expect(el.textContent).not.toContain('Pendiente de asignación');
  });

  it('3. asignado al Grupo B muestra la pertenencia real del torneo', async () => {
    const { el } = await renderPerfil({ grupo: GRUPO_B });
    expect(el.textContent).toContain('Perteneces al Grupo B del torneo GOATS LATINOS · 2026');
    expect(el.textContent).toContain('Puesto 1');
    expect(el.textContent).not.toContain('Pendiente de asignación');
  });

  it('4. pasar de sin grupo a Grupo A actualiza el indicador sin recargar', async () => {
    const escenario = await renderPerfil();
    expect(escenario.el.textContent).toContain('Pendiente de asignación');
    escenario.estado.grupo = GRUPO_A;
    await escenario.mod.render(escenario.el);
    expect(escenario.el.textContent).toContain('Perteneces al Grupo A del torneo GOATS LATINOS · 2026');
    expect(escenario.el.textContent).not.toContain('Pendiente de asignación');
    expect(escenario.estado.contexto).toBe(2);
  });

  it('5. cambiar del Grupo A al Grupo B descarta rivales obsoletos', async () => {
    const escenario = await renderPerfil({ grupo: GRUPO_A });
    const selectorA = escenario.el.querySelector('#h2h-rival');
    expect(selectorA.textContent).toContain('RIVAL_A');
    expect(selectorA.textContent).not.toContain('RIVAL_B');
    selectorA.value = 'j-2';
    selectorA.dispatchEvent(new Event('change'));
    expect(escenario.mod.rivalId).toBe('j-2');
    escenario.estado.grupo = GRUPO_B;
    await escenario.mod.render(escenario.el);
    const selectorB = escenario.el.querySelector('#h2h-rival');
    expect(escenario.mod.rivalId).toBeNull();
    expect(selectorB.textContent).toContain('RIVAL_B');
    expect(selectorB.textContent).not.toContain('RIVAL_A');
    expect(escenario.el.textContent).toContain('Perteneces al Grupo B del torneo GOATS LATINOS · 2026');
  });

  it('6. sin partidos muestra los estados vacíos y ceros', async () => {
    const { el } = await renderPerfil();
    expect(el.textContent).toContain('Sin partidos jugados.');
    expect(el.textContent).toContain('No hay próximos partidos programados.');
    expect(el.textContent).toContain('Puntos');
    expect(el.textContent).not.toContain('No se pudo cargar');
  });

  it('7. con partidos muestra historial, próximo encuentro y head to head', async () => {
    const partidos = [
      { jornada: 1, local_id: 'j-1', visitante_id: 'j-2', estado: 'jugado', goles_local: 2, goles_visitante: 1 },
      { jornada: 4, local_id: 'j-3', visitante_id: 'j-1', estado: 'pendiente' }
    ];
    const { el, mod } = await renderPerfil({ grupo: GRUPO_A, partidos });
    const historial = el.querySelector('table tbody').textContent;
    expect(historial).toContain('RIVAL_A');
    expect(historial).toContain('2 - 1');
    expect(el.textContent).toContain('Jornada 4');
    expect(el.textContent).toContain('vs RIVAL_B');
    el.querySelector('#h2h-rival').value = 'j-2';
    el.querySelector('#h2h-rival').dispatchEvent(new Event('change'));
    const h2h = el.querySelector('#h2h-resultado').textContent;
    expect(h2h).toContain('2Goles a favor');
    expect(h2h).toContain('1Goles en contra');
    expect(h2h).not.toContain('Todavía no se enfrentaron.');
    expect(mod.rivalId).toBe('j-2');
  });
});

describe('1.4.2 — edición del perfil', () => {
  it('8. precarga datos reales, guarda y repinta sin crear otro registro', async () => {
    const escenario = await renderPerfil();
    const fondo = abrirEditor(escenario.el);
    expect(fondo.querySelector('#perfil-nombre').value).toBe('FABIAN10');
    expect(fondo.querySelector('#perfil-zona').value).toBe('America/Managua');
    fondo.querySelector('#perfil-nombre').value = 'FABIAN10 EDITADO';
    fondo.querySelector('#perfil-guardar').click();
    await esperar();
    expect(escenario.Auth.actualizarPerfil).toHaveBeenCalledWith(expect.objectContaining({
      nombre_usuario: 'FABIAN10 EDITADO', pais: 'NI', zona_horaria: 'America/Managua'
    }));
    expect(escenario.estado.notificaciones.some(n => n.mensaje === 'Perfil actualizado.')).toBe(true);
    expect(escenario.el.textContent).toContain('FABIAN10 EDITADO');
    expect(escenario.Auth.subirAvatar).not.toHaveBeenCalled();
    expect(escenario.Auth.eliminarAvatar).not.toHaveBeenCalled();
  });

  it('9. datos inválidos no guardan y conservan lo escrito', async () => {
    const escenario = await renderPerfil();
    const fondo = abrirEditor(escenario.el);
    fondo.querySelector('#perfil-nombre').value = 'NOMBRE NUEVO';
    fondo.querySelector('#perfil-zona').value = '';
    fondo.querySelector('#perfil-guardar').click();
    await esperar();
    expect(escenario.Auth.actualizarPerfil).not.toHaveBeenCalled();
    expect(escenario.estado.notificaciones.some(n => n.tipo === 'advertencia')).toBe(true);
    expect(fondo.querySelector('#perfil-nombre').value).toBe('NOMBRE NUEVO');
    expect(fondo.isConnected).toBe(true);
  });

  it('10. error de conexión permite reintentar sin perder los datos', async () => {
    const escenario = await renderPerfil();
    escenario.Auth.actualizarPerfil.mockRejectedValueOnce(new Error('network down'));
    const fondo = abrirEditor(escenario.el);
    fondo.querySelector('#perfil-nombre').value = 'NOMBRE QUE SE CONSERVA';
    fondo.querySelector('#perfil-guardar').click();
    await esperar();
    expect(escenario.estado.notificaciones.some(n => n.tipo === 'error' && n.mensaje.includes('network down'))).toBe(true);
    expect(fondo.querySelector('#perfil-guardar').disabled).toBe(false);
    expect(fondo.querySelector('#perfil-nombre').value).toBe('NOMBRE QUE SE CONSERVA');
    expect(escenario.Auth.actualizarPerfil).toHaveBeenCalledTimes(1);
  });

  it('11. bloquea el doble envío y mantiene el cambio de contraseña existente', async () => {
    const escenario = await renderPerfil();
    const fondo = abrirEditor(escenario.el);
    fondo.querySelector('#perfil-clave-actual').value = 'vieja123';
    fondo.querySelector('#perfil-clave-nueva').value = 'nueva456';
    fondo.querySelector('#perfil-clave-confirmar').value = 'nueva456';
    const boton = fondo.querySelector('#perfil-guardar');
    boton.click();
    boton.click();
    await esperar();
    expect(escenario.Auth.actualizarPerfil).toHaveBeenCalledTimes(1);
    expect(escenario.Auth.cambiarContrasena).toHaveBeenCalledWith('vieja123', 'nueva456', 'nueva456');
    expect(escenario.estado.notificaciones.some(n => n.mensaje === 'Perfil y contraseña actualizados.')).toBe(true);
  });

  it('12. el editor no expone rol, identificación interna, grupo ni sanciones', () => {
    const codigo = codigoPerfil();
    expect(codigo).not.toMatch(/rol:\s*['"]/);
    expect(codigo).not.toContain('grupo_id:');
    expect(codigo).not.toContain('user_id:');
    expect(codigo).not.toContain('suspendido:');
    expect(codigo).toContain("nombre_usuario: fondo.querySelector('#perfil-nombre').value");
    expect(codigoSupabase()).toContain(".eq('id', Auth.jugador.id).select().single()");
  });
});

describe('1.4.2 — roles y sesión', () => {
  it('13. el administrador conserva su perfil completo y el selector de jugadores', async () => {
    const escenario = await renderPerfil({ esAdmin: true, rol: 'admin' });
    expect(escenario.el.textContent).toContain('FABIAN10');
    expect(escenario.el.querySelector('#sel-jugador')).not.toBeNull();
    expect(escenario.el.querySelector('[data-editar]')).not.toBeNull();
    const fondo = abrirEditor(escenario.el);
    expect(fondo.querySelector('#perfil-clave-actual')).toBeNull();
  });

  it('el administrador puede consultar el perfil ajeno sin editarlo', async () => {
    const escenario = await renderPerfil({ esAdmin: true, rol: 'admin', grupo: GRUPO_A });
    escenario.estado.gruposPorJugador['j-2'] = GRUPO_A;
    escenario.mod.jugadorId = 'j-2';
    await escenario.mod.render(escenario.el);
    expect(escenario.el.textContent).toContain('RIVAL_A');
    expect(escenario.el.textContent).toContain('Perteneces al Grupo A del torneo GOATS LATINOS · 2026');
    expect(escenario.el.querySelector('[data-editar]')).toBeNull();
  });

  it('14. un jugador no puede forzar la consulta ni la edición de otro perfil', async () => {
    const escenario = await renderPerfil();
    escenario.mod.jugadorId = 'j-2';
    await escenario.mod.render(escenario.el);
    expect(escenario.el.textContent).toContain('FABIAN10');
    expect(escenario.el.textContent).not.toContain('RIVAL_A');
    expect(escenario.el.querySelector('#sel-jugador')).toBeNull();
    expect(escenario.el.querySelector('[data-editar]')).not.toBeNull();
  });

  it('14b. el propio perfil usa la fila completa para precargar el editor', async () => {
    const escenario = await renderPerfil();
    const real = escenario.GL.jugador;
    escenario.GL.jugador = id => id === 'j-1'
      ? { id: 'j-1', nombre_usuario: 'FABIAN10', pais: 'NI' }
      : real(id);
    await escenario.mod.render(escenario.el);
    const fondo = abrirEditor(escenario.el);
    expect(fondo.querySelector('#perfil-zona').value).toBe('America/Managua');
  });

  it('15. cerrar sesión y volver a entrar carga el perfil del usuario correcto', async () => {
    const primero = await renderPerfil();
    expect(primero.el.textContent).toContain('FABIAN10');
    const segundo = estadoBase();
    segundo.jugador.nombre_usuario = 'MANUEL';
    segundo.jugador.id = 'j-9';
    segundo.jugador.user_id = 'u-9';
    const salida = await renderPerfil({ estado: segundo });
    expect(salida.el.textContent).toContain('MANUEL');
    expect(salida.el.textContent).not.toContain('FABIAN10');
    expect(salida.estado.contexto).toBe(1);
    expect(codigoSupabase()).toContain('const userId = Auth.usuario.id;');
  });

  it('16. una instancia fresca tras recargar muestra el propio perfil', async () => {
    const escenario = await renderPerfil({ grupo: GRUPO_A });
    expect(escenario.mod.jugadorId).toBe('j-1');
    expect(escenario.el.textContent).toContain('Perteneces al Grupo A del torneo GOATS LATINOS · 2026');
    expect(codigoPerfil()).toContain('await GL.cargarContexto(true)');
    expect(codigoPerfil()).not.toContain('location.reload()');
  });

  it('17. la maquetación usa tarjetas adaptativas en escritorio y móvil', async () => {
    const { el } = await renderPerfil();
    expect(el.querySelector('.grid.cuatro')).not.toBeNull();
    expect(el.querySelector('.grid.tres')).not.toBeNull();
    expect(el.querySelector('.grid.dos')).not.toBeNull();
    expect(el.querySelector('.card.tight.mt')).not.toBeNull();
    const css = codigoCss();
    expect(css).toContain('.grid.cuatro{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}');
    expect(css).toContain('.grid.tres{grid-template-columns:repeat(auto-fit,minmax(215px,1fr))}');
    expect(css).toMatch(/@media\s*\(max-width:\s*780px\)/);
  });
});
