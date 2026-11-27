import { html, raw, $ } from '../lib/html.js';
import { state, loadAll, stageOrder } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtInt, pct, todayISO, norm, daysBetween, fmtMonth } from '../lib/format.js';
import { countBy, candidateKpis, sectorMatches, diasEnEtapa, estaDemorado } from '../lib/kpis.js';
import {
  stagePill, filterGroup, toggleFilter, kpi, bars, openDrawer, closeDrawer, toast, formData, field,
  confirmDialog, saveLocal, loadLocal, serializeFilters, restoreFilters, prevSize, pickField,
  pivot, pivotTable, pivotCSV, downloadCSV, rowsToCSV, dimSelect,
  animateIn,
} from '../components/ui.js';
import { avisoBar, pendientesCard, openAvisoDrawer, openPlantillas, avisarCambioDeEtapa, pendientesDeAviso } from '../components/avisos.js';
import { mascot } from '../components/mascot.js';
import { mHead, mBarra, mChips, mPanel, mKpis, mTabs, subTab } from '../components/moderno.js';
import { openAssignFromCandidate } from './asignar.js';
import { celebrate } from './posiciones.js';
import { preingresoFields } from '../components/ingreso.js';
import { examenFields, bindExamen } from '../components/examen.js';
import { otrasEntrevistas, sigueEnOtroProceso, CAMPOS_PERSONA, cvCompartido, yaCargado } from '../lib/entrevistasPersona.js';

// Dimensiones de filtro cruzado: tocar una barra filtra por ese valor y todo
// lo demás se recalcula. Cada gráfico se calcula con TODOS los filtros menos
// el suyo, así se ve qué barra está elegida y cuánto pesan las otras.
const DIMS = ['area', 'sector', 'procedencia', 'stage', 'motivo', 'localidad', 'mes'];
const DIM_LABEL = { area: 'Área', sector: 'Sector', procedencia: 'Procedencia', stage: 'Etapa', motivo: 'Motivo de baja', localidad: 'Localidad', mes: 'Mes de CV' };
const KEY = 'reclutapp.cand.filters2';
const filters = restoreFilters(loadLocal(KEY, {}), DIMS);
let search = '';
let page = 1;
const PAGE = 60;

const values = {
  area: (c) => [c.area || '—'],
  sector: (c) => [c.servicio || '—'],
  procedencia: (c) => [c.procedencia || 'Sin dato'],
  stage: (c) => [state.stageMap[c.stage]?.label || c.stage],
  motivo: (c) => (c.motivos_baja?.length ? c.motivos_baja : ['—']),
  localidad: (c) => [c.localidad || 'Sin dato'],
  mes: (c) => [(c.cv_recibido || c.created_origen || '').slice(0, 7) || 'Sin fecha'],
};

function filterRows(except) {
  return state.candidates.filter((c) => DIMS.every((d) =>
    d === except || !filters[d].size || values[d](c).some((v) => filters[d].has(v))));
}
const counts = (rows, dim) => countBy(rows, (c) => values[dim](c));

function pillOptions(dim) {
  const c = counts(filterRows(dim), dim).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  for (const v of filters[dim]) if (!c.some(([k]) => k === v)) c.push([v, 0]);
  return c;
}

// Necesidad = sillas del mapa de posiciones que corresponden a los filtros de área/sector.
function positionsForFilters() {
  return state.positions.filter((p) =>
    (!filters.area.size || filters.area.has(p.yacimiento)) &&
    (!filters.sector.size || [...filters.sector].some((s) => sectorMatches(s, p.sector))));
}

function persist() { saveLocal(KEY, serializeFilters(filters)); }
const activeCount = () => DIMS.reduce((n, d) => n + filters[d].size, 0);

// Cuadros clickeables: cada uno es un conjunto de etapas
const GRUPOS = {
  todos: () => [],
  proceso: () => state.stages.filter((s) => s.es_activa).map((s) => s.label),
  ingresados: () => [state.stageMap.ingresado?.label].filter(Boolean),
  cancelados: () => [state.stageMap.cancelado?.label].filter(Boolean),
};
const grupoActivo = () => {
  const cur = [...filters.stage].sort().join('|');
  return Object.keys(GRUPOS).find((g) => GRUPOS[g]().sort().join('|') === cur) || null;
};

// Reporte cruzado
const REP_DIMS = [['procedencia', 'Origen'], ['localidad', 'Localidad'], ['area', 'Área'], ['sector', 'Sector / Servicio'], ['posicion', 'Posición'], ['provincia', 'Provincia'], ['stage', 'Etapa'], ['mesIngreso', 'Mes de ingreso']];
const repVal = {
  procedencia: (c) => c.procedencia, localidad: (c) => c.localidad, area: (c) => c.area, sector: (c) => c.servicio,
  posicion: (c) => c.posicion, provincia: (c) => c.provincia, stage: (c) => state.stageMap[c.stage]?.label,
  mesIngreso: (c) => (c.fecha_ingreso ? fmtMonth(c.fecha_ingreso) : null),
};
let repFilas = loadLocal('reclutapp.cand.repFilas', 'procedencia');
let repCols = loadLocal('reclutapp.cand.repCols', 'area');
const dimLabel = (k) => REP_DIMS.find((d) => d[0] === k)?.[1] || k;
const tituloSeleccion = () => {
  const g = grupoActivo();
  const base = g === 'ingresados' ? 'Ingresados' : g === 'proceso' ? 'En proceso' : g === 'cancelados' ? 'Cancelados' : 'Candidatos';
  const extra = DIMS.filter((d) => d !== 'stage' || !g).flatMap((d) => [...filters[d]]).join(', ');
  return extra ? `${base} · ${extra}` : base;
};

export function render(el) {
  if (state.loading && !state.candidates.length) { el.innerHTML = String(mascot('loading')); return; }
  if (state.error) { el.innerHTML = String(mascot('error', { text: state.error })); return; }

  const today = todayISO();
  const all = filterRows(null);
  const k = candidateKpis(all, state.stageMap, positionsForFilters(), today);
  // los cuadros clickeables muestran sus totales sin el filtro de etapa
  const kg = candidateKpis(filterRows('stage'), state.stageMap, positionsForFilters(), today);
  const grupo = grupoActivo();
  const staff = state.isStaff;
  const pv = pivot(all, repVal[repFilas], repVal[repCols]);

  // por etapa (en orden de pipeline)
  const byStage = new Map(counts(filterRows('stage'), 'stage'));
  const funnel = state.stages.filter((s) => s.code !== 'sin_candidato')
    .map((s) => [s.label, byStage.get(s.label) || 0, s.color]);
  const totStage = funnel.reduce((a, r) => a + r[1], 0);

  const rOrigen = filterRows('procedencia');
  const rMotivo = filterRows('motivo').filter((c) => c.stage === 'cancelado');
  const motivos = counts(rMotivo, 'motivo').filter(([m]) => m !== '—');
  const rLoc = filterRows('localidad');
  const rMes = filterRows('mes');
  const meses = counts(rMes, 'mes').filter(([m]) => m !== 'Sin fecha').sort((a, b) => a[0].localeCompare(b[0])).slice(-9);
  const mesMax = Math.max(1, ...meses.map((m) => m[1]));

  const chips = DIMS.flatMap((d) => [...filters[d]].map((v) => [d, v]));
  const tab = subTab('candidatos', staff ? ['listado', 'graficos', 'reporte'] : ['graficos', 'reporte'], staff ? 'listado' : 'graficos');

  el.innerHTML = String(html`
  ${mHead({ titulo: 'Candidatos', sub: `${fmtInt(kg.total)} candidatos PP · ${fmtInt(kg.activos)} en proceso`,
    acciones: staff ? html`<button class="btn btn--ghost" data-act="carga-masiva">Carga masiva</button><button class="btn btn--primary" data-act="new">+ Nuevo candidato</button>` : '' })}
  ${mBarra({ seccion: 'candidatos', buscar: staff ? { id: 'cand-search', placeholder: 'Buscar nombre, DNI, mail o teléfono', valor: search } : null,
    nFiltros: chips.length })}
  ${mChips([...(grupo && grupo !== 'todos' ? [{ attrs: 'data-kpi="todos"', texto: grupo === 'proceso' ? 'En proceso' : grupo === 'ingresados' ? 'Ingresados' : 'Cancelados' }] : []),
    ...chips.filter(([d]) => !(grupo && d === 'stage')).map(([d, v]) => ({ dim: d, valor: v, texto: `${DIM_LABEL[d]}: ${d === 'mes' && v !== 'Sin fecha' ? fmtMonth(v) : v}` }))], 'clear')}
  ${mPanel('candidatos', html`
    ${filterGroup({ dim: 'area', label: 'Área', options: pillOptions('area'), selected: filters.area })}
    ${filterGroup({ dim: 'sector', label: 'Sector', options: pillOptions('sector'), selected: filters.sector, allLabel: 'Todos' })}
    <p class="muted small" style="margin:0">Etapa, origen, localidad, motivo y mes se filtran tocando los gráficos.</p>`)}
  ${mKpis([
    { icono: 'candidatos', label: 'En proceso', valor: kg.activos, id: 'c-act', act: 'proceso', sel: grupo === 'proceso', serie: meses.map(([m, n]) => [m, n]),
      sub: html`de <b>${fmtInt(kg.total)}</b> candidatos` },
    { icono: 'alta', label: 'Ingresados', valor: kg.ingresados, id: 'c-ing', tono: 'ok', act: 'ingresados', sel: grupo === 'ingresados', sub: `${kg.conversion}% de conversión` },
    { icono: 'cobertura', label: 'Avance vs necesidad', valor: pct(k.cubiertas, k.necesidad), sufijo: '%', id: 'c-av', barra: pct(k.cubiertas, k.necesidad), sub: html`<b>${k.cubiertas}</b> de ${k.necesidad} sillas cubiertas` },
    { icono: 'reloj', label: 'Días promedio postulado', valor: k.diasPromedioActivos ?? '—', id: 'c-dias', sub: `CV → ingreso: ${k.diasPromedioIngreso ?? '—'} días` },
  ])}
  ${mTabs('candidatos', [...(staff ? [['listado', 'Listado']] : []), ['graficos', 'Gráficos'], ['reporte', 'Reporte']], tab)}
  <div class="m-cuerpo">
  ${tab === 'listado' ? html`${pendientesCard()}${listSection(today, all)}` : ''}
  ${tab === 'graficos' ? html`
  <section class="card">
    <h2 class="card-title">CV recibidos por mes</h2>
    <div class="cols" role="group" aria-label="CV recibidos por mes">
      ${meses.map(([m, n]) => {
        const sel = filters.mes.has(m);
        const dim = filters.mes.size && !sel;
        return html`<button type="button" class="col ${sel ? 'is-sel' : ''} ${dim ? 'is-dim' : ''}" data-filter="mes" data-value="${m}" aria-pressed="${sel}" title="${fmtMonth(m)}: ${n} CV">
          <span class="col-val">${n}</span>
          <span class="col-bar"><span class="col-fill" style="height:${prevSize('mes|' + m)}%" data-h="${(n / mesMax) * 100}" data-k="mes|${m}"></span></span>
          <span class="col-lbl">${fmtMonth(m, { short: true })}</span>
        </button>`;
      })}
    </div>
  </section>

  <section class="grid-2">
    <article class="card">
      <h2 class="card-title">Por etapa</h2>
      ${bars(funnel, { limit: 20, total: totStage, dim: 'stage', selected: filters.stage, chart: 'c-stage' })}
    </article>
    <article class="card">
      <h2 class="card-title">Origen de candidatos</h2>
      ${bars(counts(rOrigen, 'procedencia'), { color: 'green', total: rOrigen.length, dim: 'procedencia', selected: filters.procedencia, chart: 'c-orig' })}
      <h2 class="card-title mt">Motivos de baja</h2>
      ${motivos.length ? bars(motivos, { color: 'red', total: rMotivo.length, dim: 'motivo', selected: filters.motivo, chart: 'c-mot' }) : html`<p class="muted">Sin bajas con motivo en esta selección.</p>`}
    </article>
    <article class="card">
      <h2 class="card-title">Localidades</h2>
      ${bars(counts(rLoc, 'localidad'), { color: 'sky', limit: 12, total: rLoc.length, dim: 'localidad', selected: filters.localidad, chart: 'c-loc' })}
    </article>
    <article class="card">
      <h2 class="card-title">Avance por área</h2>
      ${bars(avancePorArea(), { color: 'green', max: 100, fmt: (n) => n + '%', dim: 'area', selected: filters.area, chart: 'c-av' })}
      <p class="muted small">Sillas cubiertas sobre el total del mapa de posiciones.</p>
    </article>
  </section>

  ` : ''}
  ${tab === 'reporte' ? html`
  <section class="card" id="reporte">
    <header class="report-head">
      <div><h2 class="card-title" style="margin:0">Reporte: ${tituloSeleccion()}</h2>
        <p class="muted small" style="margin:4px 0 0">${fmtInt(all.length)} personas · ${dimLabel(repFilas)} × ${dimLabel(repCols)}</p></div>
      <div class="controls report-actions">
        ${dimSelect('rep-filas', 'Filas', REP_DIMS, repFilas)}
        ${dimSelect('rep-cols', 'Columnas', REP_DIMS, repCols)}
        <button class="btn btn--sm" data-act="rep-csv">Exportar reporte</button>
        ${staff ? html`<button class="btn btn--sm" data-act="rep-personas">Exportar personas</button>` : ''}
      </div>
    </header>
    ${pivotTable(pv, { rowLabel: dimLabel(repFilas) })}
  </section>

  ` : ''}
  </div>
  `);
  bind(el);
  animateIn(el);
}

function avancePorArea() {
  const pos = state.positions.filter((p) => !filters.sector.size || [...filters.sector].some((s) => sectorMatches(s, p.sector)));
  const m = new Map();
  for (const p of pos) {
    const a = m.get(p.yacimiento) || [0, 0];
    a[1]++; if (p.stage === 'ingresado') a[0]++;
    m.set(p.yacimiento, a);
  }
  return [...m.entries()].map(([a, [c, t]]) => [`${a} (${c}/${t})`, pct(c, t), null, a]).sort((a, b) => b[1] - a[1]);
}

// Días en la etapa actual, con color según el plazo
function diasTag(c, today) {
  const d = diasEnEtapa(c, today);
  if (d?.agendado) return html`<span class="dias dias--agendado" title="Turno agendado">${fmtDia(d.agendado)}</span>`;
  return d ? html`<span class="dias dias--${d.nivel}" title="Desde ${d.desde.split('-').reverse().join('/')} · plazo ${d.plazo} días">${d.dias} d</span>` : '';
}

// Lo que hay que hacer con cada candidato según su etapa y sus fechas
export function proximoPaso(c, today = todayISO()) {
  const sinSilla = !c._silla && ['apto', 'proximo_ingreso'].includes(c.stage);
  switch (c.stage) {
    case 'cv_recibido': return 'Coordinar entrevista';
    case 'entrevista': return c.en_entrevista && c.en_entrevista > today ? `Entrevista ${fmtDia(c.en_entrevista)}` : 'Definir resultado de la entrevista';
    case 'entrevista_aprobada': return 'Validación RRLL';
    case 'validacion_rrll': return 'Enviar propuesta';
    case 'propuesta': return 'Enviar a examen médico';
    case 'examen_medico':
      if (c.interconsulta && !c.interconsulta_cierre) return 'Cerrar interconsulta';
      if (c.epo && c.epo > today) return `Examen ${fmtDia(c.epo)}`;
      return c.epo ? 'Esperar aptitud médica' : 'Enviar a examen médico';
    case 'apto': return sinSilla ? 'Asignar silla' : 'Definir fecha de ingreso';
    case 'proximo_ingreso': return sinSilla ? 'Asignar silla' : c.fecha_ingreso ? `Ingresa ${fmtDia(c.fecha_ingreso)}` : 'Definir fecha de ingreso';
    default: return '';
  }
}
const fmtDia = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);

// Filtros rápidos del listado
let rapido = loadLocal('reclutapp.cand.rapido', 'todos');
// para entrar al listado con un filtro rápido ya elegido (desde "Para hoy")
export function elegirRapido(k) { rapido = k; saveLocal('reclutapp.cand.rapido', k); }
const RAPIDOS = [
  ['todos', 'Todos', () => true],
  ['avisar', 'Pendientes de avisar', (c, ids) => ids.has(c.id)],
  ['entrevista', 'En entrevista', (c) => ['cv_recibido', 'entrevista', 'entrevista_aprobada'].includes(c.stage)],
  ['medico', 'Examen médico', (c) => ['examen_medico', 'apto'].includes(c.stage)],
  ['ingreso', 'Próximo ingreso', (c) => c.stage === 'proximo_ingreso'],
  ['demorados', 'Demorados', (c) => estaDemorado(c, todayISO())],
  ['sin-silla', 'En proceso sin silla', (c) => !c._silla && state.stageMap[c.stage]?.es_activa],
];

function listSection(today, all) {
  const idsAvisar = new Set(pendientesDeAviso().map((c) => c.id));
  if (!RAPIDOS.some(([k]) => k === rapido)) rapido = 'todos';
  const nRap = Object.fromEntries(RAPIDOS.map(([k, , f]) => [k, all.filter((c) => f(c, idsAvisar)).length]));
  let rows = all.filter((c) => RAPIDOS.find(([k]) => k === rapido)[2](c, idsAvisar));
  if (search) {
    const q = norm(search);
    rows = rows.filter((c) => norm([c.nombre, c.dni, c.mail, c.telefono, c.posicion, c.localidad].join(' ')).includes(q));
  }
  rows = [...rows].sort((a, b) => (stageOrder(a.stage) === 99) - (stageOrder(b.stage) === 99) ||
    stageOrder(b.stage) - stageOrder(a.stage) || (b.created_origen || '').localeCompare(a.created_origen || ''));
  const shown = rows.slice(0, page * PAGE);
  const porDni = countBy(state.candidates.filter((c) => String(c.dni || '').replace(/\D/g, '')), (c) => String(c.dni).replace(/\D/g, ''));
  const nEnt = new Map(porDni);
  const entDe = (c) => nEnt.get(String(c.dni || '').replace(/\D/g, '')) || 0;
  return html`<section class="card">
    <header class="list-head">
      <h2 class="card-title">Listado <small class="muted">${rows.length} candidatos</small></h2>
      <div class="list-actions">
        <button class="btn btn--sm btn--excel" data-act="fichas" title="Una fila por persona con silla, datos personales, talles, etapas y nómina">Excel fichas completas ↓ (${rows.length})</button>
      </div>
    </header>
    <div class="chips-rapidos" role="group" aria-label="Filtro rápido">${RAPIDOS.map(([k, t]) => html`<button type="button" class="chip-rap ${rapido === k ? 'is-on' : ''}" data-rapido="${k}" aria-pressed="${rapido === k}">${t} <span>${nRap[k]}</span></button>`)}</div>
    ${rows.length ? html`<div class="table-wrap"><table class="tbl tbl--cand tbl--tarjetas is-clickable">
      <thead><tr><th>Nombre</th><th>Etapa</th><th class="hide-sm">Área · Servicio</th><th class="hide-sm">Posición</th><th class="hide-sm">Procedencia</th><th class="hide-sm">Próximo paso</th><th>Silla</th><th class="num">En etapa</th><th class="hide-sm">CV</th></tr></thead>
      <tbody>${shown.map((c) => html`<tr data-id="${c.id}" tabindex="0">
        <td data-th="Nombre"><strong>${c.nombre}</strong>${entDe(c) > 1 ? html` <span class="tag" title="Tiene otras entrevistas">${entDe(c)} entrevistas</span>` : ''}</td>
        <td data-th="Etapa">${stagePill(c.stage, { small: true })}</td>
        <td data-th="Área" class="hide-sm">${[c.area, c.servicio].filter(Boolean).join(' · ')}</td>
        <td data-th="Posición" class="hide-sm">${c.posicion || ''}</td>
        <td data-th="Procedencia" class="hide-sm">${c.procedencia || ''}</td>
        <td data-th="Próximo paso" class="hide-sm prox-paso">${proximoPaso(c, today)}</td>
        <td data-th="Silla">${c._silla ? html`<span class="seat-chip" title="${c._silla.yacimiento} · ${c._silla.sector || ''}">${c._silla.puesto}</span>` : html`<span class="muted">—</span>`}</td>
        <td data-th="En etapa" class="num">${diasTag(c, today)}</td>
        <td data-th="CV" class="hide-sm">${c.cv_path ? raw('<span class="tag tag--match">CV</span>') : ''}</td>
      </tr>`)}</tbody></table></div>
      ${rows.length > shown.length ? html`<div class="center"><button class="btn btn--ghost" data-act="more">Ver más (${rows.length - shown.length})</button></div>` : ''}`
      : mascot('empty')}
  </section>`;
}

function bind(el) {
  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-filter]');
      if (f) { toggleFilter(filters, f.dataset.filter, f.dataset.value); page = 1; persist(); render(el); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'clear') { DIMS.forEach((d) => filters[d].clear()); page = 1; persist(); render(el); return; }
      const kc = e.target.closest('[data-kpi]');
      if (kc) { filters.stage = new Set(GRUPOS[kc.dataset.kpi]()); page = 1; persist(); render(el); return; }
      if (act === 'rep-csv') {
        downloadCSV(`reporte_${repFilas}_x_${repCols}_${todayISO()}.csv`, `Reporte: ${tituloSeleccion()}\r\n` + pivotCSV(pivot(filterRows(null), repVal[repFilas], repVal[repCols]), dimLabel(repFilas)));
        return;
      }
      if (act === 'fichas') {
        let rows = filterRows(null);
        if (search) { const q = norm(search); rows = rows.filter((c) => norm([c.nombre, c.dni, c.mail, c.telefono, c.posicion, c.localidad].join(' ')).includes(q)); }
        const g = grupoActivo();
        import('../lib/reporteExcel.js').then(({ descargarFichas }) => descargarFichas(rows, { sufijo: g && g !== 'todos' ? g : (activeCount() ? 'filtrado' : 'todos') }))
          .then((n) => toast(`Excel descargado: ${n} fichas`, 'ok'))
          .catch((err) => toast('No se pudo armar el Excel: ' + err.message, 'error'));
        return;
      }
      if (act === 'rep-personas') {
        const cols = [['nombre', 'Nombre'], [(c) => state.stageMap[c.stage]?.label, 'Etapa'], ['procedencia', 'Origen'], ['localidad', 'Localidad'],
          ['provincia', 'Provincia'], ['area', 'Área'], ['servicio', 'Servicio'], ['posicion', 'Posición'], [(c) => c._silla?.puesto, 'Silla'],
          ['cv_recibido', 'CV recibido'], ['fecha_ingreso', 'Fecha de ingreso']];
        downloadCSV(`personas_${tituloSeleccion().replace(/[^\wáéíóúñ]+/gi, '_')}_${todayISO()}.csv`, rowsToCSV(cols, filterRows(null)));
        return;
      }
      const rp = e.target.closest('[data-rapido]');
      if (rp) { rapido = rp.dataset.rapido; saveLocal('reclutapp.cand.rapido', rapido); page = 1; render(el); return; }
      if (act === 'more') { page++; render(el); return; }
      if (act === 'new') { openCandidate(null); return; }
      if (act === 'carga-masiva') { import('./cargaMasiva.js').then((m) => m.openCargaMasiva()); return; }
      if (act === 'avisar') { openAvisoDrawer(e.target.closest('[data-cid]').dataset.cid); return; }
      if (act === 'plantillas') { openPlantillas(); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) openCandidate(tr.dataset.id);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) openCandidate(e.target.dataset.id); });
    el.addEventListener('change', (e) => {
      if (e.target.id === 'rep-filas') { repFilas = e.target.value; saveLocal('reclutapp.cand.repFilas', repFilas); render(el); }
      if (e.target.id === 'rep-cols') { repCols = e.target.value; saveLocal('reclutapp.cand.repCols', repCols); render(el); }
    });
  }
  const s = $('#cand-search', el);
  s?.addEventListener('input', () => {
    search = s.value; page = 1;
    const p = s.selectionStart; render(el);
    const n = $('#cand-search', el); n.focus(); n.setSelectionRange(p, p);
  });
}

// ---------------------------------------------------------------------------
// Ficha del candidato (solo RRHH)
// ---------------------------------------------------------------------------
// fecha de cada etapa: al volver atrás se ofrece borrar las posteriores
const FECHAS_ETAPA = [['en_entrevista', 'entrevista', 'la fecha de entrevista'], ['validacion_rrll', 'validacion_rrll', 'la validación RRLL'],
  ['epo', 'examen_medico', 'el envío a examen'], ['aptitud_recibida', 'apto', 'la aptitud'], ['fecha_ingreso', 'proximo_ingreso', 'la fecha de ingreso']];
const MOTIVOS = ['No Califica', 'CV No Califica', 'Rechaza Propuesta', 'Secundario Incompleto', 'No Apto Medico', 'Sin vacante disponible', 'No se presenta', 'Otro'];

// `volver`: si se abrió desde otra pantalla (p. ej. la silla), a dónde volver al terminar.
export function openCandidate(id, { volver } = {}) {
  const c = id ? state.candidates.find((x) => x.id === id) : { stage: 'cv_recibido', cv_recibido: todayISO(), motivos_baja: [] };
  if (!c) return;
  const stageOpts = state.stages.filter((s) => s.code !== 'sin_candidato').map((s) => [s.code, s.label]);
  const u = (f) => [...new Set(state.candidates.map(f).filter(Boolean))].sort();

  const root = openDrawer(html`
    ${volver ? html`<button type="button" class="btn btn--ghost btn--sm volver-silla" data-act="volver">← Volver a la silla</button>` : ''}
    ${c.id ? avisoBar(c) : ''}
    <nav class="ficha-tabs" role="tablist" aria-label="Secciones de la ficha">
      ${[['proceso', 'Proceso y silla'], ['medico', 'Examen médico'], ['datos', 'Datos y CV']].map(([k, t], i) => html`<button type="button" role="tab" class="ficha-tab ${i === 0 ? 'is-on' : ''}" data-pane-tab="${k}" aria-selected="${i === 0}">${t}</button>`)}
    </nav>
    ${c.id ? '' : html`<div class="dup-aviso" hidden></div>`}
    <form id="cand-form" class="ficha-form">
      <div class="ficha-pane" data-pane="proceso">
        ${c.id ? etapasLinea(c) : ''}
        ${(() => { const d = c.id && diasEnEtapa(c, todayISO()); return d?.agendado ? html`<p class="etapa-dias">${state.stageMap[c.stage]?.label || c.stage} <span>· turno agendado para el ${d.agendado.split('-').reverse().join('/')}</span></p>`
          : d ? html`<p class="etapa-dias etapa-dias--${d.nivel}">${d.dias} días en ${state.stageMap[c.stage]?.label || c.stage} <span>· desde ${d.desde.split('-').reverse().join('/')} · plazo ${d.plazo} días</span></p>` : ''; })()}
        ${c.id ? html`<div class="seat-box">
          <div><span class="muted">Silla</span>
            <div class="seat-name">${c._silla ? html`${c._silla.puesto} <small class="muted">· ${c._silla.yacimiento} · ${c._silla.sector || ''}</small>` : html`<span class="muted">Sin silla asignada</span>`}</div>
          </div>
          <div class="seat-actions">
            ${c.stage !== 'cancelado' ? html`<button type="button" class="btn btn--primary" data-act="seat">${c._silla ? 'Cambiar de silla' : 'Sentar en una silla'}</button>
              <button type="button" class="btn" data-act="terna">Sumar a una terna</button>` : ''}
          </div>
          ${(c._ternas || []).filter((p) => p.candidate_id !== c.id).length ? html`<div class="field--wide small muted">También en la terna de:
            ${(c._ternas || []).filter((p) => p.candidate_id !== c.id).map((p) => html`<span class="chip">${p.puesto} · ${p.yacimiento}${p.candidato_nombre ? ` (principal: ${p.candidato_nombre})` : ''}</span>`)}</div>` : ''}
        </div>
        ${entrevistasBox(c)}` : ''}
        <div class="form-grid">
          ${field('Nombre y apellido', 'nombre', c.nombre, { required: true, span: 2 })}
          ${field('Etapa', 'stage', c.stage, { options: stageOpts, hint: c._silla ? 'Se refleja en su silla.' : '' })}
          ${pickField('Área', 'area', c.area, [state.candidates.map((x) => x.area), state.positions.map((x) => x.yacimiento)])}
          ${pickField('Servicio / Sector', 'servicio', c.servicio, state.candidates.map((x) => x.servicio))}
          ${pickField('Posición', 'posicion', c.posicion, state.candidates.map((x) => x.posicion))}
          ${pickField('Procedencia', 'procedencia', c.procedencia, [state.candidates.map((x) => x.procedencia), state.positions.map((x) => x.procedencia)])}
          ${field('CV recibido', 'cv_recibido', c.cv_recibido, { type: 'date' })}
          ${field('En entrevista', 'en_entrevista', c.en_entrevista, { type: 'date' })}
          ${field('Validación RRLL', 'validacion_rrll', c.validacion_rrll, { type: 'date' })}
          ${field('Fecha de ingreso', 'fecha_ingreso', c.fecha_ingreso, { type: 'date' })}
          ${state.candidates.some((x) => 'fecha_baja' in x) ? field('Fecha de baja', 'fecha_baja', c.fecha_baja, { type: 'date', hint: 'Se completa sola al cancelar; corregila si la baja fue otro día.' }) : ''}
          <fieldset class="field--wide"><legend>Motivos de baja (si se cancela)</legend>
            <div class="checks">${MOTIVOS.map((m) => html`<label class="check"><input type="checkbox" name="motivo" value="${m}" ${raw(c.motivos_baja?.includes(m) ? 'checked' : '')}> ${m}</label>`)}</div>
          </fieldset>
          ${field('Comentarios', 'comentarios', c.comentarios, { type: 'textarea', span: 2 })}
        </div>
      </div>
      <div class="ficha-pane" data-pane="medico" hidden><div class="form-grid">${examenFields(c)}</div></div>
      <div class="ficha-pane" data-pane="datos" hidden>
        ${c.id ? html`<div class="cv-box">
          <span class="muted">CV</span>
          ${c.cv_path ? html`<button type="button" class="btn btn--ghost" data-act="cv-open">Ver CV</button>
            <button type="button" class="btn btn--ghost" data-act="cv-del">Quitar</button>` : html`<span class="muted">No hay CV cargado.</span>`}
          <label class="btn">${c.cv_path ? 'Reemplazar' : 'Subir CV'}<input type="file" id="cv-file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" hidden></label>
          <small class="muted">PDF, Word o imagen · hasta 10 MB · solo visible para RRHH</small>
        </div>` : ''}
        <div class="form-grid">${preingresoFields(c)}</div>
      </div>
      <div class="form-actions ficha-acciones">
        ${c.id ? html`<button type="button" class="btn btn--danger-ghost" data-act="delete">Eliminar</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn--primary">Guardar</button>
      </div>
    </form>
  `, { title: c.id ? c.nombre : 'Nuevo candidato', wide: true, modificado: c.id ? c : null });

  const form = root.querySelector('#cand-form');
  const verPane = (k) => {
    root.querySelectorAll('.ficha-pane').forEach((p) => { p.hidden = p.dataset.pane !== k; });
    root.querySelectorAll('[data-pane-tab]').forEach((b) => { const on = b.dataset.paneTab === k; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
  };
  root.querySelector('.ficha-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-pane-tab]'); if (b) verPane(b.dataset.paneTab); });
  // un dato inválido en otra pestaña: mostrar esa pestaña para poder corregirlo
  form.addEventListener('invalid', (e) => { const p = e.target.closest('.ficha-pane'); if (p?.hidden) verPane(p.dataset.pane); }, true);
  root.querySelector('.etapas')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-etapa]'); if (!b) return;
    form.elements.stage.value = b.dataset.etapa;
    marcarEtapas(root, b.dataset.etapa);
  });
  form.elements.stage.addEventListener('change', () => marcarEtapas(root, form.elements.stage.value));
  // Fechas que mandan la etapa: se muestra al instante lo que la base va a aplicar.
  const HITO_CAMPOS = ['en_entrevista', 'validacion_rrll', 'epo', 'aptitud_recibida', 'aptitud', 'fecha_ingreso', 'interconsulta', 'interconsulta_cierre'];
  const hint = document.createElement('p');
  hint.className = 'note small field--wide';
  hint.hidden = true;
  form.querySelector('[name=stage]').closest('label').after(hint);
  form.addEventListener('change', (e) => {
    if (!HITO_CAMPOS.includes(e.target.name)) return;
    const sel = form.elements.stage;
    if (sel.value === 'cancelado') return;
    const v = (n) => form.elements[n]?.value || '';
    const hoy = todayISO();
    // Apto solo con aptitud "Apto…" elegida y sin interconsulta abierta
    const interAbierta = v('interconsulta') && !v('interconsulta_cierre');
    const aptoMedico = v('aptitud_recibida') && /^\s*apto/i.test(v('aptitud')) && !interAbierta;
    const noAptoMedico = /^\s*no apto/i.test(v('aptitud')) || interAbierta;
    if (noAptoMedico && sel.value === 'apto') {
      sel.value = 'examen_medico';
      hint.textContent = interAbierta ? 'Con la interconsulta abierta queda en "Examen Médico".' : 'Con aptitud "No apto" queda en "Examen Médico" (no se cancela).';
      hint.hidden = false;
      return;
    }
    const sug = v('fecha_ingreso') ? (v('fecha_ingreso') <= hoy ? 'ingresado' : 'proximo_ingreso')
      : aptoMedico ? 'apto'
      : v('epo') ? 'examen_medico'
      : v('validacion_rrll') ? 'validacion_rrll'
      : v('en_entrevista') ? 'entrevista' : null;
    if (sug && stageOrder(sug) > stageOrder(sel.value)) {
      sel.value = sug;
      hint.textContent = `La etapa pasa a "${state.stageMap[sug].label}" por la fecha cargada.${c._silla ? ' Se refleja en su silla.' : ''}`;
      hint.hidden = false;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(form);
    data.motivos_baja = [...form.querySelectorAll('input[name="motivo"]:checked')].map((i) => i.value);
    delete data.motivo;
    data.cancelado = data.stage === 'cancelado';
    data.entrevista_ok = stageOrder(data.stage) >= stageOrder('entrevista_aprobada') && !data.cancelado;
    data.listo_ingreso = ['proximo_ingreso', 'ingresado'].includes(data.stage);
    // volver a una etapa anterior: ofrecer borrar las fechas de las etapas posteriores
    if (c.id && data.stage !== 'cancelado' && stageOrder(data.stage) < stageOrder(c.stage)) {
      const posteriores = FECHAS_ETAPA.filter(([campo, etapa]) => stageOrder(etapa) > stageOrder(data.stage) && data[campo]);
      if (posteriores.length && await confirmDialog(`Vuelve a "${state.stageMap[data.stage]?.label}". ¿Borro también ${posteriores.map(([, , l]) => l).join(', ')}?`, { ok: 'Borrar fechas', cancel: 'Dejarlas' })) {
        posteriores.forEach(([campo]) => { data[campo] = null; });
        if (posteriores.some(([campo]) => campo === 'aptitud_recibida')) data.aptitud = null;
      }
    }
    if (data.stage === 'cancelado' && c.stage !== 'cancelado' && sigueEnOtroProceso(c)) {
      const sigue = otrasEntrevistas(c).filter((x) => x.stage !== 'cancelado');
      toast(`Se cancela solo esta entrevista. Sigue en proceso para ${sigue.map((x) => x.servicio || x.area || x.posicion || 'otra entrevista').join(', ')}.`);
    }
    if (data.stage === 'cancelado' && c._silla &&
        !(await confirmDialog(`Al cancelar a ${c.nombre}, la silla "${c._silla.puesto}" queda libre. ¿Seguimos?`, { ok: 'Cancelar candidato', danger: true }))) return;
    // alta con un DNI que ya existe: misma persona, otra entrevista
    if (!c.id) {
      const { fichas } = yaCargado(data.dni);
      if (fichas.length) {
        const mismo = fichas.find((x) => x.stage !== 'cancelado' && state.stageMap[x.stage]?.es_activa && x.area === data.area && (x.servicio || '') === (data.servicio || ''));
        if (mismo && !(await confirmDialog(`${mismo.nombre} ya está en proceso para ${[mismo.area, mismo.servicio].filter(Boolean).join(' · ')}. ¿Guardar otra entrevista igual?`, { ok: 'Guardar igual', cancel: 'Volver' }))) return;
        const ref = fichas[0];
        CAMPOS_PERSONA.forEach((k) => { if ((data[k] == null || data[k] === '') && ref[k]) data[k] = ref[k]; });
        if (ref.cv_path && !data.cv_path) data.cv_path = ref.cv_path;
      }
    }
    const btn = e.submitter; btn.disabled = true;
    const { error } = c.id ? await sb.from('candidates').update(data).eq('id', c.id) : await sb.from('candidates').insert(data);
    btn.disabled = false;
    if (error) return toast(error.message, 'error');
    if (c.id) await sincronizarPersona(c, data);
    const ingreso = data.stage === 'ingresado' && c.stage !== 'ingresado';
    toast(ingreso && c._silla ? '¡Ingreso confirmado! Se creó el legajo.' : 'Candidato guardado', 'ok');
    closeDrawer();
    await loadAll({ silent: true });
    if (ingreso) celebrate();
    // Cambió de etapa: ofrecer avisarle en el momento (mensaje según la etapa)
    if (c.id && data.stage !== c.stage) avisarCambioDeEtapa(c.id, c.stage);
    else if (volver) volver();
  });

  bindExamen(root);
  // candidato nuevo: avisar al instante si el DNI ya está cargado
  const dupBox = root.querySelector('.dup-aviso');
  if (dupBox) {
    const etq = (x) => [[x.area, x.servicio].filter(Boolean).join(' · ') || x.posicion, state.stageMap[x.stage]?.label].filter(Boolean).join(' · ');
    form.elements.dni?.addEventListener('input', () => {
      const { fichas, nomina } = yaCargado(form.elements.dni.value);
      dupBox.hidden = !fichas.length && !nomina.length;
      dupBox.innerHTML = String(html`
        ${fichas.length ? html`<p><b>Esta persona ya está cargada:</b> ${fichas[0].nombre}. Se va a guardar como una entrevista más y se completan sus datos personales.</p>
          <div class="dup-lista">${fichas.map((x) => html`<button type="button" class="chip" data-dup="${x.id}">${etq(x)}</button>`)}</div>` : ''}
        ${nomina.length ? html`<p><b>Figura en la nómina activa</b>${nomina[0].yacimiento ? ` (${nomina[0].yacimiento}${nomina[0].sector ? ' · ' + nomina[0].sector : ''})` : ''}.</p>` : ''}`);
    });
    dupBox.addEventListener('click', (e) => { const b = e.target.closest('[data-dup]'); if (b) { closeDrawer(); openCandidate(b.dataset.dup); } });
  }
  form.addEventListener('change', () => marcarEtapas(root, form.elements.stage.value));
  marcarEtapas(root, c.stage);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-aviso-open]'); if (b) openAvisoDrawer(b.dataset.avisoOpen);
    if (volver && e.target.closest('[data-act="volver"]')) { closeDrawer(); volver(); }
  });
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'seat') { closeDrawer(); openAssignFromCandidate(c); }
    if (act === 'terna') { closeDrawer(); openAssignFromCandidate(c, { mode: 'terna' }); }
    if (act === 'nueva-ent') { closeDrawer(); nuevaEntrevista(c); }
    const otra = e.target.closest('[data-otra-ent]');
    if (otra) { closeDrawer(); openCandidate(otra.dataset.otraEnt); }
    if (act === 'cv-open') {
      const { data, error } = await sb.storage.from('cvs').createSignedUrl(c.cv_path, 120);
      if (error) return toast(error.message, 'error');
      window.open(data.signedUrl, '_blank', 'noopener');
    }
    if (act === 'cv-del') {
      if (!(await confirmDialog('¿Quitar el CV de este candidato?', { ok: 'Quitar', danger: true }))) return;
      if (!cvCompartido(c.cv_path, c.id)) await sb.storage.from('cvs').remove([c.cv_path]);
      const { error } = await sb.from('candidates').update({ cv_path: null }).eq('id', c.id);
      if (error) return toast(error.message, 'error');
      toast('CV quitado', 'ok'); closeDrawer(); loadAll({ silent: true });
    }
    if (act === 'delete') {
      if (!(await confirmDialog(`¿Eliminar a ${c.nombre} del pipeline? Se pierde su ficha y su CV.`, { ok: 'Eliminar', danger: true }))) return;
      if (c.cv_path && !cvCompartido(c.cv_path, c.id)) await sb.storage.from('cvs').remove([c.cv_path]);
      const { error } = await sb.from('candidates').delete().eq('id', c.id);
      if (error) return toast(error.message, 'error');
      toast('Candidato eliminado', 'ok'); closeDrawer(); loadAll({ silent: true });
    }
  });

  root.querySelector('#cv-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('El archivo supera 10 MB', 'error');
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${c.id}/${Date.now()}.${ext}`;
    toast('Subiendo CV…');
    const up = await sb.storage.from('cvs').upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) return toast(up.error.message, 'error');
    const { error } = await sb.from('candidates').update({ cv_path: path }).eq('id', c.id);
    if (error) return toast(error.message, 'error');
    if (c.cv_path && !cvCompartido(c.cv_path, c.id)) await sb.storage.from('cvs').remove([c.cv_path]);
    toast('CV guardado', 'ok');
    closeDrawer();
    await loadAll({ silent: true });
    openCandidate(c.id);
  });
}

// ---------------------------------------------------------------------------
// Varias entrevistas de la misma persona (vinculadas por DNI)
// ---------------------------------------------------------------------------
function entrevistasBox(c) {
  const otras = otrasEntrevistas(c);
  return html`<div class="ent-box">
    <div><span class="muted">Entrevistas de esta persona</span>
      <div class="ent-lista">
        <span class="chip is-actual">${[c.area, c.servicio].filter(Boolean).join(' · ') || c.posicion || 'Esta entrevista'} · ${state.stageMap[c.stage]?.label || c.stage}</span>
        ${otras.map((x) => html`<button type="button" class="chip" data-otra-ent="${x.id}">${[x.area, x.servicio].filter(Boolean).join(' · ') || x.posicion || 'Entrevista'} · ${state.stageMap[x.stage]?.label || x.stage}</button>`)}
      </div>
    </div>
    <button type="button" class="btn" data-act="nueva-ent">＋ Nueva entrevista</button>
  </div>`;
}

function nuevaEntrevista(c) {
  if (!String(c.dni || '').replace(/\D/g, '')) {
    toast('Cargá el DNI en la ficha para vincular las entrevistas de la persona.', 'error');
    openCandidate(c.id);
    return;
  }
  const root = openDrawer(html`<form id="ent-form" class="form-grid">
      ${pickField('Área', 'area', '', [state.candidates.map((x) => x.area), state.positions.map((x) => x.yacimiento)])}
      ${pickField('Servicio / Sector', 'servicio', '', state.candidates.map((x) => x.servicio))}
      ${pickField('Posición', 'posicion', c.posicion, state.candidates.map((x) => x.posicion))}
      ${field('En entrevista', 'en_entrevista', todayISO(), { type: 'date' })}
      ${field('Comentarios', 'comentarios', '', { type: 'textarea', span: 2 })}
      <div class="form-actions field--wide">
        <span class="spacer"></span>
        <button type="button" class="btn btn--ghost" data-act="volver-ent">Cancelar</button>
        <button type="submit" class="btn btn--primary">Crear entrevista</button>
      </div>
    </form>`, { title: `Nueva entrevista · ${c.nombre}` });
  root.querySelector('[data-act="volver-ent"]').addEventListener('click', () => { closeDrawer(); openCandidate(c.id); });
  root.querySelector('#ent-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.area && !f.servicio) return toast('Indicá el área o el sector de la entrevista', 'error');
    const data = Object.fromEntries(CAMPOS_PERSONA.map((k) => [k, c[k] ?? null]));
    Object.assign(data, f, {
      stage: f.en_entrevista ? 'entrevista' : 'cv_recibido',
      cv_recibido: c.cv_recibido || todayISO(), cv_path: c.cv_path || null, motivos_baja: [],
      cancelado: false, entrevista_ok: false, listo_ingreso: false,
    });
    const btn = e.submitter; btn.disabled = true;
    const { data: nuevo, error } = await sb.from('candidates').insert(data).select('id').single();
    btn.disabled = false;
    if (error) return toast(error.message, 'error');
    toast('Entrevista creada', 'ok');
    closeDrawer();
    await loadAll({ silent: true });
    openCandidate(nuevo.id);
  });
}

// Si se corrigen datos de la persona, ofrecer pasarlos a sus otras entrevistas.
async function sincronizarPersona(c, data) {
  const otras = otrasEntrevistas(c);
  if (!otras.length) return;
  const cambios = Object.fromEntries(CAMPOS_PERSONA
    .filter((k) => k in data && String(data[k] ?? '') !== String(c[k] ?? ''))
    .map((k) => [k, data[k]]));
  if (!Object.keys(cambios).length) return;
  if (!(await confirmDialog(`¿Actualizar también estos datos en sus otras ${otras.length === 1 ? 'entrevista' : `${otras.length} entrevistas`}?`, { ok: 'Actualizar' }))) return;
  const { error } = await sb.from('candidates').update(cambios).in('id', otras.map((x) => x.id));
  if (error) toast(error.message, 'error');
}

// Línea de etapas de la ficha: clic en una etapa la elige (se guarda con "Guardar")
const ETAPAS_LINEA = () => state.stages.filter((x) => !['sin_candidato', 'cancelado'].includes(x.code));
function etapasLinea(c) {
  return html`<ol class="etapas" aria-label="Etapas">${ETAPAS_LINEA().map((x) => html`<li><button type="button" data-etapa="${x.code}" title="Pasar a ${x.label}">
    <i aria-hidden="true"></i><span>${x.label}</span></button></li>`)}
    <li class="etapa-cancel"><button type="button" data-etapa="cancelado"><i aria-hidden="true"></i><span>Cancelado</span></button></li></ol>
`;
}
function marcarEtapas(root, code) {
  const orden = ETAPAS_LINEA().map((x) => x.code);
  const idx = orden.indexOf(code);
  root.querySelectorAll('.etapas [data-etapa]').forEach((b) => {
    const i = orden.indexOf(b.dataset.etapa);
    const li = b.parentElement;
    li.classList.toggle('is-hecha', code !== 'cancelado' && i >= 0 && i < idx);
    li.classList.toggle('is-actual', b.dataset.etapa === code);
  });
  root.querySelector('.etapas')?.classList.toggle('is-cancelado', code === 'cancelado');
}
