import { html } from '../lib/html.js';
import { sb } from '../lib/supabase.js';
import { state } from '../lib/store.js';
import { toast } from '../components/ui.js';
import { mascotSVG } from '../components/mascot.js';

const CORPORATIVO = /^[^@\s]+@(tecpetrol|efis)\.com(\.ar)?$/i;

export function render(el) {
  if (state.session && state.canRead) { location.hash = '#/posiciones'; return; }
  el.innerHTML = String(html`<section class="login card">
    <div class="login-art">${mascotSVG('loading', 150)}</div>
    <h1>Reclutamiento EFiS</h1>
    <p class="muted">Acceso solo con cuenta corporativa <b>@efis.com</b>, <b>@efis.com.ar</b>, <b>@tecpetrol.com</b> o <b>@tecpetrol.com.ar</b>. Las cuentas las crea RRHH: si necesitás entrar, pedile acceso a Recursos Humanos.</p>
    ${state.session && !state.canRead ? html`<p class="note">La cuenta <b>${state.session.user.email}</b> no está habilitada. Pedile acceso a RRHH, o salí e ingresá con otra cuenta.</p>` : ''}
    <form id="login-form" class="form-grid">
      <label class="field field--wide"><span>Correo corporativo</span><input name="email" type="email" required autocomplete="username" placeholder="nombre.apellido@efis.com"></label>
      <label class="field field--wide"><span>Contraseña</span><input name="password" type="password" required autocomplete="current-password"></label>
      <div class="form-actions field--wide">
        <span class="spacer"></span>
        <button type="submit" class="btn btn--primary">Ingresar</button>
      </div>
    </form>
    <p class="muted small">¿No tenés contraseña o la olvidaste? Pedile a RRHH que te genere una nueva desde <b>Usuarios</b>.</p>
  </section>`);

  const form = el.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    if (!password) return toast('Ingresá la contraseña', 'error');
    if (!CORPORATIVO.test(email)) return toast('Usá tu correo corporativo de EFiS o Tecpetrol (.com o .com.ar)', 'error');
    const btn = e.submitter; btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) return toast(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message, 'error');
  });
}
