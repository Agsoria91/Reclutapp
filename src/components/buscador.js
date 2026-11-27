// Búsqueda global: candidatos, nómina y sillas desde cualquier pantalla (lupa o Ctrl+K).
// El lector solo busca sillas (no recibe nombres ni datos personales de candidatos).
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { norm } from '../lib/format.js';

const MAX = 6;
const coincide = (texto, q) => { const t = norm(texto); return q.every((p) => t.includes(p)); };

function resultados(texto) {
  const q = norm(texto).split(/\s+/).filter(Boolean);
  if (!q.length) return [];
  const staff = state.isStaff;
  const et = (c) => state.stageMap[c]?.label || c || '';
  const grupos = [];
  if (staff) {
    grupos.push(['Candidatos', state.candidates.filter((c) => coincide([c.nombre, c.dni, c.mail, c.telefono].join(' '), q)).slice(0, MAX)
      .map((c) => ({ tipo: 'cand', id: c.id, titulo: c.nombre, sub: [et(c.stage), [c.area, c.servicio].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') }))]);
    grupos.push(['Nómina', state.nomina.filter((n) => coincide([n.nombre, n.dni, n.cuil, n.nro_pers, n.pos].join(' '), q)).slice(0, MAX)
      .map((n) => ({ tipo: 'nom', id: n.id, titulo: n.nombre, sub: [n.estado === 'baja' ? 'Baja' : 'Activo', n.yacimiento, n.sector].filter(Boolean).join(' · ') }))]);
  }
  grupos.push(['Sillas', state.positions.filter((p) => coincide([p.puesto, p.pos_sap, p.candidato_nombre, p.yacimiento, p.sector].join(' '), q)).slice(0, MAX)
    .map((p) => ({ tipo: 'silla', id: p.id, titulo: `${p.puesto} · ${p.yacimiento}`, sub: [p.candidato_nombre || 'vacante', et(p.stage), p.pos_sap ? 'POS ' + p.pos_sap : ''].filter(Boolean).join(' · '), q: texto }))]);
  return grupos.filter(([, xs]) => xs.length);
}

async function abrir(r) {
  if (r.tipo === 'cand') (await import('../views/candidatos.js')).openCandidate(r.id);
  else if (r.tipo === 'nom') (await import('../views/nomina.js')).abrirPersona(r.id);
  else if (state.isStaff) (await import('../views/posiciones.js')).openEditor(r.id);
  else { (await import('../views/posiciones.js')).buscarEnPosiciones(r.titulo.split(' · ')[0]); location.hash = '#/posiciones'; }
}

export function abrirBuscador() {
  if (document.querySelector('dialog.buscador')) return;
  const d = document.createElement('dialog');
  d.className = 'buscador';
  d.setAttribute('aria-label', 'Buscar');
  d.innerHTML = String(html`<div class="bus-caja">
    <input type="text" id="bus-q" placeholder="${state.isStaff ? 'Buscar persona, DNI, puesto o POS SAP' : 'Buscar puesto o POS SAP'}" autocomplete="off" aria-label="Buscar">
    <kbd>Esc</kbd></div><div class="bus-res" role="listbox"></div>`);
  document.body.appendChild(d);
  d.showModal();
  const input = d.querySelector('#bus-q');
  const caja = d.querySelector('.bus-res');
  let lista = []; let sel = 0;
  const pintar = () => {
    const gs = resultados(input.value);
    lista = gs.flatMap(([, xs]) => xs);
    sel = Math.min(sel, Math.max(0, lista.length - 1));
    let i = 0;
    caja.innerHTML = String(input.value.trim() && !lista.length ? html`<p class="bus-vacio">Sin resultados</p>`
      : html`${gs.map(([g, xs]) => html`<div class="bus-grupo"><span>${g}</span>${xs.map((r) => { const k = i++; return html`<button type="button" role="option" class="bus-item ${k === sel ? 'is-on' : ''}" data-k="${k}" aria-selected="${k === sel}"><b>${r.titulo}</b><small>${r.sub}</small></button>`; })}</div>`)}`);
  };
  const cerrar = () => { if (d.open) d.close(); d.remove(); };
  input.addEventListener('input', () => { sel = 0; pintar(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!lista.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length; pintar();
      caja.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter' && lista[sel]) { e.preventDefault(); const r = lista[sel]; cerrar(); abrir(r); }
  });
  caja.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { const r = lista[+b.dataset.k]; cerrar(); abrir(r); } });
  d.addEventListener('click', (e) => { if (e.target === d) cerrar(); });
  d.addEventListener('close', () => d.remove());
  input.focus();
}

// Ctrl+K / Cmd+K abren la búsqueda desde cualquier pantalla
export function initBuscador() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.canRead) { e.preventDefault(); abrirBuscador(); }
  });
}
