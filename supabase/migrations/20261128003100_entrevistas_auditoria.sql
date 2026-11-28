-- 1) Especialidad dentro del sector (Mantenimiento: Mecánico, Eléctrico, Generación, Instrumentación)
alter table public.candidates add column if not exists subsector text;
alter table public.entrevistadores add column if not exists subsectores text[] not null default '{}';

create table if not exists respaldo.candidates_subsector_20261128 as
  select id, servicio, posicion, subsector from public.candidates where public.norm_txt(servicio) = 'mantenimiento';

update public.candidates set subsector = case
    when public.norm_txt(posicion) ~ 'instrument' then 'Instrumentación'
    when public.norm_txt(posicion) ~ 'electric' then 'Eléctrico'
    when public.norm_txt(posicion) ~ 'generacion' then 'Generación'
    when public.norm_txt(posicion) ~ 'mecanic' then 'Mecánico'
  end
 where public.norm_txt(servicio) = 'mantenimiento' and subsector is null;

create or replace function public.en_mi_alcance(p_candidate uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.candidates c, public.mi_entrevistador() e
     where c.id = p_candidate and e.email is not null
       and public.norm_txt(c.servicio) = any (select public.norm_txt(x) from unnest(e.sectores) x)
       and (cardinality(e.subsectores) = 0 or public.norm_txt(c.subsector) = any (select public.norm_txt(x) from unnest(e.subsectores) x))
       and (cardinality(e.yacimientos) = 0 or public.norm_txt(c.area) = any (select public.norm_txt(x) from unnest(e.yacimientos) x))
       and (cardinality(e.puestos) = 0 or public.norm_txt(c.posicion) = any (select public.norm_txt(x) from unnest(e.puestos) x)))
$$;

-- 2) Recomendación del entrevistador + auditoría de RRHH (la etapa solo la cambia RRHH)
alter table public.evaluaciones
  add column if not exists motivo text,
  add column if not exists categoria_sugerida text,
  add column if not exists revision text,
  add column if not exists revision_comentario text,
  add column if not exists revisado_por uuid,
  add column if not exists revisado_nombre text,
  add column if not exists revisado_at timestamptz;
alter table public.evaluaciones drop constraint if exists evaluaciones_categoria_chk;
alter table public.evaluaciones add constraint evaluaciones_categoria_chk
  check (categoria_sugerida in ('Ingresante sin experiencia', 'Ayudante', 'Medio oficial', 'Oficial', 'Especializado'));
alter table public.evaluaciones drop constraint if exists evaluaciones_revision_chk;
alter table public.evaluaciones add constraint evaluaciones_revision_chk check (revision in ('pendiente', 'confirmada', 'desestimada'));

create or replace function public.tg_evaluaciones_autor()
 returns trigger language plpgsql security definer set search_path to ''
as $$
declare v_staff boolean := public.is_staff(); v_stage text;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.evaluador := coalesce(auth.uid(), new.evaluador);
    new.rol := case when v_staff then 'rrhh' else 'entrevistador' end;
    select coalesce(nullif(trim(coalesce(s.nombre, e.nombre)), ''), split_part(u.email, '@', 1)) into new.evaluador_nombre
      from auth.users u left join public.staff s on s.email = lower(u.email) left join public.entrevistadores e on e.email = lower(u.email)
     where u.id = new.evaluador;
  else
    new.evaluador := old.evaluador; new.rol := old.rol; new.evaluador_nombre := old.evaluador_nombre; new.candidate_id := old.candidate_id;
  end if;
  if not v_staff then
    -- el entrevistador no puede auditarse a sí mismo
    if tg_op = 'INSERT' then
      new.revision := null; new.revision_comentario := null; new.revisado_por := null; new.revisado_nombre := null; new.revisado_at := null;
    else
      new.revision := old.revision; new.revision_comentario := old.revision_comentario; new.revisado_por := old.revisado_por;
      new.revisado_nombre := old.revisado_nombre; new.revisado_at := old.revisado_at;
    end if;
    if new.decision is distinct from (case when tg_op = 'UPDATE' then old.decision end)
       or new.motivo is distinct from (case when tg_op = 'UPDATE' then old.motivo end) then
      if tg_op = 'UPDATE' and old.revision in ('confirmada', 'desestimada') then
        raise exception 'RRHH ya revisó este resultado; para cambiarlo hablá con RRHH.';
      end if;
      select stage into v_stage from public.candidates where id = new.candidate_id;
      if new.decision is not null and v_stage not in ('cv_recibido', 'entrevista') then
        raise exception 'El candidato ya avanzó en el proceso; la decisión la toma RRHH.';
      end if;
      new.revision := case when new.decision is null then null else 'pendiente' end;
    end if;
    if new.decision is distinct from 'rechazado' then new.motivo := null; end if;
  else
    if new.revision is distinct from (case when tg_op = 'UPDATE' then old.revision end) and new.revision in ('confirmada', 'desestimada') then
      new.revisado_por := auth.uid(); new.revisado_at := now();
      select coalesce(nullif(trim(s.nombre), ''), split_part(u.email, '@', 1)) into new.revisado_nombre
        from auth.users u left join public.staff s on s.email = lower(u.email) where u.id = auth.uid();
    end if;
  end if;
  return new;
end $$;
revoke all on function public.tg_evaluaciones_autor() from public, anon, authenticated;

-- la decisión ya no cambia la etapa directamente: queda como recomendación para RRHH
drop function if exists public.entrevistador_decidir(uuid, text, text);

-- 3) Lista del entrevistador: pendientes + historial de todos los entrevistados de su alcance
drop function if exists public.mis_entrevistas();
create function public.mis_entrevistas()
 returns table (id uuid, nombre text, area text, servicio text, subsector text, posicion text, stage text, cv_recibido date,
                en_entrevista date, localidad text, procedencia text, cv_path text, evaluacion jsonb)
 language sql stable security definer set search_path to ''
as $$
  select c.id, c.nombre, c.area, c.servicio, c.subsector, c.posicion, c.stage, c.cv_recibido, c.en_entrevista, c.localidad, c.procedencia,
         case when public.en_mi_alcance(c.id) then c.cv_path end, to_jsonb(ev) - 'evaluador' - 'candidate_id' - 'revisado_por'
    from public.candidates c
    left join public.evaluaciones ev on ev.candidate_id = c.id and ev.evaluador = auth.uid()
   where public.es_entrevistador()
     and (ev.id is not null or (public.en_mi_alcance(c.id) and (c.stage in ('cv_recibido', 'entrevista') or c.en_entrevista is not null)))
$$;
revoke all on function public.mis_entrevistas() from public, anon;
grant execute on function public.mis_entrevistas() to authenticated;

-- 4) Alta / edición con especialidades
drop function if exists public.entrevistador_upsert(text, text, text, text[], text[], text[]);
create function public.entrevistador_upsert(p_email text, p_nombre text, p_password text,
  p_sectores text[], p_yacimientos text[] default '{}', p_puestos text[] default '{}', p_subsectores text[] default '{}')
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
  insert into public.entrevistadores (email, nombre, sectores, yacimientos, puestos, subsectores)
  values (v_email, nullif(trim(p_nombre), ''), p_sectores, coalesce(p_yacimientos, '{}'), coalesce(p_puestos, '{}'), coalesce(p_subsectores, '{}'))
  on conflict (email) do update set nombre = coalesce(excluded.nombre, public.entrevistadores.nombre),
    sectores = excluded.sectores, yacimientos = excluded.yacimientos, puestos = excluded.puestos, subsectores = excluded.subsectores;
  return v_email;
end $$;
revoke all on function public.entrevistador_upsert(text, text, text, text[], text[], text[], text[]) from public, anon;
grant execute on function public.entrevistador_upsert(text, text, text, text[], text[], text[], text[]) to authenticated;
