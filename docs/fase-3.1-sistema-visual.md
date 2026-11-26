# FASE 3.1 — Sistema de diseño visual

**Estado:** sistema definido, **no aplicado globalmente**.  
**Alcance:** frontend visual. No se modificó lógica de negocio ni módulos.

---

## 1. Auditoría de la pantalla actual

| Aspecto | Estado encontrado |
|---|---|
| Hojas de estilo | Un único archivo: `css/estilos.css`, con un `:root` de 18 variables y más de 2000 líneas de reglas. |
| Colores | Identidad dorada (`#f5c518`), fondos azulados (`#0a0e1a`, `#111827`, `#1a2235`, `#1f2d45`) y acentos verde/rojo/azul/morado. |
| Fuentes | `Inter` 400/500/600 para cuerpo y `Rajdhani` 600/700 para títulos, marcadores, badges y botones.(`index.html:14`, `css/estilos.css:34-35`). |
| Tamaños | Desde `9px` hasta `44px`. Hay numerosas reglas en `10px`, `10.5px` y `11px`, por debajo del mínimo propuesto. |
| Iconos | Lucide ya es la biblioteca única, centralizada en `icono()` (`js/core/gl.js:10-18`) con `stroke-width: 1.9` (`css/estilos.css:44`). |
| Residuos no Lucide | `⚠` (`admin.js:402`), `✓/✗` (`auditoria.js:403`), `✕` (`exportar-png.js:132`) y `🔔` (`notificaciones.js:227`). |
| Contraste | `--text-muted: #4b5563` da 2.57:1 sobre el fondo: insuficiente para texto. |

Conclusión: hay una base consistente, pero **los valores están dispersos**: el mismo dorado aparece en gradients, rgba, inline styles y exports. El primer paso es nombrar los roles, no cambiar pantallas.

---

## 2. Paleta validada

Se mantienen los cinco colores propuestos y se añaden tres roles derivados necesarios para accesibilidad y jerarquía.

| Token | Valor | Uso | Contraste sobre fondo |
|---|---|---|---|
| `--gl-bg` | `#0B0D10` | Fondo principal | — |
| `--gl-surface-1` | `#14171B` | Tarjetas | — |
| `--gl-surface-2` | `#20252B` | Superficies elevadas / hover | — |
| `--gl-text` | `#F5F6F7` | Texto principal | 17.98:1 ✅ |
| `--gl-text-secondary` | `#9299A3` | Texto secundario | 6.77:1 ✅ |
| `--gl-text-tertiary` | `#7A828E` | Etiquetas y metadatos | 5.01:1 ✅ (4.63:1 en tarjeta) |
| `--gl-brand` | `#E11D35` | Rellenos, barras, bordes | 4.10:1 ⚠️ (no para texto pequeño) |
| `--gl-brand-text` | `#FF6B7A` | Enlaces / texto de marca | 7.08:1 ✅ |
| `--gl-success` | `#00D4AA` | Éxito / jugado | 10.19:1 ✅ |
| `--gl-warning` | `#F5B301` | Pendiente / alerta | 10.50:1 ✅ |
| `--gl-info` | `#5B9BFF` | Información | 7.02:1 ✅ |

**Decisión sobre el rojo:** `#E11D35` es excelente como color deportivo de relleno, pero no alcanza AA como texto normal sobre `#0B0D10`. Por eso el sistema separa `--gl-brand` de `--gl-brand-text`. El blanco sobre `#E11D35` sí pasa (4.74:1).

**Decisión sobre el dorado:** el dorado actual se conserva temporalmente solo en `exportar-png.js`, porque esas imágenes se comparten externamente. Se migrará en una subfase posterior, no en 3.1.

---

## 3. Tipografía

**Familia única: Inter.** Se descarta mantener Rajdhani porque el objetivo es un sistema único y Inter ya está cargada. La personalidad deportiva se logra con peso 700/800, tracking negativo en títulos y números tabulares, no con una segunda familia.

| Rol | Tamaño | Peso | Interlineado |
|---|---|---|---|
| Logotipo / hero | 44px | 800 | 1.1 |
| Título de página | 26px | 700 | 1.1 |
| Título de tarjeta | 20px | 700 | 1.3 |
| Subtítulo / destacado | 16px | 600 | 1.3 |
| Cuerpo | 14px | 400 | 1.5 |
| Etiqueta uppercase | 12px | 600 | 1.5 |
| Mínimo absoluto | 12px | — | — |

Reglas transversales:

- `font-variant-numeric: tabular-nums` en marcadores, estadísticas, posiciones y cantidades.
- Pesos permitidos: 400, 500, 600, 700, 800. El `index.html` deberá ampliar la petición de Inter cuando se aplique el sistema: `wght@400;500;600;700;800`.
- Se eliminan progresivamente los `font-size` de 9/10/10.5/11px.

---

## 4. Iconografía

**Única biblioteca: Lucide**, siempre vía `icono()` de `GL`. No se añaden librerías nuevas.

Escala permitida: `14 / 16 / 18 / 20 / 24 / 32px`.  
Grosor único: `1.8`.

| Uso | Tamaño |
|---|---|
| Etiquetas e iconos inline en tabla | 14px |
| Botones pequeños / badges | 16px |
| Acciones por defecto | 18px |
| Botones de cabecera | 20px |
| Estados vacíos / énfasis | 24px |
| Onboarding / hero | 32px |

Reglas de accesibilidad:

- Todo botón icono conserva `title` y `aria-label` (ya lo hace `iconBtn()`).
- Iconos ambiguos llevan texto visible o `sr-only`.
- Los cuatro glifos sueltos detectados se reemplazan por Lucide: `triangle-alert`, `check`, `x` y `bell`.
- Los emojis de bandera siguen restringidos a WhatsApp/texto exportado, según `js/core/config.js`.

---

## 5. Archivos entregados

- `css/tokens-3.1.css` — tokens canónicos. **No enlazado desde `index.html`.**
- `docs/fase-3.1-sistema-visual.md` — esta validación y el plan de aplicación.

No se editaron `index.html`, `css/estilos.css` ni módulos JS.

---

## 6. Aplicación prevista (fuera de 3.1)

1. **3.2** — cargar tokens y migrar shell, navegación, botones, inputs y foco.
2. **3.3** — migrar tablas, marcadores, badges, KPIs y gráficos al nuevo rol de marca; aplicar `tabular-nums`.
3. **3.4** — migrar modales, onboarding, notificaciones y exportación PNG; retirar Rajdhani y los glifos sueltos. La exportación PNG **no** se migró: sigue como deuda P2-03/FASE 3.21.
4. Revisión visual en pantallas reales y verificación de contraste antes de dar por cerrada cada subfase.

---

## 7. Criterios de aceptación para la siguiente subfase

- Cero hex/rgba nuevos fuera de `css/tokens-3.1.css`.
- Ningún `font-size` menor a 12px en reglas nuevas.
- Ninguna librería de iconos distinta de Lucide.
- Ningún emoji en la UI, salvo el texto de WhatsApp autorizado.
- Contraste AA para todo texto; `--gl-brand` usado solo como relleno/borde.
- Sin cambios en consultas, permisos, RPC ni flujos de autenticación.
