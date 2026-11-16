-- Dominios corporativos habilitados: @efis.com, @efis.com.ar, @tecpetrol.com, @tecpetrol.com.ar
create or replace function public.es_correo_corporativo(p_email text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(lower(trim(p_email)) ~ '^[^@\s]+@(tecpetrol|efis)\.com(\.ar)?$', false)
$$;

create or replace function public.lector_upsert(p_email text, p_nombre text, p_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.es_correo_corporativo(v_email) then
    raise exception 'Solo se permiten correos @efis.com, @efis.com.ar, @tecpetrol.com o @tecpetrol.com.ar';
  end if;
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

  insert into public.lectores (email, nombre) values (v_email, nullif(trim(p_nombre), ''))
  on conflict (email) do update set nombre = coalesce(excluded.nombre, public.lectores.nombre);
  return v_email;
end $$;
