// Clave PUBLICABLE de Supabase: está pensada para vivir en el navegador.
// Lo que protege los datos sensibles son los privilegios por columna + RLS
// definidos en supabase/migrations, no el secreto de esta clave.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://hganqfffgmicpmstqytm.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_qtmCSoRcK59H0C6BgjS6-Q_6BwTNmC6';
export const APP_NAME = 'Reclutamiento EFiS';
