// Formas aceitas pelo banco em pagamentos e custos operacionais (sem acento), com o rótulo da tela.
export const FORMAS_PAGAMENTO = [['PIX', 'PIX'], ['Boleto', 'Boleto'], ['Transferencia', 'Transferência'], ['Cartao', 'Cartão'], ['Dinheiro', 'Dinheiro']]

// "Transferência" / "cartão" / "pix" → valor gravável; vazio continua vazio.
export function formaPagamento(v) {
  const s = String(v || '').trim()
  if (!s) return null
  const n = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const achou = FORMAS_PAGAMENTO.find(([valor]) => valor.toLowerCase() === n)
  return achou ? achou[0] : s
}
