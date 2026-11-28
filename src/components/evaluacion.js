// Evaluación de entrevista: formulario propio (habilidades 1 a 5, observaciones y comentario)
// y, para RRHH, las evaluaciones de los demás entrevistadores en modo lectura.
import { html, raw } from '../lib/html.js';
import { CRITERIOS, ETIQUETAS, puntaje, puntajeGrupo } from '../lib/evaluacion.js';
import { fmtDate } from '../lib/format.js';

export function barraPuntaje(p, { chica = false } = {}) {
  if (!p) return html`<span class="ev-sin">Sin evaluar</span>`;
  return html`<span class="ev-barra ev--${p.tono} ${chica ? 'ev-barra--chica' : ''}" title="${p.nivel}${p.varias ? ` · promedio de ${p.calificados} evaluaciones` : ''}">
    <span class="ev-track"><span style="width:${p.pct}%"></span></span><b>${p.pct}%</b>${chica ? '' : html`<em>${p.nivel}${p.varias ? ` · promedio de ${p.calificados}` : ''}</em>`}</span>`;
}

const DECISION = { aprobado: ['Aprobó la entrevista', 'ok'], rechazado: ['Rechazó', 'no'] };
export const decisionChip = (d) => (d && DECISION[d] ? html`<span class="ev-dec ev-dec--${DECISION[d][1]}">${DECISION[d][0]}</span>` : '');

// Evaluación de otra persona (solo lectura)
export function tarjetaEval(ev) {
  const p = puntaje(ev);
  return html`<article class="ev-otra">
    <header><b>${ev.evaluador_nombre || 'Entrevistador'}</b> <small class="muted">${ev.rol === 'rrhh' ? 'RRHH' : 'Entrevistador'} · ${fmtDate(ev.fecha)}</small>${decisionChip(ev.decision)}</header>
    ${barraPuntaje(p, { chica: true })}
    <p class="ev-notas small">${CRITERIOS.map(([k, l]) => html`<span>${l}: <b>${ev[k] || '–'}</b></span>`)}</p>
    ${(ev.etiquetas || []).length ? html`<p>${ev.etiquetas.map((t) => html`<span class="chip chip--sm">${t}</span>`)}</p>` : ''}
    ${ev.comentario ? html`<p class="ev-coment">${ev.comentario}</p>` : ''}
  </article>`;
}

export function evaluacionPane(mia, { otros = [], titulo = '' } = {}) {
  const ev = mia || {};
  const todas = [...otros, ...(mia ? [mia] : [])];
  return html`<div class="ev-pane">
    ${otros.length ? html`<section class="ev-otras">
      <div class="ev-total">${barraPuntaje(puntajeGrupo(todas))}</div>
      ${otros.map(tarjetaEval)}
    </section>` : ''}
    ${titulo ? html`<h3 class="ev-tit">${titulo}</h3>` : ''}
    <div class="ev-total" data-ev-total>${barraPuntaje(puntaje(ev))}</div>
    ${ev.fecha ? html`<p class="ev-quien small muted">Última actualización: ${fmtDate(ev.fecha)}</p>` : ''}
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
}

// Guarda (o borra) la evaluación propia. Devuelve true si hubo cambios.
export async function guardarEvaluacion(sb, candidateId, fila, previa) {
  if (fila === undefined || fila?.sinCambios) return false;
  if (fila === null) {
    const { error } = await sb.from('evaluaciones').delete().eq('id', previa.id);
    if (error) throw error;
    return true;
  }
  const datos = { actitud: fila.actitud, tecnico: fila.tecnico, experiencia: fila.experiencia, seguridad: fila.seguridad, etiquetas: fila.etiquetas, comentario: fila.comentario, fecha: fila.fecha };
  const { error } = previa?.id
    ? await sb.from('evaluaciones').update(datos).eq('id', previa.id)
    : await sb.from('evaluaciones').insert({ ...datos, candidate_id: candidateId });
  if (error) throw error;
  return true;
}
