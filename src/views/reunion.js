// Modo reunión: presentación de diapositivas (16:9) con datos en vivo y
// colores EFiS. Para proyectar en reuniones de dirección. Sin datos sensibles
// (no muestra DNI, teléfonos, mails ni básicos); la diapositiva de exámenes
// médicos se ve solo con usuario RRHH.
import './reunion.css';
import { html, raw } from '../lib/html.js';
import { state } from '../lib/store.js';
import { fmtMonth, fmtDate, todayISO, pct } from '../lib/format.js';
import { positionKpis, pendingByTarget, isCovered, interviewStats, monthKey } from '../lib/kpis.js';
import { mascot } from '../components/mascot.js';
import { estadoMedico, esApto, clinicaCanon } from '../components/examen.js';

let idx = 0;
let keysBound = false;

const canonTxt = (v) => { const t = String(v ?? '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Sin dato'; };
const fmtN = (n) => Number(n || 0).toLocaleString('es-AR');

function datos(area) {
  const today = todayISO();
  const pos = state.positions.filter((p) => !area || p.yacimiento === area);
  const cands = state.candidates.filter((c) => !area || c.area === area);
  return { today, pos, cands, k: positionKpis(pos, today), pend: pendingByTarget(pos, today) };
}

// ---------------------------------------------------------------------------
// Diapositivas
// ---------------------------------------------------------------------------
const SECCIONES = [
  { id: 'posiciones', label: 'Mapa de posiciones', slide: slidePosiciones },
  { id: 'cobertura', label: 'Cobertura por mes', slide: slideCobertura },
  { id: 'reclutamiento', label: 'Reclutamiento', slide: slideReclutamiento },
  { id: 'ingresos', label: 'Ingresos', slide: slideIngresos },
  { id: 'examenes', label: 'Exámenes médicos', slide: slideExamenes, staff: true },
];

function header(activo) {
  const secs = SECCIONES.filter((s) => !s.staff || state.isStaff);
  return html`<header class="dk-head">
    <span class="dk-head-title">Reclutamiento EFiS</span>
    <img src="./brand/efis-isologo-negativo.svg" alt="EFiS" class="dk-head-logo">
  </header>
  <nav class="dk-tabs">${secs.map((s) => html`<button type="button" class="dk-tab ${s.id === activo ? 'is-on' : ''}" data-dk-go="${s.id}">${s.label}</button>`)}</nav>`;
}

function slidePortada({ area, k }) {
  return html`<section class="dk-slide dk-cover">
    <img src="./brand/efis-isologo-negativo.svg" alt="EFiS Energy Field Services" class="dk-cover-logo">
    <div class="dk-cover-main">
      <h1>Plan de cobertura<br>de posiciones</h1>
      <span class="dk-cover-tag">${area ? `Área ${area}` : 'Todas las áreas'} · Recursos Humanos</span>
    </div>
    <div class="dk-cover-foot">
      <span>${fmtMonth(todayISO())}</span>
      <span><b>${fmtN(k.total)}</b> sillas · <b>${fmtN(k.cubiertas)}</b> cubiertas · <b>${pct(k.cubiertas, k.total)}%</b> de avance</span>
    </div>
    <svg class="dk-cover-trace" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 100 C 80 96, 120 90, 170 84 S 260 70, 310 62 S 400 44, 450 36 S 540 18, 600 10"/></svg>
  </section>`;
}

function slidePosiciones({ pos, k }) {
  const areas = new Map();
  for (const p of pos) {
    const a = areas.get(p.yacimiento) || { total: 0, cub: 0, proc: 0 };
    a.total++; if (isCovered(p)) a.cub++; else if (p.candidato_nombre) a.proc++;
    areas.set(p.yacimiento, a);
  }
  const filas = [...areas.entries()].sort((a, b) => b[1].total - a[1].total);
  const internos = pos.filter((p) => isCovered(p) && p.tipo_cobertura === 'Movimiento interno').length;
  return html`<section class="dk-slide">${header('posiciones')}
    <div class="dk-body dk-grid-2">
      <div class="dk-col">
        <div class="dk-big dk-big--dark"><b>${fmtN(k.total)}</b><span>Sillas totales</span></div>
        <div class="dk-kpis">
          ${dkKpi(k.cubiertas, 'Cubiertas', `${pct(k.cubiertas, k.total)}% · ${internos} por mov. interno`, 'green')}
          ${dkKpi(k.pendientes, 'Faltan cubrir', '', 'lime')}
          ${dkKpi(k.enProceso, 'En proceso', 'con candidato')}
          ${dkKpi(k.sinCandidato, 'Sin candidato', '')}
          ${dkKpi(k.vencidas, 'Vencidas', 'mes objetivo pasado', k.vencidas ? 'red' : '')}
        </div>
      </div>
      <div class="dk-card">
        <h3>Avance por área</h3>
        <ul class="dk-bars">${filas.map(([a, v]) => html`<li>
          <span class="dk-bars-lbl">${a}</span>
          <span class="dk-bars-track"><span class="dk-bars-fill" style="width:${pct(v.cub, v.total)}%"></span><span class="dk-bars-proc" style="width:${pct(v.proc, v.total)}%"></span></span>
          <span class="dk-bars-val"><b>${v.cub}</b>/${v.total}</span></li>`)}</ul>
        <p class="dk-legend"><i class="dk-l-cub"></i>cubiertas <i class="dk-l-proc"></i>en proceso</p>
      </div>
    </div></section>`;
}

function slideCobertura({ pend, k }) {
  const max = Math.max(1, ...pend.map((g) => g.total));
  return html`<section class="dk-slide">${header('cobertura')}
    <div class="dk-body">
      <div class="dk-card dk-card--full">
        <h3>Sillas a cubrir por mes objetivo <small>${fmtN(k.pendientes)} pendientes</small></h3>
        <div class="dk-cols">${pend.map((g) => html`<div class="dk-col-m ${g.vencida ? 'is-late' : ''}">
          <span class="dk-col-val">${g.total}</span>
          <span class="dk-col-bar" style="height:${(g.total / max) * 100}%">
            <span class="dk-col-sin" style="height:${pct(g.sinCandidato, g.total)}%"></span></span>
          <span class="dk-col-lbl">${g.fecha ? fmtMonth(g.fecha, { short: true }) : 'Sin fecha'}</span>
          <span class="dk-col-sub">${g.porArea.map(([a, n]) => `${a} ${n}`).join(' · ')}</span>
        </div>`)}</div>
        <p class="dk-legend"><i class="dk-l-proc"></i>con candidato en proceso <i class="dk-l-sin"></i>sin candidato <i class="dk-l-late"></i>mes vencido</p>
      </div>
    </div></section>`;
}

function slideReclutamiento({ cands }) {
  const s = interviewStats(cands, state.stageMap);
  const de10 = s.entrevistados ? Math.round((s.aprobados / s.entrevistados) * 10) : 0;
  const ing10 = s.entrevistados ? Math.round((s.ingresados / s.entrevistados) * 10) : 0;
  const pasos = [['CV recibidos', s.cvs], ['Entrevistados', s.entrevistados], ['Aprobaron la entrevista', s.aprobados], ['Examen médico', s.examen], ['Aptos', s.aptos], ['Ingresaron', s.ingresados]];
  const ingresados = cands.filter((c) => c.stage === 'ingresado');
  const fuentes = new Map();
  for (const c of ingresados) { const k = canonTxt(c.procedencia); fuentes.set(k, (fuentes.get(k) || 0) + 1); }
  const fuentesArr = [...fuentes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return html`<section class="dk-slide">${header('reclutamiento')}
    <div class="dk-body dk-grid-2">
      <div class="dk-card">
        <h3>Embudo de selección</h3>
        <ol class="dk-funnel">${pasos.map(([l, v], i) => html`<li>
          <span class="dk-funnel-lbl">${l}</span>
          <span class="dk-funnel-bar" style="width:${pct(v, pasos[0][1] || 1)}%"></span>
          <span class="dk-funnel-val"><b>${fmtN(v)}</b>${i ? html`<small>${pct(v, pasos[i - 1][1])}%</small>` : ''}</span></li>`)}</ol>
      </div>
      <div class="dk-col">
        <div class="dk-big dk-big--green"><b>${s.efectividad ?? 0}%</b><span>Efectividad de entrevistas · de cada 10 entrevistados, <b>${de10}</b> aprueban y <b>${ing10}</b> ingresan</span></div>
        <div class="dk-card">
          <h3>Ingresados por fuente</h3>
          <div class="dk-split">${fuentesArr.map(([k, v]) => html`<div style="flex:${v}"><b>${pct(v, ingresados.length)}%</b><span>${k}</span></div>`)}</div>
        </div>
      </div>
    </div></section>`;
}

function slideIngresos({ pos, cands, today }) {
  const ing = cands.filter((c) => c.stage === 'ingresado' && c.fecha_ingreso);
  const meses = new Map();
  for (const c of ing) { const m = monthKey(c.fecha_ingreso); meses.set(m, (meses.get(m) || 0) + 1); }
  const serie = [...meses.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-9);
  const max = Math.max(1, ...serie.map((m) => m[1]));
  const proximos = pos.filter((p) => p.stage === 'proximo_ingreso' || (p.fecha_ingreso && p.fecha_ingreso > today && !isCovered(p)))
    .sort((a, b) => String(a.fecha_ingreso || '9').localeCompare(String(b.fecha_ingreso || '9'))).slice(0, 8);
  const internos = pos.filter((p) => isCovered(p) && p.tipo_cobertura === 'Movimiento interno').length;
  return html`<section class="dk-slide">${header('ingresos')}
    <div class="dk-body dk-grid-2">
      <div class="dk-card">
        <h3>Ingresos por mes <small>${fmtN(ing.length)} por selección · ${internos} por movimiento interno</small></h3>
        <div class="dk-cols dk-cols--green">${serie.map(([m, v]) => html`<div class="dk-col-m">
          <span class="dk-col-val">${v}</span><span class="dk-col-bar" style="height:${(v / max) * 100}%"></span>
          <span class="dk-col-lbl">${fmtMonth(m, { short: true })}</span></div>`)}</div>
      </div>
      <div class="dk-card">
        <h3>Próximos ingresos</h3>
        ${proximos.length ? html`<table class="dk-table"><tbody>${proximos.map((p) => html`<tr>
          <td class="dk-mono">${p.fecha_ingreso ? fmtDate(p.fecha_ingreso) : 'a confirmar'}</td>
          <td><b>${p.candidato_nombre || '—'}</b><small>${p.puesto} · ${p.yacimiento}${p.sector ? ' · ' + p.sector : ''}</small></td></tr>`)}</tbody></table>`
          : html`<p class="dk-empty">Sin ingresos programados.</p>`}
      </div>
    </div></section>`;
}

function slideExamenes({ cands }) {
  const ex = cands.filter((c) => c.epo);
  const cnt = (f) => ex.filter(f).length;
  const aptos = cnt((c) => esApto(estadoMedico(c)));
  const noAptos = cnt((c) => ['no_apto', 'no_apto_temp'].includes(estadoMedico(c).code));
  const inter = cnt((c) => estadoMedico(c).code === 'interconsulta');
  const pend = cnt((c) => estadoMedico(c).code === 'pendiente');
  const porClinica = new Map();
  for (const c of ex) {
    const k = clinicaCanon(c.clinica) || 'Sin dato';
    const g = porClinica.get(k) || { n: 0, aptos: 0 };
    g.n++; if (esApto(estadoMedico(c))) g.aptos++;
    porClinica.set(k, g);
  }
  return html`<section class="dk-slide">${header('examenes')}
    <div class="dk-body dk-grid-2">
      <div class="dk-col">
        <div class="dk-big dk-big--dark"><b>${fmtN(ex.length)}</b><span>Enviados a examen preocupacional</span></div>
        <div class="dk-kpis">
          ${dkKpi(aptos, 'Aptos', `${pct(aptos, aptos + noAptos)}% de los resultados`, 'green')}
          ${dkKpi(noAptos, 'No aptos', 'definitivos y temporales', noAptos ? 'red' : '')}
          ${dkKpi(inter, 'En interconsulta', '')}
          ${dkKpi(pend, 'Pendientes', 'de resultado')}
        </div>
      </div>
      <div class="dk-card">
        <h3>Por clínica</h3>
        <ul class="dk-bars">${[...porClinica.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, g]) => html`<li>
          <span class="dk-bars-lbl">${k}</span>
          <span class="dk-bars-track"><span class="dk-bars-fill" style="width:${pct(g.aptos, g.n)}%"></span></span>
          <span class="dk-bars-val"><b>${g.n}</b> · ${pct(g.aptos, g.n)}% aptos</span></li>`)}</ul>
      </div>
    </div></section>`;
}

function slideCierre() {
  return html`<section class="dk-slide dk-cover dk-cover--end">
    <img src="./brand/efis-isologo-negativo.svg" alt="EFiS Energy Field Services" class="dk-cover-logo">
    <div class="dk-cover-main"><h1>¡Muchas gracias!</h1><span class="dk-cover-tag">Recursos Humanos · EFiS</span></div>
  </section>`;
}

function dkKpi(v, label, sub, tone = '') {
  return html`<div class="dk-kpi ${tone ? 'dk-kpi--' + tone : ''}"><b>${fmtN(v)}</b><span>${label}</span>${sub ? html`<small>${sub}</small>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
export function render(el, params) {
  if (state.loading && !state.positions.length) { el.innerHTML = String(mascot('loading')); return; }
  const area = params?.get('area') || '';
  const d = { area, ...datos(area) };
  const slides = [slidePortada(d), ...SECCIONES.filter((s) => !s.staff || state.isStaff).map((s) => s.slide(d)), slideCierre()];
  const ids = ['portada', ...SECCIONES.filter((s) => !s.staff || state.isStaff).map((s) => s.id), 'cierre'];
  idx = Math.min(idx, slides.length - 1);
  const areas = [...new Set(state.positions.map((p) => p.yacimiento).filter(Boolean))].sort();

  el.innerHTML = String(html`<div class="dk-root">
    <div class="dk-tools">
      <a class="dk-btn" href="#/posiciones">← Salir</a>
      <label class="dk-sel"><span>Área</span><select id="dk-area"><option value="">Todas</option>${areas.map((a) => html`<option value="${a}" ${raw(a === area ? 'selected' : '')}>${a}</option>`)}</select></label>
      <span class="dk-spacer"></span>
      <button class="dk-btn" type="button" data-dk="prev" aria-label="Anterior">◀</button>
      <span class="dk-count">${idx + 1} / ${slides.length}</span>
      <button class="dk-btn" type="button" data-dk="next" aria-label="Siguiente">▶</button>
      <button class="dk-btn" type="button" data-dk="full">Pantalla completa</button>
    </div>
    <div class="dk-viewport"><div class="dk-stage" id="dk-stage">${slides.map((s, i) => html`<div class="dk-frame ${i === idx ? 'is-on' : ''}" data-dk-id="${ids[i]}">${s}</div>`)}</div></div>
  </div>`);

  const stage = el.querySelector('#dk-stage');
  const fit = () => {
    const vp = el.querySelector('.dk-viewport');
    if (!vp) return;
    const sc = Math.min(vp.clientWidth / 1280, vp.clientHeight / 720);
    stage.style.transform = `translate(-50%, -50%) scale(${sc})`;
  };
  fit();
  const ir = (i) => { idx = Math.max(0, Math.min(slides.length - 1, i)); render(el, params); };
  el.querySelector('[data-dk="prev"]').onclick = () => ir(idx - 1);
  el.querySelector('[data-dk="next"]').onclick = () => ir(idx + 1);
  el.querySelector('[data-dk="full"]').onclick = () => { if (!document.fullscreenElement) el.querySelector('.dk-root').requestFullscreen?.(); else document.exitFullscreen?.(); };
  el.querySelector('#dk-area').onchange = (e) => { idx = 0; location.hash = '#/reunion' + (e.target.value ? '?area=' + encodeURIComponent(e.target.value) : ''); };
  el.querySelectorAll('[data-dk-go]').forEach((b) => { b.onclick = () => ir(ids.indexOf(b.dataset.dkGo)); });
  stage.onclick = (e) => { if (!e.target.closest('button, a, select')) ir(idx + 1); };
  window.onresize = fit;
  if (!keysBound) {
    keysBound = true;
    document.addEventListener('keydown', (e) => {
      if (!location.hash.startsWith('#/reunion')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); document.querySelector('[data-dk="next"]')?.click(); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); document.querySelector('[data-dk="prev"]')?.click(); }
      if (e.key === 'f' || e.key === 'F') document.querySelector('[data-dk="full"]')?.click();
    });
  }
}
