import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { IcoReport } from '../components/Icons.jsx'

const CAT_LABEL = {
  fixos: 'Fixos', impostos: 'Impostos', salarios: 'Salários', pro_labore: 'Pró-labore',
  operacional: 'Operacional', marketing: 'Marketing', outros: 'Outros',
}
const labelCat = (c) => CAT_LABEL[c] || c || '(sem categoria)'

// Primeiro dia do mês atual e hoje, como padrão do período
const inicioMes = () => { const t = today(); return t.slice(0, 8) + '01' }

const RELATORIOS = [
  { id: 'pag_categoria', txt: 'Pagamentos por categoria', dim: (r) => labelCat(r.categoria), col: 'Categoria' },
  { id: 'pag_forma', txt: 'Pagamentos por forma de pagamento', dim: (r) => r.forma_pagamento || '(não informada)', col: 'Forma de pagamento' },
  { id: 'pag_fornecedor', txt: 'Pagamentos por fornecedor', dim: (r) => r.fornecedor || '(sem fornecedor)', col: 'Fornecedor' },
]

export default function Relatorios() {
  const [de, setDe] = useState(inicioMes())
  const [ate, setAte] = useState(today())
  const [tipo, setTipo] = useState('pag_categoria')
  const [status, setStatus] = useState('Pago')
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    setLoading(true); setErro('')
    let q = supabase.from('pagamentos').select('data, descricao, fornecedor, categoria, valor, data_vencimento, forma_pagamento, status')
      .gte('data', de).lte('data', ate).order('data', { ascending: true }).limit(5000)
    if (status !== 'Todos') q = q.eq('status', status)
    const { data, error } = await q
    if (error) { setErro('Erro ao carregar: ' + error.message); setLinhas([]) }
    else setLinhas(data || [])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  const rel = RELATORIOS.find((r) => r.id === tipo) || RELATORIOS[0]

  const { grupos, totalGeral, totalQtd } = useMemo(() => {
    const map = new Map()
    let tg = 0
    for (const r of linhas) {
      const k = rel.dim(r)
      const g = map.get(k) || { chave: k, qtd: 0, total: 0 }
      g.qtd += 1; g.total += Number(r.valor) || 0
      map.set(k, g)
      tg += Number(r.valor) || 0
    }
    const arr = [...map.values()].sort((a, b) => b.total - a.total)
    return { grupos: arr, totalGeral: tg, totalQtd: linhas.length }
  }, [linhas, tipo])

  const exportarCSV = () => {
    const head = [rel.col, 'Qtde', 'Total (R$)', '% do total']
    const linhasCsv = grupos.map((g) => [g.chave, g.qtd, g.total.toFixed(2).replace('.', ','),
      (totalGeral ? (100 * g.total / totalGeral) : 0).toFixed(1).replace('.', ',') + '%'])
    linhasCsv.push(['TOTAL', totalQtd, totalGeral.toFixed(2).replace('.', ','), '100%'])
    const csv = [head, ...linhasCsv].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `relatorio_${tipo}_${de}_a_${ate}.csv`
    a.click()
  }

  const imprimir = () => {
    const rowsHtml = grupos.map((g) => `<tr><td>${esc(g.chave)}</td><td style="text-align:center">${g.qtd}</td>
      <td style="text-align:right">${brl(g.total)}</td><td style="text-align:right">${totalGeral ? (100 * g.total / totalGeral).toFixed(1) : '0.0'}%</td></tr>`).join('')
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${rel.txt}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;font-size:12px;padding:24px}
      h1{font-size:16px;margin:0 0 2px} .sub{color:#666;font-size:11px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:6px 8px}
      th{background:#1f3a5f;color:#fff;font-size:11px;text-transform:uppercase}
      tr:nth-child(even) td{background:#eff3f8} tfoot td{font-weight:bold;background:#d9e1ec}
      .cab{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px}</style></head><body>
      <div class="cab"><div><h1>LE BLANC — ${esc(rel.txt)}</h1>
      <div class="sub">Período: ${fmtDate(de)} a ${fmtDate(ate)} · Status: ${esc(status)}</div></div>
      <div class="sub">Gerado em ${fmtDate(today())}</div></div>
      <table><thead><tr><th>${esc(rel.col)}</th><th>Qtde</th><th>Total</th><th>% do total</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td>TOTAL</td><td style="text-align:center">${totalQtd}</td><td style="text-align:right">${brl(totalGeral)}</td><td style="text-align:right">100%</td></tr></tfoot>
      </table>
      <div class="noprint" style="margin-top:18px;text-align:center"><button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer">Imprimir / Salvar PDF</button></div>
      </body></html>`
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
  }

  const maxTotal = grupos.reduce((m, g) => Math.max(m, g.total), 0) || 1

  return (
    <div className="card" style={{ maxWidth: 1000 }}>
      <div className="between">
        <div>
          <h3>Relatórios</h3>
          <div className="sub">Escolha o período e o tipo de relatório. Exporte em CSV ou gere um PDF para impressão.</div>
        </div>
        <div className="tools">
          <button className="btn ghost" onClick={exportarCSV} disabled={!grupos.length}>Exportar CSV</button>
          <button className="btn" onClick={imprimir} disabled={!grupos.length}><IcoReport /> Imprimir / PDF</button>
        </div>
      </div>

      <div className="row-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, margin: '14px 0' }}>
        <div className="field" style={{ margin: 0 }}><label>Tipo de relatório</label>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>{RELATORIOS.map((r) => <option key={r.id} value={r.id}>{r.txt}</option>)}</select></div>
        <div className="field" style={{ margin: 0 }}><label>De</label><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Até</label><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option>Pago</option><option>Pendente</option><option>Todos</option></select></div>
      </div>
      <div style={{ marginBottom: 14 }}><button className="btn" onClick={carregar} disabled={loading}>{loading ? 'Gerando…' : 'Gerar relatório'}</button></div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Total {status === 'Todos' ? 'no período' : status.toLowerCase()}</div><div className="value">{brl(totalGeral)}</div></div>
        <div className="card kpi"><div className="label">Lançamentos</div><div className="value">{totalQtd}</div></div>
        <div className="card kpi"><div className="label">Período</div><div className="value" style={{ fontSize: 15 }}>{fmtDate(de)} — {fmtDate(ate)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>{rel.col}</th><th className="num">Qtde</th><th className="num">Total</th><th style={{ width: 220 }}>% do total</th></tr></thead>
          <tbody>
            {grupos.map((g) => {
              const pct = totalGeral ? (100 * g.total / totalGeral) : 0
              return (
                <tr key={g.chave}>
                  <td>{g.chave}</td>
                  <td className="num">{g.qtd}</td>
                  <td className="num">{brl(g.total)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${(g.total / maxTotal) * 100}%`, height: '100%', background: 'var(--brand, #1f3a5f)' }} />
                      </div>
                      <span className="mono" style={{ fontSize: 12, width: 46, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!grupos.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 24 }}>{loading ? 'Gerando…' : 'Sem lançamentos no período. Ajuste o filtro e clique em Gerar relatório.'}</td></tr>}
          </tbody>
          {grupos.length > 0 && (
            <tfoot><tr><td><b>TOTAL</b></td><td className="num"><b>{totalQtd}</b></td><td className="num"><b>{brl(totalGeral)}</b></td><td><b>100%</b></td></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) }
