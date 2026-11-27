// Cumpleaños de hoy y mañana (personal activo en nómina, ingresados y próximos ingresos)
// y aniversarios laborales de los próximos 7 días (personal activo en nómina).
// Se muestra arriba en Agenda y en Nómina (solo RRHH). Sin duplicar: una persona por DNI.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { todayISO } from '../lib/format.js';
import { icono } from './iconos.js';

let abierta = false; // la franja arranca en una sola línea

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

// Aniversarios en la empresa de hoy a 6 días (por fecha de ingreso). Hitos: 1, 5, 10, 15, 20, 25, 30…
export const esHito = (n) => n === 1 || n % 5 === 0;
export function aniversarios(hoy = todayISO(), dias = 7) {
  const fechas = Array.from({ length: dias }, (_, i) => sumar(hoy, i));
  const out = [];
  for (const n of state.nomina || []) {
    if (n.estado !== 'activo' || !n.fecha_ingreso) continue;
    for (const f of fechas) {
      if (diaEn(n.fecha_ingreso, Number(f.slice(0, 4))) !== f) continue;
      const anios = Number(f.slice(0, 4)) - Number(n.fecha_ingreso.slice(0, 4));
      if (anios >= 1) out.push({ nombre: n.nombre, nom: n.id, fecha: f, anios, sub: [n.yacimiento, n.sector].filter(Boolean).join(' · ') });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.anios - a.anios || a.nombre.localeCompare(b.nombre, 'es'));
}
const DSEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function avisoCumples() {
  if (!state.isStaff) return '';
  const { hoy, manana } = cumpleanos();
  const aniv = aniversarios();
  if (!hoy.length && !manana.length && !aniv.length) return '';
  const hoyIso = todayISO();
  const resumen = [hoy.length ? `${hoy.length} ${hoy.length === 1 ? 'cumpleaños' : 'cumpleaños'} hoy` : '', manana.length ? `${manana.length} mañana` : '',
    aniv.length ? `${aniv.length} ${aniv.length === 1 ? 'aniversario' : 'aniversarios'} esta semana` : ''].filter(Boolean).join(' · ');
  const cuando = (f) => (f === hoyIso ? 'hoy' : f === sumar(hoyIso, 1) ? 'mañana' : `${DSEM[new Date(f + 'T00:00:00Z').getUTCDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`);
  const chip = (p) => html`<button type="button" class="cum-chip" ${p.nom ? html`data-cumple-nom="${p.nom}"` : html`data-cumple-cand="${p.cand}"`} title="${p.sub}"><b>${p.nombre}</b> <span>${p.edad} años${p.sub === 'Próximo ingreso' ? ' · próximo ingreso' : ''}</span></button>`;
  return html`<section class="cumples ${abierta ? 'is-abierta' : ''}" aria-label="Cumpleaños y aniversarios">
    <div class="cum-linea">
      <button type="button" class="cum-resumen" data-cum-toggle aria-expanded="${abierta}"><span class="cum-ico">${icono('cumple')}</span><b>${resumen}</b><span class="cum-flecha" aria-hidden="true">${icono('flecha')}</span></button>
    </div>
    <div class="cum-detalle">
    ${hoy.length ? html`<div class="cum-grupo"><span class="cum-tit">Hoy cumplen</span>${hoy.map(chip)}</div>` : ''}
    ${manana.length ? html`<div class="cum-grupo"><span class="cum-tit">Mañana</span>${manana.map(chip)}</div>` : ''}
    ${aniv.length ? html`<div class="cum-grupo"><span class="cum-tit">Aniversarios esta semana</span>${aniv.map((a) => html`<button type="button" class="cum-chip ${esHito(a.anios) ? 'is-hito' : ''}" data-cumple-nom="${a.nom}" title="${a.sub}"><b>${a.nombre}</b> <span>${a.anios} ${a.anios === 1 ? 'año' : 'años'} · ${cuando(a.fecha)}</span></button>`)}</div>` : ''}
    </div>
  </section>`;
}

// Bloque fijo para la campanita (cumpleaños de hoy y mañana y aniversarios de la semana)
export function hayCumples() { const { hoy, manana } = cumpleanos(); return hoy.length + manana.length + aniversarios().length > 0; }
export function cumplesCampana() {
  if (!state.isStaff) return '';
  const { hoy, manana } = cumpleanos();
  const aniv = aniversarios();
  if (!hoy.length && !manana.length && !aniv.length) return '';
  const hoyIso = todayISO();
  const cuando = (f) => (f === hoyIso ? 'hoy' : f === sumar(hoyIso, 1) ? 'mañana' : `${DSEM[new Date(f + 'T00:00:00Z').getUTCDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`);
  const item = (p, extra) => html`<button type="button" class="cc-item" ${p.nom ? html`data-cumple-nom="${p.nom}"` : html`data-cumple-cand="${p.cand}"`}><b>${p.nombre}</b><span>${extra}</span></button>`;
  return html`<div class="campana-cumples">
    <span class="campana-tit">${icono('cumple')} Cumpleaños y aniversarios</span>
    ${hoy.length ? html`<span class="cc-grupo">Hoy</span>${hoy.map((p) => item(p, `${p.edad} años${p.sub === 'Próximo ingreso' ? ' · próximo ingreso' : ''}`))}` : ''}
    ${manana.length ? html`<span class="cc-grupo">Mañana</span>${manana.map((p) => item(p, `${p.edad} años${p.sub === 'Próximo ingreso' ? ' · próximo ingreso' : ''}`))}` : ''}
    ${aniv.length ? html`<span class="cc-grupo">Aniversarios esta semana</span>${aniv.map((a) => item(a, `${a.anios} ${a.anios === 1 ? 'año' : 'años'} · ${cuando(a.fecha)}`))}` : ''}
  </div>`;
}

// abre la ficha al tocar un nombre (en cualquier pantalla)
export function initCumples() {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-cum-toggle]');
    if (t) { abierta = !abierta; document.querySelectorAll('.cumples').forEach((s) => s.classList.toggle('is-abierta', abierta)); t.setAttribute('aria-expanded', String(abierta)); return; }
    const n = e.target.closest('[data-cumple-nom]');
    if (n) { (await import('../views/nomina.js')).abrirPersona(n.dataset.cumpleNom); return; }
    const c = e.target.closest('[data-cumple-cand]');
    if (c) (await import('../views/candidatos.js')).openCandidate(c.dataset.cumpleCand);
  });
}
