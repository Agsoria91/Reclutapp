// Ubicación de los yacimientos para el mapa de inicio (coordenadas aproximadas,
// a confirmar con RRHH / Operaciones). `tipo` define el ícono del punto:
// 'torre' = torre de perforación (desarrollo no convencional),
// 'ciguena' = cigüeña / bombeo mecánico (convencional),
// 'cfp' = planta de procesamiento (CPF / EPF; `instalaciones` detalla cuáles),
// 'camion' = unidad móvil, 'oficina' = base administrativa.
export const YACIMIENTOS = [
  // Global Energy Monitor (gem.wiki): -38.548, -69.095
  { codigo: 'FDP', nombre: 'Fortín de Piedra', lon: -69.095, lat: -38.548, tipo: 'cfp', instalaciones: 'CPF' },
  // ~30 km al sur de Rincón de los Sauces (Hub Norte de Vaca Muerta)
  { codigo: 'LT2E', nombre: 'Los Toldos II Este', lon: -68.92, lat: -37.64, tipo: 'cfp', instalaciones: 'CPF · EPF', aproximada: true },
  { codigo: 'LT1N', nombre: 'Los Toldos I Norte', lon: -69.10, lat: -37.55, tipo: 'torre', aproximada: true },
  // unidad móvil de transporte de arena: sin lugar fijo, se ubica junto a Los Toldos
  { codigo: 'TLM', nombre: 'TLM · transporte de arena', lon: -68.80, lat: -37.72, tipo: 'camion', movil: true },
  // CDA opera dentro de Los Toldos II Este (se dibuja apenas al lado para que no se superponga)
  { codigo: 'CDA', nombre: 'CDA · Los Toldos II Este', lon: -68.84, lat: -37.60, tipo: 'torre', aproximada: true },
  // sobre la Dorsal de Huincul, cerca de Senillosa
  { codigo: 'LBAS', nombre: 'Los Bastos', lon: -68.62, lat: -38.93, tipo: 'ciguena', aproximada: true },
  // ~50 km al sur de Catriel (Río Negro)
  { codigo: 'ASAL', nombre: 'Agua Salada', lon: -67.86, lat: -38.32, tipo: 'ciguena', aproximada: true },
  { codigo: 'NQN', nombre: 'Oficina Neuquén', lon: -68.06, lat: -38.95, tipo: 'oficina', alias: ['Oficina NQN'] },
];

export const CIUDADES = [
  ['Neuquén', -68.06, -38.95, 2], ['Añelo', -68.79, -38.35, 1], ['Rincón de los Sauces', -68.93, -37.39, 1],
  ['Cutral Có', -69.23, -38.93, 1], ['Centenario', -68.13, -38.83, 0], ['Catriel', -67.79, -37.88, 1],
  ['Allen', -67.83, -38.98, 0], ['Plottier', -68.23, -38.95, 0],
];
