import { somarUteis, somarDias, util, dataValida, hojeSP } from './prazos.js'

// Colunas do quadro de pós-venda (as mesmas do Trello da Glauci, com a fábrica separada em três etapas).
export const COLUNAS = [
 { id:'implantado', titulo:'Implantado na fábrica', grupo:'fabrica' },
 { id:'producao', titulo:'Em produção', grupo:'fabrica' },
 { id:'pronto', titulo:'Pronto na fábrica', grupo:'fabrica' },
 { id:'aguardando_cliente', titulo:'Aguardando o cliente', dica:'Reforma, sem chaves, viagem' },
 { id:'entrega_agendada', titulo:'Entrega agendada' },
 { id:'montagem', titulo:'Montagem em andamento', trava:true },
 { id:'entrega_tecnica', titulo:'Entrega técnica / pós-venda', trava:true },
 { id:'pendencias', titulo:'Pendências', trava:true },
 { id:'pecas', titulo:'Peças solicitadas à fábrica', trava:true },
 { id:'assistencia', titulo:'Assistências', trava:true },
 { id:'finalizado', titulo:'Finalizado', trava:true },
]
export const TITULO_COLUNA = Object.fromEntries(COLUNAS.map(c => [c.id, c.titulo]))
// A partir da montagem, o cliente só entra com o saldo quitado e o comprovante conferido pela Leia (regra também no servidor).
export const POS_MONTAGEM = new Set(COLUNAS.filter(c => c.trava).map(c => c.id))

// O que a Glauci informa ao mover o cartão para cada coluna.
export const PERGUNTAS = {
 implantado: [['implantado_em','Implantado na fábrica em','date']],
 producao: [['pronto_fabrica_em','Previsão de ficar pronto na fábrica','date']],
 pronto: [['pronto_fabrica_em','Pronto na fábrica em','date'],['carregado_em','Carregou / saiu da fábrica em','date'],['chegada_prevista_em','Chegada prevista (data passada pela transportadora)','date']],
 aguardando_cliente: [['impedimento','O que o cliente informou (reforma, chaves, viagem…)','textarea'],['retorno_previsto_em','Previsão de retorno do cliente','date']],
 entrega_agendada: [['entrega_agendada_em','Entrega ao cliente agendada para','date'],['montador_previa','Montador previsto (prévia; só é confirmado após o pagamento)','montador']],
 montagem: [['entregue_em','Entrega realizada em','date'],['montador','Montador','montador'],['montagem_inicio_em','Início da montagem','date'],['montagem_fim_prevista_em','Previsão de término','date']],
 entrega_tecnica: [['montagem_fim_em','Término da montagem','date']],
 pendencias: [['pendencias','O que ficou pendente','textarea']],
 pecas: [['pecas','Peças solicitadas à fábrica','textarea'],['pecas_previstas_em','Previsão de chegada das peças','date']],
 assistencia: [['pendencias','O que precisa ser resolvido','textarea']],
 finalizado: [['posvenda_em','Pós-venda feito em','date']],
}
// Todos os campos do cartão, para edição no detalhe.
export const CAMPOS_POSVENDA = [
 ['fabrica','Fábrica','fabrica'],['pedidos_fabrica','Pedidos na fábrica'],
 ['carregado_em','Carregou / saiu da fábrica em','date'],['chegada_prevista_em','Chegada prevista (data da transportadora)','date'],
 ['entrega_agendada_em','Entrega ao cliente agendada para','date'],['montador_previa','Montador previsto (prévia)','montador'],
 ['prazo_cliente_em','Prazo combinado com o cliente','date'],['implantado_em','Implantado na fábrica em','date'],['pronto_fabrica_em','Pronto na fábrica (ou previsão)','date'],
 ['impedimento','Impedimento do cliente','textarea'],['retorno_previsto_em','Previsão de retorno do cliente','date'],
 ['entregue_em','Entrega realizada em','date'],['montador','Montador confirmado (após o pagamento)','montador'],['montagem_inicio_em','Início da montagem','date'],['montagem_fim_prevista_em','Previsão de término da montagem','date'],['montagem_fim_em','Término da montagem','date'],
 ['posvenda_em','Pós-venda feito em','date'],['pendencias','Pendências','textarea'],['pecas','Peças solicitadas','textarea'],['pecas_previstas_em','Previsão de chegada das peças','date'],
]
export const FABRICAS = ['Menezes','Bartzen']
export const MONTADORES_CONHECIDOS = ['Robson','Vilmar','Bruno','Junior','Felipe','Newton','Adriano','Dionathan','Fábio','André','Marlos','Paulo','Cleberson','Luiz','Raphael','Alex','Fagner','Nelson','Juliano','Vilson','Anderson']

export const quitado = (d={}) => (d.saldo_confirmado === true || d.saldo_confirmado === 'true') && !!d.saldo_confirmado_arquivo
const imp = (d) => d?.importacao_revisoes || {}

// Data de entrega que vale para a cobrança: a agendada com o cliente ou, antes disso, a chegada passada pela
// transportadora (a Glauci lança assim que o pedido carrega). Sem ela não há cobrança: a Leia não cobra por estimativa.
export function dataEntregaCobranca(d={}) {
 const pv = d.posvenda || {}
 return [pv.entrega_agendada_em, pv.chegada_prevista_em, d.entrega_prevista].find(dataValida) || null
}
// Contrato: o saldo é pago 2 dias corridos antes da entrega.
export const dataCobrancaSaldo = (d={}) => { const e = dataEntregaCobranca(d); return e ? somarDias(e, -2) : null }

// Coluna do cliente no quadro: a escolhida pela Glauci ou, sem isso, a deduzida dos marcos da jornada.
export function colunaDe(d={}) {
 if (d.posvenda?.coluna) return d.posvenda.coluna
 if (d.fotos_em || d.montagem_concluida_em) return 'entrega_tecnica'
 if (d.entrega_em) return 'montagem'
 if (d.entrega_prevista) return 'entrega_agendada'
 if (d.implantacao_em || /IMPLANTADO/i.test(imp(d).situacao || '')) return 'implantado'
 return null
}

// Mensagem de bloqueio ao mover para a montagem sem o saldo conferido; null quando pode mover.
export function bloqueioMontagem(d={}, destino, mudancas={}) {
 const atual = colunaDe(d)
 if (POS_MONTAGEM.has(atual)) return null
 const pedeMontagem = POS_MONTAGEM.has(destino) || ['montador','montagem_inicio_em','entregue_em'].some(k => mudancas[k] && mudancas[k] !== d.posvenda?.[k])
 if (!pedeMontagem || quitado(d)) return null
 return 'Montagem bloqueada: a Leia precisa anexar o comprovante do pagamento e conferir a quitação do saldo.'
}

const maior = (a, b) => (!a ? b : !b ? a : a > b ? a : b)
export function subtrairUteis(data, n, feriados=[]) {
 if (!dataValida(data) || !Number.isInteger(n) || n < 0) throw new Error('Data ou prazo inválido.')
 let d = data, c = 0
 while (c < n) { d = somarDias(d, -1); if (util(d, feriados)) c++ }
 return d
}
const seguro = (f) => { try { return f() } catch { return null } }
export const PRAZOS_PADRAO = { fabricas:{ Menezes:32, Bartzen:21 }, padrao_fabrica:30, entrega_apos_pronto:7, montagem_dias:5 }

// Previsão de pronto, entrega e término da montagem, com a origem de cada data
// (confirmada pela Glauci, informada pela fábrica ou estimada pelos prazos), para a previsibilidade.
export function previsaoOperacao(d={}, { prazos=PRAZOS_PADRAO, feriados=[], hoje=hojeSP() }={}) {
 const pv = d.posvenda || {}, i = imp(d)
 const coluna = colunaDe(d)
 const fabrica = pv.fabrica || null
 const lt = Math.round(Number(prazos.fabricas?.[fabrica] ?? prazos.padrao_fabrica ?? 30))
 const aposPronto = Math.round(Number(prazos.entrega_apos_pronto ?? 7)), diasMontagem = Math.round(Number(prazos.montagem_dias ?? 5))
 const ok = dataValida
 const implantado = coluna || d.implantacao_em || pv.implantado_em
 const baseImpl = [pv.implantado_em, d.implantacao_em].find(ok) || null
 const jaPronto = ['pronto','aguardando_cliente','entrega_agendada'].includes(coluna) || POS_MONTAGEM.has(coluna)
 let pronto
 if (jaPronto) pronto = { data: ok(pv.pronto_fabrica_em) ? pv.pronto_fabrica_em : null, origem:'confirmada' }
 else if (ok(pv.pronto_fabrica_em)) pronto = { data: pv.pronto_fabrica_em, origem:'fábrica' }
 else if (baseImpl) pronto = { data: seguro(() => maior(somarUteis(baseImpl, lt, feriados), hoje)), origem:'estimada' }
 else if (!implantado) {
  // Ainda sem implantação: conta a partir de hoje (ou da assinatura das guias, se for depois).
  const base = maior([d.aprovacao_em, i.assinatura].find(ok) || null, hoje)
  pronto = { data: seguro(() => somarUteis(base, lt, feriados)), origem:'estimada', semImplantacao:true }
 } else pronto = { data: seguro(() => somarUteis(hoje, lt, feriados)), origem:'estimada' }

 let entrega
 if (ok(pv.entregue_em) || ok(d.entrega_em)) entrega = { data: pv.entregue_em || d.entrega_em, origem:'realizada' }
 else if (ok(pv.entrega_agendada_em) || ok(d.entrega_prevista)) entrega = { data: pv.entrega_agendada_em || d.entrega_prevista, origem:'confirmada' }
 else if (ok(pv.chegada_prevista_em)) entrega = { data: pv.chegada_prevista_em, origem:'transportadora' }
 else entrega = { data: seguro(() => somarUteis(maior(pronto?.data || hoje, hoje), aposPronto, feriados)), origem:'estimada' }

 let montagem
 if (ok(pv.montagem_fim_em) || ok(d.montagem_concluida_em)) montagem = { data: pv.montagem_fim_em || d.montagem_concluida_em, origem:'realizada' }
 else if (ok(pv.montagem_fim_prevista_em)) montagem = { data: pv.montagem_fim_prevista_em, origem:'confirmada' }
 else if (['entrega_tecnica','pendencias','pecas','assistencia','finalizado'].includes(coluna)) montagem = { data:null, origem:'realizada' }
 else montagem = { data: seguro(() => somarUteis(maior(pv.montagem_inicio_em || entrega.data || hoje, hoje), diasMontagem, feriados)), origem: entrega.origem === 'estimada' ? 'estimada' : 'estimada após entrega' }

 const prazoContrato = d.entrega_prazo || (ok(pv.prazo_cliente_em) ? pv.prazo_cliente_em : null) || (ok(i.assinatura) ? seguro(() => somarUteis(i.assinatura, 35, feriados)) : null)
 // Cobrança só com data de verdade (agendada ou da transportadora), nunca pela estimativa.
 const saldoAte = !quitado(d) && ['confirmada','transportadora'].includes(entrega.origem) ? seguro(() => somarDias(entrega.data, -2)) : null
 return { coluna, fabrica, leadTime: lt, pronto, entrega, montagem, prazoContrato, saldoAte, quitado: quitado(d) }
}

// Situação frente a uma data-alvo (ex.: montar até o Natal) e data limite para implantar.
export function frenteAlvo(prev, alvo, { prazos=PRAZOS_PADRAO, feriados=[] }={}) {
 if (!prev || !dataValida(alvo)) return null
 if (['entrega_tecnica','pendencias','pecas','assistencia','finalizado'].includes(prev.coluna)) return { nivel:'ok', texto:'Montado' }
 const fim = prev.montagem?.data
 const limiteImplantar = seguro(() => subtrairUteis(alvo, Math.round(Number(prazos.montagem_dias ?? 5)) + Math.round(Number(prazos.entrega_apos_pronto ?? 7)) + prev.leadTime, feriados))
 if (!fim) return { nivel:'warn', texto:'Sem data', limiteImplantar }
 if (fim > alvo) return { nivel:'danger', texto:'Não cabe', limiteImplantar }
 const folga = seguro(() => subtrairUteis(alvo, 5, feriados))
 if (fim > folga || prev.montagem.origem === 'estimada') return { nivel:'warn', texto: fim > folga ? 'Apertado' : 'Cabe (estimado)', limiteImplantar }
 return { nivel:'ok', texto:'Cabe', limiteImplantar }
}

// Segunda-feira da semana de uma data (para agrupar carga de montadores e saldos).
export function semanaDe(data) {
 if (!dataValida(data)) return null
 const dia = new Date(`${data}T12:00:00Z`).getUTCDay()
 return somarDias(data, -((dia + 6) % 7))
}
