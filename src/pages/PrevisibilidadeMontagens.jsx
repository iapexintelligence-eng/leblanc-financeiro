import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, authOn } from '../lib/supabase.js'
import { carregarJornada, todas } from '../lib/jornada.js'
import { jornadaDemo } from '../lib/jornadaDemo.js'
import { fmtDate } from '../lib/format.js'
import { hojeSP, dataValida } from '../lib/prazos.js'
import { setorPedido } from '../lib/setores.js'
import { previsaoOperacao, frenteAlvo, semanaDe, colunaDe, TITULO_COLUNA, PRAZOS_PADRAO, POS_MONTAGEM } from '../lib/posvenda.js'
import Protegido from '../components/Protegido.jsx'

const ORIGEM = { transportadora:'chegada da transportadora', confirmada:'confirmada', 'fábrica':'previsão da fábrica', estimada:'estimada', 'estimada após entrega':'estimada', realizada:'realizada' }
const corNivel = { ok:'ok', warn:'warn', danger:'danger' }
const Data = ({ v }) => !v?.data ? <span className="faint">—</span> : <>{fmtDate(v.data)}<div className="faint" style={{ fontSize: 11 }}>{ORIGEM[v.origem] || v.origem}</div></>
const natal = () => `${hojeSP().slice(0, 4)}-12-24`

export default function PrevisibilidadeMontagens() {
 const [base, setBase] = useState(() => authOn ? null : jornadaDemo().dados)
 const [contratos, setContratos] = useState(() => authOn ? [] : jornadaDemo().contratos)
 const [erro, setErro] = useState('')
 const [alvo, setAlvo] = useState(natal())
 const [prazos, setPrazos] = useState(null)
 const [editando, setEditando] = useState(false)
 const [msg, setMsg] = useState('')
 async function carregar() {
  try {
   const j = await carregarJornada(); setBase(j); setPrazos(j.config?.prazos_operacao || PRAZOS_PADRAO)
   setContratos(await todas(() => supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome').order('id')))
  } catch (e) { setErro(e.message) }
 }
 useEffect(() => { if (authOn) carregar(); else setPrazos(PRAZOS_PADRAO) }, [])
 const mapa = Object.fromEntries(contratos.map(c => [String(c.id), c]))
 const feriados = base?.config?.feriados || []
 const hoje = hojeSP()
 const pz = prazos || PRAZOS_PADRAO

 const linhas = useMemo(() => (base?.registros || []).filter(r => r.tipo === 'pedido').map(r => {
  const d = r.dados, col = colunaDe(d), setor = setorPedido(d)
  const montado = ['entrega_tecnica','pendencias','pecas','assistencia','finalizado'].includes(col) || !!d.montagem_concluida_em || d.importacao_revisoes?.setor_codigo === 'qualidade' && !col
  const ativo = !montado && (col || ['correcao','liberacao','montagem'].includes(setor))
  if (!ativo) return null
  const prev = previsaoOperacao(d, { prazos: pz, feriados, hoje })
  const grupo = !col ? 'sem' : ['implantado','producao'].includes(col) ? 'fabrica' : 'entrega'
  return { r, d, col, prev, grupo, alvo: frenteAlvo(prev, alvo, { prazos: pz, feriados }), cliente: mapa[r.contrato_id]?.cliente_nome || d.cliente_nome || 'Cliente', espera: d.espera_motivo || d.posvenda?.impedimento }
 }).filter(Boolean), [base, alvo, prazos, contratos])

 const grupos = [
  ['entrega', 'Prontos e aguardando entrega ou montagem', 'Pronto na fábrica, aguardando o cliente, entrega agendada ou montagem em andamento.'],
  ['fabrica', 'Implantados na fábrica', 'Em produção na Menezes ou na Bartzen.'],
  ['sem', 'Ainda sem implantação', 'Na correção ou na liberação. A data limite mostra até quando implantar para caber no alvo.'],
 ]
 const conta = (n) => linhas.filter(l => l.alvo?.nivel === n).length
 const naoCabem = linhas.filter(l => l.alvo?.texto === 'Não cabe').length
 const montadosAte = (base?.registros || []).filter(r => r.tipo === 'pedido' && ['entrega_tecnica','pendencias','pecas','assistencia','finalizado'].includes(colunaDe(r.dados))).length

 // Carga dos montadores por semana até o alvo: montagens confirmadas pela Glauci e previstas sem montador.
 const semanas = useMemo(() => {
  const out = {}
  for (const l of linhas) {
   const pv = l.d.posvenda || {}
   const inicio = pv.montagem_inicio_em || l.prev.entrega?.data
   if (!dataValida(inicio) || inicio > alvo) continue
   const s = semanaDe(inicio > hoje ? inicio : hoje)
   // Prévia da Glauci conta na carga do montador, marcada como prévia até o pagamento liberar.
   const quem = pv.montador || pv.montador_previa || 'A definir'
   ;(out[s] ||= {})[quem] = [...((out[s] || {})[quem] || []), pv.montador ? l.cliente : `${l.cliente} (prévia)`]
  }
  return out
 }, [linhas, alvo])
 const montadores = [...new Set(Object.values(semanas).flatMap(o => Object.keys(o)))].sort((a, b) => a === 'A definir' ? 1 : b === 'A definir' ? -1 : a.localeCompare(b))

 // Saldos a cobrar (2 dias antes da entrega) para liberar a montagem.
 const saldos = linhas.filter(l => l.grupo === 'entrega' && l.prev.saldoAte).sort((a, b) => a.prev.saldoAte.localeCompare(b.prev.saldoAte))

 async function salvarPrazos() {
  setMsg('')
  try {
   const p = { fabricas: Object.fromEntries(Object.entries(pz.fabricas).map(([k, v]) => [k, Number(v)])), padrao_fabrica: Number(pz.padrao_fabrica), entrega_apos_pronto: Number(pz.entrega_apos_pronto), montagem_dias: Number(pz.montagem_dias) }
   const { error } = await supabase.rpc('posvenda_prazos_salvar', { p })
   if (error) throw error
   setEditando(false); setMsg('Prazos salvos.'); await carregar()
  } catch (e) { setMsg(e.message) }
 }
 const podeEditar = !authOn || ['gestor','logistica','financeiro'].includes(base?.eu?.papel)

 if (erro) return <div className="login-err" role="alert">Não foi possível carregar: {erro}</div>
 if (!base) return <div className="spinner-wrap">Carregando previsibilidade…</div>
 return <>
  <div className="card" style={{ marginBottom: 16 }}>
   <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
    <div>
     <h3>Quem conseguimos montar até {fmtDate(alvo)}?</h3>
     <div className="sub" style={{ margin: 0 }}>Cada data mostra a origem: realizada, confirmada pela Glauci no quadro, previsão da fábrica ou estimada pelos prazos abaixo.</div>
    </div>
    <label className="field" style={{ margin: 0 }}><span className="sub" style={{ margin: 0 }}>Montar até</span><input aria-label="Montar até" className="input" type="date" value={alvo} onChange={e => dataValida(e.target.value) && setAlvo(e.target.value)} /></label>
   </div>
   <div className="tools" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
    <span className="sub" style={{ margin: 0 }}>Prazos usados:</span>
    {!editando ? <>
     {Object.entries(pz.fabricas).map(([f, n]) => <span key={f} className="pill">{f}: {n} dias úteis até ficar pronto</span>)}
     <span className="pill">Entrega: {pz.entrega_apos_pronto} dias úteis após pronto</span>
     <span className="pill">Montagem: {pz.montagem_dias} dias úteis</span>
     {podeEditar && authOn && <button className="btn ghost sm" onClick={() => setEditando(true)}>Ajustar prazos</button>}
    </> : <>
     {Object.entries(pz.fabricas).map(([f, n]) => <label key={f} className="sub" style={{ margin: 0 }}>{f} <input aria-label={`Prazo ${f}`} className="input" style={{ width: 70 }} type="number" min="1" value={n} onChange={e => setPrazos(p => ({ ...p, fabricas: { ...p.fabricas, [f]: e.target.value } }))} /></label>)}
     <label className="sub" style={{ margin: 0 }}>Entrega após pronto <input aria-label="Entrega após pronto" className="input" style={{ width: 70 }} type="number" min="0" value={pz.entrega_apos_pronto} onChange={e => setPrazos(p => ({ ...p, entrega_apos_pronto: e.target.value }))} /></label>
     <label className="sub" style={{ margin: 0 }}>Dias de montagem <input aria-label="Dias de montagem" className="input" style={{ width: 70 }} type="number" min="0" value={pz.montagem_dias} onChange={e => setPrazos(p => ({ ...p, montagem_dias: e.target.value }))} /></label>
     <button className="btn sm" onClick={salvarPrazos}>Salvar prazos</button><button className="btn ghost sm" onClick={() => { setEditando(false); setPrazos(base.config?.prazos_operacao || PRAZOS_PADRAO) }}>Cancelar</button>
    </>}
    {msg && <span className="sub" style={{ margin: 0 }}>{msg}</span>}
   </div>
  </div>

  <div className="grid cols-4" style={{ marginBottom: 16 }}>
   <div className="card kpi"><div className="label">Cabem até {fmtDate(alvo)}</div><div className="value" style={{ color: 'var(--ok)' }}>{conta('ok')}</div><div className="delta">{montadosAte} já montados no quadro</div></div>
   <div className="card kpi"><div className="label">Apertados ou estimados</div><div className="value" style={{ color: 'var(--warn)' }}>{conta('warn')}</div></div>
   <div className="card kpi"><div className="label">Não cabem</div><div className="value" style={{ color: 'var(--danger)' }}>{naoCabem}</div></div>
   <div className="card kpi"><div className="label">Saldos a cobrar</div><div className="value">{saldos.length}</div><div className="delta">liberam a montagem</div></div>
  </div>

  {grupos.map(([g, titulo, desc]) => {
   const ls = linhas.filter(l => l.grupo === g).sort((a, b) => (a.prev.montagem?.data || '9999').localeCompare(b.prev.montagem?.data || '9999'))
   return <div key={g} style={{ marginBottom: 20 }}>
    <div className="section-head"><div><h2 style={{ fontFamily: 'var(--serif)', fontSize: 22 }}>{titulo} <span className="pill">{ls.length}</span></h2><div className="sub" style={{ margin: 0 }}>{desc}</div></div></div>
    <div className="table-wrap"><table>
     <thead><tr><th>Cliente</th><th>Etapa</th><th>Fábrica</th><th>Pronto</th><th>Entrega</th><th>Termina a montagem</th><th>Prazo do contrato</th><th>Até {fmtDate(alvo)}</th><th>Saldo</th></tr></thead>
     <tbody>
      {ls.length === 0 && <tr><td colSpan="9" className="empty">Nenhum cliente nesta etapa.</td></tr>}
      {ls.map(l => <tr key={l.r.id}>
       <td><Link to={'/jornada?registro=' + encodeURIComponent(l.r.id)} style={{ textDecoration: 'underline' }}>{l.cliente}</Link>{l.espera && <div className="sub" style={{ margin: 0, color: 'var(--warn)' }}>{String(l.espera).slice(0, 60)}</div>}</td>
       <td>{l.col ? TITULO_COLUNA[l.col] : ({ correcao:'Correção', liberacao:'Liberação', montagem:'Montagem' }[setorPedido(l.d)] || '—')}</td>
       <td>{l.prev.fabrica || <span className="faint">A definir</span>}</td>
       <td><Data v={l.prev.pronto} /></td>
       <td><Data v={l.prev.entrega} /></td>
       <td><Data v={l.prev.montagem} /></td>
       <td>{l.prev.prazoContrato ? fmtDate(l.prev.prazoContrato) : <span className="faint">—</span>}{l.prev.prazoContrato && l.prev.entrega?.data && l.prev.entrega.data > l.prev.prazoContrato && <div className="badge danger">Entrega após o prazo</div>}</td>
       <td>{l.alvo && <span className={'badge ' + corNivel[l.alvo.nivel]}>{l.alvo.texto}</span>}{g === 'sem' && l.alvo?.limiteImplantar && <div className="sub" style={{ margin: 0 }}>Implantar até {fmtDate(l.alvo.limiteImplantar)}</div>}</td>
       <td>{l.prev.quitado ? <span className="badge ok">Quitado</span> : l.prev.saldoAte ? <span className="badge danger">🔒 Cobrar até {fmtDate(l.prev.saldoAte)}</span> : l.grupo === 'entrega' && !POS_MONTAGEM.has(l.prev.coluna) ? <span className="badge warn">Aguardando data da transportadora</span> : <span className="faint">A cobrar</span>}</td>
      </tr>)}
     </tbody>
    </table></div>
   </div>
  })}

  <Protegido nome="Carga dos montadores">
   <div className="card" style={{ marginBottom: 16 }}>
    <h3>Montagens por semana até {fmtDate(alvo)}</h3>
    <div className="sub">Pela data de início da montagem marcada no quadro ou, sem ela, pela entrega prevista. "A definir" são montagens previstas ainda sem montador.</div>
    {Object.keys(semanas).length === 0 ? <p className="sub">Nenhuma montagem prevista até a data.</p> :
     <div className="table-wrap" style={{ boxShadow: 'none' }}><table>
      <thead><tr><th>Semana de</th>{montadores.map(m => <th key={m}>{m}</th>)}<th className="num">Total</th></tr></thead>
      <tbody>{Object.keys(semanas).sort().map(s => <tr key={s}><td>{fmtDate(s)}</td>{montadores.map(m => <td key={m} title={(semanas[s][m] || []).join(', ')}>{semanas[s][m]?.length || ''}</td>)}<td className="num">{Object.values(semanas[s]).reduce((t, x) => t + x.length, 0)}</td></tr>)}</tbody>
     </table></div>}
   </div>
  </Protegido>

  <div className="card">
   <h3>Saldos a cobrar para liberar a montagem</h3>
   <div className="sub">A Leia cobra o saldo 2 dias antes da entrega e anexa o comprovante na ficha. Sem isso, a montagem fica bloqueada no quadro.</div>
   <div className="table-wrap" style={{ boxShadow: 'none' }}><table>
    <thead><tr><th>Cliente</th><th>Entrega</th><th>Cobrar até</th></tr></thead>
    <tbody>{saldos.length === 0 ? <tr><td colSpan="3" className="empty">Nenhum saldo com data de chegada ou entrega lançada.</td></tr> : saldos.map(l => <tr key={l.r.id} style={{ background: l.prev.saldoAte < hoje ? 'var(--danger-bg)' : undefined }}><td>{l.cliente}</td><td><Data v={l.prev.entrega} /></td><td>{fmtDate(l.prev.saldoAte)}{l.prev.saldoAte < hoje && <div className="badge danger">Atrasado</div>}</td></tr>)}</tbody>
   </table></div>
  </div>
 </>
}
