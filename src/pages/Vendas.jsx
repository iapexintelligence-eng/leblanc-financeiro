import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { registrarLog, montarDiff } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

const CAMPOS = ['cliente_nome', 'vendedor', 'funcionario_id', 'valor_vendido', 'valor_promob', 'desconto_percentual', 'data_venda', 'observacoes']

const novo = () => ({
  cliente_nome: '', vendedor: '', funcionario_id: '',
  valor_vendido: '', valor_promob: '', desconto_percentual: '',
  data_venda: today(), observacoes: '',
})

export default function Vendas() {
  const [rows, setRows] = useState(null)
  const [vendedores, setVendedores] = useState([])
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null) // {form, editId, original}
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const [v, f] = await Promise.all([
      supabase.from('vendas').select('*').order('data_venda', { ascending: false }).limit(500),
      supabase.from('funcionarios').select('id, nome_completo, tipo, ativo').eq('ativo', true).order('nome_completo'),
    ])
    if (v.error) setErro(v.error.message)
    setRows(v.data || [])
    // Vendedores primeiro, depois demais funcionários ativos (todos podem ser selecionados).
    const fs = (f.data || [])
    fs.sort((a, b) => (b.tipo === 'Vendedor') - (a.tipo === 'Vendedor'))
    setVendedores(fs)
  }
  useEffect(() => { carregar() }, [])

  const abrirNovo = () => setModal({ form: novo(), editId: null, original: null })
  const abrirEdit = (r) => setModal({
    form: {
      cliente_nome: r.cliente_nome || '', vendedor: r.vendedor || '',
      funcionario_id: r.funcionario_id ?? '',
      valor_vendido: r.valor_vendido ?? '', valor_promob: r.valor_promob ?? '',
      desconto_percentual: r.desconto_percentual ?? '',
      data_venda: r.data_venda || today(), observacoes: r.observacoes || '',
    },
    editId: r.id, original: r,
  })
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  // Ao escolher o vendedor no select, grava o nome (texto) e o funcionario_id juntos.
  const escolherVendedor = (id) => {
    const f = vendedores.find((x) => String(x.id) === String(id))
    setModal((m) => ({ ...m, form: { ...m.form, funcionario_id: id || '', vendedor: f ? f.nome_completo : '' } }))
  }

  const salvar = async () => {
    setErro('')
    const f = modal.form
    if (!f.cliente_nome.trim()) { setErro('Informe o nome do cliente.'); return }
    setSaving(true)
    const payload = {
      cliente_nome: f.cliente_nome.trim(),
      vendedor: f.vendedor || null,
      funcionario_id: f.funcionario_id ? Number(f.funcionario_id) : null,
      valor_vendido: f.valor_vendido === '' ? null : Number(f.valor_vendido),
      valor_promob: f.valor_promob === '' ? null : Number(f.valor_promob),
      desconto_percentual: f.desconto_percentual === '' ? null : Number(f.desconto_percentual),
      data_venda: f.data_venda || today(),
      observacoes: f.observacoes || null,
    }
    let error, novoId
    if (modal.editId) {
      ({ error } = await supabase.from('vendas').update(payload).eq('id', modal.editId))
      if (!error) {
        const diff = montarDiff(modal.original, payload, CAMPOS)
        await registrarLog({ tabela: 'vendas', registroId: modal.editId, acao: 'edicao', diff, descricao: `Edição da venda de ${payload.cliente_nome}` })
      }
    } else {
      const ins = await supabase.from('vendas').insert(payload).select('id').single()
      error = ins.error; novoId = ins.data?.id
      if (!error && novoId) await registrarLog({ tabela: 'vendas', registroId: novoId, acao: 'criacao', descricao: `Nova venda de ${payload.cliente_nome}` })
    }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const lista = (rows || []).filter((r) =>
    !busca || (r.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) ||
    (r.vendedor || '').toLowerCase().includes(busca.toLowerCase()))

  return (
    <>
      <div className="section-head">
        <div className="tools">
          <div className="search">
            <IcoSearch />
            <input className="input" placeholder="Buscar por cliente ou vendedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Nova venda</button>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Vendedor</th><th className="num">Valor vendido</th>
              <th className="num">Desc.</th><th>Data</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan="6" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="6" className="empty">Nenhuma venda encontrada.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.cliente_nome}</td>
                <td>{r.vendedor ? <span className="badge neutral">{r.vendedor}</span> : <span className="faint">— sem vendedor —</span>}</td>
                <td className="num">{r.valor_vendido ? brl(r.valor_vendido) : '—'}</td>
                <td className="num muted">{r.desconto_percentual ? r.desconto_percentual + '%' : '—'}</td>
                <td className="muted">{fmtDate(r.data_venda)}</td>
                <td className="right"><button className="icon-btn" onClick={() => abrirEdit(r)} title="Editar / corrigir"><IcoEdit /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.editId ? 'Editar venda' : 'Nova venda'}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </>}
        >
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field">
            <label>Cliente *</label>
            <input className="input" value={modal.form.cliente_nome} onChange={(e) => setF('cliente_nome', e.target.value)} />
          </div>
          <div className="row-2">
            <div className="field">
              <label>Vendedor</label>
              <select className="input" value={modal.form.funcionario_id || ''} onChange={(e) => escolherVendedor(e.target.value)}>
                <option value="">— selecione —</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome_completo}{v.tipo && v.tipo !== 'Vendedor' ? ` (${v.tipo})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Data da venda</label>
              <input className="input" type="date" value={modal.form.data_venda} onChange={(e) => setF('data_venda', e.target.value)} />
            </div>
          </div>
          <div className="row-3">
            <div className="field"><label>Valor vendido</label>
              <input className="input" type="number" step="0.01" value={modal.form.valor_vendido} onChange={(e) => setF('valor_vendido', e.target.value)} /></div>
            <div className="field"><label>Valor Promob</label>
              <input className="input" type="number" step="0.01" value={modal.form.valor_promob} onChange={(e) => setF('valor_promob', e.target.value)} /></div>
            <div className="field"><label>Desconto %</label>
              <input className="input" type="number" step="0.01" value={modal.form.desconto_percentual} onChange={(e) => setF('desconto_percentual', e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Observações</label>
            <textarea className="input" value={modal.form.observacoes} onChange={(e) => setF('observacoes', e.target.value)} />
          </div>
          {vendedores.length === 0 && (
            <div className="sub" style={{ color: 'var(--warn)' }}>Nenhum funcionário ativo cadastrado ainda — cadastre em <b>Funcionários</b> para preencher a lista de vendedores.</div>
          )}
        </Modal>
      )}
    </>
  )
}
