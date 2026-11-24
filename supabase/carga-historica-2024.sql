-- ===========================================================================
-- GOATS LATINOS · Carga histórica 2024 (Jornadas 1 a 3)
-- ===========================================================================
-- Ejecutar en Supabase → SQL Editor (o con: supabase db query --remote -f ...)
-- Idempotente: se puede volver a ejecutar sin duplicar torneo, jugadores,
-- grupos, jornadas, partidos ni clasificación.
--
-- Decisiones tomadas por inconsistencias detectadas en el material recibido:
--  1. El torneo existente se llama "Temporada 1". Se normaliza a "2024"
--     (misma fila, mismo ID) para no romper los grupos ya creados.
--  2. Los correos inventados se sanitizan a ASCII válido
--     (p. ej. ツ ƈнєяy → chery@goatslatinos.com, †ㅤGØA† → goa@goatslatinos.com).
--     Manuel conserva su correo real y su user_id de auth.users.
--  3. Los teléfonos con espacio se normalizan (sin espacios internos).
--  4. Las capturas de "Joaquín 5-0 Dairo" y "S.A.B.B 2-2 Fabian10" se asocian
--     a J1 porque ese marcador ya existe en J1; no se duplican en J2/J3.
--  5. Se ajustaron tres marcadores deducidos para que cuadren con las tablas
--     acumuladas oficiales:
--       · URIELantuna 3-1 †ㅤGØA†   (en el prompt decía 1-1)
--       · Romero99 2-1 Jonna        (en el prompt decía 3-1)
--       · Caicedo 2-1 Dairo         (en el prompt decía 4-1)
--  6. "Neymar 1-1 S.A.B.B" se carga tal cual, marcado como REVISAR en comentario.
--  7. La clasificación se inserta con los valores de la tabla oficial J3.
--     El signo de "dif" se recalcula siempre como gf - gc.
--  8. J4 queda SIN cargar, conforme al requerimiento.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Torneo
-- ---------------------------------------------------------------------------
insert into public.torneos (nombre, temporada, estado, total_jornadas)
select 'GOATS LATINOS', '2024', 'activo', 22
where not exists (select 1 from public.torneos where nombre = 'GOATS LATINOS');

update public.torneos
set temporada = '2024', estado = 'activo', total_jornadas = 22
where id = (
  select id from public.torneos
  where nombre = 'GOATS LATINOS'
  order by case when temporada = '2024' then 0 else 1 end, created_at desc
  limit 1
);

-- ---------------------------------------------------------------------------
-- 2) Jugadores (24)
--    user_id = NULL salvo Manuel, cuyo auth.user ya existe.
-- ---------------------------------------------------------------------------
insert into public.jugadores
  (user_id, nombre_usuario, email, pais, telefono, rol, activo, suspendido, torneo_id, super_admin)
values
  ('ee199055-d5c6-46a8-8126-fdcdbc8e5c7f', 'Manuel',          'manuelperezcanales2021@gmail.com', 'NI', '+50581085555',   'admin',   true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), true),
  (NULL, '†ㅤGØA†',        'goa@goatslatinos.com',            'CR', '+50664148552',   'admin',   true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'ツ ƈнєяy',       'chery@goatslatinos.com',          'CR', '+50661151036',   'admin',   true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Escorpioncr7',   'escorpioncr7@goatslatinos.com',   'VE', '+584227135074',  'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Joaquín.11sb',   'joaquin.11sb@goatslatinos.com',   'AR', '+5492257548471', 'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'URIELantuna',    'urielantuna@goatslatinos.com',    'MX', '+523322375795',  'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Itachik339',     'itachik339@goatslatinos.com',     'VE', '+584127155671',  'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Juliocesar',     'juliocesar@goatslatinos.com',     'PA', '+50763800759',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'kako',           'kako@goatslatinos.com',           'PA', '+50761194873',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Waltercinho7',   'waltercinho7@goatslatinos.com',   'EC', '+593968810067',  'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'PSG',            'psg@goatslatinos.com',            'PE', '+51936149380',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'ThiagoSauce',    'thiagosauce@goatslatinos.com',    'AR', '+5491157290737', 'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Caicedo',        'caicedo@goatslatinos.com',        'CO', '+573138404275',  'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Dairo',          'dairo@goatslatinos.com',          'BO', '+59172811636',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Xxineflexxx',    'xxineflexxx@goatslatinos.com',    'CO', '+573185096056',  'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Warriburrito',   'warriburrito@goatslatinos.com',   'CO', '+573176193057',  'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'S.A.B.B',        'sabb@goatslatinos.com',           'BO', '+59168138962',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Eber504',        'eber504@goatslatinos.com',        'GT', '+50240506807',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Neymar',         'neymar@goatslatinos.com',         'PE', '+51916505547',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Shandertutigre', 'shandertutigre@goatslatinos.com', 'BO', '+59169989245',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Jonna',          'jonna@goatslatinos.com',          'CL', '+56953877920',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'TheKing',        'theking@goatslatinos.com',        'CL', '+56929820255',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Romero99',       'romero99@goatslatinos.com',       'HN', '+50494023141',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false),
  (NULL, 'Fabian10',       'fabian10@goatslatinos.com',       'BO', '+59162650145',   'jugador', true, false, (select id from public.torneos where nombre='GOATS LATINOS' limit 1), false)
on conflict (nombre_usuario) do update set
  -- Se conserva un vínculo de auth ya existente si el jugador se registró después.
  user_id     = coalesce(public.jugadores.user_id, excluded.user_id),
  email       = coalesce(public.jugadores.email, excluded.email),
  pais        = excluded.pais,
  telefono    = excluded.telefono,
  rol         = excluded.rol,
  activo      = true,
  suspendido  = false,
  torneo_id   = excluded.torneo_id,
  super_admin = excluded.super_admin;

-- ---------------------------------------------------------------------------
-- 3) Grupos y asignación (12 por grupo)
-- ---------------------------------------------------------------------------
with t as (
  select id from public.torneos where nombre='GOATS LATINOS' limit 1
)
insert into public.grupos (torneo_id, nombre)
select t.id, x.nombre
from t
cross join (values ('Grupo A'), ('Grupo B')) as x(nombre)
where not exists (
  select 1 from public.grupos g where g.torneo_id = t.id and g.nombre = x.nombre
);

with
t as (select id from public.torneos where nombre='GOATS LATINOS' limit 1),
miembros(grupo, jugador) as (
  values
    ('Grupo A', 'Escorpioncr7'), ('Grupo A', 'Joaquín.11sb'), ('Grupo A', 'Waltercinho7'),
    ('Grupo A', 'PSG'),          ('Grupo A', 'Dairo'),         ('Grupo A', 'Manuel'),
    ('Grupo A', 'TheKing'),      ('Grupo A', 'Caicedo'),       ('Grupo A', 'Jonna'),
    ('Grupo A', 'Romero99'),     ('Grupo A', '†ㅤGØA†'),       ('Grupo A', 'URIELantuna'),
    ('Grupo B', 'ツ ƈнєяy'),     ('Grupo B', 'Fabian10'),      ('Grupo B', 'Itachik339'),
    ('Grupo B', 'Juliocesar'),   ('Grupo B', 'kako'),          ('Grupo B', 'ThiagoSauce'),
    ('Grupo B', 'Neymar'),       ('Grupo B', 'Xxineflexxx'),   ('Grupo B', 'Warriburrito'),
    ('Grupo B', 'Eber504'),      ('Grupo B', 'Shandertutigre'),('Grupo B', 'S.A.B.B')
)
insert into public.grupo_jugadores (grupo_id, jugador_id)
select g.id, j.id
from miembros m
join t on true
join public.grupos g on g.torneo_id = t.id and g.nombre = m.grupo
join public.jugadores j on j.nombre_usuario = m.jugador
where not exists (
  select 1 from public.grupo_jugadores gj
  where gj.grupo_id = g.id and gj.jugador_id = j.id
);

-- ---------------------------------------------------------------------------
-- 4) Jornadas 1, 2 y 3 (cerradas), 2 por jornada = 6 filas
-- ---------------------------------------------------------------------------
with t as (
  select id from public.torneos where nombre='GOATS LATINOS' limit 1
)
insert into public.jornadas (torneo_id, grupo_id, numero, estado, fecha)
select t.id, g.id, n.numero, 'cerrada', null
from t
join public.grupos g on g.torneo_id = t.id and g.nombre in ('Grupo A','Grupo B')
cross join (select unnest(array[1,2,3]) as numero) n
where not exists (
  select 1 from public.jornadas j
  where j.torneo_id = t.id and j.grupo_id = g.id and j.numero = n.numero
);

-- ---------------------------------------------------------------------------
-- 5) Partidos J1–J3 (36 partidos). Estado = 'jugado'.
--    Nota: no existe constraint de unicidad en partidos, por eso se usa
--    NOT EXISTS para que el script sea repetible.
-- ---------------------------------------------------------------------------
with
t as (select id from public.torneos where nombre='GOATS LATINOS' limit 1),
g as (select id, nombre from public.grupos where nombre in ('Grupo A','Grupo B')),
j as (select id, nombre_usuario from public.jugadores),
partidos(grupo, jornada, local, visita, gl, gv, nota) as (
  values
  -- ===== JORNADA 1 · GRUPO A =====
  ('Grupo A',1,'Caicedo','Jonna',2,0,'J1 conocido'),
  ('Grupo A',1,'PSG','Escorpioncr7',5,2,'J1 conocido + stats'),
  ('Grupo A',1,'†ㅤGØA†','Romero99',2,1,'J1 conocido'),
  ('Grupo A',1,'Manuel','Waltercinho7',0,0,'J1 conocido'),
  ('Grupo A',1,'TheKing','URIELantuna',0,2,'J1 conocido'),
  ('Grupo A',1,'Dairo','Joaquín.11sb',0,5,'J1 conocido + stats'),
  -- ===== JORNADA 1 · GRUPO B =====
  ('Grupo B',1,'S.A.B.B','Fabian10',2,2,'J1 conocido + stats'),
  ('Grupo B',1,'ツ ƈнєяy','ThiagoSauce',1,2,'J1 conocido'),
  ('Grupo B',1,'Warriburrito','Itachik339',1,0,'J1 conocido'),
  ('Grupo B',1,'Xxineflexxx','Juliocesar',4,1,'J1 conocido'),
  ('Grupo B',1,'kako','Neymar',2,1,'J1 conocido'),
  ('Grupo B',1,'Shandertutigre','Eber504',4,0,'J1 conocido'),
  -- ===== JORNADA 2 · GRUPO A (deducción ajustada) =====
  ('Grupo A',2,'Romero99','Jonna',2,1,'Deducido ajustado a tabla J2'),
  ('Grupo A',2,'URIELantuna','†ㅤGØA†',3,1,'Deducido ajustado a tabla J2'),
  ('Grupo A',2,'PSG','Escorpioncr7',4,1,'Deducido'),
  ('Grupo A',2,'TheKing','Manuel',2,1,'Deducido'),
  ('Grupo A',2,'Caicedo','Dairo',2,1,'Deducido ajustado a tabla J2'),
  ('Grupo A',2,'Joaquín.11sb','Waltercinho7',2,1,'Deducido'),
  -- ===== JORNADA 2 · GRUPO B =====
  ('Grupo B',2,'ツ ƈнєяy','Eber504',4,0,'Deducido'),
  ('Grupo B',2,'ThiagoSauce','kako',4,1,'Deducido'),
  ('Grupo B',2,'Shandertutigre','Warriburrito',2,1,'Deducido'),
  ('Grupo B',2,'Xxineflexxx','Fabian10',2,2,'Deducido'),
  ('Grupo B',2,'Neymar','S.A.B.B',1,1,'Deducido · REVISAR'),
  ('Grupo B',2,'Itachik339','Juliocesar',0,1,'Deducido'),
  -- ===== JORNADA 3 · GRUPO A =====
  ('Grupo A',3,'PSG','TheKing',3,0,'Deducido de tabla final J3'),
  ('Grupo A',3,'Romero99','Caicedo',3,0,'Deducido de tabla final J3'),
  ('Grupo A',3,'†ㅤGØA†','Dairo',3,0,'Conocido + stats'),
  ('Grupo A',3,'Escorpioncr7','Waltercinho7',0,1,'Conocido + stats'),
  ('Grupo A',3,'Jonna','URIELantuna',2,0,'Conocido + stats'),
  ('Grupo A',3,'Joaquín.11sb','Manuel',1,3,'Deducido de tabla final J3'),
  -- ===== JORNADA 3 · GRUPO B =====
  ('Grupo B',3,'ThiagoSauce','Eber504',3,0,'Conocido (3-0) + deducción rival'),
  ('Grupo B',3,'Warriburrito','Shandertutigre',1,2,'Conocido'),
  ('Grupo B',3,'kako','Juliocesar',1,4,'Conocido'),
  ('Grupo B',3,'Fabian10','Neymar',4,1,'Conocido (4-1) + deducción rival'),
  ('Grupo B',3,'Xxineflexxx','S.A.B.B',4,1,'Deducido de tabla final J3'),
  ('Grupo B',3,'ツ ƈнєяy','Itachik339',2,1,'Deducido de tabla final J3')
)
insert into public.partidos
  (torneo_id, grupo_id, jornada, local_id, visitante_id,
   goles_local, goles_visitante, estado, ingresado_por)
select
  t.id, g.id, p.jornada, jl.id, jv.id, p.gl, p.gv, 'jugado',
  (select id from public.jugadores where nombre_usuario='Manuel')
from partidos p
cross join t
join g on g.nombre = p.grupo
join j jl on jl.nombre_usuario = p.local
join j jv on jv.nombre_usuario = p.visita
where not exists (
  select 1 from public.partidos existing
  where existing.torneo_id = t.id
    and existing.grupo_id = g.id
    and existing.jornada = p.jornada
    and existing.local_id = jl.id
    and existing.visitante_id = jv.id
);

-- ---------------------------------------------------------------------------
-- 6) Estadísticas disponibles (capturas de video)
-- ---------------------------------------------------------------------------
with j as (select id, nombre_usuario from public.jugadores)
-- En la fila del partido Dairo 0-5 Joaquín, Joaquín es el visitante.
update public.partidos p set
  tiros_local=4, tiros_puerta_local=3, posesion_local=49, pase_local=73,
  tiros_visitante=7, tiros_puerta_visitante=7, posesion_visitante=51, pase_visitante=82
where p.torneo_id=(select id from public.torneos where nombre='GOATS LATINOS' limit 1)
  and p.jornada=1
  and p.local_id=(select id from j where nombre_usuario='Dairo')
  and p.visitante_id=(select id from j where nombre_usuario='Joaquín.11sb');

with j as (select id, nombre_usuario from public.jugadores)
update public.partidos p set
  tiros_local=2, tiros_puerta_local=2, posesion_local=53, pase_local=80,
  tiros_visitante=8, tiros_puerta_visitante=8, posesion_visitante=47, pase_visitante=81
where p.torneo_id=(select id from public.torneos where nombre='GOATS LATINOS' limit 1)
  and p.jornada=1
  and p.local_id=(select id from j where nombre_usuario='S.A.B.B')
  and p.visitante_id=(select id from j where nombre_usuario='Fabian10');

with j as (select id, nombre_usuario from public.jugadores)
update public.partidos p set
  tiros_local=4, tiros_puerta_local=4, posesion_local=47, pase_local=73,
  tiros_visitante=1, tiros_puerta_visitante=1, posesion_visitante=53, pase_visitante=77
where p.torneo_id=(select id from public.torneos where nombre='GOATS LATINOS' limit 1)
  and p.jornada=3
  and p.local_id=(select id from j where nombre_usuario='†ㅤGØA†')
  and p.visitante_id=(select id from j where nombre_usuario='Dairo');

with j as (select id, nombre_usuario from public.jugadores)
update public.partidos p set
  tiros_local=2, tiros_puerta_local=1, posesion_local=37, pase_local=69,
  tiros_visitante=3, tiros_puerta_visitante=3, posesion_visitante=63, pase_visitante=91
where p.torneo_id=(select id from public.torneos where nombre='GOATS LATINOS' limit 1)
  and p.jornada=3
  and p.local_id=(select id from j where nombre_usuario='Escorpioncr7')
  and p.visitante_id=(select id from j where nombre_usuario='Waltercinho7');

with j as (select id, nombre_usuario from public.jugadores)
update public.partidos p set
  tiros_local=2, tiros_puerta_local=2, posesion_local=45, pase_local=75,
  tiros_visitante=3, tiros_puerta_visitante=2, posesion_visitante=55, pase_visitante=85
where p.torneo_id=(select id from public.torneos where nombre='GOATS LATINOS' limit 1)
  and p.jornada=3
  and p.local_id=(select id from j where nombre_usuario='Jonna')
  and p.visitante_id=(select id from j where nombre_usuario='URIELantuna');

-- ---------------------------------------------------------------------------
-- 7) Clasificación final J3 (tabla oficial entregada)
-- ---------------------------------------------------------------------------
with
t as (select id from public.torneos where nombre='GOATS LATINOS' limit 1),
g as (select id, nombre from public.grupos where nombre in ('Grupo A','Grupo B')),
j as (select id, nombre_usuario from public.jugadores),
datos(grupo, jugador, pj, pg, pe, pp, gf, gc, pts) as (
  values
  ('Grupo A','PSG',            3,3,0,0,12,3,9),
  ('Grupo A','Joaquín.11sb',   3,2,1,0, 8,4,7),
  ('Grupo A','Romero99',       3,2,0,1, 7,3,6),
  ('Grupo A','Caicedo',        3,2,0,1, 6,4,6),
  ('Grupo A','†ㅤGØA†',        3,2,0,1, 6,4,6),
  ('Grupo A','URIELantuna',    3,2,0,1, 5,3,6),
  ('Grupo A','TheKing',        3,1,1,1, 5,6,4),
  ('Grupo A','Waltercinho7',   3,1,1,1, 4,5,4),
  ('Grupo A','Jonna',          3,1,0,2, 3,4,3),
  ('Grupo A','Manuel',         3,0,2,1, 4,5,2),
  ('Grupo A','Escorpioncr7',   3,0,0,3, 3,10,0),
  ('Grupo A','Dairo',          3,0,0,3, 1,10,0),
  ('Grupo B','ThiagoSauce',    3,3,0,0, 9,2,9),
  ('Grupo B','Shandertutigre', 3,3,0,0, 8,2,9),
  ('Grupo B','Xxineflexxx',    3,2,1,0,10,4,7),
  ('Grupo B','Fabian10',       3,2,1,0, 5,2,7),
  ('Grupo B','ツ ƈнєяy',       3,2,0,1, 7,3,6),
  ('Grupo B','Warriburrito',   3,1,1,1, 3,3,4),
  ('Grupo B','kako',           3,1,0,2, 4,7,3),
  ('Grupo B','S.A.B.B',        3,0,2,1, 4,7,2),
  ('Grupo B','Itachik339',     3,0,1,2, 1,3,1),
  ('Grupo B','Neymar',         3,0,1,2, 2,5,1),
  ('Grupo B','Eber504',        3,0,1,2, 3,8,1),
  ('Grupo B','Juliocesar',     3,0,0,3, 1,11,0)
)
insert into public.clasificacion
  (torneo_id, grupo_id, jugador_id, pj, pg, pe, pp, gf, gc, dif, pts, pts_penalizacion, updated_at)
select
  t.id, g.id, j.id, d.pj, d.pg, d.pe, d.pp, d.gf, d.gc, d.gf - d.gc, d.pts, 0, now()
from datos d
cross join t
join g on g.nombre = d.grupo
join j on j.nombre_usuario = d.jugador
on conflict (jugador_id) do update set
  torneo_id=excluded.torneo_id,
  grupo_id=excluded.grupo_id,
  pj=excluded.pj, pg=excluded.pg, pe=excluded.pe, pp=excluded.pp,
  gf=excluded.gf, gc=excluded.gc, dif=excluded.dif, pts=excluded.pts,
  pts_penalizacion=excluded.pts_penalizacion, updated_at=excluded.updated_at;

commit;

-- ---------------------------------------------------------------------------
-- 8) Verificación rápida
-- ---------------------------------------------------------------------------
select 'torneos' as tabla, count(*)::text as total from public.torneos
union all select 'jugadores', count(*)::text from public.jugadores
union all select 'grupos', count(*)::text from public.grupos
union all select 'grupo_jugadores', count(*)::text from public.grupo_jugadores
union all select 'jornadas', count(*)::text from public.jornadas
union all select 'partidos', count(*)::text from public.partidos
union all select 'partidos_con_stats', count(*)::text from public.partidos where tiros_local is not null
union all select 'clasificacion', count(*)::text from public.clasificacion;

select temporada, estado, total_jornadas from public.torneos where nombre='GOATS LATINOS';
select grupo_id, jornada, count(*) as partidos,
       count(*) filter (where estado='jugado') as jugados
from public.partidos
group by grupo_id, jornada
order by grupo_id, jornada;
