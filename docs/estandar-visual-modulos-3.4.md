# Estándar visual reutilizable para módulos — FASE 3.4

**Aplica a:** módulos nuevos o rediseños parciales que convivan con FASE 3.1/3.2/3.3.  
**Fuente única de verdad:** `css/tokens-3.1.css`.  
**Referencia implementada:** `js/modulos/dashboard-admin.js` y la capa `FASE 3.4 — DASHBOARD DE REFERENCIA` en `css/estilos.css`.

Este documento no crea una paleta nueva. Describe cómo reutilizar la existente para que otro módulo se vea como el Centro de control sin copiar su lógica ni inventar datos.

---

## 1. Principios obligatorios

1. **Un solo sistema de tokens.** Nunca declarar `:root`, colores fijos nuevos ni fuentes alternas en el módulo. Usar `var(--gl-*)`.
2. **Datos reales únicamente.** Toda cifra, etiqueta, fecha, badge y enlace debe venir de `GL`, del contexto ya cargado o de una derivación de solo lectura sobre esos datos.
3. **Cero consultas decorativas.** Si el módulo ya cargó una colección, reutilízala; no añadir una llamada Supabase por tarjeta.
4. **Contratos primero.** Conservar IDs, selectores, `data-ir`, `data-graf`, `data-estado-accion`, eventos y firma de `render(el)`.
5. **Jerarquía antes que densidad.** Un indicador principal, apoyos secundarios y después el detalle. No apilar KPI sin prioridad.
6. **Estados completos.** Todo módulo debe mostrar carga, vacío, error y datos con los helpers existentes.
7. **Sin dependencias nuevas.** Iconos con `icono()`, gráficas con la librería ya presente y estados con `GL.estado()`.

---

## 2. Estructura recomendada de una pantalla

Para un módulo con resumen + detalle, usar esta secuencia:

```text
<header class="mod-hero card">        ← título, contexto, acciones principales
<section class="mod-bloque">          ← KPI principal + KPI de apoyo
<div class="mod-layout">              ← columna principal + columna lateral
  <div class="mod-col-principal">     ← listados, tablas y gráficas
  <aside class="mod-col-lateral">     ← alertas, resúmenes, acciones
<p class="nota-pie">                  ← actualización real
```

Reglas:

- El prefijo de clase debe ser del módulo (`da-` en dashboard, `xy-` en otro módulo), pero las decisiones visuales son las mismas.
- Usar `gap: var(--gl-space-4|5)` entre bloques y `var(--gl-space-4|5)` de padding en paneles.
- Toda columna lleva `min-width: 0` para evitar overflow en 320 px.
- Nada de `position: absolute` para maquetar el contenido principal.

---

## 3. Encabezado compacto

```js
'<header class="mod-hero card">' +
  '<div class="mod-hero-cuerpo">' +
    '<div class="mod-eyebrow">' + icono('layout-dashboard', 14) + 'Módulo</div>' +
    '<h1>' + esc(tituloReal) + '</h1>' +
    '<p>' + esc(contextoReal) + '</p>' +
    '<div class="mod-hero-meta">' + GL.badge('ROL', 'gold', 'shield') + '</div>' +
  '</div>' +
  '<div class="mod-hero-acciones">…botones reales…</div>' +
'</header>'
```

- `h1`: `--gl-fs-xl`, `--gl-fw-bold`, `--gl-track-display`, `overflow-wrap:anywhere`.
- `p`: `--gl-text-secondary`, `--gl-fs-sm`.
- Los botones usan `.btn` y variantes de FASE 3.3; nunca botones de 40 px.

---

## 4. KPI con jerarquía

- Un KPI principal con `grid-column: span 2`, valor grande y barra `role="progressbar"` cuando exista un progreso real.
- KPI de apoyo con icono, valor, etiqueta y una línea de contexto.
- Todos los valores con `font-variant-numeric: var(--gl-numeric)`.
- En `role="button"` conservar `tabindex="0"`, `click` y `keydown` para `Enter`/`Espacio`.

```js
function kpi(valor, label, ico, sub, link, tono) {
  return '<div class="mod-kpi mod-kpi-' + esc(tono || 'neutral') +
    '" data-kpi role="button" tabindex="0" data-ir="' + esc(link) + '">' +
    '<span class="mod-kpi-ico">' + icono(ico, 20) + '</span>' +
    '<span class="mod-kpi-valor">' + valor + '</span>' +
    '<span class="mod-kpi-label">' + esc(label) + '</span>' +
    '<span class="mod-kpi-sub">' + esc(sub) + '</span>' +
  '</div>';
}
```

Tonos permitidos: `neutral`, `warning`, `danger`. El color de marca se reserva al KPI principal y a acciones primarias.

---

## 5. Paneles, listados y tablas

Cada panel:

```text
.card.mod-panel
  .mod-panel-cab
    h2 con icono de 18 px
    p de contexto (opcional)
    botón de acción real (opcional)
  contenido
```

- Filas de lista:-altura mínima 56 px, borde `--gl-border`, superficie `--gl-surface-2`, hover con `--gl-brand-ring`.
- Marcadores y cifras: 18 px, negrita y `tabular-nums`.
- Badges: usar los existentes (`neutral`, `green`, `orange`, `gold`); no crear nuevos tonos.
- Si no hay datos, no dejar el panel vacío: usar `GL.estado()` o `GL.vacio()`.

---

## 6. Alertas y clasificación resumida

- Las alertas se producen con los criterios ya existentes del módulo; cambiar solo la presentación.
- Un solo mensaje por situación; no duplicar avisos.
- Cada alerta llevará `data-ir` real o, si no tiene destino, no será interactiva.
- La clasificación resumida llama a `GL.clasificacion()` y muestra `pj`, `dif` y `pts` tal como vienen. No recalcular desempates.

Patrón visual:

```text
.mod-alerta           ← borde lateral según tono semántico
  icono 16 px
  texto flexible
  icono arrow-right 14 px si navega
```

---

## 7. Gráficas

- Mantener los IDs históricos (`da-chart-*`, etc.) y destruir instancias previas antes de renderizar de nuevo.
- Usar `GL.tema` para fuente, textos, rejilla y paleta catególica.
- Un `canvas` por tarjeta con `.mod-canvas-wrap` de altura fija (175–190 px) y `maintainAspectRatio:false`.
- Si la serie está vacía, sustituir el canvas por un mensaje `data-graf` / `.sg-vacio`; nunca dibujar ceros inventados.
- Escala de iconos de título: 16 px.

---

## 8. Responsive

Breakpoints usados por el dashboard y recomendados para módulos similares:

| Media query | Ajuste |
|---|---|
| `max-width:1180px` | `layout` a una columna; columna lateral en dos columnas. |
| `max-width:900px` | KPI a dos columnas; principal ocupa dos. |
| `max-width:700px` | Acciones a ancho completo; lateral y gráficas a una columna. |
| `max-width:430px` | KPI compactos; listas apiladas; acciones a una columna. |
| `max-width:360px` | KPI a una columna; cabeceras de panel con botón en línea aparte. |

Verificación obligatoria en `320, 375, 390, 430, 768, 1024, 1366, 1920`:

- `document.documentElement.scrollWidth === window.innerWidth`;
- 0 elementos con `scrollWidth > clientWidth + 1` en contenedores de texto;
- 0 traslapes entre bloques hermanos;
- `minControl >= 44`;
- 0 fuentes visibles menores de 12 px.

---

## 9. Estados y accesibilidad

- Carga inicial: `GL.skeleton(filas, alto, true)` con `aria-busy`.
- Vacío: `GL.estado(contenedor, 'vacio', { titulo, texto, icono, acciones })`.
- Error: `GL.error(GL.mensaje(e, 'cargar', contexto), null, contexto)`.
- Éxito: `GL.notificar()`; nunca mostrar el mensaje técnico.
- Todo elemento interactivo debe tener foco visible con `--gl-focus-ring`.
- Los botones icono requieren `aria-label`.
- Los `role="button"` requieren `tabindex="0"` y manejo de `Enter`/`Espacio`.

---

## 10. Checklist antes de cerrar un módulo

1. ¿El módulo usa solo tokens de `css/tokens-3.1.css`?
2. ¿No hay `:root`, Rajdhani, colores legacy ni fuentes < 12 px en la UI?
3. ¿Todas las cifras y fechas vienen de datos reales?
4. ¿Se conservaron IDs, `data-*`, eventos y navegación?
5. ¿Hay jerarquía clara: un principal, apoyos y detalle?
6. ¿Los paneles vacíos muestran estado en lugar de quedar mudos?
7. ¿Los ocho anchos pasan sin overflow, desbordes ni traslapes?
8. ¿El foco es visible y los controles miden al menos 44 px?
9. ¿Vitest, `node --check`, verificación estática y `git -c core.whitespace=cr-at-eol diff --check` pasan?
10. ¿Se generaron capturas y se confirmó que no hubo commit, push ni deploy?

---

## 11. Fuera de este estándar

- No aplicar este rediseño a `js/modulos/exportar-png.js` sin una fase específica: su salida PNG conserva otra tipografía por decisión histórica.
- No modificar `js/modulos/admin.js` como parte del dashboard; es el panel “Resumen”.
- No tocar SQL, migraciones, RLS, roles ni Supabase remoto desde un cambio visual.
