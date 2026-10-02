import { hojeSP, somarDias } from './prazos.js'

// Exemplos somente para a prévia sem credenciais. Nunca enviados ao banco.
export function jornadaDemo() {
 const hoje=hojeSP(), dia=n=>somarDias(hoje,n)
 const clientes=['Cliente exemplo A','Cliente exemplo B','Cliente exemplo C','Cliente exemplo D','Cliente exemplo E']
 const contratos=clientes.map((cliente_nome,i)=>({id:`demo-${i}`,numero:`EXEMPLO-00${i+1}`,cliente_nome}))
 const pessoas=[{usuario_id:'montador-a',nome:'Montador exemplo 1',papel:'montador'},{usuario_id:'montador-b',nome:'Montador exemplo 2',papel:'montador'}]
 const registros=[]
 const add=(tipo,i,dados)=>registros.push({id:`${tipo}-${registros.length}`,tipo,contrato_id:`demo-${i}`,versao:1,dados:{cliente_nome:clientes[i],...dados}})
 add('pedido',0,{tipo_venda:'Normal',venda_data:dia(-22),liberacao_em:dia(-20),medicao_em:dia(-17),correcao_prazo:dia(-1),conferente:'Conferente exemplo'})
 add('pedido',1,{tipo_venda:'Normal',medicao_em:dia(-10),correcao_prazo:dia(2),conferente:'Conferente exemplo'})
 add('pedido',2,{tipo_venda:'Normal',aprovacao_em:dia(-35),implantacao_em:dia(-34),carregamento_em:dia(-1),cliente_recebe_em:hoje,fabrica_paga:true,entrega_prevista:dia(4),entrega_prazo:dia(7),responsavel:'Leia · saldo pendente'})
 add('pedido',3,{tipo_venda:'Normal',aprovacao_em:dia(-40),entrega_prazo:dia(2),entrega_prevista:hoje,cliente_recebe_em:dia(-4),saldo_confirmado:true,fabrica_paga:true,responsavel:'Glauci · montagem liberada'})
 add('pedido',4,{tipo_venda:'Futura',venda_data:dia(-8),responsavel:'Vendedor · aguarda imóvel pronto'})
 add('agenda',2,{montador_id:'montador-a',inicio:hoje,fim:dia(1),confirmada:false,ambientes:'Cozinha · reserva interna, aguardando quitação'})
 add('agenda',3,{montador_id:'montador-b',inicio:hoje,fim:dia(1),confirmada:true,ambientes:'Dormitório · pagamento conferido'})
 add('assistencia',0,{identificada:dia(-42),vencimento:dia(-2),status:'Aguardando peças',descricao:'Exemplo: substituição de frente de gaveta',montador_original:'Montador exemplo 1',responsavel:'Glauci',causa:'A apurar',proxima_acao:'Confirmar chegada da peça'})
 add('assistencia',3,{identificada:dia(-32),vencimento:dia(5),status:'Atendimento agendado',descricao:'Exemplo: ajuste de porta',montador_original:'Montador exemplo 2',responsavel:'Glauci',causa:'A apurar'})
 add('frete',0,{prestador:'Freteiro exemplo',origem:'Loja',destino:'Obra do cliente exemplo A',valor:180,status:'Liberado para pagamento',motivo:'Entrega de peça de assistência',prevista:hoje,realizada:hoje})
 return {contratos,dados:{registros,pessoas,eu:{papel:'visualizacao'},config:{feriados:[],calendario_ate:'2027-12-31'}}}
}
