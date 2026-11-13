// Descarga en Excel de todo lo que muestra la app, en hojas separadas.
// Vista pública: solo totales, sillas y reportes agregados (sin datos personales).
// RRHH: además candidatos, próximos ingresos, legajos y nómina completa.
import { state } from './store.js';
import { todayISO, fmtDate, fmtMonth } from './format.js';
import { positionKpis, pendingByTarget, candidateKpis, interviewStats, reached, monthKey, isCovered, hasPerson } from './kpis.js';
import { pivot } from '../components/ui.js';
import { preingresoProgress, convenioLabel } from '../components/ingreso.js';

const lbl = (code) => state.stageMap[code]?.label || code;
const pctN = (a, b) => (b ? a / b : null); // fracción: Excel la muestra como %
const pctS = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—'); // texto, para la hoja Resumen

function pivotSheet(name, title, rows, rowFn, colFn, rowLabel) {
  const p = pivot(rows, rowFn, colFn);
  return {
    name, title, note: `${p.total} personas`,
    columns: [{ header: rowLabel, width: 28 }, ...p.colKeys.map((c) => ({ header: c, width: 11 })), { header: 'Total', width: 10 }, { header: '%', width: 8, pct: true }],
    rows: p.rowKeys.map((r) => [r, ...p.colKeys.map((c) => p.cell(r, c) || null), p.rowTotal(r), pctN(p.rowTotal(r), p.total)]),
    totalRow: ['Total', ...p.colKeys.map((c) => p.colTotal(c)), p.total, p.total ? 1 : null],
  };
}

// ---------------------------------------------------------------------------
// Ficha completa: una fila por persona con TODO (silla, etapas, datos
// personales, talles, nómina). Solo RRHH.
// ---------------------------------------------------------------------------
const edadDe = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number); const h = new Date();
  return h.getFullYear() - y - ((h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) ? 1 : 0);
};
const FICHA_COLS = [
  // persona
  ['Apellido y nombre', 30], ['Etapa', 17], ['Área', 6], ['Servicio / sector', 15], ['Posición', 22], ['Origen', 13],
  // silla
  ['Silla: puesto', 26], ['Silla: POS SAP', 11], ['Silla: Id SAP', 10], ['Silla: área', 8], ['Silla: sector', 15], ['Jefe directo', 15],
  ['Diagrama', 9], ['Turno', 7], ['Encuadre', 8], ['Tipo de cobertura', 17], ['Categoría', 9], ['Puesto de convenio', 28], ['Convenio', 26],
  ['Básico', 12], ['Mes objetivo', 11], ['Estado de la silla', 17], ['Candidatos en terna', 9], ['También en terna de', 24],
  // datos personales
  ['DNI', 11], ['CUIL', 14], ['Fecha de nacimiento', 12], ['Edad', 6], ['Domicilio', 32], ['Localidad', 20], ['Provincia', 11],
  ['Teléfono', 14], ['Mail', 28],
  // talles
  ['Talle mameluco', 9], ['Talle botas', 8], ['Talle campera', 9],
  // proceso
  ['CV recibido', 12], ['En entrevista', 12], ['Entrevista OK', 9], ['Validación RRLL', 12], ['EPO (examen)', 12], ['Clínica', 12],
  ['Aptitud recibida', 12], ['Aptitud', 16], ['Fecha de ingreso', 12], ['Días CV → ingreso', 9], ['Motivos de baja', 24], ['Comentarios', 30],
  ['CV cargado', 8],
  // nómina
  ['Nº personal', 10], ['CECO', 12], ['POS (nómina)', 11], ['Yacimiento (nómina)', 11], ['Función (nómina)', 20], ['DDJJ', 10], ['Regalo kit', 10],
  ['Estado en nómina', 10], ['Fecha de baja', 12],
];
export function fichaCompletaSheet(cands, { incluirSinFicha = true, titulo = 'Ficha completa por persona' } = {}) {
  const posByCand = new Map(state.positions.filter((p) => p.candidate_id).map((p) => [p.candidate_id, p]));
  const nomByCand = new Map(state.nomina.filter((n) => n.candidate_id).map((n) => [n.candidate_id, n]));
  const nomByDni = new Map(state.nomina.filter((n) => n.dni).map((n) => [String(n.dni), n]));
  const days = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 864e5) : null);
  const fila = (c, p, n) => [
    c?.nombre || p?.candidato_nombre || n?.nombre, c ? lbl(c.stage) : p ? lbl(p.stage) : '', c?.area || p?.yacimiento, c?.servicio, c?.posicion,
    c?.procedencia || p?.procedencia || n?.procedencia,
    p?.puesto, p?.pos_sap, p?.id_sap, p?.yacimiento, p?.sector, p?.jefe_directo, p?.diagrama, p?.turno, p?.encuadre, p?.tipo_cobertura,
    p?.categoria, p?.puesto_convenio, p?.convenio, p?.basico != null ? Number(p.basico) : null, p?.fecha_objetivo ? fmtMonth(p.fecha_objetivo) : '',
    p ? lbl(p.stage) : '', p?.cand_activos || null,
    (c?._ternas || []).filter((t) => t.candidate_id !== c.id).map((t) => `${t.puesto} (${t.yacimiento})`).join(', '),
    c?.dni || n?.dni, c?.cuil || n?.cuil, c?.fecha_nacimiento || n?.fecha_nacimiento, edadDe(c?.fecha_nacimiento || n?.fecha_nacimiento),
    c?.domicilio || n?.domicilio, c?.localidad || n?.localidad || p?.localidad, c?.provincia || n?.provincia, c?.telefono || n?.telefono, c?.mail || n?.mail,
    c?.talle_mameluco || n?.talle_mameluco, c?.talle_botas || n?.talle_botas, c?.talle_campera || n?.talle_campera,
    c?.cv_recibido, c?.en_entrevista, c ? (c.entrevista_ok ? 'Sí' : 'No') : '', c?.validacion_rrll, c?.epo, c?.clinica, c?.aptitud_recibida, c?.aptitud,
    c?.fecha_ingreso || p?.fecha_ingreso || n?.fecha_ingreso, days(c?.cv_recibido, c?.fecha_ingreso), (c?.motivos_baja || []).join(', '), c?.comentarios,
    c ? (c.cv_path ? 'Sí' : 'No') : '',
    n?.nro_pers, n?.ceco, n?.pos, n?.yacimiento, n?.funcion || n?.titling, n?.ddjj, n?.regalo_kit, n?.estado, n?.fecha_baja,
  ];
  const rows = [...cands].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => fila(c, posByCand.get(c.id) || c._silla, nomByCand.get(c.id) || (c.dni ? nomByDni.get(String(c.dni)) : null)));
  if (incluirSinFicha) {
    // personas sentadas sin ficha de candidato (movimientos internos): datos desde la nómina
    const nomByPos = new Map(state.nomina.filter((n) => n.position_id).map((n) => [n.position_id, n]));
    for (const p of state.positions) {
      if (p.candidate_id || !(p.candidato_nombre || '').trim()) continue;
      rows.push(fila(null, p, nomByPos.get(p.id)));
    }
  }
  return {
    name: 'Ficha completa', title: titulo, note: 'Datos personales: uso interno de RRHH. Una fila por persona.',
    columns: FICHA_COLS.map(([header, width]) => ({ header, width })), rows,
  };
}

export async function descargarFichas(cands, { incluirSinFicha = false, sufijo = '' } = {}) {
  const { downloadXlsx } = await import('./xlsx.js');
  downloadXlsx(`Fichas_completas${sufijo ? '_' + sufijo : ''}_${todayISO()}.xlsx`,
    [fichaCompletaSheet(cands, { incluirSinFicha, titulo: `Ficha completa por persona${sufijo ? ' · ' + sufijo.replace(/_/g, ' ') : ''}` })]);
  return cands.length;
}

export function armarLibro() {
  const hoy = todayISO();
  const staff = state.isStaff;
  const P = state.positions;
  const C = state.candidates;
  const SM = state.stageMap;
  const pk = positionKpis(P, hoy);
  const ck = candidateKpis(C, SM, P, hoy);
  const ik = interviewStats(C, SM);
  const ingresados = C.filter((c) => c.stage === 'ingresado');
  const sheets = [];

  // 1) Resumen
  const resumen = [
    ['Posiciones (sillas)', null], ['Sillas totales', pk.total], ['Cubiertas', pk.cubiertas], ['% cubiertas', pctS(pk.cubiertas, pk.total)],
    ['Faltan cubrir', pk.pendientes], ['  · con candidato en proceso', pk.enProceso], ['  · sin candidato', pk.sinCandidato], ['Vencidas (mes objetivo pasado)', pk.vencidas],
    [null, null], ['Candidatos PP', null], ['Candidatos', ck.total], ['En proceso', ck.activos], ['Ingresados', ck.ingresados], ['Cancelados', ck.cancelados],
    ['Conversión (ingresados / candidatos)', pctS(ck.ingresados, ck.total)], ['Días promedio postulado (activos)', ck.diasPromedioActivos], ['Días promedio CV → ingreso', ck.diasPromedioIngreso],
    [null, null], ['Entrevistas', null], ['Entrevistas realizadas', ik.entrevistados], ['Aprobaron la entrevista', ik.aprobados],
    ['Efectividad (aprobadas / entrevistas)', pctS(ik.aprobados, ik.entrevistados)], ['Llegaron al examen médico', ik.examen], ['Ingresaron', ik.ingresados],
    ['Ingresos / entrevistas', pctS(ik.ingresados, ik.entrevistados)], ['Bajas post-entrevista', ik.bajasPost],
  ];
  if (staff) {
    const prox = P.filter((p) => p.stage === 'proximo_ingreso').length;
    resumen.push([null, null], ['Personal', null], ['Personas en nómina (activas)', state.nomina.filter((n) => n.estado === 'activo').length],
      ['Ingresos por silla (legajos)', state.nomina.filter((n) => n.position_id || n.candidate_id).length], ['Próximos ingresos', prox]);
  }
  sheets.push({
    name: 'Resumen', title: `Reclutamiento EFiS — Resumen al ${fmtDate(hoy)}`,
    note: staff ? 'Incluye datos personales: uso interno de RRHH.' : 'Vista pública: sin datos personales.',
    columns: [{ header: 'Indicador', width: 44 }, { header: 'Valor', width: 14 }],
    rows: resumen.map(([k, v]) => [k, v]),
  });

  // 2) Faltan cubrir por mes
  const pend = pendingByTarget(P, hoy);
  const areas = [...new Set(P.map((p) => p.yacimiento))].sort();
  sheets.push({
    name: 'Faltan cubrir por mes', title: 'Sillas que faltan cubrir, por mes objetivo',
    columns: [{ header: 'Mes objetivo', width: 14 }, { header: 'Vencido', width: 9 }, { header: 'Faltan', width: 9 }, { header: 'En proceso', width: 11 }, { header: 'Sin candidato', width: 13 },
      ...areas.map((a) => ({ header: a, width: 8 }))],
    rows: pend.map((g) => [g.fecha ? fmtMonth(g.fecha) : 'Sin fecha', g.vencida ? 'Sí' : '', g.total, g.enProceso, g.sinCandidato,
      ...areas.map((a) => (g.porArea.find(([x]) => x === a)?.[1]) || null)]),
    totalRow: ['Total', '', pk.pendientes, pk.enProceso, pk.sinCandidato, ...areas.map((a) => P.filter((p) => p.yacimiento === a && !isCovered(p)).length || null)],
  });

  // 3) Sillas
  const sillaCols = [['Área', 6], ['Sector', 16], ['Puesto', 30], ['POS SAP', 11], ['Persona asignada', 30], ['Procedencia', 13], ['Localidad', 20],
    ['Estado', 18], ['Mes objetivo', 12], ['Vencida', 8], ['Fecha de ingreso', 12], ['Diagrama', 9], ['Convenio', 30], ['Cobertura', 17], ['En terna', 8]];
  if (staff) sillaCols.push(['Básico', 12], ['Observaciones', 30]);
  sheets.push({
    name: 'Sillas', title: 'Mapa de posiciones',
    columns: sillaCols.map(([header, width]) => ({ header, width })),
    rows: [...P].sort((a, b) => (a.yacimiento + a.sector + a.puesto).localeCompare(b.yacimiento + b.sector + b.puesto, 'es', { numeric: true })).map((p) => {
      const late = !isCovered(p) && p.fecha_objetivo && monthKey(p.fecha_objetivo) < monthKey(hoy);
      const row = [p.yacimiento, p.sector, p.puesto, p.pos_sap, hasPerson(p) ? p.candidato_nombre : '(vacante)', p.procedencia, p.localidad, lbl(p.stage),
        p.fecha_objetivo ? fmtMonth(p.fecha_objetivo) : '', late ? 'Sí' : '', p.fecha_ingreso, p.diagrama, convenioLabel(p), p.tipo_cobertura, p.cand_activos || null];
      if (staff) row.push(p.basico != null ? Number(p.basico) : null, p.observaciones);
      return row;
    }),
  });

  // 4-5) Ingresos por origen / localidad
  sheets.push(pivotSheet('Ingresos por origen', 'Ingresados por origen y área', ingresados, (c) => c.procedencia, (c) => c.area, 'Origen'));
  sheets.push(pivotSheet('Ingresos por localidad', 'Ingresados por localidad y área', ingresados, (c) => c.localidad, (c) => c.area, 'Localidad'));
  sheets.push(pivotSheet('Candidatos por origen', 'Todos los candidatos por origen y etapa', C, (c) => c.procedencia, (c) => lbl(c.stage), 'Origen'));

  // 6) Efectividad de entrevistas
  const efe = [];
  for (const [dim, nombre, fn] of [['area', 'Área', (c) => c.area], ['sector', 'Sector', (c) => c.servicio], ['procedencia', 'Origen', (c) => c.procedencia]]) {
    const g = new Map();
    for (const c of C) { const k = fn(c) || 'Sin dato'; if (!g.has(k)) g.set(k, []); g.get(k).push(c); }
    for (const [k, rs] of [...g].sort((a, b) => b[1].length - a[1].length)) {
      const s = interviewStats(rs, SM);
      if (s.entrevistados) efe.push([nombre, k, s.entrevistados, s.aprobados, pctN(s.aprobados, s.entrevistados), s.examen, s.ingresados, pctN(s.ingresados, s.entrevistados), s.bajasPost]);
    }
  }
  sheets.push({
    name: 'Efectividad entrevistas', title: 'Efectividad de entrevistas', note: 'Un candidato cancelado cuenta hasta la instancia a la que llegó.',
    columns: [{ header: 'Por', width: 9 }, { header: 'Valor', width: 24 }, { header: 'Entrevistas', width: 11 }, { header: 'Aprobadas', width: 10 },
      { header: 'Efectividad', width: 11, pct: true }, { header: 'Examen', width: 9 }, { header: 'Ingresos', width: 9 }, { header: '% ingreso', width: 10, pct: true }, { header: 'Bajas', width: 8 }],
    rows: efe,
    totalRow: ['Total', '', ik.entrevistados, ik.aprobados, pctN(ik.aprobados, ik.entrevistados), ik.examen, ik.ingresados, pctN(ik.ingresados, ik.entrevistados), ik.bajasPost],
  });

  // 7) Embudo por etapa
  sheets.push({
    name: 'Embudo por etapa', title: 'Candidatos por etapa',
    columns: [{ header: 'Etapa', width: 24 }, { header: 'Candidatos', width: 11 }, { header: '%', width: 8, pct: true }],
    rows: state.stages.filter((s) => s.code !== 'sin_candidato').map((s) => { const n = C.filter((c) => c.stage === s.code).length; return [s.label, n, pctN(n, C.length)]; }),
    totalRow: ['Total', C.length, C.length ? 1 : null],
  });

  if (!staff) return sheets;

  // ---------------- solo RRHH ----------------
  sheets.push(fichaCompletaSheet(C));
  sheets.push({
    name: 'Candidatos', title: 'Candidatos PP (con datos personales — uso interno RRHH)',
    columns: [['Nombre', 30], ['Etapa', 18], ['Área', 6], ['Servicio', 14], ['Posición', 22], ['Origen', 13], ['Localidad', 20], ['Provincia', 11],
      ['DNI', 11], ['Teléfono', 13], ['Mail', 28], ['CV recibido', 12], ['Entrevista', 12], ['EPO', 12], ['Aptitud recibida', 12], ['Aptitud', 16],
      ['Fecha de ingreso', 12], ['Motivos de baja', 26], ['Silla', 24], ['También en terna de', 26]].map(([header, width]) => ({ header, width })),
    rows: [...C].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((c) => [c.nombre, lbl(c.stage), c.area, c.servicio, c.posicion, c.procedencia,
      c.localidad, c.provincia, c.dni, c.telefono, c.mail, c.cv_recibido, c.en_entrevista, c.epo, c.aptitud_recibida, c.aptitud, c.fecha_ingreso,
      (c.motivos_baja || []).join(', '), c._silla?.puesto, (c._ternas || []).filter((p) => p.candidate_id !== c.id).map((p) => p.puesto).join(', ')]),
  });

  const byId = new Map(C.map((c) => [c.id, c]));
  sheets.push({
    name: 'Próximos ingresos', title: 'Próximos ingresos y datos de alta faltantes',
    columns: [['Persona', 30], ['Silla', 26], ['Área', 6], ['Sector', 16], ['Fecha de ingreso', 12], ['Origen', 13], ['Datos completos', 10], ['Falta', 50],
      ['DNI', 11], ['CUIL', 14], ['Nacimiento', 12], ['Domicilio', 30], ['Localidad', 18], ['Provincia', 11], ['Teléfono', 13], ['Mail', 26],
      ['Mameluco', 9], ['Botas', 7], ['Campera', 9]].map(([header, width]) => ({ header, width })),
    rows: P.filter((p) => p.stage === 'proximo_ingreso').map((p) => {
      const c = p.candidate_id ? byId.get(p.candidate_id) : null;
      const pr = preingresoProgress(c);
      return [p.candidato_nombre, p.puesto, p.yacimiento, p.sector, p.fecha_ingreso, p.procedencia, c ? `${pr.done}/${pr.total}` : 'sin ficha',
        c ? pr.missing.join(', ') : 'Crear ficha', c?.dni, c?.cuil, c?.fecha_nacimiento, c?.domicilio, c?.localidad, c?.provincia, c?.telefono, c?.mail,
        c?.talle_mameluco, c?.talle_botas, c?.talle_campera];
    }),
  });

  const nomCols = [['Nombre', 30], ['DNI', 11], ['CUIL', 14], ['Nº pers.', 9], ['Nacimiento', 12], ['Fecha de ingreso', 12], ['Sexo', 6], ['Encuadre', 9],
    ['Categoría', 9], ['Fin plazo fijo', 12], ['Función', 22], ['Sector', 16], ['Yacimiento', 11], ['Diagrama', 9], ['Jefe', 16], ['POS', 10], ['CECO', 12],
    ['Domicilio', 30], ['Localidad', 18], ['Provincia', 11], ['Teléfono', 14], ['Mail', 28], ['Mameluco', 9], ['Botas', 7], ['Campera', 9],
    ['DDJJ', 10], ['Regalo kit', 10], ['Estado', 8], ['Fecha de baja', 12], ['Silla (ingreso)', 24], ['Origen', 13], ['Cobertura', 17]];
  const nomRow = (n) => [n.nombre, n.dni, n.cuil, n.nro_pers, n.fecha_nacimiento, n.fecha_ingreso, n.sexo, n.encuadre, n.categoria, n.fin_pf,
    n.funcion || n.titling, n.sector, n.yacimiento, n.diagrama, n.jefe, n.pos, n.ceco, n.domicilio, n.localidad, n.provincia, n.telefono, n.mail,
    n.talle_mameluco, n.talle_botas, n.talle_campera, n.ddjj, n.regalo_kit, n.estado, n.fecha_baja, n.puesto, n.procedencia, n.tipo_cobertura];
  const nom = [...state.nomina].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  sheets.push({
    name: 'Legajos (ingresos)', title: 'Legajos: personas que ingresaron por una silla',
    columns: nomCols.map(([header, width]) => ({ header, width })), rows: nom.filter((n) => n.position_id || n.candidate_id).map(nomRow),
  });
  sheets.push({
    name: 'Nómina', title: `Nómina EFiS al ${fmtDate(hoy)}`,
    columns: nomCols.map(([header, width]) => ({ header, width })), rows: nom.map(nomRow),
  });
  sheets.push(pivotSheet('Nómina por yacimiento', 'Nómina activa por yacimiento y encuadre', nom.filter((n) => n.estado === 'activo'), (n) => n.yacimiento, (n) => n.encuadre, 'Yacimiento'));
  sheets.push(pivotSheet('Nómina por localidad', 'Nómina activa por localidad y yacimiento', nom.filter((n) => n.estado === 'activo'), (n) => n.localidad, (n) => n.yacimiento, 'Localidad'));
  return sheets;
}

export async function descargarExcel() {
  const { downloadXlsx } = await import('./xlsx.js'); // se carga solo al pedir el Excel
  const sheets = armarLibro();
  downloadXlsx(`Reclutamiento_EFiS_${state.isStaff ? 'RRHH' : 'resumen'}_${todayISO()}.xlsx`, sheets);
  return sheets.length;
}

export { reached };
