// Mis entrevistas (rol Entrevistador): candidatos de su sector, especialidad y yacimiento.
// Pendientes de entrevista + historial de todos los entrevistados de su alcance (aunque no tengan
// resultado cargado). La recomendación queda pendiente hasta que RRHH la confirma.
// La base ya recorta la lista y no envía DNI, teléfono, mail ni sueldo.
import { html } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, norm, todayISO } from '../lib/format.js';
import { openDrawer, closeDrawer, toast, confirmDialog, stagePill, animateIn } from '../components/ui.js';
import { mHead, mKpis } from '../components/moderno.js';
import { mascot } from '../components/mascot.js';
import { puntaje, armarEvaluacion, tieneEvaluacion } from '../lib/evaluacion.js';
import { evaluacionPane, leerEvaluacion, bindEvaluacion, guardarEvaluacion, barraPuntaje, decisionChip, revisionChip } from '../components/evaluacion.js';

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
  const hist = todos.filter((x) => !pend.includes(x));
  const revisar = todos.filter((x) => x.ev?.revision === 'pendiente');
  let lista = vista === 'pend' ? pend : vista === 'rev' ? revisar : hist;
  const q = norm(buscar);
  if (q) lista = lista.filter((x) => norm([x.c.nombre, x.c.area, x.c.servicio, x.c.subsector, x.c.posicion].join(' ')).includes(q));
  lista = vista === 'pend'
    ? [...lista].sort((a, b) => (a.c.en_entrevista || '9').localeCompare(b.c.en_entrevista || '9') || a.c.nombre.localeCompare(b.c.nombre, 'es'))
    : [...lista].sort((a, b) => String(b.ev?.fecha || b.c.en_entrevista || '').localeCompare(String(a.ev?.fecha || a.c.en_entrevista || '')));
  const sub = [alcance?.sectores, alcance?.subsectores, alcance?.yacimientos, alcance?.puestos].filter((x) => x?.length).map((x) => x.join(', ')).join(' · ');

  el.innerHTML = String(html`
  ${mHead({ titulo: 'Mis entrevistas', sub: sub || ' ' })}
  ${mKpis([
    { icono: 'entrevistas', label: 'Por entrevistar', valor: pend.length, id: 'me-pend', attrs: 'data-mevista="pend"', sel: vista === 'pend', sub: 'sin evaluación' },
    { icono: 'candidatos', label: 'Historial', valor: hist.length, id: 'me-hist', attrs: 'data-mevista="hist"', sel: vista === 'hist', sub: `${hist.filter((x) => x.hecha).length} con mi devolución` },
    { icono: 'reloj', label: 'Pendientes de RRHH', valor: revisar.length, id: 'me-rev', tono: revisar.length ? 'aviso' : '', attrs: 'data-mevista="rev"', sel: vista === 'rev', sub: 'recomendaciones a confirmar' },
  ])}
  <section class="card">
    <header class="list-head ev-head"><input type="search" class="ev-buscar" placeholder="Buscar nombre o puesto" value="${buscar}" aria-label="Buscar"></header>
    ${lista.length ? html`<div class="table-wrap"><table class="tbl tbl--ev tbl--tarjetas">
      <thead><tr><th>Candidato</th><th>Etapa</th><th>Entrevista</th><th>Mi evaluación</th></tr></thead>
      <tbody>${lista.map(({ c, p, ev, hecha }) => html`<tr data-me-cand="${c.id}" tabindex="0">
        <td><strong>${c.nombre}</strong><small class="muted block">${[c.posicion, c.subsector || c.servicio, c.area].filter(Boolean).join(' · ')}</small></td>
        <td>${stagePill(c.stage, { small: true })}</td>
        <td>${c.en_entrevista ? fmtDate(c.en_entrevista) : html`<span class="muted">a coordinar</span>`}</td>
        <td>${hecha ? html`${barraPuntaje(p, { chica: true })}${decisionChip(ev?.decision)}${revisionChip(ev?.revision)}` : html`<span class="ev-sin">${ABIERTAS.has(c.stage) ? 'Sin evaluar' : 'Sin resultado cargado'}</span>`}</td>
      </tr>`)}</tbody></table></div>`
    : mascot('empty', { compact: true, size: 110, text: vista === 'pend' ? 'No tenés candidatos pendientes de entrevista.' : 'No hay candidatos en esta vista.' })}
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
      <div><dt>Sector</dt><dd>${[c.servicio, c.subsector].filter(Boolean).join(' · ') || '—'}</dd></div>
      <div><dt>Yacimiento</dt><dd>${c.area || '—'}</dd></div>
      <div><dt>Localidad</dt><dd>${c.localidad || '—'}</dd></div>
      <div><dt>Procedencia</dt><dd>${c.procedencia || '—'}</dd></div>
      <div><dt>Entrevista</dt><dd>${c.en_entrevista ? fmtDate(c.en_entrevista) : 'a coordinar'}</dd></div>
      <div><dt>Etapa</dt><dd>${stagePill(c.stage, { small: true })}</dd></div>
      ${c.cv_path ? html`<div><dt>CV</dt><dd><button type="button" class="btn btn--sm" data-act="cv">Ver CV</button></dd></div>` : ''}
    </dl>
    ${evaluacionPane(ev, { recomendar: true, puedeRecomendar: abierta })}
    <div class="form-actions ficha-acciones"><span class="spacer"></span>
      <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
      <button type="submit" class="btn btn--primary">Guardar</button>
    </div>
  </form>`, { title: c.nombre, wide: true });

  const form = root.querySelector('#me-form');
  bindEvaluacion(root, form);
  root.querySelector('[data-act="cv"]')?.addEventListener('click', async () => {
    const { data, error } = await sb.storage.from('cvs').createSignedUrl(c.cv_path, 120);
    if (error) return toast(error.message, 'error');
    window.open(data.signedUrl, '_blank', 'noopener');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const valores = leerEvaluacion(form);
    const fila = armarEvaluacion(valores, ev, { hoy: todayISO() });
    const nueva = valores.decision && valores.decision !== ev?.decision;
    if (nueva && !(await confirmDialog(`${valores.decision === 'rechazado' ? '¿Recomendar no continuar' : '¿Recomendar avanzar'} con ${c.nombre}? RRHH recibe el aviso y confirma el resultado.`, { ok: 'Enviar a RRHH' }))) return;
    const btn = e.submitter; btn.disabled = true;
    try { await guardarEvaluacion(sb, c.id, fila, ev); } catch (err) { btn.disabled = false; toast(err.message || String(err), 'error'); return; }
    toast(nueva ? 'Recomendación enviada a RRHH' : 'Evaluación guardada', 'ok');
    closeDrawer();
    await loadAll({ silent: true });
  });
}
