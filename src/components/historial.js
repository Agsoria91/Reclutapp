// Historial de una silla: todas las personas que pasaron por ella (titular o
// terna), hasta qué instancia llegaron, cuánto tardó cada tramo y por qué se
// cayeron. SOLO RRHH: usa state.historial y fichas completas de candidatos,
// que nunca se cargan en la vista pública.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { norm, todayISO, fmtDate, fmtMonth, daysBetween } from '../lib/format.js';
import { mismaBusqueda, busquedaDeSilla } from '../data/busquedas.js';
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


function trayecto(c, tramo) {
  const hoy = todayISO();
  const hitos = HITOS.map(([k, label, stage]) => ({ k, label, stage, fecha: iso(c[k]) }))
    .filter((h) => h.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cayo = c.stage === 'cancelado';
  const ingreso = c.stage === 'ingresado';
  const inicio = hitos[0]?.fecha || iso(tramo?.desde) || iso(c.created_at);
  // Fin del proceso: ingreso, o baja (fecha registrada; si es una baja vieja sin
  // fecha, el último hito alcanzado como aproximación), o hoy si sigue en curso.
  // Nunca "hasta que se cubrió la silla" ni la fecha de importación.
  const bajaReal = iso(c.fecha_baja) || (tramo?.origen === 'app' ? iso(tramo?.hasta) : null);
  let fin = ingreso ? (iso(c.fecha_ingreso) || hitos.at(-1)?.fecha) : cayo ? (bajaReal || hitos.at(-1)?.fecha || inicio) : hoy;
  if (fin && inicio && fin < inicio) fin = inicio;
  const ultimo = hitos.at(-1);
  return {
    c, hitos, inicio, fin, cayo, ingreso, enCurso: !cayo && !ingreso,
    dias: inicio && fin ? daysBetween(inicio, fin) : null,
    llego: ultimo ? ultimo.label : 'CV',
    finAprox: cayo && !bajaReal,
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

const procedenciaDe = (c) => {
  const t = String(c.procedencia || '').trim().replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Sin dato';
};

// Cómo le fue a cada procedencia en esta silla
function porProcedencia(filas) {
  const m = new Map();
  for (const f of filas) {
    const k = procedenciaDe(f.c);
    if (!m.has(k)) m.set(k, { n: 0, ingresaron: 0, cayeron: 0, enCurso: 0, dias: [], llego: new Map() });
    const g = m.get(k);
    g.n++;
    if (f.ingreso) g.ingresaron++;
    else if (f.cayo) { g.cayeron++; g.llego.set(f.llego, (g.llego.get(f.llego) || 0) + 1); }
    else g.enCurso++;
    if (!f.enCurso && f.dias != null) g.dias.push(f.dias);
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
}

function tablaProcedencia(filas) {
  const rows = porProcedencia(filas);
  if (!rows.length) return '';
  return html`<div class="tl-proc-tbl table-wrap"><table class="tbl tbl--compact">
    <thead><tr><th>Procedencia</th><th class="num">Pasaron</th><th class="num">Ingresaron</th><th class="num">No continuaron</th><th class="num">En curso</th><th>Etapa de finalización</th><th class="num">Días prom.</th></tr></thead>
    <tbody>${rows.map(([k, g]) => html`<tr>
      <td><b>${k}</b></td><td class="num">${g.n}</td>
      <td class="num ${g.ingresaron ? 'ok-txt' : ''}">${g.ingresaron}</td>
      <td class="num ${g.cayeron ? 'is-late-txt' : ''}">${g.cayeron}</td>
      <td class="num">${g.enCurso}</td>
      <td class="small">${[...g.llego.entries()].sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e} (${n})`).join(', ') || '—'}</td>
      <td class="num">${g.dias.length ? Math.round(g.dias.reduce((a, b) => a + b, 0) / g.dias.length) : '—'}</td>
    </tr>`)}</tbody></table></div>`;
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
      <span class="tl-meta">${f.rol}</span>
      <span class="tl-proc">Procedencia: <b>${procedenciaDe(f.c)}</b></span>
      <span class="tl-out">${f.ingreso ? `Ingresó el ${fmtDate(f.c.fecha_ingreso)}`
        : f.cayo ? `No continuó · etapa: ${f.llego}${motivos ? ' — ' + motivos : ''}`
        : html`Hoy: ${stagePill(f.c.stage, { small: true })}`}</span>
    </div>
    <div class="tl-track" role="img" aria-label="${f.c.nombre}: ${f.hitos.map((h) => `${h.label} ${fmtDate(h.fecha)}`).join(', ')}">
      ${segs.map((s) => html`<span class="tl-seg tl-seg--${colorOf(s.stage)}" style="left:${s.a}%;width:${s.w}%" title="${s.label}: ${fmtDate(s.fecha)} · ${s.dias} días"></span>`)}
      ${f.hitos.filter((h) => h.fecha <= f.fin).map((h) => html`<i class="tl-dot" style="left:${pos(h.fecha)}%" title="${h.label}: ${fmtDate(h.fecha)}"></i>`)}
      ${f.fin ? html`<b class="tl-end ${f.cayo ? 'tl-end--out' : f.ingreso ? 'tl-end--in' : ''}" style="left:${pos(f.fin)}%" title="${f.cayo ? 'Finalizó el proceso' + (f.finAprox ? ' (fecha aproximada)' : '') : f.ingreso ? 'Ingreso' : 'Hoy'}">${fin}</b>` : ''}
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
      ${estimados.length ? html`Hay <b>${estimados.length}</b> candidatos de la misma búsqueda que no continuaron (registro previo): <button type="button" class="btn btn--sm" data-act="hist-est">Ver estimado</button>` : ''}</div>`;
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
      <b>${r.ingresaron}</b> ${r.ingresaron === 1 ? 'ingresó' : 'ingresaron'}, <b>${r.cayeron}</b> no ${r.cayeron === 1 ? 'continuó' : 'continuaron'}, <b>${r.enCurso}</b> en curso.
      ${r.promedio != null ? html`Proceso promedio: <b>${r.promedio} días</b>.` : ''}
      ${r.top.length ? html`Etapa de mayor desvinculación: <b>${r.top[0][0]}</b> (${r.top[0][1]}).` : ''}
      ${actual ? html`<br>Hoy: <b>${actual.c.nombre}</b> en ${stagePill(actual.c.stage, { small: true })} ${haceCuanto(actual.hitos.at(-1)?.fecha, hoy)}.` : ''}
    </p>
    <div class="tl-axis" aria-hidden="true"><span></span><div class="tl-ticks">
      ${marcas.map((m) => html`<span style="left:${((daysBetween(x0, m) / span) * 100).toFixed(2)}%">${fmtMonth(m, { short: true })}</span>`)}
      <span class="tl-today" style="left:${((daysBetween(x0, hoy) / span) * 100).toFixed(2)}%">hoy</span>
    </div><span></span></div>
    <ol class="tl-rows">${filas.map((f) => fila(f, x0, span))}</ol>
    <div class="tl-legend">${leyenda}<span class="legend">✓ ingresó · ✕ no continuó · ▸ en curso</span></div>
    <h4 class="tl-h">Por procedencia</h4>
    ${tablaProcedencia(filas)}
    ${!conEstimados && estimados.length ? html`<p class="small muted">Registro previo: <b>${estimados.length}</b> candidatos de la misma búsqueda no continuaron (${busquedaDeSilla(p)?.label || p.puesto} · ${p.yacimiento}).
      <button type="button" class="btn btn--sm" data-act="hist-est">Sumar estimado</button></p>` : ''}
    ${conEstimados && estimados.length ? html`<p class="small muted">Incluye candidatos de la misma búsqueda (${busquedaDeSilla(p)?.label || p.puesto} · ${p.yacimiento}) previos al registro por silla.
      <button type="button" class="btn btn--sm" data-act="hist-real">Ver solo esta silla</button></p>` : ''}
  </div>`;
}

// "hace 5 días", "desde hoy", o "programado para el 20/11" si la fecha es futura
function haceCuanto(fecha, hoy) {
  if (!fecha) return '';
  const d = daysBetween(fecha, hoy);
  if (d < 0) return `programado para el ${fmtDate(fecha)}`;
  if (d === 0) return 'desde hoy';
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}
