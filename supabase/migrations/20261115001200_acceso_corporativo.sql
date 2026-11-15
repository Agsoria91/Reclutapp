-- ============================================================================
-- Acceso solo con cuenta corporativa (@tecpetrol.com / @efis.com).
--
-- Antes: cualquiera sin login (rol anon) leía positions_public y
-- candidates_public. Ahora:
--   - anon NO lee nada (ni vistas, ni tablas, ni etapas).
--   - "Lectores" (supervisión/dirección): cuentas que crea RRHH desde la app,
--     solo con correo corporativo. Leen las MISMAS vistas *_public de antes
--     (sin DNI, teléfono, mail ni básicos).
--   - RRHH (staff) sigue igual: tablas completas.
--
-- Por qué vistas "security definer" filtradas: lectores y RRHH usan el mismo
-- rol de base (authenticated). Si se abriera la tabla candidates a lectores
-- con RLS, podrían pedir columnas sensibles directo a la API. Con la vista,
-- el lector solo puede pedir las columnas que la vista expone, y la vista
-- devuelve filas únicamente si puede_leer() es verdadero.
-- ============================================================================

create or replace function public.es_correo_corporativo(p_email text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(lower(trim(p_email)) ~ '^[^@\s]+@(tecpetrol|efis)\.com$', false)
$$;

create table if not exists public.lectores (
  email      text primary key check (public.es_correo_corporativo(email)),
  nombre     text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.lectores enable row level security;
revoke all on public.lectores from anon, authenticated;
grant select on public.lectores to authenticated;
drop policy if exists lectores_staff on public.lectores;
create policy lectores_staff on public.lectores for select to authenticated using (public.is_staff());

-- ¿El usuario logueado puede ver el tablero? RRHH, o lector corporativo habilitado.
create or replace function public.puede_leer()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_staff()
      or exists (
        select 1
          from auth.users u
          join public.lectores l on l.email = lower(u.email)
         where u.id = auth.uid()
           and u.email_confirmed_at is not null
           and public.es_correo_corporativo(u.email))
$$;
revoke all on function public.puede_leer() from public, anon;
grant execute on function public.puede_leer() to authenticated;

-- ---------------------------------------------------------------------------
-- Cortar todo acceso anónimo
-- ---------------------------------------------------------------------------
drop policy if exists positions_public_read on public.positions;
drop policy if exists candidates_public_read on public.candidates;
revoke all on public.positions, public.candidates from anon;
revoke all on public.positions_public, public.candidates_public from anon;
revoke all on public.stages, public.stage_aliases from anon;
drop policy if exists stages_read on public.stages;
create policy stages_read on public.stages for select to authenticated using (true);
drop policy if exists alias_read on public.stage_aliases;
create policy alias_read on public.stage_aliases for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Vistas de lectura (mismas columnas que antes), filtradas por puede_leer()
-- ---------------------------------------------------------------------------
drop view if exists public.positions_public;
create view public.positions_public as
select id, pos_sap, yacimiento, jefe_directo, sector, puesto, diagrama, turno, encuadre,
       tipo_cobertura, stage, candidate_id is not null as tiene_ficha, candidato_nombre,
       procedencia, localidad, cand_activos, fecha_inicio, fecha_objetivo, categoria,
       puesto_convenio, fecha_ingreso, updated_at
  from public.positions
 where public.puede_leer();

drop view if exists public.candidates_public;
create view public.candidates_public as
select id, area, stage, procedencia, servicio, posicion, cv_recibido, en_entrevista,
       entrevista_ok, ok_rrll, epo, aptitud_recibida, listo_ingreso, fecha_ingreso,
       cancelado, motivos_baja, created_origen, localidad, provincia
  from public.candidates
 where public.puede_leer();

revoke all on public.positions_public, public.candidates_public from anon, authenticated, public;
grant select on public.positions_public, public.candidates_public to authenticated;

-- ---------------------------------------------------------------------------
-- Alta / baja de lectores desde la app (solo RRHH)
-- ---------------------------------------------------------------------------
create or replace function public.lector_upsert(p_email text, p_nombre text, p_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.es_correo_corporativo(v_email) then
    raise exception 'Solo se permiten correos @tecpetrol.com o @efis.com';
  end if;
  if length(coalesce(p_password, '')) < 10 then raise exception 'La contraseña temporal debe tener al menos 10 caracteres'; end if;

  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', p_nombre), now(), now(),
      '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now());
  else
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_id;
  end if;

  insert into public.lectores (email, nombre) values (v_email, nullif(trim(p_nombre), ''))
  on conflict (email) do update set nombre = coalesce(excluded.nombre, public.lectores.nombre);
  return v_email;
end $$;

create or replace function public.lector_remove(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  delete from public.lectores where email = lower(trim(p_email));
end $$;

revoke all on function public.lector_upsert(text, text, text), public.lector_remove(text) from public, anon;
grant execute on function public.lector_upsert(text, text, text), public.lector_remove(text) to authenticated;
