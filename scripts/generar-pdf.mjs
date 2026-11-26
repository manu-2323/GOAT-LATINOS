/* Genera el informe + manual de usuario en PDF a partir de las capturas reales. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAIZ, lanzarNavegadorVisual } from './lib-verificacion-visual.mjs';

const manifest = JSON.parse(readFileSync(path.resolve(RAIZ, 'docs/capturas/manifiesto.json'), 'utf8'));
const img = nombre => {
  const item = manifest.find(x => x.nombre === nombre);
  return item ? `<img src="${item.archivo}" alt="${item.ruta}">` : '';
};

const capturasModulos = manifest.filter(x => /^0[1-9]|^1[0-4]/.test(x.nombre));
const capturasTamanyo = manifest.filter(x => x.nombre.startsWith('15-'));

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font-family:Inter,Arial,sans-serif;color:#101827;font-size:10.5pt;line-height:1.45;margin:0}
h1{font-family:Arial,sans-serif;font-size:26pt;color:#080D18;margin:0 0 4pt}
h2{font-size:16pt;color:#080D18;border-bottom:3px solid #E8B923;padding-bottom:4pt;margin:18pt 0 8pt}
h3{font-size:12pt;margin:12pt 0 4pt;color:#101827}
p{margin:4pt 0}
small{color:#6B7688}
.cover{height:265mm;background:#080D18;color:#fff;padding:26mm 18mm;page-break-after:always}
.cover .marca{font-size:24pt;font-weight:700;letter-spacing:1px}
.cover .oro{color:#E8B923}
.cover .sub{font-size:12pt;color:#A5B0C0;margin-top:6pt}
.cover .bloque{margin-top:55mm}
.cover .titulo{font-size:30pt;font-weight:700}
.cover .version{display:inline-block;margin-top:12pt;background:#E8B923;color:#080D18;padding:5pt 12pt;font-weight:700}
.cover .pie{position:absolute;bottom:22mm;font-size:9pt;color:#A5B0C0}
table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:9pt}
th,td{border:1px solid #D7DDE6;padding:5pt;vertical-align:top;text-align:left}
th{background:#101827;color:#fff}
tr:nth-child(even) td{background:#F3F6FA}
.badge{display:inline-block;padding:2pt 6pt;border-radius:4pt;font-size:8pt;font-weight:700}
.ok{background:#20C997;color:#080D18}.info{background:#3B82F6;color:#fff}.rev{background:#E8B923;color:#080D18}
.caja{border-left:4px solid #E8B923;background:#F6F8FB;padding:8pt 10pt;margin:8pt 0}
.fig{page-break-inside:avoid;margin:10pt 0;text-align:center}
.fig img{width:100%;max-height:105mm;object-fit:contain;border:1px solid #CCD5E1;border-radius:6pt}
.fig small{display:block;margin-top:3pt}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8pt}
ol,ul{margin:4pt 0 8pt 18pt;padding:0}
.page{page-break-before:always}
code{background:#EEF2F7;padding:1pt 3pt;border-radius:3pt;font-size:8.5pt}
</style></head><body>

<section class="cover">
  <div class="marca"><span class="oro">GOATS</span> LATINOS</div>
  <div class="sub">LEAGUE MANAGER · FC Mobile</div>
  <div class="bloque">
    <div class="titulo">Informe de cambios<br>y manual de usuario</div>
    <div class="version">Versión 1.2.0</div>
    <p class="sub">Mensajes legibles · cuatro estados · teléfonos internacionales · IA de capturas · tour de administradores · sistema visual</p>
  </div>
  <div class="pie">Documento generado automáticamente a partir del repositorio y de capturas reales de la aplicación.<br>Las credenciales de acceso no se incluyen en este documento.</div>
</section>

<h1>Informe de cambios · v1.2.0</h1>
<p><small>Repositorio: github.com/manu-2323/GOAT-LATINOS · Rama: main · Arquitectura: HTML, CSS y JavaScript vanilla + Supabase.</small></p>

<h2>1. Resumen ejecutivo</h2>
<p>Se ha mantenido la arquitectura original y se han <strong>añadido</strong> capas y utilidades sin borrar la lógica existente. El cambio central es que ningún módulo muestra texto técnico ni pantallas vacías: ahora existe un conjunto de cuatro estados reutilizable y un traductor único de errores. El teléfono se valida con la metadata nacional real de <code>libphonenumber-js</code>, se guarda separado en base de datos y el enlace de WhatsApp se genera solo con dígitos. El botón de análisis con IA siempre está visible. Los administradores tienen un recorrido guiado propio.</p>

<table><tr><th>Área</th><th>Qué cambió</th><th>Archivos principales</th></tr>
<tr><td>Mensajes y estados</td><td>Cuatro estados (cargando / contenido / sin información / error), spinner por botón, textos legibles, error técnico solo en consola.</td><td>js/core/gl.js, js/core/ui-estados.js, js/app.js, módulos</td></tr>
<tr><td>Sistema visual</td><td>Paleta oficial, escala --space-1…--space-8, cuatro familias de botón con seis estados, tarjetas uniformes, skeleton, reduced motion.</td><td>css/estilos.css</td></tr>
<tr><td>Teléfonos</td><td>libphonenumber-js, E.164, formato nacional, columnas separadas, wa.me sin + ni guiones, sin afirmar existencia de WhatsApp.</td><td>js/core/gl.js, config.js, supabase.js, migration-telefonos-1.2.0.sql</td></tr>
<tr><td>Fotos</td><td>Validación por cabecera, recorte 1:1 centrado, vista previa, compresión a ≤2 MB, JPG/PNG/WebP de entrada.</td><td>js/core/imagen.js, js/modulos/perfil.js</td></tr>
<tr><td>IA de capturas</td><td>Botón siempre visible, estado de lectura, mensajes amigables y fallback manual.</td><td>js/modulos/resultados.js</td></tr>
<tr><td>Guías</td><td>Tour para administradores y botón «Ver guía» en el centro de control.</td><td>js/ui/onboarding-admin.js, dashboard-admin.js, app.js</td></tr>
<tr><td>Herramientas</td><td>Vitest, Playwright, axe-core, Lighthouse y Supabase CLI como dependencias de desarrollo; sin dependencias nuevas para el usuario final.</td><td>package.json, tests/, scripts/</td></tr>
</table>

<h2>2. Cómo leer los estados</h2>
<div class="caja"><strong>Cargando:</strong> skeleton o barra de progreso con texto concreto («Generando PNG…», «Leyendo la captura…»). <strong>Con contenido:</strong> información normal. <strong>Sin información:</strong> mensaje explicativo y acción sugerida. <strong>Error:</strong> mensaje comprensible con botón «Reintentar»; el detalle técnico queda en la consola del navegador.</div>

<h2>3. Manual del jugador</h2>
<ol>
<li><strong>Entrar:</strong> en la pantalla de acceso introduce tu correo y contraseña. Si es tu primera vez, completa el tour de bienvenida.</li>
<li><strong>Perfil:</strong> escribe tu nombre de FC Mobile, país, ciudad o zona horaria y teléfono. El formato del teléfono se adapta a tu país; en Nicaragua se muestra <code>8108-5555</code>. Sube una foto cuadrada: se recorta y comprime automáticamente.</li>
<li><strong>Tabla:</strong> consulta tu posición. Dorado = puntos y posiciones destacadas; verde = clasificación; rojo = zona de descenso.</li>
<li><strong>Calendario y cuadro de partidos:</strong> consulta fechas, horarios y partidos. Usa «Solo mis partidos» para filtrar. El enlace de WhatsApp abre un chat; no confirma que el jugador tenga cuenta.</li>
<li><strong>Estadísticas y eliminatorias:</strong> revisa tus números y el bracket de la copa.</li>
<li><strong>Notificaciones:</strong> marca como leídas las que ya revisaste.</li>
</ol>

<div class="fig">${img('02-tabla')}<small>Tabla de posiciones: colores, puntos y estados de clasificación.</small></div>
<div class="grid2">
  <div class="fig">${img('13-perfil')}<small>Perfil: teléfono nacional y avatar.</small></div>
  <div class="fig">${img('05-estadisticas-jornada')}<small>Estadísticas de jornada.</small></div>
</div>

<h2 class="page">4. Manual del administrador</h2>
<ol>
<li><strong>Centro de control:</strong> resume jugadores, partidos y jornadas. Pulsa «Ver guía» para repetir el recorrido.</li>
<li><strong>Administración → Configuración:</strong> crea el torneo, la temporada y el número de jornadas; después crea los grupos.</li>
<li><strong>Administración → Jugadores:</strong> crea cuentas, asigna grupos, cambia números y aplica sanciones.</li>
<li><strong>Jornadas:</strong> programa fecha y ventanas de apertura/cierre; abre y cierra cada jornada.</li>
<li><strong>Resultados:</strong> selecciona el partido, elige la captura y pulsa «Analizar captura con IA». Revisa y corrige los datos antes de confirmar. Si la IA no responde, introduce los valores manualmente; el error se mostrará con texto legible.</li>
<li><strong>Mensajes:</strong> genera los textos de jornada con horarios por país y enlaces WhatsApp.</li>
<li><strong>Auditoría y exportaciones:</strong> consulta el historial de cambios y exporta paneles a PNG desde cada módulo.</li>
</ol>

<div class="fig">${img('01-centro-control')}<small>Centro de control y botón «Ver guía».</small></div>
<div class="grid2">
  <div class="fig">${img('08-resultados-ia')}<small>Resultados: botón de IA y carga de captura.</small></div>
  <div class="fig">${img('09-jornadas')}<small>Jornadas: programación y estados.</small></div>
  <div class="fig">${img('10-administracion')}<small>Administración de jugadores y grupos.</small></div>
  <div class="fig">${img('11-mensajes')}<small>Generación de mensajes.</small></div>
</div>

<h2 class="page">5. Recorrido visual de módulos</h2>
<div class="grid2">
${capturasModulos.map(c => `<div class="fig"><img src="${c.archivo}" alt="${c.ruta}"><small>${c.ruta}</small></div>`).join('\n')}
</div>

<h2 class="page">6. Pruebas de tamaño y accesibilidad</h2>
<p>Se capturaron las resoluciones solicitadas. La navegación móvil usa barra inferior y panel «Más»; las tablas mantienen scroll horizontal y cabecera visible; los modales conservan sus botones accesibles.</p>
<div class="grid2">
${capturasTamanyo.map(c => `<div class="fig"><img src="${c.archivo}" alt="${c.nombre}"><small>${c.nombre.replace('15-tabla-','')}</small></div>`).join('\n')}
</div>
<p><small>Nota: Microsoft Edge y Safari no están disponibles en el entorno Linux de pruebas. Firefox fue instalado pero no pudo iniciarse en este contenedor (faltan bibliotecas del sistema), por lo que la validación ejecutable se realizó en Chromium de escritorio (1366×768) y Chromium móvil (390×844), con capturas adicionales en 360×800, 412×915, 768×1024 y 1920×1080. Las comprobaciones se repitieron con axe-core para WCAG 2 A/AA y Lighthouse.</small></p>

<h2 class="page">7. Verificación y mantenimiento</h2>
<table><tr><th>Comprobación</th><th>Resultado</th></tr>
<tr><td>Pruebas unitarias (Vitest): teléfonos, mensajes, cuatro estados</td><td><span class="badge ok">9/9 correctas</span></td></tr>
<tr><td>Navegación y estados en todos los módulos (Playwright)</td><td><span class="badge ok">6/6 correctas en Chromium escritorio y móvil</span></td></tr>
<tr><td>Accesibilidad axe-core (WCAG 2 A/AA)</td><td><span class="badge ok">0 violaciones críticas o graves</span></td></tr>
<tr><td>Lighthouse (rendimiento / accesibilidad / buenas prácticas / SEO)</td><td><span class="badge ok">52 / 98 / 96 / 100</span> · informe en <code>docs/lighthouse-report.json</code></td></tr>
<tr><td>Migración SQL de teléfonos</td><td><span class="badge rev">Idempotente; pendiente de aplicación remota en Supabase</span></td></tr>
</table>
<p>Para aplicar la migración: <code>supabase db push</code> o ejecutar <code>supabase/migration-telefonos-1.2.0.sql</code> en el SQL Editor de Supabase. El código funciona igual si todavía no se aplica, usando la columna histórica <code>telefono</code>.</p>
</body></html>`;

const htmlPath = path.resolve(RAIZ, 'docs/GOAT-LATINOS-Informe-y-Manual-1.2.0.html');
writeFileSync(htmlPath, html);
const navegador = await lanzarNavegadorVisual();
const pagina = await navegador.newPage();
await pagina.goto(pathToFileURL(htmlPath).href);
await pagina.waitForTimeout(1200);
await pagina.pdf({
  path: path.resolve(RAIZ, 'docs/GOAT-LATINOS-Informe-y-Manual-1.2.0.pdf'),
  format: 'A4', printBackground: true, preferCSSPageSize: true
});
await navegador.close();
console.log('PDF generado:', 'docs/GOAT-LATINOS-Informe-y-Manual-1.2.0.pdf');
