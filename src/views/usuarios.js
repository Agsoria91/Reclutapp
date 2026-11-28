// Usuarios: RRHH (edita y ve datos sensibles) y Lectores (supervisión/dirección,
// solo lectura, sin datos personales). Alta, nueva contraseña y baja sin entrar a Supabase.
// Lectores: solo correos @efis.com(.ar) / @tecpetrol.com(.ar) (la base también lo valida).
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { toast, confirmDialog, openDrawer, closeDrawer, opcionesDe } from '../components/ui.js';
import { mascot } from '../components/mascot.js';

// Contraseña temporal legible (sin caracteres ambiguos), generada en el navegador.
export function tempPassword(len = 14) {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = crypto.getRandomValues(new Uint32Array(len));
  return [...buf].map((n) => abc[n % abc.length]).join('');
}

export function render(el) {
  if (!state.isStaff) { el.innerHTML = String(mascot('empty', { title: 'Solo RRHH', text: 'Iniciá sesión con un usuario de RRHH.' })); return; }
  if (el._init) return;
  el._init = true;
  el.innerHTML = String(html`
    <section class="m-head"><div><h1>Usuarios</h1></div></section>
    <section class="card">
      <form id="u-form" class="form-grid">
        <label class="field"><span>Correo corporativo</span><input name="email" type="email" required autocomplete="off" placeholder="nombre@tecpetrol.com"></label>
        <label class="field"><span>Nombre</span><input name="nombre" autocomplete="off"></label>
        <fieldset class="field--wide"><legend>Rol</legend><div class="checks">
          <label class="check"><input type="radio" name="rol" value="lector" checked> <span><b>Lectura</b> — supervisión y dirección: ve posiciones, candidatos e indicadores, sin datos personales ni sueldos. No edita.</span></label>
          <label class="check"><input type="radio" name="rol" value="entrevistador"> <span><b>Entrevistador</b> — supervisores: ve y evalúa solo a los candidatos de su sector y yacimiento, sin datos personales.</span></label>
          <label class="check"><input type="radio" name="rol" value="staff"> <span><b>RRHH</b> — edita todo y ve datos sensibles, nómina y legajos.</span></label>
        </div></fieldset>
        <div class="field--wide u-alcance" hidden></div>
        <div class="form-actions field--wide"><span class="spacer"></span><button class="btn btn--primary" type="submit">Dar acceso</button></div>
      </form>
    </section>
    <section class="card"><h2 class="card-title">Entrevistadores</h2><div id="e-list">${mascot('loading', { compact: true, size: 90 })}</div></section>
    <section class="card"><h2 class="card-title">Lectura (supervisión y dirección)</h2><div id="l-list">${mascot('loading', { compact: true, size: 90 })}</div></section>
    <section class="card"><h2 class="card-title">RRHH</h2><div id="u-list">${mascot('loading', { compact: true, size: 90 })}</div></section>
    <section class="card"><h2 class="card-title">Respaldo de datos</h2>
      <p class="muted">Descarga en un archivo todas las sillas, candidatos, ternas y la nómina completa. Guardalo en el OneDrive/Drive de RRHH (contiene datos personales: no lo compartas fuera del equipo). Con ese archivo se pueden restaurar los datos si algo saliera mal.</p>
      <div class="form-actions"><button class="btn btn--primary" data-act="respaldo">Descargar respaldo</button></div>
    </section>`);
  load(el);

  el.querySelector('#u-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim().toLowerCase();
    if (!/^[^@\s]+@(tecpetrol|efis)\.com(\.ar)?$/.test(email)) { toast('Solo correos @efis.com, @efis.com.ar, @tecpetrol.com o @tecpetrol.com.ar', 'error'); return; }
    const alc = f.rol.value === 'entrevistador' ? leerAlcance(f) : null;
    if (alc && !alc.sectores.length) { toast('Elegí al menos un sector para el entrevistador.', 'error'); return; }
    await upsert(el, email, f.nombre.value.trim(), `Acceso creado para ${email}`, f.rol.value, alc);
    f.reset(); el.querySelector('.u-alcance').hidden = true;
  });
  el.querySelector('#u-form').addEventListener('change', (e) => {
    if (e.target.name !== 'rol') return;
    const box = el.querySelector('.u-alcance');
    box.hidden = e.target.value !== 'entrevistador';
    if (!box.hidden && !box.childElementCount) box.innerHTML = String(alcanceCampos());
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { email, nombre, rol } = b.dataset;
    if (b.dataset.act === 'alcance') editarAlcance(el, email);
    if (b.dataset.act === 'remove-entrev') {
      if (!(await confirmDialog(`¿Quitarle el acceso de entrevistador a ${email}? Sus evaluaciones quedan guardadas.`, { ok: 'Quitar acceso', danger: true }))) return;
      const { error } = await sb.rpc('entrevistador_remove', { p_email: email });
      if (error) return toast(error.message, 'error');
      toast('Acceso quitado', 'ok'); load(el);
    }
    if (b.dataset.act === 'reset') {
      if (!(await confirmDialog(`¿Generar una contraseña temporal nueva para ${email}? La actual deja de funcionar.`, { ok: 'Generar' }))) return;
      await upsert(el, email, nombre, `Contraseña restablecida para ${email}`, rol);
    }
    if (b.dataset.act === 'remove-lector') {
      if (!(await confirmDialog(`¿Quitarle el acceso de lectura a ${email}? No va a poder ver la app.`, { ok: 'Quitar acceso', danger: true }))) return;
      const { error } = await sb.rpc('lector_remove', { p_email: email });
      if (error) return toast(error.message, 'error');
      toast('Acceso quitado', 'ok'); load(el);
    }
    if (b.dataset.act === 'remove') {
      if (!(await confirmDialog(`¿Quitarle el acceso de RRHH a ${email}? Deja de editar y de ver datos sensibles.`, { ok: 'Quitar acceso', danger: true }))) return;
      const { error } = await sb.rpc('staff_remove', { p_email: email });
      if (error) return toast(error.message, 'error');
      toast('Acceso quitado', 'ok'); load(el);
    }
  });
}

async function upsert(el, email, nombre, title, rol = 'staff', alc = null) {
  const pass = tempPassword();
  if (rol === 'entrevistador' && !alc) alc = entrevistadores.find((x) => x.email === email) || null;
  const { error } = rol === 'entrevistador'
    ? await sb.rpc('entrevistador_upsert', { p_email: email, p_nombre: nombre || null, p_password: pass, p_sectores: alc?.sectores || [], p_yacimientos: alc?.yacimientos || [], p_puestos: alc?.puestos || [] })
    : await sb.rpc(rol === 'lector' ? 'lector_upsert' : 'staff_upsert_user', { p_email: email, p_nombre: nombre || null, p_password: pass });
  if (error) { toast(error.message, 'error'); return; }
  showPassword(title, email, pass);
  load(el);
}

function showPassword(title, email, pass) {
  const root = openDrawer(html`
    <p>Pasale estos datos a la persona por un canal privado. <b>No se van a volver a mostrar.</b></p>
    <div class="secret"><span class="muted">Usuario</span><code>${email}</code>
      <span class="muted">Contraseña temporal</span><code id="tmp-pass">${pass}</code></div>
    <p class="muted small">Entra con su correo en la página de ingreso y la cambia desde <b>Mi contraseña</b>.</p>
    <div class="form-actions"><button class="btn" data-copy>Copiar</button><span class="spacer"></span><button class="btn btn--primary" data-close>Listo</button></div>`,
  { title });
  root.querySelector('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`Usuario: ${email}\nContraseña temporal: ${pass}\n${location.origin + location.pathname}`); toast('Copiado', 'ok'); }
    catch { toast('No se pudo copiar; seleccioná el texto a mano', 'error'); }
  });
}

async function load(el) {
  loadLectores(el);
  loadEntrevistadores(el);
  const { data, error } = await sb.from('staff').select('*').order('email');
  const box = el.querySelector('#u-list');
  if (!box) return;
  if (error) { box.innerHTML = String(mascot('error', { compact: true, size: 90, text: error.message })); return; }
  const me = state.session?.user?.email?.toLowerCase();
  box.innerHTML = String(html`<ul class="user-list">${data.map((u) => html`<li>
    <span><strong>${u.nombre || u.email}</strong> <small class="muted">${u.email}</small> ${u.email === me ? html`<span class="tag">vos</span>` : ''}</span>
    <span class="user-actions">
      <button class="btn btn--ghost btn--sm" data-act="reset" data-rol="staff" data-email="${u.email}" data-nombre="${u.nombre || ''}">Nueva contraseña</button>
      ${u.email === me ? '' : html`<button class="btn btn--danger-ghost btn--sm" data-act="remove" data-email="${u.email}">Quitar acceso</button>`}
    </span></li>`)}</ul>`);
}

async function loadLectores(el) {
  const box = el.querySelector('#l-list');
  if (!box) return;
  const { data, error } = await sb.from('lectores').select('*').order('email');
  if (error) {
    box.innerHTML = String(html`<p class="note">Falta aplicar en la base el cambio de acceso corporativo (archivo 20261115001200_acceso_corporativo.sql).</p>`);
    return;
  }
  box.innerHTML = String(data.length ? html`<ul class="user-list">${data.map((u) => html`<li>
    <span><strong>${u.nombre || u.email}</strong> <small class="muted">${u.email}</small></span>
    <span class="user-actions">
      <button class="btn btn--ghost btn--sm" data-act="reset" data-rol="lector" data-email="${u.email}" data-nombre="${u.nombre || ''}">Nueva contraseña</button>
      <button class="btn btn--danger-ghost btn--sm" data-act="remove-lector" data-email="${u.email}">Quitar acceso</button>
    </span></li>`)}</ul>` : html`<p class="muted small">Todavía no diste acceso de lectura a nadie.</p>`);
}

export function openChangePassword() {
  const root = openDrawer(html`<form id="pw-form" class="form-grid">
    <label class="field field--wide"><span>Nueva contraseña</span><input name="p1" type="password" minlength="10" required autocomplete="new-password"></label>
    <label class="field field--wide"><span>Repetila</span><input name="p2" type="password" minlength="10" required autocomplete="new-password"></label>
    <p class="muted small field--wide">Mínimo 10 caracteres.</p>
    <div class="form-actions field--wide"><span class="spacer"></span><button type="button" class="btn btn--ghost" data-close>Cancelar</button><button class="btn btn--primary" type="submit">Guardar</button></div>
  </form>`, { title: 'Mi contraseña' });
  root.querySelector('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { p1, p2 } = e.target;
    if (p1.value !== p2.value) return toast('Las contraseñas no coinciden', 'error');
    const { error } = await sb.auth.updateUser({ password: p1.value });
    if (error) return toast(error.message, 'error');
    toast('Contraseña actualizada', 'ok'); closeDrawer();
  });
}

// ---------------------------------------------------------------------------
// Entrevistadores: alcance por sector (obligatorio), yacimiento y puesto (vacíos = todos)
// ---------------------------------------------------------------------------
let entrevistadores = [];

function opcionesAlcance() {
  return {
    sectores: opcionesDe(state.candidates.map((c) => c.servicio), state.positions.map((p) => p.sector)),
    yacimientos: opcionesDe(state.candidates.map((c) => c.area), state.positions.map((p) => p.yacimiento)),
    puestos: opcionesDe(state.candidates.map((c) => c.posicion)),
  };
}

function alcanceCampos(a = {}) {
  const o = opcionesAlcance();
  const marcado = (lista, v) => (lista || []).some((x) => x.toLowerCase() === v.toLowerCase());
  const grupo = (name, titulo, vals, sel) => html`<fieldset class="u-grupo"><legend>${titulo}</legend><div class="checks">
    ${vals.map((v) => html`<label class="check chip-check"><input type="checkbox" name="${name}" value="${v}" ${marcado(sel, v) ? html`checked` : ''}> ${v}</label>`)}</div></fieldset>`;
  return html`${grupo('a_sector', 'Sectores', o.sectores, a.sectores)}
    ${grupo('a_yac', 'Yacimientos (sin marcar = todos)', o.yacimientos, a.yacimientos)}
    <details class="u-puestos" ${(a.puestos || []).length ? html`open` : ''}><summary>Limitar a puestos (sin marcar = todos)</summary>${grupo('a_puesto', 'Puestos', o.puestos, a.puestos)}</details>`;
}

function leerAlcance(form) {
  const v = (n) => [...form.querySelectorAll(`input[name="${n}"]:checked`)].map((i) => i.value);
  return { sectores: v('a_sector'), yacimientos: v('a_yac'), puestos: v('a_puesto') };
}

const resumenAlcance = (u) => [u.sectores.join(', '), u.yacimientos.length ? u.yacimientos.join(', ') : 'todos los yacimientos', u.puestos.length ? u.puestos.join(', ') : ''].filter(Boolean).join(' · ');

async function loadEntrevistadores(el) {
  const box = el.querySelector('#e-list');
  if (!box) return;
  const { data, error } = await sb.from('entrevistadores').select('*').order('email');
  if (error) { box.innerHTML = String(mascot('error', { compact: true, size: 90, text: error.message })); return; }
  entrevistadores = data;
  box.innerHTML = String(data.length ? html`<ul class="user-list">${data.map((u) => html`<li>
    <span><strong>${u.nombre || u.email}</strong> <small class="muted">${u.email}</small><small class="muted block">${resumenAlcance(u)}</small></span>
    <span class="user-actions">
      <button class="btn btn--ghost btn--sm" data-act="alcance" data-email="${u.email}">Editar alcance</button>
      <button class="btn btn--ghost btn--sm" data-act="reset" data-rol="entrevistador" data-email="${u.email}" data-nombre="${u.nombre || ''}">Nueva contraseña</button>
      <button class="btn btn--danger-ghost btn--sm" data-act="remove-entrev" data-email="${u.email}">Quitar acceso</button>
    </span></li>`)}</ul>` : html`<p class="muted small">Todavía no hay entrevistadores.</p>`);
}

function editarAlcance(el, email) {
  const u = entrevistadores.find((x) => x.email === email);
  if (!u) return;
  const root = openDrawer(html`<form id="alc-form" class="form-grid">
    <label class="field field--wide"><span>Nombre</span><input name="nombre" value="${u.nombre || ''}" autocomplete="off"></label>
    <div class="field--wide">${alcanceCampos(u)}</div>
    <div class="form-actions field--wide"><span class="spacer"></span><button type="button" class="btn btn--ghost" data-close>Cancelar</button><button class="btn btn--primary" type="submit">Guardar</button></div>
  </form>`, { title: u.nombre || u.email });
  root.querySelector('#alc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = leerAlcance(e.target);
    if (!a.sectores.length) { toast('Elegí al menos un sector para el entrevistador.', 'error'); return; }
    const { error } = await sb.rpc('entrevistador_upsert', { p_email: email, p_nombre: e.target.nombre.value.trim() || null, p_password: null, p_sectores: a.sectores, p_yacimientos: a.yacimientos, p_puestos: a.puestos });
    if (error) { toast(error.message, 'error'); return; }
    toast('Alcance actualizado', 'ok'); closeDrawer(); loadEntrevistadores(el);
  });
}
