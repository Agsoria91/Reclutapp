import { html, raw, $ } from '../lib/html.js';
import { state, loadAll, stageOrder } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtInt, pct, todayISO, norm, daysBetween, fmtMonth } from '../lib/format.js';
import { countBy, candidateKpis, sectorMatches } from '../lib/kpis.js';
import {
  stagePill, filterGroup, toggleFilter, kpi, bars, openDrawer, closeDrawer, toast, formData, field,
  confirmDialog, saveLocal, loadLocal, serializeFilters, restoreFilters, prevSize, pickField,
  animateIn,
} from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { openAssignFromCandidate } from './asignar.js';
import { celebrate } from './posiciones.js';
import { preingresoFields } from '../components/ingreso.js';

// Dimensiones de filtro cruzado: tocar una barra filtra por ese valor y todo
// lo demás se recalcula. Cada gráfico se calcula con TODOS los filtros menos
// el suyo, así se ve qué barra está elegida y cuánto pesan las otras.
const DIMS = ['area', 'sector', 'procedencia', 'stage', 'motivo', 'localidad', 'mes'];
const DIM_LABEL = { area: 'Área', sector: 'Sector', procedencia: 'Procedencia', stage: 'Etapa', motivo: 'Motivo de baja', localidad: 'Localidad', mes: 'Mes de CV' };
const KEY = 'reclutapp.cand.filters2';
const filters = restoreFilters(loadLocal(KEY, {}), DIMS);
let search = '';
let page = 1;
const PAGE = 60;

const values = {
  area: (c) => [c.area || '—'],
  sector: (c) => [c.servicio || '—'],
  procedencia: (c) => [c.procedencia || 'Sin dato'],
  stage: (c) => [state.stageMap[c.stage]?.label || c.stage],
  motivo: (c) => (c.motivos_baja?.length ? c.motivos_baja : ['—']),
  localidad: (c) => [c.localidad || 'Sin dato'],
  mes: (c) => [(c.cv_recibido || c.created_origen || '').slice(0, 7) || 'Sin fecha'],
};

function filterRows(except) {
  return state.candidates.filter((c) => DIMS.every((d) =>
    d === except || !filters[d].size || values[d](c).some((v) => filters[d].has(v))));
}
const counts = (rows, dim) => countBy(rows, (c) => values[dim](c));

function pillOptions(dim) {
  const c = counts(filterRows(dim), dim).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  for (const v of filters[dim]) if (!c.some(([k]) => k === v)) c.push([v, 0]);
  return c;
}

// Necesidad = sillas del mapa de posiciones que corresponden a los filtros de área/sector.
function positionsForFilters() {
  return state.positions.filter((p) =>
    (!filters.area.size || filters.area.has(p.yacimiento)) &&
    (!filters.sector.size || [...filters.sector].some((s) => sectorMatches(s, p.sector))));
}

function persist() { saveLocal(KEY, serializeFilters(filters)); }
const activeCount = () => DIMS.reduce((n, d) => n + filters[d].size, 0);

export function render(el) {
  if (state.loading && !state.candidates.length) { el.innerHTML = String(mascot('loading')); return; }
  if (state.error) { el.innerHTML = String(mascot('error', { text: state.error })); return; }

  const today = todayISO();
  const all = filterRows(null);
  const k = candidateKpis(all, state.stageMap, positionsForFilters(), today);
  const staff = state.isStaff;

  // por etapa (en orden de pipeline)
  const byStage = new Map(counts(filterRows('stage'), 'stage'));
  const funnel = state.stages.filter((s) => s.code !== 'sin_candidato')
    .map((s) => [s.label, byStage.get(s.label) || 0, s.color]);
  const totStage = funnel.reduce((a, r) => a + r[1], 0);

  const rOrigen = filterRows('procedencia');
  const rMotivo = filterRows('motivo').filter((c) => c.stage === 'cancelado');
  const motivos = counts(rMotivo, 'motivo').filter(([m]) => m !== '—');
  const rLoc = filterRows('localidad');
  const rMes = filterRows('mes');
  const meses = counts(rMes, 'mes').filter(([m]) => m !== 'Sin fecha').sort((a, b) => a[0].localeCompare(b[0])).slice(-9);
  const mesMax = Math.max(1, ...meses.map((m) => m[1]));

  const chips = DIMS.flatMap((d) => [...filters[d]].map((v) => [d, v]));

  el.innerHTML = String(html`
  <section class="page-head">
    <div>
      <h1>Candidatos PP</h1>
      <p class="muted">Tocá cualquier barra para filtrar: todo lo demás se recalcula. ${staff ? 'Abajo, el listado con las fichas.' : 'El detalle por persona es solo para RRHH.'}</p>
    </div>
    ${staff ? html`<div class="head-actions"><button class="btn" data-act="new">+ Nuevo candidato</button></div>` : ''}
  </section>

  <section class="filters card">
    ${filterGroup({ dim: 'area', label: 'Área', options: pillOptions('area'), selected: filters.area })}
    ${filterGroup({ dim: 'sector', label: 'Sector', options: pillOptions('sector'), selected: filters.sector, allLabel: 'Todos' })}
    <div class="active-filters ${chips.length ? '' : 'is-empty'}" aria-live="polite">
      ${chips.length ? html`<span class="muted small">Filtrando por:</span>
        ${chips.map(([d, v]) => html`<button type="button" class="chip chip--on" data-filter="${d}" data-value="${v}" title="Quitar">${DIM_LABEL[d]}: <b>${d === 'mes' && v !== 'Sin fecha' ? fmtMonth(v) : v}</b> ✕</button>`)}
        <button type="button" class="btn btn--ghost btn--sm" data-act="clear">Limpiar todo</button>`
      : html`<span class="muted small">Sin filtros: mostrando los ${fmtInt(state.candidates.length)} candidatos.</span>`}
    </div>
  </section>

  <section class="kpis kpis--6">
    ${kpi('Candidatos', k.total, { id: 'c-total' })}
    ${kpi('En proceso', k.activos, { tone: 'blue', big: true, id: 'c-act' })}
    ${kpi('Ingresados', k.ingresados, { tone: 'green', sub: `${k.conversion}% de conversión`, id: 'c-ing' })}
    ${kpi('Avance vs necesidad', pct(k.cubiertas, k.necesidad), { suffix: '%', tone: 'navy', sub: `${k.cubiertas} de ${k.necesidad} sillas cubiertas`, id: 'c-av' })}
    ${kpi('Días promedio postulado', k.diasPromedioActivos ?? '—', { sub: 'activos, desde CV recibido', id: 'c-dias' })}
    ${kpi('Días CV → ingreso', k.diasPromedioIngreso ?? '—', { sub: 'promedio ingresados', id: 'c-ding' })}
  </section>

  <section class="card">
    <h2 class="card-title">CV recibidos por mes</h2>
    <div class="cols" role="group" aria-label="CV recibidos por mes">
      ${meses.map(([m, n]) => {
        const sel = filters.mes.has(m);
        const dim = filters.mes.size && !sel;
        return html`<button type="button" class="col ${sel ? 'is-sel' : ''} ${dim ? 'is-dim' : ''}" data-filter="mes" data-value="${m}" aria-pressed="${sel}" title="${fmtMonth(m)}: ${n} CV">
          <span class="col-val">${n}</span>
          <span class="col-bar"><span class="col-fill" style="height:${prevSize('mes|' + m)}%" data-h="${(n / mesMax) * 100}" data-k="mes|${m}"></span></span>
          <span class="col-lbl">${fmtMonth(m, { short: true })}</span>
        </button>`;
      })}
    </div>
  </section>

  <section class="grid-2">
    <article class="card">
      <h2 class="card-title">Por etapa</h2>
      ${bars(funnel, { limit: 20, total: totStage, dim: 'stage', selected: filters.stage, chart: 'c-stage' })}
    </article>
    <article class="card">
      <h2 class="card-title">Origen de candidatos</h2>
      ${bars(counts(rOrigen, 'procedencia'), { color: 'green', total: rOrigen.length, dim: 'procedencia', selected: filters.procedencia, chart: 'c-orig' })}
      <h2 class="card-title mt">Motivos de baja</h2>
      ${motivos.length ? bars(motivos, { color: 'red', total: rMotivo.length, dim: 'motivo', selected: filters.motivo, chart: 'c-mot' }) : html`<p class="muted">Sin bajas con motivo en esta selección.</p>`}
    </article>
    <article class="card">
      <h2 class="card-title">Localidades</h2>
      ${bars(counts(rLoc, 'localidad'), { color: 'sky', limit: 12, total: rLoc.length, dim: 'localidad', selected: filters.localidad, chart: 'c-loc' })}
    </article>
    <article class="card">
      <h2 class="card-title">Avance por área</h2>
      ${bars(avancePorArea(), { color: 'green', max: 100, fmt: (n) => n + '%', dim: 'area', selected: filters.area, chart: 'c-av' })}
      <p class="muted small">Sillas cubiertas (Ingresado) sobre el total del mapa de posiciones. Tocá un área para filtrar.</p>
    </article>
  </section>

  ${staff ? listSection(today, all) : ''}
  `);
  bind(el);
  animateIn(el);
}

function avancePorArea() {
  const pos = state.positions.filter((p) => !filters.sector.size || [...filters.sector].some((s) => sectorMatches(s, p.sector)));
  const m = new Map();
  for (const p of pos) {
    const a = m.get(p.yacimiento) || [0, 0];
    a[1]++; if (p.stage === 'ingresado') a[0]++;
    m.set(p.yacimiento, a);
  }
  return [...m.entries()].map(([a, [c, t]]) => [`${a} (${c}/${t})`, pct(c, t), null, a]).sort((a, b) => b[1] - a[1]);
}

function listSection(today, all) {
  let rows = all;
  if (search) {
    const q = norm(search);
    rows = rows.filter((c) => norm([c.nombre, c.dni, c.mail, c.telefono, c.posicion, c.localidad].join(' ')).includes(q));
  }
  rows = [...rows].sort((a, b) => (stageOrder(a.stage) === 99) - (stageOrder(b.stage) === 99) ||
    stageOrder(b.stage) - stageOrder(a.stage) || (b.created_origen || '').localeCompare(a.created_origen || ''));
  const shown = rows.slice(0, page * PAGE);
  return html`<section class="card">
    <header class="list-head">
      <h2 class="card-title">Listado <small class="muted">${rows.length} candidatos</small></h2>
      <label class="search"><input type="search" id="cand-search" placeholder="Buscar nombre, DNI, mail, teléfono…" value="${search}"></label>
    </header>
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
      if (f) { toggleFilter(filters, f.dataset.filter, f.dataset.value); page = 1; persist(); render(el); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'clear') { DIMS.forEach((d) => filters[d].clear()); page = 1; persist(); render(el); return; }
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
        ${c.stage !== 'cancelado' ? html`<button type="button" class="btn btn--primary" data-act="seat">${c._silla ? 'Cambiar de silla' : 'Sentar en una silla'}</button>
          <button type="button" class="btn" data-act="terna">Sumar a una terna</button>` : ''}
      </div>
      ${(c._ternas || []).filter((p) => p.candidate_id !== c.id).length ? html`<div class="field--wide small muted">También en la terna de:
        ${(c._ternas || []).filter((p) => p.candidate_id !== c.id).map((p) => html`<span class="chip">${p.puesto} · ${p.yacimiento}${p.candidato_nombre ? ` (principal: ${p.candidato_nombre})` : ''}</span>`)}</div>` : ''}
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
      ${pickField('Área', 'area', c.area, [state.candidates.map((x) => x.area), state.positions.map((x) => x.yacimiento)])}
      ${pickField('Servicio / Sector', 'servicio', c.servicio, state.candidates.map((x) => x.servicio))}
      ${pickField('Posición', 'posicion', c.posicion, state.candidates.map((x) => x.posicion))}
      ${pickField('Procedencia', 'procedencia', c.procedencia, [state.candidates.map((x) => x.procedencia), state.positions.map((x) => x.procedencia)])}
      ${preingresoFields(c)}
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
  `, { title: c.id ? c.nombre : 'Nuevo candidato', wide: true });

  const form = root.querySelector('#cand-form');
  // Fechas que mandan la etapa: se muestra al instante lo que la base va a aplicar.
  const HITO_CAMPOS = ['en_entrevista', 'validacion_rrll', 'epo', 'aptitud_recibida', 'aptitud', 'fecha_ingreso'];
  const hint = document.createElement('p');
  hint.className = 'note small field--wide';
  hint.hidden = true;
  form.querySelector('[name=stage]').closest('label').after(hint);
  form.addEventListener('change', (e) => {
    if (!HITO_CAMPOS.includes(e.target.name)) return;
    const sel = form.elements.stage;
    if (sel.value === 'cancelado') return;
    const v = (n) => form.elements[n]?.value || '';
    const hoy = todayISO();
    const sug = v('fecha_ingreso') ? (v('fecha_ingreso') <= hoy ? 'ingresado' : 'proximo_ingreso')
      : v('aptitud_recibida') && !/^no apto/i.test(v('aptitud')) ? 'apto'
      : v('epo') ? 'examen_medico'
      : v('validacion_rrll') ? 'validacion_rrll'
      : v('en_entrevista') ? 'entrevista' : null;
    if (sug && stageOrder(sug) > stageOrder(sel.value)) {
      sel.value = sug;
      hint.textContent = `La etapa pasa a "${state.stageMap[sug].label}" por la fecha cargada.${c._silla ? ' Se refleja en su silla.' : ''}`;
      hint.hidden = false;
    }
  });
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
    if (act === 'terna') { closeDrawer(); openAssignFromCandidate(c, { mode: 'terna' }); }
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
