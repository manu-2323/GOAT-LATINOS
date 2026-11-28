/* =====================================================================
   MÓDULO 4 — Estadísticas avanzadas por grupo y jornada
   Cálculo 100% derivado: GL + EST son la única fuente. No escribe datos.
   La exportación usa una composición propia, no una captura del dashboard.
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Estadísticas',
    grupoId: null,
    jornada: null,
    _ultimoInforme: null,
    _ultimoNombre: null,

    async render(el) {
      el.innerHTML = GL.skeleton(8);
      try {
        await GL.cargarContexto(true);
        const grupos = GL.grupos();
        if (!GL.torneo()) {
          el.innerHTML = GL.vacio('No hay torneo activo todavía.', 'trophy', null);
          iniciarIconos();
          return;
        }
        if (!grupos.length) {
          el.innerHTML = GL.vacio('No hay grupos configurados.', 'users-round', null);
          iniciarIconos();
          return;
        }
        if (!Mod.grupoId || !grupos.some(g => g.id === Mod.grupoId)) {
          const inicial = typeof GL.grupoInicial === 'function' ? GL.grupoInicial() : grupos[0];
          Mod.grupoId = (inicial && inicial.id) || grupos[0].id;
        }

        const torneo = GL.torneo();
        const total = Number(torneo.total_jornadas) || CONFIG.JORNADAS_FASE_REGULAR || 22;
        const jornadasGrupo = (GL.ctx.jornadas || []).filter(j => j.grupo_id === Mod.grupoId &&
          Number(j.numero) <= total);
        const cerradas = jornadasGrupo.filter(j => j.estado === 'cerrada')
          .map(j => Number(j.numero)).filter(Number.isFinite);
        const abierta = jornadasGrupo.find(j => j.estado === 'abierta');
        const ultimaCerrada = cerradas.length ? Math.max.apply(null, cerradas) : null;
        const jornadaValida = Number.isFinite(Number(Mod.jornada)) && Number(Mod.jornada) >= 1 &&
          Number(Mod.jornada) <= total;
        if (!jornadaValida) Mod.jornada = ultimaCerrada ||
          (abierta ? Number(abierta.numero) : null) || 1;
        Mod.jornada = Number(Mod.jornada);

        const partidos = await GL.partidos({ torneo_id: torneo.id });
        const filaJornada = jornadasGrupo.find(j => Number(j.numero) === Mod.jornada) || null;
        const opciones = {
          torneoId: torneo.id,
          grupoId: Mod.grupoId,
          jornada: Mod.jornada,
          jugadores: GL.jugadores(Mod.grupoId),
          jornadas: jornadasGrupo,
          totalJornadas: total,
          estadoJornada: filaJornada ? filaJornada.estado : 'sin_programar'
        };
        const informe = EST.calcularInformeJornada(partidos, opciones);
        const historial = EST.calcularHistorialJornadas(partidos, opciones);
        const tabla = EST.posicionesCompartidas((GL.clasificacion(Mod.grupoId) || []).map(c =>
          Object.assign({}, c, { nombre_usuario: c.nombre_usuario || GL.nombreJugador(c.jugador_id) })));

        informe.grupoLetra = GL.letraGrupo(GL.grupo(Mod.grupoId));
        informe.grupo = GL.grupo(Mod.grupoId);
        informe.torneoNombre = torneo.nombre || CONFIG.NOMBRE_LIGA;
        Mod._ultimoInforme = informe;
        Mod._ultimoNombre = nombreArchivo(torneo, GL.grupo(Mod.grupoId), Mod.jornada);

        el.innerHTML = htmlPagina({
          torneo,
          grupos,
          total,
          informe,
          historial,
          tabla,
          grupo: GL.grupo(Mod.grupoId),
          ultimaCerrada
        });

        el.querySelectorAll('[data-grupo]').forEach(boton => boton.addEventListener('click', () => {
          Mod.grupoId = boton.dataset.grupo;
          Mod.jornada = null;
          Mod.render(el);
        }));
        el.querySelectorAll('[data-jornada]').forEach(boton => boton.addEventListener('click', () => {
          Mod.jornada = Number(boton.dataset.jornada);
          Mod.render(el);
        }));
        const botonExportar = el.querySelector('[data-export]');
        if (botonExportar) botonExportar.addEventListener('click', () =>
          GL.exportarInformeEstadisticas(Mod._ultimoInforme, Mod._ultimoNombre));
      } catch (e) {
        console.error(e);
        el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'las estadísticas'), null,
          'las estadísticas de jornada');
      }
      iniciarIconos();
    }
  };

  /* ---------- Nombre de archivo estable y legible ---------- */
  function nombreArchivo(torneo, grupo, jornada) {
    const letra = GL.letraGrupo(grupo);
    const base = 'GOAT-LATINOS_Estadisticas_Grupo-' + letra + '_Jornada-' + jornada;
    return base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  }

  /* ---------- Encabezado y selector ---------- */
  function htmlPagina(datos) {
    const { informe, grupo, grupos, total, tabla, historial } = datos;
    const letra = GL.letraGrupo(grupo);
    const estado = informe.estadoJornada || 'sin_programar';
    const etiquetaEstado = estado === 'cerrada' ? 'Cerrada'
      : estado === 'abierta' ? 'Abierta' : 'Sin programar';
    const claseEstado = estado === 'cerrada' ? 'green' : estado === 'abierta' ? 'gold' : 'neutral';

    return '<div class="ea-pantalla">' +
      '<div class="seccion-head ea-cabecera">' +
        '<div class="seccion-titulo">' +
          '<h2>Estadísticas de la jornada</h2>' +
          '<p>Grupo ' + esc(letra) + ' · Jornada ' + informe.jornada +
            ' · Datos calculados desde resultados reales y resoluciones registradas</p>' +
        '</div>' +
        '<div class="seccion-acciones">' +
          '<button type="button" class="btn ea-boton-exportar" data-export>' +
            icono('image-down', 16) + 'EXPORTAR INFORME PNG' +
          '</button>' +
        '</div>' +
      '</div>' +

      '<div class="tabs ea-tabs" role="tablist" aria-label="Grupos">' + grupos.map(g =>
        '<button type="button" class="tab' + (g.id === Mod.grupoId ? ' activo' : '') +
          '" data-grupo="' + esc(g.id) + '" aria-pressed="' + (g.id === Mod.grupoId) + '">' +
          'Grupo ' + esc(GL.letraGrupo(g)) + '</button>').join('') + '</div>' +

      '<div class="ea-barra-jornada">' +
        '<div class="ea-jornadas" role="group" aria-label="Jornadas">' +
          Array.from({ length: total }, (_, i) => i + 1).map(n =>
            '<button type="button" class="ea-jornada' + (n === Mod.jornada ? ' activo' : '') +
              '" data-jornada="' + n + '" aria-pressed="' + (n === Mod.jornada) + '">J' + n + '</button>'
          ).join('') +
        '</div>' +
        GL.badge(etiquetaEstado, claseEstado, 'circle-dot') +
      '</div>' +

      htmlResumen(informe, letra, tabla) +
      htmlTarjetas(informe) +
      htmlDestacados(informe, letra) +
      htmlDetalle(informe, letra) +
      htmlTabla(tabla, letra) +
      htmlHistorial(historial, letra, datos.ultimaCerrada) +
    '</div>';
  }

  function htmlResumen(informe, letra, tabla) {
    const r = informe.resumen;
    const lider = (tabla || [])[0] || null;
    const kpis = [
      ['circle-check', r.partidos, 'Partidos válidos'],
      ['goal', r.golesReales, 'Goles reales'],
      ['scale', r.golesReglamentarios, 'Goles reglamentarios'],
      ['shield', r.vallas, 'Vallas invictas'],
      ['file-clock', r.partidosAdministrativos, 'Resoluciones administrativas'],
      ['clock', r.pendientes, 'Pendientes excluidos']
    ];
    return '<section class="ea-card ea-resumen" aria-labelledby="ea-resumen-titulo">' +
      '<div class="ea-card-cab">' +
        '<h3 id="ea-resumen-titulo">' + icono('activity', 17) + 'Resumen · Grupo ' + esc(letra) +
          ' · J' + informe.jornada + '</h3>' +
        (lider ? '<span>DG tabla (líder): ' + esc(GL.signo(lider.dif)) + '</span>' : '') +
      '</div>' +
      '<div class="ea-kpis">' + kpis.map(([ico, valor, etiqueta]) =>
        '<div class="ea-kpi"><span class="ea-kpi-ico">' + icono(ico, 17) + '</span>' +
          '<strong>' + esc(valor) + '</strong><small>' + esc(etiqueta) + '</small></div>').join('') +
      '</div>' +
      '<p class="ea-nota">El DG mostrado se toma sin recalcular de la clasificación oficial. ' +
        'Orden: PTS → DG → GF. Goles reales y resoluciones administrativas se contabilizan por separado.</p>' +
    '</section>';
  }

  function htmlTarjetas(informe) {
    return '<section class="ea-grid" aria-label="Indicadores de la jornada">' +
      informe.tarjetas.map(tarjeta => {
        const filas = tarjeta.filas.length
          ? tarjeta.filas.map((j, i) =>
              '<li class="ea-fila">' +
                '<span class="ea-puesto">' + (i + 1) + '</span>' +
                '<span class="ea-avatar">' + esc(GL.iniciales(j.nombre)) + '</span>' +
                '<span class="ea-fila-nombre">' + esc(j.nombre) +
                  '<small>' + esc(detalleFila(tarjeta, j)) + '</small>' +
                '</span>' +
                '<strong>' + esc(valorFila(tarjeta, j)) + '</strong>' +
              '</li>').join('')
          : '<li class="ea-vacio">Sin datos registrados en esta jornada.</li>';
        return '<article class="ea-card ea-metrica">' +
          '<div class="ea-card-cab"><h3>' + icono(tarjeta.icono, 17) + esc(tarjeta.titulo) + '</h3></div>' +
          '<ul class="ea-lista">' + filas + '</ul>' +
          '<p class="ea-nota">' + esc(tarjeta.nota) + '</p>' +
        '</article>';
      }).join('') +
    '</section>';
  }

  function detalleFila(tarjeta, j) {
    if (tarjeta.id === 'pase') return j.paseN + ' PJ con dato';
    if (tarjeta.id === 'posesion') return j.posN + ' PJ con dato';
    if (tarjeta.id === 'goleadores') return j.pj + ' PJ · ' + j.promGoles + ' por partido';
    if (tarjeta.id === 'vallas') return j.pj + ' PJ reales';
    if (tarjeta.id === 'diferencia') return 'GF ' + j.gf + ' · GC ' + j.gc;
    return j.gf + ' goles · ' + j.vallas + ' vallas';
  }

  function valorFila(tarjeta, j) {
    const valor = numero(j[tarjeta.clave]);
    const textoValor = tarjeta.id === 'diferencia' ? GL.signo(valor) : String(valor);
    return textoValor + (tarjeta.sufijo || '');
  }

  function htmlDestacados(informe, letra) {
    const partido = informe.partidoDestacado;
    const jugador = informe.jugadorDestacado;
    return '<section class="ea-destacados">' +
      '<article class="ea-card ea-partido-destacado">' +
        '<div class="ea-card-cab"><h3>' + icono('star', 17) + 'Partido destacado</h3></div>' +
        (partido
          ? '<div class="ea-marcadores">' +
              '<div class="ea-lado"><span class="ea-avatar grande">' +
                esc(GL.iniciales(partido.local)) + '</span><strong>' + esc(partido.local) + '</strong>' +
                '<small>' + esc(codigoPais(informe, partido.localId)) + '</small></div>' +
              '<div class="ea-marcador"><strong>' + esc(partido.marcador) + '</strong>' +
                '<span>' + partido.goles + ' goles reales · J' + partido.jornada + '</span></div>' +
              '<div class="ea-lado"><span class="ea-avatar grande">' +
                esc(GL.iniciales(partido.visitante)) + '</span><strong>' + esc(partido.visitante) + '</strong>' +
                '<small>' + esc(codigoPais(informe, partido.visitanteId)) + '</small></div>' +
            '</div>'
          : GL.vacio('No hay partidos jugados en esta jornada.', 'swords', null,
              'Las resoluciones administrativas no generan rendimiento real.')) +
      '</article>' +
      '<article class="ea-card ea-jugador-destacado">' +
        '<div class="ea-card-cab"><h3>' + icono('award', 17) + 'Jugador destacado</h3></div>' +
        (jugador
          ? '<div class="ea-destacado-jugador">' +
              '<span class="ea-avatar enorme">' + esc(GL.iniciales(jugador.nombre)) + '</span>' +
              '<div><strong>' + esc(jugador.nombre) + '</strong>' +
                '<small>' + esc(codigoPais(informe, jugador.id)) + ' · Grupo ' + esc(letra) + '</small>' +
                '<p>' + jugador.gf + ' goles · ' + jugador.vallas + ' vallas · ' + jugador.score + ' pts</p>' +
              '</div>' +
            '</div>'
          : GL.vacio('Sin jugador destacado.', 'award', null,
              'Se elige con goles reales + vallas invictas.')) +
      '</article>' +
    '</section>';
  }

  function codigoPais(informe, id) {
    const j = informe.jugadores.find(x => x.id === id);
    return j && /^[A-Za-z]{2}$/.test(j.pais || '') ? j.pais.toUpperCase() : '';
  }

  function htmlDetalle(informe, letra) {
    const filas = informe.jugadores.slice().sort((a, b) =>
      b.score - a.score || b.gf - a.gf || a.nombre.localeCompare(b.nombre, 'es'));
    return '<section class="ea-card ea-detalle" aria-labelledby="ea-detalle-titulo">' +
      '<div class="ea-card-cab"><h3 id="ea-detalle-titulo">' + icono('list', 17) +
        'Detalle por jugador · Grupo ' + esc(letra) + '</h3>' +
        '<span>' + filas.length + ' jugador(es)</span></div>' +
      (filas.length
        ? '<div class="ea-tabla-wrap" tabindex="0" role="region" aria-label="Detalle por jugador">' +
            '<table class="ea-tabla"><thead><tr>' +
              '<th class="izq">Jugador</th><th>PJ</th><th>GF</th><th>GC</th><th>DG</th>' +
              '<th>Vallas</th><th>Pos %</th><th>Pase %</th>' +
            '</tr></thead><tbody>' + filas.map(j =>
              '<tr><td class="izq"><span class="ea-avatar">' + esc(GL.iniciales(j.nombre)) +
                '</span><span class="ea-nombre-largo">' + esc(j.nombre) + '</span></td>' +
                '<td>' + j.pj + '</td><td>' + j.gf + '</td><td>' + j.gc + '</td>' +
                '<td>' + esc(GL.signo(j.dif)) + '</td><td>' + j.vallas + '</td>' +
                '<td>' + (j.posN ? j.promPos + '%' : '—') + '</td>' +
                '<td>' + (j.paseN ? j.promPase + '%' : '—') + '</td></tr>').join('') +
            '</tbody></table></div>'
        : GL.vacio('Todavía no hay resultados en esta jornada.', 'bar-chart-2', null,
            'Cuando se cargue un resultado válido aparecerá el detalle.')) +
      '<p class="ea-nota">Pos % y Pase % usan su propio denominador: solo partidos con ese dato cargado.</p>' +
    '</section>';
  }

  function htmlTabla(tabla, letra) {
    return '<section class="ea-card ea-clasificacion" aria-labelledby="ea-clasificacion-titulo">' +
      '<div class="ea-card-cab"><h3 id="ea-clasificacion-titulo">' + icono('trophy', 17) +
        'Tabla de posiciones · Grupo ' + esc(letra) + '</h3></div>' +
      (tabla.length
        ? '<div class="ea-tabla-wrap" tabindex="0" role="region" aria-label="Clasificación acumulada">' +
            '<table class="ea-tabla"><thead><tr>' +
              '<th>#</th><th class="izq">Jugador</th><th>PJ</th><th>GF</th><th>GC</th><th>DG</th><th>PTS</th>' +
            '</tr></thead><tbody>' + tabla.map(f =>
              '<tr><td><strong>' + f.posicion + (f.compartida ? '=' : '') + '</strong></td>' +
                '<td class="izq"><span class="ea-nombre-largo">' + esc(f.nombre_usuario || GL.nombreJugador(f.jugador_id)) +
                  '</span></td>' +
                '<td>' + numero(f.pj) + '</td><td>' + numero(f.gf) + '</td><td>' + numero(f.gc) + '</td>' +
                '<td>' + esc(GL.signo(f.dif)) + '</td><td>' + numero(f.pts) + '</td></tr>').join('') +
            '</tbody></table></div>'
        : GL.vacio('La tabla todavía no tiene filas.', 'layout-list', null,
            'La clasificación se genera cuando se cargan resultados.')) +
      '<p class="ea-nota">Fuente oficial: clasificación acumulada. Orden: PTS → DG → GF. ' +
        'El signo “=” indica posición compartida por igualdad exacta en esos tres valores.</p>' +
    '</section>';
  }

  function htmlHistorial(historial, letra, ultimaCerrada) {
    const filas = historial.filter(h => h.estado === 'cerrada' || h.partidos > 0);
    return '<section class="ea-card ea-historial" aria-labelledby="ea-historial-titulo">' +
      '<div class="ea-card-cab"><h3 id="ea-historial-titulo">' + icono('history', 17) +
        'Histórico · Grupo ' + esc(letra) + '</h3>' +
        '<span>' + filas.length + ' jornada(s) con registro</span></div>' +
      (filas.length
        ? '<ul class="ea-historial-lista">' + filas.map(h =>
            '<li><button type="button" class="ea-historial-btn' + (h.numero === Mod.jornada ? ' activo' : '') +
              '" data-jornada="' + h.numero + '">' +
              '<strong>J' + h.numero + '</strong>' +
              '<span>' + esc(h.estado === 'cerrada' ? 'Cerrada' : h.estado) + '</span>' +
              '<span>' + h.partidos + ' partido(s)</span>' +
              '<span>' + h.golesReales + ' goles reales</span>' +
              '<span class="ea-nombre-largo">' + esc(h.destacado) + '</span>' +
            '</button></li>').join('') + '</ul>'
        : GL.vacio('Todavía no hay jornadas cerradas con resultados.', 'history', null,
            'El histórico se calcula desde cada jornada cerrada; no duplica registros al reprocesar.')) +
      (ultimaCerrada ? '<p class="ea-nota">Última jornada cerrada del grupo: J' + ultimaCerrada + '.</p>' : '') +
    '</section>';
  }

  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }
  /* Superficie de prueba: mismas funciones puras que usa la vista. */
  Mod._interno = { nombreArchivo, htmlPagina, htmlTarjetas, htmlResumen, htmlHistorial, codigoPais };
  Modulos['stats-jornada'] = Mod;
})();
