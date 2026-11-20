// Lector mínimo de .xlsx (sin dependencias pesadas): devuelve las hojas como
// filas de celdas (texto o número). Las fechas de Excel llegan como número de
// serie: quien lee sabe qué columnas son fechas y las convierte con serialAISO.
import { unzipSync, strFromU8 } from 'fflate';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});
const textos = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

// "AB12" -> índice de columna (0 = A)
const colIdx = (ref) => {
  const letras = /^[A-Z]+/.exec(ref)[0];
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function serialAISO(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5);
  return d.toISOString().slice(0, 10);
}

export function leerXlsx(buffer) {
  const files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const leer = (p) => (files[p] ? strFromU8(files[p]) : null);
  const wb = leer('xl/workbook.xml');
  if (!wb) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const rels = leer('xl/_rels/workbook.xml.rels') || '';
  const destino = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const t = /Target="([^"]+)"/.exec(m[0])?.[1] || '';
    return [id, t.replace(/^\/?(xl\/)?/, 'xl/')];
  }));
  const ss = leer('xl/sharedStrings.xml');
  const compartidos = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1])) : [];

  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const nombre = decode(/name="([^"]*)"/.exec(m[0])?.[1] || '');
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const xml = leer(destino.get(rid) || '') || '';
    const filas = [];
    for (const fm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const r = Number(/\br="(\d+)"/.exec(fm[1])?.[1]) || filas.length + 1;
      const fila = [];
      for (const cm of fm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const tipo = /\bt="(\w+)"/.exec(attrs)?.[1];
        const cuerpo = cm[2] || '';
        let v = null;
        if (tipo === 'inlineStr') v = textos(cuerpo);
        else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
          if (raw != null) {
            if (tipo === 's') v = compartidos[Number(raw)] ?? '';
            else if (tipo === 'str' || tipo === 'e') v = decode(raw);
            else if (tipo === 'b') v = raw === '1';
            else v = Number(raw);
          }
        }
        fila[ref ? colIdx(ref) : fila.length] = v;
      }
      filas[r - 1] = fila;
    }
    return { nombre, filas: Array.from(filas, (f) => f || []) };
  });
}
