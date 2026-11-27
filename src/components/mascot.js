// Ilustraciones de estado (sin datos, error, éxito) en el mismo trazo de línea
// que los íconos del menú. Paleta EFiS, sin texto.
import { html, raw } from '../lib/html.js';

const MSG = {
  loading: ['Cargando datos', ''],
  empty: ['Sin resultados', ''],
  success: ['¡Ingreso confirmado!', ''],
  error: ['No se pudo cargar', 'Reintentá en un momento.'],
};

export function mascotSVG(stateName = 'empty', size = 120) {
  const w = size, h = Math.round(size * 0.75);
  const base = `<svg class="ilu ilu--${stateName}" width="${w}" height="${h}" viewBox="0 0 160 120" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`;
  const piso = '<path class="ilu-piso" d="M20 104h120"/>';
  const dibujos = {
    // carpeta vacía con una lupa
    empty: `${piso}<path class="ilu-linea" d="M34 40h30l8 9h48a6 6 0 0 1 6 6v41a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6z"/>
      <path class="ilu-suave" d="M46 66h40M46 78h28"/>
      <circle class="ilu-acento" cx="108" cy="70" r="13"/><path class="ilu-acento" d="m118 80 10 10"/>`,
    // aviso con signo de exclamación
    error: `${piso}<path class="ilu-linea" d="M80 26 122 98H38z"/><path class="ilu-alerta" d="M80 52v22M80 84v1"/>`,
    // tilde dentro de un círculo, con destellos
    success: `${piso}<circle class="ilu-linea" cx="80" cy="60" r="30"/><path class="ilu-acento" d="m66 61 10 10 20-22"/>
      <path class="ilu-suave" d="M80 18v8M116 34l-6 5M44 34l6 5M124 64h-8M36 64h8"/>`,
  };
  return raw(base + (dibujos[stateName] || dibujos.empty) + '</svg>');
}

export function mascot(stateName = 'loading', { title, text, size = 160, compact = false, action } = {}) {
  // cargando: silueta gris de la pantalla (encabezado, indicadores y listado) en lugar de la animación
  if (stateName === 'loading' && !title && !text) {
    const linea = (w) => `<span class="sk" style="width:${w}%"></span>`;
    return raw(`<div class="esqueleto" role="status" aria-label="Cargando datos">
      <div class="sk-head">${linea(28)}${linea(18)}</div>
      <div class="sk-kpis">${[1, 2, 3, 4].map(() => `<div>${linea(45)}<span class="sk sk--num"></span>${linea(70)}</div>`).join('')}</div>
      <div class="sk-card">${[92, 84, 88, 76, 90, 80].map((w) => `<div class="sk-fila">${linea(w)}</div>`).join('')}</div>
    </div>`);
  }
  const [t, d] = MSG[stateName] || MSG.loading;
  return html`<div class="mascot ${compact ? 'mascot--compact' : ''}" role="${stateName === 'error' ? 'alert' : 'status'}">
    ${mascotSVG(stateName, Math.min(size, 140))}
    <div class="mascot-text">
      <strong>${title ?? t}</strong>
      ${(text ?? d) ? html`<span>${text ?? d}</span>` : ''}
      ${action || ''}
    </div>
  </div>`;
}
