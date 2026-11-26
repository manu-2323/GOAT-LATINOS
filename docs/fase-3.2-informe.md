# FASE 3.2 — Informe de implementación y verificación

Fecha: 2026-11-25  
Repositorio: `GOAT-LATINOS-deploy` (trabajo local, sin commit/push/deploy)

## 1. Resumen ejecutivo

Se implementó la FASE 3.2 real: tokens globales carbon/red, identidad visual consistente, shell y navegación accesibles, iconografía normalizada y responsive sin desbordamiento horizontal. La verificación no se limitó a análisis estático: se ejecutaron 80 tests, parseo CSS, chequeo de sintaxis de 26 archivos JS, `git diff --check`, comparación de hashes de archivos Supabase y una sesión Playwright local con mock (sin Supabase remoto) que validó 8 anchos, navegación, foco, movimiento reducido y capturas antes/después.

Estado: **implementado y verificado en entorno local**. No se declara disponible en producción.

## 2. Alcance y restricciones

Se cumplieron las restricciones solicitadas:

- No se modificaron DB/SQL/RLS/Supabase remoto/auth/permisos/roles/lógica de negocio/datos.
- No se instalaron dependencias nuevas.
- No se hizo commit, push ni deploy.
- Se preservaron los cambios previos de FASE 2.2, 2.3 y 3.1.
- `css/tokens-3.1.css` sigue siendo la fuente única de tokens; no se duplicaron tokens en `css/estilos.css`.
- `scripts/verificar-fase-3.1.ps1` no fue modificado.
- Los cambios en `package.json`, `package-lock.json`, `tests/setup.js`, `tests/telefonia.test.js` y en archivos `supabase/` visibles en `git status` son preexistentes de fases anteriores; FASE 3.2 no los tocó.

## 3. Continuidad con fases anteriores

- Se reutilizó `css/tokens-3.1.css`, `docs/fase-3.1-sistema-visual.md` y `scripts/verificar-fase-3.1.ps1`.
- El verificador histórico 3.1 quedó incompatible por diseño con la aplicación global de tokens: exige que `tokens-3.1.css` **no** esté linkeado. Al volver a ejecutarlo se mantuvo el fallo esperado, sin cambios en el script:

  ```text
  FASE 3.1 STATIC VERIFICATION FAILED: 3 problem(s)
    FORBIDDEN: index.html -> tokens-3.1.css
    FORBIDDEN: css/estilos.css -> tokens-3.1.css
    MISSING: css/tokens-3.1.css -> NO APLICADO GLOBALMENTE
  EXIT=1
  ```

- `supabase/tests/fase-2.3.sql` continúa sin ejecutar por falta de PostgreSQL local; FASE 2.3 sigue en estado “lista para nueva revisión independiente”, no en producción.

## 4. Cambios implementados

- **`index.html`**: `theme-color` carbon, favicon rojo, Inter `400;500;600;700;800`, Rajdhani removida del shell, tokens linkeados, skip link, `aria-label`, `.topbar-acciones`, `#contenido-principal` y `#vista tabindex="-1"`.
- **`css/tokens-3.1.css`**: tokens canónicos, aliases legacy, z-index, foco, disabled, pending, sombras y movimiento.
- **`css/estilos.css`**: se eliminó el `:root` duplicado; Rajdhani = 0; dorado/azul antiguos = 0; llaves 1115/1115; variables `undefined` = 0; botones, cards, estados, navegación móvil, sheet y reduced-motion tokenizados. Se corrigieron fuentes reales por debajo de 12px y el desbordamiento de `.sr-only` a 320px.
- **`js/ui/menu.js`**: `aria-current`, `data-mas-ids`, iconos 14/16, botón de login sin padding inline.
- **`js/app.js`**: handler del skip link, `aria-expanded` sincronizado al cerrar menú, `aria-current` en sidebar y “Más”.
- **`js/core/gl.js` y módulos**: `icono()` normaliza cualquier tamaño a la escala permitida y se normalizaron 129 llamadas literales fuera de escala. El stroke global queda en `1.8` mediante `--gl-icon-stroke`.

Decisión visual: `#E11D35` para rellenos/bordes y `#FF6B7A` para texto/links/foco por contraste. No se agregó colapso de sidebar desktop; se conserva el drawer `<=1050px`.

## 5. Paleta, tipografía, numeración e iconografía

- Paleta carbon aplicada: fondo `rgb(11, 13, 16)` (`#0B0D10`) verificado en navegador.
- Semánticos success/warning/error/info/pending preservados.
- Inter es la única fuente de la UI global intervenida. Rajdhani = 0 en `css/estilos.css`.
- `font-variant-numeric: tabular-nums` aplicado a scores/stats/posiciones/conteos mediante `--gl-numeric`.
- Auditoría real de iconos:

  ```text
  fueraDeEscala=0
  distribución: 14=102, 16=98, 18=13, 20=32, 24=2, 32=7
  --gl-icon-stroke=1.8
  ```

- Tamaños de fuente reales menores a 12px: **0** en parseo CSS y **0** en los 8 anchos evaluados con navegador.

## 6. Responsive y accesibilidad

Playwright con Chrome del sistema validó:

| Ancho | `innerWidth` | `scrollWidth` | Fuentes <12px | Solapes nav |
|---:|---:|---:|---:|---:|
| 320 | 320 | 320 | 0 | 0 |
| 375 | 375 | 375 | 0 | 0 |
| 390 | 390 | 390 | 0 | 0 |
| 430 | 430 | 430 | 0 | 0 |
| 768 | 768 | 768 | 0 | 0 |
| 1024 | 1024 | 1024 | 0 | 0 |
| 1366 | 1366 | 1366 | 0 | 0 |
| 1920 | 1920 | 1920 | 0 | 0 |

Accesibilidad verificada en navegador:

- Skip link enfocado primero: `outlineColor = rgb(255, 107, 122)`, `outlineWidth = 2px`.
- `aria-current="page"` correcto para `calendario`, `administracion` y `tabla`.
- En `administracion`, `aria-current="page"` también en `#btn-mas-nav`.
- `aria-expanded="false"` en `#btn-menu` después de navegar.
- `prefers-reduced-motion`: `scrollBehavior = auto`, animación de barra = `none`.

## 7. Verificación automática y estática

Ejecutado con resultado real:

- **Tests**: `80 passed (80)` en 6 archivos (`vitest v2.1.9`, `run --no-cache`).
- **Sintaxis JS**: `SYNTAX OK (26 archivos)` con `node --check`.
- **CSS**: `tokens-3.1.css PARSE OK`, `estilos.css PARSE OK`, `roots=1`, `rajdhani=0`, llaves `1115/1115`, `undefinedVars=0`, `oldGold=0`, `font-size<12=0`.
- **`git diff --check`**: sin errores de whitespace; solo warnings LF→CRLF ya conocidos en archivos Working Copy.
- **Hashes Supabase**: `OK` para `migration-seguridad-2.3.sql`, `tests/fase-2.3.sql`, `configuracion-completa.sql` y `migration-telefonos-2.2.sql`.
- **Verificador 3.1**: fallo esperado por incompatibilidad histórica, documentado en la sección 3.

## 8. Verificación visual y navegación

Se usó un harness local con `window.supabase={createClient:()=>null}` y `page.route` abortando todo tráfico HTTP(S) externo; por tanto, **no hubo dependencia de Supabase remoto**.

Evidencia generada en `docs/capturas-fase-3.2/`:

- `antes-escritorio-1366.png`
- `despues-escritorio-1366.png`
- `antes-movil-390.png`
- `despues-movil-390.png`
- `verificacion-playwright.json`

Las imágenes “antes” se generaron con copias `HEAD` de `index.html`, `css/estilos.css`, `js/app.js` y `js/ui/menu.js`; las “después” con el estado final de FASE 3.2. La comparación visual confirma el paso de la paleta azul/dorada anterior a la identidad carbon/red, con navegación y jerarquía conservadas.

## 9. Limitaciones y chequeos no ejecutados

- Sin `GL_ADMIN_EMAIL` / `GL_ADMIN_PASS`: no se ejecutaron E2E dependientes de login real.
- Sin PostgreSQL local: `supabase/tests/fase-2.3.sql` sigue sin ejecutar.
- Playwright no tenía browsers descargados; se usó Chrome del sistema con Node 24. No se instaló ningún browser ni dependencia.
- La verificación visual fue con mock local, no contra backend real.
- Rajdhani permanece referenciada en JS/export PNG para fase posterior; FASE 3.2 solo la eliminó de la UI global intervenida.
- No se validó despliegue ni entorno remoto.

## 10. Conclusión y estado final

FASE 3.2 quedó **implementada y verificada localmente** con evidencia automática y visual. No se encontraron desbordamientos horizontales en 320/375/390/430/768/1024/1366/1920, ni fuentes menores a 12px, ni iconos fuera de escala, ni regresiones en los 80 tests. Supabase y sus hashes permanecen intactos respecto de la recaptura de referencia; los cambios visibles en `git status` en ese ámbito son preexistentes de FASE 2.x.

No se realizó commit, push ni deploy. Para promover este trabajo a producción corresponde primero ejecutar la revisión independiente pendiente de FASE 2.3 y, si aplica, credentializar los E2E de login.
