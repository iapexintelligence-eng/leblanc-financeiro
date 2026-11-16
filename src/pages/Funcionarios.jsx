import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

// valores aceitos pelo banco (funcionarios_tipo_check)
const TIPOS = [
  { v: 'vendedor', t: 'Vendedor' },
  { v: 'admin', t: 'Administrativo' },
  { v: 'montador', t: 'Montador' },
  { v: 'socia', t: 'Sócia / Diretoria' },
  { v: 'terceiro', t: 'Terceiro / Outro' },
]
const TIPO_LABEL = Object.fromEntries(TIPOS.map((x) => [x.v, x.t]))
const SETORES = ['Vendas', 'Administrativo', 'Financeiro', 'Montagem', 'Assistência Técnica', 'Diretoria']

const vazio = {
  nome_completo: '', cpf: '', cargo: '', tipo: 'vendedor', setor: 'Vendas',
  salario_fixo: '', dia_pagamento: 5, data_admissao: '', ativo: true, observacoes: '',
  vinculo: 'CLT', vt_total: '', va_total: '', ajuda_custo: '', adiantamento: '',
}
const num = (v) => (v === '' || v == null ? 0 : Number(v))
// O que sai por mês para a pessoa: CLT = salário + VT + VA; MEI = ajuda de custo fixa (comissão é à parte).
export const totalMensal = (r) => r.vinculo === 'MEI' ? num(r.ajuda_custo) : num(r.salario_fixo) + num(r.vt_total) + num(r.va_total)

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
      tipo: r.tipo || 'vendedor', setor: r.setor || 'Vendas',
      salario_fixo: r.salario_fixo ?? '', dia_pagamento: r.dia_pagamento ?? 5,
      data_admissao: r.data_admissao || '', ativo: r.ativo ?? true, observacoes: r.observacoes || '',
      vinculo: r.vinculo || 'CLT', vt_total: r.vt_total ?? '', va_total: r.va_total ?? '', ajuda_custo: r.ajuda_custo ?? '', adiantamento: r.adiantamento ?? '',
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
      vinculo: f.vinculo, vt_total: num(f.vt_total), va_total: num(f.va_total),
      ajuda_custo: num(f.ajuda_custo), adiantamento: num(f.adiantamento),
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
              <th>Vínculo</th><th className="num">Salário</th><th className="num">VT + VA</th><th className="num">Total/mês</th><th>Admissão</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan="11" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="11" className="empty">Nenhum funcionário cadastrado.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.nome_completo}</td>
                <td><span className="badge neutral">{TIPO_LABEL[r.tipo] || r.tipo || '—'}</span></td>
                <td className="muted">{r.setor || '—'}</td>
                <td className="muted">{r.cargo || '—'}</td>
                <td><span className="badge neutral">{r.vinculo === 'MEI' ? 'MEI/PJ' : 'CLT'}</span></td>
                <td className="num">{r.vinculo === 'MEI' ? (r.ajuda_custo ? <span title="Ajuda de custo">{brl(r.ajuda_custo)}</span> : '—') : (r.salario_fixo ? brl(r.salario_fixo) : '—')}</td>
                <td className="num">{r.vinculo === 'MEI' ? '—' : (num(r.vt_total) + num(r.va_total) ? brl(num(r.vt_total) + num(r.va_total)) : <span className="faint">preencher</span>)}</td>
                <td className="num"><b>{totalMensal(r) ? brl(totalMensal(r)) : '—'}</b></td>
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
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
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
          <div className="field">
            <label>Vínculo</label>
            <select className="input" value={modal.form.vinculo} onChange={(e) => setF('vinculo', e.target.value)}>
              <option value="CLT">CLT: salário + VT + VA no 5º dia útil</option>
              <option value="MEI">MEI / PJ: só ajuda de custo fixa (comissão lançada à parte)</option>
            </select>
          </div>
          {modal.form.vinculo === 'MEI' ? (
            <div className="field"><label>Ajuda de custo fixa por mês</label>
              <input className="input" type="number" step="0.01" value={modal.form.ajuda_custo} onChange={(e) => setF('ajuda_custo', e.target.value)} /></div>
          ) : (<>
            <div className="row-3">
              <div className="field"><label>VT por mês</label>
                <input className="input" type="number" step="0.01" value={modal.form.vt_total} onChange={(e) => setF('vt_total', e.target.value)} /></div>
              <div className="field"><label>VA por mês</label>
                <input className="input" type="number" step="0.01" value={modal.form.va_total} onChange={(e) => setF('va_total', e.target.value)} /></div>
              <div className="field"><label>Adiantamento (dia 20)</label>
                <input className="input" type="number" step="0.01" value={modal.form.adiantamento} onChange={(e) => setF('adiantamento', e.target.value)} /></div>
            </div>
          </>)}
          <div className="sub" style={{ margin: '-4px 0 10px' }}>Total por mês: <b>{brl(totalMensal(modal.form))}</b>{modal.form.vinculo === 'CLT' && num(modal.form.adiantamento) > 0 ? ` (${brl(num(modal.form.adiantamento))} no dia 20 e ${brl(totalMensal(modal.form) - num(modal.form.adiantamento))} no 5º dia útil)` : ''}. Lançado sozinho todo dia 1º como pagamento pendente.</div>
          <div className="row-3">
            <div className="field"><label>{modal.form.vinculo === 'MEI' ? 'Salário (não se aplica)' : 'Salário fixo'}</label>
              <input className="input" type="number" step="0.01" disabled={modal.form.vinculo === 'MEI'} value={modal.form.salario_fixo} onChange={(e) => setF('salario_fixo', e.target.value)} /></div>
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
