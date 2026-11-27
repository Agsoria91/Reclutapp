import './styles/tokens.css';
import './styles/app.css';
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
import { abrirBuscador, initBuscador } from './components/buscador.js';
import * as agenda from './views/agenda.js';
import { initCumples } from './components/cumples.js';
import { initTarjetaFlotante } from './components/tarjetaFlotante.js';
import { campanaHtml, campanaLista, irA } from './components/paraHoy.js';
import { pintarYacimientos } from './lib/coloresYac.js';
import { initDetalleGrafico } from './components/detalleGrafico.js';
import { initModerno } from './components/moderno.js';

const ROUTES = {
  mapa: { view: mapa, label: 'Mapa', full: true },
  posiciones: { view: posiciones, label: 'Posiciones' },
  candidatos: { view: candidatos, label: 'Candidatos' },
  entrevistas: { view: entrevistas, label: 'Entrevistas' },
  agenda: { view: agenda, label: 'Agenda', staff: true },
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
// Diseño de la app: estilo IRIS (guía UX BI Tecpetrol) con paleta EFiS; claro por defecto,
// oscuro si la persona lo eligió con el botón de tema.
document.documentElement.dataset.estilo = 'iris';
// tema elegido: claro, oscuro o automático (sigue al sistema y cambia solo)
const temaPreferido = () => { const t = loadLocal('reclutapp.theme', 'light'); return ['light', 'dark', 'auto'].includes(t) ? t : 'light'; };
const oscuroSistema = matchMedia('(prefers-color-scheme: dark)');
const aplicarTema = () => { const t = temaPreferido(); applyTheme(t === 'auto' ? (oscuroSistema.matches ? 'dark' : 'light') : t); };
aplicarTema();
oscuroSistema.addEventListener?.('change', () => { if (temaPreferido() === 'auto') aplicarTema(); });
const TEMA_TXT = { light: 'claro', dark: 'oscuro', auto: 'automático (según el sistema)' };
document.documentElement.classList.toggle('compacto', loadLocal('reclutapp.compacto', false) === true);
function toggleTheme(e) {
  const orden = ['light', 'dark', 'auto'];
  const next = orden[(orden.indexOf(temaPreferido()) + 1) % orden.length];
  saveLocal('reclutapp.theme', next); aplicarTema();
  const b = e?.currentTarget;
  if (b) { b.title = `Tema: ${TEMA_TXT[next]}`; b.classList.toggle('is-auto', next === 'auto'); }
  toast(`Tema ${TEMA_TXT[next]}`, 'ok', 1800);
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { name: ROUTES[path] ? path : 'posiciones', params: new URLSearchParams(qs || '') };
}

// Íconos de trazo (no emojis): descarga, actualizar, tema.
const ICON = {
  descarga: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/></svg>'),
  actualizar: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/></svg>'),
  tema: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11A5.5 5.5 0 0 0 8 2.5z" fill="currentColor" stroke="none"/></svg>'),
};

const app = $('#app');
// Secciones agrupadas en la barra lateral
const GRUPOS = [
  ['Cobertura', ['posiciones', 'mapa', 'candidatos']],
  ['Proceso', ['agenda', 'entrevistas', 'examenes', 'ingresos']],
  ['Dotación', ['nomina', 'legajos', 'dashboardpj']],
  ['Administración', ['importar', 'usuarios']],
];
const lateralCorto = () => loadLocal('reclutapp.lateral.corto', false) === true;
// Iniciales de cada sección (navegación lateral del estilo IRIS)
const INICIALES = { mapa: 'MA', posiciones: 'PO', candidatos: 'CA', entrevistas: 'EN', dashboardpj: 'PJ', examenes: 'EX', ingresos: 'IN', legajos: 'LE', nomina: 'NO', importar: 'IM', usuarios: 'US' };
let current = { name: null, container: null };
initFolds(app, () => current.name);
initModerno(() => draw());
initBuscador();
initCumples();
initTarjetaFlotante();
initDetalleGrafico();
// En celular las tablas de personas se ven como tarjetas: cada celda lleva el
// nombre de su columna (data-th) para mostrarlo como etiqueta.
function rotularTablas() {
  for (const t of app.querySelectorAll('table.tbl--tarjetas:not([data-rot])')) {
    const ths = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (!td.dataset.th && ths[i]) td.dataset.th = ths[i]; }));
    t.dataset.rot = '';
  }
}
let rotPend = false;
new MutationObserver(() => { if (!rotPend) { rotPend = true; queueMicrotask(() => { rotPend = false; rotularTablas(); pintarYacimientos(app); }); } }).observe(app, { childList: true, subtree: true });
// Barra inferior en celular: las secciones de uso diario + "Más" (menú completo)
const INFERIOR = ['posiciones', 'candidatos', 'entrevistas', 'nomina', 'mapa'];

function shell(name) {
  const r = ROUTES[name];
  if (r.bare) return html`<main id="view" class="view view--bare"></main>`;
  const navItems = state.canRead ? Object.entries(ROUTES).filter(([, v]) => v.label && (!v.staff || state.isStaff)) : [];
  return html`
  <a href="#view" class="skip">Saltar al contenido</a>
  <header class="topbar">
    ${navItems.length ? html`<button type="button" class="menu-btn" id="btn-menu" aria-label="Abrir menú de secciones" aria-expanded="false" aria-controls="menu-secciones"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>` : ''}
    <a class="brand" href="#/posiciones" aria-label="Inicio">
      <img src="./brand/efis-isologo.svg" alt="EFiS Energy Field Services" class="brand-logo brand-logo--color">
      <img src="./brand/efis-isologo-negativo.svg" alt="" aria-hidden="true" class="brand-logo brand-logo--mono">
      <span class="brand-app"><b>Reclutamiento</b></span>
    </a>
    <nav class="nav" id="menu-secciones" aria-label="Secciones">
      <div class="nav-cab">
        <a class="nav-marca" href="#/posiciones" aria-label="Inicio">
          <img src="./brand/efis-isologo.svg" alt="EFiS Energy Field Services" class="brand-logo brand-logo--color">
          <img src="./brand/efis-isologo-negativo.svg" alt="" aria-hidden="true" class="brand-logo brand-logo--mono">
        </a>
        <button type="button" class="nav-plegar" id="btn-lateral" aria-label="${lateralCorto() ? 'Expandir barra lateral' : 'Contraer barra lateral'}" title="${lateralCorto() ? 'Expandir' : 'Contraer'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${lateralCorto() ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}"/></svg></button>
      </div>
      ${GRUPOS.map(([g, ks]) => { const items = ks.map((k) => navItems.find(([n]) => n === k)).filter(Boolean); return items.length ? html`<div class="nav-grupo"><span class="nav-gtit">${g}</span>
        ${items.map(([k, v]) => html`<a href="#/${k}" class="${k === name ? 'is-active' : ''}" ${k === name ? html`aria-current="page"` : ''} title="${v.label}"><span class="nav-ini" aria-hidden="true">${INICIALES[k] || v.label.slice(0, 2).toUpperCase()}</span><span class="nav-ico">${icono(k)}</span><span class="nav-txt">${v.label}</span></a>`)}</div>` : ''; })}
      ${state.session ? html`<div class="nav-pie">
        <span class="nav-user" title="${state.session.user.email}"><b>${state.session.user.email.split('@')[0]}</b><small>${state.isStaff ? 'RRHH' : 'Lectura'}</small></span>
        <button type="button" class="nav-acc" data-act="pass" title="Mi contraseña">${icono('llave')}<span class="nav-txt">Mi contraseña</span></button>
        <button type="button" class="nav-acc" data-act="salir" title="Salir">${icono('salir')}<span class="nav-txt">Salir</span></button>
      </div>` : ''}
    </nav>
    ${(() => { const g = GRUPOS.find(([, ks]) => ks.includes(name)); return g && r.label ? html`<span class="miga">${g[0]} <i>/</i> <b>${r.label}</b></span>` : ''; })()}
    <div class="topbar-right">
      ${state.canRead ? html`<button class="icon-btn btn-buscar" id="btn-buscar" title="Buscar (Ctrl+K)" aria-label="Buscar">${icono('buscar')}<span class="bus-atajo">Buscar <kbd>Ctrl K</kbd></span></button>` : ''}
      ${campanaHtml()}
      ${state.canRead ? html`<button class="btn btn--sm btn--excel" id="btn-excel" title="${state.isStaff ? 'Descargar todo en Excel (incluye nómina y datos personales)' : 'Descargar resumen en Excel (sin datos personales)'}">${ICON.descarga} Excel</button>
      <button class="icon-btn" id="btn-refresh" title="Actualizar datos" aria-label="Actualizar datos">${ICON.actualizar}</button>` : ''}
      ${state.canRead ? html`<button class="icon-btn btn-compacto ${loadLocal('reclutapp.compacto', false) ? 'is-on' : ''}" id="btn-compacto" title="${loadLocal('reclutapp.compacto', false) ? 'Vista normal' : 'Vista compacta: más filas por pantalla'}" aria-label="Vista compacta" aria-pressed="${!!loadLocal('reclutapp.compacto', false)}">${icono('densidad')}</button>` : ''}
      <button class="icon-btn btn-tema ${temaPreferido() === 'auto' ? 'is-auto' : ''}" id="btn-theme" title="Tema: ${TEMA_TXT[temaPreferido()]}" aria-label="Cambiar tema (claro, oscuro o automático)">${ICON.tema}</button>
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
  ${(() => {
    const inf = INFERIOR.map((k) => navItems.find(([n]) => n === k)).filter(Boolean).slice(0, 4);
    if (inf.length < 2) return '';
    const mas = navItems.length > inf.length;
    return html`<nav class="barra-inf" aria-label="Accesos rápidos">${inf.map(([k, v]) => html`<a href="#/${k}" class="${k === name ? 'is-on' : ''}" ${k === name ? html`aria-current="page"` : ''}>${icono(k)}<span>${v.label}</span></a>`)}
      ${mas ? html`<button type="button" data-menu-abrir aria-controls="menu-secciones"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Más</span></button>` : ''}</nav>`;
  })()}
  <footer class="foot"><span>EFiS · Energy Field Services — Recursos Humanos</span><span>Cuenca Neuquina · 38°57′S 68°04′O</span></footer>`;
}

function route() {
  const { name, params } = parseHash();
  const r = ROUTES[name];
  // Todo requiere cuenta corporativa habilitada; las pantallas de RRHH, además, rol RRHH.
  if (state.authChecked && name !== 'login' && (!state.canRead || (r.staff && !state.isStaff))) { location.hash = '#/login'; return; }
  closeDrawer();
  app.innerHTML = String(shell(name));
  const conLateral = !r.bare && !!document.querySelector('#menu-secciones .nav-grupo');
  document.documentElement.classList.toggle('con-lateral', conLateral);
  document.documentElement.classList.toggle('con-barra-inf', !!document.querySelector('.barra-inf'));
  document.documentElement.classList.toggle('lateral-corto', conLateral && lateralCorto());
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
  document.querySelector('[data-menu-abrir]')?.addEventListener('click', () => {
    document.documentElement.classList.add('menu-abierto');
    document.querySelector('#menu-secciones a.is-active, #menu-secciones a')?.focus();
  });
  document.querySelector('[data-menu-cerrar]')?.addEventListener('click', cerrarMenu);
  $('#menu-secciones')?.addEventListener('click', (e) => { if (e.target.closest('a')) cerrarMenu(); });
  $('#btn-theme')?.addEventListener('click', toggleTheme);
  $('#btn-buscar')?.addEventListener('click', () => abrirBuscador());
  $('#btn-campana')?.addEventListener('click', (e) => { e.stopPropagation(); alternarCampana(e.currentTarget); });
  $('#btn-compacto')?.addEventListener('click', (e) => {
    const on = !loadLocal('reclutapp.compacto', false);
    saveLocal('reclutapp.compacto', on);
    document.documentElement.classList.toggle('compacto', on);
    e.currentTarget.classList.toggle('is-on', on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.title = on ? 'Vista normal' : 'Vista compacta: más filas por pantalla';
  });
  $('#btn-refresh')?.addEventListener('click', () => loadAll());
  $('#btn-logout')?.addEventListener('click', async () => { await sb.auth.signOut(); });
  $('#btn-lateral')?.addEventListener('click', () => {
    saveLocal('reclutapp.lateral.corto', !lateralCorto());
    route();
    window.dispatchEvent(new Event('resize'));
  });
  document.querySelector('.nav-pie [data-act="salir"]')?.addEventListener('click', async () => { await sb.auth.signOut(); });
  document.querySelector('.nav-pie [data-act="pass"]')?.addEventListener('click', () => usuarios.openChangePassword());
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

subscribe(() => { draw(); refrescarCampana(); });

// Campanita: lista de "Para hoy" desde cualquier pantalla
function alternarCampana(btn) {
  let pop = document.querySelector('.campana-pop');
  if (pop) { pop.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  pop = document.createElement('div');
  pop.className = 'campana-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Para hoy');
  pop.innerHTML = String(campanaLista());
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom + 8) + 'px';
  pop.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  pop.addEventListener('click', async (e) => {
    if (e.target.closest('[data-cumple-nom], [data-cumple-cand]')) { pop.remove(); btn.setAttribute('aria-expanded', 'false'); return; } // la ficha la abre el aviso de cumpleaños
    const b = e.target.closest('[data-hoy]'); if (!b) return;
    pop.remove(); btn.setAttribute('aria-expanded', 'false');
    const res = await irA(b.dataset.hoy);
    if (res === 'redibujar') { saveLocal('reclutapp.tab.posiciones', 'mapa'); if (location.hash.startsWith('#/posiciones')) route(); else location.hash = '#/posiciones'; }
  });
}
document.addEventListener('click', (e) => { const pop = document.querySelector('.campana-pop'); if (pop && !e.target.closest('.campana-pop, #btn-campana')) { pop.remove(); $('#btn-campana')?.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.campana-pop')?.remove(); });
function refrescarCampana() {
  const b = $('#btn-campana'); if (!b) return;
  const nuevo = String(campanaHtml()); const tmp = document.createElement('div'); tmp.innerHTML = nuevo;
  const n = tmp.firstElementChild; if (!n) return;
  b.title = n.title; b.innerHTML = n.innerHTML;
}
// cambio de pantalla con un fundido corto (si el navegador lo soporta y no se pidió reducir movimiento)
const conTransicion = (fn) => {
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
  const t = document.startViewTransition(fn);
  t.ready.catch(() => {}); t.finished.catch(() => {}); // si se navega rápido, la transición anterior se omite (no es un error)
};
window.addEventListener('hashchange', () => conTransicion(() => { window.scrollTo(0, 0); route(); }));
window.addEventListener('scroll', () => document.documentElement.classList.toggle('con-scroll', window.scrollY > 24), { passive: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.documentElement.classList.contains('menu-abierto')) { document.documentElement.classList.remove('menu-abierto'); document.getElementById('btn-menu')?.focus(); } });

// Re-leer al volver a la pestaña (otra persona pudo haber editado).
let lastFocusLoad = 0;
window.addEventListener('focus', () => {
  if (Date.now() - lastFocusLoad > 30000 && !document.querySelector('.drawer-root:not(.is-closing)')) { lastFocusLoad = Date.now(); loadAll({ silent: true }); }
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
