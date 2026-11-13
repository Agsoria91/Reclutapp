-- Al cambiar el candidato principal de una silla, la silla toma la etapa del
-- NUEVO candidato. La regla de "gana la etapa más avanzada" queda solo para
-- cuando se vincula la ficha de la MISMA persona que ya figuraba por nombre
-- (por ejemplo, al importar la planilla de posiciones).
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
    if public.norm_txt(new.candidato_nombre) = public.norm_txt(c.nombre)
       and (tg_op = 'INSERT' or old.candidate_id is null) then
      select s.code into new.stage
        from public.stages s
       where s.code in (c.stage, case when new.stage = 'cancelado' then 'sin_candidato' else new.stage end)
       order by s.orden desc limit 1;
    else
      new.stage := c.stage;
    end if;
    new.candidato_nombre := c.nombre;
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
