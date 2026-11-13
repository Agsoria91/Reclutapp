-- ============================================================================
-- Reclutapp EFiS · lógica de negocio
--   * derivación de etapa de candidato (equivalente a etapaDe del tablero)
--   * sincronización silla <-> candidato
--   * alta automática de legajo al pasar una silla a "Ingresado"
--   * RPCs: asignar/liberar silla, importar CSVs, vincular por nombre
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at / updated_by
-- ---------------------------------------------------------------------------
create or replace function public.tg_touch()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create trigger positions_touch  before update on public.positions  for each row execute function public.tg_touch();
create trigger candidates_touch before update on public.candidates for each row execute function public.tg_touch();
create trigger hires_touch      before update on public.hires      for each row execute function public.tg_touch();

-- ---------------------------------------------------------------------------
-- Etapa de un candidato (etapaDe):
--   1) Cancelado = true manda siempre.
--   2) Si el texto de Status tiene alias conocido, se usa.
--   3) Si no, se infiere por el hito más avanzado que tenga cargado.
-- ---------------------------------------------------------------------------
create or replace function public.candidate_stage(
  p_status text, p_cancelado boolean, p_fecha_ingreso date, p_listo boolean,
  p_aptitud_recibida date, p_epo date, p_ok_rrll boolean, p_validacion date,
  p_entrevista_ok boolean, p_en_entrevista date)
returns text language sql stable
set search_path = ''
as $$
  select case
    when coalesce(p_cancelado, false) then 'cancelado'
    when public.stage_from_text(p_status) is not null then public.stage_from_text(p_status)
    when p_fecha_ingreso is not null and p_fecha_ingreso <= current_date then 'ingresado'
    when coalesce(p_listo, false) then 'proximo_ingreso'
    when p_aptitud_recibida is not null then 'apto'
    when p_epo is not null then 'examen_medico'
    when coalesce(p_ok_rrll, false) or p_validacion is not null then 'validacion_rrll'
    when coalesce(p_entrevista_ok, false) then 'entrevista_aprobada'
    when p_en_entrevista is not null then 'entrevista'
    else 'cv_recibido'
  end
$$;

-- ---------------------------------------------------------------------------
-- Alta de legajo a partir de una silla
-- ---------------------------------------------------------------------------
create or replace function public.ensure_hire(p_position uuid, p_default_fecha date)
returns void language plpgsql
set search_path = ''
as $$
declare
  p public.positions;
  c public.candidates;
begin
  select * into p from public.positions where id = p_position;
  if p.id is null or p.stage <> 'ingresado' then return; end if;
  if coalesce(p.candidato_nombre, '') = '' and p.candidate_id is null then return; end if;

  if p.candidate_id is not null then
    select * into c from public.candidates where id = p.candidate_id;
  end if;

  if exists (select 1 from public.hires h
             where h.position_id = p.id
                or (p.candidate_id is not null and h.candidate_id = p.candidate_id)) then
    return;
  end if;

  insert into public.hires (
    candidate_id, position_id, nombre, dni, fecha_ingreso, area, sector, puesto,
    puesto_convenio, categoria, jefe_directo, basico, localidad, telefono, mail,
    procedencia, tipo_cobertura)
  values (
    c.id, p.id, coalesce(c.nombre, p.candidato_nombre), c.dni,
    coalesce(p.fecha_ingreso, c.fecha_ingreso, p_default_fecha),
    p.yacimiento, p.sector, p.puesto, p.puesto_convenio, p.categoria, p.jefe_directo,
    p.basico, coalesce(c.localidad, p.localidad), c.telefono, c.mail,
    coalesce(p.procedencia, c.procedencia), p.tipo_cobertura);
end $$;

-- ---------------------------------------------------------------------------
-- Silla: antes de guardar
--   * al asignar un candidato, toma su nombre y etapa
--   * al liberar la silla (candidate_id -> null) vuelve a "Sin candidato"
--     salvo que en el mismo cambio se haya puesto otro nombre a mano
-- ---------------------------------------------------------------------------
create or replace function public.tg_positions_before()
returns trigger language plpgsql
set search_path = ''
as $$
declare c public.candidates;
begin
  if new.candidate_id is not null
     and (tg_op = 'INSERT' or new.candidate_id is distinct from old.candidate_id) then
    select * into c from public.candidates where id = new.candidate_id;
    if c.stage = 'cancelado' then
      raise exception 'No se puede sentar en una silla a un candidato cancelado (%).', c.nombre;
    end if;
    new.candidato_nombre := c.nombre;
    -- gana la etapa más avanzada entre la silla y la ficha del candidato
    -- (una silla libre está en "sin_candidato", orden 0 -> toma la del candidato)
    select s.code into new.stage
      from public.stages s
     where s.code in (c.stage, case when new.stage = 'cancelado' then 'sin_candidato' else new.stage end)
     order by s.orden desc limit 1;
    new.procedencia := coalesce(c.procedencia, new.procedencia);
    new.localidad := coalesce(c.localidad, new.localidad);
  elsif tg_op = 'UPDATE' and new.candidate_id is null and old.candidate_id is not null
        and new.candidato_nombre is not distinct from old.candidato_nombre then
    new.candidato_nombre := null;
    new.stage := 'sin_candidato';
  end if;

  if coalesce(new.candidato_nombre, '') = '' and new.candidate_id is null
     and new.stage not in ('sin_candidato', 'cancelado') and tg_op = 'UPDATE'
     and old.candidato_nombre is not null then
    new.stage := 'sin_candidato';
  end if;
  return new;
end $$;

create trigger positions_before before insert or update on public.positions
  for each row execute function public.tg_positions_before();

-- Silla: después de guardar -> propaga la etapa al candidato y da de alta el legajo
create or replace function public.tg_positions_after()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.candidate_id is not null then
    update public.candidates
       set stage = new.stage,
           fecha_ingreso = case when new.stage = 'ingresado'
                                then coalesce(new.fecha_ingreso, fecha_ingreso, current_date)
                                else fecha_ingreso end
     where id = new.candidate_id
       and stage is distinct from new.stage
       and new.stage <> 'sin_candidato';
  end if;

  if new.stage = 'ingresado'
     and (tg_op = 'INSERT' or old.stage is distinct from 'ingresado'
          or old.candidate_id is distinct from new.candidate_id) then
    perform public.ensure_hire(new.id, case when tg_op = 'UPDATE' then current_date end);
  end if;
  return null;
end $$;

create trigger positions_after after insert or update on public.positions
  for each row execute function public.tg_positions_after();

-- Candidato: después de cambiar etapa/nombre -> refleja en su silla.
-- Si se cancela, la silla queda libre.
create or replace function public.tg_candidates_after()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.stage = 'cancelado' then
    update public.positions
       set candidate_id = null, candidato_nombre = null, stage = 'sin_candidato'
     where candidate_id = new.id;
  else
    update public.positions
       set stage = new.stage, candidato_nombre = new.nombre,
           fecha_ingreso = case when new.stage = 'ingresado'
                                then coalesce(fecha_ingreso, new.fecha_ingreso) else fecha_ingreso end
     where candidate_id = new.id
       and (stage is distinct from new.stage or candidato_nombre is distinct from new.nombre);
  end if;
  return null;
end $$;

create trigger candidates_after after update of stage, nombre on public.candidates
  for each row execute function public.tg_candidates_after();

-- ---------------------------------------------------------------------------
-- RPC: sentar a un candidato en una silla / liberar una silla
-- ---------------------------------------------------------------------------
create or replace function public.assign_candidate(p_candidate uuid, p_position uuid, p_force boolean default false)
returns public.positions language plpgsql
set search_path = ''
as $$
declare
  pos public.positions;
  ocupante text;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;

  select * into pos from public.positions where id = p_position for update;
  if pos.id is null then raise exception 'La silla no existe'; end if;

  if pos.candidate_id is not null and pos.candidate_id <> p_candidate and not p_force then
    select nombre into ocupante from public.candidates where id = pos.candidate_id;
    raise exception 'La silla ya está ocupada por %', ocupante using errcode = 'P0001', hint = 'ocupada';
  end if;
  if pos.candidate_id is null and coalesce(pos.candidato_nombre,'') <> '' and not p_force then
    raise exception 'La silla tiene asignado a % (sin ficha de candidato)', pos.candidato_nombre
      using errcode = 'P0001', hint = 'ocupada';
  end if;

  -- si el candidato ya estaba en otra silla, se libera
  update public.positions set candidate_id = null where candidate_id = p_candidate and id <> p_position;

  update public.positions set candidate_id = p_candidate where id = p_position returning * into pos;
  return pos;
end $$;

create or replace function public.unassign_position(p_position uuid)
returns public.positions language plpgsql
set search_path = ''
as $$
declare pos public.positions;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.positions
     set candidate_id = null, candidato_nombre = null, stage = 'sin_candidato'
   where id = p_position returning * into pos;
  return pos;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: importación de CSV (el navegador decodifica y parsea; acá se mapea la
-- etapa con la tabla única de alias y se hace upsert por import_key)
-- ---------------------------------------------------------------------------
create or replace function public.import_candidates(p_rows jsonb)
returns jsonb language plpgsql
set search_path = ''
as $$
declare n_ins int := 0; n_upd int := 0; r record;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;

  for r in select * from jsonb_to_recordset(p_rows) as x(
      import_key text, area text, status text, nombre text, procedencia text, servicio text,
      posicion text, cv_recibido date, en_entrevista date, entrevista_ok boolean,
      validacion_rrll date, ok_rrll boolean, epo date, clinica text, aptitud_recibida date,
      aptitud text, listo_ingreso boolean, fecha_ingreso date, cancelado boolean,
      motivos_baja text[], comentarios text, created_origen timestamptz, localidad text,
      provincia text, telefono text, mail text, dni text)
  loop
    insert into public.candidates as c (
      import_key, area, stage, status_original, nombre, procedencia, servicio, posicion,
      cv_recibido, en_entrevista, entrevista_ok, validacion_rrll, ok_rrll, epo, clinica,
      aptitud_recibida, aptitud, listo_ingreso, fecha_ingreso, cancelado, motivos_baja,
      comentarios, created_origen, localidad, provincia, telefono, mail, dni)
    values (
      r.import_key, r.area,
      public.candidate_stage(r.status, r.cancelado, r.fecha_ingreso, r.listo_ingreso,
        r.aptitud_recibida, r.epo, r.ok_rrll, r.validacion_rrll, r.entrevista_ok, r.en_entrevista),
      r.status, r.nombre, r.procedencia, r.servicio, r.posicion,
      r.cv_recibido, r.en_entrevista, coalesce(r.entrevista_ok,false), r.validacion_rrll,
      coalesce(r.ok_rrll,false), r.epo, r.clinica, r.aptitud_recibida, r.aptitud,
      coalesce(r.listo_ingreso,false), r.fecha_ingreso, coalesce(r.cancelado,false),
      coalesce(r.motivos_baja,'{}'), r.comentarios, r.created_origen, r.localidad, r.provincia,
      r.telefono, r.mail, r.dni)
    on conflict (import_key) do update set
      area = excluded.area, stage = excluded.stage, status_original = excluded.status_original,
      nombre = excluded.nombre, procedencia = excluded.procedencia, servicio = excluded.servicio,
      posicion = excluded.posicion, cv_recibido = excluded.cv_recibido,
      en_entrevista = excluded.en_entrevista, entrevista_ok = excluded.entrevista_ok,
      validacion_rrll = excluded.validacion_rrll, ok_rrll = excluded.ok_rrll, epo = excluded.epo,
      clinica = excluded.clinica, aptitud_recibida = excluded.aptitud_recibida,
      aptitud = excluded.aptitud, listo_ingreso = excluded.listo_ingreso,
      fecha_ingreso = excluded.fecha_ingreso, cancelado = excluded.cancelado,
      motivos_baja = excluded.motivos_baja, comentarios = excluded.comentarios,
      created_origen = excluded.created_origen, localidad = excluded.localidad,
      provincia = excluded.provincia,
      telefono = coalesce(excluded.telefono, c.telefono),
      mail = coalesce(excluded.mail, c.mail),
      dni = coalesce(excluded.dni, c.dni);
    if found then
      if (select xmax = 0 from public.candidates where import_key = r.import_key) then
        n_ins := n_ins + 1; else n_upd := n_upd + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('insertados', n_ins, 'actualizados', n_upd);
end $$;

create or replace function public.import_positions(p_rows jsonb)
returns jsonb language plpgsql
set search_path = ''
as $$
declare n_ins int := 0; n_upd int := 0; r record; v_stage text; was_insert boolean;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;

  for r in select * from jsonb_to_recordset(p_rows) as x(
      import_key text, pos_sap text, yacimiento text, jefe_directo text, sector text,
      puesto text, diagrama text, turno text, encuadre text, tipo_cobertura text, status text,
      candidato_nombre text, procedencia text, localidad text, cand_activos int,
      fecha_inicio date, fecha_objetivo date, categoria text, puesto_convenio text,
      basico numeric, id_sap text, fecha_ingreso date, adicional text, observaciones text,
      revisar text)
  loop
    v_stage := coalesce(public.stage_from_text(r.status),
                        case when coalesce(r.candidato_nombre,'') = '' then 'sin_candidato' else 'entrevista' end);

    insert into public.positions as p (
      import_key, pos_sap, yacimiento, jefe_directo, sector, puesto, diagrama, turno, encuadre,
      tipo_cobertura, stage, status_original, candidato_nombre, procedencia, localidad,
      cand_activos, fecha_inicio, fecha_objetivo, categoria, puesto_convenio, basico, id_sap,
      fecha_ingreso, adicional, observaciones, revisar)
    values (
      r.import_key, r.pos_sap, r.yacimiento, r.jefe_directo, r.sector, r.puesto, r.diagrama,
      r.turno, r.encuadre, r.tipo_cobertura, v_stage, r.status, r.candidato_nombre,
      r.procedencia, r.localidad, r.cand_activos, r.fecha_inicio, r.fecha_objetivo,
      r.categoria, r.puesto_convenio, r.basico, r.id_sap, r.fecha_ingreso, r.adicional,
      r.observaciones, r.revisar)
    on conflict (import_key) do update set
      pos_sap = excluded.pos_sap, yacimiento = excluded.yacimiento,
      jefe_directo = excluded.jefe_directo, sector = excluded.sector, puesto = excluded.puesto,
      diagrama = excluded.diagrama, turno = excluded.turno, encuadre = excluded.encuadre,
      tipo_cobertura = excluded.tipo_cobertura,
      -- si la silla ya tiene un candidato vinculado en la app, su etapa manda
      stage = case when p.candidate_id is null then excluded.stage else p.stage end,
      candidato_nombre = case when p.candidate_id is null then excluded.candidato_nombre else p.candidato_nombre end,
      status_original = excluded.status_original, procedencia = excluded.procedencia,
      localidad = excluded.localidad, cand_activos = excluded.cand_activos,
      fecha_inicio = excluded.fecha_inicio, fecha_objetivo = excluded.fecha_objetivo,
      categoria = excluded.categoria, puesto_convenio = excluded.puesto_convenio,
      basico = excluded.basico, id_sap = excluded.id_sap, fecha_ingreso = excluded.fecha_ingreso,
      adicional = excluded.adicional, observaciones = excluded.observaciones,
      revisar = excluded.revisar
    returning (xmax = 0) into was_insert;
    if was_insert then n_ins := n_ins + 1; else n_upd := n_upd + 1; end if;
  end loop;

  return jsonb_build_object('insertados', n_ins, 'actualizados', n_upd,
                            'vinculados', public.link_positions_by_name());
end $$;

-- Vincula sillas sin ficha con el candidato de igual nombre (normalizado),
-- solo si hay exactamente un candidato no cancelado con ese nombre y libre.
create or replace function public.link_positions_by_name()
returns int language plpgsql
set search_path = ''
as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;

  with matches as (
    select p.id as pid, min(c.id::text)::uuid as cid, count(*) as n
    from public.positions p
    join public.candidates c
      on public.norm_txt(c.nombre) = public.norm_txt(p.candidato_nombre)
     and c.stage <> 'cancelado'
     and not exists (select 1 from public.positions p2 where p2.candidate_id = c.id)
    where p.candidate_id is null and coalesce(p.candidato_nombre,'') <> ''
    group by p.id
  ), unicos as (
    select m.pid, m.cid from matches m
    where m.n = 1
      and (select count(*) from matches m2 where m2.cid = m.cid) = 1
  ), upd as (
    -- conserva la etapa de la planilla de posiciones si está más avanzada
    update public.positions p set candidate_id = u.cid
    from unicos u where p.id = u.pid
    returning p.id
  )
  select count(*) into n from upd;
  return n;
end $$;
