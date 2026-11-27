// Cumpleaños de hoy y mañana: personal activo en nómina, ingresados y próximos ingresos.
// Se muestra arriba en Agenda y en Nómina (solo RRHH). Sin duplicar: una persona por DNI.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { todayISO } from '../lib/format.js';
import { icono } from './iconos.js';

const digitos = (v) => String(v ?? '').replace(/\D/g, '');
const bisiesto = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const sumar = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// día del cumpleaños en un año dado (el 29/02 se celebra el 28/02 en años no bisiestos)
const diaEn = (nac, y) => { const md = nac.slice(5, 10); return `${y}-${md === '02-29' && !bisiesto(y) ? '02-28' : md}`; };

export function cumpleanos(hoy = todayISO()) {
  const manana = sumar(hoy, 1);
  const vistos = new Set();
  const personas = [];
  for (const n of state.nomina || []) {
    if (n.estado !== 'activo' || !n.fecha_nacimiento) continue;
    const d = digitos(n.dni); if (d) vistos.add(d);
    personas.push({ nombre: n.nombre, nac: n.fecha_nacimiento, sub: [n.yacimiento, n.sector].filter(Boolean).join(' · '), nom: n.id });
  }
  for (const c of state.candidates || []) {
    if (!['proximo_ingreso', 'ingresado'].includes(c.stage) || !c.fecha_nacimiento) continue;
    const d = digitos(c.dni); if (d && vistos.has(d)) continue;
    if (d) vistos.add(d);
    personas.push({ nombre: c.nombre, nac: c.fecha_nacimiento, sub: c.stage === 'proximo_ingreso' ? 'Próximo ingreso' : [c.area, c.servicio].filter(Boolean).join(' · '), cand: c.id });
  }
  const en = (dia) => personas.filter((p) => diaEn(p.nac, Number(dia.slice(0, 4))) === dia)
    .map((p) => ({ ...p, edad: Number(dia.slice(0, 4)) - Number(p.nac.slice(0, 4)) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { hoy: en(hoy), manana: en(manana) };
}

export function avisoCumples() {
  if (!state.isStaff) return '';
  const { hoy, manana } = cumpleanos();
  if (!hoy.length && !manana.length) return '';
  const chip = (p) => html`<button type="button" class="cum-chip" ${p.nom ? html`data-cumple-nom="${p.nom}"` : html`data-cumple-cand="${p.cand}"`} title="${p.sub}"><b>${p.nombre}</b> <span>${p.edad} años${p.sub === 'Próximo ingreso' ? ' · próximo ingreso' : ''}</span></button>`;
  return html`<section class="cumples" aria-label="Cumpleaños">
    <span class="cum-ico">${icono('cumple')}</span>
    ${hoy.length ? html`<div class="cum-grupo"><span class="cum-tit">Hoy cumplen</span>${hoy.map(chip)}</div>` : ''}
    ${manana.length ? html`<div class="cum-grupo"><span class="cum-tit">Mañana</span>${manana.map(chip)}</div>` : ''}
  </section>`;
}

// abre la ficha al tocar un nombre (en cualquier pantalla)
export function initCumples() {
  document.addEventListener('click', async (e) => {
    const n = e.target.closest('[data-cumple-nom]');
    if (n) { (await import('../views/nomina.js')).abrirPersona(n.dataset.cumpleNom); return; }
    const c = e.target.closest('[data-cumple-cand]');
    if (c) (await import('../views/candidatos.js')).openCandidate(c.dataset.cumpleCand);
  });
}
