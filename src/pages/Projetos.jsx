import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const corMargem = (status, pct) => {
  const s = (status || '').toLowerCase()
  if (s.includes('neg') || pct < 0) return 'var(--danger)'
  if (s.includes('aten') || s.includes('baix') || pct < 30) return 'var(--warn)'
  return 'var(--ok)'
}

export default function Projetos() {
  const [projs, setProjs] = useState([])
  const [custos, setCustos] = useState([])
  const [extra, setExtra] = useState({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [aberto, setAberto] = useState(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [m, c, p] = await Promise.all([
        supabase.from('vw_margem_projetos').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('custos_operacionais').select('projeto_uid, data, categoria, fornecedor, descricao, valor, montador').not('projeto_uid', 'is', null).limit(5000),
        supabase.from('projetos').select('projeto_uid, custo_extra').limit(2000),
      ])
      if (m.error) setErro('Erro ao carregar projetos: ' + m.error.message)
      setProjs(m.data || [])
      setCustos(c.data || [])
      const ex = {}; (p.data || []).forEach((r) => { ex[r.projeto_uid] = n(r.custo_extra) })
      setExtra(ex)
      setLoading(false)
    })()
  }, [])

  const custosPorProj = useMemo(() => {
    const map = {}
    for (const c of custos) { (map[c.projeto_uid] = map[c.projeto_uid] || []).push(c) }
    return map
  }, [custos])

  const linhas = useMemo(() => projs.map((p) => {
    const custoTotal = n(p.custo_industria) + n(p.custo_montagem) + n(p.custo_assistencias) + n(p.custo_gratificacao) + n(extra[p.projeto_uid])
    const pct = n(p.margem_real_percentual)
    return { ...p, custoTotal, pct }
  }), [projs, extra])

  const statusList = useMemo(() => [...new Set(projs.map((p) => p.status_margem).filter(Boolean))], [projs])

  const filtradas = useMemo(() => linhas.filter((p) => {
    if (filtro !== 'todas' && p.status_margem !== filtro) return false
    if (busca && !((p.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (p.projeto_uid || '').toLowerCase().includes(busca.toLowerCase()) || (p.vendedor || '').toLowerCase().includes(busca.toLowerCase()))) return false
    return true
  }), [linhas, filtro, busca])

  const kpi = useMemo(() => {
    const vend = filtradas.reduce((s, p) => s + n(p.valor_vendido), 0)
    const cst = filtradas.reduce((s, p) => s + p.custoTotal, 0)
    return { qtd: filtradas.length, vend, cst, margem: vend ? (100 * (vend - cst) / vend) : 0 }
  }, [filtradas])

  return (
    <div className="card" style={{ maxWidth: 1100 }}>
      <div className="between">
        <div>
          <h3>Projetos — margem e custos por contrato</h3>
          <div className="sub">Cada contrato com o que foi vendido, os custos vinculados (indústria, montagem, frete, assistências, gratificação, extras) e a margem real. Clique numa linha para ver os custos lançados.</div>
        </div>
      </div>

      <div className="grid cols-4" style={{ margin: '14px 0' }}>
        <div className="card kpi"><div className="label">Projetos</div><div className="value">{kpi.qtd}</div></div>
        <div className="card kpi"><div className="label">Total vendido</div><div className="value">{brl(kpi.vend)}</div></div>
        <div className="card kpi"><div className="label">Custo total</div><div className="value">{brl(kpi.cst)}</div></div>
        <div className="card kpi"><div className="label">Margem média</div><div className="value" style={{ color: corMargem('', kpi.margem) }}>{kpi.margem.toFixed(1)}%</div></div>
      </div>

      <div className="tools" style={{ marginBottom: 12, gap: 10 }}>
        <div className="field" style={{ margin: 0, flex: 1, position: 'relative' }}>
          <input className="input" placeholder="Buscar cliente, vendedor ou nº do projeto" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ paddingLeft: 34 }} />
          <span style={{ position: 'absolute', left: 10, top: 9, opacity: .5 }}><IcoSearch /></span>
        </div>
        <select className="input" style={{ width: 190 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todas as margens</option>
          {statusList.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th>Projeto / Cliente</th><th>Vendedor</th><th className="num">Vendido</th><th className="num">Custo total</th><th className="num">Margem</th></tr></thead>
          <tbody>
            {filtradas.map((p) => {
              const cor = corMargem(p.status_margem, p.pct)
              const exp = aberto === p.projeto_uid
              const lista = custosPorProj[p.projeto_uid] || []
              return (
                <>
                  <tr key={p.projeto_uid} style={{ cursor: 'pointer' }} onClick={() => setAberto(exp ? null : p.projeto_uid)}>
                    <td style={{ width: 24, textAlign: 'center', color: 'var(--ink-faint)' }}>{exp ? '▾' : '▸'}</td>
                    <td><b>{p.cliente_nome}</b><div className="faint" style={{ fontSize: 11 }}>{p.projeto_uid} · {p.status_projeto}</div></td>
                    <td className="muted">{p.vendedor || '—'}</td>
                    <td className="num">{brl(p.valor_vendido)}</td>
                    <td className="num">{brl(p.custoTotal)}</td>
                    <td className="num"><span style={{ color: cor, fontWeight: 600 }}>{p.pct.toFixed(1)}%</span></td>
                  </tr>
                  {exp && (
                    <tr key={p.projeto_uid + '-d'}>
                      <td></td>
                      <td colSpan={5} style={{ background: 'var(--surface)' }}>
                        <div className="grid cols-3" style={{ gap: 8, margin: '4px 0 12px' }}>
                          <Comp l="Indústria" v={p.custo_industria} />
                          <Comp l="Montagem" v={p.custo_montagem} />
                          <Comp l="Assistências" v={p.custo_assistencias} />
                          <Comp l="Gratificação" v={p.custo_gratificacao} />
                          <Comp l="Extras" v={extra[p.projeto_uid]} />
                          <Comp l="Custo total" v={p.custoTotal} forte />
                        </div>
                        <div className="sub" style={{ marginBottom: 6 }}>Custos lançados vinculados a este contrato ({lista.length})</div>
                        {lista.length === 0 ? <div className="faint" style={{ fontSize: 12, paddingBottom: 8 }}>Nenhum custo lançado com este projeto. Vincule no menu Custos Operacionais.</div> : (
                          <table style={{ marginBottom: 8 }}>
                            <thead><tr><th>Data</th><th>Categoria</th><th>Fornecedor / descrição</th><th>Montador</th><th className="num">Valor</th></tr></thead>
                            <tbody>
                              {lista.map((c, i) => (
                                <tr key={i}><td className="muted">{c.data}</td><td>{c.categoria || '—'}</td><td>{c.fornecedor || c.descricao || '—'}</td><td className="muted">{c.montador || '—'}</td><td className="num">{brl(c.valor)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {!loading && filtradas.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>Nenhum projeto encontrado.</td></tr>}
            {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>Carregando…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Comp({ l, v, forte }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: forte ? 'var(--surface-2, var(--line))' : 'transparent' }}>
      <div className="faint" style={{ fontSize: 11 }}>{l}</div>
      <div className="mono" style={{ fontWeight: forte ? 700 : 500 }}>{brl(v)}</div>
    </div>
  )
}
