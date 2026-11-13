import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Trae todas las filas paginando de a 1000 (límite por defecto de PostgREST).
export async function fetchAll(table, select = '*', order = 'id') {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb.from(table).select(select).order(order).range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}
