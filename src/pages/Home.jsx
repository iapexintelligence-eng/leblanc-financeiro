import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'

export default function Home() {
  const [d, setD] = useState(null)

  useEffect(() => {
    (async () => {
      const [vendas, receber, contas] = await Promise.all([
        supabase.from('vendas').select('*').order('data_venda', { ascending: false }).limit(500),
        supabase.from('a_receber').select('valor_parcela, data_prevista, status').limit(2000),
        supabase.from('contas_bancarias').select('saldo, ativo'),
      ])
      setD({
        vendas: vendas.data || [],
        receber: receber.data || [],
        contas: contas.data || [],
        erro: vendas.error?.message || receber.error?.message || contas.error?.message || null,
      })
    })()
  }, [])

  if (!d) return <div className="spinner-wrap">Carregando painel…</div>
  if (d.erro) return <div className="login-err">Erro ao carregar dados: {d.erro}</div>

  const mesAtual = today().slice(0, 7)
  const vendasMes = d.vendas.filter((v) => (v.data_venda || '').slice(0, 7) === mesAtual)
  const totalVendasMes = vendasMes.reduce((s, v) => s + (Number(v.valor_vendido) || 0), 0)
  const saldoTotal = d.contas.reduce((s, c) => s + (Number(c.saldo) || 0), 0)
  const aberto = d.receber.filter((r) => r.status !== 'Recebido')
  const totalAberto = aberto.reduce((s, r) => s + (Number(r.valor_parcela) || 0), 0)
  const vencidos = aberto.filter((r) => r.data_prevista && r.data_prevista < today())
  const totalVencido = vencidos.reduce((s, r) => s + (Number(r.valor_parcela) || 0), 0)

  // Vendas por vendedor (mês)
  const porVendedor = {}
  vendasMes.forEach((v) => {
    const k = v.vendedor || '— sem vendedor —'
    porVendedor[k] = (porVendedor[k] || 0) + (Number(v.valor_vendido) || 0)
  })
  const ranking = Object.entries(porVendedor).sort((a, b) => b[1] - a[1])

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 22 }}>
        <div className="card kpi"><div className="label">Saldo em caixa</div><div className="value">{brl(saldoTotal)}</div><div className="delta">{d.contas.filter(c=>c.ativo).length} conta(s) ativa(s)</div></div>
        <div className="card kpi"><div className="label">Vendas do mês</div><div className="value">{brl(totalVendasMes)}</div><div className="delta">{vendasMes.length} venda(s)</div></div>
        <div className="card kpi"><div className="label">A receber (aberto)</div><div className="value">{brl(totalAberto)}</div><div className="delta">{aberto.length} boleto(s)</div></div>
        <div className="card kpi"><div className="label">Vencidos</div><div className="value" style={{ color: totalVencido ? 'var(--danger)' : 'inherit' }}>{brl(totalVencido)}</div><div className="delta">{vencidos.length} em atraso</div></div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Últimas vendas</h3>
          <div className="sub">Registros mais recentes</div>
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table>
              <thead><tr><th>Cliente</th><th>Vendedor</th><th className="num">Valor</th><th>Data</th></tr></thead>
              <tbody>
                {d.vendas.slice(0, 8).map((v) => (
                  <tr key={v.id}>
                    <td>{v.cliente_nome}</td>
                    <td className="muted">{v.vendedor || '—'}</td>
                    <td className="num">{v.valor_vendido ? brl(v.valor_vendido) : '—'}</td>
                    <td className="muted">{fmtDate(v.data_venda)}</td>
                  </tr>
                ))}
                {d.vendas.length === 0 && <tr><td colSpan="4" className="empty">Sem vendas.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Vendas por vendedor · {mesAtual.split('-').reverse().join('/')}</h3>
          <div className="sub">Desempenho no mês corrente</div>
          {ranking.length === 0 ? <div className="empty">Sem vendas no mês.</div> : (
            <div className="stack" style={{ gap: 14 }}>
              {ranking.map(([nome, val]) => {
                const pct = Math.round((val / (ranking[0][1] || 1)) * 100)
                return (
                  <div key={nome}>
                    <div className="between" style={{ marginBottom: 5 }}>
                      <span>{nome}</span><span className="mono">{brl(val)}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 6 }}>
                      <div style={{ width: pct + '%', height: '100%', background: 'var(--ink)', borderRadius: 6 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
