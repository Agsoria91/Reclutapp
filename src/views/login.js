import { html, raw } from '../lib/html.js';
import { sb } from '../lib/supabase.js';
import { state } from '../lib/store.js';
import { toast } from '../components/ui.js';
import { YACIMIENTOS } from '../data/yacimientos.js';

const CORPORATIVO = /^[^@\s]+@(tecpetrol|efis)\.com(\.ar)?$/i;

export function render(el) {
  if (state.session && state.canRead) { location.hash = '#/posiciones'; return; }
  el.innerHTML = String(html`<div class="login-fondo">${fondoVacaMuerta()}
  <section class="login card">
    <img src="./brand/efis-isologo.svg" alt="EFiS Energy Field Services" class="login-logo brand-logo--color">
    <img src="./brand/efis-isologo-negativo.svg" alt="" aria-hidden="true" class="login-logo brand-logo--mono">
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
  </section></div>`);

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

// Fondo: curvas de nivel y los yacimientos de EFiS ubicados en su posición real (Cuenca Neuquina)
function fondoVacaMuerta() {
  const [lo0, lo1, la0, la1] = [-70.4, -67.2, -39.4, -37.0];
  const x = (lon) => ((lon - lo0) / (lo1 - lo0)) * 1600;
  const y = (lat) => ((la1 - lat) / (la1 - la0)) * 1000;
  const curvas = Array.from({ length: 9 }, (_, i) => {
    const r = 120 + i * 95, cx = 760, cy = 470, k = 1 + i * 0.04;
    return `<path d="M${cx - r * 1.5} ${cy} C ${cx - r * 1.4} ${cy - r * 0.95 * k}, ${cx + r * 0.6} ${cy - r * 1.1}, ${cx + r * 1.45} ${cy - r * 0.2} S ${cx + r * 0.9} ${cy + r * 1.05 * k}, ${cx - r * 0.2} ${cy + r * 0.9} S ${cx - r * 1.6} ${cy + r * 0.4}, ${cx - r * 1.5} ${cy}"/>`;
  }).join('');
  const puntos = YACIMIENTOS.filter((yy) => yy.lon && yy.lat).map((yy) => `<g transform="translate(${x(yy.lon).toFixed(0)} ${y(yy.lat).toFixed(0)})"><circle r="5"/><circle class="lf-halo" r="14"/><text x="12" y="4">${yy.codigo}</text></g>`).join('');
  return html`<svg class="login-mapa" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="lf-curvas">${raw(curvas)}</g><g class="lf-puntos">${raw(puntos)}</g></svg>`;
}
