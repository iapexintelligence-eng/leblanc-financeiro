import test from 'node:test'
import assert from 'node:assert/strict'
import {pendenciasLiberacao,mesmaCondicaoComercial} from '../src/lib/pendenciasContrato.js'
const base={itens:[{descricao:'Cozinha',qtd:1,valor:50000,fornecedor:'Bartzen'}],desconto_tipo:'pct',desconto_valor:0,entrada_percentual:60,formas_pagamento:[{forma:'Pix / À vista',valor:57500}],parcelas:[{numero:1,valor:34500},{numero:2,valor:23000,marco:'dois_dias_antes_entrega'}]}
test('venda sem desconto e pagamento padrão não mostra exceções',()=>assert.deepEqual(pendenciasLiberacao(base),[]))
test('fornecedor ausente e parcela única mostram ações distintas sem exigir reduzir desconto desconhecido',()=>{
 const ps=pendenciasLiberacao({...base,itens:[{qtd:1,valor:50000}],desconto_valor:10,parcelas:[{numero:1,valor:51750}]})
 assert.equal(ps.length,2)
 assert.match(ps[0].titulo,/fornecedor/)
 assert.match(ps[1].texto,/31.050,00/)
 assert.match(ps[1].texto,/20.700,00/)
})
test('taxas absorvidas e desconto acima do limite têm motivos explícitos',()=>{
 const ps=pendenciasLiberacao({...base,desconto_valor:41},[{forma:'Crédito (cartão)',absorver:true}])
 assert.ok(ps.some(p=>p.titulo==='Desconto acima do limite'))
 assert.ok(ps.some(p=>p.titulo==='Taxas assumidas pela loja'))
})
test('alterações comerciais impedem autorizar uma versão antiga',()=>{
 assert.equal(mesmaCondicaoComercial(base,base.formas_pagamento,base),true)
 assert.equal(mesmaCondicaoComercial({...base,desconto_valor:10},base.formas_pagamento,base),false)
 assert.equal(mesmaCondicaoComercial(base,[{absorver:true}],base),false)
})
