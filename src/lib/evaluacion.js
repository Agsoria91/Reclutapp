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

export const tieneEvaluacion = (ev) => !!ev && (puntaje(ev) != null || (ev.etiquetas || []).length > 0 || !!String(ev.comentario || '').trim());

// Arma la evaluación desde el formulario; conserva fecha y autor si no cambió nada.
export function armarEvaluacion(valores, previa, { hoy, uid }) {
  const ev = Object.fromEntries(CRITERIOS.map(([k]) => [k, nota(valores[k])]));
  ev.etiquetas = (valores.etiquetas || []).filter((t) => ETIQUETAS.includes(t));
  ev.comentario = String(valores.comentario || '').trim() || null;
  if (!tieneEvaluacion(ev)) return previa ? null : undefined; // undefined: no tocar
  const clave = (x) => JSON.stringify([...CRITERIOS.map(([k]) => nota(x?.[k])), [...(x?.etiquetas || [])].sort(), x?.comentario || null]);
  if (previa && clave(previa) === clave(ev)) return { ...ev, fecha: previa.fecha, por: previa.por };
  return { ...ev, fecha: hoy, por: uid || null };
}
