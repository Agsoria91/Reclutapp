// Mapa de inicio: mapa real (oscuro o satelital) de la cuenca neuquina con
// los yacimientos de EFiS. Cada punto muestra su tipo (torre de perforación,
// cigüeña, planta de facilidades, unidad móvil) y el avance de sus sillas; al
// tocarlo abre Posiciones filtrada por ese yacimiento, con botón para volver.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { html, raw } from '../lib/html.js';
import { state } from '../lib/store.js';
import { pct } from '../lib/format.js';
import { isCovered } from '../lib/kpis.js';
import { mascot } from '../components/mascot.js';
import { YACIMIENTOS } from '../data/yacimientos.js';
import { posFilters } from './posiciones.js';
import { saveLocal, loadLocal } from '../components/ui.js';

const CAPAS = {
  satelite: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Imágenes &copy; Esri, Maxar, Earthstar Geographics', {}],
  oscuro: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', '&copy; Esri, HERE, Garmin, OpenStreetMap', { maxNativeZoom: 16 }],
};
const ICONO = {
  torre: '<path d="M16 3 9 29M16 3l7 26M11 21h10M12.3 15h7.4M13.6 9h4.8M9 29h14"/><path d="M11 21l8.7-6M21 21l-8.7-6M12.3 15l6.1-6M19.7 15l-6.1-6"/>',
  ciguena: '<path d="M5 12l20-5"/><path d="M25 7c2 0 3 2 2.4 4.2L25 15"/><path d="M14 9.5 10 28M14 9.5 18 28M8 28h12M25 15v13M23 28h4"/><circle cx="14" cy="9.5" r="1.3"/><path d="M5 12v4M4 16h3"/>',
  cfp: '<rect x="4" y="17" width="10" height="11" rx="1"/><path d="M4 21h10M17 28V14a3.5 3.5 0 0 1 7 0v14M25 28V18a3 3 0 0 1 6 0v10M2 28h29M8 17v-5h3v5"/><path d="M9.5 12c0-2 1.5-2.5 1.5-4.5"/>',
  camion: '<path d="M3 21V11h14v10M17 15h6l4 4v2h-24"/><circle cx="9" cy="23.5" r="2.3"/><circle cx="23" cy="23.5" r="2.3"/><path d="M5.5 11l3-4h5l3 4"/>',
  oficina: '<rect x="7" y="6" width="18" height="22" rx="1.5"/><path d="M11 11h3M18 11h3M11 16h3M18 16h3M11 21h3M18 21h3M14 28v-3h4v3"/>',
};
const TIPO = { torre: 'Torre de perforación', ciguena: 'Cigüeña · bombeo mecánico', cfp: 'Planta de procesamiento (CPF / EPF)', camion: 'Unidad móvil · transporte de arena', oficina: 'Base administrativa' };
const svg = (t, w = 1.6) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONO[t]}</svg>`;
const norm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function datos() {
  return YACIMIENTOS.map((y) => {
    const codigos = [y.codigo, ...(y.alias || [])].map(norm);
    const sillas = state.positions.filter((p) => codigos.includes(norm(p.yacimiento)));
    const cub = sillas.filter(isCovered).length;
    const dot = state.isStaff ? state.nomina.filter((n) => n.estado === 'activo' && codigos.includes(norm(n.yacimiento))).length : null;
    return { ...y, area: sillas[0]?.yacimiento || y.codigo, total: sillas.length, cub, faltan: sillas.length - cub, dot };
  });
}

function marcador(y) {
  const p = y.total ? pct(y.cub, y.total) : null;
  const nota = y.movil ? ' · sin ubicación fija' : y.aConfirmar ? ' · ubicación a confirmar' : y.aproximada ? ' · ubicación aproximada' : '';
  return `<div class="mp-pt mp-pt--${y.tipo} ${y.total ? '' : 'is-sin'}" data-yac="${y.codigo}" role="button" tabindex="0" aria-label="${esc(y.nombre)}">
    <span class="mp-pulso"></span>
    <span class="mp-ico">${svg(y.tipo)}</span>
    <span class="mp-tag"><b>${y.codigo}</b>${p != null ? `<i>${p}%</i>` : ''}</span>
    <span class="mp-ficha">
      <strong>${esc(y.nombre)}</strong><small>${y.instalaciones ? `Planta de procesamiento · ${y.instalaciones}` : TIPO[y.tipo]}${nota}</small>
      ${y.total ? `<span class="mp-ficha-bar"><span style="width:${p}%"></span></span>
      <span class="mp-ficha-nums"><span><b>${y.total}</b> sillas</span><span><b>${y.cub}</b> cubiertas</span><span><b>${y.faltan}</b> faltan</span></span>`
        : '<span class="mp-ficha-nums"><span>Sin sillas en el mapa de posiciones</span></span>'}
      ${y.dot != null && y.dot ? `<span class="mp-ficha-dot">${y.dot} personas en nómina</span>` : ''}
      ${y.total ? '<span class="mp-ficha-ir">Ver sillas →</span>' : ''}
    </span></div>`;
}

let mapa = null;
let capaActual = loadLocal('reclutapp.mapa.capa', 'satelite');

function abrirYacimiento(y) {
  if (!y?.total) return;
  saveLocal('reclutapp.desdeMapa', { codigo: y.codigo, prev: [...posFilters.area] });
  posFilters.area = new Set([y.area]);
  location.hash = '#/posiciones';
}

export function render(el) {
  if (state.loading && !state.positions.length) { el.innerHTML = String(mascot('loading')); return; }
  const ys = datos();
  const tot = ys.reduce((a, y) => ({ total: a.total + y.total, cub: a.cub + y.cub }), { total: 0, cub: 0 });
  const conSillas = ys.filter((y) => y.total).sort((a, b) => b.total - a.total);

  if (mapa) { mapa.remove(); mapa = null; }
  el.innerHTML = String(html`<div class="mapa">
    <div class="mapa-leaflet" id="mapa-leaflet" aria-label="Mapa de la cuenca neuquina con los yacimientos de EFiS"></div>
    <aside class="mapa-panel">
      <span class="mapa-kicker">EFiS · Cuenca Neuquina</span>
      <h1>Yacimientos</h1>
      <div class="mapa-tot"><b>${pct(tot.cub, tot.total)}%</b><span>${tot.cub} de ${tot.total} sillas cubiertas</span></div>
      <div class="mapa-capas" role="group" aria-label="Tipo de mapa">
        ${[['satelite', 'Satélite'], ['oscuro', 'Mapa']].map(([k, t]) => html`<button type="button" data-capa="${k}" class="${capaActual === k ? 'is-on' : ''}">${t}</button>`)}
      </div>
      <ul class="mapa-lista">${conSillas.map((y) => html`<li><button type="button" data-yac="${y.codigo}">
        <span class="ml-ico mp-pt--${y.tipo}">${raw(svg(y.tipo, 1.8))}</span>
        <span class="ml-txt"><b>${y.codigo}</b><small>${y.nombre}</small></span>
        <span class="ml-bar"><span style="width:${pct(y.cub, y.total)}%"></span></span>
        <span class="ml-num">${y.cub}/${y.total}</span></button></li>`)}</ul>
      <div class="mapa-ref">${['torre', 'ciguena', 'cfp', 'camion'].map((t) => html`<span class="mp-pt--${t}">${raw(svg(t, 1.8))}${TIPO[t]}</span>`)}</div>
    </aside>
  </div>`);

  const box = el.querySelector('#mapa-leaflet');
  const cont = el.querySelector('.mapa');
  if (window.innerWidth > 860) cont.style.height = `${Math.max(480, window.innerHeight - cont.getBoundingClientRect().top - window.scrollY)}px`;
  mapa = L.map(box, { zoomControl: false, attributionControl: true, minZoom: 6, maxZoom: 14, zoomSnap: 0.25 });
  L.control.zoom({ position: 'bottomleft' }).addTo(mapa);
  const [url, attr, extra] = CAPAS[capaActual] || CAPAS.satelite;
  box.dataset.capa = capaActual;
  L.tileLayer(url, { attribution: attr, maxZoom: 18, ...extra }).addTo(mapa);
  for (const y of ys) {
    const m = L.marker([y.lat, y.lon], { icon: L.divIcon({ className: 'mp-divicon', html: marcador(y), iconSize: [0, 0] }), keyboard: false, riseOnHover: true });
    m.on('click', () => abrirYacimiento(y));
    m.addTo(mapa);
  }
  const encuadrar = () => {
    if (!mapa) return;
    mapa.invalidateSize();
    const ancho = box.clientWidth;
    mapa.fitBounds(L.latLngBounds(ys.map((y) => [y.lat, y.lon])), {
      paddingTopLeft: [60, 90], paddingBottomRight: [ancho > 860 ? 380 : 30, 60], maxZoom: 9,
    });
  };
  encuadrar();
  requestAnimationFrame(encuadrar);

  if (!el._mapa) {
    el._mapa = true;
    el.addEventListener('click', (e) => {
      if (!el.querySelector('.mapa')) return;
      const c = e.target.closest('[data-capa]');
      if (c) { capaActual = c.dataset.capa; saveLocal('reclutapp.mapa.capa', capaActual); render(el); return; }
      const b = e.target.closest('.mapa-lista [data-yac]');
      if (b) abrirYacimiento(datos().find((y) => y.codigo === b.dataset.yac));
    });
    el.addEventListener('keydown', (e) => {
      const p = e.target.closest?.('.mp-pt[data-yac]');
      if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirYacimiento(datos().find((y) => y.codigo === p.dataset.yac)); }
    });
    el.addEventListener('mouseover', (e) => {
      const pt = e.target.closest('.mp-pt');
      if (pt) {
        const caja = el.querySelector('#mapa-leaflet')?.getBoundingClientRect();
        if (caja) pt.classList.toggle('ficha-abajo', pt.getBoundingClientRect().top - caja.top < 210);
      }
      const b = e.target.closest('.mapa-lista [data-yac]');
      el.querySelectorAll('.mp-pt').forEach((p) => p.classList.toggle('is-hover', !!b && p.dataset.yac === b.dataset.yac));
      el.querySelectorAll('.mp-divicon').forEach((d) => { d.style.zIndex = d.querySelector('.is-hover') ? 2000 : ''; });
    });
  }
}
