// Estado global mínimo + carga de datos.
// La decisión de QUÉ datos viajan al navegador se toma acá y en la base:
//   - sin login de RRHH se leen SOLO las vistas *_public (sin campos sensibles);
//   - con login de RRHH se leen las tablas completas (RLS lo permite solo a staff).
import { sb, fetchAll } from './supabase.js';

const listeners = new Set();
export const state = {
  session: null,
  isStaff: false,
  authChecked: false,
  loading: true,
  error: null,
  stages: [],
  stageMap: {},
  positions: [],
  candidates: [],
  hires: [],
  nomina: [],
  loadedAt: null,
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { listeners.forEach((fn) => fn(state)); }
export function set(patch) { Object.assign(state, patch); emit(); }

export async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  const session = data.session;
  let isStaff = false;
  if (session) {
    const { data: ok, error } = await sb.rpc('is_staff');
    isStaff = !error && ok === true;
  }
  state.session = session;
  state.isStaff = isStaff;
  state.authChecked = true;
}

export async function loadAll({ silent = false } = {}) {
  if (!silent) set({ loading: true, error: null });
  try {
    const staff = state.isStaff;
    const [stages, positions, candidates, hires, terna, nomina] = await Promise.all([
      fetchAll('stages', '*', 'orden'),
      fetchAll(staff ? 'positions' : 'positions_public'),
      fetchAll(staff ? 'candidates' : 'candidates_public'),
      staff ? fetchAll('hires') : Promise.resolve([]),
      staff ? fetchAll('position_candidates', '*', 'added_at') : Promise.resolve([]),
      staff ? fetchAll('nomina', '*', 'nombre') : Promise.resolve([]),
    ]);
    const stageMap = Object.fromEntries(stages.map((s) => [s.code, s]));
    if (staff) {
      const seat = new Map(positions.filter((p) => p.candidate_id).map((p) => [p.candidate_id, p]));
      candidates.forEach((c) => { c._silla = seat.get(c.id) || null; c._ternas = []; });
      // terna: candidatos en proceso para cada silla (el principal incluido)
      const cById = new Map(candidates.map((c) => [c.id, c]));
      const pById = new Map(positions.map((p) => [p.id, p]));
      positions.forEach((p) => { p._terna = []; });
      for (const t of terna) {
        const p = pById.get(t.position_id);
        const c = cById.get(t.candidate_id);
        if (!p || !c) continue;
        p._terna.push(c);
        c._ternas.push(p);
      }
    }
    set({ stages, stageMap, positions, candidates, hires, nomina, loading: false, error: null, loadedAt: new Date() });
  } catch (e) {
    console.error(e);
    set({ loading: false, error: e.message || String(e) });
  }
}

export const stageOrder = (code) => state.stageMap[code]?.orden ?? -1;
export const stageLabel = (code) => state.stageMap[code]?.label ?? code;
