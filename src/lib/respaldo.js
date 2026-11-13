// Respaldo completo descargable (solo RRHH): todas las tablas en un archivo
// JSON con fecha. Se genera en el navegador con la sesión del usuario; no pasa
// por ningún otro servidor. Sirve para guardar copias propias (p. ej. en el
// OneDrive/Drive corporativo) y, si hiciera falta, restaurar los datos.
import { fetchAll } from './supabase.js';
import { todayISO } from './format.js';
import { loadLocal, saveLocal } from '../components/ui.js';

const KEY = 'reclutapp.ultimoRespaldo';
const TABLAS = [
  ['positions', 'id'], ['candidates', 'id'], ['position_candidates', 'position_id'],
  ['nomina', 'id'], ['stages', 'orden'], ['stage_aliases', 'alias'], ['staff', 'email'],
];

export async function descargarRespaldo() {
  const datos = {};
  for (const [t, orden] of TABLAS) datos[t] = await fetchAll(t, '*', orden);
  const archivo = {
    app: 'Reclutamiento EFiS', generado: new Date().toISOString(),
    conteos: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.length])),
    datos,
  };
  const blob = new Blob([JSON.stringify(archivo)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reclutapp_respaldo_${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  saveLocal(KEY, new Date().toISOString());
  return archivo.conteos;
}

// días desde el último respaldo descargado en este navegador (null = nunca)
export function diasDesdeRespaldo() {
  const f = loadLocal(KEY, null);
  return f ? Math.floor((Date.now() - Date.parse(f)) / 864e5) : null;
}
