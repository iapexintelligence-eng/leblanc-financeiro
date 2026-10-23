import test from 'node:test'
import assert from 'node:assert/strict'
import { colunaDe, bloqueioMontagem, previsaoOperacao, frenteAlvo, subtrairUteis, semanaDe } from '../src/lib/posvenda.js'

const prazos={fabricas:{Menezes:32,Bartzen:21},padrao_fabrica:30,entrega_apos_pronto:7,montagem_dias:5}
const fer=['2026-11-02','2026-11-15','2026-11-20','2026-12-25']

test('coluna vem do quadro ou dos marcos da jornada',()=>{
 assert.equal(colunaDe({posvenda:{coluna:'pronto'}}),'pronto')
 assert.equal(colunaDe({implantacao_em:'2026-10-01'}),'implantado')
 assert.equal(colunaDe({importacao_revisoes:{situacao:'IMPLANTADO'}}),'implantado')
 assert.equal(colunaDe({entrega_em:'2026-10-01'}),'montagem')
 assert.equal(colunaDe({}),null)
})

test('montagem só com saldo quitado e comprovante; quem já passou da etapa não trava',()=>{
 const d={posvenda:{coluna:'entrega_agendada'}}
 assert.match(bloqueioMontagem(d,'montagem'),/Leia/)
 assert.match(bloqueioMontagem(d,'entrega_agendada',{montador:'Robson'}),/Leia/)
 assert.equal(bloqueioMontagem(d,'aguardando_cliente'),null)
 assert.match(bloqueioMontagem({...d,saldo_confirmado:true},'montagem'),/Leia/) // sem comprovante anexado
 assert.equal(bloqueioMontagem({...d,saldo_confirmado:true,saldo_confirmado_arquivo:'x/c.pdf'},'montagem'),null)
 assert.equal(bloqueioMontagem({posvenda:{coluna:'montagem'}},'entrega_tecnica'),null)
})

test('previsão usa a data confirmada quando existe e estima pelo prazo da fábrica quando não',()=>{
 const hoje='2026-10-19'
 const semImpl=previsaoOperacao({posvenda:{fabrica:'Menezes'}},{prazos,feriados:fer,hoje})
 assert.equal(semImpl.pronto.semImplantacao,true)
 assert.equal(semImpl.pronto.data,'2026-12-04') // 32 dias úteis a partir de hoje, sem 02/11 e 20/11
 const bartzen=previsaoOperacao({implantacao_em:'2026-10-20',posvenda:{coluna:'implantado',fabrica:'Bartzen'}},{prazos,feriados:fer,hoje})
 assert.equal(bartzen.pronto.origem,'estimada')
 assert.equal(bartzen.pronto.data,'2026-11-19')
 const agendado=previsaoOperacao({posvenda:{coluna:'entrega_agendada',entrega_agendada_em:'2026-10-28',fabrica:'Menezes'}},{prazos,feriados:fer,hoje})
 assert.equal(agendado.entrega.origem,'confirmada')
 assert.equal(agendado.saldoAte,'2026-10-26')
 assert.equal(agendado.montagem.data,'2026-11-05')
 const alvo=frenteAlvo(semImpl,'2026-12-24',{prazos,feriados:fer})
 assert.equal(alvo.texto,'Apertado') // Menezes implantada hoje termina em 22/12
 const semanaQueVem=previsaoOperacao({implantacao_em:'2026-10-26',posvenda:{coluna:'implantado',fabrica:'Menezes'}},{prazos,feriados:fer,hoje})
 assert.equal(frenteAlvo(semanaQueVem,'2026-12-24',{prazos,feriados:fer}).texto,'Não cabe')
 assert.equal(alvo.limiteImplantar,subtrairUteis('2026-12-24',44,fer))
 assert.equal(frenteAlvo(agendado,'2026-12-24',{prazos,feriados:fer}).nivel,'ok')
 assert.equal(semanaDe('2026-10-22'),'2026-10-19')
})

test('prazo especial combinado vale como prazo do contrato e marca o cliente', async () => {
  const { prazoEspecial, textoPrazoEspecial } = await import('../src/lib/prazoEspecial.js')
  const d = { prazo_especial: true, prazo_especial_em: '2026-12-10', prazo_especial_motivo: 'Cliente viaja em dezembro', posvenda: { fabrica: 'Menezes', prazo_cliente_em: '2026-11-20' } }
  assert.equal(previsaoOperacao(d, { prazos, feriados: fer, hoje: '2026-10-23' }).prazoContrato, '2026-12-10')
  assert.equal(textoPrazoEspecial(prazoEspecial(d)), 'Prazo especial · 10/12/2026')
  assert.equal(prazoEspecial({ prazo_especial: false, prazo_especial_em: '2026-12-10' }), null, 'desmarcado não pinta de roxo')
})
