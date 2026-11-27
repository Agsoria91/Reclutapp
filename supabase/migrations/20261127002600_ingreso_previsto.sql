-- Fecha de ingreso prevista (planificada) separada de la confirmada.
-- La confirmada (fecha_ingreso) solo tiene sentido en Próximo ingreso / Ingresado.
alter table public.positions add column if not exists ingreso_previsto date;

create table if not exists respaldo.positions_ingreso_previsto_20261127 as
  select * from public.positions
   where fecha_ingreso is not null and stage not in ('proximo_ingreso', 'ingresado');

update public.positions
   set ingreso_previsto = fecha_ingreso, fecha_ingreso = null
 where fecha_ingreso is not null and stage not in ('proximo_ingreso', 'ingresado');

create or replace view public.positions_public as
 select id, pos_sap, yacimiento, jefe_directo, sector, puesto, diagrama, turno, encuadre,
        tipo_cobertura, stage, (candidate_id is not null) as tiene_ficha, candidato_nombre,
        procedencia, localidad, cand_activos, fecha_inicio, fecha_objetivo, categoria,
        puesto_convenio, fecha_ingreso, updated_at, ingreso_previsto
   from public.positions
  where public.puede_leer();

-- Importación: la fecha de la planilla va a "prevista" salvo que la silla esté en Próximo ingreso / Ingresado.
create or replace function public.import_positions(p_rows jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
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
      fecha_ingreso, ingreso_previsto, adicional, observaciones, revisar)
    values (
      r.import_key, r.pos_sap, r.yacimiento, r.jefe_directo, r.sector, r.puesto, r.diagrama,
      r.turno, r.encuadre, r.tipo_cobertura, v_stage, r.status, r.candidato_nombre,
      r.procedencia, r.localidad, r.cand_activos, r.fecha_inicio, r.fecha_objetivo,
      r.categoria, r.puesto_convenio, r.basico, r.id_sap,
      case when v_stage in ('proximo_ingreso','ingresado') then r.fecha_ingreso end,
      case when v_stage in ('proximo_ingreso','ingresado') then null else r.fecha_ingreso end,
      r.adicional, r.observaciones, r.revisar)
    on conflict (import_key) do update set
      pos_sap = excluded.pos_sap, yacimiento = excluded.yacimiento,
      jefe_directo = excluded.jefe_directo, sector = excluded.sector, puesto = excluded.puesto,
      diagrama = excluded.diagrama, turno = excluded.turno, encuadre = excluded.encuadre,
      tipo_cobertura = excluded.tipo_cobertura,
      stage = case when p.candidate_id is null then excluded.stage else p.stage end,
      candidato_nombre = case when p.candidate_id is null then excluded.candidato_nombre else p.candidato_nombre end,
      status_original = excluded.status_original, procedencia = excluded.procedencia,
      localidad = excluded.localidad, cand_activos = excluded.cand_activos,
      fecha_inicio = excluded.fecha_inicio, fecha_objetivo = excluded.fecha_objetivo,
      categoria = excluded.categoria, puesto_convenio = excluded.puesto_convenio,
      basico = excluded.basico, id_sap = excluded.id_sap,
      fecha_ingreso = case when (case when p.candidate_id is null then excluded.stage else p.stage end)
                               in ('proximo_ingreso','ingresado')
                          then coalesce(excluded.fecha_ingreso, excluded.ingreso_previsto)
                          else p.fecha_ingreso end,
      ingreso_previsto = case when (case when p.candidate_id is null then excluded.stage else p.stage end)
                                  in ('proximo_ingreso','ingresado')
                             then p.ingreso_previsto
                             else coalesce(excluded.fecha_ingreso, excluded.ingreso_previsto) end,
      adicional = excluded.adicional, observaciones = excluded.observaciones,
      revisar = excluded.revisar
    returning (xmax = 0) into was_insert;
    if was_insert then n_ins := n_ins + 1; else n_upd := n_upd + 1; end if;
  end loop;

  return jsonb_build_object('insertados', n_ins, 'actualizados', n_upd,
                            'vinculados', public.link_positions_by_name());
end $function$;
