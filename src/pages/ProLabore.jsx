import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl } from '../lib/format.js'
import Modal from '../components/Modal.jsx'
import { IcoEdit } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => { if (!ym) return '—'; const [a, m] = ym.split('-'); return `${MESES_PT[Number(m) - 1]}/${a.slice(2)}` }
const CAT_LABEL = { pro_labore: 'Pró-labore', marketing: 'Marketing / RT' }

export default function ProLabore() {
  const [rows, setRows] = useState(null)
  const [tetos, setTetos] = useState([])
  const [mesF, setMesF] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const [m, t] = await Promise.all([
      supabase.from('vw_pro_labore_mes').select('*'),
      supabase.from('pro_labore_teto').select('*'),
    ])
    if (m.error) setErro(m.error.message)
    setRows(m.data || [])
    setTetos(t.data || [])
  }
  useEffect(() => { carregar() }, [])

  const meses = useMemo(() => [...new Set((rows || []).map((r) => r.mes_referencia).filter(Boolean))].sort().reverse(), [rows])
  useEffect(() => { if (rows && mesF === '' && meses.length) setMesF(meses[0]) }, [rows, meses]) // eslint-disable-line

  const lista = useMemo(() => (rows || []).filter((r) => !mesF || mesF === 'todos' || r.mes_referencia === mesF)
    .sort((a, b) => (a.socio || '').localeCompare(b.socio || '')), [rows, mesF])

  const kpi = useMemo(() => ({
    teto: lista.reduce((s, r) => s + n(r.teto), 0),
    retirado: lista.reduce((s, r) => s + n(r.retirado), 0),
    restante: lista.reduce((s, r) => s + n(r.restante), 0),
  }), [lista])

  const editarTeto = (r) => {
    const existente = tetos.find((t) => t.socio === r.socio && t.mes_referencia === r.mes_referencia && (t.categoria || 'pro_labore') === (r.categoria || 'pro_labore'))
    setErro(''); setModal({ socio: r.socio, mes_referencia: r.mes_referencia, categoria: r.categoria || 'pro_labore', valor: existente ? String(existente.valor) : '', id: existente?.id || null })
  }
  const salvarTeto = async () => {
    setErro(''); setSaving(true)
    const payload = { socio: modal.socio, mes_referencia: modal.mes_referencia, categoria: modal.categoria, valor: modal.valor === '' ? 0 : Number(modal.valor) }
    let error
    if (modal.id) ({ error } = await supabase.from('pro_labore_teto').update(payload).eq('id', modal.id))
    else ({ error } = await supabase.from('pro_labore_teto').insert(payload))
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  return (
    <div className="card" style={{ maxWidth: 1000 }}>
      <div className="between">
        <div>
          <h3>Pró-labore</h3>
          <div className="sub">Retiradas dos sócios por mês, comparadas ao teto definido. Restante negativo = retirou acima do teto.</div>
        </div>
        <select className="input" style={{ width: 160 }} value={mesF} onChange={(e) => setMesF(e.target.value)}>
          <option value="todos">Todos os meses</option>
          {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
      </div>

      {erro && !modal && <div className="login-err" style={{ margin: '12px 0' }}>{erro}</div>}

      <div className="grid cols-3" style={{ margin: '14px 0' }}>
        <div className="card kpi"><div className="label">Teto total</div><div className="value">{brl(kpi.teto)}</div></div>
        <div className="card kpi"><div className="label">Retirado</div><div className="value" style={{ color: 'var(--danger)' }}>{brl(kpi.retirado)}</div></div>
        <div className="card kpi"><div className="label">Restante</div><div className="value" style={{ color: kpi.restante < 0 ? 'var(--danger)' : 'var(--ok)' }}>{brl(kpi.restante)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Sócio</th><th>Categoria</th><th>Mês</th><th className="num">Teto</th><th className="num">Retirado</th><th className="num">Restante</th><th style={{ width: 160 }}>Uso</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="8" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="8" className="empty">Sem registros.</td></tr>}
            {lista.map((r, i) => {
              const uso = n(r.teto) > 0 ? Math.min(100, 100 * n(r.retirado) / n(r.teto)) : (n(r.retirado) > 0 ? 100 : 0)
              const cor = n(r.restante) < 0 ? 'var(--danger)' : (uso >= 90 ? 'var(--warn)' : 'var(--ok)')
              return (
                <tr key={i}>
                  <td><b>{r.socio}</b></td>
                  <td>{CAT_LABEL[r.categoria] || r.categoria || '—'}</td>
                  <td className="muted">{rotuloMes(r.mes_referencia)}</td>
                  <td className="num">{n(r.teto) > 0 ? brl(r.teto) : <span className="faint">não definido</span>}</td>
                  <td className="num">{brl(r.retirado)}</td>
                  <td className="num" style={{ color: n(r.restante) < 0 ? 'var(--danger)' : 'inherit', fontWeight: 600 }}>{brl(r.restante)}</td>
                  <td><div style={{ height: 8, background: 'var(--line)', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: uso + '%', height: '100%', background: cor }} /></div></td>
                  <td className="right"><button className="icon-btn" title="Definir teto" onClick={() => editarTeto(r)}><IcoEdit /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="Definir teto" onClose={() => setModal(null)}
          footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" onClick={salvarTeto} disabled={saving}>{saving ? 'Salvando…' : 'Salvar teto'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <div className="sub" style={{ marginBottom: 12 }}>{modal.socio} · {CAT_LABEL[modal.categoria] || modal.categoria} · {rotuloMes(modal.mes_referencia)}</div>
          <div className="field"><label>Teto (R$)</label><input className="input" type="number" step="0.01" value={modal.valor} onChange={(e) => setModal((m) => ({ ...m, valor: e.target.value }))} autoFocus /></div>
        </Modal>
      )}
    </div>
  )
}
