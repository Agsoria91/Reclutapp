-- ============================================================================
-- Nómina general EFiS (solo RRHH) + respaldo previo a la carga masiva.
--   * public.nomina: todo el personal. Se carga desde la planilla de nómina y
--     cada legajo nuevo (ingreso confirmado en la app) pasa solo a la nómina.
--   * schema respaldo: copia de fichas, sillas, legajos y ternas antes de
--     completar datos desde las planillas (no expuesto por la API).
-- ============================================================================

create table public.nomina (
  id               uuid primary key default gen_random_uuid(),
  id_ext           text,
  nro_pers         text,
  nombre           text not null,
  dni              text unique,
  cuil             text,
  fecha_nacimiento date,
  f_reconocida     date,
  fecha_ingreso    date,
  sexo             text,
  encuadre         text,
  categoria        text,
  fin_pf           date,
  titling          text,
  funcion          text,
  sector           text,
  yacimiento       text,
  diagrama         text,
  jefe             text,
  domicilio        text,
  localidad        text,
  provincia        text,
  telefono         text,
  mail             text,
  pos              text,
  ceco             text,
  aportes          text,
  ddjj             text,
  regalo_kit       text,
  notas            text,
  talle_mameluco   text,
  talle_botas      text,
  talle_campera    text,
  estado           text not null default 'activo' check (estado in ('activo','baja')),
  fecha_baja       date,
  motivo_baja      text,
  hire_id          uuid references public.hires(id) on delete set null,
  origen           text not null default 'planilla' check (origen in ('planilla','app')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);
create unique index nomina_hire_uq on public.nomina(hire_id) where hire_id is not null;
create index nomina_pos_idx on public.nomina(pos);

create trigger nomina_touch before update on public.nomina for each row execute function public.tg_touch();

alter table public.nomina enable row level security;
revoke all on public.nomina from anon, authenticated;
grant select, insert, update, delete on public.nomina to authenticated;
create policy nomina_staff on public.nomina for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Cada legajo pasa a la nómina: se vincula por legajo, DNI o nombre; si no
-- existe y tiene DNI, se agrega. Solo completa campos vacíos (no pisa la nómina).
create or replace function public.tg_hires_nomina()
returns trigger language plpgsql
set search_path = ''
as $$
declare nid uuid;
begin
  select id into nid from public.nomina where hire_id = new.id;
  if nid is null and new.dni is not null then
    select id into nid from public.nomina where dni = regexp_replace(new.dni, '\D', '', 'g');
  end if;
  if nid is null then
    select id into nid from public.nomina
     where hire_id is null and public.norm_txt(nombre) = public.norm_txt(new.nombre) limit 1;
  end if;

  if nid is null and nullif(regexp_replace(coalesce(new.dni, ''), '\D', '', 'g'), '') is null then
    return null; -- sin DNI y sin coincidencia: entra a la nómina cuando se cargue el DNI
  end if;

  if nid is null then
    insert into public.nomina (nombre, dni, cuil, fecha_nacimiento, fecha_ingreso, encuadre, categoria,
      funcion, sector, yacimiento, jefe, domicilio, localidad, provincia, telefono, mail,
      talle_mameluco, talle_botas, talle_campera, estado, fecha_baja, motivo_baja, hire_id, origen)
    values (new.nombre, nullif(regexp_replace(coalesce(new.dni, ''), '\D', '', 'g'), ''), new.cuil,
      new.fecha_nacimiento, new.fecha_ingreso, 'PP', new.categoria, new.puesto_convenio, new.sector, new.area,
      new.jefe_directo, new.domicilio, new.localidad, new.provincia, new.telefono, new.mail,
      new.talle_mameluco, new.talle_botas, new.talle_campera, new.estado, new.fecha_baja, new.motivo_baja,
      new.id, 'app');
  else
    update public.nomina n set
      hire_id = coalesce(n.hire_id, new.id),
      dni = coalesce(n.dni, nullif(regexp_replace(coalesce(new.dni, ''), '\D', '', 'g'), '')),
      cuil = coalesce(n.cuil, new.cuil), fecha_nacimiento = coalesce(n.fecha_nacimiento, new.fecha_nacimiento),
      fecha_ingreso = coalesce(n.fecha_ingreso, new.fecha_ingreso), categoria = coalesce(n.categoria, new.categoria),
      funcion = coalesce(n.funcion, new.puesto_convenio), sector = coalesce(n.sector, new.sector),
      yacimiento = coalesce(n.yacimiento, new.area), jefe = coalesce(n.jefe, new.jefe_directo),
      domicilio = coalesce(n.domicilio, new.domicilio), localidad = coalesce(n.localidad, new.localidad),
      provincia = coalesce(n.provincia, new.provincia), telefono = coalesce(n.telefono, new.telefono),
      mail = coalesce(n.mail, new.mail), talle_mameluco = coalesce(n.talle_mameluco, new.talle_mameluco),
      talle_botas = coalesce(n.talle_botas, new.talle_botas), talle_campera = coalesce(n.talle_campera, new.talle_campera),
      estado = case when new.estado = 'baja' then 'baja' else n.estado end,
      fecha_baja = coalesce(n.fecha_baja, new.fecha_baja), motivo_baja = coalesce(n.motivo_baja, new.motivo_baja)
    where n.id = nid;
  end if;
  return null;
end $$;

create trigger hires_nomina after insert or update on public.hires
  for each row execute function public.tg_hires_nomina();

-- Respaldo previo a la carga masiva (no expuesto por la API: fuera de "public")
create schema if not exists respaldo;
revoke all on schema respaldo from public, anon, authenticated;
create table respaldo.candidates_20261113 as select * from public.candidates;
create table respaldo.positions_20261113 as select * from public.positions;
create table respaldo.hires_20261113 as select * from public.hires;
create table respaldo.position_candidates_20261113 as select * from public.position_candidates;
