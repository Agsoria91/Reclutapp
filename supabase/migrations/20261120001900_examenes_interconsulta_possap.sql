-- ============================================================================
-- Exámenes médicos e interconsultas + POS SAP única (pedido RRHH 20/11)
--
-- Interconsulta: cuando la clínica no da la aptitud, el candidato puede hacer
-- interconsultas por su cuenta para intentar levantarla. NO se cancela ni se
-- pierde el registro: la etapa sigue en "Examen Médico" y se guarda
--   interconsulta         -> fecha en que se lo envió a interconsulta
--   interconsulta_cierre  -> fecha en que se cerró (con la aptitud final)
--   interconsulta_obs     -> observaciones
-- clinica_localidad: sede / ciudad del convenio (DIENTS tiene varias).
--
-- POS SAP: es única. Ya hay repetidas cargadas (se muestran en la app para
-- corregirlas); desde ahora la base rechaza crear o cambiar una silla a una
-- POS SAP que ya usa otra.
-- ============================================================================
alter table public.candidates add column if not exists interconsulta date;
alter table public.candidates add column if not exists interconsulta_cierre date;
alter table public.candidates add column if not exists interconsulta_obs text;
alter table public.candidates add column if not exists clinica_localidad text;

create or replace function public.tg_positions_pos_sap_unica()
returns trigger language plpgsql set search_path = '' as $$
declare v_otra text;
begin
  if nullif(trim(new.pos_sap), '') is null then return new; end if;
  if tg_op = 'UPDATE' and trim(coalesce(old.pos_sap, '')) = trim(new.pos_sap) then return new; end if;
  select puesto || ' (' || yacimiento || ')' into v_otra
    from public.positions
   where trim(pos_sap) = trim(new.pos_sap) and id <> new.id
   limit 1;
  if v_otra is not null then
    raise exception 'La POS SAP % ya está asignada a la silla %', trim(new.pos_sap), v_otra using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists positions_pos_sap_unica on public.positions;
create trigger positions_pos_sap_unica before insert or update of pos_sap on public.positions
  for each row execute function public.tg_positions_pos_sap_unica();
