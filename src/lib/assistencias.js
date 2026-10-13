// Catálogo das assistências: onde foi o erro, quem responde por ele, quanto custou e o que foi cobrado.
export const ORIGENS_ERRO = [
  'A apurar',
  'Venda (informação ou negociação)',
  'Medida técnica',
  'Correção / projeto',
  'Pedido à fábrica (implantação)',
  'Fábrica (defeito, peça errada ou faltante)',
  'Transporte / frete',
  'Montagem',
  'Cliente / obra',
  'Outro',
]
export const STATUS_COBRANCA = ['Não se aplica (loja arca)', 'A cobrar', 'Cobrado', 'Ressarcido', 'Recusado']
export const INDUSTRIAS_CONHECIDAS = ['Bartzen', 'Menezes', 'Sierra', 'Todeschini']

const n = (v) => Number(v) || 0
const r2 = (v) => Math.round(v * 100) / 100

// Fretes ligados à assistência entram no custo; frete sem assistência fica fora do catálogo.
export function custoAssistencia(a, fretes = []) {
  const d = a.dados || {}
  const fr = fretes.filter((f) => f.dados?.assistencia_id === a.id)
  const frete = r2(fr.reduce((s, f) => s + n(f.dados.valor), 0))
  const pecas = n(d.custo_pecas), maoObra = n(d.custo_mao_obra), outros = n(d.custo_outros)
  const total = r2(pecas + maoObra + outros + frete)
  const cobrado = ['Cobrado', 'Ressarcido', 'Recusado'].includes(d.cobranca_status) ? n(d.cobranca_valor) : 0
  const ressarcido = d.cobranca_status === 'Ressarcido' ? n(d.ressarcido_valor || d.cobranca_valor) : 0
  return { pecas, maoObra, outros, frete, viagens: fr.length, total, cobrado: r2(cobrado), ressarcido: r2(ressarcido), lojaArca: r2(Math.max(0, total - ressarcido)) }
}

export function origemDe(d) {
  if (d?.origem_erro) return d.origem_erro
  // Registros antigos usavam a "causa" simples.
  return { Montagem: 'Montagem', Fabricação: 'Fábrica (defeito, peça errada ou faltante)', Transporte: 'Transporte / frete', Outra: 'Outro' }[d?.causa] || 'A apurar'
}

// Resumo para o painel: por onde foi o erro, por responsável e clientes com retorno.
export function resumoAssistencias(registros, { de = null, ate = null } = {}) {
  const fretes = registros.filter((r) => r.tipo === 'frete')
  const lista = registros.filter((r) => r.tipo === 'assistencia' && (!de || (r.dados.identificada || '') >= de) && (!ate || (r.dados.identificada || '') <= ate))
  const linhas = lista.map((a) => ({ a, origem: origemDe(a.dados), responsavel: (a.dados.responsavel_erro || '').trim() || 'Não definido', ...custoAssistencia(a, fretes) }))
  const agrupar = (chave) => {
    const m = new Map()
    for (const l of linhas) {
      const k = l[chave]
      const g = m.get(k) || { chave: k, qtd: 0, total: 0, frete: 0, cobrado: 0, ressarcido: 0, aCobrar: 0, abertas: 0 }
      g.qtd++; g.total += l.total; g.frete += l.frete; g.cobrado += l.cobrado; g.ressarcido += l.ressarcido
      if (l.a.dados.cobranca_status === 'A cobrar') g.aCobrar += n(l.a.dados.cobranca_valor) || l.total
      if (l.a.dados.status !== 'Resolvida') g.abertas++
      m.set(k, g)
    }
    return [...m.values()].map((g) => ({ ...g, total: r2(g.total), frete: r2(g.frete), cobrado: r2(g.cobrado), ressarcido: r2(g.ressarcido), aCobrar: r2(g.aCobrar) })).sort((x, y) => y.total - x.total || y.qtd - x.qtd)
  }
  const porContrato = new Map()
  for (const l of linhas) porContrato.set(l.a.contrato_id, [...(porContrato.get(l.a.contrato_id) || []), l])
  const retornos = [...porContrato.entries()].filter(([, ls]) => ls.length > 1).map(([contrato_id, ls]) => ({ contrato_id, cliente: ls[0].a.dados.cliente_nome, qtd: ls.length, total: r2(ls.reduce((s, l) => s + l.total, 0)) })).sort((x, y) => y.qtd - x.qtd)
  const totais = linhas.reduce((t, l) => ({ qtd: t.qtd + 1, total: t.total + l.total, frete: t.frete + l.frete, ressarcido: t.ressarcido + l.ressarcido, semOrigem: t.semOrigem + (l.origem === 'A apurar' ? 1 : 0), viagens: t.viagens + l.viagens }), { qtd: 0, total: 0, frete: 0, ressarcido: 0, semOrigem: 0, viagens: 0 })
  return { linhas, porOrigem: agrupar('origem'), porResponsavel: agrupar('responsavel'), retornos, totais: { ...totais, total: r2(totais.total), frete: r2(totais.frete), ressarcido: r2(totais.ressarcido), lojaArca: r2(totais.total - totais.ressarcido) } }
}
