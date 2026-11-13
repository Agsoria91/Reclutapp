-- is_staff() solo informa si el usuario logueado es de RRHH; el rol anónimo no lo necesita.
-- (Para authenticated se mantiene: la app lo consulta para habilitar la vista de edición.)
revoke execute on function public.is_staff() from anon;
