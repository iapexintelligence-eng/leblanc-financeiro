import { hojeSP, somarDias, somarUteis, util, dataValida } from './prazos.js'
import { setorPedido, SETORES, prazoImportado, setorImportado } from './setores.js'

export const PAPEIS={vendedor:'Vendas',medidor:'Rodrigo · medida técnica',correcao:'Conferência',logistica:'Glauci · logística',financeiro:'Leia · financeiro',gestor:'Gestão'}
export const MARCOS={'':'Não bloqueia avanço',liberacao_em:'Liberação para medição',implantacao_em:'Implantação na fábrica',confirmada:'Liberação da escala',entrega_em:'Entrega',fotos_em:'Fotos'}
export function situacoesSeparadas(d) {
 return {comercial:d.tipo_venda==='Futura'&&!d.imovel_pronto_em?'Venda futura · aguarda imóvel':'Venda fechada',operacional:SETORES[setorPedido(d)]?.titulo||'Em acompanhamento',financeiro:d.saldo_confirmado?'Quitação conferida':d.entrada_confirmada?'Entrada conferida · saldo pendente':d.historico?.liberacao_em?'Entrada anterior ao sistema · saldo a conferir':'Entrada pendente de conferência'}
}
const PAPEL_IMPORTADO={'Assistência aberta':'logistica','Aguardando imóvel / liberação para medição':'vendedor','Definir conferente':'gestor'}
export function pendenciasAutomaticas(registros,feriados=[]) {
 const out=[]
 const add=(r,titulo,papel,prazo)=>out.push({id:`${r.id}-${titulo}`,registro_id:r.id,contrato_id:r.contrato_id,cliente:r.dados.cliente_nome,titulo,papel,prazo,origem:'Etapa da jornada'})
 for(const r of registros){const d=r.dados
  if(r.tipo==='assistencia'&&d.status!=='Resolvida')add(r,d.proxima_acao||'Resolver assistência','logistica',d.vencimento)
  if(r.tipo==='frete'&&d.status==='Liberado para pagamento')add(r,'Pagar frete conferido','financeiro',d.prevista)
  if(r.tipo!=='pedido')continue
  const imp=d.importacao_revisoes
  // Em espera (venda futura, imóvel ou cliente não liberado): os prazos da etapa ficam parados e só fica o retorno ao cliente.
  if(d.espera_motivo){out.push({id:`${r.id}-espera`,registro_id:r.id,contrato_id:r.contrato_id,cliente:d.cliente_nome,titulo:`Retomar contato com o cliente · ${d.espera_motivo}`,papel:d.medicao_em||imp?.medida?'correcao':'vendedor',prazo:d.espera_proximo_contato||null,origem:`Em espera${d.espera_contato_em?' · último contato '+d.espera_contato_em.split('-').reverse().join('/'):''}`});continue}
  if(imp&&setorImportado(d)){
   // Situação trazida da planilha de revisões: não gera as etapas iniciais nem prazos inventados.
   const est=prazoImportado(d,feriados)
   for(const p of imp.pendencias||[])out.push({id:`${r.id}-imp-${p}`,registro_id:r.id,contrato_id:r.contrato_id,cliente:d.cliente_nome,titulo:p,papel:PAPEL_IMPORTADO[p]||'correcao',prazo:PAPEL_IMPORTADO[p]?null:est?.prazo||null,origem:`Planilha de revisões${imp.conferente?' · '+imp.conferente:''}${imp.andamento?' · '+imp.andamento:''}`})
   continue
  }
  // Etapas lançadas como já realizadas dispensam o checklist inicial do fluxo novo.
  const hist=d.historico||{}
  if(!hist.liberacao_em){
   if(!d.planta_enviada_em)add(r,'Enviar planta baixa e informações','vendedor',d.planta_prazo)
   if(!d.entrada_confirmada)add(r,'Conferir entrada e comprovante','financeiro',null)
  }
  if(d.tipo_venda==='Futura'&&!d.imovel_pronto_em&&!hist.liberacao_em){add(r,'Acompanhar aviso de imóvel pronto','vendedor',null);continue}
  if(d.liberacao_em&&!d.medicao_em&&!d.medicao_agendada)add(r,'Agendar a medida técnica com o cliente','medidor',d.medicao_prazo)
  if(d.liberacao_em&&!d.medicao_em&&d.medicao_agendada)add(r,'Fazer a medida técnica agendada e registrar a conclusão','medidor',d.medicao_agendada)
  if(d.medicao_em&&!d.correcao_em)add(r,'Concluir conferência e guias técnicas','correcao',d.correcao_prazo)
  if(d.correcao_em&&!d.aprovacao_em)add(r,d.guias_agendadas?'Cliente assina as guias técnicas na loja':'Agendar com o cliente a assinatura das guias técnicas na loja','correcao',d.guias_agendadas||null)
  if(d.aprovacao_em&&!d.implantacao_em)add(r,'Anexar XML final, aguardar OK da Leia e implantar','correcao',d.entrega_prazo)
  if(d.implantacao_em&&!d.fabrica_paga&&!hist.implantacao_em)add(r,'Conferir pagamento da fábrica','financeiro',null)
  if(d.carregamento_em&&!d.cliente_recebe_em)add(r,'Confirmar com cliente que pode receber','logistica',d.entrega_prevista||d.entrega_prazo)
  if(d.cliente_recebe_em&&!d.saldo_confirmado)add(r,'Cobrar e conferir saldo final','financeiro',d.entrega_prevista?somarDias(d.entrega_prevista,-2):null)
  if(d.aprovacao_em&&!d.entrega_em)add(r,'Acompanhar entrega no prazo','logistica',d.entrega_prazo)
  if(d.montagem_concluida_em&&!d.fotos_em&&!registros.some(a=>a.contrato_id===r.contrato_id&&a.tipo==='assistencia'&&a.dados.status!=='Resolvida'))add(r,'Agendar fotos após conclusão','logistica',null)
 }
 return out
}
export function checklistPassagem(d) {
 return [
 ['Medição',!!(d.grupo_criado&&d.grupo_arquivo&&d.imagens_enviadas&&d.imagens_arquivo&&d.planta_enviada_em&&d.planta_arquivo&&d.entrada_confirmada&&(d.tipo_venda!=='Futura'||d.imovel_pronto_em)),'Checklist, planta e entrada conferida; imóvel pronto nas vendas futuras.'],
 ['Implantação',!!(d.aprovacao_em&&d.guias_arquivo),'Aprovação do cliente, guias técnicas assinadas, XML final corrigido e OK da Leia para a versão (conferido pelo servidor).'],
 ['Escala do montador',!!(d.saldo_confirmado&&d.saldo_confirmado_arquivo),'Comprovante e quitação conferida pelo financeiro.'],
 ]
}
export function capacidadeMensal(registros,pessoas,indisponibilidades,mes,feriados=[]) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))return []
 const dias=[];let dia=mes+'-01'
 while(dia.startsWith(mes)){if(util(dia,feriados))dias.push(dia);dia=somarDias(dia,1)}
 return pessoas.filter(p=>p.papel==='montador').map(p=>{
  const reservas=registros.filter(r=>r.tipo==='agenda'&&r.dados.montador_id===p.usuario_id&&r.dados.inicio<=dia&&r.dados.fim>=mes+'-01').filter(r=>r.dados.inicio.slice(0,7)<=mes)
  const bloqueios=indisponibilidades.filter(i=>i.montador_id===p.usuario_id&&!i.cancelado_em)
  const ocupados=dias.filter(d=>reservas.some(r=>r.dados.inicio<=d&&r.dados.fim>=d))
  const indisponiveis=dias.filter(d=>bloqueios.some(i=>i.inicio<=d&&i.fim>=d))
  const livres=dias.filter(d=>!ocupados.includes(d)&&!indisponiveis.includes(d))
  return {...p,uteis:dias.length,ocupados:ocupados.length,indisponiveis:indisponiveis.length,livres:livres.length,montagens:reservas.length,semEstimativa:reservas.filter(r=>!Number(r.dados.dias_estimados)).length}
 })
}
export function ordenarPendencias(lista,hoje=hojeSP()) {
 return [...lista].sort((a,b)=>(a.prazo||'9999').localeCompare(b.prazo||'9999')).map(i=>({...i,atrasada:!!i.prazo&&i.prazo<hoje}))
}

// Data a partir da qual o pedido pode ir para montagem (móveis entregues), pelos prazos definitivos da loja:
// medição 5 dias corridos após a liberação, conferência 12 úteis após a medição, entrega 35 úteis após a aprovação do projeto.
// Etapas ainda não realizadas nunca são posicionadas antes de hoje; o resultado é a data mais cedo possível.
export function previsaoMontagem(d,{dataVenda=null,feriados=[],hoje=hojeSP()}={}) {
 if(!d)return null
 const imp=d.importacao_revisoes&&setorImportado(d)?d.importacao_revisoes:null
 if(d.entrega_em||d.montagem_concluida_em)return null
 if(d.espera_motivo)return {data:null,base:`Em espera: ${d.espera_motivo}`,tipo:'pendente'}
 if(imp&&['qualidade'].includes(imp.setor_codigo))return null
 const max=(a,b)=>a>b?a:b
 const fim=(aprov,base,tipo)=>({data:somarUteis(max(aprov,hoje),35,feriados),base,tipo})
 try{
  if(dataValida(d.entrega_prevista))return {data:d.entrega_prevista,base:'Entrega prevista registrada pela logística',tipo:'registrado'}
  if(dataValida(d.entrega_prazo))return {data:d.entrega_prazo,base:`35 dias úteis desde a aprovação do projeto em ${d.aprovacao_em.split('-').reverse().join('/')}`,tipo:'registrado'}
  if(imp&&dataValida(imp.assinatura))return {data:somarUteis(imp.assinatura,35,feriados),base:`35 dias úteis desde a assinatura do projeto em ${imp.assinatura.split('-').reverse().join('/')} (planilha)`,tipo:'estimado'}
  if(imp&&/IMPLANTADO/i.test(imp.situacao||''))return {data:null,base:'Pedido já implantado na fábrica: registre o aviso de carregamento ou a entrega prevista para definir a data',tipo:'pendente'}
  if(d.tipo_venda==='Futura'&&!d.imovel_pronto_em&&!d.liberacao_em)return {data:null,base:'Venda futura: aguarda o cliente avisar que o imóvel está pronto',tipo:'pendente'}
  if(dataValida(d.correcao_em))return fim(d.correcao_em,'Projeto conferido; considera aprovação do cliente hoje + 35 dias úteis','estimado')
  const medida=dataValida(d.medicao_em)?d.medicao_em:imp&&dataValida(imp.medida)?imp.medida:null
  if(medida)return fim(somarUteis(medida,12,feriados),`Medida em ${medida.split('-').reverse().join('/')}: conferência em 12 dias úteis + 35 dias úteis após aprovação`,'estimado')
  const lib=dataValida(d.liberacao_em)?d.liberacao_em:imp&&dataValida(imp.lib_medida)?imp.lib_medida:null
  if(lib){const med=max(somarDias(lib,5),hoje);return fim(somarUteis(med,12,feriados),`Liberada para medição em ${lib.split('-').reverse().join('/')}: medição em 5 dias + 12 úteis de conferência + 35 úteis`,'estimado')}
  const base=dataValida(dataVenda)?max(dataVenda,hoje):hoje
  return fim(somarUteis(somarDias(base,5),12,feriados),'Ainda sem liberação para medição: cálculo a partir de hoje (5 + 12 + 35)','estimado')
 }catch{return null}
}

// Linha do tempo resumida da ficha: da venda até a liberação para a correção, com os prazos de cada etapa.
// Clientes vindos da planilha usam as datas registradas nela (marcadas como "planilha") até haver marco real.
export function datasPedido(d, { vendidoEm = null, feriados = [] } = {}) {
  const imp = d.importacao_revisoes || {}
  // Só datas válidas entram nos cálculos; texto da planilha ("P/JULHO", "?") aparece como anotação.
  const de = (real, plan) => dataValida(real) ? { data: real, planilha: false } : dataValida(plan) ? { data: plan, planilha: true } : plan ? { data: null, texto: String(plan), planilha: true } : { data: null, planilha: false }
  const venda = de(d.venda_data || vendidoEm, null)
  const liberacao = de(d.liberacao_em, imp.lib_medida)
  const medida = de(d.medicao_agendada || d.medicao_em, imp.medida)
  const correcao = de(d.medicao_em, imp.medida)
  const assinatura = de(d.aprovacao_em, imp.assinatura)
  const etapas = [
    { k: 'venda', rotulo: 'Venda fechada', ...venda },
    { k: 'liberacao', rotulo: 'Liberado p/ medição', ...liberacao },
    { k: 'medida', rotulo: d.medicao_em || imp.medida ? 'Dia da medida' : 'Medida agendada', ...medida },
    { k: 'correcao', rotulo: 'Liberado p/ correção', ...correcao },
  ]
  const seguroDias = (dt, n) => { try { return somarDias(dt, n) } catch { return null } }
  const seguroUteis = (dt, n, f) => { try { return somarUteis(dt, n, f) } catch { return null } }
  const prazos = []
  if (d.espera_motivo) return { etapas, prazos: [{ rotulo: `Em espera · ${d.espera_motivo}${d.espera_contato_em ? ' · último contato ' + d.espera_contato_em.split('-').reverse().join('/') : ''} · próximo contato`, data: d.espera_proximo_contato || null, espera: true }] }
  if (liberacao.data && !medida.data) prazos.push({ rotulo: 'Rodrigo agenda a medida até', data: d.medicao_prazo || seguroDias(liberacao.data, 5) })
  if (correcao.data && !d.correcao_em && !assinatura.data) prazos.push({ rotulo: 'Giovanna conclui a correção até', data: d.correcao_prazo || seguroUteis(correcao.data, 12, feriados) })
  if (d.correcao_em && !assinatura.data) prazos.push({ rotulo: 'Correção concluída em', data: d.correcao_em, feito: true })
  const limiteEntrega = assinatura.data ? (d.entrega_prazo || seguroUteis(assinatura.data, 35, feriados)) : null
  if (assinatura.data && !d.entrega_em) prazos.push({ rotulo: 'Entrega até (35 dias úteis da assinatura das guias)', data: limiteEntrega })
  // Data combinada com o cliente pela logística; fica vermelha se passar do prazo do contrato.
  if (dataValida(d.entrega_prevista) && !d.entrega_em) prazos.push({ rotulo: 'Entrega confirmada com o cliente', data: d.entrega_prevista, feito: true, atraso: !!(limiteEntrega && d.entrega_prevista > limiteEntrega) })
  return { etapas, prazos: prazos.filter((p) => p.espera || p.data) }
}
