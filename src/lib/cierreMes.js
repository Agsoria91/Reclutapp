// Cierre de mes: dotación, ingresos, bajas, rotación, cobertura de sillas,
// reclutamiento y tiempos del mes elegido. Cálculo puro (sin DOM).
import { daysBetween } from './format.js';
import { avancePeriodo } from './kpis.js';

const finDeMes = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
const enRango = (f, a, b) => !!f && f >= a && f <= b;
// trabajaba ese día: ya había ingresado y no se había ido
const activoEl = (n, d) => !!n.fecha_ingreso && n.fecha_ingreso <= d && (n.fecha_baja ? n.fecha_baja >= d : n.estado !== 'baja');
const promedio = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function mesAnterior(hoy) { const [y, m] = hoy.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); }

export function datosCierre(mes, { nomina = [], candidates = [], positions = [], hoy }) {
  const ini = `${mes}-01`; const fin = finDeMes(mes); const corte = hoy && hoy < fin ? hoy : fin;
  const dotIni = nomina.filter((n) => activoEl(n, ini)).length;
  const dotFin = nomina.filter((n) => activoEl(n, corte)).length;
  const ingresos = nomina.filter((n) => enRango(n.fecha_ingreso, ini, corte));
  const bajas = nomina.filter((n) => enRango(n.fecha_baja, ini, corte));
  const tempranas = bajas.filter((n) => n.fecha_ingreso && daysBetween(n.fecha_ingreso, n.fecha_baja) < 90);
  const dotProm = (dotIni + dotFin) / 2;
  const rotacion = dotProm ? Math.round((bajas.length / dotProm) * 1000) / 10 : 0;
  const yacs = [...new Set(nomina.map((n) => n.yacimiento || 'Sin dato'))].sort();
  const porYac = yacs.map((y) => {
    const g = nomina.filter((n) => (n.yacimiento || 'Sin dato') === y);
    return { yacimiento: y, ini: g.filter((n) => activoEl(n, ini)).length, ingresos: g.filter((n) => enRango(n.fecha_ingreso, ini, corte)).length,
      bajas: g.filter((n) => enRango(n.fecha_baja, ini, corte)).length, fin: g.filter((n) => activoEl(n, corte)).length };
  }).filter((r) => r.ini || r.fin || r.ingresos || r.bajas);
  const sillas = avancePeriodo(positions, [mes], { candidatos: candidates, today: hoy });
  const c = (f) => candidates.filter((x) => enRango(x[f], ini, corte));
  const ingresadosApp = candidates.filter((x) => x.stage === 'ingresado' && enRango(x.fecha_ingreso, ini, corte));
  const reclutamiento = {
    cvs: c('cv_recibido').length,
    entrevistas: c('en_entrevista').length,
    aprobadas: c('en_entrevista').filter((x) => x.entrevista_ok || ['entrevista_aprobada', 'validacion_rrll', 'propuesta', 'examen_medico', 'apto', 'proximo_ingreso', 'ingresado'].includes(x.stage)).length,
    examenes: c('epo').length,
    ingresos: ingresadosApp.length,
    cancelados: candidates.filter((x) => x.stage === 'cancelado' && enRango(x.fecha_baja, ini, corte)).length,
  };
  const tiempos = {
    cvIngreso: promedio(ingresadosApp.filter((x) => x.cv_recibido).map((x) => daysBetween(x.cv_recibido, x.fecha_ingreso))),
    entrevistaIngreso: promedio(ingresadosApp.filter((x) => x.en_entrevista).map((x) => daysBetween(x.en_entrevista, x.fecha_ingreso))),
    sillaCubierta: promedio(positions.filter((p) => p.fecha_inicio && enRango(p.fecha_ingreso, ini, corte)).map((p) => daysBetween(p.fecha_inicio, p.fecha_ingreso))),
  };
  return { mes, ini, fin, corte, enCurso: corte < fin, dotIni, dotFin, ingresos, bajas, tempranas, rotacion, porYac, sillas, reclutamiento, tiempos };
}
