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

test('ficha importada da planilha fica no setor de origem até haver marco real',()=>{
 const d={importacao_revisoes:{setor_codigo:'qualidade'}}
 assert.equal(setorPedido(d),'qualidade')
 assert.equal(noSetor({tipo:'pedido',dados:d},'vendas'),false)
 d.liberacao_em='2026-10-11'
 assert.equal(setorPedido(d),'correcao')
 assert.equal(setorPedido({importacao_revisoes:{setor_codigo:'inexistente'}}),'vendas')
})

test('ficha importada ganha prazo estimado pelas datas da planilha',async()=>{
 const {prazoImportado}=await import('../src/lib/setores.js')
 assert.deepEqual(prazoImportado({importacao_revisoes:{setor_codigo:'correcao',medida:'2026-10-01'}},['2026-10-12']).prazo,'2026-10-20')
 assert.equal(prazoImportado({importacao_revisoes:{setor_codigo:'correcao',lib_medida:'2026-10-09'}}).prazo,'2026-10-14')
 assert.equal(prazoImportado({importacao_revisoes:{setor_codigo:'liberacao',assinatura:'2026-07-09'}}).prazo,'2026-08-27')
 assert.equal(prazoImportado({importacao_revisoes:{setor_codigo:'qualidade',medida:'2026-07-09'}}),null)
 assert.equal(prazoImportado({importacao_revisoes:{setor_codigo:'correcao',medida:'DEZEMBRO'}}),null)
 assert.equal(prazoImportado({liberacao_em:'2026-10-01',importacao_revisoes:{setor_codigo:'correcao',medida:'2026-10-01'}}),null)
})
