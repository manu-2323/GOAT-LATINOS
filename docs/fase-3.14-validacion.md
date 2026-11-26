# FASE 3.14 — Validación breve de Calendario y Cuadro de partidos

## Alcance

Se cerró la revisión de Calendario y Fixture como **dos módulos distintos**, con datos reales de Supabase y sin tocar SQL, RLS, resultados históricos ni datos de producción.

La palabra visible **“Fixture”** se sustituyó por **“Cuadro de partidos”** (y **“Cuadro”** en la barra móvil). Los identificadores internos (`id: 'fixture'`, `Modulos.fixture`, `gl_generar_fixture`, clases CSS heredadas) se conservan para no romper rutas, contratos ni registros históricos.

## Cambios principales

- **`js/modulos/fixture.js`**: reescrito como vista estructural del torneo.
  - Una sola consulta de partidos por torneo; filtrado por grupo en cliente.
  - Deduplicación por `jornada|local_id|visitante_id`, con aviso visible si aparecen repetidos.
  - Agrupación real por jornada, sin inventar fechas: la fecha se toma de `jornadas` y, si falta, se muestra **“Sin programación”**.
  - Filtros `Todos`, `Pendientes`, `Disputados`, `Sin programación`, selector de jornada, acceso rápido `J1…J22` y **“Solo mis partidos”**.
  - Botón **“Limpiar filtros”** cuando hay cualquier filtro activo y estado vacío con el mismo acceso.
  - Solamente los estados reales: `pendiente`, `jugado`, `walkover_local`, `walkover_visitante`, `doble_ausencia`, `expulsion_local`, `expulsion_visitante`.
  - La generación sigue protegida: exige 12 jugadores activos por grupo, bloquea la regeneración si hay resultados y usa `gl_generar_fixture`.
  - El botón de generación aparece solo para administradores.
- **`js/modulos/calendario.js`**: permanece como módulo de fechas, programación, zonas horarias y exportación ICS; no se fusionó con el cuadro.
- **Etiquetas visibles actualizadas**: menú de escritorio y móvil, Inicio, onboarding, panel de administrador, mensajes de tabla, auditoría, generación admin, PDF, documentación y títulos E2E.
- **`css/estilos.css`**: reglas `.fx-*` para que el card del cuadro no herede el grid de tres columnas pensado para las tarjetas de la tabla.
- **Cache-busting**: CSS `v=3.2.2`, scripts estáticos y `CONFIG.VERSION` `1.2.3`.

## Verificación

- `node --check`: 0 fallos en los archivos modificados.
- Vitest: **10 archivos, 120 pruebas, todas pasadas** (se añadió `tests/fase-3.14.test.js` con 8 pruebas).
- Playwright: **10 pasadas, 4 omitidas, 0 fallidas** en `chromium-desktop` (1366×768) y `chromium-mobile-390` (390×844).
- Las pruebas nuevas cubren renombrado visible, separación Calendario/Cuadro, deduplicación, filtros, selector de jornada, estados reales, permisos y round-robin de 12 jugadores.

## Limitaciones

No había credenciales de administrador/jugador ni torneo con jornadas y partidos suficientes en producción, por lo que no se recreó un torneo completo. No se crearon datos ficticios, no se ejecutaron migraciones y no se modificaron RLS, permisos ni resultados. Las escrituras deportivas siguen sujetas al contrato real ya documentado.
