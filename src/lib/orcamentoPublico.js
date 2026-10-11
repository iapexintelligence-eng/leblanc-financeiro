const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const brl = v => Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

// A proposta impressa contém somente campos escolhidos; nunca serializa o cadastro interno.
export function htmlOrcamento(d, total, pagamentos) {
  if(!Number.isFinite(total)||total<=0) throw new Error('Informe um valor válido para a proposta.')
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Orçamento Le Blanc</title>
  <style>body{font:14px Arial,sans-serif;color:#222;max-width:820px;margin:40px auto;padding:24px}h1{font:32px Georgia}table{border-collapse:collapse;width:100%;margin:24px 0}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}small{color:#555}button{padding:10px}@media print{button{display:none}body{margin:0}}</style>
  <h1>Le Blanc · Orçamento</h1><p>Cliente: <b>${esc(d.cliente_nome)}</b><br>Responsável: ${esc(d.vendedor)}</p>
  <table><thead><tr><th>Quantidade</th><th>Ambiente / descrição</th></tr></thead><tbody>${(d.itens||[]).map(i=>`<tr><td>${esc(i.qtd)}</td><td>${esc(i.descricao)}</td></tr>`).join('')}</tbody></table>
  <h2>Investimento total: ${esc(brl(total))}</h2>
  <p>${pagamentos.map(p=>esc(p)).join('<br>')}</p>
  <p><small>Proposta em negociação, sujeita à conferência dos dados e às autorizações aplicáveis. As condições finais serão registradas no contrato. Este orçamento não confirma pagamento nem inicia prazos de execução.</small></p>
  <button onclick="window.print()">Imprimir / salvar PDF</button></html>`
}

export function imprimirOrcamento(d,total,pagamentos) {
  const html=htmlOrcamento(d,total,pagamentos)
  const janela=window.open('','_blank')
  if(!janela)throw new Error('Permita a abertura da prévia para imprimir o orçamento.')
  janela.opener=null
  janela.document.write(html);janela.document.close()
}
