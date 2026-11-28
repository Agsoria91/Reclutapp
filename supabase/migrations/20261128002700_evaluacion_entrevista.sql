-- Evaluación de la entrevista (solo RRHH: candidates_public no la incluye).
-- { actitud, tecnico, experiencia, seguridad: 1..5 | null, etiquetas: text[], comentario, fecha, por }
alter table public.candidates add column if not exists evaluacion jsonb;
