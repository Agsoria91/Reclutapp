// Cálculos puros (sin DOM) para Posiciones y Candidatos PP.
import { daysBetween, norm } from './format.js';

export const countBy = (rows, fn) => {
  const m = new Map();
  for (const r of rows) {
    const keys = [].concat(fn(r));
    for (const k of keys) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export const uniq = (rows, fn) =>
  [...new Set(rows.map(fn).filter((v) => v != null && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'es'));

// Filtros "que se suman": cada dimensión es un Set; vacío = Todas.
export function applyFilters(rows, filters, getters) {
  return rows.filter((r) =>
    Object.entries(filters).every(([k, set]) => !set || set.size === 0 || set.has(getters[k](r) ?? '—')));
}

// ---------------------------------------------------------------------------
// Posiciones
// ---------------------------------------------------------------------------
export const isCovered = (p) => p.stage === 'ingresado';
// La fecha objetivo se interpreta por mes/año: el día no importa.
export const monthKey = (iso) => (iso ? String(iso).slice(0, 7) : '');
export const isLate = (p, today) => !isCovered(p) && !!p.fecha_objetivo && monthKey(p.fecha_objetivo) < monthKey(today);
export const hasPerson = (p) => !!(p.candidato_nombre && p.candidato_nombre.trim());

export function positionKpis(rows, today) {
  const total = rows.length;
  const cubiertas = rows.filter(isCovered).length;
  const pendientes = rows.filter((p) => !isCovered(p));
  const sinCandidato = pendientes.filter((p) => !hasPerson(p)).length;
  const enProceso = pendientes.length - sinCandidato;
  const vencidas = pendientes.filter((p) => isLate(p, today)).length;
  return { total, cubiertas, pendientes: pendientes.length, sinCandidato, enProceso, vencidas };
}

// Posiciones que faltan cubrir agrupadas por MES objetivo (y área).
export function pendingByTarget(rows, today) {
  const groups = new Map();
  for (const p of rows) {
    if (isCovered(p)) continue;
    const k = monthKey(p.fecha_objetivo);
    if (!groups.has(k)) groups.set(k, { fecha: k, total: 0, sinCandidato: 0, enProceso: 0, porArea: new Map() });
    const g = groups.get(k);
    g.total++;
    if (hasPerson(p)) g.enProceso++; else g.sinCandidato++;
    g.porArea.set(p.yacimiento, (g.porArea.get(p.yacimiento) || 0) + 1);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, vencida: !!g.fecha && g.fecha < monthKey(today), porArea: [...g.porArea.entries()].sort() }))
    .sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999'));
}

// ---------------------------------------------------------------------------
// Candidatos PP
// ---------------------------------------------------------------------------
export const isActive = (c, stageMap) => !!stageMap[c.stage]?.es_activa;

// Mapea "Servicio" del CSV de candidatos al "Sector" del mapa de posiciones.
export function sectorMatches(servicio, sector) {
  const a = norm(servicio).replace(/s$/, '');
  const b = norm(sector).replace(/s$/, '');
  if (!a || !b) return false;
  return a === b || b.startsWith(a) || a.startsWith(b) || (a === 'tlm' && b.startsWith('cda'));
}

export function candidateKpis(cands, stageMap, positions, today) {
  const porEtapa = new Map();
  for (const c of cands) porEtapa.set(c.stage, (porEtapa.get(c.stage) || 0) + 1);
  const activos = cands.filter((c) => isActive(c, stageMap));
  const ingresados = cands.filter((c) => c.stage === 'ingresado');
  const cancelados = cands.filter((c) => c.stage === 'cancelado');

  const diasActivos = activos
    .map((c) => daysBetween(c.cv_recibido || c.created_origen, today))
    .filter((d) => d != null && d >= 0);
  const diasIngreso = ingresados
    .map((c) => daysBetween(c.cv_recibido || c.created_origen, c.fecha_ingreso))
    .filter((d) => d != null && d >= 0);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);

  const necesidad = positions.length;
  const cubiertas = positions.filter(isCovered).length;

  return {
    total: cands.length,
    activos: activos.length,
    ingresados: ingresados.length,
    cancelados: cancelados.length,
    porEtapa,
    diasPromedioActivos: avg(diasActivos),
    diasPromedioIngreso: avg(diasIngreso),
    necesidad,
    cubiertas,
    origen: countBy(cands, (c) => c.procedencia || 'Sin dato'),
    motivos: countBy(cancelados.filter((c) => c.motivos_baja?.length), (c) => c.motivos_baja),
    localidades: countBy(cands, (c) => c.localidad || 'Sin dato'),
    conversion: cands.length ? Math.round((ingresados.length / cands.length) * 100) : 0,
  };
}
