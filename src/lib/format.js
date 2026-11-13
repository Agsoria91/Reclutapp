const TZ = 'America/Argentina/Buenos_Aires';
export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (opts.short) return `${d}/${m}`;
  return `${d}/${m}/${y}`;
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
// Mes/año: "Nov 2026" (o "Nov 26" en corto). Acepta 'AAAA-MM' o 'AAAA-MM-DD'.
export function fmtMonth(iso, { short = false } = {}) {
  if (!iso) return 'Sin fecha';
  const [y, m] = String(iso).split('-');
  return `${MESES_L[+m - 1]} ${short ? y.slice(2) : y}`;
}
export function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 864e5);
}
export const fmtMoney = (n) => (n == null || n === '' ? '' :
  Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }));
export const fmtInt = (n) => Number(n || 0).toLocaleString('es-AR');
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
