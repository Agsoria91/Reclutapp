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
// Rango de mes objetivo [desde, hasta] en 'AAAA-MM'. Con algún extremo
// elegido, las sillas sin fecha objetivo quedan afuera.
export function inMonthRange(p, desde, hasta) {
  if (!desde && !hasta) return true;
  const m = monthKey(p.fecha_objetivo);
  if (!m) return false;
  return (!desde || m >= desde) && (!hasta || m <= hasta);
}
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

// ---------------------------------------------------------------------------
// Entrevistas y efectividad. Un candidato "llegó" a un hito si tiene la fecha o
// el indicador cargado, o si su etapa actual (no cancelada) es igual o posterior.
// Así los cancelados cuentan hasta donde llegaron.
// ---------------------------------------------------------------------------
export const HITOS = [
  ['entrevista', 'Entrevistados', (c) => !!c.en_entrevista || !!c.entrevista_ok],
  ['entrevista_aprobada', 'Entrevista aprobada', (c) => !!c.entrevista_ok],
  ['examen_medico', 'Examen médico', (c) => !!c.epo],
  ['apto', 'Apto', (c) => !!c.aptitud_recibida],
  ['ingresado', 'Ingresaron', (c) => !!c.fecha_ingreso && c.stage === 'ingresado'],
];

export function reached(c, code, stageMap) {
  // Por descarte: si llegó a un hito posterior, pasó también por los anteriores
  // (p. ej. con EPO hecho, la entrevista se hizo y se aprobó aunque falte la fecha).
  const i = HITOS.findIndex((x) => x[0] === code);
  if (i >= 0 && HITOS.slice(i).some((h) => h[2](c))) return true;
  if (i >= 0 && i <= 1 && (c.validacion_rrll || c.ok_rrll)) return true;
  if (c.stage === 'cancelado' || !stageMap[c.stage] || !stageMap[code]) return false;
  return stageMap[c.stage].orden >= stageMap[code].orden;
}

export function interviewStats(rows, stageMap) {
  const n = (code) => rows.filter((c) => reached(c, code, stageMap)).length;
  const entrevistados = n('entrevista');
  const aprobados = n('entrevista_aprobada');
  const examen = n('examen_medico');
  const aptos = n('apto');
  const ingresados = n('ingresado');
  const bajasPost = rows.filter((c) => c.stage === 'cancelado' && reached(c, 'entrevista', stageMap)).length;
  const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : null);
  return {
    cvs: rows.length, entrevistados, aprobados, examen, aptos, ingresados, bajasPost,
    efectividad: pctOf(aprobados, entrevistados), // de cada 100 entrevistas, cuántas aprueban
    conversion: pctOf(ingresados, entrevistados), // de cada 100 entrevistas, cuántos ingresan
  };
}

// ---------------------------------------------------------------------------
// Avance del período: lo que hacía falta según el mes objetivo de las sillas
// vs. lo que ingresó hasta el cierre del último mes elegido. Una silla de
// octubre cubierta en noviembre cuenta como pendiente al corte de octubre.
// ---------------------------------------------------------------------------
const finDeMes = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };

export function avancePeriodo(positions, meses, { candidatos = [], today } = {}) {
  const sel = [...meses].filter(Boolean).sort();
  if (!sel.length) return null;
  const fin = finDeMes(sel[sel.length - 1]);
  const corte = today && today < fin ? today : fin;
  const candPorId = new Map(candidatos.map((c) => [c.id, c]));
  const fechaIngreso = (p) => p.fecha_ingreso || candPorId.get(p.candidate_id)?.fecha_ingreso || null;
  const set = new Set(sel);
  const req = positions.filter((p) => p.stage !== 'cancelado' && set.has(monthKey(p.fecha_objetivo)));
  const clasif = (p) => {
    if (!isCovered(p)) return 'pend';
    const f = fechaIngreso(p);
    if (!f) return 'ok_sf';
    return f <= corte ? 'ok' : 'despues';
  };
  const vacio = () => ({ req: 0, ok: 0, despues: 0, pend: 0, sinFecha: 0 });
  const sumar = (g, c) => { g.req++; if (c === 'ok' || c === 'ok_sf') g.ok++; if (c === 'ok_sf') g.sinFecha++; if (c === 'despues') g.despues++; if (c === 'pend') g.pend++; };
  const tot = vacio(); const porMes = new Map(); const porArea = new Map();
  for (const p of req) {
    const c = clasif(p);
    sumar(tot, c);
    const m = monthKey(p.fecha_objetivo); if (!porMes.has(m)) porMes.set(m, vacio()); sumar(porMes.get(m), c);
    const a = p.yacimiento || 'Sin área'; if (!porArea.has(a)) porArea.set(a, vacio()); sumar(porArea.get(a), c);
  }
  const avance = tot.req ? Math.round((tot.ok / tot.req) * 100) : 0;
  return {
    meses: sel, corte, ...tot, faltan: tot.req - tot.ok, avance,
    porMes: sel.map((m) => [m, porMes.get(m) || vacio()]),
    porArea: [...porArea.entries()].sort((a, b) => b[1].req - a[1].req),
  };
}

// Sillas que faltaba cubrir a una fecha de corte: mes objetivo hasta el mes
// del corte y sin ingreso efectivo a esa fecha (las cubiertas después cuentan
// como faltantes). Las cubiertas sin fecha de ingreso se toman como cubiertas.
export function faltantesAlCorte(positions, corte, { candidatos = [] } = {}) {
  const candPorId = new Map(candidatos.map((c) => [c.id, c]));
  const mesCorte = monthKey(corte);
  return positions.filter((p) => {
    if (p.stage === 'cancelado') return false;
    const m = monthKey(p.fecha_objetivo);
    if (!m || m > mesCorte) return false;
    if (!isCovered(p)) return true;
    const f = p.fecha_ingreso || candPorId.get(p.candidate_id)?.fecha_ingreso;
    return !!f && f > corte;
  });
}

// ---------------------------------------------------------------------------
// Días en la etapa actual. "CV recibido" no cuenta (el proceso todavía no se
// inició); desde la entrevista el reloj corre desde la última fecha del
// proceso cargada. Al llegar al plazo queda en aviso; al doble, en alerta.
// ---------------------------------------------------------------------------
export const PLAZOS_ETAPA = { entrevista: 7, entrevista_aprobada: 7, validacion_rrll: 10, propuesta: 7, examen_medico: 10, apto: 10 };

export function diasEnEtapa(c, today) {
  const plazo = PLAZOS_ETAPA[c?.stage];
  if (!plazo) return null;
  const fechas = [c.en_entrevista, c.validacion_rrll, c.epo, c.aptitud_recibida, c.interconsulta, c.interconsulta_cierre]
    .filter((f) => f && f <= today).sort();
  if (!fechas.length) return null;
  const desde = fechas[fechas.length - 1];
  const dias = daysBetween(desde, today);
  return { dias, desde, plazo, nivel: dias >= plazo * 2 ? 'alerta' : dias >= plazo ? 'aviso' : 'ok' };
}
export const estaDemorado = (c, today) => ['aviso', 'alerta'].includes(diasEnEtapa(c, today)?.nivel);
