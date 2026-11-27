// Examen médico preocupacional e interconsultas (solo RRHH).
// Estado médico derivado de las fechas y la aptitud; NO cambia la etapa:
// un candidato en interconsulta sigue en "Examen Médico" (no se cancela ni se
// pierde el registro). Si la aptitud final es "No Apto", RRHH decide cancelar.
import { html, raw } from '../lib/html.js';
import { state } from '../lib/store.js';
import { field, pickField } from './ui.js';
import { fmtDate, todayISO, daysBetween } from '../lib/format.js';
import { buscarLocalidad } from '../data/localidades.js';

export const CLINICAS = ['CMIT', 'SYNERGYS', 'SANTA CRUZ', 'DIENTS'];
const n = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// "Cmit" / "CMIT" -> "CMIT"; otras clínicas se muestran en mayúsculas
export function clinicaCanon(v) {
  const k = n(v);
  if (!k) return null;
  const c = CLINICAS.find((x) => n(x) === k || k.startsWith(n(x)));
  return c || String(v).trim().toUpperCase();
}

export const ESTADOS_MEDICOS = {
  pendiente: { label: 'Pendiente de resultado', color: 'sky', orden: 1 },
  interconsulta: { label: 'En interconsulta', color: 'violet', orden: 2 },
  no_apto_temp: { label: 'No apto temporal', color: 'orange', orden: 3 },
  no_apto: { label: 'No apto', color: 'red', orden: 4 },
  apto_pre: { label: 'Apto con preexistencia', color: 'lime', orden: 5 },
  apto: { label: 'Apto', color: 'green', orden: 6 },
};

export function estadoMedico(c) {
  if (!c?.epo) return null;
  const a = n(c.aptitud);
  let code;
  if (c.interconsulta && !c.interconsulta_cierre) code = 'interconsulta';
  else if (a.startsWith('apto con')) code = 'apto_pre';
  else if (a === 'apto') code = 'apto';
  else if (a.startsWith('no apto temp')) code = 'no_apto_temp';
  else if (a.startsWith('no apto')) code = 'no_apto';
  else code = 'pendiente';
  return { code, ...ESTADOS_MEDICOS[code], trasInterconsulta: !!c.interconsulta && code !== 'interconsulta' };
}
export const esApto = (e) => e && (e.code === 'apto' || e.code === 'apto_pre');

export function pillMedico(c) {
  const e = estadoMedico(c);
  if (!e) return '';
  return html`<span class="pill pill--sm pill--${e.color}">${e.label}${e.trasInterconsulta ? ' · tras interconsulta' : ''}</span>`;
}

// Hitos del examen con días entre cada uno
export function hitosExamen(c) {
  const h = [];
  if (c.epo) h.push(['Enviado a examen', c.epo]);
  if (c.aptitud_recibida) h.push([`Resultado: ${c.aptitud || 'aptitud'}`, c.aptitud_recibida]);
  if (c.interconsulta) h.push(['Enviado a interconsulta', c.interconsulta]);
  if (c.interconsulta_cierre) h.push(['Cierre de interconsulta', c.interconsulta_cierre]);
  h.sort((a, b) => a[1].localeCompare(b[1]));
  return h;
}
// días desde el envío hasta tener la aptitud definitiva (o hasta hoy si sigue abierto)
export function diasExamen(c) {
  if (!c.epo) return null;
  const e = estadoMedico(c);
  const fin = e.code === 'interconsulta' || e.code === 'pendiente' ? todayISO()
    : (c.interconsulta_cierre || c.aptitud_recibida || todayISO());
  return { dias: Math.max(0, daysBetween(c.epo, fin)), abierto: e.code === 'interconsulta' || e.code === 'pendiente' };
}

export function timelineExamen(c) {
  const h = hitosExamen(c);
  if (!h.length) return html`<p class="small muted">Sin examen médico registrado.</p>`;
  const d = diasExamen(c);
  return html`<ol class="ex-tl">${h.map(([l, f], i) => html`<li>
      <span class="ex-dot"></span><b>${l}</b><span class="mono small">${fmtDate(f)}</span>
      ${i ? html`<small class="muted">+${daysBetween(h[i - 1][1], f)} d</small>` : ''}</li>`)}
    ${d?.abierto ? html`<li class="ex-open"><span class="ex-dot"></span><b>${estadoMedico(c).label}</b><span class="small muted">hoy · ${d.dias} días desde el envío</span></li>` : ''}
  </ol>${d && !d.abierto ? html`<p class="small"><b>${d.dias} días</b> desde el envío hasta la aptitud${estadoMedico(c).trasInterconsulta ? ' (incluye interconsulta)' : ''}.</p>` : ''}`;
}

// Campos de la ficha del candidato
export function examenFields(c) {
  // clínicas: las 4 con convenio + otras ya cargadas que no sean nombres de localidades
  const clinicas = [CLINICAS, state.candidates.map((x) => clinicaCanon(x.clinica)).filter((v) => v && !buscarLocalidad(v))];
  const sedes = state.candidates.map((x) => x.clinica_localidad);
  return html`<fieldset class="field--wide ex-box"><legend>Examen médico preocupacional ${pillMedico(c)}</legend>
    ${c.id ? timelineExamen(c) : ''}
    <div class="form-grid">
      ${field('Enviado a examen (EPO)', 'epo', c.epo, { type: 'date' })}
      ${field('Hora del turno', 'turno_hora', c.turno_hora, { type: 'time' })}
      ${pickField('Clínica', 'clinica', clinicaCanon(c.clinica), clinicas)}
      ${pickField('Sede / localidad del convenio', 'clinica_localidad', c.clinica_localidad, sedes, { hint: 'DIENTS tiene convenios en varias ciudades' })}
      ${field('Resultado recibido', 'aptitud_recibida', c.aptitud_recibida, { type: 'date' })}
      ${field('Aptitud', 'aptitud', c.aptitud, { options: [['', '—'], 'Apto', 'Apto Con Preexistencia', 'No Apto Temporal', 'No Apto'] })}
    </div>
    <div class="ex-inter">
      <div class="ex-inter-head"><b>Interconsulta</b>
        <span class="spacer"></span>
        ${c.interconsulta ? '' : html`<button type="button" class="btn btn--sm" data-act="interconsulta-hoy">Enviado a interconsulta</button>`}</div>
      <div class="form-grid">
        ${field('Enviado a interconsulta', 'interconsulta', c.interconsulta, { type: 'date' })}
        ${field('Cierre de interconsulta', 'interconsulta_cierre', c.interconsulta_cierre, { type: 'date', hint: 'Cargá también la aptitud final' })}
        ${field('Observaciones de la interconsulta', 'interconsulta_obs', c.interconsulta_obs, { type: 'textarea', span: 2 })}
      </div>
    </div>
  </fieldset>`;
}

// Botón "Enviado a interconsulta": completa la fecha de hoy (se guarda con Guardar)
export function bindExamen(root) {
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="interconsulta-hoy"]')) return;
    const f = root.querySelector('input[name="interconsulta"]');
    if (f && !f.value) f.value = todayISO();
    f?.focus();
    e.target.closest('button').textContent = 'Fecha cargada: guardá la ficha';
  });
}
export { raw };
