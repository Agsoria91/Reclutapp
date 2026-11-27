// Compara dos tandas de capturas píxel a píxel y avisa qué pantallas cambiaron.
//   node tests/visual/comparar.cjs <antes> <despues>
// Sale con error si alguna pantalla cambió más que el umbral. El mapa satelital
// tiene más tolerancia porque las imágenes de fondo varían un poco entre cargas.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [A, B] = process.argv.slice(2).map((d) => path.resolve(d || ''));
const UMBRAL = 0.05;       // % de píxeles distintos tolerado
const UMBRAL_MAPA = 1.0;
if (!A || !B || !fs.existsSync(A) || !fs.existsSync(B)) { console.error('Uso: node tests/visual/comparar.cjs <antes> <despues>'); process.exit(2); }

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const archivos = fs.readdirSync(A).filter((f) => f.endsWith('.png')).sort();
  let fallas = 0;
  for (const f of archivos) {
    const fb = path.join(B, f);
    if (!fs.existsSync(fb)) { console.log(`FALTA      ${f}`); fallas++; continue; }
    const [da, db] = [path.join(A, f), fb].map((x) => 'data:image/png;base64,' + fs.readFileSync(x).toString('base64'));
    const r = await p.evaluate(async ([a, b]) => {
      const cargar = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
      const [ia, ib] = await Promise.all([cargar(a), cargar(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { tam: `${ia.width}×${ia.height} → ${ib.width}×${ib.height}` };
      const px = (img) => { const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
      const [pa, pb] = [px(ia), px(ib)];
      let dist = 0;
      for (let i = 0; i < pa.length; i += 4) if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > 16) dist++;
      return { pct: (dist * 100) / (ia.width * ia.height) };
    }, [da, db]);
    const lim = /mapa/.test(f) ? UMBRAL_MAPA : UMBRAL;
    if (r.tam) { console.log(`TAMAÑO     ${f}  ${r.tam}`); fallas++; continue; }
    const mal = r.pct > lim;
    if (mal) fallas++;
    console.log(`${mal ? 'CAMBIÓ    ' : 'igual     '} ${f.padEnd(30)} ${r.pct.toFixed(2)} %`);
  }
  await b.close();
  console.log(fallas ? `\n${fallas} pantalla(s) con diferencias` : `\nSin diferencias en ${archivos.length} pantallas`);
  process.exit(fallas ? 1 : 0);
})();
