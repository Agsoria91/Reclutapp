// Usuarios de RRHH: alta, restablecer contraseña y quitar acceso, sin entrar a Supabase.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { toast, confirmDialog, openDrawer, closeDrawer } from '../components/ui.js';
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
    <section class="page-head"><div><h1>Usuarios RRHH</h1>
      <p class="muted">Quiénes pueden editar y ver datos sensibles. Al dar de alta a alguien se genera una contraseña temporal: pasásela por un canal privado y que la cambie al entrar (menú <b>Mi contraseña</b>).</p></div></section>
    <section class="card">
      <form id="u-form" class="form-grid">
        <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="off"></label>
        <label class="field"><span>Nombre</span><input name="nombre" autocomplete="off"></label>
        <div class="form-actions field--wide"><span class="spacer"></span><button class="btn btn--primary" type="submit">Dar acceso</button></div>
      </form>
    </section>
    <section class="card"><h2 class="card-title">Con acceso</h2><div id="u-list">${mascot('loading', { compact: true, size: 90 })}</div></section>`);
  load(el);

  el.querySelector('#u-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim().toLowerCase();
    await upsert(el, email, f.nombre.value.trim(), `Acceso creado para ${email}`);
    f.reset();
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { email, nombre } = b.dataset;
    if (b.dataset.act === 'reset') {
      if (!(await confirmDialog(`¿Generar una contraseña temporal nueva para ${email}? La actual deja de funcionar.`, { ok: 'Generar' }))) return;
      await upsert(el, email, nombre, `Contraseña restablecida para ${email}`);
    }
    if (b.dataset.act === 'remove') {
      if (!(await confirmDialog(`¿Quitarle el acceso de RRHH a ${email}? Va a ver solo la vista pública.`, { ok: 'Quitar acceso', danger: true }))) return;
      const { error } = await sb.rpc('staff_remove', { p_email: email });
      if (error) return toast(error.message, 'error');
      toast('Acceso quitado', 'ok'); load(el);
    }
  });
}

async function upsert(el, email, nombre, title) {
  const pass = tempPassword();
  const { error } = await sb.rpc('staff_upsert_user', { p_email: email, p_nombre: nombre || null, p_password: pass });
  if (error) { toast(error.message, 'error'); return; }
  showPassword(title, email, pass);
  load(el);
}

function showPassword(title, email, pass) {
  const root = openDrawer(html`
    <p>Pasale estos datos a la persona por un canal privado. <b>No se van a volver a mostrar.</b></p>
    <div class="secret"><span class="muted">Usuario</span><code>${email}</code>
      <span class="muted">Contraseña temporal</span><code id="tmp-pass">${pass}</code></div>
    <p class="muted small">Entra por <b>Ingresar RRHH</b> y la cambia desde <b>Mi contraseña</b>.</p>
    <div class="form-actions"><button class="btn" data-copy>Copiar</button><span class="spacer"></span><button class="btn btn--primary" data-close>Listo</button></div>`,
  { title });
  root.querySelector('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`Usuario: ${email}\nContraseña temporal: ${pass}\n${location.origin + location.pathname}`); toast('Copiado', 'ok'); }
    catch { toast('No se pudo copiar; seleccioná el texto a mano', 'error'); }
  });
}

async function load(el) {
  const { data, error } = await sb.from('staff').select('*').order('email');
  const box = el.querySelector('#u-list');
  if (!box) return;
  if (error) { box.innerHTML = String(mascot('error', { compact: true, size: 90, text: error.message })); return; }
  const me = state.session?.user?.email?.toLowerCase();
  box.innerHTML = String(html`<ul class="user-list">${data.map((u) => html`<li>
    <span><strong>${u.nombre || u.email}</strong> <small class="muted">${u.email}</small> ${u.email === me ? html`<span class="tag">vos</span>` : ''}</span>
    <span class="user-actions">
      <button class="btn btn--ghost btn--sm" data-act="reset" data-email="${u.email}" data-nombre="${u.nombre || ''}">Nueva contraseña</button>
      ${u.email === me ? '' : html`<button class="btn btn--danger-ghost btn--sm" data-act="remove" data-email="${u.email}">Quitar acceso</button>`}
    </span></li>`)}</ul>`);
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
