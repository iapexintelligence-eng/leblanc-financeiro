// Taxas Le Blanc (julho/26). Ajustáveis conforme a loja atualizar.

// Cartão — MDR (custo da loja) por bandeira/faixa
export const CARTAO = {
  'Visa / Master / Elo': { debito: 0.89, credito_avista: 2, credito_2_6: 1.69, credito_7_21: 1.99 },
  'Amex': { debito: null, credito_avista: 4.69, credito_2_6: 4.99, credito_7_21: 4.99 },
}
export const ACRESCIMO_PARCELADO = 1.55 // % adicionado ao cliente em vendas parceladas no crédito

// Financeira Santander — { carencia: { prazo: {coef, ret(%)} } }
export const FINANCEIRA = {
  30: { 1:[1.04390,4.21],2:[0.52360,4.51],3:[0.34980,4.71],4:[0.26550,5.84],5:[0.21494,6.95],6:[0.18125,8.04],7:[0.15690,8.95],8:[0.13887,9.99],9:[0.12487,11.02],10:[0.11367,12.03],11:[0.10452,13.02],12:[0.09690,14.00],13:[0.09075,15.24],14:[0.08524,16.20],15:[0.08047,17.15],16:[0.07630,18.09],17:[0.07263,19.01],18:[0.06937,19.91],19:[0.06646,20.81],20:[0.06384,21.68],21:[0.06148,22.55],22:[0.05934,23.40],23:[0.05739,24.24],24:[0.05604,25.64] },
  60: { 1:[1.08973,8.23],2:[0.53998,7.40],3:[0.35837,6.99],4:[0.27200,8.09],5:[0.22020,9.17],6:[0.18569,10.24],7:[0.16066,11.08],8:[0.14221,12.10],9:[0.12786,13.10],10:[0.11640,14.09],11:[0.10703,15.06],12:[0.09922,16.01],13:[0.09298,17.27],14:[0.08733,18.21],15:[0.08244,19.13],16:[0.07817,20.05],17:[0.07441,20.95],18:[0.07107,21.83],19:[0.06809,22.70],20:[0.06541,23.56],21:[0.06299,24.40],22:[0.06080,25.23],23:[0.05880,26.05],24:[0.05745,27.47] },
}

export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100

export function taxaCartaoMDR(bandeira, tipo, parcelas) {
  const b = CARTAO[bandeira]; if (!b) return 0
  if (tipo === 'Débito') return b.debito || 0
  if (parcelas <= 1) return b.credito_avista
  if (parcelas <= 6) return b.credito_2_6
  return b.credito_7_21
}

// Taxas fornecidas pela loja. Antecipação mensal Sicoob: estimativa por vencimento
// mensal (30, 60, ... dias); conciliar o líquido com o demonstrativo da operadora.
export const CIELO_ANTECIPACAO = [0,1.29,0.70,0.80,1,0.90,0.85,0.70,0.70,0.70,0.70,0.80,0.75]
export function simularCartao(valor, bandeira, tipo, parcelas, operadora = 'Sicoob', absorver = false) {
  valor = Number(valor)
  const n = tipo === 'Débito' ? 1 : Number(parcelas)
  const max = operadora === 'Cielo' ? 18 : 21
  if (!Number.isFinite(valor) || valor < 0 || !Number.isInteger(n) || n < 1 || n > max) return { erro: `Informe valor válido e de 1 a ${max} parcelas.`, n:0, valorCliente:0, lojaRecebe:0 }
  if (!['Sicoob','Cielo'].includes(operadora) || !CARTAO[bandeira] || (tipo === 'Débito' && CARTAO[bandeira].debito == null) || (operadora === 'Cielo' && bandeira === 'Amex')) return {erro:'Combinação sem taxa cadastrada.',n:0,valorCliente:0,lojaRecebe:0}
  const mdr = operadora === 'Cielo' ? (tipo === 'Débito' ? 0.79 : n === 1 ? 1.40 : n <= 6 ? 2.29 : 2.69) : taxaCartaoMDR(bandeira,tipo,n)
  const ant = tipo === 'Débito' ? 0 : operadora === 'Cielo' ? CIELO_ANTECIPACAO[Math.min(n,12)] : n > 1 ? ACRESCIMO_PARCELADO*(n+1)/2 : 0
  const fator = (1-mdr/100)*(1-ant/100)
  const valorCliente = absorver ? round2(valor) : round2(valor/fator)
  const lojaRecebe = round2(valorCliente*fator)
  return {valorCliente, parcela:round2(valorCliente/n), n, taxaCliente:round2((valorCliente/Math.max(valor,0.01)-1)*100),mdr,antecipacao:round2(ant),lojaRecebe,custo:round2(valorCliente-lojaRecebe),estimativa:true}
}

// Financeira: repasse pro cliente (engorda pela retenção). Loja recebe o valor cheio.
export function simularFinanceira(valor, carencia, prazo, absorver = false) {
  valor = Number(valor) || 0
  const t = FINANCEIRA[carencia]?.[prazo]
  if (!t) return null
  const [coef, ret] = t
  const financiado = absorver ? valor : valor / (1 - ret / 100)
  const parcela = round2(financiado * coef)
  return { parcela, n: prazo, valorCliente: round2(parcela * prazo), retencao: ret, coef, financiado: round2(financiado), lojaRecebe: round2(financiado * (1 - ret / 100)) }
}
