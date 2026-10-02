import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, authOn } from '../lib/supabase.js'
import { todas } from '../lib/jornada.js'
import { alertaPrazo, hojeSP } from '../lib/prazos.js'

export default function AlertasJornada() {
 const [avisos,setAvisos]=useState([])
 const [erro,setErro]=useState(false)
 useEffect(()=>{
  if(!authOn)return
  let ativo=true
  const carregar=async()=>{
   try {
    const [rows,c]=await Promise.all([todas(()=>supabase.from('jornada_registros').select('*').order('id')),supabase.from('jornada_config').select('feriados').single()])
    if(c.error)throw c.error
    const a=[]
    for(const r of rows){
     const d=r.dados
     if(r.tipo==='assistencia'&&d.status!=='Resolvida'){
      const p=alertaPrazo(d.vencimento,{feriados:c.data.feriados})
      if(p&&p.marco!=='normal')a.push({id:r.id,cliente:d.cliente_nome,texto:p.texto,nivel:p.nivel,rota:'/assistencias-operacionais'})
     }
     if(r.tipo==='pedido'){
      const hoje=hojeSP()
      if(d.cliente_recebe_em&&!d.saldo_confirmado)a.push({id:r.id+'saldo',cliente:d.cliente_nome,texto:'Cliente confirmou recebimento: Leia deve conferir o saldo',nivel:'warn',rota:'/jornada'})
      for(const [key,feito,nome] of [['planta_prazo','planta_enviada_em','Enviar planta'],['medicao_prazo','medicao_em','Medição'],['correcao_prazo','correcao_em','Conferência'],['entrega_prazo','entrega_em','Entrega']]){
       if(d[key]&&!d[feito]){const p=alertaPrazo(d[key],{feriados:c.data.feriados});if(p&&(d[key]<=hoje||p.dias<=3))a.push({id:r.id+key,cliente:d.cliente_nome,texto:`${nome}: ${p.texto}`,nivel:p.nivel,rota:'/jornada'})}
      }
     }
    }
    if(ativo){setAvisos(a);setErro(false)}
   }catch{if(ativo)setErro(true)}
  }
  carregar();const timer=setInterval(carregar,60000)
  return()=>{ativo=false;clearInterval(timer)}
 },[])
 if(erro)return <section role="alert" className="card">Não foi possível atualizar os alertas da jornada. Verifique a conexão e o acesso ao sistema; os prazos continuam correndo.</section>
 if(!avisos.length)return null
 return <section aria-label="Pendências de prazo" className="card" style={{marginBottom:16,borderColor:'var(--danger)'}}>
  <strong>{avisos.length} pendência(s) na jornada</strong>
  {avisos.slice(0,5).map(a=><p key={a.id}><Link to={a.rota}>{a.cliente||'Cliente'} — <span className={'badge '+a.nivel}>{a.texto}</span></Link></p>)}
  {avisos.length>5&&<Link to="/jornada">Ver todas as pendências</Link>}
 </section>
}
