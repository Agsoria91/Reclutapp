-- ============================================================================
-- Gestión de usuarios RRHH desde la app (sin entrar a Supabase).
-- Solo un usuario que ya es RRHH puede dar de alta, restablecer la contraseña
-- o quitar el acceso a otro. Las cuentas se crean confirmadas y con una
-- contraseña temporal que la persona cambia al entrar.
-- ============================================================================
create extension if not exists pgcrypto with schema extensions;

create or replace function public.staff_upsert_user(p_email text, p_nombre text, p_password text)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email inválido'; end if;
  if length(coalesce(p_password, '')) < 10 then raise exception 'La contraseña temporal debe tener al menos 10 caracteres'; end if;

  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', p_nombre), now(), now(),
      '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now());
  else
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_id;
  end if;

  insert into public.staff (email, nombre) values (v_email, nullif(trim(p_nombre), ''))
  on conflict (email) do update set nombre = coalesce(excluded.nombre, public.staff.nombre);
  return v_email;
end $$;

create or replace function public.staff_remove(p_email text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_email = (select lower(email) from auth.users where id = auth.uid()) then
    raise exception 'No podés quitarte el acceso a vos mismo';
  end if;
  delete from public.staff where email = v_email;
end $$;

revoke execute on function public.staff_upsert_user(text, text, text), public.staff_remove(text) from public, anon;
grant execute on function public.staff_upsert_user(text, text, text), public.staff_remove(text) to authenticated;
