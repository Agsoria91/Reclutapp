// Próximos ingresos: todo lo que está en "Próximo ingreso" pasa por acá para
// completar los datos faltantes (CUIL, domicilio, talles, etc.) y confirmar el
// ingreso. Al confirmar, la silla pasa a Ingresado y el legajo se crea con
// todos esos datos.
import { html } from '../lib/html.js';
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { fmtDate, todayISO, norm } from '../lib/format.js';
import { kpi, openDrawer, closeDrawer, toast, formData, field, confirmDialog, stagePill, animateIn } from '../components/ui.js';
import { mascot } from '../components/mascot.js';
import { preingresoFields, preingresoProgress } from '../components/ingreso.js';
import { celebrate } from './posiciones.js';
import { openAssignFromCandidate } from './asignar.js';

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Iniciá sesión con un usuario de RRHH.' })); return; }
  if (state.loading && !state.positions.length) { el.innerHTML = String(mascot('loading')); return; }

  const byId = new Map(state.candidates.map((c) => [c.id, c]));
  const sillas = state.positions.filter((p) => p.stage === 'proximo_ingreso')
    .map((p) => ({ p, c: p.candidate_id ? byId.get(p.candidate_id) : null }))
    .map((x) => ({ ...x, prog: preingresoProgress(x.c) }))
    .sort((a, b) => (a.p.fecha_ingreso || '9999').localeCompare(b.p.fecha_ingreso || '9999') || a.prog.done - b.prog.done);
  const sinSilla = state.candidates.filter((c) => c.stage === 'proximo_ingreso' && !c._silla);
  const completos = sillas.filter((x) => x.c && !x.prog.missing.length).length;

  el.innerHTML = String(html`
  <section class="page-head"><div><h1>Próximos ingresos</h1>
    <p class="muted">Todo lo que está en <b>Próximo ingreso</b>. Completá los datos de alta y confirmá el ingreso: la silla pasa a Ingresado y el legajo se crea con todo lo cargado.</p></div></section>
  <section class="kpis kpis--6">
    ${kpi('Próximos ingresos', sillas.length + sinSilla.length, { tone: 'blue', big: true, id: 'pi-tot' })}
    ${kpi('Datos completos', completos, { tone: 'green', id: 'pi-ok' })}
    ${kpi('Con datos faltantes', sillas.length - completos, { tone: 'orange', id: 'pi-falta' })}
    ${kpi('Sin silla asignada', sinSilla.length, { tone: sinSilla.length ? 'red' : '', id: 'pi-sin' })}
  </section>
  ${sillas.length ? html`<section class="ing-grid">${sillas.map(({ p, c, prog }) => card(p, c, prog))}</section>`
    : mascot('empty', { title: 'Nadie en Próximo ingreso', text: 'Cuando una silla pase a "Próximo ingreso" va a aparecer acá.' })}
  ${sinSilla.length ? html`<section class="card"><h2 class="card-title">En Próximo ingreso sin silla</h2>
    <ul class="user-list">${sinSilla.map((c) => html`<li><span><strong>${c.nombre}</strong> <small class="muted">${[c.area, c.servicio, c.posicion].filter(Boolean).join(' · ')}</small></span>
      <button class="btn btn--sm btn--primary" data-act="seat" data-cid="${c.id}">Sentar en una silla</button></li>`)}</ul></section>` : ''}
  `);
  animateIn(el);

  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const p = state.positions.find((x) => x.id === b.dataset.pid);
      const c = state.candidates.find((x) => x.id === (b.dataset.cid || p?.candidate_id));
      if (b.dataset.act === 'edit') openForm(p, c);
      if (b.dataset.act === 'confirm') confirmIngreso(p, c);
      if (b.dataset.act === 'seat') { openAssignFromCandidate(c); }
      if (b.dataset.act === 'ficha') crearFicha(p);
    });
  }
}

function card(p, c, prog) {
  const pct = Math.round((prog.done / prog.total) * 100);
  return html`<article class="card ing-card">
    <header class="ing-head">
      <div><strong class="ing-name">${p.candidato_nombre || 'Sin nombre'}</strong>
        <small class="muted block">${p.puesto} · ${p.yacimiento} · ${p.sector || ''}</small></div>
      ${stagePill(p.stage, { small: true })}
    </header>
    <div class="ing-meta">
      <span>Ingreso: <b>${p.fecha_ingreso ? fmtDate(p.fecha_ingreso) : 'a definir'}</b></span>
      <span class="muted">${[p.procedencia, p.localidad].filter(Boolean).join(' · ')}</span>
    </div>
    ${c ? html`
      <div class="ing-progress" title="${prog.done} de ${prog.total} datos">
        <span class="progress"><span style="width:${pct}%"></span></span><small>${prog.done}/${prog.total}</small>
      </div>
      ${prog.missing.length ? html`<p class="small muted">Falta: ${prog.missing.join(', ')}</p>` : html`<p class="small ok-txt">Datos completos ✓</p>`}
      <div class="form-actions">
        <button class="btn btn--sm" data-act="edit" data-pid="${p.id}">Completar datos</button>
        <span class="spacer"></span>
        <button class="btn btn--sm btn--primary" data-act="confirm" data-pid="${p.id}">Confirmar ingreso</button>
      </div>`
    : html`<p class="note small">Esta silla tiene el nombre cargado a mano, sin ficha. Creá la ficha para poder cargar sus datos de alta.</p>
      <div class="form-actions"><span class="spacer"></span><button class="btn btn--sm btn--primary" data-act="ficha" data-pid="${p.id}">Crear ficha</button></div>`}
  </article>`;
}

function openForm(p, c) {
  const root = openDrawer(html`<form id="ing-form" class="form-grid">
    <p class="field--wide muted">${p.puesto} · ${p.yacimiento} · ${p.sector || ''}</p>
    ${field('Fecha de ingreso', 'fecha_ingreso', p.fecha_ingreso, { type: 'date', hint: 'Se guarda en la silla.' })}
    ${preingresoFields(c)}
    <div class="form-actions field--wide"><span class="spacer"></span>
      <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
      <button type="submit" class="btn btn--primary">Guardar</button></div>
  </form>`, { title: `Datos de alta · ${c.nombre}`, wide: true });
  root.querySelector('#ing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    const fechaIngreso = data.fecha_ingreso;
    delete data.fecha_ingreso;
    const r1 = await sb.from('candidates').update(data).eq('id', c.id);
    if (r1.error) return toast(r1.error.message, 'error');
    if (fechaIngreso !== (p.fecha_ingreso || null)) {
      const r2 = await sb.from('positions').update({ fecha_ingreso: fechaIngreso }).eq('id', p.id);
      if (r2.error) return toast(r2.error.message, 'error');
    }
    toast('Datos guardados', 'ok'); closeDrawer(); loadAll({ silent: true });
  });
}

async function confirmIngreso(p, c) {
  // leer de la base la fecha recién cargada (no confiar en lo que haya en pantalla)
  const fresh = await sb.from('positions').select('fecha_ingreso').eq('id', p.id).single();
  const fresca = await sb.from('candidates').select('*').eq('id', c.id).single();
  if (!fresca.error) c = fresca.data;
  const prog = preingresoProgress(c);
  const fecha = fresh.data?.fecha_ingreso || todayISO();
  const msg = prog.missing.length
    ? `Faltan datos de ${c.nombre}: ${prog.missing.join(', ')}. ¿Confirmar el ingreso igual (el ${fmtDate(fecha)})? Después se pueden completar en Legajos.`
    : `¿Confirmar el ingreso de ${c.nombre} el ${fmtDate(fecha)}? Se crea su legajo.`;
  if (!(await confirmDialog(msg, { ok: 'Confirmar ingreso' }))) return;
  const { error } = await sb.from('positions').update({ stage: 'ingresado', fecha_ingreso: fecha }).eq('id', p.id);
  if (error) return toast(error.message, 'error');
  toast(`¡${c.nombre} ingresó! Legajo creado.`, 'ok', 5000);
  await loadAll({ silent: true });
  celebrate();
}

// ¿Ya existe una ficha para esta persona con el nombre escrito distinto?
// (todas las palabras de uno están en el otro: "Albrecht Kenny" ~ "Albrecht Kenny Natanael")
function similares(nombre) {
  const toks = (s) => norm(s).split(/\s+/).filter((t) => t.length > 1);
  const a = toks(nombre);
  return state.candidates.filter((c) => {
    if (c.stage === 'cancelado' || c._silla) return false;
    const b = toks(c.nombre);
    const small = a.length <= b.length ? a : b;
    const big = new Set(a.length <= b.length ? b : a);
    return small.length >= 2 && small.every((t) => big.has(t));
  });
}

async function crearFicha(p) {
  const posibles = similares(p.candidato_nombre);
  for (const c of posibles) {
    if (await confirmDialog(`Ya existe la ficha de "${c.nombre}" (${[c.area, c.procedencia, c.localidad].filter(Boolean).join(' · ')}). ¿Es la misma persona? Si es así la vinculo a "${p.puesto}" en lugar de crear una nueva.`, { ok: 'Sí, vincular', cancel: 'No, es otra' })) {
      const r = await sb.rpc('assign_candidate', { p_candidate: c.id, p_position: p.id, p_force: true });
      if (r.error) return toast(r.error.message, 'error');
      toast('Ficha vinculada', 'ok');
      return loadAll({ silent: true });
    }
  }
  if (!(await confirmDialog(`¿Crear la ficha de ${p.candidato_nombre} y vincularla a "${p.puesto}"?`, { ok: 'Crear ficha' }))) return;
  const { data, error } = await sb.from('candidates').insert({
    nombre: p.candidato_nombre, area: p.yacimiento, servicio: p.sector, posicion: p.puesto,
    procedencia: p.procedencia, localidad: p.localidad, stage: p.stage, listo_ingreso: true, entrevista_ok: true,
  }).select('id').single();
  if (error) return toast(error.message, 'error');
  const r = await sb.rpc('assign_candidate', { p_candidate: data.id, p_position: p.id, p_force: true });
  if (r.error) return toast(r.error.message, 'error');
  toast('Ficha creada y vinculada', 'ok');
  await loadAll({ silent: true });
}
