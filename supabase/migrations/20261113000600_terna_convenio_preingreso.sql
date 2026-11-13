-- ============================================================================
-- v3: convenio en la silla, terna de candidatos por silla y
--     datos de pre-ingreso / legajo (CUIL, domicilio, talles, nacimiento).
-- ============================================================================

-- El catálogo de puestos de convenio (Referencia Categorías) es dato público de
-- referencia: vive en src/data/convenio.json. En la silla se guarda el texto.
alter table public.positions add column if not exists convenio text;
grant select (convenio) on public.positions to anon;

-- ---------------------------------------------------------------------------
-- Terna: varios candidatos en proceso para una misma silla. El principal
-- sigue siendo positions.candidate_id; los demás son alternativos.
-- positions.cand_activos = cuántos de la terna siguen vivos (no cancelados).
-- ---------------------------------------------------------------------------
create table public.position_candidates (
  position_id  uuid not null references public.positions(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  added_at     timestamptz not null default now(),
  added_by     uuid default auth.uid(),
  primary key (position_id, candidate_id)
);
create index position_candidates_cand_idx on public.position_candidates(candidate_id);
alter table public.position_candidates enable row level security;
revoke all on public.position_candidates from anon, authenticated;
grant select, insert, delete on public.position_candidates to authenticated;
create policy terna_staff on public.position_candidates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.recount_terna(p_position uuid)
returns void language plpgsql
set search_path = ''
as $$
declare n int;
begin
  select count(*) into n from (
    select pc.candidate_id from public.position_candidates pc where pc.position_id = p_position
    union
    select p.candidate_id from public.positions p where p.id = p_position and p.candidate_id is not null
  ) t join public.candidates c on c.id = t.candidate_id
  where c.stage <> 'cancelado';
  -- silla con nombre cargado a mano (sin ficha) cuenta como 1
  if n = 0 and exists (select 1 from public.positions p where p.id = p_position
                       and p.candidate_id is null and coalesce(p.candidato_nombre, '') <> '') then
    n := 1;
  end if;
  update public.positions set cand_activos = n
   where id = p_position and cand_activos is distinct from n;
end $$;

create or replace function public.tg_terna_changed()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  perform public.recount_terna(coalesce(new.position_id, old.position_id));
  return null;
end $$;
create trigger terna_changed after insert or delete on public.position_candidates
  for each row execute function public.tg_terna_changed();

-- cuando cambia la etapa de un candidato, recontar las sillas donde está
create or replace function public.tg_candidate_terna_recount()
returns trigger language plpgsql
set search_path = ''
as $$
declare pid uuid;
begin
  for pid in select position_id from public.position_candidates where candidate_id = new.id
             union select id from public.positions where candidate_id = new.id loop
    perform public.recount_terna(pid);
  end loop;
  return null;
end $$;
create trigger candidates_terna_recount after update of stage on public.candidates
  for each row execute function public.tg_candidate_terna_recount();

-- el principal de una silla siempre forma parte de su terna
create or replace function public.tg_positions_terna()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.candidate_id is not null and (tg_op = 'INSERT' or new.candidate_id is distinct from old.candidate_id) then
    insert into public.position_candidates (position_id, candidate_id)
    values (new.id, new.candidate_id) on conflict do nothing;
  end if;
  if tg_op = 'UPDATE' and (new.candidate_id is distinct from old.candidate_id
                           or new.candidato_nombre is distinct from old.candidato_nombre) then
    perform public.recount_terna(new.id);
  end if;
  return null;
end $$;
create trigger positions_terna after insert or update of candidate_id, candidato_nombre on public.positions
  for each row execute function public.tg_positions_terna();

-- principales actuales -> terna (sin recontar: se respeta "Cand. activos" de la planilla)
insert into public.position_candidates (position_id, candidate_id)
select id, candidate_id from public.positions where candidate_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Pre-ingreso y legajo: datos que se completan en "Próximos ingresos".
-- Todos SENSIBLES: no se agregan a los privilegios del rol anónimo.
-- ---------------------------------------------------------------------------
alter table public.candidates
  add column if not exists fecha_nacimiento date,
  add column if not exists cuil text,
  add column if not exists domicilio text,
  add column if not exists talle_mameluco text,
  add column if not exists talle_botas text,
  add column if not exists talle_campera text;

alter table public.hires
  add column if not exists fecha_nacimiento date,
  add column if not exists cuil text,
  add column if not exists domicilio text,
  add column if not exists provincia text,
  add column if not exists convenio text,
  add column if not exists talle_mameluco text,
  add column if not exists talle_botas text,
  add column if not exists talle_campera text;

-- el legajo se crea con todo lo que se completó en el pre-ingreso
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
    puesto_convenio, categoria, convenio, jefe_directo, basico, localidad, provincia, telefono, mail,
    procedencia, tipo_cobertura, fecha_nacimiento, cuil, domicilio,
    talle_mameluco, talle_botas, talle_campera)
  values (
    c.id, p.id, coalesce(c.nombre, p.candidato_nombre), c.dni,
    coalesce(p.fecha_ingreso, c.fecha_ingreso, p_default_fecha),
    p.yacimiento, p.sector, p.puesto, p.puesto_convenio, p.categoria, p.convenio, p.jefe_directo,
    p.basico, coalesce(c.localidad, p.localidad), c.provincia, c.telefono, c.mail,
    coalesce(p.procedencia, c.procedencia), p.tipo_cobertura, c.fecha_nacimiento, c.cuil, c.domicilio,
    c.talle_mameluco, c.talle_botas, c.talle_campera);
end $$;

revoke execute on function public.recount_terna(uuid) from public, anon;
grant execute on function public.recount_terna(uuid) to authenticated;
