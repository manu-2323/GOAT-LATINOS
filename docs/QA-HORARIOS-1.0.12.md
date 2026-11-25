# QA de horarios internacionales — 1.0.12

Versión local: **1.0.12**. Proyecto Supabase: `zmjzlvsdlfzmhptmtmjx`.
Probado en `http://localhost:4173/` (servidor estático del repo) con el anon key público.

## Cambio aplicado

- `public.jugadores.zona_horaria` (texto IANA, `NOT NULL`, default `America/Managua`) y
  restricción de formato. Backfill de 24 jugadores por `pais`.
- `public.jugadores_publicos` recreada con `zona_horaria`; sigue sin `email`, `telefono`,
  `user_id`, `rol` ni `super_admin`.
- `GL._zonaResuelta`, `zonaPorPais`, `zonaJugador`, `partesEnZona`, `momentoReferencia`,
  `horaEnZona`, `offsetZona`, `horarioZona`, `horarioJugador`, `horarioZonaDetalle`,
  `etiquetaZona`, `opcionesZonaHoraria`, `actualizarZona` y `notaHorarios`.
- Referencia deportiva: `11:00 – 21:00` en `America/Managua`. No existe fecha/hora en
  `public.partidos`, por eso el texto dice “horarios estimados”, nunca una fecha inventada.
- Consumidores actualizados: registro, perfil, fixture, “Partidos de hoy”, mensajes de WhatsApp,
  administración y la Edge Function `admin-crear-jugador`.
- `CONFIG.VERSION` y los 12 `?v=` de `index.html` pasaron a `1.0.12`.

## Verificación de base de datos

| Prueba | Resultado |
|---|---|
| Migración `migration-zonas-horarias.sql` | aplicada sin errores |
| `jugadores.zona_horaria` | `text`, `NOT NULL`, default `America/Managua` |
| Backfill | 24/24 jugadores con zona según país (AR, BO, CL, CO, CR, EC, GT, HN, MX, NI, PA, PE, VE) |
| Vista pública `jugadores_publicos` | expone `zona_horaria`; 200 con anon key |
| Columnas sensibles en la vista | siguen ausentes (`email` → 400) |

## Verificación en navegador (consola sin errores)

| Zona | Horario mostrado | Offset |
|---|---|---|
| `America/Managua` | 11:00 – 21:00 | UTC-06:00 |
| `America/Mexico_City` | 11:00 – 21:00 | UTC-06:00 |
| `America/Tijuana` | 09:00 – 19:00 | UTC-08:00 |
| `America/Chihuahua` | 11:00 – 21:00 | UTC-06:00 |
| `America/Santiago` | 14:00 – 00:00 | UTC-03:00 |
| `America/Argentina/Buenos_Aires` | 14:00 – 00:00 | UTC-03:00 |
| `America/Bogota` | 12:00 – 22:00 | UTC-05:00 |
| `America/Sao_Paulo` | 14:00 – 00:00 | UTC-03:00 |
| `America/Manaus` | 13:00 – 23:00 | UTC-04:00 |

Cambio estacional comprobado con fechas explícitas:

- `America/Tijuana`: 09:00 en enero (UTC-08:00) y 10:00 en julio (UTC-07:00).
- `America/Santiago`: 14:00 en enero (UTC-03:00) y 13:00 en julio (UTC-04:00).
- `America/Chihuahua` y `America/Mexico_City`: sin cambio, 11:00 todo el año.

Formulario de registro:

- Al elegir Nicaragua, la zona se preselecciona (`America/Managua`) y la nota muestra
  “Horario de juego: 11:00 – 21:00 · Managua (Nicaragua) (UTC-06:00)”.
- Al elegir México, el selector ofrece Ciudad de México, Chihuahua, Tijuana, Cancún y Mérida;
  queda vacío hasta que la persona elige su ciudad.
- Al cambiar a Brasil, las opciones pasan a São Paulo, Manaus, Fortaleza y Cuiabá.
- Elegir Tijuana y después Manaus actualiza la nota a 09:00–19:00 y 13:00–23:00 respectivamente.

## Estado de la funcionalidad

- Sin errores de consola durante las pruebas locales.
- No se generaron llamadas a tablas privadas: la vista pública se leyó con `200`.
- La Edge Function `admin-crear-jugador` fue desplegada y ahora valida la zona con `Intl`.

## Publicación

- Pendiente de commit/push y verificación en GitHub Pages al cierre de esta mejora.
