// Evaluación de entrevista: habilidades generales (1 a 5), etiquetas y comentario.
export const CRITERIOS = [
  ['actitud', 'Actitud y predisposición'],
  ['tecnico', 'Conocimiento técnico'],
  ['experiencia', 'Experiencia en oil & gas'],
  ['seguridad', 'Seguridad y trabajo en equipo'],
];
export const ETIQUETAS = [
  'Buena actitud', 'Muy predispuesto', 'Joven sin experiencia', 'Disponible para diagramas de campo',
  'Potencial para otro puesto', 'Requiere capacitación',
];
export const NIVELES = [[80, 'Destacado', 'ok'], [60, 'Adecuado', 'medio'], [0, 'A desarrollar', 'bajo']];

const nota = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };

// Puntaje sobre lo calificado: promedio de 1..5 llevado a 0..100 %.
export function puntaje(ev) {
  if (!ev) return null;
  const notas = CRITERIOS.map(([k]) => nota(ev[k])).filter((n) => n != null);
  if (!notas.length) return null;
  const pct = Math.round((notas.reduce((s, n) => s + n, 0) / (notas.length * 5)) * 100);
  const [, nivel, tono] = NIVELES.find(([min]) => pct >= min);
  return { pct, nivel, tono, calificados: notas.length, total: CRITERIOS.length };
}

export const tieneEvaluacion = (ev) => !!ev && (puntaje(ev) != null || (ev.etiquetas || []).length > 0 || !!String(ev.comentario || '').trim() || !!ev.categoria_sugerida || !!ev.decision);

// Arma la fila de evaluación desde el formulario. undefined = no hay nada que guardar;
// null = se borró todo (eliminar la previa). La fecha solo cambia si cambió el contenido.
export function armarEvaluacion(valores, previa, { hoy }) {
  const ev = Object.fromEntries(CRITERIOS.map(([k]) => [k, nota(valores[k])]));
  ev.etiquetas = (valores.etiquetas || []).filter((t) => ETIQUETAS.includes(t));
  ev.comentario = String(valores.comentario || '').trim() || null;
  ev.categoria_sugerida = CATEGORIAS.includes(valores.categoria_sugerida) ? valores.categoria_sugerida : null;
  if ('decision' in valores) { ev.decision = ['aprobado', 'rechazado'].includes(valores.decision) ? valores.decision : null; ev.motivo = ev.decision === 'rechazado' ? valores.motivo || null : null; }
  if (!tieneEvaluacion(ev)) return previa ? null : undefined;
  const clave = (x) => JSON.stringify([...CRITERIOS.map(([k]) => nota(x?.[k])), [...(x?.etiquetas || [])].sort(), x?.comentario || null, x?.categoria_sugerida || null,
    'decision' in ev ? [x?.decision || null, x?.motivo || null] : null]);
  if (previa && clave(previa) === clave(ev)) return { ...ev, fecha: previa.fecha, sinCambios: true };
  return { ...ev, fecha: hoy };
}

// Varias evaluaciones de un mismo candidato: promedio de sus puntajes.
export function puntajeGrupo(evals = []) {
  const ps = evals.map(puntaje).filter(Boolean);
  if (!ps.length) return null;
  const pct = Math.round(ps.reduce((s, p) => s + p.pct, 0) / ps.length);
  const [, nivel, tono] = NIVELES.find(([min]) => pct >= min);
  return { pct, nivel, tono, calificados: ps.length, total: ps.length, varias: ps.length > 1 };
}

// Categoría sugerida por el entrevistador (convenio de petroleros)
export const CATEGORIAS = ['Ingresante sin experiencia', 'Ayudante', 'Medio oficial', 'Oficial', 'Especializado'];
// Especialidades dentro de un sector (hoy: Mantenimiento)
export const SUBSECTORES = ['Mecánico', 'Eléctrico', 'Generación', 'Instrumentación'];

// Evaluación completa: las 4 habilidades, categoría sugerida y comentario
export function completa(ev) {
  return !!ev && CRITERIOS.every(([k]) => nota(ev[k]) != null) && !!ev.categoria_sugerida && !!String(ev.comentario || '').trim();
}

// ¿El candidato entra en el alcance de un entrevistador? (misma regla que la base)
const nx = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function enAlcance(c, e) {
  const en = (lista, v) => (lista || []).some((x) => nx(x) === nx(v));
  return en(e.sectores, c.servicio)
    && (!(e.subsectores || []).length || en(e.subsectores, c.subsector))
    && (!(e.yacimientos || []).length || en(e.yacimientos, c.area))
    && (!(e.puestos || []).length || en(e.puestos, c.posicion));
}
