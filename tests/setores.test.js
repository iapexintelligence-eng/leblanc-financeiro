import test from 'node:test'
import assert from 'node:assert/strict'
import {setorPedido,noSetor} from '../src/lib/setores.js'

test('pedido avança entre setores sem duplicar o registro e mantém venda futura aguardando',()=>{
 const d={tipo_venda:'Futura'}
 assert.equal(setorPedido(d),'vendas')
 d.imovel_pronto_em='2026-09-29'
 assert.equal(setorPedido(d),'vendas')
 for(const [campo,setor] of [['liberacao_em','correcao'],['medicao_em','correcao'],['correcao_em','liberacao'],['aprovacao_em','liberacao'],['implantacao_em','liberacao'],['fabrica_paga','liberacao'],['carregamento_em','montagem'],['entrega_em','qualidade'],['montagem_concluida_em','qualidade'],['fotos_em','qualidade']]){
  d[campo]='2026-09-29';assert.equal(setorPedido(d),setor)
  for(const nome of ['vendas','correcao','liberacao','montagem','qualidade'])assert.equal(noSetor({tipo:'pedido',dados:d},nome),nome===setor)
 }
 assert.equal(noSetor({tipo:'assistencia',dados:{}},'qualidade'),true)
 assert.equal(noSetor({tipo:'assistencia',dados:{}},'montagem'),false)
 assert.equal(noSetor({tipo:'agenda',dados:{}},'montagem'),true)
 assert.equal(noSetor({tipo:'frete',dados:{}},'montagem'),true)
})
