// Estado global mínimo + carga de datos.
// La decisión de QUÉ datos viajan al navegador se toma acá y en la base:
//   - sin login de RRHH se leen SOLO las vistas *_public (sin campos sensibles);
//   - con login de RRHH se leen las tablas completas (RLS lo permite solo a staff).
import { sb, fetchAll } from './supabase.js';

const listeners = new Set();
export const state = {
  session: null,
  isStaff: false,
  canRead: false,  // RRHH o lector corporativo habilitado (sin esto no se carga ningún dato)
  authChecked: false,
  loading: true,
  error: null,
  stages: [],
  stageMap: {},
  positions: [],
  candidates: [],
  hires: [],
  nomina: [],
  historial: [],   // solo RRHH: quién pasó por cada silla
  sap: [],         // solo RRHH: maestro de posiciones ocupadas de SAP
  avisos: [],      // solo RRHH: avisos enviados a candidatos
  plantillas: [],  // solo RRHH: textos de los avisos
  evaluaciones: [], // solo RRHH: evaluaciones de entrevista (todas)
  misEntrevistas: [], // entrevistador: su lista (la base la recorta a su alcance)
  isEntrevistador: false,
  loadedAt: null,
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { listeners.forEach((fn) => fn(state)); }
export function set(patch) { Object.assign(state, patch); emit(); }

export async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  const session = data.session;
  let isStaff = false;
  let canRead = false;
  let isEntrevistador = false;
  if (session) {
    const [st, rd, en] = await Promise.all([sb.rpc('is_staff'), sb.rpc('puede_leer'), sb.rpc('es_entrevistador')]);
    isStaff = !st.error && st.data === true;
    canRead = isStaff || (!rd.error && rd.data === true);
    isEntrevistador = !isStaff && !en.error && en.data === true;
  }
  state.session = session;
  state.isStaff = isStaff;
  state.canRead = canRead;
  state.isEntrevistador = isEntrevistador;
  state.authChecked = true;
}

export async function loadAll({ silent = false } = {}) {
  // Sin cuenta habilitada no se pide NADA a la base (y la base tampoco lo daría).
  if (!state.canRead && !state.isEntrevistador) {
    set({ stages: [], stageMap: {}, positions: [], candidates: [], hires: [], nomina: [], historial: [], avisos: [], plantillas: [], sap: [], evaluaciones: [], misEntrevistas: [], loading: false, error: null });
    return;
  }
  // Entrevistador (supervisor): solo su lista, ya recortada por la base a su alcance
  if (!state.canRead) {
    if (!silent) set({ loading: true, error: null });
    try {
      const [stages, mis] = await Promise.all([fetchAll('stages', '*', 'orden'), sb.rpc('mis_entrevistas')]);
      if (mis.error) throw mis.error;
      set({ stages, stageMap: Object.fromEntries(stages.map((s) => [s.code, s])), misEntrevistas: mis.data || [], positions: [], candidates: [], loading: false, error: null, loadedAt: new Date() });
    } catch (e) { console.error(e); set({ loading: false, error: e.message || String(e) }); }
    return;
  }
  if (!silent) set({ loading: true, error: null });
  try {
    const staff = state.isStaff;
    const [stages, positions, candidates, terna, nomina, historial, avisos, plantillas, sap, evaluaciones, misEntrevistas] = await Promise.all([
      fetchAll('stages', '*', 'orden'),
      fetchAll(staff ? 'positions' : 'positions_public'),
      fetchAll(staff ? 'candidates' : 'candidates_public'),
      staff ? fetchAll('position_candidates', '*', 'added_at') : Promise.resolve([]),
      staff ? fetchAll('nomina', '*', 'nombre') : Promise.resolve([]),
      // tabla nueva: si todavía no existe en la base, la app sigue funcionando sin historial
      staff ? fetchAll('position_history', '*', 'desde').catch((e) => { console.warn('historial', e); return []; }) : Promise.resolve([]),
      staff ? fetchAll('avisos', '*', 'enviado_at').catch(() => []) : Promise.resolve([]),
      staff ? fetchAll('plantillas_aviso', '*', 'orden').catch(() => []) : Promise.resolve([]),
      // maestro de posiciones ocupadas de SAP (solo RRHH)
      staff ? fetchAll('sap_posiciones', 'pos,dni,nombre,puesto,ceco', 'pos').catch(() => []) : Promise.resolve([]),
      staff ? fetchAll('evaluaciones', '*', 'fecha').catch(() => []) : Promise.resolve([]),
      state.isEntrevistador ? sb.rpc('mis_entrevistas').then((r) => r.data || []) : Promise.resolve([]),
    ]);
    const stageMap = Object.fromEntries(stages.map((s) => [s.code, s]));
    // Legajos = la nómina filtrada a quienes ingresaron por una silla (mismo registro)
    const hires = nomina.filter((n) => n.position_id || n.candidate_id);
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
    if (staff) {
      const porCand = new Map();
      for (const ev of evaluaciones) { if (!porCand.has(ev.candidate_id)) porCand.set(ev.candidate_id, []); porCand.get(ev.candidate_id).push(ev); }
      candidates.forEach((c) => { c._evals = porCand.get(c.id) || []; });
    }
    set({ stages, stageMap, positions, candidates, hires, nomina, historial, avisos, plantillas, sap, evaluaciones, misEntrevistas, loading: false, error: null, loadedAt: new Date() });
  } catch (e) {
    console.error(e);
    set({ loading: false, error: e.message || String(e) });
  }
}

export const stageOrder = (code) => state.stageMap[code]?.orden ?? -1;
export const stageLabel = (code) => state.stageMap[code]?.label ?? code;
