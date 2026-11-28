import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeError } from '../src/lib/errores.js';

test('traduce errores técnicos frecuentes', () => {
  assert.equal(mensajeError('TypeError: Failed to fetch'), 'Sin conexión con el servidor. Revisá internet y probá de nuevo.');
  assert.equal(mensajeError('JWT expired'), 'La sesión venció. Volvé a ingresar.');
  assert.equal(mensajeError('new row violates row-level security policy for table "candidates"'), 'No tenés permiso para hacer este cambio.');
  assert.equal(mensajeError('duplicate key value violates unique constraint "positions_import_key_key"'), 'Ya existe una silla igual (mismo área, sector y puesto).');
  assert.equal(mensajeError('duplicate key value violates unique constraint "x_y"'), 'Ese dato ya existe y no se puede repetir.');
  assert.equal(mensajeError('null value in column "nombre" of relation "candidates" violates not-null constraint'), 'Falta completar el nombre.');
  assert.equal(mensajeError('invalid input syntax for type date: "32/13"'), 'Hay una fecha con formato inválido.');
  assert.equal(mensajeError({ message: 'Invalid login credentials' }), 'Correo o contraseña incorrectos.');
  assert.equal(mensajeError('Something unexpected happened'), 'No se pudo completar la operación. Probá de nuevo.');
});

test('deja pasar mensajes propios y conserva prefijos en castellano', () => {
  assert.equal(mensajeError('La POS SAP 123 ya está asignada a la silla Chofer (LT2E)'), 'La POS SAP 123 ya está asignada a la silla Chofer (LT2E)');
  assert.equal(mensajeError('No autorizado'), 'No autorizado');
  assert.equal(mensajeError('No se pudo deshacer: Failed to fetch'), 'No se pudo deshacer: sin conexión con el servidor. Revisá internet y probá de nuevo.');
  assert.equal(mensajeError(''), 'No se pudo completar la operación. Probá de nuevo.');
});
