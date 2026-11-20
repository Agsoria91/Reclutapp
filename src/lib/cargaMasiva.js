// Carga masiva de candidatos desde una plantilla de Excel.
// 1) plantillaCargaMasiva() arma el libro (hoja Candidatos con desplegables,
//    Instrucciones y Listas). 2) leerCargaMasiva() lee la planilla completa,
//    valida cada fila y marca duplicados contra los candidatos existentes.
import { leerXlsx, serialAISO } from './xlsxRead.js';
import { buscarLocalidad, LOCALIDADES_REGION, PROVINCIAS_AR } from '../data/localidades.js';

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();

// [campo en la base, encabezado, ancho, tipo, lista]
export const COLUMNAS = [
  ['nombre', 'Nombre y apellido *', 30, 'texto'],
  ['dni', 'DNI', 12, 'texto'],
  ['cuil', 'CUIL', 15, 'texto'],
  ['fecha_nacimiento', 'Fecha de nacimiento', 14, 'fecha'],
  ['telefono', 'Teléfono', 15, 'texto'],
  ['mail', 'Mail', 28, 'texto'],
  ['domicilio', 'Domicilio', 28, 'texto'],
  ['localidad', 'Localidad', 22, 'texto', 'localidad'],
  ['codigo_postal', 'Código postal', 10, 'texto'],
  ['provincia', 'Provincia', 14, 'texto', 'provincia'],
  ['area', 'Área *', 9, 'texto', 'area'],
  ['servicio', 'Servicio / Sector', 18, 'texto', 'servicio'],
  ['posicion', 'Posición', 24, 'texto', 'posicion'],
  ['procedencia', 'Procedencia', 18, 'texto', 'procedencia'],
  ['cv_recibido', 'CV recibido', 12, 'fecha'],
  ['comentarios', 'Comentarios', 36, 'texto'],
];
const LISTAS = ['area', 'servicio', 'posicion', 'procedencia', 'localidad', 'provincia'];
const TITULO_LISTA = { area: 'Área', servicio: 'Servicio / Sector', posicion: 'Posición', procedencia: 'Procedencia', localidad: 'Localidad', provincia: 'Provincia' };

const unicos = (vals) => {
  const m = new Map();
  for (const v of vals) { const s = String(v ?? '').trim(); if (s && !m.has(norm(s))) m.set(norm(s), s); }
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'es'));
};

export function opcionesPlantilla({ positions = [], candidates = [] } = {}) {
  return {
    area: unicos([...positions.map((p) => p.yacimiento), ...candidates.map((c) => c.area)]),
    servicio: unicos(candidates.map((c) => c.servicio)).filter((v) => !/^a definir$|^-$/i.test(v)),
    posicion: unicos(candidates.map((c) => c.posicion)).filter((v) => !/^a definir$/i.test(v)),
    procedencia: unicos(candidates.map((c) => c.procedencia)),
    localidad: [...LOCALIDADES_REGION].sort((a, b) => a.localeCompare(b, 'es')),
    provincia: PROVINCIAS_AR,
  };
}

const colLetra = (i) => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

export function plantillaCargaMasiva(opciones) {
  const largo = Math.max(...LISTAS.map((k) => opciones[k].length), 1);
  const listas = {
    name: 'Listas',
    columns: LISTAS.map((k) => ({ header: TITULO_LISTA[k], width: 24 })),
    rows: Array.from({ length: largo }, (_, i) => LISTAS.map((k) => opciones[k][i] ?? null)),
  };
  const validations = COLUMNAS.map(([, , , , lista], col) => (lista ? {
    col, lista: `Listas!$${colLetra(LISTAS.indexOf(lista))}$2:$${colLetra(LISTAS.indexOf(lista))}$${Math.max(2, opciones[lista].length + 1)}`,
  } : null)).filter(Boolean);
  const ejemplo = ['Ejemplo Persona (borrar esta fila)', '30123456', '20-30123456-7', '1990-05-14', '299 154 123456', 'persona@ejemplo.com',
    'Calle 123', 'Neuquén', '8300', 'Neuquén', opciones.area[0] || 'LT2E', opciones.servicio[0] || '', opciones.posicion[0] || '',
    opciones.procedencia[0] || '', null, ''];
  return [
    {
      name: 'Candidatos', title: 'Carga masiva de candidatos · EFiS',
      note: 'Completá una persona por fila desde la fila 5. * = obligatorio. No cambies los encabezados. Fechas en formato dd/mm/aaaa.',
      columns: COLUMNAS.map(([, header, width]) => ({ header, width })),
      rows: [ejemplo],
      validations,
    },
    {
      name: 'Instrucciones', title: 'Cómo completar la plantilla',
      columns: [{ header: 'Columna', width: 22 }, { header: 'Qué cargar', width: 90 }],
      rows: [
        ['Nombre y apellido *', 'Obligatorio. Como figura en el DNI (Apellido Nombre o Nombre Apellido, siempre igual).'],
        ['DNI / CUIL', 'Opcionales. Si el DNI ya existe en la app, la fila se marca como duplicada y no se carga.'],
        ['Fechas', 'dd/mm/aaaa. Si "CV recibido" queda vacío se toma la fecha del día de la carga.'],
        ['Localidad', 'Elegí de la lista (región). Si es otra, escribila: se acepta igual. Provincia y CP se completan solos si están vacíos.'],
        ['Área *', 'Obligatorio. LT2E, FDP, CDA, LBAS, etc.'],
        ['Servicio / Posición / Procedencia', 'Elegí de las listas para que los reportes agrupen bien. Un valor nuevo se acepta con aviso.'],
        ['Etapa', 'Todos los candidatos entran en "CV Recibido". Después se avanzan desde la app.'],
        ['Carga', 'En Candidatos → Carga masiva → Subir planilla. Antes de guardar se muestra una vista previa con lo que se va a cargar.'],
      ],
    },
    listas,
  ];
}

// ---------------------------------------------------------------------------
function aFecha(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return serialAISO(v);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return 'invalida';
}
const texto = (v) => (v == null ? null : (typeof v === 'number' ? String(Math.round(v) === v ? v : v) : String(v)).replace(/ /g, ' ').trim() || null);

export function leerCargaMasiva(buffer, existentes = [], hoy = new Date().toISOString().slice(0, 10)) {
  const hojas = leerXlsx(buffer);
  const hoja = hojas.find((h) => norm(h.nombre) === 'candidatos') || hojas[0];
  if (!hoja) throw new Error('La planilla está vacía.');
  const hi = hoja.filas.findIndex((f) => (f || []).some((c) => norm(c) === 'nombre y apellido'));
  if (hi < 0) throw new Error('No encuentro la columna "Nombre y apellido". Usá la plantilla descargada desde la app.');
  const head = hoja.filas[hi].map(norm);
  const idx = Object.fromEntries(COLUMNAS.map(([k, h]) => [k, head.indexOf(norm(h))]));

  const porDni = new Map(existentes.filter((c) => c.dni).map((c) => [String(c.dni).replace(/\D/g, ''), c]));
  const porNombre = new Map(existentes.map((c) => [norm(c.nombre), c]));
  const vistos = new Set();
  const filas = [];
  hoja.filas.slice(hi + 1).forEach((f, i) => {
    const nFila = hi + 2 + i;
    const val = (k) => (idx[k] >= 0 ? f[idx[k]] : null);
    if (!f.some((c) => c != null && String(c).trim() !== '')) return;
    if (/borrar esta fila/i.test(String(val('nombre') ?? ''))) return;
    const c = {};
    const errores = [];
    const avisos = [];
    for (const [k, h, , tipo] of COLUMNAS) {
      if (tipo === 'fecha') {
        const d = aFecha(val(k));
        if (d === 'invalida') { avisos.push(`${h}: fecha no reconocida`); c[k] = null; } else c[k] = d;
      } else c[k] = texto(val(k));
    }
    if (c.dni) c.dni = c.dni.replace(/\D/g, '') || null;
    if (!c.nombre) errores.push('Falta el nombre');
    if (!c.area) errores.push('Falta el área');
    if (c.mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.mail)) avisos.push('Mail con formato raro');
    if (!c.cv_recibido) c.cv_recibido = hoy;
    if (c.localidad && (!c.provincia || !c.codigo_postal)) {
      const loc = buscarLocalidad(c.localidad);
      if (loc) { c.provincia ||= loc.provincia; if (loc.cp) c.codigo_postal ||= loc.cp; }
    }
    let estado = errores.length ? 'error' : 'ok';
    let motivo = errores.join(' · ');
    const claveDni = c.dni || null;
    const claveNombre = norm(c.nombre);
    if (estado === 'ok') {
      const dupApp = (claveDni && porDni.get(claveDni)) || porNombre.get(claveNombre);
      if (dupApp) { estado = 'duplicado'; motivo = `Ya existe en la app: ${dupApp.nombre}`; }
      else if (vistos.has(claveDni || claveNombre)) { estado = 'duplicado'; motivo = 'Repetido en la planilla'; }
    }
    vistos.add(claveDni || claveNombre);
    filas.push({ fila: nFila, estado, motivo, avisos, candidato: { ...c, stage: 'cv_recibido' } });
  });
  return filas;
}
