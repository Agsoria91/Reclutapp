// Entrevistas › Centro de control (solo RRHH): recomendaciones para auditar y desempeño
// de cada entrevistador (entrevistados de su alcance, devoluciones, calidad y tiempos).
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { daysBetween } from '../lib/format.js';
import { mHead, mKpis, mTabs } from '../components/moderno.js';
import { mascot } from '../components/mascot.js';
import { stagePill } from '../components/ui.js';
import { puntajeGrupo, tieneEvaluacion, completa, enAlcance } from '../lib/evaluacion.js';
import { barraPuntaje, tarjetaEval } from '../components/evaluacion.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const prom = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

export function indicadoresEntrevistadores() {
  const evs = (state.evaluaciones || []).filter(tieneEvaluacion);
  const cById = new Map(state.candidates.map((c) => [c.id, c]));
  const filas = (state.entrevistadores || []).map((e) => {
    const propias = evs.filter((ev) => ev.evaluador_email === e.email);
    const conEval = new Set(propias.map((ev) => ev.candidate_id));
    const entrevistados = state.candidates.filter((c) => enAlcance(c, e) && c.en_entrevista);
    return fila(e.nombre || e.email, 'Entrevistador', [e.sectores, e.subsectores, e.yacimientos].filter((x) => x?.length).map((x) => x.join(', ')).join(' · '),
      propias, entrevistados.length, entrevistados.filter((c) => !conEval.has(c.id)).length, cById);
  });
  // RRHH (sin alcance: solo sus devoluciones)
  const rrhh = new Map();
  for (const ev of evs.filter((x) => x.rol === 'rrhh')) { const k = ev.evaluador_email || ev.evaluador; if (!rrhh.has(k)) rrhh.set(k, []); rrhh.get(k).push(ev); }
  for (const lista of rrhh.values()) filas.push(fila(lista[0].evaluador_nombre || 'RRHH', 'RRHH', '', lista, null, null, cById));
  return filas.sort((a, b) => (b.devoluciones - a.devoluciones) || a.nombre.localeCompare(b.nombre, 'es'));
}

function fila(nombre, rol, alcance, propias, entrevistados, sinDevolucion, cById) {
  const dias = propias.map((ev) => { const c = cById.get(ev.candidate_id); return c?.en_entrevista && ev.fecha >= c.en_entrevista ? daysBetween(c.en_entrevista, ev.fecha) : null; }).filter((d) => d != null);
  return {
    nombre, rol, alcance, entrevistados, sinDevolucion, devoluciones: propias.length,
    calidad: pct(propias.filter(completa).length, propias.length), p: puntajeGrupo(propias), dias: prom(dias),
    pendientes: propias.filter((ev) => ev.revision === 'pendiente').length,
    confirmadas: propias.filter((ev) => ev.revision === 'confirmada').length,
    noConfirmadas: propias.filter((ev) => ev.revision === 'desestimada').length,
  };
}

export const pendientesRevision = () => (state.evaluaciones || []).filter((ev) => ev.revision === 'pendiente');

export function renderControl(el, tab, tabs) {
  const pend = pendientesRevision().sort((a, b) => String(a.updated_at || a.fecha).localeCompare(String(b.updated_at || b.fecha)));
  const filas = indicadoresEntrevistadores();
  const cById = new Map(state.candidates.map((c) => [c.id, c]));
  const devol = filas.filter((f) => f.rol === 'Entrevistador').reduce((s, f) => s + f.devoluciones, 0);
  const sinDev = filas.reduce((s, f) => s + (f.sinDevolucion || 0), 0);

  el.innerHTML = String(html`
  ${mHead({ titulo: 'Entrevistas', sub: 'Centro de control' })}
  ${mKpis([
    { icono: 'reloj', label: 'Para revisar', valor: pend.length, id: 'cc-pend', tono: pend.length ? 'aviso' : '', sub: 'recomendaciones de entrevistadores' },
    { icono: 'usuarios', label: 'Entrevistadores', valor: (state.entrevistadores || []).length, id: 'cc-ent', sub: 'con usuario activo' },
    { icono: 'entrevistas', label: 'Devoluciones', valor: devol, id: 'cc-dev', tono: 'ok', sub: 'evaluaciones cargadas' },
    { icono: 'documento', label: 'Sin devolución', valor: sinDev, id: 'cc-sin', tono: sinDev ? 'alerta' : '', sub: 'entrevistados sin evaluación del entrevistador' },
  ])}
  ${mTabs('entrevistas', tabs, tab)}
  <div class="m-cuerpo">
    <section class="card"><h2 class="card-title">Recomendaciones para revisar <small class="muted">${pend.length}</small></h2>
      ${pend.length ? html`<div class="cc-revisar">${pend.map((ev) => { const c = cById.get(ev.candidate_id); return html`<div class="cc-item">
        <div class="cc-cand"><button type="button" class="link-btn" data-cc-cand="${ev.candidate_id}"><b>${c?.nombre || 'Candidato'}</b></button>
          <small class="muted block">${[c?.posicion, c?.subsector || c?.servicio, c?.area].filter(Boolean).join(' · ')}</small>${c ? stagePill(c.stage, { small: true }) : ''}</div>
        ${tarjetaEval(ev, { auditar: true })}</div>`; })}</div>`
      : html`<p class="muted">No hay recomendaciones pendientes.</p>`}
    </section>
    <section class="card"><h2 class="card-title">Desempeño por entrevistador</h2>
      ${filas.length ? html`<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Entrevistador</th><th class="num">Entrevistados</th><th class="num">Devoluciones</th><th class="num">Sin devolución</th><th class="num" title="Evaluaciones con las 4 habilidades, categoría y comentario">Calidad</th><th>Puntaje promedio</th><th class="num">Días de devolución</th><th class="num">Para revisar</th><th class="num hide-sm">Confirmadas</th><th class="num hide-sm">No confirmadas</th></tr></thead>
        <tbody>${filas.map((f) => html`<tr>
          <td><strong>${f.nombre}</strong><small class="muted block">${f.rol}${f.alcance ? ` · ${f.alcance}` : ''}</small></td>
          <td class="num">${f.entrevistados ?? '—'}</td><td class="num">${f.devoluciones}</td><td class="num">${f.sinDevolucion ?? '—'}</td>
          <td class="num">${f.calidad == null ? '—' : f.calidad + '%'}</td><td>${barraPuntaje(f.p, { chica: true })}</td>
          <td class="num">${f.dias ?? '—'}</td><td class="num">${f.pendientes}</td><td class="num hide-sm">${f.confirmadas}</td><td class="num hide-sm">${f.noConfirmadas}</td>
        </tr>`)}</tbody></table></div>`
      : mascot('empty', { compact: true, size: 110, text: 'Todavía no hay entrevistadores ni evaluaciones.' })}
    </section>
  </div>`);

  if (!el._ccBound) {
    el._ccBound = true;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cc-cand]');
      if (b) (await import('./candidatos.js')).openCandidate(b.dataset.ccCand, { pane: 'evaluacion' });
    });
  }
}

