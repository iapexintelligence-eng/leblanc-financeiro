import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => { const [a, m] = ym.split('-'); return `${MESES_PT[Number(m) - 1]}/${a.slice(2)}` }
const CAT_LABEL = { fixos: 'Fixos', impostos: 'Impostos', salarios: 'Salários', pro_labore: 'Pró-labore', operacional: 'Operacional', marketing: 'Marketing', industria: 'Indústria', montagem: 'Montagem', frete: 'Frete', rafex: 'RAFEX', perfar: 'Perfar', vidracaria: 'Vidraçaria', metalon: 'Metalon', rudegon: 'Rudegon', assistencia: 'Assistência', outros: 'Outros' }
const labelCat = (c) => CAT_LABEL[c] || c || '—'
const CATS = ['industria', 'montagem', 'frete', 'rafex', 'perfar', 'vidracaria', 'metalon', 'rudegon', 'assistencia', 'operacional', 'fixos', 'salarios', 'pro_labore', 'marketing', 'impostos', 'outros']
const normForn = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

export default function Saidas() {
  const [rows, setRows] = useState(null)
  const [custos, setCustos] = useState([])
  const [projetos, setProjetos] = useState([])
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [mesF, setMesF] = useState('todos')
  const [catF, setCatF] = useState('todas')
  const [fornF, setFornF] = useState('todos')
  const [aberto, setAberto] = useState(null)

  useEffect(() => {
    (async () => {
      const [pag, cus, prj] = await Promise.all([
        supabase.from('pagamentos').select('id, data, data_vencimento, categoria, fornecedor, descricao, valor, status, forma_pagamento, projeto_uid').order('data', { ascending: false }).limit(5000),
        supabase.from('custos_operacionais').select('data, categoria, fornecedor, descricao, valor, projeto_uid').limit(5000),
        supabase.from('projetos').select('projeto_uid, cliente_nome').order('created_at', { ascending: false }).limit(2000),
      ])
      if (pag.error) setErro(pag.error.message)
      const norm = (pag.data || []).map((p) => ({
        id: p.id, data: p.data || p.data_vencimento, categoria: p.categoria || 'outros',
        fornecedor: p.fornecedor || '—', descricao: p.descricao || '', projeto_uid: p.projeto_uid || '',
        valor: n(p.valor), status: p.status || '—',
      }))
      norm.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      setRows(norm); setCustos(cus.data || []); setProjetos(prj.data || [])
    })()
  }, [])

  const custosByForn = useMemo(() => {
    const m = {}
    for (const c of custos) {
      const k = normForn(c.fornecedor)
      if (!m[k]) m[k] = []
      // evita duplicatas de digitação (mesma data + descrição + valor)
      const dup = m[k].some((x) => x.data === c.data && (x.descricao || '') === (c.descricao || '') && n(x.valor) === n(c.valor))
      if (!dup) m[k].push(c)
    }
    return m
  }, [custos])
  const clienteDe = useMemo(() => Object.fromEntries(projetos.map((p) => [p.projeto_uid, p.cliente_nome])), [projetos])

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
    setErro(''); setRows((s) => s.map((x) => x.id === id ? { ...x, categoria } : x))
    const { error } = await supabase.from('pagamentos').update({ categoria }).eq('id', id)
    if (error) setErro('Não consegui salvar a categoria: ' + error.message)
  }
  const salvarDescricao = async (id, descricao) => {
    setErro(''); setRows((s) => s.map((x) => x.id === id ? { ...x, descricao } : x))
    const { error } = await supabase.from('pagamentos').update({ descricao }).eq('id', id)
    if (error) setErro('Não consegui salvar a descrição: ' + error.message)
  }
  const mudarContrato = async (id, projeto_uid) => {
    setErro(''); setRows((s) => s.map((x) => x.id === id ? { ...x, projeto_uid } : x))
    const { error } = await supabase.from('pagamentos').update({ projeto_uid: projeto_uid || null }).eq('id', id)
    if (error) setErro('Não consegui salvar o contrato: ' + error.message)
  }

  const total = lista.reduce((s, r) => s + r.valor, 0)
  const pago = lista.filter((r) => r.status === 'Pago').reduce((s, r) => s + r.valor, 0)
  const pendente = Math.max(0, total - pago)

  const exportarCSV = () => {
    const head = ['Data', 'Categoria', 'Fornecedor', 'Descrição', 'Contrato', 'Valor', 'Status']
    const body = lista.map((r) => [fmtDate(r.data), labelCat(r.categoria), r.fornecedor, r.descricao, r.projeto_uid, r.valor.toFixed(2).replace('.', ','), r.status])
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `saidas_${mesF}.csv`; a.click()
  }

  return (
    <div className="card" style={{ maxWidth: 1200 }}>
      <div className="between">
        <div>
          <h3>Saídas</h3>
          <div className="sub">Pagamentos realizados. Edite a categoria, a descrição e o contrato na própria linha. Clique em ▸ para ver os pedidos daquele fornecedor.</div>
        </div>
        <div className="tools"><button className="btn ghost" onClick={exportarCSV} disabled={!lista.length}>Exportar CSV</button></div>
      </div>

      <div className="tools" style={{ gap: 10, margin: '14px 0', flexWrap: 'wrap' }}>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar fornecedor / categoria" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <select className="input" style={{ width: 140 }} value={mesF} onChange={(e) => setMesF(e.target.value)}>
          <option value="todos">Todos os meses</option>{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="todas">Todas as categorias</option>{cats.map((c) => <option key={c} value={c}>{labelCat(c)}</option>)}
        </select>
        <select className="input" style={{ width: 170 }} value={fornF} onChange={(e) => setFornF(e.target.value)}>
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
          <thead><tr><th style={{ width: 22 }}></th><th>Data</th><th>Categoria</th><th>Fornecedor</th><th>Descrição (o que é)</th><th>Contrato</th><th className="num">Valor</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="8" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="8" className="empty">Nenhuma saída neste filtro.</td></tr>}
            {lista.map((r) => {
              const pedidos = custosByForn[normForn(r.fornecedor)] || []
              const exp = aberto === r.id
              return (
                <>
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center', color: 'var(--ink-faint)', cursor: pedidos.length ? 'pointer' : 'default' }} onClick={() => pedidos.length && setAberto(exp ? null : r.id)}>{pedidos.length ? (exp ? '▾' : '▸') : ''}</td>
                    <td className="muted">{fmtDate(r.data)}</td>
                    <td><select className="input" style={{ height: 30, padding: '2px 6px', fontSize: 12.5, minWidth: 120 }} value={r.categoria} onChange={(e) => mudarCategoria(r.id, e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{labelCat(c)}</option>)}</select></td>
                    <td>{r.fornecedor}</td>
                    <td><input className="input" style={{ height: 30, padding: '2px 8px', fontSize: 12.5, minWidth: 180 }} defaultValue={r.descricao} placeholder="descreva…" onBlur={(e) => { if (e.target.value !== r.descricao) salvarDescricao(r.id, e.target.value) }} /></td>
                    <td><select className="input" style={{ height: 30, padding: '2px 6px', fontSize: 12, minWidth: 120 }} value={r.projeto_uid} onChange={(e) => mudarContrato(r.id, e.target.value)}><option value="">—</option>{projetos.map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.projeto_uid}</option>)}</select></td>
                    <td className="num">{brl(r.valor)}</td>
                    <td>{r.status === 'Pago' ? <span className="badge ok">Pago</span> : <span className="badge warn">{r.status}</span>}</td>
                  </tr>
                  {exp && (
                    <tr key={r.id + '-d'}>
                      <td></td>
                      <td colSpan="7" style={{ background: 'var(--surface)' }}>
                        <div className="sub" style={{ margin: '4px 0 6px' }}>Pedidos/itens de <b>{r.fornecedor}</b> (custos por projeto):</div>
                        <table style={{ marginBottom: 8 }}>
                          <thead><tr><th>Data</th><th>Categoria</th><th>Projeto / cliente</th><th>Descrição</th><th className="num">Valor</th></tr></thead>
                          <tbody>
                            {pedidos.map((c, i) => (
                              <tr key={i}>
                                <td className="muted">{fmtDate(c.data)}</td>
                                <td>{c.categoria || '—'}</td>
                                <td>{c.projeto_uid ? `${c.projeto_uid}${clienteDe[c.projeto_uid] ? ' · ' + clienteDe[c.projeto_uid] : ''}` : '—'}</td>
                                <td className="muted">{c.descricao || '—'}</td>
                                <td className="num">{brl(c.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot><tr><td colSpan="4"><b>Total dos pedidos</b></td><td className="num"><b>{brl(pedidos.reduce((s, c) => s + n(c.valor), 0))}</b></td></tr></tfoot>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
          {lista.length > 0 && <tfoot><tr><td colSpan="6"><b>TOTAL</b></td><td className="num"><b>{brl(total)}</b></td><td></td></tr></tfoot>}
        </table>
      </div>
    </div>
  )
}
