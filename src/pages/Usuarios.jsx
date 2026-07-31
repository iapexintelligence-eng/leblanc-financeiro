import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { PAPEIS, SETORES } from '../lib/useRole.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

const PAPEL_LABEL = {
  administrativo: 'Administrativo (vê tudo)', diretoria: 'Diretoria (vê tudo)',
  correcao: 'Correção', montagem: 'Montagem', qualidade: 'Qualidade', vendedor: 'Vendedor',
}
const vazio = { nome: '', email: '', setor: 'Vendas', papel: 'vendedor', ativo: true }

export default function Usuarios() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const { data, error } = await supabase.from('usuarios_sistema').select('*').order('nome')
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [])

  const abrirNovo = () => setModal({ form: { ...vazio }, editId: null })
  const abrirEdit = (r) => setModal({ form: { nome: r.nome || '', email: r.email || '', setor: r.setor || 'Vendas', papel: r.papel || 'vendedor', ativo: r.ativo ?? true }, editId: r.id })
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const salvar = async () => {
    setErro(''); const f = modal.form
    if (!f.nome.trim() || !f.email.trim()) { setErro('Informe nome e e-mail.'); return }
    setSaving(true)
    const payload = { nome: f.nome.trim(), email: f.email.trim().toLowerCase(), setor: f.setor, papel: f.papel, ativo: !!f.ativo }
    let error
    if (modal.editId) ({ error } = await supabase.from('usuarios_sistema').update(payload).eq('id', modal.editId))
    else ({ error } = await supabase.from('usuarios_sistema').insert(payload))
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const lista = (rows || []).filter((r) => !busca || (r.nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.email || '').toLowerCase().includes(busca.toLowerCase()))

  return (
    <>
      <div className="section-head">
        <div className="tools"><div className="search"><IcoSearch /><input className="input" placeholder="Buscar nome / e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Novo usuário</button>
      </div>
      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
      <div className="sub" style={{ marginBottom: 12 }}>Cadastro de acessos por pessoa. O login em si (e-mail + senha) é criado no Supabase — este cadastro define o <b>papel/setor</b> de cada e-mail.</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Setor</th><th>Papel</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="6" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="6" className="empty">Nenhum usuário cadastrado.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.nome}</td>
                <td className="muted">{r.email}</td>
                <td className="muted">{r.setor || '—'}</td>
                <td><span className="badge neutral">{PAPEL_LABEL[r.papel] || r.papel}</span></td>
                <td>{r.ativo ? <span className="badge ok">Ativo</span> : <span className="badge danger">Inativo</span>}</td>
                <td className="right"><button className="icon-btn" onClick={() => abrirEdit(r)}><IcoEdit /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.editId ? 'Editar usuário' : 'Novo usuário'} onClose={() => setModal(null)}
          footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field"><label>Nome *</label><input className="input" value={modal.form.nome} onChange={(e) => setF('nome', e.target.value)} /></div>
          <div className="field"><label>E-mail corporativo *</label><input className="input" type="email" value={modal.form.email} onChange={(e) => setF('email', e.target.value)} /></div>
          <div className="row-2">
            <div className="field"><label>Setor</label><select className="input" value={modal.form.setor} onChange={(e) => setF('setor', e.target.value)}>{SETORES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label>Papel (acesso)</label><select className="input" value={modal.form.papel} onChange={(e) => setF('papel', e.target.value)}>{PAPEIS.map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}</select></div>
          </div>
          <div className="field"><label>Situação</label><select className="input" value={modal.form.ativo ? '1' : '0'} onChange={(e) => setF('ativo', e.target.value === '1')}><option value="1">Ativo</option><option value="0">Inativo</option></select></div>
        </Modal>
      )}
    </>
  )
}
