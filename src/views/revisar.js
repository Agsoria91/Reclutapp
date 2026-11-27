// Revisar datos: inconsistencias entre candidatos, sillas y nómina para corregir en un lugar.
import { html } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, todayISO } from '../lib/format.js';
import { toast, confirmDialog, stagePill, animateIn } from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { mHead, mKpis } from '../components/moderno.js';
import { enNomina, duplicados, fechasIngreso, localidades, sinDni } from '../lib/revisar.js';

let vista = null;

function calcular() {
  const hoy = todayISO();
  return {
    nom: enNomina(state.candidates, state.nomina, (c) => c._silla),
    dup: duplicados(state.candidates),
    fec: fechasIngreso(state.positions, hoy),
    loc: localidades({ candidatos: state.candidates, sillas: state.positions, nomina: state.nomina }),
    dni: sinDni(state.candidates),
  };
}

const lugar = (c) => (c._silla ? `${c._silla.puesto} · ${c._silla.yacimiento}` : [c.area, c.servicio, c.posicion].filter(Boolean).join(' · '));
const btnFicha = (id, t = 'Ficha') => html`<button type="button" class="btn btn--sm" data-cand="${id}">${t}</button>`;

function seccion(k, titulo, n, cuerpo) {
  if (vista && vista !== k) return '';
  return html`<section class="card rv-sec"><h2 class="card-title">${titulo} <small class="muted">${n}</small></h2>
    ${n ? cuerpo : html`<p class="muted">Sin observaciones.</p>`}</section>`;
}

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Iniciá sesión con un usuario de RRHH.' })); return; }
  if (state.loading && !state.positions.length) { el.innerHTML = String(mascot('loading')); return; }
  const r = calcular();
  const total = r.nom.length + r.dup.length + r.fec.length + r.loc.length + r.dni.length;
  const k = (id, icono, label, valor, sub, tono = 'aviso') => ({ icono, label, valor, id: 'rv-' + id, sub, tono: valor ? tono : '', attrs: `data-rvista="${id}"`, sel: vista === id });

  el.innerHTML = String(html`
  ${mHead({ titulo: 'Revisar datos', sub: total ? `${total} observaciones` : 'Sin observaciones' })}
  ${mKpis([
    k('nom', 'nomina', 'Ya en nómina', r.nom.length, 'candidatos en proceso', 'alerta'),
    k('dup', 'candidatos', 'Posibles duplicados', r.dup.length, 'mismo nombre'),
    k('fec', 'reloj', 'Fechas de ingreso', r.fec.length, 'a corregir'),
    k('loc', 'mapa', 'Localidades', r.loc.length, 'escritas distinto'),
    k('dni', 'documento', 'Sin DNI', r.dni.length, 'en etapas avanzadas'),
  ])}
  ${seccion('nom', 'Candidatos en proceso que figuran activos en nómina', r.nom.length, html`<ul class="user-list">${r.nom.map(({ c, n, por }) => html`<li>
    <span><strong>${c.nombre}</strong> ${stagePill(c.stage, { small: true })}
      <small class="muted block">${lugar(c)} · en nómina: ${[n.nombre, n.yacimiento, n.sector, n.puesto].filter(Boolean).join(' · ')} · coincide por ${por}</small></span>
    <span class="rv-acc">${btnFicha(c.id)}<button type="button" class="btn btn--sm" data-nom="${n.id}">Nómina</button></span></li>`)}</ul>`)}
  ${seccion('dup', 'Posibles fichas duplicadas', r.dup.length, html`${r.dup.map((g) => html`<div class="rv-grupo"><ul class="user-list">${g.map((c) => html`<li>
    <span><strong>${c.nombre}</strong> ${stagePill(c.stage, { small: true })}
      <small class="muted block">${[lugar(c), c.dni ? 'DNI ' + c.dni : 'sin DNI', c.cv_recibido ? 'CV ' + fmtDate(c.cv_recibido) : ''].filter(Boolean).join(' · ')}</small></span>
    <span class="rv-acc">${btnFicha(c.id)}</span></li>`)}</ul></div>`)}`)}
  ${seccion('fec', 'Fechas de ingreso a revisar', r.fec.length, html`<ul class="user-list">${r.fec.map(({ p, motivo, fecha }) => html`<li>
    <span><strong>${p.puesto} · ${p.yacimiento}</strong> ${stagePill(p.stage, { small: true })}
      <small class="muted block">${p.candidato_nombre || 'Sin candidato'} · ${motivo === 'confirmada' ? `fecha confirmada ${fmtDate(fecha)} sin estar en Próximo ingreso` : `ingreso previsto ${fmtDate(fecha)} vencido`}</small></span>
    <span class="rv-acc"><button type="button" class="btn btn--sm" data-silla="${p.id}">Silla</button></span></li>`)}</ul>`)}
  ${seccion('loc', 'Localidades escritas de distintas formas', r.loc.length, html`<ul class="user-list">${r.loc.map((v, i) => html`<li>
    <span>${v.map((x) => html`<span class="rv-var">${x.texto} <small class="muted">${x.n}</small></span>`)}</span>
    <span class="rv-acc">${v.map((x) => html`<button type="button" class="btn btn--sm" data-unificar="${i}" data-texto="${x.texto}">Usar «${x.texto}»</button>`)}</span></li>`)}</ul>`)}
  ${seccion('dni', 'Candidatos avanzados sin DNI', r.dni.length, html`<ul class="user-list">${r.dni.map((c) => html`<li>
    <span><strong>${c.nombre}</strong> ${stagePill(c.stage, { small: true })}<small class="muted block">${lugar(c)}</small></span>
    <span class="rv-acc">${btnFicha(c.id, 'Completar')}</span></li>`)}</ul>`)}
  `);
  animateIn(el);

  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', async (e) => {
      const v = e.target.closest('[data-rvista]');
      if (v) { vista = vista === v.dataset.rvista ? null : v.dataset.rvista; render(el); return; }
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.cand) (await import('./candidatos.js')).openCandidate(b.dataset.cand);
      else if (b.dataset.nom) (await import('./nomina.js')).abrirPersona(b.dataset.nom);
      else if (b.dataset.silla) (await import('./posiciones.js')).openEditor(b.dataset.silla);
      else if (b.dataset.unificar != null) unificar(calcular().loc[+b.dataset.unificar], b.dataset.texto, el);
    });
  }
}

async function unificar(grupo, texto, el) {
  if (!grupo) return;
  const otras = grupo.map((x) => x.texto).filter((t) => t !== texto);
  const n = grupo.filter((x) => x.texto !== texto).reduce((s, x) => s + x.n, 0);
  if (!(await confirmDialog(`¿Reemplazar ${otras.map((t) => `«${t}»`).join(', ')} por «${texto}» en ${n} ${n === 1 ? 'registro' : 'registros'} (candidatos, sillas y nómina)?`, { ok: 'Unificar' }))) return;
  const res = await Promise.all([
    sb.from('candidates').update({ localidad: texto }).in('localidad', otras),
    sb.from('positions').update({ localidad: texto }).in('localidad', otras).is('candidate_id', null),
    sb.from('nomina').update({ localidad: texto }).in('localidad', otras),
  ]);
  const err = res.find((x) => x.error)?.error;
  if (err) { toast(err.message, 'error', 7000); return; }
  toast(`Localidad unificada: ${texto}`, 'ok');
  await loadAll({ silent: true });
  render(el);
}
