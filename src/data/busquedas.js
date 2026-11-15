// Tabla de búsquedas: a qué tipo de silla corresponde cada "Posición" del CSV
// de Candidatos PP. Se usa para el historial ESTIMADO de una silla (gente que
// se cayó antes de que existiera el registro automático).
//
// Reglas (confirmadas por RRHH):
//   - Siempre dentro de la MISMA ÁREA (Almacén LT2E no se mezcla con Almacén FDP).
//   - Instrumentista, Electroinstrumentista y Eléctrico son tres búsquedas distintas.
//   - Mecánico genérico va a válvulas y general.
//   - Mecánicos de compresión y de válvulas son búsquedas distintas.
//   - Mecánico de flota va aparte (Serge).
// El orden importa: gana la primera regla que coincide (las específicas primero).
// `cand` se prueba contra la Posición del candidato; `silla` contra
// "puesto | sector" de la silla. Todo en minúsculas y sin acentos.
export const BUSQUEDAS = [
  { id: 'electroinstrumentista', label: 'Electroinstrumentista', cand: /electro ?instrument|electric\w* instrument/, silla: /electro ?instrument|electric\w* instrument/ },
  { id: 'instrumentista', label: 'Instrumentista', cand: /instrument/, silla: /instrument/ },
  { id: 'electrico', label: 'Eléctrico', cand: /electric/, silla: /^electric/ },
  { id: 'mec_compresion', label: 'Mecánico de compresión', cand: /compres/, silla: /compres/ },
  { id: 'mec_flota', label: 'Mecánico de flota', cand: /flota/, silla: /flota/ },
  { id: 'mec_valvulas', label: 'Mecánico (válvulas / general)', cand: /^mecanic[oa]s?( de valvulas?)?$|valvula/, silla: /valvula|mecanicos? general|mtto mecanico|electromecanico/ },
  { id: 'generacion', label: 'Generación', cand: /generacion/, silla: /generacion/ },
  { id: 'well_services', label: 'Well Services', cand: /well service/, silla: /^(relevo )?well service/ },
  { id: 'almacen', label: 'Almacén', cand: /almacen/, silla: /almacen/ },
  { id: 'tareas_generales', label: 'Tareas generales', cand: /tareas generales/, silla: /\bt\.? ?g\b|tareas generales/ },
  { id: 'operador_planta', label: 'Operador de planta', cand: /operador de planta/, silla: /\| plantas?$/ },
  { id: 'operador_campo', label: 'Operador de campo', cand: /operador de campo/, silla: /oper\.? ?campo|\| operaciones$/ },
  { id: 'cda_movil', label: 'CDA móvil', cand: /\bcda\b|\btlm\b|operador guia/, silla: /\| cda mov/ },
];

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function busquedaDeCandidato(c) {
  const t = norm(c.posicion);
  if (!t || /a definir/.test(t)) return null;
  return BUSQUEDAS.find((b) => b.cand.test(t)) || null;
}

export function busquedaDeSilla(p) {
  const t = `${norm(p.puesto)} | ${norm(p.sector)}`;
  return BUSQUEDAS.find((b) => b.silla.test(t)) || null;
}

export function mismaBusqueda(c, p) {
  if (norm(c.area) !== norm(p.yacimiento)) return false;
  const bs = busquedaDeSilla(p);
  return !!bs && busquedaDeCandidato(c)?.id === bs.id;
}
