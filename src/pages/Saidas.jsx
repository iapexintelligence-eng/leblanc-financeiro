import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => { const [a, m] = ym.split('-'); return `${MESES_PT[Number(m) - 1]}/${a.slice(2)}` }

export default function Saidas() {
  const [rows, setRows] = useState(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [mesF, setMesF] = useState('')
  const [origemF, setOrigemF] = useState('todas')
  const [catF, setCatF] = useState('todas')

  useEffect(() => {
    (async () => {
      const [pag, cus] = await Promise.all([
        supabase.from('pagamentos').select('data, data_vencimento, categoria, fornecedor, descricao, valor, status, forma_pagamento').limit(5000),
        supabase.from('custos_operacionais').select('data, categoria, fornecedor, descricao, valor, status, forma_pagamento, projeto_uid').limit(5000),
      ])
      if (pag.error || cus.error) setErro((pag.error || cus.error).message)
      const norm = []
      for (const p of (pag.data || [])) norm.push({ origem: 'Pagamento', data: p.data || p.data_vencimento, categoria: p.categoria || '—', fornecedor: p.fornecedor || p.descricao || '—', projeto_uid: null, valor: n(p.valor), status: p.status || '—', forma: p.forma_pagamento || '' })
      for (const c of (cus.data || [])) norm.push({ origem: 'Custo', data: c.data, categoria: c.categoria || '—', fornecedor: c.fornecedor || c.descricao || '—', projeto_uid: c.projeto_uid || null, valor: n(c.valor), status: c.status || '—', forma: c.forma_pagamento || '' })
      norm.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      setRows(norm)
    })()
  }, [])

  const meses = useMemo(() => [...new Set((rows || []).map((r) => (r.data || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [rows])
  useEffect(() => { if (rows && mesF === '' && meses.length) setMesF(meses[0]) }, [rows, meses]) // eslint-disable-line
  const cats = useMemo(() => [...new Set((rows || []).map((r) => r.categoria).filter(Boolean))].sort(), [rows])

  const lista = useMemo(() => (rows || []).filter((r) => {
    if (mesF && mesF !== 'todos' && (r.data || '').slice(0, 7) !== mesF) return false
    if (origemF !== 'todas' && r.origem !== origemF) return false
    if (catF !== 'todas' && r.categoria !== catF) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.fornecedor || '').toLowerCase().includes(q) || (r.categoria || '').toLowerCase().includes(q) || (r.projeto_uid || '').toLowerCase().includes(q))) return false }
    return true
  }), [rows, mesF, origemF, catF, busca])

  const total = lista.reduce((s, r) => s + r.valor, 0)
  const pago = lista.filter((r) => r.status === 'Pago').reduce((s, r) => s + r.valor, 0)
  const pendente = Math.max(0, total - pago)

  const exportarCSV = () => {
    const head = ['Data', 'Origem', 'Categoria', 'Fornecedor/Descrição', 'Contrato', 'Valor', 'Status', 'Forma']
    const body = lista.map((r) => [fmtDate(r.data), r.origem, r.categoria, r.fornecedor, r.projeto_uid || '', r.valor.toFixed(2).replace('.', ','), r.status, r.forma])
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `saidas_${mesF || 'todos'}.csv`; a.click()
  }

  return (
    <div className="card" style={{ maxWidth: 1080 }}>
      <div className="between">
        <div>
          <h3>Saídas</h3>
          <div className="sub">Tudo que saiu do caixa — pagamentos e custos operacionais reunidos. Filtre por mês, origem e categoria.</div>
        </div>
        <div className="tools"><button className="btn ghost" onClick={exportarCSV} disabled={!lista.length}>Exportar CSV</button></div>
      </div>

      <div className="tools" style={{ gap: 10, margin: '14px 0' }}>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar fornecedor / categoria / contrato" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <select className="input" style={{ width: 150 }} value={mesF} onChange={(e) => setMesF(e.target.value)}>
          <option value="todos">Todos os meses</option>
          {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={origemF} onChange={(e) => setOrigemF(e.target.value)}>
          <option value="todas">Todas as origens</option><option>Pagamento</option><option>Custo</option>
        </select>
        <select className="input" style={{ width: 160 }} value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="todas">Todas as categorias</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Total de saídas</div><div className="value">{brl(total)}</div><div className="delta">{lista.length} lançamento(s)</div></div>
        <div className="card kpi"><div className="label">Pago</div><div className="value" style={{ color: 'var(--danger)' }}>{brl(pago)}</div></div>
        <div className="card kpi"><div className="label">Pendente</div><div className="value" style={{ color: 'var(--warn)' }}>{brl(pendente)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Origem</th><th>Categoria</th><th>Fornecedor / descrição</th><th>Contrato</th><th className="num">Valor</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="7" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="7" className="empty">Nenhuma saída neste filtro.</td></tr>}
            {lista.map((r, i) => (
              <tr key={i}>
                <td className="muted">{fmtDate(r.data)}</td>
                <td><span className={'badge ' + (r.origem === 'Custo' ? 'neutral' : 'warn')}>{r.origem}</span></td>
                <td>{r.categoria}</td>
                <td>{r.fornecedor}</td>
                <td className="muted">{r.projeto_uid || '—'}</td>
                <td className="num">{brl(r.valor)}</td>
                <td>{r.status === 'Pago' ? <span className="badge ok">Pago</span> : <span className="badge warn">{r.status}</span>}</td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && <tfoot><tr><td colSpan="5"><b>TOTAL</b></td><td className="num"><b>{brl(total)}</b></td><td></td></tr></tfoot>}
        </table>
      </div>
    </div>
  )
}
