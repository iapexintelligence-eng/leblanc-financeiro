// Liga a ficha do cliente às parcelas a receber (tabela a_receber), que foram lançadas com o nome
// do cliente nem sempre igual ao do contrato ("Luiz Felipe Russo" × "LUIZ FELIPE RUSSO SCHMIDT").
const LIGA = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
export const tokensNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !LIGA.has(t))

// Mesmo cliente quando todas as palavras do nome mais curto estão no mais longo (mínimo nome + sobrenome).
export function mesmoCliente(a, b) {
  const x = tokensNome(a), y = tokensNome(b)
  if (x.length < 2 || y.length < 2) return false
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x]
  const s = new Set(longo)
  return curto[0] === longo[0] && curto.every((t) => s.has(t))
}

// Contrato HIST-V116 (importado de vendas) corresponde ao projeto PROJ-V116.
export const projetoDoContrato = (numero) => { const m = String(numero || '').match(/^(?:HIST|CTR)-V(\d+)$/i); return m ? `PROJ-V${m[1]}` : null }

// Projeto do contrato em Entradas: o da venda (PROJ-V<id>) quando o contrato tem venda; senão pelo número.
export const projetoDeContrato = (c) => (c?.venda_id ? `PROJ-V${c.venda_id}` : projetoDoContrato(c?.numero))

// Resumo do que o cliente paga: total lançado, recebido, em aberto e o que falta lançar do contrato.
export function resumoReceber(parcelas, valorContrato) {
  const lancado = (parcelas || []).reduce((s, r) => s + (Number(r.valor_parcela) || 0), 0)
  const aberto = (parcelas || []).reduce((s, r) => s + emAberto(r), 0)
  const recebido = Math.max(0, lancado - aberto)
  const total = Number(valorContrato) || 0
  const r2 = (n) => Math.round(n * 100) / 100
  return { lancado: r2(lancado), recebido: r2(recebido), aberto: r2(aberto), naoLancado: r2(Math.max(0, total - lancado)), aReceber: r2(aberto + Math.max(0, total - lancado)) }
}

export const emAberto = (r) => r.status === 'Recebido' ? 0 : Math.max(0, (Number(r.valor_parcela) || 0) - (Number(r.valor_recebido) || 0))

export function parcelasDoCliente(rows, { nome, projeto } = {}) {
  return (rows || []).filter((r) => (projeto && r.projeto_uid === projeto) || mesmoCliente(r.cliente_nome, nome))
    .sort((a, b) => (a.data_prevista || '9999').localeCompare(b.data_prevista || '9999'))
}

export const FORMAS_RECEBIMENTO = ['Pix', 'Transferência', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Financiamento', 'Cheque']
