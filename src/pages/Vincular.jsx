import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import { IcoSearch } from '../components/Icons.jsx'

const n = (v) => Number(v) || 0
const CAT_LABEL = { fixos: 'Fixos', impostos: 'Impostos', salarios: 'Salários', pro_labore: 'Pró-labore', operacional: 'Operacional', marketing: 'Marketing', industria: 'Indústria', montagem: 'Montagem', frete: 'Frete', rafex: 'RAFEX', perfar: 'Perfar', vidracaria: 'Vidraçaria', metalon: 'Metalon', rudegon: 'Rudegon', assistencia: 'Assistência', compra_extra: 'Compra extra', gratificacao: 'Gratificação', outros: 'Outros' }
const labelCat = (c) => CAT_LABEL[c] || c || '—'

export default function Vincular() {
  const [fonte, setFonte] = useState('custos') // custos | pagamentos
  const [rows, setRows] = useState(null)
  const [projetos, setProjetos] = useState([])
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [soSem, setSoSem] = useState(true)

  const tabela = fonte === 'custos' ? 'custos_operacionais' : 'pagamentos'

  const carregar = async () => {
    setRows(null); setErro('')
    const cols = fonte === 'custos' ? 'id, data, categoria, fornecedor, descricao, valor, projeto_uid' : 'id, data, categoria, fornecedor, descricao, valor, projeto_uid'
    const { data, error } = await supabase.from(tabela).select(cols).order('data', { ascending: false }).limit(5000)
    if (error) setErro(error.message)
    setRows(data || [])
  }
  useEffect(() => { carregar() }, [fonte]) // eslint-disable-line
  useEffect(() => { (async () => {
    const { data } = await supabase.from('projetos').select('projeto_uid, cliente_nome').order('created_at', { ascending: false }).limit(2000)
    setProjetos(data || [])
  })() }, [])

  const vincular = async (id, projeto_uid) => {
    setErro(''); setRows((s) => s.map((x) => x.id === id ? { ...x, projeto_uid } : x))
    const { error } = await supabase.from(tabela).update({ projeto_uid: projeto_uid || null }).eq('id', id)
    if (error) setErro('Não consegui vincular: ' + error.message)
  }

  const lista = useMemo(() => (rows || []).filter((r) => {
    if (soSem && r.projeto_uid) return false
    if (busca) { const q = busca.toLowerCase(); if (!((r.fornecedor || '').toLowerCase().includes(q) || (r.descricao || '').toLowerCase().includes(q) || labelCat(r.categoria).toLowerCase().includes(q))) return false }
    return true
  }), [rows, soSem, busca])

  const semContrato = (rows || []).filter((r) => !r.projeto_uid)
  const valorSem = semContrato.reduce((s, r) => s + n(r.valor), 0)

  return (
    <div className="card" style={{ maxWidth: 1080 }}>
      <div className="between">
        <div>
          <h3>Vincular gastos a contratos</h3>
          <div className="sub">Atribua cada gasto ao contrato/projeto certo. Assim entra na margem e nos custos por contrato. Comece pelos que estão sem vínculo.</div>
        </div>
      </div>

      <div className="tools" style={{ gap: 10, margin: '14px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="seg" style={{ display: 'flex', gap: 4, border: '1px solid var(--line)', borderRadius: 8, padding: 3 }}>
          <button className={'btn sm ' + (fonte === 'custos' ? '' : 'ghost')} onClick={() => setFonte('custos')}>Custos operacionais</button>
          <button className={'btn sm ' + (fonte === 'pagamentos' ? '' : 'ghost')} onClick={() => setFonte('pagamentos')}>Pagamentos</button>
        </div>
        <div className="search"><IcoSearch /><input className="input" placeholder="Buscar fornecedor / descrição" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={soSem} onChange={(e) => setSoSem(e.target.checked)} /> Só sem contrato
        </label>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Sem contrato ({fonte === 'custos' ? 'custos' : 'pagamentos'})</div><div className="value">{semContrato.length}</div></div>
        <div className="card kpi"><div className="label">Valor sem vínculo</div><div className="value">{brl(valorSem)}</div></div>
        <div className="card kpi"><div className="label">Exibindo</div><div className="value">{lista.length}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Categoria</th><th>Fornecedor / descrição</th><th className="num">Valor</th><th style={{ minWidth: 240 }}>Contrato</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="5" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="5" className="empty">{soSem ? 'Tudo vinculado! Nada sem contrato aqui.' : 'Nenhum gasto neste filtro.'}</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td className="muted">{fmtDate(r.data)}</td>
                <td>{labelCat(r.categoria)}</td>
                <td>{r.fornecedor || r.descricao || '—'}{r.fornecedor && r.descricao ? <div className="faint" style={{ fontSize: 11 }}>{r.descricao}</div> : null}</td>
                <td className="num">{brl(r.valor)}</td>
                <td>
                  <select className="input" style={{ height: 32, minWidth: 240 }} value={r.projeto_uid || ''} onChange={(e) => vincular(r.id, e.target.value)}>
                    <option value="">— sem vínculo —</option>
                    {projetos.map((p) => <option key={p.projeto_uid} value={p.projeto_uid}>{p.projeto_uid} · {p.cliente_nome}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
