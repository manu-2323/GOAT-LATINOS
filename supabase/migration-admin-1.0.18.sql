-- =====================================================================
-- GOATS LATINOS — Migración 1.0.18
-- Acceso de administrador: dos cuentas autorizadas + clave compartida.
-- La clave NO se escribe en claro: queda guardada solo como hash bcrypt.
-- =====================================================================

begin;

-- El trigger de jugadores exige service_role para cambiar rol/email.
select set_config('request.jwt.claim.role', 'service_role', true);

-- ---------------------------------------------------------------------
-- 1) Credencial compartida (solo hash) y lista blanca de correos
-- ---------------------------------------------------------------------
create table if not exists public.admin_credencial (
  id boolean primary key default true check (id),
  hash text not null,
  actualizado_at timestamptz not null default now()
);

insert into public.admin_credencial (id, hash, actualizado_at)
values (true, '$2a$12$Zq3St8jDYJcx0.iKYJtuXuWhXIjlhkN0YKP7PWG6yaJ.HFzUxwYPC', now())
on conflict (id) do update
  set hash = excluded.hash,
      actualizado_at = now();

create table if not exists public.admin_acceso (
  jugador_id uuid primary key references public.jugadores(id) on delete cascade,
  email text not null unique,
  activo boolean not null default true,
  intentos_fallidos integer not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta timestamptz,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create unique index if not exists admin_acceso_email_lower_uq
  on public.admin_acceso (lower(email));

alter table public.admin_acceso enable row level security;
alter table public.admin_credencial enable row level security;

revoke all on public.admin_acceso from anon, authenticated, public;
revoke all on public.admin_credencial from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 2) Roles finales: Manuel = super_admin, GØA = admin, el resto = jugador.
--    No se tocan partidos, goles, clasificación ni ningún dato deportivo.
-- ---------------------------------------------------------------------
update public.jugadores
   set rol = 'admin',
       super_admin = true,
       activo = true,
       suspendido = false,
       email = 'manuelperezcanales2021@gmail.com',
       pais = 'NI',
       telefono = '+50581085555',
       telefono_e164 = '+50581085555',
       pais_telefono = 'NI',
       zona_horaria = 'America/Managua'
 where id = 'aefd2d49-ddf5-488e-be6b-a9eadd66948f';

update public.jugadores
   set rol = 'jugador',
       super_admin = false
 where rol = 'admin'
   and id not in (
     'aefd2d49-ddf5-488e-be6b-a9eadd66948f',
     '8e2afdc9-7e7f-4a23-947a-8e8a951679a9'
   );

-- ---------------------------------------------------------------------
-- 3) Cuenta Auth de GØA y contraseña compartida en ambas cuentas.
-- ---------------------------------------------------------------------
do $$
declare
  v_hash text := (select hash from public.admin_credencial where id = true);
  v_goa_id uuid;
begin
  select id into v_goa_id
  from auth.users
  where lower(email) = lower('fcmobilegt00@gmail.com');

  if v_goa_id is null then
    v_goa_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data,
      is_sso_user, is_anonymous
    )
    values (
      '00000000-0000-0000-0000-000000000000', v_goa_id, 'authenticated', 'authenticated',
      'fcmobilegt00@gmail.com', v_hash, now(), now(), now(),
      '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nombre_usuario":"GØA","nombre":"GØA","zona_horaria":"America/Costa_Rica","email_verified":true}'::jsonb,
      false, false
    );
  end if;

  update auth.users
     set encrypted_password = v_hash,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id in (v_goa_id, '73e3509c-0a9a-444e-bf76-704e7dcb5cb8');

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    v_goa_id::text, v_goa_id,
    jsonb_build_object(
      'email', 'fcmobilegt00@gmail.com',
      'email_verified', true,
      'sub', v_goa_id::text
    ),
    'email', null, now(), now()
  )
  on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data,
        updated_at = now();

  update public.jugadores
     set user_id = v_goa_id,
         rol = 'admin',
         super_admin = false,
         activo = true,
         suspendido = false,
         email = 'fcmobilegt00@gmail.com',
         pais = 'CR',
         telefono = '+50664148552',
         telefono_e164 = '+50664148552',
         pais_telefono = 'CR',
         zona_horaria = 'America/Costa_Rica'
   where id = '8e2afdc9-7e7f-4a23-947a-8e8a951679a9';
end $$;

-- ---------------------------------------------------------------------
-- 4) Lista blanca final
-- ---------------------------------------------------------------------
insert into public.admin_acceso (jugador_id, email, activo)
values
  ('aefd2d49-ddf5-488e-be6b-a9eadd66948f', 'manuelperezcanales2021@gmail.com', true),
  ('8e2afdc9-7e7f-4a23-947a-8e8a951679a9', 'fcmobilegt00@gmail.com', true)
on conflict (jugador_id) do update
  set email = excluded.email,
      activo = true,
      intentos_fallidos = 0,
      bloqueado_hasta = null,
      actualizado_at = now();

-- ---------------------------------------------------------------------
-- 5) RPC pública segura: valida correo authorize + hash + intentos.
--    Se llama ANTES del login, por eso la ejecuta el rol anon.
-- ---------------------------------------------------------------------
create or replace function public.gl_validar_acceso_admin(p_email text, p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_acceso public.admin_acceso%rowtype;
  v_hash text;
  v_intentos integer;
begin
  select a.* into v_acceso
    from public.admin_acceso a
   where lower(a.email) = v_email
     and a.activo = true
     for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Ese correo no está habilitado como administrador.'
    );
  end if;

  if v_acceso.bloqueado_hasta is not null and v_acceso.bloqueado_hasta > now() then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Acceso bloqueado por seguridad. Probá en 15 minutos.'
    );
  end if;

  if not exists (
    select 1
      from public.jugadores j
     where j.id = v_acceso.jugador_id
       and j.rol = 'admin'
       and j.activo = true
  ) then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Ese correo no está habilitado como administrador.'
    );
  end if;

  select c.hash into v_hash
    from public.admin_credencial c
   where c.id = true;

  if v_hash is null then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El acceso de administrador no está configurado.'
    );
  end if;

  if extensions.crypt(p_clave, v_hash) = v_hash then
    update public.admin_acceso
       set intentos_fallidos = 0,
           bloqueado_hasta = null,
           actualizado_at = now()
     where jugador_id = v_acceso.jugador_id;

    return jsonb_build_object('ok', true, 'mensaje', 'Acceso de administrador validado.');
  end if;

  v_intentos := v_acceso.intentos_fallidos + 1;

  update public.admin_acceso
     set intentos_fallidos = v_intentos,
         bloqueado_hasta = case
           when v_intentos >= 5 then now() + interval '15 minutes'
           else v_acceso.bloqueado_hasta
         end,
         actualizado_at = now()
   where jugador_id = v_acceso.jugador_id;

  if v_intentos >= 5 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Acceso bloqueado por seguridad. Probá en 15 minutos.'
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'mensaje', 'Clave de administrador incorrecta.'
  );
end;
$fn$;

revoke all on function public.gl_validar_acceso_admin(text, text) from public;
grant execute on function public.gl_validar_acceso_admin(text, text) to anon, authenticated, service_role;

commit;
