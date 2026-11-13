-- ============================================================================
-- Reclutapp EFiS · esquema base
--   stages / stage_aliases : UNA sola tabla de etapas canónicas + alias de
--                            ambos CSV (Seguimiento de ingresos y Candidatos PP)
--   positions              : mapa de posiciones ("el taco", una fila = una silla)
--   candidates             : pipeline Candidatos PP
--   hires                  : legajos de ingresados (solo RRHH)
--   staff                  : allowlist de usuarios de RRHH con permiso de edición
-- ============================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Etapas canónicas
-- ---------------------------------------------------------------------------
create table public.stages (
  code        text primary key,
  label       text not null,
  orden       int  not null unique,
  color       text not null,          -- token de color (ver src/styles/tokens.css)
  es_activa   boolean not null default true,  -- cuenta como "en proceso"
  descripcion text
);

insert into public.stages (code, label, orden, color, es_activa, descripcion) values
  ('sin_candidato',       'Sin candidato',        0,  'neutral', false, 'Silla sin persona asignada'),
  ('cv_recibido',         'CV Recibido',          10, 'sky',     true,  'Postulado, sin entrevistar'),
  ('entrevista',          'Entrevista',           20, 'blue',    true,  'En proceso de entrevista'),
  ('entrevista_aprobada', 'Entrevista Aprobada',  30, 'navy',    true,  'Entrevista OK'),
  ('validacion_rrll',     'Validación RRLL',      40, 'plum',    true,  'En validación de Relaciones Laborales'),
  ('propuesta',           'Propuesta / Oferta',   50, 'violet',  true,  'Propuesta enviada'),
  ('examen_medico',       'Examen Médico',        60, 'orange',  true,  'Examen preocupacional (EPO) en curso'),
  ('apto',                'Apto',                 70, 'yellow',  true,  'Aptitud médica recibida'),
  ('proximo_ingreso',     'Próximo ingreso',      80, 'lime',    true,  'Listo para ingresar, con fecha a confirmar'),
  ('ingresado',           'Ingresado',            90, 'green',   false, 'Ingresó a la compañía'),
  ('cancelado',           'Cancelado',            99, 'red',     false, 'Baja del proceso');

-- Alias: cualquier texto de Status de cualquiera de los dos CSV -> etapa canónica.
-- La clave se guarda normalizada (minúsculas, sin acentos, espacios simples).
create table public.stage_aliases (
  alias      text primary key,
  stage_code text not null references public.stages(code) on update cascade,
  origen     text not null default 'ambos' check (origen in ('posiciones','candidatos','ambos'))
);

create or replace function public.norm_txt(t text)
returns text language sql immutable parallel safe
set search_path = ''
as $$ select nullif(regexp_replace(lower(extensions.unaccent(coalesce(t,''))), '\s+', ' ', 'g'), '') $$;

insert into public.stage_aliases (alias, stage_code, origen) values
  -- vocabulario de Candidatos PP
  ('cv recibido',               'cv_recibido',         'candidatos'),
  ('en proceso de entrevista',  'entrevista',          'candidatos'),
  ('entrevista aprobada',       'entrevista_aprobada', 'ambos'),
  ('en validacion de rrll',     'validacion_rrll',     'candidatos'),
  ('en examen medico',          'examen_medico',       'candidatos'),
  ('examen medico',             'examen_medico',       'candidatos'),
  ('aptitud recibida',          'apto',                'candidatos'),
  ('apto',                      'apto',                'ambos'),
  ('listo para ingreso',        'proximo_ingreso',     'candidatos'),
  ('ingresado',                 'ingresado',           'ambos'),
  ('cancelado',                 'cancelado',           'ambos'),
  -- vocabulario de Seguimiento de ingresos (posiciones)
  ('sin candidato',             'sin_candidato',       'posiciones'),
  ('entrevista',                'entrevista',          'posiciones'),
  ('validacion rrll',           'validacion_rrll',     'posiciones'),
  ('propuesta / oferta',        'propuesta',           'posiciones'),
  ('propuesta',                 'propuesta',           'posiciones'),
  ('examen preocupacional',     'examen_medico',       'posiciones'),
  ('apto (aptitud recibida)',   'apto',                'posiciones'),
  ('proximo ingreso',           'proximo_ingreso',     'posiciones');

create or replace function public.stage_from_text(t text)
returns text language sql stable
set search_path = ''
as $$ select a.stage_code from public.stage_aliases a where a.alias = public.norm_txt(t) $$;

-- ---------------------------------------------------------------------------
-- Allowlist de RRHH (quién puede editar / ver datos sensibles)
-- ---------------------------------------------------------------------------
create table public.staff (
  email      text primary key check (email = lower(email)),
  nombre     text,
  created_at timestamptz not null default now()
);

-- true solo si el usuario logueado tiene email confirmado y está en staff.
create or replace function public.is_staff()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.staff s on s.email = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  )
$$;

-- ---------------------------------------------------------------------------
-- Posiciones ("el taco")
-- ---------------------------------------------------------------------------
create table public.positions (
  id               uuid primary key default gen_random_uuid(),
  import_key       text unique,               -- clave natural para re-importar el CSV
  pos_sap          text,
  yacimiento       text not null,             -- área: LT2E, CDA, FDP, LBAS, ASAL, TLM
  jefe_directo     text,
  sector           text,
  puesto           text not null,
  diagrama         text,
  turno            text,
  encuadre         text,
  tipo_cobertura   text,                      -- Búsqueda externa / Movimiento interno
  stage            text not null default 'sin_candidato' references public.stages(code),
  status_original  text,
  candidate_id     uuid,                      -- FK agregada más abajo
  candidato_nombre text,
  procedencia      text,
  localidad        text,
  cand_activos     int,
  fecha_inicio     date,
  fecha_objetivo   date,
  categoria        text,
  puesto_convenio  text,
  basico           numeric(14,2),             -- SENSIBLE
  id_sap           text,
  fecha_ingreso    date,
  adicional        text,
  observaciones    text,                      -- interno RRHH
  revisar          text,                      -- interno RRHH
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Candidatos PP
-- ---------------------------------------------------------------------------
create table public.candidates (
  id                 uuid primary key default gen_random_uuid(),
  import_key         text unique,
  area               text,
  stage              text not null default 'cv_recibido' references public.stages(code),
  status_original    text,
  nombre             text not null,
  procedencia        text,
  servicio           text,
  posicion           text,
  cv_recibido        date,
  en_entrevista      date,
  entrevista_ok      boolean not null default false,
  validacion_rrll    date,
  ok_rrll            boolean not null default false,
  epo                date,
  clinica            text,
  aptitud_recibida   date,
  aptitud            text,
  listo_ingreso      boolean not null default false,
  fecha_ingreso      date,
  cancelado          boolean not null default false,
  motivos_baja       text[] not null default '{}',
  comentarios        text,                    -- interno RRHH
  created_origen     timestamptz,
  localidad          text,
  provincia          text,
  telefono           text,                    -- SENSIBLE
  mail               text,                    -- SENSIBLE
  dni                text,                    -- SENSIBLE
  cv_path            text,                    -- ruta en Storage (bucket privado "cvs")
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid default auth.uid()
);

alter table public.positions
  add constraint positions_candidate_fk
  foreign key (candidate_id) references public.candidates(id) on delete set null;

-- El vínculo candidato <-> silla vive SOLO en positions.candidate_id.
-- Una persona ocupa a lo sumo una silla, y una silla tiene a lo sumo una persona.
create unique index positions_candidate_uq on public.positions(candidate_id) where candidate_id is not null;
create index positions_area_idx on public.positions(yacimiento, sector);
create index candidates_area_idx on public.candidates(area, stage);

-- ---------------------------------------------------------------------------
-- Legajos de ingresados
-- ---------------------------------------------------------------------------
create table public.hires (
  id               uuid primary key default gen_random_uuid(),
  candidate_id     uuid references public.candidates(id) on delete set null,
  position_id      uuid references public.positions(id) on delete set null,
  nombre           text not null,
  dni              text,
  fecha_ingreso    date,
  area             text,
  sector           text,
  puesto           text,
  puesto_convenio  text,
  categoria        text,
  jefe_directo     text,
  basico           numeric(14,2),
  localidad        text,
  telefono         text,
  mail             text,
  procedencia      text,
  tipo_cobertura   text,
  estado           text not null default 'activo' check (estado in ('activo','baja')),
  fecha_baja       date,
  motivo_baja      text,
  notas            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);
create unique index hires_position_uq on public.hires(position_id) where position_id is not null;
create unique index hires_candidate_uq on public.hires(candidate_id) where candidate_id is not null;
