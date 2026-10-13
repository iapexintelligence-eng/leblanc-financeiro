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

test('pasta liberada: Rodrigo agenda em 5 dias corridos e depois registra a medida',async()=>{
 const {noSetor}=await import('../src/lib/setores.js')
 const lib={liberacao_em:'2026-10-13',medicao_prazo:'2026-10-18',entrada_confirmada:true,planta_enviada_em:'2026-10-10'}
 const p1=pendenciasAutomaticas([{id:'a',tipo:'pedido',dados:lib}])
 assert.deepEqual(p1.map(p=>[p.titulo,p.papel,p.prazo]),[['Agendar a medida técnica com o cliente','medidor','2026-10-18']])
 const p2=pendenciasAutomaticas([{id:'a',tipo:'pedido',dados:{...lib,medicao_agendada:'2026-10-16'}}])
 assert.deepEqual(p2.map(p=>[p.papel,p.prazo]),[['medidor','2026-10-16']])
 const p3=pendenciasAutomaticas([{id:'a',tipo:'pedido',dados:{...lib,medicao_agendada:'2026-10-16',medicao_em:'2026-10-16',correcao_em:'2026-10-28',correcao_prazo:'2026-11-03'}}])
 assert.ok(p3.some(p=>p.titulo==='Agendar com o cliente a assinatura das guias técnicas na loja'&&p.papel==='correcao'))
 // Rodrigo vê a venda desde o fechamento, mesmo antes da pasta liberada.
 assert.equal(noSetor({tipo:'pedido',dados:{venda_data:'2026-10-12'}},'medicao'),true)
 assert.equal(noSetor({tipo:'pedido',dados:{...lib,medicao_em:'2026-10-16'}},'medicao'),false)
})

test('linha do tempo da ficha: venda, liberação, medida, correção e prazos',async()=>{
 const {datasPedido}=await import('../src/lib/operacao.js')
 const novo=datasPedido({venda_data:'2026-10-01',liberacao_em:'2026-10-05'})
 assert.deepEqual(novo.etapas.map(e=>e.data),['2026-10-01','2026-10-05',null,null])
 assert.deepEqual(novo.prazos,[{rotulo:'Rodrigo agenda a medida até',data:'2026-10-10'}])
 const imp=datasPedido({importacao_revisoes:{lib_medida:'2026-05-05',medida:'2026-05-27'}},{vendidoEm:'2026-04-20'})
 assert.equal(imp.etapas[1].planilha,true);assert.equal(imp.etapas[3].data,'2026-05-27')
 assert.equal(imp.prazos[0].rotulo,'Giovanna conclui a correção até')
})

test('em espera: pausa os prazos da etapa e gera só o retorno ao cliente',async()=>{
 const {datasPedido,previsaoMontagem}=await import('../src/lib/operacao.js')
 const d={liberacao_em:'2026-10-01',medicao_prazo:'2026-10-06',espera_motivo:'Aguardando liberação do imóvel para a medida técnica',espera_contato_em:'2026-10-10',espera_proximo_contato:'2026-11-10'}
 const p=pendenciasAutomaticas([{id:'x',tipo:'pedido',dados:d}])
 assert.equal(p.length,1);assert.equal(p[0].papel,'vendedor');assert.equal(p[0].prazo,'2026-11-10')
 assert.equal(datasPedido(d).prazos[0].espera,true)
 assert.equal(previsaoMontagem(d,{hoje:'2026-10-13'}).tipo,'pendente')
 const imp={espera_motivo:'Aguardando liberação do cliente',importacao_revisoes:{setor_codigo:'correcao',medida:'2026-05-27',pendencias:['Guias técnicas']}}
 assert.deepEqual(pendenciasAutomaticas([{id:'y',tipo:'pedido',dados:imp}]).map(x=>x.papel),['correcao'])
})

test('datas da planilha escritas como texto não quebram a linha do tempo',async()=>{
 const {datasPedido,previsaoMontagem}=await import('../src/lib/operacao.js')
 const casos=[{lib_medida:'P/JULHO',medida:'2026-04-16',setor_codigo:'correcao'},{lib_medida:'ja tem medida',setor_codigo:'correcao'},{lib_medida:'LIBERADO',medida:'2026-10-07',setor_codigo:'correcao'},{medida:'DEZEMBRO',setor_codigo:'correcao'},{medida:'?',lib_medida:'2026-09-28',setor_codigo:'correcao'},{lib_medida:'Proximo a Dezembro',setor_codigo:'vendas'}]
 for(const imp of casos){
  const d={venda_data:'2026-03-17',importacao_revisoes:imp}
  const r=datasPedido(d)
  assert.ok(r.etapas.length===4)
  assert.ok(r.prazos.every(p=>p.data===null||/^\d{4}-\d{2}-\d{2}$/.test(p.data)))
  previsaoMontagem(d,{hoje:'2026-10-13'})
  pendenciasAutomaticas([{id:'z',tipo:'pedido',dados:d}])
 }
 assert.equal(datasPedido({importacao_revisoes:{lib_medida:'P/JULHO'}}).etapas[1].texto,'P/JULHO')
})

test('entrega confirmada depois do prazo do contrato fica marcada',async()=>{
 const {datasPedido}=await import('../src/lib/operacao.js')
 const r=datasPedido({aprovacao_em:'2026-10-01',entrega_prazo:'2026-11-19',entrega_prevista:'2026-11-25'})
 assert.deepEqual(r.prazos.map(p=>[p.rotulo.slice(0,7),p.atraso||false]),[['Entrega',false],['Entrega',true]])
})
