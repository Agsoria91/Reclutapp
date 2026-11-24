import '@fontsource-variable/martian-mono/standard.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/plano.css';
import './styles/iris.css';
import { html, raw, $ } from './lib/html.js';
import { sb } from './lib/supabase.js';
import { state, subscribe, refreshAuth, loadAll, set } from './lib/store.js';
import { loadLocal, saveLocal, closeDrawer, toast, animateIn } from './components/ui.js';
import { mascot } from './components/mascot.js';
import * as posiciones from './views/posiciones.js';
import * as mapa from './views/mapa.js';
import * as candidatos from './views/candidatos.js';
import * as legajos from './views/legajos.js';
import * as presentar from './views/presentar.js';
import * as importar from './views/importar.js';
import * as login from './views/login.js';
import * as usuarios from './views/usuarios.js';
import * as ingresos from './views/ingresos.js';
import * as entrevistas from './views/entrevistas.js';
import * as nomina from './views/nomina.js';
import * as historial from './views/historial.js';
import * as dashboardpj from './views/dashboardpj.js';
import * as examenes from './views/examenes.js';
import * as reunion from './views/reunion.js';
import { descargarRespaldo, diasDesdeRespaldo } from './lib/respaldo.js';
import { descargarExcel } from './lib/reporteExcel.js';
import { initFolds } from './components/folds.js';
import { icono } from './components/iconos.js';
import { initModerno } from './components/moderno.js';

const ROUTES = {
  mapa: { view: mapa, label: 'Mapa', full: true },
  posiciones: { view: posiciones, label: 'Posiciones' },
  candidatos: { view: candidatos, label: 'Candidatos' },
  entrevistas: { view: entrevistas, label: 'Entrevistas' },
  dashboardpj: { view: dashboardpj, label: 'Dashboard PJ', staff: true },
  examenes: { view: examenes, label: 'Exámenes', staff: true },
  ingresos: { view: ingresos, label: 'Ingresos', staff: true },
  legajos: { view: legajos, label: 'Legajos', staff: true },
  nomina: { view: nomina, label: 'Nómina', staff: true },
  importar: { view: importar, label: 'Importar', staff: true },
  usuarios: { view: usuarios, label: 'Usuarios', staff: true },
  presentar: { view: presentar, bare: true },
  reunion: { view: reunion, bare: true },
  historial: { view: historial, bare: true, staff: true },
  login: { view: login },
};

// ---------------------------------------------------------------------------
// Tema claro / oscuro ("HUD")
// ---------------------------------------------------------------------------
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
// Diseño de la app: estilo IRIS (guía UX BI Tecpetrol) con paleta EFiS, siempre en claro.
document.documentElement.dataset.estilo = 'iris';
applyTheme('light');
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  applyTheme(next); saveLocal('reclutapp.theme', next);
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { name: ROUTES[path] ? path : 'mapa', params: new URLSearchParams(qs || '') };
}

// Íconos de trazo (no emojis): descarga, actualizar, tema.
const ICON = {
  descarga: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/></svg>'),
  actualizar: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/></svg>'),
  tema: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11A5.5 5.5 0 0 0 8 2.5z" fill="currentColor" stroke="none"/></svg>'),
};

const app = $('#app');
// Iniciales de cada sección (navegación lateral del estilo IRIS)
const INICIALES = { mapa: 'MA', posiciones: 'PO', candidatos: 'CA', entrevistas: 'EN', dashboardpj: 'PJ', examenes: 'EX', ingresos: 'IN', legajos: 'LE', nomina: 'NO', importar: 'IM', usuarios: 'US' };
let current = { name: null, container: null };
initFolds(app, () => current.name);
initModerno(() => draw());

function shell(name) {
  const r = ROUTES[name];
  if (r.bare) return html`<main id="view" class="view view--bare"></main>`;
  const navItems = state.canRead ? Object.entries(ROUTES).filter(([, v]) => v.label && (!v.staff || state.isStaff)) : [];
  return html`
  <a href="#view" class="skip">Saltar al contenido</a>
  <header class="topbar">
    ${navItems.length ? html`<button type="button" class="menu-btn" id="btn-menu" aria-label="Abrir menú de secciones" aria-expanded="false" aria-controls="menu-secciones"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>` : ''}
    <a class="brand" href="#/mapa" aria-label="Inicio">
      <img src="./brand/efis-isologo.svg" alt="EFiS Energy Field Services" class="brand-logo brand-logo--color">
      <img src="./brand/efis-isologo-negativo.svg" alt="" aria-hidden="true" class="brand-logo brand-logo--mono">
      <span class="brand-app"><b>Reclutamiento</b></span>
    </a>
    <nav class="nav" id="menu-secciones" aria-label="Secciones">
      ${navItems.map(([k, v]) => html`<a href="#/${k}" class="${k === name ? 'is-active' : ''}" ${k === name ? html`aria-current="page"` : ''} title="${v.label}"><span class="nav-ini" aria-hidden="true">${INICIALES[k] || v.label.slice(0, 2).toUpperCase()}</span><span class="nav-ico">${icono(k)}</span><span class="nav-txt">${v.label}</span></a>`)}
    </nav>
    <div class="topbar-right">
      ${state.canRead ? html`<button class="btn btn--sm btn--excel" id="btn-excel" title="${state.isStaff ? 'Descargar todo en Excel (incluye nómina y datos personales)' : 'Descargar resumen en Excel (sin datos personales)'}">${ICON.descarga} Excel</button>
      <button class="icon-btn" id="btn-refresh" title="Actualizar datos" aria-label="Actualizar datos">${ICON.actualizar}</button>` : ''}
      <button class="icon-btn" id="btn-theme" title="Tema claro / oscuro" aria-label="Cambiar tema">${ICON.tema}</button>
      ${state.session
        ? html`<span class="user ${state.canRead ? '' : 'user--warn'}" title="${state.session.user.email}">${state.isStaff ? 'RRHH' : state.canRead ? 'Lectura' : 'Sin permisos'} · ${state.session.user.email.split('@')[0]}</span>
               ${state.canRead ? html`<button class="btn btn--ghost btn--sm" id="btn-pass">Mi contraseña</button>` : ''}
               <button class="btn btn--ghost btn--sm" id="btn-logout">Salir</button>`
        : ''}
    </div>
  </header>
  <div class="menu-velo" data-menu-cerrar></div>
  ${state.canRead && !state.isStaff && name !== 'login' ? html`<div class="public-banner">Vista de lectura · sin datos personales ni sueldos. Uso interno EFiS / Tecpetrol.</div>` : ''}
  ${state.isStaff && (diasDesdeRespaldo() == null || diasDesdeRespaldo() >= 7) ? html`<div class="backup-banner">
    ${diasDesdeRespaldo() == null ? 'Todavía no descargaste un respaldo desde esta computadora.' : `Hace ${diasDesdeRespaldo()} días que no descargás un respaldo.`}
    Conviene guardar uno por semana en el OneDrive/Drive de RRHH.
    <button class="btn btn--sm" data-act="respaldo">Descargar respaldo</button></div>` : ''}
  <main id="view" class="view ${r.full ? 'view--mapa' : ''}" tabindex="-1"></main>
  <footer class="foot"><span>EFiS · Energy Field Services — Recursos Humanos</span><span>Cuenca Neuquina · 38°57′S 68°04′O</span></footer>`;
}

function route() {
  const { name, params } = parseHash();
  const r = ROUTES[name];
  // Todo requiere cuenta corporativa habilitada; las pantallas de RRHH, además, rol RRHH.
  if (state.authChecked && name !== 'login' && (!state.canRead || (r.staff && !state.isStaff))) { location.hash = '#/login'; return; }
  closeDrawer();
  app.innerHTML = String(shell(name));
  const container = $('#view');
  current = { name, container, params };
  document.title = `${r.label || ({ presentar: 'Mapa de posiciones', historial: 'Historial de silla', reunion: 'Modo reunión' }[name] || 'Ingreso')} · Reclutamiento EFiS`;
  draw();
  document.documentElement.classList.remove('menu-abierto');
  $('#btn-menu')?.addEventListener('click', (e) => {
    const abierto = document.documentElement.classList.toggle('menu-abierto');
    e.currentTarget.setAttribute('aria-expanded', String(abierto));
    if (abierto) document.querySelector('#menu-secciones a.is-active, #menu-secciones a')?.focus();
  });
  const cerrarMenu = () => document.documentElement.classList.remove('menu-abierto');
  document.querySelector('[data-menu-cerrar]')?.addEventListener('click', cerrarMenu);
  $('#menu-secciones')?.addEventListener('click', (e) => { if (e.target.closest('a')) cerrarMenu(); });
  $('#btn-theme')?.addEventListener('click', toggleTheme);
  $('#btn-refresh')?.addEventListener('click', () => loadAll());
  $('#btn-logout')?.addEventListener('click', async () => { await sb.auth.signOut(); });
  $('#btn-pass')?.addEventListener('click', () => usuarios.openChangePassword());
  $('#btn-excel')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Armando…';
    try { const n = await descargarExcel(); toast(`Excel descargado: ${n} hojas`, 'ok'); }
    catch (err) { console.error(err); toast('No se pudo armar el Excel: ' + err.message, 'error', 6000); }
    b.disabled = false; b.innerHTML = `${ICON.descarga} Excel`;
  });
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
window.addEventListener('scroll', () => document.documentElement.classList.toggle('con-scroll', window.scrollY > 24), { passive: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.documentElement.classList.contains('menu-abierto')) { document.documentElement.classList.remove('menu-abierto'); document.getElementById('btn-menu')?.focus(); } });

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
      toast(state.canRead ? `Hola, ${session.user.email}` : 'Tu cuenta no está habilitada. Pedile acceso a RRHH.', state.canRead ? 'ok' : 'error', 5000);
      if (state.canRead && parseHash().name === 'login') location.hash = '#/posiciones';
    }
    if (event === 'SIGNED_OUT') location.hash = '#/login';
    route();
    await loadAll();
  });
}
boot();
