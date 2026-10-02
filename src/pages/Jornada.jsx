import AditivosContrato from '../components/AditivosContrato.jsx'
import RegistroComplementos from '../components/RegistroComplementos.jsx'
import { situacoesSeparadas, checklistPassagem } from '../lib/operacao.js'
import { SETORES, noSetor } from '../lib/setores.js'
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
 ['Fechamento e checklist'],['venda_data','Fechamento do contrato','date'],['tipo_venda','Tipo de venda',['Normal','Futura']],['imovel_pronto_em','Cliente avisou que o imóvel está pronto','date'],
 ['grupo_criado','Grupo criado: cliente, gestores e setores','check'],['grupo_arquivo','Comprovação do grupo','file'],['imagens_enviadas','Imagens enviadas ao cliente','check'],['imagens_arquivo','Imagens e evidência do envio','file'],
 ['planta_enviada_em','Planta enviada por e-mail ao corretor','date'],['planta_arquivo','Planta baixa do Promob','file'],['informacoes_correcao','Informações para correção','textarea'],
 ['Financeiro de entrada'],['entrada_confirmada_arquivo','Comprovante da entrada','file'],['entrada_confirmada','Leia: entrada conferida','check'],
 ['Medição · 5 dias corridos'],['liberacao_em','Liberação para medição','date'],['medicao_agendada','Agendamento com Rodrigo','date'],['medicao_em','Medição realizada','date'],['medicao_arquivo','Medidas técnicas','file'],
 ['Conferência · 12 dias úteis desde a medição'],['conferente','Conferente'],['correcao_em','Conferência e guias concluídas','date'],['aprovacao_em','Projeto aprovado pelo cliente','date'],['guias_arquivo','Guias técnicas assinadas','file'],
 ['Implantação pelo conferente'],['pedido_fabrica','Número do pedido na fábrica'],['implantacao_em','Implantação realizada','date'],['pedido_arquivo','Pedido e cobrança da fábrica','file'],['fabrica_paga_arquivo','Comprovante de pagamento da fábrica','file'],['fabrica_paga','Leia: pagamento da fábrica conferido','check'],
 ['Logística · Glauci'],['carregamento_em','Aviso de previsão de carregamento','date'],['cliente_recebe_em','Cliente confirmou que pode receber','date'],['aceite_arquivo','Confirmação do cliente','file'],['impedimento','Impedimento / previsão informada pelo cliente','textarea'],['entrega_prevista','Entrega prevista','date'],
 ['Saldo final · 2 dias corridos antes da entrega'],['cobranca_em','Leia contatou o cliente para o saldo','date'],['saldo_confirmado_arquivo','Comprovante do saldo / liquidação pela operadora','file'],['saldo_confirmado','Leia: quitação conferida, liberar escala','check'],
 ['Entrega, montagem e fotos'],['entrega_em','Entrega realizada','date'],['montagem_concluida_em','Montagem concluída','date'],['termo_montagem_arquivo','Termo de montagem assinado, com eventuais ressalvas','file'],['fotos_em','Agendamento das fotos','date'],
 ],
 assistencia:[['identificada','Problema identificado em','date'],['descricao','Descrição do problema','textarea'],['foto_arquivo','Fotos da ocorrência','file'],['montagem_id','Montagem de origem','montagem'],['montador_original','Montador da montagem original'],['causa','Causa apurada',['A apurar','Montagem','Fabricação','Transporte','Outra']],['responsavel','Responsável pela assistência'],['status','Situação',['Identificada','Em análise','Peças solicitadas','Aguardando peças','Atendimento agendado','Executada','Resolvida']],['pecas','Peças necessárias','textarea'],['proxima_acao','Próxima ação'],['prevista','Previsão da próxima ação','date'],['realizada','Visita realizada','date'],['confirmacao','Confirmação de que o problema foi resolvido','textarea'],['evidencia_arquivo','Evidência de resolução / termo quando disponível','file']],
 agenda:[['montador_id','Montador','montador'],['inicio','Início','date'],['fim','Fim','date'],['dias_estimados','Esforço estimado em dias de montagem','number'],['ambientes','Ambientes / trabalho previsto','textarea'],['confirmada','Confirmar e liberar escala ao montador','check'],['observacoes','Orientações para o montador','textarea']],
 frete:[['prestador','Prestador'],['origem','Retirar em'],['destino','Entregar em'],['motivo','Finalidade / peças transportadas','textarea'],['assistencia_id','Assistência vinculada','assistencia'],['prevista','Viagem prevista','date'],['realizada','Viagem realizada','date'],['valor','Valor combinado por viagem','number'],['orcamento_arquivo','Orçamento / valor combinado','file'],['status','Situação',['Solicitado','Em execução','Aguardando conferência','Liberado para pagamento','Pago']],['evidencia_arquivo','Comprovante de retirada e entrega','file'],['excecao_motivo','Justificativa para autorização da rota/valor','textarea'],['excecao_valor','Valor submetido à autorização','number'],['pagamento_arquivo','Leia: comprovante do pagamento','file']]
}
const inicial=(tipo)=>tipo==='pedido'?{tipo_venda:'Normal'}:tipo==='assistencia'?{identificada:hojeSP(),status:'Identificada',responsavel:'Glauci',causa:'A apurar'}:tipo==='frete'?{status:'Solicitado'}:{}
function prazo(r) {
 const d=r.dados
 if(r.tipo==='assistencia') return d.status==='Resolvida'?null:d.vencimento
 if(r.tipo!=='pedido') return null
 if(d.entrega_em) return null
 if(d.aprovacao_em) return d.entrega_prazo
 if(d.medicao_em && !d.correcao_em) return d.correcao_prazo
 if(d.liberacao_em && !d.medicao_em) return d.medicao_prazo
 return !d.planta_enviada_em?d.planta_prazo:null
}
function situacao(r) {
 const d=r.dados
 if(r.tipo==='agenda') return d.confirmada?'Escala liberada':'Reserva interna'
 if(r.tipo!=='pedido') return d.status
 if(d.fotos_em) return 'Fotos agendadas'
 if(d.montagem_concluida_em) return 'Montagem concluída'
 if(d.entrega_em) return 'Entregue'
 if(d.cliente_recebe_em && !d.saldo_confirmado) return 'Leia: cobrar / conferir saldo'
 if(d.carregamento_em && !d.cliente_recebe_em) return 'Glauci: confirmar recebimento'
 if(d.fabrica_paga) return 'Em produção / transporte'
 if(d.implantacao_em) return 'Leia: pagar fábrica'
 if(d.aprovacao_em) return 'Conferente: implantar'
 if(d.correcao_em) return 'Aguardando aprovação do cliente'
 if(d.medicao_em) return 'Conferência e guias'
 if(d.liberacao_em) return 'Aguardando medição'
 if(d.tipo_venda==='Futura'&&!d.imovel_pronto_em) return 'Venda futura: aguardando cliente'
 return 'Checklist e entrada'
}
export default function Jornada({ tipoInicial='pedido', setor=null }) {
 const [params]=useSearchParams()
 const [abaFicha,setAbaFicha]=useState('Resumo')
 const [vendaFiltro,setVendaFiltro]=useState('Normal')
 const setorInfo=SETORES[setor]
 const [demo]=useState(()=>authOn?null:jornadaDemo())
 const [mes,setMes]=useState(hojeSP().slice(0,7)),[montadorFiltro,setMontadorFiltro]=useState('')
 const [tipo,setTipo]=useState(tipoInicial),[dados,setDados]=useState(demo?.dados||null),[contratos,setContratos]=useState(demo?.contratos||[]),[erro,setErro]=useState(''),[busca,setBusca]=useState(''),[modal,setModal]=useState(null),[saving,setSaving]=useState(false),[upload,setUpload]=useState(false),[historico,setHistorico]=useState([]),[agora,setAgora]=useState(hojeSP())
 async function carregar() {
  try {
   const j=await carregarJornada(); setDados(j)
   if(j.eu?.papel!=='montador') setContratos(await todas(()=>supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome,cliente_endereco,cliente_telefone,projeto_ambientes,vendor').order('id')))
   const res=await supabase.rpc('jornada_gerar_alertas'); if(res.error) throw res.error
   setErro('')
  } catch(e) {setErro(`Não foi possível carregar a jornada: ${e.message}. Se esta é a primeira ativação, confira a migração e seu acesso.`)}
 }
 useEffect(()=>{if(authOn) carregar()},[])
 useEffect(()=>{const id=setInterval(()=>{setAgora(hojeSP()); if(authOn) carregar()},60000);return()=>clearInterval(id)},[])
 useEffect(()=>setTipo(tipoInicial),[tipoInicial,setor])
 const mapa=Object.fromEntries(contratos.map(c=>[String(c.id),c]))
 const registros=dados?.registros||[],feriados=dados?.config.feriados||[]
 const lista=registros.filter(r=>r.tipo===tipo&&noSetor(r,setor)&&(setor!=='vendas'||(r.dados.tipo_venda||'Normal')===vendaFiltro)&&(!busca||`${mapa[r.contrato_id]?.cliente_nome||r.dados.cliente_nome||''} ${r.dados.montador_original||''} ${r.dados.prestador||''}`.toLowerCase().includes(busca.toLowerCase()))).sort((a,b)=>(prazo(a)||'9999').localeCompare(prazo(b)||'9999'))
 const abertos=registros.filter(r=>r.tipo==='assistencia'&&r.dados.status!=='Resolvida')
 const atrasadas=abertos.filter(r=>prazo(r)&&prazo(r)<agora)
 const demanda={}
 registros.filter(r=>r.tipo==='pedido'&&r.dados.entrega_prazo&&!r.dados.montagem_concluida_em).forEach(r=>{const mes=(r.dados.entrega_prevista||r.dados.entrega_prazo).slice(0,7);demanda[mes]=(demanda[mes]||0)+1})
 const edita=authOn&&dados?.eu&&dados.eu.papel!=='montador'
 const set=(k,v)=>setModal(m=>({...m,dados:{...m.dados,[k]:v}}))
 async function abrir(r) {
  setModal(structuredClone(r));setHistorico([]);setAbaFicha('Resumo')
  if(authOn&&r.id){const x=await supabase.from('jornada_eventos').select('data,autor,versao').eq('registro_id',r.id).order('versao',{ascending:false});if(x.error)setErro(x.error.message);else setHistorico(x.data)}
 }
 useEffect(()=>{const id=params.get('registro');if(id&&dados){const r=dados.registros.find(r=>r.id===id);if(r)abrir(r)}},[params.get('registro'),!!dados])
 async function salvar() {
  setSaving(true);setErro('')
  try {await salvarRegistro({...modal,dados:{...modal.dados,cliente_nome:mapa[modal.contrato_id]?.cliente_nome||modal.dados.cliente_nome}});setModal(null);await carregar()}catch(e){setErro(e.message)}finally{setSaving(false)}
 }
 async function anexo(k,file) {if(!file)return;setUpload(true);try{set(k,await anexarJornada(file))}catch(e){setErro(e.message)}finally{setUpload(false)}}
 const aviso=(r)=>alertaPrazo(prazo(r),{hoje:agora,feriados})
 const diasMes = new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0).getDate()
 const contrato=modal?mapa[modal.contrato_id]:null
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
  {tipo==='assistencia'&&<div className="card" style={{marginBottom:16}}><h3>Assistências por mês e montagem</h3>{[...new Set(abertos.map(r=>r.dados.vencimento?.slice(0,7)).filter(Boolean))].sort().map(m=><p key={m}>{m}: {abertos.filter(r=>r.dados.vencimento?.startsWith(m)).length} assistência(s) em aberto com vencimento no mês</p>)}{[...new Set(registros.filter(r=>r.tipo==='assistencia').map(r=>r.dados.montador_original).filter(Boolean))].map(nome=><p key={nome}>{nome}: {registros.filter(r=>r.tipo==='assistencia'&&r.dados.montador_original===nome).length} ocorrência(s) em montagens de origem · causa apurada em cada registro</p>)}</div>}
  {tipo==='agenda'&&<div className="card" style={{marginBottom:16}}><div className="tools"><label>Mês <input type="month" className="input" value={mes} onChange={e=>setMes(e.target.value||hojeSP().slice(0,7))}/></label><select aria-label="Filtrar montador" className="input" value={montadorFiltro} onChange={e=>setMontadorFiltro(e.target.value)}><option value="">Todos os montadores</option>{dados?.pessoas.filter(p=>p.papel==='montador').map(p=><option key={p.usuario_id} value={p.usuario_id}>{p.nome}</option>)}</select></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8,marginTop:12}}>{Array.from({length:diasMes},(_,i)=>{const dia=`${mes}-${String(i+1).padStart(2,'0')}`;const reservas=registros.filter(r=>r.tipo==='agenda'&&r.dados.inicio<=dia&&r.dados.fim>=dia&&(!montadorFiltro||r.dados.montador_id===montadorFiltro));return <div key={dia} style={{border:'1px solid var(--line)',padding:8,minHeight:74}}><b>{fmtDate(dia)}</b>{reservas.map(r=><button className="btn ghost sm" style={{display:'block',whiteSpace:'normal',marginTop:6}} key={r.id} onClick={()=>abrir(r)}>{dados?.pessoas.find(p=>p.usuario_id===r.dados.montador_id)?.nome||'Montador'} · {mapa[r.contrato_id]?.cliente_nome||r.dados.cliente_nome}<br/>{r.dados.confirmada?'Escala liberada':'Reserva interna'}</button>)}</div>})}</div></div>}
  <div className="section-head"><input aria-label="Buscar atendimento" className="input" placeholder="Buscar cliente, montador ou prestador" value={busca} onChange={e=>setBusca(e.target.value)}/>{edita&&<button className="btn" onClick={()=>abrir({tipo,contrato_id:'',dados:{...inicial(tipo),...(setor==='vendas'?{tipo_venda:vendaFiltro}:{})}})}>Novo registro</button>}</div>
  <div className="table-wrap"><table><thead><tr><th>Cliente / contrato</th><th>Situação</th><th>Prazo / período</th><th>Responsável / valor</th><th></th></tr></thead><tbody>
   {lista.length===0&&<tr><td colSpan="5" className="empty">Nenhum registro nesta visão.</td></tr>}
   {lista.map(r=>{const a=aviso(r);return <tr key={r.id} style={{background:a?.nivel==='danger'?'var(--danger-bg)':undefined}}><td>{mapa[r.contrato_id]?.cliente_nome||r.dados.cliente_nome||r.contrato_id}<div className="sub">{mapa[r.contrato_id]?.numero}</div></td><td>{situacao(r)}</td><td>{tipo==='agenda'?`${fmtDate(r.dados.inicio)} a ${fmtDate(r.dados.fim)}`:<>{fmtDate(prazo(r))}{a&&<div><span className={'badge '+a.nivel}>{a.texto}</span></div>}</>}</td><td>{tipo==='frete'?`${r.dados.prestador} · ${brl(r.dados.valor)}`:r.dados.responsavel||dados?.pessoas.find(p=>p.usuario_id===r.dados.montador_id)?.nome||r.dados.conferente||'—'}</td><td><button className="btn ghost" onClick={()=>abrir(r)}>{edita?'Abrir':'Ver detalhes'}</button></td></tr>})}
  </tbody></table></div>
  {modal&&<Modal wide title={TIPOS[modal.tipo]} onClose={()=>!saving&&!upload&&setModal(null)} footer={<><button className="btn ghost" onClick={()=>setModal(null)} disabled={saving||upload}>Fechar</button>{edita&&abaFicha==='Resumo'&&<button className="btn" onClick={salvar} disabled={saving||upload||!modal.contrato_id}>{saving?'Salvando…':'Salvar registro'}</button>}</>}>
   {erro&&<div className="login-err" role="alert">{erro}</div>}
   <div className="field"><label>Contrato</label><select className="input" value={modal.contrato_id} disabled={!!modal.id||!edita} onChange={e=>setModal(m=>({...m,contrato_id:e.target.value}))}><option value="">Selecione</option>{contratos.map(c=><option key={c.id} value={String(c.id)}>{c.numero} · {c.cliente_nome}</option>)}</select></div>
   {modal.tipo==='pedido'&&<div className="grid cols-3" style={{margin:'16px 0'}}>{Object.entries(situacoesSeparadas(modal.dados)).map(([k,v])=><div className="card" key={k}><small>{k==='comercial'?'Comercial':k==='operacional'?'Operacional':'Financeiro'}</small><p>{v}</p></div>)}</div>}
   <div className="tools" style={{margin:'12px 0'}}>{['Resumo','Arquivos, tarefas e histórico','Aditivos'].map(a=><button className={'btn '+(abaFicha===a?'':'ghost')} key={a} onClick={()=>setAbaFicha(a)}>{a}</button>)}</div>
   {abaFicha==='Aditivos'?<AditivosContrato key={modal.contrato_id} contratoId={modal.contrato_id}/>:abaFicha!=='Resumo'?<RegistroComplementos key={modal.id||'novo'} registro={modal} registros={registros} pessoas={dados?.pessoas} eu={dados?.eu} setor={setor||'vendas'}/>:<>
   {modal.tipo==='pedido'&&<details><summary>Conferência para passagem de setor</summary>{checklistPassagem(modal.dados).map(([t,ok,descr])=><p key={t}><b>{ok?'✓':'Pendente'} · {t}</b><br/>{descr}</p>)}<p className="sub">Tarefas bloqueantes adicionais são verificadas ao salvar. Para devolver uma pendência, abra a aba de tarefas e registre motivo, responsável, prazo e etapa dependente.</p></details>}
   {CAMPOS[modal.tipo].map(([k,label,t])=>!label?<h3 key={k} style={{margin:'22px 0 12px'}}>{k}</h3>:<div className="field" key={k}><label>{label}</label>{t==='check'?<input type="checkbox" checked={!!modal.dados[k]} disabled={!edita} onChange={e=>set(k,e.target.checked)}/>:t==='file'?<><input aria-label={label} type="file" disabled={!edita||upload} onChange={e=>anexo(k,e.target.files?.[0])}/>{modal.dados[k]&&<button className="btn ghost sm" onClick={()=>abrirDocumento(modal.dados[k]).catch(e=>setErro(e.message))}>Abrir anexo</button>}</>:Array.isArray(t)?<select className="input" value={modal.dados[k]||''} disabled={!edita} onChange={e=>set(k,e.target.value)}><option value="">Selecione</option>{t.map(v=><option key={v}>{v}</option>)}</select>:t==='montador'?<select className="input" value={modal.dados[k]||''} disabled={!edita} onChange={e=>set(k,e.target.value)}><option value="">Selecione</option>{dados?.pessoas.filter(p=>p.papel==='montador').map(p=><option key={p.usuario_id} value={p.usuario_id}>{p.nome}</option>)}</select>:t==='montagem'?<select className="input" value={modal.dados[k]||''} disabled={!edita} onChange={e=>{const a=registros.find(r=>r.id===e.target.value);set(k,e.target.value);set('montador_original',dados?.pessoas.find(p=>p.usuario_id===a?.dados.montador_id)?.nome||'')}}><option value="">Sem agenda vinculada (histórico)</option>{registros.filter(r=>r.tipo==='agenda'&&r.contrato_id===modal.contrato_id).map(r=><option key={r.id} value={r.id}>{dados?.pessoas.find(p=>p.usuario_id===r.dados.montador_id)?.nome} · {fmtDate(r.dados.inicio)}</option>)}</select>:t==='assistencia'?<select className="input" value={modal.dados[k]||''} disabled={!edita} onChange={e=>set(k,e.target.value)}><option value="">Sem assistência vinculada</option>{registros.filter(r=>r.tipo==='assistencia'&&r.contrato_id===modal.contrato_id).map(r=><option key={r.id} value={r.id}>{r.dados.descricao}</option>)}</select>:t==='textarea'?<textarea className="input" disabled={!edita} value={modal.dados[k]||''} onChange={e=>set(k,e.target.value)}/>:<input className="input" disabled={!edita} type={t||'text'} min={t==='number'?0:undefined} step={t==='number'?'0.01':undefined} value={modal.dados[k]||''} onChange={e=>set(k,e.target.value)}/>}</div>)}
   {modal.tipo==='pedido'&&<div className="card"><h3>Solicitação de medição</h3><pre style={{whiteSpace:'pre-wrap'}}>{mail}</pre>{mailPronto?<a className="btn ghost" href={`mailto:medidas@cadnetsul.com.br?subject=${encodeURIComponent('Medição — '+contrato.cliente_nome)}&body=${encodeURIComponent(mail)}`}>Preparar e-mail para Rodrigo</a>:<p>Complete nome, endereço, telefone, ambientes e anexe a planta.</p>}<p className="sub">Abre um rascunho no seu e-mail. Anexe a planta; o envio e a confirmação continuam sob responsabilidade do vendedor.</p><Link to="/contratos">Abrir contratos e documentos</Link></div>}
   {modal.tipo==='frete'&&<><p className="sub">Até cadastrar a tabela por rota/local, solicite autorização do valor combinado. Alterar rota ou valor invalida a autorização.</p>{dados?.eu?.aprovadora&&<label><input type="checkbox" checked={!!modal.dados.autorizar} onChange={e=>set('autorizar',e.target.checked)}/> Autorizar como {dados.eu.aprovadora}</label>}<p>Autorização: {modal.dados.autorizado_por||'Pendente'}</p></>}
   {historico.length>0&&<details><summary>Histórico de versões</summary>{historico.map(h=><p key={h.versao}>Versão {h.versao} · {fmtDate(h.data)} · {dados?.pessoas.find(p=>p.usuario_id===h.autor)?.nome||h.autor}</p>)}</details>}
   </>}
  </Modal>}
 </>
}
