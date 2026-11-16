-- ============================================================================
-- Corrección de datos (aplicada en producción el 16/11, pedido RRHH):
-- si hay un hito posterior (validación RRLL, EPO, aptitud o ingreso) y falta la
-- fecha de entrevista, la entrevista se hizo "por descarte": se completa con el
-- día anterior al primer hito posterior y se marca Entrevista OK.
-- Respaldo previo en respaldo.candidates_hitos_20261116. No cambia etapas.
-- Idempotente: solo toca filas que siguen vacías.
-- ============================================================================
do $$
declare n_cambios int;
begin
  create table if not exists respaldo.candidates_hitos_20261116 as
    select id, stage, en_entrevista, entrevista_ok, now() as guardado from public.candidates;

  update public.candidates c
     set en_entrevista = least(c.validacion_rrll, c.epo, c.aptitud_recibida,
                               case when c.stage = 'ingresado' then c.fecha_ingreso end) - 1
   where c.en_entrevista is null
     and coalesce(c.validacion_rrll, c.epo, c.aptitud_recibida, case when c.stage = 'ingresado' then c.fecha_ingreso end) is not null;

  update public.candidates c
     set entrevista_ok = true
   where not c.entrevista_ok
     and coalesce(c.validacion_rrll, c.epo, c.aptitud_recibida, case when c.stage = 'ingresado' then c.fecha_ingreso end) is not null;

  select count(*) into n_cambios
    from public.candidates c join respaldo.candidates_hitos_20261116 r on r.id = c.id
   where c.stage is distinct from r.stage;
  if n_cambios > 0 then raise exception 'Se iban a cambiar % etapas: se cancela todo', n_cambios; end if;
end $$;
