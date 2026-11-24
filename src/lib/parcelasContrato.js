// Sugestão das parcelas a receber a partir da forma de pagamento escrita no contrato
// ("160.000,00 + 100.000,00 no agendamento da montagem e mais 7.000 na finalização").
// É só um ponto de partida: a Léia confere valores e datas antes de lançar em Entradas.

// Valor em dinheiro: "160.000,00", "9348,58", "7.000", "2.875", "1500". Ignora "2 dias", "1/2", "24x".
const DINHEIRO = /(?<![\d/])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{4,}(?:,\d{1,2})?|\d{1,3},\d{1,2})(?![\d/x])/gi
export const paraNumero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'))

export function addDias(iso, dias) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10)
}
export function addMeses(iso, meses) {
  if (!iso) return ''
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ult = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ult)); return alvo.toISOString().slice(0, 10)
}

function formaDe(t) {
  if (/cart[aã]o|cr[eé]dito/i.test(t)) return /d[eé]bito/i.test(t) ? 'Cartão de débito' : 'Cartão de crédito'
  if (/boleto/i.test(t)) return 'Boleto'
  if (/financ/i.test(t)) return 'Financiamento'
  if (/cheque/i.test(t)) return 'Cheque'
  if (/dinheiro|esp[eé]cie/i.test(t)) return 'Dinheiro'
  if (/transf|ted\b|doc\b/i.test(t)) return 'Transferência'
  return 'Pix'
}
const limpa = (s) => String(s || '').replace(/\s+/g, ' ').replace(/^[\s,;.e]+|[\s,;.]+$/g, '').trim()

// Retorna { linhas: [{ descricao, valor, data_prevista, forma }], soma, diferenca }
export function sugerirParcelas(forma, total, dataContrato) {
  const texto = String(forma || '').replace(/\s+/g, ' ').trim()
  const valorTotal = Number(total) || 0
  const pedacos = texto ? texto.split(/\s*\+\s*|\s+e\s+mais\s+|;\s*/i).map(limpa).filter(Boolean) : []
  const linhas = []
  pedacos.forEach((p, i) => {
    const valores = [...p.matchAll(DINHEIRO)].map((m) => paraNumero(m[1])).filter((v) => v > 0)
    const valor = valores.length ? Math.max(...valores) : null
    const vezes = Number((p.match(/(\d{1,2})\s*x\b/i) || [])[1]) || 1
    const fp = formaDe(p)
    const entrada = i === 0 || /entrada|assinatura|ato\b/i.test(p)
    const data = entrada ? dataContrato || '' : ''
    // Boleto/cheque em N vezes: uma linha por mês, a partir de 30 dias depois do contrato.
    if (valor && vezes > 1 && /boleto|cheque/i.test(fp)) {
      const parcela = Math.round((valor / vezes) * 100) / 100
      for (let k = 0; k < vezes; k++) {
        const v = k === vezes - 1 ? Math.round((valor - parcela * (vezes - 1)) * 100) / 100 : parcela
        linhas.push({ descricao: `${fp} ${k + 1}/${vezes}`, valor: v, data_prevista: dataContrato ? addMeses(addDias(dataContrato, 30), k) : '', forma: fp })
      }
      return
    }
    linhas.push({ descricao: limpa(p.replace(DINHEIRO, '').replace(/r\$\s*/gi, '')) || (entrada ? 'Entrada' : `Parcela ${i + 1}`), valor, data_prevista: data, forma: fp, vezes: vezes > 1 ? vezes : undefined })
  })
  // Sem forma de pagamento: uma parcela única com o total.
  if (!linhas.length && valorTotal > 0) linhas.push({ descricao: 'Valor do contrato', valor: valorTotal, data_prevista: dataContrato || '', forma: 'Pix' })
  // Um pedaço sem valor ("+ finalização da montagem"): fica com a diferença para o total.
  const semValor = linhas.filter((l) => l.valor == null)
  const somaCom = linhas.reduce((s, l) => s + (l.valor || 0), 0)
  if (semValor.length === 1 && valorTotal > somaCom) semValor[0].valor = Math.round((valorTotal - somaCom) * 100) / 100
  for (const l of linhas) if (l.valor == null) l.valor = 0
  const soma = Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100
  return { linhas, soma, diferenca: Math.round((valorTotal - soma) * 100) / 100 }
}
