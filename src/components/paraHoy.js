// "Para hoy": lo urgente del día en una franja, arriba de Posiciones (solo RRHH).
// Cada ítem lleva a la pantalla correspondiente con el filtro ya aplicado.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { todayISO } from '../lib/format.js';
import { estaDemorado, isCovered, monthKey } from '../lib/kpis.js';
import { pendientesDeAviso } from './avisos.js';
import { preingresoProgress } from './ingreso.js';
import { estadoMedico } from './examen.js';

const masDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function items() {
  const hoy = todayISO();
  const semana = masDias(hoy, 7);
  const byId = new Map(state.candidates.map((c) => [c.id, c]));
  const ingresosSemana = state.positions.filter((p) => p.stage === 'proximo_ingreso' && p.fecha_ingreso && p.fecha_ingreso >= hoy && p.fecha_ingreso <= semana)
    .filter((p) => { const c = byId.get(p.candidate_id); return !c || preingresoProgress(c).missing.length; });
  const mes = monthKey(hoy);
  return [
    ['avisar', pendientesDeAviso().length, (n) => `${n} ${n === 1 ? 'aviso pendiente' : 'avisos pendientes'}`, 'aviso'],
    ['demorados', state.candidates.filter((c) => estaDemorado(c, hoy)).length, (n) => `${n} ${n === 1 ? 'proceso demorado' : 'procesos demorados'}`, 'alerta'],
    ['interconsulta', state.candidates.filter((c) => c.epo && estadoMedico(c).code === 'interconsulta').length, (n) => `${n} ${n === 1 ? 'interconsulta abierta' : 'interconsultas abiertas'}`, 'aviso'],
    ['ingresos', ingresosSemana.length, (n) => `${n} ${n === 1 ? 'ingreso' : 'ingresos'} esta semana con datos faltantes`, 'aviso'],
    ['vencen', state.positions.filter((p) => !isCovered(p) && monthKey(p.fecha_objetivo) === mes).length, (n) => `${n} ${n === 1 ? 'silla vence' : 'sillas vencen'} este mes`, 'neutro'],
  ].filter(([, n]) => n > 0);
}

export function paraHoy() {
  if (!state.isStaff) return '';
  const xs = items();
  if (!xs.length) return '';
  return html`<section class="para-hoy" aria-label="Para hoy"><span class="para-hoy-tit">Para hoy</span>
    ${xs.map(([k, n, txt, tono]) => html`<button type="button" class="hoy hoy--${tono}" data-hoy="${k}">${txt(n)}</button>`)}</section>`;
}

// Lleva a la pantalla con el filtro aplicado
export async function irA(k) {
  if (k === 'avisar' || k === 'demorados') {
    const m = await import('../views/candidatos.js');
    m.elegirRapido(k);
    const { saveLocal } = await import('./ui.js');
    saveLocal('reclutapp.tab.candidatos', 'listado');
    location.hash = '#/candidatos';
  } else if (k === 'interconsulta') {
    (await import('../views/examenes.js')).elegirGrupo('interconsulta');
    (await import('./ui.js')).saveLocal('reclutapp.tab.examenes', 'personas');
    location.hash = '#/examenes';
  } else if (k === 'ingresos') {
    (await import('../views/ingresos.js')).elegirVista('falta');
    location.hash = '#/ingresos';
  } else if (k === 'vencen') {
    (await import('../views/posiciones.js')).elegirVencenEsteMes();
    return 'redibujar';
  }
}
