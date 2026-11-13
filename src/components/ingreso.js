// Piezas compartidas: buscador de puesto de convenio y datos de pre-ingreso.
import { html, raw } from '../lib/html.js';
import CONVENIO from '../data/convenio.json';
import { field, pickField } from './ui.js';
import { state } from '../lib/store.js';

// ---------------------------------------------------------------------------
// Puesto de convenio: en el formulario se elige primero el PUESTO (buscador)
// y la categoría y el convenio se completan solos.
// ---------------------------------------------------------------------------
const convShort = (c) => (c || '').split(' - ')[0]; // "II - Mantenimiento…" -> "II"
const optionLabel = (r) => `${r.puesto} · Cat. ${r.categoria} · Conv. ${convShort(r.convenio)}`;
const BY_LABEL = new Map(CONVENIO.map((r) => [optionLabel(r), r]));

export function convenioFields(rec) {
  const cur = CONVENIO.find((r) => r.puesto === rec.puesto_convenio && (!rec.convenio || r.convenio === rec.convenio));
  const shown = cur ? optionLabel(cur) : rec.puesto_convenio || '';
  return html`
    <label class="field field--wide" for="f-conv-search"><span>Puesto de convenio</span>
      <input id="f-conv-search" type="search" list="dl-convenio" value="${shown}" placeholder="Escribí para buscar: oficial, operador, ayudante…" autocomplete="off">
      <small>Elegí el puesto: la categoría se completa sola.</small>
    </label>
    <input type="hidden" name="puesto_convenio" value="${rec.puesto_convenio ?? ''}">
    <input type="hidden" name="convenio" value="${rec.convenio ?? cur?.convenio ?? ''}">
    ${field('Categoría', 'categoria', rec.categoria)}
    <label class="field"><span>Convenio</span><input id="f-conv-show" value="${rec.convenio ?? cur?.convenio ?? ''}" disabled></label>
    <datalist id="dl-convenio">${CONVENIO.map((r) => html`<option value="${optionLabel(r)}"></option>`)}</datalist>`;
}

// Conecta el buscador con los campos ocultos (llamar una vez montado el form).
export function bindConvenio(form) {
  const search = form.querySelector('#f-conv-search');
  if (!search) return;
  const apply = () => {
    const r = BY_LABEL.get(search.value);
    if (r) {
      form.elements.puesto_convenio.value = r.puesto;
      form.elements.convenio.value = r.convenio;
      form.elements.categoria.value = r.categoria;
      form.querySelector('#f-conv-show').value = r.convenio;
    } else {
      // texto libre (puesto fuera de la lista): se guarda tal cual
      form.elements.puesto_convenio.value = search.value.trim();
    }
  };
  search.addEventListener('change', apply);
  search.addEventListener('input', () => { if (BY_LABEL.has(search.value)) apply(); });
}

export const convenioLabel = (p) =>
  [p.categoria ? `Cat. ${p.categoria}` : '', p.puesto_convenio].filter(Boolean).join(' · ');

// ---------------------------------------------------------------------------
// Datos de pre-ingreso (sensibles: solo RRHH)
// ---------------------------------------------------------------------------
export const PREINGRESO_FIELDS = [
  ['dni', 'DNI'], ['cuil', 'CUIL'], ['fecha_nacimiento', 'Fecha de nacimiento'],
  ['telefono', 'Teléfono'], ['mail', 'Mail'], ['domicilio', 'Domicilio'],
  ['localidad', 'Localidad'], ['provincia', 'Provincia'],
  ['talle_mameluco', 'Talle mameluco'], ['talle_botas', 'Talle botas'], ['talle_campera', 'Talle campera'],
];

export function preingresoProgress(c) {
  const missing = PREINGRESO_FIELDS.filter(([k]) => !c?.[k] || String(c[k]).trim() === '').map(([, l]) => l);
  return { done: PREINGRESO_FIELDS.length - missing.length, total: PREINGRESO_FIELDS.length, missing };
}

const TALLES_ROPA = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'];
const TALLES_BOTAS = Array.from({ length: 14 }, (_, i) => String(35 + i));
const PROVINCIAS = ['Neuquén', 'Río Negro', 'Mendoza', 'La Pampa', 'Chubut', 'Buenos Aires', 'Córdoba', 'Santa Cruz', 'Salta'];

// talles en su orden natural (no alfabético)
function pickTalle(label, name, value, talles) {
  const cur = String(value ?? '').trim().toUpperCase();
  const opts = cur && !talles.includes(cur) ? [...talles, cur] : talles;
  return html`<label class="field" for="f-${name}"><span>${label}</span>
    <select id="f-${name}" name="${name}"><option value="">—</option>
      ${opts.map((t) => html`<option value="${t}" ${raw(t === cur ? 'selected' : '')}>${t}</option>`)}</select></label>`;
}

export function preingresoFields(c) {
  return html`
    <fieldset class="field--wide sensitive"><legend>Datos personales · solo RRHH</legend>
      <div class="form-grid">
        ${field('DNI', 'dni', c.dni)}
        ${field('CUIL', 'cuil', c.cuil, { hint: 'Ej. 20-12345678-3' })}
        ${field('Fecha de nacimiento', 'fecha_nacimiento', c.fecha_nacimiento, { type: 'date' })}
        ${field('Teléfono', 'telefono', c.telefono, { type: 'tel' })}
        ${field('Mail', 'mail', c.mail, { type: 'email', span: 2 })}
        ${field('Domicilio', 'domicilio', c.domicilio, { span: 2 })}
        ${pickField('Localidad', 'localidad', c.localidad, [state.candidates.map((x) => x.localidad), state.nomina.map((x) => x.localidad), state.positions.map((x) => x.localidad)])}
        ${pickField('Provincia', 'provincia', c.provincia, [PROVINCIAS, state.candidates.map((x) => x.provincia), state.nomina.map((x) => x.provincia)])}
      </div>
    </fieldset>
    <fieldset class="field--wide"><legend>Talles de ropa de trabajo</legend>
      <div class="form-grid form-grid--3">
        ${pickTalle('Mameluco', 'talle_mameluco', c.talle_mameluco, TALLES_ROPA)}
        ${pickTalle('Botas', 'talle_botas', c.talle_botas, TALLES_BOTAS)}
        ${pickTalle('Campera', 'talle_campera', c.talle_campera, TALLES_ROPA)}
      </div>
    </fieldset>`;
}

export { raw };
