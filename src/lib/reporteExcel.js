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
