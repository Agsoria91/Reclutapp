import './styles/tokens.css';
import './styles/app.css';
import { html, $ } from './lib/html.js';
import { sb } from './lib/supabase.js';
import { state, subscribe, refreshAuth, loadAll, set } from './lib/store.js';
import { loadLocal, saveLocal, closeDrawer, toast, animateIn } from './components/ui.js';
import { mascot } from './components/mascot.js';
import * as posiciones from './views/posiciones.js';
import * as candidatos from './views/candidatos.js';
import * as legajos from './views/legajos.js';
import * as presentar from './views/presentar.js';
import * as importar from './views/importar.js';
import * as login from './views/login.js';
import * as usuarios from './views/usuarios.js';
import * as ingresos from './views/ingresos.js';
import * as entrevistas from './views/entrevistas.js';
import * as nomina from './views/nomina.js';
import { descargarRespaldo, diasDesdeRespaldo } from './lib/respaldo.js';

const ROUTES = {
  posiciones: { view: posiciones, label: 'Posiciones' },
  candidatos: { view: candidatos, label: 'Candidatos' },
  entrevistas: { view: entrevistas, label: 'Entrevistas' },
  ingresos: { view: ingresos, label: 'Ingresos', staff: true },
  legajos: { view: legajos, label: 'Legajos', staff: true },
  nomina: { view: nomina, label: 'Nómina', staff: true },
  importar: { view: importar, label: 'Importar', staff: true },
  usuarios: { view: usuarios, label: 'Usuarios', staff: true },
  presentar: { view: presentar, bare: true },
  login: { view: login },
};

// ---------------------------------------------------------------------------
// Tema claro / oscuro ("HUD")
// ---------------------------------------------------------------------------
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme(loadLocal('reclutapp.theme', null));
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  applyTheme(next); saveLocal('reclutapp.theme', next);
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { name: ROUTES[path] ? path : 'posiciones', params: new URLSearchParams(qs || '') };
}

const app = $('#app');
let current = { name: null, container: null };

function shell(name) {
  const r = ROUTES[name];
  if (r.bare) return html`<main id="view" class="view view--bare"></main>`;
  const navItems = Object.entries(ROUTES).filter(([, v]) => v.label && (!v.staff || state.isStaff));
  return html`
  <a href="#view" class="skip">Saltar al contenido</a>
  <header class="topbar">
    <a class="brand" href="#/posiciones" aria-label="Inicio">
      <img src="./brand/efis-isologo.svg" alt="EFiS Energy Field Services" class="brand-logo brand-logo--color">
      <img src="./brand/efis-isologo-negativo.svg" alt="" aria-hidden="true" class="brand-logo brand-logo--mono">
      <span class="brand-app"><b>Reclutamiento</b></span>
    </a>
    <nav class="nav" aria-label="Secciones">
      ${navItems.map(([k, v]) => html`<a href="#/${k}" class="${k === name ? 'is-active' : ''}" ${k === name ? html`aria-current="page"` : ''}>${v.label}</a>`)}
    </nav>
    <div class="topbar-right">
      <button class="icon-btn" id="btn-refresh" title="Actualizar datos" aria-label="Actualizar datos">⟳</button>
      <button class="icon-btn" id="btn-theme" title="Tema claro / oscuro" aria-label="Cambiar tema">◐</button>
      ${state.session
        ? html`<span class="user ${state.isStaff ? '' : 'user--warn'}" title="${state.session.user.email}">${state.isStaff ? 'RRHH' : 'Sin permisos'} · ${state.session.user.email.split('@')[0]}</span>
               ${state.isStaff ? html`<button class="btn btn--ghost btn--sm" id="btn-pass">Mi contraseña</button>` : ''}
               <button class="btn btn--ghost btn--sm" id="btn-logout">Salir</button>`
        : html`<a class="btn btn--sm" href="#/login">Ingresar RRHH</a>`}
    </div>
  </header>
  ${!state.isStaff && name !== 'login' ? html`<div class="public-banner">Vista pública · solo lectura, sin datos personales ni sueldos.</div>` : ''}
  ${state.isStaff && (diasDesdeRespaldo() == null || diasDesdeRespaldo() >= 7) ? html`<div class="backup-banner">
    ${diasDesdeRespaldo() == null ? 'Todavía no descargaste un respaldo desde esta computadora.' : `Hace ${diasDesdeRespaldo()} días que no descargás un respaldo.`}
    Conviene guardar uno por semana en el OneDrive/Drive de RRHH.
    <button class="btn btn--sm" data-act="respaldo">Descargar respaldo</button></div>` : ''}
  <main id="view" class="view" tabindex="-1"></main>
  <footer class="foot">EFiS · Energy Field Services · Recursos Humanos</footer>`;
}

function route() {
  const { name, params } = parseHash();
  const r = ROUTES[name];
  if (r.staff && state.authChecked && !state.isStaff) { location.hash = '#/login'; return; }
  closeDrawer();
  app.innerHTML = String(shell(name));
  const container = $('#view');
  current = { name, container, params };
  document.title = `${r.label || (name === 'presentar' ? 'Mapa de posiciones' : 'Ingreso')} · Reclutamiento EFiS`;
  draw();
  $('#btn-theme')?.addEventListener('click', toggleTheme);
  $('#btn-refresh')?.addEventListener('click', () => loadAll());
  $('#btn-logout')?.addEventListener('click', async () => { await sb.auth.signOut(); });
  $('#btn-pass')?.addEventListener('click', () => usuarios.openChangePassword());
  document.querySelectorAll('[data-act="respaldo"]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'Preparando…';
    try {
      const c = await descargarRespaldo();
      toast(`Respaldo descargado: ${c.nomina} personas, ${c.candidates} candidatos, ${c.positions} sillas`, 'ok', 6000);
      route();
    } catch (e) { toast(e.message, 'error'); b.disabled = false; b.textContent = 'Descargar respaldo'; }
  }));
}

function draw() {
  if (!current.container) return;
  const scroll = window.scrollY;
  const active = document.activeElement?.id;
  try {
    ROUTES[current.name].view.render(current.container, current.params);
    animateIn(current.container);
  } catch (e) {
    console.error(e);
    current.container.innerHTML = String(mascot('error', { text: e.message }));
  }
  if (active && !document.activeElement?.id) document.getElementById(active)?.focus?.();
  window.scrollTo(0, scroll);
}

subscribe(() => draw());
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });

// Re-leer al volver a la pestaña (otra persona pudo haber editado).
let lastFocusLoad = 0;
window.addEventListener('focus', () => {
  if (Date.now() - lastFocusLoad > 30000 && !document.querySelector('.drawer-root')) { lastFocusLoad = Date.now(); loadAll({ silent: true }); }
});

async function boot() {
  app.innerHTML = String(html`<div class="boot">${mascot('loading')}</div>`);
  await refreshAuth();
  route();
  await loadAll();
  let lastUser = state.session?.user?.id || null;
  sb.auth.onAuthStateChange(async (event, session) => {
    const uid = session?.user?.id || null;
    if (uid === lastUser && event !== 'SIGNED_OUT') return;
    lastUser = uid;
    await refreshAuth();
    set({ positions: [], candidates: [], hires: [], nomina: [], loading: true }); // nunca mezclar datos de sesiones distintas
    if (event === 'SIGNED_IN') {
      toast(state.isStaff ? `Hola, ${session.user.email}` : 'Tu usuario no está habilitado como RRHH', state.isStaff ? 'ok' : 'error', 5000);
      if (state.isStaff && parseHash().name === 'login') location.hash = '#/posiciones';
    }
    if (event === 'SIGNED_OUT' && ROUTES[parseHash().name].staff) location.hash = '#/posiciones';
    route();
    await loadAll();
  });
}
boot();
