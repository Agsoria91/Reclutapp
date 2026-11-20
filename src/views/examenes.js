// Control de exámenes médicos preocupacionales (solo RRHH): quiénes se enviaron,
// resultados por clínica / procedencia / área, interconsultas y tiempos.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { fmtDate, fmtMonth, todayISO, norm, pct } from '../lib/format.js';
import { filterGroup, toggleFilter, kpi, bars, saveLocal, loadLocal, serializeFilters, restoreFilters, animateIn, prevSize } from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { estadoMedico, esApto, clinicaCanon, diasExamen, hitosExamen, ESTADOS_MEDICOS } from '../components/examen.js';

const DIMS = ['clinica', 'procedencia', 'area', 'estado', 'mes'];
const KEY = 'reclutapp.ex.filters';
const filters = restoreFilters(loadLocal(KEY, {}), DIMS);
let grupo = loadLocal('reclutapp.ex.grupo', 'todos');
let search = '';
const canon = (v) => { const t = String(v ?? '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Sin dato'; };
const getters = {
  clinica: (c) => clinicaCanon(c.clinica) || 'Sin dato',
  procedencia: (c) => canon(c.procedencia),
  area: (c) => c.area || 'Sin dato',
  estado: (c) => estadoMedico(c).label,
  mes: (c) => c.epo.slice(0, 7),
};
const GRUPOS = {
  todos: ['Enviados a examen', () => true],
  pendiente: ['Pendientes de resultado', (c) => estadoMedico(c).code === 'pendiente'],
  aptos: ['Aptos', (c) => esApto(estadoMedico(c))],
  noaptos: ['No aptos', (c) => ['no_apto', 'no_apto_temp'].includes(estadoMedico(c).code)],
  interconsulta: ['En interconsulta', (c) => estadoMedico(c).code === 'interconsulta'],
};
const persist = () => saveLocal(KEY, serializeFilters(filters));
const base = () => state.candidates.filter((c) => c.epo);
const filtrar = (except, conGrupo = true) => base().filter((c) => (!conGrupo || GRUPOS[grupo][1](c))
  && DIMS.every((d) => d === except || !filters[d].size || filters[d].has(getters[d](c))));
const contar = (rows, dim) => {
  const m = new Map();
  for (const c of rows) { const k = getters[dim](c); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const promDias = (rows) => {
  const ds = rows.map(diasExamen).filter((d) => d && !d.abierto).map((d) => d.dias);
  return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
};

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Ingresá con un usuario de RRHH.' })); return; }
  if (state.loading && !state.candidates.length) { el.innerHTML = String(mascot('loading')); return; }
  bind(el);
  const sinGrupo = filtrar(null, false);
  const n = (g) => sinGrupo.filter(GRUPOS[g][1]).length;
  const rows = filtrar(null);
  const dias = promDias(rows);
  const conResultado = sinGrupo.filter((c) => estadoMedico(c).code !== 'pendiente' && estadoMedico(c).code !== 'interconsulta');

  let lista = rows;
  if (search) { const q = norm(search); lista = lista.filter((c) => norm([c.nombre, c.dni, c.clinica, c.clinica_localidad, c.procedencia, c.posicion].join(' ')).includes(q)); }
  lista = lista.slice().sort((a, b) => estadoMedico(a).orden - estadoMedico(b).orden || b.epo.localeCompare(a.epo));

  const meses = contar(filtrar('mes'), 'mes').sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  const mesMax = Math.max(1, ...meses.map((m) => m[1]));
  const porEstado = contar(filtrar('estado'), 'estado').map(([k, v]) => {
    const e = Object.values(ESTADOS_MEDICOS).find((x) => x.label === k);
    return [k, v, e?.color || 'neutral', k, e?.orden ?? 9];
  }).sort((a, b) => a[4] - b[4]);
  const chips = DIMS.flatMap((d) => [...filters[d]].map((v) => [d, v]));

  el.innerHTML = String(html`
  <section class="page-head"><div><h1>Exámenes médicos</h1></div></section>

  <section class="filters card">
    ${filterGroup({ dim: 'clinica', label: 'Clínica', options: contar(filtrar('clinica'), 'clinica'), selected: filters.clinica })}
    ${filterGroup({ dim: 'procedencia', label: 'Procedencia', options: contar(filtrar('procedencia'), 'procedencia'), selected: filters.procedencia })}
    ${filterGroup({ dim: 'area', label: 'Área', options: contar(filtrar('area'), 'area'), selected: filters.area })}
    ${chips.length || grupo !== 'todos' ? html`<div class="active-filters"><span class="muted small">Filtrando por:</span>
      ${grupo !== 'todos' ? html`<button type="button" class="chip chip--on" data-ex-grupo>${GRUPOS[grupo][0]} ✕</button>` : ''}
      ${chips.map(([d, v]) => html`<button type="button" class="chip chip--on" data-filter="${d}" data-value="${v}">${d === 'mes' ? fmtMonth(v) : v} ✕</button>`)}
      <button type="button" class="btn btn--ghost btn--sm" data-act="ex-clear">Limpiar todo</button></div>` : ''}
  </section>

  <section class="kpis kpis--6">
    ${kpi('Enviados a examen', n('todos'), { act: 'todos', selected: grupo === 'todos', big: true, id: 'ex-tot' })}
    ${kpi('Pendientes de resultado', n('pendiente'), { act: 'pendiente', selected: grupo === 'pendiente', tone: 'blue', id: 'ex-pen' })}
    ${kpi('Aptos', n('aptos'), { act: 'aptos', selected: grupo === 'aptos', tone: 'green', sub: `${pct(n('aptos'), conResultado.length)}% de los resultados`, id: 'ex-apt' })}
    ${kpi('No aptos', n('noaptos'), { act: 'noaptos', selected: grupo === 'noaptos', tone: n('noaptos') ? 'red' : '', sub: 'definitivos y temporales', id: 'ex-noa' })}
    ${kpi('En interconsulta', n('interconsulta'), { act: 'interconsulta', selected: grupo === 'interconsulta', tone: 'navy', id: 'ex-int' })}
    ${kpi('Días hasta la aptitud', dias ?? '—', { suffix: dias != null ? ' d' : '', sub: 'promedio, desde el envío', id: 'ex-dias' })}
  </section>

  <section class="grid-2">
    <article class="card"><h2 class="card-title">Resultado</h2>${bars(porEstado, { dim: 'estado', selected: filters.estado, total: filtrar('estado').length, chart: 'ex-estado' })}</article>
    <article class="card"><h2 class="card-title">Envíos por mes</h2>
      <div class="cols" role="group" aria-label="Envíos a examen por mes">
        ${meses.map(([m, c]) => {
          const sel = filters.mes.has(m); const dim = filters.mes.size && !sel;
          return html`<button type="button" class="col ${sel ? 'is-sel' : ''} ${dim ? 'is-dim' : ''}" data-filter="mes" data-value="${m}" aria-pressed="${sel}" title="${fmtMonth(m)}: ${c}">
            <span class="col-val">${c}</span>
            <span class="col-bar"><span class="col-fill" style="height:${prevSize('exmes|' + m)}%" data-h="${(c / mesMax) * 100}" data-k="exmes|${m}"></span></span>
            <span class="col-lbl">${fmtMonth(m, { short: true })}</span></button>`;
        })}
      </div></article>
  </section>

  ${tablaPor('Por clínica', 'Clínica', getters.clinica, rows, (c) => (c.clinica_localidad ? c.clinica_localidad : null))}
  ${tablaPor('Por procedencia', 'Procedencia', getters.procedencia, rows)}

  <section class="card">
    <div class="list-head"><h2 class="card-title">Personas <small class="muted">${lista.length}</small></h2>
      <div class="list-actions">
        <label class="search"><span class="sr-only">Buscar</span><input type="search" id="ex-search" placeholder="Buscar nombre, DNI, clínica, sede…" value="${search}"></label>
        <button class="btn btn--sm" data-act="ex-excel">Excel</button></div></div>
    <div class="table-wrap"><table class="tbl tbl--compact is-clickable">
      <thead><tr><th>Nombre</th><th>Procedencia</th><th>Área · Posición</th><th>Clínica</th><th>Recorrido</th><th>Estado</th><th class="num">Días</th></tr></thead>
      <tbody>${lista.map((c) => {
        const e = estadoMedico(c); const d = diasExamen(c);
        return html`<tr data-id="${c.id}" tabindex="0">
          <td><b>${c.nombre}</b></td>
          <td class="small">${c.procedencia || ''}</td>
          <td class="small">${c.area || ''}<small class="muted block">${c._silla?.puesto || c.posicion || ''}</small></td>
          <td class="small">${clinicaCanon(c.clinica) || '—'}<small class="muted block">${c.clinica_localidad || ''}</small></td>
          <td class="small ex-rec">${hitosExamen(c).map(([l, f]) => html`<span><b>${fmtDate(f)}</b> ${l}</span>`)}</td>
          <td><span class="pill pill--sm pill--${e.color}">${e.label}</span>${e.trasInterconsulta ? html`<small class="muted block">tras interconsulta</small>` : ''}</td>
          <td class="num">${d ? html`<b>${d.dias}</b>${d.abierto ? html`<small class="muted block">abierto</small>` : ''}` : ''}</td></tr>`;
      })}</tbody></table></div>
  </section>`);
  animateIn(el);
  const s = el.querySelector('#ex-search');
  s?.addEventListener('input', () => { search = s.value; const p = s.selectionStart; render(el); const x = el.querySelector('#ex-search'); x.focus(); x.setSelectionRange(p, p); });
}

function tablaPor(titulo, etiqueta, key, rows, sub) {
  const m = new Map();
  for (const c of rows) { const k = key(c); if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
  if (!m.size) return '';
  const cnt = (cs, code) => cs.filter((c) => estadoMedico(c).code === code).length;
  return html`<section class="card"><h2 class="card-title">${titulo}</h2><div class="table-wrap"><table class="tbl tbl--compact">
    <thead><tr><th>${etiqueta}</th><th class="num">Enviados</th><th class="num">Pendientes</th><th class="num">Aptos</th><th class="num">Apto c/ preex.</th><th class="num">No apto temp.</th><th class="num">No apto</th><th class="num">Interconsulta</th><th class="num">% aptos</th><th class="num">Días prom.</th></tr></thead>
    <tbody>${[...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, cs]) => {
      const res = cs.filter((c) => !['pendiente', 'interconsulta'].includes(estadoMedico(c).code)).length;
      const aptos = cnt(cs, 'apto') + cnt(cs, 'apto_pre');
      const sedes = sub ? [...new Set(cs.map(sub).filter(Boolean))] : [];
      return html`<tr><td><b>${k}</b>${sedes.length ? html`<small class="muted block">${sedes.join(' · ')}</small>` : ''}</td>
        <td class="num"><b>${cs.length}</b></td><td class="num">${cnt(cs, 'pendiente') || '·'}</td>
        <td class="num ok-txt">${cnt(cs, 'apto') || '·'}</td><td class="num">${cnt(cs, 'apto_pre') || '·'}</td>
        <td class="num">${cnt(cs, 'no_apto_temp') || '·'}</td><td class="num ${cnt(cs, 'no_apto') ? 'is-late-txt' : ''}">${cnt(cs, 'no_apto') || '·'}</td>
        <td class="num">${cnt(cs, 'interconsulta') || '·'}</td>
        <td class="num">${res ? pct(aptos, res) + '%' : '—'}</td><td class="num">${promDias(cs) ?? '—'}</td></tr>`;
    })}</tbody></table></div></section>`;
}

function bind(el) {
  if (el._exBound) return;
  el._exBound = true;
  el.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { toggleFilter(filters, f.dataset.filter, f.dataset.value); persist(); render(el); return; }
    const k = e.target.closest('[data-kpi]');
    if (k && GRUPOS[k.dataset.kpi]) { grupo = grupo === k.dataset.kpi ? 'todos' : k.dataset.kpi; saveLocal('reclutapp.ex.grupo', grupo); render(el); return; }
    if (e.target.closest('[data-ex-grupo]')) { grupo = 'todos'; saveLocal('reclutapp.ex.grupo', grupo); render(el); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'ex-clear') { DIMS.forEach((d) => filters[d].clear()); grupo = 'todos'; saveLocal('reclutapp.ex.grupo', grupo); persist(); render(el); return; }
    if (act === 'ex-excel') { excel(); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr) { const { openCandidate } = await import('./candidatos.js'); openCandidate(tr.dataset.id); }
  });
  el.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && e.target.matches('tr[data-id]')) { const { openCandidate } = await import('./candidatos.js'); openCandidate(e.target.dataset.id); }
  });
}

async function excel() {
  const rows = filtrar(null);
  const { downloadXlsx } = await import('../lib/xlsx.js');
  downloadXlsx(`Examenes_medicos_${todayISO()}.xlsx`, [{
    name: 'Exámenes médicos', title: 'Exámenes médicos preocupacionales', note: `Generado ${fmtDate(todayISO())} · ${rows.length} personas · uso interno RRHH`,
    columns: [['Nombre', 28], ['DNI', 11], ['Procedencia', 14], ['Área', 7], ['Posición / silla', 26], ['Clínica', 12], ['Sede', 16], ['Enviado a examen', 12],
      ['Resultado recibido', 12], ['Aptitud', 20], ['Enviado a interconsulta', 12], ['Cierre interconsulta', 12], ['Obs. interconsulta', 30], ['Estado médico', 22], ['Días', 7]]
      .map(([header, width]) => ({ header, width })),
    rows: rows.map((c) => { const d = diasExamen(c); return [c.nombre, c.dni, c.procedencia, c.area, c._silla?.puesto || c.posicion, clinicaCanon(c.clinica), c.clinica_localidad,
      c.epo, c.aptitud_recibida, c.aptitud, c.interconsulta, c.interconsulta_cierre, c.interconsulta_obs, estadoMedico(c).label, d?.dias ?? null]; }),
  }]);
}
