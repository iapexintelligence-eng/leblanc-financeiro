import { parsePromobXML } from './promob.js'

// Leitura para a conferência: falha de leitura é informada, nunca convertida em zero.
export function lerXmlRevisao(text) {
  try {
    const p = parsePromobXML(text)
    const total = Number(p.total)
    const ambientes = p.ambientes.map((a) => ({ descricao: a.descricao, valor: Number.isFinite(a.valor) && a.valor > 0 ? a.valor : null }))
    if (!Number.isFinite(total) || total <= 0) return { total: null, ambientes, fornecedor: p.fornecedor, erro: 'Total de tabela não encontrado no arquivo' }
    return { total: Math.round(total * 100) / 100, ambientes, fornecedor: p.fornecedor, erro: null }
  } catch (e) {
    return { total: null, ambientes: [], fornecedor: '', erro: e.message || 'Arquivo XML ilegível' }
  }
}

export async function sha256Hex(buffer) {
  const h = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const CUSTOS_XML = [
  ['fabrica', 'Custo da fábrica (pedido/cobrança da indústria)'],
  ['kits', 'Kits (LED, metalon e outros)'],
  ['frete', 'Frete'],
  ['montagem', 'Montagem'],
  ['taxas', 'Taxas de cartão / financeira absorvidas pela loja'],
  ['outros', 'Outros custos acordados'],
]

export const NIVEL = { bloqueio: 'danger', conferir: 'warn', aviso: '' }
export const RESULTADO_COR = { 'Dentro das regras': 'ok', 'Precisa conferir': 'warn', Bloqueado: 'danger' }
