import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'

const mesLabel = (m) => { if (!m) return '—'; const s = String(m); const mm = s.match(/^(\d{4})-(\d{2})/); return mm ? `${mm[2]}/${mm[1]}` : s }

export default function Previsibilidade() {
  const [prev, setPrev] = useState(null)
  const [inad, setInad] = useState([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    (async () => {
      const [p, i] = await Promise.all([
        supabase.from('vw_previsao_caixa').select('*').order('mes', { ascending: true }).limit(12),
        supabase.from('vw_inadimplencia').select('*').order('dias_atraso', { ascending: false }).limit(100),
      ])
      if (p.error) setErro(p.error.message)
      setPrev(p.data || []); setInad(i.data || [])
    })()
  }, [])

  if (erro) return <div className="login-err">Erro: {erro}</div>
  if (!prev) return <div className="spinner-wrap">Carregando previsão…</div>

  const totalInad = inad.reduce((s, r) => s + (Number(r.valor_parcela) || 0), 0)

  return (
    <>
      <div className="card" style={{ marginBottom: 22 }}>
        <h3>Previsão de caixa</h3>
        <div className="sub">Entradas e saídas previstas por mês</div>
        <div className="table-wrap" style={{ boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Mês</th><th className="num">Entradas previstas</th><th className="num">Saídas previstas</th><th className="num">Saldo projetado</th></tr></thead>
            <tbody>
              {prev.length === 0 && <tr><td colSpan="4" className="empty">Sem previsão disponível.</td></tr>}
              {prev.map((r, i) => (
                <tr key={i}>
                  <td>{mesLabel(r.mes)}</td>
                  <td className="num" style={{ color: 'var(--ok)' }}>{brl(r.entradas_previstas)}</td>
                  <td className="num" style={{ color: 'var(--danger)' }}>{brl(r.saidas_previstas)}</td>
                  <td className="num" style={{ fontWeight: 500, color: (r.saldo_projetado || 0) < 0 ? 'var(--danger)' : 'inherit' }}>{brl(r.saldo_projetado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-head"><h2 style={{ fontFamily: 'var(--serif)', fontSize: 22 }}>Inadimplência</h2><span className="pill">Total em atraso: {brl(totalInad)}</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Descrição</th><th className="num">Valor</th><th>Vencimento</th><th className="num">Dias em atraso</th></tr></thead>
          <tbody>
            {inad.length === 0 && <tr><td colSpan="5" className="empty">Nenhum título em atraso. 🎉</td></tr>}
            {inad.map((r, i) => (
              <tr key={i}>
                <td>{r.cliente_nome}</td>
                <td className="muted">{r.descricao || '—'}</td>
                <td className="num">{brl(r.valor_parcela)}</td>
                <td className="muted">{fmtDate(r.data_prevista)}</td>
                <td className="num"><span className="badge danger">{r.dias_atraso} dias</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
