import test from 'node:test'
import assert from 'node:assert/strict'
import {calcularProposta,dividirParcelas,contratoPublico,calcularGratificacao,percentualGratificacao} from '../src/lib/regras.js'
import {somarUteis,somarDias,alertaPrazo} from '../src/lib/prazos.js'
import {simularCartao,simularFinanceira} from '../src/lib/taxas.js'
test('marketing precede desconto e limites seguem indústria',()=>{
 const b=calcularProposta([{valor:50000,qtd:1,fornecedor:'Bartzen'}],40)
 assert.equal(b.base,57500);assert.equal(b.final,34500);assert.equal(b.exigeAutorizacao,false)
 assert.equal(calcularProposta([{valor:50000,fornecedor:'Bartzen'}],40.01).exigeAutorizacao,true)
 assert.equal(calcularProposta([{valor:50000,fornecedor:'Menezes'}],50).final,28750)
 assert.equal(calcularProposta([{valor:50000,fornecedor:'Menezes'}],50.01).exigeAutorizacao,true)
})
test('parcelas preservam os centavos do total',()=>{for(const n of [3,7,18,21,24])assert.equal(Math.round(dividirParcelas(100.01,n).reduce((a,b)=>a+b,0)*100),10001)})
test('dias úteis não incluem início, finais de semana e feriados configurados',()=>{
 assert.equal(somarUteis('2026-09-25',2,['2026-09-28']),'2026-09-30')
 assert.equal(somarDias('2026-09-25',5),'2026-09-30')
 assert.throws(()=>somarUteis('2026-02-30',2))
})
test('alertas persistem quando marco foi ultrapassado e no fim de semana',()=>{
 assert.equal(alertaPrazo('2026-10-09',{hoje:'2026-09-28'}).marco,'10')
 assert.equal(alertaPrazo('2026-10-02',{hoje:'2026-09-28'}).marco,'5')
 assert.equal(alertaPrazo('2026-09-30',{hoje:'2026-09-28'}).marco,'2')
 assert.equal(alertaPrazo('2026-09-25',{hoje:'2026-09-26'}).marco,'vencida')
 assert.equal(alertaPrazo('2026-09-25',{encerrada:true}),null)
})
test('documento público exclui custos e valores de tabela',()=>{
 const d=contratoPublico({cliente_nome:'Cliente',valor_promob:50000,comissao_marketing:7500,itens_extras:[{valor:999}],itens:[{descricao:'Cozinha',valor:50000,qtd:1}],parcelas:[{numero:1,valor:34500}]})
 const texto=JSON.stringify(d)
 for(const proibido of ['50000','7500','999','marketing','promob','itens_extras'])assert.equal(texto.includes(proibido),false)
 assert.equal(d.total_pagar,34500)
})
test('gratificação depende do total da venda e aplica percentual ao líquido',()=>{
 assert.equal(percentualGratificacao(34999),null);assert.equal(percentualGratificacao(50000),4)
 assert.equal(percentualGratificacao(80000),5);assert.equal(percentualGratificacao(110000),6)
 assert.equal(calcularGratificacao(50000,null),null)
 assert.deepEqual(calcularGratificacao(50000,[{valor:5000}]),{aliquota:4,liquido:45000,valor:1800})
})
test('Sicoob antecipação mensal cresce com prazo e Cielo respeita 18x',()=>{
 const curto=simularCartao(1000,'Visa / Master / Elo','Crédito',2),longo=simularCartao(1000,'Visa / Master / Elo','Crédito',21)
 assert.ok(longo.valorCliente>curto.valorCliente);assert.ok(Math.abs(longo.lojaRecebe-1000)<=0.01)
 assert.ok(simularCartao(1000,'Visa / Master / Elo','Crédito',21,'Cielo').erro)
 assert.equal(simularCartao(1000,'Visa / Master / Elo','Crédito',18,'Cielo').antecipacao,0.75)
 assert.ok(simularCartao(1000,'Visa / Master / Elo','Crédito',6,'Sicoob',true).lojaRecebe<1000)
 assert.equal(simularFinanceira(1000,30,24).lojaRecebe,1000)
})
