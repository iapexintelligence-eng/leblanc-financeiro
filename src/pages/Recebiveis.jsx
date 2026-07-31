import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today, addMonths } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

const FORMAS = ['Boleto', 'PIX', 'Transferência', 'Cartão', 'Dinheiro', 'Cheque']

const statusBadge = (r) => {
  if (r.status === 'Recebido') return <span className="badge ok">Recebido</span>
  const venc = r.data_prevista && r.data_prevista < today()
  return venc ? <span className="badge danger">Vencido</span> : <span className="badge warn">A vencer</span>
}

const novo = () => ({
  cliente_nome: '', descricao: '', valor_parcela: '', data_prevista: today(),
  forma_recebimento: 'Boleto', conta_bancaria_id: '', observacoes: '',
  parcelas: 1, intervalo: 1,
})

export default function Recebiveis() {
  const [rows, setRows] = useState(null)
  const [contas, setContas] = useState([])
  const [filtro, setFiltro] = useState('avencer') // avencer | vencidos | recebidos | todos
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const [r, c] = await Promise.all([
      supabase.from('a_receber').select('*').order('data_prevista', { ascending: true }).limit(1000),
      supabase.from('contas_bancarias').select('id, nome, banco').eq('ativo', true).order('nome'),
    ])
    if (r.error) setErro(r.error.message)
    setRows(r.data || [])
    setContas(c.data || [])
  }
  useEffect(() => { carregar() }, [])

  const abrirNovo = () => setModal({ form: novo(), editId: null })
  const abrirEdit = (r) => setModal({
    form: {
      cliente_nome: r.cliente_nome || '', descricao: r.descricao || '',
      valor_parcela: r.valor_parcela ?? '', data_prevista: r.data_prevista || today(),
      forma_recebimento: r.forma_recebimento || 'Boleto', conta_bancaria_id: r.conta_bancaria_id ?? '',
      observacoes: r.observacoes || '', parcelas: 1, intervalo: 1, status: r.status,
    },
    editId: r.id,
  })
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const salvar = async () => {
    setErro('')
    const f = modal.form
    if (!f.cliente_nome.trim()) { setErro('Informe o cliente.'); return }
    if (f.valor_parcela === '' || Number(f.valor_parcela) <= 0) { setErro('Informe o valor.'); return }
    setSaving(true)
    const base = {
      cliente_nome: f.cliente_nome.trim(),
      descricao: f.descricao || null,
      valor_parcela: Number(f.valor_parcela),
      forma_recebimento: f.forma_recebimento || null,
      conta_bancaria_id: f.conta_bancaria_id ? Number(f.conta_bancaria_id) : null,
      observacoes: f.observacoes || null,
      status: 'Pendente',
    }
    let error
    if (modal.editId) {
      ({ error } = await supabase.from('a_receber').update({
        ...base, data_prevista: f.data_prevista, status: f.status || 'Pendente',
      }).eq('id', modal.editId))
      if (!error) await registrarLog({ tabela: 'a_receber', registroId: modal.editId, acao: 'edicao', descricao: `Edição de recebível de ${base.cliente_nome}` })
    } else {
      const n = Math.max(1, Number(f.parcelas) || 1)
      const passo = Math.max(1, Number(f.intervalo) || 1)
      const registros = []
      for (let i = 0; i < n; i++) {
        registros.push({
          ...base,
          descricao: n > 1 ? `${base.descricao || 'Parcela'} (${i + 1}/${n})` : base.descricao,
          data_prevista: i === 0 ? f.data_prevista : addMonths(f.data_prevista, i * passo),
        })
      }
      ({ error } = await supabase.from('a_receber').insert(registros))
    }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const marcarRecebido = async (r) => {
    await supabase.from('a_receber').update({ status: 'Recebido', data_recebimento: today() }).eq('id', r.id)
    await registrarLog({ tabela: 'a_receber', registroId: r.id, acao: 'edicao', descricao: `Baixa (recebido) de ${r.cliente_nome}` })
    carregar()
  }

  const lista = (rows || []).filter((r) => {
    if (busca && !((r.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.descricao || '').toLowerCase().includes(busca.toLowerCase()))) return false
    const venc = r.data_prevista && r.data_prevista < today()
    if (filtro === 'avencer') return r.status !== 'Recebido' && !venc
    if (filtro === 'vencidos') return r.status !== 'Recebido' && venc
    if (filtro === 'recebidos') return r.status === 'Recebido'
    return true
  })

  const totalAberto = (rows || []).filter((r) => r.status !== 'Recebido').reduce((s, r) => s + (Number(r.valor_parcela) || 0), 0)

  return (
    <>
      <div className="section-head">
        <div className="tools">
          <select className="input" style={{ width: 170 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="avencer">A vencer</option>
            <option value="vencidos">Vencidos</option>
            <option value="recebidos">Recebidos</option>
            <option value="todos">Todos</option>
          </select>
          <div className="search">
            <IcoSearch />
            <input className="input" placeholder="Buscar cliente / descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Lançar boleto</button>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="label">Total em aberto</div><div className="value">{brl(totalAberto)}</div></div>
        <div className="card kpi"><div className="label">Registros</div><div className="value">{(rows || []).length}</div></div>
        <div className="card kpi"><div className="label">Exibindo</div><div className="value">{lista.length}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Descrição</th><th className="num">Valor</th>
              <th>Vencimento</th><th>Forma</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan="7" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="7" className="empty">Nenhum boleto neste filtro.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.cliente_nome}</td>
                <td className="muted">{r.descricao || '—'}</td>
                <td className="num">{brl(r.valor_parcela)}</td>
                <td className="muted">{fmtDate(r.data_prevista)}</td>
                <td className="muted">{r.forma_recebimento || '—'}</td>
                <td>{statusBadge(r)}</td>
                <td className="right">
                  <div className="flex" style={{ justifyContent: 'flex-end' }}>
                    {r.status !== 'Recebido' && <button className="btn ghost sm" onClick={() => marcarRecebido(r)}>Baixar</button>}
                    <button className="icon-btn" onClick={() => abrirEdit(r)} title="Editar"><IcoEdit /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.editId ? 'Editar recebível' : 'Lançar boleto'}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </>}
        >
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field"><label>Cliente *</label>
            <input className="input" value={modal.form.cliente_nome} onChange={(e) => setF('cliente_nome', e.target.value)} /></div>
          <div className="field"><label>Descrição</label>
            <input className="input" value={modal.form.descricao} onChange={(e) => setF('descricao', e.target.value)} placeholder="Ex.: Entrada, Parcela do contrato…" /></div>
          <div className="row-2">
            <div className="field"><label>{modal.editId ? 'Valor' : 'Valor por parcela'} *</label>
              <input className="input" type="number" step="0.01" value={modal.form.valor_parcela} onChange={(e) => setF('valor_parcela', e.target.value)} /></div>
            <div className="field"><label>{modal.editId ? 'Vencimento' : '1º vencimento'}</label>
              <input className="input" type="date" value={modal.form.data_prevista} onChange={(e) => setF('data_prevista', e.target.value)} /></div>
          </div>
          {!modal.editId && (
            <div className="row-2">
              <div className="field"><label>Nº de parcelas</label>
                <input className="input" type="number" min="1" max="60" value={modal.form.parcelas} onChange={(e) => setF('parcelas', e.target.value)} /></div>
              <div className="field"><label>Intervalo (meses)</label>
                <input className="input" type="number" min="1" max="12" value={modal.form.intervalo} onChange={(e) => setF('intervalo', e.target.value)} /></div>
            </div>
          )}
          <div className="row-2">
            <div className="field"><label>Forma</label>
              <select className="input" value={modal.form.forma_recebimento} onChange={(e) => setF('forma_recebimento', e.target.value)}>
                {FORMAS.map((f) => <option key={f}>{f}</option>)}
              </select></div>
            <div className="field"><label>Conta bancária</label>
              <select className="input" value={modal.form.conta_bancaria_id || ''} onChange={(e) => setF('conta_bancaria_id', e.target.value)}>
                <option value="">— não definir —</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` · ${c.banco}` : ''}</option>)}
              </select></div>
          </div>
          {modal.editId && (
            <div className="field"><label>Status</label>
              <select className="input" value={modal.form.status || 'Pendente'} onChange={(e) => setF('status', e.target.value)}>
                <option value="Pendente">Pendente</option>
                <option value="Recebido">Recebido</option>
              </select></div>
          )}
          <div className="field"><label>Observações</label>
            <textarea className="input" value={modal.form.observacoes} onChange={(e) => setF('observacoes', e.target.value)} /></div>
          {!modal.editId && Number(modal.form.parcelas) > 1 && (
            <div className="sub">Serão criados <b>{modal.form.parcelas}</b> boletos de <b>{brl(modal.form.valor_parcela || 0)}</b>, a cada <b>{modal.form.intervalo}</b> mês(es), a partir de <b>{fmtDate(modal.form.data_prevista)}</b>.</div>
          )}
        </Modal>
      )}
    </>
  )
}
