import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const base = process.cwd();
const leer = rel => fs.readFileSync(path.join(base, rel), 'utf8');
const fallos = [];
const avisos = [];

const cssTokens = leer('css/tokens-3.1.css');
const cssEstilos = leer('css/estilos.css');
const index = leer('index.html');
const gl = leer('js/core/gl.js');

for (const [rel, texto] of [['css/tokens-3.1.css', cssTokens], ['css/estilos.css', cssEstilos]]) {
  try {
    const root = postcss.parse(texto, { from: rel });
    let reglas = 0;
    root.walkRules(() => reglas++);
    console.log(`CSS PARSE OK: ${rel} (${reglas} reglas)`);
  } catch (e) {
    fallos.push(`CSS PARSE FAIL: ${rel} -> ${e.message}`);
  }
}

// :root único y solo en el archivo de tokens.
const rootTokens = (cssTokens.match(/(^|\s):root\s*\{/g) || []).length;
const rootEstilos = (cssEstilos.match(/(^|\s):root\s*\{/g) || []).length;
if (rootTokens !== 1) fallos.push(`:root en tokens = ${rootTokens} (esperado 1)`);
if (rootEstilos !== 0) fallos.push(`:root en estilos.css = ${rootEstilos} (esperado 0)`);

// Una sola familia tipográfica en UI; exportar-png queda fuera de alcance.
const fuentesProhibidas = [
  ['css/estilos.css', cssEstilos],
  ['index.html', index],
  ['js/core/gl.js', gl]
];
for (const [rel, texto] of fuentesProhibidas) {
  if (/Rajdhani/i.test(texto)) fallos.push(`FUENTE PROHIBIDA: ${rel} -> Rajdhani`);
}
const jsDir = path.join(base, 'js');
function recorrer(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { recorrer(p); continue; }
    if (!entry.name.endsWith('.js')) continue;
    if (path.relative(base, p).replace(/\\/g, '/') === 'js/modulos/exportar-png.js') continue;
    const texto = fs.readFileSync(p, 'utf8');
    const rel = path.relative(base, p).replace(/\\/g, '/');
    if (/Rajdhani/i.test(texto)) fallos.push(`FUENTE PROHIBIDA: ${rel} -> Rajdhani`);
    const viejos = texto.match(/#(?:f5c518|00d4aa|ff4757|ff8c00|1a2235|2d3748|d1d5db|9ca3af|4fc3f7|8b5cf6|0a0e1a)\b/g);
    if (viejos) fallos.push(`COLOR LEGACY: ${rel} -> ${[...new Set(viejos)].join(', ')}`);
  }
}
recorrer(jsDir);

// Fuentes menores a 12px en CSS.
const pequenas = [];
for (const m of cssEstilos.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) {
  if (Number(m[1]) < 12) pequenas.push(m[0]);
}
if (pequenas.length) fallos.push(`FONT < 12px en estilos.css: ${[...new Set(pequenas)].join(', ')}`);

// Todas las variables usadas por estilos.css deben existir en tokens.
const definidas = new Set([...cssTokens.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
const usadas = new Set([...cssEstilos.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map(m => m[1]));
const faltan = [...usadas].filter(v => !definidas.has(v));
if (faltan.length) fallos.push(`VARIABLES SIN TOKEN: ${faltan.join(', ')}`);

// Iconos con escala cerrada en el helper compartido.
if (!/const escala = \[14,\s*16,\s*18,\s*20,\s*24,\s*32\]/.test(gl)) {
  fallos.push('ESCALA DE ICONOS FUERA DE gl.js');
}

// El arnés local no debe depender de Supabase remoto.
const arnes = leer('mock-componentes-3.3.html');
if (!arnes.includes('supabase = { createClient')) avisos.push('El arnés local no declara createClient mock');

console.log(`TOKENS DEFINIDOS: ${definidas.size}`);
console.log(`TOKENS CONSUMIDOS POR estilos.css: ${usadas.size}`);
console.log(`FUENTES < 12px: ${pequenas.length}`);
console.log(`RAJDHANI EN UI: ${fuentesProhibidas.some(([, t]) => /Rajdhani/i.test(t)) ? 'sÍ' : '0'}`);
avisos.forEach(a => console.log(`AVISO: ${a}`));

if (fallos.length) {
  console.log('STATIC 3.3 FAILED:');
  fallos.forEach(f => console.log('  ' + f));
  process.exit(1);
}
console.log('STATIC 3.3 OK');
