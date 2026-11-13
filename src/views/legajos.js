import { html, $ } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, fmtMoney, fmtInt, norm, fmtMonth } from '../lib/format.js';
import { applyFilters, countBy } from '../lib/kpis.js';
import {
  filterGroup, toggleFilter, kpi, bars, animateIn, openDrawer, closeDrawer, toast, formData, field,
} from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { convenioFields, bindConvenio, preingresoFields } from '../components/ingreso.js';

const filters = { area: new Set(), sector: new Set(), estado: new Set(['activo']) };
// Legajos = nómina filtrada a quienes ingresaron por una silla (un único registro por persona).
const getters = { area: (h) => h.yacimiento || '—', sector: (h) => h.sector || '—', estado: (h) => h.estado };
let search = '';
let currentRows = [];

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Los legajos requieren iniciar sesión con un usuario de RRHH.' })); return; }
  if (state.loading && !state.hires.length) { el.innerHTML = String(mascot('loading')); return; }

  const base = applyFilters(state.hires, { area: filters.area, sector: filters.sector }, getters);
  let rows = applyFilters(state.hires, filters, getters);
  if (search) {
    const q = norm(search);
    rows = rows.filter((h) => norm([h.nombre, h.dni, h.puesto, h.mail, h.jefe].join(' ')).includes(q));
  }
  rows.sort((a, b) => (b.fecha_ingreso || '').localeCompare(a.fecha_ingreso || '') || a.nombre.localeCompare(b.nombre, 'es'));
  currentRows = rows;
  const activos = base.filter((h) => h.estado === 'activo');
  const porMes = countBy(base.filter((h) => h.fecha_ingreso), (h) => h.fecha_ingreso.slice(0, 7))
    .sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([m, n]) => [fmtMonth(m + '-01'), n]);
  const opts = (dim) => countBy(applyFilters(state.hires, { ...filters, [dim]: new Set() }, getters), getters[dim])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));

  el.innerHTML = String(html`
  <section class="page-head">
    <div><h1>Legajos de ingresados</h1>
      <p class="muted">Quienes ingresaron por una silla. Es la misma ficha de la <a href="#/nomina">Nómina</a>: lo que corrijas acá se ve allá y al revés. Se completa solo cuando una silla pasa a <b>Ingresado</b>.</p></div>
    <div class="head-actions">
      <button class="btn" data-act="export">Exportar CSV</button>
      <button class="btn" data-act="new">+ Alta manual</button>
    </div>
  </section>
  <section class="filters card">
    ${filterGroup({ dim: 'area', label: 'Área', options: opts('area'), selected: filters.area })}
    ${filterGroup({ dim: 'sector', label: 'Sector', options: opts('sector'), selected: filters.sector, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'estado', label: 'Estado', options: opts('estado'), selected: filters.estado, allLabel: 'Todos' })}
  </section>
  <section class="kpis">
    ${kpi('Activos', fmtInt(activos.length), { tone: 'green', big: true })}
    ${kpi('Bajas', fmtInt(base.length - activos.length), { tone: 'red' })}
    ${kpi('Sin fecha de ingreso', fmtInt(base.filter((h) => !h.fecha_ingreso).length), { tone: 'orange', sub: 'a completar' })}
    ${kpi('Sin DNI', fmtInt(base.filter((h) => !h.dni).length), { tone: 'orange', sub: 'a completar' })}
  </section>
  <section class="grid-2">
    <article class="card"><h2 class="card-title">Ingresos por mes</h2>${porMes.length ? bars(porMes, { color: 'green', limit: 12 }) : html`<p class="muted">Sin fechas.</p>`}</article>
    <article class="card"><h2 class="card-title">Activos por área</h2>${bars(countBy(activos, (h) => h.yacimiento || '—'), { color: 'blue' })}</article>
  </section>
  <section class="card">
    <header class="list-head"><h2 class="card-title">Legajos <small class="muted">${rows.length}</small></h2>
      <label class="search"><input type="search" id="hire-search" placeholder="Buscar nombre, DNI, puesto…" value="${search}"></label></header>
    ${rows.length ? html`<div class="table-wrap"><table class="tbl is-clickable">
      <thead><tr><th>Nombre</th><th>DNI</th><th>Ingreso</th><th class="hide-sm">Área · Sector</th><th class="hide-sm">Silla</th><th class="hide-sm">Convenio · Cat.</th><th class="hide-sm">Jefe</th><th class="hide-sm num">Básico</th><th>Estado</th></tr></thead>
      <tbody>${rows.map((h) => html`<tr data-id="${h.id}" tabindex="0">
        <td data-th="Nombre"><strong>${h.nombre}</strong>${h.tipo_cobertura === 'Movimiento interno' ? html` <span class="tag tag--int">interno</span>` : ''}</td>
        <td data-th="DNI" class="mono">${h.dni || html`<span class="muted">—</span>`}</td>
        <td data-th="Ingreso">${fmtDate(h.fecha_ingreso) || html`<span class="muted">—</span>`}</td>
        <td data-th="Área" class="hide-sm">${[h.yacimiento, h.sector].filter(Boolean).join(' · ')}</td>
        <td data-th="Puesto" class="hide-sm">${h.puesto || ''}</td>
        <td data-th="Convenio" class="hide-sm">${[h.puesto_convenio, h.categoria].filter(Boolean).join(' · ')}</td>
        <td data-th="Jefe" class="hide-sm">${h.jefe || ''}</td>
        <td data-th="Básico" class="hide-sm num">${fmtMoney(h.basico)}</td>
        <td data-th="Estado"><span class="pill pill--sm pill--${h.estado === 'activo' ? 'green' : 'neutral'}">${h.estado === 'activo' ? 'Activo' : 'Baja'}</span></td>
      </tr>`)}</tbody></table></div>` : mascot('empty')}
  </section>`);

  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-filter]');
      if (f) { toggleFilter(filters, f.dataset.filter, f.dataset.value); render(el); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'export') return exportCSV(currentRows);
      if (act === 'new') return openHire(null);
      const tr = e.target.closest('tr[data-id]');
      if (tr) openHire(tr.dataset.id);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) openHire(e.target.dataset.id); });
  }
  animateIn(el);
  const s = $('#hire-search', el);
  s?.addEventListener('input', () => { search = s.value; const p = s.selectionStart; render(el); const n = $('#hire-search', el); n.focus(); n.setSelectionRange(p, p); });
}

function openHire(id) {
  const h = id ? state.hires.find((x) => x.id === id) : { estado: 'activo', origen: 'app' };
  if (!h) return;
  const root = openDrawer(html`<form id="hire-form" class="form-grid">
    ${field('Nombre completo', 'nombre', h.nombre, { required: true, span: 2 })}
    ${field('Fecha de ingreso', 'fecha_ingreso', h.fecha_ingreso, { type: 'date' })}
    ${field('Estado', 'estado', h.estado, { options: [['activo', 'Activo'], ['baja', 'Baja']] })}
    ${field('Área (yacimiento)', 'yacimiento', h.yacimiento)}
    ${field('Sector', 'sector', h.sector)}
    ${field('Puesto', 'puesto', h.puesto, { span: 2 })}
    ${convenioFields(h)}
    ${field('Jefe directo', 'jefe', h.jefe)}
    ${field('Básico', 'basico', h.basico, { type: 'number', step: '0.01' })}
    ${field('Procedencia', 'procedencia', h.procedencia)}
    ${field('Tipo de cobertura', 'tipo_cobertura', h.tipo_cobertura, { options: [['', '—'], 'Búsqueda externa', 'Movimiento interno'] })}
    ${preingresoFields(h)}
    ${field('Fecha de baja', 'fecha_baja', h.fecha_baja, { type: 'date' })}
    ${field('Motivo de baja', 'motivo_baja', h.motivo_baja)}
    ${field('Notas', 'notas', h.notas, { type: 'textarea', span: 2 })}
    <div class="form-actions field--wide">
      ${h.id ? html`<a class="btn btn--ghost" href="#/nomina" data-close>Ver en Nómina</a>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
      <button type="submit" class="btn btn--primary">Guardar</button>
    </div></form>`, { title: h.id ? `Legajo · ${h.nombre}` : 'Alta manual de legajo', wide: true });

  bindConvenio(root.querySelector('#hire-form'));
  root.querySelector('#hire-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    if (data.estado === 'baja' && !data.fecha_baja) return toast('Indicá la fecha de baja', 'error');
    if (data.dni) data.dni = String(data.dni).replace(/\D/g, '');
    if (!h.id) data.origen = 'app';
    const { error } = h.id ? await sb.from('nomina').update(data).eq('id', h.id) : await sb.from('nomina').insert(data);
    if (error) return toast(/duplicate|unique/i.test(error.message) ? 'Ya hay una persona con ese DNI en la nómina' : error.message, 'error');
    toast('Legajo guardado', 'ok'); closeDrawer(); loadAll({ silent: true });
  });
}

// CSV para Excel (separador ; y BOM) generado en el navegador; no pasa por ningún servidor.
function exportCSV(rows) {
  const cols = ['nombre', 'dni', 'cuil', 'fecha_nacimiento', 'fecha_ingreso', 'yacimiento', 'sector', 'puesto', 'convenio',
    'categoria', 'puesto_convenio', 'jefe', 'basico', 'domicilio', 'localidad', 'provincia', 'telefono', 'mail',
    'talle_mameluco', 'talle_botas', 'talle_campera', 'procedencia', 'tipo_cobertura', 'estado', 'fecha_baja', 'motivo_baja', 'notas'];
  const q = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const body = [cols.join(';'), ...rows.map((r) => cols.map((c) => q(c === 'basico' && r[c] != null ? String(r[c]).replace('.', ',') : r[c])).join(';'))].join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `legajos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
