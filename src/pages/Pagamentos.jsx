import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

// Valores aceitos pelo banco (check constraint pagamentos_categoria_check)
const CATEGORIAS = [
  { v: 'fixos', t: 'Fixos' },
  { v: 'salarios', t: 'Salários' },
  { v: 'pro_labore', t: 'Pró-labore' },
  { v: 'operacional', t: 'Operacional' },
  { v: 'industria', t: 'Indústria' },
  { v: 'montagem', t: 'Montagem' },
  { v: 'frete', t: 'Frete' },
  { v: 'rafex', t: 'RAFEX' },
  { v: 'perfar', t: 'Perfar' },
  { v: 'vidracaria', t: 'Vidraçaria' },
  { v: 'metalon', t: 'Metalon' },
  { v: 'rudegon', t: 'Rudegon' },
  { v: 'assistencia', t: 'Assistência' },
  { v: 'marketing', t: 'Marketing' },
  { v: 'impostos', t: 'Impostos' },
  { v: 'outros', t: 'Outros' },
]
const CAT_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.v, c.t]))
const TIPOS = ['Eventual', 'Fixa']
const FORMAS = ['PIX', 'Boleto', 'Transferência', 'Cartão', 'Dinheiro']
const STATUS = ['Pendente', 'Pago']

const novo = () => ({ data: today(), descricao: '', categoria: 'operacional', tipo: 'Eventual', valor: '', forma_pagamento: 'PIX', data_vencimento: '', status: 'Pendente', fornecedor: '', conta_bancaria_id: '', observacao: '', recorrente: false, dia_vencimento: '', projeto_uid: '', juros: '' })

export default function Pagamentos() {
  const [rows, setRows] = useState(null)
  const [contas, setContas] = useState([])
  const [projetos, setProjetos] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [compFile, setCompFile] = useState(null)
  const [boletoFile, setBoletoFile] = useState(null)
  const [rateio, setRateio] = useState([])
  const CUSTO_CATS = ['industria', 'montagem', 'frete', 'assistencia', 'compra_extra', 'gratificacao']
  const mapCustoCat = (c) => CUSTO_CATS.includes(c) ? c : 'compra_extra'

  const baixar = async (path) => {
    if (!path) return
    const { data, error } = await supabase.storage.from('pasta-cliente').createSignedUrl(path, 60)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
    else setErro('Não foi possível abrir o arquivo.')
  }

  const carregar = async () => {
    const [p, c] = await Promise.all([
      supabase.from('pagamentos').select('*').order('data', { ascending: false }).limit(1000),
      supabase.from('contas_bancarias').select('id, nome, banco').eq('ativo', true).order('nome'),
    ])
    if (p.error) setErro(p.error.message)
    setRows(p.data || []); setContas(c.data || [])
  }
  useEffect(() => { carregar() }, [])
  useEffect(() => { (async () => {
    const { data } = await supabase.from('projetos').select('projeto_uid, cliente_nome').order('created_at', { ascending: false }).limit(2000)
    setProjetos(data || [])
  })() }, [])

  const abrirNovo = () => { setCompFile(null); setBoletoFile(null); setRateio([]); setModal({ form: novo(), editId: null }) }
  const abrirEdit = async (r) => {
    setCompFile(null); setBoletoFile(null)
    const { data: cst } = await supabase.from('custos_operacionais').select('id, projeto_uid, valor, categoria').eq('rateio_pagamento_id', r.id)
    setRateio((cst || []).map((c) => ({ projeto_uid: c.projeto_uid || '', valor: c.valor ?? '' })))
    setModal({ form: { data: r.data || today(), descricao: r.descricao || '', categoria: r.categoria || 'operacional', tipo: r.tipo || 'Eventual', valor: r.valor ?? '', forma_pagamento: r.forma_pagamento || 'PIX', data_vencimento: r.data_vencimento || '', status: r.status || 'Pendente', fornecedor: r.fornecedor || '', conta_bancaria_id: r.conta_bancaria_id ?? '', observacao: r.observacao || '', recorrente: r.recorrente ?? false, dia_vencimento: r.dia_vencimento ?? '', projeto_uid: r.projeto_uid || '', comprovante_path: r.comprovante_path || '', comprovante_nome: r.comprovante_nome || '', boleto_path: r.boleto_path || '', boleto_nome: r.boleto_nome || '', juros: r.juros ?? '' }, editId: r.id }) }
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))
  const addRateio = () => setRateio((s) => [...s, { projeto_uid: '', valor: '' }])
  const setRat = (i, k, v) => setRateio((s) => s.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const rmRateio = (i) => setRateio((s) => s.filter((_, j) => j !== i))

  const salvar = async () => {
    setErro(''); const f = modal.form
    if (!f.descricao.trim()) { setErro('Informe a descrição.'); return }
    if (f.valor === '' || Number(f.valor) <= 0) { setErro('Informe o valor.'); return }
    const atrasado = f.data_vencimento && f.data_vencimento < today()
    if (f.status === 'Pago' && atrasado && (f.juros === '' || f.juros === null)) { setErro('Pagamento em atraso: informe os juros (pode ser 0).'); return }
    setSaving(true)
    const payload = { data: f.data || today(), descricao: f.descricao.trim(), categoria: f.categoria || null, tipo: f.tipo, valor: Number(f.valor), forma_pagamento: f.forma_pagamento || null, data_vencimento: f.data_vencimento || null, status: f.status, fornecedor: f.fornecedor || null, conta_bancaria_id: f.conta_bancaria_id ? Number(f.conta_bancaria_id) : null, observacao: f.observacao || null, recorrente: !!f.recorrente, dia_vencimento: f.dia_vencimento === '' ? null : Number(f.dia_vencimento), projeto_uid: f.projeto_uid || null, juros: f.juros === '' ? 0 : Number(f.juros) }
    if (f.status === 'Pago') payload.data_pagamento = today()
    let error, id = modal.editId
    if (modal.editId) { ({ error } = await supabase.from('pagamentos').update(payload).eq('id', modal.editId)); if (!error) await registrarLog({ tabela: 'pagamentos', registroId: modal.editId, acao: 'edicao', descricao: `Pagamento: ${payload.descricao}` }) }
    else { const ins = await supabase.from('pagamentos').insert(payload).select('id').single(); error = ins.error; id = ins.data?.id }
    // anexos: comprovante e boleto
    if (!error && id) {
      const up = async (file, campoPath, campoNome) => {
        if (!file) return
        const safe = file.name.replace(/[^\w.\-]/g, '_')
        const path = `pagamentos/${id}/${campoPath}_${Date.now()}_${safe}`
        const r = await supabase.storage.from('pasta-cliente').upload(path, file, { upsert: false })
        if (!r.error) await supabase.from('pagamentos').update({ [campoPath]: path, [campoNome]: file.name }).eq('id', id)
        else setErro('Arquivo não subiu: ' + r.error.message)
      }
      await up(compFile, 'comprovante_path', 'comprovante_nome')
      await up(boletoFile, 'boleto_path', 'boleto_nome')
      // rateio: cria um custo por contrato (entra na margem do projeto)
      await supabase.from('custos_operacionais').delete().eq('rateio_pagamento_id', id)
      const linhas = rateio.filter((x) => x.projeto_uid && Number(x.valor) > 0).map((x) => ({
        data: f.data || today(), categoria: mapCustoCat(f.categoria), fornecedor: f.fornecedor || null,
        descricao: f.descricao || null, valor: Number(x.valor), projeto_uid: x.projeto_uid,
        rateio_pagamento_id: id, status: f.status || 'Pago',
      }))
      if (linhas.length) await supabase.from('custos_operacionais').insert(linhas)
    }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const clienteDe = Object.fromEntries(projetos.map((p) => [p.projeto_uid, p.cliente_nome]))
  const lista = (rows || []).filter((r) => {
    if (busca && !((r.descricao || '').toLowerCase().includes(busca.toLowerCase()) || (r.fornecedor || '').toLowerCase().includes(busca.toLowerCase()))) return false
    if (filtro === 'pendentes') return r.status !== 'Pago'
    if (filtro === 'pagos') return r.status === 'Pago'
    return true
  })
  const totalPend = (rows || []).filter(r => r.status !== 'Pago').reduce((s, r) => s + (Number(r.valor) || 0), 0)

  return (
    <>
      <div className="section-head">
        <div className="tools">
          <select className="input" style={{ width: 150 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todos">Todos</option><option value="pendentes">Pendentes</option><option value="pagos">Pagos</option>
          </select>
          <div className="search"><IcoSearch /><input className="input" placeholder="Buscar descrição / fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        </div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Novo pagamento</button>
      </div>
      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="label">Pendente</div><div className="value">{brl(totalPend)}</div></div>
        <div className="card kpi"><div className="label">Total registros</div><div className="value">{(rows || []).length}</div></div>
        <div className="card kpi"><div className="label">Exibindo</div><div className="value">{lista.length}</div></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th className="num">Valor</th><th>Vencimento</th><th>Status</th><th>Anexos</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="8" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="8" className="empty">Nenhum pagamento.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td className="muted">{fmtDate(r.data)}</td>
                <td>{r.descricao}{r.fornecedor ? <span className="faint"> · {r.fornecedor}</span> : ''}{r.projeto_uid ? <div className="faint" style={{ fontSize: 11 }}>📄 {clienteDe[r.projeto_uid] || r.projeto_uid}</div> : null}</td>
                <td><span className="badge neutral">{CAT_LABEL[r.categoria] || r.categoria || '—'}</span></td>
                <td className="num">{brl(r.valor)}</td>
                <td style={{ color: (r.status !== 'Pago' && r.status !== 'Cancelado' && r.data_vencimento && r.data_vencimento < today()) ? 'var(--danger)' : 'var(--ink-faint)' }}>{fmtDate(r.data_vencimento)}</td>
                <td>{r.status === 'Pago'
                  ? <span className="badge ok">Pago</span>
                  : r.status === 'Cancelado'
                    ? <span className="badge neutral">Cancelado</span>
                    : (r.data_vencimento && r.data_vencimento < today())
                      ? <span className="badge" style={{ background: 'rgba(220,53,69,0.14)', color: 'var(--danger)', fontWeight: 600 }}>Atrasado</span>
                      : <span className="badge warn">Pendente</span>}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  {r.comprovante_path && <button className="btn ghost sm" style={{ marginRight: 4 }} onClick={() => baixar(r.comprovante_path)} title="Comprovante">Compr.</button>}
                  {r.boleto_path && <button className="btn ghost sm" onClick={() => baixar(r.boleto_path)} title="Boleto">Boleto</button>}
                  {!r.comprovante_path && !r.boleto_path && <span className="faint">—</span>}
                </td>
                <td className="right"><button className="icon-btn" onClick={() => abrirEdit(r)}><IcoEdit /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title={modal.editId ? 'Editar pagamento' : 'Novo pagamento'} onClose={() => setModal(null)}
          footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field"><label>Descrição *</label><input className="input" value={modal.form.descricao} onChange={(e) => setF('descricao', e.target.value)} /></div>
          <div className="row-3">
            <div className="field"><label>Categoria</label><select className="input" value={modal.form.categoria} onChange={(e) => setF('categoria', e.target.value)}>{CATEGORIAS.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}</select></div>
            <div className="field"><label>Tipo</label><select className="input" value={modal.form.tipo} onChange={(e) => setF('tipo', e.target.value)}>{TIPOS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Valor *</label><input className="input" type="number" step="0.01" value={modal.form.valor} onChange={(e) => setF('valor', e.target.value)} /></div>
          </div>
          <div className="row-3">
            <div className="field"><label>Data</label><input className="input" type="date" value={modal.form.data} onChange={(e) => setF('data', e.target.value)} /></div>
            <div className="field"><label>Vencimento</label><input className="input" type="date" value={modal.form.data_vencimento} onChange={(e) => setF('data_vencimento', e.target.value)} /></div>
            <div className="field"><label>Status</label><select className="input" value={modal.form.status} onChange={(e) => setF('status', e.target.value)}>{STATUS.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          {modal.form.data_vencimento && modal.form.data_vencimento < today() && (
            <div className="field" style={{ border: '1px solid var(--danger)', borderRadius: 8, padding: 10, background: 'rgba(220,53,69,0.05)' }}>
              <label style={{ color: 'var(--danger)' }}>Juros do atraso (R$) {modal.form.status === 'Pago' ? '— obrigatório' : ''}</label>
              <input className="input" type="number" step="0.01" value={modal.form.juros} onChange={(e) => setF('juros', e.target.value)} placeholder="0,00" />
              <div className="sub" style={{ marginTop: 4 }}>Este pagamento está em atraso. Ao marcar como Pago, informe os juros (pode ser 0).</div>
            </div>
          )}
          <div className="row-2">
            <div className="field"><label>Forma</label><select className="input" value={modal.form.forma_pagamento} onChange={(e) => setF('forma_pagamento', e.target.value)}>{FORMAS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Conta bancária</label><select className="input" value={modal.form.conta_bancaria_id || ''} onChange={(e) => setF('conta_bancaria_id', e.target.value)}><option value="">— não definir —</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          </div>
          <div className="field"><label>Fornecedor</label><input className="input" value={modal.form.fornecedor} onChange={(e) => setF('fornecedor', e.target.value)} /></div>
          <div className="field"><label>Contrato do cliente (vincular)</label>
            <select className="input" value={modal.form.projeto_uid} onChange={(e) => setF('projeto_uid', e.target.value)}>
              <option value="">— sem vínculo —</option>
              {[...projetos].sort((a, b) => (a.cliente_nome || '').localeCompare(b.cliente_nome || '')).map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.cliente_nome || 's/ nome'} · {p.projeto_uid}</option>)}
            </select></div>

          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div className="between">
              <b style={{ fontSize: 13 }}>Ratear entre vários contratos</b>
              <button className="btn ghost sm" type="button" onClick={addRateio}>+ Adicionar contrato</button>
            </div>
            <div className="sub" style={{ margin: '4px 0 8px' }}>Um pagamento (ex.: indústria) dividido por contrato. Cada parte vira custo do projeto e entra na margem.</div>
            {rateio.map((x, i) => (
              <div className="row-2" key={i} style={{ marginBottom: 6, alignItems: 'end' }}>
                <div className="field" style={{ margin: 0 }}>
                  <select className="input" value={x.projeto_uid} onChange={(e) => setRat(i, 'projeto_uid', e.target.value)}>
                    <option value="">— escolha o contrato —</option>
                    {[...projetos].sort((a, b) => (a.cliente_nome || '').localeCompare(b.cliente_nome || '')).map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.cliente_nome || 's/ nome'} · {p.projeto_uid}</option>)}
                  </select>
                </div>
                <div className="flex" style={{ gap: 6 }}>
                  <input className="input" type="number" step="0.01" placeholder="valor" value={x.valor} onChange={(e) => setRat(i, 'valor', e.target.value)} />
                  <button className="icon-btn" type="button" onClick={() => rmRateio(i)} title="Remover">×</button>
                </div>
              </div>
            ))}
            {rateio.length > 0 && (() => {
              const soma = rateio.reduce((s, x) => s + (Number(x.valor) || 0), 0)
              const dif = (Number(modal.form.valor) || 0) - soma
              return <div className="between" style={{ marginTop: 6, fontSize: 12.5 }}><span className="muted">Somado: <b>{brl(soma)}</b></span><span style={{ color: Math.abs(dif) > 0.5 ? 'var(--warn)' : 'var(--ok)' }}>{Math.abs(dif) > 0.5 ? `faltam ${brl(dif)} p/ bater o total` : 'bate com o total ✓'}</span></div>
            })()}
          </div>
          <div className="row-2" style={{ alignItems: 'end' }}>
            <div className="field"><label>Conta fixa mensal?</label>
              <select className="input" value={modal.form.recorrente ? 'sim' : 'nao'} onChange={(e) => setF('recorrente', e.target.value === 'sim')}><option value="nao">Não</option><option value="sim">Sim — entra nas Contas Fixas</option></select></div>
            <div className="field"><label>Dia do vencimento (fixa)</label><input className="input" type="number" min="1" max="31" value={modal.form.dia_vencimento} onChange={(e) => setF('dia_vencimento', e.target.value)} placeholder="ex.: 10" /></div>
          </div>
          <div className="row-2">
            <div className="field"><label>Comprovante de pagamento</label>
              <input className="input" type="file" accept=".pdf,image/*" onChange={(e) => setCompFile(e.target.files?.[0] || null)} />
              {modal.form.comprovante_path && !compFile && <div className="sub" style={{ marginTop: 4 }}>Anexado: {modal.form.comprovante_nome || 'arquivo'} · <a onClick={() => baixar(modal.form.comprovante_path)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>ver</a></div>}
            </div>
            <div className="field"><label>Boleto</label>
              <input className="input" type="file" accept=".pdf,image/*" onChange={(e) => setBoletoFile(e.target.files?.[0] || null)} />
              {modal.form.boleto_path && !boletoFile && <div className="sub" style={{ marginTop: 4 }}>Anexado: {modal.form.boleto_nome || 'arquivo'} · <a onClick={() => baixar(modal.form.boleto_path)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>ver</a></div>}
            </div>
          </div>
          <div className="field"><label>Observação</label><textarea className="input" value={modal.form.observacao} onChange={(e) => setF('observacao', e.target.value)} /></div>
        </Modal>
      )}
    </>
  )
}
