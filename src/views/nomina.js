// Nómina general EFiS (solo RRHH). Todo el personal; los ingresos confirmados
// en la app se agregan solos. Se puede reimportar la planilla (clave: DNI).
import { html, raw, $ } from '../lib/html.js';
import { state, loadAll, set } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, fmtInt, norm, todayISO, daysBetween, fmtMonth } from '../lib/format.js';
import { countBy, faltantesAlCorte, sectorMatches } from '../lib/kpis.js';
import { decodeBytes } from '../lib/csv.js';
import { parseNominaCSV } from '../lib/importers.js';
import {
  filterGroup, toggleFilter, kpi, bars, openDrawer, closeDrawer, toast, toastDeshacer, formData, field, confirmDialog, animateIn, pickField,
  multiSelectFilter, loadLocal, saveLocal,

} from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { avisoCumples } from '../components/cumples.js';
import { mesAnterior } from '../lib/cierreMes.js';
import { icono } from '../components/iconos.js';

const DIMS = ['yacimiento', 'sector', 'encuadre', 'estado', 'pendiente'];
const filters = Object.fromEntries(DIMS.map((d) => [d, new Set(d === 'estado' ? ['activo'] : [])]));
let search = '';
let page = 1;
// Dotación por mes: quiénes estaban en la empresa en los meses elegidos
let meses = new Set(loadLocal('reclutapp.nom.meses', []));
let openMulti = null;
// vista moderna (estilo IRIS): sub-pestaña y panel de filtros
let subTab = loadLocal('reclutapp.nom.tab', 'resumen');
let filtrosAbiertos = false;
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
  const hoy = todayISO().slice(0, 7);
  const anios = [...new Set(disp.map((m) => m.slice(0, 4)))];
  return [['Todo', disp], ['Este mes', [hoy]], ['Últimos 3 meses', disp.slice(0, 3)], ['Últimos 6 meses', disp.slice(0, 6)],
    ...anios.map((y) => [`Año ${y}`, disp.filter((m) => m.startsWith(y))])]
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


// Plazos fijos a revisar (vencidos o que vencen en los próximos N días)
let vistaPf = null;
export function elegirPlazos(dias) { vistaPf = dias; subTab = 'listado'; saveLocal('reclutapp.nom.tab', 'listado'); }
const sumarDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const plazoARevisar = (n, dias, hoy = todayISO()) => n.estado === 'activo' && !!n.fin_pf && n.fin_pf <= sumarDias(hoy, dias);

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
  if (vistaPf) rows = rows.filter((n) => plazoARevisar(n, vistaPf));
  rows = [...rows].sort((a, b) => (vistaPf ? a.fin_pf.localeCompare(b.fin_pf) : 0) || a.nombre.localeCompare(b.nombre, 'es'));
  const shown = rows.slice(0, page * PAGE);
  const hoy = todayISO();
  const pfProx = base.filter((n) => n.fin_pf && n.fin_pf >= hoy && daysBetween(hoy, n.fin_pf) <= 60).length;
  const recientes = base.filter((n) => n.fecha_ingreso && daysBetween(n.fecha_ingreso, hoy) <= 90).length;

  el.innerHTML = String(vistaModerna({ base, rows, shown, recientes, pfProx }));
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
      if (act === 'm-filtros') { filtrosAbiertos = !filtrosAbiertos; render(el); return; }
      if (act === 'm-tab') { subTab = e.target.closest('[data-tab]').dataset.tab; saveLocal('reclutapp.nom.tab', subTab); render(el); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (act === 'm-pf') { vistaPf = vistaPf === 60 ? null : 60; if (vistaPf) subTab = 'listado'; page = 1; render(el); return; }
      if (act === 'm-pf-off') { vistaPf = null; page = 1; render(el); return; }
      if (act === 'm-pend') { filters.pendiente = new Set([e.target.closest('[data-value]').dataset.value]); subTab = 'listado'; page = 1; render(el); return; }
      if (act === 'm-limpiar') { DIMS.forEach((d) => { filters[d] = new Set(d === 'estado' ? ['activo'] : []); }); meses = new Set(); saveLocal('reclutapp.nom.meses', []); page = 1; render(el); return; }
      if (act === 'export') return exportCSV(currentRows(el));
      if (act === 'new') return openPersona(null);
      const ds = e.target.closest('[data-sap-silla]');
      if (ds) { import('./posiciones.js').then((m) => m.openEditor(ds.dataset.sapSilla)); return; }
      const dp = e.target.closest('[data-sap-persona]');
      if (dp) { openPersona(dp.dataset.sapPersona); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) openPersona(tr.dataset.id);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) openPersona(e.target.dataset.id); });
    // recordar qué listas de diferencias con SAP quedaron abiertas al redibujar
    el.addEventListener('toggle', (e) => { const k = e.target.dataset?.sapGrupo; if (k) { if (e.target.open) sapAbiertos.add(k); else sapAbiertos.delete(k); } }, true);
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

export function abrirPersona(id) { openPersona(id); }
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
    </form>`, { title: n.id ? n.nombre : 'Alta en nómina', wide: true, modificado: n.id ? n : null });
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
    // se borra recién si no se toca "Deshacer"
    closeDrawer();
    set({ nomina: state.nomina.filter((x) => x.id !== n.id) });
    toastDeshacer(`${n.nombre} eliminado de la nómina`, () => loadAll({ silent: true }), {
      alVencer: async () => {
        const { error } = await sb.from('nomina').delete().eq('id', n.id);
        if (error) toast(error.message, 'error');
        loadAll({ silent: true });
      },
    });
  });
}

async function reimportar(file) {
  try {
    const { rows, warnings, columnasVacias } = parseNominaCSV(decodeBytes(new Uint8Array(await file.arrayBuffer())));
    const nuevos = rows.filter((r) => !state.nomina.some((n) => n.dni === r.dni)).length;
    const vacias = columnasVacias.length
      ? ` Estas columnas vinieron vacías y se van a ignorar (se conserva lo que ya está en la app): ${columnasVacias.join(', ')}. Si en el Excel tienen fórmulas, copiá y pegá como valores antes de guardar el CSV.`
      : '';
    if (!(await confirmDialog(`Planilla de nómina: ${rows.length} personas (${nuevos} nuevas, ${rows.length - nuevos} a actualizar por DNI)${warnings.length ? `, ${warnings.length} filas salteadas` : ''}. Se actualizan los datos que trae la planilla; las celdas vacías no borran nada.${vacias} ¿Importar?`, { ok: 'Importar' }))) return;
    // Agrupar por conjunto de columnas: un upsert con columnas distintas completaría con vacíos.
    const grupos = new Map();
    for (const r of rows) { const k = Object.keys(r).sort().join(','); (grupos.get(k) || grupos.set(k, []).get(k)).push(r); }
    for (const lote of grupos.values()) {
      for (let i = 0; i < lote.length; i += 100) {
        const { error } = await sb.from('nomina').upsert(lote.slice(i, i + 100), { onConflict: 'dni' });
        if (error) throw error;
      }
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
    <thead><tr><th>Mes</th><th class="num">Dotación</th><th class="num">Faltaban tomar</th><th class="num">Dotación requerida</th><th class="num">% cobertura</th><th class="num">Ingresos del mes</th><th class="num">Bajas del mes</th></tr></thead>
    <tbody>${lista.map((m) => { const c = corteMes(m); const dot = base.filter((n) => enMes(n, m)).length; const f = faltantesFiltrados(c).length; return html`<tr><td><b>${fmtMonth(m)}</b></td>
      <td class="num"><b>${dot}</b></td>
      <td class="num">${f || '·'}</td>
      <td class="num">${dot + f}</td>
      <td class="num"><b>${porc(dot, dot + f)}%</b></td>
      <td class="num">${base.filter((n) => n.fecha_ingreso && n.fecha_ingreso.startsWith(m)).length || '·'}</td>
      <td class="num">${base.filter((n) => n.fecha_baja && n.fecha_baja.startsWith(m)).length || '·'}</td></tr>`; })}</tbody>
  </table></div></section>`;
}
// para contar la dotación de cada mes: todos los filtros menos Estado y meses
const filterRowsSinEstado = () => state.nomina.filter((n) => DIMS.every((d) => d === 'estado' || !filters[d].size || [].concat(getters[d](n)).some((v) => filters[d].has(v))));

// ---------------------------------------------------------------------------
// Dotación vs. lo que faltaba tomar (sillas del mapa de posiciones).
// Corte: fin del último mes elegido, o hoy. Los filtros de yacimiento, sector
// y encuadre se aplican también a las sillas.
// ---------------------------------------------------------------------------
const porc = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const corteMes = (m) => { const f = finDeMes(m); const h = todayISO(); return f < h ? f : h; };
const codigo = (v) => { const s = norm(v).replace(/[^a-z0-9]/g, ''); return ({ ltn1: 'lt1n' })[s] || s; };
const yacDeSilla = (p) => { const c = codigo(p.yacimiento); return [...canon.entries()].find(([k]) => k.startsWith('yacimiento|') && codigo(k.slice(11)) === c)?.[1] || p.yacimiento || 'Sin dato'; };
function silllaPasaFiltros(p, except) {
  if (except !== 'yacimiento' && filters.yacimiento.size && ![...filters.yacimiento].some((y) => codigo(y) === codigo(p.yacimiento))) return false;
  if (except !== 'sector' && filters.sector.size && ![...filters.sector].some((s) => sectorMatches(p.sector, s))) return false;
  if (except !== 'encuadre' && filters.encuadre.size && !filters.encuadre.has(p.encuadre || 'PP')) return false;
  return true;
}
const faltantesFiltrados = (corte, except) => faltantesAlCorte(state.positions, corte, { candidatos: state.candidates }).filter((p) => silllaPasaFiltros(p, except));

function datosCobertura() {
  const ult = [...meses].sort().pop();
  const corte = ult ? corteMes(ult) : todayISO();
  const personas = ult ? filterRowsSinEstado().filter((n) => enMes(n, ult)) : filterRows(null);
  const falt = faltantesFiltrados(corte);
  return { ult, corte, personas, falt, req: personas.length + falt.length };
}

// Perfil de la dotación: edad, antigüedad, género y residencia (con los filtros de la pantalla)
const RANGOS_EDAD = [['Menos de 25', 0, 25], ['25 a 34', 25, 35], ['35 a 44', 35, 45], ['45 a 54', 45, 55], ['55 o más', 55, 200]];
const RANGOS_ANT = [['Menos de 1 año', 0, 1], ['1 a 2 años', 1, 3], ['3 a 5 años', 3, 6], ['6 a 10 años', 6, 11], ['Más de 10 años', 11, 200]];
const GENERO = { M: 'Masculino', F: 'Femenino' };
const provinciaDe = (v) => { const t = norm(v || ''); if (!t) return 'Sin dato'; if (t === 'neuquen') return 'Neuquén'; if (t === 'rio negro') return 'Río Negro'; return String(v).trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()); };
// agrupa sin distinguir mayúsculas ni acentos; muestra la variante con acentos (o la más común), en formato Título
function agrupar(rows, fn) {
  const g = new Map();
  for (const r of rows) {
    const v = String(fn(r) ?? '').trim(); const k = norm(v) || '—';
    if (!g.has(k)) g.set(k, { n: 0, vars: new Map() });
    const e = g.get(k); e.n++; e.vars.set(v, (e.vars.get(v) || 0) + 1);
  }
  const titulo = (t) => t.toLowerCase().replace(/(^|[\s(])\S/g, (c) => c.toUpperCase());
  return [...g.entries()].map(([k, e]) => {
    if (k === '—') return ['Sin dato', e.n];
    const vs = [...e.vars.entries()].sort((a, b) => (/[^\x00-\x7F]/.test(b[0]) - /[^\x00-\x7F]/.test(a[0])) || b[1] - a[1]);
    return [titulo(vs[0][0]), e.n];
  }).sort((a, b) => b[1] - a[1]);
}
const aniosDesde = (iso, hoy) => (iso ? daysBetween(iso, hoy) / 365.25 : null);
function perfilDotacion(rows) {
  const hoy = todayISO();
  const pers = rows.filter((n) => n.estado === 'activo');
  if (!pers.length) return html`<section class="card"><p class="muted">No hay personal activo con estos filtros.</p></section>`;
  const edades = pers.map((n) => aniosDesde(n.fecha_nacimiento, hoy)).filter((x) => x != null);
  const ants = pers.map((n) => aniosDesde(n.fecha_ingreso, hoy)).filter((x) => x != null);
  const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const enRango = (xs, rs) => rs.map(([l, a, b]) => [l, xs.filter((x) => x >= a && x < b).length]);
  const genero = countBy(pers, (n) => GENERO[String(n.sexo || '').toUpperCase()] || (n.sexo ? 'Otro' : 'Sin dato'));
  const provincias = countBy(pers, (n) => provinciaDe(n.provincia)).sort((a, b) => b[1] - a[1]);
  const localidades = agrupar(pers, (n) => n.localidad);
  const conProv = pers.filter((n) => provinciaDe(n.provincia) !== 'Sin dato');
  const locales = conProv.filter((n) => provinciaDe(n.provincia) === 'Neuquén').length;
  const mujeres = pers.filter((n) => String(n.sexo || '').toUpperCase() === 'F').length;
  const porYac = countBy(pers, getters.yacimiento).sort((a, b) => b[1] - a[1]).map(([y, tot]) => {
    const g = pers.filter((n) => getters.yacimiento(n) === y && provinciaDe(n.provincia) !== 'Sin dato');
    const l = g.filter((n) => provinciaDe(n.provincia) === 'Neuquén').length;
    return [y, g.length ? Math.round((l / g.length) * 100) : 0, null, y, l, g.length];
  });
  const f1 = (x) => (x == null ? '—' : x.toLocaleString('es-AR', { maximumFractionDigits: 1 }));
  return html`
  <section class="mk-grid mk-grid--4">
    <div class="mk mk--main"><div class="mk-top"><span class="mk-lbl">Personal activo</span></div><div class="mk-row"><span class="mk-num">${fmtInt(pers.length)}</span></div><span class="mk-sub">con los filtros elegidos</span></div>
    <div class="mk"><div class="mk-top"><span class="mk-lbl">Edad promedio</span></div><div class="mk-row"><span class="mk-num">${f1(prom(edades))}</span></div><span class="mk-sub">años</span></div>
    <div class="mk"><div class="mk-top"><span class="mk-lbl">Antigüedad promedio</span></div><div class="mk-row"><span class="mk-num">${f1(prom(ants))}</span></div><span class="mk-sub">años en la empresa</span></div>
    <div class="mk"><div class="mk-top"><span class="mk-lbl">Residentes en Neuquén</span></div><div class="mk-row"><span class="mk-num">${conProv.length ? Math.round((locales / conProv.length) * 100) : 0}<small>%</small></span></div>
      <span class="mk-barra"><span style="width:${conProv.length ? (locales / conProv.length) * 100 : 0}%"></span></span>
      <span class="mk-sub"><b>${fmtInt(locales)}</b> de ${fmtInt(conProv.length)} con provincia cargada · ${porc(mujeres, pers.length)}% mujeres</span></div>
  </section>
  <section class="grid-2">
    <article class="card"><h2 class="card-title">Edad</h2>${bars(enRango(edades, RANGOS_EDAD), { color: 'green', total: edades.length, chart: 'n-edad', limit: 10 })}</article>
    <article class="card"><h2 class="card-title">Antigüedad</h2>${bars(enRango(ants, RANGOS_ANT), { color: 'green', total: ants.length, chart: 'n-ant', limit: 10 })}</article>
  </section>
  <section class="grid-2">
    <article class="card"><h2 class="card-title">Género</h2>${bars(genero.sort((a, b) => b[1] - a[1]), { color: 'green', total: pers.length, chart: 'n-gen' })}</article>
    <article class="card"><h2 class="card-title">Provincia de residencia</h2>${bars(provincias, { color: 'green', total: pers.length, chart: 'n-prov' })}</article>
  </section>
  <section class="grid-2">
    <article class="card"><h2 class="card-title">Localidades de residencia <small class="muted">las 10 principales</small></h2>${bars(localidades, { color: 'green', total: pers.length, chart: 'n-loc', limit: 10 })}</article>
    <article class="card"><h2 class="card-title">Residentes en Neuquén por yacimiento <small class="muted">% de cada uno</small></h2>${bars(porYac, { color: 'green', max: 100, fmt: (v) => v + '%', chart: 'n-locyac', limit: 12 })}</article>
  </section>`;
}

// Diferencias entre la app y el maestro de SAP (solo RRHH)
const sapAbiertos = new Set();
const digitos = (v) => String(v ?? '').replace(/\D/g, '');
function diferenciasSap() {
  if (!state.sap?.length) return '';
  const dniSap = new Set(state.sap.map((x) => x.dni));
  const dniNom = new Set(state.nomina.map((n) => digitos(n.dni)).filter(Boolean));
  const activos = state.nomina.filter((n) => n.estado === 'activo');
  const grupos = [
    ['sillas', 'Sillas cubiertas sin POS SAP', state.positions.filter((p) => ['ingresado', 'proximo_ingreso'].includes(p.stage) && !String(p.pos_sap || '').trim())
      .sort((a, b) => (a.candidato_nombre || '').localeCompare(b.candidato_nombre || '', 'es'))
      .map((p) => html`<li><button type="button" data-sap-silla="${p.id}"><b>${p.candidato_nombre || '—'}</b> <small>${p.puesto} · ${p.yacimiento}${p.sector ? ` · ${p.sector}` : ''}</small></button></li>`)],
    ['nosap', 'Activos en nómina que no figuran en SAP', activos.filter((n) => digitos(n.dni) && !dniSap.has(digitos(n.dni)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((n) => html`<li><button type="button" data-sap-persona="${n.id}"><b>${n.nombre}</b> <small>${[n.yacimiento, n.sector, n.fecha_ingreso ? 'ingreso ' + fmtDate(n.fecha_ingreso) : ''].filter(Boolean).join(' · ')}</small></button></li>`)],
    ['nonom', 'En SAP pero no en la nómina', state.sap.filter((x) => !dniNom.has(x.dni))
      .map((x) => html`<li><span><b>${x.nombre || '—'}</b> <small>POS ${x.pos}${x.puesto ? ` · ${x.puesto}` : ''}</small></span></li>`)],
    ['sinpos', 'Activos en nómina sin POS', activos.filter((n) => !String(n.pos || '').trim())
      .map((n) => html`<li><button type="button" data-sap-persona="${n.id}"><b>${n.nombre}</b> <small>${[n.yacimiento, n.sector].filter(Boolean).join(' · ')}</small></button></li>`)],
  ].filter(([, , xs]) => xs.length);
  if (!grupos.length) return '';
  return html`<section class="card dif-sap"><h2 class="card-title">Diferencias con SAP <small class="muted">${grupos.reduce((a, [, , xs]) => a + xs.length, 0)}</small></h2>
    ${grupos.map(([k, t, xs]) => html`<details data-sap-grupo="${k}" ${raw(sapAbiertos.has(k) ? 'open' : '')}>
      <summary><span>${t}</span><b>${xs.length}</b></summary><ul>${xs}</ul></details>`)}
  </section>`;
}

function coberturaDotacion() {
  const { ult, corte, personas, falt, req } = datosCobertura();
  const enProceso = falt.filter((p) => p.candidato_nombre && p.stage !== 'ingresado').length;
  const ingresaronDespues = falt.filter((p) => p.stage === 'ingresado').length;
  // Por yacimiento: dotación (nómina) + faltantes (sillas), sin el filtro de yacimiento para comparar todos
  const dotY = countBy(ult ? filterRowsSinEstado().filter((n) => enMes(n, ult)) : filterRows(null), getters.yacimiento);
  const filas = new Map(dotY.map(([y, n]) => [y, { dot: n, falt: 0 }]));
  for (const p of falt) { const y = yacDeSilla(p); const f = filas.get(y) || { dot: 0, falt: 0 }; f.falt++; filas.set(y, f); }
  const orden = [...filas.entries()].filter(([, v]) => v.dot || v.falt).sort((a, b) => (b[1].falt - a[1].falt) || (b[1].dot - a[1].dot));
  const titulo = ult ? `al ${fmtDate(corte)}` : 'hoy';
  const faltL = ult ? 'Faltaban tomar' : 'Faltan tomar';
  return html`<section class="card cob-dot">
    <header class="list-head"><h2 class="card-title">Dotación y faltantes <small class="muted">${titulo}</small></h2></header>
    <div class="cob-dot-grid">
      <div class="cob-dot-kpis">
        <div class="cob-dot-pct"><b>${porc(personas.length, req)}%</b><span>cobertura de la dotación requerida</span></div>
        <div class="cob-dot-bar" role="img" aria-label="${personas.length} en nómina, ${falt.length} faltan tomar">
          <span class="is-dot" style="width:${porc(personas.length, req)}%"></span><span class="is-falt" style="width:${100 - porc(personas.length, req)}%"></span></div>
        <dl class="cob-dot-nums">
          <div><dt>En nómina</dt><dd>${fmtInt(personas.length)}</dd></div>
          <div><dt>${faltL}</dt><dd class="is-falt-txt">${fmtInt(falt.length)}</dd></div>
          <div><dt>Dotación requerida</dt><dd>${fmtInt(req)}</dd></div>
        </dl>
        ${falt.length ? html`<p class="small muted">${ult ? 'De las que faltaban' : 'De las que faltan'}: ${enProceso} con candidato en proceso${ult && ingresaronDespues ? `, ${ingresaronDespues} ingresaron después del corte` : ''}${falt.length - enProceso - ingresaronDespues > 0 ? `, ${falt.length - enProceso - ingresaronDespues} sin candidato` : ''}.</p>` : ''}
      </div>
      <div class="table-wrap"><table class="tbl tbl--compact">
        <thead><tr><th>Yacimiento</th><th class="num">En nómina</th><th class="num">${ult ? 'Faltaban' : 'Faltan'}</th><th class="num">Requerida</th><th class="num">% cobertura</th></tr></thead>
        <tbody>${orden.map(([y, v]) => html`<tr><td><b>${y}</b></td><td class="num">${v.dot}</td><td class="num ${v.falt ? 'is-falt-txt' : ''}">${v.falt || '·'}</td><td class="num">${v.dot + v.falt}</td>
          <td class="num"><span class="cob-mini"><span style="width:${porc(v.dot, v.dot + v.falt)}%"></span></span> <b>${porc(v.dot, v.dot + v.falt)}%</b></td></tr>`)}</tbody>
      </table></div>
    </div>
  </section>`;
}

function tablaPersonal(rows, shown) {
  return rows.length ? html`<div class="table-wrap"><table class="tbl tbl--tarjetas is-clickable">
      <thead><tr><th>Nombre</th><th>DNI</th><th class="hide-sm">Nº pers.</th><th class="hide-sm">Yac. · Sector</th><th class="hide-sm">Función</th><th class="hide-sm">Cat.</th><th class="hide-sm">Diagrama</th><th class="hide-sm">Jefe</th><th>Ingreso</th>${vistaPf ? html`<th>Fin plazo fijo</th>` : ''}<th class="hide-sm num">Edad</th><th>Pend.</th></tr></thead>
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
          ${vistaPf ? html`<td data-th="Fin plazo fijo" class="${n.fin_pf < todayISO() ? 'is-late-txt' : ''}"><b>${fmtDate(n.fin_pf)}</b> <small class="muted">${n.fin_pf < todayISO() ? 'vencido' : `en ${daysBetween(todayISO(), n.fin_pf)} días`}</small></td>` : ''}
          <td data-th="Edad" class="hide-sm num">${edad(n) ?? ''}</td>
          <td data-th="Pend.">${pend.map((p) => html`<span class="tag tag--late">${p}</span> `)}</td>
        </tr>`;
      })}</tbody></table></div>
      ${rows.length > shown.length ? html`<div class="center"><button class="btn btn--ghost" data-act="more">Ver más (${rows.length - shown.length})</button></div>` : ''}`
      : mascot('empty');
}

// ---------------------------------------------------------------------------
// Vista moderna (maqueta, solo con el estilo IRIS): barra de búsqueda con
// filtros plegados, 4 indicadores y sub-pestañas Resumen / Gráficos / Listado.
// ---------------------------------------------------------------------------
function chispa(serie) {
  if (serie.length < 2) return '';
  const W = 120; const H = 36; const v = serie.map(([, n]) => n); const max = Math.max(...v); const min = Math.min(...v);
  const pts = v.map((n, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - 4 - ((n - min) / Math.max(1, max - min)) * (H - 8)).toFixed(1)}`).join(' ');
  return raw(`<svg class="mk-chispa" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${H} ${pts} ${W},${H}" class="mk-chispa-a"/><polyline points="${pts}" class="mk-chispa-l"/></svg>`);
}

function vistaModerna({ base, rows, shown, recientes, pfProx }) {
  const activos = DIMS.filter((d) => d !== 'estado').reduce((n, d) => n + filters[d].size, 0) + meses.size;
  const chips = [...DIMS.filter((d) => d !== 'estado').flatMap((d) => [...filters[d]].map((v) => [d, v]))];
  const ultimos = mesesDisponibles().slice(0, 12).reverse();
  const sinEstado = filterRowsSinEstado();
  const serie = ultimos.map((m) => [m, sinEstado.filter((n) => enMes(n, m)).length]);
  const delta = serie.length > 1 ? serie[serie.length - 1][1] - serie[serie.length - 2][1] : null;
  const cob = datosCobertura();
  const pc = porc(cob.personas.length, cob.req);
  const pend = [['DDJJ', base.filter((n) => !okVal(n.ddjj)).length], ['Kit', base.filter((n) => !okVal(n.regalo_kit)).length],
    ['Teléfono', base.filter((n) => !n.telefono).length], ['CUIL', base.filter((n) => !n.cuil).length]];
  const tab = ['resumen', 'graficos', 'perfil', 'listado'].includes(subTab) ? subTab : 'resumen';
  const titulo = meses.size ? (meses.size === 1 ? `Dotación ${fmtMonth([...meses][0])}` : 'Personas en el período') : 'Personas en nómina';
  const num = (v, k) => raw(`<span class="kpi-value mk-num" data-n="${v}" data-k="mk-${k}">${fmtInt(v)}</span>`);

  return html`
  <section class="m-head">
    <div><h1>Nómina</h1><p>${fmtInt(base.length)} personas ${meses.size ? 'en el período elegido' : 'activas'}${activos ? ` · ${activos} filtro${activos === 1 ? '' : 's'}` : ''}</p></div>
    <div class="m-acciones">
      <a class="btn btn--ghost" href="#/reunion?mes=${mesAnterior(todayISO())}&ir=cierre-mes" title="Resumen del mes: dotación, ingresos, bajas, sillas y reclutamiento">Cierre de mes</a>
      <label class="btn btn--ghost">Reimportar<input type="file" id="nom-file" accept=".csv,text/csv" hidden></label>
      <button class="btn btn--ghost" data-act="export">Exportar</button>
      <button class="btn btn--primary" data-act="new">+ Alta</button>
    </div>
  </section>

  ${avisoCumples()}
  <section class="m-barra">
    <label class="m-buscar">${icono('buscar')}<input type="search" id="nom-search" placeholder="Buscar por nombre, DNI, Nº pers., función o jefe" value="${search}"></label>
    <button type="button" class="m-btn-filtros ${filtrosAbiertos ? 'is-on' : ''}" data-act="m-filtros" aria-expanded="${filtrosAbiertos}">${icono('filtro')} Filtros${activos ? html`<b>${activos}</b>` : ''}</button>
    ${multiSelectFilter({ dim: 'mes', label: 'Dotación en', options: mesesDisponibles().map((m) => [m, sinEstado.filter((n) => enMes(n, m)).length]), selected: meses, allLabel: 'Hoy', presets: presetsMeses(mesesDisponibles()), open: openMulti === 'mes', labelOf: (m) => fmtMonth(m) })}
  </section>
  ${chips.length ? html`<div class="m-chips">${chips.map(([d, v]) => html`<button type="button" class="m-chip" data-filter="${d}" data-value="${v}">${v} <span aria-hidden="true">✕</span></button>`)}
    <button type="button" class="m-limpiar" data-act="m-limpiar">Limpiar todo</button></div>` : ''}
  <section class="m-panel ${filtrosAbiertos ? 'is-open' : ''}" ${filtrosAbiertos ? '' : raw('hidden')}>
    ${filterGroup({ dim: 'yacimiento', label: 'Yacimiento', options: opts('yacimiento'), selected: filters.yacimiento, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'sector', label: 'Sector', options: opts('sector'), selected: filters.sector, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'encuadre', label: 'Encuadre', options: opts('encuadre'), selected: filters.encuadre, allLabel: 'Todos' })}
    ${filterGroup({ dim: 'pendiente', label: 'Pendiente', options: opts('pendiente'), selected: filters.pendiente, allLabel: 'Todos' })}
    ${meses.size ? '' : filterGroup({ dim: 'estado', label: 'Estado', options: opts('estado'), selected: filters.estado, allLabel: 'Todos' })}
  </section>

  <section class="mk-grid">
    <div class="mk mk--main">
      <div class="mk-top"><span class="mk-ico">${icono('personas')}</span><span class="mk-lbl">${titulo}</span></div>
      <div class="mk-row">${num(base.length, 'tot')}${chispa(serie)}</div>
      <span class="mk-sub">${delta != null ? html`<b class="${delta >= 0 ? 'is-up' : 'is-down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}</b> vs mes anterior` : ''}</span>
    </div>
    <div class="mk">
      <div class="mk-top"><span class="mk-ico">${icono('cobertura')}</span><span class="mk-lbl">Cobertura de la dotación</span></div>
      <div class="mk-row"><span class="mk-num">${pc}<small>%</small></span></div>
      <span class="mk-barra"><span style="width:${pc}%"></span></span>
      <span class="mk-sub"><b>${cob.falt.length}</b> ${cob.ult ? 'faltaban' : 'faltan'} tomar de ${fmtInt(cob.req)}</span>
    </div>
    <div class="mk">
      <div class="mk-top"><span class="mk-ico">${icono('alta')}</span><span class="mk-lbl">Ingresos 90 días</span></div>
      <div class="mk-row">${num(recientes, 'rec')}</div>
      <span class="mk-sub">${porc(recientes, base.length)}% de la dotación</span>
    </div>
    <button type="button" class="mk mk--btn ${pfProx ? 'mk--alerta' : ''} ${vistaPf === 60 ? 'is-sel' : ''}" data-act="m-pf">
      <div class="mk-top"><span class="mk-ico">${icono('reloj')}</span><span class="mk-lbl">Plazos fijos ≤ 60 días</span></div>
      <div class="mk-row">${num(pfProx, 'pf')}</div>
      <span class="mk-sub">${pfProx ? 'revisar renovaciones' : 'sin vencimientos'}${pfProx ? html`<b class="mk-go"> · ${vistaPf === 60 ? 'mostrando ✓' : 'ver'}</b>` : ''}</span>
    </button>
  </section>

  <nav class="m-tabs" aria-label="Vistas de nómina">
    ${[['resumen', 'Resumen'], ['graficos', 'Gráficos'], ['perfil', 'Perfil'], ['listado', `Listado · ${fmtInt(rows.length)}`]].map(([k, l]) => html`<button type="button" class="m-tab ${tab === k ? 'is-on' : ''}" data-act="m-tab" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`)}
  </nav>

  <div class="m-cuerpo">
  ${tab === 'resumen' ? html`
    ${coberturaDotacion()}
    ${diferenciasSap()}
    <section class="card m-pend"><h2 class="card-title">Documentación pendiente</h2>
      <ul class="m-pend-list">${pend.map(([k, n]) => html`<li><button type="button" data-act="m-pend" data-value="${k}">
        <span class="mk-ico mk-ico--sm">${icono('documento')}</span><span class="m-pend-k">${k}</span>
        <span class="m-pend-bar"><span style="width:${porc(n, base.length)}%"></span></span>
        <b>${fmtInt(n)}</b><small>${porc(n, base.length)}%</small>${icono('flecha', 'ico ico--sm')}</button></li>`)}</ul>
    </section>` : ''}
  ${tab === 'perfil' ? perfilDotacion(base) : ''}
  ${tab === 'graficos' ? html`
    ${meses.size ? dotacionPorMes() : ''}
    <section class="grid-2">
      <article class="card"><h2 class="card-title">Por yacimiento</h2>${bars(countBy(filterRows('yacimiento'), getters.yacimiento), { dim: 'yacimiento', selected: filters.yacimiento, chart: 'n-yac', limit: 12 })}</article>
      <article class="card"><h2 class="card-title">Por sector</h2>${bars(countBy(filterRows('sector'), getters.sector), { color: 'green', dim: 'sector', selected: filters.sector, chart: 'n-sec', limit: 12 })}</article>
    </section>
    <section class="card"><h2 class="card-title">Encuadre</h2>${bars(countBy(filterRows('encuadre'), getters.encuadre), { dim: 'encuadre', selected: filters.encuadre })}</section>` : ''}
  ${tab === 'listado' ? html`<section class="card m-lista">
    ${vistaPf ? html`<div class="m-chips"><button type="button" class="m-chip" data-act="m-pf-off">Plazos fijos vencidos o que vencen en ${vistaPf} días <span aria-hidden="true">✕</span></button></div>` : ''}
    ${tablaPersonal(rows, shown)}</section>` : ''}
  </div>`;
}
