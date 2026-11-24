// Ubicación de los yacimientos para el mapa de inicio (coordenadas aproximadas,
// a confirmar con RRHH / Operaciones). `tipo` define el ícono del punto:
// 'torre' = torre de perforación (desarrollo no convencional),
// 'ciguena' = cigüeña / bombeo mecánico (convencional),
// 'cfp' = central / planta de facilidades de producción,
// 'oficina' = base administrativa.
export const YACIMIENTOS = [
  { codigo: 'FDP', nombre: 'Fortín de Piedra', lon: -68.97, lat: -38.16, tipo: 'cfp' },
  { codigo: 'LT2E', nombre: 'Los Toldos II Este', lon: -68.83, lat: -37.95, tipo: 'torre' },
  { codigo: 'LT1N', nombre: 'Los Toldos I Norte', lon: -69.02, lat: -37.80, tipo: 'torre' },
  { codigo: 'CDA', nombre: 'CDA', lon: -68.62, lat: -38.27, tipo: 'torre', aConfirmar: true },
  { codigo: 'TLM', nombre: 'TLM', lon: -69.25, lat: -38.30, tipo: 'torre', aConfirmar: true },
  { codigo: 'LBAS', nombre: 'Los Bastos', lon: -69.30, lat: -38.70, tipo: 'ciguena', aConfirmar: true },
  { codigo: 'ASAL', nombre: 'Agua Salada', lon: -67.98, lat: -38.02, tipo: 'ciguena' },
  { codigo: 'NQN', nombre: 'Oficina Neuquén', lon: -68.06, lat: -38.95, tipo: 'oficina', alias: ['Oficina NQN'] },
];

export const CIUDADES = [
  ['Neuquén', -68.06, -38.95, 2], ['Añelo', -68.79, -38.35, 1], ['Rincón de los Sauces', -68.93, -37.39, 1],
  ['Cutral Có', -69.23, -38.93, 1], ['Centenario', -68.13, -38.83, 0], ['Catriel', -67.79, -37.88, 1],
  ['Allen', -67.83, -38.98, 0], ['Plottier', -68.23, -38.95, 0],
];
