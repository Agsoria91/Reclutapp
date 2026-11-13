import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePositionsCSV, parseCandidatesCSV, parseDayMonth, parseNumber, detectKind } from '../src/lib/importers.js';
import { parseCSV } from '../src/lib/csv.js';
import { positionKpis, pendingByTarget, sectorMatches, inMonthRange } from '../src/lib/kpis.js';

// Fixtures sintéticas: nunca usar datos reales de personas en el repo.
const POS = [
  ';;;;;;;;;STATUS;CANDIDATO;;;;PLAZOS;;;;;;;;NOTAS;',
  'POS SAP;Yacimiento;Jefe Directo;Sector;Puesto;Diagrama;Turno;Encuadre;Tipo de cobertura;Status;Candidato principal;Procedencia;Localidad;Cand. activos;Fecha inicio;Fecha objetivo;Cat;Puesto de convenio;Basico;Id Sap;Ingreso;;Observaciones;Revisar',
  '111;LT2E;Pérez;ALMACÉN;Almacén 1;LaV;8h;PP;Búsqueda externa;Ingresado;Persona Prueba;Linea;RDLS;1;20/05/2026;15/11/2026;D;Despachante;513135,16;281293;02-nov;Adicional X;–;–',
  '111;LT2E;;ALMACÉN;Almacén 1;LaV;8h;PP;Movimiento Interno;Sin candidato;;;;;;01/12/2026;;;;;;;;',
  ';;;;;;;;;;;;;;;;;;;;;;;',
].join('\r\n');

test('posiciones: doble encabezado, decimales con coma, día-mes sin año, filas vacías', () => {
  const bytes = new Uint8Array([...POS].map((c) => { const cp = c.charCodeAt(0); return cp === 0x2013 ? 0x96 : cp; }));
  const { rows } = parsePositionsCSV(bytes, { today: new Date(2026, 10, 13) });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sector, 'ALMACÉN');           // decodificado como Windows-1252
  assert.equal(rows[0].basico, 513135.16);
  assert.equal(rows[0].fecha_ingreso, '2026-11-02');
  assert.equal(rows[0].fecha_objetivo, '2026-11-15');
  assert.equal(rows[0].localidad, 'Rincón de los Sauces');
  assert.equal(rows[0].procedencia, 'Línea');
  assert.equal(rows[0].adicional, 'Adicional X');
  assert.equal(rows[0].observaciones, null);          // "–" = vacío
  assert.equal(rows[1].tipo_cobertura, 'Movimiento interno');
  assert.notEqual(rows[0].import_key, rows[1].import_key); // duplicados -> clave única
});

test('candidatos: BOM, comillas, motivos JSON, DNI con mail adentro', () => {
  const csv = '﻿"Área","Status","Title","Procedencia","Cancelado","Motivo de Baja","Created","Mail","DNI","Localidad","Provincia"\n' +
    '"LT2E","Cancelado","PEREZ JUAN DE LA CRUZ","Linea","True","[""No Califica"",""Otro""]","12/11/2026 09:27",,"x@y.com","NEUQUEN","NEUQUEN"\n' +
    '"CDA","CV Recibido","GOMEZ ANA","Sindicato","False",,"11/11/2026 15:15","a@b.com","30.123.456","RDLS","RIO NEGRO"\n';
  const { rows } = parseCandidatesCSV(csv);
  assert.equal(rows[0].nombre, 'Perez Juan de la Cruz');
  assert.deepEqual(rows[0].motivos_baja, ['No Califica', 'Otro']);
  assert.equal(rows[0].mail, 'x@y.com');
  assert.equal(rows[0].dni, null);
  assert.equal(rows[0].cancelado, true);
  assert.equal(rows[0].created_origen, '2026-11-12T09:27:00-03:00');
  assert.equal(rows[1].dni, '30123456');
  assert.equal(rows[1].localidad, 'Rincón de los Sauces');
  assert.equal(rows[1].provincia, 'Río Negro');
  assert.equal(detectKind(csv), 'candidates');
});

test('helpers', () => {
  assert.equal(parseNumber('1.234.567,89'), 1234567.89);
  assert.equal(parseNumber('540809.87'), 540809.87);
  assert.equal(parseDayMonth('15-dic', new Date(2027, 0, 10)), '2026-12-15');
  assert.deepEqual(parseCSV('a,"b ""c""\nd",e\n1,2,3'), [['a', 'b "c"\nd', 'e'], ['1', '2', '3']]);
  assert.ok(sectorMatches('Planta', 'PLANTAS'));
  assert.ok(sectorMatches('TLM', 'CDA MOV.'));
  assert.ok(!sectorMatches('Almacén', 'PLANTAS'));
});

test('KPIs de posiciones', () => {
  const P = [
    { stage: 'ingresado', candidato_nombre: 'A', fecha_objetivo: '2026-10-01', yacimiento: 'LT2E' },
    { stage: 'entrevista', candidato_nombre: 'B', fecha_objetivo: '2026-10-01', yacimiento: 'LT2E' },
    { stage: 'entrevista', candidato_nombre: 'C', fecha_objetivo: '2026-11-01', yacimiento: 'LT2E' }, // mes en curso: no vencida
    { stage: 'sin_candidato', candidato_nombre: null, fecha_objetivo: '2027-01-15', yacimiento: 'CDA' },
    { stage: 'sin_candidato', candidato_nombre: null, fecha_objetivo: '2027-01-01', yacimiento: 'CDA' },
  ];
  assert.deepEqual(positionKpis(P, '2026-11-13'), { total: 5, cubiertas: 1, pendientes: 4, sinCandidato: 2, enProceso: 2, vencidas: 1 });
  const g = pendingByTarget(P, '2026-11-13');
  assert.deepEqual(g.map((x) => [x.fecha, x.total, x.vencida]), [['2026-10', 1, true], ['2026-11', 1, false], ['2027-01', 2, false]]);
});

test('rango de mes objetivo', () => {
  const p = (f) => ({ fecha_objetivo: f });
  assert.ok(inMonthRange(p('2026-12-15'), '', '2026-12'));
  assert.ok(!inMonthRange(p('2027-01-01'), '', '2026-12'));
  assert.ok(inMonthRange(p('2026-10-01'), '2026-10', '2026-12'));
  assert.ok(!inMonthRange(p('2026-09-30'), '2026-10', ''));
  assert.ok(!inMonthRange(p(null), '', '2026-12'));
  assert.ok(inMonthRange(p(null), '', ''));
});
