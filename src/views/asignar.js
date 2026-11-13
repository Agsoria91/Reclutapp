// "Sentar en una silla": vincula un candidato del pipeline con una posición.
// Se puede iniciar desde la ficha del candidato (elegir silla) o desde la
// silla (elegir candidato). Ambos terminan en la RPC assign_candidate.
import { html, $ } from '../lib/html.js';
import { state, loadAll, stageOrder } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, norm, todayISO } from '../lib/format.js';
import { sectorMatches, hasPerson } from '../lib/kpis.js';
import { stagePill, openDrawer, closeDrawer, toast, confirmDialog } from '../components/ui.js';
import { mascot } from '../components/mascot.js';

async function doAssign(cand, pos, force = false) {
  const { error } = await sb.rpc('assign_candidate', { p_candidate: cand.id, p_position: pos.id, p_force: force });
  if (error) {
    if (error.hint === 'ocupada' || /ocupada|asignado/.test(error.message)) {
      const ok = await confirmDialog(`${error.message}. ¿Reemplazarlo por ${cand.nombre}? La persona anterior queda sin silla.`, { ok: 'Reemplazar', danger: true });
      if (ok) return doAssign(cand, pos, true);
      return false;
    }
    toast(error.message, 'error');
    return false;
  }
  toast(`${cand.nombre} sentado en "${pos.puesto}" (${pos.yacimiento})`, 'ok', 4500);
  closeDrawer();
  await loadAll({ silent: true });
  return true;
}

async function doAddTerna(cand, pos) {
  const { error } = await sb.from('position_candidates').upsert(
    { position_id: pos.id, candidate_id: cand.id }, { onConflict: 'position_id,candidate_id', ignoreDuplicates: true });
  if (error) { toast(error.message, 'error'); return false; }
  toast(`${cand.nombre} sumado a la terna de "${pos.puesto}"`, 'ok', 4500);
  closeDrawer();
  await loadAll({ silent: true });
  return true;
}

const modeSwitch = (mode, id) => html`<div class="seg" role="radiogroup" aria-label="Qué hacer">
  <label class="seg-opt ${mode === 'principal' ? 'is-on' : ''}"><input type="radio" name="${id}" value="principal" ${mode === 'principal' ? html`checked` : ''}> Sentar como principal</label>
  <label class="seg-opt ${mode === 'terna' ? 'is-on' : ''}"><input type="radio" name="${id}" value="terna" ${mode === 'terna' ? html`checked` : ''}> Sumar a la terna</label>
</div>`;

// ---------------------------------------------------------------------------
// Desde un candidato -> elegir silla
// ---------------------------------------------------------------------------
export function openAssignFromCandidate(cand, { mode: initialMode = 'principal' } = {}) {
  let mode = initialMode;
  let q = '';
  let soloLibres = initialMode !== 'terna';
  let soloArea = !!cand.area;
  const today = todayISO();

  const list = () => {
    let rows = state.positions.filter((p) => p.stage !== 'ingresado' || p.candidate_id === cand.id);
    if (soloLibres) rows = rows.filter((p) => !hasPerson(p) || p.candidate_id === cand.id);
    if (soloArea && cand.area) rows = rows.filter((p) => p.yacimiento === cand.area);
    if (q) rows = rows.filter((p) => norm([p.puesto, p.sector, p.yacimiento, p.pos_sap, p.candidato_nombre].join(' ')).includes(norm(q)));
    // primero las del mismo sector/servicio y con fecha objetivo más próxima
    rows.sort((a, b) =>
      (sectorMatches(cand.servicio, b.sector) - sectorMatches(cand.servicio, a.sector)) ||
      (a.fecha_objetivo || '9999').localeCompare(b.fecha_objetivo || '9999') ||
      a.puesto.localeCompare(b.puesto, 'es', { numeric: true }));
    return rows;
  };

  const body = () => {
    const rows = list();
    return html`
      ${modeSwitch(mode, 'mode-c')}
      <p class="muted">${mode === 'terna' ? 'Elegí la silla a la que se suma' : 'Elegí la silla para'} <strong>${cand.nombre}</strong> ${stagePill(cand.stage, { small: true })}
        · ${[cand.area, cand.servicio, cand.posicion].filter(Boolean).join(' · ')}</p>
      ${stageOrder(cand.stage) < stageOrder('entrevista_aprobada') ? html`<p class="note">Todavía no tiene la entrevista aprobada. Podés sentarlo igual para reservar la silla.</p>` : ''}
      <div class="filters-row">
        <label class="search"><input type="search" id="as-q" placeholder="Buscar puesto, sector, POS SAP…" value="${q}"></label>
        <label class="check"><input type="checkbox" id="as-libres" ${soloLibres ? html`checked` : ''}> Solo sin principal</label>
        ${cand.area ? html`<label class="check"><input type="checkbox" id="as-area" ${soloArea ? html`checked` : ''}> Solo ${cand.area}</label>` : ''}
      </div>
      ${rows.length ? html`<ul class="pick-list">${rows.map((p) => html`<li>
        <button type="button" class="pick ${p.candidate_id === cand.id ? 'is-current' : ''}" data-pid="${p.id}">
          <span class="pick-main"><strong>${p.puesto}</strong>
            <small>${p.yacimiento} · ${p.sector || 'Sin sector'} ${p.pos_sap ? '· POS ' + p.pos_sap : ''} ${[p.diagrama, p.turno].filter(Boolean).length ? '· ' + [p.diagrama, p.turno].filter(Boolean).join(' ') : ''}</small></span>
          <span class="pick-side">
            ${hasPerson(p) ? html`<small>${p.candidato_nombre}</small>` : html`<small class="ok-txt">vacante</small>`}
            ${p.fecha_objetivo ? html`<small class="${p.fecha_objetivo < today ? 'is-late-txt' : 'muted'}">obj. ${fmtDate(p.fecha_objetivo)}</small>` : ''}
            ${sectorMatches(cand.servicio, p.sector) ? html`<span class="tag tag--match">mismo sector</span>` : ''}
            ${(p._terna || []).some((c) => c.id === cand.id) ? html`<span class="tag tag--terna">ya en terna</span>` : (p.cand_activos > 1 ? html`<span class="tag">${p.cand_activos} en terna</span>` : '')}
          </span>
        </button></li>`)}</ul>` : mascot('empty', { compact: true, size: 110, text: 'No hay sillas con estos filtros. Probá incluir las ocupadas u otras áreas.' })}`;
  };

  const root = openDrawer(html`<div id="as-body">${body()}</div>`, { title: 'Silla para el candidato', wide: true });
  const rerender = (focusId) => {
    const pos = $('#as-q', root)?.selectionStart;
    $('#as-body', root).innerHTML = String(body());
    if (focusId === 'as-q') { const i = $('#as-q', root); i.focus(); i.setSelectionRange(pos, pos); }
  };
  root.addEventListener('input', (e) => { if (e.target.id === 'as-q') { q = e.target.value; rerender('as-q'); } });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'as-libres') { soloLibres = e.target.checked; rerender(); }
    if (e.target.id === 'as-area') { soloArea = e.target.checked; rerender(); }
    if (e.target.name === 'mode-c') { mode = e.target.value; if (mode === 'terna') soloLibres = false; rerender(); }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pid]');
    if (!b) return;
    const pos = state.positions.find((p) => p.id === b.dataset.pid);
    if (mode === 'principal' && pos.candidate_id === cand.id) { toast('Ya está sentado en esa silla'); return; }
    b.disabled = true;
    if (mode === 'terna') await doAddTerna(cand, pos); else await doAssign(cand, pos);
    b.disabled = false;
  });
}

// ---------------------------------------------------------------------------
// Desde una silla -> elegir candidato
// ---------------------------------------------------------------------------
export function openAssignFromPosition(pos, { mode: initialMode = 'principal' } = {}) {
  let mode = initialMode;
  let q = '';
  let soloArea = true;
  let soloLibres = true;
  const list = () => {
    let rows = state.candidates.filter((c) => c.stage !== 'cancelado');
    if (soloArea) rows = rows.filter((c) => c.area === pos.yacimiento);
    if (soloLibres) rows = rows.filter((c) => !c._silla);
    if (mode === 'terna') rows = rows.filter((c) => !(pos._terna || []).some((t) => t.id === c.id));
    if (q) rows = rows.filter((c) => norm([c.nombre, c.posicion, c.servicio, c.localidad, c.procedencia].join(' ')).includes(norm(q)));
    rows.sort((a, b) =>
      (sectorMatches(b.servicio, pos.sector) - sectorMatches(a.servicio, pos.sector)) ||
      (stageOrder(b.stage) - stageOrder(a.stage)) || a.nombre.localeCompare(b.nombre, 'es'));
    return rows.slice(0, 200);
  };
  const body = () => {
    const rows = list();
    return html`
      ${modeSwitch(mode, 'mode-p')}
      <p class="muted">Silla: <strong>${pos.puesto}</strong> · ${pos.yacimiento} · ${pos.sector || ''} ${pos.candidato_nombre ? html`· hoy: <b>${pos.candidato_nombre}</b>` : ''}</p>
      <div class="filters-row">
        <label class="search"><input type="search" id="ap-q" placeholder="Buscar candidato…" value="${q}"></label>
        <label class="check"><input type="checkbox" id="ap-area" ${soloArea ? html`checked` : ''}> Solo ${pos.yacimiento}</label>
        <label class="check"><input type="checkbox" id="ap-libres" ${soloLibres ? html`checked` : ''}> Sin silla asignada</label>
      </div>
      ${rows.length ? html`<ul class="pick-list">${rows.map((c) => html`<li>
        <button type="button" class="pick" data-cid="${c.id}">
          <span class="pick-main"><strong>${c.nombre}</strong>
            <small>${[c.servicio, c.posicion, c.procedencia, c.localidad].filter(Boolean).join(' · ')}</small></span>
          <span class="pick-side">${stagePill(c.stage, { small: true })}
            ${c._silla ? html`<small>en: ${c._silla.puesto}</small>` : ''}
            ${sectorMatches(c.servicio, pos.sector) ? html`<span class="tag tag--match">mismo sector</span>` : ''}</span>
        </button></li>`)}</ul>` : mascot('empty', { compact: true, size: 110 })}`;
  };
  const root = openDrawer(html`<div id="ap-body">${body()}</div>`, { title: 'Candidato para la silla', wide: true });
  const rerender = (focus) => {
    const p = $('#ap-q', root)?.selectionStart;
    $('#ap-body', root).innerHTML = String(body());
    if (focus) { const i = $('#ap-q', root); i.focus(); i.setSelectionRange(p, p); }
  };
  root.addEventListener('input', (e) => { if (e.target.id === 'ap-q') { q = e.target.value; rerender(true); } });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'ap-area') { soloArea = e.target.checked; rerender(); }
    if (e.target.id === 'ap-libres') { soloLibres = e.target.checked; rerender(); }
    if (e.target.name === 'mode-p') { mode = e.target.value; rerender(); }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cid]');
    if (!b) return;
    const cand = state.candidates.find((c) => c.id === b.dataset.cid);
    b.disabled = true;
    if (mode === 'terna') await doAddTerna(cand, pos); else await doAssign(cand, pos);
    b.disabled = false;
  });
}
