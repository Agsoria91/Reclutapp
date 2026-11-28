// Auditoría de RRHH sobre la recomendación del entrevistador: confirmar (aplica el cambio de etapa)
// o no confirmar (el candidato sigue donde estaba). Funciona desde la ficha y el Centro de control.
import { state, loadAll } from '../lib/store.js';
import { sb } from '../lib/supabase.js';
import { toast, confirmDialog } from './ui.js';

const ABIERTAS = new Set(['cv_recibido', 'entrevista']);

export async function revisarResultado(evId, accion) {
  const ev = (state.evaluaciones || []).find((x) => x.id === evId);
  if (!ev || !state.isStaff) return false;
  const c = state.candidates.find((x) => x.id === ev.candidate_id);
  const nombre = c?.nombre || 'el candidato';
  const abierta = c && ABIERTAS.has(c.stage);
  if (accion === 'confirmada') {
    const txt = !abierta ? `${nombre} ya no está en entrevista. ¿Marcar la recomendación como confirmada sin cambiar su etapa?`
      : ev.decision === 'rechazado' ? `¿Confirmar el rechazo de ${nombre}? Queda cancelado${ev.motivo ? ` (${ev.motivo})` : ''}${c._silla ? ` y la silla "${c._silla.puesto}" queda libre` : ''}.`
      : `¿Confirmar que ${nombre} avanza a "Entrevista aprobada"?`;
    if (!(await confirmDialog(txt, { ok: 'Confirmar', danger: abierta && ev.decision === 'rechazado' }))) return false;
    if (abierta) {
      const cambio = ev.decision === 'rechazado'
        ? { stage: 'cancelado', cancelado: true, motivos_baja: ev.motivo ? [ev.motivo] : c.motivos_baja || [], en_entrevista: c.en_entrevista || ev.fecha }
        : { stage: 'entrevista_aprobada', entrevista_ok: true, en_entrevista: c.en_entrevista || ev.fecha };
      const { error } = await sb.from('candidates').update(cambio).eq('id', c.id);
      if (error) { toast(error.message, 'error'); return false; }
    }
  } else if (!(await confirmDialog(`¿No confirmar la recomendación de ${ev.evaluador_nombre || 'el entrevistador'}? ${nombre} sigue en su etapa actual.`, { ok: 'No confirmar' }))) return false;
  const { error } = await sb.from('evaluaciones').update({ revision: accion }).eq('id', ev.id);
  if (error) { toast(error.message, 'error'); return false; }
  toast(accion === 'confirmada' ? 'Recomendación confirmada' : 'Recomendación no confirmada', 'ok');
  await loadAll({ silent: true });
  return true;
}

// Botones [data-ev-revisar] en cualquier pantalla
export function initAuditoria() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ev-revisar]');
    if (!b) return;
    e.preventDefault();
    const ev = (state.evaluaciones || []).find((x) => x.id === b.dataset.evId);
    const enFicha = !!b.closest('.drawer-root');
    if (await revisarResultado(b.dataset.evId, b.dataset.evRevisar) && enFicha && ev) {
      (await import('../views/candidatos.js')).openCandidate(ev.candidate_id, { pane: 'evaluacion' });
    }
  });
}
