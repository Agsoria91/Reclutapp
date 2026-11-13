-- ============================================================================
-- Unificación: la NÓMINA es el único registro de personal.
--   * Legajos deja de ser una tabla: la pantalla muestra la nómina filtrada a
--     quienes ingresaron por una silla (position_id / candidate_id).
--   * Confirmar un ingreso crea o actualiza a la persona directamente en la
--     nómina (si ya estaba, p. ej. un movimiento interno, se actualiza su
--     yacimiento/sector/puesto a la silla nueva).
--   * La tabla hires queda archivada en el schema respaldo.
-- ============================================================================

-- 1) Datos propios del reclutamiento, ahora en la nómina
alter table public.nomina
  add column if not exists position_id    uuid references public.positions(id) on delete set null,
  add column if not exists candidate_id   uuid references public.candidates(id) on delete set null,
  add column if not exists puesto         text,
  add column if not exists puesto_convenio text,
  add column if not exists convenio       text,
  add column if not exists basico         numeric(14,2),
  add column if not exists procedencia    text,
  add column if not exists tipo_cobertura text;
create unique index if not exists nomina_candidate_uq on public.nomina(candidate_id) where candidate_id is not null;
create unique index if not exists nomina_position_activo_uq on public.nomina(position_id) where position_id is not null and estado = 'activo';

-- Sector con el mismo vocabulario de la planilla (sin duplicados por mayúsculas)
create or replace function public.canon_sector(t text)
returns text language sql stable
set search_path = ''
as $$
  select case when t is null then null else coalesce(
    (select n.sector from public.nomina n
      where n.origen = 'planilla' and n.sector is not null and lower(n.sector) = lower(t) and n.sector <> upper(n.sector)
      group by n.sector order by count(*) desc limit 1),
    case when t = upper(t) and length(t) > 4 then initcap(lower(t)) else t end) end
$$;

-- 2) Respaldo antes de unificar
create table if not exists respaldo.nomina_pre_unificacion as select * from public.nomina;
create table if not exists respaldo.hires_pre_unificacion as select * from public.hires;

-- 3) Movimientos internos sin DNI en el legajo: vincular con su registro de nómina
--    (Castillo de Instrumentos 5 = Castillo Guillermo Marcos, confirmado por RRHH)
update public.nomina n set hire_id = h.id
  from public.hires h
 where n.hire_id is null and h.dni is null
   and ((public.norm_txt(h.nombre) = 'galera' and public.norm_txt(n.nombre) = 'galera carla debora')
     or (public.norm_txt(h.nombre) = 'dipp emir' and public.norm_txt(n.nombre) = 'dip emir abdul')
     or (public.norm_txt(h.nombre) = 'cabeza lautaro' and public.norm_txt(n.nombre) = 'cabeza lautaro sebastian')
     or (public.norm_txt(h.nombre) = 'castillo' and public.norm_txt(n.nombre) = 'castillo guillermo marcos'));

-- 4) Pasar los datos de cada legajo a su registro de nómina
--    (reclutamiento: se copia; datos personales: solo completa vacíos)
update public.nomina n set
  position_id = h.position_id, candidate_id = h.candidate_id,
  puesto = coalesce(h.puesto, n.puesto), puesto_convenio = coalesce(h.puesto_convenio, n.puesto_convenio),
  convenio = coalesce(h.convenio, n.convenio), basico = coalesce(h.basico, n.basico),
  procedencia = coalesce(h.procedencia, n.procedencia), tipo_cobertura = coalesce(h.tipo_cobertura, n.tipo_cobertura),
  categoria = coalesce(n.categoria, h.categoria), funcion = coalesce(n.funcion, h.puesto_convenio),
  yacimiento = coalesce(n.yacimiento, h.area), sector = coalesce(n.sector, public.canon_sector(h.sector)),
  jefe = coalesce(n.jefe, h.jefe_directo),
  dni = coalesce(n.dni, nullif(regexp_replace(coalesce(h.dni, ''), '\D', '', 'g'), '')),
  cuil = coalesce(n.cuil, h.cuil), fecha_nacimiento = coalesce(n.fecha_nacimiento, h.fecha_nacimiento),
  fecha_ingreso = coalesce(n.fecha_ingreso, h.fecha_ingreso), domicilio = coalesce(n.domicilio, h.domicilio),
  localidad = coalesce(n.localidad, h.localidad), provincia = coalesce(n.provincia, h.provincia),
  telefono = coalesce(n.telefono, h.telefono), mail = coalesce(n.mail, h.mail),
  talle_mameluco = coalesce(n.talle_mameluco, h.talle_mameluco), talle_botas = coalesce(n.talle_botas, h.talle_botas),
  talle_campera = coalesce(n.talle_campera, h.talle_campera),
  estado = case when h.estado = 'baja' then 'baja' else n.estado end,
  fecha_baja = coalesce(n.fecha_baja, h.fecha_baja), motivo_baja = coalesce(n.motivo_baja, h.motivo_baja),
  notas = coalesce(n.notas, h.notas)
from public.hires h
where n.hire_id = h.id;

-- 5) Alta de ingreso directamente en la nómina
create or replace function public.ensure_hire(p_position uuid, p_default_fecha date)
returns void language plpgsql
set search_path = ''
as $$
declare
  p public.positions;
  c public.candidates;
  nid uuid;
  v_dni text;
begin
  select * into p from public.positions where id = p_position;
  if p.id is null or p.stage <> 'ingresado' then return; end if;
  if coalesce(p.candidato_nombre, '') = '' and p.candidate_id is null then return; end if;
  if p.candidate_id is not null then
    select * into c from public.candidates where id = p.candidate_id;
  end if;
  v_dni := nullif(regexp_replace(coalesce(c.dni, ''), '\D', '', 'g'), '');

  -- ¿ya está en la nómina? (por ficha, DNI, silla o nombre)
  if c.id is not null then select id into nid from public.nomina where candidate_id = c.id; end if;
  if nid is null and v_dni is not null then select id into nid from public.nomina where dni = v_dni; end if;
  if nid is null then
    select id into nid from public.nomina where position_id = p.id and estado = 'activo'
       and public.norm_txt(nombre) = public.norm_txt(coalesce(c.nombre, p.candidato_nombre)) limit 1;
  end if;
  if nid is null then
    select id into nid from public.nomina
     where public.norm_txt(nombre) = public.norm_txt(coalesce(c.nombre, p.candidato_nombre)) limit 1;
  end if;

  -- la silla pasa a esta persona: si otro registro activo la tenía, se la quita
  update public.nomina set position_id = null
   where position_id = p.id and estado = 'activo' and id is distinct from nid;

  if nid is null then
    insert into public.nomina (nombre, dni, cuil, fecha_nacimiento, fecha_ingreso, encuadre, categoria, funcion,
      sector, yacimiento, diagrama, jefe, domicilio, localidad, provincia, telefono, mail, pos,
      talle_mameluco, talle_botas, talle_campera, position_id, candidate_id, puesto, puesto_convenio, convenio,
      basico, procedencia, tipo_cobertura, origen)
    values (coalesce(c.nombre, p.candidato_nombre), v_dni, c.cuil, c.fecha_nacimiento,
      coalesce(p.fecha_ingreso, c.fecha_ingreso, p_default_fecha), coalesce(p.encuadre, 'PP'), p.categoria,
      p.puesto_convenio, public.canon_sector(p.sector), p.yacimiento, p.diagrama, p.jefe_directo,
      c.domicilio, coalesce(c.localidad, p.localidad), c.provincia, c.telefono, c.mail, p.pos_sap,
      c.talle_mameluco, c.talle_botas, c.talle_campera, p.id, c.id, p.puesto, p.puesto_convenio, p.convenio,
      p.basico, coalesce(p.procedencia, c.procedencia), p.tipo_cobertura, 'app');
  else
    -- ya estaba (movimiento interno o reingreso): pasa a la silla nueva
    update public.nomina n set
      position_id = p.id, candidate_id = coalesce(c.id, n.candidate_id),
      yacimiento = p.yacimiento, sector = coalesce(public.canon_sector(p.sector), n.sector),
      puesto = p.puesto, puesto_convenio = coalesce(p.puesto_convenio, n.puesto_convenio),
      convenio = coalesce(p.convenio, n.convenio), categoria = coalesce(p.categoria, n.categoria),
      basico = coalesce(p.basico, n.basico), jefe = coalesce(p.jefe_directo, n.jefe),
      diagrama = coalesce(p.diagrama, n.diagrama), pos = coalesce(p.pos_sap, n.pos),
      procedencia = coalesce(p.procedencia, c.procedencia, n.procedencia), tipo_cobertura = coalesce(p.tipo_cobertura, n.tipo_cobertura),
      fecha_ingreso = coalesce(n.fecha_ingreso, p.fecha_ingreso, c.fecha_ingreso, p_default_fecha),
      dni = coalesce(n.dni, v_dni), cuil = coalesce(n.cuil, c.cuil),
      fecha_nacimiento = coalesce(n.fecha_nacimiento, c.fecha_nacimiento), domicilio = coalesce(n.domicilio, c.domicilio),
      localidad = coalesce(n.localidad, c.localidad), provincia = coalesce(n.provincia, c.provincia),
      telefono = coalesce(n.telefono, c.telefono), mail = coalesce(n.mail, c.mail),
      talle_mameluco = coalesce(n.talle_mameluco, c.talle_mameluco), talle_botas = coalesce(n.talle_botas, c.talle_botas),
      talle_campera = coalesce(n.talle_campera, c.talle_campera),
      estado = 'activo', fecha_baja = null, motivo_baja = null
    where n.id = nid;
  end if;
end $$;

-- 6) Sincronización ficha -> nómina (antes iba al legajo)
create or replace function public.tg_candidates_propagar()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.fecha_ingreso is not null and new.fecha_ingreso is distinct from old.fecha_ingreso then
    update public.positions set fecha_ingreso = new.fecha_ingreso
     where candidate_id = new.id and fecha_ingreso is distinct from new.fecha_ingreso;
    update public.nomina set fecha_ingreso = new.fecha_ingreso
     where candidate_id = new.id and origen = 'app' and fecha_ingreso is distinct from new.fecha_ingreso;
  end if;
  update public.nomina n set
    dni = coalesce(n.dni, nullif(regexp_replace(coalesce(new.dni, ''), '\D', '', 'g'), '')), cuil = coalesce(n.cuil, new.cuil),
    fecha_nacimiento = coalesce(n.fecha_nacimiento, new.fecha_nacimiento),
    domicilio = coalesce(n.domicilio, new.domicilio), localidad = coalesce(n.localidad, new.localidad),
    provincia = coalesce(n.provincia, new.provincia), telefono = coalesce(n.telefono, new.telefono),
    mail = coalesce(n.mail, new.mail), talle_mameluco = coalesce(n.talle_mameluco, new.talle_mameluco),
    talle_botas = coalesce(n.talle_botas, new.talle_botas), talle_campera = coalesce(n.talle_campera, new.talle_campera)
  where n.candidate_id = new.id
    and (n.dni is null and new.dni is not null or n.cuil is null and new.cuil is not null
      or n.fecha_nacimiento is null and new.fecha_nacimiento is not null or n.domicilio is null and new.domicilio is not null
      or n.localidad is null and new.localidad is not null or n.provincia is null and new.provincia is not null
      or n.telefono is null and new.telefono is not null or n.mail is null and new.mail is not null
      or n.talle_mameluco is null and new.talle_mameluco is not null or n.talle_botas is null and new.talle_botas is not null
      or n.talle_campera is null and new.talle_campera is not null);
  return null;
end $$;

-- silla -> ficha y nómina (fecha de ingreso)
create or replace function public.tg_positions_fecha_ingreso()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.candidate_id is not null and new.fecha_ingreso is not null
     and new.fecha_ingreso is distinct from old.fecha_ingreso then
    update public.candidates set fecha_ingreso = new.fecha_ingreso
     where id = new.candidate_id and fecha_ingreso is distinct from new.fecha_ingreso;
    update public.nomina set fecha_ingreso = new.fecha_ingreso
     where position_id = new.id and candidate_id = new.candidate_id and origen = 'app'
       and fecha_ingreso is distinct from new.fecha_ingreso;
  end if;
  return null;
end $$;

-- sector canónico también en altas y ediciones futuras
create or replace function public.tg_nomina_canon()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.sector := public.canon_sector(new.sector);
  return new;
end $$;
drop trigger if exists nomina_canon on public.nomina;
create trigger nomina_canon before insert or update of sector on public.nomina
  for each row execute function public.tg_nomina_canon();

-- 7) Archivar la tabla de legajos
drop trigger if exists hires_nomina on public.hires;
drop function if exists public.tg_hires_nomina();
alter table public.nomina drop column if exists hire_id;
alter table public.hires set schema respaldo;
alter table respaldo.hires rename to hires_archivo;
