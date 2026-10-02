import {useEffect,useState} from 'react'
import {authOn,supabase} from '../lib/supabase.js'
import {todas} from '../lib/jornada.js'
import {hojeSP} from '../lib/prazos.js'
import {fmtDate} from '../lib/format.js'
export default function AditivosContrato({contratoId}){
 const [rows,setRows]=useState([]),[eu,setEu]=useState(null),[erro,setErro]=useState(''),[busy,setBusy]=useState(false),[arquivo,setArquivo]=useState(null),[data,setData]=useState(hojeSP()),[descricao,setDescricao]=useState(''),[valor,setValor]=useState(false),[prazo,setPrazo]=useState(false)
 const valido=contratoId&&/^[0-9a-f-]{36}$/i.test(contratoId)
 async function carregar(){setRows(await todas(()=>supabase.from('contrato_aditivos').select('*').eq('contrato_id',contratoId).order('numero',{ascending:false})))}
 useEffect(()=>{setRows([]);setErro('');if(!authOn||!valido)return;carregar().catch(e=>setErro(e.message));supabase.auth.getUser().then(async u=>{if(u.data.user){const r=await supabase.from('jornada_acessos').select('papel').eq('usuario_id',u.data.user.id).maybeSingle();if(r.error)setErro(r.error.message);else setEu(r.data)}})},[contratoId])
 const pode=authOn&&valido&&['gestor','financeiro','vendedor'].includes(eu?.papel)
 async function abrir(r){try{const x=await supabase.storage.from('comercial-documentos').createSignedUrl(r.arquivo,60);if(x.error)throw x.error;window.open(x.data.signedUrl,'_blank','noopener,noreferrer')}catch(e){setErro(e.message)}}
 async function anexar(){setBusy(true);setErro('');try{
  if(!arquivo||arquivo.size>50*1024*1024)throw Error('Selecione o documento assinado, com até 50 MB.')
  const u=await supabase.auth.getUser();if(!u.data.user)throw Error('Entre no sistema para anexar.')
  const path=`${u.data.user.id}/${contratoId}/aditivos/${crypto.randomUUID()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
  const up=await supabase.storage.from('comercial-documentos').upload(path,arquivo,{upsert:false});if(up.error)throw up.error
  const r=await supabase.rpc('aditivo_anexar',{p_contrato:contratoId,p_data:data,p_descricao:descricao,p_valor:valor,p_prazo:prazo,p_arquivo:path,p_nome:arquivo.name});if(r.error)throw r.error
  setArquivo(null);setDescricao('');setValor(false);setPrazo(false);await carregar()
 }catch(e){setErro(e.message)}finally{setBusy(false)}}
 return <section className="card" style={{margin:'16px 0'}}><h3>Aditivos do contrato</h3><p>Guarde cada aditivo assinado junto ao contrato original, com data, motivo e responsável pelo registro.</p>
 <p className="sub">Anexar o aditivo não muda automaticamente os valores, parcelas ou prazos. Alterações financeiras e operacionais precisam de conferência específica.</p>
 {!valido&&<p className="sub">Selecione um contrato salvo para consultar e anexar os aditivos.</p>}
 {erro&&<div className="login-err" role="alert">{erro}</div>}
 {rows.map(r=><article key={r.id} style={{padding:'14px 0',borderBottom:'1px solid var(--line)'}}><b>Aditivo {r.numero} · assinado em {fmtDate(r.data_assinatura)}</b><p style={{whiteSpace:'pre-wrap'}}>{r.descricao}</p>{(r.altera_valor||r.altera_prazo)&&<p className="badge warn">Conferir {r.altera_valor?'valores':''}{r.altera_valor&&r.altera_prazo?' e ':''}{r.altera_prazo?'prazos':''} antes de atualizar o atendimento</p>}<p className="sub">Registrado em {new Date(r.criado_em).toLocaleString('pt-BR')} · responsável identificado no histórico</p><button className="btn ghost" onClick={()=>abrir(r)}>Abrir {r.nome_arquivo}</button></article>)}
 {valido&&!rows.length&&!erro&&<p>Nenhum aditivo anexado a este contrato.</p>}
 <fieldset disabled={!pode||busy} style={{border:0,padding:0,marginTop:14}}><div className="field"><label>Data da assinatura do aditivo</label><input aria-label="Data da assinatura do aditivo" className="input" type="date" max={hojeSP()} value={data} onChange={e=>setData(e.target.value)}/></div><div className="field"><label>Motivo e resumo do aditivo</label><textarea aria-label="Motivo e resumo do aditivo" className="input" value={descricao} onChange={e=>setDescricao(e.target.value)}/></div><div className="tools"><label><input type="checkbox" checked={valor} onChange={e=>setValor(e.target.checked)}/> Altera valores ou pagamento</label><label><input type="checkbox" checked={prazo} onChange={e=>setPrazo(e.target.checked)}/> Altera prazos</label></div><div className="field" style={{marginTop:12}}><label>Documento assinado · até 50 MB</label><input aria-label="Documento assinado do aditivo" key={rows.length} type="file" onChange={e=>setArquivo(e.target.files?.[0]||null)}/></div><button className="btn" disabled={!pode||busy||!arquivo||!data||!descricao.trim()} onClick={anexar}>{busy?'Anexando…':'Anexar aditivo ao contrato'}</button></fieldset></section>
}
