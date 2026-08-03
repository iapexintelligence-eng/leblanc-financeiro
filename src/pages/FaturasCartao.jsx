import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => { if (!ym) return '—'; const p = String(ym).slice(0, 7).split('-'); return `${MESES_PT[Number(p[1]) - 1]}/${p[0].slice(2)}` }

export default function FaturasCartao() {
  const [rows, setRows] = useState(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [cartaoF, setCartaoF] = useState('todos')
  const [mesF, setMesF] = useState('')

  const carregar = async () => {
    const { data, error } = await supabase.from('vw_fatura_rateio').select('*').order('mes_ref', { ascending: false })
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [])

  const cartoes = useMemo(() => [...new Set((rows || []).map((r) => r.cartao).filter(Boolean))].sort(), [rows])
  const meses = useMemo(() => [...new Set((rows || []).map((r) => String(r.mes_ref || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [rows])
  useEffect(() => { if (rows && mesF === '' && meses.length) setMesF(meses[0]) }, [rows, meses]) // eslint-disable-line

  const lista = useMemo(() => (rows || []).filter((r) => {
    if (cartaoF !== 'todos' && r.cartao !== cartaoF) return false
    if (mesF && mesF !== 'todos' && String(r.mes_ref || '').slice(0, 7) !== mesF) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.descricao || '').toLowerCase().includes(q) || (r.bucket || '').toLowerCase().includes(q))) return false }
    return true
  }), [rows, cartaoF, mesF, busca])

  const total = lista.reduce((s, r) => s + n(r.valor), 0)
  const cobrado = lista.filter((r) => r.cobrado).reduce((s, r) => s + n(r.valor), 0)
  const aCobrar = Math.max(0, total - cobrado)

  const toggleCobrado = async (r) => {
    setErro('')
    const novo = !r.cobrado
    const { error } = await supabase.from('fatura_rateio').update({ cobrado: novo, cobrado_em: novo ? today() : null }).eq('id', r.id)
    if (error) { setErro(error.message); return }
    setRows((s) => s.map((x) => x.id === r.id ? { ...x, cobrado: novo, cobrado_em: novo ? today() : null } : x))
  }

  return (
    <div className="card" style={{ maxWidth: 1040 }}>
      <div className="between">
        <div>
          <h3>Faturas de cartão — rateio</h3>
          <div className="sub">A fatura de cada cartão dividida por item/bucket. Marque o que já foi cobrado (repassado) para acompanhar o que falta.</div>
        </div>
      </div>

      <div className="tools" style={{ gap: 10, margin: '14px 0' }}>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar descrição / bucket" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <select className="input" style={{ width: 160 }} value={cartaoF} onChange={(e) => setCartaoF(e.target.value)}>
          <option value="todos">Todos os cartões</option>{cartoes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={mesF} onChange={(e) => setMesF(e.target.value)}>
          <option value="todos">Todos os meses</option>{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Total no filtro</div><div className="value">{brl(total)}</div><div className="delta">{lista.length} item(ns)</div></div>
        <div className="card kpi"><div className="label">Já cobrado</div><div className="value" style={{ color: 'var(--ok)' }}>{brl(cobrado)}</div></div>
        <div className="card kpi"><div className="label">A cobrar</div><div className="value" style={{ color: aCobrar ? 'var(--warn)' : 'inherit' }}>{brl(aCobrar)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Cartão</th><th>Mês</th><th>Bucket</th><th>Descrição</th><th className="num">Valor</th><th>Cobrado</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="6" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="6" className="empty">Sem itens de fatura neste filtro.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td><b>{r.cartao || '—'}</b></td>
                <td className="muted">{rotuloMes(r.mes_ref)}</td>
                <td>{r.bucket || '—'}</td>
                <td className="muted">{r.descricao || '—'}</td>
                <td className="num">{brl(r.valor)}</td>
                <td>
                  {r.cobrado
                    ? <button className="badge ok" style={{ cursor: 'pointer', border: 'none' }} onClick={() => toggleCobrado(r)} title={r.cobrado_em ? 'em ' + fmtDate(r.cobrado_em) : ''}>Cobrado ✓</button>
                    : <button className="badge warn" style={{ cursor: 'pointer', border: 'none' }} onClick={() => toggleCobrado(r)}>Marcar cobrado</button>}
                </td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && <tfoot><tr><td colSpan="4"><b>TOTAL</b></td><td className="num"><b>{brl(total)}</b></td><td></td></tr></tfoot>}
        </table>
      </div>
    </div>
  )
}
