// Importación de CSV (solo RRHH). El archivo se decodifica y parsea en el
// navegador y viaja directo a Supabase con la sesión del usuario; no queda
// copia en ningún otro lado ni en el repositorio.
import { html } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { decodeBytes } from '../lib/csv.js';
import { parsePositionsCSV, parseCandidatesCSV, detectKind, norm } from '../lib/importers.js';
import { toast, stagePill } from '../components/ui.js';
import { mascot } from '../components/mascot.js';

let pending = null; // { kind, rows, warnings, fileName }

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Iniciá sesión con un usuario de RRHH para importar planillas.' })); return; }
  // Vista con estado propio (archivo elegido, vista previa): se dibuja una sola vez
  // por contenedor y no se repinta con cada recarga de datos.
  if (el._init) return;
  el._init = true;
  el.innerHTML = String(html`
    <section class="page-head"><div><h1>Importar planillas</h1>
      <p class="muted">Subí el CSV de <b>Seguimiento de ingresos</b> (posiciones) o el de <b>Candidatos PP</b>. Se reconoce solo cuál es, su encoding (Windows-1252 o UTF-8) y su separador. Re-importar actualiza las filas existentes en vez de duplicarlas.</p></div></section>
    <section class="card">
      <label class="dropzone" id="dz">
        <input type="file" id="csv-file" accept=".csv,text/csv" hidden>
        <strong>Arrastrá el CSV acá</strong><span class="muted">o tocá para elegirlo</span>
      </label>
      <div id="preview"></div>
    </section>
    <section class="card">
      <h2 class="card-title">Cómo se traducen los estados</h2>
      <p class="muted small">Una sola tabla de etapas para todo el sistema. Los textos de ambas planillas se mapean así:</p>
      <div id="alias-table" class="alias-grid"></div>
    </section>`);
  pending = null;
  bind(el);
  loadAliases(el);
}

async function loadAliases(el) {
  const { data } = await sb.from('stage_aliases').select('*').order('stage_code');
  const box = el.querySelector('#alias-table');
  if (!data || !box) return;
  const byStage = new Map();
  data.forEach((a) => { if (!byStage.has(a.stage_code)) byStage.set(a.stage_code, []); byStage.get(a.stage_code).push(a); });
  box.innerHTML = String(html`${state.stages.filter((s) => byStage.has(s.code)).map((s) => html`<div class="alias-row">
    ${stagePill(s.code)}<span>${byStage.get(s.code).map((a) => html`<code title="${a.origen}">${a.alias}</code> `)}</span></div>`)}`);
}

function bind(el) {
  const input = el.querySelector('#csv-file');
  const dz = el.querySelector('#dz');
  input.addEventListener('change', () => input.files[0] && readFile(el, input.files[0]));
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('is-over'); const f = e.dataTransfer.files[0]; if (f) readFile(el, f); });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-act="import"]')) await doImport(el, e.target.closest('button'));
    if (e.target.closest('[data-act="cancel"]')) { pending = null; el.querySelector('#preview').innerHTML = ''; }
  });
}

async function readFile(el, file) {
  const prev = el.querySelector('#preview');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = decodeBytes(bytes);
    const kind = detectKind(text);
    if (!kind) throw new Error('No reconozco el archivo: no tiene las columnas de Seguimiento de ingresos ni de Candidatos PP.');
    const res = kind === 'positions' ? parsePositionsCSV(text) : parseCandidatesCSV(text);
    pending = { kind, ...res, fileName: file.name };

    const { data: aliases } = await sb.from('stage_aliases').select('alias');
    const known = new Set((aliases || []).map((a) => a.alias));
    const statusCount = new Map();
    res.rows.forEach((r) => { const s = r.status || '(vacío)'; statusCount.set(s, (statusCount.get(s) || 0) + 1); });
    const unknown = [...statusCount.keys()].filter((s) => s !== '(vacío)' && !known.has(norm(s)));
    const existing = new Set((kind === 'positions' ? state.positions : state.candidates).map((r) => r.import_key));
    const nuevos = res.rows.filter((r) => !existing.has(r.import_key)).length;

    prev.innerHTML = String(html`<div class="import-preview">
      <h3>${kind === 'positions' ? 'Seguimiento de ingresos (posiciones)' : 'Candidatos PP'} <small class="muted">${file.name}</small></h3>
      <ul class="facts">
        <li><b>${res.rows.length}</b> filas válidas</li>
        <li><b>${nuevos}</b> nuevas · <b>${res.rows.length - nuevos}</b> a actualizar</li>
        ${kind === 'positions' ? html`<li>Las sillas que ya tienen un candidato vinculado en la app conservan su estado.</li>` : ''}
      </ul>
      <h4>Estados encontrados</h4>
      <div class="chips">${[...statusCount.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => html`<span class="chip ${unknown.includes(s) ? 'chip--warn' : ''}">${s} <b>${n}</b></span>`)}</div>
      ${unknown.length ? html`<p class="note">Estados sin traducción: ${unknown.join(', ')}. Se infieren por los hitos cargados (candidatos) o quedan como "Entrevista"/"Sin candidato" (posiciones).</p>` : ''}
      ${res.warnings.length ? html`<details><summary>${res.warnings.length} advertencias</summary><ul class="small">${res.warnings.slice(0, 50).map((w) => html`<li>${w}</li>`)}</ul></details>` : ''}
      <div class="form-actions"><span class="spacer"></span>
        <button class="btn btn--ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn--primary" data-act="import">Importar ${res.rows.length} filas</button></div>
    </div>`);
  } catch (err) {
    pending = null;
    prev.innerHTML = String(mascot('error', { compact: true, size: 110, text: err.message }));
  }
}

async function doImport(el, btn) {
  if (!pending) return;
  btn.disabled = true;
  const rpc = pending.kind === 'positions' ? 'import_positions' : 'import_candidates';
  const total = { insertados: 0, actualizados: 0, vinculados: 0 };
  const CHUNK = 150;
  try {
    for (let i = 0; i < pending.rows.length; i += CHUNK) {
      btn.textContent = `Importando… ${Math.min(i + CHUNK, pending.rows.length)}/${pending.rows.length}`;
      const { data, error } = await sb.rpc(rpc, { p_rows: pending.rows.slice(i, i + CHUNK) });
      if (error) throw error;
      for (const k of Object.keys(total)) total[k] += data?.[k] || 0;
    }
    if (pending.kind === 'candidates') {
      const { data } = await sb.rpc('link_positions_by_name');
      total.vinculados += data || 0;
    }
    el.querySelector('#preview').innerHTML = String(mascot('success', {
      title: 'Importación lista',
      text: `${total.insertados} nuevas · ${total.actualizados} actualizadas · ${total.vinculados} sillas vinculadas por nombre con su ficha de candidato.`,
    }));
    pending = null;
    toast('Importación completa', 'ok');
    loadAll({ silent: true });
  } catch (err) {
    toast(err.message, 'error', 6000);
    btn.disabled = false;
    btn.textContent = 'Reintentar';
  }
}
