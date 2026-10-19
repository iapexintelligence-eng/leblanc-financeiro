import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal.jsx'
import { salvarRegistro } from '../lib/jornada.js'
import { fmtDate } from '../lib/format.js'
import { hojeSP } from '../lib/prazos.js'
import { COLUNAS, TITULO_COLUNA, PERGUNTAS, CAMPOS_POSVENDA, FABRICAS, MONTADORES_CONHECIDOS, POS_MONTAGEM, colunaDe, bloqueioMontagem, quitado } from '../lib/posvenda.js'

const ANTES_DA_MONTAGEM = new Set(['pronto','aguardando_cliente','entrega_agendada'])

// Data que mais importa em cada coluna, para aparecer no cartão.
function dataChave(c, pv={}, d={}) {
 const f = (x) => x ? fmtDate(x) : null
 switch (c) {
  case 'implantado': return f(pv.implantado_em || d.implantacao_em) && `Implantado ${f(pv.implantado_em || d.implantacao_em)}`
  case 'producao': return f(pv.pronto_fabrica_em) && `Pronto previsto ${f(pv.pronto_fabrica_em)}`
  case 'pronto': return f(pv.pronto_fabrica_em) && `Pronto ${f(pv.pronto_fabrica_em)}`
  case 'aguardando_cliente': return f(pv.retorno_previsto_em) && `Retorno previsto ${f(pv.retorno_previsto_em)}`
  case 'entrega_agendada': return f(pv.entrega_agendada_em || d.entrega_prevista) && `Entrega ${f(pv.entrega_agendada_em || d.entrega_prevista)}`
  case 'montagem': return [f(pv.entregue_em) && `Entregue ${f(pv.entregue_em)}`, f(pv.montagem_inicio_em) && `montagem desde ${f(pv.montagem_inicio_em)}`].filter(Boolean).join(' · ') || null
  case 'entrega_tecnica': return f(pv.montagem_fim_em) && `Montagem terminou ${f(pv.montagem_fim_em)}`
  case 'pecas': return f(pv.pecas_previstas_em) && `Peças previstas ${f(pv.pecas_previstas_em)}`
  case 'finalizado': return f(pv.posvenda_em) && `Pós-venda ${f(pv.posvenda_em)}`
  default: return null
 }
}

function Campo({ k, label, tipo, valor, onChange, travado, montadores }) {
 if (tipo === 'date') return <input aria-label={label} className="input" type="date" value={valor || ''} disabled={travado} onChange={e => onChange(k, e.target.value)} />
 if (tipo === 'textarea') return <textarea aria-label={label} className="input" value={valor || ''} disabled={travado} onChange={e => onChange(k, e.target.value)} />
 if (tipo === 'montador') return <><input aria-label={label} className="input" list="lista-montadores" value={valor || ''} disabled={travado} onChange={e => onChange(k, e.target.value)} placeholder="Ex.: Robson" /><datalist id="lista-montadores">{montadores.map(m => <option key={m} value={m} />)}</datalist></>
 if (tipo === 'fabrica') return <><input aria-label={label} className="input" list="lista-fabricas" value={valor || ''} disabled={travado} onChange={e => onChange(k, e.target.value)} placeholder="Menezes ou Bartzen" /><datalist id="lista-fabricas">{FABRICAS.map(m => <option key={m} value={m} />)}</datalist></>
 return <input aria-label={label} className="input" value={valor || ''} disabled={travado} onChange={e => onChange(k, e.target.value)} />
}

export default function QuadroPosVenda({ registros, mapa, pessoas=[], eu, onSalvo, demo=false }) {
 const [busca, setBusca] = useState('')
 const [verFinalizados, setVerFinalizados] = useState(false)
 const [arrastando, setArrastando] = useState(null)
 const [mover, setMover] = useState(null) // { r, destino, campos }
 const [detalhe, setDetalhe] = useState(null) // { r, pv, nota }
 const [erro, setErro] = useState('')
 const [salvando, setSalvando] = useState(false)
 const pode = !demo && ['logistica','gestor'].includes(eu?.papel)
 const nomePessoa = (id) => pessoas.find(p => p.usuario_id === id)?.nome || 'Equipe'
 const cliente = (r) => mapa[r.contrato_id]?.cliente_nome || r.dados.cliente_nome || 'Cliente'
 const assistAbertas = (r) => registros.filter(a => a.tipo === 'assistencia' && a.contrato_id === r.contrato_id && a.dados.status !== 'Resolvida')

 const cartoes = useMemo(() => registros.filter(r => r.tipo === 'pedido' && colunaDe(r.dados))
  .filter(r => !busca || `${cliente(r)} ${r.dados.posvenda?.montador || ''} ${r.dados.posvenda?.fabrica || ''}`.toLowerCase().includes(busca.toLowerCase())), [registros, busca, mapa])
 const montadores = useMemo(() => [...new Set([...MONTADORES_CONHECIDOS, ...registros.map(r => r.dados.posvenda?.montador).filter(Boolean)])].sort(), [registros])
 const porColuna = Object.fromEntries(COLUNAS.map(c => [c.id, cartoes.filter(r => colunaDe(r.dados) === c.id)
  .sort((a, b) => (a.dados.posvenda?.entrega_agendada_em || a.dados.posvenda?.pronto_fabrica_em || '9999').localeCompare(b.dados.posvenda?.entrega_agendada_em || b.dados.posvenda?.pronto_fabrica_em || '9999'))]))
 const semComprovante = cartoes.filter(r => POS_MONTAGEM.has(colunaDe(r.dados)) && colunaDe(r.dados) !== 'finalizado' && !quitado(r.dados)).length
 const aguardandoLeia = cartoes.filter(r => ANTES_DA_MONTAGEM.has(colunaDe(r.dados)) && !quitado(r.dados)).length

 function iniciarMover(r, destino) {
  setErro('')
  if (!pode || destino === colunaDe(r.dados)) return
  const bloqueio = bloqueioMontagem(r.dados, destino)
  if (bloqueio) { setErro(`${cliente(r)}: ${bloqueio}`); return }
  const pv = r.dados.posvenda || {}
  const campos = Object.fromEntries((PERGUNTAS[destino] || []).map(([k]) => [k, pv[k] || (k.endsWith('_em') && ['entregue_em','montagem_fim_em','posvenda_em','implantado_em'].includes(k) ? hojeSP() : '')]))
  setMover({ r, destino, campos })
 }
 async function gravar(r, pv) {
  setSalvando(true); setErro('')
  try { await salvarRegistro({ ...r, dados: { ...r.dados, posvenda: pv } }); setMover(null); setDetalhe(null); await onSalvo?.() }
  catch (e) { setErro(e.message) }
  finally { setSalvando(false) }
 }
 function confirmarMover() {
  const { r, destino, campos } = mover
  const bloqueio = bloqueioMontagem(r.dados, destino, campos)
  if (bloqueio) { setErro(bloqueio); return }
  const limpos = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== ''))
  gravar(r, { ...(r.dados.posvenda || {}), ...limpos, coluna: destino })
 }
 function salvarDetalhe() {
  const { r, pv, nota } = detalhe
  const coluna = pv.coluna || colunaDe(r.dados)
  const bloqueio = bloqueioMontagem(r.dados, coluna, pv)
  if (bloqueio) { setErro(bloqueio); return }
  const anotacoes = [...(r.dados.posvenda?.anotacoes || []), ...(nota?.trim() ? [{ texto: nota.trim() }] : [])]
  gravar(r, { ...pv, coluna, ...(anotacoes.length ? { anotacoes } : {}) })
 }

 return <div className="card" style={{ marginBottom: 16, padding: 16 }}>
  <div className="between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
   <div>
    <h3>Quadro de pós-venda</h3>
    <div className="sub" style={{ margin: 0 }}>{pode ? 'Arraste o cartão para a próxima etapa ou abra para registrar datas e anotações.' : 'Consulta do quadro da logística.'} A montagem só é liberada com o comprovante do saldo conferido pela Leia.</div>
   </div>
   <div className="tools" style={{ gap: 8, flexWrap: 'wrap' }}>
    {aguardandoLeia > 0 && <span className="badge danger" title="Antes da montagem, sem comprovante conferido">🔒 {aguardandoLeia} aguardando comprovante da Leia</span>}
    {semComprovante > 0 && <span className="badge warn" title="Já estavam montando quando vieram do Trello">{semComprovante} em montagem sem comprovante no sistema</span>}
    <input aria-label="Buscar no quadro" className="input" style={{ width: 220 }} placeholder="Buscar cliente, montador, fábrica" value={busca} onChange={e => setBusca(e.target.value)} />
   </div>
  </div>
  {erro && !mover && !detalhe && <div className="login-err" role="alert" style={{ marginBottom: 10 }}>{erro}</div>}
  <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
   {COLUNAS.map(c => {
    const lista = c.id === 'finalizado' && !verFinalizados ? porColuna[c.id].slice(-8) : porColuna[c.id]
    return <section key={c.id} aria-label={c.titulo}
     onDragOver={e => { if (pode) e.preventDefault() }} onDrop={e => { e.preventDefault(); const r = cartoes.find(x => x.id === arrastando); setArrastando(null); if (r) iniciarMover(r, c.id) }}
     style={{ flex: '0 0 248px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', padding: 8, minHeight: 120, border: c.trava ? '1px solid var(--line)' : '1px solid transparent' }}>
     <div className="between" style={{ padding: '2px 4px 8px' }}>
      <b style={{ fontSize: 13 }}>{c.trava && '🔒 '}{c.titulo}</b><span className="pill">{porColuna[c.id].length}</span>
     </div>
     {c.dica && <div className="faint" style={{ fontSize: 12, padding: '0 4px 6px' }}>{c.dica}</div>}
     {lista.map(r => {
      const d = r.dados, pv = d.posvenda || {}, abertas = assistAbertas(r)
      const lock = ANTES_DA_MONTAGEM.has(c.id) && !quitado(d)
      return <article key={r.id} draggable={pode} onDragStart={() => setArrastando(r.id)} onClick={() => { setErro(''); setDetalhe({ r, pv: { ...pv }, nota: '' }) }}
       style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '9px 10px', marginBottom: 8, boxShadow: 'var(--shadow)', cursor: 'pointer', borderLeft: lock ? '3px solid var(--danger)' : '3px solid transparent' }}>
       <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{cliente(r)}</div>
       <div className="sub" style={{ margin: '2px 0 0', fontSize: 12 }}>{[pv.fabrica, pv.montador && `Montador ${pv.montador}`].filter(Boolean).join(' · ') || 'Fábrica e montador a informar'}</div>
       {dataChave(c.id, pv, d) && <div style={{ fontSize: 12, marginTop: 4 }}>{dataChave(c.id, pv, d)}</div>}
       {pv.impedimento && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--warn)' }}>{pv.impedimento.slice(0, 90)}</div>}
       <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
        {lock && <span className="badge danger">🔒 Saldo sem comprovante</span>}
        {POS_MONTAGEM.has(c.id) && c.id !== 'finalizado' && !quitado(d) && <span className="badge warn">Sem comprovante no sistema</span>}
        {abertas.length > 0 && <span className="badge warn">{abertas.length} assistência{abertas.length > 1 ? 's' : ''}</span>}
        {(pv.anotacoes?.length || 0) + (pv.trello?.comentarios?.length || 0) > 0 && <span className="badge neutral">{(pv.anotacoes?.length || 0) + (pv.trello?.comentarios?.length || 0)} anotação(ões)</span>}
       </div>
      </article>
     })}
     {c.id === 'finalizado' && porColuna[c.id].length > 8 && <button className="btn ghost sm" onClick={() => setVerFinalizados(!verFinalizados)}>{verFinalizados ? 'Mostrar só os últimos' : `Ver todos (${porColuna[c.id].length})`}</button>}
     {porColuna[c.id].length === 0 && <div className="faint" style={{ fontSize: 12, padding: 6 }}>Nenhum cliente</div>}
    </section>
   })}
  </div>

  {mover && <Modal title={`Mover para: ${TITULO_COLUNA[mover.destino]}`} onClose={() => !salvando && setMover(null)} footer={<><button className="btn ghost" onClick={() => setMover(null)} disabled={salvando}>Cancelar</button><button className="btn" onClick={confirmarMover} disabled={salvando}>{salvando ? 'Salvando…' : 'Confirmar'}</button></>}>
   <p style={{ marginTop: 0 }}><b>{cliente(mover.r)}</b> · de {TITULO_COLUNA[colunaDe(mover.r.dados)]}</p>
   {erro && <div className="login-err" role="alert">{erro}</div>}
   {(PERGUNTAS[mover.destino] || []).map(([k, label, tipo]) => <div className="field" key={k}><label>{label}</label><Campo k={k} label={label} tipo={tipo} valor={mover.campos[k]} montadores={montadores} onChange={(k, v) => setMover(m => ({ ...m, campos: { ...m.campos, [k]: v } }))} /></div>)}
  </Modal>}

  {detalhe && (() => { const { r, pv } = detalhe; const d = r.dados; const coluna = pv.coluna || colunaDe(d); const notas = [...(pv.trello?.descricao ? [{ texto: pv.trello.descricao, autor: 'Descrição no Trello' }] : []), ...(pv.trello?.comentarios || []).map(x => ({ texto: x.texto, em: x.em, autor: 'Trello' })), ...(d.posvenda?.anotacoes || []).map(x => ({ ...x, autor: nomePessoa(x.usuario) }))]
   return <Modal wide title={cliente(r)} onClose={() => !salvando && setDetalhe(null)} footer={<><Link className="btn ghost" to={'/jornada?registro=' + encodeURIComponent(r.id)}>Abrir ficha completa</Link><button className="btn ghost" onClick={() => setDetalhe(null)} disabled={salvando}>Fechar</button>{pode && <button className="btn" onClick={salvarDetalhe} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>}</>}>
    {erro && <div className="login-err" role="alert">{erro}</div>}
    <div className="grid cols-3" style={{ marginBottom: 12 }}>
     <div className="card"><small>Etapa</small><p style={{ margin: 0 }}>{TITULO_COLUNA[coluna]}</p>{pode && <select aria-label="Mover para" className="input" style={{ marginTop: 6 }} value="" onChange={e => { if (e.target.value) { setDetalhe(null); iniciarMover(r, e.target.value) } }}><option value="">Mover para…</option>{COLUNAS.filter(c => c.id !== coluna).map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}</select>}</div>
     <div className="card"><small>Saldo final</small><p style={{ margin: 0, color: quitado(d) ? 'var(--ok)' : 'var(--danger)' }}>{quitado(d) ? 'Quitação conferida pela Leia' : '🔒 Aguardando comprovante da Leia'}</p></div>
     <div className="card"><small>Assistências abertas</small><p style={{ margin: 0 }}>{assistAbertas(r).length ? assistAbertas(r).map(a => <Link key={a.id} to={'/jornada?registro=' + encodeURIComponent(a.id)} style={{ display: 'block', textDecoration: 'underline' }}>{(a.dados.descricao || 'Assistência').split('\n').find(l => l.trim() && !l.startsWith('Trello'))?.slice(0, 50) || 'Assistência'}</Link>) : 'Nenhuma'}</p></div>
    </div>
    {pv.trello && <p className="sub">Veio do Trello: cartão "{pv.trello.nome}" na lista {pv.trello.lista}.</p>}
    <div className="grid cols-2">{CAMPOS_POSVENDA.map(([k, label, tipo]) => <div className="field" key={k} style={tipo === 'textarea' ? { gridColumn: '1 / -1' } : null}><label>{label}</label><Campo k={k} label={label} tipo={tipo} valor={pv[k]} travado={!pode} montadores={montadores} onChange={(k, v) => setDetalhe(x => ({ ...x, pv: { ...x.pv, [k]: v } }))} /></div>)}</div>
    <h3 style={{ margin: '18px 0 8px' }}>Anotações</h3>
    {notas.length === 0 && <p className="sub">Nenhuma anotação ainda.</p>}
    {notas.map((n, i) => <div key={i} style={{ borderLeft: '2px solid var(--line-strong)', padding: '2px 0 2px 10px', marginBottom: 10 }}><div className="sub" style={{ margin: 0 }}>{n.autor}{n.em ? ` · ${fmtDate(String(n.em).slice(0, 10))}` : ''}</div><div style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</div></div>)}
    {pode && <div className="field"><label>Nova anotação</label><textarea aria-label="Nova anotação" className="input" value={detalhe.nota} onChange={e => setDetalhe(x => ({ ...x, nota: e.target.value }))} placeholder="Ex.: cliente pediu para entregar só à tarde" /></div>}
   </Modal> })()}
 </div>
}
