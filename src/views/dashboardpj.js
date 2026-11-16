// Dashboard PJ: reporte general de búsquedas de EFiS a partir de la planilla
// "Status_Vacantes". Solo RRHH. Se actualiza subiendo el CSV (reemplaza la foto).
import { html, raw } from '../lib/html.js';
import { state } from '../lib/store.js';
import { sb, fetchAll } from '../lib/supabase.js';
import { fmtDate, fmtMonth, todayISO, norm, daysBetween, pct } from '../lib/format.js';
import { decodeBytes } from '../lib/csv.js';
import { parseVacantesCSV, estadoInfo, esVacante } from '../lib/vacantesPj.js';
import {
  filterGroup, toggleFilter, kpi, bars, saveLocal, loadLocal, serializeFilters, restoreFilters,
  pivot, pivotTable, confirmDialog, toast, prevSize, animateIn,
} from '../components/ui.js';
import { mascot } from '../components/mascot.js';

const DIMS = ['estado', 'proceso', 'direccion', 'reclutador', 'mes'];
const KEY = 'reclutapp.pj.filters';
const filters = restoreFilters(loadLocal(KEY, {}), DIMS);
let grupo = loadLocal('reclutapp.pj.grupo', 'todas');
let search = '';
let datos = null; // { rows, ultima }
let cargando = false;
let ultimoEl = null; // contenedor actual (la pantalla se puede redibujar mientras carga)

const GRUPOS = {
  todas: ['Búsquedas', () => true],
  abiertas: ['Abiertas', (v) => estadoInfo(v.estado).grupo !== 'cerrada'],
  proceso: ['En proceso', (v) => estadoInfo(v.estado).grupo === 'proceso'],
  espera: ['En espera', (v) => estadoInfo(v.estado).grupo === 'espera'],
  cerradas: ['Cerradas', (v) => estadoInfo(v.estado).grupo === 'cerrada'],
  sin: ['Sin estado', (v) => estadoInfo(v.estado).grupo === 'sin'],
};
const hoy = () => todayISO();
const atrasada = (v) => estadoInfo(v.estado).grupo !== 'cerrada' && v.fecha_solicitud && v.fecha_solicitud < hoy();
const canon = (s) => { const t = String(s ?? '').trim(); return t || 'Sin dato'; };
const getters = {
  estado: (v) => estadoInfo(v.estado).label,
  proceso: (v) => canon(v.proceso),
  direccion: (v) => canon(v.direccion),
  reclutador: (v) => canon(v.reclutador),
  mes: (v) => (v.fecha_solicitud ? v.fecha_solicitud.slice(0, 7) : 'Sin fecha'),
};

async function cargar(el) {
  if (cargando) return;
  cargando = true;
  try {
    const [rows, imps] = await Promise.all([
      fetchAll('vacantes_pj', '*', 's'),
      sb.from('vacantes_pj_importaciones').select('*').order('importado_at', { ascending: false }).limit(1),
    ]);
    datos = { rows, ultima: imps.data?.[0] || null };
  } catch (e) {
    datos = { rows: [], ultima: null, error: e.message };
  }
  cargando = false;
  const destino = ultimoEl?.isConnected ? ultimoEl : el;
  if (!destino.isConnected) return; // se cambió de pantalla mientras cargaba
  try { render(destino); } catch (e) { console.error(e); destino.innerHTML = String(mascot('error', { text: e.message })); }
}

function filtrar(except) {
  return (datos?.rows || []).filter((v) => GRUPOS[grupo]?.[1](v) !== false
    && DIMS.every((d) => d === except || !filters[d].size || filters[d].has(getters[d](v))));
}
const contar = (rows, dim) => {
  const m = new Map();
  for (const v of rows) { const k = getters[dim](v); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const persist = () => saveLocal(KEY, serializeFilters(filters));

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Ingresá con un usuario de RRHH.' })); return; }
  ultimoEl = el;
  if (!datos) { el.innerHTML = String(mascot('loading')); cargar(el); return; }
  bind(el);

  const base = (datos.rows || []);
  const rows = filtrar(null);
  const sinGrupo = base.filter((v) => DIMS.every((d) => !filters[d].size || filters[d].has(getters[d](v))));
  const n = (g) => sinGrupo.filter(GRUPOS[g][1]).length;
  const abiertas = rows.filter(GRUPOS.abiertas[1]);
  const atrasadas = abiertas.filter(atrasada);
  const vacantes = abiertas.filter(esVacante);
  const proximos = rows.filter((v) => v.fecha_potencial_ingreso && v.fecha_potencial_ingreso >= hoy())
    .sort((a, b) => a.fecha_potencial_ingreso.localeCompare(b.fecha_potencial_ingreso));
  // días que llevan abiertas (desde la fecha de solicitud, si ya pasó)
  const edades = abiertas.filter((v) => v.fecha_solicitud && v.fecha_solicitud <= hoy()).map((v) => daysBetween(v.fecha_solicitud, hoy()));
  const edadProm = edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : null;

  const porEstado = contar(filtrar('estado'), 'estado')
    .map(([k, c]) => { const i = estadoInfo(k === 'Sin estado' ? '' : k); return [k, c, i.color, k, i.orden]; })
    .sort((a, b) => a[4] - b[4]);
  const porProceso = contar(filtrar('proceso'), 'proceso');
  const porDireccion = contar(filtrar('direccion'), 'direccion');
  const porReclutador = contar(filtrar('reclutador'), 'reclutador');
  const rMes = filtrar('mes').filter((v) => v.fecha_solicitud);
  const meses = contar(rMes, 'mes').sort((a, b) => a[0].localeCompare(b[0]));
  const mesMax = Math.max(1, ...meses.map((m) => m[1]));

  let lista = rows;
  if (search) { const q = norm(search); lista = lista.filter((v) => norm([v.s, v.posicion, v.descripcion, v.persona, v.jefe, v.gerencia, v.pendientes].join(' ')).includes(q)); }
  lista = lista.slice().sort((a, b) => estadoInfo(a.estado).orden - estadoInfo(b.estado).orden || String(a.fecha_solicitud || '9').localeCompare(String(b.fecha_solicitud || '9')));
  const chips = DIMS.flatMap((d) => [...filters[d]].map((v) => [d, v]));
  const ult = datos.ultima;

  el.innerHTML = String(html`
  <section class="page-head">
    <div>
      <h1>Dashboard PJ</h1>
      <p class="muted">Búsquedas de EFiS según la planilla de Status de Vacantes.
        ${ult ? html`Actualizado el <b>${fmtDate(ult.importado_at)}</b>${ult.archivo ? ` con “${ult.archivo}”` : ''} · ${ult.filas} búsquedas.` : 'Todavía no se cargó ninguna planilla.'}</p>
    </div>
    <div class="head-actions">
      <label class="btn btn--primary">Actualizar con CSV<input type="file" id="pj-file" accept=".csv,text/csv" hidden></label>
      ${base.length ? html`<button class="btn" data-act="pj-excel">Excel</button>` : ''}
    </div>
  </section>

  ${datos.error ? html`<p class="note">No se pudieron leer los datos: ${datos.error}</p>` : ''}
  ${!base.length ? html`<section class="card">${mascot('empty', { title: 'Sin datos todavía', text: 'Tocá “Actualizar con CSV” y elegí la planilla Status_Vacantes (.csv). Se toman solo las búsquedas de EFiS.' })}</section>` : html`

  <section class="filters card">
    <div class="fgroup"><span class="fgroup-label">Empresa</span><div class="fgroup-pills"><span class="fpill is-on" title="Filtro fijo: solo se importan búsquedas de EFiS">EFiS</span></div></div>
    ${filterGroup({ dim: 'proceso', label: 'Proceso', options: contar(filtrar('proceso'), 'proceso'), selected: filters.proceso, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'direccion', label: 'Dirección', options: contar(filtrar('direccion'), 'direccion'), selected: filters.direccion })}
    ${filterGroup({ dim: 'reclutador', label: 'Reclutador/a', options: contar(filtrar('reclutador'), 'reclutador'), selected: filters.reclutador, allLabel: 'Todos' })}
    ${chips.length || grupo !== 'todas' ? html`<div class="active-filters"><span class="muted small">Filtrando por:</span>
      ${grupo !== 'todas' ? html`<button type="button" class="chip chip--on" data-pj-grupo="todas">${GRUPOS[grupo][0]} ✕</button>` : ''}
      ${chips.map(([d, v]) => html`<button type="button" class="chip chip--on" data-filter="${d}" data-value="${v}">${d === 'mes' && v !== 'Sin fecha' ? fmtMonth(v) : v} ✕</button>`)}
      <button type="button" class="btn btn--ghost btn--sm" data-act="pj-clear">Limpiar todo</button></div>` : ''}
  </section>

  <section class="kpis kpis--6">
    ${kpi('Búsquedas', n('todas'), { act: 'todas', selected: grupo === 'todas', big: true, id: 'pj-tot' })}
    ${kpi('Abiertas', n('abiertas'), { act: 'abiertas', selected: grupo === 'abiertas', tone: 'blue', sub: `${pct(n('abiertas'), n('todas'))}% del total`, id: 'pj-ab' })}
    ${kpi('En proceso', n('proceso'), { act: 'proceso', selected: grupo === 'proceso', tone: 'navy', sub: 'apertura, entrevistas, examen, oferta', id: 'pj-pro' })}
    ${kpi('En espera', n('espera'), { act: 'espera', selected: grupo === 'espera', tone: 'orange', sub: 'on hold / pend. definición', id: 'pj-esp' })}
    ${kpi('Cerradas', n('cerradas'), { act: 'cerradas', selected: grupo === 'cerradas', tone: 'green', sub: `${pct(n('cerradas'), n('todas'))}% cubiertas`, id: 'pj-cer' })}
    ${kpi('Sin estado', n('sin'), { act: 'sin', selected: grupo === 'sin', tone: n('sin') ? 'red' : '', sub: 'completar en la planilla', id: 'pj-sin' })}
  </section>

  <section class="kpis kpis--6 pj-kpis2">
    ${kpi('Vacantes sin persona', vacantes.length, { sub: 'abiertas con “Vacante”', id: 'pj-vac' })}
    ${kpi('Atrasadas', atrasadas.length, { tone: atrasadas.length ? 'red' : '', sub: 'abiertas con fecha de línea pasada', id: 'pj-atr' })}
    ${kpi('Antigüedad promedio', edadProm ?? '—', { suffix: edadProm != null ? ' d' : '', sub: 'días abiertas desde la solicitud', id: 'pj-edad' })}
    ${kpi('Próximos ingresos', proximos.length, { tone: 'green', sub: 'con fecha potencial futura', id: 'pj-prox' })}
    ${kpi('Insourcing', rows.filter((v) => norm(v.proceso) === 'insourcing').length, { sub: 'de la selección', id: 'pj-ins' })}
    ${kpi('Mov. internos', rows.filter((v) => norm(v.proceso) === 'movimiento interno').length, { sub: 'de la selección', id: 'pj-mi' })}
  </section>

  <section class="grid-2">
    <article class="card"><h2 class="card-title">Por estado</h2>${bars(porEstado, { dim: 'estado', selected: filters.estado, total: filtrar('estado').length, limit: 12, chart: 'pj-estado' })}</article>
    <article class="card"><h2 class="card-title">Por proceso</h2>${bars(porProceso, { dim: 'proceso', selected: filters.proceso, color: 'navy', total: filtrar('proceso').length, chart: 'pj-proceso' })}
      <h2 class="card-title mt">Por reclutador/a</h2>${bars(porReclutador, { dim: 'reclutador', selected: filters.reclutador, color: 'violet', total: filtrar('reclutador').length, chart: 'pj-recl' })}</article>
    <article class="card"><h2 class="card-title">Por dirección</h2>${bars(porDireccion, { dim: 'direccion', selected: filters.direccion, color: 'blue', total: filtrar('direccion').length, limit: 12, chart: 'pj-dir' })}</article>
    <article class="card"><h2 class="card-title">Búsquedas por mes de solicitud de línea</h2>
      <div class="cols" role="group" aria-label="Búsquedas por mes de solicitud">
        ${meses.map(([m, c]) => {
          const sel = filters.mes.has(m); const dim = filters.mes.size && !sel;
          return html`<button type="button" class="col ${sel ? 'is-sel' : ''} ${dim ? 'is-dim' : ''}" data-filter="mes" data-value="${m}" aria-pressed="${sel}" title="${fmtMonth(m)}: ${c}">
            <span class="col-val">${c}</span>
            <span class="col-bar"><span class="col-fill" style="height:${prevSize('pjmes|' + m)}%" data-h="${(c / mesMax) * 100}" data-k="pjmes|${m}"></span></span>
            <span class="col-lbl">${fmtMonth(m, { short: true })}</span></button>`;
        })}
      </div>
      <p class="small muted">Tocá un mes para filtrar. Los meses futuros son pedidos de la línea para más adelante.</p></article>
  </section>

  <section class="card"><h2 class="card-title">Dirección × estado</h2>
    ${pivotTable(pivot(rows, (v) => canon(v.direccion), (v) => estadoInfo(v.estado).label), { rowLabel: 'Dirección' })}</section>

  ${proximos.length ? html`<section class="card"><h2 class="card-title">Próximos ingresos <small class="muted">${proximos.length}</small></h2>
    <div class="table-wrap"><table class="tbl tbl--compact"><thead><tr><th>Fecha</th><th>Persona</th><th>Posición</th><th>Dirección</th><th>Estado</th></tr></thead>
    <tbody>${proximos.map((v) => html`<tr><td>${fmtDate(v.fecha_potencial_ingreso)}</td><td>${v.persona || ''}</td><td>${v.posicion || ''}<small class="muted block">${v.descripcion || ''}</small></td><td>${v.direccion || ''}</td><td>${pillEstado(v)}</td></tr>`)}</tbody></table></div></section>` : ''}

  <section class="card">
    <div class="list-head"><h2 class="card-title">Búsquedas <small class="muted">${lista.length}</small></h2>
      <label class="search"><span class="sr-only">Buscar</span><input type="search" id="pj-search" placeholder="Buscar posición, persona, jefe, S, pendientes…" value="${search}"></label></div>
    <div class="table-wrap"><table class="tbl tbl--compact tbl--pj">
      <thead><tr><th>S</th><th>Posición</th><th>Persona</th><th>Estado</th><th>Proceso</th><th>Dirección</th><th>Reclutador/a</th><th>Solicitud</th><th>Pot. ingreso</th><th>Pendientes</th></tr></thead>
      <tbody>${lista.map((v) => html`<tr class="${atrasada(v) ? 'is-late' : ''}">
        <td class="mono">${v.s}</td>
        <td><b>${v.posicion || ''}</b><small class="muted block">${[v.descripcion, v.diagrama].filter(Boolean).join(' · ')}</small></td>
        <td>${esVacante(v) ? html`<span class="muted">Vacante</span>` : v.persona}</td>
        <td>${pillEstado(v)}</td>
        <td class="small">${v.proceso || ''}</td>
        <td class="small">${v.direccion || ''}<small class="muted block">${v.gerencia || ''}</small></td>
        <td class="small">${v.reclutador || ''}</td>
        <td class="${atrasada(v) ? 'is-late-txt' : ''}">${fmtMonth(v.fecha_solicitud, { short: true })}</td>
        <td>${v.fecha_potencial_ingreso ? fmtDate(v.fecha_potencial_ingreso) : ''}</td>
        <td class="small pj-pend">${v.pendientes || ''}</td></tr>`)}</tbody>
    </table></div>
  </section>`}`);

  animateIn(el);
  const s = el.querySelector('#pj-search');
  s?.addEventListener('input', () => { search = s.value; const p = s.selectionStart; render(el); const nn = el.querySelector('#pj-search'); nn.focus(); nn.setSelectionRange(p, p); });
}

function pillEstado(v) {
  const i = estadoInfo(v.estado);
  return html`<span class="pill pill--sm pill--${i.color}">${i.label}</span>`;
}

function bind(el) {
  if (el._pjBound) return;
  el._pjBound = true;
  el.addEventListener('click', (e) => {
    if (!el.isConnected || !datos) return;
    const f = e.target.closest('[data-filter]');
    if (f) { toggleFilter(filters, f.dataset.filter, f.dataset.value); persist(); render(el); return; }
    const k = e.target.closest('[data-kpi]');
    if (k && GRUPOS[k.dataset.kpi]) { grupo = grupo === k.dataset.kpi ? 'todas' : k.dataset.kpi; saveLocal('reclutapp.pj.grupo', grupo); render(el); return; }
    const g = e.target.closest('[data-pj-grupo]');
    if (g) { grupo = 'todas'; saveLocal('reclutapp.pj.grupo', grupo); render(el); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'pj-clear') { DIMS.forEach((d) => filters[d].clear()); grupo = 'todas'; saveLocal('reclutapp.pj.grupo', grupo); persist(); render(el); }
    if (act === 'pj-excel') excel();
  });
  el.addEventListener('change', async (e) => {
    if (e.target.id !== 'pj-file') return;
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await importar(el, file);
  });
}

async function importar(el, file) {
  let res;
  try {
    res = parseVacantesCSV(decodeBytes(await file.arrayBuffer()));
  } catch (err) { toast(err.message, 'error', 7000); return; }
  if (!res.rows.length) { toast('El archivo no trae búsquedas de EFiS.', 'error', 6000); return; }
  const actuales = new Set((datos?.rows || []).map((v) => v.s));
  const nuevas = res.rows.filter((r) => !actuales.has(r.s)).length;
  const quitadas = [...actuales].filter((s) => !res.rows.some((r) => r.s === s)).length;
  const msg = `“${file.name}”: ${res.rows.length} búsquedas de EFiS (se ignoran ${res.otrasEmpresas} de otras empresas).`
    + (actuales.size ? ` Respecto de lo cargado: ${nuevas} nuevas y ${quitadas} que ya no están.` : '')
    + (res.avisos.length ? ` Avisos: ${res.avisos.slice(0, 3).join(' ')}${res.avisos.length > 3 ? '…' : ''}` : '')
    + ' Se reemplaza la foto anterior. ¿Actualizamos?';
  if (!(await confirmDialog(msg, { ok: 'Actualizar' }))) return;
  const { data, error } = await sb.rpc('import_vacantes_pj', { p_rows: res.rows, p_archivo: file.name });
  if (error) { toast('No se pudo actualizar: ' + error.message, 'error', 7000); return; }
  toast(`Dashboard actualizado: ${data.filas} búsquedas (${data.nuevas} nuevas, ${data.actualizadas} con cambios, ${data.quitadas} quitadas).`, 'ok', 7000);
  datos = null;
  render(el);
}

async function excel() {
  const rows = filtrar(null);
  const { downloadXlsx } = await import('../lib/xlsx.js');
  downloadXlsx(`Dashboard_PJ_EFiS_${todayISO()}.xlsx`, [{
    name: 'Búsquedas EFiS', title: 'Búsquedas EFiS — Dashboard PJ', note: `Generado ${fmtDate(todayISO())} · ${rows.length} búsquedas · uso interno RRHH`,
    columns: [['S', 10], ['Posición', 34], ['Descripción', 40], ['Diagrama', 12], ['Persona', 26], ['Estado', 16], ['Proceso', 18], ['Dirección', 24],
      ['Gerencia / Jefatura', 34], ['Jefe', 26], ['Reclutador/a', 12], ['Fecha solicitud de línea', 12], ['Fecha potencial ingreso', 12], ['Pendientes', 50]]
      .map(([header, width]) => ({ header, width })),
    rows: rows.map((v) => [v.s, v.posicion, v.descripcion, v.diagrama, v.persona, estadoInfo(v.estado).label, v.proceso, v.direccion,
      v.gerencia, v.jefe, v.reclutador, v.fecha_solicitud, v.fecha_potencial_ingreso, v.pendientes]),
  }]);
}
