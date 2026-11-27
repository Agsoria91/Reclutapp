-- La silla toma localidad y procedencia de la ficha del candidato también cuando se editan después de sentarlo.
create table if not exists respaldo.positions_loc_proc_20261127 as
  select p.* from public.positions p join public.candidates c on c.id = p.candidate_id
   where (c.localidad is not null and c.localidad is distinct from p.localidad)
      or (c.procedencia is not null and c.procedencia is distinct from p.procedencia);

create or replace function public.tg_candidates_after()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.stage = 'cancelado' then
    update public.positions
       set candidate_id = null, candidato_nombre = null, stage = 'sin_candidato'
     where candidate_id = new.id;
  else
    update public.positions
       set stage = new.stage, candidato_nombre = new.nombre,
           localidad = coalesce(new.localidad, localidad),
           procedencia = coalesce(new.procedencia, procedencia),
           fecha_ingreso = case when new.stage = 'ingresado'
                                then coalesce(fecha_ingreso, new.fecha_ingreso) else fecha_ingreso end
     where candidate_id = new.id
       and (stage is distinct from new.stage or candidato_nombre is distinct from new.nombre
            or (new.localidad is not null and localidad is distinct from new.localidad)
            or (new.procedencia is not null and procedencia is distinct from new.procedencia));
  end if;
  return null;
end $function$;

update public.positions p
   set localidad = coalesce(c.localidad, p.localidad),
       procedencia = coalesce(c.procedencia, p.procedencia)
  from public.candidates c
 where c.id = p.candidate_id
   and ((c.localidad is not null and c.localidad is distinct from p.localidad)
     or (c.procedencia is not null and c.procedencia is distinct from p.procedencia));

drop trigger if exists candidates_after on public.candidates;
create trigger candidates_after after update on public.candidates
  for each row when (old.stage is distinct from new.stage or old.nombre is distinct from new.nombre
                     or old.localidad is distinct from new.localidad or old.procedencia is distinct from new.procedencia)
  execute function public.tg_candidates_after();
