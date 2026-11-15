-- ============================================================================
-- Avisos a candidatos (opción "semi-automática"): la app arma el mensaje y abre
-- WhatsApp / el correo de quien lo envía; RRHH lo revisa y lo manda. Acá solo
-- se guarda QUÉ plantilla se usó, por qué canal y cuándo. Todo solo RRHH.
-- ============================================================================

create table if not exists public.plantillas_aviso (
  tipo        text primary key,                 -- baja / entrevista_ok / ...
  titulo      text not null,
  asunto      text not null,                    -- asunto del mail
  cuerpo      text not null,                    -- admite {nombre} {nombre_completo} {posicion} {area}
  orden       int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create table if not exists public.avisos (
  id           bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  tipo         text not null,
  canal        text not null check (canal in ('whatsapp', 'mail', 'omitido')),
  enviado_at   timestamptz not null default now(),
  enviado_by   uuid default auth.uid()
);
create index if not exists avisos_cand_idx on public.avisos(candidate_id);

alter table public.plantillas_aviso enable row level security;
alter table public.avisos enable row level security;
revoke all on public.plantillas_aviso, public.avisos from anon, authenticated;
grant select, insert, update on public.plantillas_aviso to authenticated;
grant select, insert, delete on public.avisos to authenticated;
drop policy if exists plantillas_staff on public.plantillas_aviso;
create policy plantillas_staff on public.plantillas_aviso for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists avisos_staff on public.avisos;
create policy avisos_staff on public.avisos for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

insert into public.plantillas_aviso (tipo, titulo, asunto, cuerpo, orden) values
('baja', 'No continuamos', 'Tu postulación en EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

Queremos agradecerte por tu interés y por el tiempo que dedicaste al proceso de selección. En esta oportunidad no vamos a continuar con tu postulación.

Guardamos tus datos por si surge una nueva búsqueda acorde a tu perfil. Te deseamos mucho éxito.

Saludos,
Recursos Humanos · EFiS', 1),
('entrevista_ok', 'Entrevista aprobada', 'Próximos pasos de tu postulación en EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

¡Buenas noticias! Avanzás a la siguiente etapa del proceso para {posicion}. En los próximos días te vamos a llamar para coordinar los pasos que siguen.

Para ir adelantando, por favor respondé este mensaje con:
• DNI y CUIL
• Domicilio completo y localidad
• Fecha de nacimiento
• Talle de mameluco, botas y campera

¡Gracias!
Recursos Humanos · EFiS', 2)
on conflict (tipo) do nothing;
