import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

const TIPOS = ['Vendedor', 'Administrativo', 'Montador', 'Gerência', 'Assistência', 'Outro']
const SETORES = ['Vendas', 'Administrativo', 'Financeiro', 'Montagem', 'Assistência Técnica', 'Diretoria']

const vazio = {
  nome_completo: '', cpf: '', cargo: '', tipo: 'Vendedor', setor: 'Vendas',
  salario_fixo: '', dia_pagamento: 5, data_admissao: '', ativo: true, observacoes: '',
}

export default function Funcionarios() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null) // {form, editId}
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const { data, error } = await supabase
      .from('funcionarios').select('*').order('ativo', { ascending: false }).order('nome_completo')
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [])

  const abrirNovo = () => setModal({ form: { ...vazio }, editId: null })
  const abrirEdit = (r) => setModal({
    form: {
      nome_completo: r.nome_completo || '', cpf: r.cpf || '', cargo: r.cargo || '',
      tipo: r.tipo || 'Vendedor', setor: r.setor || 'Vendas',
      salario_fixo: r.salario_fixo ?? '', dia_pagamento: r.dia_pagamento ?? 5,
      data_admissao: r.data_admissao || '', ativo: r.ativo ?? true, observacoes: r.observacoes || '',
    },
    editId: r.id,
  })

  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const salvar = async () => {
    setErro('')
    const f = modal.form
    if (!f.nome_completo.trim()) { setErro('Informe o nome completo.'); return }
    setSaving(true)
    const payload = {
      nome_completo: f.nome_completo.trim(),
      cpf: f.cpf || null, cargo: f.cargo || null, tipo: f.tipo, setor: f.setor,
      salario_fixo: f.salario_fixo === '' ? 0 : Number(f.salario_fixo),
      dia_pagamento: f.dia_pagamento ? Number(f.dia_pagamento) : null,
      data_admissao: f.data_admissao || null, ativo: !!f.ativo,
      observacoes: f.observacoes || null,
    }
    let error
    if (modal.editId) {
      ({ error } = await supabase.from('funcionarios').update(payload).eq('id', modal.editId))
    } else {
      ({ error } = await supabase.from('funcionarios').insert(payload))
    }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const lista = (rows || []).filter((r) =>
    !busca || (r.nome_completo || '').toLowerCase().includes(busca.toLowerCase()) ||
    (r.cargo || '').toLowerCase().includes(busca.toLowerCase()))

  return (
    <>
      <div className="section-head">
        <div className="tools">
          <div className="search">
            <IcoSearch />
            <input className="input" placeholder="Buscar por nome ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Novo funcionário</button>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>Tipo</th><th>Setor</th><th>Cargo</th>
              <th className="num">Salário fixo</th><th>Admissão</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan="8" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="8" className="empty">Nenhum funcionário cadastrado.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.nome_completo}</td>
                <td><span className="badge neutral">{r.tipo || '—'}</span></td>
                <td className="muted">{r.setor || '—'}</td>
                <td className="muted">{r.cargo || '—'}</td>
                <td className="num">{r.salario_fixo ? brl(r.salario_fixo) : '—'}</td>
                <td className="muted">{fmtDate(r.data_admissao)}</td>
                <td>{r.ativo ? <span className="badge ok">Ativo</span> : <span className="badge danger">Inativo</span>}</td>
                <td className="right"><button className="icon-btn" onClick={() => abrirEdit(r)}><IcoEdit /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.editId ? 'Editar funcionário' : 'Novo funcionário'}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </>}
        >
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field">
            <label>Nome completo *</label>
            <input className="input" value={modal.form.nome_completo} onChange={(e) => setF('nome_completo', e.target.value)} />
          </div>
          <div className="row-2">
            <div className="field">
              <label>Tipo</label>
              <select className="input" value={modal.form.tipo} onChange={(e) => setF('tipo', e.target.value)}>
                {TIPOS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Setor</label>
              <select className="input" value={modal.form.setor} onChange={(e) => setF('setor', e.target.value)}>
                {SETORES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="row-2">
            <div className="field"><label>Cargo</label>
              <input className="input" value={modal.form.cargo} onChange={(e) => setF('cargo', e.target.value)} /></div>
            <div className="field"><label>CPF</label>
              <input className="input" value={modal.form.cpf} onChange={(e) => setF('cpf', e.target.value)} /></div>
          </div>
          <div className="row-3">
            <div className="field"><label>Salário fixo</label>
              <input className="input" type="number" step="0.01" value={modal.form.salario_fixo} onChange={(e) => setF('salario_fixo', e.target.value)} /></div>
            <div className="field"><label>Dia pagamento</label>
              <input className="input" type="number" min="1" max="31" value={modal.form.dia_pagamento} onChange={(e) => setF('dia_pagamento', e.target.value)} /></div>
            <div className="field"><label>Admissão</label>
              <input className="input" type="date" value={modal.form.data_admissao} onChange={(e) => setF('data_admissao', e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Situação</label>
            <select className="input" value={modal.form.ativo ? '1' : '0'} onChange={(e) => setF('ativo', e.target.value === '1')}>
              <option value="1">Ativo</option><option value="0">Inativo</option>
            </select>
          </div>
          <div className="field">
            <label>Observações</label>
            <textarea className="input" value={modal.form.observacoes} onChange={(e) => setF('observacoes', e.target.value)} />
          </div>
        </Modal>
      )}
    </>
  )
}
