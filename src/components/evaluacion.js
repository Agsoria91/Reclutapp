// Evaluación de entrevista: formulario propio (habilidades 1 a 5, observaciones, categoría sugerida,
// recomendación y comentario) y, para RRHH, las evaluaciones de los demás con su auditoría.
import { html, raw } from '../lib/html.js';
import { CRITERIOS, ETIQUETAS, CATEGORIAS, puntaje, puntajeGrupo } from '../lib/evaluacion.js';
import { MOTIVOS } from '../lib/motivos.js';
import { fmtDate } from '../lib/format.js';

export function barraPuntaje(p, { chica = false } = {}) {
  if (!p) return html`<span class="ev-sin">Sin evaluar</span>`;
  return html`<span class="ev-barra ev--${p.tono} ${chica ? 'ev-barra--chica' : ''}" title="${p.nivel}${p.varias ? ` · promedio de ${p.calificados} evaluaciones` : ''}">
    <span class="ev-track"><span style="width:${p.pct}%"></span></span><b>${p.pct}%</b>${chica ? '' : html`<em>${p.nivel}${p.varias ? ` · promedio de ${p.calificados}` : ''}</em>`}</span>`;
}

const DECISION = { aprobado: ['Recomienda avanzar', 'ok'], rechazado: ['Recomienda no continuar', 'no'] };
export const decisionChip = (d) => (d && DECISION[d] ? html`<span class="ev-dec ev-dec--${DECISION[d][1]}">${DECISION[d][0]}</span>` : '');
const REVISION = { pendiente: ['Pendiente de RRHH', 'pend'], confirmada: ['Confirmado por RRHH', 'ok'], desestimada: ['No confirmado por RRHH', 'no'] };
export const revisionChip = (r) => (r && REVISION[r] ? html`<span class="ev-rev ev-rev--${REVISION[r][1]}">${REVISION[r][0]}</span>` : '');

// Evaluación de otra persona (solo lectura; RRHH puede auditar la recomendación)
export function tarjetaEval(ev, { auditar = false } = {}) {
  const p = puntaje(ev);
  return html`<article class="ev-otra">
    <header><b>${ev.evaluador_nombre || 'Entrevistador'}</b> <small class="muted">${ev.rol === 'rrhh' ? 'RRHH' : 'Entrevistador'} · ${fmtDate(ev.fecha)}</small>${decisionChip(ev.decision)}${revisionChip(ev.revision)}</header>
    ${barraPuntaje(p, { chica: true })}
    <p class="ev-notas small">${CRITERIOS.map(([k, l]) => html`<span>${l}: <b>${ev[k] || '–'}</b></span>`)}</p>
    ${ev.categoria_sugerida || ev.motivo ? html`<p class="ev-notas small">${ev.categoria_sugerida ? html`<span>Categoría sugerida: <b>${ev.categoria_sugerida}</b></span>` : ''}${ev.motivo ? html`<span>Motivo: <b>${ev.motivo}</b></span>` : ''}</p>` : ''}
    ${(ev.etiquetas || []).length ? html`<p>${ev.etiquetas.map((t) => html`<span class="chip chip--sm">${t}</span>`)}</p>` : ''}
    ${ev.comentario ? html`<p class="ev-coment">${ev.comentario}</p>` : ''}
    ${ev.revisado_nombre ? html`<p class="small muted">Revisó ${ev.revisado_nombre}${ev.revisado_at ? ` el ${fmtDate(String(ev.revisado_at).slice(0, 10))}` : ''}</p>` : ''}
    ${auditar && ev.revision === 'pendiente' ? html`<div class="ev-auditar">
      <button type="button" class="btn btn--primary btn--sm" data-ev-revisar="confirmada" data-ev-id="${ev.id}">${ev.decision === 'rechazado' ? 'Confirmar y cancelar candidato' : 'Confirmar y avanzar'}</button>
      <button type="button" class="btn btn--sm" data-ev-revisar="desestimada" data-ev-id="${ev.id}">No confirmar</button></div>` : ''}
  </article>`;
}

// Formulario de la evaluación propia. recomendar: muestra la recomendación (entrevistador).
export function evaluacionPane(mia, { otros = [], titulo = '', recomendar = false, puedeRecomendar = true } = {}) {
  const ev = mia || {};
  const todas = [...otros, ...(mia ? [mia] : [])];
  const bloqueada = ev.revision === 'confirmada' || ev.revision === 'desestimada';
  return html`<div class="ev-pane">
    ${otros.length ? html`<section class="ev-otras">
      <div class="ev-total">${barraPuntaje(puntajeGrupo(todas))}</div>
      ${otros.map((o) => tarjetaEval(o, { auditar: true }))}
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
    <fieldset class="ev-fila ev-fila--tags"><legend>Categoría sugerida (convenio de petroleros)</legend>
      <div class="checks">
        <label class="check chip-check"><input type="radio" name="ev_cat" value="" ${raw(ev.categoria_sugerida ? '' : 'checked')}> Sin sugerir</label>
        ${CATEGORIAS.map((t) => html`<label class="check chip-check"><input type="radio" name="ev_cat" value="${t}" ${raw(ev.categoria_sugerida === t ? 'checked' : '')}> ${t}</label>`)}</div>
    </fieldset>
    <label class="field field--wide"><span>Comentarios del entrevistador</span><textarea name="ev_comentario" rows="4">${ev.comentario || ''}</textarea></label>
    ${recomendar ? html`<fieldset class="ev-fila ev-fila--tags me-decision"><legend>Recomendación</legend>
      ${puedeRecomendar && !bloqueada ? html`<div class="checks">
        <label class="check chip-check"><input type="radio" name="ev_dec" value="" ${raw(ev.decision ? '' : 'checked')}> Sin recomendación</label>
        <label class="check chip-check"><input type="radio" name="ev_dec" value="aprobado" ${raw(ev.decision === 'aprobado' ? 'checked' : '')}> Avanzar</label>
        <label class="check chip-check"><input type="radio" name="ev_dec" value="rechazado" ${raw(ev.decision === 'rechazado' ? 'checked' : '')}> No continuar</label>
      </div>
      <label class="field me-motivo" ${raw(ev.decision === 'rechazado' ? '' : 'hidden')}><span>Motivo</span><select name="ev_motivo">${MOTIVOS.map((m) => html`<option value="${m}" ${raw(ev.motivo === m ? 'selected' : '')}>${m}</option>`)}</select></label>
      ${revisionChip(ev.revision)}`
      : html`<p>${decisionChip(ev.decision)}${revisionChip(ev.revision)}${!ev.decision ? html`<span class="muted">Sin recomendación</span>` : ''}</p>`}
    </fieldset>` : ''}
  </div>`;
}

// Valores crudos del formulario (los radios no pasan bien por formData)
export function leerEvaluacion(form) {
  const v = Object.fromEntries(CRITERIOS.map(([k]) => [k, form.querySelector(`input[name="ev_${k}"]:checked`)?.value || null]));
  v.etiquetas = [...form.querySelectorAll('input[name="ev_tag"]:checked')].map((i) => i.value);
  v.comentario = form.querySelector('[name="ev_comentario"]')?.value || '';
  v.categoria_sugerida = form.querySelector('input[name="ev_cat"]:checked')?.value || null;
  const dec = form.querySelector('input[name="ev_dec"]:checked');
  if (dec) { v.decision = dec.value || null; v.motivo = v.decision === 'rechazado' ? form.querySelector('[name="ev_motivo"]')?.value || null : null; }
  return v;
}

export function bindEvaluacion(root, form) {
  const total = root.querySelector('[data-ev-total]');
  if (!total) return;
  form.addEventListener('change', (e) => {
    if (e.target.name === 'ev_dec') { const m = root.querySelector('.me-motivo'); if (m) m.hidden = e.target.value !== 'rechazado'; }
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
  const datos = { actitud: fila.actitud, tecnico: fila.tecnico, experiencia: fila.experiencia, seguridad: fila.seguridad, etiquetas: fila.etiquetas, comentario: fila.comentario, categoria_sugerida: fila.categoria_sugerida, fecha: fila.fecha };
  if ('decision' in fila) { datos.decision = fila.decision; datos.motivo = fila.motivo; }
  const { error } = previa?.id
    ? await sb.from('evaluaciones').update(datos).eq('id', previa.id)
    : await sb.from('evaluaciones').insert({ ...datos, candidate_id: candidateId });
  if (error) throw error;
  return true;
}
