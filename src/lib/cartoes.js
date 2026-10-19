// Cartões de crédito da loja. Cada um reconhece as faturas já importadas pelo nome gravado
// (o leitor grava "Mastercard final 2969", "Visa final 9514", "Nubank"...).
// Para um cartão novo, acrescente uma linha aqui.
export const CARTOES = [
  { id: 'santander-3671', banco: 'Santander', detalhe: 'final 3671', sugestao: 'Mastercard final 3671', re: /\b3671\b/ },
  { id: 'santander-2969', banco: 'Santander', detalhe: 'final 2969', sugestao: 'Mastercard final 2969', re: /\b2969\b/ },
  { id: 'sicredi', banco: 'Sicredi', detalhe: 'Visa final 9514', sugestao: 'Visa final 9514', re: /\b9514\b|sicredi/i },
  { id: 'nubank', banco: 'Nubank', detalhe: '', sugestao: 'Nubank', re: /nubank/i },
  { id: 'viacredi', banco: 'Viacredi', detalhe: 'Mastercard final 3553', sugestao: 'Mastercard final 3553', re: /\b3553\b|viacredi|ailos/i },
  { id: 'sicoob', banco: 'Sicoob', detalhe: '', sugestao: 'Sicoob', re: /sicoob/i },
]

export const cartaoDe = (nome) => CARTOES.find((c) => c.re.test(nome || '')) || null

// Situação de cada cartão num mês: quais nomes gravados correspondem a ele, quantos itens e quanto.
export function situacaoCartoes(rows, mes) {
  const doMes = (rows || []).filter((r) => String(r.mes_ref || '').slice(0, 7) === mes)
  const lista = CARTOES.map((c) => {
    const itens = doMes.filter((r) => c.re.test(r.cartao || ''))
    return { ...c, itens: itens.length, total: itens.reduce((s, r) => s + (Number(r.valor) || 0), 0), nomes: [...new Set(itens.map((r) => r.cartao))] }
  })
  const outros = [...new Set(doMes.filter((r) => !cartaoDe(r.cartao)).map((r) => r.cartao))]
  return { lista, outros, faltam: lista.filter((c) => !c.itens).length }
}
