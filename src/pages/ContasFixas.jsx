import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, today } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const nomeMes = (ym) => { const [a, m] = ym.split('-'); return `${MESES_LONGO[Number(m) - 1]}/${a}` }
const CAT_LABEL = { fixos: 'Fixos', impostos: 'Impostos', salarios: 'Salários', pro_labore: 'Pró-labore', operacional: 'Operacional', marketing: 'Marketing', industria: 'Indústria', montagem: 'Montagem', frete: 'Frete', rafex: 'RAFEX', perfar: 'Perfar', vidracaria: 'Vidraçaria', metalon: 'Metalon', rudegon: 'Rudegon', assistencia: 'Assistência', outros: 'Outros' }
const labelCat = (c) => CAT_LABEL[c] || c || '—'

export default function ContasFixas() {
  const [rows, setRows] = useState(null)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [busca, setBusca] = useState('')
  const [catF, setCatF] = useState('todas')
  const [lancando, setLancando] = useState(false)

  const carregar = async () => {
    setErro('')
    const { data, error } = await supabase.from('pagamentos')
      .select('id, data, descricao, categoria, fornecedor, valor, dia_vencimento')
      .eq('recorrente', true).neq('categoria', 'salarios').limit(5000)
    if (error) setErro(error.message)
    // uma linha por descrição (a ocorrência mais recente)
    const porDesc = {}
    for (const p of (data || [])) {
      const k = (p.descricao || '(sem descrição)')
      if (!porDesc[k] || (p.data || '') > (porDesc[k].data || '')) porDesc[k] = p
    }
    const arr = Object.values(porDesc).sort((a, b) => (a.dia_vencimento || 99) - (b.dia_vencimento || 99))
    setRows(arr)
  }
  useEffect(() => { carregar() }, [])

  const renomear = async (idAntigo, descAntiga, descNova) => {
    const nova = (descNova || '').trim()
    if (!nova || nova === descAntiga) return
    setErro(''); setRows((s) => s.map((r) => r.descricao === descAntiga ? { ...r, descricao: nova } : r))
    const { error } = await supabase.from('pagamentos').update({ descricao: nova }).eq('descricao', descAntiga).eq('recorrente', true)
    if (error) setErro('Não consegui renomear: ' + error.message)
  }

  const lancarMes = async () => {
    setErro(''); setInfo('')
    const ym = today().slice(0, 7)
    if (!window.confirm(`Lançar agora as contas fixas e a folha de ${nomeMes(ym)}? O sistema já faz isso sozinho todo dia 1º; não duplica o que já estiver lançado.`)) return
    setLancando(true)
    const { data, error } = await supabase.rpc('gerar_fixos_mes', { p_mes: `${ym}-01` })
    setLancando(false)
    if (error) { setErro('Erro ao lançar: ' + error.message); return }
    const tot = (data?.contas || 0) + (data?.folha || 0)
    setInfo(tot ? `${data.contas} conta(s) fixa(s) e ${data.folha} pagamento(s) da folha de ${nomeMes(ym)} lançados como pendentes.` : `Tudo certo: as fixas e a folha de ${nomeMes(ym)} já estavam lançadas.`)
    carregar()
  }

  const removerFixa = async (descricao) => {
    if (!window.confirm(`Remover "${descricao}" da lista de contas fixas? O histórico de pagamentos continua; ela só deixa de ser fixa mensal.`)) return
    setErro(''); setRows((s) => s.filter((r) => r.descricao !== descricao))
    const { error } = await supabase.from('pagamentos').update({ recorrente: false }).eq('descricao', descricao).eq('recorrente', true)
    if (error) setErro('Não consegui remover: ' + error.message)
  }

  const cats = useMemo(() => [...new Set((rows || []).map((r) => r.categoria).filter(Boolean))].sort(), [rows])
  const lista = useMemo(() => (rows || []).filter((r) => {
    if (catF !== 'todas' && r.categoria !== catF) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.descricao || '').toLowerCase().includes(q) || (r.fornecedor || '').toLowerCase().includes(q))) return false }
    return true
  }), [rows, catF, busca])

  const total = lista.reduce((s, r) => s + n(r.valor), 0)

  return (
    <div className="card" style={{ maxWidth: 1020 }}>
      <div className="between">
        <div>
          <h3>Contas fixas mensais</h3>
          <div className="sub">O que a loja paga todo mês, por dia de vencimento. <b>Todo dia 1º o sistema lança sozinho</b> estas contas e a folha (salário + VT + VA dos CLT e ajuda de custo dos MEI, pelo cadastro de Funcionários) como pendentes. Use o × para tirar uma conta duplicada da lista (não apaga o histórico, só deixa de ser fixa).</div>
        </div>
        <button className="btn" onClick={lancarMes} disabled={lancando}>{lancando ? 'Lançando…' : 'Lançar agora (mês atual)'}</button>
      </div>
      {info && <div className="badge ok" style={{ display: 'inline-block', margin: '10px 0' }}>{info}</div>}

      <div className="grid cols-3" style={{ margin: '14px 0' }}>
        <div className="card kpi"><div className="label">Total fixo mensal</div><div className="value">{brl(total)}</div></div>
        <div className="card kpi"><div className="label">Contas fixas</div><div className="value">{lista.length}</div></div>
        <div className="card kpi"><div className="label">Média por conta</div><div className="value">{brl(lista.length ? total / lista.length : 0)}</div></div>
      </div>

      <div className="tools" style={{ gap: 10, marginBottom: 12 }}>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar conta / fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <select className="input" style={{ width: 170 }} value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="todas">Todas as categorias</option>{cats.map((c) => <option key={c} value={c}>{labelCat(c)}</option>)}
        </select>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th style={{ width: 70 }}>Dia</th><th>Conta</th><th>Categoria</th><th>Fornecedor</th><th className="num">Valor/mês</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="6" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="6" className="empty">Nenhuma conta fixa. Marque contas como recorrentes em Pagamentos.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td><span className="badge neutral">dia {r.dia_vencimento || '—'}</span></td>
                <td><input className="input" style={{ height: 30, padding: '2px 8px', fontWeight: 600, minWidth: 220 }} defaultValue={r.descricao || ''} onBlur={(e) => renomear(r.id, r.descricao, e.target.value)} /></td>
                <td>{labelCat(r.categoria)}</td>
                <td className="muted">{r.fornecedor || '—'}</td>
                <td className="num">{brl(r.valor)}</td>
                <td className="right"><button className="icon-btn" title="Remover da lista de fixas" onClick={() => removerFixa(r.descricao)} style={{ color: 'var(--danger)' }}>×</button></td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && <tfoot><tr><td colSpan="4"><b>TOTAL MENSAL</b></td><td className="num"><b>{brl(total)}</b></td><td></td></tr></tfoot>}
        </table>
      </div>
    </div>
  )
}
