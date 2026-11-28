// Mis entrevistas (rol Entrevistador): candidatos de su sector/yacimiento para entrevistar,
// su evaluación y la decisión de la entrevista. La base ya recorta la lista a su alcance
// y no envía DNI, teléfono, mail ni sueldo.
import { html } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, norm, todayISO } from '../lib/format.js';
import { openDrawer, closeDrawer, toast, confirmDialog, stagePill, animateIn } from '../components/ui.js';
import { mHead, mKpis } from '../components/moderno.js';
import { mascot } from '../components/mascot.js';
import { puntaje, armarEvaluacion, tieneEvaluacion } from '../lib/evaluacion.js';
import { evaluacionPane, leerEvaluacion, bindEvaluacion, guardarEvaluacion, barraPuntaje, decisionChip } from '../components/evaluacion.js';
import { MOTIVOS } from '../lib/motivos.js';

const ABIERTAS = new Set(['cv_recibido', 'entrevista']);
let vista = 'pend';
let buscar = '';
let alcance = null;

async function cargarAlcance(el) {
  const { data } = await sb.rpc('mi_entrevistador');
  alcance = data || {};
  render(el);
}

export function render(el) {
  if (!state.isEntrevistador) { el.innerHTML = String(mascot('empty', { title: 'Sin acceso', text: 'Esta sección es para entrevistadores.' })); return; }
  if (state.loading && !state.misEntrevistas.length) { el.innerHTML = String(mascot('loading')); return; }
  if (state.error) { el.innerHTML = String(mascot('error', { text: state.error })); return; }
  if (alcance === null) { alcance = {}; cargarAlcance(el); }

  const todos = state.misEntrevistas.map((c) => ({ c, ev: c.evaluacion, p: puntaje(c.evaluacion), hecha: tieneEvaluacion(c.evaluacion) }));
  const pend = todos.filter((x) => !x.hecha && ABIERTAS.has(x.c.stage));
  const hechas = todos.filter((x) => x.hecha);
  const aprob = hechas.filter((x) => x.ev?.decision === 'aprobado');
  let lista = vista === 'pend' ? pend : vista === 'ok' ? aprob : hechas;
  const q = norm(buscar);
  if (q) lista = lista.filter((x) => norm([x.c.nombre, x.c.area, x.c.servicio, x.c.posicion].join(' ')).includes(q));
  lista = vista === 'pend'
    ? [...lista].sort((a, b) => (a.c.en_entrevista || '9').localeCompare(b.c.en_entrevista || '9') || a.c.nombre.localeCompare(b.c.nombre, 'es'))
    : [...lista].sort((a, b) => String(b.ev?.fecha || '').localeCompare(String(a.ev?.fecha || '')));
  const sectores = [alcance?.sectores, alcance?.yacimientos?.length ? alcance.yacimientos : null, alcance?.puestos?.length ? alcance.puestos : null]
    .filter((x) => x?.length).map((x) => x.join(', ')).join(' · ');

  el.innerHTML = String(html`
  ${mHead({ titulo: 'Mis entrevistas', sub: sectores || ' ' })}
  ${mKpis([
    { icono: 'entrevistas', label: 'Por entrevistar', valor: pend.length, id: 'me-pend', attrs: 'data-mevista="pend"', sel: vista === 'pend', sub: 'de tu sector' },
    { icono: 'candidatos', label: 'Entrevistados', valor: hechas.length, id: 'me-hechas', attrs: 'data-mevista="hechas"', sel: vista === 'hechas', sub: 'con tu evaluación' },
    { icono: 'alta', label: 'Aprobados', valor: aprob.length, id: 'me-ok', tono: 'ok', attrs: 'data-mevista="ok"', sel: vista === 'ok', sub: 'entrevista aprobada' },
  ])}
  <section class="card">
    <header class="list-head ev-head"><input type="search" class="ev-buscar" placeholder="Buscar nombre o puesto" value="${buscar}" aria-label="Buscar"></header>
    ${lista.length ? html`<div class="table-wrap"><table class="tbl tbl--ev tbl--tarjetas">
      <thead><tr><th>Candidato</th><th>Etapa</th><th>Entrevista</th><th>Mi evaluación</th></tr></thead>
      <tbody>${lista.map(({ c, p, ev }) => html`<tr data-me-cand="${c.id}" tabindex="0">
        <td><strong>${c.nombre}</strong><small class="muted block">${[c.posicion, c.servicio, c.area].filter(Boolean).join(' · ')}</small></td>
        <td>${stagePill(c.stage, { small: true })}</td>
        <td>${c.en_entrevista ? fmtDate(c.en_entrevista) : html`<span class="muted">a coordinar</span>`}</td>
        <td>${barraPuntaje(p, { chica: true })}${decisionChip(ev?.decision)}</td>
      </tr>`)}</tbody></table></div>`
    : mascot('empty', { compact: true, size: 110, text: vista === 'pend' ? 'No tenés candidatos pendientes de entrevista.' : 'Todavía no hay entrevistas en esta vista.' })}
  </section>`);
  animateIn(el);

  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', (e) => {
      const v = e.target.closest('[data-mevista]');
      if (v) { vista = v.dataset.mevista; render(el); return; }
      const r = e.target.closest('[data-me-cand]');
      if (r) abrir(r.dataset.meCand);
    });
    el.addEventListener('keydown', (e) => { const r = e.target.closest?.('[data-me-cand]'); if (e.key === 'Enter' && r) abrir(r.dataset.meCand); });
    el.addEventListener('input', (e) => {
      if (!e.target.matches('.ev-buscar')) return;
      buscar = e.target.value; const pos = e.target.selectionStart;
      render(el);
      const i = el.querySelector('.ev-buscar'); i.focus(); i.setSelectionRange(pos, pos);
    });
  }
}

function abrir(id) {
  const c = state.misEntrevistas.find((x) => x.id === id);
  if (!c) return;
  const ev = c.evaluacion || null;
  const abierta = ABIERTAS.has(c.stage);
  const root = openDrawer(html`<form id="me-form" class="ficha-form">
    <dl class="me-datos">
      <div><dt>Puesto</dt><dd>${c.posicion || '—'}</dd></div>
      <div><dt>Sector</dt><dd>${c.servicio || '—'}</dd></div>
      <div><dt>Yacimiento</dt><dd>${c.area || '—'}</dd></div>
      <div><dt>Localidad</dt><dd>${c.localidad || '—'}</dd></div>
      <div><dt>Procedencia</dt><dd>${c.procedencia || '—'}</dd></div>
      <div><dt>Entrevista</dt><dd>${c.en_entrevista ? fmtDate(c.en_entrevista) : 'a coordinar'}</dd></div>
      <div><dt>Etapa</dt><dd>${stagePill(c.stage, { small: true })}</dd></div>
      ${c.cv_path ? html`<div><dt>CV</dt><dd><button type="button" class="btn btn--sm" data-act="cv">Ver CV</button></dd></div>` : ''}
    </dl>
    ${evaluacionPane(ev)}
    <fieldset class="ev-fila ev-fila--tags me-decision"><legend>Resultado de la entrevista</legend>
      ${abierta ? html`<div class="checks">
        <label class="check chip-check"><input type="radio" name="me_dec" value="" checked> Sin decidir todavía</label>
        <label class="check chip-check"><input type="radio" name="me_dec" value="aprobado"> Aprobar</label>
        <label class="check chip-check"><input type="radio" name="me_dec" value="rechazado"> Rechazar</label>
      </div>
      <label class="field me-motivo" hidden><span>Motivo del rechazo</span><select name="me_motivo">${MOTIVOS.map((m) => html`<option value="${m}">${m}</option>`)}</select></label>`
      : html`<p>${decisionChip(ev?.decision) || html`<span class="muted">El candidato ya avanzó en el proceso; RRHH continúa la gestión.</span>`}</p>`}
    </fieldset>
    <div class="form-actions ficha-acciones"><span class="spacer"></span>
      <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
      <button type="submit" class="btn btn--primary">Guardar</button>
    </div>
  </form>`, { title: c.nombre, wide: true });

  const form = root.querySelector('#me-form');
  bindEvaluacion(root, form);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'me_dec') root.querySelector('.me-motivo').hidden = e.target.value !== 'rechazado';
  });
  root.querySelector('[data-act="cv"]')?.addEventListener('click', async () => {
    const { data, error } = await sb.storage.from('cvs').createSignedUrl(c.cv_path, 120);
    if (error) return toast(error.message, 'error');
    window.open(data.signedUrl, '_blank', 'noopener');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fila = armarEvaluacion(leerEvaluacion(form), ev, { hoy: todayISO() });
    const dec = form.querySelector('input[name="me_dec"]:checked')?.value || '';
    if (dec && !tieneEvaluacion(fila === undefined ? ev : fila)) { toast('Completá la evaluación antes de aprobar o rechazar.', 'error'); return; }
    if (dec === 'rechazado' && !(await confirmDialog(`¿Rechazar a ${c.nombre}? Queda fuera del proceso para este puesto.`, { ok: 'Rechazar', danger: true }))) return;
    if (dec === 'aprobado' && !(await confirmDialog(`¿Aprobar la entrevista de ${c.nombre}? Pasa a "Entrevista aprobada" y RRHH sigue con el proceso.`, { ok: 'Aprobar' }))) return;
    const btn = e.submitter; btn.disabled = true;
    try {
      await guardarEvaluacion(sb, c.id, fila, ev);
      if (dec) {
        const { error } = await sb.rpc('entrevistador_decidir', { p_candidate: c.id, p_decision: dec, p_motivo: dec === 'rechazado' ? form.me_motivo.value : null });
        if (error) throw error;
      }
    } catch (err) { btn.disabled = false; toast(err.message || String(err), 'error'); return; }
    toast(dec === 'aprobado' ? 'Entrevista aprobada' : dec === 'rechazado' ? 'Candidato rechazado' : 'Evaluación guardada', 'ok');
    closeDrawer();
    await loadAll({ silent: true });
  });
}
