// Agenda de la semana (solo RRHH): entrevistas, exámenes médicos, interconsultas,
// ingresos y fin de plazos fijos, armada con las fechas ya cargadas.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { todayISO } from '../lib/format.js';
import { animateIn, loadLocal, saveLocal } from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { mHead } from '../components/moderno.js';
import { clinicaCanon } from '../components/examen.js';

const TIPOS = [
  ['entrevista', 'Entrevista'], ['examen', 'Examen médico'], ['interconsulta', 'Interconsulta'],
  ['ingreso', 'Ingreso'], ['plazo', 'Fin de plazo fijo'],
];
let semana = 0; // 0 = esta semana; -1 anterior; +1 siguiente
let ocultos = new Set(loadLocal('reclutapp.agenda.ocultos', []));

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const iso = (d) => d.toISOString().slice(0, 10);
function lunes(offset) {
  const d = new Date(todayISO() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + offset * 7);
  return d;
}
const masDias = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const dm = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
const lugar = (c) => [c.area, c.servicio].filter(Boolean).join(' · ');

function eventos(desde, hasta) {
  const ev = [];
  const en = (f) => f && f >= desde && f <= hasta;
  for (const c of state.candidates) {
    if (c.stage === 'cancelado') continue;
    if (en(c.en_entrevista)) ev.push({ tipo: 'entrevista', fecha: c.en_entrevista, nombre: c.nombre, sub: [lugar(c), c.posicion].filter(Boolean).join(' · '), cand: c.id });
    if (en(c.epo)) ev.push({ tipo: 'examen', fecha: c.epo, nombre: c.nombre, sub: [clinicaCanon(c.clinica), c.clinica_localidad].filter(Boolean).join(' · ') || lugar(c), cand: c.id });
    if (en(c.interconsulta)) ev.push({ tipo: 'interconsulta', fecha: c.interconsulta, nombre: c.nombre, sub: c.interconsulta_obs || lugar(c), cand: c.id });
    if (en(c.fecha_ingreso) && ['proximo_ingreso', 'ingresado'].includes(c.stage)) ev.push({ tipo: 'ingreso', fecha: c.fecha_ingreso, nombre: c.nombre, sub: c._silla ? `${c._silla.puesto} · ${c._silla.yacimiento}` : lugar(c), cand: c.id });
  }
  for (const n of state.nomina) {
    if (n.estado === 'activo' && en(n.fin_pf)) ev.push({ tipo: 'plazo', fecha: n.fin_pf, nombre: n.nombre, sub: [n.yacimiento, n.sector].filter(Boolean).join(' · '), nom: n.id });
  }
  return ev.sort((a, b) => TIPOS.findIndex(([t]) => t === a.tipo) - TIPOS.findIndex(([t]) => t === b.tipo) || a.nombre.localeCompare(b.nombre, 'es'));
}

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'La agenda requiere iniciar sesión con un usuario de RRHH.' })); return; }
  if (state.loading && !state.candidates.length) { el.innerHTML = String(mascot('loading')); return; }
  const l = lunes(semana);
  const dias = Array.from({ length: 7 }, (_, i) => iso(masDias(l, i)));
  const todos = eventos(dias[0], dias[6]);
  const visibles = todos.filter((e) => !ocultos.has(e.tipo));
  const porDia = new Map(dias.map((d) => [d, visibles.filter((e) => e.fecha === d)]));
  // fin de semana solo si tiene algo
  const mostrar = dias.filter((d, i) => i < 5 || porDia.get(d).length);
  const hoy = todayISO();
  const cuenta = Object.fromEntries(TIPOS.map(([t]) => [t, todos.filter((e) => e.tipo === t).length]));
  const titulo = semana === 0 ? 'Esta semana' : semana === 1 ? 'Semana próxima' : semana === -1 ? 'Semana pasada' : `Semana del ${dm(dias[0])}`;

  el.innerHTML = String(html`
  ${mHead({ titulo: 'Agenda', sub: `${titulo} · ${dm(dias[0])} al ${dm(dias[4])} · ${visibles.length} ${visibles.length === 1 ? 'evento' : 'eventos'}`, acciones: html`
    <div class="ag-nav">
      <button type="button" class="btn btn--ghost" data-sem="-1" aria-label="Semana anterior">←</button>
      <button type="button" class="btn ${semana === 0 ? 'btn--primary' : 'btn--ghost'}" data-sem="0">Esta semana</button>
      <button type="button" class="btn btn--ghost" data-sem="1" aria-label="Semana siguiente">→</button>
    </div>` })}
  <div class="ag-tipos" role="group" aria-label="Tipos de evento">${TIPOS.map(([t, l]) => html`<button type="button" class="ag-tipo ag--${t} ${ocultos.has(t) ? 'is-off' : ''}" data-tipo="${t}" aria-pressed="${!ocultos.has(t)}"><i aria-hidden="true"></i>${l} <span>${cuenta[t]}</span></button>`)}</div>
  <section class="ag-semana" style="--cols:${mostrar.length}">
    ${mostrar.map((d) => { const xs = porDia.get(d); const i = dias.indexOf(d); return html`<div class="ag-dia ${d === hoy ? 'is-hoy' : ''} ${d < hoy ? 'is-pasado' : ''}">
      <header><b>${DIAS[i]}</b><span>${dm(d)}</span>${d === hoy ? html`<em>hoy</em>` : ''}</header>
      ${xs.length ? xs.map((e) => html`<button type="button" class="ag-ev ag--${e.tipo}" ${e.cand ? html`data-cand="${e.cand}"` : html`data-nom="${e.nom}"`}>
          <small>${TIPOS.find(([t]) => t === e.tipo)[1]}</small><b>${e.nombre}</b>${e.sub ? html`<span>${e.sub}</span>` : ''}</button>`)
        : html`<p class="ag-vacio">Sin eventos</p>`}
    </div>`; })}
  </section>`);
  animateIn(el);

  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', async (e) => {
      const s = e.target.closest('[data-sem]');
      if (s) { semana = s.dataset.sem === '0' ? 0 : semana + Number(s.dataset.sem); render(el); return; }
      const t = e.target.closest('[data-tipo]');
      if (t) { const k = t.dataset.tipo; if (ocultos.has(k)) ocultos.delete(k); else ocultos.add(k); saveLocal('reclutapp.agenda.ocultos', [...ocultos]); render(el); return; }
      const c = e.target.closest('[data-cand]');
      if (c) { (await import('./candidatos.js')).openCandidate(c.dataset.cand); return; }
      const n = e.target.closest('[data-nom]');
      if (n) (await import('./nomina.js')).abrirPersona(n.dataset.nom);
    });
  }
}
