// "La Cigüeña": balancín (bomba de varillas) con cara de ave, mascota de la app.
// Estados: loading (bombea), empty (mira un pozo seco), success (festeja),
// error (se le soltó un bulón). Línea simple, paleta EFiS, sin texto.
import { html, raw } from '../lib/html.js';

const MSG = {
  loading: ['Bombeando datos…', 'Un toque y sale.'],
  empty: ['Pozo seco', 'No hay resultados con estos filtros. Probá sacando alguno.'],
  success: ['¡Ingreso confirmado!', 'Una silla menos para cubrir.'],
  error: ['Se nos trabó el balancín', 'Algo no cargó. Reintentá en un momento.'],
};

export function mascotSVG(stateName = 'loading', size = 160) {
  const s = stateName;
  return raw(`
<svg class="cig cig--${s}" width="${size}" height="${Math.round(size * 0.72)}" viewBox="0 0 200 144" aria-hidden="true" focusable="false">
  <g class="cig-ground">
    <path d="M8 126 H192" />
    ${s === 'empty' || s === 'error' ? '<path class="cig-crack" d="M150 126 l4 5 l-3 4 l5 4 M164 126 l-3 6 l4 3" />' : ''}
  </g>
  <!-- boca de pozo -->
  <g class="cig-well">
    <rect x="164" y="112" width="16" height="14" rx="2" />
    <path d="M160 112 H184" />
  </g>
  <!-- caja reductora + manivela (cola) -->
  <rect class="cig-box" x="44" y="100" width="28" height="26" rx="4" />
  <g class="cig-crank">
    <circle cx="58" cy="104" r="3.5" class="cig-hub" />
    <path d="M58 104 L58 88" />
    <path class="cig-weight" d="M48 84 Q58 74 68 84 L64 90 Q58 86 52 90 Z" />
  </g>
  <!-- patas (poste maestro) -->
  <g class="cig-legs">
    <path d="M86 126 L104 56" />
    <path d="M122 126 L104 56" />
    <path d="M92 104 H116" class="cig-knee" />
  </g>
  <!-- balancín con cabeza de ave -->
  <g class="cig-beam">
    <path class="cig-bar" d="M50 56 H166" />
    <path class="cig-pitman" d="M58 58 L58 90" />
    <path class="cig-tail" d="M50 56 L40 48 M50 56 L38 56 M50 56 L40 64" />
    <path class="cig-head" d="M156 46 Q176 42 178 60 Q179 74 168 80 L164 80 Q170 72 168 62 Q166 54 156 54 Z" />
    <path class="cig-beak" d="M175 60 L194 70 L176 67 Z" />
    ${s === 'error'
      ? '<path class="cig-eye-x" d="M163 52 l5 5 M168 52 l-5 5" />'
      : '<circle class="cig-eye" cx="165.5" cy="54.5" r="3" /><circle class="cig-pupil" cx="166.4" cy="55" r="1.3" />'}
    <path class="cig-cable" d="M168 80 L172 112" />
    <circle class="cig-pivot" cx="104" cy="56" r="4" />
  </g>
  ${s === 'empty' ? '<text class="cig-q" x="182" y="40">?</text><path class="cig-dust" d="M170 122 q4 -6 8 0 q4 -6 8 0" />' : ''}
  ${s === 'success' ? `<g class="cig-spurt">
      <circle cx="172" cy="104" r="3" class="d1"/><circle cx="172" cy="104" r="2.5" class="d2"/>
      <circle cx="172" cy="104" r="3" class="d3"/><circle cx="172" cy="104" r="2" class="d4"/>
      <circle cx="172" cy="104" r="2.5" class="d5"/>
    </g>` : ''}
  ${s === 'error' ? '<g class="cig-bolt"><circle cx="128" cy="118" r="3" /><path d="M128 118 l6 -3" /></g><path class="cig-swirl" d="M160 34 q6 -6 10 0 q-4 6 -10 2" />' : ''}
</svg>`);
}

export function mascot(stateName = 'loading', { title, text, size = 160, compact = false, action } = {}) {
  const [t, d] = MSG[stateName] || MSG.loading;
  return html`<div class="mascot ${compact ? 'mascot--compact' : ''}" role="${stateName === 'error' ? 'alert' : 'status'}">
    ${mascotSVG(stateName, size)}
    <div class="mascot-text">
      <strong>${title ?? t}</strong>
      ${(text ?? d) ? html`<span>${text ?? d}</span>` : ''}
      ${action || ''}
    </div>
  </div>`;
}
