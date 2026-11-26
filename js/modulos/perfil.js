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
          /* 2.2 — Si la cuenta Auth existe pero el perfil no se pudo completar
             por el teléfono, se ofrece recuperación con otro número. */
          const btnRec = el.querySelector('[data-recuperar-telefono]');
          if (btnRec) btnRec.addEventListener('click', () => recuperarTelefono(el));
          const btnRetry = el.querySelector('[data-reintentar-perfil]');
          if (btnRetry) btnRetry.addEventListener('click', async () => {
            btnRetry.disabled = true;
            try {
              await Auth.cargarPerfil(true);
              await GL.cargarContexto(true);
              Mod.render(el);
            } catch (e) {
              Auth._marcarErrorPerfil(e);
              Mod.render(el);
            }
          });
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
        const rend = EST.calcularRendimiento(mios, j.id);
        const fila = GL.clasificacion().find(c => c.jugador_id === j.id) || {};
        const pos = GL.posicion(j.id);
        const grupo = GL.grupoDeJugador(j.id);

        el.innerHTML =
          '<div class="seccion-head"><div class="seccion-titulo"><h2>Perfil del jugador</h2>' +
            '<p>Estadísticas individuales de la temporada</p></div>' +
            '<div class="seccion-acciones">' +
              (GL.esAdmin() ? '<label class="campo" style="margin:0"><select class="input" id="sel-jugador" aria-label="Elegir jugador para ver su perfil">' +
                GL.jugadores().map(x => '<option value="' + x.id + '"' + (x.id === j.id ? ' selected' : '') + '>' +
                  esc(x.nombre_usuario) + '</option>').join('') + '</select></label>' : '') +
              (Mod.jugadorId === Auth.jugador.id ? '<button type="button" class="btn sec" data-editar>' +
                icono('pencil', 16) + 'Editar perfil</button>' : '') +
              (Mod.jugadorId === Auth.jugador.id && window.OnboardingTour ? '<button type="button" class="btn sec" data-ver-tour>' +
                icono('help-circle', 16) + 'Ver tour</button>' : '') +
              (Mod.jugadorId === Auth.jugador.id ? '<button type="button" class="btn peligro" data-eliminar-cuenta>' +
                icono('trash-2', 16) + 'Eliminar mi cuenta</button>' : '') +
            '</div></div>' +
            (Mod.jugadorId === Auth.jugador.id && window.OnboardingTour
              ? OnboardingTour.htmlBarraPerfil(j) : '') +
          '<div class="card"><div class="header-perfil">' +
            GL.avatarHTML(j, 'avatar') +
            '<div><h2>' + esc(j.nombre_usuario) + '</h2>' +
              '<div class="sub">' +
                '<span class="pais-celda">' + GL.banderaHTML(j.pais, 18) +
                  '<span class="codigo-pais">' + esc(j.pais || '—') + '</span></span>' +
                '<span class="muted" style="font-size:12px" title="' + esc(GL.etiquetaZona(GL.zonaJugador(j))) + '">' + esc(GL.horarioJugador(j)) + '</span>' +
                 ((GL.tel.e164Jugador(j) && (GL.esAdmin() || (Auth.usuario && j.user_id === Auth.usuario.id)))
                  ? GL.linkWhatsapp(j, j.nombre_usuario) : '') +
                estadoTelefonoHTML(j) +
                (pos ? GL.badge('Posición ' + pos + ' · Grupo ' + GL.letraGrupo(grupo), 'gold', 'trophy') : '') +
                (j.suspendido || j.activo === false ? GL.badge('Suspendido', 'red', 'triangle-alert') : GL.badge('Activo', 'green', 'circle-check')) +
              '</div></div></div></div>' +
          '<div class="grid cuatro">' +
            statCard('Partidos jugados', 'calendar-days', rend.pj) +
            statCard('Victorias', 'circle-check-big', rend.pg, 'verde-txt') +
            statCard('Empates', 'equal', rend.pe) +
            statCard('Derrotas', 'circle-x', rend.pp, 'rojo-txt') +
          '</div>' +
          '<div class="grid tres">' +
            statCard('Partidos reales (FC Mobile)', 'calendar-days', rend.partidosReales) +
            statCard('Goles a favor (reales)', 'goal', rend.gf) +
            statCard('Goles en contra (reales)', 'shield-alert', rend.gc) +
            statCard('Goles por partido real', 'goal', rend.promGoles.toFixed(1), 'verde-txt') +
            statCard('Diferencia de gol', 'trending-up', GL.signo(rend.dif)) +
            statCard('Vallas en 0', 'shield', rend.vallas) +
            statCard('Tiros totales', 'crosshair', rend.tiros) +
            statCard('Tiros a puerta', 'crosshair', rend.tirosPuerta) +
            statCard('Promedio posesión (' + rend.posN + ' PJ)', 'pie-chart', rend.promPos + '%') +
            statCard('Promedio precisión pase (' + rend.paseN + ' PJ)', 'route', rend.promPase + '%') +
            statCard('Racha actual', rend.racha.tipo === 'V' ? 'trending-up' : 'trending-down', rend.racha.texto) +
            statCard('Mejor victoria', 'trophy', rend.mejorVictoria) +
            statCard('Peor derrota', 'trending-down', rend.peorDerrota) +
            statCard('Puntos', 'award', fila.pts || 0, 'dorado') +
          '</div>' +
          '<div class="grid dos">' +
            '<div class="card"><div class="card-titulo">' + icono('history', 20) + 'Historial de partidos</div>' +
              '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>J#</th><th class="izq">Rival</th><th>L/V</th><th>Resultado</th><th>Dif</th></tr></thead><tbody>' +
              historial(mios, j.id) + '</tbody></table></div></div>' +
            '<div>' +
              '<div class="card"><div class="card-titulo">' + icono('calendar', 20) + 'Próximo partido</div>' + proximo(todos, j) + '</div>' +
              '<div class="card mt"><div class="card-titulo">' + icono('swords', 20) + 'Head to head</div>' +
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
        el.querySelector('[data-editar]')?.addEventListener('click', () => editarPerfil(el, j));
        // Un solo handler: "Ver tour" siempre reinicia el recorrido desde el paso 1.
        el.querySelector('[data-ver-tour]')?.addEventListener('click', () => {
          if (window.OnboardingTour) OnboardingTour.iniciar(true);
        });
        const dc = el.querySelector('[data-eliminar-cuenta]');
        if (dc) dc.addEventListener('click', () => eliminarCuenta(el));
        enlazar(el);
      } catch (e) { console.error(e); el.innerHTML = GL.error(GL.mensaje(e, 'cargar', 'el perfil'), null, 'el perfil'); }
      iniciarIconos();
    }
  };

  function enlazar(el) { el.querySelectorAll('[data-login]').forEach(b => b.addEventListener('click', () => PantallaAuth.mostrar(() => Mod.render(el)))); }

  /* Formato válido NO equivale a titularidad confirmada. Este distintivo hace
     visible la diferencia sin escribir telefono_verificado desde el frontend. */
  function estadoTelefonoHTML(j) {
    const e164 = GL.tel.e164Jugador(j);
    if (!e164) return '';
    if (j.telefono_verificado === true) {
      return GL.badge('Titularidad confirmada', 'green', 'shield-check');
    }
    if (j.telefono_valido_plan === true || GL.tel.esValido(e164, GL.tel.paisJugador(j))) {
      return GL.badge('Formato válido · titularidad sin confirmar', 'neutral', 'circle-check');
    }
    return GL.badge('Teléfono en revisión', 'orange', 'triangle-alert');
  }

  function pendiente() {
    const meta = Auth.usuario.user_metadata || {};
    const nombre = meta.nombre_usuario || meta.nombre || Auth.usuario.email;
    if (Auth.perfilPendienteTelefono) {
      const estado = Auth.perfilPendienteTelefono;
      const conflicto = estado.motivo === 'telefono_duplicado';
      const errorReal = estado.motivo === 'fallo_recuperacion' || estado.motivo === 'error_carga_perfil';
      const titulo = conflicto
        ? 'Tu cuenta existe, pero el teléfono está en uso'
        : errorReal
          ? 'No se pudo completar tu perfil'
          : 'Tu cuenta existe, pero el perfil quedó pendiente';
      const texto = conflicto
        ? 'El teléfono guardado en tu cuenta ya pertenece a otro jugador. No se creó otra cuenta ni se modificó el perfil ajeno.'
        : errorReal
          ? 'La cuenta de autenticación existe, pero falló la carga o la recuperación del perfil. No se creó ningún perfil ajeno.'
          : 'No pudimos completar tu perfil con los datos guardados en tu cuenta.';
      return '<div class="estado-vacio">' + icono(errorReal ? 'circle-x' : 'triangle-alert', 40) +
        '<h2>' + titulo + '</h2>' +
        '<p>' + texto + '</p>' +
        (estado.detalle ? '<p class="nota-pie">' + esc(estado.detalle) + '</p>' : '') +
        '<p>Podés elegir otro teléfono para finalizar el registro sin crear una cuenta nueva.</p>' +
        '<button type="button" class="btn" data-recuperar-telefono>' +
          icono('phone', 16) + 'Completar con otro teléfono</button>' +
          (errorReal
            ? ' <button type="button" class="btn sec" data-reintentar-perfil>' +
                icono('rotate-cw', 16) + 'Reintentar carga del perfil</button>'
            : '') +
        '</div>';
    }
    return '<div class="estado-vacio">' + icono('hourglass', 32) +
      '<h2>Tu registro aún no está completo</h2>' +
      '<p>Registraste el nombre <strong class="dorado">' + esc(nombre) + '</strong>. ' +
      'Completá tus datos desde el formulario; tu perfil se crea automáticamente con el rol de jugador y el torneo activo.</p>' +
      '<button type="button" class="btn" data-actualizar-nombre>' + icono('pencil', 16) + 'Completar mi perfil</button>' +
      '</div>';
  }

  /* Recuperación segura: actualiza SOLO el metadata del usuario autenticado y
     reintenta la creación del perfil. La titularidad nunca se escribe aquí. */
  function recuperarTelefono(el) {
    const meta = (Auth.usuario && Auth.usuario.user_metadata) || {};
    const paisInicial = String(meta.pais_telefono || meta.pais || 'NI').toUpperCase();
    const anterior = String(meta.telefono_e164 || '');
    const m = GL.abrirModal({
      titulo: 'Completar mi perfil',
      cuerpo: '<p class="modal-texto">Tu cuenta de autenticación existe. Elegí un teléfono que no esté registrado por otro jugador para completar tu perfil. ' +
        'No se creará otra cuenta ni se sobrescribirá ningún perfil ajeno.</p>' +
        (anterior ? '<p class="nota-pie">Teléfono en conflicto: ' + esc(anterior) + '</p>' : '') +
        '<label class="campo"><span>País del teléfono</span>' +
          '<select class="input" id="rec-pais">' + GL.opcionesPais(paisInicial, true) + '</select></label>' +
        '<label class="campo"><span>Nuevo teléfono</span>' +
          '<div class="tel-wrap">' +
            '<button type="button" class="tel-prefijo" id="rec-prefijo" aria-label="Código de país">' +
              (GL.tel.prefijo(paisInicial) ? '+' + GL.tel.prefijo(paisInicial) : '+?') + '</button>' +
            '<input class="input" type="tel" id="rec-tel" maxlength="24" placeholder="8108-5555">' +
          '</div>' +
          '<div class="campo-estado" id="rec-estado" aria-live="polite"></div></label>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="rec-guardar">Guardar y completar</button>',
      onAbrir(fondo, cerrar) {
        const pais = fondo.querySelector('#rec-pais');
        const prefijo = fondo.querySelector('#rec-prefijo');
        const tel = fondo.querySelector('#rec-tel');
        const estado = fondo.querySelector('#rec-estado');
        const actualizar = () => {
          prefijo.textContent = GL.tel.prefijo(pais.value)
            ? '+' + GL.tel.prefijo(pais.value) : '+?';
          if (!tel.value.trim()) { PantallaAuth.estado(estado, '', 'neutral', 'info'); return; }
          const v = GL.tel.validar(tel.value.trim(), pais.value, false);
          PantallaAuth.estado(estado, v.ok ? 'Formato válido: ' + v.e164 : v.mensaje,
            v.ok ? 'bien' : 'mal', v.ok ? 'circle-check-big' : 'circle-x');
        };
        pais.addEventListener('change', actualizar);
        tel.addEventListener('input', actualizar);
        fondo.querySelector('#rec-guardar').addEventListener('click', async () => {
          const boton = fondo.querySelector('#rec-guardar');
          boton.disabled = true;
          try {
            await Auth.recuperarPerfilConTelefono(tel.value.trim(), pais.value);
            cerrar();
            await GL.cargarContexto(true);
            GL.notificar('Perfil completado. Ya podés usar tu cuenta.', 'exito');
            Mod.render(el);
          } catch (e) {
            console.error('[perfil] recuperación:', e);
            estado.textContent = (e && e.message) || 'No se pudo completar el perfil.';
            GL.notificar(estado.textContent, 'error');
            boton.disabled = false;
          }
        });
      }
    });
    iniciarIconos();
    return m;
  }

  /* Editor de perfil: nombre, país, teléfono y foto con vista previa. */
  function editarPerfil(el, j) {
    const nombre = j.nombre_usuario ||
      (Auth.usuario && Auth.usuario.user_metadata && Auth.usuario.user_metadata.nombre_usuario) || '';
    const paisTel = GL.tel.paisJugador(j) || j.pais || 'NI';
    const e164Actual = GL.tel.e164Jugador(j);
    const telInicial = e164Actual
      ? (GL.tel.nacional(e164Actual, paisTel) || e164Actual)
      : String(j.telefono || '');
    let archivo = null;
    let quitarFoto = false;
    const m = GL.abrirModal({
      titulo: 'Editar perfil',
      ancho: 'ancho',
      cuerpo: '<div class="perfil-foto">' +
          GL.avatarHTML(j, 'avatar') +
          '<div><strong>' + esc(nombre) + '</strong><p class="nota-pie">JPG o PNG · máximo 2 MB</p></div>' +
          '<div class="acciones"><label class="btn sec sm" for="avatar-file">' + icono('camera', 16) + 'Elegir foto</label>' +
          '<input type="file" id="avatar-file" accept="image/jpeg,image/png">' +
          (j.avatar_url ? '<button type="button" class="btn peligro sm" id="quitar-foto">' + icono('trash-2', 16) + 'Quitar foto</button>' : '') +
          '</div></div>' +
        '<div class="campo-row mt">' +
          '<label class="campo"><span>Nombre en FC Mobile</span><input class="input" id="perfil-nombre" maxlength="32" value="' + esc(nombre) + '"></label>' +
          '<label class="campo"><span>País</span><select class="input" id="perfil-pais">' +
            GL.opcionesPais(j.pais || 'NI', false) + '</select></label>' +
          '<label class="campo"><span>País del teléfono</span><select class="input" id="perfil-tel-pais">' +
            GL.opcionesPais(paisTel, true) + '</select></label>' +
        '</div>' +
        '<label class="campo"><span>Teléfono / WhatsApp</span>' +
          '<div class="tel-wrap">' +
            '<button type="button" class="tel-prefijo" id="perfil-tel-prefijo" aria-label="Código de país">' +
              (GL.tel.prefijo(paisTel) ? '+' + GL.tel.prefijo(paisTel) : '+?') + '</button>' +
            '<input class="input" type="tel" id="perfil-tel" maxlength="24" value="' + esc(telInicial) + '" placeholder="8108-5555">' +
          '</div>' +
          '<div class="campo-estado" id="perfil-tel-estado" aria-live="polite"></div>' +
          '<small style="color:var(--text-secondary);font-size:11px">Validar el formato no confirma la titularidad del número.</small>' +
        '</label>' +
        '<label class="campo"><span>Ciudad o zona horaria</span><select class="input" id="perfil-zona" required>' +
          GL.opcionesZonaHoraria(j.zona_horaria, j.pais || (Auth.jugador && Auth.jugador.pais)) +
        '</select></label>' +
        '<p class="nota-pie" id="perfil-horario"></p>',
      acciones: '<button type="button" class="btn sec" data-cerrar>Cancelar</button>' +
        '<button type="button" class="btn" id="perfil-guardar">Guardar cambios</button>',
      onAbrir(fondo, cerrar) {
        const input = fondo.querySelector('#avatar-file');
        const avatar = fondo.querySelector('.avatar');
        input.addEventListener('change', async () => {
          const seleccionado = input.files && input.files[0];
          quitarFoto = false;
          archivo = null;
          if (!seleccionado) return;
          GL.notificar('Preparando tu foto…', 'info', 'loader-circle');
          try {
            // 1.2.0: validación real, recorte 1:1 y compresión antes de subir.
            const procesada = await GL.imagen.procesar(seleccionado, {
              maxBytes: CONFIG.MAX_AVATAR_BYTES, lado: 512
            });
            archivo = new File([procesada.blob], procesada.nombre, { type: procesada.mime });
            avatar.classList.add('avatar-con-foto');
            avatar.style.backgroundImage = 'url(' + procesada.vistaPrevia + ')';
            avatar.style.aspectRatio = '1 / 1';
            avatar.textContent = '';
            GL.notificar('Foto lista (' + Math.round(procesada.tamano / 1024) + ' KB).', 'exito');
          } catch (e) {
            console.error('[perfil] imagen:', e);
            GL.notificar(GL.mensaje(e, 'subir', 'la foto'), 'error');
            input.value = '';
          }
        });
        const quitar = fondo.querySelector('#quitar-foto');
        if (quitar) quitar.addEventListener('click', () => {
          quitarFoto = true; archivo = null; input.value = '';
          avatar.classList.remove('avatar-con-foto');
          avatar.style.backgroundImage = '';
          avatar.textContent = GL.iniciales(nombre);
        });
        const pais = fondo.querySelector('#perfil-pais');
        const zona = fondo.querySelector('#perfil-zona');
        const horario = fondo.querySelector('#perfil-horario');
        const tel = fondo.querySelector('#perfil-tel');
        const telPais = fondo.querySelector('#perfil-tel-pais');
        const telPrefijo = fondo.querySelector('#perfil-tel-prefijo');
        const telEstado = fondo.querySelector('#perfil-tel-estado');
        let paisAnterior = telPais.value;

        const actualizarPrefijo = () => {
          const pref = GL.tel.prefijo(telPais.value);
          telPrefijo.textContent = pref ? '+' + pref : '+?';
        };
        const validarTel = () => {
          const valor = tel.value.trim();
          if (!valor) {
            PantallaAuth.estado(telEstado, e164Actual ? 'Si dejás el campo vacío se quitará el teléfono.' : '', 'neutral', 'info');
            return { ok: true, e164: '' };
          }
          const v = GL.tel.validar(valor, telPais.value, false);
          if (!v.ok) {
            PantallaAuth.estado(telEstado, v.mensaje + ' Revisá el país del teléfono.', 'mal', 'circle-x');
          } else {
            PantallaAuth.estado(telEstado,
              'Formato válido: ' + v.e164 + '. La titularidad no se modifica desde el perfil.',
              'bien', 'circle-check-big');
          }
          return v;
        };

        pais.addEventListener('change', () => {
          GL.actualizarZona(zona, pais.value, horario);
          if (!telPais.value || telPais.value === paisAnterior) {
            telPais.value = pais.value || 'NI';
            paisAnterior = telPais.value;
            actualizarPrefijo();
            validarTel();
          }
        });
        telPais.addEventListener('change', () => {
          paisAnterior = telPais.value;
          actualizarPrefijo();
          validarTel();
        });
        telPrefijo.addEventListener('click', () => {
          const opciones = Array.from(telPais.options).map(x => x.value).filter(Boolean);
          const indice = opciones.indexOf(telPais.value);
          telPais.value = opciones[(indice + 1 + opciones.length) % opciones.length] || opciones[0];
          telPais.dispatchEvent(new Event('change'));
        });
        tel.addEventListener('input', validarTel);
        tel.addEventListener('blur', () => {
          const v = GL.tel.validar(tel.value.trim(), telPais.value, false);
          if (v.ok && v.nacional) tel.value = v.nacional;
        });
        zona.addEventListener('change', () => GL.actualizarZona(zona, pais.value, horario, true));
        GL.actualizarZona(zona, pais.value, horario, true);
        actualizarPrefijo();
        if (telInicial) validarTel();
        fondo.querySelector('#perfil-guardar').addEventListener('click', async () => {
          const boton = fondo.querySelector('#perfil-guardar');
          const telRaw = fondo.querySelector('#perfil-tel').value.trim();
          const paisVal = pais.value;
          const zonaVal = zona.value;

          if (!zonaVal) {
            GL.notificar('Elegí tu ciudad o zona horaria para ver los horarios correctos.', 'advertencia'); return;
          }
          // Validar teléfono contra el país del teléfono (puede diferir del país del jugador).
          const v = GL.tel.validar(telRaw, telPais.value, false);
          if (!v.ok) {
            GL.notificar(v.mensaje, 'advertencia'); return;
          }

          boton.disabled = true;
          try {
            const cambios = {
              nombre_usuario: fondo.querySelector('#perfil-nombre').value,
              pais: paisVal,
              zona_horaria: zonaVal
            };
            // Si el número no cambió, no se escriben campos telefónicos: así se
            // conserva el teléfono existente al editar solo nombre o zona horaria.
            const telCambios = GL.tel.cambiosSiNuevos(telRaw, telPais.value, j);
            if (telCambios.__error) {
              GL.notificar(telCambios.__error.mensaje, 'advertencia');
              boton.disabled = false;
              return;
            }
            Object.assign(cambios, telCambios);
            await Auth.actualizarPerfil(cambios);
            if (archivo) await Auth.subirAvatar(archivo);
            else if (quitarFoto) await Auth.eliminarAvatar();
            cerrar();
            GL.notificar('Perfil actualizado.', 'exito');
            Mod.render(el);
            window.dispatchEvent(new CustomEvent('gl:auth', { detail: { evento: 'PROFILE_UPDATED' } }));
          } catch (e) { console.error('[perfil]', e); GL.notificar(GL.mensaje(e, 'guardar', 'el perfil'), 'error'); boton.disabled = false; }
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
          } catch (e) { console.error('[perfil]', e); GL.notificar(GL.mensaje(e, 'guardar', 'el perfil'), 'error'); boton.disabled = false; }
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
  // Los promedios se calculan en EST.calcularRendimiento(): un solo denominador
  // válido por métrica. No se duplica la lógica aquí para evitar divergencias.
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
      '<div style="font-family:var(--gl-font-sans);font-size:21px;font-weight:700;margin:8px 0">vs ' + esc(GL.nombreJugador(rival && rival.id)) + '</div>' +
      '<div class="muted" style="font-size:12px">' + esc(GL.horarioJugador(j)) + ' · ' +
        esc(GL.etiquetaZona(GL.zonaJugador(j))) + '</div></div>';
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
