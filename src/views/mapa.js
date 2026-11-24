// Mapa de inicio (maqueta): cuenca neuquina en fondo oscuro con los
// yacimientos de EFiS. Cada punto muestra su tipo (torre de perforación,
// cigüeña o planta de facilidades) y el avance de sus sillas; al tocarlo
// abre Posiciones filtrada por ese yacimiento, con un botón para volver.
import { html, raw } from '../lib/html.js';
import { state } from '../lib/store.js';
import { pct } from '../lib/format.js';
import { isCovered } from '../lib/kpis.js';
import { mascot } from '../components/mascot.js';
import { YACIMIENTOS, CIUDADES } from '../data/yacimientos.js';
import { posFilters } from './posiciones.js';
import { saveLocal } from '../components/ui.js';

// encuadre del mapa (grados) y proyección equirectangular corregida por latitud
const B = { oeste: -70.15, este: -67.45, norte: -37.05, sur: -39.35 };
const W = 1000;
const K = Math.cos((38.2 * Math.PI) / 180);
const H = Math.round((W * (B.norte - B.sur)) / ((B.este - B.oeste) * K));
const X = (lon) => ((lon - B.oeste) / (B.este - B.oeste)) * W;
const Y = (lat) => ((B.norte - lat) / (B.norte - B.sur)) * H;
const linea = (pts) => pts.map(([lo, la], i) => `${i ? 'L' : 'M'}${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join(' ');
const curva = (pts) => {
  const p = pts.map(([lo, la]) => [X(lo), Y(la)]);
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]; const [x1, y1] = p[i];
    d += ` Q${x0.toFixed(1)},${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)},${((y0 + y1) / 2).toFixed(1)}`;
  }
  const u = p[p.length - 1];
  return d + ` T${u[0].toFixed(1)},${u[1].toFixed(1)}`;
};

// geografía simplificada (aproximada, solo como referencia visual)
const RIOS = {
  neuquen: [[-70.15, -37.42], [-69.8, -37.72], [-69.45, -37.98], [-69.15, -38.18], [-68.9, -38.32], [-68.7, -38.44], [-68.45, -38.62], [-68.25, -38.8], [-68.06, -38.97]],
  limay: [[-69.6, -39.35], [-69.1, -39.28], [-68.8, -39.24], [-68.5, -39.13], [-68.25, -39.02], [-68.06, -38.97]],
  negro: [[-68.06, -38.97], [-67.8, -39.03], [-67.45, -39.1]],
  colorado: [[-69.7, -37.05], [-69.3, -37.22], [-68.95, -37.34], [-68.5, -37.47], [-68.15, -37.66], [-67.8, -37.88], [-67.45, -38.1]],
};
const ZONA_VM = [[-69.95, -37.45], [-69.2, -37.38], [-68.55, -37.5], [-68.3, -37.95], [-68.35, -38.45], [-68.75, -38.8], [-69.45, -38.85], [-69.95, -38.4], [-70.05, -37.9]];

// relieve: curvas de nivel alrededor de algunas "lomas"
function relieve() {
  const lomas = [[-69.7, -38.6, 70], [-69.5, -37.6, 60], [-68.9, -38.9, 45], [-67.9, -37.5, 40], [-69.95, -38.05, 55], [-68.35, -38.2, 35]];
  let d = '';
  lomas.forEach(([lo, la, r0], k) => {
    for (let a = 1; a <= 6; a++) {
      const r = r0 * a * 0.55;
      let s = '';
      for (let t = 0; t <= 64; t++) {
        const th = (t / 64) * Math.PI * 2;
        const rr = r * (1 + 0.16 * Math.sin(3 * th + k) + 0.07 * Math.sin(7 * th + a));
        s += `${t ? 'L' : 'M'}${(X(lo) + rr * Math.cos(th)).toFixed(1)},${(Y(la) + rr * 0.8 * Math.sin(th)).toFixed(1)}`;
      }
      d += s + 'Z';
    }
  });
  return d;
}

// íconos de cada tipo de yacimiento (trazo, 32×32)
const ICONO = {
  torre: '<path d="M16 3 9 29M16 3l7 26M11 21h10M12.3 15h7.4M13.6 9h4.8M9 29h14M16 3v-1"/><path d="M11 21l8.7-6M21 21l-8.7-6M12.3 15l6.1-6M19.7 15l-6.1-6"/>',
  ciguena: '<path d="M5 12l20-5"/><path d="M25 7c2 0 3 2 2.4 4.2L25 15"/><path d="M14 9.5 10 28M14 9.5 18 28M8 28h12M25 15v13M23 28h4"/><circle cx="14" cy="9.5" r="1.3"/><path d="M5 12v4M4 16h3"/>',
  cfp: '<rect x="4" y="17" width="10" height="11" rx="1"/><path d="M4 21h10M17 28V14a3.5 3.5 0 0 1 7 0v14M25 28V18a3 3 0 0 1 6 0v10M2 28h29M8 17v-5h3v5"/><path d="M9.5 12c0-2 1.5-2.5 1.5-4.5"/>',
  oficina: '<rect x="7" y="6" width="18" height="22" rx="1.5"/><path d="M11 11h3M18 11h3M11 16h3M18 16h3M11 21h3M18 21h3M14 28v-3h4v3"/>',
};
const TIPO = { torre: 'Torre de perforación', ciguena: 'Cigüeña · bombeo', cfp: 'Planta de facilidades (CFP)', oficina: 'Base administrativa' };

const norm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function datos() {
  return YACIMIENTOS.map((y) => {
    const codigos = [y.codigo, ...(y.alias || [])].map(norm);
    const sillas = state.positions.filter((p) => codigos.includes(norm(p.yacimiento)));
    const cub = sillas.filter(isCovered).length;
    const dot = state.isStaff ? state.nomina.filter((n) => n.estado === 'activo' && codigos.includes(norm(n.yacimiento))).length : null;
    return { ...y, total: sillas.length, cub, faltan: sillas.length - cub, dot };
  });
}

let activo = null;

export function render(el) {
  if (state.loading && !state.positions.length) { el.innerHTML = String(mascot('loading')); return; }
  const ys = datos();
  const tot = ys.reduce((a, y) => ({ total: a.total + y.total, cub: a.cub + y.cub }), { total: 0, cub: 0 });
  const conSillas = ys.filter((y) => y.total);

  el.innerHTML = String(html`<div class="mapa" style="--ar:${W / H}">
    <div class="mapa-lienzo">
    <svg class="mapa-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Mapa de la cuenca neuquina con los yacimientos de EFiS">
      <defs>
        <radialGradient id="mp-luz" cx="45%" cy="45%" r="70%"><stop offset="0" stop-color="#14231C"/><stop offset="1" stop-color="#070B09"/></radialGradient>
        <pattern id="mp-rayas" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="7" stroke="#78B450" stroke-opacity=".12" stroke-width="1.2"/></pattern>
        <filter id="mp-brillo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      <rect width="${W}" height="${H}" rx="24" fill="url(#mp-luz)" class="mp-fondo"/>
      <path d="${relieve()}" class="mp-relieve"/>
      <g class="mp-grilla">${raw(Array.from({ length: 6 }, (_, i) => -70 + i * 0.5).map((lo) => `<line x1="${X(lo)}" y1="0" x2="${X(lo)}" y2="${H}"/>`).join('') +
        Array.from({ length: 5 }, (_, i) => -37.5 - i * 0.5).map((la) => `<line x1="0" y1="${Y(la)}" x2="${W}" y2="${Y(la)}"/>`).join(''))}</g>
      <path d="${linea(ZONA_VM)}Z" class="mp-vm"/>
      <path d="${linea(ZONA_VM)}Z" fill="url(#mp-rayas)"/>
      <text x="${X(-69.55)}" y="${Y(-38.62)}" class="mp-vm-txt">FORMACIÓN VACA MUERTA</text>
      ${raw(Object.values(RIOS).map((r) => `<path d="${curva(r)}" class="mp-rio"/>`).join(''))}
      <ellipse cx="${X(-68.72)}" cy="${Y(-38.52)}" rx="20" ry="11" class="mp-lago" transform="rotate(-25 ${X(-68.72)} ${Y(-38.52)})"/>
      <ellipse cx="${X(-68.55)}" cy="${Y(-38.62)}" rx="16" ry="8" class="mp-lago" transform="rotate(-10 ${X(-68.55)} ${Y(-38.62)})"/>
      <text x="${X(-69.7)}" y="${Y(-38.98)}" class="mp-prov">NEUQUÉN</text>
      <text x="${X(-67.95)}" y="${Y(-38.42)}" class="mp-prov">RÍO NEGRO</text>
      <text x="${X(-69.2)}" y="${Y(-37.13)}" class="mp-prov">MENDOZA</text>
      <text x="${X(-68.62)}" y="${Y(-38.73)}" class="mp-rio-txt">río Neuquén</text>
      <text x="${X(-68.1)}" y="${Y(-37.62)}" class="mp-rio-txt" transform="rotate(32 ${X(-68.1)} ${Y(-37.62)})">río Colorado</text>
      ${raw(CIUDADES.map(([n, lo, la, t]) => `<g class="mp-ciudad mp-ciudad--${t}"><circle cx="${X(lo)}" cy="${Y(la)}" r="${t === 2 ? 4 : 2.6}"/><text x="${X(lo) + 7}" y="${Y(la) + 4}">${n}</text></g>`).join(''))}
    </svg>

    <div class="mapa-puntos">${ys.map((y) => {
      const p = y.total ? pct(y.cub, y.total) : null;
      return html`<button type="button" class="mp-pt mp-pt--${y.tipo} ${activo === y.codigo ? 'is-on' : ''} ${y.total ? '' : 'is-sin'}" data-yac="${y.codigo}"
        style="left:${((X(y.lon) / W) * 100).toFixed(2)}%;top:${((Y(y.lat) / H) * 100).toFixed(2)}%" aria-label="${y.nombre}: ${y.total ? `${y.cub} de ${y.total} sillas cubiertas` : 'sin sillas'}">
        <span class="mp-pulso"></span>
        <span class="mp-ico"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${raw(ICONO[y.tipo])}</svg></span>
        <span class="mp-tag"><b>${y.codigo}</b>${p != null ? html`<i>${p}%</i>` : ''}</span>
        <span class="mp-ficha">
          <strong>${y.nombre}</strong><small>${TIPO[y.tipo]}${y.aConfirmar ? ' · ubicación a confirmar' : ''}</small>
          ${y.total ? html`<span class="mp-ficha-bar"><span style="width:${p}%"></span></span>
          <span class="mp-ficha-nums"><span><b>${y.total}</b> sillas</span><span><b>${y.cub}</b> cubiertas</span><span><b>${y.faltan}</b> faltan</span></span>` : html`<span class="mp-ficha-nums"><span>Sin sillas en el mapa de posiciones</span></span>`}
          ${y.dot != null ? html`<span class="mp-ficha-dot">${y.dot} personas en nómina</span>` : ''}
          ${y.total ? html`<span class="mp-ficha-ir">Ver sillas →</span>` : ''}
        </span>
      </button>`;
    })}</div>
    </div>

    <aside class="mapa-panel">
      <span class="mapa-kicker">EFiS · Cuenca Neuquina</span>
      <h1>Yacimientos</h1>
      <div class="mapa-tot"><b>${pct(tot.cub, tot.total)}%</b><span>${tot.cub} de ${tot.total} sillas cubiertas</span></div>
      <ul class="mapa-lista">${conSillas.sort((a, b) => b.total - a.total).map((y) => html`<li><button type="button" data-yac="${y.codigo}" class="${activo === y.codigo ? 'is-on' : ''}">
        <span class="ml-ico mp-pt--${y.tipo}"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${raw(ICONO[y.tipo])}</svg></span>
        <span class="ml-txt"><b>${y.codigo}</b><small>${y.nombre}</small></span>
        <span class="ml-bar"><span style="width:${pct(y.cub, y.total)}%"></span></span>
        <span class="ml-num">${y.cub}/${y.total}</span></button></li>`)}</ul>
      <div class="mapa-ref">${['torre', 'ciguena', 'cfp'].map((t) => html`<span><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${raw(ICONO[t])}</svg>${TIPO[t]}</span>`)}</div>
    </aside>
  </div>`);

  if (!el._mapa) {
    el._mapa = true;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-yac]');
      if (!b || !el.querySelector('.mapa')) return;
      const y = YACIMIENTOS.find((x) => x.codigo === b.dataset.yac);
      const sillas = state.positions.filter((p) => [y.codigo, ...(y.alias || [])].map(norm).includes(norm(p.yacimiento)));
      if (!sillas.length) { activo = activo === y.codigo ? null : y.codigo; render(el); return; }
      saveLocal('reclutapp.desdeMapa', { codigo: y.codigo, prev: [...posFilters.area] });
      posFilters.area = new Set([sillas[0].yacimiento]);
      location.hash = '#/posiciones';
    });
    el.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.mapa-lista [data-yac]');
      el.querySelectorAll('.mp-pt').forEach((p) => p.classList.toggle('is-hover', !!b && p.dataset.yac === b.dataset.yac));
    });
  }
}
