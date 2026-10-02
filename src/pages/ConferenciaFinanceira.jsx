import AditivosContrato from '../components/AditivosContrato.jsx'
import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase,authOn} from '../lib/supabase.js'
import {todas,abrirDocumento} from '../lib/jornada.js'
import {brl,fmtDate} from '../lib/format.js'
import {calcularGratificacao} from '../lib/regras.js'

export default function ConferenciaFinanceira(){
 const [contratos,setContratos]=useState([]),[recebiveis,setRecebiveis]=useState([]),[aprovacoes,setAprovacoes]=useState([]),[conferencias,setConferencias]=useState([]),[sel,setSel]=useState(''),[deducoes,setDeducoes]=useState([{descricao:'Cartão / financeira',valor:''},{descricao:'Marketing apurado na venda',valor:''}]),[erro,setErro]=useState(''),[busy,setBusy]=useState(false),[eu,setEu]=useState(null)
 async function carregar(){try{
  const u=await supabase.auth.getUser()
  const a=await supabase.from('jornada_acessos').select('*').eq('usuario_id',u.data.user?.id).maybeSingle();setEu(a.data)
  const [c,r,p,g]=await Promise.all([
   todas(()=>supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome,vendor,valor_final,status,dados_json').order('id')),
   todas(()=>supabase.from('comercial_extrato').select('*').order('id')),
   todas(()=>supabase.from('comercial_aprovacoes').select('*').order('id')),
   todas(()=>supabase.from('gratificacao_conferencias').select('*').order('contrato_id'))
  ]);setContratos(c);setRecebiveis(r);setAprovacoes(p);setConferencias(g)
 }catch(e){setErro(e.message)}}
 useEffect(()=>{if(authOn)carregar()},[])
 const contrato=contratos.find(c=>String(c.id)===sel),d=contrato?.dados_json||{}
 const completas=deducoes.every(x=>x.valor!==''&&x.descricao.trim())
 let previa=null
 try{previa=contrato&&completas?calcularGratificacao(contrato.valor_final,deducoes):null}catch{/* o servidor também valida */}
 async function conferir(){setBusy(true);setErro('');try{const r=await supabase.rpc('gratificacao_conferir',{p_contrato:sel,p_deducoes:deducoes});if(r.error)throw r.error;await carregar()}catch(e){setErro(e.message)}finally{setBusy(false)}}
 async function aprovar(id){setBusy(true);setErro('');try{const r=await supabase.rpc('comercial_aprovar',{p_id:id});if(r.error)throw r.error;await carregar()}catch(e){setErro(e.message)}finally{setBusy(false)}}
 return <>
  <div className="card"><h3>Conferência da Leia e autorizações</h3><p>Composição interna, documentos originais, recebíveis e gratificação por venda.</p><Link to="/jornada">Registrar comprovantes e liberar pagamentos na jornada</Link></div>
  {erro&&<p className="login-err" role="alert">{erro}</p>}
  {!authOn&&<p className="card">Prévia sem conexão. Os registros reais aparecem após a configuração do banco e dos acessos.</p>}
  <div className="card" style={{marginTop:16}}><h3>Autorizações pendentes</h3>{aprovacoes.filter(a=>!a.aprovado_em).map(a=>{const c=contratos.find(c=>String(c.id)===a.contrato_id);return <div key={a.id} style={{padding:12,borderBottom:'1px solid var(--line)'}}><b>{c?.cliente_nome} · {c?.numero} · {brl(c?.valor_final)}</b><p>{a.resumo}</p><p>Desconto solicitado: {c?.dados_json?.desconto_valor}{c?.dados_json?.desconto_tipo==='pct'?'%':' reais'} · Entrada: {c?.dados_json?.entrada_percentual||60}%</p>{eu?.aprovadora&&<button className="btn" disabled={busy} onClick={()=>aprovar(a.id)}>Autorizar como {eu.aprovadora}</button>}</div>})}{!aprovacoes.some(a=>!a.aprovado_em)&&<p>Nenhuma solicitação pendente.</p>}</div>
  <div className="card" style={{marginTop:16}}><label>Contrato para conferência</label><select className="input" value={sel} onChange={e=>{setSel(e.target.value);setDeducoes([{descricao:'Cartão / financeira',valor:''},{descricao:'Marketing apurado na venda',valor:''}])}}><option value="">Selecione</option>{contratos.map(c=><option value={String(c.id)} key={c.id}>{c.numero} · {c.cliente_nome}</option>)}</select>
   {contrato&&<><AditivosContrato key={sel} contratoId={sel}/><table><tbody><tr><td>Vendedor</td><td>{contrato.vendor}</td></tr><tr><td>Promob original</td><td>{d.valor_promob==null?'Histórico: conferir documento original':brl(d.valor_promob)}</td></tr><tr><td>Acréscimo de marketing na proposta</td><td>{brl(d.acrescimo_marketing)}</td></tr><tr><td>Base antes do desconto</td><td>{brl(d.total_pedido)}</td></tr><tr><td>Desconto aplicado</td><td>{d.desconto_valor||0} {d.desconto_tipo==='pct'?'%':'reais'}</td></tr><tr><td>Valor negociado</td><td>{brl(d.valor_negociado)}</td></tr><tr><td>Total contratado com condição de pagamento</td><td>{brl(contrato.valor_final)}</td></tr><tr><td>Kits internos</td><td>{d.itens_extras?.length?`${d.itens_extras.length} tipo(s) — conferir cadastro`:'Sem kits registrados'}</td></tr></tbody></table>
   {d.promob_arquivo&&<button className="btn ghost" onClick={()=>abrirDocumento(d.promob_arquivo).catch(e=>setErro(e.message))}>Abrir XML original</button>}
   <h3 style={{marginTop:20}}>Gratificação — conferência por venda</h3><p className="sub">Faixas gerais: 3%, 4%, 5% e 6%, aplicadas ao líquido. Informe os custos reais, sem duplicar taxas. O acréscimo de 15% não é automaticamente uma dedução de marketing. Adendos permanecem pendentes.</p>
   {deducoes.map((x,i)=><div className="row-2" key={i}><input aria-label={`Dedução ${i+1}`} className="input" value={x.descricao} onChange={e=>setDeducoes(v=>v.map((r,j)=>i===j?{...r,descricao:e.target.value}:r))}/><input aria-label={`Valor dedução ${i+1}`} className="input" type="number" min="0" step="0.01" value={x.valor} onChange={e=>setDeducoes(v=>v.map((r,j)=>i===j?{...r,valor:e.target.value}:r))}/></div>)}
   <button className="btn ghost" onClick={()=>setDeducoes(v=>[...v,{descricao:'',valor:''}])}>Outra dedução acordada</button>
   {previa?<p>Líquido: <b>{brl(previa.liquido)}</b> · {previa.aliquota}% · Gratificação: <b>{brl(previa.valor)}</b></p>:<p>Preencha as deduções. Vendas abaixo de R$ 35 mil dependem de ajuste específico.</p>}
   <button className="btn" disabled={!previa||busy} onClick={conferir}>Registrar conferência</button>
   {conferencias.filter(g=>g.contrato_id===sel).map(g=><p key={g.contrato_id}>Conferência registrada em {fmtDate(g.conferido_em)}: {brl(g.gratificacao)} · {g.status}</p>)}
   </>}
  </div>
  <div className="card" style={{marginTop:16}}><h3>Recebíveis dos novos contratos</h3><div className="table-wrap"><table><thead><tr><th>Cliente / contrato</th><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Situação</th></tr></thead><tbody>{recebiveis.filter(r=>!sel||r.contrato_id===sel).map(r=><tr key={r.id}><td>{r.cliente_nome} · {r.contrato_numero}</td><td>{r.numero}</td><td>{brl(r.valor)}</td><td>{r.vencimento?fmtDate(r.vencimento):r.marco==='dois_dias_antes_entrega'?'2 dias corridos antes da entrega — data a confirmar':'A confirmar'}</td><td>{r.status}</td></tr>)}</tbody></table></div></div>
 </>
}
