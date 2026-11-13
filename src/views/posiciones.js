import { html, raw, $ } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, fmtMonth, fmtMoney, todayISO, norm, pct, fmtInt } from '../lib/format.js';
import { applyFilters, countBy, positionKpis, pendingByTarget, isCovered, hasPerson } from '../lib/kpis.js';
import {
  stagePill, filterGroup, toggleFilter, kpi, openDrawer, closeDrawer, toast, formData, field,
  confirmDialog, saveLocal, loadLocal, serializeFilters, restoreFilters, datalist,
} from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { openAssignFromPosition } from './asignar.js';

const DIMS = ['area', 'sector', 'stage', 'cobertura'];
const KEY = 'reclutapp.pos.filters';
const saved = loadLocal(KEY, {});
export const posFilters = restoreFilters(saved, DIMS);
let search = '';
let soloPendientes = !!saved.soloPendientes;

export const posGetters = {
  area: (p) => p.yacimiento,
  sector: (p) => p.sector || '—',
  stage: (p) => state.stageMap[p.stage]?.label || p.stage,
  cobertura: (p) => p.tipo_cobertura || '—',
};

export function filteredPositions({ ignoreSearch = false } = {}) {
  let rows = applyFilters(state.positions, posFilters, posGetters);
  if (soloPendientes) rows = rows.filter((p) => !isCovered(p));
  if (!ignoreSearch && search) {
    const q = norm(search);
    rows = rows.filter((p) => norm([p.puesto, p.candidato_nombre, p.pos_sap, p.jefe_directo, p.sector].join(' ')).includes(q));
  }
  return rows;
}

// Opciones de un filtro calculadas sobre lo filtrado por las OTRAS dimensiones,
// así los conteos de cada pill reflejan la combinación actual.
function optionsFor(dim) {
  const others = { ...posFilters, [dim]: new Set() };
  const rows = applyFilters(state.positions, others, posGetters);
  const counts = countBy(rows, posGetters[dim]);
  if (dim === 'stage') {
    const order = (label) => state.stages.find((s) => s.label === label)?.orden ?? 999;
    counts.sort((a, b) => order(a[0]) - order(b[0]));
  } else counts.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  for (const v of posFilters[dim]) if (!counts.some(([k]) => k === v)) counts.push([v, 0]);
  return counts;
}

export function presentHash() {
  const q = new URLSearchParams();
  for (const d of DIMS) if (posFilters[d].size) q.set(d, [...posFilters[d]].join('|'));
  if (soloPendientes) q.set('pend', '1');
  return '#/presentar' + (q.toString() ? '?' + q : '');
}

export function render(el) {
  if (state.loading && !state.positions.length) { el.innerHTML = String(mascot('loading')); return; }
  if (state.error) { el.innerHTML = String(mascot('error', { text: state.error })); return; }

  const today = todayISO();
  const rows = filteredPositions();
  const base = filteredPositions({ ignoreSearch: true });
  const k = positionKpis(base, today);
  const pend = pendingByTarget(base, today);
  const staff = state.isStaff;

  // agrupar por área › sector
  const groups = new Map();
  for (const p of rows) {
    const g = `${p.yacimiento}|||${p.sector || 'Sin sector'}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));

  el.innerHTML = String(html`
  <section class="page-head">
    <div>
      <h1>Mapa de posiciones</h1>
      <p class="muted">Cada fila es una silla a cubrir. ${staff ? 'Tocá una fila para editarla o sentar a un candidato.' : 'Vista de solo lectura.'}</p>
    </div>
    <div class="head-actions">
      ${staff ? html`<button class="btn" data-act="new">+ Nueva silla</button>` : ''}
      <a class="btn btn--primary" href="${presentHash()}">Modo reunión</a>
    </div>
  </section>

  <section class="filters card">
    ${filterGroup({ dim: 'area', label: 'Área', options: optionsFor('area'), selected: posFilters.area })}
    ${filterGroup({ dim: 'sector', label: 'Sector', options: optionsFor('sector'), selected: posFilters.sector, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'stage', label: 'Estado', options: optionsFor('stage'), selected: posFilters.stage, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'cobertura', label: 'Cobertura', options: optionsFor('cobertura'), selected: posFilters.cobertura })}
    <div class="filters-row">
      <label class="search"><span class="sr-only">Buscar</span>
        <input type="search" id="pos-search" placeholder="Buscar puesto, persona, POS SAP, jefe…" value="${search}">
      </label>
      <label class="check"><input type="checkbox" id="pos-pend" ${raw(soloPendientes ? 'checked' : '')}> Solo pendientes de cubrir</label>
    </div>
  </section>

  <section class="kpis">
    ${kpi('Sillas', fmtInt(k.total))}
    ${kpi('Cubiertas', fmtInt(k.cubiertas), { sub: `${pct(k.cubiertas, k.total)}% del total`, tone: 'green' })}
    ${kpi('Faltan cubrir', fmtInt(k.pendientes), { tone: 'blue', big: true })}
    ${kpi('Con candidato en proceso', fmtInt(k.enProceso), { tone: 'navy' })}
    ${kpi('Sin candidato', fmtInt(k.sinCandidato), { tone: 'orange' })}
    ${kpi('Vencidas', fmtInt(k.vencidas), { sub: 'fecha objetivo pasada', tone: k.vencidas ? 'red' : '' })}
  </section>

  <section class="card">
    <h2 class="card-title">Faltan cubrir, por fecha objetivo</h2>
    ${pend.length ? pendingTable(pend, k.pendientes) : html`<p class="muted">No quedan posiciones pendientes con estos filtros.</p>`}
  </section>

  <section class="groups">
    ${rows.length ? sortedGroups.map(([key, ps]) => groupBlock(key, ps, today, staff)) : mascot('empty')}
  </section>
  ${staff ? datalists() : ''}
  `);

  bind(el);
}

export function pendingTable(pend, totalPend) {
  const max = Math.max(...pend.map((g) => g.total));
  return html`<div class="table-wrap"><table class="tbl tbl--pend">
    <thead><tr><th>Fecha objetivo</th><th class="num">Faltan</th><th class="hide-sm">Sin candidato</th><th class="hide-sm">En proceso</th><th>Por área</th><th class="bar-col hide-sm"></th></tr></thead>
    <tbody>${pend.map((g) => html`<tr class="${g.vencida ? 'is-late' : ''}">
      <td><strong>${g.fecha ? fmtDate(g.fecha) : 'Sin fecha'}</strong> ${g.vencida ? html`<span class="tag tag--late">vencida</span>` : ''}</td>
      <td class="num"><strong>${g.total}</strong></td>
      <td class="num hide-sm">${g.sinCandidato}</td>
      <td class="num hide-sm">${g.enProceso}</td>
      <td>${g.porArea.map(([a, n]) => html`<span class="chip">${a} <b>${n}</b></span>`)}</td>
      <td class="bar-col hide-sm"><span class="minibar"><span style="width:${(g.total / max) * 100}%"></span></span></td>
    </tr>`)}</tbody>
    <tfoot><tr><td>Total</td><td class="num"><strong>${totalPend}</strong></td><td colspan="4"></td></tr></tfoot>
  </table></div>`;
}

function groupBlock(key, ps, today, staff) {
  const [area, sector] = key.split('|||');
  const cub = ps.filter(isCovered).length;
  ps.sort((a, b) => a.puesto.localeCompare(b.puesto, 'es', { numeric: true }));
  return html`<article class="group card">
    <header class="group-head">
      <h3><span class="area-tag">${area}</span> ${sector}</h3>
      <span class="group-meta">${cub}/${ps.length} cubiertas · faltan <b>${ps.length - cub}</b></span>
      <span class="progress" aria-hidden="true"><span style="width:${pct(cub, ps.length)}%"></span></span>
    </header>
    <div class="table-wrap"><table class="tbl tbl--pos ${staff ? 'is-clickable' : ''}">
      <thead><tr>
        <th>Puesto</th><th class="hide-sm">POS SAP</th><th class="hide-sm">Diagrama</th><th>Persona asignada</th>
        <th>Estado</th><th>Objetivo</th><th class="hide-sm">Ingreso</th>${staff ? html`<th class="hide-sm">Básico</th>` : ''}
      </tr></thead>
      <tbody>${ps.map((p) => {
        const late = !isCovered(p) && p.fecha_objetivo && p.fecha_objetivo < today;
        return html`<tr data-id="${p.id}" ${raw(staff ? 'tabindex="0"' : '')}>
          <td data-th="Puesto"><strong>${p.puesto}</strong>${p.jefe_directo ? html`<small class="muted block">Jefe: ${p.jefe_directo}</small>` : ''}</td>
          <td data-th="POS SAP" class="hide-sm mono">${p.pos_sap || ''}</td>
          <td data-th="Diagrama" class="hide-sm">${[p.diagrama, p.turno].filter(Boolean).join(' · ')}</td>
          <td data-th="Persona">${hasPerson(p) ? html`${p.candidato_nombre}${(p.candidate_id || p.tiene_ficha) ? '' : html` <span class="tag" title="Sin ficha en Candidatos PP">sin ficha</span>`}` : html`<span class="muted">— vacante —</span>`}
            ${p.tipo_cobertura === 'Movimiento interno' ? html` <span class="tag tag--int">interno</span>` : ''}</td>
          <td data-th="Estado">${stagePill(p.stage)}</td>
          <td data-th="Objetivo" class="${late ? 'is-late-txt' : ''}">${fmtDate(p.fecha_objetivo)}</td>
          <td data-th="Ingreso" class="hide-sm">${fmtDate(p.fecha_ingreso)}</td>
          ${staff ? html`<td data-th="Básico" class="hide-sm num">${fmtMoney(p.basico)}</td>` : ''}
        </tr>`;
      })}</tbody>
    </table></div>
  </article>`;
}

function datalists() {
  const u = (f) => [...new Set(state.positions.map(f).filter(Boolean))].sort();
  return html`${datalist('dl-area', u((p) => p.yacimiento))}${datalist('dl-sector', u((p) => p.sector))}
    ${datalist('dl-jefe', u((p) => p.jefe_directo))}${datalist('dl-conv', u((p) => p.puesto_convenio))}
    ${datalist('dl-diag', u((p) => p.diagrama))}`;
}

function bind(el) {
  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) openEditor(e.target.dataset.id); });
  }
  const s = $('#pos-search', el);
  s?.addEventListener('input', () => {
    search = s.value;
    const pos = s.selectionStart;
    render(el);
    const n = $('#pos-search', el); n.focus(); n.setSelectionRange(pos, pos);
  });
  $('#pos-pend', el)?.addEventListener('change', (e) => { soloPendientes = e.target.checked; persist(); render(el); });
}

function persist() { saveLocal(KEY, { ...serializeFilters(posFilters), soloPendientes }); }

function onClick(e) {
  const el = e.currentTarget;
  const f = e.target.closest('[data-filter]');
  if (f) { toggleFilter(posFilters, f.dataset.filter, f.dataset.value); persist(); render(el); return; }
  if (e.target.closest('[data-act="new"]')) { openEditor(null); return; }
  const tr = e.target.closest('tr[data-id]');
  if (tr && state.isStaff) openEditor(tr.dataset.id);
}

// ---------------------------------------------------------------------------
// Editor de silla (solo RRHH)
// ---------------------------------------------------------------------------
export function openEditor(id) {
  const p = id ? state.positions.find((x) => x.id === id) : { yacimiento: [...posFilters.area][0] || '', stage: 'sin_candidato', encuadre: 'PP', tipo_cobertura: 'Búsqueda externa' };
  if (!p) return;
  const stageOpts = state.stages.filter((s) => s.code !== 'cancelado').map((s) => [s.code, s.label]);
  const linked = p.candidate_id ? state.candidates.find((c) => c.id === p.candidate_id) : null;

  const root = openDrawer(html`
    <div class="seat-box">
      <div>
        <span class="muted">Persona en la silla</span>
        <div class="seat-name">${p.candidato_nombre || html`<span class="muted">Vacante</span>`} ${p.id ? stagePill(p.stage) : ''}</div>
        ${linked ? html`<small class="muted">Vinculada a la ficha de Candidatos PP · ${linked.procedencia || ''} ${linked.localidad ? '· ' + linked.localidad : ''}</small>`
          : p.candidato_nombre ? html`<small class="muted">Nombre cargado a mano, sin ficha de candidato.</small>` : ''}
      </div>
      ${p.id ? html`<div class="seat-actions">
        <button type="button" class="btn btn--primary" data-act="assign">${p.candidato_nombre ? 'Cambiar candidato' : 'Sentar candidato'}</button>
        ${p.candidato_nombre ? html`<button type="button" class="btn btn--ghost" data-act="free">Liberar silla</button>` : ''}
      </div>` : ''}
    </div>

    <form id="pos-form" class="form-grid">
      ${field('Área (yacimiento)', 'yacimiento', p.yacimiento, { required: true, list: 'dl-area' })}
      ${field('Sector', 'sector', p.sector, { list: 'dl-sector' })}
      ${field('Puesto', 'puesto', p.puesto, { required: true, span: 2 })}
      ${field('POS SAP', 'pos_sap', p.pos_sap)}
      ${field('Jefe directo', 'jefe_directo', p.jefe_directo, { list: 'dl-jefe' })}
      ${field('Diagrama', 'diagrama', p.diagrama, { list: 'dl-diag' })}
      ${field('Turno', 'turno', p.turno)}
      ${field('Encuadre', 'encuadre', p.encuadre)}
      ${field('Tipo de cobertura', 'tipo_cobertura', p.tipo_cobertura, { options: ['Búsqueda externa', 'Movimiento interno'] })}
      ${field('Estado', 'stage', p.stage, { options: stageOpts, hint: linked ? 'Se sincroniza con la ficha del candidato.' : 'Al pasar a "Ingresado" se crea el legajo.' })}
      ${linked ? '' : field('Persona (texto libre)', 'candidato_nombre', p.candidato_nombre, { hint: 'Para movimientos internos o gente sin ficha.' })}
      ${field('Fecha inicio búsqueda', 'fecha_inicio', p.fecha_inicio, { type: 'date' })}
      ${field('Fecha objetivo', 'fecha_objetivo', p.fecha_objetivo, { type: 'date' })}
      ${field('Fecha de ingreso', 'fecha_ingreso', p.fecha_ingreso, { type: 'date' })}
      ${field('Categoría', 'categoria', p.categoria)}
      ${field('Puesto de convenio', 'puesto_convenio', p.puesto_convenio, { list: 'dl-conv', span: 2 })}
      ${field('Básico (sensible)', 'basico', p.basico, { type: 'number', step: '0.01' })}
      ${field('Id SAP', 'id_sap', p.id_sap)}
      ${field('Adicional', 'adicional', p.adicional, { span: 2 })}
      ${field('Observaciones', 'observaciones', p.observaciones, { type: 'textarea', span: 2 })}
      ${field('Revisar', 'revisar', p.revisar, { type: 'textarea', span: 2 })}
      <div class="form-actions field--wide">
        ${p.id ? html`<button type="button" class="btn btn--danger-ghost" data-act="delete">Eliminar silla</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn--primary">Guardar</button>
      </div>
    </form>`, { title: p.id ? `${p.puesto} · ${p.yacimiento}` : 'Nueva silla', wide: true });

  root.querySelector('#pos-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    if (linked) delete data.candidato_nombre;
    const btn = e.submitter; btn.disabled = true;
    const q = p.id ? sb.from('positions').update(data).eq('id', p.id) : sb.from('positions').insert(data);
    const { error } = await q;
    btn.disabled = false;
    if (error) { toast(error.message, 'error'); return; }
    const wasIngreso = data.stage === 'ingresado' && p.stage !== 'ingresado';
    toast(wasIngreso ? '¡Ingreso confirmado! Se creó el legajo.' : 'Silla guardada', 'ok');
    closeDrawer();
    await loadAll({ silent: true });
    if (wasIngreso) celebrate();
  });
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'assign') { closeDrawer(); openAssignFromPosition(p); }
    if (act === 'free') {
      if (!(await confirmDialog(`¿Liberar la silla "${p.puesto}"? ${p.candidato_nombre} queda sin silla (su ficha no se borra).`, { ok: 'Liberar' }))) return;
      const { error } = await sb.rpc('unassign_position', { p_position: p.id });
      if (error) return toast(error.message, 'error');
      toast('Silla liberada', 'ok'); closeDrawer(); loadAll({ silent: true });
    }
    if (act === 'delete') {
      if (!(await confirmDialog(`¿Eliminar la silla "${p.puesto}" (${p.yacimiento})? No se puede deshacer.`, { ok: 'Eliminar', danger: true }))) return;
      const { error } = await sb.from('positions').delete().eq('id', p.id);
      if (error) return toast(error.message, 'error');
      toast('Silla eliminada', 'ok'); closeDrawer(); loadAll({ silent: true });
    }
  });
}

export function celebrate() {
  const d = document.createElement('div');
  d.className = 'celebrate';
  d.innerHTML = String(mascot('success', { size: 200 }));
  document.body.appendChild(d);
  d.addEventListener('click', () => d.remove());
  setTimeout(() => d.classList.add('is-out'), 2200);
  setTimeout(() => d.remove(), 2600);
}

export { fmtMonth };
