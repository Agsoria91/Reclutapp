-- ============================================================================
-- Dashboard PJ: estado de búsquedas (planilla "Status_Vacantes").
-- Solo se guardan las búsquedas de EFiS (las de Tecpetrol se descartan al
-- importar). Cada importación REEMPLAZA la foto anterior (es un snapshot).
-- Solo RRHH: trae nombres de personas, jefes y notas internas (Pendientes).
-- ============================================================================
create table if not exists public.vacantes_pj (
  s                       text primary key,          -- columna "S" (id de la búsqueda)
  empresa                 text not null default 'EFiS',
  posicion                text,
  descripcion             text,
  diagrama                text,
  persona                 text,                      -- "Vacante" si no hay nadie
  fecha_solicitud         date,                      -- Fecha Solicitud de línea
  fecha_potencial_ingreso date,
  proceso                 text,                      -- Búsqueda externa / Insourcing / Movimiento interno ...
  estado                  text,                      -- Cerrado / Oferta / Entrevistas / On hold ...
  jefe                    text,
  gerencia                text,
  agrupador               text,
  direccion               text,
  reclutador              text,
  pendientes              text,
  importado_at            timestamptz not null default now()
);

create table if not exists public.vacantes_pj_importaciones (
  id           bigint generated always as identity primary key,
  archivo      text,
  filas        int not null,
  nuevas       int not null default 0,
  actualizadas int not null default 0,
  quitadas     int not null default 0,
  importado_at timestamptz not null default now(),
  importado_by uuid default auth.uid()
);

alter table public.vacantes_pj enable row level security;
alter table public.vacantes_pj_importaciones enable row level security;
revoke all on public.vacantes_pj, public.vacantes_pj_importaciones from anon, authenticated;
grant select on public.vacantes_pj, public.vacantes_pj_importaciones to authenticated;
drop policy if exists vacantes_pj_staff on public.vacantes_pj;
create policy vacantes_pj_staff on public.vacantes_pj for select to authenticated using (public.is_staff());
drop policy if exists vacantes_pj_imp_staff on public.vacantes_pj_importaciones;
create policy vacantes_pj_imp_staff on public.vacantes_pj_importaciones for select to authenticated using (public.is_staff());

-- Reemplaza todo el contenido por las filas recibidas (todo o nada).
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
    gerencia text, agrupador text, direccion text, reclutador text, pendientes text)
  where coalesce(trim(s), '') <> '';

  select count(*) into v_total from _in;
  select count(*) into v_nuevas from _in i where not exists (select 1 from public.vacantes_pj v where v.s = i.s);
  select count(*) into v_quit from public.vacantes_pj v where not exists (select 1 from _in i where i.s = v.s);
  select count(*) into v_act from _in i join public.vacantes_pj v on v.s = i.s
   where (v.posicion, v.descripcion, v.diagrama, v.persona, v.fecha_solicitud, v.fecha_potencial_ingreso, v.proceso,
          v.estado, v.jefe, v.gerencia, v.agrupador, v.direccion, v.reclutador, v.pendientes)
         is distinct from
         (i.posicion, i.descripcion, i.diagrama, i.persona, i.fecha_solicitud, i.fecha_potencial_ingreso, i.proceso,
          i.estado, i.jefe, i.gerencia, i.agrupador, i.direccion, i.reclutador, i.pendientes);

  delete from public.vacantes_pj where true;  -- "where" explícito (pg_safeupdate)
  insert into public.vacantes_pj (s, empresa, posicion, descripcion, diagrama, persona, fecha_solicitud,
    fecha_potencial_ingreso, proceso, estado, jefe, gerencia, agrupador, direccion, reclutador, pendientes)
  select distinct on (s) s, coalesce(nullif(trim(empresa), ''), 'EFiS'), posicion, descripcion, diagrama, persona,
    fecha_solicitud, fecha_potencial_ingreso, proceso, estado, jefe, gerencia, agrupador, direccion, reclutador, pendientes
  from _in order by s;

  insert into public.vacantes_pj_importaciones (archivo, filas, nuevas, actualizadas, quitadas)
  values (p_archivo, v_total, v_nuevas, v_act, v_quit);

  return jsonb_build_object('filas', v_total, 'nuevas', v_nuevas, 'actualizadas', v_act, 'quitadas', v_quit);
end $$;
revoke all on function public.import_vacantes_pj(jsonb, text) from public, anon;
grant execute on function public.import_vacantes_pj(jsonb, text) to authenticated;
