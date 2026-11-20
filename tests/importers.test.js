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

test('embudo de entrevistas: cancelados cuentan hasta donde llegaron', async () => {
  const { interviewStats } = await import('../src/lib/kpis.js');
  const SM = Object.fromEntries(['cv_recibido', 'entrevista', 'entrevista_aprobada', 'validacion_rrll', 'examen_medico', 'apto', 'proximo_ingreso', 'ingresado', 'cancelado']
    .map((c, i) => [c, { orden: (i + 1) * 10 }]));
  const rows = [
    { stage: 'cv_recibido' },
    { stage: 'cancelado', en_entrevista: '2026-10-01' },                       // entrevistado, no aprobó
    { stage: 'cancelado', en_entrevista: '2026-10-01', entrevista_ok: true, epo: '2026-10-05' }, // cae en examen
    { stage: 'entrevista_aprobada' },                                          // sin fechas: cuenta por etapa
    { stage: 'ingresado', en_entrevista: '2026-09-01', entrevista_ok: true, epo: '2026-09-05', aptitud_recibida: '2026-09-10', fecha_ingreso: '2026-10-01' },
  ];
  const s = interviewStats(rows, SM);
  assert.deepEqual([s.entrevistados, s.aprobados, s.examen, s.aptos, s.ingresados, s.bajasPost], [4, 3, 2, 1, 1, 2]);
  assert.equal(s.efectividad, 75);
  assert.equal(s.conversion, 25);
});

// Embudo de entrevistas: un hito posterior implica los anteriores
import { reached } from '../src/lib/kpis.js';
test('reached: con EPO cuenta como entrevistado y aprobado aunque falte la fecha', () => {
  const sm = { cv_recibido: { orden: 10 }, entrevista: { orden: 20 }, entrevista_aprobada: { orden: 30 }, examen_medico: { orden: 60 }, apto: { orden: 70 }, ingresado: { orden: 90 }, cancelado: { orden: 99 } };
  const c = { stage: 'cancelado', en_entrevista: null, entrevista_ok: false, epo: '2026-10-01' };
  assert.equal(reached(c, 'entrevista', sm), true);
  assert.equal(reached(c, 'entrevista_aprobada', sm), true);
  assert.equal(reached(c, 'examen_medico', sm), true);
  assert.equal(reached(c, 'apto', sm), false);
});

// Dashboard PJ: planilla Status_Vacantes (datos sintéticos)
import { parseVacantesCSV, fechaISO, estadoInfo } from '../src/lib/vacantesPj.js';
test('parseVacantesCSV: solo EFiS, fechas y columnas por nombre', () => {
  const csv = 'EMPRESA;S;Posición;Descripción Posición;Diagrama;Persona;Fecha Solicitud de linea;Fecha Potencial ingreso.;Proceso;Estado;Jefe Nombre;Gerencia /Jefatura;AgrupadorGerencia;Dirección;Reclutador/a;Pendientes\r\n'
    + 'TECPETROL;1;Analista;;;Persona A;01/07/2025;;Busqueda externa;Cerrado;;;;Finanzas;X;\r\n'
    + 'EFiS;2;Supervisor;Desc;7x7 12;Vacante;01/01/2027;;Insourcing;;;;;Operations;ANI;nota\r\n'
    + 'EFIS;3;Analista Calidad;;L a V;Persona B;01/09/2026;15/11/2026;Movimiento interno;Oferta;;;;Quality;SEDE;\r\n';
  const r = parseVacantesCSV(csv);
  assert.equal(r.rows.length, 2);
  assert.equal(r.otrasEmpresas, 1);
  assert.equal(r.rows[0].s, '2');
  assert.equal(r.rows[0].fecha_solicitud, '2027-01-01');
  assert.equal(r.rows[1].fecha_potencial_ingreso, '2026-11-15');
  assert.equal(r.rows[1].direccion, 'Quality');
  assert.equal(fechaISO('31/02/2026'), '2026-02-31'.replace('31', '31')); // formato válido; el día lo valida la base
  assert.equal(estadoInfo('').grupo, 'sin');
  assert.equal(estadoInfo('Examen medico').label, 'Examen médico');
});

// Carga masiva: la plantilla generada se puede volver a leer (datos sintéticos)
import { buildXlsx } from '../src/lib/xlsx.js';
import { plantillaCargaMasiva, leerCargaMasiva, COLUMNAS } from '../src/lib/cargaMasiva.js';
test('carga masiva: plantilla -> lectura, validación y duplicados', () => {
  const op = { area: ['LT2E', 'FDP'], servicio: ['Mantenimiento'], posicion: ['Instrumentista'], procedencia: ['Sindicato'], localidad: ['Neuquén', 'Añelo'], provincia: ['Neuquén'] };
  const libro = plantillaCargaMasiva(op);
  const vacia = (o) => COLUMNAS.map(([k]) => o[k] ?? null);
  libro[0].rows.push(
    vacia({ nombre: 'Prueba Uno', dni: '30.111.222', area: 'LT2E', localidad: 'Añelo', fecha_nacimiento: '1990-05-14' }),
    vacia({ nombre: 'Prueba Dos', area: 'FDP', cv_recibido: '2026-11-01' }),
    vacia({ nombre: 'Prueba Tres' }),
    vacia({ nombre: 'Existente Persona', area: 'LT2E' }),
    vacia({ nombre: 'prueba uno', dni: '30111222', area: 'LT2E' }),
  );
  const filas = leerCargaMasiva(buildXlsx(libro), [{ nombre: 'Existente Persona', dni: null }], '2026-11-20');
  assert.equal(filas.length, 5); // la fila de ejemplo se ignora
  assert.equal(filas[0].estado, 'ok');
  assert.equal(filas[0].candidato.dni, '30111222');
  assert.equal(filas[0].candidato.provincia, 'Neuquén');
  assert.equal(filas[0].candidato.codigo_postal, '8305');
  assert.equal(filas[0].candidato.fecha_nacimiento, '1990-05-14');
  assert.equal(filas[0].candidato.cv_recibido, '2026-11-20');
  assert.equal(filas[1].candidato.cv_recibido, '2026-11-01');
  assert.equal(filas[2].estado, 'error');
  assert.equal(filas[3].estado, 'duplicado');
  assert.equal(filas[4].estado, 'duplicado');
});

test('nómina: celdas y columnas vacías no viajan en la importación', async () => {
  const { parseNominaCSV } = await import('../src/lib/importers.js');
  const csv = 'APELLIDO Y NOMBRE;DNI;SECTOR;YACIMIENTO;CATEGORIA\r\nPerez Juan;30.111.222;;;B\r\nGomez Ana;30111333;;;\r\n';
  const { rows, columnasVacias } = parseNominaCSV(csv);
  assert.equal(rows.length, 2);
  assert.ok(!('sector' in rows[0]) && !('yacimiento' in rows[0]));
  assert.equal(rows[0].categoria, 'B');
  assert.ok(!('categoria' in rows[1]));
  assert.deepEqual(columnasVacias.sort(), ['SECTOR', 'YACIMIENTO']);
});

test('avance del período: lo cubierto después del corte cuenta como pendiente', async () => {
  const { avancePeriodo } = await import('../src/lib/kpis.js');
  const pos = [
    { id: 1, yacimiento: 'LT2E', fecha_objetivo: '2026-10-01', stage: 'ingresado', fecha_ingreso: '2026-10-20' },
    { id: 2, yacimiento: 'LT2E', fecha_objetivo: '2026-10-01', stage: 'ingresado', fecha_ingreso: '2026-11-03' },
    { id: 3, yacimiento: 'FDP', fecha_objetivo: '2026-10-01', stage: 'en_entrevista' },
    { id: 4, yacimiento: 'FDP', fecha_objetivo: '2026-09-01', stage: 'ingresado', candidate_id: 'c1' },
    { id: 5, yacimiento: 'FDP', fecha_objetivo: '2026-11-01', stage: 'sin_candidato' },
  ];
  const a = avancePeriodo(pos, ['2026-09', '2026-10'], { candidatos: [{ id: 'c1', fecha_ingreso: '2026-09-15' }], today: '2026-11-20' });
  assert.equal(a.corte, '2026-10-31');
  assert.equal(a.req, 4); assert.equal(a.ok, 2); assert.equal(a.despues, 1); assert.equal(a.pend, 1);
  assert.equal(a.faltan, 2); assert.equal(a.avance, 50);
});

test('faltantes al corte: cubierta después del corte sigue faltando', async () => {
  const { faltantesAlCorte } = await import('../src/lib/kpis.js');
  const pos = [
    { id: 1, fecha_objetivo: '2026-10-01', stage: 'ingresado', fecha_ingreso: '2026-10-20' },
    { id: 2, fecha_objetivo: '2026-10-01', stage: 'ingresado', fecha_ingreso: '2026-11-03' },
    { id: 3, fecha_objetivo: '2026-09-01', stage: 'en_entrevista' },
    { id: 4, fecha_objetivo: '2026-11-01', stage: 'sin_candidato' },
    { id: 5, fecha_objetivo: '2026-10-01', stage: 'ingresado' },
  ];
  assert.deepEqual(faltantesAlCorte(pos, '2026-10-31').map((p) => p.id), [2, 3]);
  assert.deepEqual(faltantesAlCorte(pos, '2026-11-20').map((p) => p.id), [3, 4]);
});
