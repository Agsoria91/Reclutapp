-- ============================================================
-- PEGAR COMPLETO EN SUPABASE > SQL EDITOR > NEW QUERY > RUN
-- 1) Historial por silla + fecha de baja
-- 2) Acceso solo con cuenta corporativa (@efis.com / @tecpetrol.com)
-- 3) Avisos a candidatos (registro + 3 mensajes editables)
-- Se puede correr más de una vez sin duplicar nada.
-- ============================================================

-- ============================================================================
-- Historial por silla: quién pasó por cada posición, como titular o en la
-- terna, desde cuándo y hasta cuándo. Solo RRHH (nunca la vista pública).
--
-- Se completa SOLO, con triggers:
--   - positions.candidate_id cambia  -> cierra al titular anterior, abre al nuevo
--   - position_candidates alta/baja  -> abre/cierra el tramo de terna
-- Carga inicial: titulares y ternas actuales + vínculos del respaldo del 13/11
-- que ya no están (gente que se cayó o se movió desde entonces).
-- ============================================================================

create table if not exists public.position_history (
  id           bigint generated always as identity primary key,
  position_id  uuid not null references public.positions(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  rol          text not null check (rol in ('titular', 'terna')),
  desde        timestamptz not null default now(),
  hasta        timestamptz,
  motivo       text,             -- reemplazado / baja / liberada / quitado de la terna / ingresó
  origen       text not null default 'app' check (origen in ('app', 'carga_inicial', 'respaldo')),
  created_by   uuid default auth.uid()
);
create index if not exists position_history_pos_idx on public.position_history(position_id);
create index if not exists position_history_cand_idx on public.position_history(candidate_id);
-- a lo sumo un tramo abierto por persona, silla y rol
create unique index if not exists position_history_abierto_uq
  on public.position_history(position_id, candidate_id, rol) where hasta is null;

alter table public.position_history enable row level security;
revoke all on public.position_history from anon, authenticated;
grant select on public.position_history to authenticated;
drop policy if exists historial_staff on public.position_history;
create policy historial_staff on public.position_history for select to authenticated
  using (public.is_staff());
-- (sin insert/update/delete para nadie: solo escriben los triggers)

-- ---------------------------------------------------------------------------
-- Fecha de baja del candidato: se completa sola el día que pasa a Cancelado
-- (editable por RRHH). Las bajas anteriores no tienen fecha registrada: la app
-- usa la fecha del último hito alcanzado como aproximación (marcada con ~).
-- ---------------------------------------------------------------------------
alter table public.candidates add column if not exists fecha_baja date;

create or replace function public.tg_candidates_fecha_baja()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage = 'cancelado' and old.stage is distinct from 'cancelado' and new.fecha_baja is null
     and coalesce(current_setting('reclutapp.importando', true), '') <> '1' then
    new.fecha_baja := public.hoy_ar();
  elsif new.stage <> 'cancelado' and old.stage = 'cancelado' then
    new.fecha_baja := null;
  end if;
  return new;
end $$;
drop trigger if exists candidates_fecha_baja on public.candidates;
create trigger candidates_fecha_baja before update of stage on public.candidates
  for each row execute function public.tg_candidates_fecha_baja();

-- motivo de salida según cómo quedó la persona
create or replace function public.motivo_salida(p_candidate uuid, p_default text)
returns text language sql stable security definer set search_path = '' as $$
  select case c.stage when 'cancelado' then 'baja' when 'ingresado' then 'ingresó' else p_default end
    from public.candidates c where c.id = p_candidate
$$;
revoke all on function public.motivo_salida(uuid, text) from public, anon;

create or replace function public.tg_positions_historial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.candidate_id is not distinct from new.candidate_id then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.candidate_id is not null then
    update public.position_history
       set hasta = now(),
           motivo = public.motivo_salida(old.candidate_id,
                      case when new.candidate_id is null then 'liberada' else 'reemplazado' end)
     where position_id = new.id and candidate_id = old.candidate_id and rol = 'titular' and hasta is null;
  end if;
  if new.candidate_id is not null then
    insert into public.position_history (position_id, candidate_id, rol)
    values (new.id, new.candidate_id, 'titular')
    on conflict do nothing;
  end if;
  return null;
end $$;

drop trigger if exists positions_historial on public.positions;
create trigger positions_historial after insert or update of candidate_id on public.positions
  for each row execute function public.tg_positions_historial();

create or replace function public.tg_terna_historial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.position_history (position_id, candidate_id, rol, desde)
    values (new.position_id, new.candidate_id, 'terna', coalesce(new.added_at, now()))
    on conflict do nothing;
    return null;
  end if;
  update public.position_history
     set hasta = now(), motivo = public.motivo_salida(old.candidate_id, 'quitado de la terna')
   where position_id = old.position_id and candidate_id = old.candidate_id and rol = 'terna' and hasta is null;
  return null;
end $$;

drop trigger if exists terna_historial on public.position_candidates;
create trigger terna_historial after insert or delete on public.position_candidates
  for each row execute function public.tg_terna_historial();

-- ---------------------------------------------------------------------------
-- Carga inicial (idempotente: solo si la tabla está vacía)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.position_history) then return; end if;

  -- titulares actuales
  insert into public.position_history (position_id, candidate_id, rol, desde, origen)
  select p.id, p.candidate_id, 'titular',
         coalesce(c.en_entrevista, c.cv_recibido, p.created_at::date)::timestamptz, 'carga_inicial'
    from public.positions p join public.candidates c on c.id = p.candidate_id;

  -- terna actual (incluye a los que se cayeron y siguen anotados en la silla)
  insert into public.position_history (position_id, candidate_id, rol, desde, hasta, motivo, origen)
  select t.position_id, t.candidate_id, 'terna',
         least(coalesce(c.cv_recibido::timestamptz, t.added_at), t.added_at),
         case when c.stage = 'cancelado' then coalesce(greatest(c.cv_recibido, c.en_entrevista, c.validacion_rrll, c.epo, c.aptitud_recibida)::timestamptz, t.added_at) end,
         case when c.stage = 'cancelado' then 'baja' end,
         'carga_inicial'
    from public.position_candidates t join public.candidates c on c.id = t.candidate_id;

  -- respaldo del 13/11: vínculos que ya no existen
  if to_regclass('respaldo.positions_20261113') is not null then
    insert into public.position_history (position_id, candidate_id, rol, desde, hasta, motivo, origen)
    select r.id, r.candidate_id, 'titular',
           coalesce(c.en_entrevista, c.cv_recibido, r.created_at::date)::timestamptz,
           coalesce(case when c.stage = 'cancelado' then greatest(c.cv_recibido, c.en_entrevista, c.validacion_rrll, c.epo, c.aptitud_recibida)::timestamptz end, r.updated_at),
           case when c.stage = 'cancelado' then 'baja' else 'reemplazado' end,
           'respaldo'
      from respaldo.positions_20261113 r
      join public.positions p on p.id = r.id
      join public.candidates c on c.id = r.candidate_id
     where r.candidate_id is not null and p.candidate_id is distinct from r.candidate_id;
  end if;
  if to_regclass('respaldo.position_candidates_20261113') is not null then
    insert into public.position_history (position_id, candidate_id, rol, desde, hasta, motivo, origen)
    select r.position_id, r.candidate_id, 'terna',
           least(coalesce(c.cv_recibido::timestamptz, r.added_at), r.added_at),
           coalesce(case when c.stage = 'cancelado' then greatest(c.cv_recibido, c.en_entrevista, c.validacion_rrll, c.epo, c.aptitud_recibida)::timestamptz end, r.added_at),
           case when c.stage = 'cancelado' then 'baja' else 'quitado de la terna' end,
           'respaldo'
      from respaldo.position_candidates_20261113 r
      join public.positions p on p.id = r.position_id
      join public.candidates c on c.id = r.candidate_id
     where not exists (select 1 from public.position_candidates t
                        where t.position_id = r.position_id and t.candidate_id = r.candidate_id);
  end if;
end $$;


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


-- ============================================================================
-- Avisos a candidatos (opción "semi-automática"): la app arma el mensaje y abre
-- WhatsApp / el correo de quien lo envía; RRHH lo revisa y lo manda. Acá solo
-- se guarda QUÉ plantilla se usó, por qué canal y cuándo. Todo solo RRHH.
-- ============================================================================

create table if not exists public.plantillas_aviso (
  tipo        text primary key,                 -- baja / entrevista_ok / proximo_ingreso
  titulo      text not null,
  asunto      text not null,                    -- asunto del mail
  cuerpo      text not null,                    -- admite {nombre} {nombre_completo} {posicion} {area}
  orden       int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create table if not exists public.avisos (
  id           bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  tipo         text not null,
  canal        text not null check (canal in ('whatsapp', 'mail', 'omitido')),
  enviado_at   timestamptz not null default now(),
  enviado_by   uuid default auth.uid()
);
create index if not exists avisos_cand_idx on public.avisos(candidate_id);

alter table public.plantillas_aviso enable row level security;
alter table public.avisos enable row level security;
revoke all on public.plantillas_aviso, public.avisos from anon, authenticated;
grant select, insert, update on public.plantillas_aviso to authenticated;
grant select, insert, delete on public.avisos to authenticated;
drop policy if exists plantillas_staff on public.plantillas_aviso;
create policy plantillas_staff on public.plantillas_aviso for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists avisos_staff on public.avisos;
create policy avisos_staff on public.avisos for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

insert into public.plantillas_aviso (tipo, titulo, asunto, cuerpo, orden) values
('baja', 'No continuamos', 'Tu postulación en EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

Queremos agradecerte por tu interés y por el tiempo que dedicaste al proceso de selección. En esta oportunidad no vamos a continuar con tu postulación.

Guardamos tus datos por si surge una nueva búsqueda acorde a tu perfil. Te deseamos mucho éxito.

Saludos,
Recursos Humanos · EFiS', 1),
('entrevista_ok', 'Entrevista aprobada', 'Próximos pasos de tu postulación en EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

¡Buenas noticias! Avanzás a la siguiente etapa del proceso para {posicion}. En los próximos días te vamos a llamar para coordinar los pasos que siguen.

Para ir adelantando, por favor respondé este mensaje con:
• DNI y CUIL
• Domicilio completo y localidad
• Fecha de nacimiento
• Talle de mameluco, botas y campera

¡Gracias!
Recursos Humanos · EFiS', 2),
('proximo_ingreso', 'Seleccionado para ingreso', 'Fuiste seleccionado/a · EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

¡Felicitaciones! Fuiste seleccionado/a para la próxima etapa de ingresos como {posicion}.

En los próximos días nos vamos a poner en contacto para comentarte las novedades: fecha de ingreso, documentación y todo lo necesario para tu incorporación.

¡Bienvenido/a!
Recursos Humanos · EFiS', 3)
on conflict (tipo) do nothing;

