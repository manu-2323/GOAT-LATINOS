# QA — Módulo 06: Calendario y programación (1.0.17)

## Alcance

- **Versión**: `CONFIG.VERSION = 1.0.17`; 13 referencias `?v=1.0.17` en `index.html` (incluye `dashboard-admin.js`, que antes no tenía cache-busting).
- **Archivos**: `js/modulos/calendario.js` (nuevo), `js/ui/menu.js`, `js/core/config.js`, `index.html`, `css/estilos.css`, `supabase/migration-calendario-1.0.17.sql`.
- **Navegación**: el acceso «Calendario» abre el módulo nuevo en menú lateral y barra móvil; el fixture se renombra «Fixture» y queda disponible en el panel «Más».
- **Vistas**: calendario mensual, jornadas abiertas/cerradas, partidos pendientes, próximos enfrentamientos, fechas límite, horarios internacionales, historial y panel de programación protegido por rol.
- **Idioma y formato**: textos en español, fechas `DD/MM/YYYY`, zonas IANA con `Intl.DateTimeFormat`, iconos Lucide, sin emojis.

## Datos y seguridad

- Supabase es la única fuente. No se crean ni duplican partidos.
- **Disponibilidad**: no existe tabla ni columna de confirmación en la base. La interfaz muestra `Sin registrar` en jugadores y administradores; no se inventan estados ni se guarda estado local como oficial.
- **WhatsApp**: la vista pública `jugadores_publicos` sigue sin exponer teléfonos. Se añadió `gl_contactos_whatsapp(p_jugador_ids uuid[])`, `SECURITY DEFINER`, con `search_path=public, pg_temp`, límite de 1–50 jugadores y autorización solo para compañeros de grupo del jugador autenticado o administradores.
- Verificación remota de la RPC: `security_definer=true`, `config=["search_path=public, pg_temp"]`, ACL `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` (sin `anon`).
- **Permisos**: el panel de programación solo se renderiza con `GL.esAdmin()`; las acciones vuelven a validar rol con `GL.asegurarAdmin()`. No se activaron cuentas admin ni se tocó `bootstrap_completado`. Manuel sigue como `jugador`, `super_admin=false`.
- No hay credenciales privadas, JWTs, contraseñas, `SERVICE_ROLE_KEY` ni `GEMINI_API_KEY` en frontend, migración ni documentación.

## Validación en navegador

- Sintaxis comprobada en `config.js`, `menu.js`, `calendario.js` y `dashboard-admin.js`: estado `200` y `sintaxis: ok` en los cuatro; sin errores de carga.
- Render con sesión real de jugador: versión `1.0.17`, `logueado=true`, `esAdmin=false`, `Modulos.calendario=true`, 42 celdas, 8 tarjetas de partido, 3 controles de exportación, 3 enlaces WhatsApp vía RPC, sin aviso de error de contacto.
- Base real: `jornadas` con `total=6`, `con_fecha=0`, `con_inicio=0`, `con_limite=0`. Por eso el calendario mensual muestra 0 eventos y los enlaces de Google/iCalendar avisan de que no hay fechas. Es el comportamiento esperado con datos reales.
- Prueba sintética desconectada (sin escrituras en Supabase): 6 eventos, 5 límites, 6 celdas con evento y hoja de impresión con jornadas. No se mostró información falsa en la vista real.
- Controles: mes siguiente, «Hoy», cambio de zona a `America/Mexico_City` (título y selector actualizados), modal de jornada, botón «Exportar PDF» que invoca `window.print()`.
- Exportación sintética: descarga `goats-latinos-calendario-2024.ics` con `BEGIN:VCALENDAR`, `DTSTART/DTEND` en formato UTC y líneas plegadas a 72 caracteres; enlaces `https://calendar.google.com/calendar/render?action=TEMPLATE...` válidos y copiables.

## Responsive

Validado en iframes reales de `360×640` y `390×844` con la sesión de jugador:

| Comprobación | 360×640 | 390×844 |
|---|---|---|
| Grilla mensual | 7 columnas | 7 columnas |
| Métricas | 2 columnas | 2 columnas |
| Bottom nav | Tabla / Calendario / Stats / Copa / Más | Igual |
| Ancho de modal | 324 px (90%) | 351 px (90%) |
| Desbordamiento horizontal | No (`scrollWidth` 351) | No (`scrollWidth` 382) |

## Excepciones conocidas

- `rpc/gl_crear_notificacion` devuelve `400` con «No podés crear notificaciones para otro jugador.». Ya está documentado en `docs/QA-MENSAJES-1.0.16.md`; no es causado por este módulo y no bloquea el calendario.
- El panel admin quedó implementado pero **sin prueba en vivo**: no hay administrador activo. Requiere una cuenta administradora real para probar programación, apertura y cierre.

## Publicación

- Commit `1421cca` en `main` (`Modulo 06 Calendario y programacion 1.0.17`), 7 archivos cambiados.
- GitHub Pages: run `45556549766`, `status=completed`, `conclusion=success`, commit `1421cca15f33cc0626ed6902488851d037b53d1e`.
- Verificación del sitio publicado: `https://manu-2323.github.io/GOAT-LATINOS/` sirve `CONFIG.VERSION = 1.0.17`, menú con «Calendario» y «Fixture», sin errores de consola al cargar.

## Resultado

Módulo 06 publicado en `1.0.17` con vistas de jugador y administrador, exportación por impresión y enlaces de calendario, contacto por RPC segura y diseño responsive validado.
