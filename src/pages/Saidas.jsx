import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'

const n = (v) => Number(v) || 0
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => { const [a, m] = ym.split('-'); return `${MESES_PT[Number(m) - 1]}/${a.slice(2)}` }
const CAT_LABEL = { fixos: 'Fixos', impostos: 'Impostos', salarios: 'Salários', pro_labore: 'Pró-labore', operacional: 'Operacional', marketing: 'Marketing', industria: 'Indústria', montagem: 'Montagem', frete: 'Frete', rafex: 'RAFEX', perfar: 'Perfar', vidracaria: 'Vidraçaria', metalon: 'Metalon', rudegon: 'Rudegon', assistencia: 'Assistência', outros: 'Outros' }
const labelCat = (c) => CAT_LABEL[c] || c || '—'
const CATS = ['industria', 'montagem', 'frete', 'rafex', 'perfar', 'vidracaria', 'metalon', 'rudegon', 'assistencia', 'operacional', 'fixos', 'salarios', 'pro_labore', 'marketing', 'impostos', 'outros']
const normForn = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const CUSTO_CATS = ['industria', 'montagem', 'frete', 'assistencia', 'compra_extra', 'gratificacao']
const CUSTO_LABEL = { industria: 'Indústria', montagem: 'Montagem', frete: 'Frete', assistencia: 'Assistência', compra_extra: 'Compra extra', gratificacao: 'Gratificação' }

export default function Saidas() {
  const [rows, setRows] = useState(null)
  const [custos, setCustos] = useState([])
  const [projetos, setProjetos] = useState([])
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [mesF, setMesF] = useState('todos')
  const [catF, setCatF] = useState('todas')
  const [fornF, setFornF] = useState('todos')
  const [aberto, setAberto] = useState(null)
  const [rat, setRatModal] = useState(null) // { r, linhas:[{projeto_uid, valor}] }
  const mapCustoCat = (c) => CUSTO_CATS.includes(c) ? c : 'compra_extra'

  const abrirRateio = async (r) => {
    const { data } = await supabase.from('custos_operacionais').select('projeto_uid, valor').eq('rateio_pagamento_id', r.id)
    const linhas = (data || []).map((c) => ({ projeto_uid: c.projeto_uid || '', valor: c.valor ?? '' }))
    setRatModal({ r, linhas: linhas.length ? linhas : [{ projeto_uid: '', valor: '' }] })
  }
  const salvarRateio = async () => {
    const { r, linhas } = rat
    await supabase.from('custos_operacionais').delete().eq('rateio_pagamento_id', r.id)
    const novos = linhas.filter((x) => x.projeto_uid && Number(x.valor) > 0).map((x) => ({
      data: r.data, categoria: mapCustoCat(r.categoria), fornecedor: r.fornecedor && r.fornecedor !== '—' ? r.fornecedor : null,
      descricao: r.descricao || null, valor: Number(x.valor), projeto_uid: x.projeto_uid, rateio_pagamento_id: r.id, status: r.status,
    }))
    if (novos.length) { const { error } = await supabase.from('custos_operacionais').insert(novos); if (error) { setErro(error.message); return } }
    // recarrega custos p/ o drill-down refletir
    const { data } = await supabase.from('custos_operacionais').select('id, data, categoria, fornecedor, descricao, valor, projeto_uid').limit(5000)
    setCustos(data || [])
    setRatModal(null)
  }

  useEffect(() => {
    (async () => {
      const [pag, cus, prj] = await Promise.all([
        supabase.from('pagamentos').select('id, data, data_vencimento, categoria, fornecedor, descricao, valor, status, forma_pagamento, projeto_uid').order('data', { ascending: false }).limit(5000),
        supabase.from('custos_operacionais').select('id, data, categoria, fornecedor, descricao, valor, projeto_uid').limit(5000),
        supabase.from('projetos').select('projeto_uid, cliente_nome').order('created_at', { ascending: false }).limit(2000),
      ])
      if (pag.error) setErro(pag.error.message)
      const norm = (pag.data || []).map((p) => ({
        id: p.id, data: p.data || p.data_vencimento, categoria: p.categoria || 'outros',
        fornecedor: p.fornecedor || '—', descricao: p.descricao || '', projeto_uid: p.projeto_uid || '',
        valor: n(p.valor), status: p.status || '—',
      }))
      norm.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      setRows(norm); setCustos(cus.data || []); setProjetos(prj.data || [])
    })()
  }, [])

  const custosByForn = useMemo(() => {
    const m = {}
    for (const c of custos) { const k = normForn(c.fornecedor); (m[k] = m[k] || []).push(c) }
    // marca possíveis duplicados (mesma data + descrição + valor) para destacar
    for (const k of Object.keys(m)) {
      const vistos = {}
      m[k] = m[k].map((c) => {
        const chave = `${c.data}|${c.descricao || ''}|${n(c.valor)}`
        const dup = !!vistos[chave]; vistos[chave] = true
        return { ...c, _dup: dup }
      })
    }
    return m
  }, [custos])
  const clienteDe = useMemo(() => Object.fromEntries(projetos.map((p) => [p.projeto_uid, p.cliente_nome])), [projetos])

  const meses = useMemo(() => [...new Set((rows || []).map((r) => (r.data || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [rows])
  const cats = useMemo(() => [...new Set((rows || []).map((r) => r.categoria).filter(Boolean))].sort(), [rows])
  const fornecedores = useMemo(() => [...new Set((rows || []).map((r) => r.fornecedor).filter((x) => x && x !== '—'))].sort(), [rows])

  const lista = useMemo(() => (rows || []).filter((r) => {
    if (mesF !== 'todos' && (r.data || '').slice(0, 7) !== mesF) return false
    if (catF !== 'todas' && r.categoria !== catF) return false
    if (fornF !== 'todos' && r.fornecedor !== fornF) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.fornecedor || '').toLowerCase().includes(q) || labelCat(r.categoria).toLowerCase().includes(q) || (r.descricao || '').toLowerCase().includes(q))) return false }
    return true
  }), [rows, mesF, catF, fornF, busca])

  const mudarCategoria = async (id, categoria) => {
    setErro(''); setRows((s) => s.map((x) => x.id === id ? { ...x, categoria } : x))
    const { error } = await supabase.from('pagamentos').update({ categoria }).eq('id', id)
    if (error) setErro('Não consegui salvar a categoria: ' + error.message)
  }
  const salvarDescricao = async (id, descricao) => {
    setErro(''); setRows((s) => s.map((x) => x.id === id ? { ...x, descricao } : x))
    const { error } = await supabase.from('pagamentos').update({ descricao }).eq('id', id)
    if (error) setErro('Não consegui salvar a descrição: ' + error.message)
  }
  const mudarContrato = async (id, projeto_uid) => {
    setErro(''); setRows((s) => s.map((x) => x.id === id ? { ...x, projeto_uid } : x))
    const { error } = await supabase.from('pagamentos').update({ projeto_uid: projeto_uid || null }).eq('id', id)
    if (error) setErro('Não consegui salvar o contrato: ' + error.message)
  }
  const mudarCatCusto = async (id, categoria) => {
    setErro(''); setCustos((s) => s.map((x) => x.id === id ? { ...x, categoria } : x))
    const { error } = await supabase.from('custos_operacionais').update({ categoria }).eq('id', id)
    if (error) setErro('Não consegui salvar a categoria do pedido: ' + error.message)
  }
  const mudarProjetoCusto = async (id, projeto_uid) => {
    setErro(''); setCustos((s) => s.map((x) => x.id === id ? { ...x, projeto_uid } : x))
    const { error } = await supabase.from('custos_operacionais').update({ projeto_uid: projeto_uid || null }).eq('id', id)
    if (error) setErro('Não consegui trocar o contrato do pedido: ' + error.message)
  }
  const excluirCusto = async (id) => {
    if (!window.confirm('Excluir este pedido/custo? Essa ação não pode ser desfeita.')) return
    setErro(''); setCustos((s) => s.filter((x) => x.id !== id))
    const { error } = await supabase.from('custos_operacionais').delete().eq('id', id)
    if (error) setErro('Não consegui excluir: ' + error.message)
  }
  const excluirPagamento = async (r) => {
    if (!window.confirm(`Excluir esta saída?\n\n${r.fornecedor || r.descricao || ''} — ${brl(r.valor)}\n\nEssa ação não pode ser desfeita.`)) return
    setErro('')
    // remove também eventuais custos rateados vinculados a este pagamento
    await supabase.from('custos_operacionais').delete().eq('rateio_pagamento_id', r.id)
    const { error } = await supabase.from('pagamentos').delete().eq('id', r.id)
    if (error) { setErro('Não consegui excluir: ' + error.message); return }
    setRows((s) => s.filter((x) => x.id !== r.id))
  }

  const total = lista.reduce((s, r) => s + r.valor, 0)
  const pago = lista.filter((r) => r.status === 'Pago').reduce((s, r) => s + r.valor, 0)
  const pendente = Math.max(0, total - pago)

  const exportarCSV = () => {
    const head = ['Data', 'Categoria', 'Fornecedor', 'Descrição', 'Contrato', 'Valor', 'Status']
    const body = lista.map((r) => [fmtDate(r.data), labelCat(r.categoria), r.fornecedor, r.descricao, r.projeto_uid, r.valor.toFixed(2).replace('.', ','), r.status])
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `saidas_${mesF}.csv`; a.click()
  }

  return (
    <div className="card" style={{ maxWidth: 1200 }}>
      <div className="between">
        <div>
          <h3>Saídas</h3>
          <div className="sub">Pagamentos realizados. Edite a categoria, a descrição e o contrato na própria linha. Clique em ▸ para ver os pedidos daquele fornecedor.</div>
        </div>
        <div className="tools"><button className="btn ghost" onClick={exportarCSV} disabled={!lista.length}>Exportar CSV</button></div>
      </div>

      <div className="tools" style={{ gap: 10, margin: '14px 0', flexWrap: 'wrap' }}>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar fornecedor / categoria" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <select className="input" style={{ width: 140 }} value={mesF} onChange={(e) => setMesF(e.target.value)}>
          <option value="todos">Todos os meses</option>{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="todas">Todas as categorias</option>{cats.map((c) => <option key={c} value={c}>{labelCat(c)}</option>)}
        </select>
        <select className="input" style={{ width: 170 }} value={fornF} onChange={(e) => setFornF(e.target.value)}>
          <option value="todos">Todas as indústrias/fornec.</option>{fornecedores.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Total de saídas</div><div className="value">{brl(total)}</div><div className="delta">{lista.length} lançamento(s)</div></div>
        <div className="card kpi"><div className="label">Pago</div><div className="value" style={{ color: 'var(--danger)' }}>{brl(pago)}</div></div>
        <div className="card kpi"><div className="label">Pendente</div><div className="value" style={{ color: pendente ? 'var(--warn)' : 'inherit' }}>{brl(pendente)}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th style={{ width: 22 }}></th><th>Data</th><th>Categoria</th><th>Fornecedor</th><th>Descrição (o que é)</th><th>Contrato</th><th className="num">Valor</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="8" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="8" className="empty">Nenhuma saída neste filtro.</td></tr>}
            {lista.map((r) => {
              const pedidos = custosByForn[normForn(r.fornecedor)] || []
              const exp = aberto === r.id
              return (
                <>
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center', color: 'var(--ink-faint)', cursor: pedidos.length ? 'pointer' : 'default' }} onClick={() => pedidos.length && setAberto(exp ? null : r.id)}>{pedidos.length ? (exp ? '▾' : '▸') : ''}</td>
                    <td className="muted">{fmtDate(r.data)}</td>
                    <td><select className="input" style={{ height: 30, padding: '2px 6px', fontSize: 12.5, minWidth: 120 }} value={r.categoria} onChange={(e) => mudarCategoria(r.id, e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{labelCat(c)}</option>)}</select></td>
                    <td>{r.fornecedor}</td>
                    <td><input className="input" style={{ height: 30, padding: '2px 8px', fontSize: 12.5, minWidth: 180 }} defaultValue={r.descricao} placeholder="descreva…" onBlur={(e) => { if (e.target.value !== r.descricao) salvarDescricao(r.id, e.target.value) }} /></td>
                    <td>
                      <select className="input" style={{ height: 30, padding: '2px 6px', fontSize: 12, minWidth: 150 }} value={r.projeto_uid} onChange={(e) => mudarContrato(r.id, e.target.value)}>
                        <option value="">— sem contrato —</option>
                        {[...projetos].sort((a, b) => (a.cliente_nome || '').localeCompare(b.cliente_nome || '')).map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.cliente_nome || p.projeto_uid}</option>)}
                      </select>
                      <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => abrirRateio(r)}>Ratear</button>
                    </td>
                    <td className="num">{brl(r.valor)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.status === 'Pago' ? <span className="badge ok">Pago</span> : <span className="badge warn">{r.status}</span>}
                      <button className="icon-btn" title="Excluir esta saída (duplicada)" onClick={() => excluirPagamento(r)} style={{ color: 'var(--danger)', marginLeft: 6 }}>×</button>
                    </td>
                  </tr>
                  {exp && (
                    <tr key={r.id + '-d'}>
                      <td></td>
                      <td colSpan="7" style={{ background: 'var(--surface)' }}>
                        <div className="sub" style={{ margin: '4px 0 6px' }}>Pedidos/itens de <b>{r.fornecedor}</b> (custos por projeto):</div>
                        <table style={{ marginBottom: 8 }}>
                          <thead><tr><th>Data</th><th>Categoria</th><th>Projeto / cliente</th><th>Descrição</th><th className="num">Valor</th><th></th></tr></thead>
                          <tbody>
                            {pedidos.map((c, i) => (
                              <tr key={i} style={c._dup ? { background: 'rgba(220,53,69,0.08)' } : undefined}>
                                <td className="muted">{fmtDate(c.data)}{c._dup && <span className="badge warn" style={{ marginLeft: 6 }}>duplicado?</span>}</td>
                                <td><select className="input" style={{ height: 28, padding: '2px 6px', fontSize: 12, minWidth: 120 }} value={c.categoria || ''} onChange={(e) => mudarCatCusto(c.id, e.target.value)}>{CUSTO_CATS.map((x) => <option key={x} value={x}>{CUSTO_LABEL[x]}</option>)}</select></td>
                                <td><select className="input" style={{ height: 28, padding: '2px 6px', fontSize: 12, minWidth: 160 }} value={c.projeto_uid || ''} onChange={(e) => mudarProjetoCusto(c.id, e.target.value)}><option value="">— vincular contrato —</option>{[...projetos].sort((a, b) => (a.cliente_nome || '').localeCompare(b.cliente_nome || '')).map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.cliente_nome || p.projeto_uid}</option>)}</select></td>
                                <td className="muted">{c.descricao || '—'}</td>
                                <td className="num">{brl(c.valor)}</td>
                                <td className="right"><button className="icon-btn" title="Excluir (duplicado)" onClick={() => excluirCusto(c.id)} style={{ color: 'var(--danger)' }}>×</button></td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot><tr><td colSpan="4"><b>Total dos pedidos</b></td><td className="num"><b>{brl(pedidos.reduce((s, c) => s + n(c.valor), 0))}</b></td><td></td></tr></tfoot>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
          {lista.length > 0 && <tfoot><tr><td colSpan="6"><b>TOTAL</b></td><td className="num"><b>{brl(total)}</b></td><td></td></tr></tfoot>}
        </table>
      </div>

      {rat && (
        <Modal title="Ratear pagamento entre contratos" onClose={() => setRatModal(null)}
          footer={<><button className="btn ghost" onClick={() => setRatModal(null)}>Cancelar</button><button className="btn" onClick={salvarRateio}>Salvar rateio</button></>}>
          <div className="sub" style={{ marginBottom: 10 }}>{rat.r.fornecedor} · {rat.r.descricao || '—'} · total <b>{brl(rat.r.valor)}</b>. Divida por contrato; cada parte vira custo do projeto.</div>
          {rat.linhas.map((x, i) => (
            <div className="row-2" key={i} style={{ marginBottom: 6, alignItems: 'end' }}>
              <div className="field" style={{ margin: 0 }}>
                <select className="input" value={x.projeto_uid} onChange={(e) => setRatModal((m) => ({ ...m, linhas: m.linhas.map((l, j) => j === i ? { ...l, projeto_uid: e.target.value } : l) }))}>
                  <option value="">— escolha o contrato —</option>
                  {[...projetos].sort((a, b) => (a.cliente_nome || '').localeCompare(b.cliente_nome || '')).map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.cliente_nome || p.projeto_uid}</option>)}
                </select>
              </div>
              <div className="flex" style={{ gap: 6 }}>
                <input className="input" type="number" step="0.01" placeholder="valor" value={x.valor} onChange={(e) => setRatModal((m) => ({ ...m, linhas: m.linhas.map((l, j) => j === i ? { ...l, valor: e.target.value } : l) }))} />
                <button className="icon-btn" type="button" onClick={() => setRatModal((m) => ({ ...m, linhas: m.linhas.filter((_, j) => j !== i) }))}>×</button>
              </div>
            </div>
          ))}
          <button className="btn ghost sm" type="button" onClick={() => setRatModal((m) => ({ ...m, linhas: [...m.linhas, { projeto_uid: '', valor: '' }] }))}>+ Adicionar contrato</button>
          {(() => { const soma = rat.linhas.reduce((s, x) => s + (Number(x.valor) || 0), 0); const dif = n(rat.r.valor) - soma; return <div className="between" style={{ marginTop: 10, fontSize: 13 }}><span className="muted">Somado: <b>{brl(soma)}</b></span><span style={{ color: Math.abs(dif) > 0.5 ? 'var(--warn)' : 'var(--ok)' }}>{Math.abs(dif) > 0.5 ? `faltam ${brl(dif)}` : 'bate com o total ✓'}</span></div> })()}
        </Modal>
      )}
    </div>
  )
}
