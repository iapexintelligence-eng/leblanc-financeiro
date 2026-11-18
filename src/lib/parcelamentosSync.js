import { supabase } from './supabase.js'
import { parcelamentosDasFaturas } from './parcelamentos.js'

// Grava os parcelamentos que aparecem em itens de fatura e ainda não estão cadastrados.
// Usado no botão "Trazer das faturas importadas" e logo depois de subir uma fatura nova.
export async function trazerParcelamentos(itens, mesAtual) {
  const todos = parcelamentosDasFaturas(itens, { aPartirDe: mesAtual })
  if (!todos.length) return 0
  const ids = [...new Set(todos.map((p) => p.cartao_id))]
  const { data, error } = await supabase.from('cartao_parcelamentos').select('cartao_id, chave').in('cartao_id', ids).not('chave', 'is', null).limit(5000)
  if (error) throw error
  const ja = new Set((data || []).map((p) => p.cartao_id + '#' + p.chave))
  const novos = todos.filter((p) => !ja.has(p.cartao_id + '#' + p.chave))
  if (!novos.length) return 0
  const { data: u } = await supabase.auth.getUser()
  const { error: e2 } = await supabase.from('cartao_parcelamentos').insert(novos.map((p) => ({ ...p, criado_por: u?.user?.email || null })))
  if (e2) throw e2
  return novos.length
}
