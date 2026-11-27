-- Hora del turno del examen médico (para los avisos de turno por clínica)
alter table public.candidates add column if not exists turno_hora text;
comment on column public.candidates.turno_hora is 'Hora del turno del examen médico (HH:MM)';
