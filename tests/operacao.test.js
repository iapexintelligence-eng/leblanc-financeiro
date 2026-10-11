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

test('ficha importada gera só as pendências da planilha, sem prazos inventados',()=>{
 const r={id:'i',tipo:'pedido',contrato_id:'c',dados:{cliente_nome:'Cliente',importacao_revisoes:{setor_codigo:'correcao',pendencias:['Guias técnicas','Assistência aberta'],conferente:'GIOVANNA',andamento:'falta guia'}}}
 const xs=pendenciasAutomaticas([r])
 assert.deepEqual(xs.map(x=>[x.titulo,x.papel,x.prazo]),[['Guias técnicas','correcao',null],['Assistência aberta','logistica',null]])
 assert.match(xs[0].origem,/Planilha de revisões · GIOVANNA · falta guia/)
})

test('previsão de montagem segue os prazos da loja e nunca antecipa etapa pendente',async()=>{
 const {previsaoMontagem}=await import('../src/lib/operacao.js')
 const hoje='2026-10-11',fer=['2026-10-12','2026-11-02','2026-11-15','2026-11-20']
 assert.equal(previsaoMontagem({entrega_prazo:'2026-11-30',aprovacao_em:'2026-10-15'},{hoje,feriados:fer}).data,'2026-11-30')
 const imp=previsaoMontagem({importacao_revisoes:{setor_codigo:'liberacao',assinatura:'2026-07-09'}},{hoje,feriados:fer})
 assert.equal(imp.tipo,'estimado');assert.equal(imp.data,'2026-08-27')
 assert.equal(previsaoMontagem({importacao_revisoes:{setor_codigo:'qualidade'}},{hoje}),null)
 // Medida antiga: conferência vencida não volta ao passado; parte de hoje.
 const m=previsaoMontagem({importacao_revisoes:{setor_codigo:'correcao',medida:'2026-06-01'}},{hoje,feriados:fer})
 assert.ok(m.data>'2026-11-30')
 assert.equal(previsaoMontagem({tipo_venda:'Futura'},{hoje}).tipo,'pendente')
 assert.equal(previsaoMontagem({entrega_em:'2026-10-01'},{hoje}),null)
})

test('pedido já implantado sem data de assinatura não ganha data inventada',async()=>{
 const {previsaoMontagem}=await import('../src/lib/operacao.js')
 const r=previsaoMontagem({importacao_revisoes:{setor_codigo:'liberacao',situacao:'IMPLANTADO',medida:'2026-05-13'}},{hoje:'2026-10-11'})
 assert.equal(r.data,null);assert.equal(r.tipo,'pendente')
})

test('data do fechamento não tira a ficha importada do setor nem cria pendências iniciais',async()=>{
 const {setorPedido}=await import('../src/lib/setores.js')
 const d={venda_data:'2026-09-22',importacao_revisoes:{setor_codigo:'correcao',pendencias:['Guias técnicas']}}
 assert.equal(setorPedido(d),'correcao')
 assert.deepEqual(pendenciasAutomaticas([{id:'x',tipo:'pedido',dados:d}]).map(p=>p.titulo),['Guias técnicas'])
})

test('etapas lançadas como já realizadas levam a ficha ao fluxo normal sem checklist inicial',async()=>{
 const {setorPedido}=await import('../src/lib/setores.js')
 const d={importacao_revisoes:{setor_codigo:'correcao',pendencias:['Guias técnicas']},liberacao_em:'2026-05-05',medicao_em:'2026-05-27',correcao_prazo:'2026-06-12',historico:{liberacao_em:{data:'2026-05-05'},medicao_em:{data:'2026-05-27'}}}
 assert.equal(setorPedido(d),'correcao')
 assert.deepEqual(pendenciasAutomaticas([{id:'x',tipo:'pedido',dados:d}]).map(p=>p.titulo),['Concluir conferência e guias técnicas'])
 const imp={...d,correcao_em:'2026-06-10',aprovacao_em:'2026-06-20',implantacao_em:'2026-07-01',entrega_prazo:'2026-08-10',historico:{...d.historico,correcao_em:{},aprovacao_em:{},implantacao_em:{}}}
 assert.ok(!pendenciasAutomaticas([{id:'x',tipo:'pedido',dados:imp}]).some(p=>/fábrica/.test(p.titulo)))
})
