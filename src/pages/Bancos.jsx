import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoSwap, IcoEdit, IcoBank } from '../components/Icons.jsx'

export default function Bancos() {
  const [contas, setContas] = useState(null)
  const [transfs, setTransfs] = useState([])
  const [modal, setModal] = useState(null) // {tipo:'transfer'|'conta', ...}
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const c = await supabase.from('contas_bancarias').select('*').order('nome')
    if (c.error) setErro(c.error.message)
    setContas(c.data || [])
    const t = await supabase.from('transferencias').select('*').order('data', { ascending: false }).limit(50)
    if (!t.error) setTransfs(t.data || [])
  }
  useEffect(() => { carregar() }, [])

  const ativas = (contas || []).filter((c) => c.ativo)
  const totalSaldo = (contas || []).reduce((s, c) => s + (Number(c.saldo) || 0), 0)

  // ---- Transferência ----
  const abrirTransfer = () => setModal({ tipo: 'transfer', origem: '', destino: '', valor: '', data: today(), descricao: '' })
  const salvarTransfer = async () => {
    setErro('')
    const m = modal
    if (!m.origem || !m.destino) { setErro('Escolha as contas de origem e destino.'); return }
    if (m.origem === m.destino) { setErro('Origem e destino devem ser diferentes.'); return }
    const valor = Number(m.valor)
    if (!valor || valor <= 0) { setErro('Informe um valor válido.'); return }
    const cOrig = contas.find((c) => String(c.id) === String(m.origem))
    const cDest = contas.find((c) => String(c.id) === String(m.destino))
    if (Number(cOrig.saldo) < valor && !confirm('O saldo da conta de origem ficará negativo. Continuar?')) return
    setSaving(true)
    // 1) registra a transferência
    const ins = await supabase.from('transferencias').insert({
      data: m.data, conta_origem_id: Number(m.origem), conta_destino_id: Number(m.destino),
      valor, descricao: m.descricao || null,
    }).select('id').single()
    if (ins.error) { setSaving(false); setErro(ins.error.message); return }
    // 2) atualiza saldos
    const e1 = await supabase.from('contas_bancarias').update({ saldo: Number(cOrig.saldo) - valor }).eq('id', cOrig.id)
    const e2 = await supabase.from('contas_bancarias').update({ saldo: Number(cDest.saldo) + valor }).eq('id', cDest.id)
    setSaving(false)
    if (e1.error || e2.error) { setErro((e1.error || e2.error).message); return }
    await registrarLog({ tabela: 'transferencias', registroId: ins.data?.id, acao: 'criacao', descricao: `Transferência de ${brl(valor)}: ${cOrig.nome} → ${cDest.nome}` })
    setModal(null); carregar()
  }

  // ---- Conta (novo/editar) ----
  const abrirConta = (c) => setModal({
    tipo: 'conta', editId: c?.id || null,
    nome: c?.nome || '', banco: c?.banco || '', saldo: c?.saldo ?? '',
    ativo: c ? c.ativo : true, observacao: c?.observacao || '',
  })
  const salvarConta = async () => {
    setErro('')
    if (!modal.nome.trim()) { setErro('Informe o nome da conta.'); return }
    setSaving(true)
    const payload = {
      nome: modal.nome.trim(), banco: modal.banco || null,
      saldo: modal.saldo === '' ? 0 : Number(modal.saldo),
      ativo: !!modal.ativo, observacao: modal.observacao || null,
    }
    let error
    if (modal.editId) ({ error } = await supabase.from('contas_bancarias').update(payload).eq('id', modal.editId))
    else ({ error } = await supabase.from('contas_bancarias').insert({ ...payload, data_saldo_base: today() }))
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const nomeConta = (id) => (contas || []).find((c) => c.id === id)?.nome || '—'

  return (
    <>
      <div className="section-head">
        <div><span className="crumb">Saldo total consolidado</span>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 600 }}>{brl(totalSaldo)}</div></div>
        <div className="tools">
          <button className="btn ghost" onClick={() => abrirConta(null)}><IcoPlus /> Nova conta</button>
          <button className="btn" onClick={abrirTransfer}><IcoSwap /> Transferir</button>
        </div>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 26 }}>
        {contas === null && <div className="empty">Carregando…</div>}
        {(contas || []).map((c) => (
          <div className="card" key={c.id} style={{ opacity: c.ativo ? 1 : .55 }}>
            <div className="between">
              <div className="flex"><IcoBank /><h3 style={{ fontSize: 17 }}>{c.nome}</h3></div>
              <button className="icon-btn" onClick={() => abrirConta(c)}><IcoEdit /></button>
            </div>
            <div className="sub" style={{ marginTop: 2 }}>{c.banco || 'Conta'} {c.ativo ? '' : '· inativa'}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 600, marginTop: 8 }}>{brl(c.saldo)}</div>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>base {fmtDate(c.data_saldo_base)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Últimas transferências</h3>
        <div className="sub">Movimentações entre contas</div>
        {transfs.length === 0 ? <div className="empty">Nenhuma transferência registrada ainda.</div> : (
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table>
              <thead><tr><th>Data</th><th>Origem</th><th>Destino</th><th className="num">Valor</th><th>Descrição</th></tr></thead>
              <tbody>
                {transfs.map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{fmtDate(t.data)}</td>
                    <td>{nomeConta(t.conta_origem_id)}</td>
                    <td>{nomeConta(t.conta_destino_id)}</td>
                    <td className="num">{brl(t.valor)}</td>
                    <td className="muted">{t.descricao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.tipo === 'transfer' && (
        <Modal title="Transferência entre contas" onClose={() => setModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn" onClick={salvarTransfer} disabled={saving}>{saving ? 'Transferindo…' : 'Confirmar transferência'}</button>
          </>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="row-2">
            <div className="field"><label>De (origem)</label>
              <select className="input" value={modal.origem} onChange={(e) => setModal({ ...modal, origem: e.target.value })}>
                <option value="">— selecione —</option>
                {ativas.map((c) => <option key={c.id} value={c.id}>{c.nome} · {brl(c.saldo)}</option>)}
              </select></div>
            <div className="field"><label>Para (destino)</label>
              <select className="input" value={modal.destino} onChange={(e) => setModal({ ...modal, destino: e.target.value })}>
                <option value="">— selecione —</option>
                {ativas.map((c) => <option key={c.id} value={c.id}>{c.nome} · {brl(c.saldo)}</option>)}
              </select></div>
          </div>
          <div className="row-2">
            <div className="field"><label>Valor</label>
              <input className="input" type="number" step="0.01" value={modal.valor} onChange={(e) => setModal({ ...modal, valor: e.target.value })} /></div>
            <div className="field"><label>Data</label>
              <input className="input" type="date" value={modal.data} onChange={(e) => setModal({ ...modal, data: e.target.value })} /></div>
          </div>
          <div className="field"><label>Descrição</label>
            <input className="input" value={modal.descricao} onChange={(e) => setModal({ ...modal, descricao: e.target.value })} placeholder="Ex.: Cobrir folha, aporte…" /></div>
        </Modal>
      )}

      {modal?.tipo === 'conta' && (
        <Modal title={modal.editId ? 'Editar conta' : 'Nova conta'} onClose={() => setModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn" onClick={salvarConta} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="row-2">
            <div className="field"><label>Nome *</label>
              <input className="input" value={modal.nome} onChange={(e) => setModal({ ...modal, nome: e.target.value })} /></div>
            <div className="field"><label>Banco</label>
              <input className="input" value={modal.banco} onChange={(e) => setModal({ ...modal, banco: e.target.value })} /></div>
          </div>
          <div className="row-2">
            <div className="field"><label>Saldo {modal.editId ? 'atual' : 'inicial'}</label>
              <input className="input" type="number" step="0.01" value={modal.saldo} onChange={(e) => setModal({ ...modal, saldo: e.target.value })} /></div>
            <div className="field"><label>Situação</label>
              <select className="input" value={modal.ativo ? '1' : '0'} onChange={(e) => setModal({ ...modal, ativo: e.target.value === '1' })}>
                <option value="1">Ativa</option><option value="0">Inativa</option>
              </select></div>
          </div>
          <div className="field"><label>Observação</label>
            <textarea className="input" value={modal.observacao} onChange={(e) => setModal({ ...modal, observacao: e.target.value })} /></div>
        </Modal>
      )}
    </>
  )
}
