-- ============================================================================
-- Hitos automáticos: las fechas mandan la etapa y la etapa completa la fecha.
--
--   * Al cargar o cambiar una fecha/hito del candidato, la etapa avanza sola
--     al hito más avanzado (nunca retrocede sola; Cancelado no se toca).
--       En entrevista -> Entrevista · Entrevista OK -> Entrevista Aprobada
--       Validación/OK RRLL -> Validación RRLL · EPO -> Examen Médico
--       Aptitud recibida (no "No Apto") -> Apto · Listo -> Próximo ingreso
--       Fecha de ingreso <= hoy -> Ingresado; futura -> Próximo ingreso
--   * Al cambiar la etapa a mano, se completa la fecha del hito si estaba vacía
--     (hoy) y los indicadores (Entrevista OK, Listo, Cancelado).
--   * La fecha de ingreso se propaga a la silla y al legajo, y los datos
--     personales del candidato completan los campos vacíos del legajo.
-- ============================================================================

create or replace function public.hoy_ar()
returns date language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- Etapa que corresponde según los hitos cargados (sin mirar el texto de Status).
create or replace function public.stage_por_hitos(c public.candidates)
returns text language sql stable
set search_path = ''
as $$
  select case
    when c.fecha_ingreso is not null and c.fecha_ingreso <= public.hoy_ar() then 'ingresado'
    when c.fecha_ingreso is not null or coalesce(c.listo_ingreso, false) then 'proximo_ingreso'
    when c.aptitud_recibida is not null and coalesce(c.aptitud, '') !~* '^no apto' then 'apto'
    when c.epo is not null then 'examen_medico'
    when coalesce(c.ok_rrll, false) or c.validacion_rrll is not null then 'validacion_rrll'
    when coalesce(c.entrevista_ok, false) then 'entrevista_aprobada'
    when c.en_entrevista is not null then 'entrevista'
    else 'cv_recibido'
  end
$$;

create or replace function public.tg_candidates_hitos()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  hitos_cambiaron boolean;
  sugerida text;
  hoy date := public.hoy_ar();
begin
  hitos_cambiaron := tg_op = 'INSERT' or
    (new.en_entrevista, new.entrevista_ok, new.validacion_rrll, new.ok_rrll, new.epo,
     new.aptitud_recibida, new.aptitud, new.listo_ingreso, new.fecha_ingreso)
    is distinct from
    (old.en_entrevista, old.entrevista_ok, old.validacion_rrll, old.ok_rrll, old.epo,
     old.aptitud_recibida, old.aptitud, old.listo_ingreso, old.fecha_ingreso);

  -- 1) la etapa cambió a mano: completar hitos vacíos
  --    (no durante la importación de planillas: ahí las fechas vienen del CSV)
  if (tg_op = 'INSERT' or new.stage is distinct from old.stage)
     and coalesce(current_setting('reclutapp.importando', true), '') <> '1' then
    if new.stage = 'cancelado' then
      new.cancelado := true;
    else
      new.cancelado := false;
      if new.stage in ('entrevista','entrevista_aprobada','validacion_rrll','propuesta','examen_medico','apto','proximo_ingreso','ingresado') then
        new.en_entrevista := coalesce(new.en_entrevista, new.cv_recibido, hoy);
      end if;
      if new.stage in ('entrevista_aprobada','validacion_rrll','propuesta','examen_medico','apto','proximo_ingreso','ingresado') then
        new.entrevista_ok := true;
      end if;
      if new.stage = 'validacion_rrll' then new.validacion_rrll := coalesce(new.validacion_rrll, hoy); end if;
      if new.stage = 'examen_medico' then new.epo := coalesce(new.epo, hoy); end if;
      if new.stage = 'apto' then new.aptitud_recibida := coalesce(new.aptitud_recibida, hoy); end if;
      if new.stage in ('proximo_ingreso','ingresado') then new.listo_ingreso := true; end if;
      if new.stage = 'ingresado' then new.fecha_ingreso := coalesce(new.fecha_ingreso, hoy); end if;
    end if;
  end if;

  -- 2) cambiaron los hitos: avanzar la etapa (nunca retroceder, nunca sacar de Cancelado)
  if hitos_cambiaron and new.stage <> 'cancelado' and not coalesce(new.cancelado, false) then
    sugerida := public.stage_por_hitos(new);
    if (select orden from public.stages where code = sugerida)
       > (select orden from public.stages where code = new.stage) then
      new.stage := sugerida;
      if sugerida in ('entrevista_aprobada','validacion_rrll','examen_medico','apto','proximo_ingreso','ingresado') then
        new.entrevista_ok := true;
      end if;
      if sugerida in ('proximo_ingreso','ingresado') then new.listo_ingreso := true; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists candidates_hitos on public.candidates;
create trigger candidates_hitos before insert or update on public.candidates
  for each row execute function public.tg_candidates_hitos();

-- Propagación: fecha de ingreso -> silla y legajo; datos personales -> legajo (solo vacíos)
create or replace function public.tg_candidates_propagar()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.fecha_ingreso is not null and new.fecha_ingreso is distinct from old.fecha_ingreso then
    update public.positions set fecha_ingreso = new.fecha_ingreso
     where candidate_id = new.id and fecha_ingreso is distinct from new.fecha_ingreso;
    update public.hires set fecha_ingreso = new.fecha_ingreso
     where candidate_id = new.id and fecha_ingreso is distinct from new.fecha_ingreso;
  end if;
  update public.hires h set
    dni = coalesce(h.dni, new.dni), cuil = coalesce(h.cuil, new.cuil),
    fecha_nacimiento = coalesce(h.fecha_nacimiento, new.fecha_nacimiento),
    domicilio = coalesce(h.domicilio, new.domicilio), localidad = coalesce(h.localidad, new.localidad),
    provincia = coalesce(h.provincia, new.provincia), telefono = coalesce(h.telefono, new.telefono),
    mail = coalesce(h.mail, new.mail), talle_mameluco = coalesce(h.talle_mameluco, new.talle_mameluco),
    talle_botas = coalesce(h.talle_botas, new.talle_botas), talle_campera = coalesce(h.talle_campera, new.talle_campera)
  where h.candidate_id = new.id
    and (h.dni is null and new.dni is not null or h.cuil is null and new.cuil is not null
      or h.fecha_nacimiento is null and new.fecha_nacimiento is not null or h.domicilio is null and new.domicilio is not null
      or h.localidad is null and new.localidad is not null or h.provincia is null and new.provincia is not null
      or h.telefono is null and new.telefono is not null or h.mail is null and new.mail is not null
      or h.talle_mameluco is null and new.talle_mameluco is not null or h.talle_botas is null and new.talle_botas is not null
      or h.talle_campera is null and new.talle_campera is not null);
  return null;
end $$;

drop trigger if exists candidates_propagar on public.candidates;
create trigger candidates_propagar after update on public.candidates
  for each row execute function public.tg_candidates_propagar();

-- Silla -> candidato: si se cambia la fecha de ingreso en la silla, va a la ficha
create or replace function public.tg_positions_fecha_ingreso()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.candidate_id is not null and new.fecha_ingreso is not null
     and new.fecha_ingreso is distinct from old.fecha_ingreso then
    update public.candidates set fecha_ingreso = new.fecha_ingreso
     where id = new.candidate_id and fecha_ingreso is distinct from new.fecha_ingreso;
    update public.hires set fecha_ingreso = new.fecha_ingreso
     where position_id = new.id and fecha_ingreso is distinct from new.fecha_ingreso;
  end if;
  return null;
end $$;

drop trigger if exists positions_fecha_ingreso on public.positions;
create trigger positions_fecha_ingreso after update of fecha_ingreso on public.positions
  for each row execute function public.tg_positions_fecha_ingreso();

revoke execute on function public.stage_por_hitos(public.candidates) from public, anon;
grant execute on function public.hoy_ar(), public.stage_por_hitos(public.candidates) to authenticated;

-- La importación marca la transacción para que no se completen fechas con "hoy".
create or replace function public.import_candidates(p_rows jsonb)
returns jsonb language plpgsql
set search_path = ''
as $$
declare n_ins int := 0; n_upd int := 0; r record;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  perform set_config('reclutapp.importando', '1', true);

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

-- Los triggers "after update OF stage" solo se disparan si la columna figura en
-- el UPDATE; ahora la etapa también la cambia la regla de hitos, así que pasan a
-- dispararse por cambio real de valor.
drop trigger if exists candidates_after on public.candidates;
create trigger candidates_after after update on public.candidates
  for each row when (old.stage is distinct from new.stage or old.nombre is distinct from new.nombre)
  execute function public.tg_candidates_after();

drop trigger if exists candidates_terna_recount on public.candidates;
create trigger candidates_terna_recount after update on public.candidates
  for each row when (old.stage is distinct from new.stage)
  execute function public.tg_candidate_terna_recount();
