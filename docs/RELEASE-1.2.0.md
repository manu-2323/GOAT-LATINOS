# GOATS LATINOS · Release 1.2.0

> Paleta de este release histórico. Desde FASE 3.1 el sistema canónico es `css/tokens-3.1.css`
> (`#0B0D10`, `#14171B`, `#20252B`, `#E11D35`, Inter); Rajdhani queda sólo en exportaciones PNG
> pendientes (deuda P2-03). Antes de ejecutar los comandos: `npm ci`.

## Cambios principales

1. **Mensajes y estados**: capa `js/core/ui-estados.js` con `GL.mensaje()`, `GL.mensajeCarga()`, `GL.conAccion()` y `GL.estado()` (cargando / contenido / vacío / error). El error técnico se registra en consola y nunca se muestra al usuario. `GL.error()` ya no incluye el bloque «Ver detalle técnico».
2. **Sistema visual**: paleta `#080D18`, `#101827`, `#151F31`, `#E8B923`, `#20C997`, `#F05260`, `#3B82F6`, `#A5B0C0`; escala `--space-1…--space-8`; cuatro familias de botón con seis estados; tarjetas uniformes; skeletons; `prefers-reduced-motion`.
3. **Teléfonos**: `libphonenumber-js` gestiona validación y formato nacional. En Nicaragua se presenta `8108-5555` porque la metadata lo permite; en otros países se usa su formato nacional. E.164 con `+` en base de datos, `https://wa.me/<dígitos>` sin `+`, espacios ni guiones. `telefono_verificado` solo indica validación de formato, nunca existencia de cuenta WhatsApp.
4. **Fotos**: recorte 1:1 centrado, vista previa, compresión canvas a ≤2 MB, validación por cabecera, WebP admitido como entrada y JPG como salida.
5. **IA de capturas**: el botón «Analizar captura con IA» siempre visible, con estado de carga y mensajes legibles.
6. **Tour de administradores**: `js/ui/onboarding-admin.js`, activo en el primer acceso y repetible desde «Ver guía» en el Centro de control.
7. **Herramientas de desarrollo**: Vitest, Playwright, axe-core, Lighthouse y Supabase CLI. Sin dependencias nuevas para el usuario final.

## Migración de base de datos

Ejecutar `supabase/migration-telefonos-1.2.0.sql` (idempotente). Añade `telefono_e164`, `telefono_nacional`, `pais_telefono` y `telefono_verificado`, conservando `telefono`.

## Pruebas

```sh
npm test
npm run test:e2e
npm run lighthouse   # requiere CHROME_PATH y servidor local en :4173
node scripts/capturas.mjs
node scripts/generar-pdf.mjs
```

Resultados obtenidos:

- Vitest: 9/9 pruebas correctas.
- Playwright: 6/6 pruebas correctas en Chromium escritorio (1366×768) y móvil (390×844).
- axe-core: 0 violaciones críticas o graves en los módulos verificados.
- Lighthouse local: rendimiento 52, accesibilidad 98, buenas prácticas 96, SEO 100.
- Capturas: 20 imágenes en `docs/capturas/` con manifiesto, incluidas 360×800, 390×844, 412×915, 768×1024 y 1920×1080.
- Firefox se instaló pero no pudo iniciar en este contenedor; Edge y Safari no están disponibles en Linux. Queda registrado como limitación del entorno.

El informe y manual se publican en `docs/GOAT-LATINOS-Informe-y-Manual-1.2.0.pdf`. No incluye credenciales.
