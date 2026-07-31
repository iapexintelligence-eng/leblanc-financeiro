import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// authOn = true quando as credenciais estão configuradas (produção).
// Sem credenciais, o app abre em modo demonstração.
export const authOn = !!(url && anon)

// Cliente principal apontado para o schema le_admin do Supabase.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder',
  {
    db: { schema: 'le_admin' },
    auth: { persistSession: true, autoRefreshToken: true },
  }
)

// Cliente no schema public (para auth e tabelas fora de le_admin, se preciso).
export const supabasePublic = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder'
)
