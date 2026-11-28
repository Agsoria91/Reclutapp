-- Correo del autor de cada evaluación (para el Centro de control de RRHH)
alter table public.evaluaciones add column if not exists evaluador_email text;
update public.evaluaciones ev set evaluador_email = lower(u.email) from auth.users u where u.id = ev.evaluador and ev.evaluador_email is null;
create or replace function public.tg_evaluaciones_email()
 returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then select lower(email) into new.evaluador_email from auth.users where id = new.evaluador;
  else new.evaluador_email := old.evaluador_email; end if;
  return new;
end $$;
revoke all on function public.tg_evaluaciones_email() from public, anon, authenticated;
drop trigger if exists evaluaciones_email on public.evaluaciones;
create trigger evaluaciones_email before insert or update on public.evaluaciones
  for each row execute function public.tg_evaluaciones_email();
