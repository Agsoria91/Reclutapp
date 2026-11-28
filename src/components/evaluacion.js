// Pestaña "Evaluación" de la ficha: habilidades 1 a 5, puntaje en vivo, etiquetas y comentario.
import { html, raw } from '../lib/html.js';
import { CRITERIOS, ETIQUETAS, puntaje } from '../lib/evaluacion.js';
import { fmtDate } from '../lib/format.js';

export function barraPuntaje(p, { chica = false } = {}) {
  if (!p) return html`<span class="ev-sin">Sin evaluar</span>`;
  return html`<span class="ev-barra ev--${p.tono} ${chica ? 'ev-barra--chica' : ''}" title="${p.nivel} · ${p.calificados} de ${p.total} habilidades calificadas">
    <span class="ev-track"><span style="width:${p.pct}%"></span></span><b>${p.pct}%</b>${chica ? '' : html`<em>${p.nivel}</em>`}</span>`;
}

export function evaluacionPane(c) {
  const ev = c.evaluacion || {};
  return html`<div class="ev-pane">
    <div class="ev-total" data-ev-total>${barraPuntaje(puntaje(ev))}</div>
    ${ev.fecha ? html`<p class="ev-quien small muted" data-ev-por="${ev.por || ''}">Evaluado el ${fmtDate(ev.fecha)}</p>` : ''}
    <div class="ev-criterios">
      ${CRITERIOS.map(([k, label]) => html`<fieldset class="ev-fila"><legend>${label}</legend>
        <div class="ev-escala" role="radiogroup" aria-label="${label}">
          <label class="ev-op ev-op--nada"><input type="radio" name="ev_${k}" value="" ${raw(ev[k] ? '' : 'checked')}><span>–</span></label>
          ${[1, 2, 3, 4, 5].map((n) => html`<label class="ev-op"><input type="radio" name="ev_${k}" value="${n}" ${raw(ev[k] === n ? 'checked' : '')}><span>${n}</span></label>`)}
        </div></fieldset>`)}
    </div>
    <fieldset class="ev-fila ev-fila--tags"><legend>Observaciones rápidas</legend>
      <div class="checks">${ETIQUETAS.map((t) => html`<label class="check chip-check"><input type="checkbox" name="ev_tag" value="${t}" ${raw((ev.etiquetas || []).includes(t) ? 'checked' : '')}> ${t}</label>`)}</div>
    </fieldset>
    <label class="field field--wide"><span>Comentarios del entrevistador</span><textarea name="ev_comentario" rows="4">${ev.comentario || ''}</textarea></label>
  </div>`;
}

// Valores crudos del formulario (los radios no pasan bien por formData)
export function leerEvaluacion(form) {
  const v = Object.fromEntries(CRITERIOS.map(([k]) => [k, form.querySelector(`input[name="ev_${k}"]:checked`)?.value || null]));
  v.etiquetas = [...form.querySelectorAll('input[name="ev_tag"]:checked')].map((i) => i.value);
  v.comentario = form.querySelector('[name="ev_comentario"]')?.value || '';
  return v;
}

export function bindEvaluacion(root, form) {
  const total = root.querySelector('[data-ev-total]');
  if (!total) return;
  form.addEventListener('change', (e) => {
    if (!String(e.target.name || '').startsWith('ev_')) return;
    total.innerHTML = String(barraPuntaje(puntaje(leerEvaluacion(form))));
  });
  const quien = root.querySelector('[data-ev-por]');
  if (quien?.dataset.evPor) {
    import('../lib/supabase.js').then(({ sb }) => sb.rpc('nombre_de_usuario', { p_uid: quien.dataset.evPor }))
      .then(({ data }) => { if (data) quien.textContent += ` por ${data}`; }).catch(() => {});
  }
}
