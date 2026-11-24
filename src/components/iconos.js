// Íconos de línea (24×24, trazo 1.75) para la navegación y los indicadores.
// Dibujados para esta app; toman el color del texto (stroke: currentColor).
import { raw } from '../lib/html.js';

const P = {
  posiciones: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M17 13.5v7M13.5 17h7"/>',
  candidatos: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.6"/>',
  entrevistas: '<path d="M4 5.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5z"/><path d="M19 9.5h1a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-.5v2.5l-3-2.5H12"/>',
  dashboardpj: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18"/>',
  examenes: '<path d="M3 12h4l2-4.5 3.5 9L15 11h6"/><path d="M12 21s-7.5-4.6-9.2-9.5M12 21s7.5-4.6 9.2-9.5M3.3 8.5C3.9 5.6 6 4 8.3 4c1.6 0 2.9.8 3.7 2 .8-1.2 2.1-2 3.7-2 2.3 0 4.4 1.6 5 4.5"/>',
  ingresos: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M14 8l4 4-4 4M9 12h9"/>',
  legajos: '<path d="M3.5 7.5V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-7L9.5 5H5.5a2 2 0 0 0-2 2.5z"/>',
  nomina: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.3"/><path d="M5.8 16.2c.5-1.7 1.7-2.6 3.2-2.6s2.7.9 3.2 2.6M14.5 10h4M14.5 13.5h3"/>',
  importar: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  usuarios: '<path d="M12 3l7.5 3v5.5c0 4.4-3.1 8-7.5 9.5-4.4-1.5-7.5-5.1-7.5-9.5V6z"/><circle cx="12" cy="10.5" r="2.3"/><path d="M8.6 16c.6-1.5 1.8-2.3 3.4-2.3s2.8.8 3.4 2.3"/>',
  personas: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.7-4 3.7-6.2 7.5-6.2s6.8 2.2 7.5 6.2"/>',
  cobertura: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  alta: '<circle cx="10" cy="8" r="3.6"/><path d="M3 20c.7-3.8 3.4-5.8 7-5.8 1.6 0 3 .4 4.1 1.1M18.5 14v6M15.5 17h6"/>',
  reloj: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M12 12.5v3l2 1.5"/>',
  filtro: '<path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2z"/>',
  buscar: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9"/>',
  documento: '<path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13.5 3.5V8h5M8.5 12.5h7M8.5 16h5"/>',
  flecha: '<path d="M9 6l6 6-6 6"/>',
};

export const icono = (nombre, clase = 'ico') =>
  raw(`<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nombre] || ''}</svg>`);
