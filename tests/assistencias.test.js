import test from 'node:test'
import assert from 'node:assert/strict'
import { resumoAssistencias, custoAssistencia, origemDe } from '../src/lib/assistencias.js'

test('assistência soma peças, mão de obra e fretes e separa o que foi ressarcido',()=>{
 const regs=[
  {id:'a1',tipo:'assistencia',contrato_id:'c1',dados:{cliente_nome:'Ana',identificada:'2026-10-01',status:'Resolvida',origem_erro:'Montagem',responsavel_erro:'Montador João',custo_pecas:200,custo_mao_obra:150,cobranca_status:'Ressarcido',cobranca_valor:430,ressarcido_valor:430}},
  {id:'a2',tipo:'assistencia',contrato_id:'c1',dados:{cliente_nome:'Ana',identificada:'2026-10-05',status:'Em análise',origem_erro:'Fábrica (defeito, peça errada ou faltante)',responsavel_erro:'Bartzen',custo_pecas:500,cobranca_status:'A cobrar'}},
  {id:'a3',tipo:'assistencia',contrato_id:'c2',dados:{cliente_nome:'Bia',identificada:'2026-09-20',status:'Identificada',causa:'Transporte'}},
  {id:'f1',tipo:'frete',dados:{assistencia_id:'a1',valor:80}},{id:'f2',tipo:'frete',dados:{assistencia_id:'a2',valor:120}},{id:'f3',tipo:'frete',dados:{valor:999}},
 ]
 const fretes=regs.filter(r=>r.tipo==='frete')
 assert.deepEqual(custoAssistencia(regs[0],fretes),{pecas:200,maoObra:150,outros:0,frete:80,viagens:1,total:430,cobrado:430,ressarcido:430,lojaArca:0})
 assert.equal(origemDe(regs[2].dados),'Transporte / frete')
 const r=resumoAssistencias(regs)
 assert.equal(r.totais.qtd,3);assert.equal(r.totais.total,1050);assert.equal(r.totais.frete,200);assert.equal(r.totais.lojaArca,620)
 assert.equal(r.porResponsavel[0].chave,'Bartzen');assert.equal(r.porResponsavel[0].aCobrar,620)
 assert.deepEqual(r.retornos.map(x=>[x.cliente,x.qtd]),[['Ana',2]])
 assert.equal(resumoAssistencias(regs,{de:'2026-10-01'}).totais.qtd,2)
})
