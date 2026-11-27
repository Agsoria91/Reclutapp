// Cálculos de indicadores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('días en etapa: CV recibido no cuenta y el reloj corre desde la última fecha', async () => {
  const { diasEnEtapa, estaDemorado } = await import('../src/lib/kpis.js');
  const hoy = '2026-11-26';
  assert.equal(diasEnEtapa({ stage: 'cv_recibido', cv_recibido: '2026-10-01' }, hoy), null);
  assert.equal(diasEnEtapa({ stage: 'entrevista', en_entrevista: '2026-12-02' }, hoy).nivel, 'agendado'); // entrevista futura
  const e = diasEnEtapa({ stage: 'examen_medico', en_entrevista: '2026-10-01', epo: '2026-11-10' }, hoy);
  assert.equal(e.dias, 16); assert.equal(e.nivel, 'aviso');
  assert.equal(diasEnEtapa({ stage: 'validacion_rrll', en_entrevista: '2026-10-20', validacion_rrll: '2026-11-01' }, hoy).nivel, 'alerta');
  assert.equal(estaDemorado({ stage: 'entrevista', en_entrevista: '2026-11-24' }, hoy), false);
  assert.equal(diasEnEtapa({ stage: 'ingresado', en_entrevista: '2026-01-01' }, hoy), null);
});

test('días en etapa: un turno agendado a futuro no cuenta como demora', async () => {
  const { diasEnEtapa, estaDemorado } = await import('../src/lib/kpis.js');
  const hoy = '2026-11-26';
  const c = { stage: 'examen_medico', en_entrevista: '2026-09-01', validacion_rrll: '2026-09-20', epo: '2026-11-27' };
  assert.equal(diasEnEtapa(c, hoy).nivel, 'agendado');
  assert.equal(diasEnEtapa(c, hoy).agendado, '2026-11-27');
  assert.equal(estaDemorado(c, hoy), false);
});

test('cierre de mes: dotación, ingresos, bajas y rotación', async () => {
  const { datosCierre, mesAnterior } = await import('../src/lib/cierreMes.js');
  assert.equal(mesAnterior('2026-01-15'), '2025-12');
  const nomina = [
    { fecha_ingreso: '2020-01-01', estado: 'activo' },
    { fecha_ingreso: '2026-10-05', estado: 'activo' },                               // ingreso del mes
    { fecha_ingreso: '2026-09-01', estado: 'baja', fecha_baja: '2026-10-20' },       // baja temprana del mes
    { fecha_ingreso: '2019-01-01', estado: 'baja', fecha_baja: '2026-09-30' },       // se fue antes
  ];
  const r = datosCierre('2026-10', { nomina, hoy: '2026-11-27' });
  assert.equal(r.dotIni, 2); assert.equal(r.dotFin, 2);
  assert.equal(r.ingresos.length, 1); assert.equal(r.bajas.length, 1); assert.equal(r.tempranas.length, 1);
  assert.equal(r.rotacion, 50);
  assert.equal(r.enCurso, false);
});
