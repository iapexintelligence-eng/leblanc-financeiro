import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabase.js'
import {todas} from '../lib/jornada.js'
import {brl,fmtDate} from '../lib/format.js'

export default function ContratosImportados(){
 const [rows,setRows]=useState([]),[anexos,setAnexos]=useState([]),[erro,setErro]=useState(''),[busy,setBusy]=useState(false),[progresso,setProgresso]=useState(''),[mes,setMes]=useState('2026-09'),[pode,setPode]=useState(false)
 async function carregar(){
  const cs=await todas(()=>supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome,valor_final,vendor,dados_json').order('numero'))
  setRows(cs.filter(c=>c.dados_json?.importacao))
  setAnexos(await todas(()=>supabase.schema('leblanc').from('contrato_anexos').select('*').order('id')))
  const u=await supabase.auth.getUser();if(u.error)throw u.error
  const a=await supabase.from('jornada_acessos').select('papel').eq('usuario_id',u.data.user?.id).maybeSingle();if(a.error)throw a.error
  setPode(['gestor','financeiro'].includes(a.data?.papel))
 }
 useEffect(()=>{carregar().catch(e=>setErro(e.message))},[])
 async function abrir(a){try{const r=await supabase.storage.from(a.bucket).createSignedUrl(a.path,60);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}catch(e){setErro(e.message)}}
 async function enviar(files){setBusy(true);setErro('');let enviados=0,existentes=0,ignorados=0
  try{
   const u=await supabase.auth.getUser();if(u.error||!u.data.user)throw Error('Entre no sistema para anexar os documentos.')
   for(const file of files){
    setProgresso(`Conferindo ${file.name}`)
    if(file.size>50*1024*1024)throw Error(`${file.name}: limite de 50 MB.`)
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('')
    const alvos=rows.flatMap(c=>(c.dados_json.importacao.documentos||[]).filter(d=>d.sha256===hash).map(d=>({c,d})))
    if(!alvos.length){ignorados++;continue}
    if(alvos.length!==1)throw Error(`Vínculo ambíguo para ${file.name}; confira o cadastro.`)
    const {c,d}=alvos[0],path=`${u.data.user.id}/${c.id}/historico/${hash}.pdf`
    const old=await supabase.schema('leblanc').from('contrato_anexos').select('id,path').eq('contrato_id',c.id).like('path',`%/historico/${hash}.pdf`)
    if(old.error)throw old.error;if(old.data.length){existentes++;continue}
    const up=await supabase.storage.from('comercial-documentos').upload(path,file,{upsert:false,contentType:'application/pdf'})
    // Uma interrupção após o upload pode deixar o arquivo sem vínculo; retomar usa o mesmo caminho.
    if(up.error){const probe=await supabase.storage.from('comercial-documentos').createSignedUrl(path,60);if(probe.error)throw up.error}
    const res=await supabase.schema('leblanc').from('contrato_anexos').insert({contrato_id:c.id,bucket:'comercial-documentos',path,tipo:d.tipo==='Aditivo'?'aditivo_historico':'contrato_historico',nome_arquivo:d.arquivo,tamanho:file.size,enviado_por:u.data.user.email})
    if(res.error)throw res.error;enviados++
   }
   setProgresso(`${enviados} anexados · ${existentes} já vinculados · ${ignorados} fora deste lote.`)
  }catch(e){setErro(e.message);setProgresso(`${enviados} anexados nesta tentativa; é possível retomar os restantes.`)}finally{setBusy(false);await carregar().catch(e=>setErro(e.message))}
 }
 const visiveis=rows.filter(c=>!mes||c.dados_json.importacao.competencia===mes)
 return <><section className="card"><h3>Contratos importados</h3><p>Documentos históricos, valores originais e aditivos vinculados. Os pagamentos e as etapas atuais precisam de conferência.</p><p className="sub">A importação não confirma recebimentos, não recalcula preços e não inicia prazos. A data documental de um aditivo não comprova sua assinatura.</p><div className="tools"><label>Mês do lote <input aria-label="Mês do lote" type="month" className="input" value={mes} onChange={e=>setMes(e.target.value)}/></label><Link to="/vendas-historico">Vendas por data original</Link><Link to="/vendas">Voltar para Vendas</Link></div><div className="field"><label>Selecionar PDFs conferidos do lote</label><input aria-label="PDFs do lote histórico" type="file" accept="application/pdf,.pdf" multiple disabled={!pode||busy} onChange={e=>enviar(Array.from(e.target.files||[]))}/></div><p>{progresso}</p>{erro&&<p className="login-err" role="alert">{erro}</p>}</section>
 {visiveis.map(c=><section className="card" style={{marginTop:16}} key={c.id}><h3>{c.cliente_nome} · {c.numero}</h3><p>{c.vendor||'Vendedor a conferir'} · Data original: {fmtDate(c.dados_json.data_contrato)} · Valor original: <b>{brl(c.valor_final)}</b></p><p style={{whiteSpace:'pre-wrap'}}>{c.dados_json.condicao_pagamento}</p><p className="badge warn">Histórico importado · conferência pendente</p><p>{c.dados_json.importacao.observacao}</p>{(c.dados_json.importacao.documentos||[]).map(d=>{const a=anexos.find(x=>x.contrato_id===c.id&&x.path.endsWith(`/historico/${d.sha256}.pdf`));return <div key={d.sha256} style={{padding:'12px 0',borderTop:'1px solid var(--line)'}}><b>{d.tipo} · {d.data}</b><p>{d.arquivo}</p><p className="sub">{d.observacao}</p>{a?<button className="btn ghost" onClick={()=>abrir(a)}>Abrir documento</button>:<span className="badge warn">PDF aguardando envio</span>}</div>})}</section>)}
 {!visiveis.length&&<p className="card">Nenhum contrato importado neste lote.</p>}</>
}
