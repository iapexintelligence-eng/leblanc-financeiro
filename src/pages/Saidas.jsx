import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => { const [a, m] = ym.split('-'); return `${MESES_PT[Number(m) - 1]}/${a.slice(2)}` }
const CAT_LABEL = { fixos: 'Fixos', impostos: 'Impostos', salarios: 'Salários', pro_labore: 'Pró-labore', operacional: 'Operacional', marketing: 'Marketing', industria: 'Indústria', montagem: 'Montagem', frete: 'Frete', rafex: 'RAFEX', perfar: 'Perfar', vidracaria: 'Vidraçaria', outros: 'Outros' }
const labelCat = (c) => CAT_LABEL[c] || c || '—'
// ordem das opções no seletor de categoria (edição inline)
const CATS = ['industria', 'montagem', 'frete', 'rafex', 'perfar', 'vidracaria', 'operacional', 'fixos', 'salarios', 'pro_labore', 'marketing', 'impostos', 'outros']

export default function Saidas() {
  const [rows, setRows] = useState(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [mesF, setMesF] = useState('todos')
  const [catF, setCatF] = useState('todas')
  const [fornF, setFornF] = useState('todos')

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('pagamentos')
        .select('id, data, data_vencimento, categoria, fornecedor, descricao, valor, status, forma_pagamento')
        .order('data', { ascending: false }).limit(5000)
      if (error) setErro(error.message)
      const norm = (data || []).map((p) => ({
        id: p.id, data: p.data || p.data_vencimento, categoria: p.categoria || 'outros',
        fornecedor: p.fornecedor || p.descricao || '—', descricao: p.descricao || '',
        valor: n(p.valor), status: p.status || '—', forma: p.forma_pagamento || '',
      }))
      norm.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      setRows(norm)
    })()
  }, [])

  const meses = useMemo(() => [...new Set((rows || []).map((r) => (r.data || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [rows])
  const cats = useMemo(() => [...new Set((rows || []).map((r) => r.categoria).filter(Boolean))].sort(), [rows])
  const fornecedores = useMemo(() => [...new Set((rows || []).map((r) => r.fornecedor).filter((x) => x && x !== '—'))].sort(), [rows])

  const lista = useMemo(() => (rows || []).filter((r) => {
    if (mesF !== 'todos' && (r.data || '').slice(0, 7) !== mesF) return false
    if (catF !== 'todas' && r.categoria !== catF) return false
    if (fornF !== 'todos' && r.fornecedor !== fornF) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.fornecedor || '').toLowerCase().includes(q) || labelCat(r.categoria).toLowerCase().includes(q) || (r.descricao || '').toLowerCase().includes(q))) return false }
    return true
  }), [rows, mesF, catF, fornF, busca])

  const mudarCategoria = async (id, categoria) => {
    setErro('')
    setRows((s) => s.map((x) => x.id === id ? { ...x, categoria } : x))
    const { error } = await supabase.from('pagamentos').update({ categoria }).eq('id', id)
    if (error) setErro('Não consegui salvar a categoria: ' + error.message)
  }

  const total = lista.reduce((s, r) => s + r.valor, 0)
  const pago = lista.filter((r) => r.status === 'Pago').reduce((s, r) => s + r.valor, 0)
  const pendente = Math.max(0, total - pago)

  const exportarCSV = () => {
    const head = ['Data', 'Categoria', 'Fornecedor/Descrição', 'Valor', 'Status', 'Forma']
    const body = lista.map((r) => [fmtDate(r.data), labelCat(r.categoria), r.fornecedor, r.valor.toFixed(2).replace('.', ','), r.status, r.forma])
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `saidas_${mesF}.csv`; a.click()
  }

  return (
    <div className="card" style={{ maxWidth: 1040 }}>
      <div className="between">
        <div>
          <h3>Saídas</h3>
          <div className="sub">Pagamentos realizados (o que saiu do caixa). Filtre por mês, categoria e indústria/fornecedor. Os custos por contrato ficam na aba Projetos.</div>
        </div>
        <div className="tools"><button className="btn ghost" onClick={exportarCSV} disabled={!lista.length}>Exportar CSV</button></div>
      </div>

      <div className="tools" style={{ gap: 10, margin: '14px 0', flexWrap: 'wrap' }}>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar fornecedor / categoria" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <select className="input" style={{ width: 150 }} value={mesF} onChange={(e) => setMesF(e.target.value)}>
          <option value="todos">Todos os meses</option>{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
        <select className="input" style={{ width: 160 }} value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="todas">Todas as categorias</option>{cats.map((c) => <option key={c} value={c}>{labelCat(c)}</option>)}
        </select>
        <select className="input" style={{ width: 180 }} value={fornF} onChange={(e) => setFornF(e.target.value)}>
          <option value="todos">Todas as indústrias/fornec.</option>{fornecedores.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Total de saídas</div><div className="value">{brl(total)}</div><div className="delta">{lista.length} lançamento(s)</div></div>
        <div className="card kpi"><div className="label">Pago</div><div className="value" style={{ color: 'var(--danger)' }}>{brl(pago)}</div></div>
        <div className="card kpi"><div className="label">Pendente</div><div className="value" style={{ color: pendente ? 'var(--warn)' : 'inherit' }}>{brl(pendente)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Categoria</th><th>Fornecedor / descrição</th><th className="num">Valor</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="5" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="5" className="empty">Nenhuma saída neste filtro.</td></tr>}
            {lista.map((r, i) => (
              <tr key={i}>
                <td className="muted">{fmtDate(r.data)}</td>
                <td><select className="input" style={{ height: 30, padding: '2px 6px', fontSize: 12.5, minWidth: 130 }} value={r.categoria} onChange={(e) => mudarCategoria(r.id, e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{labelCat(c)}</option>)}</select></td>
                <td>{r.fornecedor}</td>
                <td className="num">{brl(r.valor)}</td>
                <td>{r.status === 'Pago' ? <span className="badge ok">Pago</span> : <span className="badge warn">{r.status}</span>}</td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && <tfoot><tr><td colSpan="3"><b>TOTAL</b></td><td className="num"><b>{brl(total)}</b></td><td></td></tr></tfoot>}
        </table>
      </div>
    </div>
  )
}
