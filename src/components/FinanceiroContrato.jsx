import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { todas } from '../lib/jornada.js'
import { brl, fmtDate } from '../lib/format.js'
import { parcelasDoCliente, projetoDeContrato, resumoReceber, emAberto } from '../lib/recebimentos.js'
import ParcelasContrato from './ParcelasContrato.jsx'

// O que o cliente já pagou e o que falta receber do contrato, com as parcelas de Entradas.
export default function FinanceiroContrato({ contrato }) {
  const [parcelas, setParcelas] = useState(null), [lancar, setLancar] = useState(false), [versao, setVersao] = useState(0), [erro, setErro] = useState('')
  useEffect(() => { (async () => {
    try {
      const ar = await todas(() => supabase.from('a_receber').select('*').order('id'))
      setParcelas(parcelasDoCliente(ar, { nome: contrato.cliente_nome, projeto: projetoDeContrato(contrato) }))
    } catch (e) { setErro(e.message); setParcelas([]) }
  })() }, [contrato.id, versao])

  const r = resumoReceber(parcelas || [], contrato.valor_final)
  const hoje = new Date().toISOString().slice(0, 10)
  return <div className="card" style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <h3 style={{ margin: 0 }}>Financeiro do contrato</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {parcelas && (r.naoLancado > 0 || !parcelas.length) && <button className="btn sm" type="button" onClick={() => setLancar(true)}>{parcelas.length ? 'Lançar o que falta' : 'Lançar parcelas'}</button>}
        {parcelas?.length > 0 && <Link className="btn ghost sm" to={'/recebiveis?busca=' + encodeURIComponent(contrato.cliente_nome)}>Dar baixa em Entradas</Link>}
      </div>
    </div>
    {erro && <div className="login-err" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
    {parcelas === null ? <div className="sub">Carregando…</div> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '12px 0' }}>
        <div><div className="faint" style={{ fontSize: 12 }}>Valor do contrato</div><b>{Number(contrato.valor_final) > 0 ? brl(contrato.valor_final) : '—'}</b></div>
        <div><div className="faint" style={{ fontSize: 12 }}>Já recebido</div><b style={{ color: 'var(--ok)' }}>{brl(r.recebido)}</b></div>
        <div><div className="faint" style={{ fontSize: 12 }}>Saldo a receber</div><b style={{ color: r.aReceber > 0 ? 'var(--danger)' : undefined }}>{brl(r.aReceber)}</b></div>
        {r.naoLancado > 0 && <div><div className="faint" style={{ fontSize: 12 }}>Ainda não lançado em Entradas</div><b>{brl(r.naoLancado)}</b></div>}
      </div>
      {!parcelas.length
        ? <div className="sub">Nenhuma parcela deste contrato em Entradas, por isso o saldo não aparecia. Clique em <b>Lançar parcelas</b> para registrar o que o cliente vai pagar (e o que já pagou, dando baixa depois).</div>
        : <div className="table-wrap" style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>Parcela</th><th>Previsto</th><th className="num">Valor</th><th className="num">Recebido</th><th className="num">Em aberto</th><th>Situação</th></tr></thead>
          <tbody>{parcelas.map((p) => { const ab = emAberto(p); const atrasada = ab > 0 && p.data_prevista && p.data_prevista < hoje
            return <tr key={p.id}>
              <td>{p.descricao || 'Parcela'}</td>
              <td className="muted">{p.data_prevista ? fmtDate(p.data_prevista) : 'sem data'}</td>
              <td className="num">{brl(p.valor_parcela)}</td>
              <td className="num">{brl(Number(p.valor_parcela || 0) - ab)}</td>
              <td className="num">{ab > 0 ? brl(ab) : '—'}</td>
              <td>{ab <= 0 ? <span className="badge ok">Recebido</span> : atrasada ? <span className="badge danger">Atrasada</span> : Number(p.valor_recebido) > 0 ? <span className="badge warn">Parcial</span> : <span className="badge neutral">A receber</span>}</td>
            </tr> })}</tbody>
        </table></div>}
    </>}
    {lancar && <ParcelasContrato contratoId={contrato.id} onClose={() => setLancar(false)} onFeito={() => { setLancar(false); setVersao((v) => v + 1) }} />}
  </div>
}
