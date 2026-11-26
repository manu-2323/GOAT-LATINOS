# FASE 3.13 — Validación E2E y funcional del panel principal

Base: commit `ea45e22` (`main`). Validación sobre la versión publicada y sobre copia local de `main`.

## Pruebas ejecutadas y aprobadas

- **Sesión limpia**: una sola pantalla de acceso, sin aviso amarillo, sin `refresh_token` y sin consultas REST administrativas. Solo se solicitaron catálogos públicos (`paises`).
- **Refresh vencido**: la petición `refresh_token` responde `400`, la app limpia la sesión, muestra un único formulario de acceso y no genera notificación amarilla ni consultas administrativas. Tras limpiar el almacenamiento se recupera el estado limpio.
- **Sin exposición de credenciales**: no se usaron ni buscaron credenciales reales; el escenario de refresh usó un valor ficticio solo en `localStorage` del navegador de prueba.
- **Responsive del acceso**: sin desbordes laterales ni solapes en 1366×768, 1920×1080 y 390×844; tarjeta de acceso dentro del viewport en los tres tamaños.
- **Unitarias**: 9 archivos / 112 pruebas aprobadas. Incluye contratos del panel, próximo partido en jornada cerrada con fecha futura, estados vacíos y la nueva regresión de overlay duplicado.
- **E2E**: 8 pruebas aprobadas, 4 omitidas por falta de credenciales, 0 fallidas. Ejecutadas con Node 20 aislado en carpeta temporal; no se modificó la configuración del proyecto.
- **`node --check`**: 27 archivos JS, 0 fallos.

## Pruebas ejecutadas y fallidas

- Ninguna falla funcional quedó abierta.
- Durante la validación, una aserción del propio test responsive usó `offsetParent` sobre un elemento `position: fixed`; se corrigió para usar `getComputedStyle` y dimensiones reales.

## No verificable en producción

- **Login correcto, cierre de sesión y panel administrativo real**: no hay credenciales administrativas autorizadas en el entorno.
- **Panel de jugador vinculado y privacidad entre jugadores**: no hay credenciales de jugador autorizadas.
- **Cuenta sin jugador vinculado**: cubierto por pruebas unitarias, no por sesión real.
- **Próximo partido con datos de production**: no hay jornadas ni partidos cargados. La lógica sí quedó cubierta por pruebas unitarias con datos de contrato real, sin crear información ficticia.

## Corrección realizada

- `js/ui/auth.js`: `PantallaAuth.mostrar()` podía ejecutarse dos veces en paralelo desde el arranque y desde `gl:auth`. Al resolver ambas esperas se creaban dos overlays con el mismo `#auth` y formularios duplicados. Ahora se retira cualquier overlay previo antes de insertar el nuevo.
- `index.html`: se actualizó el cache-buster de `auth.js` a `v=1.2.2` para asegurar que Pages sirva la corrección.
- `tests/fase-3.13.test.js` y `tests/e2e/flujo.spec.js`: nueva cobertura para la regresión, sesión limpia, refresh vencido y responsive.

## Requiere atención posterior

- Validación visual de los paneles con sesiones administrativas y de jugador autorizadas cuando estén disponibles.
- Los cambios de SQL/RLS/datos pendientes de la FASE 3.12 siguen sin aplicar: requieren propuesta y autorización explícitas.
