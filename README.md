# GOAT-LATINOS

GOATS LATINOS · League Manager: aplicación estática (HTML, CSS y JavaScript vanilla) para
administrar torneos, jugadores, jornadas, resultados, clasificación, mensajes y notificaciones.
La versión funcional vigente es `CONFIG.VERSION = 1.3.3` (FASE 3.19); el sistema visual canónico
está en `css/tokens-3.1.css`.

## Arranque

La aplicación no requiere build para usarse. Se puede abrir `index.html` directamente, aunque se
recomienda servirla por HTTP para reproducir el entorno de producción y de las pruebas:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
# o, sin Python:
node scripts/servir-local-3.6.mjs
```

Luego abrir `http://127.0.0.1:4173/`. Las credenciales públicas (URL de Supabase y anon key) ya
están en `js/core/config.js`; no hay secretos de administrador en el repositorio.

## Herramientas de verificación

```bash
npm ci
npm test
npm run test:e2e
```

Los verificadores visuales resuelven la raíz desde `import.meta.url`, sirven los mocks por HTTP
y aceptan `CHROME_PATH`, `PLAYWRIGHT_BROWSERS_PATH`, `PLAYWRIGHT_BASE_URL` y `GL_CAPTURAS_DIR`
desde el entorno. Para
revisar los comandos y el estado de las funciones desplegadas, ver `docs/CONFIGURACION.md`; el
release histórico está en `docs/RELEASE-1.2.0.md` y la auditoría de origen del backlog en
`docs/fase-3.18-auditoria-backlog.md`.
