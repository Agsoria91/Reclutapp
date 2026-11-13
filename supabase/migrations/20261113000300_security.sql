-- ============================================================================
-- Reclutapp EFiS · seguridad
--
-- REGLA DURA: Basico, Telefono, Mail, DNI (y CVs, comentarios, observaciones,
-- legajos) NUNCA viajan a un navegador sin login de RRHH.
--
-- Se resuelve en tres capas, no en CSS:
--   1) Privilegios por COLUMNA: el rol anon solo tiene SELECT sobre las
--      columnas no sensibles. Pedir `basico` o `dni` con la clave pública da
--      "permission denied", aunque se consulte la tabla directamente.
--   2) Vistas *_public (security_invoker) con solo esas columnas, que es lo que
--      consume la vista pública de la app.
--   3) RLS: escritura y lectura completa solo para usuarios en public.staff con
--      email confirmado. Cualquier otro usuario logueado no ve nada.
-- ============================================================================

alter table public.stages        enable row level security;
alter table public.stage_aliases enable row level security;
alter table public.staff         enable row level security;
alter table public.positions     enable row level security;
alter table public.candidates    enable row level security;
alter table public.hires         enable row level security;

-- Supabase da por defecto ALL a anon/authenticated sobre tablas nuevas: se quita.
revoke all on public.stages, public.stage_aliases, public.staff,
              public.positions, public.candidates, public.hires from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catálogos: lectura para todos, escritura RRHH
-- ---------------------------------------------------------------------------
grant select on public.stages, public.stage_aliases to anon, authenticated;
grant insert, update, delete on public.stages, public.stage_aliases to authenticated;

create policy stages_read  on public.stages        for select to anon, authenticated using (true);
create policy stages_write on public.stages        for all    to authenticated using (public.is_staff()) with check (public.is_staff());
create policy alias_read   on public.stage_aliases for select to anon, authenticated using (true);
create policy alias_write  on public.stage_aliases for all    to authenticated using (public.is_staff()) with check (public.is_staff());

-- staff: cada miembro de RRHH puede ver la lista; se administra por SQL.
grant select on public.staff to authenticated;
create policy staff_read on public.staff for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Posiciones
-- ---------------------------------------------------------------------------
grant select (
  id, pos_sap, yacimiento, jefe_directo, sector, puesto, diagrama, turno, encuadre,
  tipo_cobertura, stage, candidate_id, candidato_nombre, procedencia, localidad,
  cand_activos, fecha_inicio, fecha_objetivo, categoria, puesto_convenio, fecha_ingreso,
  updated_at
) on public.positions to anon;
-- (sin basico, observaciones, revisar, id_sap, adicional, status_original, import_key)

grant select, insert, update, delete on public.positions to authenticated;

create policy positions_public_read on public.positions for select to anon using (true);
create policy positions_staff_all   on public.positions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Candidatos: el público solo ve lo necesario para KPIs agregados (sin nombre)
-- ---------------------------------------------------------------------------
grant select (
  id, area, stage, procedencia, servicio, posicion, cv_recibido, en_entrevista,
  entrevista_ok, ok_rrll, epo, aptitud_recibida, listo_ingreso, fecha_ingreso,
  cancelado, motivos_baja, created_origen, localidad, provincia
) on public.candidates to anon;
-- (sin nombre, telefono, mail, dni, cv_path, comentarios, aptitud, clinica)

grant select, insert, update, delete on public.candidates to authenticated;

create policy candidates_public_read on public.candidates for select to anon using (true);
create policy candidates_staff_all   on public.candidates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Legajos: exclusivamente RRHH
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.hires to authenticated;
create policy hires_staff_all on public.hires for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Vistas públicas (lo que lee la app sin login)
-- ---------------------------------------------------------------------------
create view public.positions_public with (security_invoker = true) as
select id, pos_sap, yacimiento, jefe_directo, sector, puesto, diagrama, turno, encuadre,
       tipo_cobertura, stage, (candidate_id is not null) as tiene_ficha, candidato_nombre,
       procedencia, localidad, cand_activos, fecha_inicio, fecha_objetivo, categoria,
       puesto_convenio, fecha_ingreso, updated_at
from public.positions;

create view public.candidates_public with (security_invoker = true) as
select id, area, stage, procedencia, servicio, posicion, cv_recibido, en_entrevista,
       entrevista_ok, ok_rrll, epo, aptitud_recibida, listo_ingreso, fecha_ingreso,
       cancelado, motivos_baja, created_origen, localidad, provincia
from public.candidates;

revoke all on public.positions_public, public.candidates_public from anon, authenticated;
grant select on public.positions_public, public.candidates_public to anon;

-- ---------------------------------------------------------------------------
-- Funciones: RPCs solo para usuarios logueados (y adentro validan is_staff)
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
-- authenticated: las funciones son security invoker (RLS aplica) o validan is_staff()
grant execute on all functions in schema public to authenticated;
grant execute on function public.norm_txt(text), public.stage_from_text(text), public.is_staff()
  to anon;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado para CVs, solo RRHH
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 10485760, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png'])
on conflict (id) do update set public = false;

create policy cvs_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and public.is_staff());
create policy cvs_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and public.is_staff());
create policy cvs_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and public.is_staff()) with check (bucket_id = 'cvs' and public.is_staff());
create policy cvs_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and public.is_staff());
