// Captura todas las pantallas de la app con datos ficticios, para comparar
// antes y después de un cambio de diseño. Ninguna consulta llega a la base.
//   node tests/visual/pantallas.cjs <carpeta>            (ANCHO=900 para otro ancho)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { datos, STAGES, VAC } = require('./datos-demo.cjs');

const OUT = path.resolve(process.argv[2] || 'tests/visual/.nuevo') + '/';
const PUERTO = 5179;
const URL = `http://localhost:${PUERTO}`;
const demo = datos();

async function servidor() {
  const raiz = path.resolve(__dirname, '../..');
  const srv = spawn('npx', ['vite', '--port', String(PUERTO), '--strictPort'], { cwd: raiz, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(URL); if (r.ok) return srv; } catch { /* todavía no levantó */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  srv.kill(); throw new Error('No levantó el servidor de desarrollo');
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const srv = await servidor();
  const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {});
  async function page({ theme = 'light', mobile = false, staff = true, entrev = false } = {}) {
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: +(process.env.ANCHO || 1440), height: 900 }, deviceScaleFactor: 1 });
    // nada sale hacia la base real
    await ctx.route(/supabase\.co/, (r) => {
      const u = r.request().url();
      const body = /nombre_de_usuario/.test(u) ? '"RRHH Demo"' : /vacantes_pj\?/.test(u) ? JSON.stringify(VAC) : /vacantes_pj_importaciones/.test(u) ? JSON.stringify([{ importado_at: '2026-11-24T10:00:00Z', archivo: 'Status_Vacantes_demo.csv', filas: VAC.length }]) : '[]';
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-999/*' }, body });
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('ERROR en la página:', e.message));
    await p.addInitScript(([t]) => { localStorage.setItem('reclutapp.theme', JSON.stringify(t)); localStorage.setItem('reclutapp.ultimoRespaldo', JSON.stringify(new Date().toISOString())); }, [theme]);
    await p.goto(URL + '/#/login', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    // esperar a que la app termine de revisar la sesión (si no, pisa los datos de prueba)
    await p.waitForFunction(async () => (await import('/src/lib/store.js')).state.authChecked === true, null, { timeout: 15000 });
    await p.evaluate(async ([d, stages, staff, entrev]) => {
      const st = await import('/src/lib/store.js');
      const stageMap = Object.fromEntries(stages.map((s) => [s.code, s]));
      const seat = new Map(d.positions.filter((x) => x.candidate_id).map((x) => [x.candidate_id, x]));
      d.candidates.forEach((c) => { c._silla = seat.get(c.id) || null; c._ternas = []; c._evals = staff ? d.evaluaciones.filter((e) => e.candidate_id === c.id) : []; });
      d.positions.forEach((x) => { x._terna = []; });
      st.state.session = { user: { email: 'demo@ejemplo.com', id: 'x' } };
      st.state.isStaff = staff; st.state.canRead = !entrev; st.state.isEntrevistador = entrev; st.state.authChecked = true;
      st.set({ stages, stageMap, positions: d.positions, candidates: d.candidates, nomina: staff ? d.nomina : [], hires: staff ? d.nomina.filter((n) => n.position_id) : [],
        historial: [], avisos: [], plantillas: [], sap: [], evaluaciones: staff ? d.evaluaciones : [], entrevistadores: staff ? d.entrevistadores : [], misEntrevistas: entrev ? d.misEntrevistas : [], loading: false, error: null, loadedAt: new Date() });
      if (entrev) { st.set({ positions: [], candidates: [], nomina: [] }); }
    }, [JSON.parse(JSON.stringify(demo)), STAGES, staff, entrev]);
    return p;
  }
  const go = async (p, r, wait = 900) => { await p.evaluate((r) => { location.hash = '#/' + r; }, r); await p.waitForTimeout(wait); await p.evaluate(() => window.scrollTo(0, 0)); };
  const tab = async (p, t) => { await p.click(`.m-tab[data-tab="${t}"]`); await p.waitForTimeout(700); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200); };
  const desplegar = async (p) => { const btn = p.locator('button:has-text("Desplegar todo")').first(); if (await btn.count()) { await btn.click(); await p.waitForTimeout(500); } };
  let n = 0;
  const snap = async (p, name) => { await p.screenshot({ path: OUT + name + '.png' }); n++; };
  try {
  let p = await page();
  await go(p, 'mapa', 6000); await snap(p, '01-mapa');
  await go(p, 'posiciones'); await snap(p, '03-posiciones');
  if (await p.locator('[data-hoy="plazos"]').count()) { await p.click('[data-hoy="plazos"]'); await p.waitForTimeout(1200); await p.evaluate(() => window.scrollTo(0, 0)); await snap(p, '03b-plazos-fijos'); await p.click('[data-act="m-pf-off"]'); await p.waitForTimeout(300); await p.click('.m-tab[data-tab="resumen"]'); await go(p, 'posiciones'); }
  await tab(p, 'meses'); await desplegar(p); await snap(p, '04-posiciones-meses');
  await tab(p, 'etapas'); await snap(p, '04b-posiciones-etapas');
  await p.click('[data-et-todo]'); await p.waitForTimeout(300); await snap(p, '04c-etapas-expandido');
  await p.click('.et-card:nth-child(6)'); await p.waitForTimeout(300); await snap(p, '04d-etapas-filtro'); await p.click('[data-et-limpiar]'); await p.click('[data-et-todo]');
  await go(p, 'candidatos'); await tab(p, 'listado'); await snap(p, '05-candidatos');
  await p.evaluate(async () => { const m = await import('/src/views/candidatos.js'); m.openCandidate('c-dup'); }); await p.waitForTimeout(700); await snap(p, '06-candidato-ficha');
  await p.click('[data-act="nueva-ent"]'); await p.waitForTimeout(500); await snap(p, '07-nueva-entrevista');
  await p.keyboard.press('Escape'); await p.evaluate(async () => { const u = await import('/src/components/ui.js'); u.closeDrawer?.(); });
  await go(p, 'candidatos'); await tab(p, 'graficos'); await desplegar(p); await snap(p, '08-candidatos-graficos');
  await go(p, 'entrevistas'); await tab(p, 'graficos'); await desplegar(p); await snap(p, '09-entrevistas');
  await go(p, 'dashboardpj'); await tab(p, 'busquedas'); await snap(p, '10-dashboardpj');
  await go(p, 'examenes'); await tab(p, 'personas'); await snap(p, '11-examenes');
  await go(p, 'ingresos'); await snap(p, '12-ingresos');
  await go(p, 'legajos'); await tab(p, 'listado'); await snap(p, '13-legajos');
  await go(p, 'nomina'); await tab(p, 'resumen'); await snap(p, '14-nomina');
  await p.locator(".m-btn-filtros").first().click(); await p.waitForTimeout(500); await snap(p, '15-nomina-filtros');
  await p.locator(".m-btn-filtros").first().click(); await tab(p, 'graficos'); await desplegar(p); await snap(p, '16-nomina-graficos');
  await tab(p, 'perfil'); await snap(p, '16b-nomina-perfil');
  await tab(p, 'listado'); await snap(p, '17-nomina-listado');
  await go(p, 'importar'); await snap(p, '18-importar');
  await go(p, 'revisar', 1200); await snap(p, '18b-revisar');
  await go(p, 'reunion', 1500); await snap(p, '19-reunion');
  // pantallas y paneles adicionales
  const abrir = async (js, name) => { await p.evaluate(js); await p.waitForTimeout(700); await snap(p, name); await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.evaluate(async () => { (await import('/src/components/ui.js')).closeDrawer(); document.querySelectorAll('dialog').forEach((d) => d.remove()); }); };
  await go(p, 'posiciones'); await abrir(async () => { (await import('/src/views/posiciones.js')).openEditor('p1'); }, '30-editor-silla');
  await go(p, 'candidatos'); await abrir(async () => { (await import('/src/components/avisos.js')).openAvisoDrawer('c1'); }, '31-aviso');
  await abrir(async () => { (await import('/src/components/avisos.js')).openPlantillas(); }, '32-plantillas');
  await abrir(async () => { (await import('/src/views/candidatos.js')).openCandidate(null); }, '33-nuevo-candidato');
  await abrir(async () => { (await import('/src/components/ui.js')).confirmDialog('¿Confirmar acción de prueba?', { ok: 'Confirmar' }); }, '34-dialogo');
  await abrir(async () => { (await import('/src/views/usuarios.js')).openChangePassword(); }, '35-contrasena');
  // evaluación de entrevista
  await go(p, 'entrevistas'); await tab(p, 'control'); await snap(p, '35d2-centro-control');
  await tab(p, 'evaluaciones'); await snap(p, '35e-evaluaciones-pend');
  await p.click('[data-evvista="eval"]'); await p.waitForTimeout(500); await snap(p, '35f-evaluaciones');
  await p.click('[data-ev-cand]'); await p.waitForTimeout(900); await snap(p, '35g-ficha-evaluacion');
  await p.evaluate(async () => { (await import('/src/components/ui.js')).closeDrawer(); document.querySelectorAll('dialog, .drawer-root').forEach((x) => x.remove()); }); await p.waitForTimeout(300);
  // obligatorios, cambios sin guardar y error en castellano
  const limpiar = async () => { await p.evaluate(async () => { (await import('/src/components/ui.js')).closeDrawer(); document.querySelectorAll('dialog, .drawer-root, .toast').forEach((x) => x.remove()); }); await p.waitForTimeout(300); };
  await p.evaluate(async () => { (await import('/src/views/candidatos.js')).openCandidate(null); }); await p.waitForTimeout(700);
  await p.click('.drawer button[type="submit"]'); await p.waitForTimeout(600); await snap(p, '35b-obligatorio'); await limpiar();
  await p.evaluate(async () => { (await import('/src/views/candidatos.js')).openCandidate('c1'); }); await p.waitForTimeout(700);
  await p.fill('.drawer input[name="nombre"]', 'Cambio de prueba'); await p.keyboard.press('Escape'); await p.waitForTimeout(500); await snap(p, '35c-sin-guardar'); await limpiar();
  await p.evaluate(async () => { (await import('/src/components/ui.js')).toast('duplicate key value violates unique constraint "positions_pos_sap_key"', 'error'); }); await p.waitForTimeout(500); await snap(p, '35d-error'); await limpiar();
  await go(p, 'candidatos'); await tab(p, 'reporte'); await snap(p, '36-cand-reporte');
  await go(p, 'entrevistas'); await tab(p, 'tabla'); await snap(p, '37-entrev-tabla');
  await go(p, 'examenes'); await tab(p, 'graficos'); await snap(p, '38-exam-graf');
  await tab(p, 'tablas'); await snap(p, '39-exam-tablas');
  await go(p, 'dashboardpj'); await tab(p, 'graficos'); await snap(p, '40-pj-graf');
  await tab(p, 'tablas'); await snap(p, '41-pj-tablas');
  await go(p, 'legajos'); await tab(p, 'graficos'); await snap(p, '42-legajos-graf');
  await go(p, 'legajos'); await tab(p, 'listado'); await p.evaluate(() => document.querySelector('.tbl tbody tr')?.click()); await p.waitForTimeout(700); await snap(p, '43-legajo-ficha');
  await p.evaluate(async () => { (await import('/src/components/ui.js')).closeDrawer(); });
  await go(p, 'nomina'); await tab(p, 'listado'); await p.evaluate(() => document.querySelector('.tbl tbody tr')?.click()); await p.waitForTimeout(700); await snap(p, '44-nomina-ficha');
  await p.evaluate(async () => { (await import('/src/components/ui.js')).closeDrawer(); });
  await go(p, 'usuarios', 1200); await snap(p, '45-usuarios');
  await p.check('input[name="rol"][value="entrevistador"]'); await p.waitForTimeout(400); await snap(p, '45b-usuarios-entrevistador');
  await go(p, 'presentar', 1200); await snap(p, '46-presentar');
  await go(p, 'historial?id=p1', 1200); await snap(p, '47-historial');
  await go(p, 'login', 900); await snap(p, '48-login');
  await go(p, 'reunion', 1200); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600); await snap(p, '49-reunion-2');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600); await snap(p, '50-reunion-3');
  // pantallas agregadas: agenda, buscador, duplicados, vista compacta, carga
  await go(p, 'agenda'); await p.click('[data-vista="mes"]'); await p.waitForTimeout(300); await snap(p, '60-agenda-mes');
  await p.click('[data-paso="1"]'); await p.waitForTimeout(300); await p.click('.ag-cel[data-dia$="-08"]'); await p.waitForTimeout(300); await snap(p, '60b-agenda-mes-feriado');
  await p.click('[data-paso="0"]');
  await p.click('[data-vista="semana"]'); await p.waitForTimeout(300); await snap(p, '61-agenda-semana');
  await p.click('[data-vista="mes"]');
  await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('maqueta'); await p.waitForTimeout(400); await snap(p, '62-buscador');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await go(p, 'candidatos');
  await p.evaluate(async () => { (await import('/src/views/candidatos.js')).openCandidate(null); }); await p.waitForTimeout(600);
  await p.evaluate(() => { const i = document.querySelector('#cand-form [name="dni"]'); i.value = '40000000'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(300); await snap(p, '63-duplicado');
  await p.evaluate(async () => { (await import('/src/components/ui.js')).closeDrawer(); });
  await go(p, 'nomina'); await tab(p, 'listado'); await p.click('#btn-compacto'); await p.waitForTimeout(300); await snap(p, '64-compacto');
  await p.click('#btn-compacto'); await p.waitForTimeout(200);
  // uso: tarjeta al pasar el mouse, aviso con Deshacer, encabezado fijo
  await go(p, 'candidatos'); await tab(p, 'listado');
  const fila = p.locator('.tbl--cand tbody tr').nth(2); await fila.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await fila.hover(); await p.mouse.move(400, (await fila.boundingBox()).y + 12); await p.waitForTimeout(700); await snap(p, '67-tarjeta-flotante');
  await p.mouse.move(5, 5);
  await p.evaluate(async () => { (await import('/src/components/ui.js')).toastDeshacer('Demo Ejemplo: Examen Médico', () => {}, { ms: 60000 }); }); await p.waitForTimeout(400); await snap(p, '68-deshacer');
  await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await go(p, 'nomina'); await tab(p, 'listado'); await p.evaluate(() => { const w = document.querySelector('.m-lista .table-wrap'); w.scrollTop = 600; }); await p.waitForTimeout(300); await snap(p, '69-encabezado-fijo');
  // diseño: campanita, franja desplegada, detalle de gráfico, estado vacío
  await go(p, 'nomina'); await tab(p, 'resumen'); await p.click('#btn-campana'); await p.waitForTimeout(300); await snap(p, '70-campana');
  await p.keyboard.press('Escape'); await p.click('[data-cum-toggle]'); await p.waitForTimeout(200); await snap(p, '71-franja-abierta'); await p.click('[data-cum-toggle]');
  await go(p, 'entrevistas'); await tab(p, 'graficos'); const col = p.locator('.cols .col').nth(2); await col.scrollIntoViewIfNeeded(); await col.hover(); await p.mouse.move((await col.boundingBox()).x + 20, (await col.boundingBox()).y + 60); await p.waitForTimeout(300); await snap(p, '72-detalle-grafico');
  await go(p, 'candidatos'); await tab(p, 'listado'); await p.fill('#cand-search', 'zzzz'); await p.waitForTimeout(400); await snap(p, '73-sin-resultados'); await p.fill('#cand-search', '');
  await p.evaluate(async () => { const st = await import('/src/lib/store.js'); st.set({ loading: true, positions: [], candidates: [] }); location.hash = '#/posiciones'; });
  await p.waitForTimeout(600); await snap(p, '65-cargando');
  await p.context().close();

  p = await page({ theme: 'dark' });
  await go(p, 'posiciones'); await snap(p, '20-oscuro-posiciones');
  await go(p, 'nomina'); await tab(p, 'resumen'); await snap(p, '21-oscuro-nomina');
  await p.context().close();

  p = await page({ staff: false });
  await go(p, 'posiciones'); await snap(p, '22-lector-posiciones');
  await tab(p, 'etapas'); await snap(p, '22b-lector-etapas'); await tab(p, 'mapa');
  await p.context().close();

  // rol entrevistador (supervisor)
  p = await page({ staff: false, entrev: true });
  await go(p, 'misentrevistas', 1200); await snap(p, '75-entrevistador'); await p.click('[data-mevista="hist"]'); await p.waitForTimeout(400); await snap(p, '75b-entrevistador-historial'); await p.click('[data-mevista="pend"]'); await p.waitForTimeout(300);
  await p.click('[data-me-cand]'); await p.waitForTimeout(800); await snap(p, '76-entrevistador-ficha'); await p.check('input[name="ev_dec"][value="rechazado"]'); await p.evaluate(() => { const b = document.querySelector('.drawer-body'); b.scrollTop = b.scrollHeight; }); await p.waitForTimeout(300); await snap(p, '76b-entrevistador-decision');
  await p.context().close();

  p = await page({ mobile: true });
  await go(p, 'mapa', 5000); await snap(p, '23-movil-mapa');
  await go(p, 'agenda'); await snap(p, '66-movil-agenda');
  await go(p, 'candidatos'); await tab(p, 'listado'); await snap(p, '24-movil-candidatos');
  await go(p, 'nomina'); await tab(p, 'resumen'); await snap(p, '25-movil-nomina');
  await p.click('[data-menu-abrir]'); await p.waitForTimeout(500); await snap(p, '26-movil-menu');
  } finally {
    await b.close();
    srv.kill();
  }
  console.log(`${n} pantallas en ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
