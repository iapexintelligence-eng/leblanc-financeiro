import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase.js'
import {todas} from '../lib/jornada.js'

function mostrar(c){
 if(c.v===null||c.v===undefined)return c.formula?'Resultado não disponível':''
 if(typeof c.v==='number'){
  if(c.format?.includes('%'))return `${(c.v*100).toLocaleString('pt-BR',{maximumFractionDigits:4})}%`
  if(/R\$|\$/.test(c.format||''))return c.v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
  return c.v.toLocaleString('pt-BR',{maximumFractionDigits:10})
 }
 return String(c.v)
}
export default function PlanilhasHistoricas(){
 const [lista,setLista]=useState([]),[doc,setDoc]=useState(null),[aba,setAba]=useState(''),[busca,setBusca]=useState(''),[filtro,setFiltro]=useState(''),[erro,setErro]=useState(''),[loading,setLoading]=useState(true),[abrindo,setAbrindo]=useState(false)
 useEffect(()=>{let active=true;todas(()=>supabase.from('planilhas_historicas').select('id,nome,origem_url,importado_em').order('nome').order('id')).then(r=>{if(active)setLista(r)}).catch(e=>{if(active)setErro(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[])
 async function abrir(id){setAbrindo(true);setErro('');setDoc(null);setFiltro('');try{const {data,error}=await supabase.from('planilhas_historicas').select('*').eq('id',id).single();if(error)throw error;setDoc(data);setAba(data.conteudo.abas[0]?.nome||'')}catch(e){setErro(e.message)}finally{setAbrindo(false)}}
 const atual=doc?.conteudo.abas.find(a=>a.nome===aba)
 const linhas=Object.values((atual?.celulas||[]).reduce((r,c)=>{(r[c.r]??={n:c.r,c:[]}).c.push(c);return r},{})).filter(r=>!filtro||r.c.some(c=>`${c.v??''} ${c.nota??''}`.toLocaleLowerCase().includes(filtro.toLocaleLowerCase())))
 const cols=Math.max(1,...(atual?.celulas||[]).map(c=>c.c))
 return <><section className="card"><h3>Planilhas da Leia · histórico para conferência</h3><p>Consulte as informações originais por arquivo e aba. Este histórico ainda não compõe saldos, DRE, pagamentos ou gratificações do sistema.</p><p className="badge warn">Importação parcial · vínculos e competências pendentes de conferência</p><p>Fórmulas preservadas sem recálculo. Campos vazios continuam vazios. O Google continua guardando os arquivos originais; alterações posteriores lá não são sincronizadas automaticamente.</p>{erro&&<p role="alert" className="login-err">{erro}</p>}<label>Buscar planilha<input className="input" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Vendas, montagem, funcionário…"/></label><p>{loading?'Carregando…':`${lista.length} arquivos importados para consulta`}</p><div style={{display:'flex',gap:8,flexWrap:'wrap',maxHeight:240,overflow:'auto'}}>{lista.filter(d=>d.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase())).map(d=><button className="btn ghost" disabled={abrindo} key={d.id} onClick={()=>abrir(d.id)}>{d.nome}</button>)}</div>{!loading&&!lista.length&&<p>Nenhum histórico disponível para este acesso. A consulta é restrita ao financeiro e aos gestores.</p>}</section>
 {abrindo&&<p>Carregando arquivo…</p>}
 {doc&&<section className="card" style={{marginTop:16}}><h3>{doc.nome}</h3><p>{doc.conteudo.abas.length} abas · {doc.conteudo.celulas} células · {doc.conteudo.formulas} fórmulas · importado em {new Date(doc.importado_em).toLocaleString('pt-BR')}</p><a href={doc.origem_url} target="_blank" rel="noopener noreferrer">Abrir original no Google</a>{doc.conteudo.erros.length>0&&<p role="status" className="badge warn">Células com erro na origem: {doc.conteudo.erros.join(', ')}</p>}<div className="tools" style={{marginTop:16}}><label>Aba / período original<select className="input" value={aba} onChange={e=>{setAba(e.target.value);setFiltro('')}}>{doc.conteudo.abas.map(a=><option key={a.nome}>{a.nome}</option>)}</select></label><label>Buscar informação nesta aba<input className="input" value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Cliente, vendedor ou descrição"/></label></div><p className="sub">Aba original: {atual?.estado==='visible'?'visível':'oculta'}. Passe sobre a célula para consultar fórmula ou nota. Linhas vazias não são exibidas.</p><div style={{overflow:'auto',maxHeight:600}}><table><thead><tr><th>Linha original</th>{Array.from({length:cols},(_,i)=><th key={i}>{i+1}</th>)}</tr></thead><tbody>{linhas.map(r=><tr key={r.n}><th>{r.n}</th>{Array.from({length:cols},(_,i)=>{const c=r.c.find(c=>c.c===i+1);return <td style={{whiteSpace:'pre-wrap',minWidth:100}} key={i} title={c?[c.a,c.formula,c.nota].filter(Boolean).join('\n'):''}>{c?mostrar(c):''}{c?.nota&&<details><summary>Nota</summary>{c.nota}</details>}</td>})}</tr>)}</tbody></table></div>{!linhas.length&&<p>Aba vazia ou nenhum resultado para a busca.</p>}</section>}</>
}
