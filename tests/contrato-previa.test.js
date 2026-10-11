import test from 'node:test'
import assert from 'node:assert/strict'
import {gerarHtmlContrato} from '../src/lib/contratoHtml.js'
import {PAGINAS_CONTRATO} from '../src/lib/modeloContrato.js'
import {gerarHtmlAditivo} from '../src/lib/aditivoHtml.js'

test('base completa mantém 19 cláusulas e separa condições individuais e assinaturas',()=>{
 assert.equal(PAGINAS_CONTRATO.flat().filter(p=>p.startsWith('CLÁUSULA')).length,19)
 const html=gerarHtmlContrato({numero:'20261011-01',status:'Emitido',cliente_nome:'Cliente sintético',observacoes:'Espelho incluso somente neste projeto',itens:[],parcelas:[{numero:1,valor:115,vencimento:'2026-10-11'}]})
 for(const t of ['CLÁUSULA DÉCIMA NONA','35 dias úteis','12 dias úteis','TESTEMUNHA 1','TESTEMUNHA 2','Espelho incluso somente neste projeto','20261011-01'])assert.ok(html.includes(t))
 for(const t of ['SOFIA','SHIKIDA','SILVIA','Menezes','pendentes de consolidação'])assert.ok(!html.includes(t))
})
test('adendo mantém número original e calcula acréscimo sem declarar quitação',()=>{
 const c={numero:'ANTIGO-01',cliente_nome:'Cliente sintético',dados_json:{data_contrato:'2026-10-01'}}
 const html=gerarHtmlAditivo(c,{tipo:'acrescimo',data:'2026-10-11',objeto:'Novo ambiente <teste>',pagamento:'3x no cartão',valor_anterior:1000,valor_adicional:200})
 for(const t of ['ANTIGO-01','1.200,00','Novo ambiente &lt;teste&gt;','Rua Augusto Stresser','Ratificação','TESTEMUNHA 2'])assert.ok(html.includes(t))
 assert.ok(!html.includes('dando quitação'))
 assert.throws(()=>gerarHtmlAditivo(c,{data:'2026-10-11'}),/Preencha/)
})

test('minuta pendente preserva aviso de não aprovação no documento imprimível',()=>{
 for(const status of ['Aguardando aprovação','rascunho',undefined]) {
  const registro={status,itens:[],parcelas:[]}
  assert.ok(gerarHtmlContrato(registro).includes('MINUTA NÃO APROVADA'))
  assert.equal(registro.status,status)
 }
 assert.ok(!gerarHtmlContrato({status:'Emitido',itens:[],parcelas:[]}).includes('MINUTA NÃO APROVADA'))
})

test('prévia gera documento sem abrir janela e sem expor fornecedor ou composição interna',()=>{
 const html=gerarHtmlContrato({numero:'TESTE',cliente_nome:'Cliente <teste>',itens:[{qtd:1,descricao:'Cozinha',fornecedor:'Bartzen',valor:50000}],valor_promob:50000,acrescimo_marketing:7500,parcelas:[{numero:1,valor:20700,vencimento:'2026-10-11'},{numero:2,valor:13800,marco:'dois_dias_antes_entrega'}]})
 assert.ok(html.includes('Cliente &lt;teste&gt;'))
 assert.ok(html.includes('34.500,00'))
 assert.ok(html.includes('Imprimir / Salvar como PDF'))
 for(const proibido of ['Fornecedor','Bartzen','50.000,00','7.500,00','window.open'])assert.ok(!html.includes(proibido))
})
