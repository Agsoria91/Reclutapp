// Controles de calidad de datos: cálculos puros sobre candidatos, sillas y nómina.
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const tokens = (nombre) => norm(nombre).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
const claveNombre = (nombre) => tokens(nombre).sort().join(' ');
const conTilde = (t) => Number(norm(t) !== t.toLowerCase().trim());
const EN_CURSO = (c) => c.stage !== 'cancelado' && c.stage !== 'ingresado';
const CONFIRMADAS = new Set(['proximo_ingreso', 'ingresado']);
const AVANZADAS = new Set(['entrevista_aprobada', 'validacion_rrll', 'propuesta', 'examen_medico', 'apto', 'proximo_ingreso']);

// Mismo nombre aunque cambie el orden o falte un segundo nombre (mínimo dos palabras en común).
export function mismoNombre(a, b) {
  const x = tokens(a); const y = tokens(b);
  const [chico, grande] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  return chico.length >= 2 && chico.every((t) => grande.has(t));
}

// 1. Candidatos en proceso que ya figuran activos en nómina (salvo movimientos internos declarados).
export function enNomina(candidatos, nomina, sillaDe = () => null) {
  const activos = nomina.filter((n) => n.estado === 'activo');
  const porDni = new Map(activos.filter((n) => soloDigitos(n.dni)).map((n) => [soloDigitos(n.dni), n]));
  const out = [];
  for (const c of candidatos) {
    if (!EN_CURSO(c)) continue;
    if (sillaDe(c)?.tipo_cobertura === 'Movimiento interno') continue;
    const dni = soloDigitos(c.dni);
    let n = dni ? porDni.get(dni) : null; let por = 'DNI';
    if (!n && !dni) { n = activos.find((x) => !x.candidate_id && mismoNombre(x.nombre, c.nombre)); por = 'nombre'; }
    if (n && n.candidate_id !== c.id) out.push({ c, n, por });
  }
  return out;
}

// 2. Posibles fichas duplicadas: mismo nombre y alguna ficha sin DNI que permita distinguirlas.
//    Varias entrevistas con el mismo DNI son válidas y no se marcan.
export function duplicados(candidatos) {
  const grupos = new Map();
  for (const c of candidatos) {
    const k = claveNombre(c.nombre);
    if (k.split(' ').length < 2) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }
  return [...grupos.values()].filter((g) => {
    if (g.length < 2 || !g.some(EN_CURSO)) return false;
    return g.some((c) => !soloDigitos(c.dni));
  }).sort((a, b) => a[0].nombre.localeCompare(b[0].nombre, 'es'));
}

// 3. Fechas de ingreso: confirmada fuera de etapa, o prevista ya vencida sin ingreso.
export function fechasIngreso(sillas, hoy) {
  return sillas.flatMap((p) => {
    if (p.fecha_ingreso && !CONFIRMADAS.has(p.stage)) return [{ p, motivo: 'confirmada', fecha: p.fecha_ingreso }];
    if (p.ingreso_previsto && p.ingreso_previsto < hoy && p.stage !== 'ingresado' && !p.fecha_ingreso) return [{ p, motivo: 'vencida', fecha: p.ingreso_previsto }];
    return [];
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// 4. Localidades escritas de distintas formas (tildes, mayúsculas, espacios).
export function localidades({ candidatos = [], sillas = [], nomina = [] }) {
  const grupos = new Map();
  const sumar = (v) => {
    const t = String(v ?? '').trim();
    if (!t) return;
    const k = norm(t).replace(/[^a-z0-9]/g, '');
    if (!grupos.has(k)) grupos.set(k, new Map());
    const g = grupos.get(k); g.set(t, (g.get(t) || 0) + 1);
  };
  candidatos.forEach((c) => sumar(c.localidad));
  sillas.filter((p) => !p.candidate_id).forEach((p) => sumar(p.localidad));
  nomina.forEach((n) => sumar(n.localidad));
  return [...grupos.values()].filter((g) => g.size > 1)
    .map((g) => [...g.entries()].map(([texto, n]) => ({ texto, n }))
      .sort((a, b) => b.n - a.n || conTilde(b.texto) - conTilde(a.texto) || a.texto.localeCompare(b.texto, 'es')))
    .sort((a, b) => a[0].texto.localeCompare(b[0].texto, 'es'));
}

// 5. Candidatos avanzados en el proceso sin DNI cargado.
export function sinDni(candidatos) {
  return candidatos.filter((c) => AVANZADAS.has(c.stage) && !soloDigitos(c.dni))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
