import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl } from '../lib/format.js'

const mesLabel = (m) => { if (!m) return '—'; const [y, mm] = String(m).split('-'); return mm ? `${mm}/${y}` : m }

export default function DRE() {
  const [dre, setDre] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('vw_dre_mensal').select('*').order('mes', { ascending: false }).limit(24)
      if (error) setErro(error.message)
      setDre(data || [])
    })()
  }, [])

  if (erro) return <div className="login-err">Erro ao carregar DRE: {erro}</div>
  if (!dre) return <div className="spinner-wrap">Carregando DRE…</div>

  const ult = dre[0]
  const totalResultado = dre.reduce((s, r) => s + (Number(r.resultado) || 0), 0)
  const totalReceita = dre.reduce((s, r) => s + (Number(r.receita) || 0), 0)

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 22 }}>
        <div className="card kpi"><div className="label">Receita (mês atual)</div><div className="value">{brl(ult?.receita)}</div></div>
        <div className="card kpi"><div className="label">Resultado (mês atual)</div><div className="value" style={{ color: (ult?.resultado || 0) < 0 ? 'var(--danger)' : 'var(--ok)' }}>{brl(ult?.resultado)}</div></div>
        <div className="card kpi"><div className="label">Margem (mês atual)</div><div className="value">{ult?.margem_pct != null ? Number(ult.margem_pct).toFixed(1) + '%' : '—'}</div></div>
        <div className="card kpi"><div className="label">Resultado acumulado</div><div className="value" style={{ color: totalResultado < 0 ? 'var(--danger)' : 'var(--ok)' }}>{brl(totalResultado)}</div><div className="delta">sobre {brl(totalReceita)} de receita</div></div>
      </div>
      <div className="card">
        <h3>Demonstrativo mensal (DRE)</h3>
        <div className="sub">Receita, custos, despesas e resultado por mês</div>
        <div className="table-wrap" style={{ boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Mês</th><th className="num">Receita</th><th className="num">Custo direto</th><th className="num">Despesas</th><th className="num">Resultado</th><th className="num">Margem</th></tr></thead>
            <tbody>
              {dre.length === 0 && <tr><td colSpan="6" className="empty">Sem dados de DRE.</td></tr>}
              {dre.map((r) => (
                <tr key={r.mes}>
                  <td>{mesLabel(r.mes)}</td>
                  <td className="num">{brl(r.receita)}</td>
                  <td className="num muted">{brl(r.custo_direto)}</td>
                  <td className="num muted">{brl(r.despesa)}</td>
                  <td className="num" style={{ color: (r.resultado || 0) < 0 ? 'var(--danger)' : 'var(--ok)', fontWeight: 500 }}>{brl(r.resultado)}</td>
                  <td className="num">{r.margem_pct != null ? Number(r.margem_pct).toFixed(1) + '%' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
