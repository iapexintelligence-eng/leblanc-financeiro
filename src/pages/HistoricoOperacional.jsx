import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase,authOn} from '../lib/supabase.js'
import {todas} from '../lib/jornada.js'
import {fmtDate} from '../lib/format.js'
export default function HistoricoOperacional(){
 const [fluxos,setFluxos]=useState([]),[assistencias,setAssistencias]=useState([]),[clientes,setClientes]=useState({}),[erro,setErro]=useState('')
 useEffect(()=>{if(!authOn)return;Promise.all([
 todas(()=>supabase.schema('leblanc').from('projeto_fluxo').select('*').order('contrato_id')),
 todas(()=>supabase.from('assistencias').select('*').order('id')),
 todas(()=>supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome').order('id'))
 ]).then(([f,a,c])=>{setFluxos(f);setAssistencias(a);setClientes(Object.fromEntries(c.map(x=>[x.id,x])))}).catch(e=>setErro(e.message))},[])
 return <><div className="card"><h3>Histórico operacional anterior</h3><p>Consulta dos registros anteriores. Revise os marcos reais ao iniciar sua jornada atual; datas antigas não são assumidas como aprovação do cliente.</p><Link to="/jornada">Abrir jornada atual</Link></div>{erro&&<p className="login-err">{erro}</p>}<div className="table-wrap" style={{marginTop:16}}><table><thead><tr><th>Cliente</th><th>Etapa anterior</th><th>Prazo anterior</th><th>Montador</th></tr></thead><tbody>{fluxos.map(f=><tr key={f.contrato_id}><td>{clientes[f.contrato_id]?.cliente_nome||f.contrato_id}</td><td>{f.etapa}</td><td>{fmtDate(f.entrega_prazo||f.correcao_prazo)}</td><td>{f.equipe_montagem||'—'}</td></tr>)}</tbody></table></div><h3>Assistências anteriores</h3><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Descrição</th><th>Data registrada</th><th>Situação</th></tr></thead><tbody>{assistencias.map(a=><tr key={a.id}><td>{a.cliente_nome}</td><td>{a.descricao}</td><td>{fmtDate(a.data_assistencia)}</td><td>{a.status}</td></tr>)}</tbody></table></div></>
}
