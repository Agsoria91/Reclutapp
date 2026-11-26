-- La etapa elegida a mano manda: las fechas solo adelantan la etapa cuando se
-- cargan sin tocar la etapa. Antes, volver a una etapa anterior con fechas
-- posteriores cargadas (p. ej. fecha de ingreso) la subía de nuevo sola.
create or replace function public.tg_candidates_hitos()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  hitos_cambiaron boolean;
  sugerida text;
  hoy date := public.hoy_ar();
begin
  hitos_cambiaron := tg_op = 'INSERT' or
    (new.en_entrevista, new.entrevista_ok, new.validacion_rrll, new.ok_rrll, new.epo,
     new.aptitud_recibida, new.aptitud, new.listo_ingreso, new.fecha_ingreso)
    is distinct from
    (old.en_entrevista, old.entrevista_ok, old.validacion_rrll, old.ok_rrll, old.epo,
     old.aptitud_recibida, old.aptitud, old.listo_ingreso, old.fecha_ingreso);
  if (tg_op = 'INSERT' or new.stage is distinct from old.stage)
     and coalesce(current_setting('reclutapp.importando', true), '') <> '1' then
    if new.stage = 'cancelado' then
      new.cancelado := true;
    else
      new.cancelado := false;
      if new.stage in ('entrevista','entrevista_aprobada','validacion_rrll','propuesta','examen_medico','apto','proximo_ingreso','ingresado') then
        new.en_entrevista := coalesce(new.en_entrevista, new.cv_recibido, hoy);
      end if;
      if new.stage in ('entrevista_aprobada','validacion_rrll','propuesta','examen_medico','apto','proximo_ingreso','ingresado') then
        new.entrevista_ok := true;
      end if;
      if new.stage = 'validacion_rrll' then new.validacion_rrll := coalesce(new.validacion_rrll, hoy); end if;
      if new.stage = 'examen_medico' then new.epo := coalesce(new.epo, hoy); end if;
      if new.stage = 'apto' then new.aptitud_recibida := coalesce(new.aptitud_recibida, hoy); end if;
      if new.stage in ('proximo_ingreso','ingresado') then new.listo_ingreso := true; end if;
      if new.stage = 'ingresado' then new.fecha_ingreso := coalesce(new.fecha_ingreso, hoy); end if;
    end if;
  end if;
  -- adelantar por fechas solo si la etapa no se cambió a mano en esta misma edición
  if hitos_cambiaron and new.stage <> 'cancelado' and not coalesce(new.cancelado, false)
     and (tg_op = 'INSERT' or new.stage is not distinct from old.stage) then
    sugerida := public.stage_por_hitos(new);
    if (select orden from public.stages where code = sugerida)
       > (select orden from public.stages where code = new.stage) then
      new.stage := sugerida;
      if sugerida in ('entrevista_aprobada','validacion_rrll','examen_medico','apto','proximo_ingreso','ingresado') then
        new.entrevista_ok := true;
      end if;
      if sugerida in ('proximo_ingreso','ingresado') then new.listo_ingreso := true; end if;
    end if;
  end if;
  return new;
end $function$;
