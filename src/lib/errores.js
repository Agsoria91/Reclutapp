// Traduce los mensajes técnicos (base de datos, red, sesión) a frases claras en castellano.
// Los mensajes que ya vienen en castellano (validaciones propias) pasan sin cambios.

const CAMPOS = {
  nombre: 'el nombre', puesto: 'el puesto', yacimiento: 'el área (yacimiento)', sector: 'el sector',
  stage: 'la etapa', dni: 'el DNI', email: 'el correo', fecha_ingreso: 'la fecha de ingreso',
  candidate_id: 'el candidato', position_id: 'la silla', area: 'el área',
};

const UNICOS = [
  [/pos_sap/i, 'Esa POS SAP ya está usada en otra silla.'],
  [/import_key/i, 'Ya existe una silla igual (mismo área, sector y puesto).'],
  [/dni/i, 'Ya hay un registro con ese DNI.'],
  [/email|mail/i, 'Ese correo ya está registrado.'],
];

const REGLAS = [
  [/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i,
    () => 'Sin conexión con el servidor. Revisá internet y probá de nuevo.'],
  [/jwt expired|invalid jwt|refresh token|auth session missing|not authenticated/i,
    () => 'La sesión venció. Volvé a ingresar.'],
  [/invalid login credentials/i, () => 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, () => 'Falta confirmar el correo.'],
  [/user already registered/i, () => 'Ese correo ya tiene usuario.'],
  [/password should be at least (\d+)/i, (m) => `La contraseña debe tener al menos ${m[1]} caracteres.`],
  [/new password should be different/i, () => 'La contraseña nueva tiene que ser distinta de la anterior.'],
  [/unable to validate email|invalid email/i, () => 'El correo no es válido.'],
  [/rate limit|too many requests/i, () => 'Demasiados intentos seguidos. Esperá un momento y probá de nuevo.'],
  [/row-level security|permission denied/i, () => 'No tenés permiso para hacer este cambio.'],
  [/duplicate key value violates unique constraint\s*"?([\w.]*)"?/i,
    (m) => (UNICOS.find(([r]) => r.test(m[1] || '')) || [, 'Ese dato ya existe y no se puede repetir.'])[1]],
  [/null value in column "?(\w+)"?/i, (m) => `Falta completar ${CAMPOS[m[1]] || `el campo «${m[1]}»`}.`],
  [/invalid input syntax for type (date|timestamp)|date\/time field value out of range/i, () => 'Hay una fecha con formato inválido.'],
  [/invalid input syntax for type (numeric|integer|bigint|smallint|real|double)/i, () => 'Hay un número con formato inválido.'],
  [/invalid input syntax for type uuid/i, () => 'No se encontró el registro. Recargá la pantalla y probá de nuevo.'],
  [/value too long/i, () => 'Uno de los textos es demasiado largo.'],
  [/violates foreign key constraint/i, () => 'No se puede completar: hay datos relacionados con este registro.'],
  [/violates check constraint/i, () => 'Uno de los valores no es válido para ese campo.'],
  [/payload too large|maximum allowed size|entity too large/i, () => 'El archivo es demasiado grande.'],
  [/timeout|canceling statement/i, () => 'El servidor tardó demasiado en responder. Probá de nuevo.'],
];

// Inglés técnico sin regla propia: mensaje genérico.
const PARECE_TECNICO = /\b(error|the|of|for|is|not|violates|failed|unexpected|invalid|cannot|could not|undefined|null)\b/i;

export function mensajeError(msg) {
  const s = String(msg?.message ?? msg ?? '').trim();
  if (!s) return 'No se pudo completar la operación. Probá de nuevo.';
  for (const [re, fn] of REGLAS) {
    const m = s.match(re);
    if (m) {
      // conserva un prefijo propio en castellano ("No se pudo deshacer: …")
      const antes = s.slice(0, m.index).replace(/(error|typeerror)?:?\s*$/i, '').trim();
      const frase = fn(m);
      return antes && !PARECE_TECNICO.test(antes) ? `${antes.replace(/:$/, '')}: ${frase.charAt(0).toLowerCase()}${frase.slice(1)}` : frase;
    }
  }
  if (/^[\x00-\x7F]*$/.test(s) && PARECE_TECNICO.test(s)) return 'No se pudo completar la operación. Probá de nuevo.';
  return s;
}
