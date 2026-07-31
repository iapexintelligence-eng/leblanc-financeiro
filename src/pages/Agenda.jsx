import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const crm = supabase.schema('leblanc')
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const pad = (n) => String(n).padStart(2, '0')

export default function Agenda() {
  const hoje = new Date()
  const [ref, setRef] = useState({ y: hoje.getFullYear(), m: hoje.getMonth() })
  const [eventos, setEventos] = useState({})

  const carregar = async () => {
    const [fx, ct] = await Promise.all([
      crm.from('projeto_fluxo').select('contrato_id, correcao_agendamento, previsao_entrega'),
      crm.from('contratos').select('id, numero, cliente_nome'),
    ])
    const cmap = Object.fromEntries((ct.data || []).map((c) => [c.id, c]))
    const ev = {}
    const add = (d, tipo, label) => { const k = (d || '').slice(0, 10); if (k) (ev[k] = ev[k] || []).push({ tipo, label }) }
    ;(fx.data || []).forEach((f) => {
      const c = cmap[f.contrato_id] || {}
      add(f.correcao_agendamento, 'Medição', `📏 ${c.cliente_nome || '—'}`)
      add(f.previsao_entrega, 'Entrega/Montagem', `🔧 ${c.cliente_nome || '—'}`)
    })
    setEventos(ev)
  }
  useEffect(() => { carregar() }, [])

  const primeiroDia = new Date(ref.y, ref.m, 1).getDay()
  const diasNoMes = new Date(ref.y, ref.m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < primeiroDia; i++) cells.push(null)
  for (let d = 1; d <= diasNoMes; d++) cells.push(d)
  const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

  const nav = (delta) => setRef((r) => {
    let m = r.m + delta, y = r.y
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    return { y, m }
  })

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 16 }}>
        <h3>{MESES[ref.m]} {ref.y}</h3>
        <div className="tools">
          <button className="btn ghost sm" onClick={() => nav(-1)}>◀ Mês anterior</button>
          <button className="btn ghost sm" onClick={() => setRef({ y: hoje.getFullYear(), m: hoje.getMonth() })}>Hoje</button>
          <button className="btn ghost sm" onClick={() => nav(1)}>Próximo mês ▶</button>
        </div>
      </div>
      <div className="sub" style={{ marginBottom: 12 }}>Agendamentos de medição com o cliente (Correção). Montagens entram aqui na próxima fase.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {DIAS.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', padding: '4px 0' }}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const dateStr = `${ref.y}-${pad(ref.m + 1)}-${pad(d)}`
          const evs = eventos[dateStr] || []
          const isHoje = dateStr === hojeStr
          return (
            <div key={i} style={{ minHeight: 84, border: '1px solid var(--line)', borderRadius: 8, padding: 6, background: isHoje ? 'var(--surface-2)' : 'var(--paper)' }}>
              <div style={{ fontSize: 12, fontWeight: isHoje ? 600 : 400, color: isHoje ? 'var(--ink)' : 'var(--ink-soft)' }}>{d}</div>
              {evs.map((e, j) => (
                <div key={j} style={{ fontSize: 10.5, background: 'var(--ink)', color: '#fff', borderRadius: 5, padding: '2px 5px', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${e.tipo}: ${e.label}`}>{e.label}</div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
