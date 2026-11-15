-- ============================================================================
-- Historial por silla: quién pasó por cada posición, como titular o en la
-- terna, desde cuándo y hasta cuándo. Solo RRHH (nunca la vista pública).
--
-- Se completa SOLO, con triggers:
--   - positions.candidate_id cambia  -> cierra al titular anterior, abre al nuevo
--   - position_candidates alta/baja  -> abre/cierra el tramo de terna
-- Carga inicial: titulares y ternas actuales + vínculos del respaldo del 13/11
-- que ya no están (gente que se cayó o se movió desde entonces).
-- ============================================================================

create table if not exists public.position_history (
  id           bigint generated always as identity primary key,
  position_id  uuid not null references public.positions(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  rol          text not null check (rol in ('titular', 'terna')),
  desde        timestamptz not null default now(),
  hasta        timestamptz,
  motivo       text,             -- reemplazado / baja / liberada / quitado de la terna / ingresó
  origen       text not null default 'app' check (origen in ('app', 'carga_inicial', 'respaldo')),
  created_by   uuid default auth.uid()
);
create index if not exists position_history_pos_idx on public.position_history(position_id);
create index if not exists position_history_cand_idx on public.position_history(candidate_id);
-- a lo sumo un tramo abierto por persona, silla y rol
create unique index if not exists position_history_abierto_uq
  on public.position_history(position_id, candidate_id, rol) where hasta is null;

alter table public.position_history enable row level security;
revoke all on public.position_history from anon, authenticated;
grant select on public.position_history to authenticated;
drop policy if exists historial_staff on public.position_history;
create policy historial_staff on public.position_history for select to authenticated
  using (public.is_staff());
-- (sin insert/update/delete para nadie: solo escriben los triggers)

-- motivo de salida según cómo quedó la persona
create or replace function public.motivo_salida(p_candidate uuid, p_default text)
returns text language sql stable security definer set search_path = '' as $$
  select case c.stage when 'cancelado' then 'baja' when 'ingresado' then 'ingresó' else p_default end
    from public.candidates c where c.id = p_candidate
$$;
revoke all on function public.motivo_salida(uuid, text) from public, anon;

create or replace function public.tg_positions_historial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.candidate_id is not distinct from new.candidate_id then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.candidate_id is not null then
    update public.position_history
       set hasta = now(),
           motivo = public.motivo_salida(old.candidate_id,
                      case when new.candidate_id is null then 'liberada' else 'reemplazado' end)
     where position_id = new.id and candidate_id = old.candidate_id and rol = 'titular' and hasta is null;
  end if;
  if new.candidate_id is not null then
    insert into public.position_history (position_id, candidate_id, rol)
    values (new.id, new.candidate_id, 'titular')
    on conflict do nothing;
  end if;
  return null;
end $$;

drop trigger if exists positions_historial on public.positions;
create trigger positions_historial after insert or update of candidate_id on public.positions
  for each row execute function public.tg_positions_historial();

create or replace function public.tg_terna_historial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.position_history (position_id, candidate_id, rol, desde)
    values (new.position_id, new.candidate_id, 'terna', coalesce(new.added_at, now()))
    on conflict do nothing;
    return null;
  end if;
  update public.position_history
     set hasta = now(), motivo = public.motivo_salida(old.candidate_id, 'quitado de la terna')
   where position_id = old.position_id and candidate_id = old.candidate_id and rol = 'terna' and hasta is null;
  return null;
end $$;

drop trigger if exists terna_historial on public.position_candidates;
create trigger terna_historial after insert or delete on public.position_candidates
  for each row execute function public.tg_terna_historial();

-- ---------------------------------------------------------------------------
-- Carga inicial (idempotente: solo si la tabla está vacía)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.position_history) then return; end if;

  -- titulares actuales
  insert into public.position_history (position_id, candidate_id, rol, desde, origen)
  select p.id, p.candidate_id, 'titular',
         coalesce(c.en_entrevista, c.cv_recibido, p.created_at::date)::timestamptz, 'carga_inicial'
    from public.positions p join public.candidates c on c.id = p.candidate_id;

  -- terna actual (incluye a los que se cayeron y siguen anotados en la silla)
  insert into public.position_history (position_id, candidate_id, rol, desde, hasta, motivo, origen)
  select t.position_id, t.candidate_id, 'terna',
         least(coalesce(c.cv_recibido::timestamptz, t.added_at), t.added_at),
         case when c.stage = 'cancelado' then c.updated_at end,
         case when c.stage = 'cancelado' then 'baja' end,
         'carga_inicial'
    from public.position_candidates t join public.candidates c on c.id = t.candidate_id;

  -- respaldo del 13/11: vínculos que ya no existen
  if to_regclass('respaldo.positions_20261113') is not null then
    insert into public.position_history (position_id, candidate_id, rol, desde, hasta, motivo, origen)
    select r.id, r.candidate_id, 'titular',
           coalesce(c.en_entrevista, c.cv_recibido, r.created_at::date)::timestamptz,
           greatest(c.updated_at, r.updated_at),
           case when c.stage = 'cancelado' then 'baja' else 'reemplazado' end,
           'respaldo'
      from respaldo.positions_20261113 r
      join public.positions p on p.id = r.id
      join public.candidates c on c.id = r.candidate_id
     where r.candidate_id is not null and p.candidate_id is distinct from r.candidate_id;
  end if;
  if to_regclass('respaldo.position_candidates_20261113') is not null then
    insert into public.position_history (position_id, candidate_id, rol, desde, hasta, motivo, origen)
    select r.position_id, r.candidate_id, 'terna',
           least(coalesce(c.cv_recibido::timestamptz, r.added_at), r.added_at),
           c.updated_at,
           case when c.stage = 'cancelado' then 'baja' else 'quitado de la terna' end,
           'respaldo'
      from respaldo.position_candidates_20261113 r
      join public.positions p on p.id = r.position_id
      join public.candidates c on c.id = r.candidate_id
     where not exists (select 1 from public.position_candidates t
                        where t.position_id = r.position_id and t.candidate_id = r.candidate_id);
  end if;
end $$;
