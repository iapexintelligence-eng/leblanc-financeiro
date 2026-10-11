import test from 'node:test'
import assert from 'node:assert/strict'
import {htmlOrcamento} from '../src/lib/orcamentoPublico.js'
import {contratoPublico} from '../src/lib/regras.js'

test('orçamento público exclui composição interna e escapa dados do cliente',()=>{
 const html=htmlOrcamento({cliente_nome:'<script>cliente</script>',vendedor:'Venda',valor_promob:50000,acrescimo_marketing:7500,itens_extras:[{descricao:'KIT INTERNO'}],observacoes:'SEGREDO',itens:[{qtd:1,descricao:'Cozinha <teste>',valor:50000}]},34500,['60% na venda e 40% antes da entrega'])
 assert.ok(html.includes('&lt;script&gt;cliente&lt;/script&gt;'))
 assert.ok(html.includes('Cozinha &lt;teste&gt;'))
 for(const valor of ['50000','7500','KIT INTERNO','SEGREDO','valor_promob','acrescimo_marketing'])assert.ok(!html.includes(valor))
 assert.throws(()=>htmlOrcamento({},NaN,[]),/válido/)
})

test('fornecedor é interno e não integra os dados públicos do contrato',()=>{
 const interno={itens:[{qtd:1,descricao:'Cozinha',fornecedor:'Bartzen',valor:50000}],parcelas:[]}
 const publico=contratoPublico(interno)
 assert.equal(publico.itens[0].fornecedor,undefined)
 assert.ok(!JSON.stringify(publico).includes('Bartzen'))
 assert.equal(interno.itens[0].fornecedor,'Bartzen')
 assert.ok(!htmlOrcamento(interno,34500,[]).includes('Bartzen'))
})
