import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puntaje, armarEvaluacion, tieneEvaluacion } from '../src/lib/evaluacion.js';

test('puntaje: promedio sobre lo calificado y nivel', () => {
  assert.equal(puntaje(null), null);
  assert.equal(puntaje({ actitud: null }), null);
  assert.deepEqual(puntaje({ actitud: 5, tecnico: 5, experiencia: 5, seguridad: 5 }), { pct: 100, nivel: 'Destacado', tono: 'ok', calificados: 4, total: 4 });
  const p = puntaje({ actitud: 5, tecnico: 2, experiencia: 1 }); // 8/15
  assert.equal(p.pct, 53); assert.equal(p.nivel, 'A desarrollar'); assert.equal(p.calificados, 3);
  assert.equal(puntaje({ actitud: 4, tecnico: 3 }).nivel, 'Adecuado'); // 70 %
  assert.equal(puntaje({ actitud: 9 }), null);
});

test('armarEvaluacion: fecha y autor solo cuando cambia', () => {
  const ctx = { hoy: '2026-11-28', uid: 'u1' };
  assert.equal(armarEvaluacion({}, null, ctx), undefined);
  const ev = armarEvaluacion({ actitud: '4', etiquetas: ['Muy predispuesto', 'X'], comentario: ' ok ' }, null, ctx);
  assert.deepEqual(ev, { actitud: 4, tecnico: null, experiencia: null, seguridad: null, etiquetas: ['Muy predispuesto'], comentario: 'ok', fecha: '2026-11-28', por: 'u1' });
  const igual = armarEvaluacion({ actitud: '4', etiquetas: ['Muy predispuesto'], comentario: 'ok' }, { ...ev, fecha: '2026-11-01', por: 'u0' }, ctx);
  assert.equal(igual.fecha, '2026-11-01'); assert.equal(igual.por, 'u0');
  assert.equal(armarEvaluacion({}, ev, ctx), null); // se borró todo
  assert.ok(tieneEvaluacion({ etiquetas: ['Buena actitud'] }));
});
