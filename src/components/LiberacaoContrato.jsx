import {useState} from 'react'
import {supabase} from '../lib/supabase.js'
import {anexarJornada,abrirDocumento} from '../lib/jornada.js'
import {hojeSP} from '../lib/prazos.js'
import {fmtDate} from '../lib/format.js'
export default function LiberacaoContrato({solicitacao,aprovacoes,pode,aprovadora,onConcluido}) {
 const [quem,setQuem]=useState(aprovadora||''),[data,setData]=useState(hojeSP()),[canal,setCanal]=useState('WhatsApp'),[observacao,setObs]=useState(''),[arquivo,setArquivo]=useState(null),[busy,setBusy]=useState(false),[erro,setErro]=useState('')
 async function registrar(){setBusy(true);setErro('');try{
  if(!quem||!data||data>hojeSP())throw Error('Informe quem autorizou e a data válida da autorização.')
  if(canal!=='Sistema'&&!arquivo)throw Error('Anexe o print ou documento da autorização.')
  const path=canal==='Sistema'?null:await anexarJornada(arquivo)
  const r=await supabase.rpc('comercial_registrar_liberacao',{p_id:solicitacao.id,p_liberado_por:quem,p_data:data,p_canal:canal,p_comprovante:path,p_observacao:observacao})
  if(r.error)throw r.error
  await onConcluido()
 }catch(e){setErro(e.message)}finally{setBusy(false)}}
 return <section aria-label="Liberação da diretoria" style={{marginTop:20}}><h3>Liberação da diretoria</h3>
 {aprovacoes.filter(a=>a.aprovado_em).map(a=><div key={a.id} style={{padding:12,background:'#edf5ee',marginBottom:10}}><b>Liberado por: {a.aprovadora}</b><p>Data da autorização: {a.data_autorizacao?fmtDate(a.data_autorizacao):'Não informada no registro antigo'} · Via: {a.canal_autorizacao||'Sistema (registro anterior)'}</p><p>Registrado por: {a.registrado_por_nome||'Usuário identificado no histórico'} · Em: {new Date(a.aprovado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p><p>Condições autorizadas nesta versão: {a.resumo}</p>{a.observacao_autorizacao&&<p>{a.observacao_autorizacao}</p>}{a.comprovante_autorizacao&&<button className="btn ghost sm" onClick={()=>abrirDocumento(a.comprovante_autorizacao).catch(e=>setErro(e.message))}>Ver comprovante da autorização</button>}</div>)}
 {solicitacao&&pode?<fieldset disabled={busy} style={{border:0,padding:0}}><p>Registre a autorização recebida para as condições desta versão. Alterações posteriores exigem nova conferência.</p><div className="row-3"><div className="field"><label htmlFor="liberado-por">Liberado por quem</label><select id="liberado-por" className="input" value={quem} onChange={e=>setQuem(e.target.value)}><option value="">Selecione</option>{['Priscila','Andressa','Catelli'].map(n=><option key={n}>{n}</option>)}</select></div><div className="field"><label htmlFor="liberacao-data">Data da autorização</label><input id="liberacao-data" className="input" type="date" max={hojeSP()} value={data} onChange={e=>setData(e.target.value)}/></div><div className="field"><label htmlFor="liberacao-canal">Autorização recebida via</label><select id="liberacao-canal" className="input" value={canal} onChange={e=>{setCanal(e.target.value);if(e.target.value==='Sistema')setQuem(aprovadora||'')}}>{['WhatsApp','E-mail','Presencial',...(aprovadora?['Sistema']:[])].map(n=><option key={n}>{n}</option>)}</select></div></div><div className="field"><label htmlFor="liberacao-obs">Observações da autorização</label><textarea id="liberacao-obs" className="input" value={observacao} onChange={e=>setObs(e.target.value)}/></div>{canal!=='Sistema'&&<div className="field"><label htmlFor="liberacao-prova">Comprovante da autorização (print ou documento)</label><input id="liberacao-prova" type="file" accept="image/*,.pdf" onChange={e=>setArquivo(e.target.files?.[0]||null)}/></div>}<button className="btn" onClick={registrar} disabled={busy||!quem||!data||(canal!=='Sistema'&&!arquivo)}>{busy?'Registrando…':'Registrar autorização e liberar contrato'}</button></fieldset>:solicitacao?<p>O registro deve ser feito por um acesso autorizado da diretoria.</p>:null}
 {erro&&<p role="alert" className="login-err">{erro}</p>}
 </section>
}
