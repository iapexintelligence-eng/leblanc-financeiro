import { hojeSP, somarDias, util } from './prazos.js'
import { setorPedido, SETORES } from './setores.js'

export const PAPEIS={vendedor:'Vendas',correcao:'Conferência',logistica:'Glauci · logística',financeiro:'Leia · financeiro',gestor:'Gestão'}
export const MARCOS={'':'Não bloqueia avanço',liberacao_em:'Liberação para medição',implantacao_em:'Implantação na fábrica',confirmada:'Liberação da escala',entrega_em:'Entrega',fotos_em:'Fotos'}
export function situacoesSeparadas(d) {
 return {comercial:d.tipo_venda==='Futura'&&!d.imovel_pronto_em?'Venda futura · aguarda imóvel':'Venda fechada',operacional:SETORES[setorPedido(d)]?.titulo||'Em acompanhamento',financeiro:d.saldo_confirmado?'Quitação conferida':d.entrada_confirmada?'Entrada conferida · saldo pendente':'Entrada pendente de conferência'}
}
export function pendenciasAutomaticas(registros) {
 const out=[]
 const add=(r,titulo,papel,prazo)=>out.push({id:`${r.id}-${titulo}`,registro_id:r.id,contrato_id:r.contrato_id,cliente:r.dados.cliente_nome,titulo,papel,prazo,origem:'Etapa da jornada'})
 for(const r of registros){const d=r.dados
  if(r.tipo==='assistencia'&&d.status!=='Resolvida')add(r,d.proxima_acao||'Resolver assistência','logistica',d.vencimento)
  if(r.tipo==='frete'&&d.status==='Liberado para pagamento')add(r,'Pagar frete conferido','financeiro',d.prevista)
  if(r.tipo!=='pedido')continue
  if(!d.planta_enviada_em)add(r,'Enviar planta baixa e informações','vendedor',d.planta_prazo)
  if(!d.entrada_confirmada)add(r,'Conferir entrada e comprovante','financeiro',null)
  if(d.tipo_venda==='Futura'&&!d.imovel_pronto_em){add(r,'Acompanhar aviso de imóvel pronto','vendedor',null);continue}
  if(d.liberacao_em&&!d.medicao_em)add(r,'Acompanhar medição com Rodrigo','correcao',d.medicao_prazo)
  if(d.medicao_em&&!d.correcao_em)add(r,'Concluir conferência e guias técnicas','correcao',d.correcao_prazo)
  if(d.correcao_em&&!d.aprovacao_em)add(r,'Obter aprovação e guias assinadas','correcao',null)
  if(d.aprovacao_em&&!d.implantacao_em)add(r,'Implantar pedido aprovado','correcao',d.entrega_prazo)
  if(d.implantacao_em&&!d.fabrica_paga)add(r,'Conferir pagamento da fábrica','financeiro',null)
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
 ['Implantação',!!(d.aprovacao_em&&d.guias_arquivo),'Aprovação do cliente e guias técnicas assinadas.'],
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
