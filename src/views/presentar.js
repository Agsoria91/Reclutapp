// Modo reunión: vista limpia para proyectar o imprimir/guardar como PDF.
// Sin navegación ni controles de edición. Nunca muestra datos sensibles,
// aunque quien la abra esté logueado como RRHH.
import { html, raw } from '../lib/html.js';
import { state } from '../lib/store.js';
import { fmtDate, fmtMonth, todayISO, pct, fmtInt } from '../lib/format.js';
import { applyFilters, positionKpis, pendingByTarget, isCovered, hasPerson, isLate } from '../lib/kpis.js';
import { stagePill } from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { posGetters, pendingTable } from './posiciones.js';

export function render(el, params) {
  if (state.loading && !state.positions.length) { el.innerHTML = String(mascot('loading')); return; }
  if (state.error) { el.innerHTML = String(mascot('error', { text: state.error })); return; }

  const f = {};
  for (const d of ['area', 'sector', 'stage', 'cobertura']) f[d] = new Set((params.get(d) || '').split('|').filter(Boolean));
  let rows = applyFilters(state.positions, f, posGetters);
  const soloPend = params.get('pend') === '1';
  if (soloPend) rows = rows.filter((p) => !isCovered(p));
  const today = todayISO();
  const k = positionKpis(rows, today);
  const pend = pendingByTarget(rows, today);

  const groups = new Map();
  for (const p of rows) {
    const key = `${p.yacimiento} · ${p.sector || 'Sin sector'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const filtro = [...f.area, ...f.sector, ...f.stage, ...f.cobertura].join(' · ') || 'Todas las áreas';
  const back = '#/posiciones';

  el.innerHTML = String(html`
  <div class="present">
    <div class="present-tools no-print">
      <a class="btn btn--ghost" href="${back}">← Volver</a>
      <span class="muted">Consejo: en el diálogo de impresión elegí "Guardar como PDF" y orientación horizontal.</span>
      <button class="btn btn--primary" onclick="window.print()">Imprimir / PDF</button>
    </div>
    <header class="present-head">
      <img src="./brand/tecpetrol-isologo.svg" alt="Tecpetrol" class="present-logo">
      <div>
        <h1>Mapa de posiciones · EFiS</h1>
        <p>${filtro}${soloPend ? ' · solo pendientes' : ''} — al ${fmtDate(today)}</p>
      </div>
    </header>
    <section class="kpis kpis--present">
      <div class="kpi"><span class="kpi-label">Sillas</span><span class="kpi-value">${fmtInt(k.total)}</span></div>
      <div class="kpi kpi--green"><span class="kpi-label">Cubiertas</span><span class="kpi-value">${fmtInt(k.cubiertas)}</span><span class="kpi-sub">${pct(k.cubiertas, k.total)}%</span></div>
      <div class="kpi kpi--blue kpi--big"><span class="kpi-label">Faltan cubrir</span><span class="kpi-value">${fmtInt(k.pendientes)}</span></div>
      <div class="kpi kpi--navy"><span class="kpi-label">En proceso</span><span class="kpi-value">${fmtInt(k.enProceso)}</span></div>
      <div class="kpi kpi--orange"><span class="kpi-label">Sin candidato</span><span class="kpi-value">${fmtInt(k.sinCandidato)}</span></div>
      <div class="kpi ${k.vencidas ? 'kpi--red' : ''}"><span class="kpi-label">Vencidas</span><span class="kpi-value">${fmtInt(k.vencidas)}</span></div>
    </section>
    ${pend.length ? html`<section class="present-block"><h2>Faltan cubrir, por mes objetivo</h2>${pendingTable(pend, k.pendientes)}</section>` : ''}
    <section class="present-grid">
      ${[...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([g, ps]) => {
        const cub = ps.filter(isCovered).length;
        ps.sort((a, b) => a.puesto.localeCompare(b.puesto, 'es', { numeric: true }));
        return html`<article class="present-group">
          <h3>${g} <small>${cub}/${ps.length}</small></h3>
          <table class="tbl tbl--compact"><tbody>${ps.map((p) => html`<tr>
            <td>${p.puesto}</td>
            <td>${hasPerson(p) ? p.candidato_nombre : html`<span class="muted">— vacante —</span>`}</td>
            <td>${stagePill(p.stage, { small: true })}</td>
            <td class="${isLate(p, today) ? 'is-late-txt' : 'muted'}">${p.fecha_objetivo ? fmtMonth(p.fecha_objetivo, { short: true }) : ''}</td>
          </tr>`)}</tbody></table>
        </article>`;
      })}
    </section>
    <footer class="present-foot">Reclutamiento EFiS · Tecpetrol ${raw('&middot;')} generado ${new Date().toLocaleString('es-AR')}</footer>
  </div>`);
}
