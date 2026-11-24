/* =====================================================================
   MÓDULO 6 — Perfil del jugador
   ===================================================================== */
(function () {
  const Mod = {
    titulo: 'Mi Perfil',
    jugadorId: null,
    rivalId: null,

    async render(el) {
      el.innerHTML = GL.skeleton(7);
      if (!Auth.usuario) { el.innerHTML = GL.accesoDenegado('jugador'); enlazar(el); iniciarIconos(); return; }
      try {
        await GL.cargarContexto(true);
        if (!GL.torneo()) { el.innerHTML = GL.vacio('No hay torneo activo todavía.', 'trophy', null); iniciarIconos(); return; }
        if (!Auth.jugador || (!GL.esAdmin() && !GL.grupoDeJugador(Auth.jugador.id))) {
          el.innerHTML = pendiente();
          const btn = el.querySelector('[data-actualizar-nombre]');
          if (btn) btn.addEventListener('click', () => editarPerfil(el, Auth.jugador || {}));
          iniciarIconos(); return;
        }
        if (!Mod.jugadorId || !(Auth.jugador.rol === 'admin' && Mod.jugadorId !== Auth.jugador.id)) {
          Mod.jugadorId = Auth.jugador.id;
        }
        const j = GL.jugador(Mod.jugadorId) || Auth.jugador;
        const todos = await GL.partidos({ torneo_id: GL.torneo().id });
        const mios = todos.filter(p => p.local_id === j.id || p.visitante_id === j.id);
        const fila = GL.clasificacion().find(c => c.jugador_id === j.id) || {};
        const pos = GL.posicion(j.id);
        const grupo = GL.grupoDeJugador(j.id);

        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Perfil del jugador</h2>' +
            '<p>Estadísticas individuales de la temporada</p></div>' +
            '<div class="seccion-acciones">' +
              (GL.esAdmin() ? '<label class="campo" style="margin:0"><select class="input" id="sel-jugador">' +
                GL.jugadores().map(x => '<option value="' + x.id + '"' + (x.id === j.id ? ' selected' : '') + '>' +
                  esc(x.nombre_usuario) + '</option>').join('') + '</select></label>' : '') +
              (Mod.jugadorId === Auth.jugador.id ? '<button type="button" class="btn sec" data-editar>' +
                icono('pencil', 15) + 'Editar perfil</button>' : '') +
              (Mod.jugadorId === Auth.jugador.id ? '<button type="button" class="btn peligro" data-eliminar-cuenta>' +
                icono('trash-2', 15) + 'Eliminar mi cuenta</button>' : '') +
            '</div></div>' +
          '<div class="card"><div class="header-perfil">' +
            GL.avatarHTML(j, 'avatar') +
            '<div><h2>' + esc(j.nombre_usuario) + '</h2>' +
              '<div class="sub">' +
                '<span class="pais-celda">' + GL.banderaHTML(j.pais, 18) +
                  '<span class="codigo-pais">' + esc(j.pais || '—') + '</span></span>' +
                '<span class="muted" style="font-size:12px">' + esc(GL.horarioPais(j.pais)) + '</span>' +
                (j.telefono ? GL.linkWhatsapp(j.telefono, j.nombre_usuario) : '') +
                (pos ? GL.badge('Posición ' + pos + ' · Grupo ' + GL.letraGrupo(grupo), 'gold', 'trophy') : '') +
                (j.suspendido || j.activo === false ? GL.badge('Suspendido', 'red', 'triangle-alert') : GL.badge('Activo', 'green', 'circle-check')) +
              '</div></div></div></div>' +
          '<div class="grid cuatro">' +
            statCard('Partidos jugados', 'calendar-days', fila.pj || 0) +
            statCard('Victorias', 'circle-check-big', fila.pg || 0, 'verde-txt') +
            statCard('Empates', 'equal', fila.pe || 0) +
            statCard('Derrotas', 'circle-x', fila.pp || 0, 'rojo-txt') +
          '</div>' +
          '<div class="grid tres">' +
            statCard('Goles a favor', 'goal', fila.gf || 0) +
            statCard('Goles en contra', 'shield-alert', fila.gc || 0) +
            statCard('Diferencia de gol', 'trending-up', GL.signo(fila.dif)) +
            statCard('Vallas en 0', 'shield', vallas(mios, j.id)) +
            statCard('Tiros totales', 'crosshair', suma(mios, j.id, 'tiros_local', 'tiros_visitante')) +
            statCard('Tiros a puerta', 'crosshair', suma(mios, j.id, 'tiros_puerta_local', 'tiros_puerta_visitante')) +
            statCard('Promedio posesión', 'pie-chart', promedio(mios, j.id, 'posesion_local', 'posesion_visitante') + '%') +
            statCard('Promedio precisión pase', 'route', promedio(mios, j.id, 'pase_local', 'pase_visitante') + '%') +
            statCard('Racha actual', racha(mios, j.id).icono, racha(mios, j.id).texto) +
            statCard('Mejor victoria', 'trophy', mejor(mios, j.id, true)) +
            statCard('Peor derrota', 'trending-down', mejor(mios, j.id, false)) +
            statCard('Puntos', 'award', fila.pts || 0, 'dorado') +
          '</div>' +
          '<div class="grid dos">' +
            '<div class="card"><div class="card-titulo">' + icono('history', 19) + 'Historial de partidos</div>' +
              '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>J#</th><th class="izq">Rival</th><th>L/V</th><th>Resultado</th><th>Dif</th></tr></thead><tbody>' +
              historial(mios, j.id) + '</tbody></table></div></div>' +
            '<div>' +
              '<div class="card"><div class="card-titulo">' + icono('calendar', 19) + 'Próximo partido</div>' + proximo(todos, j) + '</div>' +
              '<div class="card mt"><div class="card-titulo">' + icono('swords', 19) + 'Head to head</div>' +
                '<label class="campo"><span>Elegí un rival del grupo</span><select class="input" id="h2h-rival">' +
                  '<option value="">Seleccionar…</option>' +
                  GL.jugadores(grupo && grupo.id).filter(x => x.id !== j.id).map(x =>
                    '<option value="' + x.id + '"' + (x.id === Mod.rivalId ? ' selected' : '') + '>' + esc(x.nombre_usuario) + '</option>').join('') +
                '</select></label><div id="h2h-resultado">' + (Mod.rivalId ? h2h(mios, j.id, Mod.rivalId) : '<p class="vacio-mensaje">Elegí un rival para ver el historial.</p>') + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';

        const sel = el.querySelector('#sel-jugador');
        if (sel) sel.addEventListener('change', () => { Mod.jugadorId = sel.value; Mod.rivalId = null; Mod.render(el); });
        const riv = el.querySelector('#h2h-rival');
        if (riv) riv.addEventListener('change', () => {
          Mod.rivalId = riv.value;
          el.querySelector('#h2h-resultado').innerHTML = riv.value ? h2h(mios, j.id, riv.value) : '<p class="vacio-mensaje">Elegí un rival para ver el historial.</p>';
          iniciarIconos();
        });
        const nb = el.querySelector('[data-editar]');
        if (nb) nb.addEventListener('click', () => editarPerfil(el, j));
        const dc = el.querySelector('[data-eliminar-cuenta]');
        if (dc) dc.addEventListener('click', () => eliminarCuenta(el));
        enlazar(el);
      } catch (e) { console.error(e); el.innerHTML = GL.error(e.message); }
      iniciarIconos();
    }
  };

  function enlazar(el) { el.querySelectorAll('[data-login]').forEach(b => b.addEventListener('click', () => PantallaAuth.mostrar(() => Mod.render(el)))); }

  function pendiente() {
    const nombre = (Auth.usuario.user_metadata && Auth.usuario.user_metadata.nombre_usuario) ||
      (Auth.usuario.user_metadata && Auth.usuario.user_metadata.nombre) || Auth.usuario.email;
    return '<div class="estado-vacio">' + icono('hourglass', 40) +
      '<h2>Tu cuenta está pendiente de aprobación</h2>' +
      '<p>Registraste el nombre <strong class="dorado">' + esc(nombre) + '</strong>. El administrador te asignará tu nombre oficial y tu grupo pronto.</p>' +
      '<button type="button" class="btn" data-actualizar-nombre>' + icono('pencil', 16) + 'Completar mi perfil</button>' +
      '</div>';
  }

  /* Editor de perfil: nombre, país, teléfono y foto con vista previa. */
  function editarPerfil(el, j) {
    const nombre = j.nombre_usuario ||
      (Auth.usuario && Auth.usuario.user_metadata && Auth.usuario.user_metadata.nombre_usuario) || '';
    let archivo = null;
    let quitarFoto = false;
    const m = GL.abrirModal({
      titulo: 'Editar perfil',
      ancho: 'ancho',
      cuerpo: '<div class="perfil-foto">' +
          GL.avatarHTML(j, 'avatar') +
          '<div><strong>' + esc(nombre) + '</strong><p class="nota-pie">JPG o PNG · máximo 2 MB</p></div>' +
          '<div class="acciones"><label class="btn sec sm" for="avatar-file">' + icono('camera', 15) + 'Elegir foto</label>' +
          '<input type="file" id="avatar-file" accept="image/jpeg,image/png">' +
          (j.avatar_url ? '<button type="button" class="btn peligro sm" id="quitar-foto">' + icono('trash-2', 15) + 'Quitar foto</button>' : '') +
          '</div></div>' +
        '<div class="campo-row mt">' +
          '<label class="campo"><span>Nombre en FC Mobile</span><input class="input" id="perfil-nombre" maxlength="24" value="' + esc(nombre) + '"></label>' +
          '<label class="campo"><span>País</span><select class="input" id="perfil-pais">' + GL.opcionesPais(j.pais, true) + '</select></label>' +
          '<label class="campo"><span>Teléfono / WhatsApp</span><input class="input" type="tel" id="perfil-tel" maxlength="20" value="' + esc(j.telefono || '') + '" placeholder="9999-9999"></label>' +
        '</div>' +
        '<p class="nota-pie" id="perfil-horario">' + icono('clock', 13) + 'Horario de juego: ' + esc(GL.horarioPais(j.pais)) + '</p>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="perfil-guardar">Guardar cambios</button>',
      onAbrir(fondo, cerrar) {
        const input = fondo.querySelector('#avatar-file');
        const avatar = fondo.querySelector('.avatar');
        input.addEventListener('change', () => {
          archivo = input.files && input.files[0];
          quitarFoto = false;
          if (!archivo) return;
          if (!/^image\/(jpeg|png)$/.test(archivo.type)) {
            GL.notificar('Usá una imagen JPG o PNG.', 'error'); input.value = ''; archivo = null; return;
          }
          if (archivo.size > CONFIG.MAX_AVATAR_BYTES) {
            GL.notificar('La imagen supera los 2 MB.', 'error'); input.value = ''; archivo = null; return;
          }
          const lector = new FileReader();
          lector.onload = () => {
            avatar.classList.add('avatar-con-foto');
            avatar.style.backgroundImage = 'url(' + lector.result + ')';
            avatar.textContent = '';
          };
          lector.readAsDataURL(archivo);
        });
        const quitar = fondo.querySelector('#quitar-foto');
        if (quitar) quitar.addEventListener('click', () => {
          quitarFoto = true; archivo = null; input.value = '';
          avatar.classList.remove('avatar-con-foto');
          avatar.style.backgroundImage = '';
          avatar.textContent = GL.iniciales(nombre);
        });
        const pais = fondo.querySelector('#perfil-pais');
        const horario = fondo.querySelector('#perfil-horario');
        pais.addEventListener('change', () => {
          horario.innerHTML = icono('clock', 13) + 'Horario de juego: ' + esc(GL.horarioPais(pais.value));
          iniciarIconos();
        });
        fondo.querySelector('#perfil-guardar').addEventListener('click', async () => {
          const boton = fondo.querySelector('#perfil-guardar');
          boton.disabled = true;
          try {
            const cambios = {
              nombre_usuario: fondo.querySelector('#perfil-nombre').value,
              pais: pais.value,
              telefono: fondo.querySelector('#perfil-tel').value
            };
            if (!Auth.jugador) {
              await Auth.actualizarNombreJuego(cambios.nombre_usuario);
            } else {
              await Auth.actualizarPerfil(cambios);
              if (archivo) await Auth.subirAvatar(archivo);
              else if (quitarFoto) await Auth.eliminarAvatar();
            }
            cerrar();
            GL.notificar('Perfil actualizado.', 'exito');
            Mod.render(el);
            window.dispatchEvent(new CustomEvent('gl:auth', { detail: { evento: 'PROFILE_UPDATED' } }));
          } catch (e) { GL.notificar(e.message, 'error'); boton.disabled = false; }
        });
      }
    });
    iniciarIconos();
    return m;
  }

  function eliminarCuenta(el) {
    const m = GL.abrirModal({
      titulo: 'Eliminar mi cuenta',
      cuerpo: '<p class="modal-texto">Esta acción es permanente: se borrarán tu cuenta, tus resultados, estadísticas y tu foto de perfil. ' +
        'No se puede deshacer. Escribí <strong class="rojo-txt">ELIMINAR</strong> para confirmar.</p>' +
        '<label class="campo"><span>Confirmación</span><input class="input" id="confirmar-eliminar" placeholder="ELIMINAR" autocomplete="off"></label>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn peligro" id="confirmar-borrado">Eliminar mi cuenta</button>',
      onAbrir(fondo, cerrar) {
        fondo.querySelector('#confirmar-borrado').addEventListener('click', async () => {
          const boton = fondo.querySelector('#confirmar-borrado');
          boton.disabled = true;
          try {
            await Auth.eliminarMiCuenta(fondo.querySelector('#confirmar-eliminar').value);
            cerrar();
            GL.notificar('Tu cuenta fue eliminada.', 'exito');
            location.hash = 'tabla';
            dibujarMenu(); pintarSesion();
            window.dispatchEvent(new CustomEvent('gl:auth', { detail: { evento: 'SIGNED_OUT' } }));
            Mod.render(el);
          } catch (e) { GL.notificar(e.message, 'error'); boton.disabled = false; }
        });
      }
    });
    iniciarIconos();
    return m;
  }

  function statCard(label, ico, valor, color) {
    return '<div class="card"><div class="metrica"><span class="ico">' + icono(ico, 20) + '</span>' +
      '<div><div class="valor ' + (color || '') + '">' + esc(valor) + '</div><div class="label">' + esc(label) + '</div></div></div></div>';
  }

  function esLocal(p, id) { return p.local_id === id; }
  function vallas(partidos, id) {
    return partidos.filter(p => {
      const r = GL.resultado(p);
      return p.estado === 'jugado' && (esLocal(p, id) ? r.gc : r.gf) === 0 && !GL.esResolucionExpulsion(p);
    }).length;
  }
  function suma(partidos, id, kLocal, kVisita) {
    return partidos.reduce((a, p) => a + (Number(esLocal(p, id) ? p[kLocal] : p[kVisita]) || 0), 0);
  }
  function promedio(partidos, id, kLocal, kVisita) {
    const jugados = partidos.filter(p => p.estado !== 'pendiente');
    return jugados.length ? Math.round(suma(jugados, id, kLocal, kVisita) / jugados.length) : 0;
  }
  function racha(partidos, id) {
    const js = partidos.filter(p => p.estado !== 'pendiente').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (!js.length) return { texto: '—', icono: 'minus' };
    let tipo = 0, n = 0;
    for (const p of js) {
      const r = GL.resultado(p);
      const aFavor = esLocal(p, id) ? r.gf : r.gc, enContra = esLocal(p, id) ? r.gc : r.gf;
      const t = aFavor > enContra ? 1 : aFavor === enContra ? 0 : -1;
      if (t === 0) continue;
      if (n === 0) { tipo = t; n = 1; }
      else if (t === tipo) n++;
      else break;
    }
    return { texto: (tipo > 0 ? 'V' : 'D') + n, icono: tipo >= 0 ? 'trending-up' : 'trending-down' };
  }
  function mejor(partidos, id, victoria) {
    let mejorDiff = null;
    partidos.filter(p => p.estado !== 'pendiente').forEach(p => {
      const r = GL.resultado(p);
      const aFavor = esLocal(p, id) ? r.gf : r.gc, enContra = esLocal(p, id) ? r.gc : r.gf;
      const diff = aFavor - enContra;
      if (victoria ? diff > 0 : diff < 0) {
        if (!mejorDiff || (victoria ? diff > mejorDiff.diff : diff < mejorDiff.diff)) mejorDiff = { diff, texto: aFavor + ' - ' + enContra };
      }
    });
    return mejorDiff ? mejorDiff.texto : '—';
  }
  function historial(partidos, id) {
    const js = partidos.filter(p => p.estado !== 'pendiente')
      .sort((a, b) => (b.jornada || 0) - (a.jornada || 0));
    if (!js.length) return '<tr><td colspan="5" class="vacio-mensaje">Sin partidos jugados.</td></tr>';
    return js.map((p, i) => {
      const r = GL.resultado(p), local = esLocal(p, id);
      const aFavor = local ? r.gf : r.gc, enContra = local ? r.gc : r.gf;
      const cls = aFavor > enContra ? 'resultado-v' : aFavor < enContra ? 'resultado-p' : 'resultado-d';
      return '<tr style="animation-delay:' + (i * .03) + 's"><td class="num">' + p.jornada + '</td>' +
        '<td class="izq">' + esc(GL.nombreJugador(local ? p.visitante_id : p.local_id)) + '</td>' +
        '<td>' + icono(local ? 'home' : 'plane', 14) + '</td>' +
        '<td class="' + cls + '">' + aFavor + ' - ' + enContra + '</td>' +
        '<td class="num">' + GL.signo(aFavor - enContra) + '</td></tr>';
    }).join('');
  }
  function proximo(partidos, j) {
    const p = partidos.filter(x => x.estado === 'pendiente' && (x.local_id === j.id || x.visitante_id === j.id))
      .sort((a, b) => a.jornada - b.jornada)[0];
    if (!p) return GL.vacio('No hay próximos partidos programados.', 'calendar-check', null);
    const local = esLocal(p, j.id);
    const rival = GL.jugador(local ? p.visitante_id : p.local_id);
    return '<div class="card proximo-partido" style="padding:14px;border-color:rgba(245,197,24,.45)">' +
      '<div class="flex" style="justify-content:space-between"><span class="dorado mono">Jornada ' + p.jornada + '</span>' +
        GL.badge(local ? 'Local' : 'Visitante', 'gold', local ? 'home' : 'plane') + '</div>' +
      '<div style="font-family:Rajdhani;font-size:21px;font-weight:700;margin:8px 0">vs ' + esc(GL.nombreJugador(rival && rival.id)) + '</div>' +
      '<div class="muted" style="font-size:12px">' + esc(horarioPais(j.pais)) + ' · ' + esc(nombrePais(j.pais)) + '</div></div>';
  }
  function h2h(partidos, id, rivalId) {
    const js = partidos.filter(p => p.estado !== 'pendiente' &&
      ((p.local_id === id && p.visitante_id === rivalId) || (p.visitante_id === id && p.local_id === rivalId)));
    if (!js.length) return '<p class="vacio-mensaje">Todavía no se enfrentaron.</p>';
    let g = 0, e = 0, p = 0, gf = 0, gc = 0;
    js.forEach(x => {
      const r = GL.resultado(x), local = esLocal(x, id);
      const a = local ? r.gf : r.gc, b = local ? r.gc : r.gf;
      gf += a; gc += b;
      if (a > b) g++; else if (a === b) e++; else p++;
    });
    return '<div class="grid tres" style="gap:8px">' +
      statCard('Partidos', 'git-compare', js.length) +
      statCard('Ganados', 'circle-check', g, 'verde-txt') +
      statCard('Empates', 'equal', e) +
      statCard('Perdidos', 'circle-x', p, 'rojo-txt') +
      statCard('Goles a favor', 'goal', gf) +
      statCard('Goles en contra', 'shield-alert', gc) +
      '</div>';
  }

  Modulos.perfil = Mod;
})();
