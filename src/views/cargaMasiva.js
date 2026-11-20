// Panel de carga masiva de candidatos (solo RRHH): descargar plantilla,
// subir la planilla completa, revisar la vista previa y confirmar.
import { html } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { todayISO, fmtDate } from '../lib/format.js';
import { openDrawer, closeDrawer, toast } from '../components/ui.js';
import { opcionesPlantilla, plantillaCargaMasiva, leerCargaMasiva } from '../lib/cargaMasiva.js';

const ETIQ = { ok: ['Se carga', 'green'], duplicado: ['Ya existe', 'orange'], error: ['Con error', 'red'] };

export function openCargaMasiva() {
  let filas = [];
  const root = openDrawer(html`
    <div class="cm-pasos">
      <div class="cm-paso"><b>1</b><div><strong>Descargá la plantilla</strong><small class="muted block">Excel con listas desplegables de área, sector, posición, procedencia y localidad.</small></div>
        <button type="button" class="btn" data-cm="plantilla">Descargar plantilla</button></div>
      <div class="cm-paso"><b>2</b><div><strong>Subí la planilla completa</strong><small class="muted block">Una persona por fila. Antes de guardar vas a ver qué se carga.</small></div>
        <label class="btn btn--primary">Subir planilla<input type="file" id="cm-file" accept=".xlsx" hidden></label></div>
    </div>
    <div id="cm-preview"></div>`, { title: 'Carga masiva de candidatos', wide: true });

  const preview = root.querySelector('#cm-preview');
  const pintar = (archivo) => {
    const n = (e) => filas.filter((f) => f.estado === e).length;
    preview.innerHTML = String(html`
      <div class="cm-resumen">
        <span><b>${filas.length}</b> filas en “${archivo}”</span>
        <span class="pill pill--green">${n('ok')} ${n('ok') === 1 ? 'se carga' : 'se cargan'}</span>
        ${n('duplicado') ? html`<span class="pill pill--orange">${n('duplicado')} ${n('duplicado') === 1 ? 'ya existe' : 'ya existen'}</span>` : ''}
        ${n('error') ? html`<span class="pill pill--red">${n('error')} con error</span>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn--primary" data-cm="cargar" ${n('ok') ? '' : 'disabled'}>Cargar ${n('ok')} candidato${n('ok') === 1 ? '' : 's'}</button>
      </div>
      <div class="table-wrap"><table class="tbl tbl--compact">
        <thead><tr><th>Fila</th><th>Estado</th><th>Nombre</th><th>DNI</th><th>Área · Sector</th><th>Posición</th><th>Procedencia</th><th>Localidad</th><th>CV</th><th>Observación</th></tr></thead>
        <tbody>${filas.map((f) => html`<tr class="${f.estado === 'ok' ? '' : 'is-off'}">
          <td class="mono">${f.fila}</td>
          <td><span class="pill pill--sm pill--${ETIQ[f.estado][1]}">${ETIQ[f.estado][0]}</span></td>
          <td><b>${f.candidato.nombre || '—'}</b></td>
          <td class="mono small">${f.candidato.dni || ''}</td>
          <td class="small">${f.candidato.area || ''}${f.candidato.servicio ? ' · ' + f.candidato.servicio : ''}</td>
          <td class="small">${f.candidato.posicion || ''}</td>
          <td class="small">${f.candidato.procedencia || ''}</td>
          <td class="small">${f.candidato.localidad || ''}${f.candidato.provincia ? html`<small class="muted block">${f.candidato.provincia}${f.candidato.codigo_postal ? ' · ' + f.candidato.codigo_postal : ''}</small>` : ''}</td>
          <td class="small">${fmtDate(f.candidato.cv_recibido)}</td>
          <td class="small ${f.estado === 'error' ? 'is-late-txt' : 'muted'}">${[f.motivo, ...f.avisos].filter(Boolean).join(' · ')}</td></tr>`)}</tbody>
      </table></div>`);
  };

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-cm]')?.dataset.cm;
    if (act === 'plantilla') {
      const { downloadXlsx } = await import('../lib/xlsx.js');
      downloadXlsx(`Plantilla_carga_candidatos_EFiS_${todayISO()}.xlsx`, plantillaCargaMasiva(opcionesPlantilla(state)));
      toast('Plantilla descargada', 'ok');
    }
    if (act === 'cargar') {
      const nuevos = filas.filter((f) => f.estado === 'ok').map((f) => f.candidato);
      const b = e.target.closest('button'); b.disabled = true; b.textContent = 'Cargando…';
      let cargados = 0;
      for (let i = 0; i < nuevos.length; i += 100) {
        const { error } = await sb.from('candidates').insert(nuevos.slice(i, i + 100));
        if (error) { toast(`Se cargaron ${cargados}; error en el resto: ${error.message}`, 'error', 9000); b.disabled = false; b.textContent = 'Reintentar'; await loadAll({ silent: true }); return; }
        cargados += Math.min(100, nuevos.length - i);
      }
      toast(`${cargados} candidato${cargados === 1 ? '' : 's'} cargado${cargados === 1 ? '' : 's'}`, 'ok', 6000);
      closeDrawer();
      await loadAll({ silent: true });
    }
  });
  root.querySelector('#cm-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      filas = leerCargaMasiva(await file.arrayBuffer(), state.candidates, todayISO());
    } catch (err) { toast(err.message, 'error', 8000); return; }
    if (!filas.length) { toast('La planilla no tiene filas completas.', 'error', 6000); return; }
    pintar(file.name);
  });
}
