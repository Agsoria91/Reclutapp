import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enNomina, duplicados, fechasIngreso, localidades, sinDni, mismoNombre } from '../src/lib/revisar.js';

test('mismoNombre ignora orden, tildes y segundo nombre', () => {
  assert.ok(mismoNombre('Pérez Juan Carlos', 'juan perez'));
  assert.ok(!mismoNombre('Perez Juan', 'Perez Ana'));
  assert.ok(!mismoNombre('Perez', 'Perez Juan'));
});

test('enNomina: por DNI, por nombre si no hay DNI, excluye movimientos internos', () => {
  const nomina = [{ id: 'n1', nombre: 'Gomez Luis', dni: '30.111.222', estado: 'activo' },
    { id: 'n2', nombre: 'Diaz Ana Maria', estado: 'activo' }, { id: 'n3', nombre: 'Sosa Pablo', estado: 'baja' }];
  const cands = [{ id: 'a', nombre: 'Otro Nombre', dni: '30111222', stage: 'entrevista' },
    { id: 'b', nombre: 'Díaz Ana', stage: 'cv_recibido' }, { id: 'c', nombre: 'Sosa Pablo', stage: 'cv_recibido' },
    { id: 'd', nombre: 'Gomez Luis', dni: '99', stage: 'cv_recibido' }, { id: 'e', nombre: 'Diaz Ana', stage: 'cancelado' },
    { id: 'f', nombre: 'Diaz Ana', stage: 'entrevista' }];
  const r = enNomina(cands, nomina, (c) => (c.id === 'f' ? { tipo_cobertura: 'Movimiento interno' } : null));
  assert.deepEqual(r.map((x) => [x.c.id, x.n.id, x.por]), [['a', 'n1', 'DNI'], ['b', 'n2', 'nombre']]);
});

test('duplicados: mismo nombre con alguna ficha sin DNI; con DNI cargado no se marca', () => {
  const c = [{ nombre: 'Lopez Juan', stage: 'cancelado' }, { nombre: 'Juan López', stage: 'cv_recibido' },
    { nombre: 'Ruiz Eva', dni: '1', stage: 'entrevista' }, { nombre: 'Ruiz Eva', dni: '1', stage: 'cv_recibido' }, { nombre: 'Ruiz Eva', dni: '2', stage: 'cv_recibido' },
    { nombre: 'Paz Leo', stage: 'cancelado' }, { nombre: 'Paz Leo', stage: 'cancelado' }];
  assert.deepEqual(duplicados(c).map((g) => g.length), [2]);
});

test('fechasIngreso: confirmada fuera de etapa y prevista vencida', () => {
  const s = [{ id: 1, stage: 'cv_recibido', fecha_ingreso: '2027-01-20' }, { id: 2, stage: 'proximo_ingreso', fecha_ingreso: '2026-12-01' },
    { id: 3, stage: 'sin_candidato', ingreso_previsto: '2026-10-05' }, { id: 4, stage: 'entrevista', ingreso_previsto: '2027-01-20' },
    { id: 5, stage: 'ingresado', ingreso_previsto: '2026-01-01' }];
  assert.deepEqual(fechasIngreso(s, '2026-11-27').map((x) => [x.p.id, x.motivo]), [[3, 'vencida'], [1, 'confirmada']]);
});

test('localidades: agrupa variantes y sugiere la más usada (con tilde ante empate)', () => {
  const g = localidades({ candidatos: [{ localidad: 'Fernandez Oro' }, { localidad: 'Fernández Oro' }, { localidad: 'Neuquén' }],
    nomina: [{ localidad: 'NEUQUEN' }, { localidad: 'Neuquén' }] });
  assert.deepEqual(g.map((v) => v.map((x) => x.texto)), [['Fernández Oro', 'Fernandez Oro'], ['Neuquén', 'NEUQUEN']]);
});

test('sinDni: solo etapas avanzadas', () => {
  const r = sinDni([{ nombre: 'A', stage: 'examen_medico' }, { nombre: 'B', stage: 'cv_recibido' }, { nombre: 'C', stage: 'apto', dni: '12' }]);
  assert.deepEqual(r.map((c) => c.nombre), ['A']);
});
