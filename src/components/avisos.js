// Avisos a candidatos (semi-automático). La app arma el mensaje y abre WhatsApp
// o el correo de quien envía; RRHH revisa y manda. Se registra qué se avisó,
// por qué canal y cuándo. SOLO RRHH: usa teléfono y mail (datos sensibles).
import { html, raw } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, todayISO as hoyAR } from '../lib/format.js';
import { clinicaCanon } from './examen.js';
import { openDrawer, closeDrawer, toast } from './ui.js';
import { sigueEnOtroProceso } from '../lib/entrevistasPersona.js';

// Desde cuándo existe la función: las bajas anteriores no se piden avisar.
const LANZAMIENTO = '2026-11-15';

// Plantillas por defecto (las mismas que carga la base); se usan si la tabla
// todavía no existe o está vacía.
const DEFAULTS = [
  { tipo: 'entrevista', titulo: 'Coordinar entrevista virtual', asunto: 'Entrevista · EFiS', orden: 1,
    cuerpo: 'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.\n\nRecibimos tu postulación para {posicion} y queremos coordinar una entrevista virtual (videollamada, unos 30 minutos).\n\n¿Nos indicás qué días y horarios tenés disponibles en los próximos días?\n\n¡Gracias!\nRecursos Humanos · EFiS' },
  { tipo: 'entrevista_ok', titulo: 'Entrevista aprobada · examen médico', asunto: 'Preselección: examen médico preocupacional · EFiS', orden: 2,
    cuerpo: 'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.\n\nTe contamos que avanzás a la siguiente etapa del proceso de preselección para {posicion}: el examen médico preocupacional, cuyo turno vamos a coordinar con vos.\n\nTené en cuenta que el proceso de selección sigue en curso: esta etapa no es definitiva ni implica una oferta o contratación. Te vamos a ir informando las novedades.\n\nPara coordinar el examen, por favor respondé este mensaje con:\nApellido y nombre completo:\nDNI:\nFecha de nac.:\nDirección:\nLocalidad:\nCódigo Postal:\n\n¡Gracias!\nRecursos Humanos · EFiS' },
  { tipo: 'proximo_ingreso', titulo: 'Seleccionado · próximo ingreso', asunto: 'Fuiste seleccionado/a · EFiS', orden: 3,
    cuerpo: 'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.\n\n¡Felicitaciones! Fuiste seleccionado/a para la próxima etapa de ingresos como {posicion}. En los próximos días nos vamos a poner en contacto para comentarte las novedades.\n\nPara preparar tu ingreso, por favor respondé con:\n{datos_faltantes}\n\n¡Bienvenido/a!\nRecursos Humanos · EFiS' },
  { tipo: 'baja', titulo: 'No continuamos', asunto: 'Tu postulación en EFiS', orden: 4,
    cuerpo: 'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.\n\nQueremos agradecerte por tu interés y por el tiempo que dedicaste al proceso de selección. En esta oportunidad no vamos a continuar con tu postulación.\n\nGuardamos tus datos por si surge una nueva búsqueda acorde a tu perfil. Te deseamos mucho éxito.\n\nSaludos,\nRecursos Humanos · EFiS' },
  { tipo: 'novedad', titulo: 'Novedad de la postulación', asunto: 'Tu postulación en EFiS', orden: 5,
    cuerpo: 'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.\n\nTe contamos que tu postulación para {posicion} avanzó a la etapa: {etapa}. Ante cualquier novedad te volvemos a escribir.\n\n¡Gracias!\nRecursos Humanos · EFiS' },
  { tipo: 'turno_synergys', titulo: 'Turno examen médico · Synergys', asunto: 'Turno confirmado · Examen médico preocupacional · EFiS', orden: 6,
    cuerpo: 'Hola {nombre}, ¿cómo estás? Te escribimos de Recursos Humanos de EFiS.\n\n¡Tu turno para el examen médico preocupacional quedó confirmado!\n\n📅 {fecha_turno}\n🏥 Clínica Synergys\n📍 República Argentina 1, Rincón de los Sauces\n     (Ref.: detrás de la parrilla del Kacike)\n\nPara que el estudio salga bien a la primera, tené en cuenta:\n\n• Ayuno de 12 horas.\n• Retener la orina durante las 4 horas previas.\n• Llevar tu DNI.\n• Ir con ropa cómoda, fácil de quitar en la parte de arriba.\n• Ese día no te apliques cremas, aceites ni talco en el pecho.\n• Si tenés abundante vello en el pecho, puede ser necesario recortarlo o rasurarlo en parte para colocar bien los electrodos y que la lectura no tenga interferencias.\n• Si tomás alguna medicación, seguí tomándola como siempre.\n\nSi por algún motivo no podés asistir, respondé este mensaje y reprogramamos el turno.\n\n¡Te esperamos! Es un paso más en tu camino a EFiS.\n\nSaludos cordiales,\nRecursos Humanos · EFiS' },
];

// Las de la base pisan a las por defecto (por tipo); si falta alguna, se usa la por defecto.
export const plantillas = () => {
  const porTipo = new Map(DEFAULTS.map((p) => [p.tipo, p]));
  for (const p of state.plantillas || []) porTipo.set(p.tipo, p);
  return [...porTipo.values()].sort((a, b) => a.orden - b.orden);
};
const plantilla = (tipo) => plantillas().find((p) => p.tipo === tipo) || plantillas()[0];

// Etapas principales con mensaje propio; cualquier otro cambio usa "novedad".
const POR_ETAPA = { entrevista: 'entrevista', entrevista_aprobada: 'entrevista_ok', proximo_ingreso: 'proximo_ingreso', cancelado: 'baja' };
// Turno cargado en una clínica con mensaje propio (plantilla "turno_<clínica>"): se sugiere mientras el turno sea de hoy en adelante
export const tipoTurno = (c) => {
  if (!c?.epo || c.stage !== 'examen_medico') return null;
  const t = 'turno_' + String(clinicaCanon(c.clinica) || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return plantillas().some((p) => p.tipo === t) ? t : null;
};
export function tipoSugerido(c) {
  const t = tipoTurno(c);
  if (t && c.epo >= hoyAR()) return t;
  return POR_ETAPA[c.stage] || null;
}
export const avisosDe = (c) => (state.avisos || []).filter((a) => a.candidate_id === c.id);

// Celular argentino -> formato internacional de WhatsApp (549 + área + número).
export function telWhatsApp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) { d = d.slice(2); if (d.startsWith('9')) d = d.slice(1); }
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) { // área + 15 + número: sacar el 15
    for (const i of [3, 2, 4]) if (d.slice(i, i + 2) === '15') { d = d.slice(0, i) + d.slice(i + 2); break; }
  }
  return d.length === 10 ? `549${d}` : null;
}

const primerNombre = (c) => {
  // Las fichas vienen "Apellido Nombre". Con dos palabras es seguro tomar la
  // segunda; con más (apellidos o nombres compuestos) usamos el nombre completo
  // y RRHH lo ajusta en el texto antes de enviar.
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const p = String(c.nombre || '').trim().split(/\s+/).filter(Boolean);
  return p.length === 2 ? cap(p[1]) : p.map(cap).join(' ');
};

// Lo que falta en la ficha para el ingreso (talles siempre que no estén cargados)
export function datosFaltantes(c) {
  const f = [
    ['talle_mameluco', 'Talle de mameluco'], ['talle_botas', 'Talle de botas'], ['talle_campera', 'Talle de campera'],
    ['dni', 'DNI'], ['cuil', 'CUIL'], ['fecha_nacimiento', 'Fecha de nacimiento'], ['domicilio', 'Dirección'],
    ['localidad', 'Localidad'], ['codigo_postal', 'Código Postal'], ['provincia', 'Provincia'], ['mail', 'Mail'],
  ].filter(([k]) => !String(c[k] ?? '').trim()).map(([, l]) => `${l}:`);
  return f.length ? f.join('\n') : '(Ya tenemos todos tus datos, ¡gracias!)';
}

// "lunes 30 de noviembre" (con mayúscula inicial)
function fechaLarga(iso) {
  if (!iso) return '[fecha del turno]';
  const t = new Date(iso + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function armarTexto(tpl, c) {
  const vals = {
    etapa: state.stageMap[c.stage]?.label || c.stage || '',
    datos_faltantes: datosFaltantes(c),
    nombre: primerNombre(c),
    nombre_completo: c.nombre || '',
    posicion: c._silla?.puesto || c.posicion || 'el puesto',
    area: c._silla?.yacimiento || c.area || '',
    fecha_turno: fechaLarga(c.epo),
    clinica: clinicaCanon(c.clinica) || '',
  };
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
}

export function pendientesDeAviso() {
  return state.candidates.filter((c) => {
    const tipo = tipoSugerido(c);
    if (!tipo) return false;
    if (tipo === 'baja' && !(c.fecha_baja && c.fecha_baja >= LANZAMIENTO)) return false;
    if (tipo === 'baja' && sigueEnOtroProceso(c)) return false;
    return !avisosDe(c).some((a) => a.tipo === tipo);
  });
}

function historialAvisos(c) {
  const hs = avisosDe(c).sort((a, b) => b.enviado_at.localeCompare(a.enviado_at));
  if (!hs.length) return '';
  const tit = (t) => plantillas().find((p) => p.tipo === t)?.titulo || t;
  return html`<ul class="aviso-hist">${hs.map((a) => html`<li>${a.canal === 'omitido' ? 'Marcado sin aviso' : `Avisado por ${a.canal === 'whatsapp' ? 'WhatsApp' : 'mail'}`}
    · ${tit(a.tipo)} · ${fmtDate(a.enviado_at)}</li>`)}</ul>`;
}

// Bloque para la ficha del candidato
export function avisoBox(c, tipo = tipoSugerido(c)) {
  const pl = plantilla(tipo || 'novedad');
  const wa = telWhatsApp(c.telefono);
  const yaAvisado = avisosDe(c).some((a) => a.tipo === pl.tipo);
  return html`<section class="aviso-box" data-cid="${c.id}">
    <header><strong>Avisar al candidato</strong>
      ${tipoSugerido(c) && !yaAvisado ? html`<span class="tag tag--late">pendiente</span>` : ''}
      <span class="spacer"></span>
      <label class="fselect"><span class="sr-only">Mensaje</span>
        <select data-aviso="tipo">${plantillas().map((p) => html`<option value="${p.tipo}" ${raw(p.tipo === pl.tipo ? 'selected' : '')}>${p.titulo}</option>`)}</select></label>
    </header>
    <textarea data-aviso="texto" rows="9" aria-label="Mensaje a enviar">${armarTexto(pl.cuerpo, c)}</textarea>
    <div class="aviso-actions">
      <button type="button" class="btn btn--primary btn--sm" data-aviso-send="whatsapp" ${raw(wa ? '' : 'disabled')}
        title="${wa ? `Abre WhatsApp con +${wa}` : 'Sin celular válido en la ficha'}">WhatsApp</button>
      <button type="button" class="btn btn--sm" data-aviso-send="mail" ${raw(c.mail ? '' : 'disabled')}
        title="${c.mail ? `Abre tu correo para ${c.mail}` : 'Sin mail en la ficha'}">Mail</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn--ghost btn--sm" data-aviso-send="omitido" title="No hace falta avisar (ya se le dijo en persona, etc.)">No avisar</button>
    </div>
    ${!wa && c.telefono ? html`<p class="small muted">No reconozco el celular “${c.telefono}”. Corregilo en la ficha (código de área + número, sin 0 ni 15).</p>` : ''}
    ${historialAvisos(c)}
  </section>`;
}

// Conecta el bloque (delegado en el contenedor del panel)
export function bindAvisos(root, getC, { onDone } = {}) {
  root.addEventListener('change', (e) => {
    if (e.target.dataset.aviso !== 'tipo') return;
    const box = e.target.closest('.aviso-box');
    box.outerHTML = String(avisoBox(getC(), e.target.value));
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-aviso-send]');
    if (!b) return;
    const c = getC();
    const box = b.closest('.aviso-box');
    const tipo = box.querySelector('[data-aviso="tipo"]').value;
    const texto = box.querySelector('[data-aviso="texto"]').value;
    const canal = b.dataset.avisoSend;
    if (canal === 'whatsapp') window.open(`https://wa.me/${telWhatsApp(c.telefono)}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    if (canal === 'mail') location.href = `mailto:${encodeURIComponent(c.mail)}?subject=${encodeURIComponent(plantilla(tipo).asunto)}&body=${encodeURIComponent(texto)}`;
    const { error } = await sb.from('avisos').insert({ candidate_id: c.id, tipo, canal });
    if (error) { toast('Se abrió el mensaje, pero no se pudo registrar el aviso (falta aplicar el cambio en Supabase).', 'error', 6000); return; }
    toast(canal === 'omitido' ? 'Marcado: no hace falta avisar' : 'Aviso registrado. Revisá y enviá el mensaje.', 'ok', 4500);
    await loadAll({ silent: true });
    onDone?.();
  });
}

export function openAvisoDrawer(id, { tipo, cambio, motivo } = {}) {
  const getC = () => state.candidates.find((x) => x.id === id);
  const c = getC();
  if (!c) return;
  const intro = cambio
    ? html`<p class="note">Cambió de etapa: <b>${cambio.de}</b> → <b>${cambio.a}</b>. ¿Le avisás?</p>`
    : motivo ? html`<p class="note">${motivo}</p>` : '';
  const root = openDrawer(html`${intro}${avisoBox(c, tipo || tipoSugerido(c) || 'novedad')}`, { title: c.nombre });
  bindAvisos(root, getC, { onDone: () => closeDrawer() });
}

// Barra de la ficha del candidato: enviar WhatsApp / mail en cualquier momento
export function avisoBar(c) {
  const ult = avisosDe(c).sort((a, b) => b.enviado_at.localeCompare(a.enviado_at))[0];
  const pend = tipoSugerido(c) && !avisosDe(c).some((a) => a.tipo === tipoSugerido(c));
  return html`<div class="aviso-bar">
    <button type="button" class="btn btn--primary btn--sm" data-aviso-open="${c.id}" ${raw(telWhatsApp(c.telefono) ? '' : 'title="Sin celular válido: igual podés mandar mail"')}>Enviar WhatsApp</button>
    <button type="button" class="btn btn--sm" data-aviso-open="${c.id}">Enviar mail</button>
    ${pend ? html`<span class="tag tag--late">aviso pendiente</span>` : ''}
    <span class="small muted">${ult ? `Último aviso: ${ult.canal === 'omitido' ? 'marcado sin aviso' : ult.canal === 'whatsapp' ? 'WhatsApp' : 'mail'} · ${fmtDate(ult.enviado_at)}` : 'Todavía no se le envió ningún aviso.'}</span>
  </div>`;
}

// Después de cambiar la etapa en cualquier pantalla: ofrecer avisar
export function avisarCambioDeEtapa(id, etapaAnterior) {
  const c = state.candidates.find((x) => x.id === id);
  if (!c || !etapaAnterior || c.stage === etapaAnterior) return;
  if (tipoSugerido(c) === 'baja' && sigueEnOtroProceso(c)) return;
  const lab = (s) => state.stageMap[s]?.label || s;
  openAvisoDrawer(id, { tipo: tipoSugerido(c) || 'novedad', cambio: { de: lab(etapaAnterior), a: lab(c.stage) } });
}

// Tarjeta "Pendientes de avisar" (vista Candidatos, solo RRHH)
export function pendientesCard() {
  const ps = pendientesDeAviso();
  if (!ps.length) return '';
  const tit = (c) => plantilla(tipoSugerido(c)).titulo;
  return html`<section class="card">
    <div class="list-head"><h2 class="card-title">Pendientes de avisar <small class="muted">${ps.length}</small></h2>
      <button class="btn btn--sm btn--ghost" data-act="plantillas">Editar mensajes</button></div>
    <ul class="aviso-pend">${ps.map((c) => html`<li>
      <span><strong>${c.nombre}</strong> <small class="muted">${c.posicion || ''} · ${c.area || ''}</small></span>
      <span class="tag">${tit(c)}</span>
      <button class="btn btn--sm btn--primary" data-act="avisar" data-cid="${c.id}">Avisar</button></li>`)}</ul>
  </section>`;
}

export function openPlantillas() {
  const root = openDrawer(html`<p class="muted small">Podés usar {nombre} (primer nombre), {nombre_completo}, {posicion}, {area}, {etapa} y {datos_faltantes} (lista de lo que falta en su ficha: talles, DNI, CUIL, dirección, CP…): se reemplazan por los datos de cada candidato.</p>
    <form id="pl-form" class="form-grid">${plantillas().map((p) => html`<fieldset class="field--wide"><legend>${p.titulo}</legend>
      <label class="field field--wide"><span>Asunto del mail</span><input name="asunto_${p.tipo}" value="${p.asunto}"></label>
      <label class="field field--wide"><span>Mensaje</span><textarea name="cuerpo_${p.tipo}" rows="10">${p.cuerpo}</textarea></label>
    </fieldset>`)}
    <div class="form-actions field--wide"><span class="spacer"></span><button type="button" class="btn btn--ghost" data-close>Cancelar</button><button class="btn btn--primary" type="submit">Guardar</button></div></form>`,
  { title: 'Mensajes a candidatos', wide: true });
  root.querySelector('#pl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const rows = plantillas().map((p) => ({ tipo: p.tipo, titulo: p.titulo, orden: p.orden, asunto: f[`asunto_${p.tipo}`].value, cuerpo: f[`cuerpo_${p.tipo}`].value, updated_at: new Date().toISOString(), updated_by: state.session?.user?.id }));
    const { error } = await sb.from('plantillas_aviso').upsert(rows);
    if (error) return toast('No se pudo guardar (falta aplicar el cambio en Supabase).', 'error', 6000);
    toast('Mensajes guardados', 'ok'); closeDrawer(); loadAll({ silent: true });
  });
}
