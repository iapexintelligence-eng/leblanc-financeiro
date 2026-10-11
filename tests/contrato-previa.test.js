import test from 'node:test'
import assert from 'node:assert/strict'
import {gerarHtmlContrato} from '../src/lib/contratoHtml.js'

test('prévia gera documento sem abrir janela e sem expor fornecedor ou composição interna',()=>{
 const html=gerarHtmlContrato({numero:'TESTE',cliente_nome:'Cliente <teste>',itens:[{qtd:1,descricao:'Cozinha',fornecedor:'Bartzen',valor:50000}],valor_promob:50000,acrescimo_marketing:7500,parcelas:[{numero:1,valor:20700,vencimento:'2026-10-11'},{numero:2,valor:13800,marco:'dois_dias_antes_entrega'}]})
 assert.ok(html.includes('Cliente &lt;teste&gt;'))
 assert.ok(html.includes('34.500,00'))
 assert.ok(html.includes('Imprimir / Salvar como PDF'))
 for(const proibido of ['Fornecedor','Bartzen','50.000,00','7.500,00','window.open'])assert.ok(!html.includes(proibido))
})
