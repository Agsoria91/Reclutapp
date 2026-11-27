// Un color por yacimiento (sutil, distinto entre sí y legible en claro y oscuro).
// Se aplica solo en etiquetas, chips, barras y una marca junto al nombre en tablas.
const PALETA = { FDP: '#2F7FC1', LT2E: '#14967F', LT1N: '#7A5AA6', CDA: '#C8891E', TLM: '#C0577A', LBAS: '#6B8E23', ASAL: '#5B7186', NQN: '#8A6E4B' };
const EXTRA = ['#3E8E9E', '#A0522D', '#8E6BBF', '#B0803A'];
const ALIAS = { 'OFICINA NQN': 'NQN', 'OFICINA NEUQUEN': 'NQN', 'OFICINA NEUQUÉN': 'NQN' };

export function colorYac(nombre) {
  const t = String(nombre ?? '').trim().toUpperCase();
  if (!t || t === 'SIN DATO' || t === '—') return null;
  const k = ALIAS[t] || t.split(/[\s·]/)[0];
  if (PALETA[k]) return PALETA[k];
  let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA[h % EXTRA.length];
}

// Marca los elementos de yacimiento dentro de un contenedor (se llama después de cada dibujo)
export function pintarYacimientos(raiz) {
  raiz.querySelectorAll('.area-tag:not([data-yac]), .pend-areas .chip:not([data-yac])').forEach((el) => {
    const c = colorYac(el.textContent); el.dataset.yac = ''; if (c) el.style.setProperty('--yac', c);
  });
  raiz.querySelectorAll('.bars-btn[data-filter="yacimiento"]:not([data-yac]), .bars-btn[data-filter="area"]:not([data-yac])').forEach((el) => {
    const c = colorYac(el.dataset.value); el.dataset.yac = ''; if (c) el.style.setProperty('--yac', c);
  });
  raiz.querySelectorAll('td[data-th="Área"]:not([data-yac]), td[data-th="Yac."]:not([data-yac]), td[data-th="Yac. · Sector"]:not([data-yac])').forEach((el) => {
    const c = colorYac(el.textContent); el.dataset.yac = ''; if (c) { el.style.setProperty('--yac', c); el.classList.add('yac-dot'); }
  });
}
