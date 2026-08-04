import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

const CATEGORIAS = ['Indústria', 'Montagem', 'Frete', 'Material', 'Marketing', 'Aluguel', 'Água/Luz', 'Impostos', 'Manutenção', 'Serviços', 'Outros']
const FORMAS = ['PIX', 'Boleto', 'Transferência', 'Cartão', 'Dinheiro']
const STATUS = ['Pendente', 'Pago']

const novo = () => ({ data: today(), categoria: 'Material', fornecedor: '', descricao: '', valor: '', forma_pagamento: 'PIX', status: 'Pendente', projeto_uid: '', projeto_relacionado: '', montador: '', observacao: '' })

export default function Custos() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [projetos, setProjetos] = useState([])
  const [rateio, setRateio] = useState([])
  const addRateio = () => setRateio((s) => [...s, { projeto_uid: '', valor: '' }])
  const setRat = (i, k, v) => setRateio((s) => s.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const rmRateio = (i) => setRateio((s) => s.filter((_, j) => j !== i))
  const projOrd = () => [...projetos].sort((a, b) => (a.cliente_nome || '').localeCompare(b.cliente_nome || ''))

  const carregar = async () => {
    const { data, error } = await supabase.from('custos_operacionais').select('*').order('data', { ascending: false }).limit(1000)
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [])
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('projetos').select('projeto_uid, cliente_nome').order('created_at', { ascending: false }).limit(2000)
      setProjetos(data || [])
    })()
  }, [])

  const abrirNovo = () => { setRateio([]); setModal({ form: novo(), editId: null }) }
  const abrirEdit = (r) => { setRateio([]); setModal({ form: { data: r.data || today(), categoria: r.categoria || 'Material', fornecedor: r.fornecedor || '', descricao: r.descricao || '', valor: r.valor ?? '', forma_pagamento: r.forma_pagamento || 'PIX', status: r.status || 'Pendente', projeto_uid: r.projeto_uid || '', projeto_relacionado: r.projeto_relacionado || '', montador: r.montador || '', observacao: r.observacao || '' }, editId: r.id }) }
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const salvar = async () => {
    setErro(''); const f = modal.form
    if (!f.descricao.trim() && !f.fornecedor.trim()) { setErro('Informe ao menos fornecedor ou descrição.'); return }
    setSaving(true)
    const projLabel = f.projeto_uid ? (projetos.find((p) => p.projeto_uid === f.projeto_uid)?.cliente_nome || f.projeto_relacionado || null) : (f.projeto_relacionado || null)
    const payload = { data: f.data || today(), categoria: f.categoria, fornecedor: f.fornecedor || null, descricao: f.descricao || null, valor: f.valor === '' ? null : Number(f.valor), forma_pagamento: f.forma_pagamento || null, status: f.status, projeto_uid: f.projeto_uid || null, projeto_relacionado: projLabel, montador: f.montador || null, observacao: f.observacao || null }
    const linhasRateio = rateio.filter((x) => x.projeto_uid && Number(x.valor) > 0)
    let error
    if (modal.editId) { ({ error } = await supabase.from('custos_operacionais').update(payload).eq('id', modal.editId)); if (!error) await registrarLog({ tabela: 'custos_operacionais', registroId: modal.editId, acao: 'edicao', descricao: `Custo: ${payload.fornecedor || payload.descricao}` }) }
    else if (linhasRateio.length) {
      // ratear: cria um custo por contrato
      const novos = linhasRateio.map((x) => ({ ...payload, projeto_uid: x.projeto_uid, projeto_relacionado: projetos.find((p) => p.projeto_uid === x.projeto_uid)?.cliente_nome || null, valor: Number(x.valor) }))
      ;({ error } = await supabase.from('custos_operacionais').insert(novos))
    }
    else { ({ error } = await supabase.from('custos_operacionais').insert(payload)) }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const lista = (rows || []).filter((r) => !busca || (r.fornecedor || '').toLowerCase().includes(busca.toLowerCase()) || (r.descricao || '').toLowerCase().includes(busca.toLowerCase()) || (r.categoria || '').toLowerCase().includes(busca.toLowerCase()))
  const total = lista.reduce((s, r) => s + (Number(r.valor) || 0), 0)

  return (
    <>
      <div className="section-head">
        <div className="tools"><div className="search"><IcoSearch /><input className="input" placeholder="Buscar fornecedor / categoria" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Novo custo</button>
      </div>
      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="label">Total (filtro)</div><div className="value">{brl(total)}</div></div>
        <div className="card kpi"><div className="label">Lançamentos</div><div className="value">{lista.length}</div></div>
        <div className="card kpi"><div className="label">Pendentes</div><div className="value">{lista.filter(r=>r.status!=='Pago').length}</div></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Categoria</th><th>Fornecedor</th><th>Contrato</th><th className="num">Valor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="7" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="7" className="empty">Nenhum custo.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td className="muted">{fmtDate(r.data)}</td>
                <td><span className="badge neutral">{r.categoria || '—'}</span></td>
                <td>{r.fornecedor || '—'}</td>
                <td className="muted">{r.projeto_uid ? <span className="badge neutral">{r.projeto_uid}</span> : (r.projeto_relacionado || '—')}</td>
                <td className="num">{r.valor ? brl(r.valor) : '—'}</td>
                <td>{r.status === 'Pago' ? <span className="badge ok">Pago</span> : <span className="badge warn">Pendente</span>}</td>
                <td className="right"><button className="icon-btn" onClick={() => abrirEdit(r)}><IcoEdit /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title={modal.editId ? 'Editar custo' : 'Novo custo'} onClose={() => setModal(null)}
          footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="row-2">
            <div className="field"><label>Data</label><input className="input" type="date" value={modal.form.data} onChange={(e) => setF('data', e.target.value)} /></div>
            <div className="field"><label>Categoria</label><select className="input" value={modal.form.categoria} onChange={(e) => setF('categoria', e.target.value)}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="row-2">
            <div className="field"><label>Fornecedor</label><input className="input" value={modal.form.fornecedor} onChange={(e) => setF('fornecedor', e.target.value)} /></div>
            <div className="field"><label>Valor</label><input className="input" type="number" step="0.01" value={modal.form.valor} onChange={(e) => setF('valor', e.target.value)} /></div>
          </div>
          <div className="field"><label>Descrição</label><input className="input" value={modal.form.descricao} onChange={(e) => setF('descricao', e.target.value)} /></div>
          <div className="row-3">
            <div className="field"><label>Forma</label><select className="input" value={modal.form.forma_pagamento} onChange={(e) => setF('forma_pagamento', e.target.value)}>{FORMAS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Status</label><select className="input" value={modal.form.status} onChange={(e) => setF('status', e.target.value)}>{STATUS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Montador</label><input className="input" value={modal.form.montador} onChange={(e) => setF('montador', e.target.value)} placeholder="opcional" /></div>
          </div>
          {rateio.length === 0 && (
            <div className="field"><label>Contrato do cliente (para margem por contrato)</label>
              <select className="input" value={modal.form.projeto_uid} onChange={(e) => setF('projeto_uid', e.target.value)}>
                <option value="">— sem vínculo —</option>
                {projOrd().map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.cliente_nome || 's/ nome'} · {p.projeto_uid}</option>)}
              </select>
            </div>
          )}
          {!modal.editId && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div className="between">
                <b style={{ fontSize: 13 }}>Ratear entre vários contratos</b>
                <button className="btn ghost sm" type="button" onClick={addRateio}>+ Adicionar contrato</button>
              </div>
              <div className="sub" style={{ margin: '4px 0 8px' }}>Use quando um custo (ex.: indústria) é de vários contratos. Cria um custo por contrato. Se usar isto, o contrato único acima é ignorado.</div>
              {rateio.map((x, i) => (
                <div className="row-2" key={i} style={{ marginBottom: 6, alignItems: 'end' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <select className="input" value={x.projeto_uid} onChange={(e) => setRat(i, 'projeto_uid', e.target.value)}>
                      <option value="">— escolha o contrato —</option>
                      {projOrd().map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.cliente_nome || 's/ nome'} · {p.projeto_uid}</option>)}
                    </select>
                  </div>
                  <div className="flex" style={{ gap: 6 }}>
                    <input className="input" type="number" step="0.01" placeholder="valor" value={x.valor} onChange={(e) => setRat(i, 'valor', e.target.value)} />
                    <button className="icon-btn" type="button" onClick={() => rmRateio(i)}>×</button>
                  </div>
                </div>
              ))}
              {rateio.length > 0 && (() => { const soma = rateio.reduce((s, x) => s + (Number(x.valor) || 0), 0); const dif = (Number(modal.form.valor) || 0) - soma; return <div className="between" style={{ marginTop: 6, fontSize: 12.5 }}><span className="muted">Somado: <b>{brl(soma)}</b></span><span style={{ color: Math.abs(dif) > 0.5 ? 'var(--warn)' : 'var(--ok)' }}>{Math.abs(dif) > 0.5 ? `dif. ${brl(dif)} vs. valor` : 'bate com o valor ✓'}</span></div> })()}
            </div>
          )}
          <div className="field"><label>Observação</label><textarea className="input" value={modal.form.observacao} onChange={(e) => setF('observacao', e.target.value)} /></div>
        </Modal>
      )}
    </>
  )
}
