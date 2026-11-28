-- Las funciones nuevas no se pueden llamar sin sesión; la del trigger, por nadie.
revoke all on function public.cv_en_mi_alcance(text) from public, anon;
revoke all on function public.en_mi_alcance(uuid) from public, anon;
revoke all on function public.es_entrevistador() from public, anon;
revoke all on function public.tg_evaluaciones_autor() from public, anon, authenticated;
grant execute on function public.cv_en_mi_alcance(text) to authenticated;
grant execute on function public.en_mi_alcance(uuid) to authenticated;
grant execute on function public.es_entrevistador() to authenticated;
