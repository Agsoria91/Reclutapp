// Entrevistas y efectividad: cuántas entrevistas se hicieron y cuántas avanzan,
// por área, sector, procedencia, posición o localidad. Solo datos agregados:
// funciona igual en la vista pública (candidates_public no trae nombres).
import { html, raw } from '../lib/html.js';
import { state } from '../lib/store.js';
import { fmtMonth, fmtInt } from '../lib/format.js';
import { countBy, interviewStats, reached } from '../lib/kpis.js';
import { filterGroup, toggleFilter, kpi, bars, saveLocal, loadLocal, serializeFilters, restoreFilters, animateIn, prevSize } from '../components/ui.js';
import { mascot } from '../components/mascot.js';

const DIMS = ['area', 'sector', 'procedencia', 'mes'];
const KEY = 'reclutapp.ent.filters';
const filters = restoreFilters(loadLocal(KEY, {}), DIMS);
let groupBy = loadLocal('reclutapp.ent.group', 'area');

const values = {
  area: (c) => c.area || '—',
  sector: (c) => c.servicio || '—',
  procedencia: (c) => c.procedencia || 'Sin dato',
  posicion: (c) => c.posicion || 'Sin dato',
  localidad: (c) => c.localidad || 'Sin dato',
  mes: (c) => (c.en_entrevista || '').slice(0, 7) || 'Sin fecha',
};
const GROUPS = [['area', 'Área'], ['sector', 'Sector'], ['procedencia', 'Procedencia'], ['posicion', 'Posición'], ['localidad', 'Localidad']];

const filterRows = (except) => state.candidates.filter((c) =>
  DIMS.every((d) => d === except || !filters[d].size || filters[d].has(values[d](c))));

function pillOptions(dim) {
  const rows = filterRows(dim).filter((c) => reached(c, 'entrevista', state.stageMap));
  const o = countBy(rows, values[dim]).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  for (const v of filters[dim]) if (!o.some(([k]) => k === v)) o.push([v, 0]);
  return o;
}

const pctTxt = (v) => (v == null ? '—' : v + '%');

export function render(el) {
  if (state.loading && !state.candidates.length) { el.innerHTML = String(mascot('loading')); return; }
  if (state.error) { el.innerHTML = String(mascot('error', { text: state.error })); return; }

  const SM = state.stageMap;
  const rows = filterRows(null);
  const s = interviewStats(rows, SM);

  // embudo con conversión paso a paso
  const pasos = [
    ['CV recibidos', s.cvs], ['Entrevistados', s.entrevistados], ['Aprobaron la entrevista', s.aprobados],
    ['Llegaron al examen médico', s.examen], ['Aptos', s.aptos], ['Ingresaron', s.ingresados],
  ];
  const maxP = Math.max(1, ...pasos.map((p) => p[1]));

  // tabla de efectividad por dimensión
  const byGroup = new Map();
  for (const c of rows) {
    const k = values[groupBy](c);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(c);
  }
  const tabla = [...byGroup.entries()].map(([k, rs]) => ({ k, ...interviewStats(rs, SM) }))
    .filter((r) => r.entrevistados > 0)
    .sort((a, b) => b.entrevistados - a.entrevistados);

  // entrevistas por mes (entrevistados y aprobados)
  const rMes = filterRows('mes').filter((c) => c.en_entrevista);
  const meses = [...new Set(rMes.map((c) => c.en_entrevista.slice(0, 7)))].sort().slice(-9)
    .map((m) => {
      const rs = rMes.filter((c) => c.en_entrevista.startsWith(m));
      return [m, rs.length, rs.filter((c) => reached(c, 'entrevista_aprobada', SM)).length];
    });
  const maxM = Math.max(1, ...meses.map((m) => m[1]));

  const motivos = countBy(rows.filter((c) => c.stage === 'cancelado' && reached(c, 'entrevista', SM) && c.motivos_baja?.length),
    (c) => c.motivos_baja);

  const chips = DIMS.flatMap((d) => [...filters[d]].map((v) => [d, v]));
  const de10 = s.entrevistados ? Math.round((s.aprobados / s.entrevistados) * 10) : null;
  const ing10 = s.entrevistados ? Math.round((s.ingresados / s.entrevistados) * 10) : null;

  el.innerHTML = String(html`
  <section class="page-head"><div><h1>Entrevistas y efectividad</h1>
    <p class="muted">Cuántas entrevistas se hicieron y cuántas avanzan. Un candidato cancelado cuenta hasta la instancia a la que llegó.</p></div></section>

  <section class="filters card">
    ${filterGroup({ dim: 'area', label: 'Área', options: pillOptions('area'), selected: filters.area })}
    ${filterGroup({ dim: 'sector', label: 'Sector', options: pillOptions('sector'), selected: filters.sector, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'procedencia', label: 'Procedencia', options: pillOptions('procedencia'), selected: filters.procedencia })}
    ${chips.length ? html`<div class="active-filters"><span class="muted small">Filtrando por:</span>
      ${chips.map(([d, v]) => html`<button type="button" class="chip chip--on" data-filter="${d}" data-value="${v}">${d === 'mes' && v !== 'Sin fecha' ? fmtMonth(v) : v} ✕</button>`)}
      <button type="button" class="btn btn--ghost btn--sm" data-act="clear">Limpiar todo</button></div>` : ''}
  </section>

  ${s.entrevistados ? html`<p class="headline">De cada <b>10</b> entrevistados, <b>${de10}</b> aprueban la entrevista y <b>${ing10}</b> terminan ingresando.</p>` : ''}

  <section class="kpis kpis--6">
    ${kpi('Entrevistas realizadas', s.entrevistados, { tone: 'blue', big: true, id: 'e-ent' })}
    ${kpi('Aprobaron', s.aprobados, { tone: 'navy', sub: `efectividad ${pctTxt(s.efectividad)}`, id: 'e-apr' })}
    ${kpi('Efectividad', s.efectividad ?? 0, { suffix: '%', tone: 'green', sub: 'aprobadas / entrevistas', id: 'e-efe' })}
    ${kpi('Llegaron a examen', s.examen, { tone: 'orange', id: 'e-exa' })}
    ${kpi('Ingresaron', s.ingresados, { tone: 'green', sub: `${pctTxt(s.conversion)} de los entrevistados`, id: 'e-ing' })}
    ${kpi('Bajas post-entrevista', s.bajasPost, { tone: 'red', id: 'e-baj' })}
  </section>

  <section class="grid-2">
    <article class="card">
      <h2 class="card-title">Embudo</h2>
      <ol class="funnel">${pasos.map(([l, n], i) => {
        const prev = i ? pasos[i - 1][1] : null;
        const key = `funnel|${i}`;
        return html`<li>
          <span class="funnel-lbl">${l}</span>
          <span class="funnel-bar"><span class="bars-fill bars-fill--${['sky', 'blue', 'navy', 'orange', 'yellow', 'green'][i]}" style="width:${prevSize(key)}%" data-w="${(n / maxP) * 100}" data-k="${key}"></span></span>
          <span class="funnel-n"><b>${fmtInt(n)}</b>${prev ? html`<small>${prev ? Math.round((n / prev) * 100) : 0}% del paso anterior</small>` : ''}</span>
        </li>`;
      })}</ol>
    </article>
    <article class="card">
      <h2 class="card-title">Entrevistas por mes</h2>
      <div class="cols cols--dual" role="group" aria-label="Entrevistas por mes">
        ${meses.map(([m, n, ok]) => {
          const sel = filters.mes.has(m);
          return html`<button type="button" class="col ${sel ? 'is-sel' : ''} ${filters.mes.size && !sel ? 'is-dim' : ''}" data-filter="mes" data-value="${m}" aria-pressed="${sel}" title="${fmtMonth(m)}: ${n} entrevistas, ${ok} aprobadas">
            <span class="col-val">${n}</span>
            <span class="col-bar">
              <span class="col-fill" style="height:${prevSize('ent|' + m)}%" data-h="${(n / maxM) * 100}" data-k="ent|${m}"></span>
              <span class="col-fill col-fill--ok" style="height:${prevSize('ok|' + m)}%" data-h="${(ok / maxM) * 100}" data-k="ok|${m}"></span>
            </span>
            <span class="col-lbl">${fmtMonth(m, { short: true })}</span>
          </button>`;
        })}
      </div>
      <p class="legend small muted"><i class="lg-ent"></i> entrevistas <i class="lg-ok"></i> aprobadas · tocá un mes para filtrar</p>
      <h2 class="card-title mt">Motivos de baja después de la entrevista</h2>
      ${motivos.length ? bars(motivos, { color: 'red', total: s.bajasPost, chart: 'e-mot' }) : html`<p class="muted">Sin bajas con motivo.</p>`}
    </article>
  </section>

  <section class="card">
    <header class="list-head">
      <h2 class="card-title">Efectividad por</h2>
      <div class="seg" role="radiogroup" aria-label="Agrupar por">${GROUPS.map(([k, l]) => html`<label class="seg-opt ${groupBy === k ? 'is-on' : ''}"><input type="radio" name="ent-group" value="${k}" ${raw(groupBy === k ? 'checked' : '')}> ${l}</label>`)}</div>
    </header>
    ${tabla.length ? html`<div class="table-wrap"><table class="tbl tbl--efe">
      <thead><tr><th>${GROUPS.find((g) => g[0] === groupBy)[1]}</th><th class="num">Entrevistas</th><th class="num">Aprobadas</th><th>Efectividad</th><th class="num hide-sm">Examen</th><th class="num">Ingresos</th><th class="num hide-sm">% ingreso</th><th class="num hide-sm">Bajas</th></tr></thead>
      <tbody>${tabla.map((r) => html`<tr>
        <td><strong>${r.k}</strong></td>
        <td class="num">${r.entrevistados}</td>
        <td class="num">${r.aprobados}</td>
        <td><span class="efe"><span class="minibar"><span style="width:${r.efectividad ?? 0}%"></span></span><b>${pctTxt(r.efectividad)}</b></span></td>
        <td class="num hide-sm">${r.examen}</td>
        <td class="num">${r.ingresados}</td>
        <td class="num hide-sm">${pctTxt(r.conversion)}</td>
        <td class="num hide-sm">${r.bajasPost}</td>
      </tr>`)}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${s.entrevistados}</td><td class="num">${s.aprobados}</td><td><b>${pctTxt(s.efectividad)}</b></td><td class="num hide-sm">${s.examen}</td><td class="num">${s.ingresados}</td><td class="num hide-sm">${pctTxt(s.conversion)}</td><td class="num hide-sm">${s.bajasPost}</td></tr></tfoot>
    </table></div>` : mascot('empty', { text: 'No hay entrevistas con estos filtros.' })}
  </section>`);
  animateIn(el);

  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-filter]');
      if (f) { toggleFilter(filters, f.dataset.filter, f.dataset.value); saveLocal(KEY, serializeFilters(filters)); render(el); return; }
      if (e.target.closest('[data-act="clear"]')) { DIMS.forEach((d) => filters[d].clear()); saveLocal(KEY, serializeFilters(filters)); render(el); }
    });
    el.addEventListener('change', (e) => {
      if (e.target.name === 'ent-group') { groupBy = e.target.value; saveLocal('reclutapp.ent.group', groupBy); render(el); }
    });
  }
}
