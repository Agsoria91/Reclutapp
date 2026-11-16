-- ============================================================================
-- Avisos por etapa (pedido RRHH 16/11):
--   - entrevista        -> coordinar entrevista virtual
--   - entrevista_ok     -> entrevista aprobada: coordinación de examen médico,
--                          pide apellido y nombre, DNI, fecha de nac., dirección,
--                          localidad y código postal
--   - proximo_ingreso   -> seleccionado: pide talles y los datos que falten
--   - baja              -> agradecimiento genérico
--   - novedad           -> mensaje libre para cualquier otro cambio de etapa
-- + campo código postal (candidatos y nómina comparten el formulario de datos).
-- Las plantillas solo se reemplazan si nadie las editó desde la app.
-- ============================================================================
alter table public.candidates add column if not exists codigo_postal text;
alter table public.nomina add column if not exists codigo_postal text;

insert into public.plantillas_aviso (tipo, titulo, asunto, cuerpo, orden) values
('entrevista', 'Coordinar entrevista virtual', 'Entrevista · EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

Recibimos tu postulación para {posicion} y queremos coordinar una entrevista virtual (videollamada, unos 30 minutos).

¿Nos indicás qué días y horarios tenés disponibles en los próximos días?

¡Gracias!
Recursos Humanos · EFiS', 1),
('entrevista_ok', 'Entrevista aprobada · examen médico', 'Examen médico preocupacional · EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

¡Buenas noticias! Aprobaste la entrevista para {posicion}. El próximo paso es el examen médico preocupacional y vamos a coordinar el turno.

Para gestionarlo, por favor respondé este mensaje con:
Apellido y nombre completo:
DNI:
Fecha de nac.:
Dirección:
Localidad:
Código Postal:

¡Gracias!
Recursos Humanos · EFiS', 2),
('proximo_ingreso', 'Seleccionado · próximo ingreso', 'Fuiste seleccionado/a · EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

¡Felicitaciones! Fuiste seleccionado/a para la próxima etapa de ingresos como {posicion}. En los próximos días nos vamos a poner en contacto para comentarte las novedades.

Para preparar tu ingreso, por favor respondé con:
{datos_faltantes}

¡Bienvenido/a!
Recursos Humanos · EFiS', 3),
('novedad', 'Novedad de la postulación', 'Tu postulación en EFiS',
'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.

Te contamos que tu postulación para {posicion} avanzó a la etapa: {etapa}. Ante cualquier novedad te volvemos a escribir.

¡Gracias!
Recursos Humanos · EFiS', 5)
on conflict (tipo) do update
  set titulo = excluded.titulo, asunto = excluded.asunto, cuerpo = excluded.cuerpo, orden = excluded.orden, updated_at = now()
  where public.plantillas_aviso.updated_by is null;   -- no pisar textos editados por RRHH

update public.plantillas_aviso set orden = 4 where tipo = 'baja';
