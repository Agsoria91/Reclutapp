import { html, raw, esc, $ } from '../lib/html.js';
import { state } from '../lib/store.js';

export function stagePill(code, { small = false } = {}) {
  const s = state.stageMap[code];
  const color = s?.color || 'neutral';
  return html`<span class="pill pill--${color} ${small ? 'pill--sm' : ''}" title="${s?.descripcion || ''}">${s?.label || code || '—'}</span>`;
}

// Grupo de filtros tipo pill. "Todas/Todos" limpia la dimensión.
// options: [[valor, cantidad], ...]
export function filterGroup({ dim, label, options, selected, allLabel = 'Todas' }) {
  const none = !selected || selected.size === 0;
  return html`<div class="fgroup" role="group" aria-label="${label}">
    <span class="fgroup-label">${label}</span>
    <div class="fgroup-pills">
      <button type="button" class="fpill ${none ? 'is-on' : ''}" data-filter="${dim}" data-value="" aria-pressed="${none}">${allLabel}</button>
      ${options.map(([v, n]) => {
        const on = selected?.has(v);
        return html`<button type="button" class="fpill ${on ? 'is-on' : ''}" data-filter="${dim}" data-value="${v}" aria-pressed="${!!on}">${v}${n != null ? html` <small>${n}</small>` : ''}</button>`;
      })}
    </div>
  </div>`;
}

// Alterna un valor en el Set de un filtro (o limpia si value === '').
export function toggleFilter(filters, dim, value) {
  if (!filters[dim]) filters[dim] = new Set();
  if (value === '') filters[dim].clear();
  else if (filters[dim].has(value)) filters[dim].delete(value);
  else filters[dim].add(value);
}

export function serializeFilters(filters) {
  return Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, [...(v || [])]]));
}
export function restoreFilters(obj, dims) {
  const f = {};
  for (const d of dims) f[d] = new Set(obj?.[d] || []);
  return f;
}
export function saveLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin storage */ } }
export function loadLocal(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

// KPI. Si value es número, se anima (cuenta) desde el valor anterior.
export function kpi(label, value, { sub, tone = '', big = false, suffix = '', id, act, selected = false, hint } = {}) {
  const isNum = typeof value === 'number' && Number.isFinite(value);
  const key = id || label;
  if (act) {
    // cuadro clickeable: filtra la pantalla
    return html`<button type="button" class="kpi kpi--click ${tone ? 'kpi--' + tone : ''} ${big ? 'kpi--big' : ''} ${selected ? 'is-sel' : ''}" data-kpi="${act}" aria-pressed="${!!selected}">
      <span class="kpi-label">${label}</span>
      <span class="kpi-value" ${isNum ? raw(`data-n="${value}" data-k="${esc(key)}" data-suffix="${esc(suffix)}"`) : ''}>${isNum ? fmtNum(numCache.get(key) ?? value) + suffix : value ?? '—'}</span>
      ${sub ? html`<span class="kpi-sub">${sub}</span>` : ''}
      <span class="kpi-hint">${selected ? 'Mostrando ✓' : hint || 'Ver detalle'}</span>
    </button>`;
  }
  return html`<div class="kpi ${tone ? 'kpi--' + tone : ''} ${big ? 'kpi--big' : ''}">
    <span class="kpi-label">${label}</span>
    <span class="kpi-value" ${isNum ? raw(`data-n="${value}" data-k="${esc(key)}" data-suffix="${esc(suffix)}"`) : ''}>${isNum ? fmtNum(numCache.get(key) ?? value) + suffix : value ?? '—'}</span>
    ${sub ? html`<span class="kpi-sub">${sub}</span>` : ''}
  </div>`;
}
const fmtNum = (n) => Math.round(n).toLocaleString('es-AR');
const numCache = new Map();
const barCache = new Map();
export const prevSize = (key) => barCache.get(key) ?? 0;

// Selector desplegable para filtros de una sola opción (Set de 0 o 1 valores).
export function selectFilter({ dim, label, options, selected, allLabel = 'Todos' }) {
  const cur = selected && selected.size ? [...selected][0] : '';
  return html`<label class="fselect"><span>${label}</span>
    <select data-select-filter="${dim}">
      <option value="">${allLabel}</option>
      ${options.map(([v, n]) => html`<option value="${v}" ${raw(v === cur ? 'selected' : '')}>${v}${n != null ? ` (${n})` : ''}</option>`)}
    </select></label>`;
}

// Desplegable de selección MÚLTIPLE con casillas. `presets` son atajos
// ([etiqueta, [valores]]), p. ej. "Todos menos Ingresado".
export function multiSelectFilter({ dim, label, options, selected, allLabel = 'Todos', presets = [], open = false, labelOf = (v) => v }) {
  const sel = selected || new Set();
  const summary = !sel.size ? allLabel
    : sel.size <= 2 ? [...sel].map(labelOf).join(' + ')
    : `${sel.size} seleccionados`;
  return html`<div class="fmulti"><span class="fmulti-label">${label}</span>
    <details class="fmulti-box" data-multi="${dim}" ${raw(open ? 'open' : '')}>
      <summary class="${sel.size ? 'is-active' : ''}">${summary}</summary>
      <div class="fmulti-pop" role="group" aria-label="${label}">
        <div class="fmulti-presets">
          <button type="button" class="btn btn--ghost btn--sm" data-multi-preset="${dim}" data-values="">${allLabel}</button>
          ${presets.map(([l, vals]) => html`<button type="button" class="btn btn--ghost btn--sm" data-multi-preset="${dim}" data-values="${JSON.stringify(vals)}">${l}</button>`)}
        </div>
        ${options.map(([v, n]) => html`<label class="check fmulti-opt">
          <input type="checkbox" data-multi-opt="${dim}" value="${v}" ${raw(sel.has(v) ? 'checked' : '')}>
          <span>${labelOf(v)}</span>${n != null ? html`<small>${n}</small>` : ''}</label>`)}
      </div>
    </details></div>`;
}

// Barras horizontales (sin librería). Con `dim`, cada barra es un botón que
// filtra esa dimensión: el resto de la pantalla se recalcula y las barras se
// animan desde su ancho anterior.
export function bars(rows, { max, color = 'blue', limit = 10, fmt = (n) => n, total, dim, selected, chart } = {}) {
  const top = rows.slice(0, limit);
  const m = max ?? Math.max(1, ...top.map((r) => r[1]));
  const anySel = selected && selected.size > 0;
  const cid = chart || dim || color;
  return html`<ul class="bars ${dim ? 'bars--click' : ''}">${top.map(([k, n, tone, value]) => {
    const v = value ?? k;
    const sel = anySel && selected.has(v);
    const w = Math.max(n ? 2 : 0, (n / m) * 100);
    const key = `${cid}|${v}`;
    const from = barCache.has(key) ? barCache.get(key) : 0;
    const inner = html`<span class="bars-label" title="${k}">${k}</span>
      <span class="bars-track"><span class="bars-fill bars-fill--${tone || color}" style="width:${from}%" data-w="${w}" data-k="${key}"></span></span>
      <span class="bars-val">${fmt(n)}${total ? html` <small>${Math.round((n / total) * 100)}%</small>` : ''}</span>`;
    return html`<li class="${sel ? 'is-sel' : anySel ? 'is-dim' : ''}">${dim
      ? html`<button type="button" class="bars-btn" data-filter="${dim}" data-value="${v}" aria-pressed="${!!sel}" title="Filtrar por ${k}">${inner}</button>`
      : inner}</li>`;
  })}</ul>`;
}

// Anima barras y KPIs recién dibujados (desde su valor anterior al nuevo).
export function animateIn(root) {
  if (!root) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fills = root.querySelectorAll('.bars-fill[data-w]');
  const cols = root.querySelectorAll('.col-fill[data-h]');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fills.forEach((f) => { f.style.width = f.dataset.w + '%'; barCache.set(f.dataset.k, +f.dataset.w); });
    cols.forEach((f) => { f.style.height = f.dataset.h + '%'; barCache.set(f.dataset.k, +f.dataset.h); });
  }));
  root.querySelectorAll('.kpi-value[data-n]').forEach((el) => {
    const to = +el.dataset.n;
    const key = el.dataset.k;
    const suffix = el.dataset.suffix || '';
    const from = numCache.has(key) ? numCache.get(key) : 0;
    numCache.set(key, to);
    if (reduce || from === to) { el.textContent = fmtNum(to) + suffix; return; }
    const t0 = performance.now();
    const dur = 450;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtNum(from + (to - from) * e) + suffix;
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------------------------------------------------------------------------
// Drawer lateral (edición) y diálogo modal
// ---------------------------------------------------------------------------
let drawerCleanup = null;
export function openDrawer(content, { title = '', wide = false, onClose } = {}) {
  closeDrawer();
  const root = document.createElement('div');
  root.className = 'drawer-root';
  root.innerHTML = String(html`<div class="drawer-backdrop" data-close></div>
    <aside class="drawer ${wide ? 'drawer--wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="drawer-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Cerrar">${raw('&times;')}</button></header>
      <div class="drawer-body">${content}</div>
    </aside>`);
  document.body.appendChild(root);
  const prevFocus = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    root.classList.add('is-open');
    (root.querySelector('input,select,textarea,button:not([data-close])') || root.querySelector('button'))?.focus();
  });
  drawerCleanup = () => {
    document.removeEventListener('keydown', onKey);
    root.remove();
    prevFocus?.focus?.();
    onClose?.();
  };
  return root;
}
export function closeDrawer() { const f = drawerCleanup; drawerCleanup = null; f?.(); }

export function confirmDialog(message, { ok = 'Confirmar', cancel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialog';
    d.innerHTML = `<form method="dialog"><p>${esc(message)}</p><div class="dialog-actions">
      <button value="cancel" class="btn btn--ghost">${esc(cancel)}</button>
      <button value="ok" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(ok)}</button></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok'); d.remove(); });
    d.showModal();
  });
}

export function toast(message, tone = 'info', ms = 3500) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = `toast toast--${tone}`;
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, ms);
}

// Lee un <form> a objeto: '' -> null, number/date respetados.
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') { o[el.name] = el.checked; continue; }
    const v = el.value.trim();
    o[el.name] = v === '' ? null : el.type === 'number' ? Number(v) : v;
  }
  return o;
}

export function field(label, name, value, { type = 'text', options, required, hint, span = 1, step, list } = {}) {
  const id = `f-${name}`;
  let input;
  if (options) {
    input = html`<select id="${id}" name="${name}" ${raw(required ? 'required' : '')}>
      ${options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<option value="${v}" ${raw(String(v) === String(value ?? '') ? 'selected' : '')}>${l}</option>`; })}
    </select>`;
  } else if (type === 'textarea') {
    input = html`<textarea id="${id}" name="${name}" rows="3">${value ?? ''}</textarea>`;
  } else {
    input = html`<input id="${id}" name="${name}" type="${type}" value="${value ?? ''}" ${raw(required ? 'required' : '')} ${raw(step ? `step="${esc(step)}"` : '')} ${raw(list ? `list="${esc(list)}"` : '')} autocomplete="off">`;
  }
  return html`<label class="field ${span === 2 ? 'field--wide' : ''}" for="${id}"><span>${label}</span>${input}${hint ? html`<small>${hint}</small>` : ''}</label>`;
}

export function datalist(id, values) {
  return html`<datalist id="${id}">${values.map((v) => html`<option value="${v}"></option>`)}</datalist>`;
}

// ---------------------------------------------------------------------------
// Desplegable con los valores que ya existen en la app + "Otro…" para escribir
// uno nuevo. Reemplaza a las listas de sugerencias del navegador (datalist),
// que solo aparecen al escribir y se filtran por lo que ya tiene el campo.
// ---------------------------------------------------------------------------
const normKey = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Une listas de valores, sin duplicados por mayúsculas/acentos (gana la escritura más usada).
export function opcionesDe(...listas) {
  const m = new Map();
  for (const v of listas.flat(Infinity)) {
    const s = String(v ?? '').trim();
    if (!s) continue;
    const k = normKey(s);
    const e = m.get(k) || new Map();
    e.set(s, (e.get(s) || 0) + (s === s.toUpperCase() && s.length > 4 ? 0.5 : 1));
    m.set(k, e);
  }
  return [...m.values()].map((e) => [...e].sort((a, b) => b[1] - a[1])[0][0]).sort((a, b) => a.localeCompare(b, 'es'));
}

export function pickField(label, name, value, valores, { required, span = 1, hint } = {}) {
  const id = `f-${name}`;
  const cur = String(value ?? '').trim();
  const lista = opcionesDe(valores);
  const match = lista.find((v) => normKey(v) === normKey(cur));
  const opts = cur && !match ? [...lista, cur].sort((a, b) => a.localeCompare(b, 'es')) : lista;
  const sel = match || cur;
  return html`<label class="field ${span === 2 ? 'field--wide' : ''}" for="${id}"><span>${label}</span>
    <select id="${id}" name="${name}" data-pick="${name}" ${raw(required ? 'required' : '')}>
      <option value="">— elegir —</option>
      ${opts.map((v) => html`<option value="${v}" ${raw(v === sel ? 'selected' : '')}>${v}</option>`)}
      <option value="__otro__">＋ Otro…</option>
    </select>
    <input type="text" class="pick-otro" data-otro-for="${name}" placeholder="Escribí el nuevo valor" hidden autocomplete="off">
    ${hint ? html`<small>${hint}</small>` : ''}</label>`;
}

// "Otro…": muestra el campo de texto y le pasa el nombre del campo para que se guarde.
if (typeof document !== 'undefined' && !document._pickBound) {
  document._pickBound = true;
  document.addEventListener('change', (e) => {
    const s = e.target.closest?.('select[data-pick]');
    if (!s) return;
    const input = s.parentElement.querySelector(`input[data-otro-for="${s.dataset.pick}"]`);
    if (s.value === '__otro__') {
      s.name = '';
      input.hidden = false; input.name = s.dataset.pick; input.required = s.required; input.focus();
    } else {
      s.name = s.dataset.pick;
      input.hidden = true; input.name = ''; input.required = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Reporte cruzado (tabla dinámica): filas × columnas con totales.
// ---------------------------------------------------------------------------
export function pivot(rows, rowFn, colFn) {
  const cells = new Map(); const rt = new Map(); const ct = new Map();
  // agrupar sin distinguir mayúsculas/acentos ("NEUQUEN" = "Neuquén"); se muestra la escritura más usada
  const vistas = new Map();
  const canon = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return 'Sin dato';
    const k = normKey(s);
    const m = vistas.get(k) || new Map(); m.set(s, (m.get(s) || 0) + (s === s.toUpperCase() && s.length > 4 ? 0.5 : 1)); vistas.set(k, m);
    return k;
  };
  const etiqueta = (k) => (k === 'Sin dato' ? k : [...vistas.get(k)].sort((x, y) => y[1] - x[1])[0][0]);
  const tmp = rows.map((r) => [canon(rowFn(r)), canon(colFn(r))]);
  rows = tmp;
  rowFn = (r) => r[0]; colFn = (r) => r[1];
  for (const r of rows) {
    const a = rowFn(r) || 'Sin dato'; const b = colFn(r) || 'Sin dato';
    const k = a + '\u0000' + b;
    cells.set(k, (cells.get(k) || 0) + 1);
    rt.set(a, (rt.get(a) || 0) + 1); ct.set(b, (ct.get(b) || 0) + 1);
  }
  const byCount = (m) => [...m.entries()].sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0]), 'es')).map((e) => e[0]);
  // se devuelven las etiquetas visibles; internamente se cruzan por clave normalizada
  const rk = byCount(rt); const ck = byCount(ct);
  const rl = new Map(rk.map((k) => [etiqueta(k), k])); const cl = new Map(ck.map((k) => [etiqueta(k), k]));
  return {
    rowKeys: [...rl.keys()], colKeys: [...cl.keys()], total: rows.length,
    cell: (a, b) => cells.get(rl.get(a) + '\u0000' + cl.get(b)) || 0,
    rowTotal: (a) => rt.get(rl.get(a)) || 0, colTotal: (b) => ct.get(cl.get(b)) || 0,
    max: Math.max(1, ...cells.values()),
  };
}

export function pivotTable(p, { rowLabel = '', limit = 30 } = {}) {
  if (!p.total) return html`<p class="muted">Sin datos para esta selección.</p>`;
  const rows = p.rowKeys.slice(0, limit);
  const resto = p.rowKeys.slice(limit);
  return html`<div class="table-wrap"><table class="tbl tbl--pivot">
    <thead><tr><th>${rowLabel}</th>${p.colKeys.map((c) => html`<th class="num">${c}</th>`)}<th class="num">Total</th><th class="num">%</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr><td><strong>${r}</strong></td>
      ${p.colKeys.map((c) => { const v = p.cell(r, c); return html`<td class="num ${v ? '' : 'muted'}" style="${raw(v ? `background:color-mix(in srgb, var(--st-blue) ${Math.round(8 + (v / p.max) * 30)}%, transparent)` : '')}">${v || '·'}</td>`; })}
      <td class="num"><b>${p.rowTotal(r)}</b></td><td class="num muted">${Math.round((p.rowTotal(r) / p.total) * 100)}%</td></tr>`)}
      ${resto.length ? html`<tr><td class="muted">Otros (${resto.length})</td>${p.colKeys.map((c) => html`<td class="num muted">${resto.reduce((s, r) => s + p.cell(r, c), 0) || '·'}</td>`)}<td class="num">${resto.reduce((s, r) => s + p.rowTotal(r), 0)}</td><td></td></tr>` : ''}
    </tbody>
    <tfoot><tr><td>Total</td>${p.colKeys.map((c) => html`<td class="num">${p.colTotal(c)}</td>`)}<td class="num">${p.total}</td><td class="num">100%</td></tr></tfoot>
  </table></div>`;
}

export function pivotCSV(p, rowLabel) {
  const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [[rowLabel, ...p.colKeys, 'Total'].map(q).join(';')];
  for (const r of p.rowKeys) lines.push([r, ...p.colKeys.map((c) => p.cell(r, c)), p.rowTotal(r)].map(q).join(';'));
  lines.push(['Total', ...p.colKeys.map((c) => p.colTotal(c)), p.total].map(q).join(';'));
  return lines.join('\r\n');
}

// Descarga un CSV que Excel abre bien (separador ; y BOM UTF-8).
export function downloadCSV(nombre, texto) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function rowsToCSV(cols, rows) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(([, l]) => q(l)).join(';'), ...rows.map((r) => cols.map(([k]) => q(typeof k === 'function' ? k(r) : r[k])).join(';'))].join('\r\n');
}

// Selector simple para reportes (filas / columnas)
export function dimSelect(id, label, dims, value) {
  return html`<label class="fselect"><span>${label}</span><select id="${id}">
    ${dims.map(([k, l]) => html`<option value="${k}" ${raw(k === value ? 'selected' : '')}>${l}</option>`)}</select></label>`;
}
