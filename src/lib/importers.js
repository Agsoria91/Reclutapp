// Convierte los CSV de origen a filas listas para las RPC import_positions /
// import_candidates. El mapeo de Status -> etapa NO se hace acá: lo resuelve la
// base con la tabla única public.stage_aliases.
import { parseCSV, decodeBytes, guessSeparator } from './csv.js';

const NULLISH = new Set(['', '-', '–', '—', '�', 'n/a', 'na']);

export function clean(v) {
  if (v == null) return null;
  const s = String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return NULLISH.has(s.toLowerCase()) ? null : s;
}

export function norm(v) {
  return (clean(v) || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const pad = (n) => String(n).padStart(2, '0');

export function parseDMY(v) {
  const s = clean(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  return isNaN(Date.parse(iso)) ? null : iso;
}

export function parseDMYTime(v) {
  const s = clean(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0'] = m;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00-03:00`;
}

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

// "02-nov" (sin año) -> fecha ISO. Toma el año de referencia y, si la fecha
// queda a más de 6 meses en el futuro, asume el año anterior.
export function parseDayMonth(v, today = new Date()) {
  const s = norm(v);
  if (!s) return null;
  const full = parseDMY(s);
  if (full) return full;
  const m = s.match(/^(\d{1,2})[-/ ]([a-z]{3})/);
  if (!m || !MESES[m[2]]) return null;
  let y = today.getFullYear();
  const cand = new Date(y, MESES[m[2]] - 1, +m[1]);
  if (cand - today > 183 * 864e5) y -= 1;
  return `${y}-${pad(MESES[m[2]])}-${pad(m[1])}`;
}

export function parseNumber(v) {
  let s = clean(v);
  if (!s) return null;
  s = s.replace(/[$\s]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseInt0(v) {
  const n = parseNumber(v);
  return n == null ? null : Math.round(n);
}

const parseBool = (v) => /^(true|verdadero|si|sí|1|x)$/i.test(clean(v) || '');

export function titleCase(v) {
  const s = clean(v);
  if (!s) return null;
  const lower = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
  return s.toLowerCase().split(' ').map((w, i) =>
    i > 0 && lower.has(w) ? w : w.replace(/^(\p{L})/u, (c) => c.toUpperCase())
  ).join(' ');
}

export function sentenceCase(v) {
  const s = clean(v);
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null;
}

const LOCALIDADES = {
  'rdls': 'Rincón de los Sauces',
  'rincon de los sauces': 'Rincón de los Sauces',
  'neuquen': 'Neuquén',
  'anelo': 'Añelo',
  'cutral co': 'Cutral Có',
  'picun leufu': 'Picún Leufú',
  'general roca': 'General Roca',
  'gral roca': 'General Roca',
  'cipolletti': 'Cipolletti',
};
export function normLocalidad(v) {
  const k = norm(v);
  if (!k) return null;
  return LOCALIDADES[k] || titleCase(v);
}

const PROCEDENCIAS = { 'linea': 'Línea', 'postulacion': 'Postulación', 'sindicato': 'Sindicato', 'consultora': 'Consultora' };
export function normProcedencia(v) {
  const k = norm(v);
  if (!k) return null;
  return PROCEDENCIAS[k] || clean(v);
}

const PROVINCIAS = { 'neuquen': 'Neuquén', 'rio negro': 'Río Negro', 'mendoza': 'Mendoza' };

function onlyDigits(v) {
  const s = clean(v);
  if (!s) return null;
  const d = s.replace(/\D/g, '');
  return d || null;
}

function makeKeyer() {
  const seen = new Map();
  return (base) => {
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
}

// ---------------------------------------------------------------------------
// Seguimiento de ingresos (posiciones / sillas)
// ---------------------------------------------------------------------------
const POS_COLS = {
  'pos sap': 'pos_sap', 'yacimiento': 'yacimiento', 'jefe directo': 'jefe_directo',
  'sector': 'sector', 'puesto': 'puesto', 'diagrama': 'diagrama', 'turno': 'turno',
  'encuadre': 'encuadre', 'tipo de cobertura': 'tipo_cobertura', 'status': 'status',
  'candidato principal': 'candidato_nombre', 'procedencia': 'procedencia',
  'localidad': 'localidad', 'cand. activos': 'cand_activos', 'fecha inicio': 'fecha_inicio',
  'fecha objetivo': 'fecha_objetivo', 'cat': 'categoria', 'puesto de convenio': 'puesto_convenio',
  'basico': 'basico', 'id sap': 'id_sap', 'ingreso': 'fecha_ingreso',
  'observaciones': 'observaciones', 'revisar': 'revisar',
};

export function parsePositionsCSV(bytesOrText, { today = new Date() } = {}) {
  const text = typeof bytesOrText === 'string' ? bytesOrText : decodeBytes(bytesOrText);
  const firstLines = text.split(/\r?\n/).slice(0, 3);
  const sep = guessSeparator(firstLines.find((l) => /pos sap/i.test(l)) || firstLines[0]);
  const rows = parseCSV(text, sep);
  const hIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'pos sap') && r.some((c) => norm(c) === 'puesto'));
  if (hIdx < 0) throw new Error('No encontré el encabezado "POS SAP / Puesto". ¿Es la planilla de Seguimiento de ingresos?');
  const header = rows[hIdx].map(norm);
  const colOf = {};
  header.forEach((h, i) => { if (POS_COLS[h] && colOf[POS_COLS[h]] == null) colOf[POS_COLS[h]] = i; });
  // la columna sin título que sigue a "Ingreso" trae notas tipo "Corresponde adicional"
  if (colOf.fecha_ingreso != null && header[colOf.fecha_ingreso + 1] === '') colOf.adicional = colOf.fecha_ingreso + 1;

  const key = makeKeyer();
  const out = [];
  const warnings = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (colOf[k] == null ? null : clean(row[colOf[k]]));
    if (!row.some((c) => clean(c))) continue; // filas vacías del pie
    const puesto = get('puesto');
    const yac = get('yacimiento');
    if (!puesto || !yac) { warnings.push(`Fila ${r + 1}: sin puesto o yacimiento, salteada`); continue; }
    const posSap = (get('pos_sap') || '').replace(/[^\dA-Za-z-]/g, '') || null;
    const sector = get('sector');
    const o = {
      pos_sap: posSap,
      yacimiento: yac.toUpperCase(),
      jefe_directo: get('jefe_directo'),
      sector: sector ? sector.toUpperCase() : null,
      puesto,
      diagrama: get('diagrama'),
      turno: get('turno'),
      encuadre: get('encuadre'),
      tipo_cobertura: sentenceCase(get('tipo_cobertura')),
      status: get('status'),
      candidato_nombre: get('candidato_nombre'),
      procedencia: normProcedencia(get('procedencia')),
      localidad: normLocalidad(get('localidad')),
      cand_activos: parseInt0(get('cand_activos')),
      fecha_inicio: parseDMY(get('fecha_inicio')),
      fecha_objetivo: parseDMY(get('fecha_objetivo')),
      categoria: get('categoria'),
      puesto_convenio: get('puesto_convenio'),
      basico: parseNumber(get('basico')),
      id_sap: get('id_sap'),
      fecha_ingreso: parseDayMonth(get('fecha_ingreso'), today),
      adicional: get('adicional'),
      observaciones: get('observaciones'),
      revisar: get('revisar'),
    };
    o.import_key = key([o.yacimiento, o.sector, norm(o.puesto), o.pos_sap || ''].join('|'));
    out.push(o);
  }
  return { rows: out, warnings };
}

// ---------------------------------------------------------------------------
// Candidatos PP
// ---------------------------------------------------------------------------
export function parseCandidatesCSV(bytesOrText) {
  const text = typeof bytesOrText === 'string' ? bytesOrText.replace(/^﻿/, '') : decodeBytes(bytesOrText);
  const sep = guessSeparator(text.split(/\r?\n/, 1)[0]);
  const rows = parseCSV(text, sep);
  if (!rows.length) throw new Error('El archivo está vacío');
  const header = rows[0].map(norm);
  const idx = (name) => header.indexOf(norm(name));
  if (idx('title') < 0 || idx('status') < 0) throw new Error('No encontré las columnas "Title" y "Status". ¿Es el CSV de Candidatos PP?');

  const key = makeKeyer();
  const out = [];
  const warnings = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.some((c) => clean(c))) continue;
    const get = (name) => { const i = idx(name); return i < 0 ? null : clean(row[i]); };
    const nombre = titleCase(get('Title'));
    if (!nombre) { warnings.push(`Fila ${r + 1}: sin nombre, salteada`); continue; }

    let mail = get('Mail');
    let dniRaw = get('DNI');
    if (dniRaw && dniRaw.includes('@')) { if (!mail) mail = dniRaw; dniRaw = null; }
    const dni = onlyDigits(dniRaw);
    if (dniRaw && (!dni || dni.length < 7 || dni.length > 9)) warnings.push(`Fila ${r + 1}: DNI con formato raro (${nombre})`);

    let motivos = [];
    const mb = get('Motivo de Baja');
    if (mb) {
      try { motivos = JSON.parse(mb); } catch { motivos = mb.split(/[;,]/); }
      motivos = motivos.map(clean).filter(Boolean);
    }

    const o = {
      area: (get('Área') || get('Area') || '').toUpperCase() || null,
      status: get('Status'),
      nombre,
      procedencia: normProcedencia(get('Procedencia')),
      servicio: get('Servicio'),
      posicion: get('Posición') || get('Posicion'),
      cv_recibido: parseDMY(get('CV Recibido')),
      en_entrevista: parseDMY(get('En Entrevista')),
      entrevista_ok: parseBool(get('Entrevista Ok')),
      validacion_rrll: parseDMY(get('Validación de RRLL')),
      ok_rrll: parseBool(get('OK RRLL')),
      epo: parseDMY(get('EPO')),
      clinica: titleCase(get('Clinica') || get('Clínica')),
      aptitud_recibida: parseDMY(get('Aptitud Recibida')),
      aptitud: get('Aptitud'),
      listo_ingreso: parseBool(get('Listo para Ingreso')),
      fecha_ingreso: parseDMY(get('Fecha de Ingreso')),
      cancelado: parseBool(get('Cancelado')),
      motivos_baja: motivos,
      comentarios: get('Comentarios'),
      created_origen: parseDMYTime(get('Created')),
      localidad: normLocalidad(get('Localidad')),
      provincia: PROVINCIAS[norm(get('Provincia'))] || titleCase(get('Provincia')),
      telefono: get('Telefono') || get('Teléfono'),
      mail: mail ? mail.toLowerCase() : null,
      dni,
    };
    o.import_key = key([norm(nombre), o.area || '', get('Created') || ''].join('|'));
    out.push(o);
  }
  return { rows: out, warnings };
}

export function detectKind(text) {
  const head = norm(text.slice(0, 2000));
  if (head.includes('apellido y nombre') && head.includes('cuil') && head.includes('ceco')) return 'nomina';
  if (head.includes('pos sap') && head.includes('puesto')) return 'positions';
  if (head.includes('title') && head.includes('status')) return 'candidates';
  return null;
}

// ---------------------------------------------------------------------------
// Nómina EFiS (Windows-1252, separador ;). Clave: DNI.
// ---------------------------------------------------------------------------
const NOM_COLS = {
  'id ext': 'id_ext', 'no pers.': 'nro_pers', 'nº pers.': 'nro_pers', 'apellido y nombre': 'nombre', 'dni': 'dni', 'cuil': 'cuil',
  'nacimiento': 'fecha_nacimiento', 'f/ reconocida': 'f_reconocida', 'f/ ingreso': 'fecha_ingreso', 'sexo': 'sexo',
  'encuadre': 'encuadre', 'categoria': 'categoria', 'fin pf': 'fin_pf', 'titling': 'titling', 'funcion': 'funcion',
  'sector': 'sector', 'yacimiento': 'yacimiento', 'diagrama': 'diagrama', 'jefe': 'jefe', 'domicilio': 'domicilio',
  'localidad': 'localidad', 'provincia': 'provincia', 'telefono': 'telefono', 'correo electronico': 'mail', 'pos': 'pos',
  'ceco': 'ceco', 'aportes': 'aportes', 'ddjj': 'ddjj', 'regalo kit': 'regalo_kit',
};
const NOM_DATES = new Set(['fecha_nacimiento', 'f_reconocida', 'fecha_ingreso', 'fin_pf']);

export function parseNominaCSV(bytesOrText) {
  const text = typeof bytesOrText === 'string' ? bytesOrText : decodeBytes(bytesOrText);
  const rows = parseCSV(text, guessSeparator(text.split(/\r?\n/, 1)[0]));
  const hIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'apellido y nombre') && r.some((c) => norm(c) === 'dni'));
  if (hIdx < 0) throw new Error('No encontré las columnas "APELLIDO Y NOMBRE" y "DNI". ¿Es la planilla de Nómina?');
  const header = rows[hIdx].map(norm);
  const out = []; const warnings = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.some((c) => clean(c))) continue;
    const o = {};
    header.forEach((h, i) => {
      const k = NOM_COLS[h];
      if (!k) return;
      const v = clean(row[i]);
      o[k] = NOM_DATES.has(k) ? parseDMY(v) : v;
    });
    o.dni = (o.dni || '').replace(/\D/g, '') || null;
    o.cuil = (o.cuil || '').replace(/\D/g, '') || null;
    if (!o.nombre || !o.dni) { warnings.push(`Fila ${r + 1}: sin nombre o DNI, salteada`); continue; }
    o.nombre = titleCase(o.nombre);
    o.localidad = normLocalidad(o.localidad);
    if (o.jefe === '#N/A') o.jefe = null;
    if (o.mail) o.mail = o.mail.toLowerCase();
    out.push(o);
  }
  return { rows: out, warnings };
}
