import { html } from '../lib/html.js';
import { sb } from '../lib/supabase.js';
import { state } from '../lib/store.js';
import { toast } from '../components/ui.js';
import { mascotSVG } from '../components/mascot.js';

export function render(el) {
  if (state.session && state.isStaff) { location.hash = '#/posiciones'; return; }
  el.innerHTML = String(html`<section class="login card">
    <div class="login-art">${mascotSVG('loading', 150)}</div>
    <h1>Ingreso RRHH</h1>
    <p class="muted">Para editar, ver datos de contacto, básicos, CVs y legajos. Supervisión y dirección no necesitan usuario: el mapa de posiciones y los indicadores son públicos.</p>
    ${state.session && !state.isStaff ? html`<p class="note">El usuario <b>${state.session.user.email}</b> no está habilitado como RRHH. Pedile a un administrador que lo agregue, o ingresá con otra cuenta.</p>` : ''}
    <form id="login-form" class="form-grid">
      <label class="field field--wide"><span>Email</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="field field--wide"><span>Contraseña</span><input name="password" type="password" autocomplete="current-password"></label>
      <div class="form-actions field--wide">
        <button type="button" class="btn btn--ghost" data-act="magic">Mandarme un link</button>
        <span class="spacer"></span>
        <button type="submit" class="btn btn--primary">Ingresar</button>
      </div>
    </form>
    <p class="muted small">¿Sin contraseña? Con "Mandarme un link" te llega un acceso por mail (solo para cuentas ya creadas).</p>
  </section>`);

  const form = el.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    if (!password) return toast('Ingresá la contraseña o pedí un link', 'error');
    const btn = e.submitter; btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) return toast(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message, 'error');
  });
  el.querySelector('[data-act="magic"]').addEventListener('click', async () => {
    const email = form.email.value.trim().toLowerCase();
    if (!form.email.checkValidity() || !email) return toast('Escribí tu email primero', 'error');
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) return toast(error.message, 'error');
    toast('Listo: revisá tu correo y abrí el link', 'ok', 6000);
  });
}
