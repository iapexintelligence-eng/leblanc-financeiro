import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

const CLASSIF = ['Fabricação', 'Montagem', 'Transporte', 'Projeto', 'Cliente', 'Outros']
const RESP_ERRO = ['Indústria', 'Montador', 'Vendedor', 'Correção', 'Cliente', 'Loja', 'Outros']
const RESP_CUSTO = ['Loja', 'Indústria', 'Montador', 'Cliente']
const PRIORIDADES = ['Baixa', 'Normal', 'Alta', 'Urgente']
const STATUS = ['Aberta', 'Em análise', 'Autorizada', 'Em execução', 'Concluída', 'Cancelada']

const n = (v) => Number(v) || 0
const badgeStatus = (s) => {
  if (s === 'Concluída') return 'ok'
  if (s === 'Cancelada') return 'neutral'
  if (s === 'Em execução' || s === 'Autorizada') return 'warn'
  return 'warn'
}
const corPrioridade = (p) => p === 'Urgente' ? 'var(--danger)' : p === 'Alta' ? 'var(--warn)' : 'inherit'

const novo = () => ({
  numero: '', cliente_nome: '', projeto_uid: '', num_pedido: '', ambientes: '', endereco: '',
  data_solicitacao: today(), descricao_ocorrencia: '', classificacao: 'Fabricação', classificacao_outros: '',
  responsavel_erro: 'Indústria', responsavel_nome: '', solucao: '',
  custo_material: '', custo_mao_obra: '', custo_frete: '', responsabilidade_custo: 'Loja',
  prioridade: 'Normal', status: 'Aberta', executor: '', montador: '', executado_data: '', liberado_pagamento: false,
})

export default function AOT() {
  const [rows, setRows] = useState(null)
  const [projetos, setProjetos] = useState([])
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState('todas')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    const { data, error } = await supabase.from('aot').select('*').order('created_at', { ascending: false }).limit(2000)
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [])
  useEffect(() => { (async () => {
    const { data } = await supabase.from('projetos').select('projeto_uid, cliente_nome').order('created_at', { ascending: false }).limit(2000)
    setProjetos(data || [])
  })() }, [])

  const abrirNovo = () => { setErro(''); setModal({ form: novo(), editId: null }) }
  const abrirEdit = (r) => { setErro(''); setModal({ form: { ...novo(), ...Object.fromEntries(Object.keys(novo()).map((k) => [k, r[k] ?? novo()[k]])) }, editId: r.id }) }
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const salvar = async () => {
    setErro(''); const f = modal.form
    if (!f.cliente_nome.trim()) { setErro('Informe o cliente.'); return }
    setSaving(true)
    const projLabel = f.projeto_uid ? (projetos.find((p) => p.projeto_uid === f.projeto_uid)?.cliente_nome) : null
    const payload = {
      numero: f.numero || null, cliente_nome: f.cliente_nome.trim(), projeto_uid: f.projeto_uid || null,
      num_pedido: f.num_pedido || null, ambientes: f.ambientes || null, endereco: f.endereco || null,
      data_solicitacao: f.data_solicitacao || today(), descricao_ocorrencia: f.descricao_ocorrencia || null,
      classificacao: f.classificacao || null, classificacao_outros: f.classificacao === 'Outros' ? (f.classificacao_outros || null) : null,
      responsavel_erro: f.responsavel_erro || null, responsavel_nome: f.responsavel_nome || projLabel || null,
      solucao: f.solucao || null, custo_material: f.custo_material === '' ? null : Number(f.custo_material),
      custo_mao_obra: f.custo_mao_obra === '' ? null : Number(f.custo_mao_obra),
      custo_frete: f.custo_frete === '' ? null : Number(f.custo_frete),
      responsabilidade_custo: f.responsabilidade_custo || null, prioridade: f.prioridade || null,
      status: f.status || 'Aberta', executor: f.executor || null, montador: f.montador || null,
      executado_data: f.executado_data || null, liberado_pagamento: !!f.liberado_pagamento,
    }
    let error
    if (modal.editId) { ({ error } = await supabase.from('aot').update(payload).eq('id', modal.editId)); if (!error) await registrarLog({ tabela: 'aot', registroId: modal.editId, acao: 'edicao', descricao: `AOT: ${payload.cliente_nome}` }) }
    else { ({ error } = await supabase.from('aot').insert(payload)) }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const lista = useMemo(() => (rows || []).filter((r) => {
    if (fStatus !== 'todas' && r.status !== fStatus) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.cliente_nome || '').toLowerCase().includes(q) || (r.numero || '').toLowerCase().includes(q) || (r.projeto_uid || '').toLowerCase().includes(q))) return false }
    return true
  }), [rows, busca, fStatus])

  const custoTot = (r) => n(r.custo_material) + n(r.custo_mao_obra) + n(r.custo_frete)
  const kpi = useMemo(() => ({
    qtd: lista.length,
    abertas: lista.filter((r) => !['Concluída', 'Cancelada'].includes(r.status)).length,
    custo: lista.reduce((s, r) => s + custoTot(r), 0),
    custoLoja: lista.filter((r) => r.responsabilidade_custo === 'Loja').reduce((s, r) => s + custoTot(r), 0),
  }), [lista])

  return (
    <>
      <div className="section-head">
        <div className="tools" style={{ gap: 10 }}>
          <div className="search"><IcoSearch /><input className="input" placeholder="Buscar cliente / nº / projeto" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <select className="input" style={{ width: 160 }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="todas">Todos os status</option>{STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Nova AOT</button>
      </div>
      <div className="sub" style={{ margin: '-6px 0 14px' }}>AOT — Autorização/Ordem de Assistência Técnica. Registra a ocorrência, a classificação, o responsável pelo erro, a solução e os custos (material, mão de obra, frete), com a responsabilidade do custo.</div>
      {erro && !modal && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="label">Total de AOTs</div><div className="value">{kpi.qtd}</div></div>
        <div className="card kpi"><div className="label">Em aberto</div><div className="value">{kpi.abertas}</div></div>
        <div className="card kpi"><div className="label">Custo total</div><div className="value">{brl(kpi.custo)}</div></div>
        <div className="card kpi"><div className="label">Custo por conta da loja</div><div className="value" style={{ color: 'var(--danger)' }}>{brl(kpi.custoLoja)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nº / Cliente</th><th>Projeto</th><th>Classificação</th><th>Responsável</th><th className="num">Custo</th><th>Resp. custo</th><th>Prioridade</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="9" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="9" className="empty">Nenhuma AOT. Clique em “Nova AOT”.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td><b>{r.cliente_nome}</b><div className="faint" style={{ fontSize: 11 }}>{r.numero || 's/nº'} · {fmtDate(r.data_solicitacao)}</div></td>
                <td className="muted">{r.projeto_uid || '—'}</td>
                <td>{r.classificacao === 'Outros' ? (r.classificacao_outros || 'Outros') : (r.classificacao || '—')}</td>
                <td className="muted">{r.responsavel_erro || '—'}{r.responsavel_nome ? ` · ${r.responsavel_nome}` : ''}</td>
                <td className="num">{brl(custoTot(r))}</td>
                <td>{r.responsabilidade_custo || '—'}</td>
                <td style={{ color: corPrioridade(r.prioridade), fontWeight: r.prioridade === 'Urgente' ? 600 : 400 }}>{r.prioridade || '—'}</td>
                <td><span className={'badge ' + badgeStatus(r.status)}>{r.status || 'Aberta'}</span></td>
                <td className="right"><button className="icon-btn" onClick={() => abrirEdit(r)}><IcoEdit /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.editId ? 'Editar AOT' : 'Nova AOT'} onClose={() => setModal(null)}
          footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="row-3">
            <div className="field"><label>Nº da AOT</label><input className="input" value={modal.form.numero} onChange={(e) => setF('numero', e.target.value)} placeholder="opcional" /></div>
            <div className="field"><label>Data</label><input className="input" type="date" value={modal.form.data_solicitacao} onChange={(e) => setF('data_solicitacao', e.target.value)} /></div>
            <div className="field"><label>Nº do pedido</label><input className="input" value={modal.form.num_pedido} onChange={(e) => setF('num_pedido', e.target.value)} /></div>
          </div>
          <div className="row-2">
            <div className="field"><label>Cliente</label><input className="input" value={modal.form.cliente_nome} onChange={(e) => setF('cliente_nome', e.target.value)} /></div>
            <div className="field"><label>Contrato / projeto</label>
              <select className="input" value={modal.form.projeto_uid} onChange={(e) => setF('projeto_uid', e.target.value)}>
                <option value="">— sem vínculo —</option>
                {projetos.map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.projeto_uid} · {p.cliente_nome}</option>)}
              </select></div>
          </div>
          <div className="row-2">
            <div className="field"><label>Ambientes</label><input className="input" value={modal.form.ambientes} onChange={(e) => setF('ambientes', e.target.value)} /></div>
            <div className="field"><label>Endereço</label><input className="input" value={modal.form.endereco} onChange={(e) => setF('endereco', e.target.value)} /></div>
          </div>
          <div className="field"><label>Descrição da ocorrência</label><textarea className="input" value={modal.form.descricao_ocorrencia} onChange={(e) => setF('descricao_ocorrencia', e.target.value)} /></div>
          <div className="row-3">
            <div className="field"><label>Classificação</label><select className="input" value={modal.form.classificacao} onChange={(e) => setF('classificacao', e.target.value)}>{CLASSIF.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Responsável pelo erro</label><select className="input" value={modal.form.responsavel_erro} onChange={(e) => setF('responsavel_erro', e.target.value)}>{RESP_ERRO.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Nome do responsável</label><input className="input" value={modal.form.responsavel_nome} onChange={(e) => setF('responsavel_nome', e.target.value)} /></div>
          </div>
          {modal.form.classificacao === 'Outros' && <div className="field"><label>Classificação (outros)</label><input className="input" value={modal.form.classificacao_outros} onChange={(e) => setF('classificacao_outros', e.target.value)} /></div>}
          <div className="field"><label>Solução</label><textarea className="input" value={modal.form.solucao} onChange={(e) => setF('solucao', e.target.value)} /></div>
          <div className="row-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <div className="field"><label>Custo material</label><input className="input" type="number" step="0.01" value={modal.form.custo_material} onChange={(e) => setF('custo_material', e.target.value)} /></div>
            <div className="field"><label>Custo mão de obra</label><input className="input" type="number" step="0.01" value={modal.form.custo_mao_obra} onChange={(e) => setF('custo_mao_obra', e.target.value)} /></div>
            <div className="field"><label>Custo frete</label><input className="input" type="number" step="0.01" value={modal.form.custo_frete} onChange={(e) => setF('custo_frete', e.target.value)} /></div>
            <div className="field"><label>Responsabilidade do custo</label><select className="input" value={modal.form.responsabilidade_custo} onChange={(e) => setF('responsabilidade_custo', e.target.value)}>{RESP_CUSTO.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="row-3">
            <div className="field"><label>Prioridade</label><select className="input" value={modal.form.prioridade} onChange={(e) => setF('prioridade', e.target.value)}>{PRIORIDADES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Status</label><select className="input" value={modal.form.status} onChange={(e) => setF('status', e.target.value)}>{STATUS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Data de execução</label><input className="input" type="date" value={modal.form.executado_data || ''} onChange={(e) => setF('executado_data', e.target.value)} /></div>
          </div>
          <div className="row-3">
            <div className="field"><label>Executor</label><input className="input" value={modal.form.executor} onChange={(e) => setF('executor', e.target.value)} /></div>
            <div className="field"><label>Montador</label><input className="input" value={modal.form.montador} onChange={(e) => setF('montador', e.target.value)} /></div>
            <div className="field"><label>Liberado p/ pagamento</label>
              <select className="input" value={modal.form.liberado_pagamento ? 'sim' : 'nao'} onChange={(e) => setF('liberado_pagamento', e.target.value === 'sim')}><option value="nao">Não</option><option value="sim">Sim</option></select></div>
          </div>
        </Modal>
      )}
    </>
  )
}
