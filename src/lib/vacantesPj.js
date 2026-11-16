// Planilla "Status_Vacantes" (búsquedas de la compañía) -> filas de EFiS.
// Se reconocen las columnas por nombre (sin importar mayúsculas, acentos ni
// el orden), y se descartan las filas de otras empresas (Tecpetrol, etc.).
import { parseCSV, guessSeparator } from './csv.js';
import { generoDeTexto } from './genero.js';

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// campo -> encabezados posibles (normalizados)
const COLS = {
  empresa: ['empresa'],
  s: ['s', 'id', 'nro', 'numero'],
  posicion: ['posicion', 'puesto'],
  descripcion: ['descripcion posicion', 'descripcion'],
  diagrama: ['diagrama'],
  persona: ['persona'],
  fecha_solicitud: ['fecha solicitud de linea', 'fecha solicitud'],
  fecha_potencial_ingreso: ['fecha potencial ingreso', 'fecha potencial de ingreso'],
  proceso: ['proceso'],
  estado: ['estado'],
  jefe: ['jefe nombre', 'jefe'],
  gerencia: ['gerencia jefatura', 'gerencia'],
  agrupador: ['agrupadorgerencia', 'agrupador gerencia'],
  direccion: ['direccion'],
  reclutador: ['reclutador a', 'reclutador', 'reclutadora'],
  pendientes: ['pendientes'],
  genero: ['sexo', 'genero', 'genero sexo', 'sexo genero'],
};

// dd/mm/aaaa (o d/m/aa) -> aaaa-mm-dd
export function fechaISO(v) {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  const dd = +d; const mm = +mo;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export const esEFiS = (empresa) => norm(empresa) === 'efis';

export function parseVacantesCSV(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const rows = parseCSV(text, guessSeparator(firstLine)).filter((r) => r.some((x) => String(x).trim()));
  if (rows.length < 2) throw new Error('El archivo está vacío.');
  const head = rows[0].map(norm);
  const idx = {};
  for (const [campo, alias] of Object.entries(COLS)) {
    const i = head.findIndex((h) => alias.includes(h));
    if (i >= 0) idx[campo] = i;
  }
  const faltan = ['empresa', 's', 'posicion', 'estado'].filter((k) => idx[k] == null);
  if (faltan.length) throw new Error(`No parece la planilla de Status de Vacantes: faltan las columnas ${faltan.join(', ')}.`);

  const val = (r, k) => (idx[k] == null ? null : String(r[idx[k]] ?? '').replace(/ /g, ' ').trim() || null);
  const datos = rows.slice(1);
  const avisos = [];
  const out = [];
  const vistos = new Set();
  for (const r of datos) {
    if (!esEFiS(val(r, 'empresa'))) continue;
    const s = val(r, 's');
    if (!s) { avisos.push(`Fila sin número "S": ${val(r, 'posicion') || '(sin puesto)'} — se omite.`); continue; }
    if (vistos.has(s)) { avisos.push(`La búsqueda S ${s} está repetida — se toma la primera.`); continue; }
    vistos.add(s);
    const row = {
      s, empresa: 'EFiS',
      posicion: val(r, 'posicion'), descripcion: val(r, 'descripcion'), diagrama: val(r, 'diagrama'),
      persona: val(r, 'persona'),
      fecha_solicitud: fechaISO(val(r, 'fecha_solicitud')),
      fecha_potencial_ingreso: fechaISO(val(r, 'fecha_potencial_ingreso')),
      proceso: val(r, 'proceso'), estado: val(r, 'estado'), jefe: val(r, 'jefe'), gerencia: val(r, 'gerencia'),
      agrupador: val(r, 'agrupador'), direccion: val(r, 'direccion'), reclutador: val(r, 'reclutador'),
      pendientes: val(r, 'pendientes'),
      genero: generoDeTexto(val(r, 'genero')),
    };
    for (const k of ['fecha_solicitud', 'fecha_potencial_ingreso']) {
      if (val(r, k) && !row[k]) avisos.push(`S ${s}: no entiendo la fecha "${val(r, k)}" — queda vacía.`);
    }
    out.push(row);
  }
  return { rows: out, totalArchivo: datos.length, otrasEmpresas: datos.length - out.length - avisos.filter((a) => a.startsWith('Fila sin')).length, avisos };
}

// ---------------------------------------------------------------------------
// Agrupación de estados para los indicadores
// ---------------------------------------------------------------------------
export const ESTADOS = [
  // [texto normalizado, etiqueta, grupo, color]
  ['apertura', 'Apertura', 'proceso', 'sky'],
  ['entrevistas', 'Entrevistas', 'proceso', 'blue'],
  ['examen medico', 'Examen médico', 'proceso', 'orange'],
  ['oferta', 'Oferta', 'proceso', 'violet'],
  ['cerrado', 'Cerrado', 'cerrada', 'green'],
  ['on hold', 'On hold', 'espera', 'neutral'],
  ['pendiente definicion linea', 'Pendiente definición línea', 'espera', 'yellow'],
];
export function estadoInfo(estado) {
  const n = norm(estado);
  const e = ESTADOS.find(([k]) => k === n);
  if (e) return { label: e[1], grupo: e[2], color: e[3], orden: ESTADOS.indexOf(e) };
  if (!n) return { label: 'Sin estado', grupo: 'sin', color: 'neutral', orden: 98 };
  return { label: String(estado).trim(), grupo: 'proceso', color: 'navy', orden: 50 };
}
export const esVacante = (v) => !v.persona || norm(v.persona) === 'vacante';
