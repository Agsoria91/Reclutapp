-- Rol Entrevistador (supervisores): ven y evalúan solo a los candidatos de su alcance
-- (sector + yacimiento, y opcionalmente puestos). Sin DNI, teléfono, mail ni sueldo.
-- Evaluaciones: una por entrevistador y candidato; cada uno ve solo la suya, RRHH ve todas.

create table if not exists public.entrevistadores (
  email text primary key,
  nombre text,
  sectores text[] not null default '{}',
  yacimientos text[] not null default '{}',   -- vacío = todos
  puestos text[] not null default '{}',       -- vacío = todos
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.entrevistadores enable row level security;
drop policy if exists entrevistadores_staff on public.entrevistadores;
create policy entrevistadores_staff on public.entrevistadores for all using (public.is_staff()) with check (public.is_staff());

create or replace function public.mi_entrevistador()
 returns public.entrevistadores language sql stable security definer set search_path to ''
as $$
  select e.* from auth.users u join public.entrevistadores e on e.email = lower(u.email)
   where u.id = auth.uid() and u.email_confirmed_at is not null and public.es_correo_corporativo(u.email)
$$;

create or replace function public.es_entrevistador()
 returns boolean language sql stable security definer set search_path to ''
as $$ select (public.mi_entrevistador()).email is not null $$;

-- ¿El candidato está dentro del alcance del entrevistador actual?
create or replace function public.en_mi_alcance(p_candidate uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.candidates c, public.mi_entrevistador() e
     where c.id = p_candidate and e.email is not null
       and public.norm_txt(c.servicio) = any (select public.norm_txt(x) from unnest(e.sectores) x)
       and (cardinality(e.yacimientos) = 0 or public.norm_txt(c.area) = any (select public.norm_txt(x) from unnest(e.yacimientos) x))
       and (cardinality(e.puestos) = 0 or public.norm_txt(c.posicion) = any (select public.norm_txt(x) from unnest(e.puestos) x)))
$$;

create table if not exists public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  evaluador uuid not null default auth.uid(),
  evaluador_nombre text,
  rol text not null default 'rrhh' check (rol in ('rrhh', 'entrevistador')),
  actitud smallint check (actitud between 1 and 5),
  tecnico smallint check (tecnico between 1 and 5),
  experiencia smallint check (experiencia between 1 and 5),
  seguridad smallint check (seguridad between 1 and 5),
  etiquetas text[] not null default '{}',
  comentario text,
  decision text check (decision in ('aprobado', 'rechazado')),
  fecha date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, evaluador)
);
create index if not exists evaluaciones_candidate_idx on public.evaluaciones (candidate_id);
alter table public.evaluaciones enable row level security;
drop policy if exists evaluaciones_staff on public.evaluaciones;
create policy evaluaciones_staff on public.evaluaciones for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists evaluaciones_propias on public.evaluaciones;
create policy evaluaciones_propias on public.evaluaciones for all
  using (evaluador = auth.uid() and public.es_entrevistador())
  with check (evaluador = auth.uid() and rol = 'entrevistador' and public.en_mi_alcance(candidate_id));

-- nombre y rol del autor los pone la base (no se pueden falsear)
create or replace function public.tg_evaluaciones_autor()
 returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.evaluador := coalesce(auth.uid(), new.evaluador);
    new.rol := case when public.is_staff() then 'rrhh' else 'entrevistador' end;
    select coalesce(nullif(trim(coalesce(s.nombre, e.nombre)), ''), split_part(u.email, '@', 1)) into new.evaluador_nombre
      from auth.users u left join public.staff s on s.email = lower(u.email) left join public.entrevistadores e on e.email = lower(u.email)
     where u.id = new.evaluador;
  else
    new.evaluador := old.evaluador; new.rol := old.rol; new.evaluador_nombre := old.evaluador_nombre; new.candidate_id := old.candidate_id;
  end if;
  return new;
end $$;
drop trigger if exists evaluaciones_autor on public.evaluaciones;
create trigger evaluaciones_autor before insert or update on public.evaluaciones
  for each row execute function public.tg_evaluaciones_autor();

-- la evaluación de la versión anterior (columna en candidates) pasa a la tabla
insert into public.evaluaciones (candidate_id, evaluador, actitud, tecnico, experiencia, seguridad, etiquetas, comentario, fecha)
select c.id, (c.evaluacion->>'por')::uuid, (c.evaluacion->>'actitud')::smallint, (c.evaluacion->>'tecnico')::smallint,
       (c.evaluacion->>'experiencia')::smallint, (c.evaluacion->>'seguridad')::smallint,
       coalesce(array(select jsonb_array_elements_text(c.evaluacion->'etiquetas')), '{}'), c.evaluacion->>'comentario',
       coalesce((c.evaluacion->>'fecha')::date, current_date)
  from public.candidates c
 where c.evaluacion is not null and c.evaluacion->>'por' is not null
on conflict do nothing;

-- Lista del entrevistador: pendientes de su alcance + los que ya evaluó. Solo datos no sensibles.
create or replace function public.mis_entrevistas()
 returns table (id uuid, nombre text, area text, servicio text, posicion text, stage text, cv_recibido date,
                en_entrevista date, localidad text, procedencia text, tiene_cv boolean, evaluacion jsonb)
 language sql stable security definer set search_path to ''
as $$
  select c.id, c.nombre, c.area, c.servicio, c.posicion, c.stage, c.cv_recibido, c.en_entrevista, c.localidad, c.procedencia,
         c.cv_path is not null, to_jsonb(ev) - 'evaluador' - 'candidate_id'
    from public.candidates c
    left join public.evaluaciones ev on ev.candidate_id = c.id and ev.evaluador = auth.uid()
   where public.es_entrevistador()
     and (ev.id is not null or (public.en_mi_alcance(c.id) and c.stage in ('cv_recibido', 'entrevista')))
$$;

-- Aprobar o rechazar la entrevista (cambia la etapa). Solo dentro del alcance y antes de avanzar.
create or replace function public.entrevistador_decidir(p_candidate uuid, p_decision text, p_motivo text default null)
 returns text language plpgsql security definer set search_path to ''
as $$
declare v_stage text;
begin
  if not public.es_entrevistador() or not public.en_mi_alcance(p_candidate) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select stage into v_stage from public.candidates where id = p_candidate;
  if v_stage not in ('cv_recibido', 'entrevista') then
    raise exception 'El candidato ya avanzó en el proceso; la decisión la toma RRHH.';
  end if;
  if p_decision = 'aprobado' then
    update public.candidates set stage = 'entrevista_aprobada', entrevista_ok = true,
           en_entrevista = coalesce(en_entrevista, (now() at time zone 'America/Argentina/Buenos_Aires')::date)
     where id = p_candidate;
  elsif p_decision = 'rechazado' then
    update public.candidates set stage = 'cancelado',
           en_entrevista = coalesce(en_entrevista, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
           motivos_baja = case when nullif(trim(p_motivo), '') is null then motivos_baja else array[trim(p_motivo)] end
     where id = p_candidate;
  else
    raise exception 'Decisión inválida';
  end if;
  update public.evaluaciones set decision = p_decision where candidate_id = p_candidate and evaluador = auth.uid();
  return p_decision;
end $$;

-- CV: el entrevistador puede abrir el CV de los candidatos de su alcance
create or replace function public.cv_en_mi_alcance(p_name text)
 returns boolean language sql stable security definer set search_path to ''
as $$ select exists (select 1 from public.candidates c where c.cv_path = p_name and public.en_mi_alcance(c.id)) $$;
drop policy if exists cvs_entrevistador_select on storage.objects;
create policy cvs_entrevistador_select on storage.objects for select
  using (bucket_id = 'cvs' and public.cv_en_mi_alcance(name));

-- Alta / baja desde Usuarios (como los lectores)
create or replace function public.entrevistador_upsert(p_email text, p_nombre text, p_password text,
  p_sectores text[], p_yacimientos text[] default '{}', p_puestos text[] default '{}')
 returns text language plpgsql security definer set search_path to ''
as $$
declare v_email text := lower(trim(p_email)); v_id uuid;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.es_correo_corporativo(v_email) then
    raise exception 'Solo se permiten correos @efis.com, @efis.com.ar, @tecpetrol.com o @tecpetrol.com.ar';
  end if;
  if cardinality(coalesce(p_sectores, '{}')) = 0 then raise exception 'Elegí al menos un sector para el entrevistador.'; end if;
  if p_password is not null then
    if length(p_password) < 10 then raise exception 'La contraseña temporal debe tener al menos 10 caracteres'; end if;
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
      update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
       where id = v_id;
    end if;
  end if;
  insert into public.entrevistadores (email, nombre, sectores, yacimientos, puestos)
  values (v_email, nullif(trim(p_nombre), ''), p_sectores, coalesce(p_yacimientos, '{}'), coalesce(p_puestos, '{}'))
  on conflict (email) do update set nombre = coalesce(excluded.nombre, public.entrevistadores.nombre),
    sectores = excluded.sectores, yacimientos = excluded.yacimientos, puestos = excluded.puestos;
  return v_email;
end $$;

create or replace function public.entrevistador_remove(p_email text)
 returns void language plpgsql security definer set search_path to ''
as $$
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  delete from public.entrevistadores where email = lower(trim(p_email));
end $$;

revoke all on function public.entrevistador_upsert(text, text, text, text[], text[], text[]) from public, anon;
revoke all on function public.entrevistador_remove(text) from public, anon;
revoke all on function public.entrevistador_decidir(uuid, text, text) from public, anon;
revoke all on function public.mis_entrevistas() from public, anon;
grant execute on function public.entrevistador_upsert(text, text, text, text[], text[], text[]) to authenticated;
grant execute on function public.entrevistador_remove(text) to authenticated;
grant execute on function public.entrevistador_decidir(uuid, text, text) to authenticated;
grant execute on function public.mis_entrevistas() to authenticated;
grant select, insert, update, delete on public.evaluaciones to authenticated;
grant select, insert, update, delete on public.entrevistadores to authenticated;
