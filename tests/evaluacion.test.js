import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puntaje, armarEvaluacion, tieneEvaluacion, puntajeGrupo, enAlcance, completa } from '../src/lib/evaluacion.js';

test('puntaje: promedio sobre lo calificado y nivel', () => {
  assert.equal(puntaje(null), null);
  assert.equal(puntaje({ actitud: null }), null);
  assert.deepEqual(puntaje({ actitud: 5, tecnico: 5, experiencia: 5, seguridad: 5 }), { pct: 100, nivel: 'Destacado', tono: 'ok', calificados: 4, total: 4 });
  const p = puntaje({ actitud: 5, tecnico: 2, experiencia: 1 }); // 8/15
  assert.equal(p.pct, 53); assert.equal(p.nivel, 'A desarrollar'); assert.equal(p.calificados, 3);
  assert.equal(puntaje({ actitud: 4, tecnico: 3 }).nivel, 'Adecuado'); // 70 %
  assert.equal(puntaje({ actitud: 9 }), null);
});

test('armarEvaluacion: fecha solo cuando cambia', () => {
  const ctx = { hoy: '2026-11-28' };
  assert.equal(armarEvaluacion({}, null, ctx), undefined);
  const ev = armarEvaluacion({ actitud: '4', etiquetas: ['Muy predispuesto', 'X'], comentario: ' ok ' }, null, ctx);
  assert.deepEqual(ev, { actitud: 4, tecnico: null, experiencia: null, seguridad: null, etiquetas: ['Muy predispuesto'], comentario: 'ok', categoria_sugerida: null, fecha: '2026-11-28' });
  const igual = armarEvaluacion({ actitud: '4', etiquetas: ['Muy predispuesto'], comentario: 'ok' }, { ...ev, fecha: '2026-11-01' }, ctx);
  assert.equal(igual.fecha, '2026-11-01'); assert.equal(igual.sinCambios, true);
  assert.equal(armarEvaluacion({}, ev, ctx), null);
  assert.ok(tieneEvaluacion({ etiquetas: ['Buena actitud'] }));
});

test('puntajeGrupo: promedio de varias evaluaciones', () => {
  assert.equal(puntajeGrupo([]), null);
  const g = puntajeGrupo([{ actitud: 5, tecnico: 5 }, { actitud: 3, tecnico: 3 }, { comentario: 'solo texto' }]);
  assert.equal(g.pct, 80); assert.equal(g.nivel, 'Destacado'); assert.equal(g.varias, true);
});

test('enAlcance: sector + especialidad + yacimiento, sin tildes ni mayúsculas', () => {
  const e = { sectores: ['Mantenimiento'], subsectores: ['Mecánico'], yacimientos: ['LT2E'], puestos: [] };
  assert.ok(enAlcance({ servicio: 'MANTENIMIENTO', subsector: 'mecanico', area: 'LT2E' }, e));
  assert.ok(!enAlcance({ servicio: 'Mantenimiento', subsector: 'Eléctrico', area: 'LT2E' }, e));
  assert.ok(!enAlcance({ servicio: 'Mantenimiento', subsector: null, area: 'LT2E' }, e));
  assert.ok(!enAlcance({ servicio: 'Mantenimiento', subsector: 'Mecánico', area: 'LT1N' }, e));
  assert.ok(enAlcance({ servicio: 'Producción', area: 'CDA' }, { sectores: ['Producción'] }));
});

test('completa: 4 habilidades, categoría y comentario', () => {
  const base = { actitud: 4, tecnico: 4, experiencia: 3, seguridad: 5, categoria_sugerida: 'Oficial', comentario: 'ok' };
  assert.ok(completa(base));
  assert.ok(!completa({ ...base, seguridad: null }));
  assert.ok(!completa({ ...base, comentario: ' ' }));
});
