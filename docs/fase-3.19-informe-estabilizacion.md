# FASE 3.19 — Informe de estabilización y consolidación

## A. Identificación y base

| Concepto | Valor verificado |
|---|---|
| Repositorio | `https://github.com/manu-2323/GOAT-LATINOS` |
| Rama | `main` (sin ramas auxiliares) |
| Base remota al iniciar | `b1d496ef14d2abd0b91206794d30bba9d931f9a8` (FASE 3.17) |
| Commit local previo incluido en el push | `bc9155a9f565f75d895ae0f4dd85304c1658cd04` (FASE 3.18, auditoría) |
| Commit de estabilización | `d1ca7e5ed2c628156d002cf92c455060b505f28d` |
| Naturaleza de la fase | Estabilización funcional y consolidación técnica; no una renovación de backend |
| Sitio público | `https://manu-2323.github.io/GOAT-LATINOS/` |

La FASE 3.19 se trabajó directamente sobre `main`. La auditoría 3.18 se publica junto con este cambio porque el commit `bc9155a` aún no estaba en `origin/main`. El archivo `docs/fase-3.18-auditoria-backlog.md` quedó byte-idéntico al commit: `git diff --exit-code -- docs/fase-3.18-auditoria-backlog.md` terminó con código `0` y el blob `abd6672df917727c794bef98b974641b5590cddd` coincide entre `HEAD` y el árbol de trabajo. No se reescribieron sus cifras, hashes ni evidencias.

Se respetaron los límites de la fase: no se borraron ni marcaron como leídas las 28 notificaciones duplicadas, no se modificaron datos deportivos, no se ejecutaron migraciones ni escrituras SQL en producción, no se cambiaron índices, restricciones, RLS, `GRANT`/`REVOKE`, permisos, RPC existentes, secretos, variables ni cuentas. No se eliminó ni redesplegó `admin-bootstrap`.

---

## B. Prioridades atendidas

| Prioridad | Hallazgo de 3.18 | Estado en 3.19 |
|---|---|---|
| P0-01 | Duplicados de `jornada_abierta` por recarga/cliente | **Mitigado en cliente.** No declarado resuelto en servidor; ver sección F. |
| P1-06 | Módulos cargados dos veces: scripts estáticos + carga dinámica | Resuelto con carga única desde `GL.modulo()`. |
| P1-05 | Campana oculta para administradores; `#jornadas` ausente en el menú «Más» | Resuelto. |
| P2-05 | Auditoría prometía cobertura total sin respaldo real | Resuelto con redacción honesta y métricas «En esta vista». |
| Portabilidad de arneses | Rutas personales, Chrome fijo, `python3`, anchos incompletos | Resuelto: raíz desde `import.meta.url`, HTTP local Node, variables de entorno y ocho anchos. |
| P0-02 | Persistencia/cobertura de auditoría | Queda pendiente a mediano plazo; no bloquea esta publicación. |

---

## C. Cambios funcionales

### C.1 Notificaciones (P0-01)

`js/modulos/notificaciones.js` calcula una clave estable por `tipo + torneo + jugador + dato estructural`:

- `jornada_abierta`: jornada numérica; el texto se usa sólo como respaldo histórico y la lectura es insensible a mayúsculas (`Jornada 3`, `jornada #3`).
- `sancion_aplicada` / `suspension`: ID de sanción, con clave de respaldo por texto normalizado.
- `clasifica_eliminatorias`: una por jugador/torneo.
- `perfil_pendiente` y `jornada_por_cerrar`: una por día, torneo y jugador.
- `resultado_publicado` / `partido_pendiente`: ID de partido cuando está disponible.

También se añadieron:

- `_historial` completo y `_claves` derivadas de él; la vista sigue mostrando 80 filas, pero la deduplicación ya no consulta con `.limit(80)`.
- Guardia `_generando`: dos cargas o clics consecutivos reutilizan la misma promesa y no inician dos inserciones desde el mismo cliente.
- Guardia `_cargando` para reutilizar la lectura en curso.
- `_badgeCargadoPara` para contar una sola vez por jugador desde la campana.
- Escritura de campos estructurales (`jornada_numero`, `sancion_id`, `dia`) en la fila local para que la clave subsista a futuras recargas.
- `Mod._pruebas`, superficie mínima usada por los tests deterministas.

Esto es una **mitigación de cliente**, no idempotencia de base de datos.

### C.2 Carga única de módulos (P1-06)

- `js/core/gl.js`: `GL.modulo(id)` devuelve el módulo ya registrado en `window.Modulos` sin volver a insertar el `<script>`; `GL._scripts` conserva la promesa compartida.
- `index.html`: se eliminaron los `<script>` estáticos de `notificaciones.js`, `auditoria.js` y `dashboard-admin.js`; esos módulos se cargan una sola vez desde `GL.modulo()`.
- Se preservó `app.js?v=1.3.2` porque no fue modificado.

### C.3 Navegación y redacción (P1-05, P2-05)

- `js/ui/menu.js`: la campana se muestra para cualquier `Auth.usuario` (jugador o administrador), con conteo una vez por jugador y limpieza del `onclick` cuando no hay sesión.
- `js/ui/menu.js`: `jornadas` se añadió a `NAV_MOVIL_MAS`; el conjunto de rutas sigue siendo 15.
- `js/modulos/auditoria.js`: «Registro inmutable de todas las operaciones administrativas» pasó a «Eventos disponibles para consulta; cobertura parcial y solo lectura». Las métricas «Histórico completo» y «Últimos 25 registros» pasaron a «En esta vista».

---

## D. Verificadores portables

- Nuevo `scripts/lib-verificacion-visual.mjs`: resuelve `RAIZ` desde `import.meta.url`, sirve mocks por `node:http` en `127.0.0.1`, lanza Chromium con `CHROME_PATH` opcional, bloquea tráfico externo y exporta `ANCHOS = [320, 375, 390, 768, 1024, 1280, 1366, 1920]`.
- Se migraron los seis verificadores visuales (3.3–3.8), los tres `-real.mjs` (3.6–3.8), `capturas.mjs`, `generar-pdf.mjs`, `verificar-fase-3.3-estatico.mjs`, `servir-local-3.6.mjs` y `playwright.config.mjs`.
- `GL_CAPTURAS_DIR` permite redirigir evidencia nueva sin sobrescribir capturas históricas.
- `capturas.mjs` falla temprano si faltan `GL_ADMIN_EMAIL` / `GL_ADMIN_PASS`.
- `playwright.config.mjs` usa `PLAYWRIGHT_BASE_URL`, `CHROME_PATH` y el servidor Node con `PORT`; ya no depende de `python3`.

---

## E. Resultados de verificación

| Comprobación | Resultado |
|---|---|
| Vitest (`node node_modules/vitest/vitest.mjs run`) | **14/14 archivos, 184/184 pruebas**, exit `0`. Incluye la nueva `tests/fase-3.19.test.js` con 13 pruebas. |
| Playwright (`CHROME_PATH=... node node_modules/@playwright/test/cli.js test`) | **24 pruebas: 18 passed, 6 skipped**, exit `0`. Los 6 skips son 2 pruebas preexistentes × 3 viewports (estados de navegación y accesibilidad). |
| `node --check` sobre todos los `.js`/`.mjs` del repositorio | OK. |
| `git diff --check` | El modo estricto señala el final CRLF de `js/modulos/notificaciones.js`, archivo rastreado históricamente como CRLF (`i/crlf`). Con `core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol` queda limpio; una comprobación adicional confirmó **cero espacios reales al final** en líneas añadidas. |
| Búsqueda de rutas/herramientas no portables | Sin `C:/Users/manue`, `C:\Users\manue`, `file:///C:/Users/manue`, Chrome fijo ni `python3 -m http.server` en `scripts/`, `playwright.config.mjs` ni `package.json`. |
| Verificadores visuales 3.3–3.8 | 6 ejecuciones correctas, **78 capturas**, 6 JSON de verificación. Los ocho anchos presentan `scrollWidth === width`, `minControl >= 44`, sin fuentes menores de 12 px, sin desbordes internos, sin solapes y sin iconos sin etiqueta cuando el arnés los mide. |
| Integridad del reporte 3.18 | `git diff --exit-code` limpio y blob `abd6672df…` idéntico. |
| Cache-busting y scripts estáticos | Verificado por tests 3.15, 3.16, 3.17 y 3.19; no quedan `<script src="js/modulos/(notificaciones|auditoria|dashboard-admin).js?v=…">`. |

Los seis verificadores visuales se ejecutaron con `GL_CAPTURAS_DIR` apuntando a una carpeta temporal fuera del repositorio y `CHROME_PATH` al Chrome del sistema. Las evidencias históricas dentro de `docs/capturas-fase-*/` no se sobrescribieron ni se reescribieron trazas `file:///C:/Users/manue/...` de JSON antiguos.

---

## F. Estado real de P0-01 y propuesta técnica (no ejecutada)

### F.1 Lo que sí se logró

La clave estable evita que **un mismo cliente** vuelva a insertar `jornada_abierta` para la misma jornada al recargar, abrir el panel dos veces o recibir eventos Realtime repetidos. La deduplicación consulta todo el historial del jugador, no sólo las 80 filas visibles, y la lectura del texto histórico ya no depende de mayúsculas.

### F.2 Por qué no se declara resuelto

Dos cargas consecutivas correctas no prueban idempotencia: otra pestaña, otro dispositivo, un reintento de RPC o una sesión simultánea pueden crear otra fila. `js/core/config.js` y `supabase/migration-hardening-rpcs.sql:121-142` siguen invocando `gl_crear_notificacion` con un `insert` sin restricción única. Las **28 notificaciones duplicadas** de FASE 3.18 permanecen intactas.

### F.3 Propuesta para autorización futura

Se propone, **sin ejecutar nada en esta fase**:

1. Definir una identidad canónica por fila (`jugador_id`, `tipo`, `torneo_id` y `jornada_numero` / `sancion_id` / `dia` según corresponda).
2. Saneamiento autorizado de las 28 filas históricas, conservando una representación por clave y sin alterar datos deportivos.
3. Restricción de unicidad sobre la identidad canónica (o estrategia equivalente que trate `NULL` de forma determinista).
4. Ajuste de `gl_crear_notificacion` para `insert ... on conflict do nothing` o equivalente, conservando la firma RPC pública.

**Beneficio:** garantía de servidor frente a reintentos, concurrencia y múltiples clientes.
**Riesgos:** migración en producción, bloqueo temporal de escrituras, dependencia del saneamiento previo y posible rechazo de inserciones legítimas si la clave es incompleta.
**Reversión:** retirar la restricción y restaurar la definición previa de la RPC desde el control de versiones; el saneamiento debe documentarse por separado porque borrar filas no es reversible sin respaldo.

Esta propuesta requiere autorización explícita antes de cualquier SQL, migración, cambio de índices, RLS, permisos o RPC.

---

## G. Documentación, límites y deuda conocida

- `README.md` y `docs/CONFIGURACION.md` documentan `CHROME_PATH`, `PLAYWRIGHT_BROWSERS_PATH`, `PLAYWRIGHT_BASE_URL`, `GL_CAPTURAS_DIR` y los ocho anchos.
- Se conservó literalmente la frase exigida por la suite 3.17: ``no lee ni devuelve `ADMIN_PASSWORD` ``.
- Se añadieron avisos de vigencia a documentación histórica (3.9, 3.10, 3.12, 3.16, 3.17, diagnóstico 3.10 y notas PNG en 3.1/3.3/3.4/3.5) sin alterar cifras ni evidencias antiguas.
- Cache-busting vigente: CSS `?v=3.19.0`; `CONFIG.VERSION = '1.3.3'`; `config.js`, `gl.js` y `menu.js` con `?v=1.3.3`; `app.js` permanece `?v=1.3.2`.
- `admin-bootstrap` sigue desplegada y responde `403`; no se eliminó ni se redesplegó.
- Las pruebas E2E con sesión real (`GL_PLAYER_EMAIL` / `GL_PLAYER_PASS`) siguen documentadas pero no ejecutadas; los arneses `-real.mjs` se migraron pero no se corrieron contra credenciales reales.
- No se creó CRUD de Equipos; F-04/F-10/F-11/F-12/F-15/F-16 quedan sin cambios.
- `js/core/config.js:89-97` expone estados `expulsion_*`, pero `resultados.js:8-12` los excluye; queda para fases posteriores.
- No hay modo invitado operativo: `js/app.js:141-157` exige sesión aunque el menú marque rutas `publico`. No se cambió en esta fase.
- Auditoría persistente, transacciones deportivas, reconocimientos y panel público quedan diferidos.
- Se mantuvieron tema oscuro, acentos rojos, Inter, `css/tokens-3.1.css`, vanilla JS y dependencias sin costo. No se hicieron refactorizaciones generales.

---

## H. Publicación

| Elemento | Estado |
|---|---|
| Push | `b1d496e..d1ca7e5  main -> main` correcto para el cambio funcional; el informe final se publica en un commit documental posterior sobre `main`. |
| `origin/main` | Alineado con `HEAD` local tras publicar el informe; sin divergencias. |
| Actions | Run `45890701204` (`pages build and deployment`, run #46) para `d1ca7e5`: **`completed/success`** (`updated_at` `2026-11-26T20:24:14Z`). El push documental posterior genera su propia reconstrucción, verificada externamente. El run anterior de 3.17 fue `45882398178` `completed/success`. |
| Pages | `https://manu-2323.github.io/GOAT-LATINOS/` responde y sirve la app. |
| Archivos públicos | `index.html` en el commit publicado contiene CSS `?v=3.19.0`, `config.js?v=1.3.3`, `gl.js?v=1.3.3`, `menu.js?v=1.3.3` y ya no incluye los tres módulos como scripts estáticos. |

---

## I. Conclusión

FASE 3.19 queda publicada en `main` como una estabilización verificada: notificaciones sin duplicación desde el mismo cliente, módulos cargados una sola vez, campana y navegación móvil corregidas, redacción de auditoría alineada con el estado real y arneses portables. El hallazgo P0-01 continúa **mitigado, no resuelto en servidor**; su corrección definitiva está propuesta en la sección F y espera autorización. No se realizaron escrituras en Supabase ni cambios de permisos, datos deportivos o infraestructura durante esta fase.
