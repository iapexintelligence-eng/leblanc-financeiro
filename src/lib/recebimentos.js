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

export const emAberto = (r) => r.status === 'Recebido' ? 0 : Math.max(0, (Number(r.valor_parcela) || 0) - (Number(r.valor_recebido) || 0))

export function parcelasDoCliente(rows, { nome, projeto } = {}) {
  return (rows || []).filter((r) => (projeto && r.projeto_uid === projeto) || mesmoCliente(r.cliente_nome, nome))
    .sort((a, b) => (a.data_prevista || '9999').localeCompare(b.data_prevista || '9999'))
}

export const FORMAS_RECEBIMENTO = ['Pix', 'Transferência', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Financiamento', 'Cheque']
