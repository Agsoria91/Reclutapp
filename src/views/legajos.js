import { html, $ } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, fmtMoney, fmtInt, norm, fmtMonth } from '../lib/format.js';
import { applyFilters, countBy } from '../lib/kpis.js';
import {
  filterGroup, toggleFilter, kpi, bars, openDrawer, closeDrawer, toast, formData, field, confirmDialog,
} from '../components/ui.js';
import { mascot } from '../components/mascot.js';

const filters = { area: new Set(), sector: new Set(), estado: new Set(['activo']) };
const getters = { area: (h) => h.area || '—', sector: (h) => h.sector || '—', estado: (h) => h.estado };
let search = '';
let currentRows = [];

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Los legajos requieren iniciar sesión con un usuario de RRHH.' })); return; }
  if (state.loading && !state.hires.length) { el.innerHTML = String(mascot('loading')); return; }

  const base = applyFilters(state.hires, { area: filters.area, sector: filters.sector }, getters);
  let rows = applyFilters(state.hires, filters, getters);
  if (search) {
    const q = norm(search);
    rows = rows.filter((h) => norm([h.nombre, h.dni, h.puesto, h.mail, h.jefe_directo].join(' ')).includes(q));
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
      <p class="muted">Registro de personal que ya ingresó. Se completa solo cuando una silla pasa a <b>Ingresado</b>; acá se corrigen o completan los datos de alta.</p></div>
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
    <article class="card"><h2 class="card-title">Activos por área</h2>${bars(countBy(activos, (h) => h.area || '—'), { color: 'blue' })}</article>
  </section>
  <section class="card">
    <header class="list-head"><h2 class="card-title">Legajos <small class="muted">${rows.length}</small></h2>
      <label class="search"><input type="search" id="hire-search" placeholder="Buscar nombre, DNI, puesto…" value="${search}"></label></header>
    ${rows.length ? html`<div class="table-wrap"><table class="tbl is-clickable">
      <thead><tr><th>Nombre</th><th>DNI</th><th>Ingreso</th><th class="hide-sm">Área · Sector</th><th class="hide-sm">Puesto</th><th class="hide-sm">Convenio · Cat.</th><th class="hide-sm">Jefe</th><th class="hide-sm num">Básico</th><th>Estado</th></tr></thead>
      <tbody>${rows.map((h) => html`<tr data-id="${h.id}" tabindex="0">
        <td data-th="Nombre"><strong>${h.nombre}</strong></td>
        <td data-th="DNI" class="mono">${h.dni || html`<span class="muted">—</span>`}</td>
        <td data-th="Ingreso">${fmtDate(h.fecha_ingreso) || html`<span class="muted">—</span>`}</td>
        <td data-th="Área" class="hide-sm">${[h.area, h.sector].filter(Boolean).join(' · ')}</td>
        <td data-th="Puesto" class="hide-sm">${h.puesto || ''}</td>
        <td data-th="Convenio" class="hide-sm">${[h.puesto_convenio, h.categoria].filter(Boolean).join(' · ')}</td>
        <td data-th="Jefe" class="hide-sm">${h.jefe_directo || ''}</td>
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
  const s = $('#hire-search', el);
  s?.addEventListener('input', () => { search = s.value; const p = s.selectionStart; render(el); const n = $('#hire-search', el); n.focus(); n.setSelectionRange(p, p); });
}

function openHire(id) {
  const h = id ? state.hires.find((x) => x.id === id) : { estado: 'activo' };
  if (!h) return;
  const root = openDrawer(html`<form id="hire-form" class="form-grid">
    ${field('Nombre completo', 'nombre', h.nombre, { required: true, span: 2 })}
    ${field('DNI', 'dni', h.dni)}
    ${field('Fecha de ingreso', 'fecha_ingreso', h.fecha_ingreso, { type: 'date' })}
    ${field('Área', 'area', h.area)}
    ${field('Sector', 'sector', h.sector)}
    ${field('Puesto', 'puesto', h.puesto, { span: 2 })}
    ${field('Puesto de convenio', 'puesto_convenio', h.puesto_convenio)}
    ${field('Categoría', 'categoria', h.categoria)}
    ${field('Jefe directo', 'jefe_directo', h.jefe_directo)}
    ${field('Básico', 'basico', h.basico, { type: 'number', step: '0.01' })}
    ${field('Localidad', 'localidad', h.localidad)}
    ${field('Procedencia', 'procedencia', h.procedencia)}
    ${field('Teléfono', 'telefono', h.telefono, { type: 'tel' })}
    ${field('Mail', 'mail', h.mail, { type: 'email' })}
    ${field('Tipo de cobertura', 'tipo_cobertura', h.tipo_cobertura, { options: [['', '—'], 'Búsqueda externa', 'Movimiento interno'] })}
    ${field('Estado', 'estado', h.estado, { options: [['activo', 'Activo'], ['baja', 'Baja']] })}
    ${field('Fecha de baja', 'fecha_baja', h.fecha_baja, { type: 'date' })}
    ${field('Motivo de baja', 'motivo_baja', h.motivo_baja)}
    ${field('Notas', 'notas', h.notas, { type: 'textarea', span: 2 })}
    <div class="form-actions field--wide">
      ${h.id ? html`<button type="button" class="btn btn--danger-ghost" data-act="delete">Eliminar legajo</button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
      <button type="submit" class="btn btn--primary">Guardar</button>
    </div></form>`, { title: h.id ? `Legajo · ${h.nombre}` : 'Alta manual de legajo', wide: true });

  root.querySelector('#hire-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    if (data.estado === 'baja' && !data.fecha_baja) return toast('Indicá la fecha de baja', 'error');
    const { error } = h.id ? await sb.from('hires').update(data).eq('id', h.id) : await sb.from('hires').insert(data);
    if (error) return toast(error.message, 'error');
    toast('Legajo guardado', 'ok'); closeDrawer(); loadAll({ silent: true });
  });
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-act="delete"]')) {
      if (!(await confirmDialog(`¿Eliminar el legajo de ${h.nombre}? Para registrar una salida usá Estado = Baja.`, { ok: 'Eliminar', danger: true }))) return;
      const { error } = await sb.from('hires').delete().eq('id', h.id);
      if (error) return toast(error.message, 'error');
      toast('Legajo eliminado', 'ok'); closeDrawer(); loadAll({ silent: true });
    }
  });
}

// CSV para Excel (separador ; y BOM) generado en el navegador; no pasa por ningún servidor.
function exportCSV(rows) {
  const cols = ['nombre', 'dni', 'fecha_ingreso', 'area', 'sector', 'puesto', 'puesto_convenio', 'categoria', 'jefe_directo',
    'basico', 'localidad', 'telefono', 'mail', 'procedencia', 'tipo_cobertura', 'estado', 'fecha_baja', 'motivo_baja', 'notas'];
  const q = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const body = [cols.join(';'), ...rows.map((r) => cols.map((c) => q(c === 'basico' && r[c] != null ? String(r[c]).replace('.', ',') : r[c])).join(';'))].join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `legajos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
