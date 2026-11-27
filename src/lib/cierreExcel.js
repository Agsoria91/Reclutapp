// Excel del cierre de mes (solo RRHH): resumen, por yacimiento, ingresos y bajas del mes.
import { state } from './store.js';
import { todayISO, fmtMonth, daysBetween } from './format.js';
import { datosCierre } from './cierreMes.js';

export async function descargarCierre(mes, area = '') {
  const { downloadXlsx } = await import('./xlsx.js');
  const hoy = todayISO();
  const f = (x) => !area || x === area;
  const r = datosCierre(mes, { nomina: state.nomina.filter((n) => f(n.yacimiento)), candidates: state.candidates.filter((c) => f(c.area)), positions: state.positions.filter((p) => f(p.yacimiento)), hoy });
  const s = r.sillas || { req: 0, ok: 0, pend: 0, despues: 0, avance: 0 };
  const rc = r.reclutamiento;
  const titulo = `Cierre de ${fmtMonth(mes)}${area ? ` · ${area}` : ''}`;
  const resumen = [
    ['Dotación al inicio del mes', r.dotIni], [`Dotación al ${r.corte.split('-').reverse().join('/')}`, r.dotFin],
    ['Ingresos (altas en nómina)', r.ingresos.length], ['Bajas', r.bajas.length], ['Bajas antes de los 90 días', r.tempranas.length],
    ['Rotación (bajas / dotación promedio)', `${r.rotacion.toLocaleString('es-AR')} %`],
    ['Sillas con objetivo en el mes', s.req], ['Sillas cubiertas a tiempo', s.ok], ['Sillas pendientes', s.pend], ['Avance de sillas del mes', `${s.avance} %`],
    ['CV recibidos', rc.cvs], ['Entrevistas', rc.entrevistas], ['Entrevistas aprobadas', rc.aprobadas], ['Enviados a examen médico', rc.examenes], ['Ingresos desde la app', rc.ingresos], ['Candidatos dados de baja', rc.cancelados],
    ['Días promedio CV → ingreso', r.tiempos.cvIngreso], ['Días promedio entrevista → ingreso', r.tiempos.entrevistaIngreso], ['Días promedio apertura de silla → ingreso', r.tiempos.sillaCubierta],
  ];
  const fecha = (d) => (d ? d.split('-').reverse().join('/') : '');
  const sheets = [
    { name: 'Resumen', title: titulo, note: r.enCurso ? 'Mes en curso: datos hasta hoy' : '', columns: [{ header: 'Indicador', width: 44 }, { header: 'Valor', width: 14 }],
      rows: resumen.map(([k, v]) => [k, v]) },
    { name: 'Por yacimiento', title: titulo, columns: [{ header: 'Yacimiento', width: 22 }, { header: 'Dotación inicio', width: 15 }, { header: 'Ingresos', width: 11 }, { header: 'Bajas', width: 10 }, { header: 'Dotación cierre', width: 15 }],
      rows: r.porYac.map((y) => [y.yacimiento, y.ini, y.ingresos, y.bajas, y.fin]),
      totalRow: ['Total', r.dotIni, r.ingresos.length, r.bajas.length, r.dotFin] },
    { name: 'Ingresos del mes', title: titulo, note: `${r.ingresos.length} personas`, columns: [{ header: 'Nombre', width: 30 }, { header: 'Yacimiento', width: 14 }, { header: 'Sector', width: 18 }, { header: 'Función', width: 24 }, { header: 'Fecha de ingreso', width: 15 }, { header: 'Procedencia', width: 18 }],
      rows: r.ingresos.sort((a, b) => a.fecha_ingreso.localeCompare(b.fecha_ingreso)).map((n) => [n.nombre, n.yacimiento, n.sector, n.funcion || n.puesto, fecha(n.fecha_ingreso), n.procedencia]) },
    { name: 'Bajas del mes', title: titulo, note: `${r.bajas.length} personas`, columns: [{ header: 'Nombre', width: 30 }, { header: 'Yacimiento', width: 14 }, { header: 'Sector', width: 18 }, { header: 'Fecha de ingreso', width: 15 }, { header: 'Fecha de baja', width: 14 }, { header: 'Días en la empresa', width: 16 }, { header: 'Motivo', width: 28 }],
      rows: r.bajas.sort((a, b) => a.fecha_baja.localeCompare(b.fecha_baja)).map((n) => [n.nombre, n.yacimiento, n.sector, fecha(n.fecha_ingreso), fecha(n.fecha_baja), n.fecha_ingreso ? daysBetween(n.fecha_ingreso, n.fecha_baja) : null, n.motivo_baja]) },
  ];
  downloadXlsx(`Cierre_${mes}${area ? '_' + area : ''}_EFiS.xlsx`, sheets);
}
