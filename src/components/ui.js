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
export function kpi(label, value, { sub, tone = '', big = false, suffix = '', id } = {}) {
  const isNum = typeof value === 'number' && Number.isFinite(value);
  const key = id || label;
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
