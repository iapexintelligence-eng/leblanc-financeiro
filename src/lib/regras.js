// Fonte das regras comerciais e operacionais confirmadas em 28/09/2026.
export const VERSAO_REGRAS = '2026-09-28'
export const MARKETING = 0.15
export const LIMITES_DESCONTO = { Bartzen: 40, Menezes: 50 }
export const APROVADORAS = ['Priscila', 'Andressa', 'Catelli']
export const PRAZOS = { planta: 2, medicao: 5, correcao: 12, entrega: 35, assistencia: 30 }
export const centavos = (v) => Math.round((Number(v) + Number.EPSILON) * 100)
export const dinheiro = (v) => centavos(v) / 100

export function calcularProposta(itens, desconto = 0, tipo = 'pct') {
  const original = dinheiro(itens.reduce((s, i) => s + Number(i.valor || 0) * Number(i.qtd || 1), 0))
  if (original < 0 || !Number.isFinite(original) || !Number.isFinite(Number(desconto)) || Number(desconto) < 0) throw new Error('Valores e descontos devem ser positivos.')
  const marketing = dinheiro(original * MARKETING)
  const base = dinheiro(original + marketing)
  const abatimento = dinheiro(tipo === 'pct' || tipo === '%' ? base * Number(desconto) / 100 : Number(desconto))
  if (abatimento > base) throw new Error('Desconto superior ao valor da proposta.')
  const percentual = base ? abatimento / base * 100 : 0
  const industrias = [...new Set(itens.filter(i => Number(i.valor) > 0).map(i => i.fornecedor))]
  // Contratos mistos respeitam o menor limite. Indústrias não definidas exigem aprovação.
  const limite = industrias.length ? Math.min(...industrias.map(i => LIMITES_DESCONTO[i] ?? 0)) : 0
  return { original, marketing, base, abatimento, percentual, limite, final: dinheiro(base - abatimento), exigeAutorizacao: percentual > limite + 0.00001 }
}

export function dividirParcelas(total, n) {
  if (!Number.isInteger(n) || n < 1 || n > 24 || !Number.isFinite(Number(total)) || Number(total) < 0) throw new Error('Parcelamento inválido.')
  const cents = centavos(total), base = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => (base + (i < cents % n ? 1 : 0)) / 100)
}

export function percentualGratificacao(venda) {
  const v = Number(venda)
  if (!Number.isFinite(v) || v < 35000) return null
  return v < 50000 ? 3 : v < 80000 ? 4 : v < 110000 ? 5 : 6
}

export function calcularGratificacao(venda, deducoes) {
  const aliquota = percentualGratificacao(venda)
  if (aliquota === null || deducoes == null) return null
  const custo = deducoes.reduce((s, d) => s + Number(d.valor), 0)
  if (!Number.isFinite(custo) || deducoes.some(d => Number(d.valor) < 0)) throw new Error('Deduções inválidas.')
  const liquido = Math.max(0, dinheiro(Number(venda) - custo))
  return { aliquota, liquido, valor: dinheiro(liquido * aliquota / 100) }
}

// Somente campos públicos. Valores de tabela, kits e composição nunca vão à impressão.
export function contratoPublico(d) {
  const campos = ['numero','cliente_nome','cliente_cpf','cliente_rg','cliente_nascimento','cliente_telefone','cliente_email','cliente_profissao','endereco','bairro','cidade','uf','cep','entrega_endereco','vendedor','loja','data_contrato','tipo_contrato','modelo_contrato','led_incluso','observacao_ambientes','observacoes','condicao_pagamento','forma_pagamento','data_entrada','prazo_entrega']
  const out = Object.fromEntries(campos.map(k => [k, d[k] || '']))
  out.itens = (d.itens || []).map(i => ({ qtd: i.qtd, descricao: i.descricao, fornecedor: i.fornecedor, linha: i.linha }))
  out.parcelas = (d.parcelas || []).map(p => ({ numero: p.numero, valor: p.valor, vencimento: p.vencimento, marco: p.marco }))
  out.total_pagar = dinheiro(out.parcelas.reduce((s,p) => s + Number(p.valor || 0), 0))
  return out
}
