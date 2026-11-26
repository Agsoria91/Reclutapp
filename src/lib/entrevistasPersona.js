// Una persona puede tener varias entrevistas (un registro de candidato por
// cada área/sector). Se vinculan por DNI; cada registro avanza o se cancela
// por su cuenta.
import { state } from './store.js';

const dniDe = (c) => String(c?.dni ?? '').replace(/\D/g, '');

export function otrasEntrevistas(c) {
  const d = dniDe(c);
  if (!d || !c?.id) return [];
  return state.candidates.filter((x) => x.id !== c.id && dniDe(x) === d);
}

// Sigue en proceso por otra entrevista (ni cancelada ni ya ingresada)
export const sigueEnOtroProceso = (c) => otrasEntrevistas(c).some((x) => x.stage !== 'cancelado');

// Datos de la persona que se copian a una entrevista nueva y se pueden
// actualizar en todas sus entrevistas a la vez.
export const CAMPOS_PERSONA = ['nombre', 'dni', 'cuil', 'fecha_nacimiento', 'telefono', 'mail', 'domicilio', 'localidad',
  'codigo_postal', 'provincia', 'procedencia', 'talle_mameluco', 'talle_botas', 'talle_campera'];

// El archivo del CV puede estar compartido entre entrevistas de la misma persona.
export const cvCompartido = (path, exceptId) => !!path && state.candidates.some((x) => x.id !== exceptId && x.cv_path === path);
