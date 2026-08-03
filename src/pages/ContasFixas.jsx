import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const CAT_LABEL = { fixos: 'Fixos', impostos: 'Impostos', salarios: 'Salários', pro_labore: 'Pró-labore', operacional: 'Operacional', marketing: 'Marketing', industria: 'Indústria', montagem: 'Montagem', frete: 'Frete', rafex: 'RAFEX', perfar: 'Perfar', vidracaria: 'Vidraçaria', metalon: 'Metalon', outros: 'Outros' }
const labelCat = (c) => CAT_LABEL[c] || c || '—'

export default function ContasFixas() {
  const [rows, setRows] = useState(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [catF, setCatF] = useState('todas')

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('vw_contas_recorrentes').select('*')
      if (error) setErro(error.message)
      const arr = (data || []).slice().sort((a, b) => (a.dia_vencimento || 99) - (b.dia_vencimento || 99))
      setRows(arr)
    })()
  }, [])

  const cats = useMemo(() => [...new Set((rows || []).map((r) => r.categoria).filter(Boolean))].sort(), [rows])
  const lista = useMemo(() => (rows || []).filter((r) => {
    if (catF !== 'todas' && r.categoria !== catF) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.descricao || '').toLowerCase().includes(q) || (r.fornecedor || '').toLowerCase().includes(q))) return false }
    return true
  }), [rows, catF, busca])

  const total = lista.reduce((s, r) => s + n(r.valor), 0)
  const porCat = useMemo(() => {
    const m = {}; lista.forEach((r) => { m[r.categoria] = (m[r.categoria] || 0) + n(r.valor) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [lista])

  return (
    <div className="card" style={{ maxWidth: 1000 }}>
      <div className="between">
        <div>
          <h3>Contas fixas mensais</h3>
          <div className="sub">O que a loja paga todo mês (contas marcadas como recorrentes), com o dia de vencimento. Marque uma conta como fixa na tela de Pagamentos para ela aparecer aqui.</div>
        </div>
      </div>

      <div className="grid cols-3" style={{ margin: '14px 0' }}>
        <div className="card kpi"><div className="label">Total fixo mensal</div><div className="value">{brl(total)}</div></div>
        <div className="card kpi"><div className="label">Contas fixas</div><div className="value">{lista.length}</div></div>
        <div className="card kpi"><div className="label">Maior categoria</div><div className="value" style={{ fontSize: 16 }}>{porCat[0] ? `${labelCat(porCat[0][0])} · ${brl(porCat[0][1])}` : '—'}</div></div>
      </div>

      <div className="tools" style={{ gap: 10, marginBottom: 12 }}>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar conta / fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <select className="input" style={{ width: 170 }} value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="todas">Todas as categorias</option>{cats.map((c) => <option key={c} value={c}>{labelCat(c)}</option>)}
        </select>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th style={{ width: 70 }}>Dia</th><th>Conta</th><th>Categoria</th><th>Fornecedor</th><th className="num">Valor/mês</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="5" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="5" className="empty">Nenhuma conta fixa. Marque contas como recorrentes em Pagamentos.</td></tr>}
            {lista.map((r, i) => (
              <tr key={i}>
                <td><span className="badge neutral">dia {r.dia_vencimento || '—'}</span></td>
                <td><b>{r.descricao || '—'}</b></td>
                <td>{labelCat(r.categoria)}</td>
                <td className="muted">{r.fornecedor || '—'}</td>
                <td className="num">{brl(r.valor)}</td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && <tfoot><tr><td colSpan="4"><b>TOTAL MENSAL</b></td><td className="num"><b>{brl(total)}</b></td></tr></tfoot>}
        </table>
      </div>
    </div>
  )
}
