-- Revisión de seguridad (chequeos de Supabase, 26/11/2026)
-- 1) sap_posiciones: el acceso pasa solo por RLS (RRHH); se quitan permisos que la saltean
revoke truncate, references, trigger on public.sap_posiciones from anon, authenticated;
-- 2) funciones de trigger y auxiliares: no se llaman desde la app, solo desde los triggers
revoke execute on function public.tg_positions_historial() from public, anon, authenticated;
revoke execute on function public.tg_terna_historial() from public, anon, authenticated;
revoke execute on function public.motivo_salida(uuid, text) from public, anon, authenticated;
-- Las vistas positions_public / candidates_public son SECURITY DEFINER a propósito:
-- filtran con puede_leer() y no exponen DNI, teléfono, mail ni básico.

-- 3) "Última modificación por": nombre de quien editó (solo RRHH)
create or replace function public.nombre_de_usuario(p_uid uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case when public.is_staff() then
    (select coalesce(nullif(trim(s.nombre), ''), split_part(u.email, '@', 1))
       from auth.users u left join public.staff s on lower(s.email) = lower(u.email)
      where u.id = p_uid)
  end
$function$;
revoke all on function public.nombre_de_usuario(uuid) from public, anon;
grant execute on function public.nombre_de_usuario(uuid) to authenticated;
