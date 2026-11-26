# Informe de publicación — FASE 3.9

Fecha: 2026-11-26

Repositorio: `manu-2323/GOAT-LATINOS`

Estado: publicación controlada completada en rama de trabajo; sin despliegue a producción.

## 1. Objetivo y alcance

Consolidar y publicar en GitHub el estado acumulado de FASES 1, 2 y 3.1–3.8, conservando el historial previo y sin aplicar cambios a producción. La publicación incluye telefonía 1.2.1/2.2, seguridad 2.3, sistema visual 3.1–3.3 y los rediseños aditivos de Dashboard, Jugadores, Equipos, Resultados y Mensajes correspondientes a 3.4–3.8.

## 2. Rama

Rama de trabajo: `feature/telefonia-1.2.1-migration`.

- Base local y remota antes del commit: `f780cdee876b3403470bdc485762d7e102555cbd`.
- No se publicó en `main`.
- No se creó pull request automáticamente; GitHub solo sugirió la URL de creación tras el push.

## 3. Remoto

Remote verificado:

```text
origin  https://github.com/manu-2323/GOAT-LATINOS.git (fetch)
origin  https://github.com/manu-2323/GOAT-LATINOS.git (push)
```

Repositorio confirmado como público y perteneciente a `manu-2323/GOAT-LATINOS` mediante la API pública de GitHub.

## 4. Archivos incluidos

Commit principal `6ee17cd`: **178 archivos**, **16430 inserciones** y **1831 eliminaciones**.

Incluye:

- 31 archivos previamente rastreados y modificados: `css/estilos.css`, `index.html`, `js/app.js`, núcleo y módulos JS, `js/ui/*`, `package.json`, `package-lock.json`, SQL previo y pruebas de telefonía.
- 147 archivos nuevos, entre ellos:
  - `css/tokens-3.1.css`.
  - Informes `docs/fase-3.1-sistema-visual.md`, `docs/estandar-visual-modulos-3.4.md` y `docs/fase-3.2-informe.md` a `docs/fase-3.8-informe.md`.
  - Evidencias en `docs/capturas-fase-3.2/` a `docs/capturas-fase-3.8/` (PNG y JSON).
  - Arneses locales `mock-componentes-3.3.html`, `mock-dashboard-3.4.html`, `mock-jugadores-3.5.html`, `mock-equipos-3.6.html`, `mock-resultados-3.7.html` y `mock-mensajes-3.8.html`.
  - Verificadores en `scripts/` para fases 2.2, 2.3 y 3.1–3.8.
  - SQL `supabase/migration-telefonos-1.2.1.sql`, `supabase/migration-telefonos-2.2.sql`, `supabase/migration-seguridad-2.3.sql` y `supabase/tests/fase-2.3.sql`.
  - Pruebas `tests/fase-2.2.test.js`, `tests/fase-2.3.test.js`, `tests/telefonia-1.2.1.test.js` y `tests/migracion-telefonia-1.2.1.test.js`.

La selección se hizo con rutas explícitas mediante `git add -- <archivo>`, nunca con `git add .`.

## 5. Archivos excluidos

No se incluyeron:

- `.env`, `.env.*`, `supabase/.env*` ni archivos `*.key`.
- `node_modules/`, `test-results/`, `playwright-report/`, `*.log` ni temporales del sistema.
- Credenciales reales de prueba ni el informe PDF generado ya excluido por `.gitignore`.
- Cambios de configuración de GitHub Pages o workflows; no existen workflows locales nuevos.
- Archivos eliminados: ninguno.

La revisión `git diff --cached --name-status` confirmó únicamente entradas `M` y `A`.

## 6. Seguridad

- `js/core/config.js` conserva únicamente la clave pública `anon`; el JWT fue decodificado y confirma `"role":"anon"`, `iss: supabase` y expiración `2111057802`.
- No aparece `service_role` como valor de clave en el código, el índice ni el historial reciente; las menciones de `service_role` en SQL/documentación son referencias a roles, no secretos.
- No se encontraron correos personales, contraseñas ni números privados en el contenido del commit.
- Los verificadores reales toman credenciales de `process.env.GL_ADMIN_EMAIL` y `process.env.GL_ADMIN_PASS`; no las incorporan como literales.
- Hashes verificados antes del commit:
  - `supabase/migration-seguridad-2.3.sql`: `BED31B2D08D3CA38576FE46E997BD218CA09B8B9B7B53AF97AF811BAB7363D18`.
  - `supabase/tests/fase-2.3.sql`: `BC29237F03E36A8FF20CCB8AEE077E1CFE90129A08C93995F3D00E5AC4D81D0C`.
  - `supabase/configuracion-completa.sql`: `D844045A8B28FA867C871E085B7AA354070474EA0E242D274C4A4FCE9FEBC197`.
  - `supabase/migration-telefonos-2.2.sql`: `C2D0022B7243A78D118F8605014AD24E43CFBAFAC077059C2FF072B9753D1286`.

## 7. Pruebas

Batería ejecutada antes del commit:

- Vitest: **6 archivos, 80 pruebas, 80 correctas**.
- Sintaxis JS: **52/52 archivos** con `node --check`.
- Estático 3.3: `css/estilos.css` con 1684 reglas, 96 tokens consumidos, 0 fuentes `<12px`, 0 usos de Rajdhani en UI.
- Parseo CSS: `css/tokens-3.1.css` y `css/estilos.css` correctos.
- Rutas locales: 8 archivos HTML con referencias existentes.
- `git -c core.whitespace=cr-at-eol diff --check`: correcto.
- Visual 3.4: 8 anchos, 0 desbordes, 4 estados, foco accesible.
- Visual 3.5: 8 anchos, filtros `7 -> 1 -> 7`, 3 validaciones, modal móvil dentro del viewport.
- Visual 3.6: 8 anchos, 2 tarjetas, navegación correcta, 0 errores de consola.
- Visual 3.7: 8 anchos, 4 partidos, guardado habilitado, IA habilitada, 0 errores de consola.
- Visual 3.8: 12 capturas, 8 anchos, 0 desbordes, copiar/descargar/WhatsApp verificados.
- Verificaciones reales autenticadas de 3.6, 3.7 y 3.8 ejecutadas previamente en modo solo lectura.

## 8. Commit y hash

Mensaje:

```text
Consolidar fases 2.x y 3.1-3.8: rediseño visual y migraciones
```

Hash completo: `6ee17cdd931d171e9799291fb44e5c4d60f035ee`

Hash corto: `6ee17cd`.

El presente informe se incorpora en un commit documental posterior, sin enmendar ni reescribir el commit principal.

## 9. Push

Comando ejecutado:

```text
git push origin feature/telefonia-1.2.1-migration
```

Resultado: rama remota nueva creada correctamente, sin `--force`, sin `--all` y sin tags.

## 10. Sincronización

Tras el push:

- HEAD local: `6ee17cdd931d171e9799291fb44e5c4d60f035ee`.
- `refs/heads/feature/telefonia-1.2.1-migration`: `6ee17cdd931d171e9799291fb44e5c4d60f035ee`.
- `refs/heads/main`: `f780cdee876b3403470bdc485762d7e102555cbd`.
- `git status -sb`: rama limpia, sin cambios pendientes en el momento de la verificación.

No hubo divergencia ni rebase. No se usaron `git reset --hard`, `git clean -fd`, `git checkout -- .` ni `git restore .`.

## 11. Actions y Pages

Verificación previa al push:

- Workflow `pages-build-deployment`, id `428666809`, activo.
- Último run: `45654166259`, sobre `main` y commit `f780cde`, estado `success`.
- Deployment `8063156047`, entorno `github-pages`, `ref: main`.
- Sitio público `https://manu-2323.github.io/GOAT-LATINOS/` responde correctamente.

Tras el push a la rama de trabajo:

- El listado de runs sigue en 33; no se generaron ejecuciones nuevas.
- `main` continúa en `f780cde`, por lo que el sitio publicado permanece en la versión 1.2.0.
- No se modificó la configuración de Pages ni se ejecutó un despliegue manual.

## 12. Incidencias

- Avisos CRLF preexistentes en cinco archivos; no afectan el resultado de `diff --check` con `core.whitespace=cr-at-eol`.
- La app real conserva la incidencia preexistente `42703 · column jugadores.telefono_nacional does not exist`, con 3 respuestas HTTP 400 en consultas de `jugadores`. No fue corregida en esta fase.
- El endpoint `/pages` de la API devolvió 404, pero la actividad de Pages se verificó mediante `/actions/workflows`, `/actions/runs`, `/deployments` y el sitio público.
- GitHub CLI (`gh`) no está instalado en el entorno; se usó la API REST pública de GitHub.
- El run `45652388552` fue un fallo previo de Pages sobre `f780cde`, seguido por el run `45654166259` exitoso.

## 13. Confirmación de límites

Se confirma que:

- No se aplicaron migraciones SQL ni cambios en Supabase.
- No se modificaron auth, roles ni permisos.
- No se incluyeron secretos ni credenciales privadas.
- No se hizo push forzado ni reescritura de historial.
- No se publicó en `main` ni se activó un despliegue de GitHub Pages.
- Se conservaron íntegramente fases 1, 2 y 3.1–3.8 en el commit publicado.
