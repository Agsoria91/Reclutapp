// Entrevistas › Evaluaciones (solo RRHH): quiénes faltan entrevistar y cómo salieron los evaluados.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { fmtDate, norm } from '../lib/format.js';
import { stagePill } from '../components/ui.js';
import { mHead, mKpis, mTabs } from '../components/moderno.js';
import { mascot } from '../components/mascot.js';
import { puntaje, tieneEvaluacion, ETIQUETAS } from '../lib/evaluacion.js';
import { barraPuntaje } from '../components/evaluacion.js';

const POR_ENTREVISTAR = new Set(['cv_recibido', 'entrevista']);
let vista = 'pend';
let etiqueta = null;
let buscar = '';

export function elegirVistaEval(v) { vista = v; }

function filas() {
  const base = state.candidates.filter((c) => c.stage !== 'cancelado' || tieneEvaluacion(c.evaluacion))
    .map((c) => ({ c, p: puntaje(c.evaluacion), ev: tieneEvaluacion(c.evaluacion) }));
  const pend = base.filter((x) => !x.ev && POR_ENTREVISTAR.has(x.c.stage));
  const eval_ = base.filter((x) => x.ev);
  const dest = eval_.filter((x) => x.p && x.p.pct >= 80);
  return { pend, eval_, dest };
}

export function renderEvaluaciones(el, tab, tabs) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Iniciá sesión con un usuario de RRHH.' })); return; }
  const { pend, eval_, dest } = filas();
  let lista = vista === 'pend' ? pend : vista === 'dest' ? dest : eval_;
  if (etiqueta && vista !== 'pend') lista = lista.filter((x) => (x.c.evaluacion?.etiquetas || []).includes(etiqueta));
  const q = norm(buscar);
  if (q) lista = lista.filter((x) => norm([x.c.nombre, x.c.area, x.c.servicio, x.c.posicion].join(' ')).includes(q));
  lista = vista === 'pend'
    ? [...lista].sort((a, b) => (a.c.en_entrevista || a.c.cv_recibido || '9').localeCompare(b.c.en_entrevista || b.c.cv_recibido || '9'))
    : [...lista].sort((a, b) => (b.p?.pct ?? -1) - (a.p?.pct ?? -1) || a.c.nombre.localeCompare(b.c.nombre, 'es'));
  const prom = eval_.filter((x) => x.p).length ? Math.round(eval_.filter((x) => x.p).reduce((s, x) => s + x.p.pct, 0) / eval_.filter((x) => x.p).length) : 0;
  const conEtq = (t) => eval_.filter((x) => (x.c.evaluacion?.etiquetas || []).includes(t)).length;

  el.innerHTML = String(html`
  ${mHead({ titulo: 'Entrevistas', sub: `${pend.length} por entrevistar · ${eval_.length} evaluados` })}
  ${mKpis([
    { icono: 'entrevistas', label: 'Por entrevistar', valor: pend.length, id: 'ev-pend', attrs: 'data-evvista="pend"', sel: vista === 'pend', sub: 'CV recibido o en entrevista, sin evaluar' },
    { icono: 'candidatos', label: 'Evaluados', valor: eval_.length, id: 'ev-ok', attrs: 'data-evvista="eval"', sel: vista === 'eval', sub: `puntaje promedio ${prom}%` },
    { icono: 'alta', label: 'Destacados', valor: dest.length, id: 'ev-dest', tono: 'ok', attrs: 'data-evvista="dest"', sel: vista === 'dest', sub: '80 % o más' },
  ])}
  ${mTabs('entrevistas', tabs, tab)}
  <div class="m-cuerpo"><section class="card">
    <header class="list-head ev-head">
      <input type="search" class="ev-buscar" placeholder="Buscar nombre, área o puesto" value="${buscar}" aria-label="Buscar">
      ${vista !== 'pend' ? html`<div class="ev-etqs">${ETIQUETAS.map((t) => { const n = conEtq(t); return n ? html`<button type="button" class="chip ${etiqueta === t ? 'is-on' : ''}" data-evetq="${t}" aria-pressed="${etiqueta === t}">${t} <small>${n}</small></button>` : ''; })}</div>` : ''}
    </header>
    ${lista.length ? html`<div class="table-wrap"><table class="tbl tbl--ev">
      <thead><tr><th>Candidato</th><th>Etapa</th><th class="hide-sm">${vista === 'pend' ? 'Entrevista' : 'Evaluado'}</th><th>Puntaje</th><th class="hide-sm">Observaciones</th></tr></thead>
      <tbody>${lista.map(({ c, p }) => html`<tr data-ev-cand="${c.id}" tabindex="0">
        <td><strong>${c.nombre}</strong><small class="muted block">${[c.area, c.servicio, c.posicion].filter(Boolean).join(' · ')}</small></td>
        <td>${stagePill(c.stage, { small: true })}</td>
        <td class="hide-sm">${vista === 'pend' ? (c.en_entrevista ? fmtDate(c.en_entrevista) : html`<span class="muted">a coordinar</span>`) : fmtDate(c.evaluacion?.fecha)}</td>
        <td>${barraPuntaje(p, { chica: true })}</td>
        <td class="hide-sm">${(c.evaluacion?.etiquetas || []).map((t) => html`<span class="chip chip--sm">${t}</span>`)}</td>
      </tr>`)}</tbody></table></div>`
    : mascot('empty', { compact: true, size: 110, text: vista === 'pend' ? 'No hay candidatos pendientes de entrevista.' : 'Todavía no hay evaluaciones.' })}
  </section></div>`);

  if (!el._evBound) {
    el._evBound = true;
    const abrir = async (id) => (await import('./candidatos.js')).openCandidate(id, { pane: 'evaluacion' });
    el.addEventListener('click', (e) => {
      if (!el.querySelector('.tbl--ev, .ev-head')) return;
      const v = e.target.closest('[data-evvista]');
      if (v) { vista = v.dataset.evvista; etiqueta = null; renderEvaluaciones(el, tab, tabs); return; }
      const t = e.target.closest('[data-evetq]');
      if (t) { etiqueta = etiqueta === t.dataset.evetq ? null : t.dataset.evetq; renderEvaluaciones(el, tab, tabs); return; }
      const r = e.target.closest('[data-ev-cand]');
      if (r) abrir(r.dataset.evCand);
    });
    el.addEventListener('keydown', (e) => { const r = e.target.closest?.('[data-ev-cand]'); if (e.key === 'Enter' && r) abrir(r.dataset.evCand); });
    el.addEventListener('input', (e) => {
      if (!e.target.matches('.ev-buscar')) return;
      buscar = e.target.value; const pos = e.target.selectionStart;
      renderEvaluaciones(el, tab, tabs);
      const i = el.querySelector('.ev-buscar'); i.focus(); i.setSelectionRange(pos, pos);
    });
  }
}
