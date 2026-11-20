// Nómina general EFiS (solo RRHH). Todo el personal; los ingresos confirmados
// en la app se agregan solos. Se puede reimportar la planilla (clave: DNI).
import { html, raw, $ } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, fmtInt, norm, todayISO, daysBetween, fmtMonth } from '../lib/format.js';
import { countBy } from '../lib/kpis.js';
import { decodeBytes } from '../lib/csv.js';
import { parseNominaCSV } from '../lib/importers.js';
import {
  filterGroup, toggleFilter, kpi, bars, openDrawer, closeDrawer, toast, formData, field, confirmDialog, animateIn, pickField,
  multiSelectFilter, loadLocal, saveLocal,

} from '../components/ui.js';
import { mascot } from '../components/mascot.js';

const DIMS = ['yacimiento', 'sector', 'encuadre', 'estado', 'pendiente'];
const filters = Object.fromEntries(DIMS.map((d) => [d, new Set(d === 'estado' ? ['activo'] : [])]));
let search = '';
let page = 1;
// Dotación por mes: quiénes estaban en la empresa en los meses elegidos
let meses = new Set(loadLocal('reclutapp.nom.meses', []));
let openMulti = null;
const finDeMes = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
// estaba en el mes m: ingresó antes de que termine y no se fue antes de que empiece
const enMes = (n, m) => !!n.fecha_ingreso && n.fecha_ingreso <= finDeMes(m)
  && (n.fecha_baja ? n.fecha_baja >= m + '-01' : n.estado !== 'baja');
function mesesDisponibles() {
  const ini = state.nomina.map((n) => n.fecha_ingreso).filter(Boolean).sort()[0];
  if (!ini) return [];
  const out = []; const hoy = todayISO().slice(0, 7);
  let [y, m] = ini.slice(0, 7).split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= hoy) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out.reverse();
}
function presetsMeses(disp) {
  const hoy = todayISO().slice(0, 7); const y = Number(hoy.slice(0, 4));
  return [['Este mes', [hoy]], ['Últimos 3 meses', disp.slice(0, 3)], ['Últimos 6 meses', disp.slice(0, 6)],
    [`Año ${y}`, disp.filter((m) => m.startsWith(String(y)))], [`Año ${y - 1}`, disp.filter((m) => m.startsWith(String(y - 1)))]]
    .filter(([, v]) => v.length);
}

const PAGE = 80;

const okVal = (v) => /^ok$/i.test((v || '').trim()) || /no corresponde/i.test(v || '');
const pendientes = (n) => {
  const p = [];
  if (!okVal(n.ddjj)) p.push('DDJJ');
  if (!okVal(n.regalo_kit)) p.push('Kit');
  if (!n.cuil) p.push('CUIL');
  if (!n.telefono) p.push('Teléfono');
  return p.length ? p : ['Al día'];
};
// Agrupar sin distinguir mayúsculas/acentos: "MANTENIMIENTO" = "Mantenimiento".
let canon = new Map();
function buildCanon() {
  const freq = new Map();
  for (const n of state.nomina) for (const k of ['sector', 'yacimiento']) {
    const v = n[k]; if (!v) continue;
    const key = k + '|' + norm(v);
    const m = freq.get(key) || new Map(); m.set(v, (m.get(v) || 0) + (v === v.toUpperCase() && v.length > 4 ? 0.5 : 1)); freq.set(key, m);
  }
  canon = new Map([...freq].map(([key, m]) => [key, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
}
const canonOf = (k, v) => (v ? canon.get(k + '|' + norm(v)) || v : 'Sin dato');
const getters = {
  yacimiento: (n) => canonOf('yacimiento', n.yacimiento),
  sector: (n) => canonOf('sector', n.sector),
  encuadre: (n) => n.encuadre || 'Sin dato',
  estado: (n) => n.estado,
  pendiente: (n) => pendientes(n),
};
const edad = (n) => (n.fecha_nacimiento ? Math.floor(daysBetween(n.fecha_nacimiento, todayISO()) / 365.25) : null);


function filterRows(except, { sinMeses = false } = {}) {
  const porMes = meses.size && !sinMeses;
  return state.nomina.filter((n) => DIMS.every((d) => d === except || (porMes && d === 'estado') || !filters[d].size || [].concat(getters[d](n)).some((v) => filters[d].has(v)))
    && (!porMes || [...meses].some((m) => enMes(n, m))));
}
const opts = (dim) => {
  const o = countBy(filterRows(dim), getters[dim]).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  for (const v of filters[dim]) if (!o.some(([k]) => k === v)) o.push([v, 0]);
  return o;
};

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'La nómina requiere iniciar sesión con un usuario de RRHH.' })); return; }
  if (state.loading && !state.nomina.length) { el.innerHTML = String(mascot('loading')); return; }

  buildCanon();
  const base = filterRows(null);
  let rows = base;
  if (search) {
    const q = norm(search);
    rows = rows.filter((n) => norm([n.nombre, n.dni, n.cuil, n.nro_pers, n.pos, n.funcion, n.titling, n.jefe, n.ceco].join(' ')).includes(q));
  }
  rows = [...rows].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const shown = rows.slice(0, page * PAGE);
  const hoy = todayISO();
  const pfProx = base.filter((n) => n.fin_pf && n.fin_pf >= hoy && daysBetween(hoy, n.fin_pf) <= 60).length;
  const recientes = base.filter((n) => n.fecha_ingreso && daysBetween(n.fecha_ingreso, hoy) <= 90).length;

  el.innerHTML = String(html`
  <section class="page-head"><div><h1>Nómina EFiS</h1></div>
    <div class="head-actions">
      <label class="btn">Reimportar planilla<input type="file" id="nom-file" accept=".csv,text/csv" hidden></label>
      <button class="btn" data-act="export">Exportar CSV</button>
      <button class="btn" data-act="new">+ Alta</button>
    </div>
  </section>
  <section class="filters card">
    ${filterGroup({ dim: 'yacimiento', label: 'Yacimiento', options: opts('yacimiento'), selected: filters.yacimiento, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'sector', label: 'Sector', options: opts('sector'), selected: filters.sector, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'encuadre', label: 'Encuadre', options: opts('encuadre'), selected: filters.encuadre, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'pendiente', label: 'Pendiente', options: opts('pendiente'), selected: filters.pendiente, allLabel: 'Todos' })}
    ${meses.size ? '' : filterGroup({ dim: 'estado', label: 'Estado', options: opts('estado'), selected: filters.estado, allLabel: 'Todos' })}
    <div class="filters-row">
      ${multiSelectFilter({ dim: 'mes', label: 'Dotación en el mes', options: mesesDisponibles().map((m) => [m, filterRowsSinEstado().filter((n) => enMes(n, m)).length]), selected: meses, allLabel: 'Hoy', presets: presetsMeses(mesesDisponibles()), open: openMulti === 'mes', labelOf: (m) => fmtMonth(m) })}
    </div>
  </section>
  <section class="kpis kpis--6">
    ${kpi(meses.size ? (meses.size === 1 ? `Dotación ${fmtMonth([...meses][0])}` : 'Personas en el período') : 'Personas', base.length, { tone: 'blue', big: true, id: 'n-tot' })}
    ${kpi('Ingresos últimos 90 días', recientes, { tone: 'green', id: 'n-rec' })}
    ${kpi('DDJJ pendiente', base.filter((n) => !okVal(n.ddjj)).length, { tone: 'orange', id: 'n-ddjj' })}
    ${kpi('Kit pendiente', base.filter((n) => !okVal(n.regalo_kit)).length, { tone: 'orange', id: 'n-kit' })}
    ${kpi('Plazo fijo vence ≤ 60 días', pfProx, { tone: pfProx ? 'red' : '', id: 'n-pf' })}
    ${kpi('Edad promedio', Math.round(base.map(edad).filter(Boolean).reduce((a, b, _, arr) => a + b / arr.length, 0)) || 0, { id: 'n-edad' })}
  </section>
  ${meses.size ? dotacionPorMes() : ''}
  <section class="grid-2">
    <article class="card"><h2 class="card-title">Por yacimiento</h2>${bars(countBy(filterRows('yacimiento'), getters.yacimiento), { dim: 'yacimiento', selected: filters.yacimiento, chart: 'n-yac', limit: 12 })}</article>
    <article class="card"><h2 class="card-title">Por sector</h2>${bars(countBy(filterRows('sector'), getters.sector), { color: 'green', dim: 'sector', selected: filters.sector, chart: 'n-sec', limit: 12 })}</article>
  </section>
  <section class="card">
    <header class="list-head"><h2 class="card-title">Personal <small class="muted">${rows.length}</small></h2>
      <label class="search"><input type="search" id="nom-search" placeholder="Buscar nombre, DNI, Nº pers., POS, función, jefe…" value="${search}"></label></header>
    ${rows.length ? html`<div class="table-wrap"><table class="tbl is-clickable">
      <thead><tr><th>Nombre</th><th>DNI</th><th class="hide-sm">Nº pers.</th><th class="hide-sm">Yac. · Sector</th><th class="hide-sm">Función</th><th class="hide-sm">Cat.</th><th class="hide-sm">Diagrama</th><th class="hide-sm">Jefe</th><th>Ingreso</th><th class="hide-sm num">Edad</th><th>Pend.</th></tr></thead>
      <tbody>${shown.map((n) => {
        const pend = pendientes(n).filter((p) => p !== 'Al día');
        return html`<tr data-id="${n.id}" tabindex="0" class="${n.estado === 'baja' ? 'is-off' : ''}">
          <td data-th="Nombre"><strong>${n.nombre}</strong>${n.origen === 'app' ? html` <span class="tag tag--match">alta app</span>` : ''}${n.estado === 'baja' ? html` <span class="tag tag--late">baja</span>` : ''}</td>
          <td data-th="DNI" class="mono">${n.dni || ''}</td>
          <td data-th="Nº pers." class="hide-sm mono">${n.nro_pers || ''}</td>
          <td data-th="Yac." class="hide-sm">${[n.yacimiento, n.sector].filter(Boolean).join(' · ')}</td>
          <td data-th="Función" class="hide-sm">${n.funcion || n.titling || ''}</td>
          <td data-th="Cat." class="hide-sm">${n.categoria || ''}</td>
          <td data-th="Diagrama" class="hide-sm">${n.diagrama || ''}</td>
          <td data-th="Jefe" class="hide-sm">${n.jefe || ''}</td>
          <td data-th="Ingreso">${fmtDate(n.fecha_ingreso)}</td>
          <td data-th="Edad" class="hide-sm num">${edad(n) ?? ''}</td>
          <td data-th="Pend.">${pend.map((p) => html`<span class="tag tag--late">${p}</span> `)}</td>
        </tr>`;
      })}</tbody></table></div>
      ${rows.length > shown.length ? html`<div class="center"><button class="btn btn--ghost" data-act="more">Ver más (${rows.length - shown.length})</button></div>` : ''}`
      : mascot('empty')}
  </section>`);
  animateIn(el);

  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', (e) => {
      const pr = e.target.closest('[data-multi-preset]');
      if (pr) { meses = new Set(pr.dataset.values ? JSON.parse(pr.dataset.values) : []); saveLocal('reclutapp.nom.meses', [...meses]); openMulti = 'mes'; page = 1; render(el); return; }
      const sm = e.target.closest('.fmulti-box > summary');
      if (sm) { e.preventDefault(); const box = sm.parentElement; box.open = !box.open; openMulti = box.open ? 'mes' : null; return; }
      const f = e.target.closest('[data-filter]');
      if (f) { toggleFilter(filters, f.dataset.filter, f.dataset.value); page = 1; render(el); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'more') { page++; render(el); return; }
      if (act === 'export') return exportCSV(currentRows(el));
      if (act === 'new') return openPersona(null);
      const tr = e.target.closest('tr[data-id]');
      if (tr) openPersona(tr.dataset.id);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) openPersona(e.target.dataset.id); });
    el.addEventListener('change', (e) => {
      const mo = e.target.closest('[data-multi-opt]');
      if (mo) { if (mo.checked) meses.add(mo.value); else meses.delete(mo.value); saveLocal('reclutapp.nom.meses', [...meses]); openMulti = 'mes'; page = 1; render(el); return; }
      if (e.target.id === 'nom-file' && e.target.files[0]) reimportar(e.target.files[0]);
    });
    document.addEventListener('click', (e) => {
      if (openMulti && el.isConnected && !e.target.closest('.fmulti-box')) { openMulti = null; el.querySelectorAll('.fmulti-box[open]').forEach((d) => { d.open = false; }); }
    });
  }
  el._rows = rows;
  const s = $('#nom-search', el);
  s?.addEventListener('input', () => { search = s.value; page = 1; const p = s.selectionStart; render(el); const n = $('#nom-search', el); n.focus(); n.setSelectionRange(p, p); });
}
const currentRows = (el) => el._rows || [];

const FIELDS = [
  ['nombre', 'Apellido y nombre', { required: true, span: 2 }], ['dni', 'DNI'], ['cuil', 'CUIL'],
  ['nro_pers', 'Nº personal'], ['id_ext', 'ID externo'], ['fecha_nacimiento', 'Nacimiento', { type: 'date' }], ['sexo', 'Sexo', { options: [['', '—'], 'M', 'F', 'X'] }],
  ['fecha_ingreso', 'Fecha de ingreso', { type: 'date' }], ['f_reconocida', 'Fecha reconocida', { type: 'date' }],
  ['encuadre', 'Encuadre'], ['categoria', 'Categoría'], ['fin_pf', 'Fin plazo fijo', { type: 'date' }], ['titling', 'Titling'],
  ['funcion', 'Función'], ['sector', 'Sector'], ['yacimiento', 'Yacimiento'], ['diagrama', 'Diagrama'], ['jefe', 'Jefe'],
  ['pos', 'POS'], ['ceco', 'CECO'], ['puesto', 'Puesto (silla)'], ['basico', 'Básico', { type: 'number', step: '0.01' }],
  ['procedencia', 'Procedencia'], ['tipo_cobertura', 'Tipo de cobertura', { options: [['', '—'], 'Búsqueda externa', 'Movimiento interno'] }], ['domicilio', 'Domicilio', { span: 2 }], ['localidad', 'Localidad'], ['provincia', 'Provincia'],
  ['telefono', 'Teléfono', { type: 'tel' }], ['mail', 'Mail', { type: 'email' }],
  ['talle_mameluco', 'Talle mameluco'], ['talle_botas', 'Talle botas'], ['talle_campera', 'Talle campera'],
  ['aportes', 'Aportes'], ['ddjj', 'DDJJ'], ['regalo_kit', 'Regalo kit'],
  ['estado', 'Estado', { options: [['activo', 'Activo'], ['baja', 'Baja']] }], ['fecha_baja', 'Fecha de baja', { type: 'date' }],
  ['motivo_baja', 'Motivo de baja'], ['notas', 'Notas', { type: 'textarea', span: 2 }],
];

// campos con desplegable de valores existentes
const PICK = {
  yacimiento: () => [state.nomina.map((x) => x.yacimiento), state.positions.map((x) => x.yacimiento)],
  sector: () => state.nomina.map((x) => x.sector),
  encuadre: () => state.nomina.map((x) => x.encuadre),
  categoria: () => state.nomina.map((x) => x.categoria),
  diagrama: () => [state.nomina.map((x) => x.diagrama), state.positions.map((x) => x.diagrama)],
  jefe: () => [state.nomina.map((x) => x.jefe), state.positions.map((x) => x.jefe_directo)],
  localidad: () => [state.nomina.map((x) => x.localidad), state.candidates.map((x) => x.localidad)],
  provincia: () => state.nomina.map((x) => x.provincia),
  procedencia: () => [state.nomina.map((x) => x.procedencia), state.candidates.map((x) => x.procedencia)],
};

function openPersona(id) {
  const n = id ? state.nomina.find((x) => x.id === id) : { estado: 'activo', origen: 'planilla' };
  if (!n) return;
  const silla = n.position_id ? state.positions.find((p) => p.id === n.position_id) : null;
  const root = openDrawer(html`
    ${silla ? html`<p class="note small">Ingresó por la silla <b>${silla.puesto}</b> (${silla.yacimiento} · ${silla.sector || ''})${n.procedencia ? ` · ${n.procedencia}` : ''}. También aparece en Legajos.</p>` : ''}
    <form id="nom-form" class="form-grid">
      ${FIELDS.map(([k, l, o = {}]) => (PICK[k] ? pickField(l, k, n[k], PICK[k](), o) : field(l, k, n[k], o)))}
      <div class="form-actions field--wide">
        ${n.id ? html`<button type="button" class="btn btn--danger-ghost" data-act="delete">Eliminar</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn--primary">Guardar</button>
      </div>
    </form>`, { title: n.id ? n.nombre : 'Alta en nómina', wide: true });
  root.querySelector('#nom-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    if (data.dni) data.dni = String(data.dni).replace(/\D/g, '');
    if (data.estado === 'baja' && !data.fecha_baja) return toast('Indicá la fecha de baja', 'error');
    const { error } = n.id ? await sb.from('nomina').update(data).eq('id', n.id) : await sb.from('nomina').insert(data);
    if (error) return toast(/duplicate|unique/i.test(error.message) ? 'Ya existe una persona con ese DNI' : error.message, 'error');
    toast('Guardado', 'ok'); closeDrawer(); loadAll({ silent: true });
  });
  root.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act="delete"]')) return;
    if (!(await confirmDialog(`¿Eliminar a ${n.nombre} de la nómina? Para una salida usá Estado = Baja.`, { ok: 'Eliminar', danger: true }))) return;
    const { error } = await sb.from('nomina').delete().eq('id', n.id);
    if (error) return toast(error.message, 'error');
    toast('Eliminado', 'ok'); closeDrawer(); loadAll({ silent: true });
  });
}

async function reimportar(file) {
  try {
    const { rows, warnings } = parseNominaCSV(decodeBytes(new Uint8Array(await file.arrayBuffer())));
    const nuevos = rows.filter((r) => !state.nomina.some((n) => n.dni === r.dni)).length;
    if (!(await confirmDialog(`Planilla de nómina: ${rows.length} personas (${nuevos} nuevas, ${rows.length - nuevos} a actualizar por DNI)${warnings.length ? `, ${warnings.length} filas salteadas` : ''}. Los datos de la planilla reemplazan a los de la app para esas personas. ¿Importar?`, { ok: 'Importar' }))) return;
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await sb.from('nomina').upsert(rows.slice(i, i + 100), { onConflict: 'dni' });
      if (error) throw error;
    }
    toast('Nómina actualizada', 'ok');
    loadAll({ silent: true });
  } catch (err) { toast(err.message, 'error', 6000); }
}

function exportCSV(rows) {
  const cols = FIELDS.map(([k]) => k);
  const q = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const body = [FIELDS.map(([, l]) => l).join(';'), ...rows.map((r) => cols.map((c) => q(r[c])).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  a.download = `nomina_efis_${todayISO()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export { raw, fmtInt };

// Tabla de dotación para los meses elegidos (con los demás filtros aplicados)
function dotacionPorMes() {
  const base = filterRowsSinEstado();
  const lista = [...meses].sort();
  return html`<section class="card"><h2 class="card-title">Dotación por mes</h2><div class="table-wrap"><table class="tbl tbl--compact">
    <thead><tr><th>Mes</th><th class="num">Dotación</th><th class="num">Ingresos del mes</th><th class="num">Bajas del mes</th></tr></thead>
    <tbody>${lista.map((m) => html`<tr><td><b>${fmtMonth(m)}</b></td>
      <td class="num"><b>${base.filter((n) => enMes(n, m)).length}</b></td>
      <td class="num">${base.filter((n) => n.fecha_ingreso && n.fecha_ingreso.startsWith(m)).length || '·'}</td>
      <td class="num">${base.filter((n) => n.fecha_baja && n.fecha_baja.startsWith(m)).length || '·'}</td></tr>`)}</tbody>
  </table></div></section>`;
}
// para contar la dotación de cada mes: todos los filtros menos Estado y meses
const filterRowsSinEstado = () => state.nomina.filter((n) => DIMS.every((d) => d === 'estado' || !filters[d].size || [].concat(getters[d](n)).some((v) => filters[d].has(v))));
