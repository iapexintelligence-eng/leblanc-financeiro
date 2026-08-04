import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { IcoSearch, IcoTrash } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { extrairLinhas } from '../lib/pdfLer.js'
import { parseFaturaCartao, sugerirBucket } from '../lib/faturaCartao.js'

const n = (v) => Number(v) || 0
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => { if (!ym) return '—'; const p = String(ym).slice(0, 7).split('-'); return `${MESES_PT[Number(p[1]) - 1]}/${p[0].slice(2)}` }
const BUCKETS = ['loja', 'catelli', 'marketing', 'priscila', 'andressa', 'outros']
const bktLabel = (b) => ({ loja: 'Loja', catelli: 'Catelli', marketing: 'Marketing', priscila: 'Priscila', andressa: 'Andressa', outros: 'Outros' }[b] || b || '—')

export default function FaturasCartao() {
  const [rows, setRows] = useState(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [cartaoF, setCartaoF] = useState('todos')
  const [mesF, setMesF] = useState('')
  const [imp, setImp] = useState(null) // { cartao, mesRef, itens:[{...,incluir,bucket}] }
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [pendente, setPendente] = useState(null) // File aguardando senha
  const [senha, setSenha] = useState('')
  const fileRef = useRef(null)

  const carregar = async () => {
    const { data, error } = await supabase.from('vw_fatura_rateio').select('*').order('mes_ref', { ascending: false })
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [])

  const cartoes = useMemo(() => [...new Set((rows || []).map((r) => r.cartao).filter(Boolean))].sort(), [rows])
  const meses = useMemo(() => [...new Set((rows || []).map((r) => String(r.mes_ref || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [rows])
  useEffect(() => { if (rows && mesF === '' && meses.length) setMesF(meses[0]) }, [rows, meses]) // eslint-disable-line

  const lista = useMemo(() => (rows || []).filter((r) => {
    if (cartaoF !== 'todos' && r.cartao !== cartaoF) return false
    if (mesF && mesF !== 'todos' && String(r.mes_ref || '').slice(0, 7) !== mesF) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.descricao || '').toLowerCase().includes(q) || (r.bucket || '').toLowerCase().includes(q))) return false }
    return true
  }), [rows, cartaoF, mesF, busca])

  const total = lista.reduce((s, r) => s + n(r.valor), 0)
  const cobrado = lista.filter((r) => r.cobrado).reduce((s, r) => s + n(r.valor), 0)
  const aCobrar = Math.max(0, total - cobrado)
  // por bucket (do filtro)
  const porBucket = useMemo(() => {
    const m = {}
    for (const r of lista) { const b = r.bucket || 'outros'; (m[b] ||= { total: 0, aCobrar: 0 }); m[b].total += n(r.valor); if (!r.cobrado) m[b].aCobrar += n(r.valor) }
    return m
  }, [lista])

  const toggleCobrado = async (r) => {
    setErro('')
    const novo = !r.cobrado
    const { error } = await supabase.from('fatura_rateio').update({ cobrado: novo, cobrado_em: novo ? today() : null }).eq('id', r.id)
    if (error) { setErro(error.message); return }
    setRows((s) => s.map((x) => x.id === r.id ? { ...x, cobrado: novo, cobrado_em: novo ? today() : null } : x))
  }
  const mudarBucket = async (r, bucket) => {
    setErro('')
    setRows((s) => s.map((x) => x.id === r.id ? { ...x, bucket } : x))
    const { error } = await supabase.from('fatura_rateio').update({ bucket }).eq('id', r.id)
    if (error) setErro(error.message)
  }
  const excluir = async (r) => {
    if (!window.confirm('Remover este item da fatura?')) return
    setErro('')
    const { error } = await supabase.from('fatura_rateio').delete().eq('id', r.id)
    if (error) { setErro(error.message); return }
    setRows((s) => s.filter((x) => x.id !== r.id))
  }

  // ---- Importar PDF ----
  const lerFatura = async (file, pass) => {
    setErro(''); setLendo(true)
    try {
      const linhas = await extrairLinhas(file, pass || undefined)
      const r = parseFaturaCartao(linhas)
      if (!r.itens.length) {
        setErro('Não encontrei transações nesse PDF. Se for de um banco diferente, me avise que ajusto o leitor.')
        setLendo(false); return
      }
      const itens = r.itens.map((it) => ({
        ...it,
        incluir: !it.credito, // créditos/pagamentos vêm desmarcados
        bucket: it.credito ? 'outros' : sugerirBucket(it.descricao),
      }))
      setImp({ cartao: r.cartao || '', mesRef: r.mesRef || '', itens })
      setPendente(null); setSenha('')
    } catch (err) {
      const nome = err?.name || ''
      const cod = err?.code
      if (nome === 'PasswordException' || cod === 1 || cod === 2) {
        setPendente(file) // guarda o arquivo e pede a senha
        setErro(cod === 2 ? 'Senha incorreta. Tente de novo.' : '')
      } else {
        setErro('Não consegui ler o PDF: ' + (err?.message || err))
      }
    }
    setLendo(false)
  }
  const aoEscolherArquivo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSenha('')
    lerFatura(file, '')
  }

  const impInclusos = useMemo(() => (imp?.itens || []).filter((i) => i.incluir), [imp])
  const impTotal = impInclusos.reduce((s, i) => s + n(i.valor), 0)

  const salvarImport = async () => {
    if (!imp) return
    if (!imp.cartao.trim()) { setErro('Informe o nome do cartão.'); return }
    if (!/^\d{4}-\d{2}$/.test(imp.mesRef)) { setErro('Informe o mês de referência (AAAA-MM).'); return }
    if (!impInclusos.length) { setErro('Marque ao menos um item para importar.'); return }
    setSalvando(true); setErro('')
    const linhas = impInclusos.map((i) => ({
      cartao: imp.cartao.trim(), mes_ref: imp.mesRef, bucket: i.bucket || 'outros',
      descricao: i.descricao, data_compra: i.data_compra || null, parcela: i.parcela || null,
      valor: n(i.valor), cobrado: false,
    }))
    const { error } = await supabase.from('fatura_rateio').insert(linhas)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setImp(null); carregar()
  }

  const setItem = (idx, patch) => setImp((s) => ({ ...s, itens: s.itens.map((it, i) => i === idx ? { ...it, ...patch } : it) }))
  const marcarTodos = (v) => setImp((s) => ({ ...s, itens: s.itens.map((it) => ({ ...it, incluir: v })) }))

  return (
    <div className="card" style={{ maxWidth: 1040 }}>
      <div className="between">
        <div>
          <h3>Faturas de cartão — rateio</h3>
          <div className="sub">Suba o PDF da fatura: o sistema lê as compras e você marca de quem é cada uma (loja / Catelli). Depois marque o que já foi cobrado (repassado).</div>
        </div>
        <div className="tools">
          <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={aoEscolherArquivo} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={lendo}>{lendo ? 'Lendo PDF…' : '⬆ Subir fatura (PDF)'}</button>
        </div>
      </div>

      <div className="tools" style={{ gap: 10, margin: '14px 0' }}>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar descrição / bucket" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <select className="input" style={{ width: 200 }} value={cartaoF} onChange={(e) => setCartaoF(e.target.value)}>
          <option value="todos">Todos os cartões</option>{cartoes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={mesF} onChange={(e) => setMesF(e.target.value)}>
          <option value="todos">Todos os meses</option>{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
      </div>

      {erro && !imp && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        <div className="card kpi"><div className="label">Total no filtro</div><div className="value">{brl(total)}</div><div className="delta">{lista.length} item(ns)</div></div>
        <div className="card kpi"><div className="label">Já cobrado</div><div className="value" style={{ color: 'var(--ok)' }}>{brl(cobrado)}</div></div>
        <div className="card kpi"><div className="label">A cobrar</div><div className="value" style={{ color: aCobrar ? 'var(--warn)' : 'inherit' }}>{brl(aCobrar)}</div></div>
      </div>

      {Object.keys(porBucket).length > 0 && (
        <div className="tools" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {Object.entries(porBucket).sort().map(([b, v]) => (
            <div key={b} className="badge" style={{ padding: '6px 10px' }}>{bktLabel(b)}: <b>{brl(v.total)}</b>{v.aCobrar > 0 ? <span style={{ color: 'var(--warn)' }}> · falta {brl(v.aCobrar)}</span> : <span style={{ color: 'var(--ok)' }}> · ok</span>}</div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Cartão</th><th>Mês</th><th>Data</th><th style={{ minWidth: 130 }}>Bucket</th><th>Descrição</th><th className="num">Valor</th><th>Cobrado</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="8" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="8" className="empty">Sem itens de fatura neste filtro. Use “Subir fatura (PDF)” para importar.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td><b>{r.cartao || '—'}</b></td>
                <td className="muted">{rotuloMes(r.mes_ref)}</td>
                <td className="muted">{r.data_compra ? fmtDate(r.data_compra) : '—'}</td>
                <td>
                  <select className="input" style={{ padding: '6px 10px', minWidth: 128 }} value={BUCKETS.includes(r.bucket) ? r.bucket : 'outros'} onChange={(e) => mudarBucket(r, e.target.value)}>
                    {BUCKETS.map((b) => <option key={b} value={b}>{bktLabel(b)}</option>)}
                  </select>
                </td>
                <td className="muted">{r.descricao || '—'}{r.parcela ? <span className="faint" style={{ fontSize: 11 }}> · {r.parcela}</span> : null}</td>
                <td className="num">{brl(r.valor)}</td>
                <td>
                  {r.cobrado
                    ? <button className="badge ok" style={{ cursor: 'pointer', border: 'none' }} onClick={() => toggleCobrado(r)} title={r.cobrado_em ? 'em ' + fmtDate(r.cobrado_em) : ''}>Cobrado ✓</button>
                    : <button className="badge warn" style={{ cursor: 'pointer', border: 'none' }} onClick={() => toggleCobrado(r)}>Marcar cobrado</button>}
                </td>
                <td className="right"><button className="icon-btn" title="Remover item" onClick={() => excluir(r)}><IcoTrash /></button></td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && <tfoot><tr><td colSpan="5"><b>TOTAL</b></td><td className="num"><b>{brl(total)}</b></td><td colSpan="2"></td></tr></tfoot>}
        </table>
      </div>

      {pendente && !imp && (
        <Modal title="Fatura protegida por senha" onClose={() => { setPendente(null); setSenha('') }}
          footer={<><button className="btn ghost" onClick={() => { setPendente(null); setSenha('') }}>Cancelar</button><button className="btn" onClick={() => lerFatura(pendente, senha)} disabled={lendo || !senha}>{lendo ? 'Abrindo…' : 'Abrir fatura'}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <div className="sub" style={{ marginBottom: 12 }}>Este PDF do banco pede senha para abrir. Digite a senha da fatura (a mesma que o banco usa para abrir o arquivo).</div>
          <div className="field"><label>Senha da fatura</label>
            <input className="input" type="password" value={senha} autoFocus
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && senha) lerFatura(pendente, senha) }} />
          </div>
        </Modal>
      )}

      {imp && (
        <Modal title="Importar fatura do PDF" onClose={() => setImp(null)} wide
          footer={<><button className="btn ghost" onClick={() => setImp(null)}>Cancelar</button><button className="btn" onClick={salvarImport} disabled={salvando}>{salvando ? 'Importando…' : `Importar ${impInclusos.length} item(ns) · ${brl(impTotal)}`}</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
            <div className="field"><label>Cartão</label><input className="input" value={imp.cartao} onChange={(e) => setImp((s) => ({ ...s, cartao: e.target.value }))} placeholder="Ex.: Sicredi Visa final 9514" /></div>
            <div className="field"><label>Mês de referência (AAAA-MM)</label><input className="input" value={imp.mesRef} onChange={(e) => setImp((s) => ({ ...s, mesRef: e.target.value }))} placeholder="2026-08" /></div>
          </div>
          <div className="between" style={{ marginBottom: 8 }}>
            <div className="sub">{imp.itens.length} transações lidas. Marque quem é de cada uma e desmarque o que não quer importar.</div>
            <div className="tools" style={{ gap: 6 }}>
              <button className="btn sm ghost" onClick={() => marcarTodos(true)}>Marcar todos</button>
              <button className="btn sm ghost" onClick={() => marcarTodos(false)}>Desmarcar todos</button>
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 380, overflow: 'auto' }}>
            <table>
              <thead><tr><th style={{ width: 34 }}></th><th>Data</th><th>Descrição</th><th>Bucket</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {imp.itens.map((it, idx) => (
                  <tr key={idx} style={{ opacity: it.incluir ? 1 : 0.45 }}>
                    <td><input type="checkbox" checked={it.incluir} onChange={(e) => setItem(idx, { incluir: e.target.checked })} /></td>
                    <td className="muted">{it.data_compra ? fmtDate(it.data_compra) : '—'}</td>
                    <td>{it.descricao}{it.parcela ? <span className="faint" style={{ fontSize: 11 }}> · {it.parcela}</span> : null}{it.credito ? <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>crédito/pagto</span> : null}</td>
                    <td>
                      <select className="input" style={{ padding: '6px 10px', minWidth: 128 }} value={it.bucket} onChange={(e) => setItem(idx, { bucket: e.target.value })}>
                        {BUCKETS.map((b) => <option key={b} value={b}>{bktLabel(b)}</option>)}
                      </select>
                    </td>
                    <td className="num" style={{ color: it.valor < 0 ? 'var(--danger)' : 'inherit' }}>{brl(it.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
