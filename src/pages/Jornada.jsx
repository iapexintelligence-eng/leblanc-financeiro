import AditivosContrato from '../components/AditivosContrato.jsx'
import XmlFinalConferencia from '../components/XmlFinalConferencia.jsx'
import RegistroComplementos from '../components/RegistroComplementos.jsx'
import EtapasRealizadas from '../components/EtapasRealizadas.jsx'
import Protegido from '../components/Protegido.jsx'
import PainelAssistencias from '../components/PainelAssistencias.jsx'
import QuadroPosVenda from '../components/QuadroPosVenda.jsx'
import { ORIGENS_ERRO, STATUS_COBRANCA, INDUSTRIAS_CONHECIDAS, custoAssistencia } from '../lib/assistencias.js'
import { situacoesSeparadas, checklistPassagem, datasPedido } from '../lib/operacao.js'
import { SETORES, noSetor, prazoImportado, setorImportado } from '../lib/setores.js'
import { jornadaDemo } from '../lib/jornadaDemo.js'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, authOn } from '../lib/supabase.js'
import { carregarJornada, salvarRegistro, anexarJornada, abrirDocumento, todas } from '../lib/jornada.js'
import { alertaPrazo, hojeSP } from '../lib/prazos.js'
import { brl, fmtDate } from '../lib/format.js'
import Modal from '../components/Modal.jsx'

const TIPOS={pedido:'Jornada do cliente',assistencia:'Assistências',agenda:'Agenda de montadores',frete:'Fretes por viagem'}
// Campos internos permanecem fora do documento público do contrato.
const CAMPOS={
 pedido:[
 ['Em espera · venda futura ou aguardando liberação (pausa os prazos da etapa)'],['espera_motivo','Situação de espera',['Venda futura','Aguardando liberação do imóvel para a medida técnica','Aguardando liberação do cliente']],['espera_contato_em','Data do último contato com o cliente','date'],['espera_proximo_contato','Próximo contato combinado','date'],['espera_obs','O que o cliente informou','textarea'],
 ['Fechamento e checklist'],['venda_data','Fechamento do contrato','date'],['tipo_venda','Tipo de venda',['Normal','Futura']],['imovel_pronto_em','Cliente avisou que o imóvel está pronto','date'],
 ['grupo_criado','Grupo criado: cliente, gestores e setores','check'],['grupo_arquivo','Comprovação do grupo','file'],['imagens_enviadas','Imagens enviadas ao cliente','check'],['imagens_arquivo','Imagens e evidência do envio','file'],
 ['planta_enviada_em','Planta enviada por e-mail ao corretor','date'],['planta_arquivo','Planta baixa do Promob','file'],['informacoes_correcao','Informações para correção','textarea'],
 ['Financeiro de entrada'],['entrada_confirmada_arquivo','Comprovante da entrada','file'],['entrada_confirmada','Leia: entrada conferida','check'],
 ['Pasta do cliente e medida técnica · Rodrigo agenda em até 5 dias corridos após a pasta liberada'],['liberacao_em','Pasta do cliente liberada pelo vendedor','date'],['medicao_agendada','Rodrigo: medida técnica agendada para','date'],['medicao_em','Rodrigo: medida técnica concluída (início dos 12 dias úteis da Giovanna)','date'],['medicao_arquivo','Medidas técnicas','file'],['medicao_obs','Rodrigo: observações da medida','textarea'],
 ['Conferência · Giovanna · 12 dias úteis desde a medida'],['conferente','Conferente'],['correcao_em','Conferência e guias técnicas concluídas','date'],['guias_agendadas','Assinatura das guias agendada com o cliente na loja','date'],['aprovacao_em','Guias técnicas assinadas pelo cliente (início dos 35 dias úteis)','date'],['guias_arquivo','Guias técnicas assinadas','file'],
 ['Implantação pelo conferente · exige XML final e OK da Leia (aba XML final e conferência)'],['pedido_fabrica','Número do pedido na fábrica'],['implantacao_em','Implantação realizada','date'],['pedido_arquivo','Pedido e cobrança da fábrica','file'],['fabrica_paga_arquivo','Comprovante de pagamento da fábrica','file'],['fabrica_paga','Leia: pagamento da fábrica conferido','check'],
 ['Logística · Glauci'],['carregamento_em','Aviso de previsão de carregamento','date'],['cliente_recebe_em','Cliente confirmou que pode receber','date'],['aceite_arquivo','Confirmação do cliente','file'],['impedimento','Impedimento / previsão informada pelo cliente','textarea'],['entrega_prevista','Entrega prevista','date'],
 ['Saldo final · 2 dias corridos antes da entrega'],['cobranca_em','Leia avisou o cliente da data do pagamento (informativo)','date'],['saldo_confirmado_arquivo','Comprovante do saldo / liquidação pela operadora','file'],['saldo_confirmado','Leia: quitação conferida, liberar escala','check'],
 ['Entrega, montagem e fotos'],['entrega_em','Entrega realizada','date'],['montagem_concluida_em','Montagem concluída','date'],['termo_montagem_arquivo','Termo de montagem assinado, com eventuais ressalvas','file'],['fotos_em','Agendamento das fotos','date'],
 ],
 assistencia:[
 ['Ocorrência'],['identificada','Problema identificado em','date'],['descricao','Descrição do problema','textarea'],['ambiente','Ambiente / peça afetada'],['foto_arquivo','Fotos da ocorrência','file'],['montagem_id','Montagem de origem','montagem'],['montador_original','Montador da montagem original'],
 ['Onde foi o erro · Léia registra (obrigatório para encerrar)'],['origem_erro','Etapa onde aconteceu o erro',ORIGENS_ERRO],['responsavel_erro','Quem responde pelo erro (pessoa, indústria, montador ou transportadora)','responsavel'],['analise_erro','Como foi apurado','textarea'],
 ['Atendimento'],['responsavel','Responsável pelo atendimento'],['status','Situação',['Identificada','Em análise','Peças solicitadas','Aguardando peças','Atendimento agendado','Executada','Resolvida']],['pecas','Peças necessárias','textarea'],['proxima_acao','Próxima ação'],['prevista','Previsão da próxima ação','date'],['realizada','Visita realizada','date'],['visitas','Quantas idas ao cliente até resolver','number'],['confirmacao','Confirmação de que o problema foi resolvido','textarea'],['evidencia_arquivo','Evidência de resolução / termo quando disponível','file'],
 ['Custos · os fretes ligados a esta assistência somam automaticamente'],['custo_pecas','Peças / material','number'],['custo_mao_obra','Mão de obra (montador)','number'],['custo_outros','Outros custos','number'],
 ['Cobrança do responsável'],['cobranca_status','Situação da cobrança',STATUS_COBRANCA],['cobranca_valor','Valor cobrado do responsável','number'],['cobranca_em','Cobrado em','date'],['ressarcido_valor','Valor ressarcido','number'],['cobranca_arquivo','Comprovante da cobrança / ressarcimento','file'],['cobranca_obs','Observações da cobrança','textarea']],
 agenda:[['montador_id','Montador','montador'],['inicio','Início','date'],['fim','Fim','date'],['dias_estimados','Esforço estimado em dias de montagem','number'],['ambientes','Ambientes / trabalho previsto','textarea'],['confirmada','Confirmar e liberar escala ao montador','check'],['observacoes','Orientações para o montador','textarea']],
 frete:[['prestador','Prestador'],['origem','Retirar em'],['destino','Entregar em'],['motivo','Finalidade / peças transportadas','textarea'],['assistencia_id','Assistência vinculada','assistencia'],['prevista','Viagem prevista','date'],['realizada','Viagem realizada','date'],['valor','Valor combinado por viagem','number'],['orcamento_arquivo','Orçamento / valor combinado','file'],['status','Situação',['Solicitado','Em execução','Aguardando conferência','Liberado para pagamento','Pago']],['evidencia_arquivo','Comprovante de retirada e entrega','file'],['excecao_motivo','Justificativa para autorização da rota/valor','textarea'],['excecao_valor','Valor submetido à autorização','number'],['pagamento_arquivo','Leia: comprovante do pagamento','file']]
}
// Situação de origem da planilha "CONTROLE DE REVISÕES 2026". Somente leitura.
function ImportacaoRevisoes({imp}) {
 const linhas=[['Setor na importação',imp.setor],['Conferente',imp.conferente],['Vendedor na planilha',imp.vendedor],['Liberação da medida',imp.lib_medida],['Medida',imp.medida],['Assinatura',imp.assinatura],['Situação',imp.situacao],['Guias técnicas',imp.guias],['Itens extras',imp.extras],['Status',imp.status],['Andamento',imp.andamento]].filter(([,v])=>v)
 return <div className="card" style={{margin:'12px 0'}}><h3>Situação trazida da planilha de revisões</h3><p className="sub">Importado em {fmtDate(imp.importado_em)} de {imp.arquivo} ({imp.aba}, linha {imp.linha}). Nenhum prazo foi iniciado. Use o quadro abaixo para lançar as etapas que já aconteceram.</p>
  <table><tbody>{linhas.map(([k,v])=><tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
  {imp.pendencias?.length>0&&<p><b>Pendências:</b> {imp.pendencias.join(' · ')}</p>}
  {imp.notas?.length>0&&<p><b>Notas recentes:</b> {imp.notas.join(' | ')}</p>}
  {imp.historico?.length>1&&<details><summary>Aparições anteriores na planilha</summary>{imp.historico.map((h,i)=><p key={i}>{h}</p>)}</details>}
 </div>
}
// Datas da venda até a liberação para a correção e o próximo prazo, numa coluna compacta.
function LinhaDoTempo({d,vendidoEm,feriados,hoje}) {
 const {etapas,prazos}=datasPedido(d,{vendidoEm,feriados})
 return <div style={{fontSize:12,lineHeight:1.5,minWidth:210}}>
  {etapas.map(e=><div key={e.k} style={{display:'flex',justifyContent:'space-between',gap:10,color:e.data?undefined:'var(--muted)'}}><span>{e.rotulo}</span><b style={{fontWeight:e.data?600:400}}>{e.data?fmtDate(e.data):e.texto?`“${e.texto}”`:'—'}{e.planilha&&<span className="sub" style={{margin:0,fontWeight:400}}> (planilha)</span>}</b></div>)}
  {prazos.map(p=><div key={p.rotulo} style={{marginTop:4,color:(p.data&&!p.feito&&p.data<hoje)||p.atraso?'var(--danger)':p.espera?'var(--warn)':undefined}}>{p.rotulo}: <b>{p.data?fmtDate(p.data):'a combinar'}</b>{p.data&&!p.feito&&p.data<hoje?' · vencido':''}{p.atraso?' · depois do prazo do contrato':''}</div>)}
 </div>
}
const inicial=(tipo)=>tipo==='pedido'?{tipo_venda:'Normal'}:tipo==='assistencia'?{identificada:hojeSP(),status:'Identificada',responsavel:'Glauci (atendimento)',origem_erro:'A apurar',cobranca_status:'A cobrar'}:tipo==='frete'?{status:'Solicitado'}:{}
const diasDesde=(a,b)=>Math.max(0,Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/86400000))
function prazo(r,feriados=[]) {
 const d=r.dados
 if(r.tipo==='pedido'&&d.espera_motivo) return d.espera_proximo_contato||null
 const est=r.tipo==='pedido'?prazoImportado(d,feriados):null
 if(est) return est.prazo
 if(r.tipo==='assistencia') return d.status==='Resolvida'?null:d.vencimento
 if(r.tipo!=='pedido') return null
 if(d.entrega_em) return null
 if(d.aprovacao_em) return d.entrega_prazo
 if(d.medicao_em && !d.correcao_em) return d.correcao_prazo
 if(d.liberacao_em && !d.medicao_em) return d.medicao_agendada||d.medicao_prazo
 return !d.planta_enviada_em?d.planta_prazo:null
}
function situacao(r) {
 const d=r.dados
 if(r.tipo==='agenda') return d.confirmada?'Escala liberada':'Reserva interna'
 if(r.tipo!=='pedido') return d.status
 if(d.espera_motivo) return `Em espera: ${d.espera_motivo}${d.espera_contato_em?` · último contato ${fmtDate(d.espera_contato_em)}`:''}`
 if(d.fotos_em) return 'Fotos agendadas'
 if(d.montagem_concluida_em) return 'Montagem concluída'
 if(d.entrega_em) return 'Entregue'
 if(d.cliente_recebe_em && !d.saldo_confirmado) return 'Leia: cobrar / conferir saldo'
 if(d.carregamento_em && !d.cliente_recebe_em) return 'Glauci: confirmar recebimento'
 if(d.fabrica_paga) return 'Em produção / transporte'
 if(d.implantacao_em) return 'Leia: pagar fábrica'
 if(d.aprovacao_em) return 'Conferente: XML final, OK da Leia e implantação'
 if(d.correcao_em) return d.guias_agendadas?`Assinatura das guias agendada: ${fmtDate(d.guias_agendadas)}`:'Giovanna: agendar assinatura das guias'
 if(d.medicao_em) return 'Giovanna: conferência e guias'
 if(d.liberacao_em) return d.medicao_agendada?`Medida agendada: ${fmtDate(d.medicao_agendada)}`:'Rodrigo: agendar a medida técnica'
 if(!d.liberacao_em&&d.tipo_venda!=='Futura'&&(d.planta_enviada_em||d.entrada_confirmada)) return 'Vendedor: liberar a pasta do cliente'
 if(setorImportado(d)) return 'Planilha: '+([d.importacao_revisoes.situacao,d.importacao_revisoes.status].filter(Boolean).join(' · ')||'em conferência')
 if(d.tipo_venda==='Futura'&&!d.imovel_pronto_em) return 'Venda futura: aguardando cliente'
 return 'Checklist e entrada'
}
export default function Jornada({ tipoInicial='pedido', setor=null }) {
 const [params]=useSearchParams()
 const [abaFicha,setAbaFicha]=useState('Resumo')
 const [vendaFiltro,setVendaFiltro]=useState('Normal'),[soAtrasados,setSoAtrasados]=useState(false),[visao,setVisao]=useState('quadro')
 const setorInfo=SETORES[setor]
 const [demo]=useState(()=>authOn?null:jornadaDemo())
 const [mes,setMes]=useState(hojeSP().slice(0,7)),[montadorFiltro,setMontadorFiltro]=useState('')
 const [tipo,setTipo]=useState(tipoInicial),[dados,setDados]=useState(demo?.dados||null),[contratos,setContratos]=useState(demo?.contratos||[]),[erro,setErro]=useState(''),[busca,setBusca]=useState(''),[modal,setModal]=useState(null),[saving,setSaving]=useState(false),[upload,setUpload]=useState(false),[historico,setHistorico]=useState([]),[agora,setAgora]=useState(hojeSP())
 async function carregar() {
  try {
   const j=await carregarJornada(); setDados(j)
   if(j.eu?.papel!=='montador') setContratos(await todas(()=>supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome,cliente_endereco,cliente_telefone,projeto_ambientes,vendor,created_at,data_contrato:dados_json->>data_contrato').order('id')))
   const res=await supabase.rpc('jornada_gerar_alertas'); if(res.error) throw res.error
   setErro('')
  } catch(e) {setErro(`Não foi possível carregar a jornada: ${e.message}. Se esta é a primeira ativação, confira a migração e seu acesso.`)}
 }
 useEffect(()=>{if(authOn) carregar()},[])
 useEffect(()=>{const id=setInterval(()=>{setAgora(hojeSP()); if(authOn) carregar()},60000);return()=>clearInterval(id)},[])
 useEffect(()=>setTipo(tipoInicial),[tipoInicial,setor])
 const mapa=Object.fromEntries(contratos.map(c=>[String(c.id),c]))
 const registros=dados?.registros||[],feriados=dados?.config.feriados||[]
 const lista=registros.filter(r=>r.tipo===tipo&&noSetor(r,setor)&&(!soAtrasados||(prazo(r,feriados)&&prazo(r,feriados)<agora))&&(setor!=='vendas'||(r.dados.tipo_venda||'Normal')===vendaFiltro)&&(!busca||`${mapa[r.contrato_id]?.cliente_nome||r.dados.cliente_nome||''} ${r.dados.montador_original||''} ${r.dados.prestador||''}`.toLowerCase().includes(busca.toLowerCase()))).sort((a,b)=>(prazo(a,feriados)||'9999').localeCompare(prazo(b,feriados)||'9999'))
 const abertos=registros.filter(r=>r.tipo==='assistencia'&&r.dados.status!=='Resolvida')
 const atrasadas=abertos.filter(r=>prazo(r)&&prazo(r)<agora)
 const pedidosAtrasados=registros.filter(r=>r.tipo==='pedido'&&noSetor(r,setor)&&prazo(r,feriados)&&prazo(r,feriados)<agora)
 const demanda={}
 registros.filter(r=>r.tipo==='pedido'&&r.dados.entrega_prazo&&!r.dados.montagem_concluida_em).forEach(r=>{const mes=(r.dados.entrega_prevista||r.dados.entrega_prazo).slice(0,7);demanda[mes]=(demanda[mes]||0)+1})
 const edita=authOn&&dados?.eu&&dados.eu.papel!=='montador'
 const medidor=dados?.eu?.papel==='medidor'
 // Rodrigo altera só os campos da medida técnica; os demais ficam para consulta.
 const travado=(k)=>!edita||(medidor&&!['medicao_agendada','medicao_em','medicao_arquivo','medicao_obs'].includes(k))||(medidor&&k==='medicao_agendada'&&!modal?.dados?.liberacao_em)
 const set=(k,v)=>setModal(m=>({...m,dados:{...m.dados,[k]:v}}))
 async function abrir(r) {
  setModal(structuredClone(r));setHistorico([]);setAbaFicha('Resumo')
  if(authOn&&r.id){const x=await supabase.from('jornada_eventos').select('data,autor,versao').eq('registro_id',r.id).order('versao',{ascending:false});if(x.error)setErro(x.error.message);else setHistorico(x.data)}
 }
 useEffect(()=>{const id=params.get('registro');if(id&&dados){const r=dados.registros.find(r=>r.id===id);if(r)abrir(r).then(()=>{if(params.get('aba')==='xml')setAbaFicha('XML final e conferência')})}},[params.get('registro'),!!dados])
 async function salvar() {
  setSaving(true);setErro('')
  try {await salvarRegistro({...modal,dados:{...modal.dados,cliente_nome:medidor?modal.dados.cliente_nome:(mapa[modal.contrato_id]?.cliente_nome||modal.dados.cliente_nome)}});setModal(null);await carregar()}catch(e){setErro(e.message)}finally{setSaving(false)}
 }
 async function anexo(k,file) {if(!file)return;setUpload(true);try{set(k,await anexarJornada(file))}catch(e){setErro(e.message)}finally{setUpload(false)}}
 const vendidoEm=(r)=>r.dados.venda_data||mapa[r.contrato_id]?.data_contrato||null
 const aviso=(r)=>alertaPrazo(prazo(r,feriados),{hoje:agora,feriados})
 const diasMes = new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0).getDate()
 const contrato=modal?mapa[modal.contrato_id]:null
 const pedidoDoModal=modal?registros.find(r=>r.tipo==='pedido'&&r.contrato_id===modal.contrato_id):null
 const sugestoesResponsavel=[...new Set([...INDUSTRIAS_CONHECIDAS,contrato?.vendor&&`Vendedor ${contrato.vendor}`,pedidoDoModal?.dados.conferente&&`Conferente ${pedidoDoModal.dados.conferente}`,'Rodrigo (medida técnica)',...(dados?.pessoas||[]).filter(p=>p.papel==='montador').map(p=>`Montador ${p.nome}`),...registros.filter(r=>r.tipo==='frete').map(r=>r.dados.prestador&&`Transportadora ${r.dados.prestador}`),modal?.dados?.montador_original&&`Montador ${modal.dados.montador_original}`,'Cliente'].filter(Boolean))]
 const mail=contrato?`Nome: ${contrato.cliente_nome}\nEndereço: ${contrato.cliente_endereco||''}\nContato: ${contrato.cliente_telefone||''}\nAmbientes: ${contrato.projeto_ambientes||''}\n\nAnexar a planta baixa do Promob antes de enviar.`:''
 const mailPronto=contrato?.cliente_nome&&contrato.cliente_endereco&&contrato.cliente_telefone&&contrato.projeto_ambientes&&modal?.dados.planta_arquivo
 return <>
  <div className="card" style={{marginBottom:16}}><h3>{setorInfo?.titulo||'Jornada integrada'}</h3><p>{setorInfo?.descricao||'Responsáveis, documentos, prazos e liberações do cliente em um único histórico.'}</p>
   <div className="tools" style={{flexWrap:'wrap',marginTop:12}}>{Object.entries(TIPOS).filter(([k])=>!setorInfo||setorInfo.tipos.includes(k)).map(([k,v])=><button key={k} className={`btn ${tipo===k?'':'ghost'}`} onClick={()=>setTipo(k)}>{setor&&k==='pedido'?'Clientes do setor':v}</button>)}</div>
   {setor==='vendas'&&<><div className="tools" style={{marginTop:12}}>{['Normal','Futura'].map(v=><button key={v} className={'btn '+(vendaFiltro===v?'':'ghost')} onClick={()=>setVendaFiltro(v)}>{v==='Normal'?'Vendas normais':'Vendas futuras'}</button>)}</div><div className="tools" style={{marginTop:12}}><Link className="btn ghost" to="/contratos">Propostas e contratos</Link><Link className="btn ghost" to="/simulador">Simular pagamento</Link><Link className="btn ghost" to="/vendas-historico">Histórico de vendas</Link><Link className="btn ghost" to="/contratos-importados">Contratos importados</Link></div></>}
   {setor&&<p className="sub" style={{marginTop:12}}>A lista mostra os clientes desta etapa. <Link to="/jornada">Ver jornada completa</Link></p>}
  </div>
  {!authOn&&<div className="card">Demonstração com clientes fictícios · navegue pelas abas e abra os registros. Nenhum dado é salvo ou enviado ao banco. Os prazos exibidos são exemplos ilustrativos.</div>}
  {erro&&<div role="alert" className="login-err">{erro}</div>}
  {dados&&!dados.eu&&<div role="alert" className="card">Seu acesso à jornada ainda não foi cadastrado.</div>}
  {dados&&!dados.config.calendario_ate&&<div className="card">Calendário de feriados pendente. Os prazos não serão ativados até a configuração do calendário pela gestão.</div>}
  {(!setor||setor==='qualidade'||setor==='montagem')&&<div className="grid cols-3" style={{margin:'16px 0'}}>
   <div className="card kpi"><div className="label">Assistências em aberto</div><div className="value">{abertos.length}</div></div>
   <div className="card kpi"><div className="label">Assistências vencidas</div><div className="value" style={{color:'var(--danger)'}}>{atrasadas.length}</div></div>
   <div className="card kpi"><div className="label">Fretes aguardando pagamento</div><div className="value">{registros.filter(r=>r.tipo==='frete'&&r.dados.status==='Liberado para pagamento').length}</div></div>
  </div>}
  {(!setor||setor==='montagem')&&<div className="card" style={{marginBottom:16}}><h3>Previsão de montagens</h3><Link className="btn ghost" to="/capacidade-montagem">Capacidade e indisponibilidades</Link><p className="sub">Estimativa por entrega prevista, a partir dos 35 dias úteis após aprovação. Reservas internas não liberam a escala.</p>{Object.keys(demanda).length?Object.entries(demanda).sort().map(([mes,n])=><span key={mes} className="pill" style={{margin:4}}>{mes}: {n} pedido(s) previstos</span>):<p>Sem pedidos com aprovação e prazo de entrega registrados.</p>}</div>}
  {setor==='montagem'&&tipo==='pedido'&&<div className="tools" style={{marginBottom:12}}>{[['quadro','Quadro de pós-venda'],['lista','Lista com prazos']].map(([k,v])=><button key={k} className={'btn '+(visao===k?'':'ghost')} onClick={()=>setVisao(k)}>{v}</button>)}<Link className="btn ghost" to="/previsibilidade-montagens">Previsibilidade de montagens</Link></div>}
  {setor==='montagem'&&tipo==='pedido'&&visao==='quadro'&&<Protegido nome="Quadro de pós-venda"><QuadroPosVenda registros={registros} mapa={mapa} pessoas={dados?.pessoas||[]} eu={dados?.eu} demo={!authOn} onSalvo={carregar}/></Protegido>}
  {tipo==='assistencia'&&<Protegido nome="Painel de assistências"><PainelAssistencias registros={registros} mapa={mapa} onAbrir={(cid)=>{setBusca(mapa[cid]?.cliente_nome||'')}}/></Protegido>}
  {tipo==='agenda'&&<div className="card" style={{marginBottom:16}}><div className="tools"><label>Mês <input type="month" className="input" value={mes} onChange={e=>setMes(e.target.value||hojeSP().slice(0,7))}/></label><select aria-label="Filtrar montador" className="input" value={montadorFiltro} onChange={e=>setMontadorFiltro(e.target.value)}><option value="">Todos os montadores</option>{dados?.pessoas.filter(p=>p.papel==='montador').map(p=><option key={p.usuario_id} value={p.usuario_id}>{p.nome}</option>)}</select></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8,marginTop:12}}>{Array.from({length:diasMes},(_,i)=>{const dia=`${mes}-${String(i+1).padStart(2,'0')}`;const reservas=registros.filter(r=>r.tipo==='agenda'&&r.dados.inicio<=dia&&r.dados.fim>=dia&&(!montadorFiltro||r.dados.montador_id===montadorFiltro));return <div key={dia} style={{border:'1px solid var(--line)',padding:8,minHeight:74}}><b>{fmtDate(dia)}</b>{reservas.map(r=><button className="btn ghost sm" style={{display:'block',whiteSpace:'normal',marginTop:6}} key={r.id} onClick={()=>abrir(r)}>{dados?.pessoas.find(p=>p.usuario_id===r.dados.montador_id)?.nome||'Montador'} · {mapa[r.contrato_id]?.cliente_nome||r.dados.cliente_nome}<br/>{r.dados.confirmada?'Escala liberada':'Reserva interna'}</button>)}</div>})}</div></div>}
  {tipo==='pedido'&&<div className="card" style={{marginBottom:12,borderColor:pedidosAtrasados.length?'var(--danger)':undefined}}><div className="between" style={{flexWrap:'wrap',gap:8}}><div><b style={{color:pedidosAtrasados.length?'var(--danger)':undefined}}>{pedidosAtrasados.length} cliente(s) com prazo vencido{setor?' neste setor':''}</b><div className="sub" style={{margin:0}}>Clientes vindos da planilha usam prazo estimado pelas datas registradas nela (medida, liberação ou assinatura do projeto) até a equipe registrar os marcos reais.</div></div><button className={'btn '+(soAtrasados?'':'ghost')} onClick={()=>setSoAtrasados(v=>!v)}>{soAtrasados?'Mostrar todos':'Ver só os atrasados'}</button></div></div>}
  {!(setor==='montagem'&&tipo==='pedido'&&visao==='quadro')&&<>
  <div className="section-head"><input aria-label="Buscar atendimento" className="input" placeholder="Buscar cliente, montador ou prestador" value={busca} onChange={e=>setBusca(e.target.value)}/>{edita&&!medidor&&<button className="btn" onClick={()=>abrir({tipo,contrato_id:'',dados:{...inicial(tipo),...(setor==='vendas'?{tipo_venda:vendaFiltro}:{})}})}>Novo registro</button>}</div>
  <div className="table-wrap"><table><thead><tr><th>Cliente / contrato</th>{tipo==='pedido'&&<th>Venda → medição → correção</th>}<th>Situação</th><th>Prazo / período</th><th>Responsável / valor</th><th></th></tr></thead><tbody>
   {lista.length===0&&<tr><td colSpan={tipo==='pedido'?6:5} className="empty">Nenhum registro nesta visão.</td></tr>}
   {lista.map(r=>{const a=aviso(r);return <tr key={r.id} style={{background:a?.nivel==='danger'?'var(--danger-bg)':undefined}}><td>{mapa[r.contrato_id]?.cliente_nome||r.dados.cliente_nome||r.contrato_id}<div className="sub">{mapa[r.contrato_id]?.numero}{r.tipo==='pedido'&&vendidoEm(r)&&<> · vendido em {fmtDate(vendidoEm(r))} · há {diasDesde(vendidoEm(r),agora)} dias</>}</div></td>{tipo==='pedido'&&<td><Protegido nome="Datas" chave={r.id+r.versao} fallback={<span className="sub">Datas com formato inválido · abra a ficha</span>}><LinhaDoTempo d={r.dados} vendidoEm={vendidoEm(r)} feriados={feriados} hoje={agora}/></Protegido></td>}<td>{situacao(r)}</td><td>{tipo==='agenda'?`${fmtDate(r.dados.inicio)} a ${fmtDate(r.dados.fim)}`:<>{fmtDate(prazo(r,feriados))}{a&&<div><span className={'badge '+a.nivel}>{a.texto}</span></div>}{r.tipo==='pedido'&&prazoImportado(r.dados,feriados)&&<div className="sub" style={{margin:0}}>Estimado pela planilha: {prazoImportado(r.dados,feriados).etapa}</div>}</>}</td><td>{tipo==='frete'?`${r.dados.prestador} · ${brl(r.dados.valor)}`:r.dados.responsavel||dados?.pessoas.find(p=>p.usuario_id===r.dados.montador_id)?.nome||r.dados.conferente||'—'}</td><td><button className="btn ghost" onClick={()=>abrir(r)}>{edita?'Abrir':'Ver detalhes'}</button></td></tr>})}
  </tbody></table></div></>}
  {modal&&<Modal wide title={TIPOS[modal.tipo]} onClose={()=>!saving&&!upload&&setModal(null)} footer={<><button className="btn ghost" onClick={()=>setModal(null)} disabled={saving||upload}>Fechar</button>{edita&&abaFicha==='Resumo'&&<button className="btn" onClick={salvar} disabled={saving||upload||!modal.contrato_id}>{saving?'Salvando…':'Salvar registro'}</button>}</>}>
   {erro&&<div className="login-err" role="alert">{erro}</div>}
   <div className="field"><label>Contrato</label><select className="input" value={modal.contrato_id} disabled={!!modal.id||!edita} onChange={e=>{const c=mapa[e.target.value];setModal(m=>({...m,contrato_id:e.target.value,dados:m.tipo==='pedido'&&!m.dados.venda_data&&c?.data_contrato?{...m.dados,venda_data:c.data_contrato}:m.dados}))}}><option value="">Selecione</option>{contratos.map(c=><option key={c.id} value={String(c.id)}>{c.numero} · {c.cliente_nome}</option>)}</select></div>
   {modal.tipo==='pedido'&&<div className="grid cols-3" style={{margin:'16px 0'}}>{Object.entries(situacoesSeparadas(modal.dados)).map(([k,v])=><div className="card" key={k}><small>{k==='comercial'?'Comercial':k==='operacional'?'Operacional':'Financeiro'}</small><p>{v}</p></div>)}</div>}
   <div className="tools" style={{margin:'12px 0'}}>{['Resumo',...(modal.tipo==='pedido'?['XML final e conferência']:[]),'Arquivos, tarefas e histórico','Aditivos'].map(a=><button className={'btn '+(abaFicha===a?'':'ghost')} key={a} onClick={()=>setAbaFicha(a)}>{a}</button>)}</div>
   {abaFicha==='XML final e conferência'?<XmlFinalConferencia key={modal.contrato_id} contratoId={modal.contrato_id} eu={dados?.eu} pessoas={dados?.pessoas}/>:abaFicha==='Aditivos'?<AditivosContrato key={modal.contrato_id} contratoId={modal.contrato_id}/>:abaFicha!=='Resumo'?<RegistroComplementos key={modal.id||'novo'} registro={modal} registros={registros} pessoas={dados?.pessoas} eu={dados?.eu} setor={setor||'vendas'}/>:<>
   {modal.tipo==='pedido'&&modal.dados.importacao_revisoes&&<ImportacaoRevisoes imp={modal.dados.importacao_revisoes}/>}
   {modal.tipo==='pedido'&&modal.id&&modal.dados.importacao_revisoes&&<EtapasRealizadas key={modal.id+'-'+modal.versao} registro={modal} eu={dados?.eu} pessoas={dados?.pessoas} onSalvo={(r)=>{if(r)setModal(m=>({...m,...r,dados:r.dados}));carregar()}}/>}
   {modal.tipo==='pedido'&&<details><summary>Conferência para passagem de setor</summary>{checklistPassagem(modal.dados).map(([t,ok,descr])=><p key={t}><b>{ok?'✓':'Pendente'} · {t}</b><br/>{descr}</p>)}<p className="sub">Tarefas bloqueantes adicionais são verificadas ao salvar. Para devolver uma pendência, abra a aba de tarefas e registre motivo, responsável, prazo e etapa dependente.</p></details>}
   {CAMPOS[modal.tipo].map(([k,label,t])=>!label?<h3 key={k} style={{margin:'22px 0 12px'}}>{k}</h3>:<div className="field" key={k}><label>{label}</label>{t==='check'?<input type="checkbox" checked={!!modal.dados[k]} disabled={travado(k)} onChange={e=>set(k,e.target.checked)}/>:t==='file'?<><input aria-label={label} type="file" disabled={travado(k)||upload} onChange={e=>anexo(k,e.target.files?.[0])}/>{modal.dados[k]&&<button className="btn ghost sm" onClick={()=>abrirDocumento(modal.dados[k]).catch(e=>setErro(e.message))}>Abrir anexo</button>}</>:Array.isArray(t)?<select className="input" value={modal.dados[k]||''} disabled={travado(k)} onChange={e=>set(k,e.target.value)}><option value="">Selecione</option>{t.map(v=><option key={v}>{v}</option>)}</select>:t==='montador'?<select className="input" value={modal.dados[k]||''} disabled={travado(k)} onChange={e=>set(k,e.target.value)}><option value="">Selecione</option>{dados?.pessoas.filter(p=>p.papel==='montador').map(p=><option key={p.usuario_id} value={p.usuario_id}>{p.nome}</option>)}</select>:t==='montagem'?<select className="input" value={modal.dados[k]||''} disabled={travado(k)} onChange={e=>{const a=registros.find(r=>r.id===e.target.value);set(k,e.target.value);set('montador_original',dados?.pessoas.find(p=>p.usuario_id===a?.dados.montador_id)?.nome||'')}}><option value="">Sem agenda vinculada (histórico)</option>{registros.filter(r=>r.tipo==='agenda'&&r.contrato_id===modal.contrato_id).map(r=><option key={r.id} value={r.id}>{dados?.pessoas.find(p=>p.usuario_id===r.dados.montador_id)?.nome} · {fmtDate(r.dados.inicio)}</option>)}</select>:t==='assistencia'?<select className="input" value={modal.dados[k]||''} disabled={travado(k)} onChange={e=>set(k,e.target.value)}><option value="">Sem assistência vinculada</option>{registros.filter(r=>r.tipo==='assistencia'&&r.contrato_id===modal.contrato_id).map(r=><option key={r.id} value={r.id}>{r.dados.descricao}</option>)}</select>:t==='responsavel'?<><input className="input" list="sugestoes-responsavel" disabled={travado(k)} value={modal.dados[k]||''} onChange={e=>set(k,e.target.value)} placeholder="Ex.: Bartzen, montador João, transportadora X, Rodrigo (medida)"/><datalist id="sugestoes-responsavel">{sugestoesResponsavel.map(x=><option key={x} value={x}/>)}</datalist></>:t==='textarea'?<textarea className="input" disabled={travado(k)} value={modal.dados[k]||''} onChange={e=>set(k,e.target.value)}/>:<input className="input" disabled={travado(k)} type={t||'text'} min={t==='number'?0:undefined} step={t==='number'?'0.01':undefined} value={modal.dados[k]||''} onChange={e=>set(k,e.target.value)}/>}</div>)}
   {modal.tipo==='pedido'&&<div className="card"><h3>Solicitação de medição</h3><pre style={{whiteSpace:'pre-wrap'}}>{mail}</pre>{mailPronto?<a className="btn ghost" href={`mailto:medidas@cadnetsul.com.br?subject=${encodeURIComponent('Medição — '+contrato.cliente_nome)}&body=${encodeURIComponent(mail)}`}>Preparar e-mail para Rodrigo</a>:<p>Complete nome, endereço, telefone, ambientes e anexe a planta.</p>}<p className="sub">Abre um rascunho no seu e-mail. Anexe a planta; o envio e a confirmação continuam sob responsabilidade do vendedor.</p><Link to="/contratos">Abrir contratos e documentos</Link></div>}
   {modal.tipo==='assistencia'&&modal.id&&(()=>{const c=custoAssistencia(modal,registros.filter(r=>r.tipo==='frete'));return <div className="card" style={{marginTop:12}}><b>Custo desta assistência: {brl(c.total)}</b><p className="sub" style={{margin:'4px 0 0'}}>Peças {brl(c.pecas)} · mão de obra {brl(c.maoObra)} · outros {brl(c.outros)} · fretes {brl(c.frete)} ({c.viagens} viagem(ns) ligadas) · ressarcido {brl(c.ressarcido)} · loja arca {brl(c.lojaArca)}</p></div>})()}
   {modal.tipo==='frete'&&<><p className="sub">Até cadastrar a tabela por rota/local, solicite autorização do valor combinado. Alterar rota ou valor invalida a autorização.</p>{dados?.eu?.aprovadora&&<label><input type="checkbox" checked={!!modal.dados.autorizar} onChange={e=>set('autorizar',e.target.checked)}/> Autorizar como {dados.eu.aprovadora}</label>}<p>Autorização: {modal.dados.autorizado_por||'Pendente'}</p></>}
   {historico.length>0&&<details><summary>Histórico de versões</summary>{historico.map(h=><p key={h.versao}>Versão {h.versao} · {fmtDate(h.data)} · {dados?.pessoas.find(p=>p.usuario_id===h.autor)?.nome||h.autor}</p>)}</details>}
   </>}
  </Modal>}
 </>
}
