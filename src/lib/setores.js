export const SETORES = {
 vendas:{titulo:'Vendas',descricao:'Propostas, contratos e checklist. Vendas futuras ficam separadas até a liberação do imóvel.',tipos:['pedido']},
 correcao:{titulo:'Correção',descricao:'Medição em até 5 dias corridos; conferência e guias em até 12 dias úteis após a medição.',tipos:['pedido']},
 liberacao:{titulo:'Liberação',descricao:'Aprovação e guias assinadas, implantação pelo conferente e pagamento da fábrica pela Leia.',tipos:['pedido']},
 montagem:{titulo:'Montagem',descricao:'Glauci acompanha o recebimento, organiza a entrega e agenda os montadores. A escala depende da quitação conferida.',tipos:['pedido','agenda','frete']},
 qualidade:{titulo:'Qualidade',descricao:'Conclusão da montagem, termo assinado, assistências em até 30 dias úteis e agendamento das fotos.',tipos:['pedido','assistencia']},
}
export function setorPedido(d) {
 if(d.entrega_em||d.montagem_concluida_em||d.fotos_em)return 'qualidade'
 if(d.carregamento_em||d.cliente_recebe_em)return 'montagem'
 if(d.correcao_em||d.aprovacao_em||d.implantacao_em||d.fabrica_paga)return 'liberacao'
 if(d.liberacao_em||d.medicao_em)return 'correcao'
 return 'vendas'
}
export function noSetor(registro,setor) {
 if(!setor)return true
 if(registro.tipo==='pedido')return setorPedido(registro.dados)===setor
 return SETORES[setor]?.tipos.includes(registro.tipo)||false
}
