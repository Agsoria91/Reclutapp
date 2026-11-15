// Historial de una silla: todas las personas que pasaron por ella (titular o
// terna), hasta qué instancia llegaron, cuánto tardó cada tramo y por qué se
// cayeron. SOLO RRHH: usa state.historial y fichas completas de candidatos,
// que nunca se cargan en la vista pública.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { norm, todayISO, fmtDate, fmtMonth, daysBetween } from '../lib/format.js';
import { sectorMatches } from '../lib/kpis.js';
import { stagePill } from './ui.js';

// Hitos con fecha en la ficha del candidato -> etapa (para el color del tramo)
const HITOS = [
  ['cv_recibido', 'CV recibido', 'cv_recibido'],
  ['en_entrevista', 'Entrevista', 'entrevista'],
  ['validacion_rrll', 'Validación RRLL', 'validacion_rrll'],
  ['epo', 'Examen médico', 'examen_medico'],
  ['aptitud_recibida', 'Apto', 'apto'],
  ['fecha_ingreso', 'Ingreso', 'ingresado'],
];
const iso = (v) => (v ? String(v).slice(0, 10) : null);
const colorOf = (stage) => state.stageMap[stage]?.color || 'neutral';

// Coincidencia "misma búsqueda" para el historial estimado (antes de que
// existiera el registro automático): misma área, sector compatible y el
// nombre de la búsqueda contenido en el puesto de la silla.
function mismaBusqueda(c, p) {
  if (norm(c.area) !== norm(p.yacimiento)) return false;
  if (!sectorMatches(c.servicio, p.sector)) return false;
  const raiz = (w) => w.replace(/(os|as|es|o|a|s)$/, '');
  const palabras = (t) => norm(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['del', 'de', 'los', 'las'].includes(w)).map(raiz);
  const buscadas = palabras(c.posicion);
  if (!buscadas.length) return false;
  const delPuesto = palabras(p.puesto);
  return buscadas.every((w) => delPuesto.some((x) => x.startsWith(w) || w.startsWith(x) && x.length > 3));
}

function trayecto(c, tramo) {
  const hoy = todayISO();
  const hitos = HITOS.map(([k, label, stage]) => ({ k, label, stage, fecha: iso(c[k]) }))
    .filter((h) => h.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cayo = c.stage === 'cancelado';
  const ingreso = c.stage === 'ingresado';
  const inicio = hitos[0]?.fecha || iso(tramo?.desde) || iso(c.created_at);
  let fin = ingreso ? (iso(c.fecha_ingreso) || hitos.at(-1)?.fecha) : cayo ? (iso(tramo?.hasta) || iso(c.updated_at)) : hoy;
  if (fin && inicio && fin < inicio) fin = inicio;
  const ultimo = hitos.at(-1);
  return {
    c, hitos, inicio, fin, cayo, ingreso, enCurso: !cayo && !ingreso,
    dias: inicio && fin ? daysBetween(inicio, fin) : null,
    llego: ultimo ? ultimo.label : 'CV',
    finAprox: cayo && !tramo?.hasta,
  };
}

export function historialDe(p) {
  const tramos = (state.historial || []).filter((h) => h.position_id === p.id);
  const cById = new Map(state.candidates.map((c) => [c.id, c]));
  const porPersona = new Map();
  for (const t of tramos) {
    const c = cById.get(t.candidate_id);
    if (!c) continue;
    const prev = porPersona.get(c.id);
    const desde = !prev || t.desde < prev.desde ? t.desde : prev.desde;
    const abierto = !t.hasta || prev?.abierto;
    const hasta = abierto ? null : [t.hasta, prev?.hasta].filter(Boolean).sort().at(-1);
    porPersona.set(c.id, {
      c, desde, hasta, abierto,
      titular: (prev?.titular || false) || t.rol === 'titular',
      motivo: t.hasta && (!prev?.hasta || t.hasta >= prev.hasta) ? t.motivo : prev?.motivo,
      origen: prev?.origen === 'app' || t.origen === 'app' ? 'app' : t.origen,
    });
  }
  const reales = [...porPersona.values()].map((t) => ({
    ...trayecto(t.c, t), rol: t.c.id === p.candidate_id ? 'titular actual' : t.titular ? 'fue titular' : 'terna',
    motivoSalida: t.motivo, actual: t.c.id === p.candidate_id,
  }));
  const vistos = new Set(porPersona.keys());
  const estimados = state.candidates
    .filter((c) => c.stage === 'cancelado' && !vistos.has(c.id) && !c._silla && mismaBusqueda(c, p))
    .map((c) => ({ ...trayecto(c, null), rol: 'misma búsqueda', estimado: true }));
  const orden = (a, b) => (b.actual - a.actual) || (a.inicio || '').localeCompare(b.inicio || '');
  return { reales: reales.sort(orden), estimados: estimados.sort(orden) };
}

function resumen(filas) {
  const cerradas = filas.filter((f) => !f.enCurso && f.dias != null);
  const cayeron = filas.filter((f) => f.cayo);
  const dondeCayeron = new Map();
  for (const f of cayeron) dondeCayeron.set(f.llego, (dondeCayeron.get(f.llego) || 0) + 1);
  const top = [...dondeCayeron.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total: filas.length,
    ingresaron: filas.filter((f) => f.ingreso).length,
    cayeron: cayeron.length,
    enCurso: filas.filter((f) => f.enCurso).length,
    promedio: cerradas.length ? Math.round(cerradas.reduce((s, f) => s + f.dias, 0) / cerradas.length) : null,
    top,
  };
}

function eje(desde, hasta) {
  const marcas = [];
  const d = new Date(desde.slice(0, 7) + '-01T12:00:00');
  const fin = new Date(hasta + 'T12:00:00');
  while (d <= fin) { marcas.push(d.toISOString().slice(0, 10)); d.setMonth(d.getMonth() + 1); }
  return marcas.filter((m) => m >= desde);
}

function fila(f, x0, span) {
  const pos = (fecha) => ((daysBetween(x0, fecha) / span) * 100).toFixed(2);
  const segs = [];
  f.hitos.forEach((h, i) => {
    if (h.fecha > f.fin) return;
    const hastaSeg = f.hitos[i + 1] && f.hitos[i + 1].fecha <= f.fin ? f.hitos[i + 1].fecha : f.fin;
    segs.push({ ...h, a: pos(h.fecha), w: Math.max(0.4, pos(hastaSeg) - pos(h.fecha)), dias: daysBetween(h.fecha, hastaSeg) });
  });
  if (!segs.length && f.inicio) segs.push({ label: 'En proceso', stage: f.c.stage, a: pos(f.inicio), w: Math.max(0.4, pos(f.fin) - pos(f.inicio)), dias: f.dias, fecha: f.inicio });
  const fin = f.ingreso ? '✓' : f.cayo ? '✕' : '▸';
  const motivos = (f.c.motivos_baja || []).filter(Boolean).join(', ') || (f.cayo ? f.motivoSalida : '');
  return html`<li class="tl-row ${f.cayo ? 'is-out' : ''} ${f.ingreso ? 'is-in' : ''} ${f.estimado ? 'is-est' : ''}">
    <div class="tl-who">
      <strong>${f.c.nombre}</strong>
      <span class="tl-meta">${f.rol}${f.c.procedencia ? ' · ' + f.c.procedencia : ''}</span>
      <span class="tl-out">${f.ingreso ? `Ingresó el ${fmtDate(f.c.fecha_ingreso)}`
        : f.cayo ? `Se cayó en ${f.llego}${motivos ? ' — ' + motivos : ''}`
        : html`Hoy: ${stagePill(f.c.stage, { small: true })}`}</span>
    </div>
    <div class="tl-track" role="img" aria-label="${f.c.nombre}: ${f.hitos.map((h) => `${h.label} ${fmtDate(h.fecha)}`).join(', ')}">
      ${segs.map((s) => html`<span class="tl-seg tl-seg--${colorOf(s.stage)}" style="left:${s.a}%;width:${s.w}%" title="${s.label}: ${fmtDate(s.fecha)} · ${s.dias} días"></span>`)}
      ${f.hitos.filter((h) => h.fecha <= f.fin).map((h) => html`<i class="tl-dot" style="left:${pos(h.fecha)}%" title="${h.label}: ${fmtDate(h.fecha)}"></i>`)}
      ${f.fin ? html`<b class="tl-end ${f.cayo ? 'tl-end--out' : f.ingreso ? 'tl-end--in' : ''}" style="left:${pos(f.fin)}%" title="${f.cayo ? 'Baja' + (f.finAprox ? ' (fecha aproximada)' : '') : f.ingreso ? 'Ingreso' : 'Hoy'}">${fin}</b>` : ''}
    </div>
    <div class="tl-days"><b>${f.dias ?? '—'}</b><small>${f.finAprox ? '~días' : 'días'}</small></div>
  </li>`;
}

// Línea de tiempo completa (se usa en el panel de la silla y en pantalla completa)
export function historialSilla(p, { conEstimados = false, compacto = false } = {}) {
  const { reales, estimados } = historialDe(p);
  const filas = conEstimados ? [...reales, ...estimados] : reales;
  const r = resumen(filas);
  if (!filas.length) {
    return html`<div class="tl-empty muted small">Todavía no pasó nadie por esta silla.
      ${estimados.length ? html`Hay <b>${estimados.length}</b> personas que se cayeron en la misma búsqueda antes de que existiera el registro: <button type="button" class="btn btn--sm" data-act="hist-est">Ver estimado</button>` : ''}</div>`;
  }
  const hoy = todayISO();
  const fechas = filas.flatMap((f) => [f.inicio, f.fin]).filter(Boolean).sort();
  const x0 = fechas[0];
  const x1 = fechas.at(-1) > hoy ? fechas.at(-1) : hoy;
  const span = Math.max(1, daysBetween(x0, x1));
  const marcas = eje(x0, x1);
  const actual = reales.find((f) => f.actual);
  const leyenda = HITOS.map(([, label, stage]) => html`<span class="legend"><i class="tl-seg--${colorOf(stage)}"></i>${label}</span>`);
  return html`<div class="tl ${compacto ? 'tl--compact' : ''}">
    <p class="tl-sum">
      <b>${r.total}</b> ${r.total === 1 ? 'persona pasó' : 'personas pasaron'} por esta silla${conEstimados && estimados.length ? html` <span class="tag">${estimados.length} estimadas</span>` : ''}:
      <b>${r.ingresaron}</b> ${r.ingresaron === 1 ? 'ingresó' : 'ingresaron'}, <b>${r.cayeron}</b> se ${r.cayeron === 1 ? 'cayó' : 'cayeron'}, <b>${r.enCurso}</b> en curso.
      ${r.promedio != null ? html`Proceso promedio: <b>${r.promedio} días</b>.` : ''}
      ${r.top.length ? html`Donde más se cae: <b>${r.top[0][0]}</b> (${r.top[0][1]}).` : ''}
      ${actual ? html`<br>Hoy: <b>${actual.c.nombre}</b> en ${stagePill(actual.c.stage, { small: true })} hace ${actual.hitos.length ? daysBetween(actual.hitos.at(-1).fecha, hoy) : '—'} días.` : ''}
    </p>
    <div class="tl-axis" aria-hidden="true"><span></span><div class="tl-ticks">
      ${marcas.map((m) => html`<span style="left:${((daysBetween(x0, m) / span) * 100).toFixed(2)}%">${fmtMonth(m, { short: true })}</span>`)}
      <span class="tl-today" style="left:${((daysBetween(x0, hoy) / span) * 100).toFixed(2)}%">hoy</span>
    </div><span></span></div>
    <ol class="tl-rows">${filas.map((f) => fila(f, x0, span))}</ol>
    <div class="tl-legend">${leyenda}<span class="legend">✓ ingresó · ✕ baja · ▸ en curso</span></div>
    ${!conEstimados && estimados.length ? html`<p class="small muted">Antes de que existiera el registro automático: <b>${estimados.length}</b> personas se cayeron en la misma búsqueda (${p.yacimiento} · ${p.sector || ''}).
      <button type="button" class="btn btn--sm" data-act="hist-est">Sumar estimado</button></p>` : ''}
    ${conEstimados && estimados.length ? html`<p class="small muted">“Misma búsqueda” = cancelados del mismo área, sector y puesto buscado; no quedaron vinculados a esta silla puntual, por eso son estimados.
      <button type="button" class="btn btn--sm" data-act="hist-real">Ver solo esta silla</button></p>` : ''}
  </div>`;
}
