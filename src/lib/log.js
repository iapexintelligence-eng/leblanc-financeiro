import { supabase } from './supabase.js'

// Registra uma edição/criação/exclusão em le_admin.log_edicoes.
// diff: objeto { campo: [antes, depois] } (opcional).
export async function registrarLog({ tabela, registroId, acao = 'edicao', diff = null, descricao = '', responsavel = '' }) {
  try {
    let quem = responsavel
    if (!quem) {
      const { data } = await supabase.auth.getUser()
      quem = data?.user?.email || 'sistema'
    }
    await supabase.from('log_edicoes').insert({
      tabela, registro_id: registroId, acao,
      alteracoes: diff || {}, descricao: descricao || null,
      responsavel: quem, editado_por: quem,
    })
  } catch (_) { /* log não deve travar a operação */ }
}

// Monta o diff entre dois objetos, apenas dos campos que mudaram.
export function montarDiff(antes, depois, campos) {
  const d = {}
  for (const c of campos) {
    const a = antes?.[c] ?? null
    const b = depois?.[c] ?? null
    if (String(a) !== String(b)) d[c] = [a, b]
  }
  return d
}
