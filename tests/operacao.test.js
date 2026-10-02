import test from 'node:test'
import assert from 'node:assert/strict'
import { capacidadeMensal, pendenciasAutomaticas, ordenarPendencias, situacoesSeparadas } from '../src/lib/operacao.js'
test('saldo vence dois dias corridos antes da entrega e venda futura aguarda imóvel',()=>{
 const r={id:'p',tipo:'pedido',contrato_id:'c',dados:{cliente_recebe_em:'2026-10-01',entrega_prevista:'2026-10-05',planta_enviada_em:'2026-09-01',entrada_confirmada:true}}
 assert.equal(pendenciasAutomaticas([r]).find(i=>i.titulo.includes('saldo')).prazo,'2026-10-03')
 const futura={...r,dados:{tipo_venda:'Futura',entrada_confirmada:true,planta_enviada_em:'2026-09-01'}}
 assert.equal(pendenciasAutomaticas([futura]).length,1)
 assert.match(pendenciasAutomaticas([futura])[0].titulo,/imóvel pronto/)
 assert.match(situacoesSeparadas(r.dados).financeiro,/saldo pendente/)
})
test('capacidade conta dias únicos, corta reservas na virada do mês e desconta feriados',()=>{
 const pessoas=[{usuario_id:'m',papel:'montador',nome:'Teste'}]
 const agenda=(inicio,fim)=>({tipo:'agenda',dados:{montador_id:'m',inicio,fim}})
 const r=capacidadeMensal([agenda('2026-09-30','2026-10-02'),agenda('2026-10-02','2026-10-05'),agenda('2026-11-01','2026-11-02')],pessoas,[{montador_id:'m',inicio:'2026-10-05',fim:'2026-10-06'}],'2026-10',['2026-10-12'])[0]
 assert.equal(r.montagens,2)
 assert.equal(r.ocupados,3)
 assert.equal(r.indisponiveis,2)
 assert.equal(r.livres,r.uteis-4)
 assert.equal(r.semEstimativa,2)
 assert.deepEqual(capacidadeMensal([],pessoas,[],'invalido'),[])
})
test('pendências vencidas têm prioridade e datas ausentes ficam ao final',()=>{
 const xs=ordenarPendencias([{id:1,prazo:null},{id:2,prazo:'2026-08-01'},{id:3,prazo:'2026-10-01'}],'2026-09-29')
 assert.deepEqual(xs.map(x=>x.id),[2,3,1]);assert.equal(xs[0].atrasada,true)
})
