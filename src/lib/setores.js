import { somarUteis, somarDias } from './prazos.js'
export const SETORES = {
 vendas:{titulo:'Vendas',descricao:'Propostas, contratos e checklist. Vendas futuras ficam separadas até a liberação do imóvel.',tipos:['pedido']},
 medicao:{titulo:'Medida técnica',descricao:'Vendas fechadas aguardando a medida. Quando o vendedor libera a pasta do cliente, Rodrigo tem 5 dias corridos para agendar a medida; depois registra a conclusão, que inicia os 12 dias úteis da Giovanna.',tipos:['pedido']},
 correcao:{titulo:'Correção',descricao:'Pasta liberada pelo vendedor: Rodrigo agenda a medida técnica em até 5 dias corridos. Concluída a medida, Giovanna tem 12 dias úteis para conferência e guias e depois agenda a assinatura das guias na loja.',tipos:['pedido']},
 liberacao:{titulo:'Liberação',descricao:'Guias técnicas assinadas na loja (início dos 35 dias úteis), implantação pelo conferente e pagamento da fábrica pela Leia.',tipos:['pedido']},
 montagem:{titulo:'Montagem',descricao:'Glauci acompanha o recebimento, organiza a entrega e agenda os montadores. A escala depende da quitação conferida.',tipos:['pedido','agenda','frete']},
 qualidade:{titulo:'Qualidade',descricao:'Conclusão da montagem, termo assinado, assistências em até 30 dias úteis e agendamento das fotos.',tipos:['pedido','assistencia']},
}
// Fichas importadas da planilha de revisões ficam no setor de origem até a equipe registrar marcos reais.
const MARCOS_REAIS=['liberacao_em','medicao_em','correcao_em','aprovacao_em','implantacao_em','fabrica_paga','carregamento_em','cliente_recebe_em','entrega_em','montagem_concluida_em','fotos_em']
export function setorImportado(d) {
 const s=d?.importacao_revisoes?.setor_codigo
 return s&&SETORES[s]&&!MARCOS_REAIS.some(k=>d[k])?s:null
}
export function setorPedido(d) {
 const importado=setorImportado(d)
 if(importado)return importado
 if(d.entrega_em||d.montagem_concluida_em||d.fotos_em)return 'qualidade'
 if(d.carregamento_em||d.cliente_recebe_em)return 'montagem'
 if(d.correcao_em||d.aprovacao_em||d.implantacao_em||d.fabrica_paga)return 'liberacao'
 if(d.liberacao_em||d.medicao_em)return 'correcao'
 return 'vendas'
}
export function noSetor(registro,setor) {
 if(!setor)return true
 if(setor==='medicao')return registro.tipo==='pedido'&&!registro.dados.medicao_em&&!registro.dados.importacao_revisoes?.medida&&['vendas','correcao'].includes(setorPedido(registro.dados))
 if(registro.tipo==='pedido')return setorPedido(registro.dados)===setor
 return SETORES[setor]?.tipos.includes(registro.tipo)||false
}

// Prazo estimado para fichas importadas, a partir das datas reais da planilha e dos prazos definitivos da loja.
// Não substitui os marcos registrados na jornada: deixa de valer assim que houver marco real.
export function prazoImportado(d, feriados = []) {
 const imp=d?.importacao_revisoes
 if(!imp||!setorImportado(d))return null
 const ok=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')
 try{
  if(imp.setor_codigo==='correcao'){
   if(ok(imp.medida))return {prazo:somarUteis(imp.medida,12,feriados),etapa:'Conferência e guias · 12 dias úteis desde a medida'}
   if(ok(imp.lib_medida))return {prazo:somarDias(imp.lib_medida,5),etapa:'Medição · 5 dias corridos desde a liberação'}
  }
  if(['liberacao','montagem'].includes(imp.setor_codigo)&&ok(imp.assinatura))return {prazo:somarUteis(imp.assinatura,35,feriados),etapa:'Entrega · 35 dias úteis desde a assinatura do projeto'}
 }catch{return null}
 return null
}
