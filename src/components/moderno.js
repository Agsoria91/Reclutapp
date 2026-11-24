// Piezas comunes del diseño de la app (estilo IRIS + paleta EFiS):
// encabezado de sección, barra con buscador y botón de filtros plegables,
// etiquetas de filtros activos, 4 indicadores con ícono y sub-pestañas.
// El estado (sub-pestaña elegida y panel de filtros abierto) se guarda por
// sección; los clics en esas piezas los atiende un único manejador global y
// después se vuelve a dibujar la pantalla.
import { html, raw, esc } from '../lib/html.js';
import { loadLocal, saveLocal } from './ui.js';
import { icono } from './iconos.js';

const fmt = (n) => Math.round(n).toLocaleString('es-AR');
const abiertos = new Set();

export function subTab(seccion, opciones, porDefecto) {
  const v = loadLocal(`reclutapp.tab.${seccion}`, porDefecto);
  return opciones.includes(v) ? v : porDefecto;
}
export const filtrosAbiertos = (seccion) => abiertos.has(seccion);

export function mHead({ titulo, sub, acciones = '' }) {
  return html`<section class="m-head"><div><h1>${titulo}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>
    <div class="m-acciones">${acciones}</div></section>`;
}

// buscador (opcional) + botón Filtros + extras (p. ej. el filtro de mes)
export function mBarra({ seccion, buscar, nFiltros = 0, extra = '' }) {
  const ab = abiertos.has(seccion);
  return html`<section class="m-barra">
    ${buscar ? html`<label class="m-buscar">${icono('buscar')}<input type="search" id="${buscar.id}" placeholder="${buscar.placeholder}" value="${buscar.valor || ''}"></label>` : ''}
    <button type="button" class="m-btn-filtros ${ab ? 'is-on' : ''}" data-m-filtros="${seccion}" aria-expanded="${ab}">${icono('filtro')} Filtros${nFiltros ? html`<b>${nFiltros}</b>` : ''}</button>
    ${extra}
  </section>`;
}

// chips: [{ dim, valor, texto }] — usan data-filter/data-value, que cada vista ya sabe quitar
export function mChips(chips, limpiarAct) {
  if (!chips.length) return '';
  return html`<div class="m-chips">${chips.map((c) => (c.attrs
    ? html`<button type="button" class="m-chip" ${raw(c.attrs)}>${c.texto} <span aria-hidden="true">✕</span></button>`
    : html`<button type="button" class="m-chip" data-filter="${c.dim}" data-value="${c.valor}">${c.texto ?? c.valor} <span aria-hidden="true">✕</span></button>`))}
    ${limpiarAct ? html`<button type="button" class="m-limpiar" data-act="${limpiarAct}">Limpiar todo</button>` : ''}</div>`;
}

export function mPanel(seccion, contenido) {
  const ab = abiertos.has(seccion);
  return html`<section class="m-panel" ${ab ? '' : raw('hidden')}>${contenido}</section>`;
}

function chispa(serie) {
  if (!serie || serie.length < 2) return '';
  const W = 120; const H = 36; const v = serie.map(([, n]) => n); const max = Math.max(...v); const min = Math.min(...v);
  const pts = v.map((n, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - 4 - ((n - min) / Math.max(1, max - min)) * (H - 8)).toFixed(1)}`).join(' ');
  return raw(`<svg class="mk-chispa" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${H} ${pts} ${W},${H}" class="mk-chispa-a"/><polyline points="${pts}" class="mk-chispa-l"/></svg>`);
}

// kpis: [{ icono, label, valor, sufijo, sub, tono: 'alerta'|'ok'|'aviso', serie, barra, act, attrs, sel, id }]
export function mKpis(kpis) {
  return html`<section class="mk-grid mk-grid--${kpis.length}">${kpis.filter(Boolean).map((k, i) => {
    const click = k.act || k.attrs;
    const tag = click ? 'button type="button"' : 'div';
    const num = typeof k.valor === 'number' && Number.isFinite(k.valor)
      ? raw(`<span class="kpi-value mk-num" data-n="${k.valor}" data-k="mk-${esc(k.id || k.label)}" data-suffix="${esc(k.sufijo || '')}">${fmt(k.valor)}${esc(k.sufijo || '')}</span>`)
      : html`<span class="mk-num">${k.valor ?? '—'}</span>`;
    return html`<${raw(tag)} class="mk ${i === 0 ? 'mk--main' : ''} ${k.tono ? 'mk--' + k.tono : ''} ${click ? 'mk--btn' : ''} ${k.sel ? 'is-sel' : ''}" ${k.act ? raw(`data-kpi="${esc(k.act)}"`) : ''} ${k.attrs ? raw(k.attrs) : ''}>
      <div class="mk-top"><span class="mk-ico">${icono(k.icono || 'cobertura')}</span><span class="mk-lbl">${k.label}</span></div>
      <div class="mk-row">${num}${k.serie ? chispa(k.serie) : ''}</div>
      ${k.barra != null ? html`<span class="mk-barra"><span style="width:${Math.max(0, Math.min(100, k.barra))}%"></span></span>` : ''}
      <span class="mk-sub">${k.sub || ''}${click ? html`<b class="mk-go">${k.sub ? ' · ' : ''}${k.sel ? 'mostrando ✓' : 'ver'}</b>` : ''}</span>
    </${raw(click ? 'button' : 'div')}>`;
  })}</section>`;
}

// tabs: [[clave, texto]]
export function mTabs(seccion, tabs, activa) {
  return html`<nav class="m-tabs" aria-label="Vistas">${tabs.map(([k, t]) => html`<button type="button" class="m-tab ${activa === k ? 'is-on' : ''}" data-m-tab="${seccion}" data-tab="${k}" aria-pressed="${activa === k}">${t}</button>`)}</nav>`;
}

// Manejador global: abre/cierra filtros y cambia de sub-pestaña; pide redibujar.
export function initModerno(redibujar) {
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-m-filtros]');
    if (f) {
      e.stopPropagation();
      const s = f.dataset.mFiltros;
      if (abiertos.has(s)) abiertos.delete(s); else abiertos.add(s);
      redibujar();
      return;
    }
    const t = e.target.closest('[data-m-tab]');
    if (t) {
      e.stopPropagation();
      saveLocal(`reclutapp.tab.${t.dataset.mTab}`, t.dataset.tab);
      redibujar();
    }
  }, true);
}
