import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import { IcoSearch } from '../components/Icons.jsx'

export default function Gratificacao() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const { data, error } = await supabase.from('gratificacao').select('*').order('mes_referencia', { ascending: false }).limit(1000)
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [])

  const togglePago = async (r) => {
    const novo = r.status_pagamento === 'Pago' ? 'Pendente' : 'Pago'
    await supabase.from('gratificacao').update({ status_pagamento: novo }).eq('id', r.id)
    await registrarLog({ tabela: 'gratificacao', registroId: r.id, acao: 'edicao', descricao: `Gratificação ${r.vendedor}: ${novo}` })
    carregar()
  }

  const lista = (rows || []).filter((r) => {
    if (busca && !((r.vendedor || '').toLowerCase().includes(busca.toLowerCase()) || (r.cliente_referencia || '').toLowerCase().includes(busca.toLowerCase()))) return false
    if (filtro === 'pendentes') return r.status_pagamento !== 'Pago'
    if (filtro === 'pagos') return r.status_pagamento === 'Pago'
    return true
  })
  const totalPend = (rows || []).filter(r => r.status_pagamento !== 'Pago').reduce((s, r) => s + (Number(r.valor_gratificacao) || 0), 0)

  return (
    <>
      <div className="section-head">
        <div className="tools">
          <select className="input" style={{ width: 150 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todos">Todas</option><option value="pendentes">Pendentes</option><option value="pagos">Pagas</option>
          </select>
          <div className="search"><IcoSearch /><input className="input" placeholder="Buscar vendedor / cliente" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        </div>
        <span className="pill">Pendente: {brl(totalPend)}</span>
      </div>
      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vendedor</th><th>Cliente ref.</th><th>Mês</th><th className="num">Valor vendido</th><th className="num">Alíquota</th><th className="num">Gratificação</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="8" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="8" className="empty">Nenhuma gratificação.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.vendedor || '—'}</td>
                <td className="muted">{r.cliente_referencia || '—'}</td>
                <td className="muted">{r.mes_referencia || '—'}</td>
                <td className="num">{brl(r.valor_vendido)}</td>
                <td className="num muted">{r.aliquota_final != null ? Number(r.aliquota_final).toFixed(2) + '%' : '—'}</td>
                <td className="num" style={{ fontWeight: 500 }}>{brl(r.valor_gratificacao)}</td>
                <td>{r.status_pagamento === 'Pago' ? <span className="badge ok">Pago</span> : <span className="badge warn">Pendente</span>}</td>
                <td className="right"><button className="btn ghost sm" onClick={() => togglePago(r)}>{r.status_pagamento === 'Pago' ? 'Reabrir' : 'Marcar pago'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
