import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import Modal from '../components/Modal.jsx'
import { IcoEdit, IcoTrash } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const today = () => new Date().toISOString().slice(0, 10)
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => { if (!ym) return '—'; const [a, m] = ym.split('-'); return `${MESES_PT[Number(m) - 1]}/${a.slice(2)}` }
const FORMAS_RET = ['PIX', 'Dinheiro']
const CAT_LABEL = { pro_labore: 'Pró-labore', marketing: 'Marketing / RT' }

export default function ProLabore() {
  const [rows, setRows] = useState(null)
  const [tetos, setTetos] = useState([])
  const [retiradas, setRetiradas] = useState([])
  const [mesF, setMesF] = useState('')
  const [modal, setModal] = useState(null)
  const [modalRet, setModalRet] = useState(null)
  const [excluir, setExcluir] = useState(null) // retirada a confirmar
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const [m, t, p] = await Promise.all([
      supabase.from('vw_pro_labore_mes').select('*'),
      supabase.from('pro_labore_teto').select('*'),
      supabase.from('pagamentos').select('id,fornecedor,valor,data_pagamento,data_vencimento,forma_pagamento').eq('retirada', true).not('fornecedor', 'is', null),
    ])
    if (m.error) setErro(m.error.message)
    setRows(m.data || [])
    setTetos(t.data || [])
    setRetiradas(p.data || [])
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

  // Retiradas de cada sócio no mês (mesma regra da view: data do pagamento ou, sem ela, o vencimento).
  const datasDe = (r) => retiradas.map((p) => ({ ...p, data: p.data_pagamento || p.data_vencimento }))
    .filter((p) => (p.fornecedor || '').toLowerCase() === (r.socio || '').toLowerCase() && (p.data || '').slice(0, 7) === r.mes_referencia)
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''))
  const socios = useMemo(() => [...new Set((rows || []).map((r) => r.socio).filter(Boolean))].sort(), [rows])
  const abrirRetirada = (socio = '') => {
    setErro('')
    const d = (mesF && mesF !== 'todos') ? `${mesF}-05` : today()
    setModalRet({ socio, valor: '', data: d, forma: '' })
  }
  const salvarRetirada = async () => {
    setErro('')
    const f = modalRet
    if (!f.socio) { setErro('Escolha o sócio.'); return }
    if (f.valor === '' || Number(f.valor) <= 0) { setErro('Informe o valor da retirada.'); return }
    if (!f.forma) { setErro('Informe se foi PIX ou dinheiro.'); return }
    setSaving(true)
    const d = f.data || today()
    const { error } = await supabase.from('pagamentos').insert({
      descricao: `Pró-labore ${f.socio} - retirada`, categoria: 'pro_labore', fornecedor: f.socio,
      valor: Number(f.valor), data: d, data_vencimento: d, data_pagamento: d, status: 'Pago', forma_pagamento: f.forma,
      retirada: true, tipo: 'Eventual',
    })
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModalRet(null); carregar()
  }

  // Retiradas antigas sem a forma: dá para informar direto na linha.
  const mudarForma = async (p, forma) => {
    setErro('')
    const { error } = await supabase.from('pagamentos').update({ forma_pagamento: forma || null }).eq('id', p.id)
    if (error) { setErro(error.message); return }
    setRetiradas((lst) => lst.map((x) => x.id === p.id ? { ...x, forma_pagamento: forma || null } : x))
  }
  const confirmarExclusao = async () => {
    setErro(''); setSaving(true)
    // Mesmo cuidado da tela de Saídas: remove o rateio ligado ao pagamento antes do pagamento.
    await supabase.from('custos_operacionais').delete().eq('rateio_pagamento_id', excluir.id)
    const { error } = await supabase.from('pagamentos').delete().eq('id', excluir.id)
    setSaving(false)
    if (error) { setErro(error.message); return }
    setExcluir(null); carregar()
  }

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
    <div className="card" style={{ maxWidth: 1120 }}>
      <div className="between">
        <div>
          <h3>Pró-labore</h3>
          <div className="sub">Retiradas dos sócios por mês, comparadas ao teto definido. Restante negativo = retirou acima do teto.</div>
        </div>
        <div className="tools" style={{ gap: 8 }}>
          <select className="input" style={{ width: 150 }} value={mesF} onChange={(e) => setMesF(e.target.value)}>
            <option value="todos">Todos os meses</option>
            {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
          </select>
          <button className="btn" onClick={() => abrirRetirada('')}>+ Nova retirada</button>
        </div>
      </div>

      {erro && !modal && !excluir && <div className="login-err" style={{ margin: '12px 0' }}>{erro}</div>}

      <div className="grid cols-3" style={{ margin: '14px 0' }}>
        <div className="card kpi"><div className="label">Teto total</div><div className="value">{brl(kpi.teto)}</div></div>
        <div className="card kpi"><div className="label">Retirado</div><div className="value" style={{ color: 'var(--danger)' }}>{brl(kpi.retirado)}</div></div>
        <div className="card kpi"><div className="label">Restante</div><div className="value" style={{ color: kpi.restante < 0 ? 'var(--danger)' : 'var(--ok)' }}>{brl(kpi.restante)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Sócio</th><th>Categoria</th><th>Mês</th><th className="num">Teto</th><th>Data da retirada</th><th className="num">Retirado</th><th className="num">Restante</th><th style={{ width: 160 }}>Uso</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="9" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="9" className="empty">Sem registros.</td></tr>}
            {lista.map((r, i) => {
              const uso = n(r.teto) > 0 ? Math.min(100, 100 * n(r.retirado) / n(r.teto)) : (n(r.retirado) > 0 ? 100 : 0)
              const cor = n(r.restante) < 0 ? 'var(--danger)' : (uso >= 90 ? 'var(--warn)' : 'var(--ok)')
              return (
                <tr key={i}>
                  <td><b>{r.socio}</b></td>
                  <td>{CAT_LABEL[r.categoria] || r.categoria || '—'}</td>
                  <td className="muted">{rotuloMes(r.mes_referencia)}</td>
                  <td className="num">{n(r.teto) > 0 ? brl(r.teto) : <span className="faint">não definido</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{datasDe(r).length ? datasDe(r).map((p) => <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{fmtDate(p.data)}{datasDe(r).length > 1 && <span className="faint"> · {brl(p.valor)}</span>}<select aria-label={`Forma da retirada de ${fmtDate(p.data)}`} title="PIX ou dinheiro" value={FORMAS_RET.includes(p.forma_pagamento) ? p.forma_pagamento : ''} onChange={(e) => mudarForma(p, e.target.value)} style={{ font: 'inherit', fontSize: 12, padding: '2px 4px', borderRadius: 12, border: '1px solid ' + (FORMAS_RET.includes(p.forma_pagamento) ? 'var(--line-strong)' : 'var(--danger)'), background: p.forma_pagamento === 'Dinheiro' ? 'var(--warn-bg)' : p.forma_pagamento === 'PIX' ? 'var(--ok-bg)' : 'var(--danger-bg)', color: 'var(--ink)' }}><option value="">Forma?</option>{FORMAS_RET.map((f) => <option key={f} value={f}>{f}</option>)}</select><button className="icon-btn" style={{ width: 24, height: 24, padding: 3 }} title="Excluir esta retirada" aria-label={`Excluir retirada de ${fmtDate(p.data)}`} onClick={() => { setErro(''); setExcluir({ ...p, socio: r.socio }) }}><IcoTrash /></button></div>) : <span className="faint">—</span>}</td>
                  <td className="num">{brl(r.retirado)}</td>
                  <td className="num" style={{ color: n(r.restante) < 0 ? 'var(--danger)' : 'inherit', fontWeight: 600 }}>{brl(r.restante)}</td>
                  <td><div style={{ height: 8, background: 'var(--line)', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: uso + '%', height: '100%', background: cor }} /></div></td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}><button className="btn sm ghost" title="Lançar retirada deste sócio" onClick={() => abrirRetirada(r.socio)} style={{ marginRight: 4 }}>+ retirada</button><button className="icon-btn" title="Definir teto" onClick={() => editarTeto(r)}><IcoEdit /></button></td>
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

      {excluir && (
        <Modal title="Excluir retirada" onClose={() => !saving && setExcluir(null)}
          footer={<><button className="btn ghost" onClick={() => setExcluir(null)} disabled={saving}>Cancelar</button><button className="btn" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={confirmarExclusao} disabled={saving}>{saving ? 'Excluindo…' : 'Excluir retirada'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <p style={{ marginTop: 0 }}>Excluir a retirada de <b>{excluir.socio}</b> de <b>{fmtDate(excluir.data)}</b> no valor de <b>{brl(excluir.valor)}</b>?</p>
          <div className="sub">Ela sai do pró-labore e também da lista de pagamentos. Não dá para desfazer; se foi engano, lance de novo.</div>
        </Modal>
      )}

      {modalRet && (
        <Modal title="Nova retirada de pró-labore" onClose={() => setModalRet(null)}
          footer={<><button className="btn ghost" onClick={() => setModalRet(null)}>Cancelar</button><button className="btn" onClick={salvarRetirada} disabled={saving}>{saving ? 'Salvando…' : 'Salvar retirada'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <div className="sub" style={{ marginBottom: 12 }}>Lança a retirada do sócio como pagamento pago. Entra automaticamente no total retirado do mês.</div>
          <div className="field">
            <label>Sócio</label>
            <input className="input" list="socios-list" value={modalRet.socio} onChange={(e) => setModalRet((m) => ({ ...m, socio: e.target.value }))} placeholder="Nome do sócio" autoFocus />
            <datalist id="socios-list">{socios.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="field"><label>Valor da retirada (R$)</label><input className="input" type="number" step="0.01" value={modalRet.valor} onChange={(e) => setModalRet((m) => ({ ...m, valor: e.target.value }))} /></div>
          <div className="field"><label>Data</label><input className="input" type="date" value={modalRet.data} onChange={(e) => setModalRet((m) => ({ ...m, data: e.target.value }))} /></div>
          <div className="field"><label>Forma da retirada</label><div style={{ display: 'flex', gap: 8 }}>{FORMAS_RET.map((f) => <button key={f} type="button" className={'btn' + (modalRet.forma === f ? '' : ' ghost')} aria-pressed={modalRet.forma === f} onClick={() => setModalRet((m) => ({ ...m, forma: f }))}>{f}</button>)}</div></div>
        </Modal>
      )}
    </div>
  )
}
