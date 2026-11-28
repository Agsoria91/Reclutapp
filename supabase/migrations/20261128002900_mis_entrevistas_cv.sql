-- La lista del entrevistador devuelve la ruta del CV (id del candidato + fecha, sin datos personales)
-- para abrirlo; el permiso de lectura lo controla la política cvs_entrevistador_select.
drop function if exists public.mis_entrevistas();
create function public.mis_entrevistas()
 returns table (id uuid, nombre text, area text, servicio text, posicion text, stage text, cv_recibido date,
                en_entrevista date, localidad text, procedencia text, cv_path text, evaluacion jsonb)
 language sql stable security definer set search_path to ''
as $$
  select c.id, c.nombre, c.area, c.servicio, c.posicion, c.stage, c.cv_recibido, c.en_entrevista, c.localidad, c.procedencia,
         case when public.en_mi_alcance(c.id) then c.cv_path end, to_jsonb(ev) - 'evaluador' - 'candidate_id'
    from public.candidates c
    left join public.evaluaciones ev on ev.candidate_id = c.id and ev.evaluador = auth.uid()
   where public.es_entrevistador()
     and (ev.id is not null or (public.en_mi_alcance(c.id) and c.stage in ('cv_recibido', 'entrevista')))
$$;
revoke all on function public.mis_entrevistas() from public, anon;
grant execute on function public.mis_entrevistas() to authenticated;
revoke all on function public.mi_entrevistador() from public, anon;
grant execute on function public.mi_entrevistador() to authenticated;
