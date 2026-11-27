// Agenda (solo RRHH): vista de mes o de semana con entrevistas, exámenes médicos,
// interconsultas, ingresos y fin de plazos fijos, armada con las fechas ya cargadas.
// Marca feriados nacionales y días no laborables.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { todayISO } from '../lib/format.js';
import { animateIn, loadLocal, saveLocal } from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { mHead } from '../components/moderno.js';
import { clinicaCanon } from '../components/examen.js';
import { feriado } from '../data/feriados.js';

const TIPOS = [
  ['entrevista', 'Entrevista'], ['examen', 'Examen médico'], ['interconsulta', 'Interconsulta'],
  ['ingreso', 'Ingreso'], ['plazo', 'Fin de plazo fijo'],
];
let semana = 0; // 0 = esta semana; -1 anterior; +1 siguiente
let mes = 0;    // 0 = este mes
let vista = loadLocal('reclutapp.agenda.vista', 'mes');
let diaSel = null;
let ocultos = new Set(loadLocal('reclutapp.agenda.ocultos', []));

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const PLURAL = { entrevista: ['entrevista', 'entrevistas'], examen: ['examen', 'exámenes'], interconsulta: ['interconsulta', 'interconsultas'], ingreso: ['ingreso', 'ingresos'], plazo: ['plazo fijo', 'plazos fijos'] };
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

function primeroDelMes(offset) {
  const [y, m] = todayISO().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1));
}
const nombreTipo = (t) => TIPOS.find(([k]) => k === t)[1];

function eventoHtml(e) {
  return html`<button type="button" class="ag-ev ag--${e.tipo}" ${e.cand ? html`data-cand="${e.cand}"` : html`data-nom="${e.nom}"`}>
    <small>${nombreTipo(e.tipo)}</small><b>${e.nombre}</b>${e.sub ? html`<span>${e.sub}</span>` : ''}</button>`;
}
function feriadoHtml(f) {
  return f ? html`<p class="ag-feriado ag-feriado--${f.tipo}">${f.tipo === 'feriado' ? 'Feriado' : 'No laborable'} · ${f.nombre}</p>` : '';
}

function vistaSemana(hoy) {
  const l = lunes(semana);
  const dias = Array.from({ length: 7 }, (_, i) => iso(masDias(l, i)));
  const todos = eventos(dias[0], dias[6]);
  const visibles = todos.filter((e) => !ocultos.has(e.tipo));
  const porDia = new Map(dias.map((d) => [d, visibles.filter((e) => e.fecha === d)]));
  const mostrar = dias.filter((d, i) => i < 5 || porDia.get(d).length);
  const titulo = semana === 0 ? 'Esta semana' : semana === 1 ? 'Semana próxima' : semana === -1 ? 'Semana pasada' : `Semana del ${dm(dias[0])}`;
  return {
    todos, sub: `${titulo} · ${dm(dias[0])} al ${dm(dias[4])}`, hoyBoton: semana === 0,
    cuerpo: html`<section class="ag-semana" style="--cols:${mostrar.length}">
      ${mostrar.map((d) => { const xs = porDia.get(d); const i = dias.indexOf(d); const f = feriado(d); return html`<div class="ag-dia ${d === hoy ? 'is-hoy' : ''} ${d < hoy ? 'is-pasado' : ''} ${f ? 'is-' + f.tipo : ''}">
        <header><b>${DIAS[i]}</b><span>${dm(d)}</span>${d === hoy ? html`<em>hoy</em>` : ''}</header>
        ${feriadoHtml(f)}
        ${xs.length ? xs.map(eventoHtml) : html`<p class="ag-vacio">Sin eventos</p>`}
      </div>`; })}
    </section>`,
  };
}

function vistaMes(hoy) {
  const p = primeroDelMes(mes);
  const y = p.getUTCFullYear(); const m = p.getUTCMonth();
  const ultimo = new Date(Date.UTC(y, m + 1, 0));
  const inicio = masDias(p, -((p.getUTCDay() + 6) % 7));
  const celdas = Array.from({ length: Math.ceil(((p.getUTCDay() + 6) % 7 + ultimo.getUTCDate()) / 7) * 7 }, (_, i) => iso(masDias(inicio, i)));
  const desde = iso(p); const hasta = iso(ultimo);
  const todos = eventos(desde, hasta);
  const visibles = todos.filter((e) => !ocultos.has(e.tipo));
  const porDia = new Map();
  visibles.forEach((e) => { if (!porDia.has(e.fecha)) porDia.set(e.fecha, []); porDia.get(e.fecha).push(e); });
  if (!diaSel || diaSel < desde || diaSel > hasta) diaSel = hoy >= desde && hoy <= hasta ? hoy : desde;
  const sel = porDia.get(diaSel) || [];
  const fSel = feriado(diaSel);
  const di = (new Date(diaSel + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return {
    todos, sub: `${MESES[m]} ${y}`, hoyBoton: mes === 0,
    cuerpo: html`<section class="ag-mes-wrap">
      <div class="ag-mes" role="grid" aria-label="${MESES[m]} ${y}">
        ${DIAS.map((d, i) => html`<span class="ag-mes-dsem ${i > 4 ? 'is-finde' : ''}" role="columnheader">${d.slice(0, 3)}</span>`)}
        ${celdas.map((d, i) => {
          const fuera = d < desde || d > hasta; const xs = porDia.get(d) || []; const f = feriado(d);
          const cuenta = TIPOS.map(([t]) => [t, xs.filter((e) => e.tipo === t).length]).filter(([, n]) => n);
          return html`<button type="button" role="gridcell" class="ag-cel ${fuera ? 'is-fuera' : ''} ${i % 7 > 4 ? 'is-finde' : ''} ${d === hoy ? 'is-hoy' : ''} ${d === diaSel ? 'is-sel' : ''} ${f ? 'is-' + f.tipo : ''}" data-dia="${d}" aria-pressed="${d === diaSel}" ${fuera ? 'tabindex="-1"' : ''}>
            <span class="ag-cel-n">${Number(d.slice(8))}</span>
            ${f ? html`<span class="ag-cel-fer" title="${f.nombre}">${f.tipo === 'feriado' ? 'Feriado' : 'No laborable'}</span>` : ''}
            ${cuenta.map(([t, n]) => html`<span class="ag-cel-cta ag--${t}"><i></i>${n} ${PLURAL[t][n === 1 ? 0 : 1]}</span>`)}
          </button>`;
        })}
      </div>
      <aside class="ag-detalle" aria-live="polite">
        <header><b>${DIAS[di]} ${Number(diaSel.slice(8))} de ${MESES[Number(diaSel.slice(5, 7)) - 1].toLowerCase()}</b>${diaSel === hoy ? html`<em>hoy</em>` : ''}</header>
        ${feriadoHtml(fSel)}
        ${sel.length ? sel.map(eventoHtml) : html`<p class="ag-vacio">Sin eventos</p>`}
      </aside>
    </section>`,
  };
}

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'La agenda requiere iniciar sesión con un usuario de RRHH.' })); return; }
  if (state.loading && !state.candidates.length) { el.innerHTML = String(mascot('loading')); return; }
  const hoy = todayISO();
  const v = vista === 'semana' ? vistaSemana(hoy) : vistaMes(hoy);
  const cuenta = Object.fromEntries(TIPOS.map(([t]) => [t, v.todos.filter((e) => e.tipo === t).length]));
  const nVis = v.todos.filter((e) => !ocultos.has(e.tipo)).length;
  const paso = vista === 'semana' ? 'semana' : 'mes';

  el.innerHTML = String(html`
  ${mHead({ titulo: 'Agenda', sub: `${v.sub} · ${nVis} ${nVis === 1 ? 'evento' : 'eventos'}`, acciones: html`
    <div class="ag-nav">
      <div class="ag-vista" role="group" aria-label="Vista">
        <button type="button" class="${vista === 'mes' ? 'is-on' : ''}" data-vista="mes" aria-pressed="${vista === 'mes'}">Mes</button>
        <button type="button" class="${vista === 'semana' ? 'is-on' : ''}" data-vista="semana" aria-pressed="${vista === 'semana'}">Semana</button>
      </div>
      <button type="button" class="btn btn--ghost" data-paso="-1" aria-label="${paso === 'mes' ? 'Mes anterior' : 'Semana anterior'}">←</button>
      <button type="button" class="btn ${v.hoyBoton ? 'btn--primary' : 'btn--ghost'}" data-paso="0">${paso === 'mes' ? 'Este mes' : 'Esta semana'}</button>
      <button type="button" class="btn btn--ghost" data-paso="1" aria-label="${paso === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}">→</button>
    </div>` })}
  <div class="ag-tipos" role="group" aria-label="Tipos de evento">${TIPOS.map(([t, l]) => html`<button type="button" class="ag-tipo ag--${t} ${ocultos.has(t) ? 'is-off' : ''}" data-tipo="${t}" aria-pressed="${!ocultos.has(t)}"><i aria-hidden="true"></i>${l} <span>${cuenta[t]}</span></button>`)}
    <span class="ag-leyenda"><i class="ag-l-fer"></i>Feriado <i class="ag-l-nol"></i>No laborable</span></div>
  ${v.cuerpo}`);
  animateIn(el);

  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', async (e) => {
      const vb = e.target.closest('[data-vista]');
      if (vb) { vista = vb.dataset.vista; saveLocal('reclutapp.agenda.vista', vista); render(el); return; }
      const s = e.target.closest('[data-paso]');
      if (s) {
        const n = Number(s.dataset.paso);
        if (vista === 'semana') semana = n === 0 ? 0 : semana + n; else { mes = n === 0 ? 0 : mes + n; diaSel = null; }
        render(el); return;
      }
      const d = e.target.closest('[data-dia]');
      if (d) {
        const p = primeroDelMes(mes); const dia = d.dataset.dia;
        // un día del mes anterior o siguiente lleva a ese mes
        if (dia.slice(0, 7) !== iso(p).slice(0, 7)) mes += dia < iso(p) ? -1 : 1;
        diaSel = dia; render(el);
        if (window.matchMedia('(max-width: 900px)').matches) el.querySelector('.ag-detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const t = e.target.closest('[data-tipo]');
      if (t) { const k = t.dataset.tipo; if (ocultos.has(k)) ocultos.delete(k); else ocultos.add(k); saveLocal('reclutapp.agenda.ocultos', [...ocultos]); render(el); return; }
      const c = e.target.closest('[data-cand]');
      if (c) { (await import('./candidatos.js')).openCandidate(c.dataset.cand); return; }
      const n = e.target.closest('[data-nom]');
      if (n) (await import('./nomina.js')).abrirPersona(n.dataset.nom);
    });
  }
}
