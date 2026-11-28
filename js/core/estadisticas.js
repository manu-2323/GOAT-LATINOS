/* =====================================================================
   ESTADÍSTICAS — Servicio centralizado de cálculo
   Regla clave: clasificación usa GL.resultado() (incluye walkovers).
                Rendimiento deportivo usa GL.golesReales() (solo FC Mobile).
   ===================================================================== */
(function () {

  /* Un dato solo cuenta si viene cargado y está en un rango válido.
     null, undefined, '' o NaN NO son 0: significan "sin estadística". */
  function datoRegistrado(valor, minimo, maximo) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    if (!Number.isFinite(n) || n < minimo) return null;
    if (maximo !== undefined && n > maximo) return null;
    return n;
  }

  /* Estados que pueden aportar a un informe. Cualquier otro estado
     (por ejemplo un partido anulado) se excluye: nunca se interpreta como
     jugado solo por tener un marcador cargado. */
  const ESTADOS_INFORME = new Set([
    'jugado', 'walkover_local', 'walkover_visitante',
    'doble_ausencia', 'expulsion_local', 'expulsion_visitante'
  ]);

  const EST = {

    /* ------------------------------------------------------------------
       calcularClasificacion(partidos, jugadorId?)
       Devuelve PJ/PG/PE/PP/GF-reglamentario/GC-reglamentario/Dif/Pts
       para todos los jugadores (o solo el indicado).
       GF/GC INCLUYEN walkovers porque determinan la tabla de posiciones.
    ------------------------------------------------------------------ */
    calcularClasificacion(partidos, jugadorId) {
      const stats = {};
      const a = id => stats[id] || (stats[id] = {
        id, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0, pts: 0, resultados: []
      });
      const ord = partidos.slice().sort((x, y) =>
        (Number(x.jornada) || 0) - (Number(y.jornada) || 0) ||
        String(x.created_at || '').localeCompare(String(y.created_at || '')));

      ord.forEach(p => {
        const r = GL.resultado(p);
        if (r.pendiente) return;
        const l = a(p.local_id), v = a(p.visitante_id);
        l.pj++; v.pj++;
        l.gf += r.gf; l.gc += r.gc; l.dif += r.gf - r.gc;
        v.gf += r.gc; v.gc += r.gf; v.dif += r.gc - r.gf;
        if (r.gf > r.gc) { l.pg++; v.pp++; l.pts += 3; l.resultados.push('V'); v.resultados.push('D'); }
        else if (r.gf === r.gc) { l.pe++; v.pe++; l.pts += 1; v.pts += 1; l.resultados.push('E'); v.resultados.push('E'); }
        else { l.pp++; v.pg++; v.pts += 3; l.resultados.push('D'); v.resultados.push('V'); }
      });

      const todos = Object.values(stats);
      if (jugadorId) return todos.filter(s => s.id === jugadorId)[0] || null;
      return todos;
    },

    /* ------------------------------------------------------------------
       calcularGolesReales(partidos, jugadorId?)
       Solo goles marcados en FC Mobile (p.estado === 'jugado').
       No cuenta walkovers ni resoluciones por expulsión.
    ------------------------------------------------------------------ */
    calcularGolesReales(partidos, jugadorId) {
      const stats = {};
      const a = id => stats[id] || (stats[id] = { id, gf: 0, gc: 0, dif: 0, pj: 0 });
      partidos.filter(p => p.estado === 'jugado' && !GL.esResolucionExpulsion(p)).forEach(p => {
        const gr = GL.golesReales(p);
        const l = a(p.local_id), v = a(p.visitante_id);
        l.pj++; v.pj++;
        l.gf += gr.gf; l.gc += gr.gc; l.dif += gr.gf - gr.gc;
        v.gf += gr.gc; v.gc += gr.gf; v.dif += gr.gc - gr.gf;
      });
      const todos = Object.values(stats);
      if (jugadorId) return todos.filter(s => s.id === jugadorId)[0] || { id: jugadorId, gf: 0, gc: 0, dif: 0, pj: 0 };
      return todos;
    },

    /* ------------------------------------------------------------------
       calcularVallasInvictas(partidos, jugadorId?)
       Solo partidos estado='jugado' sin resolución por expulsión.
       Cuenta valla del local si gc===0, del visitante si gf===0.
    ------------------------------------------------------------------ */
    calcularVallasInvictas(partidos, jugadorId) {
      const stats = {};
      const a = id => stats[id] || (stats[id] = { id, vallas: 0 });
      partidos.filter(p => p.estado === 'jugado' && !GL.esResolucionExpulsion(p)).forEach(p => {
        const gr = GL.golesReales(p);
        if (gr.gc === 0) a(p.local_id).vallas++;
        if (gr.gf === 0) a(p.visitante_id).vallas++;
      });
      const todos = Object.values(stats);
      if (jugadorId) return (todos.find(s => s.id === jugadorId) || { id: jugadorId, vallas: 0 }).vallas;
      return todos;
    },

    /* ------------------------------------------------------------------
       calcularPromedios(partidos, jugadorId?)
       Posesión y precisión de pase — solo partidos jugados en FC Mobile.
    ------------------------------------------------------------------ */
    calcularPromedios(partidos, jugadorId) {
      const stats = {};
      const a = id => stats[id] || (stats[id] = {
        id, pj: 0, posesion: 0, pase: 0, tiros: 0, tirosPuerta: 0,
        posN: 0, paseN: 0, tirosN: 0, tirosPuertaN: 0
      });
      // Solo partidos realmente jugados en FC Mobile.
      // Los walkovers y resoluciones por expulsión NO generan datos de posesión,
      // tiros ni precisión de pase — son marcadores administrativos, no rendimiento real.
      partidos.filter(p => p.estado === 'jugado' && !GL.esAdministrativo(p)).forEach(p => {
        const l = a(p.local_id), v = a(p.visitante_id);
        l.pj++; v.pj++;

        // Cada métrica suma solo cuando su dato existe. Un partido sin posesión
        // cargada NO cuenta como 0% ni entra en el denominador de posesión.
        const datos = [
          { clave: 'posesion',    n: 'posN',    local: datoRegistrado(p.posesion_local, 0, 100), visita: datoRegistrado(p.posesion_visitante, 0, 100) },
          { clave: 'pase',        n: 'paseN',    local: datoRegistrado(p.pase_local, 0, 100),     visita: datoRegistrado(p.pase_visitante, 0, 100) },
          { clave: 'tiros',       n: 'tirosN',   local: datoRegistrado(p.tiros_local, 0),         visita: datoRegistrado(p.tiros_visitante, 0) },
          { clave: 'tirosPuerta', n: 'tirosPuertaN', local: datoRegistrado(p.tiros_puerta_local, 0), visita: datoRegistrado(p.tiros_puerta_visitante, 0) }
        ];
        datos.forEach(d => {
          if (d.local !== null)  { l[d.clave] += d.local;  l[d.n]++; }
          if (d.visita !== null) { v[d.clave] += d.visita; v[d.n]++; }
        });
      });
      Object.values(stats).forEach(s => {
        s.promPos = s.posN ? Math.round(s.posesion / s.posN) : 0;
        s.promPase = s.paseN ? Math.round(s.pase / s.paseN) : 0;
        s.promTiros = s.tirosN ? Math.round((s.tiros / s.tirosN) * 10) / 10 : 0;
        s.promTirosPuerta = s.tirosPuertaN ? Math.round((s.tirosPuerta / s.tirosPuertaN) * 10) / 10 : 0;
      });
      const todos = Object.values(stats);
      const vacio = () => ({
        id: jugadorId, pj: 0, posesion: 0, pase: 0, tiros: 0, tirosPuerta: 0,
        posN: 0, paseN: 0, tirosN: 0, tirosPuertaN: 0,
        promPos: 0, promPase: 0, promTiros: 0, promTirosPuerta: 0
      });
      if (jugadorId) return todos.find(s => s.id === jugadorId) || vacio();
      return todos;
    },

    /* ------------------------------------------------------------------
       calcularRachas(resultados[])
       Recibe array de strings 'V'|'E'|'D' cronológico (más antiguo primero).
    ------------------------------------------------------------------ */
    calcularRachas(resultados) {
      if (!resultados.length) return { actual: { tipo: '—', texto: '—', n: 0 }, mejorVictorias: 0 };
      const ultimo = resultados[resultados.length - 1];
      let nActual = 0;
      for (let i = resultados.length - 1; i >= 0 && resultados[i] === ultimo; i--) nActual++;
      let mejor = 0, actual = 0;
      resultados.forEach(r => { actual = r === 'V' ? actual + 1 : 0; mejor = Math.max(mejor, actual); });
      return {
        actual: { tipo: ultimo, texto: ultimo + nActual, n: nActual },
        mejorVictorias: mejor
      };
    },

    /* ------------------------------------------------------------------
       calcularRendimiento(partidos, jugadorId)
       Combina goles reales + clasificacion + promedios + vallas + racha
       en un único objeto listo para mostrar en el perfil.
    ------------------------------------------------------------------ */
    calcularRendimiento(partidos, jugadorId) {
      const cl = EST.calcularClasificacion(partidos, jugadorId) || {};
      const gr = EST.calcularGolesReales(partidos, jugadorId);
      const prom = EST.calcularPromedios(partidos, jugadorId);
      const vallas = EST.calcularVallasInvictas(partidos, jugadorId);
      const rachaData = EST.calcularRachas(cl.resultados || []);

      // Mejor victoria y peor derrota: solo partidos jugados en FC Mobile.
      // Walkovers, expulsiones y jornadas libres NO generan rendimiento real.
      let mejorVictoria = null, peorDerrota = null;
      partidos.filter(p => p.estado === 'jugado' && !GL.esAdministrativo(p)).forEach(p => {
        const r = GL.resultado(p);
        const local = p.local_id === jugadorId;
        const aFavor = local ? r.gf : r.gc;
        const enContra = local ? r.gc : r.gf;
        const diff = aFavor - enContra;
        if (diff > 0 && (!mejorVictoria || diff > mejorVictoria.diff))
          mejorVictoria = { diff, texto: aFavor + ' - ' + enContra };
        if (diff < 0 && (!peorDerrota || diff < peorDerrota.diff))
          peorDerrota = { diff, texto: aFavor + ' - ' + enContra };
      });

      return {
        id: jugadorId,
        // Clasificación (incluye walkovers)
        pj: cl.pj || 0, pg: cl.pg || 0, pe: cl.pe || 0, pp: cl.pp || 0,
        pts: cl.pts || 0,
        // Goles reglamentarios (para tabla de posiciones)
        gfReglamentario: cl.gf || 0,
        gcReglamentario: cl.gc || 0,
        difReglamentario: cl.dif || 0,
        // Goles reales (rendimiento deportivo, solo FC Mobile)
        gf: gr.gf, gc: gr.gc, dif: gr.dif,
        partidosReales: gr.pj || 0,
        promGoles: gr.pj ? Math.round((gr.gf / gr.pj) * 10) / 10 : 0,
        // Vallas y promedios: cada uno usa su propio denominador válido
        vallas,
        promPos: prom.promPos, promPase: prom.promPase,
        posN: prom.posN || 0, paseN: prom.paseN || 0,
        tiros: prom.tiros, tirosPuerta: prom.tirosPuerta,
        // Racha
        racha: rachaData.actual,
        mejorRacha: rachaData.mejorVictorias,
        mejorVictoria: mejorVictoria ? mejorVictoria.texto : '—',
        peorDerrota: peorDerrota ? peorDerrota.texto : '—'
      };
    },

    /* ------------------------------------------------------------------
       calcularHeadToHead(partidos, idA, idB)
       Devuelve stats del enfrentamiento directo entre dos jugadores.
    ------------------------------------------------------------------ */
    calcularHeadToHead(partidos, idA, idB) {
      const js = partidos.filter(p => p.estado !== 'pendiente' &&
        !GL.esAdministrativo(p) &&
        ((p.local_id === idA && p.visitante_id === idB) ||
         (p.visitante_id === idA && p.local_id === idB)));
      let g = 0, e = 0, p = 0, gf = 0, gc = 0;
      js.forEach(x => {
        const r = GL.resultado(x);
        const local = x.local_id === idA;
        const a = local ? r.gf : r.gc, b = local ? r.gc : r.gf;
        gf += a; gc += b;
        if (a > b) g++; else if (a === b) e++; else p++;
      });
      return { partidos: js.length, g, e, p, gf, gc };
    },

    /* ------------------------------------------------------------------
       posicionesCompartidas(filas)
       Orden canónico usado por el cliente: pts → dif → gf. La posición se
       comparte cuando esos tres valores son iguales. No inventa desempate
       nuevo y NO sustituye a la tabla materializada en public.clasificacion.
    ------------------------------------------------------------------ */
    posicionesCompartidas(filas) {
      const triada = f => [numero(f && f.pts), numero(f && f.dif), numero(f && f.gf)].join('|');
      const orden = (filas || []).slice().sort((a, b) =>
        numero(b && b.pts) - numero(a && a.pts) ||
        numero(b && b.dif) - numero(a && a.dif) ||
        numero(b && b.gf) - numero(a && a.gf) ||
        texto(a && a.nombre_usuario).localeCompare(texto(b && b.nombre_usuario), 'es'));
      const conteo = {};
      orden.forEach(f => { const k = triada(f); conteo[k] = (conteo[k] || 0) + 1; });
      let puesto = 0, anterior = null;
      return orden.map((f, i) => {
        const k = triada(f);
        if (k !== anterior) { puesto = i + 1; anterior = k; }
        return Object.assign({}, f, {
          posicion: puesto,
          compartida: (conteo[k] || 0) > 1,
          gf: numero(f && f.gf),
          gc: numero(f && f.gc),
          dif: numero(f && f.dif),
          pts: numero(f && f.pts)
        });
      });
    },

    /* ------------------------------------------------------------------
       calcularInformeJornada(partidos, opciones)
       Informe 100% derivado, de solo lectura. Nunca escribe ni persiste.

       opciones:
         torneoId, grupoId, jornada, jugadores, jornadas, totalJornadas

       Reglas:
         · filtra por torneo/grupo/jornada y elimina duplicados;
         · excluye pendientes y jornada_libre de todo cómputo;
         · rendimiento usa solo partidos 'jugado' no administrativos;
         · clasificación del informe usa GL.resultado() (walkover 3-0,
           doble ausencia 0-0, expulsiones 1-0) para que DG = GF - GC;
         · la tabla oficial sigue siendo public.clasificacion.
    ------------------------------------------------------------------ */
    calcularInformeJornada(partidos, opciones) {
      const o = opciones || {};
      const todas = Array.isArray(partidos) ? partidos : [];
      const jornadaNumero = o.jornada === null || o.jornada === undefined || o.jornada === ''
        ? null : Number(o.jornada);
      const tieneJornada = jornadaNumero !== null && Number.isFinite(jornadaNumero);
      const enAlcance = p => !!p &&
        (!o.torneoId || !p.torneo_id || p.torneo_id === o.torneoId) &&
        (!o.grupoId || p.grupo_id === o.grupoId) &&
        (!tieneJornada || Number(p.jornada) === jornadaNumero) &&
        !!p.local_id && !!p.visitante_id && p.anulado !== true;

      const pendientes = todas.filter(p => enAlcance(p) && p.estado === 'pendiente');
      const vistos = new Set();
      const lista = todas.filter(p => {
        if (!enAlcance(p)) return false;
        if (!ESTADOS_INFORME.has(String(p.estado || ''))) return false;
        const clave = [p.torneo_id, p.grupo_id, p.jornada, p.local_id, p.visitante_id].join('|');
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });
      const reales = lista.filter(p => p.estado === 'jugado' && !GL.esAdministrativo(p));
      const administrativos = lista.filter(p => GL.esAdministrativo(p));

      const cl = EST.calcularClasificacion(lista);
      const gr = EST.calcularGolesReales(lista);
      const pr = EST.calcularPromedios(lista);
      const vi = EST.calcularVallasInvictas(lista);

      const porId = id => (o.jugadores || []).find(j => j && j.id === id) || null;
      const nombre = id => {
        const j = porId(id);
        return j ? (j.nombre_usuario || j.nombre || id) : (GL.nombreJugador ? GL.nombreJugador(id) : id);
      };
      const pais = id => {
        const j = porId(id);
        if (j && j.pais) return j.pais;
        return GL.paisJugador ? GL.paisJugador(id) : '';
      };

      const ids = new Set([
        ...(o.jugadores || []).map(j => j && j.id).filter(Boolean),
        ...cl.map(s => s.id), ...gr.map(s => s.id), ...pr.map(s => s.id), ...vi.map(s => s.id),
        ...lista.reduce((acc, p) => { acc.push(p.local_id, p.visitante_id); return acc; }, [])
      ]);
      const jugadores = Array.from(ids).map(id => {
        const c = cl.find(s => s.id === id) || {};
        const g = gr.find(s => s.id === id) || {};
        const m = pr.find(s => s.id === id) || {};
        const v = vi.find(s => s.id === id) || {};
        const partidosReales = numero(g.pj);
        const gf = numero(g.gf), gc = numero(g.gc);
        return {
          id,
          nombre: nombre(id),
          pais: pais(id),
          nombreUsuario: nombre(id),
          pj: partidosReales,
          gf, gc,
          dif: numero(g.dif),
          vallas: numero(v.vallas),
          promPos: numero(m.promPos),
          promPase: numero(m.promPase),
          posN: numero(m.posN),
          paseN: numero(m.paseN),
          promGoles: partidosReales ? Math.round((gf / partidosReales) * 10) / 10 : 0,
          gfReglamentario: numero(c.gf),
          gcReglamentario: numero(c.gc),
          difReglamentario: numero(c.dif),
          puntosReglamentarios: numero(c.pts),
          score: gf + numero(v.vallas)
        };
      });

      const ordenar = (a, b, clave) =>
        numero(b[clave]) - numero(a[clave]) ||
        numero(b.dif) - numero(a.dif) ||
        numero(b.gf) - numero(a.gf) ||
        texto(a.nombre).localeCompare(texto(b.nombre), 'es');
      /* Un ranking solo existe cuando hay rendimiento real. Sin partidos
         jugados no se muestra un "0" como si fuera un dato válido. */
      const conPartido = jugadores.filter(j => numero(j.pj) > 0);
      const top = (fuente, clave, n) =>
        fuente.slice().sort((a, b) => ordenar(a, b, clave)).slice(0, n || 3);
      const conDato = (clave, minimo) => jugadores.filter(j => numero(j[clave + 'N']) >= (minimo || 1));

      const goleadores = top(conPartido, 'gf');
      const vallasRanking = top(conPartido.filter(j => numero(j.vallas) > 0), 'vallas');
      const diferenciaRanking = top(conPartido, 'dif');
      const paseRanking = conDato('pase').sort((a, b) => ordenar(a, b, 'promPase')).slice(0, 3);
      const posesionRanking = conDato('pos').sort((a, b) => ordenar(a, b, 'promPos')).slice(0, 3);
      const jugadorDestacado = top(conPartido.filter(j => numero(j.score) > 0), 'score', 1)[0] || null;

      const partidoOrdenado = reales.slice().sort((a, b) => {
        const ra = GL.golesReales(a), rb = GL.golesReales(b);
        return (numero(rb.gf) + numero(rb.gc)) - (numero(ra.gf) + numero(ra.gc)) ||
          Math.abs(numero(rb.gf) - numero(rb.gc)) - Math.abs(numero(ra.gf) - numero(ra.gc)) ||
          numero(a.jornada) - numero(b.jornada) || texto(a.id).localeCompare(texto(b.id));
      });
      const p = partidoOrdenado[0] || null;
      const marcador = p ? GL.resultado(p) : null;
      const golesPartido = p ? GL.golesReales(p) : null;
      const partidoDestacado = p ? {
        id: p.id,
        jornada: numero(p.jornada),
        localId: p.local_id,
        visitanteId: p.visitante_id,
        local: nombre(p.local_id),
        visitante: nombre(p.visitante_id),
        marcador: marcador.texto,
        gf: numero(golesPartido.gf),
        gc: numero(golesPartido.gc),
        goles: numero(golesPartido.gf) + numero(golesPartido.gc),
        estado: p.estado
      } : null;

      const golesRealesTotales = jugadores.reduce((acc, j) => acc + numero(j.gf), 0);
      const golesReglamentarios = lista.reduce((acc, partido) => {
        const r = GL.resultado(partido);
        return acc + numero(r.gf) + numero(r.gc);
      }, 0);

      const tarjetas = [
        { id: 'goleadores', titulo: 'Más goles reales', icono: 'goal', filas: goleadores, clave: 'gf', sufijo: '', nota: 'Solo partidos jugados' },
        { id: 'vallas', titulo: 'Más porterías en 0', icono: 'shield', filas: vallasRanking, clave: 'vallas', sufijo: '', nota: 'Sin resoluciones por expulsión' },
        { id: 'diferencia', titulo: 'Mejor diferencia real', icono: 'trending-up', filas: diferenciaRanking, clave: 'dif', sufijo: '', nota: 'GF real − GC real' },
        { id: 'pase', titulo: 'Precisión de pase', icono: 'target', filas: paseRanking, clave: 'promPase', sufijo: '%', nota: 'Solo partidos con dato de pase' },
        { id: 'posesion', titulo: 'Posesión promedio', icono: 'pie-chart', filas: posesionRanking, clave: 'promPos', sufijo: '%', nota: 'Solo partidos con dato de posesión' },
        { id: 'valor', titulo: 'Jugador destacado', icono: 'award', filas: jugadorDestacado ? [jugadorDestacado] : [], clave: 'score', sufijo: ' pts', nota: 'Goles reales + vallas' }
      ];

      return {
        torneoId: o.torneoId || null,
        grupoId: o.grupoId || null,
        jornada: tieneJornada ? jornadaNumero : null,
        estadoJornada: o.estadoJornada || null,
        partidos: lista,
        reales,
        administrativos,
        pendientes,
        jugadores,
        tarjetas,
        jugadorDestacado,
        partidoDestacado,
        resumen: {
          partidos: lista.length,
          partidosReales: reales.length,
          partidosAdministrativos: administrativos.length,
          pendientes: pendientes.length,
          golesReales: golesRealesTotales,
          golesReglamentarios,
          vallas: jugadores.reduce((acc, j) => acc + numero(j.vallas), 0),
          conPase: partidosConDato(lista, 'pase_local', 'pase_visitante'),
          conPosesion: partidosConDato(lista, 'posesion_local', 'posesion_visitante')
        }
      };
    },

    /* ------------------------------------------------------------------
       calcularHistorialJornadas(partidos, opciones)
       Cada jornada se calcula de forma independiente. Cerrar J8 no altera el
       resultado de J7; reprocesar no inserta ni duplica nada.
    ------------------------------------------------------------------ */
    calcularHistorialJornadas(partidos, opciones) {
      const o = opciones || {};
      const todas = Array.isArray(partidos) ? partidos : [];
      /* Las filas de public.jornadas no siempre repiten torneo_id: se aceptan
         cuando no lo traen. Los partidos sí conservan el filtro estricto. */
      const enTorneo = x => !o.torneoId || !x.torneo_id || x.torneo_id === o.torneoId;
      const enGrupoJornada = j => !!j && enTorneo(j) &&
        (!o.grupoId || !j.grupo_id || j.grupo_id === o.grupoId);
      const enGrupoPartido = p => !!p && enTorneo(p) && (!o.grupoId || p.grupo_id === o.grupoId);
      const numeros = new Set();
      (o.jornadas || []).filter(enGrupoJornada).forEach(j => {
        const n = Number(j.numero);
        if (Number.isFinite(n) && (!o.totalJornadas || n <= Number(o.totalJornadas))) numeros.add(n);
      });
      todas.filter(enGrupoPartido).forEach(p => {
        const n = Number(p.jornada);
        if (Number.isFinite(n)) numeros.add(n);
      });
      return Array.from(numeros).sort((a, b) => a - b).map(numeroJornada => {
        const filaJornada = (o.jornadas || []).filter(enGrupoJornada)
          .find(j => Number(j.numero) === numeroJornada);
        const informe = EST.calcularInformeJornada(todas, Object.assign({}, o, { jornada: numeroJornada }));
        const destacado = informe.jugadorDestacado;
        return {
          numero: numeroJornada,
          estado: filaJornada ? (filaJornada.estado || 'sin_programar') : 'sin_programar',
          virtual: !!(filaJornada && filaJornada.virtual),
          partidos: informe.resumen.partidos,
          golesReales: informe.resumen.golesReales,
          golesReglamentarios: informe.resumen.golesReglamentarios,
          destacado: destacado ? destacado.nombre : '—',
          destacadoGoles: destacado ? numero(destacado.score) : 0
        };
      });
    }

  };

  /* Pequeños helpers internos, deliberadamente sin estado. */
  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }
  function texto(valor) {
    return valor === null || valor === undefined ? '' : String(valor);
  }
  function partidosConDato(partidos, claveLocal, claveVisitante) {
    return (partidos || []).filter(p => datoRegistrado(p[claveLocal], 0) !== null ||
      datoRegistrado(p[claveVisitante], 0) !== null).length;
  }

  window.EST = EST;
})();