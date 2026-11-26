-- Maestro de posiciones ocupadas descargado de SAP (Nº de posición por persona).
-- Sirve para completar la POS de la nómina y para alertar si una silla repite
-- una POS SAP que ya está ocupada. Solo RRHH puede leerlo o modificarlo.
create table if not exists public.sap_posiciones (
  pos        text primary key,
  dni        text,
  nombre     text,
  puesto     text,
  jefe       text,
  ceco       text,
  encuadre   text,
  gerencia   text,
  periodo    text,
  id_local   text,
  cargado_at timestamptz not null default now()
);
create index if not exists sap_posiciones_dni on public.sap_posiciones (dni);
alter table public.sap_posiciones enable row level security;
drop policy if exists sap_posiciones_staff on public.sap_posiciones;
create policy sap_posiciones_staff on public.sap_posiciones for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.sap_posiciones from anon;

-- CECO de la silla (centro de costo de SAP)
alter table public.positions add column if not exists ceco text;
