// Meta mensal com vigência: chaves "meta_mensal:AAAA-MM" valem a partir do mês indicado.
// A chave "meta_mensal" sem mês é o valor padrão quando nenhuma vigência cobre o período.
export function metaDoMes(config, ym) {
  const linhas = (config || []).filter((c) => c && typeof c.chave === 'string' && c.chave.startsWith('meta_mensal'))
  const vigencias = linhas
    .map((c) => ({ desde: c.chave.split(':')[1] || '', valor: Number(c.valor) }))
    .filter((v) => /^\d{4}-\d{2}$/.test(v.desde) && Number.isFinite(v.valor) && v.desde <= ym)
    .sort((a, b) => b.desde.localeCompare(a.desde))
  if (vigencias.length) return vigencias[0].valor
  const padrao = linhas.find((c) => c.chave === 'meta_mensal')
  return padrao ? Number(padrao.valor) || 0 : 0
}

// Vendas do financeiro antigo + contratos emitidos no fluxo novo que ainda não viraram venda.
export function vendasConsolidadas(vendas, contratos) {
  const novas = (contratos || [])
    .filter((c) => c.dados_json?.regras_versao === '2026-09-28' && c.status === 'Emitido' && !c.dados_json?.venda_id)
    .map((c) => ({
      valor_vendido: Number(c.dados_json?.valor_negociado ?? c.valor_final) || 0,
      data_venda: c.dados_json?.data_contrato || (c.created_at || '').slice(0, 10),
      vendedor: c.vendor || c.dados_json?.vendedor || null,
      origem: 'contrato',
    }))
  return [...(vendas || []), ...novas]
}
