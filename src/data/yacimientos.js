// Ubicación de los yacimientos para el mapa de inicio (coordenadas aproximadas,
// a confirmar con RRHH / Operaciones). `tipo` define el ícono del punto:
// 'torre' = torre de perforación (desarrollo no convencional),
// 'ciguena' = cigüeña / bombeo mecánico (convencional),
// 'cfp' = planta de procesamiento (CPF / EPF; `instalaciones` detalla cuáles),
// 'camion' = unidad móvil, 'arena' = centro de distribución de arena, 'oficina' = base administrativa.
export const YACIMIENTOS = [
  // Centros de los polígonos oficiales (Subsecretaría de Hidrocarburos de Neuquén, capa Hidrocarburos:Areas)
  { codigo: 'FDP', nombre: 'Fortín de Piedra', lon: -69.07, lat: -38.55, tipo: 'cfp', instalaciones: 'CPF' },
  { codigo: 'LT2E', nombre: 'Los Toldos II Este', lon: -69.153, lat: -37.444, tipo: 'cfp', instalaciones: 'CPF · EPF' },
  { codigo: 'LT1N', nombre: 'Los Toldos I Norte', lon: -69.44, lat: -37.623, tipo: 'torre' },
  // CDA: centro de distribución de arena, en Los Toldos II Este (se dibuja apenas al lado para que no se superponga)
  { codigo: 'CDA', nombre: 'Centro de distribución de arena', lon: -69.10, lat: -37.415, tipo: 'arena' },
  // unidad móvil de transporte de arena: sin lugar fijo, se ubica junto a Los Toldos
  { codigo: 'TLM', nombre: 'TLM · transporte de arena', lon: -69.28, lat: -37.54, tipo: 'camion', movil: true },
  { codigo: 'LBAS', nombre: 'Los Bastos', lon: -68.64, lat: -38.904, tipo: 'ciguena' },
  // Río Negro (fuera de la capa de Neuquén): ~50 km al sur de Catriel
  { codigo: 'ASAL', nombre: 'Agua Salada', lon: -67.86, lat: -38.32, tipo: 'ciguena', aproximada: true },
  { codigo: 'NQN', nombre: 'Oficina Neuquén', lon: -68.06, lat: -38.95, tipo: 'oficina', alias: ['Oficina NQN'] },
];

export const CIUDADES = [
  ['Neuquén', -68.06, -38.95, 2], ['Añelo', -68.79, -38.35, 1], ['Rincón de los Sauces', -68.93, -37.39, 1],
  ['Cutral Có', -69.23, -38.93, 1], ['Centenario', -68.13, -38.83, 0], ['Catriel', -67.79, -37.88, 1],
  ['Allen', -67.83, -38.98, 0], ['Plottier', -68.23, -38.95, 0],
];
