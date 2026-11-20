-- ============================================================================
-- Regla médica sobre la etapa: no puede estar en "Apto" quien tiene aptitud
-- "No Apto" (definitivo o temporal) o una interconsulta abierta. En ese caso
-- vuelve a "Examen Médico" (no se cancela: el registro se conserva).
-- Corre después de candidates_hitos (los BEFORE triggers van por nombre).
-- ============================================================================
create or replace function public.tg_candidates_hitos_medico()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage = 'apto'
     and (coalesce(new.aptitud, '') ~* '^\s*no apto'
          or (new.interconsulta is not null and new.interconsulta_cierre is null)) then
    new.stage := 'examen_medico';
  end if;
  return new;
end $$;

drop trigger if exists candidates_hitos_medico on public.candidates;
create trigger candidates_hitos_medico before insert or update on public.candidates
  for each row execute function public.tg_candidates_hitos_medico();

-- corregir a quienes ya quedaron mal (se refleja solo en su silla)
update public.candidates
   set stage = 'examen_medico'
 where stage = 'apto'
   and (coalesce(aptitud, '') ~* '^\s*no apto' or (interconsulta is not null and interconsulta_cierre is null));

-- clínicas con una sola escritura
update public.candidates set clinica = 'CMIT' where clinica ~* '^\s*cmit\s*$' and clinica <> 'CMIT';
update public.candidates set clinica = 'SYNERGYS' where clinica ~* '^\s*synergys\s*$' and clinica <> 'SYNERGYS';
update public.candidates set clinica = 'SANTA CRUZ' where clinica ~* '^\s*santa cruz\s*$' and clinica <> 'SANTA CRUZ';
update public.candidates set clinica = 'DIENTS' where clinica ~* '^\s*dients\s*$' and clinica <> 'DIENTS';
