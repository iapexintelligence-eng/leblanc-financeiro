const moeda = valor => valor == null ? 'Não informado' : Number(valor).toLocaleString('pt-BR', {style:'currency',currency:'BRL'})

export default function ConferenciaPlanilha({conferencia, aba}) {
  if (!conferencia) return null
  const comparacoes = (conferencia.comparacoes || []).filter(item => item.aba === aba)
  const referencias = (conferencia.referencias || []).filter(item => item.aba === aba)
  return <section style={{margin:'20px 0',padding:16,border:'1px solid #d9cabb',borderRadius:8}}>
    <h3>Conferência com as vendas</h3>
    <p>Comparação registrada em {conferencia.data}. As sugestões abaixo usam nomes das planilhas. Ainda precisam de conferência do cliente, contrato e período; não criam vínculos, pagamentos ou comissões automaticamente.</p>
    {comparacoes.map((item,index) => <div key={index}>
      <p><strong>{item.criterio}</strong></p>
      {item.candidatos.length ? item.candidatos.map(venda => <p key={venda.id}>
        Venda #{venda.id} · {venda.cliente} · {venda.data} · valor vendido no sistema: <strong>{moeda(venda.valor)}</strong>.
        {' '}{venda.celulas_valor_igual?.length ? `O mesmo número aparece em ${venda.celulas_valor_igual.join(', ')}; conferir o significado da célula.` : 'Não foi encontrado esse valor exato nas células numéricas desta aba. Conferir composição e contrato.'}
      </p>) : <p>Identifique o cliente e o contrato desta aba antes de integrar seus valores. Abas numeradas não são tratadas como nomes de clientes.</p>}
    </div>)}
    {referencias.length > 0 && <details><summary>{referencias.length} referências com nome completo igual nesta aba</summary><div style={{overflowX:'auto'}}><table><thead><tr><th>Origem</th><th>Possível venda</th><th>Data da venda</th><th>Valor no sistema</th></tr></thead><tbody>{referencias.map((r,index)=><tr key={index}><td>{r.celula}</td><td>#{r.venda_id} · {r.cliente}</td><td>{r.data_venda}</td><td>{moeda(r.valor_sistema)}</td></tr>)}</tbody></table></div></details>}
    {!comparacoes.length && !referencias.length && <p>Nenhuma referência segura de nome foi identificada nesta aba. Isso não significa que ela esteja vazia ou que deva ser descartada.</p>}
    <p className="sub">Valores brutos, líquidos após taxas, kits e marketing têm significados diferentes. Nomes ou números iguais, isoladamente, não comprovam um vínculo. Esta comparação é uma fotografia da data acima.</p>
  </section>
}
