/* Carga los scripts vanilla del proyecto en jsdom para probarlos sin servidor. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as libphonenumber from 'libphonenumber-js';

window.libphonenumber = libphonenumber;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

const raiz = resolve(process.cwd());
const codigo = ['js/core/config.js', 'js/core/gl.js', 'js/core/ui-estados.js', 'js/core/supabase.js']
  .map(archivo => readFileSync(resolve(raiz, archivo), 'utf8'))
  .join('\n');
window.eval(codigo);
