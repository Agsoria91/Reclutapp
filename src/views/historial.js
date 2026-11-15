// Historial de una silla en pantalla completa: para proyectar en reunión o
// guardar como PDF. Solo RRHH (la ruta está marcada staff en main.js y los
// datos salen de tablas que la vista pública no puede leer).
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { fmtDate, todayISO } from '../lib/format.js';
import { mascot } from '../components/mascot.js';
import { stagePill } from '../components/ui.js';
import { historialSilla } from '../components/historial.js';

export function render(el, params) {
  if (state.loading && !state.positions.length) { el.innerHTML = String(mascot('loading')); return; }
  if (state.error) { el.innerHTML = String(mascot('error', { text: state.error })); return; }
  const p = state.positions.find((x) => x.id === params.get('id'));
  if (!p) { el.innerHTML = String(mascot('empty', { text: 'No encontré esa silla.' })); return; }
  const est = params.get('est') === '1';
  const toggle = `#/historial?id=${p.id}${est ? '' : '&est=1'}`;

  el.innerHTML = String(html`
  <div class="present">
    <div class="present-tools no-print">
      <a class="btn btn--ghost" href="#/posiciones">← Volver</a>
      <a class="btn btn--ghost" href="${toggle}">${est ? 'Ver solo esta silla' : 'Sumar estimado (misma búsqueda)'}</a>
      <span class="muted">Para PDF: Imprimir → "Guardar como PDF", horizontal.</span>
      <button class="btn btn--primary" type="button" data-print>Imprimir / PDF</button>
    </div>
    <header class="present-head">
      <img src="./brand/efis-isologo.svg" alt="EFiS Energy Field Services" class="present-logo brand-logo--color">
      <img src="./brand/efis-isologo-negativo.svg" alt="" aria-hidden="true" class="present-logo brand-logo--mono">
      <div>
        <h1>Historial · ${p.puesto}</h1>
        <p>${[p.yacimiento, p.sector, p.pos_sap ? 'POS ' + p.pos_sap : ''].filter(Boolean).join(' · ')} — al ${fmtDate(todayISO())}
          ${stagePill(p.stage, { small: true })}</p>
      </div>
    </header>
    ${historialSilla(p, { conEstimados: est })}
    <p class="present-foot">Uso interno RRHH — contiene nombres y motivos de baja.</p>
  </div>`);
  el.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  el.querySelectorAll('[data-act="hist-est"],[data-act="hist-real"]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = toggle; }));
}
