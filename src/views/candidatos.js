import { html, raw, $ } from '../lib/html.js';
import { state, loadAll, stageOrder } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, fmtInt, pct, todayISO, norm, daysBetween } from '../lib/format.js';
import { applyFilters, countBy, candidateKpis, sectorMatches } from '../lib/kpis.js';
import {
  stagePill, filterGroup, toggleFilter, kpi, bars, openDrawer, closeDrawer, toast, formData, field,
  confirmDialog, saveLocal, loadLocal, serializeFilters, restoreFilters,
} from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { openAssignFromCandidate } from './asignar.js';
import { celebrate } from './posiciones.js';

const DIMS = ['area', 'sector', 'procedencia', 'stage'];
const KEY = 'reclutapp.cand.filters';
const filters = restoreFilters(loadLocal(KEY, {}), DIMS);
let search = '';
let page = 1;
const PAGE = 60;

const getters = {
  area: (c) => c.area || '—',
  sector: (c) => c.servicio || '—',
  procedencia: (c) => c.procedencia || '—',
  stage: (c) => state.stageMap[c.stage]?.label || c.stage,
};

function optionsFor(dim) {
  // la etapa solo filtra el listado de RRHH; los KPIs y sus filtros la ignoran
  const scope = dim === 'stage' ? { ...filters } : { area: filters.area, sector: filters.sector, procedencia: filters.procedencia };
  const rows = applyFilters(state.candidates, { ...scope, [dim]: new Set() }, getters);
  const counts = countBy(rows, getters[dim]);
  if (dim === 'stage') counts.sort((a, b) => (state.stages.find((s) => s.label === a[0])?.orden ?? 999) - (state.stages.find((s) => s.label === b[0])?.orden ?? 999));
  else counts.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  for (const v of filters[dim]) if (!counts.some(([k]) => k === v)) counts.push([v, 0]);
  return counts;
}

// Necesidad = sillas del mapa de posiciones que corresponden a los filtros de área/sector.
function positionsForFilters() {
  return state.positions.filter((p) =>
    (!filters.area.size || filters.area.has(p.yacimiento)) &&
    (!filters.sector.size || [...filters.sector].some((s) => sectorMatches(s, p.sector))));
}

export function render(el) {
  if (state.loading && !state.candidates.length) { el.innerHTML = String(mascot('loading')); return; }
  if (state.error) { el.innerHTML = String(mascot('error', { text: state.error })); return; }

  const today = todayISO();
  const kpiFilters = { area: filters.area, sector: filters.sector, procedencia: filters.procedencia };
  const base = applyFilters(state.candidates, kpiFilters, getters);
  const k = candidateKpis(base, state.stageMap, positionsForFilters(), today);
  const staff = state.isStaff;

  const funnel = state.stages
    .filter((s) => s.code !== 'sin_candidato')
    .map((s) => [s.label, k.porEtapa.get(s.code) || 0, s.color]);

  el.innerHTML = String(html`
  <section class="page-head">
    <div>
      <h1>Candidatos PP</h1>
      <p class="muted">Pipeline de todos los orígenes. ${staff ? 'Tocá un candidato para ver su ficha, su CV o sentarlo en una silla.' : 'Indicadores agregados; el detalle por persona es solo para RRHH.'}</p>
    </div>
    ${staff ? html`<div class="head-actions"><button class="btn" data-act="new">+ Nuevo candidato</button></div>` : ''}
  </section>

  <section class="filters card">
    ${filterGroup({ dim: 'area', label: 'Área', options: optionsFor('area'), selected: filters.area })}
    ${filterGroup({ dim: 'sector', label: 'Sector', options: optionsFor('sector'), selected: filters.sector, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'procedencia', label: 'Procedencia', options: optionsFor('procedencia'), selected: filters.procedencia })}
  </section>

  <section class="kpis">
    ${kpi('Candidatos', fmtInt(k.total))}
    ${kpi('En proceso', fmtInt(k.activos), { tone: 'blue', big: true })}
    ${kpi('Ingresados', fmtInt(k.ingresados), { tone: 'green', sub: `${k.conversion}% de conversión` })}
    ${kpi('Avance vs necesidad', `${pct(k.cubiertas, k.necesidad)}%`, { tone: 'navy', sub: `${k.cubiertas} de ${k.necesidad} sillas cubiertas` })}
    ${kpi('Días promedio postulado', k.diasPromedioActivos ?? '—', { sub: 'activos, desde CV recibido' })}
    ${kpi('Días CV → ingreso', k.diasPromedioIngreso ?? '—', { sub: 'promedio ingresados' })}
  </section>

  <section class="grid-2">
    <article class="card">
      <h2 class="card-title">Por etapa</h2>
      ${bars(funnel, { limit: 20, total: k.total })}
    </article>
    <article class="card">
      <h2 class="card-title">Origen de candidatos</h2>
      ${bars(k.origen, { color: 'green', total: k.total })}
      <h2 class="card-title mt">Motivos de baja</h2>
      ${k.motivos.length ? bars(k.motivos, { color: 'red', total: k.cancelados }) : html`<p class="muted">Sin bajas con motivo.</p>`}
    </article>
    <article class="card">
      <h2 class="card-title">Localidades</h2>
      ${bars(k.localidades, { color: 'sky', limit: 12, total: k.total })}
    </article>
    <article class="card">
      <h2 class="card-title">Avance por área</h2>
      ${bars(avancePorArea(), { color: 'green', max: 100, fmt: (n) => n + '%' })}
      <p class="muted small">Sillas cubiertas (Ingresado) sobre total de sillas del mapa de posiciones.</p>
    </article>
  </section>

  ${staff ? listSection(today) : ''}
  `);
  bind(el);
}

function avancePorArea() {
  const pos = positionsForFilters();
  const m = new Map();
  for (const p of pos) {
    const a = m.get(p.yacimiento) || [0, 0];
    a[1]++; if (p.stage === 'ingresado') a[0]++;
    m.set(p.yacimiento, a);
  }
  return [...m.entries()].map(([a, [c, t]]) => [`${a} (${c}/${t})`, pct(c, t)]).sort((a, b) => b[1] - a[1]);
}

function listSection(today) {
  let rows = applyFilters(state.candidates, filters, getters);
  if (search) {
    const q = norm(search);
    rows = rows.filter((c) => norm([c.nombre, c.dni, c.mail, c.telefono, c.posicion, c.localidad].join(' ')).includes(q));
  }
  rows.sort((a, b) => (stageOrder(a.stage) === 99) - (stageOrder(b.stage) === 99) ||
    stageOrder(b.stage) - stageOrder(a.stage) || (b.created_origen || '').localeCompare(a.created_origen || ''));
  const shown = rows.slice(0, page * PAGE);
  return html`<section class="card">
    <header class="list-head">
      <h2 class="card-title">Listado <small class="muted">${rows.length} candidatos</small></h2>
      <label class="search"><input type="search" id="cand-search" placeholder="Buscar nombre, DNI, mail, teléfono…" value="${search}"></label>
    </header>
    ${filterGroup({ dim: 'stage', label: 'Etapa', options: optionsFor('stage'), selected: filters.stage, allLabel: 'Todas' })}
    ${rows.length ? html`<div class="table-wrap"><table class="tbl tbl--cand is-clickable">
      <thead><tr><th>Nombre</th><th>Etapa</th><th class="hide-sm">Área · Servicio</th><th class="hide-sm">Posición</th><th class="hide-sm">Procedencia</th><th class="hide-sm">Localidad</th><th>Silla</th><th class="hide-sm num">Días</th><th class="hide-sm">CV</th></tr></thead>
      <tbody>${shown.map((c) => html`<tr data-id="${c.id}" tabindex="0">
        <td data-th="Nombre"><strong>${c.nombre}</strong></td>
        <td data-th="Etapa">${stagePill(c.stage, { small: true })}</td>
        <td data-th="Área" class="hide-sm">${[c.area, c.servicio].filter(Boolean).join(' · ')}</td>
        <td data-th="Posición" class="hide-sm">${c.posicion || ''}</td>
        <td data-th="Procedencia" class="hide-sm">${c.procedencia || ''}</td>
        <td data-th="Localidad" class="hide-sm">${c.localidad || ''}</td>
        <td data-th="Silla">${c._silla ? html`<span class="seat-chip" title="${c._silla.yacimiento} · ${c._silla.sector || ''}">${c._silla.puesto}</span>` : html`<span class="muted">—</span>`}</td>
        <td data-th="Días" class="hide-sm num">${state.stageMap[c.stage]?.es_activa ? daysBetween(c.cv_recibido || c.created_origen, today) ?? '' : ''}</td>
        <td data-th="CV" class="hide-sm">${c.cv_path ? raw('<span class="tag tag--match">CV</span>') : ''}</td>
      </tr>`)}</tbody></table></div>
      ${rows.length > shown.length ? html`<div class="center"><button class="btn btn--ghost" data-act="more">Ver más (${rows.length - shown.length})</button></div>` : ''}`
      : mascot('empty')}
  </section>`;
}

function bind(el) {
  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-filter]');
      if (f) { toggleFilter(filters, f.dataset.filter, f.dataset.value); page = 1; saveLocal(KEY, serializeFilters(filters)); render(el); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'more') { page++; render(el); return; }
      if (act === 'new') { openCandidate(null); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) openCandidate(tr.dataset.id);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) openCandidate(e.target.dataset.id); });
  }
  const s = $('#cand-search', el);
  s?.addEventListener('input', () => {
    search = s.value; page = 1;
    const p = s.selectionStart; render(el);
    const n = $('#cand-search', el); n.focus(); n.setSelectionRange(p, p);
  });
}

// ---------------------------------------------------------------------------
// Ficha del candidato (solo RRHH)
// ---------------------------------------------------------------------------
const MOTIVOS = ['No Califica', 'CV No Califica', 'Rechaza Propuesta', 'Secundario Incompleto', 'No Apto Medico', 'Sin vacante disponible', 'No se presenta', 'Otro'];

export function openCandidate(id) {
  const c = id ? state.candidates.find((x) => x.id === id) : { stage: 'cv_recibido', cv_recibido: todayISO(), motivos_baja: [] };
  if (!c) return;
  const stageOpts = state.stages.filter((s) => s.code !== 'sin_candidato').map((s) => [s.code, s.label]);
  const u = (f) => [...new Set(state.candidates.map(f).filter(Boolean))].sort();

  const root = openDrawer(html`
    ${c.id ? html`<div class="seat-box">
      <div><span class="muted">Silla</span>
        <div class="seat-name">${c._silla ? html`${c._silla.puesto} <small class="muted">· ${c._silla.yacimiento} · ${c._silla.sector || ''}</small>` : html`<span class="muted">Sin silla asignada</span>`}</div>
      </div>
      <div class="seat-actions">
        ${c.stage !== 'cancelado' ? html`<button type="button" class="btn btn--primary" data-act="seat">${c._silla ? 'Cambiar de silla' : 'Sentar en una silla'}</button>` : ''}
      </div>
    </div>
    <div class="cv-box">
      <span class="muted">CV</span>
      ${c.cv_path ? html`<button type="button" class="btn btn--ghost" data-act="cv-open">Ver CV</button>
        <button type="button" class="btn btn--ghost" data-act="cv-del">Quitar</button>` : html`<span class="muted">No hay CV cargado.</span>`}
      <label class="btn">${c.cv_path ? 'Reemplazar' : 'Subir CV'}<input type="file" id="cv-file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" hidden></label>
      <small class="muted">PDF, Word o imagen · hasta 10 MB · solo visible para RRHH</small>
    </div>` : ''}

    <form id="cand-form" class="form-grid">
      ${field('Nombre y apellido', 'nombre', c.nombre, { required: true, span: 2 })}
      ${field('Etapa', 'stage', c.stage, { options: stageOpts, hint: c._silla ? 'Se refleja en su silla.' : '' })}
      ${field('Área', 'area', c.area, { list: 'dlc-area' })}
      ${field('Servicio / Sector', 'servicio', c.servicio, { list: 'dlc-serv' })}
      ${field('Posición', 'posicion', c.posicion, { list: 'dlc-pos' })}
      ${field('Procedencia', 'procedencia', c.procedencia, { list: 'dlc-proc' })}
      ${field('Localidad', 'localidad', c.localidad, { list: 'dlc-loc' })}
      ${field('Provincia', 'provincia', c.provincia)}
      <fieldset class="field--wide sensitive"><legend>Datos sensibles · solo RRHH</legend>
        <div class="form-grid">
          ${field('DNI', 'dni', c.dni)}
          ${field('Teléfono', 'telefono', c.telefono, { type: 'tel' })}
          ${field('Mail', 'mail', c.mail, { type: 'email', span: 2 })}
        </div>
      </fieldset>
      ${field('CV recibido', 'cv_recibido', c.cv_recibido, { type: 'date' })}
      ${field('En entrevista', 'en_entrevista', c.en_entrevista, { type: 'date' })}
      ${field('Validación RRLL', 'validacion_rrll', c.validacion_rrll, { type: 'date' })}
      ${field('EPO', 'epo', c.epo, { type: 'date' })}
      ${field('Clínica', 'clinica', c.clinica)}
      ${field('Aptitud recibida', 'aptitud_recibida', c.aptitud_recibida, { type: 'date' })}
      ${field('Aptitud', 'aptitud', c.aptitud, { options: [['', '—'], 'Apto', 'Apto Con Preexistencia', 'No Apto Temporal', 'No Apto'] })}
      ${field('Fecha de ingreso', 'fecha_ingreso', c.fecha_ingreso, { type: 'date' })}
      <fieldset class="field--wide"><legend>Motivos de baja (si se cancela)</legend>
        <div class="checks">${MOTIVOS.map((m) => html`<label class="check"><input type="checkbox" name="motivo" value="${m}" ${raw(c.motivos_baja?.includes(m) ? 'checked' : '')}> ${m}</label>`)}</div>
      </fieldset>
      ${field('Comentarios', 'comentarios', c.comentarios, { type: 'textarea', span: 2 })}
      <div class="form-actions field--wide">
        ${c.id ? html`<button type="button" class="btn btn--danger-ghost" data-act="delete">Eliminar</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn--primary">Guardar</button>
      </div>
    </form>
    <datalist id="dlc-area">${u((x) => x.area).map((v) => html`<option value="${v}">`)}</datalist>
    <datalist id="dlc-serv">${u((x) => x.servicio).map((v) => html`<option value="${v}">`)}</datalist>
    <datalist id="dlc-pos">${u((x) => x.posicion).map((v) => html`<option value="${v}">`)}</datalist>
    <datalist id="dlc-proc">${u((x) => x.procedencia).map((v) => html`<option value="${v}">`)}</datalist>
    <datalist id="dlc-loc">${u((x) => x.localidad).map((v) => html`<option value="${v}">`)}</datalist>
  `, { title: c.id ? c.nombre : 'Nuevo candidato', wide: true });

  const form = root.querySelector('#cand-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(form);
    data.motivos_baja = [...form.querySelectorAll('input[name="motivo"]:checked')].map((i) => i.value);
    delete data.motivo;
    data.cancelado = data.stage === 'cancelado';
    data.entrevista_ok = stageOrder(data.stage) >= stageOrder('entrevista_aprobada') && !data.cancelado;
    data.listo_ingreso = ['proximo_ingreso', 'ingresado'].includes(data.stage);
    if (data.stage === 'cancelado' && c._silla &&
        !(await confirmDialog(`Al cancelar a ${c.nombre}, la silla "${c._silla.puesto}" queda libre. ¿Seguimos?`, { ok: 'Cancelar candidato', danger: true }))) return;
    const btn = e.submitter; btn.disabled = true;
    const { error } = c.id ? await sb.from('candidates').update(data).eq('id', c.id) : await sb.from('candidates').insert(data);
    btn.disabled = false;
    if (error) return toast(error.message, 'error');
    const ingreso = data.stage === 'ingresado' && c.stage !== 'ingresado';
    toast(ingreso && c._silla ? '¡Ingreso confirmado! Se creó el legajo.' : 'Candidato guardado', 'ok');
    closeDrawer();
    await loadAll({ silent: true });
    if (ingreso) celebrate();
  });

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'seat') { closeDrawer(); openAssignFromCandidate(c); }
    if (act === 'cv-open') {
      const { data, error } = await sb.storage.from('cvs').createSignedUrl(c.cv_path, 120);
      if (error) return toast(error.message, 'error');
      window.open(data.signedUrl, '_blank', 'noopener');
    }
    if (act === 'cv-del') {
      if (!(await confirmDialog('¿Quitar el CV de este candidato?', { ok: 'Quitar', danger: true }))) return;
      await sb.storage.from('cvs').remove([c.cv_path]);
      const { error } = await sb.from('candidates').update({ cv_path: null }).eq('id', c.id);
      if (error) return toast(error.message, 'error');
      toast('CV quitado', 'ok'); closeDrawer(); loadAll({ silent: true });
    }
    if (act === 'delete') {
      if (!(await confirmDialog(`¿Eliminar a ${c.nombre} del pipeline? Se pierde su ficha y su CV.`, { ok: 'Eliminar', danger: true }))) return;
      if (c.cv_path) await sb.storage.from('cvs').remove([c.cv_path]);
      const { error } = await sb.from('candidates').delete().eq('id', c.id);
      if (error) return toast(error.message, 'error');
      toast('Candidato eliminado', 'ok'); closeDrawer(); loadAll({ silent: true });
    }
  });

  root.querySelector('#cv-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('El archivo supera 10 MB', 'error');
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${c.id}/${Date.now()}.${ext}`;
    toast('Subiendo CV…');
    const up = await sb.storage.from('cvs').upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) return toast(up.error.message, 'error');
    const { error } = await sb.from('candidates').update({ cv_path: path }).eq('id', c.id);
    if (error) return toast(error.message, 'error');
    if (c.cv_path) await sb.storage.from('cvs').remove([c.cv_path]);
    toast('CV guardado', 'ok');
    closeDrawer();
    await loadAll({ silent: true });
    openCandidate(c.id);
  });
}
