# QA — Mensajes verificados 1.0.16

> Documento histórico de 1.0.16. El estado vigente es `CONFIG.VERSION = 1.3.3`
> (`docs/CONFIGURACION.md` y `docs/fase-3.17-validacion.md`). Conservar los valores `1.0.16` y el
> nombre `migration-mensajes-1.0.16.sql` como evidencia de esa fecha.

## Alcance

El generador de WhatsApp deja de usar la franja fija `11:00–21:00` y pasa a leer datos reales de Supabase. Si falta alguno, la vista previa se bloquea y copiar, descargar y enviar quedan desactivados.

## Cambios

- **Base**: `jornadas.fecha_inicio` y `jornadas.hora_limite` (`timestamptz`) y `torneos.reglamento` (`text`). Migración `supabase/migration-mensajes-1.0.16.sql`, aplicada en remoto.
- **Helpers**: `GL.momentoZona(fecha, hora, zona)` convierte una fecha/hora local IANA a instante UTC con ajuste estacional; `GL.fechaEnZona()` y `GL.fechaHoraEnZona()` formatean `DD/MM/YYYY` y `DD/MM HH:mm`.
- **Apertura**: torneo, temporada, grupo, jornada, inicio y límite reales, seis enfrentamientos, horarios convertidos por jugador y reglamento vigente.
- **Cierre**: clasificación actualizada, resultados reales vs. resoluciones administrativas, goles y goleadores reales vía `EST.calcularGolesReales()`, estadísticas con denominadores válidos vía `EST.calcularPromedios()` y próxima jornada con su horario si está cargado.
- **Administración**: botón **Horario** en cada jornada y campo **Reglamento vigente** en Configuración. Los horarios se editan en `America/Managua` y se guardan como UTC.
- **Versión**: `CONFIG.VERSION = 1.0.16` y 12 referencias `?v=1.0.16` en `index.html`.

## Preflight (bloquea la generación)

| Comprobación | Motivo mostrado |
|---|---|
| Torneo activo, grupo y jornada válidos | “No hay torneo activo” / “La jornada elegida no es válida” |
| Exactamente 6 enfrentamientos | Indica cuántos hay de 6 |
| Reglamento cargado | Lo pide en Administración → Configuración |
| Inicio y límite cargados, con límite posterior | Los pide en Administración → Jornadas |
| Zona IANA explícita de cada participante | Nombra a quienes faltan; países con varias zonas no se infieren del país |
| Apertura: jornada abierta | Pide abrirla en Administración → Jornadas |
| Cierre: jornada cerrada y sin partidos pendientes | Lista los pendientes y pide cerrarla |
| Cierre: clasificación actual y coherente | Compara `updated_at` contra `partidos.updated_at` y PJ/PG/PE/PP/GF/GC/PTS, descontando `pts_penalizacion` |

## Verificación

- Sintaxis: `new Function()` sobre `js/core/gl.js`, `js/modulos/mensajes.js` y `js/modulos/admin.js` sin errores.
- Datos sintéticos con seis partidos `2-1`: apertura mostró `24/11 11:00` en Managua y `24/11 09:00` en Tijuana, seis enfrentamientos y el reglamento cargado.
- Cierre: clasificación de 12 filas, resultados etiquetados como reales, goleadores reales y próxima jornada `01/12 11:00`.
- Un partido cambiado a `walkover_local`: el mensaje informó `15` goles reales (en vez de `18`), excluyó al goleador del partido administrativo y listó la resolución `3 - 0 (Walkover local)`.
- Jornada en estado distinto al esperado: vista previa bloqueada, botones desactivados y motivo visible.
- Administración simulada: 22 botones **Horario**, texto de horario en la jornada cargada y textarea `#cfg-reglamento` con el reglamento guardado.
- Remoto: columnas `fecha_inicio`, `hora_limite` y `reglamento` presentes (`1/1/1`) y reglamento sembrado en el torneo activo.
- Consola local: sin errores tras recargar con `?qa=mensajes-1016-local`.

## Nota sobre la consola en vivo

En `https://manu-2323.github.io/GOAT-LATINOS/?qa=mensajes-1016-live` no hay errores del módulo de mensajes.
Aparece un único `400` en `rpc/gl_crear_notificacion` con el mensaje “No podés crear notificaciones para otro jugador.”
Se debe a la cuenta de pruebas: su `auth.uid()` distinto del `id` de la fila histórica vinculada en `public.jugadores`.
La RPC compara ambos UUID directamente. No afecta a los mensajes ni a los jugadores creados con el flujo normal,
donde ambos IDs coinciden. Se deja documentado sin cambios de código.

## Publicación

- Commit funcional `9090377` — GitHub Pages run `45536452808`, `success`.
- Verificación live con `?qa=mensajes-1016-live`: versión `1.0.16`, 12 referencias `?v=1.0.16`, sesión de jugador activa, `esAdmin=false`, lecturas `jugadores` y `partidos` con `200`, plantilla de cierre generada con datos sintéticos y las cuatro secciones requeridas presentes.
