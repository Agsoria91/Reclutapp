-- Dashboard PJ: columna opcional Sexo/Género (si la planilla la trae).
alter table public.vacantes_pj add column if not exists genero text;   -- 'M' / 'F' / null

create or replace function public.import_vacantes_pj(p_rows jsonb, p_archivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nuevas int; v_act int; v_quit int; v_total int;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no trae búsquedas de EFiS';
  end if;

  create temp table _in on commit drop as
  select * from jsonb_to_recordset(p_rows) as x(
    s text, empresa text, posicion text, descripcion text, diagrama text, persona text,
    fecha_solicitud date, fecha_potencial_ingreso date, proceso text, estado text, jefe text,
    gerencia text, agrupador text, direccion text, reclutador text, pendientes text, genero text)
  where coalesce(trim(s), '') <> '';

  select count(*) into v_total from _in;
  select count(*) into v_nuevas from _in i where not exists (select 1 from public.vacantes_pj v where v.s = i.s);
  select count(*) into v_quit from public.vacantes_pj v where not exists (select 1 from _in i where i.s = v.s);
  select count(*) into v_act from _in i join public.vacantes_pj v on v.s = i.s
   where (v.posicion, v.descripcion, v.diagrama, v.persona, v.fecha_solicitud, v.fecha_potencial_ingreso, v.proceso,
          v.estado, v.jefe, v.gerencia, v.agrupador, v.direccion, v.reclutador, v.pendientes, v.genero)
         is distinct from
         (i.posicion, i.descripcion, i.diagrama, i.persona, i.fecha_solicitud, i.fecha_potencial_ingreso, i.proceso,
          i.estado, i.jefe, i.gerencia, i.agrupador, i.direccion, i.reclutador, i.pendientes, i.genero);

  delete from public.vacantes_pj where true;
  insert into public.vacantes_pj (s, empresa, posicion, descripcion, diagrama, persona, fecha_solicitud,
    fecha_potencial_ingreso, proceso, estado, jefe, gerencia, agrupador, direccion, reclutador, pendientes, genero)
  select distinct on (s) s, coalesce(nullif(trim(empresa), ''), 'EFiS'), posicion, descripcion, diagrama, persona,
    fecha_solicitud, fecha_potencial_ingreso, proceso, estado, jefe, gerencia, agrupador, direccion, reclutador, pendientes, genero
  from _in order by s;

  insert into public.vacantes_pj_importaciones (archivo, filas, nuevas, actualizadas, quitadas)
  values (p_archivo, v_total, v_nuevas, v_act, v_quit);

  return jsonb_build_object('filas', v_total, 'nuevas', v_nuevas, 'actualizadas', v_act, 'quitadas', v_quit);
end $$;
revoke all on function public.import_vacantes_pj(jsonb, text) from public, anon;
grant execute on function public.import_vacantes_pj(jsonb, text) to authenticated;
