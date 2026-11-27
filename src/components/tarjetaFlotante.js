// Mini ficha al apoyar el mouse sobre una persona en las listas (solo computadora y RRHH):
// etapa, días en etapa, silla y próximo paso del candidato; o datos básicos de nómina.
import { html } from '../lib/html.js';
import { state } from '../lib/store.js';
import { fmtDate, todayISO, daysBetween } from '../lib/format.js';
import { diasEnEtapa } from '../lib/kpis.js';

let tarjeta = null, timer = null, actual = null, proximoPaso = null;
const dm = (s) => s.split('-').reverse().join('/');

function objetivo(el) {
  const c = el.closest('[data-cand]'); if (c) return ['cand', c.dataset.cand, c];
  const n = el.closest('[data-nom]'); if (n) return ['nom', n.dataset.nom, n];
  const tc = el.closest('.tbl--cand tr[data-id]'); if (tc) return ['cand', tc.dataset.id, tc];
  const tp = el.closest('.tbl--pos tr[data-id]');
  if (tp) { const p = state.positions.find((x) => x.id === tp.dataset.id); return p?.candidate_id ? ['cand', p.candidate_id, tp] : null; }
  const tn = el.closest('.m-lista tr[data-id], .tbl--legajos tr[data-id]'); if (tn) return ['nom', tn.dataset.id, tn];
  return null;
}

function contenido(tipo, id) {
  const hoy = todayISO();
  if (tipo === 'cand') {
    const c = state.candidates.find((x) => x.id === id); if (!c) return null;
    const d = diasEnEtapa(c, hoy);
    const paso = proximoPaso ? proximoPaso(c, hoy) : '';
    return html`<b class="tf-nom">${c.nombre}</b>
      <span class="tf-etapa">${state.stageMap[c.stage]?.label || c.stage}${d?.agendado ? ` · turno ${dm(d.agendado)}` : d ? html` · <em class="dias dias--${d.nivel}">${d.dias} d</em>` : ''}</span>
      <dl>
        ${[c.area, c.servicio].some(Boolean) ? html`<dt>Área</dt><dd>${[c.area, c.servicio].filter(Boolean).join(' · ')}</dd>` : ''}
        <dt>Silla</dt><dd>${c._silla ? `${c._silla.puesto} · ${c._silla.yacimiento}` : 'Sin silla'}</dd>
        ${paso ? html`<dt>Próximo paso</dt><dd>${paso}</dd>` : ''}
        ${c.procedencia ? html`<dt>Procedencia</dt><dd>${c.procedencia}</dd>` : ''}
      </dl>`;
  }
  const n = state.nomina.find((x) => x.id === id); if (!n) return null;
  const anios = n.fecha_ingreso ? Math.floor(daysBetween(n.fecha_ingreso, hoy) / 365.25) : null;
  return html`<b class="tf-nom">${n.nombre}</b>
    <span class="tf-etapa">${n.estado === 'baja' ? 'Baja' : 'Activo'}${n.encuadre ? ` · ${n.encuadre}` : ''}</span>
    <dl>
      ${[n.yacimiento, n.sector].some(Boolean) ? html`<dt>Lugar</dt><dd>${[n.yacimiento, n.sector].filter(Boolean).join(' · ')}</dd>` : ''}
      ${n.funcion || n.puesto ? html`<dt>Función</dt><dd>${n.funcion || n.puesto}</dd>` : ''}
      ${n.fecha_ingreso ? html`<dt>Ingreso</dt><dd>${fmtDate(n.fecha_ingreso)}${anios != null ? ` · ${anios} ${anios === 1 ? 'año' : 'años'}` : ''}</dd>` : ''}
      ${n.fin_pf ? html`<dt>Plazo fijo</dt><dd>vence ${fmtDate(n.fin_pf)}</dd>` : ''}
    </dl>`;
}

function mostrar(el, tipo, id) {
  const c = contenido(tipo, id); if (!c) return;
  if (!tarjeta) { tarjeta = document.createElement('div'); tarjeta.className = 'tarjeta-flotante'; tarjeta.setAttribute('role', 'tooltip'); document.body.appendChild(tarjeta); }
  tarjeta.innerHTML = String(c);
  const r = el.getBoundingClientRect();
  tarjeta.style.visibility = 'hidden'; tarjeta.classList.add('is-on');
  const w = tarjeta.offsetWidth, h = tarjeta.offsetHeight;
  let left = Math.min(Math.max(12, (actual?.x ?? r.left) - 24), innerWidth - w - 12);
  let top = r.bottom + 6; if (top + h > innerHeight - 12) top = r.top - h - 6;
  tarjeta.style.left = left + 'px'; tarjeta.style.top = Math.max(12, top) + 'px'; tarjeta.style.visibility = '';
}
const ocultar = () => { clearTimeout(timer); timer = null; tarjeta?.classList.remove('is-on'); };

export function initTarjetaFlotante() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let sobre = null;
  const evaluar = (e) => {
    if (!state.isStaff || e.target.closest('.drawer-root, .tarjeta-flotante, dialog')) return;
    const o = objetivo(e.target);
    if (!o) { if (sobre) { sobre = null; ocultar(); } return; }
    const [tipo, id, el] = o;
    if (sobre === el) return;
    sobre = el; ocultar();
    actual = { x: e.clientX };
    timer = setTimeout(async () => {
      if (!proximoPaso && tipo === 'cand') ({ proximoPaso } = await import('../views/candidatos.js'));
      if (sobre === el) mostrar(el, tipo, id);
    }, 380);
  };
  document.addEventListener('mouseover', evaluar);
  // después de un scroll el mouse puede quedar quieto sobre otra fila: se vuelve a evaluar al moverlo
  document.addEventListener('mousemove', (e) => { if (actual) actual.x = e.clientX; if (!sobre) evaluar(e); }, { passive: true });
  ['scroll', 'mousedown', 'keydown'].forEach((t) => window.addEventListener(t, () => { sobre = null; ocultar(); }, { passive: true, capture: true }));
}
