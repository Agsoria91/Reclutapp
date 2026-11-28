// Datos 100 % ficticios para las pruebas visuales: nombres, DNI y cifras inventados.
// Nunca usar datos reales acá.
function datos() {
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (a) => a[Math.floor(r() * a.length)];
  const N = ['Lucas','Martina','Diego','Sofía','Matías','Valentina','Nicolás','Camila','Joaquín','Julieta','Facundo','Agustina','Tomás','Florencia','Gonzalo','Micaela','Franco','Rocío','Ezequiel','Carla','Ramiro','Paula','Leandro','Natalia','Bruno','Lorena'];
  const A = ['Ejemplo','Muestra','Demo','Prueba','Ficticio','Modelo','Simulado','Ensayo','Patrón','Maqueta'];
  const nombre = () => `${pick(A)} ${pick(A)}, ${pick(N)}`;
  const Y = ['FDP','LT2E','LT1N','CDA','TLM','LBAS','ASAL','NQN'];
  const SEC = ['Mantenimiento','Producción','Operaciones','HSE','Logística','Ingeniería','Administración'];
  const PU = ['Operador de planta','Instrumentista','Mecánico','Electricista','Supervisor de turno','Chofer','Analista','Técnico HSE','Soldador'];
  const PROC = ['Consultora','Referido','Portal de empleo','Base propia','Movimiento interno'];
  const LOC = ['Neuquén','Añelo','Plottier','Centenario','Cipolletti','Rincón de los Sauces','Cutral Có'];
  const stageCodes = ['cv_recibido','entrevista','entrevista_aprobada','validacion_rrll','propuesta','examen_medico','apto','proximo_ingreso','ingresado','cancelado'];
  const W = [8,12,8,5,4,7,4,4,30,18];
  const wpick = () => { let t = r() * W.reduce((a, b) => a + b); for (let i = 0; i < W.length; i++) { t -= W[i]; if (t < 0) return stageCodes[i]; } return 'ingresado'; };
  const d = (y, m, dd) => `${y}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  const fecha = (m0 = 6, span = 6) => { const m = m0 + Math.floor(r() * span); const y = 2026 + Math.floor((m - 1) / 12); return d(y, ((m - 1) % 12) + 1, 1 + Math.floor(r() * 27)); };
  const candidates = [];
  for (let i = 0; i < 110; i++) {
    const stage = wpick(); const o = stageCodes.indexOf(stage);
    const cv = fecha(6, 5);
    const c = { id: 'c' + i, nombre: nombre(), stage, area: pick(Y), servicio: pick(SEC), posicion: pick(PU), procedencia: pick(PROC), localidad: pick(LOC), provincia: 'Neuquén',
      cv_recibido: cv, created_origen: cv, motivos_baja: [], dni: String(40000000 + i * 7919) };
    if (o >= 1 || stage === 'cancelado') c.en_entrevista = fecha(7, 4);
    if (o >= 5 && stage !== 'cancelado') { c.epo = fecha(8, 3); c.clinica = pick(['Clínica Norte','Centro Médico Sur','Policlínico Este']); }
    if (o >= 6 && stage !== 'cancelado') { c.aptitud_recibida = fecha(9, 2); c.aptitud = 'Apto'; }
    if (stage === 'ingresado' || stage === 'proximo_ingreso') c.fecha_ingreso = stage === 'ingresado' ? fecha(8, 3) : '2026-12-' + (5 + Math.floor(r() * 20));
    if (stage === 'cancelado') { c.fecha_baja = fecha(9, 3); c.motivos_baja = [pick(['No Califica','Rechaza Propuesta','No se presenta','No Apto Medico'])]; c.cancelado = true; }
    candidates.push(c);
  }
  // turnos en el mes actual (relativos a hoy) para la agenda
  const rel = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  candidates.slice(0, 24).forEach((c, i) => { if (c.stage === 'cancelado') return; if (i % 3 === 0) c.en_entrevista = rel((i % 12) - 4); else if (i % 3 === 1) c.epo = rel((i % 10) - 3); });
  // una persona con dos entrevistas
  candidates.push({ ...candidates[3], id: 'c-dup', area: 'FDP', servicio: 'Producción', stage: 'entrevista', en_entrevista: '2026-11-20' });
  candidates[3].stage = 'cancelado'; candidates[3].motivos_baja = ['No Califica']; candidates[3].fecha_baja = '2026-11-18';
  const positions = [];
  let ci = 0;
  for (let i = 0; i < 90; i++) {
    const p = { id: 'p' + i, yacimiento: pick(Y), sector: pick(SEC), puesto: pick(PU), encuadre: pick(['Convenio','Convenio','Fuera de convenio']), diagrama: pick(['14x14','7x7','5x2']),
      tipo_cobertura: pick(['Nueva posición','Reemplazo']), fecha_objetivo: fecha(8, 6), stage: 'sin_candidato', pos_sap: String(3400000 + i * 13) };
    if (r() < 0.75) {
      while (ci < candidates.length && candidates[ci].stage === 'cancelado') ci++;
      const c = candidates[ci++];
      if (c) { p.candidate_id = c.id; p.candidato_nombre = c.nombre; p.stage = c.stage; p.procedencia = c.procedencia; p.fecha_ingreso = c.fecha_ingreso; c.area = p.yacimiento; }
    }
    positions.push(p);
  }
  const nomina = [];
  for (let i = 0; i < 320; i++) {
    const y = 2014 + Math.floor(r() * 13);
    const baja = r() < 0.12;
    nomina.push({ id: 'n' + i, nombre: nombre(), dni: String(30000000 + i * 3571), yacimiento: pick(Y), sector: pick(SEC), puesto: pick(PU), funcion: pick(PU), encuadre: pick(['Convenio','Convenio','Fuera de convenio']),
      fecha_ingreso: d(Math.min(y, 2026), 1 + Math.floor(r() * (y >= 2026 ? 10 : 12)), 1 + Math.floor(r() * 27)), estado: baja ? 'baja' : 'activo', fecha_baja: baja ? fecha(1, 10) : null,
      localidad: pick(LOC), provincia: 'Neuquén', ddjj: r() < .8 ? 'OK' : '', regalo_kit: r() < .7 ? 'OK' : '', cuil: r() < .9 ? '20-00000000-0' : '', telefono: r() < .85 ? '299 000-0000' : '',
      origen: 'planilla', procedencia: pick(PROC), sexo: pick(['M','M','M','F']), diagrama: pick(['14x14','7x7','5x2']),
      fin_pf: !baja && i % 9 === 0 ? new Date(Date.now() + ((i * 7) % 75) * 864e5).toISOString().slice(0, 10) : null });
  }
  // legajos: ingresos por silla
  positions.filter((p) => p.stage === 'ingresado').forEach((p, i) => nomina.push({ id: 'nl' + i, nombre: p.candidato_nombre, dni: String(41000000 + i), yacimiento: p.yacimiento, sector: p.sector, puesto: p.puesto, encuadre: p.encuadre,
    fecha_ingreso: p.fecha_ingreso, estado: 'activo', position_id: p.id, candidate_id: p.candidate_id, origen: 'app', localidad: pick(LOC), ddjj: r() < .5 ? 'OK' : '', regalo_kit: '', procedencia: p.procedencia }));
  // cumpleaños ficticios de hoy y mañana (para el aviso de Agenda y Nómina)
  const md = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(5, 10);
  const activos = nomina.filter((n) => n.estado === 'activo');
  activos[0].fecha_nacimiento = `1990-${md(0)}`; activos[5].fecha_nacimiento = `1984-${md(0)}`; activos[9].fecha_nacimiento = `1999-${md(1)}`;
  activos[12].fecha_ingreso = `2021-${md(2)}`; activos[15].fecha_ingreso = `2016-${md(4)}`; activos[20].fecha_ingreso = `2023-${md(5)}`; // aniversarios
  const prox = candidates.find((c) => c.stage === 'proximo_ingreso'); if (prox) prox.fecha_nacimiento = `2001-${md(1)}`;
  // casos para "Revisar datos"
  const enCurso = candidates.filter((c) => !['cancelado', 'ingresado'].includes(c.stage));
  enCurso[2].dni = activos[30].dni;
  const avz = candidates.filter((c) => ['examen_medico', 'apto'].includes(c.stage)); if (avz[0]) avz[0].dni = null;
  candidates[3].dni = null;
  const libre = positions.find((p) => !p.candidate_id); if (libre) libre.ingreso_previsto = '2026-10-05';
  activos[40].localidad = 'NEUQUEN';
  // evaluaciones de entrevista ficticias
  const ETQ = ['Buena actitud', 'Muy predispuesto', 'Joven sin experiencia', 'Disponible para diagramas de campo', 'Potencial para otro puesto', 'Requiere capacitación'];
  candidates.filter((c) => !['cv_recibido', 'entrevista', 'cancelado'].includes(c.stage)).slice(0, 26).forEach((c, i) => {
    const n = () => 2 + Math.floor(r() * 4);
    c.evaluacion = { actitud: n(), tecnico: n(), experiencia: i % 4 === 0 ? 1 : n(), seguridad: i % 5 === 0 ? null : n(), etiquetas: [ETQ[i % 6], ...(i % 3 === 0 ? [ETQ[(i + 2) % 6]] : [])], comentario: i % 2 ? 'Buena comunicación, conoce el trabajo en turnos.' : null, fecha: fecha(10, 1), por: 'x' };
  });
  // ingresos previstos (Agenda) y uno en Próximo ingreso sin fecha confirmada
  positions.filter((p) => ['cv_recibido', 'entrevista'].includes(p.stage)).slice(0, 4).forEach((p, i) => { p.ingreso_previsto = rel(3 + i * 4); });
  const pi = positions.find((p) => p.stage === 'proximo_ingreso'); if (pi) { pi.ingreso_previsto = rel(9); pi.fecha_ingreso = null; }
  return { candidates, positions, nomina };
};

const STAGES = [{"code":"sin_candidato","label":"Sin candidato","orden":0,"color":"neutral","es_activa":false},{"code":"cv_recibido","label":"CV Recibido","orden":10,"color":"sky","es_activa":true},{"code":"entrevista","label":"Entrevista","orden":20,"color":"blue","es_activa":true},{"code":"entrevista_aprobada","label":"Entrevista Aprobada","orden":30,"color":"navy","es_activa":true},{"code":"validacion_rrll","label":"Validación RRLL","orden":40,"color":"plum","es_activa":true},{"code":"propuesta","label":"Propuesta / Oferta","orden":50,"color":"violet","es_activa":true},{"code":"examen_medico","label":"Examen Médico","orden":60,"color":"orange","es_activa":true},{"code":"apto","label":"Apto","orden":70,"color":"yellow","es_activa":true},{"code":"proximo_ingreso","label":"Próximo ingreso","orden":80,"color":"lime","es_activa":true},{"code":"ingresado","label":"Ingresado","orden":90,"color":"green","es_activa":false},{"code":"cancelado","label":"Cancelado","orden":99,"color":"red","es_activa":false}];
const VAC = (() => { let k = 3; const r = () => (k = (k * 16807) % 2147483647) / 2147483647; const pk = (a) => a[Math.floor(r() * a.length)];
  return Array.from({ length: 46 }, (_, i) => ({ s: String(5100 + i), empresa: 'EFiS', posicion: pk(['Operador de planta','Instrumentista','Mecánico','Analista','Supervisor de turno','Chofer']), descripcion: 'Búsqueda de ejemplo',
    diagrama: pk(['14x14','5x2']), persona: r() < .4 ? 'Vacante' : 'Persona de ejemplo ' + (i + 1), fecha_solicitud: `2026-${String(4 + Math.floor(r() * 7)).padStart(2, '0')}-1${Math.floor(r() * 9)}`,
    fecha_potencial_ingreso: r() < .5 ? '2026-12-15' : null, proceso: pk(['Externo','Interno']), estado: pk(['Apertura','Entrevistas','Examen medico','Oferta','Cerrado','Cerrado','On hold']),
    jefe: 'Jefatura de ejemplo', gerencia: pk(['Operaciones','Mantenimiento','Logística']), agrupador: pk(['Campo','Oficina']), direccion: pk(['Operaciones','Servicios']), reclutador: 'RRHH', pendientes: null, genero: pk(['M','F', null]) })); })();

module.exports = { datos, STAGES, VAC };
