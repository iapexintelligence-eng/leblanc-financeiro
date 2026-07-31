import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

const STATUS = ['Aberta', 'Em andamento', 'Concluída', 'Cancelada']

const novo = () => ({ cliente_nome: '', fornecedor_produto: '', valor_produto: '', montador: '', valor_mao_obra: '', data_assistencia: today(), descricao: '', status: 'Aberta', projeto_uid: '' })

export default function Assistencias() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const { data, error } = await supabase.from('assistencias').select('*').order('data_assistencia', { ascending: false }).limit(1000)
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [])

  const abrirNovo = () => setModal({ form: novo(), editId: null })
  const abrirEdit = (r) => setModal({ form: { cliente_nome: r.cliente_nome || '', fornecedor_produto: r.fornecedor_produto || '', valor_produto: r.valor_produto ?? '', montador: r.montador || '', valor_mao_obra: r.valor_mao_obra ?? '', data_assistencia: r.data_assistencia || today(), descricao: r.descricao || '', status: r.status || 'Aberta', projeto_uid: r.projeto_uid || '' }, editId: r.id })
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const salvar = async () => {
    setErro(''); const f = modal.form
    if (!f.cliente_nome.trim()) { setErro('Informe o cliente.'); return }
    setSaving(true)
    const vp = f.valor_produto === '' ? 0 : Number(f.valor_produto)
    const vm = f.valor_mao_obra === '' ? 0 : Number(f.valor_mao_obra)
    const payload = { cliente_nome: f.cliente_nome.trim(), fornecedor_produto: f.fornecedor_produto || null, valor_produto: vp, montador: f.montador || null, valor_mao_obra: vm, valor_total: vp + vm, data_assistencia: f.data_assistencia || today(), descricao: f.descricao || null, status: f.status, projeto_uid: f.projeto_uid || null }
    let error
    if (modal.editId) { ({ error } = await supabase.from('assistencias').update(payload).eq('id', modal.editId)); if (!error) await registrarLog({ tabela: 'assistencias', registroId: modal.editId, acao: 'edicao', descricao: `Assistência: ${payload.cliente_nome}` }) }
    else { ({ error } = await supabase.from('assistencias').insert(payload)) }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const badge = (s) => s === 'Concluída' ? 'ok' : s === 'Cancelada' ? 'neutral' : s === 'Em andamento' ? 'warn' : 'danger'
  const lista = (rows || []).filter((r) => !busca || (r.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.montador || '').toLowerCase().includes(busca.toLowerCase()))
  const totalAberto = (rows || []).filter(r => r.status !== 'Concluída' && r.status !== 'Cancelada').reduce((s, r) => s + (Number(r.valor_total) || 0), 0)

  return (
    <>
      <div className="section-head">
        <div className="tools"><div className="search"><IcoSearch /><input className="input" placeholder="Buscar cliente / montador" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Nova assistência</button>
      </div>
      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="label">Custo em aberto</div><div className="value">{brl(totalAberto)}</div></div>
        <div className="card kpi"><div className="label">Total registros</div><div className="value">{(rows || []).length}</div></div>
        <div className="card kpi"><div className="label">Abertas</div><div className="value">{(rows || []).filter(r => r.status === 'Aberta' || r.status === 'Em andamento').length}</div></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Produto/Fornecedor</th><th>Montador</th><th className="num">Total</th><th>Data</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="7" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="7" className="empty">Nenhuma assistência.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.cliente_nome}</td>
                <td className="muted">{r.fornecedor_produto || '—'}</td>
                <td className="muted">{r.montador || '—'}</td>
                <td className="num">{brl(r.valor_total)}</td>
                <td className="muted">{fmtDate(r.data_assistencia)}</td>
                <td><span className={'badge ' + badge(r.status)}>{r.status || '—'}</span></td>
                <td className="right"><button className="icon-btn" onClick={() => abrirEdit(r)}><IcoEdit /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title={modal.editId ? 'Editar assistência' : 'Nova assistência'} onClose={() => setModal(null)}
          footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field"><label>Cliente *</label><input className="input" value={modal.form.cliente_nome} onChange={(e) => setF('cliente_nome', e.target.value)} /></div>
          <div className="row-2">
            <div className="field"><label>Produto / Fornecedor</label><input className="input" value={modal.form.fornecedor_produto} onChange={(e) => setF('fornecedor_produto', e.target.value)} /></div>
            <div className="field"><label>Montador</label><input className="input" value={modal.form.montador} onChange={(e) => setF('montador', e.target.value)} /></div>
          </div>
          <div className="row-3">
            <div className="field"><label>Valor produto</label><input className="input" type="number" step="0.01" value={modal.form.valor_produto} onChange={(e) => setF('valor_produto', e.target.value)} /></div>
            <div className="field"><label>Mão de obra</label><input className="input" type="number" step="0.01" value={modal.form.valor_mao_obra} onChange={(e) => setF('valor_mao_obra', e.target.value)} /></div>
            <div className="field"><label>Data</label><input className="input" type="date" value={modal.form.data_assistencia} onChange={(e) => setF('data_assistencia', e.target.value)} /></div>
          </div>
          <div className="field"><label>Status</label><select className="input" value={modal.form.status} onChange={(e) => setF('status', e.target.value)}>{STATUS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label>Descrição</label><textarea className="input" value={modal.form.descricao} onChange={(e) => setF('descricao', e.target.value)} /></div>
          <div className="sub">Total automático: <b>{brl((Number(modal.form.valor_produto) || 0) + (Number(modal.form.valor_mao_obra) || 0))}</b></div>
        </Modal>
      )}
    </>
  )
}
